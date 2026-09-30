'use client';

// ─── Fiche d'une commande ────────────────────────────────────────────────────
// Dans l'ordre du travail : où elle en est et le bouton de l'étape suivante,
// puis le client à joindre, la réception (colis Sendit, retrait au magasin ou
// transport d'un rouleau), ce qu'il y a dans la commande, l'argent (à encaisser,
// virement reçu ou non), les messages prêts à envoyer, les notes, l'historique
// et les documents. Un colis à domicile a son panneau Sendit (panneau-sendit.tsx) ;
// un rouleau ou un retrait, ses papiers (documents-transport.tsx).
//
// La note interne, le motif d'annulation, « qui a fait quoi » et le paiement reçu
// ne sont pas dans la commande (lisible par le client) : la fiche les lit à part
// (actions.lireInterne). Les confirmations envoyées par e-mail au client aussi
// (actions.envoyerEmailConfirmation). Les magasins et la camionnette viennent des
// réglages « Réception & paiement » (actions.lireReglagesReception).

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, Banknote, Check, ChevronDown, ClipboardCopy, FileDown, History, Loader2,
  Mail, MapPin, MessageCircle, MessagesSquare, Package, Phone, ReceiptText, RefreshCw, Send, StickyNote, Store, Truck, User, X,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ORDER_STATUS_COLORS, type LieuRetrait, type ModeReception, type OrderStatus, type ShopOrder, type TrackingNote,
} from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import {
  alerteEspeces, champsParDefaut, commandeMixte, CONSIGNE_COMMANDE_MIXTE, dateDe, dateHeure, depuisQuand, detailsVariante,
  enRetard, etapeSuivante, etatPaiementLisible, fraisColisAnnonces, LIBELLES_PAIEMENT, lienAppel, lienWhatsAppClient,
  lignesCollentAuSousTotal, lignesSansPrix, MENTION_LIGNE_ROULEAU, messageConfirmation, messageModele, messageStatut,
  modelesPour, moyenPaiementDe, msDe, nombreArticles, NOMS_LIEUX, PLAFOND_ESPECES_COLIS, PLAFOND_ESPECES_TOURNEE,
  prixCamionnette, prixUnitaireLigne, receptionDe, STATUTS_SENSIBLES, telephonesCommande, telLisible, totalDesLignes,
  totalLigne, transportPrevu, volumineuxEnColis,
  type ChampsModele, type DefinitionModele,
} from '@/lib/commandes-boutique';
import { controleFraisCommande, emailDuClient, messageControleFrais } from '@/lib/alerte-commande-boutique';
import { EMAIL_LEBTEX, statutPermetConfirmation } from '@/lib/email-confirmation-client';
import { estCasablanca, estPeripherieCasablanca, fraisLivraison, libelleFrais } from '@/lib/livraison-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type LieuDeRetrait, type ReglagesReception } from '@/lib/reglages-reception';
import type { ActionsCommandes, InfosInternes } from './actions-commandes';
import { BoiteAnnulation, BoiteStatutSensible } from './boites-confirmation';
import { BoiteEmailConfirmation, libelleEmailClient, type ResultatEnvoi } from './boite-email-confirmation';
import {
  BadgesReception, BadgeStatut, BOUTON_APPEL, BOUTON_SECONDAIRE, BOUTON_WHATSAPP, copierTexte, ImageArticle,
} from './elements';
import {
  emailAffichable, encaissement, estStatutFinal, historiqueClient, messageWhatsAppDuMoment, numerosNonReconnus,
  resumeHistorique, statutLisiblePour, texteAdresse,
} from './outils-ecran';
import { telechargerBonsLivraison } from './documents-commande';
import { DocumentsReception } from './documents-transport';
import { PanneauSendit } from './panneau-sendit';

const TOUS_LES_STATUTS: OrderStatus[] = [
  'pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];
/** On annule tant que la commande n'est ni livrée (ou retirée), ni revenue, ni déjà annulée. */
const ANNULABLE: OrderStatus[] = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery'];

/** Le lieu en texte à coller (message au client, au chauffeur) : nom, adresse, horaires, plan, téléphone. */
function texteLieu(lieu: LieuDeRetrait): string {
  return [lieu.nom, lieu.adresse, lieu.horaires, lieu.lienMaps && `Plan : ${lieu.lienMaps}`, lieu.telephone && `Tél. : ${lieu.telephone}`]
    .filter(Boolean).join('\n');
}

/** Un lien Google Maps réglé par l'administrateur : seulement en https (jamais « javascript: »). */
function lienMapsSur(v: string): string | null {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Après un changement réussi, le gros bouton reste bloqué au moins 1 s (et jusqu'à
 * ce que le nouveau statut soit revenu du serveur) : sinon un double appui, dont
 * le second arrive sur le bouton de l'étape suivante, ferait sauter une étape.
 */
const PAUSE_MIN_MS = 1000;
const PAUSE_MAX_MS = 6000;
/** La ligne « e-mail envoyé » reste mise en évidence ce temps-là après un envoi réussi. */
const EVIDENCE_ENVOI_MS = 5000;

/** Un e-mail parti chez le client, tel que la fiche l'affiche. */
interface EnvoiAffiche {
  envoyeA: string;
  le: string;
  /** Adresse de l'administrateur, 'automatique', ou '' (pas encore relu). */
  auteur: string;
  /** Accusé de réception (commande en attente) plutôt que confirmation. */
  accuse: boolean;
}

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

// ─── Messages prêts à envoyer (plan §6.4) ─────────────────────────────────────

/**
 * Récapitulatif après l'appel, commande prête, rappel, veille de tournée, départ
 * avec le transporteur : on complète deux ou trois champs, on relit, on envoie.
 */
function MessagesPrets({
  commande: o, reglages, paiementRecu, telephone, maintenant,
}: {
  commande: ShopOrder;
  reglages: ReglagesReception;
  paiementRecu: boolean;
  telephone?: string;
  maintenant: number;
}) {
  const modeles = modelesPour(o);
  const [ouvert, setOuvert] = useState<DefinitionModele['id'] | null>(null);
  const [champs, setChamps] = useState<ChampsModele>({});
  const idBase = useId();
  // Le prix de la camionnette des réglages : repris dans la veille de tournée, et dans le
  // récapitulatif d'un transport qui part en camionnette (jamais pour un transporteur).
  const prixCam = prixCamionnette(o, reglages);
  const camionnettePrevue = receptionDe(o).mode === 'transport' && transportPrevu(o) === 'camionnette';
  const ouvrir = (m: DefinitionModele) => {
    if (ouvert === m.id) { setOuvert(null); return; }
    setOuvert(m.id);
    // Pré-rempli (date de garde, demain, prix de la camionnette…) ; ce qu'on tape n'est pas écrasé tant que le message reste ouvert.
    const prix = m.id === 'veille_tournee' || (m.id === 'recapitulatif' && camionnettePrevue) ? prixCam : null;
    setChamps(champsParDefaut(m.id, maintenant, prix));
  };

  return (
    <Section titre="Messages prêts à envoyer" icone={<MessagesSquare className="h-4 w-4" />}>
      <p className="text-sm text-gray-300">Choisissez le message, complétez les champs, relisez, puis envoyez-le sur WhatsApp ou copiez-le.</p>
      <div className="mt-3 space-y-2">
        {modeles.map(m => {
          const actif = ouvert === m.id;
          const idPanneau = `${idBase}-${m.id}`;
          const texte = actif ? messageModele(m.id, o, champs, { reglages, paiementRecu }) : '';
          const lien = actif ? lienWhatsAppClient(telephone, texte) : undefined;
          return (
            <div key={m.id} className="rounded-xl border border-white/10 bg-[#141414]">
              <button
                type="button"
                aria-expanded={actif}
                aria-controls={idPanneau}
                onClick={() => ouvrir(m)}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-gray-100">{m.titre}</span>
                  <span className="block text-sm text-gray-400">{m.aide}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', actif && 'rotate-180')} aria-hidden />
              </button>
              {actif && (
                <div id={idPanneau} className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3">
                  {m.champs.map(c => (
                    <label key={c.cle} className="block">
                      <span className="text-sm font-semibold text-gray-200">{c.libelle}</span>
                      <input
                        type="text"
                        value={champs[c.cle] ?? ''}
                        onChange={e => setChamps(v => ({ ...v, [c.cle]: e.target.value }))}
                        placeholder={c.exemple}
                        maxLength={120}
                        className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#1A1A1A] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none"
                      />
                    </label>
                  ))}
                  <pre
                    tabIndex={0}
                    aria-label={`Message : ${m.titre}`}
                    dir="auto"
                    className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#1A1A1A] p-3 font-sans text-sm leading-relaxed text-gray-200 focus:border-white/30 focus:outline-none"
                  >
                    {texte}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    {lien && (
                      <a href={lien} target="_blank" rel="noopener noreferrer" className={cn(BOUTON_WHATSAPP, 'flex-1 sm:flex-none')}>
                        <MessageCircle className="h-4 w-4" aria-hidden /> Envoyer sur WhatsApp
                      </a>
                    )}
                    <BoutonCopier texte={texte} className={cn(BOUTON_SECONDAIRE, 'flex-1 sm:flex-none')}>
                      <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier
                    </BoutonCopier>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Jamais de RIB dans un message WhatsApp : le client le trouve sur la page de sa commande (le lien est dans le message, ou
        « Suivi de commande » sur lebtex.ma). LEBTEX ne change jamais de RIB par message.
      </p>
    </Section>
  );
}

// ─── Paiement ─────────────────────────────────────────────────────────────────

/**
 * Espèces, virement, carte : l'état du paiement pour tous, et le bouton « Paiement
 * reçu » pour l'administrateur seul (le serveur le dit, et refuse l'équipe) : c'est
 * lui qui voit le compte en banque. Rien ne sort sur une capture d'écran.
 */
function SectionPaiement({
  commande: o, interne, etatInterne, maintenant, actions, onEnregistre,
}: {
  commande: ShopOrder;
  interne: InfosInternes | null;
  etatInterne: 'chargement' | 'pret' | 'erreur' | 'indisponible';
  maintenant: number;
  actions: ActionsCommandes;
  onEnregistre: () => void;
}) {
  const moyen = moyenPaiementDe(o);
  const r = receptionDe(o);
  const paiement = interne?.paiement ?? null;
  const recu = paiement?.recu === true;
  const admin = interne?.peutValiderPaiement === true && !!actions.marquerPaiement;
  const [note, setNote] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);
  const idNote = useId();

  async function marquer(nouveau: boolean) {
    if (!actions.marquerPaiement || etat === 'envoi') return;
    setEtat('envoi');
    setErreur('');
    try {
      await actions.marquerPaiement(o, nouveau, nouveau ? note : undefined);
      if (!monte.current) return;
      setConfirmation(false);
      setNote('');
      setEtat('repos');
      onEnregistre();
    } catch (e) {
      if (!monte.current) return;
      setEtat('erreur');
      setErreur((e as Error)?.message || 'Pas enregistré. Réessayez.');
    }
  }

  const alerte = recu ? null : alerteEspeces(o);
  const total = Number(o.total) || 0;
  const rappels: string[] = moyen === 'virement'
    ? [
      `Motif du virement : le n° de commande ${o.orderNumber}.`,
      'Le client trouve le RIB sur la page de sa commande (lien dans les messages, ou « Suivi de commande » sur lebtex.ma) : ne l’envoyez jamais seul par WhatsApp.',
      'Rien ne sort sur une capture d’écran : l’administrateur vérifie que l’argent est arrivé sur le compte.',
    ]
    : moyen === 'carte'
      ? ['Le paiement par carte n’est pas encore branché sur le site : appelez le client pour payer en espèces ou par virement.']
      : [
        `Espèces : ${formatPrice(PLAFOND_ESPECES_COLIS)} au plus par colis Sendit, ${formatPrice(PLAFOND_ESPECES_TOURNEE)} au plus par tournée de camionnette. Au-delà : virement, ou arrangement au téléphone.`,
        ...(r.mode === 'transport' ? ['Un chauffeur inconnu (course, triporteur) n’encaisse jamais.'] : []),
        'Le client peut aussi payer par virement : proposez-le, sans l’imposer.',
      ];
  if (r.volumineux || total > PLAFOND_ESPECES_TOURNEE) {
    rappels.push('Grosse commande d’un professionnel : faites-en une vente dans /stock (facture avec ICE, crédit, chèques).');
  }

  return (
    <Section titre="Paiement" icone={<Banknote className="h-4 w-4" />}>
      <Ligne libelle="Moyen choisi" valeur={LIBELLES_PAIEMENT[moyen]} fort />
      <p className={cn('mt-2 flex items-start gap-2 text-[15px]', recu ? 'text-emerald-300' : moyen === 'cod' ? 'text-gray-200' : 'text-amber-200')} aria-live="polite">
        {recu ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Banknote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <span>
          {etatInterne === 'chargement' && !interne ? 'Vérification du paiement…' : etatPaiementLisible(o, paiement, maintenant)}
          {recu && paiement?.note ? <span className="block text-sm text-gray-300">Note : {paiement.note}</span> : null}
        </span>
      </p>
      {(etatInterne === 'erreur' || etatInterne === 'indisponible') && (
        <p className="mt-2 text-sm text-amber-200">L’état du paiement n’a pas pu être lu : ne remettez rien payé par virement avant de l’avoir vérifié.</p>
      )}

      {alerte && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {alerte}
        </p>
      )}

      {admin ? (
        <div className="mt-4 space-y-2">
          {!recu && !confirmation && (
            <button
              type="button"
              onClick={() => setConfirmation(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:w-auto"
            >
              <Check className="h-4 w-4" aria-hidden /> Paiement reçu
            </button>
          )}
          {!recu && confirmation && (
            <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-gray-100">
                Vous avez vu l’argent ({formatPrice(total)}) sur le compte ? Pas sur une capture d’écran.
              </p>
              <label htmlFor={idNote} className="block text-sm text-gray-300">Note (facultatif)</label>
              <input
                id={idNote}
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={300}
                placeholder="ex. virement CIH reçu le 30/09"
                className="h-11 w-full rounded-xl border border-white/15 bg-[#141414] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" onClick={() => setConfirmation(false)} disabled={etat === 'envoi'} className={BOUTON_SECONDAIRE}>Retour</button>
                <button
                  type="button"
                  onClick={() => void marquer(true)}
                  disabled={etat === 'envoi'}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  {etat === 'envoi' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  Oui, l’argent est sur le compte
                </button>
              </div>
            </div>
          )}
          {recu && (
            confirmation ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-200">Annuler « paiement reçu » ?</span>
                <button type="button" onClick={() => setConfirmation(false)} disabled={etat === 'envoi'} className={BOUTON_SECONDAIRE}>Non</button>
                <button type="button" onClick={() => void marquer(false)} disabled={etat === 'envoi'} className={cn(BOUTON_SECONDAIRE, 'hover:border-red-500/50 hover:text-red-300')}>
                  {etat === 'envoi' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Oui, annuler
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmation(true)} className={BOUTON_SECONDAIRE}>
                Annuler « paiement reçu »
              </button>
            )
          )}
          {etat === 'erreur' && <p role="alert" className="text-sm text-red-300">Pas enregistré : {erreur}</p>}
        </div>
      ) : etatInterne === 'pret' && moyen !== 'cod' && !recu ? (
        <p className="mt-3 text-sm text-gray-300">Seul l’administrateur note un paiement reçu, après l’avoir vu sur le compte.</p>
      ) : null}

      <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm text-gray-300">
        {rappels.map(t => <li key={t} className="flex gap-2"><span aria-hidden className="text-gray-400">•</span><span>{t}</span></li>)}
      </ul>
    </Section>
  );
}

// ─── Réception : changer le mode ou les frais après l'appel ──────────────────

const LIBELLES_MODE: Record<ModeReception, string> = {
  domicile: 'Colis Sendit à domicile',
  retrait: 'Retrait gratuit au magasin',
  transport: 'Transport (camionnette ou transporteur)',
};

/**
 * Au téléphone, le client change d'avis (retrait plutôt que colis), un rouleau finit
 * retiré à CHRIFA, une zone éloignée coûte 45 DH, le transport a un prix convenu :
 * l'équipe l'écrit ici. Le serveur recalcule le total et garde qui l'a fait ; il refuse
 * si un colis Sendit existe déjà (son montant est fixé chez Sendit).
 */
function ChangerReception({
  commande: o, reglages, actions, interne, maintenant, onEnregistre,
}: {
  commande: ShopOrder;
  reglages: ReglagesReception;
  actions: ActionsCommandes;
  interne: InfosInternes | null;
  maintenant: number;
  onEnregistre: () => void;
}) {
  const r = receptionDe(o);
  const modeActuel: ModeReception = r.mode === 'domicile' && r.volumineux ? 'transport' : r.mode;
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<ModeReception>(modeActuel);
  const [lieu, setLieu] = useState<LieuRetrait>(r.lieu);
  const [transport, setTransport] = useState<'camionnette' | 'transporteur'>(transportPrevu(o));
  const [frais, setFrais] = useState(String(Number(o.deliveryFee) || 0));
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);
  const idFrais = useId();
  const nomMode = useId();

  const villeClient = String(o.shippingAddress?.city ?? '');
  const articles = lignesCollentAuSousTotal(o) ? totalDesLignes(o) : Number(o.subtotal) || 0;
  /** Ce que la grille ou les réglages proposent pour ce mode (modifiable). */
  const fraisProposes = (m: ModeReception, t: 'camionnette' | 'transporteur'): number | null => {
    if (m === 'retrait') return 0;
    if (m === 'domicile') return fraisLivraison({ mode: 'domicile', ville: villeClient });
    return t === 'camionnette' ? prixCamionnette(o, reglages) : null;
  };
  const choisirMode = (m: ModeReception, t = transport) => {
    setMode(m);
    const f = fraisProposes(m, t);
    setFrais(f === null ? '' : String(f));
  };
  const fraisLus = frais.trim() === '' ? null : Number(frais.replace(',', '.').replace(/[\s\u00a0\u202f]/g, ''));
  const fraisValides = fraisLus !== null && Number.isFinite(fraisLus) && fraisLus >= 0 && fraisLus <= 10_000;
  const totalApres = fraisValides ? Math.round((articles + (fraisLus as number) - (Number(o.discount) || 0)) * 100) / 100 : null;
  const dernier = interne?.journalReception?.length ? interne.journalReception[interne.journalReception.length - 1] : null;

  if (!actions.modifierReception || estStatutFinal(o.status)) {
    return dernier ? (
      <p className="mt-2 text-xs text-gray-400">Réception modifiée {dateHeure(dernier.le, maintenant)} par {dernier.par}.</p>
    ) : null;
  }

  async function enregistrer() {
    if (!actions.modifierReception || etat === 'envoi' || !fraisValides) return;
    setEtat('envoi');
    setErreur('');
    try {
      await actions.modifierReception(o, {
        mode,
        frais: fraisLus as number,
        ...(mode === 'retrait' ? { lieuRetrait: lieu } : {}),
        ...(mode === 'transport' ? { preferenceTransport: transport } : {}),
      });
      if (!monte.current) return;
      setEtat('repos');
      setOuvert(false);
      onEnregistre();
    } catch (e) {
      if (!monte.current) return;
      setEtat('erreur');
      setErreur((e as Error)?.message || 'Pas enregistré. Réessayez.');
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {dernier && (
        <p className="mb-2 text-xs text-gray-400">
          Modifiée {dateHeure(dernier.le, maintenant)} par {dernier.par} : {LIBELLES_MODE[dernier.mode].toLowerCase()}
          {typeof dernier.frais === 'number' ? `, frais ${dernier.frais.toLocaleString('fr-FR')} DH` : ''}.
        </p>
      )}
      {!ouvert ? (
        <button
          type="button"
          onClick={() => {
            setOuvert(true);
            setMode(modeActuel);
            setLieu(r.lieu);
            setTransport(transportPrevu(o));
            setFrais(String(Number(o.deliveryFee) || 0));
            setEtat('repos');
          }}
          className={cn(BOUTON_SECONDAIRE, 'w-full sm:w-auto')}
        >
          Changer le mode ou les frais (après l’appel)
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 bg-[#141414] p-3">
          <fieldset>
            <legend className="text-sm font-semibold text-gray-200">Mode de réception convenu</legend>
            <div className="mt-1 space-y-1.5">
              {(['domicile', 'retrait', 'transport'] as ModeReception[]).map(m => {
                const interdit = m === 'domicile' && r.volumineux;
                return (
                  <label key={m} className={cn('flex min-h-[44px] items-center gap-3 rounded-xl border px-3 text-sm',
                    mode === m ? 'border-sky-400/60 bg-sky-400/10 text-gray-100' : 'border-white/15 text-gray-300',
                    interdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white/5')}>
                    <input type="radio" name={nomMode} checked={mode === m} disabled={interdit} onChange={() => choisirMode(m)} className="h-4 w-4 accent-sky-400" />
                    <span>{LIBELLES_MODE[m]}{interdit ? ' — jamais pour un rouleau' : ''}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {mode === 'retrait' && (
            <fieldset>
              <legend className="text-sm font-semibold text-gray-200">Magasin</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['derb_omar', 'chrifa'] as LieuRetrait[]).map(l => (
                  <label key={l} className={cn('inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm',
                    lieu === l ? 'border-sky-400/60 bg-sky-400/10 text-gray-100' : 'border-white/15 text-gray-300 hover:bg-white/5')}>
                    <input type="radio" checked={lieu === l} onChange={() => setLieu(l)} className="h-4 w-4 accent-sky-400" />
                    {reglages.lieux[l].nom}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {mode === 'transport' && (
            <fieldset>
              <legend className="text-sm font-semibold text-gray-200">Transport</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['camionnette', 'transporteur'] as const).map(t => (
                  <label key={t} className={cn('inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm',
                    transport === t ? 'border-sky-400/60 bg-sky-400/10 text-gray-100' : 'border-white/15 text-gray-300 hover:bg-white/5')}>
                    <input type="radio" checked={transport === t} onChange={() => { setTransport(t); choisirMode('transport', t); }} className="h-4 w-4 accent-sky-400" />
                    {t === 'camionnette' ? 'Camionnette LEBTEX' : 'Transporteur jusqu’à son dépôt'}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <label htmlFor={idFrais} className="text-sm font-semibold text-gray-200">
              {mode === 'retrait' ? 'Frais de retrait (DH)' : mode === 'transport' ? 'Prix du transport convenu (DH)' : 'Frais de livraison Sendit (DH)'}
            </label>
            <input
              id={idFrais}
              type="text"
              inputMode="decimal"
              value={frais}
              onChange={e => setFrais(e.target.value)}
              placeholder={mode === 'transport' ? 'prix annoncé au client' : '0'}
              aria-invalid={frais.trim() !== '' && !fraisValides}
              className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#1A1A1A] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none"
            />
            <p className="mt-1 text-sm text-gray-400">
              {mode === 'domicile' && `Grille : ${libelleFrais(fraisLivraison({ mode: 'domicile', ville: villeClient }))} (45 DH dans une zone éloignée).`}
              {mode === 'retrait' && 'Le retrait est gratuit.'}
              {mode === 'transport' && (transport === 'camionnette'
                ? `Réglages : ${prixCamionnette(o, reglages) === null ? 'hors zone de la camionnette' : `${prixCamionnette(o, reglages)} DH`}.`
                : 'Le prix donné par le transporteur, s’il est payé à LEBTEX ; 0 s’il est payé au transporteur à l’arrivée.')}
            </p>
          </div>
          <p className="text-sm text-gray-200">
            Nouveau total : <strong className="tabular-nums text-white">{totalApres === null ? '—' : formatPrice(totalApres)}</strong>
            <span className="text-gray-400"> (articles {formatPrice(articles)} + frais{Number(o.discount) ? ' − remise' : ''})</span>
          </p>
          {o.livraison?.code && (
            <p className="text-sm text-amber-200">Un colis Sendit est noté sur cette commande : le serveur refusera tant qu’il existe.</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={() => setOuvert(false)} disabled={etat === 'envoi'} className={BOUTON_SECONDAIRE}>Annuler</button>
            <button
              type="button"
              onClick={() => void enregistrer()}
              disabled={etat === 'envoi' || !fraisValides}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-bold text-white hover:bg-[#A50D26] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              {etat === 'envoi' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Enregistrer
            </button>
          </div>
          {etat === 'erreur' && <p role="alert" className="text-sm text-red-300">Pas enregistré : {erreur}</p>}
          <p className="text-xs text-gray-400">Le client voit le nouveau mode et le nouveau total sur la page de sa commande.</p>
        </div>
      )}
    </div>
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
  estAdmin = false,
}: {
  commande: ShopOrder;
  orders: ShopOrder[];
  actions: ActionsCommandes;
  maintenant: number;
  /** Téléphone / tablette : la fiche couvre l'écran et se ferme par « ← Commandes ». */
  pleinEcran: boolean;
  onFermer: () => void;
  onOuvrir: (id: string) => void;
  /**
   * Écran de l'administrateur (/admin-shop) : le panneau Sendit montre les frais que
   * Sendit facture à LEBTEX. Faux dans /staff. Le serveur revérifie de toute façon.
   */
  estAdmin?: boolean;
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

  // ─── Magasins et camionnette (réglages « Réception & paiement ») ───────────
  // Illisibles (hors ligne) : les valeurs par défaut, et on le dit dans la section Réception.
  const [reglages, setReglages] = useState<ReglagesReception>(REGLAGES_RECEPTION_DEFAUT);
  const [reglagesLus, setReglagesLus] = useState(!actions.lireReglagesReception);
  useEffect(() => {
    if (!actions.lireReglagesReception) return;
    let actif = true;
    actions.lireReglagesReception()
      .then(r => { if (actif) { setReglages(r); setReglagesLus(true); } })
      .catch(() => { /* on garde les valeurs par défaut */ });
    return () => { actif = false; };
  }, [actions]);

  const reception = receptionDe(o);
  const lieu = reglages.lieux[reception.lieu];
  const paiementRecu = interne?.paiement?.recu === true;
  const optionsMessage = { reglages, paiementRecu };

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

  // L'étape suit le mode : « Prête à retirer » pour un retrait, « Remis au chauffeur » pour un transport.
  const etape = etapeSuivante(o);
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
  const messageDuMoment = messageWhatsAppDuMoment(o, maintenant, optionsMessage);
  const historique = useMemo(() => historiqueClient(o, orders), [o, orders]);
  const [tousLesPrecedents, setTousLesPrecedents] = useState(false);

  // ─── E-mail au client (accusé de réception, puis confirmation) ─────────────
  const [boiteEmailOuverte, setBoiteEmailOuverte] = useState(false);
  /** Envoyé d'ici : affiché tout de suite, sans attendre la relecture du serveur. */
  const [envoiLocal, setEnvoiLocal] = useState<EnvoiAffiche | null>(null);
  const [envoiEnEvidence, setEnvoiEnEvidence] = useState(false);
  useEffect(() => {
    if (!envoiEnEvidence) return;
    const t = window.setTimeout(() => setEnvoiEnEvidence(false), EVIDENCE_ENVOI_MS);
    return () => window.clearTimeout(t);
  }, [envoiEnEvidence]);
  const envoyerEmail = actions.envoyerEmailConfirmation?.bind(actions);
  // Le bouton : une adresse sans surprise, une commande pas encore livrée ni annulée, et l'action disponible.
  const peutEnvoyerEmail = !!email && !!emailDuClient(o) && statutPermetConfirmation(o.status) && !!envoyerEmail;
  // Confirmations envoyées d'ici, et accusé de réception automatique envoyé à la commande.
  const emailsEnvoyes: EnvoiAffiche[] = (Array.isArray(interne?.emailsClient) ? interne!.emailsClient : [])
    .filter(e => (e?.type === 'confirmation' || e?.type === 'reception') && !Number.isNaN(Date.parse(e.le)))
    .map(e => ({ envoyeA: e.a, le: e.le, auteur: e.auteur || '', accuse: e.type === 'reception' || e.statut === 'pending' }));
  if (envoiLocal && !emailsEnvoyes.some(e => Date.parse(e.le) === Date.parse(envoiLocal.le))) {
    emailsEnvoyes.push(envoiLocal);
  }
  const dernierEnvoi = emailsEnvoyes.reduce<EnvoiAffiche | null>(
    (d, e) => (!d || Date.parse(e.le) > Date.parse(d.le) ? e : d), null,
  );
  // « Renvoyer » seulement si un e-mail du même genre est déjà parti (un accusé n'est pas une confirmation).
  const dejaEnvoyeMemeGenre = emailsEnvoyes.some(e => e.accuse === (o.status === 'pending'));
  // Tant que la trace n'est pas lue, on ne sait pas si un e-mail est déjà parti.
  const traceEmailsLue = etatInterne === 'pret';
  /** « aujourd'hui à 14:05 », « hier à 09:12 », « le 25/09/2026 à 10:00 ». */
  const quandEnvoye = (le: string) => {
    const q = dateHeure(le, maintenant);
    return /^\d/.test(q) ? `le ${q}` : q;
  };
  const texteDernierEnvoi = (d: EnvoiAffiche) => {
    const auto = d.auteur === 'automatique';
    return `${d.accuse ? 'Accusé de réception envoyé' : 'Confirmation envoyée'}${auto ? ' automatiquement' : ''} par e-mail `
      + `${quandEnvoye(d.le)}${!auto && d.auteur ? ` par ${d.auteur}` : ''}`
      + `${d.envoyeA && d.envoyeA !== email ? ` à ${d.envoyeA}` : ''}`
      + `${emailsEnvoyes.length > 1 ? ` (${emailsEnvoyes.length} e-mails envoyés)` : ''}`;
  };

  function emailEnvoye(r: ResultatEnvoi) {
    const accuse = (r.statut ?? oRef.current.status) === 'pending';
    if (!monte.current) {
      // Fiche déjà fermée : le message à l'écran est le seul moyen de le dire.
      toast({
        title: `E-mail envoyé à ${r.envoyeA}`,
        description: `${accuse ? 'Accusé de réception' : 'Confirmation'} de la commande ${oRef.current.orderNumber}.`,
        className: 'border-white/15 bg-[#1A1A1A] text-gray-100',
      });
      return;
    }
    // Fiche ouverte : la ligne verte suffit. Pas de message à l'écran, qui
    // effacerait l'avis « Nouvelle commande » (un seul message à la fois).
    setEnvoiLocal({ envoyeA: r.envoyeA, le: r.le, auteur: '', accuse });
    setEnvoiEnEvidence(true);
    setBoiteEmailOuverte(false);
    // Relit la trace notée côté serveur (qui l'a envoyé, et les envois d'autres appareils).
    void chargerInterne();
  }

  async function envoyerDepuisLaBoite({ forcer, delai }: { forcer: boolean; delai: string }): Promise<ResultatEnvoi> {
    if (!envoyerEmail) throw new Error('Envoi d’e-mails indisponible.');
    try {
      return await envoyerEmail(oRef.current, { forcer, delai });
    } catch (e) {
      // Refusé, ou peut-être parti : la trace dit si un e-mail est noté entre-temps.
      if (monte.current) void chargerInterne();
      throw e;
    }
  }

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
      // Le lieu de retrait réglé, et « rien à encaisser » si le paiement est déjà noté reçu.
      await telechargerBonsLivraison(o, { reglages, paiementsRecus: paiementRecu && o.id ? new Set([o.id]) : undefined });
      if (monte.current) setEtatPdf('repos');
    } catch (e) {
      if (!monte.current) return;
      setEtatPdf('erreur');
      setErreurPdf((e as Error)?.message || 'Le bon n’a pas pu être préparé.');
    }
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  const adresse = o.shippingAddress;
  const argent = encaissement(o.status, { commande: o, paiementRecu });
  const total = formatPrice(Number(o.total) || 0);
  const nbArticles = nombreArticles(o);
  const lienAnnonce = annonce ? lienWhatsAppClient(telephones[0], messageStatut(o, annonce, optionsMessage)) : undefined;

  // ─── Réception : frais, camionnette, contrôle du serveur ───────────────────
  const villeClient = String(adresse?.city ?? '');
  // Plus de livraison offerte depuis le 30/09/2026 ; une commande d'avant garde la règle de sa
  // date (seuil sur la somme des lignes, jamais sur le sous-total écrit par le client).
  const fraisTexte = reception.mode === 'retrait'
    ? (o.deliveryFee ? formatPrice(o.deliveryFee) : 'gratuit')
    : reception.mode === 'transport' || reception.volumineux
      ? (o.deliveryFee ? formatPrice(o.deliveryFee) : libelleFrais(null))
      : o.deliveryFee ? formatPrice(o.deliveryFee) : fraisColisAnnonces(o) === 'offerte' ? 'offerte' : 'à vérifier (0 DH saisi)';
  const libelleLigneFrais = reception.mode === 'retrait' ? 'Retrait' : reception.mode === 'transport' ? 'Transport' : 'Livraison';
  const cam = reglages.camionnette;
  const zoneCamionnette = estCasablanca(villeClient) ? 'Casablanca' : estPeripherieCasablanca(villeClient) ? 'périphérie' : null;
  // null hors zone (la ligne n'est montrée que si la camionnette est active).
  const prixCam = prixCamionnette(o, reglages);
  const prevu = transportPrevu(o);
  // Recalculé ici, à chaque lecture (même fonction pure que l'alerte) : le contrôle ne dépend
  // pas de l'appel à /alerte, que le navigateur du client peut ne jamais faire.
  const alerteFrais = messageControleFrais(controleFraisCommande(o));
  const mixte = commandeMixte(o);
  const lienMaps = lienMapsSur(lieu.lienMaps);
  const pretDepuis = o.status === 'ready_for_pickup'
    ? [...(o.trackingNotes || [])].filter(n => n.status === 'ready_for_pickup').sort((a, b) => msDe(b.timestamp) - msDe(a.timestamp))[0]
    : undefined;
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
              <BadgeStatut statut={o.status} libelle={statutLisiblePour(o, o.status)} />
            </div>
            <BadgesReception commande={o} className="mt-1.5" />
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
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-300 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
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
              <Check className="h-5 w-5" aria-hidden /> Enregistré : {statutLisiblePour(o, pause.statut)}
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
              {o.status === 'delivered' && (reception.mode === 'retrait'
                ? 'Retirée et payée : rien d’autre à faire.'
                : reception.mode === 'transport' ? 'Livrée (ou récupérée) et payée : rien d’autre à faire.' : 'Livrée et payée : rien d’autre à faire.')}
              {o.status === 'cancelled' && 'Commande annulée.'}
              {o.status === 'returned' && 'Colis revenu au dépôt.'}
            </p>
          )}

          {o.status === 'ready_for_pickup' && (
            <p className="text-sm text-gray-300">
              Prête à {NOMS_LIEUX[reception.lieu]}{pretDepuis ? ` ${depuisQuand(pretDepuis.timestamp, maintenant)}` : ''}.
              Relancer au 2e jour, appeler au 6e, annuler au 7e jour ouvré (« Non venu au retrait »).
            </p>
          )}

          {volumineuxEnColis(o) && !estStatutFinal(o.status) && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Rouleau entier commandé en colis : Sendit ne le prend pas. Au téléphone, proposez le retrait gratuit à CHRIFA ou le transport.
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
                      <span className="flex-1">{statutLisiblePour(o, s)}</span>
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
                Enregistré : {statutLisiblePour(o, annonce)}.
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
              <a href={`mailto:${email}`} className="inline-flex min-h-[44px] items-center gap-2 break-all text-sm text-gray-200 underline decoration-white/30 underline-offset-4 hover:text-white">
                <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden /> {email}
              </a>
            ) : o.customerEmail?.trim() ? (
              // Adresse bizarre : affichée, mais pas de lien (elle pourrait ajouter des destinataires cachés).
              <p className="flex items-start gap-2 break-all text-sm text-gray-300">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span>{o.customerEmail.trim()} <span className="text-xs text-gray-400">(adresse e-mail douteuse)</span></span>
              </p>
            ) : null}
            {email && (peutEnvoyerEmail || dernierEnvoi) && (
              <div className="space-y-2" aria-live="polite">
                {dernierEnvoi && (
                  <p
                    className={cn(
                      'flex items-start gap-2 rounded-lg text-sm text-emerald-300 transition-colors duration-700',
                      envoiEnEvidence && '-mx-2 bg-emerald-500/15 px-2 py-1.5 text-emerald-200',
                    )}
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{texteDernierEnvoi(dernierEnvoi)}</span>
                  </p>
                )}
                {peutEnvoyerEmail && (
                  <>
                    <button
                      type="button"
                      onClick={() => setBoiteEmailOuverte(true)}
                      // Le temps de lire la trace (souvent moins d'une seconde) : sinon « Envoyer » alors qu'un e-mail est peut-être déjà parti.
                      disabled={etatInterne === 'chargement'}
                      className={cn(BOUTON_SECONDAIRE, 'w-full sm:w-auto')}
                    >
                      {etatInterne === 'chargement' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                      {libelleEmailClient(o.status, dejaEnvoyeMemeGenre)}
                    </button>
                    {etatInterne === 'chargement' && (
                      <p className="text-sm text-gray-400">Vérification des e-mails déjà envoyés…</p>
                    )}
                    {!traceEmailsLue && etatInterne !== 'chargement' && (
                      <p className="flex items-start gap-2 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>
                          Impossible de vérifier si un e-mail est déjà parti pour cette commande. Avant d’envoyer, regardez
                          dans les « Messages envoyés » de {EMAIL_LEBTEX}.
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {o.status === 'pending' && telephones.length > 0 && (
            <div className="mt-4 space-y-2">
              <a
                href={lienWhatsAppClient(telephones[0], messageConfirmation(o, maintenant, optionsMessage))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-[15px] font-bold text-[#0B2915] hover:bg-[#1FBF5B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden /> Envoyer le message de confirmation
              </a>
              <BoutonCopier texte={messageConfirmation(o, maintenant, optionsMessage)} className={`${BOUTON_SECONDAIRE} w-full`}>
                <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier le message
              </BoutonCopier>
              <p className="text-xs text-gray-400">
                Le message reprend les articles, le total à payer et la réception (adresse, magasin ou transport). « Copier » sert à l’envoyer depuis un autre téléphone.
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
              <button type="button" onClick={() => setTousLesPrecedents(true)} className="mt-1 min-h-[44px] text-sm font-semibold text-gray-200 underline underline-offset-4">
                Voir les {historique.autres.length} commandes
              </button>
            )}
          </div>
        </Section>

        {/* 4. Réception : colis Sendit, retrait au magasin, ou transport d'un rouleau */}
        <Section
          titre={reception.mode === 'retrait'
            ? `Retrait à ${NOMS_LIEUX[reception.lieu]}`
            : reception.mode === 'transport' ? 'Transport (volumineux)'
              : volumineuxEnColis(o) ? 'Rouleau à organiser' : 'Livraison — colis Sendit'}
          icone={reception.mode === 'retrait' ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
          droite={reception.mode === 'retrait' ? (
            <BoutonCopier texte={texteLieu(lieu)} className={cn(BOUTON_SECONDAIRE, 'px-3')}>
              <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier
            </BoutonCopier>
          ) : (
            <BoutonCopier texte={texteAdresse(o)} className={cn(BOUTON_SECONDAIRE, 'px-3')}>
              <ClipboardCopy className="h-4 w-4" aria-hidden /> Copier l’adresse
            </BoutonCopier>
          )}
        >
          {alerteFrais && (
            <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {alerteFrais}
            </p>
          )}
          {mixte && !estStatutFinal(o.status) && (
            <p className="mb-3 flex items-start gap-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
              <Package className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {CONSIGNE_COMMANDE_MIXTE}
            </p>
          )}

          {reception.mode === 'retrait' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Store className="mt-1 h-4 w-4 shrink-0 text-[#E0556B]" aria-hidden />
                <div className="min-w-0 space-y-0.5 text-[15px] text-gray-200">
                  <p className="font-semibold text-gray-100">{lieu.nom}</p>
                  <p className="break-words">{lieu.adresse}</p>
                  <p className="text-gray-300">{lieu.horaires}</p>
                  {lieu.telephone && (
                    <p>
                      {lienAppel(lieu.telephone)
                        ? <a href={lienAppel(lieu.telephone)} className="underline decoration-white/30 underline-offset-4 hover:text-white">{lieu.telephone}</a>
                        : lieu.telephone}
                    </p>
                  )}
                </div>
              </div>
              {lienMaps && (
                <a href={lienMaps} target="_blank" rel="noopener noreferrer" className={cn(BOUTON_SECONDAIRE, 'w-full sm:w-auto')}>
                  <MapPin className="h-4 w-4" aria-hidden /> Ouvrir le plan (Google Maps)
                </a>
              )}
              {!lieu.actif && (
                <p className="flex items-start gap-2 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Ce magasin est désactivé dans « Réception & paiement » : vérifiez où le client peut retirer.
                </p>
              )}
              <p className="text-sm text-gray-300">
                {reception.volumineux ? 'Rouleau(x) : préparés et retirés à CHRIFA.' : 'Petits articles : préparés et retirés à Derb Omar.'}{' '}
                Gratuit. Gardée 7 jours ouvrés ; le client donne son n° de commande et son nom, paie et signe.
              </p>
              {(adresse?.address || adresse?.city) && (
                <p className="text-sm text-gray-400">
                  Adresse notée par le client : {[adresse?.address, adresse?.city].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          )}

          {reception.mode !== 'retrait' && (
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
          )}

          {reception.mode === 'transport' && (
            <div className="mt-3 space-y-3 text-sm text-gray-300">
              <p>
                <span className="text-gray-400">Préférence du client : </span>
                <strong className="text-gray-100">
                  {reception.preferenceTransport === 'camionnette' ? 'camionnette LEBTEX'
                    : reception.preferenceTransport === 'transporteur' ? 'transporteur' : 'pas précisée'}
                </strong>
                {!reception.preferenceTransport && <> · d’après la ville : <strong className="text-gray-100">{prevu === 'camionnette' ? 'camionnette' : 'transporteur'}</strong></>}
              </p>
              <div className={cn('rounded-xl border px-3 py-2', prevu === 'camionnette' ? 'border-sky-400/40 bg-sky-400/5' : 'border-white/10')}>
                <p className="font-semibold text-gray-100">Camionnette LEBTEX — Casablanca et périphérie</p>
                {cam.actif ? (
                  <p className="mt-0.5">
                    {cam.prixCasablanca} DH à Casablanca, {cam.prixPeripherie} DH en périphérie (Mohammedia, Bouskoura, Dar Bouazza, Médiouna…).
                    Tournées : {cam.jours}.{' '}
                    Pour cette commande :{' '}
                    <strong className="text-gray-100">
                      {prixCam === null ? 'hors zone de la camionnette' : `${prixCam} DH (${zoneCamionnette})`}
                    </strong>.
                    {' '}Espèces au chauffeur : {PLAFOND_ESPECES_TOURNEE.toLocaleString('fr-FR')} DH au plus par tournée.
                  </p>
                ) : (
                  <p className="mt-0.5 text-amber-200">Désactivée dans « Réception & paiement » : proposez le retrait gratuit ou un transporteur.</p>
                )}
              </div>
              <div className={cn('rounded-xl border px-3 py-2', prevu === 'transporteur' ? 'border-sky-400/40 bg-sky-400/5' : 'border-white/10')}>
                <p className="font-semibold text-gray-100">Transporteur habituel de Derb Omar — autres villes</p>
                <p className="mt-0.5">
                  Le camion livre jusqu’à <strong className="text-gray-100">son dépôt{villeClient ? ` de ${villeClient}` : ''}</strong> ;
                  le client y récupère la marchandise avec son n° de commande. Prix du transport annoncé au téléphone.
                </p>
              </div>
              <p>
                Retrait gratuit à CHRIFA toujours possible. Rien ne part avant l’accord du client sur le prix du transport ;
                notez ce qui est convenu dans la note interne.
              </p>
            </div>
          )}

          {reception.mode === 'domicile' && !reception.volumineux && (
            <p className="mt-3 text-sm text-gray-300">
              Préparée à Derb Omar, ramassée par Sendit. Colis ni ouvert ni essayé avant paiement.
            </p>
          )}

          <p className="mt-3 text-sm text-gray-300">
            Frais de {libelleLigneFrais.toLowerCase()} :{' '}
            <strong className={o.deliveryFee || reception.mode === 'transport' || fraisTexte.startsWith('à vérifier') ? 'text-gray-100' : 'text-emerald-300'}>
              {fraisTexte}
            </strong>
          </p>
          {!reglagesLus && (
            <p className="mt-2 text-xs text-gray-400">Réglages des magasins pas encore lus : adresses par défaut affichées.</p>
          )}
          <ChangerReception
            commande={o}
            reglages={reglages}
            actions={actions}
            interne={interne}
            maintenant={maintenant}
            onEnregistre={() => void chargerInterne()}
          />
        </Section>

        {/* 4 bis. Colis Sendit (colis à domicile seulement : le panneau refuse de lui-même un rouleau).
            Livrée, annulée ou retournée sans colis Sendit : plus rien à y faire, on ne l'affiche pas. */}
        {reception.mode === 'domicile' && (!estStatutFinal(o.status) || !!o.livraison?.code) && (
          <PanneauSendit commande={o} estAdmin={estAdmin} />
        )}

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
                    {item.volumineux && (
                      <span className="mt-1 inline-block rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-100">
                        {MENTION_LIGNE_ROULEAU}
                      </span>
                    )}
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
            <Ligne libelle={libelleLigneFrais} valeur={fraisTexte} />
            {!!o.discount && (
              <Ligne libelle={`Réduction${o.couponCode ? ` (${o.couponCode})` : ''}`} valeur={`− ${formatPrice(o.discount)}`} />
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-base font-semibold text-gray-100">{argent.ligne}</span>
            <span className={`text-2xl font-extrabold tabular-nums ${
              o.status === 'cancelled' || o.status === 'returned'
                ? 'text-gray-400 line-through decoration-2'
                : !argent.aEncaisser && o.status !== 'delivered' ? 'text-emerald-300' : 'text-white'
            }`}>
              {total}
              {paiementRecu && o.status !== 'cancelled' && o.status !== 'returned' && (
                <span className="ml-2 align-middle text-sm font-bold text-emerald-300">payé</span>
              )}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-300">{argent.pied}</p>
        </Section>

        {/* 6 bis. Paiement : espèces, virement reçu ou non, carte */}
        <SectionPaiement
          commande={o}
          interne={interne}
          etatInterne={etatInterne}
          maintenant={maintenant}
          actions={actions}
          onEnregistre={() => void chargerInterne()}
        />

        {/* 6 ter. Messages prêts à envoyer (après l'appel, retrait, tournée, transporteur) */}
        {!estStatutFinal(o.status) && (
          <MessagesPrets
            commande={o}
            reglages={reglages}
            paiementRecu={paiementRecu}
            telephone={telephones[0]}
            maintenant={maintenant}
          />
        )}

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
                <button type="button" onClick={() => { setEtatInterne('chargement'); void chargerInterne(); }} className={cn(BOUTON_SECONDAIRE, 'px-3')}>
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
                  <p className="text-[15px] font-semibold text-gray-100">{statutLisiblePour(o, n.status)}</p>
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
          {/* Rouleaux et retrait : devis de transport, bon de retrait, bon de remise au transporteur */}
          <DocumentsReception commande={o} reglages={reglages} paiementRecu={paiementRecu} />
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
        paiementRecu={paiementRecu}
        onFermer={() => setAConfirmer(null)}
        onConfirmer={s => { setAConfirmer(null); void changer(s); }}
      />
      {envoyerEmail && email && (
        <BoiteEmailConfirmation
          commande={o}
          emailClient={email}
          ouverte={boiteEmailOuverte}
          dejaEnvoyee={dejaEnvoyeMemeGenre}
          maintenant={maintenant}
          envoyer={envoyerDepuisLaBoite}
          reglages={reglages}
          // Après un refus ou un « peut-être parti », la fiche relit la trace des envois.
          onFermer={() => { setBoiteEmailOuverte(false); void chargerInterne(); }}
          onEnvoye={emailEnvoye}
        />
      )}
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
