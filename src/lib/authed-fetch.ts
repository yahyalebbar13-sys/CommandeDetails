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

// Types qu'un navigateur affiche sans exécuter de script. Tout le reste (HTML, SVG,
// documents Office…) est téléchargé : ouvert dans un onglet, un fichier piégé
// s'exécuterait sur le domaine du site, là où l'administrateur est connecté.
const AFFICHABLE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))$/i;

/**
 * Ouvre (PDF, images) ou télécharge une pièce jointe d'email. Un simple lien ne
 * peut pas porter l'en-tête d'authentification : on récupère le fichier ici.
 * À appeler directement depuis un clic (l'onglet est ouvert avant l'attente
 * réseau pour ne pas être bloqué comme pop-up).
 */
export async function openEmailAttachment(params: {
  account: string;
  uid: number | string;
  filename: string;
  contentType?: string;
}): Promise<void> {
  const { account, uid, filename } = params;
  const type = (params.contentType || '').toLowerCase();
  const inline = AFFICHABLE.test(type);
  const onglet = inline ? window.open('', '_blank') : null;

  try {
    const res = await authedFetch(
      `/api/email-attachment?account=${encodeURIComponent(account)}&uid=${encodeURIComponent(String(uid))}&filename=${encodeURIComponent(filename || '')}`
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Erreur ${res.status}`);
    }
    const blob = await res.blob();

    // Ouverture dans l'onglet préparé au clic. Si les pop-ups sont bloquées, aucun
    // onglet n'existe : on télécharge plutôt que de ne rien faire en silence.
    let affiche = false;
    if (inline) {
      const url = URL.createObjectURL(new Blob([blob], { type }));
      if (onglet) { onglet.location.href = url; affiche = true; }
      else affiche = Boolean(window.open(url, '_blank'));
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    if (!affiche) {
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'piece-jointe';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (err) {
    onglet?.close();
    throw err;
  }
}
