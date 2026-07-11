// ─── Shop E-Commerce Types ────────────────────────────────────────────────────

export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
  nameAr?: string;
  description?: string;
  icon?: string;
  image?: string;
  productCount?: number;
  color?: string;
  priority?: number;
  parentSlug?: string;
}

export interface ProductVariant {
  id: string;
  color?: string;
  colorAr?: string;
  colorHex?: string;
  image?: string;
  size?: string;
  sizeAr?: string;
  sku?: string;
  stock: number;
  price?: number; // Override price for this variant
}

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  nameAr?: string;
  shortDescription?: string;
  shortDescriptionAr?: string;
  description: string;
  descriptionAr?: string;
  categorySlug: string;
  categoryName?: string;
  categoryNameAr?: string;
  images: string[];
  price: number; // MAD
  comparePrice?: number; // Prix barré
  sku?: string;
  inStock: boolean;
  stockQty: number;
  variants: ProductVariant[];
  tags: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  isPromo?: boolean;
  rating?: number;
  reviewCount?: number;
  specifications?: Record<string, string>;
  // ── Champs fiche produit ──
  material?: string;       // Matériau
  materialAr?: string;
  specification?: string;  // Spécification
  specificationAr?: string;
  weight?: number;         // Poids (grammes)
  width?: string;          // Largeur
  packaging?: string;      // Emballage
  packagingAr?: string;
  minOrderQty?: number;
  wholesalePrice?: number;
  
  // ── Détails Hyper Pro (Informations Complémentaires) ──
  applications?: string;
  avantages?: string;
  conseilsEntretien?: string;
  informationCommerciale?: string;
  motsCles?: string;
  
  // ── Détails Hyper Pro (Caractéristiques Techniques) ──
  typeProduit?: string;
  matiereMailles?: string;
  compositionRuban?: string;
  couleur?: string;
  largeurMaille?: string;
  longueur?: string;
  type?: string;
  design?: string;
  securite?: string;
  resistance?: string;
  compatibleAvec?: string;
  paysFabrication?: string;

  createdAt?: any;
  updatedAt?: any;
}

export interface ShopReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  comment: string;
  verified: boolean;
  createdAt: any;
}

export interface CartItem {
  productId: string;
  productName: string;
  productNameAr?: string;
  productImage: string;
  price: number;
  originalPrice?: number;
  wholesalePrice?: number;
  minOrderQty?: number;
  quantity: number;
  variant?: {
    color?: string;
    colorAr?: string;
    size?: string;
    sizeAr?: string;
    variantId?: string;
  };
  maxStock: number;
}

export type OrderStatus =
  | 'pending'       // En attente de confirmation
  | 'confirmed'     // Confirmé
  | 'processing'    // En préparation
  | 'shipped'       // Expédié
  | 'out_for_delivery' // En cours de livraison
  | 'delivered'     // Livré
  | 'cancelled'     // Annulé
  | 'returned';     // Retourné

export interface ShippingAddress {
  fullName: string;
  phone: string;
  phone2?: string;
  address: string;
  city: string;
  region?: string;
  postalCode?: string;
}

export interface ShopOrder {
  id?: string;
  orderNumber: string;
  customerId?: string; // Firebase UID (null for guest)
  customerEmail?: string;
  customerName: string;
  status: OrderStatus;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  couponCode?: string;
  total: number;
  shippingAddress: ShippingAddress;
  paymentMethod: 'cod'; // Cash on delivery
  notes?: string;
  trackingNotes?: TrackingNote[];
  whatsappSent?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface TrackingNote {
  status: OrderStatus;
  message: string;
  timestamp: any;
}

export interface ShopCoupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrder?: number;
  maxUses?: number;
  usedCount?: number;
  expiresAt?: any;
  active: boolean;
}

export interface ShopCustomer {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  addresses: ShippingAddress[];
  totalOrders?: number;
  totalSpent?: number;
  createdAt?: any;
}

// Delivery zones in Morocco
export const DELIVERY_ZONES = {
  casablanca: { name: 'Casablanca', fee: 25, days: '24-48h' },
  rabat: { name: 'Rabat - Salé', fee: 35, days: '1-2 jours' },
  marrakech: { name: 'Marrakech', fee: 35, days: '2-3 jours' },
  fes: { name: 'Fès - Meknès', fee: 35, days: '2-3 jours' },
  tanger: { name: 'Tanger', fee: 35, days: '2-3 jours' },
  agadir: { name: 'Agadir', fee: 35, days: '2-3 jours' },
  oujda: { name: 'Oujda', fee: 40, days: '3-4 jours' },
  other: { name: 'Autres villes', fee: 50, days: '3-5 jours' },
} as const;

export type DeliveryZone = keyof typeof DELIVERY_ZONES;

export const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Salé', 'Marrakech', 'Fès', 'Meknès',
  'Tanger', 'Agadir', 'Oujda', 'Kenitra', 'Tétouan', 'El Jadida',
  'Safi', 'Mohammedia', 'Khouribga', 'Béni Mellal', 'Nador',
  'Laâyoune', 'Dakhla', 'Settat', 'Berrechid', 'Khémisset',
  'Inezgane', 'Taza', 'Guelmim', 'Larache', 'Ksar el-Kébir',
  'Berkane', 'Al Hoceima', 'Taourirt', 'Khénifra', 'Sidi Kacem',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  processing: 'En préparation',
  shipped: 'Expédié',
  out_for_delivery: 'En livraison',
  delivered: 'Livré',
  cancelled: 'Annulé',
  returned: 'Retourné',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#F59E0B',
  confirmed: '#3B82F6',
  processing: '#8B5CF6',
  shipped: '#06B6D4',
  out_for_delivery: '#F97316',
  delivered: '#10B981',
  cancelled: '#EF4444',
  returned: '#6B7280',
};
