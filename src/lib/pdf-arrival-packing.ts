import { addPdfLogoHeader } from './pdf-export';
import { getArticleFrenchName } from './product-name-utils';
import {
  qualiteDeLArticle, specificationsArticle, type LigneSpecification,
} from './specification-produit';
import {
  articleInboundVariants, articleVariantDimension, breakdownRowQuantity, compareLocationCodes, variantKey,
} from './warehouse-locations';
import {
  COLIS, colisage, colisageArticle, colisEnGrosTexte, colisageTexte, comptageTexte, echelleDeLArticle,
  manqueTexte,
  type Colisage, type ColisageArticle,
} from './conditionnement';

/**
 * Packing details d'un dossier d'arrivage, en français, pour les magasins et l'entrepôt.
 *
 * Document LOGISTIQUE : quantités, poids, volumes, ventilations et emplacements. Aucune donnée
 * financière n'y figure — ni prix d'achat, coût de revient, douane, fret ou montant de facture,
 * ni les `priceOverride` des lignes de ventilation.
 */

export interface ArrivalPackingParams {
  facture: any;
  articles: any[];
  categories?: any[];
  generalCategories?: any[];
  /** Mouvements d'entrée du dossier, pour indiquer les emplacements de rangement. */
  movements?: any[];
  stores?: any[];
  stockEntryDate?: string | null;
  isEnteredInStock?: boolean;
}

// Palette LEBTEX (identique au reste des exports)
const INK: [number, number, number] = [28, 25, 23];
const GOLD: [number, number, number] = [251, 191, 36];
const STONE_500: [number, number, number] = [120, 113, 108];
const STONE_200: [number, number, number] = [231, 229, 228];
const STONE_50: [number, number, number] = [250, 250, 249];
const EMERALD: [number, number, number] = [4, 120, 87];

/**
 * Les polices standard de jsPDF sont en WinAnsi : l'espace fine insécable que produit
 * toLocaleString('fr-FR') comme séparateur de milliers s'afficherait en caractère parasite.
 */
function pdfText(v: any): string {
  return String(v ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function nf(n: any, max = 3): string {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '0';
  return pdfText(v.toLocaleString('fr-FR', { maximumFractionDigits: max }));
}

// La quantite d'une ligne de ventilation se lit toujours par le meme chemin : `quantity`
// pour une qualite ou une taille, `rolls` pour une couleur ou un modele. Ce fichier avait sa
// propre copie, avec `??` au lieu de `||` : une couleur portant `quantity: 0` et `rolls: 120`
// valait zero, et comme les lignes a zero sont ecartees, elle DISPARAISSAIT du document.
const rowQty = (r: any) => breakdownRowQuantity(r);
const isVarious = (v: any) => String(v || '').toLowerCase() === 'various';

function frDate(d?: string | null): string {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d);
}

/** « 150CM », « 150 cm » et « 150cm » désignent la même mesure. */
function sameMeasure(a: any, b: any): boolean {
  const norm = (v: any) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
}

/**
 * Le conditionnement, dans les clés des six modèles : c'est ce que le magasinier compte carton
 * par carton. Il est rappelé sur chaque ligne de ventilation, qui doit se lire seule.
 */
const CLES_CONDITIONNEMENT = new Set([
  'packagingPerBag', 'pcsPerBag', 'bagsPerCarton',
  'rollsPerShrink', 'rollsPerCarton', 'pcsPerBox', 'boxPerCarton',
]);

/** « GSM 180 · Largeur (cm) 150 · Pcs/bag 20 » */
const enLigne = (lignes: LigneSpecification[]): string =>
  lignes.map(l => `${l.label} ${l.valeur}`).join(' · ');

/** Un libellé fixe de l'article : vide s'il est absent ou s'il vaut « various ». */
const fixe = (v: any): string => {
  const texte = String(v ?? '').trim();
  return !texte || isVarious(texte) ? '' : texte;
};

export async function exportArrivalPackingPDF(params: ArrivalPackingParams): Promise<void> {
  const {
    facture, articles = [], categories = [], generalCategories = [],
    movements = [], stores = [], stockEntryDate, isEnteredInStock,
  } = params;
  if (!facture) return;

  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // compress : flux de contenu compressés, pour un fichier léger à partager par WhatsApp/e-mail.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12; // marge

  const generatedAt = pdfText(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }));
  const storeName = (id?: string) => stores.find((s: any) => s.id === id)?.name || id || '';

  // ── Caractéristiques techniques, dans le modèle du type de l'article ─────
  // Fermeture, tissu, fil, curseur, ruban ou accessoire : chaque type a ses propres
  // caractéristiques, lues dans le modèle de sa famille. Une ligne de qualité porte les siennes,
  // qui priment — c'est précisément ce qui distingue deux qualités du même produit.
  const caracteristiques = (article: any, ligneQualite?: any, tailleAffichee?: any): LigneSpecification[] =>
    specificationsArticle(article, categories, generalCategories, ligneQualite).filter(l => {
      if (isVarious(l.valeur)) return false;                                  // marque interne, jamais imprimée
      if (l.cle === 'size') return !sameMeasure(tailleAffichee, l.valeur);    // déjà dans la colonne Taille
      if (l.cle === 'fabricWidth') return !sameMeasure(tailleAffichee, `${l.valeur}cm`); // « 150CM » = la largeur
      return true;
    });

  const specsTexte = (article: any, ligneQualite?: any, tailleAffichee?: any) =>
    enLigne(caracteristiques(article, ligneQualite, tailleAffichee));

  /** Le seul conditionnement de l'article : à rappeler sur ses lignes de couleur et de taille. */
  const conditionnementTexte = (article: any) =>
    enLigne(caracteristiques(article).filter(l => CLES_CONDITIONNEMENT.has(l.cle)));

  // ── Emplacements de rangement, par article puis par variante ─────────────
  // Même regroupement que la fiche dossier : la variante est lue dans le champ de la dimension
  // ventilée de l'article (qualité, couleur ou taille), jamais dans les autres, qui peuvent
  // valoir « various ». Le magasinier lit ainsi sur la ligne de chaque couleur où la ranger.
  type Spot = { code: string; storeId?: string; qty: number };
  type Placement = { label: string; spots: Map<string, Spot>; unplaced: number };
  const articleById = new Map<string, any>(articles.map((a: any) => [a.id, a]));
  const placedByArticle: Record<string, Map<string, Placement>> = {};
  /** Lieux où chaque article a été rangé ; un article absent n'a aucun emplacement. */
  const storesByArticle: Record<string, Set<string>> = {};
  const placementStores = new Set<string>();
  for (const m of movements) {
    if (m?.type !== 'IN' || !m.articleId) continue;
    const dimension = articleVariantDimension(articleById.get(m.articleId));
    const value = dimension ? String(m[dimension] ?? '').trim() : '';
    const key = dimension ? variantKey({ dimension, value }) : '';
    const byKey = (placedByArticle[m.articleId] ||= new Map());
    let p = byKey.get(key);
    if (!p) {
      p = { label: value, spots: new Map(), unplaced: 0 };
      byKey.set(key, p);
    }
    const qty = Number(m.quantity) || 0;
    if (!m.locationCode) {
      p.unplaced = Math.round((p.unplaced + qty) * 1000) / 1000;
      continue;
    }
    (storesByArticle[m.articleId] ||= new Set()).add(m.storeId || '');
    placementStores.add(m.storeId || '');
    const spot = p.spots.get(`${m.storeId}|${m.locationCode}`) || { code: m.locationCode, storeId: m.storeId, qty: 0 };
    spot.qty = Math.round((spot.qty + qty) * 1000) / 1000;
    p.spots.set(`${m.storeId}|${m.locationCode}`, spot);
  }

  // Le lieu de rangement n'est jamais répété à côté de chaque code, ce qui ferait déborder la
  // colonne Emplacement : un seul lieu pour tout le dossier (le cas courant) est donné dans
  // l'encadré RÉCEPTION ; sinon une fois en tête de chaque article. Il ne suit le code que pour
  // un article lui-même réparti sur plusieurs lieux.
  const multiStore = placementStores.size > 1;
  const onlyStore = placementStores.size === 1 ? storeName(Array.from(placementStores)[0]) : '';
  const storeOnSpot = (articleId: string) => (storesByArticle[articleId]?.size || 0) > 1;
  const spotLabel = (s: Spot, withStore: boolean) =>
    (withStore && s.storeId ? `${s.code} (${storeName(s.storeId)})` : s.code);
  const sortSpots = (spots: Iterable<Spot>) =>
    Array.from(spots).sort((a, b) => compareLocationCodes(a.code, b.code) || String(a.storeId).localeCompare(String(b.storeId)));

  /** Cellule Emplacement d'une variante : « A-02-01 : 60 / A-02-02 : 40 », ou le code seul. */
  const variantPlacementText = (p: Placement | undefined, withStore: boolean): string => {
    if (!p) return '';
    const spots = sortSpots(p.spots.values());
    if (spots.length === 0) return p.unplaced > 0 ? 'non rangé' : '';
    // Rangée d'un seul bloc : sa quantité est déjà dans la colonne Quantité de la ligne.
    const withQty = spots.length > 1 || p.unplaced > 0;
    const lines = spots.map(s => (withQty ? `${spotLabel(s, withStore)} : ${nf(s.qty)}` : spotLabel(s, withStore)));
    if (p.unplaced > 0) lines.push(`non rangé : ${nf(p.unplaced)}`);
    return lines.join('\n');
  };

  /** Au-delà, la cellule de l'article renvoie au détail de ses variantes, juste en dessous. */
  const MAX_SUMMARY_SPOTS = 3;

  /** Cellule Emplacement de la ligne article : tous ses emplacements, variantes confondues. */
  const articlePlacementText = (a: any): string => {
    if (!storesByArticle[a.id]) return '—';
    const merged = new Map<string, Spot>();
    for (const p of placedByArticle[a.id]?.values() || []) {
      for (const [k, s] of p.spots) {
        const hit = merged.get(k);
        if (hit) hit.qty = Math.round((hit.qty + s.qty) * 1000) / 1000;
        else merged.set(k, { ...s });
      }
    }
    const spots = sortSpots(merged.values());
    const withStore = storeOnSpot(a.id);
    const head = multiStore && !withStore ? [storeName(spots[0]?.storeId)].filter(Boolean) : [];
    if (articleVariantDimension(a) && spots.length > MAX_SUMMARY_SPOTS) {
      return [...head, `${spots.length} emplacements`, '(détail ci-dessous)'].join('\n');
    }
    return [...head, ...spots.map(s => `${spotLabel(s, withStore)} : ${nf(s.qty)}`)].join('\n');
  };

  // ── Totaux ───────────────────────────────────────────────────────────────
  const totalsByUnit: Record<string, { qty: number; refs: number }> = {};
  let totalCbm = 0;
  let totalNet = 0;
  for (const a of articles) {
    const unit = (a.unitOfMeasure || 'pcs').trim();
    totalsByUnit[unit] ||= { qty: 0, refs: 0 };
    totalsByUnit[unit].qty += Number(a.quantity) || 0;
    totalsByUnit[unit].refs += 1;
    totalCbm += Number(a.cubicMeasurement) || 0;
    totalNet += Number(a.netWeight) || 0;
  }

  // ── Colisage : ce que le magasinier va réellement décharger ──────────────
  // Le conditionnement est saisi dans les qualités depuis toujours, mais ce document le
  // recopiait en clair — « Pcs/bag 20 · Sacs/carton 10 » — en laissant la division au
  // magasinier, devant le camion. Il la fait maintenant, et il ne l'invente jamais : une
  // référence dont la chaîne est incomplète dit lequel de ses champs manque.
  const colisageDe = new Map<string, ColisageArticle>();
  for (const a of articles) colisageDe.set(a.id, colisageArticle(a, categories, generalCategories));

  const totalCartons = articles.reduce((s, a) => s + (colisageDe.get(a.id)?.cartons || 0), 0);
  const sansCartons = articles.filter(a => colisageDe.get(a.id)?.cartons == null);

  /**
   * Le mot juste pour le colis qu'on compte. Un dossier de mercerie se compte en cartons, un
   * dossier de tissu en rouleaux ou en sacs, un dossier mixte « en colis ».
   */
  const colisDuDossier = (() => {
    const cles = new Set(articles.map(a => colisageDe.get(a.id)?.colisEnGros?.cle).filter(Boolean));
    if (cles.size !== 1) return { un: 'colis', plusieurs: 'colis' };
    const colis = articles.map(a => colisageDe.get(a.id)?.colisEnGros).find(Boolean)!;
    return { un: colis.nom, plusieurs: colis.pluriel };
  })();
  const totalBarrettes = articles.reduce((s, a) => s + (colisageDe.get(a.id)?.barrettes || 0), 0);

  // ── Sur quoi se calcule la part de chaque référence ──────────────────────
  // Le carton d'abord : c'est la seule mesure qui parle à un magasinier, parce que c'est ce qui
  // occupe une étagère. À défaut, le volume, puis le poids. En dernier recours la quantité —
  // mais seulement si tout le dossier est dans la même unité, sinon on additionnerait des
  // mètres avec des pièces.
  //
  // Une base ne vaut que si TOUTES les références la portent. Le volume, en particulier, n'arrive
  // que sur certaines lignes de la facture fournisseur : s'en servir quand même donnerait 100 %
  // à la seule référence cubée et 0 % aux autres, qui partiraient toutes au fond de l'entrepôt.
  // Un zéro de donnée manquante n'est pas une part.
  const unites = Object.keys(totalsByUnit);
  const partout = (f: (a: any) => number) => articles.length > 0 && articles.every(a => f(a) > 0);
  const parCartons = (a: any) => colisageDe.get(a.id)?.cartons || 0;
  const parVolume = (a: any) => Number(a.cubicMeasurement) || 0;
  const parPoids = (a: any) => Number(a.netWeight) || 0;
  const parQuantite = (a: any) => Number(a.quantity) || 0;

  const candidats: { cle: string; mot: string; valeur: (a: any) => number; utilisable: boolean }[] = [
    { cle: 'cartons', mot: 'les cartons', valeur: parCartons, utilisable: sansCartons.length === 0 && totalCartons > 0 },
    { cle: 'volume', mot: 'le volume (m³)', valeur: parVolume, utilisable: partout(parVolume) },
    { cle: 'poids', mot: 'le poids net (kg)', valeur: parPoids, utilisable: partout(parPoids) },
    { cle: 'quantite', mot: unites.length === 1 ? `la quantité (${unites[0]})` : 'la quantité',
      valeur: parQuantite, utilisable: unites.length === 1 && partout(parQuantite) },
  ];
  const retenue = candidats.find(c => c.utilisable);
  // Aucune mesure commune à tout le dossier : on ne classe pas, et on dit pourquoi.
  const base = retenue || { cle: 'aucune', mot: 'aucune mesure commune', valeur: () => 0 };
  const baseFiable = Boolean(retenue);
  const totalBase = articles.reduce((s, a) => s + base.valeur(a), 0);
  const part = (a: any) => (totalBase > 0 ? base.valeur(a) / totalBase : 0);

  // ── Classement ABC ───────────────────────────────────────────────────────
  // La règle d'entrepôt : 20 % des références font 80 % du volume. Ce sont elles qu'on range
  // près de la sortie, parce qu'on y revient dix fois par jour. Le reste part au fond.
  const CLASSES: Record<string, { rang: string; ou: string; couleur: [number, number, number] }> = {
    A: { rang: 'A', ou: 'au plus près de la sortie', couleur: [4, 120, 87] },
    B: { rang: 'B', ou: 'allée centrale',            couleur: [180, 130, 20] },
    C: { rang: 'C', ou: 'en hauteur ou au fond',     couleur: [120, 113, 108] },
  };
  const classement = [...articles]
    .sort((x, y) => base.valeur(y) - base.valeur(x))
    .map(a => ({ article: a, part: part(a), cumul: 0, classe: 'C' }));
  let cumul = 0;
  for (const ligne of classement) {
    cumul += ligne.part;
    ligne.cumul = cumul;
    // La classe se décide sur le cumul ATTEINT par la référence : celle qui fait franchir les
    // 80 % en fait encore partie, sinon une référence à elle seule majoritaire serait classée B.
    ligne.classe = cumul - ligne.part < 0.8 ? 'A' : cumul - ligne.part < 0.95 ? 'B' : 'C';
  }
  const compteParClasse = (c: string) => classement.filter(l => l.classe === c).length;

  /**
   * Les colonnes de colis du document : une par niveau réellement présent dans le dossier.
   *
   * « Colisage » entassait tout dans une seule cellule — « 865 sacs · 14 barrettes / 3 460 rlx »
   * — et il fallait la relire pour en tirer un chiffre. Chaque colis a maintenant sa colonne, et
   * seuls les colis qui existent dans CE dossier en ont une : un dossier de tissu montre
   * Rouleaux et Sacs, un dossier de mercerie Sacs et Cartons, un dossier mixte les trois.
   */
  const colonnesColis: { cle: string; titre: string }[] = (() => {
    const ordre = ['rouleau', 'shrink', 'boite', 'sac', 'carton'];
    const presents = new Set<string>();
    for (const a of articles) {
      for (const c of colisageDe.get(a.id)?.comptages || []) {
        if (!c.depart) presents.add(c.colis.cle);
      }
    }
    const colonnes = ordre.filter(cle => presents.has(cle)).map(cle => ({
      cle,
      titre: COLIS[cle].pluriel.charAt(0).toUpperCase() + COLIS[cle].pluriel.slice(1),
    }));
    // Les barrettes ferment la marche : c'est ce qui se monte sur la palette, pas un contenant.
    if (totalBarrettes > 0) colonnes.push({ cle: 'barrette', titre: 'Barrettes' });
    return colonnes;
  })();

  /** Le compte d'un colis pour une ligne de ventilation, ou un tiret. */
  const compteDuColis = (c: Colisage | null, cle: string): string => {
    if (cle === 'barrette') return '—';   // une barrette se monte par référence, pas par couleur
    const trouve = c?.comptages.find(x => x.colis.cle === cle);
    if (!trouve) return '—';
    return trouve.reste > 0 ? `${nf(trouve.entiers, 0)}+1` : nf(trouve.entiers, 0);
  };

  // ── Regroupement par pôle ────────────────────────────────────────────────
  const poleOf = (a: any) => {
    const cat = categories.find((c: any) => c.name === a.categoryId || c.id === a.categoryId);
    const gcId = a.generalCategoryId || cat?.generalCategoryId;
    const gc = generalCategories.find((g: any) => g.id === gcId);
    return (gc?.nameFR || gc?.name || 'Autres articles').toUpperCase();
  };

  const groups = new Map<string, any[]>();
  for (const a of articles) {
    const pole = poleOf(a);
    if (!groups.has(pole)) groups.set(pole, []);
    groups.get(pole)!.push(a);
  }
  const poles = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'fr'));

  // ── En-tête de page ──────────────────────────────────────────────────────
  const drawPageHeader = async () => {
    doc.setFillColor(...INK);
    doc.rect(0, 0, pageW, 24, 'F');
    await addPdfLogoHeader(doc, M - 2, 3, 34, 17, true);

    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PACKING DETAILS', 50, 11);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(pdfText(`Dossier d'arrivage N° ${facture.id}`), 50, 17.5);

    doc.setFontSize(8);
    doc.setTextColor(214, 211, 209);
    doc.text(pdfText(`Édité le ${generatedAt}`), pageW - M, 11, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(isEnteredInStock ? [110, 231, 183] as [number, number, number] : GOLD));
    doc.text(isEnteredInStock ? 'ENTRÉ EN STOCK' : 'EN ATTENTE DE RÉCEPTION', pageW - M, 17.5, { align: 'right' });
  };

  await drawPageHeader();

  // ── Bloc d'informations ──────────────────────────────────────────────────
  let y = 31;
  /** Un titre de section, souligné d'un filet doré — la charte des documents LEBTEX. */
  const titreSection = (yy: number, texte: string, sous?: string): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(pdfText(texte), M, yy);
    const largeur = doc.getTextWidth(pdfText(texte));
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.line(M, yy + 1.6, M + largeur, yy + 1.6);
    doc.setLineWidth(0.2);
    if (sous) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...STONE_500);
      doc.text(pdfText(sous), M + largeur + 5, yy);
    }
    return yy + 6;
  };

  /**
   * Ce qui arrive, et où le poser.
   *
   * Le document ne disait que « quoi » et « combien ». Un gestionnaire de stock a besoin de deux
   * choses de plus avant d'ouvrir la porte du conteneur : la part que pèse chaque pôle, pour
   * savoir où il va manquer de place, et lesquelles des références il verra passer tous les
   * jours — celles-là se rangent près de la sortie, pas au fond.
   */
  const blocStrategie = async (yDepart: number): Promise<number> => {
    let yb = yDepart;

    // ── Répartition par pôle ──
    yb = titreSection(yb, 'CE QUI ARRIVE', baseFiable
      ? `part calculée sur ${base.mot}`
      : "part non calculée : aucune mesure n'est renseignée sur toutes les références");

    const lignesPole = poles.map(pole => {
      const list = groups.get(pole)!;
      const qtes: Record<string, number> = {};
      for (const a of list) qtes[(a.unitOfMeasure || 'pcs').trim()] = (qtes[(a.unitOfMeasure || 'pcs').trim()] || 0) + (Number(a.quantity) || 0);
      const cartons = list.reduce((s, a) => s + (colisageDe.get(a.id)?.cartons || 0), 0);
      const incomplets = list.filter(a => colisageDe.get(a.id)?.cartons == null).length;
      const barrettes = list.reduce((s, a) => s + (colisageDe.get(a.id)?.barrettes || 0), 0);
      const p = list.reduce((s, a) => s + part(a), 0);
      return { pole, list, qtes, cartons, incomplets, barrettes, p };
    }).sort((a, b) => b.p - a.p);

    autoTable(doc, {
      startY: yb,
      margin: { left: M, right: M, top: 30, bottom: 16 },
      head: [['Pôle', 'Réf.', 'Quantités', 'Colis', 'Barrettes', 'Part', '']],
      body: lignesPole.map(l => [
        pdfText(l.pole),
        String(l.list.length),
        pdfText(Object.entries(l.qtes).map(([u, q]) => `${nf(q)} ${u}`).join(' + ')),
        l.cartons > 0
          ? pdfText(`${nf(l.cartons, 0)}${l.incomplets > 0 ? ` (+${l.incomplets} réf.)` : ''}`)
          : (l.incomplets > 0 ? 'à préciser' : '—'),
        l.barrettes > 0 ? nf(l.barrettes, 0) : '—',
        baseFiable ? `${(l.p * 100).toFixed(1).replace('.', ',')} %` : '—',
        { content: '', styles: { cellPadding: 0 } },
      ]),
      foot: [[
        'TOTAL', String(articles.length),
        pdfText(Object.entries(totalsByUnit).map(([u, t]) => `${nf(t.qty)} ${u}`).join(' + ')),
        totalCartons > 0 ? nf(totalCartons, 0) : '—',
        totalBarrettes > 0 ? nf(totalBarrettes, 0) : '—',
        baseFiable ? '100 %' : '—', '',
      ]],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: INK, lineColor: STONE_200, lineWidth: 0.2 },
      headStyles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: STONE_50, textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: 'bold' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 52, halign: 'right' },
        3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 'auto' },
      },
      // La barre de part : un pôle qui prend la moitié du conteneur se voit d'un coup d'œil,
      // sans lire les chiffres.
      didDrawCell: (data: any) => {
        if (data.section !== 'body' || data.column.index !== 6 || !baseFiable) return;
        const l = lignesPole[data.row.index];
        if (!l) return;
        const larg = Math.max(0.6, (data.cell.width - 6) * Math.min(1, l.p));
        doc.setFillColor(...GOLD);
        doc.rect(data.cell.x + 3, data.cell.y + data.cell.height / 2 - 1.6, larg, 3.2, 'F');
      },
    });
    yb = (doc as any).lastAutoTable.finalY + 7;

    // ── Classement ABC ──
    // En dessous de cinq références, la règle des 80/20 ne dit plus rien : on ne l'imprime pas.
    if (articles.length < 5 || !baseFiable || totalBase <= 0) return yb;

    if (yb > pageH - 55) { doc.addPage(); yb = 30; }
    yb = titreSection(yb, 'OÙ LES POSER — CLASSEMENT ABC',
      `A : ${compteParClasse('A')} réf. = 80 % de l'arrivage  ·  B : ${compteParClasse('B')}  ·  C : ${compteParClasse('C')}`);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...STONE_500);
    doc.text(pdfText(
      "Les références A sont celles qu'on manipule le plus : elles se rangent au plus près de la sortie. "
      + 'Les C dorment au fond ou en hauteur.'), M, yb);
    yb += 5;

    autoTable(doc, {
      startY: yb,
      margin: { left: M, right: M, top: 30, bottom: 16 },
      head: [['Classe', 'Désignation', 'Pôle', 'Quantité', 'Colis', 'Part', 'Cumul', 'Où la poser']],
      body: classement.map(l => [
        { content: l.classe, styles: { halign: 'center', fontStyle: 'bold', textColor: CLASSES[l.classe].couleur } },
        pdfText(getArticleFrenchName(l.article, categories, generalCategories)),
        pdfText(poleOf(l.article)),
        pdfText(`${nf(l.article.quantity)} ${l.article.unitOfMeasure || 'pcs'}`),
        colisageDe.get(l.article.id)?.cartons != null ? nf(colisageDe.get(l.article.id)!.cartons!, 0) : '—',
        `${(l.part * 100).toFixed(1).replace('.', ',')} %`,
        `${(l.cumul * 100).toFixed(0)} %`,
        pdfText(CLASSES[l.classe].ou),
      ]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, textColor: INK, lineColor: STONE_200, lineWidth: 0.2 },
      headStyles: { fillColor: [68, 64, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 64, fontStyle: 'bold' },
        2: { cellWidth: 40 },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 16, halign: 'right', textColor: STONE_500 },
        7: { cellWidth: 'auto' },
      },
      // Le trait de séparation entre A, B et C : c'est lui qu'on suit des yeux pour savoir où
      // s'arrête ce qui va près de la porte.
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        const l = classement[data.row.index];
        const precedent = classement[data.row.index - 1];
        if (l && precedent && l.classe !== precedent.classe) {
          data.cell.styles.lineWidth = { top: 0.8, right: 0.2, bottom: 0.2, left: 0.2 } as any;
          data.cell.styles.lineColor = GOLD;
        }
      },
    });
    return (doc as any).lastAutoTable.finalY + 7;
  };

  // Les encadres EXPEDITION / RECEPTION / CONTENU ont ete retires : trente-neuf millimetres de
  // haut pour des informations que le magasinier ne lit pas devant un camion. Ce qui identifie
  // le dossier — le fournisseur, le BL, la date d'arrivee, le lieu de rangement — tient sur une
  // ligne sous le bandeau, et ne se perd donc pas.
  const identite = [
    facture.supplierId || facture.supplier,
    facture.noBL ? `BL ${facture.noBL}` : null,
    facture.arrivalDate ? `arrivé le ${frDate(facture.arrivalDate)}` : null,
    onlyStore ? `rangé à ${onlyStore}` : null,
  ].filter(Boolean).join('   ·   ');
  if (identite) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...STONE_500);
    doc.text(pdfText(identite), M, y + 2);
  }

  y += identite ? 8 : 2;

  // ── Ce qui arrive, et où le poser ────────────────────────────────────────
  y = await blocStrategie(y);

  // ── Tableau principal, groupé par pôle ───────────────────────────────────
  type Cell = string | { content: string; colSpan?: number; styles?: any };
  const body: Cell[][] = [];
  let lineNo = 0;

  const SUB = { textColor: STONE_500, fontStyle: 'normal', fontSize: 7.5 };

  for (const pole of poles) {
    const list = groups.get(pole)!.sort((a, b) =>
      getArticleFrenchName(a, categories, generalCategories).localeCompare(getArticleFrenchName(b, categories, generalCategories), 'fr'));

    body.push([{
      content: `${pole}  ·  ${list.length} référence${list.length > 1 ? 's' : ''}`,
      colSpan: 8 + colonnesColis.length,
      styles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 } },
    }]);

    for (const a of list) {
      lineNo++;
      const unit = a.unitOfMeasure || 'pcs';
      const frName = pdfText(getArticleFrenchName(a, categories, generalCategories));
      const internal = pdfText(a.name || a.categoryId || '');
      const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.filter((r: any) => rowQty(r) > 0) : [];
      const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.filter((r: any) => rowQty(r) > 0) : [];
      const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.filter((r: any) => rowQty(r) > 0) : [];

      // Ligne de ventilation → clé de sa variante, pour retrouver ses emplacements. Seule la
      // dimension ventilée de l'article en a ; les autres ventilations restent descriptives.
      const placements = storesByArticle[a.id] ? placedByArticle[a.id] : undefined;
      const withStore = storeOnSpot(a.id);
      const variantKeyOfRow = new Map<any, string>();
      for (const line of articleInboundVariants(a)) if (line.row) variantKeyOfRow.set(line.row, line.key);
      const placementOf = (r: any) =>
        placements && variantKeyOfRow.has(r) ? variantPlacementText(placements.get(variantKeyOfRow.get(r)!), withStore) : '';

      // Les libellés fixes de l'article : ils se répètent sur chaque ligne de ventilation, qui
      // doit se lire seule, carton en main.
      const qualiteFixe = qualiteDeLArticle(a) || '';
      const couleurFixe = fixe(a.color);
      const tailleFixe = fixe(a.size);
      const conditionnement = conditionnementTexte(a);

      // Le colisage : ce que la quantité fait réellement en sacs, cartons et barrettes. Quand la
      // chaîne est incomplète, la cellule dit quel champ saisir — jamais un chiffre inventé.
      const colisageCellule = (c: Colisage, barrettes = true): string =>
        colisageTexte(c, true, barrettes) || manqueTexte(c) || '—';
      // La ligne de l'article : le comptage de la reference entiere, celui-la meme que reprend
      // la feuille de controle. Prendre ici le colisage de la quantite totale ferait figurer
      // deux nombres de cartons differents pour le meme article sur la meme page.
      /**
       * Le compte d'un colis pour la référence entière, ventilations comprises. C'est ce chiffre
       * qu'on pointe : le même que sur la feuille de contrôle.
       */
      const celluleColis = (ca: ColisageArticle, cle: string): string => {
        if (cle === 'barrette') return ca.barrettes ? nf(ca.barrettes, 0) : '—';
        const trouve = ca.comptages.find(x => x.colis.cle === cle);
        if (!trouve) return '—';
        return nf(trouve.aCompter, 0);
      };

      const celluleArticle = (ca: ColisageArticle): string => {
        const lignes = [colisEnGrosTexte(ca) || ca.manque || '—'];
        // Le detail de ce qu'il y a DEDANS, en second : le sachet est l'interieur du carton, pas
        // un colis qu'on porte. Il se lit carton en main, il ne se compte pas au dechargement.
        const dedans = ca.comptages
          .filter(x => !x.depart && x.colis.cle !== ca.colisEnGros?.cle)
          .map(x => comptageTexte(x, true));
        if (dedans.length > 0) lignes.push(dedans.join(' · '));
        // Une ventilation qui ne retombe pas sur la quantité annoncée : le calcul revient au
        // total de l'article, et le papier le dit. Sans cette ligne, le magasinier compterait
        // des cartons sans comprendre pourquoi ils ne correspondent pas à la ventilation.
        if (ca.ventilationEcartee) {
          lignes.push(`ventilation à revoir (${nf(ca.ventilationEcartee.ventile)} ventilés)`);
        }
        return lignes.join('\n');
      };
      const colisageLigne = (r: any, q: number) =>
        colisage(q, echelleDeLArticle(a, categories, generalCategories, r));

      body.push([
        { content: String(lineNo), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: frName + (internal && internal.toLowerCase() !== frName.toLowerCase() ? `\n${internal}` : ''), styles: { fontStyle: 'bold' } },
        qualities.length > 0 ? `${qualities.length} qualités` : pdfText(qualiteFixe || '—'),
        colors.length > 0 ? `${colors.length} couleurs` : pdfText(couleurFixe || '—'),
        sizes.length > 0 ? `${sizes.length} tailles` : pdfText(tailleFixe || '—'),
        pdfText(specsTexte(a, undefined, sizes.length > 0 ? '' : tailleFixe) || '—'),
        {
          // Sous la quantité : ce qui empêche de compter les colis, et l'écart d'une ventilation
          // qui ne retombe pas juste. Les colonnes de colis restent des chiffres, rien d'autre.
          content: pdfText([
            `${nf(a.quantity)} ${unit}`,
            colisageDe.get(a.id)?.manque || null,
            colisageDe.get(a.id)?.ventilationEcartee
              ? `ventilation à revoir (${nf(colisageDe.get(a.id)!.ventilationEcartee!.ventile)} ventilés)`
              : null,
          ].filter(Boolean).join('\n')),
          styles: { halign: 'right', fontStyle: 'bold', textColor: EMERALD },
        },
        ...colonnesColis.map(col => ({
          content: pdfText(celluleColis(colisageDe.get(a.id)!, col.cle)),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const },
        })),
        pdfText(articlePlacementText(a)),
      ]);

      // Sous-lignes de ventilation : une ligne par qualité, couleur ou taille. Chacune rappelle
      // son article, pour rester lisible quand la ventilation déborde sur la page suivante.
      const parentLabel = `› ${frName}`;
      const SUBROW = { ...SUB, fillColor: STONE_50 };
      const subRow = (q: string, c: string, s: string, specs: string, qty: number, place = '', ligne?: any): Cell[] => [
        { content: String(lineNo), styles: { ...SUBROW, halign: 'center' } },
        { content: parentLabel, styles: { ...SUBROW, fontSize: 7 } },
        { content: pdfText(q), styles: SUBROW },
        { content: pdfText(c), styles: { ...SUBROW, textColor: INK } },
        { content: pdfText(s), styles: SUBROW },
        { content: pdfText(specs), styles: { ...SUBROW, fontSize: 7 } },
        { content: pdfText(`${nf(qty)} ${unit}`), styles: { ...SUBROW, halign: 'right', textColor: INK } },
        ...colonnesColis.map(col => ({
          content: pdfText(compteDuColis(colisageLigne(ligne, qty), col.cle)),
          styles: { ...SUBROW, halign: 'right' as const, textColor: INK },
        })),
        { content: pdfText(place), styles: { ...SUBROW, textColor: INK, fontStyle: 'bold' } },
      ];

      // Chaque qualité porte ses propres caractéristiques : elles remplacent celles de l'article.
      for (const r of qualities) {
        const taille = fixe(r.size) || tailleFixe;
        body.push(subRow(
          r.nameFR || qualiteDeLArticle(a, r) || '—', couleurFixe, taille,
          specsTexte(a, r, taille), rowQty(r), placementOf(r), r,
        ));
      }
      // Couleurs et tailles partagent les caractéristiques de l'article : on rappelle le
      // conditionnement, qui est ce que le magasinier compte devant le carton.
      for (const r of colors) {
        const label = r.colorCode || r.color || '—';
        body.push(subRow(
          qualiteFixe, r.description && r.description !== label ? `${label} — ${r.description}` : label,
          tailleFixe, conditionnement, rowQty(r), placementOf(r),
        ));
      }
      for (const r of sizes) {
        body.push(subRow(
          qualiteFixe, couleurFixe, r.description ? `${r.size} — ${r.description}` : (r.size || '—'),
          conditionnement, rowQty(r), placementOf(r),
        ));
      }

      // Variantes entrées en stock sous un libellé que la ventilation ne porte plus (retouchée
      // depuis l'entrée) : on les liste quand même, pour qu'aucun emplacement ne disparaisse.
      if (placements) {
        const knownKeys = new Set(variantKeyOfRow.values());
        const dimension = articleVariantDimension(a);
        for (const [key, p] of placements) {
          if (!dimension || knownKeys.has(key)) continue;
          const qty = Array.from(p.spots.values()).reduce((s, x) => s + x.qty, 0) + p.unplaced;
          const label = p.label || '—';
          body.push(subRow(
            dimension === 'quality' ? label : qualiteFixe,
            dimension === 'color' ? label : couleurFixe,
            dimension === 'size' ? label : tailleFixe,
            ['hors ventilation', conditionnement].filter(Boolean).join(' · '),
            qty, variantPlacementText(p, withStore),
          ));
        }
      }
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 30, bottom: 16 },
    head: [[
      'N°', 'Désignation', 'Qualité', 'Couleur', 'Taille', 'Caractéristiques',
      'Quantité', ...colonnesColis.map(c => c.titre), 'Emplacement',
    ]],
    body: body as any,
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: INK,
      lineColor: STONE_200, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [68, 64, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5,
      halign: 'center', valign: 'middle',
    },
    // La colonne Emplacement garde ses ~30 mm : « A-02-01 : 1 234 » y tient sur une ligne, ligne
    // de variante comprise. L'unité a rejoint la quantité — « 12 000 m » se lit mieux en un seul
    // bloc — et les 13 mm libérés vont au Colisage, qui en réclame le double : « 120 rlx · 30
    // sacs · 3 ctn » est ce que le magasinier compte vraiment. Les caractéristiques cèdent le
    // reste : le conditionnement brut qu'elles répétaient est désormais calculé à côté.
    columnStyles: (() => {
      // Le poids et le volume ont ete retires : personne ne les lit devant un camion, et ils
      // prenaient la place de ce qu'on compte vraiment. Chaque colis a desormais SA colonne, de
      // dix-huit millimetres — « 3 460 » y tient large — et ce qui reste va a la designation,
      // aux caracteristiques et a l'emplacement.
      const largeurs: Record<number, any> = {
        0: { cellWidth: 8 },
        1: { cellWidth: 42 },
        2: { cellWidth: 19 },
        3: { cellWidth: 23 },
        4: { cellWidth: 14 },
        5: { cellWidth: 42, fontSize: 7 },
        6: { cellWidth: 23 },
      };
      // Seize millimetres par colis : « 3 460 » y tient. Un dossier melangeant tissu et mercerie
      // en aligne cinq — rouleaux, boites, sacs, cartons, barrettes — et tout doit tenir dans
      // les 273 mm utiles d'un A4 paysage.
      colonnesColis.forEach((_, i) => { largeurs[7 + i] = { cellWidth: 16 }; });
      largeurs[7 + colonnesColis.length] = { cellWidth: 'auto' };
      return largeurs;
    })(),
    // Recopier l'en-tête sombre sur chaque nouvelle page
    willDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...INK);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setTextColor(...GOLD);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('PACKING DETAILS', M, 10);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(pdfText(`Dossier N° ${facture.id} — ${facture.supplierId || ''} — suite`), M, 16);
      }
    },
  });

  // ── Contrôle en cartons ───────────────────────────────────────────────────
  // Le document finissait sur quatre traits à signer. Or ce qu'on contrôle devant un camion,
  // ce n'est pas une quantité — personne ne compte 48 000 fermetures — c'est un nombre de
  // cartons. La feuille les annonce donc référence par référence, avec la case pour écrire ce
  // qu'on a réellement compté et l'écart en face.
  let afterY = (doc as any).lastAutoTable.finalY + 8;
  const aControler = articles
    .map(a => ({ a, cartons: colisageDe.get(a.id)?.cartons ?? null }))
    .sort((x, y) => (y.cartons || 0) - (x.cartons || 0));

  if (afterY > pageH - 70) { doc.addPage(); afterY = 30; }
  afterY = titreSection(afterY, 'CONTRÔLE À LA RÉCEPTION',
    totalCartons > 0
      ? `${nf(totalCartons, 0)} ${colisDuDossier.plusieurs} annoncé(s)${sansCartons.length > 0 ? ` · ${sansCartons.length} référence(s) sans conditionnement saisi` : ''}`
      : 'aucun conditionnement saisi : le contrôle se fait en quantités');

  autoTable(doc, {
    startY: afterY,
    margin: { left: M, right: M, top: 30, bottom: 16 },
    head: [['Réf.', 'Désignation', 'Quantité annoncée', 'Colis annoncés', 'Colis comptés', 'Écart', 'Visa']],
    body: aControler.map(({ a, cartons }, i) => [
      { content: String(i + 1), styles: { halign: 'center' } },
      pdfText(getArticleFrenchName(a, categories, generalCategories)),
      pdfText(`${nf(a.quantity)} ${a.unitOfMeasure || 'pcs'}`),
      cartons != null
        ? { content: nf(cartons, 0), styles: { halign: 'right', fontStyle: 'bold' } }
        : { content: pdfText(colisageDe.get(a.id)!.manque || 'à préciser'), styles: { halign: 'right', fontSize: 6.5, textColor: STONE_500 } },
      '', '', '',
    ]),
    foot: [[
      '', 'TOTAL', '',
      { content: totalCartons > 0 ? nf(totalCartons, 0) : '—', styles: { halign: 'right' } },
      '', '', '',
    ]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, textColor: INK, lineColor: STONE_200, lineWidth: 0.2, minCellHeight: 8 },
    headStyles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold', fontSize: 7.5, halign: 'center', minCellHeight: 7 },
    footStyles: { fillColor: STONE_50, textColor: INK, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 28 },
      // Les trois dernières restent vides : c'est le magasinier qui les remplit, au stylo.
      4: { cellWidth: 30, fillColor: [250, 250, 249] },
      5: { cellWidth: 22, fillColor: [250, 250, 249] },
      6: { cellWidth: 22, fillColor: [250, 250, 249] },
    },
  });

  // ── Qui a réceptionné ─────────────────────────────────────────────────────
  let signY = (doc as any).lastAutoTable.finalY + 7;
  if (signY > pageH - 36) { doc.addPage(); signY = 30; }
  const fields = ['Réceptionné par', 'Contrôlé par', 'Date et heure', 'Signature'];
  const fw = (pageW - M * 2) / 4;
  fields.forEach((label, i) => {
    const fx = M + i * fw;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...STONE_500);
    doc.text(pdfText(label), fx, signY);
    doc.setDrawColor(...STONE_200);
    doc.line(fx, signY + 6, fx + fw - 8, signY + 6);
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...STONE_500);
  doc.text('Observations / écarts constatés', M, signY + 15);
  doc.line(M, signY + 20, pageW - M, signY + 20);

  // ── Pied de page ─────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...STONE_200);
    doc.line(M, pageH - 10, pageW - M, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...STONE_500);
    doc.text(
      pdfText(`LEBTEX — Packing details du dossier ${facture.id} — Document logistique, quantités uniquement, sans valeur commerciale`),
      M, pageH - 5.5,
    );
    doc.text(`Page ${i} / ${pages}`, pageW - M, pageH - 5.5, { align: 'right' });
  }

  const safeId = String(facture.id).replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`Packing_Details_${safeId}.pdf`);
}
