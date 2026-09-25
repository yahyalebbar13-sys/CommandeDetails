"use client";

// ─── Espace client : connexion et données ─────────────────────────────────────
// Le navigateur du client ne lit plus la base. Il lisait jusqu'ici, en direct,
// TOUS les articles et dossiers d'arrivage de l'administrateur (ceux de tous
// les clients, avec prix d'achat et fournisseurs) : n'importe quel client
// pouvait tout voir avec les outils du navigateur. Désormais, une fois
// connecté, il appelle GET /api/client/portail et GET /api/client/demandes :
// le serveur vérifie son jeton, choisit SES commandes et n'en renvoie que ce
// qu'il a le droit de voir (cf. lib/portail-client-donnees.ts).
//
// Les données se rafraîchissent toutes les minutes, au retour sur la fenêtre
// et quand l'onglet redevient visible. Une panne passagère ne vide jamais
// l'écran : on garde les dernières données reçues.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientPortalApp } from '@/components/client-portal-app';
import { ETAPES_CLIENT, etapeClient, phraseEtape, rangEtape, titreEtape } from '@/lib/statut-client';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import type { DemandeEnregistree, DemandeSaisie } from '@/lib/demandes-client';
import { Input } from '@/components/ui/input';
import { Loader2, Lock, ShieldCheck, ArrowRight, RefreshCw, X, Sparkles, WifiOff } from 'lucide-react';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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
  // Accès vérifié impossible (réseau) : le client reste connecté et peut réessayer.
  | { status: 'hors_ligne' }
  // Accès refusé : pas de fiche clientAccess, ou le serveur a répondu 403.
  | { status: 'error'; message: string };

/** Ce que renvoie GET /api/client/portail. */
type Portail = {
  client: string;
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  contact: { whatsapp?: string };
  genereLe?: string;
};

/** Rafraîchissement régulier, onglet visible. */
const RAFRAICHIR_MS = 60_000;
/** Onglet caché (ordinateur) : plus rarement — chaque appel relit la base côté serveur. */
const RAFRAICHIR_CACHE_MS = 5 * 60_000;
/** « focus » et « visibilitychange » arrivent ensemble : un seul appel. */
const ECART_MIN_MS = 5_000;

/** Une réponse d'erreur du serveur, avec son code (401, 403…). */
class ErreurServeur extends Error {
  constructor(public statut: number, message: string) { super(message); }
}

const lireJson = async (r: Response): Promise<any> => {
  try { return await r.json(); } catch { return {}; }
};

/** Le code d'une erreur Firebase (« auth/too-many-requests », « unavailable »…), s'il y en a un. */
const codeErreur = (e: unknown): string =>
  e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '';

/**
 * Le message de connexion selon ce qui a échoué : un réseau coupé ou trop
 * d'essais ne sont pas un mauvais mot de passe. Tout autre refus (identifiants
 * faux, adresse mal écrite…) garde le message habituel.
 */
function messageConnexion(e: unknown): string {
  switch (codeErreur(e)) {
    case 'auth/network-request-failed':
      return 'Connexion impossible : vérifiez votre connexion internet, puis réessayez.';
    case 'auth/too-many-requests':
      return "Trop d'essais : patientez quelques minutes, puis réessayez.";
    case 'auth/user-disabled':
      return 'Ce compte est désactivé. Contactez votre commercial LEBTEX.';
    default:
      return 'Adresse e-mail ou mot de passe incorrect.';
  }
}

/** Mot de passe oublié : on écrit à LEBTEX sur WhatsApp, message déjà rédigé. */
const WHATSAPP_MDP_OUBLIE = `https://wa.me/212760998347?text=${encodeURIComponent(
  'Bonjour LEBTEX, j’ai oublié le mot de passe de mon espace client. Pouvez-vous m’aider à retrouver l’accès, s’il vous plaît ?',
)}`;

/** Affiche une notification par le service worker de l'espace client, si le client l'a permis. */
function notifier(titre: string, corps: string, tag: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  navigator.serviceWorker.ready
    .then(reg => reg.active?.postMessage({ type: 'SHOW_NOTIFICATION', payload: { title: titre, body: corps, tag } }))
    .catch(() => undefined);
}

/** « Taffetas, Fermetures n°5 et 2 autres ». */
function nomsCourts(commandes: CommandeClient[]): string {
  const noms = commandes.map(c => c.nom || 'votre commande');
  if (noms.length <= 2) return noms.join(' et ');
  const reste = noms.length - 2;
  return `${noms.slice(0, 2).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`;
}

/**
 * Prévient le client des commandes qui ont AVANCÉ d'une étape depuis le
 * dernier rafraîchissement (même identifiant, étape plus loin dans le
 * parcours). Une correction en arrière n'est pas annoncée : elle troublerait
 * plus qu'elle n'informerait. Plusieurs commandes qui passent ensemble à la
 * même étape (un conteneur qui arrive) font une seule notification.
 */
function annoncerEtapes(avant: Map<string, string>, commandes: CommandeClient[]) {
  const parEtape = new Map<string, CommandeClient[]>();
  for (const c of commandes) {
    const ancien = avant.get(c.id);
    if (ancien === undefined) continue;
    const de = rangEtape(etapeClient(ancien));
    const a = rangEtape(etapeClient(c.statut));
    if (a <= de) continue;
    const cle = ETAPES_CLIENT[a].id;
    parEtape.set(cle, [...(parEtape.get(cle) || []), c]);
  }
  for (const [etape, liste] of parEtape) {
    const statut = liste[0].statut;
    if (liste.length === 1) {
      notifier(`${titreEtape(statut)} : ${liste[0].nom || 'votre commande'}`, phraseEtape(statut), `commande-${liste[0].id}`);
    } else {
      notifier(`${titreEtape(statut)} : ${liste.length} commandes`, `${nomsCourts(liste)}.`, `etape-${etape}`);
    }
  }
}

/** Prévient le client quand LEBTEX répond à une demande, ou la traite. */
function annoncerDemandes(avant: Map<string, { statut: string; reponse: string }>, demandes: DemandeEnregistree[]) {
  for (const d of demandes) {
    const ancienne = avant.get(d.id);
    if (!ancienne) continue;
    const reponse = String(d.reponse || '').trim();
    if (reponse && reponse !== ancienne.reponse) {
      notifier('Réponse de LEBTEX à votre demande', reponse.length > 140 ? `${reponse.slice(0, 140)}…` : reponse, `demande-${d.id}`);
    } else if (d.statut === 'traitee' && ancienne.statut !== 'traitee') {
      notifier('Votre demande a été traitée', 'Retrouvez le détail dans « Mes demandes ».', `demande-${d.id}`);
    }
  }
}

export default function ClientPortalPage() {
  const [state, setState] = useState<PortalState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [portail, setPortail] = useState<Portail | null>(null);
  const [demandes, setDemandes] = useState<DemandeEnregistree[]>([]);
  // Tant qu'aucune donnée n'est arrivée : écran de chargement, ou d'erreur si le premier appel a échoué.
  const [dataError, setDataError] = useState(false);

  // PWA states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const authRef = useRef<ReturnType<typeof getAuth> | null>(null);
  const dbRef = useRef<ReturnType<typeof getFirestore> | null>(null);

  // Chaque session (connexion, déconnexion) a son numéro : une réponse arrivée
  // après une déconnexion appartient à l'ancienne session, on l'ignore.
  const generationRef = useRef(0);
  const enCoursRef = useRef<{ generation: number; ticket: object; promesse: Promise<void> } | null>(null);
  const dernierAppelRef = useRef(0);
  const portailRef = useRef<Portail | null>(null);
  const statutsRef = useRef<Map<string, string> | null>(null);
  const demandesVuesRef = useRef<Map<string, { statut: string; reponse: string }> | null>(null);
  // Chaque lecture des demandes a son numéro, pris AVANT l'appel ; une liste
  // n'est affichée que si elle est plus récente que la dernière affichée. Un
  // envoi réussi rend caduques les lectures déjà parties : elles ont pu lire la
  // base avant la nouvelle demande et l'effaceraient de l'écran.
  const lectureDemandesRef = useRef(0);
  const demandesAppliqueesRef = useRef(0);
  // Chaque vérification d'accès a son numéro : seule la dernière décide de
  // l'écran (une réponse lente d'avant une déconnexion ou un nouvel essai est ignorée).
  const verificationRef = useRef(0);

  const oublierDonnees = useCallback(() => {
    portailRef.current = null;
    statutsRef.current = null;
    demandesVuesRef.current = null;
    enCoursRef.current = null;
    setPortail(null);
    setDemandes([]);
  }, []);

  /**
   * Vérifie que le compte connecté a sa fiche d'accès client. Refus (et
   * déconnexion) seulement si la fiche n'existe pas ou que la base en refuse
   * la lecture ; une panne de réseau n'est pas un refus : le client reste
   * connecté et voit « Connexion impossible », avec un bouton pour réessayer.
   */
  const verifierAcces = useCallback(async (user: User) => {
    const auth = authRef.current;
    const db = dbRef.current;
    if (!auth || !db) return;
    const numero = ++verificationRef.current;
    setState({ status: 'checking' });
    const refuser = async (message: string) => {
      await signOut(auth).catch(() => undefined);
      setState({ status: 'error', message });
    };
    try {
      const snap = await getDoc(doc(db, 'clientAccess', user.uid));
      if (numero !== verificationRef.current) return;
      if (snap.exists()) {
        const data = snap.data();
        setState({ status: 'portal', clientName: data.clientName, adminUid: data.adminUid });
      } else {
        await refuser("Ce compte n'a pas accès à l'espace client. Contactez votre commercial LEBTEX.");
      }
    } catch (e) {
      if (numero !== verificationRef.current) return;
      if (codeErreur(e) === 'permission-denied') {
        await refuser("Ce compte n'a pas accès à l'espace client. Contactez votre commercial LEBTEX.");
      } else {
        setState({ status: 'hors_ligne' });
      }
    }
  }, []);

  useEffect(() => {
    const app = getClientApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    authRef.current = auth;
    dbRef.current = db;

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        verificationRef.current += 1;
        oublierDonnees();
        setState({ status: 'login' });
        return;
      }
      void verifierAcces(user);
    });
    return () => unsub();
  }, [oublierDonnees, verifierAcces]);

  /** « Réessayer » après « Connexion impossible » : refait la vérification, sans recharger la page. */
  const reverifierAcces = () => {
    const user = authRef.current?.currentUser;
    if (user) void verifierAcces(user);
    else setState({ status: 'login' });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as any).standalone);
    setIsStandalone(standalone);

    if (ios && !standalone) {
      setShowInstallBanner(true);
    }

    const avantInstallation = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', avantInstallation);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/client-sw.js')
        .catch(err => console.error('SW init error', err));
    }
    return () => window.removeEventListener('beforeinstallprompt', avantInstallation);
  }, []);

  /** Appel authentifié à une route de l'espace client (jeton Firebase du client). */
  const appel = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    const envoyer = async (forcerJeton: boolean) => {
      const user = authRef.current?.currentUser;
      if (!user) throw new ErreurServeur(401, 'Votre session a expiré : reconnectez-vous, s’il vous plaît.');
      const jeton = await user.getIdToken(forcerJeton);
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${jeton}`);
      return fetch(url, { ...init, headers, cache: 'no-store' });
    };
    const r = await envoyer(false);
    // Jeton refusé (expiré entre-temps) : un seul nouvel essai, avec un jeton neuf.
    return r.status === 401 ? envoyer(true) : r;
  }, []);

  /**
   * Affiche une liste de demandes lue par la lecture n° `lecture` — sauf si une
   * lecture plus récente (ou un envoi fait depuis son départ) l'a déjà
   * remplacée. Les demandes passent telles que le serveur les donne (réponse,
   * reponduLe…) : rien n'est retiré en route.
   */
  const recevoirDemandes = useCallback((liste: DemandeEnregistree[], lecture: number) => {
    if (lecture <= demandesAppliqueesRef.current) return;
    demandesAppliqueesRef.current = lecture;
    if (demandesVuesRef.current) annoncerDemandes(demandesVuesRef.current, liste);
    demandesVuesRef.current = new Map(liste.map(d => [d.id, { statut: String(d.statut || ''), reponse: String(d.reponse || '').trim() }]));
    setDemandes(liste);
  }, []);

  /** Recharge les demandes seules (après un envoi). Garde la liste actuelle en cas d'échec. */
  const chargerDemandes = useCallback(async () => {
    const generation = generationRef.current;
    const lecture = ++lectureDemandesRef.current;
    try {
      const r = await appel('/api/client/demandes');
      if (!r.ok) return;
      const j = await lireJson(r);
      if (generation !== generationRef.current || !Array.isArray(j.demandes)) return;
      recevoirDemandes(j.demandes as DemandeEnregistree[], lecture);
    } catch { /* passager : on garde la liste */ }
  }, [appel, recevoirDemandes]);

  /** Recharge commandes et demandes. Un seul appel à la fois par session. */
  const charger = useCallback((): Promise<void> => {
    const generation = generationRef.current;
    const enCours = enCoursRef.current;
    if (enCours && enCours.generation === generation) return enCours.promesse;

    const ticket = {};
    const promesse = (async () => {
      try {
        const lecture = ++lectureDemandesRef.current;
        const [rPortail, rDemandes] = await Promise.allSettled([appel('/api/client/portail'), appel('/api/client/demandes')]);
        if (generation !== generationRef.current) return;

        // ── Les commandes ──
        if (rPortail.status === 'fulfilled' && rPortail.value.ok) {
          const j = await lireJson(rPortail.value);
          if (generation !== generationRef.current) return;
          if (Array.isArray(j.commandes)) {
            const recu: Portail = {
              client: String(j.client || ''),
              commandes: j.commandes as CommandeClient[],
              conteneurs: (j.conteneurs && typeof j.conteneurs === 'object' ? j.conteneurs : {}) as Record<string, ConteneurClient>,
              contact: j.contact && typeof j.contact === 'object' ? j.contact : {},
              genereLe: typeof j.genereLe === 'string' ? j.genereLe : new Date().toISOString(),
            };
            if (statutsRef.current) annoncerEtapes(statutsRef.current, recu.commandes);
            statutsRef.current = new Map(recu.commandes.map(c => [c.id, c.statut]));
            portailRef.current = recu;
            setPortail(recu);
            setDataError(false);
          } else if (!portailRef.current) {
            setDataError(true);
          }
        } else if (rPortail.status === 'fulfilled' && rPortail.value.status === 403) {
          // L'accès a été retiré : ce n'est pas une panne passagère.
          await signOut(authRef.current!).catch(() => undefined);
          setState({ status: 'error', message: "Ce compte n'a plus accès à l'espace client. Contactez votre commercial LEBTEX." });
          return;
        } else if (!portailRef.current) {
          // Premier chargement raté : l'écran d'erreur. Sinon, on garde ce qu'on a.
          setDataError(true);
        }

        // ── Les demandes ──
        if (rDemandes.status === 'fulfilled' && rDemandes.value.ok) {
          const j = await lireJson(rDemandes.value);
          if (generation === generationRef.current && Array.isArray(j.demandes)) recevoirDemandes(j.demandes as DemandeEnregistree[], lecture);
        }
      } catch {
        if (generation === generationRef.current && !portailRef.current) setDataError(true);
      } finally {
        dernierAppelRef.current = Date.now();
        if (enCoursRef.current?.ticket === ticket) enCoursRef.current = null;
      }
    })();
    enCoursRef.current = { generation, ticket, promesse };
    return promesse;
  }, [appel, recevoirDemandes]);

  useEffect(() => {
    if (state.status !== 'portal') return;
    const { adminUid } = state as { status: 'portal'; clientName: string; adminUid: string };
    if (!adminUid || adminUid.length < 10 || adminUid.includes('/')) {
      setState({ status: 'error', message: 'Votre accès est mal configuré. Contactez votre commercial LEBTEX.' });
      return;
    }

    // Nouvelle session : rien de l'ancienne ne doit s'afficher ni se mélanger.
    generationRef.current += 1;
    oublierDonnees();
    setDataError(false);
    charger();

    const minuterie = setInterval(() => {
      const ecoule = Date.now() - dernierAppelRef.current;
      if (document.visibilityState === 'visible' || ecoule >= RAFRAICHIR_CACHE_MS) charger();
    }, RAFRAICHIR_MS);
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - dernierAppelRef.current < ECART_MIN_MS) return;
      charger();
    };
    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener('focus', auRetour);
      document.removeEventListener('visibilitychange', auRetour);
      generationRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, charger, oublierDonnees]);

  /** Envoie une demande à LEBTEX ; en cas d'échec, le message du serveur remonte au formulaire. */
  const envoyerDemande = useCallback(async (d: DemandeSaisie) => {
    const generation = generationRef.current;
    let r: Response;
    try {
      r = await appel('/api/client/demandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
    } catch (e) {
      if (e instanceof ErreurServeur) throw new Error(e.message);
      throw new Error('L’envoi n’a pas abouti. Vérifiez votre connexion internet, puis réessayez.');
    }
    const j = await lireJson(r);
    if (!r.ok || !j.success) {
      throw new Error(typeof j.error === 'string' && j.error ? j.error : 'L’envoi n’a pas abouti. Réessayez dans un instant.');
    }
    // Déconnecté pendant l'envoi : la demande est partie, mais elle n'a rien à
    // faire dans l'écran d'une autre session.
    if (generation !== generationRef.current) return;
    // Les lectures parties avant cet instant ont pu lire la base sans la
    // nouvelle demande : leurs listes ne s'afficheront plus. Seules comptent
    // désormais les lectures lancées après l'envoi (celle ci-dessous, les suivantes).
    demandesAppliqueesRef.current = lectureDemandesRef.current;
    // La demande s'affiche tout de suite ; la liste complète suit.
    if (j.demande && typeof j.demande.id === 'string') {
      const nouvelle = j.demande as DemandeEnregistree;
      setDemandes(liste => [nouvelle, ...liste.filter(x => x.id !== nouvelle.id)]);
      demandesVuesRef.current?.set(nouvelle.id, { statut: String(nouvelle.statut || ''), reponse: '' });
    }
    void chargerDemandes();
  }, [appel, chargerDemandes]);

  const reessayer = () => {
    setDataError(false);
    charger();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authRef.current) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(authRef.current, email, password);
    } catch (err) {
      setLoginError(messageConnexion(err));
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
          <p className="text-stone-700 font-black text-sm uppercase tracking-widest">Connexion</p>
          <p className="text-stone-400 text-xs font-medium mt-1">Vérification de votre accès…</p>
        </div>
      </div>
    );
  }

  // ── HORS LIGNE ─────────────────────────────────────────────────────────────
  // L'accès n'a pas pu être vérifié (réseau) : ce n'est pas un refus, le
  // client reste connecté et « Réessayer » refait la vérification sur place.
  if (state.status === 'hors_ligne') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] p-6">
        <div className="bg-white border border-stone-200 rounded-3xl p-10 max-w-sm w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <WifiOff className="w-8 h-8" />
          </div>
          <p className="text-stone-900 font-black text-sm uppercase tracking-widest mb-2">Connexion impossible</p>
          <p className="text-stone-500 text-xs font-medium leading-relaxed mb-8">
            Nous n'avons pas pu vérifier votre accès. Vérifiez votre connexion internet, puis réessayez.
          </p>
          <button
            onClick={reverifierAcces}
            className="w-full h-11 bg-stone-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
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
        {/* Left panel — visual. Sur téléphone, il reste court (titre seul) : le formulaire doit se voir sans défiler. */}
        <div className="lg:w-[55%] relative overflow-hidden flex flex-col p-6 lg:p-20" style={{ background: '#0f172a' }}>
          {/* Decorative background */}
          <div className="absolute top-0 right-0 w-full h-full opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, #6366f1 0%, transparent 50%), radial-gradient(circle at 0% 100%, #c4a062 0%, transparent 50%)' }} />

          {/* Brand header */}
          <div className="relative z-10 flex items-center gap-3 mb-5 lg:mb-auto">
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
              <p className="text-[#c4a062] text-[11px] font-black uppercase tracking-[0.3em] mb-2 lg:mb-4">Espace client</p>
              <h1 className="text-3xl lg:text-5xl font-black text-white leading-tight">
                Suivez vos<br/>
                <span style={{ color: '#c4a062' }}>commandes</span><br/>
                en temps réel.
              </h1>
              <p className="hidden lg:block text-white/70 mt-6 font-medium leading-relaxed max-w-sm">
                Toutes vos commandes chez LEBTEX au même endroit : où en est chacune, et quand elle arrive.
              </p>
            </div>

            {/* Feature pills */}
            <div className="hidden lg:flex flex-col gap-3">
              {[
                { icon: '🏭', label: 'De la fabrication à la livraison' },
                { icon: '📅', label: "Dates d'arrivée à jour" },
                { icon: '🚢', label: 'Le navire sur la carte' },
                { icon: '💬', label: 'Vos demandes, sans téléphoner' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-sm">
                  <span className="text-lg">{f.icon}</span>
                  <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="relative z-10 flex items-center gap-2 mt-4 lg:mt-0 text-white/50 text-[10px] font-bold uppercase tracking-[0.2em]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Accès sécurisé & confidentiel</span>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 lg:max-w-md flex items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8">
            {/* Pas de second logo sur téléphone : le panneau sombre, juste au-dessus, porte déjà la marque. */}
            <div>
              <h2 className="text-2xl font-black text-stone-900 tracking-tight">Connexion</h2>
              <p className="text-stone-500 text-sm mt-1">Utilisez l'adresse e-mail et le mot de passe que nous vous avons communiqués.</p>
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
                  <label htmlFor="client-email" className="text-[10px] font-black text-stone-900 uppercase tracking-widest ml-1">Adresse e-mail</label>
                  <Input
                    id="client-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="vous@entreprise.com"
                    className="h-12 bg-stone-50 border-stone-200 focus-visible:ring-[#c4a062]"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label htmlFor="client-mdp" className="text-[10px] font-black text-stone-900 uppercase tracking-widest">Mot de passe</label>
                  </div>
                  <Input
                    id="client-mdp"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-12 bg-stone-50 border-stone-200 focus-visible:ring-[#c4a062]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full h-12 rounded-xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #c4a062, #a8845a)', color: '#0f172a' }}
              >
                {loginLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Se connecter <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-stone-500 text-sm">
              Mot de passe oublié ?{' '}
              <a
                href={WHATSAPP_MDP_OUBLIE}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#8a6a3f] underline underline-offset-2 hover:text-stone-900"
              >
                Écrivez-nous sur WhatsApp
              </a>
            </p>

            <p className="text-center text-stone-400 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <Lock className="w-3 h-3" /> Connexion chiffrée · vos données restent confidentielles
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
          <div className="max-w-[1400px] mx-auto px-2 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <p className="font-bold text-sm">Installez l'espace client sur votre téléphone</p>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {isIOS
                    ? "Touchez « Partager » puis « Sur l'écran d'accueil » : vos commandes en un geste, comme une application."
                    : "Retrouvez vos commandes en un geste."}
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
                aria-label="Masquer"
              >
                <X className="w-4 h-4 text-emerald-200" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!portail && !dataError ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] space-y-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-white border border-stone-200 flex items-center justify-center shadow-xl">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#c4a062' }} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-stone-700 font-black text-sm uppercase tracking-widest">Chargement de vos commandes</p>
            <p className="text-stone-400 text-xs font-medium mt-1">Un instant…</p>
          </div>
        </div>
      ) : !portail ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F6F0] space-y-4 p-6">
          <div className="bg-white border border-red-100 rounded-3xl p-10 text-center max-w-sm shadow-xl">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-stone-900 font-black text-sm uppercase tracking-widest mb-2">Vos commandes n'ont pas pu être chargées</p>
            <p className="text-stone-400 text-xs font-medium leading-relaxed">Vérifiez votre connexion internet, puis réessayez.</p>
            <button
              onClick={reessayer}
              className="mt-6 w-full h-11 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 text-white transition-all"
              style={{ background: '#0f172a' }}
            >
              <RefreshCw className="w-4 h-4" /> Réessayer
            </button>
          </div>
        </div>
      ) : (
        <div className="fade-in min-h-screen">
          <ClientPortalApp
            clientName={portail.client || clientName}
            commandes={portail.commandes}
            conteneurs={portail.conteneurs}
            contact={portail.contact}
            demandes={demandes}
            envoyerDemande={envoyerDemande}
            derniereMiseAJour={portail.genereLe}
            onActualiser={charger}
            installation={{ ios: isIOS, installee: isStandalone, onInstaller: deferredPrompt ? handleInstallClick : undefined }}
            onLogout={handleLogout}
          />
        </div>
      )}
    </>
  );
}
