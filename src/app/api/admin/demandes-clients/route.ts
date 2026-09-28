// ─── Demandes des clients, côté administrateur ────────────────────────────────
// GET   : toutes les demandes envoyées depuis l'espace client, les plus récentes d'abord.
// PATCH : { id, statut?, reponse? } — prise en charge, traitement, réponse lue par le client.
//         `majLe` suit tout changement ; `reponduLe` seulement une réponse
//         nouvelle ou modifiée (changer le statut n'est pas « répondre »).
// Passe par le serveur plutôt que par Firestore depuis le navigateur : la
// collection est nouvelle et les règles ne l'ouvrent à personne.
// Ouverte à l'administrateur ET à l'équipe (espace /staff, cf. require-equipe.ts) :
// les demandes sont rangées chez l'administrateur (users/{adminUid}/…), d'où
// `check.adminUid` — l'uid de l'équipe, lui, ne possède aucune donnée.
// Erreurs : une phrase fixe en français pour l'écran, le code seul dans les
// journaux (le message brut de Firestore cite le projet et les chemins).

import { NextResponse } from 'next/server';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';

export const dynamic = 'force-dynamic';

const STATUTS = new Set(['nouvelle', 'en_cours', 'traitee']);

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;
  try {
    const snap = await dbAdmin().collection(`users/${check.adminUid}/demandesClient`).get();
    const demandes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as any)
      .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)))
      .map(({ clientUid: _u, ...reste }) => reste);
    return NextResponse.json({ demandes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[admin/demandes-clients GET]', err?.code || err?.message || 'erreur');
    return NextResponse.json(
      { error: "Les demandes n'ont pas pu être lues. Réessayez dans un instant." },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function PATCH(req: Request) {
  // Écriture : l'accès est relu dans la base, pour qu'un accès désactivé bloque tout de suite.
  const check = await verifyEquipe(req, { sansCache: true });
  if (!check.ok) return check.response;
  let corps: any;
  try { corps = await req.json(); } catch { return NextResponse.json({ error: 'Requête illisible' }, { status: 400 }); }

  const id = typeof corps?.id === 'string' ? corps.id.trim() : '';
  if (!id || id.includes('/')) return NextResponse.json({ error: 'Demande inconnue.' }, { status: 400 });

  if (corps.statut !== undefined && !STATUTS.has(corps.statut)) {
    return NextResponse.json({ error: 'Statut inconnu.' }, { status: 400 });
  }
  const reponse = corps.reponse !== undefined && corps.reponse !== null
    ? String(corps.reponse).trim().slice(0, 1000)
    : undefined;

  try {
    const ref = dbAdmin().doc(`users/${check.adminUid}/demandesClient/${id}`);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    const avant = snap.data() || {};

    // On compare à ce qui est enregistré : renvoyer la même réponse (ou le même
    // statut) ne doit pas la faire passer pour nouvelle chez le client.
    const maintenant = new Date().toISOString();
    const maj: Record<string, unknown> = {};
    if (corps.statut !== undefined && corps.statut !== avant.statut) maj.statut = corps.statut;
    if (reponse !== undefined && reponse !== String(avant.reponse ?? '').trim()) {
      maj.reponse = reponse;
      // Effacer sa réponse n'est pas répondre.
      if (reponse) maj.reponduLe = maintenant;
    }
    if (!Object.keys(maj).length) return NextResponse.json({ success: true });

    maj.majLe = maintenant;
    await ref.set(maj, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[admin/demandes-clients PATCH]', err?.code || err?.message || 'erreur');
    return NextResponse.json(
      { error: "La modification n'a pas pu être enregistrée. Réessayez dans un instant." },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
