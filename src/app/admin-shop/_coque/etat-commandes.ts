// ─── État de la liste des commandes, vu par la coque de l'admin ──────────────
// Le voyant de connexion doit dire la vérité : « En direct » seulement quand le
// serveur a répondu, « Hors ligne » quand la liste n'est plus à jour.

import { useEffect, useState } from 'react';
import type { ShopOrder } from '@/lib/shop-types';
import { enRetard } from '@/lib/commandes-boutique';

export type EtatConnexion =
  | 'connexion'   // on attend la première réponse du serveur
  | 'direct'      // la liste suit la base en temps réel
  | 'hors_ligne'  // plus de réseau : la liste affichée date de la dernière réponse
  | 'erreur';     // la base a refusé la lecture : l'écoute est arrêtée

/** Ce qu'on dit au commerçant quand la lecture des commandes échoue. */
export function messageErreurLecture(err: unknown): string {
  const code = String((err as { code?: string })?.code || '').replace(/^firestore\//, '');
  switch (code) {
    case 'permission-denied':
      return "La base refuse l'accès aux commandes. Déconnectez-vous puis reconnectez-vous ; si ça continue, les droits de la base sont à vérifier.";
    case 'unauthenticated':
      return 'Votre session a expiré : reconnectez-vous pour voir les commandes.';
    case 'unavailable':
      return 'La base de données ne répond pas (connexion internet ?). Réessayez dans un instant.';
    case 'failed-precondition':
      return 'La base demande un réglage technique pour afficher cette liste. Prévenez la personne qui gère le site.';
    case 'resource-exhausted':
      return 'La base est saturée pour le moment. Réessayez dans quelques minutes.';
    default:
      return `Les commandes n'ont pas pu être lues${code ? ` (code : ${code})` : ''}. Réessayez.`;
  }
}

export const MESSAGE_HORS_LIGNE_SANS_DONNEES =
  "Pas de connexion internet : les commandes ne peuvent pas être chargées pour l'instant. Elles s'afficheront dès le retour de la connexion.";

/** Heure courante qui avance toute seule : une commande passe « en retard » sans attendre un nouvel envoi de la base. */
export function useMaintenant(intervalleMs = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), intervalleMs);
    // Au retour sur l'onglet, on remet l'heure à jour tout de suite.
    const auRetour = () => { if (document.visibilityState === 'visible') setMaintenant(Date.now()); };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [intervalleMs]);
  return maintenant;
}

/** Ce que la navigation et l'en-tête affichent en pastille. */
export function resumeAConfirmer(orders: Pick<ShopOrder, 'status' | 'createdAt'>[], maintenant: number) {
  let aConfirmer = 0;
  let enRetardNb = 0;
  for (const o of orders) {
    if (o.status !== 'pending') continue;
    aConfirmer++;
    if (enRetard(o, maintenant)) enRetardNb++;
  }
  return { aConfirmer, enRetard: enRetardNb };
}

/** Heure lisible « 14:32 » pour les infobulles du voyant. */
export function heureCourte(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
