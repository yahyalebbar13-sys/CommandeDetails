'use client';

// ─── Secteurs d'activité : une carte par métier ─────────────────────────────
// Sur le modèle des « scénarios » d'un grossiste : chaque carte (mosaïque de photos de
// produits, nom, accroche, nombre d'articles) mène à la page du secteur. Les secteurs et
// leurs produits viennent de lib/secteurs-boutique (seulement ceux qui ont assez de
// produits avec prix) ; 2 colonnes sur téléphone, 3 sur ordinateur.

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Briefcase, MessageCircle, ShoppingBag } from 'lucide-react';
import { CarteSecteur } from '@/components/shop/CartesSecteurs';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { lienPage } from '@/lib/liens-boutique';
import { secteursVisibles } from '@/lib/secteurs-boutique';
import { getWhatsAppContact } from '@/lib/shop-utils';

export default function SecteursPage() {
  const { t, language } = useLanguage();
  const isAr = language === 'ar';
  const { products, categories } = useShopProducts();
  const secteurs = useMemo(() => secteursVisibles(products, categories), [products, categories]);

  const lienAutreMetier = getWhatsAppContact(
    isAr
      ? 'السلام عليكم LEBTEX، أبحث عن لوازم لحرفتي: '
      : 'Bonjour LEBTEX, je cherche des fournitures pour mon métier : '
  );

  return (
    <div className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ─── Bandeau ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0F0F0F]">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 15% 40%, #C8102E 0%, transparent 45%), radial-gradient(circle at 85% 10%, #D4A843 0%, transparent 40%)' }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
          {/* « › » est un signe miroir : le navigateur l'affiche « ‹ » en arabe */}
          <nav className="flex items-center gap-1.5 text-[11px] text-white/55 mb-2">
            <Link href={lienPage('/shop', language)} className="hover:text-white transition-colors">
              {isAr ? 'الرئيسية' : 'Accueil'}
            </Link>
            <span>›</span>
            <span className="text-white/85">{t('secteurs_titre')}</span>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#C8102E] flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-white" />
            </span>
            <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('secteurs_titre')}
            </h1>
          </div>
          <p className="mt-2 text-white/80 text-sm sm:text-base">{t('secteurs_phrase')}</p>
        </div>
      </section>

      {/* ─── Cartes ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {secteurs.map(s => (
            <CarteSecteur key={s.secteur.slug} rempli={s} />
          ))}
        </div>

        {/* ─── Un autre métier : WhatsApp, ou toute la boutique ─────────── */}
        <div className="mt-8 sm:mt-12 rounded-2xl bg-white border border-[#E8E4DF] p-5 sm:p-6 text-center">
          <p className="font-bold text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {isAr ? 'حرفتك غير موجودة في اللائحة؟' : "Votre métier n'est pas dans la liste ?"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {isAr
              ? 'أرسل لنا ما تحتاجه على واتساب، أو تصفح كل منتجات المتجر.'
              : 'Dites-nous sur WhatsApp ce dont vous avez besoin, ou parcourez toute la boutique.'}
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2.5 justify-center">
            <a
              href={lienAutreMetier}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5a] text-white font-bold text-sm touch-manipulation"
            >
              <MessageCircle className="w-4 h-4" />
              {isAr ? 'راسلنا على واتساب' : 'Écrire sur WhatsApp'}
            </a>
            <Link
              href={lienPage('/shop/boutique', language)}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border-2 border-[#C8102E] text-[#C8102E] hover:bg-[#C8102E] hover:text-white font-bold text-sm transition-colors touch-manipulation"
            >
              <ShoppingBag className="w-4 h-4" />
              {t('all_products')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
