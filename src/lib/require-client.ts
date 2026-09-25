// ─── Garde des routes de l'espace client ──────────────────────────────────────
// Serveur uniquement. Un client ne lit plus la base directement : il appelle
// ces routes, qui vérifient son jeton Firebase, retrouvent QUI il est dans
// `clientAccess/{uid}` (nom du client + administrateur), et ne lui renvoient
// que ce qui le concerne. Le nom du client vient toujours de la base, jamais
// de la requête.
//
// Un document `clientAccess` ne suffit pas à lui seul : n'importe qui peut
// créer un compte sur la boutique et s'écrire le sien. Seuls comptent ceux qui
// désignent L'administrateur de LEBTEX (publicConfig/adminConfig), et jamais
// ceux du personnel (role 'staff'), qui ont leur propre espace.

import { NextResponse } from 'next/server';
import { lireJetonFirebase } from '@/lib/require-admin';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { normaliserNomClient } from '@/lib/portail-client-donnees';

export type ClientCheck =
  | {
      ok: true;
      uid: string;
      email: string;
      clientName: string;
      adminUid: string;
      /** Autres noms du même client (normalisés), tenus par l'administrateur. */
      aliases: string[];
    }
  | { ok: false; response: NextResponse };

/** Même repli que les autres routes serveur (cron, webhook ShipsGo). */
const ADMIN_UID_PAR_DEFAUT = 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
/** L'administrateur ne change pas : une lecture toutes les dix minutes suffit. */
const DUREE_CACHE_ADMIN_MS = 10 * 60_000;
const MAX_ALIAS = 20;

let adminEnCache: { uid: string; lu: number } | null = null;
let lectureAdmin: Promise<string> | null = null;

/** uid de L'administrateur, lu dans publicConfig/adminConfig (cache de 10 min). */
async function uidAdministrateur(): Promise<string> {
  if (adminEnCache && Date.now() - adminEnCache.lu < DUREE_CACHE_ADMIN_MS) return adminEnCache.uid;
  // Une seule lecture à la fois, même si dix clients arrivent ensemble.
  if (!lectureAdmin) {
    lectureAdmin = dbAdmin().doc('publicConfig/adminConfig').get()
      .then(snap => {
        const lu = snap.exists ? snap.data()?.adminUid : undefined;
        const uid = typeof lu === 'string' && lu.trim() ? lu.trim() : ADMIN_UID_PAR_DEFAUT;
        adminEnCache = { uid, lu: Date.now() };
        return uid;
      })
      .catch(err => {
        // Lecture impossible : l'ancienne valeur vaut mieux que rien.
        if (adminEnCache) return adminEnCache.uid;
        throw err;
      })
      .finally(() => { lectureAdmin = null; });
  }
  return lectureAdmin;
}

export async function verifyClient(req: Request): Promise<ClientCheck> {
  const refuse = (status: number, error: string): ClientCheck =>
    ({ ok: false, response: NextResponse.json({ error }, { status }) });

  const jeton = await lireJetonFirebase(req);
  if (!jeton) return refuse(401, 'Session expirée — reconnectez-vous');

  let data: FirebaseFirestore.DocumentData | null | undefined;
  let adminAttendu: string;
  try {
    const [acces, admin] = await Promise.all([
      dbAdmin().doc(`clientAccess/${jeton.uid}`).get(),
      uidAdministrateur(),
    ]);
    data = acces.exists ? acces.data() : null;
    adminAttendu = admin;
  } catch (err) {
    console.error('[require-client] Vérification impossible :', err);
    return refuse(503, 'Votre espace est momentanément indisponible — réessayez dans un instant');
  }

  const sansAcces = () => refuse(403, "Ce compte n'a pas accès à l'espace client");
  const clientName = typeof data?.clientName === 'string' ? data.clientName.trim() : '';
  const adminUid = typeof data?.adminUid === 'string' ? data.adminUid : '';
  if (!clientName || !adminUid || adminUid.includes('/')) return sansAcces();
  // Un accès que l'on s'est écrit soi-même désigne un autre « administrateur ».
  if (adminUid !== adminAttendu) return sansAcces();
  // Le personnel a son propre espace, pas celui des clients.
  if (data?.role === 'staff') return sansAcces();

  const aliases = Array.isArray(data?.aliases)
    ? [...new Set(
        (data.aliases as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .map(normaliserNomClient)
          .filter(Boolean),
      )].slice(0, MAX_ALIAS)
    : [];

  return { ok: true, uid: jeton.uid, email: jeton.email, clientName, adminUid, aliases };
}
