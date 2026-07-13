import type { ShopProduct, ShopCategory } from './shop-types';

// ─── Shop Categories ──────────────────────────────────────────────────────────
export const SHOP_CATEGORIES: ShopCategory[] = [
  {
    id: 'fermetures-nylon',
    slug: 'fermetures-nylon',
    name: 'Fermetures Nylon',
    nameAr: 'سحابات نايلون',
    description: 'Fermetures éclair en nylon de qualité supérieure — toutes tailles et couleurs',
    descriptionAr: 'سحابات نايلون عالية الجودة — جميع المقاسات والألوان',
    color: '#3B82F6',
    image: '/fermetures.jpg',
    priority: 100,
  },
  {
    id: 'fermetures-resine',
    slug: 'fermetures-resine',
    name: 'Fermetures Résine',
    nameAr: 'سحابات بلاستيكية',
    description: 'Fermetures en résine (plastique) robustes et colorées',
    descriptionAr: 'سحابات بلاستيكية متينة ومتعددة الألوان',
    color: '#8B5CF6',
    image: '/fermetures-plastique.jpg',
    priority: 90,
  },
  {
    id: 'fermetures-metal',
    slug: 'fermetures-metal',
    name: 'Fermetures Métal',
    nameAr: 'سحابات معدنية',
    description: 'Fermetures métalliques laiton et aluminium — haut de gamme',
    descriptionAr: 'سحابات معدنية من النحاس والألومنيوم — جودة عالية',
    color: '#D4A843',
    priority: 80,
  },
  {
    id: 'fermetures-invisibles',
    slug: 'fermetures-invisibles',
    name: 'Fermetures Invisibles',
    nameAr: 'سحابات خفية',
    description: 'Fermetures invisibles pour robes et vêtements élégants',
    descriptionAr: 'سحابات خفية للفساتين والملابس الأنيقة',
    color: '#EC4899',
    priority: 70,
  },
  {
    id: 'boutons',
    slug: 'boutons',
    name: 'Boutons',
    nameAr: 'أزرار',
    description: 'Boutons pression, couverts, fantaisie — large gamme',
    descriptionAr: 'أزرار ضغط، قابلة للتغطية وأزرار فاخرة — تشكيلة واسعة',
    color: '#10B981',
    priority: 60,
  },
  {
    id: 'elastiques',
    slug: 'elastiques',
    name: 'Élastiques',
    nameAr: 'مطاطات',
    description: 'Élastiques plats, ronds et dentelle pour toutes applications',
    descriptionAr: 'مطاطات مسطحة ودائرية ومزخرفة لجميع الاستخدامات',
    color: '#F59E0B',
    priority: 50,
  },
  {
    id: 'biais-rubans',
    slug: 'biais-rubans',
    name: 'Biais & Rubans',
    nameAr: 'أشرطة وأقمشة',
    description: 'Biais coton et rubans satin, gros grain et fantaisie',
    descriptionAr: 'أشرطة قطنية وساتان وأشرطة فاخرة ومتنوعة',
    color: '#C8102E',
    priority: 40,
  },
  {
    id: 'scratch-velcro',
    slug: 'scratch-velcro',
    name: 'Scratch / Velcro',
    nameAr: 'فيلكرو / سكراتش',
    description: 'Bandes auto-agrippantes scratch et velcro toutes largeurs',
    descriptionAr: 'أشرطة لاصقة بالضغط (فيلكرو وسكراتش) بجميع العرضات',
    color: '#06B6D4',
    priority: 30,
  },
  {
    id: 'accessoires-couture',
    slug: 'accessoires-couture',
    name: 'Accessoires Couture',
    nameAr: 'مستلزمات الخياطة',
    description: 'Aiguilles, épingles, dés à coudre et accessoires mercerie',
    descriptionAr: 'إبر، دبابيس، كشتبانات وجميع لوازم الخياطة',
    color: '#F97316',
    priority: 20,
  },
];

// ─── Placeholder images (using picsum for demo) ───────────────────────────────
// In production, these would be Firebase Storage URLs
const IMG = (id: number, w = 600, h = 600) => `https://picsum.photos/seed/${id}/${w}/${h}`;

// ─── Demo Products ────────────────────────────────────────────────────────────
export const SHOP_PRODUCTS_DATA: ShopProduct[] = [];
