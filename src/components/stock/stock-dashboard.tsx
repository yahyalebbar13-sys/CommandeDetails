"use client";

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Boxes,
  ArrowLeftRight,
  Bell,
  DollarSign,
  ArrowRight,
  Package,
  ShoppingBag,
  BarChart3,
  Eye,
  Calendar,
  Activity,
  Store as StoreIcon,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Warehouse
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { StockMovement, StockItem, Sale, StoreLocation, Store, ClientPayment, Invoice } from '@/lib/types';

type StockView = 'dashboard' | 'pos' | 'inventory' | 'sales' | 'movements' | 'alerts';

interface StockDashboardProps {
  stockItems: StockItem[];
  allStockItems?: StockItem[];
  articles?: any[];
  movements: StockMovement[];
  categories: any[];
  generalCategories?: any[];
  sales: Sale[];
  invoices?: Invoice[];
  clients?: any[];
  payments?: ClientPayment[];
  userRole?: 'ADMIN' | 'COMMERCIAL';
  activeStore: StoreLocation | 'ALL' | 'ALL_MAIN';
  stores: Store[];
  onNavigate: (v: StockView) => void;
}

const EMERALD_SHADES = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];
const STORE_COLORS: Record<string, string> = {
  CHRIFA: '#059669',
  DERB_OMAR: '#8b5cf6',
  IDAA: '#f59e0b',
  ENTREPOT: '#3b82f6',
};
const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const fmt$ = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
const fmtN = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export default function StockDashboard({
  stockItems,
  allStockItems,
  articles = [],
  movements,
  categories,
  generalCategories = [],
  sales,
  invoices = [],
  clients = [],
  payments = [],
  userRole = 'ADMIN',
  activeStore,
  stores,
  onNavigate,
}: StockDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales'>('overview');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  // Filtre Magasin local au Dashboard (pour Admin)
  const [dashboardStore, setDashboardStore] = useState<string>('ALL');

  // Filtres Période
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [periodPreset, setPeriodPreset] = useState<'today' | 'this_month' | 'last_month' | 'this_year' | 'all' | 'custom'>('this_month');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: firstDayOfMonth,
    to: todayStr,
  });

  // Filtres Ventes & Marges
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Gestion du magasin effectif
  const effectiveStoreId = userRole === 'COMMERCIAL' 
    ? (activeStore !== 'ALL' && activeStore !== 'ALL_MAIN' ? activeStore : 'CHRIFA') 
    : dashboardStore;

  // Handler changement de preset de date
  const handlePeriodChange = (preset: 'today' | 'this_month' | 'last_month' | 'this_year' | 'all' | 'custom') => {
    setPeriodPreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setDateRange({ from: d, to: d });
    } else if (preset === 'this_month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];
      setDateRange({ from, to });
    } else if (preset === 'last_month') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setDateRange({ from, to });
    } else if (preset === 'this_year') {
      const from = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];
      setDateRange({ from, to });
    } else if (preset === 'all') {
      setDateRange({ from: '2020-01-01', to: now.toISOString().split('T')[0] });
    }
  };

  // ── 1. DICTIONNAIRE DE RÉSOLUTION DES ARTICLES & COÛTS D'ACHAT ────────────
  const articlesMap = useMemo(() => {
    const map = new Map<string, any>();
    articles.forEach(a => { if (a.id) map.set(a.id, a); });
    return map;
  }, [articles]);

  const stockItemsLookup = useMemo(() => {
    const list = allStockItems && allStockItems.length > 0 ? allStockItems : stockItems;
    const map = new Map<string, StockItem>();
    list.forEach(si => {
      if (si.articleId) map.set(si.articleId, si);
      if (si._realArticleId) map.set(si._realArticleId, si);
    });
    return { map, list };
  }, [allStockItems, stockItems]);

  const resolveItemCostPrice = React.useCallback((it: any): number => {
    if (it.costPrice != null && Number(it.costPrice) > 0) return Number(it.costPrice);
    if (it.purchasePricePerUnit != null && Number(it.purchasePricePerUnit) > 0) return Number(it.purchasePricePerUnit);

    // 1. Recherche par articleId
    if (it.articleId) {
      const si = stockItemsLookup.map.get(it.articleId);
      if (si && si.purchasePricePerUnit > 0) return si.purchasePricePerUnit;
      const art = articlesMap.get(it.articleId);
      if (art) {
        const p = Number(art.purchasePriceMAD) || Number(art.purchasePricePerUnit) || 0;
        if (p > 0) return p;
      }
    }

    // 2. Recherche par Nom + Couleur + Taille
    const itName = (it.productName || it.name || '').trim().toLowerCase();
    const itColor = (it.color || '').trim().toLowerCase();
    const itSize = (it.size || '').trim().toLowerCase();

    for (const si of stockItemsLookup.list) {
      const siName = (si.productName || '').trim().toLowerCase();
      const siColor = (si.color || '').trim().toLowerCase();
      const siSize = (si.size || '').trim().toLowerCase();
      if (siName === itName && siColor === itColor && siSize === itSize && si.purchasePricePerUnit > 0) {
        return si.purchasePricePerUnit;
      }
    }

    // 3. Recherche par Nom uniquement
    for (const si of stockItemsLookup.list) {
      if ((si.productName || '').trim().toLowerCase() === itName && si.purchasePricePerUnit > 0) {
        return si.purchasePricePerUnit;
      }
    }

    // 4. Recherche dans les articles bruts
    for (const art of articles) {
      const artName = (art.name || art.specs || '').trim().toLowerCase();
      if (artName && artName === itName) {
        const p = Number(art.purchasePriceMAD) || Number(art.purchasePricePerUnit) || 0;
        if (p > 0) return p;
      }
    }

    return 0;
  }, [stockItemsLookup, articlesMap, articles]);

  // ── 2. MOTEUR DE NORMALISATION UNIFIÉ (FACTURES & VENTES) ─────────────────
  const normalizedSales = useMemo(() => {
    const list: any[] = [];
    const seenInvoiceIds = new Set<string>();

    // Traitement des factures (source principale de vérité des caisses & ventes)
    (invoices || []).filter(inv => inv.status !== 'CANCELLED').forEach(inv => {
      seenInvoiceIds.add(inv.id);
      const client = clients.find(c => c.id === inv.clientId);
      const totalAmount = Number(inv.totalAfterDiscount ?? inv.totalAmount ?? 0);
      const subTotal = Number(inv.totalAmount ?? totalAmount);
      const discount = Number(inv.discount || 0);

      // Calcul des items et des coûts réels
      let calculatedTotalCost = 0;
      const items = (inv.items || []).map((it: any) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.unitPrice || it.sellingPrice || 0);
        const totalPrice = Number(it.totalPrice || (qty * unitPrice));
        const unitCost = resolveItemCostPrice(it);
        const totalCost = unitCost * qty;
        const margin = totalPrice - totalCost;
        calculatedTotalCost += totalCost;

        return {
          articleId: it.articleId || '',
          productName: it.productName || it.name || 'Article',
          color: it.color,
          size: it.size,
          unitOfMeasure: it.unitOfMeasure,
          qty,
          unitPrice,
          totalPrice,
          unitCost,
          totalCost,
          margin,
          marginRate: totalPrice > 0 ? (margin / totalPrice) * 100 : 0,
        };
      });

      const totalCost = calculatedTotalCost;
      const totalMargin = totalAmount - totalCost;
      const marginRate = totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0;

      // Calcul de la trésorerie liée (Encaissé vs En attente Chèque/LC vs Reste dû)
      const invPayments = payments.filter(p => p.invoiceId === inv.id);
      let confirmedPaid = 0;
      let pendingEffects = 0;

      if (invPayments.length > 0) {
        invPayments.forEach(p => {
          const amt = Number(p.amount || 0);
          if (p.method === 'CHEQUE' || p.method === 'LC' || p.method === 'EFFET' || p.method === 'LCN') {
            if (p.status === 'CLEARED' || p.status === 'CONFIRMED') {
              confirmedPaid += amt;
            } else {
              pendingEffects += amt;
            }
          } else {
            confirmedPaid += amt;
          }
        });
      } else {
        if (inv.status === 'PAID') {
          if (inv.paymentMethod === 'CHEQUE' || inv.paymentMethod === 'LC' || inv.paymentMethod === 'LCN' || inv.paymentMethod === 'EFFET') {
            pendingEffects = totalAmount;
          } else {
            confirmedPaid = totalAmount;
          }
        } else if (inv.status === 'PENDING') {
          pendingEffects = totalAmount;
        } else if (inv.status === 'PARTIAL') {
          confirmedPaid = Number(inv.paidAmount || 0);
        }
      }

      const debt = Math.max(0, totalAmount - (confirmedPaid + pendingEffects));

      let invDate = inv.date || '';
      if (!invDate && inv.createdAt) {
        if (typeof inv.createdAt.toDate === 'function') {
          invDate = inv.createdAt.toDate().toISOString().split('T')[0];
        } else if (typeof inv.createdAt === 'string') {
          invDate = inv.createdAt.split('T')[0];
        }
      }

      list.push({
        id: inv.id,
        source: 'invoice',
        invoiceNumber: inv.invoiceNumber,
        date: invDate || todayStr,
        storeId: inv.storeId || 'CHRIFA',
        clientId: inv.clientId,
        clientName: client?.name || inv.clientName || 'Vente directe',
        subTotal,
        discount,
        totalAmount,
        totalCost,
        totalMargin,
        marginRate,
        confirmedPaid,
        pendingEffects,
        debt,
        status: inv.status || (debt > 0 ? (confirmedPaid > 0 ? 'PARTIAL' : 'UNPAID') : pendingEffects > 0 ? 'PENDING' : 'PAID'),
        paymentMethod: inv.paymentMethod,
        notes: inv.notes,
        items,
      });
    });

    // Traitement des ventes isolées (anciennes ventes de la collection sales si non présentes dans invoices)
    (sales || []).forEach(s => {
      if (seenInvoiceIds.has(s.id)) return;
      const totalAmount = Number(s.totalAmount || 0);
      let calculatedTotalCost = 0;

      const items = (s.items || []).map((it: any) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.unitPrice || it.sellingPrice || 0);
        const totalPrice = Number(it.totalPrice || (qty * unitPrice));
        const unitCost = resolveItemCostPrice(it);
        const totalCost = it.totalCost ? Number(it.totalCost) : (unitCost * qty);
        const margin = totalPrice - totalCost;
        calculatedTotalCost += totalCost;

        return {
          articleId: it.articleId || '',
          productName: it.productName || 'Article',
          color: it.color,
          size: it.size,
          unitOfMeasure: it.unitOfMeasure,
          qty,
          unitPrice,
          totalPrice,
          unitCost,
          totalCost,
          margin,
          marginRate: totalPrice > 0 ? (margin / totalPrice) * 100 : 0,
        };
      });

      const totalCost = s.totalCost && Number(s.totalCost) > 0 ? Number(s.totalCost) : calculatedTotalCost;
      const totalMargin = totalAmount - totalCost;
      const marginRate = totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0;

      list.push({
        id: s.id,
        source: 'sale',
        date: s.date || todayStr,
        storeId: s.storeId || 'CHRIFA',
        clientId: s.clientId,
        clientName: s.clientName || 'Vente directe',
        subTotal: totalAmount,
        discount: 0,
        totalAmount,
        totalCost,
        totalMargin,
        marginRate,
        confirmedPaid: totalAmount,
        pendingEffects: 0,
        debt: 0,
        status: 'PAID',
        notes: s.notes,
        items,
      });
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [invoices, sales, clients, payments, resolveItemCostPrice, todayStr]);

  // ── 3. FILTRAGE DES VENTES PAR MAGASIN & PÉRIODE ──────────────────────────
  const filteredSales = useMemo(() => {
    return normalizedSales.filter(s => {
      // Filtrage Magasin
      if (effectiveStoreId !== 'ALL' && effectiveStoreId !== 'ALL_MAIN') {
        const storeMatch = s.storeId === effectiveStoreId || (!s.storeId && effectiveStoreId === 'CHRIFA');
        if (!storeMatch) return false;
      }

      // Filtrage Date
      if (dateRange.from && s.date < dateRange.from) return false;
      if (dateRange.to && s.date > dateRange.to) return false;

      // Filtrage Recherche texte
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchClient = (s.clientName || '').toLowerCase().includes(q);
        const matchInv = (s.invoiceNumber || '').toLowerCase().includes(q);
        const matchItem = s.items.some((it: any) => it.productName.toLowerCase().includes(q));
        if (!matchClient && !matchInv && !matchItem) return false;
      }

      // Filtrage Statut
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PAID' && s.status !== 'PAID') return false;
        if (statusFilter === 'PENDING' && s.status !== 'PENDING') return false;
        if (statusFilter === 'UNPAID' && s.status !== 'UNPAID' && s.status !== 'PARTIAL') return false;
      }

      return true;
    });
  }, [normalizedSales, effectiveStoreId, dateRange, searchQuery, statusFilter]);

  // ── 4. STOCKS EFFECTIFS SELON MAGASIN SÉLECTIONNÉ ─────────────────────────
  const displayStockItems = useMemo(() => {
    if (effectiveStoreId === 'ALL' || effectiveStoreId === 'ALL_MAIN') {
      return stockItems;
    }
    return stockItems.map(item => {
      const storeQty = item.qtyByStore ? (item.qtyByStore[effectiveStoreId] ?? 0) : item.currentQty;
      const totalVal = storeQty * (item.purchasePricePerUnit || 0);
      const totalSell = storeQty * (item.sellingPrice || (item.purchasePricePerUnit ? item.purchasePricePerUnit * 1.3 : 0));
      return {
        ...item,
        currentQty: storeQty,
        totalValue: totalVal,
        totalSellingValue: totalSell,
      };
    }).filter(i => i.currentQty > 0 || (i.minThreshold && i.minThreshold > 0));
  }, [stockItems, effectiveStoreId]);

  // ── 5. CALCUL DES KPIS GLOBAUX & FINANCIERS ──────────────────────────────
  const totalStockValue = useMemo(() => displayStockItems.reduce((s, i) => s + i.totalValue, 0), [displayStockItems]);
  const totalSellingValue = useMemo(() => displayStockItems.reduce((s, i) => s + (i.totalSellingValue || 0), 0), [displayStockItems]);
  const totalStockQty = useMemo(() => displayStockItems.reduce((s, i) => s + i.currentQty, 0), [displayStockItems]);
  const totalRefs = displayStockItems.length;
  const alertCount = useMemo(() => displayStockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length, [displayStockItems]);

  // Ventes du jour
  const todaySales = useMemo(() =>
    normalizedSales.filter(s => {
      if (s.date !== todayStr) return false;
      if (effectiveStoreId !== 'ALL' && effectiveStoreId !== 'ALL_MAIN') {
        return s.storeId === effectiveStoreId || (!s.storeId && effectiveStoreId === 'CHRIFA');
      }
      return true;
    }),
    [normalizedSales, todayStr, effectiveStoreId]
  );
  const caToday = todaySales.reduce((s, v) => s + v.totalAmount, 0);
  const nbSalesToday = todaySales.length;

  // Ventes du mois en cours
  const currentMonthSales = useMemo(() =>
    normalizedSales.filter(s => {
      if (!s.date?.startsWith(currentMonthStr)) return false;
      if (effectiveStoreId !== 'ALL' && effectiveStoreId !== 'ALL_MAIN') {
        return s.storeId === effectiveStoreId || (!s.storeId && effectiveStoreId === 'CHRIFA');
      }
      return true;
    }),
    [normalizedSales, currentMonthStr, effectiveStoreId]
  );
  const caMonth = currentMonthSales.reduce((s, v) => s + v.totalAmount, 0);
  const marginMonth = currentMonthSales.reduce((s, v) => s + v.totalMargin, 0);
  const nbSalesMonth = currentMonthSales.length;
  const panierMoyenMonth = nbSalesMonth > 0 ? caMonth / nbSalesMonth : 0;

  // Ventes de la période sélectionnée
  const periodCA = filteredSales.reduce((s, v) => s + v.totalAmount, 0);
  const periodCost = filteredSales.reduce((s, v) => s + v.totalCost, 0);
  const periodMargin = filteredSales.reduce((s, v) => s + v.totalMargin, 0);
  const periodMarginRate = periodCA > 0 ? (periodMargin / periodCA) * 100 : 0;
  const periodUnitsSold = filteredSales.reduce((acc, s) => acc + s.items.reduce((sum: number, it: any) => sum + it.qty, 0), 0);
  const avgTicket = filteredSales.length > 0 ? periodCA / filteredSales.length : 0;

  // Trésorerie sur la période
  const periodConfirmed = filteredSales.reduce((s, v) => s + v.confirmedPaid, 0);
  const periodPending = filteredSales.reduce((s, v) => s + v.pendingEffects, 0);
  const periodDebt = filteredSales.reduce((s, v) => s + v.debt, 0);

  // ── 6. STATISTIQUES DE ROTATION DES STOCKS & DSI CALIBRÉS ─────────────────
  const rotationStats = useMemo(() => {
    const dFrom = new Date(dateRange.from);
    const dTo = new Date(dateRange.to);
    const daysInPeriod = Math.max(1, Math.round((dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const totalSalesUnits = periodUnitsSold;
    const avgStock = totalStockQty;
    const dailySales = totalSalesUnits / daysInPeriod;

    const rotationRate = avgStock > 0 ? (totalSalesUnits / avgStock) : 0;
    const dsi = dailySales > 0 ? Math.round(avgStock / dailySales) : null;

    return {
      daysInPeriod,
      rotation: rotationRate.toFixed(2),
      dsi,
      totalSalesUnits,
      avgStock: Math.round(avgStock),
    };
  }, [dateRange, periodUnitsSold, totalStockQty]);

  // ── 7. GRAPHIQUE TOP CATÉGORIES ──────────────────────────────────────────
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => { if (c.id) map.set(c.id, c.name); });
    (generalCategories || []).forEach(gc => { if (gc.id) map.set(gc.id, gc.name); });
    return map;
  }, [categories, generalCategories]);

  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    displayStockItems.forEach(i => {
      const rawName = categoryMap.get(i.categoryId) || i.categoryId || 'Autre';
      const key = rawName.toUpperCase();
      map[key] = (map[key] || 0) + (userRole === 'ADMIN' ? i.totalValue : i.currentQty);
    });

    return Object.entries(map)
      .map(([name, value]) => ({
        name: name.length > 18 ? name.substring(0, 18) + '…' : name,
        value: Math.round(value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [displayStockItems, categoryMap, userRole]);

  // ── 8. RÉPARTITION DES VENTES PAR MAGASIN ─────────────────────────────────
  const storeSalesData = useMemo(() => {
    const map: Record<string, number> = {};
    stores.forEach(s => { map[s.id] = 0; });
    map['ENTREPOT'] = 0;

    filteredSales.forEach(s => {
      const st = s.storeId || 'CHRIFA';
      map[st] = (map[st] || 0) + s.totalAmount;
    });

    return Object.entries(map)
      .filter(([_, val]) => val > 0)
      .map(([id, val]) => {
        const s = stores.find(st => st.id === id);
        return {
          id,
          name: s ? s.name : id,
          value: Math.round(val),
          fill: STORE_COLORS[id] || '#64748b',
        };
      });
  }, [filteredSales, stores]);

  // ── 9. TOP PRODUITS VENDUS (AVEC COÛT ET MARGE RÉELLE) ───────────────────
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; ca: number; cost: number; margin: number }> = {};
    filteredSales.forEach(s => {
      s.items.forEach((item: any) => {
        const key = item.articleId || item.productName;
        if (!map[key]) {
          map[key] = { name: item.productName, qty: 0, ca: 0, cost: 0, margin: 0 };
        }
        map[key].qty += item.qty;
        map[key].ca += item.totalPrice;
        map[key].cost += item.totalCost;
        map[key].margin += item.margin;
      });
    });

    return Object.values(map)
      .map(p => ({
        ...p,
        marginRate: p.ca > 0 ? (p.margin / p.ca) * 100 : 0,
      }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 10);
  }, [filteredSales]);

  // ── 10. DERNIERS MOUVEMENTS DE STOCK FILTRÉS ──────────────────────────────
  const recentMovements = useMemo(() => {
    return movements
      .filter(m => {
        if (effectiveStoreId !== 'ALL' && effectiveStoreId !== 'ALL_MAIN') {
          return m.storeId === effectiveStoreId || m.toStoreId === effectiveStoreId;
        }
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 6);
  }, [movements, effectiveStoreId]);

  // ── 11. ÉVOLUTION MENSUELLE CA VS COÛT VS MARGE ──────────────────────────
  const monthlyTrends = useMemo(() => {
    const map: Record<string, { ca: number; cost: number; margin: number; count: number }> = {};
    normalizedSales.forEach(s => {
      const m = s.date?.substring(0, 7) || '';
      if (!m) return;
      if (effectiveStoreId !== 'ALL' && effectiveStoreId !== 'ALL_MAIN') {
        if (s.storeId !== effectiveStoreId && (!s.storeId && effectiveStoreId !== 'CHRIFA')) return;
      }
      if (!map[m]) map[m] = { ca: 0, cost: 0, margin: 0, count: 0 };
      map[m].ca += s.totalAmount;
      map[m].cost += s.totalCost;
      map[m].margin += s.totalMargin;
      map[m].count += 1;
    });

    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([mKey, d]) => {
        const [y, m] = mKey.split('-');
        return {
          monthKey: mKey,
          label: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`,
          ca: Math.round(d.ca),
          cost: Math.round(d.cost),
          margin: Math.round(d.margin),
          count: d.count,
        };
      });
  }, [normalizedSales, effectiveStoreId]);

  const tooltipMADFormatter = (v: any, name: string) => [
    fmt$(v),
    name === 'ca' ? 'Chiffre d\'Affaires' : name === 'cost' ? 'Coût d\'Achat' : 'Marge Brute'
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── HEADER PRINCIPAL AVEC SÉLECTEUR D'ONGLET ── */}
      <header className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-stone-900 p-7 md:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-emerald-600/10 rounded-full translate-y-1/2 blur-2xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                ● Données Fiabilisées
              </span>
              {userRole === 'ADMIN' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Vue Administrateur
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-tight">
              Tableau de Bord<br />
              <span className="text-emerald-400">Stock & Ventes</span>
            </h1>

            <p className="text-emerald-200/80 text-xs font-bold mt-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              {today.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex bg-emerald-950/60 p-1.5 rounded-2xl border border-emerald-700/50 backdrop-blur-md shrink-0">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-white text-emerald-950 shadow-xl'
                  : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
              }`}
            >
              <Activity className="w-4 h-4" /> Aperçu Global
            </button>

            {userRole === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('sales')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'sales'
                    ? 'bg-white text-emerald-950 shadow-xl'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
                }`}
              >
                <TrendingUp className="w-4 h-4" /> Ventes & Marges
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── BARRE DE FILTRES UNIFIÉE (MAGASIN & PÉRIODE) ── */}
      <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* SÉLECTEUR DE MAGASIN (ADMIN UNIQUEMENT) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-600" /> Magasin :
            </span>

            {userRole === 'ADMIN' ? (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setDashboardStore('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                    dashboardStore === 'ALL'
                      ? 'bg-emerald-800 text-white shadow-md'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  Tous
                </button>

                {stores.filter(s => s.type === 'STORE').map(st => (
                  <button
                    key={st.id}
                    onClick={() => setDashboardStore(st.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                      dashboardStore === st.id
                        ? 'bg-emerald-700 text-white shadow-md'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STORE_COLORS[st.id] || '#64748b' }} />
                    {st.name}
                  </button>
                ))}

                {stores.filter(s => s.type === 'WAREHOUSE').map(wh => (
                  <button
                    key={wh.id}
                    onClick={() => setDashboardStore(wh.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                      dashboardStore === wh.id
                        ? 'bg-blue-700 text-white shadow-md'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <Warehouse className="w-3 h-3 text-blue-500" />
                    {wh.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-emerald-100 text-emerald-800">
                {stores.find(s => s.id === effectiveStoreId)?.name || effectiveStoreId}
              </span>
            )}
          </div>

          {/* SÉLECTEUR DE PÉRIODE RAPIDE */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-500" /> Période :
            </span>

            <button
              onClick={() => handlePeriodChange('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                periodPreset === 'today' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Aujourd'hui
            </button>

            <button
              onClick={() => handlePeriodChange('this_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                periodPreset === 'this_month' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Ce mois
            </button>

            <button
              onClick={() => handlePeriodChange('last_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                periodPreset === 'last_month' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Mois dernier
            </button>

            <button
              onClick={() => handlePeriodChange('this_year')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                periodPreset === 'this_year' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Cette année
            </button>

            <button
              onClick={() => handlePeriodChange('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                periodPreset === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* DATES PERSONNALISÉES */}
        <div className="flex items-center gap-3 pt-3 border-t border-stone-100 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-stone-400">Du :</span>
            <input
              type="date"
              value={dateRange.from}
              onChange={e => {
                setPeriodPreset('custom');
                setDateRange(d => ({ ...d, from: e.target.value }));
              }}
              className="h-9 px-3 rounded-xl border border-stone-200 font-bold text-xs bg-stone-50/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-stone-400">Au :</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={e => {
                setPeriodPreset('custom');
                setDateRange(d => ({ ...d, to: e.target.value }));
              }}
              className="h-9 px-3 rounded-xl border border-stone-200 font-bold text-xs bg-stone-50/50"
            />
          </div>

          <div className="text-[10px] font-bold text-stone-400 ml-auto flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-stone-400" />
            <span>Période active : <strong>{rotationStats.daysInPeriod} jour(s)</strong></span>
          </div>
        </div>
      </div>

      {/* ── BANNIÈRE D'ALERTE STOCK ── */}
      {alertCount > 0 && activeTab === 'overview' && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-3xl p-5 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-red-100 rounded-2xl shrink-0">
              <Bell className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-black text-red-950 uppercase tracking-tight">
                {alertCount} alerte{alertCount > 1 ? 's' : ''} de stock active{alertCount > 1 ? 's' : ''}
              </p>
              <p className="text-xs font-bold text-red-700">
                Des articles sont en rupture ou sous leur seuil d'approvisionnement minimal.
              </p>
            </div>
          </div>
          <Button
            onClick={() => onNavigate('alerts')}
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-wider px-5 h-10 rounded-2xl shrink-0 gap-1.5 shadow-md shadow-red-500/20"
          >
            Voir les alertes <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* =====================================================================
                              ONGLET : APERÇU GLOBAL
          ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* KPIS PRINCIPAUX */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* KPI 1 : Valeur du stock (Admin) ou CA Jour (Commercial) */}
            {userRole === 'ADMIN' ? (
              <Card onClick={() => onNavigate('inventory')} className="border-none shadow-xl rounded-3xl overflow-hidden cursor-pointer hover:shadow-2xl hover:-translate-y-0.5 transition-all">
                <div className="h-1.5 bg-emerald-500" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-emerald-50 rounded-2xl"><Boxes className="w-5 h-5 text-emerald-600" /></div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Coût Achat</span>
                  </div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(totalStockValue)}</p>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Valeur Totale Stock</p>
                  <p className="text-[10px] font-bold text-stone-500 mt-1">{totalRefs} références · {fmtN(totalStockQty)} unités</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <div className="h-1.5 bg-emerald-500" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-emerald-50 rounded-2xl"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Aujourd'hui</span>
                  </div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(caToday)}</p>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Ventes Aujourd'hui</p>
                  <p className="text-[10px] font-bold text-stone-500 mt-1">{nbSalesToday} transaction(s)</p>
                </CardContent>
              </Card>
            )}

            {/* KPI 2 : Valeur Vente Estimée (Admin) ou CA Mois (Commercial) */}
            {userRole === 'ADMIN' ? (
              <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <div className="h-1.5 bg-teal-500" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-teal-50 rounded-2xl"><DollarSign className="w-5 h-5 text-teal-600" /></div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">Prix Public</span>
                  </div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(totalSellingValue)}</p>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Valeur Vente Estimée</p>
                  <p className="text-[10px] font-bold text-teal-700 mt-1">
                    Marge latente : +{fmt$(Math.max(0, totalSellingValue - totalStockValue))}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <div className="h-1.5 bg-blue-500" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-blue-50 rounded-2xl"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Ce mois</span>
                  </div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(caMonth)}</p>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">CA ce mois-ci</p>
                  <p className="text-[10px] font-bold text-stone-500 mt-1">{nbSalesMonth} ventes</p>
                </CardContent>
              </Card>
            )}

            {/* KPI 3 : CA Réalisé sur la Période */}
            <Card onClick={() => userRole === 'ADMIN' && setActiveTab('sales')} className={`border-none shadow-xl rounded-3xl overflow-hidden ${userRole === 'ADMIN' ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-0.5 transition-all' : ''}`}>
              <div className="h-1.5 bg-violet-500" />
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-violet-50 rounded-2xl"><TrendingUp className="w-5 h-5 text-violet-600" /></div>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">Période Active</span>
                </div>
                <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(periodCA)}</p>
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Chiffre d'Affaires</p>
                <p className="text-[10px] font-bold text-stone-500 mt-1">
                  {userRole === 'ADMIN' ? (
                    <span className="text-emerald-700">Marge : +{fmt$(periodMargin)} ({periodMarginRate.toFixed(1)}%)</span>
                  ) : (
                    <span>{filteredSales.length} vente(s) réalisée(s)</span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* KPI 4 : Alertes actives */}
            <Card onClick={() => onNavigate('alerts')} className={`border-none shadow-xl rounded-3xl overflow-hidden cursor-pointer hover:shadow-2xl hover:-translate-y-0.5 transition-all ${alertCount > 0 ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
              <div className={`h-1.5 ${alertCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-2xl ${alertCount > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  {alertCount > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />}
                </div>
                <p className="text-2xl font-black text-stone-900 leading-none">{fmtN(alertCount)}</p>
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Alertes Stock</p>
                <p className={`text-[10px] font-bold mt-1 ${alertCount > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {alertCount > 0 ? 'Stock bas ou rupture' : 'Tous les stocks sont optimaux'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* PERFORMANCE ROTATION & TRÉSORERIE DES VENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* CARTE ROTATION DES STOCKS */}
            <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
              <div className="h-1.5 bg-blue-500" />
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-2xl"><Activity className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">Rotation & Écoulement</h3>
                      <p className="text-[10px] font-bold text-stone-400">Calcul calibré sur la période ({rotationStats.daysInPeriod} jours)</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Taux de Rotation</p>
                    <p className="text-3xl font-black text-stone-900 leading-none mt-2">{rotationStats.rotation}</p>
                    <p className="text-[10px] font-bold text-stone-500 mt-2">
                      {fmtN(rotationStats.totalSalesUnits)} vendus / {fmtN(rotationStats.avgStock)} en stock
                    </p>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">DSI (Délai d'Écoulement)</p>
                    <p className="text-3xl font-black text-stone-900 leading-none mt-2">
                      {rotationStats.dsi != null ? (
                        <span>{rotationStats.dsi} <span className="text-sm font-bold text-stone-400">jours</span></span>
                      ) : (
                        <span className="text-lg font-black text-amber-600">Stock dormant</span>
                      )}
                    </p>
                    <p className="text-[10px] font-bold text-stone-500 mt-2">
                      {rotationStats.dsi != null ? 'Autonomie moyenne estimée' : 'Aucune vente sur la période'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARTE SUIVI TRÉSORERIE DES VENTES (ADMIN) OU ACTIVITÉ COMMERCIALE */}
            {userRole === 'ADMIN' ? (
              <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <div className="h-1.5 bg-emerald-500" />
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-50 rounded-2xl"><Wallet className="w-5 h-5 text-emerald-600" /></div>
                      <div>
                        <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">Encaissement & Trésorerie</h3>
                        <p className="text-[10px] font-bold text-stone-400">Ventilation réelle du CA sur la période</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Déjà Encaissé
                      </p>
                      <p className="text-lg font-black text-emerald-950 mt-1.5">{fmt$(periodConfirmed)}</p>
                      <p className="text-[9px] font-bold text-emerald-700 mt-1">
                        {periodCA > 0 ? ((periodConfirmed / periodCA) * 100).toFixed(0) : 0}% du total
                      </p>
                    </div>

                    <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-100">
                      <p className="text-[9px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" /> Chèques / LC
                      </p>
                      <p className="text-lg font-black text-amber-950 mt-1.5">{fmt$(periodPending)}</p>
                      <p className="text-[9px] font-bold text-amber-700 mt-1">En attente d'échéance</p>
                    </div>

                    <div className="bg-red-50/70 p-3.5 rounded-2xl border border-red-100">
                      <p className="text-[9px] font-black text-red-800 uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-600" /> Reste Dû
                      </p>
                      <p className="text-lg font-black text-red-950 mt-1.5">{fmt$(periodDebt)}</p>
                      <p className="text-[9px] font-bold text-red-700 mt-1">À crédit / Impayés</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <div className="h-1.5 bg-emerald-500" />
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-emerald-50 rounded-2xl"><ShoppingBag className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">Performance Commerciale</h3>
                      <p className="text-[10px] font-bold text-stone-400">Panier et volumes sur le mois</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Panier Moyen</p>
                      <p className="text-2xl font-black text-stone-900 leading-none mt-2">{fmt$(panierMoyenMonth)}</p>
                      <p className="text-[10px] font-bold text-stone-500 mt-2">Par transaction ce mois-ci</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Articles Vendus</p>
                      <p className="text-2xl font-black text-stone-900 leading-none mt-2">{fmtN(periodUnitsSold)}</p>
                      <p className="text-[10px] font-bold text-stone-500 mt-2">Unités écoulées</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* GRAPHIQUES : TOP CATÉGORIES & RÉPARTITION PAR MAGASIN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* GRAPHIQUE TOP CATÉGORIES */}
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                    {userRole === 'ADMIN' ? 'Valeur Marchande en Stock' : 'Volumes en Stock'}
                  </p>
                  <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Top Catégories</h3>
                </div>
                <span className="text-xs font-bold text-stone-400">
                  {userRole === 'ADMIN' ? 'En MAD' : 'En unités'}
                </span>
              </div>

              {catData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={catData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fontWeight: 700, fill: '#78716c' }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#a8a29e' }}
                      tickFormatter={v => userRole === 'ADMIN' ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                    />
                    <Tooltip
                      formatter={(v: any) => [userRole === 'ADMIN' ? fmt$(v) : fmtN(v), userRole === 'ADMIN' ? 'Valeur Stock' : 'Quantité']}
                      contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {catData.map((_, i) => (
                        <Cell key={i} fill={EMERALD_SHADES[i % EMERALD_SHADES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[240px]">
                  <p className="text-stone-300 font-black uppercase text-xs">Aucune donnée disponible</p>
                </div>
              )}
            </div>

            {/* GRAPHIQUE RÉPARTITION VENTES PAR MAGASIN */}
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Période Active</p>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mb-4">Ventes par Magasin</h3>
              </div>

              {storeSalesData.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={storeSalesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={4}
                      >
                        {storeSalesData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: any) => [fmt$(v), 'CA']}
                        contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    {storeSalesData.map(st => (
                      <div key={st.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.fill }} />
                          <span className="font-black text-stone-800 uppercase">{st.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-stone-900">{fmt$(st.value)}</span>
                          <span className="text-[10px] text-stone-400 ml-1.5 font-bold">
                            ({periodCA > 0 ? ((st.value / periodCA) * 100).toFixed(0) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[220px] space-y-2">
                  <StoreIcon className="w-8 h-8 text-stone-200" />
                  <p className="text-stone-300 font-black uppercase text-xs">Aucune vente enregistrée</p>
                </div>
              )}
            </div>
          </div>

          {/* LISTES : TOP PRODUITS & DERNIERS MOUVEMENTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* TOP PRODUITS VENDUS */}
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Performances Période</p>
                  <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Top Produits Vendus</h3>
                </div>
                {userRole === 'ADMIN' && (
                  <Button
                    onClick={() => setActiveTab('sales')}
                    variant="ghost"
                    size="sm"
                    className="text-[10px] font-black uppercase tracking-wider text-stone-500 hover:text-emerald-700 gap-1"
                  >
                    Voir analyse <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-2.5">
                {topProducts.slice(0, 5).length === 0 ? (
                  <p className="text-center text-stone-300 text-xs font-black uppercase py-8">Aucune vente</p>
                ) : (
                  topProducts.slice(0, 5).map((item, i) => (
                    <div key={`${item.name}-${i}`} className="flex items-center gap-3 p-3.5 bg-stone-50/70 rounded-2xl hover:bg-stone-100/70 transition-colors">
                      <span className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center text-xs font-black text-emerald-800 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-stone-800 uppercase truncate">{item.name}</p>
                        <p className="text-[10px] font-bold text-stone-400">{fmtN(item.qty)} unité(s) vendue(s)</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-stone-900">{fmt$(item.ca)}</p>
                        {userRole === 'ADMIN' && (
                          <p className={`text-[10px] font-black ${item.margin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                            +{fmt$(item.margin)} ({item.marginRate.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* DERNIERS MOUVEMENTS */}
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Activité Récente</p>
                  <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Derniers Mouvements</h3>
                </div>
                <Button
                  onClick={() => onNavigate('movements')}
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-black uppercase tracking-wider text-stone-500 hover:text-emerald-700 gap-1"
                >
                  Tout voir <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="space-y-2.5">
                {recentMovements.length === 0 ? (
                  <p className="text-center text-stone-300 text-xs font-black uppercase py-8">Aucun mouvement</p>
                ) : (
                  recentMovements.map(m => {
                    const isIN = m.type === 'IN';
                    const isOUT = m.type === 'OUT';
                    const isTRANSFER = m.reason === 'TRANSFERT';
                    const storeName = stores.find(s => s.id === m.storeId)?.name || m.storeId || 'Principal';

                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3 bg-stone-50/70 rounded-2xl hover:bg-stone-100/70 transition-colors">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isTRANSFER
                              ? 'bg-amber-100 text-amber-700'
                              : isIN
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {isTRANSFER ? (
                            <ArrowLeftRight className="w-4 h-4" />
                          ) : isIN ? (
                            <Package className="w-4 h-4" />
                          ) : (
                            <ShoppingBag className="w-4 h-4" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-stone-800 uppercase truncate">{m.productName}</p>
                          <p className="text-[10px] font-bold text-stone-400 flex items-center gap-1.5">
                            <span>{m.date}</span>
                            <span>·</span>
                            <span className="text-stone-600 font-black">{m.reason}</span>
                            <span>·</span>
                            <span>{storeName}</span>
                          </p>
                        </div>

                        <span
                          className={`text-xs font-black shrink-0 ${
                            isIN ? 'text-emerald-700' : isOUT ? 'text-red-600' : 'text-amber-700'
                          }`}
                        >
                          {isIN ? '+' : '-'}{fmtN(m.quantity)} {m.unitOfMeasure || 'u'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* =====================================================================
                              ONGLET : VENTES & MARGES (ADMIN SEUL)
          ===================================================================== */}
      {activeTab === 'sales' && userRole === 'ADMIN' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* BARRE DE RECHERCHE ET FILTRE STATUT DE VENTE */}
          <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par client, n° facture, ou produit..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 h-11 rounded-2xl border border-stone-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-50/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Règlement :</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 w-48 rounded-2xl bg-white border-stone-200 text-xs font-black shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="ALL">Tous les statuts</SelectItem>
                  <SelectItem value="PAID">Payés</SelectItem>
                  <SelectItem value="PENDING">En attente (Chèques/LC)</SelectItem>
                  <SelectItem value="UNPAID">Impayés / Crédit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 4 KPIS FINANCIERS DE VENTES & MARGES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-5 overflow-hidden relative">
              <div className="h-1.5 bg-violet-500 absolute top-0 left-0 right-0" />
              <div className="p-2.5 bg-violet-50 rounded-2xl w-fit mb-3"><DollarSign className="w-5 h-5 text-violet-600" /></div>
              <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(periodCA)}</p>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Chiffre d'Affaires Net</p>
              <p className="text-[10px] font-bold text-stone-500 mt-1">{filteredSales.length} vente(s) enregistrée(s)</p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-5 overflow-hidden relative">
              <div className="h-1.5 bg-stone-500 absolute top-0 left-0 right-0" />
              <div className="p-2.5 bg-stone-100 rounded-2xl w-fit mb-3"><BarChart3 className="w-5 h-5 text-stone-600" /></div>
              <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(periodCost)}</p>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Coût d'Achat Réel (COGS)</p>
              <p className="text-[10px] font-bold text-stone-500 mt-1">
                {periodCA > 0 ? ((periodCost / periodCA) * 100).toFixed(1) : 0}% du Chiffre d'Affaires
              </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-5 overflow-hidden relative">
              <div className="h-1.5 bg-emerald-500 absolute top-0 left-0 right-0" />
              <div className="p-2.5 bg-emerald-50 rounded-2xl w-fit mb-3"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
              <p className="text-2xl font-black text-emerald-900 leading-none">{fmt$(periodMargin)}</p>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Marge Brute Réalisée</p>
              <p className="text-[10px] font-bold text-emerald-700 mt-1">
                Taux de marge réel : {periodMarginRate.toFixed(1)}%
              </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-5 overflow-hidden relative">
              <div className="h-1.5 bg-blue-500 absolute top-0 left-0 right-0" />
              <div className="p-2.5 bg-blue-50 rounded-2xl w-fit mb-3"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
              <p className="text-2xl font-black text-stone-900 leading-none">{fmt$(avgTicket)}</p>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1.5">Ticket Moyen</p>
              <p className="text-[10px] font-bold text-stone-500 mt-1">{fmtN(periodUnitsSold)} articles vendus</p>
            </div>
          </div>

          {/* ENCAISSEMENTS & TRÉSORERIE */}
          <div className="bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-950 p-6 rounded-3xl shadow-xl text-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Trésorerie & Risque Client</p>
                <h3 className="text-xl font-black uppercase tracking-tight">Statut des Règlements de la Période</h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-stone-400 uppercase">Total Facturé : </span>
                <span className="text-base font-black text-white">{fmt$(periodCA)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Encaissé Réel
                </p>
                <p className="text-2xl font-black text-white mt-2">{fmt$(periodConfirmed)}</p>
                <p className="text-xs font-bold text-emerald-300 mt-1">
                  {periodCA > 0 ? ((periodConfirmed / periodCA) * 100).toFixed(1) : 0}% des ventes
                </p>
              </div>

              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> En Attente (Chèques & LC)
                </p>
                <p className="text-2xl font-black text-white mt-2">{fmt$(periodPending)}</p>
                <p className="text-xs font-bold text-amber-300 mt-1">
                  {periodCA > 0 ? ((periodPending / periodCA) * 100).toFixed(1) : 0}% en portefeuille
                </p>
              </div>

              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Reste Dû / Crédits Clients
                </p>
                <p className="text-2xl font-black text-white mt-2">{fmt$(periodDebt)}</p>
                <p className="text-xs font-bold text-red-300 mt-1">
                  {periodCA > 0 ? ((periodDebt / periodCA) * 100).toFixed(1) : 0}% impayés
                </p>
              </div>
            </div>
          </div>

          {/* GRAPHIQUES D'ANALYSE MENSUELLE */}
          {monthlyTrends.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* GRAPHIQUE 1 : CA VS COÛT PAR MOIS */}
              <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Évolution</p>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mb-5">CA vs Coût Réel par mois</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={monthlyTrends} margin={{ top: 0, right: 10, left: 0, bottom: 30 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: '#78716c' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={tooltipMADFormatter} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="ca" name="ca" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
                    <Bar dataKey="cost" name="cost" radius={[6, 6, 0, 0]} fill="#e2e8f0" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* GRAPHIQUE 2 : MARGE BRUTE PAR MOIS */}
              <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Rentabilité</p>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mb-5">Marge Brute par mois (MAD)</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={monthlyTrends} margin={{ top: 0, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: '#78716c' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [fmt$(v), 'Marge Brute']} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="margin" stroke="#059669" strokeWidth={3} dot={{ fill: '#059669', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}

          {/* TABLEAUX : TOP PRODUITS PAR RENTABILITÉ & JOURNAL DES VENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* TOP PRODUITS */}
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-stone-100">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Classement</p>
              <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mb-4">Top Produits les Plus Rentables</h3>

              {topProducts.length === 0 ? (
                <p className="text-center text-stone-300 text-xs font-black uppercase py-8">Aucun produit vendu</p>
              ) : (
                <div className="space-y-2.5">
                  {topProducts.map((p, i) => (
                    <div key={`${p.name}-${i}`} className="flex items-center gap-3 p-3 bg-stone-50/70 rounded-2xl hover:bg-stone-100/70 transition-colors">
                      <span className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-black text-violet-800 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-stone-800 uppercase truncate">{p.name}</p>
                        <p className="text-[10px] font-bold text-stone-400">
                          {fmtN(p.qty)} unité(s) · Coût : {fmt$(p.cost)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-violet-700">{fmt$(p.ca)}</p>
                        <p className={`text-[10px] font-black ${p.margin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                          +{fmt$(p.margin)} ({p.marginRate.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* JOURNAL DES VENTES & FACTURES */}
            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden flex flex-col">
              <div className="p-6 pb-4 border-b border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Détails & Audit</p>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Journal des Ventes ({filteredSales.length})</h3>
              </div>

              <div className="divide-y divide-stone-100 max-h-[440px] overflow-y-auto">
                {filteredSales.length === 0 ? (
                  <p className="text-center text-stone-300 text-xs font-black uppercase py-12">Aucune transaction trouvée</p>
                ) : (
                  filteredSales.map((sale: any) => {
                    const stColor = STORE_COLORS[sale.storeId] || '#64748b';
                    const storeName = stores.find(s => s.id === sale.storeId)?.name || sale.storeId;

                    return (
                      <div
                        key={sale.id}
                        onClick={() => setSelectedSale(sale)}
                        className="flex items-center gap-3.5 px-6 py-3.5 hover:bg-stone-50 cursor-pointer transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0 text-violet-600">
                          <ShoppingBag className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-stone-800 uppercase truncate">
                              {sale.clientName}
                            </p>
                            <span
                              className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md text-white shrink-0"
                              style={{ backgroundColor: stColor }}
                            >
                              {storeName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-stone-400 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" /> {sale.date}
                            </span>
                            <span className="text-[10px] text-stone-300">·</span>
                            <span className="text-[10px] font-bold text-stone-500">
                              {sale.items.length} article(s)
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-stone-900">{fmt$(sale.totalAmount)}</p>
                          <p className={`text-[10px] font-black ${sale.totalMargin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                            +{fmt$(sale.totalMargin)} ({sale.marginRate.toFixed(1)}%)
                          </p>
                        </div>

                        <Eye className="w-4 h-4 text-stone-300 group-hover:text-violet-600 transition-colors shrink-0" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── MODALE DÉTAIL D'UNE VENTE AVEC ANALYSE DE MARGE PAR LIGNE ── */}
      <Dialog open={!!selectedSale} onOpenChange={open => !open && setSelectedSale(null)}>
        <DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-800 to-stone-900 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Détail de la Vente
                </span>
                <DialogTitle className="text-xl font-black uppercase tracking-tight mt-1.5">
                  {selectedSale?.clientName || 'Vente directe'}
                </DialogTitle>
                <p className="text-xs font-bold text-violet-200 mt-1 flex items-center gap-2">
                  <span>Date : {selectedSale?.date}</span>
                  <span>·</span>
                  <span>Magasin : {stores.find(s => s.id === selectedSale?.storeId)?.name || selectedSale?.storeId}</span>
                </p>
              </div>

              <div className="text-right">
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-xl shadow-sm ${
                  selectedSale?.status === 'PAID'
                    ? 'bg-emerald-500 text-white'
                    : selectedSale?.status === 'PENDING'
                    ? 'bg-amber-500 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {selectedSale?.status === 'PAID' ? 'Payé' : selectedSale?.status === 'PENDING' ? 'En attente' : 'Impayé'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4 bg-white max-h-[65vh] overflow-y-auto">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Articles Vendus</p>
              <div className="space-y-2">
                {selectedSale?.items.map((item: any, i: number) => (
                  <div key={i} className="p-3.5 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-stone-800 uppercase truncate">{item.productName}</p>
                      <p className="text-[10px] font-bold text-stone-400">
                        {item.qty} {item.unitOfMeasure || 'u'} × {fmt$(item.unitPrice)}
                        {(item.color || item.size) && ` · ${[item.color, item.size].filter(Boolean).join(' / ')}`}
                      </p>
                      {userRole === 'ADMIN' && (
                        <p className="text-[9px] font-bold text-stone-500 mt-0.5">
                          Coût unitaire d'achat : {fmt$(item.unitCost)}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-stone-900">{fmt$(item.totalPrice)}</p>
                      {userRole === 'ADMIN' && (
                        <p className={`text-[10px] font-black ${item.margin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                          +{fmt$(item.margin)} ({item.marginRate.toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {userRole === 'ADMIN' && (
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="flex justify-between text-xs font-bold text-stone-500">
                  <span>Total Brut</span>
                  <span>{fmt$(selectedSale?.subTotal || selectedSale?.totalAmount || 0)}</span>
                </div>

                {selectedSale?.discount > 0 && (
                  <div className="flex justify-between text-xs font-bold text-amber-600">
                    <span>Remise accordée</span>
                    <span>-{fmt$(selectedSale.discount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-xs font-bold text-stone-600">
                  <span>Coût total des achats (COGS)</span>
                  <span>{fmt$(selectedSale?.totalCost || 0)}</span>
                </div>

                <div className="flex justify-between text-xs font-black text-emerald-700 bg-emerald-50 p-2.5 rounded-xl">
                  <span>Marge brute dégagée</span>
                  <span>
                    +{fmt$(selectedSale?.totalMargin || 0)} ({selectedSale?.marginRate?.toFixed(1) || 0}%)
                  </span>
                </div>

                <div className="flex justify-between text-sm font-black text-stone-900 pt-2 border-t border-stone-100">
                  <span>Total Net Facturé</span>
                  <span>{fmt$(selectedSale?.totalAmount || 0)}</span>
                </div>

                {/* Trésorerie liée */}
                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px]">
                  <div className="bg-emerald-50 p-2 rounded-xl">
                    <p className="text-stone-400 font-bold">Encaissé</p>
                    <p className="font-black text-emerald-800">{fmt$(selectedSale?.confirmedPaid || 0)}</p>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-xl">
                    <p className="text-stone-400 font-bold">En attente (Chèque/LC)</p>
                    <p className="font-black text-amber-800">{fmt$(selectedSale?.pendingEffects || 0)}</p>
                  </div>
                  <div className="bg-red-50 p-2 rounded-xl">
                    <p className="text-stone-400 font-bold">Reste Dû</p>
                    <p className="font-black text-red-800">{fmt$(selectedSale?.debt || 0)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
