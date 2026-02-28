"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { initialOrders, initialFactures } from '@/lib/initial-data';
import { Order, Facture, ViewType } from '@/lib/types';
import DashboardView from '@/components/dashboard-view';
import FacturesView from '@/components/factures-view';
import CategoriesView from '@/components/categories-view';
import SuppliersView from '@/components/suppliers-view';
import DataView from '@/components/data-view';
import AddOrderModal from '@/components/add-order-modal';
import AddFactureModal from '@/components/add-facture-modal';
import { Button } from '@/components/ui/button';
import { Plus, Download, Package, FileText, LayoutGrid, Users, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function StockVueApp() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isFactureModalOpen, setIsFactureModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setOrders(initialOrders);
    setFactures(initialFactures);
  }, []);

  const handleExport = () => {
    const headers = ['Catégorie', 'Article', 'Spécifications', 'Couleur', 'Fournisseur', 'Facture', 'Date Cmd', 'Date Arrivée', 'Quantité', 'Unité', 'CBM', 'PA', 'Valeur Totale'];
    const rows = orders.map(d => {
      const total = (d.qty * d.pa).toFixed(2);
      return [d.category, d.article, d.specs || '-', d.color || '-', d.supplier, d.facture || '-', d.orderDate, d.arrivalDate, d.qty, d.unit, d.cbm || 0, d.pa, total]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Export_Commandes_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export réussi !", description: "Le fichier CSV a été téléchargé." });
  };

  const navItems = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutGrid },
    { id: 'factures', label: 'Factures & Arrivages', icon: FileText },
    { id: 'categories', label: 'Catégories', icon: Package },
    { id: 'suppliers', label: 'Fournisseurs', icon: Users },
    { id: 'data', label: 'Base Complète', icon: Database },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfbf7]">
      <nav className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-xl md:text-2xl font-bold text-stone-700 tracking-tight">
                📦 GESTION<span className="text-amber-600">COMMANDES</span>
              </span>
            </div>
            
            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant={activeTab === id ? "secondary" : "ghost"}
                  className={`flex items-center gap-2 ${activeTab === id ? 'text-amber-600' : 'text-stone-600'}`}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="hidden md:flex gap-1 border-stone-200 hover:bg-stone-50">
                <Download className="w-4 h-4" /> Export
              </Button>
              <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white gap-1">
                <Plus className="w-4 h-4" /> Cmd
              </Button>
            </div>
          </div>
          
          <div className="lg:hidden flex overflow-x-auto pb-2 space-x-1 no-scrollbar">
            {navItems.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={activeTab === id ? "secondary" : "ghost"}
                size="sm"
                className={`whitespace-nowrap flex items-center gap-1 ${activeTab === id ? 'text-amber-600' : 'text-stone-600'}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'dashboard' && <DashboardView orders={orders} factures={factures} onNavigate={setActiveTab} />}
        {activeTab === 'factures' && <FacturesView orders={orders} factures={factures} setFactures={setFactures} />}
        {activeTab === 'categories' && <CategoriesView orders={orders} />}
        {activeTab === 'suppliers' && <SuppliersView orders={orders} />}
        {activeTab === 'data' && <DataView orders={orders} />}
      </main>

      <AddOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        factures={factures}
        onAdd={(newOrder) => {
          setOrders(prev => [newOrder, ...prev]);
          toast({ title: "Article ajouté !", description: `${newOrder.article} a été ajouté.` });
        }}
      />

      <AddFactureModal
        open={isFactureModalOpen}
        onOpenChange={setIsFactureModalOpen}
        factures={factures}
        onSave={(newFacture) => {
          setFactures(prev => {
            const idx = prev.findIndex(f => f.id === newFacture.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = newFacture;
              return updated;
            }
            return [newFacture, ...prev];
          });
          toast({ title: "Facture enregistrée !", description: `N° ${newFacture.id}` });
        }}
      />
    </div>
  );
}