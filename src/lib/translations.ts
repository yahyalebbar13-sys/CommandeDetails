export type Language = 'fr' | 'ar';

type Translations = Record<string, Record<Language, string>>;

export const translations: Translations = {
  // ── Navigation ────────────────────────────────────────────────────────────
  nav_home:         { fr: 'Accueil',        ar: 'الرئيسية' },
  nav_shop:         { fr: 'Boutique',       ar: 'المتجر' },
  nav_categories:   { fr: 'Catégories',     ar: 'التصنيفات' },
  nav_promos:       { fr: 'Promotions',     ar: 'التخفيضات' },
  nav_tracking:     { fr: 'Suivi commande', ar: 'تتبع الطلب' },
  nav_contact:      { fr: 'Contact',        ar: 'اتصل بنا' },
  nav_boutiques:    { fr: 'À Propos & Magasins',  ar: 'عن المتجر' },
  nav_precommande:  { fr: 'Service Import', ar: 'خدمة الاستيراد' },
  nav_all_cats:     { fr: 'Toutes les catégories', ar: 'كل التصنيفات' },

  // ── Hero section ──────────────────────────────────────────────────────────
  hero_badge:    { fr: 'Mercerie Professionnelle', ar: 'خردوات خياطة احترافية' },
  hero_title_1:  { fr: 'Qualité',            ar: 'جودة' },
  hero_title_2:  { fr: 'Professionnelle',    ar: 'عالية' },
  hero_subtitle: { fr: 'Fermetures, boutons, élastiques, rubans — tout pour vos créations. Livraison partout au Maroc.', ar: 'سحابات، أزرار، شرائط... كل ما تحتاجه لإبداعاتك. توصيل لجميع أنحاء المغرب.' },
  btn_discover:  { fr: 'Découvrir la boutique', ar: 'اكتشف المتجر' },
  btn_promos:    { fr: 'Promotions',         ar: 'عروض خاصة' },

  // ── Trust badges ──────────────────────────────────────────────────────────
  trust_delivery: { fr: 'Livraison 24-48h',       ar: 'توصيل 24-48 ساعة' },
  trust_return:   { fr: 'Retour 14j',              ar: 'إرجاع خلال 14 يوم' },
  trust_support:  { fr: 'WhatsApp support',        ar: 'دعم عبر الواتساب' },
  trust_payment:  { fr: 'Paiement à la livraison', ar: 'الدفع عند الاستلام' },
  trust_quality:  { fr: 'Qualité garantie',        ar: 'جودة مضمونة' },

  // ── Cart & Drawer ─────────────────────────────────────────────────────────
  cart_title:     { fr: 'Mon Panier',         ar: 'سلة المشتريات' },
  cart_empty:     { fr: 'Votre panier est vide', ar: 'سلتك فارغة' },
  cart_empty_sub: { fr: 'Découvrez notre sélection de mercerie marocaine.', ar: 'اكتشف تشكيلتنا من خردوات الخياطة.' },
  continue_shopping: { fr: 'Continuer les achats', ar: 'مواصلة التسوق' },
  checkout:       { fr: 'Commander maintenant', ar: 'اطلب الآن' },
  subtotal:       { fr: 'Sous-total',          ar: 'المجموع الفرعي' },
  total:          { fr: 'Total estimé',         ar: 'المجموع الإجمالي' },
  delivery_cost:  { fr: 'Livraison',            ar: 'التوصيل' },
  delivery_free:  { fr: 'GRATUITE 🎉',          ar: 'مجاني 🎉' },
  delivery_calc:  { fr: 'Calculée à la commande', ar: 'تحسب عند الطلب' },
  free_delivery_progress: { fr: 'Plus que {amount} pour la livraison gratuite', ar: 'باقي {amount} للتوصيل المجاني' },
  free_delivery_unlocked: { fr: '🎉 Livraison GRATUITE débloquée !',           ar: '🎉 التوصيل مجاني الآن!' },
  cod_payment:    { fr: 'Paiement à la livraison 💵', ar: 'الدفع عند الاستلام 💵' },

  // ── Products ──────────────────────────────────────────────────────────────
  add_to_cart:    { fr: 'Ajouter au panier',  ar: 'أضف للسلة' },
  added_to_cart:  { fr: '✓ Ajouté !',         ar: '✓ تمت الإضافة!' },
  order_whatsapp: { fr: 'Commander sur WhatsApp', ar: 'اطلب عبر واتساب' },
  in_stock:       { fr: 'En stock',            ar: 'متوفر' },
  out_of_stock:   { fr: 'Rupture de stock',    ar: 'غير متوفر حالياً' },
  all_products:   { fr: 'Voir tous les produits', ar: 'عرض كل المنتجات' },
  new_arrivals:   { fr: 'Nouveautés',          ar: 'جديد' },
  featured:       { fr: 'Nos Produits Phares', ar: 'منتجاتنا المميزة' },

  // ── Checkout ──────────────────────────────────────────────────────────────
  firstname:       { fr: 'Prénom',             ar: 'الاسم الأول' },
  lastname:        { fr: 'Nom',                ar: 'الاسم الأخير' },
  phone:           { fr: 'Téléphone',          ar: 'رقم الهاتف' },
  address:         { fr: 'Adresse',            ar: 'العنوان' },
  city:            { fr: 'Ville',              ar: 'المدينة' },
  confirm_order:   { fr: 'Confirmer la commande', ar: 'تأكيد الطلب' },
  order_notes:     { fr: 'Notes de commande',  ar: 'ملاحظات الطلب' },

  // ── Misc ──────────────────────────────────────────────────────────────────
  search_placeholder: { fr: 'Rechercher un produit...', ar: 'ابحث عن منتج...' },
  whatsapp_cta:    { fr: 'Commander par WhatsApp', ar: 'اطلب عبر الواتساب' },
  see_more:        { fr: 'Voir plus',          ar: 'شاهد المزيد' },
  loading:         { fr: 'Chargement...',      ar: 'جاري التحميل...' },
};
