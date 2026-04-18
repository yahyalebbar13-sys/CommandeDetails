"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ClientDetailView } from '@/components/suppliers-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, LogOut, Package } from 'lucide-react';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// ── Isolated Firebase app — completely separate from admin session ──────────
function getClientApp() {
  const name = 'clientPortal';
  return getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
}

// ── Types ──────────────────────────────────────────────────────────────────
type PortalState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'checking' }
  | { status: 'portal'; clientName: string; adminUid: string }
  | { status: 'error'; message: string };

// ── Main component ─────────────────────────────────────────────────────────
export default function ClientPortalPage() {
  const [state, setState] = useState<PortalState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [articles, setArticles] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const authRef = useRef<ReturnType<typeof getAuth> | null>(null);
  const dbRef = useRef<ReturnType<typeof getFirestore> | null>(null);

  // Init isolated Firebase + watch auth state
  useEffect(() => {
    const app = getClientApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    authRef.current = auth;
    dbRef.current = db;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: 'login' });
        return;
      }
      setState({ status: 'checking' });
      try {
        const snap = await getDoc(doc(db, 'clientAccess', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setState({
            status: 'portal',
            clientName: data.clientName,
            adminUid: data.adminUid,
          });
        } else {
          await signOut(auth);
          setState({ status: 'error', message: "Ce compte n'est pas autorisé pour le portail client." });
        }
      } catch {
        await signOut(auth);
        setState({ status: 'error', message: "Erreur de vérification. Veuillez réessayer." });
      }
    });

    return () => unsub();
  }, []);

  // Load client data once authenticated
  useEffect(() => {
    if (state.status !== 'portal' || !dbRef.current) return;
    const { adminUid } = state as { status: 'portal'; clientName: string; adminUid: string };
    const db = dbRef.current;
    setDataLoading(true);
    Promise.all([
      getDocs(collection(db, 'users', adminUid, 'articles')),
      getDocs(collection(db, 'users', adminUid, 'factures')),
      getDocs(collection(db, 'users', adminUid, 'categories')),
    ])
      .then(([artSnap, facSnap, catSnap]) => {
        setArticles(artSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setFactures(facSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setCategories(catSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
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

  // ── Loading / checking ────────────────────────────────────────────────
  if (state.status === 'loading' || state.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
          <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">
            {state.status === 'checking' ? 'Vérification...' : 'Chargement...'}
          </p>
        </div>
      </div>
    );
  }

  // ── Login form ────────────────────────────────────────────────────────
  if (state.status === 'login' || state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F6F0] p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-200 mb-4">
              <Package className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-stone-900 uppercase">
              STOCK<span className="text-indigo-600">VUE</span>
            </h1>
            <p className="text-stone-400 text-[11px] font-bold uppercase tracking-widest mt-1">
              Portail Client
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
            <div className="bg-indigo-900 p-6 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-indigo-700 rounded-xl mb-3">
                <Lock className="w-5 h-5 text-indigo-200" />
              </div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">
                Accès Espace Client
              </h2>
              <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest mt-1">
                Consultez vos précommandes en temps réel
              </p>
            </div>

            <form onSubmit={handleLogin} className="p-8 space-y-5">
              {(state.status === 'error' || loginError) && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[10px] text-red-600 font-bold text-center uppercase tracking-wide">
                  {loginError || state.message}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                  Adresse Email
                </Label>
                <Input
                  type="email"
                  required
                  placeholder="votre@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-12 border-stone-200 font-bold rounded-xl"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                  Mot de Passe
                </Label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-12 border-stone-200 font-bold rounded-xl"
                />
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full h-12 bg-indigo-700 hover:bg-indigo-800 text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-indigo-200"
              >
                {loginLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Accéder à Mon Espace'
                )}
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

  // ── Portal view ───────────────────────────────────────────────────────
  const { clientName } = state as { status: 'portal'; clientName: string; adminUid: string };
  return (
    <div className="min-h-screen flex flex-col bg-[#F9F6F0] font-sans">
      {/* Navbar */}
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
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
              Espace Client
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">
                {clientName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-stone-400 hover:text-red-600 h-9 w-9 rounded-xl hover:bg-red-50 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Data */}
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
              clientName={clientName}
              articles={articles}
              factures={factures}
              categories={categories}
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
