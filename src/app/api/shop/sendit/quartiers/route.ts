// ─── Sendit : quartiers de livraison (administrateur et équipe) ──────────────
// Liste courte des villes et quartiers Sendit, pour choisir le quartier d'un
// colis dans la fiche commande. Réservée à l'équipe (verifyEquipe) : faire
// varier q ou ville contournerait tout cache, et chaque instance serveur sans
// liste en mémoire la recharge chez Sendit (connexion + jusqu'à 60 pages), sur
// le même quota (1 000 appels par heure) que la création des colis.
//
// Le jour où le formulaire de commande en aura besoin : une liste figée (fichier
// généré, ou document Firestore rafraîchi par l'administrateur), ou une limite de
// débit par adresse IP — jamais cette route ouverte telle quelle.
//
// Chaque recherche pose une seule question à Sendit (cf. chercherQuartiers) : lire
// les 600 quartiers page par page dans une fonction qui démarre dépassait le temps
// permis. La réponse n'est gardée que par le navigateur (réponse authentifiée :
// jamais par le CDN).
//
// GET ?q=ain&ville=Casablanca → { configure: true, quartiers: [{ id, ville, name, price, delais }] }
// Sans clés Sendit : 503 { configure: false }.

import { NextResponse } from 'next/server';
import { verifyEquipe } from '@/lib/require-equipe';
import { ErreurSendit, chercherQuartiers, senditConfigure } from '@/lib/sendit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/** 5 min dans le navigateur de l'employé ; jamais dans un cache partagé. */
const CACHE_PRIVE = { 'Cache-Control': 'private, max-age=300' };
const LONGUEUR_MAX = 60;
/** Une recherche tapée : 20 réponses suffisent. Une ville seule : tous ses quartiers (Casablanca en a ~70). */
const LIMITE_RECHERCHE = 20;
const LIMITE_VILLE = 80;

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;

  if (!senditConfigure()) {
    return NextResponse.json(
      { configure: false, quartiers: [], error: 'Sendit n’est pas encore branché.' },
      { status: 503, headers: PAS_DE_CACHE },
    );
  }

  const params = new URL(req.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, LONGUEUR_MAX);
  const ville = (params.get('ville') || '').trim().slice(0, LONGUEUR_MAX);
  if (!q && !ville) {
    return NextResponse.json({ configure: true, quartiers: [] }, { headers: CACHE_PRIVE });
  }

  try {
    // Une recherche chez Sendit (ou la liste en mémoire) : jamais les 600 quartiers page par page.
    const quartiers = (await chercherQuartiers(q, ville, q ? LIMITE_RECHERCHE : LIMITE_VILLE))
      // Le tarif Sendit du quartier (ce que LEBTEX paie) : à l'administrateur seulement, comme dans le panneau.
      .map(({ id, ville: v, name, price, delais }) => ({ id, ville: v, name, price: check.role === 'admin' ? price : null, delais }));
    return NextResponse.json({ configure: true, quartiers }, { headers: CACHE_PRIVE });
  } catch (e) {
    const indisponible = e instanceof ErreurSendit && e.nature === 'non_configure';
    return NextResponse.json(
      { configure: !indisponible, quartiers: [], error: 'La liste des quartiers Sendit est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503, headers: PAS_DE_CACHE },
    );
  }
}
