import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { AuditLogEntry } from './types';
import { cleanUndefined } from './utils';

/**
 * Écrit une ligne dans le journal d'audit.
 *
 * Deux règles, apprises le jour où une vente au comptoir a été refusée à l'écran :
 *
 * 1. **Rien d'indéfini ne part en base.** Une vente sans client n'a pas de `clientId`, un
 *    mouvement qui n'est pas un transfert n'a pas de `toStoreId` : ces champs valent `undefined`
 *    et Firestore refuse le document entier. Tout est donc nettoyé avant l'écriture.
 * 2. **Le journal ne fait jamais échouer ce qu'il journalise.** `addDoc()` valide ses données de
 *    façon SYNCHRONE : sur une donnée invalide, il lève avant même de partir sur le réseau, et le
 *    `.catch` posé sur sa promesse ne sert alors à rien. L'exception remontait donc jusqu'à
 *    l'appelant, qui affichait « Impossible de valider la vente » — alors que la vente, elle,
 *    était déjà enregistrée. Le magasin croyait avoir raté sa vente et la ressaisissait.
 *
 * Une ligne d'audit perdue est un incident mineur. Une vente refusée à tort ne l'est pas.
 */
export function logAudit(
  firestore: Firestore,
  adminUid: string,
  entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'timestamp'>
) {
  try {
    const data = { ...preparerEntreeAudit(entry), createdAt: serverTimestamp() };
    // Sans attente : le journal suit l'opération, il ne la précède pas.
    addDoc(collection(firestore, 'users', adminUid, 'auditLog'), data).catch(err => {
      console.error('[AuditLog] écriture refusée :', err);
    });
  } catch (err) {
    // Y compris ici : une erreur de validation levée sur-le-champ ne doit pas remonter.
    console.error('[AuditLog] entrée ignorée :', err);
  }
}

/**
 * L'entrée telle qu'elle partira en base, horodatée et débarrassée de ses `undefined`.
 * Séparée de l'écriture pour être vérifiable sans Firestore.
 */
export function preparerEntreeAudit(
  entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'timestamp'>,
): Record<string, unknown> {
  return cleanUndefined({
    ...entry,
    timestamp: new Date().toISOString(),
  }) as Record<string, unknown>;
}
