"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { estBrouillonMagasin } from '@/lib/demande-magasin';
import { ViewType } from '@/lib/types';
import { isLocalMarketPurchaseArticle } from '@/lib/local-purchase';
import DashboardView from '@/components/dashboard-view';
import FacturesView from '@/components/factures-view';
import TableauArrivagesView from '@/components/tableau-arrivages-view';
import GeneralCategoriesView from '@/components/general-categories-view';
import CategoriesView from '@/components/categories-view';
import QualitiesManagerView from '@/components/qualities-manager-view';
import SuppliersView from '@/components/suppliers-view';
import DataView from '@/components/data-view';
import PendingOrdersView from '@/components/pending-orders-view';
import ToOrderView from '@/components/to-order-view';
import TransitOrdersView from '@/components/transit-orders-view';
import TimelineView from '@/components/timeline-view';
import AddOrderModal from '@/components/add-order-modal';
import EditOrderModal from '@/components/edit-order-modal';
import AuthView from '@/components/auth-view';
import CostAnalysisView from '@/components/cost-analysis-view';
import SimulateurRevientView from '@/components/simulateur-revient-view';
import HistoryRevientView from '@/components/history-revient-view';
import CostSaleView from '@/components/cost-sale-view';
import DPView from '@/components/dp-view';
import ReconciliationView from '@/components/reconciliation-view';
import DevisPIView from '@/components/devis-pi-view';
import { ClientProfitabilityView } from '@/components/client-profitability-view';
import DemandesClientsView from '@/components/demandes-clients-view';
import { exportGlobalPackingPDF } from '@/lib/pdf-global-packing';

import { Button } from '@/components/ui/button';
import {
  LogOut, Loader2, Layers, Plus, Database,
  LayoutDashboard, ClipboardList, Factory, Truck,
  Anchor, UserCheck, Menu, Timer, Calculator, Package, ShieldOff, ShoppingCart, FileCheck, Table2, TrendingUp, ReceiptText, FileDown, History, ChevronDown, Mail, Sparkles, Inbox, TableProperties, Handshake
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useEnrichedArticles } from '@/hooks/use-enriched-articles';
import { useStatutsAAnnoncer } from '@/hooks/use-statuts-a-annoncer';
import StatutsAAnnoncerBandeau from '@/components/statuts-a-annoncer-bandeau';

// ─── Constants ────────────────────────────────────────────────────────────────
// Only this email sees the admin dashboard — enforced ALSO by Firestore rules
const ADMIN_EMAIL = 'yahya.lebbar13@gmail.com';
// Employee with limited access — can only see the Coût de Vente page
const STAFF_EMAIL = process.env.NEXT_PUBLIC_STAFF_EMAIL || '';
const STAFF_PASSWORD = process.env.NEXT_PUBLIC_STAFF_PASSWORD || '';

// ─── Auto-provision staff account ────────────────────────────────────────────
// Called silently when admin logs in. Creates the staff Firebase Auth account
// and their clientAccess Firestore document automatically (fire-and-forget).
async function autoProvisionStaff(adminUid: string, firestore: any) {
  try {
    const appName = 'staffProvision_' + Date.now();
    const secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);
    let staffUid: string;
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, STAFF_EMAIL, STAFF_PASSWORD);
      staffUid = cred.user.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        // Account already exists — sign in to get UID
        const cred = await signInWithEmailAndPassword(secondaryAuth, STAFF_EMAIL, STAFF_PASSWORD);
        staffUid = cred.user.uid;
      } else {
        throw err;
      }
    }
    await deleteApp(secondaryApp);
    // Write/update clientAccess doc for the staff user
    await setDoc(
      doc(firestore, 'clientAccess', staffUid),
      { adminUid, email: STAFF_EMAIL, role: 'staff', createdAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    // Silent fail — staff can still log in next time admin connects
    console.warn('[autoProvisionStaff] skipped:', e);
  }
}

// Parse client role from Firebase Auth displayName
// Format set by modal: "CLIENT:{clientName}:{adminUid}"
function parseClientDisplayName(displayName: string | null | undefined) {
  if (!displayName?.startsWith('CLIENT:')) return null;
  const body = displayName.slice('CLIENT:'.length);
  const lastColon = body.lastIndexOf(':');
  if (lastColon === -1) return null;
  const clientName = body.substring(0, lastColon);
  const adminUid = body.substring(lastColon + 1);
  // Basic sanity — adminUid should look like a Firebase UID (alphanumeric, non-empty)
  if (!adminUid || adminUid.length < 10) return null;
  if (!clientName || clientName.trim().length === 0) return null;
  return { clientName: clientName.trim(), adminUid };
}

// ─── Role type ────────────────────────────────────────────────────────────────
type Role =
  | { kind: 'loading' }
  | { kind: 'admin' }
  | { kind: 'staff'; adminUid: string }
  | { kind: 'client'; clientName: string; adminUid: string }
  | { kind: 'noAccess' };

// ─── Main router ──────────────────────────────────────────────────────────────
export default function StockVueApp() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore } = useFirebase();
  const [role, setRole] = useState<Role>({ kind: 'loading' });

  useEffect(() => {
    if (!user) { setRole({ kind: 'loading' }); return; }

    // ① Admin by email — fast-path; ALSO enforced server-side by Firestore rules
    if (user.email === ADMIN_EMAIL) {
      setRole({ kind: 'admin' });
      // Auto-provision staff account silently in background
      if (firestore) autoProvisionStaff(user.uid, firestore);
      return;
    }

    // ② Staff (limited employee) — detected by email; reads admin data via clientAccess doc
    if (user.email === STAFF_EMAIL) {
      // Look up their clientAccess document to get the adminUid
      getDoc(doc(firestore, 'clientAccess', user.uid))
        .then(snap => {
          if (snap.exists()) {
            const adminUid = (snap.data().adminUid || '').trim();
            if (adminUid) { setRole({ kind: 'staff', adminUid }); return; }
          }
          // Fallback: no clientAccess doc yet — show noAccess
          setRole({ kind: 'noAccess' });
        })
        .catch(() => setRole({ kind: 'noAccess' }));
      return;
    }

    // Non-admin must have a valid Firestore clientAccess document
    // displayName is a fast-path hint but Firestore is authoritative
    if (!firestore) { setRole({ kind: 'noAccess' }); return; }

    getDoc(doc(firestore, 'clientAccess', user.uid))
      .then(snap => {
        if (!snap.exists()) {
          setRole({ kind: 'noAccess' });
          return;
        }
        const data = snap.data();
        const clientName = (data.clientName || '').trim();
        const adminUid = (data.adminUid || '').trim();
        if (!clientName || !adminUid) {
          setRole({ kind: 'noAccess' });
          return;
        }
        setRole({ kind: 'client', clientName, adminUid });
      })
      .catch(() => {
        // Permission denied by Firestore rules — not a valid client
        setRole({ kind: 'noAccess' });
      });
  }, [user?.uid, user?.email, firestore]);

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
  if (role.kind === 'staff') return (
    <StaffCostSaleApp adminUid={role.adminUid} auth={auth} firestore={firestore} />
  );
  // ③ Client : son espace est /client, qui passe par le serveur (/api/client/*).
  // Ici, rien n'est lu dans la base pour lui : on l'y envoie tout de suite.
  if (role.kind === 'client') return <RedirectionEspaceClient />;

  // ④ No access page — never shown to admin by mistake
  return <NoAccessView auth={auth} />;
}

// ─── Redirection vers l'espace client ─────────────────────────────────────────
// Un client qui se connecte ici (même projet Firebase) ne doit jamais charger
// les données de l'administrateur : l'ancien portail lisait en direct tous les
// articles, dossiers et catégories. On le renvoie vers /client sans rien lire.
function RedirectionEspaceClient() {
  useEffect(() => {
    window.location.replace('/client');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F9F6F0] p-4 text-center">
      <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
      <p className="text-stone-500 text-sm font-bold">Redirection vers votre espace client…</p>
      <a href="/client" className="text-xs font-bold text-indigo-600 underline underline-offset-4">
        Accéder à votre espace client
      </a>
    </div>
  );
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

// ─── Staff Cost-Sale Portal ──────────────────────────────────────────────────
function StaffCostSaleApp({ adminUid, auth, firestore }: { adminUid: string; auth: any; firestore: any }) {
  const [articles, setArticles] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [generalCategories, setGeneralCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !adminUid || adminUid.length < 10) return;
    setLoading(true);
    Promise.all([
      getDocs(collection(firestore, 'users', adminUid, 'articles')),
      getDocs(collection(firestore, 'users', adminUid, 'factures')),
      getDocs(collection(firestore, 'users', adminUid, 'categories')),
      getDocs(collection(firestore, 'users', adminUid, 'generalCategories')),
    ])
      .then(([artSnap, facSnap, catSnap, genCatSnap]) => {
        setArticles(artSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((a: any) => !isLocalMarketPurchaseArticle(a) && !estBrouillonMagasin(a)));
        setFactures(facSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setSubCategories(catSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setGeneralCategories(genCatSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [adminUid, firestore]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-emerald-600 rounded-lg">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-tighter text-stone-900 uppercase">
              STOCK<span className="text-emerald-600">VUE</span>
            </span>
            <div className="h-5 w-px bg-stone-200 mx-2" />
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Coût de Vente</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-full px-4 py-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Employé</span>
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
            <Loader2 className="animate-spin text-emerald-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement des données...</p>
          </div>
        ) : (
          <div className="fade-in">
            <CostSaleView
              articles={articles}
              factures={factures}
              subCategories={subCategories}
              generalCategories={generalCategories}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-4">
        <div className="max-w-[1400px] mx-auto px-6 flex justify-between items-center text-stone-400 text-[9px] font-black uppercase tracking-[0.2em]">
          <p>© 2024 STOCKVUE — ACCÈS EMPLOYÉ</p>
          <span className="text-stone-300">Coût de Vente Uniquement</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
// Les onglets de l'application, plus ceux propres à cet écran.
type OngletAdmin = ViewType | 'demandes-clients' | 'tableau-arrivages';

function AdminApp() {
  const { user } = useUser();
  const { auth, firestore } = useFirebase();
  const [activeTab, setActiveTab] = useState<OngletAdmin>('dashboard');
  const [previousTab, setPreviousTab] = useState<OngletAdmin | null>(null);
  // Demandes envoyées depuis l'espace client et pas encore prises en charge (pastille du menu).
  const [demandesNouvelles, setDemandesNouvelles] = useState(0);
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [selectedGeneralCategoryId, setSelectedGeneralCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [qualitiesFocus, setQualitiesFocus] = useState<{ specType: string; poleId: string } | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [globalNotifyChannel, setGlobalNotifyChannel] = useState<'email' | 'whatsapp' | 'both'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('notifyChannel') as any) || 'email';
    }
    return 'email';
  });

  const cycleChannel = () => {
    setGlobalNotifyChannel(prev => {
      const next = prev === 'email' ? 'whatsapp' : prev === 'whatsapp' ? 'both' : 'email';
      localStorage.setItem('notifyChannel', next);
      return next;
    });
  };

  const channelLabel = globalNotifyChannel === 'email' ? '📧' : globalNotifyChannel === 'whatsapp' ? '📱' : '📧+📱';
  const { toast } = useToast();

  const facturesRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'factures'), [firestore, user]);
  const articlesRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'articles'), [firestore, user]);
  const genCatsRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'generalCategories'), [firestore, user]);
  const subCatsRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'categories'), [firestore, user]);
  // payments is only needed by SuppliersView — load lazily when that tab is active
  const paymentsRef = useMemoFirebase(() => (!firestore || !user || activeTab !== 'suppliers') ? null : collection(firestore, 'users', user.uid, 'supplierPayments'), [firestore, user, activeTab]);

  const { data: rawFactures, isLoading: isFacturesLoading } = useCollection(facturesRef);
  const { data: rawArticles, isLoading: isArticlesLoading } = useCollection(articlesRef);
  const { data: rawGenCats, isLoading: isGenCatsLoading } = useCollection(genCatsRef);
  const { data: rawSubCats, isLoading: isSubCatsLoading } = useCollection(subCatsRef);
  const { data: rawPayments } = useCollection(paymentsRef); // no loading spinner — loads silently

  const factures = rawFactures || [];
  // Les achats du marché local (créés depuis /stock, ex: "dépannage" chez un vendeur local)
  // ne sont pas des arrivages import — ils ne doivent jamais apparaître dans /gestion.
  // Un brouillon de demande magasin n'est pas encore un besoin : il attend d'etre imprime, vise
  // par le commercial, puis envoye depuis /stock. Tant qu'il ne l'est pas, /gestion ne le voit pas.
  const rawArticles_ = (rawArticles || []).filter((a: any) => !isLocalMarketPurchaseArticle(a) && !estBrouillonMagasin(a));
  // Enrich articles with facture dates → computes effective status (TRANSIT/CUSTOMS/STOCK) automatically
  const articles = useEnrichedArticles(rawArticles_, factures);
  const generalCategories = rawGenCats || [];
  const subCategories = rawSubCats || [];
  const payments = rawPayments || [];

  // ─── Changements de statut d'arrivage : prévenir les clients, ou non ─────────────────
  // Rien ne part tout seul : le bandeau en haut de page demande pour chaque dossier.
  const annonces = useStatutsAAnnoncer({
    firestore,
    adminUid: user?.uid ?? null,
    factures,
    articles: rawArticles_, // use raw articles (not enriched) to read stored status
    enabled: !!user && !isFacturesLoading && !isArticlesLoading,
  });

  const resetToHome = () => {
    setActiveTab('dashboard'); setSelectedFactureId(null);
    setSelectedGeneralCategoryId(null); setSelectedCategoryName(null); setIsMobileMenuOpen(false);
  };
  // Le menu : quelques onglets seuls, le reste rangé par familles en listes déroulantes.
  type Onglet = { id: OngletAdmin; label: string; icon: React.ElementType };
  type Famille = { famille: string; icon: React.ElementType; onglets: Onglet[] };
  const menu: (Onglet | Famille)[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { famille: 'Commandes', icon: ClipboardList, onglets: [
      { id: 'to-order', label: 'Besoins', icon: ClipboardList },
      { id: 'pending', label: 'Production', icon: Factory },
    ] },
    { famille: 'Arrivages', icon: Anchor, onglets: [
      { id: 'factures', label: 'Arrivages', icon: Anchor },
      { id: 'timeline', label: 'Timeline', icon: Timer },
      { id: 'tableau-arrivages', label: 'Tableau Arrivages', icon: TableProperties },
    ] },
    { famille: 'Catalogue', icon: Layers, onglets: [
      { id: 'general-categories', label: 'Groupes', icon: Layers },
      { id: 'qualities', label: 'Qualités', icon: Sparkles },
    ] },
    { famille: 'Commercial', icon: Handshake, onglets: [
      { id: 'suppliers', label: 'Partenaires', icon: UserCheck },
      { id: 'demandes-clients', label: 'Demandes clients', icon: Inbox },
      { id: 'devis-pi', label: 'Devis Client', icon: ReceiptText },
    ] },
    { id: 'data', label: 'Data Lab', icon: Table2 },
    { famille: 'Finance', icon: Calculator, onglets: [
      { id: 'cost-analysis', label: 'Coût Revient', icon: Calculator },
      { id: 'history-revient', label: 'Hist. Revient', icon: History },
      { id: 'client-profitability', label: 'Rentabilité', icon: TrendingUp },
      { id: 'cost-sale', label: 'Coût Vente', icon: ShoppingCart },
      { id: 'dp', label: 'Déc. Prov.', icon: FileCheck },
      { id: 'reconciliation', label: 'Réconcil.', icon: TrendingUp },
      { id: 'simulateur', label: 'Simulateur', icon: Calculator },
    ] },
  ];

  const ouvrir = (id: OngletAdmin) => {
    setPreviousTab(null);
    setActiveTab(id);
    if (id === 'factures') setSelectedFactureId(null);
    if (id === 'general-categories') setSelectedGeneralCategoryId(null);
    setIsMobileMenuOpen(false);
  };

  const actif = 'bg-amber-500 text-white font-black shadow-md shadow-amber-500/10';
  const inactif = 'text-stone-500 hover:bg-stone-100 hover:text-stone-900';

  // Pastille des demandes clients pas encore vues, sur l'onglet et sur sa famille.
  const Pastille = ({ sur }: { sur: boolean }) => (
    <span aria-label={`${demandesNouvelles} nouvelle${demandesNouvelles > 1 ? 's' : ''}`} className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black ${sur ? 'bg-white/25 text-white' : 'bg-rose-500 text-white'}`}>{demandesNouvelles}</span>
  );
  const aPastille = (onglets: Onglet[]) => demandesNouvelles > 0 && onglets.some(o => o.id === 'demandes-clients');

  const BoutonOnglet = ({ o, vertical }: { o: Onglet; vertical: boolean }) => (
    <Button variant={activeTab === o.id ? 'secondary' : 'ghost'}
      className={`flex items-center gap-2 justify-start rounded-xl transition-all px-3 py-1.5 h-9 ${activeTab === o.id ? actif : inactif} ${vertical ? 'w-full h-11' : ''}`}
      onClick={() => ouvrir(o.id)}>
      <o.icon className={vertical ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      <span className={`truncate uppercase font-black tracking-wider ${vertical ? 'text-[11px]' : 'text-[10px]'}`}>{o.label}</span>
      {aPastille([o]) && <Pastille sur={activeTab === o.id} />}
    </Button>
  );

  const NavButtons = ({ vertical = false }: { vertical?: boolean }) => (
    <div className={`flex ${vertical ? 'flex-col space-y-1' : 'flex-row space-x-1 items-center'}`}>
      {menu.map(entree => {
        if (!('famille' in entree)) return <BoutonOnglet key={entree.id} o={entree} vertical={vertical} />;
        if (vertical) return (
          <React.Fragment key={entree.famille}>
            <div className="my-1 h-px bg-stone-100 mx-2" />
            <p className="px-3 text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">{entree.famille}</p>
            {entree.onglets.map(o => <BoutonOnglet key={o.id} o={o} vertical />)}
          </React.Fragment>
        );
        const dedans = entree.onglets.some(o => o.id === activeTab);
        return (
          <DropdownMenu key={entree.famille}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={`flex items-center gap-1.5 rounded-xl transition-all px-3 py-1.5 h-9 ${dedans ? actif : inactif}`}>
                <entree.icon className="w-3.5 h-3.5" />
                <span className="uppercase font-black tracking-wider text-[10px]">{entree.famille}</span>
                {aPastille(entree.onglets) && <Pastille sur={dedans} />}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl shadow-xl border-stone-100">
              {entree.onglets.map(o => (
                <DropdownMenuItem key={o.id} onClick={() => ouvrir(o.id)}
                  className={`flex items-center gap-2 rounded-lg cursor-pointer text-[11px] font-black uppercase tracking-wide ${activeTab === o.id ? 'bg-amber-50 text-amber-700' : ''}`}>
                  <o.icon className="w-3.5 h-3.5" />
                  {o.label}
                  {aPastille([o]) && <Pastille sur={false} />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="xl:hidden -ml-2 text-stone-900 relative"><Menu className="w-6 h-6" />{demandesNouvelles > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />}</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-0 border-r border-stone-100">
                <SheetHeader className="bg-stone-900 p-6 text-left">
                  <SheetTitle className="text-xl font-black tracking-tighter text-white uppercase">STOCK<span className="text-amber-500">VUE</span></SheetTitle>
                </SheetHeader>
                <div className="p-4 space-y-2">
                  <NavButtons vertical />
                  <div className="pt-2 border-t border-stone-100">
                    <Button
                      onClick={() => { setIsOrderModalOpen(true); setIsMobileMenuOpen(false); }}
                      className="w-full bg-stone-900 hover:bg-black text-white h-11 rounded-xl gap-2 text-[10px] uppercase font-black tracking-widest"
                    >
                      <Plus className="w-4 h-4" /> Nouveau Produit
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <button onClick={resetToHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl font-black tracking-tighter text-stone-900 uppercase">STOCK<span className="text-amber-500">VUE</span></span>
            </button>
            <div className="h-6 w-px bg-stone-200 hidden xl:block" />
            <div className="hidden xl:flex items-center space-x-1"><NavButtons /></div>
          </div>
          <div className="flex items-center space-x-2">
            <Button size="sm" onClick={() => setIsOrderModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-3 py-2 h-9 rounded-xl shadow-lg flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest whitespace-nowrap">
              <Plus className="w-3.5 h-3.5 shrink-0" /><span>Nouveau Produit</span>
            </Button>
            {/* Global notification channel toggle */}
            <button
              onClick={cycleChannel}
              title={`Notifications : ${globalNotifyChannel === 'email' ? 'Email' : globalNotifyChannel === 'whatsapp' ? 'WhatsApp' : 'Email + WhatsApp'}\nCliquer pour changer`}
              className={`h-9 px-3 rounded-xl border font-black text-[11px] transition-all ${
                globalNotifyChannel === 'whatsapp' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
                globalNotifyChannel === 'both' ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' :
                'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {channelLabel}
            </button>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50 shrink-0">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Le tableau des arrivages prend toute la largeur de l'écran : il a plus de trente colonnes. */}
      <main className={`flex-grow mx-auto px-6 py-8 w-full ${activeTab === 'tableau-arrivages' ? 'max-w-none' : 'max-w-[1600px]'}`}>
        {/* Only block on the 4 core collections — payments loads silently in background */}
        {(isFacturesLoading || isArticlesLoading || isGenCatsLoading || isSubCatsLoading) ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <Loader2 className="animate-spin text-amber-500 w-12 h-12" />
            <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Synchronisation flux logistique...</p>
          </div>
        ) : (
          <div className="fade-in">
            <StatutsAAnnoncerBandeau {...annonces} />
            <div className={activeTab === 'dashboard' ? 'block animate-in fade-in' : 'hidden'}>
              <DashboardView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} onNavigate={setActiveTab} onNavigateToFacture={(id) => { setPreviousTab(activeTab); setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} />
            </div>
            <div className={activeTab === 'to-order' ? 'block animate-in fade-in' : 'hidden'}>
              <ToOrderView articles={articles} factures={factures} onEdit={setEditingArticle} />
            </div>
            <div className={activeTab === 'pending' ? 'block animate-in fade-in' : 'hidden'}>
              <PendingOrdersView articles={articles} factures={factures} generalCategories={generalCategories} onEdit={setEditingArticle} />
            </div>
            <div className={activeTab === 'timeline' ? 'block animate-in fade-in' : 'hidden'}>
              <TimelineView articles={articles} factures={factures} onNavigateToFacture={(id) => { setPreviousTab(activeTab); setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} />
            </div>
            <div className={activeTab === 'factures' ? 'block animate-in fade-in' : 'hidden'}>
              <FacturesView actif={activeTab === 'factures'} articles={articles} factures={factures} subCategories={subCategories} generalCategories={generalCategories} selectedFactureId={selectedFactureId} setSelectedFactureId={setSelectedFactureId} onNavigateToCategory={(c) => { setPreviousTab('factures'); setSelectedCategoryName(c); setActiveTab('categories'); }} onBack={() => { setSelectedFactureId(null); if (previousTab) { setActiveTab(previousTab); setPreviousTab(null); } }} onVueTableau={() => { setPreviousTab(null); setActiveTab('tableau-arrivages'); }} />
            </div>
            <div className={activeTab === 'tableau-arrivages' ? 'block animate-in fade-in' : 'hidden'}>
              <TableauArrivagesView
                actif={activeTab === 'tableau-arrivages'}
                articles={articles}
                factures={factures}
                subCategories={subCategories}
                onOuvrirDossier={(id) => { setPreviousTab('tableau-arrivages'); setSelectedFactureId(id); setActiveTab('factures'); }}
                onModifierArticle={setEditingArticle}
                onVueCartes={() => { setPreviousTab(null); setSelectedFactureId(null); setActiveTab('factures'); }}
              />
            </div>
            <div className={activeTab === 'general-categories' ? 'block animate-in fade-in' : 'hidden'}>
              <GeneralCategoriesView articles={articles} generalCategories={generalCategories} subCategories={subCategories} onSelectGeneralCategory={(id) => { setPreviousTab(activeTab); setSelectedGeneralCategoryId(id); setActiveTab(id ? 'categories' : 'general-categories'); }} onManageQualities={(specType, poleId) => { setQualitiesFocus({ specType, poleId }); setActiveTab('qualities'); }} />
            </div>
            <div className={activeTab === 'qualities' ? 'block animate-in fade-in' : 'hidden'}>
              <QualitiesManagerView generalCategories={generalCategories} subCategories={subCategories} initialSpecType={qualitiesFocus?.specType ?? null} highlightPoleId={qualitiesFocus?.poleId ?? null} />
            </div>
            <div className={activeTab === 'categories' ? 'block animate-in fade-in' : 'hidden'}>
              <CategoriesView articles={articles} factures={factures} generalCategories={generalCategories} subCategories={subCategories} selectedCategory={selectedCategoryName} setSelectedCategory={setSelectedCategoryName} selectedGeneralCategoryId={selectedGeneralCategoryId} onSelectGeneralCategory={(id) => { setSelectedGeneralCategoryId(id); if (!id) { if (previousTab) setActiveTab(previousTab); else setActiveTab('general-categories'); setPreviousTab(null); } else { setActiveTab('categories'); } }} onBackToGroupes={() => { setSelectedCategoryName(null); if (previousTab === 'factures') { setActiveTab('factures'); setPreviousTab(null); } }} />
            </div>
            <div className={activeTab === 'cost-analysis' ? 'block animate-in fade-in' : 'hidden'}>
              <CostAnalysisView articles={articles} factures={factures} subCategories={subCategories} />
            </div>
            <div className={activeTab === 'simulateur' ? 'block animate-in fade-in' : 'hidden'}>
              <SimulateurRevientView articles={articles} factures={factures} subCategories={subCategories} />
            </div>
            <div className={activeTab === 'history-revient' ? 'block animate-in fade-in' : 'hidden'}>
              <HistoryRevientView articles={articles} factures={factures} subCategories={subCategories} />
            </div>
            <div className={activeTab === 'cost-sale' ? 'block animate-in fade-in' : 'hidden'}>
              <CostSaleView articles={articles} factures={factures} subCategories={subCategories} generalCategories={generalCategories} />
            </div>
            <div className={activeTab === 'dp' ? 'block animate-in fade-in' : 'hidden'}>
              <DPView articles={articles} factures={factures} subCategories={subCategories} generalCategories={generalCategories} />
            </div>
            <div className={activeTab === 'reconciliation' ? 'block animate-in fade-in' : 'hidden'}>
              <ReconciliationView factures={factures} articles={articles} subCategories={subCategories} generalCategories={generalCategories} />
            </div>
            <div className={activeTab === 'devis-pi' ? 'block animate-in fade-in' : 'hidden'}>
              <DevisPIView articles={articles} factures={factures} categories={subCategories} />
            </div>
            <div className={activeTab === 'client-profitability' ? 'block animate-in fade-in' : 'hidden'}>
              <ClientProfitabilityView articles={articles} />
            </div>
            <div className={activeTab === 'suppliers' ? 'block animate-in fade-in' : 'hidden'}>
              <SuppliersView articles={articles} factures={factures} payments={payments} categories={subCategories} onNavigateToFacture={(id) => { setPreviousTab(activeTab); setSelectedFactureId(id); setActiveTab('factures'); setIsMobileMenuOpen(false); }} />
            </div>
            <div className={activeTab === 'data' ? 'block animate-in fade-in' : 'hidden'}>
              <DataView articles={articles} onEdit={setEditingArticle} />
            </div>
            {/* Toujours montée : elle se rafraîchit chaque minute et tient la pastille du menu à jour. */}
            <div className={activeTab === 'demandes-clients' ? 'block animate-in fade-in' : 'hidden'}>
              <DemandesClientsView actif={activeTab === 'demandes-clients'} onNouvelles={setDemandesNouvelles} />
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-stone-200 bg-white py-6">
        <div className="max-w-[1600px] mx-auto px-6 flex justify-between items-center text-stone-400 text-[9px] font-black uppercase tracking-[0.2em]">
          <p>© 2024 STOCKVUE LOGISTICS ENGINE</p>
          <div className="flex items-center gap-6">
            <Button size="sm" onClick={() => exportGlobalPackingPDF(articles, generalCategories, subCategories)} variant="outline" className="h-8 px-3 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 text-[9px] uppercase font-black tracking-widest shadow-sm transition-all duration-300">
              <FileDown className="w-3.5 h-3.5 shrink-0" /> <span>Export Global Packing</span>
            </Button>
            <span className="text-stone-300">CORE VERSION 2.8.5</span>
          </div>
        </div>
      </footer>

      <AddOrderModal open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen} />
      {/* EditOrderModal — only mounted when actually editing an article */}
      {editingArticle && (
        <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
      )}
    </div>
  );
}
