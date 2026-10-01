/**
 * Le rapport « Cartons et rouleaux » : ce qui est prêt, et ce qu'il reste à compléter, pour que
 * la réserve sorte au carton ou au rouleau compté en unité de vente.
 *
 * Il ne lit que ce que /stock a déjà chargé — les lignes de stock calculées, les articles, les
 * familles, les pôles — et n'écrit rien. Le calcul de chaque colis est celui de
 * `contenuDuColis` (src/lib/conditionnement.ts), le même que l'écran Qualités affiche.
 *
 * Un PRODUIT, ici, c'est une famille et une qualité : les couleurs et les tailles d'une même
 * qualité partagent en général leur carton, les lister une à une noierait le rapport. Mais
 * chaque ARTICLE encore en stock est calculé — à l'étape 3, c'est article par article que le
 * stock sera converti. Un produit n'est donc « prêt » que si TOUS ses articles le sont ; et quand
 * deux articles n'ont pas le même carton, on dit ce qui les distingue (arrivage, taille, couleur).
 *
 * Pur : testé par scripts/test-rapport-cartons-rouleaux.ts.
 */

import {
  contenuDuColis, consigneUniteDeVente, uniteDeVenteAttendue, type ResultatColis, type GenreManque,
} from './conditionnement';
import { poleDeLArticle, uniteImposee } from './unites-pole';
import { detectSpecType } from './quality-schema';

const norme = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Les manques qui se règlent sur le PÔLE : ils sont dits une fois, en tête du pôle. */
const GENRES_DU_POLE: GenreManque[] = ['type', 'unite-vente', 'pole'];
export const estManqueDuPole = (genre: GenreManque) => GENRES_DU_POLE.includes(genre);

export interface VarianteDuRapport {
  /** Ce qui la distingue du calcul retenu : « BL 555 du 01/06/2026 », « taille 60CM », « couleur NOIR ». */
  libelle: string;
  resultat: ResultatColis;
}

export interface ProduitDuRapport {
  cle: string;
  nom: string;
  famille: string;
  qualite?: string;
  /** Le stock, tous magasins et entrepôts confondus, unité par unité : des grosses et des pièces ne s'additionnent pas. */
  stocks: { unite: string; quantite: number }[];
  /** Le total quand tout le stock est compté dans une seule unité ; sinon null. */
  stock: number | null;
  uniteStock: string;
  /** Prêt seulement si chaque article de ce produit encore en stock l'est. */
  pret: boolean;
  /** Le calcul retenu : celui de l'arrivage le plus récent. */
  resultat: ResultatColis;
  /** Quand d'autres calculs existent : ce qui caractérise celui retenu (même vocabulaire que les variantes). */
  precision?: string;
  /** Les articles du même produit dont le calcul diffère : autre carton, ou à compléter. */
  variantes: VarianteDuRapport[];
  arrivage: string;
}

export interface PoleDuRapport {
  id: string;
  nom: string;
  /** Le type fixé sur le pôle (sa ligne logistique), ou supposé d'après son nom ou sa ligne, ou rien. */
  type?: string;
  typeDevine: boolean;
  ligne?: string;
  uniteAchat?: string;
  uniteVente?: string;
  /** Faux quand l'unité de vente manque OU ne convient pas (kg, rouleaux, pièces pour un tissu…). */
  uniteVenteValable: boolean;
  /** Les consignes qui concernent le pôle lui-même (type, unité de vente). */
  consignes: string[];
  produits: ProduitDuRapport[];
}

export interface RapportCartonsRouleaux {
  poles: PoleDuRapport[];
  compteurs: {
    produitsPrets: number;
    produitsACompleter: number;
    produitsEnDesaccord: number;
    /** Sans unité de vente, ou avec une unité qui ne convient pas. */
    polesSansUniteVente: number;
    polesSansType: number;
    /** Les pôles qui ont au moins un produit en stock — ceux sur lesquels portent les compteurs. */
    polesEnStock: number;
  };
}

/** Le stock d'une ligne, tous lieux confondus. */
function stockTotal(item: any): number {
  const parLieu = item?.qtyByStore && typeof item.qtyByStore === 'object' ? Object.values(item.qtyByStore) : null;
  if (parLieu && parLieu.length > 0) return parLieu.reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  return Number(item?.currentQty) || 0;
}

/** L'identifiant Firestore réel d'une ligne de stock (les lignes ventilées portent un id virtuel). */
const idsReels = (item: any): string[] => {
  if (Array.isArray(item?._mergedArticleIds) && item._mergedArticleIds.length > 0) return item._mergedArticleIds.map(String);
  const id = item?._realArticleId || String(item?.articleId || '').split('__')[0];
  return id ? [String(id)] : [];
};

const dateDeLArticle = (a: any): string => String(a?.stockEntryDate || a?.arrivalDate || a?.orderDate || '');

const memesValeurs = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every(x => b.has(x));
const liste = (s: Set<string>) => Array.from(s).sort((x, y) => x.localeCompare(y)).join(', ');

export function construireRapportCartonsRouleaux(
  stockItems: any[],
  articles: any[],
  categories: any[],
  generalCategories: any[],
  factures: any[] = [],
): RapportCartonsRouleaux {
  const articleParId = new Map<string, any>((articles || []).map(a => [String(a?.id), a]));
  const factureParId = new Map<string, any>((factures || []).map(f => [String(f?.id), f]));

  const nomArrivage = (a: any): string => {
    const f = factureParId.get(String(a?.factureId || a?.facture || ''));
    const date = String(f?.arrivalDate || a?.arrivalDate || a?.stockEntryDate || '').slice(0, 10);
    const bl = f?.noBL ? `BL ${f.noBL}` : '';
    return [bl, date ? `du ${date.split('-').reverse().join('/')}` : ''].filter(Boolean).join(' ') || 'arrivage sans date';
  };

  // ── Les produits : famille + qualité, toutes couleurs et tailles réunies.
  type Ref = { id: string; article: any; qualite?: string; tailles: Set<string>; couleurs: Set<string> };
  type Groupe = {
    poleId: string; famille: any; qualite?: string; nom: string;
    stocks: Map<string, number>; refs: Map<string, Ref>;
  };
  const groupes = new Map<string, Groupe>();
  for (const item of stockItems || []) {
    const stock = stockTotal(item);
    if (!(stock > 0)) continue;
    const ids = idsReels(item);
    const premier = ids.map(id => articleParId.get(id)).find(Boolean);
    if (!premier) continue;
    const famille = (categories || []).find(c => c?.id === premier.categoryId || c?.name === premier.categoryId);
    const pole = poleDeLArticle(premier, categories, generalCategories);
    const qualite = item?._qualityKey || (norme(item?.quality) && norme(item?.quality) !== 'various' ? String(item.quality).trim() : undefined);
    const cle = `${pole?.id || '—'}|${norme(famille?.id || premier.categoryId)}|${norme(qualite)}`;
    let g = groupes.get(cle);
    if (!g) {
      g = {
        poleId: pole?.id || '', famille, qualite,
        nom: String(item?.nameFR || item?.productName || famille?.nameFR || famille?.name || premier.name || 'Produit'),
        stocks: new Map(), refs: new Map(),
      };
      groupes.set(cle, g);
    }
    const unite = String(item?.unitOfMeasure || premier.unitOfMeasure || '').trim() || 'unité';
    g.stocks.set(unite, (g.stocks.get(unite) || 0) + stock);
    for (const id of ids) {
      const article = articleParId.get(id);
      if (!article) continue;
      let ref = g.refs.get(id);
      if (!ref) {
        // Une ligne fusionnée (même famille, couleur, taille, qualité) peut ne pas porter le nom
        // de qualité de la ventilation : on lui donne celui du groupe, pour retrouver la ligne de
        // ventilation de l'article ventilé qu'elle contient.
        ref = { id, article, qualite: item?._qualityKey || qualite, tailles: new Set(), couleurs: new Set() };
        g.refs.set(id, ref);
      }
      if (String(item?.size || '').trim()) ref.tailles.add(String(item.size).trim());
      if (String(item?.color || '').trim()) ref.couleurs.add(String(item.color).trim());
    }
  }

  // ── Un calcul par article ; le plus récent fait foi, les autres sont dits s'ils diffèrent.
  const signature = (r: ResultatColis) => [
    r.colis.map(c => `${c.colis}:${c.contenu}:${c.unite}`).join('|'),
    r.manques.filter(m => !estManqueDuPole(m.genre)).map(m => m.texte).join('|'),
    r.desaccords.map(d => d.texte).join('|'),
  ].join('#');
  const produitsParPole = new Map<string, ProduitDuRapport[]>();
  for (const [cle, g] of groupes) {
    const calculs = Array.from(g.refs.values())
      .sort((x, y) => dateDeLArticle(y.article).localeCompare(dateDeLArticle(x.article)) || x.id.localeCompare(y.id))
      .map(ref => {
        const { article, qualite } = ref;
        // La ligne de ventilation de CETTE qualité ; à défaut, au moins son nom, pour retrouver
        // la qualité au catalogue (l'article ventilé, lui, ne porte que « VARIOUS »).
        const ligneQualite = qualite
          ? ((Array.isArray(article.qualityBreakdown)
            ? article.qualityBreakdown.find((r: any) => norme(r?.quality) === norme(qualite))
            : undefined) || { quality: qualite })
          : undefined;
        return { ref, resultat: contenuDuColis({ article, ligneQualite, categories, generalCategories }) };
      });

    // Les calculs identiques se regroupent ; chaque groupe garde ses arrivages, tailles, couleurs.
    type Famille = { resultat: ResultatColis; article: any; arrivages: Set<string>; tailles: Set<string>; couleurs: Set<string> };
    const familles = new Map<string, Famille>();
    for (const c of calculs) {
      const sig = signature(c.resultat);
      let f = familles.get(sig);
      if (!f) {
        f = { resultat: c.resultat, article: c.ref.article, arrivages: new Set(), tailles: new Set(), couleurs: new Set() };
        familles.set(sig, f);
      }
      f.arrivages.add(nomArrivage(c.ref.article));
      c.ref.tailles.forEach(t => f!.tailles.add(t));
      c.ref.couleurs.forEach(t => f!.couleurs.add(t));
    }
    const [retenu, ...autres] = Array.from(familles.values());

    // Ce qui distingue les calculs : on ne parle d'« arrivage » que si le BL diffère vraiment.
    const differe = (f: Famille) => ({
      arrivage: !memesValeurs(f.arrivages, retenu.arrivages),
      taille: f.tailles.size > 0 && !memesValeurs(f.tailles, retenu.tailles),
      couleur: f.couleurs.size > 0 && !memesValeurs(f.couleurs, retenu.couleurs),
    });
    const decrire = (f: Famille, dims: { arrivage: boolean; taille: boolean; couleur: boolean }) => {
      const parties = [
        dims.arrivage ? `arrivage ${liste(f.arrivages)}` : '',
        dims.taille && f.tailles.size ? `taille ${liste(f.tailles)}` : '',
        dims.couleur && f.couleurs.size ? `couleur ${liste(f.couleurs)}` : '',
      ].filter(Boolean);
      return parties.join(' · ') || `arrivage ${liste(f.arrivages)}`;
    };
    const variantes: VarianteDuRapport[] = autres.map(f => ({ libelle: decrire(f, differe(f)), resultat: f.resultat }));
    const dimsUtiles = autres.map(differe).reduce(
      (acc, d) => ({ arrivage: acc.arrivage || d.arrivage, taille: acc.taille || d.taille, couleur: acc.couleur || d.couleur }),
      { arrivage: false, taille: false, couleur: false },
    );

    const stocks = Array.from(g.stocks.entries()).map(([unite, quantite]) => ({ unite, quantite: Math.round(quantite * 1000) / 1000 }));
    const listePole = produitsParPole.get(g.poleId) || [];
    listePole.push({
      cle, nom: g.nom, famille: String(g.famille?.name || retenu.article.categoryId || ''), qualite: g.qualite,
      stocks,
      stock: stocks.length === 1 ? stocks[0].quantite : null,
      uniteStock: stocks.length === 1 ? stocks[0].unite : '',
      pret: Array.from(familles.values()).every(f => f.resultat.pret),
      resultat: retenu.resultat,
      precision: autres.length > 0 ? decrire(retenu, dimsUtiles) : undefined,
      variantes,
      arrivage: liste(retenu.arrivages),
    });
    produitsParPole.set(g.poleId, listePole);
  }

  // ── Les pôles qui ont du stock, avec ce qui leur manque à eux.
  const poles: PoleDuRapport[] = [];
  for (const [poleId, produits] of produitsParPole) {
    const pole = (generalCategories || []).find(p => p?.id === poleId);
    const tousLesResultats = produits.flatMap(p => [p.resultat, ...p.variantes.map(v => v.resultat)]);
    // Le type est celui que les produits ont réellement utilisé : tous le tiennent du pôle.
    const avecType = tousLesResultats.find(r => r.type);
    const explicite = pole?.specType && pole.specType !== 'none' ? pole.specType : undefined;
    const type = avecType?.type ?? explicite ?? (pole ? detectSpecType(pole) : undefined);
    const typeDevine = avecType ? avecType.typeDevine : !explicite && !!type;
    const uniteAchat = uniteImposee(pole, 'achat');
    const uniteVente = uniteImposee(pole, 'vente');
    const manquesDuPole = tousLesResultats.flatMap(r => r.manques).filter(m => estManqueDuPole(m.genre));

    // La consigne d'unité de vente d'un pôle sans aucune unité dépend de TOUT son stock : on la
    // récrit ici avec les unités de ses produits (cf. consigneUniteDeVente).
    const attendue = uniteDeVenteAttendue(type);
    const sansAucuneUnite = !uniteAchat && !uniteVente;
    const unitesDuStock = produits.flatMap(p => p.stocks.map(s => s.unite));
    const consignes = Array.from(new Set([
      ...manquesDuPole.filter(m => m.genre === 'type').map(m => m.texte),
      ...(sansAucuneUnite && attendue && pole
        ? [consigneUniteDeVente(String(pole.name || ''), attendue, undefined, unitesDuStock, typeDevine ? type : undefined)]
        : manquesDuPole.filter(m => m.genre === 'unite-vente').map(m => m.texte)),
      ...manquesDuPole.filter(m => m.genre === 'pole').map(m => m.texte),
    ]));

    produits.sort((a, b) => Number(a.pret) - Number(b.pret) || a.nom.localeCompare(b.nom));
    poles.push({
      id: poleId, nom: String(pole?.name || 'Sans pôle'),
      type, typeDevine, ligne: pole?.line || undefined,
      uniteAchat, uniteVente,
      uniteVenteValable: !!uniteVente && !manquesDuPole.some(m => m.genre === 'unite-vente'),
      consignes, produits,
    });
  }
  poles.sort((a, b) => a.nom.localeCompare(b.nom));

  const tous = poles.flatMap(p => p.produits);
  return {
    poles,
    compteurs: {
      produitsPrets: tous.filter(p => p.pret).length,
      produitsACompleter: tous.filter(p => !p.pret).length,
      produitsEnDesaccord: tous.filter(p => p.resultat.desaccords.length > 0 || p.variantes.length > 0).length,
      polesSansUniteVente: poles.filter(p => p.id && !p.uniteVenteValable).length,
      polesSansType: poles.filter(p => p.id && (!p.type || p.typeDevine)).length,
      polesEnStock: poles.filter(p => p.id).length,
    },
  };
}
