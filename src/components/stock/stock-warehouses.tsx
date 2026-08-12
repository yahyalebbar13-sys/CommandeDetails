"use client";

import React, { useMemo } from 'react';
import { Store as StoreIcon, Package, Boxes, LayoutGrid, ArrowRight, ShieldAlert, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Store, StockItem, StockMovement } from '@/lib/types';
import { fmt } from '@/lib/utils';

interface StockWarehousesProps {
  stores: Store[];
  stockItems: StockItem[];
  movements: StockMovement[];
  userRole: string;
  userStoreId: string | null;
  onSelectStore: (storeId: string) => void;
}

export default function StockWarehouses({
  stores, stockItems, movements, userRole, userStoreId, onSelectStore
}: StockWarehousesProps) {
  
  // Filtrer les lieux accessibles : 
  // - L'admin voit tout.
  // - Le magasin principal (CHRIFA) voit tout.
  const visibleStores = useMemo(() => {
    return stores.filter(s => userRole === 'ADMIN' || s.id === userStoreId || s.type === 'WAREHOUSE');
  }, [stores, userRole, userStoreId]);

  const globalModeId = userRole === 'ADMIN' ? 'ALL' : 'ALL_MAIN';
  const globalModeName = userRole === 'ADMIN' ? 'Vue Globale' : 'Tous (Magasin + Entrepôts)';

  const getStoreStats = (storeId: string) => {
    let refs = 0;
    let qty = 0;
    let val = 0;

    stockItems.forEach(i => {
      const storeQty = storeId === 'ALL' || storeId === 'ALL_MAIN' ? i.currentQty : (i.qtyByStore?.[storeId] || 0);
      if (storeQty > 0) {
        refs++;
        qty += storeQty;
        val += storeQty * (i.purchasePricePerUnit || 0);
      }
    });
    return { refs, qty, val };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-gradient-to-br from-stone-800 to-stone-900 p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em] mb-1">Navigation Rapide</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Magasins & <span className="text-blue-400">Entrepôts</span>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        
        {/* CARTE GLOBALE */}
        <div 
          onClick={() => onSelectStore(globalModeId)}
          className="bg-gradient-to-br from-stone-800 to-stone-900 text-white p-6 rounded-3xl shadow-lg border border-stone-700 cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 group flex flex-col relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div className="p-3 bg-stone-700/50 rounded-2xl">
              <LayoutGrid className="w-6 h-6 text-stone-300" />
            </div>
            <div className="bg-stone-700/50 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-stone-300 backdrop-blur-sm">
              Global
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black uppercase tracking-tighter">{globalModeName}</h3>
            <p className="text-[10px] text-stone-400 font-bold mt-1 mb-4">Vue d'ensemble de tout le stock combiné</p>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-4 relative z-10 pt-4 border-t border-stone-700/50">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Articles</p>
              <p className="text-lg font-black">{getStoreStats(globalModeId).refs}</p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Total Pièces</p>
              <p className="text-lg font-black">{fmt(getStoreStats(globalModeId).qty)}</p>
            </div>
          </div>
        </div>

        {/* CARTES LIEUX */}
        {visibleStores.map(store => {
          const stats = getStoreStats(store.id);
          const isWarehouse = store.type === 'WAREHOUSE';
          return (
            <div 
              key={store.id}
              onClick={() => onSelectStore(store.id)}
              className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group flex flex-col relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${isWarehouse ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                  <StoreIcon className={`w-6 h-6 ${isWarehouse ? 'text-blue-600' : 'text-emerald-600'}`} />
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${isWarehouse ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {isWarehouse ? 'Entrepôt' : 'Magasin'}
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tighter">{store.name}</h3>
                <p className="text-[10px] text-stone-400 font-bold font-mono mt-1 mb-4">{store.id}</p>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-4 pt-4 border-t border-stone-100">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Articles en stock</p>
                  <p className="text-lg font-black text-stone-700">{stats.refs}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Total Pièces</p>
                  <p className={`text-lg font-black ${isWarehouse ? 'text-blue-600' : 'text-emerald-600'}`}>{fmt(stats.qty)}</p>
                </div>
              </div>

              <div className="absolute inset-0 bg-stone-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                <div className="bg-stone-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-2xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                  Ouvrir <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
