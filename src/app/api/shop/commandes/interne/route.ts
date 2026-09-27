// ─── Boutique : ce que l'équipe écrit sur une commande ───────────────────────
// Le document shop_orders/{id} est lisible par le client (page de confirmation,
// suivi, espace client) : la note interne, le motif d'annulation et qui a fait
// quoi n'y vont pas. Ils vivent dans shop_orders_interne/{id}, une collection
// qu'aucune règle Firestore n'ouvre (donc fermée à tous les navigateurs) et que
// seule cette route, réservée à l'administrateur, lit et écrit.
//
// Le changement de statut passe aussi par ici : la commande publique (statut +
// phrase du suivi client) et le journal interne (qui, quand, motif) s'écrivent
// dans la même transaction.
//
// GET  ?id=…                                   → { noteInterne, motifAnnulation, journal }
// POST { id, action: 'statut', statut, depuis, motif? }
// POST { id, action: 'note', note }

import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { MESSAGE_CLIENT } from '@/lib/commandes-boutique';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/shop-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/** Forme renvoyée au navigateur : dates en ISO, rien d'autre que ce qu'affiche la fiche. */
function versReponse(data: Record<string, any> | undefined) {
  const journal = Array.isArray(data?.journal) ? data!.journal : [];
  return {
    noteInterne: texte(data?.noteInterne, 2000),
    motifAnnulation: texte(data?.motifAnnulation, 300),
    journal: journal
      .filter((e: any) => e && STATUTS.includes(e.statut) && msDe(e.le) !== null)
      .map((e: any) => ({ statut: e.statut as OrderStatus, auteur: texte(e.auteur, 200), le: new Date(msDe(e.le)!).toISOString() })),
  };
}

const erreur = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: PAS_DE_CACHE });

export async function GET(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');
  try {
    const snap = await dbAdmin().collection('shop_orders_interne').doc(id).get();
    return NextResponse.json(versReponse(snap.data()), { headers: PAS_DE_CACHE });
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
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;

  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }
  const id = typeof corps?.id === 'string' ? corps.id : '';
  if (!ID_COMMANDE.test(id)) return erreur(400, 'Commande inconnue');

  const db = dbAdmin();
  const ref = db.collection('shop_orders').doc(id);
  const refInterne = db.collection('shop_orders_interne').doc(id);
  // L'auteur vient du jeton vérifié, jamais du corps de la requête.
  const auteur = check.email;

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

    return erreur(400, 'Action inconnue');
  } catch (err: any) {
    console.error('[shop/commandes/interne POST]', err?.code || err?.message || 'erreur');
    return erreur(500, 'Enregistrement impossible pour le moment. Réessayez.');
  }
}
