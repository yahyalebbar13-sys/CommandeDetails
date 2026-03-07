
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
import { Plus, Database, LogOut, Loader2, Menu, Layers, FileText, Factory, Truck, ClipboardList, LayoutDashboard, Boxes, UserCheck, Anchor } from 'lucide-react';
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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'to-order', label: 'Besoins', icon: ClipboardList },
    { id: 'pending', label: 'Production', icon: Factory },
    { id: 'transit', label: 'Transit', icon: Truck },
    { id: 'factures', label: 'Arrivages', icon: Anchor },
    { id: 'general-categories', label: 'Groupes', icon: Layers },
    { id: 'categories', label: 'Inventaire', icon: Boxes },
    { id: 'suppliers', label: 'Partenaires', icon: UserCheck },
    { id: 'data', label: 'Data Lab', icon: Database },
  ] as const;

  const NavButtons = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {navItems.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={activeTab === id ? "secondary" : "ghost"}
          className={`flex items-center gap-3 justify-start rounded-xl transition-all ${isMobile ? 'w-full text-base py-6' : 'px-4 py-2 h-10'} ${activeTab === id ? 'bg-amber-500 text-white font-black shadow-lg shadow-amber-500/20' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'}`}
          onClick={() => {
            setActiveTab(id);
            if (id === 'factures') setSelectedFactureId(null);
            if (id === 'general-categories') setSelectedGeneralCategoryId(null);
            if (id === 'categories') setSelectedCategoryName(null);
            if (isMobile) setIsMobileMenuOpen(false);
          }}
        >
          <Icon className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
          <span className="truncate text-[11px] font-black uppercase tracking-widest">{label}</span>
        </Button>
      ))}
    </>
  );

  if (isUserLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="animate-spin text-amber-500 w-10 h-10" /></div>;
  }

  if (!user) return <AuthView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden text-stone-600"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 border-r-stone-200">
                <SheetHeader className="p-8 border-b border-stone-100 bg-stone-50"><SheetTitle className="text-xl font-black tracking-tighter uppercase">STOCK<span className="text-amber-500">VUE</span></SheetTitle></SheetHeader>
                <div className="flex flex-col p-4 space-y-2"><NavButtons isMobile /></div>
              </SheetContent>
            </Sheet>
            <button 
              onClick={resetToHome}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl font-black tracking-tighter text-stone-900 uppercase">STOCK<span className="text-amber-500">VUE</span></span>
            </button>
            <div className="h-6 w-px bg-stone-200 hidden lg:block"></div>
            <div className="hidden lg:flex items-center space-x-1"><NavButtons /></div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-6 py-2 h-11 rounded-xl shadow-xl shadow-stone-900/10 flex items-center gap-2 text-[10px] uppercase font-black tracking-widest">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nouveau Produit</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-red-600 h-11 w-11 rounded-xl hover:bg-red-50 transition-colors">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-[1600px] mx-auto px-6 py-10 w-full">
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isSubCatsLoading) ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <Loader2 className="animate-spin text-amber-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Synchronisation flux logistique...</p>
          </div>
        ) : (
          <div className="fade-in">
            {activeTab === 'dashboard' && <DashboardView articles={articles} factures={factures} onNavigate={setActiveTab} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles} factures={factures} onEdit={handleEditArticle} />}
            {activeTab === 'transit' && <TransitOrdersView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'factures' && <FacturesView articles={articles} factures={factures} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setSelectedCategoryName(c); setActiveTab('categories'); }} />}
            {activeTab === 'general-categories' && <GeneralCategoriesView articles={articles} generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'categories' && <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles} factures={factures} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'data' && <DataView articles={articles} onEdit={handleEditArticle} />}
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-10">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-stone-400 text-[10px] font-black uppercase tracking-[0.2em] gap-8">
          <p>© 2024 STOCKVUE LOGISTICS ENGINE • MISSION CRITICAL PLATFORM</p>
          <div className="flex gap-8 items-center">
            <button onClick={handleExport} className="hover:text-amber-600 transition-colors flex items-center gap-2">
              <Database className="w-4 h-4" /> EXPORT ANALYTIQUE (CSV)
            </button>
            <div className="h-4 w-px bg-stone-100"></div>
            <span className="text-stone-300">CORE VERSION 2.8.5</span>
          </div>
        </div>
      </footer>
      
      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} factures={factures} />
      <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
    </div>
  );
}
