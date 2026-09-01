import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { AuditAction, AuditLogEntry } from './types';

/**
 * Logs an action to the audit trail.
 * Fire-and-forget: does not block the calling operation.
 */
export function logAudit(
  firestore: Firestore,
  adminUid: string,
  entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'timestamp'>
) {
  const data = {
    ...entry,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
  // Fire-and-forget: we don't await this
  addDoc(collection(firestore, 'users', adminUid, 'auditLog'), data).catch(err => {
    console.error('[AuditLog] Failed to write audit entry:', err);
  });
}
