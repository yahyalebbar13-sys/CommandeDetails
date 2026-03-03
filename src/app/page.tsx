
"use client";

import React, { useState } from 'react';
import { ViewType } from '@/lib/types';
import DashboardView from '@/components/dashboard-view';
import FacturesView from '@/components/factures-view';
import CategoriesView from '@/components/categories-view';
import GeneralCategoriesView from '@/components/general-categories-view';
import SuppliersView from '@/components/suppliers-view';
import DataView from '@/components/data-view';
import PendingOrdersView from '@/components/pending-orders-view';
import ToOrderView from '@/components/to-order-view';
import AddOrderModal from '@/components/add-order-modal';
import AddFactureModal from '@/components/add-facture-modal';
import AuthView from '@/components/auth-view';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Download, Package, FileText, LayoutGrid, Users, Database, LogOut, Loader2, Clock, Menu, ListTodo, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function StockVueApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [selectedSubCategoryName, setSelectedSubCategoryName] = useState<string | null>(null);
  const [selectedGeneralCategoryId, setSelectedGeneralCategoryId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isFactureModalOpen, setIsFactureModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const generalCategoriesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);

  const categoriesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'categories');
  }, [firestore, user]);

  const { data: factures = [], isLoading: isFacturesLoading } = useCollection(facturesRef);
  const { data: articles = [], isLoading: isArticlesLoading } = useCollection(articlesRef);
  const { data: generalCategories = [], isLoading: isGenCatsLoading } = useCollection(generalCategoriesRef);
  const { data: categories = [], isLoading: isCatsLoading } = useCollection(categoriesRef);

  const handleNavigateToFacture = (factureId: string) => {
    setSelectedFactureId(factureId);
    setActiveTab('factures');
  };

  const handleNavigateToSubCategory = (categoryName: string) => {
    setSelectedSubCategoryName(categoryName);
    setActiveTab('categories');
  };

  const handleNavigateToGeneralCategory = (genCatId: string) => {
    setSelectedGeneralCategoryId(genCatId);
    setActiveTab('general-categories');
  };

  const handleExport = () => {
    const headers = ['Statut', 'Catégorie', 'Article', 'Spécifications', 'Couleur', 'Fournisseur', 'Facture', 'Date Cmd', 'Date Arrivée', 'Quantité', 'Unité', 'CBM', 'PA', 'Valeur Totale'];
    const rows = articles.map(d => {
      const total = (d.quantity * d.purchasePricePerUnit).toFixed(2);
      const statusLabel = d.status === 'TO_ORDER' ? 'À COMMANDER' : (!d.factureId ? 'EN PRODUCTION' : 'EXPÉDIÉ');
      return [statusLabel, d.categoryId, d.name, d.specs || '-', d.color || '-', d.supplierId, d.factureId || '-', d.orderDate, d.arrivalDate || '-', d.quantity, d.unitOfMeasure, d.cubicMeasurement || 0, d.purchasePricePerUnit, total]
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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'to-order', label: 'À Commander', icon: ListTodo },
    { id: 'pending', label: 'Commandes PI', icon: Clock },
    { id: 'factures', label: 'Factures', icon: FileText },
    { id: 'general-categories', label: 'Catégories', icon: Layers },
    { id: 'categories', label: 'Sous-catégories', icon: Package },
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
            if (id === 'categories') setSelectedSubCategoryName(null);
            if (id === 'general-categories') setSelectedGeneralCategoryId(null);
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
            <div className="flex items-center gap-2">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden text-stone-600">
                    <Menu className="w-6 h-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 bg-white p-0">
                  <SheetHeader className="p-6 border-b">
                    <SheetTitle className="text-xl font-bold text-stone-700">
                      📦 STOCK<span className="text-amber-600">VUE</span>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col p-4 space-y-2">
                    <NavButtons isMobile />
                    <div className="pt-4 border-t mt-4 flex flex-col space-y-2">
                      <Button variant="outline" onClick={handleExport} className="justify-start gap-2">
                        <Download className="w-5 h-5" /> Export CSV
                      </Button>
                      <Button variant="ghost" onClick={() => signOut(auth)} className="justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50">
                        <LogOut className="w-5 h-5" /> Déconnexion
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              
              <span className="text-lg md:text-xl font-bold text-stone-700 tracking-tight whitespace-nowrap">
                📦 GESTION<span className="text-amber-600">COMMANDES</span>
              </span>
            </div>
            
            <div className="hidden lg:flex items-center space-x-1">
              <NavButtons />
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="hidden md:flex gap-1 border-stone-200 hover:bg-stone-50">
                <Download className="w-4 h-4" /> Export
              </Button>
              <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white gap-1 px-3 md:px-4">
                <Plus className="w-4 h-4" /> <span className="hidden xs:inline">Cmd</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="hidden md:flex text-stone-400 hover:text-red-500">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full">
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isCatsLoading) ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView articles={articles || []} factures={factures || []} onNavigate={setActiveTab} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles || []} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles || []} factures={factures || []} />}
            {activeTab === 'factures' && (
              <FacturesView 
                articles={articles || []} 
                factures={factures || []} 
                selectedFactureId={selectedFactureId} 
                setSelectedFactureId={setSelectedFactureId}
                onNavigateToSubCategory={handleNavigateToSubCategory}
              />
            )}
            {activeTab === 'general-categories' && (
              <GeneralCategoriesView 
                generalCategories={generalCategories}
                subCategories={categories}
                onSelectGeneralCategory={(id) => {
                  setSelectedGeneralCategoryId(id);
                  setActiveTab('categories');
                }}
              />
            )}
            {activeTab === 'categories' && (
              <CategoriesView 
                articles={articles || []} 
                selectedCategory={selectedSubCategoryName}
                setSelectedCategory={setSelectedSubCategoryName}
                initialGeneralCategoryId={selectedGeneralCategoryId}
              />
            )}
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
        onOpenChange={setIsFactureModalOpen}
        factures={factures || []}
      />
    </div>
  );
}
