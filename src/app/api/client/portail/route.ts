// ─── Espace client : ses commandes, et seulement les siennes ──────────────────
// Le client ne lit plus la base : cette route vérifie qui il est, choisit ses
// commandes côté serveur et n'en renvoie que les champs prévus pour lui (cf.
// lib/portail-client-donnees.ts) — ni prix d'achat, ni fournisseur, ni les
// commandes des autres clients.
//
// Lectures Firestore : les données de l'administrateur sont gardées 45 s et
// partagées entre ses clients, et un client qui redemande dans les 10 s
// reçoit la réponse qu'il vient d'avoir (cf. lib/portail-client-cache.ts).

import { NextResponse } from 'next/server';
import { verifyClient } from '@/lib/require-client';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { construirePortail } from '@/lib/portail-client-donnees';
import { lireDonneesAdmin, memoriserReponse, reponseRecente } from '@/lib/portail-client-cache';

export const dynamic = 'force-dynamic';

/** Numéro WhatsApp de LEBTEX (réglage du catalogue), repli sur celui de la boutique. */
const WHATSAPP_PAR_DEFAUT = '212760998347';

export async function GET(req: Request) {
  const check = await verifyClient(req);
  if (!check.ok) return check.response;

  const entetes = { 'Cache-Control': 'no-store' };
  const signature = JSON.stringify([check.adminUid, check.clientName, check.aliases]);
  const recente = reponseRecente<Record<string, unknown>>(check.uid, signature);
  if (recente) return NextResponse.json(recente, { headers: entetes });

  try {
    const db = dbAdmin();
    const [donnees, reglages] = await Promise.all([
      lireDonneesAdmin(db, check.adminUid),
      db.doc('shop_catalogue_settings/main').get().catch(() => null),
    ]);

    const { commandes, conteneurs } = construirePortail({
      client: check.clientName,
      alias: check.aliases,
      ...donnees,
    });

    const whatsapp = String(reglages?.data()?.whatsappNumber || WHATSAPP_PAR_DEFAUT).replace(/[^\d]/g, '');

    const charge = { client: check.clientName, commandes, conteneurs, contact: { whatsapp }, genereLe: new Date().toISOString() };
    memoriserReponse(check.uid, signature, charge);
    return NextResponse.json(charge, { headers: entetes });
  } catch (err: any) {
    console.error('[client/portail] Error:', err);
    return NextResponse.json({ error: 'Vos commandes sont momentanément indisponibles' }, { status: 500 });
  }
}
