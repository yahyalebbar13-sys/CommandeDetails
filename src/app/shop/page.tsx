'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Truck, ShieldCheck, RotateCcw, MessageCircle,
  Zap, Package, Star, MapPin, ChevronRight,
  ArrowRight, Sparkles, Phone
} from 'lucide-react';
import { SHOP_CATEGORIES, getFeaturedProducts, getNewProducts } from '@/lib/shop-products-data';
import { FREE_DELIVERY_THRESHOLD, formatPrice } from '@/lib/shop-utils';
import ProductCard from '@/components/shop/ProductCard';

// ─── Intersection Observer Hook ───────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1800;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
          current = Math.min(current + increment, target);
          setCount(Math.floor(current));
          if (current >= target) clearInterval(timer);
        }, duration / steps);
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {count.toLocaleString('fr-MA')}{suffix}
    </span>
  );
}

// ─── Section Wrapper with reveal ─────────────────────────────────────────────
function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const FEATURED_PRODUCTS = getFeaturedProducts(8);
const NEW_PRODUCTS = getNewProducts(6);

const TRUST_BADGES = [
  { icon: <Truck className="w-4 h-4" />, label: 'Livraison rapide', desc: '24-48h Casa' },
  { icon: <ShieldCheck className="w-4 h-4" />, label: 'Paiement sécurisé', desc: 'Cash à la livraison' },
  { icon: <RotateCcw className="w-4 h-4" />, label: 'Retour 14 jours', desc: 'Satisfait ou remboursé' },
  { icon: <MessageCircle className="w-4 h-4" />, label: 'WhatsApp support', desc: 'Réponse en 30min' },
];

const HERO_CATEGORIES = [
  { icon: '🔒', name: 'Fermetures', stat: '+1200 réf', color: '#3B82F6', slug: 'fermetures-nylon' },
  { icon: '🔘', name: 'Boutons', stat: '+200 modèles', color: '#10B981', slug: 'boutons' },
  { icon: '〰️', name: 'Élastiques', stat: 'Toutes largeurs', color: '#F59E0B', slug: 'elastiques' },
  { icon: '🎀', name: 'Biais & Rubans', stat: '+50 couleurs', color: '#C8102E', slug: 'biais-rubans' },
];

const STATS = [
  { icon: <Truck className="w-8 h-8" />, value: 24, suffix: 'h', label: 'Livraison Casa', sub: '48h reste du Maroc', color: '#C8102E' },
  { icon: <Package className="w-8 h-8" />, value: 500, suffix: '+', label: 'Produits en stock', sub: 'Toutes catégories', color: '#D4A843' },
  { icon: <Star className="w-8 h-8" />, value: 47, suffix: '/50', label: 'Satisfaction client', sub: 'Basé sur 850+ avis', color: '#10B981' },
  { icon: <MapPin className="w-8 h-8" />, value: 100, suffix: '%', label: 'Maroc', sub: 'Fournisseur local', color: '#3B82F6' },
];

const TESTIMONIALS = [
  {
    name: 'Fatima Zahra B.',
    city: 'Casablanca',
    rating: 5,
    text: 'Qualité exceptionnelle des fermetures nylon, exactement ce que je cherchais pour mes créations. Livraison le lendemain à Casa, bravo LEBTEX !',
    avatar: 'https://picsum.photos/seed/fatima/80/80',
  },
  {
    name: 'Karima O.',
    city: 'Marrakech',
    rating: 5,
    text: 'Je commande régulièrement pour mon atelier de couture. Les prix sont très compétitifs et la qualité est constante. Le service WhatsApp est rapide et professionnel.',
    avatar: 'https://picsum.photos/seed/karima/80/80',
  },
  {
    name: 'Hassan M.',
    city: 'Rabat',
    rating: 4,
    text: 'Large gamme de produits mercerie, je trouve toujours ce qu\'il me faut. Les boutons pression sont excellents. Je recommande à tous les couturiers professionnels.',
    avatar: 'https://picsum.photos/seed/hassan/80/80',
  },
];

// ─── Page Component ───────────────────────────────────────────────────────────
export default function ShopPage() {
  return (
    <main className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: HERO                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="shop-hero-gradient relative min-h-screen flex items-center overflow-hidden">
        {/* Decorative radial gradients */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #C8102E 0%, transparent 70%)', transform: 'translate(-40%, -40%)' }}
          />
          <div
            className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #D4A843 0%, transparent 70%)', transform: 'translate(30%, 30%)' }}
          />
          {/* Geometric shapes */}
          <div className="absolute top-1/4 right-1/3 w-64 h-64 border border-white/5 rounded-full" />
          <div className="absolute top-1/3 right-1/4 w-48 h-48 border border-white/5 rounded-full" />
          <div className="absolute bottom-1/4 left-1/3 w-32 h-32 border border-[#D4A843]/10 rotate-45" />
        </div>

        <div className="relative z-10 container mx-auto px-6 lg:px-12 py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* ── Left: Copy ────────────────────────────────────── */}
            <div className="space-y-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4A843]/30 bg-[#D4A843]/10 backdrop-blur-sm">
                <span className="text-sm">🇲🇦</span>
                <span className="text-[#D4A843] text-sm font-semibold tracking-wide">N°1 Mercerie Maroc</span>
              </div>

              {/* Headline */}
              <div>
                <h1 className="font-display text-6xl lg:text-7xl xl:text-8xl font-black leading-none tracking-tight mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  <span className="text-white block">Qualité</span>
                  <span className="shop-gradient-text block">Professionnelle</span>
                </h1>
                <p className="text-gray-300 text-lg lg:text-xl leading-relaxed max-w-xl mt-4">
                  Votre fournisseur mercerie de confiance au Maroc. Fermetures, boutons, élastiques,
                  rubans — tout ce qu&apos;il vous faut pour des créations impeccables.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/shop/boutique"
                  className="shop-btn-press inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-base shadow-xl shadow-red-900/30 transition-all duration-200 hover:scale-105 hover:shadow-2xl"
                  style={{ background: 'linear-gradient(135deg, #C8102E, #a00d25)' }}
                >
                  <Sparkles className="w-5 h-5" />
                  Découvrir la boutique
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/shop/boutique?promo=true"
                  className="shop-btn-press inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-base border-2 border-[#D4A843] text-[#D4A843] hover:bg-[#D4A843] hover:text-[#0F0F0F] transition-all duration-200 backdrop-blur-sm"
                >
                  <Zap className="w-5 h-5" />
                  Voir les promos
                </Link>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                {TRUST_BADGES.map((badge, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <span className="text-[#D4A843] mt-0.5 flex-shrink-0">{badge.icon}</span>
                    <div>
                      <p className="text-white text-sm font-semibold leading-tight">{badge.label}</p>
                      <p className="text-gray-400 text-xs">{badge.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: Category Cards Grid ────────────────────── */}
            <div className="grid grid-cols-2 gap-4 lg:ml-8">
              {HERO_CATEGORIES.map((cat, i) => (
                <Link
                  key={cat.slug}
                  href={`/shop/categorie/${cat.slug}`}
                  className="group relative overflow-hidden rounded-2xl p-6 border border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/20 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div
                    className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-300"
                    style={{ background: `radial-gradient(circle, ${cat.color}, transparent)`, transform: 'translate(30%, -30%)' }}
                  />
                  <span className="text-4xl mb-4 block">{cat.icon}</span>
                  <h3 className="text-white font-bold text-base mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{cat.name}</h3>
                  <p className="text-gray-400 text-xs">{cat.stat}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold" style={{ color: cat.color }}>
                    Voir <ChevronRight className="w-3 h-3" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: PROMO BANNER                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden py-5"
        style={{ background: 'linear-gradient(135deg, #C8102E 0%, #a00d25 40%, #D4A843 100%)' }}
      >
        {/* Scrolling text */}
        <div className="overflow-hidden">
          <div className="shop-marquee-inner inline-flex gap-16 items-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <React.Fragment key={i}>
                <span className="text-white/90 font-bold text-sm uppercase tracking-widest whitespace-nowrap flex items-center gap-3">
                  <Truck className="w-4 h-4 text-white/70" />
                  Livraison GRATUITE dès {formatPrice(FREE_DELIVERY_THRESHOLD)}
                </span>
                <span className="text-white/40 text-lg">✦</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Full-width CTA */}
      <section
        className="py-12 text-center"
        style={{ background: 'linear-gradient(to right, #1a0508, #2d0d16)' }}
      >
        <RevealSection>
          <p className="text-white text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            🚚 Livraison <span className="shop-gradient-text">GRATUITE</span> dès {formatPrice(FREE_DELIVERY_THRESHOLD)}
          </p>
          <p className="text-gray-400 mb-6">Livraison disponible partout au Maroc — Casablanca, Rabat, Marrakech et +</p>
          <Link
            href="/shop/boutique"
            className="shop-btn-press inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-[#0F0F0F] transition-all duration-200 hover:scale-105 shadow-xl"
            style={{ background: 'linear-gradient(135deg, #D4A843, #e4be6a)' }}
          >
            Commandez maintenant <ArrowRight className="w-4 h-4" />
          </Link>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: CATEGORIES                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 lg:px-12">
        <div className="container mx-auto">
          <RevealSection>
            <div className="text-center mb-12">
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-[#C8102E]/10 text-[#C8102E] mb-4">
                Catalogue
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-[#0F0F0F] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Nos Catégories
              </h2>
              <p className="text-gray-500 max-w-xl mx-auto">
                Tout ce qu&apos;il vous faut pour la mercerie et la couture professionnelle
              </p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SHOP_CATEGORIES.map((cat, i) => (
              <RevealSection key={cat.id} delay={i * 60}>
                <Link
                  href={`/shop/categorie/${cat.slug}`}
                  className="group relative flex items-center gap-5 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  {/* Accent gradient */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl opacity-80"
                    style={{ background: cat.color }}
                  />
                  <div
                    className="absolute right-0 top-0 w-32 h-32 rounded-full opacity-5 group-hover:opacity-10 transition-opacity duration-300"
                    style={{ background: `radial-gradient(circle, ${cat.color}, transparent)`, transform: 'translate(40%, -40%)' }}
                  />

                  {/* Icon */}
                  <div
                    className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-sm"
                    style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}25` }}
                  >
                    {cat.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-bold text-[#0F0F0F] text-base mb-0.5 group-hover:transition-colors duration-200"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                      {cat.name}
                    </h3>
                    <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{cat.description}</p>
                  </div>

                  {/* Arrow */}
                  <ChevronRight
                    className="w-5 h-5 text-gray-300 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
                  />
                </Link>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: FEATURED PRODUCTS                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 lg:px-12 bg-[#FBF8F3]">
        <div className="container mx-auto">
          <RevealSection>
            <div className="flex items-end justify-between mb-12">
              <div>
                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-[#D4A843]/15 text-[#D4A843] mb-3">
                  Sélection
                </span>
                <h2 className="text-4xl lg:text-5xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Nos Produits <span className="shop-gradient-text">Phares</span>
                </h2>
              </div>
              <Link
                href="/shop/boutique"
                className="hidden sm:flex items-center gap-2 text-sm font-semibold text-[#C8102E] hover:gap-3 transition-all duration-200"
              >
                Voir tout <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </RevealSection>

          {FEATURED_PRODUCTS.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {FEATURED_PRODUCTS.map((product, i) => (
                <RevealSection key={product.id} delay={i * 50}>
                  <ProductCard product={product} showAddToCart={true} />
                </RevealSection>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Aucun produit mis en avant pour le moment.</p>
            </div>
          )}

          <div className="mt-10 text-center sm:hidden">
            <Link
              href="/shop/boutique"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-[#C8102E] text-white font-bold text-sm"
            >
              Voir tous les produits <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: WHY US (Stats)                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 lg:px-12" style={{ background: '#0F0F0F' }}>
        <div className="container mx-auto">
          <RevealSection>
            <div className="text-center mb-14">
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-white/10 text-[#D4A843] mb-4">
                Pourquoi nous choisir
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                La confiance, <span className="shop-gradient-text">ça se mérite</span>
              </h2>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STATS.map((stat, i) => (
              <RevealSection key={i} delay={i * 100}>
                <div className="relative p-7 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/8 transition-all duration-300 text-center group overflow-hidden">
                  <div
                    className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl"
                    style={{ background: `linear-gradient(to right, transparent, ${stat.color}, transparent)` }}
                  />
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-300"
                    style={{ background: `${stat.color}20`, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <div
                    className="text-5xl font-black mb-2"
                    style={{ fontFamily: 'Outfit, sans-serif', color: stat.color }}
                  >
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <p className="text-white font-bold text-base mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{stat.label}</p>
                  <p className="text-gray-500 text-xs">{stat.sub}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: NEW ARRIVALS                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 lg:px-12">
        <div className="container mx-auto">
          <RevealSection>
            <div className="flex items-end justify-between mb-12">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                    ✨ NEW
                  </span>
                  <span className="text-xs text-gray-400 font-medium">Arrivages récents</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Nouveautés
                </h2>
              </div>
              <Link
                href="/shop/boutique?nouveautes=true"
                className="hidden sm:flex items-center gap-2 text-sm font-semibold text-[#C8102E] hover:gap-3 transition-all duration-200"
              >
                Tout voir <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </RevealSection>

          {NEW_PRODUCTS.length > 0 ? (
            <>
              {/* Mobile: horizontal scroll */}
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory lg:hidden scrollbar-hide">
                {NEW_PRODUCTS.map((product) => (
                  <div key={product.id} className="snap-start flex-shrink-0 w-64">
                    <ProductCard product={product} showAddToCart={true} />
                  </div>
                ))}
              </div>
              {/* Desktop: grid */}
              <div className="hidden lg:grid grid-cols-2 xl:grid-cols-3 gap-5">
                {NEW_PRODUCTS.map((product, i) => (
                  <RevealSection key={product.id} delay={i * 70}>
                    <ProductCard product={product} showAddToCart={true} />
                  </RevealSection>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nouvelles arrivées bientôt disponibles.</p>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: TESTIMONIALS                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 lg:px-12 bg-[#FBF8F3]">
        <div className="container mx-auto">
          <RevealSection>
            <div className="text-center mb-14">
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-[#D4A843]/15 text-[#D4A843] mb-4">
                Témoignages
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Ils nous font confiance
              </h2>
              <p className="text-gray-500 mt-3">Plus de 850 clients satisfaits à travers le Maroc</p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <RevealSection key={i} delay={i * 100}>
                <div className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col gap-4 h-full">
                  {/* Stars */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, s) => (
                      <Star key={s} className="w-4 h-4 fill-[#D4A843] text-[#D4A843]" />
                    ))}
                    {Array.from({ length: 5 - t.rating }).map((_, s) => (
                      <Star key={s} className="w-4 h-4 text-gray-200" />
                    ))}
                  </div>

                  {/* Review text */}
                  <p className="text-gray-600 text-sm leading-relaxed flex-1 italic">
                    &ldquo;{t.text}&rdquo;
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <img
                      src={t.avatar}
                      alt={t.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-[#D4A843]/30"
                    />
                    <div>
                      <p className="font-bold text-[#0F0F0F] text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {t.city}
                      </p>
                    </div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 8: CTA WHATSAPP                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 lg:px-12 relative overflow-hidden" style={{ background: '#0F0F0F' }}>
        {/* Moroccan geometric pattern (CSS only) */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="moroccan" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                <polygon points="40,0 80,20 80,60 40,80 0,60 0,20" fill="none" stroke="#D4A843" strokeWidth="1"/>
                <polygon points="40,10 70,25 70,55 40,70 10,55 10,25" fill="none" stroke="#C8102E" strokeWidth="0.5"/>
                <circle cx="40" cy="40" r="8" fill="none" stroke="#D4A843" strokeWidth="0.8"/>
                <line x1="40" y1="0" x2="40" y2="10" stroke="#D4A843" strokeWidth="0.5"/>
                <line x1="40" y1="70" x2="40" y2="80" stroke="#D4A843" strokeWidth="0.5"/>
                <line x1="0" y1="40" x2="10" y2="40" stroke="#D4A843" strokeWidth="0.5"/>
                <line x1="70" y1="40" x2="80" y2="40" stroke="#D4A843" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#moroccan)"/>
          </svg>
        </div>

        {/* Glow effects */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(21, 128, 61, 0.08) 0%, transparent 60%)' }}
        />

        <div className="relative z-10 container mx-auto text-center max-w-2xl">
          <RevealSection>
            {/* WhatsApp icon */}
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-green-900/30"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
              <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
              </svg>
            </div>

            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-white/10 text-[#D4A843] mb-5">
              Service Client
            </span>
            <h2 className="text-4xl lg:text-5xl font-black text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Commandez par <span className="text-[#25D366]">WhatsApp</span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 leading-relaxed">
              Notre équipe répond en moins de 30 minutes. Conseil personnalisé,
              devis express et suivi de commande en temps réel.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://wa.me/212760998347"
                target="_blank"
                rel="noopener noreferrer"
                className="shop-btn-press inline-flex items-center justify-center gap-3 px-10 py-4 rounded-2xl text-white font-bold text-base shadow-2xl shadow-green-900/30 transition-all duration-200 hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
                </svg>
                Écrire sur WhatsApp
              </a>
              <a
                href="tel:+212760998347"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border-2 border-white/20 text-white font-bold text-base hover:bg-white/10 transition-all duration-200"
              >
                <Phone className="w-5 h-5" />
                +212 760 998 347
              </a>
            </div>

            {/* Trust line */}
            <p className="mt-8 text-gray-600 text-xs">
              🔒 Vos informations sont protégées — Paiement uniquement à la livraison
            </p>
          </RevealSection>
        </div>
      </section>

    </main>
  );
}
