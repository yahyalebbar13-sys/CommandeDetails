"use client";

import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, History } from 'lucide-react';
import type { StockItem, StockMovement } from '@/lib/types';
import { AddOrderForm } from '@/components/add-order-modal';

interface BlindInventoryProps {
  stockItems: StockItem[];
  categories: any[];
  activeStore: string;
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
  adminUid: string | null;
}

export default function BlindInventory({ activeStore, adminUid }: BlindInventoryProps) {
  // Historique local de la session d'inventaire
  const [history, setHistory] = useState<{name: string, color?: string, size?: string, counted: number}[]>([]);

  const handleSuccess = (payload: any) => {
    setHistory(prev => [{
      name: payload.name || payload.categoryId,
      color: payload.color,
      size: payload.size,
      counted: payload.quantity
    }, ...prev]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-900 to-amber-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ClipboardCheck className="w-6 h-6 text-amber-300" />
              <p className="text-[9px] font-black text-amber-300 uppercase tracking-[0.3em]">Inventaire Continu</p>
            </div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Session d'Inventaire
            </h1>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mt-2">
              Saisissez les produits comptés (comme un nouveau produit)
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-white">{history.length}</p>
            <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mt-1">Articles traités</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Colonne de gauche: Formulaire */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl shadow-lg border border-stone-100 overflow-hidden">
             <AddOrderForm 
               isInventoryMode={true} 
               activeStore={activeStore} 
               adminUid={adminUid}
               onSuccess={handleSuccess} 
               onClose={() => {}} // Keep open for next product
             />
          </div>
        </div>

        {/* Colonne de droite: Historique */}
        <div className="bg-white rounded-3xl shadow-lg border border-stone-100 overflow-hidden flex flex-col max-h-[800px]">
          <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex items-center gap-2">
            <History className="w-4 h-4 text-stone-400" />
            <h2 className="text-sm font-black text-stone-900 uppercase tracking-tight">Derniers comptages</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Aucun produit compté</p>
              </div>
            ) : (
              history.map((h, i) => (
                <div key={i} className="p-3 rounded-2xl border bg-stone-50 border-stone-100">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-black text-stone-900 leading-tight flex-1">
                      {h.name}
                    </p>
                    <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 ml-2">
                      Saisi
                    </span>
                  </div>
                  
                  <div className="flex gap-2 text-[8px] font-bold text-stone-500">
                    {h.color && <span>C: {h.color}</span>}
                    {h.size && <span>T: {h.size}</span>}
                  </div>
                  
                  <div className="mt-2 text-right border-t border-black/5 pt-2">
                    <div className="text-[12px] font-black text-stone-900">
                      Saisi: {h.counted}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
