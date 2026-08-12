"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Package, Boxes, AlertTriangle, TrendingUp, Hash, Calendar, ArrowDownToLine, ArrowUpFromLine, DollarSign, Layers
} from 'lucide-react';
import { useUser, useFirebase } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import AuthView from '@/components/auth-view';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }
function fmtDec(n: number, d = 2) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Calcul FIFO ───────────────────────────────────────────────────────────────
interface FIFOBatch {
  date: string;
  factureId: string;
  qtyIn: number;
  consumed: number;
  remaining: number;
  costPerUnit: number;
  batchValue: number;
  status: 'ÉPUISÉ' | 'PARTIEL' | 'DISPONIBLE';
}

function computeFIFO(entriesIN: any[], entriesOUT: any[], defaultCost: number): FIFOBatch[] {
  const batches: FIFOBatch[] = [...entriesIN]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(e => ({
      date: e.date || '—',
      factureId: e.factureId || e.notes || '—',
      qtyIn: Number(e.quantity) || 0,
      consumed: 0,
      remaining: Number(e.quantity) || 0,
      costPerUnit: (e.purchasePriceMAD != null && e.purchasePriceMAD > 0) ? e.purchasePriceMAD : defaultCost,
      batchValue: 0,
      status: 'DISPONIBLE',
    }));

  const exits = [...entriesOUT].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  exits.forEach(exit => {
    let toConsume = Number(exit.quantity) || 0;
    for (const batch of batches) {
      if (toConsume <= 0 || batch.remaining <= 0) continue;
      const consume = Math.min(toConsume, batch.remaining);
      batch.consumed += consume;
      batch.remaining -= consume;
      toConsume -= consume;
    }
  });

  batches.forEach(b => {
    b.batchValue = Math.round(b.remaining * b.costPerUnit);
    b.status = b.remaining === 0 ? 'ÉPUISÉ' : b.consumed > 0 ? 'PARTIEL' : 'DISPONIBLE';
  });

  return batches;
}

export default function ProduitPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [article, setArticle] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Déterminer l'adminUid
  useEffect(() => {
    async function initUser() {
      if (!user || !firestore) return;
      try {
        const uDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (uDoc.exists()) {
          const data = uDoc.data();
          if (data.role === 'admin') setAdminUid(user.uid);
          else if (data.role === 'commercial' && data.adminUid) setAdminUid(data.adminUid);
          else {
            toast({ variant: 'destructive', title: 'Accès refusé', description: "Rôle non autorisé" });
            router.push('/');
          }
        } else {
          setAdminUid(user.uid);
        }
      } catch (err) {
        console.error(err);
        setAdminUid(user.uid);
      }
    }
    if (user && !isUserLoading) initUser();
  }, [user, isUserLoading, firestore, router, toast]);

  // 2. Charger les données du produit
  useEffect(() => {
    async function loadData() {
      if (!adminUid || !firestore) return;
      try {
        setLoading(true);
        const articleId = decodeURIComponent(params.id);
        
        // Gérer les IDs virtuels (avec variant)
        const realArticleId = articleId.split('__')[0];
        const artRef = doc(firestore, 'users', adminUid, 'articles', realArticleId);
        const artSnap = await getDoc(artRef);
        
        if (!artSnap.exists()) {
          toast({ variant: 'destructive', title: 'Erreur', description: "Article introuvable" });
          setLoading(false);
          return;
        }

        const baseArt = { id: artSnap.id, ...artSnap.data() } as any;

        // Charger variantes (même productName)
        const parts: string[] = [];
        if (baseArt.zipperType) parts.push(baseArt.zipperType);
        if (baseArt.slider) parts.push(baseArt.slider);
        const productName = parts.length > 0 ? parts.join(' ') : (baseArt.name || baseArt.specs || baseArt.categoryId || 'Produit');
        baseArt.productName = productName;

        setArticle(baseArt);

        // Fetch movements for this article
        const movQuery = query(collection(firestore, 'users', adminUid, 'stockMovements'), where('articleId', '==', realArticleId));
        const movSnap = await getDocs(movQuery);
        const movs = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMovements(movs);

      } catch (err) {
        console.error("Error loading product", err);
        toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les détails" });
      } finally {
        setLoading(false);
      }
    }
    
    if (adminUid) loadData();
  }, [adminUid, firestore, params.id, toast]);

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
        <Boxes className="w-10 h-10 animate-bounce text-emerald-500" />
      </div>
    );
  }
  if (!user) return <AuthView />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-emerald-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement du produit...</p>
        </div>
      </div>
    );
  }

  if (!article) return null;

  const cost = Number(article.purchasePriceMAD) || Number(article.purchasePricePerUnit) || 0;
  
  // S'il y a un variant spécifique, on filtre les mouvements
  let virtualVariant = '';
  const decodedId = decodeURIComponent(params.id);
  if (decodedId.includes('__color__')) virtualVariant = decodedId.split('__color__')[1];
  else if (decodedId.includes('__size__')) virtualVariant = decodedId.split('__size__')[1];

  let filteredMovs = movements;
  if (virtualVariant) {
    filteredMovs = movements.filter(m => (m.color === virtualVariant || m.size === virtualVariant));
  }

  const entriesIN = filteredMovs.filter(m => m.type === 'IN');
  const entriesOUT = filteredMovs.filter(m => m.type === 'OUT');
  const fifoBatches = computeFIFO(entriesIN, entriesOUT, cost);

  const mouvIN = entriesIN.reduce((s, m) => s + m.quantity, 0);
  const mouvOUT = entriesOUT.reduce((s, m) => s + m.quantity, 0);
  const mouvADJ = filteredMovs.filter(m => m.type === 'ADJUSTMENT').reduce((s, m) => s + m.quantity, 0);
  
  let initialQty = Number(article.quantity) || 0;
  if (virtualVariant) {
    const cb = article.colorBreakdown?.find((c:any) => c.colorCode === virtualVariant || c.description === virtualVariant);
    const sb = article.sizeBreakdown?.find((s:any) => s.size === virtualVariant);
    if (cb) initialQty = Number(cb.rolls || cb.quantity || 0);
    if (sb) initialQty = Number(sb.quantity || sb.rolls || 0);
  }

  const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);
  const totalIn = initialQty + mouvIN;
  const isAlert = article.minStockThreshold != null && currentQty <= article.minStockThreshold;
  const fifoValue = fifoBatches.reduce((s, b) => s + b.batchValue, 0);
  const pct = totalIn > 0 ? Math.min(100, Math.round((currentQty / totalIn) * 100)) : 100;
  
  let running = initialQty;
  const sortedMovs = [...filteredMovs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div className="min-h-screen bg-[#f8faf9] font-sans text-stone-900 pb-20">
      {/* ── HEADER NAVIGATION ── */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={() => router.back()} 
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-colors bg-stone-50 hover:bg-stone-100 px-3 py-2 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-stone-100 text-stone-600 rounded-full text-[9px] font-black uppercase tracking-widest">
              ID: {article.id}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* ── HERO PRODUIT ── */}
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 shadow-xl shadow-stone-200/50 border border-stone-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-lg">
                  {article.categoryId}
                </span>
                {virtualVariant && (
                  <span className="px-3 py-1 bg-violet-100 text-violet-800 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Variante: {virtualVariant}
                  </span>
                )}
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-stone-900 uppercase tracking-tighter leading-none mb-4">
                {article.productName}
              </h1>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                {article.unitOfMeasure && <span className="bg-stone-50 px-2 py-1 rounded-md border border-stone-100">Unité: {article.unitOfMeasure}</span>}
                {cost > 0 && <span className="bg-stone-50 px-2 py-1 rounded-md border border-stone-100">Coût Réf: {fmtDec(cost)} MAD</span>}
              </div>
            </div>

            {/* MAIN KPIs */}
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto shrink-0">
              <div className="bg-stone-900 text-white p-5 rounded-2xl flex flex-col justify-center min-w-[140px]">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">Stock Réel</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black leading-none">{fmt(currentQty)}</span>
                </div>
                {isAlert && (
                  <div className="mt-2 flex items-center gap-1 text-[9px] font-black text-rose-400 uppercase">
                    <AlertTriangle className="w-3 h-3" /> Seuil d'alerte atteint
                  </div>
                )}
              </div>
              <div className="bg-emerald-500 text-white p-5 rounded-2xl flex flex-col justify-center min-w-[140px] shadow-lg shadow-emerald-500/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200 mb-1">Valeur FIFO</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-black leading-none">{fmt(fifoValue)}</span>
                  <span className="text-xs font-bold text-emerald-200 pb-1">MAD</span>
                </div>
              </div>
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="mt-10 relative z-10">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Niveau de stock</span>
              <span className="text-[10px] font-black text-stone-900">{pct}% restant</span>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981'
                }}
              />
            </div>
          </div>
        </div>

        {/* ── STATS SECONDAIRES ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Entrées', value: `+${fmt(totalIn)}`, icon: ArrowDownToLine, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Total Sorties', value: mouvOUT > 0 ? `-${fmt(mouvOUT)}` : '0', icon: ArrowUpFromLine, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Seuil Minimum', value: article.minStockThreshold ? fmt(article.minStockThreshold) : 'N/A', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Coût Unitaire', value: cost > 0 ? `${fmtDec(cost)} MAD` : '—', icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map((stat, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-stone-100 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{stat.label}</p>
                <p className={`text-lg font-black ${stat.color} leading-none mt-1`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* ── LOTS FIFO ── */}
          <div className="bg-white rounded-[2rem] border border-stone-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                <Hash className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-sm font-black text-stone-900 uppercase tracking-widest">Lots FIFO</h2>
                <p className="text-[10px] font-bold text-stone-400">Évaluation des stocks par lot</p>
              </div>
            </div>
            
            <div className="p-4 flex-grow">
              {fifoBatches.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-10">
                  <Package className="w-12 h-12 text-stone-200 mb-4" />
                  <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest">Aucun lot en stock</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fifoBatches.map((b, i) => (
                    <div key={i} className={`p-4 rounded-2xl border ${b.status === 'ÉPUISÉ' ? 'border-stone-100 bg-stone-50/50 opacity-60' : 'border-violet-100 bg-violet-50/30'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {b.date}
                        </div>
                        <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${
                          b.status === 'ÉPUISÉ' ? 'bg-stone-200 text-stone-600' : 
                          b.status === 'PARTIEL' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {b.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[8px] font-black text-stone-400 uppercase">Reçu</p>
                          <p className="text-xs font-black text-stone-900">+{fmt(b.qtyIn)}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-stone-400 uppercase">Restant</p>
                          <p className="text-xs font-black text-violet-700">{fmt(b.remaining)}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-stone-400 uppercase">Valeur</p>
                          <p className="text-xs font-black text-stone-900">{fmt(b.batchValue)} MAD</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── HISTORIQUE DES MOUVEMENTS ── */}
          <div className="bg-white rounded-[2rem] border border-stone-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-stone-900 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black text-stone-900 uppercase tracking-widest">Historique</h2>
                <p className="text-[10px] font-bold text-stone-400">{sortedMovs.length} mouvements enregistrés</p>
              </div>
            </div>

            <div className="p-4 flex-grow max-h-[600px] overflow-y-auto">
              {sortedMovs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-10">
                  <TrendingUp className="w-12 h-12 text-stone-200 mb-4" />
                  <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest">Aucun mouvement</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-stone-100" />
                  <div className="space-y-6">
                    {sortedMovs.map((mv, i) => {
                      const isIN = mv.type === 'IN';
                      const isOUT = mv.type === 'OUT';
                      const qty = Number(mv.quantity) || 0;
                      if (isIN) running += qty;
                      if (isOUT) running -= qty;
                      
                      return (
                        <div key={i} className="relative flex items-start gap-4 pl-12 group">
                          <div className={`absolute left-3 top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                            isIN ? 'bg-emerald-500' : isOUT ? 'bg-rose-500' : 'bg-amber-500'
                          }`}>
                            {isIN ? <ArrowDownToLine className="w-2.5 h-2.5 text-white" /> : 
                             isOUT ? <ArrowUpFromLine className="w-2.5 h-2.5 text-white" /> : 
                             <AlertTriangle className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="bg-stone-50 group-hover:bg-stone-100 transition-colors p-4 rounded-2xl w-full">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">{mv.date || '—'}</span>
                              <span className={`text-[10px] font-black ${isIN ? 'text-emerald-600' : isOUT ? 'text-rose-600' : 'text-amber-600'}`}>
                                {isIN ? '+' : isOUT ? '-' : ''}{fmt(qty)}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-stone-700">{mv.reason || 'Mouvement standard'}</p>
                            {(mv.notes || mv.factureId) && (
                              <p className="text-[10px] text-stone-500 mt-1">{mv.notes || `Facture: ${mv.factureId}`}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
