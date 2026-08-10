'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Package, Zap, CheckCircle, XCircle,
  MessageCircle, RefreshCw, Layers, Sparkles, BookOpen,
  ArrowDown, ArrowUp, Phone, ChevronDown, Search, X,
  Eye, Star, Info, Ruler, Weight, Box, Tag,
  Shield, Wrench, Globe, Palette, ChevronLeft,
} from 'lucide-react';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';

// ─── Intersection Observer ────────────────────────────────────────────────────
function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Stock Indicator ─────────────────────────────────────────────────────────
function StockDot({ inStock }: { inStock: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inStock ? 'bg-emerald-500' : 'bg-red-400'}`}
        style={inStock ? { boxShadow: '0 0 6px rgba(16,185,129,0.4)' } : {}} />
      <span className={`text-[11px] font-semibold ${inStock ? 'text-emerald-600' : 'text-red-400'}`}>
        {inStock ? 'Disponible' : 'Indisponible'}
      </span>
    </span>
  );
}

// ─── Spec Row (for product sheet) ─────────────────────────────────────────────
function SpecRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#F0ECE8] last:border-0">
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-[#C8102E] mt-0.5">
        {icon || <Info className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">{label}</p>
        <p className="text-sm text-[#1A1A1A] leading-relaxed">{value}</p>
      </div>
    </div>
  );
}

// ─── PRODUCT SHEET MODAL (Fiche Produit Complète) ─────────────────────────────
function ProductSheet({ product, onClose }: { product: ShopProduct; onClose: () => void }) {
  const [activeImg, setActiveImg] = useState(0);

  // Collect all specs
  const technicalSpecs: { label: string; value: string; icon?: React.ReactNode }[] = [
    { label: 'Matériau', value: product.material || '', icon: <Layers className="w-3.5 h-3.5" /> },
    { label: 'Type de produit', value: product.typeProduit || '' },
    { label: 'Spécification', value: product.specification || '' },
    { label: 'Couleur', value: product.couleur || '', icon: <Palette className="w-3.5 h-3.5" /> },
    { label: 'Largeur', value: product.width || '', icon: <Ruler className="w-3.5 h-3.5" /> },
    { label: 'Largeur maille', value: product.largeurMaille || '' },
    { label: 'Longueur', value: product.longueur || '', icon: <Ruler className="w-3.5 h-3.5" /> },
    { label: 'Poids', value: product.weight ? `${product.weight} g` : '', icon: <Weight className="w-3.5 h-3.5" /> },
    { label: 'Emballage', value: product.packaging || '', icon: <Box className="w-3.5 h-3.5" /> },
    { label: 'Matière / Mailles', value: product.matiereMailles || '' },
    { label: 'Composition ruban', value: product.compositionRuban || '' },
    { label: 'Type', value: product.type || '' },
    { label: 'Design', value: product.design || '', icon: <Palette className="w-3.5 h-3.5" /> },
    { label: 'Résistance', value: product.resistance || '', icon: <Shield className="w-3.5 h-3.5" /> },
    { label: 'Sécurité', value: product.securite || '', icon: <Shield className="w-3.5 h-3.5" /> },
    { label: 'Compatible avec', value: product.compatibleAvec || '', icon: <Wrench className="w-3.5 h-3.5" /> },
    { label: 'Pays de fabrication', value: product.paysFabrication || '', icon: <Globe className="w-3.5 h-3.5" /> },
  ].filter(s => s.value);

  const infoSpecs: { label: string; value: string }[] = [
    { label: 'Applications', value: product.applications || '' },
    { label: 'Avantages', value: product.avantages || '' },
    { label: 'Conseils d\'entretien', value: product.conseilsEntretien || '' },
    { label: 'Information commerciale', value: product.informationCommerciale || '' },
  ].filter(s => s.value);

  const variants = product.variants || [];
  const images = product.images || [];
  const hasDetailedInfo = technicalSpecs.length > 0 || infoSpecs.length > 0 || product.description;

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-4xl max-h-[92vh] mt-[4vh] mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ animation: 'sheetIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0ECE8] flex-shrink-0 bg-[#FDFBF8]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#C8102E]/8 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-[#C8102E]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#1A1A1A] truncate">Fiche Produit</h2>
              <p className="text-[10px] text-gray-400">{product.categoryName || product.categorySlug} {product.sku ? `· Réf: ${product.sku}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <StockDot inStock={product.inStock} />
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-[#F0ECE8] text-gray-400 hover:text-gray-600 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col lg:flex-row">

            {/* Left — Images */}
            <div className="lg:w-[45%] p-6 lg:border-r border-[#F0ECE8] bg-[#FDFBF8]">
              {/* Main image */}
              <div className="aspect-square rounded-2xl overflow-hidden bg-[#F0ECE8] mb-3 relative">
                {images[activeImg] ? (
                  <img src={images[activeImg]} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-gray-200" />
                  </div>
                )}
                {!product.inStock && (
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-red-500/90 text-white text-[10px] font-bold uppercase">
                    Indisponible
                  </div>
                )}
                {product.isNew && (
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#3B82F6] text-white text-[10px] font-bold uppercase">
                    Nouveau
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                        i === activeImg ? 'border-[#C8102E] shadow-md' : 'border-[#E8E4DF] hover:border-[#C8102E]/30'
                      }`}
                    >
                      <img src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Variants */}
              {variants.length > 0 && (
                <div className="mt-5 pt-5 border-t border-[#F0ECE8]">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Variantes disponibles ({variants.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {variants.map(v => (
                      <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E8E4DF] bg-white text-xs">
                        {v.colorHex && (
                          <span className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0"
                            style={{ background: v.colorHex }} />
                        )}
                        {v.image && (
                          <img src={v.image} alt={v.color || ''} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="text-[#1A1A1A] font-medium">{v.color || v.size || v.sku || v.id}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          v.stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                        }`}>
                          {v.stock > 0 ? 'Dispo' : 'Épuisé'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right — Product info */}
            <div className="lg:w-[55%] p-6">
              {/* Title */}
              <h1 className="text-xl sm:text-2xl font-black text-[#1A1A1A] leading-tight mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {product.name}
              </h1>

              {/* Tags */}
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {product.tags.slice(0, 6).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#F0ECE8] text-gray-500 uppercase tracking-wider">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {product.description && (
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-[#C8102E] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Info className="w-3 h-3" /> Description
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.description}</p>
                </div>
              )}

              {/* Technical specs */}
              {technicalSpecs.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-[#C8102E] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" /> Caractéristiques techniques
                  </h3>
                  <div className="bg-[#FDFBF8] rounded-xl border border-[#F0ECE8] px-4 divide-y divide-[#F0ECE8]">
                    {technicalSpecs.map(spec => (
                      <SpecRow key={spec.label} label={spec.label} value={spec.value} icon={spec.icon} />
                    ))}
                  </div>
                </div>
              )}

              {/* Additional info */}
              {infoSpecs.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-[#C8102E] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Informations complémentaires
                  </h3>
                  <div className="space-y-4">
                    {infoSpecs.map(spec => (
                      <div key={spec.label}>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{spec.label}</p>
                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{spec.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No detailed info fallback */}
              {!hasDetailedInfo && (
                <div className="text-center py-8">
                  <Info className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Détails techniques non disponibles pour ce produit.</p>
                  <p className="text-gray-300 text-xs mt-1">Contactez-nous pour plus d'informations.</p>
                </div>
              )}

              {/* CTA */}
              <div className="mt-6 pt-5 border-t border-[#F0ECE8]">
                <p className="text-[10px] text-gray-400 mb-3 uppercase tracking-wider font-bold">Intéressé par ce produit ?</p>
                <div className="flex gap-3">
                  <a
                    href={`https://wa.me/212760998347?text=${encodeURIComponent(`Bonjour LEBTEX, je suis intéressé par le produit "${product.name}" (${product.sku || product.id}). Pouvez-vous m'envoyer les prix et disponibilités ?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1eba57] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Demander les prix
                  </a>
                  <Link
                    href={`/shop/produit/${product.slug}`}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-[#E8E4DF] text-[#1A1A1A] text-sm font-bold hover:border-[#C8102E] hover:text-[#C8102E] transition-all"
                  >
                    <Eye className="w-4 h-4" />
                    Voir en boutique
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sheetIn {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({
  category,
  products,
  index,
  subCategories,
  allProducts,
  onOpenSheet,
}: {
  category: ShopCategory;
  products: ShopProduct[];
  index: number;
  subCategories: ShopCategory[];
  allProducts: ShopProduct[];
  onOpenSheet: (p: ShopProduct) => void;
}) {
  const { ref, visible } = useReveal();
  const accentColor = category.color || '#C8102E';
  const availableCount = products.filter(p => p.inStock).length;

  return (
    <section
      id={`cat-${category.slug}`}
      ref={ref}
      className="scroll-mt-24 transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
      }}
    >
      {/* Category header */}
      <div className="relative mb-8 overflow-hidden rounded-2xl">
        <div className="h-32 sm:h-40 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)` }}>
          {category.image && (
            <img src={category.image} alt={category.name} className="absolute inset-0 w-full h-full object-cover opacity-15" />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accentColor}12 0%, transparent 70%)` }} />
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

          <div className="relative h-full flex items-center px-8 sm:px-12">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{category.icon || '🧵'}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full border"
                  style={{ color: accentColor, borderColor: `${accentColor}40`, background: `${accentColor}08` }}>
                  Section {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#1A1A1A]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {category.name}
              </h2>
              {category.description && (
                <p className="text-gray-500 text-sm mt-1.5 max-w-lg">{category.description}</p>
              )}
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1.5">
              <span className="text-3xl font-black" style={{ color: accentColor }}>{products.length}</span>
              <span className="text-xs text-gray-400 font-medium">produit{products.length > 1 ? 's' : ''}</span>
              <span className="text-[10px] text-emerald-600 font-semibold">{availableCount} disponible{availableCount > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-categories */}
      {subCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 px-1">
          {subCategories.map(sub => {
            const subCount = allProducts.filter(p => p.categorySlug === sub.slug).length;
            return (
              <span key={sub.slug} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#F0ECE8] text-gray-600 border border-[#E8E4DF]">
                {sub.icon || '📂'} {sub.name}
                <span className="text-gray-400 ml-0.5">({subCount})</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Products grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
        {products.map((product, pi) => {
          const img = product.images?.[0];
          return (
            <button
              key={product.id}
              onClick={() => onOpenSheet(product)}
              className="group relative flex flex-col bg-white rounded-xl overflow-hidden border border-[#E8E4DF] hover:border-[#C8102E]/25 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-left"
            >
              {/* Image */}
              <div className="relative aspect-square overflow-hidden bg-[#F8F5F0]">
                {img ? (
                  <img src={img} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F0ECE8] to-[#E8E4DF]">
                    <Package className="w-10 h-10 text-gray-300" />
                  </div>
                )}

                {!product.inStock && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                    <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-500 text-[10px] font-bold uppercase tracking-wider">
                      Indisponible
                    </span>
                  </div>
                )}

                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {product.isNew && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#3B82F6] text-white">New</span>
                  )}
                </div>

                {/* Hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all duration-300 flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100">
                  <span className="flex items-center gap-1 px-3 py-1 rounded-lg bg-white/95 text-[#1A1A1A] text-[10px] font-semibold shadow-md backdrop-blur-sm">
                    <BookOpen className="w-3 h-3" /> Fiche produit
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 flex flex-col flex-1">
                <h3 className="text-xs sm:text-sm font-bold text-[#1A1A1A] leading-snug line-clamp-2 group-hover:text-[#C8102E] transition-colors flex-1">
                  {product.name}
                </h3>
                {product.shortDescription && (
                  <p className="text-[10px] text-gray-400 line-clamp-1 mt-1">{product.shortDescription}</p>
                )}
                <div className="mt-2.5 pt-2 border-t border-[#F0ECE8] flex items-center justify-between">
                  <StockDot inStock={product.inStock} />
                  <span className="text-[9px] text-[#C8102E] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                    Voir la fiche →
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mt-14 flex items-center gap-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#E8E4DF] to-transparent" />
      </div>
    </section>
  );
}

// ─── Main Catalogue Page ──────────────────────────────────────────────────────
export default function CataloguePage() {
  const { products, categories, isLoading } = useShopProducts();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);

  const rootCats = useMemo(() => categories.filter(c => !c.parentSlug), [categories]);

  const categorySections = useMemo(() => {
    return rootCats.map(cat => {
      const subCats = categories.filter(c => c.parentSlug === cat.slug);
      const subSlugs = subCats.map(c => c.slug);
      const catProducts = products.filter(p =>
        p.categorySlug === cat.slug || subSlugs.includes(p.categorySlug)
      );
      return { category: cat, products: catProducts, subCategories: subCats };
    }).filter(s => s.products.length > 0);
  }, [rootCats, categories, products]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return categorySections;
    const q = searchQuery.toLowerCase();
    return categorySections.map(s => ({
      ...s,
      products: s.products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.shortDescription || '').toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      ),
    })).filter(s => s.products.length > 0);
  }, [categorySections, searchQuery]);

  const totalProducts = products.length;
  const inStockCount = products.filter(p => p.inStock).length;
  const lastUpdate = new Date();

  const scrollTo = (slug: string) => {
    const el = document.getElementById(`cat-${slug}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen" style={{ background: '#FDFBF8', fontFamily: "'Inter', sans-serif" }}>

      {/* ─── PRODUCT SHEET MODAL ──────────────────────────────────────────── */}
      {selectedProduct && (
        <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}

      {/* ─── COVER PAGE ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0C0C0C 0%, #1A1A1A 40%, #1C0A0D 100%)' }} />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[100px]"
          style={{ background: '#C8102E' }} />
        <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full opacity-[0.05] blur-[80px]"
          style={{ background: '#D4A843' }} />

        <div className="relative max-w-6xl mx-auto px-6 sm:px-10 py-20 sm:py-28 text-center">
          <nav className="flex items-center justify-center gap-1.5 text-[11px] text-white/25 mb-10">
            <Link href="/shop" className="hover:text-white/50 transition-colors">Accueil</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/50">Catalogue</span>
          </nav>

          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full mb-8 border border-[#D4A843]/25 bg-[#D4A843]/8">
            <BookOpen className="w-4 h-4 text-[#D4A843]" />
            <span className="text-[#D4A843] text-xs font-bold tracking-[0.15em] uppercase">Catalogue Produits {new Date().getFullYear()}</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}>
            LEB<span style={{ color: '#C8102E' }}>TEX</span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/30 font-light mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Mercerie & Accessoires Textiles
          </p>
          <p className="text-white/20 text-sm max-w-md mx-auto leading-relaxed mt-4">
            Catalogue interactif avec fiches produits complètes — les disponibilités changent automatiquement selon notre stock réel.
          </p>

          <div className="flex items-center justify-center gap-8 mt-10 text-xs text-white/25">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-400/60">Stock en direct</span>
            </div>
            <span>{totalProducts} produits</span>
            <span>{inStockCount} disponibles</span>
            <span>{rootCats.length} catégories</span>
          </div>

          <div className="mt-12 animate-bounce">
            <ArrowDown className="w-5 h-5 text-white/15 mx-auto" />
          </div>
        </div>
      </section>

      {/* ─── INTELLIGENT BANNER ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#C8102E] to-[#a50d25] py-3 px-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-white">
            <Zap className="w-4 h-4 text-yellow-300 flex-shrink-0" />
            <span className="text-sm font-medium">
              <strong>Catalogue intelligent</strong> — cliquez sur un produit pour voir sa fiche technique complète.
            </span>
          </div>
          <div className="flex items-center gap-2 text-white/70 text-xs flex-shrink-0">
            <RefreshCw className="w-3 h-3" />
            Mis à jour à {lastUpdate.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ─── SOMMAIRE ─────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-[#E8E4DF]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#C8102E]/8 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[#C8102E]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#1A1A1A]" style={{ fontFamily: "'Outfit', sans-serif" }}>Sommaire</h2>
                <p className="text-xs text-gray-400 mt-0.5">{categorySections.length} sections · {totalProducts} produits · Cliquez pour naviguer</p>
              </div>
            </div>
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
              <input
                id="catalogue-search"
                type="text"
                placeholder="Rechercher un produit…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E8E4DF] text-sm text-[#1A1A1A] placeholder-gray-300 focus:outline-none focus:border-[#C8102E]/40 bg-[#FDFBF8] transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorySections.map((section, i) => {
              const cat = section.category;
              const accentColor = cat.color || '#C8102E';
              const availableCount = section.products.filter(p => p.inStock).length;
              const subCount = section.subCategories.length;
              return (
                <button
                  key={cat.slug}
                  onClick={() => scrollTo(cat.slug)}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-[#E8E4DF] bg-[#FDFBF8] hover:bg-white hover:border-[#C8102E]/20 hover:shadow-md transition-all duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black"
                    style={{ background: `${accentColor}10`, color: accentColor }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base leading-none">{cat.icon || '🧵'}</span>
                      <h3 className="text-sm font-bold text-[#1A1A1A] truncate group-hover:text-[#C8102E] transition-colors">{cat.name}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>{section.products.length} produit{section.products.length > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span className="text-emerald-500 font-medium">{availableCount} dispo</span>
                      {subCount > 0 && <><span>·</span><span>{subCount} sous-cat.</span></>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#C8102E] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Mobile search ────────────────────────────────────────────────── */}
      <div className="sm:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E8E4DF] px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher dans le catalogue…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#E8E4DF] text-sm text-[#1A1A1A] placeholder-gray-300 focus:outline-none focus:border-[#C8102E]/40 bg-white transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── CATALOGUE CONTENT ────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-12 space-y-16">
        {isLoading ? (
          <div className="space-y-12">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-36 rounded-2xl bg-[#F0ECE8] mb-6" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="rounded-xl overflow-hidden">
                      <div className="aspect-square bg-[#F0ECE8]" />
                      <div className="p-3 space-y-2 bg-white border border-[#E8E4DF] border-t-0 rounded-b-xl">
                        <div className="h-3 bg-[#F0ECE8] rounded w-3/4" />
                        <div className="h-2 bg-[#F0ECE8] rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-3xl bg-[#F0ECE8] flex items-center justify-center mb-5">
              <Search className="w-9 h-9 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">Aucun produit trouvé</h3>
            <p className="text-gray-400 text-sm max-w-xs mb-6">Essayez avec un autre mot-clé.</p>
            <button
              onClick={() => setSearchQuery('')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8102E] text-white text-sm font-semibold hover:bg-[#a50d25] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Voir tout le catalogue
            </button>
          </div>
        ) : (
          filteredSections.map((section, i) => (
            <CategorySection
              key={section.category.slug}
              category={section.category}
              products={section.products}
              subCategories={section.subCategories}
              allProducts={products}
              index={i}
              onOpenSheet={setSelectedProduct}
            />
          ))
        )}
      </div>

      {/* ─── BOTTOM CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-[#E8E4DF] bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F0F0F] mb-8">
            <Star className="w-4 h-4 text-[#D4A843]" />
            <span className="text-white/80 text-xs font-semibold tracking-wide">LEBTEX — Votre partenaire mercerie</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1A1A1A] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Besoin d'information ?
          </h2>
          <p className="text-gray-500 text-base mb-10 max-w-lg mx-auto">
            Contactez-nous pour les prix, quantités minimales, ou toute question. Notre équipe vous répond rapidement.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/212760998347?text=Bonjour%20LEBTEX%2C%20j'ai%20consulté%20votre%20catalogue%20et%20j'aimerais%20avoir%20plus%20d'informations."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#1eba57] transition-colors shadow-lg shadow-green-500/20"
            >
              <MessageCircle className="w-5 h-5" />
              Demander les prix — WhatsApp
            </a>
            <a
              href="tel:+212760998347"
              className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl border-2 border-[#E8E4DF] text-[#1A1A1A] font-bold text-sm hover:border-[#C8102E] hover:text-[#C8102E] transition-all"
            >
              <Phone className="w-5 h-5" />
              +212 760 998 347
            </a>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-2 mt-12 text-xs text-gray-400 hover:text-[#C8102E] transition-colors font-medium"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            Retour au sommaire
          </button>
        </div>
      </section>

      {/* Footer note */}
      <div className="bg-[#0F0F0F] py-6">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/20 text-xs">© {new Date().getFullYear()} LEBTEX — Catalogue produits. Tous droits réservés.</p>
          <div className="flex items-center gap-2 text-white/15 text-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Disponibilités actualisées en temps réel
          </div>
        </div>
      </div>
    </div>
  );
}
