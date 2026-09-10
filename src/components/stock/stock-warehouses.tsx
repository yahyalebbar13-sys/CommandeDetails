"use client";

import React, { useState, useMemo } from 'react';
import { 
  Warehouse, Boxes, ArrowRight, ArrowLeftRight, ClipboardCheck, Package, 
  Plus, Edit2, Trash2, Save, X, ShieldAlert, MapPin, Building2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Store, StockItem, StockMovement } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

interface StockWarehousesProps {
  stores: Store[];
  stockItems: StockItem[];
  allStockItems?: StockItem[];
  movements: StockMovement[];
  userRole: string;
  userStoreId: string | null;
  adminUid?: string | null;
  onSelectStore: (storeId: string, view?: 'inventory' | 'movements' | 'blind-inventory') => void;
}

const RESERVED_STORE_IDS = ['CHRIFA', 'DERB_OMAR', 'IDAA'];

export default function StockWarehouses({
  stores, stockItems, allStockItems, movements, userRole, userStoreId, adminUid, onSelectStore
}: StockWarehousesProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  // Filtrer uniquement les entrepôts
  const warehouses = useMemo(() => {
    return stores.filter(s => s.type === 'WAREHOUSE');
  }, [stores]);

  const canManage = userRole === 'ADMIN' || userStoreId === 'CHRIFA';

  // Modal création / édition entrepôt
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [isCustomId, setIsCustomId] = useState(false);
  const [loading, setLoading] = useState(false);

  const openCreateModal = () => {
    setIsEditing(false);
    setWarehouseId('');
    setWarehouseName('');
    setIsCustomId(false);
    setModalOpen(true);
  };

  const openEditModal = (w: Store) => {
    setIsEditing(true);
    setWarehouseId(w.id);
    setWarehouseName(w.name);
    setIsCustomId(true);
    setModalOpen(true);
  };

  const handleSaveWarehouse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!firestore || !adminUid) {
      toast({ title: 'Erreur', description: 'Session non connectée', variant: 'destructive' });
      return;
    }
    if (!warehouseName.trim()) {
      toast({ title: 'Champ requis', description: "Veuillez saisir le nom de l'entrepôt", variant: 'destructive' });
      return;
    }

    const safeId = (warehouseId || warehouseName).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    if (!safeId) {
      toast({ title: 'Erreur', description: 'Identifiant d\'entrepôt invalide', variant: 'destructive' });
      return;
    }

    if (RESERVED_STORE_IDS.includes(safeId)) {
      toast({
        title: 'Identifiant réservé',
        description: `L'identifiant "${safeId}" est réservé pour les magasins principaux et ne peut pas être utilisé comme entrepôt.`,
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      await setDoc(doc(firestore, 'users', adminUid, 'stores', safeId), {
        id: safeId,
        name: warehouseName.trim(),
        type: 'WAREHOUSE',
        isMain: false,
      }, { merge: true });

      toast({
        title: isEditing ? 'Entrepôt mis à jour' : 'Entrepôt créé avec succès',
        description: `L'entrepôt ${warehouseName} (${safeId}) est maintenant disponible pour le stock Chrifa.`
      });

      setModalOpen(false);
    } catch (err: any) {
      console.error('Erreur enregistrement entrepôt:', err);
      toast({ title: 'Erreur', description: err?.message || "Impossible d'enregistrer l'entrepôt", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWarehouse = async (w: Store) => {
    if (!firestore || !adminUid) return;

    if (RESERVED_STORE_IDS.includes(w.id)) {
      toast({ title: 'Action interdite', description: 'Impossible de supprimer un magasin principal.', variant: 'destructive' });
      return;
    }

    if (!confirm(`Confirmez-vous la suppression définitive de l'entrepôt "${w.name}" (${w.id}) ?`)) return;

    try {
      await deleteDoc(doc(firestore, 'users', adminUid, 'stores', w.id));
      toast({ title: 'Entrepôt supprimé', description: `L'entrepôt ${w.name} a été supprimé.` });
    } catch (err: any) {
      console.error('Erreur suppression entrepôt:', err);
      toast({ title: 'Erreur', description: "Impossible de supprimer l'entrepôt", variant: 'destructive' });
    }
  };

  // Utiliser les articles complets (globaux) pour que chaque entrepôt affiche ses vraies pièces et stats
  const itemsForStats = (allStockItems && allStockItems.length > 0) ? allStockItems : stockItems;

  const getWarehouseStats = (warehouseId: string) => {
    let refs = 0;
    let qty = 0;
    let val = 0;

    itemsForStats.forEach(i => {
      const storeQty = i.qtyByStore?.[warehouseId] || 0;
      if (storeQty > 0) {
        refs++;
        qty += storeQty;
        val += storeQty * (i.purchasePricePerUnit || 0);
      }
    });
    return { refs, qty, val };
  };

  // Stats globales pour tous les entrepôts combinés
  const totalWarehouseStats = useMemo(() => {
    let refsSet = new Set<string>();
    let totalQty = 0;
    let totalVal = 0;

    warehouses.forEach(w => {
      itemsForStats.forEach(i => {
        const q = i.qtyByStore?.[w.id] || 0;
        if (q > 0) {
          refsSet.add(i.articleId);
          totalQty += q;
          totalVal += q * (i.purchasePricePerUnit || 0);
        }
      });
    });

    return {
      refs: refsSet.size,
      qty: totalQty,
      val: totalVal
    };
  }, [warehouses, stockItems]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-800 to-blue-950 p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
              <Warehouse className="w-4 h-4" />
            </span>
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em]">Logistique &amp; Stockage</p>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Entrepôts de <span className="text-blue-400">Stockage</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 max-w-xl">
            Gestion physique de vos dépôts et entrepôts pour la réception des arrivages et l'inventaire.
          </p>
        </div>

        {/* Actions & Mini stats du bandeau */}
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl text-center border border-white/10">
            <p className="text-[8px] font-black uppercase tracking-widest text-stone-300">Entrepôts</p>
            <p className="text-xl font-black text-white">{warehouses.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl text-center border border-white/10">
            <p className="text-[8px] font-black uppercase tracking-widest text-stone-300">Total Pièces</p>
            <p className="text-xl font-black text-blue-400">{fmt(totalWarehouseStats.qty)}</p>
          </div>
          {userRole === 'ADMIN' && (
            <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-3 rounded-2xl text-center border border-emerald-500/30">
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-300">Valeur Globale</p>
              <p className="text-xl font-black text-emerald-400">{fmt(totalWarehouseStats.val)} <span className="text-[10px]">MAD</span></p>
            </div>
          )}

          {canManage && (
            <Button
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-wider px-5 py-3.5 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              Créer un Entrepôt
            </Button>
          )}
        </div>
      </div>

      {/* Grille des entrepôts ou état vide */}
      {warehouses.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-stone-200 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Warehouse className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-stone-800 uppercase tracking-tight">Aucun entrepôt configuré</h3>
            <p className="text-stone-400 text-xs mt-1 max-w-md mx-auto">
              Créez votre premier entrepôt de stockage pour y affecter vos arrivages et gérer vos inventaires.
            </p>
          </div>
          {canManage && (
            <Button
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-wider px-6 py-3 rounded-2xl shadow-md inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Créer un premier entrepôt
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {warehouses.map(w => {
            const stats = getWarehouseStats(w.id);

            return (
              <div
                key={w.id}
                className="bg-white rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300 group"
              >
                {/* Entête de carte */}
                <div className="p-6 bg-gradient-to-b from-stone-50 to-white border-b border-stone-100">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <Warehouse className="w-6 h-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">
                        Entrepôt
                      </span>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(w)}
                            title="Modifier"
                            className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteWarehouse(w)}
                            title="Supprimer"
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-2xl font-black text-stone-900 uppercase tracking-tighter">
                    {w.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-stone-400 font-bold font-mono uppercase">
                      CODE: {w.id}
                    </p>
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                      Stock CHRIFA
                    </span>
                  </div>
                </div>

                {/* Indicateurs clés */}
                <div className="p-6 space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
                      <div className="flex items-center gap-1.5 text-stone-400 mb-1">
                        <Package className="w-3.5 h-3.5" />
                        <p className="text-[8px] font-black uppercase tracking-widest">Articles Référencés</p>
                      </div>
                      <p className="text-xl font-black text-stone-800">{stats.refs}</p>
                    </div>

                    <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                      <div className="flex items-center gap-1.5 text-blue-500 mb-1">
                        <Boxes className="w-3.5 h-3.5" />
                        <p className="text-[8px] font-black uppercase tracking-widest">Total Pièces</p>
                      </div>
                      <p className="text-xl font-black text-blue-700">{fmt(stats.qty)}</p>
                    </div>
                  </div>

                  {/* VISIBILITÉ STRICTE DE LA VALEUR MARCHANDISE : ADMIN UNIQUEMENT */}
                  {userRole === 'ADMIN' && (
                    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600">Valeur Marchandise</p>
                        <p className="text-lg font-black text-emerald-700">{fmt(stats.val)} MAD</p>
                      </div>
                      <span className="text-[8px] font-black bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded uppercase">
                        Admin
                      </span>
                    </div>
                  )}
                </div>

                {/* Les 3 accès autorisés pour un entrepôt : Inventaire, Mouvements, Inventaire aveugle */}
                <div className="p-6 bg-stone-50/60 border-t border-stone-100 space-y-2">
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-3">
                    Modules Disponibles pour cet Entrepôt
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => onSelectStore(w.id, 'inventory')}
                      variant="outline"
                      className="h-10 text-[9px] font-black uppercase tracking-wider rounded-xl border-stone-200 hover:bg-stone-900 hover:text-white transition-all flex items-center justify-center gap-1 px-2"
                    >
                      <Boxes className="w-3.5 h-3.5" /> Inventaire
                    </Button>

                    <Button
                      onClick={() => onSelectStore(w.id, 'movements')}
                      variant="outline"
                      className="h-10 text-[9px] font-black uppercase tracking-wider rounded-xl border-stone-200 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-1 px-2"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" /> Mouvements
                    </Button>

                    <Button
                      onClick={() => onSelectStore(w.id, 'blind-inventory')}
                      variant="outline"
                      className="h-10 text-[9px] font-black uppercase tracking-wider rounded-xl border-stone-200 hover:bg-amber-600 hover:text-white transition-all flex items-center justify-center gap-1 px-2"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" /> Inv. Aveugle
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Création / Édition Entrepôt */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6 border-stone-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-blue-600" />
              {isEditing ? "Modifier l'entrepôt" : "Créer un nouvel entrepôt"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveWarehouse} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-stone-500">Nom de l'entrepôt *</Label>
              <Input
                type="text"
                placeholder="Ex: Entrepôt Tit Mellil, Dépôt Ain Sebaa..."
                value={warehouseName}
                onChange={(e) => {
                  const val = e.target.value;
                  setWarehouseName(val);
                  if (!isEditing && !isCustomId) {
                    setWarehouseId(val.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
                  }
                }}
                required
                className="mt-1.5 h-11 rounded-xl border-stone-200 font-bold"
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-stone-500">Identifiant Unique (Code) *</Label>
              <Input
                type="text"
                placeholder="Ex: DEPOT_TIT_MELLIL"
                value={warehouseId}
                disabled={isEditing}
                onChange={(e) => {
                  setIsCustomId(true);
                  setWarehouseId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
                }}
                required
                className="mt-1.5 h-11 rounded-xl border-stone-200 font-mono font-bold uppercase disabled:bg-stone-100"
              />
              <p className="text-[10px] text-stone-400 mt-1">Généré automatiquement ou personnalisable. Ne peut pas être CHRIFA, DERB_OMAR ou IDAA.</p>
            </div>

            <div className="pt-2 border-t border-stone-100">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-900 font-medium">
                <span className="font-bold">ℹ️ Entrepôt rattaché à CHRIFA :</span> Aucun identifiant ni mot de passe n'est requis. L'entrepôt est directement accessible et géré depuis l'espace Chrifa ou l'administrateur.
              </div>
            </div>

            <DialogFooter className="pt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl font-bold uppercase text-xs"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold uppercase text-xs"
              >
                {loading ? 'Enregistrement...' : (isEditing ? 'Enregistrer' : 'Créer l\'entrepôt')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
