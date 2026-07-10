import { DELIVERY_ZONES, MOROCCAN_CITIES } from './shop-types';
import type { DeliveryZone } from './shop-types';

// Format price in MAD
export function formatPrice(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${safe.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
}

// Format price compact
export function formatPriceShort(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${safe.toFixed(2)} MAD`;
}

// Calculate delivery fee based on city
export function getDeliveryFee(city: string): number {
  const cityLower = city.toLowerCase().trim();
  if (cityLower.includes('casablanca') || cityLower.includes('casa')) return DELIVERY_ZONES.casablanca.fee;
  if (cityLower.includes('rabat') || cityLower.includes('salé') || cityLower.includes('sale')) return DELIVERY_ZONES.rabat.fee;
  if (cityLower.includes('marrakech')) return DELIVERY_ZONES.marrakech.fee;
  if (cityLower.includes('fès') || cityLower.includes('fes') || cityLower.includes('meknès') || cityLower.includes('meknes')) return DELIVERY_ZONES.fes.fee;
  if (cityLower.includes('tanger')) return DELIVERY_ZONES.tanger.fee;
  if (cityLower.includes('agadir')) return DELIVERY_ZONES.agadir.fee;
  if (cityLower.includes('oujda')) return DELIVERY_ZONES.oujda.fee;
  return DELIVERY_ZONES.other.fee;
}

// Get delivery days estimate
export function getDeliveryDays(city: string): string {
  const cityLower = city.toLowerCase().trim();
  if (cityLower.includes('casablanca') || cityLower.includes('casa')) return DELIVERY_ZONES.casablanca.days;
  if (cityLower.includes('rabat') || cityLower.includes('salé')) return DELIVERY_ZONES.rabat.days;
  if (cityLower.includes('marrakech')) return DELIVERY_ZONES.marrakech.days;
  if (cityLower.includes('fès') || cityLower.includes('fes') || cityLower.includes('meknès')) return DELIVERY_ZONES.fes.days;
  if (cityLower.includes('tanger')) return DELIVERY_ZONES.tanger.days;
  if (cityLower.includes('agadir')) return DELIVERY_ZONES.agadir.days;
  if (cityLower.includes('oujda')) return DELIVERY_ZONES.oujda.days;
  return DELIVERY_ZONES.other.days;
}

// Free delivery threshold
export const FREE_DELIVERY_THRESHOLD = 500; // MAD

export function isEligibleForFreeDelivery(subtotal: number): boolean {
  return subtotal >= FREE_DELIVERY_THRESHOLD;
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
export function buildWhatsAppLink(orderNumber: string, total: number, customerName: string): string {
  const phone = '212760998347';
  const message = encodeURIComponent(
    `Bonjour LEBTEX 👋\n\nJe souhaite confirmer ma commande :\n📦 N° ${orderNumber}\n👤 ${customerName}\n💰 Total : ${formatPrice(total)}\n\nMerci !`
  );
  return `https://wa.me/${phone}?text=${message}`;
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
