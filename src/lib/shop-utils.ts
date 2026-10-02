import { MOROCCAN_CITIES } from './shop-types';
import type { ShopProduct } from './shop-types';
import { delaiColis, estCasablanca, fraisColis } from './livraison-boutique';
import { translations, type Language } from './translations';
import { prixProduitAffiche } from './shop-variantes';

// Format price in MAD
export function formatPrice(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${safe.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
}

// Prix formaté, ou « Sur demande » quand aucun prix n'est renseigné (0)
export function formatPriceOrOnRequest(amount: number, language: Language): string {
  return amount > 0 ? formatPrice(amount) : translations.price_on_request[language];
}

// « 12 MAD » ou « 12 MAD – 18 MAD » quand les variantes n'ont pas toutes le même prix
export function formatPriceRange(min: number, max: number, language: Language): string {
  if (min <= 0) return translations.price_on_request[language];
  return max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}

// Prix d'une variante : le sien s'il est renseigné, sinon celui du produit
export function getVariantPrice(basePrice: number, variant?: { price?: number } | null): number {
  return typeof variant?.price === 'number' && variant.price > 0 ? variant.price : basePrice;
}

// Prix affiché sur les cartes produit : celui qui sera facturé. Quand les variantes
// achetables n'ont pas toutes le même prix, la moins chère avec « À partir de ».
export function getProductDisplayPrice(product: Pick<ShopProduct, 'price' | 'variants'>): { amount: number; isFrom: boolean } {
  const { montant, aPartirDe } = prixProduitAffiche(product);
  return { amount: montant, isFrom: aPartirDe };
}

// ─── Plus aucun prix barré (décision du patron, 02/10/2026) ───────────────────
// Ni ancien prix barré, ni « -X % », ni badge promo, nulle part sur la boutique.
// L'ancien prix saisi dans l'admin (comparePrice) est ignoré à l'affichage ; le prix
// facturé (price / variantes) ne change pas. Plus aucun écran n'appelle ces deux fonctions ;
// elles restent, et répondent toujours « pas de promotion », pour un écran qui les importerait encore.

export function getProductPromo(
  _product: Pick<ShopProduct, 'price' | 'variants' | 'comparePrice'>,
): { active: boolean; percent: number; saving: number } {
  return { active: false, percent: 0, saving: 0 };
}

export function hasActivePromo(_comparePrice?: number, _price?: number): boolean {
  return false;
}

// ─── Badge « Nouveau » (02/10/2026) ───────────────────────────────────────────
// Il était sur la moitié du catalogue. Il ne reste que sur un produit coché « Nouveau »
// dans l'admin ET ajouté il y a moins de 60 jours ; sans date d'ajout fiable, pas de badge.

/** Durée du badge « Nouveau » après l'ajout du produit au catalogue. */
export const DUREE_NOUVEAUTE_JOURS = 60;
const UN_JOUR_MS = 24 * 60 * 60 * 1000;
// Avant cette date, une « date d'ajout » n'est pas crédible (identifiant mal formé…)
const PREMIERE_DATE_CREDIBLE = Date.UTC(2020, 0, 1);

/** Date d'ajout d'un produit en millisecondes (createdAt, sinon l'horodatage de l'identifiant custom_<ms>_…), 0 si inconnue. */
export function dateAjoutProduit(p: Pick<ShopProduct, 'id' | 'createdAt'>): number {
  const c = p.createdAt as { seconds?: number; toMillis?: () => number } | number | string | undefined;
  let date = 0;
  if (typeof c === 'number') date = c;
  else if (typeof c === 'string') date = Date.parse(c) || 0;
  else if (c && typeof c.toMillis === 'function') date = c.toMillis();
  else if (c && typeof c.seconds === 'number') date = c.seconds * 1000;
  if (!date) {
    const m = /^custom_(\d{13})_/.exec(p.id);
    date = m ? Number(m[1]) : 0;
  }
  return date >= PREMIERE_DATE_CREDIBLE ? date : 0;
}

/** Badge « Nouveau » : coché dans l'admin et ajouté depuis moins de 60 jours (date future = pas fiable). */
export function estNouveau(p: Pick<ShopProduct, 'id' | 'isNew' | 'createdAt'>, maintenant: number): boolean {
  if (!p.isNew) return false;
  const ajout = dateAjoutProduit(p);
  if (!ajout || ajout > maintenant + UN_JOUR_MS) return false;
  return maintenant - ajout <= DUREE_NOUVEAUTE_JOURS * UN_JOUR_MS;
}

export function formatProductPrice(product: Pick<ShopProduct, 'price' | 'variants'>, language: Language): string {
  const { amount, isFrom } = getProductDisplayPrice(product);
  const price = formatPriceOrOnRequest(amount, language);
  return isFrom ? `${translations.price_from[language]} ${price}` : price;
}

// Format price compact
export function formatPriceShort(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${safe.toFixed(2)} MAD`;
}

// ─── Livraison : anciens noms, gardés pour les écrans qui les importent ────────
// Tout se calcule dans livraison-boutique.ts (grille Sendit 20 / 35 / 45 DH, jamais
// offerte depuis le 30/09/2026 ; seul le retrait au magasin est gratuit).

export function isCasablanca(city: string): boolean {
  return estCasablanca(city);
}

/** Frais d'un colis Sendit pour la ville. */
export function getDeliveryFee(city: string): number {
  return fraisColis(city);
}

/** Délai annoncé pour la ville (« 24-48h », « 1-3 jours ouvrés »…). */
export function getDeliveryDays(city: string): string {
  return delaiColis(city);
}

// Generate order number
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LBT-${timestamp}-${random}`;
}

// Slugify product name
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// WhatsApp link builder
export function buildWhatsAppLink(
  orderNumber: string,
  total: number,
  customerName: string,
  items?: Array<{ productName: string; quantity: number; price: number; variant?: { color?: string; size?: string } }>,
  shippingAddress?: { address?: string; city?: string; phone?: string },
  deliveryFee?: number,
  subtotal?: number,
): string {
  const phone = '212760998347';

  let msg = `Bonjour LEBTEX 👋\n\nJe souhaite confirmer ma commande :\n\n`;
  msg += `📦 *N° ${orderNumber}*\n`;
  msg += `👤 ${customerName}\n`;

  // List each product
  if (items && items.length > 0) {
    msg += `\n🛒 *Détail de la commande :*\n`;
    items.forEach((item, i) => {
      const variant = [item.variant?.color, item.variant?.size].filter(Boolean).join(' / ');
      msg += `${i + 1}. ${item.productName}`;
      if (variant) msg += ` (${variant})`;
      msg += ` × ${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
    });
  }

  // Totals
  msg += `\n`;
  if (subtotal !== undefined) {
    msg += `📋 Sous-total : ${formatPrice(subtotal)}\n`;
  }
  if (deliveryFee !== undefined) {
    msg += `🚚 Livraison : ${deliveryFee > 0 ? formatPrice(deliveryFee) : 'à confirmer'}\n`;
  }
  msg += `💰 *Total à payer : ${formatPrice(total)}*\n`;

  // Shipping address
  if (shippingAddress) {
    msg += `\n📍 *Adresse :* ${shippingAddress.address || ''}, ${shippingAddress.city || ''}\n`;
    if (shippingAddress.phone) msg += `📞 ${shippingAddress.phone}\n`;
  }

  msg += `\n💵 Paiement à la livraison\nMerci ! 🙏`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

// WhatsApp contact link
export function getWhatsAppContact(message?: string): string {
  const phone = '212760998347';
  if (message) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${phone}`;
}

// Star rating display
export function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// Moroccan cities for select
export { MOROCCAN_CITIES };

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}
