"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  Users, ShoppingBag, ClipboardList, CheckCircle2,
  Search, Plus, Minus, X, ChevronRight, ChevronLeft,
  UserPlus, Tag, Percent, ArrowRight, Phone, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Client, SaleOrder, Invoice, OrderItem, StockItem } from '@/lib/types';

// ── helpers ──
const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function getColorCSS(c: string): string {
  const m: Record<string, string> = {
    rouge:'#ef4444',red:'#ef4444',bleu:'#3b82f6',blue:'#3b82f6',vert:'#22c55e',green:'#22c55e',
    noir:'#1c1917',black:'#1c1917',blanc:'#f5f5f4',white:'#f5f5f4',gris:'#6b7280',grey:'#6b7280',
    jaune:'#eab308',yellow:'#eab308',orange:'#f97316',violet:'#8b5cf6',rose:'#f43f5e',pink:'#ec4899',
    marron:'#92400e',brown:'#92400e',beige:'#d6c5a3',marine:'#1e3a5f',bordeaux:'#6b1e2b',
    kaki:'#6b7a42',turquoise:'#14b8a6',navy:'#1e3a5f',
  };
  return m[c.toLowerCase()] || '#d4d4d4';
}

interface CartLine { item: StockItem; qty: number; unitPrice: number; sourceStore?: string; }

interface StockSaleFlowProps {
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  clients: Client[];
  onCreateOrder: (order: Omit<SaleOrder, 'id' | 'createdAt'>) => Promise<string>;
  onCreateInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>, movementsOut: any[]) => Promise<void>;
  onCreateClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>;
  userRole?: 'ADMIN' | 'COMMERCIAL';
  onNavigate: (v: any) => void;
}

const STEPS = [
  { label: 'Client',    icon: Users },
  { label: 'Produits',  icon: ShoppingBag },
  { label: 'Panier',    icon: ClipboardList },
  { label: 'Validation',icon: CheckCircle2 },
];

export default function StockSaleFlow({
  stockItems, categories, generalCategories, clients, userRole = 'ADMIN',
  onCreateOrder, onCreateInvoice, onCreateClient, onNavigate,
}: StockSaleFlowProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Étape 1 — Client
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [showNewClient, setShowNewClient] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [selGenCat, setSelGenCat] = useState<string | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [prodSearch, setProdSearch] = useState('');
  const [addModal, setAddModal] = useState<{ open: boolean; item?: StockItem; qty: number; unitPrice: number; sourceStore?: string }>({ open: false, qty: 1, unitPrice: 0 });

  // Étape 3 — Panier
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Étape 4 — Finalisation
  const [finalType, setFinalType] = useState<'order' | 'invoice'>('invoice');
  const [finalDate, setFinalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');

  // ── Calculs ──
  const subTotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discountAmt = subTotal * (discount / 100);
  const total = subTotal - discountAmt;
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  // ── Filtres catégories ──
  const filteredCats = useMemo(() =>
    selGenCat
      ? categories.filter((c: any) => c.generalCategoryId === selGenCat || c.generalCategoryId === selGenCat)
      : categories,
    [categories, selGenCat]
  );

  const [variantModal, setVariantModal] = useState<{ open: boolean; productName: string; variants: StockItem[]; categoryId: string }>({ open: false, productName: '', variants: [], categoryId: '' });
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // Grouped list of products for the main grid
  const groupedProducts = useMemo(() => {
    let items = stockItems.filter(i => i.currentQty > 0);
    if (selCat) {
      items = items.filter(i => i.categoryId === selCat);
    } else if (selGenCat) {
      const catNames = filteredCats.map((c: any) => c.name);
      items = items.filter(i => catNames.includes(i.categoryId));
    }
    if (prodSearch) {
      const q = prodSearch.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(q) ||
        i.color?.toLowerCase().includes(q) ||
        i.size?.toLowerCase().includes(q)
      );
    }
    
    const map = new Map<string, StockItem[]>();
    items.forEach(item => {
      const key = item.productName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    
    return Array.from(map.entries()).map(([name, variants]) => ({
      name,
      variants: variants.sort((a, b) => {
        const aKey = `${a.color || ''}${a.size || ''}`;
        const bKey = `${b.color || ''}${b.size || ''}`;
        return aKey.localeCompare(bKey);
      }),
      totalQty: variants.reduce((s, v) => s + v.currentQty, 0),
      categoryId: variants[0]?.categoryId || '',
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stockItems, selCat, selGenCat, filteredCats, prodSearch]);

  const filteredClients = useMemo(() =>
    clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.phone?.includes(clientSearch) || c.email?.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  );

  // ── Actions ──
  const openAddModal = (item: StockItem) => {
    let defStore = undefined;
    if (item.qtyByStore) {
      const storesWithStock = Object.entries(item.qtyByStore).filter(([_, q]) => (q as number) > 0);
      if (storesWithStock.length === 1) defStore = storesWithStock[0][0];
    }
    setAddModal({ open: true, item, qty: 1, unitPrice: item.sellingPrice || 0, sourceStore: defStore });
  };

  const addToCart = () => {
    if (!addModal.item || addModal.qty <= 0) return;
    const itemStockLimit = addModal.sourceStore && addModal.item.qtyByStore 
      ? (addModal.item.qtyByStore as any)[addModal.sourceStore] || 0 
      : addModal.item.currentQty;

    setCart(prev => {
      // Pour une même variante, si le store source est différent, on crée une nouvelle ligne (ou on les sépare)
      const ex = prev.find(l => l.item.articleId === addModal.item!.articleId && l.sourceStore === addModal.sourceStore);
      if (ex) {
        return prev.map(l => l.item.articleId === addModal.item!.articleId && l.sourceStore === addModal.sourceStore
          ? { ...l, qty: Math.min(l.qty + addModal.qty, itemStockLimit), unitPrice: addModal.unitPrice }
          : l
        );
      }
      return [...prev, { item: addModal.item!, qty: addModal.qty, unitPrice: addModal.unitPrice, sourceStore: addModal.sourceStore }];
    });
    setAddModal({ open: false, qty: 1, unitPrice: 0 });
  };

  const updateCart = (articleId: string, key: 'qty' | 'unitPrice', val: number) => {
    setCart(prev => prev.map(l => l.item.articleId === articleId ? { ...l, [key]: val } : l));
  };

  const removeFromCart = (articleId: string) => {
    setCart(prev => prev.filter(l => l.item.articleId !== articleId));
  };

  // Quick add: 1-click for single-store, modal for multi-store
  const quickAddToCart = (item: StockItem, customPrice?: number) => {
    const storesWithStock = item.qtyByStore
      ? Object.entries(item.qtyByStore).filter(([_, q]) => (q as number) > 0)
      : [];

    if (storesWithStock.length > 1) {
      openAddModal(item);
      return;
    }

    const sourceStore = storesWithStock.length === 1 ? storesWithStock[0][0] : undefined;
    const price = customPrice !== undefined ? customPrice : (item.sellingPrice || 0);
    // Remove the price <= 0 restriction so we can add 0-price items and set them later, or use the custom price
    // if (price <= 0) return;

    const maxQty = sourceStore && item.qtyByStore
      ? (item.qtyByStore as any)[sourceStore] || item.currentQty
      : item.currentQty;

    setCart(prev => {
      const ex = prev.find(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore);
      if (ex) {
        return prev.map(l =>
          l.item.articleId === item.articleId && l.sourceStore === sourceStore
            ? { ...l, qty: Math.min(l.qty + 1, maxQty) }
            : l
        );
      }
      return [...prev, { item, qty: 1, unitPrice: price, sourceStore }];
    });
  };

  const setVariantQtyInCart = (item: StockItem, qty: number, customPrice?: number) => {
    const storesWithStock = item.qtyByStore ? Object.entries(item.qtyByStore).filter(([_, q]) => (q as number) > 0) : [];
    if (storesWithStock.length > 1 && qty > 0) {
      openAddModal(item);
      return;
    }
    const sourceStore = storesWithStock.length === 1 ? storesWithStock[0][0] : undefined;
    const price = customPrice !== undefined ? customPrice : (item.sellingPrice || 0);
    const maxQty = sourceStore && item.qtyByStore ? (item.qtyByStore as any)[sourceStore] || item.currentQty : item.currentQty;
    const validQty = Math.max(0, Math.min(qty, maxQty));

    setCart(prev => {
      const ex = prev.find(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore);
      if (validQty === 0) return prev.filter(l => l.item.articleId !== item.articleId);
      if (ex) return prev.map(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore ? { ...l, qty: validQty, unitPrice: price } : l);
      return [...prev, { item, qty: validQty, unitPrice: price, sourceStore }];
    });
  };

  const handleCreateClient = async () => {
    if (!newClientForm.name.trim()) return;
    setCreatingClient(true);
    try {
      const c = await onCreateClient(newClientForm);
      setSelectedClient(c);
      setShowNewClient(false);
      setNewClientForm({ name: '', phone: '', email: '', address: '' });
    } finally { setCreatingClient(false); }
  };

  const handleFinalize = async () => {
    if (cart.length === 0 || saving) return;
    setSaving(true);
    try {
      const today = finalDate;
      const items: OrderItem[] = cart.map(l => ({
        articleId: l.item.articleId,
        productName: l.item.productName,
        color: l.item.color,
        size: l.item.size,
        categoryId: l.item.categoryId,
        unitOfMeasure: l.item.unitOfMeasure,
        qty: l.qty,
        unitPrice: l.unitPrice,
        totalPrice: l.qty * l.unitPrice,
        storeId: l.sourceStore,
      }));

      if (finalType === 'order') {
        await onCreateOrder({
          clientId: selectedClient?.id || undefined,
          clientName: selectedClient?.name || (anonymous ? 'Anonyme' : ''),
          items,
          totalAmount: subTotal,
          discount,
          totalAfterDiscount: total,
          status: 'CONFIRMED',
          date: today,
          notes,
        });
      } else {
        const movements = cart.map(l => ({
          articleId: l.item.articleId,
          categoryId: l.item.categoryId,
          productName: l.item.productName,
          color: l.item.color || null,
          size: l.item.size || null,
          unitOfMeasure: l.item.unitOfMeasure,
          type: 'OUT',
          reason: 'VENTE',
          quantity: l.qty,
          date: today,
          notes: selectedClient ? `Facture client : ${selectedClient.name}` : 'Vente directe',
          storeId: l.sourceStore,
        }));
        await onCreateInvoice({
          clientId: selectedClient?.id || undefined,
          clientName: selectedClient?.name || (anonymous ? 'Anonyme' : ''),
          items,
          totalAmount: subTotal,
          discount,
          totalAfterDiscount: total,
          paidAmount: 0,
          remainingBalance: total,
          status: 'UNPAID',
          date: today,
          dueDate: dueDate || undefined,
          notes,
        }, movements);
      }
      setDone(true);
    } finally { setSaving(false); }
  };

  const reset = () => {
    setStep(0); setCart([]); setSelectedClient(null); setAnonymous(false);
    setDiscount(0); setNotes(''); setDone(false); setFinalDate(new Date().toISOString().split('T')[0]);
    setDueDate(''); setSelGenCat(null); setSelCat(null); setProdSearch('');
  };

  // ── Succès ──
  if (done) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-in fade-in">
      <div className="w-24 h-24 rounded-3xl bg-emerald-100 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-stone-900">
          {finalType === 'order' ? 'Bon de commande créé !' : 'Facture créée !'}
        </h2>
        <p className="text-stone-400 font-bold text-sm">
          {finalType === 'invoice' ? 'Stock mis à jour automatiquement.' : 'Commande enregistrée.'}
          {' '}Total : <strong className="text-stone-700">{fmt$(total)}</strong>
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs px-8 h-11 rounded-2xl">
          Nouvelle vente
        </Button>
        <Button variant="outline" onClick={() => onNavigate(finalType === 'order' ? 'orders' : 'invoices')}
          className="font-black uppercase text-xs px-6 h-11 rounded-2xl">
          Voir {finalType === 'order' ? 'les commandes' : 'les factures'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Stepper ── */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5">
        <div className="flex items-center justify-between">
          {STEPS.map(({ label, icon: Icon }, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                  i < step ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                  i === step ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30' :
                  'bg-stone-100 text-stone-300'
                }`}>
                  {i < step ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest hidden sm:block ${
                  i === step ? 'text-violet-600' : i < step ? 'text-emerald-600' : 'text-stone-300'
                }`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded-full transition-all ${i < step ? 'bg-emerald-400' : 'bg-stone-100'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Étape 1 : Client ── */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-violet-900 to-violet-800 p-6 rounded-3xl shadow-xl">
            <p className="text-[9px] font-black text-violet-300 uppercase tracking-[0.3em]">Étape 1</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Sélectionner le client</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recherche */}
            <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Clients existants</h3>
                <button onClick={() => setShowNewClient(v => !v)}
                  className="flex items-center gap-1.5 text-[9px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-wider bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-200 transition-colors">
                  <UserPlus className="w-3 h-3" /> Nouveau
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <Input placeholder="Chercher par nom, tél, email..." value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredClients.length === 0 && (
                  <p className="text-center text-stone-300 text-[10px] font-black uppercase py-6">Aucun client trouvé</p>
                )}
                {filteredClients.map(c => (
                  <button key={c.id} onClick={() => { setSelectedClient(c); setAnonymous(false); }}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      selectedClient?.id === c.id ? 'border-violet-500 bg-violet-50' : 'border-stone-100 hover:border-violet-200 hover:bg-stone-50'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white font-black text-sm flex items-center justify-center shrink-0">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-stone-800 text-sm truncate">{c.name}</p>
                        <p className="text-[9px] text-stone-400 font-bold">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                      </div>
                      {selectedClient?.id === c.id && <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Droite : actions rapides + nouveau client */}
            <div className="space-y-3">
              <button onClick={() => { setAnonymous(true); setSelectedClient(null); }}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  anonymous ? 'border-stone-700 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:border-stone-400'
                }`}>
                <p className="font-black text-base uppercase">🏪 Vente Comptoir</p>
                <p className="text-[10px] font-bold mt-1 opacity-60">Sans dossier client</p>
              </button>

              {showNewClient && (
                <div className="bg-white rounded-2xl shadow-lg border border-violet-200 p-5 space-y-3">
                  <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Créer un nouveau client</p>
                  {[
                    { key: 'name', label: 'Nom *', placeholder: 'Ex: Mohamed Alami' },
                    { key: 'phone', label: 'Téléphone', placeholder: '+212 6...' },
                    { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                    { key: 'address', label: 'Adresse', placeholder: 'Casablanca...' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
                      <Input placeholder={placeholder} value={(newClientForm as any)[key]}
                        onChange={e => setNewClientForm(f => ({ ...f, [key]: e.target.value }))}
                        className="h-9 rounded-xl border-stone-200 text-sm font-bold" />
                    </div>
                  ))}
                  <Button onClick={handleCreateClient} disabled={!newClientForm.name.trim() || creatingClient}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-10 rounded-xl">
                    {creatingClient ? 'Création...' : 'Créer le client'}
                  </Button>
                </div>
              )}

              {(selectedClient || anonymous) && (
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Client sélectionné</p>
                    <p className="font-black text-stone-900">{selectedClient?.name || 'Vente Comptoir'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!selectedClient && !anonymous}
              className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2">
              Suivant — Choisir les produits <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Étape 2 : Produits ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-900 to-violet-800 p-6 rounded-3xl shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-violet-300 uppercase tracking-[0.3em]">Étape 2</p>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Sélection des produits</h2>
              <p className="text-violet-300/70 text-xs font-bold mt-1">{selectedClient?.name || 'Comptoir'}</p>
            </div>
            {cartCount > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center">
                <p className="text-2xl font-black text-white">{cartCount}</p>
                <p className="text-[10px] font-black text-violet-300 uppercase">article{cartCount > 1 ? 's' : ''}</p>
                <p className="text-xs font-black text-emerald-300">{fmt$(subTotal)}</p>
              </div>
            )}
          </div>

          {/* ── Barre de recherche ── */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              placeholder="Rechercher par nom, couleur, taille..."
              value={prodSearch}
              onChange={e => setProdSearch(e.target.value)}
              className="pl-12 h-12 rounded-2xl border-stone-200 text-sm font-bold shadow-sm"
              autoFocus
            />
            {prodSearch && (
              <button onClick={() => setProdSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
                <X className="w-3.5 h-3.5 text-stone-500" />
              </button>
            )}
          </div>

          {/* ── Filtres Famille + Catégorie ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-stone-400 uppercase tracking-widest shrink-0">Famille :</span>
              <button
                onClick={() => { setSelGenCat(null); setSelCat(null); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  !selGenCat ? 'bg-stone-900 text-white border-stone-900' : 'text-stone-500 border-stone-200 hover:bg-stone-50'
                }`}
              >
                Tout ({stockItems.filter(i => i.currentQty > 0).length})
              </button>
              {generalCategories.map(gc => {
                const catNames = categories.filter((c: any) => c.generalCategoryId === gc.id || c.generalCategoryId === gc.name).map((c: any) => c.name);
                const count = stockItems.filter(i => catNames.includes(i.categoryId) && i.currentQty > 0).length;
                if (count === 0) return null;
                const isActive = selGenCat === (gc.id || gc.name);
                return (
                  <button key={gc.id} onClick={() => { setSelGenCat(gc.id || gc.name); setSelCat(null); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      isActive ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20' : 'text-stone-500 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {gc.name} <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {selGenCat && filteredCats.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-stone-400 uppercase tracking-widest shrink-0">Catégorie :</span>
                <button
                  onClick={() => setSelCat(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    !selCat ? 'bg-emerald-700 text-white border-emerald-700' : 'text-stone-500 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  Tout
                </button>
                {filteredCats.map((cat: any) => {
                  const count = stockItems.filter(i => i.categoryId === cat.name && i.currentQty > 0).length;
                  if (count === 0) return null;
                  return (
                    <button key={cat.id || cat.name} onClick={() => setSelCat(cat.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                        selCat === cat.name ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' : 'text-stone-500 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {cat.name} <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Split layout: Grille produits + Mini-panier ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

            {/* ── Gauche: Grille produits ── */}
            <div>
              <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">
                {groupedProducts.length} modèle{groupedProducts.length !== 1 ? 's' : ''} disponible{groupedProducts.length !== 1 ? 's' : ''}
              </p>

              {groupedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-stone-100">
                  <ShoppingBag className="w-12 h-12 text-stone-200 mb-3" />
                  <p className="text-stone-400 text-sm font-bold">Aucun produit trouvé</p>
                  <p className="text-stone-300 text-xs mt-1">Essayez une autre recherche ou catégorie</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {groupedProducts.map(group => {
                    const cartLinesForGroup = cart.filter(l => l.item.productName === group.name);
                    const cartQtyTotal = cartLinesForGroup.reduce((s, l) => s + l.qty, 0);
                    const isEmpty = group.totalQty === 0;

                    return (
                      <button type="button" key={group.name}
                        onClick={() => setVariantModal({ open: true, productName: group.name, variants: group.variants, categoryId: group.categoryId })}
                        className={`text-left bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                          cartQtyTotal > 0 ? 'border-emerald-400 shadow-lg shadow-emerald-500/10'
                          : isEmpty ? 'border-stone-100 opacity-50 cursor-not-allowed'
                          : 'border-stone-100 hover:border-violet-300 hover:shadow-md'
                        }`}
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-black text-stone-900 uppercase tracking-tight leading-tight line-clamp-2">{group.name}</p>
                            {cartQtyTotal > 0 && (
                              <span className="shrink-0 text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg uppercase">
                                {cartQtyTotal} dans le panier
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-stone-400 uppercase">{group.categoryId}</span>
                            <span className="text-[10px] font-black text-stone-300">•</span>
                            <span className="text-[10px] font-black text-stone-500">{group.variants.length} variante{group.variants.length > 1 ? 's' : ''}</span>
                          </div>

                          <div className="flex items-end justify-between pt-2 border-t border-stone-50">
                            <div>
                              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">En stock</p>
                              <p className={`text-xl font-black ${group.totalQty < 20 ? 'text-amber-600' : 'text-stone-700'}`}>
                                {group.totalQty}
                              </p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center">
                              <ChevronRight className="w-4 h-4 text-stone-400" />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Droite: Mini-panier (desktop) ── */}
            <div className="hidden lg:block">
              <div className="sticky top-24 bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
                <div className="bg-stone-900 px-4 py-3">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Panier
                    {cartCount > 0 && (
                      <span className="bg-violet-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{cartCount}</span>
                    )}
                  </h3>
                </div>

                {cart.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-stone-300 text-xs font-bold">Panier vide</p>
                    <p className="text-stone-200 text-[10px] mt-1">Cliquez &quot;+&quot; pour ajouter</p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-stone-50 max-h-[400px] overflow-y-auto">
                      {cart.map(({ item, qty, unitPrice }) => (
                        <div key={item.articleId} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50/50 transition-colors">
                          <div className="w-8 h-8 rounded-lg shrink-0 border border-stone-200 flex items-center justify-center"
                            style={{ backgroundColor: item.color ? getColorCSS(item.color) : '#f5f5f4' }}>
                            {!item.color && <Tag className="w-3 h-3 text-stone-300" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-stone-900 uppercase truncate">{item.productName}</p>
                            <p className="text-[10px] text-stone-400 font-bold">
                              {[item.color, item.size ? `N°${item.size}` : null].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-[10px] font-black text-violet-600">{qty} × {fmt$(unitPrice)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-stone-900">{fmt$(qty * unitPrice)}</p>
                            <button type="button" onClick={() => removeFromCart(item.articleId)}
                              className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors">Retirer</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-stone-100 p-4">
                      <div className="flex justify-between text-sm font-black text-stone-900">
                        <span>Sous-total</span>
                        <span className="text-violet-700">{fmt$(subTotal)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="p-4 pt-0">
                  <Button onClick={() => setStep(2)} disabled={cart.length === 0}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 rounded-xl gap-2">
                    Voir le panier <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Barre flottante mobile ── */}
          {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-2xl p-4 z-50">
              <div className="flex items-center justify-between max-w-lg mx-auto">
                <div>
                  <p className="text-sm font-black text-stone-900">{cartCount} article{cartCount > 1 ? 's' : ''}</p>
                  <p className="text-xs font-black text-violet-600">{fmt$(subTotal)}</p>
                </div>
                <Button onClick={() => setStep(2)}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 px-6 rounded-xl gap-2">
                  Panier <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className={`flex justify-between ${cart.length > 0 ? 'pb-24 lg:pb-0' : ''}`}>
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Retour
            </Button>
            <Button onClick={() => setStep(2)} disabled={cart.length === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2 lg:hidden">
              Panier ({cartCount}) <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Étape 3 : Panier ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-6 rounded-3xl shadow-xl">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em]">Étape 3</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Récapitulatif du panier</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Référence produit', 'Qté', 'Prix unit. (MAD)', 'Total (MAD)', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {cart.map(({ item, qty, unitPrice }) => (
                  <tr key={item.articleId} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-[11px] font-black text-stone-900 uppercase tracking-tight">{item.productName}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.color && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorCSS(item.color) }} />
                              {item.color}
                            </span>
                          )}
                          {item.size && (
                            <span className="text-[8px] font-black bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase">N° {item.size}</span>
                          )}
                          <span className="text-[8px] text-stone-300 font-bold">{item.unitOfMeasure}</span>
                        </div>
                        <p className="text-[8px] text-stone-400 font-bold mt-0.5">{item.categoryId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => qty > 1 && updateCart(item.articleId, 'qty', qty - 1)}
                          className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center font-black">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-black text-stone-900">{qty}</span>
                        <button onClick={() => qty < item.currentQty && updateCart(item.articleId, 'qty', qty + 1)}
                          className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center font-black">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Input type="number" min={0} step="any" value={unitPrice}
                        onChange={e => updateCart(item.articleId, 'unitPrice', Number(e.target.value))}
                        className="h-8 w-24 text-xs font-black rounded-lg border-stone-200" />
                    </td>
                    <td className="px-4 py-3 text-[10px] font-black text-violet-700">{fmt$(qty * unitPrice)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => removeFromCart(item.articleId)}
                        className="w-7 h-7 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totaux + remise */}
            <div className="border-t border-stone-100 p-5 space-y-3">
              <div className="flex items-center gap-3 max-w-xs">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest shrink-0 flex items-center gap-1">
                  <Percent className="w-3 h-3" /> Remise
                </Label>
                <Input type="number" min={0} max={100} value={discount}
                  onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="h-9 w-24 text-sm font-black rounded-xl border-stone-200" />
                <span className="text-[10px] text-stone-400 font-bold shrink-0">— {fmt$(discountAmt)}</span>
              </div>
              <div className="flex flex-col items-end space-y-1">
                <div className="flex justify-between w-60 text-[10px] font-bold text-stone-500">
                  <span>Sous-total</span><span>{fmt$(subTotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between w-60 text-[10px] font-bold text-emerald-600">
                    <span>Remise {discount}%</span><span>-{fmt$(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between w-60 text-lg font-black text-stone-900 border-t border-stone-100 pt-1 mt-1">
                  <span>TOTAL</span><span className="text-violet-700">{fmt$(total)}</span>
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Notes</Label>
                <Input placeholder="Référence, instructions livraison..." value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="h-10 rounded-xl border-stone-200 font-bold text-sm" />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Ajouter des produits
            </Button>
            <Button onClick={() => setStep(3)}
              className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2">
              Finaliser <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Étape 4 : Finalisation ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-6 rounded-3xl shadow-xl">
            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-[0.3em]">Étape 4</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Finaliser la vente</h2>
            <p className="text-emerald-300/70 text-xs font-bold mt-1">
              {selectedClient?.name || 'Comptoir'} · {cart.length} produit{cart.length > 1 ? 's' : ''} · Total : {fmt$(total)}
            </p>
          </div>

          {/* Choix type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userRole !== 'ADMIN' && (
              <button onClick={() => setFinalType('order')}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  finalType === 'order' ? 'border-stone-700 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:border-stone-400'
                }`}>
                <ClipboardList className="w-8 h-8 mb-3 opacity-70" />
                <p className="font-black text-lg uppercase tracking-tighter">Bon de Commande</p>
                <p className={`text-[10px] font-bold mt-1 ${finalType === 'order' ? 'text-stone-400' : 'text-stone-400'}`}>
                  Enregistre la commande. Le stock N'EST PAS décompté.
                </p>
              </button>
            )}
            <button onClick={() => setFinalType('invoice')}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                finalType === 'invoice' ? 'border-violet-600 bg-violet-600 text-white' : 'border-stone-200 bg-white hover:border-violet-300'
              } ${userRole === 'ADMIN' ? 'sm:col-span-2' : ''}`}>
              <CheckCircle2 className="w-8 h-8 mb-3 opacity-70" />
              <p className="font-black text-lg uppercase tracking-tighter">Facture + Sortie Stock</p>
              <p className={`text-[10px] font-bold mt-1 ${finalType === 'invoice' ? 'text-violet-200' : 'text-stone-400'}`}>
                Crée la facture et décompte le stock automatiquement.
              </p>
            </button>
          </div>

          {/* Champs date */}
          <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date</Label>
                <Input type="date" value={finalDate} onChange={e => setFinalDate(e.target.value)}
                  className="h-11 rounded-xl border-stone-200 font-bold" />
              </div>
              {finalType === 'invoice' && (
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Échéance (optionnel)</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="h-11 rounded-xl border-stone-200 font-bold" />
                </div>
              )}
            </div>

            {/* Récap final */}
            <div className="bg-stone-50 rounded-xl p-4 space-y-1">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-2">Récapitulatif</p>
              {cart.slice(0, 4).map(({ item, qty, unitPrice }) => (
                <div key={item.articleId} className="flex justify-between text-[10px] font-bold text-stone-600">
                  <span>{qty}x {item.productName} {item.color || ''} {item.size || ''}</span>
                  <span>{fmt$(qty * unitPrice)}</span>
                </div>
              ))}
              {cart.length > 4 && <p className="text-[9px] text-stone-400 font-bold">+{cart.length - 4} autre(s)...</p>}
              <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between font-black text-stone-900">
                <span>Total {finalType === 'invoice' ? 'Facture' : 'BC'}</span>
                <span className="text-violet-700">{fmt$(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Modifier le panier
            </Button>
            <Button onClick={handleFinalize} disabled={saving}
              className={`font-black uppercase text-xs h-12 px-10 rounded-2xl gap-2 shadow-lg transition-all ${
                finalType === 'invoice'
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/30'
                  : 'bg-stone-900 hover:bg-stone-800 text-white shadow-stone-900/30'
              }`}>
              {saving ? 'Enregistrement...' : (
                <>{finalType === 'invoice' ? 'Émettre la Facture' : 'Créer le Bon de Commande'} <CheckCircle2 className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Modal ajout article ── */}
      <Dialog open={addModal.open} onOpenChange={o => !o && setAddModal({ open: false, qty: 1, unitPrice: 0 })}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-700 to-violet-600 p-5 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">{addModal.item?.productName}</DialogTitle>
            <p className="text-[10px] font-bold text-violet-200 mt-1">
              {[addModal.item?.color, addModal.item?.size].filter(Boolean).join(' · ')} · Stock: {addModal.item?.currentQty} {addModal.item?.unitOfMeasure}
            </p>
          </div>
          <div className="p-5 space-y-4 bg-white">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Quantité</Label>
              <Input type="number" min={1} max={addModal.sourceStore && addModal.item?.qtyByStore ? (addModal.item.qtyByStore as any)[addModal.sourceStore] : addModal.item?.currentQty} value={addModal.qty}
                onChange={e => setAddModal(m => {
                  const maxStock = m.sourceStore && m.item?.qtyByStore ? (m.item.qtyByStore as any)[m.sourceStore] : m.item?.currentQty || 999;
                  return { ...m, qty: Math.min(Number(e.target.value), maxStock) };
                })}
                className="h-12 text-xl font-black rounded-xl border-stone-200" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Prix unitaire</Label>
              <Input type="number" min={0} step="any" value={addModal.unitPrice}
                onChange={e => setAddModal(m => ({ ...m, unitPrice: Number(e.target.value) }))}
                className="h-12 text-xl font-black rounded-xl border-stone-200" />
            </div>
            <div className="bg-stone-50 rounded-xl p-3 flex justify-between font-black">
              <span className="text-stone-500 text-sm">Total</span>
              <span className="text-violet-700 text-lg">{fmt$(addModal.qty * addModal.unitPrice)}</span>
            </div>
            {addModal.item?.qtyByStore && Object.keys(addModal.item.qtyByStore).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Retirer depuis l'emplacement</Label>
                <select
                  className="w-full h-10 border border-stone-200 rounded-lg text-xs font-bold text-stone-700 px-3 outline-none focus:border-violet-500 bg-white"
                  value={addModal.sourceStore || ''}
                  onChange={e => setAddModal(m => ({ ...m, sourceStore: e.target.value }))}
                >
                  <option value="" disabled>-- Choisir un emplacement --</option>
                  {Object.entries(addModal.item.qtyByStore).map(([sId, q]) => (q as number) > 0 && (
                    <option key={sId} value={sId}>{sId.replace('_', ' ')} (Stock: {q})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 bg-stone-50 gap-2">
            <Button variant="ghost" onClick={() => setAddModal({ open: false, qty: 1, unitPrice: 0 })} className="font-black uppercase text-[10px] rounded-xl flex-1">
              Annuler
            </Button>
            <Button onClick={addToCart} disabled={addModal.qty <= 0 || addModal.unitPrice <= 0 || (!!addModal.item?.qtyByStore && !addModal.sourceStore)}
              className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-11 rounded-xl gap-2">
              <Plus className="w-4 h-4" /> Ajouter au panier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal sélection variantes ── */}
      <Dialog open={variantModal.open} onOpenChange={o => !o && setVariantModal({ open: false, productName: '', variants: [], categoryId: '' })}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden bg-stone-50">
          <div className="bg-white p-5 border-b border-stone-100 flex justify-between items-center sticky top-0 z-10 shadow-sm">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-stone-900">{variantModal.productName}</DialogTitle>
              <p className="text-[10px] font-bold text-stone-400 mt-1 uppercase tracking-widest">{variantModal.categoryId}</p>
            </div>
            <div className="bg-stone-100 text-stone-600 px-3 py-1.5 rounded-xl text-xs font-black uppercase">
              {variantModal.variants.reduce((s, v) => s + v.currentQty, 0)} en stock
            </div>
          </div>
          
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
            {variantModal.variants.map((v) => {
              const inCartLine = cart.find(l => l.item.articleId === v.articleId);
              const isEmpty = v.currentQty === 0;
              const noPrice = !v.sellingPrice || v.sellingPrice <= 0;

              return (
                <div key={v.articleId} className={`bg-white rounded-2xl border p-3 flex items-center gap-4 transition-colors ${
                  isEmpty ? 'opacity-50 border-stone-100' : 'border-stone-200 hover:border-violet-300'
                }`}>
                  {/* Infos Variante */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {v.color && (
                        <span className="inline-flex items-center gap-1.5 bg-stone-100 px-2 py-0.5 rounded-lg">
                          <div className="w-2.5 h-2.5 rounded-full border border-stone-200" style={{ backgroundColor: getColorCSS(v.color) }} />
                          <p className="text-sm font-black text-stone-900 uppercase">{v.color}</p>
                        </span>
                      )}
                      {v.size && <span className="text-sm font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-lg uppercase">Taille {v.size}</span>}
                      {!v.color && !v.size && <p className="text-sm font-black text-stone-500 uppercase">Standard</p>}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Prix</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={customPrices[v.articleId] !== undefined ? customPrices[v.articleId] : (v.sellingPrice || '')}
                          onChange={e => setCustomPrices(prev => ({ ...prev, [v.articleId]: Number(e.target.value) }))}
                          className="w-20 h-8 text-sm font-bold text-violet-700 border border-stone-200 rounded-lg px-2 focus:outline-none focus:border-violet-500"
                          placeholder="0.00"
                        />
                        <span className="text-[9px] font-black text-stone-400">MAD</span>
                      </div>
                      <span className="text-[10px] font-bold text-stone-400">•</span>
                      <p className={`text-xs font-black ${isEmpty ? 'text-red-500' : 'text-stone-500'}`}>Stock: {v.currentQty}</p>
                    </div>
                  </div>

                  {/* Saisie Rapide Quantité */}
                  <div className="shrink-0">
                    <div className={`flex items-center gap-1.5 rounded-xl p-1.5 border transition-colors ${
                      inCartLine ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-50 border-stone-200'
                    }`}>
                      <button type="button" onClick={() => setVariantQtyInCart(v, (inCartLine?.qty || 0) - 1, customPrices[v.articleId] !== undefined ? customPrices[v.articleId] : v.sellingPrice)}
                        disabled={isEmpty || !inCartLine}
                        className="w-9 h-9 rounded-lg bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 disabled:opacity-30 transition-colors shadow-sm">
                        <Minus className="w-4 h-4" />
                      </button>
                      
                      <input 
                        type="number" 
                        min="0"
                        max={v.currentQty}
                        value={inCartLine?.qty || ''}
                        onChange={e => setVariantQtyInCart(v, parseInt(e.target.value) || 0, customPrices[v.articleId] !== undefined ? customPrices[v.articleId] : v.sellingPrice)}
                        disabled={isEmpty}
                        placeholder="0"
                        className={`w-14 h-9 text-center text-lg font-black bg-transparent border-none focus:outline-none focus:ring-0 ${
                          inCartLine ? 'text-emerald-800' : 'text-stone-400'
                        }`} 
                      />
                      
                      <button type="button" onClick={() => setVariantQtyInCart(v, (inCartLine?.qty || 0) + 1, customPrices[v.articleId] !== undefined ? customPrices[v.articleId] : v.sellingPrice)}
                        disabled={isEmpty || (inCartLine?.qty || 0) >= v.currentQty}
                        className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-30 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="p-4 bg-white border-t border-stone-100 flex justify-end">
             <Button onClick={() => setVariantModal({ open: false, productName: '', variants: [], categoryId: '' })}
              className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-12 px-8 rounded-xl shadow-md">
              Terminer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
