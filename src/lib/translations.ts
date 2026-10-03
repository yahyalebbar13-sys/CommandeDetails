export type Language = 'fr' | 'ar';

type Translations = Record<string, Record<Language, string>>;

export const translations: Translations = {
  // ── Navigation ────────────────────────────────────────────────────────────
  nav_home:         { fr: 'Accueil',        ar: 'الرئيسية' },
  nav_shop:         { fr: 'Boutique',       ar: 'المتجر' },
  nav_all_products: { fr: 'Tous les produits', ar: 'كل المنتجات' },
  nav_categories:   { fr: 'Catégories',     ar: 'الفئات' },
  nav_promos:       { fr: 'Promotions',     ar: 'التخفيضات' },
  nav_ma_liste: { fr: 'Ma liste', ar: 'قائمتي' },
  nav_tracking:     { fr: 'Suivi commande', ar: 'تتبع الطلب' },
  nav_contact:      { fr: 'Contact',        ar: 'اتصل بنا' },
  nav_boutiques:    { fr: 'À Propos & Magasins',  ar: 'من نحن ومحلاتنا' },
  nav_precommande:  { fr: 'Service Import', ar: 'خدمة الاستيراد' },
  nav_all_cats:     { fr: 'Toutes les catégories', ar: 'كل الفئات' },
  nav_more:         { fr: 'Plus...', ar: 'المزيد...' },
  nav_catalogue:    { fr: 'Catalogue', ar: 'كتالوج' },
  nav_secteurs:     { fr: 'Secteurs', ar: 'القطاعات' },

  // ── Secteurs d'activité (/shop/secteurs) ──────────────────────────────────
  secteurs_titre:     { fr: "Secteurs d'activité", ar: 'قطاعات النشاط' },
  secteurs_phrase:    { fr: 'Trouvez les fournitures de votre métier', ar: 'اعثر على لوازم حرفتك' },
  secteurs_par_secteur: { fr: "Par secteur d'activité", ar: 'حسب قطاع النشاط' },
  secteurs_tous:      { fr: 'Tous les secteurs', ar: 'كل القطاعات' },
  secteurs_autres:    { fr: 'Voir les autres secteurs', ar: 'شاهد القطاعات الأخرى' },
  secteurs_lire_suite: { fr: 'Lire la suite', ar: 'اقرأ المزيد' },
  secteurs_lire_moins: { fr: 'Réduire', ar: 'إخفاء' },
  secteurs_commande_atelier: { fr: 'Commande pour votre atelier', ar: 'طلبية لمعملك' },
  secteurs_devis:     { fr: 'Demander un devis sur WhatsApp', ar: 'اطلب عرض سعر عبر واتساب' },

  // ── Hero section ──────────────────────────────────────────────────────────
  hero_badge:    { fr: 'Mercerie Professionnelle', ar: 'خردوات خياطة احترافية' },
  hero_title_1:  { fr: 'Qualité',            ar: 'جودة' },
  hero_title_2:  { fr: 'Professionnelle',    ar: 'عالية' },
  hero_subtitle: { fr: 'Fermetures, boutons, élastiques, rubans — tout pour vos créations. Livraison partout au Maroc.', ar: 'سحابات، أزرار، مطاط، أشرطة — كل ما تحتاجه لإبداعاتك. التوصيل لجميع أنحاء المغرب.' },
  btn_discover:  { fr: 'Découvrir la boutique', ar: 'اكتشف المتجر' },
  btn_promos:    { fr: 'Promotions',         ar: 'عروض خاصة' },

  // ── Trust badges ──────────────────────────────────────────────────────────
  trust_delivery: { fr: 'Expédition sous 24 h',   ar: 'الشحن خلال 24 ساعة' },
  trust_return:   { fr: 'Retour 14j',              ar: 'إرجاع خلال 14 يوماً' },
  trust_support:  { fr: 'WhatsApp support',        ar: 'دعم عبر الواتساب' },
  trust_payment:  { fr: 'Paiement à la réception', ar: 'الدفع عند الاستلام' },
  trust_quality:  { fr: 'Qualité garantie',        ar: 'جودة مضمونة' },

  // ── Cart & Drawer ─────────────────────────────────────────────────────────
  cart_title:     { fr: 'Mon Panier',         ar: 'سلة المشتريات' },
  cart_empty:     { fr: 'Votre panier est vide', ar: 'سلتك فارغة' },
  cart_empty_sub: { fr: 'Découvrez notre sélection de mercerie marocaine.', ar: 'اكتشف تشكيلتنا من خردوات الخياطة.' },
  continue_shopping: { fr: 'Continuer les achats', ar: 'مواصلة التسوق' },
  checkout:       { fr: 'Commander maintenant', ar: 'اطلب الآن' },
  subtotal:       { fr: 'Sous-total',          ar: 'المجموع الفرعي' },
  total:          { fr: 'Total estimé',         ar: 'المجموع التقديري' },
  delivery_cost:  { fr: 'Livraison',            ar: 'التوصيل' },
  delivery_calc:  { fr: 'Calculée à la commande', ar: 'تحسب عند الطلب' },
  // Plus de livraison offerte depuis le 30/09/2026 : le prix du colis, et le retrait gratuit.
  delivery_from:  { fr: 'Dès {amount}',          ar: 'من {amount}' },
  delivery_casa_price: { fr: 'Livraison {amount} à Casablanca', ar: 'التوصيل {amount} في الدار البيضاء' },
  cod_payment:    { fr: 'Paiement à la livraison ou au retrait 💵', ar: 'الدفع عند التوصيل أو الاستلام من المحل 💵' },
  price_on_request: { fr: 'Sur demande', ar: 'حسب الطلب' },
  price_from:     { fr: 'À partir de',                  ar: 'من' },

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
