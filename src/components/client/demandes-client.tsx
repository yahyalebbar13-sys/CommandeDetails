"use client";

// ─── Demandes du client à LEBTEX ──────────────────────────────────────────────
// Le formulaire (recommander, livraison / retrait, question) et la liste
// « Mes demandes ». Les règles de saisie reprennent celles du serveur
// (validerDemande, lib/demandes-client.ts) : le client voit tout de suite ce
// qui manque, au lieu d'un refus après l'envoi. Le serveur reste seul juge.
// Tout est dit au client, dans ses mots : jamais un statut interne, jamais une
// unité abrégée (« 500 mètres », pas « 500 m »).

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Loader2,
  MessageCircle,
  MessageCircleQuestion,
  MessageSquareReply,
  Package,
  PackageCheck,
  RotateCcw,
  Send,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { CommandeClient } from '@/lib/portail-client-donnees';
import {
  LIBELLE_DEMANDE,
  LIBELLE_STATUT_DEMANDE,
  type DemandeEnregistree,
  type DemandeSaisie,
  type StatutDemande,
  type TypeDemande,
} from '@/lib/demandes-client';
import { ETAPES_CLIENT, dateFr, etapeClient, nombreFr, rangEtape, type EtapeClient } from '@/lib/statut-client';
import { libelleUnite, uniteDecimale } from '@/lib/unites-pole';
import { ADRESSE_ENTREPOT, RETRAIT } from './portail-outils';

// ─── Petits outils ────────────────────────────────────────────────────────────

/** Mêmes plafonds que le serveur (validerDemande). */
const MAX_MESSAGE = 1000;
const MAX_QUANTITE = 1e7;

/** Unités au singulier / au pluriel, comme on les dit à un client (cf. l'espace client). */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'], 'rolls': ['rouleau', 'rouleaux'], 'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'], 'bag': ['sac', 'sacs'], 'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};

/** Le mot de l'unité, accordé à la quantité : « mètre », « rouleaux », « pièces ». */
function motUnite(unite: string | undefined, n: number): string {
  const u = (unite || '').trim();
  const dites = UNITES_DITES[u] || (!u || ['u', 'unité', 'pcs', 'pièces', 'pièce'].includes(u.toLowerCase())
    ? ['pièce', 'pièces']
    : [libelleUnite(u).toLowerCase(), libelleUnite(u).toLowerCase()]);
  return Math.abs(n) > 1 ? dites[1] : dites[0];
}

/** Quantité lisible, accordée : « 1 000 mètres », « 1 rouleau », « 12 pièces ». */
function quantiteLisible(q: unknown, unite?: string): string {
  const n = Number(q) || 0;
  return `${nombreFr(n)} ${motUnite(unite, n)}`;
}

/** Jour local au format aaaa-mm-jj (le champ date du navigateur parle ainsi). */
function jourLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function jourDecale(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return jourLocal(d);
}

/** « jeudi 1 octobre » : une date qu'on relit sans calculer. */
function jourEnToutesLettres(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? dateFr(iso) : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** « Aujourd'hui à 14 h 32 », « Hier à 9 h 05 », « Le 12/09/2026 à 16 h 10 ». */
function quand(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateFr(iso);
  const jour = jourLocal(d);
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  if (jour === jourLocal()) return `Aujourd’hui à ${heure}`;
  if (jour === jourDecale(-1)) return `Hier à ${heure}`;
  return `Le ${dateFr(jour)} à ${heure}`;
}

/** Même chose, au milieu d'une phrase : « le 12/09/2026 à 16 h 10 », « hier à 9 h 05 ». */
function enMinuscule(texte: string): string {
  return texte.charAt(0).toLowerCase() + texte.slice(1);
}

/**
 * Quantité tapée par le client : « 1 000 », « 2,5 » ou « 2.5 ». Un champ texte
 * plutôt qu'un champ nombre : selon le navigateur, ce dernier refuse la virgule
 * française ou la prend en silence pour une valeur vide.
 */
function nombreSaisi(v: string): number {
  // \s couvre aussi les espaces insécables que nombreFr met entre les milliers.
  const t = v.replace(/\s/g, '').replace(',', '.');
  if (!t || !/^\d*\.?\d*$/.test(t) || t === '.') return NaN;
  return Number(t);
}

/** La quantité telle qu'on la pré-remplit : à la française, sans séparateur de milliers. */
function quantiteAEcrire(q: number): string {
  return q > 0 ? String(Math.round(q * 100) / 100).replace('.', ',') : '';
}

/** Couleur, taille, qualité… : ce qui distingue deux commandes du même produit. */
function detailsCommande(c: CommandeClient): string {
  return [
    c.couleur && `Couleur ${c.couleur}`,
    c.taille && `Taille ${c.taille}`,
    c.qualite && `Qualité ${c.qualite}`,
    c.fermeture && `Fermeture ${c.fermeture}`,
    c.caracteristiques,
  ].filter(Boolean).join(' · ');
}

function libelleOption(c: CommandeClient): string {
  const variante = [c.couleur, c.taille, c.qualite].filter(Boolean).join(' · ');
  return `${c.nom}${variante ? ` (${variante})` : ''} — ${quantiteLisible(c.quantite, c.unite)}${c.commandeeLe ? `, commandée le ${dateFr(c.commandeeLe)}` : ''}`;
}

/** Les commandes regroupées par étape, dans l'ordre demandé, les plus récentes d'abord. */
function parEtape(commandes: CommandeClient[], ordre: EtapeClient[]) {
  return ordre
    .map(id => ({
      etape: ETAPES_CLIENT[rangEtape(id)],
      liste: commandes
        .filter(c => etapeClient(c.statut) === id)
        .sort((a, b) => String(b.commandeeLe || '').localeCompare(String(a.commandeeLe || ''))),
    }))
    .filter(g => g.liste.length > 0);
}

// Pour recommander, on cherche d'abord dans ce qu'on a déjà reçu.
const ORDRE_RECOMMANDE: EtapeClient[] = ['livree', 'prete', 'douane', 'mer', 'fabrication', 'enregistree'];
const ORDRE_QUESTION: EtapeClient[] = ['douane', 'mer', 'fabrication', 'enregistree', 'prete', 'livree'];

/** Vignette de la commande (photo du produit, sinon un carton). */
function Vignette({ photo, className }: { photo?: string; className?: string }) {
  const [casse, setCasse] = useState(false);
  if (photo && !casse) {
    return <img src={photo} alt="" loading="lazy" onError={() => setCasse(true)} className={cn('rounded-xl object-cover border border-stone-100 shrink-0 bg-stone-50', className)} />;
  }
  return (
    <div className={cn('rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0', className)}>
      <Package className="w-1/3 h-1/3 text-stone-300" />
    </div>
  );
}

// ─── Habillage commun ─────────────────────────────────────────────────────────

const CHAMP =
  'w-full rounded-xl border bg-white px-3.5 py-3 text-base sm:text-sm font-medium text-stone-900 placeholder:text-stone-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#c4a062]/40 focus:border-[#c4a062] transition-colors disabled:opacity-60';

const puce = (actif: boolean) => cn(
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors',
  actif ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:text-stone-900',
);

function Etiquette({ children, htmlFor, facultatif, id }: { children: React.ReactNode; htmlFor?: string; facultatif?: boolean; id?: string }) {
  return (
    <label id={id} htmlFor={htmlFor} className="block text-[10px] font-black text-stone-500 uppercase tracking-widest mb-2">
      {children}
      {facultatif && <span className="ml-1.5 normal-case tracking-normal font-bold text-stone-400">(facultatif)</span>}
    </label>
  );
}

function ErreurChamp({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-[11px] font-bold text-red-600 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" /> {message}
    </p>
  );
}

function Compteur({ longueur }: { longueur: number }) {
  const reste = MAX_MESSAGE - longueur;
  return (
    <span className={cn('text-[10px] font-bold tabular-nums', reste < 100 ? 'text-amber-600' : 'text-stone-400')}>
      {nombreFr(longueur)} / {nombreFr(MAX_MESSAGE)}
    </span>
  );
}

/** Sélecteur natif (le plus sûr au doigt, sur téléphone) aux couleurs de la maison. */
function ChoixCommande({ id, valeur, commandes, ordre, vide, invalide, aide, onChange }: {
  id: string; valeur: string; commandes: CommandeClient[]; ordre: EtapeClient[]; vide: string;
  invalide?: boolean; aide?: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        aria-invalid={invalide || undefined}
        aria-describedby={aide}
        className={cn(CHAMP, 'appearance-none pr-10 truncate', invalide ? 'border-red-300' : 'border-stone-200', !valeur && 'text-stone-400')}
      >
        <option value="">{vide}</option>
        {parEtape(commandes, ordre).map(g => (
          <optgroup key={g.etape.id} label={g.etape.titre}>
            {g.liste.map(c => <option key={c.id} value={c.id} className="text-stone-900">{libelleOption(c)}</option>)}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
    </div>
  );
}

/** Rappel d'une commande : photo, nom, variante, dernière quantité. */
function ApercuCommande({ c, compact }: { c: CommandeClient; compact?: boolean }) {
  const details = detailsCommande(c);
  const couleurs = c.couleurs || [];
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-3 flex gap-3">
      <Vignette photo={c.photo} className={compact ? 'w-12 h-12' : 'w-16 h-16'} />
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <p className="font-black text-stone-900 text-sm uppercase tracking-wider truncate">{c.nom}</p>
        {c.reference && (
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide truncate">Référence : {c.reference}</p>
        )}
        {details && !compact && <p className="mt-0.5 text-[11px] font-bold text-stone-500 leading-snug line-clamp-2">{details}</p>}
        <p className="mt-0.5 text-[11px] font-bold text-stone-600">
          <span className="text-stone-400">{c.commandeeLe ? `Commandée le ${dateFr(c.commandeeLe)} :` : 'Quantité :'}</span>{' '}
          <span className="font-black">{quantiteLisible(c.quantite, c.unite)}</span>
          <span className="text-stone-400"> · {ETAPES_CLIENT[rangEtape(etapeClient(c.statut))].court}</span>
        </p>
        {!compact && couleurs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {couleurs.slice(0, 6).map((r, i) => (
              <span key={i} className="text-[9px] font-black bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded uppercase">
                {r.code} · {quantiteLisible(r.quantite, c.unite)}
              </span>
            ))}
            {couleurs.length > 6 && (
              <span className="text-[9px] font-black text-stone-400 px-1 py-0.5 uppercase">+ {couleurs.length - 6} autres</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Le formulaire ────────────────────────────────────────────────────────────

const PRESENTATION: Record<TypeDemande, { icone: React.ElementType; titre: string; intro: string }> = {
  recommande: {
    icone: RotateCcw,
    titre: 'Recommander un produit',
    intro: 'Le même produit, dans la quantité de votre choix. Nous vous recontactons pour confirmer le prix et le délai.',
  },
  livraison: {
    icone: Truck,
    titre: 'Livraison ou retrait',
    intro: 'Choisissez ce qui doit partir, et comment. Nous vous confirmons le jour et l’heure.',
  },
  question: {
    icone: MessageCircleQuestion,
    titre: 'Poser une question',
    intro: 'Nous vous répondons par écrit : notre réponse s’affiche dans « Mes demandes ».',
  },
};

const MODES: { id: 'livraison' | 'retrait'; icone: React.ElementType; titre: string; phrase: string }[] = [
  { id: 'livraison', icone: Truck, titre: 'Livraison', phrase: 'Nous vous livrons à l’adresse que vous indiquez.' },
  { id: 'retrait', icone: Warehouse, titre: RETRAIT, phrase: `Vous passez récupérer la marchandise au ${ADRESSE_ENTREPOT}.` },
];

const SUGGESTIONS_QUESTION = [
  'Quand ma commande arrivera-t-elle ?',
  'Pouvez-vous m’envoyer la facture ?',
  'Puis-je modifier ma commande ?',
];

type Champ = 'commande' | 'quantite' | 'selection' | 'mode' | 'date' | 'message';

type Saisie = {
  commandeId: string;
  quantite: string;
  selection: string[];
  mode: '' | 'livraison' | 'retrait';
  date: string;
  message: string;
};

const SAISIE_VIDE: Saisie = { commandeId: '', quantite: '', selection: [], mode: '', date: '', message: '' };

function saisieInitiale(type: TypeDemande, commandes: CommandeClient[], preselection: string[]): Saisie {
  const parId = new Map(commandes.map(c => [c.id, c]));
  const connues = preselection.filter(id => parId.has(id));
  if (type === 'recommande') {
    const c = connues.length ? parId.get(connues[0]) : undefined;
    return { ...SAISIE_VIDE, commandeId: c?.id || '', quantite: c ? quantiteAEcrire(c.quantite) : '' };
  }
  if (type === 'livraison') {
    const pretes = commandes.filter(c => c.statut === 'STOCK');
    const cochees = pretes.filter(c => connues.includes(c.id)).map(c => c.id);
    // Une seule commande prête : c'est évidemment celle-là.
    return { ...SAISIE_VIDE, selection: cochees.length ? cochees : pretes.length === 1 ? [pretes[0].id] : [] };
  }
  return { ...SAISIE_VIDE, commandeId: connues[0] || '' };
}

/**
 * Une commande qu'on peut faire livrer : prête dans notre entrepôt. Si le
 * portail se rafraîchit pendant la saisie et qu'une commande cochée a changé
 * d'étape, sa case disparaît : elle ne doit pas partir en cachette.
 */
function estPrete(parId: Map<string, CommandeClient>, id: string): boolean {
  return parId.get(id)?.statut === 'STOCK';
}

/** Les mêmes règles que validerDemande, dites au client, champ par champ. */
function verifier(type: TypeDemande, s: Saisie, parId: Map<string, CommandeClient>, aujourdhui: string): Partial<Record<Champ, string>> {
  const e: Partial<Record<Champ, string>> = {};
  if (type === 'recommande') {
    const c = parId.get(s.commandeId);
    if (!c) e.commande = 'Choisissez le produit à recommander.';
    const q = nombreSaisi(s.quantite);
    if (!s.quantite.trim()) e.quantite = 'Indiquez la quantité souhaitée.';
    else if (!Number.isFinite(q) || q <= 0) e.quantite = 'Indiquez une quantité supérieure à zéro, en chiffres.';
    else if (q > MAX_QUANTITE) e.quantite = 'Cette quantité paraît trop élevée : vérifiez-la, s’il vous plaît.';
    else if (c && !uniteDecimale(c.unite) && !Number.isInteger(q)) e.quantite = `Indiquez un nombre entier de ${motUnite(c.unite, 2)}.`;
  }
  if (type === 'livraison') {
    if (!s.selection.some(id => estPrete(parId, id))) e.selection = 'Cochez au moins une commande.';
    if (!s.mode) e.mode = 'Choisissez la livraison ou le retrait à notre entrepôt.';
    if (s.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) e.date = 'Cette date est illisible.';
      else if (s.date < aujourdhui) e.date = 'Choisissez une date à partir d’aujourd’hui.';
    }
  }
  if (type === 'question' && !s.message.trim()) e.message = 'Écrivez votre question.';
  if (s.message.trim().length > MAX_MESSAGE) e.message = `Votre message dépasse ${nombreFr(MAX_MESSAGE)} caractères.`;
  return e;
}

/** La demande telle qu'elle part au serveur : aucune clé vide ni indéfinie. */
function construire(type: TypeDemande, s: Saisie, parId: Map<string, CommandeClient>): DemandeSaisie {
  const d: DemandeSaisie = { type };
  if (type === 'recommande') {
    d.commandes = [s.commandeId];
    d.quantite = Math.round(nombreSaisi(s.quantite) * 100) / 100;
  }
  if (type === 'livraison') {
    d.commandes = s.selection.filter(id => estPrete(parId, id));
    if (s.mode) d.mode = s.mode;
    if (s.date) d.dateSouhaitee = s.date;
  }
  if (type === 'question' && s.commandeId && parId.has(s.commandeId)) d.commandes = [s.commandeId];
  const message = s.message.trim();
  if (message) d.message = message;
  return d;
}

/** La demande racontée en quelques lignes (récapitulatif, message WhatsApp). */
function recit(d: DemandeSaisie, parId: Map<string, CommandeClient>): string[] {
  const noms = (d.commandes || []).map(id => parId.get(id)).filter((c): c is CommandeClient => Boolean(c));
  const lignes: string[] = [];
  if (d.type === 'recommande' && noms[0]) {
    lignes.push(`Recommander : ${noms[0].nom} — ${quantiteLisible(d.quantite, noms[0].unite)}`);
  }
  if (d.type === 'livraison') {
    lignes.push(`${d.mode === 'retrait' ? RETRAIT : 'Livraison'} : ${noms.map(c => c.nom).join(', ')}`);
    lignes.push(d.dateSouhaitee ? `Date souhaitée : ${dateFr(d.dateSouhaitee)}` : 'Dès que possible');
  }
  if (d.type === 'question') lignes.push(noms[0] ? `Question sur : ${noms[0].nom}` : 'Question');
  if (d.message) lignes.push(d.message);
  return lignes;
}

export function FormulaireDemande({ type, commandes, preselection, ouvert, onFermer, envoyer, whatsapp }: {
  type: TypeDemande | null;
  commandes: CommandeClient[];
  preselection?: string[];
  ouvert: boolean;
  onFermer: () => void;
  envoyer: (d: DemandeSaisie) => Promise<void>;
  /** Numéro WhatsApp de LEBTEX (chiffres seuls) : proposé en secours si l'envoi échoue. */
  whatsapp?: string;
}) {
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [typeAffiche, setTypeAffiche] = useState<TypeDemande>(type || 'question');
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoyee'>('saisie');
  const [tente, setTente] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState<DemandeSaisie | null>(null);
  const [choixLibre, setChoixLibre] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Remise à zéro à chaque ouverture (nouveau type, nouvelle présélection).
  // Faite pendant le rendu, pas dans un effet : pas un instant d'ancien
  // formulaire à l'écran. Une mise à jour des commandes pendant la saisie
  // (rafraîchissement du portail) ne vide pas ce que le client a tapé.
  const clePreselection = (preselection || []).join('|');
  const cleOuverture = ouvert && type ? `${type}#${clePreselection}` : '';
  const [cleCourante, setCleCourante] = useState('');
  if (cleOuverture !== cleCourante) {
    setCleCourante(cleOuverture);
    if (cleOuverture && type) {
      const initiale = saisieInitiale(type, commandes, preselection || []);
      setSaisie(initiale);
      setTypeAffiche(type);
      setEtat('saisie');
      setTente(false);
      setErreurEnvoi(null);
      setEnvoyee(null);
      setChoixLibre(!initiale.commandeId);
    }
  }

  const t = typeAffiche;
  const parId = useMemo(() => new Map(commandes.map(c => [c.id, c])), [commandes]);
  const pretes = useMemo(
    () => commandes
      .filter(c => c.statut === 'STOCK')
      .sort((a, b) => String(a.entrepotLe || '').localeCompare(String(b.entrepotLe || ''))),
    [commandes],
  );
  const aujourdhui = jourLocal();
  const demain = jourDecale(1);
  const erreurs = verifier(t, saisie, parId, aujourdhui);
  const visibles: Partial<Record<Champ, string>> = tente ? erreurs : {};
  const envoiEnCours = etat === 'envoi';
  const commande = parId.get(saisie.commandeId);
  const rien = t === 'livraison' && pretes.length === 0;
  const Presentation = PRESENTATION[t];

  const maj = (partiel: Partial<Saisie>) => {
    setSaisie(s => ({ ...s, ...partiel }));
    setErreurEnvoi(null);
  };

  const choisirCommande = (id: string) => {
    const c = parId.get(id);
    // En recommandant, on repart de la quantité de cette commande-là.
    maj(t === 'recommande' ? { commandeId: id, quantite: c ? quantiteAEcrire(c.quantite) : '' } : { commandeId: id });
  };

  const basculer = (id: string, coche: boolean) => {
    setSaisie(s => ({
      ...s,
      selection: coche
        ? pretes.map(c => c.id).filter(x => x === id || s.selection.includes(x))
        : s.selection.filter(x => x !== id),
    }));
    setErreurEnvoi(null);
  };

  const toutCoche = pretes.length > 0 && pretes.every(c => saisie.selection.includes(c.id));
  const nbCochees = pretes.filter(c => saisie.selection.includes(c.id)).length;

  const soumettre = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (envoiEnCours || rien) return;
    setTente(true);
    if (Object.keys(erreurs).length) {
      // Emmène le client jusqu'au premier champ à reprendre.
      setTimeout(() => {
        const champ = formRef.current?.querySelector<HTMLElement>('[data-invalide="true"]');
        champ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 0);
      return;
    }
    const demande = construire(t, saisie, parId);
    setEtat('envoi');
    setErreurEnvoi(null);
    try {
      await envoyer(demande);
      setEnvoyee(demande);
      setEtat('envoyee');
    } catch (err) {
      setErreurEnvoi(err instanceof Error && err.message
        ? err.message
        : 'L’envoi n’a pas abouti. Vérifiez votre connexion, puis réessayez.');
      setEtat('saisie');
    }
  };

  const fermer = () => { if (!envoiEnCours) onFermer(); };
  const commence = saisie.message.trim().length > 0 || (t === 'livraison' && saisie.selection.length > 0 && !!saisie.mode);
  const lienWhatsapp = whatsapp && erreurEnvoi
    ? `https://wa.me/${whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(['Bonjour,', ...recit(construire(t, saisie, parId), parId)].join('\n'))}`
    : null;

  return (
    <Dialog open={ouvert && !!type} onOpenChange={o => { if (!o) fermer(); }}>
      <DialogContent
        // La croix d'origine (« Close », en anglais) est masquée : la nôtre, plus bas, parle français.
        className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[92dvh] p-0 gap-0 rounded-3xl sm:rounded-3xl border-stone-200 bg-[#F9F6F0] shadow-2xl [&>button:last-child]:hidden"
        // Un tapotement à côté ne doit pas effacer un message déjà écrit.
        onInteractOutside={e => { if (commence || envoiEnCours) e.preventDefault(); }}
      >
        <div className="bg-white border-b border-stone-200 px-5 sm:px-6 pt-5 pb-4 pr-12 sm:pr-12">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-stone-900 text-[#c4a062] flex items-center justify-center shrink-0 shadow-md shadow-stone-900/10">
              <Presentation.icone className="w-5 h-5" />
            </div>
            <DialogHeader className="text-left space-y-1 min-w-0">
              <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest">
                {etat === 'envoyee' ? 'Demande envoyée' : 'Nouvelle demande'}
              </p>
              <DialogTitle className="text-lg font-black text-stone-900 tracking-tight leading-tight">{Presentation.titre}</DialogTitle>
              <DialogDescription className={cn('text-xs font-medium text-stone-500 leading-relaxed', etat === 'envoyee' && 'sr-only')}>{Presentation.intro}</DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {etat === 'envoyee' && envoyee ? (
          <div className="px-5 sm:px-6 py-8 text-center animate-in fade-in">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="mt-5 text-base font-black text-stone-900 leading-snug" role="status">
              Demande envoyée : nous vous répondons rapidement.
            </p>
            <p className="mt-2 text-xs font-medium text-stone-500">
              Vous suivez son avancement, et notre réponse, dans « Mes demandes ».
            </p>
            <div className="mt-6 text-left bg-white border border-stone-200 rounded-2xl p-4">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Récapitulatif</p>
              <ul className="space-y-1.5">
                {recit(envoyee, parId).map((l, i) => (
                  <li key={i} className={cn('text-xs leading-relaxed whitespace-pre-line break-words', i === 0 ? 'font-black text-stone-900' : 'font-medium text-stone-600')}>{l}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              autoFocus
              onClick={onFermer}
              className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-stone-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-stone-800 transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={soumettre} noValidate className="flex flex-col min-w-0">
            <fieldset disabled={envoiEnCours} className="px-5 sm:px-6 py-5 space-y-6 min-w-0">

              {/* ── Recommander ── */}
              {t === 'recommande' && (
                <>
                  <div data-invalide={!!visibles.commande}>
                    <Etiquette htmlFor={choixLibre ? 'dem-produit' : undefined}>Produit</Etiquette>
                    {choixLibre && (
                      <ChoixCommande
                        id="dem-produit"
                        valeur={saisie.commandeId}
                        commandes={commandes}
                        ordre={ORDRE_RECOMMANDE}
                        vide="Choisissez parmi vos commandes…"
                        invalide={!!visibles.commande}
                        aide={visibles.commande ? 'dem-produit-erreur' : undefined}
                        onChange={choisirCommande}
                      />
                    )}
                    {commande && (
                      <div className={cn(choixLibre && 'mt-3')}>
                        <ApercuCommande c={commande} />
                        {!choixLibre && (
                          <button
                            type="button"
                            onClick={() => setChoixLibre(true)}
                            className="mt-2 text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 transition-colors"
                          >
                            Choisir un autre produit
                          </button>
                        )}
                      </div>
                    )}
                    {commandes.length === 0 && (
                      <p className="mt-2 text-xs font-medium text-stone-500">Aucune commande à recommander pour le moment.</p>
                    )}
                    <ErreurChamp id="dem-produit-erreur" message={visibles.commande} />
                  </div>

                  <div data-invalide={!!visibles.quantite}>
                    <Etiquette htmlFor="dem-quantite">Quantité souhaitée</Etiquette>
                    <div className="relative">
                      <input
                        id="dem-quantite"
                        type="text"
                        inputMode={commande && uniteDecimale(commande.unite) ? 'decimal' : 'numeric'}
                        autoComplete="off"
                        value={saisie.quantite}
                        onChange={e => maj({ quantite: e.target.value })}
                        placeholder="0"
                        aria-invalid={!!visibles.quantite || undefined}
                        aria-describedby={visibles.quantite ? 'dem-quantite-erreur' : 'dem-quantite-aide'}
                        className={cn(CHAMP, 'pr-28 font-black tabular-nums', visibles.quantite ? 'border-red-300' : 'border-stone-200')}
                      />
                      {commande && (
                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-black text-stone-400 uppercase tracking-wider">
                          {motUnite(commande.unite, Number.isFinite(nombreSaisi(saisie.quantite)) ? nombreSaisi(saisie.quantite) : 2)}
                        </span>
                      )}
                    </div>
                    <ErreurChamp id="dem-quantite-erreur" message={visibles.quantite} />
                    {commande && (
                      <div id="dem-quantite-aide" className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-medium text-stone-500">
                          La dernière fois : <span className="font-black text-stone-700">{quantiteLisible(commande.quantite, commande.unite)}</span>
                          {uniteDecimale(commande.unite) && <span className="text-stone-400"> · décimales acceptées (ex. 2,5)</span>}
                        </p>
                        {commande.quantite > 0 && nombreSaisi(saisie.quantite) !== commande.quantite && (
                          <button type="button" onClick={() => maj({ quantite: quantiteAEcrire(commande.quantite) })} className={puce(false)}>
                            <RotateCcw className="w-3 h-3" /> Même quantité
                          </button>
                        )}
                      </div>
                    )}
                    {commande?.prixConvenuMad !== undefined && (
                      <p className="mt-3 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 leading-snug">
                        Dernier prix convenu : {nombreFr(commande.prixConvenuMad)} MAD / {motUnite(commande.unite, 1)}.
                        <span className="font-medium text-emerald-700/80"> Le prix de cette nouvelle commande vous sera confirmé.</span>
                      </p>
                    )}
                  </div>

                  <div data-invalide={!!visibles.message}>
                    <div className="flex items-end justify-between gap-2">
                      <Etiquette htmlFor="dem-message" facultatif>Précisions</Etiquette>
                      <div className="mb-2"><Compteur longueur={saisie.message.length} /></div>
                    </div>
                    <textarea
                      id="dem-message"
                      ref={messageRef}
                      rows={3}
                      maxLength={MAX_MESSAGE}
                      value={saisie.message}
                      onChange={e => maj({ message: e.target.value })}
                      placeholder="Ex. : mêmes couleurs que la dernière fois, une autre répartition, un délai souhaité…"
                      className={cn(CHAMP, 'resize-none leading-relaxed', visibles.message ? 'border-red-300' : 'border-stone-200')}
                    />
                    <ErreurChamp id="dem-message-erreur" message={visibles.message} />
                  </div>
                </>
              )}

              {/* ── Livraison / retrait ── */}
              {t === 'livraison' && (
                <>
                  <div data-invalide={!!visibles.selection}>
                    <div className="flex items-end justify-between gap-2">
                      <Etiquette id="dem-selection">Commandes prêtes</Etiquette>
                      {pretes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => maj({ selection: toutCoche ? [] : pretes.map(c => c.id) })}
                          className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 transition-colors"
                        >
                          {toutCoche ? 'Tout décocher' : 'Tout cocher'}
                        </button>
                      )}
                    </div>
                    {rien ? (
                      <div className="bg-white border border-stone-200 rounded-2xl p-5 text-center">
                        <PackageCheck className="w-6 h-6 text-stone-300 mx-auto" />
                        <p className="mt-2 text-sm font-black text-stone-700">Rien n’est prêt pour le moment</p>
                        <p className="mt-1 text-xs font-medium text-stone-500">
                          Vous pourrez demander la livraison dès qu’une commande sera arrivée dans notre entrepôt.
                        </p>
                      </div>
                    ) : (
                      <div role="group" aria-labelledby="dem-selection" className="space-y-2">
                        {pretes.map(c => {
                          const coche = saisie.selection.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              htmlFor={`dem-liv-${c.id}`}
                              className={cn(
                                'flex items-center gap-3 rounded-2xl border bg-white p-3 cursor-pointer transition-all',
                                coche ? 'border-stone-900 ring-1 ring-stone-900 shadow-sm' : 'border-stone-200 hover:border-stone-300',
                              )}
                            >
                              <Checkbox
                                id={`dem-liv-${c.id}`}
                                checked={coche}
                                onCheckedChange={v => basculer(c.id, v === true)}
                                className="h-5 w-5 rounded-md border-stone-300 data-[state=checked]:bg-stone-900 data-[state=checked]:border-stone-900 data-[state=checked]:text-[#c4a062]"
                              />
                              <Vignette photo={c.photo} className="w-11 h-11" />
                              <span className="min-w-0 flex-1">
                                <span className="block font-black text-stone-900 text-xs uppercase tracking-wider truncate">{c.nom}</span>
                                <span className="block text-[11px] font-bold text-stone-600">
                                  {quantiteLisible(c.quantite, c.unite)}
                                  {[c.couleur, c.taille].filter(Boolean).length > 0 && (
                                    <span className="text-stone-400"> · {[c.couleur, c.taille].filter(Boolean).join(' · ')}</span>
                                  )}
                                </span>
                                {c.entrepotLe && (
                                  <span className="block text-[10px] font-bold text-emerald-600">Dans notre entrepôt depuis le {dateFr(c.entrepotLe)}</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                        <p className="px-1 text-[11px] font-bold text-stone-500" aria-live="polite">
                          {nbCochees === 0
                            ? 'Aucune commande cochée.'
                            : `${nbCochees} commande${nbCochees > 1 ? 's cochées' : ' cochée'} sur ${pretes.length}.`}
                        </p>
                      </div>
                    )}
                    <ErreurChamp id="dem-selection-erreur" message={visibles.selection} />
                  </div>

                  {!rien && (
                    <>
                      <div data-invalide={!!visibles.mode}>
                        <Etiquette id="dem-mode">Comment ?</Etiquette>
                        <RadioGroup
                          value={saisie.mode}
                          onValueChange={v => maj({ mode: v === 'retrait' ? 'retrait' : 'livraison' })}
                          aria-labelledby="dem-mode"
                          className="grid grid-cols-2 gap-3"
                        >
                          {MODES.map(m => {
                            const actif = saisie.mode === m.id;
                            return (
                              <label
                                key={m.id}
                                htmlFor={`dem-mode-${m.id}`}
                                className={cn(
                                  'flex flex-col gap-2 rounded-2xl border bg-white p-3.5 sm:p-4 cursor-pointer transition-all',
                                  actif ? 'border-stone-900 ring-1 ring-stone-900 shadow-sm' : visibles.mode ? 'border-red-300' : 'border-stone-200 hover:border-stone-300',
                                )}
                              >
                                <span className="flex items-center justify-between">
                                  <m.icone className={cn('w-5 h-5', actif ? 'text-[#a38042]' : 'text-stone-400')} />
                                  <RadioGroupItem value={m.id} id={`dem-mode-${m.id}`} className="h-4 w-4 border-stone-300 text-stone-900" />
                                </span>
                                <span className="text-[11px] font-black uppercase tracking-widest text-stone-900 leading-tight">{m.titre}</span>
                                <span className="text-[11px] font-medium text-stone-500 leading-snug">{m.phrase}</span>
                              </label>
                            );
                          })}
                        </RadioGroup>
                        <ErreurChamp id="dem-mode-erreur" message={visibles.mode} />
                      </div>

                      <div data-invalide={!!visibles.date}>
                        <Etiquette htmlFor="dem-date" facultatif>Date souhaitée</Etiquette>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="relative sm:flex-1">
                            <input
                              id="dem-date"
                              type="date"
                              min={aujourdhui}
                              value={saisie.date}
                              onChange={e => maj({ date: e.target.value })}
                              aria-invalid={!!visibles.date || undefined}
                              aria-describedby={visibles.date ? 'dem-date-erreur' : 'dem-date-aide'}
                              className={cn(CHAMP, 'min-h-[3rem]', visibles.date ? 'border-red-300' : 'border-stone-200', !saisie.date && 'text-stone-400')}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => maj({ date: '' })} className={puce(!saisie.date)}>
                              <Clock className="w-3 h-3" /> Dès que possible
                            </button>
                            <button type="button" onClick={() => maj({ date: demain })} className={puce(saisie.date === demain)}>
                              Demain
                            </button>
                          </div>
                        </div>
                        <ErreurChamp id="dem-date-erreur" message={visibles.date} />
                        {!visibles.date && (
                          <p id="dem-date-aide" className="mt-2 text-[11px] font-medium text-stone-500 flex items-start gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 mt-px text-stone-400 shrink-0" />
                            <span>
                              {saisie.date && /^\d{4}-\d{2}-\d{2}$/.test(saisie.date)
                                ? <>Souhaitée pour le <span className="font-black text-stone-700">{jourEnToutesLettres(saisie.date)}</span> ; nous vous confirmons le créneau.</>
                                : 'Sans date, nous vous proposons le premier créneau disponible.'}
                            </span>
                          </p>
                        )}
                      </div>

                      <div data-invalide={!!visibles.message}>
                        <div className="flex items-end justify-between gap-2">
                          <Etiquette htmlFor="dem-message" facultatif>Précisions</Etiquette>
                          <div className="mb-2"><Compteur longueur={saisie.message.length} /></div>
                        </div>
                        <textarea
                          id="dem-message"
                          ref={messageRef}
                          rows={3}
                          maxLength={MAX_MESSAGE}
                          value={saisie.message}
                          onChange={e => maj({ message: e.target.value })}
                          placeholder={saisie.mode === 'retrait'
                            ? 'Ex. : qui passera récupérer la marchandise, à quelle heure…'
                            : 'Ex. : adresse de livraison, horaires de réception, personne à contacter…'}
                          className={cn(CHAMP, 'resize-none leading-relaxed', visibles.message ? 'border-red-300' : 'border-stone-200')}
                        />
                        <ErreurChamp id="dem-message-erreur" message={visibles.message} />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Question ── */}
              {t === 'question' && (
                <>
                  <div>
                    <Etiquette htmlFor="dem-commande" facultatif>Commande concernée</Etiquette>
                    <ChoixCommande
                      id="dem-commande"
                      valeur={saisie.commandeId}
                      commandes={commandes}
                      ordre={ORDRE_QUESTION}
                      vide="Aucune en particulier — question générale"
                      onChange={choisirCommande}
                    />
                    {commande && <div className="mt-3"><ApercuCommande c={commande} compact /></div>}
                  </div>

                  <div data-invalide={!!visibles.message}>
                    <div className="flex items-end justify-between gap-2">
                      <Etiquette htmlFor="dem-message">Votre question</Etiquette>
                      <div className="mb-2"><Compteur longueur={saisie.message.length} /></div>
                    </div>
                    {!saisie.message && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {SUGGESTIONS_QUESTION.map(q => (
                          <button
                            key={q}
                            type="button"
                            // Le focus passe au champ AVANT que ces suggestions disparaissent.
                            onClick={() => { messageRef.current?.focus(); maj({ message: `${q} ` }); }}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[11px] font-bold text-stone-600 hover:border-[#c4a062] hover:text-stone-900 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      id="dem-message"
                      ref={messageRef}
                      rows={5}
                      maxLength={MAX_MESSAGE}
                      value={saisie.message}
                      onChange={e => maj({ message: e.target.value })}
                      placeholder="Écrivez votre question ici…"
                      aria-invalid={!!visibles.message || undefined}
                      aria-describedby={visibles.message ? 'dem-message-erreur' : undefined}
                      className={cn(CHAMP, 'resize-none leading-relaxed', visibles.message ? 'border-red-300' : 'border-stone-200')}
                    />
                    <ErreurChamp id="dem-message-erreur" message={visibles.message} />
                  </div>
                </>
              )}
            </fieldset>

            <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-stone-200 px-5 sm:px-6 py-4 space-y-3">
              {erreurEnvoi && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                  <p className="text-xs font-bold text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {erreurEnvoi}
                  </p>
                  {lienWhatsapp && (
                    <a
                      href={lienWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 ml-6 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-900"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Nous l’envoyer par WhatsApp
                    </a>
                  )}
                </div>
              )}
              {tente && Object.keys(erreurs).length > 0 && !erreurEnvoi && (
                <p className="text-[11px] font-bold text-red-600" aria-live="polite">
                  Il manque {Object.keys(erreurs).length > 1 ? 'quelques informations' : 'une information'} : voir ci-dessus.
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={fermer}
                  disabled={envoiEnCours}
                  className="px-4 sm:px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={envoiEnCours || rien}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-xl whitespace-nowrap bg-stone-900 text-white text-[11px] font-black uppercase tracking-widest shadow-md shadow-stone-900/10 hover:bg-stone-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {envoiEnCours
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
                    : <><Send className="w-4 h-4 text-[#c4a062]" /> Envoyer<span className="hidden sm:inline">&nbsp;la demande</span></>}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Dernière du formulaire au clavier, comme la croix qu'elle remplace ; inactive pendant l'envoi. */}
        <button
          type="button"
          onClick={fermer}
          disabled={envoiEnCours}
          aria-label="Fermer"
          title="Fermer"
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062] disabled:opacity-40 disabled:pointer-events-none"
        >
          <X className="w-4 h-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ─── « Mes demandes » ─────────────────────────────────────────────────────────

const TON_TYPE: Record<TypeDemande, { icone: React.ElementType; fond: string; texte: string }> = {
  recommande: { icone: RotateCcw, fond: 'bg-[#c4a062]/10', texte: 'text-[#a38042]' },
  livraison: { icone: Truck, fond: 'bg-emerald-50', texte: 'text-emerald-600' },
  question: { icone: MessageCircleQuestion, fond: 'bg-blue-50', texte: 'text-blue-600' },
};

const TON_STATUT: Record<StatutDemande, string> = {
  nouvelle: 'bg-stone-100 text-stone-600 border-stone-200',
  en_cours: 'bg-amber-50 text-amber-700 border-amber-200',
  traitee: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const PHRASE_STATUT: Record<StatutDemande, string> = {
  nouvelle: 'Bien reçue ; nous la prenons en charge au plus vite.',
  en_cours: 'Nous nous en occupons en ce moment.',
  traitee: 'Nous avons traité votre demande.',
};

const ORDRE_STATUT: StatutDemande[] = ['nouvelle', 'en_cours', 'traitee'];

const EXPLICATIONS: { type: TypeDemande; phrase: string }[] = [
  { type: 'recommande', phrase: 'Le même produit en quelques gestes, dans la quantité de votre choix.' },
  { type: 'livraison', phrase: 'La livraison, ou le retrait à notre entrepôt, de ce qui y est prêt.' },
  { type: 'question', phrase: 'Une précision sur une commande : notre réponse s’affiche ici, par écrit.' },
];

/**
 * Heure de la réponse de LEBTEX (ISO), ou '' s'il n'y en a pas. `reponduLe`,
 * et non `majLe` : prendre la demande en charge ou la marquer traitée n'est pas
 * répondre, et ne doit ni rajeunir la réponse ni la refaire passer pour nouvelle.
 */
export function heureReponse(d: DemandeEnregistree): string {
  return d.reponse ? String(d.reponduLe || '') : '';
}

function statutSur(s: unknown): StatutDemande {
  return s === 'en_cours' || s === 'traitee' ? s : 'nouvelle';
}

function typeSur(t: unknown): TypeDemande {
  return t === 'recommande' || t === 'livraison' ? t : 'question';
}

/**
 * Une ligne du résumé enregistré avec la demande (« TAFFETAS — 2500.5 m »),
 * redite dans les mots du client (« TAFFETAS — 2 500,5 mètres »).
 */
const LIGNE_RESUME = /^(.*) — (\d+(?:\.\d+)?)\s*(.*)$/;

function resumeLisible(ligne: string): string {
  const m = LIGNE_RESUME.exec(ligne);
  return m ? `${m[1]} — ${quantiteLisible(Number(m[2]), m[3] || undefined)}` : ligne;
}

/** Ce qui a été demandé, en une ligne : « Recommander 500 pièces », « Retrait à notre entrepôt · 2 commandes ». */
function titreDemande(d: DemandeEnregistree, concernees: CommandeClient[], resume: string[]): string {
  const nb = Math.max(d.commandes?.length || 0, resume.length);
  switch (typeSur(d.type)) {
    case 'recommande': {
      const unite = concernees[0]?.unite ?? (LIGNE_RESUME.exec(resume[0] || '')?.[3] || undefined);
      return d.quantite ? `Recommander ${quantiteLisible(d.quantite, unite)}` : 'Recommander un produit';
    }
    case 'livraison': {
      const mode = d.mode === 'retrait' ? RETRAIT : 'Livraison';
      return nb ? `${mode} · ${nb} commande${nb > 1 ? 's' : ''}` : mode;
    }
    default: return nb ? 'Question sur une commande' : 'Question générale';
  }
}

function CarteDemande({ d, parId }: { d: DemandeEnregistree; parId: Map<string, CommandeClient> }) {
  const [messageDeplie, setMessageDeplie] = useState(false);
  const [toutesCommandes, setToutesCommandes] = useState(false);
  const type = typeSur(d.type);
  const statut = statutSur(d.statut);
  const ton = TON_TYPE[type];
  const rang = ORDRE_STATUT.indexOf(statut);
  const resume = Array.isArray(d.resume) ? d.resume : [];
  const ids = Array.isArray(d.commandes) ? d.commandes : [];

  // Chaque commande citée : telle qu'elle est aujourd'hui si on la connaît
  // encore, sinon telle qu'elle était au moment de la demande (le résumé).
  const lignes = (ids.length ? ids : resume.map((_, i) => `#${i}`)).map((id, i) => {
    const c = parId.get(id);
    return c ? { cle: id, c } : { cle: id, texte: resume[i] ? resumeLisible(resume[i]) : undefined };
  }).filter(l => l.c || l.texte);
  const concernees = lignes.map(l => l.c).filter((c): c is CommandeClient => Boolean(c));
  const visibles = toutesCommandes ? lignes : lignes.slice(0, 3);
  const long = (d.message || '').length > 220 || (d.message || '').split('\n').length > 4;
  const reponduLe = heureReponse(d);

  return (
    <article className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', ton.fond)}>
          <ton.icone className={cn('w-5 h-5', ton.texte)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
            <time dateTime={d.creeLe}>{quand(d.creeLe)}</time>
          </p>
          <h3 className="mt-0.5 text-sm font-black text-stone-900 leading-snug break-words"><span className="sr-only">{LIBELLE_DEMANDE[type]} : </span>{titreDemande(d, concernees, resume)}</h3>
        </div>
        <span className={cn('shrink-0 text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border whitespace-nowrap', TON_STATUT[statut])}>
          {LIBELLE_STATUT_DEMANDE[statut]}
        </span>
      </div>

      {lignes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visibles.map(l => (
            <li key={l.cle} className="flex items-center gap-2.5 min-w-0">
              {l.c ? (
                <>
                  <Vignette photo={l.c.photo} className="w-9 h-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-stone-800 uppercase tracking-wide truncate">{l.c.nom}</span>
                    <span className="block text-[10px] font-bold text-stone-500">
                      {type === 'recommande'
                        ? <>Commande précédente : {quantiteLisible(l.c.quantite, l.c.unite)}</>
                        : <>{quantiteLisible(l.c.quantite, l.c.unite)} · <span className="text-stone-400">aujourd’hui : {ETAPES_CLIENT[rangEtape(etapeClient(l.c.statut))].court.toLowerCase()}</span></>}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-stone-300" />
                  </div>
                  <span className="min-w-0 flex-1 text-xs font-bold text-stone-600 truncate">{l.texte}</span>
                </>
              )}
            </li>
          ))}
          {lignes.length > 3 && (
            <li>
              <button
                type="button"
                onClick={() => setToutesCommandes(v => !v)}
                className="ml-[46px] text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 transition-colors"
              >
                {toutesCommandes ? 'Réduire' : `Voir les ${lignes.length - 3} autres`}
              </button>
            </li>
          )}
        </ul>
      )}

      {type === 'livraison' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-md">
            {d.mode === 'retrait' ? <Warehouse className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
            {d.mode === 'retrait' ? RETRAIT : 'Livraison'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-md">
            <CalendarDays className="w-3.5 h-3.5" />
            {d.dateSouhaitee ? `Souhaitée le ${dateFr(d.dateSouhaitee)}` : 'Dès que possible'}
          </span>
        </div>
      )}

      {d.message && (
        <div className="mt-3 rounded-xl bg-stone-50 border border-stone-100 px-3.5 py-2.5">
          <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Votre message</p>
          <p className={cn('text-xs font-medium text-stone-700 leading-relaxed whitespace-pre-line break-words', long && !messageDeplie && 'line-clamp-4')}>
            {d.message}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setMessageDeplie(v => !v)}
              className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#a38042] hover:text-stone-900 transition-colors"
            >
              {messageDeplie ? 'Réduire' : 'Lire la suite'}
            </button>
          )}
        </div>
      )}

      {d.reponse && (
        <div className="mt-3 rounded-xl border border-[#c4a062]/30 bg-[#c4a062]/10 px-3.5 py-3">
          <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest flex flex-wrap items-center gap-x-1.5">
            <MessageSquareReply className="w-3.5 h-3.5" /> Réponse de LEBTEX
            {reponduLe && (
              <span className="normal-case tracking-normal font-bold text-[#a38042]/70">
                · <time dateTime={reponduLe}>{enMinuscule(quand(reponduLe))}</time>
              </span>
            )}
          </p>
          <p className="mt-1.5 text-sm font-medium text-stone-800 leading-relaxed whitespace-pre-line break-words">{d.reponse}</p>
        </div>
      )}

      <div className="mt-4" aria-label={`Suivi : ${LIBELLE_STATUT_DEMANDE[statut]}`}>
        <div className="flex items-center gap-1">
          {ORDRE_STATUT.map((s, i) => (
            <div
              key={s}
              title={LIBELLE_STATUT_DEMANDE[s]}
              className={cn('h-1.5 flex-1 rounded-full', i < rang ? 'bg-[#c4a062]' : i === rang ? (statut === 'traitee' ? 'bg-emerald-500' : 'bg-stone-900') : 'bg-stone-200')}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-stone-500">
          <span className="font-black text-stone-800">{LIBELLE_STATUT_DEMANDE[statut]}</span> · {PHRASE_STATUT[statut]}
        </p>
      </div>
    </article>
  );
}

/** Rien encore : on explique à quoi servent les demandes (et, si possible, on en ouvre une). */
function AucuneDemande({ onNouvelle }: { onNouvelle?: (type: TypeDemande) => void }) {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-stone-900 text-[#c4a062] flex items-center justify-center shadow-lg shadow-stone-900/10">
        <Inbox className="w-6 h-6" />
      </div>
      <p className="mt-4 text-center text-stone-700 font-black uppercase tracking-widest text-sm">Aucune demande pour le moment</p>
      <p className="mt-2 text-center text-stone-500 text-sm font-medium max-w-md mx-auto leading-relaxed">
        Écrivez-nous en quelques secondes, sans téléphoner. Chaque demande, son avancement et notre réponse restent ici, par écrit.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {EXPLICATIONS.map(({ type, phrase }) => {
          const ton = TON_TYPE[type];
          const contenu = (
            <>
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', ton.fond)}>
                <ton.icone className={cn('w-4 h-4', ton.texte)} />
              </div>
              <p className="mt-3 text-[11px] font-black text-stone-900 uppercase tracking-widest">{LIBELLE_DEMANDE[type]}</p>
              <p className="mt-1 text-xs font-medium text-stone-500 leading-snug">{phrase}</p>
            </>
          );
          return onNouvelle ? (
            <button
              key={type}
              type="button"
              onClick={() => onNouvelle(type)}
              className="text-left rounded-2xl border border-stone-200 bg-[#F9F6F0]/60 p-4 hover:border-[#c4a062] hover:bg-white hover:shadow-md transition-all"
            >
              {contenu}
            </button>
          ) : (
            <div key={type} className="rounded-2xl border border-stone-200 bg-[#F9F6F0]/60 p-4">{contenu}</div>
          );
        })}
      </div>
    </div>
  );
}

export function ListeDemandes({ demandes, commandes, onNouvelle }: {
  demandes: DemandeEnregistree[];
  commandes: CommandeClient[];
  /** Facultatif : rend les exemples de l'état vide cliquables (ouvre le formulaire de ce type). */
  onNouvelle?: (type: TypeDemande) => void;
}) {
  const [filtre, setFiltre] = useState<'toutes' | 'en_cours' | 'traitees'>('toutes');
  const parId = useMemo(() => new Map(commandes.map(c => [c.id, c])), [commandes]);
  const triees = useMemo(
    () => [...demandes].sort((a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || ''))),
    [demandes],
  );
  const enCours = triees.filter(d => statutSur(d.statut) !== 'traitee');
  const traitees = triees.filter(d => statutSur(d.statut) === 'traitee');

  if (triees.length === 0) return <AucuneDemande onNouvelle={onNouvelle} />;

  // Les filtres n'apparaissent que s'ils trient vraiment quelque chose.
  const avecFiltres = enCours.length > 0 && traitees.length > 0;
  const affichees = !avecFiltres || filtre === 'toutes' ? triees : filtre === 'en_cours' ? enCours : traitees;
  const filtres: { id: typeof filtre; label: string; n: number }[] = [
    { id: 'toutes', label: 'Toutes', n: triees.length },
    { id: 'en_cours', label: 'En cours', n: enCours.length },
    { id: 'traitees', label: 'Traitées', n: traitees.length },
  ];

  return (
    <div className="space-y-4">
      {avecFiltres && (
        <div className="flex gap-1 p-1 bg-white border border-stone-200 rounded-2xl sm:inline-flex" role="group" aria-label="Filtrer mes demandes">
          {filtres.map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtre === f.id}
              onClick={() => setFiltre(f.id)}
              className={cn(
                'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all',
                filtre === f.id
                  ? 'bg-[#c4a062] text-stone-900 shadow-md shadow-[#c4a062]/20'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50',
              )}
            >
              {f.label}
              <span className={cn('px-1.5 py-0.5 rounded-full text-[9px]', filtre === f.id ? 'bg-stone-900/10 text-stone-900' : 'bg-stone-100 text-stone-600')}>{f.n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {affichees.map(d => <CarteDemande key={d.id} d={d} parId={parId} />)}
      </div>
    </div>
  );
}
