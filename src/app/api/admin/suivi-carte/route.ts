// ─── Route du conteneur, pour la carte du dossier ─────────────────────────────
// Réservé à l'administrateur. Lecture pure chez ShipsGo (gratuite) : on ne garde
// rien en base, la route change à chaque escale et pèse plus qu'un dossier.

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { lireGeojson, suiviConfigure } from '@/lib/shipsgo';
import { preparerCarte } from '@/lib/suivi-carte';
import { dossierVerrouille } from '@/lib/suivi-sync';

function getFirebaseAdminApp() {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-9506506653-9b525';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ?.replace(/\\n/g, '\n')
      ?.replace(/\\\//g, '/')
      ?.replace(/\\U/g, 'U');

    if (!clientEmail || !privateKey) {
      throw new Error(`Missing env vars. email=${!!clientEmail}, key=${!!privateKey}`);
    }

    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getApps()[0];
}

export async function GET(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  if (!suiviConfigure()) return NextResponse.json({ error: 'Suivi maritime non configuré' }, { status: 503 });

  const factureId = new URL(req.url).searchParams.get('factureId')?.trim();
  if (!factureId) return NextResponse.json({ error: 'factureId manquant' }, { status: 400 });

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const snap = await db.doc(`users/${check.uid}/factures/${factureId}`).get();
    if (!snap.exists) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });

    // Dossier réceptionné : pas de suivi, donc pas de carte.
    if (dossierVerrouille(snap.data())) {
      return NextResponse.json({ error: 'Dossier déjà entré en stock : le suivi est terminé' }, { status: 409 });
    }
    const shipmentId = Number(snap.data()?.suivi?.shipmentId);
    if (!shipmentId) return NextResponse.json({ error: 'Aucun suivi ouvert pour ce dossier' }, { status: 400 });

    const carte = preparerCarte(await lireGeojson(shipmentId));
    return NextResponse.json({ success: true, carte });
  } catch (err: any) {
    console.error('[admin/suivi-carte] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 502 });
  }
}
