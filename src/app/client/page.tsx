"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ClientDetailView } from '@/components/suppliers-view';
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="8" width="24" height="16" rx="2" fill="none" stroke="#c4a062" strokeWidth="1.5"/>
                <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#c4a062" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="14" cy="16" r="2" fill="#c4a062"/>
              </svg>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#0f172a] animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-lg tracking-widest uppercase">LEBTEX</p>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mt-1">
              {state.status === 'checking' ? 'Vérification en cours...' : 'Connexion...'}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-[#c4a062] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (state.status === 'login' || state.status === 'error') {
    return (
      <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        {/* Left panel — branding */}
        <div className="hidden lg:flex flex-1 flex-col justify-between p-16 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #c4a062, transparent)' }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

          {/* Logo */}
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#c4a062]/30" style={{ background: 'rgba(196,160,98,0.15)' }}>
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="8" width="24" height="16" rx="2" fill="none" stroke="#c4a062" strokeWidth="1.5"/>
                <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#c4a062" strokeWidth="1.5" strokeLinecap="round"/>
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
              <h2 className="text-white font-black text-2xl tracking-tight">Connexion</h2>
              <p className="text-white/40 text-sm mt-1 font-medium">Entrez vos identifiants pour accéder à votre espace.</p>
            </div>

            {(state.status === 'error' || loginError) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-red-400 text-xs font-black">!</span>
                </div>
                <p className="text-red-300 text-[11px] font-bold leading-relaxed">
                  {loginError || (state.status === 'error' ? state.message : '')}
                </p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">
                  Adresse Email
                </label>
                <Input
                  type="email"
                  required
                  placeholder="votre@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  className="h-13 border-0 text-white placeholder:text-white/20 font-medium rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.07)', outline: 'none' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">
                  Mot de Passe
                </label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-13 border-0 text-white placeholder:text-white/20 font-medium rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.07)' }}
                />
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
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Compute containers currently in transit
  const transitContainers = (() => {
    const TRANSIT_STATUSES = new Set(['TRANSIT', 'SHIPPED']);
    const seen = new Set<string>();
    const result: { factureId: string; bl: string | null; shippingLine: string | null }[] = [];
    articles.forEach((a: any) => {
      if (!a.factureId || !TRANSIT_STATUSES.has(a.status)) return;
      if (seen.has(a.factureId)) return;
      seen.add(a.factureId);
      const fac = factures.find((f: any) => f.id === a.factureId);
      result.push({
        factureId: a.factureId,
        bl: fac?.noBL || a.factureNoBL || null,
        shippingLine: fac?.shippingLine || null,
      });
    });
    return result;
  })();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f5f7' }}>
      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-stone-200/80 sticky top-0 z-50" style={{ boxShadow: '0 1px 20px rgba(0,0,0,0.06)' }}>
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#c4a062]/30" style={{ background: 'rgba(196,160,98,0.12)' }}>
                <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="8" width="24" height="16" rx="2" fill="none" stroke="#c4a062" strokeWidth="2"/>
                  <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#c4a062" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="14" cy="16" r="2" fill="#c4a062"/>
                </svg>
              </div>
              <div>
                <p className="text-stone-900 font-black text-sm tracking-wider leading-none">LEBTEX</p>
                <p className="text-[#c4a062] text-[8px] font-black uppercase tracking-widest leading-none mt-0.5">Textile Import</p>
              </div>
            </div>
            <div className="hidden sm:block h-5 w-px bg-stone-200" />
            <div className="hidden sm:flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-stone-500 text-[9px] font-black uppercase tracking-widest">Portail Client</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Client badge */}
            <div className="flex items-center gap-2 bg-slate-900 rounded-full px-4 py-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0" style={{ background: '#c4a062' }}>
                {clientName.charAt(0).toUpperCase()}
              </div>
              <span className="text-white text-[10px] font-black uppercase tracking-widest hidden sm:block">{clientName}</span>
            </div>
            {/* Logout */}
            <button
              onClick={handleLogout}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO BANNER ────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }} className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-[600px] h-[300px] rounded-full blur-[100px]" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[200px] rounded-full blur-[80px]" style={{ background: 'radial-gradient(circle, #c4a062, transparent)' }} />
        </div>
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-[#c4a062] text-[10px] font-black uppercase tracking-[0.3em] mb-2">Bienvenue sur votre espace</p>
              <h1 className="text-white font-black text-4xl uppercase tracking-tight leading-none">
                {clientName}
              </h1>
              <p className="text-white/40 text-xs font-medium mt-2 capitalize">{today}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 backdrop-blur-sm shrink-0">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Données synchronisées</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── INSTALL APP BANNER ─────────────────────────────── */}
      {showInstallBanner && !isStandalone && (
        <div className="bg-emerald-600 border-b border-emerald-700 p-3 sm:p-4 text-white">
          <div className="max-w-[1400px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <p className="font-bold text-sm">Installez l'application LEBTEX</p>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {isIOS 
                    ? "Appuyez sur 'Partager' puis 'Sur l'écran d'accueil' pour recevoir les notifications de vos commandes."
                    : "Accédez rapidement à vos commandes et recevez des notifications push en direct."}
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

      {/* ── TRANSIT NOTIFICATION BANNER ─────────────────────────────── */}
      {showNewFeature && transitContainers.length > 0 && (
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(90deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)' }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, white, transparent)' }} />
            <div className="absolute -bottom-6 right-16 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white, transparent)' }} />
          </div>
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Ship className="w-4 h-4 text-white" />
              </div>
              <p className="text-white text-[11px] font-bold">
                🚢{' '}
                <span className="font-black">
                  {transitContainers.length === 1
                    ? '1 commande'
                    : `${transitContainers.length} commandes`}
                </span>
                {' '}actuellement en transit —{' '}
                <span className="hidden sm:inline">Cliquez sur </span>
                <span className="font-black underline underline-offset-2 decoration-white/40">«&nbsp;Suivre le B/L&nbsp;»</span>
                <span className="hidden sm:inline"> pour suivre en temps réel.</span>
              </p>
            </div>
            <button
              onClick={() => setShowNewFeature(false)}
              className="shrink-0 w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
      <main className="flex-grow max-w-[1400px] mx-auto px-6 py-8 w-full">
        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
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
          <div className="flex flex-col items-center justify-center py-40 space-y-4">
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

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white mt-8">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center border border-[#c4a062]/30" style={{ background: 'rgba(196,160,98,0.1)' }}>
              <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="8" width="24" height="16" rx="2" fill="none" stroke="#c4a062" strokeWidth="2"/>
                <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#c4a062" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="14" cy="16" r="2" fill="#c4a062"/>
              </svg>
            </div>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest">© 2025 LEBTEX Textile Import</p>
          </div>
          <div className="flex items-center gap-2 text-stone-300 text-[10px] font-bold uppercase tracking-widest">
            <Lock className="w-3 h-3" />
            <span>Portail Privé — Accès Sécurisé</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
