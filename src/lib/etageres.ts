/**
 * Les étagères de CHRIFA (décisions du patron, 01/10/2026).
 *
 * Le magasin principal a DEUX stocks :
 *  - sa RÉSERVE : le magasin et tous ses entrepôts, comptée couleur par couleur, dans l'unité de
 *    la réserve (souvent l'unité d'achat : sacs, rouleaux, pièces…) ;
 *  - ses ÉTAGÈRES : le « détail », d'où l'on vend à l'unité de vente du pôle (pièce ou mètre).
 *    Sur les étagères, la couleur n'existe pas : une quantité totale par produit. La qualité et la
 *    taille, elles, restent séparées (une fermeture de 20 cm n'est pas une fermeture de 60 cm,
 *    un TAFFETA CL-5 n'est pas un CL-8).
 *
 * Seul CHRIFA a des étagères. Leur marchandise y arrive par la « mise en rayon » (des cartons ou
 * rouleaux sortis de la réserve) et par le comptage des étagères (l'inventaire) ; rien ne repart
 * des étagères vers la réserve.
 *
 * Un mouvement d'étagère porte `etagere: true`, le magasin principal en storeId, AUCUNE couleur,
 * et l'unité de vente. Le calcul du stock (computeStockItems) l'écarte de la réserve AVANT de
 * répartir les mouvements sans couleur entre les couleurs — sinon un comptage d'étagère serait
 * ventilé au prorata sur toutes les couleurs de la réserve — et en fait des lignes « Étagères »
 * à part, marquées `_etagere`.
 *
 * Les gestes (étape 2) : la mise en rayon (src/lib/mise-en-rayon.ts), la vente aux étagères à la
 * caisse (venteAuxEtageres : sans couleur, sans emplacement, dépassement signalé et jamais
 * bloqué), les bons (une ligne de bon porte `etagere` / `source: 'ETAGERE'` : sa correction, son
 * annulation, sa facturation et son retour restent sur les étagères) et le retour client
 * (retourSurEtageres).
 *
 * Pur : vérifié par `npx tsx scripts/test-etageres.ts`.
 */

import { normalizeVariantValue, libelleFixe, articleVariantDimension } from './warehouse-locations';
import { uniteImposee, poleDeLArticle } from './unites-pole';
import { magasinPrincipal } from './transferts';

export const LIBELLE_RESERVE = 'Réserve (magasin + entrepôts)';
export const LIBELLE_ETAGERES = 'Étagères (détail)';
export const LIBELLE_MISE_EN_RAYON = 'Mise en rayon — de la réserve vers les étagères';

/** Le message affiché quand un produit n'a pas d'unité de vente : on ne devine jamais un chiffre. */
export const MESSAGE_SANS_UNITE_VENTE =
  "Ce produit n'a pas encore son unité de vente : prévenez l'administrateur";
/** Le message de la mise en rayon quand le contenu d'un carton ou d'un rouleau est inconnu. */
export const MESSAGE_SANS_CONTENU =
  "Ce produit n'a pas encore son contenu de carton : prévenez l'administrateur";

/**
 * Une unité en français, pour l'écran et le journal : « bag » → « sac » / « sacs », « rolls » →
 * « rouleau » / « rouleaux ». Les unités sont enregistrées en anglais ; le gestionnaire ne doit pas
 * avoir à les traduire. Une unité inconnue reste telle quelle.
 */
export function uniteEnFrancais(unite: string | null | undefined, quantite = 2): string {
  const u = String(unite || '').trim();
  const pluriel = Math.abs(Number(quantite) || 0) >= 2;
  const table: Record<string, [string, string]> = {
    bag: ['sac', 'sacs'],
    rolls: ['rouleau', 'rouleaux'],
    roll: ['rouleau', 'rouleaux'],
    doz: ['douzaine', 'douzaines'],
    'gross (144p)': ['grosse (144 p)', 'grosses (144 p)'],
    'pièces': ['pièce', 'pièces'],
    'pièce': ['pièce', 'pièces'],
    pcs: ['pièce', 'pièces'],
    yds: ['yard', 'yards'],
  };
  const t = table[u.toLowerCase()];
  return t ? t[pluriel ? 1 : 0] : u;
}

/** Ce mouvement appartient-il aux étagères ? */
export const estMouvementEtagere = (m: any): boolean => m?.etagere === true;

/** Cette ligne de stock est-elle une ligne « Étagères » ? */
export const estLigneEtagere = (item: any): boolean => item?._etagere === true;

/** Les lignes de la réserve seulement (tout ce qui n'est pas une ligne Étagères). */
export const lignesDeReserve = <T>(items: T[] | null | undefined): T[] =>
  (items || []).filter(i => !estLigneEtagere(i));

/** Les lignes Étagères seulement. */
export const lignesDesEtageres = <T>(items: T[] | null | undefined): T[] =>
  (items || []).filter(i => estLigneEtagere(i));

/** Le lieu des étagères : le magasin principal (jamais un entrepôt), à défaut CHRIFA. */
export const magasinDesEtageres = (lieux: any[] = []): string => magasinPrincipal(lieux || []);

/**
 * Ce qui fait un produit d'étagère : sa famille, sa taille et sa qualité — sans couleur.
 * Préfixée par « etagere » : elle ne peut JAMAIS se confondre avec la clé d'une ligne de réserve.
 */
export function cleEtagere(p: { categoryId?: unknown; quality?: unknown; size?: unknown }): string {
  return [
    'etagere',
    normalizeVariantValue(p?.categoryId),
    normalizeVariantValue(libelleFixe(p?.size)),
    normalizeVariantValue(libelleFixe(p?.quality)),
  ].join('|');
}

/**
 * Le produit d'étagère d'un mouvement (ou d'une ligne de bon vendue aux étagères) : sa famille,
 * sa qualité et sa taille. Quand le mouvement ne porte ni qualité ni taille, il prend celles de
 * son article — si l'article n'est pas ventilé sur cette dimension : ce sont alors les mêmes
 * valeurs que ses lignes de réserve, et la caisse, le comptage et le calcul du stock tombent sur
 * la même clé. Une seule règle, partagée par computeStockItems et quantiteSurEtagere.
 */
export function produitDuMouvementEtagere(m: any, article?: any): {
  cle: string; quality: string | null; size: string | null; categoryId: string;
} {
  const dimension = article ? articleVariantDimension(article) : null;
  const quality = libelleFixe(m?.quality) ?? (dimension !== 'quality' ? libelleFixe(article?.quality) : null);
  const size = libelleFixe(m?.size) ?? (dimension !== 'size' ? libelleFixe(article?.size) : null);
  const categoryId = String(article?.categoryId ?? m?.categoryId ?? '');
  return { cle: cleEtagere({ categoryId, quality, size }), quality, size, categoryId };
}

/**
 * Ce que le logiciel compte sur les étagères pour le produit de cette ligne (famille + qualité +
 * taille), d'après les mouvements d'étagère : entrées moins sorties, plus ajustements. Sert à
 * signaler — jamais à bloquer — une vente ou une correction qui dépasse le stock des étagères.
 * Les mouvements déjà préparés dans le même lot peuvent être ajoutés à la liste : ils comptent.
 */
export function quantiteSurEtagere(mouvements: any[] | null | undefined, articles: any[] | null | undefined, ligne: any): number {
  const parId = new Map<string, any>();
  for (const a of articles || []) if (a?.id) parId.set(String(a.id), a);
  const cible = produitDuMouvementEtagere(ligne, parId.get(String(ligne?.articleId))).cle;
  let total = 0;
  for (const m of mouvements || []) {
    if (!estMouvementEtagere(m)) continue;
    if (produitDuMouvementEtagere(m, parId.get(String(m.articleId))).cle !== cible) continue;
    const q = Number(m.quantity) || 0;
    if (m.type === 'IN' || m.type === 'ADJUSTMENT') total += q;
    else if (m.type === 'OUT') total -= q;
  }
  return arrondi3(total);
}

/** La marque « Dépassement stock » que le journal sait lire (la même qu'à la caisse). */
export const marqueDepassement = (depasse: number): string =>
  depasse > 0 ? ` ⚠️ [Dépassement stock: +${arrondi3(depasse)}]` : '';

/** L'unité de vente imposée par le pôle de ce produit, s'il en a une. */
export function uniteVenteDuProduit(
  produit: { categoryId?: string | null; generalCategoryId?: string | null } | null | undefined,
  categories: any[] = [],
  poles: any[] = [],
): string | undefined {
  return uniteImposee(poleDeLArticle(produit, categories, poles), 'vente');
}

/** Un produit des étagères, tel que le comptage des étagères le propose. */
export interface ProduitEtagere {
  cle: string;
  /** L'article sur lequel écrire l'ajustement (le plus petit identifiant réel, comme la réserve). */
  articleId: string;
  articleIds: string[];
  categoryId: string;
  categoryNameFR?: string;
  poleNameFR?: string;
  productName: string;
  nameFR?: string;
  quality?: string;
  size?: string;
  /** L'unité de vente du pôle ; absente = produit non comptable sur les étagères. */
  uniteVente?: string;
  comptable: boolean;
  /** Ce que le logiciel croit avoir sur les étagères, en unité de vente. */
  quantite: number;
  /**
   * Le produit a déjà des mouvements d'étagère (une ligne Étagères existe). Faux = PREMIÈRE
   * installation : ce qui est déjà en rayon est encore compté dans la réserve.
   */
  dejaSurEtageres: boolean;
}

const idsReels = (item: any): string[] => {
  if (Array.isArray(item?._mergedArticleIds) && item._mergedArticleIds.length > 0) return item._mergedArticleIds.map(String);
  return [String(item?._realArticleId || item?.articleId || '')].filter(Boolean);
};

const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * La liste des produits que l'on peut compter sur les étagères : un par famille + qualité +
 * taille, sans couleur. Elle part de la réserve (un produit encore jamais mis en rayon doit
 * pouvoir recevoir sa quantité de départ) et des lignes Étagères déjà là.
 */
export function produitsDesEtageres(
  stockItems: any[] | null | undefined,
  categories: any[] = [],
  poles: any[] = [],
): ProduitEtagere[] {
  const parCle = new Map<string, ProduitEtagere>();

  const ajouter = (item: any) => {
    const cle = cleEtagere(item);
    const ids = idsReels(item);
    const deja = parCle.get(cle);
    if (deja) {
      for (const id of ids) if (!deja.articleIds.includes(id)) deja.articleIds.push(id);
      deja.articleIds.sort();
      deja.articleId = deja.articleIds[0] || deja.articleId;
      if (estLigneEtagere(item)) {
        deja.quantite = arrondi3(deja.quantite + (Number(item.currentQty) || 0));
        deja.dejaSurEtageres = true;
      }
      return;
    }
    const uniteVente = uniteVenteDuProduit(item, categories, poles);
    const articleIds = [...ids].sort();
    parCle.set(cle, {
      cle,
      articleId: articleIds[0] || '',
      articleIds,
      categoryId: String(item?.categoryId || ''),
      categoryNameFR: item?.categoryNameFR,
      poleNameFR: item?.poleNameFR,
      productName: String(item?.productName || item?.nameFR || 'Produit'),
      nameFR: item?.nameFR,
      quality: libelleFixe(item?.quality) || undefined,
      size: libelleFixe(item?.size) || undefined,
      uniteVente,
      comptable: Boolean(uniteVente),
      quantite: estLigneEtagere(item) ? arrondi3(Number(item.currentQty) || 0) : 0,
      dejaSurEtageres: estLigneEtagere(item),
    });
  };

  // Les lignes Étagères d'abord : leur nom et leur article font foi s'ils existent déjà.
  for (const item of stockItems || []) if (estLigneEtagere(item)) ajouter(item);
  for (const item of stockItems || []) if (!estLigneEtagere(item)) ajouter(item);

  return [...parCle.values()].sort((a, b) =>
    String(a.nameFR || a.productName).localeCompare(String(b.nameFR || b.productName), 'fr', { numeric: true, sensitivity: 'base' })
    || String(a.quality || '').localeCompare(String(b.quality || ''), 'fr', { numeric: true })
    || String(a.size || '').localeCompare(String(b.size || ''), 'fr', { numeric: true }));
}

/**
 * Les cartes des fiches produit : les lignes de réserve regroupées par nom ([nom, lignes]), et les
 * lignes Étagères de chaque carte.
 *
 * Chaque ligne Étagères va sur UNE SEULE carte, jamais deux : d'abord celle dont une ligne de
 * réserve est le même produit d'étagère (cleEtagere : famille + qualité + taille) ; à défaut celle
 * du même nom ; à défaut celle qui partage un article (deux commandes d'un même produit peuvent
 * porter des noms légèrement différents). Rattachée par le seul article, une qualité sœur (un
 * TAFFETA CL-8 sur la carte du CL-5, même article ventilé) s'additionnait à la mauvaise carte.
 * Un produit qui n'a de stock QUE sur les étagères garde sa carte (sans ligne de réserve).
 */
export function cartesAvecEtageres<T extends Record<string, any>>(
  reserve: T[] | null | undefined,
  etageres: T[] | null | undefined,
): { cartes: [string, T[]][]; etageresParCarte: Map<string, T[]> } {
  const nomDe = (i: any) => String(i?.nameFR || i?.productName || '').trim().toLowerCase();
  const parNom = new Map<string, T[]>();
  for (const i of reserve || []) {
    const pid = nomDe(i);
    const liste = parNom.get(pid);
    if (liste) liste.push(i); else parNom.set(pid, [i]);
  }
  const cartesReserve = Array.from(parNom.entries());
  const parCarte = new Map<string, T[]>();
  const rattacher = (pid: string, e: T) => {
    const liste = parCarte.get(pid);
    if (liste) liste.push(e); else parCarte.set(pid, [e]);
  };
  for (const e of etageres || []) {
    const nom = nomDe(e);
    const cle = cleEtagere(e);
    const parCle = cartesReserve.filter(([, vs]) => vs.some(v => cleEtagere(v) === cle));
    if (parCle.length > 0) {
      rattacher((parCle.find(([pid]) => pid === nom) || parCle[0])[0], e);
      continue;
    }
    if (parNom.has(nom)) { rattacher(nom, e); continue; }
    const ids = new Set<string>(idsReels(e));
    const parId = cartesReserve.find(([, vs]) => vs.some(v => idsReels(v).some(id => ids.has(id))));
    if (parId) { rattacher(parId[0], e); continue; }
    // Seulement sur les étagères : sa propre carte.
    parNom.set(nom, []);
    rattacher(nom, e);
  }
  return { cartes: Array.from(parNom.entries()), etageresParCarte: parCarte };
}

/**
 * La ligne Étagères d'un produit, pour la caisse : celle que le calcul du stock a fabriquée s'il
 * y en a une, sinon une ligne à zéro (produit jamais compté ni mis en rayon). Le stock des
 * étagères n'est pas encore compté partout : on laisse vendre, et la vente signale le
 * dépassement au lieu de le bloquer.
 */
export function ligneEtagereDuProduit(produit: ProduitEtagere, lignes: any[] | null | undefined, magasin: string): any {
  const existante = (lignes || []).find(l => estLigneEtagere(l) && cleEtagere(l) === produit.cle);
  if (existante) return existante;
  return {
    articleId: `${produit.articleId}__etagere__${normalizeVariantValue(produit.quality)}|${normalizeVariantValue(produit.size)}`,
    categoryId: produit.categoryId,
    categoryNameFR: produit.categoryNameFR,
    poleNameFR: produit.poleNameFR,
    productName: produit.productName,
    nameFR: produit.nameFR,
    quality: produit.quality,
    size: produit.size,
    unitOfMeasure: produit.uniteVente || 'unité',
    purchasePricePerUnit: 0,
    initialQty: 0,
    mouvementsIn: 0,
    mouvementsOut: 0,
    currentQty: 0,
    qtyByStore: { [magasin]: 0 },
    totalValue: 0,
    _realArticleId: produit.articleId,
    _mergedArticleIds: produit.articleIds,
    _etagere: true,
    ...(produit.uniteVente ? {} : { _sansUniteVente: true }),
  };
}

/**
 * La ligne de bon (ou de facture) et la sortie de stock d'une vente faite AUX ÉTAGÈRES : sans
 * couleur ni emplacement, à l'unité de vente, au magasin principal, marquée `etagere`. Une vente
 * qui dépasse ce que le logiciel compte sur les étagères passe quand même : la sortie porte la
 * marque « Dépassement stock », comme à la caisse.
 */
export function venteAuxEtageres(params: {
  item: any;
  qty: number;
  unitPrice: number;
  magasin: string;
  date: string;
  notes: string;
  /** Ce que le logiciel compte sur les étagères pour ce produit. */
  disponible: number;
}): { ligne: Record<string, any>; mouvement: Record<string, any>; depasse: number } {
  const { item, magasin } = params;
  const qty = arrondi3(params.qty);
  const articleId = String(item?._realArticleId || item?.articleId || '');
  const unite = String(item?.unitOfMeasure || 'unité');
  const depasse = qty > (Number(params.disponible) || 0) + 0.0005 ? arrondi3(qty - Math.max(0, Number(params.disponible) || 0)) : 0;
  const quality = libelleFixe(item?.quality) || undefined;
  const size = libelleFixe(item?.size) || undefined;
  const ligne: Record<string, any> = {
    articleId,
    productName: item?.nameFR || item?.productName,
    ...(item?.nameFR ? { nameFR: item.nameFR } : {}),
    color: '',
    size: size || '',
    ...(quality ? { quality } : {}),
    categoryId: item?.categoryId || '',
    unitOfMeasure: unite,
    qty,
    unitPrice: params.unitPrice,
    totalPrice: Math.round(qty * (Number(params.unitPrice) || 0) * 100) / 100,
    storeId: magasin,
    etagere: true,
    source: 'ETAGERE',
  };
  const mouvement: Record<string, any> = {
    articleId,
    categoryId: item?.categoryId || '',
    productName: item?.nameFR || item?.productName,
    nameFR: item?.nameFR || null,
    color: null,
    size: size || null,
    quality: quality || null,
    unitOfMeasure: unite,
    uniteReelle: unite,
    etagere: true,
    type: 'OUT',
    reason: 'VENTE',
    quantity: qty,
    date: params.date,
    notes: params.notes + marqueDepassement(depasse),
    storeId: magasin,
  };
  return { ligne, mouvement, depasse };
}

/**
 * Le retour client d'un achat fait AUX ÉTAGÈRES : il revient sur les étagères (jamais dans la
 * réserve), au magasin principal, sans couleur ni emplacement, dans l'unité de vente où il a été
 * vendu, et porte la facture pour que le déjà-rendu se compte (src/lib/retours-facture.ts).
 */
export function retourSurEtageres(params: {
  ligne: { articleId: string; categoryId?: string; productName?: string; nameFR?: string; size?: string; quality?: string; unitOfMeasure: string; qty: number };
  magasin: string;
  date: string;
  factureId: string;
  notes: string;
}): Record<string, any> {
  const { ligne } = params;
  return {
    articleId: ligne.articleId,
    categoryId: ligne.categoryId || '',
    productName: ligne.productName,
    nameFR: ligne.nameFR || null,
    color: null,
    size: libelleFixe(ligne.size) || null,
    quality: libelleFixe(ligne.quality) || null,
    unitOfMeasure: ligne.unitOfMeasure,
    uniteReelle: ligne.unitOfMeasure,
    etagere: true,
    type: 'IN',
    reason: 'RETOUR',
    storeId: params.magasin,
    quantity: arrondi3(ligne.qty),
    date: params.date,
    notes: params.notes,
    factureId: params.factureId,
  };
}

/**
 * Le mouvement d'ajustement qu'écrit le comptage des étagères : la différence entre ce qui est
 * compté et ce que le logiciel croyait, en unité de vente, sous le magasin principal, sans
 * couleur. null quand il n'y a rien à écrire (aucun écart) ou que le produit n'est pas comptable.
 */
export function ajustementEtagere(params: {
  produit: ProduitEtagere;
  compte: number;
  magasin: string;
  date: string;
}): Record<string, any> | null {
  const { produit, magasin, date } = params;
  if (!produit.comptable || !produit.uniteVente) return null;
  const compte = arrondi3(params.compte);
  const ecart = arrondi3(compte - produit.quantite);
  if (ecart === 0) return null;
  return {
    articleId: produit.articleId,
    categoryId: produit.categoryId,
    productName: produit.nameFR || produit.productName,
    ...(produit.nameFR ? { nameFR: produit.nameFR } : {}),
    ...(produit.quality ? { quality: produit.quality } : {}),
    ...(produit.size ? { size: produit.size } : {}),
    unitOfMeasure: produit.uniteVente,
    uniteReelle: produit.uniteVente,
    etagere: true,
    type: 'ADJUSTMENT',
    reason: 'INVENTAIRE',
    storeId: magasin,
    quantity: ecart,
    date,
    notes: `Comptage des étagères : logiciel ${produit.quantite}, compté ${compte} ${produit.uniteVente}`,
  };
}
