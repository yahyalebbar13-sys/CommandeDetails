// ─── Webhook ShipsGo : la position arrive toute seule ─────────────────────────
// ShipsGo appelle cette route dès qu'un suivi bouge (départ, transbordement,
// changement d'ETA, déchargement) et joint le suivi complet. Le dossier est mis
// à jour dans la foulée — c'est ce qui rend la situation vivante au lieu
// d'attendre la tâche de 6 h, qui ne sert plus que de rattrapage.
//
// Route publique : la seule chose qui la protège est la signature HMAC de
// ShipsGo (cf. lib/shipsgo-webhook.ts). Sans secret configuré, elle refuse tout.
//
// En cas d'erreur de notre côté on répond 500 : ShipsGo réessaie à 1, 5 puis
// 10 minutes. Un événement qu'on ne sait pas rattacher est en revanche acquitté
// (200), sinon il serait rejoué trois fois pour rien.

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { appliquerShipment } from '@/lib/suivi-sync';
import { lireSuivi, suiviConfigure } from '@/lib/shipsgo';
import { ENTETE_SIGNATURE, EVENEMENTS_SUIVIS, factureIdDepuisReference, signatureValide } from '@/lib/shipsgo-webhook';

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
  const secret = (process.env.SHIPSGO_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'SHIPSGO_WEBHOOK_SECRET non configuré' }, { status: 503 });
  }

  // Le corps brut, et lui seul, est signé : le relire après JSON.parse donnerait
  // un texte différent (espaces, ordre des clés) et une signature qui ne colle pas.
  const brut = await req.text();
  if (!signatureValide(brut, req.headers.get(ENTETE_SIGNATURE), secret)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  let charge: any;
  try {
    charge = JSON.parse(brut);
  } catch {
    return NextResponse.json({ error: 'Charge illisible' }, { status: 400 });
  }

  const nom = charge?.event?.name || '';
  const shipment = charge?.shipment;
  if (!EVENEMENTS_SUIVIS.has(nom) || !shipment?.id) {
    return NextResponse.json({ ignore: nom || 'événement inconnu' });
  }

  try {
    const db = getFirestore(getFirebaseAdminApp());

    const adminConfigSnap = await db.doc('publicConfig/adminConfig').get();
    const adminUid = adminConfigSnap.exists ? adminConfigSnap.data()?.adminUid : 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
    if (!adminUid) return NextResponse.json({ error: 'adminUid introuvable' }, { status: 500 });

    // Le dossier se reconnaît à la référence qu'on a nous-mêmes donnée à ShipsGo ;
    // pour un suivi ouvert depuis leur tableau de bord, elle manque et on retombe
    // sur l'identifiant du suivi déjà enregistré. Un identifiant de dossier ne
    // contient jamais de séparateur : sinon il désignerait un autre chemin.
    const factureId = factureIdDepuisReference(shipment.reference);
    const ref = factureId && !/[/.]/.test(factureId)
      ? db.doc(`users/${adminUid}/factures/${factureId}`)
      : null;

    let docSnap = ref ? await ref.get() : null;
    if (!docSnap?.exists) {
      const trouves = await db
        .collection(`users/${adminUid}/factures`)
        .where('suivi.shipmentId', '==', Number(shipment.id))
        .limit(1)
        .get();
      docSnap = trouves.empty ? null : trouves.docs[0];
    }
    if (!docSnap) {
      return NextResponse.json({ ignore: `aucun dossier pour le suivi ${shipment.id}` });
    }

    // La référence sert à TROUVER le dossier, jamais à autoriser l'écriture : un
    // dossier qui suit déjà un autre conteneur n'est pas concerné par cet envoi.
    const dossier = docSnap.data();
    const suiviEnPlace = Number(dossier?.suivi?.shipmentId);
    if (suiviEnPlace && suiviEnPlace !== Number(shipment.id)) {
      return NextResponse.json({ ignore: `le dossier ${docSnap.id} suit le conteneur ${suiviEnPlace}` });
    }

    // L'événement de création ne porte que l'entête du suivi (ni route, ni
    // conteneurs) : l'écrire tel quel effacerait ce qu'on sait déjà. On relit
    // alors le suivi complet — lecture gratuite.
    let complet = shipment;
    const chargePauvre = !shipment.route && (!Array.isArray(shipment.containers) || shipment.containers.length === 0);
    if (chargePauvre) {
      if (!suiviConfigure()) {
        return NextResponse.json({ ignore: 'charge incomplète et SHIPSGO_API_TOKEN absent' });
      }
      complet = await lireSuivi(Number(shipment.id));
    }

    const resultat = await appliquerShipment(db, adminUid, docSnap.id, dossier, complet);
    return NextResponse.json({ success: true, dossier: docSnap.id, issue: resultat.issue });
  } catch (err: any) {
    // 500 volontaire : ShipsGo rejouera l'événement plutôt que de le perdre.
    // Le détail reste dans les journaux : cette route est publique, et un message
    // d'erreur brut y raconterait la configuration du serveur à qui la sonde.
    console.error('[webhooks/shipsgo] Error:', err);
    return NextResponse.json({ error: 'Traitement impossible' }, { status: 500 });
  }
}
