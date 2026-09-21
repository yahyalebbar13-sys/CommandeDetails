// ─── Authentification des webhooks ShipsGo ────────────────────────────────────
// Serveur uniquement. La route qui reçoit les webhooks est ouverte à tout
// Internet : sans cette vérification, n'importe qui pourrait déclarer qu'un
// conteneur est arrivé et déplacer les dates d'un dossier.
//
// ShipsGo signe chaque envoi : HMAC-SHA256 du corps brut avec la clé secrète du
// webhook, en hexadécimal, dans l'en-tête `X-Shipsgo-Webhook-Signature`.
// Vérifié par scripts/test-shipsgo-webhook.ts avec le couple d'exemple publié
// dans leur documentation.

import { createHmac, timingSafeEqual } from 'crypto';

export const ENTETE_SIGNATURE = 'x-shipsgo-webhook-signature';

/** Signature attendue pour ce corps brut — le corps tel qu'il est arrivé, non reformaté. */
export function signerCharge(corpsBrut: string, secret: string): string {
  return createHmac('sha256', secret).update(corpsBrut, 'utf8').digest('hex');
}

/**
 * Comparaison à temps constant : une comparaison ordinaire s'arrête au premier
 * caractère différent et laisse deviner la signature attendue, octet par octet.
 */
export function signatureValide(corpsBrut: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const attendue = Buffer.from(signerCharge(corpsBrut, secret), 'utf8');
  const recue = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  if (attendue.length !== recue.length) return false;
  return timingSafeEqual(attendue, recue);
}

/** Préfixe de la référence envoyée à ShipsGo — cf. suivi-sync.ts. */
const PREFIXE = 'LEBTEX-';

/** Retrouve l'identifiant du dossier dans la référence renvoyée par ShipsGo. */
export function factureIdDepuisReference(reference?: string | null): string | undefined {
  const r = (reference || '').trim();
  if (!r.startsWith(PREFIXE)) return undefined;
  const id = r.slice(PREFIXE.length);
  // Les essais en ligne de commande portent le même préfixe : ils ne visent aucun dossier.
  return id && !id.startsWith('ESSAI-') ? id : undefined;
}

/** Événements auxquels on réagit ; les autres sont acquittés sans rien changer. */
export const EVENEMENTS_SUIVIS = new Set([
  'OCEAN.SHIPMENTS.SHIPMENT_CREATED',
  'OCEAN.SHIPMENTS.SHIPMENT_UPDATED',
]);
