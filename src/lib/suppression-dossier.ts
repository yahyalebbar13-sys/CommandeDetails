/**
 * Ce que deviennent les articles d'un dossier d'arrivage qu'on supprime.
 *
 * Tant que la marchandise n'est pas entrée en stock, supprimer le dossier annule
 * l'expédition : ses articles en route repartent en production (PI), sans
 * dossier ni date d'arrivée — l'état d'avant « Expédier » ou l'import de la
 * facture fournisseur.
 *
 * Une part expédiée (originalOrderId ≠ id) rejoint sa commande d'origine quand
 * celle-ci attend en production : quantité, poids, volume et répartition
 * s'additionnent, et la part disparaît. Sinon (origine introuvable ou partie
 * dans un autre dossier, unité ou prix différents, répartitions qui ne
 * s'emboîtent pas), elle repart en production telle quelle.
 *
 * Un dossier déjà entré en stock ne renvoie rien en production : la marchandise
 * est arrivée. Ses articles sont seulement détachés, comme avant.
 *
 * Tout est pur : le composant applique les écritures dans un seul lot Firestore.
 */

import { repartition } from './rapprochement-facture';

export type EcritureSuppression =
  | { op: 'update'; id: string; data: Record<string, any>; retirer?: string[] }
  | { op: 'delete'; id: string };

export type PlanSuppression = {
  ecritures: EcritureSuppression[];
  /** Articles remis en production (les parts réunies n'y comptent pas). */
  enProduction: number;
  /** Parts expédiées réunies à leur commande d'origine. */
  reunies: number;
  /** Articles seulement détachés du dossier. */
  detaches: number;
};

const statutEnBase = (a: any) => a?.rawStatus ?? a?.status;
/** Statuts enregistrés d'un article parti avec un dossier (TRANSIT, CUSTOMS : anciennes fiches). */
const EN_ROUTE = ['SHIPPED', 'TRANSIT', 'CUSTOMS'];
const enRoute = (a: any) => EN_ROUTE.includes(statutEnBase(a));
/** Ce que le passage en transit (et une entrée en stock dévalidée) a laissé sur l'article. */
export const CHAMPS_TRANSIT = ['arrivalDate', 'stockEntryDate', 'validatedAt'];

const cle = (v: unknown) => String(v ?? '').trim().toUpperCase();
const nombre = (v: unknown) => Number(v) || 0;
const arrondi = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const REPARTITIONS = ['qualityBreakdown', 'designBreakdown', 'colorBreakdown', 'sizeBreakdown'];
/** Libellé et quantité d'une ligne, par répartition. */
const LIGNE: Record<string, { lib: string; qte: string }> = {
  qualityBreakdown: { lib: 'quality', qte: 'quantity' },
  designBreakdown: { lib: 'designRef', qte: 'rolls' },
  colorBreakdown: { lib: 'colorCode', qte: 'rolls' },
  sizeBreakdown: { lib: 'size', qte: 'quantity' },
};
/** Le champ de la fiche qui nomme la variante quand il n'y a pas de répartition. */
const UNIQUE: Record<string, string> = { colorBreakdown: 'color', sizeBreakdown: 'size' };

/** Les lignes d'une répartition ; une fiche sans répartition en fait une seule ligne de sa variante. */
function lignes(a: any, champ: string): any[] | null {
  if (Array.isArray(a?.[champ]) && a[champ].length) return a[champ];
  const unique = UNIQUE[champ];
  if (!unique || !cle(a?.[unique]) || cle(a[unique]) === 'VARIOUS') return null;
  return [{ [LIGNE[champ].lib]: a[unique], [LIGNE[champ].qte]: nombre(a.quantity) }];
}

/** Les lignes des deux fiches additionnées, variante par variante. */
function additionner(champ: string, o: any, p: any): Record<string, any> | null {
  // La dimension que la répartition ne porte pas doit être la même des deux côtés.
  const autre = champ === 'colorBreakdown' ? 'size' : champ === 'sizeBreakdown' ? 'color' : null;
  if (autre && cle(o[autre]) !== cle(p[autre])) return null;
  const lo = lignes(o, champ);
  const lp = lignes(p, champ);
  if (!lo || !lp) return null;
  const { lib, qte } = LIGNE[champ];
  const somme = lo.map(l => ({ ...l }));
  for (const l of lp) {
    const i = somme.findIndex(x => cle(x[lib]) === cle(l[lib]));
    if (i >= 0) somme[i] = { ...somme[i], [qte]: nombre(somme[i][qte]) + nombre(l[qte]) };
    else somme.push({ ...l });
  }
  const champs: Record<string, any> = { [champ]: somme };
  if (UNIQUE[champ]) champs[UNIQUE[champ]] = somme.length === 1 ? somme[0][lib] : 'various';
  return champs;
}

/**
 * La répartition après le retour de la part : {} quand les deux fiches sont la
 * même variante, les lignes additionnées sinon, null quand elles ne s'emboîtent pas.
 */
function repartitionReunie(o: any, p: any): Record<string, any> | null {
  const remplies = (a: any) => REPARTITIONS.filter(c => Array.isArray(a?.[c]) && a[c].length);
  // Couleurs ET tailles sur la même fiche : trop de façons de se tromper.
  if (remplies(o).length > 1 || remplies(p).length > 1) return null;
  const ro = repartition(o);
  const rp = repartition(p);
  if (!ro && !rp) {
    const memeCouleur = cle(o.color) === cle(p.color);
    const memeTaille = cle(o.size) === cle(p.size);
    if (memeCouleur && memeTaille) return {};
    // « Expédier » une couleur laisse deux fiches d'une couleur chacune : on refait la répartition.
    if (memeTaille) return additionner('colorBreakdown', o, p);
    if (memeCouleur) return additionner('sizeBreakdown', o, p);
    return null;
  }
  if (ro && rp && ro.champ !== rp.champ) return null;
  return additionner((ro ?? rp)!.champ, o, p);
}

/** Les champs de la commande d'origine `o` une fois la part `p` rentrée, ou null. */
function reunir(o: any, p: any): Record<string, any> | null {
  if (cle(o.unitOfMeasure) !== cle(p.unitOfMeasure)) return null;
  if (Math.abs(nombre(o.purchasePricePerUnit) - nombre(p.purchasePricePerUnit)) > 1e-9) return null;
  const variantes = repartitionReunie(o, p);
  if (!variantes) return null;
  const champs: Record<string, any> = { quantity: nombre(o.quantity) + nombre(p.quantity), ...variantes };
  // L'inverse du découpage au prorata ; jamais un poids ou un volume à 0 qui n'était pas là.
  const poids = nombre(o.netWeight) + nombre(p.netWeight);
  const volume = nombre(o.cubicMeasurement) + nombre(p.cubicMeasurement);
  if (poids > 0) champs.netWeight = arrondi(poids, 2);
  if (volume > 0) champs.cubicMeasurement = arrondi(volume, 3);
  // Le code produit du fournisseur sert à retrouver la commande au prochain import.
  if (!o.codeFournisseur && p.codeFournisseur) champs.codeFournisseur = p.codeFournisseur;
  return champs;
}

/**
 * @param articles tous les articles (les commandes d'origine peuvent être hors du dossier) ;
 *   statut affiché ou enregistré, `rawStatus` fait foi quand il est là.
 */
export function planSuppressionDossier(dossierId: string, dossierEnStock: boolean, articles: any[]): PlanSuppression {
  const duDossier = articles.filter(a => a.factureId === dossierId);
  if (dossierEnStock) {
    return {
      ecritures: duDossier.map(a => ({ op: 'update', id: a.id, data: { factureId: '', status: 'SHIPPED' } })),
      enProduction: 0,
      reunies: 0,
      detaches: duDossier.length,
    };
  }

  const parId = new Map(articles.map(a => [a.id, a]));
  // Une commande d'origine accueille une part si elle attend en production, ou y repart avec ce dossier.
  const accueille = (o: any) => !!o && (o.factureId === dossierId
    ? enRoute(o) || statutEnBase(o) === 'PI'
    : !o.factureId && statutEnBase(o) === 'PI');

  const reunions = new Map<string, Record<string, any>>();
  const reunies = new Set<string>();
  for (const p of duDossier) {
    const idOrigine = p.originalOrderId;
    if (!enRoute(p) || !idOrigine || idOrigine === p.id) continue;
    const origine = parId.get(idOrigine);
    if (!accueille(origine)) continue;
    // Plusieurs parts de la même commande s'additionnent l'une après l'autre.
    const champs = reunir({ ...origine, ...reunions.get(idOrigine) }, p);
    if (!champs) continue;
    reunions.set(idOrigine, { ...reunions.get(idOrigine), ...champs });
    reunies.add(p.id);
  }

  const ecritures: EcritureSuppression[] = [];
  let enProduction = 0;
  let detaches = 0;
  for (const a of duDossier) {
    if (reunies.has(a.id)) {
      ecritures.push({ op: 'delete', id: a.id });
      continue;
    }
    const champs = reunions.get(a.id) ?? {};
    if (enRoute(a)) {
      ecritures.push({ op: 'update', id: a.id, data: { ...champs, factureId: '', status: 'PI' }, retirer: CHAMPS_TRANSIT });
      enProduction++;
    } else {
      ecritures.push({ op: 'update', id: a.id, data: { ...champs, factureId: '' } });
      detaches++;
    }
  }
  // Les commandes d'origine qui attendaient déjà en production : seulement ce qui rentre.
  for (const [id, champs] of reunions) {
    if (parId.get(id)?.factureId !== dossierId) ecritures.push({ op: 'update', id, data: champs });
  }
  return { ecritures, enProduction, reunies: reunies.size, detaches };
}

/** Ce que la suppression fait des articles, en une phrase : avant de confirmer, puis dans le message final. */
export function effetsSuppression(plan: PlanSuppression): string {
  const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`;
  const effets = [
    plan.enProduction ? n(plan.enProduction, 'article repart en production', 'articles repartent en production') : '',
    plan.reunies ? n(plan.reunies, "part expédiée rejoint sa commande d'origine", "parts expédiées rejoignent leur commande d'origine") : '',
    plan.detaches ? n(plan.detaches, 'article est seulement détaché', 'articles sont seulement détachés') : '',
  ].filter(Boolean);
  return effets.length ? `${effets.join(', ')}.` : '';
}
