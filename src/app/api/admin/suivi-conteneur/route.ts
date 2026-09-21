// ─── Suivi d'un dossier, à la demande ─────────────────────────────────────────
// Réservé à l'administrateur (cf. require-admin.ts) : ouvrir un suivi consomme
// un crédit ShipsGo. Deux usages depuis le dossier d'arrivage :
//   • « Activer le suivi » avec un n° de conteneur ou un Master BL  → 1 crédit
//   • « Actualiser »       sans référence, suivi déjà ouvert        → gratuit
//
// Les données visées sont celles de l'uid VÉRIFIÉ du jeton, jamais d'un uid
// transmis dans le corps de la requête.

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { synchroniserDossier } from '@/lib/suivi-sync';
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

export async function POST(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;

  if (!suiviConfigure()) {
    return NextResponse.json(
      { error: "Suivi maritime non configuré : ajoutez SHIPSGO_API_TOKEN aux variables d'environnement du projet." },
      { status: 503 },
    );
  }

  let corps: any;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  const factureId = typeof corps?.factureId === 'string' ? corps.factureId.trim() : '';
  const reference = typeof corps?.reference === 'string' ? corps.reference.trim() : '';
  if (!factureId) return NextResponse.json({ error: 'factureId manquant' }, { status: 400 });

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const ref = db.doc(`users/${check.uid}/factures/${factureId}`);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });

    const resultat = await synchroniserDossier(db, check.uid, factureId, snap.data(), {
      reference: reference || undefined,
      autoriserOuverture: true,
      // Demandé explicitement depuis le dossier : applique la date de la
      // compagnie même si elle contredit une saisie manuelle.
      forcerDate: corps?.forcerDate === true,
    });

    if (resultat.issue === 'erreur') {
      return NextResponse.json({ error: resultat.message, suivi: resultat.suivi || null }, { status: 502 });
    }
    if (resultat.issue === 'sans-reference') {
      return NextResponse.json(
        { error: 'Indiquez un numéro de conteneur ou de Master BL pour ouvrir le suivi.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, ...resultat });
  } catch (err: any) {
    console.error('[admin/suivi-conteneur] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
