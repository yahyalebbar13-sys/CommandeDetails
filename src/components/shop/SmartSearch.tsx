'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, X, ArrowRight, Clock, TrendingUp, Layers } from 'lucide-react';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useLanguage } from '@/contexts/language-context';
import { formatProductPrice } from '@/lib/shop-utils';
import { sansPrix, PRIX_SUR_DEMANDE } from '@/lib/shop-variantes';
import type { ShopCategory } from '@/lib/shop-types';
import { nomProduit, normaliserRecherche, texte, texteRecherche } from '@/lib/shop-textes';

// ─── Blur placeholder ─────────────────────────────────────────────────────────
const BLUR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==';

const RECENT_KEY = 'lebtex_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT);
  } catch { return []; }
}
function addRecentSearch(q: string) {
  try {
    const arr = getRecentSearches().filter(s => s !== q);
    arr.unshift(q);
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, MAX_RECENT)));
  } catch {}
}
function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch {}
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SmartSearchProps {
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
  autoFocus?: boolean;
}

// ─── SmartSearch Component ────────────────────────────────────────────────────
export default function SmartSearch({ variant = 'desktop', onNavigate, autoFocus }: SmartSearchProps) {
  const { products, categories } = useShopProducts();
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Autofocus
  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 100);
  }, [autoFocus]);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Search logic — fuzzy match products & categories
  const deferredQuery = React.useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();


  // ── Fuzzy search helpers ────────────────────────────────────────────────
  // Generate search variants of a word (plural/singular tolerance)
  const getVariants = useCallback((word: string): string[] => {
    const variants = [word];
    // French plural → singular
    if (word.endsWith('s') && word.length > 2) variants.push(word.slice(0, -1));
    if (word.endsWith('es') && word.length > 3) variants.push(word.slice(0, -2));
    if (word.endsWith('x') && word.length > 2) variants.push(word.slice(0, -1));
    // Singular → plural
    variants.push(word + 's');
    variants.push(word + 'es');
    return variants;
  }, []);

  // Chaque mot tapé (ou son singulier / pluriel) doit se trouver dans le texte déjà normalisé
  const fuzzyMatch = useCallback((texteNormalise: string, queryWords: string[]): boolean => {
    return queryWords.every(word =>
      getVariants(word).some(variant => texteNormalise.includes(variant))
    );
  }, [getVariants]);

  // Split and normalize query into words
  const queryWords = useMemo(() => {
    if (!q || q.length < 2) return [];
    return normaliserRecherche(q).split(' ').filter(w => w.length >= 2);
  }, [q]);

  // Ce qu'on peut taper pour trouver chaque rayon (sous-rayons compris) et chaque produit,
  // en français et en arabe : calculé une fois par catalogue, pas à chaque lettre
  const categoriesCherchables = useMemo(() => {
    const principales = categories.filter(c => !c.parentSlug);
    const sousRayons = categories.filter(c => c.parentSlug);
    return [...principales, ...sousRayons].map(c => ({
      categorie: c,
      texte: normaliserRecherche([c.name, c.nameAr, c.slug, c.description, c.descriptionAr].filter(Boolean).join(' ')),
    }));
  }, [categories]);

  const produitsCherchables = useMemo(
    () => products.map(p => ({ produit: p, texte: texteRecherche(p, categories) })),
    [products, categories]
  );

  const matchedCategories = useMemo(() => {
    if (queryWords.length === 0) return [];
    return categoriesCherchables
      .filter(x => fuzzyMatch(x.texte, queryWords))
      .slice(0, 3)
      .map(x => x.categorie);
  }, [queryWords, categoriesCherchables, fuzzyMatch]);

  const matchedProducts = useMemo(() => {
    if (queryWords.length === 0) return [];
    return produitsCherchables
      .filter(x => fuzzyMatch(x.texte, queryWords))
      .slice(0, 6)
      .map(x => x.produit);
  }, [queryWords, produitsCherchables, fuzzyMatch]);

  // Nom affiché, et gardé tel quel dans les recherches récentes : dans la langue du site
  const nomCategorie = useCallback((c: ShopCategory) => texte(c, 'name', language) || c.name, [language]);

  const hasResults = matchedCategories.length > 0 || matchedProducts.length > 0;
  const showDropdown = isFocused && (q.length >= 2 || (q.length === 0 && recentSearches.length > 0));

  // All navigable items for keyboard
  const allItems = useMemo(() => {
    const items: { type: 'category' | 'product' | 'recent' | 'search'; url: string; label: string }[] = [];
    if (q.length >= 2) {
      matchedCategories.forEach(c => items.push({ type: 'category', url: `/shop/categorie/${c.slug}`, label: nomCategorie(c) }));
      matchedProducts.forEach(p => items.push({ type: 'product', url: `/shop/produit/${p.id}`, label: nomProduit(p, language) }));
      if (q.length > 0) items.push({ type: 'search', url: `/shop/boutique?q=${encodeURIComponent(q)}`, label: q });
    } else {
      recentSearches.forEach(s => items.push({ type: 'recent', url: `/shop/boutique?q=${encodeURIComponent(s)}`, label: s }));
    }
    return items;
  }, [q, matchedCategories, matchedProducts, recentSearches, nomCategorie, language]);

  const navigate = useCallback((url: string, searchTerm?: string) => {
    if (searchTerm) addRecentSearch(searchTerm);
    setIsFocused(false);
    setQuery('');
    onNavigate?.();
    window.location.href = url;
  }, [onNavigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/shop/boutique?q=${encodeURIComponent(query.trim())}`, query.trim());
    }
  }, [query, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const item = allItems[selectedIndex];
      navigate(item.url, item.label);
    } else if (e.key === 'Escape') {
      setIsFocused(false);
    }
  }, [showDropdown, selectedIndex, allItems, navigate]);

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(-1); }, [q]);

  const isDesktop = variant === 'desktop';

  return (
    <div ref={containerRef} className={`relative ${isDesktop ? 'hidden lg:flex flex-1 max-w-2xl mx-auto' : 'w-full'}`}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className={`flex w-full items-center overflow-hidden transition-all ${
          isDesktop
            ? `rounded-full border ${isFocused ? 'border-[#C8102E] ring-2 ring-[#C8102E]/20 shadow-lg' : 'border-gray-200 shadow-sm'}`
            : 'relative'
        }`}>
          <div className={isDesktop ? 'ps-4 text-gray-400' : 'absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none'}>
            <Search className={isDesktop ? 'w-5 h-5' : 'w-4 h-4 text-gray-400'} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder={language === 'ar' ? 'ابحث عن منتجات، فئات...' : 'Rechercher des produits, catégories...'}
            className={isDesktop
              ? 'w-full px-3 py-3 text-sm focus:outline-none bg-white text-gray-700'
              : 'w-full ps-9 pe-9 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-gray-50'
            }
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className={`flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer ${isDesktop ? 'pe-2' : 'absolute end-3 top-1/2 -translate-y-1/2'}`}
              aria-label={language === 'ar' ? 'مسح البحث' : 'Effacer la recherche'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {isDesktop && (
            <button
              type="submit"
              className="px-6 py-3 bg-[#C8102E] hover:bg-[#A30C24] text-white font-bold text-sm tracking-wider transition-colors cursor-pointer"
            >
              {language === 'ar' ? 'بحث' : 'GO'}
            </button>
          )}
        </div>
      </form>

      {/* ── Suggestions Dropdown ──────────────────────────────────── */}
      {showDropdown && (
        <div className={`absolute left-0 right-0 bg-white border border-gray-200 shadow-2xl z-[100] overflow-hidden ${
          isDesktop
            ? 'top-[calc(100%+6px)] rounded-2xl max-h-[70vh]'
            : 'top-[calc(100%+4px)] rounded-xl max-h-[60vh]'
        } overflow-y-auto`}>

          {/* ── No query → Recent Searches ─────────────────────────── */}
          {q.length < 2 && recentSearches.length > 0 && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {language === 'ar' ? 'بحث سابق' : 'Recherches récentes'}
                </span>
                <button
                  onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                  className="text-[10px] text-gray-400 hover:text-[#C8102E] transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'مسح' : 'Effacer'}
                </button>
              </div>
              {recentSearches.map((s, i) => (
                <button
                  key={s}
                  onClick={() => navigate(`/shop/boutique?q=${encodeURIComponent(s)}`, s)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 rounded-lg transition-colors cursor-pointer text-start ${
                    selectedIndex === i ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Query results ─────────────────────────────────────── */}
          {q.length >= 2 && (
            <>
              {/* Matched Categories */}
              {matchedCategories.length > 0 && (
                <div className="p-3 border-b border-gray-100">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                    {language === 'ar' ? 'الفئات' : 'Catégories'}
                  </span>
                  {matchedCategories.map((cat, i) => (
                    <button
                      key={cat.id}
                      onClick={() => navigate(`/shop/categorie/${cat.slug}`, nomCategorie(cat))}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer text-start ${
                        selectedIndex === i ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cat.color || '#C8102E'}15` }}>
                        <Layers className="w-4 h-4 text-[#C8102E]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">{nomCategorie(cat)}</p>
                        {texte(cat, 'description', language) && <p className="text-[10px] text-gray-400 truncate">{texte(cat, 'description', language)}</p>}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 rtl:rotate-180" />
                    </button>
                  ))}
                </div>
              )}

              {/* Matched Products */}
              {matchedProducts.length > 0 && (
                <div className="p-3">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                    {language === 'ar' ? 'المنتجات' : 'Produits'}
                  </span>
                  {matchedProducts.map((product, i) => {
                    const idx = matchedCategories.length + i;
                    const img = product.images?.[0];
                    return (
                      <button
                        key={product.id}
                        onClick={() => navigate(`/shop/produit/${product.id}`, nomProduit(product, language))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer text-start ${
                          selectedIndex === idx ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
                          {img ? (
                            <Image src={img} alt={nomProduit(product, language)} fill className="object-cover" sizes="40px" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">📷</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1A1A1A] truncate">{nomProduit(product, language)}</p>
                          <div className="flex items-center gap-2">
                            {/* Sans prix : « Prix sur demande », jamais « En stock » (on demande le prix sur WhatsApp). */}
                            <span className="text-[11px] font-bold text-[#C8102E]">{sansPrix(product) ? PRIX_SUR_DEMANDE[language] : formatProductPrice(product, language)}</span>
                            {sansPrix(product) && product.inStock ? null : product.inStock ? (
                              <span className="text-[10px] text-emerald-500">● {language === 'ar' ? 'متوفر' : 'En stock'}</span>
                            ) : (
                              <span className="text-[10px] text-red-400">● {language === 'ar' ? 'نفد' : 'Rupture'}</span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 rtl:rotate-180" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No results */}
              {!hasResults && q.length >= 2 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">{language === 'ar' ? <>لا توجد نتائج لـ &quot;<bdi>{q}</bdi>&quot;</> : `Aucun résultat pour "${q}"`}</p>
                  <p className="text-xs text-gray-400 mt-1">{language === 'ar' ? 'جرّب كلمات أخرى' : 'Essayez d\'autres mots-clés'}</p>
                </div>
              )}

              {/* See all results link */}
              {q.length > 0 && (
                <button
                  onClick={() => navigate(`/shop/boutique?q=${encodeURIComponent(q)}`, q)}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold border-t border-gray-100 transition-colors cursor-pointer ${
                    selectedIndex === allItems.length - 1 ? 'bg-red-50 text-[#C8102E]' : 'text-[#C8102E] hover:bg-red-50'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  {language === 'ar' ? <span>عرض جميع النتائج لـ &quot;<bdi>{q}</bdi>&quot;</span> : `Voir tous les résultats pour "${q}"`}
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
