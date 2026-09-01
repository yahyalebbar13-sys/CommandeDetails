"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Package, Search, DollarSign, Truck, Layers, BarChart3,
  ChevronLeft, ArrowRight, Tag, Boxes, Calendar, MapPin,
  Hash, Factory
} from 'lucide-react';

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];

interface UnifiedProductsViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
}

// ── Row helper ────────────────────────────────────────────────────────────────
function Row({ label, value, bold, mono, highlight, icon: Icon }: {
  label: string; value?: string | number | null; bold?: boolean; mono?: boolean; highlight?: boolean; icon?: any;
}) {
  const display = value != null && value !== '' ? String(value) : '—';
  const isEmpty = display === '—';
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px]">
      <span className="text-stone-400 font-bold uppercase flex items-center gap-1 shrink-0">
        {Icon && <Icon className="w-2.5 h-2.5" />}{label}
      </span>
      <span className={`text-right truncate ${
        isEmpty ? 'text-stone-200' : highlight ? 'text-emerald-700 font-black' : bold ? 'font-black text-stone-900' : mono ? 'font-mono text-[9px] text-stone-500' : 'font-black text-stone-700'
      }`}>{display}</span>
    </div>
  );
}

export default function UnifiedProductsView({
  articles, factures, subCategories, generalCategories,
}: UnifiedProductsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const factureMap = useMemo(() => new Map(factures.map(f => [f.id, f])), [factures]);
  const categoryMap = useMemo(() => new Map(subCategories.map(c => [c.name || c.id, c])), [subCategories]);
  const genCatMap = useMemo(() => new Map(generalCategories.map(g => [g.id, g])), [generalCategories]);

  // ── Group articles by category ──────────────────────────────────────────────
  const grouped = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    let data = articles.filter(a => {
      if (lowerSearch && !(
        (a.name || '').toLowerCase().includes(lowerSearch) ||
        (a.categoryId || '').toLowerCase().includes(lowerSearch) ||
        (a.color || '').toLowerCase().includes(lowerSearch) ||
        (a.specs || '').toLowerCase().includes(lowerSearch) ||
        (a.supplierId || '').toLowerCase().includes(lowerSearch)
      )) return false;
      if (filterCategory !== 'all' && a.categoryId !== filterCategory) return false;
      if (filterSupplier !== 'all' && a.supplierId !== filterSupplier) return false;
      if (filterStatus !== 'all' && (a.status || a.effectiveStatus) !== filterStatus) return false;
      return true;
    });

    const groups = new Map<string, any[]>();
    data.forEach(a => {
      const cat = a.categoryId || 'Sans catégorie';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(a);
    });

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles, searchTerm, filterCategory, filterSupplier, filterStatus]);

  // ── Category stats for grid cards ───────────────────────────────────────────
  const categoryStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalValue: number; statusCounts: Record<string, number>; suppliers: Set<string>; nextArrival: string }>();
    articles.forEach(a => {
      const cat = a.categoryId || 'Sans catégorie';
      if (!stats.has(cat)) stats.set(cat, { count: 0, totalValue: 0, statusCounts: {}, suppliers: new Set(), nextArrival: '' });
      const s = stats.get(cat)!;
      s.count++;
      s.totalValue += (Number(a.purchasePricePerUnit) || 0) * (Number(a.quantity) || 0);
      const status = a.status || a.effectiveStatus || 'TO_ORDER';
      s.statusCounts[status] = (s.statusCounts[status] || 0) + 1;
      if (a.supplierId) s.suppliers.add(a.supplierId);
      if (a.arrivalDate && new Date(a.arrivalDate) > new Date()) {
        if (!s.nextArrival || a.arrivalDate < s.nextArrival) s.nextArrival = a.arrivalDate;
      }
    });
    return stats;
  }, [articles]);

  const categories = useMemo(() => [...new Set(articles.map(a => a.categoryId).filter(Boolean))].sort(), [articles]);
  const suppliers = useMemo(() => [...new Set(articles.map(a => a.supplierId).filter(Boolean))].sort(), [articles]);
  const statuses = useMemo(() => [...new Set(articles.map(a => a.status || a.effectiveStatus).filter(Boolean))].sort(), [articles]);

  // Global KPIs
  const globalKPIs = useMemo(() => {
    const totalValue = articles.reduce((s, a) => s + (Number(a.purchasePricePerUnit) || 0) * (Number(a.quantity) || 0), 0);
    const totalProducts = articles.length;
    const totalCategories = categories.length;
    const inTransit = articles.filter(a => a.status === 'TRANSIT' || a.status === 'SHIPPED').length;
    const inStock = articles.filter(a => a.status === 'STOCK').length;
    return { totalValue, totalProducts, totalCategories, inTransit, inStock };
  }, [articles, categories]);

  const maxValue = useMemo(() => Math.max(...Array.from(categoryStats.values()).map(s => s.totalValue), 1), [categoryStats]);

  // ── If a product is selected → show its full detail page ────────────────────
  const selectedArticle = selectedProduct ? articles.find(a => a.id === selectedProduct) : null;

  if (selectedArticle) {
    const facture = selectedArticle.factureId ? factureMap.get(selectedArticle.factureId) : null;
    const category = selectedArticle.categoryId ? categoryMap.get(selectedArticle.categoryId) : null;
    const generalCategory = selectedArticle.generalCategoryId ? genCatMap.get(selectedArticle.generalCategoryId) : null;
    const status = selectedArticle.status || selectedArticle.effectiveStatus || 'TO_ORDER';
    const prixFOB = Number(selectedArticle.purchasePricePerUnit) || 0;
    const prixMAD = Number(selectedArticle.purchasePriceMAD) || 0;
    const sellingPrice = Number(selectedArticle.sellingPrice) || 0;
    const qty = Number(selectedArticle.quantity) || 0;
    const cbm = Number(selectedArticle.cubicMeasurement) || 0;
    const netWeight = Number(selectedArticle.netWeight) || 0;
    const hsCode = category?.hsCode || '';
    const importDutyRate = Number(category?.importDutyRate) || 0;
    const customsValuePerKg = Number(category?.customsValuePerKg) || 0;
    const tpiRate = Number(category?.tpiRate) || 0;
    const tvaRate = Number(category?.tvaRate) || 0;

    const statusLabels: Record<string, string> = { TO_ORDER: 'À commander', PI: 'Production', SHIPPED: 'Expédié', TRANSIT: 'Transit', CUSTOMS: 'Douane', STOCK: 'En stock', DELIVERED: 'Livré' };
    const statusColors: Record<string, string> = { TO_ORDER: '#9ca3af', PI: '#3b82f6', SHIPPED: '#8b5cf6', TRANSIT: '#f59e0b', CUSTOMS: '#f97316', STOCK: '#10b981', DELIVERED: '#22c55e' };
    const sColor = statusColors[status] || '#9ca3af';

    // Find all articles with same categoryId (siblings)
    const siblings = articles.filter(a => a.categoryId === selectedArticle.categoryId && a.id !== selectedArticle.id);

    return (
      <div className="space-y-6 fade-in">
        {/* Back + Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setSelectedProduct(null)} className="h-10 w-10 rounded-xl hover:bg-stone-100 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-0.5" style={{ color: sColor }}>{statusLabels[status] || status}</p>
            <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tighter truncate">{selectedArticle.name || selectedArticle.specs || 'Produit'}</h1>
            <p className="text-xs text-stone-400 font-bold mt-0.5">
              {selectedArticle.categoryId} · {selectedArticle.color || '—'} · {selectedArticle.supplierId || '—'}
            </p>
          </div>
          <div className="px-4 py-2 rounded-xl border-2" style={{ borderColor: sColor, backgroundColor: `${sColor}10`, color: sColor }}>
            <p className="text-[9px] font-black uppercase tracking-widest">{statusLabels[status]}</p>
          </div>
        </div>

        {/* Full detail grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Identité */}
          <Card className="border-none shadow-md rounded-2xl overflow-hidden">
            <div className="h-1 w-full" style={{ backgroundColor: sColor }} />
            <CardContent className="p-5 space-y-2">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Package className="w-3.5 h-3.5" /> Identité Produit</h4>
              <Row label="Nom" value={selectedArticle.name} bold />
              <Row label="Spécifications" value={selectedArticle.specs} />
              <Row label="Couleur" value={selectedArticle.color} />
              <Row label="Taille" value={selectedArticle.size} />
              <Row label="Catégorie" value={selectedArticle.categoryId} />
              <Row label="Groupe" value={generalCategory?.name} />
              <Row label="Unité" value={selectedArticle.unitOfMeasure} />
              {selectedArticle.zipperType && <Row label="Type Fermeture" value={selectedArticle.zipperType} />}
              {selectedArticle.slider && <Row label="Curseur" value={selectedArticle.slider} />}
              {selectedArticle.sliderType && <Row label="Type Curseur" value={selectedArticle.sliderType} />}
              <Row label="ID" value={selectedArticle.id} mono />
            </CardContent>
          </Card>

          {/* Prix & Quantités */}
          <Card className="border-none shadow-md rounded-2xl overflow-hidden">
            <div className="h-1 w-full bg-emerald-500" />
            <CardContent className="p-5 space-y-2">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><DollarSign className="w-3.5 h-3.5" /> Prix & Quantités</h4>
              <Row label="Quantité" value={`${qty.toLocaleString('fr-MA')} ${selectedArticle.unitOfMeasure || ''}`} bold />
              <Row label="Prix FOB (USD)" value={prixFOB > 0 ? `$${prixFOB.toFixed(4)}` : '—'} />
              <Row label="Valeur FOB totale" value={prixFOB > 0 ? `$${(prixFOB * qty).toFixed(2)}` : '—'} bold />
              <Row label="Prix MAD (revient)" value={prixMAD > 0 ? `${prixMAD.toFixed(2)} MAD` : '—'} />
              <Row label="Prix de vente" value={sellingPrice > 0 ? `${sellingPrice.toFixed(2)} MAD` : '—'} highlight />
              {sellingPrice > 0 && prixMAD > 0 && <Row label="Marge" value={`${((sellingPrice - prixMAD) / sellingPrice * 100).toFixed(1)}%`} highlight />}
              <Row label="CBM" value={cbm > 0 ? `${cbm.toFixed(2)} m³` : '—'} />
              <Row label="Poids net" value={netWeight > 0 ? `${netWeight.toFixed(2)} kg` : '—'} />
              <Row label="Poids brut" value={selectedArticle.grossWeight ? `${Number(selectedArticle.grossWeight).toFixed(2)} kg` : '—'} />
              <Row label="Cartons" value={selectedArticle.numberOfCartons} />
            </CardContent>
          </Card>

          {/* Logistique & Dates */}
          <Card className="border-none shadow-md rounded-2xl overflow-hidden">
            <div className="h-1 w-full bg-blue-500" />
            <CardContent className="p-5 space-y-2">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Truck className="w-3.5 h-3.5" /> Logistique</h4>
              <Row label="Fournisseur" value={selectedArticle.supplierId} bold />
              <Row label="Date commande" value={selectedArticle.orderDate} />
              <Row label="Date arrivée" value={selectedArticle.arrivalDate || facture?.arrivalDate} />
              <Row label="Entrée stock" value={selectedArticle.stockEntryDate || facture?.stockEntryDate} />
              <Row label="Client" value={selectedArticle.clientName} />
              <Row label="Priorité" value={selectedArticle.priority} />
              <Row label="Notes" value={selectedArticle.notes} />
            </CardContent>
          </Card>

          {/* Dossier Import */}
          {facture && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-violet-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Boxes className="w-3.5 h-3.5" /> Dossier Import</h4>
                <Row label="N° Dossier" value={facture.id} bold mono />
                <Row label="N° BL" value={facture.noBL} />
                <Row label="Fournisseur" value={facture.supplierId} />
                <Row label="Ligne maritime" value={facture.shippingLine} />
                <Row label="Transitaire" value={facture.forwarder} />
                <Row label="Déclarant" value={facture.declaringCompany} />
                <Row label="Date expédition" value={facture.shippingDate} />
                <Row label="Date arrivée" value={facture.arrivalDate} />
                <Row label="Entrée stock" value={facture.stockEntryDate} />
                <Row label="Fret ($)" value={facture.freightCost ? `$${Number(facture.freightCost).toFixed(2)}` : '—'} />
                <Row label="Facture payée" value={facture.invoicePaidDhs ? `${Number(facture.invoicePaidDhs).toFixed(2)} MAD` : '—'} />
                <Row label="Douane payée" value={facture.customsPaidDhs ? `${Number(facture.customsPaidDhs).toFixed(2)} MAD` : '—'} />
                <Row label="Val. déclarée" value={facture.declaredValue ? `$${Number(facture.declaredValue).toFixed(2)}` : '—'} />
                <Row label="Frais transit" value={facture.supplierInvoiceAmount ? `${Number(facture.supplierInvoiceAmount).toFixed(2)} MAD` : '—'} />
                <Row label="Frais change" value={facture.exchangeInvoiceAmount ? `${Number(facture.exchangeInvoiceAmount).toFixed(2)} MAD` : '—'} />
                <Row label="Frais add." value={facture.additionalCostsAmount ? `${Number(facture.additionalCostsAmount).toFixed(2)} MAD` : '—'} />
              </CardContent>
            </Card>
          )}

          {/* Douane */}
          {(hsCode || customsValuePerKg > 0) && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-orange-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Hash className="w-3.5 h-3.5" /> Douane & Fiscalité</h4>
                <Row label="Code HS" value={hsCode} mono bold />
                <Row label="Val. douane/kg" value={customsValuePerKg > 0 ? `${customsValuePerKg} MAD/kg` : '—'} />
                <Row label="Droit import (DI)" value={importDutyRate > 0 ? `${importDutyRate}%` : '—'} />
                <Row label="TPI" value={tpiRate > 0 ? `${tpiRate}%` : '—'} />
                <Row label="TVA" value={tvaRate > 0 ? `${tvaRate}%` : '—'} />
                {netWeight > 0 && customsValuePerKg > 0 && (
                  <>
                    <Row label="Val. douane totale" value={`${(netWeight * customsValuePerKg).toFixed(2)} MAD`} bold />
                    <Row label="DI estimé" value={`${(netWeight * customsValuePerKg * importDutyRate / 100).toFixed(2)} MAD`} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stock par magasin */}
          {selectedArticle.initialQtyByStore && Object.keys(selectedArticle.initialQtyByStore).length > 0 && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-teal-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><MapPin className="w-3.5 h-3.5" /> Stock par Magasin</h4>
                {Object.entries(selectedArticle.initialQtyByStore).map(([store, q]: [string, any]) => (
                  <Row key={store} label={store} value={`${q} ${selectedArticle.unitOfMeasure || ''}`} bold />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Couleurs / Tailles */}
          {selectedArticle.colorBreakdown?.length > 0 && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-pink-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Tag className="w-3.5 h-3.5" /> Détail Couleurs</h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {selectedArticle.colorBreakdown.map((cb: any, i: number) => (
                    <Row key={i} label={cb.colorCode || cb.color || cb.description || `#${i+1}`} value={cb.rolls || cb.quantity || 0} bold />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedArticle.sizeBreakdown?.length > 0 && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-indigo-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Tag className="w-3.5 h-3.5" /> Détail Tailles</h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {selectedArticle.sizeBreakdown.map((sb: any, i: number) => (
                    <Row key={i} label={sb.size || sb.label || `#${i+1}`} value={sb.quantity || 0} bold />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Produits similaires (même catégorie) */}
        {siblings.length > 0 && (
          <div className="space-y-3 mt-6">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-wider">Même catégorie · {siblings.length} autres produits</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {siblings.slice(0, 10).map((sib, i) => (
                <button key={sib.id} onClick={() => setSelectedProduct(sib.id)}
                  className="text-left bg-white rounded-xl border border-stone-100 p-3 hover:shadow-md transition-all hover:border-amber-300 active:scale-95">
                  <p className="text-[10px] font-black text-stone-800 uppercase tracking-tighter truncate">{sib.name || sib.specs}</p>
                  <p className="text-[8px] text-stone-400 mt-0.5">{sib.color} · {sib.supplierId}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MAIN VIEW : Category cards grid (like Groupes page) ─────────────────────
  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-[120px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em] mb-2">Vue Consolidée</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              Fiches<br /><span className="text-amber-500">Produits</span>
            </h1>
            <p className="text-stone-400 text-xs font-medium mt-3 max-w-sm">
              Tous les produits avec détails complets — prix, logistique, douane, stock.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {[
              { label: 'Produits', value: globalKPIs.totalProducts, icon: Package, color: 'text-amber-400' },
              { label: 'Catégories', value: globalKPIs.totalCategories, icon: Layers, color: 'text-blue-400' },
              { label: 'En Transit', value: globalKPIs.inTransit, icon: Truck, color: 'text-emerald-400' },
              { label: 'Valeur FOB', value: `${(globalKPIs.totalValue / 1000).toFixed(1)}k $`, icon: DollarSign, color: 'text-violet-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md text-center">
                <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher un produit..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-white rounded-xl" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="h-10 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white">
          <option value="all">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
          className="h-10 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white">
          <option value="all">Tous fournisseurs</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-10 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white">
          <option value="all">Tous statuts</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Content : sections by category ── */}
      <div className="space-y-10">
        {grouped.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <Package className="w-12 h-12 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">Aucun produit trouvé</p>
          </div>
        ) : (
          grouped.map(([categoryName, categoryArticles], groupIdx) => {
            const color = UI_COLORS[groupIdx % UI_COLORS.length];
            const stats = categoryStats.get(categoryName);

            return (
              <div key={categoryName} className="space-y-4">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: color }} />
                    <h3 className="text-lg font-black text-stone-900 uppercase tracking-tighter">{categoryName}</h3>
                    <span className="text-[8px] font-black text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full uppercase">
                      {categoryArticles.length} produits
                    </span>
                  </div>
                  {stats && (
                    <span className="text-[10px] font-black text-stone-500 uppercase">
                      {stats.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                    </span>
                  )}
                </div>

                {/* Product cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {categoryArticles.map((article: any, index: number) => {
                    const status = article.status || article.effectiveStatus || 'TO_ORDER';
                    const statusLabels: Record<string, string> = { TO_ORDER: 'À CMD', PI: 'PROD', SHIPPED: 'EXPÉDIÉ', TRANSIT: 'TRANSIT', CUSTOMS: 'DOUANE', STOCK: 'STOCK', DELIVERED: 'LIVRÉ' };
                    const statusColors: Record<string, string> = { TO_ORDER: '#9ca3af', PI: '#3b82f6', SHIPPED: '#8b5cf6', TRANSIT: '#f59e0b', CUSTOMS: '#f97316', STOCK: '#10b981', DELIVERED: '#22c55e' };
                    const sColor = statusColors[status] || '#9ca3af';
                    const prixFOB = Number(article.purchasePricePerUnit) || 0;
                    const qty = Number(article.quantity) || 0;
                    const barWidth = maxValue > 0 ? Math.max(4, ((prixFOB * qty) / maxValue) * 100) : 4;

                    return (
                      <Card key={article.id} onClick={() => setSelectedProduct(article.id)}
                        className="group cursor-pointer border-none bg-white shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95">
                        <div className="h-1 w-full" style={{ backgroundColor: sColor }} />
                        <CardContent className="p-4">
                          {/* Status + Supplier */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: `${sColor}15`, color: sColor }}>
                              <Package className="w-3.5 h-3.5" />
                            </div>
                            <span className="px-2 py-0.5 rounded text-[7px] font-black uppercase" style={{ backgroundColor: `${sColor}15`, color: sColor }}>
                              {statusLabels[status] || status}
                            </span>
                          </div>

                          {/* Name */}
                          <h3 className="text-[11px] font-black text-stone-800 uppercase leading-tight tracking-tighter group-hover:text-stone-900 line-clamp-2 min-h-[2rem] mb-1">
                            {article.name || article.specs || 'Produit'}
                          </h3>
                          <p className="text-[8px] text-stone-400 font-bold truncate mb-3">
                            {article.color || '—'} · {article.supplierId || '—'}
                          </p>

                          {/* Value bar */}
                          <div className="mb-3">
                            <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, backgroundColor: sColor }} />
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="pt-2 border-t border-stone-50 space-y-1.5">
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" /> FOB</span>
                              <span className="font-black text-stone-900">{prixFOB > 0 ? `$${prixFOB.toFixed(3)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1"><Boxes className="w-2.5 h-2.5" /> QTÉ</span>
                              <span className="font-black text-stone-900">{qty.toLocaleString('fr-MA')} {article.unitOfMeasure || ''}</span>
                            </div>
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" /> VALEUR</span>
                              <span className="font-black" style={{ color }}>{(prixFOB * qty).toLocaleString('en-US', { maximumFractionDigits: 0 })} $</span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-3 flex justify-between items-center">
                            <span className="text-[7px] font-black text-stone-300 uppercase">{article.factureId ? 'DOSSIER LIÉ' : ''}</span>
                            <div className="p-1 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              <ArrowRight className="w-2.5 h-2.5 text-stone-900" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
