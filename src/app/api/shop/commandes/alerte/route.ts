// ─── Boutique : alerte « nouvelle commande » ─────────────────────────────────
// Le navigateur du client appelle cette route juste après avoir enregistré sa
// commande (checkout). On envoie alors au commerçant un e-mail avec tout ce
// qu'il faut pour rappeler le client : l'appel « sous 2 h » promis sur la page
// de confirmation n'est tenable que si quelqu'un est prévenu.
//
// La route est ouverte (le client n'a pas de compte) : elle ne reçoit qu'un
// identifiant et relit elle-même la commande. Garde-fous :
//   • une seule alerte par commande (alerteReserveeLe, posé dans une transaction) ;
//   • seulement une commande en attente et toute récente (15 min) : on ne peut
//     pas faire renvoyer l'alerte d'une vieille commande ;
//   • un plafond commun à tous les clients, puisque n'importe qui peut créer une
//     commande : 15 par heure et 60 par 24 h. Le compte Gmail est limité à
//     500 envois par jour et sert aussi aux autres e-mails du site : un script
//     qui créerait des commandes en boucle ne doit pas les bloquer.
//     Au-delà, la commande est marquée `alerteSautee` (pas « alertée ») et le
//     commerçant reçoit un seul e-mail « alertes en pause » par période bloquée.
// L'e-mail part APRÈS la réponse (after) : un Gmail lent ne retarde jamais le
// client. `alerteEnvoyeeLe` n'est posé qu'une fois l'e-mail vraiment parti.
// La réponse est la même dans tous les cas acceptés : { ok: true }.
//
// Le client qui a laissé son e-mail reçoit en même temps un accusé de réception
// (« Nous avons bien reçu votre commande »), soumis aux mêmes garde-fous : un
// seul par commande, commande toute récente, même plafond. Son adresse vient de
// la commande enregistrée, jamais de la requête. Il est noté dans
// shop_orders_interne/{id}.emailsClient, que la fiche de l'admin affiche.

import { NextResponse, after } from 'next/server';
import nodemailer from 'nodemailer';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { dateDe } from '@/lib/commandes-boutique';
import { emailAlertesEnPause, emailDuClient, emailNouvelleCommande } from '@/lib/alerte-commande-boutique';
import { emailConfirmationClient } from '@/lib/email-confirmation-client';
import { normaliserCommande } from '@/app/admin-shop/_commandes/normaliser-commande';
import type { ShopOrder } from '@/lib/shop-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Identifiant de document Firestore (20 caractères alphanumériques d'ordinaire). */
const ID_COMMANDE = /^[A-Za-z0-9]{10,40}$/;
/** Au-delà, la commande n'est plus « nouvelle » : pas d'alerte. */
const FRAICHEUR_MS = 15 * 60_000;
const HEURE_MS = 3600_000;
const JOUR_MS = 24 * HEURE_MS;
/** Plafonds, nettement sous la limite Gmail (500/jour) pour laisser de la marge aux autres envois. */
const MAX_PAR_HEURE = 15;
const MAX_PAR_JOUR = 60;
/** Adresse publique du site, pour les liens des e-mails (jamais tirée de la requête). */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lebtex.ma').replace(/\/+$/, '');

/** Fenêtre fixe d'un compteur : début ISO et nombre d'alertes envoyées depuis. */
type Fenetre = { debut: string; nombre: number };
/** `shop_meta/alertes_commandes` : un compteur par heure, un par jour, et la dernière pause signalée. */
type Quota = { heure?: Fenetre; jour?: Fenetre; pauseSignaleePour?: string };

type Issue =
  | { cas: 'rien' }
  | { cas: 'quota'; recap: { plafond: number; periode: 'heure' | 'jour'; reprise: Date } | null }
  | { cas: 'envoyer'; commande: ShopOrder & { id: string } };

/** La fenêtre en cours, ou une nouvelle si l'ancienne est finie (ou illisible). */
function fenetreEnCours(f: Partial<Fenetre> | undefined, duree: number, maintenant: number): Fenetre {
  const debut = Date.parse(String(f?.debut ?? ''));
  // Un début loin dans le futur (horloge faussée) ne doit pas bloquer
  // indéfiniment ; une minute d'écart entre instances reste tolérée.
  const valide = Number.isFinite(debut) && debut - maintenant < 60_000 && maintenant - debut < duree;
  return valide
    ? { debut: String(f!.debut), nombre: Math.max(0, Number(f?.nombre) || 0) }
    : { debut: new Date(maintenant).toISOString(), nombre: 0 };
}

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  let brut: any;
  try { brut = await req.json(); } catch { return NextResponse.json({ error: 'Requête illisible' }, { status: 400 }); }
  const id = brut?.id;
  if (typeof id !== 'string' || !ID_COMMANDE.test(id)) {
    return NextResponse.json({ error: 'Commande inconnue' }, { status: 400 });
  }

  let issue: Issue;
  try {
    const db = dbAdmin();
    const ref = db.collection('shop_orders').doc(id);
    const quotaRef = db.doc('shop_meta/alertes_commandes');

    // Lecture et marquage dans la même transaction : deux appels simultanés
    // (double clic, onglet rechargé) ne peuvent pas envoyer deux e-mails.
    issue = await db.runTransaction<Issue>(async tx => {
      // La commande d'abord : un appel pour une commande absente ou déjà traitée
      // ne touche pas au compteur commun (ni lecture facturée, ni verrou).
      const snap = await tx.get(ref);
      if (!snap.exists) return { cas: 'rien' };
      const o = snap.data() as ShopOrder & { alerteReserveeLe?: unknown; alerteSautee?: unknown };
      if (o.alerteEnvoyeeLe || o.alerteReserveeLe || o.alerteSautee) return { cas: 'rien' };

      const maintenant = Date.now();
      const creee = dateDe(o.createdAt); // absente = commande tout juste écrite
      if (o.status !== 'pending' || (creee && maintenant - creee.getTime() > FRAICHEUR_MS)) {
        return { cas: 'rien' };
      }

      // Le compteur ensuite (toutes les lectures avant les écritures, comme Firestore l'exige).
      const quotaSnap = await tx.get(quotaRef);
      const q = (quotaSnap.exists ? quotaSnap.data() : {}) as Quota;
      const heure = fenetreEnCours(q.heure, HEURE_MS, maintenant);
      const jour = fenetreEnCours(q.jour, JOUR_MS, maintenant);

      const bloque = jour.nombre >= MAX_PAR_JOUR
        ? { plafond: MAX_PAR_JOUR, periode: 'jour' as const, fenetre: jour, duree: JOUR_MS }
        : heure.nombre >= MAX_PAR_HEURE
          ? { plafond: MAX_PAR_HEURE, periode: 'heure' as const, fenetre: heure, duree: HEURE_MS }
          : null;

      if (bloque) {
        // Pas « alertée » : on sait que l'e-mail n'est pas parti pour celle-ci.
        tx.update(ref, { alerteSautee: FieldValue.serverTimestamp() });
        // Un seul e-mail « alertes en pause » par période bloquée.
        const cle = `${bloque.periode}:${bloque.fenetre.debut}`;
        if (q.pauseSignaleePour === cle) return { cas: 'quota', recap: null };
        tx.set(quotaRef, { pauseSignaleePour: cle }, { merge: true });
        const reprise = new Date(Date.parse(bloque.fenetre.debut) + bloque.duree);
        return { cas: 'quota', recap: { plafond: bloque.plafond, periode: bloque.periode, reprise } };
      }

      tx.update(ref, { alerteReserveeLe: FieldValue.serverTimestamp() });
      tx.set(quotaRef, {
        heure: { debut: heure.debut, nombre: heure.nombre + 1 },
        jour: { debut: jour.debut, nombre: jour.nombre + 1 },
      }, { merge: true });

      // Une commande écrite à la main peut avoir n'importe quelle forme : on
      // garantit au moins une liste d'articles avant de construire l'e-mail.
      return { cas: 'envoyer', commande: { ...o, id, items: Array.isArray(o.items) ? o.items : [] } };
    });
  } catch (err: any) {
    console.error('[shop/commandes/alerte] Firestore :', err?.code || err?.message || 'erreur');
    return NextResponse.json({ error: "L'alerte n'a pas pu être traitée" }, { status: 500 });
  }

  if (issue.cas === 'rien') return ok();

  if (issue.cas === 'quota') {
    console.warn(`[shop/commandes/alerte] plafond d'alertes atteint : e-mail non envoyé (commande ${id})`);
    const recap = issue.recap;
    if (recap) {
      lancerApresReponse(() => envoyerEmail(emailAlertesEnPause(recap, recap.reprise, `${SITE}/admin-shop?vue=commandes`)), 'alertes en pause');
    }
    return ok();
  }

  const commande = issue.commande;
  const emailClient = emailDuClient(commande);
  lancerApresReponse(async () => {
    await envoyerEmail(emailNouvelleCommande(commande, `${SITE}/admin-shop?commande=${commande.id}`), { replyTo: emailClient });
    // Seulement maintenant : l'e-mail est vraiment parti.
    await dbAdmin().collection('shop_orders').doc(commande.id).update({ alerteEnvoyeeLe: FieldValue.serverTimestamp() });
  }, `commande ${id}`);

  // Accusé de réception au client : envoi à part, l'échec de l'un n'empêche pas l'autre.
  if (emailClient) {
    lancerApresReponse(async () => {
      // Même commande remise d'aplomb que l'aperçu de la fiche : même e-mail.
      await envoyerEmail(emailConfirmationClient(normaliserCommande(commande.id, commande)), { a: emailClient, expediteur: 'LEBTEX' });
      await dbAdmin().collection('shop_orders_interne').doc(commande.id).set({
        emailsClient: FieldValue.arrayUnion({ type: 'reception', a: emailClient, le: Timestamp.now(), auteur: 'automatique' }),
      }, { merge: true });
    }, `accusé de réception ${id}`);
  }
  return ok();
}

/** Après la réponse au client ; un échec est seulement journalisé (sans donnée personnelle). */
function lancerApresReponse(tache: () => Promise<void>, quoi: string) {
  const executer = () => tache().catch(e => console.error(`[shop/commandes/alerte] e-mail non parti (${quoi}) :`, e?.code || e?.message || e));
  try {
    after(executer);
  } catch {
    // Hors du cadre d'une requête (ne devrait pas arriver) : envoi détaché.
    void executer();
  }
}

/**
 * Sans `a` : au commerçant (ALERTE_COMMANDES_EMAIL, sinon la boîte du site).
 * Avec `a` : au client ; ses réponses reviennent alors à la boîte du site.
 */
async function envoyerEmail(
  e: { sujet: string; html: string; texte: string },
  { a, replyTo, expediteur = 'LEBTEX — Boutique' }: { a?: string; replyTo?: string | null; expediteur?: string } = {},
) {
  const gmailUser = (process.env.GMAIL_USER || 'lebtexsarlau@gmail.com').trim();
  const appPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!appPass) throw new Error('GMAIL_APP_PASSWORD absent');
  const destinataire = a || (process.env.ALERTE_COMMANDES_EMAIL || '').trim() || gmailUser;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: gmailUser, pass: appPass },
    // Sans délais, un serveur SMTP muet tiendrait la fonction ouverte indéfiniment.
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
  });
  await transporter.sendMail({
    from: `"${expediteur}" <${gmailUser}>`,
    to: destinataire,
    ...(replyTo ? { replyTo } : {}),
    subject: e.sujet,
    html: e.html,
    text: e.texte,
  });
}
