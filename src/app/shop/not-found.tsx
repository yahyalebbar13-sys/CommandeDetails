"use client";

import Link from 'next/link';
import { Home, LayoutGrid, MessageCircle, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { getWhatsAppContact } from '@/lib/shop-utils';

// Page introuvable de la boutique (vraie 404) : produit ou rayon qui n'existe pas,
// ou plus. Affichée sous l'en-tête et le pied de page de la boutique, en français ou
// en arabe selon la langue choisie, avec trois sorties : accueil, rayons, WhatsApp.
export default function ShopNotFound() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const lienWhatsApp = getWhatsAppContact(
    ar
      ? 'مرحباً LEBTEX، أبحث عن منتج لم أجده في الموقع.'
      : 'Bonjour LEBTEX, je cherche un article que je ne trouve pas sur le site.'
  );

  return (
    <div className="min-h-[70vh] bg-[#FBF8F3] flex items-center justify-center px-4 py-16" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#C8102E]/10 flex items-center justify-center mx-auto mb-5">
          <Search className="w-8 h-8 text-[#C8102E]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0F0F0F] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {ar ? 'الصفحة غير موجودة' : 'Page introuvable'}
        </h1>
        <p className="text-[#3F3F3F] leading-relaxed mb-8">
          {ar
            ? 'هذا الرابط غير موجود أو لم يعد متوفراً. ربما سُحب المنتج، أو أن الرابط ناقص.'
            : "Cette adresse n'existe pas, ou plus. L'article a peut-être été retiré, ou le lien est incomplet."}
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/shop"
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors active:scale-95 touch-manipulation"
          >
            <Home className="w-5 h-5" />
            {ar ? 'العودة إلى الصفحة الرئيسية' : "Retour à l'accueil"}
          </Link>
          <Link
            href="/shop/categories"
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white text-[#0F0F0F] border border-[#E8E4DF] rounded-xl font-semibold hover:border-[#0F0F0F] transition-colors active:scale-95 touch-manipulation"
          >
            <LayoutGrid className="w-5 h-5" />
            {ar ? 'تصفح الفئات' : 'Voir les rayons'}
          </Link>
          <a
            href={lienWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#0F0F0F] text-white rounded-xl font-semibold hover:bg-black transition-colors active:scale-95 touch-manipulation"
          >
            <MessageCircle className="w-5 h-5 text-[#D4A843]" />
            {ar ? 'اسألنا على واتساب' : 'Nous demander sur WhatsApp'}
          </a>
        </div>
      </div>
    </div>
  );
}
