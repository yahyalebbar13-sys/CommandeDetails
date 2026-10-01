/**
 * Le bon imprimé, pensé pour le commercial : un BON DE LIVRAISON pas encore chiffré.
 *
 * C'est le papier qui fait la vente : le gestionnaire l'imprime sans prix, le commercial écrit
 * dessus le prix unitaire et le prix total de chaque article, la remise et le total, puis le
 * rend. Voulu par le patron (01/10/2026) : « pas de couleurs, juste le nom de l'article, une case
 * prix unitaire vide et une case prix total vide — comme un bon de livraison pas encore fait ».
 *
 * - « BON DE LIVRAISON » quand la marchandise part avec le client (comptoir, client) ;
 *   « BON DE COMMANDE » pour une commande à préparer, qui n'est pas encore sortie ;
 * - le numéro en très gros — c'est par lui qu'on retrouve le bon à l'écran ;
 * - le client (ou « Client comptoir »), la date et l'heure, le magasin ;
 * - UNE ligne par article (produit + qualité, toutes couleurs et tailles confondues) : sa
 *   quantité totale, une case « Prix unitaire » et une case « Prix total », vides ou remplies si
 *   le prix est déjà connu. Ni couleurs ni emplacements : ils restent à l'écran du gestionnaire ;
 * - en bas, une case « Remise » et une case « Total à payer » à remplir à la main.
 *
 * Il en faut DEUX exemplaires : un pour le client, un pour le magasin. Chaque impression les sort
 * donc tous les deux, chacun sur sa propre feuille et marqué « Exemplaire client » / « Exemplaire
 * magasin » (voulu par le patron, 01/10/2026). Le papier ne porte aucune consigne interne ni
 * aucune mention d'atelier (« longueur inconnue »…) : il part chez le client tel quel.
 *
 * Une seule mise en page de bon pour tout /stock : vente comptoir, commande client, commande à
 * préparer, reçu d'une vente directe. La charte est celle de /gestion : logo, bleu nuit et or,
 * titres soulignés d'un filet doré, bandeau de pied de page.
 *
 * Aucun prix de revient, jamais : ce papier passe de main en main en magasin.
 *
 * Fonction pure (une chaîne HTML) : elle se vérifie en test, sans navigateur. L'impression
 * elle-même passe par `imprimerHtml` (src/lib/impression.ts).
 */

import { echapperHtml } from './impression';
import { grouperLignesBon, estNumeroProvisoire, type NatureBon, type GroupeBon, type LigneDeGroupe } from './bon-sans-prix';

export interface DonneesBonImprime {
  numero: string;
  nature: NatureBon;
  clientNom?: string;
  clientTelephone?: string;
  magasin?: string;
  /** La date du bon, AAAA-MM-JJ. */
  date: string;
  /** L'heure d'enregistrement, « 14:32 ». */
  heure?: string;
  items: any[];
  /** Les emplacements d'où prendre chaque ligne, par rang de ligne. Plus imprimés depuis le
   *  01/10/2026 (le bon du commercial n'a ni couleurs ni emplacements) ; gardés pour les appelants. */
  emplacements?: Record<number, string[]>;
  /** Les noms des lieux (plus imprimés, cf. ci-dessus). */
  nomsLieux?: Record<string, string>;
  /** Le lieu du bon (plus imprimé, cf. ci-dessus). */
  lieuDuBon?: string;
  discount?: number;
  totalAmount?: number;
  totalAfterDiscount?: number;
  notes?: string;
  /** Le règlement déjà reçu (reçu d'une vente directe). */
  reglement?: string;
  /** Le logo, en data URI (src/lib/logo-b64.ts). */
  logo?: string;
}

const NAVY = '#0f172a';
const GOLD = '#c4a062';
const GOLD_PALE = '#fef9f0';
const TEXTE = '#1e293b';
const ESTOMPE = '#64748b';
const BORDURE = '#e2e8f0';

const esc = echapperHtml;

/** 2,5 — 12 — 0,035 : trois décimales au plus, à la française. */
const nombre = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
/** Un prix unitaire peut avoir trois décimales (mercerie) ; un total s'arrête au centime. */
const prixUnitaire = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const montant = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UNITES_PIECE = ['', 'unité', 'unite', 'pièce', 'pièces', 'piece', 'pieces', 'pcs', 'pc'];
const SINGULIER: Record<string, string> = {
  m: 'mètre', rolls: 'rouleau', kg: 'kilo', yds: 'yard', doz: 'douzaine', 'gross (144p)': 'grosse', bag: 'sac',
};
const PLURIEL_COLIS: Record<string, string> = {
  rolls: 'rouleaux', bag: 'sacs', doz: 'douzaines', 'gross (144p)': 'grosses',
};

/**
 * « par mètre », « à la pièce » : le libellé de l'unité dans laquelle le prix s'écrit. Le prix se
 * lit au mètre ou à la pièce ; il ne se lit au conditionnement (« par rouleau ») que si l'on ne
 * sait pas ce que contient le rouleau — le papier le signale alors en rouge.
 */
export function libellePrixParUnite(unite: string): string {
  const u = String(unite || '').trim().toLowerCase();
  if (UNITES_PIECE.includes(u)) return 'à la pièce';
  return `par ${SINGULIER[u] || u}`;
}

const uniteAffichee = (u: string) => {
  const v = String(u || '').trim().toLowerCase();
  if (UNITES_PIECE.includes(v)) return 'pièce(s)';
  return PLURIEL_COLIS[v] || u;
};

/** « 1 rouleau = 50 m », « 1 sac = 500 pièces ». */
export function libelleContenance(unite: string, contenance: { facteur: number; uniteBase: string } | null | undefined): string {
  if (!contenance) return '';
  const u = String(unite || '').trim().toLowerCase();
  const colis = SINGULIER[u] || u;
  const base = UNITES_PIECE.includes(String(contenance.uniteBase).trim().toLowerCase()) ? 'pièces' : contenance.uniteBase;
  return `1 ${colis} = ${nombre(contenance.facteur)} ${base}`;
}

const MENTION_NATURE: Record<NatureBon, string> = {
  COMPTOIR: 'Vente comptoir — marchandise remise au client.',
  CLIENT: 'Vente client — marchandise remise au client.',
  A_PREPARER: 'Commande à préparer — la marchandise sera remise à l\'enlèvement.',
};

/** Les deux exemplaires imprimés à chaque fois, dans cet ordre. */
export const EXEMPLAIRES = ['Exemplaire client', 'Exemplaire magasin'] as const;

/** Bon de livraison quand la marchandise part ; bon de commande tant qu'elle n'est pas sortie. */
export const titreDuBon = (nature: NatureBon): string =>
  (nature === 'A_PREPARER' ? 'Bon de commande' : 'Bon de livraison');

const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const uniteNormalisee = (u: unknown) => String(u ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Un groupe réduit à une partie de ses lignes : ses totaux et son prix commun recalculés. */
function sousGroupe(g: GroupeBon, lignes: LigneDeGroupe[], suffixe: string): GroupeBon {
  const parUnite = new Map<string, number>();
  for (const l of lignes) parUnite.set(l.unite, arrondi3((parUnite.get(l.unite) || 0) + l.quantite));
  const prix = new Set(lignes.map(l => l.prixUnitaire));
  return {
    ...g,
    cle: `${g.cle}|${suffixe}`,
    lignes,
    totaux: Array.from(parUnite.entries()).map(([unite, quantite]) => ({ unite, quantite })),
    prixDifferents: prix.size > 1,
    prixUnique: prix.size === 1 && lignes[0].prixUnitaire > 0 ? lignes[0].prixUnitaire : null,
    // Une ligne d'étagère se compte toujours à l'unité de vente : jamais « au colis entier ».
    prixAuColis: suffixe === 'etageres' ? false : g.prixAuColis,
    avecTailles: lignes.some(l => !!l.taille),
  };
}

/**
 * Un article vendu à la fois depuis la réserve et depuis les étagères de CHRIFA
 * (src/lib/etageres.ts) : ses lignes ne s'additionnent sur le papier que si elles sont dans la
 * MÊME unité (des pièces avec des pièces). Sinon — des sacs de la réserve et des pièces des
 * étagères — il s'imprime en deux lignes, chacune avec sa quantité ; le prix unitaire reste
 * celui de l'unité de vente.
 */
export function separerReserveEtEtageres(g: GroupeBon): GroupeBon[] {
  const etageres = g.lignes.filter(l => l.etagere);
  const reserve = g.lignes.filter(l => !l.etagere);
  if (etageres.length === 0 || reserve.length === 0) return [g];
  const unites = new Set(g.lignes.map(l => uniteNormalisee(l.unite)));
  if (unites.size === 1) return [g];
  return [sousGroupe(g, reserve, 'reserve'), sousGroupe(g, etageres, 'etageres')];
}

/** Hauteur réservée en bas de CHAQUE page pour le bandeau de pied (adresse + bandeau bleu nuit). */
const HAUTEUR_PIED = '64px';

/** Le document HTML complet du bon, prêt pour `imprimerHtml`. */
export function construireBonHtml(d: DonneesBonImprime): string {
  const groupes = grouperLignesBon(d.items || []).flatMap(separerReserveEtEtageres);
  const provisoire = estNumeroProvisoire(d.numero);
  const client = d.nature === 'COMPTOIR' || !String(d.clientNom || '').trim() ? 'Client comptoir' : String(d.clientNom);
  const dateLisible = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))
    ? d.date.split('-').reverse().join('/')
    : (d.date || '');
  const toutChiffre = (d.items || []).length > 0 && (d.items || []).every((i: any) => Number(i?.unitPrice) > 0);
  const remise = Number(d.discount) || 0;

  // Une ligne par article : nom, qualité, quantité totale, case prix unitaire, case prix total.
  const lignesArticles = groupes.map(g => {
    const totalQte = g.totaux.map(t => `${nombre(t.quantite)} ${uniteAffichee(t.unite)}`).join(' + ');
    // Des rouleaux de longueur connue : la quantité au mètre aussi (12 rouleaux de 50 m + 10 m →
    // « 610 m ») — c'est elle que le prix unitaire multiplie.
    const memeUnite = (u: string) => String(u || '').trim().toLowerCase() === String(g.unitePrix || '').trim().toLowerCase();
    const enColis = g.lignes.filter(l => l.contenance);
    const convertible = !g.prixAuColis && enColis.length > 0 && g.lignes.every(l => l.contenance || memeUnite(l.unite));
    const enBase = convertible
      ? ` <span class="petit">(${esc(nombre(g.lignes.reduce((s, l) => s + l.quantite * (l.contenance ? l.contenance.facteur : 1), 0)))} ${esc(uniteAffichee(enColis[0].contenance!.uniteBase))})</span>`
      : '';
    const contenances = Array.from(new Set(enColis.map(l => libelleContenance(l.unite, l.contenance))));
    const toutesChiffrees = g.lignes.every(l => l.prixUnitaire > 0);
    const totalArticle = toutesChiffrees ? g.lignes.reduce((s, l) => s + (Number(l.total) || 0), 0) : 0;
    // Rouleau de longueur inconnue : le prix s'écrit pour le rouleau entier — dit simplement, car
    // le client reçoit un exemplaire de ce papier.
    const aideUnitaire = g.prixAuColis
      ? `<div class="case-aide">${esc(libellePrixParUnite(g.unitePrix))} entier</div>`
      : `<div class="case-aide">${esc([libellePrixParUnite(g.unitePrix), ...contenances].join(' · '))}</div>`;
    const valeurUnitaire = g.prixUnique ? esc(prixUnitaire(g.prixUnique)) : g.prixDifferents ? '<span class="petit">prix variés</span>' : '';
    return `<tr>
      <td class="designation"><div class="produit">${esc(g.produit)}</div>${g.qualite ? `<div class="qualite">${esc(g.qualite)}</div>` : ''}</td>
      <td class="num"><strong>${esc(totalQte)}</strong>${enBase}</td>
      <td class="case"><div class="case-valeur">${valeurUnitaire}</div>${aideUnitaire}</td>
      <td class="case"><div class="case-valeur">${totalArticle > 0 ? esc(montant(totalArticle)) : ''}</div></td>
    </tr>`;
  }).join('');
  const blocs = lignesArticles
    ? `<table class="lignes">
        <thead><tr><th>Désignation</th><th class="num">Quantité</th><th class="num">Prix unitaire (MAD)</th><th class="num">Prix total (MAD)</th></tr></thead>
        <tbody>${lignesArticles}</tbody>
      </table>`
    : '';

  // La remise déjà convenue s'imprime toujours : le commercial doit la voir pour que son total
  // tombe juste. Le total, lui, n'est connu que quand tout est chiffré.
  const remiseTexte = remise > 0 ? `${nombre(remise)} %` : '';
  const totalTexte = toutChiffre && Number(d.totalAfterDiscount) > 0 ? `${montant(Number(d.totalAfterDiscount))} MAD` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titreDuBon(d.nature))} ${esc(d.numero)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${TEXTE}; margin: 0; padding: 0; font-size: 12px; }
  /* La mise en page : un tableau dont le pied (vide, répété sur chaque page imprimée) réserve la
     place du bandeau fixe. Sans lui, le bandeau recouvrait les dernières lignes de chaque page. */
  table.page { width: 100%; border-collapse: collapse; }
  table.page > tbody > tr > td, table.page > tfoot > tr > td { padding: 0; border: 0; background: none; }
  .reserve-pied { height: ${HAUTEUR_PIED}; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 3px solid ${GOLD}; }
  .entete img { height: 70px; display: block; }
  .numero-bloc { text-align: right; }
  .numero-libelle { font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: ${ESTOMPE}; }
  .numero { font-size: 46px; line-height: 1; font-weight: 900; color: ${NAVY}; letter-spacing: -.02em; margin-top: 4px; }
  .exemplaire { display: inline-block; margin-bottom: 6px; padding: 3px 10px; border: 2px solid ${NAVY}; color: ${NAVY}; font-weight: 900; font-size: 11px; letter-spacing: .15em; text-transform: uppercase; }
  /* Chaque exemplaire commence sur une feuille neuve. */
  .saut { break-before: page; page-break-before: always; height: 0; }
  .provisoire { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 2px solid #b91c1c; color: #b91c1c; font-weight: 900; font-size: 11px; text-transform: uppercase; }
  .infos { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin: 14px 0 6px; }
  .info { border: 1px solid ${BORDURE}; border-left: 4px solid ${GOLD}; padding: 8px 10px; background: #f8fafc; }
  .info .lib { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${ESTOMPE}; }
  .info .val { font-size: 15px; font-weight: 800; color: ${NAVY}; margin-top: 2px; }
  .info .sous { font-size: 11px; color: ${ESTOMPE}; }
  .mention { font-size: 11px; color: ${ESTOMPE}; margin: 6px 0 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; color: ${NAVY}; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid ${GOLD}; }
  .produit { font-size: 14px; font-weight: 900; color: ${NAVY}; text-transform: uppercase; }
  .qualite { font-size: 11px; color: ${TEXTE}; margin-top: 2px; }
  .case-libelle { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: ${ESTOMPE}; }
  .case-valeur { min-height: 26px; font-size: 16px; font-weight: 900; color: ${NAVY}; text-align: right; }
  .case-aide { font-size: 9px; font-weight: 700; color: ${ESTOMPE}; text-align: right; }
  .petit { font-size: 10px; font-weight: 600; color: ${ESTOMPE}; }
  table.lignes { width: 100%; border-collapse: collapse; }
  table.lignes thead th { background: ${NAVY}; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; text-align: left; padding: 7px 8px; }
  table.lignes thead th.num { text-align: right; }
  table.lignes tbody td { padding: 8px; border-bottom: 1px solid ${BORDURE}; font-size: 12px; vertical-align: middle; }
  table.lignes tr { page-break-inside: avoid; }
  td.designation { width: 44%; }
  /* Les deux cases à remplir à la main : un vrai cadre, assez haut pour écrire au stylo. */
  td.case { width: 20%; border: 2px solid ${NAVY}; height: 46px; }
  .num { text-align: right; white-space: nowrap; }
  .bas { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; page-break-inside: avoid; }
  .case-bas { width: 230px; border: 2px solid ${NAVY}; padding: 6px 10px; }
  .case-bas .case-valeur { min-height: 34px; font-size: 20px; }
  .case-total { border-color: ${GOLD}; background: ${GOLD_PALE}; }
  .notes { margin-top: 14px; border: 1px solid ${BORDURE}; padding: 8px 10px; font-size: 12px; }
  .pied { position: fixed; left: 0; right: 0; bottom: 0; }
  .pied .adresse { text-align: center; font-size: 9px; color: ${ESTOMPE}; padding: 4px 0; background: #fff; }
  .pied .bandeau { background: ${NAVY}; border-left: 12px solid ${GOLD}; color: #94a3b8; font-size: 9px; padding: 6px 12px; display: flex; justify-content: space-between; text-transform: uppercase; letter-spacing: .08em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.lignes thead th, .info, .case-total { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
${EXEMPLAIRES.map((libelleExemplaire, rang) => `${rang > 0 ? '<div class="saut"></div>' : ''}<table class="page">
  <tfoot><tr><td><div class="reserve-pied"></div></td></tr></tfoot>
  <tbody><tr><td>
  <div class="entete">
    <div>${d.logo ? `<img src="${d.logo}" alt="LEBTEX" />` : `<div class="produit" style="font-size:24px">LEBTEX</div>`}</div>
    <div class="numero-bloc">
      <div class="exemplaire">${esc(libelleExemplaire)}</div>
      <div class="numero-libelle">${esc(titreDuBon(d.nature))} N°</div>
      <div class="numero">${esc(d.numero)}</div>
      ${provisoire ? '<div class="provisoire">Numéro provisoire — saisi sans connexion</div>' : ''}
    </div>
  </div>

  <div class="infos">
    <div class="info"><div class="lib">Client</div><div class="val">${esc(client)}</div>${d.clientTelephone ? `<div class="sous">${esc(d.clientTelephone)}</div>` : ''}</div>
    <div class="info"><div class="lib">Date et heure</div><div class="val">${esc(dateLisible)}</div>${d.heure ? `<div class="sous">${esc(d.heure)}</div>` : ''}</div>
    <div class="info"><div class="lib">Magasin</div><div class="val">${esc(d.magasin || '—')}</div></div>
  </div>
  <div class="mention">${esc(MENTION_NATURE[d.nature])}</div>

  <h2>Articles</h2>
  ${blocs || '<p class="mention">Aucune ligne.</p>'}

  ${d.reglement ? `<div class="notes"><strong>Règlement :</strong> ${esc(d.reglement)}</div>` : ''}

  <div class="bas">
    <div class="case-bas"><div class="case-libelle">Remise (%)</div><div class="case-valeur">${esc(remiseTexte)}</div></div>
    <div class="case-bas case-total"><div class="case-libelle">Total à payer, après remise (MAD)</div><div class="case-valeur">${esc(totalTexte)}</div></div>
  </div>

  ${d.notes ? `<div class="notes"><strong>Note :</strong> ${esc(d.notes)}</div>` : ''}
  </td></tr></tbody>
</table>`).join('\n')}

  <div class="pied">
    <div class="adresse">LEBTEX TEXTILE IMPORT · 31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca · Tél : +212 5 22 25 77 78</div>
    <div class="bandeau"><span>${esc(titreDuBon(d.nature))} ${esc(d.numero)} · ${esc(client)}</span><span>Ce bon ne vaut pas facture</span></div>
  </div>
</body></html>`;
}
