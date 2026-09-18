// ─── Appels aux routes API protégées ──────────────────────────────────────────
// Côté navigateur : ajoute l'ID token Firebase de l'utilisateur connecté aux
// requêtes vers les routes gardées par requireAdmin (cf. require-admin.ts).

import { getAuth } from 'firebase/auth';

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const auth = getAuth();
  // Au premier rendu, la session peut ne pas être encore restaurée.
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
