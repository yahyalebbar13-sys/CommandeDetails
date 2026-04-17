"use client";

import React, { useState, useEffect, useRef } from 'react';
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
import AIView from '@/components/ai-view';
import { ClientDetailView } from '@/components/suppliers-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LogOut, Loader2, Layers, Package, Plus, Database,
  LayoutDashboard, ClipboardList, Factory, Truck,
  Anchor, UserCheck, Menu, Timer, Calculator, Sparkles, Lock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { signOut, signInWithEmailAndPassword, onAuthStateChanged, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';

// ─── Separate Firebase app for client portal (isolated auth state from admin) ─
function getClientPortalFirebase() {
  if (typeof window === 'undefined') return null;
  const name = 'clientPortal';
  const app = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
  return { auth: getAuth(app), db: getFirestore(app) };
}

// ─── CLIENT PORTAL ─────────────────────────────────────────────────────────
type PortalState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'checking' }
  | { status: 'portal'; clientName: string; adminUid: string }
  | { status: 'error'; message: string };

function ClientPortal() {
  const [state, setState] = useState<PortalState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [articles, setArticles] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Refs hold the isolated Firebase instances — never shared with the admin app
  const authRef = useRef<ReturnType<typeof getAuth> | null>(null);
  const dbRef = useRef<ReturnType<typeof getFirestore> | null>(null);

  useEffect(() => {
    const fb = getClientPortalFirebase();
    if (!fb) return;
    authRef.current = fb.auth;
    dbRef.current = fb.db;

    const unsubscribe = onAuthStateChanged(fb.auth, async (user) => {
      if (!user) { setState({ status: 'login' }); return; }
      setState({ status: 'checking' });
      try {
        const snap = await getDoc(doc(fb.db, 'clientAccess', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setState({ status: 'portal', clientName: data.clientName, adminUid: data.adminUid });
        } else {
          await signOut(fb.auth);
          setState({ status: 'error', message: "Ce compte n'est pas autorisé pour le portail client." });
        }
      } catch (e) {
        await signOut(fb.auth);
        setState({ status: 'error', message: "Erreur de vérification de votre accès." });
      }
    });
    return () => unsubscribe();
  }, []);

  // Load client data when authenticated
  useEffect(() => {
    if (state.status !== 'portal') return;
    const { adminUid } = state as { status: 'portal'; clientName: string; adminUid: string };
    if (!dbRef.current) return;
    setDataLoading(true);
    const db = dbRef.current;
    Promise.all([
      getDocs(collection(db, 'users', adminUid, 'articles')),
      getDocs(collection(db, 'users', adminUid, 'factures')),
    ]).then(([artSnap, facSnap]) => {
      setArticles(artSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setFactures(facSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [state.status]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authRef.current) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(authRef.current, email, password);
    } catch {
      setLoginError("Identifiants invalides. Veuillez réessayer.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => { if (authRef.current) signOut(authRef.current); };

  if (state.status === 'loading' || state.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
          <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">
            {state.status === 'checking' ? 'Vérification de vos droits...' : 'Chargement...'}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'login' || state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0] p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-200 mb-4">
              <Package className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-stone-900 uppercase">
              STOCK<span className="text-indigo-600">VUE</span>
            </h1>
            <p className="text-stone-400 text-[11px] font-bold uppercase tracking-widest mt-1">Portail Client</p>
          </div>
          <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
            <div className="bg-indigo-900 p-6 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-indigo-700 rounded-xl mb-3">
                <Lock className="w-5 h-5 text-indigo-200" />
              </div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Accès Espace Client</h2>
              <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest mt-1">
                Consultez vos précommandes en temps réel
              </p>
            </div>
            <form onSubmit={handleLogin} className="p-8 space-y-5">
              {(state.status === 'error' || loginError) && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[10px] text-red-600 font-bold text-center uppercase tracking-wide">
                  {state.status === 'error' ? state.message : loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Adresse Email</Label>
                <Input type="email" required placeholder="votre@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-12 border-stone-200 font-bold rounded-xl" autoFocus />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Mot de Passe</Label>
                <Input type="password" required placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-12 border-stone-200 font-bold rounded-xl" />
              </div>
              <Button type="submit" disabled={loginLoading}
                className="w-full h-12 bg-indigo-700 hover:bg-indigo-800 text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-indigo-200">
                {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accéder à Mon Espace"}
              </Button>
              <p className="text-center text-[9px] text-stone-300 uppercase tracking-widest font-bold pt-2">
                Accès sécurisé — Données confidentielles
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const portalState = state as { status: 'portal'; clientName: string; adminUid: string };
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
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">
                {portalState.clientName}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}
              className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50 transition-colors"
              title="Déconnexion">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>
      <main className="flex-grow max-w-[1400px] mx-auto px-6 py-8 w-full">
        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">
              Chargement de vos commandes...
            </p>
          </div>
        ) : (
          <div className="fade-in">
            <ClientDetailView
              clientName={portalState.clientName}
              articles={articles}
              factures={factures}
              isPortal
            />
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

// ─── ROUTER ────────────────────────────────────────────────────────────────
export default function StockVueApp() {
  const [isClientPortal, setIsClientPortal] = useState(false);

  useEffect(() => {
    const check = () => setIsClientPortal(window.location.hash === '#client');
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  if (isClientPortal) return <ClientPortal />;
  return <AdminApp />;
}

// ─── ADMIN APP ─────────────────────────────────────────────────────────────
function AdminApp() {
  const { user, isUserLoading } = useUser();
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

  const paymentsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'supplierPayments');
  }, [firestore, user]);

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

  const handleNavigateToFacture = (factureId: string) => {
    setSelectedFactureId(factureId);
    setActiveTab('factures');
    setIsMobileMenuOpen(false);
  };

  const handleEditArticle = (article: any) => { setEditingArticle(article); };
  const handlePassToStock = (factureId: string) => { setPassToStockFactureId(factureId); };
  const handleSelectGeneralCategory = (id: string | null) => {
    setSelectedGeneralCategoryId(id);
    setActiveTab(id ? 'categories' : 'general-categories');
  };
  const resetToHome = () => {
    setActiveTab('dashboard');
    setSelectedFactureId(null);
    setSelectedGeneralCategoryId(null);
    setSelectedCategoryName(null);
    setIsMobileMenuOpen(false);
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
    { id: 'ai', label: 'IA Marché', icon: Sparkles },
  ] as const;

  const NavButtons = ({ vertical = false }: { vertical?: boolean }) => (
    <div className={`flex ${vertical ? 'flex-col space-y-2' : 'flex-row space-x-1'}`}>
      {navItems.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={activeTab === id ? "secondary" : "ghost"}
          className={`flex items-center gap-2 justify-start rounded-xl transition-all px-3 py-1.5 h-9 ${activeTab === id ? 'bg-amber-500 text-white font-black shadow-md shadow-amber-500/10' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'} ${vertical ? 'w-full h-12' : ''}`}
          onClick={() => {
            setActiveTab(id);
            if (id === 'factures') setSelectedFactureId(null);
            if (id === 'general-categories') setSelectedGeneralCategoryId(null);
            setIsMobileMenuOpen(false);
          }}
        >
          <Icon className={`${vertical ? 'w-5 h-5' : 'w-3.5 h-3.5'}`} />
          <span className={`truncate uppercase font-black tracking-wider ${vertical ? 'text-[11px]' : 'text-[10px]'}`}>{label}</span>
        </Button>
      ))}
    </div>
  );

  if (isUserLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="animate-spin text-amber-500 w-10 h-10" /></div>;
  }

  if (!user) return <AuthView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="xl:hidden -ml-2 text-stone-900">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-0 border-r border-stone-100">
                <SheetHeader className="bg-stone-900 p-6 text-left">
                  <SheetTitle className="text-xl font-black tracking-tighter text-white uppercase flex items-center gap-3">
                    STOCK<span className="text-amber-500">VUE</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4">
                  <NavButtons vertical />
                </div>
              </SheetContent>
            </Sheet>

            <button onClick={resetToHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl font-black tracking-tighter text-stone-900 uppercase">STOCK<span className="text-amber-500">VUE</span></span>
            </button>
            <div className="h-6 w-px bg-stone-200 hidden xl:block" />
            <div className="hidden xl:flex items-center space-x-1">
              <NavButtons />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-4 py-2 h-9 rounded-xl shadow-lg shadow-stone-900/5 flex items-center gap-2 text-[10px] uppercase font-black tracking-widest">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nouveau Produit</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50 transition-colors">
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
            {activeTab === 'dashboard' && <DashboardView articles={articles} factures={factures} generalCategories={generalCategories} onNavigate={setActiveTab} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'to-order' && <ToOrderView articles={articles} factures={factures} onEdit={handleEditArticle} />}
            {activeTab === 'pending' && <PendingOrdersView articles={articles} factures={factures} onEdit={handleEditArticle} />}
            {activeTab === 'transit' && <TransitOrdersView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'timeline' && <TimelineView articles={articles} factures={factures} onNavigateToFacture={handleNavigateToFacture} onPassToStock={handlePassToStock} />}
            {activeTab === 'factures' && <FacturesView articles={articles} factures={factures} subCategories={subCategories} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setSelectedCategoryName(c); setActiveTab('categories'); }} />}
            {activeTab === 'general-categories' && <GeneralCategoriesView articles={articles} generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'categories' && <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} onSelectGeneralCategory={handleSelectGeneralCategory} />}
            {activeTab === 'cost-analysis' && <CostAnalysisView articles={articles} factures={factures} subCategories={subCategories} />}
            {activeTab === 'suppliers' && <SuppliersView articles={articles} factures={factures} payments={payments} onNavigateToFacture={handleNavigateToFacture} />}
            {activeTab === 'data' && <DataView articles={articles} onEdit={handleEditArticle} />}
            {activeTab === 'ai' && <AIView articles={articles} generalCategories={generalCategories} subCategories={subCategories} />}
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6">
        <div className="max-w-[1600px] mx-auto px-6 flex justify-between items-center text-stone-400 text-[9px] font-black uppercase tracking-[0.2em]">
          <p>© 2024 STOCKVUE LOGISTICS ENGINE</p>
          <div className="flex gap-6 items-center">
            <span className="text-stone-300">CORE VERSION 2.8.5</span>
          </div>
        </div>
      </footer>

      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} />
      <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
      {passToStockFactureId && (
        <PassToStockModal
          open={!!passToStockFactureId}
          onOpenChange={(open) => !open && setPassToStockFactureId(null)}
          facture={factures.find(f => f.id === passToStockFactureId)}
          associatedArticles={articles.filter(a => a.factureId === passToStockFactureId)}
          subCategories={subCategories}
        />
      )}
    </div>
  );
}
