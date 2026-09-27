'use client';

// ─── En-tête de l'admin boutique ─────────────────────────────────────────────
// Sur téléphone : le titre de l'écran et le voyant, rien d'autre (l'en-tête ne
// doit jamais dépasser de l'écran ; Publier et la déconnexion sont dans « Plus »).
// Sur ordinateur : en plus, la pastille « N à confirmer », Publier et le compte.

import { AlertCircle, LogOut, Shield } from 'lucide-react';
import { BoutonPublier } from './bouton-publier';
import { heureCourte, type EtatConnexion } from './etat-commandes';
import { TITRES_VUES, type VueAdmin } from './vues';

export interface InfosConnexion {
  etat: EtatConnexion;
  /** Message d'erreur lisible (état « erreur »). */
  message?: string | null;
  /** Dernière réponse du serveur. */
  actualiseLe: Date | null;
}

export interface Utilisateur {
  nom: string;
  email: string;
}

// ─── Voyant de connexion ──────────────────────────────────────────────────────

const STYLE_VOYANT: Record<EtatConnexion, { texte: string; point: string; cadre: string; libelle: string }> = {
  direct: { texte: 'text-emerald-300', point: 'bg-emerald-400', cadre: 'border-emerald-500/30', libelle: 'En direct' },
  connexion: { texte: 'text-gray-300', point: 'bg-gray-400', cadre: 'border-white/15', libelle: 'Connexion…' },
  hors_ligne: { texte: 'text-amber-300', point: 'bg-amber-400', cadre: 'border-amber-500/40', libelle: 'Hors ligne' },
  // Pas « hors ligne » : c'est souvent l'accès qui est refusé (session expirée), pas le wifi.
  erreur: { texte: 'text-red-300', point: 'bg-red-500', cadre: 'border-red-500/50 bg-red-500/10', libelle: 'Commandes non lues — réessayer' },
};

function explicationVoyant(c: InfosConnexion): string {
  const heure = heureCourte(c.actualiseLe);
  switch (c.etat) {
    case 'direct':
      return heure ? `Les commandes arrivent en temps réel. Dernière réception à ${heure}.` : 'Les commandes arrivent en temps réel.';
    case 'connexion':
      return 'Chargement des commandes en cours…';
    case 'hors_ligne':
      return heure
        ? `Pas de connexion : la liste affichée date de ${heure}. Elle se remettra à jour toute seule au retour du réseau.`
        : 'Pas de connexion : les commandes s’afficheront au retour du réseau.';
    case 'erreur':
      return `${c.message || 'Les commandes ne sont plus lues.'} Appuyez pour réessayer.`;
  }
}

export function VoyantConnexion({ connexion, onReessayer, compact = false }: {
  connexion: InfosConnexion;
  onReessayer?: () => void;
  compact?: boolean;
}) {
  const s = STYLE_VOYANT[connexion.etat];
  const explication = explicationVoyant(connexion);
  const contenu = (
    <>
      <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
        {connexion.etat === 'direct' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${s.point} ${connexion.etat === 'connexion' ? 'animate-pulse' : ''}`} />
      </span>
      <span className={compact ? 'text-left' : 'whitespace-nowrap'}>{s.libelle}</span>
    </>
  );
  // 40 px de haut : c'est aussi un bouton (« réessayer ») qu'on touche au doigt.
  const classes = `inline-flex items-center gap-2 rounded-lg border text-xs font-semibold ${s.texte} ${s.cadre} ${
    compact ? 'px-2.5 py-1.5 min-h-[40px]' : 'px-3 min-h-[40px]'
  }`;

  // En erreur, le voyant sert aussi de bouton « Réessayer ».
  if (connexion.etat === 'erreur' && onReessayer) {
    return (
      <button type="button" onClick={onReessayer} title={explication} aria-label={explication}
        className={`${classes} hover:bg-red-500/20 transition-colors`}>
        {contenu}
      </button>
    );
  }
  return (
    <span role="status" title={explication} aria-label={explication} className={classes}>
      {contenu}
    </span>
  );
}

// ─── Pastille « N à confirmer » ───────────────────────────────────────────────

export function PastilleAConfirmer({ nombre, enRetard, surFondRouge = false, className = '' }: {
  nombre: number;
  enRetard: number;
  /** Posée sur un bouton déjà rouge (menu actif) : le rouge vif ne se verrait pas. */
  surFondRouge?: boolean;
  className?: string;
}) {
  if (nombre <= 0) return null;
  const texte = nombre > 99 ? '99+' : String(nombre);
  const couleurs = enRetard > 0
    ? (surFondRouge ? 'bg-white text-red-700' : 'bg-red-600 text-white ring-2 ring-red-500/40')
    : 'bg-amber-400 text-black';
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold leading-none ${couleurs} ${className}`}
      aria-label={`${nombre} à confirmer${enRetard > 0 ? `, dont ${enRetard} en retard` : ''}`}
    >
      {texte}
    </span>
  );
}

// ─── En-tête ──────────────────────────────────────────────────────────────────

export function EnTeteAdmin({
  vue,
  connexion,
  onReessayer,
  aConfirmer,
  enRetard,
  onVoirAConfirmer,
  utilisateur,
  onDeconnexion,
}: {
  vue: VueAdmin;
  connexion: InfosConnexion;
  onReessayer: () => void;
  aConfirmer: number;
  enRetard: number;
  onVoirAConfirmer: () => void;
  utilisateur: Utilisateur;
  onDeconnexion: () => void;
}) {
  return (
    <header className="bg-[#0F0F0F] border-b border-white/5 flex-shrink-0">
      <div className="h-14 md:h-16 px-4 md:px-6 flex items-center justify-between gap-3">
        {/* Titre de l'écran (le logo n'apparaît que sur téléphone : sur ordinateur il est dans la barre latérale) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="md:hidden w-7 h-7 rounded-lg bg-[#C8102E] flex items-center justify-center flex-shrink-0" aria-hidden>
            <Shield className="w-3.5 h-3.5 text-white" />
          </span>
          <h1 className="text-white font-bold text-base md:text-lg truncate">{TITRES_VUES[vue]}</h1>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {/* À confirmer : cliquable, mène aux commandes (ordinateur ; sur téléphone la pastille est dans la barre du bas) */}
          {aConfirmer > 0 && (
            <button type="button" onClick={onVoirAConfirmer}
              className={`hidden md:inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border text-xs font-semibold transition-colors ${
                enRetard > 0
                  ? 'bg-red-500/15 border-red-500/40 text-red-200 hover:bg-red-500/25'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20'
              }`}
              title="Voir les commandes à confirmer">
              <AlertCircle className="w-4 h-4" />
              {aConfirmer} à confirmer{enRetard > 0 ? ` · ${enRetard} en retard` : ''}
            </button>
          )}

          <VoyantConnexion connexion={connexion} onReessayer={onReessayer} />

          <div className="hidden md:flex">
            <BoutonPublier variante="en-tete" />
          </div>

          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="w-8 h-8 rounded-lg bg-[#C8102E] flex items-center justify-center text-white text-xs font-bold" aria-hidden>
              {(utilisateur.nom || utilisateur.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="hidden lg:block min-w-0 max-w-[180px]">
              <p className="text-white text-xs font-medium truncate">{utilisateur.nom}</p>
              <p className="text-gray-400 text-xs truncate">{utilisateur.email}</p>
            </div>
            <button type="button" onClick={onDeconnexion}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
