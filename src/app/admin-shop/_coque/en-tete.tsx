'use client';

// ─── En-tête de l'admin boutique ─────────────────────────────────────────────
// Sur téléphone : le titre de l'écran et le voyant, rien d'autre (l'en-tête ne
// doit jamais dépasser de l'écran ; Publier et la déconnexion sont dans « Plus »).
// Sur ordinateur : en plus, la pastille « N à confirmer », Publier et le compte.

import { AlertCircle, LogOut, Shield } from 'lucide-react';
import { BoutonPublier } from './bouton-publier';
import { VoyantConnexion, type InfosConnexion } from './voyants';
import { TITRES_VUES, type VueAdmin } from './vues';

// Repris par navigation.tsx et coque-admin.tsx. L'espace équipe, lui, importe
// directement ./voyants : ce fichier-ci embarque le bouton Publier.
export { PastilleAConfirmer, VoyantConnexion, type InfosConnexion } from './voyants';

export interface Utilisateur {
  nom: string;
  email: string;
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
