// ─── Gmail, lu directement depuis le navigateur ───────────────────────────────
// Aucun mot de passe, aucun secret, aucune route serveur : l'administrateur
// autorise la boîte dans une fenêtre Google (droit « lecture seule »), et le
// navigateur interroge l'API Gmail avec ce jeton, valable une heure. Google
// vérifie lui-même qui lit quoi ; le jeton ne quitte jamais ce navigateur.

import { toComplet, toResume, remplacerCids, base64UrlToBytes, type EmailComplet, type EmailResume, type GmailMessage, type PieceJointe } from './gmail-message';

export type MailboxKey = 'lebtex' | 'robeinbox';

export const MAILBOXES: { key: MailboxKey; label: string; email: string; color: string }[] = [
  { key: 'lebtex', label: 'LEBTEX', email: 'lebtexsarlau@gmail.com', color: 'bg-amber-500' },
  { key: 'robeinbox', label: 'ROBE IN BOX', email: 'robeinbox@gmail.com', color: 'bg-violet-500' },
];

/**
 * Identifiant OAuth « Application Web » du projet Google Cloud. Public par
 * nature (toute page qui ouvre la fenêtre Google le montre), comme la clé Firebase.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type Jeton = { token: string; expiresAt: number };

/** Jeton refusé par Gmail (expiré ou révoqué) : il faut reconnecter la boîte. */
export class SessionGmailExpiree extends Error {
  constructor() {
    super('Session Gmail expirée — reconnectez la boîte.');
  }
}

// ─── Jetons gardés le temps de l'onglet ───────────────────────────────────────
// sessionStorage : un rechargement de page ne redemande pas la connexion, et
// tout disparaît à la fermeture de l'onglet.
const cle = (box: MailboxKey) => `gmail-jeton:${box}`;

export function jetonsEnregistres(): Partial<Record<MailboxKey, Jeton>> {
  const out: Partial<Record<MailboxKey, Jeton>> = {};
  for (const { key } of MAILBOXES) {
    try {
      const j = JSON.parse(sessionStorage.getItem(cle(key)) || 'null') as Jeton | null;
      if (j?.token && j.expiresAt > Date.now()) out[key] = j;
    } catch { /* stockage indisponible : on se reconnectera */ }
  }
  return out;
}

function enregistrer(box: MailboxKey, j: Jeton | null) {
  try {
    if (j) sessionStorage.setItem(cle(box), JSON.stringify(j));
    else sessionStorage.removeItem(cle(box));
  } catch { /* stockage indisponible : le jeton reste en mémoire */ }
}

// ─── Fenêtre Google ───────────────────────────────────────────────────────────
let gis: Promise<void> | null = null;

/** Charge le script Google à l'avance : au clic, la fenêtre doit s'ouvrir sans attente, sinon le navigateur la bloque. */
export function preparerGoogle(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (!gis) {
    gis = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gis = null; reject(new Error('Impossible de charger la connexion Google.')); };
      document.head.appendChild(s);
    });
  }
  return gis;
}

/**
 * Ouvre la fenêtre Google pour cette boîte et renvoie un jeton de lecture.
 * À appeler directement depuis un clic.
 */
export async function connecterBoite(box: MailboxKey): Promise<Jeton> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Connexion Google non configurée (NEXT_PUBLIC_GOOGLE_CLIENT_ID).');
  const boite = MAILBOXES.find(b => b.key === box)!;
  await preparerGoogle();
  const oauth2 = (window as any).google.accounts.oauth2;

  const jeton = await new Promise<Jeton>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      login_hint: boite.email,
      callback: (resp: any) => {
        if (resp?.error) return reject(new Error(resp.error_description || 'Autorisation Google refusée.'));
        if (!oauth2.hasGrantedAllScopes(resp, SCOPE)) {
          return reject(new Error('La lecture des emails n\'a pas été autorisée dans la fenêtre Google.'));
        }
        // Une minute de marge : on reconnecte avant que Gmail ne refuse le jeton.
        resolve({ token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000 });
      },
      error_callback: (err: any) => {
        const type = err?.type;
        reject(new Error(
          type === 'popup_failed_to_open' ? 'Fenêtre Google bloquée : autorisez les pop-ups pour ce site.'
            : type === 'popup_closed' ? 'Fenêtre Google fermée avant la fin.'
              : 'Connexion Google impossible.'
        ));
      },
    });
    client.requestAccessToken();
  });

  // Le compte choisi dans la fenêtre doit être celui de la boîte : sinon on
  // afficherait les emails d'une autre boîte sous le nom de celle-ci. Le jeton
  // n'est pas révoqué : révoquer retire l'accès de ce compte partout, y compris
  // à l'autre boîte si c'est elle qui a été choisie. Il expire seul dans l'heure.
  const profil = await appelGmail<{ emailAddress?: string }>(jeton.token, '/profile');
  const email = (profil.emailAddress || '').toLowerCase();
  if (email !== boite.email) {
    throw new Error(`Compte ${email || 'inconnu'} choisi : connectez ${boite.email}.`);
  }
  enregistrer(box, jeton);
  return jeton;
}

/**
 * Oublie le jeton dans ce navigateur. Il n'est pas révoqué chez Google : la
 * révocation couperait aussi les autres onglets et postes connectés à la même
 * boîte, et redemanderait l'autorisation complète. Il expire seul dans l'heure.
 */
export function oublierJeton(box: MailboxKey) {
  enregistrer(box, null);
}

// ─── API Gmail ────────────────────────────────────────────────────────────────
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

async function appelGmail<T>(token: string, path: string, params: [string, string][] = []): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of params) url.searchParams.append(k, v);
  for (let essai = 0; ; essai++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new SessionGmailExpiree();
    if (res.ok) return res.json();

    const corps = await res.json().catch(() => null);
    const message: string = corps?.error?.message || '';
    const raison: string = corps?.error?.errors?.[0]?.reason || '';
    // Trop de requêtes d'un coup : Gmail demande d'attendre un peu et de réessayer.
    const limite = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(raison));
    if (limite && essai < 3) { await pause(1000 * 2 ** essai); continue; }
    if (/has not been used|is disabled|accessNotConfigured/i.test(message)) {
      throw new Error('L’API Gmail n’est pas activée dans le projet Google Cloud.');
    }
    throw new Error(message ? `Gmail : ${message}` : `Gmail : erreur ${res.status}`);
  }
}

/** Exécute fn sur chaque élément, n à la fois (Gmail limite le débit par utilisateur). */
async function parPaquets<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let suivant = 0;
  const ouvriers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (suivant < items.length) {
      const i = suivant++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(ouvriers);
  return out;
}

async function idsDesMessages(token: string, q: string, max: number): Promise<string[]> {
  const liste = await appelGmail<{ messages?: { id: string }[] }>(token, '/messages', [
    ['q', q],
    ['maxResults', String(max)],
  ]);
  return (liste.messages || []).map(m => m.id);
}

/** Les derniers messages répondant à la recherche Gmail `q`, pour la liste. */
export async function listerEmails(token: string, q: string, max = 30): Promise<EmailResume[]> {
  const ids = await idsDesMessages(token, q, max);
  return parPaquets(ids, 8, async id =>
    toResume(await appelGmail<GmailMessage>(token, `/messages/${id}`, [
      ['format', 'metadata'],
      ['metadataHeaders', 'Subject'],
      ['metadataHeaders', 'From'],
      ['metadataHeaders', 'Date'],
    ]))
  );
}

export async function lireEmail(token: string, id: string): Promise<EmailComplet> {
  return toComplet(await appelGmail<GmailMessage>(token, `/messages/${id}`, [['format', 'full']]));
}

/** Messages complets répondant à `q` (contenu compris), pour la détection. */
export async function lireEmails(token: string, q: string, max = 40): Promise<EmailComplet[]> {
  const ids = await idsDesMessages(token, q, max);
  return parPaquets(ids, 6, id => lireEmail(token, id));
}

/**
 * HTML du message avec ses images collées (« cid: ») remplacées par leur
 * contenu, pour qu'elles s'affichent dans le cadre isolé du lecteur.
 */
export async function htmlAvecImages(token: string, email: EmailComplet): Promise<string> {
  const contenus = new Map<string, string>();
  let total = 0;
  for (const img of email.images) {
    let data = img.data;
    if (!data && img.attachmentId) {
      try {
        data = (await appelGmail<{ data?: string }>(token, `/messages/${email.id}/attachments/${img.attachmentId}`)).data;
      } catch (err) {
        if (err instanceof SessionGmailExpiree) throw err;
        continue; // une image illisible n'empêche pas de lire le message
      }
    }
    if (!data) continue;
    total += data.length;
    if (total > 10_000_000) break;
    contenus.set(img.contentId, `data:${img.mimeType};base64,${data.replace(/-/g, '+').replace(/_/g, '/')}`);
  }
  return remplacerCids(email.html, contenus);
}

// ─── Pièces jointes ───────────────────────────────────────────────────────────
// Types qu'un navigateur affiche sans exécuter de script. Tout le reste (HTML, SVG,
// documents Office…) est téléchargé : ouvert dans un onglet, un fichier piégé
// s'exécuterait sur le domaine du site, là où l'administrateur est connecté.
const AFFICHABLE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))$/i;

/**
 * Ouvre (PDF, images) ou télécharge une pièce jointe. À appeler directement
 * depuis un clic : l'onglet est ouvert avant l'attente réseau pour ne pas être
 * bloqué comme pop-up.
 */
export async function ouvrirPieceJointe(token: string, messageId: string, pj: PieceJointe): Promise<void> {
  const type = (pj.mimeType || '').toLowerCase();
  const inline = AFFICHABLE.test(type);
  const onglet = inline ? window.open('', '_blank') : null;

  try {
    let data = pj.data;
    if (!data && pj.attachmentId) {
      const res = await appelGmail<{ data?: string }>(token, `/messages/${messageId}/attachments/${pj.attachmentId}`);
      data = res.data;
    }
    if (!data) throw new Error('Pièce jointe vide.');
    const octets = base64UrlToBytes(data);

    // Ouverture dans l'onglet préparé au clic. Si les pop-ups sont bloquées, aucun
    // onglet n'existe : on télécharge plutôt que de ne rien faire en silence.
    let affiche = false;
    if (inline) {
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type }));
      if (onglet) { onglet.location.href = url; affiche = true; }
      else affiche = Boolean(window.open(url, '_blank'));
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
    }
    if (!affiche) {
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = pj.filename || 'piece-jointe';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
    }
  } catch (err) {
    onglet?.close();
    throw err;
  }
}
