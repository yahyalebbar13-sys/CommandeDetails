"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, LogOut, LayoutDashboard, List, ArrowLeftRight, Bell, Package,
  Boxes, ShoppingCart, TrendingUp, Users, ClipboardList, FileText, Anchor, Archive, CheckCircle2, Download, Truck, Store as StoreIcon,
  Settings, MapPin, Home, AlertTriangle, Building2, Sparkles, Warehouse, CreditCard, Receipt, Search,
  Calendar, Clock, Filter, Lock, RotateCcw, Globe, WifiOff
} from 'lucide-react';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, doc, addDoc, updateDoc, setDoc, getDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type {
  StockMovement, StockItem, Sale, StoreLocation,
  Client, SaleOrder, SaleOrderStatus, Invoice, InvoiceStatus, ClientPayment, CashingCompany, CommercialExpense,
  CheckRemittance, RemittanceStatus, CheckRemittanceItem, TransferOrder
} from '@/lib/types';
import { canDeclareImpaye } from '@/lib/types';
import { logAudit } from '@/lib/audit-log';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { exportCheckRemittancePDF } from '@/lib/pdf-export-reports';
import { ADMIN_EMAIL, getLocalDateString } from '@/lib/constants';
import { isArrivalOlderThanOneMonth } from '@/lib/status-utils';
import StockDashboard   from './stock-dashboard';
import StockMovements   from './stock-movements';
import BlindInventory   from './blind-inventory';
import GlobalSearch     from './global-search';
import StockAlerts      from './stock-alerts';
import StockSaleFlow    from './stock-sale-flow';
// import StockSales       from './stock-sales';
import StockClients     from './stock-clients';
import StockOrders      from './stock-orders';
import StockInvoices    from './stock-invoices';
import PassToStockModal from '@/components/pass-to-stock-modal';
import StockFiches      from './stock-fiches';
import AuthView         from '@/components/auth-view';
import { cleanUndefined } from '@/lib/utils';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import TransferOrdersView from './transfer-orders-view';
import StoresView       from './stores-view';
import StockWarehouses  from './stock-warehouses';
import TreasuryDashboard from './treasury-dashboard';
import BankReconciliationView from './bank-reconciliation-view';
import AuditLogView from './audit-log-view';
import ChequesImpayesView from './cheques-impayes-view';
import CommercialExpensesView from './commercial-expenses-view';
import { Landmark } from 'lucide-react';

type StockView = 'dashboard' | 'sale' | 'stock' | 'analytics' | 'clients' | 'orders' | 'invoices' | 'cheques-impayes' | 'expenses' | 'movements' | 'alerts' | 'arrivals' | 'transfers' | 'stores' | 'warehouses' | 'treasury' | 'reconciliation' | 'audit' | 'inventory';

// ─── Calcul du stock courant ─────────────────────────────────────────────────

function getInitialQtyForStore(item: any, activeStore: string, userStoreId: string, stores: any[]): number {
  const byStore = item.initialQtyByStore;
  if (!byStore) {
    return 0;
  }

  if (activeStore === 'ALL') {
    return Object.values(byStore).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
  }

  if (activeStore === 'ALL_MAIN') {
    const sId = userStoreId || 'CHRIFA';
    return Number(byStore[sId]) || 0;
  }

  // Pour un magasin spécifique ou un entrepôt spécifique sélectionné : strictement son stock propre
  return Number(byStore[activeStore]) || 0;
}

export function computeStockItems(
  articles: any[],
  movements: StockMovement[],
  categories: any[],
  activeStore: StoreLocation | 'ALL' | 'ALL_MAIN' = 'ALL',
  includeAll: boolean = false,
  userRole: string = 'ADMIN',
  stores: any[] = [],
  userStoreId: string = '',
  generalCategories: any[] = [],
  factures: any[] = []
): StockItem[] {
  // Arrivages de plus d'un mois : leur stock ne doit PAS être pris en compte (marchandise épuisée avant logiciel)
  const oldFactureIds = new Set<string>();
  for (const f of (factures || [])) {
    if (f?.id && isArrivalOlderThanOneMonth(f.arrivalDate)) {
      oldFactureIds.add(String(f.id));
    }
  }

  const isArticleFromOldArrival = (art: any) => {
    if (!art) return false;
    if (art.factureId && oldFactureIds.has(String(art.factureId))) return true;
    if (art.facture && oldFactureIds.has(String(art.facture))) return true;
    if (isArrivalOlderThanOneMonth(art.arrivalDate)) return true;
    return false;
  };

  const isOldArrivalMovement = (m: StockMovement) => {
    if (m.reason === 'ARRIVAGE') {
      if (m.factureId && oldFactureIds.has(String(m.factureId))) return true;
      if (m.factureRef && oldFactureIds.has(String(m.factureRef))) return true;
      if (m.articleId) {
        const art = articles.find(x => x.id === m.articleId);
        if (art && isArticleFromOldArrival(art)) return true;
      }
    }
    return false;
  };

  const isVisibleForUser = (storeId: string | undefined) => {
    if (activeStore === 'ALL') return true;
    const sId = storeId || 'CHRIFA';
    
    if (activeStore === 'ALL_MAIN') {
      return sId === userStoreId || (!userStoreId && sId === 'CHRIFA');
    }

    // Tout magasin ou entrepôt individuel : strictement son propre stock
    return sId === activeStore;
  };

  const computeQtyByStoreHelper = (itemRow: any, targetMovs: any[], isOld: boolean = false) => {
    const qtyByStore: Record<string, number> = isOld ? {} : { ...(itemRow.initialQtyByStore || {}) };
    for (const m of targetMovs) {
      if (isOldArrivalMovement(m)) continue;
      if (m.reason === 'TRANSFERT') {
        if (m.type === 'OUT') {
          const src = m.storeId || 'CHRIFA';
          qtyByStore[src] = (qtyByStore[src] || 0) - m.quantity;
        } else if (m.type === 'IN') {
          const dest = m.storeId || m.toStoreId || 'CHRIFA';
          qtyByStore[dest] = (qtyByStore[dest] || 0) + m.quantity;
        } else {
          // Mouvement legacy sans type explicite
          if (m.storeId) qtyByStore[m.storeId] = (qtyByStore[m.storeId] || 0) - m.quantity;
          if (m.toStoreId) qtyByStore[m.toStoreId] = (qtyByStore[m.toStoreId] || 0) + m.quantity;
        }
      } else {
        const sId = m.storeId || 'CHRIFA';
        qtyByStore[sId] = qtyByStore[sId] || 0;
        if (m.type === 'IN') qtyByStore[sId] += m.quantity;
        if (m.type === 'OUT') qtyByStore[sId] -= m.quantity;
        if (m.type === 'ADJUSTMENT') qtyByStore[sId] += m.quantity;
      }
    }
    return qtyByStore;
  };
  const stockArticles = includeAll ? articles : articles.filter(a => {
    const isOld = isArticleFromOldArrival(a);
    const validMovs = movements.filter(m => m.articleId === a.id && !isOldArrivalMovement(m));
    if (isOld) {
      return validMovs.length > 0;
    }
    return validMovs.length > 0 || (a.initialQtyByStore && Object.values(a.initialQtyByStore).some((v: any) => Number(v) > 0));
  });

  const results: StockItem[] = [];

  for (const a of stockArticles) {
    const isOldArrival = isArticleFromOldArrival(a);
    // ── Lookup catégorie et nom du produit ─────────────────────────────────────
    const cat = categories.find(c => c.id === a.categoryId || c.name === a.categoryId);
    const catNameFR = cat?.nameFR;
    const genCat = generalCategories.find(g => g.id === cat?.generalCategoryId || g.id === a.generalCategoryId);
    const poleNameFR = genCat?.nameFR;
    const baseCategoryName = (cat?.name || a.categoryId || a.name || '').trim();

    // Matcher la qualité dans la catégorie si configurée
    const matchedZipperQ = cat?.zipperQualities?.find((q: any) =>
      (a.quality && q.label?.toLowerCase() === a.quality.toLowerCase()) ||
      (q.zipperType === a.zipperType && q.slider === a.slider)
    );
    const matchedFabricQ = cat?.fabricQualities?.find((q: any) =>
      a.quality && q.label?.toLowerCase() === a.quality.toLowerCase()
    );
    const matchedThreadQ = cat?.threadQualities?.find((q: any) =>
      (a.quality && q.label?.toLowerCase() === a.quality.toLowerCase()) ||
      (q.coneWeightG && a.coneWeightG && String(q.coneWeightG) === String(a.coneWeightG) &&
       q.threadWeightG && a.threadWeightG && String(q.threadWeightG) === String(a.threadWeightG))
    );
    const matchedSliderQ = cat?.sliderQualities?.find((q: any) =>
      (a.quality && q.label?.toLowerCase() === a.quality.toLowerCase()) ||
      (a.designRef && q.label?.toLowerCase() === a.designRef.toLowerCase())
    );
    const qualityNameFR = matchedZipperQ?.nameFR || matchedFabricQ?.nameFR || matchedThreadQ?.nameFR || matchedSliderQ?.nameFR;
    const itemFR = a.nameFR || qualityNameFR || catNameFR;

    // Nom complet du produit (ne pas tronquer la catégorie/produit)
    const parts: string[] = [];
    if (a.zipperType && !baseCategoryName.toLowerCase().includes(a.zipperType.toLowerCase())) {
      parts.push(a.zipperType);
    }
    if (a.slider && !baseCategoryName.toLowerCase().includes(a.slider.toLowerCase())) {
      parts.push(a.slider);
    }
    const fullEnglishName = parts.length > 0 ? `${baseCategoryName} ${parts.join(' ')}`.trim() : (baseCategoryName || a.name || a.specs || 'Produit');
    const productName = itemFR || fullEnglishName;

    const hasTTCCost = Number(a.purchasePriceMAD) > 0;
    const price      = Number(a.purchasePriceMAD) || Number(a.purchasePricePerUnit) || 0;
    const sellPrice  = Number(a.sellingPrice) || undefined;

    const artMovements = movements.filter(m => m.articleId === a.id);

    const qualityBreakdown: any[] = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown : [];
    const colorBreakdown: any[] = Array.isArray(a.colorBreakdown) ? a.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(a.sizeBreakdown)  ? a.sizeBreakdown  : [];

    // ── CAS 0 : qualityBreakdown renseigné (multi-qualités fabric ou zipper ou thread ou slider) ──
    if (qualityBreakdown.length > 0) {
      const totalQualityQty = qualityBreakdown.reduce((s, r) => s + (Number(r.quantity) || 0), 0) || 1;
      for (const row of qualityBreakdown) {
        const qualityLabel = (row.quality || '').trim();
        if (!qualityLabel) continue;

        const matchedRowQ = cat?.fabricQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.zipperQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.threadQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.sliderQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase());
        
        const rowNameFR = row.nameFR || matchedRowQ?.nameFR || itemFR;
        const rowProductName = rowNameFR || (qualityLabel ? `${baseCategoryName} ${qualityLabel}`.trim() : productName);

        const rowPrice = (row.priceOverride !== '' && row.priceOverride !== undefined && Number(row.priceOverride) > 0)
          ? Number(row.priceOverride)
          : price;

        let initialQty = 0;
        if (!isOldArrival) {
          if (row.initialQtyByStore) {
            initialQty = getInitialQtyForStore(row, activeStore, userStoreId, stores);
          } else if (a.initialQtyByStore) {
            const rowRatio = (Number(row.quantity) || 0) / totalQualityQty;
            const proratedStoreMap: Record<string, number> = {};
            Object.entries(a.initialQtyByStore).forEach(([sId, val]) => {
              proratedStoreMap[sId] = Math.round((Number(val) || 0) * rowRatio);
            });
            initialQty = getInitialQtyForStore({ initialQtyByStore: proratedStoreMap }, activeStore, userStoreId, stores);
          }
        }

        const qualityMov = artMovements.filter(m =>
          m.quality?.toLowerCase() === qualityLabel.toLowerCase()
        );
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = qualityMov.length > 0
          ? qualityMov
          : artMovements.map(m => ({
              ...m,
              quantity: Math.round((m.quantity * (Number(row.quantity) || 1)) / totalQualityQty)
            }));

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            if (activeStore === 'ALL') continue;
            if (m.type === 'OUT') {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
            } else if (m.type === 'IN') {
              if (isVisibleForUser(m.storeId || m.toStoreId)) mouvIN += m.quantity;
            } else {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
              if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
            }
          } else {
            if (isVisibleForUser(m.storeId)) {
              if (m.type === 'IN') mouvIN += m.quantity;
              if (m.type === 'OUT') mouvOUT += m.quantity;
              if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
            }
          }
        }

        const currentQty = initialQty + mouvIN - mouvOUT + mouvADJ;
        const lastMov = [...qualityMov].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

        results.push({
          articleId:           `${a.id}__quality__${qualityLabel}`,
          categoryId:          a.categoryId,
          categoryNameFR:      catNameFR,
          poleNameFR:          poleNameFR,
          productName:         rowProductName,
          nameFR:              rowNameFR,
          color:               a.color !== 'various' ? a.color : (row.color || undefined),
          size:                row.size || (a.size !== 'various' ? a.size : undefined),
          quality:             qualityLabel,
          gsm:                 row.gsm ?? a.gsm,
          fabricWidth:         row.fabricWidth ?? a.fabricWidth,
          rollLength:          row.rollLength ?? a.rollLength,
          rollLengthUnit:      row.rollLengthUnit ?? a.rollLengthUnit,
          packagingPerBag:     row.packagingPerBag ?? a.packagingPerBag,
          zipperType:          row.zipperType ?? a.zipperType,
          slider:              row.slider ?? a.slider,
          sliderType:          row.sliderType ?? a.sliderType,
          tapeWeightGsm:       row.tapeWeightGsm ?? a.tapeWeightGsm,
          sliderWeightG:       row.sliderWeightG ?? a.sliderWeightG,
          pcsPerBag:           row.pcsPerBag ?? a.pcsPerBag,
          bagsPerCarton:       row.bagsPerCarton ?? a.bagsPerCarton,
          unitOfMeasure:       a.unitOfMeasure || 'unité',
          purchasePricePerUnit: rowPrice,
          hasTTCCost,
          sellingPrice:        sellPrice,
          initialQty,
          mouvementsIn:        mouvIN,
          mouvementsOut:       mouvOUT,
          currentQty,
          totalValue:          currentQty * rowPrice,
          totalSellingValue:   sellPrice ? currentQty * sellPrice : undefined,
          minThreshold:        a.minStockThreshold,
          lastMovementDate:    lastMov?.date ?? a.stockEntryDate,
          stockEntryDate:      a.stockEntryDate,
          _realArticleId:      a.id,
          _qualityKey:         qualityLabel,
          qtyByStore:          computeQtyByStoreHelper(row.initialQtyByStore ? row : a, targetMovs, isOldArrival),
        } as any);
      }
      continue;
    }

    // ── CAS 1 : color === 'various' ET colorBreakdown renseigné ──────────────
    if ((a.color === 'various' || a.color === 'Various') && colorBreakdown.length > 0) {
      // Un StockItem par entrée dans colorBreakdown
      for (const row of colorBreakdown) {
        const colorLabel = (row.colorCode || row.description || row.color || '').trim();
        if (!colorLabel) continue;

        const initialQty = isOldArrival ? 0 : getInitialQtyForStore(row, activeStore, userStoreId, stores);

        // Mouvements filtrés : ceux qui mentionnent cette couleur spécifiquement
        // ou bien les mouvements globaux de l'article proportionnellement
        const colorMov = artMovements.filter(m =>
          m.color?.toLowerCase() === colorLabel.toLowerCase()
        );
        // Fallback : si aucun mouvement avec couleur, prendre les mouvements globaux / nb de couleurs
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = colorMov.length > 0 ? colorMov : artMovements.map(m => ({ ...m, quantity: m.quantity / (colorBreakdown.length || 1) }));

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            if (activeStore === 'ALL') continue; // Transfert interne = 0 impact global
            if (m.type === 'OUT') {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
            } else if (m.type === 'IN') {
              if (isVisibleForUser(m.storeId || m.toStoreId)) mouvIN += m.quantity;
            } else {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
              if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
            }
          } else {
            if (isVisibleForUser(m.storeId)) {
              if (m.type === 'IN') mouvIN += m.quantity;
              if (m.type === 'OUT') mouvOUT += m.quantity;
              if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
            }
          }
        }

        const currentQty = initialQty + mouvIN - mouvOUT + mouvADJ;
        const lastMov = [...colorMov].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

        results.push({
          articleId:           `${a.id}__color__${colorLabel}`, // ID virtuel unique
          categoryId:          a.categoryId,
          categoryNameFR:      catNameFR,
          poleNameFR:          poleNameFR,
          productName,
          nameFR:              itemFR,
          color:               colorLabel,
          size:                a.size !== 'various' ? a.size : undefined,
          quality:             a.quality,
          gsm:                 a.gsm,
          fabricWidth:         a.fabricWidth,
          rollLength:          a.rollLength,
          rollLengthUnit:      a.rollLengthUnit,
          packagingPerBag:     a.packagingPerBag,
          zipperType:          a.zipperType,
          slider:              a.slider,
          sliderType:          a.sliderType,
          tapeWeightGsm:       a.tapeWeightGsm,
          sliderWeightG:       a.sliderWeightG,
          pcsPerBag:           a.pcsPerBag,
          bagsPerCarton:       a.bagsPerCarton,
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
          qtyByStore:          computeQtyByStoreHelper(row, targetMovs, isOldArrival),
        } as any);
      }
      continue; // ne pas créer le StockItem générique
    }

    // ── CAS 2 : size === 'various' ET sizeBreakdown renseigné ────────────────
    if ((a.size === 'various' || a.size === 'Various') && sizeBreakdown.length > 0) {
      for (const row of sizeBreakdown) {
        const sizeLabel = (row.size || '').trim();
        if (!sizeLabel) continue;

        const initialQty = isOldArrival ? 0 : getInitialQtyForStore(row, activeStore, userStoreId, stores);
        const sizeMov = artMovements.filter(m =>
          m.size?.toLowerCase() === sizeLabel.toLowerCase()
        );
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = sizeMov.length > 0 ? sizeMov : artMovements.map(m => ({ ...m, quantity: m.quantity / (sizeBreakdown.length || 1) }));

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            if (activeStore === 'ALL') continue;
            if (m.type === 'OUT') {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
            } else if (m.type === 'IN') {
              if (isVisibleForUser(m.storeId || m.toStoreId)) mouvIN += m.quantity;
            } else {
              if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
              if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
            }
          } else {
            if (isVisibleForUser(m.storeId)) {
              if (m.type === 'IN') mouvIN += m.quantity;
              if (m.type === 'OUT') mouvOUT += m.quantity;
              if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
            }
          }
        }

        const currentQty = initialQty + mouvIN - mouvOUT + mouvADJ;
        const lastMov = [...sizeMov].sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

        results.push({
          articleId:           `${a.id}__size__${sizeLabel}`,
          categoryId:          a.categoryId,
          categoryNameFR:      catNameFR,
          poleNameFR:          poleNameFR,
          productName,
          nameFR:              itemFR,
          color:               a.color !== 'various' ? a.color : undefined,
          size:                sizeLabel,
          quality:             a.quality,
          gsm:                 a.gsm,
          fabricWidth:         a.fabricWidth,
          rollLength:          a.rollLength,
          rollLengthUnit:      a.rollLengthUnit,
          packagingPerBag:     a.packagingPerBag,
          zipperType:          a.zipperType,
          slider:              a.slider,
          sliderType:          a.sliderType,
          tapeWeightGsm:       a.tapeWeightGsm,
          sliderWeightG:       a.sliderWeightG,
          pcsPerBag:           a.pcsPerBag,
          bagsPerCarton:       a.bagsPerCarton,
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
          qtyByStore:          computeQtyByStoreHelper(row, targetMovs, isOldArrival),
        } as any);
      }
      continue;
    }

    // ── CAS 3 : article normal (1 couleur / 1 taille ou sans variante) ────────
    let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
    for (const m of artMovements) {
      if (isOldArrivalMovement(m)) continue;
      if (m.reason === 'TRANSFERT') {
        if (activeStore === 'ALL') continue;
        if (m.type === 'OUT') {
          if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
        } else if (m.type === 'IN') {
          if (isVisibleForUser(m.storeId || m.toStoreId)) mouvIN += m.quantity;
        } else {
          if (isVisibleForUser(m.storeId)) mouvOUT += m.quantity;
          if (isVisibleForUser(m.toStoreId)) mouvIN += m.quantity;
        }
      } else {
        if (isVisibleForUser(m.storeId)) {
          if (m.type === 'IN') mouvIN += m.quantity;
          if (m.type === 'OUT') mouvOUT += m.quantity;
          if (m.type === 'ADJUSTMENT') mouvADJ += m.quantity;
        }
      }
    }
    const initialQty = isOldArrival ? 0 : getInitialQtyForStore(a, activeStore, userStoreId, stores);
    const currentQty = initialQty + mouvIN - mouvOUT + mouvADJ;
    const lastMovement = [...artMovements].filter(m => !isOldArrivalMovement(m)).sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];

    results.push({
      articleId:           a.id,
      categoryId:          a.categoryId,
      categoryNameFR:      catNameFR,
      poleNameFR:          poleNameFR,
      productName,
      nameFR:              itemFR,
      color:               a.color !== 'various' ? a.color : undefined,
      size:                a.size  !== 'various' ? a.size  : undefined,
      quality:             a.quality,
      gsm:                 a.gsm,
      fabricWidth:         a.fabricWidth,
      rollLength:          a.rollLength,
      rollLengthUnit:      a.rollLengthUnit,
      packagingPerBag:     a.packagingPerBag,
      zipperType:          a.zipperType,
      slider:              a.slider,
      sliderType:          a.sliderType,
      tapeWeightGsm:       a.tapeWeightGsm,
      sliderWeightG:       a.sliderWeightG,
      pcsPerBag:           a.pcsPerBag,
      bagsPerCarton:       a.bagsPerCarton,
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
      qtyByStore:          computeQtyByStoreHelper(a, artMovements, isOldArrival),
    });
  }

  // ── Consolidation d'affichage ────────────────────────────────────────────
  // Plusieurs documents `articles` distincts (ex: plusieurs commandes successives
  // du même produit) peuvent représenter le même produit physique. On les regroupe
  // ici en UNE seule ligne de stock (même catégorie + couleur + taille + qualité),
  // sans toucher aux documents Firestore sources ni aux coûts de revient par lot
  // utilisés côté Gestion (cost-analysis, historique prix de revient...).
  const identityKey = (item: StockItem): string => {
    const cat = (item.categoryId || '').toString().trim().toLowerCase();
    const color = (item.color || '').toString().trim().toLowerCase();
    const size = (item.size || '').toString().trim().toLowerCase();
    const quality = (item.quality || '').toString().trim().toLowerCase();
    return `${cat}|${color}|${size}|${quality}`;
  };

  const grouped = new Map<string, StockItem[]>();
  for (const item of results) {
    const key = identityKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const consolidated: StockItem[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) {
      consolidated.push(group[0]);
      continue;
    }

    // ID canonique stable : le plus petit ID Firestore réel du groupe.
    // Tous les NOUVEAUX mouvements créés depuis cette ligne consolidée seront
    // attribués à cet article — l'agrégat reste mathématiquement exact quel que
    // soit l'article qui absorbe le mouvement (simple somme).
    const sorted = [...group].sort((a, b) =>
      String((a as any)._realArticleId || a.articleId).localeCompare(String((b as any)._realArticleId || b.articleId))
    );
    const canonical = sorted[0];

    const initialQty = group.reduce((s, i) => s + (Number(i.initialQty) || 0), 0);
    const mouvementsIn = group.reduce((s, i) => s + (Number(i.mouvementsIn) || 0), 0);
    const mouvementsOut = group.reduce((s, i) => s + (Number(i.mouvementsOut) || 0), 0);
    const currentQty = group.reduce((s, i) => s + (Number(i.currentQty) || 0), 0);
    const totalValue = group.reduce((s, i) => s + (Number(i.totalValue) || 0), 0);
    const hasSellingValue = group.some(i => i.totalSellingValue != null);
    const totalSellingValue = hasSellingValue
      ? group.reduce((s, i) => s + (Number(i.totalSellingValue) || 0), 0)
      : undefined;

    const qtyByStore: Record<string, number> = {};
    for (const i of group) {
      for (const [sId, val] of Object.entries(i.qtyByStore || {})) {
        qtyByStore[sId] = (qtyByStore[sId] || 0) + (Number(val) || 0);
      }
    }

    const purchasePricePerUnit = currentQty !== 0 ? totalValue / currentQty : (canonical.purchasePricePerUnit || 0);
    const sellingPrice = (hasSellingValue && currentQty !== 0) ? (totalSellingValue as number) / currentQty : canonical.sellingPrice;

    let minThreshold: number | undefined;
    for (const i of group) {
      if (i.minThreshold == null) continue;
      minThreshold = minThreshold == null ? i.minThreshold : Math.min(minThreshold, i.minThreshold);
    }

    let lastMovementDate: string | undefined;
    for (const i of group) {
      if (!i.lastMovementDate) continue;
      if (!lastMovementDate || i.lastMovementDate > lastMovementDate) lastMovementDate = i.lastMovementDate;
    }

    consolidated.push({
      ...canonical,
      initialQty,
      mouvementsIn,
      mouvementsOut,
      currentQty,
      totalValue,
      totalSellingValue,
      qtyByStore,
      purchasePricePerUnit,
      sellingPrice,
      minThreshold,
      lastMovementDate,
      _realArticleId: (canonical as any)._realArticleId || canonical.articleId,
      _mergedArticleIds: group.map(i => (i as any)._realArticleId || i.articleId),
    } as any);
  }

  const isWarehouseView = stores.find(s => s.id === activeStore)?.type === 'WAREHOUSE';
  if (isWarehouseView && !includeAll) {
    return consolidated.filter(r => r.currentQty > 0);
  }

  return consolidated;
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
  const [arbitrageModalOpen, setArbitrageModalOpen] = useState(false);

  const [activeStore, setActiveStore] = useState<StoreLocation | 'ALL' | 'ALL_MAIN'>('ALL');
  const [hasInitMain, setHasInitMain] = useState(false);
  const [userRole, setUserRole] = useState<'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED' | 'LOADING'>('LOADING');
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const isOnline = useOnlineStatus();
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetStockSimulation = async () => {
    const targetUid = adminUid || user?.uid;
    if (!targetUid) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/admin/reset-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid: targetUid }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Stock réinitialisé à 0 !',
          description: 'Toutes les données de test ont été effacées avec succès. Votre simulation peut démarrer.',
        });
        setResetConfirmOpen(false);
      } else {
        toast({
          title: 'Erreur',
          description: data.error || 'Impossible de réinitialiser le stock.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erreur réseau',
        description: e?.message || 'Erreur lors de la réinitialisation.',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const checkAccess = useCallback(async () => {
    if (!user?.email || !firestore) return;
    
    if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
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
        if (data.role === 'ADMIN') {
          setActiveStore('ALL');
        } else {
          setActiveStore(data.storeId);
        }
        setUserStoreId(data.storeId);
        setIsReadOnly(data.readOnly === true);
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
  const expensesRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'commercialExpenses'),[firestore, adminUid, user]);
  const remittancesRef   = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'checkRemittances'),    [firestore, adminUid, user]);
  const auditLogRef      = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'auditLog'),           [firestore, adminUid, user]);

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
  const { data: rawExpenses } = useCollection(expensesRef);
  const { data: rawRemittances } = useCollection(remittancesRef);
  const { data: rawAuditLog } = useCollection(auditLogRef);

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
  const expenses        = (rawExpenses    || []) as CommercialExpense[];
  const remittances     = (rawRemittances || []) as CheckRemittance[];
  const auditLogEntries = (rawAuditLog    || []) as any[];

  // Initialisation du magasin pour le commercial
  useEffect(() => {
    if (userRole === 'COMMERCIAL' && stores.length > 0 && !hasInitMain && userStoreId) {
      setActiveStore(userStoreId as any);
      setHasInitMain(true);
    }
  }, [userRole, stores, userStoreId, hasInitMain]);

  // Initialize default stores if empty or run migration
  useEffect(() => {
    if (!firestore || !adminUid || loadingStores || userRole !== 'ADMIN') return;
    const runMigration = async () => {
      const migrated = localStorage.getItem('stores_migrated_v6');
      if (migrated) return;
      
      const defaults = [
        { id: 'CHRIFA', name: 'CHRIFA', type: 'STORE', isMain: true, accessEmail: 'chrifa@lebtex.ma' },
        { id: 'DERB_OMAR', name: 'Derb omar', type: 'STORE', isMain: false, accessEmail: 'derbomar@lebtex.ma' },
        { id: 'IDAA', name: 'IDAA', type: 'STORE', isMain: false, accessEmail: 'idaa@lebtex.ma' },
      ];

      // Supprimer l'ancien entrepôt par défaut
      try {
        await deleteDoc(doc(firestore, 'users', adminUid, 'stores', 'ENTREPOT'));
      } catch (_) {}

      // Add/update defaults
      for (const s of defaults) {
        await setDoc(doc(firestore, 'users', adminUid, 'stores', s.id), s, { merge: true });
      }
      
      localStorage.setItem('stores_migrated_v6', 'true');
    };
    runMigration();
  }, [userRole, firestore, adminUid, loadingStores, stores]);

  // Tous les mouvements de stock réels
  const movements = allMovements;

  const defaultSaleStoreId = userRole === 'COMMERCIAL' ? (userStoreId || 'CHRIFA') : 'CHRIFA';
  const [saleStoreId, setSaleStoreId] = useState<string>(defaultSaleStoreId);

  useEffect(() => {
    if (userRole === 'COMMERCIAL' && userStoreId) {
      setSaleStoreId(userStoreId);
    }
  }, [userRole, userStoreId]);

  const stockItems = useMemo(() =>
    computeStockItems(articles, movements, categories, activeStore, false, userRole, stores, userStoreId ?? undefined, generalCategories, factures),
    [articles, movements, categories, activeStore, userRole, stores, userStoreId, generalCategories, factures]
  );

  const allStockItems = useMemo(() =>
    computeStockItems(articles, movements, categories, activeStore, true, userRole, stores, userStoreId ?? undefined, generalCategories, factures),
    [articles, movements, categories, activeStore, userRole, stores, userStoreId, generalCategories, factures]
  );

  const allStockItemsGlobal = useMemo(() =>
    computeStockItems(articles, movements, categories, 'ALL', true, userRole, stores, userStoreId ?? undefined, generalCategories, factures),
    [articles, movements, categories, userRole, stores, userStoreId, generalCategories, factures]
  );

  const effectiveSaleStoreId = userRole === 'COMMERCIAL' ? (userStoreId || 'CHRIFA') : saleStoreId;
  const saleStockItems = useMemo(() =>
    computeStockItems(articles, movements, categories, effectiveSaleStoreId, false, userRole, stores, userStoreId ?? undefined, generalCategories, factures),
    [articles, movements, categories, effectiveSaleStoreId, userRole, stores, userStoreId, generalCategories, factures]
  );

  const isChrifaOrWarehouse = (id: string | undefined) => {
    if (!id || id === 'CHRIFA' || id === 'ENTREPOT') return true;
    const store = stores.find(s => s.id === id);
    return store ? (store.id === 'CHRIFA' || store.type === 'WAREHOUSE') : false;
  };

  // Filtrer les données selon le magasin actif pour les vues (sauf Admin "ALL")
  const filteredSales = useMemo(() => sales.filter(s => {
    if (activeStore === 'ALL') return true;
    return s.storeId === activeStore;
  }), [sales, activeStore]);

  const filteredClients = useMemo(() => clients.filter(c => {
    if (activeStore === 'ALL') return true;
    return c.storeId === activeStore || !c.storeId;
  }), [clients, activeStore]);

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (activeStore === 'ALL') return true;
    return o.storeId === activeStore;
  }), [orders, activeStore]);

  const filteredInvoices = useMemo(() => invoices.filter(i => {
    if (activeStore === 'ALL') return true;
    return i.storeId === activeStore;
  }), [invoices, activeStore]);

  const filteredMovements = useMemo(() => movements.filter(m => {
    if (activeStore === 'ALL') return true;
    return m.storeId === activeStore || m.toStoreId === activeStore;
  }), [movements, activeStore]);

  const filteredTransfers = useMemo(() => transferOrders.filter(t => {
    if (activeStore === 'ALL') return true;
    return t.fromStore === activeStore || t.toStore === activeStore;
  }), [transferOrders, activeStore]);
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (activeStore === 'ALL') return true;
      if (p.storeId) {
        if (activeStore === 'ALL_MAIN') return isIncludedInAllMain(p.storeId);
        return p.storeId === activeStore || (!p.storeId && (activeStore === 'CHRIFA' || activeStore === 'ENTREPOT'));
      }
      const c = clients.find(cl => cl.id === p.clientId);
      if (c?.storeId) {
        if (activeStore === 'ALL_MAIN') return isIncludedInAllMain(c.storeId);
        return c.storeId === activeStore || (!c.storeId && (activeStore === 'CHRIFA' || activeStore === 'ENTREPOT'));
      }
      return activeStore === 'ALL_MAIN' || activeStore === 'CHRIFA' || activeStore === 'ENTREPOT';
    });
  }, [payments, clients, activeStore, stores]);

  const rejectedChequesCount = useMemo(() => {
    return filteredPayments.filter(p => {
      const m = p.method as string;
      const isPaper = m === 'CHEQUE' || m === 'EFFET' || m === 'LC' || m === 'LCN' || m === 'CHECK';
      return isPaper && p.status === 'REJECTED';
    }).length;
  }, [filteredPayments]);

  const alertCount = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
  const openInvoices = invoices.filter(i => i.status === 'UNPAID' || i.status === 'PARTIAL').length;

  // Filtres & statistiques des arrivages
  const [arrivalFilter, setArrivalFilter] = useState<'ENTERED_10D' | 'PENDING' | 'ALL'>('ENTERED_10D');
  const [arrivalSearch, setArrivalSearch] = useState<string>('');

  const arrivalsStats = useMemo(() => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0];

    let entered10D = 0;
    let pending = 0;
    let totalArticles10D = 0;
    let totalQty10D = 0;

    factures.forEach((f: any) => {
      const entryDate = f.stockEntryDate || movements.find(m => (m.factureId === f.id || m.factureRef === f.id) && m.type === 'IN')?.date;
      const isEntered = !!(
        f.stockEntryDate ||
        (f.status === 'STOCK') ||
        isArrivalOlderThanOneMonth(f.arrivalDate) ||
        movements.some(m => (m.factureId === f.id || m.factureRef === f.id) && m.type === 'IN')
      );
      if (isEntered && entryDate && entryDate >= tenDaysAgoStr) {
        entered10D++;
        const factureArts = articles.filter((a: any) => a.factureId === f.id || a.facture === f.id);
        totalArticles10D += factureArts.length;
        totalQty10D += factureArts.reduce((acc: number, a: any) => acc + (Number(a.quantity) || 0), 0);
      } else if (!isEntered) {
        pending++;
      }
    });

    return { entered10D, pending, totalArticles10D, totalQty10D, tenDaysAgoStr };
  }, [factures, articles, movements]);

  const pendingArrivals = arrivalsStats.entered10D;

  // Pass-to-stock modal (depuis onglet Arrivages)
  const [passToStockId, setPassToStockId] = useState<string | null>(null);

  const isLoading = isUserLoading || loadingArt || loadingCat;

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleAddMovement = useCallback(async (movement: Omit<StockMovement, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    try {
      const effectiveUid = adminUid || user.uid;
      await addStockMovement(firestore, effectiveUid, movement);
      const auditAction = movement.type === 'IN' ? 'STOCK_IN' : movement.type === 'OUT' ? 'STOCK_OUT' : 'STOCK_ADJUSTMENT';
      logAudit(firestore, effectiveUid, {
        action: movement.reason === 'TRANSFERT' ? 'STOCK_TRANSFER' : auditAction,
        userId: user.uid,
        userEmail: user.email || '',
        entityType: 'stockMovement',
        entityId: movement.articleId,
        description: `${movement.type === 'IN' ? 'Entrée' : movement.type === 'OUT' ? 'Sortie' : 'Ajustement'} · ${movement.quantity} ${movement.unitOfMeasure} · ${movement.productName} (${movement.reason})`,
        metadata: { quantity: movement.quantity, storeId: movement.storeId, toStoreId: movement.toStoreId, reason: movement.reason },
      });
      toast({
        title: movement.type === 'IN' ? 'Entrée enregistrée' : movement.type === 'OUT' ? 'Sortie enregistrée' : 'Ajustement enregistré',
        description: `${movement.quantity} ${movement.unitOfMeasure} · ${movement.productName}`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer le mouvement." });
    }
  }, [user, firestore, toast, adminUid]);

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
        stockMovements: movements,
        factures,
        clients,
        saleOrders: orders,
        invoices,
        clientPayments: payments,
        sales,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lebtex-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Backup téléchargé', description: `lebtex-backup-${stamp}.json` });
  }, [articles, categories, generalCategories, movements, factures, clients, orders, invoices, payments, sales, user, toast]);

  // POS rapide (ancienne vente)
  const handleValidateSale = useCallback(async (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    if (!user || !firestore || (!adminUid && userRole !== 'ADMIN')) return;
    const effectiveUid = adminUid || user.uid;
    const mainStoreId = stores.find(s => s.isMain)?.id || 'CHRIFA';
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? mainStoreId : activeStore;
    const batch = writeBatch(firestore);
    const saleRef = doc(collection(firestore, 'users', effectiveUid, 'sales'));
    batch.set(saleRef, { ...sale, storeId, createdAt: serverTimestamp() });
    for (const item of sale.items) {
      const mRef = doc(collection(firestore, 'users', effectiveUid, 'stockMovements'));
      // Résoudre l'ID Firestore réel si l'item vient d'une variante explosée (couleur/taille/qualité)
      const realArticleId = (stockItems.find(s => s.articleId === item.articleId) as any)?._realArticleId || item.articleId;
      batch.set(mRef, {
        articleId: realArticleId, categoryId: item.categoryId,
        productName: item.productName, color: item.color || null, size: item.size || null,
        unitOfMeasure: item.unitOfMeasure, type: 'OUT', reason: 'VENTE',
        storeId,
        quantity: item.qty, date: sale.date,
        notes: sale.clientName ? `Vente à ${sale.clientName}` : 'Vente directe',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    toast({ title: 'Vente enregistrée !', description: `Total : ${(Number(sale.totalAmount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} — ${sale.items.length} produit(s)` });
  }, [user, firestore, toast, activeStore, adminUid, userRole, stores, stockItems]);

  // ── Clients ──────────────────────────────────────────────────────────────
  const handleCreateClient = useCallback(async (data: Omit<Client, 'id' | 'createdAt'>): Promise<Client> => {
    if (!user || !firestore) throw new Error('Not authenticated');
    const effectiveUid = adminUid || user.uid;
    const storeId = (activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? undefined : activeStore;
    const clientData = storeId ? { ...data, storeId } : data;
    const ref = await addDoc(collection(firestore, 'users', effectiveUid, 'clients'), { ...clientData, createdAt: serverTimestamp() });
    logAudit(firestore, effectiveUid, {
      action: 'CLIENT_CREATED',
      userId: user.uid,
      userEmail: user.email || '',
      entityType: 'client',
      entityId: ref.id,
      description: `Client créé : ${data.name}`,
    });
    toast({ title: 'Client créé', description: data.name });
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
    const mainStoreId = stores.find(s => s.isMain)?.id || 'CHRIFA';
    const storeId = (order as any).storeId || (userRole === 'ADMIN' ? saleStoreId : ((activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? mainStoreId : activeStore));
    const ref = await addDoc(collection(firestore, 'users', effectiveUid, 'saleOrders'), { ...order, storeId, createdAt: serverTimestamp() });
    toast({ title: 'Bon de commande créé', description: `${order.items.length} article(s) · ${(Number(order.totalAfterDiscount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })}` });
    return ref.id;
  }, [user, firestore, toast, activeStore, adminUid, stores, userRole, saleStoreId]);

  const handleUpdateOrderStatus = useCallback(async (id: string, status: SaleOrderStatus) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'saleOrders', id), { status });
  }, [user, firestore, adminUid]);

  const handleConvertToInvoice = useCallback(async (order: SaleOrder) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const mainStoreId = stores.find(s => s.isMain)?.id || 'CHRIFA';
    const batch = writeBatch(firestore);
    const invRef = doc(collection(firestore, 'users', effectiveUid, 'invoices'));
    batch.set(invRef, {
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
      date: getLocalDateString(),
      notes: order.notes,
      storeId: order.storeId || ((activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? mainStoreId : activeStore),
      createdAt: serverTimestamp(),
    });
    const orderRef = doc(firestore, 'users', effectiveUid, 'saleOrders', order.id);
    batch.update(orderRef, { status: 'INVOICED' });
    await batch.commit();
    toast({ title: 'Facture créée', description: `BC converti en facture` });
    setActiveView('invoices');
  }, [user, firestore, toast, activeStore, adminUid, stores]);

  // ── Factures ──────────────────────────────────────────────────────────────
  const handleCreateInvoice = useCallback(async (
    invoice: Omit<Invoice, 'id' | 'createdAt'>,
    movementsOut: any[],
    initialPayments?: Omit<ClientPayment, 'id' | 'createdAt'>[]
  ) => {
    if (!user || !firestore) return;
    try {
      const effectiveUid = adminUid || user.uid;
      const mainStoreId = stores.find(s => s.isMain)?.id || 'CHRIFA';
      const storeId = (invoice as any).storeId || (userRole === 'ADMIN' ? saleStoreId : ((activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? mainStoreId : activeStore));
      const batch = writeBatch(firestore);
      const invRef = doc(collection(firestore, 'users', effectiveUid, 'invoices'));
      batch.set(invRef, {
        ...cleanUndefined(invoice),
        storeId,
        createdAt: serverTimestamp()
      });
      for (const m of movementsOut) {
        const mRef = doc(collection(firestore, 'users', effectiveUid, 'stockMovements'));
        batch.set(mRef, {
          ...cleanUndefined(m),
          storeId: m.storeId || storeId,
          createdAt: serverTimestamp()
        });
      }
      if (initialPayments && initialPayments.length > 0) {
        for (const p of initialPayments) {
          const pRef = doc(collection(firestore, 'users', effectiveUid, 'clientPayments'));
          batch.set(pRef, {
            ...cleanUndefined(p),
            invoiceId: invRef.id,
            createdAt: serverTimestamp()
          });
        }
      }
      await batch.commit();
      logAudit(firestore, effectiveUid, {
        action: 'SALE_CREATED',
        userId: user.uid,
        userEmail: user.email || '',
        entityType: 'invoice',
        entityId: invRef.id,
        description: `Vente ${invoice.clientName ? 'à ' + invoice.clientName : 'comptoir'} · ${invoice.items.length} article(s) · ${(Number(invoice.totalAfterDiscount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
        metadata: { storeId, totalAfterDiscount: invoice.totalAfterDiscount, status: invoice.status, clientId: (invoice as any).clientId },
      });
      toast({ title: 'Vente enregistrée !', description: `${invoice.items.length} article(s) · ${(Number(invoice.totalAfterDiscount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` });
    } catch (err: any) {
      console.error('Error creating invoice/sale:', err);
      toast({ title: 'Erreur', description: `Impossible d'enregistrer la vente : ${err?.message || err}`, variant: 'destructive' });
      throw err;
    }
  }, [user, firestore, toast, activeStore, adminUid, userRole, saleStoreId, stores]);

  const handleUpdateInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', id), { status });
  }, [user, firestore, adminUid]);

  // ── Retours clients (SAV) ────────────────────────────────────────────────
  const handleProcessReturn = useCallback(async (
    invoice: Invoice,
    returnLines: { articleId: string; categoryId: string; productName: string; nameFR?: string; color?: string; size?: string; unitOfMeasure: string; qty: number; unitPrice: number }[]
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const validLines = returnLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;

    const returnValue = validLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const today = getLocalDateString();

    try {
      const batch = writeBatch(firestore);

      for (const line of validLines) {
        const mRef = doc(collection(firestore, 'users', effectiveUid, 'stockMovements'));
        batch.set(mRef, {
          articleId: line.articleId,
          categoryId: line.categoryId,
          productName: line.productName,
          nameFR: line.nameFR || null,
          color: line.color || null,
          size: line.size || null,
          unitOfMeasure: line.unitOfMeasure,
          type: 'IN',
          reason: 'RETOUR',
          storeId: invoice.storeId || 'CHRIFA',
          quantity: line.qty,
          date: today,
          notes: `Retour client sur facture ${invoice.invoiceNumber || invoice.id}${invoice.clientName ? ` (${invoice.clientName})` : ''}`,
          factureId: invoice.id,
          createdAt: serverTimestamp(),
        });
      }

      const newTotal = Math.max(0, (Number(invoice.totalAfterDiscount) || 0) - returnValue);
      const newRemaining = Math.max(0, newTotal - (Number(invoice.paidAmount) || 0));
      const overpaid = (Number(invoice.paidAmount) || 0) > newTotal ? (Number(invoice.paidAmount) || 0) - newTotal : 0;
      const newStatus: InvoiceStatus = newTotal === 0
        ? 'PAID'
        : newRemaining === 0
          ? 'PAID'
          : (Number(invoice.paidAmount) || 0) > 0
            ? 'PARTIAL'
            : 'UNPAID';

      const invRef = doc(firestore, 'users', effectiveUid, 'invoices', invoice.id);
      batch.update(invRef, {
        totalAfterDiscount: newTotal,
        remainingBalance: newRemaining,
        status: newStatus,
        notes: `${invoice.notes ? invoice.notes + ' — ' : ''}Retour du ${today} : -${returnValue.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
      });

      await batch.commit();

      logAudit(firestore, effectiveUid, {
        action: 'RETURN_PROCESSED',
        userId: user.uid,
        userEmail: user.email || '',
        entityType: 'invoice',
        entityId: invoice.id,
        description: `Retour de ${validLines.length} article(s) sur facture ${invoice.invoiceNumber || invoice.id} · -${returnValue.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
        metadata: { returnValue, items: validLines.length },
      });

      toast({
        title: 'Retour enregistré',
        description: overpaid > 0
          ? `Stock remis à jour. Le client a un crédit de ${overpaid.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD à rembourser ou déduire d'un prochain achat.`
          : `Stock remis à jour · -${returnValue.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD sur la facture.`,
      });
    } catch (err: any) {
      console.error('Erreur lors du traitement du retour:', err);
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || "Impossible d'enregistrer le retour." });
      throw err;
    }
  }, [user, firestore, adminUid, toast]);

  // ── Inventaire physique ───────────────────────────────────────────────────
  const handleFinalizeInventorySession = useCallback(async (storeId: string, itemCount: number, varianceCount: number) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const today = getLocalDateString();
    try {
      await setDoc(doc(firestore, 'users', effectiveUid, 'stores', storeId), {
        lastInventoryDate: today,
        lastInventoryItemCount: itemCount,
        lastInventoryVarianceCount: varianceCount,
      }, { merge: true });

      logAudit(firestore, effectiveUid, {
        action: 'INVENTORY_RECONCILED',
        userId: user.uid,
        userEmail: user.email || '',
        entityType: 'stockMovement',
        entityId: storeId,
        description: `Inventaire clôturé pour ${storeId} · ${itemCount} article(s) comptés, ${varianceCount} écart(s)`,
        metadata: { storeId, itemCount, varianceCount },
      });

      toast({ title: 'Inventaire clôturé', description: `${itemCount} article(s) comptés · ${varianceCount} écart(s) ajusté(s).` });
    } catch (err: any) {
      console.error('Erreur lors de la clôture de l\'inventaire:', err);
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || "Impossible de clôturer l'inventaire." });
    }
  }, [user, firestore, adminUid, toast]);

  // ── Paiements clients ─────────────────────────────────────────────────────
  const handleRecordMultiplePayments = useCallback(async (
    paymentList: Omit<ClientPayment, 'id' | 'createdAt'>[],
    invoiceUpdates?: { invoiceId: string; paidAmount: number; remainingBalance: number; status: InvoiceStatus }[]
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const batch = writeBatch(firestore);

    for (const payment of paymentList) {
      const cleaned = cleanUndefined(payment);
      const pRef = doc(collection(firestore, 'users', effectiveUid, 'clientPayments'));
      batch.set(pRef, {
        ...cleaned,
        createdAt: serverTimestamp()
      });
    }

    if (invoiceUpdates && invoiceUpdates.length > 0) {
      for (const upd of invoiceUpdates) {
        const invRef = doc(firestore, 'users', effectiveUid, 'invoices', upd.invoiceId);
        batch.update(invRef, {
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
            const hasPendingEffect = payment.method === 'CHEQUE' || payment.method === 'LC' || payment.method === 'EFFET' || payment.method === 'LCN' || payment.status === 'PENDING';
            const newPaid = (inv.paidAmount || 0) + payment.amount;
            const newBalance = Math.max(0, (inv.totalAfterDiscount || 0) - newPaid);
            const newStatus: InvoiceStatus = newBalance === 0 
              ? (hasPendingEffect ? 'PENDING' : 'PAID') 
              : newPaid > 0 
                ? (hasPendingEffect ? 'PENDING' : 'PARTIAL') 
                : 'UNPAID';
            const invRef = doc(firestore, 'users', effectiveUid, 'invoices', payment.invoiceId);
            batch.update(invRef, {
              paidAmount: newPaid,
              remainingBalance: newBalance,
              status: newStatus,
            });
          }
        }
      }
    }

    await batch.commit();

    const totalAmount = paymentList.reduce((sum, p) => sum + (p.amount || 0), 0);
    const methods = Array.from(new Set(paymentList.map(p => p.method))).join(', ');
    logAudit(firestore, effectiveUid, {
      action: 'PAYMENT_RECORDED',
      userId: user.uid,
      userEmail: user.email || '',
      entityType: 'payment',
      entityId: paymentList[0]?.invoiceId || paymentList[0]?.clientId || 'multi',
      description: `${paymentList.length} paiement(s) enregistré(s) · ${(Number(totalAmount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD (${methods})`,
      metadata: { totalAmount, methods, count: paymentList.length },
    });
    toast({
      title: 'Paiement(s) validé(s)',
      description: `${(Number(totalAmount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD (${methods})`
    });
  }, [user, firestore, adminUid, invoices, toast]);

  const handleRecordPayment = useCallback(async (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => {
    await handleRecordMultiplePayments([payment]);
  }, [handleRecordMultiplePayments]);

  const handleUpdatePaymentStatus = useCallback(async (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const payment = payments.find((p: any) => p.id === paymentId);
    const prevStatus = payment?.status || 'PENDING';

    if (status === 'REJECTED') {
      const impayeCheck = canDeclareImpaye(payment);
      if (!impayeCheck.allowed) {
        toast({
          title: 'Action impossible',
          description: impayeCheck.reason || "Un chèque ou effet ne peut être déclaré impayé qu'à J+2 minimum de l'échéance.",
          variant: 'destructive',
        });
        return;
      }
    }

    await updateDoc(doc(firestore, 'users', effectiveUid, 'clientPayments', paymentId), { status });

    logAudit(firestore, effectiveUid, {
      action: status === 'REJECTED' ? 'PAYMENT_REJECTED' : status === 'CLEARED' ? 'PAYMENT_CLEARED' : 'PAYMENT_RECORDED',
      userId: user.uid,
      userEmail: user.email || '',
      entityType: 'payment',
      entityId: paymentId,
      description: `Paiement ${paymentId} → statut ${status}${payment?.amount ? ` · ${Number(payment.amount).toLocaleString('fr-MA')} MAD` : ''}`,
      metadata: { prevStatus, newStatus: status, amount: payment?.amount, checkNumber: payment?.checkNumber },
    });

    // When rejecting a payment, re-open the balance on the associated invoice
    if (status === 'REJECTED' && prevStatus !== 'REJECTED') {
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
    } else if (prevStatus === 'REJECTED' && (status === 'CLEARED' || status === 'PENDING')) {
      // Re-applying the payment if it was previously marked as rejected
      if (payment?.invoiceId) {
        const invoice = invoices.find((inv: any) => inv.id === payment.invoiceId);
        if (invoice) {
          const newRemaining = Math.max(0, (invoice.remainingBalance || 0) - payment.amount);
          const newPaid = Math.min(invoice.totalAfterDiscount, (invoice.paidAmount || 0) + payment.amount);
          const newStatus = newRemaining <= 0 ? 'PAID' : 'PARTIAL';
          await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', payment.invoiceId), {
            remainingBalance: newRemaining,
            paidAmount: newPaid,
            status: newStatus,
          });
        }
      }
    }

    if (status === 'REJECTED') {
      toast({
        title: 'Impayé Enregistré',
        description: `Le chèque/effet a été marqué comme IMPAYÉ. Le solde du client a été réouvert.`,
        variant: 'destructive',
      });
    } else if (status === 'CLEARED') {
      toast({
        title: 'Encaissement Validé',
        description: `Le chèque/effet a été marqué comme ENCAISSÉ avec succès en banque.`,
      });
    } else {
      toast({
        title: 'Statut Mis à Jour',
        description: `Le chèque/effet est à nouveau en attente dans le portefeuille.`,
      });
    }
  }, [user, firestore, adminUid, toast, payments, invoices]);

  const handleAssignPaymentCompany = useCallback(async (paymentId: string, company: CashingCompany) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'clientPayments', paymentId), {
      cashingCompany: company,
      depositBank: 'Attijariwafa Bank',
    });
    toast({
      title: 'Société affectée',
      description: `Effet affecté à ${company} (Attijariwafa Bank)`,
    });
  }, [user, firestore, adminUid, toast]);

  const handleCreateCheckRemittance = useCallback(async (
    company: CashingCompany,
    selectedPaymentIds: string[],
    notes?: string
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;

    const targetPayments = payments.filter(p => selectedPaymentIds.includes(p.id));
    if (targetPayments.length === 0) {
      toast({ title: 'Erreur', description: 'Aucun chèque sélectionné pour la remise.', variant: 'destructive' });
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCompact = todayStr.replace(/-/g, '');
    const prefix = company === 'LEBTEX' ? 'LEB' : 'ROB';
    const countToday = (remittances || []).filter(r => r.reference?.includes(todayCompact)).length + 1;
    const refSeq = String(countToday).padStart(3, '0');
    const reference = `BRC-${prefix}-${todayCompact}-${refSeq}`;

    const totalAmount = targetPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const items: CheckRemittanceItem[] = targetPayments.map(p => {
      const client = clients.find(c => c.id === p.clientId);
      const inv = invoices.find(i => i.id === p.invoiceId);
      return {
        paymentId: p.id,
        checkNumber: p.checkNumber || '—',
        clientName: client?.name || 'Client',
        clientId: p.clientId,
        bankName: p.bankName || 'Attijariwafa Bank',
        dueDate: p.dueDate,
        amount: Number(p.amount) || 0,
        method: p.method,
        invoiceNumber: inv?.invoiceNumber,
      };
    });

    const remittanceData: Omit<CheckRemittance, 'id'> = {
      reference,
      company,
      bankName: 'Attijariwafa Bank',
      remittedAt: todayStr,
      checkCount: targetPayments.length,
      totalAmount,
      paymentIds: selectedPaymentIds,
      items,
      status: 'REMIS',
      notes: notes || '',
      createdBy: user.email || 'Admin',
      createdAt: serverTimestamp(),
    };

    const batch = writeBatch(firestore);
    const remRef = doc(collection(firestore, 'users', effectiveUid, 'checkRemittances'));
    batch.set(remRef, cleanUndefined(remittanceData));
    const createdRemittance: CheckRemittance = {
      id: remRef.id,
      ...remittanceData,
    };

    for (const p of targetPayments) {
      const pRef = doc(firestore, 'users', effectiveUid, 'clientPayments', p.id);
      batch.update(pRef, {
        remittanceId: remRef.id,
        remittanceRef: reference,
        remittedAt: todayStr,
        cashingCompany: company,
        depositBank: 'Attijariwafa Bank',
      });
    }

    await batch.commit();

    // Export & download PDF immediately
    exportCheckRemittancePDF(createdRemittance);

    toast({
      title: 'Bordereau de Remise Émis !',
      description: `Bordereau ${reference} (${targetPayments.length} chèques · ${(Number(totalAmount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD) enregistré. PDF téléchargé !`,
    });

    return createdRemittance;
  }, [user, firestore, adminUid, payments, clients, invoices, remittances, toast]);

  const handleUpdateRemittanceStatus = useCallback(async (
    remittanceId: string,
    status: RemittanceStatus
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'checkRemittances', remittanceId), {
      status,
      updatedAt: serverTimestamp(),
    });

    if (status === 'ENCAISSE') {
      const rem = remittances.find(r => r.id === remittanceId);
      if (rem && rem.paymentIds) {
        for (const pid of rem.paymentIds) {
          await updateDoc(doc(firestore, 'users', effectiveUid, 'clientPayments', pid), {
            status: 'CLEARED',
          });
        }
      }
      toast({
        title: 'Remise Encaissée',
        description: `Tous les chèques du bordereau ont été marqués comme ENCAISSÉS.`,
      });
    } else {
      toast({
        title: 'Statut mis à jour',
        description: `Bordereau mis à jour (${status}).`,
      });
    }
  }, [user, firestore, adminUid, remittances, toast]);

  // Gestion des Frais et Dépenses des Commerciaux
  const handleAddExpense = useCallback(async (exp: Omit<CommercialExpense, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;

    let movementId: string | undefined = undefined;
    let createdArticleId: string | undefined = undefined;

    // Si c'est un achat marchandise du marché et que la case "Ajouter au stock" est cochée
    if (exp.category === 'ACHAT_MARCHANDISE' && exp.addToStock && exp.articleName && exp.quantity && exp.quantity > 0) {
      const targetStore = exp.storeId || (stores.find(s => s.type === 'WAREHOUSE')?.id || stores[0]?.id || 'CHRIFA');
      const targetStoreObj = stores.find(s => s.id === targetStore);
      const targetStoreName = targetStoreObj?.name || targetStore;
      const unitPrice = exp.unitPrice || (exp.quantity > 0 ? exp.amount / exp.quantity : 0);

      // 1. Créer l'article dans la collection articles pour qu'il soit reconnu dans tout le système (fiches de stock, caisse, etc.)
      const artId = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
      createdArticleId = artId;
      const articlePayload = {
        id: artId,
        categoryId: exp.categoryId || exp.articleName,
        generalCategoryId: exp.generalCategoryId || null,
        name: exp.articleName.trim(),
        color: exp.color || null,
        size: exp.size || null,
        specs: exp.specs || null,
        zipperType: exp.zipperType || null,
        slider: exp.slider || null,
        sliderType: exp.sliderType || null,
        gsm: exp.gsm ? Number(exp.gsm) : null,
        fabricWidth: exp.fabricWidth ? Number(exp.fabricWidth) : null,
        rollLength: exp.rollLength ? Number(exp.rollLength) : null,
        unitOfMeasure: exp.unitOfMeasure || 'pcs',
        purchasePricePerUnit: unitPrice,
        stockEntryDate: exp.date || new Date().toISOString().split('T')[0],
        supplierId: exp.supplierName || 'Marché local',
        quantity: 0,
        initialQtyByStore: { [targetStore]: 0 },
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(firestore, 'users', effectiveUid, 'articles', artId), cleanUndefined(articlePayload));

      // 2. Créer le mouvement de stock d'entrée IN
      const movPayload = {
        articleId: artId,
        type: 'IN' as const,
        reason: 'ACHAT_LOCAL',
        productName: exp.articleName.trim(),
        categoryId: exp.categoryId || null,
        color: exp.color || null,
        size: exp.size || null,
        quantity: Number(exp.quantity),
        unitOfMeasure: exp.unitOfMeasure || 'pcs',
        purchasePricePerUnit: unitPrice,
        storeId: targetStore,
        date: exp.date || new Date().toISOString().split('T')[0],
        notes: `Achat Marchandise du marché (${exp.supplierName ? `Vendeur: ${exp.supplierName}` : 'Marché local'}) · Entrée Stock ${targetStoreName} · Dépense ${exp.amount} MAD`,
        createdAt: serverTimestamp(),
      };

      const movRef = await addDoc(
        collection(firestore, 'users', effectiveUid, 'stockMovements'),
        cleanUndefined(movPayload)
      );
      movementId = movRef.id;
    }

    const payload = {
      ...exp,
      storeId: exp.storeId || (stores.find(s => s.type === 'WAREHOUSE')?.id || stores[0]?.id || 'CHRIFA'),
      ...(movementId ? { stockMovementId: movementId } : {}),
      ...(createdArticleId ? { articleId: createdArticleId } : {}),
    };

    await addDoc(collection(firestore, 'users', effectiveUid, 'commercialExpenses'), {
      ...cleanUndefined(payload),
      createdAt: serverTimestamp(),
    });

    if (movementId) {
      const targetStore = exp.storeId || (stores.find(s => s.type === 'WAREHOUSE')?.id || stores[0]?.id || 'CHRIFA');
      const targetStoreObj = stores.find(s => s.id === targetStore);
      const targetStoreName = targetStoreObj?.name || targetStore;
      toast({
        title: `Marchandise entrée à ${targetStoreName} !`,
        description: `${exp.quantity} ${exp.unitOfMeasure || 'pcs'} de "${exp.articleName}" ajoutés au stock (${targetStoreName}) et dépense enregistrée.`,
      });
    } else {
      toast({
        title: 'Dépense enregistrée',
        description: `${(Number(exp.amount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
      });
    }
  }, [user, firestore, adminUid, effectiveSaleStoreId, stores, toast]);

  const handleUpdateExpenseStatus = useCallback(async (id: string, status: 'PENDING' | 'APPROVED' | 'REIMBURSED') => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'commercialExpenses', id), { status });
    toast({ title: 'Statut de la dépense mis à jour' });
  }, [user, firestore, adminUid, toast]);

  const handleDeleteExpense = useCallback(async (id: string) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await deleteDoc(doc(firestore, 'users', effectiveUid, 'commercialExpenses', id));
    toast({ title: 'Dépense supprimée' });
  }, [user, firestore, adminUid, toast]);

  // Chèques et LCN à échéance <= 7 jours sans société affectée (Attijariwafa Bank)
  const urgent7DaysEffects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return payments.filter(p => {
      const isPaper = p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN';
      if (!isPaper || p.status === 'CLEARED' || p.status === 'REJECTED' || !p.dueDate) return false;
      if (p.cashingCompany) return false; // Déjà assigné
      const due = new Date(p.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [payments]);

  // Effets déjà assignés à LEBTEX ou ROBE IN BOX prêts pour remise en banque
  const pendingLebtexRemisePayments = useMemo(() => {
    return payments.filter(p => 
      p.cashingCompany === 'LEBTEX' && 
      (p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN') && 
      p.status !== 'CLEARED' && p.status !== 'REJECTED' && 
      !p.remittanceId
    );
  }, [payments]);

  const pendingLebtexTotal = useMemo(() => 
    pendingLebtexRemisePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  , [pendingLebtexRemisePayments]);

  const pendingRobeRemisePayments = useMemo(() => {
    return payments.filter(p => 
      p.cashingCompany === 'ROBE IN BOX' && 
      (p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN') && 
      p.status !== 'CLEARED' && p.status !== 'REJECTED' && 
      !p.remittanceId
    );
  }, [payments]);

  const pendingRobeTotal = useMemo(() => 
    pendingRobeRemisePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  , [pendingRobeRemisePayments]);

  // ── Navigation et droits (doit être avant les early returns pour éviter React Error 310) ──
  const navItemsRaw: Array<{ id: string; label: string; category: string; icon: any; adminOnly?: boolean; commercialOnly?: boolean; pointOfSaleOnly?: boolean; adminOrMainOnly?: boolean; badge?: number; color?: string }> = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard',    category: 'dashboard', icon: LayoutDashboard, adminOnly: true },
    { id: 'alerts',    label: 'Alertes',       category: 'dashboard', icon: Bell,            badge: alertCount, adminOnly: true },
    { id: 'audit',    label: 'Journal',       category: 'dashboard', icon: List,            adminOnly: true },

    { id: 'sale',      label: 'Caisse',         category: 'commerce', icon: ShoppingCart,   color: 'violet', pointOfSaleOnly: true },
    { id: 'clients',   label: 'Clients',       category: 'commerce', icon: Users,           pointOfSaleOnly: true },
    { id: 'invoices',  label: 'Bons de Commande', category: 'commerce', icon: FileText,        badge: openInvoices, pointOfSaleOnly: true },
    { id: 'cheques-impayes', label: 'Chèques / Impayés', category: 'commerce', icon: CreditCard, badge: rejectedChequesCount > 0 ? rejectedChequesCount : undefined, color: 'rose', pointOfSaleOnly: true },
    { id: 'expenses',  label: 'Frais & Dépenses', category: 'commerce', icon: Receipt,        color: 'amber', pointOfSaleOnly: true },

    { id: 'stock',     label: 'En Stock',      category: 'logistique', icon: Package,         color: 'emerald' },
    { id: 'warehouses', label: 'Entrepôts',    category: 'logistique', icon: Warehouse,       adminOrMainOnly: true, color: 'blue' },
    { id: 'arrivals',  label: 'Arrivages',     category: 'logistique', icon: Anchor,          badge: pendingArrivals, color: 'amber', adminOrMainOnly: true },
    { id: 'movements', label: 'Mouvements',    category: 'logistique', icon: ArrowLeftRight },
    { id: 'transfers', label: 'Transferts',    category: 'logistique', icon: Truck,           color: 'blue' },
    { id: 'inventory', label: 'Inventaire',    category: 'logistique', icon: ClipboardList,   color: 'amber' },

    { id: 'treasury',  label: 'Trésorerie',    category: 'finance', icon: Landmark,        badge: urgent7DaysEffects.length > 0 ? urgent7DaysEffects.length : undefined, color: 'emerald', adminOnly: true },
    { id: 'reconciliation', label: 'Rappro. Bancaire', category: 'finance', icon: ArrowLeftRight, color: 'blue', adminOnly: true },
    
    { id: 'stores',     label: 'Paramètres',    category: 'settings', icon: Settings, adminOnly: true }
  ], [pendingArrivals, openInvoices, alertCount, urgent7DaysEffects.length, rejectedChequesCount]);

  const currentStore = (activeStore !== 'ALL' && activeStore !== 'ALL_MAIN') ? stores.find(s => s.id === activeStore) : null;
  const isWarehouse = currentStore?.type === 'WAREHOUSE';
  const isChrifaOrAdmin = userRole === 'ADMIN' || userStoreId === 'CHRIFA' || stores.some(s => s.id === userStoreId && (s.isMain || s.id === 'CHRIFA'));

  const navItems = useMemo(() => {
    // Règle pour les entrepôts :
    if (isWarehouse) {
      return navItemsRaw.filter(item => 
        item.id === 'stock' || item.id === 'movements'
      );
    }

    return navItemsRaw.filter(item => {
      // Pour ADMIN : supprimer totalement Caisse et Frais & Dépenses
      if (userRole === 'ADMIN' && (item.id === 'sale' || item.id === 'expenses')) return false;
      if (item.adminOnly && userRole !== 'ADMIN') return false;
      if (item.commercialOnly && userRole === 'ADMIN') return false;
      if (item.adminOrMainOnly && !isChrifaOrAdmin) return false;
      return true;
    });
  }, [navItemsRaw, userRole, isWarehouse, isChrifaOrAdmin]);

  // Si on est sur une vue cachée par le changement de magasin (ex: WAREHOUSE), on switch
  useEffect(() => {
    if (isWarehouse) {
      if (!['stock', 'movements'].includes(activeView)) {
        setActiveView('stock');
      }
    } else {
      if (userRole === 'ADMIN' && (activeView === 'sale' || activeView === 'expenses')) {
        setActiveView('dashboard');
        return;
      }
      if (!navItems.find(n => n.id === activeView)) {
        if (userRole === 'ADMIN') setActiveView('dashboard');
        else setActiveView('stock');
      }
    }
  }, [navItems, activeView, userRole, isWarehouse]);

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
    <ConfirmProvider>
    <div className="min-h-screen flex flex-col bg-[#f0faf4] font-sans">

      {!isOnline && (
        <div className="sticky top-0 z-[60] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider shadow-md">
          <WifiOff className="w-4 h-4" />
          Connexion perdue — les actions en cours ne seront pas enregistrées tant que le réseau n'est pas revenu
        </div>
      )}

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
            {isReadOnly && (
              <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1" title="Accès consultation uniquement — aucune modification possible">
                <Lock className="w-3 h-3 text-blue-600" />
                <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Lecture seule</span>
              </div>
            )}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl px-3 h-9 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">Rechercher...</span>
              <span className="text-[9px] font-black bg-white border border-stone-200 rounded px-1.5 py-0.5 ml-1">Ctrl K</span>
            </button>
          </div>

          {/* Sélecteur de magasin : Réservé EXCLUSIVEMENT à l'Admin pour basculer dans les 3 magasins */}
          {userRole === 'ADMIN' ? (
            <div className="hidden md:flex items-center ml-4">
              <Select value={activeStore} onValueChange={(val) => setActiveStore(val as any)}>
                <SelectTrigger className="h-8 bg-stone-100 hover:bg-stone-200/70 border-stone-200 text-[10px] font-black uppercase tracking-widest text-stone-700 rounded-lg min-w-[200px] transition-colors shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL"><Globe className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Vue Globale (Tous)</SelectItem>
                  {stores.filter(s => s.type !== 'WAREHOUSE').map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <StoreIcon className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Magasin {s.name}
                    </SelectItem>
                  ))}
                  {isWarehouse && currentStore && (
                    <SelectItem value={currentStore.id} disabled>
                      <Package className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />{currentStore.name} (Entrepôt)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            /* Pour les comptes commerciaux : badge fixe indiquant leur magasin, sans possibilité de changer */
            <div className="hidden md:flex items-center ml-4">
              <div className="h-8 bg-emerald-50/80 border border-emerald-200 text-[10px] font-black uppercase tracking-widest text-emerald-800 rounded-lg px-3 flex items-center gap-1.5 shadow-sm">
                <StoreIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Magasin {stores.find(s => s.id === userStoreId)?.name || userStoreId || 'Principal'}</span>
              </div>
            </div>
          )}

          {/* ── Ligne 1 : Mode Entrepôt ou Catégories normales ── */}
          {isWarehouse ? (
            <div className="flex-1 flex items-center justify-between overflow-x-auto px-4 hide-scrollbar gap-3">
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl shrink-0">
                <Warehouse className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-black text-blue-950 uppercase tracking-tight">
                  {currentStore?.name || 'Entrepôt Principal'}
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest bg-blue-200 text-blue-800 px-2 py-0.5 rounded">
                  Entrepôt
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {[
                  { id: 'stock', label: 'Stock par Groupes', icon: Package },
                  { id: 'movements', label: 'Mouvements', icon: ArrowLeftRight }
                ].map(tab => {
                  const isActive = activeView === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as StockView)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-stone-900 text-white shadow-md'
                          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <Button
                onClick={() => {
                  if (userRole === 'ADMIN') {
                    setActiveStore('ALL');
                    setActiveView('dashboard');
                  } else {
                    setActiveStore('CHRIFA');
                    setActiveView('stock');
                  }
                }}
                variant="outline"
                className="h-8 text-[9px] font-black uppercase tracking-wider bg-white border-stone-300 text-stone-700 hover:bg-stone-900 hover:text-white rounded-xl flex items-center gap-1.5 shadow-sm shrink-0"
              >
                ⬅ {userRole === 'ADMIN' ? 'Quitter Entrepôt' : 'Retour Magasin CHRIFA'}
              </Button>
            </div>
          ) : (
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
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap relative ${
                        isActive 
                          ? 'bg-stone-900 text-white shadow-md' 
                          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                      }`}>
                      <cat.icon className="w-4 h-4" />
                      {cat.label}
                      {cat.id === 'commerce' && rejectedChequesCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1.5 right-1.5" />
                      )}
                      {cat.id === 'finance' && urgent7DaysEffects.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute top-1.5 right-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-[9px] font-black text-stone-500 hover:bg-stone-100 uppercase tracking-wider transition-colors">
              ← StockVue
            </a>
            {userRole === 'ADMIN' && (
              <Button variant="ghost" size="sm" onClick={() => setResetConfirmOpen(true)}
                title="Remettre le stock à 0 pour démarrer une nouvelle simulation"
                className="hidden sm:flex items-center gap-1.5 text-[9px] font-black text-rose-700 hover:text-rose-900 hover:bg-rose-50 h-9 px-3 rounded-xl border border-rose-200 uppercase tracking-wider">
                <RotateCcw className="w-3.5 h-3.5" /> Reset Stock (0)
              </Button>
            )}
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

        {/* ── Ligne 2 : Sous-menu contextuel (Seulement en mode normal Magasin, pas en Entrepôt) ── */}
        {!isWarehouse && (
          <div className="flex border-t border-stone-100 bg-stone-50 px-4 py-2 gap-2 overflow-x-auto hide-scrollbar shadow-inner">
            {navItems.filter(n => n.category === (navItems.find(n => n.id === activeView)?.category || 'dashboard')).map(({ id, label, icon: Icon, badge, color }) => (
              <button key={id} onClick={() => setActiveView(id as StockView)}
                className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase whitespace-nowrap transition-all ${
                  activeView === id
                    ? color === 'violet' ? 'bg-violet-600 text-white shadow-sm' 
                      : color === 'rose' ? 'bg-rose-600 text-white shadow-sm'
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
                    id === 'alerts' || id === 'cheques-impayes' ? 'bg-red-500 animate-pulse' : id === 'invoices' ? 'bg-orange-500' : id === 'treasury' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}>{badge > 99 ? '99+' : badge}</span>
                )}
              </button>
            ))}
          </div>
        )}
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
            {/* Bannière Alerte J-7 Attijariwafa Bank (Admin uniquement) */}
            {userRole === 'ADMIN' && urgent7DaysEffects.length > 0 && activeView !== 'treasury' && (
              <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-xl shadow-amber-600/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl shrink-0">
                    <AlertTriangle className="w-6 h-6 text-white animate-pulse" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight flex items-center gap-2">
                      <span>Alerte Échéance J-7 · Arbitrage Société Requis</span>
                      <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                        {urgent7DaysEffects.length} chèque(s) / LCN
                      </span>
                    </p>
                    <p className="text-xs text-amber-100 font-bold mt-0.5">
                      Des effets arrivent à échéance dans 7 jours ou moins sur votre compte <span className="underline font-black">Attijariwafa Bank</span>. Choisissez la société d'encaissement (LEBTEX ou ROBE IN BOX).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                  <Button
                    onClick={() => setArbitrageModalOpen(true)}
                    className="flex-1 md:flex-initial bg-white hover:bg-stone-100 text-amber-950 font-black text-xs uppercase px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95"
                  >
                    ⚡ Arbitrer en 1-clic
                  </Button>
                  <Button
                    onClick={() => setActiveView('treasury')}
                    className="flex-1 md:flex-initial bg-amber-900/60 hover:bg-amber-900 text-white font-black text-xs uppercase px-4 py-2.5 rounded-2xl border border-white/20 transition-all"
                  >
                    Voir Trésorerie
                  </Button>
                </div>
              </div>
            )}

            {activeView === 'dashboard' && (
              <StockDashboard
                userRole={userRole}
                activeStore={activeStore}
                stores={stores}
                stockItems={stockItems}
                allStockItems={allStockItems}
                articles={articles}
                movements={movements}
                categories={categories}
                generalCategories={generalCategories}
                sales={sales}
                invoices={invoices}
                clients={clients}
                payments={payments}
                transferOrders={transferOrders}
                onNavigate={(v) => setActiveView(v as any)}
              />
            )}
            {activeView === 'sale' && (
              <StockSaleFlow
                userRole={userRole}
                stockItems={saleStockItems}
                categories={categories}
                generalCategories={generalCategories}
                clients={filteredClients}
                invoices={invoices}
                stores={stores}
                selectedStoreId={effectiveSaleStoreId}
                onStoreChange={setSaleStoreId}
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
                userRole={userRole}
                onCreateClient={async (c) => { await handleCreateClient(c); }}
                onUpdateClient={handleUpdateClient}
                onRecordPayment={handleRecordPayment}
                onRecordMultiplePayments={handleRecordMultiplePayments}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'expenses' && (
              <CommercialExpensesView
                expenses={expenses}
                stores={stores}
                activeStore={activeStore}
                userRole={userRole}
                currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Commercial'}
                currentUserId={user?.uid}
                generalCategories={generalCategories}
                categories={categories}
                articles={articles}
                onAddExpense={handleAddExpense}
                onUpdateExpenseStatus={handleUpdateExpenseStatus}
                onDeleteExpense={handleDeleteExpense}
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
                onProcessReturn={handleProcessReturn}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'cheques-impayes' && (
              <ChequesImpayesView
                payments={filteredPayments}
                allPayments={payments}
                clients={clients}
                invoices={invoices}
                stores={stores}
                activeStore={activeStore}
                userRole={userRole}
                userStoreId={userStoreId ?? undefined}
                onUpdatePaymentStatus={handleUpdatePaymentStatus}
                onNavigate={setActiveView}
              />
            )}
            {activeView === 'stock' && (
              <StockFiches
                stores={stores}
                stockItems={stockItems}
                allStockItems={allStockItems}
                movements={movements}
                categories={categories}
                generalCategories={generalCategories}
                factures={factures}
                userRole={userRole}
                activeStore={activeStore}
                adminUid={adminUid}
                onAddMovement={handleAddMovement}
              />
            )}
            {activeView === 'treasury' && (
              <TreasuryDashboard 
                payments={payments} 
                clients={clients} 
                invoices={invoices} 
                remittances={remittances}
                onUpdatePaymentStatus={handleUpdatePaymentStatus}
                onAssignPaymentCompany={handleAssignPaymentCompany}
                onCreateRemittance={handleCreateCheckRemittance}
                onUpdateRemittanceStatus={handleUpdateRemittanceStatus}
              />
            )}
            {activeView === 'reconciliation' && (
              <BankReconciliationView payments={payments} clients={clients} />
            )}
            {activeView === 'movements' && (
              <StockMovements activeStore={activeStore} movements={filteredMovements} stockItems={stockItems} categories={categories} articles={articles} stores={stores} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'inventory' && (
              <BlindInventory
                stockItems={stockItems}
                categories={categories}
                generalCategories={generalCategories}
                activeStore={activeStore}
                stores={stores}
                adminUid={adminUid}
                onAddMovement={handleAddMovement}
                onFinalizeSession={handleFinalizeInventorySession}
              />
            )}
            {activeView === 'alerts' && (
              <StockAlerts stockItems={stockItems} articles={articles} categories={categories} movements={filteredMovements} activeStore={activeStore} onNavigate={setActiveView} adminUid={adminUid} onAddMovement={handleAddMovement} />
            )}
            {activeView === 'audit' && (
              <AuditLogView entries={auditLogEntries} />
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
            {activeView === 'warehouses' && isChrifaOrAdmin && (
              <StockWarehouses
                stores={stores}
                stockItems={stockItems}
                allStockItems={allStockItemsGlobal}
                movements={filteredMovements}
                userRole={userRole}
                userStoreId={userStoreId}
                adminUid={adminUid}
                onSelectStore={(storeId, view) => {
                  setActiveStore(storeId as any);
                  setActiveView(view || 'stock');
                }}
              />
            )}
            {activeView === 'stores' && userRole === 'ADMIN' && (
              <StoresView stores={stores} adminUid={adminUid} />
            )}
            {activeView === 'arrivals' && (userRole === 'ADMIN' || isChrifaOrAdmin) && (() => {
              const tenDaysAgo = new Date();
              tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
              const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0];

              const formatDaysAgo = (dateStr: string | null) => {
                if (!dateStr) return '';
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  d.setHours(0, 0, 0, 0);
                  const diffDays = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays <= 0) return "Aujourd'hui";
                  if (diffDays === 1) return "Hier";
                  return `Il y a ${diffDays} j`;
                }
                return '';
              };

              const arrivalCardsData = factures
                .map((f: any) => {
                  const stockEntryDate = f.stockEntryDate || movements.find(m => (m.factureId === f.id || m.factureRef === f.id) && m.type === 'IN')?.date || null;
                  const isEnteredInStock = !!(
                    f.stockEntryDate ||
                    f.status === 'STOCK' ||
                    isArrivalOlderThanOneMonth(f.arrivalDate) ||
                    movements.some(m => (m.factureId === f.id || m.factureRef === f.id) && m.type === 'IN')
                  );
                  const isWithin10Days = stockEntryDate ? stockEntryDate >= tenDaysAgoStr : false;

                  const factureArts = articles.filter((a: any) => a.factureId === f.id || a.facture === f.id);
                  const artCount = factureArts.length;
                  const totalQty = factureArts.reduce((acc: number, a: any) => acc + (Number(a.quantity) || 0), 0);

                  return {
                    f,
                    factureArts,
                    artCount,
                    totalQty,
                    stockEntryDate,
                    isEnteredInStock,
                    isWithin10Days,
                  };
                })
                .filter((item) => {
                  if (arrivalFilter === 'ENTERED_10D') {
                    if (!item.isEnteredInStock || !item.isWithin10Days) return false;
                  } else if (arrivalFilter === 'PENDING') {
                    if (item.isEnteredInStock) return false;
                  }

                  if (arrivalSearch.trim()) {
                    const q = arrivalSearch.toLowerCase().trim();
                    const matchId = (item.f.id || '').toLowerCase().includes(q);
                    const matchSupplier = (item.f.supplier || item.f.supplierId || '').toLowerCase().includes(q);
                    if (!matchId && !matchSupplier) return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  if (!a.isEnteredInStock && b.isEnteredInStock) return -1;
                  if (a.isEnteredInStock && !b.isEnteredInStock) return 1;
                  const dateA = a.stockEntryDate || a.f.arrivalDate || '';
                  const dateB = b.stockEntryDate || b.f.arrivalDate || '';
                  return dateB.localeCompare(dateA);
                });

              const totalPiecesFiltered = arrivalCardsData.reduce((s, item) => s + item.totalQty, 0);
              const totalRefsFiltered = arrivalCardsData.reduce((s, item) => s + item.artCount, 0);

              return (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Header avec KPI */}
                  <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                      <div>
                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Logistique Import</p>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                          Arrivages <span className="text-emerald-500">StockVue</span>
                        </h2>
                        <p className="text-stone-400 text-xs mt-2">
                          {arrivalFilter === 'ENTERED_10D'
                            ? "Affichage des arrivages entrés en stock au cours des 10 derniers jours (≤ 10 jours)."
                            : arrivalFilter === 'PENDING'
                            ? "Dossiers d'arrivage en attente de validation pour entrer en stock."
                            : "Historique global de tous les arrivages."}
                        </p>
                      </div>

                      {/* KPI Badges */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-3 cursor-pointer hover:bg-emerald-500/20 transition-all" onClick={() => setArrivalFilter('ENTERED_10D')}>
                          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Entrés en stock (≤ 10j)</p>
                          <p className="text-2xl font-black text-emerald-400 mt-0.5">{arrivalsStats.entered10D}</p>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 cursor-pointer hover:bg-amber-500/20 transition-all" onClick={() => setArrivalFilter('PENDING')}>
                          <p className="text-[8px] font-black uppercase tracking-widest text-amber-400">En attente d'entrée</p>
                          <p className="text-2xl font-black text-amber-400 mt-0.5">{arrivalsStats.pending}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                          <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Total Références</p>
                          <p className="text-2xl font-black text-white mt-0.5">{totalRefsFiltered}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                          <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Total Pièces</p>
                          <p className="text-2xl font-black text-white mt-0.5">{(Number(totalPiecesFiltered) || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Barre d'outils : Onglets + Recherche */}
                  <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                    {/* Onglets */}
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <button
                        onClick={() => setArrivalFilter('ENTERED_10D')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          arrivalFilter === 'ENTERED_10D'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Entrés en stock (≤ 10 jours)
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          arrivalFilter === 'ENTERED_10D' ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-700'
                        }`}>
                          {arrivalsStats.entered10D}
                        </span>
                      </button>

                      <button
                        onClick={() => setArrivalFilter('PENDING')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          arrivalFilter === 'PENDING'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        <Anchor className="w-3.5 h-3.5" />
                        En attente d'entrée
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          arrivalFilter === 'PENDING' ? 'bg-amber-600 text-white' : 'bg-stone-200 text-stone-700'
                        }`}>
                          {arrivalsStats.pending}
                        </span>
                      </button>

                      <button
                        onClick={() => setArrivalFilter('ALL')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          arrivalFilter === 'ALL'
                            ? 'bg-stone-800 text-white shadow-sm'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        Tout l'historique
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          arrivalFilter === 'ALL' ? 'bg-stone-700 text-white' : 'bg-stone-200 text-stone-700'
                        }`}>
                          {factures.length}
                        </span>
                      </button>
                    </div>

                    {/* Barre de recherche */}
                    <div className="relative w-full md:w-80">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="text"
                        placeholder="Rechercher par dossier ou fournisseur..."
                        value={arrivalSearch}
                        onChange={e => setArrivalSearch(e.target.value)}
                        className="pl-9 h-10 bg-stone-50 border-stone-200 rounded-xl text-xs font-semibold focus:bg-white"
                      />
                      {arrivalSearch && (
                        <button
                          onClick={() => setArrivalSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Liste arrivages */}
                  {arrivalCardsData.length === 0 ? (
                    <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                      <Anchor className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                      <p className="text-stone-600 font-black uppercase text-xs tracking-widest">
                        {arrivalSearch ? "Aucun arrivage trouvé pour cette recherche" : "Aucun arrivage dans cette vue"}
                      </p>
                      <p className="text-stone-400 text-[11px] font-medium mt-1">
                        {arrivalFilter === 'ENTERED_10D'
                          ? "Aucun arrivage validé et entré en stock au cours des 10 derniers jours."
                          : arrivalFilter === 'PENDING'
                          ? "Tous les arrivages enregistrés sont déjà validés et entrés en stock !"
                          : "Aucun dossier import enregistré."}
                      </p>
                      {arrivalFilter === 'ENTERED_10D' && arrivalsStats.pending > 0 && (
                        <button
                          onClick={() => setArrivalFilter('PENDING')}
                          className="mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md"
                        >
                          Voir les {arrivalsStats.pending} arrivage(s) en attente d'entrée
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {arrivalCardsData.map((item) => {
                        const { f, artCount, totalQty, stockEntryDate, isEnteredInStock, factureArts } = item;
                        return (
                          <div
                            key={f.id}
                            className={`bg-white rounded-2xl border-2 p-6 flex flex-col justify-between gap-4 transition-all shadow-sm hover:shadow-md ${
                              isEnteredInStock ? 'border-emerald-200' : 'border-amber-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{f.supplierId || f.supplier || 'Fournisseur'}</p>
                                  <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mt-0.5">{f.id}</h3>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {isEnteredInStock ? (
                                    <>
                                      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> En stock
                                      </span>
                                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                        <Clock className="w-2.5 h-2.5 text-emerald-600" />
                                        {formatDaysAgo(stockEntryDate)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                                      <Anchor className="w-3.5 h-3.5 text-amber-600" /> En attente de stock
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center mt-4">
                                <div className="bg-stone-50 rounded-xl p-2.5">
                                  <p className="text-[8px] font-black text-stone-400 uppercase">Arrivée</p>
                                  <p className="text-[10px] font-black text-stone-700 mt-0.5">{f.arrivalDate || '—'}</p>
                                </div>
                                <div className={`rounded-xl p-2.5 ${isEnteredInStock ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                  <p className={`text-[8px] font-black uppercase ${isEnteredInStock ? 'text-emerald-600' : 'text-amber-600'}`}>Entrée Stock</p>
                                  <p className={`text-[10px] font-black mt-0.5 ${isEnteredInStock ? 'text-emerald-800' : 'text-amber-800'}`}>
                                    {stockEntryDate || 'En attente'}
                                  </p>
                                </div>
                                <div className="bg-stone-50 rounded-xl p-2.5">
                                  <p className="text-[8px] font-black text-stone-400 uppercase">Articles</p>
                                  <p className="text-[10px] font-black text-stone-900 mt-0.5">
                                    {artCount} réf. ({(Number(totalQty) || 0).toLocaleString()} pcs)
                                  </p>
                                </div>
                              </div>

                              {/* Aperçu des articles */}
                              {factureArts.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-stone-100 space-y-1.5">
                                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-wider">Aperçu articles :</p>
                                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                    {factureArts.slice(0, 4).map((a: any) => (
                                      <div key={a.id} className="flex items-center justify-between text-[10px] bg-stone-50 px-2 py-1 rounded-lg">
                                        <span className="font-bold text-stone-700 truncate max-w-[170px]">{a.productName || a.nameFR}</span>
                                        <span className="font-black text-emerald-700 whitespace-nowrap">{a.quantity} {a.unitOfMeasure || 'pcs'}</span>
                                      </div>
                                    ))}
                                    {factureArts.length > 4 && (
                                      <p className="text-[8px] font-bold text-stone-400 text-center">+ {factureArts.length - 4} autre(s) article(s)</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="pt-2">
                              {!isEnteredInStock ? (
                                <button
                                  onClick={() => setPassToStockId(f.id)}
                                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[9px] tracking-widest px-4 py-3 rounded-xl transition-all shadow-md shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 cursor-pointer"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                  📥 Valider l'Entrée en Stock + Coût de Revient
                                </button>
                              ) : (
                                <div className="w-full flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-black uppercase text-[9px] tracking-widest px-3 py-2.5 rounded-xl select-none">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Entrée validée {stockEntryDate ? `(${stockEntryDate})` : (isArrivalOlderThanOneMonth(f.arrivalDate) ? '(Historique)' : '')}</span>
                                  <span className="text-[8px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded font-black flex items-center gap-1 ml-1">
                                    <Lock className="w-2.5 h-2.5" /> Verrouillé
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
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
          associatedArticles={articles.filter((a: any) => a.factureId === passToStockId || a.facture === passToStockId)}
          subCategories={categories}
          stores={stores}
          adminUid={adminUid}
          existingMovements={allMovements.filter((m: any) => m.factureId === passToStockId || m.factureRef === passToStockId)}
        />
      )}

      {/* ── Modal Arbitrage J-7 (Attijariwafa Bank) ── */}
      <Dialog open={arbitrageModalOpen} onOpenChange={setArbitrageModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white p-6 rounded-3xl">
          <DialogTitle className="text-base font-black text-stone-900 uppercase flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Arbitrage J-7 · Émission sur Compte Attijariwafa Bank
          </DialogTitle>
          <DialogDescription className="text-xs font-bold text-stone-500">
            Sélectionnez la société sur laquelle émettre chaque chèque ou LCN arrivant à échéance sous 7 jours.
          </DialogDescription>

          <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {urgent7DaysEffects.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-black text-emerald-900 text-sm">Tous les effets ont été arbitrés !</p>
                <p className="text-xs text-emerald-700 font-bold">Aucun effet sans société à moins de 7 jours de l'échéance.</p>
              </div>
            ) : (
              urgent7DaysEffects.map(p => {
                const due = p.dueDate ? new Date(p.dueDate) : null;
                const today = new Date();
                today.setHours(0,0,0,0);
                const days = due ? Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const clientName = clients.find(c => c.id === p.clientId)?.name || 'Client';

                return (
                  <div key={p.id} className="p-4 rounded-2xl border border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-violet-100 text-violet-800 rounded">
                          {p.method}
                        </span>
                        <span className="text-xs font-black text-stone-900">{clientName}</span>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          {days !== null && (days < 0 ? `Échu (+${Math.abs(days)}j)` : days === 0 ? "Aujourd'hui" : `J-${days}`)}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-stone-500 mt-1">
                        Échéance : <span className="font-mono text-stone-800">{p.dueDate}</span> · Tiré sur {p.bankName || 'Banque'} · N° {p.checkNumber || '—'}
                      </p>
                      <p className="text-sm font-black text-stone-900 mt-1">
                        {(Number(p.amount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAssignPaymentCompany(p.id, 'LEBTEX')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase rounded-xl h-8 px-3 gap-1 shadow-sm"
                      >
                        <Building2 className="w-3 h-3" />
                        LEBTEX
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAssignPaymentCompany(p.id, 'ROBE IN BOX')}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-black text-[10px] uppercase rounded-xl h-8 px-3 gap-1 shadow-sm"
                      >
                        <Sparkles className="w-3 h-3" />
                        ROBE IN BOX
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Section Émission rapide de Bordereau de Remise PDF */}
          {(pendingLebtexRemisePayments.length > 0 || pendingRobeRemisePayments.length > 0) && (
            <div className="mt-4 pt-4 border-t border-stone-200 space-y-2 bg-stone-50/80 -mx-6 -mb-6 p-5 rounded-b-3xl">
              <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-stone-700" />
                <span>Émettre en banque Attijariwafa (Bordereau PDF + Historique) :</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pendingLebtexRemisePayments.length > 0 && (
                  <Button
                    onClick={() => {
                      handleCreateCheckRemittance('LEBTEX', pendingLebtexRemisePayments.map(p => p.id));
                      setArbitrageModalOpen(false);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl h-10 px-3 flex items-center justify-between shadow-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      Remise LEBTEX ({pendingLebtexRemisePayments.length})
                    </span>
                    <span className="font-mono text-[11px] opacity-90">
                      {(Number(pendingLebtexTotal) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                    </span>
                  </Button>
                )}
                {pendingRobeRemisePayments.length > 0 && (
                  <Button
                    onClick={() => {
                      handleCreateCheckRemittance('ROBE IN BOX', pendingRobeRemisePayments.map(p => p.id));
                      setArbitrageModalOpen(false);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase rounded-xl h-10 px-3 flex items-center justify-between shadow-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      Remise ROBE IN BOX ({pendingRobeRemisePayments.length})
                    </span>
                    <span className="font-mono text-[11px] opacity-90">
                      {(Number(pendingRobeTotal) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                    </span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Modal de Confirmation Réinitialisation Stock (Mode Simulation) */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-stone-900 uppercase">
                Réinitialiser le Stock à 0
              </DialogTitle>
              <DialogDescription className="text-xs text-stone-500 font-bold">
                Prêt pour une nouvelle simulation
              </DialogDescription>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 my-2 text-xs text-rose-900 space-y-1.5">
            <p className="font-bold">Cette action va :</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-800">
              <li>Supprimer tous les mouvements de stock (/stock)</li>
              <li>Supprimer les ventes, factures de caisse et paiements (/stock)</li>
              <li>Remettre toutes les quantités physiques en stock à 0</li>
              <li>Réactiver les arrivages récents pour retester « Passer au stock »</li>
            </ul>
            <p className="font-black text-emerald-800 text-[11px] pt-1">
              ✓ Vos 495 articles et 46 factures dans /gestion restent 100% INTACTS.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 mt-4">
            <Button
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
              disabled={isResetting}
              className="rounded-xl text-xs font-bold"
            >
              Annuler
            </Button>
            <Button
              onClick={handleResetStockSimulation}
              disabled={isResetting}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider gap-1.5 shadow-md shadow-rose-600/20"
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Réinitialisation...
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" /> Confirmer le Reset à 0
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        stockItems={stockItems}
        clients={clients}
        invoices={invoices}
        onNavigate={(v) => setActiveView(v as StockView)}
      />
    </div>
    </ConfirmProvider>
  );
}
