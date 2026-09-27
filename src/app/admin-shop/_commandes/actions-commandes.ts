// ─── Écritures d'une commande boutique depuis l'admin ────────────────────────
// Tout passe par /api/shop/commandes/interne (réservée à l'administrateur) :
//   • le statut et la phrase du suivi que voit le client vont dans la commande
//     (shop_orders/{id}, lisible par le client) ;
//   • la note interne, le motif d'annulation et qui a fait quoi vont dans
//     shop_orders_interne/{id}, que seul le serveur lit et écrit.
// Les deux s'écrivent ensemble, côté serveur, dans une même transaction.
//
// Passer par le serveur a un autre avantage : hors connexion, rien ne reste en
// file d'attente dans le navigateur. Soit le serveur a répondu (c'est fait, ou
// refusé), soit on dit franchement qu'on ne sait pas.

import type { Firestore } from 'firebase/firestore';
import type { OrderStatus, ShopOrder } from '@/lib/shop-types';
import { authedFetch } from '@/lib/authed-fetch';
import { statutLisible } from './outils-ecran';

/** Une ligne du journal de l'équipe : qui a posé quel statut, et quand. */
export interface EntreeJournal {
  statut: OrderStatus;
  auteur: string;
  /** Date ISO ; identique à celle de la ligne du suivi client correspondante. */
  le: string;
}

/** Ce que l'équipe garde pour elle sur une commande. */
export interface InfosInternes {
  noteInterne: string;
  motifAnnulation: string;
  journal: EntreeJournal[];
}

export interface ActionsCommandes {
  changerStatut(o: ShopOrder, statut: OrderStatus, options?: { motif?: string }): Promise<void>;
  enregistrerNote(o: ShopOrder, note: string): Promise<void>;
  /**
   * Ajout au contrat (facultatif) : la note, le motif et le journal, qui ne sont
   * plus dans la commande lisible par le client. Sans lui, la fiche les dit indisponibles.
   */
  lireInterne?(o: ShopOrder): Promise<InfosInternes>;
}

/** Sans réponse du serveur au-delà, on le dit plutôt que de laisser un bouton tourner sans fin. */
const DELAI_REPONSE_MS = 20_000;
const ROUTE = '/api/shop/commandes/interne';

/** Erreur d'écriture : `peutEtreFait` quand on ne sait pas si le serveur l'a enregistrée. */
export class ErreurEnregistrement extends Error {
  constructor(message: string, readonly peutEtreFait = false) {
    super(message);
    this.name = 'ErreurEnregistrement';
  }
}

function idDe(o: ShopOrder): string {
  if (!o?.id) throw new ErreurEnregistrement('Cette commande n’a pas d’identifiant : rechargez la page puis réessayez.');
  return o.id;
}

/**
 * Appel à la route, avec les cas qui comptent pour le commerçant : pas de réseau
 * (rien n'est parti), pas de réponse à temps (peut-être fait), refus du serveur.
 */
async function appeler<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErreurEnregistrement('Pas de connexion Internet : rien n’a été enregistré. Réessayez quand le réseau revient.');
  }
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_REPONSE_MS);
  let reponse: Response;
  try {
    reponse = await authedFetch(url, { ...init, signal: controleur.signal, cache: 'no-store' });
  } catch (e) {
    const envoyee = init.method === 'POST' && (e as Error)?.name === 'AbortError';
    throw envoyee
      ? new ErreurEnregistrement('Le serveur n’a pas répondu à temps. C’est peut-être enregistré quand même : regardez le statut affiché avant de réessayer.', true)
      : new ErreurEnregistrement('Pas de connexion au serveur : rien n’a été enregistré. Vérifiez Internet puis réessayez.');
  } finally {
    clearTimeout(minuterie);
  }

  let corps: any = null;
  try { corps = await reponse.json(); } catch { /* réponse vide ou non JSON */ }
  if (reponse.ok) return corps as T;

  if (reponse.status === 401 || reponse.status === 403) {
    throw new ErreurEnregistrement('Accès refusé : votre session a peut-être expiré. Reconnectez-vous puis réessayez.');
  }
  if (reponse.status === 409 && corps?.statut) {
    throw new ErreurEnregistrement(
      `Cette commande est déjà « ${statutLisible(corps.statut)} » : elle a changé entre-temps, peut-être sur un autre appareil. Vérifiez avant de continuer.`,
    );
  }
  throw new ErreurEnregistrement(String(corps?.error || 'Enregistrement impossible. Réessayez.'));
}

function envoyer(corps: Record<string, unknown>): Promise<unknown> {
  return appeler(ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

/**
 * Signature gardée pour le contrat entre chantiers. `db` n'est plus utilisé (les
 * écritures passent par le serveur) et l'auteur retenu est celui du jeton vérifié
 * côté serveur, jamais une valeur envoyée par le navigateur.
 */
export function actionsFirestore(_db: Firestore, _auteur: string): ActionsCommandes {
  return {
    async changerStatut(o, statut, options) {
      await envoyer({
        id: idDe(o),
        action: 'statut',
        statut,
        // Le statut que l'écran affichait : le serveur refuse si la commande a bougé entre-temps.
        depuis: o.status,
        ...(options?.motif?.trim() ? { motif: options.motif.trim().slice(0, 300) } : {}),
      });
    },

    async enregistrerNote(o, note) {
      await envoyer({ id: idDe(o), action: 'note', note: String(note ?? '').trim().slice(0, 2000) });
    },

    async lireInterne(o) {
      const brut = await appeler<Partial<InfosInternes>>(`${ROUTE}?id=${encodeURIComponent(idDe(o))}`);
      return {
        noteInterne: typeof brut?.noteInterne === 'string' ? brut.noteInterne : '',
        motifAnnulation: typeof brut?.motifAnnulation === 'string' ? brut.motifAnnulation : '',
        journal: Array.isArray(brut?.journal) ? brut!.journal : [],
      };
    },
  };
}
