// ─── Client ShipsGo (API v2) ──────────────────────────────────────────────────
// Serveur uniquement : le jeton est un secret, il ne doit jamais partir dans le
// navigateur. Deux appels suffisent au suivi d'un dossier :
//   • ouvrir le suivi d'un conteneur / Master BL  → coûte 1 crédit, une seule fois
//   • relire ce suivi                             → gratuit et illimité
//
// Le dédoublonnage est fait par ShipsGo : à référence identique, la création
// renvoie 409 avec le suivi existant et ne prélève rien (cf. leur documentation
// « Duplicate Shipments »). On peut donc relancer sans risquer de payer deux fois.
//
// Documentation : https://api.shipsgo.com/docs/v2/

import { typeReference } from './suivi-conteneur';

const BASE = 'https://api.shipsgo.com/v2';
/** Au-delà, la compagnie ne répondra pas mieux — mieux vaut rendre la main. */
const DELAI_MS = 20_000;

export type CodeErreurShipsGo =
  | 'CLE_MANQUANTE'   // SHIPSGO_API_TOKEN absent du serveur
  | 'AUTH'            // jeton refusé
  | 'DROITS'          // jeton valide mais action non autorisée pour ce compte
  | 'CREDITS'         // plus de crédits
  | 'REFERENCE'       // numéro refusé par ShipsGo (format)
  | 'INTROUVABLE'     // suivi supprimé côté ShipsGo
  | 'TROP_DE_DEMANDES'
  | 'RESEAU'
  | 'HTTP';

export class ErreurShipsGo extends Error {
  code: CodeErreurShipsGo;
  statut?: number;
  constructor(code: CodeErreurShipsGo, message: string, statut?: number) {
    super(message);
    this.name = 'ErreurShipsGo';
    this.code = code;
    this.statut = statut;
  }
}

function jeton(): string {
  const t = (process.env.SHIPSGO_API_TOKEN || '').trim();
  if (!t) {
    throw new ErreurShipsGo(
      'CLE_MANQUANTE',
      "Suivi maritime non configuré : ajoutez SHIPSGO_API_TOKEN aux variables d'environnement.",
    );
  }
  return t;
}

/** Crédits restants annoncés par la dernière réponse, quand ShipsGo les donne. */
function creditsRestants(r: Response): number | undefined {
  const v = r.headers.get('X-Shipsgo-Credits-Remaining');
  return v === null ? undefined : Number(v);
}

async function appeler(chemin: string, init: RequestInit = {}): Promise<Response> {
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, {
      ...init,
      headers: {
        'X-Shipsgo-User-Token': jeton(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(DELAI_MS),
      cache: 'no-store',
    });
  } catch (e: any) {
    if (e instanceof ErreurShipsGo) throw e;
    throw new ErreurShipsGo('RESEAU', `ShipsGo injoignable : ${e?.message || e}`);
  }

  if (reponse.status === 401) {
    throw new ErreurShipsGo('AUTH', 'Jeton ShipsGo refusé — vérifiez SHIPSGO_API_TOKEN.', 401);
  }
  // 403 n'est pas un mauvais jeton mais un jeton sans le droit demandé (rôle du
  // sous-compte) : envoyer l'administrateur changer une clé valide le mènerait
  // dans le mur.
  if (reponse.status === 403) {
    throw new ErreurShipsGo('DROITS', "Ce compte ShipsGo n'a pas le droit d'effectuer cette action — vérifiez le rôle du sous-compte.", 403);
  }
  if (reponse.status === 402) {
    throw new ErreurShipsGo('CREDITS', 'Crédits ShipsGo épuisés — rechargez le compte pour ouvrir de nouveaux suivis.', 402);
  }
  if (reponse.status === 429) {
    throw new ErreurShipsGo('TROP_DE_DEMANDES', 'Trop de demandes simultanées chez ShipsGo — réessayez dans un instant.', 429);
  }
  return reponse;
}

async function corps(reponse: Response): Promise<any> {
  const texte = await reponse.text();
  try {
    return texte ? JSON.parse(texte) : {};
  } catch {
    throw new ErreurShipsGo('HTTP', `Réponse ShipsGo illisible (HTTP ${reponse.status}).`, reponse.status);
  }
}

export type SuiviOuvert = {
  shipmentId: number;
  /** true quand le suivi existait déjà : aucun crédit n'a été prélevé. */
  deja: boolean;
  creditsRestants?: number;
};

/**
 * Ouvre le suivi d'un conteneur ou d'un Master BL. `referenceInterne` est notre
 * identifiant de dossier : ShipsGo le renvoie tel quel et s'en sert pour
 * reconnaître un doublon.
 */
export async function ouvrirSuivi(opts: {
  reference: string;
  referenceInterne: string;
  /** Code SCAC de la compagnie (MSCU, MAEU…) — facultatif, ShipsGo devine. */
  carrier?: string;
}): Promise<SuiviOuvert> {
  const estConteneur = typeReference(opts.reference) === 'conteneur';
  const charge: Record<string, unknown> = {
    reference: opts.referenceInterne,
    [estConteneur ? 'container_number' : 'booking_number']: opts.reference,
  };
  if (opts.carrier && /^(SG_)?[A-Z0-9]{4}$/.test(opts.carrier)) charge.carrier = opts.carrier;

  const reponse = await appeler('/ocean/shipments', { method: 'POST', body: JSON.stringify(charge) });
  const donnees = await corps(reponse);

  if (reponse.status === 409) {
    return { shipmentId: Number(donnees?.shipment?.id), deja: true, creditsRestants: creditsRestants(reponse) };
  }
  if (!reponse.ok || !donnees?.shipment?.id) {
    const detail = donnees?.message || donnees?.error || `HTTP ${reponse.status}`;
    throw new ErreurShipsGo(
      reponse.status === 400 || reponse.status === 422 ? 'REFERENCE' : 'HTTP',
      `ShipsGo refuse « ${opts.reference} » : ${detail}`,
      reponse.status,
    );
  }
  return { shipmentId: Number(donnees.shipment.id), deja: false, creditsRestants: creditsRestants(reponse) };
}

/** Relit un suivi déjà ouvert. Gratuit : aucun crédit n'est prélevé. */
export async function lireSuivi(shipmentId: number): Promise<any> {
  const reponse = await appeler(`/ocean/shipments/${shipmentId}`);
  if (reponse.status === 404) {
    throw new ErreurShipsGo('INTROUVABLE', `Suivi ${shipmentId} introuvable chez ShipsGo.`, 404);
  }
  const donnees = await corps(reponse);
  if (!reponse.ok || !donnees?.shipment) {
    throw new ErreurShipsGo('HTTP', `Lecture du suivi ${shipmentId} impossible (HTTP ${reponse.status}).`, reponse.status);
  }
  return donnees.shipment;
}

/**
 * Route du suivi en GeoJSON : ports, traversées, position du navire. Gratuit
 * comme toute lecture (cf. lib/suivi-carte.ts pour la mise en dessin).
 */
export async function lireGeojson(shipmentId: number): Promise<any> {
  const reponse = await appeler(`/ocean/shipments/${shipmentId}/geojson`);
  if (reponse.status === 404) {
    throw new ErreurShipsGo('INTROUVABLE', `Suivi ${shipmentId} introuvable chez ShipsGo.`, 404);
  }
  const donnees = await corps(reponse);
  if (!reponse.ok || !donnees?.geojson) {
    throw new ErreurShipsGo('HTTP', `Route du suivi ${shipmentId} indisponible (HTTP ${reponse.status}).`, reponse.status);
  }
  return donnees.geojson;
}

export type Abonne = { id: number; email: string };

/**
 * Inscrit une adresse aux notifications ShipsGo de ce conteneur. À partir de là,
 * **ShipsGo** écrit directement à cette personne à chaque étape : l'appeler
 * revient à envoyer du courrier en notre nom, jamais sans demande explicite.
 * Une adresse déjà inscrite renvoie 409, ce qu'on traite comme un succès.
 */
export async function ajouterAbonne(shipmentId: number, email: string): Promise<Abonne> {
  const reponse = await appeler(`/ocean/shipments/${shipmentId}/followers`, {
    method: 'POST',
    body: JSON.stringify({ follower: email }),
  });
  const donnees = await corps(reponse);
  if (reponse.status === 409) {
    return { id: Number(donnees?.follower?.id) || 0, email };
  }
  if (!reponse.ok || !donnees?.follower) {
    throw new ErreurShipsGo('HTTP', `ShipsGo refuse l'abonné « ${email} » : ${donnees?.message || `HTTP ${reponse.status}`}`, reponse.status);
  }
  return { id: Number(donnees.follower.id), email: donnees.follower.email || email };
}

/** Désinscrit une adresse : ShipsGo cesse de lui écrire pour ce conteneur. */
export async function retirerAbonne(shipmentId: number, abonneId: number): Promise<void> {
  const reponse = await appeler(`/ocean/shipments/${shipmentId}/followers/${abonneId}`, { method: 'DELETE' });
  if (!reponse.ok) {
    const donnees = await corps(reponse);
    throw new ErreurShipsGo('HTTP', `Désabonnement impossible : ${donnees?.message || `HTTP ${reponse.status}`}`, reponse.status);
  }
}

/** Le serveur est-il configuré pour parler à ShipsGo ? */
export function suiviConfigure(): boolean {
  return Boolean((process.env.SHIPSGO_API_TOKEN || '').trim());
}
