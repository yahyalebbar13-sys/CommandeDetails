
"use client";

import React, { useState } from 'react';
import { ViewType } from '@/lib/types';
import DashboardView from '@/components/dashboard-view';
import FacturesView from '@/components/factures-view';
import GeneralCategoriesView from '@/components/general-categories-view';
import CategoriesView from '@/components/categories-view';
import SuppliersView from '@/components/suppliers-view';
import DataView from '@/components/data-view';
import PendingOrdersView from '@/components/pending-orders-view';
import ToOrderView from '@/components/to-order-view';
import AddOrderModal from '@/components/add-order-modal';
import EditOrderModal from '@/components/edit-order-modal';
import AuthView from '@/components/auth-view';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, LayoutGrid, Users, Database, LogOut, Loader2, Clock, Menu, ListTodo, Layers, Package, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function StockVueApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [selectedGeneralCategoryId, setSelectedGeneralCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  const facturesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'factures');
  }, [firestore, user]);

  const articlesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'articles');
  }, [firestore, user]);

  const genCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);

  const subCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'categories');
  }, [firestore, user]);

  const { data: factures = [], isLoading: isFacturesLoading } = useCollection(facturesRef);
  const { data: articles = [], isLoading: isArticlesLoading } = useCollection(articlesRef);
  const { data: generalCategories = [], isLoading: isGenCatsLoading } = useCollection(genCatsRef);
  const { data: subCategories = [], isLoading: isSubCatsLoading } = useCollection(subCatsRef);

  const handleNavigateToFacture = (factureId: string) => {
    setSelectedFactureId(factureId);
    setActiveTab('factures');
  };

  const handleEditArticle = (article: any) => {
    setEditingArticle(article);
  };

  const handleSelectGeneralCategory = (id: string) => {
    setSelectedGeneralCategoryId(id);
    setActiveTab('categories');
  };

  const handleExport = () => {
    const headers = ['Statut', 'Groupe', 'Sous-Cat', 'Article', 'Specs', 'Couleur', 'Fournisseur', 'Facture', 'Date Cmd', 'Date Arrivée', 'Quantité', 'Unité', 'CBM', 'PA', 'Valeur Totale'];
    const rows = (articles || []).map(d => {
      const total = ((d.quantity || 0) * (d.purchasePricePerUnit || 0)).toFixed(2);
      const statusLabel = d.status === 'TO_ORDER' ? 'À COMMANDER' : (d.status === 'PI' ? 'EN PRODUCTION' : 'EXPÉDIÉ');
      const genCat = generalCategories.find(gc => gc.id === d.generalCategoryId)?.name || '-';
      return [statusLabel, genCat, d.categoryId, d.name, d.specs || '-', d.color || '-', d.supplierId, d.factureId || '-', d.orderDate, d.arrivalDate || '-', d.quantity, d.unitOfMeasure, d.cubicMeasurement || 0, d.purchasePricePerUnit, total]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Export_Commandes_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export réussi !" });
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'to-order', label: 'À Commander', icon: ListTodo },
    { id: 'pending', label: 'Commandes PI', icon: Clock },
    { id: 'factures', label: 'Factures', icon: FileText },
    { id: 'general-categories', label: 'Catégories', icon: Layers },
    { id: 'categories', label: 'Sous-Catégories', icon: Package },
    { id: 'suppliers', label: 'Fournisseurs', icon: Users },
    { id: 'data', label: 'Base', icon: Database },
  ] as const;

  const NavButtons = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {navItems.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={activeTab === id ? "secondary" : "ghost"}
          className={`flex items-center gap-2 justify-start ${isMobile ? 'w-full text-lg py-6' : ''} ${activeTab === id ? 'text-amber-600 font-bold' : 'text-stone-600'}`}
          onClick={() => {
            setActiveTab(id);
            if (id === 'factures') setSelectedFactureId(null);
            if (id === 'general-categories') setSelectedGeneralCategoryId(null);
            if (id === 'categories') setSelectedCategoryName(null);
            if (isMobile) setIsMobileMenuOpen(false);
          }}
        >
          <Icon className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
          {label}
        </Button>
      ))}
    </>
  );

  if (isUserLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7]"><Loader2 className="animate-spin text-amber-600" /></div>;
  }

  if (!user) return <AuthView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfbf7]">
      <nav className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader className="p-6"><SheetTitle>📦 STOCKVUE</SheetTitle></SheetHeader>
                <div className="flex flex-col p-4 space-y-2"><NavButtons isMobile /></div>
              </SheetContent>
            </Sheet>
            <span className="text-xl font-bold">📦 STOCK<span className="text-amber-600">VUE</span></span>
          </div>
          <div className="hidden lg:flex items-center space-x-1"><NavButtons /></div>
          <div className="flex items-center space-x-2">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white gap-1"><Plus className="w-4 h-4" /> Cmd</Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="hidden md:flex">Export</Button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="hidden md:flex text-stone-400 hover:text-red-500"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full">
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isSubCatsLoading) ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-stone-300" /></div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView articles={articles} factures={factures} onNavigate={setActiveTab} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles} factures={factures} onEdit={handleEditArticle} />}
            {activeTab === 'factures' && <FacturesView articles={articles} factures={factures} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setSelectedCategoryName(c); setActiveTab('categories'); }} />}
            {activeTab === 'general-categories' && <GeneralCategoriesView generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'categories' && <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles} factures={factures} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'data' && <DataView articles={articles} onEdit={handleEditArticle} />}
          </>
        )}
      </main>
      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} factures={factures} />
      <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
    </div>
  );
}
