"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, LogOut, LayoutDashboard, List, ArrowLeftRight, Bell, Package,
  Boxes, ShoppingCart, TrendingUp, Users, ClipboardList, FileText, Anchor, Archive, CheckCircle2, Download, Truck, Store as StoreIcon,
  Settings, MapPin, Send, Home, AlertTriangle, Building2, Sparkles, Warehouse, CreditCard, Receipt, Search,
  Calendar, Clock, Filter, Lock, RotateCcw, Globe, WifiOff, ChevronLeft, GraduationCap
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
import WarehouseLocationsView from './warehouse-locations-view';
import { authedFetch } from '@/lib/authed-fetch';
import { planifierChargement, listeAImprimer, type LigneChargement } from '@/lib/stock-formation';
import { choisirCibles, devoirHtml, corrigeHtml } from '@/lib/devoir-formation';
import { exportDevoirFormationPDF } from '@/lib/pdf-devoir-formation';
import { Encadre, BoutonValider } from './ui-formulaire';
import {
  centimes, effetEnAttente, imputationsDuPaiement, agregerParFacture, statutFacture,
} from '@/lib/reglement';
import ArrivalDossierModal from './arrival-dossier-modal';
import StoreImportRequestsView from './store-import-requests-view';
import {
  type StorageLocation, type StockVariant, type VariantDimension, suggestInboundLocation, splitOutboundLines,
  stockItemVariant, articleVariantDimension, lignesEntreeManquantes, normalizeVariantValue,
  breakdownRowQuantity, libelleFixe,
} from '@/lib/warehouse-locations';
import { uniteImposee, uniteDeStock, poleDeLArticle } from '@/lib/unites-pole';
import TreasuryDashboard from './treasury-dashboard';
import BankReconciliationView from './bank-reconciliation-view';
import AuditLogView from './audit-log-view';
import ChequesImpayesView from './cheques-impayes-view';
import CommercialExpensesView from './commercial-expenses-view';
import { Landmark } from 'lucide-react';

type StockView = 'dashboard' | 'sale' | 'stock' | 'analytics' | 'clients' | 'orders' | 'invoices' | 'cheques-impayes' | 'expenses' | 'movements' | 'alerts' | 'arrivals' | 'transfers' | 'stores' | 'warehouses' | 'locations' | 'import-requests' | 'treasury' | 'reconciliation' | 'audit' | 'inventory';

// Formate une Date en YYYY-MM-DD à partir de ses composantes LOCALES — contrairement à
// toISOString() (qui convertit en UTC), ça évite qu'un calcul "il y a N jours" bascule sur le
// mauvais jour selon l'heure et le fuseau horaire du navigateur au moment du calcul.
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Convertit une valeur Firestore hétérogène (Timestamp, {seconds}, Date, string ISO, epoch ms)
// en Date — renvoie null si la valeur est absente ou inexploitable (ex : serverTimestamp() encore
// en attente d'acquittement serveur, qui arrive à null côté client).
function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') { const d = v.toDate(); return isNaN(d.getTime()) ? null : d; }
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Calcul du stock courant ─────────────────────────────────────────────────

// Un entrepôt n'est pas un point de vente indépendant : c'est du stock
// supplémentaire pour CHRIFA (le magasin de vente principal). Derb Omar et
// IDAA restent des magasins autonomes avec leur propre stock. Tout entrepôt
// actuel ou futur (type === 'WAREHOUSE') est donc rattaché à CHRIFA.
function isWarehouseStore(storeId: string | undefined, stores: any[]): boolean {
  if (!storeId) return false;
  const store = stores.find(s => s.id === storeId);
  return store?.type === 'WAREHOUSE';
}

function getInitialQtyForStore(item: any, activeStore: string, userStoreId: string, stores: any[]): number {
  const byStore = item.initialQtyByStore;
  if (!byStore) {
    return 0;
  }

  // Vue Globale admin : seul le stock des entrepôts compte. Le stock des
  // magasins (CHRIFA, Derb Omar, IDAA) tourne trop vite pour être pertinent
  // au niveau global — il reste visible uniquement dans la vue du magasin.
  if (activeStore === 'ALL') {
    return Object.entries(byStore).reduce((sum, [sId, val]) => {
      if (isWarehouseStore(sId, stores)) return sum + (Number(val) || 0);
      return sum;
    }, 0);
  }

  if (activeStore === 'ALL_MAIN') {
    const sId = userStoreId || 'CHRIFA';
    return Number(byStore[sId]) || 0;
  }

  if (activeStore === 'CHRIFA') {
    return Object.entries(byStore).reduce((sum, [sId, val]) => {
      if (sId === 'CHRIFA' || isWarehouseStore(sId, stores)) return sum + (Number(val) || 0);
      return sum;
    }, 0);
  }

  // Pour un magasin spécifique ou un entrepôt spécifique sélectionné : strictement son stock propre
  return Number(byStore[activeStore]) || 0;
}

// Lignes de ventilation d'un article éclaté (qualité, couleur ou taille), regroupées par libellé
// normalisé (sans casse, espaces autour retirés — voir normalizeVariantValue). Les mouvements sont
// rattachés à une ligne par ce même libellé normalisé : deux lignes « Bleu » et « bleu » (ou deux
// fois « 101 ») captent donc les MÊMES mouvements, et deux lignes de stock compteraient ce stock
// deux fois — puis la consolidation d'affichage les additionnerait (160 pour 80). On n'en garde
// qu'une : la première (son libellé, son prix, ses caractéristiques), à laquelle on ajoute la
// quantité ventilée et le stock initial des doublons, qui eux sont bien distincts.
// Les lignes sans libellé sont écartées, comme avant.
function mergeBreakdownRows(rows: any[], labelOf: (row: any) => unknown): { row: any; label: string }[] {
  const byLabel = new Map<string, { row: any; label: string }>();
  for (const row of rows) {
    const label = String(labelOf(row) ?? '').trim();
    const key = normalizeVariantValue(label);
    if (!key) continue;
    const kept = byLabel.get(key);
    if (!kept) { byLabel.set(key, { row, label }); continue; }

    const merged: any = { ...kept.row };
    // `quantity` pour les qualités et les tailles, `rolls` pour les couleurs.
    for (const field of ['quantity', 'rolls']) {
      if (kept.row[field] != null || row[field] != null) {
        merged[field] = (Number(kept.row[field]) || 0) + (Number(row[field]) || 0);
      }
    }
    if (kept.row.initialQtyByStore || row.initialQtyByStore) {
      const byStore: Record<string, number> = {};
      for (const source of [kept.row.initialQtyByStore, row.initialQtyByStore]) {
        for (const [sId, val] of Object.entries(source || {})) byStore[sId] = (byStore[sId] || 0) + (Number(val) || 0);
      }
      merged.initialQtyByStore = byStore;
    }
    kept.row = merged;
  }
  return [...byLabel.values()];
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
  // Arrivages de plus d'un mois JAMAIS validés manuellement : leur stock ne doit PAS être pris
  // en compte (marchandise probablement épuisée avant logiciel, jamais réellement entrée en stock).
  // Mais un arrivage qui a un stockEntryDate explicite a été validé délibérément via "Finaliser
  // l'Entrée" (/gestion → Arrivages) — même tardivement — donc ses mouvements sont réels et
  // doivent compter, sinon l'entrée en stock manuelle est silencieusement ignorée.
  const oldFactureIds = new Set<string>();
  for (const f of (factures || [])) {
    if (f?.id && isArrivalOlderThanOneMonth(f.arrivalDate) && !f.stockEntryDate) {
      oldFactureIds.add(String(f.id));
    }
  }

  const isArticleFromOldArrival = (art: any) => {
    if (!art) return false;
    if (art.stockEntryDate) return false;
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
    const sId = storeId || 'CHRIFA';

    // Vue Globale admin : seul le stock des entrepôts compte (voir getInitialQtyForStore).
    if (activeStore === 'ALL') return isWarehouseStore(sId, stores);

    if (activeStore === 'ALL_MAIN') {
      return sId === userStoreId || (!userStoreId && sId === 'CHRIFA');
    }

    // CHRIFA : les entrepôts (actuels et futurs) sont son propre stock, pas des lieux séparés
    if (activeStore === 'CHRIFA') {
      return sId === 'CHRIFA' || isWarehouseStore(sId, stores);
    }

    // Tout autre magasin ou entrepôt individuel : strictement son propre stock
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
    // Unité du stock : celle que le pôle impose (TAFFETA FABRIC : m) l'emporte sur celle notée
    // sur l'article. Vente, transferts, inventaire et mouvements la recopient depuis ici.
    // Le pôle se lit par la catégorie d'abord (elle a pu changer de pôle depuis la commande).
    const uniteStock = uniteDeStock(poleDeLArticle(a, categories, generalCategories)) || a.unitOfMeasure || 'unité';
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

    // Mouvements d'une variante : libellé comparé sans casse ni espaces autour, des deux côtés
    // (les mouvements récents sont écrits nettoyés, les libellés de ventilation pas forcément).
    const variantMovements = (dimension: VariantDimension, label: string) => {
      const wanted = normalizeVariantValue(label);
      return artMovements.filter(m => normalizeVariantValue(m[dimension]) === wanted);
    };
    // Mouvements que la ventilation ne réclame pas : sans libellé, ou sous un libellé qui n'y
    // figure pas (entrée écrite avant l'étiquetage, libellé renommé depuis…). EUX SEULS se
    // répartissent entre les lignes. Un mouvement étiqueté appartient à SA variante.
    //
    // Avant, la décision était tout-ou-rien pour l'article entier : dès qu'UN SEUL mouvement
    // portait un libellé — une vente de 5, un ajustement d'inventaire de −2 — tout passait en
    // mode strict et l'entrée en bloc de 500 n'était plus rattachée à personne : 500 unités
    // s'évaporaient de l'écran et de la valorisation. À l'inverse, ignorer ces orphelins
    // effacerait du stock bien réel.
    const mouvementsOrphelins = (dimension: VariantDimension, rows: { label: string }[]) => {
      const labels = new Set(rows.map(r => normalizeVariantValue(r.label)));
      return artMovements.filter(m => !labels.has(normalizeVariantValue(m[dimension])));
    };

    // Part des mouvements orphelins qui revient à une ligne : au prorata des quantités ventilées,
    // et à parts égales seulement si aucune ligne n'en porte. Une ligne à 0 ne reçoit rien —
    // sinon une couleur commandée mais jamais reçue se retrouverait avec du stock à vendre.
    const partOrphelins = (orphelins: any[], quantiteLigne: number, totalVentile: number, nbLignes: number) => {
      const part = totalVentile > 0 ? (quantiteLigne / totalVentile) : (1 / Math.max(1, nbLignes));
      if (!(part > 0)) return [];
      return orphelins.map(m => ({ ...m, quantity: Math.round((Number(m.quantity) || 0) * part * 1000) / 1000 }));
    };

    // Stock initial d'une ligne de ventilation. « Ajouter à l'inventaire » n'inscrit le stock que
    // sur l'ARTICLE, jamais ligne par ligne : sans répartition, un produit ventilé par couleur ou
    // par taille affichait 0 partout (invisible dans /stock alors que la boutique l'affichait),
    // et un produit ventilé par qualité recevait le total ENTIER sur CHAQUE ligne dans qtyByStore
    // — stock multiplié par le nombre de qualités à la caisse, aux transferts et à l'inventaire.
    // Le reliquat d'arrondi va à la dernière ligne, pour que la somme retombe juste.
    const repartirStockInitial = (rows: { row: any }[], parts: number[]): (Record<string, number> | null)[] => {
      const cartes: (Record<string, number> | null)[] = rows.map(r => (r.row?.initialQtyByStore as any) || null);
      if (isOldArrival || !a.initialQtyByStore) return isOldArrival ? rows.map(() => null) : cartes;
      const aRepartir = rows.map((_, i) => i).filter(i => !cartes[i]);
      if (aRepartir.length === 0) return cartes;
      const total = parts.reduce((somme, q) => somme + q, 0);
      for (const [sId, val] of Object.entries(a.initialQtyByStore)) {
        const totalMagasin = Number(val) || 0;
        let distribue = 0;
        aRepartir.forEach((i, rang) => {
          const part = total > 0 ? (parts[i] / total) : (1 / aRepartir.length);
          const q = (rang === aRepartir.length - 1)
            ? Math.round((totalMagasin - distribue) * 1000) / 1000
            : Math.round(totalMagasin * part);
          distribue += q;
          cartes[i] = { ...(cartes[i] || {}), [sId]: q };
        });
      }
      return cartes;
    };

    // Dimension ventilée : exactement celle que l'entrée en stock a utilisée pour écrire les
    // mouvements (articleVariantDimension). Décider autrement ici afficherait la marchandise
    // sur une dimension où aucun mouvement n'a été écrit.
    const dimensionVentilee = articleVariantDimension(a);

    // ── CAS 0 : qualityBreakdown renseigné (multi-qualités fabric ou zipper ou thread ou slider) ──
    if (dimensionVentilee === 'quality') {
      const qualityRows = mergeBreakdownRows(qualityBreakdown, r => r.quality);
      const partsQualite = qualityRows.map(r => breakdownRowQuantity(r.row));
      const totalQualityQty = partsQualite.reduce((somme, q) => somme + q, 0);
      const cartesQualite = repartirStockInitial(qualityRows, partsQualite);
      const orphelinsQualite = mouvementsOrphelins('quality', qualityRows);
      for (const [indexLigne, { row, label: qualityLabel }] of qualityRows.entries()) {
        const matchedRowQ = cat?.fabricQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.zipperQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.threadQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase())
          || cat?.sliderQualities?.find((q: any) => q.label?.toLowerCase() === qualityLabel.toLowerCase());
        
        const rowNameFR = row.nameFR || matchedRowQ?.nameFR || itemFR;
        const rowProductName = rowNameFR || (qualityLabel ? `${baseCategoryName} ${qualityLabel}`.trim() : productName);

        // Prix : le même que pour les couleurs et les tailles. `priceOverride` est un prix d'achat
        // en DOLLARS (libellé « PA ($) » à la saisie de la commande) : l'écrire ici valorisait le
        // stock d'un article ventilé par qualité en dollars, et lui seul.
        const initialQty = cartesQualite[indexLigne]
          ? getInitialQtyForStore({ initialQtyByStore: cartesQualite[indexLigne] as any }, activeStore, userStoreId, stores)
          : 0;

        const qualityMov = variantMovements('quality', qualityLabel);
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = [
          ...qualityMov,
          ...partOrphelins(orphelinsQualite, partsQualite[indexLigne], totalQualityQty, qualityRows.length),
        ];

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            // Vue Globale (Entrepôts) : un transfert franchissant la frontière
            // magasin/entrepôt N'est PAS neutre pour ce sous-ensemble — il faut
            // le compter comme n'importe quel autre mouvement (voir isVisibleForUser).
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
          unitOfMeasure:       uniteStock,
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
          _qualityKey:         qualityLabel,
          qtyByStore:          computeQtyByStoreHelper({ initialQtyByStore: cartesQualite[indexLigne] || {} }, targetMovs, isOldArrival),
        } as any);
      }
      continue;
    }

    // ── CAS 1 : color === 'various' ET colorBreakdown renseigné ──────────────
    if (dimensionVentilee === 'color') {
      // Un StockItem par couleur de colorBreakdown (doublons de libellé fusionnés)
      const colorRows = mergeBreakdownRows(colorBreakdown, r => r.colorCode || r.description || r.color);
      const partsCouleur = colorRows.map(r => breakdownRowQuantity(r.row));
      const totalCouleur = partsCouleur.reduce((somme, q) => somme + q, 0);
      const cartesCouleur = repartirStockInitial(colorRows, partsCouleur);
      const orphelinsCouleur = mouvementsOrphelins('color', colorRows);
      for (const [indexLigne, { row, label: colorLabel }] of colorRows.entries()) {
        const initialQty = cartesCouleur[indexLigne]
          ? getInitialQtyForStore({ initialQtyByStore: cartesCouleur[indexLigne] as any }, activeStore, userStoreId, stores)
          : 0;

        // Les mouvements de CETTE couleur, plus sa part de ceux qui n'en portent aucune.
        const colorMov = variantMovements('color', colorLabel);
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = [
          ...colorMov,
          ...partOrphelins(orphelinsCouleur, partsCouleur[indexLigne], totalCouleur, colorRows.length),
        ];

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            // Vue Globale (Entrepôts) : un transfert franchissant la frontière
            // magasin/entrepôt N'est PAS neutre pour ce sous-ensemble — il faut
            // le compter comme n'importe quel autre mouvement (voir isVisibleForUser).
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
          unitOfMeasure:       uniteStock,
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
          qtyByStore:          computeQtyByStoreHelper({ initialQtyByStore: cartesCouleur[indexLigne] || {} }, targetMovs, isOldArrival),
        } as any);
      }
      continue; // ne pas créer le StockItem générique
    }

    // ── CAS 2 : size === 'various' ET sizeBreakdown renseigné ────────────────
    if (dimensionVentilee === 'size') {
      const sizeRows = mergeBreakdownRows(sizeBreakdown, r => r.size);
      const partsTaille = sizeRows.map(r => breakdownRowQuantity(r.row));
      const totalTaille = partsTaille.reduce((somme, q) => somme + q, 0);
      const cartesTaille = repartirStockInitial(sizeRows, partsTaille);
      const orphelinsTaille = mouvementsOrphelins('size', sizeRows);
      for (const [indexLigne, { row, label: sizeLabel }] of sizeRows.entries()) {
        const initialQty = cartesTaille[indexLigne]
          ? getInitialQtyForStore({ initialQtyByStore: cartesTaille[indexLigne] as any }, activeStore, userStoreId, stores)
          : 0;
        const sizeMov = variantMovements('size', sizeLabel);
        let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
        const targetMovs = [
          ...sizeMov,
          ...partOrphelins(orphelinsTaille, partsTaille[indexLigne], totalTaille, sizeRows.length),
        ];

        for (const m of targetMovs) {
          if (isOldArrivalMovement(m)) continue;
          if (m.reason === 'TRANSFERT') {
            // Vue Globale (Entrepôts) : un transfert franchissant la frontière
            // magasin/entrepôt N'est PAS neutre pour ce sous-ensemble — il faut
            // le compter comme n'importe quel autre mouvement (voir isVisibleForUser).
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
          unitOfMeasure:       uniteStock,
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
          qtyByStore:          computeQtyByStoreHelper({ initialQtyByStore: cartesTaille[indexLigne] || {} }, targetMovs, isOldArrival),
        } as any);
      }
      continue;
    }

    // ── CAS 3 : article normal (1 couleur / 1 taille ou sans variante) ────────
    let mouvIN = 0, mouvOUT = 0, mouvADJ = 0;
    for (const m of artMovements) {
      if (isOldArrivalMovement(m)) continue;
      if (m.reason === 'TRANSFERT') {
        // Vue Globale (Entrepôts) : un transfert franchissant la frontière
        // magasin/entrepôt N'est PAS neutre pour ce sous-ensemble — il faut
        // le compter comme n'importe quel autre mouvement (voir isVisibleForUser).
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
      unitOfMeasure:       uniteStock,
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
  // cleanUndefined est indispensable : les appelants passent explicitement `undefined` pour les
  // champs non applicables (toStoreId hors transfert, quality/gsm absents…) et Firestore refuse
  // tout document contenant une valeur undefined — l'écriture échouait alors en silence.
  await addDoc(collection(firestore, 'users', uid, 'stockMovements'), cleanUndefined({
    ...movement,
    createdAt: serverTimestamp(),
  }));
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
  // Stock de formation : chargement de quantités connues sur de vrais produits du catalogue,
  // pour faire travailler une nouvelle recrue. Effacé par « Reset Stock (0) » comme le reste.
  const [formationOpen, setFormationOpen] = useState(false);
  const [formationEnCours, setFormationEnCours] = useState(false);
  const [formationCharge, setFormationCharge] = useState(false);
  // Mot à recopier avant la remise à zéro : elle efface le fichier clients et tout l'historique
  // commercial, c'est irréversible, et un bouton seul se clique par erreur.
  const [resetConfirmText, setResetConfirmText] = useState('');
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
      const res = await authedFetch('/api/admin/reset-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid: targetUid }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.report || {};
        toast({
          title: 'Stock réinitialisé à 0',
          description: `${r.deletedMovements ?? 0} mouvement(s), ${r.deletedClients ?? 0} client(s), `
            + `${r.deletedInvoices ?? 0} facture(s), ${r.deletedClientPayments ?? 0} paiement(s), `
            + `${r.deletedTransferOrders ?? 0} transfert(s) et ${r.deletedAuditLogEntries ?? 0} entrée(s) d'audit supprimés.`,
        });
        setResetConfirmOpen(false);
        setResetConfirmText('');
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
  const locationsRef     = useMemoFirebase(() => (!firestore || !adminUid || !user) ? null : collection(firestore, 'users', adminUid, 'storageLocations'),   [firestore, adminUid, user]);

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
  const { data: rawLocations } = useCollection(locationsRef);

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
  const storageLocations = (rawLocations  || []) as StorageLocation[];

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

  // Vue "ALL_MAIN" : un commercial voit son propre magasin (ou CHRIFA par défaut
  // si aucun magasin n'est encore assigné) — même règle que isVisibleForUser côté
  // computeStockItems, reprise ici pour les chèques/paiements.
  const isIncludedInAllMain = (id: string | undefined) => {
    const sId = id || 'CHRIFA';
    return sId === userStoreId || (!userStoreId && sId === 'CHRIFA');
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
  // Commandes préparées qui attendent le client : ni facturées, ni annulées.
  const commandesEnAttente = orders.filter(o => o.status === 'DRAFT' || o.status === 'CONFIRMED').length;

  // Filtres & statistiques des arrivages
  const [arrivalFilter, setArrivalFilter] = useState<'ENTERED_10D' | 'PENDING' | 'ALL'>('ENTERED_10D');
  const [arrivalSearch, setArrivalSearch] = useState<string>('');

  const arrivalsStats = useMemo(() => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const tenDaysAgoStr = toLocalDateStr(tenDaysAgo);

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
  const [passToStockForceEditable, setPassToStockForceEditable] = useState(false);
  // Écran Arrivages : par défaut les dossiers récents et ceux dont l'entrée est incomplète. Sans
  // ce bouton, un dossier entré correctement il y a plus de 7 jours n'est plus atteignable — donc
  // ni corrigeable ni dévalidable, /gestion ne proposant aucun bouton sur un dossier verrouillé.
  const [arrivalsShowAll, setArrivalsShowAll] = useState(false);
  // Fiche dossier en consultation (quantités seules), ouverte depuis les cartes d'arrivage.
  const [dossierViewId, setDossierViewId] = useState<string | null>(null);

  const isLoading = isUserLoading || loadingArt || loadingCat;

  // ─── Handlers ────────────────────────────────────────────────────────────
  // Ce qui sera écrit : calculé à l'avance pour être relu avant de valider, et recopié dans le
  // corrigé du devoir après coup. Aucun produit n'est créé, seulement des mouvements d'entrée.
  const lignesFormation: LigneChargement[] = useMemo(() => planifierChargement(articles), [articles]);

  // Les noms de lieux tels qu'ils apparaîtront dans le devoir imprimé : la recrue doit lire
  // « Derb Omar », pas « DERB_OMAR ».
  // Déjà chargé ? La réponse est dans les mouvements, pas dans l'état de la fenêtre : le patron
  // imprime le devoir des jours après l'avoir chargé, et recharger doublerait tout le stock.
  const formationEnBase = useMemo(
    () => allMovements.some((m: any) => String(m?.notes || '').includes('STOCK DE FORMATION')),
    [allMovements],
  );

  const lieuxFormation = useMemo(() => {
    const principal = stores.find((st: any) => st.isMain) || stores.find((st: any) => st.id === 'CHRIFA');
    const reserve = stores.find((st: any) => st.type === 'WAREHOUSE');
    const autre = stores.find((st: any) => st.type !== 'WAREHOUSE' && st.id !== principal?.id);
    return {
      boutique: principal?.name || principal?.id || 'CHRIFA',
      reserve: reserve?.name || reserve?.id || 'la réserve',
      autreMagasin: autre?.name || autre?.id || 'un autre magasin',
    };
  }, [stores]);

  /**
   * Le devoir part en PDF téléchargé. La fenêtre d'impression du navigateur demandait une
   * manipulation de plus, se faisait bloquer par les pop-ups, et ne produisait pas un fichier
   * qu'on puisse envoyer tel quel à la recrue.
   */
  const exporterDevoir = (avecReponses: boolean) => {
    const cibles = choisirCibles(lignesFormation);
    if (!cibles) {
      toast({
        variant: 'destructive',
        title: 'Devoir impossible',
        description: "Il faut au moins cinq références en boutique, avec assez de quantité, pour construire le devoir.",
      });
      return;
    }
    try {
      exportDevoirFormationPDF(
        avecReponses
          ? corrigeHtml(lignesFormation, cibles, lieuxFormation)
          : devoirHtml(lignesFormation, cibles, lieuxFormation),
        avecReponses ? 'corrige-formation' : 'devoir-formation',
      );
      toast({
        title: avecReponses ? 'Corrigé exporté' : 'Devoir exporté',
        description: `${avecReponses ? 'corrige-formation.pdf' : 'devoir-formation.pdf'} est dans vos téléchargements.`,
      });
    } catch (e: any) {
      console.error('[formation] export PDF impossible :', e);
      toast({ variant: 'destructive', title: 'Export impossible', description: e?.message || 'Le PDF n’a pas pu être créé.' });
    }
  };

  const handleChargerStockFormation = async () => {
    if (!user || !firestore || lignesFormation.length === 0) return;
    const effectiveUid = adminUid || user.uid;
    const magasin = (stores.find((st: any) => st.isMain)?.id || 'CHRIFA') as string;
    const entrepot = (stores.find((st: any) => st.type === 'WAREHOUSE')?.id || magasin) as string;
    const aujourdhui = toLocalDateStr(new Date());

    setFormationEnCours(true);
    try {
      const movsColl = collection(firestore, 'users', effectiveUid, 'stockMovements');
      // Une écriture PAR VARIANTE : le libellé part dans son propre champ (quality / color /
      // size), comme le fait une vraie entrée en stock. Un produit multicouleur entré en bloc
      // n'afficherait aucune de ses couleurs, et la recrue ne verrait jamais le cas le plus
      // fréquent du magasin.
      const ecritures = lignesFormation.flatMap(l => l.variantes.map(v => () => cleanUndefined({
        articleId:            l.article.id,
        categoryId:           l.article.categoryId || null,
        productName:          l.nom,
        nameFR:               l.article.nameFR || null,
        color:                v.dimension === 'color' ? v.label : (libelleFixe(l.article.color) || null),
        size:                 v.dimension === 'size' ? v.label : (libelleFixe(l.article.size) || null),
        quality:              v.dimension === 'quality' ? v.label : (libelleFixe(l.article.quality) || null),
        // Unité du pôle quand il en impose une (TAFFETA FABRIC : m), comme le stock réel.
        unitOfMeasure:        uniteDeStock(poleDeLArticle(l.article, categories, generalCategories))
                              || l.article.unitOfMeasure || 'unité',
        type:                 'IN' as const,
        reason:               'INVENTAIRE' as const,
        storeId:              l.lieu === 'MAGASIN' ? magasin : entrepot,
        quantity:             v.quantite,
        date:                 aujourdhui,
        purchasePricePerUnit: l.prixUnitaire > 0 ? l.prixUnitaire : null,
        notes:                `STOCK DE FORMATION · ligne n°${l.rang} du devoir`
                              + (v.label ? ` · ${v.label}` : ''),
        createdAt:            serverTimestamp(),
      })));
      // Par lots, comme partout ailleurs : une écriture par ligne relancerait le calcul du stock
      // à chaque fois.
      for (let i = 0; i < ecritures.length; i += 450) {
        const batch = writeBatch(firestore);
        ecritures.slice(i, i + 450).forEach(faire => { batch.set(doc(movsColl), faire()); });
        await batch.commit();
      }

      logAudit(firestore, effectiveUid, {
        action: 'STOCK_IN',
        userId: user.uid,
        userEmail: user.email || '',
        entityType: 'stockMovement',
        entityId: 'stock-formation',
        description: `Stock de formation chargé · ${lignesFormation.length} référence(s), `
          + `${lignesFormation.reduce((somme, l) => somme + l.variantes.length, 0)} ligne(s) de stock, `
          + `${lignesFormation.reduce((somme, l) => somme + l.quantite, 0).toLocaleString('fr-MA')} unité(s)`,
        metadata: { references: lignesFormation.length, magasin, entrepot },
      });

      setFormationCharge(true);
      toast({
        title: 'Stock de formation chargé',
        description: `${lignesFormation.length} référence(s) en stock. Copiez la liste pour le corrigé du devoir.`,
      });
    } catch (e: any) {
      console.error('[formation] chargement impossible :', e);
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Chargement impossible.' });
    } finally {
      setFormationEnCours(false);
    }
  };

  const handleAddMovement = useCallback(async (movement: Omit<StockMovement, 'id' | 'createdAt'>) => {
    if (!user || !firestore) return;
    try {
      const effectiveUid = adminUid || user.uid;
      // Filet de sécurité : un pôle à unité fixée (TAFFETA FABRIC : m) impose la sienne à tout
      // mouvement, quel que soit l'écran qui l'a saisi.
      const articleDuMouvement = articles.find((a: any) => a.id === movement.articleId);
      const uniteDuPole = uniteDeStock(poleDeLArticle(
        articleDuMouvement || { categoryId: movement.categoryId }, categories, generalCategories,
      ));
      if (uniteDuPole) movement = { ...movement, unitOfMeasure: uniteDuPole };
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
    } catch (e: any) {
      console.error('[stock] addStockMovement:', e);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: e?.message || "Impossible d'enregistrer le mouvement.",
      });
    }
  }, [user, firestore, toast, adminUid, articles, categories, generalCategories]);

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
    // Copie de travail : deux lignes d'une même variante dans le même ticket doivent voir les
    // racks déjà entamés par la ligne précédente, sinon le même rack est vidé deux fois.
    const workingMovements: any[] = [...allMovements];
    for (const item of sale.items) {
      // Résoudre l'ID Firestore réel si l'item vient d'une variante explosée (couleur/taille/qualité)
      const stockItem = stockItems.find(s => s.articleId === item.articleId);
      const realArticleId = (stockItem as any)?._realArticleId || item.articleId;
      const base = {
        articleId: realArticleId, categoryId: item.categoryId,
        productName: item.productName, color: item.color || null, size: item.size || null,
        // La qualité, comme sur une facture : sans elle, une sortie de qualité éclatée ne serait
        // rattachée ni au stock ni aux racks de cette qualité.
        quality: item.quality || null,
        unitOfMeasure: item.unitOfMeasure, type: 'OUT' as const, reason: 'VENTE' as const,
        storeId,
        date: sale.date,
        notes: sale.clientName ? `Vente à ${sale.clientName}` : 'Vente directe',
        createdAt: serverTimestamp(),
      };
      // La caisse ne demande jamais l'emplacement : on décrémente automatiquement en FIFO
      // celui qui contient réellement la marchandise. Une ligne peut donc produire plusieurs
      // mouvements si le produit est éclaté sur plusieurs racks — ceux de sa variante seulement.
      for (const line of splitOutboundLines(workingMovements, storeId, realArticleId, item.qty, base, stockItemVariant(stockItem))) {
        batch.set(doc(collection(firestore, 'users', effectiveUid, 'stockMovements')), line);
        workingMovements.push(line);
      }
    }
    await batch.commit();
    toast({ title: 'Vente enregistrée !', description: `Total : ${(Number(sale.totalAmount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} — ${sale.items.length} produit(s)` });
  }, [user, firestore, toast, activeStore, adminUid, userRole, stores, stockItems, allMovements]);

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

    // La marchandise sort MAINTENANT. Une commande préparée ne bouge pas le stock — c'est ce qui
    // permet de la monter avant l'arrivée du client — donc c'est sa facturation qui doit écrire
    // les sorties. Sans cela le client était facturé et la marchandise restait en rayon.
    const lieuVente = order.storeId || ((activeStore === 'ALL' || activeStore === 'ALL_MAIN') ? mainStoreId : activeStore);
    const enCours: any[] = [...allMovements];
    for (const ligne of (order.items || []) as any[]) {
      const quantite = Number(ligne.qty) || 0;
      if (!ligne.articleId || quantite <= 0) continue;
      const base = cleanUndefined({
        articleId:     ligne.articleId,
        categoryId:    ligne.categoryId || null,
        productName:   ligne.nameFR || ligne.productName,
        nameFR:        ligne.nameFR || null,
        color:         ligne.color || null,
        size:          ligne.size || null,
        quality:       ligne.quality || null,
        unitOfMeasure: ligne.unitOfMeasure || 'unité',
        type:          'OUT' as const,
        reason:        'VENTE' as const,
        storeId:       lieuVente,
        date:          getLocalDateString(),
        notes:         `Commande ${order.id} facturée${order.clientName ? ` · ${order.clientName}` : ''}`,
        createdAt:     serverTimestamp(),
      });
      // Même règle qu'à la caisse : les racks se vident en FIFO, et seulement ceux de la variante
      // vendue. `_variant` n'est qu'une aide de calcul, splitOutboundLines ne l'écrit pas.
      const variante = ligne.quality ? { dimension: 'quality' as const, value: ligne.quality }
        : ligne.color ? { dimension: 'color' as const, value: ligne.color }
        : ligne.size ? { dimension: 'size' as const, value: ligne.size }
        : null;
      const lignesSortie = splitOutboundLines(enCours, lieuVente, ligne.articleId, quantite, base, variante);
      for (const sortie of lignesSortie) {
        batch.set(doc(collection(firestore, 'users', effectiveUid, 'stockMovements')), sortie);
      }
      enCours.push(...lignesSortie);
    }

    await batch.commit();
    logAudit(firestore, effectiveUid, {
      action: 'INVOICE_CREATED',
      userId: user.uid,
      userEmail: user.email || '',
      entityType: 'invoice',
      entityId: invRef.id,
      description: `Commande ${order.id} facturée${order.clientName ? ` à ${order.clientName}` : ''} · `
        + `${(order.items || []).length} ligne(s) · ${(Number(order.totalAfterDiscount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
      metadata: { orderId: order.id, storeId: lieuVente },
    });
    toast({
      title: 'Commande facturée',
      description: 'La facture est créée et la marchandise est sortie du stock.',
    });
    setActiveView('invoices');
  }, [user, firestore, toast, activeStore, adminUid, stores, allMovements]);

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
      // Copie de travail des mouvements : les lignes déjà générées pour cette facture y sont
      // ajoutées au fur et à mesure. Sans elle, chaque sortie serait adressée sur le stock d'avant
      // la facture, et deux sorties d'une même variante (sous-ligne + « Dépassement stock », ou
      // deux lignes du même produit) prendraient deux fois dans le même rack et le rendraient négatif.
      const workingMovements: any[] = [...allMovements];
      for (const m of movementsOut) {
        const movStore = m.storeId || storeId;
        // _variant est un champ d'aide du flux de vente (couleur / qualité / taille de la ligne de
        // stock) : il choisit les racks, et on le retire ici pour qu'il ne soit jamais écrit.
        const { quantity, _variant, ...rest } = m;
        const base = { ...cleanUndefined(rest), storeId: movStore, createdAt: serverTimestamp() };
        // Facturation : même règle qu'à la caisse, l'emplacement est résolu tout seul en FIFO.
        const lines = splitOutboundLines(workingMovements, movStore, m.articleId, quantity, base, _variant);
        for (const line of lines) {
          batch.set(doc(collection(firestore, 'users', effectiveUid, 'stockMovements')), line);
        }
        workingMovements.push(...lines);
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
  }, [user, firestore, toast, activeStore, adminUid, userRole, saleStoreId, stores, allMovements]);

  const handleUpdateInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', id), { status });
  }, [user, firestore, adminUid]);

  // ── Retours clients (SAV) ────────────────────────────────────────────────
  const handleProcessReturn = useCallback(async (
    invoice: Invoice,
    returnLines: { articleId: string; categoryId: string; productName: string; nameFR?: string; color?: string; size?: string; quality?: string; unitOfMeasure: string; qty: number; unitPrice: number }[]
  ) => {
    if (!user || !firestore) return;
    const effectiveUid = adminUid || user.uid;
    const validLines = returnLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;

    // Variante du produit retourné (couleur, qualité ou taille d'un article éclaté) : la ligne
    // porte l'articleId réel et les libellés vendus, la ventilation de l'article dit lequel
    // compte. L'écran de retour ne transmet pas la qualité : on la reprend de la facture quand
    // une seule qualité de ce produit y figure. `undefined` = article éclaté, variante inconnue.
    const returnVariant = (line: typeof validLines[number]): StockVariant | null | undefined => {
      const dimension = articleVariantDimension(articles.find((a: any) => a.id === line.articleId));
      if (!dimension) return null;
      let value = String(line[dimension] || '').trim();
      if (!value && dimension === 'quality') {
        const sold = (invoice.items || []).filter(it =>
          it.articleId === line.articleId && normalizeVariantValue(it.quality) &&
          normalizeVariantValue(it.color) === normalizeVariantValue(line.color) &&
          normalizeVariantValue(it.size) === normalizeVariantValue(line.size)
        );
        if (new Set(sold.map(it => normalizeVariantValue(it.quality))).size === 1) value = String(sold[0].quality).trim();
      }
      return value ? { dimension, value } : undefined;
    };

    const returnValue = validLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const today = getLocalDateString();

    try {
      const batch = writeBatch(firestore);

      for (const line of validLines) {
        const mRef = doc(collection(firestore, 'users', effectiveUid, 'stockMovements'));
        const returnStore = invoice.storeId || 'CHRIFA';
        // Un retour repart là où le produit est déjà rangé — sans rien demander au vendeur.
        // S'il est éclaté sur plusieurs racks, on ne devine pas et le retour reste non adressé.
        // Pour un article éclaté, seuls les racks de SA variante comptent ; si on ne sait pas
        // laquelle revient, le retour reste non adressé plutôt que rangé chez une autre couleur.
        const variant = returnVariant(line);
        const back = variant === undefined ? null : suggestInboundLocation(allMovements, returnStore, line.articleId, variant);
        batch.set(mRef, cleanUndefined({
          articleId: line.articleId,
          categoryId: line.categoryId,
          productName: line.productName,
          nameFR: line.nameFR || null,
          color: line.color || null,
          size: line.size || null,
          // Sans la qualité, le retour d'une qualité éclatée n'était crédité à aucune d'elles.
          quality: (variant?.dimension === 'quality' ? variant.value : line.quality) || null,
          unitOfMeasure: line.unitOfMeasure,
          type: 'IN',
          reason: 'RETOUR',
          storeId: returnStore,
          locationCode: back?.locationCode,
          locationId: back?.locationId,
          quantity: line.qty,
          date: today,
          notes: `Retour client sur facture ${invoice.invoiceNumber || invoice.id}${invoice.clientName ? ` (${invoice.clientName})` : ''}`,
          factureId: invoice.id,
          createdAt: serverTimestamp(),
        }));
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
  }, [user, firestore, adminUid, toast, allMovements, articles]);

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
  // Un effet (chèque, LC, traite) court-il encore sur cette facture ? On regarde TOUS les
  // règlements qui la visent, celui qu'on est en train de modifier étant pris avec son NOUVEAU
  // statut. C'est ce qui départage « payée » et « en attente », et c'est ce calcul qui manquait :
  // un chèque encaissé laissait la facture éternellement « en attente ».
  const effetEnCoursSurFacture = useCallback((invoiceId: string, paiementId?: string, nouveauStatut?: string) => {
    return (payments as any[]).some((p: any) => {
      if (!imputationsDuPaiement(p).some(l => l.invoiceId === invoiceId)) return false;
      const statut = (paiementId && p.id === paiementId) ? nouveauStatut : p.status;
      return effetEnAttente({ ...p, status: statut });
    });
  }, [payments]);

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

    // Les montants sont agrégés PAR FACTURE avant d'écrire. Chaque ligne de règlement partait
    // auparavant du solde d'avant et écrasait la précédente dans le même lot : sur 6 000 espèces
    // + 4 000 chèque pour une facture de 10 000, la facture finissait à 4 000 payés et le client
    // était relancé pour de l'argent déjà versé. Et le statut n'est plus celui que l'écran
    // appelant a choisi — c'est toujours statutFacture qui tranche, pour les trois écrans.
    const cumulNouveaux = agregerParFacture(paymentList);
    const aMettreAJour = new Map<string, { paidAmount: number; effetEnCours: boolean }>();

    if (invoiceUpdates && invoiceUpdates.length > 0) {
      for (const upd of invoiceUpdates) {
        aMettreAJour.set(upd.invoiceId, {
          paidAmount: centimes(upd.paidAmount),
          effetEnCours: cumulNouveaux.get(upd.invoiceId)?.effetEnCours || false,
        });
      }
    } else {
      for (const [invoiceId, cumul] of cumulNouveaux) {
        const inv = invoices.find(i => i.id === invoiceId);
        if (!inv) continue;
        aMettreAJour.set(invoiceId, {
          paidAmount: centimes((inv.paidAmount || 0) + cumul.montant),
          effetEnCours: cumul.effetEnCours,
        });
      }
    }

    for (const [invoiceId, { paidAmount, effetEnCours }] of aMettreAJour) {
      const inv = invoices.find(i => i.id === invoiceId);
      if (!inv) continue;
      const total = centimes(inv.totalAfterDiscount);
      const enAttente = effetEnCours || effetEnCoursSurFacture(invoiceId);
      batch.update(doc(firestore, 'users', effectiveUid, 'invoices', invoiceId), {
        paidAmount,
        remainingBalance: Math.max(0, centimes(total - paidAmount)),
        status: statutFacture(total, paidAmount, enAttente) as InvoiceStatus,
      });
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
  }, [user, firestore, adminUid, invoices, toast, effetEnCoursSurFacture]);

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

    // Un règlement peut solder PLUSIEURS factures (règlement global) : on suit ses imputations
    // réelles, et non le seul invoiceId du premier rang. Rattacher un chèque de 9 000 à la facture
    // « de même rang » faisait disparaître la dette des autres au moment du rejet.
    // Au signe près, rejet et remise en circulation sont la même opération ; l'encaissement, lui,
    // ne change aucun montant (il était déjà compté à la remise) mais fait passer la facture de
    // « en attente » à « payée » — ce que personne ne faisait.
    const sens = (status === 'REJECTED' && prevStatus !== 'REJECTED') ? -1
      : (prevStatus === 'REJECTED' && (status === 'CLEARED' || status === 'PENDING')) ? 1
      : 0;
    for (const ligne of imputationsDuPaiement(payment)) {
      const invoice = invoices.find((inv: any) => inv.id === ligne.invoiceId);
      if (!invoice) continue;
      const total = centimes(invoice.totalAfterDiscount);
      const paye = Math.max(0, Math.min(total, centimes((invoice.paidAmount || 0) + sens * ligne.amount)));
      await updateDoc(doc(firestore, 'users', effectiveUid, 'invoices', ligne.invoiceId), {
        paidAmount: paye,
        remainingBalance: Math.max(0, centimes(total - paye)),
        status: statutFacture(total, paye, effetEnCoursSurFacture(ligne.invoiceId, paymentId, status)) as InvoiceStatus,
      });
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
  }, [user, firestore, adminUid, toast, payments, invoices, effetEnCoursSurFacture]);

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

    // Un effet déjà affecté à une AUTRE société, déjà remis, ou rejeté, n'entre pas dans ce
    // bordereau : la mise à jour plus bas force cashingCompany sur chaque effet retenu, et
    // déposerait donc l'argent d'une société sur le compte de l'autre.
    const refus = targetPayments.filter(p =>
      (p.cashingCompany && p.cashingCompany !== company)
      || p.remittanceId
      || String(p.status || '').toUpperCase() === 'REJECTED');
    if (refus.length > 0) {
      const detail = refus.slice(0, 3).map(p => `n°${p.checkNumber || '—'}`).join(', ');
      toast({
        variant: 'destructive',
        title: 'Remise refusée',
        description: `${refus.length} effet(s) ne peuvent pas figurer sur ce bordereau (${detail}${refus.length > 3 ? '…' : ''}) : `
          + `déjà affectés à une autre société, déjà remis, ou impayés. Retirez-les de la sélection.`,
      });
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

    // Unité d'achat : celle du pôle quand il en impose une (TAFFETA FABRIC : m), quelle que soit
    // l'unité restée dans le formulaire. L'article, son entrée en stock et la dépense la portent.
    const poleAchat = poleDeLArticle(
      { categoryId: exp.categoryId, generalCategoryId: exp.generalCategoryId },
      categories, generalCategories,
    );
    const uniteAchatImposee = uniteImposee(poleAchat, 'achat');
    const uniteAchat = uniteAchatImposee || exp.unitOfMeasure || 'pcs';
    if (uniteAchatImposee) exp = { ...exp, unitOfMeasure: uniteAchatImposee };

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
        unitOfMeasure: uniteAchat,
        purchasePricePerUnit: unitPrice,
        stockEntryDate: exp.date || new Date().toISOString().split('T')[0],
        supplierId: exp.supplierName || 'Marché local',
        quantity: 0,
        initialQtyByStore: { [targetStore]: 0 },
        // Marque explicite : cet article vient d'un achat marché local (/stock), jamais d'un
        // arrivage import. Permet de l'exclure de manière fiable de /gestion et du reset,
        // sans dépendre d'une heuristique sur supplierId/factureId.
        isLocalMarketPurchase: true,
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
        unitOfMeasure: uniteAchat,
        purchasePricePerUnit: unitPrice,
        storeId: targetStore,
        // Emplacement choisi dans le formulaire de dépense ; à défaut, celui où l'article se
        // trouve déjà s'il n'y en a qu'un.
        ...(() => {
          const picked = (exp as any).locationCode
            ? { locationCode: (exp as any).locationCode, locationId: (exp as any).locationId }
            : suggestInboundLocation(allMovements, targetStore, createdArticleId || (exp as any).articleId || '');
          return picked ? { locationCode: picked.locationCode, locationId: picked.locationId } : {};
        })(),
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
        description: `${exp.quantity} ${uniteAchat} de "${exp.articleName}" ajoutés au stock (${targetStoreName}) et dépense enregistrée.`,
      });
    } else {
      toast({
        title: 'Dépense enregistrée',
        description: `${(Number(exp.amount) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
      });
    }
  }, [user, firestore, adminUid, effectiveSaleStoreId, stores, categories, generalCategories, toast]);

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
    { id: 'orders',    label: 'Commandes préparées', category: 'commerce', icon: ClipboardList, badge: commandesEnAttente || undefined, pointOfSaleOnly: true },
    { id: 'invoices',  label: 'Factures',       category: 'commerce', icon: FileText,        badge: openInvoices, pointOfSaleOnly: true },
    { id: 'cheques-impayes', label: 'Chèques / Impayés', category: 'commerce', icon: CreditCard, badge: rejectedChequesCount > 0 ? rejectedChequesCount : undefined, color: 'rose', pointOfSaleOnly: true },
    { id: 'expenses',  label: 'Frais & Dépenses', category: 'commerce', icon: Receipt,        color: 'amber', pointOfSaleOnly: true },

    { id: 'stock',     label: 'En Stock',      category: 'logistique', icon: Package,         color: 'emerald' },
    { id: 'warehouses', label: 'Entrepôts',    category: 'logistique', icon: Warehouse,       adminOrMainOnly: true, color: 'blue' },
    { id: 'locations', label: 'Emplacements',  category: 'logistique', icon: MapPin,          adminOrMainOnly: true, color: 'blue' },
    // Ouvert à tous les magasins : les dossiers se consultent (quantités seules) partout,
    // seule la validation d'entrée reste réservée à CHRIFA (cf. carte d'arrivage).
    { id: 'import-requests', label: "Demandes d'import", category: 'logistique', icon: Send, color: 'amber', commercialOnly: true },
    { id: 'arrivals',  label: 'Arrivages',     category: 'logistique', icon: Anchor,          badge: pendingArrivals, color: 'amber' },
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
      // Transferts : l'onglet était masqué à l'ADMIN — c'est-à-dire au SEUL profil que les règles
      // Firestore autorisent à écrire les deux mouvements d'un transfert. Un compte magasin peut
      // écrire la sortie de chez lui mais pas l'entrée chez l'autre, et le lot étant atomique, sa
      // tentative n'écrivait rien du tout : la marchandise partait avec son bon, les deux stocks
      // restaient inchangés. Tant que les règles ne sont pas élargies, c'est l'admin qui valide.
      // (Arrivages reste visible pour l'admin, avec un contenu différent : la réconciliation.)
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


  const CATEGORY_META: Record<string, { label: string; icon: any }> = {
    dashboard: { label: 'Aperçu', icon: LayoutDashboard },
    commerce: { label: 'Commerce', icon: ShoppingCart },
    logistique: { label: 'Logistique', icon: Package },
    finance: { label: 'Finance', icon: Landmark },
    settings: { label: 'Système', icon: Settings },
  };
  const CATEGORY_ORDER = ['dashboard', 'commerce', 'logistique', 'finance', 'settings'];

  return (
    <ConfirmProvider>
    <div className="min-h-screen flex flex-col bg-[#F7F3EA] font-sans">

      {!isOnline && (
        <div className="sticky top-0 z-[70] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider shadow-md">
          <WifiOff className="w-4 h-4" />
          Connexion perdue — les actions en cours ne seront pas enregistrées tant que le réseau n'est pas revenu
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 bg-[#1E1B15] flex flex-col sticky top-0 h-screen overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
            <div className="w-8 h-8 rounded-[10px] bg-[#CC8626] flex items-center justify-center shrink-0">
              <Boxes className="w-[18px] h-[18px] text-[#1E1B15]" />
            </div>
            <div className="min-w-0">
              <p className="text-[14.5px] font-black text-[#E9E2D3] tracking-tight leading-none truncate">Stock<span className="text-[#CC8626]">Manager</span></p>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-[9.5px] font-bold text-[#9C927C] uppercase tracking-wider">Live</span>
                {isReadOnly && (
                  <>
                    <span className="text-[#4A4535]">·</span>
                    <Lock className="w-2.5 h-2.5 text-blue-400" />
                    <span className="text-[9.5px] font-bold text-blue-400 uppercase tracking-wider">Lecture seule</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 mb-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 h-9 px-2.5 bg-[#2A251C] hover:bg-[#332E23] rounded-xl text-[#9C927C] transition-colors"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium flex-1 text-left">Rechercher...</span>
              <span className="text-[11px] font-black bg-[#1E1B15] rounded px-1.5 py-0.5 shrink-0">Ctrl K</span>
            </button>
          </div>

          {/* Sélecteur de magasin */}
          <div className="px-3 mb-3">
            {userRole === 'ADMIN' ? (
              <Select value={activeStore} onValueChange={(val) => setActiveStore(val as any)}>
                <SelectTrigger className="h-9 bg-[#2A251C] hover:bg-[#332E23] border border-[#332E23] text-[12.5px] font-bold text-[#E9E2D3] rounded-xl px-2.5 transition-colors">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <StoreIcon className="w-3.5 h-3.5 text-[#CC8626] shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL"><Globe className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Vue Globale (Entrepôts)</SelectItem>
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
            ) : (
              <div className="h-9 bg-[#2A251C] border border-[#332E23] text-[12.5px] font-bold text-[#E9E2D3] rounded-xl px-2.5 flex items-center gap-2">
                <StoreIcon className="w-3.5 h-3.5 text-[#CC8626] shrink-0" />
                <span className="truncate">{stores.find(s => s.id === userStoreId)?.name || userStoreId || 'Principal'}</span>
              </div>
            )}
          </div>

          {/* Nav */}
          <div className="flex-1 px-3 overflow-y-auto">
            {isWarehouse ? (
              <>
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-2.5 py-2 rounded-xl mb-3">
                  <Warehouse className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-[11px] font-black text-blue-200 uppercase tracking-tight truncate">{currentStore?.name || 'Entrepôt'}</span>
                </div>
                {[
                  { id: 'stock', label: 'Stock par Groupes', icon: Package },
                  { id: 'movements', label: 'Mouvements', icon: ArrowLeftRight },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveView(tab.id as StockView)}
                    className={`w-full flex items-center gap-2.5 h-[38px] px-3 rounded-xl text-[13px] font-semibold mb-1 transition-colors ${
                      activeView === tab.id ? 'bg-[#2A251C] text-[#E9E2D3]' : 'text-[#9C927C] hover:text-[#E9E2D3]'
                    }`}>
                    <tab.icon className={`w-[17px] h-[17px] shrink-0 ${activeView === tab.id ? 'text-[#CC8626]' : ''}`} />
                    {tab.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (userRole === 'ADMIN') { setActiveStore('ALL'); setActiveView('dashboard'); }
                    else { setActiveStore('CHRIFA'); setActiveView('stock'); }
                  }}
                  className="w-full flex items-center gap-2.5 h-[38px] px-3 rounded-xl text-[12px] font-bold text-[#9C927C] hover:text-[#E9E2D3] hover:bg-[#2A251C] mt-2 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  {userRole === 'ADMIN' ? 'Quitter l\'entrepôt' : 'Retour magasin CHRIFA'}
                </button>
              </>
            ) : (
              CATEGORY_ORDER.map(catId => {
                const catItems = navItems.filter(n => n.category === catId);
                if (catItems.length === 0) return null;
                const meta = CATEGORY_META[catId];
                return (
                  <div key={catId} className="mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#9C927C] opacity-60 px-3 mt-3.5 mb-1">{meta.label}</p>
                    {catItems.map(({ id, label, icon: Icon, badge, color }) => (
                      <button key={id} onClick={() => setActiveView(id as StockView)}
                        className={`w-full flex items-center gap-2.5 h-[36px] px-3 rounded-xl text-[12.5px] font-semibold mb-0.5 transition-colors ${
                          activeView === id ? 'bg-[#2A251C] text-[#E9E2D3]' : 'text-[#9C927C] hover:text-[#E9E2D3]'
                        }`}>
                        <Icon className={`w-[17px] h-[17px] shrink-0 ${activeView === id ? 'text-[#CC8626]' : ''}`} />
                        <span className="flex-1 text-left truncate">{label}</span>
                        {badge != null && badge > 0 && (
                          <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center shrink-0 ${
                            id === 'alerts' || id === 'cheques-impayes' ? 'bg-red-500' : id === 'invoices' ? 'bg-orange-500' : id === 'treasury' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}>{badge > 99 ? '99+' : badge}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Actions bas de sidebar */}
          <div className="px-3 py-3 border-t border-[#332E23] mt-2 space-y-1">
            <a href="/" className="flex items-center gap-2.5 h-[34px] px-3 rounded-xl text-[11.5px] font-bold text-[#9C927C] hover:text-[#E9E2D3] hover:bg-[#2A251C] transition-colors">
              <ChevronLeft className="w-4 h-4 shrink-0" /> StockVue
            </a>
            {userRole === 'ADMIN' && (
              <button onClick={() => { setFormationCharge(false); setFormationOpen(true); }}
                title="Charger un stock d'entraînement sur de vrais produits, pour former quelqu'un"
                className="w-full flex items-center gap-2.5 h-[34px] px-3 rounded-xl text-[11.5px] font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
                <GraduationCap className="w-3.5 h-3.5 shrink-0" /> Stock de formation
              </button>
            )}
            {userRole === 'ADMIN' && (
              <button onClick={() => setResetConfirmOpen(true)}
                title="Remettre le stock à 0 pour démarrer une nouvelle simulation"
                className="w-full flex items-center gap-2.5 h-[34px] px-3 rounded-xl text-[11.5px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
                <RotateCcw className="w-3.5 h-3.5 shrink-0" /> Reset Stock (0)
              </button>
            )}
            <button onClick={handleBackup}
              title="Télécharger une sauvegarde complète de toutes vos données"
              className="w-full flex items-center gap-2.5 h-[34px] px-3 rounded-xl text-[11.5px] font-bold text-[#9C927C] hover:text-[#E9E2D3] hover:bg-[#2A251C] transition-colors">
              <Download className="w-3.5 h-3.5 shrink-0" /> Backup
            </button>
            <button onClick={() => signOut(auth)}
              className="w-full flex items-center gap-2.5 h-[34px] px-3 rounded-xl text-[11.5px] font-bold text-[#9C927C] hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-3.5 h-3.5 shrink-0" /> Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0 flex flex-col">
      <main className="flex-grow max-w-[1600px] mx-auto px-4 sm:px-8 py-6 w-full">
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
                locations={storageLocations}
                onAddExpense={handleAddExpense}
                onUpdateExpenseStatus={handleUpdateExpenseStatus}
                onDeleteExpense={handleDeleteExpense}
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
              <StockMovements activeStore={activeStore} movements={filteredMovements} stockItems={stockItems} categories={categories} generalCategories={generalCategories} articles={articles} stores={stores} locations={storageLocations} onAddMovement={handleAddMovement} readOnly={userRole === 'ADMIN'} />
            )}
            {activeView === 'inventory' && (
              <BlindInventory
                stockItems={stockItems}
                categories={categories}
                generalCategories={generalCategories}
                activeStore={activeStore}
                stores={stores}
                movements={allMovements}
                adminUid={adminUid}
                onAddMovement={handleAddMovement}
                onFinalizeSession={handleFinalizeInventorySession}
              />
            )}
            {activeView === 'alerts' && (
              <StockAlerts stockItems={stockItems} articles={articles} categories={categories} movements={filteredMovements} stores={stores} locations={storageLocations} activeStore={activeStore} onNavigate={setActiveView} adminUid={adminUid} onAddMovement={handleAddMovement} readOnly={userRole === 'ADMIN'} />
            )}
            {activeView === 'audit' && (
              <AuditLogView entries={auditLogEntries} />
            )}
            {activeView === 'transfers' && (
              <TransferOrdersView
                transferOrders={filteredTransfers}
                stockItems={stockItems}
                stores={stores}
                categories={categories}
                generalCategories={generalCategories}
                movements={allMovements}
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
            {activeView === 'import-requests' && userRole !== 'ADMIN' && (
              <StoreImportRequestsView
                articles={articles}
                factures={factures}
                categories={categories}
                generalCategories={generalCategories}
                stores={stores}
                adminUid={adminUid}
                storeId={userStoreId}
                seesAllStores={false}
                readOnly={isReadOnly}
              />
            )}
            {activeView === 'locations' && isChrifaOrAdmin && (
              <WarehouseLocationsView
                stores={stores}
                locations={storageLocations}
                movements={allMovements}
                articles={articles}
                adminUid={adminUid}
                readOnly={isReadOnly}
              />
            )}
            {activeView === 'stores' && userRole === 'ADMIN' && (
              <StoresView stores={stores} adminUid={adminUid} />
            )}
            {activeView === 'arrivals' && userRole !== 'ADMIN' && (() => {
              const tenDaysAgo = new Date();
              tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
              const tenDaysAgoStr = toLocalDateStr(tenDaysAgo);

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
                        <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Logistique Import</p>
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
                          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Entrés en stock (≤ 10j)</p>
                          <p className="text-2xl font-black text-emerald-400 mt-0.5">{arrivalsStats.entered10D}</p>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 cursor-pointer hover:bg-amber-500/20 transition-all" onClick={() => setArrivalFilter('PENDING')}>
                          <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">En attente d'entrée</p>
                          <p className="text-2xl font-black text-amber-400 mt-0.5">{arrivalsStats.pending}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">Total Références</p>
                          <p className="text-2xl font-black text-white mt-0.5">{totalRefsFiltered}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">Total Pièces</p>
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
                                  <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{f.supplierId || f.supplier || 'Fournisseur'}</p>
                                  <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mt-0.5">{f.id}</h3>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {isEnteredInStock ? (
                                    <>
                                      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-[11px] font-black uppercase px-2.5 py-1 rounded-full">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> En stock
                                      </span>
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                        <Clock className="w-2.5 h-2.5 text-emerald-600" />
                                        {formatDaysAgo(stockEntryDate)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-[11px] font-black uppercase px-2.5 py-1 rounded-full">
                                      <Anchor className="w-3.5 h-3.5 text-amber-600" /> En attente de stock
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center mt-4">
                                <div className="bg-stone-50 rounded-xl p-2.5">
                                  <p className="text-[11px] font-black text-stone-400 uppercase">Arrivée</p>
                                  <p className="text-[10px] font-black text-stone-700 mt-0.5">{f.arrivalDate || '—'}</p>
                                </div>
                                <div className={`rounded-xl p-2.5 ${isEnteredInStock ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                  <p className={`text-[11px] font-black uppercase ${isEnteredInStock ? 'text-emerald-600' : 'text-amber-600'}`}>Entrée Stock</p>
                                  <p className={`text-[10px] font-black mt-0.5 ${isEnteredInStock ? 'text-emerald-800' : 'text-amber-800'}`}>
                                    {stockEntryDate || 'En attente'}
                                  </p>
                                </div>
                                <div className="bg-stone-50 rounded-xl p-2.5">
                                  <p className="text-[11px] font-black text-stone-400 uppercase">Articles</p>
                                  <p className="text-[10px] font-black text-stone-900 mt-0.5">
                                    {artCount} réf. ({(Number(totalQty) || 0).toLocaleString()} pcs)
                                  </p>
                                </div>
                              </div>

                              {/* Aperçu des articles — cliquable : ouvre la fiche dossier complète */}
                              {factureArts.length > 0 && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setDossierViewId(f.id)}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDossierViewId(f.id); } }}
                                  className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 cursor-pointer rounded-lg -mx-1 px-1 hover:bg-stone-50/80 transition-colors"
                                >
                                  <p className="text-[11px] font-black text-stone-400 uppercase tracking-wider">Aperçu articles :</p>
                                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                    {factureArts.slice(0, 4).map((a: any) => (
                                      <div key={a.id} className="flex items-center justify-between text-[10px] bg-stone-50 px-2 py-1 rounded-lg">
                                        <span className="font-bold text-stone-700 truncate max-w-[170px]">{a.productName || a.nameFR}</span>
                                        <span className="font-black text-emerald-700 whitespace-nowrap">{a.quantity} {a.unitOfMeasure || 'pcs'}</span>
                                      </div>
                                    ))}
                                    {factureArts.length > 4 && (
                                      <p className="text-[11px] font-bold text-stone-400 text-center">+ {factureArts.length - 4} autre(s) article(s)</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="pt-2 space-y-2">
                              <button
                                onClick={() => setDossierViewId(f.id)}
                                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-800 border-2 border-stone-200 hover:border-stone-400 font-black uppercase text-[11px] tracking-widest px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Voir le dossier
                              </button>
                              {/* Aucun magasin ne valide une entrée en stock : c'est l'admin qui la
                                  finalise (entrepôts, coûts, emplacements) depuis son panneau Arrivages.
                                  Les magasins consultent le dossier et suivent sa réception. */}
                              {!isEnteredInStock ? (
                                <div className="w-full flex items-center justify-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 font-black uppercase text-[11px] tracking-widest px-3 py-2.5 rounded-xl select-none">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>En attente de réception</span>
                                </div>
                              ) : (
                                <div className="w-full flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-black uppercase text-[11px] tracking-widest px-3 py-2.5 rounded-xl select-none">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Entrée validée {stockEntryDate ? `(${stockEntryDate})` : (isArrivalOlderThanOneMonth(f.arrivalDate) ? '(Historique)' : '')}</span>
                                  <span className="text-[11px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded font-black flex items-center gap-1 ml-1">
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
            {activeView === 'arrivals' && userRole === 'ADMIN' && (() => {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const sevenDaysAgoStr = toLocalDateStr(sevenDaysAgo);
              const sevenDaysAgoTs = sevenDaysAgo.getTime();

              // Un dossier est "récent" si la date d'entrée a été SAISIE dans les 7 derniers jours
              // — pas forcément si la date saisie elle-même est récente. Typiquement on régularise
              // aujourd'hui un arrivage entré en stock il y a trois semaines : il doit apparaître.
              //  1. la date saisie tombe dans les 7 derniers jours ;
              //  2. stockEntryDateSetAt (horodatage de la saisie) tombe dans les 7 derniers jours ;
              //  3. repli pour les dossiers antérieurs à ce champ : updatedAt, écrit à chaque
              //     enregistrement du dossier depuis /gestion.
              const isRecentlyEntered = (f: any) => {
                if (!f.stockEntryDate) return false;
                if (f.stockEntryDate >= sevenDaysAgoStr) return true;
                const setAt = toDateSafe(f.stockEntryDateSetAt);
                if (setAt) return setAt.getTime() >= sevenDaysAgoTs;
                const updatedAt = toDateSafe(f.updatedAt);
                return updatedAt ? updatedAt.getTime() >= sevenDaysAgoTs : false;
              };

              // Articles et mouvements d'entrée indexés par dossier : sans ça chaque ligne
              // affichée reparcourt la totalité des mouvements.
              const artsParFacture = new Map<string, any[]>();
              for (const a of articles as any[]) {
                for (const cle of new Set([a.factureId, a.facture].filter(Boolean).map(String))) {
                  const liste = artsParFacture.get(cle);
                  if (liste) liste.push(a); else artsParFacture.set(cle, [a]);
                }
              }
              const entreesParFacture = new Map<string, any[]>();
              for (const m of allMovements as any[]) {
                if (m.type !== 'IN') continue;
                for (const cle of new Set([m.factureId, m.factureRef].filter(Boolean).map(String))) {
                  const liste = entreesParFacture.get(cle);
                  if (liste) liste.push(m); else entreesParFacture.set(cle, [m]);
                }
              }

              const recentDated = factures
                .map((f: any) => {
                  // Un dossier compte comme « entré » dès qu'il porte une date OU qu'un mouvement
                  // d'arrivage existe : une première validation coupée en cours d'écriture laisse
                  // des mouvements sans date sur la facture, et ce dossier-là doit être réparable.
                  const entreeCommencee = Boolean(f.stockEntryDate) || (entreesParFacture.get(f.id) || []).length > 0;
                  return {
                    f,
                    entreeCommencee,
                    // Ligne par ligne : un dossier à moitié entré doit rester réparable, pas
                    // seulement un dossier sans aucun mouvement.
                    lignesAbsentes: entreeCommencee
                      ? lignesEntreeManquantes(artsParFacture.get(f.id) || [], entreesParFacture.get(f.id) || [])
                      : 0,
                  };
                })
                // Une entrée incomplète reste réparable quelle que soit son ancienneté : sinon le
                // bouton « Compléter l'Entrée » est hors de portée pour les vieux dossiers ratés.
                .filter(({ f, entreeCommencee, lignesAbsentes }: any) => arrivalsShowAll
                  ? entreeCommencee
                  : (isRecentlyEntered(f) || (entreeCommencee && lignesAbsentes > 0)))
                .map(({ f, lignesAbsentes }: any) => {
                  const factureArts = artsParFacture.get(f.id) || [];
                  const hasRealMovements = lignesAbsentes === 0;
                  const setAt = toDateSafe(f.stockEntryDateSetAt) || toDateSafe(f.updatedAt);
                  const setAtStr = setAt ? toLocalDateStr(setAt) : null;
                  return {
                    f,
                    factureArts,
                    artCount: factureArts.length,
                    totalQty: factureArts.reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0),
                    hasRealMovements,
                    lignesAbsentes,
                    // Affiché seulement quand la saisie est postérieure à la date d'entrée déclarée
                    // (régularisation) — sinon l'info est redondante.
                    backdatedSetAt: setAtStr && setAtStr !== f.stockEntryDate ? setAtStr : null,
                    // Tri sur la saisie la plus récente des deux, pour qu'un arrivage régularisé
                    // aujourd'hui avec une vieille date reste en haut de liste.
                    sortKey: setAtStr && setAtStr > (f.stockEntryDate || '') ? setAtStr : (f.stockEntryDate || ''),
                  };
                })
                .sort((a, b) => (a.hasRealMovements === b.hasRealMovements)
                  ? b.sortKey.localeCompare(a.sortKey)
                  : (a.hasRealMovements ? 1 : -1));

              const missingCount = recentDated.filter(item => !item.hasRealMovements).length;

              return (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                      <div>
                        <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Réconciliation</p>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                          Entrées en <span className="text-emerald-500">Stock</span>
                        </h2>
                        <p className="text-stone-400 text-xs mt-2 max-w-lg">
                          Dossiers dont la date d'entrée en stock a été saisie au cours des 7 derniers jours,
                          <span className="text-stone-300"> plus tous ceux dont l'entrée est incomplète</span>, quelle
                          que soit leur ancienneté. Complétez l'entrepôt et les valeurs pour créer les mouvements
                          manquants. « Afficher tout » liste aussi les dossiers entrés plus anciens, pour les corriger
                          ou les dévalider.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setArrivalsShowAll(v => !v)}
                          className={`border rounded-2xl px-5 py-3 text-left transition-colors cursor-pointer ${arrivalsShowAll ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >
                          <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">
                            {arrivalsShowAll ? 'Tous les dossiers entrés' : 'Récents et incomplets'}
                          </p>
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">
                            {arrivalsShowAll ? 'Revenir aux récents' : 'Afficher tout'}
                          </p>
                        </button>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">Dossiers listés</p>
                          <p className="text-2xl font-black text-white mt-0.5">{recentDated.length}</p>
                        </div>
                        <div className={`border rounded-2xl px-5 py-3 ${missingCount > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                          <p className={`text-[11px] font-black uppercase tracking-widest ${missingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>À compléter</p>
                          <p className={`text-2xl font-black mt-0.5 ${missingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{missingCount}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {recentDated.length === 0 ? (
                    <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                      <Anchor className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                      <p className="text-stone-600 font-black uppercase text-xs tracking-widest">Rien à réconcilier</p>
                      <p className="text-stone-400 text-[11px] font-medium mt-1">
                        {arrivalsShowAll
                          ? "Aucun dossier n'est entré en stock."
                          : "Aucune entrée en stock saisie ces 7 derniers jours, et aucune entrée incomplète."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {recentDated.map(({ f, artCount, totalQty, hasRealMovements, lignesAbsentes, backdatedSetAt }) => (
                        <div
                          key={f.id}
                          className={`bg-white rounded-2xl border-2 p-5 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all ${
                            hasRealMovements ? 'border-emerald-200' : 'border-amber-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{f.supplierId || f.supplier || 'Fournisseur'}</p>
                                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mt-0.5">{f.id}</h3>
                              </div>
                              {hasRealMovements ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-1 rounded-full whitespace-nowrap">
                                  <CheckCircle2 className="w-3 h-3" /> Mouvements créés
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2 py-1 rounded-full whitespace-nowrap">
                                  <AlertTriangle className="w-3 h-3" /> À compléter
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center mt-3">
                              <div className="bg-stone-50 rounded-xl p-2.5">
                                <p className="text-[10px] font-black text-stone-400 uppercase">Entrée Stock</p>
                                <p className="text-[10px] font-black text-stone-700 mt-0.5">{f.stockEntryDate || 'non enregistrée'}</p>
                                {backdatedSetAt && (
                                  <p className="text-[9px] font-bold text-stone-400 mt-0.5">saisie le {backdatedSetAt}</p>
                                )}
                              </div>
                              <div className="bg-stone-50 rounded-xl p-2.5">
                                <p className="text-[10px] font-black text-stone-400 uppercase">Articles</p>
                                <p className="text-[10px] font-black text-stone-900 mt-0.5">{artCount} réf. ({(Number(totalQty) || 0).toLocaleString()} pcs)</p>
                              </div>
                            </div>
                            {!hasRealMovements && (
                              <p className="text-[10px] font-black text-amber-700 uppercase tracking-wide mt-2 text-center">
                                {lignesAbsentes} ligne{lignesAbsentes > 1 ? 's' : ''} sans mouvement d'entrée
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => { setPassToStockId(f.id); setPassToStockForceEditable(true); }}
                            className={`w-full flex items-center justify-center gap-2 text-white font-black uppercase text-[11px] tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-md hover:scale-[1.01] active:scale-95 cursor-pointer ${
                              hasRealMovements ? 'bg-stone-700 hover:bg-stone-800' : 'bg-amber-600 hover:bg-amber-700'
                            }`}
                          >
                            <Archive className="w-3.5 h-3.5" />
                            {hasRealMovements ? 'Revoir / Corriger' : "Compléter l'Entrée"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200 bg-white py-3">
        <div className="max-w-[1600px] mx-auto px-8 flex flex-wrap justify-between items-center gap-2 text-stone-400 text-[11px] font-black uppercase tracking-[0.15em]">
          <p>© 2025 STOCK MANAGER — BUSINESS EDITION</p>
          <div className="flex gap-4">
            <span>{stockItems.length} Références</span>
            <span>{clients.length} Clients</span>
            <span>{invoices.length} Factures</span>
            <span>{movements.length} Mouvements</span>
          </div>
        </div>
      </footer>
        </div>
      </div>

      {/* ── Modal Entrée en Stock (depuis onglet Arrivages) ── */}
      {dossierViewId && (() => {
        const f = factures.find((x: any) => x.id === dossierViewId);
        if (!f) return null;
        const dossierMovs = allMovements.filter((m: any) => m.factureId === f.id || m.factureRef === f.id);
        const entryDate = f.stockEntryDate || dossierMovs.find((m: any) => m.type === 'IN')?.date || null;
        return (
          <ArrivalDossierModal
            open
            onOpenChange={open => { if (!open) setDossierViewId(null); }}
            facture={f}
            articles={articles.filter((a: any) => a.factureId === f.id || a.facture === f.id)}
            movements={dossierMovs}
            stores={stores}
            categories={categories}
            generalCategories={generalCategories}
            isEnteredInStock={Boolean(
              f.stockEntryDate || f.status === 'STOCK' || isArrivalOlderThanOneMonth(f.arrivalDate) ||
              dossierMovs.some((m: any) => m.type === 'IN')
            )}
            stockEntryDate={entryDate}
          />
        );
      })()}
      {passToStockId && (
        <PassToStockModal
          open={!!passToStockId}
          onOpenChange={open => { if (!open) { setPassToStockId(null); setPassToStockForceEditable(false); } }}
          facture={factures.find((f: any) => f.id === passToStockId)}
          associatedArticles={articles.filter((a: any) => a.factureId === passToStockId || a.facture === passToStockId)}
          subCategories={categories}
          stores={stores}
          adminUid={adminUid}
          existingMovements={allMovements.filter((m: any) => m.factureId === passToStockId || m.factureRef === passToStockId)}
          forceEditable={passToStockForceEditable}
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
                        <span className="text-[11px] font-black uppercase px-2 py-0.5 bg-violet-100 text-violet-800 rounded">
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
      {/* ── Stock de formation ─────────────────────────────────────────────────
          Charge des quantités connues sur de VRAIS produits du catalogue, pour faire travailler
          une nouvelle recrue. Aucun produit n'est créé : ce sont des mouvements d'entrée
          ordinaires, que « Reset Stock (0) » efface comme les autres. */}
      <Dialog open={formationOpen} onOpenChange={setFormationOpen}>
        <DialogContent className="sm:max-w-2xl rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-stone-900">Stock de formation</DialogTitle>
              <DialogDescription className="text-xs text-stone-500 font-bold">
                De quoi faire travailler quelqu'un sur de vrais produits
              </DialogDescription>
            </div>
          </div>

          <Encadre ton="info" className="mt-2">
            Aucun produit n'est créé. Les quantités sont posées sur {lignesFormation.length} références existantes,
            prises <span className="font-black">une par famille à tour de rôle</span> et en alternant produits simples
            et produits ventilés (couleurs, qualités, tailles) — la liste est toujours la même.
            Les {lignesFormation.filter(l => l.lieu === 'MAGASIN').length} premières vont en{' '}
            <span className="font-black">boutique</span>, les suivantes en{' '}
            <span className="font-black">réserve</span>. Tout s'efface avec « Reset Stock (0) ».
          </Encadre>

          {lignesFormation.length === 0 ? (
            <Encadre ton="attention" className="mt-3">
              Aucun produit simple trouvé dans le catalogue. Le chargement ne peut désigner que des références sans
              ventilation par qualité, couleur ou taille.
            </Encadre>
          ) : (
            <div className="mt-3 rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500 w-10">N°</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500">Produit</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500">Famille</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500">Lieu</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500 text-right">Quantité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {lignesFormation.map(l => (
                    <tr key={l.rang} className="hover:bg-stone-50/60">
                      <td className="px-3 py-2 text-[11px] font-black text-stone-400">{l.rang}</td>
                      <td className="px-3 py-2 text-[12px] font-bold text-stone-900">
                        {l.nom}
                        {l.variantes.length > 1 && (
                          <span className="block text-[10px] font-medium text-stone-500 mt-0.5">
                            {l.variantes.map(v => `${v.label} : ${v.quantite}`).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] font-bold text-stone-400 uppercase">{l.categorie}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          l.lieu === 'MAGASIN' ? 'bg-violet-100 text-violet-700' : 'bg-stone-100 text-stone-600'
                        }`}>
                          {l.lieu === 'MAGASIN' ? 'Boutique' : 'Réserve'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] font-black text-stone-900 text-right tabular-nums">
                        {l.quantite.toLocaleString('fr-MA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-stone-50 border-t-2 border-stone-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-stone-500">
                      Total · {lignesFormation.reduce((somme, l) => somme + l.variantes.length, 0)} ligne(s) de stock
                    </td>
                    <td className="px-3 py-2 text-[12px] font-black text-stone-900 text-right tabular-nums">
                      {lignesFormation.reduce((somme, l) => somme + l.quantite, 0).toLocaleString('fr-MA')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {(formationCharge || formationEnBase) ? (
              <>
                <Encadre ton="astuce" titre={formationCharge ? 'Stock chargé' : 'Stock de formation déjà en place'}>
                  Le devoir et son corrigé sont écrits avec les <span className="font-black">vrais noms</span> de ces
                  produits et leurs variantes. Les deux boutons ci-dessous téléchargent un
                  <span className="font-black"> PDF</span>, prêt à envoyer ou à imprimer.
                  Le corrigé contient les réponses — ne le donnez pas avant la correction.
                  {!formationCharge && (
                    <span className="block mt-1">
                      Les quantités sont déjà en stock : <span className="font-black">ne rechargez pas</span>, cela les
                      doublerait et fausserait le corrigé. Pour repartir de zéro, passez par « Reset Stock (0) ».
                    </span>
                  )}
                </Encadre>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    onClick={() => exporterDevoir(false)}
                    className="rounded-xl text-xs font-black bg-stone-900 hover:bg-stone-800 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Devoir en PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exporterDevoir(true)}
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Corrigé en PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(listeAImprimer(lignesFormation));
                      toast({ title: 'Liste copiée', description: 'Collez-la où vous voulez.' });
                    }}
                    className="rounded-xl text-xs font-bold"
                  >
                    Copier la liste
                  </Button>
                  <Button variant="ghost" onClick={() => setFormationOpen(false)} className="rounded-xl text-xs font-bold">
                    Fermer
                  </Button>
                </div>
              </>
            ) : (
              <BoutonValider
                onClick={handleChargerStockFormation}
                enCours={formationEnCours}
                libelleEnCours="Chargement…"
                raisonDesactive={lignesFormation.length === 0 ? "Aucun produit simple à charger dans le catalogue." : null}
              >
                Charger le stock de formation
              </BoutonValider>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetConfirmOpen} onOpenChange={open => { setResetConfirmOpen(open); if (!open) setResetConfirmText(''); }}>
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

          {/* La liste reflète exactement ce que supprime src/app/api/admin/reset-stock/route.ts.
              Elle annonçait « ventes, factures et paiements » et taisait le fichier clients, les
              dépenses, les remises de chèques, les transferts et le journal d'audit. */}
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 my-2 text-xs text-rose-900 space-y-1.5">
            <p className="font-black uppercase tracking-widest text-[10px]">Suppression définitive et irréversible</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-800">
              <li><span className="font-black">Tout le fichier clients</span> de /stock</li>
              <li>Tous les mouvements de stock</li>
              <li>Toutes les ventes, commandes, factures de caisse et paiements</li>
              <li>Toutes les dépenses commerciales et remises de chèques</li>
              <li>Tous les bons de transfert</li>
              <li><span className="font-black">Tout le journal d'audit</span> (l'historique de qui a fait quoi)</li>
              <li>L'entrepôt principal (ENTREPOT) et le stock initial saisi dans /stock</li>
            </ul>
            <p className="font-bold text-[11px] pt-1">
              Les arrivages de /gestion gardent leur statut « en stock » mais perdent leurs mouvements :
              ils repasseront « à compléter » dans l'onglet Arrivages, à réentrer un par un.
            </p>
            <p className="font-black text-emerald-800 text-[11px] pt-1">
              ✓ Les articles et les dossiers d'arrivage de /gestion ne sont pas supprimés.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-stone-600">
              Pour confirmer, recopiez <span className="font-black text-rose-700">EFFACER</span> :
            </p>
            <Input
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              placeholder="EFFACER"
              className="h-10 rounded-xl text-sm font-black uppercase tracking-widest"
            />
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
              disabled={isResetting || resetConfirmText.trim().toUpperCase() !== 'EFFACER'}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-40"
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
