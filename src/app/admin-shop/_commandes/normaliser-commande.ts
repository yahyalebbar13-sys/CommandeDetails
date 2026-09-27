// ─── Une commande lue dans Firestore, remise d'aplomb ────────────────────────
// N'importe qui peut créer une commande (paiement à la livraison, sans compte) :
// le document peut avoir n'importe quelle forme. Un nom qui serait un objet, des
// articles qui seraient une chaîne… et tout l'écran tomberait à chaque ouverture.
// Chaque commande passe donc ici, au seul point d'entrée (l'écoute de la coque),
// avant d'arriver dans un écran.
//
// On ne garde jamais `noteInterne`, `motifAnnulation` ni l'auteur des lignes de
// suivi : dans ce document, ils peuvent avoir été écrits par le client lui-même.
// Ce que l'équipe écrit vit dans shop_orders_interne (voir actions-commandes.ts).
//
// Pur (ni Firebase ni React) : testé par scripts/test-ecran-commandes-boutique.ts.

import { ORDER_STATUS_LABELS, type CartItem, type OrderStatus, type ShopOrder, type TrackingNote } from '@/lib/shop-types';

const STATUTS = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Texte affichable : une chaîne, ou un nombre écrit ; jamais « [object Object] ». */
function texte(v: unknown, max = 2000): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

const texteOuAbsent = (v: unknown, max?: number): string | undefined => texte(v, max) || undefined;

function nombre(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function statutValide(v: unknown): OrderStatus {
  return STATUTS.includes(v as OrderStatus) ? (v as OrderStatus) : 'pending';
}

/**
 * Horodatage utilisable partout (toDate() compris, comme un Timestamp Firestore).
 * null reste null : c'est l'horodatage serveur pas encore revenu d'une commande
 * tout juste écrite. Une valeur illisible devient absente.
 */
function horodatage(v: unknown): any {
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (estObjet(v) && typeof v.toDate === 'function') {
    try {
      const d = (v.toDate as () => unknown)();
      if (d instanceof Date && !isNaN(d.getTime())) return v;
    } catch { /* illisible */ }
    return undefined;
  }
  let ms = NaN;
  if (estObjet(v) && typeof (v.seconds ?? v._seconds) === 'number') ms = Number(v.seconds ?? v._seconds) * 1000;
  else if (typeof v === 'number' || typeof v === 'string') ms = new Date(v).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return { seconds: Math.floor(ms / 1000), nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms };
}

function variante(v: unknown): CartItem['variant'] | undefined {
  if (!estObjet(v)) return undefined;
  const champs = ['color', 'colorAr', 'colorHex', 'model', 'modelAr', 'size', 'sizeAr', 'variantId'] as const;
  const propre: NonNullable<CartItem['variant']> = {};
  for (const c of champs) {
    const s = texte(v[c], 200);
    if (s) propre[c] = s;
  }
  return Object.keys(propre).length ? propre : undefined;
}

function article(v: unknown): CartItem | null {
  if (!estObjet(v)) return null;
  const ligne: CartItem & { unitPrice?: number } = {
    productId: texte(v.productId, 200),
    productName: texte(v.productName, 300) || 'Article',
    productNameAr: texteOuAbsent(v.productNameAr, 300),
    productImage: texte(v.productImage, 2000),
    price: nombre(v.price),
    originalPrice: typeof v.originalPrice === 'number' ? nombre(v.originalPrice) : undefined,
    wholesalePrice: typeof v.wholesalePrice === 'number' ? nombre(v.wholesalePrice) : undefined,
    minOrderQty: typeof v.minOrderQty === 'number' ? nombre(v.minOrderQty) : undefined,
    quantity: nombre(v.quantity),
    variant: variante(v.variant),
    maxStock: nombre(v.maxStock),
  };
  // Le prix réellement facturé n'existe que sur les commandes récentes : absent, on ne l'invente pas.
  if (typeof v.unitPrice === 'number' && Number.isFinite(v.unitPrice)) ligne.unitPrice = v.unitPrice;
  return ligne;
}

function ligneDeSuivi(v: unknown): TrackingNote | null {
  if (!estObjet(v) || !STATUTS.includes(v.status as OrderStatus)) return null;
  // Pas d'`auteur` : dans ce document, il peut venir du client.
  return { status: v.status as OrderStatus, message: texte(v.message, 500), timestamp: horodatage(v.timestamp) ?? null };
}

/** La commande telle que les écrans peuvent l'afficher sans risque de planter. */
export function normaliserCommande(id: string, brut: unknown): ShopOrder {
  const d = estObjet(brut) ? brut : {};
  const a = estObjet(d.shippingAddress) ? d.shippingAddress : {};
  const discount = nombre(d.discount);
  return {
    id,
    orderNumber: texte(d.orderNumber, 60).trim() || `#${id.slice(0, 8)}`,
    customerId: texteOuAbsent(d.customerId, 200),
    customerEmail: texteOuAbsent(d.customerEmail, 300),
    customerName: texte(d.customerName, 200),
    customerPhone: texteOuAbsent(d.customerPhone, 60),
    status: statutValide(d.status),
    items: (Array.isArray(d.items) ? d.items : []).map(article).filter((x): x is CartItem => x !== null),
    subtotal: nombre(d.subtotal),
    deliveryFee: nombre(d.deliveryFee),
    ...(discount ? { discount } : {}),
    couponCode: texteOuAbsent(d.couponCode, 60),
    total: nombre(d.total),
    shippingAddress: {
      fullName: texte(a.fullName, 200),
      phone: texte(a.phone, 60),
      phone2: texteOuAbsent(a.phone2, 60),
      address: texte(a.address, 1000),
      city: texte(a.city, 120),
      region: texteOuAbsent(a.region, 120),
      postalCode: texteOuAbsent(a.postalCode, 20),
    },
    paymentMethod: 'cod',
    notes: texteOuAbsent(d.notes, 2000),
    trackingNotes: (Array.isArray(d.trackingNotes) ? d.trackingNotes : [])
      .map(ligneDeSuivi)
      .filter((x): x is TrackingNote => x !== null),
    whatsappSent: d.whatsappSent === true,
    createdAt: horodatage(d.createdAt),
    updatedAt: horodatage(d.updatedAt),
  };
}
