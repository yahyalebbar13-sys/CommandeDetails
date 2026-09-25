"use client";

// ─── Espace client ────────────────────────────────────────────────────────────
// Ce que le client voit de ses précommandes. Tout y est dit dans ses mots à lui
// (cf. lib/statut-client.ts) : jamais un statut interne, jamais un chiffre de
// gestion (part de conteneur, prix d'achat). Les données arrivent déjà
// assainies par le serveur (GET /api/client/portail, cf.
// lib/portail-client-donnees.ts) : rien d'autre ne peut s'afficher ici.
//
// L'accueil montre tout ce qui est en cours, dans l'ordre du voyage : ce qui
// demande un geste (livraison, réponse de LEBTEX, date repoussée), les
// arrivées à venir (ce qui est en mer), ce qui a bougé, puis en douane, prêt à
// livrer, en fabrication. Chaque commande s'ouvre en fiche ; chaque fiche mène aux
// demandes (recommander, livraison, question) et au PDF.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Factory,
  Ship,
  PackageCheck,
  History,
  Menu,
  Package,
  LogOut,
  ClipboardList,
  FileText,
  CalendarClock,
  Search,
  Inbox,
  ChartColumn,
  CircleHelp,
  FileDown,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Truck,
  Repeat,
  MessageCircleQuestion,
  MessageSquareReply,
  TriangleAlert,
  ChevronRight,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import type { DemandeEnregistree, DemandeSaisie, TypeDemande } from '@/lib/demandes-client';
import { dateFr, phraseEtape, type EtapeClient } from '@/lib/statut-client';
import {
  aujourdHuiLocal,
  arriveeDe,
  commandesParEtape,
  conteneurDe,
  ecartArrivee,
  joursEntre,
  telechargerEtatCommandes,
  telechargerFicheCommande,
} from '@/lib/pdf-espace-client';
import { FicheCommande } from '@/components/client/fiche-commande';
import { FormulaireDemande, ListeDemandes, heureReponse } from '@/components/client/demandes-client';
import { Activite, ArriveesAVenir, Nouveautes } from '@/components/client/arrivees-activite';
import { EtatVide, GrilleCommandes, GrilleConteneurs, Section } from '@/components/client/cartes-commandes';
import { ToutesMesCommandes } from '@/components/client/toutes-commandes';
import { AideClient, type InstallationPortail } from '@/components/client/aide-client';
import { BlocContact } from '@/components/client/contact-client';
import { compte, dansNJours, depuis, pluriel } from '@/components/client/portail-outils';

export interface ClientPortalAppProps {
  clientName: string;
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  contact: { whatsapp?: string };
  demandes: DemandeEnregistree[];
  /** Envoie une demande ; rejette avec un message lisible par le client si l'envoi échoue. */
  envoyerDemande: (d: DemandeSaisie) => Promise<void>;
  /** Heure (ISO) de la dernière mise à jour réussie des données. */
  derniereMiseAJour?: string;
  /** Recharge tout de suite (le bouton « Mis à jour il y a… »). */
  onActualiser?: () => void | Promise<void>;
  /** Installation sur le téléphone (aide et bouton « Installer »). */
  installation?: InstallationPortail;
  onLogout?: () => void;
}

type Onglet =
  | 'accueil' | 'commandes'
  | 'enregistrees' | 'fabrication' | 'mer' | 'douane' | 'pretes' | 'livrees'
  | 'demandes' | 'activite' | 'aide';

const ONGLETS: Onglet[] = ['accueil', 'commandes', 'enregistrees', 'fabrication', 'mer', 'douane', 'pretes', 'livrees', 'demandes', 'activite', 'aide'];
const estOnglet = (v: string): v is Onglet => (ONGLETS as string[]).includes(v);

/**
 * Réponses de LEBTEX déjà lues : la plus récente vue, sur cet appareil. La clé
 * complète porte le nom du client (`${CLE_REPONSES_VUES}:${clientName}`) : deux
 * clients sur le même téléphone ne lisent pas les réponses l'un de l'autre.
 */
const CLE_REPONSES_VUES = 'lebtex-espace-client:reponses-vues';

/**
 * Ce qui s'ouvre par-dessus l'onglet : la fiche d'une commande, le formulaire
 * d'une demande. Chacun pose une entrée dans l'historique, pour que « retour »
 * (le bouton d'Android) le referme au lieu de quitter l'onglet.
 */
type Couche = 'fiche' | 'demande';

/** La couche que porte l'entrée d'historique courante, s'il y en a une. */
function coucheEnHaut(): Couche | undefined {
  if (typeof window === 'undefined') return undefined;
  const etat = window.history.state as { couche?: unknown } | null;
  return etat?.couche === 'fiche' || etat?.couche === 'demande' ? etat.couche : undefined;
}

type ElementNav = { id: Onglet; label: string; icone: LucideIcon; nb?: number; point?: boolean };

// ─── Petites pièces ───────────────────────────────────────────────────────────

/** « Mis à jour il y a 3 min » ; touché, recharge tout de suite. */
function IndicateurMaj({ le, onActualiser, variante = 'clair' }: {
  le?: string;
  onActualiser?: () => void | Promise<void>;
  variante?: 'clair' | 'compact';
}) {
  // L'heure n'est lue qu'une fois affiché : rendue côté serveur, elle ne
  // correspondrait pas à celle du navigateur.
  const [maintenant, setMaintenant] = useState<number | null>(null);
  const [tourne, setTourne] = useState(false);
  useEffect(() => {
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(minuterie);
  }, [le]);

  const quand = maintenant !== null ? depuis(le, maintenant) : undefined;
  const texte = quand ? `Mis à jour ${quand}` : 'Mise à jour…';
  const actualiser = () => {
    if (!onActualiser || tourne) return;
    setTourne(true);
    Promise.resolve()
      .then(() => onActualiser())
      .catch(() => undefined)
      .finally(() => setTourne(false));
  };
  const icone = <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${tourne ? 'animate-spin' : ''}`} />;

  if (variante === 'compact') {
    return (
      <button
        type="button"
        onClick={actualiser}
        disabled={!onActualiser}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors disabled:hover:bg-transparent disabled:hover:text-stone-400"
        aria-label={`${texte}. Actualiser`}
        title="Actualiser"
      >
        {icone}
        <span className="max-[359px]:hidden">{quand || '…'}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={actualiser}
      disabled={!onActualiser}
      className="w-full inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold text-stone-400 hover:text-stone-900 hover:bg-stone-50 transition-colors text-left disabled:hover:bg-transparent disabled:hover:text-stone-400"
      title={onActualiser ? 'Actualiser maintenant' : undefined}
    >
      {icone}
      <span className="truncate">{texte}</span>
    </button>
  );
}

/** « État de mes commandes (PDF) » et « Exporter (Excel) ». */
function BoutonsDocuments({ enCours, onPdf, onExcel, sombre, desactives }: {
  enCours: '' | 'pdf' | 'excel';
  onPdf: () => void;
  onExcel: () => void;
  sombre?: boolean;
  desactives?: boolean;
}) {
  const style = sombre
    ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
    : 'bg-white border-stone-200 text-stone-700 hover:border-[#c4a062] hover:text-stone-900';
  const bouton = `inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${style}`;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onPdf} disabled={desactives || enCours !== ''} className={bouton}>
        {enCours === 'pdf' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        {enCours === 'pdf' ? 'Préparation…' : 'État de mes commandes (PDF)'}
      </button>
      <button type="button" onClick={onExcel} disabled={desactives || enCours !== ''} className={bouton}>
        {enCours === 'excel' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
        {enCours === 'excel' ? 'Préparation…' : 'Exporter (Excel)'}
      </button>
    </div>
  );
}

/** La liste des onglets, en trois groupes. */
function Navigation({ groupes, actif, onChoisir }: {
  groupes: { titre?: string; elements: ElementNav[] }[];
  actif: Onglet;
  onChoisir: (o: Onglet) => void;
}) {
  return (
    <nav className="flex flex-col gap-1 p-4" aria-label="Espace client">
      {groupes.map((g, i) => (
        <div key={i} className={i > 0 ? 'mt-4' : ''}>
          {g.titre && <p className="px-4 mb-1.5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">{g.titre}</p>}
          <div className="flex flex-col gap-1">
            {g.elements.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChoisir(item.id)}
                aria-current={actif === item.id ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                  actif === item.id
                    ? 'bg-[#c4a062] text-stone-900 shadow-md shadow-[#c4a062]/20'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <item.icone className="w-5 h-5 shrink-0" />
                <span className="font-black text-[12px] uppercase tracking-widest text-left">{item.label}</span>
                {item.point && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${actif === item.id ? 'bg-stone-900' : 'bg-[#c4a062]'}`} aria-label="Nouvelle réponse" />
                )}
                {!!item.nb && item.nb > 0 && (
                  <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${
                    actif === item.id ? 'bg-stone-900/10 text-stone-900' : 'bg-stone-200 text-stone-600'
                  }`}>
                    {item.nb}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Une carte « à faire » de l'accueil. */
function Alerte({ icone: Icone, ton, titre, texte, action, onAction }: {
  icone: LucideIcon;
  ton: 'emerald' | 'or' | 'ambre';
  titre: string;
  texte: string;
  action: string;
  onAction: () => void;
}) {
  const styles = {
    emerald: { carte: 'bg-emerald-50 border-emerald-200', icone: 'bg-emerald-600 text-white', titre: 'text-emerald-950', texte: 'text-emerald-800/80', bouton: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    or: { carte: 'bg-[#c4a062]/10 border-[#c4a062]/30', icone: 'bg-stone-900 text-[#c4a062]', titre: 'text-stone-900', texte: 'text-stone-600', bouton: 'bg-stone-900 hover:bg-black text-white' },
    ambre: { carte: 'bg-amber-50 border-amber-200', icone: 'bg-amber-500 text-white', titre: 'text-amber-950', texte: 'text-amber-800/80', bouton: 'bg-white border border-amber-200 hover:bg-amber-100 text-amber-900' },
  }[ton];
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${styles.carte}`}>
      <div className="flex gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${styles.icone}`}>
          <Icone className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-black leading-snug ${styles.titre}`}>{titre}</p>
          <p className={`mt-0.5 text-xs font-medium leading-snug line-clamp-3 ${styles.texte}`}>{texte}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`self-start inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${styles.bouton}`}
      >
        {action} <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── L'espace client ──────────────────────────────────────────────────────────

export function ClientPortalApp({
  clientName,
  commandes,
  conteneurs,
  contact,
  demandes,
  envoyerDemande,
  derniereMiseAJour,
  onActualiser,
  installation,
  onLogout,
}: ClientPortalAppProps) {
  const [onglet, setOnglet] = useState<Onglet>('accueil');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [focusRecherche, setFocusRecherche] = useState(false);
  const [fiche, setFiche] = useState<{ id: string; ouverte: boolean } | null>(null);
  const [formulaire, setFormulaire] = useState<{ type: TypeDemande | null; preselection: string[] }>({ type: null, preselection: [] });
  const [docEnCours, setDocEnCours] = useState<'' | 'pdf' | 'excel'>('');
  // undefined : pas encore lu (rien n'est signalé) ; null : jamais rien lu sur cet appareil.
  const [reponsesVues, setReponsesVues] = useState<string | null | undefined>(undefined);

  const whatsapp = contact?.whatsapp;
  const conteneursSurs = conteneurs || {};

  // ─── Les commandes, étape par étape ───
  const parEtape = useMemo(() => {
    const r = {} as Record<EtapeClient, CommandeClient[]>;
    for (const g of commandesParEtape(commandes, conteneursSurs)) r[g.etape.id] = g.commandes;
    return r;
  }, [commandes, conteneursSurs]);
  const parId = useMemo(() => new Map(commandes.map(c => [c.id, c])), [commandes]);
  const pretesIds = useMemo(() => parEtape.prete.map(c => c.id), [parEtape]);
  const enCours = commandes.length - parEtape.livree.length;
  const enRoute = parEtape.douane.length + parEtape.mer.length + parEtape.prete.length + parEtape.fabrication.length;

  // Prochaine arrivée annoncée : le conteneur en mer qui arrive le plus tôt.
  const prochaineArrivee = useMemo(() => {
    const aujourdHui = aujourdHuiLocal();
    return parEtape.mer
      .map(c => arriveeDe(c, conteneurDe(c, conteneursSurs)))
      .filter((d): d is string => Boolean(d) && String(d) >= aujourdHui)
      .sort()[0];
  }, [parEtape, conteneursSurs]);

  // Conteneurs en mer dont la compagnie a repoussé l'arrivée.
  const conteneursRetardes = useMemo(() => {
    const ids = new Set<string>();
    for (const c of parEtape.mer) {
      const k = conteneurDe(c, conteneursSurs);
      const ecart = ecartArrivee(k, arriveeDe(c, k));
      if (k && ecart && ecart > 0) ids.add(k.id);
    }
    return ids.size;
  }, [parEtape, conteneursSurs]);

  // ─── Les demandes ───
  const demandesEnCours = useMemo(() => demandes.filter(d => d.statut !== 'traitee').length, [demandes]);
  // L'heure de la réponse elle-même (reponduLe), pas celle de la dernière mise à
  // jour : une demande marquée « traitée » après sa réponse n'est pas une réponse de plus.
  const nouvellesReponses = useMemo(() => {
    if (reponsesVues === undefined) return [];
    return demandes
      .filter(d => {
        const le = heureReponse(d);
        return le !== '' && (reponsesVues === null || le > reponsesVues);
      })
      .sort((a, b) => heureReponse(b).localeCompare(heureReponse(a)));
  }, [demandes, reponsesVues]);

  const cleReponsesVues = `${CLE_REPONSES_VUES}:${clientName}`;

  useEffect(() => {
    try { setReponsesVues(window.localStorage.getItem(cleReponsesVues)); } catch { setReponsesVues(null); }
  }, [cleReponsesVues]);

  // Ouvrir « Mes demandes », c'est lire les réponses : on retient la plus récente
  // (heure du serveur, pas celle du téléphone, qui peut retarder).
  useEffect(() => {
    if (onglet !== 'demandes' || reponsesVues === undefined) return;
    const plusRecente = demandes.map(heureReponse).filter(Boolean).sort().pop();
    if (!plusRecente || (reponsesVues && reponsesVues >= plusRecente)) return;
    setReponsesVues(plusRecente);
    try { window.localStorage.setItem(cleReponsesVues, plusRecente); } catch { /* navigation privée : tant pis */ }
  }, [onglet, demandes, reponsesVues, cleReponsesVues]);

  // ─── Navigation : un onglet par adresse (#demandes…), pour que « retour »
  // sur le téléphone ramène à l'onglet précédent au lieu de fermer l'espace.
  // La fiche et le formulaire posent chacun une entrée de plus, à la même
  // adresse : « retour » les referme d'abord, et l'onglet reste le même.
  /** La couche ouverte par-dessus l'onglet, dont l'entrée d'historique est posée. */
  const coucheRef = useRef<Couche | null>(null);

  useEffect(() => {
    const lire = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      setOnglet(estOnglet(h) ? h : 'accueil');
      setMenuOuvert(false);
    };
    const auRetour = () => {
      if (coucheRef.current) {
        // Le navigateur vient de retirer l'entrée de la fiche (ou du formulaire) :
        // on la referme, sans toucher à l'onglet d'où elle avait été ouverte.
        coucheRef.current = null;
        setFiche(f => (f?.ouverte ? { ...f, ouverte: false } : f));
        setFormulaire(f => (f.type ? { ...f, type: null } : f));
        return;
      }
      lire();
    };
    lire();
    window.addEventListener('popstate', auRetour);
    return () => window.removeEventListener('popstate', auRetour);
  }, []);

  /** Une couche s'ouvre : son entrée d'historique, ou elle prend la place de celle du dessus. */
  const empiler = useCallback((couche: Couche) => {
    coucheRef.current = couche;
    if (typeof window === 'undefined') return;
    const haut = coucheEnHaut();
    if (haut === couche) return;
    // Sans adresse : l'entrée garde celle de l'onglet (#demandes…).
    if (haut) window.history.replaceState({ couche }, '');
    else window.history.pushState({ couche }, '');
  }, []);

  /** Une couche se referme par ses propres boutons : on retire son entrée, si c'est elle en haut. */
  const depiler = useCallback((couche: Couche) => {
    if (coucheRef.current === couche) coucheRef.current = null;
    if (typeof window !== 'undefined' && coucheEnHaut() === couche) window.history.back();
  }, []);

  const allerA = useCallback((o: Onglet, options?: { focusRecherche?: boolean }) => {
    setOnglet(o);
    setMenuOuvert(false);
    setFocusRecherche(Boolean(options?.focusRecherche));
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0 });
    const cible = o === 'accueil' ? `${window.location.pathname}${window.location.search}` : `#${o}`;
    const actuel = window.location.hash.slice(1) || 'accueil';
    if (actuel !== o) window.history.pushState(null, '', cible);
  }, []);

  // ─── Fiche et demandes ───
  const ouvrirFiche = useCallback((c: CommandeClient) => {
    setFiche({ id: c.id, ouverte: true });
    empiler('fiche');
  }, [empiler]);
  /** Referme la fiche sans toucher à l'historique (elle passe la main au formulaire). */
  const masquerFiche = useCallback(() => setFiche(f => (f ? { ...f, ouverte: false } : f)), []);
  const fermerFiche = useCallback(() => {
    masquerFiche();
    depiler('fiche');
  }, [masquerFiche, depiler]);
  const commandeFiche = fiche ? parId.get(fiche.id) ?? null : null;

  const ouvrirFormulaire = useCallback((type: TypeDemande, ids: string[] = []) => {
    setMenuOuvert(false);
    setFormulaire({ type, preselection: ids });
    empiler('demande');
  }, [empiler]);
  const fermerFormulaire = useCallback(() => {
    setFormulaire(f => ({ ...f, type: null }));
    depiler('demande');
  }, [depiler]);
  const organiserLivraison = useCallback(() => ouvrirFormulaire('livraison', pretesIds), [ouvrirFormulaire, pretesIds]);

  // ─── Documents ───
  const erreurDocument = () => toast({
    variant: 'destructive',
    title: 'Le document n’a pas pu être préparé',
    description: 'Vérifiez votre connexion internet, puis réessayez.',
  });
  const telechargerPdf = async () => {
    if (docEnCours) return;
    setDocEnCours('pdf');
    try { await telechargerEtatCommandes(clientName, commandes, conteneursSurs); } catch { erreurDocument(); } finally { setDocEnCours(''); }
  };
  const telechargerTableur = async () => {
    if (docEnCours) return;
    setDocEnCours('excel');
    try {
      // Le module Excel est lourd : il ne se charge qu'au clic.
      const { telechargerExcel } = await import('@/lib/export-espace-client');
      telechargerExcel(clientName, commandes, conteneursSurs);
    } catch { erreurDocument(); } finally { setDocEnCours(''); }
  };
  const telechargerFiche = (c: CommandeClient) =>
    telechargerFicheCommande(clientName, c, conteneurDe(c, conteneursSurs)).catch(() => { erreurDocument(); });

  const documents = (sombre?: boolean) => (
    <BoutonsDocuments
      enCours={docEnCours}
      onPdf={telechargerPdf}
      onExcel={telechargerTableur}
      sombre={sombre}
      desactives={commandes.length === 0}
    />
  );

  // ─── Menus ───
  const groupesNav: { titre?: string; elements: ElementNav[] }[] = [
    {
      elements: [
        { id: 'accueil', label: 'Accueil', icone: LayoutDashboard },
        { id: 'commandes', label: 'Toutes mes commandes', icone: Package, nb: commandes.length },
      ],
    },
    {
      titre: 'Par étape',
      elements: [
        { id: 'enregistrees', label: 'Enregistrées', icone: ClipboardList, nb: parEtape.enregistree.length },
        { id: 'fabrication', label: 'En fabrication', icone: Factory, nb: parEtape.fabrication.length },
        { id: 'mer', label: 'En mer', icone: Ship, nb: parEtape.mer.length },
        { id: 'douane', label: 'En douane', icone: FileText, nb: parEtape.douane.length },
        { id: 'pretes', label: 'Prêtes à livrer', icone: PackageCheck, nb: parEtape.prete.length },
        { id: 'livrees', label: 'Livrées', icone: History, nb: parEtape.livree.length },
      ],
    },
    {
      titre: 'Mon espace',
      elements: [
        { id: 'demandes', label: 'Mes demandes', icone: Inbox, nb: demandesEnCours, point: nouvellesReponses.length > 0 },
        { id: 'activite', label: 'Mon activité', icone: ChartColumn },
        { id: 'aide', label: 'Aide', icone: CircleHelp },
      ],
    },
  ];

  const barreBas: { id: Onglet; label: string; icone: LucideIcon; point?: boolean }[] = [
    { id: 'accueil', label: 'Accueil', icone: LayoutDashboard },
    { id: 'commandes', label: 'Commandes', icone: Package },
    { id: 'demandes', label: 'Demandes', icone: Inbox, point: nouvellesReponses.length > 0 },
    { id: 'aide', label: 'Aide', icone: CircleHelp },
  ];

  const tuiles: { id: Onglet; label: string; valeur: number; ton: string }[] = [
    { id: 'fabrication', label: 'En fabrication', valeur: parEtape.fabrication.length, ton: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
    { id: 'mer', label: 'En mer', valeur: parEtape.mer.length, ton: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
    { id: 'douane', label: 'En douane', valeur: parEtape.douane.length, ton: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' },
    { id: 'pretes', label: 'Prêtes à livrer', valeur: parEtape.prete.length, ton: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
  ];

  const initiales = (clientName || 'C').substring(0, 2);
  const joursAvantArrivee = prochaineArrivee ? joursEntre(aujourdHuiLocal(), prochaineArrivee) : undefined;

  const boutonLivraison = (
    <button
      type="button"
      onClick={organiserLivraison}
      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest shadow-md shadow-emerald-600/20 transition-colors"
    >
      <Truck className="w-4 h-4" /> Organiser la livraison
    </button>
  );

  const deconnexion = onLogout && (
    <button
      type="button"
      onClick={onLogout}
      className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-stone-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
    >
      <LogOut className="w-5 h-5 shrink-0" />
      <span className="font-black text-[12px] uppercase tracking-widest">Se déconnecter</span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#F9F6F0]">
      {/* ─── Barre latérale (ordinateur) ─── */}
      <aside className="hidden md:flex w-72 flex-col bg-white border-r border-stone-200 sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="p-6 border-b border-stone-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#c4a062] to-[#a38042] flex items-center justify-center shrink-0 shadow-lg shadow-[#c4a062]/20">
            <span className="text-white font-black text-lg uppercase tracking-widest">{initiales}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Espace client</p>
            <h2 className="font-black text-stone-900 truncate uppercase tracking-wider text-sm">{clientName}</h2>
          </div>
        </div>
        <div className="flex-1 py-2">
          <Navigation groupes={groupesNav} actif={onglet} onChoisir={allerA} />
          <div className="px-4 pb-4">
            <BlocContact whatsapp={whatsapp} clientName={clientName} onQuestion={() => ouvrirFormulaire('question')} />
          </div>
        </div>
        <div className="p-4 border-t border-stone-100 space-y-1">
          <IndicateurMaj le={derniereMiseAJour} onActualiser={onActualiser} />
          {deconnexion}
        </div>
      </aside>

      <main className="flex-1 w-full min-w-0 flex flex-col">
        {/* ─── En-tête (téléphone) ─── */}
        <header className="md:hidden bg-white/95 backdrop-blur border-b border-stone-200 sticky top-0 z-40 px-4 py-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => allerA('accueil')} className="flex items-center gap-3 min-w-0" aria-label="Accueil">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#c4a062] to-[#a38042] flex items-center justify-center shadow-sm shrink-0">
              <span className="text-white font-black text-sm uppercase">{initiales}</span>
            </div>
            <span className="min-w-0 text-left">
              <span className="block text-[9px] font-black text-stone-400 uppercase tracking-widest">Espace client</span>
              <span className="block font-black text-stone-900 uppercase truncate text-sm">{clientName}</span>
            </span>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <IndicateurMaj le={derniereMiseAJour} onActualiser={onActualiser} variante="compact" />
            <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ouvrir le menu"><Menu className="w-6 h-6" /></Button>
              </SheetTrigger>
              {/* La croix d'origine (« Close », en anglais) est masquée : la nôtre, plus bas, parle français. */}
              <SheetContent side="left" className="w-[85vw] max-w-80 p-0 gap-0 bg-white flex flex-col [&>button:last-child]:hidden">
                <SheetHeader className="p-6 pr-14 text-left border-b border-stone-100">
                  <SheetTitle className="font-black text-stone-900 uppercase tracking-widest">Mon espace client</SheetTitle>
                  <SheetDescription className="text-xs font-medium text-stone-600 truncate">{clientName}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                  <Navigation groupes={groupesNav} actif={onglet} onChoisir={allerA} />
                  <div className="px-4 pb-4">
                    <BlocContact whatsapp={whatsapp} clientName={clientName} onQuestion={() => ouvrirFormulaire('question')} />
                  </div>
                </div>
                {deconnexion && (
                  <div className="p-4 border-t border-stone-100 pb-[max(1rem,env(safe-area-inset-bottom))]">{deconnexion}</div>
                )}
                {/* Dernière au clavier, comme la croix qu'elle remplace. */}
                <SheetClose
                  className="absolute right-4 top-5 w-9 h-9 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
                  aria-label="Fermer le menu"
                  title="Fermer le menu"
                >
                  <X className="w-5 h-5" />
                </SheetClose>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="w-full max-w-[1400px] mx-auto p-4 md:p-8 pb-28 md:pb-10">
          {/* ═══ Accueil ═══ */}
          {onglet === 'accueil' && (
            <div className="space-y-10 animate-in fade-in">
              <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" aria-hidden />
                <div className="relative z-10">
                  <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Bonjour {clientName}</p>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {enCours > 0 ? `${compte(enCours, 'commande', 'commandes')} en cours` : 'Aucune commande en cours'}
                  </h1>
                  <p className="text-stone-400 text-sm font-medium mt-2 mb-5">
                    Suivez chaque commande de la fabrication jusqu’à la livraison. Les dates se mettent à jour d’elles-mêmes.
                  </p>

                  <button
                    type="button"
                    onClick={() => allerA('commandes', { focusRecherche: true })}
                    className="w-full md:max-w-lg flex items-center gap-3 h-12 px-4 mb-5 rounded-2xl bg-white/10 border border-white/10 text-stone-400 text-sm font-medium text-left hover:bg-white/15 hover:border-[#c4a062]/40 transition-colors"
                  >
                    <Search className="w-4 h-4 shrink-0 text-[#c4a062]" />
                    <span className="truncate">Rechercher un produit, une couleur, un navire…</span>
                  </button>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {tuiles.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => allerA(t.id)}
                        className={`text-left backdrop-blur-md border rounded-2xl p-4 hover:brightness-125 transition-all ${t.ton}`}
                      >
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1">{t.label}</p>
                        <p className="text-2xl font-black text-white">{t.valeur}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
                    {prochaineArrivee ? (
                      <button
                        type="button"
                        onClick={() => allerA('mer')}
                        className="self-start inline-flex items-center gap-2 text-[11px] font-black text-blue-200 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-xl hover:bg-blue-500/20 transition-colors text-left"
                      >
                        <CalendarClock className="w-4 h-4 shrink-0" />
                        <span>
                          Prochaine arrivée prévue le {dateFr(prochaineArrivee)}
                          {joursAvantArrivee !== undefined && <span className="text-blue-300/80"> · {dansNJours(joursAvantArrivee)}</span>}
                        </span>
                      </button>
                    ) : <span />}
                    {commandes.length > 0 && documents(true)}
                  </div>
                </div>
              </div>

              {/* Ce qui demande un geste, ou mérite d'être su. */}
              {(parEtape.prete.length > 0 || nouvellesReponses.length > 0 || conteneursRetardes > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {nouvellesReponses.length > 0 && (
                    <Alerte
                      icone={MessageSquareReply}
                      ton="or"
                      titre={nouvellesReponses.length === 1 ? 'LEBTEX a répondu à votre demande' : `LEBTEX a répondu à ${nouvellesReponses.length} de vos demandes`}
                      texte={`« ${String(nouvellesReponses[0].reponse || '').slice(0, 140)}${String(nouvellesReponses[0].reponse || '').length > 140 ? '…' : ''} »`}
                      action={nouvellesReponses.length === 1 ? 'Lire la réponse' : 'Lire les réponses'}
                      onAction={() => allerA('demandes')}
                    />
                  )}
                  {parEtape.prete.length > 0 && (
                    <Alerte
                      icone={PackageCheck}
                      ton="emerald"
                      titre={`${compte(parEtape.prete.length, 'commande prête', 'commandes prêtes')} à livrer`}
                      texte={`${pluriel(parEtape.prete.length, 'Elle vous attend', 'Elles vous attendent')} dans notre entrepôt. Dites-nous quand, et si vous préférez la livraison ou le retrait à notre entrepôt.`}
                      action="Organiser la livraison"
                      onAction={organiserLivraison}
                    />
                  )}
                  {conteneursRetardes > 0 && (
                    <Alerte
                      icone={TriangleAlert}
                      ton="ambre"
                      titre={conteneursRetardes === 1 ? 'L’arrivée d’un conteneur a été repoussée' : `L’arrivée de ${conteneursRetardes} conteneurs a été repoussée`}
                      texte="La compagnie maritime a revu sa date. Les nouvelles dates sont à jour sur vos commandes, avec l’écart en jours."
                      action="Voir les dates"
                      onAction={() => allerA('mer')}
                    />
                  )}
                </div>
              )}

              {commandes.length > 0 && (
                <>
                  <ArriveesAVenir commandes={commandes} conteneurs={conteneursSurs} onOuvrir={ouvrirFiche} />
                  <Nouveautes commandes={commandes} conteneurs={conteneursSurs} onOuvrir={ouvrirFiche} />
                </>
              )}

              {parEtape.douane.length > 0 && (
                <Section icone={FileText} fond="bg-indigo-50" texte="text-indigo-600" titre="En douane" phrase={phraseEtape('CUSTOMS')}>
                  <GrilleConteneurs commandes={parEtape.douane} conteneurs={conteneursSurs} mode="douane" onOuvrir={ouvrirFiche} />
                </Section>
              )}

              {/* Pas de section « En mer » ici : « Arrivées à venir » la montre déjà,
                  conteneur par conteneur ; la tuile et l'onglet « En mer » donnent le détail. */}

              <GrilleCommandes
                titre="Prêtes à livrer" icone={PackageCheck} ton="bg-emerald-50 text-emerald-600"
                commandes={parEtape.prete} conteneurs={conteneursSurs} sousTitre={phraseEtape('STOCK')} onOuvrir={ouvrirFiche}
                avant={<div className="px-2 mb-4">{boutonLivraison}</div>}
              />
              <GrilleCommandes
                titre="En fabrication" icone={Factory} ton="bg-amber-50 text-amber-600"
                commandes={parEtape.fabrication} conteneurs={conteneursSurs} sousTitre={phraseEtape('PI')} onOuvrir={ouvrirFiche}
              />

              {enRoute === 0 && (
                <EtatVide
                  titre="Rien en route pour le moment"
                  texte={parEtape.enregistree.length > 0
                    ? parEtape.enregistree.length > 1
                      ? `${parEtape.enregistree.length} commandes sont enregistrées : vous les suivrez ici dès leur lancement en fabrication.`
                      : '1 commande est enregistrée : vous la suivrez ici dès son lancement en fabrication.'
                    : 'Vos commandes apparaîtront ici dès leur lancement en fabrication.'}
                >
                  {commandes.length > 0 && (
                    <button type="button" onClick={() => allerA('commandes')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors">
                      <Package className="w-4 h-4" /> Toutes mes commandes
                    </button>
                  )}
                  <button type="button" onClick={() => ouvrirFormulaire('question')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-[10px] font-black uppercase tracking-widest hover:border-[#c4a062] transition-colors">
                    <MessageCircleQuestion className="w-4 h-4" /> Poser une question
                  </button>
                </EtatVide>
              )}
            </div>
          )}

          {/* ═══ Toutes mes commandes ═══ */}
          {onglet === 'commandes' && (
            <ToutesMesCommandes
              commandes={commandes}
              conteneurs={conteneursSurs}
              recherche={recherche}
              onRecherche={setRecherche}
              onOuvrir={ouvrirFiche}
              documents={documents()}
              autoFocus={focusRecherche}
            />
          )}

          {/* ═══ Par étape ═══ */}
          {onglet === 'enregistrees' && (
            <div className="animate-in fade-in">
              <GrilleCommandes titre="Commandes enregistrées" icone={ClipboardList} ton="bg-orange-50 text-orange-600" commandes={parEtape.enregistree} conteneurs={conteneursSurs} sousTitre={phraseEtape('TO_ORDER')} onOuvrir={ouvrirFiche} />
              {parEtape.enregistree.length === 0 && <EtatVide texte="Aucune commande en attente de lancement." />}
            </div>
          )}

          {onglet === 'fabrication' && (
            <div className="animate-in fade-in">
              <GrilleCommandes titre="En fabrication" icone={Factory} ton="bg-amber-50 text-amber-600" commandes={parEtape.fabrication} conteneurs={conteneursSurs} sousTitre={phraseEtape('PI')} onOuvrir={ouvrirFiche} />
              {parEtape.fabrication.length === 0 && <EtatVide texte="Aucune commande en fabrication en ce moment." />}
            </div>
          )}

          {onglet === 'mer' && (
            <div className="animate-in fade-in">
              {parEtape.mer.length > 0
                ? (
                  <Section icone={Ship} fond="bg-blue-50" texte="text-blue-600" titre="En mer" phrase={phraseEtape('TRANSIT')}>
                    <GrilleConteneurs commandes={parEtape.mer} conteneurs={conteneursSurs} mode="mer" onOuvrir={ouvrirFiche} />
                  </Section>
                )
                : <EtatVide texte="Aucune commande en mer en ce moment." />}
            </div>
          )}

          {onglet === 'douane' && (
            <div className="animate-in fade-in">
              {parEtape.douane.length > 0
                ? (
                  <Section icone={FileText} fond="bg-indigo-50" texte="text-indigo-600" titre="En douane" phrase={phraseEtape('CUSTOMS')}>
                    <GrilleConteneurs commandes={parEtape.douane} conteneurs={conteneursSurs} mode="douane" onOuvrir={ouvrirFiche} />
                  </Section>
                )
                : <EtatVide texte="Aucune commande en dédouanement en ce moment." />}
            </div>
          )}

          {onglet === 'pretes' && (
            <div className="animate-in fade-in">
              {parEtape.prete.length > 0 && (
                <div className="mb-8 rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 sm:p-8 shadow-xl shadow-emerald-700/10 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" aria-hidden />
                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-emerald-100 font-black text-[10px] uppercase tracking-[0.2em] mb-2">Dans notre entrepôt</p>
                      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        {parEtape.prete.length > 1
                          ? `${parEtape.prete.length} commandes vous attendent`
                          : '1 commande vous attend'}
                      </h1>
                      <p className="mt-2 text-sm font-medium text-emerald-50/80 max-w-xl">
                        Livraison chez vous ou retrait à notre entrepôt, à la date qui vous convient : dites-nous tout en une seule demande.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={organiserLivraison}
                      className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-800 text-[12px] font-black uppercase tracking-widest shadow-lg transition-colors"
                    >
                      <Truck className="w-5 h-5" /> Organiser la livraison
                    </button>
                  </div>
                </div>
              )}
              <GrilleCommandes titre="Prêtes à livrer" icone={PackageCheck} ton="bg-emerald-50 text-emerald-600" commandes={parEtape.prete} conteneurs={conteneursSurs} sousTitre={phraseEtape('STOCK')} onOuvrir={ouvrirFiche} />
              {parEtape.prete.length === 0 && <EtatVide texte="Aucune commande prête à livrer pour le moment." />}
            </div>
          )}

          {onglet === 'livrees' && (
            <div className="animate-in fade-in">
              <GrilleCommandes titre="Commandes livrées" icone={History} ton="bg-stone-100 text-stone-600" commandes={parEtape.livree} conteneurs={conteneursSurs} onOuvrir={ouvrirFiche} />
              {parEtape.livree.length === 0 && <EtatVide texte="Aucune commande livrée pour l’instant." />}
            </div>
          )}

          {/* ═══ Mes demandes ═══ */}
          {onglet === 'demandes' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="px-2">
                <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest">Sans téléphoner</p>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">Mes demandes</h1>
                <p className="mt-1 text-xs font-medium text-stone-500 max-w-2xl">
                  Chaque demande nous arrive aussitôt. Vous suivez ici son avancement (envoyée, prise en charge, traitée) et lisez notre réponse.
                </p>
              </div>
              {/* Sans demande encore, la liste vide propose déjà ces trois demandes : pas deux fois. */}
              {demandes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { type: 'recommande', icone: Repeat, titre: 'Recommander', texte: 'Un produit déjà commandé, dans la quantité de votre choix.', ids: [] as string[] },
                    { type: 'livraison', icone: Truck, titre: 'Livraison / retrait', texte: parEtape.prete.length > 0 ? `${compte(parEtape.prete.length, 'commande prête', 'commandes prêtes')} dans notre entrepôt.` : 'Pour ce qui sera prêt dans notre entrepôt.', ids: pretesIds },
                    { type: 'question', icone: MessageCircleQuestion, titre: 'Poser une question', texte: 'Sur une commande, ou toute autre question.', ids: [] as string[] },
                  ] as const).map(a => (
                    <button
                      key={a.type}
                      type="button"
                      onClick={() => ouvrirFormulaire(a.type, [...a.ids])}
                      className="group text-left bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-[#c4a062]/50 hover:shadow-md transition-all"
                    >
                      <span className="w-11 h-11 rounded-xl bg-[#c4a062]/10 text-[#a38042] flex items-center justify-center shrink-0 group-hover:bg-[#c4a062] group-hover:text-white transition-colors">
                        <a.icone className="w-5 h-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black text-stone-900 uppercase tracking-widest">{a.titre}</span>
                        <span className="block mt-0.5 text-xs font-medium text-stone-500 leading-snug">{a.texte}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <ListeDemandes
                demandes={demandes}
                commandes={commandes}
                onNouvelle={t => ouvrirFormulaire(t, t === 'livraison' ? pretesIds : [])}
              />
            </div>
          )}

          {/* ═══ Mon activité ═══ */}
          {onglet === 'activite' && (
            <div className="animate-in fade-in">
              <Activite commandes={commandes} />
            </div>
          )}

          {/* ═══ Aide ═══ */}
          {onglet === 'aide' && (
            <AideClient
              whatsapp={whatsapp}
              clientName={clientName}
              onNouvelleDemande={t => ouvrirFormulaire(t, t === 'livraison' ? pretesIds : [])}
              installation={installation}
            />
          )}
        </div>
      </main>

      {/* ─── Barre du bas (téléphone) ─── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="Raccourcis"
      >
        <div className="grid grid-cols-4">
          {barreBas.map(b => {
            const actif = onglet === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => allerA(b.id)}
                aria-current={actif ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${actif ? 'text-[#a38042]' : 'text-stone-400 hover:text-stone-700'}`}
              >
                <span className="relative">
                  <b.icone className="w-5 h-5" />
                  {b.point && <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#c4a062] ring-2 ring-white" aria-label="Nouvelle réponse" />}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest">{b.label}</span>
                {actif && <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-[#c4a062]" aria-hidden />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ─── La fiche d'une commande ─── */}
      <FicheCommande
        commande={commandeFiche}
        conteneur={commandeFiche ? conteneurDe(commandeFiche, conteneursSurs) : undefined}
        whatsapp={whatsapp}
        ouverte={Boolean(fiche?.ouverte && commandeFiche)}
        onFermer={fermerFiche}
        onDemande={(type, c) => {
          // La fiche se referme : sur téléphone, le formulaire prend tout l'écran.
          // Son entrée d'historique devient celle du formulaire : « retour »
          // referme le formulaire et ramène à l'onglet, pas à la fiche.
          masquerFiche();
          ouvrirFormulaire(type, [c.id]);
        }}
        onTelechargerPdf={telechargerFiche}
      />

      {/* ─── Le formulaire des demandes ─── */}
      <FormulaireDemande
        type={formulaire.type}
        commandes={commandes}
        preselection={formulaire.preselection}
        ouvert={formulaire.type !== null}
        onFermer={fermerFormulaire}
        envoyer={envoyerDemande}
        whatsapp={whatsapp}
      />
    </div>
  );
}
