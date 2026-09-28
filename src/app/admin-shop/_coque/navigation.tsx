'use client';

// ─── Navigation de l'admin boutique ──────────────────────────────────────────
// Ordinateur : barre latérale fixe. Téléphone : barre du bas à 5 cases
// (Commandes, Tableau, Produits, Clients, Plus) ; « Plus » ouvre un panneau avec
// le reste (Catégories, Catalogue, Accès équipe, la boutique, Publier, la déconnexion).
// Commandes vient en premier et porte la pastille du nombre à confirmer.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ExternalLink,
  Grid3X3,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Shield,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { BoutonPublier } from './bouton-publier';
import { PastilleAConfirmer, VoyantConnexion, type InfosConnexion, type Utilisateur } from './en-tete';
import { TITRES_VUES, type VueAdmin } from './vues';

const ICONES: Record<VueAdmin, (c: string) => ReactNode> = {
  commandes: c => <Package className={c} />,
  tableau: c => <LayoutDashboard className={c} />,
  produits: c => <ShoppingBag className={c} />,
  categories: c => <Grid3X3 className={c} />,
  clients: c => <Users className={c} />,
  catalogue: c => <BookOpen className={c} />,
  equipe: c => <KeyRound className={c} />,
};

/** Ordre du menu : le travail du jour d'abord. */
const ORDRE: VueAdmin[] = ['commandes', 'tableau', 'produits', 'categories', 'clients', 'catalogue'];
/** Section basse de la barre latérale : les réglages, qu'on ouvre rarement, loin du travail du jour. */
const REGLAGES: VueAdmin[] = ['equipe'];

/** Barre du bas : 4 écrans + « Plus ». Libellés courts : « Commandes » tient en 12 px dans une case de 75 px. */
const BARRE_BAS: { vue: VueAdmin; libelle: string }[] = [
  { vue: 'commandes', libelle: 'Commandes' },
  { vue: 'tableau', libelle: 'Tableau' },
  { vue: 'produits', libelle: 'Produits' },
  { vue: 'clients', libelle: 'Clients' },
];
const DANS_PLUS: VueAdmin[] = ['categories', 'catalogue', 'equipe'];

export function NavigationAdmin({
  vue,
  onVue,
  aConfirmer,
  enRetard,
  connexion,
  onReessayer,
  utilisateur,
  onDeconnexion,
}: {
  vue: VueAdmin;
  onVue: (v: VueAdmin) => void;
  aConfirmer: number;
  enRetard: number;
  connexion: InfosConnexion;
  onReessayer: () => void;
  utilisateur: Utilisateur;
  onDeconnexion: () => void;
}) {
  const [plusOuvert, setPlusOuvert] = useState(false);

  /** Un écran dans la barre latérale (travail du jour ou réglages : même bouton). */
  const boutonLateral = (v: VueAdmin) => {
    const actif = vue === v;
    return (
      <button
        key={v}
        type="button"
        onClick={() => onVue(v)}
        aria-current={actif ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
          actif ? 'bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/25' : 'text-gray-300 hover:text-white hover:bg-white/5'
        }`}
      >
        {ICONES[v]('w-5 h-5 flex-shrink-0')}
        <span className="flex-1 text-left">{TITRES_VUES[v]}</span>
        {v === 'commandes' && (
          <PastilleAConfirmer nombre={aConfirmer} enRetard={enRetard} surFondRouge={actif} />
        )}
      </button>
    );
  };

  return (
    <>
      {/* ─── Barre latérale (ordinateur) ─── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col sticky top-0 h-screen bg-[#0F0F0F] border-r border-white/5">
        <div className="px-5 py-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C8102E] flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm tracking-wide">LEBTEX</p>
              <p className="text-gray-400 text-xs">Boutique en ligne</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Écrans de l'admin">
          {ORDRE.map(v => boutonLateral(v))}

          <div className="pt-4 border-t border-white/5 mt-4 space-y-1">
            {REGLAGES.map(v => boutonLateral(v))}
            <a
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Voir la boutique
            </a>
          </div>
        </nav>

        {/* L'en-tête défile avec la page : le voyant reste visible ici. */}
        <div className="px-4 py-4 border-t border-white/5">
          <VoyantConnexion connexion={connexion} onReessayer={onReessayer} compact />
        </div>
      </aside>

      {/* ─── Barre du bas (téléphone) ─── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0F0F0F] border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Écrans de l'admin"
      >
        <div className="grid grid-cols-5">
          {BARRE_BAS.map(({ vue: v, libelle }) => {
            const actif = vue === v && !plusOuvert;
            return (
              <button
                key={v}
                type="button"
                onClick={() => { setPlusOuvert(false); onVue(v); }}
                aria-current={actif ? 'page' : undefined}
                aria-label={v === 'commandes' && aConfirmer > 0 ? `Commandes, ${aConfirmer} à confirmer` : libelle}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[56px] px-1 transition-colors ${
                  actif ? 'text-white' : 'text-gray-400'
                }`}
              >
                {actif && <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-[#C8102E]" aria-hidden />}
                <span className="relative">
                  {ICONES[v](`w-[22px] h-[22px] ${actif ? 'text-[#E0314D]' : ''}`)}
                  {v === 'commandes' && (
                    <PastilleAConfirmer nombre={aConfirmer} enRetard={enRetard} className="absolute -top-2 left-3.5" />
                  )}
                </span>
                <span className="text-xs font-semibold leading-none">{libelle}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPlusOuvert(o => !o)}
            aria-expanded={plusOuvert}
            aria-haspopup="dialog"
            className={`relative flex flex-col items-center justify-center gap-1 min-h-[56px] px-1 transition-colors ${
              plusOuvert || DANS_PLUS.includes(vue) ? 'text-white' : 'text-gray-400'
            }`}
          >
            {(plusOuvert || DANS_PLUS.includes(vue)) && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-[#C8102E]" aria-hidden />
            )}
            <MoreHorizontal className="w-[22px] h-[22px]" />
            <span className="text-xs font-semibold leading-none">Plus</span>
          </button>
        </div>
      </nav>

      {plusOuvert && (
        <PanneauPlus
          vue={vue}
          onVue={v => { setPlusOuvert(false); onVue(v); }}
          onFermer={() => setPlusOuvert(false)}
          utilisateur={utilisateur}
          onDeconnexion={() => { setPlusOuvert(false); onDeconnexion(); }}
        />
      )}
    </>
  );
}

// ─── Panneau « Plus » (téléphone) ─────────────────────────────────────────────

function PanneauPlus({ vue, onVue, onFermer, utilisateur, onDeconnexion }: {
  vue: VueAdmin;
  onVue: (v: VueAdmin) => void;
  onFermer: () => void;
  utilisateur: Utilisateur;
  onDeconnexion: () => void;
}) {
  const fermerRef = useRef<HTMLButtonElement>(null);
  // La page se redessine souvent (commandes en direct, horloge) : l'effet ne
  // doit tourner qu'à l'ouverture, sinon le focus sauterait sans cesse.
  const onFermerRef = useRef(onFermer);
  onFermerRef.current = onFermer;

  useEffect(() => {
    fermerRef.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermerRef.current(); };
    document.addEventListener('keydown', touche);
    // La page ne défile pas derrière le panneau.
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', touche);
      document.body.style.overflow = avant;
    };
  }, []);

  const ligne = 'w-full min-h-[48px] flex items-center gap-3 px-4 rounded-xl text-sm font-semibold transition-colors';

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Plus d'options">
      <div className="absolute inset-0 bg-black/70" onClick={onFermer} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#141414] border-t border-white/10 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-base">Plus</p>
          <button ref={fermerRef} type="button" onClick={onFermer} aria-label="Fermer"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-gray-300 hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {DANS_PLUS.map(v => {
            const actif = vue === v;
            return (
              <button key={v} type="button" onClick={() => onVue(v)} aria-current={actif ? 'page' : undefined}
                className={`${ligne} ${actif ? 'bg-[#C8102E] text-white' : 'bg-white/5 text-gray-200'}`}>
                {ICONES[v]('w-5 h-5')}
                {TITRES_VUES[v]}
              </button>
            );
          })}
          <a href="/shop" target="_blank" rel="noopener noreferrer" onClick={onFermer}
            className={`${ligne} bg-white/5 text-gray-200`}>
            <ExternalLink className="w-5 h-5" />
            Voir la boutique
          </a>
        </div>

        <BoutonPublier variante="panneau" />

        <div className="pt-3 border-t border-white/10 space-y-2">
          <div className="px-1 min-w-0">
            <p className="text-gray-400 text-xs">Connecté en tant que</p>
            <p className="text-gray-200 text-sm font-medium truncate">{utilisateur.email}</p>
          </div>
          <button type="button" onClick={onDeconnexion}
            className={`${ligne} bg-red-500/10 text-red-300`}>
            <LogOut className="w-5 h-5" />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
