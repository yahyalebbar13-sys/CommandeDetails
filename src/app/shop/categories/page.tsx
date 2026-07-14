"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopCategory } from '@/lib/shop-types';
import { ChevronRight, Loader2 } from 'lucide-react';

export default function CategoriesPage() {
  const { categories: allCats, products, isLoading: loading } = useShopProducts();

  const productCount = (slug: string) =>
    products.filter(p => p.categorySlug === slug).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C8102E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ─── Compact Banner ──────────────────────────────────────────── */}
      <div className="relative h-44 sm:h-52 overflow-hidden">
        {/* Photo background */}
        <img
          src="/categories-banner.png"
          alt="Accessoires textiles"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.1) 100%)' }} />

        {/* Text content */}
        <div className="relative h-full flex flex-col justify-center px-6 sm:px-12 max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-[11px] text-white/50 mb-2">
            <Link prefetch={true} >Accueil</Link>
            <span>›</span>
            <span className="text-white/80">Catégories</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Nos Catégories
          </h1>
          <p className="text-white/60 text-sm mt-1">{allCats.length} catégories disponibles</p>
        </div>
      </div>


      {/* ─── Categories Grid ────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {allCats.filter(c => !c.parentSlug).map((cat) => {
            // Count includes products directly in this category + products in subcategories
            const subCatsSlugs = allCats.filter(c => c.parentSlug === cat.slug).map(c => c.slug);
            const count = products.filter(p => p.categorySlug === cat.slug || subCatsSlugs.includes(p.categorySlug)).length;
            const subCatsCount = subCatsSlugs.length;
            const accentColor = cat.color || '#C8102E';
            return (
              <Link
                key={cat.id}
                href={`/shop/categorie/${cat.slug}`}
                className="group relative overflow-hidden rounded-2xl bg-white border border-[#E8E4DF] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                {/* Image / gradient header */}
                <div className="relative h-44 overflow-hidden flex-shrink-0">
                  {(cat as any).image ? (
                    <img
                      src={(cat as any).image}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}10 100%)` }}
                    >
                      <span className="text-6xl opacity-50">{cat.icon || '🧵'}</span>
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  {/* Color accent strip */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: accentColor }}
                  />
                  {/* Product & Subcategories count badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                    {subCatsCount > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-sm"
                        style={{ background: `${accentColor}CC` }}>
                        {subCatsCount} sous-catégorie{subCatsCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {count > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-[#1A1A1A] bg-white/90 backdrop-blur-sm shadow-sm">
                        {count} produit{count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2
                      className="font-bold text-[#1A1A1A] text-lg leading-tight group-hover:text-[#C8102E] transition-colors"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                      {cat.name}
                    </h2>
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 group-hover:translate-x-1"
                      style={{ background: `${accentColor}15`, color: accentColor }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                  {cat.description ? (
                    <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 flex-1">{cat.description}</p>
                  ) : (
                    <p className="text-gray-400 text-sm italic flex-1">Découvrir la collection</p>
                  )}
                  <div className="mt-4 pt-3 border-t border-[#F0ECE8]">
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: accentColor }}
                    >
                      Voir la catégorie →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ─── CTA Bottom ─────────────────────────────────────────────────── */}
      <div className="border-t border-[#E8E4DF] py-12 text-center px-6">
        <p className="text-gray-500 text-sm mb-4">Vous cherchez un produit spécifique ?</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/shop/boutique"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a00d25] transition-colors"
          >
            Voir tous les produits
          </Link>
          <a
            href="https://wa.me/212760998347"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#E8E4DF] text-gray-700 font-semibold text-sm hover:border-green-400 hover:text-green-600 transition-all"
          >
            💬 Commander sur WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
