"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { valeurImprimable } from '@/lib/specification-produit';
import {
  Users, ShoppingBag, ClipboardList, CheckCircle2,
  Search, Plus, Minus, X, ChevronRight, ChevronLeft,
  UserPlus, Tag, Percent, ArrowRight, Phone, Mail, Printer,
  Banknote, Landmark, FileCheck, Layers, Trash2, CreditCard,
  Camera, Image as ImageIcon, Clock, Building2, FileText, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Client, SaleOrder, Invoice, OrderItem, StockItem, PaymentMethod, CashingCompany } from '@/lib/types';
import { getLocalDateString } from '@/lib/constants';
import { cleanUndefined } from '@/lib/utils';
import { exportSaleOrderPDF } from '@/lib/pdf-export-reports';
import { stockItemVariant } from '@/lib/warehouse-locations';
import { uniteDecimale, pasDeSaisie, libelleUnite } from '@/lib/unites-pole';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { useOnlineStatus } from '@/hooks/use-online-status';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';

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

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Une ligne vendue en dessous de ce que la marchandise a coûté.
 *
 * Le prix de revient n'a rien à faire dans /stock : il ne s'affiche nulle part, ni en clair, ni
 * dans une infobulle, ni dans un récapitulatif. Il ne sert qu'ici, à répondre par oui ou par non.
 * Ce que l'écran en dit se limite à « Vente à perte ».
 */
const venteAPerte = (item: StockItem, unitPrice: number): boolean => {
  const revient = Number(item.purchasePricePerUnit) || 0;
  return revient > 0 && unitPrice < revient;
};

// ── Quantités selon l'unité ──
// Le TAFFETA se vend au mètre, et au mètre près ou au centimètre : 2,5 m est une vente normale.
// Ce qui se compte à la pièce reste en entiers.

/** Arrondi au millième, comme le calcul du stock : 1,2 m − 1 ne laisse pas 0,19999999999999996 m. */
const arrondiQte = (q: number) => Math.round(q * 1000) / 1000;

/** Une quantité tapée, ramenée à ce que son unité permet (2,55 m ; 2,5 pièces → 2, comme parseInt). */
const quantiteSaisie = (brut: string, unite?: string | null): number => {
  const q = parseFloat(String(brut).replace(',', '.'));
  if (!Number.isFinite(q)) return 0;
  return uniteDecimale(unite) ? Math.round(q * 100) / 100 : Math.trunc(q);
};

/** L'unité à afficher à côté d'une quantité — rien pour le « unité » par défaut. */
const uniteCourte = (unite?: string | null): string => {
  const u = (unite || '').trim();
  return u && u.toLowerCase() !== 'unité' ? u : '';
};

/** « 2,5 m », « 3 rolls » — ou le nombre seul quand l'unité est le « unité » par défaut. */
const qteAvecUnite = (q: number, unite?: string | null): string => {
  const u = uniteCourte(unite);
  return u ? `${arrondiQte(q)} ${u}` : String(arrondiQte(q));
};

const UNITE_AU_SINGULIER: Record<string, string> = {
  'doz': 'douzaine', 'gross (144p)': 'grosse (144 p)', 'm': 'mètre', 'rolls': 'rouleau',
  'kg': 'kilogramme', 'bag': 'sac', 'yds': 'yard',
};

/** « Prix de vente par mètre » pour ce qui se vend au mètre ; « à l'unité » pour ce qui se vend à la pièce. */
const libellePrixDeVente = (unite?: string | null): string => {
  const u = (unite || '').trim();
  if (!u || ['unité', 'pièce', 'pièces', 'pcs'].includes(u.toLowerCase())) return "Prix de vente à l'unité";
  return `Prix de vente par ${UNITE_AU_SINGULIER[u] || libelleUnite(u).toLowerCase()}`;
};

/**
 * Champ de quantité : pas de 0,01 pour ce qui se vend au mètre ou au kilo, de 1 sinon. Pendant la
 * frappe, il garde ce qui est tapé (« 0, », « 2, ») au lieu de le réécrire par la quantité du
 * panier, ce qui effaçait la virgule à chaque touche. Une quantité bornée par le stock s'affiche
 * aussitôt ; la vraie quantité revient en quittant le champ.
 */
export function ChampQuantite({ valeur, unite, onQuantite, nu, videSiZero, garderDecimales, onBlur, ...props }: {
  valeur: number;
  unite?: string | null;
  onQuantite: (q: number) => void;
  /** `<input>` brut plutôt que le composant Input (le champ géant de la fenêtre des variantes). */
  nu?: boolean;
  /** Case vide plutôt que « 0 » (le placeholder prend le relais). */
  videSiZero?: boolean;
  /**
   * Garder les décimales quelle que soit l'unité (transferts) : le stock d'une variante peut être
   * fractionnaire même en rouleaux (répartition au prorata), et tronquer 3,333 à 3 le bloquerait.
   */
  garderDecimales?: boolean;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'step'>) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const tape = brouillon === null ? NaN : parseFloat(brouillon.replace(',', '.'));
  const affiche = brouillon !== null && (!(tape > 0) || tape === valeur)
    ? brouillon
    : (valeur || !videSiZero ? String(valeur) : '');
  const Composant: any = nu ? 'input' : Input;
  return (
    <Composant
      {...props}
      type="number"
      inputMode={uniteDecimale(unite) ? 'decimal' : 'numeric'}
      step={garderDecimales && !uniteDecimale(unite) ? 'any' : pasDeSaisie(unite)}
      value={affiche}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setBrouillon(e.target.value);
        // « 2, » en cours de frappe : le navigateur ne livre encore aucun nombre, on attend la suite.
        if (e.target.validity?.badInput) return;
        onQuantite(garderDecimales
          ? arrondiQte(parseFloat(e.target.value.replace(',', '.')) || 0)
          : quantiteSaisie(e.target.value, unite));
      }}
      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setBrouillon(null); onBlur?.(e); }}
    />
  );
}

interface CartLine { item: StockItem; qty: number; unitPrice: number; sourceStore?: string; }

/** Une ligne de panier transformée en ligne de bon de commande ou de facture. */
function ligneDeCommande(sub: StockItem, ligne: CartLine, qty: number, storeId: string): OrderItem {
  return {
    articleId: sub._realArticleId || sub.articleId,
    productName: sub.nameFR || sub.productName,
    nameFR: sub.nameFR,
    color: sub.color || '',
    size: sub.size || '',
    quality: sub.quality || ligne.item.quality || undefined,
    categoryId: sub.categoryId || '',
    unitOfMeasure: sub.unitOfMeasure || '',
    qty,
    unitPrice: ligne.unitPrice,
    // Champs d'analyse, écrits comme avant et jamais montrés dans /stock.
    purchasePricePerUnit: sub.purchasePricePerUnit || 0,
    costPrice: sub.purchasePricePerUnit || 0,
    totalPrice: qty * ligne.unitPrice,
    storeId,
  };
}

interface CheckoutPaymentLine {
  id: string;
  amount: string;
  method: PaymentMethod;
  notes: string;
  bankName: string;
  checkNumber: string;
  dueDate: string;
  scannedImageUrl?: string;
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
  const { toast } = useToast();
  const confirm = useConfirm();
  const isOnline = useOnlineStatus();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // Commande préparée avant l'arrivée du client : enregistrement en cours, puis la commande
  // enregistrée, gardée le temps d'imprimer son bon.
  const [preparingOrder, setPreparingOrder] = useState(false);
  const [preparedOrder, setPreparedOrder] = useState<{ reference: string; data: any } | null>(null);

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
  const [finalDate, setFinalDate] = useState(() => getLocalDateString());

  // ── Calculs ──
  const subTotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discountAmt = subTotal * (discount / 100);
  const total = subTotal - discountAmt;
  // Une coupe de 2,5 m est UN article : additionner les mètres aux pièces afficherait « 5,5 articles ».
  const cartCount = cart.reduce((s, l) => s + (uniteDecimale(l.item.unitOfMeasure) ? 1 : l.qty), 0);

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
      ? categories.filter((c: any) => c.generalCategoryId === selGenCat)
      : categories,
    [categories, selGenCat]
  );

  const [variantModal, setVariantModal] = useState<{ open: boolean; productName: string; variants: StockItem[]; categoryId: string }>({ open: false, productName: '', variants: [], categoryId: '' });
  // Variante choisie dans la fenêtre produit : sa dimension compte autant que sa valeur. Un
  // groupe dont les variantes portent une qualité se présélectionnait sur cette qualité mais se
  // filtrait sur la taille — le tableau s'ouvrait vide et le produit ne pouvait plus être vendu.
  const [activeOption, setActiveOption] = useState<{ dimension: 'quality' | 'size'; value: string } | null>(null);
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
      // Deux lignes de stock ne se fusionnent que si elles désignent la MÊME marchandise : la
      // qualité fait partie de l'identité au même titre que la couleur et la taille. Sans elle,
      // deux qualités du même coloris n'apparaissaient qu'une fois, avec la somme des deux, et la
      // vente puisait dans l'une pour l'autre.
      const dedupMap = new Map<string, StockItem>();
      rawVariants.forEach(v => {
        const vKey = `${v.quality || ''}|${v.color || ''}|${v.size || ''}`;
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
          const aKey = `${a.quality || ''}${a.color || ''}${a.size || ''}`;
          const bKey = `${b.quality || ''}${b.color || ''}${b.size || ''}`;
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

  // ── Résolution intelligente du magasin / entrepôt source ──
  // Un entrepôt n'est pas un point de vente indépendant : c'est du stock pour
  // CHRIFA. Une vente ne doit donc jamais être taguée à l'ID brut d'un
  // entrepôt (les règles Firestore la refuseraient — un commercial ne peut
  // écrire que sous son propre magasin), toujours à 'CHRIFA' à la place.
  const normalizeSourceStore = useCallback((rawStoreId: string): string => {
    if (rawStoreId === 'CHRIFA') return rawStoreId;
    const store = stores?.find(s => s.id === rawStoreId);
    return store?.type === 'WAREHOUSE' ? 'CHRIFA' : rawStoreId;
  }, [stores]);

  // Quantité réellement disponible "depuis" un magasin normalisé : pour CHRIFA,
  // additionne son propre stock + celui de tous les entrepôts rattachés (sinon
  // le plafond retomberait à 0 dès que le stock physique est en entrepôt).
  const availableQtyAtStore = useCallback((item: StockItem, storeId: string): number => {
    if (!item.qtyByStore) return item.currentQty;
    if (storeId === 'CHRIFA') {
      return Object.entries(item.qtyByStore).reduce((sum, [sId, q]) => {
        if (sId === 'CHRIFA' || stores?.find(s => s.id === sId)?.type === 'WAREHOUSE') return sum + (Number(q) || 0);
        return sum;
      }, 0);
    }
    return Number((item.qtyByStore as any)[storeId]) || 0;
  }, [stores]);

  const resolveSourceStore = useCallback((item: StockItem, preferredStore?: string): string => {
    // 1. Si un magasin préféré est spécifié et a du stock > 0
    if (preferredStore && item.qtyByStore && ((item.qtyByStore as any)[preferredStore] || 0) > 0) {
      return normalizeSourceStore(preferredStore);
    }
    // 2. Si le magasin de la caisse active a du stock > 0
    if (selectedStoreId && item.qtyByStore && ((item.qtyByStore as any)[selectedStoreId] || 0) > 0) {
      return normalizeSourceStore(selectedStoreId);
    }
    // 2b. CHRIFA : le stock peut être physiquement dans un entrepôt rattaché —
    // toujours vendu "depuis CHRIFA" du point de vue de la vente/du mouvement.
    if (selectedStoreId === 'CHRIFA' && item.qtyByStore) {
      const hasWarehouseStock = Object.entries(item.qtyByStore).some(([sId, q]) =>
        (q as number) > 0 && stores?.find(s => s.id === sId)?.type === 'WAREHOUSE'
      );
      if (hasWarehouseStock) return 'CHRIFA';
    }
    // 3. Trouver le magasin ou l'entrepôt physique qui dispose du stock le plus élevé
    if (item.qtyByStore) {
      const sorted = Object.entries(item.qtyByStore)
        .filter(([_, q]) => (q as number) > 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number));
      if (sorted.length > 0) {
        return normalizeSourceStore(sorted[0][0]);
      }
    }
    // 4. Fallback par défaut
    return normalizeSourceStore(preferredStore || selectedStoreId || (stores?.[0]?.id || 'CHRIFA'));
  }, [selectedStoreId, stores, normalizeSourceStore]);

  // ── Actions ──
  const openAddModal = (item: StockItem) => {
    const defStore = resolveSourceStore(item, selectedStoreId);
    // Trouver si une autre couleur/variante de ce même produit est déjà dans le panier avec un prix
    const existingSameProd = cart.find(l => l.item.productName === item.productName && l.unitPrice > 0);
    const initialPrice = existingSameProd?.unitPrice ?? (item.sellingPrice || 0);

    setAddModal({ open: true, item, qty: 1, unitPrice: initialPrice, sourceStore: defStore });
  };

  const addToCart = () => {
    if (!addModal.item || addModal.qty <= 0) return;
    const finalStore = addModal.sourceStore || resolveSourceStore(addModal.item, selectedStoreId);
    const itemStockLimit = finalStore ? availableQtyAtStore(addModal.item, finalStore) : addModal.item.currentQty;

    setCart(prev => {
      const ex = prev.find(l => l.item.articleId === addModal.item!.articleId && l.sourceStore === finalStore);
      if (ex) {
        return prev.map(l => l.item.articleId === addModal.item!.articleId && l.sourceStore === finalStore
          ? { ...l, qty: arrondiQte(Math.min(l.qty + addModal.qty, itemStockLimit)), unitPrice: addModal.unitPrice }
          : (l.item.productName === addModal.item!.productName ? { ...l, unitPrice: addModal.unitPrice } : l)
        );
      }
      // Ajouter la nouvelle variante et harmoniser les variantes existantes du même produit avec ce prix
      const newCart = prev.map(l => l.item.productName === addModal.item!.productName ? { ...l, unitPrice: addModal.unitPrice } : l);
      return [...newCart, { item: addModal.item!, qty: addModal.qty, unitPrice: addModal.unitPrice, sourceStore: finalStore }];
    });
    setAddModal({ open: false, qty: 1, unitPrice: 0 });
  };

  const updateCart = (articleId: string, key: 'qty' | 'unitPrice', val: number) => {
    setCart(prev => {
      const target = prev.find(l => l.item.articleId === articleId);
      if (key === 'unitPrice' && target) {
        // Appliquer automatiquement ce prix unitaire à toutes les couleurs/variantes du même produit
        return prev.map(l => 
          (l.item.productName === target.item.productName || l.item.articleId === articleId)
            ? { ...l, unitPrice: val }
            : l
        );
      }
      if (key === 'qty' && target) {
        const storeStock = target.sourceStore
          ? availableQtyAtStore(target.item, target.sourceStore)
          : target.item.currentQty;
        // Au mètre, une coupe de 0,5 m se vend : le plancher est le pas de saisie, pas 1.
        const plancher = pasDeSaisie(target.item.unitOfMeasure);
        const maxQty = Math.max(plancher, storeStock);
        const boundedQty = arrondiQte(Math.max(plancher, Math.min(val, maxQty)));
        return prev.map(l => l.item.articleId === articleId ? { ...l, qty: boundedQty } : l);
      }
      return prev.map(l => l.item.articleId === articleId ? { ...l, [key]: val } : l);
    });
  };

  const updateCartStore = (articleId: string, newStoreId: string) => {
    setCart(prev => prev.map(l => {
      if (l.item.articleId !== articleId) return l;
      const maxQty = availableQtyAtStore(l.item, normalizeSourceStore(newStoreId));
      const plancher = pasDeSaisie(l.item.unitOfMeasure);
      return {
        ...l,
        sourceStore: normalizeSourceStore(newStoreId),
        qty: arrondiQte(Math.max(plancher, Math.min(l.qty, Math.max(plancher, maxQty))))
      };
    }));
  };

  const removeFromCart = (articleId: string) => {
    setCart(prev => prev.filter(l => l.item.articleId !== articleId));
  };

  // Quick add: 1-click for single-store, modal for multi-store
  const quickAddToCart = (item: StockItem, customPrice?: number) => {
    const sourceStore = resolveSourceStore(item, selectedStoreId);
    const existingSameProd = cart.find(l => l.item.productName === item.productName && l.unitPrice > 0);
    const price = customPrice !== undefined 
      ? customPrice 
      : (existingSameProd?.unitPrice ?? (item.sellingPrice || 0));

    const maxQty = sourceStore ? availableQtyAtStore(item, sourceStore) : item.currentQty;

    setCart(prev => {
      const ex = prev.find(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore);
      if (ex) {
        return prev.map(l =>
          l.item.articleId === item.articleId && l.sourceStore === sourceStore
            ? { ...l, qty: arrondiQte(Math.min(l.qty + 1, maxQty)), unitPrice: price }
            : (l.item.productName === item.productName ? { ...l, unitPrice: price } : l)
        );
      }
      const harmonized = prev.map(l => l.item.productName === item.productName ? { ...l, unitPrice: price } : l);
      // Au mètre, un reste de rouleau de 0,4 m part tel quel plutôt qu'un mètre qui n'existe pas.
      const premiere = uniteDecimale(item.unitOfMeasure) && maxQty > 0 && maxQty < 1 ? arrondiQte(maxQty) : 1;
      return [...harmonized, { item, qty: premiere, unitPrice: price, sourceStore }];
    });
  };

  const setVariantQtyInCart = (item: StockItem, qty: number, customPrice?: number) => {
    const sourceStore = resolveSourceStore(item, selectedStoreId);
    const existingSameProd = cart.find(l => l.item.productName === item.productName && l.unitPrice > 0);
    const price = customPrice !== undefined 
      ? customPrice 
      : (existingSameProd?.unitPrice ?? (item.sellingPrice || 0));

    const maxQty = sourceStore ? availableQtyAtStore(item, sourceStore) : item.currentQty;
    const validQty = arrondiQte(Math.max(0, Math.min(qty, maxQty)));

    setCart(prev => {
      const ex = prev.find(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore);
      if (validQty === 0) return prev.filter(l => l.item.articleId !== item.articleId);
      if (ex) return prev.map(l => l.item.articleId === item.articleId && l.sourceStore === sourceStore ? { ...l, qty: validQty, unitPrice: price } : (l.item.productName === item.productName ? { ...l, unitPrice: price } : l));
      const harmonized = prev.map(l => l.item.productName === item.productName ? { ...l, unitPrice: price } : l);
      return [...harmonized, { item, qty: validQty, unitPrice: price, sourceStore }];
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

  /**
   * Le garde-fou de la vente à perte. C'est une règle de gestion, elle reste : un vendeur est
   * refusé, seul un administrateur peut passer outre. Les messages nomment les articles concernés
   * et s'arrêtent là — aucun montant d'achat ne sort d'ici.
   */
  const autoriserVenteAPerte = useCallback(async (): Promise<boolean> => {
    const lignesAPerte = cart.filter(l => venteAPerte(l.item, l.unitPrice));
    if (lignesAPerte.length === 0) return true;

    const articles = lignesAPerte.map(l => l.item.nameFR || l.item.productName).join(', ');
    const combien = `${lignesAPerte.length} article${lignesAPerte.length > 1 ? 's' : ''}`;

    if (userRole !== 'ADMIN') {
      toast({
        variant: 'destructive',
        title: 'Vente à perte',
        description: `${combien} en vente à perte : ${articles}.\nSeul un administrateur peut valider une vente à perte. Remontez le prix, ou faites-la valider.`,
      });
      return false;
    }
    return await confirm({
      title: 'Vente à perte',
      description: `${combien} en vente à perte : ${articles}.\n\nContinuer quand même ?`,
      confirmLabel: 'Valider malgré la perte',
      variant: 'destructive',
    });
  }, [cart, userRole, toast, confirm]);

  const handleFinalize = async () => {
    if (cart.length === 0 || saving) return;

    if (!(await autoriserVenteAPerte())) return;

    const isFullCredit = paymentStatus === 'UNPAID';
    const validLines = isFullCredit ? [] : paymentLines.filter(l => (parseFloat(l.amount) || 0) > 0);
    const totalPaidCalculated = isFullCredit ? 0 : validLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const balanceRemaining = isFullCredit ? total : Math.max(0, total - totalPaidCalculated);

    if (!isFullCredit && totalPaidCalculated <= 0) {
      toast({ variant: 'destructive', title: 'Montant manquant', description: "Veuillez saisir au moins un montant payé ou choisir 'À Crédit'." });
      return;
    }
    if (!isFullCredit && totalPaidCalculated > total + 0.01) {
      toast({ variant: 'destructive', title: 'Montant trop élevé', description: `Le montant saisi (${fmt$(totalPaidCalculated)} MAD) dépasse le montant de la vente (${fmt$(total)} MAD).` });
      return;
    }
    if (!isFullCredit && balanceRemaining > 0.01 && (anonymous || !selectedClient)) {
      toast({ variant: 'destructive', title: 'Client requis', description: 'Une vente avec reste à crédit nécessite de sélectionner un client identifié (non anonyme).' });
      return;
    }

    // ── Vérification obligatoire du scan pour Chèque et LC ──
    if (!isFullCredit) {
      const missingScanLine = validLines.find(
        l => (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()
      );
      if (missingScanLine) {
        toast({
          variant: 'destructive',
          title: 'Scan obligatoire',
          description: `Le scan ou la photo du ${missingScanLine.method} est obligatoire avant de valider la vente. Prenez une photo ou importez le scan du document.`,
        });
        return;
      }
    }

    // ── Vérification du plafond de crédit ──
    const debtToAdd = isFullCredit ? total : balanceRemaining;
    if (debtToAdd > 0 && selectedClient) {
      if (selectedClient.creditBlocked) {
        toast({ variant: 'destructive', title: 'Crédit bloqué', description: `Le crédit est bloqué pour le client "${selectedClient.name}". Contactez l'administrateur.` });
        return;
      }
      if (selectedClient.creditLimit != null && selectedClient.creditLimit > 0) {
        const currentDebt = invoices
          .filter(inv => inv.clientId === selectedClient.id && inv.status !== 'PAID' && inv.status !== 'CANCELLED')
          .reduce((sum, inv) => sum + (inv.remainingBalance ?? (inv.totalAfterDiscount - inv.paidAmount)), 0);
        const newDebt = currentDebt + debtToAdd;
        if (newDebt > selectedClient.creditLimit) {
          const confirmed = await confirm({
            title: 'Dépassement du plafond de crédit',
            description:
              `Cette vente porterait l'encours du client "${selectedClient.name}" à ${fmt$(newDebt)} MAD, ` +
              `dépassant le plafond de crédit de ${fmt$(selectedClient.creditLimit)} MAD.\n\n` +
              `Encours actuel : ${fmt$(currentDebt)} MAD\nNouveau crédit : ${fmt$(debtToAdd)} MAD`,
            confirmLabel: 'Continuer quand même',
            variant: 'destructive',
          });
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
        const resolvedStore = l.sourceStore || resolveSourceStore(l.item, selectedStoreId);
        let remainingQty = l.qty;
        // The item might be a merged "virtual variant" with originalItems
        const subItems: StockItem[] = (l.item as any).originalItems || [l.item];

        for (const sub of subItems) {
          if (remainingQty <= 0) break;
          // For a specific store if sourceStore is set, otherwise overall currentQty
          const availableInSub = resolvedStore
            ? availableQtyAtStore(sub, resolvedStore)
            : sub.currentQty;
            
          if (availableInSub <= 0) continue;

          const take = arrondiQte(Math.min(remainingQty, availableInSub));
          const realArticleId = sub._realArticleId || sub.articleId;

          items.push({
            articleId: realArticleId,
            productName: sub.nameFR || sub.productName,
            nameFR: sub.nameFR,
            color: sub.color || '',
            size: sub.size || '',
            quality: sub.quality || l.item.quality || undefined,
            categoryId: sub.categoryId || '',
            unitOfMeasure: sub.unitOfMeasure || '',
            qty: take,
            unitPrice: l.unitPrice,
            purchasePricePerUnit: sub.purchasePricePerUnit || 0,
            costPrice: sub.purchasePricePerUnit || 0,
            totalPrice: take * l.unitPrice,
            storeId: resolvedStore,
          });

          movements.push({
            articleId: realArticleId,
            categoryId: sub.categoryId || '',
            productName: sub.nameFR || sub.productName,
            nameFR: sub.nameFR,
            color: sub.color || null,
            size: sub.size || null,
            quality: sub.quality || l.item.quality || null,
            gsm: sub.gsm || null,
            fabricWidth: sub.fabricWidth || null,
            rollLength: sub.rollLength || null,
            rollLengthUnit: sub.rollLengthUnit || null,
            unitOfMeasure: sub.unitOfMeasure || '',
            type: 'OUT',
            reason: 'VENTE',
            quantity: take,
            date: today,
            notes: selectedClient ? `Vente client : ${selectedClient.name}` : 'Vente Comptoir',
            storeId: resolvedStore,
            // Champ d'aide, jamais écrit en base (retiré par handleCreateInvoice) : la couleur /
            // qualité / taille vendue, pour ne puiser que dans SES racks — pas dans ceux du Rouge
            // quand on vend du Bleu du même article.
            _variant: stockItemVariant(sub),
          });

          // Arrondi : en mètres, un reste flottant de 1e-16 partait sinon en ligne « Dépassement stock ».
          remainingQty = arrondiQte(remainingQty - take);
        }

        // If for some reason we still have remainingQty (e.g. data mismatch), add it to the last sub-item
        if (remainingQty > 0 && subItems.length > 0) {
          const lastSub = subItems[subItems.length - 1];
          const lastRealArticleId = lastSub._realArticleId || lastSub.articleId;
          items.push({
            articleId: lastRealArticleId,
            productName: lastSub.nameFR || lastSub.productName,
            nameFR: lastSub.nameFR,
            color: lastSub.color || '',
            size: lastSub.size || '',
            quality: lastSub.quality || l.item.quality || undefined,
            categoryId: lastSub.categoryId || '',
            unitOfMeasure: lastSub.unitOfMeasure || '',
            qty: remainingQty,
            unitPrice: l.unitPrice,
            purchasePricePerUnit: lastSub.purchasePricePerUnit || 0,
            costPrice: lastSub.purchasePricePerUnit || 0,
            totalPrice: remainingQty * l.unitPrice,
            storeId: resolvedStore,
          });
          movements.push({
            articleId: lastRealArticleId,
            categoryId: lastSub.categoryId || '',
            productName: lastSub.nameFR || lastSub.productName,
            nameFR: lastSub.nameFR,
            color: lastSub.color || null,
            size: lastSub.size || null,
            quality: lastSub.quality || l.item.quality || null,
            gsm: lastSub.gsm || null,
            fabricWidth: lastSub.fabricWidth || null,
            rollLength: lastSub.rollLength || null,
            rollLengthUnit: lastSub.rollLengthUnit || null,
            unitOfMeasure: lastSub.unitOfMeasure || '',
            type: 'OUT',
            reason: 'VENTE',
            quantity: remainingQty,
            date: today,
            notes: (selectedClient ? `Vente client : ${selectedClient.name}` : 'Vente Comptoir') + ` ⚠️ [Dépassement stock: +${remainingQty}]`,
            storeId: resolvedStore,
            _variant: stockItemVariant(lastSub),
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
        depositBank: l.bankName || 'Attijariwafa Bank',
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
    } catch (err: any) {
      console.error('Erreur lors de la validation de la vente:', err);
      toast({ variant: 'destructive', title: 'Erreur', description: `Impossible de valider la vente : ${err?.message || err}` });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Les lignes du panier telles qu'elles seront écrites sur la commande. Une ligne du panier peut
   * regrouper plusieurs lignes de stock de la même variante : elle se répartit sur les articles
   * réels qui la composent, comme à la validation d'une vente.
   */
  const lignesDuPanier = useCallback((): OrderItem[] => {
    const lignes: OrderItem[] = [];
    for (const l of cart) {
      const lieu = l.sourceStore || resolveSourceStore(l.item, selectedStoreId);
      const sousArticles: StockItem[] = (l.item as any).originalItems || [l.item];
      let restant = l.qty;
      for (const sub of sousArticles) {
        if (restant <= 0) break;
        const dispo = lieu ? availableQtyAtStore(sub, lieu) : sub.currentQty;
        if (dispo <= 0) continue;
        const pris = arrondiQte(Math.min(restant, dispo));
        lignes.push(ligneDeCommande(sub, l, pris, lieu));
        restant = arrondiQte(restant - pris);
      }
      if (restant > 0 && sousArticles.length > 0) {
        lignes.push(ligneDeCommande(sousArticles[sousArticles.length - 1], l, restant, lieu));
      }
    }
    return lignes;
  }, [cart, resolveSourceStore, selectedStoreId, availableQtyAtStore]);

  /**
   * Préparer la commande : le panier est mis de côté sous forme de bon de commande, avant que le
   * client se présente. Rien ne sort du stock, rien n'est encaissé — la marchandise est seulement
   * réservée sur le papier. La vente, elle, se fait à l'enlèvement.
   */
  const handlePrepareOrder = async () => {
    if (cart.length === 0 || preparingOrder || saving) return;
    if (!(await autoriserVenteAPerte())) return;

    setPreparingOrder(true);
    try {
      const commande: any = cleanUndefined({
        clientId: selectedClient?.id,
        clientName: selectedClient?.name || (anonymous ? 'Anonyme' : ''),
        items: lignesDuPanier(),
        totalAmount: subTotal,
        discount,
        totalAfterDiscount: total,
        status: 'CONFIRMED',
        date: finalDate,
        storeId: selectedStoreId,
        notes,
      });
      const id = await onCreateOrder(commande);
      setPreparedOrder({
        reference: `BC-${String(id || '').slice(0, 6).toUpperCase() || 'SANS-REF'}`,
        data: { ...commande, id },
      });
      setDone(true);
    } catch (err: any) {
      console.error('Erreur lors de la préparation de la commande:', err);
      toast({ variant: 'destructive', title: 'Erreur', description: `Impossible d'enregistrer la commande : ${err?.message || err}` });
    } finally {
      setPreparingOrder(false);
    }
  };

  const imprimerBonDeCommande = useCallback(() => {
    if (!preparedOrder) return;
    exportSaleOrderPDF(preparedOrder.data, categories, generalCategories, {
      reference: preparedOrder.reference,
      clientPhone: selectedClient?.phone,
      storeName: stores?.find(s => s.id === selectedStoreId)?.name,
    });
  }, [preparedOrder, categories, generalCategories, selectedClient, stores, selectedStoreId]);

  const reset = () => {
    setStep(0); setCart([]); setSelectedClient(null); setAnonymous(false);
    setDiscount(0); setNotes(''); setDone(false); setPreparedOrder(null); setFinalDate(getLocalDateString());
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
              l.method === 'CHEQUE' ? `Chèque ${l.checkNumber ? 'N° ' + escapeHtml(l.checkNumber) : ''}` :
              (l.method === 'LC' || l.method === 'LCN' || l.method === 'EFFET') ? `LC ${l.checkNumber ? 'N° ' + escapeHtml(l.checkNumber) : ''}` :
              l.method === 'VIREMENT' ? 'Virement' : l.method;
            const extra = [escapeHtml(l.bankName), l.dueDate ? `Éch: ${escapeHtml(l.dueDate)}` : ''].filter(Boolean).join(' - ');
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
      <div class="info-box"><h4>Client</h4><p>${escapeHtml(selectedClient?.name) || 'Comptoir (Anonyme)'}</p>${selectedClient?.phone ? `<p class="sub">${escapeHtml(selectedClient.phone)}</p>` : ''}</div>
      <div class="info-box"><h4>Règlement</h4><p>${paymentDetailsText}</p><p class="sub">Date : ${dateStr}</p></div>
    </div>
    <table><thead><tr><th>Désignation</th><th>Variante</th><th>Qté</th><th>P.U. (MAD)</th><th>Total (MAD)</th></tr></thead>
    <tbody>${cart.map(({ item, qty, unitPrice }) => `<tr><td>${escapeHtml(item.productName)}</td><td class="variant">${[escapeHtml(valeurImprimable(item.color)), valeurImprimable(item.size) ? 'T.' + escapeHtml(valeurImprimable(item.size)) : ''].filter(Boolean).join(' &middot; ') || '—'}</td><td style="text-align:right">${escapeHtml(qteAvecUnite(qty, item.unitOfMeasure))}</td><td style="text-align:right">${unitPrice > 0 ? fmt$(unitPrice) : '<span class="no-price">N/D</span>'}</td><td style="text-align:right;font-weight:900">${unitPrice > 0 ? fmt$(qty * unitPrice) : '<span class="no-price">—</span>'}</td></tr>`).join('')}</tbody></table>
    <div class="totals">
      <div class="row"><span>Sous-total</span><span>${fmt$(subTotal)}</span></div>
      ${discount > 0 ? `<div class="row" style="color:#16a34a"><span>Remise ${discount}%</span><span>-${fmt$(discountAmt)}</span></div>` : ''}
      <div class="row total"><span>TOTAL</span><span>${fmt$(total)}</span></div>
      ${totalPaidCalculated > 0 ? `<div class="row" style="color:#16a34a;font-weight:700"><span>Montant Payé</span><span>${fmt$(totalPaidCalculated)}</span></div>` : ''}
      ${balanceRemaining > 0.01 ? `<div class="row" style="color:#d97706;font-weight:700"><span>Reste dû</span><span>${fmt$(balanceRemaining)}</span></div>` : ''}
    </div>
    ${notes ? `<div style="margin-top:24px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px"><h4 style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#a8a29e;margin-bottom:6px">Notes</h4><p style="font-size:12px;font-weight:600">${escapeHtml(notes)}</p></div>` : ''}
    <div class="footer"><p>Ce document est un bon de commande et ne constitue pas une facture officielle.</p><p style="margin-top:4px">LEBTEX</p></div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }, [cart, selectedClient, paymentStatus, paymentLines, subTotal, discount, discountAmt, total, notes]);

  // ── Succès : commande préparée (aucune sortie de stock, aucun encaissement) ──
  if (done && preparedOrder) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-in fade-in">
      <div className="w-24 h-24 rounded-3xl bg-violet-100 flex items-center justify-center shadow-2xl shadow-violet-500/20">
        <ClipboardList className="w-12 h-12 text-violet-600" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-stone-900">
          Commande préparée
        </h2>
        <p className="text-stone-400 font-bold text-sm">
          {preparedOrder.reference} · {preparedOrder.data?.clientName || 'Comptoir'}
          {' '}· Total : <strong className="text-stone-700">{fmt$(total)} MAD</strong>
        </p>
      </div>
      <div className="max-w-md w-full px-4">
        <Encadre ton="info" titre="La marchandise n'est pas sortie du stock">
          Rien n'a été encaissé et aucun article n'a été retiré : la commande est seulement mise de
          côté sur le papier. La vente se fait quand le client vient chercher sa marchandise.
        </Encadre>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <Button onClick={imprimerBonDeCommande} className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs px-8 h-11 rounded-2xl gap-2">
          <FileText className="w-4 h-4" /> Bon de commande
        </Button>
        <Button onClick={reset} className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs px-8 h-11 rounded-2xl">
          Nouvelle vente
        </Button>
      </div>
    </div>
  );

  // ── Succès ──
  if (done) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-in fade-in">
      <div className="w-24 h-24 rounded-3xl bg-emerald-100 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-stone-900">
          Vente enregistrée !
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
              <p className="text-[11px] font-medium text-stone-500">Caisse utilisée pour cette vente</p>
              <p className="text-sm font-black text-stone-800">
                {stores.find(s => s.id === selectedStoreId)?.name || selectedStoreId}
              </p>
              <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5 max-w-md">
                C'est le magasin enregistré sur la vente, et celui dont le stock est proposé en premier.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-stone-700">Changer de magasin :</span>
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
                <span className={`text-[11px] font-black uppercase tracking-widest hidden sm:block ${
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
            <p className="text-[11px] font-black text-violet-300 uppercase tracking-[0.3em]">Étape 1</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Sélectionner le client</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {/* Big Button Vente Comptoir */}
             <button onClick={() => { setAnonymous(true); setSelectedClient(null); setStep(1); }}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  anonymous ? 'border-stone-700 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:border-stone-400'
                }`}>
                <p className="font-black text-lg uppercase tracking-tighter flex items-center gap-2"><ShoppingBag className="w-5 h-5" />Vente comptoir</p>
                <p className={`text-[11px] font-medium leading-snug mt-1 ${anonymous ? 'opacity-70' : 'text-stone-500'}`}>
                  Client de passage, sans dossier. La vente doit être réglée en totalité : rien ne peut rester à crédit.
                </p>
             </button>

             {/* Big Button Vente Client */}
             <button onClick={() => { setAnonymous(false); }}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  !anonymous ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-stone-200 bg-white hover:border-violet-200'
                }`}>
                <p className="font-black text-lg uppercase tracking-tighter flex items-center gap-2"><Users className="w-5 h-5" />Vente à un client</p>
                <p className={`text-[11px] font-medium leading-snug mt-1 ${!anonymous ? 'text-violet-700' : 'text-stone-500'}`}>
                  Client suivi par son dossier : la vente peut rester en partie, ou en totalité, sur son compte.
                </p>
             </button>
          </div>

          {!anonymous && (
            <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 space-y-4 animate-in slide-in-from-top-2">
              <SectionFormulaire
                titre="Dossier client"
                aide="Le dossier suit ce que le client doit. C'est lui qui autorise à emporter la marchandise et à payer plus tard."
                action={(
                  <button onClick={() => setShowNewClient(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-200 transition-colors shrink-0">
                    <UserPlus className="w-3.5 h-3.5" /> {showNewClient ? 'Revenir à la liste' : 'Nouveau client'}
                  </button>
                )}
              >

              {showNewClient ? (
                <div className="bg-violet-50 rounded-2xl border border-violet-100 p-5 space-y-3.5">
                  <Champ
                    label="Nom du client"
                    obligatoire
                    htmlFor="vente-client-nom"
                    aide="Ce nom est repris sur le bon de commande et sur le compte du client."
                  >
                    <Input id="vente-client-nom" placeholder="Ex : Mohamed Alami" value={newClientForm.name}
                      onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))}
                      className={`${CLASSE_CHAMP} bg-white border-white`} />
                  </Champ>
                  <Champ
                    label="Téléphone"
                    htmlFor="vente-client-tel"
                    aide="Sert à rappeler le client pour une commande prête ou un reste à payer."
                  >
                    <Input id="vente-client-tel" placeholder="+212 6..." value={newClientForm.phone}
                      onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))}
                      className={`${CLASSE_CHAMP} bg-white border-white`} />
                  </Champ>
                  <Champ label="Adresse e-mail" htmlFor="vente-client-email">
                    <Input id="vente-client-email" placeholder="client@exemple.com" value={newClientForm.email}
                      onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))}
                      className={`${CLASSE_CHAMP} bg-white border-white`} />
                  </Champ>
                  <BoutonValider
                    onClick={handleCreateClient}
                    raisonDesactive={!newClientForm.name.trim() ? 'Indiquez au moins le nom du client.' : null}
                    enCours={creatingClient}
                    libelleEnCours="Création du dossier…"
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Créer le dossier et le choisir
                  </BoutonValider>
                </div>
              ) : (
                <>
                  <Champ
                    label="Chercher un client déjà connu"
                    htmlFor="vente-recherche-client"
                    aide="Par nom, téléphone ou e-mail. Si le client n'existe pas encore, créez son dossier avec le bouton en haut."
                  >
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                      <Input id="vente-recherche-client" placeholder="Nom, téléphone ou e-mail..." value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        className={`${CLASSE_CHAMP} pl-9 bg-stone-50 focus:bg-white transition-colors`} />
                    </div>
                  </Champ>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {filteredClients.length === 0 && (
                      <p className="text-center text-stone-400 text-xs font-bold py-6">Aucun client ne correspond à cette recherche</p>
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
                            <p className="text-[11px] text-stone-400 font-bold">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                          </div>
                          {selectedClient?.id === c.id && <CheckCircle2 className="w-5 h-5 text-violet-500 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              </SectionFormulaire>
            </div>
          )}

          <div className="flex flex-col items-end gap-1.5">
            <Button onClick={() => setStep(1)} disabled={!selectedClient && !anonymous}
              className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2">
              Suivant — Choisir les produits <ChevronRight className="w-4 h-4" />
            </Button>
            {!selectedClient && !anonymous && (
              <p className="text-[11px] font-bold text-stone-500 leading-snug">
                Choisissez un client dans la liste, ou passez par « Vente comptoir ».
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Étape 2 : Produits ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-900 to-violet-800 p-6 rounded-3xl shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black text-violet-300 uppercase tracking-[0.3em]">Étape 2</p>
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
              <Champ
                label="Quel produit vendez-vous ?"
                htmlFor="vente-recherche-produit"
                aide="Seuls les produits qui restent en stock apparaissent. Ouvrez une ligne pour choisir la couleur, la qualité ou la taille."
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <Input
                    id="vente-recherche-produit"
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
              </Champ>

              {/* Product list */}
              <div className="bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
                {prodSearch.length < 2 ? (
                  <div className="p-10 text-center">
                    <Search className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-500 text-sm font-bold">Tapez au moins 2 lettres du nom du produit</p>
                    <p className="text-stone-400 text-[11px] font-medium mt-1">Par exemple « fil », « bouton », « fermeture ».</p>
                  </div>
                ) : groupedProducts.length === 0 ? (
                  <div className="p-10 text-center">
                    <ShoppingBag className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-500 text-sm font-bold">Aucun produit en stock pour « {prodSearch} »</p>
                    <p className="text-stone-400 text-[11px] font-medium mt-1">
                      Un produit épuisé n'apparaît plus ici. Vérifiez l'orthographe, ou regardez en réserve.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50 max-h-[500px] overflow-y-auto">
                    {groupedProducts.map(group => {
                      const cartQtyTotal = cart.filter(l => l.item.productName === group.name).reduce((s, l) => s + l.qty, 0);
                      return (
                        <button type="button" key={group.name}
                          onClick={() => {
                            const hasQ = group.variants.some(v => Boolean(v.quality));
                            const dimension: 'quality' | 'size' = hasQ ? 'quality' : 'size';
                            const options = Array.from(new Set(group.variants.map(v => v[dimension]).filter(Boolean))) as string[];
                            setActiveOption(options.length > 0 ? { dimension, value: options[0] } : null);
                            setActiveVariant(null);
                            setVariantModal({ open: true, productName: group.name, variants: group.variants, categoryId: group.categoryId });
                          }}
                          className="w-full text-left px-5 py-4 hover:bg-violet-50/50 transition-colors flex items-center gap-4 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">{group.name}</p>
                            <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                              {group.categoryId} · {group.variants.length} variante{group.variants.length > 1 ? 's' : ''} (couleur, qualité, taille) · {qteAvecUnite(group.totalQty, group.variants[0]?.unitOfMeasure)} en stock
                            </p>
                          </div>
                          {cartQtyTotal > 0 && (
                            <span className="shrink-0 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg">
                              {qteAvecUnite(cartQtyTotal, group.variants[0]?.unitOfMeasure)} au panier
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
                  <div className="p-6 text-center space-y-1">
                    <p className="text-stone-400 text-xs font-bold">Panier vide</p>
                    <p className="text-stone-400 text-[11px] font-medium leading-snug">
                      Ouvrez un produit à gauche, puis indiquez la quantité par couleur.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-stone-50 max-h-[400px] overflow-y-auto">
                      {cart.map(({ item, qty, unitPrice }) => (
                        <div key={item.articleId} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-stone-900 uppercase truncate">{item.productName}</p>
                            <p className="text-[10px] font-black text-violet-600">{qteAvecUnite(qty, item.unitOfMeasure)} × {fmt$(unitPrice)}</p>
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
                  <BoutonValider
                    onClick={() => setStep(2)}
                    raisonDesactive={cart.length === 0 ? 'Ajoutez au moins un article au panier.' : null}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Voir le panier
                  </BoutonValider>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black text-stone-400 uppercase tracking-[0.3em]">Étape 3</p>
              <h2 className="text-xl font-black text-stone-900 uppercase tracking-tight mt-0.5">Vérifier le panier</h2>
              <p className="text-[11px] font-medium text-stone-500 leading-snug mt-1 max-w-xl">
                Pour chaque ligne : d'où sort la marchandise, combien, et à quel prix.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-black text-stone-900">{cartCount}</p>
              <p className="text-[11px] font-bold text-stone-500">article{cartCount > 1 ? 's' : ''}</p>
            </div>
          </div>

          <Encadre ton="info" titre="D'où sort la marchandise">
            Le lieu de vente d'une ligne ne propose que les endroits qui ont réellement l'article.
            La réserve compte dans le stock du magasin principal : sa marchandise s'y vend sans transfert.
            Une boutique secondaire, elle, doit d'abord la recevoir.
          </Encadre>

          {/* Articles */}
          <div className="space-y-3">
            {cart.map(({ item, qty, unitPrice, sourceStore }, idx) => {
              const availableStock = sourceStore ? availableQtyAtStore(item, sourceStore) : item.currentQty;
              return (
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
                      {item.quality && (
                        <span className="text-[10px] font-black bg-violet-50 text-violet-700 px-2 py-1 rounded-lg border border-violet-200">
                          {item.quality}
                        </span>
                      )}
                      {item.color && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-stone-50 text-stone-600 px-2 py-1 rounded-lg border border-stone-100">
                          <div className="w-3 h-3 rounded-full shrink-0 border border-stone-200" style={{ backgroundColor: getColorCSS(item.color) }} />
                          {item.color}
                        </span>
                      )}
                      {item.size && (
                        <span className="text-[10px] font-bold bg-stone-50 text-stone-600 px-2 py-1 rounded-lg border border-stone-100">T. {item.size}</span>
                      )}
                      <span className="text-[11px] text-stone-400 font-medium">{item.categoryId}</span>
                      {cart.filter(l => l.item.productName === item.productName).length > 1 && (
                        <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/60" title="Le prix saisi vaut pour toutes les couleurs de ce produit">
                          Prix commun à {cart.filter(l => l.item.productName === item.productName).length} couleurs
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Supprimer */}
                  <button onClick={() => removeFromCart(item.articleId)}
                    title="Retirer cet article du panier"
                    className="w-8 h-8 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Lieu de vente + Quantité + Prix */}
                <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-stone-100 pt-4">
                  <Champ
                    label="Lieu de vente"
                    obligatoire
                    htmlFor={`lieu-${item.articleId}`}
                    aide="C'est de là que la marchandise sort. Le menu ne propose que les lieux qui en ont ; si aucun n'en a, seul le lieu déjà choisi reste affiché."
                  >
                    <select
                      id={`lieu-${item.articleId}`}
                      value={sourceStore || resolveSourceStore(item, selectedStoreId)}
                      onChange={e => updateCartStore(item.articleId, e.target.value)}
                      className={`${CLASSE_CHAMP} w-full border bg-white px-3 outline-none focus:border-violet-500 cursor-pointer`}
                    >
                      {(() => {
                        const lieux = (stores || [])
                          .filter(s => s.type !== 'WAREHOUSE')
                          .map(s => ({ s, q: availableQtyAtStore(item, s.id) }))
                          .filter(({ s, q }) => q > 0 || s.id === sourceStore);
                        if (lieux.length === 0) {
                          return <option value={sourceStore || selectedStoreId}>{sourceStore || selectedStoreId}</option>;
                        }
                        return lieux.map(({ s, q }) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {qteAvecUnite(q, item.unitOfMeasure)} en stock
                          </option>
                        ));
                      })()}
                    </select>
                  </Champ>

                  <Champ
                    label="Quantité vendue"
                    obligatoire
                    htmlFor={`quantite-${item.articleId}`}
                    indice={`${qteAvecUnite(availableStock, item.unitOfMeasure)} disponibles ici`}
                    aide={uniteDecimale(item.unitOfMeasure)
                      ? "Se vend au centième près : tapez la longueur (2,5 par exemple). La saisie s'arrête au stock du lieu choisi."
                      : "Le bouton + s'arrête au stock du lieu choisi. Pour aller plus loin, transférez d'abord la marchandise."}
                  >
                    <div className="h-11 inline-flex items-center gap-1 bg-stone-50 rounded-xl p-1 border border-stone-200">
                      <button onClick={() => qty > 1 && updateCart(item.articleId, 'qty', qty - 1)}
                        title={uniteDecimale(item.unitOfMeasure) ? `Enlever 1 ${item.unitOfMeasure}` : 'Enlever une unité'}
                        className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-sm">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      {/* La quantité se tape aussi : au mètre, les boutons ne font que des mètres entiers. */}
                      <ChampQuantite
                        nu
                        id={`quantite-${item.articleId}`}
                        valeur={qty}
                        unite={item.unitOfMeasure}
                        min={pasDeSaisie(item.unitOfMeasure)}
                        max={availableStock}
                        onQuantite={q => { if (q > 0) updateCart(item.articleId, 'qty', q); }}
                        className="w-16 h-8 text-center text-sm font-black text-stone-900 tabular-nums bg-transparent rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-violet-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      {uniteCourte(item.unitOfMeasure) && (
                        <span className="text-[11px] font-bold text-stone-500 pr-1">{uniteCourte(item.unitOfMeasure)}</span>
                      )}
                      <button
                        disabled={qty >= availableStock}
                        onClick={() => qty < availableStock && updateCart(item.articleId, 'qty', qty + 1)}
                        className={`w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 flex items-center justify-center transition-colors shadow-sm ${qty >= availableStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-stone-100'}`}
                        title={qty >= availableStock
                          ? `Tout le stock de ce lieu est déjà au panier : ${qteAvecUnite(availableStock, item.unitOfMeasure)}`
                          : (uniteDecimale(item.unitOfMeasure) ? `Ajouter 1 ${item.unitOfMeasure}` : 'Ajouter une unité')}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Champ>

                  <Champ
                    label={libellePrixDeVente(item.unitOfMeasure)}
                    obligatoire
                    htmlFor={`prix-${item.articleId}`}
                    indice={unitPrice > 0 ? `${fmt$(qty * unitPrice)} MAD la ligne` : undefined}
                    aide={
                      cart.filter(l => l.item.productName === item.productName).length > 1
                        ? 'Ce prix sera repris sur toutes les couleurs de ce produit déjà au panier.'
                        : "Prix hors remise. La remise s'applique plus bas, sur le total de la vente."
                    }
                    erreur={unitPrice > 0 && venteAPerte(item, unitPrice) ? 'Vente à perte.' : null}
                  >
                    <div className="relative">
                      <Input id={`prix-${item.articleId}`} type="number" min={0} step="any" value={unitPrice || ''}
                        onChange={e => updateCart(item.articleId, 'unitPrice', Number(e.target.value))}
                        placeholder="0,00"
                        className={`${CLASSE_CHAMP} pr-14`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">MAD</span>
                    </div>
                  </Champ>
                </div>
              </div>
            ); })}
          </div>

          {/* Totaux */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-5">
            <SectionFormulaire
              titre="Remise et note"
              aide="Facultatif. À remplir avant de passer au règlement."
            >
              <Champ
                label={<span className="inline-flex items-center gap-1.5"><Percent className="w-3.5 h-3.5 text-stone-400" /> Remise sur le total</span>}
                htmlFor="vente-remise"
                aide="La remise porte sur le total de la vente, pas sur une ligne. Le reste dû se recalcule tout seul."
                indice={discount > 0 ? `${fmt$(discountAmt)} MAD de moins` : undefined}
              >
                <div className="relative max-w-[140px]">
                  <Input id="vente-remise" type="number" min={0} max={100} value={discount}
                    onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className={`${CLASSE_CHAMP} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">%</span>
                </div>
              </Champ>

              <Champ
                label="Note sur la vente"
                htmlFor="vente-note"
                aide="Reprise telle quelle sur le bon de commande imprimé : référence du client, consigne de livraison."
              >
                <Input id="vente-note" placeholder="Ex : à livrer lundi matin" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className={CLASSE_CHAMP} />
              </Champ>
            </SectionFormulaire>

            <Recapitulatif titre="Montant de la vente">
              <LigneResume libelle={`Sous-total (${cartCount} article${cartCount > 1 ? 's' : ''})`} valeur={`${fmt$(subTotal)} MAD`} />
              {discount > 0 && (
                <LigneResume libelle={`Remise ${discount} %`} valeur={`-${fmt$(discountAmt)} MAD`} ton="positif" />
              )}
              <LigneResume libelle="Total à régler" valeur={`${fmt$(total)} MAD`} fort />
            </Recapitulatif>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Ajouter des produits
            </Button>
            <Button onClick={goToValidation}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs h-11 px-8 rounded-2xl gap-2">
              Passer au règlement <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Étape 4 : Finalisation ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-6 rounded-3xl shadow-xl">
            <p className="text-[11px] font-black text-emerald-300 uppercase tracking-[0.3em]">Étape 4</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mt-1">Finaliser la vente</h2>
            <p className="text-emerald-300/70 text-xs font-bold mt-1">
              {selectedClient?.name || 'Comptoir'} · {cart.length} produit{cart.length > 1 ? 's' : ''} · Total : {fmt$(total)} MAD
            </p>
          </div>

          {/* Choix type de règlement */}
          <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5">
          <SectionFormulaire
            numero={1}
            titre="Comment le client règle-t-il ?"
            aide="Ce choix décide de l'état de la facture : réglée, en attente d'encaissement, ou portée au compte du client."
          >
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
              <p className="font-black text-lg uppercase tracking-tighter">Le client règle maintenant</p>
              <p className={`text-[11px] font-medium leading-snug mt-1 ${paymentStatus === 'PAID' ? 'text-emerald-50' : 'text-stone-500'}`}>
                Espèces, chèque, effet ou virement. Le détail du règlement se saisit juste en dessous, et peut être partiel.
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
              <p className="font-black text-lg uppercase tracking-tighter">Tout à crédit</p>
              <p className={`text-[11px] font-medium leading-snug mt-1 ${paymentStatus === 'UNPAID' ? 'text-amber-50' : 'text-stone-500'}`}>
                {anonymous
                  ? "Impossible pour une vente comptoir : revenez à l'étape 1 et choisissez un client."
                  : "La totalité s'ajoute à la dette du client. La marchandise sort quand même du stock."}
              </p>
            </button>
          </div>

          {(paymentStatus === 'UNPAID' || remainingBalance > 0.01) && !anonymous && (
            <Encadre ton="attention" titre="Ce qui reste dû engage le client" className="mt-3.5">
              Le reste dû s'ajoute à l'encours de {selectedClient?.name || 'ce client'}
              {selectedClient?.creditLimit != null && selectedClient.creditLimit > 0
                ? `, dont le plafond est de ${fmt$(selectedClient.creditLimit)} MAD`
                : ''}.
              {' '}Au moment de valider, le logiciel compare l'encours au plafond et demande confirmation en cas de dépassement.
            </Encadre>
          )}
          </SectionFormulaire>
          </div>

          {/* Si règlement immédiat / partiel : modes de paiement */}
          {paymentStatus === 'PAID' && (
            <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5">
              <SectionFormulaire
                numero={2}
                titre="Détail du règlement"
                aide="Une ligne par moyen de paiement reçu. Ce qui n'est pas réglé ici reste dû par le client."
              >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-1">
                <div className="max-w-xs">
                  <p className="text-[13px] font-bold text-stone-800 leading-tight">Raccourcis</p>
                  <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5">
                    Un raccourci remplace les lignes par une seule, au montant total de la vente. « Mixte » en prépare deux.
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

              {paymentLines.some(l => l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'LCN' || l.method === 'EFFET') && (
                <Encadre ton="attention" titre="Un chèque ou un effet ne solde pas la facture">
                  La facture reste « en attente » jusqu'à l'encaissement en banque. Elle ne passe à « réglée » que le jour
                  où l'argent est réellement sur le compte. D'ici là, la pièce reste à suivre.
                </Encadre>
              )}

              {/* Datalist pour suggestions banques marocaines */}
              <datalist id="moroccan-banks-sale">
                {MOROCCAN_BANKS.map(b => (
                  <option key={b} value={b} />
                ))}
              </datalist>

              {/* Lignes de paiement */}
              <div className="space-y-3">
                {paymentLines.map((line, indexLigne) => {
                  const isPaper = line.method === 'CHEQUE' || line.method === 'LC' || line.method === 'LCN' || line.method === 'EFFET';
                  const isTransfer = line.method === 'VIREMENT';

                  return (
                    <div key={line.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                          Règlement {indexLigne + 1}{paymentLines.length > 1 ? ` sur ${paymentLines.length}` : ''}
                        </p>
                        {paymentLines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Retirer cette ligne de règlement"
                            onClick={() => removeCheckoutPaymentLine(line.id)}
                            className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <Champ
                          label="Moyen de paiement"
                          obligatoire
                          aide={
                            isPaper
                              ? "La pièce est enregistrée, mais la facture reste en attente jusqu'à son encaissement en banque."
                              : isTransfer
                                ? 'Compté comme encaissé. Vérifiez que le virement est bien arrivé sur le compte.'
                                : 'Argent encaissé tout de suite : cette part de la facture est réglée.'
                          }
                        >
                          <Select
                            value={line.method}
                            onValueChange={v => updateCheckoutPaymentLine(line.id, 'method', v as PaymentMethod)}
                          >
                            <SelectTrigger className={`${CLASSE_CHAMP} bg-white border`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH"><Banknote className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Espèces</SelectItem>
                              <SelectItem value="CHEQUE"><FileCheck className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Chèque</SelectItem>
                              <SelectItem value="LC"><FileText className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Effet (lettre de change)</SelectItem>
                              <SelectItem value="VIREMENT"><Landmark className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Virement</SelectItem>
                            </SelectContent>
                          </Select>
                        </Champ>

                        <Champ
                          label="Montant reçu"
                          obligatoire
                          htmlFor={`reglement-montant-${line.id}`}
                          indice={`Vente : ${fmt$(total)} MAD`}
                          aide="Laissez le montant total si le client solde tout. Un montant plus faible laisse le reste à sa charge."
                          erreur={isOverpaid ? `Le total saisi dépasse la vente de ${fmt$(totalPaid - total)} MAD.` : null}
                        >
                          <div className="relative">
                            <Input
                              id={`reglement-montant-${line.id}`}
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0,00"
                              value={line.amount}
                              onChange={e => updateCheckoutPaymentLine(line.id, 'amount', e.target.value)}
                              className={`${CLASSE_CHAMP} bg-white text-base pr-14`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">MAD</span>
                          </div>
                        </Champ>
                      </div>

                      {/* Détails Chèque ou LC */}
                      {isPaper && (
                        <div className="space-y-3.5 pt-3 border-t border-stone-200/60">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Champ
                              label="Banque du client"
                              htmlFor={`reglement-banque-${line.id}`}
                              aide="Banque qui a émis la pièce. Elle figure sur le chèque."
                            >
                              <Input
                                id={`reglement-banque-${line.id}`}
                                list="moroccan-banks-sale"
                                placeholder="Ex : BCP, CIH..."
                                value={line.bankName}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'bankName', e.target.value)}
                                className={`${CLASSE_CHAMP} bg-white`}
                              />
                            </Champ>
                            <Champ
                              label={line.method === 'CHEQUE' ? 'Numéro du chèque' : "Numéro de l'effet"}
                              htmlFor={`reglement-numero-${line.id}`}
                              aide="Numéro imprimé sur la pièce : c'est par lui qu'on la retrouve le jour de l'encaissement."
                            >
                              <Input
                                id={`reglement-numero-${line.id}`}
                                placeholder="Numéro de la pièce"
                                value={line.checkNumber}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'checkNumber', e.target.value)}
                                className={`${CLASSE_CHAMP} bg-white`}
                              />
                            </Champ>
                            <Champ
                              label="Date d'échéance"
                              htmlFor={`reglement-echeance-${line.id}`}
                              aide="Date à partir de laquelle la pièce peut être déposée en banque."
                            >
                              <Input
                                id={`reglement-echeance-${line.id}`}
                                type="date"
                                value={line.dueDate}
                                onChange={e => updateCheckoutPaymentLine(line.id, 'dueDate', e.target.value)}
                                className={`${CLASSE_CHAMP} bg-white`}
                              />
                            </Champ>
                            {userRole === 'ADMIN' && (
                              <Champ
                                label="Société qui encaissera"
                                aide="Compte sur lequel la pièce sera déposée. « Arbitrer à J-7 » laisse le choix pour plus tard."
                              >
                                <Select
                                  value={line.cashingCompany || 'PENDING'}
                                  onValueChange={v => updateCheckoutPaymentLine(line.id, 'cashingCompany', v === 'PENDING' ? undefined : v as CashingCompany)}
                                >
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white border`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PENDING"><Clock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Arbitrer à J-7</SelectItem>
                                    <SelectItem value="LEBTEX"><Building2 className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />LEBTEX</SelectItem>
                                    <SelectItem value="ROBE IN BOX"><Building2 className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />ROBE IN BOX</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Champ>
                            )}
                          </div>

                          {/* Scan / Photo obligatoire du Chèque / LC */}
                          <Champ
                            label={(
                              <span className="inline-flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-amber-600" />
                                Photo {line.method === 'CHEQUE' ? 'du chèque' : "de l'effet"}
                              </span>
                            )}
                            obligatoire
                            aide="Sans cette photo, la vente ne peut pas être validée : c'est la seule preuve de la pièce reçue."
                            indice={!line.scannedImageUrl ? (
                              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                Photo manquante
                              </span>
                            ) : undefined}
                          >
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
                                      Prendre la pièce en photo, ou choisir une image
                                    </span>
                                    <p className="text-[11px] text-stone-500 font-medium">
                                      Appareil photo du téléphone ou de la tablette, ou fichier image (JPG, PNG)
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
                          </Champ>
                        </div>
                      )}

                      {/* Détails Virement */}
                      {isTransfer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-stone-200/60">
                          <Champ
                            label="Banque du client"
                            htmlFor={`virement-banque-${line.id}`}
                            aide="Banque depuis laquelle le client a fait le virement."
                          >
                            <Input
                              id={`virement-banque-${line.id}`}
                              list="moroccan-banks-sale"
                              placeholder="Ex : CIH, BMCE..."
                              value={line.bankName}
                              onChange={e => updateCheckoutPaymentLine(line.id, 'bankName', e.target.value)}
                              className={`${CLASSE_CHAMP} bg-white`}
                            />
                          </Champ>
                          <Champ
                            label="Référence du virement"
                            htmlFor={`virement-reference-${line.id}`}
                            aide="Référence de l'opération : elle permet de retrouver le virement sur le relevé de banque."
                          >
                            <Input
                              id={`virement-reference-${line.id}`}
                              placeholder="Numéro de référence"
                              value={line.checkNumber}
                              onChange={e => updateCheckoutPaymentLine(line.id, 'checkNumber', e.target.value)}
                              className={`${CLASSE_CHAMP} bg-white`}
                            />
                          </Champ>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bouton ajouter mode si split / multi-mode */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCheckoutPaymentLine('CASH')}
                  className="text-xs font-bold rounded-xl border-dashed border-stone-300 gap-1.5 h-9"
                  title="Quand le client règle une partie en espèces et le reste par chèque, par exemple"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un autre moyen de paiement
                </Button>

                {/* Statut de paiement en direct */}
                <div className="flex items-center gap-2">
                  {Math.abs(remainingBalance) < 0.01 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                      Toute la vente est couverte ({fmt$(total)} MAD)
                    </span>
                  )}
                  {remainingBalance > 0.01 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                      Réglé : {fmt$(totalPaid)} MAD · reste {fmt$(remainingBalance)} MAD au compte du client
                    </span>
                  )}
                  {isOverpaid && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                      Le total saisi ({fmt$(totalPaid)} MAD) dépasse la vente
                    </span>
                  )}
                </div>
              </div>
              </SectionFormulaire>
            </div>
          )}

          {/* Date, relecture et validation */}
          <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5">
            <SectionFormulaire
              numero={3}
              titre="Relire, puis valider"
              aide="Dernière vérification : à la validation, la marchandise sort du stock et la vente est enregistrée. Si le client n'est pas encore là, préparez plutôt sa commande, juste en dessous."
            >
              <Champ
                label="Date de la vente"
                obligatoire
                htmlFor="vente-date"
                aide="À changer seulement si la marchandise est sortie un autre jour que celui-ci."
              >
                <Input id="vente-date" type="date" value={finalDate} onChange={e => setFinalDate(e.target.value)}
                  className={`${CLASSE_CHAMP} max-w-sm`} />
              </Champ>

              {/* Récap final */}
              <Recapitulatif titre="Ce qui va être enregistré">
                {cart.slice(0, 4).map(({ item, qty, unitPrice, sourceStore }) => (
                  <LigneResume
                    key={item.articleId}
                    libelle={`${qteAvecUnite(qty, item.unitOfMeasure)} × ${item.productName} ${item.color || ''} ${item.size ? 'T. ' + item.size : ''} — depuis ${stores?.find(s => s.id === sourceStore)?.name || sourceStore || selectedStoreId}`}
                    valeur={`${fmt$(qty * unitPrice)} MAD`}
                  />
                ))}
                {cart.length > 4 && (
                  <p className="text-[11px] text-stone-500 font-medium">
                    + {cart.length - 4} autre{cart.length - 4 > 1 ? 's' : ''} article{cart.length - 4 > 1 ? 's' : ''} au panier
                  </p>
                )}
                <div className="border-t border-stone-200 pt-2 mt-2 space-y-1.5">
                  <LigneResume libelle="Total de la vente" valeur={`${fmt$(total)} MAD`} fort />
                  {paymentStatus === 'PAID' && totalPaid > 0 && (
                    <LigneResume libelle="Encaissé ou reçu aujourd'hui" valeur={`${fmt$(totalPaid)} MAD`} ton="positif" />
                  )}
                  {paymentStatus === 'PAID' && remainingBalance > 0.01 && (
                    <LigneResume libelle="Reste au compte du client" valeur={`${fmt$(remainingBalance)} MAD`} ton="alerte" />
                  )}
                  {paymentStatus === 'UNPAID' && (
                    <LigneResume libelle="Porté en entier au compte du client" valeur={`${fmt$(total)} MAD`} ton="alerte" />
                  )}
                  <LigneResume
                    libelle="Sortie de stock"
                    valeur={`${cartCount} article${cartCount > 1 ? 's' : ''}`}
                  />
                </div>
              </Recapitulatif>

              {paymentStatus === 'PAID' && paymentLines.some(l => (parseFloat(l.amount) || 0) > 0 && (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN')) && (
                <Encadre ton="info">
                  La facture sera créée « en attente » : le chèque ou l'effet ne la solde qu'une fois encaissé en banque.
                </Encadre>
              )}

              {paymentStatus === 'PAID' && paymentLines.some(l => (parseFloat(l.amount) || 0) > 0 && (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()) && (
                <Encadre ton="attention" titre="Photo de la pièce manquante">
                  La photo du chèque ou de l'effet est obligatoire pour valider la vente. Joignez-la dans le détail du règlement, juste au-dessus.
                </Encadre>
              )}

              {!isOnline && (
                <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-300 rounded-2xl text-red-800 text-[11px] font-medium shadow-sm">
                  <WifiOff className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Pas de connexion réseau. La vente ne peut pas être enregistrée tant que la connexion n'est pas revenue : patientez, rien n'est perdu.</span>
                </div>
              )}

              <BoutonValider
                onClick={handleFinalize}
                enCours={saving}
                libelleEnCours="Enregistrement de la vente…"
                raisonDesactive={
                  !isOnline
                    ? "Sans connexion réseau, la vente ne peut pas être enregistrée."
                    : (paymentStatus === 'PAID' && paymentLines.some(l => (parseFloat(l.amount) || 0) > 0 && (l.method === 'CHEQUE' || l.method === 'LC' || l.method === 'EFFET' || l.method === 'LCN') && !l.scannedImageUrl?.trim()))
                      ? "Joignez la photo du chèque ou de l'effet pour pouvoir valider."
                      : null
                }
                className={paymentStatus === 'PAID'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/30'}
              >
                Valider la vente — {fmt$(total)} MAD
              </BoutonValider>

              {/* ── Le client n'est pas encore là : on prépare sa commande ── */}
              <div className="pt-2 border-t border-stone-100 space-y-2.5">
                <Encadre ton="astuce" titre="Le client n'est pas encore venu ?">
                  « Préparer la commande » met ce panier de côté sous forme de bon de commande :
                  la marchandise reste en stock, rien n'est encaissé. Le bon s'imprime juste après.
                  À l'enlèvement, retrouvez la commande dans <span className="font-black">Commandes
                  préparées</span> et facturez-la : c'est à ce moment-là que la marchandise sort.
                  Attention, une commande préparée ne réserve rien — une vente passée entre-temps
                  peut prendre les mêmes pièces.
                </Encadre>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrepareOrder}
                  disabled={!isOnline || preparingOrder || saving || cart.length === 0}
                  className="w-full h-12 rounded-2xl border-2 border-violet-300 bg-white text-violet-800 hover:bg-violet-50 text-[13px] font-black tracking-wide gap-2 disabled:opacity-40"
                >
                  <ClipboardList className="w-4 h-4" />
                  {preparingOrder ? 'Enregistrement de la commande…' : `Préparer la commande — ${fmt$(total)} MAD`}
                </Button>
                {!isOnline && (
                  <p className="text-[11px] font-bold text-stone-500 text-center leading-snug">
                    Sans connexion réseau, la commande ne peut pas être enregistrée.
                  </p>
                )}
              </div>
            </SectionFormulaire>
          </div>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2 font-black uppercase text-xs h-11 rounded-2xl">
              <ChevronLeft className="w-4 h-4" /> Modifier le panier
            </Button>
          </div>
        </div>
      )}

      {/* ── Modal ajout article ── */}
      <Dialog open={addModal.open} onOpenChange={o => !o && setAddModal({ open: false, qty: 1, unitPrice: 0 })}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-[#3D2E17] to-[#2A2014] p-5 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">{addModal.item?.productName}</DialogTitle>
            <p className="text-[11px] font-medium text-[#C9B89A] mt-1">
              {[addModal.item?.color, addModal.item?.size].filter(Boolean).join(' · ')} · {arrondiQte(addModal.item?.currentQty || 0)} {addModal.item?.unitOfMeasure} en stock, tous lieux confondus
            </p>
          </div>
          <div className="p-5 space-y-4 bg-white">
            {addModal.item?.qtyByStore && Object.keys(addModal.item.qtyByStore).length > 0 && (
              <Champ
                label="Lieu d'où sort la marchandise"
                obligatoire
                htmlFor="ajout-lieu"
                aide="C'est ce lieu qui sera débité. La réserve compte dans le stock du magasin principal ; une boutique secondaire doit d'abord recevoir la marchandise."
              >
                <select
                  id="ajout-lieu"
                  className={`${CLASSE_CHAMP} w-full border bg-white px-3 outline-none focus:border-violet-500`}
                  value={addModal.sourceStore || ''}
                  onChange={e => setAddModal(m => ({ ...m, sourceStore: normalizeSourceStore(e.target.value) }))}
                >
                  <option value="" disabled>Choisir un lieu…</option>
                  {Object.entries(addModal.item.qtyByStore).map(([sId, q]) => (q as number) > 0 && (
                    <option key={sId} value={sId}>{sId.replace('_', ' ')} — {qteAvecUnite(q as number, addModal.item?.unitOfMeasure)} en stock</option>
                  ))}
                </select>
              </Champ>
            )}
            <Champ
              label="Quantité"
              obligatoire
              htmlFor="ajout-quantite"
              indice={`${qteAvecUnite((addModal.sourceStore && addModal.item ? availableQtyAtStore(addModal.item, addModal.sourceStore) : addModal.item?.currentQty) ?? 0, addModal.item?.unitOfMeasure)} disponible(s)`}
              aide={uniteDecimale(addModal.item?.unitOfMeasure)
                ? "Se vend au centième près (2,5 par exemple). La saisie s'arrête au stock du lieu choisi."
                : "La saisie s'arrête au stock du lieu choisi."}
            >
              <ChampQuantite id="ajout-quantite" valeur={addModal.qty} unite={addModal.item?.unitOfMeasure}
                min={pasDeSaisie(addModal.item?.unitOfMeasure)}
                max={addModal.sourceStore && addModal.item ? availableQtyAtStore(addModal.item, addModal.sourceStore) : addModal.item?.currentQty}
                onQuantite={q => setAddModal(m => {
                  const maxStock = (m.sourceStore && m.item ? availableQtyAtStore(m.item, m.sourceStore) : m.item?.currentQty) || 999;
                  return { ...m, qty: arrondiQte(Math.min(q, maxStock)) };
                })}
                className={`${CLASSE_CHAMP} text-lg`} autoFocus />
            </Champ>
            <Champ
              label={libellePrixDeVente(addModal.item?.unitOfMeasure)}
              obligatoire
              htmlFor="ajout-prix"
              aide="Ce prix sera repris sur toutes les couleurs de ce produit déjà au panier."
            >
              <div className="relative">
                <Input id="ajout-prix" type="number" min={0} step="any" value={addModal.unitPrice}
                  onChange={e => setAddModal(m => ({ ...m, unitPrice: Number(e.target.value) }))}
                  className={`${CLASSE_CHAMP} text-lg pr-14`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">MAD</span>
              </div>
            </Champ>
            <Recapitulatif titre="À ajouter au panier">
              <LigneResume libelle="Quantité" valeur={`${addModal.qty} ${addModal.item?.unitOfMeasure || ''}`} />
              <LigneResume libelle="Prix unitaire" valeur={`${fmt$(addModal.unitPrice)} MAD`} />
              <LigneResume libelle="Total de la ligne" valeur={`${fmt$(addModal.qty * addModal.unitPrice)} MAD`} fort />
            </Recapitulatif>
          </div>
          <DialogFooter className="p-4 bg-stone-50">
            <div className="w-full space-y-2">
              <BoutonValider
                onClick={addToCart}
                raisonDesactive={
                  addModal.qty <= 0
                    ? (uniteDecimale(addModal.item?.unitOfMeasure) ? 'Indiquez une quantité.' : 'Indiquez une quantité d\'au moins 1.')
                    : (!!addModal.item?.qtyByStore && !addModal.sourceStore)
                      ? "Choisissez le lieu d'où sort la marchandise."
                      : null
                }
                className="bg-violet-600 hover:bg-violet-700"
              >
                Ajouter au panier
              </BoutonValider>
              <Button variant="ghost" onClick={() => setAddModal({ open: false, qty: 1, unitPrice: 0 })} className="w-full font-bold text-xs rounded-xl h-9">
                Annuler
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal sélection variantes ── */}
      <Dialog open={variantModal.open} onOpenChange={o => !o && setVariantModal({ open: false, productName: '', variants: [], categoryId: '' })}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden bg-stone-50">
          <div className="bg-white p-5 border-b border-stone-100 flex justify-between items-center sticky top-0 z-10 shadow-sm">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-stone-900">{variantModal.productName}</DialogTitle>
              <p className="text-[11px] font-medium text-stone-500 mt-1">{variantModal.categoryId}</p>
            </div>
            <div className="bg-stone-100 text-stone-600 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
              {qteAvecUnite(variantModal.variants.reduce((s, v) => s + v.currentQty, 0), variantModal.variants[0]?.unitOfMeasure)} en stock
            </div>
          </div>

          <div className="px-5 pt-4 bg-white">
            <Encadre ton="info" titre="Le stock est tenu variante par variante">
              Choisir la couleur — et la qualité ou la taille quand le produit en a — est obligatoire : c'est elle qui
              sera retirée du stock. Une variante à 0 ne peut pas être vendue.
            </Encadre>
          </div>
          
          {(() => {
            // Les pastilles suivent la dimension réellement sélectionnée : qualités si le produit en
            // porte, tailles sinon. Elles n'énuméraient que les tailles, y compris quand la
            // sélection portait sur une qualité.
            const dimension: 'quality' | 'size' = variantModal.variants.some(v => Boolean(v.quality)) ? 'quality' : 'size';
            const sizes = Array.from(new Set(variantModal.variants.map(v => v[dimension]).filter(Boolean))) as string[];
            if (sizes.length > 0) {
              return (
                <div className="bg-white px-5 py-3 border-b border-stone-100">
                  <p className="text-[13px] font-bold text-stone-800 leading-tight">
                    {dimension === 'quality' ? '1. Choisir la qualité' : '1. Choisir la taille'}
                  </p>
                  <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5 mb-2">
                    {dimension === 'quality'
                      ? "Les couleurs proposées en dessous ne sont que celles de cette qualité."
                      : "Les couleurs proposées en dessous ne sont que celles de cette taille."}
                    {' '}Le chiffre entre parenthèses est le stock.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {sizes.map(size => {
                      const sizeQty = variantModal.variants.filter(v => v[dimension] === size).reduce((s, v) => s + v.currentQty, 0);
                      return (
                        <button key={size} onClick={() => setActiveOption({ dimension, value: size })}
                          className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                            activeOption?.value === size 
                              ? 'bg-stone-900 text-white shadow-lg' 
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}>
                          {size}
                          <span className={`ml-1.5 text-[10px] font-bold ${activeOption?.value === size ? 'text-stone-400' : 'text-stone-400'}`}>({arrondiQte(sizeQty)})</span>
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
              <p className="text-sm font-bold text-stone-500 mt-1 mb-6">
                {activeVariant.size ? `Taille ${activeVariant.size} · ` : ''}{activeVariant.quality ? `${activeVariant.quality} · ` : ''}{qteAvecUnite(activeVariant.currentQty, activeVariant.unitOfMeasure)} en stock
              </p>

              <div className="w-full max-w-sm">
                <Champ
                  label={uniteCourte(activeVariant.unitOfMeasure) ? `Quantité à vendre (${uniteCourte(activeVariant.unitOfMeasure)})` : 'Quantité à vendre'}
                  obligatoire
                  htmlFor="variante-quantite"
                  indice={`${qteAvecUnite(activeVariant.currentQty, activeVariant.unitOfMeasure)} en stock`}
                  aide={uniteDecimale(activeVariant.unitOfMeasure)
                    ? "Se vend au centième près (2,5 par exemple). La saisie s'arrête au stock de cette variante. À 0, la ligne disparaît du panier."
                    : "La saisie s'arrête au stock de cette variante. À 0, la ligne disparaît du panier."}
                >
                  <div className="flex items-center justify-center gap-4 pt-1">
                    <button
                      title="Enlever une unité"
                      onClick={() => setVariantQtyInCart(activeVariant, (cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || 0) - 1, activeVariant.sellingPrice)}
                      className="w-16 h-16 rounded-2xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center text-2xl font-black shadow-sm transition-colors">
                      <Minus className="w-6 h-6" />
                    </button>
                    <ChampQuantite
                      nu
                      videSiZero
                      id="variante-quantite"
                      min="0"
                      max={activeVariant.currentQty}
                      valeur={cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || 0}
                      unite={activeVariant.unitOfMeasure}
                      placeholder="0"
                      autoFocus
                      onQuantite={q => setVariantQtyInCart(activeVariant, q, activeVariant.sellingPrice)}
                      className="w-32 h-20 text-center text-4xl font-black rounded-3xl border-2 border-stone-200 focus:border-stone-900 focus:outline-none shadow-sm"
                    />
                    <button
                      title="Ajouter une unité"
                      onClick={() => setVariantQtyInCart(activeVariant, (cart.find(l => l.item.articleId === activeVariant.articleId)?.qty || 0) + 1, activeVariant.sellingPrice)}
                      className="w-16 h-16 rounded-2xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center text-2xl font-black shadow-sm transition-colors">
                      <Plus className="w-6 h-6" />
                    </button>
                  </div>
                </Champ>
              </div>

              <Button onClick={() => setActiveVariant(null)} className="mt-8 bg-stone-900 hover:bg-stone-800 text-white h-12 px-8 rounded-xl font-black uppercase text-xs">
                Revenir aux couleurs
              </Button>
            </div>
          ) : (
            <div className="p-5 max-h-[50vh] overflow-y-auto">
              <p className="text-[13px] font-bold text-stone-800 leading-tight">
                {activeOption
                  ? `2. Choisir la couleur — ${activeOption.dimension === 'quality' ? 'qualité' : 'taille'} ${activeOption.value}`
                  : 'Choisir la couleur'}
              </p>
              <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5 mb-3">
                Touchez une ligne pour indiquer la quantité. Une couleur à 0 n'est pas vendable.
              </p>
              
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-bold text-stone-600">Couleur</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-stone-600 text-center">En stock</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-stone-600 text-right w-32">Au panier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {variantModal.variants
                      .filter(v => activeOption ? v[activeOption.dimension] === activeOption.value : true)
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
                                {isEmpty ? '0' : qteAvecUnite(v.currentQty, v.unitOfMeasure)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {inCartLine ? (
                                <span className="text-sm font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-lg">{qteAvecUnite(inCartLine.qty, v.unitOfMeasure)} sél.</span>
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
          
          <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-stone-500">
              {(() => {
                const qte = cart.filter(l => variantModal.variants.some(v => v.articleId === l.item.articleId)).reduce((s, l) => s + l.qty, 0);
                const unite = variantModal.variants[0]?.unitOfMeasure;
                return uniteDecimale(unite) ? `${qteAvecUnite(qte, unite)} de ce produit au panier` : `${qte} article(s) de ce produit au panier`;
              })()}
            </p>
            <Button onClick={() => setVariantModal({ open: false, productName: '', variants: [], categoryId: '' })}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs h-11 px-8 rounded-xl shadow-md shrink-0">
              Terminer ce produit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
