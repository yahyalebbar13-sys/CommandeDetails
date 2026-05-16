/**
 * Status utility — computes the EFFECTIVE (displayed) status from stored data.
 *
 * Firestore always stores status = 'SHIPPED' for all container-linked articles.
 * The effective status derives from dates:
 *
 *  stockEntryDate reached  →  STOCK
 *  arrivalDate reached     →  CUSTOMS
 *  arrivalDate in future   →  TRANSIT
 *  no dates set            →  SHIPPED (raw)
 *
 * Manual statuses (TO_ORDER, PI, DELIVERED) are returned as-is.
 */

export type EffectiveStatus =
  | 'TO_ORDER'
  | 'PI'
  | 'SHIPPED'
  | 'TRANSIT'
  | 'CUSTOMS'
  | 'STOCK'
  | 'DELIVERED';

export interface StatusInfo {
  status: EffectiveStatus;
  label: string;
  emoji: string;
  color: string;        // hex
  bgClass: string;      // tailwind bg
  textClass: string;    // tailwind text
  borderClass: string;  // tailwind border
}

const STATUS_MAP: Record<EffectiveStatus, Omit<StatusInfo, 'status'>> = {
  TO_ORDER:  { label: 'À Commander',       emoji: '📋', color: '#6B7280', bgClass: 'bg-stone-100',   textClass: 'text-stone-600',   borderClass: 'border-stone-300' },
  PI:        { label: 'En Production',     emoji: '🏭', color: '#F59E0B', bgClass: 'bg-amber-100',   textClass: 'text-amber-700',   borderClass: 'border-amber-300' },
  // SHIPPED and TRANSIT share the same display (boat transport, same stage)
  TRANSIT:   { label: 'En Transit',        emoji: '🚢', color: '#3B82F6', bgClass: 'bg-blue-100',    textClass: 'text-blue-700',    borderClass: 'border-blue-300'  },
  SHIPPED:   { label: 'En Transit',        emoji: '🚢', color: '#3B82F6', bgClass: 'bg-blue-100',    textClass: 'text-blue-700',    borderClass: 'border-blue-300'  },
  CUSTOMS:   { label: 'En Dédouanement',   emoji: '🛃', color: '#8B5CF6', bgClass: 'bg-violet-100',  textClass: 'text-violet-700',  borderClass: 'border-violet-300'},
  STOCK:     { label: 'En Stock',          emoji: '✅', color: '#10B981', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700', borderClass: 'border-emerald-300'},
  DELIVERED: { label: 'Livré au Client',   emoji: '📦', color: '#059669', bgClass: 'bg-green-100',   textClass: 'text-green-700',   borderClass: 'border-green-300' },
};

/**
 * Computes the effective/displayed status from an article's stored status + dates.
 * Use this everywhere you display a status badge or filter by status.
 */
export function computeEffectiveStatus(article: {
  status: string;
  arrivalDate?: string | null;
  stockEntryDate?: string | null;
}): EffectiveStatus {
  const { status, arrivalDate, stockEntryDate } = article;

  // Non-SHIPPED statuses are always manual — return as-is
  if (status !== 'SHIPPED') return (status as EffectiveStatus) || 'TO_ORDER';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Stock entry date reached → STOCK
  if (stockEntryDate) {
    const stockDate = new Date(stockEntryDate);
    stockDate.setHours(0, 0, 0, 0);
    if (today >= stockDate) return 'STOCK';
  }

  // 2. Arrival date reached → CUSTOMS
  if (arrivalDate) {
    const arrival = new Date(arrivalDate);
    arrival.setHours(0, 0, 0, 0);
    if (today >= arrival) return 'CUSTOMS';
    // 3. Arrival date in future → TRANSIT
    return 'TRANSIT';
  }

  // 4. SHIPPED with no dates (rare)
  return 'SHIPPED';
}

/**
 * Returns the full StatusInfo object for display (label, emoji, colors).
 */
export function getStatusInfo(article: {
  status: string;
  arrivalDate?: string | null;
  stockEntryDate?: string | null;
}): StatusInfo {
  const effective = computeEffectiveStatus(article);
  return { status: effective, ...STATUS_MAP[effective] };
}

/**
 * Returns just the display label for a given article.
 */
export function getStatusLabel(article: {
  status: string;
  arrivalDate?: string | null;
  stockEntryDate?: string | null;
}): string {
  return STATUS_MAP[computeEffectiveStatus(article)]?.label ?? article.status;
}

/**
 * Returns the effective status that should be used in the notification email.
 * Same logic as computeEffectiveStatus but returns the email-friendly status key.
 */
export function computeNotificationStatus(article: {
  status: string;
  arrivalDate?: string | null;
  stockEntryDate?: string | null;
}): string {
  const effective = computeEffectiveStatus(article);
  // Email API uses 'TRANSIT' as a separate key from 'SHIPPED'
  return effective;
}
