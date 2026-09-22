// ─── Synchronisation d'un dossier d'arrivage avec ShipsGo ─────────────────────
// Serveur uniquement (Firestore admin + jeton ShipsGo). Deux entrées l'utilisent :
// le cron de nuit (tous les dossiers en cours) et le bouton « Actualiser » du
// dossier. La règle est la même dans les deux cas, elle vit donc ici.
//
// Ce qu'on écrit dans le dossier :
//   • `suivi`        — l'état du conteneur (cf. lib/suivi-conteneur.ts)
//   • `arrivalDate`  — la date de déchargement au port, d'où découle déjà le
//                      statut affiché partout (cf. lib/status-utils.ts)
//
// Ce qu'on n'écrit jamais : la date d'un dossier déjà entré en stock ou clos
// depuis plus d'un mois. Une fois la marchandise reçue, le voyage ne raconte
// plus rien d'utile et corriger la date fausserait l'historique.

import { ErreurShipsGo, lireSuivi, ouvrirSuivi, type CodeErreurShipsGo } from './shipsgo';
import {
  dateArriveeDuSuivi,
  instantDe,
  normaliserReference,
  referenceValide,
  resumerShipment,
  sansIndefinis,
  scacDeLaCompagnie,
  suiviTermine,
  typeReference,
  type SuiviConteneur,
} from './suivi-conteneur';
import { isArrivalOlderThanOneMonth } from './status-utils';
import { changementsNotables } from './suivi-changements';
import { notifierChangements } from './notifier-suivi';

export type IssueSynchro =
  | 'a-jour'           // suivi relu, rien de neuf dans le dossier
  | 'date-modifiee'    // la date d'arrivée du dossier a été corrigée
  | 'suivi-ouvert'     // premier appel : le suivi vient d'être créé (1 crédit)
  | 'sans-reference'   // aucun numéro de conteneur / BL à suivre
  | 'verrouille'       // dossier déjà en stock : on ne touche à rien
  | 'erreur';

export type ResultatSynchro = {
  factureId: string;
  issue: IssueSynchro;
  suivi?: SuiviConteneur;
  /** Date d'arrivée après synchronisation, quand elle a changé. */
  nouvelleDate?: string;
  ancienneDate?: string;
  creditsRestants?: number;
  message?: string;
  /** Renseigné quand l'échec vient de ShipsGo — « CREDITS » arrête un traitement en lot. */
  codeErreur?: CodeErreurShipsGo;
};

/**
 * Le dossier est-il figé ? (marchandise reçue, ou arrivage clos d'office)
 *
 * La clôture d'office après un mois suppose que la date d'arrivée est juste.
 * Tant que la compagnie dit le conteneur en route, on ne s'y fie pas : sinon
 * une date erronée figerait le dossier, et la vraie arrivée ne pourrait plus
 * jamais y être inscrite. Seule l'entrée en stock, saisie par un humain, ferme
 * vraiment un dossier.
 */
export function dossierVerrouille(facture: any): boolean {
  if (facture?.stockEntryDate) return true;
  const statut = facture?.suivi?.statut;
  if (statut && statut !== 'DISCHARGED' && statut !== 'UNTRACKED') return false;
  return isArrivalOlderThanOneMonth(facture?.arrivalDate);
}

/**
 * Écrit dans le dossier ce qu'un shipment ShipsGo raconte. Partagé par la
 * synchronisation (qui vient de le lire) et par le webhook (qui le reçoit sans
 * rien demander) : la règle d'écriture doit être la même des deux côtés.
 */
export async function appliquerShipment(
  db: any,
  adminUid: string,
  factureId: string,
  facture: any,
  shipment: any,
  opts: { reference?: string; forcerDate?: boolean } = {},
): Promise<ResultatSynchro> {
  const reference = opts.reference;
  const precedent: SuiviConteneur | undefined = facture?.suivi || undefined;
  const numero = shipment?.container_number || shipment?.booking_number || reference || '';

  const resume = resumerShipment(shipment);

  // Un webhook peut arriver après coup, ou être rejoué : une photo plus ancienne
  // que celle déjà enregistrée ne doit pas remplacer la récente.
  const avant = instantDe(precedent?.verifieLe);
  const apres = instantDe(resume.verifieLe);
  if (precedent?.shipmentId === resume.shipmentId && avant !== undefined && apres !== undefined && apres < avant) {
    return { factureId, issue: 'a-jour', suivi: precedent };
  }

  const suivi: SuiviConteneur = {
    ...resume,
    // ShipsGo renvoie le numéro qu'il a retenu ; on garde le nôtre s'il se tait.
    reference: numero,
    typeReference: typeReference(reference || numero),
    // Une écriture fusionnée garderait l'ancienne erreur pour toujours : on la
    // remet à plat explicitement à chaque succès.
    erreur: null,
  };

  const ancienneDate: string | undefined = facture?.arrivalDate || undefined;
  const nouvelleDate = dateArriveeDuSuivi(suivi);
  const verrouille = dossierVerrouille(facture);

  // La date du dossier ne correspond plus à celle que nous y avions mise :
  // quelqu'un l'a corrigée à la main depuis. On ne l'écrase plus — on se
  // contente de proposer celle de la compagnie, que le dossier affiche.
  const notreDerniere = precedent?.dateAppliquee;
  const mainHumaine = Boolean(notreDerniere) && ancienneDate !== notreDerniere;

  const dateAChanger =
    Boolean(nouvelleDate) &&
    nouvelleDate !== ancienneDate &&
    !verrouille &&
    (!mainHumaine || opts.forcerDate === true);

  if (dateAChanger) {
    suivi.dateAppliquee = nouvelleDate;
  } else if (notreDerniere) {
    suivi.dateAppliquee = notreDerniere;
  }
  if (!dateAChanger && nouvelleDate && nouvelleDate !== ancienneDate && !verrouille) {
    suivi.dateProposee = nouvelleDate;
  } else {
    // Une fusion Firestore garderait l'ancienne proposition pour toujours :
    // le dossier afficherait « la compagnie annonce le X » après l'avoir appliqué.
    suivi.dateProposee = null as unknown as undefined;
  }

  // Les alertes déjà parties restent inscrites : c'est ce registre, et non
  // l'état du suivi, qui décide de ce qu'il reste à annoncer.
  const dejaNotifie: string[] = Array.isArray(precedent?.notifie) ? precedent!.notifie! : [];
  suivi.notifie = dejaNotifie;

  const maj: Record<string, unknown> = { suivi };
  if (dateAChanger) {
    maj.arrivalDate = nouvelleDate;
    // Trace de la date saisie à la main, gardée une seule fois : elle permet de
    // revenir en arrière si la compagnie annonce n'importe quoi.
    if (!facture?.arrivalDateAvantSuivi && ancienneDate) maj.arrivalDateAvantSuivi = ancienneDate;
    maj.arrivalDateSource = 'shipsgo';
  }

  // Firestore refuse `undefined` et ferait échouer l'écriture entière : cf.
  // sansIndefinis(). Le filet est posé ici parce que TOUTES les écritures de
  // suivi passent par cette ligne.
  await db.doc(`users/${adminUid}/factures/${factureId}`).set(sansIndefinis(maj), { merge: true });

  // Prévenir seulement de ce qui a bougé pour de vrai, et une seule fois. Le
  // webhook, le cron et la relecture à l'ouverture d'un dossier voient tous les
  // trois le même changement : sans registre, l'alerte partirait trois fois.
  const changements = changementsNotables(precedent, suivi).filter(c => !dejaNotifie.includes(c.cle));
  if (changements.length) {
    try {
      await notifierChangements(factureId, suivi, changements);
      // Les clés ne sont inscrites qu'une fois l'envoi réussi : une alerte
      // perdue repartira au prochain passage plutôt que d'être oubliée.
      // Les cent dernières suffisent — un voyage en compte une dizaine.
      const registre = [...dejaNotifie, ...changements.map(c => c.cle)].slice(-100);
      await db.doc(`users/${adminUid}/factures/${factureId}`)
        .set({ suivi: { notifie: registre } }, { merge: true })
        .catch(() => { /* au pire, une alerte se répétera */ });
    } catch {
      // Notification impossible : le dossier est à jour, l'alerte réessaiera.
    }
  }

  return {
    factureId,
    issue: dateAChanger ? 'date-modifiee' : verrouille ? 'verrouille' : 'a-jour',
    suivi,
    nouvelleDate: dateAChanger ? nouvelleDate : undefined,
    ancienneDate: dateAChanger ? ancienneDate : undefined,
  };
}

/**
 * Met le dossier `factureId` à jour depuis ShipsGo.
 *
 * `reference` force un nouveau numéro à suivre (saisie depuis le dossier) ; sans
 * elle on reprend celui déjà enregistré. Ouvrir un suivi coûte un crédit, jamais
 * la relecture — d'où `autoriserOuverture`, que le cron laisse à false pour ne
 * dépenser que sur une action volontaire.
 */
export async function synchroniserDossier(
  db: any,
  adminUid: string,
  factureId: string,
  facture: any,
  opts: { reference?: string; autoriserOuverture?: boolean; forcerDate?: boolean; auto?: boolean } = {},
): Promise<ResultatSynchro> {
  const suiviActuel: SuiviConteneur | undefined = facture?.suivi || undefined;

  // Ouverture déclenchée toute seule (enregistrement d'un arrivage, rattrapage
  // en lot) : on ne dépense un crédit que là où il apprendra quelque chose. Un
  // clic explicite dans le dossier, lui, reste souverain.
  if (opts.auto && !suiviActuel?.shipmentId && dossierVerrouille(facture)) {
    return { factureId, issue: 'verrouille' };
  }

  const referenceDemandee = opts.reference ? normaliserReference(opts.reference) : '';
  if (referenceDemandee && !referenceValide(referenceDemandee)) {
    return {
      factureId,
      issue: 'erreur',
      message: `« ${referenceDemandee} » n'est ni un numéro de conteneur (AAAA1234567) ni un Master BL exploitable.`,
    };
  }

  const reference = referenceDemandee || suiviActuel?.reference || '';
  if (!reference) return { factureId, issue: 'sans-reference' };

  // Changer de numéro veut dire suivre un autre conteneur : on repart de zéro.
  const memeReference = suiviActuel?.reference === reference;
  let shipmentId = memeReference ? suiviActuel?.shipmentId : undefined;
  let creditsRestants: number | undefined;
  let venantDOuvrir = false;

  try {
    if (!shipmentId) {
      if (!opts.autoriserOuverture) return { factureId, issue: 'sans-reference' };
      const ouvert = await ouvrirSuivi({
        reference,
        // ShipsGo impose 5 caractères minimum et s'en sert pour le dédoublonnage.
        referenceInterne: `LEBTEX-${factureId}`,
        carrier: scacDeLaCompagnie(facture?.shippingLine, reference),
      });
      shipmentId = ouvert.shipmentId;
      creditsRestants = ouvert.creditsRestants;
      venantDOuvrir = !ouvert.deja;
    }

    const shipment = await lireSuivi(shipmentId);
    const resultat = await appliquerShipment(db, adminUid, factureId, facture, shipment, {
      reference,
      forcerDate: opts.forcerDate,
    });
    return {
      ...resultat,
      issue: resultat.issue === 'a-jour' && venantDOuvrir ? 'suivi-ouvert' : resultat.issue,
      creditsRestants,
    };
  } catch (e: any) {
    const message = e instanceof ErreurShipsGo ? e.message : `Suivi impossible : ${e?.message || e}`;
    // L'échec se voit dans le dossier sans effacer ce qu'on savait déjà.
    if (suiviActuel?.shipmentId) {
      await db.doc(`users/${adminUid}/factures/${factureId}`)
        .set(sansIndefinis({ suivi: { ...suiviActuel, erreur: message, majLe: new Date().toISOString() } }), { merge: true })
        .catch(() => { /* l'erreur d'origine prime sur celle-ci */ });
    }
    return { factureId, issue: 'erreur', message, suivi: suiviActuel, codeErreur: e instanceof ErreurShipsGo ? e.code : undefined };
  }
}

/**
 * Passe en revue les dossiers qui ont un suivi ouvert et qui bougent encore.
 * Séquentiel : ShipsGo traite les demandes d'une même société une par une et
 * répond 429 si on l'inonde.
 */
export async function synchroniserDossiersEnCours(
  db: any,
  adminUid: string,
): Promise<{ resultats: ResultatSynchro[]; examines: number }> {
  const snap = await db.collection(`users/${adminUid}/factures`).get();

  const aFaire: { id: string; data: any }[] = [];
  snap.forEach((d: any) => {
    const data = d.data();
    if (!data?.suivi?.shipmentId) return;          // suivi jamais ouvert
    if (dossierVerrouille(data)) return;           // marchandise déjà reçue
    if (suiviTermine(data.suivi)) return;          // conteneur déchargé : terminé
    aFaire.push({ id: d.id, data });
  });

  const resultats: ResultatSynchro[] = [];
  for (const { id, data } of aFaire) {
    resultats.push(await synchroniserDossier(db, adminUid, id, data));
  }
  return { resultats, examines: aFaire.length };
}
