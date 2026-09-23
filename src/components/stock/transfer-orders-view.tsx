"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Plus, CheckCircle2, Clock, XCircle, Search, Save, X, Printer, AlertTriangle, Building2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { TransferOrder, TransferOrderItem, StockItem, StoreLocation, StockMovement, Store } from '@/lib/types';
import { exportTransferOrderPDF } from '@/lib/pdf-export-reports';
import { logAudit } from '@/lib/audit-log';
import { cleanUndefined } from '@/lib/utils';
import {
  type StockVariant, type VariantDimension, splitOutboundLines, suggestInboundLocation, stockItemVariant,
} from '@/lib/warehouse-locations';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';
import { uniteDecimale, pasDeSaisie } from '@/lib/unites-pole';
import { ChampQuantite } from './stock-sale-flow';

interface TransferOrdersViewProps {
  transferOrders: TransferOrder[];
  /** Familles et pôles : servent à décrire les produits sur le bon imprimé (qualité, GSM, curseur…). */
  categories?: any[];
  generalCategories?: any[];
  stockItems: StockItem[];
  stores: Store[];
  /** Mouvements, pour résoudre automatiquement les emplacements (FIFO en sortie). */
  movements?: any[];
  userRole: 'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED';
  activeStore: StoreLocation | 'ALL';
  adminUid: string | null;
}

/**
 * Variante (couleur, qualité ou taille) d'une ligne de transfert, pour ne prendre et ne ranger
 * que dans les racks de CETTE variante. La ligne garde l'articleId de sa ligne de stock : pour un
 * article éclaté, c'est l'id virtuel de computeStockItems (`<id réel>__color__Bleu`), qui porte à
 * lui seul la dimension et le libellé — utile pour un bon enregistré dont la ligne de stock n'est
 * plus listée (vue entrepôt : les lignes vides sont masquées).
 */
function transferItemVariant(item: TransferOrderItem, stockItems: StockItem[]): StockVariant | null {
  const fromStock = stockItemVariant(stockItems.find(s => s.articleId === item.articleId));
  if (fromStock) return fromStock;
  const m = /__(quality|color|size)__(.+)$/.exec(String(item.articleId || ''));
  return m ? { dimension: m[1] as VariantDimension, value: m[2] } : null;
}

// ── Quantités selon l'unité ──
// Un bon de TAFFETA se compte en mètres, et au centimètre : 12,5 m se transfère. Ce qui se compte à
// la pièce reste en entiers.

/** Arrondi au millième, comme le calcul du stock : 2,3 − 2,2 ne laisse pas 0,09999999999999964. */
const arrondiQte = (q: number) => Math.round(q * 1000) / 1000;

/** L'unité d'une ligne, à afficher — rien pour le « unité » par défaut. */
function uniteCourte(unite?: string | null): string {
  const u = (unite || '').trim();
  return u && u.toLowerCase() !== 'unité' ? u : '';
}

/** « 12,5 m », ou le nombre seul. */
function qteAvecUnite(q: number, unite?: string | null): string {
  const u = uniteCourte(unite);
  return u ? `${arrondiQte(q)} ${u}` : String(arrondiQte(q));
}

/**
 * L'unité commune à toutes les lignes d'un bon, s'il n'en a qu'une (un bon de TAFFETA : m). Sinon
 * rien : additionner des mètres et des pièces ne donne pas un total qu'on puisse nommer.
 */
function uniteCommune(lignes: { unitOfMeasure?: string }[]): string {
  const unites = new Set(lignes.map(l => uniteCourte(l.unitOfMeasure)));
  return unites.size === 1 ? [...unites][0] : '';
}

export default function TransferOrdersView({ transferOrders, stockItems, stores, movements = [], userRole, activeStore, adminUid, categories = [], generalCategories = [] }: TransferOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const getStoreLabel = (id: string) => stores.find(s => s.id === id)?.name || id;

  const [search, setSearch] = useState('');
  
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [validateModal, setValidateModal] = useState<{ open: boolean; order?: TransferOrder }>({ open: false });

  // ── Le trajet : départ fixé, arrivée choisie ─────────────────────────────────────────────────
  // Règle de la maison : la marchandise part TOUJOURS du magasin principal — c'est lui qui tient la
  // réserve et les entrepôts — et rejoint un des autres magasins. Le départ n'est donc plus une
  // question posée au vendeur : il se déduit des magasins déclarés, et il s'affiche en clair.
  /** Le magasin principal : celui marqué comme tel, à défaut celui dont l'identifiant est CHRIFA. */
  const magasinPrincipal = useMemo(
    () => stores.find(s => s.isMain && s.type !== 'WAREHOUSE')
      || stores.find(s => s.isMain)
      || stores.find(s => s.id === 'CHRIFA')
      || null,
    [stores]
  );
  /** Lieu de départ. Constante de l'écran : aucun champ ne le change. */
  const fromStore = magasinPrincipal?.id || 'CHRIFA';
  /** Les seuls lieux d'arrivée possibles : les AUTRES magasins — jamais un entrepôt. */
  const magasinsArrivee = useMemo(
    () => stores.filter(s => s.type !== 'WAREHOUSE' && s.id !== fromStore),
    [stores, fromStore]
  );

  // Create Form State
  const [toStore, setToStore] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<TransferOrderItem[]>([]);
  const [articleSearch, setArticleSearch] = useState('');

  // Le lieu de départ n'est plus choisi à la main, mais il peut encore changer sous les pieds de
  // l'utilisateur : la liste des magasins arrive après le premier rendu, et le repli « CHRIFA »
  // cède alors la place au vrai magasin principal. Les quantités déjà saisies ont été plafonnées
  // sur le stock de l'ancien lieu : on repart des lignes vides plutôt que de les laisser se faire
  // refuser à l'enregistrement sans explication.
  useEffect(() => {
    setSelectedItems([]);
  }, [fromStore]);

  // Validate Form State
  const [receivedItems, setReceivedItems] = useState<Record<string, number>>({}); // articleId -> qty

  const filteredOrders = useMemo(() => {
    let res = [...transferOrders];
    if (search) {
      res = res.filter(o => o.id.toLowerCase().includes(search.toLowerCase()) || getStoreLabel(o.toStore)?.toLowerCase().includes(search.toLowerCase()));
    }
    return res.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [transferOrders, search, stores]);

  const addArticleToTransfer = (item: StockItem) => {
    if (selectedItems.find(i => i.articleId === item.articleId)) return;
    const availableInSource = fromStore && item.qtyByStore ? ((item.qtyByStore as any)[fromStore] || 0) : item.currentQty;
    if (availableInSource <= 0) {
      toast({
        variant: 'destructive',
        title: 'Stock insuffisant',
        description: `L'article "${item.productName}" n'a plus rien au lieu de départ (${getStoreLabel(fromStore)}).`
      });
      return;
    }
    setSelectedItems(prev => [...prev, {
      articleId: item.articleId,
      realArticleId: (item as any)._realArticleId || item.articleId,
      categoryId: item.categoryId,
      productName: item.nameFR || item.productName,
      nameFR: item.nameFR,
      color: item.color,
      size: item.size,
      quality: item.quality,
      unitOfMeasure: item.unitOfMeasure,
      sentQty: Math.min(1, availableInSource)
    }]);
    setArticleSearch('');
  };

  const handleCreateTransfer = async () => {
    if (!firestore || !adminUid || selectedItems.length === 0) return;
    if (!toStore) return toast({ variant: 'destructive', title: 'Lieu d\'arrivée manquant', description: 'Choisissez le magasin qui reçoit la marchandise, à l\'étape 1.' });
    if (fromStore === toStore) return toast({ variant: 'destructive', title: 'Trajet impossible', description: 'Le lieu d\'arrivée doit être un autre magasin que le magasin principal.' });
    
    // Vérification stricte des stocks sources disponibles
    for (const item of selectedItems) {
      const originalStock = stockItems.find(s => s.articleId === item.articleId);
      const available = fromStore && originalStock?.qtyByStore ? ((originalStock.qtyByStore as any)[fromStore] || 0) : (originalStock?.currentQty || 0);
      if (item.sentQty <= 0) {
        return toast({ variant: 'destructive', title: 'Quantité invalide', description: `Veuillez spécifier une quantité valide pour ${item.productName}.` });
      }
      if (item.sentQty > arrondiQte(available)) {
        return toast({
          variant: 'destructive',
          title: 'Stock insuffisant',
          description: `Quantité demandée (${qteAvecUnite(item.sentQty, item.unitOfMeasure)}) supérieure au stock disponible (${qteAvecUnite(available, item.unitOfMeasure)}) à ${getStoreLabel(fromStore)} pour ${item.productName}.`
        });
      }
    }

    try {
      const now = new Date().toISOString();
      // Transfert confirmé immédiatement : plus d'étape "Réceptionner" séparée —
      // le stock source et destination sont mis à jour dans le même mouvement.
      const validatedItems = selectedItems.map(item => ({ ...item, receivedQty: item.sentQty }));
      const transferData: Omit<TransferOrder, 'id'> = {
        fromStore: fromStore as StoreLocation,
        toStore: toStore as StoreLocation,
        status: 'VALIDATED',
        items: validatedItems,
        date: now,
        receivedDate: now,
        createdAt: serverTimestamp(),
      };

      // Le bon ET ses mouvements dans le MÊME lot : écrit avant, il restait en base marqué
      // « Validé », quantités reçues remplies et imprimable, alors qu'aucun mouvement n'avait pu
      // être écrit — un bon fantôme que rien ne permettait de rejouer.
      // cleanUndefined partout : une ligne peut n'avoir ni taille ni qualité (variante couleur), et
      // Firestore refuse un champ undefined (« Unsupported field value: undefined »).
      const docRef = doc(collection(firestore, 'users', adminUid, 'transferOrders'));

      // Mouvements OUT (source) + IN (destination) dans le même batch atomique
      const batch = writeBatch(firestore);
      batch.set(docRef, cleanUndefined(transferData));
      // Copie de travail : chaque ligne générée y est ajoutée, pour que la ligne suivante d'une même
      // variante ne reprenne pas dans un rack que la précédente vient de vider.
      const work = [...movements];
      for (const item of selectedItems) {
        const realId = item.realArticleId || item.articleId;
        const variant = transferItemVariant(item, stockItems);
        const common = {
          articleId: realId,
          categoryId: item.categoryId,
          productName: item.nameFR || item.productName,
          nameFR: item.nameFR,
          color: item.color,
          size: item.size,
          quality: item.quality,
          unitOfMeasure: item.unitOfMeasure,
          date: now.split('T')[0],
          createdAt: serverTimestamp()
        };

        // Sortie de la source : emplacement résolu automatiquement en FIFO, sans rien demander,
        // parmi les racks de la variante transférée.
        const outBase = {
          ...common,
          type: 'OUT' as const,
          reason: 'TRANSFERT' as const,
          storeId: fromStore,
          toStoreId: toStore,
          notes: `Transfert ${docRef.id} vers ${getStoreLabel(toStore)}`,
        };
        const outLines = splitOutboundLines(work, fromStore, realId, item.sentQty, outBase, variant);
        for (const line of outLines) {
          batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(line));
        }
        work.push(...outLines);

        // Entrée à destination : on range là où le produit est déjà, si l'endroit est unique.
        const dest = suggestInboundLocation(work, toStore, realId, variant);
        const inLine = {
          ...common,
          type: 'IN' as const,
          reason: 'TRANSFERT' as const,
          storeId: toStore,
          toStoreId: toStore,
          fromStoreId: fromStore,
          ...(dest ? { locationCode: dest.locationCode, ...(dest.locationId ? { locationId: dest.locationId } : {}) } : {}),
          quantity: item.sentQty,
          notes: `Transfert ${docRef.id} depuis ${getStoreLabel(fromStore)}`,
        };
        batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(inLine));
        work.push(inLine);
      }
      await batch.commit();

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_VALIDATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: docRef.id,
        description: `Transfert confirmé ${getStoreLabel(fromStore)} → ${getStoreLabel(toStore)} · ${selectedItems.length} référence(s), ${arrondiQte(selectedItems.reduce((s, i) => s + i.sentQty, 0))} ${uniteCommune(selectedItems) || 'unité(s)'}`,
        metadata: { fromStore, toStore, itemCount: selectedItems.length },
      });

      toast({ title: 'Transfert confirmé', description: 'Le stock a été mis à jour immédiatement à la source et à la destination.' });
      setCreateModal(false);
      setSelectedItems([]);
    } catch (e: any) {
      const isPermission = e?.code === 'permission-denied' || /permission/i.test(String(e?.message || ''));
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: isPermission
          ? "Vous n'avez pas les droits pour confirmer un transfert vers ce magasin. Demandez à un compte ayant accès aux deux magasins de l'effectuer."
          : 'Impossible de créer le bon.'
      });
    }
  };

  const handleValidateTransfer = async () => {
    if (!firestore || !adminUid || !validateModal.order) return;
    const order = validateModal.order;
    if (order.status === 'VALIDATED') {
      toast({ title: 'Déjà validé', description: 'Ce transfert a déjà été réceptionné et validé.' });
      setValidateModal({ open: false });
      return;
    }

    try {
      const now = new Date().toISOString();
      const updatedItems = order.items.map(item => ({
        ...item,
        receivedQty: receivedItems[item.articleId] ?? item.sentQty
      }));

      for (const item of updatedItems) {
        if (item.receivedQty < 0 || item.receivedQty > item.sentQty * 1.1) {
          // Au mètre, le plafond garde ses décimales : 10 % de plus que 2,5 m font 2,75 m, pas 2.
          const plafond = uniteDecimale(item.unitOfMeasure) ? arrondiQte(item.sentQty * 1.1) : Math.floor(item.sentQty * 1.1);
          toast({ variant: 'destructive', title: 'Erreur', description: `La quantité reçue pour ${item.productName} doit être entre 0 et ${qteAvecUnite(plafond, item.unitOfMeasure)}.` });
          return;
        }
      }

      const batch = writeBatch(firestore);

      // Update Transfer Order Status
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);
      batch.update(orderRef, cleanUndefined({
        status: 'VALIDATED',
        items: updatedItems,
        receivedDate: now
      }));

      // Copie de travail : réceptions et pertes déjà générées y sont ajoutées, pour que deux lignes
      // d'une même variante ne puisent pas deux fois dans le même rack.
      const work = [...movements];

      // Create IN movements for the receiver + handle discrepancies
      for (const item of updatedItems) {
        const realId = item.realArticleId || item.articleId;
        const variant = transferItemVariant(item, stockItems);
        if (item.receivedQty && item.receivedQty > 0) {
          const inRef = doc(collection(firestore, 'users', adminUid, 'stockMovements'));
          // Réception : on range là où le produit est déjà dans ce magasin, si l'endroit est unique
          // (pour un article éclaté : là où SA variante est déjà).
          const dest = suggestInboundLocation(work, order.toStore, realId, variant);
          const inLine = {
            articleId: realId,
            categoryId: item.categoryId,
            productName: item.productName,
            nameFR: item.nameFR,
            color: item.color,
            size: item.size,
            quality: item.quality,
            unitOfMeasure: item.unitOfMeasure,
            type: 'IN' as const,
            reason: 'TRANSFERT' as const,
            storeId: order.toStore,
            toStoreId: order.toStore,
            fromStoreId: order.fromStore,
            ...(dest ? { locationCode: dest.locationCode, ...(dest.locationId ? { locationId: dest.locationId } : {}) } : {}),
            quantity: item.receivedQty,
            date: now.split('T')[0],
            notes: `Réception Bon de transfert ${order.id} depuis ${getStoreLabel(order.fromStore)}`,
            createdAt: serverTimestamp()
          };
          batch.set(inRef, cleanUndefined(inLine));
          work.push(inLine);
        }

        // Handle discrepancies (Losses)
        const discrepancy = arrondiQte(item.sentQty - (item.receivedQty || 0));
        if (discrepancy > 0) {
          // La perte est constatée à l'arrivée : elle sort de l'emplacement de destination
          // où la réception vient d'être créditée, résolu automatiquement en FIFO.
          const lossBase = {
            articleId: realId,
            categoryId: item.categoryId,
            productName: item.productName,
            nameFR: item.nameFR,
            color: item.color,
            size: item.size,
            quality: item.quality,
            unitOfMeasure: item.unitOfMeasure,
            type: 'OUT' as const,
            reason: 'PERTE' as const,
            storeId: order.toStore,
            date: now.split('T')[0],
            notes: `Perte/Manquant lors de la réception ${order.id}`,
            createdAt: serverTimestamp()
          };
          const lossLines = splitOutboundLines(work, order.toStore, realId, discrepancy, lossBase, variant);
          for (const line of lossLines) {
            batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(line));
          }
          work.push(...lossLines);
        }
      }

      await batch.commit();

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_VALIDATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: order.id,
        description: `Réception transfert ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} · ${uniteCommune(updatedItems)
          ? `reçu : ${arrondiQte(updatedItems.reduce((s, i) => s + (i.receivedQty || 0), 0))} ${uniteCommune(updatedItems)}`
          : `${updatedItems.reduce((s, i) => s + (i.receivedQty || 0), 0)} unité(s) reçue(s)`}`,
        metadata: { fromStore: order.fromStore, toStore: order.toStore },
      });

      toast({ title: 'Transfert validé', description: 'Le stock a été mis à jour.' });
      setValidateModal({ open: false });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de valider le bon.' });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Valeurs d'affichage uniquement : récapitulatifs et messages rattachés aux champs. Elles ne
  // décident rien — aucune de ces lignes n'écrit, ne bloque un enregistrement ni ne change un
  // calcul existant.
  // ---------------------------------------------------------------------------------------------

  /** Total des unités qui quitteront le lieu de départ, pour le récapitulatif du nouveau bon. */
  const totalUnitesEnvoyees = selectedItems.reduce((s, i) => s + (i.sentQty || 0), 0);
  /** Les références proposées par la recherche, sorties du JSX pour pouvoir dire « aucun résultat ». */
  const resultatsRecherche = articleSearch
    ? stockItems.filter(i =>
        i.productName.toLowerCase().includes(articleSearch.toLowerCase())
        || i.color?.toLowerCase().includes(articleSearch.toLowerCase())
        || i.quality?.toLowerCase().includes(articleSearch.toLowerCase())
      ).slice(0, 10)
    : [];

  /** Le bon en cours de réception, et ses totaux relus avant validation. */
  const bonRecu = validateModal.order;
  const totalEnvoyeBon = bonRecu ? bonRecu.items.reduce((s, i) => s + (i.sentQty || 0), 0) : 0;
  // Même lecture qu'à l'enregistrement : une case laissée telle quelle vaut la quantité envoyée.
  const totalCompteBon = bonRecu ? bonRecu.items.reduce((s, i) => s + (receivedItems[i.articleId] ?? i.sentQty), 0) : 0;
  const ecartBon = totalEnvoyeBon - totalCompteBon;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[11px] font-black text-blue-300 uppercase tracking-[0.3em] mb-1">Logistique Interne</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Bons de <span className="text-blue-300">Transfert</span>
            </h1>
            <p className="text-xs font-medium text-blue-100/90 leading-snug mt-2">
              Déplacer de la marchandise du magasin principal vers un autre magasin. Chaque bon écrit une sortie au
              lieu de départ et une entrée au lieu d'arrivée, et s'imprime pour accompagner la marchandise.
            </p>
          </div>
          <Button onClick={() => setCreateModal(true)} className="bg-white hover:bg-stone-50 text-blue-900 font-black text-xs tracking-wide h-11 px-6 rounded-2xl shadow-lg shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Nouveau transfert
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="p-4 border-b border-stone-100">
          <Champ
            label="Retrouver un bon"
            htmlFor="recherche-bon"
            aide="Par numéro de bon ou par nom du lieu d'arrivée."
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                id="recherche-bon"
                placeholder="Numéro de bon ou lieu d'arrivée…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${CLASSE_CHAMP} pl-10`}
              />
            </div>
          </Champ>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50/50">
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Date et numéro</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Trajet</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Contenu</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Où en est le bon</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredOrders.map(order => (
              <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-900">{new Date(order.date).toLocaleDateString('fr-FR')}</div>
                  <div className="text-[11px] font-medium text-stone-400">Bon {order.id.slice(0, 8)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <span className="bg-stone-100 px-2 py-1 rounded-md">{getStoreLabel(order.fromStore)}</span>
                    <Truck className="w-3 h-3 text-stone-400" />
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">{getStoreLabel(order.toStore)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-700">{order.items.length} référence(s)</div>
                  <div className="text-[11px] font-medium text-stone-400">
                    {uniteCommune(order.items)
                      ? `Envoyé : ${arrondiQte(order.items.reduce((acc, i) => acc + i.sentQty, 0))} ${uniteCommune(order.items)}`
                      : `${order.items.reduce((acc, i) => acc + i.sentQty, 0)} unité(s) envoyée(s)`}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {order.status === 'PENDING' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold" title="La marchandise est partie : elle reste à compter au lieu d'arrivée">
                      <Clock className="w-3 h-3" /> En transit
                    </span>
                  ) : order.status === 'VALIDATED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold" title="Bon émis : la sortie et l'entrée ont été écrites dans la foulée">
                      <CheckCircle2 className="w-3 h-3" /> Validé
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[11px] font-bold">
                      <XCircle className="w-3 h-3" /> Annulé
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportTransferOrderPDF(order, stores, categories, generalCategories)}
                      className="h-8 px-3 rounded-xl border-stone-200 text-stone-700 hover:text-blue-600 hover:border-blue-200 text-[11px] font-bold gap-1.5 shadow-sm"
                      title="Le bon imprimé accompagne la marchandise pendant le trajet"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimer le bon</span>
                    </Button>
                    {order.status === 'PENDING' && (userRole === 'ADMIN' || activeStore === order.toStore || activeStore === 'ALL_MAIN') && (
                      <Button size="sm" onClick={() => {
                        const init: Record<string, number> = {};
                        order.items.forEach(i => init[i.articleId] = i.sentQty);
                        setReceivedItems(init);
                        setValidateModal({ open: true, order });
                      }} className="bg-blue-600 hover:bg-blue-700 text-[11px] font-black h-8 px-3 rounded-xl" title="Compter ce qui est arrivé et créditer le lieu d'arrivée">
                        Compter à l'arrivée
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm font-bold text-stone-500">Aucun bon de transfert à afficher.</p>
                  <p className="text-[11px] font-medium text-stone-400 mt-1">
                    Le bouton « Nouveau transfert », en haut à droite, sert à en créer un.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      <Dialog open={createModal} onOpenChange={setCreateModal}>
        <DialogContent className="max-w-3xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">Nouveau bon de transfert</DialogTitle>
            <p className="text-[11px] font-medium text-stone-500 leading-snug">
              Deux questions dans l'ordre : le trajet, puis la marchandise. Le récapitulatif en bas se relit avant
              d'émettre le bon.
            </p>
          </DialogHeader>
          <div className="space-y-6">
            <Encadre ton="info" titre="Ce que l'émission déclenche">
              Un transfert part du magasin principal et rejoint un autre magasin. Il écrit deux mouvements : une
              sortie au lieu de départ et une entrée au lieu d'arrivée. Les deux stocks changent dès l'émission, il
              n'y a pas d'autre confirmation à donner. Le bon s'imprime ensuite : il accompagne physiquement la
              marchandise pendant le trajet.
            </Encadre>

            {userRole !== 'ADMIN' && (
              <Encadre ton="attention" titre="L'émission revient à un responsable des deux lieux">
                La marchandise sort du magasin principal, et un magasin ne peut écrire des mouvements que sur son
                propre stock : la sortie au départ sera refusée, et comme le bon et ses deux mouvements partent dans
                un seul lot, l'enregistrement entier échoue. Les lignes se préparent ici ; l'émission revient à un
                compte ayant accès au magasin principal comme au magasin destinataire.
              </Encadre>
            )}

            <SectionFormulaire
              numero={1}
              titre="Vers quel magasin ?"
              aide="Le départ est toujours le magasin principal : il ne reste qu'à désigner le magasin qui reçoit. Ce choix commande la suite — les quantités proposées à l'étape 2 sont celles du lieu de départ."
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Champ
                  label="Lieu de départ"
                  aide="Il ne se choisit pas : la réserve et le stock central sont au magasin principal, c'est donc toujours de là que la marchandise part."
                  indice={
                    <span className="inline-flex items-center gap-1 text-stone-400">
                      <Lock className="w-3 h-3" /> Non modifiable
                    </span>
                  }
                >
                  <div
                    id="transfert-depart"
                    className={`${CLASSE_CHAMP} flex w-full items-center gap-2 border border-stone-200 bg-stone-50 px-3`}
                  >
                    <Building2 className="w-4 h-4 shrink-0 text-stone-400" />
                    <span className="truncate">{magasinPrincipal?.name || getStoreLabel(fromStore)}</span>
                    <span className="ml-auto shrink-0 rounded-lg bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-stone-500 border border-stone-200">
                      Magasin principal
                    </span>
                  </div>
                </Champ>

                <Champ
                  label="Lieu d'arrivée"
                  obligatoire
                  htmlFor="transfert-arrivee"
                  aide="Un des autres magasins. La marchandise y entre dès l'émission, et c'est là qu'elle sera comptée à la réception."
                >
                  {magasinsArrivee.length > 0 ? (
                    <select
                      id="transfert-arrivee"
                      value={toStore}
                      onChange={e => setToStore(e.target.value)}
                      className={`${CLASSE_CHAMP} w-full border bg-white px-3 outline-none`}
                    >
                      <option value="" disabled>Choisissez le magasin qui reçoit…</option>
                      {magasinsArrivee.map(s => (
                        <option key={s.id} value={s.id}>🏪 {s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Encadre ton="attention" titre="Aucun magasin ne peut recevoir">
                      En dehors du magasin principal, aucun autre magasin n'est déclaré : la marchandise n'a nulle
                      part où aller. Les entrepôts ne comptent pas — ils appartiennent déjà au magasin principal.
                      Faites ajouter le magasin destinataire, puis revenez émettre le bon.
                    </Encadre>
                  )}
                </Champ>
              </div>
            </SectionFormulaire>

            <SectionFormulaire
              numero={2}
              titre="Quoi et combien ?"
              aide="Une ligne par référence. Un article décliné en couleurs, qualités ou tailles se transfère variante par variante : c'est la variante choisie qui quitte le lieu de départ, jamais le produit entier."
              action={
                <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                  Stock de départ : {getStoreLabel(fromStore)}
                </span>
              }
            >
              <Champ
                label="Chercher la référence à transférer"
                htmlFor="transfert-recherche"
                aide="Nom, couleur ou qualité. La pastille de droite donne ce qui reste au lieu de départ : une référence à zéro ne peut pas être ajoutée au bon."
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 z-10" />
                  <Input
                    id="transfert-recherche"
                    placeholder="Nom, couleur ou qualité…"
                    value={articleSearch}
                    onChange={e => setArticleSearch(e.target.value)}
                    className={`${CLASSE_CHAMP} pl-10`}
                  />

                  {articleSearch && (
                    <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-2">
                      {resultatsRecherche.map(item => {
                        const availInSrc = fromStore && item.qtyByStore ? ((item.qtyByStore as any)[fromStore] || 0) : item.currentQty;
                        return (
                          <button key={item.articleId} onClick={() => addArticleToTransfer(item)} className="w-full text-left px-3 py-2 hover:bg-stone-50 rounded-lg flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-stone-800 truncate">{item.productName}</p>
                              <p className="text-[11px] font-medium text-stone-400 truncate">{[item.quality, item.color, item.size].filter(Boolean).join(' · ') || 'Référence sans déclinaison'}</p>
                            </div>
                            <span className={`text-[11px] font-black px-2 py-1 rounded-md shrink-0 ${availInSrc > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                              {availInSrc > 0 ? `${qteAvecUnite(availInSrc, item.unitOfMeasure)} au départ` : 'Rien au départ'}
                            </span>
                          </button>
                        );
                      })}
                      {resultatsRecherche.length === 0 && (
                        <p className="px-3 py-4 text-center text-[11px] font-bold text-stone-400">
                          Aucune référence ne correspond à cette recherche.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Champ>

              {/* Lignes retenues */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600">Référence retenue</th>
                      <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-36">Quantité envoyée</th>
                      <th className="px-4 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item, idx) => {
                      const originalStock = stockItems.find(s => s.articleId === item.articleId);
                      const availInSrc = fromStore && originalStock?.qtyByStore ? ((originalStock.qtyByStore as any)[fromStore] || 0) : (originalStock?.currentQty || 0);
                      // Message rattaché à la ligne fautive, pour ne plus le découvrir au moment du clic.
                      const erreurLigne = availInSrc <= 0
                        ? `Plus rien à ${getStoreLabel(fromStore) || 'ce lieu'} : retirez la ligne ou changez le lieu de départ.`
                        : item.sentQty <= 0
                          ? 'Indiquez la quantité : une ligne à zéro empêche l\'émission du bon.'
                          : item.sentQty > arrondiQte(availInSrc)
                            ? `Au-delà de ce qui reste au départ (${qteAvecUnite(availInSrc, item.unitOfMeasure)}).`
                            : null;

                      return (
                        <tr key={item.articleId} className="border-b border-stone-100 last:border-0 align-top">
                          <td className="px-4 py-3">
                            <p className="text-[13px] font-bold text-stone-800 leading-tight">
                              {item.productName} {[item.quality ? `[${item.quality}]` : '', item.color, item.size].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                              Reste à {getStoreLabel(fromStore) || 'ce lieu'} : <strong className="text-emerald-700">{qteAvecUnite(availInSrc, item.unitOfMeasure)}</strong>
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <ChampQuantite
                                garderDecimales
                                min={pasDeSaisie(item.unitOfMeasure)}
                                max={availInSrc}
                                valeur={item.sentQty}
                                unite={item.unitOfMeasure}
                                aria-label={`Quantité envoyée pour ${item.productName}`}
                                onQuantite={val => {
                                  const bounded = arrondiQte(Math.max(0, Math.min(val, availInSrc)));
                                  setSelectedItems(prev => prev.map((p, i) => i === idx ? { ...p, sentQty: bounded } : p));
                                }}
                                className={`${CLASSE_CHAMP} text-center`}
                              />
                              {uniteCourte(item.unitOfMeasure) && (
                                <span className="shrink-0 text-[11px] font-bold text-stone-500">{uniteCourte(item.unitOfMeasure)}</span>
                              )}
                            </div>
                            {erreurLigne && (
                              <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1 mt-1.5">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {erreurLigne}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-700 mt-3"
                              title="Retirer cette référence du bon"
                              aria-label={`Retirer ${item.productName} du bon`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center">
                          <p className="text-[13px] font-bold text-stone-500">Aucune référence dans ce bon.</p>
                          <p className="text-[11px] font-medium text-stone-400 mt-1">
                            Utilisez la recherche ci-dessus : chaque référence trouvée s'ajoute en un clic.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFormulaire>

            <Recapitulatif titre="À relire avant d'émettre">
              <LigneResume libelle="Part du magasin principal" valeur={getStoreLabel(fromStore)} />
              <LigneResume libelle="Arrive à" valeur={getStoreLabel(toStore) || '—'} />
              <LigneResume libelle="Références au bon" valeur={selectedItems.length} />
              {uniteCommune(selectedItems)
                ? <LigneResume libelle="Quantité qui quitte le lieu de départ" valeur={`${arrondiQte(totalUnitesEnvoyees)} ${uniteCommune(selectedItems)}`} fort />
                : <LigneResume libelle="Unités qui quittent le lieu de départ" valeur={totalUnitesEnvoyees} fort />}
            </Recapitulatif>

            <BoutonValider
              onClick={handleCreateTransfer}
              libelleEnCours="Émission…"
              raisonDesactive={
                magasinsArrivee.length === 0
                  ? "Aucun autre magasin n'est déclaré : il n'y a nulle part où envoyer la marchandise."
                  : !toStore
                    ? "Choisissez le magasin qui reçoit, à l'étape 1, pour émettre le bon."
                    : selectedItems.length === 0
                      ? "Ajoutez au moins une référence à l'étape 2 pour émettre le bon."
                      : null
              }
            >
              Émettre le bon et déplacer le stock
            </BoutonValider>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModal(false)} className="rounded-xl text-xs font-bold text-stone-500">Annuler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VALIDATE MODAL */}
      <Dialog open={validateModal.open} onOpenChange={open => !open && setValidateModal({ open: false })}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">Comptage à l'arrivée</DialogTitle>
            <p className="text-[11px] font-medium text-stone-500 leading-snug">
              Comptez ce qui est réellement arrivé, référence par référence, puis validez. C'est ce comptage qui
              crédite le lieu d'arrivée.
            </p>
          </DialogHeader>
          <div className="space-y-6">
            <Encadre ton="attention" titre="Ce qui manque devient une perte">
              La différence entre ce qui a été envoyé et ce qui est compté ici est enregistrée comme une perte au
              lieu d'arrivée, au nom de ce bon. Recomptez avant de valider : après coup, la correction passe par un
              inventaire.
            </Encadre>

            <SectionFormulaire
              numero={1}
              titre="De quel bon s'agit-il ?"
              aide="Rappel du trajet inscrit sur le bon. Il ne se modifie plus à ce stade."
            >
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <span className="bg-white border border-stone-200 px-2.5 py-1 rounded-lg text-xs font-bold text-stone-700">
                  {bonRecu ? getStoreLabel(bonRecu.fromStore) : '—'}
                </span>
                <Truck className="w-3.5 h-3.5 text-stone-400" />
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                  {bonRecu ? getStoreLabel(bonRecu.toStore) : '—'}
                </span>
                <span className="text-[11px] font-medium text-stone-500 ml-auto">
                  Bon {bonRecu ? bonRecu.id.slice(0, 8) : ''} · parti le {bonRecu ? new Date(bonRecu.date).toLocaleDateString('fr-FR') : ''}
                </span>
              </div>
            </SectionFormulaire>

            <SectionFormulaire
              numero={2}
              titre="Combien est arrivé ?"
              aide="Une case par référence, déjà remplie avec la quantité envoyée. Ne la corrigez que si le comptage donne autre chose."
            >
              <table className="w-full text-left border border-stone-200 rounded-xl overflow-hidden">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600">Référence</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-24">Envoyé</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-40">Compté à l'arrivée</th>
                  </tr>
                </thead>
                <tbody>
                  {bonRecu?.items.map(item => {
                    const compte = receivedItems[item.articleId] ?? item.sentQty;
                    const manque = arrondiQte(item.sentQty - compte);
                    return (
                      <tr key={item.articleId} className="border-b border-stone-100 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-bold text-stone-800 leading-tight">{item.productName}</p>
                          {[item.quality, item.color, item.size].filter(Boolean).length > 0 && (
                            <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                              {[item.quality, item.color, item.size].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-black text-blue-600 tabular-nums">{qteAvecUnite(item.sentQty, item.unitOfMeasure)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ChampQuantite
                              garderDecimales
                              min={0}
                              max={item.sentQty}
                              valeur={compte}
                              unite={item.unitOfMeasure}
                              aria-label={`Quantité comptée à l'arrivée pour ${item.productName}`}
                              onQuantite={val => setReceivedItems(prev => ({ ...prev, [item.articleId]: val }))}
                              className={`${CLASSE_CHAMP} text-center border-emerald-200 focus-visible:ring-emerald-500`}
                            />
                            {uniteCourte(item.unitOfMeasure) && (
                              <span className="shrink-0 text-[11px] font-bold text-stone-500">{uniteCourte(item.unitOfMeasure)}</span>
                            )}
                          </div>
                          {manque > 0 && (
                            <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1 mt-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {uniteDecimale(item.unitOfMeasure)
                                ? `${qteAvecUnite(manque, item.unitOfMeasure)} manquants : enregistrés en perte.`
                                : `${manque} manquant(s) : enregistré(s) en perte.`}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SectionFormulaire>

            <Recapitulatif titre="À relire avant de valider">
              <LigneResume libelle="Parti de" valeur={bonRecu ? getStoreLabel(bonRecu.fromStore) : '—'} />
              {bonRecu && uniteCommune(bonRecu.items) ? (
                <>
                  <LigneResume libelle="Quantité envoyée" valeur={`${arrondiQte(totalEnvoyeBon)} ${uniteCommune(bonRecu.items)}`} />
                  <LigneResume libelle="Quantité comptée à l'arrivée" valeur={`${arrondiQte(totalCompteBon)} ${uniteCommune(bonRecu.items)}`} fort ton="positif" />
                </>
              ) : (
                <>
                  <LigneResume libelle="Unités envoyées" valeur={totalEnvoyeBon} />
                  <LigneResume libelle="Unités comptées à l'arrivée" valeur={totalCompteBon} fort ton="positif" />
                </>
              )}
              <LigneResume
                libelle="Écart enregistré en perte"
                valeur={bonRecu && uniteCommune(bonRecu.items) ? `${arrondiQte(ecartBon)} ${uniteCommune(bonRecu.items)}` : ecartBon}
                ton={ecartBon > 0 ? 'alerte' : 'neutre'}
              />
            </Recapitulatif>

            <BoutonValider
              onClick={handleValidateTransfer}
              libelleEnCours="Validation…"
            >
              Valider le comptage et créditer le lieu d'arrivée
            </BoutonValider>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              type="button"
              onClick={() => validateModal.order && exportTransferOrderPDF(validateModal.order, stores, categories, generalCategories)}
              className="rounded-xl text-xs font-bold gap-1.5"
              title="Le bon imprimé accompagne la marchandise pendant le trajet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer le bon</span>
            </Button>
            <Button variant="ghost" onClick={() => setValidateModal({ open: false })} className="rounded-xl text-xs font-bold text-stone-500">Annuler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
