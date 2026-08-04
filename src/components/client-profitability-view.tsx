"use client";

import React, { useMemo, useState } from 'react';
import { TrendingUp, DollarSign, Users, ChevronDown, Package, CheckCircle2 } from 'lucide-react';
const formatNumber = (num: number) => 
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

interface ClientProfitabilityViewProps {
  articles: any[];
}

export function ClientProfitabilityView({ articles }: ClientProfitabilityViewProps) {
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // Filter only confirmed articles and group by client
  const { clientStats, totals } = useMemo(() => {
    const confirmedArticles = articles.filter(a => a.devisConfirmed === true && a.clientName);
    
    const clientMap = new Map<string, {
      name: string;
      articles: any[];
      totalRevenue: number;
      totalCost: number;
    }>();

    let grandTotalRevenue = 0;
    let grandTotalCost = 0;

    confirmedArticles.forEach(a => {
      // Normalize client name for grouping
      const rawName = (a.clientName || 'Inconnu').trim();
      const normName = rawName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      const rev = Number(a.devisPrixVenteTotalMad) || 0;
      const cost = Number(a.devisCoutTotalMad) || 0;

      if (!clientMap.has(normName)) {
        clientMap.set(normName, {
          name: rawName,
          articles: [],
          totalRevenue: 0,
          totalCost: 0
        });
      }

      const clientData = clientMap.get(normName)!;
      // Prefer original capitalization if available, update if it was 'Inconnu'
      if (clientData.name === 'Inconnu' && rawName !== 'Inconnu') clientData.name = rawName;
      
      clientData.articles.push(a);
      clientData.totalRevenue += rev;
      clientData.totalCost += cost;

      grandTotalRevenue += rev;
      grandTotalCost += cost;
    });

    const stats = Array.from(clientMap.values()).map(c => {
      const profit = c.totalRevenue - c.totalCost;
      const margin = c.totalRevenue > 0 ? (profit / c.totalRevenue) * 100 : 0;
      return { ...c, profit, margin };
    }).sort((a, b) => b.profit - a.profit); // Sort by profit descending

    const grandTotalProfit = grandTotalRevenue - grandTotalCost;
    const grandTotalMargin = grandTotalRevenue > 0 ? (grandTotalProfit / grandTotalRevenue) * 100 : 0;

    return {
      clientStats: stats,
      totals: {
        revenue: grandTotalRevenue,
        cost: grandTotalCost,
        profit: grandTotalProfit,
        margin: grandTotalMargin
      }
    };
  }, [articles]);

  return (
    <div className="space-y-6 fade-in">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Rentabilité Clients
          </h1>
          <p className="text-stone-500 text-sm font-medium mt-1">
            Analyse de la rentabilité par client basée sur les commandes confirmées.
          </p>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-stone-600" />
            </div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chiffre d'Affaires Total</p>
          </div>
          <p className="text-3xl font-black text-stone-900">{formatNumber(totals.revenue)} <span className="text-base text-stone-400">MAD</span></p>
        </div>
        
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-red-500 transform rotate-180" />
            </div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Coût de Revient Total</p>
          </div>
          <p className="text-3xl font-black text-stone-900">{formatNumber(totals.cost)} <span className="text-base text-stone-400">MAD</span></p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500 rounded-full blur-3xl opacity-10 transform translate-x-1/2 -translate-y-1/2"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Bénéfice Net Total</p>
            </div>
            <p className="text-3xl font-black text-emerald-600">{formatNumber(totals.profit)} <span className="text-base text-emerald-600/60">MAD</span></p>
          </div>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-indigo-500 rounded-full blur-3xl opacity-20 transform translate-x-1/3 translate-y-1/3"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                <span className="text-white font-black text-xs">%</span>
              </div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Marge Globale</p>
            </div>
            <p className="text-3xl font-black text-white">{totals.margin.toFixed(2)}%</p>
          </div>
        </div>
      </div>

      {/* CLIENT LEADERBOARD */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/50">
          <Users className="w-4 h-4 text-stone-400" />
          <h2 className="text-xs font-black text-stone-900 uppercase tracking-widest">Classement des Clients</h2>
        </div>
        
        {clientStats.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-stone-100">
              <TrendingUp className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-900 font-bold text-lg mb-1">Aucune donnée de rentabilité</p>
            <p className="text-stone-500 text-sm">Confirmez des devis clients pour commencer à générer des statistiques de rentabilité.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {clientStats.map((client, index) => {
              const isExpanded = expandedClient === client.name;
              
              return (
                <div key={client.name} className="flex flex-col">
                  {/* CLIENT ROW */}
                  <button 
                    onClick={() => setExpandedClient(isExpanded ? null : client.name)}
                    className="w-full flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 hover:bg-stone-50 transition-colors gap-4 text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 border ${
                        index === 0 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        index === 1 ? 'bg-stone-200 text-stone-700 border-stone-300' :
                        index === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-100'
                      }`}>
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-stone-900 uppercase truncate">{client.name}</h3>
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                          <Package className="w-3 h-3" /> {client.articles.length} commande(s) confirmée(s)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 flex-1 w-full md:w-auto mt-2 md:mt-0 items-center justify-end">
                      <div className="md:text-right">
                        <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Revient</p>
                        <p className="text-sm font-bold text-stone-600">{formatNumber(client.totalCost)}</p>
                      </div>
                      <div className="md:text-right">
                        <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Vente</p>
                        <p className="text-sm font-black text-stone-900">{formatNumber(client.totalRevenue)}</p>
                      </div>
                      <div className="md:text-right">
                        <p className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-widest">Bénéfice</p>
                        <p className="text-sm font-black text-emerald-600">+{formatNumber(client.profit)}</p>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-3">
                        <div className="md:text-right">
                          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Marge</p>
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {client.margin.toFixed(1)}%
                          </span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </button>

                  {/* EXPANDED ARTICLES LIST */}
                  {isExpanded && (
                    <div className="bg-stone-50 border-t border-stone-100 p-4 md:p-6 pl-18">
                      <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">Détail des commandes confirmées</h4>
                      <div className="space-y-2">
                        {client.articles.sort((a, b) => (Number(b.devisPrixVenteTotalMad) || 0) - (Number(a.devisPrixVenteTotalMad) || 0)).map(article => {
                          const rev = Number(article.devisPrixVenteTotalMad) || 0;
                          const cost = Number(article.devisCoutTotalMad) || 0;
                          const prof = rev - cost;
                          const marg = rev > 0 ? (prof / rev) * 100 : 0;
                          
                          return (
                            <div key={article.id} className="bg-white border border-stone-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="mt-0.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-stone-900 truncate">
                                    {article.name || article.categoryId || 'Article sans nom'} 
                                    <span className="text-stone-400 font-medium ml-1">x{article.quantity} {article.unitOfMeasure}</span>
                                  </p>
                                  {article.devisConfirmedAt && (
                                    <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">
                                      Confirmé le {new Date(article.devisConfirmedAt).toLocaleDateString('fr-FR')}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs md:justify-end shrink-0 pl-7 md:pl-0">
                                <div>
                                  <span className="text-stone-400 font-medium mr-1">Revient:</span>
                                  <span className="font-bold text-stone-600">{formatNumber(cost)}</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 font-medium mr-1">Vente:</span>
                                  <span className="font-black text-stone-900">{formatNumber(rev)}</span>
                                </div>
                                <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-2">
                                  <span className="font-black">+{formatNumber(prof)} MAD</span>
                                  <span className="w-px h-3 bg-emerald-200" />
                                  <span className="font-bold">{marg.toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
