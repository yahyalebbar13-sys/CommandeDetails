// ─── Garde des routes API réservées à l'administrateur ────────────────────────
// Serveur uniquement. Une route API non gardée est ouverte à tout Internet :
// les routes d'administration commencent par cette vérification.
//
// Le client envoie `Authorization: Bearer <ID token Firebase>` (cf. authed-fetch.ts).
// Le jeton est vérifié selon la méthode documentée par Firebase pour les
// bibliothèques JWT tierces : signature RS256 contre les clés publiques de
// securetoken, émetteur et audience = le projet, sujet non vide.
//
// On n'utilise volontairement PAS firebase-admin ici : d'autres routes
// (admin/manage-user, admin/reset-stock, cron/low-stock-check) reprennent
// « la première app firebase-admin enregistrée » ; en créer une ici, même nommée,
// leur ferait utiliser une instance sans identifiants selon l'ordre des requêtes.

import { NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ADMIN_EMAIL } from '@/lib/constants';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-9506506653-9b525';

// Clés publiques de signature des ID tokens Firebase (mises en cache et
// renouvelées par jose selon leur rotation).
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export type AdminCheck =
  | { ok: true; uid: string; email: string }
  | { ok: false; response: NextResponse };

/**
 * Identité VÉRIFIÉE portée par le jeton Firebase de la requête, ou null.
 * Partagée avec la garde de l'espace client (cf. require-client.ts).
 */
export async function lireJetonFirebase(req: Request): Promise<{ uid: string; email: string } | null> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    const nowSec = Math.floor(Date.now() / 1000);
    const authTime = Number(payload.auth_time);
    if (typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(authTime) || authTime > nowSec + 60) return null;
    return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
  } catch {
    return null;
  }
}

/**
 * Vérifie que l'appelant est l'administrateur (même règle que /gestion : l'espace
 * admin n'est ouvert qu'au compte ADMIN_EMAIL) et renvoie son identité VÉRIFIÉE —
 * à utiliser plutôt que tout uid fourni dans le corps de la requête.
 */
export async function verifyAdmin(req: Request): Promise<AdminCheck> {
  const refuse = (status: number, error: string): AdminCheck =>
    ({ ok: false, response: NextResponse.json({ error }, { status }) });

  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return refuse(401, 'Authentification requise');

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    }));
  } catch {
    return refuse(401, 'Session invalide ou expirée — reconnectez-vous');
  }

  // Exigences Firebase en plus de exp/iat/iss/aud (vérifiés par jose).
  const nowSec = Math.floor(Date.now() / 1000);
  const authTime = Number(payload.auth_time);
  if (typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(authTime) || authTime > nowSec + 60) {
    return refuse(401, 'Session invalide ou expirée — reconnectez-vous');
  }

  const email = typeof payload.email === 'string' ? payload.email : '';
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return refuse(403, "Accès réservé à l'administrateur");
  }
  return { ok: true, uid: payload.sub, email };
}

/**
 * Raccourci pour les routes qui n'ont pas besoin de l'identité : renvoie `null` si
 * l'appelant est l'administrateur, sinon la réponse 401/403 à retourner telle quelle.
 */
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const check = await verifyAdmin(req);
  return check.ok ? null : check.response;
}
