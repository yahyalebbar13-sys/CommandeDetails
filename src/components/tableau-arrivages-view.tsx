"use client";

// ─── Tableau des arrivages ────────────────────────────────────────────────────
// Tous les dossiers d'arrivage sur une page, une ligne chacun, avec ce qui compte :
// transport, dates, volumes, valeurs, frais, coûts, contrôles. Chaque case que
// « Paramétrer le dossier » sait modifier se modifie ici d'un clic, avec les
// mêmes suites (lib/edition-dossier.ts) : transitaire de la société, suivi du
// conteneur sur un nouveau BL, clients prévenus quand leur statut change — le
// tableau demande seulement confirmation avant d'écrire aux clients, parce
// qu'une case se modifie plus vite qu'un formulaire ne s'enregistre.
// Les règles pures (lignes, recherche, filtres, tri, totaux) : lib/tableau-arrivages.ts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Check, ChevronRight, Columns3,
  ExternalLink, LayoutGrid, Mail, Pencil, Plus, Radar, Search, TableProperties, X,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRelectureConteneurs } from '@/hooks/use-relecture-conteneurs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddFactureModal from './add-facture-modal';
import { CHECK_ITEMS } from './dossier-checklist-modal';
import { getTrackingInfo } from './factures-view';
import { STATUS_MAP, type EffectiveStatus } from '@/lib/status-utils';
import {
  LIBELLE_STATUT, aujourdHui, dateArriveeDuSuivi, dossierVerrouille, normaliserReference, referenceValide,
  type StatutSuivi,
} from '@/lib/suivi-conteneur';
import {
  SOCIETES_DECLARANTES, articlesAPrevenir, notifierClientsDates, ouvrirSuiviEnFond,
  statutPourLesClients, transitaireDeLaSociete, type DatesDossier,
} from '@/lib/edition-dossier';
import {
  ANOMALIES, FILTRES_VIDES, NON_RENSEIGNE, construireLignes, filtrerLignes, jourCourt, joursJusqua,
  lireNombre, totaliser, trierLignes, valeursDistinctes,
  type FiltresArrivages, type LigneArrivage, type Sens, type StatutFiltre, type TotauxArrivages,
} from '@/lib/tableau-arrivages';

// ─── Colonnes ─────────────────────────────────────────────────────────────────
type Suite = 'suivante' | 'precedente';
type ChampTexte = 'noBL' | 'supplierId' | 'shippingLine' | 'forwarder';
type ChampNombre = 'freightCost' | 'declaredValue' | 'invoicePaidDhs' | 'exchangeInvoiceAmount' | 'supplierInvoiceAmount' | 'additionalCostsAmount';
type ChampDate = 'forwarderGivenDate' | 'shippingDate' | 'arrivalDate' | 'stockEntryDate';
type Saisie =
  | { type: 'texte'; champ: ChampTexte; liste?: string }
  | { type: 'nombre'; champ: ChampNombre }
  | { type: 'date'; champ: ChampDate };

type Groupe = 'dossier' | 'transport' | 'dates' | 'volumes' | 'valeurs' | 'frais' | 'couts' | 'controle';

const GROUPES: Record<Groupe, { titre: string; ton: string }> = {
  dossier:   { titre: 'Dossier',     ton: 'text-stone-500 border-stone-300' },
  transport: { titre: 'Transport',   ton: 'text-sky-700 border-sky-300' },
  dates:     { titre: 'Dates',       ton: 'text-violet-700 border-violet-300' },
  volumes:   { titre: 'Volumes',     ton: 'text-emerald-700 border-emerald-300' },
  valeurs:   { titre: 'Valeurs ($)', ton: 'text-amber-700 border-amber-300' },
  frais:     { titre: 'Frais (MAD)', ton: 'text-rose-700 border-rose-300' },
  couts:     { titre: 'Coûts (MAD)', ton: 'text-indigo-700 border-indigo-300' },
  controle:  { titre: 'Contrôle',    ton: 'text-teal-700 border-teal-300' },
};

type Contexte = {
  aujourdhui: string;
  enregistrerSociete: (l: LigneArrivage, societe: string) => void;
  basculerVerification: (l: LigneArrivage, cle: string) => void;
};

type Colonne = {
  cle: string;
  groupe: Groupe;
  titre: string;
  /** Bulle d'aide de l'en-tête. */
  aide?: string;
  largeur: number;
  droite?: boolean;
  /** Colonne de texte : le premier clic trie de A à Z (sinon du plus grand au plus petit). */
  texte?: boolean;
  tri: (l: LigneArrivage) => number | string | null | undefined;
  /** La case se modifie par une saisie. */
  saisie?: Saisie;
  /** La case se modifie autrement (liste, pastilles) : seul l'en-tête le signale. */
  modifiable?: boolean;
  /** Raison pour laquelle la case ne se modifie pas sur cette ligne. */
  verrou?: (l: LigneArrivage) => string | undefined;
  rendu: (l: LigneArrivage, ctx: Contexte) => React.ReactNode;
  /** Bouton à côté de la valeur, hors de la zone qui ouvre la saisie. */
  action?: (l: LigneArrivage) => React.ReactNode;
  total?: (t: TotauxArrivages) => React.ReactNode;
};

const format = (decimales: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales });
const F0 = format(0);
const F2 = format(2);
const F3 = format(3);
const F4 = format(4);
const vide = <span className="text-stone-300">—</span>;
const nombre = (n: number, f: Intl.NumberFormat = F0) => (n ? f.format(n) : vide);

function valeurNombre(f: any, champ: ChampNombre): number {
  // Les plus anciens dossiers rangent le fret dans `freight`.
  if (champ === 'freightCost') return Number(f.freightCost) || Number(f.freight) || 0;
  return Number(f[champ]) || 0;
}

function valeurTexte(f: any, champ: ChampTexte): string {
  if (champ === 'supplierId') return String(f.supplierId || f.supplier || '');
  return String(f[champ] || '');
}

function saisieInitiale(f: any, s: Saisie): string {
  if (s.type === 'nombre') {
    const n = valeurNombre(f, s.champ);
    return n ? String(n).replace('.', ',') : '';
  }
  if (s.type === 'texte') return valeurTexte(f, s.champ);
  return String(f[s.champ] || '');
}

const datesDe = (f: any): DatesDossier => ({ arrivalDate: f.arrivalDate || null, stockEntryDate: f.stockEntryDate || null });

const libelleStatut = (s: EffectiveStatus) => `${STATUS_MAP[s].emoji} ${STATUS_MAP[s].label}`;

/** La date d'arrivée suit-elle ShipsGo ? Alors la compagnie la réécrit à chaque lecture. */
function dateSuivie(l: LigneArrivage): boolean {
  const suivi = l.facture.suivi;
  return Boolean(suivi?.shipmentId) && !dossierVerrouille(l.facture) && Boolean(dateArriveeDuSuivi(suivi));
}

const ORDRE_STATUT: Partial<Record<EffectiveStatus, number>> = { SHIPPED: 1, TRANSIT: 1, CUSTOMS: 2, STOCK: 3 };

const montant = (
  cle: ChampNombre, groupe: Groupe, titre: string, largeur: number, f: Intl.NumberFormat,
  total: (t: TotauxArrivages) => number, aide?: string,
): Colonne => ({
  cle, groupe, titre, largeur, aide, droite: true,
  saisie: { type: 'nombre', champ: cle },
  tri: l => valeurNombre(l.facture, cle) || null,
  rendu: l => nombre(valeurNombre(l.facture, cle), f),
  total: t => nombre(total(t), f),
});

const calcul = (
  cle: string, groupe: Groupe, titre: string, largeur: number, valeur: (l: LigneArrivage) => number,
  f: Intl.NumberFormat, total?: (t: TotauxArrivages) => number, aide?: string,
): Colonne => ({
  cle, groupe, titre, largeur, aide, droite: true,
  tri: l => valeur(l) || null,
  rendu: l => nombre(valeur(l), f),
  total: total ? (t => nombre(total(t), f)) : undefined,
});

const COLONNES: Colonne[] = [
  // ── Dossier
  {
    cle: 'statut', groupe: 'dossier', titre: 'Statut', largeur: 150,
    aide: "Calculé sur les dates : en transit avant l'arrivée, en dédouanement après, en stock à l'entrée. Dessous : où est le conteneur chez la compagnie.",
    tri: l => ORDRE_STATUT[l.statut] ?? 0,
    rendu: l => <Statut ligne={l} />,
  },
  {
    cle: 'supplierId', groupe: 'dossier', titre: 'Fournisseur', largeur: 110, texte: true,
    saisie: { type: 'texte', champ: 'supplierId', liste: 'ta-fournisseurs' },
    tri: l => valeurTexte(l.facture, 'supplierId') || null,
    rendu: l => valeurTexte(l.facture, 'supplierId') ? <span className="font-black uppercase">{valeurTexte(l.facture, 'supplierId')}</span> : vide,
  },
  {
    cle: 'declaringCompany', groupe: 'dossier', titre: 'Société', largeur: 150, texte: true, modifiable: true,
    aide: 'Société déclarante. La choisir remet son transitaire attitré, comme dans « Paramétrer le dossier ».',
    tri: l => l.facture.declaringCompany || null,
    rendu: (l, ctx) => <ChoixSociete valeur={l.facture.declaringCompany || ''} onChoisir={v => ctx.enregistrerSociete(l, v)} />,
  },
  {
    cle: 'contenu', groupe: 'dossier', titre: 'Contenu', largeur: 200, texte: true,
    aide: 'Articles du dossier et leurs catégories. La flèche à gauche du n° de dossier les déplie.',
    tri: l => l.itemsCount || null,
    rendu: l => l.itemsCount === 0
      ? <span className="font-bold text-orange-600">aucun article</span>
      : (
        <div className="leading-tight max-w-[210px]" title={l.categories.map(c => `${c.nom} × ${c.nombre}`).join('\n')}>
          <span className="font-black text-stone-800">{l.itemsCount} article{l.itemsCount > 1 ? 's' : ''}</span>
          <span className="block truncate text-[10px] text-stone-500 uppercase">
            {l.categories.slice(0, 2).map(c => c.nom).join(' · ')}
            {l.categories.length > 2 ? ` · +${l.categories.length - 2}` : ''}
          </span>
        </div>
      ),
    total: t => `${F0.format(t.articles)} art.`,
  },
  {
    cle: 'clients', groupe: 'dossier', titre: 'Clients', largeur: 150, texte: true,
    aide: 'Clients dont une précommande voyage dans ce dossier.',
    tri: l => l.clients.join(', ') || null,
    rendu: l => l.clients.length ? (
      <span className="block truncate max-w-[150px] font-bold text-indigo-700" title={l.clients.join('\n')}>
        {l.clients.slice(0, 2).join(', ')}{l.clients.length > 2 ? ` +${l.clients.length - 2}` : ''}
      </span>
    ) : vide,
  },
  // ── Transport
  {
    cle: 'noBL', groupe: 'transport', titre: 'N° BL', largeur: 175, texte: true,
    aide: "Connaissement. Un nouveau n° ouvre le suivi du conteneur chez la compagnie (1 crédit ShipsGo), seulement si la marchandise est encore attendue.",
    saisie: { type: 'texte', champ: 'noBL' },
    tri: l => l.facture.noBL || null,
    rendu: l => l.facture.noBL ? <span className="font-mono font-bold text-stone-800">{l.facture.noBL}</span> : vide,
    action: l => l.facture.noBL ? <LienSuivi noBL={l.facture.noBL} compagnie={l.facture.shippingLine} /> : null,
  },
  {
    cle: 'shippingLine', groupe: 'transport', titre: 'Compagnie', largeur: 110, texte: true,
    saisie: { type: 'texte', champ: 'shippingLine', liste: 'ta-compagnies' },
    tri: l => l.facture.shippingLine || null,
    rendu: l => l.facture.shippingLine ? <span className="font-bold uppercase">{l.facture.shippingLine}</span> : vide,
  },
  {
    cle: 'forwarder', groupe: 'transport', titre: 'Transitaire', largeur: 175, texte: true,
    saisie: { type: 'texte', champ: 'forwarder', liste: 'ta-transitaires' },
    tri: l => l.facture.forwarder || null,
    rendu: l => l.facture.forwarder ? <span className="font-bold uppercase">{l.facture.forwarder}</span> : vide,
  },
  {
    cle: 'forwarderGivenDate', groupe: 'transport', titre: 'Remis au transit.', largeur: 115,
    aide: 'Date de remise du dossier au transitaire.',
    saisie: { type: 'date', champ: 'forwarderGivenDate' },
    tri: l => l.facture.forwarderGivenDate || null,
    rendu: l => l.facture.forwarderGivenDate ? <span className="font-bold tabular-nums">{jourCourt(l.facture.forwarderGivenDate) || l.facture.forwarderGivenDate}</span> : vide,
  },
  // ── Dates
  {
    cle: 'shippingDate', groupe: 'dates', titre: 'Départ (ETD)', largeur: 105,
    saisie: { type: 'date', champ: 'shippingDate' },
    tri: l => l.facture.shippingDate || null,
    rendu: l => l.facture.shippingDate ? <span className="font-bold tabular-nums">{jourCourt(l.facture.shippingDate) || l.facture.shippingDate}</span> : vide,
  },
  {
    cle: 'arrivalDate', groupe: 'dates', titre: 'Arrivée (ETA)', largeur: 120,
    aide: "Arrivée au port. Tant que le conteneur est suivi et en route, c'est la compagnie (ShipsGo) qui la donne.",
    saisie: { type: 'date', champ: 'arrivalDate' },
    verrou: l => dateSuivie(l)
      ? "Date donnée par la compagnie maritime (ShipsGo) : elle se met à jour toute seule tant que le conteneur est en route."
      : undefined,
    tri: l => l.facture.arrivalDate || null,
    rendu: (l, ctx) => (
      <JourAvecDelai
        iso={l.facture.arrivalDate}
        aujourdhui={ctx.aujourdhui}
        delai={l.statut !== 'STOCK'}
        suivie={dateSuivie(l)}
      />
    ),
  },
  {
    cle: 'stockEntryDate', groupe: 'dates', titre: 'Entrée stock', largeur: 110,
    aide: "Date d'entrée en stock : le dossier passe « en stock » ce jour-là.",
    saisie: { type: 'date', champ: 'stockEntryDate' },
    tri: l => l.facture.stockEntryDate || null,
    rendu: l => l.facture.stockEntryDate
      ? <span className="font-bold tabular-nums">{jourCourt(l.facture.stockEntryDate) || l.facture.stockEntryDate}</span>
      : l.statut === 'STOCK'
        ? <span className="italic text-stone-400" title="En stock sans date : validé dans /stock, ou arrivé il y a plus d'un mois.">historique</span>
        : vide,
  },
  // ── Volumes
  calcul('cbm', 'volumes', 'CBM', 80, l => l.cbm, F2, t => t.cbm, 'Σ des volumes des articles.'),
  calcul('netWeight', 'volumes', 'Poids net kg', 100, l => l.netWeight, F0, t => t.netWeight, 'Σ des poids nets des articles.'),
  // ── Valeurs ($)
  calcul('itemsVal', 'valeurs', 'Marchandise', 110, l => l.itemsVal, F2, t => t.itemsVal, 'Σ quantité × prix d\'achat des articles.'),
  montant('freightCost', 'valeurs', 'Fret', 95, F2, t => t.freight),
  calcul('realFactureValue', 'valeurs', 'Facture réelle', 115, l => l.realFactureValue, F2, t => t.realFactureValue, 'Marchandise + fret.'),
  montant('declaredValue', 'valeurs', 'Valeur déclarée', 120, F2, t => t.declaredValue, 'Valeur déclarée en douane.'),
  {
    ...calcul('efficiency', 'valeurs', 'Fret / m³', 90, l => l.efficiency, F0, undefined, 'Fret ÷ CBM.'),
    total: t => nombre(t.efficience, F0),
  },
  // ── Frais (MAD)
  montant('invoicePaidDhs', 'frais', 'Facture payée', 120, F0, t => t.invoicePaidDhs),
  {
    ...calcul('tauxChange', 'frais', 'Taux MAD/$', 95, l => l.tauxChange, F4, undefined, 'Facture payée ÷ valeur déclarée.'),
    total: t => nombre(t.tauxMoyen, F4),
  },
  montant('exchangeInvoiceAmount', 'frais', 'Fact. échange', 115, F0, t => t.exchange, "Facture d'échange."),
  montant('supplierInvoiceAmount', 'frais', 'Fact. transitaire', 125, F0, t => t.transit),
  montant('additionalCostsAmount', 'frais', 'Frais supp.', 105, F0, t => t.fraisSupp),
  calcul('droits', 'frais', 'Droits payés', 115, l => l.droits, F0, t => t.droits, 'Σ DI + TPI + TIC + TVA des articles, comme sur la fiche du dossier.'),
  // ── Coûts (MAD)
  calcul('revient', 'couts', 'Coût revient TTC', 125, l => l.revient, F0, t => t.revient, 'Comme sur la carte du dossier.'),
  {
    cle: 'vente', groupe: 'couts', titre: 'Coût vente TTC', largeur: 120, droite: true,
    aide: 'Calculé une fois la DP remplie.',
    tri: l => (l.hasDp && l.vente > 0 ? l.vente : null),
    rendu: l => (l.hasDp && l.vente > 0 ? <span className="font-bold text-sky-700">{F0.format(l.vente)}</span> : vide),
    total: t => nombre(t.vente, F0),
  },
  {
    cle: 'ecart', groupe: 'couts', titre: 'Différence', largeur: 105, droite: true,
    aide: 'Coût de revient − coût de vente, quand la DP est remplie.',
    tri: l => (l.hasDp && l.vente > 0 ? l.revient - l.vente : null),
    rendu: l => {
      if (!(l.hasDp && l.vente > 0)) return vide;
      const d = l.revient - l.vente;
      return <span className={`font-black ${d >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d >= 0 ? '+' : ''}{F0.format(d)}</span>;
    },
    total: t => (t.vente ? <span className={t.ecart >= 0 ? 'text-emerald-300' : 'text-red-300'}>{t.ecart >= 0 ? '+' : ''}{F0.format(t.ecart)}</span> : null),
  },
  // ── Contrôle
  {
    cle: 'dp', groupe: 'controle', titre: 'DP', largeur: 95,
    aide: 'Déclaration provisoire : prix unitaires saisis dans Finance → Déc. Prov.',
    tri: l => (l.hasDp ? 1 : 0),
    rendu: l => (l.hasDp
      ? <span className="font-black text-emerald-700">✓ remplie</span>
      : <span className="font-bold text-amber-600">à remplir</span>),
  },
  {
    cle: 'verification', groupe: 'controle', titre: 'Vérification', largeur: 170, modifiable: true,
    aide: 'Les 4 contrôles de « Vérifier le dossier ». Un clic sur une pastille la coche ou la décoche ; les 4 cochées débloquent le Coût de Vente.',
    tri: l => CHECK_ITEMS.filter(c => l.verifications[c.id]).length,
    rendu: (l, ctx) => <Verifications ligne={l} onBasculer={cle => ctx.basculerVerification(l, cle)} />,
  },
];

const ORDRE_GROUPES: Groupe[] = ['dossier', 'transport', 'dates', 'volumes', 'valeurs', 'frais', 'couts', 'controle'];

const STATUTS: { cle: StatutFiltre; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'transit', libelle: '🚢 En transit' },
  { cle: 'douane', libelle: '🛃 Dédouanement' },
  { cle: 'stock', libelle: '✅ En stock' },
];

const CLE_COLONNES_MASQUEES = 'lebtex.tableauArrivages.colonnesMasquees';
const TOUS = '__tous__';

// ─── Écran ────────────────────────────────────────────────────────────────────
interface TableauArrivagesViewProps {
  /** Le tableau est-il à l'écran ? Il reste monté, caché, quand on change d'onglet. */
  actif: boolean;
  articles: any[];
  factures: any[];
  subCategories: any[];
  onOuvrirDossier: (factureId: string) => void;
  onModifierArticle: (article: any) => void;
  onVueCartes: () => void;
}

type Confirmation = { id: string; champ: 'arrivalDate' | 'stockEntryDate'; valeur: string };

export default function TableauArrivagesView({
  actif, articles, factures, subCategories, onOuvrirDossier, onModifierArticle, onVueCartes,
}: TableauArrivagesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  useRelectureConteneurs(actif);

  // DP et vérifications ne se chargent qu'à la première ouverture du tableau.
  const [ouvert, setOuvert] = useState(actif);
  useEffect(() => { if (actif) setOuvert(true); }, [actif]);
  const declarationsRef = useMemoFirebase(
    () => (!firestore || !user || !ouvert) ? null : collection(firestore, 'users', user.uid, 'dp_declarations'),
    [firestore, user, ouvert],
  );
  const verificationsRef = useMemoFirebase(
    () => (!firestore || !user || !ouvert) ? null : collection(firestore, 'users', user.uid, 'checklists'),
    [firestore, user, ouvert],
  );
  const { data: declarationsDocs } = useCollection(declarationsRef);
  const { data: verificationsDocs } = useCollection(verificationsRef);

  const lignes = useMemo(() => {
    const declarations: Record<string, { puMap?: Record<string, string>; overrides?: Record<string, any> }> = {};
    for (const d of (declarationsDocs || []) as any[]) declarations[d.id] = { puMap: d.puMap, overrides: d.overrides };
    const verifications: Record<string, Record<string, boolean>> = {};
    for (const d of (verificationsDocs || []) as any[]) verifications[d.id] = d.checks || {};
    return construireLignes({ factures, articles, subCategories, declarations, verifications });
  }, [factures, articles, subCategories, declarationsDocs, verificationsDocs]);

  // ── Filtres, tri, colonnes ────────────────────────────────────────────────
  const [filtres, setFiltres] = useState<FiltresArrivages>(FILTRES_VIDES);
  const majFiltres = (p: Partial<FiltresArrivages>) => setFiltres(f => ({ ...f, ...p }));
  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);
  const [tri, setTri] = useState<{ cle: string; sens: Sens }>({ cle: 'arrivalDate', sens: 'desc' });

  const [masquees, setMasquees] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_COLONNES_MASQUEES);
      if (brut) setMasquees(new Set(JSON.parse(brut)));
    } catch { /* navigateur sans stockage : toutes les colonnes */ }
  }, []);
  const memoriserColonnes = (s: Set<string>) => {
    setMasquees(s);
    try { localStorage.setItem(CLE_COLONNES_MASQUEES, JSON.stringify([...s])); } catch { /* sans stockage */ }
  };
  const basculerColonne = (cle: string) => {
    const s = new Set(masquees);
    if (s.has(cle)) s.delete(cle); else s.add(cle);
    memoriserColonnes(s);
  };
  const colonnesVisibles = COLONNES.filter(c => !masquees.has(c.cle));
  const colonnesSaisissables = colonnesVisibles.filter(c => c.saisie);
  const debutsDeGroupe = new Set(colonnesVisibles.filter((c, i) => i === 0 || colonnesVisibles[i - 1].groupe !== c.groupe).map(c => c.cle));
  const groupesVisibles: { groupe: Groupe; n: number }[] = [];
  for (const c of colonnesVisibles) {
    const dernier = groupesVisibles[groupesVisibles.length - 1];
    if (dernier?.groupe === c.groupe) dernier.n++;
    else groupesVisibles.push({ groupe: c.groupe, n: 1 });
  }

  const attendues = useMemo(() => CHECK_ITEMS.map(c => c.id), []);
  const lignesFiltrees = useMemo(() => filtrerLignes(lignes, filtres, attendues), [lignes, filtres, attendues]);
  const lignesAffichees = useMemo(() => {
    const valeur = tri.cle === 'id'
      ? (l: LigneArrivage) => l.id
      : COLONNES.find(c => c.cle === tri.cle)?.tri;
    return valeur ? trierLignes(lignesFiltrees, valeur, tri.sens) : lignesFiltrees;
  }, [lignesFiltrees, tri]);
  const totaux = useMemo(() => totaliser(lignesFiltrees), [lignesFiltrees]);

  // Compteurs des pastilles : ce que donnerait le filtre, les autres restant posés.
  const comptesStatut = useMemo(() => {
    const base = filtrerLignes(lignes, { ...filtres, statut: 'tous' }, attendues);
    return {
      tous: base.length,
      transit: base.filter(l => l.statut === 'TRANSIT' || l.statut === 'SHIPPED').length,
      douane: base.filter(l => l.statut === 'CUSTOMS').length,
      stock: base.filter(l => l.statut === 'STOCK').length,
    } as Record<StatutFiltre, number>;
  }, [lignes, filtres, attendues]);
  const comptesAnomalies = useMemo(() => {
    const base = filtrerLignes(lignes, { ...filtres, anomalie: '' }, attendues);
    return Object.fromEntries(ANOMALIES.map(a => [a.cle, base.filter(l => a.test(l, attendues)).length])) as Record<string, number>;
  }, [lignes, filtres, attendues]);

  const options = useMemo(() => ({
    fournisseurs: valeursDistinctes(factures, f => f.supplierId || f.supplier),
    societes: valeursDistinctes(factures, f => f.declaringCompany),
    transitaires: valeursDistinctes(factures, f => f.forwarder),
    compagnies: valeursDistinctes(factures, f => f.shippingLine),
  }), [factures]);

  // Références portées par des articles sans dossier déclaré.
  const orphelins = useMemo(() => {
    const declares = new Set(factures.map(f => f.id));
    return [...new Set(articles.map(a => a.factureId).filter(Boolean))].filter(id => !declares.has(id)) as string[];
  }, [factures, articles]);

  const trierPar = (cle: string) => setTri(t => {
    if (t.cle === cle) return { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' };
    const texte = cle === 'id' || COLONNES.find(c => c.cle === cle)?.texte;
    return { cle, sens: texte ? 'asc' : 'desc' };
  });

  // ── Mesures pour les éléments collants ────────────────────────────────────
  const zone = useRef<HTMLDivElement>(null);
  const ligneGroupes = useRef<HTMLTableRowElement>(null);
  const [largeurVisible, setLargeurVisible] = useState(0);
  const [hauteurGroupes, setHauteurGroupes] = useState(28);
  useEffect(() => {
    const el = zone.current;
    const entete = ligneGroupes.current;
    if (!el || !entete) return;
    const mesurer = () => {
      setLargeurVisible(el.clientWidth);
      setHauteurGroupes(entete.getBoundingClientRect().height || 28);
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    observateur.observe(entete);
    return () => observateur.disconnect();
  }, []);

  // ── Modification ──────────────────────────────────────────────────────────
  const [enEdition, setEnEdition] = useState<{ id: string; cle: string } | null>(null);
  const [recents, setRecents] = useState<Record<string, true>>({});
  const [deplies, setDeplies] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [fenetre, setFenetre] = useState<{ ouverte: boolean; facture: any | null }>({ ouverte: false, facture: null });

  const signalerEnregistre = (id: string, cle: string) => {
    const k = `${id}:${cle}`;
    setRecents(r => ({ ...r, [k]: true }));
    window.setTimeout(() => setRecents(r => {
      const { [k]: _, ...reste } = r;
      return reste;
    }), 1400);
  };

  const ecrire = (l: LigneArrivage, maj: Record<string, unknown>, cle: string) => {
    if (!user || !firestore) return;
    updateDoc(doc(firestore, 'users', user.uid, 'factures', l.id), { ...maj, updatedAt: serverTimestamp() })
      .then(() => signalerEnregistre(l.id, cle))
      .catch((e: any) => toast({
        variant: 'destructive',
        title: 'Modification non enregistrée',
        description: `${l.id} : ${e?.message || e}`,
      }));
  };

  /** Tab / Maj+Tab : la case modifiable suivante, sur la ligne puis la suivante. */
  const passer = (id: string, cle: string, suite?: Suite) => {
    if (!suite) { setEnEdition(null); return; }
    const pas = suite === 'suivante' ? 1 : -1;
    let r = lignesAffichees.findIndex(l => l.id === id);
    let c = colonnesSaisissables.findIndex(col => col.cle === cle);
    if (r < 0 || c < 0) { setEnEdition(null); return; }
    for (let essai = 0; essai < colonnesSaisissables.length * 3; essai++) {
      c += pas;
      if (c >= colonnesSaisissables.length) { c = 0; r += 1; }
      if (c < 0) { c = colonnesSaisissables.length - 1; r -= 1; }
      const l = lignesAffichees[r];
      if (!l) break;
      const col = colonnesSaisissables[c];
      if (!col.verrou?.(l)) { setEnEdition({ id: l.id, cle: col.cle }); return; }
    }
    setEnEdition(null);
  };

  const ecrireDate = (l: LigneArrivage, champ: ChampDate, valeur: string, prevenir: boolean) => {
    const maj: Record<string, unknown> = { [champ]: valeur };
    // Horodate la saisie de l'entrée en stock : /stock liste les arrivages saisis depuis moins de 7 jours.
    if (champ === 'stockEntryDate' && valeur) maj.stockEntryDateSetAt = serverTimestamp();
    const avant = datesDe(l.facture);
    const apres: DatesDossier = { ...avant, [champ]: valeur || null };
    const statutChange = (champ === 'arrivalDate' || champ === 'stockEntryDate')
      && articlesAPrevenir(l.articles, avant, apres).length > 0;
    // Prévenus ou non, c'est décidé : la notification automatique ne repasse pas derrière.
    if (statutChange) maj.lastNotifiedStatus = statutPourLesClients(apres);
    ecrire(l, maj, champ);
    if (statutChange && prevenir && user && firestore) {
      const n = notifierClientsDates({ firestore, adminUid: user.uid, articles: l.articles, avant, apres, noBL: l.facture.noBL });
      toast({
        title: `✉️ ${n} client${n > 1 ? 's' : ''} prévenu${n > 1 ? 's' : ''}`,
        description: `${l.id} : ${libelleStatut(statutPourLesClients(avant))} → ${libelleStatut(statutPourLesClients(apres))}.`,
      });
    }
  };

  const valider = (l: LigneArrivage, c: Colonne, brut: string, suite?: Suite) => {
    const s = c.saisie;
    if (!s) return;
    const f = l.facture;
    const suivante = () => passer(l.id, c.cle, suite);

    if (s.type === 'nombre') {
      const n = lireNombre(brut);
      if (n === null) {
        setEnEdition(null);
        toast({ variant: 'destructive', title: 'Montant illisible', description: `« ${brut} » : tapez un nombre positif, par exemple 12 500,50.` });
        return;
      }
      if (n !== valeurNombre(f, s.champ)) ecrire(l, { [s.champ]: n }, c.cle);
      suivante();
      return;
    }

    if (s.type === 'texte') {
      const v = brut.toUpperCase().trim();
      if (v !== valeurTexte(f, s.champ).toUpperCase().trim()) {
        ecrire(l, { [s.champ]: v }, c.cle);
        // Nouveau connaissement : même règle que « Paramétrer le dossier », le serveur
        // n'ouvre le suivi (et ne dépense le crédit) que si la marchandise est attendue.
        if (s.champ === 'noBL') {
          const bl = normaliserReference(v);
          if (bl && referenceValide(bl) && bl !== normaliserReference(f.noBL || '')) ouvrirSuiviEnFond(l.id, bl, toast);
        }
      }
      suivante();
      return;
    }

    const v = brut.trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      setEnEdition(null);
      toast({ variant: 'destructive', title: 'Date illisible', description: `« ${brut} »` });
      return;
    }
    if (s.champ === 'arrivalDate' && !v) {
      setEnEdition(null);
      toast({ variant: 'destructive', title: "La date d'arrivée est obligatoire", description: 'Elle décide du statut du dossier : en transit, en dédouanement, en stock.' });
      return;
    }
    if (v === String(f[s.champ] || '')) { suivante(); return; }
    if (s.champ === 'arrivalDate' || s.champ === 'stockEntryDate') {
      const avant = datesDe(f);
      if (articlesAPrevenir(l.articles, avant, { ...avant, [s.champ]: v || null }).length > 0) {
        setEnEdition(null);
        setConfirmation({ id: l.id, champ: s.champ, valeur: v });
        return;
      }
    }
    ecrireDate(l, s.champ, v, false);
    suivante();
  };

  // Relu au moment de confirmer : entre-temps, ShipsGo a pu changer une date.
  const aConfirmer = useMemo(() => {
    if (!confirmation) return null;
    const l = lignes.find(x => x.id === confirmation.id);
    if (!l) return null;
    const avant = datesDe(l.facture);
    const apres = { ...avant, [confirmation.champ]: confirmation.valeur || null };
    return { l, avant, apres, destinataires: articlesAPrevenir(l.articles, avant, apres) };
  }, [confirmation, lignes]);

  const confirmer = (prevenir: boolean) => {
    if (confirmation && aConfirmer) ecrireDate(aConfirmer.l, confirmation.champ, confirmation.valeur, prevenir);
    setConfirmation(null);
  };

  const enregistrerSociete = (l: LigneArrivage, societe: string) => {
    const f = l.facture;
    if (societe === (f.declaringCompany || '')) return;
    const maj: Record<string, unknown> = { declaringCompany: societe };
    const transitaire = transitaireDeLaSociete(societe);
    if (transitaire && transitaire !== (f.forwarder || '')) maj.forwarder = transitaire;
    ecrire(l, maj, 'declaringCompany');
    if (maj.forwarder) {
      signalerEnregistre(l.id, 'forwarder');
      toast({ title: 'Transitaire mis à jour', description: `${l.id} : ${transitaire}, transitaire de ${societe}.` });
    }
  };

  const basculerVerification = (l: LigneArrivage, cle: string) => {
    if (!user || !firestore) return;
    setDoc(
      doc(firestore, 'users', user.uid, 'checklists', l.id),
      { checks: { [cle]: !l.verifications[cle] }, savedAt: new Date().toISOString(), factureId: l.id },
      { merge: true },
    )
      .then(() => signalerEnregistre(l.id, 'verification'))
      .catch((e: any) => toast({ variant: 'destructive', title: 'Vérification non enregistrée', description: `${l.id} : ${e?.message || e}` }));
  };

  const deplier = (id: string) => setDeplies(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const regulariser = (id: string) => {
    const exemple = articles.find(a => a.factureId === id);
    setFenetre({
      ouverte: true,
      facture: { id, arrivalDate: exemple?.arrivalDate || '', supplierId: exemple?.supplierId || '', isOrphaned: true },
    });
  };

  const ctx: Contexte = { aujourdhui: aujourdHui(), enregistrerSociete, basculerVerification };
  const nbColonnes = colonnesVisibles.length + 1;

  return (
    <div className="space-y-4 fade-in">
      {/* ── En-tête : titre, recherche, filtres ── */}
      <header className="bg-white rounded-[1.5rem] border border-stone-200 shadow-sm p-4 lg:p-5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-stone-900 rounded-xl shadow-md shrink-0">
              <TableProperties className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-black text-stone-900 uppercase tracking-tighter leading-none">Tableau des arrivages</h1>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.15em] mt-1.5">
                {lignes.length} dossiers · un clic sur une case pour la modifier
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] xl:w-[400px] xl:flex-none">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
              <Input
                value={filtres.recherche}
                onChange={e => majFiltres({ recherche: e.target.value })}
                placeholder="Dossier, BL, fournisseur, client, article, conteneur…"
                className="pl-9 pr-9 h-10 bg-stone-50 border-stone-200 rounded-xl text-xs font-bold"
              />
              {filtres.recherche && (
                <button
                  type="button"
                  onClick={() => majFiltres({ recherche: '' })}
                  title="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-stone-400 hover:text-stone-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl border-stone-200 text-[10px] font-black uppercase tracking-widest gap-2">
                  <Columns3 className="w-4 h-4" /> Colonnes
                  {masquees.size > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 text-[9px] tabular-nums">
                      {COLONNES.length - masquees.size}/{COLONNES.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 max-h-[70vh] overflow-y-auto rounded-xl">
                {ORDRE_GROUPES.map(g => (
                  <React.Fragment key={g}>
                    <DropdownMenuLabel className={`text-[9px] font-black uppercase tracking-widest ${GROUPES[g].ton.split(' ')[0]}`}>
                      {GROUPES[g].titre}
                    </DropdownMenuLabel>
                    {COLONNES.filter(c => c.groupe === g).map(c => (
                      <DropdownMenuCheckboxItem
                        key={c.cle}
                        checked={!masquees.has(c.cle)}
                        onCheckedChange={() => basculerColonne(c.cle)}
                        onSelect={e => e.preventDefault()}
                        className="text-xs font-bold"
                      >
                        {c.titre}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </React.Fragment>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => memoriserColonnes(new Set())} className="text-xs font-black">
                  Tout afficher
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={onVueCartes} className="h-10 rounded-xl border-stone-200 text-[10px] font-black uppercase tracking-widest gap-2">
              <LayoutGrid className="w-4 h-4" /> Cartes
            </Button>
            <Button
              onClick={() => setFenetre({ ouverte: true, facture: null })}
              className="h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest gap-2 shadow-md shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" /> Nouveau dossier
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-0.5">
            {STATUTS.map(s => (
              <button
                key={s.cle}
                type="button"
                onClick={() => majFiltres({ statut: s.cle })}
                className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors ${
                  filtres.statut === s.cle ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {s.libelle} <span className="ml-1 tabular-nums opacity-50">{comptesStatut[s.cle]}</span>
              </button>
            ))}
          </div>
          <FiltreListe libelle="Fournisseur" valeur={filtres.fournisseur} options={options.fournisseurs} onChange={v => majFiltres({ fournisseur: v })} />
          <FiltreListe libelle="Société" valeur={filtres.societe} options={options.societes} onChange={v => majFiltres({ societe: v })} />
          <FiltreListe libelle="Transitaire" valeur={filtres.transitaire} options={options.transitaires} onChange={v => majFiltres({ transitaire: v })} />
          <FiltreListe libelle="Compagnie" valeur={filtres.compagnie} options={options.compagnies} onChange={v => majFiltres({ compagnie: v })} />
          <div className={`flex items-center gap-1.5 h-10 px-3 rounded-xl border ${filtres.du || filtres.au ? 'bg-amber-50 border-amber-300' : 'bg-stone-50 border-stone-200'}`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">Arrivée du</span>
            <input
              type="date"
              value={filtres.du}
              onChange={e => majFiltres({ du: e.target.value })}
              className="bg-transparent text-[11px] font-bold text-stone-800 outline-none"
            />
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">au</span>
            <input
              type="date"
              value={filtres.au}
              onChange={e => majFiltres({ au: e.target.value })}
              className="bg-transparent text-[11px] font-bold text-stone-800 outline-none"
            />
          </div>
          {filtresActifs && (
            <Button
              variant="ghost"
              onClick={() => setFiltres(FILTRES_VIDES)}
              className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1.5 text-stone-500 hover:text-red-600 hover:bg-red-50"
            >
              <X className="w-3.5 h-3.5" /> Effacer les filtres
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 mr-1 text-[9px] font-black uppercase tracking-widest text-stone-400">
            <AlertCircle className="w-3 h-3" /> À compléter
          </span>
          {ANOMALIES.map(a => {
            const actif = filtres.anomalie === a.cle;
            const n = comptesAnomalies[a.cle] || 0;
            return (
              <button
                key={a.cle}
                type="button"
                onClick={() => majFiltres({ anomalie: actif ? '' : a.cle })}
                disabled={!n && !actif}
                className={`h-7 px-2.5 rounded-full border text-[10px] font-bold transition-colors ${
                  actif
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : n
                      ? 'bg-white border-stone-200 text-stone-600 hover:border-orange-300 hover:text-orange-700'
                      : 'bg-white border-stone-100 text-stone-300'
                }`}
              >
                {a.libelle} <span className="ml-0.5 tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </header>

      {orphelins.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[11px] font-bold text-amber-900">
            {orphelins.length === 1 ? 'Une référence portée par des articles n\'a pas de dossier :' : `${orphelins.length} références portées par des articles n'ont pas de dossier :`}
          </span>
          {orphelins.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => regulariser(id)}
              className="h-7 px-2.5 rounded-full bg-white border border-amber-300 text-[10px] font-black uppercase text-amber-800 hover:bg-amber-100"
            >
              {id} · régulariser
            </button>
          ))}
        </div>
      )}

      {/* ── Le tableau ── */}
      <div className="bg-white rounded-[1.5rem] border border-stone-200 shadow-xl overflow-hidden">
        <div ref={zone} className="overflow-auto overscroll-contain max-h-[calc(100vh-18rem)] min-h-[22rem]">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[11px] text-stone-700">
            <thead>
              <tr ref={ligneGroupes}>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-40 bg-stone-100 border-b border-r border-stone-200 px-3 pb-2 align-bottom text-left min-w-[170px]"
                >
                  <EnteteTri
                    titre="N° dossier"
                    aide="Un clic sur le n° ouvre le dossier ; la flèche déplie ses articles."
                    actif={tri.cle === 'id'}
                    sens={tri.sens}
                    onTrier={() => trierPar('id')}
                  />
                </th>
                {groupesVisibles.map((g, i) => (
                  <th
                    key={`${g.groupe}-${i}`}
                    colSpan={g.n}
                    className={`sticky top-0 z-20 h-7 bg-stone-100 border-b-2 border-l border-l-stone-200 px-2 text-left text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap ${GROUPES[g.groupe].ton}`}
                  >
                    {GROUPES[g.groupe].titre}
                  </th>
                ))}
              </tr>
              <tr>
                {colonnesVisibles.map(c => (
                  <th
                    key={c.cle}
                    style={{ minWidth: c.largeur, top: hauteurGroupes }}
                    className={`sticky z-20 bg-stone-50 border-b border-stone-200 px-2 py-2 whitespace-nowrap ${c.droite ? 'text-right' : 'text-left'} ${debutsDeGroupe.has(c.cle) ? 'border-l border-l-stone-200' : ''}`}
                  >
                    <EnteteTri
                      titre={c.titre}
                      aide={c.aide}
                      modifiable={Boolean(c.saisie || c.modifiable)}
                      actif={tri.cle === c.cle}
                      sens={tri.sens}
                      onTrier={() => trierPar(c.cle)}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {lignesAffichees.length === 0 && (
                <tr>
                  <td colSpan={nbColonnes} className="py-20">
                    <div className="sticky left-0 text-center" style={{ width: largeurVisible || undefined }}>
                      <p className="text-stone-300 font-black uppercase text-[11px] tracking-[0.2em]">
                        {lignes.length ? 'Aucun dossier ne correspond' : 'Aucun dossier d\'arrivage'}
                      </p>
                      {filtresActifs && (
                        <Button variant="outline" onClick={() => setFiltres(FILTRES_VIDES)} className="mt-4 rounded-xl text-[10px] font-black uppercase tracking-widest">
                          Effacer les filtres
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {lignesAffichees.map(l => {
                const deplie = deplies.has(l.id);
                return (
                  <React.Fragment key={l.id}>
                    <tr className="group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-amber-50 border-b border-r border-stone-200 px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => deplier(l.id)}
                            title={deplie ? 'Replier' : 'Voir les articles du dossier'}
                            className="p-0.5 rounded text-stone-400 hover:text-stone-900 hover:bg-stone-100"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${deplie ? 'rotate-90' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOuvrirDossier(l.id)}
                            title="Ouvrir le dossier"
                            className="font-black text-[12px] text-stone-900 uppercase tracking-tight hover:text-amber-600 hover:underline underline-offset-2 text-left"
                          >
                            {l.id}
                          </button>
                          {l.articlesIncomplets > 0 && (
                            <span
                              title={`${l.articlesIncomplets} article${l.articlesIncomplets > 1 ? 's' : ''} sans poids net ou sans CBM`}
                              className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"
                            />
                          )}
                        </div>
                      </td>
                      {colonnesVisibles.map(c => {
                        const cle = `${l.id}:${c.cle}`;
                        const enCours = enEdition?.id === l.id && enEdition.cle === c.cle;
                        const verrou = c.verrou?.(l);
                        return (
                          <td
                            key={c.cle}
                            style={{ minWidth: c.largeur }}
                            className={`border-b border-stone-100 px-1 py-1 align-middle transition-colors duration-500 ${
                              c.droite ? 'text-right tabular-nums' : ''
                            } ${debutsDeGroupe.has(c.cle) ? 'border-l border-l-stone-100' : ''} ${
                              recents[cle] ? 'bg-emerald-100' : c.saisie || c.modifiable ? 'group-hover:bg-amber-50/40' : 'bg-stone-50/70 text-stone-600 group-hover:bg-amber-50/40'
                            } ${c.saisie ? 'scroll-ml-[190px] scroll-mt-16 scroll-mb-12' : ''}`}
                          >
                            {c.saisie ? (
                              enCours ? (
                                <SaisieCellule
                                  initiale={saisieInitiale(l.facture, c.saisie)}
                                  saisie={c.saisie}
                                  droite={c.droite}
                                  onValider={(brut, suite) => valider(l, c, brut, suite)}
                                  onAnnuler={() => setEnEdition(null)}
                                />
                              ) : (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled={Boolean(verrou)}
                                    title={verrou || 'Modifier'}
                                    onClick={() => setEnEdition({ id: l.id, cle: c.cle })}
                                    className={`flex-1 min-w-0 min-h-[30px] px-1.5 py-1 rounded-md border border-transparent ${c.droite ? 'text-right' : 'text-left'} ${
                                      verrou ? 'cursor-not-allowed' : 'cursor-text hover:border-amber-300 hover:bg-white'
                                    }`}
                                  >
                                    {c.rendu(l, ctx)}
                                  </button>
                                  {c.action?.(l)}
                                </div>
                              )
                            ) : (
                              <div className={c.modifiable ? '' : 'px-1.5'}>{c.rendu(l, ctx)}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {deplie && (
                      <tr>
                        <td colSpan={nbColonnes} className="p-0 border-b border-stone-200 bg-stone-50">
                          <DetailArticles
                            ligne={l}
                            largeur={largeurVisible}
                            onModifier={onModifierArticle}
                            onOuvrir={() => onOuvrirDossier(l.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td className="sticky left-0 bottom-0 z-30 bg-stone-900 text-white border-r border-stone-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                  Total · {totaux.dossiers} dossier{totaux.dossiers > 1 ? 's' : ''}
                </td>
                {colonnesVisibles.map(c => (
                  <td
                    key={c.cle}
                    className={`sticky bottom-0 z-20 bg-stone-900 text-white px-2.5 py-2.5 font-black whitespace-nowrap ${c.droite ? 'text-right tabular-nums' : ''} ${debutsDeGroupe.has(c.cle) ? 'border-l border-l-stone-700' : ''}`}
                  >
                    {c.total?.(totaux) ?? null}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-center text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">
        {lignesAffichees.length} / {lignes.length} dossiers · clic sur une case = modifier · Entrée valide · Tab passe à la case suivante · Échap annule · cases grises = calculées
      </p>

      <datalist id="ta-fournisseurs">{options.fournisseurs.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ta-transitaires">{options.transitaires.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ta-compagnies">{options.compagnies.map(v => <option key={v} value={v} />)}</datalist>

      {/* ── Prévenir les clients : une date qui change leur statut ── */}
      <Dialog open={Boolean(confirmation)} onOpenChange={o => { if (!o) setConfirmation(null); }}>
        {/* Pas de focus d'office sur « Enregistrer et prévenir » : un Entrée réflexe écrirait aux clients. */}
        <DialogContent
          onOpenAutoFocus={e => e.preventDefault()}
          className="max-w-md grid-cols-1 border-stone-200 rounded-2xl p-0 gap-0 overflow-hidden"
        >
          <div className="bg-stone-900 p-5 flex items-center gap-3 text-white min-w-0">
            <div className="p-2 bg-white/10 rounded-lg shrink-0">
              <Mail className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-black uppercase tracking-tight leading-none">Prévenir les clients ?</DialogTitle>
              {confirmation && (
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1 truncate">
                  {confirmation.id} · {confirmation.champ === 'arrivalDate' ? "Date d'arrivée" : 'Entrée en stock'} :{' '}
                  {jourCourt(aConfirmer?.avant[confirmation.champ]) || '—'} → {jourCourt(confirmation.valeur) || 'effacée'}
                </p>
              )}
            </div>
          </div>
          {aConfirmer && confirmation && (
            <div className="p-5 space-y-4 min-w-0">
              <p className="text-[12px] text-stone-600">
                Pour les clients, le dossier passe de <strong>{libelleStatut(statutPourLesClients(aConfirmer.avant))}</strong> à{' '}
                <strong>{libelleStatut(statutPourLesClients(aConfirmer.apres))}</strong>.{' '}
                {aConfirmer.destinataires.length === 1 ? 'Un message partira :' : `${aConfirmer.destinataires.length} messages partiront :`}
              </p>
              <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-100 max-h-48 overflow-y-auto">
                {aConfirmer.destinataires.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]">
                    <span className="font-black text-indigo-700 shrink-0">{a.clientName}</span>
                    <span className="min-w-0 text-stone-500 uppercase truncate">{a.categoryId || a.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                Les mêmes messages que depuis « Paramétrer le dossier ». Sans message, la notification automatique ne l&apos;annoncera pas non plus.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => confirmer(true)} className="col-span-2 h-11 text-[10px] font-black uppercase tracking-widest rounded-xl bg-stone-900 hover:bg-black text-white gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Enregistrer et prévenir
                </Button>
                <Button variant="outline" onClick={() => confirmer(false)} className="h-10 text-[10px] font-black uppercase tracking-widest rounded-xl border-stone-200">
                  Enregistrer sans prévenir
                </Button>
                <Button variant="ghost" onClick={() => setConfirmation(null)} className="h-10 text-[10px] font-black uppercase tracking-widest rounded-xl">
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddFactureModal
        open={fenetre.ouverte}
        onOpenChange={o => setFenetre(f => ({ ...f, ouverte: o }))}
        factures={factures}
        editFacture={fenetre.facture}
        associatedArticles={fenetre.facture ? articles.filter(a => a.factureId === fenetre.facture.id) : []}
      />
    </div>
  );
}

// ─── Morceaux ─────────────────────────────────────────────────────────────────
function EnteteTri({ titre, actif, sens, onTrier, modifiable, aide }: {
  titre: string;
  actif: boolean;
  sens: Sens;
  onTrier: () => void;
  modifiable?: boolean;
  aide?: string;
}) {
  const Fleche = actif ? (sens === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onTrier}
      title={[aide, modifiable === undefined ? '' : modifiable ? 'Modifiable ici.' : 'Calculé.', 'Cliquer pour trier.'].filter(Boolean).join('\n')}
      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider hover:text-stone-900 ${
        actif ? 'text-stone-900' : modifiable ? 'text-stone-600' : 'text-stone-400'
      }`}
    >
      {modifiable && <Pencil className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
      <span>{titre}</span>
      <Fleche className={`w-3 h-3 shrink-0 ${actif ? 'text-amber-600' : 'opacity-25'}`} />
    </button>
  );
}

function SaisieCellule({ initiale, saisie, droite, onValider, onAnnuler }: {
  initiale: string;
  saisie: Saisie;
  droite?: boolean;
  onValider: (brut: string, suite?: Suite) => void;
  onAnnuler: () => void;
}) {
  const [valeur, setValeur] = useState(initiale);
  const champ = useRef<HTMLInputElement>(null);
  // Entrée, Tab ou Échap referment la case, qui perd alors le focus : une seule issue.
  const fini = useRef(false);
  useEffect(() => {
    const el = champ.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (saisie.type !== 'date') el.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const terminer = (suite?: Suite) => {
    if (fini.current) return;
    fini.current = true;
    onValider(valeur, suite);
  };
  return (
    <input
      ref={champ}
      type={saisie.type === 'date' ? 'date' : 'text'}
      inputMode={saisie.type === 'nombre' ? 'decimal' : undefined}
      list={saisie.type === 'texte' ? saisie.liste : undefined}
      autoComplete="off"
      spellCheck={false}
      value={valeur}
      onChange={e => setValeur(e.target.value)}
      onBlur={() => terminer()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); terminer(); }
        else if (e.key === 'Escape') { e.preventDefault(); fini.current = true; onAnnuler(); }
        else if (e.key === 'Tab') { e.preventDefault(); terminer(e.shiftKey ? 'precedente' : 'suivante'); }
      }}
      className={`w-full h-[30px] rounded-md border border-amber-400 bg-white px-1.5 text-[11px] font-bold text-stone-900 shadow-sm outline-none ring-2 ring-amber-200 ${
        droite ? 'text-right tabular-nums' : ''
      } ${saisie.type === 'texte' ? 'uppercase' : ''}`}
    />
  );
}

function Statut({ ligne: l }: { ligne: LigneArrivage }) {
  const s = STATUS_MAP[l.statut];
  const suivi = l.facture.suivi;
  // Jamais sur un conteneur arrivé ou entré en stock : il n'a plus de suivi.
  const etat = suivi?.shipmentId && !dossierVerrouille(l.facture) ? LIBELLE_STATUT[suivi.statut as StatutSuivi] : undefined;
  const detail = [
    suivi?.navire && `Navire : ${suivi.navire}`,
    suivi?.portDechargement && `Arrivée : ${suivi.portDechargement}${suivi.dateDechargementReelle ? ' (réelle)' : ' (annoncée)'}`,
    suivi?.conteneurs?.length && `Conteneurs : ${suivi.conteneurs.join(', ')}`,
  ].filter(Boolean).join('\n');
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${s.bgClass} ${s.textClass} ${s.borderClass}`}>
        {s.emoji} {s.label}
      </span>
      {etat && (
        <span
          title={detail || undefined}
          className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full border text-[8px] font-black uppercase tracking-wider whitespace-nowrap ${etat.ton}`}
        >
          {etat.emoji} {etat.label}
        </span>
      )}
    </div>
  );
}

function JourAvecDelai({ iso, aujourdhui, delai, suivie }: { iso?: string; aujourdhui: string; delai: boolean; suivie: boolean }) {
  if (!iso) return vide;
  const j = delai ? joursJusqua(iso, aujourdhui) : null;
  return (
    <div className="leading-tight">
      <span className="inline-flex items-center gap-1 font-bold tabular-nums">
        {jourCourt(iso) || iso}
        {suivie && <Radar className="w-3 h-3 text-sky-600" />}
      </span>
      {j !== null && (
        <span className={`block text-[9px] font-bold ${j > 0 ? 'text-sky-600' : j === 0 ? 'text-amber-600' : 'text-violet-600'}`}>
          {j > 0 ? `dans ${j} j` : j === 0 ? "aujourd'hui" : `il y a ${-j} j`}
        </span>
      )}
    </div>
  );
}

function LienSuivi({ noBL, compagnie }: { noBL: string; compagnie?: string }) {
  const { url, needsCopy } = getTrackingInfo(noBL, compagnie);
  return (
    <button
      type="button"
      title={needsCopy ? 'Suivre chez la compagnie — le n° est copié, collez-le sur leur site' : 'Suivre chez la compagnie'}
      onClick={() => {
        if (needsCopy) navigator.clipboard.writeText(noBL).catch(() => {});
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
      className="shrink-0 p-1 rounded-md text-stone-300 hover:text-sky-600 hover:bg-sky-50"
    >
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

function ChoixSociete({ valeur, onChoisir }: { valeur: string; onChoisir: (societe: string) => void }) {
  // Une ancienne valeur hors liste reste affichée au lieu de disparaître.
  const choix: string[] = !valeur || (SOCIETES_DECLARANTES as readonly string[]).includes(valeur)
    ? [...SOCIETES_DECLARANTES]
    : [...SOCIETES_DECLARANTES, valeur];
  return (
    <Select value={valeur} onValueChange={onChoisir}>
      <SelectTrigger className="h-[30px] w-full rounded-md border-transparent bg-transparent px-1.5 text-[11px] font-bold text-stone-800 shadow-none hover:border-amber-300 hover:bg-white focus:ring-1 focus:ring-amber-300 focus:ring-offset-0 [&>svg]:opacity-30">
        <SelectValue placeholder={<span className="text-stone-300">—</span>} />
      </SelectTrigger>
      <SelectContent>
        {choix.map(s => <SelectItem key={s} value={s} className="text-xs font-bold">{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Verifications({ ligne, onBasculer }: { ligne: LigneArrivage; onBasculer: (cle: string) => void }) {
  const faites = CHECK_ITEMS.filter(c => ligne.verifications[c.id]).length;
  return (
    <div className="flex items-center gap-1 px-1.5">
      {CHECK_ITEMS.map((c, i) => {
        const ok = Boolean(ligne.verifications[c.id]);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onBasculer(c.id)}
            title={`${i + 1}. ${c.label}${ok ? ' — vérifié' : ''}\n${c.desc}`}
            className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-black transition-colors ${
              ok
                ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-white border-stone-300 text-stone-400 hover:border-emerald-500 hover:text-emerald-600'
            }`}
          >
            {ok ? <Check className="w-3 h-3" strokeWidth={3} /> : i + 1}
          </button>
        );
      })}
      <span className={`ml-1 text-[10px] font-black tabular-nums ${faites === CHECK_ITEMS.length ? 'text-emerald-600' : 'text-stone-400'}`}>
        {faites}/{CHECK_ITEMS.length}
      </span>
    </div>
  );
}

function FiltreListe({ libelle, valeur, options, onChange }: {
  libelle: string;
  valeur: string;
  options: string[];
  onChange: (valeur: string) => void;
}) {
  return (
    <Select value={valeur || TOUS} onValueChange={v => onChange(v === TOUS ? '' : v)}>
      <SelectTrigger
        className={`h-10 w-auto min-w-[150px] max-w-[240px] gap-2 rounded-xl text-[11px] font-bold ${
          valeur ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-stone-50 border-stone-200 text-stone-700'
        }`}
      >
        <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 shrink-0">{libelle}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={TOUS} className="text-xs font-bold">Tous</SelectItem>
        <SelectItem value={NON_RENSEIGNE} className="text-xs font-bold italic text-stone-500">Non renseigné</SelectItem>
        {options.map(o => <SelectItem key={o} value={o} className="text-xs font-bold">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DetailArticles({ ligne, largeur, onModifier, onOuvrir }: {
  ligne: LigneArrivage;
  largeur: number;
  onModifier: (article: any) => void;
  onOuvrir: () => void;
}) {
  const liste = [...ligne.articles].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
  return (
    // Collé à gauche, à la largeur visible : le détail reste sous les yeux même
    // quand le tableau est défilé loin vers la droite.
    <div className="sticky left-0 px-4 py-3" style={{ width: largeur ? largeur - 2 : undefined }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          {liste.length} article{liste.length > 1 ? 's' : ''} · {ligne.id} · un clic sur un article pour le modifier
        </p>
        <button
          type="button"
          onClick={onOuvrir}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:underline shrink-0"
        >
          Ouvrir le dossier <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      {liste.length === 0 ? (
        <p className="text-[11px] font-bold text-stone-400">Aucun article dans ce dossier.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-stone-50 text-[9px] font-black uppercase tracking-wider text-stone-400">
              <tr>
                <th className="text-left px-3 py-2">Article</th>
                <th className="text-left px-2 py-2">Catégorie</th>
                <th className="text-left px-2 py-2">Couleur</th>
                <th className="text-left px-2 py-2">Taille</th>
                <th className="text-right px-2 py-2">Quantité</th>
                <th className="text-right px-2 py-2">CBM</th>
                <th className="text-right px-2 py-2">Poids net kg</th>
                <th className="text-right px-2 py-2">P.U. $</th>
                <th className="text-right px-2 py-2">Valeur $</th>
                <th className="text-left px-3 py-2">Client</th>
              </tr>
            </thead>
            <tbody>
              {liste.map(a => {
                const cbm = Number(a.cubicMeasurement) || 0;
                const poids = Number(a.netWeight) || 0;
                return (
                  <tr key={a.id} onClick={() => onModifier(a)} className="border-t border-stone-100 hover:bg-amber-50 cursor-pointer">
                    <td className="px-3 py-1.5 font-black uppercase text-stone-900 max-w-[280px] truncate" title={a.name}>{a.name || '—'}</td>
                    <td className="px-2 py-1.5 uppercase text-stone-500">{a.categoryId || '—'}</td>
                    <td className="px-2 py-1.5">
                      {a.colorBreakdown?.length
                        ? <span className="font-black text-violet-700">{a.colorBreakdown.length} couleurs</span>
                        : (a.color || '—')}
                    </td>
                    <td className="px-2 py-1.5">
                      {a.sizeBreakdown?.length
                        ? <span className="font-black text-blue-700">{a.sizeBreakdown.length} tailles</span>
                        : (a.size || '—')}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-black">
                      {F3.format(Number(a.quantity) || 0)} <span className="text-[9px] font-normal uppercase text-stone-400">{a.unitOfMeasure}</span>
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${cbm ? '' : 'font-black text-orange-600'}`}>{cbm ? F3.format(cbm) : 'manque'}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${poids ? '' : 'font-black text-orange-600'}`}>{poids ? F0.format(poids) : 'manque'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-amber-700">{F3.format(Number(a.purchasePricePerUnit) || 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-black">{F2.format((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0))}</td>
                    <td className="px-3 py-1.5 font-bold text-indigo-700">{a.clientName || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
