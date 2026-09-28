'use client';

// ─── Demandes des clients, dans l'espace équipe ──────────────────────────────
// Le même travail que l'écran « Demandes clients » de /gestion (même route
// /api/admin/demandes-clients, mêmes statuts, mêmes réponses toutes faites),
// mais pensé pour l'employé et le téléphone du magasin, dans la coque sombre de
// l'espace, comme l'écran Commandes :
//   • pas de bandeau : les demandes apparaissent dès l'ouverture de l'onglet ;
//   • textes de 13 px au moins, champs en 16 px (l'iPhone ne zoome pas),
//     boutons de 40 px au moins ;
//   • aucun message volant (toast) : un seul peut s'afficher à la fois, et il
//     effacerait l'alerte « Nouvelle commande ». Chaque carte dit elle-même ce
//     qui vient d'être fait ; la pastille de l'onglet annonce les nouvelles.
// Un refus d'accès (401/403) prévient la page, qui revérifie aussitôt la session.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, Clock, Copy, Hand, Hourglass, Inbox, Layers, Loader2,
  MessageCircleQuestion, MessageSquareReply, Package, Pencil, RefreshCw, Repeat, RotateCcw, Search, Send, Store,
  Truck, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { signalerAccesRefuse } from '@/lib/acces-equipe';
import { dateHeure, depuisQuand } from '@/lib/commandes-boutique';
import { LIBELLE_DEMANDE, type DemandeEnregistree, type StatutDemande, type TypeDemande } from '@/lib/demandes-client';
import { dateFr, nombreFr } from '@/lib/statut-client';
import { copierTexte } from '@/app/admin-shop/_commandes/elements';
import { useMaintenant } from '@/app/admin-shop/_coque/etat-commandes';

// ─── Types et constantes ──────────────────────────────────────────────────────

/** Ce que renvoie la route : la demande enregistrée, sans l'uid du client. */
type Demande = Omit<DemandeEnregistree, 'clientUid'>;
type Filtre = StatutDemande | 'toutes';
type FiltreType = TypeDemande | 'tous';
type Changement = { statut?: StatutDemande; reponse?: string };
/** Ce que la carte dit après une action : réussite (s'efface seule) ou échec (reste). */
type Retour = { ton: 'ok' | 'erreur'; texte: string };

const ROUTE = '/api/admin/demandes-clients';
const RAFRAICHISSEMENT_MS = 60_000;
const MAX_REPONSE = 1000;
/** Au-delà, une demande pas encore prise en charge est signalée en rouge. */
const ATTENTE_LONGUE_MS = 24 * 3600_000;
const DUREE_RETOUR_OK_MS = 6000;

const STATUTS: Record<StatutDemande, { libelle: string; pastille: string }> = {
  nouvelle: { libelle: 'Nouvelle', pastille: 'border-[#E0314D]/50 bg-[#C8102E]/15 text-red-100' },
  en_cours: { libelle: 'En cours', pastille: 'border-amber-400/40 bg-amber-400/10 text-amber-100' },
  traitee: { libelle: 'Traitée', pastille: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' },
};

const TYPES: Record<TypeDemande, { icone: LucideIcon; pastille: string; lisere: string; carre: string }> = {
  recommande: { icone: Repeat, pastille: 'border-amber-300/30 bg-amber-300/10 text-amber-100', lisere: 'bg-amber-400', carre: 'bg-amber-400/10 text-amber-300' },
  livraison: { icone: Truck, pastille: 'border-teal-300/30 bg-teal-300/10 text-teal-100', lisere: 'bg-teal-400', carre: 'bg-teal-400/10 text-teal-300' },
  question: { icone: MessageCircleQuestion, pastille: 'border-sky-300/30 bg-sky-300/10 text-sky-100', lisere: 'bg-sky-400', carre: 'bg-sky-400/10 text-sky-300' },
};

const FILTRES: { id: Filtre; libelle: string }[] = [
  { id: 'nouvelle', libelle: 'Nouvelles' },
  { id: 'en_cours', libelle: 'En cours' },
  { id: 'traitee', libelle: 'Traitées' },
  { id: 'toutes', libelle: 'Toutes' },
];

const CONSIGNE: Record<Filtre, string> = {
  nouvelle: 'Pas encore prises en charge. La plus ancienne en premier : c’est elle qui attend depuis le plus longtemps.',
  en_cours: 'Prises en charge, pas encore terminées. La plus ancienne en premier.',
  traitee: 'Terminées. La plus récente en premier.',
  toutes: 'Toutes les demandes, la plus récente en premier.',
};

const VIDE: Record<Filtre, string> = {
  nouvelle: 'Aucune nouvelle demande : tout est à jour.',
  en_cours: 'Aucune demande en cours.',
  traitee: 'Aucune demande traitée pour l’instant.',
  toutes: 'Aucun client n’a encore envoyé de demande depuis son espace.',
};

// Classes des boutons : les mêmes proportions que l'écran Commandes.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';
const BOUTON = `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const BOUTON_SECONDAIRE = `${BOUTON} border border-white/15 text-gray-100 hover:bg-white/5`;

/** Réponses toutes faites (les mêmes que dans /gestion), à compléter avant l'envoi : les « … » sont à remplir. */
function suggestionsPour(d: Demande): { libelle: string; texte: string }[] {
  const accuse = { libelle: 'Bien reçu', texte: 'Bien reçu, merci ! Nous vous répondons très vite.' };
  if (d.type === 'recommande') return [
    accuse,
    { libelle: 'Réassort lancé', texte: "C'est noté : nous lançons le réassort. Vous pourrez suivre la commande étape par étape dans votre espace." },
    { libelle: 'Délai et prix', texte: "Merci pour votre commande. Nous vérifions le délai et le prix auprès de l'usine et vous répondons sous 48 h." },
  ];
  if (d.type === 'livraison') {
    const livraison = { libelle: 'Date de livraison', texte: "C'est noté : nous vous livrons le … Nous vous appelons la veille pour confirmer l'heure." };
    const retrait = { libelle: 'Retrait à l’entrepôt', texte: 'Votre marchandise vous attend à notre entrepôt (31 Rue 65, Lot. Al Hamd, Aïn Chock, Casablanca) à partir du … Prévenez-nous simplement avant de passer.' };
    return d.mode === 'retrait' ? [accuse, retrait, livraison] : [accuse, livraison, retrait];
  }
  return [
    accuse,
    { libelle: 'On vérifie', texte: 'Merci pour votre question. Nous vérifions et vous répondons dans la journée.' },
    { libelle: 'On vous appelle', texte: "Merci pour votre message. Nous vous appelons aujourd'hui pour en parler." },
  ];
}

// ─── Petits utilitaires ───────────────────────────────────────────────────────

const heure = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const msDe = (iso?: string) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };
const duree = (iso: string | undefined, maintenant: number) => depuisQuand(iso, maintenant).replace(/^il y a /, '');

/** Relit une ligne du résumé écrite par le serveur : « NOM — 1200 m ». */
function lireLigne(l: string): { nom: string; quantite?: string; unite?: string } {
  const m = /^(.*) — (\d+(?:\.\d+)?)(?:\s+(.+))?$/.exec(l);
  return m ? { nom: m[1], quantite: nombreFr(m[2]), unite: m[3] } : { nom: l };
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function texteRecherche(d: Demande): string {
  return sansAccents([d.clientName, LIBELLE_DEMANDE[d.type], d.message, d.reponse, ...(d.resume || [])].filter(Boolean).join(' '));
}

/** Résumé en texte brut, à coller dans WhatsApp ou un e-mail. */
function texteACopier(d: Demande): string {
  const lignes = [`Demande de ${d.clientName} — ${LIBELLE_DEMANDE[d.type]} (${dateHeure(d.creeLe)})`];
  for (const r of d.resume || []) lignes.push(`• ${r}`);
  if (d.quantite !== undefined) lignes.push(`Quantité souhaitée : ${nombreFr(d.quantite)}`);
  if (d.mode) lignes.push(`Mode : ${d.mode === 'retrait' ? 'retrait à notre entrepôt' : 'livraison'}`);
  if (d.dateSouhaitee) lignes.push(`Date souhaitée : ${dateFr(d.dateSouhaitee)}`);
  if (d.message) lignes.push(`Message : ${d.message}`);
  if (d.reponse) lignes.push(`Notre réponse : ${d.reponse}`);
  return lignes.join('\n');
}

/** Une demande lisible : la route peut évoluer, l'écran ne doit pas planter sur une ligne inattendue. */
function estDemande(d: any): d is Demande {
  return !!d && typeof d.id === 'string' && typeof d.clientName === 'string'
    && (d.type === 'recommande' || d.type === 'livraison' || d.type === 'question')
    && (d.statut === 'nouvelle' || d.statut === 'en_cours' || d.statut === 'traitee')
    && typeof d.creeLe === 'string';
}

async function corpsDe(res: Response): Promise<any> {
  try { return await res.json(); } catch { return {}; }
}

/**
 * Refus du serveur → phrase pour l'employé. 401/403 : on prévient aussi la page
 * (elle revérifie la session et ramène à la connexion s'il le faut), et on dit
 * la vraie raison donnée par le serveur (accès désactivé, session expirée…).
 */
function messageRefus(res: Response, corps: any, defaut: string): string {
  const raison = typeof corps?.error === 'string' ? corps.error.trim().replace(/[.\s]+$/, '') : '';
  if (res.status === 401 || res.status === 403) {
    signalerAccesRefuse(res.status);
    return raison ? `Accès refusé : ${raison.charAt(0).toLowerCase()}${raison.slice(1)}.` : 'Accès refusé : reconnectez-vous puis réessayez.';
  }
  return raison ? `${raison}.` : defaut;
}

const PAS_DE_RESEAU = 'Pas de connexion au serveur. Vérifiez Internet puis réessayez.';

// ─── Écran ────────────────────────────────────────────────────────────────────

export function DemandesEquipe({ actif, onNouvelles }: {
  /** Vrai quand l'onglet est affiché : en y revenant, la liste se rafraîchit si elle date. */
  actif: boolean;
  /** Reçoit le nombre de demandes nouvelles à chaque chargement (pastille de l'onglet). */
  onNouvelles: (n: number) => void;
}) {
  const [serveur, setServeur] = useState<Demande[]>([]);
  // Modifications envoyées, pas encore confirmées : appliquées par-dessus la liste
  // du serveur, retirées à la réponse (et gardées si le serveur accepte).
  const [enVol, setEnVol] = useState<{ jeton: number; id: string; champs: Partial<Demande> }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargeLe, setChargeLe] = useState<number | null>(null);
  const maintenant = useMaintenant();

  const [filtre, setFiltre] = useState<Filtre>('nouvelle');
  const [filtreType, setFiltreType] = useState<FiltreType>('tous');
  const [recherche, setRecherche] = useState('');
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [composeurs, setComposeurs] = useState<Record<string, boolean>>({});
  const [retours, setRetours] = useState<Record<string, Retour>>({});

  const compteurJeton = useRef(0);
  const derniereEcriture = useRef(0);
  const chargeLeRef = useRef(0);
  const enChargement = useRef(false);
  const premierChargement = useRef(true);
  const minuteries = useRef<Record<string, number>>({});

  useEffect(() => () => { Object.values(minuteries.current).forEach(t => window.clearTimeout(t)); }, []);

  const direRetour = useCallback((id: string, r: Retour | null) => {
    window.clearTimeout(minuteries.current[id]);
    setRetours(l => {
      const { [id]: _ancien, ...reste } = l;
      return r ? { ...reste, [id]: r } : reste;
    });
    if (r?.ton === 'ok') minuteries.current[id] = window.setTimeout(() => direRetour(id, null), DUREE_RETOUR_OK_MS);
  }, []);

  const charger = useCallback(async (manuel = false) => {
    if (enChargement.current) return;
    enChargement.current = true;
    if (manuel) setActualisation(true);
    const debut = Date.now();
    try {
      let res: Response;
      try {
        res = await authedFetch(ROUTE, { cache: 'no-store' });
      } catch {
        throw new Error(typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Pas de connexion Internet : les demandes ne peuvent pas être chargées.'
          : PAS_DE_RESEAU);
      }
      const corps = await corpsDe(res);
      if (!res.ok) throw new Error(messageRefus(res, corps, "Les demandes n'ont pas pu être chargées. Réessayez dans un instant."));
      // Une modification a été enregistrée pendant la lecture : cette liste est déjà
      // périmée, la prochaine lecture la remplacera.
      if (debut < derniereEcriture.current) return;

      const liste: Demande[] = Array.isArray(corps?.demandes) ? corps.demandes.filter(estDemande) : [];
      if (premierChargement.current) {
        // On ouvre là où il y a quelque chose à faire.
        premierChargement.current = false;
        if (!liste.some(d => d.statut === 'nouvelle')) setFiltre(liste.some(d => d.statut === 'en_cours') ? 'en_cours' : 'toutes');
      }
      setServeur(liste);
      setErreur(null);
      const t = Date.now();
      chargeLeRef.current = t;
      setChargeLe(t);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : "Les demandes n'ont pas pu être chargées.");
    } finally {
      enChargement.current = false;
      setChargement(false);
      setActualisation(false);
    }
  }, []);

  // Au montage, puis chaque minute tant que la page est visible ; au retour sur
  // la page, on rafraîchit si la dernière lecture date de plus de 30 s.
  useEffect(() => {
    void charger();
    const minuterie = window.setInterval(() => {
      if (document.visibilityState === 'visible') void charger();
    }, RAFRAICHISSEMENT_MS);
    const auRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - chargeLeRef.current > 30_000) void charger();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [charger]);

  // En revenant sur l'onglet Demandes.
  useEffect(() => {
    if (actif && chargeLeRef.current && Date.now() - chargeLeRef.current > 30_000) void charger();
  }, [actif, charger]);

  const demandes = useMemo(() => {
    if (!enVol.length) return serveur;
    return serveur.map(d => enVol.reduce((acc, e) => (e.id === d.id ? { ...acc, ...e.champs } : acc), d));
  }, [serveur, enVol]);

  const occupes = useMemo(() => new Set(enVol.map(e => e.id)), [enVol]);

  const nbNouvelles = useMemo(() => demandes.filter(d => d.statut === 'nouvelle').length, [demandes]);
  useEffect(() => { onNouvelles(nbNouvelles); }, [nbNouvelles, onNouvelles]);

  // La nouvelle qui attend depuis le plus longtemps.
  const plusAncienne = useMemo(() => {
    const nouvelles = demandes.filter(d => d.statut === 'nouvelle');
    return nouvelles.length ? nouvelles.reduce((a, b) => (String(a.creeLe) <= String(b.creeLe) ? a : b)) : null;
  }, [demandes]);

  const q = sansAccents(recherche.trim());
  // Recherche et type valent pour tous les onglets : leurs compteurs disent ce qui reste.
  const trouvees = useMemo(
    () => demandes.filter(d => (filtreType === 'tous' || d.type === filtreType) && (!q || texteRecherche(d).includes(q))),
    [demandes, filtreType, q],
  );

  const compteFiltre = useMemo(() => {
    const n: Record<Filtre, number> = { nouvelle: 0, en_cours: 0, traitee: 0, toutes: trouvees.length };
    for (const d of trouvees) n[d.statut]++;
    return n;
  }, [trouvees]);

  const compteType = useMemo(() => {
    const base = demandes.filter(d => (filtre === 'toutes' || d.statut === filtre) && (!q || texteRecherche(d).includes(q)));
    const n: Record<FiltreType, number> = { tous: base.length, recommande: 0, livraison: 0, question: 0 };
    for (const d of base) n[d.type]++;
    return n;
  }, [demandes, filtre, q]);

  // À traiter : la plus ancienne d'abord. Traitées ou toutes : la plus récente d'abord (ordre du serveur).
  const visibles = useMemo(() => {
    const l = trouvees.filter(d => filtre === 'toutes' || d.statut === filtre);
    if (filtre === 'nouvelle' || filtre === 'en_cours') return [...l].sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe)));
    return l;
  }, [trouvees, filtre]);

  // ─── Écritures ──────────────────────────────────────────────────────────────

  const modifier = useCallback(async (d: Demande, changement: Changement, reussite: string): Promise<boolean> => {
    // Uniquement les champs définis : rien d'indéfini ne part vers le serveur.
    const corps: Record<string, string> = { id: d.id };
    const champs: Partial<Demande> = { majLe: new Date().toISOString() };
    if (changement.statut) { corps.statut = changement.statut; champs.statut = changement.statut; }
    if (changement.reponse !== undefined) {
      const reponse = changement.reponse.trim().slice(0, MAX_REPONSE);
      corps.reponse = reponse;
      champs.reponse = reponse;
    }
    const jeton = ++compteurJeton.current;
    setEnVol(l => [...l, { jeton, id: d.id, champs }]);
    direRetour(d.id, null);
    try {
      let res: Response;
      try {
        res = await authedFetch(ROUTE, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
      } catch {
        throw new Error(`${PAS_DE_RESEAU} Rien n’a été enregistré.`);
      }
      const retour = await corpsDe(res);
      if (!res.ok || !retour?.success) throw new Error(messageRefus(res, retour, "La modification n'a pas été enregistrée. Réessayez."));
      derniereEcriture.current = Date.now();
      setServeur(l => l.map(x => (x.id === d.id ? { ...x, ...champs } : x)));
      direRetour(d.id, { ton: 'ok', texte: reussite });
      return true;
    } catch (e) {
      direRetour(d.id, { ton: 'erreur', texte: e instanceof Error && e.message ? e.message : "La modification n'a pas été enregistrée." });
      return false;
    } finally {
      setEnVol(l => l.filter(x => x.jeton !== jeton));
    }
  }, [direRetour]);

  const changerStatut = useCallback((d: Demande, statut: StatutDemande) => {
    const textes: Record<StatutDemande, string> = {
      en_cours: d.statut === 'traitee'
        ? `Demande rouverte : elle est de nouveau dans « En cours ».`
        : `Prise en charge : ${d.clientName} le voit dans son espace. La demande passe dans « En cours ».`,
      traitee: `Demande traitée : ${d.clientName} le voit dans son espace.`,
      nouvelle: 'Demande remise dans « Nouvelles ».',
    };
    void modifier(d, { statut }, textes[statut]);
  }, [modifier]);

  const brouillonsRef = useRef(brouillons);
  brouillonsRef.current = brouillons;

  const repondre = useCallback(async (d: Demande, traiter: boolean) => {
    const texte = (brouillonsRef.current[d.id] ?? '').trim();
    if (!texte) return;
    // Répondre, c'est au moins prendre la demande en charge.
    const statut: StatutDemande | undefined = traiter ? 'traitee' : (d.statut === 'nouvelle' ? 'en_cours' : undefined);
    setComposeurs(c => ({ ...c, [d.id]: false }));
    setBrouillons(b => { const { [d.id]: _retire, ...reste } = b; return reste; });
    const ok = await modifier(d, { reponse: texte, ...(statut ? { statut } : {}) },
      `${traiter ? 'Réponse envoyée, demande traitée' : 'Réponse envoyée'} : ${d.clientName} la verra dans son espace client.`);
    if (!ok) {
      // Le texte est rendu, pour ne pas être perdu.
      setBrouillons(b => ({ ...b, [d.id]: texte }));
      setComposeurs(c => ({ ...c, [d.id]: true }));
    }
  }, [modifier]);

  const copier = useCallback(async (d: Demande) => {
    const ok = await copierTexte(texteACopier(d));
    direRetour(d.id, ok
      ? { ton: 'ok', texte: 'Demande copiée : prête à coller dans WhatsApp ou un e-mail.' }
      : { ton: 'erreur', texte: 'La copie n’a pas marché sur cet appareil.' });
  }, [direRetour]);

  const ouvrirComposeur = useCallback((d: Demande, ouvert: boolean) => {
    setComposeurs(c => ({ ...c, [d.id]: ouvert }));
    // « Modifier la réponse » : on repart du texte déjà envoyé.
    if (ouvert && d.reponse && !brouillonsRef.current[d.id]) setBrouillons(b => ({ ...b, [d.id]: d.reponse || '' }));
  }, []);

  const changerBrouillon = useCallback((id: string, texte: string) => setBrouillons(b => ({ ...b, [id]: texte })), []);
  const fermerRetour = useCallback((id: string) => direRetour(id, null), [direRetour]);

  const toutAfficher = () => { setFiltre('nouvelle'); setFiltreType('tous'); setRecherche(''); };

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  const ancienneEnRetard = plusAncienne ? maintenant - (msDe(plusAncienne.creeLe) ?? maintenant) > ATTENTE_LONGUE_MS : false;

  return (
    <div className="space-y-3">
      {/* Filtres par statut (comme les files de l'écran Commandes) */}
      <div role="group" aria-label="Demandes par statut" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {FILTRES.map(f => {
          const choisi = filtre === f.id;
          const n = compteFiltre[f.id];
          const aTraiter = f.id === 'nouvelle' && n > 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltre(f.id)}
              aria-pressed={choisi}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${FOCUS} ${
                choisi ? 'border-[#C8102E] bg-[#C8102E] text-white' : 'border-white/10 bg-[#1A1A1A] text-gray-200 hover:border-white/25 hover:text-white'
              }`}
            >
              {f.libelle}
              <span className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                choisi ? 'bg-white/25 text-white' : aTraiter ? 'bg-amber-400 text-black' : 'bg-white/10 text-gray-200'
              }`}>
                {chargement ? '…' : n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Consigne + actualisation */}
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-[13px] leading-snug text-gray-400">
          {CONSIGNE[filtre]}
          {chargeLe && <span className="block text-gray-400">Actualisé à {heure(chargeLe)}, puis toutes les minutes.</span>}
        </p>
        <button
          type="button"
          onClick={() => void charger(true)}
          disabled={actualisation}
          aria-label="Actualiser les demandes"
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 disabled:opacity-60 ${FOCUS}`}
        >
          <RefreshCw className={`h-4 w-4 ${actualisation ? 'animate-spin' : ''}`} aria-hidden />
          <span className="hidden sm:inline">Actualiser</span>
        </button>
      </div>

      {/* La plus ancienne qui attend */}
      {plusAncienne && (
        <button
          type="button"
          onClick={toutAfficher}
          className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${FOCUS} ${
            ancienneEnRetard
              ? 'border-red-500/50 bg-red-500/10 text-red-100 hover:bg-red-500/15'
              : 'border-white/10 bg-[#1A1A1A] text-gray-200 hover:border-white/25'
          }`}
        >
          <Hourglass className={`h-4 w-4 shrink-0 ${ancienneEnRetard ? 'text-red-300' : 'text-amber-300'}`} aria-hidden />
          <span className="min-w-0">
            La plus ancienne attend depuis <strong className="font-semibold">{duree(plusAncienne.creeLe, maintenant)}</strong>
            {' — '}{plusAncienne.clientName}
          </span>
        </button>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          enterKeyHint="search"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Client, produit, message…"
          aria-label="Rechercher une demande"
          // 16 px sur téléphone : en dessous, l'iPhone zoome la page à chaque saisie.
          className="h-12 w-full rounded-xl border border-white/10 bg-[#1A1A1A] pl-11 pr-11 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/30 focus:outline-none xl:text-[15px] [&::-webkit-search-cancel-button]:hidden"
        />
        {recherche && (
          <button
            type="button"
            onClick={() => setRecherche('')}
            aria-label="Effacer la recherche"
            className={`absolute right-1.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-300 hover:bg-white/5 hover:text-white ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      {/* Type de demande */}
      <div role="group" aria-label="Type de demande" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
        {(['tous', 'recommande', 'livraison', 'question'] as FiltreType[]).map(t => {
          const Icone = t === 'tous' ? Layers : TYPES[t].icone;
          const choisi = filtreType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFiltreType(t)}
              aria-pressed={choisi}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${FOCUS} ${
                choisi ? 'border-white/60 bg-white text-black' : 'border-white/10 text-gray-200 hover:border-white/25 hover:text-white'
              }`}
            >
              <Icone className="h-4 w-4" aria-hidden />
              {t === 'tous' ? 'Tous les types' : LIBELLE_DEMANDE[t]}
              <span className={`tabular-nums ${choisi ? 'text-black/60' : 'text-gray-400'}`}>{compteType[t]}</span>
            </button>
          );
        })}
      </div>

      {/* Actualisation impossible : la liste affichée reste utilisable */}
      {erreur && !chargement && serveur.length > 0 && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <span>
            Dernière actualisation impossible. {erreur}
            {chargeLe ? ` Les demandes affichées datent de ${heure(chargeLe)}.` : ''}
          </span>
        </div>
      )}

      {/* Contenu */}
      {chargement ? (
        <div className="flex items-center justify-center gap-2.5 py-16 text-gray-300" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-[#E0314D]" aria-hidden />
          <span className="text-[15px]">Chargement des demandes…</span>
        </div>
      ) : erreur && serveur.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-300" aria-hidden />
          <p className="max-w-sm text-[15px] text-red-100">{erreur}</p>
          <button type="button" onClick={() => void charger(true)} disabled={actualisation} className={`${BOUTON_SECONDAIRE} border-red-400/40`}>
            <RefreshCw className={`h-4 w-4 ${actualisation ? 'animate-spin' : ''}`} aria-hidden /> Réessayer
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#1A1A1A] px-6 py-12 text-center">
          <Inbox className="h-8 w-8 text-gray-400" aria-hidden />
          <p className="max-w-xs text-[15px] text-gray-200">
            {recherche.trim()
              ? `Aucune demande ne correspond à « ${recherche.trim()} » ici.`
              : filtreType !== 'tous'
                ? `Aucune demande « ${LIBELLE_DEMANDE[filtreType]} » ici.`
                : VIDE[filtre]}
          </p>
          {(recherche.trim() || filtreType !== 'tous') && (
            <button type="button" onClick={() => { setRecherche(''); setFiltreType('tous'); }} className={BOUTON_SECONDAIRE}>
              Tout afficher
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map(d => (
            <CarteDemande
              key={d.id}
              demande={d}
              maintenant={maintenant}
              occupe={occupes.has(d.id)}
              brouillon={brouillons[d.id] ?? ''}
              composeurOuvert={composeurs[d.id] ?? (d.statut !== 'traitee' && !d.reponse)}
              retour={retours[d.id] ?? null}
              onBrouillon={changerBrouillon}
              onComposeur={ouvrirComposeur}
              onStatut={changerStatut}
              onRepondre={repondre}
              onCopier={copier}
              onFermerRetour={fermerRetour}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Carte d'une demande ──────────────────────────────────────────────────────
// Composant à part (et mémorisé) : la zone de réponse garde le focus pendant la
// frappe, et les autres cartes ne se redessinent pas à chaque lettre.

interface CarteDemandeProps {
  demande: Demande;
  maintenant: number;
  occupe: boolean;
  brouillon: string;
  composeurOuvert: boolean;
  retour: Retour | null;
  onBrouillon: (id: string, texte: string) => void;
  onComposeur: (d: Demande, ouvert: boolean) => void;
  onStatut: (d: Demande, statut: StatutDemande) => void;
  onRepondre: (d: Demande, traiter: boolean) => void;
  onCopier: (d: Demande) => void;
  onFermerRetour: (id: string) => void;
}

function Etiquette({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</p>;
}

const CarteDemande = memo(function CarteDemande({
  demande: d, maintenant, occupe, brouillon, composeurOuvert, retour,
  onBrouillon, onComposeur, onStatut, onRepondre, onCopier, onFermerRetour,
}: CarteDemandeProps) {
  const style = TYPES[d.type] || TYPES.question;
  const Icone = d.type === 'livraison' && d.mode === 'retrait' ? Store : style.icone;
  const statut = STATUTS[d.statut] || STATUTS.nouvelle;
  const lignes = (d.resume || []).map(lireLigne);
  // Pour un réassort, l'unité est celle de la commande d'origine.
  const unite = d.type === 'recommande' && lignes.length === 1 ? lignes[0].unite : undefined;
  const cree = msDe(d.creeLe);
  const enRetard = d.statut === 'nouvelle' && cree !== null && maintenant - cree > ATTENTE_LONGUE_MS;
  const traitee = d.statut === 'traitee';
  const texte = brouillon.trim();
  const idReponse = `reponse-${d.id}`;

  const details: { icone: LucideIcon; libelle: string; valeur: string }[] = [];
  if (d.quantite !== undefined) details.push({ icone: Package, libelle: 'Quantité souhaitée', valeur: `${nombreFr(d.quantite)}${unite ? ` ${unite}` : ''}` });
  if (d.mode) details.push({ icone: d.mode === 'retrait' ? Store : Truck, libelle: 'Mode', valeur: d.mode === 'retrait' ? 'Retrait à notre entrepôt' : 'Livraison chez le client' });
  if (d.dateSouhaitee) details.push({ icone: CalendarDays, libelle: 'Date souhaitée', valeur: dateFr(d.dateSouhaitee) });

  return (
    <article
      aria-label={`Demande de ${d.clientName}`}
      aria-busy={occupe || undefined}
      className={`relative overflow-hidden rounded-2xl border bg-[#1A1A1A] ${enRetard ? 'border-red-500/50' : 'border-white/10'}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${style.lisere}`} />
      <div className="space-y-3.5 py-4 pl-5 pr-3 sm:pr-4">

        {/* Client, type, statut, date */}
        <div className="flex items-start gap-3">
          <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${style.carre}`} aria-hidden>
            <Icone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-base font-bold text-gray-100">
              <UserRound className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="min-w-0 break-words">{d.clientName}</span>
              {occupe && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" aria-label="Enregistrement…" />}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.pastille}`}>
                <Icone className="h-3.5 w-3.5 sm:hidden" aria-hidden />
                {LIBELLE_DEMANDE[d.type]}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statut.pastille}`}>{statut.libelle}</span>
            </div>
            <p className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm ${enRetard ? 'font-semibold text-red-300' : 'text-gray-300'}`}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{dateHeure(d.creeLe, maintenant)}</span>
              <span aria-hidden>·</span>
              <span>{enRetard ? `en attente depuis ${duree(d.creeLe, maintenant)}` : depuisQuand(d.creeLe, maintenant)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopier(d)}
            title="Copier la demande (pour WhatsApp ou un e-mail)"
            aria-label={`Copier la demande de ${d.clientName}`}
            className={`-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-300 hover:bg-white/5 hover:text-white ${FOCUS}`}
          >
            <Copy className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Commandes concernées */}
        {lignes.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#141414]">
            <div className="px-3 pt-2.5">
              <Etiquette>
                {d.type === 'recommande' ? 'Produit à recommander' : lignes.length > 1 ? `${lignes.length} commandes concernées` : 'Commande concernée'}
              </Etiquette>
            </div>
            <ul className="divide-y divide-white/5">
              {lignes.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 break-words text-sm font-medium text-gray-100">{l.nom}</span>
                  {l.quantite && (
                    <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-gray-200">
                      {l.quantite}{l.unite ? ` ${l.unite}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quantité, mode, date souhaitée */}
        {details.length > 0 && (
          <dl className="grid gap-2 sm:flex sm:flex-wrap">
            {details.map(({ icone: I, libelle, valeur }) => (
              <div key={libelle} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
                <I className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <dt className="text-sm text-gray-400">{libelle}</dt>
                <dd className="text-sm font-semibold text-gray-100">{valeur}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Message du client */}
        {d.message && (
          <blockquote className="rounded-xl border-l-4 border-amber-400/70 bg-amber-400/5 px-3.5 py-3">
            <Etiquette>Message du client</Etiquette>
            <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-100">{d.message}</p>
          </blockquote>
        )}

        {/* Réponse déjà envoyée */}
        {d.reponse && !composeurOuvert && (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3.5 py-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              <span className="inline-flex items-center gap-1.5"><MessageSquareReply className="h-4 w-4" aria-hidden /> Réponse envoyée, visible par le client</span>
              {(d.reponduLe || d.majLe) && (
                <span className="font-normal normal-case tracking-normal text-emerald-200/80">{dateHeure(d.reponduLe || d.majLe, maintenant)}</span>
              )}
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-100">{d.reponse}</p>
          </div>
        )}

        {/* Rédaction de la réponse */}
        {composeurOuvert && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-[#141414] p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={idReponse} className="flex items-center gap-1.5 text-sm font-semibold text-gray-100">
                <MessageSquareReply className="h-4 w-4 text-gray-300" aria-hidden />
                {d.reponse ? 'Modifier votre réponse' : 'Répondre au client'}
              </label>
              {(d.reponse || traitee) && (
                <button
                  type="button"
                  onClick={() => onComposeur(d, false)}
                  className={`-my-1 inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white ${FOCUS}`}
                >
                  Annuler
                </button>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[13px] text-gray-400">Réponses toutes faites (ajoutées au texte) :</p>
              <div className="flex flex-wrap gap-2">
                {suggestionsPour(d).map(s => (
                  <button
                    key={s.libelle}
                    type="button"
                    onClick={() => onBrouillon(d.id, texte ? `${brouillon.trimEnd()} ${s.texte}` : s.texte)}
                    title={s.texte}
                    className={`inline-flex h-10 items-center rounded-full border border-white/15 px-3.5 text-sm font-medium text-gray-200 transition-colors hover:border-white/30 hover:text-white ${FOCUS}`}
                  >
                    + {s.libelle}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id={idReponse}
              value={brouillon}
              onChange={e => onBrouillon(d.id, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texte && !occupe) { e.preventDefault(); onRepondre(d, false); }
              }}
              maxLength={MAX_REPONSE}
              rows={4}
              placeholder={`Votre réponse à ${d.clientName}… Elle s’affichera dans son espace client.`}
              // 16 px sur téléphone : en dessous, l'iPhone zoome la page à chaque saisie.
              className="block w-full resize-y rounded-xl border border-white/15 bg-[#0F0F0F] px-3.5 py-3 text-base leading-relaxed text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/10 sm:text-[15px]"
            />
            {brouillon.includes('…') && (
              <p className="flex items-start gap-1.5 text-sm font-medium text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Complétez les « … » avant d’envoyer.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs tabular-nums text-gray-400">
                {brouillon.length}/{MAX_REPONSE}
                <span className="hidden sm:inline"> · Ctrl + Entrée pour envoyer</span>
              </span>
              {/* Téléphone : boutons empilés, l'envoi simple en premier. */}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  disabled={!texte || occupe}
                  onClick={() => onRepondre(d, false)}
                  className={`${BOUTON} h-12 bg-[#C8102E] text-white hover:bg-[#a50d25] sm:h-11`}
                >
                  <Send className="h-4 w-4" aria-hidden /> Envoyer la réponse
                </button>
                {!traitee && (
                  <button
                    type="button"
                    disabled={!texte || occupe}
                    onClick={() => onRepondre(d, true)}
                    className={`${BOUTON} h-12 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-400/10 sm:h-11`}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Envoyer et marquer traitée
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ce qui vient d'être fait (ou pourquoi ça n'a pas marché) */}
        {retour && (
          <div
            role={retour.ton === 'erreur' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
              retour.ton === 'ok' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-red-500/40 bg-red-500/10 text-red-100'
            }`}
          >
            {retour.ton === 'ok'
              ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />}
            <span className="min-w-0 flex-1">{retour.texte}</span>
            <button
              type="button"
              onClick={() => onFermerRetour(d.id)}
              aria-label="Fermer le message"
              className={`-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg opacity-80 hover:bg-white/5 hover:opacity-100 ${FOCUS}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
          {d.statut === 'nouvelle' && (
            <button type="button" disabled={occupe} onClick={() => onStatut(d, 'en_cours')} className={`${BOUTON} bg-amber-400 text-black hover:bg-amber-300`}>
              <Hand className="h-4 w-4" aria-hidden /> Prendre en charge
            </button>
          )}
          {!traitee && (
            <button type="button" disabled={occupe} onClick={() => onStatut(d, 'traitee')} className={`${BOUTON} bg-emerald-600 text-white hover:bg-emerald-500`}>
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Marquer traitée
            </button>
          )}
          {traitee && (
            <button type="button" disabled={occupe} onClick={() => onStatut(d, 'en_cours')} className={BOUTON_SECONDAIRE}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Rouvrir
            </button>
          )}
          {!composeurOuvert && (
            <button type="button" disabled={occupe} onClick={() => onComposeur(d, true)} className={BOUTON_SECONDAIRE}>
              {d.reponse
                ? <><Pencil className="h-4 w-4" aria-hidden /> Modifier la réponse</>
                : <><MessageSquareReply className="h-4 w-4" aria-hidden /> Répondre</>}
            </button>
          )}
          {d.majLe && d.statut !== 'nouvelle' && (
            <span className="text-[13px] text-gray-400 min-[400px]:col-span-2 sm:ml-auto">
              Mise à jour {depuisQuand(d.majLe, maintenant)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
});
