"use client";

// ─── Demandes des clients, côté administrateur ────────────────────────────────
// Ce que les clients envoient depuis leur espace — recommander un produit,
// organiser une livraison ou un retrait, poser une question — arrive ici.
// On prend la demande en charge, on répond (la réponse s'affiche dans l'espace
// du client), puis on la marque traitée.
//
// Lecture et écriture passent par /api/admin/demandes-clients : la collection
// n'est pas ouverte au navigateur. La liste se rafraîchit toute seule chaque
// minute ; les changements s'affichent tout de suite (affichage optimiste) et
// reviennent en arrière si le serveur refuse.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Inbox, RefreshCw, Loader2, Search, X, Repeat, Truck, Store, MessageCircleQuestion,
  Clock, CalendarDays, Package, Send, CheckCircle2, Hand, RotateCcw, Copy,
  MessageSquareReply, AlertTriangle, Hourglass, Pencil, UserCircle2, Layers,
  type LucideIcon,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { LIBELLE_DEMANDE, type DemandeEnregistree, type StatutDemande, type TypeDemande } from '@/lib/demandes-client';
import { dateFr, nombreFr } from '@/lib/statut-client';

// ─── Types et constantes ──────────────────────────────────────────────────────

/** Ce que renvoie la route admin : la demande enregistrée, sans l'uid du client. */
export type DemandeAdmin = Omit<DemandeEnregistree, 'clientUid'>;

type Filtre = StatutDemande | 'toutes';
type FiltreType = TypeDemande | 'tous';
type Changement = { statut?: StatutDemande; reponse?: string };

const ROUTE = '/api/admin/demandes-clients';
const RAFRAICHISSEMENT_MS = 60_000;
const MAX_REPONSE = 1000;
/** Au-delà, une demande sans prise en charge est signalée en rouge. */
const ATTENTE_LONGUE_MS = 24 * 3600_000;

const STATUT_ADMIN: Record<StatutDemande, { libelle: string; pastille: string }> = {
  nouvelle: { libelle: 'Nouvelle', pastille: 'text-rose-700 bg-rose-50 border-rose-200' },
  en_cours: { libelle: 'En cours', pastille: 'text-amber-700 bg-amber-50 border-amber-200' },
  traitee: { libelle: 'Traitée', pastille: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

const STYLE_TYPE: Record<TypeDemande, { icone: LucideIcon; pastille: string; lisere: string; carre: string }> = {
  recommande: { icone: Repeat, pastille: 'text-amber-700 bg-amber-50 border-amber-200', lisere: 'bg-amber-500', carre: 'bg-amber-50 text-amber-600 border-amber-100' },
  livraison: { icone: Truck, pastille: 'text-teal-700 bg-teal-50 border-teal-200', lisere: 'bg-teal-500', carre: 'bg-teal-50 text-teal-600 border-teal-100' },
  question: { icone: MessageCircleQuestion, pastille: 'text-indigo-700 bg-indigo-50 border-indigo-200', lisere: 'bg-indigo-500', carre: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
};

const ONGLETS: { id: Filtre; libelle: string; icone: LucideIcon; actif: string; compteur: string }[] = [
  { id: 'nouvelle', libelle: 'Nouvelles', icone: Inbox, actif: 'bg-rose-500 text-white shadow-lg shadow-rose-200', compteur: 'bg-rose-100 text-rose-700' },
  { id: 'en_cours', libelle: 'En cours', icone: Hand, actif: 'bg-amber-500 text-white shadow-lg shadow-amber-200', compteur: 'bg-amber-100 text-amber-700' },
  { id: 'traitee', libelle: 'Traitées', icone: CheckCircle2, actif: 'bg-emerald-600 text-white shadow-lg shadow-emerald-200', compteur: 'bg-emerald-100 text-emerald-700' },
  { id: 'toutes', libelle: 'Toutes', icone: Layers, actif: 'bg-stone-900 text-white shadow-lg shadow-stone-300', compteur: 'bg-stone-100 text-stone-600' },
];

const VIDE: Record<Filtre, string> = {
  nouvelle: 'Aucune nouvelle demande — tout est à jour.',
  en_cours: 'Aucune demande en cours.',
  traitee: "Aucune demande traitée pour l'instant.",
  toutes: "Aucun client n'a encore envoyé de demande depuis son espace.",
};

/** Réponses toutes faites, à compléter avant l'envoi (les « … » sont à remplir). */
function suggestionsPour(d: DemandeAdmin): { libelle: string; texte: string }[] {
  const accuse = { libelle: 'Bien reçu', texte: 'Bien reçu, merci ! Nous vous répondons très vite.' };
  if (d.type === 'recommande') return [
    accuse,
    { libelle: 'Réassort lancé', texte: "C'est noté : nous lançons le réassort. Vous pourrez suivre la commande étape par étape dans votre espace." },
    { libelle: 'Délai et prix', texte: 'Merci pour votre commande. Nous vérifions le délai et le prix auprès de l\'usine et vous répondons sous 48 h.' },
  ];
  if (d.type === 'livraison') {
    const livraison = { libelle: 'Date de livraison', texte: "C'est noté : nous vous livrons le … Nous vous appelons la veille pour confirmer l'heure." };
    const retrait = { libelle: 'Retrait à notre entrepôt', texte: 'Votre marchandise vous attend à notre entrepôt (31 Rue 65, Lot. Al Hamd, Aïn Chock, Casablanca) à partir du … Prévenez-nous simplement avant de passer.' };
    return d.mode === 'retrait' ? [accuse, retrait, livraison] : [accuse, livraison, retrait];
  }
  return [
    accuse,
    { libelle: 'On vérifie', texte: 'Merci pour votre question. Nous vérifions et vous répondons dans la journée.' },
    { libelle: 'On vous appelle', texte: 'Merci pour votre message. Nous vous appelons aujourd\'hui pour en parler.' },
  ];
}

// ─── Petits utilitaires d'affichage ───────────────────────────────────────────

function dateHeure(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

function heure(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** « il y a 5 min », « il y a 3 h », « il y a 2 jours ». */
function depuis(iso: string | undefined, maintenant: number): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((maintenant - t) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

/** Durée seule, pour « en attente depuis … ». */
function duree(iso: string | undefined, maintenant: number): string {
  return depuis(iso, maintenant).replace(/^il y a /, '');
}

/** Relit une ligne du résumé écrite par le serveur : « NOM — 1200 m ». */
function lireLigne(l: string): { nom: string; quantite?: string; unite?: string } {
  const m = /^(.*) — (\d+(?:\.\d+)?)(?:\s+(.+))?$/.exec(l);
  return m ? { nom: m[1], quantite: nombreFr(m[2]), unite: m[3] } : { nom: l };
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function texteRecherche(d: DemandeAdmin): string {
  return sansAccents([d.clientName, LIBELLE_DEMANDE[d.type], d.message, d.reponse, ...(d.resume || [])].filter(Boolean).join(' '));
}

/** Résumé en texte brut, à coller dans WhatsApp ou transmettre à l'équipe. */
function texteACopier(d: DemandeAdmin): string {
  const lignes = [`Demande de ${d.clientName} — ${LIBELLE_DEMANDE[d.type]} (${dateHeure(d.creeLe)})`];
  for (const r of d.resume || []) lignes.push(`• ${r}`);
  if (d.quantite !== undefined) lignes.push(`Quantité souhaitée : ${nombreFr(d.quantite)}`);
  if (d.mode) lignes.push(`Mode : ${d.mode === 'retrait' ? 'retrait à notre entrepôt' : 'livraison'}`);
  if (d.dateSouhaitee) lignes.push(`Date souhaitée : ${dateFr(d.dateSouhaitee)}`);
  if (d.message) lignes.push(`Message : ${d.message}`);
  if (d.reponse) lignes.push(`Notre réponse : ${d.reponse}`);
  return lignes.join('\n');
}

// ─── Vue ──────────────────────────────────────────────────────────────────────

export interface DemandesClientsViewProps {
  /** Vrai quand l'onglet est affiché : en y revenant, la liste se rafraîchit si elle date. */
  actif?: boolean;
  /** Reçoit le nombre de demandes nouvelles à chaque chargement (pastille du menu). */
  onNouvelles?: (n: number) => void;
}

export default function DemandesClientsView({ actif = true, onNouvelles }: DemandesClientsViewProps = {}) {
  const { toast } = useToast();

  const [serveur, setServeur] = useState<DemandeAdmin[]>([]);
  // Modifications envoyées et pas encore confirmées : appliquées par-dessus la
  // liste du serveur, retirées dès la réponse (et gardées si le serveur accepte).
  const [enVol, setEnVol] = useState<{ jeton: number; id: string; champs: Partial<DemandeAdmin> }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargeLe, setChargeLe] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const [filtre, setFiltre] = useState<Filtre>('nouvelle');
  const [filtreType, setFiltreType] = useState<FiltreType>('tous');
  const [recherche, setRecherche] = useState('');
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [composeurs, setComposeurs] = useState<Record<string, boolean>>({});

  const compteurJeton = useRef(0);
  const derniereEcriture = useRef(0);
  const chargeLeRef = useRef(0);
  const enChargement = useRef(false);
  const connus = useRef<Set<string> | null>(null);

  const charger = useCallback(async (manuel = false) => {
    if (enChargement.current) return;
    enChargement.current = true;
    if (manuel) setActualisation(true);
    const debut = Date.now();
    try {
      const res = await authedFetch(ROUTE, { cache: 'no-store' });
      const corps = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403
          ? 'Votre session a expiré — reconnectez-vous pour voir les demandes.'
          : (corps?.error || "Les demandes n'ont pas pu être chargées."));
      }
      // Une modification a été enregistrée pendant la lecture : cette liste est
      // déjà périmée, la prochaine lecture la remplacera.
      if (debut < derniereEcriture.current) return;

      const liste: DemandeAdmin[] = Array.isArray(corps?.demandes) ? corps.demandes : [];
      const dejaVues = connus.current;
      if (dejaVues) {
        const arrivees = liste.filter(d => d.statut === 'nouvelle' && !dejaVues.has(d.id));
        if (arrivees.length === 1) {
          toast({ title: `Nouvelle demande de ${arrivees[0].clientName}`, description: `${LIBELLE_DEMANDE[arrivees[0].type]} — à retrouver dans « Demandes clients ».` });
        } else if (arrivees.length > 1) {
          toast({ title: `${arrivees.length} nouvelles demandes de clients`, description: 'À retrouver dans « Demandes clients ».' });
        }
      } else {
        // Premier chargement : on ouvre l'onglet où il y a quelque chose à faire.
        const nouvelles = liste.filter(d => d.statut === 'nouvelle').length;
        const enCours = liste.filter(d => d.statut === 'en_cours').length;
        if (!nouvelles) setFiltre(enCours ? 'en_cours' : 'toutes');
      }
      connus.current = new Set(liste.map(d => d.id));
      setServeur(liste);
      setErreur(null);
      const t = Date.now();
      chargeLeRef.current = t;
      setChargeLe(t);
      setMaintenant(t);
    } catch (e: any) {
      setErreur(e?.message || "Les demandes n'ont pas pu être chargées.");
      if (manuel) toast({ variant: 'destructive', title: 'Actualisation impossible', description: e?.message || 'Vérifiez la connexion et réessayez.' });
    } finally {
      enChargement.current = false;
      setChargement(false);
      setActualisation(false);
    }
  }, [toast]);

  // Au montage, puis chaque minute tant que la fenêtre est visible ; en revenant
  // sur la fenêtre, on rafraîchit si la dernière lecture date de plus de 30 s.
  useEffect(() => {
    charger();
    const minuterie = window.setInterval(() => {
      setMaintenant(Date.now());
      if (document.visibilityState === 'visible') charger();
    }, RAFRAICHISSEMENT_MS);
    const auRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - chargeLeRef.current > 30_000) charger();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [charger]);

  // En revenant sur l'onglet de l'application.
  useEffect(() => {
    if (actif && chargeLeRef.current && Date.now() - chargeLeRef.current > 30_000) charger();
  }, [actif, charger]);

  const demandes = useMemo(() => {
    if (!enVol.length) return serveur;
    return serveur.map(d => enVol.reduce((acc, e) => (e.id === d.id ? { ...acc, ...e.champs } : acc), d));
  }, [serveur, enVol]);

  const occupes = useMemo(() => new Set(enVol.map(e => e.id)), [enVol]);

  const parStatut = useMemo(() => {
    const n = { nouvelle: 0, en_cours: 0, traitee: 0 } as Record<StatutDemande, number>;
    for (const d of demandes) if (n[d.statut] !== undefined) n[d.statut]++;
    return n;
  }, [demandes]);

  useEffect(() => { onNouvelles?.(parStatut.nouvelle); }, [parStatut.nouvelle, onNouvelles]);

  // La plus ancienne demande nouvelle : celle qui attend depuis le plus longtemps.
  const plusAncienne = useMemo(() => {
    const nouvelles = demandes.filter(d => d.statut === 'nouvelle');
    return nouvelles.length ? nouvelles.reduce((a, b) => (String(a.creeLe) <= String(b.creeLe) ? a : b)) : null;
  }, [demandes]);

  // Recherche et type s'appliquent à tous les onglets : leurs compteurs disent ce qui reste.
  const trouvees = useMemo(() => {
    const q = sansAccents(recherche.trim());
    return demandes.filter(d => (filtreType === 'tous' || d.type === filtreType) && (!q || texteRecherche(d).includes(q)));
  }, [demandes, recherche, filtreType]);

  const compteOnglet = useMemo(() => {
    const n: Record<Filtre, number> = { nouvelle: 0, en_cours: 0, traitee: 0, toutes: trouvees.length };
    for (const d of trouvees) if (n[d.statut] !== undefined) n[d.statut]++;
    return n;
  }, [trouvees]);

  const compteType = useMemo(() => {
    const q = sansAccents(recherche.trim());
    const base = demandes.filter(d => (filtre === 'toutes' || d.statut === filtre) && (!q || texteRecherche(d).includes(q)));
    const n: Record<FiltreType, number> = { tous: base.length, recommande: 0, livraison: 0, question: 0 };
    for (const d of base) if (n[d.type] !== undefined) n[d.type]++;
    return n;
  }, [demandes, filtre, recherche]);

  // À traiter : la plus ancienne d'abord. Déjà traitées ou toutes : la plus récente d'abord.
  const visibles = useMemo(() => {
    const l = trouvees.filter(d => filtre === 'toutes' || d.statut === filtre);
    if (filtre === 'nouvelle' || filtre === 'en_cours') return [...l].sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe)));
    return l;
  }, [trouvees, filtre]);

  // ─── Écritures ──────────────────────────────────────────────────────────────

  const modifier = useCallback(async (d: DemandeAdmin, changement: Changement, succes: { titre: string; detail?: string }): Promise<boolean> => {
    // Uniquement les champs définis : rien d'indéfini ne part vers Firestore.
    const corps: Record<string, string> = { id: d.id };
    const champs: Partial<DemandeAdmin> = { majLe: new Date().toISOString() };
    if (changement.statut) { corps.statut = changement.statut; champs.statut = changement.statut; }
    if (changement.reponse !== undefined) {
      const reponse = changement.reponse.trim().slice(0, MAX_REPONSE);
      corps.reponse = reponse;
      champs.reponse = reponse;
    }
    const jeton = ++compteurJeton.current;
    setEnVol(l => [...l, { jeton, id: d.id, champs }]);
    try {
      const res = await authedFetch(ROUTE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const retour = await res.json().catch(() => ({}));
      if (!res.ok || !retour?.success) throw new Error(retour?.error || 'Le serveur a refusé la modification.');
      derniereEcriture.current = Date.now();
      setServeur(l => l.map(x => (x.id === d.id ? { ...x, ...champs } : x)));
      toast({ title: succes.titre, description: succes.detail });
      return true;
    } catch (e: any) {
      toast({ variant: 'destructive', title: "La modification n'a pas été enregistrée", description: e?.message || 'Vérifiez la connexion et réessayez.' });
      return false;
    } finally {
      setEnVol(l => l.filter(x => x.jeton !== jeton));
    }
  }, [toast]);

  const changerStatut = useCallback((d: DemandeAdmin, statut: StatutDemande) => {
    const titres: Record<StatutDemande, { titre: string; detail: string }> = {
      en_cours: {
        titre: d.statut === 'traitee' ? 'Demande rouverte' : 'Demande prise en charge',
        detail: `${d.clientName} voit que sa demande est prise en charge. Elle est maintenant dans « En cours ».`,
      },
      traitee: { titre: 'Demande traitée', detail: `${d.clientName} voit que sa demande est traitée.` },
      nouvelle: { titre: 'Demande remise en « Nouvelles »', detail: d.clientName },
    };
    void modifier(d, { statut }, titres[statut]);
  }, [modifier]);

  const repondre = useCallback(async (d: DemandeAdmin, traiter: boolean) => {
    const texte = (brouillons[d.id] ?? '').trim();
    if (!texte) return;
    // Répondre, c'est au moins prendre la demande en charge.
    const statut: StatutDemande | undefined = traiter ? 'traitee' : (d.statut === 'nouvelle' ? 'en_cours' : undefined);
    setComposeurs(c => ({ ...c, [d.id]: false }));
    setBrouillons(b => { const { [d.id]: _retire, ...reste } = b; return reste; });
    const ok = await modifier(d, { reponse: texte, ...(statut ? { statut } : {}) }, {
      titre: traiter ? 'Réponse envoyée, demande traitée' : 'Réponse envoyée',
      detail: `${d.clientName} la verra dans son espace client.`,
    });
    if (!ok) {
      // On rend le texte pour qu'il ne soit pas perdu.
      setBrouillons(b => ({ ...b, [d.id]: texte }));
      setComposeurs(c => ({ ...c, [d.id]: true }));
    }
  }, [brouillons, modifier]);

  const copier = useCallback(async (d: DemandeAdmin) => {
    try {
      await navigator.clipboard.writeText(texteACopier(d));
      toast({ title: 'Demande copiée', description: 'Prête à coller dans WhatsApp ou un e-mail.' });
    } catch {
      toast({ variant: 'destructive', title: 'Copie impossible', description: "Le navigateur n'a pas autorisé l'accès au presse-papiers." });
    }
  }, [toast]);

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  const tuiles: { id: StatutDemande; libelle: string; classes: string; texte: string }[] = [
    { id: 'nouvelle', libelle: 'Nouvelles', classes: 'bg-rose-500/10 border-rose-500/20', texte: 'text-rose-400' },
    { id: 'en_cours', libelle: 'En cours', classes: 'bg-amber-500/10 border-amber-500/20', texte: 'text-amber-400' },
    { id: 'traitee', libelle: 'Traitées', classes: 'bg-emerald-500/10 border-emerald-500/20', texte: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 fade-in">

      {/* ─── En-tête ─── */}
      <header className="bg-stone-900 rounded-[2rem] shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-rose-400/5 rounded-full translate-y-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Espace client — Demandes</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tighter leading-none">
              Demandes<br /><span className="text-amber-500">des clients</span>
            </h2>
            <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3 leading-relaxed">
              Réassorts · Livraisons et retraits · Questions
            </p>
            <p className="text-stone-500 text-[11px] font-medium mt-1.5">
              Vos réponses s'affichent dans l'espace du client.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => charger(true)}
                disabled={actualisation}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white/5 border border-white/10 text-stone-300 hover:text-white hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actualisation ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
              {chargeLe && (
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Actualisé à {heure(chargeLe)} · toutes les minutes
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-auto w-full shrink-0">
            {tuiles.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFiltre(t.id)}
                className={`${t.classes} border p-3 sm:p-4 rounded-2xl text-center lg:min-w-[110px] transition-transform hover:-translate-y-0.5 ${filtre === t.id ? 'ring-2 ring-white/20' : ''}`}
              >
                <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${t.texte}`}>{t.libelle}</p>
                <div className={`text-2xl font-black ${t.texte}`}>{chargement ? '—' : parStatut[t.id]}</div>
              </button>
            ))}
          </div>
        </div>
        {plusAncienne && (
          <button
            type="button"
            onClick={() => { setFiltre('nouvelle'); setFiltreType('tous'); setRecherche(''); }}
            className={`relative z-10 w-full text-left border-t border-white/5 px-6 sm:px-8 py-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${
              maintenant - new Date(plusAncienne.creeLe).getTime() > ATTENTE_LONGUE_MS ? 'text-rose-300' : 'text-stone-400'
            } hover:bg-white/5 transition-colors`}
          >
            <Hourglass className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              La plus ancienne attend depuis {duree(plusAncienne.creeLe, maintenant)} — {plusAncienne.clientName}
            </span>
          </button>
        )}
      </header>

      {/* ─── Onglets par statut ─── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {ONGLETS.map(({ id, libelle, icone: Icone, actif: classeActive, compteur }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltre(id)}
            aria-pressed={filtre === id}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all duration-200 ${
              filtre === id ? classeActive : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
            }`}
          >
            <Icone className="w-4 h-4 shrink-0" />
            <span className="truncate">{libelle}</span>
            <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black ${
              filtre === id ? 'bg-white/20 text-white' : compteur
            }`}>
              {compteOnglet[id]}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Recherche et type ─── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
          <input
            type="text"
            enterKeyHint="search"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher : client, produit, message, réponse…"
            aria-label="Rechercher une demande client"
            className="w-full h-12 pl-11 pr-11 bg-white border border-stone-200 rounded-2xl text-[12px] font-bold text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-200 shadow-sm"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche('')}
              aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['tous', 'recommande', 'livraison', 'question'] as FiltreType[]).map(t => {
            const Icone = t === 'tous' ? Layers : STYLE_TYPE[t].icone;
            const actifType = filtreType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFiltreType(t)}
                aria-pressed={actifType}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors ${
                  actifType ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200 text-stone-500 hover:text-stone-800 hover:border-stone-300'
                }`}
              >
                <Icone className="w-3.5 h-3.5" />
                {t === 'tous' ? 'Tous les types' : LIBELLE_DEMANDE[t]}
                <span className={actifType ? 'text-white/60' : 'text-stone-300'}>{compteType[t]}</span>
              </button>
            );
          })}
        </div>
        {(filtre === 'nouvelle' || filtre === 'en_cours') && visibles.length > 1 && (
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
            La plus ancienne en premier — c'est celle qui attend depuis le plus longtemps.
          </p>
        )}
      </div>

      {/* ─── Erreur d'actualisation (la liste affichée reste utilisable) ─── */}
      {erreur && !chargement && serveur.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Dernière actualisation impossible : {erreur}
            {chargeLe ? ` Les demandes affichées datent de ${heure(chargeLe)}.` : ''}
          </span>
        </div>
      )}

      {/* ─── Contenu ─── */}
      {chargement ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
          <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement des demandes…</p>
        </div>
      ) : erreur && serveur.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-medium text-stone-600 max-w-sm">{erreur}</p>
            <Button
              onClick={() => charger(true)}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-[10px] tracking-widest h-9 px-5 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : visibles.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-20 flex flex-col items-center text-center gap-3">
            <Inbox className="w-8 h-8 text-stone-200" />
            <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest max-w-md">
              {recherche.trim()
                ? `Aucune demande ne correspond à « ${recherche.trim()} » dans cet onglet.`
                : filtreType !== 'tous'
                  ? `Aucune demande « ${LIBELLE_DEMANDE[filtreType]} » dans cet onglet.`
                  : VIDE[filtre]}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibles.map(d => {
            const ouvert = composeurs[d.id] ?? (d.statut !== 'traitee' && !d.reponse);
            return (
              <CarteDemande
                key={d.id}
                demande={d}
                maintenant={maintenant}
                occupe={occupes.has(d.id)}
                brouillon={brouillons[d.id] ?? ''}
                composeurOuvert={ouvert}
                onBrouillon={texte => setBrouillons(b => ({ ...b, [d.id]: texte }))}
                onComposeur={o => {
                  setComposeurs(c => ({ ...c, [d.id]: o }));
                  // « Modifier la réponse » : on repart du texte déjà envoyé.
                  if (o && d.reponse && !brouillons[d.id]) setBrouillons(b => ({ ...b, [d.id]: d.reponse || '' }));
                }}
                onStatut={s => changerStatut(d, s)}
                onRepondre={traiter => { void repondre(d, traiter); }}
                onCopier={() => { void copier(d); }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Carte d'une demande ──────────────────────────────────────────────────────
// Composant à part (et non défini dans la vue) : sinon la zone de réponse
// serait recréée à chaque frappe et perdrait le focus.

interface CarteDemandeProps {
  demande: DemandeAdmin;
  maintenant: number;
  occupe: boolean;
  brouillon: string;
  composeurOuvert: boolean;
  onBrouillon: (texte: string) => void;
  onComposeur: (ouvert: boolean) => void;
  onStatut: (statut: StatutDemande) => void;
  onRepondre: (traiter: boolean) => void;
  onCopier: () => void;
}

function CarteDemande({ demande: d, maintenant, occupe, brouillon, composeurOuvert, onBrouillon, onComposeur, onStatut, onRepondre, onCopier }: CarteDemandeProps) {
  const style = STYLE_TYPE[d.type] || STYLE_TYPE.question;
  const Icone = d.type === 'livraison' && d.mode === 'retrait' ? Store : style.icone;
  const statut = STATUT_ADMIN[d.statut] || STATUT_ADMIN.nouvelle;
  const lignes = (d.resume || []).map(lireLigne);
  // Pour un réassort, l'unité est celle de la commande d'origine.
  const unite = d.type === 'recommande' && lignes.length === 1 ? lignes[0].unite : undefined;
  const attente = maintenant - new Date(d.creeLe).getTime();
  const enRetard = d.statut === 'nouvelle' && attente > ATTENTE_LONGUE_MS;
  const traitee = d.statut === 'traitee';
  const texte = brouillon.trim();

  const details: { icone: LucideIcon; libelle: string; valeur: string }[] = [];
  if (d.quantite !== undefined) details.push({ icone: Package, libelle: 'Quantité souhaitée', valeur: `${nombreFr(d.quantite)}${unite ? ` ${unite}` : ''}` });
  if (d.mode) details.push({ icone: d.mode === 'retrait' ? Store : Truck, libelle: 'Mode', valeur: d.mode === 'retrait' ? 'Retrait à notre entrepôt' : 'Livraison chez le client' });
  if (d.dateSouhaitee) details.push({ icone: CalendarDays, libelle: 'Date souhaitée', valeur: dateFr(d.dateSouhaitee) });

  return (
    <article className={`relative bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden ${enRetard ? 'border-rose-200' : 'border-stone-100'} ${traitee ? 'opacity-90' : ''}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.lisere}`} aria-hidden />
      <div className="p-4 sm:p-5 pl-5 sm:pl-6 space-y-3.5">

        {/* Client, type, statut, date */}
        <div className="flex flex-wrap items-start gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${style.carre}`}>
            <Icone className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-stone-900 text-[13px] uppercase flex items-center gap-1.5">
                <UserCircle2 className="w-3.5 h-3.5 text-stone-300" />{d.clientName}
              </p>
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${style.pastille}`}>
                {LIBELLE_DEMANDE[d.type]}
              </span>
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${statut.pastille}`}>
                {statut.libelle}
              </span>
              {occupe && <Loader2 className="w-3 h-3 animate-spin text-stone-300" aria-label="Enregistrement…" />}
            </div>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-stone-400">
              <Clock className="w-3 h-3" />
              <span>{dateHeure(d.creeLe)}</span>
              <span className="text-stone-300">·</span>
              <span className={enRetard ? 'text-rose-600 font-black' : ''}>
                {enRetard ? `En attente depuis ${duree(d.creeLe, maintenant)}` : depuis(d.creeLe, maintenant)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCopier}
            title="Copier la demande (pour WhatsApp ou un e-mail)"
            aria-label="Copier la demande"
            className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-stone-300 hover:text-stone-700 hover:bg-stone-50 shrink-0"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {/* Commandes concernées */}
        {lignes.length > 0 && (
          <div className="rounded-xl border border-stone-100 bg-stone-50/60 divide-y divide-stone-100">
            <p className="px-3 py-1.5 text-[9px] font-black text-stone-400 uppercase tracking-widest">
              {d.type === 'recommande' ? 'Produit à recommander' : lignes.length > 1 ? `${lignes.length} commandes concernées` : 'Commande concernée'}
            </p>
            {lignes.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="text-[12px] font-bold text-stone-800 min-w-0 break-words">{l.nom}</span>
                {l.quantite && (
                  <span className="text-[11px] font-black text-stone-500 shrink-0 whitespace-nowrap">
                    {l.quantite}{l.unite ? ` ${l.unite}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quantité, mode, date souhaitée */}
        {details.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {details.map(({ icone: I, libelle, valeur }) => (
              <div key={libelle} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5">
                <I className="w-3.5 h-3.5 text-[#a38042]" />
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{libelle}</span>
                <span className="text-[12px] font-black text-stone-800">{valeur}</span>
              </div>
            ))}
          </div>
        )}

        {/* Message du client */}
        {d.message && (
          <blockquote className="rounded-xl border-l-4 border-[#c4a062] bg-[#F9F6F0] px-4 py-3">
            <p className="text-[9px] font-black text-[#a38042] uppercase tracking-widest mb-1">Message du client</p>
            <p className="text-sm font-medium text-stone-700 whitespace-pre-line break-words">{d.message}</p>
          </blockquote>
        )}

        {/* Réponse déjà envoyée */}
        {d.reponse && !composeurOuvert && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                <MessageSquareReply className="w-3.5 h-3.5" /> Votre réponse — visible par le client
              </p>
              {d.majLe && <span className="text-[9px] font-bold text-emerald-600/70">{dateHeure(d.majLe)}</span>}
            </div>
            <p className="text-sm font-medium text-stone-700 whitespace-pre-line break-words">{d.reponse}</p>
          </div>
        )}

        {/* Rédaction de la réponse */}
        {composeurOuvert && (
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`reponse-${d.id}`} className="text-[9px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                <MessageSquareReply className="w-3.5 h-3.5 text-[#a38042]" />
                {d.reponse ? 'Modifier votre réponse' : 'Répondre au client'}
              </label>
              {(d.reponse || traitee) && (
                <button
                  type="button"
                  onClick={() => onComposeur(false)}
                  className="text-[9px] font-black text-stone-400 hover:text-stone-700 uppercase tracking-widest"
                >
                  Annuler
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestionsPour(d).map(s => (
                <button
                  key={s.libelle}
                  type="button"
                  onClick={() => onBrouillon(texte ? `${brouillon.trimEnd()} ${s.texte}` : s.texte)}
                  title={s.texte}
                  className="h-7 px-2.5 rounded-full border border-stone-200 bg-white text-[10px] font-bold text-stone-500 hover:text-stone-900 hover:border-[#c4a062] transition-colors"
                >
                  + {s.libelle}
                </button>
              ))}
            </div>
            <Textarea
              id={`reponse-${d.id}`}
              value={brouillon}
              onChange={e => onBrouillon(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texte && !occupe) { e.preventDefault(); onRepondre(false); }
              }}
              maxLength={MAX_REPONSE}
              rows={3}
              placeholder={`Écrivez votre réponse à ${d.clientName}… Elle s'affichera dans son espace client.`}
              className="bg-white rounded-xl border-stone-200 text-sm font-medium text-stone-800 placeholder:text-stone-300 focus-visible:ring-[#c4a062]/40 focus-visible:ring-offset-0"
            />
            {brouillon.includes('…') && (
              <p className="text-[10px] font-bold text-amber-700">Pensez à compléter les « … » avant d'envoyer.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                {brouillon.length}/{MAX_REPONSE} · Ctrl + Entrée pour envoyer
              </span>
              {/* Sur téléphone, les deux boutons s'empilent : l'envoi simple en premier. */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
                {!traitee && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!texte || occupe}
                    onClick={() => onRepondre(true)}
                    className="w-full sm:w-auto h-9 px-3 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-black uppercase text-[9px] tracking-widest"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Envoyer et marquer traitée
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={!texte || occupe}
                  onClick={() => onRepondre(false)}
                  className="w-full sm:w-auto h-9 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-[9px] tracking-widest"
                >
                  <Send className="w-3.5 h-3.5" /> Envoyer la réponse au client
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {d.statut === 'nouvelle' && (
            <Button
              type="button"
              size="sm"
              disabled={occupe}
              onClick={() => onStatut('en_cours')}
              className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[9px] tracking-widest"
            >
              <Hand className="w-3.5 h-3.5" /> Prendre en charge
            </Button>
          )}
          {!traitee && (
            <Button
              type="button"
              size="sm"
              disabled={occupe}
              onClick={() => onStatut('traitee')}
              className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[9px] tracking-widest"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Marquer traitée
            </Button>
          )}
          {traitee && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={occupe}
              onClick={() => onStatut('en_cours')}
              className="h-8 px-4 rounded-lg border-stone-200 text-stone-600 hover:bg-stone-50 font-black uppercase text-[9px] tracking-widest"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Rouvrir
            </Button>
          )}
          {!composeurOuvert && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={occupe}
              onClick={() => onComposeur(true)}
              className="h-8 px-3 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 font-black uppercase text-[9px] tracking-widest"
            >
              {d.reponse
                ? <><Pencil className="w-3.5 h-3.5" /> Modifier la réponse</>
                : <><MessageSquareReply className="w-3.5 h-3.5" /> Répondre</>}
            </Button>
          )}
          {d.majLe && d.statut !== 'nouvelle' && (
            <span className="ml-auto text-[9px] font-bold text-stone-300 uppercase tracking-widest">
              Mis à jour {depuis(d.majLe, maintenant)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
