/**
 * La MISE EN RAYON : des cartons ou des rouleaux sortent de la réserve de CHRIFA pour garnir ses
 * étagères (décisions du patron, 01/10/2026 — voir src/lib/etageres.ts).
 *
 * Le geste, tel que le magasinier le fait :
 *  - il choisit un produit (famille + qualité + taille) ;
 *  - couleur par couleur, il dit combien de CARTONS ou de ROULEAUX entiers il sort — ou « le
 *    reste d'un carton ouvert », qu'il compte en pièces ou en mètres (un carton entamé ne sort de
 *    la réserve QUE par la mise en rayon) ;
 *  - le total arrive sur les étagères, sans couleur, à l'unité de vente du pôle.
 *
 * Ce qui s'écrit, dans UN SEUL lot :
 *  - pour chaque couleur, une sortie de RÉSERVE dans l'unité de la réserve (3 cartons de 20 sacs
 *    = 60 sacs ; un reste de 340 pièces à 120 pièces le sac = 2,833 sacs), en FIFO par
 *    emplacement, avec la trace du contenu utilisé (colis, nbColis, parColis, facteur) ;
 *  - une ENTRÉE sur les étagères (etagere: true), en unité de vente, du total converti ;
 *  - le tout relié par le même miseEnRayonId.
 *
 * Aucun chiffre n'est inventé : un produit dont on ne connaît pas le contenu du carton ou du
 * rouleau (ou dont le pôle n'a pas d'unité de vente) est BLOQUÉ, avec le message prévu. Une
 * réserve qui affiche moins que ce qu'on sort ne bloque pas : la sortie passe et se signale
 * (« Dépassement stock »), comme à la caisse.
 *
 * Pur : vérifié par `npx tsx scripts/test-etageres.ts`.
 */

import {
  contenuDuColis, versUniteDeVente, COLIS, type ColisDeSortie,
} from './conditionnement';
import { emplacementQualiteDuCatalogue } from './specification-produit';
import { allocateOutbound, stockItemVariant, normalizeVariantValue } from './warehouse-locations';
import { disponibleDepuis, type LieuConnu } from './stock-disponible';
import { MESSAGE_SANS_CONTENU, marqueDepassement, uniteEnFrancais } from './etageres';
import { uniteDecimale } from './unites-pole';

const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** 7 200 — 2,833 : à la française, trois décimales au plus. */
export const nombreFr = (n: number): string =>
  (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/[  ]/g, ' ');

/** Un colis qu'on peut sortir entier de la réserve, et ce qu'il contient en unité de vente. */
export interface ColisPossible {
  colis: ColisDeSortie;
  nom: string;
  pluriel: string;
  /** Le contenu d'un colis, en unité de vente. */
  contenu: number;
  /** « 1 carton = 20 sacs × 120 pcs = 2 400 pcs ». */
  detail: string;
}

export type PreparationCouleur =
  | {
    pret: true;
    /** L'unité dans laquelle la réserve compte cette couleur (sacs, rouleaux, pièces…). */
    uniteReserve: string;
    uniteVente: string;
    colis: ColisPossible[];
    /** 1 unité de réserve = `facteur` unités de vente (1 sac = 120 pièces). */
    facteur: number;
    /** « 1 bag = 120 pièces ». */
    detailFacteur: string;
  }
  | {
    pret: false;
    message: string;
    /** Ce qui manque, en clair, pour l'administrateur. */
    raisons: string[];
  };

export type PreparationPrete = Extract<PreparationCouleur, { pret: true }>;

/** L'article réel d'une ligne de stock (une ligne de couleur est une ligne virtuelle). */
const idReel = (ligne: any): string => String(ligne?._realArticleId || ligne?.articleId || '');

/**
 * Les articles réels d'une ligne de réserve : l'article canonique d'abord, puis les autres
 * commandes du même produit que le calcul du stock a réunies sur la même ligne (_mergedArticleIds).
 */
const idsReels = (ligne: any): string[] => {
  const canon = idReel(ligne);
  const autres = Array.isArray(ligne?._mergedArticleIds) ? ligne._mergedArticleIds.map(String) : [];
  return [canon, ...autres.filter((id: string) => id && id !== canon).sort()].filter(Boolean);
};

/** Le message quand une couleur réunit deux commandes dont les colis ne contiennent pas la même chose. */
export const MESSAGE_CONTENUS_DIFFERENTS =
  "Cette couleur vient de plusieurs commandes dont les cartons ne contiennent pas la même chose : prévenez l'administrateur";

/**
 * Ce qu'on sait de la mise en rayon d'une ligne de réserve (une couleur d'un produit) : les colis
 * qu'elle peut sortir, leur contenu en unité de vente, et ce que vaut une unité de la réserve en
 * unité de vente. Bloquée — avec le message du patron — dès qu'un de ces chiffres est inconnu.
 */
export function preparerCouleur(
  ligne: any,
  contexte: { articles?: any[]; categories?: any[]; generalCategories?: any[] },
): PreparationCouleur {
  const ids = idsReels(ligne);
  const premiere = preparerUnArticle(ligne, contexte);
  if (ids.length <= 1 || !premiere.pret) return premiere;
  // Une ligne qui réunit plusieurs commandes (même produit, même couleur) : chacune a pu arriver
  // avec un conditionnement différent (sac de 20 pièces ici, de 50 là). Le logiciel ne sait pas
  // de quelle commande vient le carton sorti : si les contenus diffèrent, il ne devine pas.
  const raisons: string[] = [];
  for (const id of ids.slice(1)) {
    const autre = preparerUnArticle({ ...ligne, _realArticleId: id, articleId: id, _mergedArticleIds: undefined }, contexte);
    if (!autre.pret) {
      raisons.push(`Commande ${id} : ${autre.raisons[0] || 'contenu du carton inconnu'}`);
      continue;
    }
    const memesColis = autre.colis.length === premiere.colis.length
      && autre.colis.every(c => premiere.colis.some(p => p.colis === c.colis && Math.abs(p.contenu - c.contenu) < 0.0005));
    if (autre.uniteVente !== premiere.uniteVente || Math.abs(autre.facteur - premiere.facteur) > 0.0005 || !memesColis) {
      raisons.push(`Commande ${id} : ${autre.detailFacteur}${autre.colis[0] ? `, ${autre.colis[0].detail}` : ''} — commande ${ids[0]} : ${premiere.detailFacteur}${premiere.colis[0] ? `, ${premiere.colis[0].detail}` : ''}`);
    }
  }
  if (raisons.length > 0) return { pret: false, message: MESSAGE_CONTENUS_DIFFERENTS, raisons };
  return premiere;
}

/** La préparation d'une couleur pour UN article réel (celui de `_realArticleId`). */
function preparerUnArticle(
  ligne: any,
  contexte: { articles?: any[]; categories?: any[]; generalCategories?: any[] },
): PreparationCouleur {
  const categories = contexte.categories || [];
  const generalCategories = contexte.generalCategories || [];
  const article = (contexte.articles || []).find((a: any) => String(a?.id) === idReel(ligne))
    || { categoryId: ligne?.categoryId, unitOfMeasure: ligne?.unitOfMeasure };
  const qualite = String(ligne?.quality || '').trim();
  // La ligne de ventilation de CETTE qualité ; à défaut, au moins son nom, pour retrouver la
  // qualité au catalogue (même règle que le rapport cartons/rouleaux).
  const ligneQualite = qualite
    ? ((Array.isArray(article.qualityBreakdown)
      ? article.qualityBreakdown.find((r: any) => normalizeVariantValue(r?.quality) === normalizeVariantValue(qualite))
      : undefined) || { quality: qualite })
    : undefined;

  const bloque = (raisons: string[]): PreparationCouleur => ({ pret: false, message: MESSAGE_SANS_CONTENU, raisons });

  const resultat = contenuDuColis({ article, ligneQualite, categories, generalCategories });
  if (!resultat.pret || !resultat.uniteVente) {
    return bloque([
      ...resultat.manques.map(m => m.texte),
      ...resultat.desaccords.filter(d => d.bloquant).map(d => d.texte),
    ]);
  }

  const uniteReserve = String(ligne?.unitOfMeasure || article?.unitOfMeasure || '').trim();
  const catalogue = emplacementQualiteDuCatalogue(article, categories, generalCategories, resultat.type, ligneQualite).ligne;
  const conversion = versUniteDeVente(1, uniteReserve, {
    uniteVente: resultat.uniteVente,
    type: resultat.type,
    facteurs: [ligneQualite, article].filter(Boolean),
    catalogue,
    uniteLongueurParDefaut: resultat.uniteAchat,
    uniteArticle: article?.unitOfMeasure,
  });
  if (!conversion.ok || !(conversion.quantite > 0)) {
    return bloque([
      `La réserve compte ce produit en « ${uniteReserve || '—'} » : ${conversion.ok ? 'contenu nul' : conversion.raison}`,
    ]);
  }

  return {
    pret: true,
    uniteReserve,
    uniteVente: resultat.uniteVente,
    facteur: conversion.quantite,
    detailFacteur: `1 ${uniteEnFrancais(uniteReserve, 1)} = ${nombreFr(conversion.quantite)} ${resultat.uniteVente}`,
    colis: resultat.colis.map(c => ({
      colis: c.colis, nom: COLIS[c.colis].nom, pluriel: COLIS[c.colis].pluriel, contenu: c.contenu, detail: c.detail,
    })),
  };
}

/** Ce que le magasinier sort d'une couleur. */
export interface SaisieCouleur {
  /** Le nombre ENTIER de colis entiers, par colis de sortie (carton, rouleau). */
  colis?: Partial<Record<ColisDeSortie, number>>;
  /** Le reste d'un carton (ou rouleau) ouvert, compté en unité de vente. */
  reste?: number;
}

/** Une part de la sortie d'une couleur : des colis entiers d'un même type, ou un reste. */
export interface PartieMiseEnRayon {
  colis: ColisDeSortie | 'reste';
  nbColis?: number;
  /** Le contenu d'un colis, en unité de vente. */
  parColis?: number;
  /** Ce que la part apporte aux étagères (unité de vente). */
  quantiteVente: number;
  /** Ce que la part retire de la réserve (unité de la réserve). */
  quantiteReserve: number;
  /** « 3 cartons = 7 200 pièces ». */
  texte: string;
}

export interface CalculCouleur {
  parties: PartieMiseEnRayon[];
  totalVente: number;
  totalReserve: number;
  /** Ce qui empêche d'écrire (un demi-carton, des décimales en pièces…). */
  erreurs: string[];
  /** Ce qui mérite un coup d'œil, sans bloquer. */
  avertissements: string[];
}

/** La conversion d'une couleur, en direct : ce qui part sur les étagères et ce qui sort de la réserve. */
export function calculerCouleur(prep: PreparationPrete, saisie: SaisieCouleur | null | undefined): CalculCouleur {
  const parties: PartieMiseEnRayon[] = [];
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  for (const c of prep.colis) {
    const brut = saisie?.colis?.[c.colis];
    if (brut === undefined || brut === null || (brut as any) === '') continue;
    const nb = Number(brut);
    if (!Number.isFinite(nb) || nb < 0) { erreurs.push(`Nombre de ${c.pluriel} illisible`); continue; }
    if (!Number.isInteger(nb)) {
      erreurs.push(`Un nombre ENTIER de ${c.pluriel} : un ${c.nom} entamé se sort par « le reste d'un ${c.nom} ouvert »`);
      continue;
    }
    if (nb === 0) continue;
    const quantiteVente = arrondi3(nb * c.contenu);
    parties.push({
      colis: c.colis, nbColis: nb, parColis: c.contenu, quantiteVente,
      quantiteReserve: arrondi3(quantiteVente / prep.facteur),
      texte: `${nombreFr(nb)} ${nb > 1 ? c.pluriel : c.nom} = ${nombreFr(quantiteVente)} ${prep.uniteVente}`,
    });
  }
  const reste = Number(saisie?.reste);
  if (saisie?.reste !== undefined && saisie?.reste !== null && (saisie.reste as any) !== '') {
    if (!Number.isFinite(reste) || reste < 0) erreurs.push('Reste illisible');
    else if (!uniteDecimale(prep.uniteVente) && !Number.isInteger(reste)) {
      erreurs.push(`Le reste se compte en ${prep.uniteVente} entières : pas de décimales`);
    } else if (reste > 0) {
      const quantiteVente = arrondi3(reste);
      const plusPetit = prep.colis.reduce((m, c) => Math.min(m, c.contenu), Infinity);
      if (Number.isFinite(plusPetit) && quantiteVente >= plusPetit) {
        const c = prep.colis.find(x => x.contenu === plusPetit)!;
        avertissements.push(`Ce reste (${nombreFr(quantiteVente)} ${prep.uniteVente}) fait au moins un ${c.nom} entier (${nombreFr(c.contenu)} ${prep.uniteVente}) : vérifiez`);
      }
      parties.push({
        colis: 'reste', quantiteVente,
        quantiteReserve: arrondi3(quantiteVente / prep.facteur),
        texte: `reste d'un ${prep.colis[0]?.nom || 'colis'} ouvert = ${nombreFr(quantiteVente)} ${prep.uniteVente}`,
      });
    }
  }
  return {
    parties,
    totalVente: arrondi3(parties.reduce((s, p) => s + p.quantiteVente, 0)),
    totalReserve: arrondi3(parties.reduce((s, p) => s + p.quantiteReserve, 0)),
    erreurs,
    avertissements,
  };
}

/** Le produit d'étagère qui reçoit la marchandise (src/lib/etageres.ts → ProduitEtagere). */
export interface ProduitMisEnRayon {
  articleId: string;
  categoryId: string;
  productName: string;
  nameFR?: string;
  quality?: string;
  size?: string;
  uniteVente?: string;
}

export interface CouleurMiseEnRayon {
  /** La ligne de réserve de la couleur (vue du magasin principal : magasin + entrepôts). */
  ligne: any;
  preparation: PreparationCouleur;
  saisie: SaisieCouleur;
}

export interface ResultatMiseEnRayon {
  /** Les sorties de réserve, adressées (FIFO par emplacement), dans l'unité de la réserve. */
  sorties: Record<string, any>[];
  /** L'entrée sur les étagères, en unité de vente ; null s'il n'y a rien à mettre en rayon. */
  entree: Record<string, any> | null;
  totalVente: number;
  /** Les couleurs dont la réserve affiche moins que ce qui sort : signalées, pas bloquées. */
  depassements: { couleur: string; depasse: number; unite: string }[];
  /** Ce qui empêche d'écrire. Non vide = rien ne doit partir. */
  erreurs: string[];
}

/** Retire les clés indéfinies : Firestore les refuse. */
const sansVide = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * Les mouvements d'une mise en rayon, prêts à partir dans UN lot (writeBatch).
 *
 * @param mouvements les mouvements déjà en base : la FIFO par emplacement les lit.
 * @param lieux les lieux connus : la réserve de CHRIFA, ce sont aussi ses entrepôts.
 */
export function mouvementsMiseEnRayon(params: {
  produit: ProduitMisEnRayon;
  couleurs: CouleurMiseEnRayon[];
  magasin: string;
  date: string;
  miseEnRayonId: string;
  mouvements?: any[];
  lieux?: LieuConnu[];
}): ResultatMiseEnRayon {
  const { produit, magasin, date, miseEnRayonId } = params;
  const lieux = params.lieux || [];
  const erreurs: string[] = [];
  const sorties: Record<string, any>[] = [];
  const depassements: ResultatMiseEnRayon['depassements'] = [];
  const enCours: any[] = [...(params.mouvements || [])];
  const resumes: string[] = [];
  let totalVente = 0;
  let uniteVente = produit.uniteVente;

  for (const { ligne, preparation, saisie } of params.couleurs) {
    const nomCouleur = String(ligne?.color || '').trim() || 'sans couleur';
    if (!preparation.pret) {
      const calculVide = !saisie || (!saisie.reste && !Object.values(saisie.colis || {}).some(n => Number(n) > 0));
      if (!calculVide) erreurs.push(`${nomCouleur} : ${preparation.message}`);
      continue;
    }
    if (uniteVente && preparation.uniteVente !== uniteVente) {
      erreurs.push(`${nomCouleur} : unité de vente « ${preparation.uniteVente} » au lieu de « ${uniteVente} »`);
      continue;
    }
    uniteVente = uniteVente || preparation.uniteVente;
    const calcul = calculerCouleur(preparation, saisie);
    for (const e of calcul.erreurs) erreurs.push(`${nomCouleur} : ${e}`);
    if (calcul.erreurs.length > 0 || calcul.parties.length === 0) continue;

    // Ce que la réserve affiche pour cette couleur, au magasin principal (magasin + entrepôts).
    const dispo = disponibleDepuis(ligne, magasin, lieux);
    const depasse = calcul.totalReserve > dispo + 0.0005 ? arrondi3(calcul.totalReserve - Math.max(0, dispo)) : 0;
    if (depasse > 0) depassements.push({ couleur: nomCouleur, depasse, unite: preparation.uniteReserve });

    const articleId = idReel(ligne);
    const ids = idsReels(ligne);
    const variante = stockItemVariant(ligne);
    const uniteR = (q: number) => uniteEnFrancais(preparation.uniteReserve, q);
    calcul.parties.forEach((partie, rang) => {
      const derniere = rang === calcul.parties.length - 1;
      const base = sansVide({
        articleId,
        categoryId: ligne?.categoryId || produit.categoryId || undefined,
        productName: ligne?.nameFR || ligne?.productName || produit.nameFR || produit.productName,
        nameFR: ligne?.nameFR || undefined,
        color: ligne?.color || null,
        size: ligne?.size || null,
        quality: ligne?.quality || null,
        unitOfMeasure: preparation.uniteReserve,
        uniteReelle: preparation.uniteReserve,
        type: 'OUT',
        reason: 'MISE_EN_RAYON',
        storeId: magasin,
        date,
        notes: '',
        miseEnRayonId,
        colis: partie.colis,
        nbColis: partie.nbColis,
        parColis: partie.parColis,
        facteur: preparation.facteur,
        quantiteVente: partie.quantiteVente,
      });
      // FIFO par emplacement, sur les racks de CHAQUE commande réunie dans la ligne (l'article
      // canonique d'abord) : sinon le rack d'une autre commande du même produit restait plein. Ce
      // qu'aucun rack ne porte sort sans emplacement, sur l'article canonique — jamais un rack négatif.
      const morceaux: { articleId: string; quantity: number; locationCode?: string; locationId?: string }[] = [];
      let resteReserve = partie.quantiteReserve;
      for (const id of ids) {
        if (resteReserve <= 0) break;
        const { allocations } = allocateOutbound({
          movements: enCours, storeId: magasin, articleId: id, quantity: resteReserve, variant: variante, lieux,
        });
        for (const a of allocations) {
          morceaux.push({ articleId: id, quantity: a.quantity, locationCode: a.locationCode, ...(a.locationId ? { locationId: a.locationId } : {}) });
          resteReserve = arrondi3(resteReserve - a.quantity);
        }
      }
      if (resteReserve > 0) morceaux.push({ articleId, quantity: resteReserve });

      // La trace se répartit sur les morceaux : chacun porte SA part en unité de vente (la somme
      // retombe exactement sur la part), et le nombre de colis n'est écrit qu'une fois — recopié
      // sur chaque morceau, il comptait deux fois les cartons et la quantité mise en rayon.
      let venteRestante = partie.quantiteVente;
      const lignes = morceaux.map((morceau, i) => {
        const dernierMorceau = i === morceaux.length - 1;
        const quantiteVente = dernierMorceau ? arrondi3(venteRestante) : arrondi3(morceau.quantity * preparation.facteur);
        venteRestante = arrondi3(venteRestante - quantiteVente);
        const ici = morceaux.length > 1
          ? ` — ${nombreFr(morceau.quantity)} ${uniteR(morceau.quantity)}${morceau.locationCode ? ` pris en ${morceau.locationCode}` : ' sans emplacement'}, sur ${nombreFr(partie.quantiteReserve)} ${uniteR(partie.quantiteReserve)}`
          : ` (${nombreFr(partie.quantiteReserve)} ${uniteR(partie.quantiteReserve)})`;
        const ligneSortie: Record<string, any> = {
          ...base,
          ...morceau,
          quantiteVente,
          notes: `Mise en rayon : ${i === 0 ? partie.texte : `suite (${partie.texte})`}${ici}, vers les étagères`
            + (derniere && dernierMorceau ? marqueDepassement(depasse) : ''),
        };
        if (i > 0) delete ligneSortie.nbColis;
        return ligneSortie;
      });
      sorties.push(...lignes);
      enCours.push(...lignes);
    });
    totalVente = arrondi3(totalVente + calcul.totalVente);
    resumes.push(`${nomCouleur} ${calcul.parties.map(p => p.texte).join(' + ')}`);
  }

  if (!uniteVente) erreurs.push(MESSAGE_SANS_CONTENU);
  const entree = erreurs.length === 0 && totalVente > 0 && uniteVente
    ? sansVide({
      articleId: produit.articleId,
      categoryId: produit.categoryId || undefined,
      productName: produit.nameFR || produit.productName,
      nameFR: produit.nameFR || undefined,
      quality: produit.quality || undefined,
      size: produit.size || undefined,
      unitOfMeasure: uniteVente,
      uniteReelle: uniteVente,
      etagere: true,
      type: 'IN',
      reason: 'MISE_EN_RAYON',
      storeId: magasin,
      quantity: totalVente,
      date,
      notes: `Mise en rayon depuis la réserve : ${resumes.join(' · ')}`,
      miseEnRayonId,
    })
    : null;

  return { sorties: erreurs.length === 0 ? sorties : [], entree, totalVente, depassements, erreurs };
}
