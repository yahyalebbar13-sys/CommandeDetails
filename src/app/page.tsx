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
import TransitOrdersView from '@/components/transit-orders-view';
import AddOrderModal from '@/components/add-order-modal';
import EditOrderModal from '@/components/edit-order-modal';
import AuthView from '@/components/auth-view';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Database, LogOut, Loader2, Menu, Layers, FileText, Factory, Truck, ClipboardList, LayoutDashboard, Boxes, UserCheck } from 'lucide-react';
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

  const handleSelectGeneralCategory = (id: string | null) => {
    setSelectedGeneralCategoryId(id);
    if (id) {
      setActiveTab('categories');
    } else {
      setActiveTab('general-categories');
    }
  };

  const resetToHome = () => {
    setActiveTab('dashboard');
    setSelectedFactureId(null);
    setSelectedGeneralCategoryId(null);
    setSelectedCategoryName(null);
  };

  const handleExport = () => {
    const headers = ['Statut', 'Groupe', 'Sous-Cat', 'Article', 'Specs', 'Couleur', 'Fournisseur', 'Facture', 'Date Cmd', 'Date Arrivée', 'Quantité', 'Unité', 'CBM', 'PA', 'Valeur Totale'];
    const rows = (articles || []).map(d => {
      const total = ((d.quantity || 0) * (d.purchasePricePerUnit || 0)).toFixed(2);
      const statusLabel = d.status === 'TO_ORDER' ? 'À COMMANDER' : (d.status === 'PI' ? 'EN PRODUCTION' : 'EXPÉDIÉ');
      const genCat = (generalCategories || []).find(gc => gc.id === d.generalCategoryId)?.name || '-';
      return [statusLabel, genCat, d.categoryId, d.name, d.specs || '-', d.color || '-', d.supplierId, d.factureId || '-', d.orderDate, d.arrivalDate || '-', d.quantity, d.unitOfMeasure, d.cubicMeasurement || 0, d.purchasePricePerUnit, total]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Export_StockVue_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export CSV généré" });
  };

  const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'to-order', label: 'Besoins', icon: ClipboardList },
    { id: 'pending', label: 'Production', icon: Factory },
    { id: 'transit', label: 'Transit', icon: Truck },
    { id: 'factures', label: 'Arrivages', icon: FileText },
    { id: 'general-categories', label: 'Groupes', icon: Layers },
    { id: 'categories', label: 'Articles', icon: Boxes },
    { id: 'suppliers', label: 'Fournisseurs', icon: UserCheck },
    { id: 'data', label: 'Stock Global', icon: Database },
  ] as const;

  const NavButtons = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {navItems.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={activeTab === id ? "secondary" : "ghost"}
          className={`flex items-center gap-3 justify-start rounded-md transition-all ${isMobile ? 'w-full text-base py-5' : 'px-3 py-1.5 h-9'} ${activeTab === id ? 'bg-amber-100 text-amber-900 font-bold' : 'text-stone-600 hover:bg-stone-100'}`}
          onClick={() => {
            setActiveTab(id);
            if (id === 'factures') setSelectedFactureId(null);
            if (id === 'general-categories') setSelectedGeneralCategoryId(null);
            if (id === 'categories') setSelectedCategoryName(null);
            if (isMobile) setIsMobileMenuOpen(false);
          }}
        >
          <Icon className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
          <span className="truncate">{label}</span>
        </Button>
      ))}
    </>
  );

  if (isUserLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0]"><Loader2 className="animate-spin text-amber-600" /></div>;
  }

  if (!user) return <AuthView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden text-stone-600"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="p-4 border-b"><SheetTitle className="text-lg font-bold tracking-tight">STOCKVUE</SheetTitle></SheetHeader>
                <div className="flex flex-col p-2 space-y-1"><NavButtons isMobile /></div>
              </SheetContent>
            </Sheet>
            <button 
              onClick={resetToHome}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl font-black tracking-tighter text-stone-900 uppercase">STOCK<span className="text-[#CC8626]">VUE</span></span>
            </button>
          </div>
          
          <div className="hidden lg:flex items-center space-x-1"><NavButtons /></div>
          
          <div className="flex items-center space-x-2">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-[#CC8626] hover:bg-[#b07421] text-white px-4 py-2 h-10 rounded-md shadow-sm flex items-center gap-2 text-xs uppercase font-bold">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ajouter</span>
            </Button>
            <div className="h-6 w-px bg-stone-200 mx-2"></div>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-[#BF3914] h-10 w-10">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-[1600px] mx-auto px-4 py-8 w-full">
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isSubCatsLoading) ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="animate-spin text-[#CC8626] w-10 h-10" />
            <p className="text-stone-500 font-bold uppercase tracking-widest text-xs">Chargement des données...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView articles={articles} factures={factures} onNavigate={setActiveTab} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles} factures={factures} onEdit={handleEditArticle} />}
            {activeTab === 'transit' && <TransitOrdersView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'factures' && <FacturesView articles={articles} factures={factures} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setSelectedCategoryName(c); setActiveTab('categories'); }} />}
            {activeTab === 'general-categories' && <GeneralCategoriesView generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'categories' && <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles} factures={factures} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'data' && <DataView articles={articles} onEdit={handleEditArticle} />}
          </>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-stone-500 text-[10px] font-bold uppercase tracking-widest gap-4">
          <p>© 2024 STOCKVUE • PLATEFORME DE GESTION LOGISTIQUE</p>
          <div className="flex gap-6">
            <button onClick={handleExport} className="hover:text-[#CC8626] transition-colors border-b border-transparent hover:border-[#CC8626]">TÉLÉCHARGER EXPORT (CSV)</button>
            <span className="text-stone-200">|</span>
            <span className="text-stone-400">VERSION 2.5</span>
          </div>
        </div>
      </footer>
      
      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} factures={factures} />
      <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
    </div>
  );
}
