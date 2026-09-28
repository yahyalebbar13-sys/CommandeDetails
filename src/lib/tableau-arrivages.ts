// ─── Tableau des arrivages ────────────────────────────────────────────────────
// Une ligne par dossier d'arrivage, avec d'un coup d'œil tout ce qui compte :
// transport, dates, volumes, valeurs, frais, coûts, contrôles. Ce fichier est
// pur (aucun Firestore) : il construit les lignes, cherche, filtre, trie et
// totalise. L'écran vit dans components/tableau-arrivages-view.tsx.
// Testé par scripts/test-tableau-arrivages.ts.

import { computeEffectiveStatus, type EffectiveStatus } from './status-utils';
import { coutsDuDossier, droitsPayesDuDossier, resumerDossier, tauxDeChangeDossier } from './chiffres-dossier';

export type LigneArrivage = ReturnType<typeof resumerDossier> & {
  id: string;
  /** Le dossier tel qu'il est enregistré — statut compris, jamais celui d'affichage. */
  facture: any;
  articles: any[];
  /** TRANSIT, CUSTOMS, STOCK — ou SHIPPED quand le dossier n'a aucune date. */
  statut: EffectiveStatus;
  /** Articles sans poids net ou sans CBM. */
  articlesIncomplets: number;
  /** MAD par dollar ; 0 tant que facture payée ou valeur déclarée manque. */
  tauxChange: number;
  /** Σ DI + TPI + TIC + TVA, en MAD. */
  droits: number;
  revient: number;
  vente: number;
  /** La déclaration provisoire a-t-elle ses prix ? Sans elle, pas de coût de vente. */
  hasDp: boolean;
  /** Catégories du dossier, la plus fournie d'abord. */
  categories: { nom: string; nombre: number }[];
  /** Clients dont une précommande voyage dans ce dossier. */
  clients: string[];
  /** Cases de « Vérifier le dossier » (components/dossier-checklist-modal). */
  verifications: Record<string, boolean>;
  /** Tout le texte où chercher, sans accents ni majuscules. */
  texte: string;
};

/** Minuscules, sans accents : « Écru » se trouve en tapant « ecru ». */
export function sansAccents(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Statut du dossier, calculé sur ses dates comme celui des articles
 * (hooks/use-enriched-articles). Un dossier validé en stock par /stock
 * (`status: 'STOCK'`) le reste, même sans date d'entrée.
 */
export function statutDuDossier(facture: any): EffectiveStatus {
  if (facture?.status === 'STOCK') return 'STOCK';
  return computeEffectiveStatus({
    status: 'SHIPPED',
    arrivalDate: facture?.arrivalDate || null,
    stockEntryDate: facture?.stockEntryDate || null,
  });
}

function texteDeRecherche(f: any, articles: any[], clients: string[]): string {
  const morceaux: unknown[] = [
    f.id, f.noBL, f.supplierId, f.supplier, f.declaringCompany, f.forwarder, f.shippingLine,
    f.suivi?.reference, f.suivi?.navire, f.suivi?.compagnie, ...(f.suivi?.conteneurs || []),
    ...clients,
  ];
  for (const a of articles) {
    morceaux.push(a.name, a.nameFR, a.categoryId, a.color, a.size, a.designRef, a.codeFournisseur);
    for (const c of a.colorBreakdown || []) morceaux.push(c?.colorCode);
  }
  return sansAccents(morceaux.filter(m => m !== null && m !== undefined && m !== '').join(' · '));
}

export function construireLignes(p: {
  factures: any[];
  articles: any[];
  subCategories: any[];
  /** dp_declarations, par dossier. */
  declarations?: Record<string, { puMap?: Record<string, string>; overrides?: Record<string, any> }>;
  /** checklists, par dossier : { douane_ok: true, … }. */
  verifications?: Record<string, Record<string, boolean>>;
}): LigneArrivage[] {
  const parDossier = new Map<string, any[]>();
  for (const a of p.articles) {
    if (!a?.factureId) continue;
    const liste = parDossier.get(a.factureId);
    if (liste) liste.push(a);
    else parDossier.set(a.factureId, [a]);
  }

  return p.factures.map(f => {
    const articles = parDossier.get(f.id) || [];
    const dp = p.declarations?.[f.id] || {};
    const couts = coutsDuDossier(f, articles, p.subCategories, dp.puMap || {});

    const parCategorie = new Map<string, number>();
    for (const a of articles) {
      const nom = String(a.categoryId || a.name || '—').trim();
      parCategorie.set(nom, (parCategorie.get(nom) || 0) + 1);
    }
    const categories = [...parCategorie.entries()]
      .map(([nom, nombre]) => ({ nom, nombre }))
      .sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, 'fr'));

    const clients: string[] = [];
    const vus = new Set<string>();
    for (const a of articles) {
      const nom = String(a.clientName || '').trim();
      if (nom && !vus.has(nom.toUpperCase())) { vus.add(nom.toUpperCase()); clients.push(nom); }
    }

    return {
      id: f.id,
      facture: f,
      articles,
      ...resumerDossier(f, articles),
      statut: statutDuDossier(f),
      articlesIncomplets: articles.filter(o => !Number(o.netWeight) || !Number(o.cubicMeasurement)).length,
      tauxChange: tauxDeChangeDossier(f),
      droits: droitsPayesDuDossier(articles, p.subCategories, dp.overrides || {}),
      revient: couts.revient,
      vente: couts.vente,
      hasDp: couts.hasDp,
      categories,
      clients,
      verifications: p.verifications?.[f.id] || {},
      texte: texteDeRecherche(f, articles, clients),
    };
  });
}

// ─── Recherche et filtres ─────────────────────────────────────────────────────
/** Chaque mot tapé doit se trouver quelque part dans le dossier (ou ses articles). */
export function correspond(ligne: LigneArrivage, recherche: string): boolean {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  return mots.every(m => ligne.texte.includes(m));
}

export type StatutFiltre = 'tous' | 'transit' | 'douane' | 'stock';

/** Valeur d'un filtre à liste qui retient les dossiers où le champ est vide. */
export const NON_RENSEIGNE = '∅';

export type CleAnomalie = 'sans-bl' | 'sans-valeur' | 'sans-paiement' | 'poids-cbm' | 'sans-dp' | 'verification' | 'vide';

export type FiltresArrivages = {
  recherche: string;
  statut: StatutFiltre;
  /** '' = tous ; NON_RENSEIGNE = champ vide ; sinon la valeur exacte (casse ignorée). */
  fournisseur: string;
  societe: string;
  transitaire: string;
  compagnie: string;
  /** Arrivée à partir de / jusqu'au, yyyy-mm-dd. */
  du: string;
  au: string;
  anomalie: CleAnomalie | '';
};

export const FILTRES_VIDES: FiltresArrivages = {
  recherche: '', statut: 'tous', fournisseur: '', societe: '', transitaire: '', compagnie: '', du: '', au: '', anomalie: '',
};

/**
 * Ce qui manque à un dossier. `attendues` : les cases de « Vérifier le
 * dossier », passées par l'écran qui les connaît.
 */
export const ANOMALIES: { cle: CleAnomalie; libelle: string; test: (l: LigneArrivage, attendues: string[]) => boolean }[] = [
  { cle: 'sans-bl',       libelle: 'Sans n° BL',              test: l => !String(l.facture.noBL || '').trim() },
  { cle: 'sans-valeur',   libelle: 'Sans valeur déclarée',    test: l => !(Number(l.facture.declaredValue) > 0) },
  { cle: 'sans-paiement', libelle: 'Facture payée manquante', test: l => !(Number(l.facture.invoicePaidDhs) > 0) },
  { cle: 'poids-cbm',     libelle: 'Poids ou CBM manquants',  test: l => l.articlesIncomplets > 0 },
  { cle: 'sans-dp',       libelle: 'DP non remplie',          test: l => !l.hasDp },
  { cle: 'verification',  libelle: 'Vérification incomplète', test: (l, attendues) => attendues.some(c => !l.verifications[c]) },
  { cle: 'vide',          libelle: 'Aucun article',           test: l => l.itemsCount === 0 },
];

export function statutCorrespond(l: LigneArrivage, filtre: StatutFiltre): boolean {
  switch (filtre) {
    case 'tous': return true;
    case 'stock': return l.statut === 'STOCK';
    case 'douane': return l.statut === 'CUSTOMS';
    case 'transit': return l.statut === 'TRANSIT' || l.statut === 'SHIPPED';
  }
}

function valeurCorrespond(valeur: unknown, filtre: string): boolean {
  if (!filtre) return true;
  const v = String(valeur ?? '').trim();
  if (filtre === NON_RENSEIGNE) return !v;
  return v.toUpperCase() === filtre.trim().toUpperCase();
}

export function filtrerLignes(lignes: LigneArrivage[], filtres: FiltresArrivages, attendues: string[] = []): LigneArrivage[] {
  const anomalie = ANOMALIES.find(a => a.cle === filtres.anomalie);
  return lignes.filter(l => {
    const f = l.facture;
    if (!statutCorrespond(l, filtres.statut)) return false;
    if (!valeurCorrespond(f.supplierId || f.supplier, filtres.fournisseur)) return false;
    if (!valeurCorrespond(f.declaringCompany, filtres.societe)) return false;
    if (!valeurCorrespond(f.forwarder, filtres.transitaire)) return false;
    if (!valeurCorrespond(f.shippingLine, filtres.compagnie)) return false;
    if (filtres.du || filtres.au) {
      const jour = String(f.arrivalDate || '').slice(0, 10);
      if (!jour) return false;
      if (filtres.du && jour < filtres.du) return false;
      if (filtres.au && jour > filtres.au) return false;
    }
    if (anomalie && !anomalie.test(l, attendues)) return false;
    return correspond(l, filtres.recherche);
  });
}

/** Valeurs prises par un champ, sans doublon de casse, dans l'ordre alphabétique. */
export function valeursDistinctes(factures: any[], lire: (f: any) => unknown): string[] {
  const vues = new Map<string, string>();
  for (const f of factures) {
    const v = String(lire(f) ?? '').trim();
    if (v && !vues.has(v.toUpperCase())) vues.set(v.toUpperCase(), v);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

// ─── Tri ──────────────────────────────────────────────────────────────────────
export type Sens = 'asc' | 'desc';

const estVide = (v: unknown) =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));

/**
 * Tri stable. Les cases vides restent en bas dans les deux sens : trier les
 * factures payées ne doit pas remonter d'abord tous les dossiers qui n'en ont pas.
 */
export function trierLignes<T>(lignes: T[], valeur: (l: T) => number | string | null | undefined, sens: Sens): T[] {
  return lignes
    .map((ligne, rang) => ({ ligne, rang, v: valeur(ligne) }))
    .sort((a, b) => {
      if (estVide(a.v) && estVide(b.v)) return a.rang - b.rang;
      if (estVide(a.v)) return 1;
      if (estVide(b.v)) return -1;
      let c = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), 'fr', { numeric: true, sensitivity: 'base' });
      if (sens === 'desc') c = -c;
      return c || a.rang - b.rang;
    })
    .map(x => x.ligne);
}

// ─── Totaux ───────────────────────────────────────────────────────────────────
export function totaliser(lignes: LigneArrivage[]) {
  const t = {
    dossiers: lignes.length, articles: 0, cbm: 0, netWeight: 0,
    itemsVal: 0, freight: 0, realFactureValue: 0, declaredValue: 0,
    invoicePaidDhs: 0, exchange: 0, transit: 0, fraisSupp: 0,
    droits: 0, revient: 0, vente: 0, ecart: 0,
  };
  // Le taux moyen ne compte que les dossiers qui ont les deux montants.
  let payeAvecValeur = 0;
  let valeurAvecPaye = 0;
  for (const l of lignes) {
    const f = l.facture;
    t.articles += l.itemsCount;
    t.cbm += l.cbm;
    t.netWeight += l.netWeight;
    t.itemsVal += l.itemsVal;
    t.freight += l.freight;
    t.realFactureValue += l.realFactureValue;
    t.declaredValue += Number(f.declaredValue) || 0;
    t.invoicePaidDhs += Number(f.invoicePaidDhs) || 0;
    t.exchange += Number(f.exchangeInvoiceAmount) || 0;
    t.transit += Number(f.supplierInvoiceAmount) || 0;
    t.fraisSupp += Number(f.additionalCostsAmount) || 0;
    t.droits += l.droits;
    t.revient += l.revient;
    if (l.hasDp && l.vente > 0) {
      t.vente += l.vente;
      t.ecart += l.revient - l.vente;
    }
    if (Number(f.invoicePaidDhs) > 0 && Number(f.declaredValue) > 0) {
      payeAvecValeur += Number(f.invoicePaidDhs);
      valeurAvecPaye += Number(f.declaredValue);
    }
  }
  return {
    ...t,
    efficience: t.cbm > 0 ? t.freight / t.cbm : 0,
    tauxMoyen: valeurAvecPaye > 0 ? payeAvecValeur / valeurAvecPaye : 0,
  };
}

export type TotauxArrivages = ReturnType<typeof totaliser>;

// ─── Saisie ───────────────────────────────────────────────────────────────────
/**
 * Lit un montant tapé à la française ou à l'anglaise : « 12 500,50 »,
 * « 12500.5 », « 12.500,50 », « 1 250 MAD ». Vide = 0 (on efface la case).
 * null = illisible ou négatif.
 */
export function lireNombre(saisie: string): number | null {
  let s = String(saisie ?? '').replace(/[\s  ]/g, '').replace(/(mad|dhs?|usd|\$|€)$/i, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    // Le dernier séparateur est celui des décimales ; l'autre sépare les milliers.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** « 2026-11-18 » → « 18/11/26 ». */
export function jourCourt(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

/** Jours d'`aujourdhui` à `iso` : positif = à venir, négatif = passé. */
export function joursJusqua(iso: string | null | undefined, aujourdhui: string): number | null {
  const a = Date.parse(`${String(iso || '').slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${aujourdhui}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}
