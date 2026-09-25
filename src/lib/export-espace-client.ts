/**
 * Les commandes du client, en classeur Excel.
 *
 * Le PDF se lit et se transmet ; l'Excel se trie, se filtre et se recopie dans les tableaux du
 * client — son stock, ses prévisions de vente, ce qu'il annonce à ses propres clients. Trois
 * feuilles : une ligne par commande, une ligne par couleur / taille / qualité, une ligne par
 * conteneur.
 *
 * Mêmes données que l'écran et que le PDF (src/lib/portail-client-donnees.ts : jamais de prix
 * d'achat ni de fournisseur), mêmes mots (src/lib/pdf-espace-client.ts). Les quantités et les
 * prix restent des nombres, pour que le client puisse les additionner ; les dates sont écrites
 * jj/mm/aaaa, comme partout dans l'espace client.
 */

import * as XLSX from 'xlsx';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import { titreEtape, dateFr } from '@/lib/statut-client';
import {
  commandesParEtape, conteneurDe, arriveeDe, entrepotDe, ecartArrivee, remarqueCommande,
  descriptifCommande, uniteDite, nomFichierClient,
} from '@/lib/pdf-espace-client';

type Cellule = string | number;

/** L'unité en toutes lettres, avec sa majuscule : « Mètres », « Rouleaux », « Pièces » — « kg » reste un symbole. */
function uniteColonne(unite?: string): string {
  const u = uniteDite(unite, 2);
  if (!u || u === 'kg') return u;
  return u.charAt(0).toUpperCase() + u.slice(1);
}

/**
 * Une feuille à partir d'un en-tête et de lignes : largeurs de colonnes ajustées au contenu,
 * filtre automatique posé sur l'en-tête.
 */
function feuille(entete: string[], lignes: Cellule[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([entete, ...lignes]);
  ws['!cols'] = entete.map((titre, i) => ({
    wch: Math.min(48, Math.max(titre.length, ...lignes.map(l => String(l[i] ?? '').length)) + 2),
  }));
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(lignes.length, 1), c: entete.length - 1 } }),
  };
  return ws;
}

/**
 * Applique un format de nombre à une colonne, sous l'en-tête. `quantite` : séparateur de milliers,
 * et décimales seulement quand il y en a (« #,##0.## » laisserait un point au bout de « 1 000. »).
 */
function formatColonne(ws: XLSX.WorkSheet, colonne: number, nbLignes: number, format: 'quantite' | 'prix'): void {
  for (let r = 1; r <= nbLignes; r++) {
    const cellule = ws[XLSX.utils.encode_cell({ r, c: colonne })];
    if (!cellule || cellule.t !== 'n') continue;
    cellule.z = format === 'prix' ? '#,##0.00' : Number.isInteger(cellule.v) ? '#,##0' : '#,##0.###';
  }
}

/** Feuille « Commandes » : une ligne par commande, dans l'ordre du parcours. */
function feuilleCommandes(commandes: CommandeClient[], conteneurs: Record<string, ConteneurClient>): XLSX.WorkSheet {
  const entete = [
    'Produit', 'Référence', 'Famille', 'Étape', 'Quantité', 'Unité', 'Commandée le',
    'Connaissement', 'Compagnie', 'Navire', 'Arrivée', 'Entrée entrepôt', 'Prix convenu MAD',
    'Remarque', 'Caractéristiques',
  ];
  const lignes: Cellule[][] = commandes.map(c => {
    const k = conteneurDe(c, conteneurs);
    return [
      c.nom || '',
      c.reference || '',
      c.famille || '',
      titreEtape(c.statut),
      Number(c.quantite) || 0,
      uniteColonne(c.unite),
      dateFr(c.commandeeLe),
      k?.connaissement || '',
      k?.compagnie || '',
      k?.suivi?.navire || '',
      dateFr(arriveeDe(c, k)),
      dateFr(entrepotDe(c, k)),
      typeof c.prixConvenuMad === 'number' ? c.prixConvenuMad : '',
      remarqueCommande(c, k),
      descriptifCommande(c).join(' · '),
    ];
  });
  const ws = feuille(entete, lignes);
  formatColonne(ws, 4, lignes.length, 'quantite');
  formatColonne(ws, 12, lignes.length, 'prix');
  return ws;
}

/** Feuille « Couleurs et tailles » : une ligne par qualité, couleur ou taille commandée. */
function feuilleVariantes(commandes: CommandeClient[], conteneurs: Record<string, ConteneurClient>): XLSX.WorkSheet {
  const entete = [
    'Produit', 'Référence', 'Étape', 'Type', 'Qualité / couleur / taille', 'Quantité', 'Unité',
    'Commandée le', 'Connaissement', 'Arrivée',
  ];
  const lignes: Cellule[][] = [];
  for (const c of commandes) {
    const k = conteneurDe(c, conteneurs);
    const commun = (type: string, valeur: string, quantite: number): Cellule[] => [
      c.nom || '',
      c.reference || '',
      titreEtape(c.statut),
      type,
      valeur,
      Number(quantite) || 0,
      uniteColonne(c.unite),
      dateFr(c.commandeeLe),
      k?.connaissement || '',
      dateFr(arriveeDe(c, k)),
    ];
    for (const q of c.qualites || []) lignes.push(commun('Qualité', q.qualite, q.quantite));
    for (const col of c.couleurs || []) lignes.push(commun('Couleur', col.code, col.quantite));
    for (const t of c.tailles || []) lignes.push(commun('Taille', t.taille, t.quantite));
  }
  const ws = feuille(entete, lignes);
  formatColonne(ws, 5, lignes.length, 'quantite');
  return ws;
}

/** Feuille « Conteneurs » : un conteneur par ligne, avec son voyage et son éventuel retard. */
function feuilleConteneurs(commandes: CommandeClient[], conteneurs: Record<string, ConteneurClient>): XLSX.WorkSheet {
  const entete = [
    'Connaissement', 'Compagnie', 'Navire', 'Port de départ', "Port d'arrivée", 'Embarqué le',
    'Arrivée', "Arrivée annoncée d'abord", 'Retard (jours)', 'Avance (jours)', 'Entrée entrepôt',
    'Commandes', 'Trajet parcouru (%)', 'Suivi en ligne',
  ];
  // Seulement les conteneurs de ses commandes, dans l'ordre où ils arrivent.
  const parConteneur = new Map<string, CommandeClient[]>();
  for (const c of commandes) {
    if (!c.conteneurId || !conteneurs[c.conteneurId]) continue;
    const liste = parConteneur.get(c.conteneurId);
    if (liste) liste.push(c);
    else parConteneur.set(c.conteneurId, [c]);
  }
  const ordonnes = Array.from(parConteneur.entries())
    .map(([id, siennes]) => ({ k: conteneurs[id], siennes }))
    .sort((a, b) => (a.k.arriveeLe || '9999').localeCompare(b.k.arriveeLe || '9999'));

  const liens: (string | undefined)[] = [];
  const lignes: Cellule[][] = ordonnes.map(({ k, siennes }) => {
    // Positif = retard, négatif = avance : chacun dans sa colonne, toujours en nombre positif.
    const ecart = ecartArrivee(k, k.arriveeLe);
    const lien = k.suivi?.lienCarte && /^https:\/\//i.test(k.suivi.lienCarte) ? k.suivi.lienCarte : undefined;
    liens.push(lien);
    const avancement = k.suivi?.avancement;
    return [
      k.connaissement || '',
      k.compagnie || '',
      k.suivi?.navire || '',
      k.suivi?.portDepart || '',
      k.suivi?.portArrivee || '',
      dateFr(k.embarqueLe),
      dateFr(k.arriveeLe),
      ecart ? dateFr(k.arriveeInitiale) : '',
      ecart && ecart > 0 ? ecart : '',
      ecart && ecart < 0 ? -ecart : '',
      dateFr(k.entrepotLe),
      siennes.length,
      typeof avancement === 'number' ? Math.round(avancement) : '',
      lien ? 'Voir le navire sur la carte' : '',
    ];
  });
  const ws = feuille(entete, lignes);
  // Le lien est cliquable dans Excel : le texte dit où il mène, l'adresse reste dessous.
  liens.forEach((lien, i) => {
    const cellule = ws[XLSX.utils.encode_cell({ r: i + 1, c: entete.length - 1 })];
    if (lien && cellule) cellule.l = { Target: lien, Tooltip: 'Carte du navire en direct' };
  });
  return ws;
}

/**
 * Construit le classeur sans le télécharger : séparé pour pouvoir être relu hors du navigateur.
 */
export function construireClasseurClient(
  client: string,
  commandes: CommandeClient[],
  conteneurs: Record<string, ConteneurClient>,
): { classeur: XLSX.WorkBook; fichier: string } {
  const tous = conteneurs || {};
  // Même ordre que le PDF et que l'écran : le parcours, puis la date d'arrivée.
  const rangees = commandesParEtape((commandes || []).filter(Boolean), tous).flatMap(g => g.commandes);

  const classeur = XLSX.utils.book_new();
  classeur.Props = { Title: `Commandes ${client}`.trim(), Author: 'LEBTEX', CreatedDate: new Date() };
  XLSX.utils.book_append_sheet(classeur, feuilleCommandes(rangees, tous), 'Commandes');
  XLSX.utils.book_append_sheet(classeur, feuilleVariantes(rangees, tous), 'Couleurs et tailles');
  XLSX.utils.book_append_sheet(classeur, feuilleConteneurs(rangees, tous), 'Conteneurs');
  return { classeur, fichier: nomFichierClient('commandes', client, 'xlsx') };
}

/** Télécharge les commandes du client en classeur Excel (.xlsx). */
export function telechargerExcel(
  client: string,
  commandes: CommandeClient[],
  conteneurs: Record<string, ConteneurClient>,
): void {
  const { classeur, fichier } = construireClasseurClient(client, commandes, conteneurs);
  XLSX.writeFile(classeur, fichier, { bookType: 'xlsx', compression: true });
}
