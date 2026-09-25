/**
 * Les documents qu'un client emporte depuis son espace : l'état de toutes ses commandes, et la
 * fiche d'une commande.
 *
 * Pourquoi : un client qui voulait dire à son associé, à son comptable ou à son magasinier où en
 * était sa marchandise faisait des captures d'écran de l'espace client, ou nous téléphonait. Un
 * papier daté, aux couleurs de la maison, se transmet et se range ; une capture d'écran, non.
 *
 * Ce que ces documents disent : uniquement ce que le serveur a déjà choisi de montrer au client
 * (src/lib/portail-client-donnees.ts). Jamais de prix d'achat, de fournisseur ni d'autre client.
 * Le seul montant est le prix convenu, et seulement une fois le devis confirmé.
 *
 * La mise en page suit la charte commune (src/lib/pdf-charte-lebtex.ts), comme la demande
 * d'import. jsPDF, autotable et la charte ne se chargent qu'au clic : l'espace client s'ouvre
 * sans eux, et rien ici ne touche au navigateur avant qu'on appelle une fonction.
 *
 * Les petites règles de lecture (unités dites en français, retard d'un conteneur, remarque d'une
 * commande) sont exportées : l'export Excel (export-espace-client.ts) dit la même chose avec les
 * mêmes mots.
 */

import type jsPDF from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import {
  ETAPES_CLIENT, etapeClient, rangEtape, titreEtape, phraseEtape, dateFr, nombreFr,
  type EtapeClient,
} from '@/lib/statut-client';

// ─── Mots communs au PDF et à l'Excel ───────────────────────────────────────────

/** Unités au singulier / au pluriel, comme on les dit à un client (mêmes mots que l'écran). */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'],
  'rolls': ['rouleau', 'rouleaux'],
  'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'],
  'bag': ['sac', 'sacs'],
  'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};

const PIECES = ['', 'u', 'unité', 'unités', 'pcs', 'pc', 'pièce', 'pièces', 'piece', 'pieces'];

/** L'unité dite en français, accordée à la quantité : « mètre », « rouleaux », « pièces ». */
export function uniteDite(unite?: string | null, quantite = 2): string {
  const u = (unite || '').trim();
  const dites = UNITES_DITES[u] || UNITES_DITES[u.toLowerCase()]
    || (PIECES.includes(u.toLowerCase()) ? ['pièce', 'pièces'] : [u.toLowerCase(), u.toLowerCase()]);
  return Math.abs(Number(quantite) || 0) > 1 ? dites[1] : dites[0];
}

/** Quantité lisible, accordée : « 1 000 mètres », « 1 rouleau », « 12 pièces ». */
export function quantiteDite(quantite: unknown, unite?: string | null): string {
  const n = Number(quantite) || 0;
  return texteImprimable(`${nombreFr(n)} ${uniteDite(unite, n)}`);
}

/** Aujourd'hui, au jour du navigateur (pas en UTC : à 23 h à Casablanca, c'est encore aujourd'hui). */
export function aujourdHuiLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function jourUtc(iso?: string | null): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** Nombre de jours de `debut` à `fin` (dates yyyy-mm-dd) ; rien si l'une manque. */
export function joursEntre(debut?: string | null, fin?: string | null): number | undefined {
  const a = jourUtc(debut);
  const b = jourUtc(fin);
  return a === undefined || b === undefined ? undefined : Math.round((b - a) / 86_400_000);
}

/** Le conteneur d'une commande, s'il est connu. */
export function conteneurDe(commande: CommandeClient, conteneurs?: Record<string, ConteneurClient> | null): ConteneurClient | undefined {
  return commande.conteneurId ? conteneurs?.[commande.conteneurId] : undefined;
}

/** Date d'arrivée au port (prévue tant que le navire n'est pas arrivé). */
export function arriveeDe(commande: CommandeClient, conteneur?: ConteneurClient): string | undefined {
  return commande.arriveeLe || conteneur?.arriveeLe;
}

/** Date d'entrée dans notre entrepôt. */
export function entrepotDe(commande: CommandeClient, conteneur?: ConteneurClient): string | undefined {
  return commande.entrepotLe || conteneur?.entrepotLe;
}

/**
 * Décalage de l'arrivée, en jours, par rapport à la première date annoncée par la compagnie
 * maritime (`arriveeInitiale`) : positif = retard, négatif = avance, rien = pas de décalage connu
 * (pas de première date, ou la même qu'aujourd'hui).
 */
export function ecartArrivee(conteneur?: ConteneurClient, arrivee?: string): number | undefined {
  const ecart = joursEntre(conteneur?.arriveeInitiale, arrivee ?? conteneur?.arriveeLe);
  return ecart ? ecart : undefined;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const jours = (n: number) => pluriel(n, 'jour', 'jours');

/** Un nombre de commandes, accordé : « 1 commande », « 3 commandes » (jamais « commande(s) »). */
export function nombreDeCommandes(n: number): string {
  return pluriel(n, 'commande', 'commandes');
}

/**
 * Ce qu'il faut savoir d'une commande en plus de son étape : un retard, une avance, le trajet
 * parcouru, ou ce que le client peut faire. Vide quand il n'y a rien à dire.
 * `court` : la version d'une colonne étroite de tableau (la date d'abord annoncée en moins).
 */
export function remarqueCommande(commande: CommandeClient, conteneur?: ConteneurClient, court = false): string {
  const etape = etapeClient(commande.statut);
  const ecart = ecartArrivee(conteneur, arriveeDe(commande, conteneur));
  switch (etape) {
    case 'mer': {
      if (ecart && ecart > 0) {
        return court
          ? `Arrivée repoussée de ${jours(ecart)}`
          : `Arrivée repoussée de ${jours(ecart)} (annoncée d'abord le ${dateFr(conteneur?.arriveeInitiale)})`;
      }
      if (ecart && ecart < 0) return `Arrivée avancée de ${jours(-ecart)}`;
      const avancement = conteneur?.suivi?.avancement;
      if (typeof avancement === 'number') return `Trajet parcouru : ${Math.round(avancement)} %`;
      // La marchandise est à bord : le conteneur existe, c'est sa fiche qui ne nous est pas
      // encore parvenue.
      if (!conteneur) return 'Détails du conteneur bientôt disponibles';
      return '';
    }
    case 'douane':
      if (ecart && ecart > 0) return court ? `Arrivée avec ${jours(ecart)} de retard` : `Arrivée avec ${jours(ecart)} de retard ; dédouanement en cours`;
      return 'Dédouanement en cours';
    case 'prete':
      return court ? 'À livrer ou à retirer' : 'À livrer ou à retirer sur simple demande';
    default:
      return '';
  }
}

/** Les caractéristiques fixes d'une commande, une par ligne : « Qualité : 70D », « Fermeture : … ». */
export function descriptifCommande(commande: CommandeClient): string[] {
  const lignes: string[] = [];
  if (commande.qualite && !commande.qualites?.length) lignes.push(`Qualité : ${commande.qualite}`);
  if (commande.couleur && !commande.couleurs?.length) lignes.push(`Couleur : ${commande.couleur}`);
  if (commande.taille && !commande.tailles?.length) lignes.push(`Taille : ${commande.taille}`);
  if (commande.fermeture) lignes.push(`Fermeture : ${commande.fermeture}`);
  if (commande.caracteristiques) lignes.push(commande.caracteristiques);
  return lignes;
}

/** Le résumé des ventilations : « 3 qualités · 12 couleurs · 4 tailles ». */
export function resumeVariantes(commande: CommandeClient): string {
  const morceaux: string[] = [];
  const compter = (n: number | undefined, un: string, plusieurs: string) => {
    if (n) morceaux.push(`${n} ${n > 1 ? plusieurs : un}`);
  };
  compter(commande.qualites?.length, 'qualité', 'qualités');
  compter(commande.couleurs?.length, 'couleur', 'couleurs');
  compter(commande.tailles?.length, 'taille', 'tailles');
  return morceaux.join(' · ');
}

/**
 * Les commandes rangées par étape, dans l'ordre du parcours. Dans une étape, la plus proche de
 * son arrivée d'abord ; les livrées, la plus récente d'abord.
 */
export function commandesParEtape(
  commandes: CommandeClient[],
  conteneurs?: Record<string, ConteneurClient> | null,
): { etape: (typeof ETAPES_CLIENT)[number]; commandes: CommandeClient[] }[] {
  const liste = (commandes || []).filter(Boolean);
  const cle = (c: CommandeClient) => {
    const k = conteneurDe(c, conteneurs);
    return etapeClient(c.statut) === 'livree'
      ? entrepotDe(c, k) || arriveeDe(c, k) || c.commandeeLe || ''
      : arriveeDe(c, k) || c.commandeeLe || '';
  };
  return ETAPES_CLIENT.map(etape => {
    const siennes = liste.filter(c => etapeClient(c.statut) === etape.id);
    siennes.sort((a, b) => {
      const ka = cle(a);
      const kb = cle(b);
      if (ka !== kb) {
        if (!ka) return 1;
        if (!kb) return -1;
        return etape.id === 'livree' ? kb.localeCompare(ka) : ka.localeCompare(kb);
      }
      return (a.nom || '').localeCompare(b.nom || '', 'fr', { numeric: true });
    });
    return { etape, commandes: siennes };
  });
}

/** Nom de fichier sans accent ni caractère qui fâche un explorateur Windows. */
export function nomFichierClient(prefixe: string, client: string, extension: string): string {
  return `${prefixe}-${motsDeFichier(client, 40) || 'client'}-${aujourdHuiLocal()}.${extension}`;
}

/** Les accents décomposés (U+0300 à U+036F), écrits par leur code pour rester lisibles ici. */
const DIACRITIQUES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Un texte réduit à des mots de fichier : « Atelier Éclair SARL » → « atelier-eclair-sarl ». */
function motsDeFichier(texte: string, max: number): string {
  return String(texte || '')
    .normalize('NFD').replace(DIACRITIQUES, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/, '');
}

// ─── Ce que les polices du PDF savent écrire ──────────────────────────────────

/** Les caractères au-delà de Latin-1 que la table WinAnsi des polices standard sait dessiner. */
const WINANSI_EN_PLUS = new Set([
  338, 339, 352, 353, 376, 381, 382, 402, 710, 732, 8211, 8212, 8216, 8217, 8218, 8220, 8221,
  8222, 8224, 8225, 8226, 8230, 8240, 8249, 8250, 8364, 8482,
]);

/** Espaces insécables, fines et de chiffres (U+00A0, U+2007, U+2009, U+202F), écrites par leur code. */
const ESPACES_SPECIALES = new RegExp(`[${[0xa0, 0x2007, 0x2009, 0x202f].map(code => String.fromCharCode(code)).join('')}]`, 'g');

/**
 * Un texte que les polices standard de jsPDF savent écrire. L'espace fine insécable que met
 * toLocaleString('fr-FR') entre les milliers s'imprimait en caractère parasite (« 1ÿ000 ») ; un
 * nom de produit avec un caractère chinois, pareil. On remplace les espaces, on retire le reste.
 */
export function texteImprimable(v: unknown): string {
  return Array.from(String(v ?? '').normalize('NFC').replace(ESPACES_SPECIALES, ' '))
    .filter(ch => {
      const code = ch.codePointAt(0) ?? 0;
      if (code === 10 || (code >= 32 && code < 127)) return true;
      if (code >= 160 && code <= 255) return true;
      return WINANSI_EN_PLUS.has(code);
    })
    .join('');
}

const nb = (n: unknown) => texteImprimable(nombreFr(n));

// ─── Outils chargés au clic ───────────────────────────────────────────────────

type Charte = typeof import('@/lib/pdf-charte-lebtex');
type AutoTable = typeof import('jspdf-autotable').default;
interface Outils { doc: jsPDF; c: Charte; autoTable: AutoTable }

async function outils(): Promise<Outils> {
  const [{ default: JsPDF }, { default: autoTable }, c] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/pdf-charte-lebtex'),
  ]);
  // compress : un fichier léger, qui passe par WhatsApp ou par e-mail.
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  return { doc, c, autoTable };
}

const largeurPage = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const finTableau = (doc: jsPDF, repli: number) => ((doc as any).lastAutoTable?.finalY as number | undefined) ?? repli;

/** Le téléphone du bandeau de pied de page, repris dans les phrases « appelez-nous ». */
const TELEPHONE = '+212 5 22 25 77 78';

/** Une ligne de texte découpée à la largeur, dans la police qu'on s'apprête à utiliser. */
function decouper(doc: jsPDF, texte: string, largeur: number, taille: number, style: 'normal' | 'bold' | 'italic', max = 99): string[] {
  doc.setFont('helvetica', style);
  doc.setFontSize(taille);
  const lignes = doc.splitTextToSize(texteImprimable(texte), largeur) as string[];
  if (lignes.length <= max) return lignes;
  const gardees = lignes.slice(0, max);
  gardees[max - 1] = (doc.splitTextToSize(`${gardees[max - 1]} …`, largeur) as string[])[0];
  return gardees;
}

/** Un encadré d'une phrase : fond clair, filet de couleur à gauche. Rend le Y suivant. */
function bandeau(
  o: Outils, y: number, texte: string,
  ton: 'or' | 'ambre' = 'or', style: 'normal' | 'bold' | 'italic' = 'italic',
): number {
  const { doc, c } = o;
  const largeur = largeurPage(doc) - 2 * c.MARGE;
  const lignes = decouper(doc, texte, largeur - 12, 8.5, style, 4);
  const hauteur = 6 + lignes.length * 4.2;
  y = c.reserver(doc, y, hauteur + 4);

  const fond: [number, number, number] = ton === 'ambre' ? [255, 251, 235] : c.GOLD_PALE;
  const filet = ton === 'ambre' ? c.AMBRE : c.GOLD;
  doc.setFillColor(...fond);
  doc.setDrawColor(...(ton === 'ambre' ? [253, 230, 138] as [number, number, number] : c.BORDURE));
  doc.setLineWidth(0.25);
  doc.roundedRect(c.MARGE, y, largeur, hauteur, 1.5, 1.5, 'FD');
  doc.setFillColor(...filet);
  doc.roundedRect(c.MARGE, y, 2.2, hauteur, 1, 1, 'F');

  doc.setFont('helvetica', style);
  doc.setFontSize(8.5);
  doc.setTextColor(...(ton === 'ambre' ? [146, 64, 14] as [number, number, number] : c.NAVY));
  lignes.forEach((ligne, i) => doc.text(ligne, c.MARGE + 7, y + 6.8 + i * 4.2));
  return y + hauteur + 5;
}

// ─── État de mes commandes ────────────────────────────────────────────────────

/** Le nom d'une étape au pluriel, et ce qu'elle veut dire pour les commandes qu'elle regroupe. */
const ETAPE_AU_PLURIEL: Record<EtapeClient, { titre: string; note: string }> = {
  enregistree: { titre: 'Enregistrées', note: 'Vos commandes sont enregistrées ; elles seront bientôt lancées en fabrication.' },
  fabrication: { titre: 'En fabrication', note: 'En cours de fabrication chez notre fournisseur.' },
  mer: { titre: 'En mer', note: 'À bord, en route vers le Maroc. Les dates suivent la compagnie maritime et peuvent encore évoluer.' },
  douane: { titre: 'En douane', note: 'Arrivées au port ; le dédouanement est en cours.' },
  prete: { titre: 'Prêtes à livrer', note: 'Dans notre entrepôt, prêtes à être livrées ou retirées sur simple demande.' },
  livree: { titre: 'Livrées', note: 'Commandes déjà livrées.' },
};

/** Les deux encarts du haut : pour qui est l'état, et la prochaine chose qui arrive. */
function encartsEtat(
  o: Outils, y: number, client: string, commandes: CommandeClient[],
  conteneurs: Record<string, ConteneurClient>, aujourdHui: string,
): number {
  const { doc, c } = o;
  const largeurBloc = (largeurPage(doc) - 2 * c.MARGE - 6) / 2;
  const hauteur = 32;
  const livrees = commandes.filter(x => etapeClient(x.statut) === 'livree').length;
  const enCours = commandes.length - livrees;

  c.encart(doc, {
    x: c.MARGE, y, largeur: largeurBloc, hauteur,
    etiquette: 'Établi pour',
    ton: 'nuit',
    valeur: texteImprimable(client) || '—',
    lignes: [
      `${pluriel(enCours, 'commande en cours', 'commandes en cours')} · ${pluriel(livrees, 'livrée', 'livrées')}`,
      `État au ${dateFr(aujourdHui)}`,
    ],
  });

  // La prochaine arrivée : ce que le client cherche en ouvrant ce papier.
  const attendues = commandes
    .filter(x => rangEtape(etapeClient(x.statut)) <= rangEtape('mer'))
    .map(x => ({ x, k: conteneurDe(x, conteneurs), date: arriveeDe(x, conteneurDe(x, conteneurs)) }))
    .filter((v): v is { x: CommandeClient; k: ConteneurClient | undefined; date: string } => Boolean(v.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  // Une date déjà passée n'est pas une « prochaine arrivée » : le navire a pris du retard sans
  // que la nouvelle date nous soit encore parvenue. Elle n'est donc jamais proposée ici.
  const prochaine = attendues.find(v => v.date >= aujourdHui);
  const pretes = commandes.filter(x => etapeClient(x.statut) === 'prete').length;
  const enMer = commandes.filter(x => etapeClient(x.statut) === 'mer');
  const auPort = commandes.filter(x => etapeClient(x.statut) === 'douane').length;
  const avantMer = commandes.filter(x => rangEtape(etapeClient(x.statut)) < rangEtape('mer')).length;

  let droite: { etiquette: string; valeur: string; lignes: string[] };
  if (prochaine) {
    const memeJour = attendues.filter(v => v.date === prochaine.date).length;
    const k = prochaine.k;
    const ecart = ecartArrivee(k, prochaine.date);
    droite = {
      etiquette: 'Prochaine arrivée prévue',
      valeur: `Le ${dateFr(prochaine.date)}`,
      lignes: [
        `${pluriel(memeJour, 'commande attendue', 'commandes attendues')} ce jour-là`,
        ecart && ecart > 0
          ? `Repoussée de ${jours(ecart)} par la compagnie maritime`
          : [k?.compagnie, k?.connaissement && `Connaissement ${k.connaissement}`].filter(Boolean).join(' · '),
      ].filter(Boolean).map(texteImprimable),
    };
  } else if (pretes > 0) {
    droite = {
      etiquette: ETAPE_AU_PLURIEL.prete.titre,
      valeur: nombreDeCommandes(pretes),
      lignes: ['Dans notre entrepôt, à livrer ou à retirer', 'sur simple demande.'],
    };
  } else if (enMer.length > 0) {
    // À bord, mais sans date à venir : pas de conteneur encore connu, ou une date dépassée.
    const sansConteneur = enMer.some(x => !conteneurDe(x, conteneurs));
    droite = {
      etiquette: 'Prochaine arrivée',
      valeur: `${nombreDeCommandes(enMer.length)} en mer`,
      lignes: [
        "Date d'arrivée à confirmer.",
        sansConteneur ? 'Détails du conteneur bientôt disponibles.' : '',
      ].filter(Boolean),
    };
  } else if (auPort > 0) {
    droite = {
      etiquette: 'Au port',
      valeur: nombreDeCommandes(auPort),
      lignes: ['Dédouanement en cours.'],
    };
  } else {
    droite = {
      etiquette: 'Prochaine arrivée',
      valeur: 'Aucune arrivée annoncée',
      // « Dès l'embarquement » n'a de sens que pour une commande pas encore à bord.
      lignes: [avantMer > 0 ? "La date s'affichera dès l'embarquement." : 'Aucune commande en route pour le moment.'],
    };
  }
  c.encart(doc, { x: c.MARGE + largeurBloc + 6, y, largeur: largeurBloc, hauteur, ton: 'or', ...droite });
  return y + hauteur + 8;
}

/** Six tuiles, une par étape du parcours, avec le nombre de commandes qui s'y trouvent. */
function tuilesEtapes(o: Outils, y: number, groupes: ReturnType<typeof commandesParEtape>): number {
  const { doc, c } = o;
  y = c.reserver(doc, y, 34);
  y = c.titreSection(doc, y, 'Où en sont vos commandes');
  y += 1;

  const ecart = 3;
  const largeur = (largeurPage(doc) - 2 * c.MARGE - ecart * (groupes.length - 1)) / groupes.length;
  const hauteur = 20;

  groupes.forEach((g, i) => {
    const x = c.MARGE + i * (largeur + ecart);
    const n = g.commandes.length;
    doc.setFillColor(...(n ? c.BLANC : c.FOND));
    doc.setDrawColor(...c.BORDURE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, largeur, hauteur, 1.5, 1.5, 'FD');
    doc.setFillColor(...(n ? c.GOLD : c.BORDURE));
    doc.roundedRect(x, y, largeur, 1.8, 1, 1, 'F');
    doc.rect(x, y + 0.9, largeur, 0.9, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...(n ? c.NAVY : c.ESTOMPE));
    doc.text(String(n), x + largeur / 2, y + 11, { align: 'center' });

    const libelle = decouper(doc, ETAPE_AU_PLURIEL[g.etape.id].titre.toUpperCase(), largeur - 3, 6, 'bold', 2);
    doc.setTextColor(...c.ESTOMPE);
    libelle.forEach((l, j) => doc.text(l, x + largeur / 2, y + 15.5 + j * 2.6, { align: 'center' }));
  });
  return y + hauteur + 8;
}

/** Le nom du produit en gras, et sa ligne de détail en petit, découpés d'avance à la colonne. */
type LignesProduit = { nom: string[]; detail: string[] };

/**
 * Dessine la cellule « Produit » à la main : autotable n'a qu'un style par cellule, et un nom en
 * gras suivi d'un détail en petit gris se lit bien mieux qu'un bloc uniforme. La hauteur de la
 * ligne a été calculée par autotable sur le même nombre de lignes : on les pose au même endroit.
 */
function dessinerProduit(doc: jsPDF, c: Charte, data: CellHookData, lignes: LignesProduit): void {
  const cellule = data.cell;
  const k = doc.internal.scaleFactor;
  const hauteurPolice = (cellule.styles.fontSize || 7.5) / k;
  const interligne = hauteurPolice * 1.15;
  const total = lignes.nom.length + lignes.detail.length;
  const net = cellule.height - cellule.padding('vertical');
  let y = cellule.y + cellule.padding('top') + net / 2 + hauteurPolice * (2 - 1.15) - (total / 2) * interligne;
  const x = cellule.x + cellule.padding('left');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...c.NAVY);
  for (const ligne of lignes.nom) { doc.text(ligne, x, y); y += interligne; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...c.ESTOMPE);
  for (const ligne of lignes.detail) { doc.text(ligne, x, y); y += interligne; }
}

/** La colonne « Arrivée » : la date, et ce qu'elle veut dire à cette étape. */
function celluleArrivee(commande: CommandeClient, conteneur?: ConteneurClient): string {
  const rang = rangEtape(etapeClient(commande.statut));
  const arrivee = arriveeDe(commande, conteneur);
  const entrepot = entrepotDe(commande, conteneur);
  // Une date déjà passée alors que la commande est encore en route n'est plus une prévision.
  if (rang < rangEtape('douane')) return arrivee ? (arrivee >= aujourdHuiLocal() ? `${dateFr(arrivee)}\nprévue` : 'À confirmer') : 'À venir';
  if (rang === rangEtape('douane')) return arrivee ? `${dateFr(arrivee)}\nau port` : '—';
  if (entrepot) return `${dateFr(entrepot)}\nen entrepôt`;
  return arrivee ? `${dateFr(arrivee)}\nau port` : '—';
}

/**
 * La colonne « Conteneur » : compagnie et connaissement. Le navire n'y tient pas sans doubler la
 * hauteur de chaque ligne ; il est sur la fiche de la commande et dans l'Excel.
 */
function celluleConteneur(commande: CommandeClient, conteneur?: ConteneurClient): string {
  const rang = rangEtape(etapeClient(commande.statut));
  if (!conteneur) return rang <= rangEtape('fabrication') ? 'Pas encore embarquée' : '—';
  // « Connaissement » et son numéro sur deux lignes : ensemble, ils ne tiennent pas dans la colonne.
  const lignes = [
    conteneur.compagnie,
    conteneur.connaissement && `Connaissement\n${conteneur.connaissement}`,
  ].filter(Boolean) as string[];
  return lignes.length ? lignes.join('\n') : 'Attribué';
}

/** Un tableau par étape : titre, phrase d'explication, puis une ligne par commande. */
function tableauEtape(
  o: Outils, y: number, groupe: ReturnType<typeof commandesParEtape>[number],
  conteneurs: Record<string, ConteneurClient>,
): number {
  const { doc, c, autoTable } = o;
  const n = groupe.commandes.length;
  const plur = ETAPE_AU_PLURIEL[groupe.etape.id];

  // Le titre, sa phrase et au moins deux lignes voyagent ensemble.
  y = c.reserver(doc, y + 2, 40);
  y = c.titreSection(doc, y, `${plur.titre} — ${nombreDeCommandes(n)}`);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...c.ESTOMPE);
  doc.text(c.ajuster(doc, texteImprimable(plur.note), largeurPage(doc) - 2 * c.MARGE), c.MARGE, y + 1.5);
  y += 5;

  // Les largeurs font exactement la largeur utile (182 mm) : la colonne produit est découpée
  // d'avance, il faut donc la connaître au millimètre.
  const largeurs = [52, 24, 23, 30, 23, 30];
  const padding = { top: 2, bottom: 2, left: 2.5, right: 2.5 };
  const largeurTexteProduit = largeurs[0] - padding.left - padding.right;

  const produits: LignesProduit[] = [];
  const alertes: boolean[] = [];
  const corps = groupe.commandes.map(commande => {
    const k = conteneurDe(commande, conteneurs);
    const detail = [
      commande.famille,
      commande.reference && `Réf. ${commande.reference}`,
      resumeVariantes(commande),
      ...descriptifCommande(commande).slice(0, 2),
    ].filter(Boolean).join(' · ');
    const lignes: LignesProduit = {
      nom: decouper(doc, commande.nom || '—', largeurTexteProduit, 8, 'bold', 3),
      detail: detail ? decouper(doc, detail, largeurTexteProduit, 6.8, 'normal', 2) : [],
    };
    produits.push(lignes);
    const ecart = ecartArrivee(k, arriveeDe(commande, k));
    alertes.push(Boolean(ecart && ecart > 0 && rangEtape(etapeClient(commande.statut)) <= rangEtape('douane')));
    return [
      [...lignes.nom, ...lignes.detail].join('\n'),
      quantiteDite(commande.quantite, commande.unite),
      commande.commandeeLe ? dateFr(commande.commandeeLe) : '—',
      texteImprimable(celluleConteneur(commande, k)),
      celluleArrivee(commande, k),
      texteImprimable(remarqueCommande(commande, k, true)),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE, bottom: c.HAUTEUR_PIED },
    head: [['PRODUIT', 'QUANTITÉ', 'COMMANDÉE\nLE', 'CONTENEUR', 'ARRIVÉE', 'REMARQUE']],
    body: corps,
    ...c.STYLES_TABLEAU,
    styles: { ...c.STYLES_TABLEAU.styles, fontSize: 7.5, cellPadding: padding },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: largeurs[0], overflow: 'visible' },
      1: { cellWidth: largeurs[1], halign: 'right', fontStyle: 'bold', textColor: c.NAVY },
      2: { cellWidth: largeurs[2] },
      3: { cellWidth: largeurs[3] },
      4: { cellWidth: largeurs[4] },
      5: { cellWidth: largeurs[5], textColor: c.ESTOMPE },
    },
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 5 && alertes[data.row.index]) {
        data.cell.styles.textColor = c.AMBRE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    willDrawCell: data => {
      if (data.section === 'body' && data.column.index === 0) data.cell.text = [''];
    },
    didDrawCell: data => {
      if (data.section === 'body' && data.column.index === 0 && produits[data.row.index]) {
        dessinerProduit(doc, c, data, produits[data.row.index]);
      }
    },
  });

  return finTableau(doc, y) + 8;
}

/** Le bas de l'état : ce qu'il faut savoir pour bien le lire, et comment nous joindre. */
function blocBonASavoir(o: Outils, y: number): void {
  const { doc, c } = o;
  const largeur = largeurPage(doc) - 2 * c.MARGE;
  const phrases = [
    "Les dates d'arrivée suivent les informations de la compagnie maritime : elles peuvent encore évoluer jusqu'à l'arrivée du navire.",
    'Le détail de chaque commande (couleurs, tailles, voyage du navire) vous attend dans votre espace client.',
    `Une livraison à organiser, une question ? Écrivez-nous depuis votre espace client ou appelez le ${TELEPHONE}.`,
  ];
  const lignes = phrases.flatMap(p => decouper(doc, p, largeur - 8, 7.5, 'normal'));
  const hauteur = 10 + lignes.length * 4.3;
  // Un rappel, pas une information : il ne mérite pas une page à lui seul. Le téléphone reste
  // dans le pied de page de chaque feuille.
  y += 2;
  if (y + hauteur > doc.internal.pageSize.getHeight() - c.HAUTEUR_PIED) return;

  doc.setFillColor(...c.FOND);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.25);
  doc.roundedRect(c.MARGE, y, largeur, hauteur, 2, 2, 'FD');
  doc.setFillColor(...c.NAVY);
  doc.roundedRect(c.MARGE, y, largeur, 6, 1, 1, 'F');
  doc.rect(c.MARGE, y + 3, largeur, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...c.BLANC);
  doc.text('BON À SAVOIR', c.MARGE + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...c.ESTOMPE);
  lignes.forEach((ligne, i) => doc.text(ligne, c.MARGE + 4, y + 11.5 + i * 4.3));
}

/**
 * Construit l'état de toutes les commandes du client, sans le télécharger : séparé pour pouvoir
 * être relu hors du navigateur.
 */
export async function construireEtatCommandes(
  client: string,
  commandes: CommandeClient[],
  conteneurs: Record<string, ConteneurClient>,
): Promise<{ doc: jsPDF; fichier: string }> {
  const o = await outils();
  const { doc, c } = o;
  const aujourdHui = aujourdHuiLocal();
  const liste = (commandes || []).filter(Boolean);
  const tous = conteneurs || {};
  const groupes = commandesParEtape(liste, tous);
  const livrees = groupes.find(g => g.etape.id === 'livree')?.commandes.length ?? 0;

  let y = await c.enTeteDocument(doc, {
    titre: 'État de mes commandes',
    sousTitre: texteImprimable(`Au ${dateFr(aujourdHui)}`),
    mentions: [texteImprimable(`${pluriel(liste.length - livrees, 'commande en cours', 'commandes en cours')} · ${pluriel(livrees, 'livrée', 'livrées')}`)],
  });
  y = encartsEtat(o, y, client, liste, tous, aujourdHui);
  y = tuilesEtapes(o, y, groupes);

  if (liste.length === 0) {
    y = bandeau(o, y, "Vous n'avez aucune commande à ce jour. Dès qu'une commande sera enregistrée, elle apparaîtra ici avec chacune de ses étapes.");
  }
  for (const groupe of groupes) {
    if (groupe.commandes.length > 0) y = tableauEtape(o, y, groupe, tous);
  }

  blocBonASavoir(o, y);
  c.piedDeDocument(doc, texteImprimable(`État des commandes — ${client}`));
  return { doc, fichier: nomFichierClient('etat-commandes', client, 'pdf') };
}

/** « État de mes commandes au JJ/MM/AAAA » : toutes les commandes, étape par étape. */
export async function telechargerEtatCommandes(
  client: string,
  commandes: CommandeClient[],
  conteneurs: Record<string, ConteneurClient>,
): Promise<void> {
  const { doc, fichier } = await construireEtatCommandes(client, commandes, conteneurs);
  doc.save(fichier);
}

// ─── Fiche d'une commande ─────────────────────────────────────────────────────

/**
 * La photo du produit, ramenée à une taille d'impression. Si elle ne charge pas (réseau, image
 * servie sans autorisation CORS, délai dépassé), la fiche sort sans photo plutôt que pas du tout.
 */
async function chargerPhoto(url?: string): Promise<{ data: string; ratio: number } | null> {
  if (!url || typeof Image === 'undefined' || typeof document === 'undefined') return null;
  return new Promise(resolve => {
    let fini = false;
    const finir = (r: { data: string; ratio: number } | null) => { if (!fini) { fini = true; resolve(r); } };
    const minuterie = setTimeout(() => finir(null), 6000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(minuterie);
      try {
        const cote = 480;
        const echelle = Math.min(1, cote / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * echelle));
        canvas.height = Math.max(1, Math.round(img.height * echelle));
        const ctx = canvas.getContext('2d');
        if (!ctx) { finir(null); return; }
        // Fond blanc : une photo PNG transparente passée en JPEG sortirait sur fond noir.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finir({ data: canvas.toDataURL('image/jpeg', 0.85), ratio: canvas.width / canvas.height });
      } catch (_) { finir(null); }
    };
    img.onerror = () => { clearTimeout(minuterie); finir(null); };
    img.src = url;
  });
}

/** La carte du produit : photo, nom, caractéristiques, prix convenu, et la quantité à droite. */
function carteProduit(o: Outils, y: number, commande: CommandeClient, photo: { data: string; ratio: number } | null): number {
  const { doc, c } = o;
  const largeur = largeurPage(doc) - 2 * c.MARGE;
  const bordDroit = largeurPage(doc) - c.MARGE;
  const cotePhoto = 30;
  const gauche = c.MARGE + 7 + (photo ? cotePhoto + 5 : 0);
  const largeurTexte = bordDroit - 38 - gauche;

  const lignesNom = decouper(doc, commande.nom || '—', largeurTexte, 12, 'bold', 2);
  const sousTitre = [commande.famille?.toUpperCase(), commande.reference && `Réf. ${commande.reference}`].filter(Boolean).join('  ·  ');
  const lignesSous = sousTitre ? decouper(doc, sousTitre, largeurTexte, 7.5, 'normal', 1) : [];
  const caracteristiques = [...descriptifCommande(commande), resumeVariantes(commande)].filter(Boolean).join('  ·  ');
  const lignesCarac = caracteristiques ? decouper(doc, caracteristiques, largeurTexte, 8, 'normal', 3) : [];
  const prix = typeof commande.prixConvenuMad === 'number'
    ? `Prix convenu : ${nb(commande.prixConvenuMad)} MAD par ${uniteDite(commande.unite, 1)}`
    : '';

  const hauteurTexte = 6 + lignesNom.length * 5.5 + lignesSous.length * 4.5 + lignesCarac.length * 4.2
    + (commande.commandeeLe ? 5 : 0) + (prix ? 6 : 0) + 3;
  const hauteur = Math.max(hauteurTexte, photo ? cotePhoto + 8 : 26);
  y = c.reserver(doc, y, hauteur + 6);

  doc.setFillColor(...c.FOND);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.2);
  doc.roundedRect(c.MARGE, y, largeur, hauteur, 2, 2, 'FD');
  doc.setFillColor(...c.GOLD);
  doc.roundedRect(c.MARGE, y, 2.5, hauteur, 1, 1, 'F');

  if (photo) {
    const xPhoto = c.MARGE + 7;
    const yPhoto = y + (hauteur - cotePhoto) / 2;
    doc.setFillColor(...c.BLANC);
    doc.setDrawColor(...c.BORDURE);
    doc.roundedRect(xPhoto, yPhoto, cotePhoto, cotePhoto, 1.5, 1.5, 'FD');
    // La photo tient dans son carré sans être déformée.
    const w = photo.ratio >= 1 ? cotePhoto - 2 : (cotePhoto - 2) * photo.ratio;
    const h = photo.ratio >= 1 ? (cotePhoto - 2) / photo.ratio : cotePhoto - 2;
    try {
      doc.addImage(photo.data, 'JPEG', xPhoto + (cotePhoto - w) / 2, yPhoto + (cotePhoto - h) / 2, w, h, undefined, 'FAST');
    } catch (_) { /* une photo illisible ne doit pas empêcher la fiche de sortir */ }
  }

  // La quantité, en grand à droite : c'est le premier chiffre qu'on vérifie.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...c.NAVY);
  doc.text(nb(commande.quantite), bordDroit - 5, y + 12, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(...c.ESTOMPE);
  doc.text(texteImprimable(uniteDite(commande.unite, commande.quantite).toUpperCase()), bordDroit - 5, y + 16.5, { align: 'right' });

  let ligne = y + 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...c.NAVY);
  for (const t of lignesNom) { doc.text(t, gauche, ligne); ligne += 5.5; }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...c.ESTOMPE);
  for (const t of lignesSous) { doc.text(t, gauche, ligne); ligne += 4.5; }

  doc.setFontSize(8);
  doc.setTextColor(...c.TEXTE);
  for (const t of lignesCarac) { doc.text(t, gauche, ligne); ligne += 4.2; }

  if (commande.commandeeLe) {
    doc.setFontSize(7);
    doc.setTextColor(...c.ESTOMPE);
    doc.text(`Commandée le ${dateFr(commande.commandeeLe)}`, gauche, ligne + 1);
    ligne += 5;
  }
  if (prix) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...c.NAVY);
    doc.text(texteImprimable(prix), gauche, ligne + 1.5);
  }
  return y + hauteur + 7;
}

/** La date qu'on connaît pour chaque étape du parcours de cette commande, et si elle est prévue. */
function datesDuParcours(commande: CommandeClient, conteneur: ConteneurClient | undefined, rang: number): string[][] {
  const depart = conteneur?.suivi?.etapes?.find(e => e.code === 'DEPA')?.date || conteneur?.embarqueLe;
  const arrivee = arriveeDe(commande, conteneur);
  const entrepot = entrepotDe(commande, conteneur);
  const dite = (date: string | undefined, i: number, prevue: string) => {
    if (date) return rang >= i ? [dateFr(date)] : [dateFr(date), prevue];
    // Fabrication, mer, douane : des étapes qui durent. « En cours » dit qu'on y est.
    return rang === i && i >= 1 && i <= 3 ? ['en cours'] : [];
  };
  return [
    commande.commandeeLe ? [dateFr(commande.commandeeLe)] : [],
    dite(undefined, 1, ''),
    dite(depart, 2, 'départ prévu'),
    dite(arrivee, 3, 'arrivée prévue'),
    dite(entrepot, 4, ''),
    [],
  ];
}

/** Le parcours en six étapes, l'étape en cours marquée, avec les dates connues. */
function parcoursCommande(o: Outils, y: number, commande: CommandeClient, conteneur?: ConteneurClient): number {
  const { doc, c } = o;
  const rang = rangEtape(etapeClient(commande.statut));
  y = c.reserver(doc, y, 60);
  y = c.titreSection(doc, y, 'Où en est votre commande');

  const x0 = c.MARGE + 14;
  const x1 = largeurPage(doc) - c.MARGE - 14;
  const pas = (x1 - x0) / (ETAPES_CLIENT.length - 1);
  const yLigne = y + 7;
  const r = 2.8;
  const dates = datesDuParcours(commande, conteneur, rang);

  // Les traits entre les étapes : dorés pour le chemin déjà fait.
  for (let i = 0; i < ETAPES_CLIENT.length - 1; i++) {
    doc.setDrawColor(...(i < rang ? c.GOLD : c.BORDURE));
    doc.setLineWidth(0.9);
    doc.line(x0 + i * pas + r + 1.2, yLigne, x0 + (i + 1) * pas - r - 1.2, yLigne);
  }

  ETAPES_CLIENT.forEach((etape, i) => {
    const x = x0 + i * pas;
    if (i < rang) {
      doc.setFillColor(...c.GOLD);
      doc.circle(x, yLigne, r, 'F');
      // La coche, en deux traits blancs.
      doc.setDrawColor(...c.BLANC);
      doc.setLineWidth(0.55);
      doc.line(x - 1.3, yLigne, x - 0.3, yLigne + 1);
      doc.line(x - 0.3, yLigne + 1, x + 1.4, yLigne - 1);
    } else if (i === rang) {
      doc.setFillColor(...c.BLANC);
      doc.setDrawColor(...c.GOLD);
      doc.setLineWidth(0.7);
      doc.circle(x, yLigne, r + 1.3, 'FD');
      doc.setFillColor(...c.NAVY);
      doc.circle(x, yLigne, r - 0.6, 'F');
    } else {
      doc.setFillColor(...c.BLANC);
      doc.setDrawColor(...c.BORDURE);
      doc.setLineWidth(0.5);
      doc.circle(x, yLigne, r, 'FD');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(i <= rang ? c.NAVY : c.ESTOMPE));
    doc.text(etape.court.toUpperCase(), x, yLigne + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...c.ESTOMPE);
    dates[i].forEach((t, j) => doc.text(t, x, yLigne + 12.8 + j * 3, { align: 'center' }));
  });

  y = yLigne + 21;
  y = bandeau(o, y, phraseEtape(commande.statut));

  // Un retard ou une avance, dit en clair, tant que la marchandise n'est pas chez nous.
  const arrivee = arriveeDe(commande, conteneur);
  const ecart = ecartArrivee(conteneur, arrivee);
  if (ecart && rang >= rangEtape('mer') && rang <= rangEtape('douane')) {
    const annoncee = dateFr(conteneur?.arriveeInitiale);
    const auPort = rang === rangEtape('douane');
    if (ecart > 0 && auPort) {
      y = bandeau(o, y, `Le navire est arrivé le ${dateFr(arrivee)}, avec ${jours(ecart)} de retard sur la date d'abord annoncée (${annoncee}).`, 'ambre', 'bold');
    } else if (ecart > 0) {
      y = bandeau(o, y, `Arrivée repoussée de ${jours(ecart)} : prévue le ${dateFr(arrivee)} au lieu du ${annoncee}. La compagnie maritime a revu la date d'arrivée du navire ; elle peut encore évoluer.`, 'ambre', 'bold');
    } else if (auPort) {
      // Le navire est déjà là : l'avance est un fait, plus une prévision.
      y = bandeau(o, y, `Bonne nouvelle : le navire est arrivé le ${dateFr(arrivee)}, ${jours(-ecart)} plus tôt que la date d'abord annoncée (${annoncee}).`, 'or', 'bold');
    } else {
      y = bandeau(o, y, `Bonne nouvelle : l'arrivée est désormais prévue le ${dateFr(arrivee)}, ${jours(-ecart)} plus tôt qu'annoncé.`, 'or', 'bold');
    }
  }
  return y;
}

/** Le voyage : conteneur, navire, trajet parcouru, lien vers la carte, étapes de la compagnie. */
function voyageCommande(o: Outils, y: number, commande: CommandeClient, conteneur?: ConteneurClient): number {
  const { doc, c, autoTable } = o;
  const rang = rangEtape(etapeClient(commande.statut));
  const largeur = largeurPage(doc) - 2 * c.MARGE;

  if (!conteneur) {
    if (rang >= rangEtape('prete')) return y;
    y = c.reserver(doc, y + 2, 24);
    y = c.titreSection(doc, y, 'Le voyage de votre marchandise');
    // Avant l'embarquement, on attend le départ ; une fois à bord, le conteneur existe et c'est
    // sa fiche qui ne nous est pas encore parvenue : « dès l'embarquement » serait faux.
    const texte = rang < rangEtape('mer')
      ? "Le conteneur n'est pas encore attribué. Dès l'embarquement, vous trouverez ici la compagnie maritime, le navire et la date d'arrivée prévue."
      : rang === rangEtape('mer')
        ? "Les informations du conteneur (compagnie, navire, date d'arrivée) vous seront communiquées très prochainement."
        : 'Les informations du conteneur (compagnie, navire) vous seront communiquées très prochainement.';
    return bandeau(o, y + 1, texte, 'or', 'normal');
  }

  const suivi = conteneur.suivi;
  const arrivee = arriveeDe(commande, conteneur);
  const entrepot = entrepotDe(commande, conteneur);
  const lignesConteneur = [
    conteneur.connaissement && `Connaissement : ${conteneur.connaissement}`,
    conteneur.embarqueLe && `Embarqué le ${dateFr(conteneur.embarqueLe)}`,
    arrivee && (rang >= rangEtape('douane') ? `Arrivé au port le ${dateFr(arrivee)}` : `Arrivée prévue le ${dateFr(arrivee)}`),
    entrepot && `Entré en entrepôt le ${dateFr(entrepot)}`,
  ].filter(Boolean).map(t => texteImprimable(t)) as string[];
  const lignesNavire = suivi ? [
    suivi.portDepart && `Départ : ${suivi.portDepart}`,
    suivi.portArrivee && `Arrivée : ${suivi.portArrivee}`,
    suivi.majLe && `Suivi mis à jour le ${dateFr(suivi.majLe)}`,
  ].filter(Boolean).map(t => texteImprimable(t)) as string[] : [];
  const avecNavire = Boolean(suivi && (suivi.navire || lignesNavire.length));

  const hauteur = 20 + Math.max(lignesConteneur.length, lignesNavire.length, 1) * 4.5;
  y = c.reserver(doc, y + 2, hauteur + 14);
  y = c.titreSection(doc, y, 'Le voyage de votre marchandise');
  y += 1;

  const largeurBloc = avecNavire ? (largeur - 6) / 2 : largeur;
  c.encart(doc, {
    x: c.MARGE, y, largeur: largeurBloc, hauteur,
    etiquette: 'Conteneur',
    ton: 'nuit',
    valeur: texteImprimable(conteneur.compagnie || 'Compagnie maritime à confirmer'),
    lignes: lignesConteneur,
  });
  if (avecNavire) {
    c.encart(doc, {
      x: c.MARGE + largeurBloc + 6, y, largeur: largeurBloc, hauteur,
      etiquette: 'Navire',
      ton: 'or',
      valeur: texteImprimable(suivi?.navire || 'Navire à confirmer'),
      lignes: lignesNavire,
    });
  }
  y += hauteur + 6;

  // Le trajet parcouru, tant que la marchandise n'est pas arrivée.
  const avancement = suivi?.avancement;
  if (typeof avancement === 'number' && rang <= rangEtape('mer')) {
    const part = Math.max(0, Math.min(100, avancement));
    y = c.reserver(doc, y, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...c.NAVY);
    doc.text('TRAJET PARCOURU', c.MARGE, y);
    doc.text(`${Math.round(part)} %`, c.MARGE + largeur, y, { align: 'right' });
    doc.setFillColor(...c.FOND);
    doc.setDrawColor(...c.BORDURE);
    doc.setLineWidth(0.2);
    doc.roundedRect(c.MARGE, y + 2, largeur, 2.6, 1.3, 1.3, 'FD');
    if (part > 0) {
      doc.setFillColor(...c.GOLD);
      doc.roundedRect(c.MARGE, y + 2, Math.max(2.6, (largeur * part) / 100), 2.6, 1.3, 1.3, 'F');
    }
    y += 10;
  }

  // Le lien vers la carte du navire : cliquable dans le PDF.
  const lien = suivi?.lienCarte;
  if (lien && /^https:\/\//i.test(lien) && rang <= rangEtape('douane')) {
    y = c.reserver(doc, y, 8);
    const libelle = 'Suivre le navire en direct sur la carte  ›';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...c.NAVY);
    doc.textWithLink(libelle, c.MARGE, y + 1, { url: lien });
    doc.setDrawColor(...c.GOLD);
    doc.setLineWidth(0.4);
    doc.line(c.MARGE, y + 2.2, c.MARGE + doc.getTextWidth(libelle), y + 2.2);
    y += 8;
  }

  // Les étapes publiées par la compagnie : ce qui est fait, et ce qui est prévu.
  const etapes = suivi?.etapes || [];
  if (etapes.length > 0) {
    y = c.reserver(doc, y + 1, 30);
    y = c.titreSection(doc, y, 'Étapes du voyage');
    const prevues: boolean[] = [];
    autoTable(doc, {
      startY: y,
      margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE, bottom: c.HAUTEUR_PIED },
      head: [['DATE', 'ÉTAPE', 'LIEU', '']],
      body: etapes.map(e => {
        prevues.push(!e.reel);
        return [
          dateFr(e.date) || '—',
          texteImprimable([e.libelle, e.navire && `navire ${e.navire}`].filter(Boolean).join(' · ')),
          texteImprimable(e.lieu || '—'),
          e.reel ? 'Fait' : 'Prévu',
        ];
      }),
      ...c.STYLES_TABLEAU,
      styles: { ...c.STYLES_TABLEAU.styles, fontSize: 7.5, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 } },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 56 },
        3: { cellWidth: 18, halign: 'center' },
      },
      didParseCell: data => {
        if (data.section !== 'body') return;
        if (prevues[data.row.index]) {
          data.cell.styles.textColor = c.ESTOMPE;
          data.cell.styles.fontStyle = data.column.index === 1 ? 'bolditalic' : 'italic';
        } else if (data.column.index === 3) {
          data.cell.styles.textColor = c.NAVY;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = finTableau(doc, y) + 7;
  }
  return y;
}

/** Une ventilation (qualités, couleurs ou tailles) prête à imprimer. */
type Ventilation = { titre: string; colonne: string; lignes: { libelle: string; quantite: number }[] };

function ventilations(commande: CommandeClient): Ventilation[] {
  return [
    { titre: 'Qualités commandées', colonne: 'Qualité', lignes: (commande.qualites || []).map(q => ({ libelle: q.qualite, quantite: q.quantite })) },
    { titre: 'Couleurs commandées', colonne: 'Couleur', lignes: (commande.couleurs || []).map(q => ({ libelle: q.code, quantite: q.quantite })) },
    { titre: 'Tailles commandées', colonne: 'Taille', lignes: (commande.tailles || []).map(q => ({ libelle: q.taille, quantite: q.quantite })) },
  ].filter(v => v.lignes.length > 0);
}

/**
 * Le tableau d'une ventilation, avec son titre calé sur sa colonne : le titre de section de la
 * charte court jusqu'à la marge droite, et viendrait barrer le tableau voisin.
 */
function tableauVentilation(o: Outils, y: number, v: Ventilation, unite: string | undefined, x: number, largeur: number): number {
  const { doc, c, autoTable } = o;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...c.NAVY);
  const titre = v.titre.toUpperCase();
  doc.text(titre, x, y);
  doc.setDrawColor(...c.GOLD);
  doc.setLineWidth(0.4);
  doc.line(x + doc.getTextWidth(titre) + 3, y - 1, x + largeur, y - 1);

  const total = v.lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: x, right: largeurPage(doc) - x - largeur, top: c.MARGE, bottom: c.HAUTEUR_PIED },
    tableWidth: largeur,
    head: [['#', v.colonne.toUpperCase(), 'QUANTITÉ']],
    body: [
      // Une couleur saisie sans quantité est une ligne à compléter, pas une commande de zéro.
      ...v.lignes.map((l, i) => [
        String(i + 1),
        texteImprimable((l.libelle || '—').toUpperCase()),
        l.quantite > 0 ? quantiteDite(l.quantite, unite) : 'à préciser',
      ]),
      ['', 'TOTAL', quantiteDite(total, unite)],
    ],
    ...c.STYLES_TABLEAU,
    styles: { ...c.STYLES_TABLEAU.styles, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 } },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center', textColor: c.ESTOMPE },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 34, halign: 'right', fontStyle: 'bold', textColor: c.NAVY },
    },
    didParseCell: data => {
      if (data.section === 'body' && data.row.index === v.lignes.length) {
        data.cell.styles.fillColor = c.GOLD_PALE;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = c.NAVY;
      }
    },
  });
  return finTableau(doc, y) + 6;
}

/** Le détail de la commande : les ventilations, deux par deux quand elles sont courtes. */
function detailCommande(o: Outils, y: number, commande: CommandeClient): number {
  const { doc, c } = o;
  const tableaux = ventilations(commande);
  if (tableaux.length === 0) return y;

  y = c.reserver(doc, y + 2, 40);
  y = c.titreSection(doc, y, 'Détail de la commande');
  y += 3;
  const largeur = largeurPage(doc) - 2 * c.MARGE;
  const gouttiere = 6;
  const demi = (largeur - gouttiere) / 2;
  // Hauteur généreuse d'un tableau : la paire doit tenir sur la page où elle commence, sinon le
  // second tableau reviendrait se dessiner sur une page que le premier a déjà quittée.
  const hauteurDe = (v: Ventilation) => 14 + (v.lignes.length + 2) * 7.2;

  for (let i = 0; i < tableaux.length; i += 2) {
    const paire = tableaux.slice(i, i + 2);
    if (paire.length === 2 && paire.every(v => v.lignes.length <= 14)) {
      y = c.reserver(doc, y, Math.max(...paire.map(hauteurDe)));
      const page = doc.getCurrentPageInfo().pageNumber;
      const yGauche = tableauVentilation(o, y, paire[0], commande.unite, c.MARGE, demi);
      doc.setPage(page);
      const yDroite = tableauVentilation(o, y, paire[1], commande.unite, c.MARGE + demi + gouttiere, demi);
      y = Math.max(yGauche, yDroite);
    } else {
      for (const v of paire) {
        y = c.reserver(doc, y, Math.min(hauteurDe(v), 60));
        y = tableauVentilation(o, y, v, commande.unite, c.MARGE, largeur);
      }
    }
  }
  return y;
}

/**
 * Construit la fiche d'une commande, sans la télécharger : produit, parcours daté, voyage du
 * navire, retard éventuel, détail des couleurs et tailles, prix convenu.
 */
export async function construireFicheCommande(
  client: string,
  commande: CommandeClient,
  conteneur?: ConteneurClient,
): Promise<{ doc: jsPDF; fichier: string }> {
  const [o, photo] = await Promise.all([outils(), chargerPhoto(commande.photo)]);
  const { doc, c } = o;
  const aujourdHui = aujourdHuiLocal();

  let y = await c.enTeteDocument(doc, {
    titre: 'Fiche commande',
    sousTitre: texteImprimable(client),
    mentions: [`Établie le ${dateFr(aujourdHui)}`, texteImprimable(`Étape : ${titreEtape(commande.statut)}`)],
  });
  y = carteProduit(o, y, commande, photo);
  y = parcoursCommande(o, y, commande, conteneur);
  y = voyageCommande(o, y, commande, conteneur);
  y = detailCommande(o, y, commande);

  y = c.reserver(doc, y + 2, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...c.ESTOMPE);
  doc.text(
    c.ajuster(doc, `Une question sur cette commande ? Écrivez-nous depuis votre espace client ou appelez le ${TELEPHONE}.`, largeurPage(doc) - 2 * c.MARGE),
    c.MARGE, y + 2,
  );

  c.piedDeDocument(doc, texteImprimable(`Fiche commande — ${client}`));
  const produit = motsDeFichier(commande.nom, 30) || 'commande';
  return { doc, fichier: nomFichierClient(`fiche-${produit}`, client, 'pdf') };
}

/** La fiche d'une commande, en une page dans le cas courant. */
export async function telechargerFicheCommande(
  client: string,
  commande: CommandeClient,
  conteneur?: ConteneurClient,
): Promise<void> {
  const { doc, fichier } = await construireFicheCommande(client, commande, conteneur);
  doc.save(fichier);
}
