"use client";

// ─── Espace client : arrivées, nouveautés, activité ──────────────────────────
// Trois vues construites UNIQUEMENT à partir des dates que le serveur envoie
// (cf. lib/portail-client-donnees.ts) : rien n'est inventé, rien n'est estimé.
//
// · ArriveesAVenir : le calendrier des dix prochaines semaines — quels
//   conteneurs arrivent quand, et lesquels ont été retardés par la compagnie.
// · Nouveautes : « Quoi de neuf » — ce qui a bougé ces 30 derniers jours
//   (départs, escales, arrivées au port, entrées en entrepôt, commandes).
// · Activite : l'onglet « Mon activité » — les commandes du client en chiffres.
//
// Les dates sont des jours « aaaa-mm-jj » : on les compare en jours entiers,
// en UTC, pour qu'aucun fuseau horaire ne décale une arrivée d'un jour.

import React, { useMemo, useRef, useState } from 'react';
import {
  Anchor,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Hourglass,
  MapPin,
  Navigation,
  PackageCheck,
  Ship,
  Sparkles,
  Timer,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import { dateFr, etapeClient, nombreFr } from '@/lib/statut-client';
import { libelleUnite } from '@/lib/unites-pole';
import { memeLieu } from '@/lib/suivi-conteneur';
import { Vignette } from './cartes-commandes';
import { compte } from './portail-outils';

// ─── Jours, semaines, mois ────────────────────────────────────────────────────
const JOUR_MS = 86_400_000;
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const deux = (n: number) => String(n).padStart(2, '0');

/** La chaîne est-elle un jour « aaaa-mm-jj » lisible ? */
function isoValide(v?: string | null): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
}

/** Jour « aaaa-mm-jj » → numéro de jour (jours écoulés depuis 1970, en UTC). */
function versJour(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, j) / JOUR_MS);
}

/** Numéro de jour → jour « aaaa-mm-jj ». */
function depuisJour(n: number): string {
  return new Date(n * JOUR_MS).toISOString().slice(0, 10);
}

/** Aujourd'hui, dans le fuseau du client (c'est son calendrier qui compte). */
function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/** Numéro du lundi de la semaine de ce jour. */
function lundiDe(iso: string): number {
  const n = versJour(iso);
  const jourSemaine = new Date(n * JOUR_MS).getUTCDay(); // 0 = dimanche
  return n - ((jourSemaine + 6) % 7);
}

/** « 1er », « 13 » : le premier du mois se dit « 1er ». */
const quantieme = (j: number) => (j === 1 ? '1er' : String(j));

/** « 13 oct. » */
function jourMoisCourt(n: number): string {
  const d = new Date(n * JOUR_MS);
  return `${quantieme(d.getUTCDate())} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

/** « jeudi 16 octobre » */
function dateLongue(iso: string): string {
  const d = new Date(versJour(iso) * JOUR_MS);
  return `${JOURS[d.getUTCDay()]} ${quantieme(d.getUTCDate())} ${MOIS_LONGS[d.getUTCMonth()]}`;
}

/** « du 22 au 28 sept. », « du 29 sept. au 5 oct. » */
function periodeSemaine(lundi: number): string {
  const debut = new Date(lundi * JOUR_MS);
  const fin = new Date((lundi + 6) * JOUR_MS);
  const memeMois = debut.getUTCMonth() === fin.getUTCMonth();
  return `du ${quantieme(debut.getUTCDate())}${memeMois ? '' : ` ${MOIS_COURTS[debut.getUTCMonth()]}`} au ${quantieme(fin.getUTCDate())} ${MOIS_COURTS[fin.getUTCMonth()]}`;
}

function libelleSemaine(rang: number, lundi: number): string {
  if (rang === 0) return 'Cette semaine';
  if (rang === 1) return 'Semaine prochaine';
  return `Semaine du ${jourMoisCourt(lundi)}`;
}

/** « aujourd’hui », « hier », « il y a 5 jours » */
function ilYa(jours: number): string {
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

/** « aujourd’hui », « demain », « dans 12 jours » */
function dansJours(jours: number): string {
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  return `dans ${jours} jours`;
}

const majuscule = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pluriel = (n: number, un: string, plusieurs: string) => (Math.abs(n) > 1 ? plusieurs : un);

// ─── Quantités et lieux, dits comme à un client ───────────────────────────────
/** Unités au singulier / au pluriel (mêmes mots que l'espace client). */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'], 'rolls': ['rouleau', 'rouleaux'], 'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'], 'bag': ['sac', 'sacs'], 'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};
const UNITES_PIECE = ['', 'u', 'unité', 'pcs', 'pièces', 'pièce'];

/** Même unité, même clé : « pcs », « u » et rien du tout sont des pièces. */
function cleUnite(unite?: string | null): string {
  const u = (unite || '').trim();
  return UNITES_PIECE.includes(u.toLowerCase()) ? 'pièces' : u;
}

/** « 1 000 mètres », « 1 rouleau », « 12 pièces ». */
function quantiteLisible(q: unknown, unite?: string | null): string {
  const n = Number(q) || 0;
  const u = cleUnite(unite);
  const dites = UNITES_DITES[u] || (u === 'pièces'
    ? ['pièce', 'pièces']
    : [libelleUnite(u).toLowerCase(), libelleUnite(u).toLowerCase()]);
  return `${nombreFr(n)} ${Math.abs(n) > 1 ? dites[1] : dites[0]}`;
}

/**
 * Nom de port lisible : ShipsGo écrit « CASABLANCA », « Casablanca, Morocco »
 * ou « TANGER (TANGIER) » ; le client lit « Casablanca », « Tanger ».
 */
function nomPort(lieu?: string | null): string {
  const brut = String(lieu || '').split(',')[0].replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  if (!brut || brut !== brut.toUpperCase()) return brut;
  return brut.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep: string, l: string) => sep + l.toUpperCase());
}

/** « de Ningbo », « d’Algeciras ». */
const de = (port: string) => (/^[aeiouyàâäéèêëîïôöûü]/i.test(port) ? `d’${port}` : `de ${port}`);

// ─── Petits éléments communs ──────────────────────────────────────────────────
// La vignette d'une commande est celle des cartes (cf. cartes-commandes.tsx) :
// une photo qui ne se charge pas y laisse place à une icône, pas à une image cassée.

function EnTete({ icone: Icone, fond, texte, titre, sousTitre }: { icone: LucideIcon; fond: string; texte: string; titre: string; sousTitre?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-1 px-2">
        <div className={`p-2 rounded-xl ${fond}`}>
          <Icone className={`w-5 h-5 ${texte}`} />
        </div>
        <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{titre}</h2>
      </div>
      {sousTitre && <p className="px-2 text-xs font-medium text-stone-500">{sousTitre}</p>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Arrivées à venir
// ═════════════════════════════════════════════════════════════════════════════
const NB_SEMAINES = 10;

type GroupeArrivee = {
  cle: string;
  /** Jour d'arrivée annoncé (aaaa-mm-jj). */
  date: string;
  conteneur?: ConteneurClient;
  commandes: CommandeClient[];
};

type ProprietesArrivees = {
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  onOuvrir: (c: CommandeClient) => void;
};

/**
 * Le calendrier des arrivées : une case par semaine sur dix semaines, puis,
 * semaine par semaine, les conteneurs attendus et ce qu'ils transportent.
 * Rien ne s'affiche quand rien n'est en mer.
 */
export function ArriveesAVenir({ commandes, conteneurs, onOuvrir }: ProprietesArrivees) {
  const semainesRef = useRef<Record<string, HTMLDivElement | null>>({});

  const calendrier = useMemo(() => {
    const aujourdHui = aujourdhuiIso();
    const lundi0 = lundiDe(aujourdHui);

    // Les commandes en mer, regroupées par conteneur (elles voyagent ensemble).
    const groupes = new Map<string, GroupeArrivee>();
    for (const c of commandes) {
      if (etapeClient(c.statut) !== 'mer') continue;
      const conteneur = c.conteneurId ? conteneurs[c.conteneurId] : undefined;
      const brute = c.arriveeLe || conteneur?.arriveeLe;
      if (!isoValide(brute)) continue;
      const date = brute.slice(0, 10);
      if (date < aujourdHui) continue;
      const cle = c.conteneurId || `sans-conteneur-${date}`;
      const groupe = groupes.get(cle) ?? { cle, date, conteneur, commandes: [] };
      if (date < groupe.date) groupe.date = date;
      groupe.commandes.push(c);
      groupes.set(cle, groupe);
    }
    const tous = [...groupes.values()].sort((a, b) => a.date.localeCompare(b.date) || a.cle.localeCompare(b.cle));

    const semaines = Array.from({ length: NB_SEMAINES }, (_, rang) => {
      const lundi = lundi0 + 7 * rang;
      return { cle: `s${rang}`, rang, lundi, libelle: libelleSemaine(rang, lundi), groupes: [] as GroupeArrivee[] };
    });
    const plusTard: GroupeArrivee[] = [];
    for (const g of tous) {
      const rang = Math.floor((versJour(g.date) - lundi0) / 7);
      if (rang >= 0 && rang < NB_SEMAINES) semaines[rang].groupes.push(g);
      else plusTard.push(g);
    }
    return {
      aujourdHui,
      semaines,
      plusTard,
      nbConteneurs: tous.length,
      nbCommandes: tous.reduce((s, g) => s + g.commandes.length, 0),
    };
  }, [commandes, conteneurs]);

  if (calendrier.nbConteneurs === 0) return null;

  const allerA = (cle: string) => semainesRef.current[cle]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const { nbConteneurs, nbCommandes } = calendrier;

  return (
    <section aria-label="Arrivées à venir">
      <EnTete
        icone={CalendarDays}
        fond="bg-blue-50"
        texte="text-blue-600"
        titre="Arrivées à venir"
        sousTitre={`${compte(nbConteneurs, 'conteneur attendu', 'conteneurs attendus')}, ${compte(nbCommandes, 'commande', 'commandes')} à bord. Les dates sont celles de la compagnie maritime et se mettent à jour d’elles-mêmes.`}
      />

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-4 md:p-6">
        {/* La frise : une case par semaine ; le chiffre, le nombre de conteneurs attendus. */}
        <div className="grid grid-cols-10 gap-1 sm:gap-2">
          {calendrier.semaines.map(s => {
            const n = s.groupes.length;
            const debut = new Date(s.lundi * JOUR_MS);
            return (
              <button
                key={s.cle}
                type="button"
                disabled={n === 0}
                onClick={() => allerA(s.cle)}
                title={`${s.libelle} (${periodeSemaine(s.lundi)})`}
                aria-label={`${s.libelle}, ${periodeSemaine(s.lundi)} : ${n === 0 ? 'aucune arrivée' : `${n} ${pluriel(n, 'conteneur attendu', 'conteneurs attendus')}`}`}
                className="group flex flex-col items-center gap-1 min-w-0 disabled:cursor-default"
              >
                <span
                  className={`w-full h-9 sm:h-11 rounded-lg flex items-center justify-center text-[11px] sm:text-xs font-black transition-colors ${
                    n > 0 ? 'bg-stone-900 text-white group-hover:bg-[#a38042]' : 'bg-stone-100 text-stone-300'
                  } ${s.rang === 0 ? 'ring-2 ring-[#c4a062] ring-offset-1' : ''}`}
                >
                  {n > 0 ? n : '·'}
                </span>
                <span className={`text-[9px] sm:text-[10px] font-black leading-none ${s.rang === 0 ? 'text-[#a38042]' : 'text-stone-500'}`}>
                  {quantieme(debut.getUTCDate())}
                </span>
                <span className="text-[8px] sm:text-[9px] font-bold uppercase leading-none text-stone-400">
                  {MOIS_COURTS[debut.getUTCMonth()]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] font-bold text-stone-600">
          Une case par semaine, à partir de cette semaine (entourée d’or). Le chiffre indique le nombre de conteneurs attendus ; choisissez une case pour voir le détail.
        </p>

        {/* Semaine par semaine, les conteneurs attendus. */}
        <div className="mt-6 space-y-6">
          {calendrier.semaines.filter(s => s.groupes.length > 0).map(s => (
            <div key={s.cle} ref={el => { semainesRef.current[s.cle] = el; }} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-3 pb-2 border-b border-stone-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#a38042]">{s.libelle}</p>
                <p className="text-[10px] font-bold text-stone-400">{periodeSemaine(s.lundi)}</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {s.groupes.map(g => (
                  <CarteArrivee key={g.cle} groupe={g} aujourdHui={calendrier.aujourdHui} onOuvrir={onOuvrir} />
                ))}
              </div>
            </div>
          ))}
          {calendrier.plusTard.length > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-3 pb-2 border-b border-stone-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#a38042]">Plus tard</p>
                <p className="text-[10px] font-bold text-stone-400">au-delà de dix semaines</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {calendrier.plusTard.map(g => (
                  <CarteArrivee key={g.cle} groupe={g} aujourdHui={calendrier.aujourdHui} onOuvrir={onOuvrir} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const COMMANDES_VISIBLES = 4;

/** Un conteneur attendu : sa date, son éventuel retard, son trajet et ce qu'il transporte. */
function CarteArrivee({ groupe, aujourdHui, onOuvrir }: { groupe: GroupeArrivee; aujourdHui: string; onOuvrir: (c: CommandeClient) => void }) {
  const [toutVoir, setToutVoir] = useState(false);
  const { conteneur, date, commandes } = groupe;
  const suivi = conteneur?.suivi;

  // Retard (ou avance) : la date annoncée avant que la compagnie ne la corrige.
  const annoncee = conteneur?.arriveeInitiale;
  const actuelle = conteneur?.arriveeLe || date;
  const ecart = isoValide(annoncee) && isoValide(actuelle) ? versJour(actuelle) - versJour(annoncee) : 0;

  const dans = versJour(date) - versJour(aujourdHui);
  const avancement = Number.isFinite(suivi?.avancement) ? Math.max(0, Math.min(100, Math.round(Number(suivi?.avancement)))) : null;
  const depart = nomPort(suivi?.portDepart);
  const arrivee = nomPort(suivi?.portArrivee);
  const carte = suivi?.lienCarte && suivi?.statut !== 'UNTRACKED' ? suivi.lienCarte : null;
  const visibles = toutVoir ? commandes : commandes.slice(0, COMMANDES_VISIBLES);
  const cachees = commandes.length - visibles.length;

  return (
    <div className="rounded-2xl border border-stone-200 bg-[#FCFAF6] p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
          <Ship className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 truncate">
            {conteneur?.connaissement ? `Conteneur · connaissement ${conteneur.connaissement}` : 'Conteneur'}
          </p>
          <p className="text-sm font-black text-stone-900">{majuscule(dateLongue(date))}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[11px] font-black text-blue-600">Arrivée prévue {dansJours(dans)}</p>
            {ecart > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                <Hourglass className="w-3 h-3" /> Repoussée de {compte(ecart, 'jour', 'jours')}
              </span>
            )}
            {ecart < 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                <Timer className="w-3 h-3" /> Avancée de {compte(-ecart, 'jour', 'jours')}
              </span>
            )}
          </div>
        </div>
      </div>

      {ecart !== 0 && isoValide(annoncee) && (
        <p className={`mt-2 text-[11px] font-medium leading-snug ${ecart > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
          Annoncée d’abord pour le {dateFr(annoncee)} : la compagnie maritime a {ecart > 0 ? 'repoussé' : 'avancé'} l’arrivée de {Math.abs(ecart)} {pluriel(Math.abs(ecart), 'jour', 'jours')}.
        </p>
      )}

      {(suivi?.navire || conteneur?.compagnie) && (
        <p className="mt-2 text-[11px] font-bold text-stone-500">
          {[suivi?.navire && `À bord du ${suivi.navire}`, conteneur?.compagnie].filter(Boolean).join(' · ')}
        </p>
      )}

      {avancement !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider text-stone-500">
            <span className="truncate">{depart || 'Départ'}</span>
            <span className="truncate text-right">{arrivee || 'Maroc'}</span>
          </div>
          <div
            className="mt-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={avancement}
            aria-label="Part du trajet parcourue"
          >
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${avancement}%` }} />
          </div>
          <p className="mt-1 text-[10px] font-bold text-stone-400">{avancement} % du trajet parcouru</p>
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-stone-200/70">
        <p className="px-2 pt-1 text-[10px] font-black uppercase tracking-widest text-stone-400">
          À bord : {compte(commandes.length, 'commande', 'commandes')}
        </p>
        <ul className="mt-1">
          {visibles.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOuvrir(c)}
                className="group w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white text-left transition-colors"
              >
                <Vignette photo={c.photo} className="w-10 h-10 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black text-stone-900 uppercase tracking-wide truncate">{c.nom}</span>
                  <span className="block text-[11px] font-bold text-stone-500 truncate">
                    {quantiteLisible(c.quantite, c.unite)}{c.famille ? ` · ${c.famille}` : ''}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-[#a38042] shrink-0" />
              </button>
            </li>
          ))}
        </ul>
        {(cachees > 0 || toutVoir) && commandes.length > COMMANDES_VISIBLES && (
          <button
            type="button"
            onClick={() => setToutVoir(v => !v)}
            className="mt-1 ml-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toutVoir ? 'rotate-180' : ''}`} />
            {toutVoir ? 'Voir moins' : `Voir ${pluriel(cachees, 'l’autre commande', `les ${cachees} autres commandes`)}`}
          </button>
        )}
      </div>

      {carte && (
        <a
          href={carte}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <MapPin className="w-3.5 h-3.5" /> Suivre le navire <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Quoi de neuf
// ═════════════════════════════════════════════════════════════════════════════
const FENETRE_JOURS = 30;
const NOUVELLES_MAX = 12;

type GenreNouvelle = 'commande' | 'depart' | 'escale' | 'arrivee' | 'sortie' | 'entrepot';

type Nouvelle = {
  cle: string;
  date: string;
  genre: GenreNouvelle;
  titre: string;
  detail?: string;
  commandes: CommandeClient[];
};

/** Le même jour, la nouvelle la plus avancée dans le voyage passe devant. */
const ORDRE_GENRE: Record<GenreNouvelle, number> = { entrepot: 6, sortie: 5, arrivee: 4, escale: 3, depart: 2, commande: 1 };

/** Mêmes couleurs que les étapes de l'espace client : mer en bleu, douane en indigo, prête en vert. */
const STYLE_GENRE: Record<GenreNouvelle, { icone: LucideIcon; ton: string }> = {
  commande: { icone: ClipboardList, ton: 'bg-orange-50 text-orange-600' },
  depart: { icone: Ship, ton: 'bg-blue-50 text-blue-600' },
  escale: { icone: Navigation, ton: 'bg-sky-50 text-sky-600' },
  arrivee: { icone: Anchor, ton: 'bg-indigo-50 text-indigo-600' },
  sortie: { icone: Truck, ton: 'bg-violet-50 text-violet-600' },
  entrepot: { icone: PackageCheck, ton: 'bg-emerald-50 text-emerald-600' },
};

/** Les nouvelles des 30 derniers jours, les plus récentes d'abord. */
function construireNouvelles(commandes: CommandeClient[], conteneurs: Record<string, ConteneurClient>, aujourdHui: string): Nouvelle[] {
  const debut = depuisJour(versJour(aujourdHui) - FENETRE_JOURS);
  const dansFenetre = (d?: string | null): d is string => isoValide(d) && d.slice(0, 10) >= debut && d.slice(0, 10) <= aujourdHui;
  const nouvelles: Nouvelle[] = [];

  // ── Le voyage de chaque conteneur ──
  const parConteneur = new Map<string, CommandeClient[]>();
  for (const c of commandes) {
    if (!c.conteneurId) continue;
    const liste = parConteneur.get(c.conteneurId) ?? [];
    liste.push(c);
    parConteneur.set(c.conteneurId, liste);
  }

  for (const [id, siennes] of parConteneur) {
    const conteneur = conteneurs[id];
    const suivi = conteneur?.suivi;
    // Seules les étapes qui ont VRAIMENT eu lieu ; les prévisions n'en sont pas.
    const etapes = (suivi?.etapes || [])
      .filter(e => e.reel && isoValide(e.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const auPortFinal = (lieu?: string) => memeLieu(lieu, suivi?.portArrivee);
    const auPortDepart = (lieu?: string) => memeLieu(lieu, suivi?.portDepart);
    // Le premier départ réel est LE départ ; les suivants reprennent la route après une escale.
    const premierDepart = etapes.find(e => e.code === 'DEPA');
    const estParti = Boolean(premierDepart);
    const arriveAuPortFinal = etapes.some(e => e.code === 'ARRV' && auPortFinal(e.lieu));
    const arriveeConnue = etapes.some(e => (e.code === 'ARRV' || e.code === 'DISC') && auPortFinal(e.lieu));
    const vues = new Set<string>();

    for (const e of etapes) {
      if (!dansFenetre(e.date)) continue;
      const cle = `${e.code}|${e.date}|${e.lieu || ''}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      const port = nomPort(e.lieu);
      const navire = e.navire || suivi?.navire;
      let n: Pick<Nouvelle, 'genre' | 'titre' | 'detail'> | null = null;

      switch (e.code) {
        case 'LOAD':
          // Chargé mais pas encore parti : la seule nouvelle du moment.
          if (!estParti && (auPortDepart(e.lieu) || !suivi?.portDepart)) {
            n = {
              genre: 'depart',
              titre: port ? `Chargement à bord à ${port}` : 'Chargement à bord',
              detail: `Votre marchandise est à bord${navire ? ` du ${navire}` : ''} ; le départ est imminent.`,
            };
          }
          break;
        case 'DEPA':
          if (auPortFinal(e.lieu)) break;
          n = e === premierDepart || auPortDepart(e.lieu)
            ? { genre: 'depart', titre: port ? `Départ ${de(port)}` : 'Départ du navire', detail: `${navire ? `À bord du ${navire}, en` : 'En'} route vers le Maroc.` }
            : { genre: 'escale', titre: port ? `Nouveau départ ${de(port)}` : 'Nouveau départ après l’escale', detail: `L’escale est terminée${navire ? ` ; le voyage continue à bord du ${navire}` : ' ; le voyage continue'}.` };
          break;
        case 'ARRV':
          n = auPortFinal(e.lieu)
            ? { genre: 'arrivee', titre: port ? `Arrivée à ${port}` : 'Arrivée au port', detail: 'Le conteneur est arrivé au Maroc ; le dédouanement commence.' }
            : { genre: 'escale', titre: port ? `Escale à ${port}` : 'Escale en route', detail: 'Une étape prévue du voyage, avant de repartir vers le Maroc.' };
          break;
        case 'DISC':
          // Au port final, le déchargement ne compte que s'il n'y a pas déjà eu d'arrivée.
          if (auPortFinal(e.lieu) && !arriveAuPortFinal) {
            n = { genre: 'arrivee', titre: port ? `Déchargement à ${port}` : 'Déchargement au port', detail: 'Le conteneur est à terre au Maroc ; le dédouanement commence.' };
          }
          break;
        case 'GTOT':
          if (auPortFinal(e.lieu)) {
            n = { genre: 'sortie', titre: port ? `Sortie du port de ${port}` : 'Sortie du port', detail: 'Le conteneur a quitté le port et prend la route de notre entrepôt.' };
          }
          break;
        default:
          break;
      }
      if (n) nouvelles.push({ cle: `${id}|${cle}`, date: e.date.slice(0, 10), commandes: siennes, ...n });
    }

    // Arrivée au port, d'après le dossier, quand le suivi ne l'a pas déjà dite.
    const arriveeLe = conteneur?.arriveeLe || siennes.find(c => c.arriveeLe)?.arriveeLe;
    if (dansFenetre(arriveeLe) && !arriveeConnue) {
      const port = nomPort(suivi?.portArrivee);
      nouvelles.push({
        cle: `${id}|arrivee`,
        date: arriveeLe.slice(0, 10),
        genre: 'arrivee',
        titre: port ? `Arrivée à ${port}` : 'Arrivée au port',
        detail: 'Le conteneur est arrivé au Maroc ; le dédouanement commence.',
        commandes: siennes,
      });
    }

    // Entrée dans notre entrepôt.
    const entrepotLe = conteneur?.entrepotLe || siennes.find(c => c.entrepotLe)?.entrepotLe;
    if (dansFenetre(entrepotLe)) {
      const pretes = siennes.filter(c => etapeClient(c.statut) === 'prete').length;
      nouvelles.push({
        cle: `${id}|entrepot`,
        date: entrepotLe.slice(0, 10),
        genre: 'entrepot',
        titre: 'Entrée dans notre entrepôt',
        detail: pretes > 0
          ? `${pretes > 1 ? `${pretes} commandes sont prêtes` : 'Une commande est prête'} à être livrée${pretes > 1 ? 's' : ''} ou retirée${pretes > 1 ? 's' : ''} : il vous suffit de nous le demander.`
          : undefined,
        commandes: siennes,
      });
    }
  }

  // ── Les nouvelles commandes, regroupées par jour ──
  const parJour = new Map<string, CommandeClient[]>();
  for (const c of commandes) {
    if (!dansFenetre(c.commandeeLe)) continue;
    const jour = c.commandeeLe.slice(0, 10);
    const liste = parJour.get(jour) ?? [];
    liste.push(c);
    parJour.set(jour, liste);
  }
  for (const [jour, liste] of parJour) {
    nouvelles.push({
      cle: `commande|${jour}`,
      date: jour,
      genre: 'commande',
      titre: liste.length > 1 ? `${liste.length} nouvelles commandes enregistrées` : 'Nouvelle commande enregistrée',
      detail: 'Nous vous tiendrons informé à chaque étape, jusqu’à la livraison.',
      commandes: liste,
    });
  }

  return nouvelles.sort((a, b) => b.date.localeCompare(a.date) || ORDRE_GENRE[b.genre] - ORDRE_GENRE[a.genre]);
}

/**
 * « Quoi de neuf » : ce qui a bougé sur les commandes du client ces 30 derniers
 * jours, d'après les seules dates connues (étapes réelles de la compagnie,
 * arrivées, entrées en entrepôt, commandes). Au plus douze nouvelles.
 */
export function Nouveautes({ commandes, conteneurs, onOuvrir }: ProprietesArrivees) {
  const { aujourdHui, nouvelles, total } = useMemo(() => {
    const aujourdHui = aujourdhuiIso();
    const toutes = construireNouvelles(commandes, conteneurs, aujourdHui);
    return { aujourdHui, nouvelles: toutes.slice(0, NOUVELLES_MAX), total: toutes.length };
  }, [commandes, conteneurs]);

  return (
    <section aria-label="Quoi de neuf">
      <EnTete
        icone={Sparkles}
        fond="bg-[#c4a062]/10"
        texte="text-[#a38042]"
        titre="Quoi de neuf"
        sousTitre="Ce qui a bougé sur vos commandes ces 30 derniers jours, du plus récent au plus ancien."
      />

      {nouvelles.length === 0 ? (
        <div className="text-center py-12 px-6 bg-white border border-stone-200 rounded-3xl">
          <p className="text-stone-700 font-black uppercase tracking-widest text-sm mb-2">Rien de nouveau ces 30 derniers jours</p>
          <p className="text-stone-600 font-medium text-sm">
            Dès qu’une de vos commandes avance (départ du navire, arrivée au port, entrée dans notre entrepôt), vous le verrez ici.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-4 md:p-6">
          <ol>
            {nouvelles.map((n, i) => {
              const { icone: Icone, ton } = STYLE_GENRE[n.genre];
              const derniere = i === nouvelles.length - 1;
              return (
                <li key={n.cle} className={`relative flex gap-3 ${derniere ? '' : 'pb-5'}`}>
                  {!derniere && <span aria-hidden className="absolute left-[17px] top-10 bottom-1 w-px bg-stone-200" />}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ton}`}>
                    <Icone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                      {majuscule(ilYa(versJour(aujourdHui) - versJour(n.date)))} · {dateFr(n.date)}
                    </p>
                    <p className="text-sm font-black text-stone-900 leading-snug mt-0.5">{n.titre}</p>
                    {n.detail && <p className="text-xs font-medium text-stone-500 mt-0.5 leading-snug">{n.detail}</p>}
                    <Concernees commandes={n.commandes} onOuvrir={onOuvrir} />
                  </div>
                </li>
              );
            })}
          </ol>
          {total > nouvelles.length && (
            <p className="mt-5 pt-4 border-t border-stone-100 text-[10px] font-bold text-stone-600">
              Les {nouvelles.length} nouvelles les plus récentes sur {total} ces 30 derniers jours.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const CONCERNEES_VISIBLES = 3;

/** Les commandes dont parle une nouvelle, chacune cliquable. */
function Concernees({ commandes, onOuvrir }: { commandes: CommandeClient[]; onOuvrir: (c: CommandeClient) => void }) {
  const [toutVoir, setToutVoir] = useState(false);
  if (commandes.length === 0) return null;
  const visibles = toutVoir ? commandes : commandes.slice(0, CONCERNEES_VISIBLES);
  const cachees = commandes.length - visibles.length;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visibles.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOuvrir(c)}
          title={`${c.nom} · ${quantiteLisible(c.quantite, c.unite)}`}
          className="inline-flex items-center gap-1.5 max-w-full sm:max-w-[16rem] bg-stone-100 hover:bg-[#c4a062]/15 border border-transparent hover:border-[#c4a062]/30 text-stone-700 pl-1 pr-2 py-1 rounded-lg transition-colors"
        >
          <Vignette photo={c.photo} className="w-5 h-5 rounded" />
          <span className="text-[10px] font-black uppercase tracking-wide truncate">{c.nom}</span>
        </button>
      ))}
      {cachees > 0 && (
        <button
          type="button"
          onClick={() => setToutVoir(true)}
          className="text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 px-2 py-1"
        >
          + {cachees} {pluriel(cachees, 'autre', 'autres')}
        </button>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Mon activité
// ═════════════════════════════════════════════════════════════════════════════
const FAMILLES_VISIBLES = 6;
const SANS_FAMILLE = 'Autres articles';

type Famille = { nom: string; nb: number; quantites: { unite: string; total: number }[] };
type Mois = { cle: string; mois: number; an: number; nb: number };

/**
 * « Mon activité » : les commandes du client en chiffres — combien, de quelles
 * familles, à quel rythme, et en combien de temps elles arrivent. Les
 * quantités ne s'additionnent jamais d'une unité à l'autre.
 */
export function Activite({ commandes }: { commandes: CommandeClient[] }) {
  const [toutesFamilles, setToutesFamilles] = useState(false);

  const chiffres = useMemo(() => {
    const aujourdHui = aujourdhuiIso();
    const total = commandes.length;
    const livrees = commandes.filter(c => etapeClient(c.statut) === 'livree').length;

    // ── Par famille, une somme par unité ──
    const familles = new Map<string, { nb: number; quantites: Map<string, number> }>();
    for (const c of commandes) {
      const nom = c.famille?.trim() || SANS_FAMILLE;
      const f = familles.get(nom) ?? { nb: 0, quantites: new Map<string, number>() };
      f.nb += 1;
      const q = Number(c.quantite) || 0;
      if (q > 0) {
        const u = cleUnite(c.unite);
        f.quantites.set(u, (f.quantites.get(u) ?? 0) + q);
      }
      familles.set(nom, f);
    }
    const parFamille: Famille[] = [...familles.entries()]
      .map(([nom, f]) => ({
        nom,
        nb: f.nb,
        quantites: [...f.quantites.entries()].map(([unite, t]) => ({ unite, total: t })).sort((a, b) => b.total - a.total),
      }))
      // « Autres articles » toujours en dernier.
      .sort((a, b) => Number(a.nom === SANS_FAMILLE) - Number(b.nom === SANS_FAMILLE) || b.nb - a.nb || a.nom.localeCompare(b.nom, 'fr'));

    // ── Commandes par mois, sur les douze derniers mois (celui-ci compris) ──
    const [an0, mois0] = aujourdHui.split('-').map(Number);
    const mois: Mois[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(an0, mois0 - 1 - 11 + i, 1));
      return { cle: `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}`, mois: d.getUTCMonth(), an: d.getUTCFullYear(), nb: 0 };
    });
    const indexMois = new Map(mois.map((m, i) => [m.cle, i]));
    let sansDate = 0;
    for (const c of commandes) {
      if (!isoValide(c.commandeeLe)) { sansDate += 1; continue; }
      const i = indexMois.get(c.commandeeLe.slice(0, 7));
      if (i !== undefined) mois[i].nb += 1;
    }
    const surDouzeMois = mois.reduce((s, m) => s + m.nb, 0);
    const maxMois = Math.max(0, ...mois.map(m => m.nb));
    const moisPlein = maxMois > 0 ? mois.reduce((best, m) => (m.nb > best.nb ? m : best), mois[0]) : null;

    // ── Délai entre la commande et l'arrivée, pour les commandes arrivées ──
    const delais = commandes
      .filter(c => isoValide(c.commandeeLe) && isoValide(c.arriveeLe) && c.arriveeLe.slice(0, 10) <= aujourdHui)
      .map(c => versJour(c.arriveeLe as string) - versJour(c.commandeeLe as string))
      .filter(j => j >= 0);
    const delai = delais.length > 0
      ? {
          moyen: Math.round(delais.reduce((s, j) => s + j, 0) / delais.length),
          min: Math.min(...delais),
          max: Math.max(...delais),
          n: delais.length,
        }
      : null;

    // ── Client depuis… ──
    const premiere = commandes.map(c => c.commandeeLe).filter(isoValide).sort()[0];

    return { total, livrees, enCours: total - livrees, parFamille, mois, maxMois, moisPlein, surDouzeMois, sansDate, delai, premiere };
  }, [commandes]);

  if (commandes.length === 0) {
    return (
      <section aria-label="Mon activité">
        <EnTete icone={ChartColumn} fond="bg-[#c4a062]/10" texte="text-[#a38042]" titre="Mon activité" />
        <div className="text-center py-16 px-6 bg-white border border-stone-200 rounded-3xl">
          <p className="text-stone-700 font-black uppercase tracking-widest text-sm mb-2">Pas encore de chiffres</p>
          <p className="text-stone-600 font-medium text-sm">Vos statistiques apparaîtront ici dès votre première commande.</p>
        </div>
      </section>
    );
  }

  const { total, livrees, enCours, parFamille, mois, maxMois, moisPlein, surDouzeMois, sansDate, delai, premiere } = chiffres;
  const familles = toutesFamilles ? parFamille : parFamille.slice(0, FAMILLES_VISIBLES);
  const maxFamille = Math.max(1, ...parFamille.map(f => f.nb));
  const debutPremiere = premiere ? new Date(versJour(premiere) * JOUR_MS) : null;

  const tuiles: { label: string; valeur: string; note?: string }[] = [
    {
      label: 'Commandes',
      valeur: nombreFr(total),
      note: debutPremiere ? `depuis ${MOIS_LONGS[debutPremiere.getUTCMonth()]} ${debutPremiere.getUTCFullYear()}` : undefined,
    },
    { label: 'En cours', valeur: nombreFr(enCours), note: 'pas encore livrées' },
    { label: 'Livrées', valeur: nombreFr(livrees), note: total > 0 ? `${Math.round((livrees / total) * 100)} % de vos commandes` : undefined },
    { label: 'Familles d’articles', valeur: nombreFr(parFamille.filter(f => f.nom !== SANS_FAMILLE).length || parFamille.length), note: 'commandées chez nous' },
  ];

  return (
    <section aria-label="Mon activité" className="space-y-6">
      <EnTete
        icone={ChartColumn}
        fond="bg-[#c4a062]/10"
        texte="text-[#a38042]"
        titre="Mon activité"
        sousTitre="Vos commandes en chiffres, sur tout votre historique chez LEBTEX."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {tuiles.map(t => (
          <div key={t.label} className="bg-white border border-stone-200 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{t.label}</p>
            <p className="text-2xl md:text-3xl font-black text-stone-900 mt-1">{t.valeur}</p>
            {t.note && <p className="text-[11px] font-bold text-stone-500 mt-0.5">{t.note}</p>}
          </div>
        ))}
      </div>

      {/* Le délai moyen, en une phrase. */}
      <div className="bg-stone-900 rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex items-start gap-4">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-[#c4a062]/15 text-[#c4a062] items-center justify-center shrink-0">
            <Timer className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Délai moyen</p>
            {delai ? (
              <>
                <p className="text-xl md:text-2xl font-black text-white tracking-tight leading-snug">
                  En moyenne, <span className="text-[#c4a062]">{nombreFr(delai.moyen)} {pluriel(delai.moyen, 'jour', 'jours')}</span> entre la commande et l’arrivée
                </p>
                <p className="text-stone-400 text-sm font-medium mt-2">
                  Calculé sur {delai.n} {pluriel(delai.n, 'commande arrivée', 'commandes arrivées')}
                  {delai.n > 1 && delai.min !== delai.max ? ` · de ${delai.min} jours pour la plus rapide à ${delai.max} jours pour la plus longue` : ''}.
                </p>
              </>
            ) : (
              <p className="text-stone-300 text-sm font-medium">
                Le délai moyen entre la commande et l’arrivée s’affichera dès l’arrivée de votre première commande.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commandes par mois. */}
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-4 md:p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Commandes par mois</p>
          <p className="text-xs font-medium text-stone-500 mt-1">
            {surDouzeMois > 0
              ? `${surDouzeMois} ${pluriel(surDouzeMois, 'commande', 'commandes')} sur les douze derniers mois${moisPlein ? ` · le mois le plus actif : ${MOIS_LONGS[moisPlein.mois]} ${moisPlein.an} (${moisPlein.nb})` : ''}.`
              : 'Aucune commande sur les douze derniers mois.'}
          </p>

          <div className="mt-6 flex items-end gap-[2px] sm:gap-1.5 h-40" aria-hidden>
            {mois.map((m, i) => {
              const hauteur = maxMois > 0 ? (m.nb / maxMois) * 100 : 0;
              const actuel = i === mois.length - 1;
              const etiquette = m.nb > 0 && (m.nb === maxMois || actuel);
              return (
                <div key={m.cle} className="group relative flex-1 h-full flex flex-col justify-end items-center min-w-0">
                  {/* Infobulle au survol, calée vers l'intérieur aux deux bouts pour ne jamais déborder de l'écran. */}
                  <span className={`pointer-events-none absolute bottom-full mb-1 ${i < 3 ? 'left-0' : i > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2'} whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[10px] font-black text-white opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
                    {MOIS_COURTS[m.mois]} {m.an} · {m.nb} {pluriel(m.nb, 'commande', 'commandes')}
                  </span>
                  {etiquette && <span className="text-[10px] font-black text-stone-700 mb-1">{m.nb}</span>}
                  <div
                    className={`w-full max-w-[28px] rounded-t ${m.nb > 0 ? 'bg-[#c4a062] group-hover:bg-[#a38042]' : 'bg-stone-200'} transition-colors`}
                    style={{ height: m.nb > 0 ? `max(4px, ${hauteur}%)` : '2px' }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-stone-200 flex gap-[2px] sm:gap-1.5" aria-hidden>
            {mois.map((m, i) => (
              <span
                key={m.cle}
                className={`flex-1 min-w-0 text-center text-[9px] font-black uppercase leading-none ${i === mois.length - 1 ? 'text-[#a38042]' : 'text-stone-400'}`}
              >
                <span className="sm:hidden">{MOIS_COURTS[m.mois].charAt(0)}</span>
                <span className="hidden sm:inline">{MOIS_COURTS[m.mois].replace('.', '')}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] font-bold text-stone-600">
            De {MOIS_LONGS[mois[0].mois]} {mois[0].an} à {MOIS_LONGS[mois[11].mois]} {mois[11].an}, selon la date de chaque commande.
            {sansDate > 0 && ` ${sansDate} ${pluriel(sansDate, 'commande sans date n’est pas comptée', 'commandes sans date ne sont pas comptées')}.`}
          </p>

          {/* Les mêmes chiffres, lisibles par un lecteur d'écran. (sr-only sur l'enveloppe :
              posé sur la table elle-même, il la laisse élargir la page sur mobile.) */}
          <div className="sr-only">
            <table>
              <caption>Nombre de commandes par mois, sur les douze derniers mois</caption>
              <thead><tr><th scope="col">Mois</th><th scope="col">Commandes</th></tr></thead>
              <tbody>
                {mois.map(m => (
                  <tr key={m.cle}><th scope="row">{MOIS_LONGS[m.mois]} {m.an}</th><td>{m.nb}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Par famille d'articles. */}
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-4 md:p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Par famille d’articles</p>
          <p className="text-xs font-medium text-stone-500 mt-1">
            Nombre de commandes et quantités commandées, unité par unité.
          </p>
          <ul className="mt-5 space-y-4">
            {familles.map(f => (
              <li key={f.nom}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-stone-900 truncate">{f.nom}</p>
                  <p className="text-[11px] font-black text-stone-500 shrink-0">
                    {f.nb} {pluriel(f.nb, 'commande', 'commandes')}
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#c4a062]" style={{ width: `${Math.max(4, (f.nb / maxFamille) * 100)}%` }} />
                </div>
                {f.quantites.length > 0 && (
                  <p className="mt-1 text-[11px] font-bold text-stone-500">
                    {f.quantites.map(q => quantiteLisible(q.total, q.unite)).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {parFamille.length > FAMILLES_VISIBLES && (
            <button
              type="button"
              onClick={() => setToutesFamilles(v => !v)}
              className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toutesFamilles ? 'rotate-180' : ''}`} />
              {toutesFamilles ? 'Voir moins' : `Voir les ${parFamille.length} familles`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
