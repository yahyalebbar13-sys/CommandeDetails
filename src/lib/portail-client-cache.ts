// ─── Caches de l'espace client (serveur) ──────────────────────────────────────
// Chaque ouverture de l'espace client relisait TOUTE la base de
// l'administrateur (articles, dossiers, familles, pôles) : des milliers de
// lectures Firestore par client et par rafraîchissement. Deux caches en
// mémoire, propres à chaque instance du serveur :
//
//   • les données brutes de l'administrateur, 45 s, partagées par tous ses
//     clients et par les deux routes (portail, demandes) ;
//   • la réponse déjà calculée pour un client, rendue telle quelle s'il
//     redemande moins de 10 s après (double onglet, rafraîchissements en rafale).
//
// Les données brutes ne sortent jamais d'ici telles quelles : construirePortail
// choisit ensuite ce qui revient à chaque client.

export type DonneesAdmin = {
  articles: any[];
  factures: any[];
  categories: any[];
  /** generalCategories */
  poles: any[];
};

const DUREE_DONNEES_MS = 45_000;
const INTERVALLE_CLIENT_MS = 10_000;

const donneesParAdmin = new Map<string, { lu: number; promesse: Promise<DonneesAdmin> }>();

/**
 * Articles, dossiers, familles et pôles de l'administrateur, en lignes simples
 * `{ id, ...champs }`. Lus au plus une fois toutes les 45 s ; des demandes
 * simultanées attendent la même lecture au lieu d'en lancer chacune une.
 */
export function lireDonneesAdmin(db: FirebaseFirestore.Firestore, adminUid: string): Promise<DonneesAdmin> {
  const enCache = donneesParAdmin.get(adminUid);
  if (enCache && Date.now() - enCache.lu < DUREE_DONNEES_MS) return enCache.promesse;

  const base = `users/${adminUid}`;
  const lignes = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const promesse = Promise.all([
    db.collection(`${base}/articles`).get(),
    db.collection(`${base}/factures`).get(),
    db.collection(`${base}/categories`).get(),
    db.collection(`${base}/generalCategories`).get(),
  ]).then(([articles, factures, categories, poles]) => ({
    articles: lignes(articles),
    factures: lignes(factures),
    categories: lignes(categories),
    poles: lignes(poles),
  }));

  donneesParAdmin.set(adminUid, { lu: Date.now(), promesse });
  // Une lecture ratée ne doit pas rester en cache 45 s : la suivante réessaie.
  promesse.catch(() => {
    if (donneesParAdmin.get(adminUid)?.promesse === promesse) donneesParAdmin.delete(adminUid);
  });
  return promesse;
}

const reponsesParClient = new Map<string, { le: number; signature: string; charge: unknown }>();

/**
 * Réponse déjà calculée pour ce client il y a moins de 10 s, ou undefined.
 * `signature` résume ce qui la détermine (administrateur, nom, alias) : si
 * l'accès du client a changé entre-temps, on recalcule.
 */
export function reponseRecente<T>(uid: string, signature: string): T | undefined {
  const r = reponsesParClient.get(uid);
  if (!r || r.signature !== signature || Date.now() - r.le >= INTERVALLE_CLIENT_MS) return undefined;
  return r.charge as T;
}

/** Garde la réponse qui vient de partir vers ce client (après un succès seulement). */
export function memoriserReponse(uid: string, signature: string, charge: unknown): void {
  const maintenant = Date.now();
  // Ménage au passage : rien ne sert au-delà de 10 s, la table reste petite.
  for (const [cle, r] of reponsesParClient) {
    if (maintenant - r.le >= INTERVALLE_CLIENT_MS) reponsesParClient.delete(cle);
  }
  reponsesParClient.set(uid, { le: maintenant, signature, charge });
}
