"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ClientPortalApp } from '@/components/client-portal-app';
import { Input } from '@/components/ui/input';
import { Loader2, Lock, LogOut, ShieldCheck, ArrowRight, RefreshCw, Ship, X, Sparkles } from 'lucide-react';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

function getClientApp() {
  const name = 'clientPortal';
  return getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
}

type PortalState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'checking' }
  | { status: 'portal'; clientName: string; adminUid: string }
  | { status: 'error'; message: string };

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
  const [dataError, setDataError] = useState(false);
  const [showNewFeature, setShowNewFeature] = useState(true);

  // PWA states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const prevArticlesRef = useRef<any[]>([]);

  const authRef = useRef<ReturnType<typeof getAuth> | null>(null);
  const dbRef = useRef<ReturnType<typeof getFirestore> | null>(null);

  useEffect(() => {
    const app = getClientApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    authRef.current = auth;
    dbRef.current = db;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setState({ status: 'login' }); return; }
      setState({ status: 'checking' });
      try {
        const snap = await getDoc(doc(db, 'clientAccess', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setState({ status: 'portal', clientName: data.clientName, adminUid: data.adminUid });
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      setIsIOS(ios);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
      setIsStandalone(standalone);

      if (ios && !standalone) {
        setShowInstallBanner(true);
      }

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowInstallBanner(true);
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/client-sw.js')
          .then(reg => console.log('Client SW registered'))
          .catch(err => console.error('SW init error', err));
      }
    }
  }, []);

  useEffect(() => {
    if (state.status !== 'portal' || !dbRef.current) return;
    const { adminUid } = state as { status: 'portal'; clientName: string; adminUid: string };
    const db = dbRef.current;
    if (!adminUid || adminUid.length < 10 || adminUid.includes('/')) {
      setState({ status: 'error', message: 'Configuration invalide. Contactez votre administrateur.' });
      return;
    }
    setDataLoading(true);
    setDataError(false);

    // ── Real-time listeners so the portal updates instantly when admin changes status ──
    let artLoaded = false, facLoaded = false, catLoaded = false;
    const checkDone = () => { if (artLoaded && facLoaded && catLoaded) setDataLoading(false); };

    const unsubArt = onSnapshot(
      collection(db, 'users', adminUid, 'articles'),
      (snap) => { 
        const newArticles = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        
        // Notifications push
        if (artLoaded && 'serviceWorker' in navigator && Notification.permission === 'granted') {
          newArticles.forEach(na => {
            const oa = prevArticlesRef.current.find(a => a.id === na.id);
            if (oa && oa.status !== na.status) {
              navigator.serviceWorker.ready.then(reg => {
                reg.active?.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  payload: {
                    title: `Mise à jour : ${na.name || na.categoryId || 'Commande'}`,
                    body: `Le statut est passé à : ${na.status}`,
                  }
                });
              });
            }
          });
        }
        
        prevArticlesRef.current = newArticles;
        setArticles(newArticles); 
        artLoaded = true; 
        checkDone(); 
      },
      () => { setDataLoading(false); setDataError(true); }
    );
    const unsubFac = onSnapshot(
      collection(db, 'users', adminUid, 'factures'),
      (snap) => { setFactures(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))); facLoaded = true; checkDone(); },
      () => {}
    );
    const unsubCat = onSnapshot(
      collection(db, 'users', adminUid, 'categories'),
      (snap) => { setCategories(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))); catLoaded = true; checkDone(); },
      () => {}
    );

    return () => { unsubArt(); unsubFac(); unsubCat(); };
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

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  // Request notification permission once portal is loaded
  useEffect(() => {
    if (state.status === 'portal' && isStandalone) {
      requestNotificationPermission();
    }
  }, [state.status, isStandalone]);

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (state.status === 'loading' || state.status === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-white border border-stone-200 flex items-center justify-center shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#c4a062' }} />
          </div>
          {state.status === 'checking' && (
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-[#F9F6F0] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
        <div className="text-center">
          <p className="text-stone-700 font-black text-sm uppercase tracking-widest">Initialisation</p>
          <p className="text-stone-400 text-xs font-medium mt-1">Connexion sécurisée en cours...</p>
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] p-6">
        <div className="bg-white border border-red-100 rounded-3xl p-10 max-w-sm w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <p className="text-stone-900 font-black text-sm uppercase tracking-widest mb-2">Accès refusé</p>
          <p className="text-stone-400 text-xs font-medium leading-relaxed mb-8">{state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full h-11 bg-stone-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (state.status === 'login') {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-white">
        {/* Left panel — visual */}
        <div className="lg:w-[55%] relative overflow-hidden flex flex-col p-12 lg:p-20" style={{ background: '#0f172a' }}>
          {/* Decorative background */}
          <div className="absolute top-0 right-0 w-full h-full opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, #6366f1 0%, transparent 50%), radial-gradient(circle at 0% 100%, #c4a062 0%, transparent 50%)' }} />
          
          {/* Brand header */}
          <div className="relative z-10 flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#c4a062]/30" style={{ background: 'rgba(196,160,98,0.15)' }}>
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="8" width="24" height="16" rx="2" fill="none" stroke="#c4a062" strokeWidth="2"/>
                <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#c4a062" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="14" cy="16" r="2" fill="#c4a062"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-lg tracking-wider">LEBTEX</p>
              <p className="text-[#c4a062] text-[9px] font-bold uppercase tracking-[0.25em]">Textile Import</p>
            </div>
          </div>

          {/* Center content */}
          <div className="relative z-10 space-y-8">
            <div>
              <p className="text-[#c4a062] text-[11px] font-black uppercase tracking-[0.3em] mb-4">Portail Client Exclusif</p>
              <h1 className="text-5xl font-black text-white leading-tight">
                Suivez vos<br/>
                <span style={{ color: '#c4a062' }}>commandes</span><br/>
                en temps réel.
              </h1>
              <p className="text-white/40 mt-6 font-medium leading-relaxed max-w-sm">
                Accédez à l'ensemble de vos précommandes, statuts de livraison et informations logistiques depuis un espace sécurisé et dédié.
              </p>
            </div>

            {/* Feature pills */}
            <div className="flex flex-col gap-3">
              {[
                { icon: '🚢', label: 'Suivi en transit & douanes' },
                { icon: '📦', label: 'Statut de vos articles en temps réel' },
                { icon: '📅', label: 'Dates d\'arrivée prévisionnelles' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-sm">
                  <span className="text-lg">{f.icon}</span>
                  <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="relative z-10 flex items-center gap-2 text-white/20 text-[10px] font-bold uppercase tracking-[0.2em]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Accès sécurisé & confidentiel</span>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 lg:max-w-md flex items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8">
            {/* Mobile logo */}
            <div className="lg:hidden text-center">
              <p className="text-white font-black text-2xl tracking-wider">LEBTEX</p>
              <p className="text-[#c4a062] text-[10px] font-bold uppercase tracking-[0.25em] mt-1">Portail Client</p>
            </div>

            <div>
              <h2 className="text-2xl font-black text-stone-900 tracking-tight">Connexion</h2>
              <p className="text-stone-400 text-sm mt-1">Entrez vos identifiants pour accéder à vos suivis.</p>
            </div>

            {loginError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold flex items-start gap-3 border border-red-100">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{loginError}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-900 uppercase tracking-widest ml-1">Email professionnel</label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@entreprise.com"
                    className="h-12 bg-stone-50 border-stone-200 focus-visible:ring-[#c4a062]"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-stone-900 uppercase tracking-widest">Mot de passe</label>
                  </div>
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 bg-stone-50 border-stone-200 focus-visible:ring-[#c4a062]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full h-13 rounded-xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #c4a062, #a8845a)', color: '#0f172a' }}
              >
                {loginLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Accéder à Mon Espace <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-white/20 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <Lock className="w-3 h-3" /> Connexion chiffrée — Données confidentielles
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── PORTAL ────────────────────────────────────────────────────────────────
  const { clientName } = state as { status: 'portal'; clientName: string; adminUid: string };

  return (
    <>
      {showInstallBanner && !isStandalone && (
        <div className="bg-emerald-600 border-b border-emerald-700 p-3 sm:p-4 text-white z-50 relative">
          <div className="max-w-[1400px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <p className="font-bold text-sm">Installez l'application LEBTEX</p>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {isIOS 
                    ? "Appuyez sur 'Partager' puis 'Sur l'écran d'accueil' pour recevoir les notifications."
                    : "Accédez rapidement à vos commandes et recevez des notifications en direct."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!isIOS && (
                <button
                  onClick={handleInstallClick}
                  className="flex-1 sm:flex-none bg-white text-emerald-700 hover:bg-emerald-50 font-black text-xs uppercase px-5 py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  Installer
                </button>
              )}
              <button
                onClick={() => setShowInstallBanner(false)}
                className="p-2.5 rounded-lg hover:bg-emerald-700/50 transition-colors"
              >
                <X className="w-4 h-4 text-emerald-200" />
              </button>
            </div>
          </div>
        </div>
      )}

      {dataLoading ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] space-y-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-white border border-stone-200 flex items-center justify-center shadow-xl">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#c4a062' }} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-stone-700 font-black text-sm uppercase tracking-widest">Chargement de vos commandes</p>
            <p className="text-stone-400 text-xs font-medium mt-1">Récupération des données en cours...</p>
          </div>
        </div>
      ) : dataError ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] space-y-4">
          <div className="bg-white border border-red-100 rounded-3xl p-10 text-center max-w-sm shadow-xl">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-stone-900 font-black text-sm uppercase tracking-widest mb-2">Erreur de chargement</p>
            <p className="text-stone-400 text-xs font-medium leading-relaxed">Vérifiez votre connexion et rechargez la page.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full h-11 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 text-white transition-all"
              style={{ background: '#0f172a' }}
            >
              <RefreshCw className="w-4 h-4" /> Recharger
            </button>
          </div>
        </div>
      ) : (
        <div className="fade-in min-h-screen">
          <ClientPortalApp
            clientName={clientName}
            articles={articles}
            factures={factures}
            categories={categories}
            onLogout={handleLogout}
          />
        </div>
      )}
    </>
  );
}
