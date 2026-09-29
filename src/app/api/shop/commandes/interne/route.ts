// ─── Boutique : ce que l'équipe écrit sur une commande ───────────────────────
// Le document shop_orders/{id} est lisible par le client (page de confirmation,
// suivi, espace client) : la note interne, le motif d'annulation et qui a fait
// quoi n'y vont pas. Ils vivent dans shop_orders_interne/{id}, une collection
// qu'aucune règle Firestore n'ouvre (donc fermée à tous les navigateurs) et que
// seule cette route, réservée à l'administrateur et à l'équipe (espace /staff,
// cf. require-equipe.ts), lit et écrit.
//
// Le changement de statut passe aussi par ici : la commande publique (statut +
// phrase du suivi client) et le journal interne (qui, quand, motif) s'écrivent
// dans la même transaction.
//
// L'e-mail de confirmation au client part aussi d'ici, toujours depuis
// EMAIL_LEBTEX (celle qu'annonce l'aperçu) : l'envoi est attendu (l'écran doit
// savoir si c'est parti) et chaque envoi réussi est noté dans
// shop_orders_interne/{id}.emailsClient (à qui, quand, par qui, à quel statut).
//
// « Paiement reçu » (virement vu sur le compte) aussi, dans shop_orders_interne/{id}.paiement :
// jamais dans la commande, que n'importe qui peut écrire à la création. Seul l'administrateur
// le pose : c'est lui qui voit le compte en banque.
//
// Après l'appel, l'équipe peut aussi changer le mode de réception et les frais
// (action « reception ») : un colis de plus de 3 000 DH qui finit en retrait, un
// rouleau finalement retiré à CHRIFA, les 45 DH d'une zone éloignée, le prix du
// transport convenu. Le serveur réécrit reception, deliveryFee et total (articles
// + frais − remise, recalculé ici), avec une trace (qui, quand, avant / après)
// dans shop_orders_interne/{id}.journalReception. Refusé si un colis Sendit existe
// déjà : son montant à encaisser est fixé chez Sendit.
//
// GET  ?id=…                                   → { noteInterne, motifAnnulation, journal, emailsClient,
//                                                   paiement, controleFrais, journalReception, peutValiderPaiement }
// POST { id, action: 'statut', statut, depuis, motif? }
// POST { id, action: 'note', note }
// POST { id, action: 'paiement', recu, note? }   (administrateur seulement : 403 pour l'équipe)
// POST { id, action: 'reception', mode, lieuRetrait?, preferenceTransport?, frais }
// POST { id, action: 'email-confirmation', forcer?, delai? } → { ok, envoyeA, le, statut }
//      échec : { error, incertain? } — `incertain` quand Gmail a coupé en plein envoi (peut-être parti).

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import {
  lignesCollentAuSousTotal, messageClient, receptionDe, totalDesLignes,
} from '@/lib/commandes-boutique';
import { lieuRetraitPour } from '@/lib/livraison-boutique';
import { emailDuClient } from '@/lib/alerte-commande-boutique';
import { EMAIL_LEBTEX, delaiLivraisonNettoye, echecEnvoiGmail, emailConfirmationClient, statutPermetConfirmation } from '@/lib/email-confirmation-client';
import { CHEMIN_REGLAGES_RECEPTION, lireReglagesReception, type ReglagesReception } from '@/lib/reglages-reception';
import { ORDER_STATUS_LABELS, type ModeReception, type OrderStatus, type ReceptionCommande } from '@/lib/shop-types';
// Pur : la même remise d'aplomb que la fiche, pour que l'e-mail envoyé soit celui de l'aperçu.
import { normaliserCommande } from '@/app/admin-shop/_commandes/normaliser-commande';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// L'envoi Gmail est attendu : de la marge au-delà des délais SMTP bornés plus bas.
export const maxDuration = 30;

const ID_COMMANDE = /^[A-Za-z0-9_-]{1,100}$/;
const STATUTS = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };

/** Statut lu dans la base ; une valeur inconnue compte comme « en attente » (comme à l'écran). */
const statutDe = (v: unknown): OrderStatus => (STATUTS.includes(v as OrderStatus) ? (v as OrderStatus) : 'pending');

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function msDe(v: any): number | null {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

/**
 * Qui a fait quoi, tel que l'équipe peut le lire. Le journal retient l'adresse
 * Gmail personnelle de l'administrateur : elle ne part jamais vers l'espace
 * /staff (donnée personnelle, et « par l'administrateur » se lit mieux).
 * « Équipe (…) » et « automatique » passent tels quels.
 */
function auteurLisiblePar(role: 'admin' | 'staff') {
  return (auteur: string) => (role === 'staff' && auteur.includes('@') ? "l'administrateur" : auteur);
}

/** Les e-mails envoyés au client, du plus ancien au plus récent (les 20 derniers suffisent à la fiche). */
function emailsClientDe(data: Record<string, any> | undefined, auteurLisible: (a: string) => string = a => a) {
  const liste = Array.isArray(data?.emailsClient) ? data!.emailsClient : [];
  return liste
    .filter((e: any) => e && typeof e.type === 'string' && msDe(e.le) !== null)
    .map((e: any) => ({
      type: texte(e.type, 40), a: texte(e.a, 254), le: new Date(msDe(e.le)!).toISOString(), auteur: auteurLisible(texte(e.auteur, 200)),
      // Statut de la commande à l'envoi : « en attente » = accusé de réception, sinon confirmation.
      statut: STATUTS.includes(e.statut) ? (e.statut as OrderStatus) : '',
    }))
    .sort((x: { le: string }, y: { le: string }) => Date.parse(x.le) - Date.parse(y.le))
    .slice(-20);
}

/** « Paiement reçu » tel que la fiche l'affiche, ou null. */
function paiementDe(data: Record<string, any> | undefined, auteurLisible: (a: string) => string) {
  const p = data?.paiement;
  if (!p || typeof p !== 'object' || typeof p.recu !== 'boolean') return null;
  const ms = msDe(p.le);
  const par = texte(p.par, 200);
  const note = texte(p.note, 300);
  return {
    recu: p.recu as boolean,
    ...(ms !== null ? { le: new Date(ms).toISOString() } : {}),
    ...(par ? { par: auteurLisible(par) } : {}),
    ...(note ? { note } : {}),
  };
}

/** Frais recalculés par la route d'alerte à l'arrivée de la commande, ou null. */
function controleFraisDe(data: Record<string, any> | undefined) {
  const c = data?.controleFrais;
  const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!c || typeof c !== 'object') return null;
  const saisis = nombre(c.saisis);
  const ecart = nombre(c.ecart);
  if (saisis === null || ecart === null) return null;
  return { attendus: nombre(c.attendus), saisis, ecart };
}

const MODES: ModeReception[] = ['domicile', 'retrait', 'transport'];

/** Les changements de réception notés (les 10 derniers), pour la fiche. */
function journalReceptionDe(data: Record<string, any> | undefined, auteurLisible: (a: string) => string) {
  const liste = Array.isArray(data?.journalReception) ? data!.journalReception : [];
  const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return liste
    .filter((e: any) => e && msDe(e.le) !== null && e.apres && typeof e.apres === 'object')
    .map((e: any) => ({
      le: new Date(msDe(e.le)!).toISOString(),
      par: auteurLisible(texte(e.par, 200)),
      mode: MODES.includes(e.apres.mode) ? e.apres.mode as ModeReception : 'domicile',
      frais: nombre(e.apres.frais),
      total: nombre(e.apres.total),
    }))
    .sort((x: { le: string }, y: { le: string }) => Date.parse(x.le) - Date.parse(y.le))
    .slice(-10);
}

/** Forme renvoyée au navigateur : dates en ISO, rien d'autre que ce qu'affiche la fiche. */
function versReponse(data: Record<string, any> | undefined, role: 'admin' | 'staff') {
  const journal = Array.isArray(data?.journal) ? data!.journal : [];
  const auteurLisible = auteurLisiblePar(role);
  return {
    noteInterne: texte(data?.noteInterne, 2000),
    motifAnnulation: texte(data?.motifAnnulation, 300),
    journal: journal
      .filter((e: any) => e && STATUTS.includes(e.statut) && msDe(e.le) !== null)
      .map((e: any) => ({ statut: e.statut as OrderStatus, auteur: auteurLisible(texte(e.auteur, 200)), le: new Date(msDe(e.le)!).toISOString() })),
    emailsClient: emailsClientDe(data, auteurLisible),
    paiement: paiementDe(data, auteurLisible),
    controleFrais: controleFraisDe(data),
    journalReception: journalReceptionDe(data, auteurLisible),
    // L'écran n'affiche le bouton « Paiement reçu » qu'à qui peut s'en servir ; le POST revérifie.
    peutValiderPaiement: role === 'admin',
  };
}

/**
 * Magasins et camionnette réglés par le patron (lecture publique) : l'e-mail envoyé
 * cite les mêmes adresses que l'aperçu de la fiche. Illisibles : valeurs par défaut.
 */
async function reglagesReception(db: Firestore): Promise<ReglagesReception> {
  try {
    const snap = await db.collection(CHEMIN_REGLAGES_RECEPTION.collection).doc(CHEMIN_REGLAGES_RECEPTION.document).get();
    return lireReglagesReception(snap.data());
  } catch (err: any) {
    console.error('[shop/commandes/interne] réglages de réception illisibles :', err?.code || err?.message || 'erreur');
    return lireReglagesReception(undefined);
  }
}

const erreur = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: PAS_DE_CACHE });

// ─── E-mail de confirmation au client ─────────────────────────────────────────

/** En deçà, un deuxième envoi est sans doute un double clic (ou un deuxième appareil) : on demande. */
const DELAI_RENVOI_MS = 2 * 60_000;
/** Un envoi « en cours » plus ancien est considéré comme abandonné (fonction coupée). */
const ENVOI_EN_COURS_MAX_MS = 60_000;

/** Pour dire pourquoi on n'envoie pas (ORDER_STATUS_LABELS est au masculin). */
const STATUT_FINAL_LISIBLE: Partial<Record<OrderStatus, string>> = {
  delivered: 'déjà livrée',
  cancelled: 'annulée',
  returned: 'revenue au dépôt',
};

type Reservation =
  | { cas: 'libre' }
  | { cas: 'recente'; le: number; enCours: boolean };

/**
 * Dernier e-mail noté pour ce client (confirmation envoyée d'ici, ou accusé de
 * réception automatique), en millisecondes (ou null).
 */
function dernierEmailClient(data: Record<string, any> | undefined): number | null {
  const liste = Array.isArray(data?.emailsClient) ? data!.emailsClient : [];
  let dernier: number | null = null;
  for (const e of liste) {
    const ms = e?.type === 'confirmation' || e?.type === 'reception' ? msDe(e.le) : null;
    if (ms !== null && (dernier === null || ms > dernier)) dernier = ms;
  }
  return dernier;
}

/**
 * Réglage de l'envoi des e-mails à faire (variables Vercel, mot de passe
 * d'application) : l'administrateur reçoit la marche à suivre ; l'équipe, qui
 * n'a accès ni à Vercel ni à Gmail, reçoit quoi faire, elle, en attendant.
 */
const REGLAGE_EMAIL_POUR_EQUIPE =
  'E-mail non envoyé : l’envoi des e-mails n’est pas encore réglé sur le site. Prévenez l’administrateur ; '
  + 'en attendant, confirmez la commande au client par téléphone ou WhatsApp.';

async function envoyerConfirmation(
  ref: DocumentReference,
  refInterne: DocumentReference,
  id: string,
  forcer: boolean,
  delai: string,
  auteur: string,
  role: 'admin' | 'staff',
): Promise<NextResponse> {
  const pourEquipe = role === 'staff';
  const snap = await ref.get();
  if (!snap.exists) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
  // Remise d'aplomb identique à celle de la fiche : l'e-mail envoyé est exactement l'aperçu relu.
  const commande = normaliserCommande(id, snap.data());

  const emailClient = emailDuClient(commande);
  if (!emailClient) return erreur(400, 'Cette commande n’a pas d’adresse e-mail valable.');
  const statut = commande.status;
  if (!statutPermetConfirmation(statut)) {
    return erreur(400, `Cette commande est ${STATUT_FINAL_LISIBLE[statut] || 'terminée'} : il n’y a plus de confirmation à envoyer.`);
  }

  // La configuration d'abord : sans elle, inutile de réserver l'envoi.
  // Tout part de EMAIL_LEBTEX, l'adresse qu'annonce l'aperçu : jamais d'un autre compte.
  const gmailUser = (process.env.GMAIL_USER || '').trim();
  if (gmailUser && gmailUser.toLowerCase() !== EMAIL_LEBTEX) {
    return erreur(503, pourEquipe ? REGLAGE_EMAIL_POUR_EQUIPE :
      `E-mail non envoyé : sur Vercel, la variable GMAIL_USER vaut une autre adresse que ${EMAIL_LEBTEX}. `
      + `Mettez-y ${EMAIL_LEBTEX} (ou supprimez-la), avec le mot de passe d’application de ce compte dans GMAIL_APP_PASSWORD, puis redéployez le site.`);
  }
  const appPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!appPass) {
    return erreur(503, pourEquipe ? REGLAGE_EMAIL_POUR_EQUIPE :
      'E-mail non envoyé : la variable GMAIL_APP_PASSWORD manque sur Vercel (Settings → Environment Variables). '
      + `Collez-y le mot de passe d’application de ${EMAIL_LEBTEX}, puis redéployez le site.`);
  }

  // Construit avant de réserver : une commande illisible ne bloque pas les envois suivants.
  const e = emailConfirmationClient(commande, { delaiLivraison: delai, reglages: await reglagesReception(ref.firestore) });

  // Anti double clic, dans une transaction : deux appuis simultanés (ou deux
  // appareils) ne peuvent pas envoyer deux e-mails sans qu'on le demande.
  const reservation = await refInterne.firestore.runTransaction<Reservation>(async tx => {
    const s = await tx.get(refInterne);
    const data = s.data();
    const maintenant = Date.now();
    if (!forcer) {
      const dernier = dernierEmailClient(data);
      if (dernier !== null && maintenant - dernier < DELAI_RENVOI_MS) return { cas: 'recente', le: dernier, enCours: false };
      const enCours = msDe(data?.confirmationEnCoursLe);
      if (enCours !== null && maintenant - enCours < ENVOI_EN_COURS_MAX_MS) return { cas: 'recente', le: enCours, enCours: true };
    }
    tx.set(refInterne, { confirmationEnCoursLe: Timestamp.fromMillis(maintenant) }, { merge: true });
    return { cas: 'libre' };
  });
  if (reservation.cas === 'recente') {
    return erreur(409,
      reservation.enCours
        ? 'Un envoi est déjà en cours pour ce client.'
        : 'Un e-mail vient déjà d’être envoyé à ce client.',
      { dejaEnvoyeeLe: new Date(reservation.le).toISOString(), enCours: reservation.enCours });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: EMAIL_LEBTEX, pass: appPass },
      // Sans délais, un serveur SMTP muet tiendrait la fonction (et le bouton) indéfiniment.
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    });
    await transporter.sendMail({
      from: `"LEBTEX" <${EMAIL_LEBTEX}>`,
      to: emailClient,
      replyTo: EMAIL_LEBTEX,
      subject: e.sujet,
      html: e.html,
      text: e.texte,
    });
  } catch (err: any) {
    // Les codes seuls : le message de Gmail peut contenir l'adresse du client.
    console.error('[shop/commandes/interne] confirmation non envoyée :', err?.code || 'erreur', err?.command || '', err?.responseCode || '');
    const echec = echecEnvoiGmail(err);
    // Peut-être parti : la réservation reste (elle expire seule au bout d'une minute),
    // pour qu'un nouvel appui n'envoie pas tout de suite un deuxième e-mail.
    if (!echec.incertain) await refInterne.set({ confirmationEnCoursLe: FieldValue.delete() }, { merge: true }).catch(() => {});
    // Gmail refuse la connexion du compte : c'est le même réglage à faire (cf. plus haut).
    const message = pourEquipe && err?.code === 'EAUTH' ? REGLAGE_EMAIL_POUR_EQUIPE : echec.message;
    return erreur(502, message, echec.incertain ? { incertain: true } : {});
  }

  const le = Timestamp.fromMillis(Date.now());
  const reponse = { ok: true, envoyeA: emailClient, le: le.toDate().toISOString(), statut };
  try {
    await refInterne.set({
      emailsClient: FieldValue.arrayUnion({ type: 'confirmation', a: emailClient, le, auteur, statut, ...(delai ? { delai } : {}) }),
      confirmationEnCoursLe: FieldValue.delete(),
    }, { merge: true });
  } catch (err: any) {
    // L'e-mail est parti : on le dit quand même, la fiche l'affiche d'après cette réponse.
    console.error('[shop/commandes/interne] confirmation envoyée mais non notée :', err?.code || err?.message || 'erreur');
    return NextResponse.json({ ...reponse, note: false }, { headers: PAS_DE_CACHE });
  }
  return NextResponse.json(reponse, { headers: PAS_DE_CACHE });
}

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');
  try {
    const snap = await dbAdmin().collection('shop_orders_interne').doc(id).get();
    return NextResponse.json(versReponse(snap.data(), check.role), { headers: PAS_DE_CACHE });
  } catch (err: any) {
    console.error('[shop/commandes/interne GET]', err?.code || err?.message || 'erreur');
    return erreur(500, 'La note de l’équipe n’a pas pu être lue. Réessayez.');
  }
}

type Resultat =
  | { cas: 'absente' }
  | { cas: 'conflit'; actuel: OrderStatus }
  | { cas: 'ok' };

/** Au-delà, une faute de frappe (le prix d'un rouleau tapé dans les frais) : refusé. */
const FRAIS_MAX = 10_000;
const STATUTS_FIGES: OrderStatus[] = ['delivered', 'cancelled', 'returned'];

type ResultatReception =
  | { cas: 'absente' }
  | { cas: 'refus'; message: string }
  | { cas: 'ok'; total: number; frais: number; reception: ReceptionCommande };

interface ReceptionDemandee {
  mode: ModeReception;
  lieuRetrait?: 'derb_omar' | 'chrifa';
  preferenceTransport?: 'camionnette' | 'transporteur';
  frais: number;
}

/**
 * Nouveau mode et nouveaux frais, relus : valeurs permises seulement, frais en DH (0 à
 * 10 000, deux décimales). Sinon, la raison du refus.
 */
function receptionDemandee(corps: any): ReceptionDemandee | string {
  const mode = MODES.includes(corps?.mode) ? corps.mode as ModeReception : null;
  if (!mode) return 'Mode de réception inconnu.';
  const brut = typeof corps?.frais === 'number' ? corps.frais : typeof corps?.frais === 'string' ? Number(corps.frais.replace(',', '.')) : NaN;
  if (!Number.isFinite(brut) || brut < 0 || brut > FRAIS_MAX) return `Frais illisibles : un montant en DH, de 0 à ${FRAIS_MAX}.`;
  const frais = Math.round(brut * 100) / 100;
  const lieuRetrait = corps?.lieuRetrait === 'derb_omar' || corps?.lieuRetrait === 'chrifa' ? corps.lieuRetrait : undefined;
  const preferenceTransport = corps?.preferenceTransport === 'camionnette' || corps?.preferenceTransport === 'transporteur' ? corps.preferenceTransport : undefined;
  return {
    mode,
    ...(mode === 'retrait' && lieuRetrait ? { lieuRetrait } : {}),
    ...(mode === 'transport' && preferenceTransport ? { preferenceTransport } : {}),
    frais,
  };
}

export async function POST(req: Request) {
  // Écriture : l'accès est relu dans la base (pas de copie en mémoire), pour
  // qu'un accès désactivé ou un mot de passe changé bloque tout de suite.
  const check = await verifyEquipe(req, { sansCache: true });
  if (!check.ok) return check.response;

  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }
  const id = typeof corps?.id === 'string' ? corps.id : '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');

  const db = dbAdmin();
  const ref = db.collection('shop_orders').doc(id);
  const refInterne = db.collection('shop_orders_interne').doc(id);
  // L'auteur vient du jeton vérifié, jamais du corps de la requête :
  // l'e-mail de l'administrateur, ou « Équipe (identifiant) ».
  const auteur = check.auteur;

  try {
    if (corps.action === 'note') {
      const note = texte(corps.note, 2000);
      const snap = await ref.get();
      if (!snap.exists) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
      await refInterne.set(
        { noteInterne: note, noteModifieeLe: FieldValue.serverTimestamp(), noteModifieePar: auteur },
        { merge: true },
      );
      return NextResponse.json({ ok: true }, { headers: PAS_DE_CACHE });
    }

    if (corps.action === 'statut') {
      const statut = corps.statut as OrderStatus;
      if (!STATUTS.includes(statut)) return erreur(400, 'Statut inconnu');
      const depuis = STATUTS.includes(corps.depuis) ? (corps.depuis as OrderStatus) : null;
      const motif = statut === 'cancelled' ? texte(corps.motif, 300) : '';

      const resultat = await db.runTransaction<Resultat>(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { cas: 'absente' };
        const actuel = statutDe(snap.data()?.status);
        // Déjà fait (double appui, deuxième appareil) : rien à écrire.
        if (actuel === statut) return { cas: 'ok' };
        // Changée entre-temps : on n'enchaîne pas une étape à l'aveugle.
        if (depuis && actuel !== depuis) return { cas: 'conflit', actuel };

        // Même instant dans le suivi client et dans le journal : la fiche les rapproche.
        const le = Timestamp.fromMillis(Date.now());
        // La phrase suit le mode : « Commande retirée », pas « livrée », pour qui est venu au magasin.
        const message = messageClient(normaliserCommande(id, snap.data()), statut);
        tx.update(ref, {
          status: statut,
          updatedAt: FieldValue.serverTimestamp(),
          trackingNotes: FieldValue.arrayUnion({ status: statut, message, timestamp: le }),
        });
        tx.set(refInterne, {
          journal: FieldValue.arrayUnion({ statut, auteur, le }),
          // Le motif ne vaut que pour l'annulation en cours : rouvrir la commande l'efface.
          motifAnnulation: motif || FieldValue.delete(),
          majLe: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { cas: 'ok' };
      });

      if (resultat.cas === 'absente') return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
      if (resultat.cas === 'conflit') {
        // L'écran écrit le statut avec ses propres libellés.
        return erreur(409, 'Cette commande a changé de statut entre-temps (peut-être sur un autre appareil). Vérifiez avant de continuer.',
          { statut: resultat.actuel });
      }
      return NextResponse.json({ ok: true }, { headers: PAS_DE_CACHE });
    }

    if (corps.action === 'paiement') {
      // L'équipe voit l'état du paiement, jamais le bouton : elle n'a pas accès à la banque.
      if (check.role !== 'admin') {
        return erreur(403, 'Seul l’administrateur peut noter un paiement reçu, après l’avoir vu sur le compte');
      }
      if (typeof corps.recu !== 'boolean') return erreur(400, 'Requête illisible');
      const note = texte(corps.note, 300);
      const snap = await ref.get();
      if (!snap.exists) return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
      const le = Timestamp.fromMillis(Date.now());
      const entree = { recu: corps.recu as boolean, le, par: auteur, note };
      await refInterne.set({
        // Écrit en entier : une ancienne note ne survit pas à l'annulation d'un « reçu ».
        paiement: entree,
        // Qui a noté quoi, et quand : l'argent se contrôle après coup.
        journalPaiement: FieldValue.arrayUnion(entree),
        majLe: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ ok: true, le: le.toDate().toISOString() }, { headers: PAS_DE_CACHE });
    }

    if (corps.action === 'reception') {
      const demande = receptionDemandee(corps);
      if (typeof demande === 'string') return erreur(400, demande);

      const resultat = await db.runTransaction<ResultatReception>(async tx => {
        const [snap, snapInterne] = await Promise.all([tx.get(ref), tx.get(refInterne)]);
        if (!snap.exists) return { cas: 'absente' };
        const o = normaliserCommande(id, snap.data());
        if (STATUTS_FIGES.includes(o.status)) {
          return { cas: 'refus', message: 'Cette commande est terminée (livrée, annulée ou retournée) : sa réception ne change plus.' };
        }
        // Le colis Sendit a déjà son montant à encaisser : changer les frais ou le mode ici le contredirait.
        const envoi = snapInterne.data()?.sendit ?? {};
        if (typeof envoi.code === 'string' && envoi.code) {
          return { cas: 'refus', message: `Un colis Sendit existe déjà pour cette commande (code ${envoi.code}) : annulez-le d’abord dans l’application Sendit, puis voyez avec l’administrateur.` };
        }
        if (envoi.enCours || envoi.incertain === true) {
          return { cas: 'refus', message: 'Un envoi à Sendit est en cours ou resté sans réponse : vérifiez d’abord le colis (panneau Sendit).' };
        }
        const avant = receptionDe(o);
        if (avant.volumineux && demande.mode === 'domicile') {
          return { cas: 'refus', message: 'Un rouleau entier ne part jamais par Sendit : choisissez le retrait ou le transport.' };
        }
        const reception: ReceptionCommande = {
          mode: demande.mode,
          volumineux: avant.volumineux,
          ...(demande.mode === 'retrait' ? { lieuRetrait: demande.lieuRetrait ?? lieuRetraitPour(avant.volumineux) } : {}),
          ...(demande.mode === 'transport' && demande.preferenceTransport ? { preferenceTransport: demande.preferenceTransport } : {}),
        };
        // Articles : la somme des lignes (le sous-total si une ancienne commande ne la retrouve pas).
        const articles = lignesCollentAuSousTotal(o) ? totalDesLignes(o) : Number(o.subtotal) || 0;
        const total = Math.round((articles + demande.frais - (Number(o.discount) || 0)) * 100) / 100;
        const le = Timestamp.fromMillis(Date.now());
        tx.update(ref, { reception, deliveryFee: demande.frais, total, updatedAt: FieldValue.serverTimestamp() });
        tx.set(refInterne, {
          journalReception: FieldValue.arrayUnion({
            avant: { mode: avant.mode, frais: Number(o.deliveryFee) || 0, total: Number(o.total) || 0 },
            apres: {
              mode: reception.mode, frais: demande.frais, total,
              ...(reception.lieuRetrait ? { lieu: reception.lieuRetrait } : {}),
              ...(reception.preferenceTransport ? { transport: reception.preferenceTransport } : {}),
            },
            par: auteur,
            le,
          }),
          majLe: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { cas: 'ok', total, frais: demande.frais, reception };
      });

      if (resultat.cas === 'absente') return erreur(404, 'Cette commande n’existe plus (elle a peut-être été supprimée).');
      if (resultat.cas === 'refus') return erreur(409, resultat.message);
      return NextResponse.json({ ok: true, total: resultat.total, frais: resultat.frais, reception: resultat.reception }, { headers: PAS_DE_CACHE });
    }

    if (corps.action === 'email-confirmation') {
      try {
        return await envoyerConfirmation(ref, refInterne, id, corps.forcer === true, delaiLivraisonNettoye(corps.delai), auteur, check.role);
      } catch (err: any) {
        // Tout ce qui lève ici arrive avant l'envoi (l'envoi et la trace ont leurs propres garde-fous).
        console.error('[shop/commandes/interne POST email-confirmation]', err?.code || err?.message || 'erreur');
        return erreur(500, 'L’e-mail n’est pas parti : la commande n’a pas pu être lue. Réessayez.');
      }
    }

    return erreur(400, 'Action inconnue');
  } catch (err: any) {
    console.error('[shop/commandes/interne POST]', err?.code || err?.message || 'erreur');
    return erreur(500, 'Enregistrement impossible pour le moment. Réessayez.');
  }
}
