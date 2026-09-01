"use client";

import React, { useState, useMemo } from 'react';
import {
  Search, Package, ChevronDown, ChevronRight, X,
  DollarSign, MapPin, Truck, Calendar, Tag, Boxes,
  Globe, Archive, ShoppingCart, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface UnifiedProductsViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
}

// ── Fiche Produit Détaillée ───────────────────────────────────────────────────

function ProductFiche({ article, facture, category, generalCategory }: {
  article: any;
  facture: any;
  category: any;
  generalCategory: any;
}) {
  const [open, setOpen] = useState(false);

  // Nom d'affichage
  const displayName = article.name || article.specs || 'Produit';

  // Status
  const status = article.status || article.effectiveStatus || 'TO_ORDER';
  const statusConfig: Record<string, { label: string; color: string }> = {
    TO_ORDER: { label: 'À commander', color: 'bg-stone-100 text-stone-600' },
    PI: { label: 'Production', color: 'bg-blue-50 text-blue-700' },
    SHIPPED: { label: 'Expédié', color: 'bg-purple-50 text-purple-700' },
    TRANSIT: { label: 'Transit', color: 'bg-amber-50 text-amber-700' },
    CUSTOMS: { label: 'Douane', color: 'bg-orange-50 text-orange-700' },
    STOCK: { label: 'En stock', color: 'bg-emerald-50 text-emerald-700' },
    DELIVERED: { label: 'Livré', color: 'bg-green-50 text-green-700' },
  };
  const sc = statusConfig[status] || statusConfig.TO_ORDER;

  // Prix
  const prixFOB = Number(article.purchasePricePerUnit) || 0;
  const prixMAD = Number(article.purchasePriceMAD) || 0;
  const sellingPrice = Number(article.sellingPrice) || 0;
  const qty = Number(article.quantity) || 0;
  const cbm = Number(article.cubicMeasurement) || 0;
  const netWeight = Number(article.netWeight) || 0;

  // Douane
  const hsCode = category?.hsCode || '';
  const customsValuePerKg = Number(category?.customsValuePerKg) || 0;
  const importDutyRate = Number(category?.importDutyRate) || 0;
  const tpiRate = Number(category?.tpiRate) || 0;
  const tvaRate = Number(category?.tvaRate) || 0;

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header — toujours visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-stone-50/50 transition-colors"
      >
        {/* Indicateur couleur */}
        <div
          className="w-2 h-10 rounded-full shrink-0"
          style={{
            backgroundColor:
              status === 'STOCK' ? '#10b981' :
              status === 'TRANSIT' ? '#f59e0b' :
              status === 'PI' ? '#3b82f6' :
              status === 'CUSTOMS' ? '#f97316' :
              '#d1d5db'
          }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-stone-900 truncate">{displayName}</p>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${sc.color}`}>
              {sc.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-stone-400 font-bold">
            <span>{article.categoryId || '—'}</span>
            <span>·</span>
            <span>{article.color || '—'}</span>
            <span>·</span>
            <span>{article.supplierId || '—'}</span>
            <span>·</span>
            <span>{qty} {article.unitOfMeasure || ''}</span>
            {prixFOB > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-600">${prixFOB.toFixed(3)}/u</span>
              </>
            )}
          </div>
        </div>

        {open ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />}
      </button>

      {/* Détails — affiché quand ouvert */}
      {open && (
        <div className="border-t border-stone-100 px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* ── Identité Produit ───────────────────────────── */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Package className="w-3.5 h-3.5" /> Identité Produit
              </h4>
              <div className="space-y-1.5">
                <Row label="Nom" value={article.name} />
                <Row label="Spécifications" value={article.specs} />
                <Row label="Couleur" value={article.color} />
                <Row label="Taille" value={article.size} />
                <Row label="Catégorie" value={article.categoryId} />
                <Row label="Groupe" value={generalCategory?.name} />
                <Row label="Unité" value={article.unitOfMeasure} />
                {article.zipperType && <Row label="Type Fermeture" value={article.zipperType} />}
                {article.slider && <Row label="Curseur" value={article.slider} />}
                {article.sliderType && <Row label="Type Curseur" value={article.sliderType} />}
                <Row label="ID Article" value={article.id} mono />
              </div>
            </div>

            {/* ── Prix & Quantités ───────────────────────────── */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <DollarSign className="w-3.5 h-3.5" /> Prix & Quantités
              </h4>
              <div className="space-y-1.5">
                <Row label="Quantité" value={`${qty} ${article.unitOfMeasure || ''}`} bold />
                <Row label="Prix FOB (USD)" value={prixFOB > 0 ? `$${prixFOB.toFixed(4)}` : '—'} />
                <Row label="Valeur FOB totale" value={prixFOB > 0 ? `$${(prixFOB * qty).toFixed(2)}` : '—'} />
                <Row label="Prix MAD (revient)" value={prixMAD > 0 ? `${prixMAD.toFixed(2)} MAD` : '—'} />
                <Row label="Prix de vente" value={sellingPrice > 0 ? `${sellingPrice.toFixed(2)} MAD` : '—'} highlight />
                {sellingPrice > 0 && prixMAD > 0 && (
                  <Row label="Marge" value={`${((sellingPrice - prixMAD) / sellingPrice * 100).toFixed(1)}%`} highlight />
                )}
                <Row label="CBM" value={cbm > 0 ? `${cbm.toFixed(2)} m³` : '—'} />
                <Row label="Poids net" value={netWeight > 0 ? `${netWeight.toFixed(2)} kg` : '—'} />
              </div>
            </div>

            {/* ── Logistique & Dates ────────────────────────── */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Truck className="w-3.5 h-3.5" /> Logistique & Dates
              </h4>
              <div className="space-y-1.5">
                <Row label="Statut" value={sc.label} />
                <Row label="Fournisseur" value={article.supplierId} bold />
                <Row label="Date commande" value={article.orderDate} />
                <Row label="Date arrivée" value={article.arrivalDate || facture?.arrivalDate} />
                <Row label="Entrée stock" value={article.stockEntryDate || facture?.stockEntryDate} />
                <Row label="N° Facture" value={article.factureId} mono />
                {facture && (
                  <>
                    <Row label="N° BL" value={facture.noBL} />
                    <Row label="Ligne maritime" value={facture.shippingLine} />
                    <Row label="Transitaire" value={facture.forwarder} />
                    <Row label="Déclarant" value={facture.declaringCompany} />
                    <Row label="Fret ($)" value={facture.freightCost ? `$${Number(facture.freightCost).toFixed(2)}` : '—'} />
                  </>
                )}
                <Row label="Priorité" value={article.priority} />
              </div>
            </div>

            {/* ── Douane & Fiscalité ────────────────────────── */}
            {(hsCode || customsValuePerKg > 0) && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                  <Archive className="w-3.5 h-3.5" /> Douane & Fiscalité
                </h4>
                <div className="space-y-1.5">
                  <Row label="Code HS" value={hsCode} mono />
                  <Row label="Valeur douane/kg" value={customsValuePerKg > 0 ? `${customsValuePerKg} MAD/kg` : '—'} />
                  <Row label="Droit import (DI)" value={importDutyRate > 0 ? `${importDutyRate}%` : '—'} />
                  <Row label="TPI" value={tpiRate > 0 ? `${tpiRate}%` : '—'} />
                  <Row label="TVA" value={tvaRate > 0 ? `${tvaRate}%` : '—'} />
                  {netWeight > 0 && customsValuePerKg > 0 && (
                    <>
                      <Row label="Val. douane totale" value={`${(netWeight * customsValuePerKg).toFixed(2)} MAD`} />
                      <Row label="DI estimé" value={`${(netWeight * customsValuePerKg * importDutyRate / 100).toFixed(2)} MAD`} />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Dossier (Facture) ─────────────────────────── */}
            {facture && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                  <Boxes className="w-3.5 h-3.5" /> Dossier Import
                </h4>
                <div className="space-y-1.5">
                  <Row label="N° Dossier" value={facture.id} mono bold />
                  <Row label="Fournisseur" value={facture.supplierId} />
                  <Row label="Date expédition" value={facture.shippingDate} />
                  <Row label="Date arrivée" value={facture.arrivalDate} />
                  <Row label="Entrée stock" value={facture.stockEntryDate} />
                  <Row label="Facture payée (MAD)" value={facture.invoicePaidDhs ? `${Number(facture.invoicePaidDhs).toFixed(2)} MAD` : '—'} />
                  <Row label="Valeur déclarée" value={facture.declaredValue ? `$${Number(facture.declaredValue).toFixed(2)}` : '—'} />
                  <Row label="Douane payée (MAD)" value={facture.customsPaidDhs ? `${Number(facture.customsPaidDhs).toFixed(2)} MAD` : '—'} />
                  <Row label="Frais transit" value={facture.supplierInvoiceAmount ? `${Number(facture.supplierInvoiceAmount).toFixed(2)} MAD` : '—'} />
                  <Row label="Frais change" value={facture.exchangeInvoiceAmount ? `${Number(facture.exchangeInvoiceAmount).toFixed(2)} MAD` : '—'} />
                  <Row label="Frais additionnels" value={facture.additionalCostsAmount ? `${Number(facture.additionalCostsAmount).toFixed(2)} MAD` : '—'} />
                </div>
              </div>
            )}

            {/* ── Stock (répartition par magasin) ───────────── */}
            {article.initialQtyByStore && Object.keys(article.initialQtyByStore).length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                  <MapPin className="w-3.5 h-3.5" /> Répartition Stock
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(article.initialQtyByStore).map(([store, qty]: [string, any]) => (
                    <Row key={store} label={store} value={`${qty} ${article.unitOfMeasure || ''}`} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Breakdown Couleurs ─────────────────────────── */}
            {article.colorBreakdown && article.colorBreakdown.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                  <Tag className="w-3.5 h-3.5" /> Détail Couleurs
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {article.colorBreakdown.map((cb: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-stone-500">{cb.colorCode || cb.color || cb.description || `Couleur ${i+1}`}</span>
                      <span className="font-bold text-stone-900">{cb.rolls || cb.quantity || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Breakdown Tailles ──────────────────────────── */}
            {article.sizeBreakdown && article.sizeBreakdown.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                  <Tag className="w-3.5 h-3.5" /> Détail Tailles
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {article.sizeBreakdown.map((sb: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-stone-500">{sb.size || sb.label || `Taille ${i+1}`}</span>
                      <span className="font-bold text-stone-900">{sb.quantity || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, value, bold, mono, highlight }: {
  label: string;
  value?: string | number | null;
  bold?: boolean;
  mono?: boolean;
  highlight?: boolean;
}) {
  const display = value != null && value !== '' && value !== '—' ? String(value) : '—';
  const isEmpty = display === '—';
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-stone-400 shrink-0">{label}</span>
      <span className={`text-right truncate ${
        isEmpty ? 'text-stone-200' :
        highlight ? 'text-emerald-700 font-black' :
        bold ? 'font-black text-stone-900' :
        mono ? 'font-mono text-[10px] text-stone-500' :
        'font-bold text-stone-700'
      }`}>
        {display}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UnifiedProductsView({
  articles,
  factures,
  subCategories,
  generalCategories,
}: UnifiedProductsViewProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [expandAll, setExpandAll] = useState(false);

  // Build lookup maps
  const factureMap = useMemo(() => new Map(factures.map(f => [f.id, f])), [factures]);
  const categoryMap = useMemo(() => new Map(subCategories.map(c => [c.name || c.id, c])), [subCategories]);
  const genCatMap = useMemo(() => new Map(generalCategories.map(g => [g.id, g])), [generalCategories]);

  // Unique values for filters
  const categories = useMemo(() => [...new Set(articles.map(a => a.categoryId).filter(Boolean))].sort(), [articles]);
  const statuses = useMemo(() => [...new Set(articles.map(a => a.status || a.effectiveStatus).filter(Boolean))].sort(), [articles]);
  const suppliers = useMemo(() => [...new Set(articles.map(a => a.supplierId).filter(Boolean))].sort(), [articles]);

  // Filter & search
  const filtered = useMemo(() => {
    let data = [...articles];

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.categoryId || '').toLowerCase().includes(q) ||
        (a.color || '').toLowerCase().includes(q) ||
        (a.specs || '').toLowerCase().includes(q) ||
        (a.supplierId || '').toLowerCase().includes(q) ||
        (a.factureId || '').toLowerCase().includes(q) ||
        (a.id || '').toLowerCase().includes(q)
      );
    }

    if (filterCategory !== 'all') data = data.filter(a => a.categoryId === filterCategory);
    if (filterStatus !== 'all') data = data.filter(a => (a.status || a.effectiveStatus) === filterStatus);
    if (filterSupplier !== 'all') data = data.filter(a => a.supplierId === filterSupplier);

    // Sort by category then name
    data.sort((a, b) => {
      const ca = (a.categoryId || '').localeCompare(b.categoryId || '');
      if (ca !== 0) return ca;
      return (a.name || '').localeCompare(b.name || '');
    });

    return data;
  }, [articles, search, filterCategory, filterStatus, filterSupplier]);

  // Stats
  const totalValue = useMemo(() =>
    articles.reduce((sum, a) => sum + (Number(a.purchasePricePerUnit) || 0) * (Number(a.quantity) || 0), 0),
    [articles]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach(a => {
      const s = a.status || a.effectiveStatus || 'TO_ORDER';
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [articles]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-stone-900 uppercase flex items-center gap-2">
          <Package className="w-6 h-6 text-amber-500" />
          FICHES PRODUITS
        </h1>
        <p className="text-stone-400 text-xs font-bold mt-1">
          {articles.length} produits · Valeur FOB totale : ${totalValue.toFixed(2)}
        </p>
      </div>

      {/* ── Stats rapides ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
          const labels: Record<string, string> = {
            TO_ORDER: 'À commander', PI: 'Production', SHIPPED: 'Expédié',
            TRANSIT: 'Transit', CUSTOMS: 'Douane', STOCK: 'En stock', DELIVERED: 'Livré',
          };
          const colors: Record<string, string> = {
            TO_ORDER: 'bg-stone-100 text-stone-600', PI: 'bg-blue-50 text-blue-700',
            SHIPPED: 'bg-purple-50 text-purple-700', TRANSIT: 'bg-amber-50 text-amber-700',
            CUSTOMS: 'bg-orange-50 text-orange-700', STOCK: 'bg-emerald-50 text-emerald-700',
            DELIVERED: 'bg-green-50 text-green-700',
          };
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                filterStatus === status ? 'ring-2 ring-amber-400 shadow-sm' : ''
              } ${colors[status] || 'bg-stone-100 text-stone-600'}`}
            >
              {labels[status] || status} · {count}
            </button>
          );
        })}
      </div>

      {/* ── Filtres ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white rounded-xl border border-stone-100 p-3 shadow-sm">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, catégorie, couleur, fournisseur, facture..."
            className="pl-9 h-9 rounded-xl text-xs border-stone-200"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-stone-400" />
            </button>
          )}
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="h-9 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white"
        >
          <option value="all">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="h-9 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white"
        >
          <option value="all">Tous fournisseurs</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <Button
          variant="ghost"
          onClick={() => setExpandAll(!expandAll)}
          className="h-9 px-3 text-[10px] font-black uppercase tracking-wider text-stone-500 hover:text-stone-900"
        >
          {expandAll ? 'Replier tout' : 'Déplier tout'}
        </Button>
      </div>

      {/* ── Résultats ──────────────────────────────────────── */}
      <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
        {filtered.length} produit{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
      </p>

      {/* ── Liste des fiches ───────────────────────────────── */}
      <div className="space-y-2">
        {filtered.map(article => {
          const facture = article.factureId ? factureMap.get(article.factureId) : null;
          const category = article.categoryId ? categoryMap.get(article.categoryId) : null;
          const generalCategory = article.generalCategoryId ? genCatMap.get(article.generalCategoryId) : null;

          // Force expand all
          if (expandAll) {
            return (
              <ProductFicheExpanded
                key={article.id}
                article={article}
                facture={facture}
                category={category}
                generalCategory={generalCategory}
              />
            );
          }

          return (
            <ProductFiche
              key={article.id}
              article={article}
              facture={facture}
              category={category}
              generalCategory={generalCategory}
            />
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-400 text-sm font-bold">Aucun produit trouvé</p>
        </div>
      )}
    </div>
  );
}

// Version toujours ouverte (pour "déplier tout")
function ProductFicheExpanded({ article, facture, category, generalCategory }: {
  article: any; facture: any; category: any; generalCategory: any;
}) {
  const displayName = article.name || article.specs || 'Produit';
  const status = article.status || article.effectiveStatus || 'TO_ORDER';
  const statusConfig: Record<string, { label: string; color: string }> = {
    TO_ORDER: { label: 'À commander', color: 'bg-stone-100 text-stone-600' },
    PI: { label: 'Production', color: 'bg-blue-50 text-blue-700' },
    SHIPPED: { label: 'Expédié', color: 'bg-purple-50 text-purple-700' },
    TRANSIT: { label: 'Transit', color: 'bg-amber-50 text-amber-700' },
    CUSTOMS: { label: 'Douane', color: 'bg-orange-50 text-orange-700' },
    STOCK: { label: 'En stock', color: 'bg-emerald-50 text-emerald-700' },
    DELIVERED: { label: 'Livré', color: 'bg-green-50 text-green-700' },
  };
  const sc = statusConfig[status] || statusConfig.TO_ORDER;
  const prixFOB = Number(article.purchasePricePerUnit) || 0;
  const prixMAD = Number(article.purchasePriceMAD) || 0;
  const sellingPrice = Number(article.sellingPrice) || 0;
  const qty = Number(article.quantity) || 0;
  const cbm = Number(article.cubicMeasurement) || 0;
  const netWeight = Number(article.netWeight) || 0;
  const hsCode = category?.hsCode || '';
  const customsValuePerKg = Number(category?.customsValuePerKg) || 0;
  const importDutyRate = Number(category?.importDutyRate) || 0;
  const tpiRate = Number(category?.tpiRate) || 0;
  const tvaRate = Number(category?.tvaRate) || 0;

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 bg-stone-50/50 border-b border-stone-100">
        <div className="w-2 h-10 rounded-full shrink-0" style={{
          backgroundColor: status === 'STOCK' ? '#10b981' : status === 'TRANSIT' ? '#f59e0b' : status === 'PI' ? '#3b82f6' : status === 'CUSTOMS' ? '#f97316' : '#d1d5db'
        }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-stone-900 truncate">{displayName}</p>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${sc.color}`}>{sc.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-stone-400 font-bold">
            <span>{article.categoryId || '—'}</span><span>·</span>
            <span>{article.color || '—'}</span><span>·</span>
            <span>{article.supplierId || '—'}</span><span>·</span>
            <span>{qty} {article.unitOfMeasure || ''}</span>
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2"><Package className="w-3.5 h-3.5" /> Identité</h4>
            <div className="space-y-1.5">
              <Row label="Nom" value={article.name} /><Row label="Specs" value={article.specs} /><Row label="Couleur" value={article.color} /><Row label="Catégorie" value={article.categoryId} /><Row label="Groupe" value={generalCategory?.name} /><Row label="Unité" value={article.unitOfMeasure} />
              {article.zipperType && <Row label="Type Fermeture" value={article.zipperType} />}
              {article.slider && <Row label="Curseur" value={article.slider} />}
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2"><DollarSign className="w-3.5 h-3.5" /> Prix & Qté</h4>
            <div className="space-y-1.5">
              <Row label="Quantité" value={`${qty} ${article.unitOfMeasure || ''}`} bold /><Row label="Prix FOB" value={prixFOB > 0 ? `$${prixFOB.toFixed(4)}` : '—'} /><Row label="Valeur FOB" value={prixFOB > 0 ? `$${(prixFOB * qty).toFixed(2)}` : '—'} /><Row label="Prix MAD" value={prixMAD > 0 ? `${prixMAD.toFixed(2)} MAD` : '—'} /><Row label="Prix vente" value={sellingPrice > 0 ? `${sellingPrice.toFixed(2)} MAD` : '—'} highlight /><Row label="CBM" value={cbm > 0 ? `${cbm.toFixed(2)} m³` : '—'} /><Row label="Poids" value={netWeight > 0 ? `${netWeight.toFixed(2)} kg` : '—'} />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2"><Truck className="w-3.5 h-3.5" /> Logistique</h4>
            <div className="space-y-1.5">
              <Row label="Fournisseur" value={article.supplierId} bold /><Row label="Cmd" value={article.orderDate} /><Row label="Arrivée" value={article.arrivalDate || facture?.arrivalDate} /><Row label="Stock" value={article.stockEntryDate || facture?.stockEntryDate} /><Row label="Facture" value={article.factureId} mono />
              {facture && <><Row label="Fret" value={facture.freightCost ? `$${Number(facture.freightCost).toFixed(2)}` : '—'} /><Row label="Transitaire" value={facture.forwarder} /></>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
