// ─── Relire tous les conteneurs en route, à la demande ────────────────────────
// Appelé en arrière-plan à chaque ouverture de la liste des arrivages : la date
// d'arrivée de chaque dossier suit alors la dernière annonce de la compagnie
// sans attendre la tâche de 6 h. Même règle que le cron (cf. lib/suivi-sync.ts) :
// seuls les suivis ouverts sur des conteneurs attendus sont relus, et aucun
// crédit n'est dépensé — relire est gratuit, seule l'ouverture d'un suivi coûte.
//
// Un dossier relu il y a moins de 10 minutes est laissé tranquille : rouvrir la
// liste dix fois de suite ne doit pas inonder ShipsGo (429).

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { synchroniserDossiersEnCours } from '@/lib/suivi-sync';
import { suiviConfigure } from '@/lib/shipsgo';

const FRAICHEUR_MS = 10 * 60 * 1000;

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

export async function POST(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  if (!suiviConfigure()) {
    return NextResponse.json({ error: 'Suivi maritime non configuré' }, { status: 503 });
  }

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const { resultats, examines } = await synchroniserDossiersEnCours(db, check.uid, { fraicheurMs: FRAICHEUR_MS });
    return NextResponse.json({
      success: true,
      examines,
      datesModifiees: resultats.filter(r => r.issue === 'date-modifiee').map(r => ({
        dossier: r.factureId, avant: r.ancienneDate, apres: r.nouvelleDate,
      })),
      erreurs: resultats.filter(r => r.issue === 'erreur').map(r => ({ dossier: r.factureId, message: r.message })),
    });
  } catch (err: any) {
    console.error('[admin/suivi-actualiser] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
