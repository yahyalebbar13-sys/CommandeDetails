"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Phone,
  Truck,
  Home,
} from "lucide-react";
import { useShopCart } from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import { useShopProducts } from "@/contexts/shop-products-context";
import SmartSearch from "@/components/shop/SmartSearch";
import { MEGA_MENU_CURATED_DATA } from "@/lib/shop-mega-menu-data";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NavLink {
  labelKey: string;
  href: string;
  hasDropdown?: boolean;
  isMoreDropdown?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { labelKey: "nav_home", href: "/shop" },
  { labelKey: "nav_categories", href: "/shop/categories", hasDropdown: true },
  { labelKey: "nav_shop", href: "/shop/boutique" },
  { labelKey: "nav_promos", href: "/shop/promotions" },
  { labelKey: "nav_precommande", href: "/shop/precommande" },
  { labelKey: "nav_boutiques", href: "/shop/a-propos" },
  { labelKey: "nav_more", href: "#", isMoreDropdown: true },
];

const MORE_LINKS = [
  { labelKey: "nav_tracking", href: "/shop/suivi" },
  { labelKey: "nav_contact", href: "/shop/contact" },
];

const PROMO_TEXT_FR =
  "🚚 Livraison GRATUITE dès 500 MAD\u00a0\u00a0|\u00a0\u00a0📦 Commande avant 14h → Expédition le jour même\u00a0\u00a0|\u00a0\u00a0💬 WhatsApp: +212 760 998 347\u00a0\u00a0|\u00a0\u00a0🇲🇦 Livraison partout au Maroc";

const PROMO_TEXT_AR =
  "🚚 توصيل مجاني من 500 درهم\u00a0\u00a0|\u00a0\u00a0📦 اطلب قبل 2 ظهرا → التوصيل نفس اليوم\u00a0\u00a0|\u00a0\u00a0💬 واتساب: 0760998347\u00a0\u00a0|\u00a0\u00a0🇲🇦 توصيل لجميع أنحاء المغرب";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShopHeader() {
  const { itemCount, openCart } = useShopCart();
  const { t, language, setLanguage } = useLanguage();
  const { categories: allContextCategories, products: allProducts } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);
  const pathname = usePathname();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileCategoriesOpen, setIsMobileCategoriesOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hoveredCatSlug, setHoveredCatSlug] = useState<string>('');
  const [menuStyle, setMenuStyle] = useState<{ left: number; notchLeft: number }>({ left: -220, notchLeft: 260 });

  const activeCategory = (hoveredCatSlug ? SHOP_CATEGORIES.find(c => c.slug === hoveredCatSlug) : null) || SHOP_CATEGORIES[0] || null;

  const activeCategoryItems = useMemo(() => {
    if (!activeCategory) return [];

    const subcats = allContextCategories.filter((c) => c.parentSlug === activeCategory.slug);
    const prods = (allProducts || []).filter(
      (p) =>
        p.categorySlug === activeCategory.slug ||
        p.additionalCategorySlugs?.includes(activeCategory.slug) ||
        p.categoryAliases?.some((a) => a.slug === activeCategory.slug) ||
        subcats.some((s) => s.slug === p.categorySlug)
    );
    const curated = MEGA_MENU_CURATED_DATA[activeCategory.slug] || [];

    const items: Array<{
      id: string;
      name: string;
      href: string;
      image?: string;
      isHot?: boolean;
      icon?: string;
    }> = [];

    // Real products
    prods.forEach((p) => {
      items.push({
        id: `prod-${p.id}`,
        name: language === 'ar' ? (p.nameAr || p.name) : p.name,
        href: `/shop/produit/${p.id}`,
        image: p.images?.[0] || activeCategory.image,
        isHot: Boolean(p.isFeatured || p.isPromo),
      });
    });

    // Subcategories
    subcats.forEach((s) => {
      items.push({
        id: `sub-${s.id}`,
        name: language === 'ar' ? (s.nameAr || s.name) : s.name,
        href: `/shop/categorie/${s.slug}`,
        image: s.image || activeCategory.image,
        isHot: Boolean(s.priority && s.priority >= 80),
        icon: s.icon,
      });
    });

    // Curated items to complete grid up to 10 items
    if (items.length < 10 && curated.length > 0) {
      const existingNames = new Set(items.map((i) => i.name.toLowerCase()));
      curated.forEach((c) => {
        const displayName = language === 'ar' ? c.nameAr : c.name;
        if (!existingNames.has(displayName.toLowerCase()) && items.length < 10) {
          items.push({
            id: `cur-${c.id}`,
            name: displayName,
            href: c.href || `/shop/boutique?q=${encodeURIComponent(c.name)}`,
            image: c.image || activeCategory.image,
            isHot: c.isHot,
          });
          existingNames.add(displayName.toLowerCase());
        }
      });
    }

    return items;
  }, [activeCategory, allContextCategories, allProducts, language]);

  // Dynamic position updater for Mega Menu & Notch
  useEffect(() => {
    if (!isCategoriesOpen || !dropdownRef.current) return;
    const updatePosition = () => {
      if (!dropdownRef.current) return;
      const btnRect = dropdownRef.current.getBoundingClientRect();
      const btnCenter = btnRect.left + btnRect.width / 2;
      const menuWidth = Math.min(940, window.innerWidth - 32);

      let idealOffset = language === 'ar' ? menuWidth - 220 : 220;
      let targetScreenLeft = btnCenter - idealOffset;

      if (targetScreenLeft < 16) targetScreenLeft = 16;
      if (targetScreenLeft + menuWidth > window.innerWidth - 16) {
        targetScreenLeft = window.innerWidth - 16 - menuWidth;
      }

      const relativeLeft = targetScreenLeft - btnRect.left;
      const notchOffset = btnCenter - targetScreenLeft;
      setMenuStyle({ left: relativeLeft, notchLeft: notchOffset });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [isCategoriesOpen, language]);

  // ── Scroll detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Close mobile menu on route change ────────────────────────────────────
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSearchOpen(false);
    setIsCategoriesOpen(false);
    setIsMoreOpen(false);
  }, [pathname]);

  // ── Focus search input when opened ───────────────────────────────────────
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [isSearchOpen]);

  // ── Close dropdown when clicking outside ─────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsCategoriesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Lock body scroll on mobile menu ──────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        window.location.href = `/shop/boutique?q=${encodeURIComponent(
          searchQuery.trim()
        )}`;
      }
    },
    [searchQuery]
  );

  const isActive = (href: string) => {
    if (href === "/shop") return pathname === "/shop";
    return pathname?.startsWith(href);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main Header ──────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-white shadow-[0_2px_20px_rgba(0,0,0,0.08)] border-b border-gray-100"
            : "bg-white border-b border-gray-100"
        }`}
      >
        {/* ── Desktop Collapsible Header Section ──────────────────────────── */}
        <div className={`transition-all duration-200 ease-in-out origin-top ${isScrolled ? 'lg:max-h-0 lg:opacity-0 lg:overflow-hidden' : 'max-h-[500px] opacity-100'}`}>
          {/* ── Promo Banner ──────────────────────────────────────────────── */}
          <div
            className="text-white text-xs font-medium py-2 overflow-hidden select-none"
            style={{ backgroundColor: "#C8102E" }}
          >
            <div className="shop-marquee-inner inline-flex items-center gap-0">
              <span className="pr-8">{language === 'ar' ? PROMO_TEXT_AR : PROMO_TEXT_FR}</span>
              <span className="pr-8">{language === 'ar' ? PROMO_TEXT_AR : PROMO_TEXT_FR}</span>
            </div>
          </div>

          {/* ── Top Row: Logo, Search, Actions ────────────────────────────── */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-24 gap-4 lg:gap-8">
            {/* ── Logo ──────────────────────────────────────────────────── */}
            <Link
              href="/shop"
              className="flex-shrink-0 group"
              aria-label="LEBTEX - Accueil"
            >
              <img
                src="/logo.png"
                alt="LEBTEX Mercerie"
                className="h-16 lg:h-[85px] w-auto transition-opacity group-hover:opacity-80"
                style={{ maxWidth: '300px', objectFit: 'contain' }}
              />
            </Link>

            {/* ── Desktop Smart Search Bar ────────────────────────── */}
            <SmartSearch variant="desktop" />

            {/* ── Right Actions ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1 sm:gap-2">
              
              {/* Language Toggle */}
              <button
                onClick={() => setLanguage(language === 'fr' ? 'ar' : 'fr')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] hover:bg-red-50 transition-all cursor-pointer"
                aria-label={language === 'fr' ? 'Passer en arabe' : 'التبديل إلى الفرنسية'}
              >
                <span className="text-base">{language === 'ar' ? '🇲🇦' : '🇫🇷'}</span>
                <span className="hidden sm:inline-block uppercase font-bold">{language === 'ar' ? 'AR' : 'FR'}</span>
              </button>

              {/* Search Toggle - Mobile/Tablet only */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="lg:hidden p-2.5 rounded-xl text-gray-600 hover:text-[#C8102E] hover:bg-gray-50 transition-all cursor-pointer"
                aria-label="Rechercher"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* WhatsApp - desktop only */}
              <a
                href="https://wa.me/212760998347"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-[#10B981] hover:text-[#10B981] hover:bg-green-50 transition-all"
              >
                <Phone className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>

              {/* Cart Button */}
              <button
                onClick={openCart}
                className="relative p-2.5 rounded-xl text-gray-700 hover:text-[#C8102E] hover:bg-red-50 transition-all group cursor-pointer"
                aria-label={`Panier — ${itemCount} article${itemCount !== 1 ? "s" : ""}`}
              >
                <ShoppingCart className="w-6 h-6 transition-transform group-hover:scale-110" />
                {itemCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 shop-badge-pulse"
                    style={{ backgroundColor: "#C8102E" }}
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </button>

              {/* Mobile hamburger */}
              <button
                onClick={() => setIsMobileMenuOpen((v) => !v)}
                className="lg:hidden p-2.5 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Menu"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* ── Bottom Row: Navigation Bar (Desktop Only) ────────────────── */}
        <div className="hidden lg:block border-t border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center h-14 relative">
              {/* Centered nav links */}
              <div className="flex-1 flex items-center justify-center gap-10 lg:gap-20">
              {NAV_LINKS.map((link) =>
                link.hasDropdown ? (
                  <div key={link.labelKey} ref={dropdownRef} className="relative h-full flex items-center">
                    {/* ── Temu-style Categories Pill Button ── */}
                    <button
                      type="button"
                      onClick={() => setIsCategoriesOpen((v) => !v)}
                      className={`px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none border ${
                        isCategoriesOpen
                          ? "bg-neutral-200 text-neutral-950 border-neutral-300 shadow-inner"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 hover:text-neutral-950 border-neutral-200/70"
                      }`}
                      aria-expanded={isCategoriesOpen}
                    >
                      <span>{t(link.labelKey)}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isCategoriesOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* ── Temu-style 2-Column Mega Menu Dropdown ────────────────────── */}
                    {isCategoriesOpen && (
                      <div
                        onMouseLeave={() => setIsCategoriesOpen(false)}
                        style={{
                          left: `${menuStyle.left}px`,
                          width: "min(940px, calc(100vw - 32px))",
                        }}
                        className="absolute top-[calc(100%+6px)] bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2),0_10px_25px_-5px_rgba(0,0,0,0.08)] border border-neutral-200/90 z-50 overflow-hidden animate-in fade-in-0 duration-150"
                      >
                        {/* Triangular Notch indicator pointing directly to the button */}
                        <div
                          className="absolute -top-1.5 w-3.5 h-3.5 bg-white border-t border-l border-neutral-200/90 rotate-45 z-30 pointer-events-none -translate-x-1/2"
                          style={{ left: `${menuStyle.notchLeft}px` }}
                        />

                        {/* 2-Column Grid */}
                        <div className="grid grid-cols-12 h-[480px]">
                          {/* ── Left Column: Categories List (Temu-style) ── */}
                          <div className="col-span-4 bg-neutral-50/75 border-r border-neutral-200/70 py-3 overflow-y-auto shop-scrollbar">
                            <div className="px-4 pb-2 mb-1 border-b border-neutral-200/60 flex items-center justify-between">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                {t('nav_categories')}
                              </p>
                              <span className="text-[11px] text-neutral-400 font-semibold">
                                {SHOP_CATEGORIES.length}
                              </span>
                            </div>

                            <div className="space-y-0.5 px-2">
                              {SHOP_CATEGORIES.map((cat) => {
                                const isSelected = (activeCategory?.slug === cat.slug);
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onMouseEnter={() => setHoveredCatSlug(cat.slug)}
                                    onClick={() => {
                                      setIsCategoriesOpen(false);
                                      window.location.href = `/shop/categorie/${cat.slug}`;
                                    }}
                                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left font-medium text-xs sm:text-sm transition-all duration-150 cursor-pointer ${
                                      isSelected
                                        ? "bg-white text-neutral-950 font-bold shadow-xs border-l-4 border-[#C8102E] rtl:border-l-0 rtl:border-r-4"
                                        : "text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100/80 border-l-4 border-transparent rtl:border-l-0 rtl:border-r-4"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate pr-2">
                                      <span className="text-base flex-shrink-0">{cat.icon || '🧵'}</span>
                                      <span className="truncate">
                                        {language === 'ar' ? (cat.nameAr || cat.name) : cat.name}
                                      </span>
                                    </div>
                                    <ChevronRight
                                      className={`w-4 h-4 flex-shrink-0 transition-transform ${
                                        isSelected ? "text-[#C8102E] translate-x-0.5" : "text-neutral-400"
                                      } rtl:rotate-180`}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* ── Right Column: Active Category Showcase (Temu-style) ── */}
                          <div className="col-span-8 bg-white p-6 overflow-y-auto shop-scrollbar flex flex-col justify-between">
                            <div>
                              {/* Top Header Link: "Tout [Nom Catégorie] >" */}
                              {activeCategory && (
                                <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-100">
                                  <Link
                                    href={`/shop/categorie/${activeCategory.slug}`}
                                    onClick={() => setIsCategoriesOpen(false)}
                                    className="inline-flex items-center gap-1.5 text-base font-bold text-neutral-900 hover:text-[#C8102E] transition-colors group cursor-pointer"
                                  >
                                    <span>
                                      {language === 'ar'
                                        ? `جميع ${activeCategory.nameAr || activeCategory.name}`
                                        : `Tout ${activeCategory.name}`}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-[#C8102E] group-hover:translate-x-1 transition-all rtl:rotate-180" />
                                  </Link>

                                  <Link
                                    href="/shop/categories"
                                    onClick={() => setIsCategoriesOpen(false)}
                                    className="text-xs font-semibold text-neutral-500 hover:text-[#C8102E] transition-colors flex items-center gap-1"
                                  >
                                    {language === 'ar' ? 'عرض كل الكتالوج' : 'Voir tout le catalogue'}
                                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                                  </Link>
                                </div>
                              )}

                              {/* Circular Items Grid (5 columns per row, Temu style) */}
                              <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-3 gap-y-5">
                                {activeCategoryItems.map((item) => (
                                  <Link
                                    key={item.id}
                                    href={item.href}
                                    onClick={() => setIsCategoriesOpen(false)}
                                    className="group flex flex-col items-center cursor-pointer text-center"
                                  >
                                    {/* Circle Container */}
                                    <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full overflow-hidden bg-neutral-100 border border-neutral-200 group-hover:border-[#C8102E] relative flex items-center justify-center transition-all duration-200 group-hover:scale-105 shadow-2xs group-hover:shadow-md">
                                      {item.image ? (
                                        <Image
                                          src={item.image}
                                          alt={item.name}
                                          fill
                                          sizes="88px"
                                          className="object-cover group-hover:scale-110 transition-transform duration-300"
                                        />
                                      ) : (
                                        <span className="text-2xl">{item.icon || activeCategory?.icon || '🧵'}</span>
                                      )}

                                      {/* Orange HOT Badge */}
                                      {item.isHot && (
                                        <span className="absolute top-0.5 right-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xs uppercase tracking-tight z-10 ring-1 ring-white">
                                          HOT
                                        </span>
                                      )}
                                    </div>

                                    {/* Centered 2-line Label */}
                                    <span className="mt-2 text-xs font-semibold text-neutral-800 group-hover:text-[#C8102E] text-center line-clamp-2 max-w-[95px] leading-tight transition-colors">
                                      {item.name}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>

                            {/* Bottom Footer Bar */}
                            {activeCategory && (
                              <div className="pt-4 mt-4 border-t border-neutral-100 flex items-center justify-between">
                                <span className="text-xs text-neutral-500 font-medium">
                                  {language === 'ar'
                                    ? '🚚 توصيل سريع لجميع أنحاء المغرب'
                                    : '🚚 Expédition rapide partout au Maroc'}
                                </span>
                                <Link
                                  href={`/shop/categorie/${activeCategory.slug}`}
                                  onClick={() => setIsCategoriesOpen(false)}
                                  className="text-xs font-bold text-[#C8102E] hover:underline flex items-center gap-1"
                                >
                                  {language === 'ar' ? 'استكشاف المزيد' : 'Découvrir la sélection'}
                                  <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : link.isMoreDropdown ? (
                  <div key={link.labelKey} className="relative h-full flex items-center">
                    <button
                      onClick={() => setIsMoreOpen((v) => !v)}
                      className={`flex items-center gap-1.5 h-full text-sm font-semibold transition-all duration-200 border-b-2 border-transparent text-gray-700 hover:text-[#C8102E] cursor-pointer`}
                    >
                      {t(link.labelKey)}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isMoreOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isMoreOpen && (
                      <div
                        onMouseLeave={() => setIsMoreOpen(false)}
                        className="absolute top-full right-0 mt-0 w-48 bg-white rounded-b-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-t-0 border-gray-100 p-2 z-50 flex flex-col gap-1"
                      >
                        {MORE_LINKS.map(ml => (
                           <Link key={ml.labelKey} href={ml.href} onClick={() => setIsMoreOpen(false)} className="px-3 py-2 text-sm font-semibold text-gray-700 hover:text-[#C8102E] hover:bg-gray-50 rounded-lg transition-colors">
                             {t(ml.labelKey)}
                           </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={link.labelKey}
                    href={link.href}
                    className={`flex items-center gap-1.5 h-full text-sm font-semibold transition-all duration-200 border-b-2 ${
                      isActive(link.href)
                        ? "border-[#C8102E] text-[#C8102E]"
                        : "border-transparent text-gray-700 hover:text-[#C8102E]"
                    }`}
                  >
                    {link.labelKey === 'nav_home' && <Home className="w-4 h-4 mb-[2px]" />}
                    {t(link.labelKey)}
                  </Link>
                )
              )}
              </div>

              {/* ── Mini Actions (right side, visible on scroll) ────────────── */}
              <div className={`flex items-center gap-4 ml-auto transition-opacity duration-200 ${isScrolled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                 <button
                   onClick={() => setIsSearchOpen(true)}
                   className="p-2 text-gray-600 hover:text-[#C8102E] transition-colors cursor-pointer"
                   aria-label="Rechercher"
                 >
                   <Search className="w-5 h-5" />
                 </button>
                 <button
                   onClick={openCart}
                   className="p-2 relative text-gray-600 hover:text-[#C8102E] transition-colors group cursor-pointer"
                   aria-label={`Panier`}
                 >
                   <ShoppingCart className="w-5 h-5 transition-transform group-hover:scale-110" />
                   {itemCount > 0 && (
                     <span
                       className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-white text-[9px] font-bold px-1"
                       style={{ backgroundColor: "#C8102E" }}
                     >
                       {itemCount > 99 ? "99+" : itemCount}
                     </span>
                   )}
                 </button>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Mobile Menu Overlay ──────────────────────────────────────────────── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        </div>
      )}

      {/* ── Mobile Menu Drawer ───────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Mobile header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <Link
            href="/shop"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center"
          >
            <img
              src="/logo.png"
              alt="LEBTEX"
              className="h-12 w-auto"
              style={{ maxWidth: '180px' }}
            />
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile search */}
        <div className="px-5 py-4 border-b border-gray-100">
          <SmartSearch variant="mobile" onNavigate={() => setIsMobileMenuOpen(false)} />
        </div>

        {/* Mobile nav links */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_LINKS.map((link) =>
            link.hasDropdown ? (
              <div key={link.labelKey}>
                <button
                  onClick={() =>
                    setIsMobileCategoriesOpen((v) => !v)
                  }
                  className="flex items-center justify-between w-full px-5 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  <span>{t(link.labelKey)}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                      isMobileCategoriesOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isMobileCategoriesOpen && (
                  <div className="bg-gray-50 border-y border-gray-100 py-1">
                    {SHOP_CATEGORIES.map((cat) => (
                      <Link
                        key={cat.id}
                        href={`/shop/categorie/${cat.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-7 py-2.5 text-sm text-gray-700 hover:text-[#C8102E] hover:bg-white transition-colors"
                      >
                        <span>{cat.icon}</span>
                        <span>{language === 'ar' ? (cat.nameAr || cat.name) : cat.name}</span>
                      </Link>
                    ))}
                    <Link
                      href="/shop/categories"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 mx-5 mt-2 mb-1 py-2 px-3 rounded-lg text-sm font-semibold text-[#C8102E] bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <Truck className="w-4 h-4" />
                      {t('all_products')}
                    </Link>
                  </div>
                )}
              </div>
            ) : link.isMoreDropdown ? (
              <div key={link.labelKey}>
                <button
                  onClick={() => setIsMoreOpen((v) => !v)}
                  className="flex items-center justify-between w-full px-5 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  <span>{t(link.labelKey)}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                      isMoreOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isMoreOpen && (
                  <div className="bg-gray-50 border-y border-gray-100 py-1">
                    {MORE_LINKS.map((ml) => (
                      <Link
                        key={ml.labelKey}
                        href={ml.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-7 py-2.5 text-sm text-gray-700 hover:text-[#C8102E] hover:bg-white transition-colors"
                      >
                        <span>{t(ml.labelKey)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={link.labelKey}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-5 py-3.5 text-sm font-semibold transition-colors ${
                  isActive(link.href)
                    ? "text-[#C8102E] bg-red-50"
                    : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                {t(link.labelKey)}
                {isActive(link.href) && (
                  <ChevronRight className="w-4 h-4 text-[#C8102E]" />
                )}
              </Link>
            )
          )}
        </nav>

        {/* Mobile footer CTA */}
        <div className="p-5 border-t border-gray-100 space-y-2.5">
          <a
            href="https://wa.me/212760998347"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors"
          >
            <Phone className="w-4 h-4" />
            {t('whatsapp_cta')}
          </a>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              openCart();
            }}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-white text-sm font-semibold transition-colors hover:opacity-90"
            style={{ backgroundColor: "#C8102E" }}
          >
            <ShoppingCart className="w-4 h-4" />
            {t('cart_title')}
            {itemCount > 0 && (
              <span className="bg-white text-[#C8102E] text-xs font-bold px-1.5 py-0.5 rounded-full">
                {itemCount}
              </span>
            )}
          </button>
          {/* Language toggle for mobile */}
          <button
            onClick={() => setLanguage(language === 'fr' ? 'ar' : 'fr')}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="text-base">{language === 'fr' ? '🇸🇦' : '🇫🇷'}</span>
            {language === 'fr' ? 'عربي / Passer en arabe' : 'Français / الفرنسية'}
          </button>
          <p className="text-center text-xs text-gray-400">
            🇲🇦 {t('trust_delivery')}
          </p>
        </div>
      </div>

      {/* ── Spacer (accounts for fixed header height) ────────────────────────── */}
      {/* Promo bar ≈ 32px + nav bar ≈ 64/80px = 96/112px */}
      <div className="h-[calc(32px+64px)] lg:h-[calc(32px+80px)]" />
    </>
  );
}
