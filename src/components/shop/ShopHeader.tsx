"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const { categories: allContextCategories } = useShopProducts();
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
        <div className={`transition-all duration-200 ease-in-out origin-top overflow-hidden ${isScrolled ? 'lg:max-h-0 lg:opacity-0' : 'max-h-[500px] opacity-100'}`}>
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

            {/* ── Desktop Search Bar (Permanent) ────────────────────────── */}
            <div className="hidden lg:flex flex-1 max-w-2xl mx-auto">
              <form
                onSubmit={handleSearchSubmit}
                className="flex w-full items-center shadow-sm rounded-full overflow-hidden border border-gray-200 focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/20 transition-all"
              >
                <div className="pl-4 text-gray-400">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher des produits, catégories..."
                  className="w-full px-3 py-3 text-sm focus:outline-none bg-white text-gray-700"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-[#C8102E] hover:bg-[#A30C24] text-white font-bold text-sm tracking-wider transition-colors"
                >
                  GO
                </button>
              </form>
            </div>

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
                    <button
                      onClick={() => setIsCategoriesOpen((v) => !v)}
                      className={`flex items-center gap-1.5 h-full text-sm font-semibold transition-all duration-200 border-b-2 cursor-pointer ${
                        isActive(link.href)
                          ? "border-[#C8102E] text-[#C8102E]"
                          : "border-transparent text-gray-700 hover:text-[#C8102E]"
                      }`}
                    >
                      {t(link.labelKey)}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isCategoriesOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* ── Categories Mega Dropdown ────────────────────── */}
                    {isCategoriesOpen && (
                      <div
                        onMouseLeave={() => setIsCategoriesOpen(false)}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-0 w-[520px] bg-white rounded-b-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-t-0 border-gray-100 p-4 grid grid-cols-3 gap-1.5 z-50"
                      >
                        {/* Header */}
                        <div className="col-span-3 pb-2 mb-1 border-b border-gray-100">
                          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                            {t('nav_categories')}
                          </p>
                        </div>
                        {SHOP_CATEGORIES.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/shop/categorie/${cat.slug}`}
                            onClick={() => setIsCategoriesOpen(false)}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                          >
                            <div className="flex-shrink-0 w-8 h-8 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                              {cat.image ? (
                                <div className="relative w-full h-full">
                                  <Image
                                    src={cat.image as string}
                                    alt={cat.name}
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ color: cat.color || '#C8102E' }}>
                                  {cat.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-sm font-medium text-gray-700 group-hover:text-[#C8102E] transition-colors leading-tight">
                              {cat.name}
                            </span>
                          </Link>
                        ))}
                        {/* View all */}
                        <div className="col-span-3 pt-2 mt-1 border-t border-gray-100">
                          <Link
                            href="/shop/categories"
                            onClick={() => setIsCategoriesOpen(false)}
                            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                            style={{ backgroundColor: "#C8102E" }}
                          >
                            {t('all_products')}
                            <ChevronRight className="w-4 h-4" />
                          </Link>
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
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_placeholder')}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-gray-50"
              />
            </div>
          </form>
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
                        <span>{cat.name}</span>
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
