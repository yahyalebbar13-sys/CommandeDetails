/**
 * « Expédier » un article en production (PI) dans un dossier d'arrivage : toute
 * la commande, ou une partie (fractionner) — par ligne de répartition (couleurs,
 * designs, qualités, tailles) ou par quantité.
 *
 * Passer en transit = `status: 'SHIPPED'` + `factureId` du dossier ; le statut
 * affiché (TRANSIT / DOUANE / STOCK) se déduit ensuite des dates du dossier.
 * Le poids net et le volume sont des totaux de ligne : ceux saisis (lus sur le
 * packing list) vont à la part expédiée ; sans saisie, l'estimation de la
 * fiche suit au prorata de la quantité. Le reste en production garde sa part
 * de l'estimation.
 *
 * Tout est pur : le composant applique les écritures dans un seul lot Firestore.
 */

import { libelleLigne, repartition } from './repartition';

export type ModeExpedition = 'tout' | 'partiel';

export type DemandeExpedition = {
  article: any;
  dossier: { id: string; arrivalDate: string };
  mode: ModeExpedition;
  /** Fractionner une répartition : quantité envoyée par ligne, même ordre que la fiche. */
  parLigne?: number[];
  /** Fractionner sans répartition : la quantité envoyée. */
  quantite?: number;
  /** Poids net total de la part expédiée (kg) ; null = estimation de la fiche. */
  poidsNet: number | null;
  /** Volume total de la part expédiée (m³) ; null = estimation de la fiche. */
  volume: number | null;
  /** Tous les articles : la part rejoint celle de la même commande déjà dans le dossier. */
  articles: any[];
  maintenant: unknown;
  nouvelId: () => string;
};

export type Ecriture = { op: 'set' | 'update'; id: string; data: Record<string, any> };

export type ResultatExpedition = {
  ecritures: Ecriture[];
  /** Ce qui part, pour prévenir le client. */
  envoye: { quantite: number; couleur: string };
  /** L'article du dossier qui reçoit la part (même commande, même prix), s'il y en a un. */
  fusionneAvec: string | null;
};

const CHAMPS_CALCULES = ['effectiveStatus', 'rawStatus', 'statutEnBase'];
const nombre = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arrondi = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const statutEnBase = (a: any) => a?.rawStatus ?? a?.status;

function sansChampsCalcules(a: any): Record<string, any> {
  const copie: Record<string, any> = {};
  for (const [k, v] of Object.entries(a)) if (!CHAMPS_CALCULES.includes(k) && v !== undefined) copie[k] = v;
  return copie;
}

/** La part d'une estimation (poids, volume) pour `qte` sur `total` ; absente si la fiche n'en a pas. */
function part(valeur: unknown, qte: number, total: number, d: number): number | undefined {
  const v = Number(valeur);
  if (!(v > 0) || !(total > 0)) return undefined;
  return arrondi((v * qte) / total, d);
}

/** Une couleur ou une taille d'après les lignes : la seule, sinon « various » (comme la fiche article). */
function champsRepartition(champ: string, cle: string, lignes: any[]): Record<string, any> {
  if (champ === 'colorBreakdown') {
    // Une seule couleur : la fiche porte la couleur, sans répartition (comme « Expédier » l'a toujours fait).
    return lignes.length === 1
      ? { colorBreakdown: null, color: lignes[0][cle] }
      : { colorBreakdown: lignes, color: 'various' };
  }
  const donnees: Record<string, any> = { [champ]: lignes };
  if (champ === 'sizeBreakdown') donnees.size = lignes.length === 1 ? lignes[0][cle] : 'various';
  return donnees;
}

/** Une répartition d'une seule couleur : la couleur de la fiche est ce code. */
function couleurNormalisee(a: any): Record<string, any> {
  const c = Array.isArray(a?.colorBreakdown) && a.colorBreakdown.length === 1 ? a.colorBreakdown[0]?.colorCode : null;
  return c && c !== a.color ? { color: c } : {};
}

/**
 * L'article du dossier qui vient de la même commande au même prix : une
 * deuxième part expédiée s'y ajoute au lieu de faire une deuxième ligne.
 */
export function cibleDansDossier(a: any, dossierId: string, articles: any[]): any | null {
  const origine = a.originalOrderId || a.id;
  const prix = nombre(a.purchasePricePerUnit);
  return articles.find(x =>
    x.id !== a.id
    && x.factureId === dossierId
    && !['PI', 'TO_ORDER'].includes(statutEnBase(x))
    && (x.originalOrderId === origine || x.id === origine)
    && Math.abs(nombre(x.purchasePricePerUnit) - prix) < 1e-9,
  ) ?? null;
}

/** Les lignes `ajout` additionnées à celles de `base`, par libellé. */
function additionner(champ: string, qteChamp: string, cle: string, base: any[], ajout: any[]): any[] {
  const lignes = base.map(l => ({ ...l }));
  for (const l of ajout) {
    const i = lignes.findIndex(x => String(x[cle] ?? '').trim().toUpperCase() === String(l[cle] ?? '').trim().toUpperCase());
    if (i >= 0) lignes[i] = { ...lignes[i], [qteChamp]: arrondi(nombre(lignes[i][qteChamp]) + nombre(l[qteChamp]), 3) };
    else lignes.push({ ...l });
  }
  return lignes;
}

export function planExpedition(d: DemandeExpedition): ResultatExpedition | { erreur: string } {
  const a = d.article;
  if (!d.dossier.id) return { erreur: 'Choisis le dossier (n° de facture / conteneur).' };
  if (!d.dossier.arrivalDate) return { erreur: "Il faut la date d'arrivée prévue du dossier." };
  const qteArticle = nombre(a.quantity);
  const rep = repartition(a);
  const transit = {
    factureId: d.dossier.id,
    status: 'SHIPPED',
    arrivalDate: d.dossier.arrivalDate,
    validatedAt: d.maintenant,
  };
  const couleurFiche = (Array.isArray(a.colorBreakdown) && a.colorBreakdown.length === 1 ? a.colorBreakdown[0]?.colorCode : a.color) || '';
  const poidsSaisis = (qte: number) => ({
    netWeight: d.poidsNet != null ? arrondi(d.poidsNet, 2) : part(a.netWeight, qte, qteArticle, 2),
    cubicMeasurement: d.volume != null ? arrondi(d.volume, 3) : part(a.cubicMeasurement, qte, qteArticle, 3),
  });

  // ── Toute la commande ──────────────────────────────────────────────────────
  if (d.mode === 'tout') {
    const data: Record<string, any> = { ...transit, ...couleurNormalisee(a) };
    if (d.poidsNet != null) data.netWeight = arrondi(d.poidsNet, 2);
    if (d.volume != null) data.cubicMeasurement = arrondi(d.volume, 3);
    return {
      ecritures: [{ op: 'update', id: a.id, data }],
      envoye: { quantite: qteArticle, couleur: couleurFiche },
      fusionneAvec: null,
    };
  }

  // ── Fractionner : ce qui part, ce qui reste ────────────────────────────────
  let envoyees: any[] | null = null;
  let restantes: any[] | null = null;
  let qteEnvoyee: number;
  let qteRestante: number;
  if (rep && rep.lignes.length > 1) {
    const parLigne = rep.lignes.map((_, i) => Math.max(0, nombre(d.parLigne?.[i])));
    const trop = rep.lignes.findIndex((l, i) => parLigne[i] > nombre(l[rep.qte]) + 1e-9);
    if (trop >= 0) return { erreur: `${libelleLigne(rep, rep.lignes[trop]) || `Ligne ${trop + 1}`} : plus que la commande (${nombre(rep.lignes[trop][rep.qte])}).` };
    if (!parLigne.some(q => q > 0)) return { erreur: 'Saisis la quantité expédiée sur au moins une ligne.' };
    if (rep.lignes.every((l, i) => parLigne[i] >= nombre(l[rep.qte]) - 1e-9)) {
      return { erreur: 'Tout part : choisis « Toute la commande » plutôt que fractionner.' };
    }
    envoyees = rep.lignes.flatMap((l, i) => (parLigne[i] > 0 ? [{ ...l, [rep.qte]: arrondi(parLigne[i], 3) }] : []));
    restantes = rep.lignes.flatMap((l, i) => {
      const reste = arrondi(nombre(l[rep.qte]) - parLigne[i], 3);
      return reste > 0 ? [{ ...l, [rep.qte]: reste }] : [];
    });
    qteEnvoyee = arrondi(envoyees.reduce((s, l) => s + nombre(l[rep.qte]), 0), 3);
    qteRestante = arrondi(restantes.reduce((s, l) => s + nombre(l[rep.qte]), 0), 3);
  } else {
    const q = nombre(d.quantite);
    if (!(q > 0) || q >= qteArticle) {
      return { erreur: `Quantité à expédier : plus de 0 et moins de ${qteArticle} ${a.unitOfMeasure || ''} (sinon, « Toute la commande »).` };
    }
    qteEnvoyee = arrondi(q, 3);
    qteRestante = arrondi(qteArticle - q, 3);
    if (rep) {
      envoyees = [{ ...rep.lignes[0], [rep.qte]: qteEnvoyee }];
      restantes = [{ ...rep.lignes[0], [rep.qte]: qteRestante }];
    }
  }

  const origine = a.originalOrderId || a.id;
  const poids = poidsSaisis(qteEnvoyee);
  const ecritures: Ecriture[] = [];
  const cible = cibleDansDossier(a, d.dossier.id, d.articles);
  const couleurEnvoyee = envoyees && rep?.champ === 'colorBreakdown'
    ? (envoyees.length === 1 ? envoyees[0][rep.cle] : 'various')
    : couleurFiche;

  if (cible) {
    // La part rejoint celle de la même commande déjà dans le dossier.
    const data: Record<string, any> = { quantity: arrondi(nombre(cible.quantity) + qteEnvoyee, 3) };
    if (rep && envoyees) {
      const repCible = repartition(cible);
      const base = repCible?.champ === rep.champ
        ? repCible.lignes
        // La cible n'a qu'une couleur, sans répartition : elle devient une ligne.
        : rep.champ === 'colorBreakdown' && cible.color && cible.color !== 'various'
          ? [{ colorCode: cible.color, rolls: nombre(cible.quantity) }]
          : [];
      Object.assign(data, champsRepartition(rep.champ, rep.cle, additionner(rep.champ, rep.qte, rep.cle, base, envoyees)));
    }
    if (poids.netWeight != null) data.netWeight = arrondi(nombre(cible.netWeight) + poids.netWeight, 2);
    if (poids.cubicMeasurement != null) data.cubicMeasurement = arrondi(nombre(cible.cubicMeasurement) + poids.cubicMeasurement, 3);
    ecritures.push({ op: 'update', id: cible.id, data });
  } else {
    const id = d.nouvelId();
    const data: Record<string, any> = {
      ...sansChampsCalcules(a),
      id,
      originalOrderId: origine,
      ...transit,
      quantity: qteEnvoyee,
      ...(rep && envoyees ? champsRepartition(rep.champ, rep.cle, envoyees) : couleurNormalisee(a)),
    };
    delete data.netWeight;
    delete data.cubicMeasurement;
    if (poids.netWeight != null) data.netWeight = poids.netWeight;
    if (poids.cubicMeasurement != null) data.cubicMeasurement = poids.cubicMeasurement;
    ecritures.push({ op: 'set', id, data });
  }

  // Le reste reste en production, avec sa part de l'estimation poids / volume.
  const reste: Record<string, any> = {
    quantity: qteRestante,
    originalOrderId: origine,
    ...(rep && restantes ? champsRepartition(rep.champ, rep.cle, restantes) : couleurNormalisee(a)),
  };
  const poidsReste = part(a.netWeight, qteRestante, qteArticle, 2);
  const volumeReste = part(a.cubicMeasurement, qteRestante, qteArticle, 3);
  if (poidsReste != null) reste.netWeight = poidsReste;
  if (volumeReste != null) reste.cubicMeasurement = volumeReste;
  if (a.factureId === d.dossier.id) reste.factureId = '';
  ecritures.push({ op: 'update', id: a.id, data: reste });

  return { ecritures, envoye: { quantite: qteEnvoyee, couleur: couleurEnvoyee }, fusionneAvec: cible?.id ?? null };
}
