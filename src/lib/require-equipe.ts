// ─── Garde des routes ouvertes à l'équipe (espace /staff) ET à l'administrateur ─
// Serveur uniquement. Seules trois routes l'utilisent : le traitement des
// commandes boutique (/api/shop/commandes/interne), les demandes des clients
// (/api/admin/demandes-clients) et, en lecture seule, le coût de vente
// (/api/equipe/cout-vente, ouvert à l'équipe par le patron le 30/09/2026).
// Toutes les autres restent derrière verifyAdmin : l'équipe ne voit ni
// produits, ni prix d'achat, ni /stock, ni /gestion.
//
// L'équipe partage UN compte Firebase (e-mail fabriqué sur equipe.lebtex.ma, cf.
// acces-equipe.ts), créé par l'administrateur depuis /admin-shop. Un jeton
// d'équipe n'est accepté que si TOUT concorde :
//   1. claims { staff: true, adminUid } — seul firebase-admin peut les poser,
//      un compte ouvert sur la boutique ne peut donc pas se les donner ;
//   2. shop_meta/acces_equipe désigne CE compte (uid), non désactivé ;
//   3. la connexion (auth_time) date d'après `valideApres` : changer le mot de
//      passe ou désactiver l'accès met `valideApres` à « maintenant », ce qui
//      ferme les sessions ouvertes sans attendre l'heure de vie du jeton
//      (Firebase ne coupe un jeton déjà émis qu'à son expiration) ;
//   4. l'e-mail du jeton est exactement celui du nom d'utilisateur enregistré :
//      un employé qui changerait l'adresse du compte depuis son navigateur
//      (le compte est un compte Firebase ordinaire) perd l'accès.
// Le document n'est lu que pour un jeton d'équipe. Les LECTURES se contentent
// d'une copie gardée 30 s en mémoire ; les ÉCRITURES (`sansCache`) le relisent
// toujours : sur Vercel, chaque route tourne dans sa propre fonction, et la
// route qui modifie l'accès ne peut pas vider la mémoire des autres. S'il est
// illisible, on refuse (503) plutôt que d'ouvrir à l'aveugle.

import { NextResponse } from 'next/server';
import { verifierJetonFirebase } from '@/lib/require-admin';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { ADMIN_EMAIL } from '@/lib/constants';
import { identifiantDeEmail, identifiantValide } from '@/lib/acces-equipe';

export type EquipeCheck =
  | { ok: true; role: 'admin' | 'staff'; uid: string; email: string; adminUid: string; auteur: string }
  | { ok: false; response: NextResponse };

/** Document de l'accès équipe (fermé aux navigateurs : aucune règle Firestore ne l'ouvre). */
export const CHEMIN_ACCES_EQUIPE = 'shop_meta/acces_equipe';

/** Ce que la garde retient du document (jamais de mot de passe : Firebase Auth le garde). */
type AccesEnregistre = { uid: string; identifiant: string; desactive: boolean; valideApres: number };

const DUREE_CACHE_MS = 30_000;
/** uid Firebase : lettres et chiffres, jamais de « / » (il sert de chemin Firestore). */
const UID_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

let enCache: { acces: AccesEnregistre | null; lu: number } | null = null;
let lectureEnCours: Promise<AccesEnregistre | null> | null = null;
/** Change à chaque oubli : une lecture partie avant ne remet pas en cache une valeur périmée. */
let generation = 0;

/** Relecture en cas de doute : tout champ inattendu ferme l'accès. */
function accesDe(data: FirebaseFirestore.DocumentData | undefined): AccesEnregistre | null {
  if (!data || typeof data.uid !== 'string' || !data.uid) return null;
  const valideApres = Number(data.valideApres);
  return {
    uid: data.uid,
    identifiant: typeof data.identifiant === 'string' ? data.identifiant : '',
    // Seul `false` écrit par la route ouvre l'accès.
    desactive: data.desactive !== false,
    // Illisible : aucune session ne passe, il faudra enregistrer l'accès à nouveau.
    valideApres: Number.isFinite(valideApres) ? valideApres : Number.POSITIVE_INFINITY,
  };
}

async function accesEquipe(sansCache = false): Promise<AccesEnregistre | null> {
  if (sansCache) {
    // Lecture fraîche, qui rafraîchit aussi la copie des lectures suivantes.
    const gen = generation;
    const snap = await dbAdmin().doc(CHEMIN_ACCES_EQUIPE).get();
    const acces = snap.exists ? accesDe(snap.data()) : null;
    if (gen === generation) enCache = { acces, lu: Date.now() };
    return acces;
  }
  if (enCache && Date.now() - enCache.lu < DUREE_CACHE_MS) return enCache.acces;
  // Une seule lecture à la fois, même si toute l'équipe ouvre l'écran ensemble.
  if (!lectureEnCours) {
    const gen = generation;
    const lecture: Promise<AccesEnregistre | null> = dbAdmin().doc(CHEMIN_ACCES_EQUIPE).get()
      .then(snap => {
        const acces = snap.exists ? accesDe(snap.data()) : null;
        if (gen === generation) enCache = { acces, lu: Date.now() };
        return acces;
      })
      .finally(() => { if (lectureEnCours === lecture) lectureEnCours = null; });
    lectureEnCours = lecture;
  }
  return lectureEnCours;
}

/**
 * À appeler après avoir modifié l'accès (route /api/admin/acces-equipe). Ne vide
 * que la mémoire de CETTE fonction serveur : sur Vercel, les routes de l'équipe
 * tournent souvent ailleurs. Ce n'est donc pas ce qui rend l'effet immédiat —
 * ce sont les écritures, qui relisent toujours le document (`sansCache`) ; les
 * lectures suivent dans les 30 secondes.
 */
export function oublierAccesEquipeEnCache(): void {
  generation++;
  enCache = null;
  lectureEnCours = null;
}

/**
 * L'appelant est l'administrateur ou l'équipe LEBTEX. Renvoie :
 * - `adminUid` : le propriétaire des données (users/{adminUid}/…) ;
 * - `auteur` : ce que les journaux retiennent (e-mail de l'administrateur,
 *   « Équipe (identifiant) » pour l'équipe) — jamais tiré du corps de la requête.
 *
 * `options.sansCache` (écritures : statut, note, e-mail au client, réponse à une
 * demande) : l'accès est relu dans la base, pour qu'une désactivation ou un
 * nouveau mot de passe bloque tout de suite, quelle que soit la fonction serveur.
 */
export async function verifyEquipe(req: Request, options: { sansCache?: boolean } = {}): Promise<EquipeCheck> {
  const refuse = (status: number, error: string): EquipeCheck =>
    ({ ok: false, response: NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } }) });
  const reserve = () => refuse(403, "Accès réservé à l'équipe LEBTEX");

  const v = await verifierJetonFirebase(req);
  if (!v.ok) {
    return v.raison === 'absent'
      ? refuse(401, 'Authentification requise')
      : refuse(401, 'Session invalide ou expirée — reconnectez-vous');
  }
  const { uid, email, authTime, payload } = v.jeton;

  // Même règle que verifyAdmin : l'administrateur passe toujours.
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return { ok: true, role: 'admin', uid, email, adminUid: uid, auteur: email };
  }

  // Les claims d'abord : un client de la boutique s'arrête ici, sans lecture de la base.
  const adminUid = payload.adminUid;
  if (payload.staff !== true || typeof adminUid !== 'string' || !UID_VALIDE.test(adminUid)) return reserve();
  const identifiantDuJeton = identifiantDeEmail(email);
  if (identifiantDuJeton === null) return reserve();

  let acces: AccesEnregistre | null;
  try {
    acces = await accesEquipe(options.sansCache === true);
  } catch (err: any) {
    console.error('[require-equipe] Accès équipe illisible :', err?.code || err?.message || 'erreur');
    return refuse(503, "L'espace équipe est momentanément indisponible — réessayez dans un instant");
  }

  // Un ancien compte équipe (remplacé) garde ses claims : seul celui du document compte.
  if (!acces || acces.uid !== uid) return reserve();
  if (acces.desactive) return refuse(403, "L'accès de l'équipe est désactivé — adressez-vous au responsable");
  // Connexion antérieure au dernier changement de mot de passe (ou à la désactivation).
  if (authTime < acces.valideApres) return refuse(401, 'Session expirée — reconnectez-vous');
  // L'adresse du compte n'est plus celle du nom d'utilisateur enregistré : changée
  // depuis un navigateur, ou renommage pas encore vu par ce jeton (l'espace /staff
  // en redemande un neuf sur ce refus). Le patron remet tout d'aplomb en enregistrant.
  if (!identifiantValide(acces.identifiant) || identifiantDuJeton !== acces.identifiant) return reserve();

  return { ok: true, role: 'staff', uid, email, adminUid, auteur: `Équipe (${acces.identifiant})` };
}
