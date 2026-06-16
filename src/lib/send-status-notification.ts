/**
 * Shared helper — send a status-change notification to a client.
 * Supports Email, WhatsApp, or both based on per-client preference.
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
 * Returns { email, whatsappPhone, channel } for the client.
 * channel: 'email' | 'whatsapp' | 'both'
 */
async function resolveClientContact(
  firestore: any,
  adminUid: string,
  clientName: string
): Promise<{
  email: string | null;
  whatsappPhone: string | null;
  channel: 'email' | 'whatsapp' | 'both';
}> {
  const clientNameLower = clientName.trim().toLowerCase();
  if (!clientNameLower) return { email: null, whatsappPhone: null, channel: 'email' };

  // ── 1. Check clientAccess (portal accounts) ─────────────────────────────
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

  if (matchDoc) {
    const data = matchDoc.data();
    const email = (data.notificationEmail || '').trim() || (data.email || '').trim();
    const whatsappPhone = (data.whatsappPhone || '').trim() || null;
    const channel = (data.notifyChannel || 'email') as 'email' | 'whatsapp' | 'both';
    return { email: email || null, whatsappPhone, channel };
  }

  // ── 2. Fallback: clientEmails sub-collection ──────────────────────────────
  const clientEmailsRef = collection(firestore, 'users', adminUid, 'clientEmails');
  const q2 = query(clientEmailsRef, where('clientName', '==', clientName.trim()));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) {
    const d = snap2.docs[0].data();
    const email = (d.email || '').trim();
    const whatsappPhone = (d.whatsappPhone || '').trim() || null;
    const channel = (d.notifyChannel || 'email') as 'email' | 'whatsapp' | 'both';
    return { email: email || null, whatsappPhone, channel };
  }

  return { email: null, whatsappPhone: null, channel: 'email' };
}

/** Build a WhatsApp message for a status change. */
function buildWhatsAppMessage(params: NotifyParams, newStatusLabel: string): string {
  const lines: string[] = [
    `📦 *LEBTEX — Mise à jour de commande*`,
    ``,
    `Bonjour ${params.clientName},`,
    ``,
    `Votre article *${params.articleName}* vient de passer au statut :`,
    `➡️ *${newStatusLabel}*`,
  ];
  if (params.quantity) lines.push(`Quantité : ${params.quantity} ${params.unitOfMeasure || 'pcs'}`);
  if (params.color) lines.push(`Coloris : ${params.color}`);
  if (params.size) lines.push(`Taille : ${params.size}`);
  if (params.estimatedProductionDelay) lines.push(`Délai estimé : ${params.estimatedProductionDelay}`);
  if (params.transitArrivalDate) lines.push(`Arrivée prévue : ${params.transitArrivalDate}`);
  lines.push(``, `Cordialement,`, `L'équipe LEBTEX`);
  return lines.join('\n');
}

const STATUS_LABELS: Record<string, string> = {
  PI: '🟡 En production',
  SHIPPED: '🚢 Expédié',
  TRANSIT: '🚢 En transit',
  CUSTOMS: '🏛️ En douane',
  DELIVERED: '✅ Livré',
  STOCK: '📦 En stock',
};

/**
 * Send notification and return { ok, email } or { ok: false, error }.
 */
export async function sendStatusNotification(params: NotifyParams & { channel?: 'email' | 'whatsapp' | 'both' }): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  const {
    firestore, adminUid, clientName, articleName,
    oldStatus, newStatus, quantity, unitOfMeasure,
    specs, color, size, estimatedProductionDelay,
    imageUrl, transitArrivalDate, transitDuration,
    channel: explicitChannel,
  } = params;

  if (!clientName || oldStatus === newStatus) return { ok: false };

  try {
    const contact = await resolveClientContact(firestore, adminUid, clientName);
    const { email, whatsappPhone } = contact;
    // Priority: 1. explicit call-site override, 2. global localStorage setting, 3. per-client Firestore setting
    const globalChannel = (typeof window !== 'undefined' ? localStorage.getItem('notifyChannel') : null) as 'email' | 'whatsapp' | 'both' | null;
    const channel = explicitChannel || globalChannel || contact.channel;
    const newStatusLabel = STATUS_LABELS[newStatus] || newStatus;

    let whatsappSent = false;
    let emailSent = false;

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    if ((channel === 'whatsapp' || channel === 'both') && whatsappPhone) {
      const msg = buildWhatsAppMessage(params, newStatusLabel);
      const phone = whatsappPhone.replace(/\D/g, '');
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      if (typeof window !== 'undefined') window.open(url, '_blank');
      whatsappSent = true;
    }

    // ── Email ─────────────────────────────────────────────────────────────────
    if ((channel === 'email' || channel === 'both') && email) {
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail: email, clientName, articleName,
          oldStatus, newStatus, quantity, unitOfMeasure,
          specs, color, size, estimatedProductionDelay,
          imageUrl, transitArrivalDate, transitDuration,
        }),
      });
      if (res.ok) emailSent = true;
    }

    if (whatsappSent || emailSent) return { ok: true, email: email || undefined };
    return { ok: false, error: 'Aucun canal configuré (email ou numéro WhatsApp manquant).' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Erreur inconnue.' };
  }
}
