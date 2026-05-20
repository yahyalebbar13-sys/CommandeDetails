"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_CATEGORIES, SHOP_PRODUCTS_DATA } from '@/lib/shop-products-data';
import type { ShopCategory } from '@/lib/shop-types';
import { ChevronRight, Grid3X3, Loader2 } from 'lucide-react';

export default function CategoriesPage() {
  const [customCats, setCustomCats] = useState<ShopCategory[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<ShopCategory>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    Promise.all([
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_category_overrides')),
    ]).then(([ccSnap, ovSnap]) => {
      setCustomCats(ccSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopCategory)));
      const ov: Record<string, any> = {};
      ovSnap.docs.forEach(d => { ov[d.id] = d.data(); });
      setOverrides(ov);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const allCats: ShopCategory[] = [
    ...SHOP_CATEGORIES.map(c => ({ ...c, ...(overrides[c.slug] || {}) })),
    ...customCats,
  ];

  const productCount = (slug: string) =>
    SHOP_PRODUCTS_DATA.filter(p => p.categorySlug === slug).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C8102E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <div
        className="relative py-20 px-6 text-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1a0508 100%)' }}
      >
        <div
          className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #C8102E, transparent)', transform: 'translate(-50%, -60%)' }}
        />
        <div className="relative z-10 max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 mb-5">
            <Grid3X3 className="w-3.5 h-3.5 text-[#D4A843]" />
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Catalogue</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Nos <span style={{ background: 'linear-gradient(90deg, #C8102E, #D4A843)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Catégories</span>
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            Tout ce qu&apos;il vous faut pour la mercerie et la couture professionnelle
          </p>
        </div>
      </div>

      {/* ─── Categories Grid ────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {allCats.map((cat) => {
            const count = productCount(cat.slug);
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
                  {/* Product count badge */}
                  {count > 0 && (
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
                      style={{ background: `${accentColor}CC` }}>
                      {count} produit{count > 1 ? 's' : ''}
                    </span>
                  )}
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
