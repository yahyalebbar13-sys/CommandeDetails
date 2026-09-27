'use client';

// ─── Fiche d'une commande ────────────────────────────────────────────────────
// Dans l'ordre du travail : où elle en est et le bouton de l'étape suivante,
// puis le client à joindre, l'adresse, ce qu'il y a dans le colis, l'argent à
// encaisser, les notes, l'historique et le bon de livraison.
//
// La note interne, le motif d'annulation et « qui a fait quoi » ne sont pas dans
// la commande (lisible par le client) : la fiche les lit à part (actions.lireInterne).

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, ClipboardCopy, FileDown, History, Loader2,
  Mail, MapPin, MessageCircle, Package, Phone, ReceiptText, RefreshCw, StickyNote, Truck, User, X,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_COLORS, type OrderStatus, type ShopOrder, type TrackingNote } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import {
  dateDe, dateHeure, depuisQuand, detailsVariante, enRetard, ETAPE_SUIVANTE, lienAppel,
  lienWhatsAppClient, lignesCollentAuSousTotal, lignesSansPrix, messageConfirmation, messageStatut, msDe,
  nombreArticles, prixUnitaireLigne, STATUTS_SENSIBLES, telephonesCommande, telLisible, totalLigne,
} from '@/lib/commandes-boutique';
import type { ActionsCommandes, InfosInternes } from './actions-commandes';
import { BoiteAnnulation, BoiteStatutSensible } from './boites-confirmation';
import {
  BadgeStatut, BOUTON_APPEL, BOUTON_SECONDAIRE, BOUTON_WHATSAPP, copierTexte, ImageArticle,
} from './elements';
import {
  emailAffichable, encaissement, estStatutFinal, historiqueClient, messageWhatsAppDuMoment, numerosNonReconnus,
  resumeHistorique, statutLisible, texteAdresse,
} from './outils-ecran';
import { telechargerBonsLivraison } from './documents-commande';

const TOUS_LES_STATUTS: OrderStatus[] = [
  'pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];
/** On annule tant que le colis n'est ni livré, ni revenu, ni déjà annulé. */
const ANNULABLE: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];

/**
 * Après un changement réussi, le gros bouton reste bloqué au moins 1 s (et jusqu'à
 * ce que le nouveau statut soit revenu du serveur) : sinon un double appui, dont
 * le second arrive sur le bouton de l'étape suivante, ferait sauter une étape.
 */
const PAUSE_MIN_MS = 1000;
const PAUSE_MAX_MS = 6000;

// ─── Petits morceaux ──────────────────────────────────────────────────────────

function Section({ titre, icone, children, droite }: { titre: string; icone: ReactNode; children: ReactNode; droite?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-white/10 bg-[#1A1A1A] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={id} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
          <span className="text-gray-400" aria-hidden>{icone}</span>
          {titre}
        </h3>
        {droite}
      </div>
      {children}
    </section>
  );
}

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: ReactNode; fort?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fort ? 'text-gray-100 font-semibold' : 'text-gray-300'} text-[15px]`}>
      <span>{libelle}</span>
      <span className="tabular-nums text-right">{valeur}</span>
    </div>
  );
}

/**
 * Copier, avec la réponse sur le bouton lui-même. Pas de message à l'écran :
 * il n'y en a qu'un à la fois, et il effacerait l'avis « Nouvelle commande ».
 */
function BoutonCopier({ texte, className, children }: { texte: string; className: string; children: ReactNode }) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'refus'>('repos');
  useEffect(() => {
    if (etat === 'repos') return;
    const t = window.setTimeout(() => setEtat('repos'), 2500);
    return () => window.clearTimeout(t);
  }, [etat]);
  return (
    <button type="button" onClick={async () => setEtat((await copierTexte(texte)) ? 'copie' : 'refus')} className={className}>
      <span aria-live="polite" className="inline-flex items-center gap-2">
        {etat === 'copie' && <><Check className="h-4 w-4 text-emerald-300" aria-hidden /> Copié</>}
        {etat === 'refus' && <><AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden /> Copie refusée par le navigateur</>}
        {etat === 'repos' && children}
      </span>
    </button>
  );
}

// ─── Fiche ────────────────────────────────────────────────────────────────────

export function FicheCommande({
  commande: o,
  orders,
  actions,
  maintenant,
  pleinEcran,
  onFermer,
  onOuvrir,
}: {
  commande: ShopOrder;
  orders: ShopOrder[];
  actions: ActionsCommandes;
  maintenant: number;
  /** Téléphone / tablette : la fiche couvre l'écran et se ferme par « ← Commandes ». */
  pleinEcran: boolean;
  onFermer: () => void;
  onOuvrir: (id: string) => void;
}) {
  const { toast } = useToast();
  const idTitre = useId();

  // Toujours la dernière version, pour ce qui part après coup (fermeture, réponse tardive).
  const oRef = useRef(o);
  oRef.current = o;
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  // ─── Ce que l'équipe garde pour elle (note, motif, journal) ─────────────────
  const [interne, setInterne] = useState<InfosInternes | null>(null);
  const [etatInterne, setEtatInterne] = useState<'chargement' | 'pret' | 'erreur' | 'indisponible'>(
    actions.lireInterne ? 'chargement' : 'indisponible',
  );
  const lecture = useRef(0);

  const chargerInterne = useCallback(async () => {
    if (!actions.lireInterne) return;
    const numero = ++lecture.current;
    try {
      const infos = await actions.lireInterne(oRef.current);
      if (!monte.current || numero !== lecture.current) return;
      setInterne(infos);
      setEtatInterne('pret');
    } catch {
      if (!monte.current || numero !== lecture.current) return;
      // Déjà lue une fois : on garde ce qu'on a plutôt que de tout masquer.
      setEtatInterne(e => (e === 'pret' ? 'pret' : 'erreur'));
    }
  }, [actions]);

  // À l'ouverture, quand le statut change (journal, motif), et au retour sur l'onglet (autre appareil).
  useEffect(() => { void chargerInterne(); }, [chargerInterne, o.id, o.status]);
  useEffect(() => {
    const auRetour = () => { if (document.visibilityState === 'visible') void chargerInterne(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [chargerInterne]);

  // ─── Statut ─────────────────────────────────────────────────────────────────
  const [enCours, setEnCours] = useState<OrderStatus | null>(null);
  const [erreurStatut, setErreurStatut] = useState<{ message: string; incertain: boolean } | null>(null);
  /** Dernier statut posé ici : on propose d'en prévenir le client. */
  const [annonce, setAnnonce] = useState<OrderStatus | null>(null);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [aConfirmer, setAConfirmer] = useState<OrderStatus | null>(null);
  const [pause, setPause] = useState<{ statut: OrderStatus; le: number } | null>(null);
  const verrou = useRef(false);

  useEffect(() => {
    if (!pause) return;
    const ecoule = Date.now() - pause.le;
    const reste = (o.status === pause.statut ? PAUSE_MIN_MS : PAUSE_MAX_MS) - ecoule;
    const t = window.setTimeout(() => setPause(null), Math.max(0, reste));
    return () => window.clearTimeout(t);
  }, [pause, o.status]);

  const etape = ETAPE_SUIVANTE[o.status];
  const occupe = enCours !== null || pause !== null;
  const retard = enRetard(o, maintenant);
  const sansPrix = lignesSansPrix(o);

  async function changer(statut: OrderStatus, motif?: string) {
    if (verrou.current || occupe || statut === o.status) return;
    verrou.current = true;
    setEnCours(statut);
    setErreurStatut(null);
    setAnnonce(null);
    try {
      await actions.changerStatut(o, statut, motif ? { motif } : undefined);
      // La fiche le dit (encart vert) : pas de message à l'écran, qui effacerait
      // l'avis « Nouvelle commande » (un seul message à la fois).
      setAnnonce(statut);
      setPause({ statut, le: Date.now() });
    } catch (e) {
      const err = e as Error & { peutEtreFait?: boolean };
      setErreurStatut({ message: err?.message || 'Enregistrement impossible. Réessayez.', incertain: !!err?.peutEtreFait });
    } finally {
      verrou.current = false;
      setEnCours(null);
    }
  }

  /** Annulée, livrée, retournée — ou sortir de l'un d'eux (rouvrir) : on demande d'abord. */
  function demander(statut: OrderStatus) {
    if (verrou.current || occupe || statut === o.status) return;
    if (statut === 'cancelled') setAnnulationOuverte(true);
    else if (STATUTS_SENSIBLES.includes(statut) || estStatutFinal(o.status)) setAConfirmer(statut);
    else void changer(statut);
  }

  // ─── Client ─────────────────────────────────────────────────────────────────
  const telephones = telephonesCommande(o);
  const illisibles = numerosNonReconnus(o);
  const email = emailAffichable(o.customerEmail);
  const nom = o.customerName || o.shippingAddress?.fullName || 'Client sans nom';
  const messageDuMoment = messageWhatsAppDuMoment(o, maintenant);
  const historique = useMemo(() => historiqueClient(o, orders), [o, orders]);
  const [tousLesPrecedents, setTousLesPrecedents] = useState(false);

  // ─── Note interne ───────────────────────────────────────────────────────────
  const noteServeur = interne?.noteInterne ?? '';
  const [note, setNote] = useState('');
  const [noteTouchee, setNoteTouchee] = useState(false);
  const [etatNote, setEtatNote] = useState<'repos' | 'enregistrement' | 'enregistree' | 'erreur'>('repos');
  const [erreurNote, setErreurNote] = useState('');
  const noteLue = etatInterne === 'pret';
  // Arrivée ou modifiée sur un autre appareil, et rien tapé ici : on suit.
  useEffect(() => { if (noteLue && !noteTouchee) setNote(noteServeur); }, [noteLue, noteServeur, noteTouchee]);
  const noteModifiee = noteLue && note.trim() !== noteServeur.trim();

  const noteRef = useRef({ note, modifiee: noteModifiee, enregistrement: etatNote === 'enregistrement' });
  noteRef.current = { note, modifiee: noteModifiee, enregistrement: etatNote === 'enregistrement' };

  const signalerNoteNonEnregistree = useCallback((message: string) => {
    toast({ variant: 'destructive', title: `Note interne non enregistrée (${oRef.current.orderNumber})`, description: message });
  }, [toast]);

  async function enregistrerNote() {
    if (etatNote === 'enregistrement' || !noteModifiee) return;
    // Ce qui part : si l'on continue à taper pendant l'envoi, la suite n'est pas écrasée.
    const envoye = note.trim();
    setEtatNote('enregistrement');
    setErreurNote('');
    try {
      await actions.enregistrerNote(o, envoye);
      if (!monte.current) return;
      setInterne(i => (i ? { ...i, noteInterne: envoye } : i));
      setEtatNote('enregistree');
      if (noteRef.current.note.trim() === envoye) setNoteTouchee(false);
    } catch (e) {
      const message = (e as Error)?.message || 'Note non enregistrée.';
      // Fiche déjà fermée : le message à l'écran est le seul moyen de le dire.
      if (!monte.current) { signalerNoteNonEnregistree(message); return; }
      setEtatNote('erreur');
      setErreurNote(message);
    }
  }

  // Fiche fermée (retour, croix, autre commande) avec une note pas encore partie : on l'envoie.
  useEffect(() => () => {
    const n = noteRef.current;
    if (!n.modifiee || n.enregistrement) return;
    actions.enregistrerNote(oRef.current, n.note.trim())
      .catch(e => signalerNoteNonEnregistree((e as Error)?.message || 'Réessayez depuis la fiche.'));
  }, [actions, signalerNoteNonEnregistree]);

  // Rechargement ou fermeture de l'onglet : le navigateur demande confirmation.
  const noteEnJeu = noteModifiee || etatNote === 'enregistrement';
  useEffect(() => {
    if (!noteEnJeu) return;
    const avantDePartir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avantDePartir);
    return () => window.removeEventListener('beforeunload', avantDePartir);
  }, [noteEnJeu]);

  // ─── Bon de livraison ───────────────────────────────────────────────────────
  const [etatPdf, setEtatPdf] = useState<'repos' | 'preparation' | 'erreur'>('repos');
  const [erreurPdf, setErreurPdf] = useState('');

  async function bonDeLivraison() {
    if (etatPdf === 'preparation') return;
    setEtatPdf('preparation');
    setErreurPdf('');
    try {
      await telechargerBonsLivraison(o);
      if (monte.current) setEtatPdf('repos');
    } catch (e) {
      if (!monte.current) return;
      setEtatPdf('erreur');
      setErreurPdf((e as Error)?.message || 'Le bon n’a pas pu être préparé.');
    }
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  const adresse = o.shippingAddress;
  const argent = encaissement(o.status);
  const total = formatPrice(Number(o.total) || 0);
  const nbArticles = nombreArticles(o);
  const lienAnnonce = annonce ? lienWhatsAppClient(telephones[0], messageStatut(o, annonce)) : undefined;
  const precedentsAffiches = tousLesPrecedents ? historique.autres : historique.autres.slice(0, 5);
  const notes = [...(o.trackingNotes || [])].sort((a, b) => msDe(a.timestamp) - msDe(b.timestamp));

  // « par … » : seulement d'après le journal de l'équipe (la commande, elle, peut
  // avoir été écrite par le client). Même instant et même statut que la ligne du suivi.
  const journal = interne?.journal ?? [];
  const auteurDe = (n: TrackingNote): string | null => {
    const ms = dateDe(n.timestamp)?.getTime();
    if (ms === undefined) return null;
    return journal.find(e => e.statut === n.status && Date.parse(e.le) === ms)?.auteur || null;
  };

  return (
    <article className="pb-10" aria-labelledby={idTitre}>
      {/* 1. En-tête : reste en haut pendant l'appel (nom, total à annoncer) */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#141414]/95 backdrop-blur px-4 py-3 sm:px-5">
        {pleinEcran && (
          <button
            type="button"
            onClick={onFermer}
            className="-ml-2 mb-2 inline-flex h-11 items-center gap-2 rounded-xl px-2 text-[15px] font-semibold text-gray-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden /> Commandes
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={idTitre} className="font-mono text-lg font-bold text-gray-100">{o.orderNumber}</h2>
              <BadgeStatut statut={o.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 max-w-full truncate text-[15px] font-semibold text-gray-100">{nom}</span>
              <span className="text-[15px] font-extrabold tabular-nums text-white">{total}</span>
              <span className="text-sm text-gray-400">
                {argent.aEncaisser ? 'à encaisser' : argent.titre.toLowerCase()} · {nbArticles} article{nbArticles > 1 ? 's' : ''}
              </span>
            </p>
            <p className={`mt-0.5 text-sm ${retard ? 'font-semibold text-red-400' : 'text-gray-300'}`}>
              reçue {dateHeure(o.createdAt, maintenant)} · {depuisQuand(o.createdAt, maintenant)}
              {retard && ' · en retard (appel promis sous 2 h)'}
            </p>
          </div>
          {!pleinEcran && (
            <button
              type="button"
              onClick={onFermer}
              aria-label="Fermer la fiche"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-300 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 sm:px-5">
        {/* 2. Action principale */}
        <section aria-label="Statut de la commande" className="space-y-3 rounded-2xl border border-white/10 bg-[#1A1A1A] p-4 sm:p-5">
          {pause ? (
            <p role="status" className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-base font-bold text-emerald-200">
              <Check className="h-5 w-5" aria-hidden /> Enregistré : {statutLisible(pause.statut)}
            </p>
          ) : etape ? (
            <button
              type="button"
              onClick={() => demander(etape.statut)}
              disabled={occupe}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-base font-bold text-white shadow-lg shadow-[#C8102E]/20 hover:bg-[#A50D26] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              {enCours === etape.statut
                ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Enregistrement…</>
                : <><Check className="h-5 w-5" aria-hidden /> {etape.libelle}</>}
            </button>
          ) : (
            <p className="text-[15px] text-gray-200">
              {o.status === 'delivered' && 'Livrée et payée : rien d’autre à faire.'}
              {o.status === 'cancelled' && 'Commande annulée.'}
              {o.status === 'returned' && 'Colis revenu au dépôt.'}
            </p>
          )}

          {o.status === 'pending' && sansPrix.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {sansPrix.length === 1 ? '1 article est arrivé sans prix' : `${sansPrix.length} articles sont arrivés sans prix`} :
              convenez du prix avec le client avant de confirmer.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {ANNULABLE.includes(o.status) && (
              <button
                type="button"
                onClick={() => demander('cancelled')}
                disabled={occupe}
                className={`${BOUTON_SECONDAIRE} flex-1 sm:flex-none hover:border-red-500/50 hover:text-red-300`}
              >
                {enCours === 'cancelled' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4 text-red-400" aria-hidden />}
                Annuler la commande
              </button>
            )}
            {/* modal={false} : sinon la boîte de confirmation ouverte depuis le menu laisse la page inerte (Radix). */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild disabled={occupe}>
                <button type="button" className={`${BOUTON_SECONDAIRE} flex-1 sm:flex-none`}>
                  {enCours && enCours !== etape?.statut && enCours !== 'cancelled'
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    : null}
                  Autre statut… <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="z-[80] min-w-[240px] rounded-xl border-white/10 bg-[#1A1A1A] p-1.5 text-gray-100 shadow-2xl"
              >
                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Passer la commande à…
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                {TOUS_LES_STATUTS.map(s => {
                  const actuel = s === o.status;
                  const avecConfirmation = STATUTS_SENSIBLES.includes(s) || estStatutFinal(o.status);
                  return (
                    <DropdownMenuItem
                      key={s}
                      disabled={actuel}
                      onSelect={() => demander(s)}
                      className="min-h-[44px] cursor-pointer rounded-lg px-3 text-[15px] text-gray-100 focus:bg-white/10 focus:text-white data-[disabled]:opacity-60"
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ORDER_STATUS_COLORS[s] }} />
                      <span className="flex-1">{statutLisible(s)}</span>
                      {actuel && <span className="text-xs text-gray-400">actuel</span>}
                      {!actuel && avecConfirmation && <span className="text-xs text-gray-400">avec confirmation</span>}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {erreurStatut && (
            erreurStatut.incertain ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span><strong className="font-semibold">À vérifier.</strong> {erreurStatut.message}</span>
              </p>
            ) : (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span><strong className="font-semibold text-red-100">Pas enregistré.</strong> {erreurStatut.message}</span>
              </p>
            )
          )}

          {annonce && !pause && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="flex-1 text-sm text-emerald-200">
                <Check className="mr-1 inline h-4 w-4" aria-hidden />
                Enregistré : {statutLisible(annonce)}.
              </p>
              {lienAnnonce && (
                <a href={lienAnnonce} target="_blank" rel="noopener noreferrer" className={BOUTON_WHATSAPP}>
                  <MessageCircle className="h-4 w-4" aria-hidden /> Prévenir le client sur WhatsApp
                </a>
              )}
            </div>
          )}
        </section>

        {/* 3. Client */}
        <Section titre="Client" icone={<User className="h-4 w-4" />}>
          <p className="text-base font-bold text-gray-100">{nom}</p>
          <div className="mt-3 space-y-3">
            {telephones.length === 0 && illisibles.length === 0 && (
              <p className="text-sm text-amber-200">Aucun numéro de téléphone enregistré sur cette commande.</p>
            )}
            {telephones.map((t, i) => {
              const appel = lienAppel(t);
              const whatsapp = lienWhatsAppClient(t, messageDuMoment);
              return (
                <div key={t} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-400">{i === 0 ? 'Téléphone' : '2e numéro'}</p>
                    <p className="text-lg font-semibold tabular-nums tracking-wide text-gray-100">{telLisible(t)}</p>
                  </div>
                  <div className="flex gap-2">
                    {appel && (
                      <a href={appel} className={BOUTON_APPEL} aria-label={`Appeler le ${telLisible(t)}`}>
                        <Phone className="h-4 w-4" aria-hidden /> Appeler
                      </a>
                    )}
                    {whatsapp && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={BOUTON_WHATSAPP} aria-label={`WhatsApp au ${telLisible(t)}`}>
                        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Noté par le client mais sans chiffre reconnu : montré tel quel, sans bouton. */}
            {illisibles.map(t => (
              <div key={`illisible-${t}`}>
                <p className="text-xs text-gray-400">Numéro noté par le client (format non reconnu)</p>
                <p className="break-all text-base text-gray-100" dir="auto">{t}</p>
              </div>
            ))}
            {email ? (
              <a href={`mailto:${email}`} className="inline-flex min-h-[40px] items-center gap-2 break-all text-sm text-gray-200 underline decoration-white/30 underline-offset-4 hover:text-white">
                <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden /> {email}
              </a>
            ) : o.customerEmail?.trim() ? (
              // Adresse bizarre : affichée, mais pas de lien (elle pourrait ajouter des destinataires cachés).
              <p className="flex items-start gap-2 break-all text-sm text-gray-300">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span>{o.customerEmail.trim()} <span className="text-xs text-gray-400">(adresse e-mail douteuse)</span></span>
              </p>
            ) : null}
          </div>

          {o.status === 'pending' && telephones.length > 0 && (
            <div className="mt-4 space-y-2">
              <a
                href={lienWhatsAppClient(telephones[0], messageConfirmation(o, maintenant))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-[15px] font-bold text-[#0B2915] hover:bg-[#1FBF5B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden /> Envoyer le message de confirmation
              </a>
              <BoutonCopier texte={messageConfirmation(o, maintenant)} className={`${BOUTON_SECONDAIRE} w-full`}>
                <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier le message
              </BoutonCopier>
              <p className="text-xs text-gray-400">
                Le message reprend les articles, le total à payer et l’adresse. « Copier » sert à l’envoyer depuis un autre téléphone.
              </p>
            </div>
          )}

          {/* Historique du client */}
          <div className="mt-4 rounded-xl border border-white/10 bg-[#141414] p-3">
            <p className="text-sm font-semibold text-gray-200">Historique du client</p>
            <p className={`mt-0.5 text-sm ${historique.annulees + historique.retournees > 0 ? 'text-amber-200' : 'text-gray-300'}`}>
              {resumeHistorique(historique)}
            </p>
            {precedentsAffiches.length > 0 && (
              <ul className="mt-2 divide-y divide-white/5">
                {precedentsAffiches.map(x => (
                  <li key={x.id}>
                    {/* Statut sous le n° : sur 360-375 px, le badge à côté écrasait le n° et la date. */}
                    <button
                      type="button"
                      onClick={() => x.id && onOuvrir(x.id)}
                      className="flex min-h-[44px] w-full items-start gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-all font-mono text-sm text-gray-200">{x.orderNumber}</span>
                        <span className="block text-xs text-gray-400">{dateHeure(x.createdAt, maintenant)}</span>
                        <span className="mt-1 block"><BadgeStatut statut={x.status} /></span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-gray-100">
                        {formatPrice(Number(x.total) || 0)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {historique.autres.length > 5 && !tousLesPrecedents && (
              <button type="button" onClick={() => setTousLesPrecedents(true)} className="mt-1 min-h-[40px] text-sm font-semibold text-gray-200 underline underline-offset-4">
                Voir les {historique.autres.length} commandes
              </button>
            )}
          </div>
        </Section>

        {/* 4. Livraison */}
        <Section
          titre="Livraison"
          icone={<Truck className="h-4 w-4" />}
          droite={
            <BoutonCopier texte={texteAdresse(o)} className={cn(BOUTON_SECONDAIRE, 'h-10 px-3')}>
              <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier l’adresse
            </BoutonCopier>
          }
        >
          <div className="flex items-start gap-2">
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#E0556B]" aria-hidden />
            <div className="space-y-0.5 text-[15px] text-gray-200">
              <p className="font-semibold text-gray-100">{adresse?.fullName || nom}</p>
              {adresse?.address && <p className="whitespace-pre-line break-words">{adresse.address}</p>}
              <p>
                {[adresse?.city, adresse?.region].filter(Boolean).join(', ') || 'Ville non renseignée'}
                {adresse?.postalCode ? ` ${adresse.postalCode}` : ''}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-300">
            Frais de livraison : {o.deliveryFee ? <strong className="text-gray-100">{formatPrice(o.deliveryFee)}</strong> : <strong className="text-emerald-300">gratuite</strong>}
          </p>
        </Section>

        {/* 5. Articles */}
        <Section titre={`Articles (${nbArticles})`} icone={<Package className="h-4 w-4" />}>
          <ul className="divide-y divide-white/5">
            {(o.items || []).map((item, i) => {
              const details = detailsVariante(item.variant);
              const prix = prixUnitaireLigne(item);
              return (
                <li key={`${item.productId}-${i}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <ImageArticle src={item.productImage} alt={item.productName} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold text-gray-100">{item.productName}</p>
                    {details.length > 0 && (
                      <p className="mt-0.5 text-sm text-gray-300">
                        {details.map((d, j) => (
                          <span key={d.libelle}>
                            {j > 0 && ' · '}
                            <span className="text-gray-400">{d.libelle} :</span> {d.valeur}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="mt-1 text-sm tabular-nums text-gray-300">
                      {prix > 0 ? (
                        <>{item.quantity} × {formatPrice(prix)} = <strong className="text-gray-100">{formatPrice(totalLigne(item))}</strong></>
                      ) : (
                        <>
                          {item.quantity} ×{' '}
                          <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">Prix à fixer</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {!lignesCollentAuSousTotal(o) && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Commande passée avant la mise à jour du site : le prix de gros s’est appliqué, le sous-total fait foi.
            </p>
          )}
        </Section>

        {/* 6. Récapitulatif : à encaisser, encaissé, ou rien à encaisser selon le statut */}
        <Section titre={argent.titre} icone={<ReceiptText className="h-4 w-4" />}>
          <div className="space-y-1.5">
            <Ligne libelle="Sous-total" valeur={formatPrice(Number(o.subtotal) || 0)} />
            <Ligne libelle="Livraison" valeur={o.deliveryFee ? formatPrice(o.deliveryFee) : 'gratuite'} />
            {!!o.discount && (
              <Ligne libelle={`Réduction${o.couponCode ? ` (${o.couponCode})` : ''}`} valeur={`− ${formatPrice(o.discount)}`} />
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-base font-semibold text-gray-100">{argent.ligne}</span>
            <span className={`text-2xl font-extrabold tabular-nums ${argent.aEncaisser || o.status === 'delivered' ? 'text-white' : 'text-gray-400 line-through decoration-2'}`}>
              {total}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-300">{argent.pied}</p>
        </Section>

        {/* 7. Note du client */}
        {o.notes?.trim() && (
          <section aria-label="Note du client" className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200">
              <StickyNote className="h-4 w-4" aria-hidden /> Note du client
            </h3>
            <p className="mt-2 whitespace-pre-line break-words text-[15px] text-amber-50">{o.notes}</p>
          </section>
        )}

        {/* 8. Note interne (gardée hors de la commande : le client ne peut pas la lire) */}
        <Section titre="Note interne" icone={<StickyNote className="h-4 w-4" />}>
          <label className="block">
            <span className="text-sm text-gray-300">Pour l’équipe seulement : le client ne la voit pas. Enregistrée quand vous quittez le champ.</span>
            <textarea
              value={note}
              disabled={!noteLue}
              onChange={e => { setNote(e.target.value); setNoteTouchee(true); if (etatNote !== 'enregistrement') setEtatNote('repos'); }}
              onBlur={() => { if (noteModifiee) void enregistrerNote(); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enregistrerNote(); } }}
              rows={3}
              maxLength={2000}
              placeholder={
                etatInterne === 'chargement' ? 'Chargement de la note…'
                  : noteLue ? 'Ex. : rappeler après 18 h, livrer au magasin du frère…'
                    : 'Note indisponible pour le moment'
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#141414] px-3 py-2.5 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/30 focus:outline-none disabled:opacity-60 sm:text-[15px]"
            />
          </label>
          {etatInterne === 'erreur' || etatInterne === 'indisponible' ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-amber-200">
                La note de l’équipe n’a pas pu être lue (connexion ?). Rien n’est perdu : elle s’affichera au prochain essai.
              </p>
              {etatInterne === 'erreur' && (
                <button type="button" onClick={() => { setEtatInterne('chargement'); void chargerInterne(); }} className={cn(BOUTON_SECONDAIRE, 'h-10 px-3')}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void enregistrerNote()}
                disabled={!noteModifiee || etatNote === 'enregistrement'}
                className={BOUTON_SECONDAIRE}
              >
                {etatNote === 'enregistrement' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Enregistrer
              </button>
              <span className="text-sm" aria-live="polite">
                {etatNote === 'enregistree' && !noteModifiee && <span className="text-emerald-300">Note enregistrée.</span>}
                {etatNote === 'erreur' && <span className="text-red-300">Pas enregistrée : {erreurNote}</span>}
                {etatNote !== 'erreur' && etatNote !== 'enregistrement' && noteModifiee && (
                  <span className="text-amber-200">Modifications pas encore enregistrées.</span>
                )}
              </span>
            </div>
          )}
        </Section>

        {/* 9. Historique */}
        <Section titre="Historique" icone={<History className="h-4 w-4" />}>
          <ol className="relative space-y-3 border-l border-white/10 pl-5">
            <li className="relative">
              <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#1A1A1A]" style={{ background: ORDER_STATUS_COLORS.pending }} />
              <p className="text-[15px] font-semibold text-gray-100">Commande reçue</p>
              <p className="text-sm text-gray-300">{dateHeure(o.createdAt, maintenant)} · sur lebtex.ma</p>
            </li>
            {notes.map((n, i) => {
              const auteur = auteurDe(n);
              return (
                <li key={i} className="relative">
                  <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#1A1A1A]" style={{ background: ORDER_STATUS_COLORS[n.status] || '#6B7280' }} />
                  <p className="text-[15px] font-semibold text-gray-100">{statutLisible(n.status)}</p>
                  <p className="text-sm text-gray-300">
                    {dateHeure(n.timestamp, maintenant)}
                    {auteur ? ` · par ${auteur}` : ''}
                  </p>
                  {n.message && <p className="text-sm text-gray-400">Vu par le client : « {n.message} »</p>}
                </li>
              );
            })}
          </ol>
          {o.status === 'cancelled' && interne?.motifAnnulation && (
            <p className="mt-3 rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-sm text-gray-200">
              <span className="font-semibold">Motif d’annulation</span> (le client ne le voit pas) : {interne.motifAnnulation}
            </p>
          )}
        </Section>

        {/* 10. Documents */}
        <Section titre="Documents" icone={<FileDown className="h-4 w-4" />}>
          <button type="button" onClick={() => void bonDeLivraison()} disabled={etatPdf === 'preparation'} className={BOUTON_SECONDAIRE}>
            {etatPdf === 'preparation'
              ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Préparation…</>
              : <><FileDown className="h-4 w-4" aria-hidden /> Bon de livraison (PDF)</>}
          </button>
          {etatPdf === 'erreur' && (
            <p role="alert" className="mt-2 text-sm text-red-300">Bon non préparé : {erreurPdf}</p>
          )}
        </Section>
      </div>

      <BoiteAnnulation
        commande={o}
        ouverte={annulationOuverte}
        onFermer={() => setAnnulationOuverte(false)}
        onConfirmer={motif => { setAnnulationOuverte(false); void changer('cancelled', motif); }}
      />
      <BoiteStatutSensible
        commande={o}
        statut={aConfirmer}
        onFermer={() => setAConfirmer(null)}
        onConfirmer={s => { setAConfirmer(null); void changer(s); }}
      />
    </article>
  );
}

/** Pendant le chargement, quand la fiche demandée (lien de l'e-mail) n'est pas encore arrivée. */
export function FicheEnAttente({ onFermer, pleinEcran }: { onFermer: () => void; pleinEcran: boolean }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#C8102E]" aria-hidden />
      <p className="text-[15px] text-gray-200" role="status">Ouverture de la commande…</p>
      {pleinEcran && (
        <button type="button" onClick={onFermer} className={BOUTON_SECONDAIRE}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux commandes
        </button>
      )}
    </div>
  );
}

/** Lien vers une commande qui n'existe pas (ou plus). */
export function FicheIntrouvable({ message, onFermer, pleinEcran }: { message: string; onFermer: () => void; pleinEcran: boolean }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-300" aria-hidden />
      <p className="max-w-sm text-[15px] text-gray-200">{message}</p>
      <button type="button" onClick={onFermer} className={BOUTON_SECONDAIRE}>
        {pleinEcran ? <><ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux commandes</> : 'Fermer'}
      </button>
    </div>
  );
}
