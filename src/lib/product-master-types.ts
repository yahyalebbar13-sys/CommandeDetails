/**
 * ProductMaster — Types pour la base de données unifiée produits
 * 
 * Chaque ProductMaster relie UN produit physique à ses entrées dans :
 * - Gestion (articles en anglais)
 * - Stock (nom personnalisé libre)
 * - Shop/Site web (nom français + arabe + descriptions)
 */

export interface ProductMaster {
  id: string;

  // ── Noms multilingues ──────────────────────────────────────────────────────
  nameEN: string;                    // Nom anglais (depuis Gestion article.name)
  nameFR: string;                    // Nom français (depuis Shop ou saisi manuellement)
  nameAR?: string;                   // Nom arabe (depuis Shop)
  nameStock?: string;                // Nom personnalisé pour le module Stock (libre)

  // ── Identifiants de liaison ────────────────────────────────────────────────
  gestionArticleIds: string[];       // IDs dans users/{uid}/articles
  shopProductId?: string;            // ID dans shop_custom_products / shop_product_overrides
  gestionCategoryId?: string;        // Nom catégorie Gestion (ex: "Zipper No5")
  gestionGeneralCategoryId?: string; // ID catégorie générale Gestion
  shopCategorySlug?: string;         // Slug catégorie Shop (ex: "fermetures-nylon")

  // ── Infos communes ─────────────────────────────────────────────────────────
  specs?: string;                    // Spécifications techniques
  color?: string;                    // Couleur principale
  unitOfMeasure?: string;            // Unité de mesure

  // ── Prix ───────────────────────────────────────────────────────────────────
  purchasePriceFOB?: number;         // Prix achat FOB (USD) — depuis Gestion
  purchasePriceMAD?: number;         // Prix achat TTC MAD (coût de revient)
  sellingPrice?: number;             // Prix de vente MAD — depuis Shop
  wholesalePrice?: number;           // Prix de gros MAD — depuis Shop

  // ── Stock ──────────────────────────────────────────────────────────────────
  currentStockQty?: number;          // Stock actuel calculé (sync depuis module Stock)
  stockQtyOverride?: number | null;  // Override manuel du stock (si null → auto-sync)
  minThreshold?: number;             // Seuil d'alerte stock bas

  // ── Descriptions (Shop) ────────────────────────────────────────────────────
  shortDescription?: string;
  shortDescriptionAR?: string;
  description?: string;
  descriptionAR?: string;

  // ── Images ─────────────────────────────────────────────────────────────────
  images?: string[];

  // ── Métadonnées ────────────────────────────────────────────────────────────
  supplierId?: string;
  tags?: string[];
  createdAt?: any;
  updatedAt?: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Construit un nom d'affichage pour un produit master selon le contexte
 */
export function getProductMasterDisplayName(
  pm: ProductMaster,
  context: 'gestion' | 'stock' | 'shop' = 'gestion'
): string {
  switch (context) {
    case 'stock':
      return pm.nameStock || pm.nameFR || pm.nameEN || 'Produit';
    case 'shop':
      return pm.nameFR || pm.nameEN || 'Produit';
    case 'gestion':
    default:
      return pm.nameEN || pm.nameFR || 'Produit';
  }
}

/**
 * Détermine le statut de liaison d'un ProductMaster
 */
export type LinkStatus = 'fully_linked' | 'partial' | 'unlinked';

export function getProductMasterLinkStatus(pm: ProductMaster): LinkStatus {
  const hasGestion = pm.gestionArticleIds.length > 0;
  const hasShop = !!pm.shopProductId;

  if (hasGestion && hasShop) return 'fully_linked';
  if (hasGestion || hasShop) return 'partial';
  return 'unlinked';
}

/**
 * Normalise un nom de produit pour le matching automatique
 * Supprime les espaces, accents, ponctuation, et met en minuscule
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '')       // Keep only alphanumeric
    .trim();
}
