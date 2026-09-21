// ─── Ouverture du suivi sur plusieurs dossiers d'un coup ──────────────────────
// Sert au rattrapage : les arrivages déjà enregistrés avec un n° de BL, mais
// antérieurs au suivi automatique. Réservé à l'administrateur.
//
// Chaque dossier ouvert coûte un crédit ShipsGo, donc rien n'est deviné : la
// liste des dossiers est transmise explicitement par l'interface, qui a affiché
// le nombre de crédits avant de demander confirmation. Les dossiers déjà suivis,
// sans BL ou déjà entrés en stock sont écartés sans rien dépenser.

import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { synchroniserDossier } from '@/lib/suivi-sync';
import { suiviConfigure } from '@/lib/shipsgo';
import { dossierAOuvrir, referenceDepuisDossier } from '@/lib/suivi-conteneur';

/** Garde-fou : au-delà, c'est une erreur de manipulation, pas une intention. */
const MAX_PAR_APPEL = 25;

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

  let corps: any;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  const ids: string[] = Array.isArray(corps?.factureIds)
    ? corps.factureIds.filter((v: any) => typeof v === 'string' && v.trim() && !/[/.]/.test(v)).slice(0, MAX_PAR_APPEL)
    : [];
  if (!ids.length) return NextResponse.json({ error: 'Aucun dossier à traiter' }, { status: 400 });

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const ouverts: { dossier: string; reference: string; statut?: string }[] = [];
    const ignores: { dossier: string; raison: string }[] = [];
    const erreurs: { dossier: string; message: string }[] = [];
    let creditsRestants: number | undefined;

    // Séquentiel : ShipsGo traite les créations d'une même société une par une
    // et répond 429 si on l'inonde.
    for (const factureId of ids) {
      const snap = await db.doc(`users/${check.uid}/factures/${factureId}`).get();
      if (!snap.exists) { ignores.push({ dossier: factureId, raison: 'introuvable' }); continue; }

      const facture = snap.data() as any;
      if (!dossierAOuvrir(facture)) {
        ignores.push({
          dossier: factureId,
          raison: facture?.suivi?.shipmentId ? 'déjà suivi'
            : !referenceDepuisDossier(facture) ? 'aucun n° de BL exploitable'
            : 'dossier clos',
        });
        continue;
      }

      const r = await synchroniserDossier(db, check.uid, factureId, facture, {
        reference: referenceDepuisDossier(facture),
        autoriserOuverture: true,
        auto: true,
      });
      if (r.creditsRestants !== undefined) creditsRestants = r.creditsRestants;

      if (r.issue === 'erreur') erreurs.push({ dossier: factureId, message: r.message || 'échec' });
      else if (r.issue === 'verrouille') ignores.push({ dossier: factureId, raison: 'dossier clos' });
      else ouverts.push({ dossier: factureId, reference: r.suivi?.reference || '', statut: r.suivi?.statut });
    }

    return NextResponse.json({ success: true, ouverts, ignores, erreurs, creditsRestants });
  } catch (err: any) {
    console.error('[admin/suivi-lot] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
