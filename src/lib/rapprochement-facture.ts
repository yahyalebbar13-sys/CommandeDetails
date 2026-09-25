/**
 * Rapprochement d'une facture fournisseur lue (`facture-fournisseur.ts`) avec
 * les articles en production (PI) du fournisseur, puis plan des écritures qui
 * font passer ces articles en transit dans un dossier déjà créé.
 *
 * Passer en transit = sur l'article, `status: 'SHIPPED'` + `factureId` du
 * dossier (le statut affiché TRANSIT / DOUANE / STOCK se déduit ensuite des
 * dates du dossier). Le poids net et le volume sont des totaux de ligne,
 * comme partout dans l'application.
 *
 * Tout est pur : le composant applique les écritures dans un seul lot Firestore.
 */

import type { LectureFacture, LigneFacture } from './facture-fournisseur';

// ── Unités ───────────────────────────────────────────────────────────────────

type UniteCanonique = 'pc' | 'yd' | 'm' | 'roll' | 'doz' | 'gross' | 'kg' | 'bag' | 'box' | 'set' | 'autre';

export function uniteCanonique(u: string | undefined | null): UniteCanonique {
  const s = String(u || '').toLowerCase().replace(/[.\s]/g, '').replace(/\(.*\)/, '');
  if (/^(pcs?|pieces?|pièces?|pices|piece|pc\(s\))$/.test(s)) return 'pc';
  if (/^(yds?|yards?|y)$/.test(s)) return 'yd';
  if (/^(m|meters?|metres?|mtrs?|mètres?)$/.test(s)) return 'm';
  if (/^(rolls?|rouleaux?)$/.test(s)) return 'roll';
  if (/^(doz|dozens?|douzaines?)$/.test(s)) return 'doz';
  if (/^gross/.test(s)) return 'gross';
  if (/^(kgs?|kilos?)$/.test(s)) return 'kg';
  if (/^(bags?|sacs?)$/.test(s)) return 'bag';
  if (/^(box|boxes|boites?)$/.test(s)) return 'box';
  if (/^(sets?)$/.test(s)) return 'set';
  return 'autre';
}

const PAR_PIECE: Partial<Record<UniteCanonique, number>> = { pc: 1, doz: 12, gross: 144 };
const EN_METRES: Partial<Record<UniteCanonique, number>> = { m: 1, yd: 0.9144 };

/** Contenu d'un conditionnement lu dans le texte : « 500pcs/bag », « 100Y/roll », « 10gross/bag ». */
function contenance(texteLigne: string, contenant: 'bag' | 'box' | 'roll'): { n: number; unite: UniteCanonique } | null {
  const t = texteLigne.toUpperCase();
  const nomContenant = contenant === 'roll' ? 'ROLLS?' : contenant === 'bag' ? 'BAGS?' : 'BOX(?:ES)?';
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(PCS?|PIECES?|SETS?|GROSS|DOZ|Y|YDS?|YARDS?|M|METERS?)\\s*\\/\\s*${nomContenant}\\b`);
  const m = t.match(re);
  if (!m) return null;
  const unite = uniteCanonique(m[2] === 'Y' ? 'yd' : m[2]);
  // « 1000set/bag » : un set se compte comme une pièce.
  return { n: Number(m[1]), unite: unite === 'set' ? 'pc' : unite };
}

export type Conversion = {
  /** quantité dans l'unité de l'article = quantité facturée × facteur. */
  facteur: number;
  /** Dit pour l'écran : « 1 roll = 100 yds ». Vide si rien à dire. */
  libelle: string;
  /**
   * `meme` : même unité. `exacte` : conversion physique (100Y/roll, 1 yd = 0,9144 m).
   * `usage` : le yard compté comme un mètre, habitude de saisie des fiches.
   * `brute` : même chiffre malgré des unités différentes (1 000 rolls = 1 000 pièces).
   */
  nature: 'meme' | 'exacte' | 'usage' | 'brute';
  /** Ni la quantité ni le prix n'ont permis de choisir entre plusieurs lectures. */
  ambigue?: boolean;
};

/** Les façons plausibles de lire la quantité facturée dans l'unité de l'article. */
export function conversionsPossibles(uniteFacture: string, uniteArticle: string, texteLigne = ''): Conversion[] {
  const f = uniteCanonique(uniteFacture);
  const a = uniteCanonique(uniteArticle);
  if ((f === a && f !== 'autre') || String(uniteFacture).trim().toLowerCase() === String(uniteArticle).trim().toLowerCase()) {
    return [{ facteur: 1, libelle: '', nature: 'meme' }];
  }
  // Box et bag : le même conditionnement sous deux noms (usage de l'application).
  if ((f === 'box' && a === 'bag') || (f === 'bag' && a === 'box')) return [{ facteur: 1, libelle: '', nature: 'meme' }];

  const libelle = (k: number) => (k >= 1
    ? `1 ${uniteFacture} = ${arrondi(k, 4)} ${uniteArticle}`
    : `1 ${uniteArticle} = ${arrondi(1 / k, 4)} ${uniteFacture}`);
  const possibles: Conversion[] = [];
  const ajouter = (k: number | null, nature: Conversion['nature']) => {
    if (!k || !Number.isFinite(k) || possibles.some(c => Math.abs(c.facteur - k) < 1e-9)) return;
    possibles.push({ facteur: k, libelle: nature === 'brute' ? 'même chiffre que la fiche' : libelle(k), nature });
  };

  // Le calcul, avec le yard à sa vraie longueur puis compté comme un mètre.
  for (const [nature, yard] of [['exacte', 0.9144], ['usage', 1]] as const) {
    const metres: Partial<Record<UniteCanonique, number>> = { m: 1, yd: yard };
    const viaContenant = (contenant: UniteCanonique, contenu: UniteCanonique): number | null => {
      if (contenant !== 'roll' && contenant !== 'bag' && contenant !== 'box') return null;
      const c = contenance(texteLigne, contenant);
      if (!c) return null;
      if (c.unite === contenu) return c.n;
      if (PAR_PIECE[c.unite] && PAR_PIECE[contenu]) return (c.n * PAR_PIECE[c.unite]!) / PAR_PIECE[contenu]!;
      if (metres[c.unite] && metres[contenu]) return (c.n * metres[c.unite]!) / metres[contenu]!;
      return null;
    };
    let k: number | null = null;
    if (PAR_PIECE[f] && PAR_PIECE[a]) k = PAR_PIECE[f]! / PAR_PIECE[a]!;
    else if (metres[f] && metres[a]) k = metres[f]! / metres[a]!;
    else {
      const direct = viaContenant(f, a);
      const inverse = viaContenant(a, f);
      k = direct ?? (inverse ? 1 / inverse : null);
    }
    ajouter(k, nature);
  }
  ajouter(1, 'brute');
  return possibles;
}

const TOLERANCE_QUANTITE = 0.15;

/**
 * Choisit la lecture de la quantité : la même unité si c'est le cas ; sinon
 * celle qui retombe le plus près de la quantité de la fiche (la saisie a pu
 * recopier le chiffre de la facture) ; à défaut la conversion physique.
 * Plusieurs lignes d'un même article sont jugées sur leur somme.
 */
export function choisirConversion(lignes: LigneFacture[], article: any): Conversion | null {
  if (!lignes.length) return null;
  const unites = new Set(lignes.map(l => uniteCanonique(l.unite) === 'autre' ? String(l.unite).trim().toLowerCase() : uniteCanonique(l.unite)));
  if (unites.size > 1) return null;
  const texte = `${lignes.map(l => `${l.titre} ${l.spec}`).join(' ')} ${article?.specs || ''}`;
  const possibles = conversionsPossibles(lignes[0].unite, article?.unitOfMeasure || '', texte);
  if (possibles[0]?.nature === 'meme') return possibles[0];
  const qa = Number(article?.quantity) || 0;
  const qf = lignes.every(l => l.quantite != null) ? lignes.reduce((s, l) => s + (l.quantite || 0), 0) : null;
  const meilleure = (ecart: (c: Conversion) => number, tolerance: number) => {
    const classes = possibles.map(c => ({ c, e: ecart(c) })).sort((x, y) => x.e - y.e);
    return classes[0] && classes[0].e <= tolerance ? classes[0].c : null;
  };
  if (qf != null && qa > 0) {
    const c = meilleure(c => Math.abs(1 - (qf * c.facteur) / qa), TOLERANCE_QUANTITE);
    if (c) return c;
  }
  // Une ligne qui n'est qu'une part de l'article : c'est le prix qui tranche.
  const pa = Number(article?.purchasePricePerUnit) || 0;
  const pf = lignes.find(l => l.prixUnitaire != null)?.prixUnitaire;
  if (pf != null && pa > 0) {
    const c = meilleure(c => Math.abs(1 - pf / c.facteur / pa), 0.06);
    if (c) return c;
  }
  const repli = possibles.find(c => c.nature === 'exacte') ?? possibles.find(c => c.nature === 'usage') ?? null;
  // Yard réel ou yard compté comme un mètre : rien ne tranche, on le dit.
  const autres = possibles.filter(c => c !== repli && c.nature !== 'brute');
  return repli && autres.length ? { ...repli, ambigue: true } : repli;
}

// ── Lecture des libellés ─────────────────────────────────────────────────────

const MOTS_VIDES = new Set([
  'FOR', 'WITH', 'AND', 'THE', 'OF', 'IN', 'ON', 'TO', 'A', 'PCS', 'PC', 'BAG', 'BAGS', 'CARTON', 'CARTONS', 'CTN',
  'ROLL', 'ROLLS', 'PER', 'NEW', 'NORMAL', 'QUALITY', 'STANDARD', 'PACKS', 'PACK', 'SACKBAG', 'BOX',
]);

/** Met les deux vocabulaires (facture anglaise, fiche article) sur les mêmes mots. */
export function normaliser(s: string): string {
  return ` ${String(s || '').toUpperCase()} `
    .replace(/[’'`]/g, '')
    .replace(/SEMI[\s-]*AUTO(?:MATIC)?[\s-]*LOCK(?:ING)?/g, ' SEMIAL ')
    .replace(/SEMI[\s-]*A\s*\/\s*L/g, ' SEMIAL ')
    .replace(/AUTO[\s-]*LOCK(?:ING)?/g, ' A/L ')
    .replace(/NON[\s-]*LOCK(?:ING)?/g, ' N/L ')
    .replace(/PIN[\s-]*LOCK(?:ING)?/g, ' P/L ')
    .replace(/\b([ANP])\s*\/\s*L\b/g, ' $1/L ')
    .replace(/\bNO\.?\s*(\d{1,2})\b/g, ' NO$1 ')
    .replace(/\bALUMINUM\b/g, 'ALUMINIUM')
    .replace(/\bNYGUARD|NYGURADE\b/g, 'NYLON')
    .replace(/\bPOLYSTER\b/g, 'POLYESTER')
    .replace(/(\d)\s*#/g, '$1# ')
    .replace(/[-_,;()]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function mots(s: string): string[] {
  return normaliser(s)
    .split(' ')
    .map(m => m.replace(/^[.:]+|[.:]+$/g, ''))
    .filter(m => m && !MOTS_VIDES.has(m) && !/^\d+#$/.test(m));
}

type Traits = {
  verrou: 'SEMIAL' | 'A/L' | 'N/L' | 'P/L' | null;
  matiere: string | null;
  numero: string | null;
  largeursCm: number[];
  couleurs: string[];
  code: string | null;
};

const COULEURS = ['BLACK', 'WHITE', 'NICKEL', 'GOLD', 'SILVER', 'BEIGE', 'BRASS', 'GUNMETAL', 'RED', 'BLUE', 'GREEN', 'YELLOW', 'GREY', 'GRAY', 'NAVY', 'BROWN', 'PINK', 'ORANGE', 'PURPLE', 'TRANSPARENT'];
const RE_CODE_ARTICLE = /\b(\d{3,4}-\d{3,4})([A-Z]{0,2})\b/;

function traits(texteBrut: string): Traits {
  const n = normaliser(texteBrut);
  const verrou = / SEMIAL /.test(n) ? 'SEMIAL' : / A\/L /.test(n) ? 'A/L' : / N\/L /.test(n) ? 'N/L' : / P\/L /.test(n) ? 'P/L' : null;
  const matiere = n.match(/ FOR (?:\w+ )?(NYLON|PLASTIC|METAL|ALUMINIUM|RESIN|INVISIBLE)\b/)?.[1] ?? null;
  const numero = n.match(/ NO(\d{1,2}) /)?.[1] ?? null;
  // Dimensions, y compris en liste : « 25-30-40-45-50MM », « 2*38*12mm », « 36" ».
  const largeursCm: number[] = [];
  for (const m of texteBrut.matchAll(/((?:\d+(?:[.,]\d+)?\s*[-*x\/]\s*)*\d+(?:[.,]\d+)?)\s*(CM|MM|"|″|INCH)/gi)) {
    const u = m[2].toUpperCase();
    for (const brut of m[1].split(/\s*[-*x\/]\s*/i)) {
      const v = Number(brut.replace(',', '.'));
      if (!Number.isFinite(v) || v <= 0) continue;
      largeursCm.push(u === 'CM' ? v : u === 'MM' ? v / 10 : v * 2.54);
    }
  }
  const couleurs = COULEURS.filter(c => n.includes(` ${c} `));
  const code = texteBrut.toUpperCase().match(RE_CODE_ARTICLE)?.[0] ?? null;
  return { verrou, matiere, numero, largeursCm, couleurs, code };
}

// ── Articles ─────────────────────────────────────────────────────────────────

const CHAMPS_REPARTITION = [
  { champ: 'qualityBreakdown', qte: 'quantity' },
  { champ: 'designBreakdown', qte: 'rolls' },
  { champ: 'colorBreakdown', qte: 'rolls' },
  { champ: 'sizeBreakdown', qte: 'quantity' },
] as const;

/** La répartition qui porte la quantité (même ordre que la fiche article). */
export function repartition(a: any): { champ: string; qte: string; lignes: any[] } | null {
  for (const r of CHAMPS_REPARTITION) {
    const lignes = a?.[r.champ];
    if (Array.isArray(lignes) && lignes.length) return { champ: r.champ, qte: r.qte, lignes };
  }
  return null;
}

const statutEnBase = (a: any) => a?.rawStatus ?? a?.status;

const codeDans = (v: unknown) => String(v || '').toUpperCase().match(RE_CODE_ARTICLE)?.[0] ?? null;

/**
 * Le modèle choisi au catalogue (« 6570-5391 ») : `designRef`, ou la qualité qui
 * le recopie. Un indice, pas une preuve — le fournisseur livre parfois un autre
 * code pour le même modèle.
 */
function modeleArticle(a: any): string | null {
  return [a?.designRef, a?.quality, a?.qualityLabel].map(codeDans).find(Boolean) ?? null;
}

/**
 * Le code fournisseur relevé sur l'article : celui qu'un import précédent a
 * noté, ou un code tapé dans les specs (s'il n'est pas la simple copie du modèle).
 */
function codeArticle(a: any): string | null {
  const note = codeDans(a?.codeFournisseur);
  if (note) return note;
  const specs = codeDans(a?.specs);
  return specs && specs !== modeleArticle(a) ? specs : null;
}

const fournisseurDe = (x: { supplierId?: string }) => String(x?.supplierId || '').trim().toUpperCase();

/** Une commande en production (PI), pas encore dans un dossier : la seule qu'un packing list fait partir. */
const attendUnDossier = (a: any) => !a?.factureId && statutEnBase(a) === 'PI';

/**
 * Le fournisseur du dossier n'a aucun article en attente sous ce nom : le nom
 * est saisi à la main des deux côtés et peut différer (« MH » / « M.H »).
 */
export function fournisseurSansArticle(articles: any[], dossier: { supplierId?: string }): boolean {
  const f = fournisseurDe(dossier);
  return Boolean(f) && !articles.some(a => attendUnDossier(a) && fournisseurDe(a) === f);
}

/**
 * Articles qui peuvent recevoir une ligne : en attente d'un dossier chez ce
 * fournisseur, ou déjà dans ce dossier (ligne passée à la main). Avec
 * `elargir`, si le nom du fournisseur ne retrouve rien, tous les articles en
 * attente — pour le choix à la main seulement, jamais pour les propositions.
 */
export function articlesCandidats(articles: any[], dossier: { id: string; supplierId?: string }, elargir = false): any[] {
  const f = fournisseurDe(dossier);
  const tous = !f || (elargir && fournisseurSansArticle(articles, dossier));
  return articles.filter(a => a?.factureId === dossier.id || (attendUnDossier(a) && (tous || fournisseurDe(a) === f)));
}

// ── Score d'une paire ligne / article ────────────────────────────────────────

export type Evaluation = {
  articleId: string;
  score: number;
  /** Le score sans la comparaison des quantités : juge une ligne qui n'est qu'une part de l'article. */
  scoreSansQuantite: number;
  conversion: Conversion | null;
  /** Quantité de la ligne dans l'unité de l'article. */
  quantite: number | null;
  /** Prix de la ligne dans l'unité de l'article. */
  prix: number | null;
  raisons: string[];
  /**
   * Ce qui identifie l'article au-delà de la désignation : `code` relevé,
   * `modele` du catalogue, `prix` à 2 % près, `signature` (mêmes poids et
   * volume déjà dans le dossier). Sans preuve, jamais « sûr ».
   */
  preuves: ('code' | 'modele' | 'prix' | 'signature')[];
};

const ecartRelatif = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - b) / Math.abs(b));

/** Deux mots à une lettre près (ajout, oubli ou substitution). */
function presque(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || b.length < 5) return false;
  let i = 0;
  let j = 0;
  let ecarts = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ecarts > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1;
}

export function evaluer(ligne: LigneFacture, article: any, dossierId: string): Evaluation {
  const texteLigne = `${ligne.titre} ${ligne.spec}`;
  const tl = traits(`${texteLigne} ${ligne.code}`);
  const texteArticle = [article.name, article.categoryId !== article.name ? article.categoryId : '', article.size, article.specs].filter(Boolean).join(' ');
  const ta = traits(texteArticle);
  const raisons: string[] = [];
  const preuves: Evaluation['preuves'] = [];
  let score = 0;

  // Désignation : part des mots de la fiche retrouvés dans la ligne (une faute
  // de frappe près : « EMBRODERY » ↔ « EMBROIDERY »).
  const motsArticle = [...new Set(mots(article.name || article.categoryId || ''))];
  const motsLigne = mots(texteLigne);
  const ensembleLigne = new Set(motsLigne);
  if (motsArticle.length) {
    const communs = motsArticle.filter(m => ensembleLigne.has(m) || (m.length >= 6 && motsLigne.some(x => presque(m, x)))).length;
    score += (communs / motsArticle.length) * 30;
  }

  // Ce qui sépare deux curseurs : verrou, matière de la fermeture, numéro.
  if (ta.verrou && tl.verrou) {
    if (ta.verrou === tl.verrou) score += 10;
    else { score -= 40; raisons.push(`verrou ${tl.verrou} ≠ ${ta.verrou}`); }
  }
  if (ta.matiere && tl.matiere) {
    if (ta.matiere === tl.matiere) score += 15;
    else { score -= 40; raisons.push(`fermeture ${tl.matiere} ≠ ${ta.matiere}`); }
  }
  if (ta.numero && tl.numero) {
    if (ta.numero === tl.numero) score += 15;
    else { score -= 40; raisons.push(`No.${tl.numero} ≠ No.${ta.numero}`); }
  }
  // Largeur, longueur (90CM ↔ 36", 150CM, 2*38*12MM).
  if (ta.largeursCm.length && tl.largeursCm.length) {
    const proche = ta.largeursCm.some(x => tl.largeursCm.some(y => ecartRelatif(y, x) <= 0.04));
    if (proche) score += 12;
    else { score -= 20; raisons.push('dimension différente'); }
  }
  // Couleur : seulement si la fiche en a une précise.
  const couleursArticle = COULEURS.filter(c => normaliser(article.color || '').includes(` ${c} `));
  if (couleursArticle.length && tl.couleurs.length) {
    if (couleursArticle.every(c => tl.couleurs.includes(c))) score += 6;
    else if (!couleursArticle.some(c => tl.couleurs.includes(c))) { score -= 8; raisons.push('couleur différente'); }
  }
  // Code fournisseur relevé sur la fiche (« 6570-5391 » ↔ « 6570-5391A »).
  const sansSuffixe = (c: string) => c.replace(/[A-Z]+$/, '');
  const code = codeArticle(article);
  const modele = modeleArticle(article);
  if (code && ligne.code) {
    if (ligne.code === code) { score += 45; preuves.push('code'); }
    else if (ligne.code.startsWith(sansSuffixe(code))) { score += 30; preuves.push('code'); }
    else { score -= 30; raisons.push(`code ${ligne.code} ≠ ${code}`); }
  } else if (modele && ligne.code && sansSuffixe(ligne.code) === sansSuffixe(modele)) {
    // Le modèle du catalogue retrouvé sur la ligne ; s'il diffère, on ne pénalise pas.
    score += 20;
    preuves.push('modele');
  }

  // Quantité et prix, ramenés à l'unité de l'article.
  const conv = choisirConversion([ligne], article);
  let quantite: number | null = null;
  let prix: number | null = null;
  if (!conv && ligne.unite && article.unitOfMeasure) {
    score -= 15;
    raisons.push(`unité ${ligne.unite} ≠ ${article.unitOfMeasure}`);
  }
  if (conv) {
    if (ligne.quantite != null) quantite = ligne.quantite * conv.facteur;
    if (ligne.prixUnitaire != null) prix = ligne.prixUnitaire / conv.facteur;
    else if (ligne.montant != null && quantite) prix = ligne.montant / quantite;
  }
  // Passé à la main dans ce dossier mais sans poids ni volume : la ligne peut
  // porter plus que la fiche (une autre part du même article est restée en PI).
  const dansDossierSansPoids = article.factureId === dossierId
    && !(Number(article.netWeight) > 0) && !(Number(article.cubicMeasurement) > 0);
  const scoreAvantQuantite = score;
  const qteArticle = Number(article.quantity) || 0;
  if (quantite != null && qteArticle > 0) {
    const r = quantite / qteArticle;
    if (Math.abs(1 - r) <= 0.02) score += 20;
    else if (Math.abs(1 - r) <= 0.06) score += 14;
    else if (Math.abs(1 - r) <= 0.15) score += 6;
    else if (r > 1.15) { if (!dansDossierSansPoids) score -= 15; raisons.push('quantité supérieure à la commande'); }
    else if (r < 0.3) score -= 10;
  }
  const effetQuantite = score - scoreAvantQuantite;
  const prixArticle = Number(article.purchasePricePerUnit) || 0;
  if (prix != null && prixArticle > 0) {
    const e = ecartRelatif(prix, prixArticle);
    if (e <= 0.005) { score += 30; preuves.push('prix'); }
    else if (e <= 0.02) { score += 18; preuves.push('prix'); }
    else if (e <= 0.06) score += 5;
    else { score -= 20; raisons.push('prix différent'); }
  }

  // Déjà dans ce dossier avec les mêmes poids et volume (recopiés du packing
  // list) : c'est la ligne passée à la main. Presque une signature.
  if (article.factureId === dossierId) {
    const memePoids = ligne.poidsNet != null && Math.abs(ligne.poidsNet - (Number(article.netWeight) || 0)) <= 0.011;
    const memeVolume = ligne.volume != null && Math.abs(ligne.volume - (Number(article.cubicMeasurement) || 0)) <= 0.0051;
    if (memePoids && memeVolume) { score += 40; preuves.push('signature'); }
    else if (memePoids || memeVolume) score += 5;
    else if (dansDossierSansPoids) score += 10;
  }

  return {
    articleId: article.id,
    score: Math.round(score),
    scoreSansQuantite: Math.round(score - effetQuantite),
    conversion: conv,
    quantite,
    prix,
    raisons,
    preuves,
  };
}

// ── Propositions ─────────────────────────────────────────────────────────────

export type Confiance = 'sure' | 'probable' | 'a-verifier' | 'aucune';

export type Proposition = {
  index: number;
  articleId: string | null;
  confiance: Confiance;
  /** La ligne complète un article déjà proposé pour une autre ligne. */
  groupe: boolean;
  /** Meilleurs articles pour cette ligne, du plus probable au moins probable. */
  classement: Evaluation[];
};

const SEUIL = 45;

const SEUIL_GROUPE = 50;

/**
 * Propose un article par ligne, en deux passes.
 * 1. Une ligne par article : on attribue les paires les plus sûres d'abord,
 *    sur l'ensemble de la facture.
 * 2. Une ligne restée seule peut compléter un article déjà attribué — le même
 *    article facturé en plusieurs lignes (largeurs, couleurs, deux prix) —
 *    tant que la somme ne dépasse pas la commande.
 */
export function proposer(lecture: LectureFacture, candidats: any[], dossierId: string): Proposition[] {
  const parId = new Map(candidats.map(a => [a.id, a]));
  const evaluations = lecture.lignes.map(l =>
    candidats.map(a => evaluer(l, a, dossierId)).sort((x, y) => y.score - x.score),
  );
  const paires = evaluations
    .flatMap((evs, index) => evs.filter(e => e.score >= SEUIL).map(e => ({ index, e })))
    .sort((x, y) => y.e.score - x.e.score);
  const attribue = new Map<number, Evaluation>();
  const pris = new Set<string>();
  for (const { index, e } of paires) {
    if (attribue.has(index) || pris.has(e.articleId)) continue;
    attribue.set(index, e);
    pris.add(e.articleId);
  }

  const cumul = new Map<string, number>();
  for (const e of attribue.values()) cumul.set(e.articleId, (cumul.get(e.articleId) || 0) + (e.quantite ?? 0));
  const groupees = new Set<number>();
  lecture.lignes.forEach((_, index) => {
    if (attribue.has(index)) return;
    const e = evaluations[index]
      .filter(x => pris.has(x.articleId) && x.quantite != null && x.scoreSansQuantite >= SEUIL_GROUPE)
      .filter(x => {
        const qa = Number(parId.get(x.articleId)?.quantity) || 0;
        return qa > 0 && (cumul.get(x.articleId) || 0) + x.quantite! <= qa * 1.05;
      })
      .sort((x, y) => y.scoreSansQuantite - x.scoreSansQuantite)[0];
    if (!e) return;
    attribue.set(index, e);
    groupees.add(index);
    cumul.set(e.articleId, (cumul.get(e.articleId) || 0) + e.quantite!);
  });

  return lecture.lignes.map((l, index) => {
    const classement = evaluations[index].slice(0, 25);
    const choisi = attribue.get(index) || null;
    let confiance: Confiance = 'aucune';
    if (choisi && groupees.has(index)) {
      confiance = choisi.scoreSansQuantite >= 70 ? 'probable' : 'a-verifier';
    } else if (choisi) {
      const suivant = evaluations[index].find(e => e.articleId !== choisi.articleId);
      const marge = choisi.score - (suivant?.score ?? 0);
      // « Sûr » demande une preuve (code, modèle, prix, poids du dossier) et une
      // quantité qui colle — sinon la ligne annonce un fractionnement ou un surplus.
      const quantiteColle = choisi.score > choisi.scoreSansQuantite || choisi.preuves.includes('signature');
      confiance = choisi.score >= 80 && marge >= 15 && choisi.preuves.length > 0 && quantiteColle
        ? 'sure'
        : choisi.score >= 60 && marge >= 5 ? 'probable' : 'a-verifier';
    }
    return { index, articleId: choisi?.articleId ?? null, confiance, groupe: groupees.has(index), classement };
  });
}

// ── Plan de passage en transit ───────────────────────────────────────────────

export type ModePassage = 'solde' | 'partiel' | 'maj';

export type PlanArticle = {
  article: any;
  lignes: LigneFacture[];
  /** Quantité expédiée dans l'unité de l'article (null si on ne sait pas la convertir). */
  quantite: number | null;
  /** Poids net et volume des lignes ; null quand le document ne les donne pas. */
  poidsNet: number | null;
  volume: number | null;
  /** Prix de la facture dans l'unité de l'article. */
  prix: number | null;
  mode: ModePassage;
  /** Modes que l'utilisateur peut choisir pour cet article. */
  modesPossibles: ModePassage[];
  /** Ce qui reste en production si le passage est partiel. */
  reste: number;
  /** Les lignes couvrent la quantité de la fiche (±15 %). */
  couvre: boolean;
  /** La quantité de la fiche sera remplacée par celle de la facture. */
  majQuantite: boolean;
  /** Le poids net, le volume de la fiche seront remplacés par ceux du document. */
  majPoidsNet: boolean;
  majVolume: boolean;
  /**
   * Expédition partielle d'un article réparti en couleurs ou variantes : on ne
   * sait pas quelles lignes de la répartition partent. Hors de l'import tant
   * que l'utilisateur ne force pas le passage en entier.
   */
  bloque: boolean;
  /** Expédition partielle d'un article réparti : l'utilisateur peut forcer le passage en entier. */
  partielReparti: boolean;
  /** Le code de la ligne peut être noté sur la fiche (rapprochement sûr, probable ou choisi). */
  codeFiable: boolean;
  conversion: Conversion | null;
  avertissements: string[];
};

export type OptionsPlan = {
  appliquerPrix: boolean;
  /** Choix de l'utilisateur, par id d'article ; sinon le mode proposé. */
  modes?: Record<string, ModePassage>;
  /** Articles répartis que l'utilisateur fait passer en entier malgré une expédition partielle. */
  forces?: Record<string, boolean>;
  /** Index des lignes dont le rapprochement est sûr, probable ou choisi à la main. */
  fiables?: Set<number>;
};

const arrondi = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** En deçà, un écart de quantité n'est qu'un arrondi, pas une expédition partielle. */
const TOLERANCE_ARRONDI = 0.005;

/** Écart de quantité qu'une mise à jour d'un article déjà au dossier corrige seule. */
const TOLERANCE_MAJ = 0.02;

/**
 * Regroupe les lignes retenues par article et décide comment chacun passe :
 * - `maj` : l'article est déjà dans le dossier ; poids et volume corrigés si les
 *   lignes le couvrent, quantité seulement pour un petit écart (±2 %) ;
 * - `solde` : tout l'article part, la quantité devient celle de la facture ;
 * - `partiel` : la facture n'en porte qu'une partie, le reste reste en production.
 * Un poids ou un volume absent du document n'est jamais écrit (jamais 0 à la place).
 */
export function construirePlan(
  lecture: LectureFacture,
  choix: Record<number, string | null>,
  articles: any[],
  dossierId: string,
  options: OptionsPlan,
): { articles: PlanArticle[]; ignorees: LigneFacture[] } {
  const parId = new Map(articles.map(a => [a.id, a]));
  const groupes = new Map<string, LigneFacture[]>();
  const ignorees: LigneFacture[] = [];
  for (const l of lecture.lignes) {
    const id = choix[l.index];
    const a = id ? parId.get(id) : null;
    if (!a) { ignorees.push(l); continue; }
    groupes.set(a.id, [...(groupes.get(a.id) || []), l]);
  }

  const plan: PlanArticle[] = [];
  for (const [id, lignes] of groupes) {
    const a = parId.get(id)!;
    const u = a.unitOfMeasure || '';
    const avertissements: string[] = [];

    // Quantité, dans l'unité de la fiche.
    const conv = choisirConversion(lignes, a);
    let quantite: number | null = null;
    if (!conv) {
      avertissements.push(`Unité ${lignes[0].unite || '?'} de la facture impossible à ramener en ${u} : quantité inchangée.`);
    } else if (lignes.some(l => l.quantite == null)) {
      avertissements.push('Ligne sans quantité dans le document : quantité inchangée.');
    } else {
      quantite = arrondi(lignes.reduce((s, l) => s + l.quantite! * conv.facteur, 0), 3);
    }
    const ambigue = Boolean(conv?.ambigue);
    if (ambigue) {
      avertissements.push(`Unités : ${conv!.libelle} retenu, mais la fiche compte peut-être le yard comme un mètre. Quantité non modifiée, pas de fractionnement.`);
    }

    // Prix : le montant de la facture divisé par la quantité — sauf si le montant
    // ne retombe pas sur quantité × prix unitaire (document retouché ?).
    let montant = 0;
    let prixConnu = true;
    let montantDouteux = false;
    for (const l of lignes) {
      const calcule = l.prixUnitaire != null && l.quantite != null ? l.prixUnitaire * l.quantite : null;
      if (l.montant != null) {
        montant += l.montant;
        if (calcule != null && Math.abs(calcule - l.montant) > Math.max(0.05, Math.abs(l.montant) * 0.01)) montantDouteux = true;
      } else if (calcule != null) montant += calcule;
      else prixConnu = false;
    }
    let prix = prixConnu && quantite && !ambigue ? arrondi(montant / quantite, 6) : null;
    if (montantDouteux) {
      prix = null;
      avertissements.push('Sur la facture, montant ≠ quantité × prix unitaire : prix d’achat laissé tel quel.');
    }

    // Poids et volume : la somme des valeurs données ; null si aucune ligne n'en donne.
    const somme = (k: 'poidsNet' | 'volume', d: number) => {
      const connues = lignes.filter(l => l[k] != null);
      if (connues.length && connues.length < lignes.length) {
        avertissements.push(`${k === 'poidsNet' ? 'Poids net' : 'Volume'} absent sur ${lignes.length - connues.length} des lignes : total partiel.`);
      }
      return connues.length ? arrondi(connues.reduce((s, l) => s + l[k]!, 0), d) : null;
    };
    const poidsNet = somme('poidsNet', 2);
    const volume = somme('volume', 3);

    const qteArticle = Number(a.quantity) || 0;
    const rep = repartition(a);
    const plusieursLignes = Boolean(rep && rep.lignes.length > 1);
    // Un article resté « PI » avec le n° du dossier n'est pas encore passé : il passe.
    const dejaDansDossier = a.factureId === dossierId && !['PI', 'TO_ORDER'].includes(statutEnBase(a));
    const ecart = quantite != null && qteArticle > 0 ? Math.abs(1 - quantite / qteArticle) : Infinity;
    // Moins que la commande (au-delà d'un arrondi) : une partie seulement part. Un peu plus : tout part, avec le surplus.
    const sousLaCommande = !dejaDansDossier && quantite != null && quantite < qteArticle * (1 - TOLERANCE_ARRONDI);
    const couvre = ecart <= TOLERANCE_QUANTITE;

    let modesPossibles: ModePassage[];
    let propose: ModePassage;
    if (dejaDansDossier) {
      modesPossibles = ['maj'];
      propose = 'maj';
    } else if (sousLaCommande && !plusieursLignes && !ambigue) {
      // Le PL ne porte qu'une partie de la commande : le reste reste en production.
      modesPossibles = ['partiel', 'solde'];
      propose = 'partiel';
    } else {
      modesPossibles = ['solde'];
      propose = 'solde';
    }
    const voulu = options.modes?.[id];
    const mode = voulu && modesPossibles.includes(voulu) ? voulu : propose;

    // Expédition partielle qu'on ne sait pas découper : article réparti en
    // couleurs, ou unité ambiguë (yard réel ou compté comme un mètre).
    const partielAmbigu = sousLaCommande && ambigue && !plusieursLignes;
    const partielReparti = (sousLaCommande && plusieursLignes) || partielAmbigu;
    const bloque = partielReparti && !options.forces?.[id];
    if (partielAmbigu) {
      avertissements.push(bloque
        ? `Partiel avec une unité ambiguë (${quantite} sur ${qteArticle} ${u}) : passe-le avec « Expédier » dans Production, ou force le passage en entier.`
        : `Passé en entier malgré l'expédition partielle (${quantite} sur ${qteArticle} ${u}).`);
    } else if (partielReparti) {
      avertissements.push(bloque
        ? `Partiel sur un article réparti en ${rep!.lignes.length} ${rep!.champ === 'colorBreakdown' ? 'couleurs' : 'variantes'} (${quantite} sur ${qteArticle} ${u}) : passe-le avec « Expédier » dans Production pour le fractionner, ou force le passage en entier.`
        : `Passé en entier malgré l'expédition partielle (${quantite} sur ${qteArticle} ${u}).`);
    } else if (plusieursLignes && quantite != null && ecartRelatif(quantite, qteArticle) > 0.005) {
      avertissements.push(`Réparti en ${rep!.lignes.length} lignes (${rep!.champ === 'colorBreakdown' ? 'couleurs' : 'variantes'}) : quantité laissée à ${qteArticle}, à ajuster dans la fiche (facture : ${quantite}).`);
    }
    if (quantite != null && qteArticle > 0 && quantite > qteArticle * (1 + TOLERANCE_QUANTITE)) {
      avertissements.push(`Les lignes font ${quantite} ${u} pour une commande de ${qteArticle} : vérifie l'article choisi.`);
    }

    // Ce qu'on réécrit sur la fiche.
    let majQuantite = quantite != null && !plusieursLignes && !ambigue && ecartRelatif(quantite, qteArticle) > 1e-9;
    let majPoidsNet = poidsNet != null;
    let majVolume = volume != null;
    if (mode === 'maj') {
      if (majQuantite && ecart > TOLERANCE_MAJ) {
        majQuantite = false;
        avertissements.push(`Déjà au dossier : la facture dit ${quantite} ${u}, la fiche ${qteArticle}. Quantité non modifiée.`);
      }
      if (!couvre) {
        // Les lignes ne représentent pas tout l'article : on ne complète que ce qui manque.
        majPoidsNet = majPoidsNet && !(Number(a.netWeight) > 0);
        majVolume = majVolume && !(Number(a.cubicMeasurement) > 0);
        if (majPoidsNet || majVolume) avertissements.push('Déjà au dossier sans poids ou volume : complété avec ceux des lignes, qui ne correspondent pas à toute la fiche.');
      }
    }
    if (mode === 'partiel') majQuantite = true;
    if (poidsNet == null && mode !== 'maj') avertissements.push('Pas de poids net dans le document : celui de la fiche est gardé.');
    if (volume == null && mode !== 'maj') avertissements.push('Pas de volume dans le document : celui de la fiche est gardé.');

    plan.push({
      article: a,
      lignes,
      quantite,
      poidsNet,
      volume,
      prix,
      mode,
      modesPossibles,
      reste: mode === 'partiel' && quantite != null ? arrondi(qteArticle - quantite, 3) : 0,
      couvre,
      majQuantite,
      majPoidsNet,
      majVolume,
      bloque,
      partielReparti,
      codeFiable: !options.fiables || lignes.every(l => options.fiables!.has(l.index)),
      conversion: conv,
      avertissements,
    });
  }
  return { articles: plan, ignorees };
}

// ── Écritures ────────────────────────────────────────────────────────────────

export type Ecriture =
  | { op: 'update'; collection: 'articles' | 'factures'; id: string; data: Record<string, any> }
  | { op: 'set'; collection: 'articles'; id: string; data: Record<string, any> };

/** Champs ajoutés à l'affichage (statut calculé, dates du dossier) : jamais enregistrés. */
const CHAMPS_CALCULES = ['effectiveStatus', 'rawStatus', 'statutEnBase'];

function sansChampsCalcules(a: any): Record<string, any> {
  const copie: Record<string, any> = {};
  for (const [k, v] of Object.entries(a)) if (!CHAMPS_CALCULES.includes(k) && v !== undefined) copie[k] = v;
  return copie;
}

/**
 * La répartition après l'import : la quantité suit quand il n'y a qu'une ligne,
 * et les prix de ligne égaux à l'ancien prix d'achat suivent le nouveau.
 */
function repartitionMiseAJour(a: any, quantite: number | null, nouveauPrix: number | null): Record<string, any> {
  const rep = repartition(a);
  if (!rep) return {};
  let lignes = rep.lignes;
  let change = false;
  if (quantite != null && lignes.length === 1) {
    lignes = [{ ...lignes[0], [rep.qte]: quantite }];
    change = true;
  }
  if (nouveauPrix != null) {
    const ancien = Number(a.purchasePricePerUnit) || 0;
    lignes = lignes.map(l => {
      const po = l?.priceOverride;
      if (po == null || po === '' || Math.abs(Number(po) - ancien) > 1e-9) return l;
      change = true;
      return { ...l, priceOverride: typeof po === 'string' ? String(nouveauPrix) : nouveauPrix };
    });
  }
  return change ? { [rep.champ]: lignes } : {};
}

/** Une répartition d'une seule couleur : la couleur de la fiche est ce code (comme « Expédier »). */
function couleurNormalisee(a: any): Record<string, any> {
  const c = Array.isArray(a?.colorBreakdown) && a.colorBreakdown.length === 1 ? a.colorBreakdown[0]?.colorCode : null;
  return c && c !== a.color ? { color: c } : {};
}

export type ContexteEcritures = {
  dossier: { id: string; arrivalDate?: string };
  /** Horodatage serveur (serverTimestamp()) fourni par l'appelant. */
  maintenant: unknown;
  nouvelId: () => string;
  appliquerPrix: boolean;
  lecture: Pick<LectureFacture, 'numeroFacture' | 'numeroCommande' | 'dateFacture' | 'fret'>;
  nomFichier: string;
  majFret: boolean;
};

const refLignes = (lignes: LigneFacture[]) => [...new Set(lignes.map(l => [l.ref, l.code].filter(Boolean).join(' ')))].join(', ');

/**
 * Le prix d'achat change-t-il ? Seulement au prix de la facture, s'il diffère,
 * et jamais sur un article du dossier que les lignes ne couvrent pas en entier.
 */
export function changePrix(p: PlanArticle, appliquerPrix: boolean): boolean {
  // Un prix nul sur la facture : article offert, on garde celui de la commande.
  if (!appliquerPrix || p.bloque || p.prix == null || p.prix <= 0) return false;
  if (p.mode === 'maj' && !p.couvre) return false;
  const ecart = ecartRelatif(p.prix, Number(p.article.purchasePricePerUnit) || 0);
  // Après conversion d'unité (5,60 $/roll ÷ 90 = 0,062222 $/yd), la fiche garde
  // souvent un prix arrondi : un écart de moins de 0,5 % n'est pas un changement.
  if (p.conversion && p.conversion.facteur !== 1 && ecart <= 0.005) return false;
  return ecart > 1e-9;
}

/** Part d'une estimation (poids, volume) pour une partie de la quantité. */
const part = (valeur: unknown, qte: number, total: number, d: number) =>
  total > 0 ? arrondi((Number(valeur) || 0) * (qte / total), d) : 0;

export function ecritures(plan: PlanArticle[], ctx: ContexteEcritures): Ecriture[] {
  const ops: Ecriture[] = [];
  const arrivalDate = ctx.dossier.arrivalDate || '';
  const retenus = plan.filter(p => !p.bloque);

  for (const p of retenus) {
    const a = p.article;
    const code = p.lignes.map(l => l.code).find(Boolean);
    const traces: Record<string, any> = {
      refFactureFournisseur: refLignes(p.lignes),
      ...(code && p.codeFiable && !a.codeFournisseur ? { codeFournisseur: code } : {}),
    };
    const nouveauPrix = changePrix(p, ctx.appliquerPrix) ? p.prix : null;
    const prix = nouveauPrix != null ? { purchasePricePerUnit: nouveauPrix } : {};
    const quantite = p.majQuantite && p.quantite != null ? { quantity: p.quantite } : {};
    const repartitionNeuve = repartitionMiseAJour(a, p.majQuantite ? p.quantite : null, nouveauPrix);
    const poids = {
      ...(p.majPoidsNet ? { netWeight: p.poidsNet } : {}),
      ...(p.majVolume ? { cubicMeasurement: p.volume } : {}),
    };

    if (p.mode === 'maj') {
      const data: Record<string, any> = { ...traces, ...prix, ...quantite, ...repartitionNeuve };
      if (p.majPoidsNet && Number(a.netWeight) !== p.poidsNet) data.netWeight = p.poidsNet;
      if (p.majVolume && Number(a.cubicMeasurement) !== p.volume) data.cubicMeasurement = p.volume;
      ops.push({ op: 'update', collection: 'articles', id: a.id, data });
      continue;
    }

    const transit = {
      factureId: ctx.dossier.id,
      status: 'SHIPPED',
      arrivalDate,
      validatedAt: ctx.maintenant,
      ...couleurNormalisee(a),
    };

    if (p.mode === 'solde') {
      ops.push({ op: 'update', collection: 'articles', id: a.id, data: { ...transit, ...poids, ...traces, ...prix, ...quantite, ...repartitionNeuve } });
      continue;
    }

    // Partiel : la part expédiée devient un nouvel article du dossier ; l'original
    // garde le reste en production avec sa part des estimations poids / volume.
    const qte = p.quantite!;
    const qteArticle = Number(a.quantity) || 0;
    const reste = arrondi(qteArticle - qte, 3);
    const originalOrderId = a.originalOrderId || a.id;
    const id = ctx.nouvelId();
    ops.push({
      op: 'set',
      collection: 'articles',
      id,
      data: {
        ...sansChampsCalcules(a),
        id,
        originalOrderId,
        ...transit,
        netWeight: p.majPoidsNet ? p.poidsNet : part(a.netWeight, qte, qteArticle, 2),
        cubicMeasurement: p.majVolume ? p.volume : part(a.cubicMeasurement, qte, qteArticle, 3),
        ...traces,
        ...prix,
        quantity: qte,
        ...repartitionMiseAJour(a, qte, nouveauPrix),
      },
    });
    ops.push({
      op: 'update',
      collection: 'articles',
      id: a.id,
      data: {
        quantity: reste,
        originalOrderId,
        netWeight: part(a.netWeight, reste, qteArticle, 2),
        cubicMeasurement: part(a.cubicMeasurement, reste, qteArticle, 3),
        ...repartitionMiseAJour(a, reste, null),
        ...couleurNormalisee(a),
        // Le reste en production ne fait pas partie du dossier.
        ...(a.factureId === ctx.dossier.id ? { factureId: '' } : {}),
      },
    });
  }

  const connus = (k: 'poidsNet' | 'volume', d: number) =>
    arrondi(retenus.reduce((s, p) => s + (p[k] ?? 0), 0), d);
  const dossier: Record<string, any> = {
    importFactureFournisseur: {
      fichier: ctx.nomFichier,
      numeroFacture: ctx.lecture.numeroFacture || '',
      numeroCommande: ctx.lecture.numeroCommande || '',
      dateFacture: ctx.lecture.dateFacture || '',
      importeLe: ctx.maintenant,
      articles: retenus.length,
      poidsNet: connus('poidsNet', 2),
      volume: connus('volume', 3),
    },
    updatedAt: ctx.maintenant,
  };
  if (ctx.majFret && ctx.lecture.fret != null) dossier.freightCost = ctx.lecture.fret;
  ops.push({ op: 'update', collection: 'factures', id: ctx.dossier.id, data: dossier });
  return ops;
}
