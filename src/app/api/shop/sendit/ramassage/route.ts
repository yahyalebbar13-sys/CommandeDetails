// ─── Sendit : demande de ramassage au magasin (administrateur et équipe) ─────
// Tant qu'aucun ramassage n'est demandé, un colis reste « en attente » chez
// Sendit. Cette route demande à Sendit de passer au magasin LEBTEX de Derb Omar
// (adresse et téléphone lus dans les réglages Réception & paiement, côté
// serveur) pour les colis créés ces derniers jours et pas encore ramassés.
//
// GET                              → { configure, colis: [{ code, numero, le }], dernier }
// POST { codes: [...], forcer? }   → { ok, nombre, code } — seulement les colis
//      de la liste qui attendent vraiment (on ne fait pas ramasser n'importe quel code).
// Anti double demande : 2 minutes entre deux demandes, sauf `forcer`.

import { NextResponse } from 'next/server';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { CHEMIN_REGLAGES_RECEPTION, lireReglagesReception } from '@/lib/reglages-reception';
import {
  ErreurSendit,
  MESSAGE_NON_CONFIGURE,
  codeColisValide,
  demanderRamassage,
  erreurSenditPour,
  idRamassage,
  senditConfigure,
  telephoneSendit,
} from '@/lib/sendit';
import { codeStatutSendit } from '@/lib/sendit-statuts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/** Suivi des demandes de ramassage (fermé aux navigateurs : aucune règle n'ouvre shop_meta). */
const CHEMIN_RAMASSAGE = 'shop_meta/sendit_ramassage';
/** Un colis oublié plus d'une semaine se traite dans l'application Sendit. */
const FENETRE_MS = 7 * 24 * 60 * 60_000;
const STATUTS_A_RAMASSER = ['PENDING', 'TO_PREPARE'];
const DELAI_RENVOI_MS = 2 * 60_000;
/** Au-dessus de maxDuration : une demande coupée en route ne libère le verrou qu'après la fin certaine de la fonction. */
const EN_COURS_MAX_MS = 2 * 60_000;
/** Code Google (Plus Code) du magasin de Derb Omar, où Sendit ramasse (décision du patron). */
const CODE_PLUS_DERB_OMAR = 'H9RR+MP';

type Role = 'admin' | 'staff';

const erreur = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: PAS_DE_CACHE });

function msDe(v: any): number | null {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}
const isoDe = (v: any) => {
  const ms = msDe(v);
  return ms === null ? null : new Date(ms).toISOString();
};
const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const auteurLisible = (role: Role, auteur: string) => (role === 'staff' && auteur.includes('@') ? "l'administrateur" : auteur);

interface ColisEnAttente { commandeId: string; code: string; le: number }

/** Colis créés ces 7 derniers jours, encore en attente chez Sendit, sans ramassage demandé. */
async function colisEnAttente(db: Firestore): Promise<ColisEnAttente[]> {
  const depuis = Timestamp.fromMillis(Date.now() - FENETRE_MS);
  const snap = await db.collection('shop_orders_interne').where('sendit.le', '>=', depuis).limit(300).get();
  const liste: ColisEnAttente[] = [];
  for (const d of snap.docs) {
    const e = d.data()?.sendit;
    if (!e || !codeColisValide(e.code) || e.ramassage) continue;
    if (!STATUTS_A_RAMASSER.includes(codeStatutSendit(e.statut) ?? 'PENDING')) continue;
    liste.push({ commandeId: d.id, code: e.code, le: msDe(e.le) ?? 0 });
  }
  return liste.sort((a, b) => a.le - b.le);
}

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;
  const configure = senditConfigure();
  try {
    const db = dbAdmin();
    const [attente, meta] = await Promise.all([colisEnAttente(db), db.doc(CHEMIN_RAMASSAGE).get()]);
    // Le numéro de commande, pour que l'équipe reconnaisse ses colis.
    const commandes = attente.length
      ? await db.getAll(...attente.map(c => db.collection('shop_orders').doc(c.commandeId)), { fieldMask: ['orderNumber'] })
      : [];
    const numeros = new Map(commandes.map(s => [s.id, texte(s.get('orderNumber'), 60)]));
    const m = meta.data() ?? {};
    return NextResponse.json({
      configure,
      colis: attente.map(c => ({ code: c.code, numero: numeros.get(c.commandeId) || '', le: c.le ? new Date(c.le).toISOString() : null })),
      dernier: msDe(m.dernierLe) !== null
        ? { le: isoDe(m.dernierLe), nombre: Number(m.nombre) || 0, code: texte(m.dernierCode, 40) || null, par: auteurLisible(check.role, texte(m.par, 200)), sansReponse: m.sansReponse === true }
        : null,
    }, { headers: PAS_DE_CACHE });
  } catch (err: any) {
    console.error('[shop/sendit/ramassage GET]', err?.code || err?.message || 'erreur');
    return erreur(500, 'La liste des colis à ramasser n’a pas pu être lue. Réessayez.');
  }
}

type Reservation = { cas: 'libre' } | { cas: 'en_cours' } | { cas: 'recent'; le: number };

export async function POST(req: Request) {
  const check = await verifyEquipe(req, { sansCache: true });
  if (!check.ok) return check.response;
  const role: Role = check.role;

  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }
  const demandes = new Set<string>(Array.isArray(corps?.codes) ? corps.codes.filter(codeColisValide).slice(0, 300) : []);
  if (!demandes.size) return erreur(400, 'Aucun colis choisi.');

  if (!senditConfigure()) {
    const r = erreurSenditPour(new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure'), role);
    return erreur(r.statut, r.message, r.extra);
  }

  const db = dbAdmin();
  const refMeta = db.doc(CHEMIN_RAMASSAGE);
  let reserve = false;
  const liberer = () => (reserve
    ? refMeta.set({ enCoursLe: FieldValue.delete() }, { merge: true }).catch((err: any) => console.error('[shop/sendit/ramassage] verrou non libéré :', err?.code || 'erreur'))
    : Promise.resolve());

  try {
    const aRamasser = (await colisEnAttente(db)).filter(c => demandes.has(c.code));
    if (!aRamasser.length) return erreur(400, 'Aucun de ces colis n’attend le ramassage (déjà ramassé ou déjà demandé).');

    const reservation = await db.runTransaction<Reservation>(async tx => {
      const d = (await tx.get(refMeta)).data() ?? {};
      const maintenant = Date.now();
      const enCours = msDe(d.enCoursLe);
      if (enCours !== null && maintenant - enCours < EN_COURS_MAX_MS) return { cas: 'en_cours' };
      const dernier = msDe(d.dernierLe);
      if (corps?.forcer !== true && dernier !== null && maintenant - dernier < DELAI_RENVOI_MS) return { cas: 'recent', le: dernier };
      tx.set(refMeta, { enCoursLe: Timestamp.fromMillis(maintenant) }, { merge: true });
      return { cas: 'libre' };
    });
    if (reservation.cas === 'en_cours') return erreur(409, 'Une demande de ramassage est déjà en cours. Attendez deux minutes.');
    if (reservation.cas === 'recent') {
      return erreur(409, 'Un ramassage vient d’être demandé. Redemander quand même ?', { dejaLe: new Date(reservation.le).toISOString() });
    }
    reserve = true;

    // Adresse et téléphone du magasin : les réglages, relus ici (jamais envoyés par le navigateur).
    const reglages = lireReglagesReception(
      (await db.collection(CHEMIN_REGLAGES_RECEPTION.collection).doc(CHEMIN_REGLAGES_RECEPTION.document).get()).data(),
    );
    const lieu = reglages.lieux.derb_omar;
    const telephone = telephoneSendit(lieu.telephone);
    if (!telephone) {
      await liberer();
      return erreur(422, 'Le téléphone du magasin Derb Omar (écran Réception & paiement) n’est pas un numéro marocain valable : corrigez-le d’abord.');
    }
    const ramassage = await idRamassage();
    const codes = aRamasser.map(c => c.code);
    // Le code Google du magasin aide le livreur Sendit ; le client, lui, ne le voit pas (adresse des réglages).
    const adresse = lieu.adresse.includes(CODE_PLUS_DERB_OMAR) ? lieu.adresse : `${lieu.adresse} (code Google ${CODE_PLUS_DERB_OMAR})`;

    let codeRamassage: string | null;
    try {
      ({ code: codeRamassage } = await demanderRamassage({
        districtId: ramassage.id,
        nom: lieu.nom,
        telephone,
        adresse,
        note: `Ramassage ${lieu.nom}, ${codes.length} colis. ${lieu.horaires}`,
        codes,
      }));
    } catch (e) {
      // Pas de réponse, ou une erreur de la passerelle de Sendit (5xx, 408) : la demande a pu
      // être reçue quand même. On note l'heure pour qu'un nouvel appui ne redemande pas aussitôt.
      if (e instanceof ErreurSendit && e.peutEtreFait) {
        // Peut-être demandé : on note l'heure pour qu'un nouvel appui ne redemande pas aussitôt.
        await refMeta.set({ enCoursLe: FieldValue.delete(), dernierLe: Timestamp.now(), sansReponse: true, par: check.auteur, nombre: codes.length }, { merge: true })
          .catch((err: any) => console.error('[shop/sendit/ramassage] trace non écrite :', err?.code || 'erreur'));
        return erreur(504, 'Sendit n’a pas répondu clairement : le ramassage est peut-être demandé. Regardez dans l’application Sendit avant de redemander.', { sansReponse: true });
      }
      await liberer();
      const r = erreurSenditPour(e, role);
      return erreur(r.statut, r.message, r.extra);
    }

    const le = Timestamp.now();
    const batch = db.batch();
    for (const c of aRamasser) {
      batch.set(db.collection('shop_orders_interne').doc(c.commandeId), {
        sendit: { ramassage: { le, par: check.auteur, ...(codeRamassage ? { code: codeRamassage } : {}) } },
      }, { merge: true });
    }
    batch.set(refMeta, {
      enCoursLe: FieldValue.delete(),
      dernierLe: le,
      dernierCode: codeRamassage ?? FieldValue.delete(),
      nombre: codes.length,
      par: check.auteur,
      sansReponse: FieldValue.delete(),
    }, { merge: true });
    try {
      await batch.commit();
    } catch (err: any) {
      // Demandé chez Sendit : on le dit quand même.
      console.error('[shop/sendit/ramassage] demandé mais non noté :', err?.code || err?.message || 'erreur');
      return NextResponse.json({ ok: true, nombre: codes.length, code: codeRamassage, note: false }, { headers: PAS_DE_CACHE });
    }
    return NextResponse.json({ ok: true, nombre: codes.length, code: codeRamassage }, { headers: PAS_DE_CACHE });
  } catch (err: any) {
    await liberer();
    if (err instanceof ErreurSendit) {
      const r = erreurSenditPour(err, role);
      return erreur(r.statut, r.message, r.extra);
    }
    console.error('[shop/sendit/ramassage POST]', err?.code || err?.message || 'erreur');
    return erreur(500, 'La demande de ramassage n’a pas pu être faite. Réessayez.');
  }
}
