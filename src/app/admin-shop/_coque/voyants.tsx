'use client';

// ─── Voyant de connexion et pastille « N à confirmer » ───────────────────────
// Partagés par l'admin boutique (en-tête, navigation) et l'espace équipe
// (/staff). Dans un fichier à part, sans rien d'autre de l'admin : l'espace
// équipe les importe d'ici, et n'embarque ainsi ni le bouton Publier ni les
// écrans de l'admin (en-tete.tsx importe bouton-publier.tsx).

import { heureCourte, type EtatConnexion } from './etat-commandes';

export interface InfosConnexion {
  etat: EtatConnexion;
  /** Message d'erreur lisible (état « erreur »). */
  message?: string | null;
  /** Dernière réponse du serveur. */
  actualiseLe: Date | null;
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
