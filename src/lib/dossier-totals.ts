/**
 * Fonctions partagées pour calculer les totaux de dossier,
 * identiques à ceux affichés dans les pages Coût de Revient et Coût de Vente.
 */

const CBM_CONTAINER_STD = 68;
const DEFAULT_FRAIS_CHANGE = 6500;
const DEFAULT_FRAIS_TRANSIT = 6000;
const DEFAULT_FRAIS_SUPP = 1500;
const MARGE_RATE = 0.05;

/** Convertit en nombre sans jamais retourner NaN */
const n = (v: any, fallback = 0): number => {
  const x = Number(v);
  return isFinite(x) ? x : fallback;
};

/**
 * Calcule le Coût de Revient TTC total du dossier (Σ coutTotalMad de chaque article).
 * Logique identique à CoutDeRevientModal.
 */
export function computeDossierCoutRevient(
  facture: any,
  articles: any[],
  subCategories: any[],
  tc: number
): number {
  if (!facture) return 0;
  const safeTC = isFinite(tc) && tc > 0 ? tc : 10.5;
  const dossierArticles = articles.filter((a) => a.factureId === facture.id);
  if (dossierArticles.length === 0) return 0;

  const fretTotal$       = n(facture.freightCost) || n(facture.freight);
  const fraisTransitaire = n(facture.supplierInvoiceAmount) || DEFAULT_FRAIS_TRANSIT;
  const fraisChange      = n(facture.exchangeInvoiceAmount) || DEFAULT_FRAIS_CHANGE;
  const fraisSupp        = n(facture.additionalCostsAmount)  || DEFAULT_FRAIS_SUPP;
  const totalFraisFixesMad = fraisTransitaire + fraisChange + fraisSupp;

  const cbmTotal =
    dossierArticles.reduce((s, a) => s + n(a.cubicMeasurement), 0) || CBM_CONTAINER_STD;

  const declaredValue   = n(facture.declaredValue);
  const totalFOBDossier = dossierArticles.reduce(
    (s, a) => s + n(a.quantity) * n(a.purchasePricePerUnit), 0
  );

  let total = 0;

  for (const a of dossierArticles) {
    const qty       = n(a.quantity);
    const prix      = n(a.purchasePricePerUnit);
    const cbmA      = n(a.cubicMeasurement);
    const nw        = n(a.netWeight);
    const valeurFOB = qty * prix;

    const partFret$    = cbmTotal > 0 && cbmA > 0 ? (cbmA / cbmTotal) * fretTotal$ : 0;
    const partFraisMad = cbmTotal > 0 && cbmA > 0 ? (cbmA / cbmTotal) * totalFraisFixesMad : 0;

    const cat            = subCategories.find((c) => c.name === a.categoryId || c.id === a.categoryId);
    const importDutyRate = n(cat?.importDutyRate) / 100;
    const tpiRate        = n(cat?.tpiRate)        / 100;
    const ticRate        = n(cat?.ticRate)        / 100;
    const tvaRate        = cat?.tvaRate != null ? n(cat.tvaRate) / 100 : 0.20;
    const customsValKg   = n(cat?.customsValuePerKg);

    let valeurDouaneMad: number;
    const weightBase = nw > 0 && customsValKg > 0 ? nw * customsValKg : 0;

    if (weightBase > 0) {
      valeurDouaneMad = weightBase;
    } else if (declaredValue > 0 && totalFOBDossier > 0) {
      valeurDouaneMad = (valeurFOB / totalFOBDossier) * declaredValue * safeTC;
    } else {
      valeurDouaneMad = valeurFOB * safeTC;
    }

    const diMad  = valeurDouaneMad * importDutyRate;
    const tpiMad = valeurDouaneMad * tpiRate;
    const ticMad = valeurDouaneMad * ticRate;
    const tvaMad = (valeurDouaneMad + diMad + tpiMad + ticMad) * tvaRate;
    const totalTaxesMad = diMad + tpiMad + ticMad + tvaMad;

    const coutTotalMad = valeurFOB * safeTC + partFret$ * safeTC + totalTaxesMad + partFraisMad;
    total += isFinite(coutTotalMad) ? coutTotalMad : 0;
  }

  return total;
}

/**
 * Calcule le Coût de Vente TTC total du dossier.
 * Utilise purchasePricePerUnit des articles (comme cost-sale-view),
 * PAS le PU de la déclaration douanière.
 * Formule : totalVenteTtc = (HT × 1.05) + TVA
 * où HT = valAchat + fraisLogistiques + DI + TPI + TIC
 */
export function computeDossierCoutVente(
  facture: any,
  articles: any[],
  subCategories: any[],
  generalCategories: any[]
): number {
  if (!facture) return 0;
  const dossierArticles = articles.filter((a) => a.factureId === facture.id);
  if (dossierArticles.length === 0) return 0;

  const invoicePaidDhs = n(facture.invoicePaidDhs);
  const declaredValue  = n(facture.declaredValue);
  // Taux réel si payé, sinon fallback 10.5
  const tauxChange     = invoicePaidDhs > 0 && declaredValue > 0
    ? invoicePaidDhs / declaredValue : 10.5;

  const exchange    = n(facture.exchangeInvoiceAmount);
  const transitaire = n(facture.supplierInvoiceAmount);
  const fraisSupp   = n(facture.additionalCostsAmount);
  // Frais hors TVA (÷1.20 comme dans cost-sale-view)
  const mtFraisTotal = (exchange + transitaire + fraisSupp) / 1.20;

  const isPole = (catName: string, genName: string) => {
    const u = (catName + ' ' + genName).toUpperCase();
    return u.includes('ZIPPER') || u.includes('SLIDER');
  };

  // Grouper par catégorie (même logique que cost-sale-view)
  type Entry = {
    qty: number; nw: number; cbm: number;
    fobMad: number; // Σ qty*pu*tc par groupe
    firstCatName: string; genCatId: string | null; isGrouped: boolean;
  };
  const map: Record<string, Entry> = {};

  for (const a of dossierArticles) {
    const rawCat    = a.categoryId || '—';
    const subCat    = subCategories.find((c) => c.name === rawCat);
    const genCatId  = subCat?.generalCategoryId || a.generalCategoryId || null;
    const genCatName = genCatId ? (generalCategories.find((g) => g.id === genCatId)?.name || '') : '';
    const shouldGroup = !!genCatId && isPole(rawCat, genCatName);
    const key = shouldGroup ? `GEN:${genCatId}` : rawCat;
    if (!map[key]) map[key] = { qty: 0, nw: 0, cbm: 0, fobMad: 0, firstCatName: rawCat, genCatId: shouldGroup ? genCatId : null, isGrouped: shouldGroup };
    map[key].qty    += n(a.quantity);
    map[key].nw     += n(a.netWeight);
    map[key].cbm    += n(a.cubicMeasurement);
    // Accumule la valeur d'achat MAD directement depuis les articles
    map[key].fobMad += n(a.quantity) * n(a.purchasePricePerUnit) * tauxChange;
  }

  const cbmTotal = Object.values(map).reduce((s, e) => s + e.cbm, 0);
  let total = 0;

  for (const [, entry] of Object.entries(map)) {
    const { nw, cbm, fobMad, firstCatName } = entry;

    const cat            = subCategories.find((c) => c.name === firstCatName);
    const fraisCmd       = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

    const customsValKg   = n(cat?.customsValuePerKg);
    const importDutyRate = cat?.importDutyRate != null ? n(cat.importDutyRate) / 100 : 0;
    const tpiRate        = cat?.tpiRate        != null ? n(cat.tpiRate)        / 100 : 0;
    const ticRate        = cat?.ticRate        != null ? n(cat.ticRate)        / 100 : 0;
    const tvaRate        = cat?.tvaRate        != null ? n(cat.tvaRate)        / 100 : 0.20;

    const valDouane = customsValKg > 0 && nw > 0 ? nw * customsValKg : 0;
    const di  = valDouane * importDutyRate;
    const tpi = valDouane * tpiRate;
    const tic = valDouane * ticRate;

    const totalHT       = fobMad + fraisCmd + di + tpi + tic;
    const marge         = totalHT * MARGE_RATE;
    const baseTva       = valDouane + di + tpi + tic + fraisCmd;
    const tva           = baseTva * tvaRate;
    const totalVenteTtc = totalHT + marge + tva;

    total += isFinite(totalVenteTtc) ? totalVenteTtc : 0;
  }

  return total;
}
