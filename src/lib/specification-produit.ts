/**
 * Les spécifications techniques d'un article, lues dans le modèle de sa famille.
 *
 * Pourquoi ce fichier : depuis que les qualités sont décrites par pôle (src/lib/quality-schema.ts),
 * chaque type de produit a ses propres caractéristiques — GSM et largeur pour un tissu, longueur
 * et curseur pour une fermeture, poids du cône pour un fil, épaisseur pour un accessoire. Or les
 * PDF et les écrans de /stock affichaient deux types en dur (fermeture et tissu) : un fil, un
 * curseur, un ruban ou un accessoire imprimait une ligne vide, ou retombait sur l'ancien champ
 * texte libre `specs` que plus personne ne remplit.
 *
 * Tout passe désormais par ici : même produit, mêmes caractéristiques, même ordre, à l'écran
 * comme sur le papier.
 */

import {
  QUALITY_SCHEMA, QUALITIES_FIELD_BY_SPEC, detectSpecType, groupeDuChamp, type QualityFieldGroup,
} from './quality-schema';

export type LigneSpecification = { cle: string; label: string; valeur: string; groupe: QualityFieldGroup };

/**
 * Les champs techniques propres à chaque type, pour deviner un type quand ni le pôle ni la famille
 * ne sont connus. L'ordre compte : le premier type dont un champ est rempli l'emporte, donc les
 * champs les moins partagés passent en premier. `rollLength`, `size`, `pcsPerBag` et
 * `bagsPerCarton` n'y figurent pas : plusieurs types les utilisent, ils ne prouvent rien.
 */
const INDICES_PAR_TYPE: [string, string[]][] = [
  ['zipper',    ['zipperType', 'sliderType', 'tapeWeightGsm', 'length']],
  ['fabric',    ['gsm', 'fabricWidth', 'packagingPerBag']],
  ['tape',      ['weightPerM', 'rollsPerShrink', 'rollsPerCarton']],
  ['thread',    ['coneWeightG', 'threadWeightG', 'lengthPerPiece', 'lengthUnit']],
  ['slider',    ['sliderWeightG']],
  ['accessory', ['thickness', 'weightPerPiece', 'pcsPerBox', 'boxPerCarton']],
];

const rempli = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0';

/**
 * Le type de spécification d'un article : celui de son pôle si on le connaît, sinon celui de sa
 * famille, sinon deviné d'après les caractéristiques que l'article porte réellement.
 *
 * Le dernier recours compte : les PDF ne reçoivent pas toujours le catalogue des pôles, et un
 * document imprimé sans spécifications est un document qu'on ne peut pas contrôler à la réception.
 */
export function specTypeDeLArticle(article: any, categories: any[] = [], generalCategories: any[] = []): string | undefined {
  const categorie = (categories || []).find((c: any) => c?.id === article?.categoryId || c?.name === article?.categoryId);
  const poleId = article?.generalCategoryId || categorie?.generalCategoryId;
  const pole = (generalCategories || []).find((g: any) => g?.id === poleId);

  const parLePole = pole ? detectSpecType(pole) : undefined;
  if (parLePole) return parLePole;

  const parLaFamille = categorie ? detectSpecType({ ...categorie, specType: categorie?.specType }) : undefined;
  if (parLaFamille) return parLaFamille;

  // Par le NOM, même sans catalogue : « CURSEUR N5 », « RUBAN SATIN », « BOUTON PRESSION » se
  // reconnaissent seuls. C'est ce qui sauve les documents où le catalogue n'est pas transmis —
  // un curseur décrit par sa seule taille ne porte sinon aucun champ qui le distingue.
  for (const nom of [article?.categoryId, article?.name, article?.nameFR]) {
    const texte = String(nom ?? '').trim();
    if (!texte) continue;
    const parLeNom = detectSpecType({ name: texte });
    if (parLeNom) return parLeNom;
  }

  for (const [type, champs] of INDICES_PAR_TYPE) {
    if (champs.some(champ => rempli(article?.[champ]))) return type;
  }
  return undefined;
}

const sansAccent = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * La ligne du catalogue qui décrit la qualité qu'on imprime : celle dont le libellé correspond,
 * ou l'unique ligne de la famille quand l'article ne nomme aucune qualité.
 *
 * Deux règles, et elles comptent autant l'une que l'autre :
 *
 * - **On cherche le libellé de la LIGNE avant celui de l'article.** Un article ventilé par
 *   qualités porte `quality: 'VARIOUS'` — c'est la marque d'une ventilation, pas un nom. Chercher
 *   « various » dans le catalogue ne trouve rien, et le conditionnement saisi dans l'écran
 *   Qualités n'atteindrait jamais les commandes ventilées, c'est-à-dire la plupart.
 * - **Un nom qui ne correspond à rien ne se remplace pas par le voisin.** Si l'article dit
 *   AUTOLOCK N8 et que la famille ne connaît que CL-5, on ne prête pas à l'un le carton de
 *   l'autre : le document dira quel champ saisir. Le repli sur la ligne unique ne vaut que
 *   lorsqu'il n'y a aucun nom pour trancher.
 */
export function ligneQualiteDuCatalogue(
  article: any, categories: any[] = [], generalCategories: any[] = [], type?: string, ligneQualite?: any,
): any | undefined {
  return emplacementQualiteDuCatalogue(article, categories, generalCategories, type, ligneQualite).ligne;
}

/**
 * La même recherche que `ligneQualiteDuCatalogue`, mais qui dit aussi OÙ se trouve la ligne — ou
 * pourquoi on ne l'a pas trouvée.
 *
 * C'est ce qu'il faut pour écrire une consigne qu'on peut suivre : « saisir Sacs/carton pour la
 * qualité N°5 de la famille NYLON N°3 dans Qualités », plutôt que « Sacs/carton manque ». Le
 * numéro est la position de la ligne dans sa liste, en partant de 1 — l'ordre de l'écran Qualités.
 */
export interface EmplacementQualite {
  /** La ligne du catalogue retenue, si on en a trouvé une. */
  ligne?: any;
  /** Où elle est rangée : dans la famille (le cas courant) ou directement sur le pôle. */
  rangement?: 'famille' | 'pole';
  /** Sa position dans la liste, à partir de 1. */
  numero?: number;
  /** Le nom de la famille de l'article (même quand aucune ligne n'est trouvée). */
  famille?: string;
  /** Le nom du pôle qui porte les qualités, quand on le connaît. */
  pole?: string;
  /** Le libellé de qualité que l'article ou sa ligne de ventilation nomme, s'il en nomme un. */
  qualiteNommee?: string;
  /** Combien de lignes de qualité la famille et le pôle proposent en tout. */
  nombreDeLignes: number;
}

export function emplacementQualiteDuCatalogue(
  article: any, categories: any[] = [], generalCategories: any[] = [], type?: string, ligneQualite?: any,
): EmplacementQualite {
  const famille = (categories || []).find((c: any) => c?.id === article?.categoryId || c?.name === article?.categoryId);
  const pole = (generalCategories || []).find((g: any) => g?.id === (article?.generalCategoryId || famille?.generalCategoryId));
  const base: EmplacementQualite = {
    famille: famille?.name ? String(famille.name) : undefined,
    pole: pole?.name ? String(pole.name) : undefined,
    nombreDeLignes: 0,
  };

  const champ = type ? QUALITIES_FIELD_BY_SPEC[type] : undefined;
  if (!champ) return base;

  // La famille d'abord, le pôle ensuite : même ordre qu'avant, chaque ligne gardant sa place.
  const lignes: { ligne: any; rangement: 'famille' | 'pole'; numero: number }[] = [
    ...(Array.isArray(famille?.[champ]) ? famille[champ] : [])
      .map((ligne: any, i: number) => ({ ligne, rangement: 'famille' as const, numero: i + 1 })),
    ...(Array.isArray(pole?.[champ]) ? pole[champ] : [])
      .map((ligne: any, i: number) => ({ ligne, rangement: 'pole' as const, numero: i + 1 })),
  ];
  base.nombreDeLignes = lignes.length;

  const brut = [
    ligneQualite?.quality, ligneQualite?.label, ligneQualite?.nameFR,
    article?.quality, article?.qualityLabel,
  ].find(v => { const s = sansAccent(v); return s && s !== 'various'; });
  const nomme = brut !== undefined ? sansAccent(brut) : undefined;
  if (brut !== undefined) base.qualiteNommee = String(brut).trim();
  if (lignes.length === 0) return base;

  let trouve: (typeof lignes)[number] | undefined;
  if (nomme) {
    trouve = lignes.find(({ ligne: l }) =>
      [l?.label, l?.nameFR, l?.quality].some(v => sansAccent(v) === nomme));
  } else if (lignes.length === 1) {
    // Aucun nom pour trancher : une famille qui n'a qu'une qualité ne laisse pas de place au doute.
    trouve = lignes[0];
  }
  return trouve ? { ...base, ...trouve } : base;
}

/**
 * Les caractéristiques à afficher, dans l'ordre du modèle. Une ligne de ventilation par qualité
 * (qualityBreakdown) porte ses propres valeurs : elles priment sur celles de l'article, puisque
 * c'est précisément ce qui distingue deux qualités du même produit.
 */
export function specificationsArticle(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
  /**
   * Les groupes à retenir. Par défaut tout sauf l'empilage : comment les colis se montent sur
   * une palette n'a rien à faire sur une fiche produit ni sur une facture — c'est une donnée
   * d'entrepôt, que seul le document de réception exploite.
   */
  groupes: QualityFieldGroup[] = ['technique', 'conditionnement'],
): LigneSpecification[] {
  const type = specTypeDeLArticle(article, categories, generalCategories);
  const modele = type ? QUALITY_SCHEMA[type] : null;
  if (!modele) return [];

  const retenus = new Set(groupes);
  /**
   * La qualité telle que le catalogue la définit AUJOURD'HUI.
   *
   * Une qualité fixe est une définition : CL-5 est CL-5, et sa largeur est celle du catalogue.
   * Ses valeurs étaient pourtant recopiées sur la commande au moment de la choisir, et n'en
   * bougeaient plus : corriger la largeur d'une qualité ne changeait rien aux commandes qui la
   * portent, elles affichaient éternellement l'ancienne. C'est le catalogue qui fait foi.
   *
   * Le CONDITIONNEMENT échappe à cette règle : pièces par sac, sacs par carton sont des faits
   * d'expédition, relevés sur le packing list du fournisseur et écrits sur la commande. Ils
   * peuvent légitimement différer du catalogue d'un arrivage à l'autre.
   */
  const definition = ligneQualiteDuCatalogue(article, categories, generalCategories, type, ligneQualite);

  const lignes: LigneSpecification[] = [];
  for (const champ of modele) {
    if (champ.type === 'image') continue;
    // L'unité du rouleau de RUBAN (case ajoutée dans Qualités) ne s'imprime pas : les formulaires
    // de commande écrivent « m » par défaut sur chaque ruban, sans choix possible — la ligne
    // « Unité rouleau m » serait souvent fausse, et elle repousserait « Rouleaux/carton » au-delà
    // des 5 caractéristiques que les factures et les PI affichent.
    if (type === 'tape' && champ.key === 'rollLengthUnit') continue;
    const groupe = groupeDuChamp(champ);
    if (!retenus.has(groupe)) continue;
    const brut = groupe === 'technique' && rempli(definition?.[champ.key])
      ? definition[champ.key]
      : rempli(ligneQualite?.[champ.key]) ? ligneQualite[champ.key] : article?.[champ.key];
    if (!rempli(brut)) continue;
    const valeur = String(brut).trim();
    lignes.push({ cle: champ.key, label: champ.label, valeur: champ.uppercase ? valeur.toUpperCase() : valeur, groupe });
  }
  return lignes;
}

/**
 * L'article tel qu'il faut le LIRE : ses champs, corrigés par la définition de sa qualité.
 *
 * Beaucoup d'écrans lisent `article.fabricWidth` directement — la liste des articles d'un
 * dossier, le Data Lab, les documents envoyés au fournisseur et au client. Ils affichaient donc
 * la copie figée au moment de la saisie, et corriger une qualité ne changeait rien chez eux.
 * Ils passent maintenant par ici : un seul appel, et ils lisent la qualité d'aujourd'hui.
 *
 * Seules les CARACTÉRISTIQUES sont corrigées. Le conditionnement reste celui de l'expédition,
 * relevé sur le packing list du fournisseur.
 */
export function articleSelonCatalogue<T extends Record<string, any>>(
  article: T,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
): T {
  const type = specTypeDeLArticle(article, categories, generalCategories);
  const modele = type ? QUALITY_SCHEMA[type] : null;
  if (!modele) return article;

  const definition = ligneQualiteDuCatalogue(article, categories, generalCategories, type, ligneQualite);
  if (!definition) return article;

  const corrige: Record<string, any> = { ...article };
  for (const champ of modele) {
    if (groupeDuChamp(champ) !== 'technique') continue;
    if (rempli(definition[champ.key])) corrige[champ.key] = definition[champ.key];
  }
  return corrige as T;
}

/**
 * Les mêmes caractéristiques sur une seule ligne, pour une cellule de tableau ou un sous-titre :
 * « GSM 180 · Largeur (cm) 150 · Long. rouleau 100 ».
 */
export function specificationsEnLigne(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
  separateur = ' · ',
): string {
  return specificationsArticle(article, categories, generalCategories, ligneQualite)
    .map(l => `${l.label} ${l.valeur}`)
    .join(separateur);
}

/**
 * Le libellé de qualité d'un article ou d'une de ses lignes de ventilation. C'est le nom que le
 * fournisseur et le magasinier emploient (« CL-5 », « AUTOLOCK ») : il passe avant les
 * caractéristiques techniques sur un document.
 */
export function qualiteDeLArticle(article: any, ligneQualite?: any): string | null {
  const brut = ligneQualite?.quality ?? article?.quality ?? article?.qualityLabel;
  const texte = String(brut ?? '').trim();
  if (!texte || texte.toLowerCase() === 'various') return null;
  return texte;
}

/**
 * Ce qui identifie une ligne de marchandise sur un document : sa qualité, sa couleur, sa taille.
 * « various » ne veut rien dire pour un magasinier — c'est la marque interne d'un article ventilé,
 * elle ne doit jamais être imprimée.
 */
export function precisionsLigne(source: any): string[] {
  return [source?.quality, source?.color, source?.size]
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.toLowerCase() !== 'various');
}

/**
 * Une valeur de variante prete a imprimer : « various » est la marque interne d'un article
 * ventile, jamais une couleur ni une taille. L'imprimer revient a annoncer au magasinier, ou au
 * client, une marchandise qui n'existe pas.
 */
export function valeurImprimable(valeur: unknown, defaut = ''): string {
  return precisionsLigne({ color: valeur })[0] ?? defaut;
}
