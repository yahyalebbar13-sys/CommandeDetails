'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Truck,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Package,
  Banknote,
  MapPin,
  MessageCircle,
  Layers,
  Zap,
  Scissors,
  LayoutGrid,
  Percent,
} from 'lucide-react';
import { formatPrice, getProductPromo } from '@/lib/shop-utils';
import { FRAIS_ZONE } from '@/lib/livraison-boutique';
import type { ShopCategory, ShopProduct } from '@/lib/shop-types';
import { texte } from '@/lib/shop-textes';
import { sansPrix } from '@/lib/shop-variantes';
import ProductCard from '@/components/shop/ProductCard';
import { melangerProduits, useGraineMelange } from '@/lib/melange-produits';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';

// Accueil grossiste (02/10/2026). Haut de page validé par le patron, rayons, PROMOTIONS
// (produits dont l'admin a saisi un « Prix barré »), une vitrine par grande famille
// (fermetures d'abord), commande en gros, puis TOUS les produits en grille (« Voir plus ») :
// l'accueil doit montrer beaucoup de produits (demande du 02/10/2026 au soir).

/** Produits par vitrine (une ligne qui défile). */
const MAX_VITRINE = 10;
/** La vitrine Promotions montre toutes les promotions, jusqu'à ce nombre. */
const MAX_PROMOS = 16;
/** Une vitrine de famille n'apparaît qu'à partir de ce nombre de produits. */
const MIN_VITRINE = 3;
/** Grille « Tous nos produits » : produits montrés d'abord, puis à chaque « Voir plus ». */
const PAS_GRILLE = 20;
const WHATSAPP = 'https://wa.me/212760998347';

// « Voir tout » des fermetures : une recherche, dans la langue du site (la boutique ne filtre
// qu'un rayon à la fois). « fermeture » seul ramenait aussi des agrafes, boutons pression et
// velcro (leur description dit « fermeture ») ; ces deux recherches donnent les 16 fermetures
// et curseurs du catalogue (copie du 02/10/2026), plus un ruban thermocollant, classé en dernier.
const RECHERCHE_FERMETURES = { fr: 'fermeture éclair', ar: 'سحاب' } as const;

// Un rayon de fermetures se reconnaît à son nom (à lui ou à son rayon parent) : le lien
// « fermetures-invisibles » mène aujourd'hui au rayon Tissus, on ne se fie pas aux liens.
function estRayonFermeture(rayon: ShopCategory, rayons: ShopCategory[]): boolean {
  if (/fermeture/i.test(rayon.name)) return true;
  const parent = rayon.parentSlug ? rayons.find(c => c.slug === rayon.parentSlug) : undefined;
  return !!parent && /fermeture/i.test(parent.name);
}

// Familles des vitrines, reconnues au nom du produit ou de son rayon (sans accents).
// Chaque produit n'apparaît que dans une vitrine ; l'ordre compte (fils avant accessoires,
// et « coupe-fils » exclu des fils pour rester un accessoire).
type Famille = {
  cle: string;
  titre: { fr: string; ar: string };
  sousTitre: { fr: string; ar: string };
  recherche: { fr: string; ar: string };
  motif: RegExp;
  exclure?: RegExp;
};
const FAMILLES: Famille[] = [
  {
    cle: 'fils',
    titre: { fr: 'Fils à coudre', ar: 'خيوط الخياطة' },
    sousTitre: { fr: 'Bobines, cônes et cannettes', ar: 'بكرات وكونات وكانيت' },
    recherche: { fr: 'fil', ar: 'خيط' },
    motif: /(^|[^a-z])(fil|fils|bobine|bobines|cannete|cannette|canette|monofilament)([^a-z]|$)/,
    exclure: /coupe-?fils?/,
  },
  {
    cle: 'tissus',
    titre: { fr: 'Doublures, entoilages et tissus', ar: 'البطانة والحشوات والأقمشة' },
    sousTitre: { fr: 'Au rouleau, pour ateliers et tailleurs', ar: 'باللفافة، للمعامل والخياطين' },
    recherche: { fr: 'doublure', ar: 'بطانة' },
    motif: /doublure|entoilage|viseline|thermocoll|popeline|feutrine|tissu|taffeta|crin/,
  },
  {
    cle: 'elastiques',
    titre: { fr: 'Élastiques, rubans et sangles', ar: 'المطاط والأشرطة والسانغل' },
    sousTitre: { fr: 'Élastiques, biais, scratch, sangles de tapissier', ar: 'مطاط، بياي، سكراتش، سانغل الطابسري' },
    recherche: { fr: 'élastique', ar: 'مطاط' },
    motif: /elastique|ruban|biais|passepoil|sangle|scratch|velcro|auto-?agrippant|moubra|velvet/,
  },
  {
    cle: 'accessoires',
    titre: { fr: 'Boutons et accessoires', ar: 'الأزرار والإكسسوارات' },
    sousTitre: { fr: 'Boutons, pressions, agrafes, outils de l’atelier', ar: 'أزرار، كبسولات، مشابك، أدوات المعمل' },
    recherche: { fr: 'bouton', ar: 'أزرار' },
    motif: /bouton|pression|agrafe|epingle|aiguille|ciseaux|coupe-?fils?|roulette|pistolet|colle|anneau|attache|presse|huile|applicateur|spray|strass|moule/,
  },
];

function sansAccents(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  subtitle,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {icon}
          <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {title}
          </h2>
        </div>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#C8102E] touch-manipulation"
        >
          {linkLabel} <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

// ─── Product rail: une ligne qui défile (flèches sur ordinateur) ─────────────
function ProductRail({ products }: { products: ShopProduct[] }) {
  const { language } = useLanguage();
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) => {
    const rail = railRef.current;
    // En arabe la ligne part de la droite : « suivant » défile vers la gauche
    const sens = rail && getComputedStyle(rail).direction === 'rtl' ? -1 : 1;
    if (rail) rail.scrollBy({ left: direction * sens * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="relative group/rail">
      <div
        ref={railRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-1"
      >
        {products.map((product) => (
          <div key={product.id} className="w-[44%] sm:w-[30%] lg:w-[18%] flex-shrink-0 snap-start">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      {products.length > 5 && (
        <>
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="hidden lg:flex absolute start-0 top-[38%] -translate-x-1/2 rtl:translate-x-1/2 w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-700 hover:text-[#C8102E] opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label={language === 'ar' ? 'المنتجات السابقة' : 'Produits précédents'}
          >
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="hidden lg:flex absolute end-0 top-[38%] translate-x-1/2 rtl:-translate-x-1/2 w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-700 hover:text-[#C8102E] opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label={language === 'ar' ? 'المنتجات التالية' : 'Produits suivants'}
          >
            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function AccueilBoutique() {
  const { t, language } = useLanguage();
  const { categories, products } = useShopProducts();
  // Vitrines mélangées à chaque visite, rayons alternés
  const graine = useGraineMelange();
  const isAr = language === 'ar';

  // Rayons principaux, fermetures en premier (l'article le plus demandé par les ateliers)
  const rayons = useMemo(() => {
    const racines = categories.filter(c => !c.parentSlug);
    return [...racines].sort(
      (a, b) => Number(estRayonFermeture(b, categories)) - Number(estRayonFermeture(a, categories))
    );
  }, [categories]);

  // Vitrines : fermetures, puis une par famille, puis la sélection. Chaque produit une seule
  // fois. Seulement des produits disponibles et chiffrés : jamais de « Prix sur demande » en
  // vitrine (ils restent dans la grille « Tous nos produits »).
  const vitrines = useMemo(() => {
    const montres = new Set<string>();
    const prendre = (liste: ShopProduct[], min = 1) => {
      const libres = liste.filter(p => !montres.has(p.id));
      if (libres.length < min) return [];
      const choisis = libres.slice(0, MAX_VITRINE);
      choisis.forEach(p => montres.add(p.id));
      return choisis;
    };
    const rayonsFermeture = new Set(
      categories.filter(c => estRayonFermeture(c, categories)).flatMap(c => [c.slug, c.id])
    );
    const dansFermetures = (p: ShopProduct) =>
      rayonsFermeture.has(p.categorySlug) || !!p.additionalCategorySlugs?.some(s => rayonsFermeture.has(s));
    const vendables = products.filter(p => p.inStock !== false && !sansPrix(p));
    const nomRayon = (p: ShopProduct) =>
      categories.find(c => c.slug === p.categorySlug || c.id === p.categorySlug)?.name ?? '';

    // Promotions d'abord : plus forte remise en premier
    const enPromo = vendables
      .filter(p => getProductPromo(p).active)
      .sort((a, b) => getProductPromo(b).percent - getProductPromo(a).percent)
      .slice(0, MAX_PROMOS);
    enPromo.forEach(p => montres.add(p.id));
    const remiseMax = enPromo.reduce((max, p) => Math.max(max, getProductPromo(p).percent), 0);

    const fermetures = prendre(melangerProduits(vendables.filter(dansFermetures), graine));
    const familles = FAMILLES.map(famille => ({
      famille,
      produits: prendre(
        melangerProduits(
          vendables.filter(p => {
            const nom = sansAccents(p.name);
            if (famille.exclure?.test(nom)) return false;
            return famille.motif.test(nom) || famille.motif.test(sansAccents(nomRayon(p)));
          }),
          graine
        ),
        MIN_VITRINE
      ),
    })).filter(v => v.produits.length > 0);
    const selection = prendre(melangerProduits(vendables.filter(p => p.isFeatured), graine), MIN_VITRINE);
    return { promotions: enPromo, remiseMax, fermetures, familles, selection };
  }, [categories, products, graine]);

  // Grille « Tous nos produits » : tout le catalogue visible, les produits chiffrés et
  // disponibles d'abord (mélangés à chaque visite), puis les « Prix sur demande ».
  const tousLesProduits = useMemo(() => {
    const estVendable = (p: ShopProduct) => p.inStock !== false && !sansPrix(p);
    return [
      ...melangerProduits(products.filter(estVendable), graine),
      ...melangerProduits(products.filter(p => !estVendable(p)), graine),
    ];
  }, [products, graine]);
  const [nbGrille, setNbGrille] = useState(PAS_GRILLE);

  // Plus de livraison offerte (30/09/2026) : on annonce le vrai prix, bas et clair.
  const prixCasa = formatPrice(FRAIS_ZONE.casablanca);
  const prixVilles = formatPrice(FRAIS_ZONE.standard);
  // Prix de gros et devis : WhatsApp prérempli dans la langue du site (jamais de remise annoncée)
  const lienPrixGros = `${WHATSAPP}?text=${encodeURIComponent(
    isAr
      ? 'السلام عليكم LEBTEX، أنا مهني وأريد ثمن الجملة للسلعة التالية: '
      : 'Bonjour LEBTEX, je suis un professionnel et je voudrais un prix de gros pour : '
  )}`;
  const lienDevis = `${WHATSAPP}?text=${encodeURIComponent(
    isAr
      ? 'السلام عليكم LEBTEX، أريد عرض سعر لهذه اللائحة (السلع والكميات): '
      : 'Bonjour LEBTEX, je voudrais un devis pour cette liste (articles et quantités) : '
  )}`;

  return (
    <main className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ═══ 1. HAUT DE PAGE : qui on est, pour qui, et les deux gestes utiles ═══ */}
      {/* Texte validé par le patron le 02/10/2026 */}
      <section className="relative overflow-hidden bg-[#0F0F0F]">
        <Image
          src="/hero-banner-new.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
          quality={70}
          sizes="100vw"
        />
        {/* Voile sombre : plein sur téléphone (texte lisible partout), dégradé côté texte sur ordinateur */}
        <div className="absolute inset-0 bg-[#0F0F0F]/75 sm:bg-transparent sm:bg-gradient-to-r sm:rtl:bg-gradient-to-l sm:from-[#0F0F0F]/85 sm:via-[#0F0F0F]/60 sm:to-transparent" />

        <div className="relative z-10 px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <div className="max-w-xl">
            <h1 className="text-[22px] sm:text-3xl lg:text-4xl font-black text-white leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {isAr ? 'خردوات الخياطة بالجملة والتقسيط' : 'Mercerie en gros et au détail'}
              {' — '}
              <span className="text-[#D4A843]">{isAr ? 'درب عمر، الدار البيضاء' : 'Derb Omar, Casablanca'}</span>
            </h1>
            <p className="mt-2 text-white/85 text-sm sm:text-base leading-snug">
              {isAr
                ? 'للمعامل والخياطين والطابسيين ومحلات الخردوات · التوصيل لجميع مدن المغرب · الدفع عند الاستلام'
                : 'Ateliers, tailleurs, tapissiers, merceries · Livraison partout au Maroc · Paiement à la livraison'}
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <Link
                href="/shop/boutique"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C8102E] hover:bg-[#a00d25] text-white font-bold text-sm shadow-lg touch-manipulation"
              >
                {isAr ? 'تصفح المتجر' : 'Voir la boutique'} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
              <a
                href={lienPrixGros}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-white/40 bg-white/10 hover:bg-white/20 text-white font-bold text-sm touch-manipulation"
              >
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                {isAr ? 'اطلب ثمن الجملة' : 'Demander un prix de gros'}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. BANDEAU LIVRAISON : Casablanca et le reste du Maroc ═══ */}
      <div className="bg-[#C8102E] py-2.5 px-4">
        <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1.5 text-white text-xs font-bold text-center">
          <span className="flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            {isAr ? (
              <span>
                التوصيل <bdi dir="ltr">{prixCasa}</bdi> في الدار البيضاء · من <bdi dir="ltr">{prixVilles}</bdi> لباقي مدن المغرب
              </span>
            ) : (
              <span>Livraison {prixCasa} à Casablanca · dès {prixVilles} ailleurs au Maroc</span>
            )}
          </span>
          <span className="hidden sm:flex items-center gap-1.5 font-normal text-white/85">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {isAr ? 'استلام مجاني من المحل' : 'Retrait gratuit en magasin'}
          </span>
        </div>
      </div>

      {/* ═══ 3. RAYONS (défilent sur téléphone), fermetures d'abord ═══ */}
      <section className="py-5 px-4 sm:px-6 lg:px-12 bg-white border-b border-gray-100">
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory lg:flex-wrap lg:justify-center">
          {rayons.map((cat) => {
            const nomCat = texte(cat, 'name', language) || cat.name;
            return (
              <Link
                key={cat.id}
                href={`/shop/categorie/${cat.slug}`}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 snap-start group touch-manipulation"
                style={{ minWidth: '72px' }}
              >
                <div
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-[#C8102E] shadow-sm"
                  style={{ background: `${cat.color}15` }}
                >
                  {cat.image ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={cat.image as string}
                        alt={nomCat}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-lg font-bold" style={{ color: cat.color }}>{nomCat.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-gray-700 text-center leading-tight line-clamp-2 max-w-[72px]">
                  {nomCat}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ═══ 3 bis. PROMOTIONS : prix barré saisi dans l'admin (vrai ancien prix) ═══ */}
      {vitrines.promotions.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto rounded-2xl bg-white border-2 border-[#C8102E]/15 p-3 sm:p-4">
            <SectionHeader
              icon={
                <span className="w-7 h-7 rounded-lg bg-[#C8102E] flex items-center justify-center">
                  <Percent className="w-4 h-4 text-white" />
                </span>
              }
              title={isAr ? 'العروض' : 'Promotions'}
              subtitle={
                vitrines.remiseMax > 0
                  ? isAr
                    ? `تخفيض يصل إلى ${vitrines.remiseMax}%`
                    : `Jusqu'à -${vitrines.remiseMax} %`
                  : undefined
              }
              href="/shop/promotions"
              linkLabel={isAr ? 'كل العروض' : 'Toutes les promos'}
            />
            <ProductRail products={vitrines.promotions} />
          </div>
        </section>
      )}

      {/* ═══ 4. VITRINE : FERMETURES ═══ */}
      {vitrines.fermetures.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Layers className="w-5 h-5 text-[#C8102E]" />}
              title={isAr ? 'السحابات' : 'Fermetures éclair'}
              subtitle={isAr ? 'نايلون، بلاستيك، معدن — بالحزمة وباللفافة' : 'Nylon, plastique, métal — en lots et en rouleaux'}
              href={`/shop/boutique?q=${encodeURIComponent(RECHERCHE_FERMETURES[language])}`}
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductRail products={vitrines.fermetures} />
          </div>
        </section>
      )}

      {/* ═══ 5. VITRINES PAR FAMILLE ═══ */}
      {vitrines.familles.map(({ famille, produits }) => (
        <section key={famille.cle} className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Scissors className="w-5 h-5 text-[#C8102E]" />}
              title={famille.titre[language]}
              subtitle={famille.sousTitre[language]}
              href={`/shop/boutique?q=${encodeURIComponent(famille.recherche[language])}`}
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductRail products={produits} />
          </div>
        </section>
      ))}

      {/* ═══ 5 bis. VITRINE : NOTRE SÉLECTION (ce qui n'est pas déjà montré) ═══ */}
      {vitrines.selection.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Zap className="w-5 h-5 text-[#D4A843]" />}
              title={isAr ? 'مختاراتنا' : 'Notre sélection'}
              href="/shop/boutique"
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductRail products={vitrines.selection} />
          </div>
        </section>
      )}

      {/* ═══ 6. COMMANDE EN GROS : un devis sur WhatsApp ═══ */}
      {/* Pas de prix dégressifs automatiques ni de remise : un devis, demandé sur WhatsApp */}
      <section className="px-4 sm:px-6 lg:px-12 pt-6">
        <div
          className="rounded-2xl overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-5 sm:px-6"
          style={{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)' }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#D4A843]/15 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-[#D4A843]" />
            </div>
            <div>
              <p className="text-white font-black text-sm sm:text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {isAr ? 'طلبيات الجملة — للمعامل والتجار' : 'Commande en gros — ateliers et revendeurs'}
              </p>
              <p className="text-gray-300 text-xs mt-0.5">
                {isAr
                  ? 'أرسل لائحتك (السلع والكميات) على واتساب، ونرد عليك بعرض سعر.'
                  : 'Envoyez votre liste (articles et quantités) sur WhatsApp : nous vous répondons avec un devis.'}
              </p>
            </div>
          </div>
          <a
            href={lienDevis}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 py-2.5 rounded-xl text-[#0F0F0F] font-bold text-sm touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #D4A843, #e4be6a)' }}
          >
            <MessageCircle className="w-4 h-4" />
            {isAr ? 'اطلب عرض سعر' : 'Demander un devis'}
          </a>
        </div>
      </section>

      {/* ═══ 6 bis. TOUS NOS PRODUITS : grille, « Voir plus » ═══ */}
      {tousLesProduits.length > 0 && (
        <section className="pt-8 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<LayoutGrid className="w-5 h-5 text-[#C8102E]" />}
              title={isAr ? 'كل منتجاتنا' : 'Tous nos produits'}
              subtitle={isAr ? `${tousLesProduits.length} منتج` : `${tousLesProduits.length} produits`}
              href="/shop/boutique"
              linkLabel={isAr ? 'المتجر' : 'Boutique'}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {tousLesProduits.slice(0, nbGrille).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {nbGrille < tousLesProduits.length && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setNbGrille(n => n + PAS_GRILLE)}
                  className="inline-flex items-center gap-2 min-h-[44px] px-6 py-2.5 rounded-xl bg-[#0F0F0F] hover:bg-[#2a2a2a] text-white font-bold text-sm touch-manipulation"
                >
                  {isAr
                    ? `عرض المزيد (${tousLesProduits.length - nbGrille})`
                    : `Voir plus de produits (${tousLesProduits.length - nbGrille})`}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ 7. RÉASSURANCE : paiement et retrait ═══ */}
      {/* Livraison et retour 14 jours sont déjà dans la bande du pied de page, juste en dessous
          (et les prix de livraison dans le bandeau rouge) : pas deux fois à la suite. */}
      <section className="px-4 sm:px-6 lg:px-12 pt-6">
        <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
          {[
            {
              icon: <Banknote className="w-5 h-5 text-emerald-600" />,
              title: isAr ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
              text: isAr ? 'نقداً عند التوصيل أو عند الاستلام من المحل' : 'En espèces, à la livraison ou au retrait en magasin',
            },
            {
              icon: <MapPin className="w-5 h-5 text-[#D4A843]" />,
              title: isAr ? 'استلام مجاني' : 'Retrait gratuit',
              text: isAr ? 'من محلاتنا في الدار البيضاء' : 'Dans nos magasins de Casablanca',
            },
          ].map(({ icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl bg-white border border-gray-100 p-3 sm:p-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-xl bg-[#FBF8F3] flex items-center justify-center">{icon}</div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0F0F0F] leading-tight">{title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="px-4 py-6 text-center">
        <Link
          href="/shop/boutique"
          className="inline-flex items-center gap-2 min-h-[44px] px-6 py-2.5 rounded-xl border-2 border-[#C8102E] text-[#C8102E] font-bold text-sm hover:bg-[#C8102E] hover:text-white touch-manipulation"
        >
          {t('all_products')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>

    </main>
  );
}
