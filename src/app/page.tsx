"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
import TimelineView from '@/components/timeline-view';
import AddOrderModal from '@/components/add-order-modal';
import EditOrderModal from '@/components/edit-order-modal';
import PassToStockModal from '@/components/pass-to-stock-modal';
import AuthView from '@/components/auth-view';
import CostAnalysisView from '@/components/cost-analysis-view';

import { ClientDetailView } from '@/components/suppliers-view';
import { Button } from '@/components/ui/button';
import {
  LogOut, Loader2, Layers, Plus, Database,
  LayoutDashboard, ClipboardList, Factory, Truck,
  Anchor, UserCheck, Menu, Timer, Calculator, Package, ShieldOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger
} from '@/components/ui/sheet';

// ─── Constants ────────────────────────────────────────────────────────────────
// Only this email sees the admin dashboard
const ADMIN_EMAIL = 'yahya.lebbar13@gmail.com';

// Parse client role from Firebase Auth displayName
// Format set by modal: "CLIENT:{clientName}:{adminUid}"
function parseClientDisplayName(displayName: string | null | undefined) {
  if (!displayName?.startsWith('CLIENT:')) return null;
  const body = displayName.slice('CLIENT:'.length);
  const lastColon = body.lastIndexOf(':');
  if (lastColon === -1) return null;
  return {
    clientName: body.substring(0, lastColon),
    adminUid: body.substring(lastColon + 1),
  };
}

// ─── Role type ────────────────────────────────────────────────────────────────
type Role =
  | { kind: 'loading' }
  | { kind: 'admin' }
  | { kind: 'client'; clientName: string; adminUid: string }
  | { kind: 'noAccess' };

// ─── Main router ──────────────────────────────────────────────────────────────
export default function StockVueApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const [role, setRole] = useState<Role>({ kind: 'loading' });

  useEffect(() => {
    if (!user) { setRole({ kind: 'loading' }); return; }

    // ① Admin by email — always reliable
    if (user.email === ADMIN_EMAIL) {
      setRole({ kind: 'admin' });
      return;
    }

    // ② Client by displayName — instant, no Firestore (set when modal runs)
    const fromDisplayName = parseClientDisplayName(user.displayName);
    if (fromDisplayName) {
      setRole({ kind: 'client', ...fromDisplayName });
      return;
    }

    // ③ Fallback: read clientAccess from Firestore (old accounts before displayName was added)
    if (!firestore) { setRole({ kind: 'noAccess' }); return; }

    getDoc(doc(firestore, 'clientAccess', user.uid))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          setRole({ kind: 'client', clientName: data.clientName, adminUid: data.adminUid });
        } else {
          // Document doesn't exist: client was created but Firestore write failed
          setRole({ kind: 'noAccess' });
        }
      })
      .catch(() => {
        // Permission error: Firestore rules block the read
        setRole({ kind: 'noAccess' });
      });
  }, [user?.uid, user?.email, user?.displayName, firestore]);

  // Loading state
  if (isUserLoading || (user && role.kind === 'loading')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
      </div>
    );
  }

  if (!user) return <AuthView />;
  if (role.kind === 'admin') return <AdminApp />;
  if (role.kind === 'client') {
    return (
      <ClientPortalView
        clientName={role.clientName}
        adminUid={role.adminUid}
        auth={auth}
        firestore={firestore}
      />
    );
  }

  // ④ No access page — never shown to admin by mistake
  return <NoAccessView auth={auth} />;
}

// ─── No Access Page ───────────────────────────────────────────────────────────
function NoAccessView({ auth }: { auth: any }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0] p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-6">
          <ShieldOff className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight mb-2">
          Accès non configuré
        </h1>
        <p className="text-stone-500 text-sm font-bold mb-1">
          Votre accès client n'est pas encore activé.
        </p>
        <p className="text-stone-400 text-xs mb-8">
          Contactez votre administrateur pour activer votre compte.
        </p>
        <Button
          onClick={() => signOut(auth)}
          variant="outline"
          className="font-black uppercase tracking-widest text-[10px] rounded-xl"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

// ─── Client Portal ────────────────────────────────────────────────────────────
function ClientPortalView({
  clientName,
  adminUid,
  auth,
  firestore,
}: {
  clientName: string;
  adminUid: string;
  auth: any;
  firestore: any;
}) {
  const [articles, setArticles] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !adminUid) return;
    setLoading(true);
    Promise.all([
      getDocs(collection(firestore, 'users', adminUid, 'articles')),
      getDocs(collection(firestore, 'users', adminUid, 'factures')),
    ])
      .then(([artSnap, facSnap]) => {
        setArticles(artSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setFactures(facSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [adminUid, firestore]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-indigo-600 rounded-lg">
              <Package className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-tighter text-stone-900 uppercase">
              STOCK<span className="text-indigo-600">VUE</span>
            </span>
            <div className="h-5 w-px bg-stone-200 mx-2" />
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Espace Client</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">{clientName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}
              className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-[1400px] mx-auto px-6 py-8 w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement de vos commandes...</p>
          </div>
        ) : (
          <div className="fade-in">
            <ClientDetailView clientName={clientName} articles={articles} factures={factures} isPortal />
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-4">
        <div className="max-w-[1400px] mx-auto px-6 flex justify-between items-center text-stone-400 text-[9px] font-black uppercase tracking-[0.2em]">
          <p>© 2024 STOCKVUE — PORTAIL CLIENT PRIVÉ</p>
          <span className="text-stone-300">Accès Sécurisé</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminApp() {
  const { user } = useUser();
  const { auth, firestore } = useFirebase();
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [selectedGeneralCategoryId, setSelectedGeneralCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [passToStockFactureId, setPassToStockFactureId] = useState<string | null>(null);
  const { toast } = useToast();

  const facturesRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'factures'), [firestore, user]);
  const articlesRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'articles'), [firestore, user]);
  const genCatsRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'generalCategories'), [firestore, user]);
  const subCatsRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'categories'), [firestore, user]);
  const paymentsRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'supplierPayments'), [firestore, user]);

  const { data: rawFactures, isLoading: isFacturesLoading } = useCollection(facturesRef);
  const { data: rawArticles, isLoading: isArticlesLoading } = useCollection(articlesRef);
  const { data: rawGenCats, isLoading: isGenCatsLoading } = useCollection(genCatsRef);
  const { data: rawSubCats, isLoading: isSubCatsLoading } = useCollection(subCatsRef);
  const { data: rawPayments, isLoading: isPaymentsLoading } = useCollection(paymentsRef);

  const factures = rawFactures || [];
  const articles = rawArticles || [];
  const generalCategories = rawGenCats || [];
  const subCategories = rawSubCats || [];
  const payments = rawPayments || [];

  const resetToHome = () => {
    setActiveTab('dashboard'); setSelectedFactureId(null);
    setSelectedGeneralCategoryId(null); setSelectedCategoryName(null); setIsMobileMenuOpen(false);
  };
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'to-order', label: 'Besoins et Réclamations', icon: ClipboardList },
    { id: 'pending', label: 'Production', icon: Factory },
    { id: 'transit', label: 'Transit', icon: Truck },
    { id: 'timeline', label: 'Timeline', icon: Timer },
    { id: 'factures', label: 'Arrivages', icon: Anchor },
    { id: 'general-categories', label: 'Groupes', icon: Layers },
    { id: 'cost-analysis', label: 'Coût Revient', icon: Calculator },
    { id: 'suppliers', label: 'Partenaires', icon: UserCheck },
    { id: 'data', label: 'Data Lab', icon: Database },
  ] as const;


  const NavButtons = ({ vertical = false }: { vertical?: boolean }) => (
    <div className={`flex ${vertical ? 'flex-col space-y-2' : 'flex-row space-x-1'}`}>
      {navItems.map(({ id, label, icon: Icon }) => (
        <Button key={id} variant={activeTab === id ? "secondary" : "ghost"}
          className={`flex items-center gap-2 justify-start rounded-xl transition-all px-3 py-1.5 h-9 ${activeTab === id ? 'bg-amber-500 text-white font-black shadow-md shadow-amber-500/10' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'} ${vertical ? 'w-full h-12' : ''}`}
          onClick={() => { setActiveTab(id); if (id === 'factures') setSelectedFactureId(null); if (id === 'general-categories') setSelectedGeneralCategoryId(null); setIsMobileMenuOpen(false); }}>
          <Icon className={vertical ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
          <span className={`truncate uppercase font-black tracking-wider ${vertical ? 'text-[11px]' : 'text-[10px]'}`}>{label}</span>
        </Button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="xl:hidden -ml-2 text-stone-900"><Menu className="w-6 h-6" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-0 border-r border-stone-100">
                <SheetHeader className="bg-stone-900 p-6 text-left">
                  <SheetTitle className="text-xl font-black tracking-tighter text-white uppercase">STOCK<span className="text-amber-500">VUE</span></SheetTitle>
                </SheetHeader>
                <div className="p-4"><NavButtons vertical /></div>
              </SheetContent>
            </Sheet>
            <button onClick={resetToHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl font-black tracking-tighter text-stone-900 uppercase">STOCK<span className="text-amber-500">VUE</span></span>
            </button>
            <div className="h-6 w-px bg-stone-200 hidden xl:block" />
            <div className="hidden xl:flex items-center space-x-1"><NavButtons /></div>
          </div>
          <div className="flex items-center space-x-3">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-4 py-2 h-9 rounded-xl shadow-lg flex items-center gap-2 text-[10px] uppercase font-black tracking-widest">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Nouveau Produit</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-[1600px] mx-auto px-6 py-8 w-full">
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isSubCatsLoading || isPaymentsLoading) ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <Loader2 className="animate-spin text-amber-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Synchronisation flux logistique...</p>
          </div>
        ) : (
          <div className="fade-in">
            {activeTab === 'dashboard' && <DashboardView articles={articles} factures={factures} generalCategories={generalCategories} onNavigate={setActiveTab} onNavigateToFacture={(id) => { setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles} factures={factures} onEdit={setEditingArticle} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles} factures={factures} onEdit={setEditingArticle} />}
            {activeTab === 'transit' && <TransitOrdersView articles={articles} onEdit={setEditingArticle} />}
            {activeTab === 'timeline' && <TimelineView articles={articles} factures={factures} onNavigateToFacture={(id) => { setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} onPassToStock={setPassToStockFactureId} />}
            {activeTab === 'factures' && <FacturesView articles={articles} factures={factures} subCategories={subCategories} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setSelectedCategoryName(c); setActiveTab('categories'); }} />}
            {activeTab === 'general-categories' && <GeneralCategoriesView articles={articles} generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={(id) => { setSelectedGeneralCategoryId(id); setActiveTab(id ? 'categories' : 'general-categories'); }} />}
            {activeTab === 'categories' && <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} onSelectGeneralCategory={(id) => { setSelectedGeneralCategoryId(id); setActiveTab(id ? 'categories' : 'general-categories'); }} />}
            {activeTab === 'cost-analysis' && <CostAnalysisView articles={articles} factures={factures} subCategories={subCategories} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles} factures={factures} payments={payments} categories={subCategories} onNavigateToFacture={(id) => { setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} />}
            {activeTab === 'data' && <DataView articles={articles} onEdit={setEditingArticle} />}
          </div>
        )}

      </main>

      <footer className="border-t border-stone-200 bg-white py-6">
        <div className="max-w-[1600px] mx-auto px-6 flex justify-between items-center text-stone-400 text-[9px] font-black uppercase tracking-[0.2em]">
          <p>© 2024 STOCKVUE LOGISTICS ENGINE</p>
          <span className="text-stone-300">CORE VERSION 2.8.5</span>
        </div>
      </footer>

      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} />
      <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
      {passToStockFactureId && (
        <PassToStockModal open={!!passToStockFactureId} onOpenChange={(open) => !open && setPassToStockFactureId(null)}
          facture={factures.find(f => f.id === passToStockFactureId)}
          associatedArticles={articles.filter(a => a.factureId === passToStockFactureId)}
          subCategories={subCategories} />
      )}
    </div>
  );
}
