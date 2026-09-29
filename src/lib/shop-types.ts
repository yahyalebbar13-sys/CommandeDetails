// ─── Shop E-Commerce Types ────────────────────────────────────────────────────

export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  icon?: string;
  image?: string;
  productCount?: number;
  color?: string;
  priority?: number;
  parentSlug?: string;
  hidden?: boolean; // catégorie supprimée depuis l'admin
}

export interface ProductVariant {
  id: string;
  color?: string;
  colorAr?: string;
  colorHex?: string;
  image?: string;
  model?: string;
  modelAr?: string;
  size?: string;
  sizeAr?: string;
  sku?: string;
  stock: number;
  price?: number; // Override price for this variant
  stockArticleId?: string;

  // ── Specific details for this variant ──
  shortDescription?: string;
  shortDescriptionAr?: string;
  description?: string;
  descriptionAr?: string;
  
  // ── Technical characteristics overrides ──
  material?: string;
  materialAr?: string;
  typeProduit?: string;
  specification?: string;
  specificationAr?: string;
  weight?: number;
  width?: string;
  packaging?: string;
  packagingAr?: string;
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
  conditionnementUnitaire?: string;
  conditionnementGros?: string;
  applications?: string;
  avantages?: string;
  conseilsEntretien?: string;
  informationCommerciale?: string;
}

// Permet d'afficher un produit dans une autre catégorie avec un nom/description différent
export interface CategoryAlias {
  slug: string;               // Le slug de la catégorie cible
  name?: string;              // Nom alternatif pour cette catégorie
  nameAr?: string;            // Nom alternatif en arabe
  shortDescription?: string;  // Description courte alternative
  shortDescriptionAr?: string;
  images?: string[];           // Images alternatives (optionnel)
}

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  catalogueName?: string; // Nom alternatif pour le catalogue PDF/web
  nameAr?: string;
  shortDescription?: string;
  shortDescriptionAr?: string;
  description: string;
  descriptionAr?: string;
  categorySlug: string;
  additionalCategorySlugs?: string[]; // Rétro-compatible, préférer categoryAliases
  categoryAliases?: CategoryAlias[];  // Nom/description différents par catégorie
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
  conditionnementUnitaire?: string;
  conditionnementGros?: string;
  stockArticleId?: string;
  stockArticleIds?: Record<string, string>;
  /**
   * Rouleau entier ou article encombrant : Sendit ne le livre pas. Le client
   * choisit retrait ou transport, organisé par téléphone ; aucun frais de colis affiché.
   */
  volumineux?: boolean;

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
    colorHex?: string;
    model?: string;
    modelAr?: string;
    size?: string;
    sizeAr?: string;
    variantId?: string;
  };
  maxStock: number;
  /** Sur une ligne de commande : prix unitaire réellement facturé (prix de gros compris). */
  unitPrice?: number;
  /** Copié du produit à l'ajout au panier : article volumineux (cf. ShopProduct.volumineux). */
  volumineux?: boolean;
}

export type OrderStatus =
  | 'pending'       // En attente de confirmation
  | 'confirmed'     // Confirmé
  | 'processing'    // En préparation
  | 'ready_for_pickup' // Prête à retirer (retrait en magasin)
  | 'shipped'       // Expédié
  | 'out_for_delivery' // En cours de livraison
  | 'delivered'     // Livré
  | 'cancelled'     // Annulé
  | 'returned';     // Retourné

/**
 * Comment le client reçoit sa commande :
 * - domicile  : colis Sendit (petits articles), frais selon la ville ;
 * - retrait   : gratuit, au magasin (Derb Omar pour les petits articles, CHRIFA pour les volumineux) ;
 * - transport : volumineux livré par la camionnette (Casablanca) ou un transporteur jusqu'à son
 *               dépôt dans la ville du client ; organisé et chiffré par téléphone.
 */
export type ModeReception = 'domicile' | 'retrait' | 'transport';

/** Magasins où l'on retire une commande. */
export type LieuRetrait = 'derb_omar' | 'chrifa';

/** cod = espèces à la livraison ou au retrait ; virement ; carte (quand un prestataire sera branché). */
export type MoyenPaiement = 'cod' | 'virement' | 'carte';

export interface ReceptionCommande {
  mode: ModeReception;
  /** Si retrait : le magasin (déduit du contenu : volumineux → chrifa). */
  lieuRetrait?: LieuRetrait;
  /** La commande contient au moins un article volumineux. */
  volumineux: boolean;
  /** Si transport : ce que le client préfère (confirmé à l'appel). */
  preferenceTransport?: 'camionnette' | 'transporteur';
}

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
  customerPhone?: string;
  status: OrderStatus;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  couponCode?: string;
  total: number;
  shippingAddress: ShippingAddress;
  /** Moyen de paiement choisi à la commande (les anciennes commandes : 'cod'). */
  paymentMethod: MoyenPaiement;
  /** Mode de réception (absent sur les commandes d'avant le 29/09/2026 : colis à domicile). */
  reception?: ReceptionCommande;
  /**
   * Colis Sendit créé par l'équipe, écrit par le serveur (/api/shop/sendit/envoyer).
   * Pour l'affichage seulement : tant que firestore.rules ne l'interdit pas à la création,
   * un client peut l'écrire lui-même ; l'envoi et le webhook ne lisent que shop_orders_interne.
   */
  livraison?: { transporteur: 'sendit'; code: string };
  notes?: string;
  trackingNotes?: TrackingNote[];
  whatsappSent?: boolean;
  /** Note de l'équipe, jamais montrée au client. */
  noteInterne?: string;
  /** Raison d'une annulation, gardée pour soi (le client ne voit que « Commande annulée »). */
  motifAnnulation?: string;
  /** Posé par /api/shop/commandes/alerte : l'e-mail « nouvelle commande » est parti. */
  alerteEnvoyeeLe?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface TrackingNote {
  status: OrderStatus;
  message: string;
  timestamp: any;
  /** E-mail de qui a changé le statut (admin). */
  auteur?: string;
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

/**
 * @deprecated Plus utilisé par le site : frais et délais se calculent dans
 * src/lib/livraison-boutique.ts (FRAIS_ZONE, DELAI_ZONE, zoneDeVille). Valeurs
 * alignées sur la grille Sendit du 29/09/2026 (20 / 35 / 45 DH), pour qu'un
 * ancien import n'affiche pas un faux prix.
 */
export const DELIVERY_ZONES = {
  casablanca: { name: 'Casablanca', fee: 20, days: '24-48h' },
  rabat: { name: 'Rabat - Salé', fee: 35, days: '1-3 jours ouvrés' },
  marrakech: { name: 'Marrakech', fee: 35, days: '1-3 jours ouvrés' },
  fes: { name: 'Fès - Meknès', fee: 35, days: '1-3 jours ouvrés' },
  tanger: { name: 'Tanger', fee: 35, days: '1-3 jours ouvrés' },
  agadir: { name: 'Agadir', fee: 35, days: '1-3 jours ouvrés' },
  oujda: { name: 'Oujda', fee: 35, days: '1-3 jours ouvrés' },
  other: { name: 'Villes éloignées et autres villes', fee: 45, days: '2-4 jours ouvrés' },
} as const;

/** @deprecated Voir ZoneLivraison dans src/lib/livraison-boutique.ts. */
export type DeliveryZone = keyof typeof DELIVERY_ZONES;

/**
 * Villes proposées au formulaire de commande : les plus demandées d'abord, puis
 * les autres par ordre alphabétique. Ne jamais renommer une entrée : les adresses
 * enregistrées des clients pré-remplissent la liste avec ce texte exact. Le palier
 * de prix de chaque ville est dans src/lib/livraison-boutique.ts.
 */
export const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Salé', 'Marrakech', 'Fès', 'Meknès',
  'Tanger', 'Agadir', 'Oujda',
  'Al Hoceima', 'Béni Mellal', 'Berkane', 'Berrechid', 'Bouskoura',
  'Chefchaouen', 'Dakhla', 'Dar Bouazza', 'El Jadida', 'Errachidia',
  'Essaouira', 'Guelmim', 'Inezgane', 'Kenitra', 'Khémisset',
  'Khénifra', 'Khouribga', 'Ksar el-Kébir', 'Laâyoune', 'Larache',
  'Médiouna', 'Mohammedia', 'Nador', 'Ouarzazate', 'Safi', 'Settat',
  'Sidi Kacem', 'Taourirt', 'Taroudant', 'Taza', 'Témara', 'Tétouan',
  'Tiznit',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  processing: 'En préparation',
  ready_for_pickup: 'Prête à retirer',
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
  ready_for_pickup: '#14B8A6',
  shipped: '#06B6D4',
  out_for_delivery: '#F97316',
  delivered: '#10B981',
  cancelled: '#EF4444',
  returned: '#6B7280',
};
