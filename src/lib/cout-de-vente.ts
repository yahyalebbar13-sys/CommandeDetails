// ─── Coût de vente d'un dossier d'arrivage ────────────────────────────────────
// Le calcul de la page « Coût Vente », seul et unique : les cartes du registre,
// le tableau des arrivages et le dashboard l'appellent aussi, pour dire le même
// chiffre que la page.
//
// Une ligne par catégorie, sauf les pôles regroupés (Zipper, Slider, Label,
// Buckle — voir regroupement-dp) : une ligne par pôle, comptée au kilo, dont le
// PU est celui saisi sur la déclaration provisoire sous le nom du pôle.
//
// Pur : aucun Firestore. `articles` = les articles DU dossier.

import { puSaisi, regroupeParPole } from './regroupement-dp';

export const MARGE_VENTE = 0.05;

export type LigneCoutDeVente = {
  /** Nom de la ligne : pôle si regroupée, catégorie sinon. Clé du PU dans la DP. */
  categoryId: string;
  /** Quantité de la ligne : kilos si regroupée, unités sinon. */
  totalQty: number;
  totalNW: number;
  totalCBM: number;
  unit: string;
  /** Catégorie qui porte les taux de douane (la première rencontrée). */
  cat: any;
  isPole: boolean;
  /** Première retouche de la vue Coût de Revient trouvée sur la ligne. */
  ov: any | null;
  uniqueSize: string | null;
  uniqueColor: string | null;
};

export function lignesCoutDeVente(
  articles: any[],
  subCategories: any[],
  generalCategories: any[],
  puMap: Record<string, string> = {},
  overrides: Record<string, any> = {},
): LigneCoutDeVente[] {
  type Entree = {
    qty: number; nw: number; cbm: number; unit: string; firstCatName: string;
    genCatId: string | null; isGrouped: boolean; firstOverride: any | null;
    sizes: Set<string>; colors: Set<string>;
  };
  const map: Record<string, Entree> = {};
  for (const a of articles) {
    const rawCat = a.categoryId || '—';
    const subCat = subCategories.find((c: any) => c.name === rawCat);
    const genCatId: string | null = subCat?.generalCategoryId || a.generalCategoryId || null;
    const genCatName = genCatId ? (generalCategories.find((g: any) => g.id === genCatId)?.name || '') : '';
    const isGrouped = !!genCatId && regroupeParPole(rawCat, genCatName, puMap);
    const key = isGrouped ? `GEN:${genCatId}` : rawCat;
    const articleOverride = overrides[a.id] ? overrides[a.id] : null;
    if (!map[key]) map[key] = {
      qty: 0, nw: 0, cbm: 0, unit: isGrouped ? 'KG' : (a.unitOfMeasure || 'U'), firstCatName: rawCat,
      genCatId: isGrouped ? genCatId : null, isGrouped, firstOverride: articleOverride, sizes: new Set(), colors: new Set(),
    };
    map[key].qty += Number(a.quantity) || 0;
    map[key].nw += Number(a.netWeight) || 0;
    map[key].cbm += Number(a.cubicMeasurement) || 0;
    if (a.size && a.size !== 'various') map[key].sizes.add(a.size.toUpperCase());
    if (a.color && a.color !== 'various') map[key].colors.add(a.color.toUpperCase());
    if (!map[key].firstOverride && articleOverride) map[key].firstOverride = articleOverride;
  }
  const nomPole = (e: Entree) =>
    e.genCatId ? (generalCategories.find((g: any) => g.id === e.genCatId)?.name || e.genCatId) : e.firstCatName;
  return Object.values(map)
    .sort((a, b) => nomPole(a).localeCompare(nomPole(b)))
    .map(e => ({
      categoryId: nomPole(e),
      totalQty: e.isGrouped ? e.nw : e.qty,
      totalNW: e.nw,
      totalCBM: e.cbm,
      unit: e.unit,
      cat: subCategories.find((c: any) => c.name === e.firstCatName),
      isPole: e.isGrouped,
      ov: e.firstOverride,
      uniqueSize: e.sizes.size === 1 ? [...e.sizes][0] : null,
      uniqueColor: e.colors.size === 1 ? [...e.colors][0] : null,
    }));
}

export function calculCoutDeVente(facture: any, lignes: LigneCoutDeVente[], puMap: Record<string, string> = {}) {
  const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
  const declaredValue = Number(facture.declaredValue) || 0;
  const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

  const exchange = Number(facture.exchangeInvoiceAmount) || 0;
  const transitaire = Number(facture.supplierInvoiceAmount) || 0;
  const fraisSupp = Number(facture.additionalCostsAmount) || 0;
  // Fret maritime exclu du coût de vente
  const mtFraisTotal = (exchange + transitaire + fraisSupp) / 1.20;

  const cbmTotal = lignes.reduce((s, l) => s + l.totalCBM, 0);

  const rows = lignes.map(line => {
    const { categoryId, totalQty: qty, totalNW: nw, totalCBM: cbm, unit, cat, ov } = line;

    // PU de la déclaration provisoire (USD)
    const puDollar = parseFloat(puSaisi(puMap, categoryId) ?? '') || 0;
    const valAchatMad = qty * puDollar * tauxChange;

    // Frais logistiques au prorata du CBM
    const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

    // Douane : la retouche de Coût de Revient prime sur la catégorie
    const customsValuePerKg = ov?.customsValuePerKg != null
      ? Number(ov.customsValuePerKg)
      : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
    const importDutyRate = ov?.importDutyRate != null
      ? Number(ov.importDutyRate) / 100
      : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null);
    const tpiRate = ov?.tpiRate != null
      ? Number(ov.tpiRate) / 100
      : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null);
    const ticRate = ov?.ticRate != null
      ? Number(ov.ticRate) / 100
      : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : null);
    const tvaRate = ov?.tvaRate != null
      ? Number(ov.tvaRate) / 100
      : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null);
    const hasCustData = customsValuePerKg !== null;
    const hasOverride = !!(ov && Object.keys(ov).length > 0);

    const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
    const di = importDutyRate != null ? valDouane * importDutyRate : 0;
    const tpi = tpiRate != null ? valDouane * tpiRate : 0;
    const tic = ticRate != null ? valDouane * ticRate : 0;

    // Total HT = Valeur Achat + Frais Log + DI + TPI + TIC
    const totalHT = hasCustData ? valAchatMad + fraisCmd + di + tpi + tic : 0;
    const marge = hasCustData ? totalHT * MARGE_VENTE : 0;

    // Base TVA = Valeur Douane + DI + TPI + TIC + Frais Log (sans valeur d'achat)
    const baseTva = hasCustData ? valDouane + di + tpi + tic + fraisCmd : 0;
    const tva = (hasCustData && tvaRate != null) ? baseTva * tvaRate : 0;

    // Total Vente TTC = Total HT + Marge + TVA
    const totalVenteTtc = hasCustData ? totalHT + marge + tva : 0;
    const pvuTtc = (hasCustData && qty > 0) ? totalVenteTtc / qty : 0;

    return {
      categoryId, qty, nw, cbm, unit, cat,
      puDollar, valAchatMad, fraisCmd,
      customsValuePerKg, importDutyRate, tpiRate, ticRate, tvaRate,
      hasCustData, valDouane, di, tpi, tic,
      totalHT, marge, baseTva, tva, totalVenteTtc, pvuTtc,
      missingDP: puDollar === 0,
      missingCust: !hasCustData,
      hasOverride,
      uniqueSize: line.uniqueSize ?? null,
      uniqueColor: line.uniqueColor ?? null,
    };
  });

  const totalMarge = rows.reduce((s, r) => s + r.marge, 0);
  const totalTVA = rows.reduce((s, r) => s + r.tva, 0);
  const total = rows.reduce((s, r) => s + (r.totalVenteTtc || 0), 0);

  return { tauxChange, mtFraisTotal, cbmTotal, exchange, transitaire, fraisSupp, totalMarge, totalTVA, rows, total };
}

/** Coût de vente TTC du dossier (MAD) : le total de la page « Coût Vente ». */
export function coutDeVenteDossier(
  facture: any,
  articles: any[],
  subCategories: any[],
  generalCategories: any[],
  puMap: Record<string, string> = {},
  overrides: Record<string, any> = {},
): number {
  if (articles.length === 0) return 0;
  const lignes = lignesCoutDeVente(articles, subCategories, generalCategories, puMap, overrides);
  return calculCoutDeVente(facture, lignes, puMap).total;
}
