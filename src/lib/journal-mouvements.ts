/**
 * Le journal des mouvements : libellés et totaux, partagés par l'écran (stock-movements.tsx) et
 * ses exports (Excel, PDF, « Bilan Vendredi »).
 *
 * Depuis les étagères de CHRIFA (src/lib/etageres.ts), un même produit se compte dans DEUX unités :
 * la réserve en sacs (ou rouleaux…), les étagères en pièces (ou mètres). Additionner les quantités
 * telles quelles donnait « Entrées +200, Sorties 10, Net +190 » pour une simple mise en rayon,
 * où rien n'est entré au magasin. D'où deux règles :
 *  - les totaux se font PAR UNITÉ (et réserve / étagères à part), jamais tout ensemble ;
 *  - une mise en rayon est un mouvement interne (réserve → étagères) : elle n'entre pas dans les
 *    totaux d'entrées et de sorties ; on dit seulement combien il y en a.
 *
 * Pur : vérifié par `npx tsx scripts/test-etageres.ts`.
 */

import { LIBELLE_MISE_EN_RAYON, uniteEnFrancais } from './etageres';

/** Les motifs, en clair. */
export const LIBELLES_MOTIF: Record<string, string> = {
  ARRIVAGE: 'Arrivage', VENTE: 'Vente', PERTE: 'Perte',
  RETOUR: 'Retour', INVENTAIRE: 'Inventaire', TRANSFERT: 'Transfert',
  // Retours en stock d'un bon déjà sorti (src/lib/bon-sans-prix.ts).
  ANNULATION_BON: 'Annulation de bon', CORRECTION_BON: 'Correction de bon',
  ACHAT_LOCAL: 'Achat local',
  // Des cartons ou rouleaux sortis de la réserve de CHRIFA pour garnir ses étagères.
  MISE_EN_RAYON: LIBELLE_MISE_EN_RAYON,
};

/** Le motif d'un mouvement, en clair (le code brut s'il est inconnu). */
export const libelleMotif = (reason: unknown): string =>
  LIBELLES_MOTIF[String(reason || '')] || String(reason || '');

/** « Étagères » ou « Réserve » (au magasin principal ; ailleurs, c'est simplement le stock). */
export const stockDuMouvement = (m: any): string => (m?.etagere === true ? 'Étagères' : 'Réserve');

/** L'unité dans laquelle la quantité du mouvement est comptée, telle qu'enregistrée. */
export const uniteDuMouvement = (m: any): string => String(m?.uniteReelle || m?.unitOfMeasure || '').trim();

/** Un mouvement interne réserve → étagères : hors des totaux d'entrées et de sorties. */
export const estMiseEnRayon = (m: any): boolean => m?.reason === 'MISE_EN_RAYON';

export interface TotalUnite {
  /** « sacs », « pièces (étagères) »… */
  libelle: string;
  quantite: number;
}

export interface TotauxJournal {
  entrees: TotalUnite[];
  sorties: TotalUnite[];
  net: TotalUnite[];
  /** Le nombre de mises en rayon (mouvements de l'entrée sur les étagères), laissées hors totaux. */
  misesEnRayon: number;
}

const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * Les totaux du journal, unité par unité, réserve et étagères à part, sans les mises en rayon.
 * Les ajustements n'y entrent pas (comme avant) : ils se lisent ligne à ligne.
 */
export function totauxJournal(mouvements: any[] | null | undefined): TotauxJournal {
  const parCle = new Map<string, { libelle: string; entrees: number; sorties: number }>();
  let misesEnRayon = 0;
  for (const m of mouvements || []) {
    if (estMiseEnRayon(m)) {
      if (m?.etagere === true && m?.type === 'IN') misesEnRayon += 1;
      continue;
    }
    if (m?.type !== 'IN' && m?.type !== 'OUT') continue;
    const unite = uniteDuMouvement(m);
    const cle = `${m?.etagere === true ? 'E' : 'R'}|${unite.toLowerCase()}`;
    let t = parCle.get(cle);
    if (!t) {
      const nom = uniteEnFrancais(unite) || 'unités';
      t = { libelle: m?.etagere === true ? `${nom} (étagères)` : nom, entrees: 0, sorties: 0 };
      parCle.set(cle, t);
    }
    const q = Number(m?.quantity) || 0;
    if (m.type === 'IN') t.entrees += q; else t.sorties += q;
  }
  const lignes = [...parCle.values()].sort((a, b) => (b.entrees + b.sorties) - (a.entrees + a.sorties));
  return {
    entrees: lignes.filter(t => t.entrees !== 0).map(t => ({ libelle: t.libelle, quantite: arrondi3(t.entrees) })),
    sorties: lignes.filter(t => t.sorties !== 0).map(t => ({ libelle: t.libelle, quantite: arrondi3(t.sorties) })),
    net: lignes.map(t => ({ libelle: t.libelle, quantite: arrondi3(t.entrees - t.sorties) })).filter(t => t.quantite !== 0),
    misesEnRayon,
  };
}

/** « 120 sacs · 400 pièces (étagères) » — « 0 » quand il n'y a rien. Signe « + » devant si demandé. */
export function texteTotaux(totaux: TotalUnite[], options: { signe?: boolean; max?: number } = {}): string {
  if (totaux.length === 0) return '0';
  const max = options.max ?? totaux.length;
  const nombre = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/[  ]/g, ' ');
  const textes = totaux.slice(0, max).map(t => `${options.signe && t.quantite > 0 ? '+' : ''}${nombre(t.quantite)} ${t.libelle}`);
  if (totaux.length > max) textes.push(`+ ${totaux.length - max} autre(s) unité(s)`);
  return textes.join(' · ');
}
