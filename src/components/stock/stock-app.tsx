"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, LogOut, LayoutDashboard, List, ArrowLeftRight, Bell, Package,
  Boxes, ShoppingCart, TrendingUp, Users, ClipboardList, FileText, Anchor, Archive, CheckCircle2, Download, Truck, Store as StoreIcon,
  Settings, MapPin, Home
} from 'lucide-react';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, doc, addDoc, updateDoc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type {
  StockMovement, StockItem, Sale, StoreLocation,
  Client, SaleOrder, SaleOrderStatus, Invoice, InvoiceStatus, ClientPayment,
} from '@/lib/types';
import StockDashboard   from './stock-dashboard';
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
import { cleanUndefined } from '@/lib/utils';
import { Button }       from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ArrivalsView     from './arrivals-view';
import SaleOrdersView   from './sale-orders-view';
import InvoiceView      from './invoice-view';
import SalesPos         from './sales-pos';
import TransferOrdersView from './transfer-orders-view';
import StoresView       from './stores-view';
import StockWarehouses  from './stock-warehouses';
import TreasuryDashboard from './treasury-dashboard';
import BankReconciliationView from './bank-reconciliation-view';
import BlindInventory from './blind-inventory';
import AuditLogView from './audit-log-view';
import { Landmark } from 'lucide-react';

type StockView = 'dashboard' | 'sale' | 'stock' | 'inventory' | 'analytics' | 'clients' | 'orders' | 'invoices' | 'movements' | 'alerts' | 'arrivals' | 'transfers' | 'stores' | 'warehouses' | 'treasury' | 'reconciliation' | 'blind-inventory' | 'audit';

// ─── Calcul du stock courant ─────────────────────────────────────────────────

function getInitialQtyForStore(item: any, activeStore: string, userStoreId: string, stores: any[]): number {
  const byStore = item.initialQtyByStore;
  const legacyQty = Number(item.rolls || item.quantity || 0);

  if (!byStore) {
    if (activeStore === 'ALL' || activeStore === 'ALL_MAIN' || activeStore === 'ENTREPOT') return legacyQty;
    return 0;
  }

  if (activeStore === 'ALL') {
    return Object.values(byStore).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
  }

  if (activeStore === 'ALL_MAIN') {
    let sum = 0;
    if (byStore[userStoreId]) sum += byStore[userStoreId];
    if (byStore['ENTREPOT']) sum += byStore['ENTREPOT'];
    for (const s of stores) {
      if (s.type === 'WAREHOUSE' && byStore[s.id]) {
        sum += byStore[s.id];
      }
    }
    return sum;
  }

  return byStore[activeStore] || 0;
}

export function computeStockItems(
  articles: any[],
  movements: StockMovement[],
  categories: any[],
  activeStore: StoreLocation | 'ALL' | 'ALL_MAIN',
  includeAll: boolean = false,
  userRole: string = 'ADMIN',
  stores: any[] = [],
  userStoreId: string = ''
): StockItem[] {
  const isVisibleForUser = (storeId: string | undefined) => {
    if (activeStore === 'ALL') return true;
    const sId = storeId || 'ENTREPOT';
    
    if (activeStore === 'ALL_MAIN') {
      if (sId === userStoreId) return true;
      if (sId === 'ENTREPOT') return true;
      const s = stores.find(x => x.id === sId);
      if (s && s.type === 'WAREHOUSE') return true;
      return false;
    }

    return sId === activeStore;
  };

  const computeQtyByStoreHelper = (itemRow: any, targetMovs: any[]) => {
    const qtyByStore: Record<string, number> = { ...(itemRow.initialQtyByStore || {}) };
    if (!itemRow.initialQtyByStore) qtyByStore['ENTREPOT'] = Number(itemRow.rolls || itemRow.quantity || 0);
    for (const m of targetMovs) {
      if (m.reason === 'TRANSFERT') {
        if (m.storeId) qtyByStore[m.storeId] = (qtyByStore[m.storeId] || 0) - m.quantity;
        if (m.toStoreId) qtyByStore[m.toStoreId] = (qtyByStore[m.toStoreId] || 0) + m.quantity;
      } else {
        const sId = m.storeId || 'ENTREPOT';
        qtyByStore[sId] = qtyByStore[sId] || 0;
        if (m.type === 'IN') qtyByStore[sId] += m.quantity;
        if (m.type === 'OUT') qtyByStore[sId] -= m.quantity;
        if (m.type === 'ADJUSTMENT') qtyByStore[sId] += m.quantity;
      }
    }
    return qtyByStore;
  };
  const stockArticles = includeAll ? articles : articles.filter(a => {
    return a.stockEntryDate || movements.some(m => m.articleId === a.id);
  });

  const results: StockItem[] = [];

  for (const a of stockArticles) {
    // Nom du produit
    const parts: string[] = [];
    if (a.zipperType) parts.push(a.zipperType);
    if (a.slider)     parts.push(a.slider);
    const productName = parts.length > 0 ? parts.join(' ') : (a.name || a.specs || a.categoryId || 'Produit');

    const hasTTCCost = Number(a.purchasePriceMAD) > 0;
    const price      = Number(a.purchasePriceMAD) || Number(a.purchasePricePerUnit) || 0;
    const sellPrice  = Number(a.sellingPrice) || undefined;

    const artMovements = movements.filter(m => m.articleId === a.id);

    // ── CAS 1 : color === 'various' ET colorBreakdown renseigné ──────────────
    const colorBreakdown: any[] = Array.isArray(a.colorBreakdown) ? a.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(a.sizeBreakdown)  ? a.sizeBreakdown  : [];

    if ((a.color === 'various' || a.color === 'Various') && colorBreakdown.length > 0) {
      // Un StockItem par entrée dans colorBreakdown
      for (const row of colorBreakdown) {
        const colorLabel = (row.colorCode || row.description || row.color || '').trim();
        if (!colorLabel) continue;

        const initialQty = getInitialQtyForStore(row, activeStore, userStoreId, stores);

        // Mouvements filtrés : ceux qui mentionnent cette couleur spécifiquement
        // ou bien les mouvements globaux de l'article proportionnellement
        const colorMov = artMovements.filter(m =>
          m.color?.toLowerCase() === colorLabel.toLowerCase()
        );
        // Fallback : si aucun mouvement avec couleur, prendre les mouvements globaux / nb de couleurs
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = colorMov.length > 0 ? colorMov : artMovements.map(m => ({ ...m, quantity: m.quantity / (colorBreakdown.length || 1) }));

        for (const m of targetMovs) {
          if (m.reason === 'TRANSFERT') {
            if (activeStore === 'ALL') continue; // Transfert interne = 0 impact global
            if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
            if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
          } else {
            if (isVisibleForUser(m.storeId)) {
              if (m.type === 'IN') mouvIN += m.quantity;
              if (m.type === 'OUT') mouvOUT += m.quantity;
              if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
            }
          }
        }

        const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);
        const lastMov = [...colorMov].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

        results.push({
          articleId:           `${a.id}__color__${colorLabel}`, // ID virtuel unique
          categoryId:          a.categoryId,
          productName,
          color:               colorLabel,
          size:                a.size !== 'various' ? a.size : undefined,
          unitOfMeasure:       a.unitOfMeasure || 'unité',
          purchasePricePerUnit: price,
          hasTTCCost,
          sellingPrice:        sellPrice,
          initialQty,
          mouvementsIn:        mouvIN,
          mouvementsOut:       mouvOUT,
          currentQty,
          totalValue:          currentQty * price,
          totalSellingValue:   sellPrice ? currentQty * sellPrice : undefined,
          minThreshold:        a.minStockThreshold,
          lastMovementDate:    lastMov?.date ?? a.stockEntryDate,
          stockEntryDate:      a.stockEntryDate,
          // Conserver l'articleId réel pour les mouvements et éditions
          _realArticleId:      a.id,
          _colorKey:           colorLabel,
          qtyByStore:          computeQtyByStoreHelper(row, targetMovs),
        } as any);
      }
      continue; // ne pas créer le StockItem générique
    }

    // ── CAS 2 : size === 'various' ET sizeBreakdown renseigné ────────────────
    if ((a.size === 'various' || a.size === 'Various') && sizeBreakdown.length > 0) {
      for (const row of sizeBreakdown) {
        const sizeLabel = (row.size || '').trim();
        if (!sizeLabel) continue;

        const initialQty = getInitialQtyForStore(row, activeStore, userStoreId, stores);
        const sizeMov = artMovements.filter(m =>
          m.size?.toLowerCase() === sizeLabel.toLowerCase()
        );
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = sizeMov.length > 0 ? sizeMov : artMovements.map(m => ({ ...m, quantity: m.quantity / (sizeBreakdown.length || 1) }));

        for (const m of targetMovs) {
          if (m.reason === 'TRANSFERT') {
            if (activeStore === 'ALL') continue;
            if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
            if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
          } else {
            if (isVisibleForUser(m.storeId)) {
              if (m.type === 'IN') mouvIN += m.quantity;
              if (m.type === 'OUT') mouvOUT += m.quantity;
              if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
            }
          }
        }

        const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);
        const lastMov = [...sizeMov].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

        results.push({
          articleId:           `${a.id}__size__${sizeLabel}`,
          categoryId:          a.categoryId,
          productName,
          color:               a.color !== 'various' ? a.color : undefined,
          size:                sizeLabel,
          unitOfMeasure:       a.unitOfMeasure || 'unité',
          purchasePricePerUnit: price,
          hasTTCCost,
          sellingPrice:        sellPrice,
          initialQty,
          mouvementsIn:        mouvIN,
          mouvementsOut:       mouvOUT,
          currentQty,
          totalValue:          currentQty * price,
          totalSellingValue:   sellPrice ? currentQty * sellPrice : undefined,
          minThreshold:        a.minStockThreshold,
          lastMovementDate:    lastMov?.date ?? a.stockEntryDate,
          stockEntryDate:      a.stockEntryDate,
          _realArticleId:      a.id,
          _sizeKey:            sizeLabel,
          qtyByStore:          computeQtyByStoreHelper(row, targetMovs),
        } as any);
      }
      continue;
    }

    // ── CAS 3 : article normal (1 couleur / 1 taille ou sans variante) ────────
    let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
    for (const m of artMovements) {
      if (m.reason === 'TRANSFERT') {
        if (activeStore === 'ALL') continue;
        if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
        if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
      } else {
        if (isVisibleForUser(m.storeId)) {
          if (m.type === 'IN') mouvIN += m.quantity;
          if (m.type === 'OUT') mouvOUT += m.quantity;
          if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
        }
      }
    }
    const initialQty = getInitialQtyForStore(a, activeStore, userStoreId, stores);
    const currentQty = Math.max(0, initialQty + mouvIN - mouvOUT + mouvADJ);
    const lastMovement = [...artMovements].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

    results.push({
      articleId:           a.id,
      categoryId:          a.categoryId,
      productName,
      color:               a.color !== 'various' ? a.color : undefined,
      size:                a.size  !== 'various' ? a.size  : undefined,
      unitOfMeasure:       a.unitOfMeasure || 'unité',
      purchasePricePerUnit: price,
      hasTTCCost,
      sellingPrice:        sellPrice,
      initialQty,
      mouvementsIn:        mouvIN,
      mouvementsOut:       mouvOUT,
      currentQty,
      totalValue:          currentQty * price,
      totalSellingValue:   sellPrice ? currentQty * sellPrice : undefined,
      minThreshold:        a.minStockThreshold,
      lastMovementDate:    lastMovement?.date ?? a.stockEntryDate,
      stockEntryDate:      a.stockEntryDate,
      qtyByStore:          computeQtyByStoreHelper(a, artMovements),
    });
  }
  const isWarehouseView = stores.find(s => s.id === activeStore)?.type === 'WAREHOUSE';
  if (isWarehouseView) {
    return results.filter(r => r.currentQty > 0);
  }

  return results;
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

  const [activeStore, setActiveStore] = useState<StoreLocation | 'ALL' | 'ALL_MAIN'>('ALL');
  const [hasInitMain, setHasInitMain] = useState(false);
  const [userRole, setUserRole] = useState<'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED' | 'LOADING'>('LOADING');
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const checkAccess = useCallback(async () => {
    if (!user?.email || !firestore) return;
    
    if (user.email === 'yahya.lebbar13@gmail.com') {
      setUserRole('ADMIN');
      setActiveStore('ALL');
      setAdminUid(user.uid);
      setDoc(doc(firestore, 'publicConfig', 'adminConfig'), { adminUid: user.uid }, { merge: true }).catch(() => {});
      return;
    }

    setUserRole('LOADING');
    setDebugInfo(`Vérification de ${user.email.toLowerCase()}...`);

    try {
      const emailKey = user.email.toLowerCase();
      const snap = await getDoc(doc(firestore, 'storeAccess', emailKey));
      if (snap.exists()) {
        const data = snap.data();
        setDebugInfo(`Trouvé: role=${data.role}, store=${data.storeId}, admin=${data.adminUid}`);
        if (data.adminUid) {
          setAdminUid(data.adminUid);
        } else {
          try {
            const adminSnap = await getDoc(doc(firestore, 'publicConfig', 'adminConfig'));
            if (adminSnap.exists()) setAdminUid(adminSnap.data().adminUid);
          } catch (_) {}
        }
        setActiveStore(data.storeId);
        setUserStoreId(data.storeId);
        setUserRole(data.role || 'COMMERCIAL');
        // activeView sera déterminé dynamiquement dans le useEffect ci-dessous
      } else {
        setDebugInfo(`Document storeAccess/${emailKey} n'existe pas dans Firestore`);
        setUserRole('UNAUTHORIZED');
      }
    } catch (error: any) {
      const msg = error?.code || error?.message || String(error);
      console.error('Error checking store access:', error);
      setDebugInfo(`Erreur Firestore: ${msg}`);
      setUserRole('UNAUTHORIZED');
    }
  }, [user?.uid, user?.email, firestore]);

  useEffect(() => {
    checkAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.email, firestore]);

  // ── Collections Firestore ──────────────────────────────────────────────────
  const articlesRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'articles'),         [firestore, adminUid, user]);
  const categoriesRef    = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'categories'),        [firestore, adminUid, user]);
  const genCatsRef       = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'generalCategories'), [firestore, adminUid, user]);
  const movementsRef     = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'stockMovements'),    [firestore, adminUid, user]);
  const salesRef         = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'sales'),             [firestore, adminUid, user]);
  const clientsRef       = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'clients'),           [firestore, adminUid, user]);
  const ordersRef        = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'saleOrders'),        [firestore, adminUid, user]);
  const invoicesRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'invoices'),          [firestore, adminUid, user]);
  const paymentsRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'clientPayments'),    [firestore, adminUid, user]);
  const facturesRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'factures'),          [firestore, adminUid, user]);
  const transfersRef     = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'transferOrders'),    [firestore, adminUid, user]);
  const storesRef        = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'stores'),            [firestore, adminUid, user]);

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
  const { data: rawTransfers,   isLoading: loadingTrans } = useCollection(transfersRef);
  const { data: rawStores,      isLoading: loadingStores } = useCollection(storesRef);

  const articles        = rawArticles    || [];
  const categories      = rawCategories  || [];
  const generalCategories = rawGenCats   || [];
  const allMovements    = (rawMovements  || []) as StockMovement[];
  const sales           = (rawSales      || []) as Sale[];
  const clients         = (rawClients    || []) as Client[];
  const orders          = (rawOrders     || []) as SaleOrder[];
  const invoices        = (rawInvoices   || []) as Invoice[];
  const payments        = (rawPayments   || []) as ClientPayment[];
  const factures        = rawFactures    || [];
  const transferOrders  = (rawTransfers  || []) as TransferOrder[];
  const stores          = rawStores      || [];

  // Initialisation sur ALL_MAIN si le commercial est le magasin principal
  useEffect(() => {
    if (userRole === 'COMMERCIAL' && stores.length > 0 && !hasInitMain && userStoreId) {
      const s = stores.find(x => x.id === userStoreId);
      if (s?.isMain || s?.id === 'CHRIFA') {
        setActiveStore('ALL_MAIN');
      }
      setHasInitMain(true);
    }
  }, [userRole, stores, userStoreId, hasInitMain]);

  // Initialize default stores if empty or run migration
  useEffect(() => {
    if (!firestore || !adminUid || loadingStores || userRole !== 'ADMIN') return;
    const runMigration = async () => {
      const migrated = localStorage.getItem('stores_migrated_v3');
      if (migrated) return;
      
      const defaults = [
        { id: 'ENTREPOT', name: 'Magasin CHRIFA', type: 'STORE', isMain: true },
        { id: 'DERB_OMAR', name: 'Magasin Derb Omar', type: 'STORE', isMain: false },
        { id: 'IDAA', name: 'Magasin Idaa', type: 'STORE', isMain: false },
      ];

      // Delete existing stores not in defaults
      for (const s of stores) {
        if (!defaults.find(d => d.id === s.id)) {
          await deleteDoc(doc(firestore, 'users', adminUid, 'stores', s.id));
        }
      }

      // Add/update defaults
      for (const s of defaults) {
        await setDoc(doc(firestore, 'users', adminUid, 'stores', s.id), s, { merge: true });
      }
      
      localStorage.setItem('stores_migrated_v3', 'true');
    };
    runMigration();
  }, [userRole, firestore, adminUid, loadingStores, stores]);

  // Filtrer les anciens arrivages (avant la date de réinitialisation)
  const RESET_DATE = '2026-07-06';
  const movements = useMemo(() => allMovements.filter(m => {
    if (m.reason === 'ARRIVAGE' && m.date < RESET_DATE) return false;
    return true;
  }), [allMovements]);

  const stockItems = useMemo(() =>
    computeStockItems(articles, movements, categories, activeStore, false, userRole, stores),
    [articles, movements, categories, activeStore, userRole, stores]
  );

  const allStockItems = useMemo(() =>
    computeStockItems(articles, movements, categories, activeStore, true, userRole, stores),
    [articles, movements, categories, activeStore, userRole, stores]
  );

  const isIncludedInAllMain = (id: string | undefined) => {
    if (!id || id === 'ENTREPOT') return true;
    const store = stores.find(s => s.id === id);
    return store ? (store.isMain || store.type === 'WAREHOUSE') : false;
  };

  // Filtrer les données selon le magasin actif pour les vues (sauf Admin "ALL")
  const filteredSales = useMemo(() => sales.filter(s => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && isIncludedInAllMain(s.storeId)) || s.storeId === activeStore || (!s.storeId && activeStore === 'ENTREPOT')), [sales, activeStore, stores]);
  const filteredClients = useMemo(() => clients.filter(c => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && isIncludedInAllMain(c.storeId)) || c.storeId === activeStore || (!c.storeId && activeStore === 'ENTREPOT')), [clients, activeStore, stores]);
  const filteredOrders = useMemo(() => orders.filter(o => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && isIncludedInAllMain(o.storeId)) || o.storeId === activeStore || (!o.storeId && activeStore === 'ENTREPOT')), [orders, activeStore, stores]);
  const filteredInvoices = useMemo(() => invoices.filter(i => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && isIncludedInAllMain(i.storeId)) || i.storeId === activeStore || (!i.storeId && activeStore === 'ENTREPOT')), [invoices, activeStore, stores]);
  const filteredMovements = useMemo(() => movements.filter(m => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && (isIncludedInAllMain(m.storeId) || isIncludedInAllMain(m.toStoreId))) || m.storeId === activeStore || m.toStoreId === activeStore || (!m.storeId && activeStore === 'ENTREPOT')), [movements, activeStore, stores]);
  const filteredTransfers = useMemo(() => transferOrders.filter(t => activeStore === 'ALL' || (activeStore === 'ALL_MAIN' && (isIncludedInAllMain(t.fromStore) || isIncludedInAllMain(t.toStore))) || t.fromStore === activeStore || t.toStore === activeStore), [transferOrders, activeStore, stores]);

  const alertCount = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
  const openInvoices = invoices.filter(i => i.status === 'UNPAID' || i.status === 'PARTIAL').length;
  const pendingArrivals = factures.filter((f: any) => f.arrivalDate && !f.stockEntryDate).length;

  // Pass-to-stock modal (depuis onglet Arrivages)
  const [passToStockId, setPassToStockId] = useState<string | null>(null);

  const isLoading = isUserLoading || loadingArt || loadingCat;

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

  // ── Backup JSON ──────────────────────────────────────────────────────────
  const handleBackup = useCallback(() => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`;
    const backup = {
      exportedAt: now.toISOString(),
      exportedBy: user?.email || user?.uid,
      collections: {
        articles,
        categories,
        generalCategories,
        stockMovements: filteredMovements,
        factures,
        clients: filteredClients,
        saleOrders: filteredOrders,
        invoices: filteredInvoices,
        clientPayments: payments,
        sales: filteredSales,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lebtex-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '✅ Backup téléchargé', description: `lebtex-backup-${stamp}.json` });
  }, [articles, categories, generalCategories, movements, factures, clients, orders, invoices, payments, sales, user, toast]);

  // POS rapide (ancienne vente)
  const handleValidateSale = useCallback(async (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    if (!user || !firestore || (!adminUid && userRole !== 'ADMIN')) return;
    const effectiveUid = adminUid || user.uid;
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? 'ENTREPOT' : activeStore;
    await addDoc(collection(firestore, 'users', effectiveUid, 'sales'), { ...sale, storeId, createdAt: serverTimestamp() });
    for (const item of sale.items) {
      await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), {
        articleId: item.articleId, categoryId: item.categoryId,
        productName: item.productName, color: item.color || null, size: item.size || null,
        unitOfMeasure: item.unitOfMeasure, type: 'OUT', reason: 'VENTE',
        storeId,
        quantity: item.qty, date: sale.date,
        notes: sale.clientName ? `Vente à ${sale.clientName}` : 'Vente directe',
        createdAt: serverTimestamp(),
      });
    }
    toast({ title: '✅ Vente enregistrée !', description: `Total : ${sale.totalAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} — ${sale.items.length} produit(s)` });
  }, [user, firestore, toast, activeStore, adminUid, userRole]);

  // ── Clients ──────────────────────────────────────────────────────────────
  const handleCreateClient = useCallback(async (data: Omit<Client, 'id' | 'createdAt'>): Promise<Client> => {
    if (!user || !firestore) throw new Error('Not authenticated');
    const effectiveUid = adminUid || user.uid;
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? undefined : activeStore;
    const clientData = storeId ? { ...data, storeId } : data;
    const ref = await addDoc(collection(firestore, 'users', effectiveUid, 'clients'), { ...clientData, createdAt: serverTimestamp() });
    toast({ title: '✅ Client créé', description: data.name });
    return { id: ref.id, ...clientData };
  }, [user, firestore, toast, activeStore, adminUid]);

  const handleUpdateClient = useCallback(async (id: string, data: Partial<Client>) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'clients', id), data);
    toast({ title: 'Client mis à jour' });
  }, [user, firestore, toast, adminUid]);

  // ── Bons de commande ──────────────────────────────────────────────────────
  const handleCreateOrder = useCallback(async (order: Omit<SaleOrder, 'id' | 'createdAt'>): Promise<string> => {
    if (!user || !firestore) throw new Error('Not authenticated');
    const effectiveUid = adminUid || user.uid;
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? 'ENTREPOT' : activeStore;
    const ref = await addDoc(collection(firestore, 'users', effectiveUid, 'saleOrders'), { ...order, storeId, createdAt: serverTimestamp() });
    toast({ title: '✅ Bon de commande créé', description: `${order.items.length} article(s) · ${order.totalAfterDiscount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}` });
    return ref.id;
  }, [user, firestore, toast, activeStore, adminUid]);

  const handleUpdateOrderStatus = useCallback(async (id: string, status: SaleOrderStatus) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'saleOrders', id), { status });
  }, [user, firestore, adminUid]);

  const handleConvertToInvoice = useCallback(async (order: SaleOrder) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const invRef = await addDoc(collection(firestore, 'users', effectiveUid, 'invoices'), {
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
      storeId: order.storeId || ((activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? 'ENTREPOT' : activeStore),
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(firestore, 'users', effectiveUid, 'saleOrders', order.id), { status: 'INVOICED' });
    toast({ title: '✅ Facture créée', description: `BC converti en facture` });
    setActiveView('invoices');
  }, [user, firestore, toast, activeStore, adminUid]);

  // ── Factures ──────────────────────────────────────────────────────────────
  const handleCreateInvoice = useCallback(async (
    invoice: Omit<Invoice, 'id' | 'createdAt'>,
    movementsOut: any[],
    initialPayments?: Omit<ClientPayment, 'id' | 'createdAt'>[]
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? 'ENTREPOT' : activeStore;
    const invRef = await addDoc(collection(firestore, 'users', effectiveUid, 'invoices'), {
      ...cleanUndefined(invoice),
      storeId,
      createdAt: serverTimestamp()
    });
    for (const m of movementsOut) {
      await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), {
        ...cleanUndefined(m),
        storeId,
        createdAt: serverTimestamp()
      });
    }
    if (initialPayments && initialPayments.length > 0) {
      for (const p of initialPayments) {
        await addDoc(collection(firestore, 'users', effectiveUid, 'clientPayments'), {
          ...cleanUndefined(p),
          invoiceId: invRef.id,
          createdAt: serverTimestamp()
        });
      }
    }
    toast({ title: '✅ Facture créée !', description: `${invoice.items.length} article(s) · ${invoice.totalAfterDiscount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` });
  }, [user, firestore, toast, activeStore, adminUid]);

  const handleUpdateInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', id), { status });
  }, [user, firestore, adminUid]);

  // ── Paiements clients ─────────────────────────────────────────────────────
  const handleRecordMultiplePayments = useCallback(async (
    paymentList: Omit<ClientPayment, 'id' | 'createdAt'>[],
    invoiceUpdates?: { invoiceId: string; paidAmount: number; remainingBalance: number; status: InvoiceStatus }[]
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;

    for (const payment of paymentList) {
      const cleaned = cleanUndefined(payment);
      await addDoc(collection(firestore, 'users', effectiveUid, 'clientPayments'), {
        ...cleaned,
        createdAt: serverTimestamp()
      });
    }

    if (invoiceUpdates && invoiceUpdates.length > 0) {
      for (const upd of invoiceUpdates) {
        await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', upd.invoiceId), {
          paidAmount: upd.paidAmount,
          remainingBalance: upd.remainingBalance,
          status: upd.status,
        });
      }
    } else {
      for (const payment of paymentList) {
        if (payment.invoiceId) {
          const inv = invoices.find(i => i.id === payment.invoiceId);
          if (inv) {
            const newPaid = (inv.paidAmount || 0) + payment.amount;
            const newBalance = Math.max(0, (inv.totalAfterDiscount || 0) - newPaid);
            const newStatus: InvoiceStatus = newBalance === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
            await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', payment.invoiceId), {
              paidAmount: newPaid,
              remainingBalance: newBalance,
              status: newStatus,
            });
          }
        }
      }
    }

    const totalAmount = paymentList.reduce((sum, p) => sum + (p.amount || 0), 0);
    const methods = Array.from(new Set(paymentList.map(p => p.method))).join(', ');
    toast({
      title: '✅ Paiement(s) validé(s)',
      description: `${totalAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD (${methods})`
    });
  }, [user, firestore, adminUid, invoices, toast]);

  const handleRecordPayment = useCallback(async (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => {
    await handleRecordMultiplePayments([payment]);
  }, [handleRecordMultiplePayments]);

  const handleUpdatePaymentStatus = useCallback(async (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'clientPayments', paymentId), { status });

    // When rejecting a payment, re-open the balance on the associated invoice
    if (status === 'REJECTED') {
      const payment = payments.find((p: any) => p.id === paymentId);
      if (payment?.invoiceId) {
        const invoice = invoices.find((inv: any) => inv.id === payment.invoiceId);
        if (invoice) {
          const newRemaining = Math.min(invoice.totalAfterDiscount, (invoice.remainingBalance || 0) + payment.amount);
          const newPaid = Math.max(0, (invoice.paidAmount || 0) - payment.amount);
          const newStatus = newPaid <= 0 ? 'UNPAID' : newPaid < invoice.totalAfterDiscount ? 'PARTIAL' : 'PAID';
          await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', payment.invoiceId), {
            remainingBalance: newRemaining,
            paidAmount: newPaid,
            status: newStatus,
          });
        }
      }
    }

    toast({ title: '✅ Statut mis à jour', description: `Effet marqué comme ${status}` });
  }, [user, firestore, adminUid, toast, payments, invoices]);

  // ── Navigation et droits (doit être avant les early returns pour éviter React Error 310) ──
  const navItemsRaw = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard',    category: 'dashboard', icon: LayoutDashboard, adminOnly: true },
    { id: 'alerts',    label: 'Alertes',       category: 'dashboard', icon: Bell,            badge: alertCount, adminOnly: true },
    { id: 'audit',    label: 'Journal',       category: 'dashboard', icon: List,            adminOnly: true },

    { id: 'sale',      label: 'Caisse',         category: 'commerce', icon: ShoppingCart,   color: 'violet', pointOfSaleOnly: true },
    { id: 'clients',   label: 'Clients',       category: 'commerce', icon: Users,           pointOfSaleOnly: true },
    { id: 'orders',    label: 'Commandes',     category: 'commerce', icon: ClipboardList,   pointOfSaleOnly: true },
    { id: 'invoices',  label: 'Bons de Commande', category: 'commerce', icon: FileText,        badge: openInvoices, pointOfSaleOnly: true },

    { id: 'stock',     label: 'En Stock',      category: 'logistique', icon: Package,         color: 'emerald' },
    { id: 'arrivals',  label: 'Arrivages',     category: 'logistique', icon: Anchor,          badge: pendingArrivals, color: 'amber', adminOnly: true },
    { id: 'movements', label: 'Mouvements',    category: 'logistique', icon: ArrowLeftRight },
    { id: 'transfers', label: 'Transferts',    category: 'logistique', icon: Truck,           color: 'blue' },
    { id: 'inventory', label: 'Inventaire',    category: 'logistique', icon: Boxes },
    { id: 'blind-inventory', label: 'Inv. Aveugle', category: 'logistique', icon: Boxes,        color: 'amber' },

    { id: 'treasury',  label: 'Trésorerie',    category: 'finance', icon: Landmark,        color: 'emerald', adminOnly: true },
    { id: 'reconciliation', label: 'Rappro. Bancaire', category: 'finance', icon: ArrowLeftRight, color: 'blue', adminOnly: true },
    
    { id: 'warehouses', label: 'Lieux/Entrepôts', category: 'settings', icon: Home, adminOnly: true },
    { id: 'stores',     label: 'Magasins',      category: 'settings', icon: MapPin, adminOnly: true }
  ], [pendingArrivals, openInvoices, alertCount]);

  const currentStore = activeStore !== 'ALL' ? stores.find(s => s.id === activeStore) : null;
  const isWarehouse = currentStore?.type === 'WAREHOUSE';

  const navItems = useMemo(() => navItemsRaw.filter(item => {
    // removed the arbitrary activeStore restriction
    if (item.adminOnly && userRole === 'COMMERCIAL') return false;
    if (item.commercialOnly && userRole === 'ADMIN') return false;
    if (item.pointOfSaleOnly && isWarehouse) return false;
    if (item.adminOrMainOnly && userRole !== 'ADMIN' && !(userRole === 'COMMERCIAL' && stores.some(s => s.id === userStoreId && (s.isMain || s.id === 'CHRIFA')))) return false;
    return true;
  }), [navItemsRaw, userRole, isWarehouse, stores, userStoreId, activeStore]);

  // Si on est sur une vue cachée par le changement de magasin (ex: WAREHOUSE), on switch
  useEffect(() => {
    if (!navItems.find(n => n.id === activeView)) {
      if (userRole === 'ADMIN') setActiveView('dashboard');
      else setActiveView('stock');
    }
  }, [navItems, activeView, userRole]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (isUserLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
    </div>
  );
  if (!user) return <AuthView />;
  if (userRole === 'LOADING') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
    </div>
  );

  if (userRole === 'UNAUTHORIZED') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0faf4] gap-4 p-6">
        <h2 className="text-2xl font-black text-red-600 uppercase">Accès Refusé</h2>
        <p className="text-stone-500 font-bold text-center">Cette adresse email ({user?.email}) n'est pas autorisée.</p>
        {debugInfo && (
          <p className="text-xs text-stone-400 bg-stone-100 px-4 py-2 rounded-lg font-mono max-w-md text-center">{debugInfo}</p>
        )}
        <div className="flex gap-3 mt-2">
          <Button onClick={() => checkAccess()} variant="outline" className="border-emerald-300 text-emerald-600">
            Réessayer
          </Button>
          <Button onClick={() => auth.signOut()} variant="outline" className="border-stone-300 text-stone-600">
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }


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

          <div className="hidden md:flex items-center ml-4">
            <Select value={activeStore} onValueChange={(val) => setActiveStore(val as any)}>
              <SelectTrigger className="h-8 bg-stone-100 border-stone-200 text-[10px] font-black uppercase tracking-widest text-stone-600 rounded-lg min-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userRole === 'ADMIN' && (
                  <SelectItem value="ALL">🌐 Vue Globale (Admin)</SelectItem>
                )}
                {userRole === 'COMMERCIAL' && stores.find(s => s.id === userStoreId)?.isMain && (
                  <SelectItem value="ALL_MAIN">🌐 Vue Globale (Principal + Entrepôts)</SelectItem>
                )}
                
                {stores.filter(s => {
                  if (userRole === 'ADMIN') return true;
                  if (userRole === 'COMMERCIAL') {
                    const myStore = stores.find(x => x.id === userStoreId);
                    if (myStore?.isMain) {
                      return s.id === userStoreId || s.type === 'WAREHOUSE';
                    }
                    return s.id === userStoreId;
                  }
                  return false;
                }).map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.type === 'WAREHOUSE' ? '📦' : '🏪'} {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Ligne 1 : Catégories principales ── */}
          <div className="flex-1 flex items-center justify-center overflow-x-auto px-4 hide-scrollbar">
            <div className="flex items-center gap-1">
              {[
                { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
                { id: 'commerce', label: 'Commerce', icon: ShoppingCart },
                { id: 'logistique', label: 'Logistique', icon: Package },
                { id: 'finance', label: 'Finance', icon: Landmark },
                { id: 'settings', label: 'Paramètres', icon: Settings }
              ].map(cat => {
                const catItems = navItems.filter(n => n.category === cat.id);
                if (catItems.length === 0) return null;
                const isActive = navItems.find(n => n.id === activeView)?.category === cat.id;
                
                return (
                  <button key={cat.id} 
                    onClick={() => setActiveView(catItems[0].id as StockView)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                      isActive 
                        ? 'bg-stone-900 text-white shadow-md' 
                        : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                    }`}>
                    <cat.icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-[9px] font-black text-stone-500 hover:bg-stone-100 uppercase tracking-wider transition-colors">
              ← StockVue
            </a>
            <Button variant="ghost" size="sm" onClick={handleBackup}
              title="Télécharger une sauvegarde complète de toutes vos données"
              className="hidden sm:flex items-center gap-1.5 text-[9px] font-black text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 h-9 px-3 rounded-xl border border-emerald-200 uppercase tracking-wider">
              <Download className="w-3.5 h-3.5" /> Backup
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}
              className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Ligne 2 : Sous-menu contextuel (Desktop & Mobile) ── */}
        <div className="flex border-t border-stone-100 bg-stone-50 px-4 py-2 gap-2 overflow-x-auto hide-scrollbar shadow-inner">
          {navItems.filter(n => n.category === (navItems.find(n => n.id === activeView)?.category || 'dashboard')).map(({ id, label, icon: Icon, badge, color }) => (
            <button key={id} onClick={() => setActiveView(id as StockView)}
              className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase whitespace-nowrap transition-all ${
                activeView === id
                  ? color === 'violet' ? 'bg-violet-600 text-white shadow-sm' 
                    : color === 'amber' ? 'bg-amber-500 text-white shadow-sm'
                    : color === 'emerald' ? 'bg-emerald-600 text-white shadow-sm'
                    : color === 'blue' ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-stone-900 shadow-sm border border-stone-200'
                  : 'text-stone-500 hover:bg-stone-200/50'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge != null && badge > 0 && (
                <span className={`w-4 h-4 ml-1 rounded-full text-white text-[7.5px] font-black flex items-center justify-center ${
                  id === 'alerts' ? 'bg-red-500' : id === 'invoices' ? 'bg-orange-500' : 'bg-emerald-500'
                }`}>{badge > 99 ? '99+' : badge}</span>
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
              <StockDashboard userRole={userRole} activeStore={activeStore} stores={stores} stockItems={stockItems} movements={filteredMovements} categories={categories} sales={filteredSales} invoices={filteredInvoices} clients={filteredClients} onNavigate={(v) => setActiveView(v as any)} />
            )}
            {activeView === 'sale' && (
              <StockSaleFlow
                userRole={userRole}
                stockItems={stockItems}
                categories={categories}
                generalCategories={generalCategories}
                clients={filteredClients}
                invoices={invoices}
                onCreateOrder={handleCreateOrder}
                onCreateInvoice={handleCreateInvoice}
                onCreateClient={handleCreateClient}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'clients' && (
              <StockClients
                clients={filteredClients}
                orders={orders}
                invoices={invoices}
                payments={payments}
                onCreateClient={async (c) => { await handleCreateClient(c); }}
                onUpdateClient={handleUpdateClient}
                onRecordPayment={handleRecordPayment}
                onRecordMultiplePayments={handleRecordMultiplePayments}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'orders' && (
              <StockOrders
                orders={filteredOrders}
                clients={filteredClients}
                onUpdateStatus={handleUpdateOrderStatus}
                onConvertToInvoice={handleConvertToInvoice}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'invoices' && (
              <StockInvoices
                invoices={filteredInvoices}
                clients={filteredClients}
                payments={payments}
                onRecordPayment={handleRecordPayment}
                onRecordMultiplePayments={handleRecordMultiplePayments}
                onUpdateStatus={handleUpdateInvoiceStatus}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'stock' && (
              <StockFiches stockItems={stockItems} movements={movements} categories={categories} generalCategories={generalCategories} factures={factures} />
            )}
            {activeView === 'inventory' && (
              <StockFiches
                isInventoryView={true}
                userRole={userRole}
                adminUid={adminUid}
                activeStore={activeStore}
                stockItems={allStockItems}
                movements={movements}
                categories={categories}
                generalCategories={generalCategories}
                factures={factures}
                onAddMovement={handleAddMovement}
              />
            )}
            {activeView === 'treasury' && (
              <TreasuryDashboard payments={payments} clients={clients} invoices={invoices} onUpdatePaymentStatus={handleUpdatePaymentStatus} />
            )}
            {activeView === 'reconciliation' && (
              <BankReconciliationView payments={payments} clients={clients} />
            )}
            {activeView === 'movements' && (
              <StockMovements activeStore={activeStore} movements={filteredMovements} stockItems={stockItems} categories={categories} articles={articles} stores={stores} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'alerts' && (
              <StockAlerts stockItems={stockItems} articles={articles} categories={categories} movements={filteredMovements} activeStore={activeStore} onNavigate={setActiveView} adminUid={adminUid} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'blind-inventory' && (
              <BlindInventory stockItems={allStockItems} categories={categories} activeStore={activeStore} adminUid={adminUid} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'audit' && (
              <AuditLogView entries={[]} />
            )}
            {activeView === 'transfers' && (
              <TransferOrdersView
                transferOrders={filteredTransfers}
                stockItems={stockItems}
                stores={stores}
                userRole={userRole}
                activeStore={activeStore}
                adminUid={adminUid}
              />
            )}
            {activeView === 'warehouses' && (
              <StockWarehouses
                stores={stores}
                stockItems={stockItems}
                movements={filteredMovements}
                userRole={userRole}
                userStoreId={userStoreId}
                onSelectStore={(storeId) => {
                  setActiveStore(storeId as any);
                  setActiveView('inventory');
                }}
              />
            )}
            {activeView === 'stores' && (
              <StoresView stores={stores} adminUid={adminUid} />
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
                    {[...factures].filter(f => !f.arrivalDate || f.arrivalDate >= RESET_DATE).sort((a: any, b: any) => (b.arrivalDate || '').localeCompare(a.arrivalDate || '')).map((f: any) => {
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
