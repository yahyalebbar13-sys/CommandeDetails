import { MOROCCAN_CITIES } from './shop-types';
import type { ShopProduct } from './shop-types';
import {
  SEUIL_OFFERTE_AUTRES,
  SEUIL_OFFERTE_CASABLANCA,
  delaiColis,
  estCasablanca,
  fraisColis,
  livraisonOfferte,
} from './livraison-boutique';
import { translations, type Language } from './translations';

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

// Prix affiché sur les cartes produit. Un produit sans prix de base mais avec des
// variantes chiffrées affiche la moins chère (« Dès X ») plutôt que « Sur demande ».
export function getProductDisplayPrice(product: Pick<ShopProduct, 'price' | 'variants'>): { amount: number; isFrom: boolean } {
  if (typeof product.price === 'number' && product.price > 0) return { amount: product.price, isFrom: false };
  const variantPrices = (product.variants || []).map(v => getVariantPrice(0, v)).filter(p => p > 0);
  if (variantPrices.length === 0) return { amount: 0, isFrom: false };
  return { amount: Math.min(...variantPrices), isFrom: new Set(variantPrices).size > 1 };
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
// Tout se calcule dans livraison-boutique.ts (grille Sendit 20 / 35 / 45 DH,
// livraison offerte dès 300 DH à Casablanca et 650 DH ailleurs).

export function isCasablanca(city: string): boolean {
  return estCasablanca(city);
}

/** Frais d'un colis Sendit pour la ville, avant livraison offerte. */
export function getDeliveryFee(city: string): number {
  return fraisColis(city);
}

/** Délai annoncé pour la ville (« 24-48h », « 1-3 jours ouvrés »…). */
export function getDeliveryDays(city: string): string {
  return delaiColis(city);
}

// Seuils de livraison offerte : Casablanca d'abord, puis le reste du Maroc
export const FREE_DELIVERY_THRESHOLD = SEUIL_OFFERTE_AUTRES; // MAD, toutes villes
export const CASABLANCA_FREE_DELIVERY_THRESHOLD = SEUIL_OFFERTE_CASABLANCA; // MAD

// Sans ville connue (panier), seul le seuil national est garanti
export function isEligibleForFreeDelivery(subtotal: number, city?: string): boolean {
  return livraisonOfferte(subtotal, city);
}

// Palier de livraison gratuite atteint et reste à acheter pour le suivant (ville inconnue)
export function getFreeDeliveryProgress(subtotal: number) {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) {
    return { stage: 'everywhere' as const, remaining: 0, progress: 100 };
  }
  const target = subtotal >= CASABLANCA_FREE_DELIVERY_THRESHOLD ? FREE_DELIVERY_THRESHOLD : CASABLANCA_FREE_DELIVERY_THRESHOLD;
  return {
    stage: subtotal >= CASABLANCA_FREE_DELIVERY_THRESHOLD ? ('casablanca' as const) : ('none' as const),
    remaining: target - subtotal,
    progress: Math.min((subtotal / target) * 100, 100),
  };
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

// Calculate discount percentage
export function getDiscountPercent(price: number, comparePrice: number): number {
  if (!comparePrice || !price || comparePrice <= price) return 0;
  return Math.round(((comparePrice - price) / comparePrice) * 100);
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
    msg += `🚚 Livraison : ${deliveryFee === 0 ? 'GRATUITE ✅' : formatPrice(deliveryFee)}\n`;
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

// Check if product has active promo
export function hasActivePromo(comparePrice?: number, price?: number): boolean {
  return !!(comparePrice && price && comparePrice > price);
}
