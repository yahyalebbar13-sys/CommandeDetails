"use client";

import React, { useMemo } from 'react';
import { Warehouse, Boxes, ArrowRight, ArrowLeftRight, ClipboardCheck, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Store, StockItem, StockMovement } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

interface StockWarehousesProps {
  stores: Store[];
  stockItems: StockItem[];
  movements: StockMovement[];
  userRole: string;
  userStoreId: string | null;
  onSelectStore: (storeId: string, view?: 'inventory' | 'movements' | 'blind-inventory') => void;
}

export default function StockWarehouses({
  stores, stockItems, movements, userRole, userStoreId, onSelectStore
}: StockWarehousesProps) {
  
  // Cette page montre uniquement les entrepôts
  const warehouses = useMemo(() => {
    return stores.filter(s => s.type === 'WAREHOUSE');
  }, [stores]);

  const getWarehouseStats = (warehouseId: string) => {
    let refs = 0;
    let qty = 0;
    let val = 0;

    stockItems.forEach(i => {
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
      stockItems.forEach(i => {
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
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em]">Logistique & Stockage</p>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Entrepôts de <span className="text-blue-400">Stockage</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 max-w-xl">
            Accès dédié aux entrepôts pour l'Admin et le Magasin Principal (CHRIFA).
            Chaque entrepôt dispose des modules Inventaire, Mouvements et Inventaire aveugle.
          </p>
        </div>

        {/* Mini stats du bandeau */}
        <div className="relative z-10 flex items-center gap-3">
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
        </div>
      </div>

      {/* Grille des entrepôts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map(w => {
          const stats = getWarehouseStats(w.id);

          return (
            <div
              key={w.id}
              className="bg-white rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 group"
            >
              {/* Entête de carte */}
              <div className="p-6 bg-gradient-to-b from-stone-50 to-white border-b border-stone-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Warehouse className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">
                    Entrepôt
                  </span>
                </div>

                <h3 className="text-2xl font-black text-stone-900 uppercase tracking-tighter">
                  {w.name}
                </h3>
                <p className="text-[10px] text-stone-400 font-bold font-mono uppercase mt-0.5">
                  ID: {w.id}
                </p>
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
    </div>
  );
}
