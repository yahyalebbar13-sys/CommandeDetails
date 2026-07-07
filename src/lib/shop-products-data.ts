import type { ShopProduct, ShopCategory } from './shop-types';

// ─── Shop Categories ──────────────────────────────────────────────────────────
export const SHOP_CATEGORIES: ShopCategory[] = [
  {
    id: 'fermetures-nylon',
    slug: 'fermetures-nylon',
    name: 'Fermetures Nylon',
    description: 'Fermetures éclair en nylon de qualité supérieure — toutes tailles et couleurs',
    color: '#3B82F6',
    image: '/fermetures.jpg',
    priority: 100,
  },
  {
    id: 'fermetures-resine',
    slug: 'fermetures-resine',
    name: 'Fermetures Résine',
    description: 'Fermetures en résine (plastique) robustes et colorées',
    color: '#8B5CF6',
    image: '/fermetures-plastique.jpg',
    priority: 90,
  },
  {
    id: 'fermetures-metal',
    slug: 'fermetures-metal',
    name: 'Fermetures Métal',
    description: 'Fermetures métalliques laiton et aluminium — haut de gamme',
    color: '#D4A843',
    priority: 80,
  },
  {
    id: 'fermetures-invisibles',
    slug: 'fermetures-invisibles',
    name: 'Fermetures Invisibles',
    description: 'Fermetures invisibles pour robes et vêtements élégants',
    color: '#EC4899',
    priority: 70,
  },
  {
    id: 'boutons',
    slug: 'boutons',
    name: 'Boutons',
    description: 'Boutons pression, couverts, fantaisie — large gamme',
    color: '#10B981',
    priority: 60,
  },
  {
    id: 'elastiques',
    slug: 'elastiques',
    name: 'Élastiques',
    description: 'Élastiques plats, ronds et dentelle pour toutes applications',
    color: '#F59E0B',
    priority: 50,
  },
  {
    id: 'biais-rubans',
    slug: 'biais-rubans',
    name: 'Biais & Rubans',
    description: 'Biais coton et rubans satin, gros grain et fantaisie',
    color: '#C8102E',
    priority: 40,
  },
  {
    id: 'scratch-velcro',
    slug: 'scratch-velcro',
    name: 'Scratch / Velcro',
    description: 'Bandes auto-agrippantes scratch et velcro toutes largeurs',
    color: '#06B6D4',
    priority: 30,
  },
  {
    id: 'accessoires-couture',
    slug: 'accessoires-couture',
    name: 'Accessoires Couture',
    description: 'Aiguilles, épingles, dés à coudre et accessoires mercerie',
    color: '#F97316',
    priority: 20,
  },
];

// ─── Placeholder images (using picsum for demo) ───────────────────────────────
// In production, these would be Firebase Storage URLs
const IMG = (id: number, w = 600, h = 600) => `https://picsum.photos/seed/${id}/${w}/${h}`;

// ─── Demo Products ────────────────────────────────────────────────────────────
export const SHOP_PRODUCTS_DATA: ShopProduct[] = [];
