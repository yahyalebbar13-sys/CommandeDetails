'use client';

// ─── Colis Sendit, dans la fiche d'une commande ──────────────────────────────
// Pour une commande « à domicile » (petits articles) : choisir le quartier du
// client, relire le montant que le livreur encaissera, créer le colis chez
// Sendit, imprimer l'étiquette A4, demander le ramassage à Derb Omar et suivre
// le statut. Tout passe par le serveur (/api/shop/sendit/*), qui relit la
// commande et refuse ce qui ne doit pas partir (volumineux, non confirmée,
// total incohérent, plus de 3 000 DH d'espèces…).
//
// Tant que les clés Sendit ne sont pas posées, le panneau le dit simplement et
// l'équipe crée le colis sur app.sendit.ma, comme avant.
//
// Monté par la fiche (admin et /staff) : <PanneauSendit commande={o} estAdmin={…} />.
// Les frais que Sendit facture à LEBTEX ne s'affichent qu'à l'administrateur.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Check, ClipboardCopy, ExternalLink, History, Loader2, MapPin, PackageCheck, Printer,
  RefreshCw, Search, Send, Truck, X,
} from 'lucide-react';
import type { ShopOrder } from '@/lib/shop-types';
import { authedFetch } from '@/lib/authed-fetch';
import { signalerAccesRefuse } from '@/lib/acces-equipe';
import { dateHeure, telLisible } from '@/lib/commandes-boutique';
import { BOUTON_SECONDAIRE, copierTexte } from './elements';

// ─── Ce que renvoie le serveur ───────────────────────────────────────────────

interface ColisAffiche {
  code: string | null;
  statut: string | null;
  statutLibelle: string | null;
  statutRetour: string | null;
  statutRetourLibelle: string | null;
  ton: 'ok' | 'attention' | 'probleme' | 'neutre';
  termine: boolean;
  alerte: { type: 'a_rappeler' | 'a_verifier'; libelle: string; explication: string; le: string | null } | null;
  montant: number | null;
  /** Acompte déjà reçu (arrangement au-delà du plafond d'espèces), que Sendit n'encaisse pas. */
  acompte: number | null;
  fee?: number | null;
  plafondAccepte?: boolean;
  /** Administrateur seulement. */
  noteAcompte?: string | null;
  especesConfirmees?: boolean;
  quartier: string | null;
  le: string | null;
  par: string;
  statutLe: string | null;
  ramassage: { le: string | null; code: string | null } | null;
  nouvelleTentative: string | null;
  tentatives: number | null;
  message: string | null;
  photo: string | null;
  enCours: boolean;
  sansReponse: boolean;
  historique: { statut: string; libelle: string; le: string; source: string }[];
}

interface QuartierPropose {
  id: number;
  ville: string;
  name: string;
  price: number | null;
  delais: string;
}

interface EtatSendit {
  configure: boolean;
  mode: 'domicile' | 'retrait' | 'transport';
  volumineux: boolean;
  paiement: 'cod' | 'virement' | 'carte';
  paiementRecu: boolean;
  colis: ColisAffiche | null;
  apercu: {
    montant: number;
    telephone: string | null;
    ville: string;
    blocages: string[];
    avertissements: string[];
    plafondDepasse: boolean;
    plafond: number;
    /** Virement (ou carte) choisi, pas encore noté reçu : l'équipe ne peut pas envoyer. */
    virementNonRecu: boolean;
    total: number;
    quartierSuggere: QuartierPropose | null;
  };
}

interface RamassageEnAttente {
  configure: boolean;
  colis: { code: string; numero: string; le: string | null }[];
  dernier: { le: string | null; nombre: number; code: string | null; par: string; sansReponse: boolean } | null;
}

// ─── Appels ──────────────────────────────────────────────────────────────────

class ErreurPanneau extends Error {
  constructor(message: string, readonly statut?: number, readonly corps?: any) {
    super(message);
    this.name = 'ErreurPanneau';
  }
}

/** La création d'un colis peut attendre la connexion Sendit et la liste des quartiers. */
const DELAI_MS = 50_000;

async function appeler<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErreurPanneau('Pas de connexion Internet : rien n’a été envoyé. Réessayez quand le réseau revient.');
  }
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  let reponse: Response;
  try {
    reponse = await authedFetch(url, { ...init, signal: controleur.signal, cache: 'no-store' });
  } catch (e) {
    const envoye = init.method === 'POST' && (e as Error)?.name === 'AbortError';
    throw new ErreurPanneau(envoye
      ? 'Le serveur n’a pas répondu à temps. C’est peut-être fait : appuyez sur « Rafraîchir » avant de réessayer.'
      : 'Pas de connexion au serveur. Vérifiez Internet puis réessayez.');
  } finally {
    clearTimeout(minuterie);
  }
  let corps: any = null;
  try { corps = await reponse.json(); } catch { /* réponse vide */ }
  if (reponse.ok) return corps as T;
  // L'espace /staff revérifie la session (mot de passe changé, accès coupé).
  if (reponse.status === 401 || reponse.status === 403) signalerAccesRefuse(reponse.status);
  throw new ErreurPanneau(String(corps?.error || messageSansExplication(reponse.status, init.method === 'POST')), reponse.status, corps);
}

/**
 * Le serveur a répondu sans explication (page d'erreur de Vercel) : le plus souvent un
 * délai dépassé. Pour un envoi, on ne sait pas s'il a abouti : on le dit.
 */
function messageSansExplication(statut: number, envoi: boolean): string {
  const delai = statut === 504 || statut === 502 || statut === 408;
  if (delai) {
    return envoi
      ? `Le serveur a mis trop de temps (erreur ${statut}). C’est peut-être fait : appuyez sur « Rafraîchir » avant de réessayer.`
      : `Le serveur a mis trop de temps (erreur ${statut}). Réessayez dans un instant.`;
  }
  return `Opération impossible (erreur ${statut}). Réessayez ; si ça recommence, envoyez cette erreur à l’administrateur.`;
}

const ROUTE_ENVOI = '/api/shop/sendit/envoyer';
const envoyerAction = <T,>(corps: Record<string, unknown>) =>
  appeler<T>(ROUTE_ENVOI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

// ─── Petits morceaux ─────────────────────────────────────────────────────────

const dh = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH` : '—';

/**
 * Montant partiel tapé par l'administrateur (« 2 500 », « 2500,5 ») : entre 1 DH et le
 * plafond d'espèces, et moins que le total ; sinon null. Le serveur revérifie.
 */
function montantPartielLu(v: string, plafond: number, total: number): number | null {
  const n = Number(String(v ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  if (!v.trim() || !Number.isFinite(n)) return null;
  const m = Math.round(n * 100) / 100;
  return m >= 1 && m <= plafond && m < total ? m : null;
}

const quand = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const t = dateHeure(iso);
  return /^\d/.test(t) ? `le ${t}` : t;
};

const CHAMP =
  'w-full h-12 rounded-xl bg-[#0F0F0F] border border-white/15 pl-10 pr-4 text-base text-white placeholder:text-gray-400 outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/30';
const BOUTON_PRINCIPAL =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#C8102E] text-sm font-semibold text-white hover:bg-[#a50d26] active:bg-[#8f0b21] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';

type Ton = 'ok' | 'erreur' | 'info' | 'attention';

function Bandeau({ ton, children }: { ton: Ton; children: ReactNode }) {
  const styles: Record<Ton, string> = {
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    erreur: 'border-red-500/40 bg-red-500/10 text-red-100',
    attention: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    info: 'border-white/10 bg-white/5 text-gray-200',
  };
  const Icone = ton === 'ok' ? Check : ton === 'info' ? Truck : AlertTriangle;
  return (
    <div role={ton === 'erreur' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${styles[ton]}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px] text-gray-300">
      <span className="text-gray-400">{libelle}</span>
      <span className="text-right text-gray-100">{children}</span>
    </div>
  );
}

const COULEUR_TON: Record<ColisAffiche['ton'], string> = {
  ok: '#10B981',
  attention: '#F59E0B',
  probleme: '#EF4444',
  neutre: '#06B6D4',
};

function PastilleSendit({ colis }: { colis: ColisAffiche }) {
  const couleur = COULEUR_TON[colis.ton] || COULEUR_TON.neutre;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-gray-100"
      style={{ background: `${couleur}26`, borderColor: `${couleur}66` }}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: couleur }} />
      {colis.statutLibelle || 'Statut inconnu'}
    </span>
  );
}

// ─── Choix du quartier ───────────────────────────────────────────────────────

function ChoixQuartier({
  ville, choisi, estAdmin, onChoisir,
}: {
  ville: string;
  choisi: QuartierPropose | null;
  estAdmin: boolean;
  onChoisir: (q: QuartierPropose | null) => void;
}) {
  const idChamp = useId();
  const idListe = useId();
  const [ouvert, setOuvert] = useState(!choisi);
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<QuartierPropose[]>([]);
  const [lecture, setLecture] = useState<'repos' | 'chargement' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');

  useEffect(() => { if (!choisi) setOuvert(true); }, [choisi]);

  useEffect(() => {
    if (!ouvert) return;
    const q = recherche.trim();
    if (!q && !ville.trim()) { setResultats([]); setLecture('repos'); return; }
    const controleur = new AbortController();
    const minuterie = setTimeout(async () => {
      setLecture('chargement');
      try {
        const params = new URLSearchParams({ q, ville });
        // Route réservée à l'équipe : le jeton de la session part avec la demande.
        const rep = await authedFetch(`/api/shop/sendit/quartiers?${params.toString()}`, { signal: controleur.signal });
        const corps = await rep.json().catch(() => null);
        if (rep.status === 401 || rep.status === 403) signalerAccesRefuse(rep.status);
        if (!rep.ok) throw new Error(String(corps?.error || 'Liste des quartiers indisponible.'));
        setResultats(Array.isArray(corps?.quartiers) ? corps.quartiers : []);
        setLecture('repos');
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setErreur((e as Error)?.message || 'Liste des quartiers indisponible.');
        setLecture('erreur');
      }
    }, q ? 300 : 0);
    return () => { clearTimeout(minuterie); controleur.abort(); };
  }, [recherche, ville, ouvert]);

  if (choisi && !ouvert) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
        <p className="min-w-0 text-[15px] text-gray-100">
          <MapPin className="mr-1.5 inline h-4 w-4 text-gray-400" aria-hidden />
          <span className="font-semibold">{choisi.name}</span>
          {choisi.delais && <span className="text-gray-400"> · {choisi.delais}</span>}
          {estAdmin && choisi.price !== null && <span className="text-gray-400"> · tarif Sendit {dh(choisi.price)}</span>}
        </p>
        <button type="button" onClick={() => setOuvert(true)} className={BOUTON_SECONDAIRE}>Changer</button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={idChamp} className="block text-sm font-semibold text-gray-200">
        Quartier du client chez Sendit
      </label>
      <p className="mt-0.5 text-xs text-gray-400">
        Ville notée : {ville || 'aucune'}. Tapez le quartier (ex. « Maarif », « Ain Sebaa ») ou la ville.
      </p>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          id={idChamp}
          type="search"
          inputMode="search"
          autoComplete="off"
          value={recherche}
          onChange={e => setRecherche(e.target.value.slice(0, 60))}
          placeholder="Quartier ou ville"
          className={CHAMP}
          aria-controls={idListe}
        />
      </div>
      <div aria-live="polite" className="mt-2">
        {lecture === 'chargement' && (
          <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Recherche…</p>
        )}
        {lecture === 'erreur' && <p className="text-sm text-red-300">{erreur}</p>}
        {lecture === 'repos' && (recherche.trim() || ville.trim()) && resultats.length === 0 && (
          <p className="text-sm text-gray-400">Aucun quartier trouvé. Essayez un autre nom, ou seulement la ville.</p>
        )}
      </div>
      {resultats.length > 0 && (
        <ul id={idListe} className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5" aria-label="Quartiers Sendit">
          {resultats.map(q => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => { onChoisir(q); setOuvert(false); setRecherche(''); }}
                className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[15px] hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none ${choisi?.id === q.id ? 'bg-white/10' : ''}`}
              >
                <span className="min-w-0 text-gray-100">
                  {q.name}
                  {q.ville && !q.name.toLowerCase().startsWith(q.ville.toLowerCase()) && <span className="text-gray-400"> ({q.ville})</span>}
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {q.delais}{estAdmin && q.price !== null ? ` · ${dh(q.price)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {choisi && (
        <button type="button" onClick={() => setOuvert(false)} className={`${BOUTON_SECONDAIRE} mt-2`}>
          Garder « {choisi.name} »
        </button>
      )}
    </div>
  );
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

type Action = 'envoyer' | 'verifier' | 'rafraichir' | 'etiquette' | 'ramassage';

export function PanneauSendit({ commande, estAdmin }: { commande: ShopOrder; estAdmin: boolean }) {
  const idTitre = useId();
  const idPlafond = useId();
  const id = commande?.id || '';
  const modeConnu = commande?.reception?.mode;
  const exclu = !!modeConnu && modeConnu !== 'domicile';

  const [etat, setEtat] = useState<EtatSendit | null>(null);
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [erreurLecture, setErreurLecture] = useState('');
  const [message, setMessage] = useState<{ ton: Ton; texte: string } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [quartier, setQuartier] = useState<QuartierPropose | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  // Au-delà du plafond d'espèces (administrateur) : ce que Sendit encaisse, et l'acompte déjà reçu.
  const [montantPartiel, setMontantPartiel] = useState('');
  const [noteAcompte, setNoteAcompte] = useState('');
  // Virement choisi, pas reçu (administrateur) : le client paiera en espèces, vu au téléphone.
  const [especesOk, setEspecesOk] = useState(false);
  // « Vérifier » a trouvé des colis au même téléphone sans notre n° : l'équipe choisit.
  const [candidats, setCandidats] = useState<{ code: string; statut: string; quartier: string | null }[] | null>(null);
  const [ramassage, setRamassage] = useState<RamassageEnAttente | null>(null);
  const [ramassageRecentLe, setRamassageRecentLe] = useState<string | null>(null);
  const [lienEtiquette, setLienEtiquette] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  // Réponse périmée (autre commande ouverte entre-temps) : ignorée.
  const idCourant = useRef(id);
  idCourant.current = id;

  const charger = useCallback(async (silencieux = false) => {
    if (!id) return;
    if (!silencieux) setLecture('chargement');
    try {
      const e = await appeler<EtatSendit>(`${ROUTE_ENVOI}?id=${encodeURIComponent(id)}`);
      if (idCourant.current !== id) return;
      setEtat(e);
      setLecture('ok');
    } catch (e) {
      if (idCourant.current !== id) return;
      setErreurLecture((e as Error).message);
      setLecture('erreur');
    }
  }, [id]);

  // Nouvelle commande ouverte : on repart de zéro.
  useEffect(() => {
    setEtat(null);
    setLecture('chargement');
    setQuartier(null);
    setConfirmer(false);
    setMontantPartiel('');
    setNoteAcompte('');
    setEspecesOk(false);
    setCandidats(null);
    setMessage(null);
    setRamassage(null);
    setRamassageRecentLe(null);
    setLienEtiquette(null);
  }, [id]);

  // Le statut change (webhook Sendit, autre appareil) : on relit sans effacer l'écran.
  useEffect(() => {
    if (!id || exclu) return;
    void charger(etat !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, exclu, commande?.status, charger]);

  // Quartier évident (ville sans quartiers) : prérempli, l'équipe peut le changer.
  useEffect(() => {
    if (!quartier && etat?.apercu.quartierSuggere) setQuartier(etat.apercu.quartierSuggere);
  }, [etat?.apercu.quartierSuggere, quartier]);

  useEffect(() => {
    if (!copie) return;
    const t = window.setTimeout(() => setCopie(false), 2500);
    return () => window.clearTimeout(t);
  }, [copie]);

  const colis = etat?.colis ?? null;
  const code = colis?.code ?? null;

  if (!id || exclu) return null;
  // Retrait ou transport : pas de colis Sendit (sauf un colis déjà créé, qu'on continue de montrer).
  if (etat && etat.mode !== 'domicile' && !code) return null;

  async function lancer(a: Action, travail: () => Promise<void>) {
    if (action) return;
    setAction(a);
    setMessage(null);
    try {
      await travail();
    } catch (e) {
      const err = e as ErreurPanneau;
      setMessage({ ton: 'erreur', texte: err.message });
      // Ce qui a pu changer côté serveur (montant, envoi resté sans réponse…) : on relit.
      if (err.statut === 409 || err.statut === 504 || err.statut === 422) void charger(true);
    } finally {
      setAction(null);
    }
  }

  const partielLu = montantPartielLu(montantPartiel, etat?.apercu.plafond ?? 0, etat?.apercu.montant ?? 0);
  // Ce que le livreur encaissera vraiment : le montant partiel au-delà du plafond, sinon le total.
  const montantEnvoye = etat?.apercu.plafondDepasse ? partielLu : etat?.apercu.montant ?? null;

  const envoyer = () => lancer('envoyer', async () => {
    if (!etat || !quartier || montantEnvoye === null) return;
    let r: EtatSendit & { code?: string; note?: boolean };
    try {
      r = await envoyerAction<EtatSendit & { code?: string; note?: boolean }>({
        id, action: 'envoyer', districtId: quartier.id, montantAttendu: montantEnvoye,
        ...(etat.apercu.plafondDepasse ? { montantPartiel: montantEnvoye, noteAcompte: noteAcompte.trim() } : {}),
        ...(etat.apercu.virementNonRecu && especesOk ? { especesConfirmees: true } : {}),
      });
    } finally {
      // Refusé ou non : on referme la confirmation, pour relire l'aperçu à jour avant un nouvel essai.
      setConfirmer(false);
    }
    if (r?.colis) setEtat(r);
    else void charger(true);
    setMessage(r?.note === false
      ? { ton: 'attention', texte: `Colis créé chez Sendit (code ${r.code}), mais pas encore noté ici : appuyez sur « Vérifier chez Sendit ».` }
      : { ton: 'ok', texte: `Colis créé chez Sendit${r?.code ? ` : code ${r.code}` : ''}. Imprimez l’étiquette, puis demandez le ramassage.` });
  });

  const verifier = (code?: string) => lancer('verifier', async () => {
    let r: EtatSendit & { trouve?: boolean; code?: string };
    try {
      r = await envoyerAction<EtatSendit & { trouve?: boolean; code?: string }>({ id, action: 'verifier', ...(code ? { code } : {}) });
    } catch (e) {
      const err = e as ErreurPanneau;
      // Des colis au même téléphone, sans notre n° : on les montre, l'équipe confirme le bon.
      if (err.statut === 409 && Array.isArray(err.corps?.candidats)) {
        setCandidats(err.corps.candidats.filter((c: any) => typeof c?.code === 'string').slice(0, 5));
        setMessage({ ton: 'attention', texte: err.message });
        return;
      }
      throw e;
    }
    setCandidats(null);
    if (r?.apercu) setEtat(r);
    setMessage(r?.trouve
      ? { ton: 'ok', texte: `Le colis existait bien chez Sendit (code ${r.code}) : il est maintenant noté.` }
      : { ton: 'info', texte: 'Aucun colis trouvé chez Sendit pour cette commande : vous pouvez l’envoyer.' });
  });

  const rafraichir = () => lancer('rafraichir', async () => {
    if (!code) { await charger(true); return; }
    const r = await envoyerAction<EtatSendit & { nouveauStatut?: string | null }>({ id, action: 'rafraichir' });
    if (r?.apercu) setEtat(r);
    setMessage({ ton: 'ok', texte: r?.nouveauStatut ? 'Statut mis à jour d’après Sendit.' : 'Rien de nouveau chez Sendit.' });
  });

  const imprimer = () => lancer('etiquette', async () => {
    if (!code) return;
    setLienEtiquette(null);
    // Ouvert tout de suite, au clic : ouvert après l'attente, le navigateur le bloquerait.
    const fenetre = window.open('', '_blank');
    if (fenetre) {
      try {
        fenetre.opener = null;
        fenetre.document.title = 'Étiquette Sendit';
        fenetre.document.body.textContent = 'Préparation de l’étiquette Sendit…';
      } catch { /* fenêtre déjà ailleurs */ }
    }
    try {
      const r = await appeler<{ url?: string }>('/api/shop/sendit/etiquette', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: [code] }),
      });
      const url = typeof r?.url === 'string' && /^https:\/\/([a-z0-9-]+\.)*sendit\.ma\//i.test(r.url) ? r.url : null;
      if (!url) throw new ErreurPanneau('Sendit n’a pas renvoyé de lien d’étiquette utilisable. Imprimez-la depuis l’application Sendit.');
      if (fenetre && !fenetre.closed) fenetre.location.href = url;
      else setLienEtiquette(url);
      setMessage({ ton: 'ok', texte: 'Étiquette A4 ouverte dans un nouvel onglet : imprimez-la et collez-la sur le colis.' });
    } catch (e) {
      try { fenetre?.close(); } catch { /* déjà fermée */ }
      throw e;
    }
  });

  const preparerRamassage = () => lancer('ramassage', async () => {
    setRamassageRecentLe(null);
    const r = await appeler<RamassageEnAttente>('/api/shop/sendit/ramassage');
    setRamassage(r);
    if (!r.colis.length) setMessage({ ton: 'info', texte: 'Aucun colis n’attend le ramassage (déjà ramassés ou déjà demandés).' });
  });

  const demanderRamassage = (forcer = false) => lancer('ramassage', async () => {
    if (!ramassage?.colis.length) return;
    try {
      const r = await appeler<{ nombre?: number; note?: boolean }>('/api/shop/sendit/ramassage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: ramassage.colis.map(c => c.code), ...(forcer ? { forcer: true } : {}) }),
      });
      setRamassage(null);
      setRamassageRecentLe(null);
      setMessage({ ton: 'ok', texte: `Ramassage demandé à Sendit pour ${r?.nombre ?? ramassage.colis.length} colis, au magasin de Derb Omar.` });
      void charger(true);
    } catch (e) {
      const err = e as ErreurPanneau;
      if (err.statut === 409 && typeof err.corps?.dejaLe === 'string') {
        setRamassageRecentLe(err.corps.dejaLe);
        return;
      }
      throw e;
    }
  });

  const occupe = action !== null;
  const tourne = (a: Action) => action === a;

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  let contenu: ReactNode;
  if (lecture === 'chargement' && !etat) {
    contenu = (
      <p className="flex items-center gap-2 text-sm text-gray-400" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lecture du colis Sendit…
      </p>
    );
  } else if (lecture === 'erreur' && !etat) {
    contenu = (
      <div className="space-y-3">
        <Bandeau ton="erreur">{erreurLecture}</Bandeau>
        <button type="button" onClick={() => void charger()} className={BOUTON_SECONDAIRE}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
        </button>
      </div>
    );
  } else if (etat?.volumineux && !code) {
    contenu = (
      <Bandeau ton="attention">
        <strong className="font-semibold">Article volumineux (rouleau entier) : jamais par Sendit.</strong>{' '}
        Appelez le client pour organiser le transport (camionnette LEBTEX ou transporteur jusqu’à son dépôt), ou le retrait à CHRIFA.
      </Bandeau>
    );
  } else if (etat && !etat.configure && !code) {
    contenu = (
      <Bandeau ton="info">
        <strong className="font-semibold">Sendit n’est pas encore branché sur le site.</strong>{' '}
        En attendant, créez le colis sur app.sendit.ma : ramassage à Derb Omar, colis ni ouvert ni essayé, étiquette A4.
        {estAdmin && (
          <span className="mt-1 block">
            Pour brancher Sendit sur le site : posez les clés SENDIT_PUBLIC_KEY et SENDIT_PRIVATE_KEY sur Vercel
            (voir l’écran Réception & paiement), puis redéployez.
          </span>
        )}
        {etat.apercu.blocages.length === 0 && !etat.apercu.plafondDepasse && !etat.apercu.virementNonRecu && (
          <> Montant à encaisser par le livreur : <strong className="font-semibold">{dh(etat.apercu.montant)}</strong>.</>
        )}
        {etat.apercu.blocages.length === 0 && etat.apercu.plafondDepasse && (
          <span className="mt-1 block">
            Plus de {dh(etat.apercu.plafond)} en espèces : jamais le total par Sendit. Voyez avec l’administrateur (virement, ou acompte noté).
          </span>
        )}
        {etat.apercu.blocages.length === 0 && etat.apercu.virementNonRecu && (
          <span className="mt-1 block">
            Virement choisi et pas encore noté reçu : pas de colis en espèces sans l’accord de l’administrateur.
          </span>
        )}
      </Bandeau>
    );
  } else if (etat && colis && !code) {
    // Envoi parti sans réponse, ou en cours sur un autre appareil.
    contenu = (
      <div className="space-y-3">
        <Bandeau ton="attention">
          {colis.sansReponse
            ? <>Le dernier envoi est resté <strong className="font-semibold">sans réponse de Sendit</strong> : le colis est peut-être créé. Vérifiez avant de renvoyer.</>
            : 'Un envoi à Sendit est en cours pour cette commande (peut-être sur un autre appareil).'}
        </Bandeau>
        <button type="button" onClick={() => verifier()} disabled={occupe || !etat.configure} className={BOUTON_PRINCIPAL}>
          {tourne('verifier') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          Vérifier chez Sendit
        </button>
        {candidats && candidats.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3.5">
            <p className="text-sm text-gray-100">
              Ouvrez l’application Sendit : si l’un de ces colis est bien celui de cette commande (même client, même contenu), rattachez-le.
              Sinon, supprimez le doublon dans Sendit ou attendez, puis vérifiez de nouveau.
            </p>
            <ul className="space-y-2">
              {candidats.map(c => (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-gray-200">
                    <span className="font-mono font-semibold text-white">{c.code}</span>
                    {` · ${c.statut}`}{c.quartier ? ` · ${c.quartier}` : ''}
                  </span>
                  <button type="button" onClick={() => verifier(c.code)} disabled={occupe} className={BOUTON_SECONDAIRE}>
                    <Check className="h-4 w-4" aria-hidden /> C’est ce colis : le rattacher
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (etat && colis && code) {
    contenu = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Code du colis</p>
            <p className="font-mono text-lg font-bold text-white">{code}</p>
          </div>
          <button
            type="button"
            onClick={async () => setCopie(await copierTexte(code))}
            className={BOUTON_SECONDAIRE}
          >
            <span aria-live="polite" className="inline-flex items-center gap-2">
              {copie ? <><Check className="h-4 w-4 text-emerald-300" aria-hidden /> Copié</> : <><ClipboardCopy className="h-4 w-4" aria-hidden /> Copier</>}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PastilleSendit colis={colis} />
          {colis.statutRetourLibelle && (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-100">
              {colis.statutRetourLibelle}
            </span>
          )}
          {colis.statutLe && <span className="text-xs text-gray-400">mis à jour {quand(colis.statutLe)}</span>}
        </div>

        {colis.alerte && (
          <Bandeau ton={colis.alerte.type === 'a_verifier' ? 'erreur' : 'attention'}>
            <strong className="font-semibold">{colis.alerte.libelle} :</strong> {colis.alerte.explication}
            {colis.message && <span className="block mt-1 text-sm">Sendit : « {colis.message} »</span>}
            {colis.nouvelleTentative && <span className="block mt-1 text-sm">Nouvelle tentative prévue : {colis.nouvelleTentative}.</span>}
            {typeof colis.tentatives === 'number' && colis.tentatives > 0 && (
              <span className="block mt-1 text-sm">Appels sans réponse : {colis.tentatives}.</span>
            )}
          </Bandeau>
        )}

        <div className="space-y-1.5">
          <Ligne libelle="Encaissé par le livreur">{dh(colis.montant)}</Ligne>
          {typeof colis.acompte === 'number' && colis.acompte > 0 && (
            <Ligne libelle="Déjà payé (acompte)">{dh(colis.acompte)}{estAdmin && colis.noteAcompte ? ` · ${colis.noteAcompte}` : ''}</Ligne>
          )}
          {estAdmin && colis.especesConfirmees && <Ligne libelle="Virement choisi">le client paie finalement en espèces (vu au téléphone)</Ligne>}
          {estAdmin && typeof colis.fee === 'number' && <Ligne libelle="Frais Sendit">{dh(colis.fee)}</Ligne>}
          {colis.quartier && <Ligne libelle="Quartier">{colis.quartier}</Ligne>}
          <Ligne libelle="Créé">{quand(colis.le)}{colis.par ? ` par ${colis.par}` : ''}</Ligne>
          <Ligne libelle="Ramassage">
            {colis.ramassage ? `demandé ${quand(colis.ramassage.le)}` : <span className="text-amber-200">pas encore demandé</span>}
          </Ligne>
          {estAdmin && colis.plafondAccepte && <Ligne libelle="Plafond d’espèces">dépassé, arrangé avec le client</Ligne>}
          {colis.photo && (
            <Ligne libelle="Photo du livreur">
              <a href={colis.photo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 underline underline-offset-2">
                Voir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Ligne>
          )}
        </div>

        {!etat.configure && (
          <Bandeau ton="attention">Les clés Sendit ne sont plus posées sur le site : imprimez et suivez ce colis dans l’application Sendit.</Bandeau>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={imprimer} disabled={occupe || !etat.configure} className={BOUTON_SECONDAIRE}>
            {tourne('etiquette') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
            Imprimer l’étiquette (A4)
          </button>
          {!colis.termine && (
            <button type="button" onClick={preparerRamassage} disabled={occupe || !etat.configure} className={BOUTON_SECONDAIRE}>
              {tourne('ramassage') && !ramassage ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackageCheck className="h-4 w-4" aria-hidden />}
              Demander le ramassage
            </button>
          )}
          <button type="button" onClick={rafraichir} disabled={occupe || !etat.configure} className={BOUTON_SECONDAIRE}>
            {tourne('rafraichir') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Rafraîchir
          </button>
        </div>

        {lienEtiquette && (
          <a href={lienEtiquette} target="_blank" rel="noopener noreferrer" className={`${BOUTON_SECONDAIRE} w-full`}>
            <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir l’étiquette (le navigateur a bloqué l’onglet)
          </a>
        )}

        {ramassage && ramassage.colis.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-3">
            <p className="text-sm text-gray-100">
              <strong className="font-semibold">{ramassage.colis.length} colis</strong> attendent le ramassage au magasin de Derb Omar :
            </p>
            <ul className="text-sm text-gray-300 space-y-0.5">
              {ramassage.colis.slice(0, 12).map(c => (
                <li key={c.code}><span className="font-mono">{c.code}</span>{c.numero ? ` · ${c.numero}` : ''}</li>
              ))}
              {ramassage.colis.length > 12 && <li className="text-gray-400">et {ramassage.colis.length - 12} autres</li>}
            </ul>
            {ramassage.dernier?.le && (
              <p className="text-xs text-gray-400">
                Dernière demande {quand(ramassage.dernier.le)} ({ramassage.dernier.nombre} colis{ramassage.dernier.par ? `, par ${ramassage.dernier.par}` : ''})
                {ramassage.dernier.sansReponse ? ' : restée sans réponse de Sendit, vérifiez dans l’application.' : '.'}
              </p>
            )}
            {ramassageRecentLe ? (
              <Bandeau ton="attention">
                Un ramassage a déjà été demandé {quand(ramassageRecentLe)}. Le redemander quand même ?
                <span className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => demanderRamassage(true)} disabled={occupe} className={BOUTON_PRINCIPAL}>
                    {tourne('ramassage') && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Redemander
                  </button>
                  <button type="button" onClick={() => { setRamassage(null); setRamassageRecentLe(null); }} className={BOUTON_SECONDAIRE}>Non</button>
                </span>
              </Bandeau>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => demanderRamassage(false)} disabled={occupe} className={BOUTON_PRINCIPAL}>
                  {tourne('ramassage') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackageCheck className="h-4 w-4" aria-hidden />}
                  Demander le ramassage ({ramassage.colis.length})
                </button>
                <button type="button" onClick={() => setRamassage(null)} disabled={occupe} className={BOUTON_SECONDAIRE}>
                  <X className="h-4 w-4" aria-hidden /> Annuler
                </button>
              </div>
            )}
          </div>
        )}

        {colis.historique.length > 0 && (
          <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white">
              <History className="h-4 w-4 text-gray-400" aria-hidden /> Trajet du colis ({colis.historique.length})
            </summary>
            <ol className="mt-1 space-y-1 border-l border-white/10 pl-3">
              {colis.historique.slice().reverse().map((h, i) => (
                <li key={`${h.le}-${i}`} className="text-sm text-gray-300">
                  <span className="text-gray-100">{h.libelle}</span>
                  <span className="text-gray-400"> · {quand(h.le)}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    );
  } else if (etat) {
    // Pas encore de colis : aperçu et envoi.
    const a = etat.apercu;
    // L'équipe ne passe ni le plafond d'espèces ni un virement pas encore vu : l'administrateur seul.
    const bloque = a.blocages.length > 0 || ((a.plafondDepasse || a.virementNonRecu) && !estAdmin);
    const partielOk = !a.plafondDepasse || (partielLu !== null && noteAcompte.trim().length > 0);
    const pret = !bloque && !!quartier && partielOk && (!a.virementNonRecu || especesOk) && montantEnvoye !== null;
    contenu = (
      <div className="space-y-4">
        {a.blocages.length > 0 && (
          <Bandeau ton="erreur">
            <strong className="font-semibold">Pas d’envoi à Sendit pour l’instant :</strong>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {a.blocages.map(b => <li key={b}>{b}</li>)}
            </ul>
          </Bandeau>
        )}
        {a.plafondDepasse && !estAdmin && a.blocages.length === 0 && (
          <Bandeau ton="erreur">
            Plus de {dh(a.plafond)} en espèces : pas de colis Sendit. Proposez le virement au client, ou demandez à l’administrateur.
          </Bandeau>
        )}
        {a.virementNonRecu && !estAdmin && a.blocages.length === 0 && (
          <Bandeau ton="erreur">
            Le client a choisi le virement et il n’est pas encore noté reçu : pas de colis Sendit (il paierait deux fois).
            Attendez que l’administrateur note le paiement, ou demandez-lui.
          </Bandeau>
        )}
        {a.avertissements.map(t => <Bandeau key={t} ton="attention">{t}</Bandeau>)}

        {!bloque && (
          <>
            <ChoixQuartier ville={a.ville} choisi={quartier} estAdmin={estAdmin} onChoisir={q => { setQuartier(q); setConfirmer(false); }} />

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-gray-300">Le livreur encaissera</span>
                <span className="text-xl font-bold tabular-nums text-white">{dh(montantEnvoye)}</span>
              </div>
              {a.plafondDepasse && <Ligne libelle="Total de la commande">{dh(a.montant)}</Ligne>}
              {a.telephone && <Ligne libelle="Téléphone du client">{telLisible(a.telephone)}</Ligne>}
              {estAdmin && quartier?.price !== null && quartier?.price !== undefined && (
                <Ligne libelle="Tarif Sendit du quartier">{dh(quartier.price)}</Ligne>
              )}
              <p className="pt-1 text-xs text-gray-400">
                Colis ni ouvert ni essayé avant paiement · ramassage au magasin de Derb Omar · étiquette A4.
              </p>
            </div>

            {a.plafondDepasse && estAdmin && (
              <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
                <p>
                  Plus de {dh(a.plafond)} en espèces : Sendit n’encaisse jamais le total. Si le client a déjà payé une partie
                  (virement vu sur le compte), indiquez ce que le livreur encaisse ({dh(a.plafond)} au plus) et ce qui a été reçu.
                  Sinon, notez « Paiement reçu » quand tout est payé.
                </p>
                <label htmlFor={idPlafond} className="block">
                  <span className="font-semibold text-gray-100">À encaisser par Sendit (DH)</span>
                  <input
                    id={idPlafond}
                    type="text"
                    inputMode="decimal"
                    value={montantPartiel}
                    onChange={e => { setMontantPartiel(e.target.value); setConfirmer(false); }}
                    placeholder={`${a.plafond} au plus`}
                    aria-invalid={!!montantPartiel.trim() && partielLu === null}
                    className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#0F0F0F] px-3 text-base text-white placeholder:text-gray-400 outline-none focus:border-[#C8102E]"
                  />
                </label>
                {!!montantPartiel.trim() && partielLu === null && (
                  <p className="text-amber-200">Entre 1 et {dh(a.plafond)}, et moins que le total ({dh(a.montant)}).</p>
                )}
                {partielLu !== null && (
                  <p>Déjà payé par le client : <strong className="font-semibold text-white">{dh(Math.round((a.montant - partielLu) * 100) / 100)}</strong>.</p>
                )}
                <label className="block">
                  <span className="font-semibold text-gray-100">Ce que le client a déjà payé (obligatoire)</span>
                  <input
                    type="text"
                    value={noteAcompte}
                    maxLength={300}
                    onChange={e => { setNoteAcompte(e.target.value); setConfirmer(false); }}
                    placeholder="ex. virement de 1 500 DH vu sur le compte le 30/09"
                    className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#0F0F0F] px-3 text-base text-white placeholder:text-gray-400 outline-none focus:border-[#C8102E]"
                  />
                </label>
              </div>
            )}

            {a.virementNonRecu && estAdmin && (
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
                <input
                  type="checkbox"
                  checked={especesOk}
                  onChange={e => { setEspecesOk(e.target.checked); setConfirmer(false); }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#C8102E]"
                />
                <span>
                  Le client paiera finalement en espèces au livreur (vu au téléphone). S’il a déjà viré, notez d’abord « Paiement reçu ».
                </span>
              </label>
            )}

            {!confirmer ? (
              <button type="button" onClick={() => setConfirmer(true)} disabled={!pret || occupe} className={`${BOUTON_PRINCIPAL} w-full sm:w-auto`}>
                <Send className="h-4 w-4" aria-hidden /> Envoyer à Sendit
              </button>
            ) : (
              <div className="rounded-xl border border-[#C8102E]/50 bg-[#C8102E]/10 p-3.5 space-y-3" role="group" aria-label="Confirmer l’envoi">
                <p className="text-[15px] text-gray-100">
                  Créer le colis chez Sendit ? Le livreur encaissera <strong className="font-semibold">{dh(montantEnvoye)}</strong>
                  {quartier ? <> à <strong className="font-semibold">{quartier.name}</strong></> : null}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={envoyer} disabled={!pret || occupe} className={BOUTON_PRINCIPAL}>
                    {tourne('envoyer') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                    Oui, créer le colis
                  </button>
                  <button type="button" onClick={() => setConfirmer(false)} disabled={occupe} className={BOUTON_SECONDAIRE}>
                    <X className="h-4 w-4" aria-hidden /> Annuler
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby={idTitre} className="rounded-2xl border border-white/10 bg-[#1A1A1A] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={idTitre} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
          <Truck className="h-4 w-4" aria-hidden /> Colis Sendit
        </h3>
        {etat && lecture !== 'chargement' && !code && (
          <button
            type="button"
            onClick={() => void charger(true)}
            disabled={occupe}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-white/5 hover:text-white"
            aria-label="Relire l’état Sendit"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {contenu}
      {message && <div className="mt-3" aria-live="polite"><Bandeau ton={message.ton}>{message.texte}</Bandeau></div>}
    </section>
  );
}
