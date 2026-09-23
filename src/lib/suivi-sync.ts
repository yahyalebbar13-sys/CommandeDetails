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
// Ce qu'on n'écrit jamais : quoi que ce soit dans un dossier fermé au suivi —
// entré en stock, ou conteneur arrivé (cf. dossierVerrouille) : ni suivi, ni
// date, ni alerte. Le suivi ne concerne que les arrivages attendus ; il est né
// en septembre 2026, les anciens conteneurs n'en ont pas et n'en auront pas.

import { ErreurShipsGo, lireSuivi, ouvrirSuivi, type CodeErreurShipsGo } from './shipsgo';
import {
  dateArriveeDuSuivi,
  dossierArrive,
  dossierVerrouille,
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
import { changementsNotables } from './suivi-changements';
import { notifierChangements } from './notifier-suivi';

export type IssueSynchro =
  | 'a-jour'           // suivi relu, rien de neuf dans le dossier
  | 'date-modifiee'    // la date d'arrivée du dossier a été corrigée
  | 'suivi-ouvert'     // premier appel : le suivi vient d'être créé (1 crédit)
  | 'sans-reference'   // aucun numéro de conteneur / BL à suivre
  | 'verrouille'       // dossier déjà en stock : on ne touche à rien
  | 'deja-arrive'      // conteneur déjà arrivé : pas de suivi à ouvrir
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

// La règle de fermeture vit dans suivi-conteneur.ts : le navigateur (panneau,
// liste des arrivages) et le serveur doivent décider exactement pareil.
export { dossierVerrouille };

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
  // Dossier réceptionné : le suivi n'a plus rien à y faire. Ni écriture, ni
  // alerte — un webhook tardif ne doit pas annoncer aux clients un conteneur
  // déjà vidé dans l'entrepôt.
  if (dossierVerrouille(facture)) return { factureId, issue: 'verrouille' };

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

  // La date du dossier suit la compagnie, toujours : c'est ShipsGo qui fait foi
  // tant que la marchandise n'est pas reçue. Une date retouchée à la main est
  // remplacée au passage suivant (la première saisie reste dans
  // arrivalDateAvantSuivi). `forcerDate` n'a donc plus rien à forcer ; il reste
  // accepté pour ne pas casser les appels existants.
  const dateAChanger = Boolean(nouvelleDate) && nouvelleDate !== ancienneDate;

  if (dateAChanger) {
    suivi.dateAppliquee = nouvelleDate;
  } else if (precedent?.dateAppliquee) {
    suivi.dateAppliquee = precedent.dateAppliquee;
  }
  // Plus de « date proposée » : on efface celle que d'anciennes versions ont pu
  // laisser (une fusion Firestore la garderait sinon pour toujours).
  suivi.dateProposee = null as unknown as undefined;

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
    issue: dateAChanger ? 'date-modifiee' : 'a-jour',
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

  // Dossier réceptionné : aucun appel à ShipsGo, qu'on le demande ou non.
  if (dossierVerrouille(facture)) return { factureId, issue: 'verrouille' };

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
      // Un suivi ne s'ouvre que sur un arrivage attendu — clic compris. Un
      // conteneur déjà arrivé n'a plus rien à annoncer ; le crédit serait perdu.
      if (dossierArrive(facture)) {
        return {
          factureId,
          issue: 'deja-arrive',
          message: 'Ce conteneur est déjà arrivé : le suivi ne concerne que les arrivages attendus.',
        };
      }
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
    // L'échec se voit dans le dossier sans effacer ce qu'on savait déjà. On
    // n'écrit QUE l'erreur : recopier `suiviActuel`, lu parfois des secondes
    // plus tôt, écraserait ce qu'un webhook vient d'y mettre.
    if (suiviActuel?.shipmentId) {
      await db.doc(`users/${adminUid}/factures/${factureId}`)
        .set({ suivi: { erreur: message, majLe: new Date().toISOString() } }, { merge: true })
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
  opts: { fraicheurMs?: number } = {},
): Promise<{ resultats: ResultatSynchro[]; examines: number }> {
  const maintenant = Date.now();
  const snap = await db.collection(`users/${adminUid}/factures`).get();

  const aRelire = (data: any, maintenant: number): boolean => {
    if (!data?.suivi?.shipmentId) return false;          // suivi jamais ouvert
    if (dossierVerrouille(data)) return false;           // arrivé, ou marchandise reçue
    if (suiviTermine(data.suivi)) return false;          // conteneur déchargé : terminé
    // Relu à l'instant (webhook, dossier ouvert) : rien de neuf à attendre.
    const relu = instantDe(data.suivi.majLe);
    if (opts.fraicheurMs && relu !== undefined && maintenant - relu < opts.fraicheurMs) return false;
    return true;
  };

  const aFaire: string[] = [];
  snap.forEach((d: any) => { if (aRelire(d.data(), maintenant)) aFaire.push(d.id); });

  const resultats: ResultatSynchro[] = [];
  for (const id of aFaire) {
    // Chaque dossier est relu juste avant d'être traité : pendant que la boucle
    // attend ShipsGo, le panneau ou un webhook a pu le mettre à jour — travailler
    // sur la photo du début renverrait les mêmes alertes et reculerait le suivi.
    const frais = await db.doc(`users/${adminUid}/factures/${id}`).get();
    const data = frais.exists ? frais.data() : null;
    if (!data || !aRelire(data, Date.now())) continue;
    resultats.push(await synchroniserDossier(db, adminUid, id, data));
  }
  return { resultats, examines: aFaire.length };
}
