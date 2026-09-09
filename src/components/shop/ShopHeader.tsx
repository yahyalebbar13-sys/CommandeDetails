"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Phone,
  Truck,
  Home,
  LayoutGrid,
  ShoppingBag,
  Plus,
  Building2,
  PhoneCall,
  Percent,
  Globe,
  Layers,
} from "lucide-react";
import { useShopCart } from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import { useShopProducts } from "@/contexts/shop-products-context";
import SmartSearch from "@/components/shop/SmartSearch";
import { formatPrice } from "@/lib/shop-utils";

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
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileCatExplorerOpen, setIsMobileCatExplorerOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [mobileSelectedCatSlug, setMobileSelectedCatSlug] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hoveredCatSlug, setHoveredCatSlug] = useState<string>('');
  const [menuStyle, setMenuStyle] = useState<{ left: number; notchLeft: number }>({ left: -220, notchLeft: 260 });

  const activeCategory = (hoveredCatSlug ? SHOP_CATEGORIES.find(c => c.slug === hoveredCatSlug) : null) || SHOP_CATEGORIES[0] || null;

  // Active category for mobile 2-column explorer drawer
  const mobileActiveCat = useMemo(() => {
    return (mobileSelectedCatSlug ? SHOP_CATEGORIES.find(c => c.slug === mobileSelectedCatSlug) : null) || SHOP_CATEGORIES[0] || null;
  }, [mobileSelectedCatSlug, SHOP_CATEGORIES]);

  // Strictly REAL subcategories & REAL products for Desktop Mega Menu
  const desktopSubcategories = useMemo(() => {
    if (!activeCategory) return [];
    return allContextCategories.filter((c) => c.parentSlug === activeCategory.slug);
  }, [activeCategory, allContextCategories]);

  const desktopProducts = useMemo(() => {
    if (!activeCategory) return [];
    return (allProducts || []).filter(
      (p) =>
        p.categorySlug === activeCategory.slug ||
        p.additionalCategorySlugs?.includes(activeCategory.slug) ||
        p.categoryAliases?.some((a) => a.slug === activeCategory.slug) ||
        desktopSubcategories.some((s) => s.slug === p.categorySlug)
    );
  }, [activeCategory, allProducts, desktopSubcategories]);

  // Strictly REAL subcategories & REAL products for Mobile Category Explorer
  const mobileSubcategories = useMemo(() => {
    if (!mobileActiveCat) return [];
    return allContextCategories.filter((c) => c.parentSlug === mobileActiveCat.slug);
  }, [mobileActiveCat, allContextCategories]);

  const mobileProducts = useMemo(() => {
    if (!mobileActiveCat) return [];
    return (allProducts || []).filter(
      (p) =>
        p.categorySlug === mobileActiveCat.slug ||
        p.additionalCategorySlugs?.includes(mobileActiveCat.slug) ||
        p.categoryAliases?.some((a) => a.slug === mobileActiveCat.slug) ||
        mobileSubcategories.some((s) => s.slug === p.categorySlug)
    );
  }, [mobileActiveCat, allProducts, mobileSubcategories]);

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

  // ── Close menus on route change ──────────────────────────────────────────
  useEffect(() => {
    setIsSearchOpen(false);
    setIsCategoriesOpen(false);
    setIsMoreOpen(false);
    setIsMobileCatExplorerOpen(false);
    setIsPlusMenuOpen(false);
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

  // ── Lock body scroll on mobile category explorer or plus menu ─────────────
  useEffect(() => {
    if (isMobileCatExplorerOpen || isPlusMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileCatExplorerOpen, isPlusMenuOpen]);

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

              {/* Cart Button (Desktop only, mobile has it in bottom navigation bar) */}
              <button
                onClick={openCart}
                className="hidden lg:flex relative p-2.5 rounded-xl text-gray-700 hover:text-[#C8102E] hover:bg-red-50 transition-all group cursor-pointer"
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
            </div>
          </div>
        </div>

        {/* ── Mobile Horizontal Swipeable Category Tabs (Temu-style: "Tout" + Categories, NO emojis) ── */}
        <div className="lg:hidden border-t border-neutral-100 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar scroll-smooth">
            {/* "Tout" Pill */}
            <Link
              href="/shop"
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                pathname === "/shop"
                  ? "bg-[#C8102E] text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {language === 'ar' ? 'الكل' : 'Tout'}
            </Link>

            {/* Real Parent Categories (clean text, no emojis) */}
            {SHOP_CATEGORIES.map((cat) => {
              const isCatActive = pathname === `/shop/categorie/${cat.slug}`;
              return (
                <Link
                  key={cat.id}
                  href={`/shop/categorie/${cat.slug}`}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isCatActive
                      ? "bg-[#C8102E] text-white font-bold shadow-xs"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  <span>{language === 'ar' ? (cat.nameAr || cat.name) : cat.name}</span>
                </Link>
              );
            })}
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
                          width: "min(1180px, calc(100vw - 32px))",
                        }}
                        className="absolute top-[calc(100%+6px)] bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2),0_10px_25px_-5px_rgba(0,0,0,0.08)] border border-neutral-200/90 z-50 overflow-hidden animate-in fade-in-0 duration-150"
                      >
                        {/* Triangular Notch indicator pointing directly to the button */}
                        <div
                          className="absolute -top-1.5 w-3.5 h-3.5 bg-white border-t border-l border-neutral-200/90 rotate-45 z-30 pointer-events-none -translate-x-1/2"
                          style={{ left: `${menuStyle.notchLeft}px` }}
                        />

                        {/* 2-Column Grid */}
                        <div className="grid grid-cols-12 h-[560px]">
                          {/* ── Left Column: Categories List (Temu-style) ── */}
                          <div className="col-span-3 bg-neutral-50/75 border-r border-neutral-200/70 py-3 overflow-y-auto shop-scrollbar">
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
                                    <div className="truncate pr-2">
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
                          <div className="col-span-9 bg-white p-6 overflow-y-auto shop-scrollbar flex flex-col justify-between">
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
                              {/* Content Display: Separated Subcategories and/or Products (Grandes cartes) */}
                              {desktopSubcategories.length > 0 ? (
                                <div className="space-y-6">
                                  {/* 1. Sous-catégories Section */}
                                  <div>
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                        {language === 'ar' ? 'الفئات الفرعية' : 'Sous-catégories'}
                                      </h4>
                                      <span className="text-[11px] text-neutral-400 font-medium">
                                        {desktopSubcategories.length} {language === 'ar' ? 'أقسام' : 'rayons'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                      {desktopSubcategories.map((sub) => {
                                        const subName = language === 'ar' ? (sub.nameAr || sub.name) : sub.name;
                                        const subImg = sub.image || activeCategory.image;
                                        return (
                                          <Link
                                            key={sub.id || sub.slug}
                                            href={`/shop/categorie/${sub.slug}`}
                                            onClick={() => setIsCategoriesOpen(false)}
                                            className="group flex flex-col items-center cursor-pointer text-center p-2 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all"
                                          >
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200 group-hover:border-[#C8102E] relative flex items-center justify-center transition-all group-hover:scale-105 shadow-2xs">
                                              {subImg ? (
                                                <Image
                                                  src={subImg}
                                                  alt={subName}
                                                  fill
                                                  sizes="64px"
                                                  className="object-cover group-hover:scale-110 transition-transform duration-300"
                                                />
                                              ) : (
                                                <Layers className="w-6 h-6 text-neutral-400" />
                                              )}
                                            </div>
                                            <span className="mt-1.5 text-xs font-semibold text-neutral-800 group-hover:text-[#C8102E] text-center line-clamp-2 leading-tight transition-colors">
                                              {subName}
                                            </span>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* 2. Produits de la catégorie (Grandes Cartes séparées) */}
                                  {desktopProducts.length > 0 && (
                                    <div className="pt-4 border-t border-neutral-100">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                          {language === 'ar' ? 'المنتجات المميزة' : 'Sélection de produits'}
                                        </h4>
                                        <span className="text-[11px] text-neutral-400 font-medium">
                                          {desktopProducts.length} {language === 'ar' ? 'منتج' : 'produits'}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                        {desktopProducts.map((p) => {
                                          const pName = language === 'ar' ? (p.nameAr || p.name) : p.name;
                                          const pImg = p.images?.[0] || activeCategory.image;
                                          const hasPrice = typeof p.price === 'number' && p.price > 0;
                                          return (
                                            <Link
                                              key={p.id}
                                              href={`/shop/produit/${p.id}`}
                                              onClick={() => setIsCategoriesOpen(false)}
                                              className="group flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden hover:border-[#C8102E] hover:shadow-md transition-all cursor-pointer"
                                            >
                                              <div className="relative aspect-square bg-neutral-50 overflow-hidden">
                                                {pImg ? (
                                                  <Image
                                                    src={pImg}
                                                    alt={pName}
                                                    fill
                                                    sizes="180px"
                                                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                                                  />
                                                ) : (
                                                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400">
                                                    <Layers className="w-6 h-6" />
                                                  </div>
                                                )}
                                                {p.isPromo && (
                                                  <span className="absolute top-1.5 left-1.5 bg-[#C8102E] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase shadow-xs">
                                                    PROMO
                                                  </span>
                                                )}
                                              </div>
                                              <div className="p-2.5 flex flex-col flex-1 justify-between">
                                                <p className="text-xs font-bold text-neutral-800 line-clamp-2 leading-snug group-hover:text-[#C8102E] transition-colors">
                                                  {pName}
                                                </p>
                                                <div className="mt-2 pt-1 border-t border-neutral-100 flex items-center justify-between">
                                                  <span className="text-xs font-black text-[#C8102E]">
                                                    {hasPrice ? formatPrice(p.price) : (language === 'ar' ? 'حسب الطلب' : 'Sur demande')}
                                                  </span>
                                                  <span className="text-[10px] font-semibold text-neutral-400 group-hover:text-neutral-900 transition-colors">
                                                    {language === 'ar' ? 'عرض ←' : 'Voir →'}
                                                  </span>
                                                </div>
                                              </div>
                                            </Link>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : desktopProducts.length > 0 ? (
                                /* S'il n'y a QUE des produits et PAS de sous-catégories: Grandes cartes directes! */
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                      {language === 'ar' ? 'جميع المنتجات' : 'Tous les produits'}
                                    </h4>
                                    <span className="text-[11px] text-neutral-400 font-medium">
                                      {desktopProducts.length} {language === 'ar' ? 'منتج' : 'produits'}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                    {desktopProducts.map((p) => {
                                      const pName = language === 'ar' ? (p.nameAr || p.name) : p.name;
                                      const pImg = p.images?.[0] || activeCategory.image;
                                      const hasPrice = typeof p.price === 'number' && p.price > 0;
                                      return (
                                        <Link
                                          key={p.id}
                                          href={`/shop/produit/${p.id}`}
                                          onClick={() => setIsCategoriesOpen(false)}
                                          className="group flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden hover:border-[#C8102E] hover:shadow-md transition-all cursor-pointer"
                                        >
                                          <div className="relative aspect-square bg-neutral-50 overflow-hidden">
                                            {pImg ? (
                                              <Image
                                                src={pImg}
                                                alt={pName}
                                                fill
                                                sizes="160px"
                                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                              />
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400">
                                                <Layers className="w-6 h-6" />
                                              </div>
                                            )}
                                            {p.isPromo && (
                                              <span className="absolute top-1.5 left-1.5 bg-[#C8102E] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase shadow-xs">
                                                PROMO
                                              </span>
                                            )}
                                          </div>
                                          <div className="p-2.5 flex flex-col flex-1 justify-between">
                                            <p className="text-xs font-bold text-neutral-800 line-clamp-2 leading-snug group-hover:text-[#C8102E] transition-colors">
                                              {pName}
                                            </p>
                                            <div className="mt-2 pt-1 border-t border-neutral-100 flex items-center justify-between">
                                              <span className="text-xs font-black text-[#C8102E]">
                                                {hasPrice ? formatPrice(p.price) : (language === 'ar' ? 'حسب الطلب' : 'Sur demande')}
                                              </span>
                                              <span className="text-[10px] font-semibold text-neutral-400 group-hover:text-neutral-900 transition-colors">
                                                {language === 'ar' ? 'عرض ←' : 'Voir →'}
                                              </span>
                                            </div>
                                          </div>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : activeCategory ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center bg-neutral-50/60 rounded-2xl border border-dashed border-neutral-200 p-6 my-4">
                                  <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-neutral-400 mb-3 shadow-xs border border-neutral-100">
                                    <Layers className="w-8 h-8 text-neutral-400" />
                                  </div>
                                  <h4 className="text-base font-bold text-neutral-900 mb-1">
                                    {language === 'ar' ? (activeCategory.nameAr || activeCategory.name) : activeCategory.name}
                                  </h4>
                                  <p className="text-xs text-neutral-500 max-w-sm mb-4">
                                    {language === 'ar' ? (activeCategory.descriptionAr || 'استكشف جميع منتجات هذا القسم') : (activeCategory.description || 'Découvrez tous les articles disponibles dans ce rayon')}
                                  </p>
                                  <Link
                                    href={`/shop/categorie/${activeCategory.slug}`}
                                    onClick={() => setIsCategoriesOpen(false)}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold text-white bg-[#C8102E] hover:bg-red-700 transition-colors shadow-xs"
                                  >
                                    <span>{language === 'ar' ? 'عرض منتجات القسم' : 'Voir les articles'}</span>
                                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                                  </Link>
                                </div>
                              ) : null}
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



      {/* ── Search Modal Overlay (Mobile/Tablet/Quick Search) ─────────────── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150">
          <div className="bg-white rounded-2xl p-4 shadow-2xl max-w-lg w-full mx-auto mt-12 border border-neutral-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-800">
                {language === 'ar' ? 'البحث في المتجر' : 'Rechercher un produit'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Fermer la recherche"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SmartSearch variant="mobile" onNavigate={() => setIsSearchOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Temu-style Mobile Fixed Bottom Navigation Bar (Accueil, Catégories, Boutique, Suivi, Panier, +) ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6 h-14 items-center">
          {/* 1. Accueil */}
          <Link
            href="/shop"
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              pathname === "/shop" && !isMobileCatExplorerOpen && !isPlusMenuOpen
                ? "text-[#C8102E] font-bold"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'الرئيسية' : 'Accueil'}
            </span>
          </Link>

          {/* 2. Catégories */}
          <button
            type="button"
            onClick={() => {
              setIsPlusMenuOpen(false);
              setIsSearchOpen(false);
              setIsMobileCatExplorerOpen(true);
            }}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              isMobileCatExplorerOpen || pathname?.startsWith("/shop/categorie")
                ? "text-[#C8102E] font-bold"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'الفئات' : 'Catégories'}
            </span>
          </button>

          {/* 3. Boutique */}
          <Link
            href="/shop/boutique"
            onClick={() => {
              setIsMobileCatExplorerOpen(false);
              setIsPlusMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              pathname === "/shop/boutique"
                ? "text-[#C8102E] font-bold"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'المتجر' : 'Boutique'}
            </span>
          </Link>

          {/* 4. Suivi de commande */}
          <Link
            href="/shop/suivi"
            onClick={() => {
              setIsMobileCatExplorerOpen(false);
              setIsPlusMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              pathname === "/shop/suivi"
                ? "text-[#C8102E] font-bold"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <Truck className="w-5 h-5 mb-0.5" />
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'التتبع' : 'Suivi'}
            </span>
          </Link>

          {/* 5. Panier */}
          <button
            type="button"
            onClick={() => {
              setIsMobileCatExplorerOpen(false);
              setIsPlusMenuOpen(false);
              openCart();
            }}
            className="relative flex flex-col items-center justify-center h-full text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5 mb-0.5" />
              {itemCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-white text-[9px] font-black px-0.5"
                  style={{ backgroundColor: "#C8102E" }}
                >
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </div>
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'السلة' : 'Panier'}
            </span>
          </button>

          {/* 6. Plus (+) Menu */}
          <button
            type="button"
            onClick={() => {
              setIsMobileCatExplorerOpen(false);
              setIsPlusMenuOpen(v => !v);
            }}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              isPlusMenuOpen
                ? "text-[#C8102E] font-bold"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
              isPlusMenuOpen ? "bg-red-50 text-[#C8102E] rotate-45" : ""
            }`}>
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[9.5px] leading-tight font-medium truncate px-0.5">
              {language === 'ar' ? 'المزيد' : 'Plus'}
            </span>
          </button>
        </div>
      </div>

      {/* ── Mobile "+" Menu Bottom Sheet (À propos magasin, Contact, Promotion, Service import) ── */}
      {isPlusMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end animate-in fade-in-0 duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsPlusMenuOpen(false)}
          />

          {/* Sheet Container */}
          <div
            className="relative bg-white rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)] border-t border-neutral-200 p-5 z-10 animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
          >
            {/* Handle / Drag notch */}
            <div className="w-10 h-1 rounded-full bg-neutral-200 mx-auto mb-3" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 text-[#C8102E] flex items-center justify-center font-black text-sm">
                  +
                </div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {language === 'ar' ? 'خدمات ومعلومات LEBTEX' : 'Services & Infos LEBTEX'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 Cards Grid (À propos magasin, Contact, Promotion, Service import) */}
            <div className="grid grid-cols-2 gap-3">
              {/* 1. Promotions */}
              <Link
                href="/shop/promotions"
                onClick={() => setIsPlusMenuOpen(false)}
                className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 hover:bg-amber-100/60 transition-all flex flex-col justify-between group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <Percent className="w-4 h-4" />
                  </div>
                  <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tight">
                    HOT
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 group-hover:text-[#C8102E] transition-colors">
                    {language === 'ar' ? 'العروض والتخفيضات' : 'Promotions'}
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                    {language === 'ar' ? 'تخفيضات وصفقات حصرية' : 'Offres & remises exclusives'}
                  </p>
                </div>
              </Link>

              {/* 2. À propos magasin */}
              <Link
                href="/shop/a-propos"
                onClick={() => setIsPlusMenuOpen(false)}
                className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/70 hover:bg-rose-100/50 transition-all flex flex-col justify-between group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-[#C8102E] text-white flex items-center justify-center shadow-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 group-hover:text-[#C8102E] transition-colors">
                    {language === 'ar' ? 'عن المتجر' : 'À propos magasin'}
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                    {language === 'ar' ? 'تاريخنا ومحلاتنا بالدار البيضاء' : 'Notre mercerie & boutiques'}
                  </p>
                </div>
              </Link>

              {/* 3. Service import */}
              <Link
                href="/catalogue/service-import"
                onClick={() => setIsPlusMenuOpen(false)}
                className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70 hover:bg-indigo-100/50 transition-all flex flex-col justify-between group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    PRO
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 group-hover:text-[#C8102E] transition-colors">
                    {language === 'ar' ? 'خدمة الاستيراد' : 'Service Import'}
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                    {language === 'ar' ? 'طلبيات الجملة والاستيراد' : 'Commandes industrielles sur mesure'}
                  </p>
                </div>
              </Link>

              {/* 4. Contact */}
              <Link
                href="/shop/contact"
                onClick={() => setIsPlusMenuOpen(false)}
                className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/70 hover:bg-blue-100/50 transition-all flex flex-col justify-between group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 group-hover:text-[#C8102E] transition-colors">
                    {language === 'ar' ? 'اتصل بنا' : 'Contact'}
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                    {language === 'ar' ? 'خدمة الزبائن والدعم' : 'Assistance & service client'}
                  </p>
                </div>
              </Link>
            </div>

            {/* Direct WhatsApp CTA Button inside the Plus menu */}
            <a
              href="https://wa.me/212760998347"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors shadow-xs"
            >
              <Phone className="w-4 h-4" />
              <span>{language === 'ar' ? 'تواصل عبر واتساب (+212 760 998 347)' : 'Discuter sur WhatsApp (+212 760 998 347)'}</span>
            </a>
          </div>
        </div>
      )}

      {/* ── Temu-style Mobile 2-Column Category Explorer Drawer (NO emojis) ── */}
      {isMobileCatExplorerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col bg-white animate-in fade-in-0 duration-200">
          {/* Top Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[#C8102E]" />
              <h2 className="text-base font-bold text-neutral-900">
                {language === 'ar' ? 'جميع الفئات والأقسام' : 'Toutes les catégories'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileCatExplorerOpen(false)}
              className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Search Shortcut */}
          <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-100">
            <button
              type="button"
              onClick={() => {
                setIsMobileCatExplorerOpen(false);
                setIsSearchOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-400 text-left shadow-2xs cursor-pointer"
            >
              <Search className="w-4 h-4 text-neutral-400" />
              <span>{language === 'ar' ? 'ابحث عن منتج أو مقاس...' : 'Rechercher un produit, une taille...'}</span>
            </button>
          </div>

          {/* 2-Column Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Vertical Category List (Temu style, clean text, NO emojis) */}
            <div className="w-24 sm:w-28 bg-neutral-100/80 border-r border-neutral-200/80 overflow-y-auto shop-scrollbar flex flex-col">
              {SHOP_CATEGORIES.map((cat) => {
                const isSelected = (mobileActiveCat?.slug === cat.slug);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMobileSelectedCatSlug(cat.slug)}
                    className={`flex items-center justify-center py-3.5 px-2 text-center transition-all border-l-4 rtl:border-l-0 rtl:border-r-4 cursor-pointer relative min-h-[50px] ${
                      isSelected
                        ? "bg-white text-[#C8102E] font-bold border-[#C8102E] shadow-2xs"
                        : "text-neutral-600 hover:text-neutral-900 border-transparent hover:bg-neutral-200/50"
                    }`}
                  >
                    <span className="text-[11.5px] leading-snug line-clamp-2 px-1">
                      {language === 'ar' ? (cat.nameAr || cat.name) : cat.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Subcategories & Real Products (Temu style) */}
            <div className="flex-1 bg-white p-3.5 overflow-y-auto shop-scrollbar pb-24">
              {mobileActiveCat && (
                <>
                  {/* Banner Header: "Tout [Nom Catégorie] >" */}
                  <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-neutral-100">
                    <Link
                      href={`/shop/categorie/${mobileActiveCat.slug}`}
                      onClick={() => setIsMobileCatExplorerOpen(false)}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-neutral-900 hover:text-[#C8102E] transition-colors cursor-pointer"
                    >
                      <span>
                        {language === 'ar'
                          ? `جميع ${mobileActiveCat.nameAr || mobileActiveCat.name}`
                          : `Tout ${mobileActiveCat.name}`}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#C8102E] rtl:rotate-180" />
                    </Link>

                    <Link
                      href="/shop/categories"
                      onClick={() => setIsMobileCatExplorerOpen(false)}
                      className="text-[11px] font-semibold text-neutral-400 hover:text-[#C8102E] transition-colors"
                    >
                      {language === 'ar' ? 'الكل' : 'Tous'}
                    </Link>
                  </div>

                  {/* Content Display: Separated Subcategories and/or Products (Grandes cartes) */}
                  {mobileSubcategories.length > 0 ? (
                    <div className="space-y-5">
                      {/* 1. Sous-catégories Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-400">
                            {language === 'ar' ? 'الأقسام الفرعية' : 'Sous-catégories'}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-full">
                            {mobileSubcategories.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {mobileSubcategories.map((sub) => {
                            const subName = language === 'ar' ? (sub.nameAr || sub.name) : sub.name;
                            const subImg = sub.image || mobileActiveCat.image;
                            return (
                              <Link
                                key={sub.id || sub.slug}
                                href={`/shop/categorie/${sub.slug}`}
                                onClick={() => setIsMobileCatExplorerOpen(false)}
                                className="group flex flex-col items-center text-center p-1.5 rounded-xl bg-neutral-50/70 border border-neutral-200/70 hover:border-[#C8102E] transition-all shadow-2xs active:scale-95 cursor-pointer"
                              >
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-neutral-200/80 relative flex items-center justify-center shadow-2xs">
                                  {subImg ? (
                                    <Image
                                      src={subImg}
                                      alt={subName}
                                      fill
                                      sizes="48px"
                                      className="object-cover group-hover:scale-110 transition-transform duration-300"
                                    />
                                  ) : (
                                    <Layers className="w-5 h-5 text-neutral-400" />
                                  )}
                                </div>
                                <span className="mt-1 text-[10px] font-bold text-neutral-700 group-hover:text-[#C8102E] line-clamp-2 leading-tight">
                                  {subName}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Produits de la catégorie (Grandes cartes séparées) */}
                      {mobileProducts.length > 0 && (
                        <div className="pt-3 border-t border-neutral-100">
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-neutral-400">
                              {language === 'ar' ? 'المنتجات المميزة' : 'Produits du rayon'}
                            </span>
                            <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-full">
                              {mobileProducts.length}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            {mobileProducts.map((p) => {
                              const pName = language === 'ar' ? (p.nameAr || p.name) : p.name;
                              const pImg = p.images?.[0] || mobileActiveCat.image;
                              const hasPrice = typeof p.price === 'number' && p.price > 0;
                              return (
                                <Link
                                  key={p.id}
                                  href={`/shop/produit/${p.id}`}
                                  onClick={() => setIsMobileCatExplorerOpen(false)}
                                  className="group flex flex-col bg-white rounded-2xl border border-neutral-200/80 overflow-hidden hover:border-[#C8102E] hover:shadow-md transition-all active:scale-[0.98] shadow-2xs"
                                >
                                  <div className="relative aspect-square bg-neutral-50 overflow-hidden">
                                    {pImg ? (
                                      <Image
                                        src={pImg}
                                        alt={pName}
                                        fill
                                        sizes="(max-width: 768px) 50vw, 160px"
                                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400">
                                        <Layers className="w-6 h-6" />
                                      </div>
                                    )}
                                    {p.isPromo && (
                                      <span className="absolute top-1.5 left-1.5 bg-[#C8102E] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase shadow-xs">
                                        PROMO
                                      </span>
                                    )}
                                  </div>
                                  <div className="p-2 flex flex-col flex-1 justify-between">
                                    <p className="text-[11px] font-bold text-neutral-800 line-clamp-2 leading-snug group-hover:text-[#C8102E] transition-colors">
                                      {pName}
                                    </p>
                                    <div className="mt-1.5 pt-1 border-t border-neutral-100 flex items-center justify-between">
                                      <span className="text-xs font-black text-[#C8102E]">
                                        {hasPrice ? formatPrice(p.price) : (language === 'ar' ? 'حسب الطلب' : 'Sur demande')}
                                      </span>
                                      <span className="text-[9px] font-bold text-neutral-400 group-hover:text-neutral-900">
                                        {language === 'ar' ? 'عرض ←' : 'Voir →'}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : mobileProducts.length > 0 ? (
                    /* S'il n'y a QUE des produits et PAS de sous-catégories: Grandes cartes directes! */
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-wider text-neutral-400">
                          {language === 'ar' ? 'جميع المنتجات' : 'Tous les produits'}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-full">
                          {mobileProducts.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {mobileProducts.map((p) => {
                          const pName = language === 'ar' ? (p.nameAr || p.name) : p.name;
                          const pImg = p.images?.[0] || mobileActiveCat.image;
                          const hasPrice = typeof p.price === 'number' && p.price > 0;
                          return (
                            <Link
                              key={p.id}
                              href={`/shop/produit/${p.id}`}
                              onClick={() => setIsMobileCatExplorerOpen(false)}
                              className="group flex flex-col bg-white rounded-2xl border border-neutral-200/80 overflow-hidden hover:border-[#C8102E] hover:shadow-md transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="relative aspect-square bg-neutral-50 overflow-hidden">
                                {pImg ? (
                                  <Image
                                    src={pImg}
                                    alt={pName}
                                    fill
                                    sizes="(max-width: 768px) 50vw, 200px"
                                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400">
                                    <Layers className="w-7 h-7" />
                                  </div>
                                )}
                                {p.isPromo && (
                                  <span className="absolute top-1.5 left-1.5 bg-[#C8102E] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase shadow-xs">
                                    PROMO
                                  </span>
                                )}
                              </div>
                              <div className="p-2.5 flex flex-col flex-1 justify-between">
                                <p className="text-xs font-bold text-neutral-800 line-clamp-2 leading-snug group-hover:text-[#C8102E] transition-colors">
                                  {pName}
                                </p>
                                <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between">
                                  <span className="text-xs font-black text-[#C8102E]">
                                    {hasPrice ? formatPrice(p.price) : (language === 'ar' ? 'حسب الطلب' : 'Sur demande')}
                                  </span>
                                  <span className="text-[10px] font-bold text-neutral-400 group-hover:text-neutral-900">
                                    {language === 'ar' ? 'تفاصيل ←' : 'Détails →'}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200 p-4">
                      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-neutral-400 mb-2.5 shadow-xs border border-neutral-100">
                        <Layers className="w-7 h-7 text-neutral-400" />
                      </div>
                      <h4 className="text-sm font-bold text-neutral-900 mb-1">
                        {language === 'ar' ? (mobileActiveCat.nameAr || mobileActiveCat.name) : mobileActiveCat.name}
                      </h4>
                      <p className="text-[11px] text-neutral-500 mb-3 max-w-[200px]">
                        {language === 'ar' ? (mobileActiveCat.descriptionAr || 'استكشف منتجات هذا القسم') : (mobileActiveCat.description || 'Découvrez tous les articles de ce rayon')}
                      </p>
                      <Link
                        href={`/shop/categorie/${mobileActiveCat.slug}`}
                        onClick={() => setIsMobileCatExplorerOpen(false)}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white bg-[#C8102E] hover:bg-red-700 transition-colors shadow-xs"
                      >
                        {language === 'ar' ? 'عرض القسم' : 'Visiter le rayon'}
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Spacer (accounts for fixed header height) ────────────────────────── */}
      {/* Mobile: Promo bar 32px + top bar 64px + categories 44px ≈ 140px */}
      <div className="h-[140px] lg:h-[calc(32px+80px)]" />
    </>
  );
}

