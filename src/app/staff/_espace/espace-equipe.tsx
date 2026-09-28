'use client';

// ─── Espace équipe : la coque ────────────────────────────────────────────────
// Deux écrans seulement, ceux du travail du jour :
//   • Commandes : le même écran que l'admin (files, fiche, appel, WhatsApp,
//     statut, annulation avec motif, note interne, bon de livraison, e-mail de
//     confirmation). Les actions passent par le serveur, qui revérifie l'accès.
//   • Demandes clients : les demandes envoyées depuis l'espace client (écran
//     propre à l'équipe, dans la même coque sombre : demandes-equipe.tsx).
// Rien d'autre : ni produits, ni catalogue, ni clients, ni chiffres, ni lien
// vers l'admin, le stock ou la gestion.
//
// Ordinateur : onglets dans l'en-tête. Téléphone : barre du bas (Commandes,
// Demandes, Compte). La fiche ouverte vit dans l'adresse (?commande=ID) et le
// bouton Retour du téléphone la ferme au lieu de quitter l'espace.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Firestore } from 'firebase/firestore';
import { Inbox, LogOut, Package, UserRound, type LucideIcon } from 'lucide-react';
import { EcranCommandes } from '@/app/admin-shop/_commandes/ecran-commandes';
import { actionsFirestore } from '@/app/admin-shop/_commandes/actions-commandes';
import { useAlerteNouvellesCommandes } from '@/app/admin-shop/_commandes/use-alerte-nouvelles-commandes';
import { useCommandesEnDirect } from '@/app/admin-shop/_commandes/use-commandes-en-direct';
import { signalerAccesRefuse } from '@/lib/acces-equipe';
// Depuis voyants.tsx et non en-tete.tsx : ce dernier embarquerait le bouton Publier de l'admin.
import { PastilleAConfirmer, VoyantConnexion, type InfosConnexion } from '@/app/admin-shop/_coque/voyants';
import { resumeAConfirmer, useMaintenant } from '@/app/admin-shop/_coque/etat-commandes';
import type { CompteAffiche } from './acces';
import { adresseEquipe, lireAdresseEquipe, MARQUE_FICHE, TITRES_ONGLETS, type OngletEquipe } from './adresse';
import { DemandesEquipe } from './demandes-equipe';
import { FenetreCompte } from './fenetre-compte';
import { LogoLebtex } from './marque';

/** Largeur du contenu, partagée par l'en-tête et l'écran : tout reste aligné. */
const CONTENU = 'mx-auto w-full max-w-[1600px] px-4 md:px-6';

/**
 * Hauteur prise au-dessus et au-dessous de l'écran Commandes sur grand écran :
 * en-tête (4rem) + marge du haut (1.5rem) + marge du bas (2rem). La liste et la
 * fiche défilent alors chacune de leur côté, sans faire défiler la page.
 */
const DECALAGE_ECRAN_COMMANDES = '7.5rem';

const ICONES: Record<OngletEquipe, LucideIcon> = { commandes: Package, demandes: Inbox };
/** Libellés de la barre du bas : « Demandes clients » ne tient pas dans une case de téléphone. */
const LIBELLES_COURTS: Record<OngletEquipe, string> = { commandes: 'Commandes', demandes: 'Demandes' };
const ONGLETS: OngletEquipe[] = ['commandes', 'demandes'];

/** Titre de l'onglet et page des notifications : ceux de l'espace équipe, pas de l'admin. */
const OPTIONS_ALERTE = { titre: 'LEBTEX Équipe', page: '/staff' } as const;

// ─── Historique du navigateur ─────────────────────────────────────────────────

type EtatHistorique = Record<string, unknown>;
const etatHistorique = (): EtatHistorique => (window.history.state as EtatHistorique | null) ?? {};
const entreeDeFiche = () => !!etatHistorique()[MARQUE_FICHE];
const remplacerEntree = (url: string, fiche: boolean) =>
  window.history.replaceState({ ...etatHistorique(), [MARQUE_FICHE]: fiche }, '', url);
const ajouterEntreeFiche = (url: string) =>
  window.history.pushState({ ...etatHistorique(), [MARQUE_FICHE]: true }, '', url);

function adresseInitiale() {
  if (typeof window === 'undefined') return { onglet: 'commandes' as OngletEquipe, commande: null as string | null };
  return lireAdresseEquipe(window.location.search);
}

// ─── Pastille des demandes nouvelles ──────────────────────────────────────────

function PastilleDemandes({ nombre, surFondRouge = false, className = '' }: {
  nombre: number;
  surFondRouge?: boolean;
  className?: string;
}) {
  if (nombre <= 0) return null;
  return (
    <span
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold leading-none ${
        surFondRouge ? 'bg-white text-red-700' : 'bg-amber-400 text-black'
      } ${className}`}
    >
      <span aria-hidden>{nombre > 99 ? '99+' : nombre}</span>
      <span className="sr-only">{`, ${nombre} nouvelle${nombre > 1 ? 's' : ''}`}</span>
    </span>
  );
}

// ─── Coque ────────────────────────────────────────────────────────────────────

export function EspaceEquipe({ db, email, compte, onDeconnexion }: {
  db: Firestore;
  /** Adresse du compte connecté. Le serveur, lui, ne se fie qu'au jeton pour signer les actions. */
  email: string;
  compte: CompteAffiche;
  /** Déconnecte ; rejette si la déconnexion a échoué. */
  onDeconnexion: () => Promise<void>;
}) {
  // ── Commandes en temps réel (même écoute que l'admin) ──
  const { orders, pret, chargement, erreur, etat, actualiseLe, reessayer } = useCommandesEnDirect(db);
  const connexion: InfosConnexion = { etat, message: erreur, actualiseLe };

  // La base refuse la liste (mot de passe changé, accès désactivé…) : la page
  // revérifie tout de suite la session et ramène à la connexion s'il le faut.
  useEffect(() => {
    if (etat === 'erreur') signalerAccesRefuse(403);
  }, [etat]);

  // ── Onglet et fiche ouverte, gardés dans l'adresse ──
  const [onglet, setOnglet] = useState<OngletEquipe>(() => adresseInitiale().onglet);
  const [commandeOuverteId, setCommandeOuverteId] = useState<string | null>(() => adresseInitiale().commande);
  const ongletRef = useRef(onglet);
  ongletRef.current = onglet;
  // Fiche ouverte « tout de suite » (avant le rendu suivant) : deux appuis rapides n'empilent pas deux entrées.
  const ficheRef = useRef(commandeOuverteId);
  ficheRef.current = commandeOuverteId;
  /** Un recul d'historique est parti (fermeture de fiche) et n'est pas encore arrivé. */
  const retourEnCours = useRef(false);
  /** Commande à ouvrir dès que ce recul sera arrivé. */
  const ouvrirApresRetour = useRef<string | null>(null);
  const ouvrirRef = useRef<(id: string) => void>(() => {});

  // Lien direct vers une fiche (/staff?commande=ID) : on glisse la liste dessous,
  // pour que « retour » ramène aux commandes plutôt que de quitter l'espace.
  useEffect(() => {
    const { commande } = lireAdresseEquipe(window.location.search);
    if (!commande || entreeDeFiche()) return;
    remplacerEntree(adresseEquipe(window.location.href, 'commandes', null), false);
    ajouterEntreeFiche(adresseEquipe(window.location.href, 'commandes', commande));
  }, []);

  // Retour / Suivant du navigateur (ou geste du téléphone) : l'écran suit l'adresse.
  useEffect(() => {
    const auRetour = () => {
      retourEnCours.current = false;
      const { onglet: o, commande } = lireAdresseEquipe(window.location.search);
      ficheRef.current = commande;
      setOnglet(o);
      setCommandeOuverteId(commande);
      const enAttente = ouvrirApresRetour.current;
      ouvrirApresRetour.current = null;
      if (enAttente && !commande) ouvrirRef.current(enAttente);
    };
    window.addEventListener('popstate', auRetour);
    return () => window.removeEventListener('popstate', auRetour);
  }, []);

  const fermerSansHistorique = useCallback(() => {
    remplacerEntree(adresseEquipe(window.location.href, ongletRef.current, null), false);
    ficheRef.current = null;
    setCommandeOuverteId(null);
  }, []);

  /** Fermer la fiche : son entrée d'historique (ajoutée à l'ouverture) est retirée, comme avec le bouton Retour. */
  const fermerFiche = useCallback(() => {
    if (retourEnCours.current || !ficheRef.current) return;
    if (!entreeDeFiche()) { fermerSansHistorique(); return; }
    retourEnCours.current = true;
    window.history.back();
    // Filet : si le navigateur n'a pas reculé (cas rare), la fiche se ferme quand même,
    // et la commande touchée entre-temps s'ouvre maintenant (plus tard, elle
    // s'ouvrirait au prochain « retour » sans rapport).
    window.setTimeout(() => {
      if (!retourEnCours.current) return;
      retourEnCours.current = false;
      const enAttente = ouvrirApresRetour.current;
      ouvrirApresRetour.current = null;
      fermerSansHistorique();
      if (enAttente) ouvrirRef.current(enAttente);
    }, 1000);
  }, [fermerSansHistorique]);

  // Ouvrir une commande (carte, historique du client, alerte « Nouvelle commande »).
  // Stable : le hook d'alerte la reçoit en paramètre.
  const ouvrirCommande = useCallback((id: string | null) => {
    if (!id) { fermerFiche(); return; }
    if (retourEnCours.current) { ouvrirApresRetour.current = id; return; }
    const url = adresseEquipe(window.location.href, 'commandes', id);
    if (ficheRef.current) {
      // Une fiche est déjà ouverte (autre commande du même client) : on la remplace, sans empiler.
      remplacerEntree(url, entreeDeFiche());
    } else {
      ajouterEntreeFiche(url);
    }
    ficheRef.current = id;
    setOnglet('commandes');
    setCommandeOuverteId(id);
  }, [fermerFiche]);
  useEffect(() => { ouvrirRef.current = id => ouvrirCommande(id); }, [ouvrirCommande]);

  const changerOnglet = useCallback((o: OngletEquipe) => {
    window.scrollTo({ top: 0 });
    if (o === ongletRef.current) return;
    // La fiche fait partie de l'onglet Commandes : on la ferme en le quittant.
    if (ficheRef.current) {
      ficheRef.current = null;
      setCommandeOuverteId(null);
    }
    remplacerEntree(adresseEquipe(window.location.href, o, null), false);
    setOnglet(o);
  }, []);

  // ── Alerte des nouvelles commandes (son, message, titre de l'onglet), quel que soit l'onglet ──
  const alerte = useAlerteNouvellesCommandes(orders, pret, ouvrirCommande, OPTIONS_ALERTE);
  const marquerVueRef = useRef(alerte.marquerVue);
  useEffect(() => { marquerVueRef.current = alerte.marquerVue; });
  useEffect(() => {
    if (commandeOuverteId) marquerVueRef.current(commandeOuverteId);
  }, [commandeOuverteId]);

  // ── Actions (statut, note, e-mail au client) : via le serveur, signées par le compte connecté ──
  const actions = useMemo(() => actionsFirestore(db, email), [db, email]);

  // ── Pastilles ──
  const maintenant = useMaintenant();
  const resume = useMemo(() => resumeAConfirmer(orders, maintenant), [orders, maintenant]);
  const [demandesNouvelles, setDemandesNouvelles] = useState(0);

  // ── Compte ──
  const [fenetre, setFenetre] = useState<'compte' | 'deconnexion' | null>(null);
  const fermerFenetre = useCallback(() => setFenetre(null), []);
  const seDeconnecter = useCallback(async () => {
    await onDeconnexion();
    // La prochaine personne connectée sur cet appareil repart de la liste des commandes.
    try { remplacerEntree(window.location.pathname, false); } catch { /* adresse laissée telle quelle */ }
  }, [onDeconnexion]);

  /** Nom lu par les lecteurs d'écran dans la barre du bas : l'écran et ce qui attend. */
  const libelleAccessible = (o: OngletEquipe): string => {
    if (o === 'commandes') {
      if (!resume.aConfirmer) return TITRES_ONGLETS.commandes;
      return `${TITRES_ONGLETS.commandes}, ${resume.aConfirmer} à confirmer${resume.enRetard ? `, dont ${resume.enRetard} en retard` : ''}`;
    }
    if (!demandesNouvelles) return TITRES_ONGLETS.demandes;
    return `${TITRES_ONGLETS.demandes}, ${demandesNouvelles} nouvelle${demandesNouvelles > 1 ? 's' : ''}`;
  };

  const pastille = (o: OngletEquipe, surFondRouge = false, className = ''): ReactNode =>
    o === 'commandes'
      ? <PastilleAConfirmer nombre={resume.aConfirmer} enRetard={resume.enRetard} surFondRouge={surFondRouge} className={className} />
      : <PastilleDemandes nombre={demandesNouvelles} surFondRouge={surFondRouge} className={className} />;

  return (
    <div
      className="min-h-[100dvh] bg-[#0F0F0F] text-gray-100"
      style={{ '--decalage-ecran-commandes': DECALAGE_ECRAN_COMMANDES } as CSSProperties}
    >
      {/* ─── En-tête ─── */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0F0F0F]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className={`${CONTENU} flex h-14 items-center gap-3 md:h-16 md:gap-4`}>
          <LogoLebtex />
          <span className="hidden items-baseline gap-1.5 whitespace-nowrap lg:flex" aria-hidden>
            <span className="text-[15px] font-black tracking-wide text-white">LEBTEX</span>
            <span className="text-gray-400">·</span>
            <span className="text-[15px] font-semibold text-gray-300">Équipe</span>
          </span>

          {/* Téléphone : l'écran affiché. Ordinateur : caché à l'œil (les onglets le disent), gardé pour les lecteurs d'écran. */}
          <div className="min-w-0 flex-1 md:sr-only">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">LEBTEX · Équipe</p>
            <h1 className="truncate text-base font-bold leading-tight text-white">{TITRES_ONGLETS[onglet]}</h1>
          </div>

          {/* Onglets (ordinateur) */}
          <nav className="hidden items-center gap-1.5 md:flex lg:ml-3" aria-label="Écrans de l'espace équipe">
            {ONGLETS.map(o => {
              const actif = onglet === o;
              const Icone = ICONES[o];
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => changerOnglet(o)}
                  aria-current={actif ? 'page' : undefined}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
                    actif ? 'bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/25' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icone className="h-[18px] w-[18px]" aria-hidden />
                  {TITRES_ONGLETS[o]}
                  {pastille(o, actif)}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2 md:gap-3">
            {/* Le voyant parle des commandes : vert seulement quand elles arrivent vraiment en direct. */}
            <span className="flex max-w-[11rem] md:hidden">
              <VoyantConnexion connexion={connexion} onReessayer={reessayer} compact />
            </span>
            <span className="hidden md:inline-flex">
              <VoyantConnexion connexion={connexion} onReessayer={reessayer} />
            </span>

            <div className="hidden items-center gap-2 border-l border-white/10 pl-3 md:flex">
              <span className="hidden items-center gap-2 xl:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C8102E] text-xs font-bold text-white" aria-hidden>
                  {compte.initiale}
                </span>
                <span className="min-w-0 max-w-[180px]">
                  <span className="block truncate text-xs text-gray-400">{compte.titre}</span>
                  <span className="block truncate text-sm font-medium text-gray-100">{compte.detail}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFenetre('deconnexion')}
                aria-haspopup="dialog"
                title="Se déconnecter"
                className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="sr-only lg:not-sr-only">Se déconnecter</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Écrans ─── */}
      {/* En bas sur téléphone : la hauteur de la barre du bas et de la zone sûre, pour que rien ne soit caché.
          overflow-x-clip (et non auto) : coupe un débordement latéral sans casser les éléments « sticky ». */}
      <main className={`${CONTENU} min-w-0 overflow-x-clip pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:pb-8 md:pt-6`}>
        <div className={onglet === 'commandes' ? '' : 'hidden'}>
          <EcranCommandes
            orders={orders}
            chargement={chargement}
            erreur={erreur}
            actions={actions}
            commandeOuverteId={commandeOuverteId}
            onOuvrir={ouvrirCommande}
            nonVues={alerte.nonVues}
            alertes={alerte}
            onReessayer={reessayer}
            // L'e-mail « nouvelle commande » va à l'administrateur, pas à l'équipe.
            prevenuParEmail={false}
          />
        </div>

        {/* Toujours montée : elle se rafraîchit chaque minute et tient la pastille à jour
            (sans message volant, qui effacerait l'alerte « Nouvelle commande »). */}
        <section aria-label="Demandes des clients" className={onglet === 'demandes' ? 'mx-auto max-w-3xl' : 'hidden'}>
          <DemandesEquipe actif={onglet === 'demandes'} onNouvelles={setDemandesNouvelles} />
        </section>
      </main>

      {/* ─── Barre du bas (téléphone) ─── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0F0F0F] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Écrans de l'espace équipe"
      >
        <div className="grid grid-cols-3">
          {ONGLETS.map(o => {
            const actif = onglet === o && !fenetre;
            const Icone = ICONES[o];
            return (
              <button
                key={o}
                type="button"
                onClick={() => changerOnglet(o)}
                aria-current={actif ? 'page' : undefined}
                aria-label={libelleAccessible(o)}
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60 ${
                  actif ? 'text-white' : 'text-gray-400'
                }`}
              >
                {actif && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[#C8102E]" aria-hidden />}
                <span className="relative">
                  <Icone className={`h-[22px] w-[22px] ${actif ? 'text-[#E0314D]' : ''}`} aria-hidden />
                  {pastille(o, false, 'absolute -top-2 left-3.5')}
                </span>
                <span className="text-xs font-semibold leading-none">{LIBELLES_COURTS[o]}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFenetre('compte')}
            aria-haspopup="dialog"
            aria-expanded={fenetre === 'compte'}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60 ${
              fenetre === 'compte' ? 'text-white' : 'text-gray-400'
            }`}
          >
            {fenetre === 'compte' && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[#C8102E]" aria-hidden />}
            <UserRound className={`h-[22px] w-[22px] ${fenetre === 'compte' ? 'text-[#E0314D]' : ''}`} aria-hidden />
            <span className="text-xs font-semibold leading-none">Compte</span>
          </button>
        </div>
      </nav>

      {fenetre && (
        <FenetreCompte
          compte={compte}
          intention={fenetre}
          onFermer={fermerFenetre}
          onDeconnexion={seDeconnecter}
        />
      )}
    </div>
  );
}
