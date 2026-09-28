// ─── Chiffres d'un dossier d'arrivage ─────────────────────────────────────────
// Ceux que montrent les cartes du registre des arrivages, la fiche d'un dossier
// et le tableau des arrivages : un seul calcul, pour que les trois écrans disent
// le même chiffre. (lib/dossier-totals.ts suit une autre règle, avec des frais
// par défaut quand ils manquent : ne pas confondre.)
//
// Pur : aucun Firestore. `articles` = les articles DU dossier.

/** Totaux tirés des articles du dossier. */
export function resumerDossier(facture: any, articles: any[]) {
  const itemsCount = articles.length;
  const itemsVal = articles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
  const cbm = articles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
  const netWeight = articles.reduce((sum, o) => sum + (Number(o.netWeight) || 0), 0);
  const freight = Number(facture.freightCost) || Number(facture.freight) || 0;
  const efficiency = cbm > 0 ? (freight / cbm) : 0;
  const realFactureValue = itemsVal + freight;
  const isIncomplete = articles.some(o => !Number(o.netWeight) || !Number(o.cubicMeasurement));
  return { itemsCount, itemsVal, cbm, netWeight, freight, efficiency, realFactureValue, isIncomplete };
}

/** Facture payée (MAD) ÷ valeur déclarée ($) ; 0 tant que la valeur déclarée manque. */
export function tauxDeChangeDossier(facture: any): number {
  const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
  const declaredValue = Number(facture.declaredValue) || 0;
  return declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
}

/**
 * Coût de revient et coût de vente TTC du dossier, en MAD — ceux des cartes du
 * registre. `puMap` : prix unitaires de la déclaration provisoire (DP) par
 * catégorie ; le coût de vente n'existe qu'une fois la DP remplie.
 */
export function coutsDuDossier(
  facture: any,
  articles: any[],
  subCategories: any[],
  puMap: Record<string, string> = {},
): { revient: number; vente: number; hasDp: boolean } {
  const MARGE_RATE = 0.05;
  const hasDp = Object.values(puMap).some(v => parseFloat(v as string) > 0);
  if (articles.length === 0) return { revient: 0, vente: 0, hasDp };

  const tauxChange = tauxDeChangeDossier(facture);
  const exchange = Number(facture.exchangeInvoiceAmount) || 0;
  const transitaire = Number(facture.supplierInvoiceAmount) || 0;
  const fraisSupp = Number(facture.additionalCostsAmount) || 0;
  const fretMad = (Number(facture.freightCost) || 0) * tauxChange;
  const mtFraisRevient = (exchange + transitaire + fraisSupp + fretMad) / 1.20;
  const mtFraisVente = (exchange + transitaire + fraisSupp) / 1.20;
  const cbmTotal = articles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);

  let dosRevient = 0;
  articles.forEach(a => {
    const cbm = Number(a.cubicMeasurement) || 0;
    const nw = Number(a.netWeight) || 0;
    const qty = Number(a.quantity) || 0;
    const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisRevient : 0;
    const valAchatMad = qty * (Number(a.purchasePricePerUnit) || 0) * tauxChange;
    const cat = subCategories.find((c: any) => c.name === a.categoryId);
    const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
    const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
    const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
    const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
    const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
    const vd = cvk != null ? nw * cvk : 0;
    const di = idr != null ? vd * idr : 0;
    const tpi = tpr != null ? vd * tpr : 0;
    const tic = ticr != null ? vd * ticr : 0;
    const tva = tvar != null ? (vd + di + tpi + tic) * tvar : 0;
    dosRevient += valAchatMad + fraisCmd + di + tpi + tic + tva;
  });

  const catMap: Record<string, { qty: number; nw: number; cbm: number }> = {};
  articles.forEach(a => {
    const catId = a.categoryId || '—';
    if (!catMap[catId]) catMap[catId] = { qty: 0, nw: 0, cbm: 0 };
    catMap[catId].qty += Number(a.quantity) || 0;
    catMap[catId].nw += Number(a.netWeight) || 0;
    catMap[catId].cbm += Number(a.cubicMeasurement) || 0;
  });

  let dosVente = 0;
  Object.entries(catMap).forEach(([categoryId, { qty, nw, cbm }]) => {
    const puDollar = parseFloat(puMap[categoryId] ?? '') || 0;
    if (puDollar === 0) return;
    const valAchatMad = qty * puDollar * tauxChange;
    const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisVente : 0;
    const cat = subCategories.find((c: any) => c.name === categoryId);
    const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
    const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
    const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
    const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
    const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
    const vd = cvk != null ? nw * cvk : 0;
    const di = idr != null ? vd * idr : 0;
    const tpi = tpr != null ? vd * tpr : 0;
    const tic = ticr != null ? vd * ticr : 0;
    const totalHT = valAchatMad + fraisCmd + di + tpi + tic;
    const marge = totalHT * MARGE_RATE;
    const baseTva = vd + di + tpi + fraisCmd;
    const tva = tvar != null ? baseTva * tvar : 0;
    dosVente += totalHT + marge + tva;
  });

  return { revient: dosRevient, vente: dosVente, hasDp };
}

/**
 * Droits payés du dossier (Σ DI + TPI + TIC + TVA), en MAD. Les valeurs
 * retouchées dans la vue Coût de Revient (`overrides`, par article) priment sur
 * celles de la catégorie.
 */
export function droitsPayesDuDossier(
  articles: any[],
  subCategories: any[],
  overrides: Record<string, any> = {},
): number {
  return articles.reduce((total, a) => {
    const ov = overrides[a.id] || {};
    const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(a.netWeight)) || 0;
    const cat = subCategories.find(c => c.name === a.categoryId);
    // Prend l'override si présent, sinon la valeur de catégorie
    const customsValuePerKg = ov.customsValuePerKg != null
      ? Number(ov.customsValuePerKg)
      : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
    if (customsValuePerKg == null) return total;
    const importDutyRate = ov.importDutyRate != null
      ? Number(ov.importDutyRate) / 100
      : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0);
    const tpiRate = ov.tpiRate != null
      ? Number(ov.tpiRate) / 100
      : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : 0);
    const ticRate = ov.ticRate != null
      ? Number(ov.ticRate) / 100
      : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : 0);
    const tvaRate = ov.tvaRate != null
      ? Number(ov.tvaRate) / 100
      : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : 0);
    const valDouane = nw * customsValuePerKg;
    const di = valDouane * importDutyRate;
    const tpi = valDouane * tpiRate;
    const tic = valDouane * ticRate;
    const tva = (valDouane + di + tpi + tic) * tvaRate;
    return total + di + tpi + tic + tva;
  }, 0);
}
