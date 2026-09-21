// ─── Mise à jour nocturne de la position des conteneurs ───────────────────────
// Déclenchée par Vercel Cron (cf. vercel.json). Pour chaque dossier d'arrivage
// dont le suivi est ouvert et le conteneur encore en route, on relit ShipsGo et
// on corrige la date d'arrivée du dossier — ce qui suffit à faire basculer le
// statut affiché (En transit → En dédouanement) sans aucune saisie.
//
// Aucun crédit n'est dépensé ici : la relecture est gratuite, et l'ouverture
// d'un suivi (le seul acte payant) reste une action volontaire depuis le dossier.

import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { synchroniserDossiersEnCours } from '@/lib/suivi-sync';
import { suiviConfigure } from '@/lib/shipsgo';

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

export async function GET(req: NextRequest) {
  // Secret exigé, sans exception : cette route parcourt tous les dossiers et
  // écrit dedans. Vercel envoie automatiquement « Authorization: Bearer
  // $CRON_SECRET » dès que la variable existe sur le projet.
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré sur le serveur' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!suiviConfigure()) {
    return NextResponse.json({ error: 'SHIPSGO_API_TOKEN non configuré sur le serveur' }, { status: 503 });
  }

  try {
    const db = getFirestore(getFirebaseAdminApp());

    const adminConfigSnap = await db.doc('publicConfig/adminConfig').get();
    const adminUid = adminConfigSnap.exists ? adminConfigSnap.data()?.adminUid : 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
    if (!adminUid) {
      return NextResponse.json({ error: 'adminUid introuvable' }, { status: 500 });
    }

    const { resultats, examines } = await synchroniserDossiersEnCours(db, adminUid);

    const modifies = resultats.filter(r => r.issue === 'date-modifiee');
    const erreurs = resultats.filter(r => r.issue === 'erreur');

    return NextResponse.json({
      success: true,
      examines,
      datesModifiees: modifies.map(r => ({
        dossier: r.factureId,
        avant: r.ancienneDate || null,
        apres: r.nouvelleDate,
        statut: r.suivi?.statut,
      })),
      erreurs: erreurs.map(r => ({ dossier: r.factureId, message: r.message })),
    });
  } catch (err: any) {
    console.error('[suivi-conteneurs] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
