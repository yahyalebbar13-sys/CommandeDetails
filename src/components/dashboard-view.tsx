'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, RadialBarChart, RadialBar
} from 'recharts';
import { 
  DollarSign,
  Box,
  FileText,
  Anchor,
  ClipboardList,
  Factory,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Users,
  Layers,
  Truck,
  CalendarDays,
  Ship,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Package,
  BarChart2,
  Activity,
  ArrowUpRight,
  ChevronRight,
  Circle,
  Clock,
  RefreshCw,
  Percent,
} from 'lucide-react';
import { ViewType, GeneralCategory } from '@/lib/types';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  generalCategories: GeneralCategory[];
  subCategories: any[];
  onNavigate: (view: ViewType) => void;
  onNavigateToFacture?: (factureId: string) => void;
}

const PALETTE = ['#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6', '#f43f5e', '#6366f1', '#ec4899', '#14b8a6'];
const STATUS_COLORS: Record<string, string> = {
  'TO_ORDER': '#f59e0b',
  'PI': '#8b5cf6',
  'IN_TRANSIT': '#0ea5e9',
  'ARRIVED': '#10b981',
  'STOCK': '#6366f1',
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-stone-100 shadow-xl rounded-2xl px-4 py-3 text-xs">
      <p className="font-black text-stone-400 uppercase tracking-widest mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-black" style={{ color: p.color }}>
          {Number(p.value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {p.unit || '$'}
        </p>
      ))}
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color, trend, onClick }: {
  label: string; value: string; sub?: string; icon: any;
  color: string; trend?: { value: number; up: boolean }; onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`relative bg-white rounded-2xl p-5 shadow-sm border border-stone-100 overflow-hidden group transition-all duration-300 ${onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''}`}
  >
    <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-4 translate-x-4 transition-all duration-500 group-hover:opacity-10 group-hover:scale-110"
      style={{ background: color }} />
    <div className="flex items-start justify-between mb-4">
      <div className="p-2.5 rounded-xl" style={{ background: `${color}18` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full ${trend.up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
          {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend.value}%
        </div>
      )}
    </div>
    <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.18em] mb-1">{label}</p>
    <p className="text-2xl font-black text-stone-900 leading-none">{value}</p>
    {sub && <p className="text-[10px] font-bold mt-1.5" style={{ color }}>{sub}</p>}
    {onClick && (
      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowUpRight className="w-4 h-4 text-stone-400" />
      </div>
    )}
  </div>
);

// ─── Quick Action Button ──────────────────────────────────────────────────────
const QuickAction = ({ label, count, sub, icon: Icon, color, onClick }: {
  label: string; count: number; sub: string; icon: any; color: string; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="flex items-center gap-4 bg-white border border-stone-100 rounded-2xl px-5 py-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group text-left min-w-[220px]"
  >
    <div className="p-3 rounded-xl flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: `${color}15` }}>
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.18em]">{label}</p>
      <p className="text-xl font-black text-stone-900 leading-none mt-0.5">
        {count} <span className="text-[9px] text-stone-300 font-bold">ARTICLES</span>
      </p>
      <p className="text-[10px] font-black mt-1" style={{ color }}>{sub}</p>
    </div>
    <ChevronRight className="w-4 h-4 text-stone-200 group-hover:text-stone-400 transition-colors flex-shrink-0" />
  </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], generalCategories = [], subCategories = [], onNavigate, onNavigateToFacture }) => {
  const { user, firestore } = useFirebase();
  const safeArticles = articles || [];
  const safeFactures = factures || [];
  const [chartMode, setChartMode] = useState<'value' | 'volume'>('value');
  const [dpDeclarations, setDpDeclarations] = useState<Record<string, Record<string, string>>>({});

  // Load all dp_declarations for all factures
  useEffect(() => {
    if (!firestore || !user || safeFactures.length === 0) return;
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const result: Record<string, Record<string, string>> = {};
        snap.docs.forEach(d => { if (d.data().puMap) result[d.id] = d.data().puMap; });
        setDpDeclarations(result);
      })
      .catch(() => {});
  }, [firestore, user, safeFactures.length]);

  // ── Margin calculation per dossier ────────────────────────────────────────
  const marginData = useMemo(() => {
    const MARGE_RATE = 0.05;
    let totalRevient = 0;
    let totalVente = 0;

    const perDossier = safeFactures.map(facture => {
      const fArticles = safeArticles.filter(a => a.factureId === facture.id);
      if (fArticles.length === 0) return { id: facture.id, revient: 0, vente: 0, diff: 0 };

      const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
      const declaredValue = Number(facture.declaredValue) || 0;
      const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

      const exchange = Number(facture.exchangeInvoiceAmount) || 0;
      const transitaire = Number(facture.supplierInvoiceAmount) || 0;
      const fraisSupp = Number(facture.additionalCostsAmount) || 0;
      const fretMad = (Number(facture.freightCost) || 0) * tauxChange;

      // Frais pour coût de revient (avec fret)
      const mtFraisRevient = (exchange + transitaire + fraisSupp + fretMad) / 1.20;
      // Frais pour coût de vente (sans fret)
      const mtFraisVente = (exchange + transitaire + fraisSupp) / 1.20;

      const cbmTotal = fArticles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);
      const puMap = dpDeclarations[facture.id] || {};

      // ─ Coût de Revient (par article) ─
      let dosRevient = 0;
      fArticles.forEach(a => {
        const cbm = Number(a.cubicMeasurement) || 0;
        const nw = Number(a.netWeight) || 0;
        const qty = Number(a.quantity) || 0;
        const pauDollar = Number(a.purchasePricePerUnit) || 0;
        const valAchatMad = qty * pauDollar * tauxChange;
        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisRevient : 0;
        const cat = subCategories.find((c: any) => c.name === a.categoryId);
        const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
        const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
        const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
        const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
        const valDouane = cvk != null ? nw * cvk : 0;
        const di = idr != null ? valDouane * idr : 0;
        const tpi = tpr != null ? valDouane * tpr : 0;
        const tic = ticr != null ? valDouane * ticr : 0;
        const tva = tvar != null ? (valDouane + di + tpi) * tvar : 0;
        dosRevient += valAchatMad + fraisCmd + di + tpi + tic + tva;
      });

      // ─ Coût de Vente (par catégorie, depuis DP) ─
      const catMap: Record<string, { qty: number; nw: number; cbm: number; unit: string }> = {};
      fArticles.forEach(a => {
        const catId = a.categoryId || '—';
        if (!catMap[catId]) catMap[catId] = { qty: 0, nw: 0, cbm: 0, unit: a.unitOfMeasure || 'U' };
        catMap[catId].qty += Number(a.quantity) || 0;
        catMap[catId].nw += Number(a.netWeight) || 0;
        catMap[catId].cbm += Number(a.cubicMeasurement) || 0;
      });

      let dosVente = 0;
      Object.entries(catMap).forEach(([categoryId, { qty, nw, cbm }]) => {
        const puDollar = parseFloat(puMap[categoryId] ?? '') || 0;
        if (puDollar === 0) return;
        const valAchatMad = qty * puDollar * tauxChange;
        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisVente : 0;
        const cat = subCategories.find((c: any) => c.name === categoryId);
        const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
        const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
        const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
        const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
        const valDouane = cvk != null ? nw * cvk : 0;
        const di = idr != null ? valDouane * idr : 0;
        const tpi = tpr != null ? valDouane * tpr : 0;
        const tic = ticr != null ? valDouane * ticr : 0;
        const totalHT = valAchatMad + fraisCmd + di + tpi + tic;
        const marge = totalHT * MARGE_RATE;
        const baseTva = valDouane + di + tpi + fraisCmd;
        const tva = tvar != null ? baseTva * tvar : 0;
        dosVente += totalHT + marge + tva;
      });

      const diff = dosRevient - dosVente;
      totalRevient += dosRevient;
      totalVente += dosVente;
      return { id: facture.id, revient: dosRevient, vente: dosVente, diff };
    });

    return { perDossier, totalRevient, totalVente, totalDiff: totalRevient - totalVente };
  }, [safeFactures, safeArticles, subCategories, dpDeclarations]);

  // ── KPI Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalItemsVal = 0;
    let totalCbm = 0;
    let totalFreight = 0;
    let totalDeclaredVal = 0;

    const toOrderArticles = safeArticles.filter(a => a.status === 'TO_ORDER');
    const piArticles = safeArticles.filter(a => a.status === 'PI');
    const transitArticles = safeArticles.filter(a => a.status === 'IN_TRANSIT');
    const totalToOrderQty = toOrderArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const totalPiQty = piArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);

    const statusCounts: Record<string, number> = {};
    safeArticles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      totalItemsVal += val;
      totalCbm += Number(art.cubicMeasurement) || 0;
      statusCounts[art.status] = (statusCounts[art.status] || 0) + 1;
    });

    safeFactures.forEach(f => {
      totalFreight += (Number(f.freightCost) || Number(f.freight) || 0);
      const fArticles = safeArticles.filter(a => a.factureId === f.id);
      const fItemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const fFreight = Number(f.freightCost) || Number(f.freight) || 0;
      totalDeclaredVal += (Number(f.declaredValue) || fItemsVal + fFreight);
    });

    const totalRealPortfolioVal = totalItemsVal + totalFreight;
    const avgFreight = safeFactures.length
      ? Math.round(safeFactures.reduce((s, f) => s + (Number(f.freightCost) || 0), 0) / safeFactures.length)
      : 0;

    return {
      totalVal: totalRealPortfolioVal, totalCbm, totalFreight,
      totalFactures: safeFactures.length,
      toOrderCount: toOrderArticles.length, totalToOrderQty,
      piCount: piArticles.length, totalPiQty,
      transitCount: transitArticles.length,
      totalDeclaredVal, avgFreight, statusCounts,
      totalArticles: safeArticles.length,
    };
  }, [safeArticles, safeFactures]);

  // ── Next arriving shipment ─────────────────────────────────────────────────
  const nextArrivingFacture = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const futureFactures = [...safeFactures]
      .filter(f => f.arrivalDate && new Date(f.arrivalDate) >= now)
      .sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    if (futureFactures.length === 0) return null;
    const facture = futureFactures[0];
    const items = safeArticles.filter(a => a.factureId === facture.id);
    const daysUntil = Math.ceil((new Date(facture.arrivalDate).getTime() - now.getTime()) / 86400000);
    const summary: Record<string, { qty: number; unit: string }> = {};
    items.forEach(item => {
      const cat = item.categoryId || 'DIVERS';
      if (!summary[cat]) summary[cat] = { qty: 0, unit: item.unitOfMeasure || '' };
      summary[cat].qty += Number(item.quantity) || 0;
    });
    return { ...facture, categorySummary: Object.entries(summary).map(([name, data]) => ({ name, ...data })), daysUntil };
  }, [safeFactures, safeArticles]);

  // ── Analytics ──────────────────────────────────────────────────────────────
  const analyticsData = useMemo(() => {
    const groupMap: Record<string, number> = {};
    const groupVolMap: Record<string, number> = {};
    const supplierMap: Record<string, number> = {};
    const evolutionMap: Record<string, number> = {};
    const freightByMonth: Record<string, { total: number; count: number }> = {};

    safeArticles.forEach(art => {
      const gId = art.generalCategoryId || 'Non classé';
      const sup = art.supplierId || 'Inconnu';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const qty = Number(art.quantity) || 0;
      const date = art.orderDate || (art.createdAt ? new Date(art.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      const gName = generalCategories.find(gc => gc.id === gId)?.name || gId;
      groupMap[gName] = (groupMap[gName] || 0) + val;
      groupVolMap[gName] = (groupVolMap[gName] || 0) + qty;
      supplierMap[sup] = (supplierMap[sup] || 0) + val;
      if (date) { const month = date.substring(0, 7); evolutionMap[month] = (evolutionMap[month] || 0) + val; }
    });

    safeFactures.forEach(f => {
      if (f.shippingDate) {
        const month = f.shippingDate.substring(0, 7);
        const cost = Number(f.freightCost) || Number(f.freight) || 0;
        if (!freightByMonth[month]) freightByMonth[month] = { total: 0, count: 0 };
        freightByMonth[month].total += cost;
        freightByMonth[month].count += 1;
      }
      const sup = f.supplierId || 'Inconnu';
      supplierMap[sup] = (supplierMap[sup] || 0) + (Number(f.freightCost) || Number(f.freight) || 0);
    });

    const groupValueData = Object.entries(groupMap)
      .map(([name, value], i) => ({ name, value, volume: groupVolMap[name] || 0, fill: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value);

    const supplierData = Object.entries(supplierMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const evolutionData = Object.entries(evolutionMap)
      .map(([date, value]) => ({ date: date.substring(5), full: date, value }))
      .sort((a, b) => a.full.localeCompare(b.full));

    const statusData = Object.entries(stats.statusCounts).map(([status, count], i) => ({
      name: status, value: count, fill: STATUS_COLORS[status] || PALETTE[i % PALETTE.length]
    }));

    return { groupValueData, supplierData, evolutionData, statusData };
  }, [safeArticles, safeFactures, generalCategories, stats.statusCounts]);

  // ── Recent activity (latest articles by createdAt) ─────────────────────────
  const recentActivity = useMemo(() =>
    [...safeArticles]
      .filter(a => a.createdAt)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 5)
  , [safeArticles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            Tableau de Bord
          </h1>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-0.5">
            Vue d'ensemble — {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Données en temps réel</span>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <QuickAction
          label="Besoins Identifiés"
          count={stats.toOrderCount}
          sub={`VOL: ${Number(stats.totalToOrderQty).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités`}
          icon={ClipboardList}
          color="#f59e0b"
          onClick={() => onNavigate('to-order')}
        />
        <QuickAction
          label="En Production (PI)"
          count={stats.piCount}
          sub={`VOL: ${Number(stats.totalPiQty).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités`}
          icon={Factory}
          color="#8b5cf6"
          onClick={() => onNavigate('pending')}
        />
        <QuickAction
          label="En Transit"
          count={stats.transitCount}
          sub={`${stats.totalFactures} dossiers actifs`}
          icon={Truck}
          color="#0ea5e9"
          onClick={() => onNavigate('transit')}
        />
      </div>

      {/* ── KPI Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Valeur Portefeuille"
          value={`${Number(stats.totalVal / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}K $`}
          sub="Valeur réelle (marchandise + fret)"
          icon={DollarSign}
          color="#f59e0b"
        />
        <StatCard
          label="Volume Importé"
          value={`${Number(stats.totalCbm).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³`}
          sub={`${stats.totalArticles} références actives`}
          icon={Box}
          color="#0ea5e9"
        />
        <StatCard
          label="Valeur Déclarée"
          value={`${Number(stats.totalDeclaredVal / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}K $`}
          sub="Déclaration douanière totale"
          icon={ShieldCheck}
          color="#10b981"
        />
        <StatCard
          label="Arrivages (Factures)"
          value={String(stats.totalFactures)}
          sub={`Fret moy: ${Number(stats.avgFreight).toLocaleString('fr-FR')} $`}
          icon={Anchor}
          color="#6366f1"
          onClick={() => onNavigate('factures')}
        />
      </div>

      {/* ── Marge Brute (Coût Revient - Coût Vente) ───────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-stone-900 to-stone-800 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-amber-500/10 rounded-full translate-y-1/2 blur-2xl pointer-events-none" />
        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl">
              <Percent className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em]">Tous Arrivages Confondus</p>
              <p className="text-sm font-black text-white uppercase tracking-tight">Coût Revient vs Coût de Vente</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-2">Total Coût de Revient TTC</p>
              <p className="text-2xl font-black text-white leading-none">
                {(marginData.totalRevient / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K
              </p>
              <p className="text-[9px] font-bold text-stone-400 mt-1 uppercase">MAD</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-2">Total Coût de Vente TTC</p>
              <p className="text-2xl font-black text-sky-300 leading-none">
                {(marginData.totalVente / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K
              </p>
              <p className="text-[9px] font-bold text-stone-400 mt-1 uppercase">MAD</p>
            </div>
            <div className={`rounded-2xl px-5 py-4 border ${
              marginData.totalDiff >= 0
                ? 'bg-emerald-500/20 border-emerald-500/30'
                : 'bg-red-500/20 border-red-500/30'
            }`}>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-2">Différence (Revient − Vente)</p>
              <p className={`text-2xl font-black leading-none ${
                marginData.totalDiff >= 0 ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {marginData.totalDiff >= 0 ? '+' : ''}{(marginData.totalDiff / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K
              </p>
              <p className="text-[9px] font-bold text-stone-400 mt-1 uppercase">MAD · {marginData.perDossier.length} dossiers</p>
            </div>
          </div>
          {/* Par dossier */}
          {marginData.perDossier.some(d => d.revient > 0 || d.vente > 0) && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-3">Détail par Dossier</p>
              <div className="flex flex-wrap gap-2">
                {marginData.perDossier.filter(d => d.revient > 0 || d.vente > 0).map(d => (
                  <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[8px] font-black text-stone-400 uppercase mb-1">{d.id}</p>
                    <p className={`text-[11px] font-black ${
                      d.diff >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {d.diff >= 0 ? '+' : ''}{(d.diff / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K MAD
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Incoming Shipment Alert ────────────────────────────────────────── */}
      {nextArrivingFacture && (
        <div className="relative rounded-3xl overflow-hidden bg-stone-950 text-white shadow-2xl">
          {/* Background glows */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-blue-500/10 rounded-full translate-y-1/2 blur-2xl pointer-events-none" />

          <div className="relative p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl">
                  <Ship className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em]">Arrivage Imminent</p>
                  <p className="text-sm font-black text-white uppercase tracking-tight">Prochain Flux Entrant</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {nextArrivingFacture.daysUntil <= 7 && (
                  <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 font-black text-[9px] uppercase tracking-widest animate-pulse">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    J-{nextArrivingFacture.daysUntil}
                  </Badge>
                )}
                <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30 font-black text-[9px] uppercase tracking-widest">
                  FLUX ENTRANT
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-2">N° Dossier</p>
                <p className="text-3xl font-black tracking-tighter uppercase">{nextArrivingFacture.id}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-2">Date d'Arrivée Port</p>
                <p className="text-2xl font-black text-blue-400 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  {nextArrivingFacture.arrivalDate}
                </p>
                <p className="text-[10px] text-stone-500 font-bold mt-1">
                  Dans {nextArrivingFacture.daysUntil} jour{nextArrivingFacture.daysUntil > 1 ? 's' : ''}
                </p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-2">Fournisseur</p>
                <p className="text-2xl font-black text-stone-200 uppercase leading-tight">
                  {nextArrivingFacture.supplierId || nextArrivingFacture.supplier || '—'}
                </p>
              </div>
            </div>

            {nextArrivingFacture.categorySummary.length > 0 && (
              <div className="border-t border-white/5 pt-6">
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-[0.2em] mb-4">Contenu Manifeste</p>
                <div className="flex flex-wrap gap-2">
                  {nextArrivingFacture.categorySummary.map((item: { name: string; qty: number; unit: string }, idx: number) => (
                    <div key={idx} className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl hover:bg-white/10 transition-colors">
                      <p className="text-[8px] font-black text-stone-400 uppercase truncate max-w-[80px] mb-0.5">{item.name}</p>
                      <p className="text-sm font-black text-white">
                        {Number(item.qty).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                        <span className="text-[9px] text-stone-500 font-bold ml-1">{item.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <Button
                onClick={() => onNavigateToFacture ? onNavigateToFacture(nextArrivingFacture.id) : onNavigate('factures')}
                className="bg-amber-500 hover:bg-amber-400 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl px-6 h-10 transition-all hover:shadow-lg hover:shadow-amber-500/25"
              >
                Voir le Dossier <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts Row 1: Évolution + Répartition ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Evolution mensuelle */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
                <Activity className="w-4 h-4 text-amber-500" /> Évolution Mensuelle ($)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-2 pt-2 pb-6">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData.evolutionData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAmber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900', fill: '#94a3b8', textTransform: 'uppercase' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} style={{ fontSize: '9px', fontWeight: '900', fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={3} fill="url(#gradAmber)" dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Répartition statuts */}
        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <BarChart2 className="w-4 h-4 text-indigo-500" /> Statuts Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            {analyticsData.statusData.length > 0 ? (
              <div className="space-y-3">
                {analyticsData.statusData.map((s, i) => {
                  const pct = Math.round((s.value / stats.totalArticles) * 100);
                  const label: Record<string, string> = {
                    TO_ORDER: 'Besoins', PI: 'Production', IN_TRANSIT: 'Transit', ARRIVED: 'Arrivé', STOCK: 'Stock'
                  };
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label[s.name] || s.name}</span>
                        <span className="text-[10px] font-black" style={{ color: s.fill }}>{s.value} art. ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.fill }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-stone-300">
                <Package className="w-8 h-8 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Aucune donnée</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-stone-50">
              <div className="flex justify-between">
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Total Références</span>
                <span className="text-lg font-black text-stone-900">{stats.totalArticles}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2: Capital + Fournisseurs ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Capital par pôle */}
        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
                <Layers className="w-4 h-4 text-stone-800" /> Capital par Pôle Logistique
              </CardTitle>
              <div className="flex gap-1">
                {(['value', 'volume'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg transition-all ${chartMode === m ? 'bg-stone-900 text-white' : 'text-stone-400 hover:bg-stone-50'}`}
                  >
                    {m === 'value' ? 'Valeur' : 'Volume'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-6 pt-4">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.groupValueData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f1f1" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={160}
                    style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#fafafa' }} />
                  <Bar dataKey={chartMode} radius={[0, 6, 6, 0]} barSize={20}>
                    {analyticsData.groupValueData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fournisseurs Pie */}
        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Users className="w-4 h-4 text-blue-500" /> Répartition Fournisseurs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analyticsData.supplierData}
                    cx="50%" cy="45%"
                    innerRadius={65} outerRadius={95}
                    paddingAngle={4} dataKey="value"
                    strokeWidth={0}
                  >
                    {analyticsData.supplierData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [`${Number(val).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`, 'Valeur']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle"
                    wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.08em' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Fret Performance + Recent Activity ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fret Performance */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Ship className="w-4 h-4 text-blue-500" /> Évolution Coût Fret Moyen ($)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-6 pt-4">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={safeFactures
                    .filter(f => f.shippingDate)
                    .reduce((acc: any[], f) => {
                      const month = f.shippingDate.substring(5, 7) + '/' + f.shippingDate.substring(0, 4);
                      const key = f.shippingDate.substring(0, 7);
                      const exist = acc.find(x => x.key === key);
                      if (exist) { exist.total += Number(f.freightCost) || 0; exist.count++; }
                      else acc.push({ date: month, key, total: Number(f.freightCost) || 0, count: 1, value: 0 });
                      return acc;
                    }, [])
                    .map(x => ({ ...x, value: Math.round(x.total / x.count) }))
                    .sort((a, b) => a.key.localeCompare(b.key))}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900', fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={v => `${v.toLocaleString('fr-FR')}$`} style={{ fontSize: '9px', fontWeight: '900', fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={3} fill="url(#gradBlue)"
                    dot={{ r: 4, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Fret summary pills */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-stone-50 px-4">
              <div className="text-center">
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Total Fret</p>
                <p className="text-base font-black text-stone-900">{Number(stats.totalFreight).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $</p>
              </div>
              <div className="text-center border-x border-stone-50">
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Moy / Dossier</p>
                <p className="text-base font-black text-blue-500">{Number(stats.avgFreight).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Nb Dossiers</p>
                <p className="text-base font-black text-stone-900">{stats.totalFactures}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="pb-0 pt-6 px-6">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Clock className="w-4 h-4 text-emerald-500" /> Activité Récente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-stone-300">
                <RefreshCw className="w-8 h-8 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Aucune activité</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((art, i) => {
                  const color = STATUS_COLORS[art.status] || '#94a3b8';
                  const d = art.createdAt ? new Date(art.createdAt.seconds * 1000) : null;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-stone-800 truncate">{art.designation || art.reference || `Article #${i + 1}`}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md" style={{ background: `${color}18`, color }}>
                            {art.status}
                          </span>
                          {d && <span className="text-[8px] text-stone-300 font-bold">{d.toLocaleDateString('fr-FR')}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-stone-50">
              <button
                onClick={() => onNavigate('data')}
                className="text-[9px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-900 transition-colors flex items-center gap-1"
              >
                Voir tout dans Data Lab <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardView;
