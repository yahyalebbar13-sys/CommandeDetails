"use client";

// ─── Les cartes des commandes, côté client ────────────────────────────────────
// Une commande (sa photo, ce qu'elle est, où elle en est), une grille de
// commandes, et les commandes regroupées par conteneur — elles voyagent
// ensemble, avec la même date et, s'il est suivi, la carte du navire.
// Toucher une carte ouvre sa fiche (cf. fiche-commande.tsx).
//
// Composants définis hors du rendu de l'espace client : recréés à chaque
// rendu, ils se remonteraient (photos qui clignotent, saisie qui perd la main).

import React, { useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  MapPin,
  Package,
  PackageCheck,
  Ship,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import { ETAPES_CLIENT, dateFr, etapeClient, nombreFr, rangEtape, titreEtape } from '@/lib/statut-client';
import { aujourdHuiLocal, arriveeDe, conteneurDe, ecartArrivee, entrepotDe, joursEntre } from '@/lib/pdf-espace-client';
import { compte, dansNJours, jours, quantiteLisible, uniteSeule } from './portail-outils';

// ─── Petites pièces ───────────────────────────────────────────────────────────

/**
 * La photo du produit ; une icône si elle manque ou ne se charge pas. `className`
 * porte la taille et l'arrondi (« w-10 h-10 rounded-lg ») ; l'icône s'y ajuste.
 */
export function Vignette({ photo, className = 'w-20 h-20 rounded-xl' }: { photo?: string; className?: string }) {
  const [ko, setKo] = useState(false);
  if (photo && !ko) {
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        onError={() => setKo(true)}
        className={`${className} object-cover border border-stone-100 shrink-0 bg-stone-50`}
      />
    );
  }
  return (
    <span className={`${className} bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0`}>
      <Package className="w-1/2 h-1/2 max-w-6 max-h-6 text-stone-300" />
    </span>
  );
}

/** Le parcours de la commande : où elle en est parmi les six étapes. */
export function Parcours({ statut }: { statut: string }) {
  const rang = rangEtape(etapeClient(statut));
  return (
    <span className="block mt-3" aria-label={`Étape : ${titreEtape(statut)}`}>
      <span className="flex items-center gap-1">
        {ETAPES_CLIENT.map((e, i) => (
          <span
            key={e.id}
            title={e.titre}
            className={`h-1.5 flex-1 rounded-full ${i < rang ? 'bg-[#c4a062]' : i === rang ? 'bg-stone-900' : 'bg-stone-200'}`}
          />
        ))}
      </span>
      <span className="block mt-1.5 text-[10px] font-bold text-stone-500">
        <span className="font-black text-stone-800">{titreEtape(statut)}</span>
        {' · '}étape {rang + 1} sur {ETAPES_CLIENT.length}
      </span>
    </span>
  );
}

/** Titre de section, avec son explication. */
export function Section({ icone: Icone, fond, texte, titre, phrase, droite, children }: {
  icone: LucideIcon;
  fond: string;
  texte: string;
  titre: string;
  phrase?: string;
  droite?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-1 px-2">
        <div className={`p-2 rounded-xl ${fond}`}>
          <Icone className={`w-5 h-5 ${texte}`} />
        </div>
        <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{titre}</h2>
        {droite && <div className="ml-auto">{droite}</div>}
      </div>
      {phrase ? <p className="px-2 mb-5 text-xs font-medium text-stone-500">{phrase}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

export function EtatVide({ titre, texte, children }: { titre?: string; texte: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6 bg-white border border-stone-200 rounded-3xl">
      {titre && <p className="text-stone-700 font-black uppercase tracking-widest text-sm mb-2">{titre}</p>}
      <p className="text-stone-600 font-medium text-sm max-w-md mx-auto leading-relaxed">{texte}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Une commande ─────────────────────────────────────────────────────────────

const COULEURS_VISIBLES = 6;

/** La ligne de date qui compte à cette étape. */
function repereDate(c: CommandeClient, k: ConteneurClient | undefined, aujourdHui: string): { texte: string; ton: string; icone: LucideIcon } | null {
  const etape = etapeClient(c.statut);
  const arrivee = arriveeDe(c, k);
  const entrepot = entrepotDe(c, k);
  if (etape === 'mer') {
    // Déjà à bord : parler du départ du navire (ou de l'embarquement) serait faux.
    if (!arrivee) return { texte: 'Date d’arrivée bientôt communiquée', ton: 'text-blue-600', icone: Ship };
    const n = joursEntre(aujourdHui, arrivee) ?? 0;
    return n >= 0
      ? { texte: `Arrivée prévue le ${dateFr(arrivee)} · ${dansNJours(n)}`, ton: 'text-blue-600', icone: Ship }
      : { texte: `Arrivée annoncée le ${dateFr(arrivee)}`, ton: 'text-blue-600', icone: Ship };
  }
  if (etape === 'douane' && arrivee) {
    return { texte: `Arrivée au port le ${dateFr(arrivee)} · dédouanement en cours`, ton: 'text-indigo-700', icone: FileText };
  }
  if (etape === 'prete' && entrepot) {
    return { texte: `Dans notre entrepôt depuis le ${dateFr(entrepot)}`, ton: 'text-emerald-600', icone: PackageCheck };
  }
  if ((etape === 'enregistree' || etape === 'fabrication') && arrivee && arrivee >= aujourdHui) {
    return { texte: `Arrivée prévue le ${dateFr(arrivee)}`, ton: 'text-stone-500', icone: CalendarClock };
  }
  return null;
}

/** Arrivée repoussée ou avancée par la compagnie maritime, tant que la marchandise n'est pas chez nous. */
function decalage(c: CommandeClient, k: ConteneurClient | undefined): { texte: string; retard: boolean } | null {
  const etape = etapeClient(c.statut);
  if (etape !== 'mer' && etape !== 'douane') return null;
  const ecart = ecartArrivee(k, arriveeDe(c, k));
  if (!ecart) return null;
  if (etape === 'mer') {
    return ecart > 0
      ? { texte: `Arrivée repoussée de ${jours(ecart)}`, retard: true }
      : { texte: `Arrivée avancée de ${jours(ecart)}`, retard: false };
  }
  return ecart > 0 ? { texte: `Arrivée repoussée de ${jours(ecart)}`, retard: true } : null;
}

export function CarteCommande({ commande: c, conteneur: k, onOuvrir, masquerArrivee }: {
  commande: CommandeClient;
  conteneur?: ConteneurClient;
  onOuvrir: (c: CommandeClient) => void;
  /** Dans une carte de conteneur, la date est déjà dite en tête. */
  masquerArrivee?: boolean;
}) {
  const aujourdHui = aujourdHuiLocal();
  const etape = etapeClient(c.statut);
  const repere = repereDate(c, k, aujourdHui);
  const montrerRepere = repere && !(masquerArrivee && (etape === 'mer' || etape === 'douane'));
  const ecart = masquerArrivee ? null : decalage(c, k);
  const couleurs = c.couleurs || [];
  const details = [
    c.taille ? `Taille ${c.taille}` : null,
    c.couleur ? `Couleur ${c.couleur}` : null,
    c.qualite ? `Qualité ${c.qualite}` : null,
    c.caracteristiques ? c.caracteristiques : c.fermeture ? `Fermeture ${c.fermeture}` : null,
  ].filter(Boolean).join(' · ');
  const variantes = [
    c.tailles?.length ? compte(c.tailles.length, 'taille', 'tailles') : null,
    c.qualites?.length ? compte(c.qualites.length, 'qualité', 'qualités') : null,
  ].filter(Boolean) as string[];
  const Icone = repere?.icone;

  return (
    <button
      type="button"
      onClick={() => onOuvrir(c)}
      className="group w-full text-left bg-white border border-stone-200 rounded-2xl p-4 flex gap-4 hover:shadow-md hover:border-[#c4a062]/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
      aria-label={`${c.nom}, ${quantiteLisible(c.quantite, c.unite)} — ${titreEtape(c.statut)}. Ouvrir la fiche`}
    >
      <Vignette photo={c.photo} />
      <span className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="block font-black text-stone-900 text-sm uppercase tracking-wider line-clamp-2 break-words mb-0.5">{c.nom}</span>
        {c.reference && (
          <span className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide truncate mb-1">
            Référence : {c.reference}
          </span>
        )}
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-stone-600 mb-1">
          <span><span className="text-stone-400">Quantité :</span> <span className="font-black">{quantiteLisible(c.quantite, c.unite)}</span></span>
          {c.commandeeLe && <span className="text-stone-400">Commandée le {dateFr(c.commandeeLe)}</span>}
        </span>

        {details && (
          <span className="block text-[10px] font-bold text-stone-500 mb-1.5 leading-snug line-clamp-2">{details}</span>
        )}

        {(couleurs.length > 0 || variantes.length > 0) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {couleurs.slice(0, COULEURS_VISIBLES).map((l, i) => (
              <span key={`${l.code}-${i}`} className="text-[9px] font-black bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded uppercase">
                {l.code} · {quantiteLisible(l.quantite, c.unite)}
              </span>
            ))}
            {couleurs.length > COULEURS_VISIBLES && (
              <span className="text-[9px] font-black bg-stone-50 text-stone-400 px-1.5 py-0.5 rounded uppercase">
                + {couleurs.length - COULEURS_VISIBLES} couleur{couleurs.length - COULEURS_VISIBLES >= 2 ? 's' : ''}
              </span>
            )}
            {variantes.map(v => (
              <span key={v} className="text-[9px] font-black bg-[#c4a062]/10 text-[#a38042] px-1.5 py-0.5 rounded uppercase">{v}</span>
            ))}
          </span>
        )}

        {montrerRepere && repere && Icone && (
          <span className={`mt-1.5 text-[11px] font-black flex items-center gap-1.5 ${repere.ton}`}>
            <Icone className="w-3 h-3 shrink-0" /> {repere.texte}
          </span>
        )}
        {ecart && (
          <span className={`mt-1.5 inline-flex items-center gap-1 w-max max-w-full text-[10px] font-black px-2 py-0.5 rounded-md border ${
            ecart.retard ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {ecart.retard ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
            <span className="truncate">{ecart.texte}</span>
          </span>
        )}
        {typeof c.prixConvenuMad === 'number' && Number.isFinite(c.prixConvenuMad) && (
          <span className="mt-2 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 inline-block w-max max-w-full">
            <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1">
              Prix convenu : {nombreFr(c.prixConvenuMad)} MAD / {uniteSeule(c.unite)}
            </span>
          </span>
        )}

        <Parcours statut={c.statut} />
        <span className="mt-2 inline-flex items-center gap-1 self-end text-[10px] font-black uppercase tracking-widest text-[#a38042] opacity-70 group-hover:opacity-100 transition-opacity">
          Voir le détail <ChevronRight className="w-3 h-3" />
        </span>
      </span>
    </button>
  );
}

// ─── Une grille de commandes ──────────────────────────────────────────────────

export function GrilleCommandes({ titre, icone: Icone, ton, commandes, conteneurs, sousTitre, onOuvrir, avant }: {
  titre: string;
  icone: LucideIcon;
  /** « bg-emerald-50 text-emerald-600 » : fond puis couleur de l'icône. */
  ton: string;
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  sousTitre?: string;
  onOuvrir: (c: CommandeClient) => void;
  /** Ce qui s'affiche entre le titre et les cartes (un bouton d'action, par exemple). */
  avant?: React.ReactNode;
}) {
  if (commandes.length === 0) return null;
  const [fond, couleur] = ton.split(' ');
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-1 px-2">
        <div className={`p-2 rounded-xl ${fond}`}>
          <Icone className={`w-5 h-5 ${couleur}`} />
        </div>
        <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{titre}</h2>
        <Badge variant="secondary" className="ml-2 font-black">{commandes.length}</Badge>
      </div>
      {sousTitre && <p className="px-2 mb-4 text-xs font-medium text-stone-500">{sousTitre}</p>}
      {avant}
      <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 ${sousTitre || avant ? '' : 'mt-4'}`}>
        {commandes.map(c => (
          <CarteCommande key={c.id} commande={c} conteneur={conteneurDe(c, conteneurs)} onOuvrir={onOuvrir} />
        ))}
      </div>
    </section>
  );
}

// ─── Les commandes, conteneur par conteneur ───────────────────────────────────

const SANS_CONTENEUR = '__sans_conteneur__';

/** Les commandes regroupées par conteneur, avec sa date et, s'il est suivi, la carte du navire. */
export function GrilleConteneurs({ commandes, conteneurs, mode, onOuvrir }: {
  commandes: CommandeClient[];
  conteneurs: Record<string, ConteneurClient>;
  mode: 'mer' | 'douane';
  onOuvrir: (c: CommandeClient) => void;
}) {
  if (commandes.length === 0) return null;
  const aujourdHui = aujourdHuiLocal();

  const groupes = new Map<string, { cle: string; conteneur?: ConteneurClient; commandes: CommandeClient[]; arrivee?: string }>();
  for (const c of commandes) {
    const k = conteneurDe(c, conteneurs);
    const cle = c.conteneurId && k ? c.conteneurId : SANS_CONTENEUR;
    const g = groupes.get(cle) ?? { cle, conteneur: k, commandes: [], arrivee: undefined };
    const arrivee = arriveeDe(c, k);
    if (arrivee && (!g.arrivee || arrivee < g.arrivee)) g.arrivee = arrivee;
    g.commandes.push(c);
    groupes.set(cle, g);
  }
  // Le prochain conteneur à arriver d'abord ; celui encore sans conteneur à la fin.
  const liste = [...groupes.values()].sort((a, b) => {
    if (a.cle === SANS_CONTENEUR) return 1;
    if (b.cle === SANS_CONTENEUR) return -1;
    return (a.arrivee || '9999').localeCompare(b.arrivee || '9999');
  });

  return (
    <div className="space-y-8">
      {liste.map(g => {
        const k = g.conteneur;
        const suivi = k?.suivi;
        const carte = suivi?.lienCarte && suivi.statut !== 'UNTRACKED' ? suivi.lienCarte : null;
        const bl = k?.connaissement;
        const ecart = ecartArrivee(k, g.arrivee);
        const dans = g.arrivee ? joursEntre(aujourdHui, g.arrivee) : undefined;
        const avancement = typeof suivi?.avancement === 'number' && Number.isFinite(suivi.avancement)
          ? Math.min(100, Math.max(0, suivi.avancement))
          : undefined;
        const trajet = [suivi?.portDepart, suivi?.portArrivee].filter(Boolean).join(' → ');
        return (
          <div key={g.cle} className="bg-white rounded-3xl p-4 sm:p-6 border border-stone-200 shadow-sm">
            <div className="flex flex-wrap items-start gap-3 mb-5 pb-4 border-b border-stone-100">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${mode === 'douane' ? 'bg-indigo-50 text-indigo-500' : 'bg-blue-50 text-blue-500'}`}>
                {mode === 'douane' ? <FileText className="w-6 h-6" /> : <Ship className="w-6 h-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest break-words">
                  {g.cle === SANS_CONTENEUR ? 'Conteneur' : bl ? `Conteneur · connaissement ${bl}` : 'Conteneur'}
                </p>
                <h3 className="mt-0.5 text-base font-black text-stone-900 uppercase tracking-wider break-words">
                  {/* En mer comme en douane, la commande est déjà partie : seul le détail du conteneur manque encore. */}
                  {g.cle === SANS_CONTENEUR ? 'Détails du conteneur bientôt disponibles' : k?.compagnie || (mode === 'douane' ? 'Au port' : 'En route')}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {g.arrivee && mode === 'mer' && (
                    <span className="text-[11px] font-black text-blue-600 flex items-center gap-1.5 bg-blue-50/50 border border-blue-100 px-2.5 py-1 rounded-md">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      {dans !== undefined && dans >= 0
                        ? <>Arrivée prévue le {dateFr(g.arrivee)} · {dansNJours(dans)}</>
                        : <>Arrivée annoncée le {dateFr(g.arrivee)}</>}
                    </span>
                  )}
                  {g.arrivee && mode === 'douane' && (
                    <span className="text-[11px] font-black text-indigo-700 flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100 px-2.5 py-1 rounded-md">
                      <Check className="w-3.5 h-3.5 shrink-0" /> Arrivé au port le {dateFr(g.arrivee)} · dédouanement en cours
                    </span>
                  )}
                  {ecart && ecart > 0 && (
                    <span className="text-[11px] font-black text-amber-800 flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                      Arrivée repoussée de {jours(ecart)} (annoncée d’abord le {dateFr(k?.arriveeInitiale)})
                    </span>
                  )}
                  {ecart && ecart < 0 && mode === 'mer' && (
                    <span className="text-[11px] font-black text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                      <TrendingDown className="w-3.5 h-3.5 shrink-0" /> Avancée de {jours(ecart)}
                    </span>
                  )}
                </div>
                {mode === 'mer' && (suivi?.navire || trajet) && (
                  <p className="mt-2 text-[11px] font-bold text-stone-500 break-words">
                    {suivi?.navire && <>Navire : <span className="text-stone-700">{suivi.navire}</span></>}
                    {suivi?.navire && trajet && ' · '}
                    {trajet}
                  </p>
                )}
                {mode === 'mer' && avancement !== undefined && (
                  <div className="mt-3 max-w-sm">
                    <div
                      className="h-1.5 rounded-full bg-stone-100 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(avancement)}
                      aria-label="Part du trajet parcourue"
                    >
                      <div className="h-full rounded-full bg-gradient-to-r from-[#c4a062] to-[#a38042]" style={{ width: `${avancement}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-stone-400">{Math.round(avancement)} % du trajet parcouru</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                {carte && mode === 'mer' && (
                  <a
                    href={carte}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Suivre le navire <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                )}
                <Badge variant="secondary" className="bg-stone-100 text-stone-600 font-black ml-auto sm:ml-0">
                  {compte(g.commandes.length, 'commande', 'commandes')}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {g.commandes.map(c => (
                <CarteCommande key={c.id} commande={c} conteneur={k} onOuvrir={onOuvrir} masquerArrivee />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
