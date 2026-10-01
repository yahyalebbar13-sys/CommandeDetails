/**
 * Le bon de transfert imprimé : le papier qui voyage AVEC la marchandise.
 *
 * Le magasin de départ l'imprime à l'envoi et le glisse dans le carton ou le remet au chauffeur ;
 * le magasin d'arrivée pointe chaque ligne dessus, puis signe la zone « Reçu par ». Il remplace
 * l'ancien PDF téléchargé (exportTransferOrderPDF, gardé pour ses appelants) : un fichier à
 * retrouver dans « Téléchargements » avant de pouvoir l'imprimer, c'était un papier qui ne partait
 * pas avec le carton.
 *
 * Ce qu'il porte : le numéro (BT-…) en gros, le trajet départ → arrivée, la date, le statut, une
 * ligne par référence (produit et caractéristiques, qualité, couleur, taille, quantité envoyée,
 * case « Reçu » à remplir — ou remplie si le bon est déjà reçu), les manquants s'il y en a, et
 * deux zones de signature : « Remis par » au départ, « Reçu par / date / signature » à l'arrivée.
 *
 * Aucun prix : ce papier passe de main en main. La charte est celle de /gestion (logo, bleu nuit
 * et or, filet doré, bandeau de pied), comme le bon de livraison (src/lib/bon-imprime.ts).
 *
 * Fonction pure (une chaîne HTML) : vérifiée par scripts/test-transferts.ts. L'impression passe
 * par `imprimerHtml` (src/lib/impression.ts).
 */

import { echapperHtml } from './impression';
import { qualiteDeLArticle, specificationsArticle, valeurImprimable } from './specification-produit';
import { numeroBonTransfert, statutTransfert, totalManquant, type BonTransfert } from './transferts';

export interface DonneesBonTransfert {
  bon: Partial<BonTransfert> & { id: string };
  /** Nom lisible du départ et de l'arrivée (« Derb Omar »), à défaut l'identifiant. */
  nomDepart?: string;
  nomArrivee?: string;
  /** Familles et pôles : décrivent la marchandise (GSM, largeur, curseur…). */
  categories?: any[];
  generalCategories?: any[];
  /** Le logo, en data URI (src/lib/logo-b64.ts). */
  logo?: string;
}

const NAVY = '#0f172a';
const GOLD = '#c4a062';
const GOLD_PALE = '#fef9f0';
const TEXTE = '#1e293b';
const ESTOMPE = '#64748b';
const BORDURE = '#e2e8f0';
const HAUTEUR_PIED = '64px';

const esc = echapperHtml;
const nombre = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const UNITES_PIECE = ['', 'unité', 'unite', 'pièce', 'pièces', 'piece', 'pieces', 'pcs', 'pc'];
const unite = (u?: string) => (UNITES_PIECE.includes(String(u || '').trim().toLowerCase()) ? 'pièce(s)' : String(u || '').trim());

/** « 01/10/2026 à 14:32 » depuis une date ISO ; la chaîne telle quelle sinon. */
function dateLisible(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

/** Le document HTML complet du bon de transfert, prêt pour `imprimerHtml`. */
export function construireBonTransfertHtml(d: DonneesBonTransfert): string {
  const bon = d.bon;
  const numero = numeroBonTransfert(bon.id);
  const statut = statutTransfert(bon);
  const recu = bon.status === 'VALIDATED';
  const depart = d.nomDepart || String(bon.fromStore || '—');
  const arrivee = d.nomArrivee || String(bon.toStore || '—');
  const items: any[] = Array.isArray(bon.items) ? bon.items : [];

  const lignes = items.map((item, idx) => {
    const specs = specificationsArticle(item, d.categories || [], d.generalCategories || [])
      .filter(l => l.cle !== 'size')
      .map(l => `${l.label} ${l.valeur}`)
      .join(' · ');
    const qteRecue = Number(item?.receivedQty);
    const caseRecu = recu && Number.isFinite(qteRecue)
      ? `<strong>${esc(nombre(qteRecue))}</strong> <span class="petit">${esc(unite(item.unitOfMeasure))}</span>`
      : '';
    return `<tr>
      <td class="num">${idx + 1}</td>
      <td class="designation"><div class="produit">${esc(item.productName || '—')}</div>${specs ? `<div class="petit">${esc(specs)}</div>` : ''}</td>
      <td>${esc(qualiteDeLArticle(item) || '—')}</td>
      <td>${esc(valeurImprimable(item.color, '—'))}</td>
      <td>${esc(valeurImprimable(item.size, '—'))}</td>
      <td class="num"><strong>${esc(nombre(item.sentQty))}</strong> <span class="petit">${esc(unite(item.unitOfMeasure))}</span></td>
      <td class="case">${caseRecu}</td>
    </tr>`;
  }).join('');

  // Total par unité : additionner des mètres et des pièces ne donne pas un total qu'on puisse
  // pointer contre un carton.
  const parUnite: Record<string, number> = {};
  for (const i of items) {
    const u = unite(i?.unitOfMeasure);
    parUnite[u] = Math.round(((parUnite[u] || 0) + (Number(i?.sentQty) || 0)) * 1000) / 1000;
  }
  const totalEnvoye = Object.entries(parUnite).filter(([, q]) => q > 0).map(([u, q]) => `${nombre(q)} ${u}`).join(' + ') || '0';

  const manquants = Array.isArray(bon.manquants) ? bon.manquants : [];
  const blocManquants = manquants.length > 0
    ? `<div class="alerte"><strong>Manquant constaté à l'arrivée (perte au transport) :</strong> ${manquants
      .map(m => `${esc(m.productName)}${[m.quality, m.color, m.size].filter(Boolean).length ? ` (${esc([m.quality, m.color, m.size].filter(Boolean).join(' · '))})` : ''} : ${esc(nombre(m.manquant))} ${esc(unite(m.unitOfMeasure))}`)
      .join(' ; ')}</div>`
    : '';
  const mentionStatut = bon.status === 'CANCELLED'
    ? (bon.closSansMouvement
      ? '<div class="alerte">Ancien bon CLOS sans mouvement de stock : il ne doit plus accompagner de marchandise.</div>'
      : '<div class="alerte">Envoi ANNULÉ : ce bon ne doit plus accompagner de marchandise.</div>')
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bon de transfert ${esc(numero)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${TEXTE}; margin: 0; padding: 0; font-size: 12px; }
  table.page { width: 100%; border-collapse: collapse; }
  table.page > tbody > tr > td, table.page > tfoot > tr > td { padding: 0; border: 0; background: none; }
  .reserve-pied { height: ${HAUTEUR_PIED}; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 3px solid ${GOLD}; }
  .entete img { height: 70px; display: block; }
  .numero-bloc { text-align: right; }
  .numero-libelle { font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: ${ESTOMPE}; }
  .numero { font-size: 40px; line-height: 1; font-weight: 900; color: ${NAVY}; letter-spacing: -.02em; margin-top: 4px; }
  .statut { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 2px solid ${NAVY}; color: ${NAVY}; font-weight: 900; font-size: 11px; text-transform: uppercase; }
  .trajet { display: grid; grid-template-columns: 1fr auto 1fr 1fr; gap: 10px; align-items: stretch; margin: 14px 0 6px; }
  .info { border: 1px solid ${BORDURE}; border-left: 4px solid ${GOLD}; padding: 8px 10px; background: #f8fafc; }
  .info .lib { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${ESTOMPE}; }
  .info .val { font-size: 16px; font-weight: 800; color: ${NAVY}; margin-top: 2px; }
  .fleche { display: flex; align-items: center; font-size: 26px; font-weight: 900; color: ${GOLD}; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; color: ${NAVY}; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid ${GOLD}; }
  .produit { font-size: 13px; font-weight: 900; color: ${NAVY}; text-transform: uppercase; }
  .petit { font-size: 10px; font-weight: 600; color: ${ESTOMPE}; }
  table.lignes { width: 100%; border-collapse: collapse; }
  table.lignes thead th { background: ${NAVY}; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; text-align: left; padding: 7px 8px; }
  table.lignes thead th.num { text-align: right; }
  table.lignes tbody td { padding: 8px; border-bottom: 1px solid ${BORDURE}; font-size: 12px; vertical-align: middle; }
  table.lignes tr { page-break-inside: avoid; }
  td.designation { width: 34%; }
  td.case { width: 14%; border: 2px solid ${NAVY}; height: 38px; text-align: right; }
  .num { text-align: right; white-space: nowrap; }
  .total { margin-top: 10px; text-align: right; font-size: 13px; font-weight: 800; color: ${NAVY}; }
  .alerte { margin-top: 12px; border: 2px solid #b91c1c; color: #7f1d1d; padding: 8px 10px; font-size: 12px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; page-break-inside: avoid; }
  .signature { border: 2px solid ${NAVY}; padding: 8px 10px; min-height: 120px; }
  .signature.arrivee { border-color: ${GOLD}; background: ${GOLD_PALE}; }
  .signature .titre { font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: ${NAVY}; margin-bottom: 8px; }
  .signature .champ { font-size: 11px; color: ${ESTOMPE}; border-bottom: 1px dotted ${ESTOMPE}; padding: 10px 0 2px; }
  .consigne { font-size: 10px; color: ${ESTOMPE}; margin-top: 8px; }
  .pied { position: fixed; left: 0; right: 0; bottom: 0; }
  .pied .adresse { text-align: center; font-size: 9px; color: ${ESTOMPE}; padding: 4px 0; background: #fff; }
  .pied .bandeau { background: ${NAVY}; border-left: 12px solid ${GOLD}; color: #94a3b8; font-size: 9px; padding: 6px 12px; display: flex; justify-content: space-between; text-transform: uppercase; letter-spacing: .08em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.lignes thead th, .info, .signature.arrivee { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<table class="page">
  <tfoot><tr><td><div class="reserve-pied"></div></td></tr></tfoot>
  <tbody><tr><td>
  <div class="entete">
    <div>${d.logo ? `<img src="${d.logo}" alt="LEBTEX" />` : `<div class="produit" style="font-size:24px">LEBTEX</div>`}</div>
    <div class="numero-bloc">
      <div class="numero-libelle">Bon de transfert N°</div>
      <div class="numero">${esc(numero)}</div>
      <div class="statut">${esc(statut.libelle)}</div>
    </div>
  </div>

  <div class="trajet">
    <div class="info"><div class="lib">Départ</div><div class="val">${esc(depart)}</div></div>
    <div class="fleche">→</div>
    <div class="info"><div class="lib">Arrivée</div><div class="val">${esc(arrivee)}</div></div>
    <div class="info"><div class="lib">Envoyé le</div><div class="val">${esc(dateLisible(bon.date))}</div>${recu && bon.receivedDate ? `<div class="petit">Reçu le ${esc(dateLisible(bon.receivedDate))}</div>` : ''}</div>
  </div>
  ${mentionStatut}

  <h2>Marchandise</h2>
  ${lignes
    ? `<table class="lignes">
        <thead><tr><th class="num">N°</th><th>Produit</th><th>Qualité</th><th>Couleur</th><th>Taille</th><th class="num">Quantité envoyée</th><th class="num">Reçu</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>`
    : '<p class="petit">Aucune ligne.</p>'}
  <div class="total">${items.length} référence(s) · Total envoyé : ${esc(totalEnvoye)}${totalManquant(bon) > 0 ? ' · manquant noté ci-dessous' : ''}</div>
  ${blocManquants}

  <div class="signatures">
    <div class="signature">
      <div class="titre">Remis par (départ : ${esc(depart)})</div>
      <div class="champ">Nom :</div>
      <div class="champ">Date :</div>
      <div class="champ">Signature :</div>
    </div>
    <div class="signature arrivee">
      <div class="titre">Reçu par (arrivée : ${esc(arrivee)})</div>
      <div class="champ">Nom :</div>
      <div class="champ">Date :</div>
      <div class="champ">Signature :</div>
    </div>
  </div>
  <div class="consigne">À l'arrivée : comptez chaque ligne, inscrivez la quantité reçue dans la case « Reçu », signez, puis
  réceptionnez le bon dans le logiciel (écran Transferts). Ce qui manque y est noté comme perte au transport.</div>
  </td></tr></tbody>
</table>

  <div class="pied">
    <div class="adresse">LEBTEX TEXTILE IMPORT · 31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca · Tél : +212 5 22 25 77 78</div>
    <div class="bandeau"><span>Bon de transfert ${esc(numero)} · ${esc(depart)} → ${esc(arrivee)}</span><span>Document interne — sans valeur commerciale</span></div>
  </div>
</body></html>`;
}
