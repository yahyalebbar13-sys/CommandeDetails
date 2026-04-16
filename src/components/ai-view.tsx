"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Brain, ChevronDown, Loader2, BarChart3, TrendingUp,
  AlertTriangle, Users, ShoppingCart, Package, Zap, Target,
  RefreshCcw, ArrowUpRight, CheckCircle2, Info, DollarSign,
  Calendar, Shield, Globe, Factory, Star, ChevronRight
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, AreaChart, Area, CartesianGrid, LineChart, Line
} from 'recharts';
import { generateCategoryMarketStudy, CategoryMarketStudyOutput } from '@/ai/flows/category-market-study-flow';

interface AIViewProps {
  articles: any[];
  generalCategories: any[];
  subCategories: any[];
}

const CHART_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#8B5CF6', '#F43F5E', '#EC4899', '#F59E0B'];
const RISK_COLORS = { 'Faible': '#10B981', 'Modéré': '#F59E0B', 'Élevé': '#F43F5E' };

const SectionHeader = ({ icon: Icon, title, subtitle, color = 'amber' }: { icon: any, title: string, subtitle?: string, color?: string }) => {
  const colors: Record<string, string> = {
    amber: 'text-amber-500 bg-amber-50',
    blue: 'text-blue-500 bg-blue-50',
    green: 'text-emerald-500 bg-emerald-50',
    purple: 'text-purple-500 bg-purple-50',
    red: 'text-red-500 bg-red-50',
    indigo: 'text-indigo-500 bg-indigo-50',
  };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`p-2 rounded-xl ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.15em]">{title}</h3>
        {subtitle && <p className="text-[10px] text-stone-400 font-bold uppercase mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, sub, color = 'stone', icon: Icon }: any) => {
  const borders: Record<string, string> = {
    amber: 'border-l-amber-500',
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    purple: 'border-l-purple-500',
    red: 'border-l-red-500',
  };
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-stone-100 border-l-4 ${borders[color] || 'border-l-stone-400'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">{label}</p>
          <p className="text-xl font-black text-stone-900 leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-stone-500 font-bold mt-1">{sub}</p>}
        </div>
        {Icon && <Icon className="w-5 h-5 text-stone-300 flex-shrink-0 mt-0.5" />}
      </div>
    </div>
  );
};

export default function AIView({ articles, generalCategories, subCategories }: AIViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [study, setStudy] = useState<CategoryMarketStudyOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // All categories (general + sub) with article stats
  const allCategories = useMemo(() => {
    const cats: { id: string; name: string; group: string; articleCount: number; avgPrice: number; totalQty: number; unit: string }[] = [];

    generalCategories.forEach(gc => {
      const gcArticles = articles.filter(a => a.generalCategoryId === gc.id || a.categoryId === gc.name);
      const avgPrice = gcArticles.length > 0
        ? gcArticles.reduce((s, a) => s + (Number(a.purchasePricePerUnit) || 0), 0) / gcArticles.length
        : 0;
      const totalQty = gcArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      const unit = gcArticles[0]?.unitOfMeasure || 'pcs';
      cats.push({ id: `gc_${gc.id}`, name: gc.name, group: 'Groupe', articleCount: gcArticles.length, avgPrice, totalQty, unit });
    });

    subCategories.forEach(sc => {
      const scArticles = articles.filter(a => a.categoryId === sc.name);
      const avgPrice = scArticles.length > 0
        ? scArticles.reduce((s, a) => s + (Number(a.purchasePricePerUnit) || 0), 0) / scArticles.length
        : 0;
      const totalQty = scArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      const unit = scArticles[0]?.unitOfMeasure || 'pcs';
      const gc = generalCategories.find(g => g.id === sc.generalCategoryId);
      cats.push({ id: `sc_${sc.id}`, name: sc.name, group: gc?.name || 'Famille', articleCount: scArticles.length, avgPrice, totalQty, unit });
    });

    return cats.sort((a, b) => a.name.localeCompare(b.name));
  }, [articles, generalCategories, subCategories]);

  const selectedCategory = allCategories.find(c => c.id === selectedCategoryId);

  const handleGenerateStudy = async () => {
    if (!selectedCategory) return;
    setIsLoading(true);
    setError(null);
    setStudy(null);

    try {
      const suppliers = [...new Set(
        articles
          .filter(a => a.categoryId === selectedCategory.name || a.generalCategoryId === selectedCategoryId.replace('gc_', ''))
          .map(a => a.supplierId)
          .filter(Boolean)
      )];

      const result = await generateCategoryMarketStudy({
        categoryName: selectedCategory.name,
        avgPurchasePriceUsd: selectedCategory.avgPrice > 0 ? Math.round(selectedCategory.avgPrice * 100) / 100 : undefined,
        totalQuantityOrdered: selectedCategory.totalQty > 0 ? selectedCategory.totalQty : undefined,
        suppliersUsed: suppliers.length > 0 ? suppliers : undefined,
        unitOfMeasure: selectedCategory.unit,
      });
      setStudy(result);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la génération de l\'étude.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 fade-in">

      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-purple-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <Brain className="w-6 h-6 text-amber-400" />
            </div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">Intelligence Artificielle</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">
            Étude de Marché <span className="text-amber-400">IA</span>
          </h1>
          <p className="text-stone-400 font-bold text-sm max-w-xl">
            Sélectionnez une catégorie de produits pour générer une étude de marché complète adaptée au Maroc, propulsée par Gemini AI.
          </p>
        </div>
      </div>

      {/* ── Category Selector + Launch ── */}
      <Card className="border-none shadow-xl rounded-2xl">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 rounded-t-2xl">
          <h3 className="text-white font-black uppercase tracking-widest text-[11px] flex items-center gap-2">
            <Target className="w-4 h-4" /> Sélection de la Catégorie
          </h3>
        </div>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">

            {/* Dropdown */}
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                Catégorie de Produit *
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(p => !p)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 text-left text-sm font-bold transition-all
                    ${selectedCategoryId ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300'}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Package className="w-4 h-4 flex-shrink-0" />
                    {selectedCategory ? (
                      <span className="uppercase">{selectedCategory.name}
                        <span className="ml-2 text-[10px] text-stone-400 font-normal">({selectedCategory.articleCount} articles)</span>
                      </span>
                    ) : 'Sélectionner une catégorie…'}
                  </span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                    {allCategories.length === 0 ? (
                      <div className="p-6 text-center text-stone-400 text-xs font-bold">Aucune catégorie disponible</div>
                    ) : (
                      allCategories.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedCategoryId(c.id); setDropdownOpen(false); setStudy(null); setError(null); }}
                          className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-amber-50 hover:text-amber-700 transition-colors flex items-center justify-between gap-2 border-b border-stone-50 last:border-0
                            ${selectedCategoryId === c.id ? 'bg-amber-50 text-amber-700' : 'text-stone-700'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Package className="w-3 h-3 text-stone-300 flex-shrink-0" />
                            <span className="uppercase">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-[8px] font-black uppercase py-0">{c.group}</Badge>
                            <span className="text-[9px] text-stone-400">{c.articleCount} art.</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected category preview */}
            {selectedCategory && (
              <div className="grid grid-cols-3 gap-3 lg:w-80">
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[8px] font-black uppercase text-stone-400">P.A. Moyen</p>
                  <p className="text-sm font-black text-stone-900">{selectedCategory.avgPrice > 0 ? `${selectedCategory.avgPrice.toFixed(3)} $` : 'N/A'}</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[8px] font-black uppercase text-stone-400">Qté totale</p>
                  <p className="text-sm font-black text-stone-900">{selectedCategory.totalQty.toLocaleString()}</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[8px] font-black uppercase text-stone-400">Articles</p>
                  <p className="text-sm font-black text-stone-900">{selectedCategory.articleCount}</p>
                </div>
              </div>
            )}

            {/* Launch Button */}
            <Button
              onClick={handleGenerateStudy}
              disabled={!selectedCategoryId || isLoading}
              className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-8 h-12 rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-40 whitespace-nowrap"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Générer l'Étude</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading State ── */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Brain className="w-10 h-10 text-amber-500 animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
          </div>
          <div className="text-center">
            <p className="font-black text-stone-900 uppercase tracking-widest text-sm">Gemini AI analyse le marché marocain…</p>
            <p className="text-stone-400 font-bold text-xs mt-1">Cela peut prendre 15 à 30 secondes</p>
          </div>
        </div>
      )}

      {/* ── Error State ── */}
      {error && (
        <Card className="border-red-200 bg-red-50 rounded-2xl shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-black text-red-700 uppercase text-sm">Erreur de génération</p>
              <p className="text-red-600 text-xs font-bold mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════
          STUDY RESULTS
      ══════════════════════════════════════════════════════════ */}
      {study && !isLoading && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* ── Study Header ── */}
          <div className="bg-stone-900 rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-blue-500/10 pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row justify-between gap-6">
              <div>
                <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.3em] mb-2">Étude de Marché Maroc · {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{selectedCategory?.name}</h2>
                <p className="text-stone-400 text-sm font-bold mt-3 max-w-2xl leading-relaxed">{study.executiveSummary}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:w-72 flex-shrink-0">
                {study.recommendedSellingPriceMAD > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 col-span-2">
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Prix Vente Conseillé</p>
                    <p className="text-2xl font-black text-amber-400">{study.recommendedSellingPriceMAD.toLocaleString()} MAD</p>
                    <p className="text-[10px] text-stone-500 mt-1 font-bold">/{selectedCategory?.unit || 'u'}</p>
                  </div>
                )}
                {study.marketSizeEstimateMAD && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[8px] font-black text-stone-500 uppercase">Marché MAD</p>
                    <p className="text-sm font-black text-white">{(study.marketSizeEstimateMAD / 1_000_000).toFixed(1)}M</p>
                  </div>
                )}
                {study.growthTrendPercent !== undefined && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[8px] font-black text-stone-500 uppercase">Croissance</p>
                    <p className={`text-sm font-black ${study.growthTrendPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {study.growthTrendPercent >= 0 ? '+' : ''}{study.growthTrendPercent}%/an
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Key Insights ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {study.keyInsights.map((insight, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 flex gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center font-black text-xs flex-shrink-0">{i + 1}</div>
                <p className="text-sm font-bold text-stone-700 leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>

          {/* ── Row 1 : Specs + Usage + Components ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Technical Specs */}
            <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <SectionHeader icon={Zap} title="Caractéristiques Techniques" color="amber" />
                <ul className="space-y-2">
                  {study.technicalSpecs.map((spec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-stone-700 font-bold">{spec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Required Components */}
            <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <SectionHeader icon={Factory} title="Composants Nécessaires" color="blue" />
                <ul className="space-y-2">
                  {study.requiredComponents.map((comp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                      <span className="text-sm text-stone-700 font-bold">{comp}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Usages Maroc */}
            <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <SectionHeader icon={Globe} title="Usages au Maroc" color="green" />
                <ul className="space-y-2">
                  {study.moroccanUseCases.map((uc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-stone-700 font-bold">{uc}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* ── Row 2 : Pricing + Order ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Prix d'Achat Moyen"
              value={selectedCategory?.avgPrice ? `${selectedCategory.avgPrice.toFixed(3)} $` : 'N/A'}
              sub={study.avgPurchasePriceAnalysis.substring(0, 60) + '…'}
              color="amber"
              icon={DollarSign}
            />
            <StatCard
              label="Prix Vente Conseillé (MAD)"
              value={`${study.recommendedSellingPriceMAD.toLocaleString()} MAD`}
              sub={study.recommendedSellingPriceContext.substring(0, 60) + '…'}
              color="green"
              icon={TrendingUp}
            />
            <StatCard
              label="Quantité Minimale d'Import"
              value={`${study.minimumImportQuantity.toLocaleString()} ${study.minimumImportQuantityUnit}`}
              sub="Seuil de viabilité"
              color="blue"
              icon={Package}
            />
            <StatCard
              label="Quantité Idéale Recommandée"
              value={`${study.idealOrderQuantity.toLocaleString()} ${study.idealOrderQuantityUnit}`}
              sub={study.idealOrderQuantityRationale.substring(0, 50) + '…'}
              color="purple"
              icon={ShoppingCart}
            />
          </div>

          {/* ── Replenishment ── */}
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="p-4 bg-indigo-50 rounded-2xl flex-shrink-0">
                <Calendar className="w-8 h-8 text-indigo-500" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">Fréquence de Réapprovisionnement</p>
                <p className="text-3xl font-black text-stone-900">Tous les <span className="text-indigo-600">{study.replenishmentFrequencyDays} jours</span></p>
                <p className="text-sm font-bold text-stone-500 mt-2">{study.replenishmentFrequencyRationale}</p>
              </div>
              <div className="bg-indigo-50 rounded-2xl px-6 py-4 text-center flex-shrink-0">
                <p className="text-[9px] font-black uppercase text-indigo-400">Par an</p>
                <p className="text-2xl font-black text-indigo-700">{Math.round(365 / study.replenishmentFrequencyDays)} commandes</p>
              </div>
            </CardContent>
          </Card>

          {/* ── Row 3 : Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Seasonality */}
            <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
              <CardHeader className="p-6 pb-2 border-b border-stone-50">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-500" /> Saisonnalité de la Demande
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={study.seasonality}>
                    <defs>
                      <linearGradient id="seasonGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#CC8626" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#CC8626" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                    <Tooltip
                      formatter={(v: number) => [`${v}/100`, 'Indice demande']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="demandIndex" stroke="#CC8626" strokeWidth={2} fill="url(#seasonGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Client Segmentation Pie */}
            <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
              <CardHeader className="p-6 pb-2 border-b border-stone-50">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" /> Segmentation Clients Maroc
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={study.clientSegments}
                      dataKey="percentage"
                      nameKey="segment"
                      cx="40%"
                      cy="50%"
                      outerRadius={90}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {study.clientSegments.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>{value}</span>}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`]}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ── Segment Descriptions ── */}
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" /> Détail des Segments Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {study.clientSegments.map((seg, i) => (
                  <div key={i} className="rounded-xl border border-stone-100 p-4 bg-stone-50/50 flex gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-black text-stone-900 uppercase">{seg.segment}</p>
                        <Badge variant="outline" className="text-[8px] py-0 font-black">{seg.percentage}%</Badge>
                      </div>
                      <p className="text-[11px] text-stone-500 font-bold leading-relaxed">{seg.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Competitors ── */}
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 pb-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Concurrence Locale & Importée
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {study.competitors.map((comp, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${comp.type === 'Local' ? 'border-emerald-100 bg-emerald-50/50' : 'border-blue-100 bg-blue-50/50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs font-black text-stone-900 uppercase">{comp.name}</p>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${comp.type === 'Local' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {comp.type}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Target className="w-2.5 h-2.5 text-stone-400" />
                        <span className="text-[10px] text-stone-500 font-bold">Part: {comp.estimatedMarketShare}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-2.5 h-2.5 text-stone-400" />
                        <span className="text-[10px] text-stone-500 font-bold">{comp.pricePositioning}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Risks ── */}
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="p-6 pb-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" /> Analyse des Risques
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {study.risks.map((risk, i) => {
                  const color = RISK_COLORS[risk.level];
                  return (
                    <div key={i} className="rounded-xl border border-stone-100 p-5 bg-white flex gap-4">
                      <div className="flex-shrink-0">
                        <div
                          className="w-2.5 h-full min-h-[40px] rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-black text-stone-900 uppercase">{risk.type}</p>
                          <span
                            className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            {risk.level}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-600 font-bold leading-relaxed">{risk.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Risk Radar Chart */}
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={study.risks.map(r => ({
                    risk: r.type,
                    niveau: r.level === 'Élevé' ? 3 : r.level === 'Modéré' ? 2 : 1,
                  }))}>
                    <PolarGrid stroke="#f1f1f1" />
                    <PolarAngleAxis dataKey="risk" tick={{ fontSize: 9, fontWeight: 900, textAnchor: 'middle' }} />
                    <PolarRadiusAxis domain={[0, 3]} tick={false} axisLine={false} />
                    <Radar name="Niveau de risque" dataKey="niveau" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip
                      formatter={(v: number) => [v === 3 ? 'Élevé' : v === 2 ? 'Modéré' : 'Faible', 'Niveau']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ── Full Price Analysis ── */}
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-stone-800 to-stone-900 px-6 py-4">
              <h3 className="text-white font-black uppercase tracking-widest text-[11px] flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" /> Analyse Pricing Détaillée
              </h3>
            </div>
            <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2">Analyse du Prix d'Achat</p>
                <p className="text-sm font-bold text-stone-700 leading-relaxed">{study.avgPurchasePriceAnalysis}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2">Justification du Prix de Vente Conseillé</p>
                <p className="text-sm font-bold text-stone-700 leading-relaxed">{study.recommendedSellingPriceContext}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2">Quantité Idéale — Justification</p>
                <p className="text-sm font-bold text-stone-700 leading-relaxed">{study.idealOrderQuantityRationale}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2">Cadence de Réapprovisionnement</p>
                <p className="text-sm font-bold text-stone-700 leading-relaxed">{study.replenishmentFrequencyRationale}</p>
              </div>
            </CardContent>
          </Card>

          {/* ── Regenerate ── */}
          <div className="flex justify-center pb-4">
            <Button
              variant="outline"
              onClick={handleGenerateStudy}
              className="border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-xl px-6 h-10 font-black uppercase text-[10px] tracking-widest flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" /> Régénérer l'étude
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
