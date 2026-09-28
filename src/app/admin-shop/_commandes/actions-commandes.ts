// ─── Écritures d'une commande boutique depuis l'admin ────────────────────────
// Tout passe par /api/shop/commandes/interne (administrateur et équipe /staff) :
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
import { signalerAccesRefuse } from '@/lib/acces-equipe';
import { EMAIL_LEBTEX } from '@/lib/email-confirmation-client';
import { statutLisible } from './outils-ecran';

/** Une ligne du journal de l'équipe : qui a posé quel statut, et quand. */
export interface EntreeJournal {
  statut: OrderStatus;
  auteur: string;
  /** Date ISO ; identique à celle de la ligne du suivi client correspondante. */
  le: string;
}

/** Un e-mail envoyé au client : lequel, à qui, quand, par qui. */
export interface EmailClientEnvoye {
  /** 'confirmation' (envoyé depuis la fiche) ou 'reception' (accusé automatique à la commande). */
  type: string;
  a: string;
  /** Date ISO. */
  le: string;
  /** Adresse de l'administrateur, ou 'automatique'. */
  auteur: string;
  /** Statut de la commande à l'envoi ('' si inconnu) : « pending » = accusé de réception. */
  statut?: OrderStatus | '';
}

/** Ce que renvoie un envoi réussi. */
export interface EmailEnvoye {
  envoyeA: string;
  le: string;
  /** Statut de la commande au moment de l'envoi, d'après le serveur. */
  statut?: OrderStatus;
}

/** Ce que l'équipe garde pour elle sur une commande. */
export interface InfosInternes {
  noteInterne: string;
  motifAnnulation: string;
  journal: EntreeJournal[];
  /** E-mails envoyés au client, du plus ancien au plus récent (vide si aucun). */
  emailsClient: EmailClientEnvoye[];
}

export interface ActionsCommandes {
  changerStatut(o: ShopOrder, statut: OrderStatus, options?: { motif?: string }): Promise<void>;
  enregistrerNote(o: ShopOrder, note: string): Promise<void>;
  /**
   * Ajout au contrat (facultatif) : la note, le motif et le journal, qui ne sont
   * plus dans la commande lisible par le client. Sans lui, la fiche les dit indisponibles.
   */
  lireInterne?(o: ShopOrder): Promise<InfosInternes>;
  /**
   * Ajout au contrat (facultatif) : envoie au client l'e-mail de confirmation
   * (lib/email-confirmation-client.ts) et attend que Gmail l'ait accepté.
   * Sans lui, la fiche n'affiche pas le bouton.
   * Refus « un e-mail est parti (ou part) il y a moins de 2 min » : ErreurConfirmationRecente ;
   * `forcer` renvoie quand même. `peutEtreFait` : l'e-mail est peut-être parti.
   */
  envoyerEmailConfirmation?(o: ShopOrder, options?: { forcer?: boolean; delai?: string }): Promise<EmailEnvoye>;
}

/** Sans réponse du serveur au-delà, on le dit plutôt que de laisser un bouton tourner sans fin. */
const DELAI_REPONSE_MS = 20_000;
/** L'e-mail attend Gmail (connexion, envoi) : un peu plus de patience. */
const DELAI_ENVOI_EMAIL_MS = 35_000;
const ROUTE = '/api/shop/commandes/interne';

/** Erreur d'écriture : `peutEtreFait` quand on ne sait pas si le serveur l'a enregistrée. */
export class ErreurEnregistrement extends Error {
  /** `statutHttp` : code de la réponse du serveur quand il a répondu (sinon absent). */
  constructor(message: string, readonly peutEtreFait = false, readonly statutHttp?: number) {
    super(message);
    this.name = 'ErreurEnregistrement';
  }
}

/**
 * Un e-mail est parti pour ce client il y a moins de 2 min (ou un envoi est en
 * cours, `enCours`) : rien n'a été envoyé cette fois. La fiche propose
 * « Renvoyer quand même », sauf pendant un envoi en cours.
 */
export class ErreurConfirmationRecente extends ErreurEnregistrement {
  constructor(message: string, readonly dejaEnvoyeeLe: string, readonly enCours = false) {
    super(message);
    this.name = 'ErreurConfirmationRecente';
  }
}

const estEmailEnvoye = (e: any): e is EmailClientEnvoye =>
  !!e && typeof e.type === 'string' && typeof e.a === 'string' && typeof e.le === 'string'
  && !Number.isNaN(Date.parse(e.le));

function idDe(o: ShopOrder): string {
  if (!o?.id) throw new ErreurEnregistrement('Cette commande n’a pas d’identifiant : rechargez la page puis réessayez.');
  return o.id;
}

/**
 * Appel à la route, avec les cas qui comptent pour le commerçant : pas de réseau
 * (rien n'est parti), pas de réponse à temps (peut-être fait), refus du serveur.
 */
async function appeler<T>(url: string, init: RequestInit = {}, delaiMs = DELAI_REPONSE_MS): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErreurEnregistrement('Pas de connexion Internet : rien n’a été enregistré. Réessayez quand le réseau revient.');
  }
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), delaiMs);
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
    // L'espace /staff revérifie aussitôt la session (mot de passe changé, accès
    // désactivé) et ramène l'employé à la connexion s'il le faut.
    signalerAccesRefuse(reponse.status);
    // La raison donnée par le serveur (phrase fixe, en français) plutôt qu'une supposition.
    const raison = typeof corps?.error === 'string' ? corps.error.trim().replace(/[.\s]+$/, '') : '';
    throw new ErreurEnregistrement(raison
      // « rien n’a été enregistré » : l'envoi d'e-mail le réécrit en « rien n’a été envoyé ».
      ? `Accès refusé, rien n’a été enregistré : ${raison.charAt(0).toLowerCase()}${raison.slice(1)}.`
      : 'Accès refusé : votre session a peut-être expiré. Reconnectez-vous puis réessayez.');
  }
  if (reponse.status === 409 && corps?.statut) {
    throw new ErreurEnregistrement(
      `Cette commande est déjà « ${statutLisible(corps.statut)} » : elle a changé entre-temps, peut-être sur un autre appareil. Vérifiez avant de continuer.`,
    );
  }
  if (reponse.status === 409 && typeof corps?.dejaEnvoyeeLe === 'string') {
    throw new ErreurConfirmationRecente(
      String(corps?.error || 'Une confirmation vient déjà d’être envoyée à ce client.'),
      corps.dejaEnvoyeeLe,
      corps?.enCours === true,
    );
  }
  // `incertain` : le serveur lui-même ne sait pas si c'est fait (e-mail coupé en plein envoi).
  throw new ErreurEnregistrement(String(corps?.error || 'Enregistrement impossible. Réessayez.'), corps?.incertain === true, reponse.status);
}

function envoyer<T = unknown>(corps: Record<string, unknown>, delaiMs?: number): Promise<T> {
  return appeler<T>(ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  }, delaiMs);
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
        emailsClient: Array.isArray(brut?.emailsClient) ? brut!.emailsClient.filter(estEmailEnvoye) : [],
      };
    },

    async envoyerEmailConfirmation(o, options) {
      let reponse: { envoyeA?: unknown; le?: unknown; statut?: unknown } | null;
      try {
        reponse = await envoyer<{ envoyeA?: unknown; le?: unknown; statut?: unknown }>(
          { id: idDe(o), action: 'email-confirmation', ...(options?.forcer ? { forcer: true } : {}), ...(options?.delai?.trim() ? { delai: options.delai.trim() } : {}) },
          DELAI_ENVOI_EMAIL_MS,
        );
      } catch (e) {
        // Le serveur a répondu qu'il ne sait pas (Gmail coupé en plein envoi) : son message le dit.
        if (e instanceof ErreurEnregistrement && e.peutEtreFait && e.statutHttp && e.statutHttp !== 504) throw e;
        // Les messages génériques parlent d'« enregistré » : ici, c'est un e-mail.
        // Pas de réponse, ou 504 : la fonction du serveur a été coupée en route, peut-être après l'envoi.
        if (e instanceof ErreurEnregistrement && (e.peutEtreFait || e.statutHttp === 504)) {
          throw new ErreurEnregistrement(
            'Le serveur n’a pas répondu à temps : l’e-mail est peut-être parti quand même. Fermez cette fenêtre, la fiche vérifie '
            + `si l’envoi est noté ; s’il ne l’est pas, regardez dans les « Messages envoyés » de ${EMAIL_LEBTEX} avant de renvoyer.`,
            true,
          );
        }
        if (e instanceof ErreurEnregistrement && /rien n’a été enregistré/.test(e.message)) {
          throw new ErreurEnregistrement(e.message.replace('rien n’a été enregistré', 'rien n’a été envoyé'));
        }
        throw e;
      }
      const envoyeA = typeof reponse?.envoyeA === 'string' ? reponse.envoyeA : String(o.customerEmail ?? '').trim();
      const le = typeof reponse?.le === 'string' && !Number.isNaN(Date.parse(reponse.le)) ? reponse.le : new Date().toISOString();
      const statut = typeof reponse?.statut === 'string' && reponse.statut ? (reponse.statut as OrderStatus) : undefined;
      return { envoyeA, le, ...(statut ? { statut } : {}) };
    },
  };
}
