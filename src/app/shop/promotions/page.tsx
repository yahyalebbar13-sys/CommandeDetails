"use client";
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Tag, Clock, Zap, ShoppingBag, MessageCircle } from 'lucide-react';
import { useShopProducts } from '@/contexts/shop-products-context';
import {
  formatPrice,
  formatProductPrice,
  getProductPromo,
  getWhatsAppContact,
} from '@/lib/shop-utils';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useLanguage } from '@/contexts/language-context';
import type { ShopProduct } from '@/lib/shop-types';
import { ajoutRapide, messageDemandePrix, PRIX_SUR_DEMANDE } from '@/lib/shop-variantes';
import { nomCategorieProduit, nomProduit } from '@/lib/shop-textes';
import { delaiZone, FRAIS_ZONE } from '@/lib/livraison-boutique';

const PromoCard = React.memo(function PromoCard({ product }: { product: ShopProduct }) {
  const { t, language } = useLanguage();
  const { categories } = useShopProducts();
  const { addItem } = useShopCartActions();
  const [added, setAdded] = useState(false);
  const isAr = language === 'ar';
  const nom = nomProduit(product, language);
  // Remise calculée sur le prix affiché (celui des variantes), comme sur la fiche
  const { active: isPromo, percent: discount, saving } = getProductPromo(product);

  // Un produit à choisir (taille, couleur…) ne s'ajoute plus sans sa variante : le bouton mène à la fiche
  const ajout = useMemo(() => ajoutRapide(product), [product]);
  const aChoisir = ajout.mode === 'choisir';
  // Sans prix (onglets Nouveautés / Vedettes) : jamais au panier, le prix se demande sur WhatsApp
  const surDemande = ajout.mode === 'prix';

  const handleAdd = (e: React.MouseEvent) => {
    if (surDemande) {
      e.preventDefault();
      e.stopPropagation();
      window.open(getWhatsAppContact(messageDemandePrix(product)), '_blank', 'noopener,noreferrer');
      return;
    }
    if (ajout.mode !== 'direct') return;
    e.preventDefault();
    e.stopPropagation();
    addItem(ajout.item);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <Link
      href={`/shop/produit/${product.id}`}
      prefetch={false}
      className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden shop-product-card relative group flex flex-col h-full no-underline cursor-pointer touch-manipulation"
    >
      <div className="relative aspect-square bg-gray-50 shop-img-zoom">
        <img src={product.images?.[0] || '/placeholder.png'} alt={nom} loading="lazy" decoding="async" className="w-full h-full object-cover" />

        {discount > 0 && (
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="bg-[#C8102E] text-white font-black text-sm px-3 py-1 rounded-full shadow-lg">-{discount}%</span>
          </div>
        )}
        {product.isNew && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <span className="bg-[#10B981] text-white font-black text-xs px-2 py-1 rounded-full">{isAr ? 'جديد' : 'NOUVEAU'}</span>
          </div>
        )}
        {/* Mobile Quick Add */}
        {product.inStock !== false && (
          <button
            onClick={handleAdd}
            disabled={added}
            aria-label={surDemande ? (isAr ? 'اسأل عن الثمن في واتساب' : 'Demander le prix sur WhatsApp') : undefined}
            className={`lg:hidden absolute bottom-3 right-3 z-10 w-11 h-11 rounded-full shadow-md flex items-center justify-center transition-all cursor-pointer touch-manipulation ${
              added ? 'bg-[#10B981] text-white' : 'bg-white text-gray-900 active:bg-gray-100'
            }`}
          >
            {added ? <span className="text-[10px] font-bold">✓</span> : surDemande ? <MessageCircle className="w-5 h-5 text-[#128C7E]" /> : aChoisir ? <span className="text-[11px] font-bold text-[#C8102E]">{isAr ? 'اختر' : 'Choisir'}</span> : <ShoppingBag className="w-4 h-4" />}
          </button>
        )}
        {/* Desktop Quick add overlay */}
        <div className="hidden lg:block absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
          <button onClick={handleAdd}
            className={`pointer-events-auto w-full py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${added ? 'bg-[#10B981] text-white' : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'}`}>
            {added ? t('added_to_cart') : surDemande ? (isAr ? 'اسأل عن الثمن في واتساب' : 'Demander le prix sur WhatsApp') : aChoisir ? (isAr ? 'اختر الخيار' : 'Choisir une option') : `+ ${t('add_to_cart')}`}
          </button>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <p className="text-xs font-semibold text-[#D4A843] uppercase mb-1">{nomCategorieProduit(product, categories, language)}</p>
        <h3 className="font-semibold text-[#1A1A1A] text-sm line-clamp-2 mb-3 group-hover:text-[#C8102E] transition-colors" style={{ fontFamily: 'Outfit, sans-serif' }}>{nom}</h3>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`font-black text-[#C8102E] ${surDemande ? 'text-base' : 'text-lg'}`}>{surDemande ? PRIX_SUR_DEMANDE[language] : formatProductPrice(product, language)}</span>
          {isPromo && (
            <div className="flex flex-col">
              <span className="text-xs text-[#6B6B6B] line-through">{formatPrice(product.comparePrice as number)}</span>
              <span className="text-xs text-[#10B981] font-bold">
                {isAr ? <>وفّر <bdi dir="ltr">{formatPrice(saving)}</bdi></> : `Économisez ${formatPrice(saving)}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
});

export default function PromotionsPage() {
  const { getPromoProducts, getNewProducts, getFeaturedProducts } = useShopProducts();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const prixCasa = formatPrice(FRAIS_ZONE.casablanca);
  const prixVilles = formatPrice(FRAIS_ZONE.standard);
  const delaiCasa = delaiZone('casablanca', language);

  const promoProducts = getPromoProducts(100);
  const newProducts = getNewProducts(100);
  const featuredProducts = getFeaturedProducts(100);
  const maxDiscount = promoProducts.reduce(
    (max, p) => Math.max(max, getProductPromo(p).percent),
    0
  );

  const [activeTab, setActiveTab] = useState<'promos' | 'nouveautes' | 'vedettes'>('promos');

  const tabs = [
    { key: 'promos', label: isAr ? '🏷️ التخفيضات' : '🏷️ Promotions', count: promoProducts.length },
    { key: 'nouveautes', label: isAr ? '✨ وصل حديثاً' : '✨ Nouveautés', count: newProducts.length },
    { key: 'vedettes', label: isAr ? '⭐ المميزة' : '⭐ Vedettes', count: featuredProducts.length },
  ] as const;

  const activeProducts = activeTab === 'promos' ? promoProducts
    : activeTab === 'nouveautes' ? newProducts
    : featuredProducts;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero banner */}
      <div className="bg-gradient-to-br from-[#C8102E] via-[#a00d25] to-[#0F0F0F] text-white py-16 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #D4A843 0%, transparent 50%), radial-gradient(circle at 80% 20%, #ffffff 0%, transparent 40%)' }} />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-5 h-5 text-[#D4A843]" />
                <span className="text-[#D4A843] text-sm font-black uppercase tracking-widest">{isAr ? 'عروض خاصة' : 'Offres Spéciales'}</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black mb-4 leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {isAr ? 'تخفيضات' : 'Promotions'}<br />
                <span style={{ color: '#D4A843' }}>LEBTEX</span>
              </h1>
              <p className="text-red-200 text-lg max-w-md">
                {isAr
                  ? 'أفضل العروض على لوازم الخياطة والنسيج. استفد منها قبل نفاد الكمية!'
                  : 'Les meilleures offres sur nos accessoires textiles. Profitez-en avant épuisement des stocks !'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                { icon: Tag, val: `${promoProducts.length}`, label: isAr ? 'منتجات مخفّضة' : 'Articles en promo' },
                {
                  icon: Zap,
                  val: maxDiscount > 0
                    ? (isAr ? <>حتى <bdi dir="ltr">-{maxDiscount}%</bdi></> : `Jusqu'à -${maxDiscount}%`)
                    : (isAr ? 'أسعار صغيرة' : 'Petits prix'),
                  label: isAr ? 'تخفيض' : 'De réduction',
                },
                { icon: Clock, val: isAr ? 'محدود' : 'Limité', label: isAr ? 'الكمية المتوفرة' : 'Stocks disponibles' },
                { icon: ShoppingBag, val: prixCasa, label: isAr ? 'التوصيل في الدار البيضاء' : 'Livraison Casablanca' },
              ].map(({ icon: Icon, val, label }) => (
                <div key={label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
                  <p className="font-black text-lg text-white">{val}</p>
                  <p className="text-red-200 text-xs">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all cursor-pointer touch-manipulation ${
                activeTab === key ? 'bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/20' : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#C8102E]'
              }`}>
              {label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === key ? 'bg-white/20' : 'bg-[#F3EFE8] text-[#1A1A1A]'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Livraison : le vrai prix, et le retrait gratuit */}
        <div className="bg-[#D4A843]/10 border border-[#D4A843]/30 rounded-2xl p-4 mb-8 flex items-center gap-3">
          <span className="text-2xl">🚚</span>
          <div>
            <p className="font-bold text-[#1A1A1A]">
              {isAr ? (
                <>التوصيل <bdi dir="ltr">{prixCasa}</bdi> في الدار البيضاء خلال {delaiCasa}</>
              ) : (
                `Livraison ${prixCasa} à Casablanca, en ${delaiCasa}`
              )}
            </p>
            <p className="text-sm text-[#6B6B6B]">
              {isAr ? (
                <>لجميع مدن المغرب ابتداءً من <bdi dir="ltr">{prixVilles}</bdi> · استلام مجاني من المحل · طرد واحد لكل مشترياتك</>
              ) : (
                `Partout au Maroc dès ${prixVilles} · retrait gratuit en magasin · un seul colis pour tous vos articles`
              )}
            </p>
          </div>
          <Link href="/shop/boutique" className="ms-auto shrink-0 px-4 py-2 bg-[#D4A843] text-white text-sm font-bold rounded-xl hover:bg-[#b8922e] transition-colors">
            {isAr ? 'عرض الكل' : 'Voir tout'}
          </Link>
        </div>

        {/* Products grid */}
        {activeProducts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🛍️</p>
            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{isAr ? 'قريباً' : 'Bientôt disponible'}</h3>
            <p className="text-[#6B6B6B]">{isAr ? 'عروض جديدة قادمة قريباً!' : 'De nouvelles offres arrivent prochainement !'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {activeProducts.map(p => <PromoCard key={p.id} product={p} />)}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-black mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{isAr ? 'شاهد كل منتجاتنا' : 'Voir tous nos produits'}</h3>
          <p className="text-gray-400 mb-5">
            {isAr
              ? 'اكتشف كتالوجنا الكامل من خردوات الخياطة ولوازم النسيج'
              : 'Découvrez notre catalogue complet de mercerie et accessoires textiles'}
          </p>
          <Link href="/shop/boutique"
            className="inline-flex items-center gap-2 bg-[#C8102E] hover:bg-[#a00d25] text-white px-8 py-3 rounded-xl font-bold transition-colors">
            <ShoppingBag className="w-5 h-5" /> {isAr ? 'الدخول إلى المتجر' : 'Accéder à la boutique'}
          </Link>
        </div>
      </div>
    </div>
  );
}
