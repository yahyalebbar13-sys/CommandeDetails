'use client';

// ─── Commandes boutique écoutées en temps réel ───────────────────────────────
// Une seule écoute, partagée par l'admin (/admin-shop) et l'espace équipe
// (/staff) : même tri, même remise d'aplomb des commandes, même voyant honnête.
// Le voyant ne dit « En direct » que quand le serveur a répondu, « Hors ligne »
// quand la liste affichée vient du cache, et l'écran n'affiche jamais « aucune
// commande » quand on ne sait pas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore';
import type { ShopOrder } from '@/lib/shop-types';
import { normaliserCommande } from './normaliser-commande';
import {
  MESSAGE_HORS_LIGNE_SANS_DONNEES,
  messageErreurLecture,
  type EtatConnexion,
} from '../_coque/etat-commandes';

export interface CommandesEnDirect {
  /** Toutes les commandes, la plus récente d'abord, remises d'aplomb. */
  orders: ShopOrder[];
  /** Le serveur a répondu au moins une fois. */
  pret: boolean;
  /** Premier chargement en cours (ni réponse du serveur, ni erreur à dire). */
  chargement: boolean;
  /** Ce qu'on dit à l'écran quand la liste ne peut pas être lue ; null sinon. */
  erreur: string | null;
  etat: EtatConnexion;
  /** Dernière réponse du serveur. */
  actualiseLe: Date | null;
  /** Relance l'écoute (bouton « Réessayer »), plutôt que recharger la page. */
  reessayer: () => void;
}

export function useCommandesEnDirect(db: Firestore): CommandesEnDirect {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [pret, setPret] = useState(false);              // le serveur a répondu au moins une fois
  const pretRef = useRef(false);
  const [horsLigne, setHorsLigne] = useState(false);    // la dernière liste vient du cache, pas du serveur
  const [erreurLecture, setErreurLecture] = useState<string | null>(null); // la base a refusé : écoute arrêtée
  const [actualiseLe, setActualiseLe] = useState<Date | null>(null);
  const [tentative, setTentative] = useState(0);        // « Réessayer » relance l'écoute

  useEffect(() => {
    setErreurLecture(null);
    const q = query(collection(db, 'shop_orders'), orderBy('createdAt', 'desc'));
    // includeMetadataChanges : on est prévenu quand la connexion tombe (liste
    // servie depuis le cache), sinon le voyant resterait vert hors ligne.
    const arreter = onSnapshot(
      q,
      { includeMetadataChanges: true },
      snap => {
        const duCache = snap.metadata.fromCache;
        // Écoute relancée hors connexion (« Réessayer ») : le cache en mémoire a été
        // vidé à l'arrêt, et Firestore renvoie une liste vide « tirée du cache ».
        // Ce n'est pas « plus aucune commande » : on garde la dernière liste connue.
        if (duCache && snap.empty && pretRef.current) {
          setHorsLigne(true);
          setErreurLecture(null);
          return;
        }
        // N'importe qui peut créer une commande : chacune est remise d'aplomb ici,
        // au seul point d'entrée, avant d'arriver dans un écran.
        setOrders(snap.docs.map(d => normaliserCommande(d.id, d.data())));
        setHorsLigne(duCache);
        if (!duCache) {
          pretRef.current = true;
          setPret(true);
          setActualiseLe(new Date());
        }
        setErreurLecture(null);
      },
      err => setErreurLecture(messageErreurLecture(err)),
    );
    return () => arreter();
  }, [db, tentative]);

  const reessayer = useCallback(() => setTentative(t => t + 1), []);

  // Ce que voient les écrans : jamais « aucune commande » quand on ne sait pas.
  const erreur = erreurLecture ?? (!pret && horsLigne ? MESSAGE_HORS_LIGNE_SANS_DONNEES : null);
  const chargement = !pret && !erreur;
  const etat: EtatConnexion = erreurLecture ? 'erreur' : horsLigne ? 'hors_ligne' : pret ? 'direct' : 'connexion';

  return { orders, pret, chargement, erreur, etat, actualiseLe, reessayer };
}
