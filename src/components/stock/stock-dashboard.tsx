"use client";

import React, { useState, useMemo } from 'react';
import { TrendingUp, Boxes, ArrowLeftRight, Bell, DollarSign, ArrowRight, Package, ShoppingBag, BarChart3, Eye, Calendar, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { StockMovement, StockItem, Sale, StoreLocation } from '@/lib/types';

type StockView = 'dashboard' | 'pos' | 'inventory' | 'sales' | 'movements' | 'alerts';

interface StockDashboardProps {
  stockItems: StockItem[];
  movements: StockMovement[];
  categories: any[];
  sales: Sale[];
  invoices?: any[];
  clients?: any[];
  userRole?: 'ADMIN' | 'COMMERCIAL';
  activeStore: StoreLocation | 'ALL';
  onNavigate: (v: StockView) => void;
}

const EMERALD_SHADES = ['#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#d1fae5'];
const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
const fmtN = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export default function StockDashboard({ stockItems, movements, categories, sales, invoices = [], clients = [], userRole = 'ADMIN', activeStore, onNavigate }: StockDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales'>('overview');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  /* ── 1. GLOBAL STATS (OVERVIEW) ── */
  const totalValue     = useMemo(() => stockItems.reduce((s, i) => s + i.totalValue, 0), [stockItems]);
  const totalRefs      = stockItems.length;
  const movementsMonth = useMemo(() => movements.filter(m => m.date?.startsWith(currentMonth)).length, [movements, currentMonth]);
  const alertCount     = useMemo(() => stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length, [stockItems]);

  const caMonth   = useMemo(() => sales.filter(s => s.date?.startsWith(currentMonth)).reduce((t, s) => t + s.totalAmount, 0), [sales, currentMonth]);
  const caToday   = useMemo(() => sales.filter(s => s.date === todayStr).reduce((t, s) => t + s.totalAmount, 0), [sales, todayStr]);
  const nbSalesToday = useMemo(() => sales.filter(s => s.date === todayStr).length, [sales, todayStr]);
  const nbSalesMonth = useMemo(() => sales.filter(s => s.date?.startsWith(currentMonth)).length, [sales, currentMonth]);
  const panierMoyen  = nbSalesMonth > 0 ? caMonth / nbSalesMonth : 0;
  const marginMonth  = useMemo(() => sales.filter(s => s.date?.startsWith(currentMonth)).reduce((t, s) => t + (s.totalMargin || 0), 0), [sales, currentMonth]);

  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    stockItems.forEach(i => {
      const key = (categories.find(c => c.id === i.categoryId)?.name || i.categoryId || 'Autre').toUpperCase();
      map[key] = (map[key] || 0) + (userRole === 'ADMIN' ? i.totalValue : i.currentQty);
    });
    return Object.entries(map).map(([name, value]) => ({ 
        name: name.length > 18 ? name.substring(0, 18) + '…' : name, 
        value: Math.round(value) 
    })).sort((a,b) => b.value - a.value).slice(0, 10);
  }, [stockItems, categories, userRole]);

  const storeSalesData = useMemo(() => {
    const map = { ENTREPOT: 0, DERB_OMAR: 0, CHRIFA: 0 };
    sales.filter(s => s.date?.startsWith(currentMonth)).forEach(s => {
      const store = s.storeId || 'ENTREPOT';
      if (store in map) map[store as keyof typeof map] += s.totalAmount;
    });
    return [
      { name: 'Entrepôt', value: map.ENTREPOT, fill: '#059669' },
      { name: 'Derb Omar', value: map.DERB_OMAR, fill: '#8b5cf6' },
      { name: 'Chrifa', value: map.CHRIFA, fill: '#f59e0b' },
    ].filter(d => d.value > 0);
  }, [sales, currentMonth]);

  const lastMovements = useMemo(() => [...movements].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5), [movements]);

  const thisMonthMov = movements.filter(m => m.date?.startsWith(currentMonth));
  const pieData = [
    { name: 'Entrées', value: thisMonthMov.filter(m => m.type === 'IN').length },
    { name: 'Sorties', value: thisMonthMov.filter(m => m.type === 'OUT').length },
    { name: 'Ajust.', value: thisMonthMov.filter(m => m.type === 'ADJUSTMENT').length },
  ].filter(d => d.value > 0);
  const PIE_COLORS = ['#059669', '#ef4444', '#3b82f6'];

  const kpisAdmin = [
    { label: 'Valeur Totale Stock', value: fmt$(totalValue), icon: DollarSign, color: 'emerald', sub: `${totalRefs} référence${totalRefs > 1 ? 's' : ''}`, onClick: () => onNavigate('inventory') },
    { label: "CA aujourd'hui", value: fmt$(caToday), icon: TrendingUp, color: 'violet', sub: `${nbSalesToday} vente${nbSalesToday > 1 ? 's' : ''} · ${today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`, onClick: () => setActiveTab('sales') },
    { label: 'CA ce mois', value: fmt$(caMonth), icon: ArrowLeftRight, color: 'blue', sub: `Marge : ${fmt$(marginMonth)}`, onClick: () => setActiveTab('sales') },
    { label: 'Alertes actives', value: fmtN(alertCount), icon: Bell, color: alertCount > 0 ? 'red' : 'emerald', sub: alertCount > 0 ? 'Stock bas ou rupture' : 'Tout est OK', urgent: alertCount > 0, onClick: () => onNavigate('alerts') },
  ];

  const kpisCommercial = [
    { label: "CA aujourd'hui", value: fmt$(caToday), icon: TrendingUp, color: 'violet', sub: `${nbSalesToday} vente${nbSalesToday > 1 ? 's' : ''} · ${today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`, onClick: () => setActiveTab('sales') },
    { label: 'CA ce mois', value: fmt$(caMonth), icon: DollarSign, color: 'blue', sub: `${nbSalesMonth} ventes ce mois-ci`, onClick: () => setActiveTab('sales') },
    { label: 'Panier Moyen', value: fmt$(panierMoyen), icon: Package, color: 'emerald', sub: 'Sur ce mois-ci' },
    { label: 'Alertes actives', value: fmtN(alertCount), icon: Bell, color: alertCount > 0 ? 'red' : 'emerald', sub: alertCount > 0 ? 'Stock bas ou rupture' : 'Tout est OK', urgent: alertCount > 0, onClick: () => onNavigate('alerts') },
  ];
  const kpis = userRole === 'ADMIN' ? kpisAdmin : kpisCommercial;

  /* ── 2. SALES STATS (ANALYTICS) ── */
  const effectiveSales = useMemo(() => {
    if (sales.length > 0) return sales;
    if (!invoices || invoices.length === 0) return [];
    return invoices.filter((inv: any) => inv.status !== 'CANCELLED').map((inv: any) => {
      const client = (clients || []).find((c: any) => c.id === inv.clientId);
      const totalAmount = Number(inv.totalAfterDiscount || inv.totalAmount || 0);
      const totalCost = (inv.items || []).reduce((s: number, it: any) => s + (Number(it.purchasePricePerUnit || 0) * Number(it.qty || 0)), 0);
      return {
        id: inv.id,
        date: inv.date || inv.createdAt?.toDate?.().toISOString().split('T')[0] || '',
        clientId: inv.clientId,
        clientName: client?.name || inv.clientName || 'Vente directe',
        items: (inv.items || []).map((it: any) => ({
          articleId: it.articleId || '', productName: it.productName || it.name || '', color: it.color, size: it.size,
          qty: Number(it.qty || 0), sellingPrice: Number(it.unitPrice || it.sellingPrice || 0), totalPrice: Number(it.totalPrice || 0),
          margin: (Number(it.unitPrice || it.sellingPrice || 0) - Number(it.purchasePricePerUnit || 0)) * Number(it.qty || 0),
        })),
        totalAmount, totalCost, totalMargin: totalAmount - totalCost, notes: inv.notes,
      };
    });
  }, [sales, invoices, clients]);

  const months = useMemo(() => {
    const s = new Set<string>();
    effectiveSales.forEach((s2: any) => { if (s2.date) s.add(s2.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [effectiveSales]);

  const filteredSales = useMemo(() => {
    if (filterMonth === 'all') return [...effectiveSales].sort((a: any, b: any) => b.date.localeCompare(a.date));
    return effectiveSales.filter((s: any) => s.date?.startsWith(filterMonth)).sort((a: any, b: any) => b.date.localeCompare(a.date));
  }, [effectiveSales, filterMonth]);

  const totalCA     = filteredSales.reduce((s, v) => s + v.totalAmount, 0);
  const totalCost   = filteredSales.reduce((s, v) => s + v.totalCost, 0);
  const totalMargin = filteredSales.reduce((s, v) => s + v.totalMargin, 0);
  const marginRate  = totalCA > 0 ? (totalMargin / totalCA) * 100 : 0;
  const avgTicket   = filteredSales.length > 0 ? totalCA / filteredSales.length : 0;

  const caByMonth = useMemo(() => {
    const map: Record<string, { ca: number; cout: number; nb: number }> = {};
    effectiveSales.forEach((v: any) => {
      const m = v.date?.substring(0, 7) || '';
      if (!map[m]) map[m] = { ca: 0, cout: 0, nb: 0 };
      map[m].ca   += v.totalAmount; map[m].cout += v.totalCost; map[m].nb   += 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, d]) => {
      const [y, m] = month.split('-');
      return { month: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`, ca: Math.round(d.ca), cout: Math.round(d.cout), marge: Math.round(d.ca - d.cout), nb: d.nb };
    });
  }, [effectiveSales]);

  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; ca: number; margin: number }> = {};
    filteredSales.forEach(v => {
      v.items.forEach((item: any) => {
        if (!map[item.articleId]) map[item.articleId] = { name: item.productName, qty: 0, ca: 0, margin: 0 };
        map[item.articleId].qty    += item.qty; map[item.articleId].ca += item.totalPrice; map[item.articleId].margin += item.margin;
      });
    });
    return Object.values(map).sort((a, b) => b.ca - a.ca).slice(0, 8);
  }, [filteredSales]);

  const kpisSales = [
    { label: 'Chiffre d\'Affaires', value: fmt$(totalCA), icon: DollarSign, color: 'violet', sub: `${fmtN(filteredSales.length)} vente${filteredSales.length > 1 ? 's' : ''}` },
    { label: 'Marge Brute', value: fmt$(totalMargin), icon: TrendingUp, color: totalMargin >= 0 ? 'emerald' : 'red', sub: `${marginRate.toFixed(1)}% du CA` },
    { label: 'Coût des Ventes', value: fmt$(totalCost), icon: BarChart3, color: 'stone', sub: 'Achat × qté vendue' },
    { label: 'Ticket Moyen', value: fmt$(avgTicket), icon: ShoppingBag, color: 'blue', sub: 'par transaction' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header Principal ── */}
      <header className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-emerald-600/10 rounded-full translate-y-1/2 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Temps réel</p>
            <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight">
              Tableau de Bord<br /><span className="text-emerald-400">Stock & Ventes</span>
            </h1>
            <p className="text-emerald-300/70 text-xs font-bold mt-3">
              {today.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex bg-emerald-950/50 p-1.5 rounded-2xl border border-emerald-800/50 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'overview' ? 'bg-white text-emerald-900 shadow-lg' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
            >
              <Activity className="w-4 h-4" /> Aperçu Global
            </button>
            {userRole === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('sales')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'sales' ? 'bg-white text-emerald-900 shadow-lg' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
              >
                <TrendingUp className="w-4 h-4" /> Ventes & Marges
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── CTA Alerte ── */}
      {alertCount > 0 && activeTab === 'overview' && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-xl shrink-0">
            <Bell className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-red-900 uppercase tracking-tight">{alertCount} alerte{alertCount > 1 ? 's' : ''} de stock actives</p>
            <p className="text-[10px] font-bold text-red-600">Des produits sont en rupture ou sous le seuil minimal.</p>
          </div>
          <Button onClick={() => onNavigate('alerts')} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[9px] tracking-widest px-5 h-9 rounded-xl shrink-0 gap-1.5 shadow-lg shadow-red-500/20">
            Voir les alertes <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* =====================================================================
                               ONGLET : APERCU GLOBAL
          ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ label, value, icon: Icon, color, sub, urgent, onClick }) => (
              <Card key={label} onClick={onClick} className={`border-none shadow-xl rounded-2xl overflow-hidden transition-all ${onClick ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-0.5' : ''} ${urgent ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
                <div className={`h-1.5 bg-${color}-500`} />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 bg-${color}-50 rounded-xl`}><Icon className={`w-5 h-5 text-${color}-600`} /></div>
                    {urgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{value}</p>
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
                  <p className="text-[9px] font-bold text-stone-400 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{userRole === 'ADMIN' ? 'Valeur par catégorie' : 'Stock par catégorie'}</p>
                  <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Top 10 Catégories</h3>
                </div>
              </div>
              {catData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={catData} margin={{ top: 0, right: 0, left: 0, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#78716c' }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => userRole === 'ADMIN' ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                    <Tooltip formatter={(v: any) => [userRole === 'ADMIN' ? fmt$(v) : fmtN(v), userRole === 'ADMIN' ? 'Valeur' : 'Quantité']} labelStyle={{ fontWeight: 700, fontSize: 11 }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {catData.map((_, i) => <Cell key={i} fill={EMERALD_SHADES[i % EMERALD_SHADES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px]"><p className="text-stone-300 font-black uppercase text-[10px]">Aucune donnée</p></div>
              )}
            </div>

            {userRole === 'ADMIN' ? (
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Ce mois</p>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-4">CA par Magasin</h3>
                {storeSalesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={storeSalesData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {storeSalesData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{v}</span>} />
                      <Tooltip formatter={(v: any) => [fmt$(v), 'CA']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] space-y-2"><DollarSign className="w-8 h-8 text-stone-200" /><p className="text-stone-300 font-black uppercase text-[9px]">Aucune vente ce mois</p></div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Ce mois</p>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-4">Types de Mouvements</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{v}</span>} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] space-y-2"><ArrowLeftRight className="w-8 h-8 text-stone-200" /><p className="text-stone-300 font-black uppercase text-[9px]">Aucun mouvement</p></div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-4">
                <div><p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Global</p><h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Top Produits Vendus</h3></div>
                {userRole === 'ADMIN' && (
                   <Button onClick={() => setActiveTab('sales')} variant="ghost" size="sm" className="text-[9px] font-black uppercase tracking-wider text-stone-400 hover:text-emerald-700 gap-1">Tout voir <ArrowRight className="w-3 h-3" /></Button>
                )}
              </div>
              <div className="space-y-2">
                {topProducts.slice(0,5).length === 0 ? <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucune vente</p> : topProducts.slice(0,5).map((item, i) => (
                  <div key={`${item.name}-${i}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-[9px] font-black text-emerald-700 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0"><p className="text-[10px] font-black text-stone-800 uppercase truncate">{item.name}</p><p className="text-[8px] font-bold text-stone-400">{item.qty} vendus</p></div>
                    {userRole === 'ADMIN' && <span className="text-[10px] font-black text-emerald-700 shrink-0">{fmt$(item.ca)}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
              <div className="flex items-center justify-between mb-4">
                <div><p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Historique</p><h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Derniers Mouvements</h3></div>
                <Button onClick={() => onNavigate('movements')} variant="ghost" size="sm" className="text-[9px] font-black uppercase tracking-wider text-stone-400 hover:text-emerald-700 gap-1">Tout voir <ArrowRight className="w-3 h-3" /></Button>
              </div>
              <div className="space-y-2">
                {lastMovements.length === 0 ? <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucun mouvement</p> : lastMovements.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.type === 'IN' ? 'bg-emerald-100' : m.type === 'OUT' ? 'bg-red-100' : 'bg-blue-100'}`}>
                      <Package className={`w-3.5 h-3.5 ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0"><p className="text-[10px] font-black text-stone-800 uppercase truncate">{m.productName}</p><p className="text-[8px] font-bold text-stone-400">{m.date} · {m.reason}</p></div>
                    <span className={`text-[10px] font-black shrink-0 ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{fmtN(m.quantity)} {m.unitOfMeasure}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
                               ONGLET : VENTES & MARGES
          ===================================================================== */}
      {activeTab === 'sales' && userRole === 'ADMIN' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-black text-stone-900 uppercase tracking-tighter">Rapport Analytique</h2>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-10 w-44 rounded-xl bg-white border-stone-200 text-stone-900 font-bold text-sm shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute la période</SelectItem>
                <SelectItem value={currentMonth}>Ce mois</SelectItem>
                {months.filter(m => m !== currentMonth).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpisSales.map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
                <div className={`h-1.5 bg-${color}-500`} />
                <div className="p-5">
                  <div className={`p-2.5 bg-${color}-50 rounded-xl w-fit mb-3`}><Icon className={`w-5 h-5 text-${color}-600`} /></div>
                  <p className="text-2xl font-black text-stone-900 leading-none">{value}</p>
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
                  <p className="text-[9px] font-bold text-stone-400 mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {caByMonth.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Evolution</p>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-5">CA vs Coût par mois</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={caByMonth} margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 8, fontWeight: 700, fill: '#78716c' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any, name: string) => [fmt$(v), name === 'ca' ? 'CA' : name === 'cout' ? 'Coût' : 'Marge']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="ca"   name="ca"   radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                    <Bar dataKey="cout" name="cout" radius={[4, 4, 0, 0]} fill="#e2e8f0" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Rentabilité</p>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-5">Marge Brute par mois</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={caByMonth} margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                    <XAxis dataKey="month" tick={{ fontSize: 8, fontWeight: 700, fill: '#78716c' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [fmt$(v), 'Marge']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="marge" stroke="#059669" strokeWidth={3} dot={{ fill: '#059669', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Performances</p>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-4">Top Produits Vendus ({filterMonth === 'all' ? 'Global' : filterMonth})</h3>
              {topProducts.length === 0 ? <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucune vente enregistrée</p> : (
                <div className="space-y-2">
                  {topProducts.map((p, i) => (
                    <div key={`${p.name}-${i}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                      <span className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-[9px] font-black text-violet-700 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-stone-800 uppercase truncate">{p.name}</p>
                        <p className="text-[8px] font-bold text-stone-400">{fmtN(p.qty)} unité{p.qty > 1 ? 's' : ''} vendue{p.qty > 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-violet-700">{fmt$(p.ca)}</p>
                        <p className={`text-[8px] font-bold ${p.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>+{fmt$(p.margin)} marge</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
              <div className="p-6 pb-3">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Historique Complet</p>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Liste des Ventes</h3>
              </div>
              <div className="divide-y divide-stone-50 max-h-[380px] overflow-y-auto">
                {filteredSales.length === 0 ? <p className="text-center text-stone-300 text-[10px] font-black uppercase py-12">Aucune vente</p> : filteredSales.slice(0, 30).map((sale: any) => (
                  <div key={sale.id} className="flex items-center gap-3 px-6 py-3 hover:bg-stone-50 cursor-pointer transition-colors group" onClick={() => setSelectedSale(sale)}>
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-stone-800">{sale.clientName || 'Vente directe'}</p>
                        <span className="text-[8px] font-bold text-stone-300">{sale.items.length} art.</span>
                      </div>
                      <p className="text-[9px] font-bold text-stone-400 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> {sale.date}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-stone-900">{fmt$(sale.totalAmount)}</p>
                      <p className={`text-[8px] font-bold ${sale.totalMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {sale.totalMargin >= 0 ? '+' : ''}{fmt$(sale.totalMargin)} marge
                      </p>
                    </div>
                    <Eye className="w-3.5 h-3.5 text-stone-300 group-hover:text-violet-500 transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal détail vente (Partagé) ── */}
      <Dialog open={!!selectedSale} onOpenChange={open => !open && setSelectedSale(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-700 to-violet-600 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Détail de la vente</DialogTitle>
            <p className="text-[10px] font-bold text-violet-200 mt-1">{selectedSale?.date} · {selectedSale?.clientName || 'Vente directe'}</p>
          </div>
          <div className="p-6 space-y-4 bg-white max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              {selectedSale?.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-stone-800 uppercase">{item.productName}</p>
                    {(item.color || item.size) && <p className="text-[8px] text-stone-400 font-bold">{[item.color, item.size].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-black text-stone-900">{item.qty} × {fmt$(item.sellingPrice)}</p>
                    <p className="text-[9px] font-black text-violet-700">{fmt$(item.totalPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
            {userRole === 'ADMIN' && (
              <div className="border-t pt-3 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold text-stone-500">
                  <span>Coût total des achats</span><span>{fmt$(selectedSale?.totalCost || 0)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-black text-emerald-700">
                  <span>Marge brute</span><span>{fmt$(selectedSale?.totalMargin || 0)} ({selectedSale?.totalAmount ? ((selectedSale.totalMargin / selectedSale.totalAmount) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="flex justify-between text-sm font-black text-stone-900 pt-1 border-t">
                  <span>Total Facturé</span><span>{fmt$(selectedSale?.totalAmount || 0)}</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
