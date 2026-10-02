// ─── Boutique : compteurs anonymes ───────────────────────────────────────────
// POST { evenement }  (ouvert : envoyé par navigator.sendBeacon depuis la boutique)
//      → +1 dans shop_compteurs/{AAAA-MM-JJ}, jour au Maroc. Réponse 204, sans contenu.
// GET  ?jours=7       (administrateur seulement) → { aujourdhui, jours: [{ jour, comptes }] }
//
// Aucune donnée personnelle : ni adresse IP, ni identifiant, ni cookie, ni produit, ni page
// précise ; seulement le nom de l'événement et le jour (cf. lib/compteurs-boutique.ts).
// shop_compteurs n'est ouvert par aucune règle Firestore : fermé à tous les navigateurs,
// seul le serveur (firebase-admin) le lit et l'écrit.
//
// Garde-fous, puisque n'importe qui peut appeler le POST :
//   • liste blanche des événements, corps de moins de 200 octets ;
//   • refus des envois venus d'un autre site (en-tête Sec-Fetch-Site) ;
//   • un plafond par instance du serveur : 120 par minute et 5 000 par jour. Au-delà, on
//     répond pareil mais on n'écrit plus : un script en boucle ne gonfle pas les chiffres sans
//     limite ni ne multiplie les écritures Firestore.
// Une erreur d'écriture ne remonte jamais au navigateur (la page n'attend rien).

import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { requireAdmin } from '@/lib/require-admin';
import { COLLECTION_COMPTEURS, comptesDe, derniersJours, estEvenement, jourMaroc } from '@/lib/compteurs-boutique';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAILLE_MAX = 200;
const MAX_PAR_MINUTE = 120;
const MAX_PAR_JOUR = 5_000;
const MAX_JOURS_LUS = 31;

// Plafond en mémoire de cette instance du serveur
let minute = { debut: 0, nombre: 0 };
let jour = { cle: '', nombre: 0 };

function sousLePlafond(maintenant: number, aujourdhui: string): boolean {
  if (maintenant - minute.debut >= 60_000) minute = { debut: maintenant, nombre: 0 };
  if (jour.cle !== aujourdhui) jour = { cle: aujourdhui, nombre: 0 };
  if (minute.nombre >= MAX_PAR_MINUTE || jour.nombre >= MAX_PAR_JOUR) return false;
  minute.nombre += 1;
  jour.nombre += 1;
  return true;
}

const reponse = (status: number) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return reponse(403);
  if (Number(req.headers.get('content-length')) > TAILLE_MAX) return reponse(413);

  let evenement: unknown;
  try {
    const brut = await req.text();
    if (brut.length > TAILLE_MAX) return reponse(413);
    evenement = (JSON.parse(brut) as { evenement?: unknown } | null)?.evenement;
  } catch {
    return reponse(400);
  }
  if (!estEvenement(evenement)) return reponse(400);

  const aujourdhui = jourMaroc();
  if (!sousLePlafond(Date.now(), aujourdhui)) return reponse(204);

  try {
    await dbAdmin()
      .collection(COLLECTION_COMPTEURS)
      .doc(aujourdhui)
      .set({ [evenement]: FieldValue.increment(1) }, { merge: true });
  } catch (e) {
    console.error('[compteur] écriture impossible :', e instanceof Error ? e.message : e);
  }
  return reponse(204);
}

export async function GET(req: Request) {
  const refus = await requireAdmin(req);
  if (refus) return refus;

  const demandes = Number(new URL(req.url).searchParams.get('jours')) || 7;
  const n = Math.min(MAX_JOURS_LUS, Math.max(1, Math.floor(demandes)));
  const aujourdhui = jourMaroc();
  const jours = derniersJours(aujourdhui, n);

  try {
    const db = dbAdmin();
    const documents = await db.getAll(...jours.map(j => db.collection(COLLECTION_COMPTEURS).doc(j)));
    return NextResponse.json(
      { aujourdhui, jours: documents.map((d, i) => ({ jour: jours[i], comptes: comptesDe(d.data()) })) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[compteur] lecture impossible :', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Compteurs illisibles pour le moment' }, { status: 500 });
  }
}
