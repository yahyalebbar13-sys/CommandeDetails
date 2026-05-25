"use client";

import React, { useState, useMemo } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, BarChart3, ArrowRight, Eye, X, Calendar, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import type { Sale } from '@/lib/types';

interface StockSalesProps {
  sales: Sale[];
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString('fr-FR');

const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

export default function StockSales({ sales, onNavigate }: StockSalesProps) {
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // Mois disponibles
  const months = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(s2 => { if (s2.date) s.add(s2.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [sales]);

  // Ventes filtrées
  const filtered = useMemo(() => {
    if (filterMonth === 'all') return [...sales].sort((a, b) => b.date.localeCompare(a.date));
    return sales.filter(s => s.date?.startsWith(filterMonth)).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, filterMonth]);

  // KPIs globaux (filtrés)
  const totalCA     = filtered.reduce((s, v) => s + v.totalAmount, 0);
  const totalCost   = filtered.reduce((s, v) => s + v.totalCost, 0);
  const totalMargin = filtered.reduce((s, v) => s + v.totalMargin, 0);
  const marginRate  = totalCA > 0 ? (totalMargin / totalCA) * 100 : 0;
  const avgTicket   = filtered.length > 0 ? totalCA / filtered.length : 0;

  // CA par mois (tous temps pour le graphe)
  const caByMonth = useMemo(() => {
    const map: Record<string, { ca: number; cout: number; nb: number }> = {};
    sales.forEach(v => {
      const m = v.date?.substring(0, 7) || '';
      if (!map[m]) map[m] = { ca: 0, cout: 0, nb: 0 };
      map[m].ca   += v.totalAmount;
      map[m].cout += v.totalCost;
      map[m].nb   += 1;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, d]) => {
        const [y, m] = month.split('-');
        return { month: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`, ca: Math.round(d.ca), cout: Math.round(d.cout), marge: Math.round(d.ca - d.cout), nb: d.nb };
      });
  }, [sales]);

  // Top produits vendus
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; ca: number; margin: number }> = {};
    filtered.forEach(v => {
      v.items.forEach(item => {
        if (!map[item.articleId]) map[item.articleId] = { name: item.productName, qty: 0, ca: 0, margin: 0 };
        map[item.articleId].qty    += item.qty;
        map[item.articleId].ca     += item.totalPrice;
        map[item.articleId].margin += item.margin;
      });
    });
    return Object.values(map).sort((a, b) => b.ca - a.ca).slice(0, 8);
  }, [filtered]);

  const kpis = [
    { label: 'Chiffre d\'Affaires', value: fmt$(totalCA), icon: DollarSign, color: 'emerald', sub: `${fmtN(filtered.length)} vente${filtered.length > 1 ? 's' : ''}` },
    { label: 'Marge Brute', value: fmt$(totalMargin), icon: TrendingUp, color: totalMargin >= 0 ? 'emerald' : 'red', sub: `${marginRate.toFixed(1)}% du CA` },
    { label: 'Coût des Ventes', value: fmt$(totalCost), icon: BarChart3, color: 'stone', sub: 'Achat × qté vendue' },
    { label: 'Ticket Moyen', value: fmt$(avgTicket), icon: ShoppingBag, color: 'violet', sub: 'par transaction' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <header className="bg-gradient-to-br from-violet-900 to-violet-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-violet-300 uppercase tracking-[0.3em] mb-1">Analyse business</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Chiffre d'Affaires <span className="text-violet-300">& Ventes</span>
            </h1>
            <p className="text-violet-300/70 text-xs font-bold mt-2">{sales.length} vente{sales.length !== 1 ? 's' : ''} au total</p>
          </div>
          <div className="shrink-0">
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-10 w-44 rounded-xl bg-white/10 border-white/20 text-white font-bold text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute la période</SelectItem>
                <SelectItem value={currentMonth}>Ce mois</SelectItem>
                {months.filter(m => m !== currentMonth).map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
            <div className={`h-1.5 bg-${color}-500`} />
            <div className="p-5">
              <div className={`p-2.5 bg-${color}-50 rounded-xl w-fit mb-3`}>
                <Icon className={`w-5 h-5 text-${color}-600`} />
              </div>
              <p className="text-2xl font-black text-stone-900 leading-none">{value}</p>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
              <p className="text-[9px] font-bold text-stone-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Graphes ── */}
      {caByMonth.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* CA par mois */}
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

          {/* Marge par mois */}
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

      {/* ── Top Produits + Historique ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top produits */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-stone-100">
          <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Performances</p>
          <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter mb-4">Top Produits Vendus</h3>
          {topProducts.length === 0 ? (
            <p className="text-center text-stone-300 text-[10px] font-black uppercase py-8">Aucune vente enregistrée</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
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

        {/* Historique des ventes */}
        <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
          <div className="p-6 pb-3">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Historique</p>
            <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">Dernières Ventes</h3>
          </div>
          <div className="divide-y divide-stone-50 max-h-[380px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-stone-300 text-[10px] font-black uppercase py-12">Aucune vente</p>
            ) : filtered.slice(0, 20).map(sale => (
              <div key={sale.id} className="flex items-center gap-3 px-6 py-3 hover:bg-stone-50 cursor-pointer transition-colors group" onClick={() => setSelectedSale(sale)}>
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black text-stone-800">{sale.clientName || 'Vente directe'}</p>
                    <span className="text-[8px] font-bold text-stone-300">{sale.items.length} art.</span>
                  </div>
                  <p className="text-[9px] font-bold text-stone-400 flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" /> {sale.date}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-stone-900">{fmt$(sale.totalAmount)}</p>
                  <p className={`text-[8px] font-bold ${sale.totalMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {sale.totalMargin >= 0 ? '+' : ''}{fmt$(sale.totalMargin)}
                  </p>
                </div>
                <Eye className="w-3.5 h-3.5 text-stone-300 group-hover:text-violet-500 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modal détail vente ── */}
      <Dialog open={!!selectedSale} onOpenChange={open => !open && setSelectedSale(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-700 to-violet-600 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Détail de la vente</DialogTitle>
            <p className="text-[10px] font-bold text-violet-200 mt-1">{selectedSale?.date} · {selectedSale?.clientName || 'Vente directe'}</p>
          </div>
          <div className="p-6 space-y-4 bg-white max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              {selectedSale?.items.map((item, i) => (
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
            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-stone-500">
                <span>Coût total</span><span>{fmt$(selectedSale?.totalCost || 0)}</span>
              </div>
              <div className="flex justify-between text-[10px] font-black text-emerald-700">
                <span>Marge</span><span>{fmt$(selectedSale?.totalMargin || 0)} ({selectedSale?.totalAmount ? ((selectedSale.totalMargin / selectedSale.totalAmount) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div className="flex justify-between text-sm font-black text-stone-900 pt-1 border-t">
                <span>TOTAL</span><span>{fmt$(selectedSale?.totalAmount || 0)}</span>
              </div>
            </div>
            {selectedSale?.notes && (
              <div className="bg-stone-50 rounded-xl p-3">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Notes</p>
                <p className="text-[11px] text-stone-700 font-bold">{selectedSale.notes}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
