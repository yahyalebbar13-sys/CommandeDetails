// ─── Boutique : suivre une commande depuis n'importe quel téléphone ──────────
// POST { numero, telephone }
//   → 200 { ok: true, commande }                       (lib/mes-commandes : CommandeSuivie)
//   → 4xx/5xx { ok: false, code, message: { fr, ar } }
//
// Les règles Firestore refusent aux visiteurs de chercher des commandes (liste fermée) :
// la page /shop/suivi passe donc par ici. La route est ouverte (le client n'a pas de compte)
// et lit avec firebase-admin. Garde-fous :
//   • jamais de recherche par téléphone seul : on cherche par n° de commande (ou, pour une
//     ancienne commande sans n°, par son identifiant), puis le téléphone doit correspondre
//     (principal, livraison ou 2e numéro). Sinon, la même réponse « introuvable », que le n°
//     existe ou non ;
//   • réponse minimale : n°, date, statut, mode de réception, paiement, lignes (nom, variante,
//     quantité, prix) et totaux. Jamais l'adresse, le nom, l'e-mail, les notes (client ou
//     internes), le suivi de l'équipe, ni le nom du transporteur ;
//   • 10 essais par adresse IP et par 10 minutes ; 300 lectures en tout par instance (en
//     mémoire), comptées après la limite par adresse et la validation du n° et du téléphone ;
//   • pas de GET : le téléphone ne doit pas passer dans une adresse (journaux, historique).
// Rien n'est écrit dans Firestore.

import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { normaliserTelephoneMaroc } from '@/lib/telephone-maroc';
import {
  MESSAGES_SUIVI,
  commandeSuivie,
  essaiPermis,
  identifiantCommandeSaisi,
  normaliserNumeroCommande,
  oublierEssaisFinis,
  telephoneCorrespond,
  type CodeSuivi,
  type CompteurEssais,
} from '@/lib/mes-commandes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAILLE_MAX = 500;
const FENETRE_MS = 10 * 60_000;
const MAX_PAR_IP = 10;
const MAX_TOUS = 300;

// Compteurs de cette instance du serveur
const essaisParIp = new Map<string, CompteurEssais>();
const essaisTous = new Map<string, CompteurEssais>();

const ENTETES = { 'Cache-Control': 'no-store' };

function refus(code: CodeSuivi, status: number) {
  return NextResponse.json({ ok: false, code, message: MESSAGES_SUIVI[code] }, { status, headers: ENTETES });
}

/** Adresse IP du client, posée par l'hébergeur (jamais affichée ni enregistrée). */
function ipDe(req: Request): string {
  const ip = req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0];
  return ip.trim().slice(0, 64) || 'inconnue';
}

export async function POST(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return refus('erreur', 403);
  if (Number(req.headers.get('content-length')) > TAILLE_MAX) return refus('erreur', 413);

  // D'abord la limite par adresse : une requête refusée ici ne compte pas dans le plafond
  // commun (sinon une seule adresse bloquerait le suivi pour tous les clients).
  const maintenant = Date.now();
  if (essaisParIp.size > 2000) oublierEssaisFinis(essaisParIp, maintenant, FENETRE_MS);
  if (essaisParIp.size > 10_000) essaisParIp.clear(); // attaque depuis des milliers d'adresses : on repart de zéro
  if (!essaiPermis(essaisParIp, ipDe(req), maintenant, MAX_PAR_IP, FENETRE_MS)) return refus('trop_essais', 429);

  let brut: { numero?: unknown; telephone?: unknown } | null;
  try {
    const texte = await req.text();
    if (texte.length > TAILLE_MAX) return refus('erreur', 413);
    brut = JSON.parse(texte);
  } catch {
    return refus('erreur', 400);
  }

  const numero = normaliserNumeroCommande(brut?.numero);
  const identifiant = numero ? null : identifiantCommandeSaisi(brut?.numero);
  if (!numero && !identifiant) return refus('numero_invalide', 400);
  const telephone = normaliserTelephoneMaroc(brut?.telephone);
  if (!telephone) return refus('telephone_invalide', 400);

  // Le plafond commun ne compte que les vraies lectures : une adresse n'en prend jamais plus de 10.
  if (!essaiPermis(essaisTous, 'tous', maintenant, MAX_TOUS, FENETRE_MS)) return refus('trop_essais', 429);

  try {
    const commandes = dbAdmin().collection('shop_orders');
    let candidates: Record<string, unknown>[];
    if (numero) {
      const snap = await commandes.where('orderNumber', '==', numero).limit(5).get();
      candidates = snap.docs.map(d => d.data());
    } else {
      const snap = await commandes.doc(identifiant as string).get();
      candidates = snap.exists ? [snap.data() as Record<string, unknown>] : [];
    }
    const trouvee = candidates.find(o => telephoneCorrespond(o as any, telephone));
    if (!trouvee) return refus('introuvable', 404);
    return NextResponse.json({ ok: true, commande: commandeSuivie(trouvee) }, { headers: ENTETES });
  } catch (err: any) {
    // Sans donnée personnelle dans les journaux : seulement le code d'erreur.
    console.error('[shop/suivi] Firestore :', err?.code || err?.message || 'erreur');
    return refus('erreur', 500);
  }
}
