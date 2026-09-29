// ─── Sendit : le colis d'une commande (administrateur et équipe) ─────────────
// Crée le colis chez Sendit depuis la fiche d'une commande « à domicile », puis
// suit son statut. Tout se relit ici, côté serveur : la commande est écrite par
// le navigateur du client (total, frais, mode…), on ne croit rien sans vérifier.
//
// Ce que la commande doit être pour partir (lib/sendit.ts → controlerEnvoi) :
// confirmée ou en préparation, à domicile, sans article volumineux, téléphone
// marocain valable, quantités positives, sans remise, sous-total = somme des
// lignes, total = articles + livraison, 3 000 DH d'espèces au plus. Au-delà,
// l'administrateur seul peut faire encaisser une PARTIE (3 000 DH au plus),
// l'acompte déjà reçu étant noté ; jamais plus de 3 000 DH en espèces par colis.
// Virement choisi et pas encore vu : l'équipe ne peut pas envoyer (le client
// paierait deux fois) ; l'administrateur, seulement après accord du client.
//
// Anti double colis : une réservation dans shop_orders_interne/{id}.sendit
// (transaction). Si Sendit ne répond pas après l'envoi, ou répond par une erreur
// de passerelle (5xx, 408), le colis est peut-être créé : la réservation reste,
// et « Vérifier chez Sendit » cherche le colis par notre n° de commande avant de
// permettre un nouvel envoi — jamais avant 3 min (Sendit peut ne pas avoir fini
// de l'enregistrer). Un colis au même téléphone sans notre référence n'est
// jamais rattaché tout seul : l'équipe confirme son code.
//
// Où va le résultat : shop_orders_interne/{id}.sendit = { code, fee (frais Sendit),
// district { id, name }, montant encaissé, acompte?, le, par, statut, historique }
// (fermé aux navigateurs) ; la commande (lisible par le client) ne reçoit que
// { livraison: { transporteur: 'sendit', code } }. Le montant encaissé vaut 0
// quand l'administrateur a noté « paiement reçu » (virement vu sur le compte).
//
// GET  ?id=…                                   → état du colis + aperçu de l'envoi
// POST { id, action: 'envoyer', districtId, montantAttendu,
//        montantPartiel?, noteAcompte?, especesConfirmees? }   (les trois derniers : administrateur)
// POST { id, action: 'verifier', code? }       → après un envoi resté sans réponse ;
//                                                `code` : le colis que l'équipe a reconnu
// POST { id, action: 'rafraichir' }            → relit le colis chez Sendit

import { NextResponse } from 'next/server';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { fraisColisAttendus } from '@/lib/commandes-boutique';
import {
  ErreurSendit,
  MESSAGE_NON_CONFIGURE,
  PLAFOND_ESPECES_COLIS,
  appliquerStatutSendit,
  chercherColis,
  choisirColisRetrouve,
  codeColisValide,
  commandePourSendit,
  controlerEnvoi,
  corpsColis,
  creerColis,
  erreurSenditPour,
  idRamassage,
  lireColis,
  chercherQuartiers,
  montantPartielValide,
  paiementRecuDe,
  quartierParId,
  senditConfigure,
  suggererQuartier,
  telephoneSendit,
  urlEtiquetteSure,
  type ColisSendit,
  type CommandePourSendit,
  type QuartierSendit,
} from '@/lib/sendit';
import {
  LIBELLES_MENTION_SENDIT,
  codeStatutSendit,
  colisTermine,
  libelleStatutSendit,
  tonStatutSendit,
} from '@/lib/sendit-statuts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Connexion + liste des quartiers (à froid) + création : chaque appel Sendit a son propre délai.
export const maxDuration = 60;

const ID_COMMANDE = /^[A-Za-z0-9_-]{1,100}$/;
const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/**
 * Au-delà, un envoi « en cours » est considéré comme parti sans réponse : on vérifie avant
 * de renvoyer. Nettement au-dessus de maxDuration : la création peut durer connexion (15 s)
 * + envoi (25 s), deux fois sur une reconnexion, et une fonction coupée ne dit rien.
 */
const ENVOI_EN_COURS_MS = 3 * 60_000;
/**
 * « Vérifier » ne conclut pas « aucun colis » avant ce délai après l'envoi : juste après
 * notre abandon, Sendit peut ne pas avoir fini d'enregistrer le colis.
 */
const DELAI_AVANT_CONCLURE_MS = 3 * 60_000;
/** La suggestion de quartier ne doit pas faire attendre la fiche. */
const ATTENTE_SUGGESTION_MS = 4000;

type Role = 'admin' | 'staff';

const erreur = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: PAS_DE_CACHE });

function reponseErreurSendit(e: unknown, role: Role) {
  const r = erreurSenditPour(e, role);
  return erreur(r.statut, r.message, r.extra);
}

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function msDe(v: any): number | null {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}
const isoDe = (v: any) => {
  const ms = msDe(v);
  return ms === null ? null : new Date(ms).toISOString();
};
const nombreOuNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Même règle que la route interne : l'adresse Gmail de l'administrateur ne part pas vers /staff. */
const auteurLisible = (role: Role, auteur: string) => (role === 'staff' && auteur.includes('@') ? "l'administrateur" : auteur);

/**
 * Frais de colis que la grille donne pour cette commande (pour avertir si le client a payé
 * moins) : seuil de livraison offerte calculé sur la somme des lignes, jamais sur le
 * sous-total écrit par le client ; ancienne commande : ancienne livraison offerte.
 */
function fraisAttendus(c: CommandePourSendit): number | null {
  if (c.mode !== 'domicile') return null;
  try {
    return fraisColisAttendus(c.commande);
  } catch {
    return null;
  }
}

/** Le colis tel que la fiche l'affiche. Les frais Sendit (un coût de LEBTEX) : administrateur seulement. */
function colisAffiche(e: any, role: Role) {
  if (!e || typeof e !== 'object') return null;
  const code = codeColisValide(e.code) ? e.code : null;
  const enCoursMs = msDe(e.enCours);
  if (!code && enCoursMs === null && e.incertain !== true) return null;
  const statut = codeStatutSendit(e.statut);
  const statutRetour = codeStatutSendit(e.statutRetour);
  const typeAlerte = e.alerte?.type === 'a_rappeler' || e.alerte?.type === 'a_verifier' ? e.alerte.type as 'a_rappeler' | 'a_verifier' : null;
  const historique = (Array.isArray(e.historique) ? e.historique : [])
    .filter((h: any) => codeStatutSendit(h?.statut) && msDe(h?.le) !== null)
    .map((h: any) => ({
      statut: codeStatutSendit(h.statut) as string,
      libelle: libelleStatutSendit(h.statut),
      le: isoDe(h.le) as string,
      source: texte(h.source, 20),
    }))
    .sort((a: { le: string }, b: { le: string }) => Date.parse(a.le) - Date.parse(b.le))
    .slice(-12);
  const sansReponse = !code && (e.incertain === true || (enCoursMs !== null && Date.now() - enCoursMs >= ENVOI_EN_COURS_MS));
  return {
    code,
    statut,
    statutLibelle: statut ? libelleStatutSendit(statut) : null,
    statutRetour,
    statutRetourLibelle: statutRetour ? libelleStatutSendit(statutRetour) : null,
    ton: tonStatutSendit(statut),
    termine: colisTermine(statut, statutRetour),
    alerte: typeAlerte
      ? { type: typeAlerte, libelle: LIBELLES_MENTION_SENDIT[typeAlerte], explication: texte(e.alerte.explication, 300), le: isoDe(e.alerte.le) }
      : null,
    montant: nombreOuNull(e.montant),
    // Acompte déjà reçu (arrangement au-delà du plafond d'espèces) : l'équipe voit le montant, pas la note.
    acompte: nombreOuNull(e.acompte?.montant),
    ...(role === 'admin' ? {
      fee: nombreOuNull(e.fee),
      plafondAccepte: e.plafondAccepte === true,
      noteAcompte: texte(e.acompte?.note, 300) || null,
      especesConfirmees: e.especesConfirmees === true,
    } : {}),
    quartier: texte(e.district?.name, 120) || null,
    le: isoDe(e.le),
    par: auteurLisible(role, texte(e.par, 200)),
    statutLe: isoDe(e.statutLe),
    ramassage: e.ramassage && msDe(e.ramassage.le) !== null ? { le: isoDe(e.ramassage.le), code: texte(e.ramassage.code, 40) || null } : null,
    nouvelleTentative: texte(e.nouvelleTentative, 30) || null,
    tentatives: nombreOuNull(e.tentatives),
    message: texte(e.message, 300) || null,
    photo: urlEtiquetteSure(e.photo),
    enCours: !code && !sansReponse && enCoursMs !== null,
    sansReponse,
    historique,
  };
}

/** Quartier évident pour la ville du client, sans jamais faire attendre la fiche. */
async function suggestion(ville: string): Promise<QuartierSendit | null> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    // Une recherche par la ville (une question à Sendit), pas la liste entière.
    const liste = await Promise.race([
      chercherQuartiers('', ville, 200),
      new Promise<null>(resolve => { minuterie = setTimeout(() => resolve(null), ATTENTE_SUGGESTION_MS); }),
    ]);
    return liste ? suggererQuartier(liste, ville) : null;
  } catch {
    return null;
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
}

/** Tout ce que la fiche affiche : le colis (s'il existe) et l'aperçu de l'envoi. */
async function etatPour(db: Firestore, id: string, role: Role) {
  const [snap, snapInterne] = await Promise.all([
    db.collection('shop_orders').doc(id).get(),
    db.collection('shop_orders_interne').doc(id).get(),
  ]);
  if (!snap.exists) return null;
  const c = commandePourSendit(id, snap.data());
  const interne = snapInterne.data() ?? {};
  const paiementRecu = paiementRecuDe(interne);
  const controle = controlerEnvoi(c, { paiementRecu, fraisAttendus: fraisAttendus(c) });
  const colis = colisAffiche(interne.sendit, role);
  const configure = senditConfigure();
  const q = configure && !colis && controle.blocages.length === 0 ? await suggestion(c.commande.shippingAddress.city) : null;
  return {
    configure,
    commande: { id, numero: c.commande.orderNumber, statut: c.commande.status },
    mode: c.mode,
    volumineux: c.volumineux,
    paiement: c.paiement,
    paiementRecu,
    colis,
    apercu: {
      montant: controle.montant,
      telephone: controle.telephone,
      ville: c.commande.shippingAddress.city,
      blocages: controle.blocages,
      avertissements: controle.avertissements,
      plafondDepasse: controle.plafondDepasse,
      plafond: PLAFOND_ESPECES_COLIS,
      virementNonRecu: controle.virementNonRecu,
      /** Total de la commande : borne du montant partiel (administrateur). */
      total: Number(c.commande.total) || 0,
      quartierSuggere: q ? { id: q.id, name: q.name, ville: q.ville, delais: q.delais, price: role === 'admin' ? q.price : null } : null,
    },
  };
}

async function reponseEtat(db: Firestore, id: string, role: Role, extra: Record<string, unknown> = {}) {
  const etat = await etatPour(db, id, role).catch((err: any) => {
    console.error('[shop/sendit/envoyer] état illisible :', err?.code || err?.message || 'erreur');
    return null;
  });
  return NextResponse.json({ ok: true, ...extra, ...(etat ?? {}) }, { headers: PAS_DE_CACHE });
}

/**
 * Note le colis créé : l'interne reçoit tout (code, frais, qui, quand) et la
 * réservation disparaît ; la commande reçoit seulement le transporteur et le code.
 */
/** Ce qu'on garde de l'envoi : montant encaissé, acompte déjà reçu, espèces confirmées malgré un virement choisi. */
interface DetailsEnvoi {
  district: { id: number | null; name: string };
  montant: number | null;
  par: string;
  /** Au-delà du plafond : l'acompte déjà reçu, que Sendit n'encaisse pas. */
  acompte: { montant: number; note: string } | null;
  /** Virement choisi, pas reçu : l'administrateur a confirmé que le client paiera en espèces. */
  especesConfirmees: boolean;
}

/** Relu dans la réservation (`demande`) quand le colis est retrouvé après un envoi sans réponse. */
function detailsDeLaDemande(demande: any, auteur: string, colis: ColisSendit): DetailsEnvoi {
  const d = demande && typeof demande === 'object' ? demande : {};
  const acompte = d.acompte && typeof d.acompte === 'object' && nombreOuNull(d.acompte.montant) !== null
    ? { montant: d.acompte.montant as number, note: texte(d.acompte.note, 300) }
    : null;
  return {
    district: texte(d.district?.name, 120)
      ? { id: Number.isInteger(d.district?.id) ? d.district.id : null, name: texte(d.district.name, 120) }
      : { id: null, name: colis.quartier },
    montant: nombreOuNull(d.montant),
    par: texte(d.par, 200) || auteur,
    acompte,
    especesConfirmees: d.especesConfirmees === true,
  };
}

async function enregistrerColis(db: Firestore, id: string, colis: ColisSendit, d: DetailsEnvoi & { source: 'creation' | 'verification' }) {
  const le = Timestamp.now();
  const statut = colis.statut ?? 'PENDING';
  const batch = db.batch();
  batch.set(db.collection('shop_orders_interne').doc(id), {
    sendit: {
      code: colis.code,
      statut,
      statutLe: le,
      le,
      par: d.par,
      district: d.district,
      montant: d.montant,
      ...(typeof colis.fee === 'number' ? { fee: colis.fee } : {}),
      ...(d.acompte ? { acompte: { ...d.acompte, le, par: d.par } } : {}),
      ...(d.especesConfirmees ? { especesConfirmees: true } : {}),
      historique: FieldValue.arrayUnion({ statut, le, source: d.source }),
      enCours: FieldValue.delete(),
      incertain: FieldValue.delete(),
      incertainLe: FieldValue.delete(),
      demande: FieldValue.delete(),
    },
    majLe: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(db.collection('shop_orders').doc(id), {
    livraison: { transporteur: 'sendit', code: colis.code },
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

type Reservation = { cas: 'libre' } | { cas: 'deja'; code: string } | { cas: 'en_cours' } | { cas: 'sans_reponse' };

async function envoyer(db: Firestore, id: string, corps: any, role: Role, auteur: string) {
  if (!senditConfigure()) return reponseErreurSendit(new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure'), role);
  const districtId = Number(corps?.districtId);
  if (!Number.isInteger(districtId) || districtId <= 0 || districtId > 10_000_000) {
    return erreur(400, 'Choisissez le quartier du client dans la liste.');
  }
  const montantAttendu = Number(corps?.montantAttendu);

  const ref = db.collection('shop_orders').doc(id);
  const refInterne = db.collection('shop_orders_interne').doc(id);
  const [snap, snapInterne] = await Promise.all([ref.get(), refInterne.get()]);
  if (!snap.exists) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
  const c = commandePourSendit(id, snap.data());
  const interne = snapInterne.data() ?? {};
  if (codeColisValide(interne.sendit?.code)) {
    return erreur(409, `Le colis est déjà créé chez Sendit (code ${interne.sendit.code}).`, { code: interne.sendit.code });
  }

  const controle = controlerEnvoi(c, { paiementRecu: paiementRecuDe(interne), fraisAttendus: fraisAttendus(c) });
  if (controle.blocages.length) return erreur(422, controle.blocages[0], { blocages: controle.blocages });

  // Virement choisi, pas encore vu : Sendit encaisserait le total en espèces, et un client
  // qui a déjà viré paierait deux fois. L'équipe ne peut pas ; l'administrateur, après accord.
  const especesConfirmees = controle.virementNonRecu;
  if (controle.virementNonRecu) {
    if (role !== 'admin') {
      return erreur(422, 'Le client a choisi le virement et il n’est pas encore noté reçu : pas de colis Sendit. Demandez à l’administrateur.', { virement: true });
    }
    if (corps?.especesConfirmees !== true) {
      return erreur(409, 'Le client a choisi le virement : confirmez d’abord qu’il paiera finalement en espèces (vu au téléphone).', { virement: true });
    }
  }

  // Au-delà du plafond d'espèces, jamais le total : l'administrateur fait encaisser une partie
  // (3 000 DH au plus), l'acompte déjà reçu étant noté. Sans lui, pas de colis.
  let montant = controle.montant;
  let acompte: DetailsEnvoi['acompte'] = null;
  if (controle.plafondDepasse) {
    if (role !== 'admin') {
      return erreur(422, `Plus de ${PLAFOND_ESPECES_COLIS} DH en espèces : pas de colis Sendit. Proposez le virement au client, ou demandez à l’administrateur.`, { plafond: true });
    }
    const partiel = montantPartielValide(corps?.montantPartiel, controle.montant);
    const note = texte(corps?.noteAcompte, 300);
    if (partiel === null || !note) {
      return erreur(409, `Plus de ${PLAFOND_ESPECES_COLIS} DH en espèces : indiquez ce que Sendit encaisse (${PLAFOND_ESPECES_COLIS} DH au plus) et ce que le client a déjà payé.`, { plafond: true });
    }
    montant = partiel;
    acompte = { montant: Math.round((controle.montant - partiel) * 100) / 100, note };
  }
  // L'écran a montré un montant : si la commande ou le paiement ont bougé depuis, on ne l'envoie pas en aveugle.
  if (!Number.isFinite(montantAttendu) || Math.abs(montantAttendu - montant) > 0.009) {
    return erreur(409, `Le montant à encaisser a changé : ${montant} DH. Relisez l’aperçu avant d’envoyer.`, { montant });
  }

  const [quartier, ramassage] = await Promise.all([quartierParId(districtId), idRamassage()]);
  if (!quartier) return erreur(400, 'Ce quartier n’existe pas (ou plus) chez Sendit : choisissez-le à nouveau.');
  const corpsSendit = corpsColis(c, { districtId, ramassageId: ramassage.id, montant, telephone: controle.telephone as string });
  const details: DetailsEnvoi = { district: { id: quartier.id, name: quartier.name }, montant, par: auteur, acompte, especesConfirmees };

  // Réservation : deux appareils (ou un double appui) ne créent pas deux colis.
  const reservation = await db.runTransaction<Reservation>(async tx => {
    const s = await tx.get(refInterne);
    const e = s.data()?.sendit ?? {};
    if (codeColisValide(e.code)) return { cas: 'deja', code: e.code };
    const enCours = msDe(e.enCours);
    if (enCours !== null && Date.now() - enCours < ENVOI_EN_COURS_MS && e.incertain !== true) return { cas: 'en_cours' };
    if (enCours !== null || e.incertain === true) return { cas: 'sans_reponse' };
    tx.set(refInterne, {
      sendit: {
        enCours: Timestamp.now(),
        // Ce qu'il faudra noter si le colis est retrouvé après un envoi sans réponse.
        demande: {
          district: details.district,
          montant,
          par: auteur,
          ...(acompte ? { acompte } : {}),
          ...(especesConfirmees ? { especesConfirmees: true } : {}),
        },
      },
    }, { merge: true });
    return { cas: 'libre' };
  });
  if (reservation.cas === 'deja') return erreur(409, `Le colis est déjà créé chez Sendit (code ${reservation.code}).`, { code: reservation.code });
  if (reservation.cas === 'en_cours') return erreur(409, 'Un envoi à Sendit est déjà en cours pour cette commande (peut-être sur un autre appareil). Attendez quelques minutes.', { enCours: true });
  if (reservation.cas === 'sans_reponse') {
    return erreur(409, 'Un envoi précédent est resté sans réponse de Sendit : appuyez sur « Vérifier chez Sendit » avant de renvoyer.', { sansReponse: true });
  }

  let colis: ColisSendit;
  try {
    colis = await creerColis(corpsSendit);
  } catch (e) {
    // Pas de réponse, ou erreur de la passerelle de Sendit (502, 503, 504, 408) : le colis
    // est peut-être créé. La réservation reste, marquée « sans réponse » : on vérifie avant de renvoyer.
    if (!(e instanceof ErreurSendit) || e.peutEtreFait) {
      await refInterne.set({ sendit: { incertain: true, incertainLe: Timestamp.now(), enCours: FieldValue.delete() } }, { merge: true })
        .catch((err: any) => console.error('[shop/sendit/envoyer] marque « sans réponse » non écrite :', err?.code || 'erreur'));
      return erreur(504, 'Sendit n’a pas répondu clairement : le colis est peut-être créé. Dans quelques minutes, appuyez sur « Vérifier chez Sendit » avant de renvoyer.', { sansReponse: true });
    }
    // Refus clair de Sendit (4xx, « success: false ») : rien n'a été créé, on libère.
    await refInterne.set({ sendit: { enCours: FieldValue.delete(), demande: FieldValue.delete() } }, { merge: true })
      .catch((err: any) => console.error('[shop/sendit/envoyer] réservation non libérée :', err?.code || 'erreur'));
    return reponseErreurSendit(e, role);
  }

  try {
    await enregistrerColis(db, id, colis, { ...details, source: 'creation' });
  } catch (err: any) {
    // Le colis existe chez Sendit : on le dit quand même. La réservation reste,
    // et « Vérifier chez Sendit » le rattachera.
    console.error('[shop/sendit/envoyer] colis créé mais non noté :', err?.code || err?.message || 'erreur');
    return NextResponse.json({ ok: true, code: colis.code, note: false }, { headers: PAS_DE_CACHE });
  }
  return reponseEtat(db, id, role, { code: colis.code });
}

async function verifier(db: Firestore, id: string, corps: any, role: Role, auteur: string) {
  if (!senditConfigure()) return reponseErreurSendit(new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure'), role);
  const ref = db.collection('shop_orders').doc(id);
  const refInterne = db.collection('shop_orders_interne').doc(id);
  const [snap, snapInterne] = await Promise.all([ref.get(), refInterne.get()]);
  if (!snap.exists) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
  const e = snapInterne.data()?.sendit ?? {};
  if (codeColisValide(e.code)) return reponseEtat(db, id, role, { trouve: true, code: e.code });
  const enCours = msDe(e.enCours);
  if (enCours === null && e.incertain !== true) return reponseEtat(db, id, role, { trouve: false });
  if (enCours !== null && Date.now() - enCours < ENVOI_EN_COURS_MS && e.incertain !== true) {
    return erreur(409, 'Un envoi est en cours : attendez quelques minutes avant de vérifier.', { enCours: true });
  }

  const c = commandePourSendit(id, snap.data());
  const telephone = telephoneSendit(c.commande.shippingAddress.phone) ?? telephoneSendit(c.commande.customerPhone);
  // D'abord notre n° de commande (la référence du colis), puis le téléphone du client.
  const parNumero = await chercherColis(c.commande.orderNumber);
  let choix = choisirColisRetrouve(parNumero, c.commande.orderNumber, telephone ?? '');
  if (!choix.colis && !choix.ambigu && telephone) {
    choix = choisirColisRetrouve(await chercherColis(telephone), c.commande.orderNumber, telephone);
  }
  if (choix.ambigu) {
    return erreur(409, 'Plusieurs colis portent le n° de cette commande chez Sendit : ouvrez l’application Sendit, gardez le bon (supprimez le doublon), puis vérifiez de nouveau.', { ambigu: true });
  }

  // Un colis au même téléphone, sans notre n° de commande, peut être un colis créé à la
  // main (vente /stock…) : on ne le rattache que si l'équipe a confirmé CE code.
  const codeConfirme = codeColisValide(corps?.code) ? corps.code : null;
  const colis = choix.colis ?? (codeConfirme ? choix.candidats.find(x => x.code === codeConfirme) ?? null : null);
  if (!colis && choix.candidats.length) {
    return erreur(409, choix.candidats.length === 1
      ? `Chez Sendit, un colis en attente au même téléphone n’a pas notre n° de commande (code ${choix.candidats[0].code}). Vérifiez dans l’application Sendit que c’est bien celui de cette commande avant de le rattacher.`
      : 'Chez Sendit, plusieurs colis en attente au même téléphone n’ont pas notre n° de commande. Vérifiez dans l’application Sendit lequel est celui de cette commande avant de le rattacher.', {
      aConfirmer: true,
      candidats: choix.candidats.map(x => ({ code: x.code, statut: libelleStatutSendit(x.statut ?? 'PENDING'), quartier: x.quartier || null })),
    });
  }

  if (colis) {
    const autres = await db.collection('shop_orders_interne').where('sendit.code', '==', colis.code).limit(2).get();
    if (autres.docs.some(d => d.id !== id)) {
      return erreur(409, `Le colis ${colis.code} trouvé chez Sendit est déjà noté sur une autre commande : vérifiez dans l’application Sendit.`, { ambigu: true });
    }
    await enregistrerColis(db, id, colis, { ...detailsDeLaDemande(e.demande, auteur, colis), source: 'verification' });
    return reponseEtat(db, id, role, { trouve: true, code: colis.code });
  }

  // Rien chez Sendit. Juste après un envoi resté sans réponse, Sendit peut ne pas avoir fini
  // de l'enregistrer : on ne conclut « pas créé » qu'après quelques minutes.
  const depuis = Math.max(msDe(e.incertainLe) ?? 0, enCours ?? 0);
  if (depuis && Date.now() - depuis < DELAI_AVANT_CONCLURE_MS) {
    const minutes = Math.max(1, Math.ceil((DELAI_AVANT_CONCLURE_MS - (Date.now() - depuis)) / 60_000));
    return erreur(409, `Aucun colis trouvé chez Sendit pour l’instant, mais l’envoi est tout récent : vérifiez de nouveau dans ${minutes} minute${minutes > 1 ? 's' : ''} avant de renvoyer.`, { attendre: true });
  }
  // L'envoi n'est pas parti, on peut renvoyer. En transaction, pour ne pas effacer un
  // colis noté entre-temps par un autre appareil.
  await db.runTransaction(async tx => {
    const s = await tx.get(refInterne);
    if (codeColisValide(s.data()?.sendit?.code)) return;
    tx.set(refInterne, { sendit: { enCours: FieldValue.delete(), incertain: FieldValue.delete(), incertainLe: FieldValue.delete(), demande: FieldValue.delete() } }, { merge: true });
  });
  return reponseEtat(db, id, role, { trouve: false });
}

async function rafraichir(db: Firestore, id: string, role: Role) {
  if (!senditConfigure()) return reponseErreurSendit(new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure'), role);
  const snapInterne = await db.collection('shop_orders_interne').doc(id).get();
  const code = snapInterne.data()?.sendit?.code;
  if (!codeColisValide(code)) return erreur(400, 'Pas encore de colis Sendit pour cette commande.');
  const colis = await lireColis(code);
  const r = await appliquerStatutSendit(db, {
    commandeId: id,
    code,
    statut: colis.statut ?? 'PENDING',
    statutRetour: colis.statutRetour,
    source: 'lecture',
    lastActionAt: colis.derniereAction,
    fee: colis.fee,
  });
  return reponseEtat(db, id, role, { nouveauStatut: r.nouveauStatut ?? null });
}

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');
  try {
    const etat = await etatPour(dbAdmin(), id, check.role);
    if (!etat) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
    return NextResponse.json(etat, { headers: PAS_DE_CACHE });
  } catch (err: any) {
    console.error('[shop/sendit/envoyer GET]', err?.code || err?.message || 'erreur');
    return erreur(500, 'L’état du colis Sendit n’a pas pu être lu. Réessayez.');
  }
}

export async function POST(req: Request) {
  // Écriture : l'accès de l'équipe est relu dans la base (désactivation immédiate).
  const check = await verifyEquipe(req, { sansCache: true });
  if (!check.ok) return check.response;

  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }
  const id = typeof corps?.id === 'string' ? corps.id : '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');

  const db = dbAdmin();
  try {
    switch (corps.action) {
      case 'envoyer': return await envoyer(db, id, corps, check.role, check.auteur);
      case 'verifier': return await verifier(db, id, corps, check.role, check.auteur);
      case 'rafraichir': return await rafraichir(db, id, check.role);
      default: return erreur(400, 'Action inconnue');
    }
  } catch (err: any) {
    if (err instanceof ErreurSendit) return reponseErreurSendit(err, check.role);
    console.error('[shop/sendit/envoyer POST]', corps?.action, err?.code || err?.message || 'erreur');
    return erreur(500, 'Opération impossible pour le moment. Réessayez.');
  }
}
