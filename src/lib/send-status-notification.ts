/**
 * Shared helper — send a status-change notification email to a client.
 * Called from any component that changes an article's status.
 */

import { collection, query, where, getDocs } from 'firebase/firestore';

interface NotifyParams {
  firestore: any;
  adminUid: string;
  clientName: string;
  articleName: string;
  oldStatus: string;
  newStatus: string;
  quantity?: number;
  unitOfMeasure?: string;
  specs?: string;
  color?: string;
  size?: string;
  estimatedProductionDelay?: string;
  imageUrl?: string;
  transitArrivalDate?: string;
  transitDuration?: string;
}

/**
 * Returns the email of the client or null if not found.
 */
async function resolveClientEmail(
  firestore: any,
  adminUid: string,
  clientName: string
): Promise<string | null> {
  const clientNameLower = clientName.trim().toLowerCase();
  if (!clientNameLower) return null;

  const clientAccessRef = collection(firestore, 'clientAccess');
  const q = query(clientAccessRef, where('adminUid', '==', adminUid));
  const snap = await getDocs(q);

  const matchDoc = snap.docs.find((d) => {
    const stored = (d.data().clientName || '').toLowerCase().trim();
    return (
      stored === clientNameLower ||
      stored.includes(clientNameLower) ||
      clientNameLower.includes(stored)
    );
  });

  if (!matchDoc) return null;
  const data = matchDoc.data();
  return (data.notificationEmail || '').trim() || data.email || null;
}

/**
 * Send notification and return { ok, email } or { ok: false, error }.
 */
export async function sendStatusNotification(params: NotifyParams): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  const {
    firestore,
    adminUid,
    clientName,
    articleName,
    oldStatus,
    newStatus,
    quantity,
    unitOfMeasure,
    specs,
    color,
    size,
    estimatedProductionDelay,
    imageUrl,
    transitArrivalDate,
    transitDuration,
  } = params;

  if (!clientName || oldStatus === newStatus) return { ok: false };

  try {
    const clientEmail = await resolveClientEmail(firestore, adminUid, clientName);
    if (!clientEmail) return { ok: false };

    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientEmail,
        clientName,
        articleName,
        oldStatus,
        newStatus,
        quantity,
        unitOfMeasure,
        specs,
        color,
        size,
        estimatedProductionDelay,
        imageUrl,
        transitArrivalDate,
        transitDuration,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      return { ok: true, email: clientEmail };
    }
    return { ok: false, error: data.error || 'Erreur inconnue.' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Erreur inconnue.' };
  }
}
