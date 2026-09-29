// ─── Sendit : étiquettes des colis (administrateur et équipe) ────────────────
// Demande à Sendit le PDF des étiquettes au format A4 (printFormat 0, décision
// du patron) pour un ou plusieurs colis, et renvoie le lien. Ce lien est signé
// et expire : il n'est jamais enregistré, on le redemande à chaque impression.
// On vérifie qu'il pointe bien chez Sendit (https, domaine sendit.ma) avant de
// le donner au navigateur, qui l'ouvre dans un nouvel onglet.
//
// Seulement les colis de la boutique : un code n'est imprimé que s'il est noté
// sur une commande (shop_orders_interne/{id}.sendit.code). Le compte Sendit sert
// aussi aux colis créés à la main (ventes /stock) : leurs étiquettes (nom,
// téléphone, adresse, montant) ne regardent pas l'équipe (cf. require-equipe.ts).
//
// POST { codes: ['DHF420101C', …] } → { url }

import { NextResponse } from 'next/server';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { ErreurSendit, MESSAGE_NON_CONFIGURE, codeColisValide, erreurSenditPour, senditConfigure, urlEtiquettes } from '@/lib/sendit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/** Une feuille par colis : au-delà, mieux vaut imprimer depuis l'application Sendit. */
const CODES_MAX = 50;
/** Firestore limite un filtre « in » à 30 valeurs. */
const LOT_IN = 30;

const erreur = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: PAS_DE_CACHE });

/** Les codes qui sont bien ceux d'une commande de la boutique. */
async function codesDeLaBoutique(codes: string[]): Promise<Set<string>> {
  const db = dbAdmin();
  const connus = new Set<string>();
  for (let i = 0; i < codes.length; i += LOT_IN) {
    const lot = codes.slice(i, i + LOT_IN);
    const snap = await db.collection('shop_orders_interne').where('sendit.code', 'in', lot).get();
    for (const d of snap.docs) {
      const code = d.get('sendit.code');
      if (typeof code === 'string' && lot.includes(code)) connus.add(code);
    }
  }
  return connus;
}

export async function POST(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;

  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }
  const codes: string[] = Array.isArray(corps?.codes) ? [...new Set<string>(corps.codes.filter(codeColisValide))] : [];
  if (!codes.length) return erreur(400, 'Aucun colis à imprimer.');
  if (codes.length > CODES_MAX) return erreur(400, `Pas plus de ${CODES_MAX} étiquettes à la fois.`);

  if (!senditConfigure()) {
    const r = erreurSenditPour(new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure'), check.role);
    return erreur(r.statut, r.message, r.extra);
  }
  let connus: Set<string>;
  try {
    connus = await codesDeLaBoutique(codes);
  } catch (err: any) {
    console.error('[shop/sendit/etiquette] vérification des colis :', err?.code || err?.message || 'erreur');
    return erreur(500, 'Les colis n’ont pas pu être vérifiés. Réessayez.');
  }
  const inconnus = codes.filter(c => !connus.has(c));
  if (inconnus.length) {
    return erreur(404, inconnus.length === 1
      ? 'Ce colis n’est noté sur aucune commande de la boutique : imprimez son étiquette depuis l’application Sendit.'
      : 'Certains colis ne sont notés sur aucune commande de la boutique : imprimez-les depuis l’application Sendit.');
  }
  try {
    const url = await urlEtiquettes(codes);
    return NextResponse.json({ url }, { headers: PAS_DE_CACHE });
  } catch (e) {
    const r = erreurSenditPour(e, check.role);
    if (!(e instanceof ErreurSendit)) console.error('[shop/sendit/etiquette]', (e as any)?.message || 'erreur');
    return erreur(r.statut, r.message, r.extra);
  }
}
