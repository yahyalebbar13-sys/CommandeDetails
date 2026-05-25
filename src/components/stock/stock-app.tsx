"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, LogOut, LayoutDashboard, List, ArrowLeftRight, Bell, Boxes, ShoppingCart, TrendingUp } from 'lucide-react';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { StockMovement, StockItem, Sale } from '@/lib/types';
import StockDashboard from './stock-dashboard';
import StockInventory from './stock-inventory';
import StockMovements from './stock-movements';
import StockAlerts from './stock-alerts';
import StockPOS from './stock-pos';
import StockSales from './stock-sales';
import AuthView from '@/components/auth-view';
import { Button } from '@/components/ui/button';

type StockView = 'dashboard' | 'pos' | 'inventory' | 'sales' | 'movements' | 'alerts';

// ─── Calcul du stock courant ─────────────────────────────────────────────────
export function computeStockItems(
  articles: any[],
  movements: StockMovement[],
  categories: any[]
): StockItem[] {
  const stockArticles = articles.filter(a => a.stockEntryDate);

  return stockArticles.map(a => {
    const parts: string[] = [];
    if (a.zipperType) parts.push(a.zipperType);
    if (a.slider)     parts.push(a.slider);
    if (a.color)      parts.push(a.color.toUpperCase());
    if (a.size)       parts.push(a.size);
    const productName = parts.length > 0 ? parts.join(' - ') : (a.name || a.specs || 'Produit');

    const artMovements = movements.filter(m => m.articleId === a.id);
    const mouvIN  = artMovements.filter(m => m.type === 'IN').reduce((s, m) => s + m.quantity, 0);
    const mouvOUT = artMovements.filter(m => m.type === 'OUT').reduce((s, m) => s + m.quantity, 0);
    const mouvADJ = artMovements.filter(m => m.type === 'ADJUSTMENT').reduce((s, m) => s + m.quantity, 0);

    const initialQty = Number(a.quantity) || 0;
    const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);
    const price      = Number(a.purchasePricePerUnit) || 0;
    const sellPrice  = Number(a.sellingPrice) || undefined;

    const lastMovement = [...artMovements].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

    return {
      articleId: a.id,
      categoryId: a.categoryId,
      productName,
      color: a.color,
      size: a.size,
      unitOfMeasure: a.unitOfMeasure || 'unité',
      purchasePricePerUnit: price,
      sellingPrice: sellPrice,
      initialQty,
      mouvementsIn: mouvIN,
      mouvementsOut: mouvOUT,
      currentQty,
      totalValue: currentQty * price,
      totalSellingValue: sellPrice ? currentQty * sellPrice : undefined,
      minThreshold: a.minStockThreshold,
      lastMovementDate: lastMovement?.date ?? a.stockEntryDate,
      stockEntryDate: a.stockEntryDate,
    };
  });
}

// ─── Ajout mouvement ──────────────────────────────────────────────────────────
export async function addStockMovement(
  firestore: any,
  uid: string,
  movement: Omit<StockMovement, 'id' | 'createdAt'>
) {
  await addDoc(collection(firestore, 'users', uid, 'stockMovements'), {
    ...movement,
    createdAt: serverTimestamp(),
  });
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function StockApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<StockView>('dashboard');

  // Collections Firestore
  const articlesRef   = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'articles'),        [firestore, user]);
  const categoriesRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'categories'),       [firestore, user]);
  const movementsRef  = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'stockMovements'),   [firestore, user]);
  const salesRef      = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'sales'),            [firestore, user]);

  const { data: rawArticles,   isLoading: loadingArt } = useCollection(articlesRef);
  const { data: rawCategories, isLoading: loadingCat } = useCollection(categoriesRef);
  const { data: rawMovements,  isLoading: loadingMov } = useCollection(movementsRef);
  const { data: rawSales,      isLoading: loadingSales } = useCollection(salesRef);

  const articles   = rawArticles   || [];
  const categories = rawCategories || [];
  const movements  = (rawMovements || []) as StockMovement[];
  const sales      = (rawSales    || []) as Sale[];

  const stockItems = useMemo(() =>
    computeStockItems(articles, movements, categories),
    [articles, movements, categories]
  );

  const alertCount = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;

  // CA de ce mois pour badge
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const salesThisMonth = sales.filter(s => s.date?.startsWith(currentMonth)).length;

  const isLoading = isUserLoading || loadingArt || loadingCat || loadingMov || loadingSales;

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleAddMovement = useCallback(async (movement: Omit<StockMovement, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    try {
      await addStockMovement(firestore, user.uid, movement);
      toast({
        title: movement.type === 'IN' ? 'Entrée enregistrée' : movement.type === 'OUT' ? 'Sortie enregistrée' : 'Ajustement enregistré',
        description: `${movement.quantity} ${movement.unitOfMeasure} · ${movement.productName}`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible d\'enregistrer le mouvement.' });
    }
  }, [user, firestore, toast]);

  const handleValidateSale = useCallback(async (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;

    // 1. Créer la vente
    await addDoc(collection(firestore, 'users', user.uid, 'sales'), {
      ...sale,
      createdAt: serverTimestamp(),
    });

    // 2. Créer un mouvement OUT pour chaque article vendu
    for (const item of sale.items) {
      await addDoc(collection(firestore, 'users', user.uid, 'stockMovements'), {
        articleId:    item.articleId,
        categoryId:   item.categoryId,
        productName:  item.productName,
        color:        item.color || null,
        size:         item.size  || null,
        unitOfMeasure: item.unitOfMeasure,
        type:         'OUT',
        reason:       'VENTE',
        quantity:     item.qty,
        date:         sale.date,
        notes:        sale.clientName ? `Vente à ${sale.clientName}` : 'Vente directe',
        createdAt:    serverTimestamp(),
      });
    }

    toast({
      title: '✅ Vente enregistrée !',
      description: `Total : ${sale.totalAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} — ${sale.items.length} produit(s)`,
    });
  }, [user, firestore, toast]);

  // Auth guard
  if (isUserLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
    </div>
  );
  if (!user) return <AuthView />;

  const navItems: { id: StockView; label: string; icon: React.ElementType; badge?: number; highlight?: boolean }[] = [
    { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
    { id: 'pos',        label: 'Vente',        icon: ShoppingCart, badge: salesThisMonth, highlight: true },
    { id: 'inventory',  label: 'Inventaire',   icon: Boxes },
    { id: 'sales',      label: 'CA & Ventes',  icon: TrendingUp },
    { id: 'movements',  label: 'Mouvements',   icon: ArrowLeftRight },
    { id: 'alerts',     label: 'Alertes',      icon: Bell, badge: alertCount },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f0faf4] font-sans">

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/30">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-black tracking-tighter text-stone-900 uppercase">Stock</span>
              <span className="text-xl font-black tracking-tighter text-emerald-600 uppercase">Manager</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 ml-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">En ligne</span>
            </div>
          </div>

          {/* Nav desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(({ id, label, icon: Icon, badge, highlight }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  activeView === id
                    ? highlight
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                      : 'bg-stone-900 text-white shadow-md'
                    : highlight
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge != null && badge > 0 && (
                  <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[8px] font-black flex items-center justify-center ${
                    id === 'alerts' ? 'bg-red-500' : 'bg-violet-500'
                  }`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-[9px] font-black text-stone-500 hover:bg-stone-100 uppercase tracking-wider transition-colors">
              ← StockVue
            </a>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}
              className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex border-t border-emerald-50 bg-white px-2 py-1 gap-1 overflow-x-auto">
          {navItems.map(({ id, label, icon: Icon, badge, highlight }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase whitespace-nowrap transition-all ${
                activeView === id
                  ? 'bg-emerald-600 text-white'
                  : highlight
                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                  : 'text-stone-500'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              {badge != null && badge > 0 && (
                <span className={`w-3.5 h-3.5 rounded-full text-white text-[7px] font-black flex items-center justify-center ml-0.5 ${
                  id === 'alerts' ? 'bg-red-500' : 'bg-violet-500'
                }`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="flex-grow max-w-[1600px] mx-auto px-4 sm:px-6 py-6 w-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Boxes className="w-8 h-8 text-emerald-500" />
              </div>
              <Loader2 className="absolute -top-1 -right-1 w-6 h-6 animate-spin text-emerald-600" />
            </div>
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement...</p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            {activeView === 'dashboard' && (
              <StockDashboard stockItems={stockItems} movements={movements} categories={categories} onNavigate={setActiveView} />
            )}
            {activeView === 'pos' && (
              <StockPOS stockItems={stockItems} categories={categories} onValidateSale={handleValidateSale} />
            )}
            {activeView === 'inventory' && (
              <StockInventory stockItems={stockItems} articles={articles} categories={categories} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'sales' && (
              <StockSales sales={sales} onNavigate={setActiveView} />
            )}
            {activeView === 'movements' && (
              <StockMovements movements={movements} stockItems={stockItems} categories={categories} articles={articles} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'alerts' && (
              <StockAlerts stockItems={stockItems} articles={articles} categories={categories} movements={movements} onNavigate={setActiveView} onAddMovement={handleAddMovement} />
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-emerald-100 bg-white py-3">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-wrap justify-between items-center gap-2 text-stone-400 text-[9px] font-black uppercase tracking-[0.15em]">
          <p>© 2024 STOCK MANAGER — STOCKVUE</p>
          <div className="flex gap-4">
            <span>{stockItems.length} Références</span>
            <span>{sales.length} Ventes</span>
            <span>{movements.length} Mouvements</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
