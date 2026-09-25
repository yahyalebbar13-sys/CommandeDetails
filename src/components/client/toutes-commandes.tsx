"use client";

// ─── « Toutes mes commandes » ─────────────────────────────────────────────────
// Toutes les commandes du client sur une seule page : une recherche (produit,
// référence, famille, couleur, taille, connaissement, navire…), des filtres
// par étape et deux tris. La recherche ignore accents et majuscules, et chaque
// mot tapé doit se retrouver dans la commande (« zip noir 60 » : les trois).

import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Search, SearchX, X } from 'lucide-react';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import { ETAPES_CLIENT, dateFr, etapeClient, rangEtape, type EtapeClient } from '@/lib/statut-client';
import { arriveeDe, conteneurDe } from '@/lib/pdf-espace-client';
import { CarteCommande, EtatVide } from './cartes-commandes';
import { compte, motsDeRecherche, pluriel, sansAccents } from './portail-outils';

export type TriCommandes = 'arrivee' | 'recente';

/**
 * Les commandes d'une étape, accordées au nombre : « 1 commande prête à livrer »,
 * « 3 commandes prêtes à livrer ». Le pluriel est le nom de l'onglet (« Prêtes à
 * livrer », « Livrées »…), en minuscules au milieu de la phrase.
 */
const COMMANDES_DE_L_ETAPE: Record<EtapeClient, [string, string]> = {
  enregistree: ['enregistrée', 'enregistrées'],
  fabrication: ['en fabrication', 'en fabrication'],
  mer: ['en mer', 'en mer'],
  douane: ['en douane', 'en douane'],
  prete: ['prête à livrer', 'prêtes à livrer'],
  livree: ['livrée', 'livrées'],
};

const TRIS: { id: TriCommandes; label: string; court: string }[] = [
  { id: 'arrivee', label: 'Arrivée la plus proche', court: 'Arrivée proche' },
  { id: 'recente', label: 'Commande la plus récente', court: 'Plus récente' },
];

/** Tout ce que l'on peut chercher dans une commande, en un seul texte comparable. */
function texteCherchable(c: CommandeClient, k?: ConteneurClient): string {
  const etape = ETAPES_CLIENT[rangEtape(etapeClient(c.statut))];
  return sansAccents([
    c.nom, c.reference, c.famille, c.couleur, c.taille, c.qualite, c.fermeture, c.caracteristiques,
    ...(c.couleurs || []).map(l => l.code),
    ...(c.tailles || []).map(l => l.taille),
    ...(c.qualites || []).map(l => l.qualite),
    k?.connaissement, k?.compagnie, k?.suivi?.navire, k?.suivi?.portDepart, k?.suivi?.portArrivee,
    ...(k?.suivi?.etapes || []).map(e => e.navire),
    etape.court, etape.titre,
    dateFr(c.commandeeLe), dateFr(arriveeDe(c, k)),
  ].filter(Boolean).join(' '));
}

/**
 * Arrivée la plus proche : dans l'ordre des dates d'arrivée (ce qui est déjà
 * chez nous, puis ce qui arrive), les commandes sans date ensuite, les livrées
 * à la fin. Commande la plus récente : par date de commande, de la plus récente.
 */
function trier(liste: CommandeClient[], tri: TriCommandes, conteneurs: Record<string, ConteneurClient>): CommandeClient[] {
  const nom = (a: CommandeClient, b: CommandeClient) => (a.nom || '').localeCompare(b.nom || '', 'fr', { numeric: true });
  if (tri === 'recente') {
    return [...liste].sort((a, b) => {
      const da = a.commandeeLe || '';
      const db = b.commandeeLe || '';
      if (da !== db) return !da ? 1 : !db ? -1 : db.localeCompare(da);
      return nom(a, b);
    });
  }
  const groupe = (c: CommandeClient, arrivee?: string) => (etapeClient(c.statut) === 'livree' ? 2 : arrivee ? 0 : 1);
  const avecCle = liste.map(c => ({ c, arrivee: arriveeDe(c, conteneurDe(c, conteneurs)) }));
  avecCle.sort((a, b) => {
    const ga = groupe(a.c, a.arrivee);
    const gb = groupe(b.c, b.arrivee);
    if (ga !== gb) return ga - gb;
    if (ga === 2) return (b.arrivee || '').localeCompare(a.arrivee || '') || nom(a.c, b.c);
    if (ga === 0 && a.arrivee !== b.arrivee) return (a.arrivee || '').localeCompare(b.arrivee || '');
    // Même date, ou pas de date : la plus avancée dans son parcours d'abord.
    const ra = rangEtape(etapeClient(a.c.statut));
    const rb = rangEtape(etapeClient(b.c.statut));
    return rb - ra || nom(a.c, b.c);
  });
  return avecCle.map(x => x.c);
}

export function ToutesMesCommandes({ commandes, conteneurs, recherche, onRecherche, onOuvrir, documents, autoFocus }: {
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  /** Le texte cherché : tenu par l'espace client, pour qu'une recherche lancée ailleurs arrive ici. */
  recherche: string;
  onRecherche: (q: string) => void;
  onOuvrir: (c: CommandeClient) => void;
  /** Les boutons des documents (PDF, Excel), placés en tête. */
  documents?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [etape, setEtape] = useState<EtapeClient | 'toutes'>('toutes');
  const [tri, setTri] = useState<TriCommandes>('arrivee');

  const index = useMemo(
    () => new Map(commandes.map(c => [c.id, texteCherchable(c, conteneurDe(c, conteneurs))])),
    [commandes, conteneurs],
  );
  const mots = useMemo(() => motsDeRecherche(recherche), [recherche]);
  const trouvees = useMemo(
    () => (mots.length ? commandes.filter(c => { const t = index.get(c.id) || ''; return mots.every(m => t.includes(m)); }) : commandes),
    [commandes, index, mots],
  );
  const nbParEtape = useMemo(() => {
    const n: Record<string, number> = {};
    for (const c of trouvees) {
      const e = etapeClient(c.statut);
      n[e] = (n[e] || 0) + 1;
    }
    return n;
  }, [trouvees]);
  const affichees = useMemo(
    () => trier(etape === 'toutes' ? trouvees : trouvees.filter(c => etapeClient(c.statut) === etape), tri, conteneurs),
    [trouvees, etape, tri, conteneurs],
  );

  const filtre = mots.length > 0 || etape !== 'toutes';
  const toutAfficher = () => { onRecherche(''); setEtape('toutes'); };

  const puce = (actif: boolean, vide: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-all ${
      actif
        ? 'bg-stone-900 border-stone-900 text-white shadow-md shadow-stone-900/10'
        : vide
          ? 'bg-white/60 border-stone-200 text-stone-300'
          : 'bg-white border-stone-200 text-stone-600 hover:border-[#c4a062] hover:text-stone-900'
    }`;

  return (
    <div className="space-y-5 animate-in fade-in">
      {/* ─── En-tête ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest">Vos commandes</p>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Toutes mes commandes</h1>
          <p className="mt-1 text-xs font-medium text-stone-500">
            {compte(commandes.length, 'commande', 'commandes')} en tout. Ouvrez une commande pour voir son parcours, ses dates et son détail.
          </p>
        </div>
        {documents}
      </div>

      {/* ─── Recherche ─── */}
      <div className="bg-white border border-stone-200 rounded-3xl p-3 sm:p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="search"
            value={recherche}
            onChange={e => onRecherche(e.target.value)}
            autoFocus={autoFocus}
            enterKeyHint="search"
            aria-label="Rechercher une commande"
            placeholder="Produit, référence, couleur, taille, connaissement, navire…"
            className="w-full h-12 pl-11 pr-11 rounded-2xl bg-stone-50 border border-stone-200 text-base md:text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-[#c4a062] focus:ring-2 focus:ring-[#c4a062]/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => onRecherche('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              aria-label="Effacer la recherche"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Les étapes : la ligne défile sur téléphone, jamais la page. */}
        <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2 w-max" role="group" aria-label="Filtrer par étape">
            <button type="button" aria-pressed={etape === 'toutes'} onClick={() => setEtape('toutes')} className={puce(etape === 'toutes', false)}>
              Toutes
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${etape === 'toutes' ? 'bg-white/20' : 'bg-stone-100 text-stone-600'}`}>{trouvees.length}</span>
            </button>
            {ETAPES_CLIENT.map(e => {
              const n = nbParEtape[e.id] || 0;
              const actif = etape === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={actif}
                  disabled={n === 0 && !actif}
                  onClick={() => setEtape(actif ? 'toutes' : e.id)}
                  className={puce(actif, n === 0)}
                >
                  {e.court}
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${actif ? 'bg-white/20' : n === 0 ? 'bg-stone-50' : 'bg-stone-100 text-stone-600'}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-stone-400 uppercase tracking-widest mr-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Trier
          </span>
          <div className="flex gap-1 p-1 bg-stone-50 border border-stone-200 rounded-xl" role="group" aria-label="Trier les commandes">
            {TRIS.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tri === t.id}
                aria-label={t.label}
                onClick={() => setTri(t.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  tri === t.id ? 'bg-[#c4a062] text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <span className="sm:hidden">{t.court}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Résultat ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2" aria-live="polite">
        <p className="text-[11px] font-bold text-stone-500">
          <span className="font-black text-stone-900">
            {compte(affichees.length, 'commande', 'commandes')}
            {etape !== 'toutes' && ` ${pluriel(affichees.length, ...COMMANDES_DE_L_ETAPE[etape])}`}
          </span>
          {mots.length > 0 && <> pour « {recherche.trim()} »</>}
        </p>
        {filtre && (
          <button type="button" onClick={toutAfficher} className="text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 transition-colors">
            Tout afficher
          </button>
        )}
      </div>

      {affichees.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {affichees.map(c => (
            <CarteCommande key={c.id} commande={c} conteneur={conteneurDe(c, conteneurs)} onOuvrir={onOuvrir} />
          ))}
        </div>
      ) : commandes.length === 0 ? (
        <EtatVide titre="Aucune commande pour le moment" texte="Vos commandes apparaîtront ici dès qu’elles seront enregistrées chez LEBTEX." />
      ) : (
        <EtatVide
          titre="Aucune commande trouvée"
          texte={mots.length
            ? `Aucune commande ne correspond à « ${recherche.trim()} »${etape !== 'toutes' ? ` parmi les commandes ${COMMANDES_DE_L_ETAPE[etape][1]}` : ''}. Vérifiez l’orthographe, ou essayez avec moins de mots.`
            : 'Aucune commande à cette étape pour le moment.'}
        >
          <button
            type="button"
            onClick={toutAfficher}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
          >
            <SearchX className="w-4 h-4" /> Effacer la recherche
          </button>
        </EtatVide>
      )}
    </div>
  );
}
