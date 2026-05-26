"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, LogOut, LayoutDashboard, List, ArrowLeftRight, Bell, Package,
  Boxes, ShoppingCart, TrendingUp, Users, ClipboardList, FileText, Anchor, Archive, CheckCircle2,
} from 'lucide-react';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type {
  StockMovement, StockItem, Sale,
  Client, SaleOrder, SaleOrderStatus, Invoice, InvoiceStatus, ClientPayment,
} from '@/lib/types';
import StockDashboard   from './stock-dashboard';
import StockInventory   from './stock-inventory';
import StockMovements   from './stock-movements';
import StockAlerts      from './stock-alerts';
import StockSaleFlow    from './stock-sale-flow';
import StockSales       from './stock-sales';
import StockClients     from './stock-clients';
import StockOrders      from './stock-orders';
import StockInvoices    from './stock-invoices';
import PassToStockModal from '@/components/pass-to-stock-modal';
import StockFiches      from './stock-fiches';
import AuthView         from '@/components/auth-view';
import { Button }       from '@/components/ui/button';

type StockView = 'dashboard' | 'sale' | 'stock' | 'inventory' | 'analytics' | 'clients' | 'orders' | 'invoices' | 'movements' | 'alerts' | 'arrivals';

// ─── Calcul du stock courant ─────────────────────────────────────────────────
export function computeStockItems(
  articles: any[],
  movements: StockMovement[],
  categories: any[]
): StockItem[] {
  // Un article entre en stock UNIQUEMENT s'il a été validé manuellement via PassToStockModal
  // = il a une stockEntryDate ET au moins un mouvement IN enregistré
  const stockArticles = articles.filter(a => {
    if (!a.stockEntryDate) return false;
    const hasMovementIN = movements.some(m => m.articleId === a.id && m.type === 'IN');
    return hasMovementIN;
  });

  return stockArticles.map(a => {
    const parts: string[] = [];
    if (a.zipperType) parts.push(a.zipperType);
    if (a.slider)     parts.push(a.slider);
    const productName = parts.length > 0 ? parts.join(' ') : (a.name || a.specs || a.categoryId || 'Produit');

    const artMovements = movements.filter(m => m.articleId === a.id);
    const mouvIN  = artMovements.filter(m => m.type === 'IN').reduce((s, m) => s + m.quantity, 0);
    const mouvOUT = artMovements.filter(m => m.type === 'OUT').reduce((s, m) => s + m.quantity, 0);
    const mouvADJ = artMovements.filter(m => m.type === 'ADJUSTMENT').reduce((s, m) => s + m.quantity, 0);

    const initialQty = Number(a.quantity) || 0;
    const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);

    // Prix d'achat : coût de revient TTC MAD en priorité (calculé à l'arrivage),
    // sinon prix FOB $ brut (non préférable pour la valorisation)
    const hasTTCCost = Number(a.purchasePriceMAD) > 0;
    const price     = Number(a.purchasePriceMAD) || Number(a.purchasePricePerUnit) || 0;
    const sellPrice = Number(a.sellingPrice) || undefined;

    const lastMovement = [...artMovements].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

    return {
      articleId: a.id,
      categoryId: a.categoryId,
      productName,
      color: a.color,
      size: a.size,
      unitOfMeasure: a.unitOfMeasure || 'unité',
      purchasePricePerUnit: price,
      hasTTCCost,
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
  firestore: any, uid: string, movement: Omit<StockMovement, 'id' | 'createdAt'>
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

  // ── Collections Firestore ──────────────────────────────────────────────────
  const articlesRef      = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'articles'),         [firestore, user]);
  const categoriesRef    = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'categories'),        [firestore, user]);
  const genCatsRef       = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'generalCategories'), [firestore, user]);
  const movementsRef     = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'stockMovements'),    [firestore, user]);
  const salesRef         = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'sales'),             [firestore, user]);
  const clientsRef       = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'clients'),           [firestore, user]);
  const ordersRef        = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'saleOrders'),        [firestore, user]);
  const invoicesRef      = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'invoices'),          [firestore, user]);
  const paymentsRef      = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'clientPayments'),    [firestore, user]);
  const facturesRef      = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'factures'),          [firestore, user]);

  const { data: rawArticles,    isLoading: loadingArt  } = useCollection(articlesRef);
  const { data: rawCategories,  isLoading: loadingCat  } = useCollection(categoriesRef);
  const { data: rawGenCats,     isLoading: loadingGC   } = useCollection(genCatsRef);
  const { data: rawMovements,   isLoading: loadingMov  } = useCollection(movementsRef);
  const { data: rawSales,       isLoading: loadingSales } = useCollection(salesRef);
  const { data: rawClients,     isLoading: loadingCli  } = useCollection(clientsRef);
  const { data: rawOrders,      isLoading: loadingOrd  } = useCollection(ordersRef);
  const { data: rawInvoices,    isLoading: loadingInv  } = useCollection(invoicesRef);
  const { data: rawPayments,    isLoading: loadingPay  } = useCollection(paymentsRef);
  const { data: rawFactures } = useCollection(facturesRef);

  const articles        = rawArticles    || [];
  const categories      = rawCategories  || [];
  const generalCategories = rawGenCats   || [];
  const movements       = (rawMovements  || []) as StockMovement[];
  const sales           = (rawSales      || []) as Sale[];
  const clients         = (rawClients    || []) as Client[];
  const orders          = (rawOrders     || []) as SaleOrder[];
  const invoices        = (rawInvoices   || []) as Invoice[];
  const payments        = (rawPayments   || []) as ClientPayment[];
  const factures        = rawFactures    || [];

  const stockItems = useMemo(() =>
    computeStockItems(articles, movements, categories),
    [articles, movements, categories]
  );

  const alertCount = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
  const openInvoices = invoices.filter(i => i.status === 'UNPAID' || i.status === 'PARTIAL').length;
  const pendingArrivals = factures.filter((f: any) => f.arrivalDate && !f.stockEntryDate).length;

  // Pass-to-stock modal (depuis onglet Arrivages)
  const [passToStockId, setPassToStockId] = useState<string | null>(null);

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
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer le mouvement." });
    }
  }, [user, firestore, toast]);

  // POS rapide (ancienne vente)
  const handleValidateSale = useCallback(async (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    await addDoc(collection(firestore, 'users', user.uid, 'sales'), { ...sale, createdAt: serverTimestamp() });
    for (const item of sale.items) {
      await addDoc(collection(firestore, 'users', user.uid, 'stockMovements'), {
        articleId: item.articleId, categoryId: item.categoryId,
        productName: item.productName, color: item.color || null, size: item.size || null,
        unitOfMeasure: item.unitOfMeasure, type: 'OUT', reason: 'VENTE',
        quantity: item.qty, date: sale.date,
        notes: sale.clientName ? `Vente à ${sale.clientName}` : 'Vente directe',
        createdAt: serverTimestamp(),
      });
    }
    toast({ title: '✅ Vente enregistrée !', description: `Total : ${sale.totalAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} — ${sale.items.length} produit(s)` });
  }, [user, firestore, toast]);

  // ── Clients ──────────────────────────────────────────────────────────────
  const handleCreateClient = useCallback(async (data: Omit<Client, 'id' | 'createdAt'>): Promise<Client> => {
    if (!user || !firestore) throw new Error('Not authenticated');
    const ref = await addDoc(collection(firestore, 'users', user.uid, 'clients'), { ...data, createdAt: serverTimestamp() });
    toast({ title: '✅ Client créé', description: data.name });
    return { id: ref.id, ...data };
  }, [user, firestore, toast]);

  const handleUpdateClient = useCallback(async (id: string, data: Partial<Client>) => {
    if (!user || !firestore) return;
    await updateDoc(doc(firestore, 'users', user.uid, 'clients', id), data);
    toast({ title: 'Client mis à jour' });
  }, [user, firestore, toast]);

  // ── Bons de commande ──────────────────────────────────────────────────────
  const handleCreateOrder = useCallback(async (order: Omit<SaleOrder, 'id' | 'createdAt'>): Promise<string> => {
    if (!user || !firestore) throw new Error('Not authenticated');
    const ref = await addDoc(collection(firestore, 'users', user.uid, 'saleOrders'), { ...order, createdAt: serverTimestamp() });
    toast({ title: '✅ Bon de commande créé', description: `${order.items.length} article(s) · ${order.totalAfterDiscount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}` });
    return ref.id;
  }, [user, firestore, toast]);

  const handleUpdateOrderStatus = useCallback(async (id: string, status: SaleOrderStatus) => {
    if (!user || !firestore) return;
    await updateDoc(doc(firestore, 'users', user.uid, 'saleOrders', id), { status });
  }, [user, firestore]);

  const handleConvertToInvoice = useCallback(async (order: SaleOrder) => {
    if (!user || !firestore) return;
    const invRef = await addDoc(collection(firestore, 'users', user.uid, 'invoices'), {
      clientId: order.clientId,
      clientName: order.clientName,
      orderId: order.id,
      items: order.items,
      totalAmount: order.totalAmount,
      discount: order.discount,
      totalAfterDiscount: order.totalAfterDiscount,
      paidAmount: 0,
      remainingBalance: order.totalAfterDiscount,
      status: 'UNPAID',
      date: new Date().toISOString().split('T')[0],
      notes: order.notes,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(firestore, 'users', user.uid, 'saleOrders', order.id), { status: 'INVOICED' });
    toast({ title: '✅ Facture créée', description: `BC converti en facture` });
    setActiveView('invoices');
  }, [user, firestore, toast]);

  // ── Factures ──────────────────────────────────────────────────────────────
  const handleCreateInvoice = useCallback(async (
    invoice: Omit<Invoice, 'id' | 'createdAt'>,
    movementsOut: any[]
  ) => {
    if (!user || !firestore) return;
    await addDoc(collection(firestore, 'users', user.uid, 'invoices'), { ...invoice, createdAt: serverTimestamp() });
    for (const m of movementsOut) {
      await addDoc(collection(firestore, 'users', user.uid, 'stockMovements'), { ...m, createdAt: serverTimestamp() });
    }
    toast({ title: '✅ Facture créée !', description: `${invoice.items.length} article(s) · ${invoice.totalAfterDiscount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}` });
  }, [user, firestore, toast]);

  const handleUpdateInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    if (!user || !firestore) return;
    await updateDoc(doc(firestore, 'users', user.uid, 'invoices', id), { status });
  }, [user, firestore]);

  // ── Paiements clients ─────────────────────────────────────────────────────
  const handleRecordPayment = useCallback(async (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    await addDoc(collection(firestore, 'users', user.uid, 'clientPayments'), { ...payment, createdAt: serverTimestamp() });

    // Mettre à jour paidAmount + remainingBalance + status sur la facture
    if (payment.invoiceId) {
      const inv = invoices.find(i => i.id === payment.invoiceId);
      if (inv) {
        const newPaid = inv.paidAmount + payment.amount;
        const newBalance = Math.max(0, inv.totalAfterDiscount - newPaid);
        const newStatus: InvoiceStatus = newBalance === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
        await updateDoc(doc(firestore, 'users', user.uid, 'invoices', payment.invoiceId), {
          paidAmount: newPaid,
          remainingBalance: newBalance,
          status: newStatus,
        });
      }
    }
    toast({ title: '✅ Paiement enregistré', description: `${payment.amount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} · ${payment.method}` });
  }, [user, firestore, invoices, toast]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (isUserLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
    </div>
  );
  if (!user) return <AuthView />;

  const navItems: { id: StockView; label: string; icon: React.ElementType; badge?: number; color?: string }[] = [
    { id: 'dashboard', label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'sale',      label: 'Vente',         icon: ShoppingCart,   color: 'violet' },
    { id: 'stock',     label: 'En Stock',      icon: Package,         color: 'emerald' },
    { id: 'arrivals',  label: 'Arrivages',     icon: Anchor,          badge: pendingArrivals, color: 'amber' },
    { id: 'clients',   label: 'Clients',       icon: Users },
    { id: 'orders',    label: 'Commandes',     icon: ClipboardList },
    { id: 'invoices',  label: 'Factures',      icon: FileText,        badge: openInvoices },
    { id: 'inventory', label: 'Inventaire',    icon: Boxes },
    { id: 'analytics', label: 'Analytique',    icon: TrendingUp },
    { id: 'movements', label: 'Mouvements',    icon: ArrowLeftRight },
    { id: 'alerts',    label: 'Alertes',       icon: Bell,            badge: alertCount },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f0faf4] font-sans">

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center justify-center w-9 h-9 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/30">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter text-stone-900 uppercase">Stock<span className="text-emerald-600">Manager</span></span>
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Live</span>
            </div>
          </div>

          {/* Nav desktop */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center px-4">
            {navItems.map(({ id, label, icon: Icon, badge, color }) => (
              <button key={id} onClick={() => setActiveView(id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeView === id
                    ? color === 'violet'  ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                    : color === 'amber'   ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                    : color === 'emerald' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-stone-900 text-white shadow-md'
                    : color === 'violet'  ? 'text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100'
                    : color === 'amber'   ? 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                    : color === 'emerald' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge != null && badge > 0 && (
                  <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[7px] font-black flex items-center justify-center ${
                    id === 'alerts' ? 'bg-red-500' : id === 'invoices' ? 'bg-orange-500' : id === 'arrivals' ? 'bg-amber-500' : 'bg-violet-500'
                  }`}>{badge > 9 ? '9+' : badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
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
        <div className="lg:hidden flex border-t border-emerald-50 bg-white px-2 py-1 gap-1 overflow-x-auto">
          {navItems.map(({ id, label, icon: Icon, badge, color }) => (
            <button key={id} onClick={() => setActiveView(id)}
              className={`relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[9px] font-black uppercase whitespace-nowrap transition-all ${
                activeView === id
                  ? color === 'violet' ? 'bg-violet-600 text-white' : 'bg-stone-900 text-white'
                  : color === 'violet' ? 'text-violet-700 bg-violet-50 border border-violet-200' : 'text-stone-500'
              }`}>
              <Icon className="w-3 h-3" />
              {label}
              {badge != null && badge > 0 && (
                <span className={`w-3.5 h-3.5 rounded-full text-white text-[7px] font-black flex items-center justify-center ${
                  id === 'alerts' ? 'bg-red-500' : 'bg-orange-500'
                }`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="flex-grow max-w-[1800px] mx-auto px-4 sm:px-6 py-6 w-full">
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
              <StockDashboard stockItems={stockItems} movements={movements} categories={categories} sales={sales} onNavigate={setActiveView} />
            )}
            {activeView === 'sale' && (
              <StockSaleFlow
                stockItems={stockItems}
                categories={categories}
                generalCategories={generalCategories}
                clients={clients}
                onCreateOrder={handleCreateOrder}
                onCreateInvoice={handleCreateInvoice}
                onCreateClient={handleCreateClient}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'clients' && (
              <StockClients
                clients={clients}
                orders={orders}
                invoices={invoices}
                payments={payments}
                onCreateClient={handleCreateClient}
                onUpdateClient={handleUpdateClient}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'orders' && (
              <StockOrders
                orders={orders}
                clients={clients}
                onUpdateStatus={handleUpdateOrderStatus}
                onConvertToInvoice={handleConvertToInvoice}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'invoices' && (
              <StockInvoices
                invoices={invoices}
                clients={clients}
                payments={payments}
                onRecordPayment={handleRecordPayment}
                onUpdateStatus={handleUpdateInvoiceStatus}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'stock' && (
              <StockFiches stockItems={stockItems} movements={movements} categories={categories} factures={factures} />
            )}
            {activeView === 'inventory' && (
              <StockInventory stockItems={stockItems} articles={articles} categories={categories} generalCategories={generalCategories} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'analytics' && (
              <StockSales sales={sales} onNavigate={setActiveView} />
            )}
            {activeView === 'movements' && (
              <StockMovements movements={movements} stockItems={stockItems} categories={categories} articles={articles} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'alerts' && (
              <StockAlerts stockItems={stockItems} articles={articles} categories={categories} movements={movements} onNavigate={setActiveView} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'arrivals' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Header */}
                <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                  <div className="relative z-10">
                    <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Logistique Import</p>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Arrivages <span className="text-amber-500">StockVue</span></h2>
                    <p className="text-stone-400 text-sm mt-2">{factures.length} dossier(s) · {pendingArrivals} en attente d'entrée en stock</p>
                  </div>
                </div>
                {/* Liste arrivages */}
                {factures.length === 0 ? (
                  <div className="bg-white rounded-2xl p-16 text-center border border-stone-100">
                    <Anchor className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                    <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun arrivage dans StockVue</p>
                    <p className="text-stone-200 text-[9px] font-bold mt-1">Déclarez un dossier dans StockVue → Arrivages</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[...factures].sort((a: any, b: any) => (b.arrivalDate || '').localeCompare(a.arrivalDate || '')).map((f: any) => {
                      const factureArts = articles.filter((a: any) => a.factureId === f.id);
                      const artCount = factureArts.length;
                      // Un arrivage est "en stock" UNIQUEMENT si des mouvements IN ont été créés (validation manuelle)
                      const validatedCount = factureArts.filter((a: any) =>
                        movements.some(m => m.articleId === a.id && m.type === 'IN')
                      ).length;
                      const isValidated = validatedCount > 0 && validatedCount === artCount;
                      const isPartial   = validatedCount > 0 && validatedCount < artCount;
                      const canValidate = !!f.arrivalDate && !isValidated;
                      return (
                        <div key={f.id} className={`bg-white rounded-2xl border-2 p-6 flex flex-col gap-4 transition-all ${
                          isValidated ? 'border-emerald-200' : isPartial ? 'border-amber-300' : f.arrivalDate ? 'border-amber-100' : 'border-stone-100'
                        }`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{f.supplierId || f.supplier || '—'}</p>
                              <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mt-0.5">{f.id}</h3>
                            </div>
                            {isValidated ? (
                              <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase px-2.5 py-1 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> En stock
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase px-2.5 py-1 rounded-full">
                                <Anchor className="w-3 h-3" /> Partiel ({validatedCount}/{artCount})
                              </span>
                            ) : f.arrivalDate ? (
                              <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase px-2.5 py-1 rounded-full">
                                <Anchor className="w-3 h-3" /> Arrivé
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 bg-stone-100 text-stone-500 text-[8px] font-black uppercase px-2.5 py-1 rounded-full">
                                En transit
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-stone-50 rounded-xl p-2">
                              <p className="text-[8px] font-black text-stone-400 uppercase">Arrivée</p>
                              <p className="text-[10px] font-black text-stone-700">{f.arrivalDate || '—'}</p>
                            </div>
                            <div className="bg-stone-50 rounded-xl p-2">
                              <p className="text-[8px] font-black text-stone-400 uppercase">Articles</p>
                              <p className="text-[10px] font-black text-stone-700">{artCount}</p>
                            </div>
                            <div className="bg-stone-50 rounded-xl p-2">
                              <p className="text-[8px] font-black text-stone-400 uppercase">Validés</p>
                              <p className={`text-[10px] font-black ${isValidated ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-stone-300'}`}>
                                {validatedCount}/{artCount}
                              </p>
                            </div>
                          </div>
                          {canValidate && (
                            <button
                              onClick={() => setPassToStockId(f.id)}
                              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[9px] tracking-widest px-4 py-3 rounded-xl transition-all shadow-md shadow-emerald-500/20 hover:scale-[1.02] active:scale-95"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              Valider l'Entrée en Stock + Coût de Revient
                            </button>
                          )}
                          {isValidated && (
                            <div className="flex items-center gap-2 justify-center text-emerald-600 text-[9px] font-black uppercase">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Entrée validée — {artCount} article(s) en stock
                            </div>
                          )}
                        </div>
                      );
                    })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-emerald-100 bg-white py-3">
        <div className="max-w-[1800px] mx-auto px-6 flex flex-wrap justify-between items-center gap-2 text-stone-400 text-[9px] font-black uppercase tracking-[0.15em]">
          <p>© 2025 STOCK MANAGER — BUSINESS EDITION</p>
          <div className="flex gap-4">
            <span>{stockItems.length} Références</span>
            <span>{clients.length} Clients</span>
            <span>{invoices.length} Factures</span>
            <span>{movements.length} Mouvements</span>
          </div>
        </div>
      </footer>

      {/* ── Modal Entrée en Stock (depuis onglet Arrivages) ── */}
      {passToStockId && (
        <PassToStockModal
          open={!!passToStockId}
          onOpenChange={open => !open && setPassToStockId(null)}
          facture={factures.find((f: any) => f.id === passToStockId)}
          associatedArticles={articles.filter((a: any) => a.factureId === passToStockId)}
          subCategories={categories}
        />
      )}
    </div>
  );
}
