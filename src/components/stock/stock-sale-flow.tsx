"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  Users, ShoppingBag, ClipboardList, CheckCircle2,
  Search, Plus, Minus, X, ChevronRight, ChevronLeft,
  UserPlus, Tag, Percent, ArrowRight, Phone, Mail, Printer,
  Banknote, Landmark, FileCheck, Layers, Trash2, CreditCard,
  Camera, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Client, SaleOrder, Invoice, OrderItem, StockItem, PaymentMethod, CashingCompany } from '@/lib/types';

// ── helpers ──
const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MOROCCAN_BANKS = [
  'Attijariwafa Bank',
  'Banque Populaire (BCP)',
  'BMCE Bank (Bank of Africa)',
  'CIH Bank',
  'Crédit du Maroc',
  'Société Générale (SGMB)',
  'CFG Bank',
  'Al Barid Bank',
  'Autre banque'
];

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

interface CheckoutPaymentLine {
  id: string;
  amount: string;
  method: PaymentMethod;
  notes: string;
  bankName: string;
  checkNumber: string;
  dueDate: string;
  scannedImageUrl: string;
  cashingCompany?: CashingCompany;
}

interface StockSaleFlowProps {
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  clients: Client[];
  invoices: Invoice[];              // Pour vérifier le plafond de crédit
  stores?: any[];
  selectedStoreId?: string;
  onStoreChange?: (storeId: string) => void;
  onCreateOrder: (order: Omit<SaleOrder, 'id' | 'createdAt'>) => Promise<string>;
  onCreateInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>, movementsOut: any[], initialPayments?: any[]) => Promise<void>;
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
  stockItems, categories, generalCategories, clients, invoices, userRole = 'ADMIN',
  stores = [], selectedStoreId = 'CHRIFA', onStoreChange,
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
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CHEQUE' | 'LC' | 'VIREMENT' | 'MIXED'>('CASH');
  const [paymentLines, setPaymentLines] = useState<CheckoutPaymentLine[]>([
    { id: 'init-1', amount: '', method: 'CASH', notes: '', bankName: '', checkNumber: '', dueDate: '', scannedImageUrl: '' }
  ]);
  const [finalDate, setFinalDate] = useState(() => new Date().toISOString().split('T')[0]);

  // ── Calculs ──
  const subTotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discountAmt = subTotal * (discount / 100);
  const total = subTotal - discountAmt;
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const totalPaid = paymentStatus === 'UNPAID' ? 0 : paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remainingBalance = Math.max(0, total - totalPaid);
  const isOverpaid = totalPaid > total + 0.01;

  const setQuickPaymentMethod = (mode: 'CASH' | 'CHEQUE' | 'LC' | 'VIREMENT' | 'MIXED') => {
    setPaymentMode(mode);
    setPaymentStatus('PAID');
    if (mode === 'MIXED') {
      if (paymentLines.length <= 1) {
        const half = Math.round(total / 2);
        setPaymentLines([
          {
            id: 'line-1',
            amount: paymentLines[0]?.amount || String(half),
            method: 'CASH',
            notes: '',
            bankName: '',
            checkNumber: '',
            dueDate: '',
            scannedImageUrl: '',
          },
          {
            id: 'line-2',
            amount: String(Math.max(0, total - (parseFloat(paymentLines[0]?.amount) || half))),
            method: 'CHEQUE',
            notes: '',
            bankName: '',
            checkNumber: '',
            dueDate: '',
            scannedImageUrl: '',
          }
        ]);
      }
    } else {
      setPaymentLines([{
        id: Date.now().toString(),
        amount: String(total),
        method: mode,
        notes: '',
        bankName: '',
        checkNumber: '',
        dueDate: '',
        scannedImageUrl: '',
      }]);
    }
  };

  const addCheckoutPaymentLine = (method: PaymentMethod = 'CASH') => {
    const curPaid = paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const rem = Math.max(0, total - curPaid);
    setPaymentMode('MIXED');
    setPaymentLines(prev => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        amount: rem > 0 ? String(rem) : '',
        method,
        notes: '',
        bankName: '',
        checkNumber: '',
        dueDate: '',
        scannedImageUrl: '',
      }
    ]);
  };

  const removeCheckoutPaymentLine = (id: string) => {
    if (paymentLines.length <= 1) return;
    setPaymentLines(prev => prev.filter(l => l.id !== id));
  };

  const updateCheckoutPaymentLine = (id: string, field: keyof CheckoutPaymentLine, val: any) => {
    setPaymentLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  };

  const goToValidation = () => {
    if (paymentStatus === 'PAID') {
      if (paymentLines.length === 1 && (!paymentLines[0].amount || parseFloat(paymentLines[0].amount) === 0)) {
        setPaymentLines([{
          id: 'init-1',
          amount: String(total),
          method: paymentLines[0].method || 'CASH',
          notes: '',
          bankName: '',
          checkNumber: '',
          dueDate: '',
          scannedImageUrl: '',
        }]);
      }
    }
    setStep(3);
  };

  // ── Filtres catégories ──
  const filteredCats = useMemo(() =>
    selGenCat
      ? categories.filter((c: any) => c.generalCategoryId === selGenCat || c.generalCategoryId === selGenCat)
      : categories,
    [categories, selGenCat]
  );

  const [variantModal, setVariantModal] = useState<{ open: boolean; productName: string; variants: StockItem[]; categoryId: string }>({ open: false, productName: '', variants: [], categoryId: '' });
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [activeVariant, setActiveVariant] = useState<StockItem | null>(null);
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
    
    return Array.from(map.entries()).map(([name, rawVariants]) => {
      // Deduplicate variants that have the exact same color and size
      const dedupMap = new Map<string, StockItem>();
      rawVariants.forEach(v => {
        const vKey = `${v.color || ''}|${v.size || ''}`;
        if (!dedupMap.has(vKey)) {
          // Add a new property `originalItems` to keep track of the merged items
          dedupMap.set(vKey, { ...v, originalItems: [v] } as any);
        } else {
          const ex = dedupMap.get(vKey) as any;
          ex.currentQty += v.currentQty;
          ex.originalItems.push(v);
        }
      });
      const variants = Array.from(dedupMap.values());

      return {
        name,
        variants: variants.sort((a, b) => {
          const aKey = `${a.color || ''}${a.size || ''}`;
          const bKey = `${b.color || ''}${b.size || ''}`;
          return aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' });
        }),
        totalQty: variants.reduce((s, v) => s + v.currentQty, 0),
        categoryId: variants[0]?.categoryId || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
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

    const isFullCredit = paymentStatus === 'UNPAID';
    const validLines = isFullCredit ? [] : paymentLines.filter(l => (parseFloat(l.amount) || 0) > 0);
    const totalPaidCalculated = isFullCredit ? 0 : validLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const balanceRemaining = isFullCredit ? total : Math.max(0, total - totalPaidCalculated);

    if (!isFullCredit && totalPaidCalculated <= 0) {
      alert("⚠️ Veuillez saisir au moins un montant payé ou choisir 'À Crédit'.");
      return;
    }
    if (!isFullCredit && totalPaidCalculated > total + 0.01) {
      alert(`⚠️ Le montant saisi (${fmt$(totalPaidCalculated)} MAD) dépasse le montant de la vente (${fmt$(total)} MAD).`);
      return;
    }
    if (!isFullCredit && balanceRemaining > 0.01 && (anonymous || !selectedClient)) {
      alert("⚠️ Une vente avec reste à crédit nécessite de sélectionner un client identifié (non anonyme).");
      return;
    }

    // ── Vérification obligatoire du scan pour Chèque et LC ──
    if (!isFullCredit) {
      const missingScanLine = validLines.find(
        l => (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()
      );
      if (missingScanLine) {
        alert(
          `⚠️ Le scan ou la photo du chèque / de la LC est OBLIGATOIRE avant de valider la vente (${missingScanLine.method}).\n\n` +
          `Veuillez prendre une photo ou importer le scan du document.`
        );
        return;
      }
    }

    // ── Vérification du plafond de crédit ──
    const debtToAdd = isFullCredit ? total : balanceRemaining;
    if (debtToAdd > 0 && selectedClient) {
      if (selectedClient.creditBlocked) {
        alert(`⛔ Le crédit est bloqué pour le client "${selectedClient.name}". Veuillez contacter l'administrateur.`);
        return;
      }
      if (selectedClient.creditLimit != null && selectedClient.creditLimit > 0) {
        const currentDebt = invoices
          .filter(inv => inv.clientId === selectedClient.id && inv.status !== 'PAID' && inv.status !== 'CANCELLED')
          .reduce((sum, inv) => sum + (inv.remainingBalance ?? (inv.totalAfterDiscount - inv.paidAmount)), 0);
        const newDebt = currentDebt + debtToAdd;
        if (newDebt > selectedClient.creditLimit) {
          const confirmed = confirm(
            `⚠️ Attention : Cette vente porterait l'encours du client "${selectedClient.name}" à ${fmt$(newDebt)} MAD, ` +
            `dépassant le plafond de crédit de ${fmt$(selectedClient.creditLimit)} MAD.\n\n` +
            `Encours actuel : ${fmt$(currentDebt)} MAD\nNouveau crédit : ${fmt$(debtToAdd)} MAD\n\nContinuer quand même ?`
          );
          if (!confirmed) return;
        }
      }
    }

    setSaving(true);
    try {
      const today = finalDate;
      const items: OrderItem[] = [];
      const movements: any[] = [];

      for (const l of cart) {
        let remainingQty = l.qty;
        // The item might be a merged "virtual variant" with originalItems
        const subItems: StockItem[] = (l.item as any).originalItems || [l.item];

        for (const sub of subItems) {
          if (remainingQty <= 0) break;
          // For a specific store if sourceStore is set, otherwise overall currentQty
          const availableInSub = l.sourceStore && sub.qtyByStore 
            ? ((sub.qtyByStore as any)[l.sourceStore] || 0) 
            : sub.currentQty;
            
          if (availableInSub <= 0) continue;

          const take = Math.min(remainingQty, availableInSub);

          items.push({
            articleId: sub.articleId,
            productName: sub.productName,
            color: sub.color || '',
            size: sub.size || '',
            categoryId: sub.categoryId || '',
            unitOfMeasure: sub.unitOfMeasure || '',
            qty: take,
            unitPrice: l.unitPrice,
            totalPrice: take * l.unitPrice,
            storeId: l.sourceStore || undefined,
          });

          movements.push({
            articleId: sub.articleId,
            categoryId: sub.categoryId || '',
            productName: sub.productName,
            color: sub.color || null,
            size: sub.size || null,
            unitOfMeasure: sub.unitOfMeasure || '',
            type: 'OUT',
            reason: 'VENTE',
            quantity: take,
            date: today,
            notes: selectedClient ? `Vente client : ${selectedClient.name}` : 'Vente Comptoir',
            storeId: l.sourceStore || null,
          });

          remainingQty -= take;
        }

        // If for some reason we still have remainingQty (e.g. data mismatch), add it to the last sub-item
        if (remainingQty > 0 && subItems.length > 0) {
          const lastSub = subItems[subItems.length - 1];
          items.push({
            articleId: lastSub.articleId,
            productName: lastSub.productName,
            color: lastSub.color || '',
            size: lastSub.size || '',
            categoryId: lastSub.categoryId || '',
            unitOfMeasure: lastSub.unitOfMeasure || '',
            qty: remainingQty,
            unitPrice: l.unitPrice,
            totalPrice: remainingQty * l.unitPrice,
            storeId: l.sourceStore || undefined,
          });
          movements.push({
            articleId: lastSub.articleId,
            categoryId: lastSub.categoryId || '',
            productName: lastSub.productName,
            color: lastSub.color || null,
            size: lastSub.size || null,
            unitOfMeasure: lastSub.unitOfMeasure || '',
            type: 'OUT',
            reason: 'VENTE',
            quantity: remainingQty,
            date: today,
            notes: selectedClient ? `Vente client : ${selectedClient.name}` : 'Vente Comptoir',
            storeId: l.sourceStore || selectedStoreId || null,
          });
        }
      }

      const hasPaperEffects = validLines.some(l => 
        l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN'
      );

      const initialPayments = isFullCredit ? [] : validLines.map(l => ({
        amount: parseFloat(l.amount),
        paymentDate: today,
        date: today,
        method: l.method,
        status: (l.method === 'CASH' || l.method === 'VIREMENT') ? ('CONFIRMED' as const) : ('PENDING' as const),
        bankName: l.bankName?.trim() || undefined,
        checkNumber: l.checkNumber?.trim() || undefined,
        dueDate: l.dueDate || undefined,
        notes: l.notes?.trim() || undefined,
        scannedImageUrl: l.scannedImageUrl?.trim() || undefined,
        clientName: selectedClient?.name || (anonymous ? 'Anonyme' : ''),
        clientId: selectedClient?.id || undefined,
        cashingCompany: l.cashingCompany || undefined,
        depositBank: 'Attijariwafa Bank',
        storeId: selectedStoreId,
      }));

      let invStatus: any = 'PAID';
      if (isFullCredit || totalPaidCalculated <= 0) {
        invStatus = 'UNPAID';
      } else if (hasPaperEffects) {
        // Un chèque ou une LC a été donné : le paiement est EN ATTENTE d'encaissement, PAS PAYÉ !
        invStatus = 'PENDING';
      } else if (balanceRemaining > 0.01) {
        invStatus = 'PARTIAL';
      } else {
        invStatus = 'PAID';
      }

      const invMethod = isFullCredit
        ? undefined
        : validLines.length === 1
          ? validLines[0].method
          : 'MIXTE';

      const invoiceData: any = {
        clientName: selectedClient?.name || (anonymous ? 'Anonyme' : ''),
        items,
        totalAmount: subTotal,
        discount,
        totalAfterDiscount: total,
        paidAmount: totalPaidCalculated,
        remainingBalance: balanceRemaining,
        status: invStatus,
        paymentMethod: invMethod,
        date: today,
        storeId: selectedStoreId,
        notes,
      };
      if (selectedClient?.id) invoiceData.clientId = selectedClient.id;

      await onCreateInvoice(invoiceData, movements, initialPayments);
      setDone(true);
    } finally { setSaving(false); }
  };

  const reset = () => {
    setStep(0); setCart([]); setSelectedClient(null); setAnonymous(false);
    setDiscount(0); setNotes(''); setDone(false); setFinalDate(new Date().toISOString().split('T')[0]);
    setSelGenCat(null); setSelCat(null); setProdSearch('');
    setPaymentStatus('PAID');
    setPaymentMode('CASH');
    setPaymentLines([{ id: 'init-1', amount: '', method: 'CASH', notes: '', bankName: '', checkNumber: '', dueDate: '' }]);
  };

  const printBonDeCommande = useCallback(() => {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    const bcNum = `BC-${Date.now().toString(36).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const isFullCredit = paymentStatus === 'UNPAID';
    const validLines = isFullCredit ? [] : paymentLines.filter(l => (parseFloat(l.amount) || 0) > 0);
    const totalPaidCalculated = isFullCredit ? 0 : validLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const balanceRemaining = isFullCredit ? total : Math.max(0, total - totalPaidCalculated);

    const paymentDetailsText = isFullCredit
      ? 'À Crédit (Compte Client)'
      : validLines.length === 0
        ? 'Payé comptant'
        : validLines.map(l => {
            const mLabel = l.method === 'CASH' ? 'Espèces' :
              l.method === 'CHEQUE' ? `Chèque ${l.checkNumber ? 'N° ' + l.checkNumber : ''}` :
              (l.method === 'LC' || l.method === 'LCN' || l.method === 'EFFET') ? `LC ${l.checkNumber ? 'N° ' + l.checkNumber : ''}` :
              l.method === 'VIREMENT' ? 'Virement' : l.method;
            const extra = [l.bankName, l.dueDate ? `Éch: ${l.dueDate}` : ''].filter(Boolean).join(' - ');
            return `${fmt$(parseFloat(l.amount))} MAD (${mLabel}${extra ? ' - ' + extra : ''})`;
          }).join(' + ');

    win.document.write(`<!DOCTYPE html><html><head><title>Bon de Commande ${bcNum}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;color:#1c1917}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1c1917}
      .logo{font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-1px}
      .logo span{color:#7c3aed}
      .doc-type{text-align:right}
      .doc-type h2{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#7c3aed}
      .doc-type p{font-size:11px;color:#78716c;margin-top:4px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
      .info-box{background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px}
      .info-box h4{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#a8a29e;margin-bottom:8px}
      .info-box p{font-size:13px;font-weight:700;color:#1c1917}
      .sub{font-size:11px;color:#78716c;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead th{background:#1c1917;color:white;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;padding:12px 16px;text-align:left}
      thead th:nth-child(3),thead th:nth-child(4),thead th:last-child{text-align:right}
      tbody td{padding:12px 16px;border-bottom:1px solid #f5f5f4;font-size:12px;font-weight:600}
      tbody td:nth-child(3),tbody td:nth-child(4),tbody td:last-child{text-align:right}
      .variant{font-size:10px;color:#78716c;font-weight:700}
      .totals{margin-left:auto;width:320px}
      .totals .row{display:flex;justify-content:space-between;padding:6px 0;font-size:12px;font-weight:600;color:#57534e}
      .totals .total{border-top:3px solid #1c1917;padding-top:12px;margin-top:8px;font-size:18px;font-weight:900;color:#1c1917}
      .no-price{color:#a8a29e;font-style:italic}
      .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e7e5e4;text-align:center;font-size:10px;color:#a8a29e}
      @media print{body{padding:20px}}
    </style></head><body>
    <div class="header">
      <div class="logo"><img src="${window.location.origin}/logo_lebtex.png" alt="LEBTEX" style="height:80px;display:block" /></div>
      <div class="doc-type"><h2>Bon de Commande</h2><p>${bcNum} &middot; ${dateStr}</p></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><h4>Client</h4><p>${selectedClient?.name || 'Comptoir (Anonyme)'}</p>${selectedClient?.phone ? `<p class="sub">${selectedClient.phone}</p>` : ''}</div>
      <div class="info-box"><h4>Règlement</h4><p>${paymentDetailsText}</p><p class="sub">Date : ${dateStr}</p></div>
    </div>
    <table><thead><tr><th>Désignation</th><th>Variante</th><th>Qté</th><th>P.U. (MAD)</th><th>Total (MAD)</th></tr></thead>
    <tbody>${cart.map(({ item, qty, unitPrice }) => `<tr><td>${item.productName}</td><td class="variant">${[item.color, item.size ? 'T.' + item.size : ''].filter(Boolean).join(' &middot; ') || '—'}</td><td style="text-align:right">${qty}</td><td style="text-align:right">${unitPrice > 0 ? fmt$(unitPrice) : '<span class="no-price">N/D</span>'}</td><td style="text-align:right;font-weight:900">${unitPrice > 0 ? fmt$(qty * unitPrice) : '<span class="no-price">—</span>'}</td></tr>`).join('')}</tbody></table>
    <div class="totals">
      <div class="row"><span>Sous-total</span><span>${fmt$(subTotal)}</span></div>
      ${discount > 0 ? `<div class="row" style="color:#16a34a"><span>Remise ${discount}%</span><span>-${fmt$(discountAmt)}</span></div>` : ''}
      <div class="row total"><span>TOTAL</span><span>${fmt$(total)}</span></div>
      ${totalPaidCalculated > 0 ? `<div class="row" style="color:#16a34a;font-weight:700"><span>Montant Payé</span><span>${fmt$(totalPaidCalculated)}</span></div>` : ''}
      ${balanceRemaining > 0.01 ? `<div class="row" style="color:#d97706;font-weight:700"><span>Reste dû</span><span>${fmt$(balanceRemaining)}</span></div>` : ''}
    </div>
    ${notes ? `<div style="margin-top:24px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px"><h4 style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#a8a29e;margin-bottom:6px">Notes</h4><p style="font-size:12px;font-weight:600">${notes}</p></div>` : ''}
    <div class="footer"><p>Ce document est un bon de commande et ne constitue pas une facture officielle.</p><p style="margin-top:4px">LEBTEX</p></div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }, [cart, selectedClient, paymentStatus, paymentLines, subTotal, discount, discountAmt, total, notes]);

  // ── Succès ──
  if (done) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-in fade-in">
      <div className="w-24 h-24 rounded-3xl bg-emerald-100 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-stone-900">
          Bon de commande enregistré !
        </h2>
        <p className="text-stone-400 font-bold text-sm">
          Le stock a été mis à jour automatiquement.
          {' '}Total : <strong className="text-stone-700">{fmt$(total)}</strong>
        </p>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <Button onClick={printBonDeCommande} className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs px-8 h-11 rounded-2xl gap-2">
          <Printer className="w-4 h-4" /> Imprimer le bon
        </Button>
        <Button onClick={reset} className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs px-8 h-11 rounded-2xl">
          Nouvelle vente
        </Button>
        <Button variant="outline" onClick={() => onNavigate('invoices')}
          className="font-black uppercase text-xs px-6 h-11 rounded-2xl">
          Voir les bons
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Sélecteur de Magasin pour Admin ── */}
      {userRole === 'ADMIN' && stores && stores.length > 0 && (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Magasin de vente (Caisse)</p>
              <p className="text-sm font-black text-stone-800">
                {stores.find(s => s.id === selectedStoreId)?.name || selectedStoreId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-stone-500">Choisir le magasin :</span>
            <select
              value={selectedStoreId}
              onChange={(e) => onStoreChange && onStoreChange(e.target.value)}
              className="h-10 px-3 rounded-xl border border-stone-200 bg-stone-50 font-bold text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
            >
              {stores.filter(s => s.type === 'STORE').map(s => (
                <option key={s.id} value={s.id}>🏪 {s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {/* Big Button Vente Comptoir */}
             <button onClick={() => { setAnonymous(true); setSelectedClient(null); setStep(1); }}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  anonymous ? 'border-stone-700 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:border-stone-400'
                }`}>
                <p className="font-black text-lg uppercase tracking-tighter">🏪 Vente Comptoir</p>
                <p className={`text-[10px] font-bold mt-1 ${anonymous ? 'opacity-60' : 'text-stone-400'}`}>Passer directement aux produits</p>
             </button>

             {/* Big Button Vente Client */}
             <button onClick={() => { setAnonymous(false); }}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  !anonymous ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-stone-200 bg-white hover:border-violet-200'
                }`}>
                <p className="font-black text-lg uppercase tracking-tighter">👤 Vente Client</p>
                <p className={`text-[10px] font-bold mt-1 ${!anonymous ? 'text-violet-600/70' : 'text-stone-400'}`}>Rechercher ou créer un dossier client</p>
             </button>
          </div>

          {!anonymous && (
            <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-4 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Dossier client</h3>
                <button onClick={() => setShowNewClient(v => !v)}
                  className="flex items-center gap-1.5 text-[9px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-wider bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-200 transition-colors">
                  <UserPlus className="w-3 h-3" /> Nouveau Client
                </button>
              </div>

              {showNewClient ? (
                <div className="bg-violet-50 rounded-2xl border border-violet-100 p-5 space-y-3">
                  {[
                    { key: 'name', label: 'Nom *', placeholder: 'Ex: Mohamed Alami' },
                    { key: 'phone', label: 'Téléphone', placeholder: '+212 6...' },
                    { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
                      <Input placeholder={placeholder} value={(newClientForm as any)[key]}
                        onChange={e => setNewClientForm(f => ({ ...f, [key]: e.target.value }))}
                        className="h-9 rounded-xl border-white bg-white text-sm font-bold" />
                    </div>
                  ))}
                  <Button onClick={handleCreateClient} disabled={!newClientForm.name.trim() || creatingClient}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-10 rounded-xl mt-2">
                    {creatingClient ? 'Création...' : 'Créer et sélectionner'}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                    <Input placeholder="Chercher un client existant..." value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      className="pl-9 h-11 rounded-xl border-stone-200 text-sm font-bold bg-stone-50 focus:bg-white transition-colors" />
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {filteredClients.length === 0 && (
                      <p className="text-center text-stone-400 text-xs font-bold py-6">Aucun client trouvé</p>
                    )}
                    {filteredClients.map(c => (
                      <button key={c.id} onClick={() => setSelectedClient(c)}
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
                          {selectedClient?.id === c.id && <CheckCircle2 className="w-5 h-5 text-violet-500 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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

          {/* ── Search-first product selection ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-3">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  placeholder="Tapez le nom du produit..."
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  className="pl-12 h-14 rounded-2xl border-stone-200 text-base font-bold shadow-sm bg-white"
                  autoFocus
                />
                {prodSearch && (
                  <button onClick={() => setProdSearch('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
                    <X className="w-3.5 h-3.5 text-stone-500" />
                  </button>
                )}
              </div>

              {/* Product list */}
              <div className="bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
                {prodSearch.length < 2 ? (
                  <div className="p-10 text-center">
                    <Search className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-400 text-sm font-bold">Tapez au moins 2 caractères pour rechercher</p>
                  </div>
                ) : groupedProducts.length === 0 ? (
                  <div className="p-10 text-center">
                    <ShoppingBag className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-400 text-sm font-bold">Aucun produit trouvé pour « {prodSearch} »</p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50 max-h-[500px] overflow-y-auto">
                    {groupedProducts.map(group => {
                      const cartQtyTotal = cart.filter(l => l.item.productName === group.name).reduce((s, l) => s + l.qty, 0);
                      return (
                        <button type="button" key={group.name}
                          onClick={() => {
                            const sizes = Array.from(new Set(group.variants.map(v => v.size).filter(Boolean))) as string[];
                            setActiveSize(sizes.length > 0 ? sizes[0] : null);
                            setActiveVariant(null);
                            setVariantModal({ open: true, productName: group.name, variants: group.variants, categoryId: group.categoryId });
                          }}
                          className="w-full text-left px-5 py-4 hover:bg-violet-50/50 transition-colors flex items-center gap-4 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">{group.name}</p>
                            <p className="text-[10px] font-bold text-stone-400 mt-0.5">
                              {group.categoryId} · {group.variants.length} couleur{group.variants.length > 1 ? 's' : ''} · Stock: {group.totalQty}
                            </p>
                          </div>
                          {cartQtyTotal > 0 && (
                            <span className="shrink-0 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg">
                              {cartQtyTotal} au panier
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-violet-500 shrink-0 transition-colors" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Mini-panier (desktop) ── */}
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
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-stone-50 max-h-[400px] overflow-y-auto">
                      {cart.map(({ item, qty, unitPrice }) => (
                        <div key={item.articleId} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-stone-900 uppercase truncate">{item.productName}</p>
                            <p className="text-[10px] font-black text-violet-600">{qty} × {fmt$(unitPrice)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-stone-900">{fmt$(qty * unitPrice)}</p>
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
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em]">Étape 3</p>
              <h2 className="text-xl font-black text-stone-900 uppercase tracking-tight mt-0.5">Récapitulatif</h2>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-stone-900">{cartCount}</p>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">article{cartCount > 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Articles */}
          <div className="space-y-3">
            {cart.map(({ item, qty, unitPrice }, idx) => (
              <div key={item.articleId} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="p-4 flex items-start gap-4">
                  {/* Numéro */}
                  <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-500 text-xs font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>

                  {/* Infos produit */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">{item.productName}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {item.color && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-stone-50 text-stone-600 px-2 py-1 rounded-lg border border-stone-100">
                          <div className="w-3 h-3 rounded-full shrink-0 border border-stone-200" style={{ backgroundColor: getColorCSS(item.color) }} />
                          {item.color}
                        </span>
                      )}
                      {item.size && (
                        <span className="text-[10px] font-bold bg-stone-50 text-stone-600 px-2 py-1 rounded-lg border border-stone-100">T. {item.size}</span>
                      )}
                      <span className="text-[10px] text-stone-300 font-bold">{item.categoryId}</span>
                    </div>
                  </div>

                  {/* Supprimer */}
                  <button onClick={() => removeFromCart(item.articleId)}
                    className="w-8 h-8 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quantité + Prix */}
                <div className="px-4 pb-4 flex items-center gap-4">
                  <div className="flex items-center gap-1 bg-stone-50 rounded-xl p-1 border border-stone-100">
                    <button onClick={() => qty > 1 && updateCart(item.articleId, 'qty', qty - 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-sm">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-black text-stone-900">{qty}</span>
                    <button onClick={() => qty < item.currentQty && updateCart(item.articleId, 'qty', qty + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-sm">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest shrink-0">×</span>
                    <Input type="number" min={0} step="any" value={unitPrice || ''}
                      onChange={e => updateCart(item.articleId, 'unitPrice', Number(e.target.value))}
                      placeholder="Prix (MAD)"
                      className="h-9 flex-1 max-w-[140px] text-sm font-black rounded-xl border-stone-200 placeholder:text-stone-300 placeholder:font-normal" />
                    <span className="text-[9px] font-bold text-stone-400 shrink-0">MAD</span>
                  </div>

                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className="text-sm font-black text-stone-900">{unitPrice > 0 ? fmt$(qty * unitPrice) : '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totaux */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest shrink-0 flex items-center gap-1">
                <Percent className="w-3 h-3" /> Remise
              </Label>
              <Input type="number" min={0} max={100} value={discount}
                onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="h-9 w-20 text-sm font-black rounded-xl border-stone-200" />
              <span className="text-[10px] text-stone-400 font-bold">%</span>
              {discount > 0 && <span className="text-[10px] text-emerald-600 font-bold">— {fmt$(discountAmt)} économisé</span>}
            </div>

            <div className="border-t border-stone-100 pt-4 space-y-2">
              <div className="flex justify-between text-xs font-bold text-stone-400">
                <span>Sous-total ({cartCount} article{cartCount > 1 ? 's' : ''})</span>
                <span>{fmt$(subTotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600">
                  <span>Remise {discount}%</span>
                  <span>-{fmt$(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>Total</span>
                <span>{fmt$(total)}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-stone-100">
              <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Notes</Label>
              <Input placeholder="Référence, instructions..." value={notes}
                onChange={e => setNotes(e.target.value)}
                className="h-10 rounded-xl border-stone-200 font-bold text-sm" />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Ajouter des produits
            </Button>
            <Button onClick={goToValidation}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2">
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
              {selectedClient?.name || 'Comptoir'} · {cart.length} produit{cart.length > 1 ? 's' : ''} · Total : {fmt$(total)} MAD
            </p>
          </div>

          {/* Choix type de règlement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setPaymentStatus('PAID');
                if (paymentLines.length === 1 && (!paymentLines[0].amount || parseFloat(paymentLines[0].amount) === 0)) {
                  setPaymentLines([{
                    id: 'init-1',
                    amount: String(total),
                    method: paymentMode === 'MIXED' ? 'CASH' : paymentMode,
                    notes: '',
                    bankName: '',
                    checkNumber: '',
                    dueDate: '',
                  }]);
                }
              }}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                paymentStatus === 'PAID' ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg' : 'border-stone-200 bg-white hover:border-emerald-300'
              }`}>
              <CheckCircle2 className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-black text-lg uppercase tracking-tighter">Règlement (Comptant / Chèque / LC)</p>
              <p className={`text-[10px] font-bold mt-1 ${paymentStatus === 'PAID' ? 'text-emerald-100' : 'text-stone-400'}`}>
                Espèces encaissées, ou Effets (Chèque / LC) enregistrés en attente d'encaissement.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPaymentStatus('UNPAID')}
              disabled={anonymous}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                paymentStatus === 'UNPAID' ? 'border-amber-600 bg-amber-600 text-white shadow-lg' : 'border-stone-200 bg-white hover:border-amber-300'
              } ${anonymous ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <ClipboardList className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-black text-lg uppercase tracking-tighter">À Crédit (100% Compte Client)</p>
              <p className={`text-[10px] font-bold mt-1 ${paymentStatus === 'UNPAID' ? 'text-amber-100' : 'text-stone-400'}`}>
                {anonymous ? "Sélectionnez un client à l'étape 1" : "Ajouté intégralement à la dette du client. Le stock est décompté."}
              </p>
            </button>
          </div>

          {/* Si règlement immédiat / partiel : modes de paiement */}
          {paymentStatus === 'PAID' && (
            <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div>
                  <Label className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Mode de paiement
                  </Label>
                  <p className="text-[10px] text-stone-400 font-bold">
                    Choisissez le mode de paiement ou combinez plusieurs modes
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickPaymentMethod('CASH')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      paymentMode === 'CASH'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Espèces
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPaymentMethod('CHEQUE')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      paymentMode === 'CHEQUE'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    Chèque
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPaymentMethod('LC')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      paymentMode === 'LC'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    LC / Effet
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPaymentMethod('VIREMENT')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      paymentMode === 'VIREMENT'
                        ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    Virement
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPaymentMethod('MIXED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      paymentMode === 'MIXED'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Mixte
                  </button>
                </div>
              </div>

              {/* Datalist pour suggestions banques marocaines */}
              <datalist id="moroccan-banks-sale">
                {MOROCCAN_BANKS.map(b => (
                  <option key={b} value={b} />
                ))}
              </datalist>

              {/* Lignes de paiement */}
              <div className="space-y-3">
                {paymentLines.map((line) => {
                  const isPaper = line.method === 'CHEQUE' || line.method === 'LC' || line.method === 'LCN' || line.method === 'EFFET';
                  const isTransfer = line.method === 'VIREMENT';

                  return (
                    <div key={line.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="w-full sm:w-56">
                          <Select
                            value={line.method}
                            onValueChange={v => updateCheckoutPaymentLine(line.id, 'method', v as PaymentMethod)}
                          >
                            <SelectTrigger className="h-11 bg-white font-black text-xs rounded-xl border-stone-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">💵 Espèces (Cash)</SelectItem>
                              <SelectItem value="CHEQUE">📑 Chèque</SelectItem>
                              <SelectItem value="LC">📜 LC (Lettre de Change)</SelectItem>
                              <SelectItem value="VIREMENT">🏦 Virement</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex-1 relative">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="Montant (MAD)"
                            value={line.amount}
                            onChange={e => updateCheckoutPaymentLine(line.id, 'amount', e.target.value)}
                            className="h-11 bg-white font-black text-base pr-14 rounded-xl border-stone-200"
                          />
                          <span className="absolute right-3 top-3 text-xs font-black text-stone-400">MAD</span>
                        </div>

                        {paymentLines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCheckoutPaymentLine(line.id)}
                            className="h-11 w-11 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {/* Détails Chèque ou LC */}
                      {isPaper && (
                        <div className="space-y-3 pt-2 border-t border-stone-200/60">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[9px] font-black uppercase text-stone-500">Banque Tirée</Label>
                              <Input
                                list="moroccan-banks-sale"
                                placeholder="Ex: BCP, CIH..."
                                value={line.bankName}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'bankName', e.target.value)}
                                className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-black uppercase text-stone-500">
                                {line.method === 'CHEQUE' ? 'N° de Chèque' : 'N° LC / Effet'}
                              </Label>
                              <Input
                                placeholder="N° de la pièce"
                                value={line.checkNumber}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'checkNumber', e.target.value)}
                                className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-black uppercase text-stone-500">Date d'échéance</Label>
                              <Input
                                type="date"
                                value={line.dueDate}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'dueDate', e.target.value)}
                                className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-black uppercase text-stone-500">Société Attijari</Label>
                              <Select
                                value={line.cashingCompany || 'PENDING'}
                                onValueChange={v => updateCheckoutPaymentLine(line.id, 'cashingCompany', v === 'PENDING' ? undefined : v as CashingCompany)}
                              >
                                <SelectTrigger className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PENDING">⏳ Arbitrer à J-7</SelectItem>
                                  <SelectItem value="LEBTEX">🏢 LEBTEX</SelectItem>
                                  <SelectItem value="ROBE IN BOX">👗 ROBE IN BOX</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Scan / Photo obligatoire du Chèque / LC */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 text-amber-800">
                                <Camera className="w-3.5 h-3.5 text-amber-600" />
                                <span>Scan / Photo du {line.method === 'CHEQUE' ? 'Chèque' : 'la LC'}</span>
                                <span className="text-red-500 font-black">* Obligatoire</span>
                              </Label>
                              {!line.scannedImageUrl && (
                                <span className="text-[8px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                  Scan requis avant validation
                                </span>
                              )}
                            </div>

                            <div className={`relative border-2 border-dashed rounded-xl p-3 transition-colors ${
                              line.scannedImageUrl
                                ? 'border-emerald-400 bg-emerald-50/40'
                                : 'border-amber-400 bg-amber-50/50 hover:bg-amber-100/40'
                            }`}>
                              {line.scannedImageUrl ? (
                                <div className="flex items-center gap-3 w-full">
                                  <img
                                    src={line.scannedImageUrl}
                                    alt="Scan Chèque / LC"
                                    className="w-16 h-12 rounded-lg object-contain bg-white border border-emerald-200 shadow-sm"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 text-emerald-700 font-black text-xs">
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>Document scanné avec succès</span>
                                    </div>
                                    <p className="text-[10px] text-stone-500 font-bold">Image jointe au paiement</p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateCheckoutPaymentLine(line.id, 'scannedImageUrl', '')}
                                    className="h-8 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 font-black rounded-lg"
                                  >
                                    Supprimer / Reprendre
                                  </Button>
                                </div>
                              ) : (
                                <label className="flex flex-col sm:flex-row items-center justify-center gap-3 py-2 cursor-pointer w-full text-stone-600 hover:text-stone-900 group">
                                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 group-hover:bg-amber-200 flex items-center justify-center transition-colors shrink-0">
                                    <Camera className="w-5 h-5" />
                                  </div>
                                  <div className="text-center sm:text-left">
                                    <span className="text-xs font-black text-stone-900 group-hover:text-amber-900">
                                      Prendre une photo ou importer le scan du chèque / de la LC
                                    </span>
                                    <p className="text-[10px] text-stone-500 font-medium">
                                      Appareil photo mobile/tablette ou fichier image (JPG, PNG)
                                    </p>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => updateCheckoutPaymentLine(line.id, 'scannedImageUrl', reader.result as string);
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Détails Virement */}
                      {isTransfer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-200/60">
                          <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-stone-500">Banque</Label>
                            <Input
                              list="moroccan-banks-sale"
                              placeholder="Ex: CIH, BMCE..."
                              value={line.bankName}
                              onChange={e => updateCheckoutPaymentLine(line.id, 'bankName', e.target.value)}
                              className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-stone-500">Réf. Virement</Label>
                            <Input
                              placeholder="N° référence ou transaction"
                              value={line.checkNumber}
                              onChange={e => updateCheckoutPaymentLine(line.id, 'checkNumber', e.target.value)}
                              className="h-9 bg-white text-xs font-bold rounded-lg border-stone-200"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bouton ajouter mode si split / multi-mode */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCheckoutPaymentLine('CASH')}
                  className="text-xs font-black uppercase rounded-xl border-dashed border-stone-300 gap-1.5 h-9"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un mode de paiement (Mixte)
                </Button>

                {/* Statut de paiement en direct */}
                <div className="flex items-center gap-2">
                  {Math.abs(remainingBalance) < 0.01 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase bg-emerald-100 text-emerald-800">
                      ✓ Réglé en totalité ({fmt$(total)} MAD)
                    </span>
                  )}
                  {remainingBalance > 0.01 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase bg-amber-100 text-amber-800">
                      Acompte : {fmt$(totalPaid)} MAD · Reste à crédit : {fmt$(remainingBalance)} MAD
                    </span>
                  )}
                  {isOverpaid && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase bg-red-100 text-red-800">
                      Attention : Total saisi ({fmt$(totalPaid)} MAD) dépasse la vente
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Champs date & Récapitulatif */}
          <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date de la vente</Label>
                <Input type="date" value={finalDate} onChange={e => setFinalDate(e.target.value)}
                  className="h-11 rounded-xl border-stone-200 font-bold max-w-sm" />
              </div>
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
                <span>Total de la vente</span>
                <span className={paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}>{fmt$(total)}</span>
              </div>
              {paymentStatus === 'PAID' && totalPaid > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-700">
                  <span>Montant réglé immédiatement</span>
                  <span>{fmt$(totalPaid)}</span>
                </div>
              )}
              {paymentStatus === 'PAID' && remainingBalance > 0.01 && (
                <div className="flex justify-between text-xs font-bold text-amber-700">
                  <span>Reste à reporter au crédit du client</span>
                  <span>{fmt$(remainingBalance)}</span>
                </div>
              )}
            </div>
          </div>
          {paymentStatus === 'PAID' && paymentLines.some(l => (parseFloat(l.amount) || 0) > 0 && (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()) && (
            <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs font-bold shadow-sm">
              <Camera className="w-4 h-4 text-amber-600 shrink-0" />
              <span>⚠️ Le scan ou la photo du chèque / de la LC est obligatoire pour pouvoir valider la vente. Veuillez joindre la photo ci-dessus.</span>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Modifier le panier
            </Button>
            <Button onClick={handleFinalize} disabled={saving || (paymentStatus === 'PAID' && paymentLines.some(l => (parseFloat(l.amount) || 0) > 0 && (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()))}
              className={`font-black uppercase text-xs h-12 px-10 rounded-2xl gap-2 shadow-lg transition-all ${
                paymentStatus === 'PAID'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30'
                  : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/30'
              }`}>
              {saving ? 'Enregistrement...' : (
                <>Valider la Vente <CheckCircle2 className="w-4 h-4" /></>
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
            <Button onClick={addToCart} disabled={addModal.qty <= 0 || (!!addModal.item?.qtyByStore && !addModal.sourceStore)}
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
          
          {(() => {
            const sizes = Array.from(new Set(variantModal.variants.map(v => v.size).filter(Boolean))) as string[];
            if (sizes.length > 0) {
              return (
                <div className="bg-white px-5 py-3 border-b border-stone-100">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-2">Choisir la taille</p>
                  <div className="flex gap-2 flex-wrap">
                    {sizes.map(size => {
                      const sizeQty = variantModal.variants.filter(v => v.size === size).reduce((s, v) => s + v.currentQty, 0);
                      return (
                        <button key={size} onClick={() => setActiveSize(size)}
                          className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                            activeSize === size 
                              ? 'bg-stone-900 text-white shadow-lg' 
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}>
                          {size}
                          <span className={`ml-1.5 text-[10px] font-bold ${activeSize === size ? 'text-stone-400' : 'text-stone-400'}`}>({sizeQty})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {activeVariant ? (
            <div className="p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
              {activeVariant.color && (
                <div className="w-16 h-16 rounded-full border-4 border-white shadow-xl mb-4" style={{ backgroundColor: getColorCSS(activeVariant.color) }} />
              )}
              <h3 className="text-2xl font-black text-stone-900 uppercase">{activeVariant.color || activeVariant.productName}</h3>
              <p className="text-sm font-bold text-stone-500 uppercase tracking-widest mt-1 mb-8">
                {activeVariant.size ? `Taille ${activeVariant.size} • ` : ''}{activeVariant.currentQty} en stock
              </p>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setVariantQtyInCart(activeVariant, (cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || 0) - 1, activeVariant.sellingPrice)}
                  className="w-16 h-16 rounded-2xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center text-2xl font-black shadow-sm transition-colors">
                  <Minus className="w-6 h-6" />
                </button>
                <input
                  type="number"
                  min="0"
                  max={activeVariant.currentQty}
                  value={cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || ''}
                  placeholder="0"
                  autoFocus
                  onChange={e => setVariantQtyInCart(activeVariant, parseInt(e.target.value) || 0, activeVariant.sellingPrice)}
                  className="w-32 h-20 text-center text-4xl font-black rounded-3xl border-2 border-stone-200 focus:border-stone-900 focus:outline-none shadow-sm"
                />
                <button 
                  onClick={() => setVariantQtyInCart(activeVariant, (cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || 0) + 1, activeVariant.sellingPrice)}
                  className="w-16 h-16 rounded-2xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center text-2xl font-black shadow-sm transition-colors">
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <Button onClick={() => setActiveVariant(null)} className="mt-8 bg-stone-900 hover:bg-stone-800 text-white h-12 px-8 rounded-xl font-black uppercase text-xs">
                Valider la quantité
              </Button>
            </div>
          ) : (
            <div className="p-5 max-h-[50vh] overflow-y-auto">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3">
                {activeSize ? `Couleurs pour la taille ${activeSize}` : 'Variantes disponibles'}
              </p>
              
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Couleur</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-stone-500 text-center">En Stock</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-stone-500 text-right w-32">Panier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {variantModal.variants
                      .filter(v => activeSize ? v.size === activeSize : true)
                      .sort((a, b) => (a.color || a.productName).localeCompare(b.color || b.productName))
                      .map((v) => {
                        const inCartLine = cart.find(l => l.item.articleId === v.articleId);
                        const isEmpty = v.currentQty === 0;
  
                        return (
                          <tr key={v.articleId} 
                            onClick={() => !isEmpty && setActiveVariant(v)}
                            className={`transition-colors cursor-pointer group ${
                            isEmpty ? 'opacity-50 bg-stone-50 cursor-not-allowed' : inCartLine ? 'bg-emerald-50/30 hover:bg-emerald-50' : 'bg-white hover:bg-stone-50'
                          }`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {v.color && (
                                  <div className="w-5 h-5 rounded-full shrink-0 border border-stone-200 shadow-sm" style={{ backgroundColor: getColorCSS(v.color) }} />
                                )}
                                <p className="text-sm font-black text-stone-900 uppercase truncate group-hover:text-violet-700 transition-colors">
                                  {v.color || v.productName}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-black px-2 py-1 rounded-md ${
                                isEmpty ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-700'
                              }`}>
                                {isEmpty ? '0' : v.currentQty}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {inCartLine ? (
                                <span className="text-sm font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-lg">{inCartLine.qty} sél.</span>
                              ) : (
                                <span className="text-xs font-black text-stone-400 group-hover:text-violet-600 uppercase flex items-center justify-end gap-1">
                                  Choisir <ChevronRight className="w-3 h-3" />
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
            <p className="text-xs font-bold text-stone-400">
              {cart.filter(l => variantModal.variants.some(v => v.articleId === l.item.articleId)).reduce((s, l) => s + l.qty, 0)} article(s) sélectionné(s)
            </p>
            <Button onClick={() => setVariantModal({ open: false, productName: '', variants: [], categoryId: '' })}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs h-11 px-8 rounded-xl shadow-md">
              Confirmer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
