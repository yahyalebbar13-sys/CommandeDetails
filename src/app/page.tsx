"use client";

import React, { useState, useMemo } from 'react';
import { ViewType } from '@/lib/types';
import DashboardView from '@/components/dashboard-view';
import FacturesView from '@/components/factures-view';
import CategoriesView from '@/components/categories-view';
import SuppliersView from '@/components/suppliers-view';
import DataView from '@/components/data-view';
import AddOrderModal from '@/components/add-order-modal';
import AddFactureModal from '@/components/add-facture-modal';
import AuthView from '@/components/auth-view';
import { Button } from '@/components/ui/button';
import { Plus, Download, Package, FileText, LayoutGrid, Users, Database, LogOut, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function StockVueApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isFactureModalOpen, setIsFactureModalOpen] = useState(false);
  const { toast } = useToast();

  // Firestore Collections
  const facturesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'factures');
  }, [firestore, user]);

  const articlesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'articles');
  }, [firestore, user]);

  const { data: factures = [], isLoading: isFacturesLoading } = useCollection(facturesRef);
  const { data: articles = [], isLoading: isArticlesLoading } = useCollection(articlesRef);

  const handleNavigateToFacture = (factureId: string) => {
    setSelectedFactureId(factureId);
    setActiveTab('factures');
  };

  const handleExport = () => {
    const headers = ['Catégorie', 'Article', 'Spécifications', 'Couleur', 'Fournisseur', 'Facture', 'Date Cmd', 'Date Arrivée', 'Quantité', 'Unité', 'CBM', 'PA', 'Valeur Totale'];
    const rows = articles.map(d => {
      const total = (d.quantity * d.purchasePricePerUnit).toFixed(2);
      return [d.categoryId, d.name, d.specs || '-', d.color || '-', d.supplierId, d.factureId || '-', d.orderDate, d.arrivalDate, d.quantity, d.unitOfMeasure, d.cubicMeasurement || 0, d.purchasePricePerUnit, total]
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

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfbf7]">
      <nav className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
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
                  onClick={() => {
                    setActiveTab(id);
                    if (id === 'factures') setSelectedFactureId(null);
                  }}
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
              <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-red-500">
                <LogOut className="w-4 h-4" />
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
                onClick={() => {
                  setActiveTab(id);
                  if (id === 'factures') setSelectedFactureId(null);
                }}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {(isFacturesLoading || isArticlesLoading) ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView articles={articles || []} factures={factures || []} onNavigate={setActiveTab} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'factures' && <FacturesView articles={articles || []} factures={factures || []} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} />}
            {activeTab === 'categories' && <CategoriesView articles={articles || []} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles || []} factures={factures || []} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'data' && <DataView articles={articles || []} />}
          </>
        )}
      </main>

      <AddOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        factures={factures || []}
      />

      <AddFactureModal
        open={isFactureModalOpen}
        onOpenChange={setIsOrderModalOpen}
        factures={factures || []}
      />
    </div>
  );
}
