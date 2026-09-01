"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Link as LinkIcon, Unlink, Save, Plus, Loader2,
  AlertTriangle, CheckCircle2, Eye, Package, Globe, Archive,
  ChevronDown, ChevronRight, X, Pencil, Download, RefreshCw,
  ArrowUpDown, Filter, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ProductMaster, LinkStatus } from '@/lib/product-master-types';
import { getProductMasterLinkStatus, getProductMasterDisplayName } from '@/lib/product-master-types';
import {
  useProductMasters,
  useEnrichedProductMasters,
  saveProductMaster,
  updateProductMasterFields,
  deleteProductMaster,
  linkGestionArticle,
  unlinkGestionArticle,
  linkShopProduct,
  unlinkShopProduct,
  batchCreateFromGestionArticles,
  buildMasterFromGestionArticle,
  findAutoMatches,
} from '@/lib/product-master-service';

// ── Types ─────────────────────────────────────────────────────────────────────

type SortField = 'nameEN' | 'nameFR' | 'nameStock' | 'sellingPrice' | 'currentStockQty' | 'status';
type SortDir = 'asc' | 'desc';
type FilterLink = 'all' | 'fully_linked' | 'partial' | 'unlinked';

interface UnifiedProductsViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
  shopProducts?: any[];
  shopCategories?: any[];
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function LinkBadge({ status }: { status: LinkStatus }) {
  const config = {
    fully_linked: { label: 'LIÉ', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    partial: { label: 'PARTIEL', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
    unlinked: { label: 'NON LIÉ', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${c.color}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Module source badge ───────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'gestion' | 'shop' | 'stock' }) {
  const config = {
    gestion: { label: 'GESTION', color: 'bg-amber-50 text-amber-700' },
    shop: { label: 'SHOP', color: 'bg-blue-50 text-blue-700' },
    stock: { label: 'STOCK', color: 'bg-emerald-50 text-emerald-700' },
  };
  const c = config[source];
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${c.color}`}>
      {c.label}
    </span>
  );
}

// ── Inline Edit Cell ──────────────────────────────────────────────────────────

function InlineEditCell({
  value,
  placeholder,
  onSave,
  className = '',
}: {
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 text-xs rounded-lg border-amber-300 focus:border-amber-500 px-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false); }
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          onBlur={() => { onSave(draft); setEditing(false); }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`text-left group flex items-center gap-1 hover:bg-stone-50 rounded px-1 py-0.5 transition-colors w-full ${className}`}
    >
      <span className={`text-xs truncate ${value ? 'text-stone-900' : 'text-stone-300 italic'}`}>
        {value || placeholder}
      </span>
      <Pencil className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
    </button>
  );
}

// ── Link Dialog ───────────────────────────────────────────────────────────────

function LinkDialog({
  open,
  onOpenChange,
  master,
  items,
  type,
  onLink,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  master: ProductMaster;
  items: any[];
  type: 'gestion' | 'shop';
  onLink: (masterId: string, itemId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items.filter((item: any) =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.categoryId || item.categorySlug || '').toLowerCase().includes(q) ||
      (item.specs || '').toLowerCase().includes(q) ||
      (item.id || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [items, search]);

  const handleLink = async (itemId: string) => {
    setLinking(itemId);
    try {
      await onLink(master.id, itemId);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    }
    setLinking(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <LinkIcon className="w-4 h-4" />
          Lier {type === 'gestion' ? 'un article Gestion' : 'un produit Shop'}
        </DialogTitle>
        <p className="text-[10px] text-stone-400 -mt-2">
          Produit : <span className="font-bold text-stone-600">{master.nameEN || master.nameFR || master.id}</span>
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher ${type === 'gestion' ? 'un article...' : 'un produit...'}`}
            className="pl-9 h-9 rounded-xl text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[50vh] pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-stone-400 text-xs py-8">Aucun résultat</p>
          ) : filtered.map((item: any) => (
            <button
              key={item.id}
              onClick={() => handleLink(item.id)}
              disabled={!!linking}
              className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-amber-300 hover:bg-amber-50/50 transition-all group"
            >
              {type === 'shop' && item.images?.[0] && (
                <img src={item.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">{item.name || item.id}</p>
                <p className="text-[10px] text-stone-400 truncate">
                  {type === 'gestion'
                    ? `${item.categoryId || ''} · ${item.color || ''} · ${item.specs || ''}`
                    : `${item.categorySlug || ''} · ${item.price ? item.price + ' MAD' : ''}`
                  }
                </p>
              </div>
              {linking === item.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                <LinkIcon className="w-4 h-4 text-stone-300 group-hover:text-amber-500 transition-colors" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UnifiedProductsView({
  articles,
  factures,
  subCategories,
  generalCategories,
  shopProducts = [],
  shopCategories = [],
}: UnifiedProductsViewProps) {
  const { masters, isLoading: mastersLoading } = useProductMasters();
  const { toast } = useToast();

  // State
  const [search, setSearch] = useState('');
  const [filterLink, setFilterLink] = useState<FilterLink>('all');
  const [sortField, setSortField] = useState<SortField>('nameEN');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ master: ProductMaster; type: 'gestion' | 'shop' } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [showOnlyUnlinkedArticles, setShowOnlyUnlinkedArticles] = useState(false);

  // Enriched data
  const enriched = useEnrichedProductMasters(masters, articles, shopProducts, shopCategories, subCategories);

  // Unlinked articles (not in any ProductMaster)
  const unlinkedArticles = useMemo(() => {
    const linkedIds = new Set<string>();
    for (const pm of masters) {
      for (const aid of pm.gestionArticleIds || []) {
        linkedIds.add(aid);
      }
    }
    return articles.filter(a => !linkedIds.has(a.id));
  }, [masters, articles]);

  // Unlinked shop products
  const unlinkedShopProducts = useMemo(() => {
    const linkedIds = new Set(masters.map(pm => pm.shopProductId).filter(Boolean));
    return shopProducts.filter(p => !linkedIds.has(p.id));
  }, [masters, shopProducts]);

  // Filter & Sort
  const filteredData = useMemo(() => {
    let data = [...enriched];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(pm =>
        (pm.nameEN || '').toLowerCase().includes(q) ||
        (pm.nameFR || '').toLowerCase().includes(q) ||
        (pm.nameStock || '').toLowerCase().includes(q) ||
        (pm.nameAR || '').toLowerCase().includes(q) ||
        (pm.gestionCategoryId || '').toLowerCase().includes(q) ||
        (pm.shopCategorySlug || '').toLowerCase().includes(q) ||
        (pm.specs || '').toLowerCase().includes(q) ||
        (pm.color || '').toLowerCase().includes(q)
      );
    }

    // Filter by link status
    if (filterLink !== 'all') {
      data = data.filter(pm => getProductMasterLinkStatus(pm) === filterLink);
    }

    // Sort
    data.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case 'nameEN': va = a.nameEN || ''; vb = b.nameEN || ''; break;
        case 'nameFR': va = a.nameFR || ''; vb = b.nameFR || ''; break;
        case 'nameStock': va = a.nameStock || ''; vb = b.nameStock || ''; break;
        case 'sellingPrice': va = a.sellingPrice || 0; vb = b.sellingPrice || 0; break;
        case 'currentStockQty': va = a.currentStockQty || 0; vb = b.currentStockQty || 0; break;
        default: va = a.nameEN || ''; vb = b.nameEN || '';
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return data;
  }, [enriched, search, filterLink, sortField, sortDir]);

  // Handlers
  const handleMigrateAll = async () => {
    setMigrating(true);
    try {
      const count = await batchCreateFromGestionArticles(articles, masters);
      toast({
        title: `✅ ${count} fiches produit créées`,
        description: 'Depuis les articles Gestion non liés',
      });
    } catch (e: any) {
      toast({ title: '❌ Erreur migration', description: e.message, variant: 'destructive' });
    }
    setMigrating(false);
  };

  const handleCreateFromArticle = async (article: any) => {
    try {
      const crypto = window.crypto;
      const id = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const master = buildMasterFromGestionArticle(article);
      await saveProductMaster({ id, ...master } as ProductMaster);
      toast({ title: '✅ Fiche créée', description: `${article.name}` });
    } catch (e: any) {
      toast({ title: '❌ Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleSaveField = async (masterId: string, field: string, value: any) => {
    try {
      await updateProductMasterFields(masterId, { [field]: value });
    } catch (e: any) {
      toast({ title: '❌ Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleLinkGestion = async (masterId: string, articleId: string) => {
    await linkGestionArticle(masterId, articleId);
    toast({ title: '✅ Article lié' });
  };

  const handleUnlinkGestion = async (masterId: string, articleId: string) => {
    await unlinkGestionArticle(masterId, articleId);
    toast({ title: '🔓 Article délié' });
  };

  const handleLinkShop = async (masterId: string, shopId: string) => {
    await linkShopProduct(masterId, shopId);
    toast({ title: '✅ Produit Shop lié' });
  };

  const handleUnlinkShop = async (masterId: string) => {
    await unlinkShopProduct(masterId);
    toast({ title: '🔓 Produit Shop délié' });
  };

  const handleDeleteMaster = async (id: string) => {
    if (!confirm('Supprimer cette fiche produit unifiée ?')) return;
    await deleteProductMaster(id);
    toast({ title: '🗑️ Fiche supprimée' });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = masters.length;
    const linked = masters.filter(m => getProductMasterLinkStatus(m) === 'fully_linked').length;
    const partial = masters.filter(m => getProductMasterLinkStatus(m) === 'partial').length;
    const unlinked = masters.filter(m => getProductMasterLinkStatus(m) === 'unlinked').length;
    return { total, linked, partial, unlinked, unlinkedArticles: unlinkedArticles.length, unlinkedShopProducts: unlinkedShopProducts.length };
  }, [masters, unlinkedArticles, unlinkedShopProducts]);

  if (mastersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-6">
        <Loader2 className="animate-spin text-amber-500 w-12 h-12" />
        <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement des fiches produit...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900 uppercase flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" />
            BASE PRODUITS
          </h1>
          <p className="text-stone-400 text-xs font-bold mt-1">
            Vue unifiée de tous les produits — Gestion · Stock · Shop
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleMigrateAll}
            disabled={migrating || unlinkedArticles.length === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white h-9 rounded-xl gap-2 text-[10px] uppercase font-black tracking-widest"
          >
            {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Importer {unlinkedArticles.length} articles
          </Button>
        </div>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Fiches Produit', value: stats.total, color: 'text-stone-900', bg: 'bg-white' },
          { label: 'Entièrement liés', value: stats.linked, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Partiellement liés', value: stats.partial, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Non liés', value: stats.unlinked, color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Articles orphelins', value: stats.unlinkedArticles, color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: 'Produits Shop orphelins', value: stats.unlinkedShopProducts, color: 'text-blue-700', bg: 'bg-blue-50' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} rounded-xl border border-stone-100 p-3 shadow-sm`}>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters & Search ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white rounded-xl border border-stone-100 p-3 shadow-sm">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom (EN, FR, Stock), catégorie, couleur..."
            className="pl-9 h-9 rounded-xl text-xs border-stone-200"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-stone-400" />
          {(['all', 'fully_linked', 'partial', 'unlinked'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterLink(f)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filterLink === f
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-stone-50 text-stone-500 hover:bg-stone-100'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'fully_linked' ? 'Liés' : f === 'partial' ? 'Partiels' : 'Non liés'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1fr_1fr_120px_100px_100px_80px_60px] gap-2 px-4 py-3 bg-stone-50 border-b border-stone-100">
          {[
            { field: 'nameEN' as SortField, label: 'Nom EN (Gestion)' },
            { field: 'nameFR' as SortField, label: 'Nom FR (Shop)' },
            { field: 'nameStock' as SortField, label: 'Nom Stock' },
          ].map(({ field, label }) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className="flex items-center gap-1 text-[9px] font-black text-stone-500 uppercase tracking-wider hover:text-stone-900 transition-colors text-left"
            >
              {label}
              <ArrowUpDown className="w-3 h-3 shrink-0" />
            </button>
          ))}
          <span className="text-[9px] font-black text-stone-500 uppercase tracking-wider">Catégories</span>
          <button onClick={() => toggleSort('sellingPrice')} className="flex items-center gap-1 text-[9px] font-black text-stone-500 uppercase tracking-wider hover:text-stone-900 text-left">
            Prix Vente <ArrowUpDown className="w-3 h-3" />
          </button>
          <button onClick={() => toggleSort('currentStockQty')} className="flex items-center gap-1 text-[9px] font-black text-stone-500 uppercase tracking-wider hover:text-stone-900 text-left">
            Stock <ArrowUpDown className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-black text-stone-500 uppercase tracking-wider">Statut</span>
          <span className="text-[9px] font-black text-stone-500 uppercase tracking-wider"></span>
        </div>

        {/* Data rows */}
        {filteredData.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-12 h-12 text-stone-200 mx-auto" />
            <p className="text-stone-400 text-sm font-bold">
              {masters.length === 0
                ? 'Aucune fiche produit créée'
                : 'Aucun résultat avec ces filtres'}
            </p>
            {masters.length === 0 && unlinkedArticles.length > 0 && (
              <Button onClick={handleMigrateAll} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl gap-2 text-[10px] uppercase font-black tracking-widest">
                <Plus className="w-3.5 h-3.5" /> Importer les articles Gestion
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {filteredData.map((pm) => {
              const linkStatus = getProductMasterLinkStatus(pm);
              const isExpanded = expandedId === pm.id;

              return (
                <React.Fragment key={pm.id}>
                  {/* Main row */}
                  <div
                    className={`grid grid-cols-[1fr_1fr_1fr_120px_100px_100px_80px_60px] gap-2 px-4 py-2.5 items-center hover:bg-stone-50/50 transition-colors ${
                      isExpanded ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* Nom EN */}
                    <div className="min-w-0">
                      <InlineEditCell
                        value={pm.nameEN || ''}
                        placeholder="Nom anglais..."
                        onSave={(v) => handleSaveField(pm.id, 'nameEN', v)}
                      />
                      {pm.gestionCategoryId && (
                        <p className="text-[9px] text-stone-400 pl-1 truncate">{pm.gestionCategoryId}</p>
                      )}
                    </div>

                    {/* Nom FR */}
                    <div className="min-w-0">
                      <InlineEditCell
                        value={pm.nameFR || ''}
                        placeholder="Nom français..."
                        onSave={(v) => handleSaveField(pm.id, 'nameFR', v)}
                      />
                      {pm.shopCategorySlug && (
                        <p className="text-[9px] text-blue-400 pl-1 truncate">{(pm as any).shopCategoryName || pm.shopCategorySlug}</p>
                      )}
                    </div>

                    {/* Nom Stock */}
                    <div className="min-w-0">
                      <InlineEditCell
                        value={pm.nameStock || ''}
                        placeholder="Nom stock (libre)..."
                        onSave={(v) => handleSaveField(pm.id, 'nameStock', v)}
                        className="font-semibold"
                      />
                    </div>

                    {/* Catégories */}
                    <div className="min-w-0 space-y-0.5">
                      {pm.gestionCategoryId && <SourceBadge source="gestion" />}
                      {pm.shopCategorySlug && <SourceBadge source="shop" />}
                    </div>

                    {/* Prix Vente */}
                    <div className="min-w-0">
                      {pm.sellingPrice ? (
                        <span className="text-xs font-bold text-stone-900">
                          {pm.sellingPrice.toFixed(2)} <span className="text-stone-400 text-[9px]">MAD</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-300 italic">—</span>
                      )}
                      {pm.purchasePriceFOB ? (
                        <p className="text-[9px] text-stone-400">FOB: ${pm.purchasePriceFOB.toFixed(3)}</p>
                      ) : null}
                    </div>

                    {/* Stock */}
                    <div className="min-w-0">
                      {pm.currentStockQty != null ? (
                        <span className={`text-xs font-bold ${pm.currentStockQty > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {pm.currentStockQty}
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-300">—</span>
                      )}
                    </div>

                    {/* Statut liaison */}
                    <LinkBadge status={linkStatus} />

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : pm.id)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-100 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-stone-50/50 border-t border-stone-100 px-6 py-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Gestion Articles */}
                        <div className="bg-white rounded-xl border border-stone-100 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Archive className="w-3.5 h-3.5" /> Articles Gestion
                            </h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLinkDialog({ master: pm, type: 'gestion' })}
                              className="h-7 px-2 text-[9px] font-black uppercase tracking-wider text-amber-600 hover:bg-amber-50"
                            >
                              <Plus className="w-3 h-3 mr-1" /> Lier
                            </Button>
                          </div>
                          {(pm as any).linkedArticles?.length > 0 ? (
                            <div className="space-y-2">
                              {(pm as any).linkedArticles.map((a: any) => (
                                <div key={a.id} className="flex items-center justify-between p-2 bg-amber-50/50 rounded-lg">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-stone-900 truncate">{a.name}</p>
                                    <p className="text-[9px] text-stone-400">{a.categoryId} · {a.color} · {a.specs}</p>
                                  </div>
                                  <button
                                    onClick={() => handleUnlinkGestion(pm.id, a.id)}
                                    className="shrink-0 p-1 rounded hover:bg-red-100 text-stone-400 hover:text-red-600 transition-colors"
                                    title="Délier"
                                  >
                                    <Unlink className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-stone-300 text-center py-3">Aucun article lié</p>
                          )}
                        </div>

                        {/* Shop Product */}
                        <div className="bg-white rounded-xl border border-stone-100 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5" /> Produit Shop
                            </h4>
                            {!pm.shopProductId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setLinkDialog({ master: pm, type: 'shop' })}
                                className="h-7 px-2 text-[9px] font-black uppercase tracking-wider text-blue-600 hover:bg-blue-50"
                              >
                                <Plus className="w-3 h-3 mr-1" /> Lier
                              </Button>
                            )}
                          </div>
                          {(pm as any).linkedShopProduct ? (
                            <div className="flex items-center gap-3 p-2 bg-blue-50/50 rounded-lg">
                              {(pm as any).linkedShopProduct.images?.[0] && (
                                <img src={(pm as any).linkedShopProduct.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-stone-900 truncate">{(pm as any).linkedShopProduct.name}</p>
                                <p className="text-[9px] text-stone-400">{(pm as any).linkedShopProduct.categorySlug} · {(pm as any).linkedShopProduct.price} MAD</p>
                              </div>
                              <button
                                onClick={() => handleUnlinkShop(pm.id)}
                                className="shrink-0 p-1 rounded hover:bg-red-100 text-stone-400 hover:text-red-600 transition-colors"
                                title="Délier"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-stone-300 text-center py-3">Aucun produit shop lié</p>
                          )}
                        </div>

                        {/* Prix & Stock Detail */}
                        <div className="bg-white rounded-xl border border-stone-100 p-4">
                          <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                            <Tag className="w-3.5 h-3.5" /> Détails
                          </h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-stone-400">Prix FOB</span>
                              <span className="font-bold">{pm.purchasePriceFOB ? `$${pm.purchasePriceFOB.toFixed(3)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Prix MAD (revient)</span>
                              <span className="font-bold">{pm.purchasePriceMAD ? `${pm.purchasePriceMAD.toFixed(2)} MAD` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Prix de vente</span>
                              <span className="font-bold text-emerald-700">{pm.sellingPrice ? `${pm.sellingPrice.toFixed(2)} MAD` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Prix de gros</span>
                              <span className="font-bold">{pm.wholesalePrice ? `${pm.wholesalePrice.toFixed(2)} MAD` : '—'}</span>
                            </div>
                            <hr className="border-stone-100" />
                            <div className="flex justify-between">
                              <span className="text-stone-400">Couleur</span>
                              <span className="font-bold">{pm.color || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Unité</span>
                              <span className="font-bold">{pm.unitOfMeasure || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Specs</span>
                              <span className="font-bold truncate ml-2">{pm.specs || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Fournisseur</span>
                              <span className="font-bold">{pm.supplierId || '—'}</span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-stone-100 flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteMaster(pm.id)}
                              className="h-7 px-2 text-[9px] font-black uppercase tracking-wider text-red-500 hover:bg-red-50"
                            >
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Unlinked Articles Section ──────────────────────────────────────── */}
      {unlinkedArticles.length > 0 && (
        <div className="bg-orange-50/50 rounded-xl border border-orange-200 p-4">
          <button
            onClick={() => setShowOnlyUnlinkedArticles(!showOnlyUnlinkedArticles)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showOnlyUnlinkedArticles ? <ChevronDown className="w-4 h-4 text-orange-500" /> : <ChevronRight className="w-4 h-4 text-orange-500" />}
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-[11px] font-black text-orange-700 uppercase tracking-wider">
              {unlinkedArticles.length} articles Gestion sans fiche produit
            </span>
          </button>
          {showOnlyUnlinkedArticles && (
            <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
              {unlinkedArticles.map(a => (
                <div key={a.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-orange-100">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-stone-900 truncate">{a.name}</p>
                    <p className="text-[9px] text-stone-400">{a.categoryId} · {a.color} · {a.supplierId}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCreateFromArticle(a)}
                    className="h-7 px-2 text-[9px] font-black uppercase tracking-wider text-orange-600 hover:bg-orange-100 shrink-0"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Créer fiche
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Link Dialog ────────────────────────────────────────────────────── */}
      {linkDialog && (
        <LinkDialog
          open={!!linkDialog}
          onOpenChange={(v) => !v && setLinkDialog(null)}
          master={linkDialog.master}
          items={linkDialog.type === 'gestion' ? unlinkedArticles : unlinkedShopProducts}
          type={linkDialog.type}
          onLink={linkDialog.type === 'gestion' ? handleLinkGestion : handleLinkShop}
        />
      )}
    </div>
  );
}
