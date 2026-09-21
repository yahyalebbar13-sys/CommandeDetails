"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, collection, updateDoc, setDoc, query, where, getDocs, deleteDoc, deleteField, writeBatch, type DocumentReference, type WriteBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cleanUndefined } from '@/lib/utils';
import { Archive, Calendar, Save, DollarSign, AlertTriangle, Truck, Loader2, Building2, Lock, Unlock, MapPin, X, Plus, ChevronDown, Search } from 'lucide-react';
import { isArrivalOlderThanOneMonth } from '@/lib/status-utils';
import {
  type StorageLocation, type InboundAllocation, type InboundVariantLine, type VariantDimension,
  compareLocationCodes, distributeInboundRows, remainingToAllocate, normalizeVariantValue,
  articleInboundVariants, articleVariantDimension, rehydrateInboundAllocations, libelleFixe, ventilationIgnoree,
} from '@/lib/warehouse-locations';

// ── Emplacements par variante ────────────────────────────────────────────────
// Chaque variante d'un article ventilé (qualité, couleur ou taille) a ses propres parts
// d'emplacement : le Bleu va dans son rack, le Rouge dans le sien, et une variante trop
// volumineuse pour un seul rack se répartit sur plusieurs.

// Part telle qu'éditée à l'écran. `uid` n'est qu'une clé React stable (l'index décalerait les
// champs à la suppression d'une part) : il n'est jamais écrit, les parts étant recopiées champ
// par champ avant distributeInboundRows.
type DraftAllocation = InboundAllocation & { uid: string };

// Parts d'un article, par variante (clé variantKey ; '' pour un article sans ventilation).
type ArticleAllocations = Record<string, DraftAllocation[]>;

let draftSeq = 0;
const newDraft = (part: InboundAllocation): DraftAllocation => ({ ...part, uid: `part-${++draftSeq}` });

// Une variante à l'écran : les lignes de ventilation qui partagent son libellé (une seule en
// pratique ; deux lignes « Bleu » partagent les mêmes racks, comme dans le calcul du stock).
type VariantGroup = { key: string; label: string; quantity: number; lines: InboundVariantLine[] };

function groupInboundVariants(article: any): VariantGroup[] {
  const groups: VariantGroup[] = [];
  const byKey: Record<string, VariantGroup> = {};
  for (const line of articleInboundVariants(article)) {
    let group = byKey[line.key];
    if (!group) {
      group = byKey[line.key] = { key: line.key, label: line.label, quantity: 0, lines: [] };
      groups.push(group);
    }
    group.quantity = Math.round((group.quantity + line.quantity) * 1000) / 1000;
    group.lines.push(line);
  }
  return groups;
}

/**
 * Parts de départ d'un article : celles déjà enregistrées (« Revoir / Corriger »), sinon, pour un
 * article ventilé, une part par variante à sa quantité, SANS emplacement — il ne reste qu'à
 * choisir le rack. Un article sans ventilation part sans aucune part, comme avant l'adressage
 * par variante : « Répartir sur des emplacements » crée sa première part au clic.
 */
function initialArticleAllocations(article: any, existing: Record<string, InboundAllocation[]> = {}): ArticleAllocations {
  const ventilated = articleVariantDimension(article) !== null;
  const out: ArticleAllocations = {};
  for (const group of groupInboundVariants(article)) {
    const saved = existing[group.key] || [];
    if (saved.length > 0) out[group.key] = saved.map(newDraft);
    else if (ventilated) out[group.key] = [newDraft({ locationCode: '', quantity: group.quantity })];
  }
  return out;
}

/** La variante tient-elle en une seule part pleine (ou aucune) ? Elle s'affiche alors sur une ligne. */
function isSingleFullPart(parts: InboundAllocation[], total: number): boolean {
  return parts.length === 0 || (parts.length === 1 && parts[0].quantity === total);
}

/** Tout l'article au même emplacement : une part pleine par variante. */
function fillArticleAllocations(article: any, loc: { code: string; id?: string }): ArticleAllocations {
  const out: ArticleAllocations = {};
  for (const group of groupInboundVariants(article)) {
    out[group.key] = [newDraft({ locationCode: loc.code, locationId: loc.id, quantity: group.quantity })];
  }
  return out;
}

/**
 * Ce qui reste à ranger : seules comptent les parts dont l'emplacement existe dans l'entrepôt
 * ciblé, exactement comme à l'écriture. Une part sans emplacement entre en stock sans adresse,
 * elle n'est donc pas « placée ». Négatif : les parts dépassent la quantité (excès).
 */
function unplacedQuantity(total: number, parts: InboundAllocation[], validCodes: Set<string>): number {
  return remainingToAllocate(total, (parts || []).filter(p => p.locationCode && validCodes.has(p.locationCode)));
}

const EMPTY_CODES = new Set<string>();

// Opérations par writeBatch à l'enregistrement : sous la limite de 500 de Firestore, avec marge.
const MAX_BATCH_OPS = 450;

/** Précision affichée sous le libellé : description d'une couleur, nom FR d'une qualité. */
function variantHint(dimension: VariantDimension | null, group: VariantGroup): string {
  const row = group.lines[0]?.row;
  const hint = String((dimension === 'color' ? row?.description : dimension === 'quality' ? row?.nameFR : '') || '').trim();
  return hint && normalizeVariantValue(hint) !== normalizeVariantValue(group.label) ? hint : '';
}

const DIMENSION_WORDS: Record<VariantDimension, { plural: string; singular: string }> = {
  quality: { plural: 'qualités', singular: 'qualité' },
  color:   { plural: 'couleurs', singular: 'couleur' },
  size:    { plural: 'tailles',  singular: 'taille' },
};

// Au-delà, la liste des variantes est repliée par défaut et un filtre texte apparaît.
const MANY_VARIANTS = 12;

function PlacementCounter({ reste, unit, short }: { reste: number; unit?: string; short?: boolean }) {
  return (
    <span className={`${short ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-wider whitespace-nowrap ${
      reste === 0 ? 'text-emerald-600' : reste < 0 ? 'text-red-600' : 'text-amber-600'
    }`}>
      {reste === 0
        ? (short ? '✓ Placé' : '✓ Tout réparti')
        : reste < 0
          ? `Excès ${Math.abs(reste).toLocaleString('fr-FR')}`
          : `Reste ${reste.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`}
    </span>
  );
}

interface PassToStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
  associatedArticles: any[];
  subCategories: any[];
  stores?: any[];
  adminUid?: string | null;
  existingMovements?: any[];
  // Ignore le verrouillage habituel (arrivage déjà daté/validé) : utilisé par la vue de
  // réconciliation admin, pour compléter entrepôt + valeurs d'un arrivage dont la date
  // d'entrée a été saisie directement depuis /gestion sans passer par ce formulaire —
  // handleSubmit remplace déjà proprement les anciens mouvements, donc c'est sans risque.
  forceEditable?: boolean;
}

export default function PassToStockModal({
  open,
  onOpenChange,
  facture,
  associatedArticles,
  subCategories,
  stores,
  adminUid,
  existingMovements,
  forceEditable
}: PassToStockModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnvalidating, setIsUnvalidating] = useState(false);

  const effectiveUid = adminUid || user?.uid;

  // Si stores n'est pas passé en prop, charger automatiquement depuis Firestore
  const storesRef = useMemoFirebase(
    () => (!firestore || !effectiveUid) ? null : collection(firestore, 'users', effectiveUid, 'stores'),
    [firestore, effectiveUid]
  );
  const { data: remoteStores = [] } = useCollection(storesRef);
  const effectiveStores = (stores && stores.length > 0) ? stores : remoteStores;

  // Dans la validation des arrivages, SEULS les entrepôts doivent être affichés (pas les magasins de vente)
  const warehouseOptions = React.useMemo(() => {
    const whs = (effectiveStores || []).filter((s: any) => s.type === 'WAREHOUSE');
    if (whs.length === 0) {
      return [{ id: 'ENTREPOT', name: '📦 Entrepôt Principal (Par défaut)', type: 'WAREHOUSE' }];
    }
    return whs.map((s: any) => ({
      id: s.id,
      name: `📦 ${s.name}`,
      type: 'WAREHOUSE'
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [effectiveStores]);

  // Emplacements physiques configurés (cf. /stock → Emplacements). Chargés ici plutôt que passés
  // en prop : ce modal est monté depuis plusieurs écrans qui n'ont pas tous la collection.
  const locationsRef = useMemoFirebase(
    () => (!firestore || !effectiveUid) ? null : collection(firestore, 'users', effectiveUid, 'storageLocations'),
    [firestore, effectiveUid]
  );
  const { data: rawLocations = [] } = useCollection(locationsRef);
  const allLocations = (rawLocations || []) as StorageLocation[];

  const locationsByStore = React.useMemo(() => {
    const map: Record<string, StorageLocation[]> = {};
    for (const l of allLocations) {
      if (l.active === false) continue;
      (map[l.storeId] ||= []).push(l);
    }
    for (const list of Object.values(map)) list.sort((a, b) => compareLocationCodes(a.code, b.code));
    return map;
  }, [allLocations]);

  // Codes valides et <option> par entrepôt, calculés une fois : avec 30 couleurs et des centaines
  // d'emplacements, recréer toutes les options à chaque frappe ralentirait la saisie (des
  // éléments identiques d'un rendu à l'autre ne sont pas réconciliés à nouveau).
  const locationCodesByStore = React.useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [storeId, list] of Object.entries(locationsByStore)) map[storeId] = new Set(list.map(l => l.code));
    return map;
  }, [locationsByStore]);

  const locationOptionsByStore = React.useMemo(() => {
    const map: Record<string, React.ReactNode[]> = {};
    for (const [storeId, list] of Object.entries(locationsByStore)) {
      map[storeId] = list.map(l => (
        <option key={l.id} value={l.code}>{l.code}{l.label ? ` — ${l.label}` : ''}</option>
      ));
    }
    return map;
  }, [locationsByStore]);

  const [remoteMovements, setRemoteMovements] = useState<any[]>([]);
  useEffect(() => {
    if (!open || !facture?.id || !firestore || !effectiveUid) {
      setRemoteMovements([]);
      return;
    }
    if (existingMovements && existingMovements.length > 0) {
      setRemoteMovements(existingMovements);
      return;
    }
    const q = query(
      collection(firestore, 'users', effectiveUid, 'stockMovements'),
      where('factureId', '==', facture.id)
    );
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRemoteMovements(list);
    }).catch(err => console.error('Error fetching movements for facture:', err));
  }, [open, facture?.id, firestore, effectiveUid, existingMovements]);

  const activeMovements = (existingMovements && existingMovements.length > 0) ? existingMovements : remoteMovements;

  // Ce qui va réellement entrer, comparé à la quantité saisie sur l'article. Un écart vient
  // presque toujours d'une ventilation incomplète (une couleur oubliée) ou d'un total d'article
  // resté sur une ancienne valeur : le montrer avant de valider évite un stock faux.
  const ecartsVentilation = React.useMemo(() => {
    return (associatedArticles || []).flatMap((article: any) => {
      const nom = (article.nameFR || article.name || article.categoryId || 'Article').trim();
      const unite = article.unitOfMeasure || 'unité';
      const saisie = Number(article.quantity) || 0;
      const dimension = articleVariantDimension(article);

      if (!dimension) {
        // Ventilation écartée : elle annonce plus que l'article (elle décrit la commande entière).
        const ignoree = ventilationIgnoree(article);
        if (!ignoree || saisie <= 0) return [];
        return [{
          id: article.id,
          nom,
          detail: `la ventilation par ${DIMENSION_WORDS[ignoree.dimension].plural} annonce ${ignoree.total.toLocaleString()}`,
          entrera: saisie,
          saisie,
          unite,
          ignoree: true,
        }];
      }

      const lignes = articleInboundVariants(article);
      const entrera = lignes.reduce((somme, l) => somme + l.quantity, 0);
      if (saisie <= 0 || Math.abs(entrera - saisie) < 0.001) return [];
      const libelle = DIMENSION_WORDS[dimension];
      return [{
        id: article.id,
        nom,
        detail: `${lignes.length} ${lignes.length > 1 ? libelle.plural : libelle.singular}`,
        entrera,
        saisie,
        unite,
        ignoree: false,
      }];
    });
  }, [associatedArticles]);

  const isAlreadyInStock = !forceEditable && Boolean(
    facture?.status === 'STOCK' ||
    facture?.stockEntryDate ||
    isArrivalOlderThanOneMonth(facture?.arrivalDate) ||
    activeMovements.length > 0
  );

  // Y a-t-il une entrée à annuler ? Indépendant du mode d'ouverture : /stock ouvre toujours le
  // dossier en « forcé modifiable » pour pouvoir corriger, ce qui faisait disparaître le seul
  // bouton capable d'annuler une entrée — « Dévalider » n'était plus atteignable nulle part.
  // Une date d'arrivée vieille d'un mois ne compte pas : elle ne prouve aucune entrée.
  const entreeAAnnuler = Boolean(
    facture?.status === 'STOCK' ||
    facture?.stockEntryDate ||
    activeMovements.length > 0
  );

  const [formData, setFormData] = useState({
    stockEntryDate: '',
    invoicePaidDhs: 0,
    exchangeInvoiceAmount: 0,
    supplierInvoiceAmount: 0,
    additionalCostsAmount: 0
  });

  const [storeSelections, setStoreSelections] = useState<Record<string, string>>({});
  const [globalStoreId, setGlobalStoreId] = useState<string>('');
  // Répartition par article PUIS par variante : une même référence remplit souvent plusieurs
  // racks, et chaque couleur / qualité / taille a les siens.
  const [locationAllocations, setLocationAllocations] = useState<Record<string, ArticleAllocations>>({});
  // Liste des variantes dépliée ou non, par article (défaut : dépliée jusqu'à MANY_VARIANTS).
  const [openVariantLists, setOpenVariantLists] = useState<Record<string, boolean>>({});
  const [variantFilters, setVariantFilters] = useState<Record<string, string>>({});
  // Variantes que l'utilisateur a choisi de répartir (« + ») : elles restent dépliées. Déduire
  // l'affichage des seules quantités replierait la ligne — et ferait disparaître le champ en
  // cours de saisie — dès que la dernière part retombe sur la quantité de la variante.
  const [splitVariants, setSplitVariants] = useState<Record<string, boolean>>({});

  // Les tableaux reçus en props sont recréés à chaque rendu du parent (filtres faits à la volée
  // dans stock-app, qui écoute les mouvements en temps réel) : dépendre de leur identité
  // réinitialisait le formulaire — et effaçait les emplacements déjà choisis — à chaque
  // mouvement enregistré ailleurs. On ne repart de zéro que si leur contenu change vraiment.
  const initSignature = [
    facture?.id || '',
    (associatedArticles || []).map((a: any) => a.id).join(','),
    (activeMovements || []).map((m: any) => m.id).join(','),
    warehouseOptions.map((w: any) => w.id).join(','),
  ].join('|');

  useEffect(() => {
    if (facture && open) {
      setFormData({
        stockEntryDate: facture.stockEntryDate || new Date().toISOString().split('T')[0],
        invoicePaidDhs: Number(facture.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(facture.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(facture.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(facture.additionalCostsAmount) || 0
      });

      // Identifier si un entrepôt valide avait déjà été sélectionné
      const firstExistingStoreId = activeMovements?.find(m => m.storeId)?.storeId;
      const isExistingStoreValid = warehouseOptions.some(w => w.id === firstExistingStoreId);
      const defaultWh = isExistingStoreValid ? firstExistingStoreId : (warehouseOptions[0]?.id || 'ENTREPOT');
      setGlobalStoreId(defaultWh);

      if (associatedArticles && associatedArticles.length > 0) {
        const initialSelections: Record<string, string> = {};
        const initialLocations: Record<string, ArticleAllocations> = {};
        const initialSplit: Record<string, boolean> = {};
        associatedArticles.forEach(a => {
          const movsForArt = (activeMovements || []).filter(m => m.articleId === a.id);
          const movStore = movsForArt.find(m => m.storeId)?.storeId;
          const isMovStoreValid = warehouseOptions.some(w => w.id === movStore);
          initialSelections[a.id] = (isMovStoreValid && movStore) ? movStore : defaultWh;
          // Repartir de la répartition déjà enregistrée (cas "Revoir / Corriger"), variante par
          // variante : regrouper par emplacement seul ferait perdre quelle couleur est où.
          const dimension = articleVariantDimension(a);
          const existing = rehydrateInboundAllocations(movsForArt, a.id, dimension);
          const allocations = initialArticleAllocations(a, existing);
          initialLocations[a.id] = allocations;
          // Une variante relue en plusieurs parts, ou en une part partielle (40 sur 100), est
          // déjà « répartie » : sans ce marquage, taper sa quantité exacte la replierait et
          // démonterait le champ en cours de saisie.
          if (dimension) {
            for (const group of groupInboundVariants(a)) {
              if (!isSingleFullPart(allocations[group.key] || [], group.quantity)) initialSplit[`${a.id}::${group.key}`] = true;
            }
          }
        });
        setStoreSelections(initialSelections);
        setLocationAllocations(initialLocations);
        setOpenVariantLists({});
        setVariantFilters({});
        setSplitVariants(initialSplit);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voir initSignature
  }, [open, initSignature]);

  const handleGlobalStoreChange = (whId: string) => {
    setGlobalStoreId(whId);
    if (associatedArticles && associatedArticles.length > 0) {
      const updated: Record<string, string> = {};
      associatedArticles.forEach(a => {
        updated[a.id] = whId;
      });
      setStoreSelections(updated);
    }
    // Les emplacements appartiennent à un entrepôt précis : changer d'entrepôt les invalide.
    const reset: Record<string, ArticleAllocations> = {};
    (associatedArticles || []).forEach((a: any) => { reset[a.id] = initialArticleAllocations(a); });
    setLocationAllocations(reset);
    setSplitVariants({});
  };

  // Calcul automatique du total droits payés (DI+TPI+TVA) depuis les articles liés
  const calculatedDroitsPayes = React.useMemo(() => {
    if (!facture) return 0;
    const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
    const declaredValue = Number(facture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
    return (associatedArticles || []).reduce((total, a) => {
      const nw = Number(a.netWeight) || 0;
      const cat = (subCategories || []).find((c: any) => c.name === a.categoryId || c.id === a.categoryId);
      if (!cat || cat.customsValuePerKg == null) return total;
      const customsValuePerKg = Number(cat.customsValuePerKg);
      const importDutyRate = cat.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0;
      const tpiRate = cat.tpiRate != null ? Number(cat.tpiRate) / 100 : 0;
      const tvaRate = cat.tvaRate != null ? Number(cat.tvaRate) / 100 : 0;
      const valDouane = nw * customsValuePerKg;
      const di = valDouane * importDutyRate;
      const tpi = valDouane * tpiRate;
      const tva = (valDouane + di + tpi) * tvaRate;
      return total + di + tpi + tva;
    }, 0);
  }, [facture, associatedArticles, subCategories]);

  // ── Calcul du coût de revient TTC unitaire MAD par article ──────────────────
  const computeCoutRevientMad = React.useCallback((article: any): number => {
    if (!facture || !article) return 0;

    const qty = Number(article.quantity) || 0;
    if (qty <= 0) return 0;

    // Taux de change réel depuis les données dossier
    const invoicePaidDhs = Number(formData.invoicePaidDhs) || 0;
    const declaredValue  = Number(facture.declaredValue) || 0;
    const tc = (invoicePaidDhs > 0 && declaredValue > 0)
      ? invoicePaidDhs / declaredValue
      : (Number(facture.exchangeRate) || Number(facture.tauxChange) || 10.5);

    // Achat FOB en MAD
    const prixUnitaire = Number(article.purchasePricePerUnit) || 0;
    const valeurFOB    = qty * prixUnitaire;
    const coutAchatMad = valeurFOB * tc;

    // Frais dossier réels (du formulaire)
    const fraisTransit = Number(formData.supplierInvoiceAmount) || 0;
    const fraisChange  = Number(formData.exchangeInvoiceAmount) || 0;
    const fraisSupp    = Number(formData.additionalCostsAmount) || 0;
    const totalFraisFixesHT = (fraisTransit + fraisChange + fraisSupp) / 1.20;

    // Fret dossier réel
    const fretTotal$ = Number(facture.freightCost) || Number(facture.freight) || 0;
    const totalFretMad = (fretTotal$ * tc) / 1.20;

    // CBM pour proratisation
    const cbmArticle = Number(article.cubicMeasurement) || 0;
    const cbmTotal = (associatedArticles || []).reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0) || 68;

    const partFraisMad = (cbmArticle > 0 && cbmTotal > 0)
      ? (cbmArticle / cbmTotal) * totalFraisFixesHT : 0;
    const fretPartMad  = (cbmArticle > 0 && cbmTotal > 0)
      ? (cbmArticle / cbmTotal) * totalFretMad : 0;

    // Taxes douanières article
    const cat = (subCategories || []).find((c: any) => c.name === article.categoryId || c.id === article.categoryId);
    const importDutyRate = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0;
    const tpiRate        = cat?.tpiRate        != null ? Number(cat.tpiRate)        / 100 : 0;
    const ticRate        = cat?.ticRate        != null ? Number(cat.ticRate)        / 100 : 0;
    const tvaRate        = cat?.tvaRate        != null ? Number(cat.tvaRate)        / 100 : 0.20;

    const customsValuePerKg = Number(cat?.customsValuePerKg) || 0;
    const netWeight = Number(article.netWeight) || 0;

    let totalTaxesMad = 0;
    if (netWeight > 0 && customsValuePerKg > 0) {
      const valDouane = netWeight * customsValuePerKg;
      const di  = valDouane * importDutyRate;
      const tpi = valDouane * tpiRate;
      const tic = valDouane * ticRate;
      const tva = (valDouane + di + tpi) * tvaRate;
      totalTaxesMad = di + tpi + tic + tva;
    } else {
      // Fallback : base FOB en MAD
      const di$  = valeurFOB * importDutyRate;
      const tpi$ = valeurFOB * tpiRate;
      const tic$ = valeurFOB * ticRate;
      const tva$ = (valeurFOB + di$ + tpi$) * tvaRate;
      totalTaxesMad = (di$ + tpi$ + tic$ + tva$) * tc;
    }

    const coutTotalMad  = coutAchatMad + partFraisMad + fretPartMad + totalTaxesMad;
    const coutUniteMad  = coutTotalMad / qty;
    return Math.round(coutUniteMad * 100) / 100;
  }, [facture, formData, associatedArticles, subCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid || !firestore || !facture) {
      toast({
        title: "Erreur",
        description: "Utilisateur ou base de données indisponible.",
        variant: "destructive"
      });
      return;
    }

    if (isAlreadyInStock) {
      toast({
        title: "Arrivage verrouillé",
        description: "Cet arrivage est déjà validé en stock et ne peut plus être modifié.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 0. S'assurer que l'entrepôt cible existe réellement en base (pas seulement l'option
      // de repli synthétique affichée dans le menu) — sinon /stock ne reconnaît jamais ses
      // mouvements comme appartenant à un entrepôt (isWarehouseStore fait un vrai lookup
      // Firestore) et l'article reste invisible malgré un enregistrement "réussi".
      if (!effectiveStores || !effectiveStores.some((s: any) => s.type === 'WAREHOUSE')) {
        await setDoc(doc(firestore, 'users', effectiveUid, 'stores', 'ENTREPOT'), {
          id: 'ENTREPOT',
          name: 'Entrepôt Principal',
          type: 'WAREHOUSE',
          isMain: true,
        }, { merge: true });
      }

      // 1. Ce que deviendra la facture — écrit seulement APRÈS les mouvements (étape 4) :
      // un dossier marqué « validé en stock » alors que l'écriture des mouvements a échoué reste
      // verrouillé avec zéro stock, et rien ne le signale.
      const factureRef = doc(firestore, 'users', effectiveUid, 'factures', facture.id);
      const updates = cleanUndefined({
        stockEntryDate: formData.stockEntryDate,
        status: 'STOCK',
        customsPaidDhs: calculatedDroitsPayes,
        invoicePaidDhs: Number(formData.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(formData.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(formData.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(formData.additionalCostsAmount) || 0,
        updatedAt: serverTimestamp()
      });

      // 1b. Si l'arrivage existait déjà en stock ou est en cours de modification, ses anciens
      // mouvements d'arrivage doivent disparaître pour éviter les doublons. Ils sont repérés ici,
      // AVANT d'écrire quoi que ce soit, puis supprimés dans les mêmes lots que les nouveaux (3.).
      const movsColl = collection(firestore, 'users', effectiveUid, 'stockMovements');
      const q1 = query(movsColl, where('factureId', '==', facture.id));
      const oldSnap1 = await getDocs(q1);
      const oldMovementRefs: DocumentReference[] = [];
      oldSnap1.forEach(d => {
        oldMovementRefs.push(d.ref);
      });

      const q2 = query(movsColl, where('factureRef', '==', facture.id));
      const oldSnap2 = await getDocs(q2);
      oldSnap2.forEach(d => {
        if (!oldSnap1.docs.some(x => x.id === d.id)) {
          oldMovementRefs.push(d.ref);
        }
      });

      // Nouveaux mouvements de tous les articles, écrits d'un bloc à l'étape 3.
      const newMovements: any[] = [];
      // Mises à jour d'articles (date d'entrée, statut, coût de revient), écrites à l'étape 4.
      const articleUpdates: { ref: DocumentReference; data: any }[] = [];

      // 2. Propager Stock Entry Date + coût de revient MAD + Statut STOCK à chaque article
      if (associatedArticles && associatedArticles.length > 0) {
        for (const article of associatedArticles) {
          const articleRef = doc(firestore, 'users', effectiveUid, 'articles', article.id);
          const coutRevient = computeCoutRevientMad(article);

          articleUpdates.push({
            ref: articleRef,
            data: cleanUndefined({
              stockEntryDate:   formData.stockEntryDate,
              status:           'STOCK',
              purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
              updatedAt:        serverTimestamp()
            }),
          });

          const baseName = (article.nameFR || article.name || article.categoryId || '').trim();
          const parts: string[] = [];
          if (article.zipperType && !baseName.toLowerCase().includes(article.zipperType.toLowerCase())) {
            parts.push(article.zipperType);
          }
          if (article.slider && !baseName.toLowerCase().includes(article.slider.toLowerCase())) {
            parts.push(article.slider);
          }
          const fullEnglishName = parts.length > 0 ? `${baseName} ${parts.join(' ')}`.trim() : (baseName || article.specs || 'Produit');
          const defaultProductName = article.nameFR || fullEnglishName;
          const targetStore = storeSelections[article.id] || globalStoreId || warehouseOptions[0]?.id || 'ENTREPOT';
          // Les parts ne sont retenues que si leur emplacement appartient bien à l'entrepôt
          // ciblé — une sélection laissée d'un entrepôt précédent ne doit jamais être écrite.
          // Recopiées champ par champ : rien d'autre que l'emplacement et la quantité n'est écrit.
          const articleParts = locationAllocations[article.id] || {};
          const partsFor = (key: string): InboundAllocation[] => (articleParts[key] || [])
            .map(a => {
              const loc = (locationsByStore[targetStore] || []).find(l => l.code === a.locationCode);
              if (!loc) return null;
              const qty = Number(a.quantity) || 0;
              return qty > 0 ? { locationCode: loc.code, locationId: loc.id, quantity: qty } : null;
            })
            .filter(Boolean) as InboundAllocation[];

          // Une ligne de mouvement par variante (qualité, sinon couleur, sinon taille), ou une
          // seule pour l'article entier. articleInboundVariants lit la quantité là où chaque
          // ventilation la range (`rolls` pour les couleurs, qui n'écrivaient jusqu'ici aucun
          // mouvement). Les champs écrits restent ceux d'avant, dimension par dimension, pour
          // que computeStockItems rattache chaque ligne à sa variante.
          const dimension = articleVariantDimension(article);
          const rowsByKey: Record<string, any[]> = {};
          const keyOrder: string[] = [];

          for (const line of articleInboundVariants(article)) {
            const row = line.row || {};
            let movementRow: any;

            if (dimension === 'quality') {
              const rowProductName = row.nameFR || (row.quality ? `${baseName} ${row.quality}`.trim() : defaultProductName);
              const rowPrice = (row.priceOverride !== '' && row.priceOverride !== undefined && Number(row.priceOverride) > 0)
                ? Number(row.priceOverride)
                : coutRevient;

              movementRow = {
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      rowProductName,
                nameFR:           row.nameFR || article.nameFR || null,
                color:            libelleFixe(article.color),
                size:             libelleFixe(row.size ?? article.size),
                // Libellé nettoyé, comme la clé de variante : computeStockItems compare m.quality à
                // la qualité sans espaces autour : 'CL-5 ' brut ne serait jamais reconnu.
                quality:          line.label || null,
                gsm:              row.gsm ?? article.gsm ?? null,
                fabricWidth:      row.fabricWidth ?? article.fabricWidth ?? null,
                rollLength:       row.rollLength ?? article.rollLength ?? null,
                rollLengthUnit:   row.rollLengthUnit ?? article.rollLengthUnit ?? null,
                packagingPerBag:  row.packagingPerBag ?? article.packagingPerBag ?? null,
                zipperType:       row.zipperType ?? article.zipperType ?? null,
                slider:           row.slider ?? article.slider ?? null,
                sliderType:       row.sliderType ?? article.sliderType ?? null,
                tapeWeightGsm:    row.tapeWeightGsm ?? article.tapeWeightGsm ?? null,
                sliderWeightG:    row.sliderWeightG ?? article.sliderWeightG ?? null,
                pcsPerBag:        row.pcsPerBag ?? article.pcsPerBag ?? null,
                bagsPerCarton:    row.bagsPerCarton ?? article.bagsPerCarton ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         line.quantity,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: rowPrice > 0 ? rowPrice : null,
                notes:            `Arrivage ${facture.id} · Qualité ${row.quality || ''}`,
                createdAt:        serverTimestamp(),
              };
            } else if (dimension === 'color') {
              // Même libellé que computeStockItems : colorCode, sinon description, sinon color.
              const colorLabel = line.label;

              movementRow = {
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      defaultProductName,
                nameFR:           article.nameFR || null,
                color:            colorLabel || null,
                size:             libelleFixe(article.size),
                quality:          libelleFixe(article.quality),
                gsm:              article.gsm ?? null,
                fabricWidth:      article.fabricWidth ?? null,
                rollLength:       article.rollLength ?? null,
                rollLengthUnit:   article.rollLengthUnit ?? null,
                packagingPerBag:  article.packagingPerBag ?? null,
                zipperType:       article.zipperType ?? null,
                slider:           article.slider ?? null,
                sliderType:       article.sliderType ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         line.quantity,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
                notes:            `Arrivage ${facture.id} · Couleur ${colorLabel}`,
                createdAt:        serverTimestamp(),
              };
            } else if (dimension === 'size') {
              const sizeLabel = line.label;

              movementRow = {
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      defaultProductName,
                nameFR:           article.nameFR || null,
                color:            libelleFixe(article.color),
                size:             sizeLabel || null,
                quality:          libelleFixe(article.quality),
                gsm:              article.gsm ?? null,
                fabricWidth:      article.fabricWidth ?? null,
                rollLength:       article.rollLength ?? null,
                rollLengthUnit:   article.rollLengthUnit ?? null,
                packagingPerBag:  article.packagingPerBag ?? null,
                zipperType:       article.zipperType ?? null,
                slider:           article.slider ?? null,
                sliderType:       article.sliderType ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         line.quantity,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
                notes:            `Arrivage ${facture.id} · Taille ${sizeLabel}`,
                createdAt:        serverTimestamp(),
              };
            } else {
              // Article sans ventilation : une seule ligne, à sa quantité totale (même nulle).
              movementRow = {
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      defaultProductName,
                nameFR:           article.nameFR || null,
                color:            libelleFixe(article.color),
                size:             libelleFixe(article.size),
                quality:          libelleFixe(article.quality),
                gsm:              article.gsm ?? null,
                fabricWidth:      article.fabricWidth ?? null,
                rollLength:       article.rollLength ?? null,
                rollLengthUnit:   article.rollLengthUnit ?? null,
                packagingPerBag:  article.packagingPerBag ?? null,
                zipperType:       article.zipperType ?? null,
                slider:           article.slider ?? null,
                sliderType:       article.sliderType ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         line.quantity,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
                notes:            `Arrivage ${facture.id}${article.quality ? ` · Qualité ${article.quality}` : ''}`,
                createdAt:        serverTimestamp(),
              };
            }

            if (!rowsByKey[line.key]) { rowsByKey[line.key] = []; keyOrder.push(line.key); }
            rowsByKey[line.key].push(movementRow);
          }

          // Chaque variante est répartie sur SES parts : on remplit le premier emplacement
          // jusqu'à sa part, puis le suivant, en coupant une ligne à cheval. Ce qui dépasse les
          // parts (ou n'en a aucune) entre en stock sans emplacement plutôt qu'à une adresse
          // inventée — ou qu'au rack d'une autre couleur.
          for (const key of keyOrder) {
            for (const row of distributeInboundRows(rowsByKey[key], partsFor(key))) {
              newMovements.push(cleanUndefined(row));
            }
          }
        }
      }

      // 3. Remplacer les mouvements de l'arrivage : suppression des anciens puis création des
      // nouveaux, dans des writeBatch plutôt qu'un addDoc par ligne (un dossier multi-couleurs en
      // écrit des dizaines, et chaque écriture relançait le calcul du stock de /stock). Tant que le
      // tout tient dans un lot — le cas courant —, le remplacement est atomique : jamais d'arrivage
      // à moitié écrit, ni vidé de ses anciens mouvements sans les nouveaux. Au-delà, les lots
      // partent dans l'ordre, suppressions d'abord, comme avant.
      const movementOps: ((batch: WriteBatch) => void)[] = [
        ...oldMovementRefs.map(ref => (batch: WriteBatch) => { batch.delete(ref); }),
        ...newMovements.map(data => (batch: WriteBatch) => { batch.set(doc(movsColl), data); }),
      ];
      for (let i = 0; i < movementOps.length; i += MAX_BATCH_OPS) {
        const batch = writeBatch(firestore);
        movementOps.slice(i, i + MAX_BATCH_OPS).forEach(op => op(batch));
        await batch.commit();
      }

      // 4. Les mouvements sont en base : le dossier et ses articles peuvent être marqués
      // « validés en stock ». Dans cet ordre, une erreur laisse un dossier à revalider plutôt
      // qu'un dossier verrouillé sans stock.
      const finalOps: ((batch: WriteBatch) => void)[] = [
        (batch: WriteBatch) => { batch.set(factureRef, updates, { merge: true }); },
        ...articleUpdates.map(u => (batch: WriteBatch) => { batch.set(u.ref, u.data, { merge: true }); }),
      ];
      for (let i = 0; i < finalOps.length; i += MAX_BATCH_OPS) {
        const batch = writeBatch(firestore);
        finalOps.slice(i, i + MAX_BATCH_OPS).forEach(op => op(batch));
        await batch.commit();
      }

      toast({ 
        title: isAlreadyInStock ? "✅ Arrivage mis à jour" : "✅ Entrée en stock validée", 
        description: `Dossier ${facture.id} mis à jour dans le stock avec succès.` 
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[PassToStockModal] error:', err);
      toast({
        title: "Erreur de validation",
        description: err?.message || "Une erreur est survenue lors de l'entrée en stock.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dévalider : efface la date d'entrée en stock et supprime les mouvements créés par cet
  // arrivage, pour permettre de recommencer "Finaliser l'Entrée" (ex: entrepôt mal résolu).
  const handleUnvalidate = async () => {
    if (!effectiveUid || !firestore || !facture) return;
    if (!window.confirm(`Dévalider l'arrivage ${facture.id} ? Les mouvements de stock déjà créés pour ce dossier seront supprimés et il faudra refaire "Finaliser l'Entrée".`)) return;

    setIsUnvalidating(true);
    try {
      const movsColl = collection(firestore, 'users', effectiveUid, 'stockMovements');
      const q1 = query(movsColl, where('factureId', '==', facture.id));
      const q2 = query(movsColl, where('factureRef', '==', facture.id));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const seen = new Set<string>();
      const deletePromises: Promise<any>[] = [];
      [...snap1.docs, ...snap2.docs].forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        deletePromises.push(deleteDoc(d.ref));
      });
      await Promise.all(deletePromises);

      const factureRef = doc(firestore, 'users', effectiveUid, 'factures', facture.id);
      await updateDoc(factureRef, {
        stockEntryDate: deleteField(),
        status: 'SHIPPED',
        updatedAt: serverTimestamp(),
      });

      if (associatedArticles && associatedArticles.length > 0) {
        for (const article of associatedArticles) {
          const articleRef = doc(firestore, 'users', effectiveUid, 'articles', article.id);
          await updateDoc(articleRef, {
            stockEntryDate: deleteField(),
            purchasePriceMAD: deleteField(),
            status: 'SHIPPED',
            updatedAt: serverTimestamp(),
          });
        }
      }

      toast({ title: '🔓 Arrivage dévalidé', description: `Dossier ${facture.id} déverrouillé, mouvements supprimés.` });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[PassToStockModal] unvalidate error:', err);
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || 'Impossible de dévalider.' });
    } finally {
      setIsUnvalidating(false);
    }
  };

  if (!facture) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-stone-200 overflow-hidden p-0 rounded-2xl">
        <div className="bg-emerald-600 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/20 rounded-lg">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none flex items-center gap-2">
              {isAlreadyInStock ? "Arrivage Validé en Stock" : "Entrée en Stock"} <span className="opacity-70">&bull; {facture.id}</span>
            </DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1 flex items-center gap-1.5">
              {isAlreadyInStock ? (
                <>
                  <Lock className="w-3 h-3" /> Dossier validé et verrouillé · Modification désactivée
                </>
              ) : (
                "Saisie de clôture et valorisation"
              )}
            </p>
          </div>
        </div>

        {isAlreadyInStock && (
          <div className="p-4 mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800 shrink-0">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs font-bold leading-relaxed">
              Cet arrivage est déjà validé en stock (Verrouillé). Sa modification est désactivée afin de préserver l'intégrité de l'inventaire et des mouvements.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[65vh] overflow-y-auto bg-white">
          <div className="space-y-1.5 focus-within:text-emerald-600">
            <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1 transition-colors">
              <Calendar className="w-3 h-3" /> DATE D'ENTRÉE EN STOCK EFFECTIVE
            </Label>
            <Input 
              type="date"
              required
              className="border-stone-200 h-12 font-black text-lg bg-stone-50 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
              value={formData.stockEntryDate}
              onChange={e => setFormData(prev => ({ ...prev, stockEntryDate: e.target.value }))}
            />
          </div>

          <div className="pt-4 border-t border-stone-100">
            <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" /> Bilan Financier (MAD)
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Facture Fournisseur</Label>
                <div className="relative">
                  <Input 
                    type="number" step="0.01" placeholder="0.00"
                    className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                    value={formData.supplierInvoiceAmount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, supplierInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Facture d'Échange</Label>
                <div className="relative">
                  <Input 
                    type="number" step="0.01" placeholder="0.00"
                    className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                    value={formData.exchangeInvoiceAmount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, exchangeInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Total Droits Douane</Label>
              <div className="h-11 rounded-xl border border-red-200 bg-red-50 flex items-center justify-between px-3">
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Σ DI + TPI + TVA (auto)</span>
                <span className="font-black text-red-600 text-sm">
                  {calculatedDroitsPayes.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> Frais Supplémentaires
              </Label>
              <div className="relative">
                <Input 
                  type="number" step="0.01" placeholder="0.00"
                  className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                  value={formData.additionalCostsAmount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, additionalCostsAmount: parseFloat(e.target.value) || 0 }))}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 mt-2">
            <Label className="text-[11px] font-black text-emerald-800 uppercase tracking-widest mb-1.5 block">TOTAL PAYÉ (Dossier global)</Label>
            <div className="relative">
              <Input 
                type="number" step="0.01" placeholder="0.00"
                className="border-emerald-200 h-14 font-black text-xl text-emerald-900 bg-white pl-10 rounded-xl shadow-inner"
                value={formData.invoicePaidDhs || ''}
                onChange={e => setFormData(prev => ({ ...prev, invoicePaidDhs: parseFloat(e.target.value) || 0 }))}
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-sm uppercase">MAD</span>
            </div>
          </div>
          
          {associatedArticles && associatedArticles.length > 0 && (
            <div className="pt-4 border-t border-stone-100">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest flex items-center gap-2">
                  <Archive className="w-4 h-4 text-emerald-500" /> Affectation aux Entrepôts de Stockage
                </h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold text-stone-400 uppercase">Affecter tout à :</span>
                  <select
                    value={globalStoreId}
                    onChange={(e) => handleGlobalStoreChange(e.target.value)}
                    className="h-7 px-2 rounded-lg border border-stone-200 text-[10px] font-bold bg-white"
                  >
                    {warehouseOptions.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  {/* Raccourci quand tout l'arrivage part au même endroit (une palette, un rack) */}
                  {(locationsByStore[globalStoreId] || []).length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const code = e.target.value;
                        if (!code || !associatedArticles) return;
                        const loc = (locationsByStore[globalStoreId] || []).find(l => l.code === code);
                        if (!loc) return;
                        // Tout l'arrivage au même endroit : une part pleine par variante de
                        // chaque article, modifiable ensuite. Un article envoyé dans un autre
                        // entrepôt garde ses parts : ce rack n'existe pas chez lui.
                        setLocationAllocations(prev => {
                          const next = { ...prev };
                          associatedArticles.forEach((a: any) => {
                            const store = storeSelections[a.id] || globalStoreId || warehouseOptions[0]?.id || '';
                            if (store === globalStoreId) next[a.id] = fillArticleAllocations(a, loc);
                          });
                          return next;
                        });
                        setSplitVariants({});
                      }}
                      className="h-7 px-2 rounded-lg border border-stone-200 text-[10px] font-bold bg-white font-mono"
                    >
                      <option value="">📍 Même emplacement…</option>
                      {locationOptionsByStore[globalStoreId]}
                    </select>
                  )}
                </div>
              </div>

              {ecartsVentilation.length > 0 && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-800">
                    <AlertTriangle className="w-4 h-4" /> Quantités à vérifier
                  </p>
                  <ul className="space-y-1">
                    {ecartsVentilation.map(e => (
                      <li key={e.id} className="text-[11px] font-bold text-amber-900">
                        {e.ignoree
                          ? `${e.nom} : ${e.detail} pour un article de ${e.saisie.toLocaleString()} ${e.unite}. Elle n'est pas suivie : l'article entre en une seule ligne.`
                          : `${e.nom} : ${e.detail} — ${e.entrera.toLocaleString()} ${e.unite} entreront en stock, au lieu de ${e.saisie.toLocaleString()}.`}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] font-bold text-amber-700">
                    Corrigez la ventilation dans /gestion si ce n'est pas voulu : c'est le détail qui fait foi, pas la quantité totale de l'article.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {associatedArticles.map((article: any) => {
                  const baseName = (article.nameFR || article.name || article.categoryId || '').trim();
                  const parts: string[] = [];
                  if (article.zipperType && !baseName.toLowerCase().includes(article.zipperType.toLowerCase())) {
                    parts.push(article.zipperType);
                  }
                  if (article.slider && !baseName.toLowerCase().includes(article.slider.toLowerCase())) {
                    parts.push(article.slider);
                  }
                  const fullEnglishName = parts.length > 0 ? `${baseName} ${parts.join(' ')}`.trim() : (baseName || article.specs || 'Produit');
                  const productName = article.nameFR || fullEnglishName;
                  const articleStore = storeSelections[article.id] || globalStoreId || warehouseOptions[0]?.id || '';
                  const articleLocations = locationsByStore[articleStore] || [];
                  const locationOptions = locationOptionsByStore[articleStore];
                  const validCodes = locationCodesByStore[articleStore] || EMPTY_CODES;
                  const unit = article.unitOfMeasure || '';

                  const dimension = articleVariantDimension(article);
                  const words = dimension ? DIMENSION_WORDS[dimension] : null;
                  const articleParts = locationAllocations[article.id] || {};

                  // Toujours à partir de l'état le plus récent : deux saisies rapprochées ne
                  // s'écrasent pas.
                  const updateParts = (key: string, fn: (parts: DraftAllocation[]) => DraftAllocation[]) =>
                    setLocationAllocations(prev => {
                      const current = prev[article.id] || {};
                      return { ...prev, [article.id]: { ...current, [key]: fn(current[key] || []) } };
                    });
                  const setPartLocation = (key: string, uid: string, code: string) => {
                    const loc = articleLocations.find(l => l.code === code);
                    updateParts(key, current => current.map(p => p.uid === uid ? { ...p, locationCode: code, locationId: loc?.id } : p));
                  };
                  const setPartQuantity = (key: string, uid: string, value: string) =>
                    updateParts(key, current => current.map(p => p.uid === uid ? { ...p, quantity: parseFloat(value) || 0 } : p));
                  const addPart = (key: string, total: number, seedFull?: boolean) =>
                    updateParts(key, current => {
                      // Une variante sans part repart d'abord de sa part pleine : « + » ajoute
                      // ainsi toujours une deuxième ligne, et la variante passe en répartition.
                      const base = seedFull && current.length === 0 ? [newDraft({ locationCode: '', quantity: total })] : current;
                      // Nouvelle part : on propose ce qui n'est encore attribué nulle part.
                      const left = remainingToAllocate(total, base);
                      return [...base, newDraft({ locationCode: '', quantity: left > 0 ? left : 0 })];
                    });

                  const renderPartRow = (key: string, part: DraftAllocation, onRemove: () => void, dense?: boolean) => (
                    <div key={part.uid} className="flex items-center gap-1.5">
                      <select
                        value={part.locationCode}
                        onChange={(e) => setPartLocation(key, part.uid, e.target.value)}
                        className={`${dense ? 'h-7 text-[10px]' : 'h-8 text-[11px]'} flex-1 min-w-0 rounded-lg border-stone-200 font-bold bg-white font-mono`}
                      >
                        <option value="">📍 Emplacement…</option>
                        {locationOptions}
                      </select>
                      <Input
                        type="number" min={0} step="any"
                        value={part.quantity || ''}
                        onChange={(e) => setPartQuantity(key, part.uid, e.target.value)}
                        className={`${dense ? 'h-7 w-20' : 'h-8 w-24'} rounded-lg border-stone-200 text-[11px] font-black text-right`}
                        placeholder="Qté"
                      />
                      <button
                        type="button"
                        onClick={onRemove}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                        title="Retirer cet emplacement"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );

                  // Article sans ventilation : une seule série de parts, sous la clé ''.
                  const wholeParts = articleParts[''] || [];
                  const totalQty = Number(article.quantity) || 0;
                  const reste = unplacedQuantity(totalQty, wholeParts, validCodes);

                  // Article ventilé : l'état de chaque variante, puis le résumé de l'article.
                  const variantStates = dimension
                    ? groupInboundVariants(article).map(group => {
                        const variantParts = articleParts[group.key] || [];
                        return { group, parts: variantParts, reste: unplacedQuantity(group.quantity, variantParts, validCodes) };
                      })
                    : [];
                  const placedCount = variantStates.filter(v => v.reste === 0).length;
                  const excessCount = variantStates.filter(v => v.reste < 0).length;
                  const listOpen = openVariantLists[article.id] ?? variantStates.length <= MANY_VARIANTS;
                  const filterText = normalizeVariantValue(variantFilters[article.id]);
                  const visibleVariants = filterText
                    ? variantStates.filter(v => normalizeVariantValue(`${v.group.label} ${variantHint(dimension, v.group)}`).includes(filterText))
                    : variantStates;

                  return (
                    <div key={article.id} className="p-3 rounded-xl border border-stone-100 bg-stone-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-stone-900 uppercase">{productName}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {article.color && article.color !== 'various' && <span className="text-[9px] font-bold text-stone-500 uppercase bg-white px-2 py-0.5 rounded border border-stone-200">{article.color}</span>}
                            {article.size && article.size !== 'various' && <span className="text-[9px] font-bold text-stone-500 uppercase bg-white px-2 py-0.5 rounded border border-stone-200">{article.size}</span>}
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{article.quantity} {article.unitOfMeasure}</span>
                          </div>
                        </div>
                        <select
                          value={articleStore}
                          onChange={(e) => {
                            setStoreSelections(prev => ({ ...prev, [article.id]: e.target.value }));
                            // Les emplacements appartiennent à un entrepôt précis : les parts de cet
                            // article sont vidées plutôt qu'écartées en silence à l'enregistrement.
                            setLocationAllocations(prev => ({ ...prev, [article.id]: initialArticleAllocations(article) }));
                            setSplitVariants({});
                          }}
                          className="h-8 rounded-lg border-stone-200 text-xs font-bold bg-white shrink-0"
                        >
                          {warehouseOptions.map((w: any) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Répartition sur un ou plusieurs emplacements — seulement si cet
                          entrepôt a été découpé en zones. Une référence remplit rarement
                          un seul rack. */}
                      {articleLocations.length > 0 && !dimension && (
                        <div className="mt-2.5 pt-2.5 border-t border-stone-200 space-y-1.5">
                          {wholeParts.map(part => renderPartRow('', part,
                            () => updateParts('', current => current.filter(p => p.uid !== part.uid))))}

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => addPart('', totalQty)}
                              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                            >
                              <MapPin className="w-3 h-3" /> {wholeParts.length === 0 ? 'Répartir sur des emplacements' : 'Ajouter un emplacement'}
                            </button>
                            {wholeParts.length > 0 && <PlacementCounter reste={reste} unit={unit} />}
                          </div>
                        </div>
                      )}

                      {/* Article ventilé : chaque couleur / qualité / taille choisit son
                          emplacement, et se répartit sur plusieurs racks si besoin. */}
                      {articleLocations.length > 0 && dimension && words && variantStates.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-stone-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenVariantLists(prev => ({ ...prev, [article.id]: !listOpen }))}
                              aria-expanded={listOpen}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-colors"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${listOpen ? '' : '-rotate-90'}`} />
                              <span className={placedCount === variantStates.length ? 'text-emerald-600' : 'text-amber-600'}>
                                {placedCount}/{variantStates.length} {words.plural} placées
                              </span>
                              {excessCount > 0 && <span className="text-red-600">· {excessCount} en excès</span>}
                            </button>
                            {/* Raccourci : toutes les variantes au même rack, retouchables ensuite. */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[9px] font-bold text-stone-400 uppercase whitespace-nowrap">Toutes les {words.plural} →</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  const loc = articleLocations.find(l => l.code === e.target.value);
                                  if (!loc) return;
                                  setLocationAllocations(prev => ({ ...prev, [article.id]: fillArticleAllocations(article, loc) }));
                                  setSplitVariants({});
                                }}
                                className="h-7 min-w-0 max-w-[12rem] px-2 rounded-lg border border-stone-200 text-[10px] font-bold bg-white font-mono"
                              >
                                <option value="">📍 Emplacement…</option>
                                {locationOptions}
                              </select>
                            </div>
                          </div>

                          {listOpen && (
                            <div className="mt-2 space-y-1.5">
                              {variantStates.length > MANY_VARIANTS && (
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                                  <Input
                                    value={variantFilters[article.id] || ''}
                                    onChange={(e) => setVariantFilters(prev => ({ ...prev, [article.id]: e.target.value }))}
                                    // Entrée dans le filtre ne doit jamais valider l'entrée en stock.
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                    placeholder={`Filtrer les ${words.plural}…`}
                                    className="h-8 pl-8 rounded-lg border-stone-200 text-[11px] font-bold bg-white"
                                  />
                                </div>
                              )}

                              {visibleVariants.map(({ group, parts, reste: variantReste }) => {
                                // Une part pleine (ou aucune) : une seule ligne, juste le choix du
                                // rack. Répartie sur plusieurs racks : une ligne par part.
                                const splitId = `${article.id}::${group.key}`;
                                const compact = !splitVariants[splitId] && isSingleFullPart(parts, group.quantity);
                                const hint = variantHint(dimension, group);
                                return (
                                  <div key={group.key || '__sans-libelle'} className="px-2 py-1.5 rounded-lg bg-white border border-stone-200">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <div className="flex items-baseline gap-1.5 min-w-0 flex-1 basis-36">
                                        <span className="text-[10px] font-black text-stone-800 uppercase truncate" title={group.label}>
                                          {group.label || 'Sans libellé'}
                                        </span>
                                        {hint && <span className="text-[9px] font-bold text-stone-400 truncate" title={hint}>{hint}</span>}
                                        <span className="ml-auto text-[9px] font-black text-emerald-600 whitespace-nowrap">
                                          {group.quantity.toLocaleString('fr-FR')} {unit}
                                        </span>
                                      </div>
                                      {compact && (
                                        <select
                                          value={parts[0]?.locationCode || ''}
                                          aria-label={`Emplacement ${group.label}`}
                                          onChange={(e) => {
                                            const code = e.target.value;
                                            const loc = articleLocations.find(l => l.code === code);
                                            updateParts(group.key, current => current.length === 0
                                              ? [newDraft({ locationCode: code, locationId: loc?.id, quantity: group.quantity })]
                                              : current.map((p, i) => i === 0 ? { ...p, locationCode: code, locationId: loc?.id } : p));
                                          }}
                                          className="h-7 flex-1 basis-40 min-w-0 rounded-lg border-stone-200 text-[10px] font-bold bg-white font-mono"
                                        >
                                          <option value="">📍 Emplacement…</option>
                                          {locationOptions}
                                        </select>
                                      )}
                                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                                        <PlacementCounter reste={variantReste} short />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            addPart(group.key, group.quantity, true);
                                            setSplitVariants(prev => ({ ...prev, [splitId]: true }));
                                          }}
                                          className="p-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                                          title="Répartir sur un emplacement de plus"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    {!group.label && (
                                      <p className="mt-1 flex items-center gap-1 text-[9px] font-bold text-red-600">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        Sans libellé : invisible dans le stock — corrigez la ventilation du dossier
                                      </p>
                                    )}
                                    {!compact && (
                                      <div className="mt-1.5 space-y-1">
                                        {parts.map(part => renderPartRow(group.key, part, () => {
                                          // Retirer une part laisse la variante répartie : la part
                                          // restante peut retomber sur la quantité de la variante
                                          // pendant la saisie sans que la ligne se replie. Retirer
                                          // la dernière rend la ligne compacte (le choix du rack),
                                          // la variante gardant toujours une part pleine.
                                          const lastPart = parts.every(p => p.uid === part.uid);
                                          setSplitVariants(prev => ({ ...prev, [splitId]: !lastPart }));
                                          updateParts(group.key, current => {
                                            const next = current.filter(p => p.uid !== part.uid);
                                            return next.length > 0 ? next : [newDraft({ locationCode: '', quantity: group.quantity })];
                                          });
                                        }, true))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {visibleVariants.length === 0 && (
                                <p className="text-[10px] font-bold text-stone-400 text-center py-2">
                                  Aucune {words.singular} ne correspond.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 items-center mt-5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <AlertTriangle className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-[9px] font-bold text-emerald-700 uppercase leading-tight">
                  La date d'entrée en stock sera appliquée aux {associatedArticles.length} articles de cet arrivage ("Inventaire Réceptionné").
                </p>
              </div>
            </div>
          )}
        </form>

        <DialogFooter className="p-6 bg-stone-50 border-t border-stone-100 flex flex-row gap-3">
          <Button
            variant={isAlreadyInStock ? "default" : "ghost"}
            disabled={isSubmitting || isUnvalidating}
            onClick={() => onOpenChange(false)}
            className={`${isAlreadyInStock ? 'flex-1 bg-stone-800 hover:bg-stone-900 text-white rounded-xl' : 'flex-1 hover:bg-stone-200'} text-[10px] font-black uppercase tracking-widest h-11`}
          >
            {isAlreadyInStock ? "Fermer" : "Annuler"}
          </Button>
          {entreeAAnnuler && (
            <Button
              variant="outline"
              disabled={isUnvalidating}
              onClick={handleUnvalidate}
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-[10px] font-black uppercase tracking-widest h-11 rounded-xl gap-2"
            >
              {isUnvalidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Dévalidation...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Dévalider
                </>
              )}
            </Button>
          )}
          {!isAlreadyInStock && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-emerald-600/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Finaliser l'Entrée
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
