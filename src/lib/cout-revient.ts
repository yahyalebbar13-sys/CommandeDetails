// ─── Coût de revient d'un article importé ─────────────────────────────────────
// Reprend, terme pour terme, le calcul de l'écran « Coût Revient »
// (src/components/cost-analysis-view.tsx, lignes 83 à 161) — celui que les vues
// Historique et Réconciliation appliquent à l'identique, donc la référence de
// l'application. Un simulateur qui calculerait autrement ne servirait à rien.
//
// La chaîne, tout en dirhams après une seule conversion :
//   achat        = quantité × prix unitaire ($) × taux de change
//   frais        = (fret + transitaire + change + divers) ÷ 1,20, au prorata du volume
//   valeur douane = poids net (kg) × valeur au kilo de la catégorie   ← jamais le prix payé
//   DI, TPI, TIC = valeur douane × leur taux
//   TVA import   = (valeur douane + DI + TPI + TIC) × taux de TVA
//   revient      = achat + frais + droits, et l'unitaire par division
//
// Deux mises en garde tirées du code existant :
//  • La valeur en douane marocaine est forfaitaire, au kilo. Un article sans
//    poids net ne paie aucun droit, quel que soit son prix.
//  • Le diviseur 1,20 suppose 20 % de TVA sur la logistique, indépendamment du
//    taux de TVA de la marchandise. C'est ainsi partout dans l'application.
//
// Pur : aucun accès réseau ni Firestore — testé par scripts/test-cout-revient.ts.

/** Taux douaniers, en POURCENTS entiers comme dans la fiche catégorie (25 = 25 %). */
export type TauxDouane = {
  /** Valeur en douane forfaitaire, en dirhams par kilo. Sans elle, aucun droit n'est calculable. */
  valeurAuKg?: number | null;
  di?: number | null;
  tpi?: number | null;
  tic?: number | null;
  tva?: number | null;
};

export type EntreeSimulation = {
  quantite: number;
  /** Prix d'achat unitaire, en dollars. */
  prixAchatUnitaire: number;
  /** Poids net total du lot, en kilos — la base des droits de douane. */
  poidsNetTotal: number;
  /** Volume total du lot, en mètres cubes — la clé de répartition des frais. */
  volumeTotal: number;
  /** Dirhams par dollar. */
  tauxChange: number;
  /** Fret maritime, en dollars par mètre cube. */
  fretParM3: number;
  /** Transitaire + change + divers pour le conteneur entier, en dirhams TTC. */
  fraisDossier: number;
  /** Volume du conteneur entier, pour la quote-part de ces frais. */
  volumeDossier: number;
  douane: TauxDouane;
  /** Marge commerciale visée, en pourcents du coût de revient. */
  margePct: number;
  /** TVA appliquée à la vente, en pourcents. */
  tvaVentePct?: number;
};

export type Simulation = {
  // ── Ce qui compose le coût, en dirhams et pour le lot entier ──
  valeurAchat: number;
  fret: number;
  fraisLogistiques: number;
  /** fret + frais, hors TVA (÷ 1,20) : la quote-part imputée à ce lot. */
  fraisTotal: number;
  valeurDouane: number;
  di: number;
  tpi: number;
  tic: number;
  tvaImport: number;
  totalDouane: number;
  /** Achat + frais + droits, TVA d'importation comprise. */
  coutTotal: number;
  coutUnitaire: number;
  /** Le même coût sans la TVA d'importation, qui se récupère. */
  coutUnitaireHorsTva: number;
  // ── Ce qu'on en tire ──
  prixVenteUnitaireHT: number;
  prixVenteUnitaireTTC: number;
  margeUnitaire: number;
  /** Ce qui manque ou mérite d'être dit, en français, prêt à afficher. */
  alertes: string[];
};

const nombre = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Un taux en pourcents vers un coefficient ; null et undefined valent zéro. */
const taux = (v: number | null | undefined): number => (v == null ? 0 : nombre(v) / 100);

/** La TVA de la logistique est fixée à 20 % dans toute l'application. */
export const TVA_LOGISTIQUE = 1.2;

export function simulerCoutRevient(e: EntreeSimulation): Simulation {
  const alertes: string[] = [];

  const quantite = nombre(e.quantite);
  const volume = nombre(e.volumeTotal);
  const poids = nombre(e.poidsNetTotal);
  const tauxChange = nombre(e.tauxChange);

  // ── Achat ──────────────────────────────────────────────────────────────────
  const valeurAchat = quantite * nombre(e.prixAchatUnitaire) * tauxChange;

  // ── Logistique : fret au volume, frais du dossier au prorata ───────────────
  const fret = nombre(e.fretParM3) * volume * tauxChange;
  const volumeDossier = nombre(e.volumeDossier);
  const part = volumeDossier > 0 ? Math.min(volume / volumeDossier, 1) : 0;
  const fraisLogistiques = nombre(e.fraisDossier) * part;
  const fraisTotal = (fret + fraisLogistiques) / TVA_LOGISTIQUE;

  // ── Douane : base forfaitaire au kilo, jamais le prix payé ─────────────────
  const valeurAuKg = e.douane?.valeurAuKg;
  const valeurDouane = valeurAuKg == null ? 0 : poids * nombre(valeurAuKg);
  const di = valeurDouane * taux(e.douane?.di);
  const tpi = valeurDouane * taux(e.douane?.tpi);
  const tic = valeurDouane * taux(e.douane?.tic);
  const tvaImport = (valeurDouane + di + tpi + tic) * taux(e.douane?.tva);
  const totalDouane = di + tpi + tic + tvaImport;

  // ── Ce qui empêcherait de croire le résultat ───────────────────────────────
  if (valeurAuKg == null) {
    alertes.push("Aucune valeur en douane au kilo pour cette catégorie : les droits ne sont pas calculés. Renseignez-la dans la fiche catégorie pour un chiffre complet.");
  } else if (poids <= 0) {
    alertes.push("Sans poids net, la douane marocaine n'a pas de base taxable : les droits ressortent à zéro.");
  }
  if (tauxChange <= 0) alertes.push('Taux de change manquant : le coût ne peut pas être converti en dirhams.');
  if (volume <= 0) alertes.push("Sans volume, aucun fret n'est imputé à ce produit.");
  else if (nombre(e.fretParM3) <= 0) {
    alertes.push("Aucun fret saisi : le coût ne comprend que la marchandise et la douane.");
  }
  if (volumeDossier > 0 && volume > volumeDossier) {
    alertes.push('Le volume de ce produit dépasse celui du conteneur : la quote-part de frais est plafonnée.');
  }
  if (e.douane?.tva == null && valeurAuKg != null) {
    alertes.push("Aucun taux de TVA sur cette catégorie : la TVA d'importation est comptée pour zéro, comme dans vos dossiers.");
  }

  // ── Résultat ───────────────────────────────────────────────────────────────
  const coutTotal = valeurAchat + fraisTotal + totalDouane;
  const coutUnitaire = quantite > 0 ? coutTotal / quantite : 0;
  const coutUnitaireHorsTva = quantite > 0 ? (coutTotal - tvaImport) / quantite : 0;

  const prixVenteUnitaireHT = coutUnitaire * (1 + taux(e.margePct));
  const prixVenteUnitaireTTC = prixVenteUnitaireHT * (1 + taux(e.tvaVentePct ?? 20));

  return {
    valeurAchat,
    fret,
    fraisLogistiques,
    fraisTotal,
    valeurDouane,
    di,
    tpi,
    tic,
    tvaImport,
    totalDouane,
    coutTotal,
    coutUnitaire,
    coutUnitaireHorsTva,
    prixVenteUnitaireHT,
    prixVenteUnitaireTTC,
    margeUnitaire: prixVenteUnitaireHT - coutUnitaire,
    alertes,
  };
}

// ─── Valeurs tirées de l'historique ───────────────────────────────────────────
/**
 * Dirhams par dollar, d'après les derniers dossiers payés.
 *
 * C'est ainsi que l'application l'obtient partout : jamais saisi, toujours
 * déduit du montant réellement payé rapporté à la valeur déclarée.
 */
export function tauxChangeRecent(
  factures: { invoicePaidDhs?: number; declaredValue?: number; arrivalDate?: string }[],
  opts: { combien?: number } = {},
): { taux: number; dossiers: number } {
  const utilisables = (factures || [])
    .filter(f => nombre(f.invoicePaidDhs) > 0 && nombre(f.declaredValue) > 0)
    .sort((a, b) => String(b.arrivalDate || '').localeCompare(String(a.arrivalDate || '')))
    .slice(0, opts.combien ?? 5);
  if (!utilisables.length) return { taux: 0, dossiers: 0 };

  // Pondéré par la valeur déclarée : un gros dossier pèse plus qu'un petit.
  const valeur = utilisables.reduce((s, f) => s + nombre(f.declaredValue), 0);
  const paye = utilisables.reduce((s, f) => s + nombre(f.invoicePaidDhs), 0);
  return { taux: valeur > 0 ? paye / valeur : 0, dossiers: utilisables.length };
}

/**
 * Fret moyen au mètre cube ($/m³), d'après les dossiers passés. Sert
 * d'indication à côté du champ, jamais de valeur imposée.
 */
export function fretMoyenParM3(
  factures: { id: string; freightCost?: number; arrivalDate?: string }[],
  articles: { factureId?: string; cubicMeasurement?: number | string }[],
  opts: { combien?: number } = {},
): { fret: number; dossiers: number } {
  const volumeParDossier = new Map<string, number>();
  for (const a of articles || []) {
    if (!a.factureId) continue;
    volumeParDossier.set(a.factureId, (volumeParDossier.get(a.factureId) || 0) + nombre(a.cubicMeasurement));
  }

  const utilisables = (factures || [])
    .filter(f => nombre(f.freightCost) > 0 && (volumeParDossier.get(f.id) || 0) > 0)
    .sort((a, b) => String(b.arrivalDate || '').localeCompare(String(a.arrivalDate || '')))
    .slice(0, opts.combien ?? 5);
  if (!utilisables.length) return { fret: 0, dossiers: 0 };

  const fretTotal = utilisables.reduce((s, f) => s + nombre(f.freightCost), 0);
  const volumeTotal = utilisables.reduce((s, f) => s + (volumeParDossier.get(f.id) || 0), 0);
  return { fret: volumeTotal > 0 ? fretTotal / volumeTotal : 0, dossiers: utilisables.length };
}

/**
 * Les taux douaniers d'une catégorie. La jointure se fait sur le NOM, comme
 * dans toutes les vues de coût — `article.categoryId` contient le nom, pas l'id.
 */
export function tauxDeLaCategorie(
  categories: any[],
  nomCategorie: string,
): TauxDouane | null {
  const c = (categories || []).find(x => x?.name === nomCategorie || x?.id === nomCategorie);
  if (!c) return null;
  return {
    valeurAuKg: c.customsValuePerKg ?? null,
    di: c.importDutyRate ?? null,
    tpi: c.tpiRate ?? null,
    tic: c.ticRate ?? null,
    tva: c.tvaRate ?? null,
  };
}
