/**
 * « Expédier » un article en production (PI) dans un dossier d'arrivage : toute
 * la commande, ou une partie (fractionner) — par ligne de répartition (couleurs,
 * designs, qualités, tailles) ou par quantité. Le packing list peut dire plus
 * que la commande : le surplus part avec elle.
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

import { repartition } from './repartition';

export type ModeExpedition = 'tout' | 'partiel';

export type DemandeExpedition = {
  article: any;
  dossier: { id: string; arrivalDate: string };
  /**
   * Quantité expédiée par ligne de répartition, même ordre que la fiche ; ou,
   * sans répartition, `quantite`. Absentes : toute la commande. Plus que la
   * commande est permis (surplus) ; moins laisse le reste en production.
   */
  parLigne?: number[];
  quantite?: number;
  /**
   * Le petit reste de la commande ne reste pas en production : la commande est
   * soldée avec ce qui part (choix confirmé par l'utilisateur).
   */
  ecraserReste?: boolean;
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
  /** Ce qui part au-delà de la commande (packing list plus généreux), dans l'unité de l'article. */
  surplus: number;
  /** Ce qui aurait dû rester en production et a été écrasé (0 sinon). */
  resteEcrase: number;
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

  // ── Ce qui part : les quantités saisies, toute la commande par défaut ─────
  // Le packing list peut dire plus que la commande : le surplus part aussi.
  let envoyees: any[] | null = null;
  let restantes: any[] | null = null;
  let qteEnvoyee: number;
  let qteRestante: number;
  let qteCommandee: number;
  let modifiee: boolean;
  let surplus = 0;
  if (rep && rep.lignes.length > 1) {
    const commandees = rep.lignes.map(l => nombre(l[rep.qte]));
    const parLigne = d.parLigne ? commandees.map((_, i) => Math.max(0, nombre(d.parLigne![i]))) : commandees;
    if (!parLigne.some(q => q > 0)) return { erreur: 'Saisis la quantité expédiée sur au moins une ligne.' };
    envoyees = rep.lignes.flatMap((l, i) => (parLigne[i] > 0 ? [{ ...l, [rep.qte]: arrondi(parLigne[i], 3) }] : []));
    restantes = rep.lignes.flatMap((l, i) => {
      const reste = arrondi(commandees[i] - parLigne[i], 3);
      return reste > 0 ? [{ ...l, [rep.qte]: reste }] : [];
    });
    qteEnvoyee = arrondi(parLigne.reduce((s, q) => s + q, 0), 3);
    qteRestante = arrondi(restantes.reduce((s, l) => s + nombre(l[rep.qte]), 0), 3);
    qteCommandee = commandees.reduce((s, q) => s + q, 0);
    modifiee = parLigne.some((q, i) => Math.abs(q - commandees[i]) > 1e-9);
    surplus = arrondi(parLigne.reduce((s, q, i) => s + Math.max(0, q - commandees[i]), 0), 3);
  } else {
    const q = d.quantite != null ? nombre(d.quantite) : qteArticle;
    if (!(q > 0)) return { erreur: 'Saisis la quantité expédiée.' };
    qteEnvoyee = arrondi(q, 3);
    qteRestante = Math.max(0, arrondi(qteArticle - q, 3));
    qteCommandee = qteArticle;
    modifiee = Math.abs(q - qteArticle) > 1e-9;
    surplus = Math.max(0, arrondi(q - qteArticle, 3));
    if (rep) {
      envoyees = [{ ...rep.lignes[0], [rep.qte]: qteEnvoyee }];
      restantes = qteRestante > 0 ? [{ ...rep.lignes[0], [rep.qte]: qteRestante }] : [];
    }
  }

  // ── Rien ne reste en production (ou le reste est écrasé) : l'article passe
  //    en entier, avec la quantité qui part, surplus compris ──────────────────
  const resteEcrase = d.ecraserReste && qteRestante > 0 ? qteRestante : 0;
  if (resteEcrase) modifiee = true;
  if (qteRestante <= 0 || resteEcrase) {
    const data: Record<string, any> = { ...transit, ...couleurNormalisee(a) };
    if (modifiee) {
      data.quantity = qteEnvoyee;
      if (rep && envoyees) Object.assign(data, champsRepartition(rep.champ, rep.cle, envoyees));
    }
    const poidsTout = d.poidsNet != null ? arrondi(d.poidsNet, 2) : modifiee ? part(a.netWeight, qteEnvoyee, qteCommandee, 2) : undefined;
    const volumeTout = d.volume != null ? arrondi(d.volume, 3) : modifiee ? part(a.cubicMeasurement, qteEnvoyee, qteCommandee, 3) : undefined;
    if (poidsTout != null) data.netWeight = poidsTout;
    if (volumeTout != null) data.cubicMeasurement = volumeTout;
    const couleur = modifiee && envoyees && rep?.champ === 'colorBreakdown'
      ? (envoyees.length === 1 ? envoyees[0][rep.cle] : 'various')
      : couleurFiche;
    return {
      ecritures: [{ op: 'update', id: a.id, data }],
      envoye: { quantite: modifiee ? qteEnvoyee : qteArticle, couleur },
      fusionneAvec: null,
      surplus,
      resteEcrase,
    };
  }

  // ── Une partie seulement : la part part, le reste reste en production ─────
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

  return { ecritures, envoye: { quantite: qteEnvoyee, couleur: couleurEnvoyee }, fusionneAvec: cible?.id ?? null, surplus, resteEcrase: 0 };
}
