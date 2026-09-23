"use client";

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, FileDown, Loader2, MapPin, Search, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getArticleFrenchName } from '@/lib/product-name-utils';
import {
  articleInboundVariants, articleVariantDimension, breakdownRowQuantity, compareLocationCodes,
  variantKey, ventilationIgnoree, type VariantDimension,
} from '@/lib/warehouse-locations';
import {
  qualiteDeLArticle, specificationsArticle, specificationsEnLigne,
  type LigneSpecification,
} from '@/lib/specification-produit';

/**
 * Fiche d'un dossier d'arrivage pour les magasins : la même lecture que dans /gestion, mais
 * limitée aux QUANTITÉS. Aucun prix d'achat, coût de revient, droit de douane, fret ou montant
 * de facture n'est rendu ici — y compris les `priceOverride` portés par les lignes de
 * ventilation, qu'on ne lit jamais.
 *
 * La fiche se lit comme un document d'entreprise : un en-tête (dossier, fournisseur, dates,
 * statut), quatre chiffres clés, puis un tableau — une ligne par référence, une ligne par
 * variante, un total par ventilation et un total général qui se recoupent à l'œil.
 */

interface ArrivalDossierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any | null;
  articles: any[];
  /** Mouvements d'entrée de ce dossier, pour indiquer où chaque référence a été rangée. */
  movements?: any[];
  stores?: any[];
  /** Pour les noms français (qualité → famille → pôle) et le regroupement par pôle du PDF. */
  categories?: any[];
  generalCategories?: any[];
  isEnteredInStock?: boolean;
  stockEntryDate?: string | null;
}

type BreakdownKind = 'quality' | 'color' | 'size';

const fmtQty = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });

const texte = (v: any) => String(v ?? '').trim();

const isVarious = (v: any) => texte(v).toLowerCase() === 'various';

/**
 * Le premier libellé utilisable. « various » est la marque interne d'un article ventilé, pas une
 * valeur : il ne s'affiche jamais, l'article se lit alors ligne par ligne dans sa ventilation.
 */
const premierLibelle = (...valeurs: any[]) =>
  valeurs.map(texte).find(v => v && !isVarious(v)) || '';

/**
 * Quantité d'une ligne de ventilation : `quantity` pour les qualités et les tailles, `rolls` pour
 * les couleurs. Même lecture que l'entrée en stock (breakdownRowQuantity), sinon une couleur
 * comptée en rouleaux s'affiche à zéro et disparaît de la fiche.
 */
const rowQty = breakdownRowQuantity;

/** « 150CM », « 150 cm » et « 150cm » désignent la même mesure. */
function sameMeasure(a: any, b: any): boolean {
  const norm = (v: any) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
}

function articleName(a: any): string {
  return (a.nameFR || a.productName || a.name || a.categoryId || 'Article').trim();
}

/**
 * Les caractéristiques techniques de l'article, lues dans le modèle de son type (grammage et
 * largeur d'un tissu, longueur et curseur d'une fermeture, poids du cône d'un fil, épaisseur d'un
 * accessoire…). On écarte celles qu'une autre colonne dit déjà : la largeur est souvent portée par
 * la taille (« 150CM »), la taille d'un curseur aussi.
 */
function caracteristiques(a: any, categories: any[], generalCategories: any[]): LigneSpecification[] {
  return specificationsArticle(a, categories, generalCategories).filter(l =>
    !sameMeasure(a?.size, l.valeur) &&
    !sameMeasure(a?.size, `${l.valeur}cm`) &&
    !sameMeasure(a?.quality, l.valeur));
}

/** Le libellé d'une ligne de ventilation couleur, sans jamais imprimer « various ». */
const libelleCouleur = (r: any) => premierLibelle(r?.colorCode, r?.color, r?.description);

/** Où une variante (ou l'article entier, clé '') a été rangée à l'entrée en stock du dossier. */
type VariantPlacement = {
  key: string;
  label: string;
  /** Nom français d'une qualité, description d'une couleur ou d'une taille. */
  sub?: string;
  locs: { code: string; qty: number; storeId?: string }[];
  /** Quantité entrée sans emplacement. */
  unplaced: number;
};

/**
 * Ce qui est déjà entré en stock pour une référence du dossier, au total et variante par variante.
 * C'est ce qui distingue une ligne reçue et rangée d'une ligne encore attendue.
 */
type EntryInfo = {
  /** Dimension sur laquelle l'article entre en stock (qualité, couleur ou taille), ou null. */
  dimension: VariantDimension | null;
  total: number;
  /** Quantité entrée par variante, indexée par variantKey ('' pour l'article entier). */
  byKey: Record<string, number>;
};

const DIMENSION_NOUN: Record<VariantDimension, [string, string]> = {
  quality: ['qualité', 'qualités'],
  color: ['couleur', 'couleurs'],
  size: ['taille', 'tailles'],
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Total d'une ventilation telle qu'elle est affichée, ligne à ligne. */
const totalLignes = (rows: any[]) => round3(rows.reduce((s, r) => s + rowQty(r), 0));

/**
 * Regroupe les entrées d'un article par variante — lue dans le champ de SA dimension ventilée,
 * jamais dans les autres qui peuvent valoir « various » — puis par emplacement. Les variantes
 * suivent l'ordre de la ventilation ; un libellé de mouvement qui n'y figure plus (ventilation
 * retouchée depuis l'entrée) est ajouté à la suite plutôt que perdu.
 */
function groupPlacements(article: any, movs: any[]): VariantPlacement[] {
  const dimension = articleVariantDimension(article);
  const rows = new Map<string, VariantPlacement>();

  if (dimension) {
    for (const line of articleInboundVariants(article)) {
      if (rows.has(line.key)) continue;
      const sub = texte(dimension === 'quality' ? line.row?.nameFR : line.row?.description);
      // « various » n'est pas un libellé de rangement : on prend alors la description de la ligne.
      const label = premierLibelle(line.label, sub);
      rows.set(line.key, {
        key: line.key, label, locs: [], unplaced: 0,
        sub: sub && sub.toLowerCase() !== label.toLowerCase() ? sub : undefined,
      });
    }
  }

  for (const m of movs) {
    const value = dimension ? String(m[dimension] ?? '').trim() : '';
    const key = dimension ? variantKey({ dimension, value }) : '';
    let row = rows.get(key);
    if (!row) {
      row = { key, label: premierLibelle(value), locs: [], unplaced: 0 };
      rows.set(key, row);
    }
    const qty = Number(m.quantity) || 0;
    if (!m.locationCode) {
      row.unplaced = round3(row.unplaced + qty);
      continue;
    }
    const hit = row.locs.find(l => l.code === m.locationCode && l.storeId === m.storeId);
    if (hit) hit.qty = round3(hit.qty + qty);
    else row.locs.push({ code: m.locationCode, qty, storeId: m.storeId });
  }

  // Une ligne de ventilation sans aucun mouvement n'a rien à montrer ici.
  return Array.from(rows.values())
    .filter(r => r.locs.length > 0 || r.unplaced > 0)
    .map(r => ({ ...r, locs: r.locs.sort((a, b) => compareLocationCodes(a.code, b.code)) }));
}

/** Une ligne du tableau sous une référence : une variante annoncée, ou une entrée hors ventilation. */
type LigneDetail = {
  label: string;
  sub?: string;
  /** Quantité annoncée par la ventilation ; null quand la ligne vient des seuls mouvements. */
  qty: number | null;
  /** Quantité entrée en stock ; undefined quand cette ligne n'entre pas en stock pour elle-même. */
  entered?: number;
  locs: { code: string; qty: number; storeId?: string }[];
  unplaced: number;
  horsVentilation?: boolean;
};

/** Une ventilation d'un article (ses qualités, ses couleurs ou ses tailles) et son total. */
type GroupeDetail = {
  cle: BreakdownKind;
  titre: string;
  lignes: LigneDetail[];
  /** Total annoncé des lignes de la ventilation. */
  total: number;
  /** Total entré en stock — seulement pour la ventilation qui fait foi. */
  totalEntre?: number;
  faitFoi: boolean;
  /** Écart entre le total de la ventilation et la quantité de l'article. */
  ecart: number;
};

/**
 * Les ventilations d'une référence, prêtes à afficher : une ligne par variante, sa quantité, ce
 * qui en est entré en stock et où elle a été rangée. Aucun total n'est recalculé autrement
 * qu'avant : le total d'une ventilation reste la somme de ses lignes, et le total entré d'un
 * article reste celui de ses mouvements.
 */
function groupesDeLArticle(
  a: any,
  entry: EntryInfo | undefined,
  placements: VariantPlacement[],
  categories: any[],
  generalCategories: any[],
): GroupeDetail[] {
  const quantite = Number(a.quantity) || 0;
  const ventilee = entry?.dimension ?? null;

  // La ventilation qui fait foi pour l'entrée en stock : ses lignes, et elles seules, portent un
  // état « entré / en attente ».
  const keyByRow = new Map<any, string>();
  for (const line of articleInboundVariants(a)) if (line.row) keyByRow.set(line.row, line.key);
  const placementByKey = new Map(placements.map(p => [p.key, p]));
  const byKey: Record<string, number> = entry?.byKey ?? {};

  const construire = (
    cle: BreakdownKind,
    rows: any[],
    libelle: (r: any) => { label: string; sub?: string },
  ): GroupeDetail => {
    const faitFoi = ventilee === cle;
    const vues = new Set<string>();
    const lignes: LigneDetail[] = rows.map(r => {
      const base = libelle(r);
      const k = faitFoi ? keyByRow.get(r) : undefined;
      if (k !== undefined) vues.add(k);
      const p = k !== undefined ? placementByKey.get(k) : undefined;
      return {
        label: base.label || '—',
        sub: base.sub || undefined,
        qty: rowQty(r),
        entered: faitFoi ? (k === undefined ? undefined : (byKey[k] ?? 0)) : undefined,
        locs: p?.locs ?? [],
        unplaced: p?.unplaced ?? 0,
      };
    });

    // Marchandise entrée sous un libellé qui n'est plus dans la ventilation (ventilation retouchée
    // depuis l'entrée) : à montrer, sinon la colonne « entrée en stock » ne se recoupe plus.
    if (faitFoi) {
      for (const [k, qte] of Object.entries(byKey)) {
        if (vues.has(k)) continue;
        const p = placementByKey.get(k);
        lignes.push({
          label: p?.label || k.split(':').slice(1).join(':') || 'Sans libellé',
          sub: p?.sub,
          qty: null,
          entered: qte,
          locs: p?.locs ?? [],
          unplaced: p?.unplaced ?? 0,
          horsVentilation: true,
        });
      }
    }

    const total = totalLignes(rows);
    return {
      cle,
      titre: DIMENSION_NOUN[cle][1].charAt(0).toUpperCase() + DIMENSION_NOUN[cle][1].slice(1),
      lignes,
      total,
      totalEntre: faitFoi ? (entry?.total ?? 0) : undefined,
      faitFoi,
      ecart: quantite > 0 ? round3(total - quantite) : 0,
    };
  };

  const groupes: GroupeDetail[] = [];

  const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.filter((r: any) => rowQty(r) > 0) : [];
  if (qualities.length > 0) {
    groupes.push(construire('quality', qualities, (r: any) => {
      // Le code de qualité (« CL-5 ») est le nom du métier ; les caractéristiques de la ligne
      // priment sur celles de l'article, c'est ce qui distingue deux qualités du même produit.
      const code = qualiteDeLArticle(a, r);
      const nom = texte(r.nameFR);
      const detail = specificationsEnLigne(a, categories, generalCategories, r);
      const taille = premierLibelle(r.size);
      return {
        label: nom || code || '—',
        sub: [
          nom && code ? code : null,
          detail || null,
          taille && !detail.toLowerCase().includes(taille.toLowerCase()) ? taille : null,
        ].filter(Boolean).join(' · '),
      };
    }));
  }

  const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.filter((r: any) => rowQty(r) > 0) : [];
  if (colors.length > 0) {
    groupes.push(construire('color', colors, (r: any) => {
      const label = libelleCouleur(r);
      const desc = premierLibelle(r.description);
      return { label, sub: desc && desc.toLowerCase() !== label.toLowerCase() ? desc : '' };
    }));
  }

  const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.filter((r: any) => rowQty(r) > 0) : [];
  if (sizes.length > 0) {
    groupes.push(construire('size', sizes, (r: any) => ({
      label: premierLibelle(r.size), sub: premierLibelle(r.description),
    })));
  }

  return groupes;
}

/** Cumul des quantités par unité : additionner des mètres et des sacs n'a pas de sens. */
function cumulParUnite(list: any[], entries: Record<string, EntryInfo>): [string, { qty: number; entered: number }][] {
  const acc: Record<string, { qty: number; entered: number }> = {};
  for (const a of list || []) {
    const unit = (a.unitOfMeasure || 'pcs').trim();
    const slot = (acc[unit] ||= { qty: 0, entered: 0 });
    slot.qty = round3(slot.qty + (Number(a.quantity) || 0));
    slot.entered = round3(slot.entered + (entries[a.id]?.total || 0));
  }
  return Object.entries(acc).sort((x, y) => y[1].qty - x[1].qty);
}

/**
 * Les colonnes du tableau. Même gabarit pour l'en-tête, les références, les variantes et les
 * totaux : c'est cet alignement qui fait qu'on lit un document et pas une suite d'encadrés.
 * Sur téléphone, qualité / couleur / taille passent sous la désignation.
 */
const GRILLE_AVEC_ENTREE =
  'grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem_6rem_6.5rem] gap-x-3';
const GRILLE_SANS_ENTREE =
  'grid grid-cols-[minmax(0,1fr)_5rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem_6rem] gap-x-3';

const RANG = 'px-4 sm:px-6';

export default function ArrivalDossierModal({
  open, onOpenChange, facture, articles, movements = [], stores = [],
  categories = [], generalCategories = [], isEnteredInStock, stockEntryDate,
}: ArrivalDossierModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  // Le détail des variantes est affiché d'office : c'est ce qu'on vient vérifier sur un dossier.
  const [detail, setDetail] = useState(true);

  // Même nom français que partout ailleurs, plutôt que le nom interne anglais de la famille.
  const frName = (a: any) => getArticleFrenchName(a, categories, generalCategories) || articleName(a);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { exportArrivalPackingPDF } = await import('@/lib/pdf-arrival-packing');
      await exportArrivalPackingPDF({
        facture, articles, categories, generalCategories, movements, stores,
        stockEntryDate, isEnteredInStock,
      });
    } catch (e: any) {
      console.error('[packing PDF]', e);
      toast({ variant: 'destructive', title: 'PDF impossible', description: e?.message || 'La génération du PDF a échoué.' });
    } finally {
      setExporting(false);
    }
  };

  const totalCbm = useMemo(
    () => (articles || []).reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0),
    [articles]
  );

  // Ce qui est déjà entré en stock, référence par référence et variante par variante : le lecteur
  // doit voir d'un coup d'œil la ligne reçue et la ligne encore attendue.
  const entriesByArticle = useMemo(() => {
    const inByArticle: Record<string, any[]> = {};
    for (const m of movements || []) {
      if (m?.type !== 'IN' || !m.articleId) continue;
      (inByArticle[m.articleId] ||= []).push(m);
    }
    const out: Record<string, EntryInfo> = {};
    for (const a of articles || []) {
      const dimension = articleVariantDimension(a);
      const info: EntryInfo = { dimension, total: 0, byKey: {} };
      for (const m of inByArticle[a.id] || []) {
        const qty = Number(m.quantity) || 0;
        info.total = round3(info.total + qty);
        const key = dimension ? variantKey({ dimension, value: String(m[dimension] ?? '').trim() }) : '';
        info.byKey[key] = round3((info.byKey[key] || 0) + qty);
      }
      out[a.id] = info;
    }
    return out;
  }, [articles, movements]);

  // Tant qu'aucune entrée n'a été écrite, le bandeau « En attente » de l'en-tête suffit : inutile
  // de répéter l'attente sur chaque ligne.
  const hasEntries = useMemo(() => (movements || []).some(m => m?.type === 'IN'), [movements]);

  // Emplacements où chaque référence a été rangée à l'entrée en stock de ce dossier, variante
  // par variante quand l'article est ventilé (qualité, couleur ou taille).
  const placementsByArticle = useMemo(() => {
    const inByArticle: Record<string, any[]> = {};
    for (const m of movements || []) {
      if (m?.type !== 'IN' || !m.articleId) continue;
      (inByArticle[m.articleId] ||= []).push(m);
    }
    const out: Record<string, VariantPlacement[]> = {};
    for (const a of articles || []) {
      const movs = inByArticle[a.id];
      // Rien de rangé nulle part : pas d'emplacement à montrer, comme avant.
      if (movs?.some(m => m.locationCode)) out[a.id] = groupPlacements(a, movs);
    }
    return out;
  }, [articles, movements]);

  const visibleArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(articles || [])].sort((a, b) => frName(a).localeCompare(frName(b), 'fr'));
    if (!q) return list;
    return list.filter(a => {
      const haystack = [
        frName(a), articleName(a), a.categoryId, a.color, a.size, a.quality, a.specs,
        // Les caractéristiques du type : chercher « 180 » doit retrouver le tissu en 180 g/m².
        specificationsEnLigne(a, categories, generalCategories),
        ...(a.colorBreakdown || []).map((r: any) => `${r.colorCode || ''} ${r.description || ''} ${r.color || ''}`),
        ...(a.sizeBreakdown || []).map((r: any) => `${r.size || ''} ${r.description || ''}`),
        ...(a.qualityBreakdown || []).map((r: any) =>
          `${r.quality || ''} ${r.nameFR || ''} ${specificationsEnLigne(a, categories, generalCategories, r)}`),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [articles, search, categories, generalCategories]);

  // Les chiffres clés de l'en-tête portent sur tout le dossier ; le total du bas sur ce qui est
  // affiché. Les deux se rejoignent dès qu'aucune recherche ne filtre.
  const totauxDossier = useMemo(
    () => cumulParUnite(articles || [], entriesByArticle),
    [articles, entriesByArticle]
  );
  const footerTotals = useMemo(
    () => cumulParUnite(visibleArticles, entriesByArticle),
    [visibleArticles, entriesByArticle]
  );

  if (!facture) return null;

  const q = search.trim().toLowerCase();
  const montrerDetail = detail || Boolean(q);
  const GRILLE = hasEntries ? GRILLE_AVEC_ENTREE : GRILLE_SANS_ENTREE;
  const nbArticles = (articles || []).length;

  const ligneUnite = (valeur: number, unit: string) => `${fmtQty(valeur)} ${unit}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearch(''); setDetail(true); } onOpenChange(o); }}>
      <DialogContent className="max-w-4xl p-0 gap-0 rounded-2xl overflow-hidden border border-stone-200 shadow-2xl bg-white">
        {/* ── En-tête du dossier ── */}
        <header className={`${RANG} pt-5 pb-4 border-b border-stone-200`}>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Dossier d'arrivage
              </p>
              <DialogTitle className="text-xl font-bold tracking-tight text-stone-900 mt-1 break-all">
                {facture.id}
              </DialogTitle>
              <p className="text-[13px] font-semibold text-stone-600 mt-1">
                {premierLibelle(facture.supplierId, facture.supplier) || 'Fournisseur non renseigné'}
              </p>
            </div>
            {isEnteredInStock ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Entré en stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" /> En attente d'entrée en stock
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Meta libelle="Date d'arrivée" valeur={facture.arrivalDate || '—'} />
            <Meta libelle="Date d'entrée en stock" valeur={stockEntryDate || 'En attente'} />
            <Meta libelle="Bon de livraison" valeur={premierLibelle(facture.noBL) || '—'} />
            <Meta libelle="Volume" valeur={totalCbm > 0 ? `${fmtQty(totalCbm)} m³` : '—'} />
          </dl>
        </header>

        {/* ── Chiffres clés ── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 border-b border-stone-200 bg-stone-50">
          <Chiffre libelle="Références" index={0} valeurs={[String(nbArticles)]} />
          <Chiffre
            libelle="Quantité annoncée" index={1}
            valeurs={totauxDossier.map(([unit, t]) => ligneUnite(t.qty, unit))}
          />
          <Chiffre
            libelle="Entré en stock" index={2}
            valeurs={totauxDossier.map(([unit, t]) => (t.entered > 0 ? ligneUnite(t.entered, unit) : '—'))}
          />
          <Chiffre
            libelle="Reste à entrer" index={3}
            alerte
            valeurs={totauxDossier.map(([unit, t]) => {
              const reste = round3(t.qty - t.entered);
              return reste > 0.001 ? ligneUnite(reste, unit) : '—';
            })}
          />
        </section>

        {/* ── Barre d'outils ── */}
        <div className={`${RANG} py-3 border-b border-stone-200 flex flex-wrap items-center gap-2`}>
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Chercher un article, une couleur, une taille, une qualité…"
              className="h-10 pl-9 rounded-xl border-stone-200 text-[13px] font-medium"
            />
            {search && (
              <button
                type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDetail(d => !d)}
            aria-expanded={montrerDetail}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-stone-200 bg-white text-[12px] font-semibold text-stone-700 hover:bg-stone-50 transition-colors whitespace-nowrap"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${montrerDetail ? '' : '-rotate-90'}`} />
            {montrerDetail ? 'Masquer le détail' : 'Afficher le détail'}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting || nbArticles === 0}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-stone-900 text-white text-[12px] font-semibold hover:bg-stone-800 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            Packing PDF
          </button>
        </div>

        {/* ── Tableau des références ── */}
        <div className="max-h-[52vh] overflow-y-auto bg-white">
          {/* En-tête de colonnes */}
          <div className={`${GRILLE} ${RANG} sticky top-0 z-10 py-2 bg-stone-100 border-b border-stone-200`}>
            <EnTeteColonne>Désignation</EnTeteColonne>
            <EnTeteColonne className="hidden md:block">Qualité</EnTeteColonne>
            <EnTeteColonne className="hidden md:block">Couleur</EnTeteColonne>
            <EnTeteColonne className="hidden md:block">Taille</EnTeteColonne>
            <EnTeteColonne aDroite>Quantité</EnTeteColonne>
            {hasEntries && (
              <EnTeteColonne aDroite>
                <span className="md:hidden">Entré</span>
                <span className="hidden md:inline">Entrée en stock</span>
              </EnTeteColonne>
            )}
          </div>

          {visibleArticles.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] font-medium text-stone-500">
              {search ? `Aucun article ne correspond à « ${search} »` : 'Aucun article dans ce dossier'}
            </p>
          ) : visibleArticles.map((a, index) => {
            const unit = a.unitOfMeasure || 'pcs';
            const placements = placementsByArticle[a.id] || [];
            const entry = entriesByArticle[a.id];
            const quantite = Number(a.quantity) || 0;
            const groupes = montrerDetail ? groupesDeLArticle(a, entry, placements, categories, generalCategories) : [];

            // Qualité, couleur, taille : la valeur fixe de l'article, ou le nombre de lignes de sa
            // ventilation, qui renvoie au détail juste en dessous.
            const nbQualites = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.filter((r: any) => rowQty(r) > 0).length : 0;
            const nbCouleurs = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.filter((r: any) => rowQty(r) > 0).length : 0;
            const nbTailles = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.filter((r: any) => rowQty(r) > 0).length : 0;
            const qualiteFixe = qualiteDeLArticle(a);
            const couleurFixe = premierLibelle(a.color);
            const tailleFixe = premierLibelle(a.size);
            // Une ventilation prime sur la valeur fixe de l'article : c'est elle qui décrit la
            // marchandise, et le nombre de lignes renvoie au détail juste en dessous.
            const colQualite = nbQualites > 0 ? `${nbQualites} ${nbQualites > 1 ? 'qualités' : 'qualité'}` : qualiteFixe || '';
            const colCouleur = nbCouleurs > 0 ? `${nbCouleurs} ${nbCouleurs > 1 ? 'couleurs' : 'couleur'}` : couleurFixe;
            const colTaille = nbTailles > 0 ? `${nbTailles} ${nbTailles > 1 ? 'tailles' : 'taille'}` : tailleFixe;

            // Les caractéristiques du type : grammage et largeur d'un tissu, longueur et curseur
            // d'une fermeture, poids du cône d'un fil, épaisseur d'un accessoire.
            const specs = caracteristiques(a, categories, generalCategories);
            const ligneSpecs = specs.length > 0
              ? specs.map(s => `${s.label} ${s.valeur}`).join(' · ')
              : premierLibelle(a.specs);

            // Une ventilation qui annonce plus que l'article n'est pas la sienne : l'entrée en
            // stock l'écarte et fait entrer l'article en une seule ligne. À dire, sinon le total
            // affiché et la marchandise rangée ne se recoupent plus.
            const ignoree = ventilationIgnoree(a);
            const avertissement = ignoree
              ? `Ventilation par ${DIMENSION_NOUN[ignoree.dimension][0]} écartée : ${fmtQty(ignoree.total)} ${unit} annoncés pour ${fmtQty(quantite)} — l'article entre en une seule ligne.`
              : '';

            // Le lieu n'est rappelé sur chaque emplacement que si la référence a été rangée dans
            // plusieurs lieux ; sinon il est dit une fois, sous la désignation.
            const storeIds = Array.from(new Set(placements.flatMap(p => p.locs.map(l => l.storeId || ''))));
            const plusieursLieux = stores.length > 1 && storeIds.length > 1;
            const lieuUnique = stores.length > 1 && storeIds.length === 1 && storeIds[0]
              ? (stores.find((s: any) => s.id === storeIds[0])?.name || storeIds[0])
              : '';
            // Article non ventilé : ses emplacements se lisent sur sa propre ligne. Un article
            // ventilé les porte ligne par ligne, dans son détail.
            const placementArticle = entry?.dimension ? undefined : placements.find(p => p.key === '');

            return (
              <div key={a.id} className="border-b border-stone-200 last:border-b-0">
                {/* Ligne de la référence */}
                <div className={`${GRILLE} ${RANG} py-3 items-start`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-stone-900 leading-snug break-words">
                      <span className="inline-block w-6 text-stone-400 font-semibold tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {frName(a)}
                    </p>
                    <div className="pl-6 space-y-0.5 mt-0.5">
                      {a.categoryId && frName(a).toLowerCase() !== String(a.categoryId).toLowerCase() && (
                        <p className="text-[11px] font-medium text-stone-500">{a.categoryId}</p>
                      )}
                      {ligneSpecs && <p className="text-[11px] font-medium text-stone-500">{ligneSpecs}</p>}
                      {/* Sur téléphone, les trois colonnes du milieu se lisent ici. */}
                      {(colQualite || colCouleur || colTaille) && (
                        <p className="md:hidden text-[11px] font-medium text-stone-500">
                          {[
                            colQualite && `Qualité ${colQualite}`,
                            colCouleur && `Couleur ${colCouleur}`,
                            colTaille && `Taille ${colTaille}`,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {lieuUnique && <p className="text-[11px] font-medium text-stone-500">Rangé à {lieuUnique}</p>}
                      {placementArticle && (
                        <Emplacements
                          locs={placementArticle.locs} unplaced={placementArticle.unplaced}
                          stores={stores} avecLieu={plusieursLieux}
                        />
                      )}
                      {avertissement && (
                        <p className="flex items-start gap-1 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{avertissement}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <CelluleTexte className="hidden md:block">{colQualite}</CelluleTexte>
                  <CelluleTexte className="hidden md:block">{colCouleur}</CelluleTexte>
                  <CelluleTexte className="hidden md:block">{colTaille}</CelluleTexte>
                  <div className="text-right leading-tight">
                    <p className="text-[13px] font-bold text-stone-900 tabular-nums">{fmtQty(quantite)}</p>
                    <p className="text-[10px] font-medium text-stone-400">{unit}</p>
                  </div>
                  {hasEntries && <CelluleEntree entered={entry?.total || 0} expected={quantite} />}
                </div>

                {/* Détail : une ligne par variante, puis le total de la ventilation */}
                {groupes.map(g => (
                  <div key={g.cle} className="bg-stone-50/70 border-t border-stone-200">
                    <div className={`${GRILLE} ${RANG} py-1.5`}>
                      <p className="md:col-span-4 pl-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                        {g.titre} · {g.lignes.length} ligne{g.lignes.length > 1 ? 's' : ''}
                        {hasEntries && !g.faitFoi && <span className="normal-case tracking-normal font-medium"> · pour information</span>}
                      </p>
                    </div>

                    {g.lignes.map((l, i) => {
                      const vise = Boolean(q) && `${l.label} ${l.sub || ''}`.toLowerCase().includes(q);
                      return (
                        <div
                          key={`${g.cle}-${i}`}
                          className={`${GRILLE} ${RANG} py-1 items-baseline ${vise ? 'bg-amber-50' : ''}`}
                        >
                          <div className="min-w-0 md:col-span-4 pl-6 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="rounded border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                              {l.label}
                            </span>
                            {l.sub && (
                              <span className="min-w-0 truncate text-[11px] font-medium text-stone-500" title={l.sub}>
                                {l.sub}
                              </span>
                            )}
                            {l.horsVentilation && (
                              <span className="text-[10px] font-medium text-amber-700">Entrée hors ventilation</span>
                            )}
                            <Emplacements
                              locs={l.locs} unplaced={l.unplaced} stores={stores} avecLieu={plusieursLieux}
                            />
                          </div>
                          <p className="text-right text-[12px] font-semibold text-stone-800 tabular-nums">
                            {l.qty === null ? '—' : fmtQty(l.qty)}
                          </p>
                          {hasEntries && (
                            <p className="text-right">
                              <MentionEntree entered={l.entered} qty={l.qty} />
                            </p>
                          )}
                        </div>
                      );
                    })}

                    <div className={`${GRILLE} ${RANG} py-1.5 border-t border-stone-200 bg-white items-baseline`}>
                      <p className="md:col-span-4 pl-6 text-[11px] font-semibold text-stone-700">
                        Total {DIMENSION_NOUN[g.cle][1]}
                        {quantite > 0 && (
                          Math.abs(g.ecart) < 0.001 ? (
                            <span className="ml-2 font-medium text-emerald-700">
                              égal à la quantité de la référence
                            </span>
                          ) : (
                            <span className="ml-2 font-medium text-amber-700">
                              écart de {fmtQty(Math.abs(g.ecart))} {unit} avec la quantité annoncée ({fmtQty(quantite)} {unit})
                            </span>
                          )
                        )}
                      </p>
                      <p className="text-right text-[12px] font-bold text-stone-900 tabular-nums">
                        {fmtQty(g.total)} <span className="font-medium text-stone-400">{unit}</span>
                      </p>
                      {hasEntries && (
                        <p className="text-right text-[12px] font-bold text-stone-900 tabular-nums">
                          {g.totalEntre !== undefined && (
                            <>{fmtQty(g.totalEntre)} <span className="font-medium text-stone-400">{unit}</span></>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Le total du bas additionne exactement les lignes affichées au-dessus : c'est là que la
              fiche se recoupe avec les chiffres clés de l'en-tête. */}
          {footerTotals.length > 0 && (
            <div className={`${GRILLE} ${RANG} sticky bottom-0 z-10 py-2.5 bg-stone-900 text-white items-start`}>
              <p className="md:col-span-4 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {search ? 'Total affiché' : 'Total du dossier'}
                <span className="ml-2 font-medium normal-case tracking-normal text-stone-400">
                  {visibleArticles.length}{search ? ` sur ${nbArticles}` : ''} référence{(search ? nbArticles : visibleArticles.length) > 1 ? 's' : ''}
                </span>
              </p>
              <div className="text-right space-y-0.5">
                {footerTotals.map(([unit, t]) => (
                  <p key={unit} className="text-[12px] font-bold tabular-nums whitespace-nowrap">
                    {fmtQty(t.qty)} <span className="font-medium text-stone-400">{unit}</span>
                  </p>
                ))}
              </div>
              {hasEntries && (
                <div className="text-right space-y-0.5">
                  {footerTotals.map(([unit, t]) => (
                    <p key={unit} className="text-[12px] font-bold tabular-nums whitespace-nowrap">
                      {fmtQty(t.entered)} <span className="font-medium text-stone-400">{unit}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Une information d'en-tête : son libellé au-dessus, sa valeur en dessous. */
function Meta({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{libelle}</dt>
      <dd className="text-[13px] font-semibold text-stone-900 mt-0.5 truncate">{valeur}</dd>
    </div>
  );
}

/**
 * Un chiffre clé du dossier. Plusieurs lignes quand les unités diffèrent : des mètres et des sacs
 * ne s'additionnent pas, et les quatre cases gardent alors les mêmes lignes dans le même ordre.
 */
function Chiffre({ libelle, valeurs, index, alerte }: {
  libelle: string; valeurs: string[]; index: number; alerte?: boolean;
}) {
  const lignes = valeurs.length > 0 ? valeurs : ['—'];
  return (
    <div className={`px-4 sm:px-6 py-3 border-stone-200 ${index % 2 === 0 ? 'border-r' : ''} ${index < 3 ? 'sm:border-r' : 'sm:border-r-0'} ${index < 2 ? 'border-b sm:border-b-0' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{libelle}</p>
      <div className="mt-1 space-y-0.5">
        {lignes.map((v, i) => (
          <p
            key={i}
            className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${
              v === '—' ? 'text-stone-300' : alerte ? 'text-amber-700' : 'text-stone-900'
            }`}
          >
            {v}
          </p>
        ))}
      </div>
    </div>
  );
}

function EnTeteColonne({ children, aDroite, className = '' }: {
  children: React.ReactNode; aDroite?: boolean; className?: string;
}) {
  return (
    <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500 ${aDroite ? 'text-right' : ''} ${className}`}>
      {children}
    </p>
  );
}

function CelluleTexte({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[12px] font-medium text-stone-700 leading-snug break-words ${className}`}>
      {children || <span className="text-stone-300">—</span>}
    </p>
  );
}

/**
 * L'état d'entrée en stock d'une référence : reçue en entier, partiellement entrée, encore
 * attendue, ou entrée au-delà de ce qui était annoncé. C'est la première chose qu'un magasinier
 * cherche sur la fiche d'un dossier.
 */
function CelluleEntree({ entered, expected }: { entered: number; expected: number }) {
  const etat =
    entered <= 0 ? { mot: 'En attente', couleur: 'text-amber-700' } :
    expected <= 0 || Math.abs(entered - expected) < 0.001 ? { mot: 'Entré', couleur: 'text-emerald-700' } :
    entered > expected ? { mot: 'Excédent', couleur: 'text-amber-700' } :
    { mot: 'Partiel', couleur: 'text-amber-700' };
  return (
    <div className="text-right leading-tight">
      <p className="text-[13px] font-bold text-stone-900 tabular-nums">
        {entered > 0 ? fmtQty(entered) : <span className="text-stone-300">—</span>}
      </p>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${etat.couleur}`}>{etat.mot}</p>
    </div>
  );
}

/** Ce qui distingue, ligne à ligne, la marchandise déjà entrée de celle qui est encore attendue. */
function MentionEntree({ entered, qty }: { entered?: number; qty: number | null }) {
  // Une ligne sans libellé n'entre jamais en stock : mieux vaut le dire que laisser un blanc.
  if (entered === undefined) {
    return <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">Hors entrée</span>;
  }
  if (entered <= 0) {
    return <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">En attente</span>;
  }
  if (qty !== null && Math.abs(entered - qty) < 0.001) {
    return <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Entré</span>;
  }
  return <span className="text-[12px] font-semibold text-amber-700 tabular-nums">{fmtQty(entered)}</span>;
}

/**
 * Où la marchandise a été rangée à l'entrée en stock : le code d'emplacement, et sa quantité dès
 * qu'il y en a plusieurs. Le lieu n'est rappelé que si la référence est répartie entre plusieurs
 * magasins ; sinon il est dit une seule fois sous la désignation.
 */
function Emplacements({ locs, unplaced, stores, avecLieu }: {
  locs: { code: string; qty: number; storeId?: string }[];
  unplaced: number;
  stores: any[];
  avecLieu: boolean;
}) {
  if (locs.length === 0 && unplaced <= 0) return null;
  const nomLieu = (id?: string) => stores.find((s: any) => s.id === id)?.name || id || '';
  const avecQte = locs.length > 1 || unplaced > 0;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-medium text-stone-500">
      <MapPin className="w-3 h-3 shrink-0 text-stone-400 self-center" />
      {locs.map(l => (
        <span key={`${l.storeId || ''}-${l.code}`} className="whitespace-nowrap">
          <span className="font-mono font-semibold text-stone-700">{l.code}</span>
          {avecQte && <span className="tabular-nums"> · {fmtQty(l.qty)}</span>}
          {avecLieu && l.storeId && <span> · {nomLieu(l.storeId)}</span>}
        </span>
      ))}
      {unplaced > 0 && (
        <span className="text-amber-700 whitespace-nowrap tabular-nums">{fmtQty(unplaced)} sans emplacement</span>
      )}
    </span>
  );
}
