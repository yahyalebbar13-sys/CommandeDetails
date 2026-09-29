'use client';

// ─── Alerte « nouvelle commande » quand l'admin est ouvert ───────────────────
// Carillon, message à l'écran, notification du navigateur, « (2) » dans le
// titre de l'onglet. Et la pastille « Nouvelle » sur les commandes en attente
// jamais ouvertes sur cet appareil.
// Sert aussi à l'espace équipe (/staff) : `options` y donne son propre titre
// d'onglet et sa propre page (sinon l'équipe lirait « LEBTEX Admin » et la
// notification l'enverrait sur l'admin, où elle n'a pas accès).
//
// Le premier instantané ne sonne pas : ce sont les commandes déjà là à
// l'ouverture. Seules sonnent celles qui arrivent ensuite.

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShopOrder } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import { msDe, receptionDe } from '@/lib/commandes-boutique';
import { useToast } from '@/hooks/use-toast';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';

export type PermissionAlertes = 'granted' | 'denied' | 'default' | 'indisponible';

export interface EtatAlertes {
  permission: PermissionAlertes;
  demanderPermission: () => Promise<void>;
  sonActif: boolean;
  basculerSon: () => void;
}

const CLE_VUES = 'lebtex_admin_commandes_vues';
const CLE_SON = 'lebtex_admin_son';
const MAX_VUES = 500;
const TITRE = 'LEBTEX Admin';
const PAGE = '/admin-shop';

export interface OptionsAlerte {
  /** Titre de l'onglet (« (2) À confirmer — <titre> »). Par défaut « LEBTEX Admin ». */
  titre?: string;
  /** Page qui ouvre une commande avec ?commande=ID (notification de secours). Par défaut /admin-shop. */
  page?: string;
}

// ─── Stockage local (peut être bloqué : navigation privée, réglages) ─────────

function lire(cle: string): string | null {
  try { return window.localStorage.getItem(cle); } catch { return null; }
}

function ecrire(cle: string, valeur: string) {
  try { window.localStorage.setItem(cle, valeur); } catch { /* sans stockage, on garde en mémoire */ }
}

/** null = clé absente (tout premier usage sur cet appareil). */
function lireVues(): Set<string> | null {
  const brut = lire(CLE_VUES);
  if (brut === null) return null;
  try {
    const liste = JSON.parse(brut);
    return new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Les 500 dernières seulement : l'ordre d'insertion d'un Set sert d'ancienneté. */
function ecrireVues(vues: Set<string>) {
  ecrire(CLE_VUES, JSON.stringify(Array.from(vues).slice(-MAX_VUES)));
}

// ─── Carillon (WebAudio, aucun fichier) ───────────────────────────────────────
// Les navigateurs bloquent le son tant que la personne n'a pas touché la page :
// le contexte audio est créé au premier geste, puis réutilisé.

let contexteAudio: AudioContext | null = null;

function creerContexte(): AudioContext | null {
  if (contexteAudio) return contexteAudio;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    contexteAudio = new Ctx();
  } catch {
    contexteAudio = null;
  }
  return contexteAudio;
}

/** À appeler pendant un geste (clic, appui, touche) : débloque le son pour la suite. */
function debloquerSon() {
  const ctx = creerContexte();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    // iPhone : il faut jouer quelque chose pendant le geste, même un silence.
    const tampon = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = tampon;
    source.connect(ctx.destination);
    source.start(0);
  } catch { /* rien : le son restera muet */ }
}

function jouerCarillon() {
  const ctx = creerContexte();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const debut = ctx.currentTime + 0.03;
    // Deux notes montantes, douces, bien reconnaissables : « ding-ding ».
    [{ f: 880, t: 0 }, { f: 1318.5, t: 0.18 }].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const volume = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      volume.gain.setValueAtTime(0.0001, debut + t);
      volume.gain.exponentialRampToValueAtTime(0.3, debut + t + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, debut + t + 1.1);
      osc.connect(volume);
      volume.connect(ctx.destination);
      osc.start(debut + t);
      osc.stop(debut + t + 1.2);
    });
  } catch { /* son indisponible : le message à l'écran suffit */ }
}

// ─── Notification du navigateur ───────────────────────────────────────────────

/**
 * Téléphone ou tablette (Android, iPhone, iPad). Là, la notification ne marche
 * pas depuis une page : Chrome Android refuse `new Notification` (et le site
 * n'a pas de service worker, le layout les désinscrit), Safari iOS ne la propose
 * qu'aux sites ajoutés à l'écran d'accueil. Et un onglet en arrière-plan ou
 * écran éteint est gelé : plus d'écoute, plus de son.
 */
export function estAppareilMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

function permissionActuelle(): PermissionAlertes {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'indisponible';
  // Rien ne s'afficherait : on ne la propose pas plutôt que de promettre à tort.
  if (estAppareilMobile()) return 'indisponible';
  return Notification.permission as PermissionAlertes;
}

/** Écran étroit : le message s'affiche en haut et cache l'en-tête de la fiche ; il ne reste que quelques secondes. */
const dureeMessage = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 10_000 : 60_000;

/**
 * Notification système. `new Notification` d'abord : son clic ramène sur la
 * commande. Les service workers du site (/client-sw.js, /y-sw.js) ouvrent leur
 * propre page au clic, et le layout racine les désinscrit : ils ne servent
 * qu'en repli, là où le constructeur est refusé (Chrome Android).
 */
async function notifier(titre: string, corps: string, id: string, page: string, onClic: () => void) {
  const options: NotificationOptions = { body: corps, tag: `commande-${id}`, icon: '/apple-touch-icon.png' };
  try {
    const n = new Notification(titre, options);
    n.onclick = () => {
      try { window.focus(); } catch { /* rien */ }
      onClic();
      n.close();
    };
    return;
  } catch { /* constructeur refusé : on tente le service worker */ }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.showNotification(titre, { ...options, data: { url: `${page}?commande=${encodeURIComponent(id)}` } });
  } catch { /* pas de notification possible sur cet appareil */ }
}

// ─── Le hook ──────────────────────────────────────────────────────────────────

// Un rouleau se voit dès la notification : c'est un appel à organiser, pas un colis.
const libelleCommande = (o: ShopOrder) =>
  [receptionDe(o).volumineux ? 'VOLUMINEUX' : '', o.orderNumber, o.customerName || o.shippingAddress?.fullName, o.shippingAddress?.city, formatPrice(Number(o.total) || 0)]
    .filter(Boolean)
    .join(' · ');

export function useAlerteNouvellesCommandes(
  orders: ShopOrder[],
  pret: boolean,
  onOuvrir: (id: string) => void,
  { titre = TITRE, page = PAGE }: OptionsAlerte = {},
): EtatAlertes & { nonVues: Set<string>; marquerVue: (id: string) => void } {
  const { toast } = useToast();

  // Toujours la dernière version : l'alerte part d'un effet plus ancien.
  const onOuvrirRef = useRef(onOuvrir);
  useEffect(() => { onOuvrirRef.current = onOuvrir; }, [onOuvrir]);

  const [permission, setPermission] = useState<PermissionAlertes>('default');
  const [sonActif, setSonActif] = useState(true);
  const sonActifRef = useRef(true);

  // null tant que le stockage n'est pas lu : aucune pastille avant.
  const [vues, setVues] = useState<Set<string> | null>(null);
  const [cleAbsente, setCleAbsente] = useState(false);

  // Lecture des réglages de cet appareil, et suivi des autres onglets.
  useEffect(() => {
    setPermission(permissionActuelle());
    const son = lire(CLE_SON) !== '0';
    setSonActif(son);
    sonActifRef.current = son;
    const lues = lireVues();
    setCleAbsente(lues === null);
    setVues(lues ?? new Set());

    const autreOnglet = (e: StorageEvent) => {
      if (e.key === CLE_VUES) setVues(lireVues() ?? new Set());
      if (e.key === CLE_SON) {
        const actif = e.newValue !== '0';
        setSonActif(actif);
        sonActifRef.current = actif;
      }
    };
    // La permission peut changer dans les réglages du navigateur.
    const auRetour = () => { if (document.visibilityState === 'visible') setPermission(permissionActuelle()); };
    window.addEventListener('storage', autreOnglet);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.removeEventListener('storage', autreOnglet);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, []);

  // Premier geste sur la page : le son est débloqué pour les alertes suivantes.
  useEffect(() => {
    const evenements = ['pointerdown', 'keydown', 'touchend'] as const;
    const auGeste = () => {
      debloquerSon();
      if (contexteAudio?.state === 'running') evenements.forEach(ev => window.removeEventListener(ev, auGeste, true));
    };
    evenements.forEach(ev => window.addEventListener(ev, auGeste, true));
    return () => evenements.forEach(ev => window.removeEventListener(ev, auGeste, true));
  }, []);

  // Tout premier usage sur cet appareil : l'historique est « vu », seules les
  // commandes en attente gardent la pastille.
  useEffect(() => {
    if (!pret || !cleAbsente) return;
    const dejaTraitees = orders
      .filter(o => o.id && o.status !== 'pending')
      .sort((a, b) => msDe(a.createdAt) - msDe(b.createdAt))
      .map(o => o.id as string)
      .slice(-MAX_VUES);
    // Sans perdre une commande déjà ouverte entre-temps (lien de l'e-mail).
    setVues(avant => {
      const ensemble = new Set([...dejaTraitees, ...(avant ?? [])]);
      ecrireVues(ensemble);
      return ensemble;
    });
    setCleAbsente(false);
  }, [pret, cleAbsente, orders]);

  // ─── Arrivées ───────────────────────────────────────────────────────────────
  const connus = useRef<Set<string> | null>(null);

  const alerter = useCallback((arrivees: ShopOrder[]) => {
    const premiere = arrivees[0];
    const id = premiere.id as string;
    const ouvrir = () => onOuvrirRef.current(id);
    const plusieurs = arrivees.length > 1;

    if (sonActifRef.current) {
      jouerCarillon();
      try { navigator.vibrate?.([180, 80, 180]); } catch { /* rien */ }
    }

    toast({
      title: plusieurs ? `${arrivees.length} nouvelles commandes` : 'Nouvelle commande',
      description: plusieurs
        ? `${libelleCommande(premiere)} — et ${arrivees.length - 1} autre${arrivees.length > 2 ? 's' : ''}, dans « À confirmer ».`
        : libelleCommande(premiere),
      // Le son, la pastille « Nouvelle » et le compteur restent quand le message s'en va.
      duration: dureeMessage(),
      // Croix de fermeture visible sans survol (au doigt, elle restait invisible).
      className: 'border-[#C8102E]/40 bg-[#1A1A1A] text-gray-100 [&_[toast-close]]:opacity-100 [&_[toast-close]]:text-gray-300',
      action: createElement(
        ToastAction,
        {
          altText: 'Ouvrir la commande',
          onClick: ouvrir,
          className: 'h-10 border-white/20 text-gray-100 hover:bg-white/10',
        },
        'Ouvrir',
      ) as unknown as ToastActionElement,
    });

    // Onglet caché ou fenêtre en arrière-plan : la notification système prend le relais.
    const horsDeVue = document.visibilityState !== 'visible' || !document.hasFocus();
    if (horsDeVue && permissionActuelle() === 'granted') {
      void notifier(
        plusieurs ? `${arrivees.length} nouvelles commandes — LEBTEX` : 'Nouvelle commande — LEBTEX',
        libelleCommande(premiere),
        id,
        page,
        ouvrir,
      );
    }
  }, [toast, page]);

  useEffect(() => {
    if (!pret) return;
    const ids = orders.map(o => o.id).filter((x): x is string => !!x);
    if (!connus.current) {
      connus.current = new Set(ids);
      return;
    }
    const deja = connus.current;
    const arrivees = orders.filter(o => o.id && !deja.has(o.id) && o.status === 'pending');
    ids.forEach(id => deja.add(id));
    if (arrivees.length) {
      // La plus ancienne d'abord : c'est elle qu'« Ouvrir » affiche.
      arrivees.sort((a, b) => msDe(a.createdAt) - msDe(b.createdAt));
      alerter(arrivees);
    }
  }, [orders, pret, alerter]);

  // ─── Titre de l'onglet ──────────────────────────────────────────────────────
  const enAttente = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);
  const titreInitial = useRef<string | null>(null);

  const titreVoulu = enAttente > 0 ? `(${enAttente}) À confirmer — ${titre}` : titre;
  useEffect(() => {
    if (titreInitial.current === null) titreInitial.current = document.title;
    const appliquer = () => { if (document.title !== titreVoulu) document.title = titreVoulu; };
    appliquer();
    // Next.js réécrit le <title> des métadonnées après coup (hydratation, navigation),
    // parfois dans <body> : on le reprend aussitôt, et au pire dans les 3 s.
    const observateur = new MutationObserver(appliquer);
    observateur.observe(document.head, { subtree: true, childList: true, characterData: true });
    observateur.observe(document.body, { childList: true });
    document.querySelectorAll('body > title').forEach(t =>
      observateur.observe(t, { subtree: true, childList: true, characterData: true }));
    const filet = window.setInterval(appliquer, 3000);
    return () => { observateur.disconnect(); window.clearInterval(filet); };
  }, [titreVoulu]);

  useEffect(() => () => {
    if (titreInitial.current !== null) document.title = titreInitial.current;
  }, []);

  // ─── Pastilles « Nouvelle » ─────────────────────────────────────────────────
  const nonVues = useMemo(() => {
    if (!vues) return new Set<string>();
    return new Set(orders.filter(o => o.id && o.status === 'pending' && !vues.has(o.id)).map(o => o.id as string));
  }, [orders, vues]);

  const marquerVue = useCallback((id: string) => {
    if (!id) return;
    setVues(avant => {
      if (avant?.has(id)) return avant;
      const suivant = new Set(avant ?? []);
      suivant.add(id);
      ecrireVues(suivant);
      return suivant;
    });
  }, []);

  // ─── Réglages ───────────────────────────────────────────────────────────────
  const demanderPermission = useCallback(async () => {
    // Ce clic est un geste : on en profite pour débloquer le son et le faire entendre.
    debloquerSon();
    if (sonActifRef.current) jouerCarillon();
    if (typeof Notification === 'undefined' || estAppareilMobile()) {
      setPermission('indisponible');
      return;
    }
    try {
      // Anciens Safari : réponse par rappel, la promesse ne renvoie rien.
      const resultat = await Notification.requestPermission();
      setPermission((resultat || permissionActuelle()) as PermissionAlertes);
    } catch {
      setPermission(permissionActuelle());
    }
  }, []);

  const basculerSon = useCallback(() => {
    const actif = !sonActifRef.current;
    sonActifRef.current = actif;
    setSonActif(actif);
    ecrire(CLE_SON, actif ? '1' : '0');
    if (actif) {
      debloquerSon();
      jouerCarillon(); // on entend tout de suite ce qui sonnera
    }
  }, []);

  return { permission, demanderPermission, sonActif, basculerSon, nonVues, marquerVue };
}
