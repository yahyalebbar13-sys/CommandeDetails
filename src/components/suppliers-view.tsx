"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Users, ChevronLeft, Package, Calendar, Clock, ClipboardList,
  Ship, FileText, ArrowRight, Factory, DollarSign, Plus, 
  Trash2, Landmark, CheckCircle2, History, Building2, Layers, Briefcase, Download, UserCircle2, KeyRound, Loader2, Info, AlertTriangle,
  Search, SortAsc, SortDesc, TrendingUp, ChevronRight, Calculator, MapPin, User,
  Mail, Settings, RefreshCw
} from 'lucide-react';
import CoutDeRevientModal from './cout-de-revient-modal';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp, setDoc, getDocs, query, where, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { exportSupplierPDF, exportCompanyPDF, exportShippingPDF, exportForwarderPDF, exportClientDossierPDF } from '@/lib/pdf-export';
import SupplierInfoModal from './supplier-info-modal';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';

interface SuppliersViewProps {
  articles: any[];
  factures: any[];
  payments: any[];
  categories?: any[];
  onNavigateToFacture: (factureId: string) => void;
}

const COMPANIES_LIST = ["New fournitures", "Lebtex", "Robe in box"];

type TabId = 'suppliers' | 'entities' | 'shipping' | 'forwarders' | 'clients';
type SortOrder = 'desc' | 'asc';

const TAB_CONFIG = [
  { id: 'suppliers' as TabId, label: 'Fournisseurs', icon: Factory, activeClasses: 'bg-amber-500 text-white shadow-lg shadow-amber-200', dotColor: 'bg-amber-500' },
  { id: 'entities' as TabId, label: 'Entités', icon: Building2, activeClasses: 'bg-blue-500 text-white shadow-lg shadow-blue-200', dotColor: 'bg-blue-500' },
  { id: 'shipping' as TabId, label: 'Maritime', icon: Ship, activeClasses: 'bg-emerald-500 text-white shadow-lg shadow-emerald-200', dotColor: 'bg-emerald-500' },
  { id: 'forwarders' as TabId, label: 'Transitaires', icon: Briefcase, activeClasses: 'bg-violet-500 text-white shadow-lg shadow-violet-200', dotColor: 'bg-violet-500' },
  { id: 'clients' as TabId, label: 'Clients', icon: UserCircle2, activeClasses: 'bg-indigo-500 text-white shadow-lg shadow-indigo-200', dotColor: 'bg-indigo-500' },
];



export default function SuppliersView({ articles, factures, payments, categories = [], onNavigateToFacture }: SuppliersViewProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [selectedForwarder, setSelectedForwarder] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('suppliers');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [cdrArticle, setCdrArticle] = useState<any>(null);

  // Debounce search: only filter after 200ms of inactivity
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchQuery('');
    setSortOrder('desc');
  };

  const supplierStats = useMemo(() => {
    const stats: Record<string, { val: number; orders: number; categories: Set<string> }> = {};
    articles.forEach(o => {
      const sup = o.supplierId || 'Inconnu';
      if (!stats[sup]) stats[sup] = { val: 0, orders: 0, categories: new Set() };
      stats[sup].val += (o.quantity * o.purchasePricePerUnit);
      stats[sup].orders += 1;
      stats[sup].categories.add(o.categoryId || 'Inconnu');
    });
    return Object.entries(stats).sort((a, b) => b[1].val - a[1].val);
  }, [articles]);

  const companyStats = useMemo(() => {
    return COMPANIES_LIST.map(name => {
      const companyFactures = factures.filter(f => f.declaringCompany === name);
      const companyArticles = articles.filter(a => companyFactures.some(f => f.id === a.factureId));
      
      let val = 0;
      companyFactures.forEach(f => {
        const fArticles = articles.filter(a => a.factureId === f.id);
        const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
        const freight = Number(f.freightCost) || Number(f.freight) || 0;
        val += (itemsVal + freight);
      });

      return {
        name,
        val,
        dossiers: companyFactures.length,
        articles: companyArticles.length
      };
    }).sort((a, b) => b.val - a.val);
  }, [articles, factures]);

  const shippingStats = useMemo(() => {
    const stats: Record<string, { val: number; dossiers: number; freight: number; cbm: number }> = {};
    factures.forEach(f => {
      const line = f.shippingLine || 'Inconnu';
      if (!stats[line]) stats[line] = { val: 0, dossiers: 0, freight: 0, cbm: 0 };
      
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const itemsCbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      
      stats[line].val += (itemsVal + freight);
      stats[line].freight += freight;
      stats[line].dossiers += 1;
      stats[line].cbm += itemsCbm;
    });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.freight - a.freight);
  }, [articles, factures]);

  const forwarderStats = useMemo(() => {
    const stats: Record<string, { dossiers: number; dossiersList: string[] }> = {};
    factures
      .filter(f => f.forwarder && f.forwarderGivenDate)
      .forEach(f => {
        const fw = f.forwarder;
        if (!stats[fw]) stats[fw] = { dossiers: 0, dossiersList: [] };
        stats[fw].dossiers += 1;
        stats[fw].dossiersList.push(f.id);
      });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.dossiers - a.dossiers);
  }, [factures]);

  const clientStats = useMemo(() => {
    const stats: Record<string, { orders: number; categories: Set<string> }> = {};
    articles
      .filter(a => a.isPreorder && a.clientName)
      .forEach(a => {
        const client = a.clientName.trim().toUpperCase();
        if (!stats[client]) stats[client] = { orders: 0, categories: new Set() };
        stats[client].orders += 1;
        stats[client].categories.add(a.categoryId || 'Inconnu');
      });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.orders - a.orders);
  }, [articles]);

  const totalSupplierValue = useMemo(() => supplierStats.reduce((s, [, d]) => s + d.val, 0), [supplierStats]);
  const totalFreight = useMemo(() => shippingStats.reduce((s, d) => s + d.freight, 0), [shippingStats]);
  const totalClientOrders = useMemo(() => clientStats.reduce((s, d) => s + d.orders, 0), [clientStats]);

  const tabCounts: Record<TabId, number> = {
    suppliers: supplierStats.length,
    entities: companyStats.length,
    shipping: shippingStats.length,
    forwarders: forwarderStats.length,
    clients: clientStats.length,
  };

  if (selectedClient) {
    return (
      <ClientDetailView
        clientName={selectedClient}
        articles={articles}
        factures={factures}
        categories={categories}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  if (selectedSupplier) {
    return (      <SupplierDetailView 
        supplierName={selectedSupplier} 
        articles={articles} 
        factures={factures}
        payments={payments}
        categories={categories}
        onBack={() => setSelectedSupplier(null)}
        onNavigateToFacture={onNavigateToFacture}
      />

    );
  }

  if (selectedCompany) {
    return (
      <CompanyDetailView 
        companyName={selectedCompany} 
        articles={articles} 
        factures={factures}
        onBack={() => setSelectedCompany(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  if (selectedShipping) {
    return (
      <ShippingDetailView 
        shippingName={selectedShipping} 
        articles={articles} 
        factures={factures}
        onBack={() => setSelectedShipping(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  if (selectedForwarder) {
    return (
      <ForwarderDetailView
        forwarderName={selectedForwarder}
        articles={articles}
        factures={factures}
        onBack={() => setSelectedForwarder(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  const activeConfig = TAB_CONFIG.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-8 fade-in">
      <header className="bg-stone-900 rounded-[2rem] shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-500/5 rounded-full translate-y-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10 p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Tableau de bord</p>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
              Analyse des<br />
              <span className="text-amber-500">Flux Partenaires</span>
            </h2>
            <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3">
              Performance financière & opérationnelle consolidée
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:w-auto w-full">
            <KpiBlock label="Fournisseurs" value={String(supplierStats.length)} sub="actifs" color="text-amber-500" />
            <KpiBlock
              label="Valeur totale"
              value={totalSupplierValue >= 1_000_000 ? `${(totalSupplierValue / 1_000_000).toFixed(1)}M` : `${Math.round(totalSupplierValue / 1000)}K`}
              sub="USD"
              color="text-white"
            />
            <KpiBlock
              label="Fret total"
              value={totalFreight >= 1_000_000 ? `${(totalFreight / 1_000_000).toFixed(1)}M` : `${Math.round(totalFreight / 1000)}K`}
              sub="USD"
              color="text-emerald-400"
            />
            <KpiBlock label="Précommandes" value={String(totalClientOrders)} sub="articles" color="text-indigo-400" />
          </div>
        </div>
      </header>

      {/* ── Tab Navigation ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = tabCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                  isActive
                    ? `${tab.activeClasses} shadow-lg`
                    : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search + Sort — masqué sur l'onglet Clients ─────────────────────── */}
      {activeTab !== 'clients' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
            <input
              type="text"
              placeholder={`Rechercher…`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-white border border-stone-200 rounded-xl text-[11px] font-bold text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-200 shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-2 h-11 px-5 bg-white border border-stone-200 rounded-xl text-[10px] font-black text-stone-500 hover:text-stone-900 hover:border-stone-300 transition-all shadow-sm uppercase tracking-wider shrink-0"
          >
            {sortOrder === 'desc'
              ? <><SortDesc className="w-4 h-4" /> Décroissant</>
              : <><SortAsc className="w-4 h-4" /> Croissant</>
            }
          </button>
        </div>
      )}

      {/* ── FOURNISSEURS ── */}
      {activeTab === 'suppliers' && (() => {
        const filtered = supplierStats
          .filter(([name]) => name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          .sort((a, b) => sortOrder === 'desc' ? b[1].val - a[1].val : a[1].val - b[1].val);
        const maxVal = filtered[0]?.[1].val || 1;
        if (filtered.length === 0) return <EmptyTab label="Aucun fournisseur enregistré" />;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(([name, stat], idx) => (
              <PartnerCard
                key={name} rank={idx + 1}
                title={name}
                primaryValue={`${Number(stat.val).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`}
                primaryLabel="Valeur marchandise"
                icon={<Factory className="w-4 h-4" />}
                progressPct={Math.round((stat.val / maxVal) * 100)}
                progressColor="bg-amber-500"
                stats={[{ label: 'Articles', value: String(stat.orders) }, { label: 'Familles', value: String(stat.categories.size) }]}
                accentColor="amber"
                onClick={() => setSelectedSupplier(name)}
              />
            ))}
          </div>
        );
      })()}

      {/* ── ENTITÉS ── */}
      {activeTab === 'entities' && (() => {
        const filtered = companyStats
          .filter(s => s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          .sort((a, b) => sortOrder === 'desc' ? b.val - a.val : a.val - b.val);
        const maxVal = filtered[0]?.val || 1;
        if (filtered.length === 0) return <EmptyTab label="Aucune entité enregistrée" />;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((stat, idx) => (
              <PartnerCard
                key={stat.name} rank={idx + 1}
                title={stat.name}
                primaryValue={`${Number(stat.val).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`}
                primaryLabel="Valeur déclarée totale"
                icon={<Building2 className="w-4 h-4" />}
                progressPct={Math.round((stat.val / maxVal) * 100)}
                progressColor="bg-blue-500"
                stats={[{ label: 'Dossiers', value: String(stat.dossiers) }, { label: 'Articles', value: String(stat.articles) }]}
                accentColor="blue"
                onClick={() => setSelectedCompany(stat.name)}
              />
            ))}
          </div>
        );
      })()}

      {/* ── MARITIME ── */}
      {activeTab === 'shipping' && (() => {
        const filtered = shippingStats
          .filter(s => s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          .sort((a, b) => sortOrder === 'desc' ? b.freight - a.freight : a.freight - b.freight);
        const maxVal = filtered[0]?.freight || 1;
        if (filtered.length === 0) return <EmptyTab label="Aucune compagnie maritime" />;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((stat, idx) => (
              <PartnerCard
                key={stat.name} rank={idx + 1}
                title={stat.name}
                primaryValue={`${Number(stat.freight).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`}
                primaryLabel="Fret total payé"
                icon={<Ship className="w-4 h-4" />}
                progressPct={Math.round((stat.freight / maxVal) * 100)}
                progressColor="bg-emerald-500"
                stats={[{ label: 'Arrivages', value: String(stat.dossiers) }, { label: 'Volume', value: `${Number(stat.cbm).toFixed(1)} m³` }]}
                accentColor="emerald"
                onClick={() => setSelectedShipping(stat.name)}
              />
            ))}
          </div>
        );
      })()}

      {/* ── TRANSITAIRES ── */}
      {activeTab === 'forwarders' && (() => {
        const filtered = forwarderStats
          .filter(s => s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          .sort((a, b) => sortOrder === 'desc' ? b.dossiers - a.dossiers : a.dossiers - b.dossiers);
        const maxVal = filtered[0]?.dossiers || 1;
        if (filtered.length === 0) return <EmptyTab label="Aucun transitaire avec dossier remis" />;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((stat, idx) => (
              <PartnerCard
                key={stat.name} rank={idx + 1}
                title={stat.name}
                primaryValue={`${stat.dossiers} Dossiers`}
                primaryLabel="Total dossiers remis"
                icon={<Briefcase className="w-4 h-4" />}
                progressPct={Math.round((stat.dossiers / maxVal) * 100)}
                progressColor="bg-violet-500"
                stats={[{ label: 'Dossiers remis', value: String(stat.dossiers) }]}
                accentColor="violet"
                onClick={() => setSelectedForwarder(stat.name)}
              />
            ))}
          </div>
        );
      })()}

      {/* ── CLIENTS ── */}
      {activeTab === 'clients' && (() => {
        const filtered = clientStats
          .filter(s => s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          .sort((a, b) => sortOrder === 'desc' ? b.orders - a.orders : a.orders - b.orders);
        const maxVal = filtered[0]?.orders || 1;
        if (filtered.length === 0) return <EmptyTab label="Aucune précommande client enregistrée" />;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((stat, idx) => (
              <ClientCard
                key={stat.name}
                stat={stat}
                rank={idx + 1}
                pct={Math.round((stat.orders / maxVal) * 100)}
                onSelect={() => setSelectedClient(stat.name)}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ── KPI block ─────────────────────────────────────────────────────────────────
function KpiBlock({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center backdrop-blur-sm">
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <div className={`text-2xl font-black ${color} leading-none`}>{value}</div>
      <p className="text-[8px] text-stone-600 font-bold uppercase mt-1">{sub}</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
        <TrendingUp className="w-7 h-7 text-stone-300" />
      </div>
      <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">{label}</p>
    </div>
  );
}

// ── Accent palette ────────────────────────────────────────────────────────────
type AccentColor = 'amber' | 'blue' | 'emerald' | 'violet' | 'indigo';
const ACCENT: Record<AccentColor, { badge: string; hover: string; icon: string }> = {
  amber:   { badge: 'bg-amber-100 text-amber-700 border-amber-200',      hover: 'group-hover:text-amber-600',   icon: 'group-hover:text-amber-500 group-hover:bg-amber-50' },
  blue:    { badge: 'bg-blue-100 text-blue-700 border-blue-200',          hover: 'group-hover:text-blue-600',    icon: 'group-hover:text-blue-500 group-hover:bg-blue-50' },
  emerald: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', hover: 'group-hover:text-emerald-600', icon: 'group-hover:text-emerald-500 group-hover:bg-emerald-50' },
  violet:  { badge: 'bg-violet-100 text-violet-700 border-violet-200',    hover: 'group-hover:text-violet-600',  icon: 'group-hover:text-violet-500 group-hover:bg-violet-50' },
  indigo:  { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',    hover: 'group-hover:text-indigo-600',  icon: 'group-hover:text-indigo-500 group-hover:bg-indigo-50' },
};

// ── Generic partner card ──────────────────────────────────────────────────────
function PartnerCard({
  rank, title, primaryValue, primaryLabel, icon, progressPct, progressColor, stats, accentColor, onClick,
}: {
  rank: number; title: string; primaryValue: string; primaryLabel: string;
  icon: React.ReactNode; progressPct: number; progressColor: string;
  stats: { label: string; value: string }[]; accentColor: AccentColor; onClick: () => void;
}) {
  const a = ACCENT[accentColor];
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden active:scale-[0.98] border border-stone-100"
    >
      {/* Animated progress topper */}
      <div className="relative h-1.5 w-full bg-stone-100">
        <div className={`h-full ${progressColor} transition-all duration-700`} style={{ width: `${progressPct}%` }} />
      </div>

      <div className="p-5">
        {/* Rank + icon row */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex-1 min-w-0">
            {rank <= 3 ? (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border mb-1.5 ${a.badge}`}>
                {rank === 1 ? '🥇 N°1' : rank === 2 ? '🥈 N°2' : '🥉 N°3'}
              </span>
            ) : (
              <span className="text-[9px] font-black text-stone-300 uppercase tracking-widest block mb-1.5">#{rank}</span>
            )}
            <h4 className={`font-black text-stone-900 uppercase tracking-tight text-[13px] leading-tight truncate transition-colors ${a.hover}`}>
              {title}
            </h4>
          </div>
          <div className={`p-2 bg-stone-50 rounded-xl text-stone-300 transition-all shrink-0 ${a.icon}`}>
            {icon}
          </div>
        </div>

        {/* Primary value */}
        <div className="mb-4">
          <div className="text-xl font-black text-stone-900 leading-none mb-1">{primaryValue}</div>
          <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{primaryLabel}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Part relative</span>
            <span className="text-[9px] font-black text-stone-700">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
            <div className={`h-full ${progressColor} rounded-full transition-all duration-700`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Sub-stats */}
        <div className={`grid gap-3 pt-3 border-t border-stone-50 ${stats.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {stats.map(s => (
            <div key={s.label}>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">{s.label}</p>
              <p className="text-xs font-black text-stone-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* CTA arrow */}
        <div className={`mt-4 flex items-center justify-end text-[9px] font-black uppercase tracking-widest text-stone-300 ${a.hover} transition-colors`}>
          Voir détails <ChevronRight className="w-3 h-3 ml-0.5" />
        </div>
      </div>
    </div>
  );
}

function SupplierDetailView({ 
  supplierName, 
  articles, 
  factures, 
  payments,
  categories,
  onBack, 
  onNavigateToFacture 
}: { 
  supplierName: string, 
  articles: any[], 
  factures: any[], 
  payments: any[],
  categories: any[],
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSupplierInfoOpen, setIsSupplierInfoOpen] = useState(false);
  const [cdrArticle, setCdrArticle] = useState<any>(null);
  const [supplierProfile, setSupplierProfile] = useState<any>(null);

  // Load supplier profile from Firebase
  useEffect(() => {
    if (!firestore || !user || !supplierName) return;
    import('firebase/firestore').then(({ getDoc, doc: fbDoc }) => {
      getDoc(fbDoc(firestore, 'users', user.uid, 'supplierProfiles', supplierName))
        .then(snap => { if (snap.exists()) setSupplierProfile(snap.data()); })
        .catch(() => {});
    });
  }, [firestore, user, supplierName]);

  const supArticles = useMemo(() => articles.filter(o => o.supplierId === supplierName), [articles, supplierName]);
  const supPayments = useMemo(() => (payments || []).filter(p => p.supplierId === supplierName).sort((a, b) => b.date.localeCompare(a.date)), [payments, supplierName]);
  
  const now = new Date();
  
  const supplierFactures = useMemo(() => {
    const ids = Array.from(new Set(supArticles.map(a => a.factureId).filter(Boolean)));
    
    return ids.map(id => {
      const factInfo = factures.find(f => f.id === id);
      const fArticles = supArticles.filter(a => a.factureId === id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = Number(factInfo?.freightCost) || Number(factInfo?.freight) || 0;
      const declared = Number(factInfo?.declaredValue) || itemsVal + freight;
      
      return {
        id,
        arrivalDate: factInfo?.arrivalDate || fArticles[0]?.arrivalDate || '-',
        itemsVal,
        freight,
        cbm,
        declared,
        totalReal: itemsVal + freight,
        isArrived: factInfo?.arrivalDate ? new Date(factInfo.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [supArticles, factures]);
  const totalRealVal = supplierFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalDeclaredVal = supplierFactures.reduce((s, f) => s + f.declared, 0);
  const totalPaid = supPayments.reduce((s, p) => s + Number(p.amount), 0);
  const currentGap = totalRealVal - totalDeclaredVal;
  const remainingToPay = currentGap - totalPaid;

  const handleDeletePayment = (paymentId: string) => {
    if (!user || !firestore) return;
    if (window.confirm("Supprimer ce paiement ?")) {
      const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', paymentId);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Paiement supprimé" });
    }
  };

  const handleExportPDF = () => {
    exportSupplierPDF(supplierName, supplierFactures, {
      totalReal: totalRealVal,
      totalDeclared: totalDeclaredVal,
      gap: currentGap,
      remaining: remainingToPay,
      articles: supArticles.length,
    });
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsSupplierInfoOpen(true)}
            className="border-stone-200 text-stone-600 font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full gap-2 hover:border-amber-400 hover:text-amber-700"
          >
            <Factory className="w-3.5 h-3.5" /> Fiche Fournisseur
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-amber-100 gap-2"
          >
            <Download className="w-3.5 h-3.5" /> Exporter PDF
          </Button>
        </div>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Dossier Partenaire Consolidé</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{supplierProfile?.name || supplierName}</h2>
              {supplierProfile && (
                <div className="mt-2 space-y-0.5">
                  {(supplierProfile.address || supplierProfile.city || supplierProfile.country) && (
                    <p className="text-[10px] font-bold text-stone-400 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                      {[supplierProfile.address, supplierProfile.city, supplierProfile.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {supplierProfile.contactPerson && (
                    <p className="text-[10px] font-bold text-stone-400 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-blue-400 shrink-0" />
                      {supplierProfile.contactPerson}
                      {supplierProfile.phone && <span className="text-stone-500"> · {supplierProfile.phone}</span>}
                    </p>
                  )}
                  {supplierProfile.notes && (
                    <p className="text-[10px] font-bold text-amber-400/80 italic mt-1 max-w-sm line-clamp-2">
                      {supplierProfile.notes}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-4 mt-3">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supplierFactures.length} Dossiers
                </Badge>
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supArticles.length} Articles
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Valeur Réelle Totale" value={Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Valeur Déclarée Totale" value={Number(totalDeclaredVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-amber-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence Totale</p>
              <div className="text-xl font-black text-blue-400">{Number(currentGap).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
            <div className={`p-5 rounded-2xl text-white shadow-lg border ${remainingToPay <= 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'}`}>
              <p className="text-[8px] font-black opacity-70 uppercase tracking-widest mb-1">Reste à Régulariser</p>
              <div className="text-xl font-black">{Number(remainingToPay).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-stone-100 rounded-lg">
                <FileText className="w-4 h-4 text-stone-500" />
              </div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Historique des Factures & Arrivages</h3>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Volume CBM</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Réelle</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4 text-amber-600">Valeur Déclarée</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierFactures.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun dossier détecté</TableCell></TableRow>
                  ) : supplierFactures.map((f) => (
                    <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                      <TableCell className="py-3">
                        {f.isArrived ? 
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                        }
                      </TableCell>
                      <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                      <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                      <TableCell className="py-3 text-right font-bold text-stone-500 text-[10px]">{f.cbm.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                      <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                      <TableCell className="py-3 text-right font-black text-amber-600 text-[11px] bg-amber-50/30">{Number(f.declared).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                      <TableCell className="py-3">
                        <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* ── Articles par dossier avec bouton CdR ── */}
          {supplierFactures.map(f => {
            const fArticles = supArticles.filter((a: any) => a.factureId === f.id);
            if (fArticles.length === 0) return null;
            return (
              <section key={f.id} className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="p-1.5 bg-emerald-100 rounded-lg">
                    <Calculator className="w-3.5 h-3.5 text-emerald-700" />
                  </div>
                  <h4 className="text-[10px] font-black text-stone-700 uppercase tracking-widest">
                    Articles — {f.id}
                  </h4>
                  <span className="text-[8px] font-bold text-stone-400 uppercase">{fArticles.length} ligne(s)</span>
                </div>
                <Card className="border-stone-100 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <div className="divide-y divide-stone-50">
                    {fArticles.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-stone-900 text-[11px] uppercase truncate">{a.categoryId}</p>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            {a.size && a.size !== 'various' && <span className="text-[8px] font-bold text-stone-400 uppercase">{a.size}</span>}
                            {a.color && a.color !== 'various' && <span className="text-[8px] font-bold text-stone-400 uppercase">{a.color}</span>}
                            <span className="text-[8px] font-bold text-stone-400">{Number(a.quantity).toLocaleString()} {a.unitOfMeasure}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-black text-stone-900">${Number(a.purchasePricePerUnit).toFixed(2)}/u</p>
                          <p className="text-[8px] font-bold text-stone-400">${(a.quantity * a.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCdrArticle(a)}
                          className="shrink-0 h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-colors shadow-sm shadow-emerald-100"
                          title="Simuler le prix de revient TTC"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          CdR
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            );
          })}

          {/* Articles sans dossier (Besoin/PI) */}
          {(() => {
            const unlinked = supArticles.filter((a: any) => !a.factureId);
            if (unlinked.length === 0) return null;
            return (
              <section className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="p-1.5 bg-amber-100 rounded-lg">
                    <Calculator className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <h4 className="text-[10px] font-black text-stone-700 uppercase tracking-widest">Articles — Estimation (non liés à un dossier)</h4>
                </div>
                <Card className="border-amber-100 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <div className="divide-y divide-stone-50">
                    {unlinked.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-stone-900 text-[11px] uppercase truncate">{a.categoryId}</p>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            {a.size && a.size !== 'various' && <span className="text-[8px] font-bold text-stone-400 uppercase">{a.size}</span>}
                            <span className="text-[8px] font-bold text-stone-400">{Number(a.quantity).toLocaleString()} {a.unitOfMeasure}</span>
                            <span className="text-[8px] font-bold text-amber-500 uppercase">{a.status}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-black text-stone-900">${Number(a.purchasePricePerUnit).toFixed(2)}/u</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCdrArticle(a)}
                          className="shrink-0 h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-colors shadow-sm"
                          title="Simuler le prix de revient TTC (estimation)"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          Estimer
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            );
          })()}
        </div>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Landmark className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Règlements Différence</h3>
              </div>
              <Button 
                onClick={() => setIsPaymentModalOpen(true)}
                className="bg-stone-900 hover:bg-black text-white h-8 text-[9px] font-black uppercase px-3 rounded-lg shadow-lg shadow-stone-200"
              >
                <Plus className="w-3 h-3 mr-1.5" /> Transmettre
              </Button>
            </div>

            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-stone-50 py-3 border-b">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 flex items-center gap-2">
                  <History className="w-3 h-3" /> Historique des règlements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {supPayments.length === 0 ? (
                      <TableRow><TableCell className="text-center py-10 text-stone-300 font-bold uppercase text-[9px]">Aucun règlement enregistré</TableCell></TableRow>
                    ) : supPayments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-blue-50/20 transition-colors group border-stone-50">
                        <TableCell className="py-3 pl-4">
                          <div className="text-[10px] font-black text-stone-900">{p.date}</div>
                          <div className="text-[8px] font-bold text-stone-400 uppercase truncate max-w-[120px]">{p.notes || 'Règlement diff.'}</div>
                        </TableCell>
                        <TableCell className="py-3 text-right font-black text-blue-600">
                          {Number(p.amount).toLocaleString('en-US', { maximumFractionDigits: 3 })} $
                        </TableCell>
                        <TableCell className="py-3 pr-4 w-10">
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)} className="h-6 w-6 text-stone-200 hover:text-red-500 opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {supPayments.length > 0 && (
                <div className="p-4 bg-stone-50 border-t flex justify-between items-center">
                  <span className="text-[9px] font-black text-stone-400 uppercase">Total Transmis</span>
                  <span className="text-xs font-black text-blue-700">{Number(totalPaid).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</span>
                </div>
              )}
            </Card>
          </section>

          {/* Fiche Fournisseur — Description */}
          {supplierProfile && (
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-stone-900 px-5 py-3 flex items-center gap-2">
                <Factory className="w-4 h-4 text-amber-400" />
                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Fiche Fournisseur</h4>
              </div>
              <div className="p-5 space-y-3">
                {supplierProfile.name && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Nom Officiel</p>
                    <p className="text-[11px] font-black text-stone-900 uppercase">{supplierProfile.name}</p>
                  </div>
                )}
                {(supplierProfile.address || supplierProfile.city || supplierProfile.country) && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> Adresse</p>
                    <p className="text-[10px] font-bold text-stone-700">
                      {[supplierProfile.address, supplierProfile.city, supplierProfile.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                {supplierProfile.contactPerson && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5 flex items-center gap-1"><User className="w-2.5 h-2.5" /> Contact</p>
                    <p className="text-[10px] font-bold text-stone-700">{supplierProfile.contactPerson}</p>
                    {supplierProfile.phone && <p className="text-[9px] font-bold text-blue-600">{supplierProfile.phone}</p>}
                    {supplierProfile.email && <p className="text-[9px] font-bold text-blue-500">{supplierProfile.email}</p>}
                  </div>
                )}
                {supplierProfile.bankName && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Banque</p>
                    <p className="text-[10px] font-bold text-stone-700">{supplierProfile.bankName}</p>
                    {supplierProfile.bankAccount && <p className="text-[9px] font-bold text-stone-500">{supplierProfile.bankAccount}</p>}
                  </div>
                )}
                {supplierProfile.notes && (
                  <div className="pt-2 border-t border-stone-100">
                    <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Description / Notes</p>
                    <p className="text-[10px] font-bold text-stone-700 leading-relaxed italic">{supplierProfile.notes}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsSupplierInfoOpen(true)}
                  className="w-full mt-1 h-8 text-[8px] font-black uppercase tracking-widest text-stone-400 hover:text-amber-600 border border-stone-100 hover:border-amber-200 rounded-xl transition-colors"
                >
                  Modifier la fiche
                </button>
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Landmark className="w-5 h-5 text-amber-600" />
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Note Comptable</h4>
            </div>
            <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">
              "Le 'Reste à Régulariser' représente la somme due au partenaire pour compenser l'écart entre la facturation réelle et les montants déclarés en douane, déduction faite de vos transmissions déjà saisies."
            </p>
          </div>
        </div>
      </div>

      <AddPaymentModal 
        open={isPaymentModalOpen} 
        onOpenChange={setIsPaymentModalOpen} 
        supplierId={supplierName} 
      />
      <CoutDeRevientModal
        open={!!cdrArticle}
        onOpenChange={v => { if (!v) setCdrArticle(null); }}
        article={cdrArticle}
        factures={factures}
        articles={articles}
        categories={categories}
      />
      <SupplierInfoModal
        open={isSupplierInfoOpen}
        onOpenChange={setIsSupplierInfoOpen}
        supplierId={supplierName}
        onSaved={(profile) => setSupplierProfile(profile)}
      />
    </div>
  );
}

function CompanyDetailView({ 
  companyName, 
  articles, 
  factures, 
  onBack, 
  onNavigateToFacture 
}: { 
  companyName: string, 
  articles: any[], 
  factures: any[], 
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const companyFactures = useMemo(() => {
    const now = new Date();
    return factures.filter(f => f.declaringCompany === companyName).map(f => {
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      return {
        ...f,
        totalReal: itemsVal + freight,
        isArrived: f.arrivalDate ? new Date(f.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [companyName, factures, articles]);

  const totalRealVal = companyFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalDeclaredVal = companyFactures.reduce((s, f) => s + (Number(f.declaredValue) || f.totalReal), 0);
  const currentGap = totalRealVal - totalDeclaredVal;

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportCompanyPDF(companyName, companyFactures, { totalReal: totalRealVal, totalDeclared: totalDeclaredVal, gap: currentGap })}
          className="bg-blue-500 hover:bg-blue-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-blue-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Audit Entité Juridique</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{companyName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {companyFactures.length} Dossiers Déclarés
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Valeur Réelle Cumulée" value={Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Valeur Douane Cumulée" value={Number(totalDeclaredVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-amber-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence à Régulariser</p>
              <div className="text-xl font-black text-blue-400">{Number(currentGap).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Layers className="w-4 h-4 text-stone-500" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Manifeste des Opérations de {companyName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Réelle</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-amber-600">Valeur Déclarée</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyFactures.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucune opération enregistrée pour cette société</TableCell></TableRow>
              ) : companyFactures.map((f) => (
                <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                  <TableCell className="py-3">
                    {f.isArrived ? 
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                      <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3 text-right font-black text-amber-600 text-[11px] bg-amber-50/30">{Number(Number(f.declaredValue) || f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function SummaryBlock({ label, value, sub, color }: { label: string, value: string, sub?: string, color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-center min-w-[140px] backdrop-blur-md">
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <div className={`text-xl font-black ${color} leading-none`}>
        {value} <span className="text-[10px] font-normal text-stone-500 ml-1">{sub}</span>
      </div>
    </div>
  );
}

function AddPaymentModal({ open, onOpenChange, supplierId }: { open: boolean, onOpenChange: (o: boolean) => void, supplierId: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.amount) return;

    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', id);
    
    setDocumentNonBlocking(docRef, {
      ...formData,
      id,
      supplierId,
      createdAt: serverTimestamp()
    }, { merge: true });

    toast({ title: "Règlement enregistré", description: `${formData.amount} $ pour ${supplierId}` });
    onOpenChange(false);
    setFormData({ amount: 0, date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 border-none overflow-hidden">
        <div className="bg-stone-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Transmettre Fonds</DialogTitle>
              <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Règlement différence {supplierId}</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant Transmis ($)</Label>
            <Input 
              type="number" 
              required 
              value={formData.amount}
              onChange={e => setFormData(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
              className="h-12 border-stone-200 font-black text-lg rounded-xl focus:ring-stone-900"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Date de Transmission</Label>
            <Input 
              type="date" 
              required 
              value={formData.date}
              onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Notes / Référence</Label>
            <Input 
              placeholder="Ex: Virement Western, Cash..." 
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
        </form>
        <DialogFooter className="p-6 bg-stone-50 gap-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 font-black uppercase text-[10px] tracking-widest flex-1">Annuler</Button>
          <Button onClick={handleSubmit} className="h-11 bg-stone-900 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200">
            Confirmer l'envoi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShippingDetailView({ 
  shippingName, 
  articles, 
  factures, 
  onBack, 
  onNavigateToFacture 
}: { 
  shippingName: string, 
  articles: any[], 
  factures: any[], 
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const shippingFactures = useMemo(() => {
    const now = new Date();
    return factures.filter(f => (f.shippingLine || 'Inconnu') === shippingName).map(f => {
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      return {
        ...f,
        totalReal: itemsVal + freight,
        freight,
        cbm,
        isArrived: f.arrivalDate ? new Date(f.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [shippingName, factures, articles]);

  const totalFreightVal = shippingFactures.reduce((s, f) => s + f.freight, 0);
  const totalRealVal = shippingFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalCbm = shippingFactures.reduce((s, f) => s + f.cbm, 0);

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportShippingPDF(shippingName, shippingFactures, { totalFreight: totalFreightVal, totalReal: totalRealVal, totalCbm })}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-emerald-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Ship className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Compagnie Maritime</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{shippingName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {shippingFactures.length} Arrivages
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Fret Total" value={Number(totalFreightVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Volume Total" value={Number(totalCbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="m³" color="text-emerald-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Transit</p>
              <div className="text-xl font-black text-stone-300">{Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Layers className="w-4 h-4 text-stone-500" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Historique des Lignes de {shippingName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Volume CBM</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-emerald-600">Fret Payé</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Marchandise</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shippingFactures.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucune opération pour cette ligne</TableCell></TableRow>
              ) : shippingFactures.map((f) => (
                <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                  <TableCell className="py-3">
                    {f.isArrived ? 
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                      <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-500 text-[11px]">{Number(f.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                  <TableCell className="py-3 text-right font-black text-emerald-600 text-[11px] bg-emerald-50/30">{Number(f.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal - f.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function ForwarderDetailView({
  forwarderName,
  articles,
  factures,
  onBack,
  onNavigateToFacture
}: {
  forwarderName: string;
  articles: any[];
  factures: any[];
  onBack: () => void;
  onNavigateToFacture: (id: string) => void;
}) {
  const now = new Date();

  const forwarderDossiers = useMemo(() => {
    return factures
      .filter(f => f.forwarder === forwarderName && f.forwarderGivenDate)
      .map(f => {
        const fArticles = articles.filter(a => a.factureId === f.id);
        const itemsVal = fArticles.reduce((s: number, a: any) => s + (a.quantity * a.purchasePricePerUnit), 0);
        const freight = Number(f.freightCost) || Number(f.freight) || 0;
        const cbm = fArticles.reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0);
        const isArrived = f.arrivalDate ? new Date(f.arrivalDate) <= now : false;
        const inStock = f.stockEntryDate ? true : false;
        return {
          ...f,
          totalReal: itemsVal + freight,
          freight,
          cbm,
          isArrived,
          inStock,
          articlesCount: fArticles.length,
        };
      })
      .sort((a: any, b: any) => {
        const dA = new Date(a.forwarderGivenDate || '').getTime();
        const dB = new Date(b.forwarderGivenDate || '').getTime();
        return dB - dA;
      });
  }, [forwarderName, factures, articles]);

  // Dossiers à remettre : forwarder assigné, pas encore remis, arrivée dans < 7 jours
  const dossiersARemettre = useMemo(() => {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    return factures
      .filter(f => f.forwarder === forwarderName && !f.forwarderGivenDate && f.arrivalDate)
      .filter(f => new Date(f.arrivalDate) <= oneWeekFromNow)
      .map(f => {
        const arrival = new Date(f.arrivalDate);
        const daysLeft = Math.ceil((arrival.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...f, daysLeft };
      })
      .sort((a: any, b: any) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
  }, [forwarderName, factures]);

  const totalDossiers = forwarderDossiers.length;
  const totalFactureTransitaire = forwarderDossiers.reduce((s: number, f: any) => s + (Number(f.supplierInvoiceAmount) || 0), 0);

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportForwarderPDF(forwarderName, forwarderDossiers, dossiersARemettre, totalFactureTransitaire)}
          className="bg-violet-500 hover:bg-violet-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-violet-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Briefcase className="w-8 h-8 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Transitaire Partenaire</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{forwarderName}</h2>
              <div className="flex gap-4 mt-4 flex-wrap">
                <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/20 px-3 py-1 text-[10px] font-bold uppercase">
                  {totalDossiers} Dossiers Remis
                </Badge>
                {dossiersARemettre.length > 0 && (
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/20 px-3 py-1 text-[10px] font-bold uppercase animate-pulse">
                    ⚠ {dossiersARemettre.length} À Remettre
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Dossiers Remis" value={String(totalDossiers)} sub="" color="text-white" />
            <SummaryBlock label="Total Fact. Transitaire" value={Number(totalFactureTransitaire).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} sub="MAD" color="text-violet-400" />
          </div>
        </div>
      </header>

      {/* Section dossiers urgents à remettre */}
      {dossiersARemettre.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <Calendar className="w-4 h-4 text-red-600" />
            </div>
            <h3 className="text-xs font-black text-red-700 uppercase tracking-widest">⚠ Dossiers À Remettre — Arrivée imminente (&lt; 7 jours)</h3>
          </div>
          <Card className="border-red-200 shadow-xl rounded-2xl overflow-hidden bg-white">
            <div className="h-1 w-full bg-red-500" />
            <Table>
              <TableHeader className="bg-red-50/60">
                <TableRow>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">N° Dossier</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">N° BL</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">Date Arrivée</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">Délai</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossiersARemettre.map((f: any) => (
                  <TableRow key={f.id} className="hover:bg-red-50/40 transition-colors group border-red-50">
                    <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 text-[10px]">{f.noBL || '-'}</TableCell>
                    <TableCell className="py-3 text-[10px] font-black text-red-600">{f.arrivalDate}</TableCell>
                    <TableCell className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${f.daysLeft <= 0 ? 'bg-red-600 text-white' : f.daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {f.daysLeft <= 0 ? 'Arrivé' : `J-${f.daysLeft}`}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                    <TableCell className="py-3">
                      <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-red-600 opacity-0 group-hover:opacity-100">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {/* Section dossiers remis */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Layers className="w-4 h-4 text-violet-600" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Dossiers confiés à {forwarderName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° BL</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Compagnie Maritime</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4 text-violet-600">Date Remise</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">CBM</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-violet-600">Fact. Transit.</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwarderDossiers.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun dossier remis à ce transitaire</TableCell></TableRow>
              ) : forwarderDossiers.map((f: any) => (
                <TableRow key={f.id} className="hover:bg-violet-50/30 transition-colors group border-stone-50">
                  <TableCell className="py-3">
                    {f.inStock
                      ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">En Stock</Badge>
                      : f.isArrived
                      ? <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[8px] font-black uppercase">Dédouanement</Badge>
                      : <Badge className="bg-violet-50 text-violet-700 border-violet-100 text-[8px] font-black uppercase">En Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 text-[10px]">{f.noBL || '-'}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 text-[10px] uppercase">{f.shippingLine || '-'}</TableCell>
                  <TableCell className="py-3 text-[10px] font-black text-violet-600">{f.forwarderGivenDate}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-500'}`}>{f.arrivalDate || '-'}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                  <TableCell className="py-3 text-right font-bold text-stone-500 text-[10px]">{Number(f.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                  <TableCell className="py-3 text-right font-black text-violet-700 text-[11px] bg-violet-50/30">
                    {f.supplierInvoiceAmount ? `${Number(f.supplierInvoiceAmount).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD` : '-'}
                  </TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {forwarderDossiers.length > 0 && (
            <div className="p-4 bg-violet-50 border-t border-violet-100 flex justify-between items-center">
              <span className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Total Factures Transitaire</span>
              <span className="text-sm font-black text-violet-700">{Number(totalFactureTransitaire).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD</span>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function ClientCard({ stat, rank, pct, onSelect }: { stat: { name: string; orders: number; categories: Set<string> }; rank: number; pct: number; onSelect: () => void }) {
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const { user } = useUser();
  const canCreateAccount = user?.email === 'yahya.lebbar13@gmail.com';

  return (
    <>
      <div
        className="group cursor-pointer bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden active:scale-[0.98] border border-stone-100"
        onClick={onSelect}
      >
        {/* Indigo progress topper */}
        <div className="relative h-1.5 w-full bg-stone-100">
          <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>

        <div className="p-5">
          {/* Rank + icon */}
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex-1 min-w-0">
              {rank <= 3 ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border mb-1.5 bg-indigo-100 text-indigo-700 border-indigo-200">
                  {rank === 1 ? '🥇 N°1' : rank === 2 ? '🥈 N°2' : '🥉 N°3'}
                </span>
              ) : (
                <span className="text-[9px] font-black text-stone-300 uppercase tracking-widest block mb-1.5">#{rank}</span>
              )}
              <h4 className="font-black text-stone-900 uppercase tracking-tight text-[13px] leading-tight truncate transition-colors group-hover:text-indigo-600">
                {stat.name}
              </h4>
            </div>
            <div className="p-2 bg-stone-50 rounded-xl text-stone-300 transition-all shrink-0 group-hover:text-indigo-500 group-hover:bg-indigo-50">
              <UserCircle2 className="w-4 h-4" />
            </div>
          </div>

          {/* Primary value */}
          <div className="mb-4">
            <div className="text-xl font-black text-stone-900 leading-none mb-1">{stat.orders} Articles</div>
            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Total précommandes</p>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Part relative</span>
              <span className="text-[9px] font-black text-stone-700">{pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Sub-stats */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-stone-50">
            <div>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Articles</p>
              <p className="text-xs font-black text-stone-900">{stat.orders}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Familles</p>
              <p className="text-xs font-black text-indigo-600">{stat.categories.size}</p>
            </div>
          </div>

          {/* Access button (admin only) + CTA */}
          <div className="mt-4 flex items-center justify-between">
            {canCreateAccount ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-indigo-500 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsAccessModalOpen(true); }}
                >
                  <KeyRound className="w-3 h-3" />
                  Créer accès
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-stone-500 border border-stone-200 rounded-lg px-2.5 py-1.5 hover:bg-stone-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsManageModalOpen(true); }}
                >
                  <Settings className="w-3 h-3" />
                  Gérer
                </button>
              </div>
            ) : <div />}
            <div className="flex items-center text-[9px] font-black uppercase tracking-widest text-stone-300 group-hover:text-indigo-600 transition-colors">
              Voir détails <ChevronRight className="w-3 h-3 ml-0.5" />
            </div>
          </div>
        </div>
      </div>
      <CreateClientAccessModal
        open={isAccessModalOpen}
        onOpenChange={setIsAccessModalOpen}
        clientName={stat.name}
      />
      <ManageClientAccessModal
        open={isManageModalOpen}
        onOpenChange={setIsManageModalOpen}
        clientName={stat.name}
      />
    </>
  );
}

function CreateClientAccessModal({ open, onOpenChange, clientName }: { open: boolean; onOpenChange: (o: boolean) => void; clientName: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !email || !password) return;

    if (user.email !== 'yahya.lebbar13@gmail.com') {
      toast({ variant: 'destructive', title: 'Accès refusé', description: "Seul l'administrateur principal peut créer des comptes clients." });
      return;
    }

    // Prevent using the admin's own email as a client account
    if (email.toLowerCase().trim() === user.email?.toLowerCase()) {
      toast({ variant: 'destructive', title: 'Email invalide', description: "Vous ne pouvez pas utiliser le compte administrateur comme compte client." });
      return;
    }

    if (password.length < 8) {
      toast({ variant: 'destructive', title: 'Mot de passe trop faible', description: 'Le mot de passe doit contenir au moins 8 caractères.' });
      return;
    }

    setLoading(true);
    try {
      // Use a secondary Firebase app to create/sign-in without logging out the admin
      const secondaryAppName = 'clientCreation_' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      let clientUser: any;

      try {
        // Try creating a new Firebase Auth user
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        clientUser = credential.user;
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          // User already exists → sign in to get their user object
          const credential = await signInWithEmailAndPassword(secondaryAuth, email, password);
          clientUser = credential.user;
        } else {
          throw createErr;
        }
      }

      // ⭐ KEY FIX: Store role in the Auth displayName — works without Firestore permissions
      // Format: CLIENT:{clientName}:{adminUid}
      // Sanitize clientName: strip colons to preserve the parsing format
      const safeClientName = clientName.replace(/:/g, '-');
      await updateProfile(clientUser, {
        displayName: `CLIENT:${safeClientName}:${user.uid}`,
      });

      const clientUid = clientUser.uid;
      await deleteApp(secondaryApp);

      // Also write to Firestore as supplementary data (used for loading articles/factures)
      await setDoc(doc(firestore, 'clientAccess', clientUid), {
        clientName,
        email,
        adminUid: user.uid,
        createdAt: serverTimestamp(),
      });

      toast({ title: '✅ Accès configuré', description: `Accès activé pour ${clientName} (${email})` });
      onOpenChange(false);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      let msg = 'Impossible de configurer cet accès.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Mot de passe incorrect pour cet email existant.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Adresse email invalide.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Mot de passe trop faible (min. 6 caractères).';
      } else if (err.message) {
        msg = err.message;
      }
      toast({ variant: 'destructive', title: 'Erreur', description: msg });
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 border-none overflow-hidden">
        <div className="bg-indigo-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <KeyRound className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Créer Accès Client</DialogTitle>
              <p className="text-indigo-300 text-[9px] font-bold uppercase tracking-widest mt-1">{clientName}</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[10px] text-indigo-700 font-bold">
            Le client se connecte sur <span className="font-black text-indigo-700">le même site</span> avec ces identifiants. Il verra automatiquement <span className="font-black">uniquement ses précommandes</span>.
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Email du Client</Label>
            <Input
              type="email"
              required
              placeholder="client@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-11 border-stone-200 font-bold rounded-xl"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Mot de Passe</Label>
            <Input
              type="password"
              required
              minLength={8}
              placeholder="Min. 8 caractères"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-11 border-stone-200 font-bold rounded-xl"
            />
          </div>
        </form>
        <DialogFooter className="p-6 bg-stone-50 gap-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 font-black uppercase text-[10px] tracking-widest flex-1" disabled={loading}>Annuler</Button>
          <Button onClick={handleCreate} className="h-11 bg-indigo-700 hover:bg-indigo-800 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-indigo-200 gap-2" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-3.5 h-3.5" /> Créer l'Accès</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage Client Access Modal ──────────────────────────────────────────────
function ManageClientAccessModal({ open, onOpenChange, clientName }: { open: boolean; onOpenChange: (o: boolean) => void; clientName: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [accessDoc, setAccessDoc] = useState<{ id: string; email: string; notificationEmail?: string } | null>(null);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  // Load clientAccess doc when modal opens
  useEffect(() => {
    if (!open || !user || !firestore) return;
    setAccessDoc(null);
    setNotFound(false);
    setSearching(true);
    setNotificationEmail('');
    setNewPassword('');
    setCurrentPassword('');

    (async () => {
      try {
        const q = query(
          collection(firestore, 'clientAccess'),
          where('adminUid', '==', user.uid),
          where('clientName', '==', clientName)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          setAccessDoc({ id: d.id, email: data.email, notificationEmail: data.notificationEmail || '' });
          setNotificationEmail(data.notificationEmail || '');
        } else {
          setNotFound(true);
        }
      } catch (err: any) {
        setNotFound(true);
        toast({ variant: 'destructive', title: 'Erreur Firestore', description: err.message });
      } finally {
        setSearching(false);
      }
    })();
  }, [open, user, firestore, clientName]);

  // Save notification email
  const handleSaveNotifEmail = async () => {
    if (!user || !firestore || !accessDoc) return;
    setLoading(true);
    try {
      await updateDoc(doc(firestore, 'clientAccess', accessDoc.id), { notificationEmail });
      setAccessDoc(prev => prev ? { ...prev, notificationEmail } : prev);
      toast({ title: '✅ Email de notification mis à jour', description: `Les notifications seront envoyées à ${notificationEmail || accessDoc.email}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Change client password via secondary Firebase app
  const handleChangePassword = async () => {
    if (!accessDoc || !newPassword || !currentPassword) return;
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: 'Mot de passe trop court', description: 'Minimum 8 caractères.' });
      return;
    }
    setLoading(true);
    try {
      const appName = 'clientUpdate_' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      // Sign in as the client to verify current password, then update
      const cred = await signInWithEmailAndPassword(secondaryAuth, accessDoc.email, currentPassword);
      await cred.user.updatePassword(newPassword);
      await deleteApp(secondaryApp);
      toast({ title: '✅ Mot de passe modifié', description: `Le mot de passe de ${clientName} a été mis à jour.` });
      setNewPassword('');
      setCurrentPassword('');
    } catch (err: any) {
      let msg = err.message || 'Erreur inconnue.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Mot de passe actuel incorrect.';
      if (err.code === 'auth/weak-password') msg = 'Nouveau mot de passe trop faible (min. 8 caractères).';
      toast({ variant: 'destructive', title: 'Erreur', description: msg });
    } finally {
      setLoading(false);
    }
  };

  // Send password reset email via Firebase Auth
  const handleSendResetEmail = async () => {
    if (!accessDoc) return;
    setResetting(true);
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, accessDoc.email);
      toast({ title: '📧 Email de réinitialisation envoyé', description: `Un lien a été envoyé à ${accessDoc.email}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0 border-none overflow-hidden">
        {/* Hidden focus trap — prevents browser from auto-focusing email input and triggering address bar search */}
        <div tabIndex={0} className="sr-only" aria-hidden />
        {/* Header */}
        <div className="bg-stone-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Settings className="w-5 h-5 text-stone-300" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Gérer l&apos;Accès</DialogTitle>
              <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-0.5">{clientName}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {searching ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-300 mb-3" />
              <p className="text-[11px] font-bold text-stone-400 uppercase">Chargement...</p>
            </div>
          ) : notFound ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mx-auto">
                <KeyRound className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-[12px] font-black text-stone-700 uppercase">Aucun accès portail</p>
              <p className="text-[10px] text-stone-400 font-medium leading-relaxed">
                Ce client n&apos;a pas encore de compte portail.<br />
                Utilisez le bouton <strong>🔑 Créer accès</strong> pour en créer un.
              </p>
            </div>
          ) : accessDoc ? (
            <>
              {/* Portal credentials section */}
              <div className="space-y-3">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3" /> Identifiants Portail Client
                </p>

                {/* Login email (read-only) */}
                <div className="space-y-1">
                  <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Email de connexion (portail)</Label>
                  <div className="h-10 bg-stone-50 border border-stone-200 rounded-xl px-3 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-700">{accessDoc.email}</span>
                    <span className="text-[8px] font-black text-stone-300 uppercase">Lecture seule</span>
                  </div>
                </div>

                {/* Change password */}
                <div className="bg-stone-50 rounded-xl border border-stone-200 p-3 space-y-2">
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Changer le mot de passe</p>
                  <Input
                    type="password"
                    placeholder="Mot de passe actuel du client"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="h-9 text-[11px] font-bold border-stone-200 rounded-lg"
                  />
                  <Input
                    type="password"
                    placeholder="Nouveau mot de passe (min. 8 car.)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="h-9 text-[11px] font-bold border-stone-200 rounded-lg"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={loading || !newPassword || !currentPassword}
                      className="flex-1 h-9 bg-stone-800 hover:bg-black text-white font-black text-[9px] uppercase tracking-widest rounded-lg gap-1.5"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                      Changer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendResetEmail}
                      disabled={resetting}
                      className="flex-1 h-9 font-black text-[9px] uppercase tracking-widest rounded-lg gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Reset par email
                    </Button>
                  </div>
                </div>
              </div>

              {/* Notification email section */}
              <div className="space-y-3">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> Email de Notification
                </p>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[10px] text-indigo-700 font-bold">
                  Cet email reçoit les notifications de changement de statut. S&apos;il est vide, l&apos;email de connexion est utilisé.
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder={`Par défaut : ${accessDoc.email}`}
                    value={notificationEmail}
                    onChange={e => setNotificationEmail(e.target.value)}
                    className="h-10 text-[11px] font-bold border-indigo-200 rounded-xl flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveNotifEmail}
                    disabled={loading}
                    className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl px-4 gap-1.5 shadow-md shadow-indigo-100"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    Sauver
                  </Button>
                </div>
                {accessDoc.notificationEmail && (
                  <p className="text-[9px] text-indigo-600 font-bold">
                    📧 Actuellement : {accessDoc.notificationEmail}
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="p-4 bg-stone-50 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full h-10 font-black uppercase text-[10px] tracking-widest">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── STATUS GROUP CONFIG ─────────────────────────────────────────────────────
const STATUS_GROUPS = [
  {
    key: 'STOCK',
    label: 'En Stock',
    description: 'Disponible à la livraison',
    icon: '✅',
    headerBg: 'linear-gradient(135deg, #065f46, #047857)',
    badgeBg: '#d1fae5', badgeText: '#065f46',
    borderColor: '#6ee7b7',
    dotColor: '#10b981',
  },
  {
    key: 'CUSTOMS',
    label: 'En Dédouanement',
    description: '7 à 15 jours ouvrés',
    icon: '🛃',
    headerBg: 'linear-gradient(135deg, #581c87, #7e22ce)',
    badgeBg: '#f3e8ff', badgeText: '#581c87',
    borderColor: '#d8b4fe',
    dotColor: '#a855f7',
  },
  {
    key: 'TRANSIT',
    label: 'En Transit',
    description: 'Acheminement maritime en cours',
    icon: '🚢',
    headerBg: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
    badgeBg: '#eff6ff', badgeText: '#1e3a8a',
    borderColor: '#93c5fd',
    dotColor: '#3b82f6',
  },
  {
    key: 'SHIPPED',
    label: 'Expédié',
    description: 'Départ usine effectué',
    icon: '✈️',
    headerBg: 'linear-gradient(135deg, #075985, #0284c7)',
    badgeBg: '#e0f2fe', badgeText: '#075985',
    borderColor: '#7dd3fc',
    dotColor: '#0ea5e9',
  },
  {
    key: 'PI',
    label: 'En Production',
    description: 'Fabrication en cours',
    icon: '🏭',
    headerBg: 'linear-gradient(135deg, #78350f, #b45309)',
    badgeBg: '#fff7ed', badgeText: '#78350f',
    borderColor: '#fcd34d',
    dotColor: '#f59e0b',
  },
  {
    key: 'TO_ORDER',
    label: 'À Commander',
    description: 'En attente de validation',
    icon: '📋',
    headerBg: 'linear-gradient(135deg, #292524, #44403c)',
    badgeBg: '#f5f5f4', badgeText: '#44403c',
    borderColor: '#d6d3d1',
    dotColor: '#a8a29e',
  },
  {
    key: 'DELIVERED',
    label: 'Livré',
    description: 'Commande clôturée',
    icon: '📦',
    headerBg: 'linear-gradient(135deg, #1f2937, #374151)',
    badgeBg: '#f3f4f6', badgeText: '#1f2937',
    borderColor: '#e5e7eb',
    dotColor: '#9ca3af',
  },
];

// ── GroupedArticleList ──────────────────────────────────────────────────────
function GroupedArticleList({
  articles,
  statusLabel,
  onSelect,
}: {
  articles: any[];
  statusLabel: (s: string) => { label: string; cls: string; dot: string; icon: string };
  onSelect: (id: string) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    STATUS_GROUPS.forEach(g => {
      if (g.key !== 'DELIVERED') s.add(g.key);
    });
    return s;
  });

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (articles.length === 0) {
    return (
      <div className="text-center py-20 text-stone-300 font-bold uppercase text-[10px] tracking-widest">
        Aucun article précommandé pour ce client
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {STATUS_GROUPS.map(group => {
        const groupArticles = articles.filter(a => a.status === group.key);
        if (groupArticles.length === 0) return null;
        const isOpen = openGroups.has(group.key);
        const now = new Date();

        return (
          <div key={group.key} className="rounded-2xl overflow-hidden shadow-sm border border-white/60">
            {/* Group header — collapsible */}
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between px-5 py-3.5 transition-opacity hover:opacity-90"
              style={{ background: group.headerBg }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">{group.icon}</span>
                <div className="text-left">
                  <p className="text-white font-black text-sm uppercase tracking-wider leading-tight">{group.label}</p>
                  <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5">{group.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Count badge */}
                <span className="font-black text-xs rounded-full px-3 py-1" style={{ background: group.badgeBg, color: group.badgeText }}>
                  {groupArticles.length} article{groupArticles.length !== 1 ? 's' : ''}
                </span>
                {/* Chevron */}
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  className="text-white/60 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>

            {/* Group body */}
            {isOpen && (
              <div className="bg-stone-50 border-t" style={{ borderColor: group.borderColor }}>
                <div className="p-3 space-y-2">
                  {groupArticles.map(a => {
                    const isArrived = a.arrivalDate ? new Date(a.arrivalDate) <= now : false;
                    return (
                      <div
                        key={a.id}
                        className="bg-white rounded-xl border border-stone-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
                        style={{ borderLeftWidth: 3, borderLeftColor: group.dotColor }}
                      >
                        {/* Desktop layout */}
                        <div className="hidden sm:flex items-center gap-4 px-4 py-3">
                          {/* Product thumbnail */}
                          {a.imageUrl ? (
                            <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-stone-100 bg-stone-50">
                              <img src={a.imageUrl} alt={a.categoryId} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="shrink-0 w-12 h-12 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center">
                              <Package className="w-5 h-5 text-stone-200" />
                            </div>
                          )}
                          {/* Article info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Type Produit</p>
                            <p className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">{a.categoryId || '—'}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {a.size && a.size !== 'various' && (
                                <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-full uppercase">{a.size}</span>
                              )}
                              {a.color && (
                                <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-full uppercase">{a.color}</span>
                              )}
                            </div>
                          </div>

                          {/* Qty */}
                          <div className="shrink-0 text-center px-4 border-l border-stone-100">
                            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Quantité</p>
                            <p className="text-lg font-black text-stone-900 leading-none">{Number(a.quantity).toLocaleString('en-US')}</p>
                            <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">{a.unitOfMeasure || ''}</p>
                          </div>

                          {/* Arrival date */}
                          <div className="shrink-0 text-center px-4 border-l border-stone-100">
                            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Arrivée Prévue</p>
                            {a.arrivalDate ? (
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black ${
                                isArrived ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                              }`}>
                                {isArrived ? '✅ ' : '📅 '}{a.arrivalDate}
                              </span>
                            ) : (
                              <span className="text-stone-300 text-[10px] font-bold">Non définie</span>
                            )}
                          </div>

                          {/* Action */}
                          <div className="shrink-0 pl-4 border-l border-stone-100">
                            <button
                              type="button"
                              onClick={() => onSelect(a.id)}
                              className="h-9 px-3 text-white font-black uppercase text-[9px] tracking-widest rounded-lg transition-all flex items-center gap-1.5"
                              style={{ background: group.headerBg }}
                            >
                              <Info className="w-3.5 h-3.5" />
                              Détails
                            </button>
                          </div>
                        </div>

                        {/* Mobile layout */}
                        <div className="sm:hidden p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Type Produit</p>
                              <p className="text-sm font-black text-stone-900 uppercase">{a.categoryId || '—'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Quantité</p>
                              <p className="text-sm font-black text-stone-900">{Number(a.quantity).toLocaleString('en-US')} <span className="text-[10px] text-stone-400">{a.unitOfMeasure}</span></p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-1 flex-wrap">
                              {a.size && a.size !== 'various' && <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-full uppercase">{a.size}</span>}
                              {a.color && <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-full uppercase">{a.color}</span>}
                            </div>
                            {a.arrivalDate && (
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${isArrived ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>
                                📅 {a.arrivalDate}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelect(a.id)}
                            className="w-full h-9 text-white font-black uppercase text-[9px] tracking-widest rounded-lg flex items-center justify-center gap-1.5"
                            style={{ background: group.headerBg }}
                          >
                            <Info className="w-3.5 h-3.5" /> Voir Détails
                          </button>
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
  );
}

export function ClientDetailView({
  clientName,
  articles,
  factures,
  categories = [],
  onBack,
  isPortal = false,
}: {
  clientName: string;
  articles: any[];
  factures: any[];
  categories?: any[];
  onBack?: () => void;
  isPortal?: boolean;
}) {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const { user } = useUser();
  const firestore = useFirestore();

  // Auto-sync: when admin views a client, embed customs data from categories into articles
  // This makes the data available to the client portal which can only read articles
  useEffect(() => {
    if (isPortal || !user || !firestore || categories.length === 0 || articles.length === 0) return;
    const nameLower = (clientName || '').trim().toLowerCase();
    const clientArts = articles.filter(a => {
      if (!a.isPreorder) return false;
      const aName = (a.clientName || '').trim().toLowerCase();
      return aName === nameLower || aName.includes(nameLower) || nameLower.includes(aName);
    });
    clientArts.forEach(a => {
      // Only sync if customs data is missing on the article
      if (a.hsCode !== undefined && a.importDutyRate !== undefined) return;
      const catName = (a.categoryId || '').trim().toLowerCase();
      const cat = categories.find(c => {
        const cName = (c.name || '').trim().toLowerCase();
        return cName === catName || c.id === a.categoryId;
      });
      if (!cat) return;
      // Has category customs data worth syncing?
      if (cat.hsCode == null && cat.importDutyRate == null && cat.tpiRate == null && cat.tvaRate == null) return;
      const docRef = doc(firestore, 'users', user.uid, 'articles', a.id);
      setDocumentNonBlocking(docRef, {
        hsCode: cat.hsCode || null,
        importDutyRate: cat.importDutyRate ?? null,
        tpiRate: cat.tpiRate ?? null,
        ticRate: cat.ticRate ?? null,
        tvaRate: cat.tvaRate ?? null,
      }, { merge: true });
    });
  }, [isPortal, user, firestore, clientName, articles, categories]);
  const clientArticles = useMemo(() => {
    const nameLower = (clientName || '').trim().toLowerCase();
    const todayStr = new Date().toISOString().split('T')[0];
    return articles
      .filter(a => {
        if (!a.isPreorder) return false;
        const aName = (a.clientName || '').trim().toLowerCase();
        return aName === nameLower || aName.includes(nameLower) || nameLower.includes(aName);
      })
      .map(a => {
        const facture = factures.find(f => f.id === a.factureId);
        let derivedStatus = a.status;
        const arrivalDate = facture?.arrivalDate || a.arrivalDate || null;

        if (a.status === 'DELIVERED') {
          derivedStatus = 'DELIVERED';
        } else if (facture) {
          const now = new Date();
          const isArrived = arrivalDate ? new Date(arrivalDate) <= now : false;
          // A facture indicates a real shipment dossier exists.
          // Only escalate beyond PI if the facture has real shipping data (noBL or shippingLine)
          // or if the facture is already in stock/customs phase.
          const hasShippingInfo = !!(facture.noBL || facture.shippingLine);
          if (facture.inStock || facture.stockEntryDate) {
            derivedStatus = 'STOCK';
          } else if (isArrived) {
            derivedStatus = 'CUSTOMS';
          } else if (hasShippingInfo) {
            // Real BL exists → it's genuinely in transit
            derivedStatus = 'TRANSIT';
          } else if (a.status === 'PI') {
            // Facture exists but no BL yet → still in production
            derivedStatus = 'PI';
          } else {
            derivedStatus = 'TRANSIT';
          }
        } else if (!a.factureId) {
          // No facture linked → use raw article status (PI, TO_ORDER, etc.)
          derivedStatus = a.status;
        }
        
        let orderDate = '-';
        if (facture?.orderDate) {
          orderDate = facture.orderDate;
        } else if (a.createdAt?.seconds) {
          orderDate = new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0];
        } else if (typeof a.createdAt === 'string') {
          orderDate = a.createdAt.split('T')[0];
        } else if (a.date) {
           orderDate = a.date;
        }

        return {
          ...a,
          status: derivedStatus,
          arrivalDate,
          orderDate,
          factureNoBL: facture?.noBL || null,
        };
      })
      .sort((a, b) => {
        const STATUS_WEIGHT: Record<string, number> = {
          'STOCK': 1,
          'CUSTOMS': 2,
          'TRANSIT': 3,
          'SHIPPED': 4,
          'PI': 5,
          'TO_ORDER': 6,
          'DELIVERED': 7,
        };
        const weightA = STATUS_WEIGHT[a.status] || 99;
        const weightB = STATUS_WEIGHT[b.status] || 99;
        
        if (weightA !== weightB) {
          return weightA - weightB;
        }

        const tA = a.arrivalDate ? new Date(a.arrivalDate).getTime() : Infinity;
        const tB = b.arrivalDate ? new Date(b.arrivalDate).getTime() : Infinity;
        return tA - tB;
      });
  }, [clientName, articles, factures]);

  const nextArrival = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const future = clientArticles
      .map(a => a.arrivalDate)
      .filter((d): d is string => !!d && d >= todayStr)
      .sort();
    return future.length > 0 ? future[0] : null;
  }, [clientArticles]);

  const selectedArticle = useMemo(() => clientArticles.find(a => a.id === selectedArticleId), [clientArticles, selectedArticleId]);
  const selectedCategory = useMemo(() => {
    if (!selectedArticle) return null;
    const searchName = (selectedArticle.categoryId || '').trim().toLowerCase();
    return categories.find(c => {
      const catName = (c.name || '').trim().toLowerCase();
      return catName === searchName || c.id === selectedArticle.categoryId;
    }) || null;
  }, [selectedArticle, categories]);

  const statusLabel = (status: string) => {
    if (status === 'TO_ORDER') return { label: 'À Commander', cls: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-400', icon: '📋' };
    if (status === 'PI') return { label: 'En Production', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400', icon: '🏭' };
    if (status === 'SHIPPED') return { label: 'Expédié', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-400', icon: '✈️' };
    if (status === 'TRANSIT') return { label: 'En Transit', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-400', icon: '🚢' };
    if (status === 'CUSTOMS') return { label: 'En Dédouanement', cls: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: '🛃' };
    if (status === 'STOCK') return { label: 'En Stock', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: '✅' };
    if (status === 'DELIVERED') return { label: 'Livré', cls: 'bg-stone-800 text-stone-200 border-stone-700', dot: 'bg-stone-600', icon: '📦' };
    return { label: status, cls: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-400', icon: '📦' };
  };

  // ── computed stats ──
  const inStockCount = clientArticles.filter(a => a.status === 'STOCK').length;
  const inTransitCount = clientArticles.filter(a => ['TRANSIT','SHIPPED','CUSTOMS'].includes(a.status)).length;
  const inProductionCount = clientArticles.filter(a => ['PI','TO_ORDER'].includes(a.status)).length;

  return (
    <div className="space-y-6 fade-in">
      {!isPortal && onBack && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
          >
            <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
          </Button>
          <Button
            size="sm"
            onClick={() => exportClientDossierPDF(clientName, clientArticles)}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-indigo-100 gap-2"
          >
            <Download className="w-3.5 h-3.5" /> Exporter PDF
          </Button>
        </div>
      )}

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total articles */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col justify-between" style={{ minHeight: 100 }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Total Articles</p>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.08)' }}>
              <Package className="w-4 h-4" style={{ color: '#0f172a' }} />
            </div>
          </div>
          <p className="text-3xl font-black text-stone-900 leading-none">{clientArticles.length}</p>
          <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-1">précommandes suivies</p>
        </div>
        {/* In stock */}
        <div className="bg-white rounded-2xl border border-emerald-100 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">En Stock</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <span className="text-base">✅</span>
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600 leading-none">{inStockCount}</p>
          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-1">article{inStockCount !== 1 ? 's' : ''} disponible{inStockCount !== 1 ? 's' : ''}</p>
        </div>
        {/* In transit */}
        <div className="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">En Route</p>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <span className="text-base">🚢</span>
            </div>
          </div>
          <p className="text-3xl font-black text-indigo-600 leading-none">{inTransitCount}</p>
          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-1">transit & douanes</p>
        </div>
        {/* Next arrival */}
        <div className="rounded-2xl p-5 shadow-sm flex flex-col justify-between" style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b)', minHeight: 100 }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>Prochaine Arrivée</p>
            <span className="text-base">📅</span>
          </div>
          <p className="font-black text-white leading-tight" style={{ fontSize: nextArrival ? '1rem' : '1.5rem' }}>{nextArrival ?? '—'}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'rgba(196,160,98,0.7)' }}>date estimée</p>
        </div>
      </div>

      {/* ── SECTION HEADER ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 rounded-full" style={{ background: '#c4a062' }} />
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-widest">Vos Commandes</h3>
          </div>
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest bg-white border border-stone-200 rounded-full px-3 py-1">{clientArticles.length} article{clientArticles.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── GROUPED BY STATUS ── */}
        <GroupedArticleList
          articles={clientArticles}
          statusLabel={statusLabel}
          onSelect={setSelectedArticleId}
        />
      </section>

      <Dialog open={!!selectedArticleId} onOpenChange={(o) => { if (!o) setSelectedArticleId(null); }}>
        <DialogContent className="max-w-md rounded-[2rem] p-0 border-transparent overflow-hidden shadow-2xl bg-stone-50">
          {selectedArticle && (() => {
            // Safely parse breakdown data which might be stored as Array or Object in Firestore
            const safeSizeBreakdown = Array.isArray(selectedArticle.sizeBreakdown) 
              ? selectedArticle.sizeBreakdown 
              : (selectedArticle.sizeBreakdown && typeof selectedArticle.sizeBreakdown === 'object') 
                ? Object.values(selectedArticle.sizeBreakdown) 
                : [];
                
            const safeColorBreakdown = Array.isArray(selectedArticle.colorBreakdown) 
              ? selectedArticle.colorBreakdown 
              : (selectedArticle.colorBreakdown && typeof selectedArticle.colorBreakdown === 'object') 
                ? Object.values(selectedArticle.colorBreakdown) 
                : [];

            return (
              <div className="flex flex-col relative w-full max-h-[85vh] overflow-y-auto custom-scrollbar">
                {/* Premium header */}
                <div className="relative overflow-hidden shrink-0" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
                  <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #c4a062, transparent)', transform: 'translate(30%, -30%)' }} />
                  <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #6366f1, transparent)', transform: 'translate(-30%, 30%)' }} />
                  
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setSelectedArticleId(null)}
                    className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>

                  <div className="relative z-10 p-7 pb-6">
                    {/* Status badge */}
                    {(() => { const s = statusLabel(selectedArticle.status); return (
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-lg">{s.icon}</span>
                        <span className={`${s.cls} text-[9px] font-black uppercase tracking-widest border px-2.5 py-1 rounded-full`}>{s.label}</span>
                      </div>
                    ); })()}
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-tight mb-1">{selectedArticle.categoryId}</h2>
                    <p className="font-black uppercase tracking-widest" style={{ color: '#c4a062', fontSize: '1.1rem' }}>
                      {Number(selectedArticle.quantity).toLocaleString('en-US')} <span className="text-sm" style={{ color: 'rgba(196,160,98,0.6)' }}>{selectedArticle.unitOfMeasure || 'U'}</span>
                    </p>
                  </div>
                  {/* Gold separator */}
                  <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #c4a062 0%, transparent 100%)' }} />
                </div>

                {/* Product image — shown below header if available */}
                {selectedArticle.imageUrl && (
                  <div className="w-full bg-white border-b border-stone-100 flex items-center justify-center" style={{ maxHeight: 220 }}>
                    <img
                      src={selectedArticle.imageUrl}
                      alt={selectedArticle.categoryId}
                      className="max-h-52 w-full object-contain"
                    />
                  </div>
                )}

                
                <div className="p-5 space-y-4 shrink-0" style={{ background: '#f8f9fa' }}>
                  {/* Spec grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'Code HS', value: selectedArticle.hsCode || selectedCategory?.hsCode || '—' },
                      { label: 'CBM', value: selectedArticle.cubicMeasurement != null ? `${selectedArticle.cubicMeasurement} m³` : '—' },
                      { label: 'Taille', value: selectedArticle.size || '—' },
                      { label: 'Couleur', value: selectedArticle.color || '—', upper: true },
                    ].map((spec, i) => (
                      <div key={i} className="bg-white rounded-xl border border-stone-100 shadow-sm p-3.5 flex flex-col items-center text-center">
                        <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">{spec.label}</span>
                        <span className={`text-sm font-black text-stone-900 ${spec.upper ? 'uppercase' : ''}`}>{spec.value}</span>
                      </div>
                    ))}
                    <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-3.5 col-span-2 flex flex-col items-center text-center">
                      <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <ClipboardList className="w-2.5 h-2.5" /> Spécifications Techniques
                      </span>
                      <span className="text-[11px] font-bold text-stone-600 leading-snug">
                        {selectedArticle.specs || (selectedArticle.zipperType ? `${selectedArticle.zipperType} ${selectedArticle.slider || ''}` : '—')}
                      </span>
                    </div>
                  </div>

                  {/* Tax rates */}
                  <div className="rounded-xl overflow-hidden border border-stone-200">
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#0f172a' }}>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>Taux Douaniers</span>
                      <span className="text-[8px] text-white/30 font-bold uppercase tracking-widest">Info tarifaire</span>
                    </div>
                    <div className="bg-white grid grid-cols-4 divide-x divide-stone-100">
                      {[
                        { label: 'D.I', value: (selectedArticle.importDutyRate ?? selectedCategory?.importDutyRate) },
                        { label: 'TPI', value: (selectedArticle.tpiRate ?? selectedCategory?.tpiRate) },
                        { label: 'TIC', value: (selectedArticle.ticRate ?? selectedCategory?.ticRate) },
                        { label: 'TVA', value: (selectedArticle.tvaRate ?? selectedCategory?.tvaRate) },
                      ].map((t, i) => (
                        <div key={i} className="flex flex-col items-center justify-center py-3 px-2">
                          <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">{t.label}</span>
                          <span className="text-sm font-black" style={{ color: t.value != null ? '#059669' : '#d1d5db' }}>
                            {t.value != null ? `${t.value}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedArticle.factureId && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Ref. Dossier</p>
                      <div className="flex items-center justify-between gap-2">
                        <div><p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">N Facture</p><p className="text-[12px] font-black text-stone-900 uppercase">{selectedArticle.factureId}</p></div>
                        {selectedArticle.factureNoBL && (<div className="text-right"><p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">N BL</p><p className="text-[12px] font-black text-indigo-700 uppercase">{selectedArticle.factureNoBL}</p></div>)}
                      </div>
                    </div>
                  )}

                  {/* Breakdowns */}
                  {safeSizeBreakdown.length > 0 && (
                    <div className="rounded-xl border border-stone-200 overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#0f172a' }}>
                        <span className="text-base">📐</span>
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>Détail Tailles</span>
                      </div>
                      <div className="bg-white divide-y divide-stone-50">
                        <div className="grid grid-cols-[1fr_80px] bg-stone-50">
                          <div className="py-2 px-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">Taille</div>
                          <div className="py-2 px-3 text-[8px] font-black text-stone-400 uppercase tracking-widest text-right">Qté</div>
                        </div>
                        {safeSizeBreakdown.map((row: any, i: number) => (
                          <div key={i} className="grid grid-cols-[1fr_80px] hover:bg-stone-50 transition-colors">
                            <div className="py-2.5 px-3 text-[11px] font-black text-stone-800 uppercase">{row.size}</div>
                            <div className="py-2.5 px-3 text-[11px] font-black text-stone-900 text-right">{Number(row.quantity).toLocaleString()}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_80px] bg-stone-900 text-white">
                          <div className="py-2 px-3 text-[8px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>TOTAL</div>
                          <div className="py-2 px-3 text-right text-[10px] font-black">{safeSizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {safeColorBreakdown.length > 0 && (
                    <div className="rounded-xl border border-stone-200 overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#0f172a' }}>
                        <span className="text-base">🎨</span>
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>Détail Couleurs</span>
                      </div>
                      <div className="bg-white divide-y divide-stone-50">
                        <div className="grid grid-cols-[1fr_80px] bg-stone-50">
                          <div className="py-2 px-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">Couleur</div>
                          <div className="py-2 px-3 text-[8px] font-black text-stone-400 uppercase tracking-widest text-right">Qté</div>
                        </div>
                        {safeColorBreakdown.map((row: any, i: number) => (
                          <div key={i} className="grid grid-cols-[1fr_80px] hover:bg-stone-50 transition-colors">
                            <div className="py-2.5 px-3 text-[11px] font-black text-stone-800 uppercase">{row.colorCode}</div>
                            <div className="py-2.5 px-3 text-[11px] font-black text-stone-900 text-right">{Number(row.rolls).toLocaleString()}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_80px] bg-stone-900 text-white">
                          <div className="py-2 px-3 text-[8px] font-black uppercase tracking-widest" style={{ color: '#c4a062' }}>TOTAL</div>
                          <div className="py-2 px-3 text-right text-[10px] font-black">{safeColorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dossier ref */}
                  {selectedArticle.factureId && (
                    <div className="bg-white rounded-xl border border-stone-200 p-4">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-2">Réf. Dossier</p>
                      <div className="flex items-center justify-between gap-2">
                        <div><p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">N Facture</p><p className="text-[12px] font-black text-stone-900 uppercase">{selectedArticle.factureId}</p></div>
                        {selectedArticle.factureNoBL && (<div className="text-right"><p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">N BL</p><p className="text-[12px] font-black uppercase" style={{ color: '#c4a062' }}>{selectedArticle.factureNoBL}</p></div>)}
                      </div>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-2 flex items-center justify-center gap-1"><Calendar className="w-3 h-3" /> Date Commande</p>
                      <p className="text-xs font-black text-stone-900">{selectedArticle.orderDate || '—'}</p>
                    </div>
                    <div className="rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b)' }}>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-2 flex items-center justify-center gap-1" style={{ color: 'rgba(196,160,98,0.7)' }}><Clock className="w-3 h-3" /> Date Arrivée</p>
                      <p className="text-xs font-black" style={{ color: '#c4a062' }}>{selectedArticle.arrivalDate || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}