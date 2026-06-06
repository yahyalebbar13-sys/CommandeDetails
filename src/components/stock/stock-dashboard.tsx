"use client";

import React, { useMemo } from 'react';
import { TrendingUp, Boxes, ArrowLeftRight, Bell, DollarSign, ArrowRight, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { StockMovement, StockItem, Sale } from '@/lib/types';

type StockView = 'dashboard' | 'pos' | 'inventory' | 'sales' | 'movements' | 'alerts';

interface StockDashboardProps {
  stockItems: StockItem[];
  movements: StockMovement[];
  categories: any[];
  sales: Sale[];
  onNavigate: (v: StockView) => void;
}

const EMERALD_SHADES = ['#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#d1fae5'];

const fmt$ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtN = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export default function StockDashboard({ stockItems, movements, categories, sales, onNavigate }: StockDashboardProps) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const totalValue     = useMemo(() => stockItems.reduce((s, i) => s + i.totalValue, 0), [stockItems]);
  const totalRefs      = stockItems.length;
  const movementsMonth = useMemo(() => movements.filter(m => m.date?.startsWith(currentMonth)).length, [movements, currentMonth]);
  const alertCount     = useMemo(() => stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length, [stockItems]);

  // Stats ventes
  const caMonth   = useMemo(() => sales.filter(s => s.date?.startsWith(currentMonth)).reduce((t, s) => t + s.totalAmount, 0), [sales, currentMonth]);
  const caToday   = useMemo(() => sales.filter(s => s.date === todayStr).reduce((t, s) => t + s.totalAmount, 0), [sales, todayStr]);
  const nbSalesToday = useMemo(() => sales.filter(s => s.date === todayStr).length, [sales, todayStr]);
  const marginMonth  = useMemo(() => sales.filter(s => s.date?.startsWith(currentMonth)).reduce((t, s) => t + s.totalMargin, 0), [sales, currentMonth]);

  // Top 10 catégories par valeur
  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    stockItems.forEach(i => {
      const key = i.categoryId || 'Autre';
      map[key] = (map[key] || 0) + i.totalValue;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name: name.length > 18 ? name.substring(0, 18) + '…' : name, value: Math.round(value) }));
  }, [stockItems]);

  // Top 5 articles par valeur
  const top5 = useMemo(() =>
    [...stockItems].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5),
    [stockItems]
  );

  // Derniers 5 mouvements
  const lastMovements = useMemo(() =>
    [...movements].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5),
    [movements]
  );

  // Répartition IN/OUT ce mois
  const thisMonthMov = movements.filter(m => m.date?.startsWith(currentMonth));
  const pieData = [
    { name: 'Entrées', value: thisMonthMov.filter(m => m.type === 'IN').length },
    { name: 'Sorties', value: thisMonthMov.filter(m => m.type === 'OUT').length },
    { name: 'Ajust.', value: thisMonthMov.filter(m => m.type === 'ADJUSTMENT').length },
  ].filter(d => d.value > 0);
  const PIE_COLORS = ['#059669', '#ef4444', '#3b82f6'];

  const kpis = [
    {
      label: 'Valeur Totale Stock', value: fmt$(totalValue),
      icon: DollarSign, color: 'emerald',
      sub: `${totalRefs} référence${totalRefs > 1 ? 's' : ''}`,
      onClick: () => onNavigate('inventory'),
    },
    {
      label: "CA aujourd'hui", value: fmt$(caToday),
      icon: TrendingUp, color: 'violet',
      sub: `${nbSalesToday} vente${nbSalesToday > 1 ? 's' : ''} · ${today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`,
      onClick: () => onNavigate('sales'),
    },
    {
      label: 'CA ce mois', value: fmt$(caMonth),
      icon: ArrowLeftRight, color: 'blue',
      sub: `Marge : ${fmt$(marginMonth)}`,
      onClick: () => onNavigate('sales'),
    },
    {
      label: 'Alertes actives', value: fmtN(alertCount),
      icon: Bell, color: alertCount > 0 ? 'red' : 'emerald',
      sub: alertCount > 0 ? 'Stock bas ou rupture' : 'Tout est OK',
      urgent: alertCount > 0,
      onClick: () => onNavigate('alerts'),
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <header className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-emerald-600/10 rounded-full translate-y-1/2 blur-2xl" />
        <div className="relative z-10">
          <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Temps réel</p>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight">
            Tableau de Bord<br /><span className="text-emerald-400">Stock</span>
          </h1>
          <p className="text-emerald-300/70 text-xs font-bold mt-3">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </header>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, sub, urgent, onClick }) => (
          <Card key={label}
            onClick={onClick}
            className={`border-none shadow-xl rounded-2xl overflow-hidden transition-all ${
              onClick ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-0.5' : ''
            } ${urgent ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}
          >
            <div className={`h-1.5 bg-${color}-500`} />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 bg-${color}-50 rounded-xl`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                {urgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
              </div>
              <p className="text-2xl font-black text-stone-900 leading-none">{value}</p>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
              <p className="text-[9px] font-bold text-stone-400 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Graphes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar chart catégories */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Valeur par catégorie</p>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Top 10 Catégories</h3>
            </div>
          </div>
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catData} margin={{ top: 0, right: 0, left: 0, bottom: 40 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700, fill: '#78716c' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [fmt$(v), 'Valeur']} labelStyle={{ fontWeight: 700, fontSize: 11 }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {catData.map((_, i) => <Cell key={i} fill={EMERALD_SHADES[i % EMERALD_SHADES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px]">
              <p className="text-stone-300 font-black uppercase text-[10px]">Aucune donnée</p>
            </div>
          )}
        </div>

        {/* Pie mouvements du mois */}
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
            <div className="flex flex-col items-center justify-center h-[200px] space-y-2">
              <ArrowLeftRight className="w-8 h-8 text-stone-200" />
              <p className="text-stone-300 font-black uppercase text-[9px]">Aucun mouvement ce mois</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Top 5 + Derniers mouvements ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top 5 articles */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Valeur</p>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Top 5 Produits</h3>
            </div>
            <Button onClick={() => onNavigate('inventory')} variant="ghost" size="sm"
              className="text-[9px] font-black uppercase tracking-wider text-stone-400 hover:text-emerald-700 gap-1">
              Tout voir <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-2">
            {top5.length === 0 ? (
              <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucune donnée</p>
            ) : top5.map((item, i) => (
              <div key={item.articleId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-[9px] font-black text-emerald-700 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-stone-800 uppercase truncate">{item.productName}</p>
                  <p className="text-[8px] font-bold text-stone-400">{item.categoryId} · {fmtN(item.currentQty)} {item.unitOfMeasure}</p>
                </div>
                <span className="text-[10px] font-black text-emerald-700 shrink-0">{fmt$(item.totalValue)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Derniers mouvements */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Historique</p>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Derniers Mouvements</h3>
            </div>
            <Button onClick={() => onNavigate('movements')} variant="ghost" size="sm"
              className="text-[9px] font-black uppercase tracking-wider text-stone-400 hover:text-emerald-700 gap-1">
              Tout voir <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-2">
            {lastMovements.length === 0 ? (
              <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucun mouvement</p>
            ) : lastMovements.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  m.type === 'IN' ? 'bg-emerald-100' : m.type === 'OUT' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  <Package className={`w-3.5 h-3.5 ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-stone-800 uppercase truncate">{m.productName}</p>
                  <p className="text-[8px] font-bold text-stone-400">{m.date} · {m.reason}</p>
                </div>
                <span className={`text-[10px] font-black shrink-0 ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>
                  {m.type === 'IN' ? '+' : '-'}{fmtN(m.quantity)} {m.unitOfMeasure}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA rapides */}
      {alertCount > 0 && (
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
    </div>
  );
}

