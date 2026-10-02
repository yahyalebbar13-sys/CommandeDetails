"use client";
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/shop/ProductCard';
import {
  Heart,
  Truck,
  Store,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  FileText,
  PackageCheck
} from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';
import { FRAIS_ZONE, TEXTE_TRANSPORT_VOLUMINEUX, TEXTE_TRANSPORT_VOLUMINEUX_AR, delaiZone } from '@/lib/livraison-boutique';
import ChoixVariante from '@/components/shop/ChoixVariante';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useLanguage } from '@/contexts/language-context';
import { db } from '@/lib/firebase-db';
import { doc, getDoc } from 'firebase/firestore';
import type { ProductVariant, ShopProduct } from '@/lib/shop-types';
import { nomCategorieProduit, nomProduit, paire, premierTexte, texte, texteFiche } from '@/lib/shop-textes';
import { libelleModele, libelleTaille } from '@/lib/shop-variantes';

type OngletFiche = 'description' | 'applications' | 'avantages' | 'entretien' | 'commercial';

// Sens d'écriture d'un texte venu des données : de droite à gauche s'il est traduit,
// de gauche à droite pour le français de repli (sinon sa ponctuation part du mauvais côté)
function sensDuTexte(valeur: string): 'rtl' | 'ltr' {
  return /[\u0600-\u06FF]/.test(valeur) ? 'rtl' : 'ltr';
}

// ─── Main Product Page Component ─────────────────────────────────────────────
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { language } = useLanguage();
  const { id } = React.use(params);
  const { products, categories, getProductById: ctxGetById, isLoading } = useShopProducts();

  const [directProduct, setDirectProduct] = useState<any>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [directDone, setDirectDone] = useState(false);

  const product = ctxGetById(id) || directProduct;

  useEffect(() => {
    if (!isLoading && !ctxGetById(id) && !directDone) {
      setDirectLoading(true);
      setDirectDone(true);
      (async () => {
        try {
          const snap = await getDoc(doc(db, 'shop_custom_products', id));
          if (snap.exists()) {
            const data = snap.data();
            const overSnap = await getDoc(doc(db, 'shop_product_overrides', id));
            setDirectProduct({ id, ...data, ...(overSnap.exists() ? overSnap.data() : {}) });
          }
        } catch (err) {
          console.error('[ProductPage] Direct Firestore fetch error:', err);
        } finally {
          setDirectLoading(false);
        }
      })();
    }
  }, [isLoading, id, directDone]);

  // Variante retenue par le sélecteur (null tant que le choix n'est pas complet)
  const [activeVariant, setActiveVariant] = useState<ProductVariant | null>(null);
  const [mainImg, setMainImg] = useState(0);
  const [wished, setWished] = useState(false);
  const [exploreProducts, setExploreProducts] = useState<ShopProduct[]>([]);
  const [exploreVisibleCount, setExploreVisibleCount] = useState(24);
  const exploreObserverRef = useRef<HTMLDivElement>(null);
  // null : le premier onglet qui a du contenu
  const [activeTab, setActiveTab] = useState<OngletFiche | null>(null);

  // Le sélecteur (monté avec key={product.id}) signale lui-même la variante retenue au montage
  useEffect(() => {
    setMainImg(0);
    setActiveTab(null);
  }, [product?.id]);

  useEffect(() => {
    if (!product || products.length === 0) return;

    // 1. Products from same category (excluding current)
    const sameCategory = products.filter(
      p => p.id !== product.id && (p.categorySlug === product.categorySlug || p.additionalCategorySlugs?.includes(product.categorySlug))
    );

    // 2. Products from other categories (excluding current)
    const otherProducts = products.filter(
      p => p.id !== product.id && p.categorySlug !== product.categorySlug && !p.additionalCategorySlugs?.includes(product.categorySlug)
    );

    // Shuffle other categories for discovery
    const shuffledOthers = [...otherProducts].sort(() => 0.5 - Math.random());

    // Combine: same category first, then other products
    const combined = [...sameCategory, ...shuffledOthers];

    // Deduplicate by ID
    const unique = Array.from(new Map(combined.map(p => [p.id, p])).values());

    setExploreProducts(unique);
    setExploreVisibleCount(24);
  }, [product?.id, products]);

  // Infinite scroll observer for "Explorer vos centres d'intérêt"
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setExploreVisibleCount(prev => Math.min(prev + 24, exploreProducts.length));
        }
      },
      { rootMargin: '500px' }
    );
    if (exploreObserverRef.current) {
      observer.observe(exploreObserverRef.current);
    }
    return () => observer.disconnect();
  }, [exploreProducts.length]);

  if (isLoading || directLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-neutral-500 text-xs font-semibold">{language === 'ar' ? 'جاري التحميل...' : 'Chargement du produit…'}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center max-w-sm px-4">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔍
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {language === 'ar' ? 'المنتج غير موجود' : 'Produit introuvable'}
          </h1>
          <p className="text-neutral-500 text-xs mb-6">
            {language === 'ar' ? 'هذا المنتج غير متوفر أو تم حذفه.' : "Le produit demandé n'existe pas ou a été déplacé."}
          </p>
          <Link href="/shop/boutique" className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors">
            {language === 'ar' ? 'العودة للمتجر' : 'Retour à la boutique'}
          </Link>
        </div>
      </div>
    );
  }

  // Caractéristiques : celles de la variante retenue, sinon celles du produit
  const currentVariant = activeVariant;

  // ── Specific Characteristics Overrides ──
  // Dans la langue du site (champ *Ar), sinon le français, avec le même ordre de repli qu'avant
  const fiche = (champ: string) => texteFiche(product, currentVariant, [champ], language);
  const effectiveTypeProduit = fiche('typeProduit');
  const effectiveMaterial = premierTexte(language, paire(currentVariant, 'material'), paire(currentVariant, 'matiereMailles'), paire(product, 'matiereMailles'), paire(product, 'material'));
  const effectiveWidth = premierTexte(language, paire(currentVariant, 'width'), paire(currentVariant, 'largeurMaille'), paire(product, 'largeurMaille'), paire(product, 'width'));
  const effectiveLength = fiche('longueur');
  const effectiveWeight = currentVariant?.weight !== undefined ? currentVariant.weight : product.weight;
  const effectivePackaging = fiche('packaging');
  const effectiveCompositionRuban = fiche('compositionRuban');
  const effectiveCondUnitaire = fiche('conditionnementUnitaire');
  const effectiveCondGros = fiche('conditionnementGros');
  const effectiveResistance = fiche('resistance');
  const effectiveCompatibleAvec = fiche('compatibleAvec');
  const effectiveType = fiche('type');
  const effectiveDesign = fiche('design');
  const effectiveSecurite = fiche('securite');
  const effectiveApplications = fiche('applications');
  const effectiveAvantages = fiche('avantages');
  const effectiveConseilsEntretien = fiche('conseilsEntretien');
  const effectiveInfoCommerciale = fiche('informationCommerciale');
  const descriptionCourte = texte(product, 'shortDescription', language);
  const descriptionComplete = fiche('description');

  const activeSpecs = [
    { label: language === 'ar' ? 'نوع المنتج' : 'Type produit', value: effectiveTypeProduit },
    { label: language === 'ar' ? 'المادة' : 'Matière', value: effectiveMaterial },
    { label: language === 'ar' ? 'العرض' : 'Largeur', value: effectiveWidth },
    { label: language === 'ar' ? 'الطول' : 'Longueur', value: effectiveLength },
    { label: language === 'ar' ? 'الوزن' : 'Poids', value: effectiveWeight !== undefined && effectiveWeight !== null && effectiveWeight !== '' ? `${effectiveWeight} ${language === 'ar' ? 'غ' : 'g'}` : null },
    { label: language === 'ar' ? 'التعبئة' : 'Packaging', value: effectivePackaging },
    { label: language === 'ar' ? 'الشريط' : 'Ruban', value: effectiveCompositionRuban },
    { label: language === 'ar' ? 'تعبئة وحدة' : 'Cond. unité', value: effectiveCondUnitaire },
    { label: language === 'ar' ? 'تعبئة جملة' : 'Cond. gros', value: effectiveCondGros },
    { label: language === 'ar' ? 'المقاومة' : 'Résistance', value: effectiveResistance },
    { label: language === 'ar' ? 'متوافق مع' : 'Compatible', value: effectiveCompatibleAvec },
    { label: language === 'ar' ? 'النوع' : 'Type', value: effectiveType },
    { label: language === 'ar' ? 'التصميم' : 'Design', value: effectiveDesign },
    { label: language === 'ar' ? 'الأمان' : 'Sécurité', value: effectiveSecurite },
  ].filter(s => Boolean(s.value));

  // Pastille de l'en-tête des spécifications : modèle et taille de la variante retenue
  const pastilleModele = currentVariant ? libelleModele(currentVariant, language) : '';
  const pastilleTaille = currentVariant && currentVariant.size !== 'Standard' ? libelleTaille(currentVariant, language) : '';

  // Onglets du bas : seuls ceux qui ont un texte ; la description en premier
  const onglets = ([
    { id: 'description', libelle: language === 'ar' ? 'الوصف' : 'Description', texte: descriptionComplete },
    {
      id: 'applications',
      libelle: language === 'ar' ? 'الاستخدامات والقطاعات' : 'Applications & Secteurs',
      titre: language === 'ar' ? 'القطاعات والاستخدامات الموصى بها:' : 'Secteurs d’activité et usages recommandés :',
      texte: effectiveApplications,
    },
    {
      id: 'avantages',
      libelle: language === 'ar' ? 'المميزات' : 'Avantages clés',
      titre: language === 'ar' ? 'أبرز مميزات هذا المنتج:' : 'Points forts et atouts techniques :',
      texte: effectiveAvantages,
    },
    {
      id: 'entretien',
      libelle: language === 'ar' ? 'إرشادات العناية' : "Conseils d'entretien",
      titre: language === 'ar' ? 'نصائح العناية والاستخدام:' : "Conseils d'utilisation et d'entretien :",
      texte: effectiveConseilsEntretien,
    },
    {
      id: 'commercial',
      libelle: language === 'ar' ? 'معلومات تجارية' : 'Infos commerciales & Gros',
      titre: language === 'ar' ? 'شروط التعبئة والطلبات بالجملة:' : 'Informations commerciales, conditionnement & MOQ :',
      texte: effectiveInfoCommerciale,
    },
  ] as { id: OngletFiche; libelle: string; titre?: string; texte: string }[]).filter(o => o.texte);
  const ongletAffiche = onglets.find(o => o.id === activeTab) || onglets[0];

  const nom = nomProduit(product, language);
  const nomCategorie = nomCategorieProduit(product, categories, language);

  // Galerie : photos du produit, suivies des photos propres aux variantes
  const galleryImages: string[] = Array.from(
    new Set([...(product.images || []), ...(product.variants || []).map((v: ProductVariant) => v.image).filter(Boolean) as string[]])
  );

  // Choisir un modèle ou une couleur qui a sa photo l'affiche en grand
  const showImage = (image?: string) => {
    if (!image) return;
    const idx = galleryImages.indexOf(image);
    if (idx !== -1) setMainImg(idx);
  };

  const handleVariantSelect = (v: ProductVariant | null) => {
    setActiveVariant(v);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Breadcrumb & Top Bar ── */}
      <div className="border-b border-neutral-100 bg-neutral-50/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => window.history.back()} 
              aria-label={language === 'ar' ? 'رجوع' : 'Retour'}
              className="w-7 h-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition-colors flex-shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
            <Link href="/shop" className="hover:text-neutral-900 transition-colors whitespace-nowrap">{language === 'ar' ? 'الرئيسية' : 'Accueil'}</Link>
            <ChevronRight className="w-3 h-3 text-neutral-300 flex-shrink-0 rtl:rotate-180" />
            <Link href="/shop/boutique" className="hover:text-neutral-900 transition-colors whitespace-nowrap">{language === 'ar' ? 'المتجر' : 'Boutique'}</Link>
            <ChevronRight className="w-3 h-3 text-neutral-300 flex-shrink-0 rtl:rotate-180" />
            <Link href={`/shop/categorie/${product.categorySlug}`} className="hover:text-neutral-900 transition-colors whitespace-nowrap font-medium text-neutral-700">
              <bdi dir={sensDuTexte(nomCategorie)}>{nomCategorie}</bdi>
            </Link>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => setWished(!wished)}
              aria-label={language === 'ar' ? 'المفضلة' : 'Favoris'}
              className={`p-1.5 rounded-full border transition-colors cursor-pointer ${wished ? 'bg-rose-50 border-rose-200 text-[#C8102E]' : 'border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-white'}`}
            >
              <Heart className={`w-4 h-4 ${wished ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Product Section ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          
          {/* Left Column: Gallery */}
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-24 space-y-3">
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-neutral-50 border border-neutral-200/80 shadow-xs group">
                <img
                  src={galleryImages[mainImg] || galleryImages[0] || '/placeholder.png'}
                  alt={nom}
                  loading="eager" 
                  decoding="async" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                
                <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none">
                  {product.isNew && (
                    <span className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                      {language === 'ar' ? 'جديد' : 'Nouveau'}
                    </span>
                  )}
                </div>

                <button 
                  onClick={() => setWished(!wished)} 
                  aria-label={language === 'ar' ? 'أضف إلى المفضلة' : 'Ajouter aux favoris'}
                  className="sm:hidden absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-neutral-600 shadow-sm cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${wished ? 'fill-[#C8102E] text-[#C8102E]' : ''}`} />
                </button>
              </div>

              {/* Thumbnails — photos du produit + photos des variantes */}
              {galleryImages.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                  {galleryImages.map((img: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => setMainImg(i)}
                      className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden border-2 transition-all flex-shrink-0 cursor-pointer ${
                        mainImg === i ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200 hover:border-neutral-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Information & Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              {/* Category */}
              <Link 
                href={`/shop/categorie/${product.categorySlug}`}
                className="text-xs font-bold uppercase tracking-widest text-[#C8102E] hover:underline mb-1.5 inline-block"
              >
                <bdi dir={sensDuTexte(nomCategorie)}>{nomCategorie}</bdi>
              </Link>

              {/* Product Title */}
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 tracking-tight leading-tight mb-3"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                <bdi dir={sensDuTexte(nom)}>{nom}</bdi>
              </h1>

              {descriptionCourte && (
                <p className="text-base text-neutral-600 leading-relaxed mb-4" dir={sensDuTexte(descriptionCourte)}>
                  {descriptionCourte}
                </p>
              )}

              {/* ── Prix, choix du modèle / de la taille / de la couleur, quantité, ajout ── */}
              <ChoixVariante
                key={product.id}
                product={product}
                onSelectionChange={handleVariantSelect}
                onImagePreview={showImage}
              />

              {/* ── Rouleau entier : pas de colis Sendit, le transport s'organise par téléphone ── */}
              {product.volumineux && (
                <div className="mt-4 flex gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <Truck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-neutral-800 leading-relaxed" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    {language === 'ar' ? TEXTE_TRANSPORT_VOLUMINEUX_AR : TEXTE_TRANSPORT_VOLUMINEUX}
                  </p>
                </div>
              )}

              {/* ── Reassurance Micro-Banner : des faits, pas de promesse ── */}
              <div className={`grid gap-2 py-4 my-4 border-y border-neutral-100 text-center ${product.volumineux ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {product.volumineux ? (
                  <div className="flex flex-col items-center">
                    <Truck className="w-4 h-4 text-amber-700 mb-1" />
                    <span className="text-xs font-bold text-neutral-900">{language === 'ar' ? 'استلام مجاني' : 'Retrait gratuit'}</span>
                    <span className="text-xs text-neutral-500">{language === 'ar' ? 'أو نقل عبر الهاتف' : 'ou transport par téléphone'}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Truck className="w-4 h-4 text-emerald-600 mb-1" />
                    <span className="text-xs font-bold text-neutral-900">
                      {language === 'ar'
                        ? <>التوصيل <bdi dir="ltr">{formatPrice(FRAIS_ZONE.casablanca)}</bdi></>
                        : `Livraison ${formatPrice(FRAIS_ZONE.casablanca)}`}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {language === 'ar' ? `الدار البيضاء خلال ${delaiZone('casablanca', language)}` : `Casablanca en ${delaiZone('casablanca', language)}`}
                    </span>
                  </div>
                )}
                {/* Le retrait gratuit (déjà annoncé au panier et dans le bandeau) ; un rouleau l'affiche déjà à gauche */}
                {!product.volumineux && (
                  <div className="flex flex-col items-center border-x border-neutral-100">
                    <Store className="w-4 h-4 text-emerald-600 mb-1" />
                    <span className="text-xs font-bold text-neutral-900">{language === 'ar' ? 'استلام مجاني' : 'Retrait gratuit'}</span>
                    <span className="text-xs text-neutral-500">{language === 'ar' ? 'من محلنا بالدار البيضاء' : 'en magasin, Casablanca'}</span>
                  </div>
                )}
                <div className={`flex flex-col items-center ${product.volumineux ? 'border-s border-neutral-100' : ''}`}>
                  <PackageCheck className="w-4 h-4 text-[#C8102E] mb-1" />
                  <span className="text-xs font-bold text-neutral-900">{language === 'ar' ? 'البيع بالجملة' : 'Vente en gros'}</span>
                  <span className="text-xs text-neutral-500">{language === 'ar' ? 'حسب الطلب' : 'Sur mesure'}</span>
                </div>
              </div>

              {/* ── Dynamic Technical Specifications (Changes live with model/size) ── */}
              {activeSpecs.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200/80">
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-neutral-200/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-neutral-500" />
                      {language === 'ar' ? 'المواصفات التقنية' : 'Spécifications techniques'}
                    </span>
                    {(pastilleModele || pastilleTaille) && (
                      <span className="text-[10px] font-bold text-[#C8102E] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                        {pastilleModele && <bdi>{pastilleModele}</bdi>}
                        {pastilleModele && pastilleTaille ? ' · ' : ''}
                        {pastilleTaille && <bdi>{pastilleTaille}</bdi>}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                    {activeSpecs.map((spec, i) => (
                      <div key={i} className="flex items-baseline justify-between border-b border-neutral-200/40 pb-1 gap-2">
                        <span className="text-neutral-500 text-[11px] font-medium truncate">{spec.label}</span>
                        <span className="font-bold text-neutral-900 text-[11px] text-right truncate" dir={sensDuTexte(String(spec.value))}>{spec.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Detailed Technical Information & Documentation Tabs ── */}
        {ongletAffiche && (
          <div className="mt-14 pt-8 border-t border-neutral-200">
            <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-neutral-100 pb-3">
              {onglets.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActiveTab(o.id)}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                    ongletAffiche.id === o.id
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>

            <div className="p-6 rounded-3xl bg-neutral-50/60 border border-neutral-200/80">
              <div className="space-y-2">
                {ongletAffiche.titre && (
                  <h3 className="text-sm font-bold text-neutral-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {ongletAffiche.titre}
                  </h3>
                )}
                <p className="text-neutral-600 text-sm whitespace-pre-line leading-relaxed" dir={sensDuTexte(ongletAffiche.texte)}>
                  {ongletAffiche.texte}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Temu-Style: Explorer vos centres d'intérêt ── */}
        {exploreProducts.length > 0 && (
          <div className="mt-16 pt-10 border-t border-neutral-200">
            {/* Temu-Style Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#C8102E]/15 to-[#D4A843]/20 flex items-center justify-center text-[#C8102E] shadow-2xs flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {language === 'ar' ? 'استكشف اهتماماتك' : "Explorer vos centres d'intérêt"}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {language === 'ar' 
                      ? 'منتجات مختارة لك حسب اهتماماتك'
                      : 'Articles sélectionnés pour vous selon vos centres d\'intérêt'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full">
                  {exploreProducts.length} {language === 'ar' ? 'منتج' : 'produits'}
                </span>
                <Link 
                  href="/shop/boutique"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C8102E] hover:text-[#a00d25] px-3.5 py-1.5 rounded-xl border border-[#C8102E]/20 hover:border-[#C8102E] transition-all cursor-pointer touch-manipulation"
                >
                  <span>{language === 'ar' ? 'عرض الكتالوج كاملاً ←' : 'Tout le catalogue →'}</span>
                </Link>
              </div>
            </div>

            {/* High-Density Grid like Temu (2 cols mobile, 3-4 tablet, 5-6 desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
              {exploreProducts.slice(0, exploreVisibleCount).map(p => (
                <ProductCard key={p.id} product={p} showAddToCart={true} />
              ))}
            </div>

            {/* Infinite Scroll Sentinel */}
            {exploreVisibleCount < exploreProducts.length && (
              <div ref={exploreObserverRef} className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-7 h-7 border-2 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-neutral-400 font-medium">
                  {language === 'ar' ? 'تحميل المزيد من المنتجات…' : 'Chargement de produits…'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
