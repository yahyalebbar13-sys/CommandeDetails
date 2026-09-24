// ─── Recherche dans une liste de commandes ────────────────────────────────────
// Une commande se retrouve par tout ce qu'on en voit : produit, catégorie,
// pôle, fournisseur, conteneur, client, qualité, couleur, taille, design,
// spécifications. Plusieurs mots = tous doivent se retrouver (« nylon n3
// noir »). Sans accents ni casse : « fermeture » trouve « FERMETURE ».
//
// Pur : testé par scripts/test-recherche-commandes.ts.

/** Minuscules, sans accents, espaces resserrés. */
export function normaliserRecherche(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tout le texte sous lequel une commande doit pouvoir être retrouvée. */
export function texteDeCommande(o: any, nomDuPole?: string): string {
  const lignes = (liste: unknown, champs: string[]) =>
    Array.isArray(liste) ? liste.flatMap((r: any) => champs.map(c => r?.[c])) : [];
  return normaliserRecherche([
    o?.name, o?.nameFR, o?.categoryId, nomDuPole,
    o?.supplierId, o?.containerRef, o?.clientName, o?.factureId, o?.noBL,
    o?.quality, o?.qualityLabel, o?.color, o?.size, o?.specs,
    o?.zipperType, o?.slider, o?.sliderType, o?.design, o?.designRef,
    ...lignes(o?.qualityBreakdown, ['quality', 'nameFR', 'design']),
    ...lignes(o?.colorBreakdown, ['colorCode', 'colorName']),
    ...lignes(o?.sizeBreakdown, ['size']),
    ...lignes(o?.designBreakdown, ['design', 'designRef', 'ref']),
  ].filter(v => v !== undefined && v !== null && v !== '').join(' '));
}

/** La commande correspond-elle à la recherche ? Une recherche vide laisse tout passer. */
export function commandeCorrespond(o: any, recherche: string, nomDuPole?: string): boolean {
  const mots = normaliserRecherche(recherche).split(' ').filter(Boolean);
  if (!mots.length) return true;
  const texte = texteDeCommande(o, nomDuPole);
  return mots.every(m => texte.includes(m));
}
