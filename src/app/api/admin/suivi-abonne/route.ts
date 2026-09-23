// ─── Abonnés ShipsGo d'un conteneur ───────────────────────────────────────────
// Réservé à l'administrateur. Inscrire une adresse fait envoyer par ShipsGo, en
// notre nom, un message à chaque étape du conteneur : c'est un envoi vers
// l'extérieur, déclenché seulement par une action explicite dans le dossier.
//
// Après chaque changement, le suivi est relu et réécrit dans le dossier pour que
// la liste affichée soit celle de ShipsGo, pas celle qu'on croit avoir.

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { ajouterAbonne, lireSuivi, retirerAbonne, suiviConfigure } from '@/lib/shipsgo';
import { appliquerShipment, dossierVerrouille } from '@/lib/suivi-sync';

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

/** Assez strict pour écarter une faute de frappe, sans refuser une adresse valide. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  if (!suiviConfigure()) return NextResponse.json({ error: 'Suivi maritime non configuré' }, { status: 503 });

  let corps: any;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  const factureId = typeof corps?.factureId === 'string' ? corps.factureId.trim() : '';
  const action = corps?.action === 'retirer' ? 'retirer' : 'ajouter';
  const email = typeof corps?.email === 'string' ? corps.email.trim() : '';
  const abonneId = Number(corps?.abonneId);

  if (!factureId) return NextResponse.json({ error: 'factureId manquant' }, { status: 400 });
  if (action === 'ajouter' && !EMAIL.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 });
  }
  if (action === 'retirer' && !abonneId) {
    return NextResponse.json({ error: 'abonneId manquant' }, { status: 400 });
  }

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const snap = await db.doc(`users/${check.uid}/factures/${factureId}`).get();
    if (!snap.exists) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });

    const facture = snap.data();
    // Marchandise reçue : plus de suivi, donc plus personne à prévenir.
    if (dossierVerrouille(facture)) {
      return NextResponse.json({ error: 'Dossier déjà entré en stock : le suivi est terminé' }, { status: 409 });
    }
    const shipmentId = Number(facture?.suivi?.shipmentId);
    if (!shipmentId) return NextResponse.json({ error: 'Aucun suivi ouvert pour ce dossier' }, { status: 400 });

    if (action === 'ajouter') await ajouterAbonne(shipmentId, email);
    else await retirerAbonne(shipmentId, abonneId);

    const resultat = await appliquerShipment(db, check.uid, factureId, facture, await lireSuivi(shipmentId));
    return NextResponse.json({ success: true, action, abonnes: resultat.suivi?.abonnes || [] });
  } catch (err: any) {
    console.error('[admin/suivi-abonne] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 502 });
  }
}
