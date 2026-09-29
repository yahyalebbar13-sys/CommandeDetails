'use client';

// ─── Briques d'affichage partagées par la liste et la fiche ──────────────────

import { Component, useEffect, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ImageOff } from 'lucide-react';
import { ORDER_STATUS_COLORS, type OrderStatus, type ShopOrder } from '@/lib/shop-types';
import { libelleMode, LIBELLES_PAIEMENT, moyenPaiementDe, receptionDe } from '@/lib/commandes-boutique';
import { imageUtilisable, statutLisible } from './outils-ecran';

/** Horloge de l'écran : les âges (« il y a 35 min ») et les retards restent vrais sans recharger. */
export function useMaintenant(intervalle = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), intervalle);
    // En revenant sur l'onglet (les minuteries dorment en arrière-plan).
    const auRetour = () => { if (document.visibilityState === 'visible') setMaintenant(Date.now()); };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [intervalle]);
  return maintenant;
}

// = « xl » de Tailwind (même seuil que la grille de ecran-commandes.tsx). En dessous
// (iPad à l'horizontale, fenêtre réduite), barre latérale + liste ne laissaient
// qu'environ 280 px à la fiche : elle s'ouvre alors en plein écran.
const REQUETE_GRAND_ECRAN = '(min-width: 1280px)';

const abonnerGrandEcran = (maj: () => void) => {
  const mq = window.matchMedia?.(REQUETE_GRAND_ECRAN);
  mq?.addEventListener?.('change', maj);
  return () => mq?.removeEventListener?.('change', maj);
};

/**
 * Grand écran : liste et fiche côte à côte. Sinon la fiche s'ouvre en plein écran.
 * useSyncExternalStore : « petit écran » pendant l'hydratation (comme le rendu
 * serveur), la vraie largeur dès le premier rendu d'un écran monté après coup.
 */
export function useGrandEcran(): boolean {
  return useSyncExternalStore(
    abonnerGrandEcran,
    () => !!window.matchMedia?.(REQUETE_GRAND_ECRAN).matches,
    () => false,
  );
}

/** Copie dans le presse-papiers ; repli pour les navigateurs qui refusent l'API moderne. */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const zone = document.createElement('textarea');
      zone.value = texte;
      zone.setAttribute('readonly', '');
      zone.style.position = 'fixed';
      zone.style.opacity = '0';
      document.body.appendChild(zone);
      zone.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(zone);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Pastille de statut : point de couleur et texte clair, lisible sur fond sombre quelle que soit la couleur.
 * `libelle` : le statut dans les mots du mode (« Retirée » plutôt que « Livrée »).
 */
export function BadgeStatut({ statut, className = '', libelle }: { statut: OrderStatus; className?: string; libelle?: string }) {
  const couleur = ORDER_STATUS_COLORS[statut] || '#6B7280';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-gray-100 whitespace-nowrap ${className}`}
      style={{ background: `${couleur}26`, borderColor: `${couleur}66` }}
    >
      <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: couleur }} />
      {libelle || statutLisible(statut)}
    </span>
  );
}

const TONS_BADGE = {
  ambre: 'border-amber-400/50 bg-amber-400/15 text-amber-100',
  bleu: 'border-sky-400/40 bg-sky-400/10 text-sky-100',
  vert: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  gris: 'border-white/15 bg-white/5 text-gray-200',
} as const;

/**
 * VOLUMINEUX, mode de réception et moyen de paiement. `compact` (cartes de la liste) :
 * seulement ce qui change le travail — un rouleau, un retrait, un transport, un virement.
 */
export function BadgesReception({
  commande, compact = false, className = '',
}: { commande: Pick<ShopOrder, 'reception' | 'items' | 'paymentMethod'>; compact?: boolean; className?: string }) {
  const r = receptionDe(commande);
  const moyen = moyenPaiementDe(commande);
  const badges: { texte: string; ton: keyof typeof TONS_BADGE }[] = [];
  if (r.volumineux) badges.push({ texte: 'VOLUMINEUX', ton: 'ambre' });
  if (!compact || r.mode !== 'domicile') badges.push({ texte: libelleMode(r), ton: r.mode === 'domicile' ? 'gris' : 'bleu' });
  if (!compact || moyen !== 'cod') badges.push({ texte: LIBELLES_PAIEMENT[moyen], ton: moyen === 'cod' ? 'gris' : 'vert' });
  if (!badges.length) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map(b => (
        <span
          key={b.texte}
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap ${TONS_BADGE[b.ton]}`}
        >
          {b.texte}
        </span>
      ))}
    </span>
  );
}

/** Photo de l'article (48 px), ou une icône quand il n'y en a pas ou qu'elle ne charge pas. */
export function ImageArticle({ src, alt }: { src?: string | null; alt: string }) {
  const [enErreur, setEnErreur] = useState(false);
  if (!imageUtilisable(src) || enErreur) {
    return (
      <div className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center" aria-hidden>
        <ImageOff className="h-5 w-5 text-gray-400" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setEnErreur(true)}
      className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover bg-white/5"
    />
  );
}

/**
 * Une commande qu'on n'arrive pas à afficher ne doit pas vider tout l'écran :
 * on remplace seulement sa carte (ou sa fiche) par un encart « Commande illisible ».
 * `cle` : on retente l'affichage quand la commande change (nouvelle version reçue).
 */
export class FrontiereCommande extends Component<
  { cle: string; numero?: string; plein?: boolean; onFermer?: () => void; children: ReactNode },
  { enErreur: boolean; cle: string }
> {
  state = { enErreur: false, cle: this.props.cle };

  static getDerivedStateFromError() {
    return { enErreur: true };
  }

  static getDerivedStateFromProps(props: { cle: string }, state: { enErreur: boolean; cle: string }) {
    return props.cle !== state.cle ? { enErreur: false, cle: props.cle } : null;
  }

  componentDidCatch(erreur: Error, _info: ErrorInfo) {
    // Le message seul : pas les données de la commande (personnelles).
    console.error('[admin-shop] commande illisible :', erreur?.message);
  }

  render() {
    if (!this.state.enErreur) return this.props.children;
    return (
      <div role="alert" className={`flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100 ${this.props.plein ? 'm-4' : ''}`}>
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>
            <strong className="font-semibold">Commande illisible{this.props.numero ? ` (${this.props.numero})` : ''}.</strong>{' '}
            Elle a été enregistrée dans un format inattendu. Les autres commandes ne sont pas touchées ;
            prévenez la personne qui gère le site.
          </p>
          {this.props.onFermer && (
            <button type="button" onClick={this.props.onFermer} className={`${BOUTON_SECONDAIRE} mt-3`}>Fermer</button>
          )}
        </div>
      </div>
    );
  }
}

/** Cartes grises pendant le premier chargement. */
export function Squelettes({ nombre = 4 }: { nombre?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: nombre }, (_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-[#1A1A1A] p-4 space-y-3 animate-pulse">
          <div className="flex justify-between gap-3">
            <div className="h-3.5 w-24 rounded bg-white/10" />
            <div className="h-5 w-20 rounded bg-white/10" />
          </div>
          <div className="h-4 w-2/3 rounded bg-white/10" />
          <div className="h-3.5 w-1/2 rounded bg-white/10" />
          <div className="flex gap-2 pt-1">
            <div className="h-11 flex-1 rounded-xl bg-white/5" />
            <div className="h-11 flex-1 rounded-xl bg-white/5" />
          </div>
        </div>
      ))}
      <p className="sr-only">Chargement des commandes…</p>
    </div>
  );
}

// Classes des boutons, pour que la liste et la fiche se ressemblent.
export const BOUTON_APPEL =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-gray-100 hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';
export const BOUTON_WHATSAPP =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-[#25D366]/40 bg-[#25D366]/15 text-sm font-semibold text-[#5BE38D] hover:bg-[#25D366]/25 active:bg-[#25D366]/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]';
export const BOUTON_SECONDAIRE =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 bg-transparent text-sm font-semibold text-gray-200 hover:bg-white/5 active:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';
export const BOUTON_INACTIF =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/10 text-sm font-medium text-gray-400 cursor-not-allowed';
