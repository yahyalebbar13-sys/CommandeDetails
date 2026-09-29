// ─── Webhook Sendit : le statut des colis arrive tout seul ───────────────────
// Sendit appelle cette route à chaque changement de statut d'un colis
// (événement « delivery.status.update »). La commande avance seulement dans les
// cas sûrs (ramassé → expédiée, en livraison, livré) ; injoignable, report,
// refus, annulation et retours restent à l'équipe (mention « à rappeler » /
// « à vérifier » dans la fiche). Cf. lib/sendit-statuts.ts.
//
// Route publique : ce qui la protège, c'est la preuve que l'appel vient de Sendit :
//   • l'en-tête X-Sendit-Signature = HMAC-SHA256 du corps brut, avec
//     SENDIT_WEBHOOK_SECRET (ou, s'il n'est pas posé, la clé privée
//     SENDIT_PRIVATE_KEY : le guide Sendit dit que la signature se fait avec la
//     clé API choisie à la création du webhook) — hexadécimal ou base64 ;
//   • OU ?token= (ou l'en-tête X-Sendit-Token) égal à SENDIT_WEBHOOK_TOKEN,
//     comme le plugin WooCommerce officiel.
// Sans preuve : 401, le corps n'est ni lu en JSON ni gardé (seule une trace du
// refus est notée, voir plus bas).
//
// Deux formes acceptées : { code, newStatus, … } (guide officiel) et
// { reference, status } (plugin WooCommerce). Idempotent : un événement déjà
// noté (même statut, même heure), même rejoué plus tard, ne change rien et
// n'allonge pas l'historique (borné à 50 lignes). Avec le seul jeton d'URL (qui
// ne signe pas le corps), un événement sans heure ou vieux de plus de 3 jours
// est ignoré. Un événement qu'on ne sait pas rattacher est acquitté (200),
// sinon Sendit le rejouerait pour rien.
//
// Le dernier événement accepté est gardé dans shop_meta/sendit_webhook (forme,
// preuve, statut ; aucune donnée du client) : c'est ce qui dira, au premier vrai
// webhook, quelle forme et quelle signature Sendit utilise vraiment. Un appel
// refusé laisse aussi une trace (shop_meta/sendit_webhook_refus : forme de la
// signature, jeton présent ou non, jamais le corps), au plus une par minute : sans
// elle, une signature faite avec une autre clé que prévu passerait inaperçue.

import { NextResponse } from 'next/server';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import {
  ENTETE_SIGNATURE_SENDIT,
  appliquerStatutSendit,
  codeColisValide,
  evenementRecent,
  jetonWebhookValide,
  lireEvenementSendit,
  signatureSenditValide,
  type EvenementSendit,
} from '@/lib/sendit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/** Un événement Sendit tient en quelques centaines d'octets. */
const TAILLE_MAX = 20_000;
const CHEMIN_DIAGNOSTIC = 'shop_meta/sendit_webhook';
const CHEMIN_REFUS = 'shop_meta/sendit_webhook_refus';
/** Route publique : un inconnu qui la bombarde ne coûte qu'une écriture par minute (et par instance). */
const PAUSE_TRACE_REFUS_MS = 60_000;
let derniereTraceRefus = 0;

const reponse = (status: number, corps: Record<string, unknown>) => NextResponse.json(corps, { status, headers: PAS_DE_CACHE });

/** Quelle preuve accompagne l'appel (ou null). Les secrets ne sortent jamais d'ici. */
function preuveDe(req: Request, brut: string): string | null {
  const secret = (process.env.SENDIT_WEBHOOK_SECRET || '').trim();
  const privee = (process.env.SENDIT_PRIVATE_KEY || '').trim();
  const jeton = (process.env.SENDIT_WEBHOOK_TOKEN || '').trim();

  const signature = req.headers.get(ENTETE_SIGNATURE_SENDIT);
  if (signature) {
    // SENDIT_WEBHOOK_SECRET, s'il est posé, est la seule clé de signature acceptée.
    const cle = secret || privee;
    const encodage = cle ? signatureSenditValide(brut, signature, cle) : null;
    if (encodage) return `signature ${encodage} (${secret ? 'SENDIT_WEBHOOK_SECRET' : 'clé privée'})`;
  }
  const recu = new URL(req.url).searchParams.get('token') ?? req.headers.get('x-sendit-token');
  if (jeton && jetonWebhookValide(recu, jeton)) return 'jeton';
  return null;
}

/**
 * La commande de ce colis. Le code du colis d'abord (noté dans l'interne à la
 * création) ; pour la forme { reference, status }, la référence peut être notre
 * numéro de commande. Jamais le champ `livraison` de la commande : le client
 * peut l'écrire lui-même.
 */
async function trouverCommande(db: Firestore, ev: EvenementSendit): Promise<{ id: string; code: string } | null> {
  if (codeColisValide(ev.code)) {
    const parCode = await db.collection('shop_orders_interne').where('sendit.code', '==', ev.code).limit(2).get();
    if (parCode.size === 1) return { id: parCode.docs[0].id, code: ev.code };
  }
  if (/^LBT-[A-Z0-9-]{3,50}$/i.test(ev.code)) {
    const parNumero = await db.collection('shop_orders').where('orderNumber', '==', ev.code).limit(2).get();
    // Deux commandes au même numéro : on ne choisit pas au hasard.
    if (parNumero.size === 1) {
      const id = parNumero.docs[0].id;
      const code = (await db.collection('shop_orders_interne').doc(id).get()).data()?.sendit?.code;
      if (codeColisValide(code)) return { id, code };
    }
  }
  return null;
}

/**
 * Trace d'un appel refusé, pour la carte Sendit de l'administrateur. On note la
 * FORME de la signature (hexadécimale, base64, absente) et si elle aurait été
 * bonne avec la clé publique : c'est la seule clé que Sendit pourrait utiliser
 * en dehors de celles qu'on accepte. Ni le corps, ni la signature, ni l'adresse
 * de l'appelant.
 */
async function noterRefus(req: Request, brut: string) {
  const maintenant = Date.now();
  if (maintenant - derniereTraceRefus < PAUSE_TRACE_REFUS_MS) return;
  derniereTraceRefus = maintenant;
  const signature = (req.headers.get(ENTETE_SIGNATURE_SENDIT) || '').trim().replace(/^sha256=/i, '');
  const forme = !signature ? 'absente'
    : /^[0-9a-f]{64}$/i.test(signature) ? 'hex'
      : /^[A-Za-z0-9+/_-]{43}={0,1}$/.test(signature) ? 'base64' : 'autre';
  const publique = (process.env.SENDIT_PUBLIC_KEY || '').trim();
  const signeeAvecClePublique = forme !== 'absente' && !!publique && signatureSenditValide(brut, signature, publique) !== null;
  try {
    await dbAdmin().doc(CHEMIN_REFUS).set({
      dernierLe: FieldValue.serverTimestamp(),
      nombre: FieldValue.increment(1),
      signature: forme,
      jeton: new URL(req.url).searchParams.has('token') || req.headers.has('x-sendit-token'),
      signeeAvecClePublique,
    }, { merge: true });
  } catch (err: any) {
    console.error('[webhooks/sendit] trace de refus non écrite :', err?.code || 'erreur');
  }
}

async function noterDiagnostic(db: Firestore, d: {
  preuve: string;
  json: unknown;
  ev: EvenementSendit | null;
  commandeTrouvee: boolean;
  resultat: string;
}) {
  const champs = d.json && typeof d.json === 'object' && !Array.isArray(d.json)
    ? Object.keys(d.json as object).slice(0, 20).map(c => c.slice(0, 40))
    : [];
  await db.doc(CHEMIN_DIAGNOSTIC).set({
    dernierLe: FieldValue.serverTimestamp(),
    nombre: FieldValue.increment(1),
    preuve: d.preuve,
    format: d.ev?.format ?? 'illisible',
    champs,
    commandeTrouvee: d.commandeTrouvee,
    resultat: d.resultat,
    // Ni message, ni photo, ni téléphone : seulement ce qui sert à régler le branchement.
    evenement: d.ev
      ? {
        event: d.ev.evenement,
        statut: d.ev.statut,
        ancienStatut: d.ev.ancienStatut ?? '',
        statutRetour: d.ev.statutRetour ?? '',
        lastActionAt: d.ev.lastActionAt ?? '',
      }
      : null,
  }, { merge: true }).catch((err: any) => console.error('[webhooks/sendit] diagnostic non écrit :', err?.code || 'erreur'));
}

export async function POST(req: Request) {
  const configure = (process.env.SENDIT_WEBHOOK_SECRET || '').trim()
    || (process.env.SENDIT_PRIVATE_KEY || '').trim()
    || (process.env.SENDIT_WEBHOOK_TOKEN || '').trim();
  if (!configure) return reponse(503, { error: 'Webhook Sendit non configuré' });

  const longueur = Number(req.headers.get('content-length'));
  if (Number.isFinite(longueur) && longueur > TAILLE_MAX) return reponse(413, { error: 'Corps trop grand' });
  // Le corps brut, et lui seul, est signé : on le vérifie avant de le lire en JSON.
  const brut = await req.text();
  if (brut.length > TAILLE_MAX) return reponse(413, { error: 'Corps trop grand' });

  const preuve = preuveDe(req, brut);
  if (!preuve) {
    await noterRefus(req, brut);
    return reponse(401, { error: 'Preuve absente ou invalide' });
  }

  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return reponse(400, { error: 'Corps illisible' });
  }

  try {
    const db = dbAdmin();
    const ev = lireEvenementSendit(json);
    if (!ev) {
      await noterDiagnostic(db, { preuve, json, ev: null, commandeTrouvee: false, resultat: 'illisible' });
      return reponse(200, { ignore: 'événement illisible' });
    }
    if (ev.evenement && ev.evenement !== 'delivery.status.update') {
      await noterDiagnostic(db, { preuve, json, ev, commandeTrouvee: false, resultat: 'autre événement' });
      return reponse(200, { ignore: 'événement non suivi' });
    }
    // Le jeton d'URL ne signe pas le corps : un appel enregistré resterait valable pour
    // toujours. Avec lui seul, on n'accepte qu'un événement daté et récent.
    if (preuve === 'jeton' && !evenementRecent(ev.lastActionAt)) {
      await noterDiagnostic(db, { preuve, json, ev, commandeTrouvee: false, resultat: 'sans heure récente (jeton seul)' });
      return reponse(200, { ignore: 'événement non daté ou trop ancien' });
    }

    const commande = await trouverCommande(db, ev);
    if (!commande) {
      await noterDiagnostic(db, { preuve, json, ev, commandeTrouvee: false, resultat: 'colis inconnu' });
      return reponse(200, { ignore: 'colis inconnu' });
    }

    const r = await appliquerStatutSendit(db, {
      commandeId: commande.id,
      code: commande.code,
      statut: ev.statut,
      statutRetour: ev.statutRetour,
      source: 'webhook',
      lastActionAt: ev.lastActionAt,
      message: ev.message,
      deliverBy: ev.deliverBy,
      tentatives: ev.tentatives,
      photo: ev.photo,
    });
    await noterDiagnostic(db, { preuve, json, ev, commandeTrouvee: true, resultat: r.cas });
    return reponse(200, { ok: true, cas: r.cas });
  } catch (err: any) {
    // 500 : Sendit pourra rejouer l'événement. Le détail reste dans les journaux
    // (route publique : un message brut raconterait la configuration du serveur).
    console.error('[webhooks/sendit]', err?.code || err?.message || 'erreur');
    return reponse(500, { error: 'Traitement impossible' });
  }
}

/** Certains formulaires de webhook testent l'adresse par un GET : on répond, sans rien dire de plus. */
export async function GET() {
  return reponse(200, { ok: true });
}
