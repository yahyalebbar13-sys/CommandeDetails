/**
 * Le bon imprimé, pensé pour le commercial.
 *
 * C'est le papier qui fait la vente : le gestionnaire l'imprime sans prix, le commercial écrit
 * dessus le prix unitaire de chaque produit, la remise et le total, puis le rend. Il doit donc
 * se lire d'un coup d'œil et laisser la place d'écrire :
 *
 * - le numéro en très gros — c'est par lui qu'on retrouve le bon à l'écran ;
 * - le client (ou « Client comptoir »), la date et l'heure, le magasin ;
 * - les lignes groupées par produit ET qualité, les couleurs et tailles dans leur propre
 *   sous-tableau avec un total ; à côté, UNE case « Prix unitaire » par groupe — vide, ou
 *   remplie si le prix est déjà connu ;
 * - pour chaque ligne, d'où prendre la marchandise quand on le sait (l'emplacement) ;
 * - en bas, une case « Remise » et une case « Total » à remplir à la main.
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
import { grouperLignesBon, estNumeroProvisoire, type NatureBon } from './bon-sans-prix';

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
  /** Les emplacements d'où prendre chaque ligne, par rang de ligne. */
  emplacements?: Record<number, string[]>;
  /** Les noms des lieux, pour afficher « CHRIFA » plutôt qu'un identifiant. */
  nomsLieux?: Record<string, string>;
  /** Le lieu du bon : une ligne qui sort d'ailleurs l'indique. */
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
  COMPTOIR: 'Vente comptoir — la marchandise est sortie du stock à l\'enregistrement de ce bon.',
  CLIENT: 'Vente client — la marchandise est sortie du stock à l\'enregistrement de ce bon.',
  A_PREPARER: 'Commande à préparer — la marchandise sort du stock à l\'enlèvement.',
};

/** Hauteur réservée en bas de CHAQUE page pour le bandeau de pied (adresse + bandeau bleu nuit). */
const HAUTEUR_PIED = '64px';

/** Le document HTML complet du bon, prêt pour `imprimerHtml`. */
export function construireBonHtml(d: DonneesBonImprime): string {
  const groupes = grouperLignesBon(d.items || []);
  const provisoire = estNumeroProvisoire(d.numero);
  const client = d.nature === 'COMPTOIR' || !String(d.clientNom || '').trim() ? 'Client comptoir' : String(d.clientNom);
  const dateLisible = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))
    ? d.date.split('-').reverse().join('/')
    : (d.date || '');
  const toutChiffre = (d.items || []).length > 0 && (d.items || []).every((i: any) => Number(i?.unitPrice) > 0);
  const remise = Number(d.discount) || 0;
  const nomLieu = (id?: string) => (id ? (d.nomsLieux?.[id] || id) : '');

  const blocs = groupes.map(g => {
    const colonnes = [
      '<th>Couleur</th>',
      g.avecTailles ? '<th>Taille</th>' : '',
      '<th class="num">Quantité</th>',
      '<th>Où la prendre</th>',
      g.prixDifferents ? `<th class="num">Prix ${esc(libellePrixParUnite(g.unitePrix))}</th>` : '',
    ].join('');
    const lignes = g.lignes.map(l => {
      const emplacements = d.emplacements?.[l.index] || [];
      const autreLieu = l.lieu && d.lieuDuBon && l.lieu !== d.lieuDuBon ? nomLieu(l.lieu) : '';
      const ou = [autreLieu, emplacements.join(', ')].filter(Boolean).join(' · ');
      // Une ligne en rouleaux dit aussi combien de mètres : c'est ce que le commercial multiplie.
      const enBase = l.contenance
        ? ` <span class="petit">(${esc(nombre(l.quantite * l.contenance.facteur))} ${esc(uniteAffichee(l.contenance.uniteBase))})</span>`
        : '';
      return `<tr>
        <td>${esc(l.couleur || '—')}</td>
        ${g.avecTailles ? `<td>${esc(l.taille || '—')}</td>` : ''}
        <td class="num"><strong>${esc(nombre(l.quantite))}</strong> ${esc(uniteAffichee(l.unite))}${enBase}</td>
        <td class="ou">${ou ? esc(ou) : '<span class="vide">—</span>'}</td>
        ${g.prixDifferents ? `<td class="num">${l.prixUnitaire > 0 ? esc(prixUnitaire(l.prixUnitaire)) : ''}</td>` : ''}
      </tr>`;
    }).join('');
    const totalQte = g.totaux.map(t => `${nombre(t.quantite)} ${uniteAffichee(t.unite)}`).join(' + ');
    const contenances = Array.from(new Set(g.lignes.filter(l => l.contenance).map(l => libelleContenance(l.unite, l.contenance))));
    const nbCol = 3 + (g.avecTailles ? 1 : 0) + (g.prixDifferents ? 1 : 0);
    const libelleCase = g.prixAuColis
      ? `Prix ${esc(libellePrixParUnite(g.unitePrix))} ENTIER (MAD)`
      : `Prix unitaire ${esc(libellePrixParUnite(g.unitePrix))} (MAD)`;
    const aideCase = g.prixAuColis
      ? '<div class="case-alerte">Contenance inconnue : écrivez le prix du colis entier</div>'
      : (contenances.length > 0 ? `<div class="case-aide">${esc(contenances.join(' · '))}</div>` : '');
    return `<section class="groupe">
      <div class="groupe-tete">
        <div class="groupe-titre">
          <div class="produit">${esc(g.produit)}</div>
          <div class="qualite">${g.qualite ? `Qualité : <strong>${esc(g.qualite)}</strong>` : 'Qualité : —'}</div>
        </div>
        <div class="case-prix${g.prixAuColis ? ' case-prix-alerte' : ''}">
          <div class="case-libelle">${libelleCase}</div>
          <div class="case-valeur">${g.prixUnique ? esc(prixUnitaire(g.prixUnique)) : g.prixDifferents ? '<span class="petit">voir les lignes</span>' : ''}</div>
          ${aideCase}
        </div>
      </div>
      <table class="lignes">
        <thead><tr>${colonnes}</tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><td colspan="${nbCol}">Total ${esc(g.produit)}${g.qualite ? ` · ${esc(g.qualite)}` : ''} : <strong>${esc(totalQte)}</strong> (${g.lignes.length} ligne${g.lignes.length > 1 ? 's' : ''})</td></tr></tfoot>
      </table>
    </section>`;
  }).join('');

  // La remise déjà convenue s'imprime toujours : le commercial doit la voir pour que son total
  // tombe juste. Le total, lui, n'est connu que quand tout est chiffré.
  const remiseTexte = remise > 0 ? `${nombre(remise)} %` : '';
  const totalTexte = toutChiffre && Number(d.totalAfterDiscount) > 0 ? `${montant(Number(d.totalAfterDiscount))} MAD` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bon ${esc(d.numero)}</title>
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
  .provisoire { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 2px solid #b91c1c; color: #b91c1c; font-weight: 900; font-size: 11px; text-transform: uppercase; }
  .infos { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin: 14px 0 6px; }
  .info { border: 1px solid ${BORDURE}; border-left: 4px solid ${GOLD}; padding: 8px 10px; background: #f8fafc; }
  .info .lib { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${ESTOMPE}; }
  .info .val { font-size: 15px; font-weight: 800; color: ${NAVY}; margin-top: 2px; }
  .info .sous { font-size: 11px; color: ${ESTOMPE}; }
  .mention { font-size: 11px; color: ${ESTOMPE}; margin: 6px 0 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; color: ${NAVY}; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid ${GOLD}; }
  .groupe { margin-bottom: 14px; page-break-inside: avoid; }
  .groupe-tete { display: flex; justify-content: space-between; align-items: stretch; gap: 10px; margin-bottom: 4px; }
  .produit { font-size: 15px; font-weight: 900; color: ${NAVY}; text-transform: uppercase; }
  .qualite { font-size: 12px; color: ${TEXTE}; margin-top: 2px; }
  .case-prix { min-width: 200px; border: 2px solid ${NAVY}; padding: 4px 8px; }
  .case-prix-alerte { border-color: #b91c1c; }
  .case-libelle { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: ${ESTOMPE}; }
  .case-prix-alerte .case-libelle { color: #b91c1c; }
  .case-valeur { min-height: 26px; font-size: 18px; font-weight: 900; color: ${NAVY}; text-align: right; }
  .case-aide { font-size: 10px; font-weight: 700; color: ${NAVY}; }
  .case-alerte { font-size: 10px; font-weight: 900; color: #b91c1c; }
  .petit { font-size: 10px; font-weight: 600; color: ${ESTOMPE}; }
  table.lignes { width: 100%; border-collapse: collapse; }
  table.lignes thead th { background: ${NAVY}; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; text-align: left; padding: 6px 8px; }
  table.lignes tbody td { padding: 6px 8px; border-bottom: 1px solid ${BORDURE}; font-size: 12px; }
  table.lignes tbody tr:nth-child(even) td { background: #f8fafc; }
  table.lignes tfoot td { background: ${GOLD_PALE}; border-top: 2px solid ${GOLD}; padding: 6px 8px; font-size: 12px; }
  table.lignes tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .ou { font-size: 11px; color: ${TEXTE}; }
  .vide { color: #cbd5e1; }
  .bas { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; page-break-inside: avoid; }
  .case-bas { width: 230px; border: 2px solid ${NAVY}; padding: 6px 10px; }
  .case-bas .case-valeur { min-height: 34px; font-size: 20px; }
  .case-total { border-color: ${GOLD}; background: ${GOLD_PALE}; }
  .notes { margin-top: 14px; border: 1px solid ${BORDURE}; padding: 8px 10px; font-size: 12px; }
  .consigne { margin-top: 14px; font-size: 11px; font-weight: 700; color: ${NAVY}; }
  .pied { position: fixed; left: 0; right: 0; bottom: 0; }
  .pied .adresse { text-align: center; font-size: 9px; color: ${ESTOMPE}; padding: 4px 0; background: #fff; }
  .pied .bandeau { background: ${NAVY}; border-left: 12px solid ${GOLD}; color: #94a3b8; font-size: 9px; padding: 6px 12px; display: flex; justify-content: space-between; text-transform: uppercase; letter-spacing: .08em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.lignes thead th, table.lignes tfoot td, .info, table.lignes tbody tr:nth-child(even) td, .case-total { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<table class="page">
  <tfoot><tr><td><div class="reserve-pied"></div></td></tr></tfoot>
  <tbody><tr><td>
  <div class="entete">
    <div>${d.logo ? `<img src="${d.logo}" alt="LEBTEX" />` : `<div class="produit" style="font-size:24px">LEBTEX</div>`}</div>
    <div class="numero-bloc">
      <div class="numero-libelle">Bon N°</div>
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

  <h2>Marchandise</h2>
  ${blocs || '<p class="mention">Aucune ligne.</p>'}

  ${d.reglement ? `<div class="notes"><strong>Règlement :</strong> ${esc(d.reglement)}</div>` : ''}

  <div class="bas">
    <div class="case-bas"><div class="case-libelle">Remise (%)</div><div class="case-valeur">${esc(remiseTexte)}</div></div>
    <div class="case-bas case-total"><div class="case-libelle">Total à payer, après remise (MAD)</div><div class="case-valeur">${esc(totalTexte)}</div></div>
  </div>

  ${d.notes ? `<div class="notes"><strong>Note :</strong> ${esc(d.notes)}</div>` : ''}
  ${toutChiffre ? '' : '<div class="consigne">Commercial : écrivez le prix unitaire de chaque produit (au mètre ou à la pièce, comme indiqué dans chaque case), la remise en %, et le total à payer après remise, puis rendez ce bon au gestionnaire.</div>'}
  </td></tr></tbody>
</table>

  <div class="pied">
    <div class="adresse">LEBTEX TEXTILE IMPORT · 31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca · Tél : +212 5 22 25 77 78</div>
    <div class="bandeau"><span>Bon ${esc(d.numero)} · ${esc(client)}</span><span>Ce bon ne vaut pas facture</span></div>
  </div>
</body></html>`;
}
