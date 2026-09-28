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
// GET  ?id=…                                   → { noteInterne, motifAnnulation, journal, emailsClient }
// POST { id, action: 'statut', statut, depuis, motif? }
// POST { id, action: 'note', note }
// POST { id, action: 'email-confirmation', forcer?, delai? } → { ok, envoyeA, le, statut }
//      échec : { error, incertain? } — `incertain` quand Gmail a coupé en plein envoi (peut-être parti).

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { MESSAGE_CLIENT } from '@/lib/commandes-boutique';
import { emailDuClient } from '@/lib/alerte-commande-boutique';
import { EMAIL_LEBTEX, delaiLivraisonNettoye, echecEnvoiGmail, emailConfirmationClient, statutPermetConfirmation } from '@/lib/email-confirmation-client';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/shop-types';
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
  };
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
  const e = emailConfirmationClient(commande, { delaiLivraison: delai });

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
        tx.update(ref, {
          status: statut,
          updatedAt: FieldValue.serverTimestamp(),
          trackingNotes: FieldValue.arrayUnion({ status: statut, message: MESSAGE_CLIENT[statut], timestamp: le }),
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
