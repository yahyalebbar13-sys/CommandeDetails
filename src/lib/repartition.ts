/**
 * La répartition d'un article (couleurs, designs, qualités, tailles) : le
 * champ qui la porte, et le champ de quantité de ses lignes.
 */

const CHAMPS_REPARTITION = [
  { champ: 'qualityBreakdown', qte: 'quantity', cle: 'quality' },
  { champ: 'designBreakdown', qte: 'rolls', cle: 'designRef' },
  { champ: 'colorBreakdown', qte: 'rolls', cle: 'colorCode' },
  { champ: 'sizeBreakdown', qte: 'quantity', cle: 'size' },
] as const;

export type Repartition = { champ: string; qte: string; cle: string; lignes: any[] };

/** La répartition qui porte la quantité (même ordre que la fiche article). */
export function repartition(a: any): Repartition | null {
  for (const r of CHAMPS_REPARTITION) {
    const lignes = a?.[r.champ];
    if (Array.isArray(lignes) && lignes.length) return { champ: r.champ, qte: r.qte, cle: r.cle, lignes };
  }
  return null;
}

/** Ce qu'on lit d'une ligne de répartition : « A501 », « 4.0CM »… */
export const libelleLigne = (r: Repartition, ligne: any) => String(ligne?.[r.cle] ?? '').trim();
