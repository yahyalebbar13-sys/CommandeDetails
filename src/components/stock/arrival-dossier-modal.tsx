"use client";

import React, { useMemo, useState } from 'react';
import {
  Anchor, CheckCircle2, ChevronDown, Palette, Ruler, Sparkles, Search, X,
  Package, Calendar, Ship, MapPin, Box, FileDown, Loader2, AlertTriangle,
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
 * accessoire…). On écarte celles qu'une autre puce dit déjà : la largeur est souvent portée par la
 * taille (« 150CM »), la taille d'un curseur aussi.
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

export default function ArrivalDossierModal({
  open, onOpenChange, facture, articles, movements = [], stores = [],
  categories = [], generalCategories = [], isEnteredInStock, stockEntryDate,
}: ArrivalDossierModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

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
  // Une seule ventilation ouverte à la fois par article : `${articleId}:${kind}`
  const [expanded, setExpanded] = useState<Record<string, BreakdownKind | null>>({});

  const toggle = (articleId: string, kind: BreakdownKind) =>
    setExpanded(prev => ({ ...prev, [articleId]: prev[articleId] === kind ? null : kind }));

  // Totaux par unité : additionner des mètres et des sacs n'a pas de sens.
  const totalsByUnit = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const a of articles || []) {
      const unit = (a.unitOfMeasure || 'pcs').trim();
      acc[unit] = (acc[unit] || 0) + (Number(a.quantity) || 0);
    }
    return Object.entries(acc).sort((x, y) => y[1] - x[1]);
  }, [articles]);

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
      // Rien de rangé nulle part : pas de bloc, comme avant.
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

  // Le total du bas recoupe ce qui est affiché au-dessus : mêmes références, mêmes quantités,
  // additionnées par unité (des mètres et des sacs ne s'additionnent pas).
  const footerTotals = useMemo(() => {
    const acc: Record<string, { qty: number; entered: number }> = {};
    for (const a of visibleArticles) {
      const unit = (a.unitOfMeasure || 'pcs').trim();
      const slot = (acc[unit] ||= { qty: 0, entered: 0 });
      slot.qty = round3(slot.qty + (Number(a.quantity) || 0));
      slot.entered = round3(slot.entered + (entriesByArticle[a.id]?.total || 0));
    }
    return Object.entries(acc).sort((x, y) => y[1].qty - x[1].qty);
  }, [visibleArticles, entriesByArticle]);

  if (!facture) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearch(''); setExpanded({}); } onOpenChange(o); }}>
      <DialogContent className="max-w-3xl p-0 rounded-3xl overflow-hidden border-none shadow-2xl">
        {/* En-tête */}
        <div className="bg-stone-900 p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-56 h-56 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.25em]">
                {facture.supplierId || facture.supplier || 'Fournisseur'}
              </p>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight mt-1 break-all">
                Dossier {facture.id}
              </DialogTitle>
              {facture.noBL && (
                <p className="text-[11px] font-bold text-stone-400 mt-1 flex items-center gap-1.5">
                  <Ship className="w-3 h-3" /> BL {facture.noBL}
                </p>
              )}
            </div>
            <div className="self-start flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting || (articles || []).length === 0}
              className="inline-flex items-center gap-1.5 bg-white text-stone-900 hover:bg-amber-400 disabled:opacity-50 text-[11px] font-black uppercase px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Packing PDF
            </button>
            {isEnteredInStock ? (
              <span className="self-start inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-black uppercase px-3 py-1.5 rounded-full whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" /> En stock
              </span>
            ) : (
              <span className="self-start inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-black uppercase px-3 py-1.5 rounded-full whitespace-nowrap">
                <Anchor className="w-3.5 h-3.5" /> En attente
              </span>
            )}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Arrivée</p>
              <p className="text-xs font-black mt-0.5">{facture.arrivalDate || '—'}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Package className="w-2.5 h-2.5" /> Entrée stock</p>
              <p className="text-xs font-black mt-0.5">{stockEntryDate || 'En attente'}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500">Références</p>
              <p className="text-xs font-black mt-0.5">{(articles || []).length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Box className="w-2.5 h-2.5" /> Volume</p>
              <p className="text-xs font-black mt-0.5">{totalCbm > 0 ? `${fmtQty(totalCbm)} m³` : '—'}</p>
            </div>
          </div>

          {totalsByUnit.length > 0 && (
            <div className="relative z-10 flex flex-wrap gap-1.5 mt-3">
              {totalsByUnit.map(([unit, qty]) => (
                <span key={unit} className="text-[11px] font-black bg-emerald-500/15 text-emerald-300 px-2.5 py-1 rounded-lg">
                  {fmtQty(qty)} {unit}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recherche */}
        <div className="px-5 pt-4 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Chercher un article, une couleur, une taille, une qualité…"
              className="h-10 pl-9 rounded-xl border-stone-200 text-xs font-semibold"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Articles */}
        <div className="p-5 bg-white max-h-[55vh] overflow-y-auto space-y-2">
          {visibleArticles.length === 0 ? (
            <p className="text-center text-stone-400 text-xs font-black uppercase tracking-widest py-10">
              {search ? `Aucun article ne correspond à « ${search} »` : 'Aucun article dans ce dossier'}
            </p>
          ) : visibleArticles.map(a => {
            const unit = a.unitOfMeasure || 'pcs';
            const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.filter((r: any) => rowQty(r) > 0) : [];
            const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.filter((r: any) => rowQty(r) > 0) : [];
            const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.filter((r: any) => rowQty(r) > 0) : [];
            const placements = placementsByArticle[a.id] || [];
            const entry = entriesByArticle[a.id];
            const quantite = Number(a.quantity) || 0;

            // Qualité et caractéristiques : toujours par le modèle du type de l'article, pour
            // qu'un fil, un curseur, un ruban ou un accessoire soit décrit comme un tissu l'est.
            const specs = caracteristiques(a, categories, generalCategories);
            const qualiteFixe = qualiteDeLArticle(a);
            const couleurFixe = premierLibelle(a.color);
            const tailleFixe = premierLibelle(a.size);

            // La ventilation qui fait foi pour l'entrée en stock : ses lignes, et elles seules,
            // portent un état « entré / en attente ».
            const ventilee = entry?.dimension ?? null;
            const keyByRow = new Map<any, string>();
            for (const line of articleInboundVariants(a)) if (line.row) keyByRow.set(line.row, line.key);
            const enteredOf = (r: any) => {
              const k = keyByRow.get(r);
              return k === undefined ? undefined : (entry?.byKey[k] ?? 0);
            };

            // Une ventilation qui annonce plus que l'article n'est pas la sienne : l'entrée en
            // stock l'écarte et fait entrer l'article en une seule ligne. À dire, sinon le total
            // affiché et la marchandise rangée ne se recoupent plus.
            const ignoree = ventilationIgnoree(a);
            const avertissement = ignoree
              ? `Ventilation par ${DIMENSION_NOUN[ignoree.dimension][0]} écartée : ${fmtQty(ignoree.total)} ${unit} annoncés pour ${fmtQty(quantite)} — l'article entre en une seule ligne.`
              : '';

            // Le total d'une ventilation doit recouper la quantité de l'article : quand celle qui
            // fait foi ne le fait pas, sa puce le signale sans qu'on ait à l'ouvrir.
            const ecartSur = (kind: BreakdownKind, rows: any[]) =>
              ventilee === kind && quantite > 0 && Math.abs(totalLignes(rows) - quantite) > 0.001;

            // Une recherche qui vise une variante ouvre d'office la ventilation qui la contient.
            const q = search.trim().toLowerCase();
            const matchKind: BreakdownKind | null = !q ? null
              : qualities.some((r: any) => `${r.quality || ''} ${r.nameFR || ''}`.toLowerCase().includes(q)) ? 'quality'
              : colors.some((r: any) => `${r.colorCode || ''} ${r.color || ''} ${r.description || ''}`.toLowerCase().includes(q)) ? 'color'
              : sizes.some((r: any) => `${r.size || ''} ${r.description || ''}`.toLowerCase().includes(q)) ? 'size'
              : null;
            const open_ = a.id in expanded ? expanded[a.id] : matchKind;

            return (
              <div key={a.id} className="rounded-2xl border border-stone-100 bg-stone-50/60 overflow-hidden">
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-stone-900 uppercase leading-tight">{frName(a)}</p>
                    {a.categoryId && frName(a).toLowerCase() !== String(a.categoryId).toLowerCase() && (
                      <p className="text-[10px] font-bold text-stone-400 uppercase mt-0.5">{a.categoryId}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {/* Qualité — une ventilation s'ouvre, une qualité fixe s'affiche. */}
                      {qualities.length > 0 ? (
                        <BreakdownChip
                          icon={Sparkles} label={`${qualities.length} qualité${qualities.length > 1 ? 's' : ''}`}
                          hint={fmtQty(totalLignes(qualities))} warn={ecartSur('quality', qualities)}
                          active={open_ === 'quality'} tone="fuchsia" onClick={() => toggle(a.id, 'quality')} />
                      ) : qualiteFixe ? (
                        <PlainChip tone="fuchsia">{qualiteFixe}</PlainChip>
                      ) : null}

                      {/* Couleur */}
                      {colors.length > 0 ? (
                        <BreakdownChip
                          icon={Palette} label={`${colors.length} couleur${colors.length > 1 ? 's' : ''}`}
                          hint={fmtQty(totalLignes(colors))} warn={ecartSur('color', colors)}
                          active={open_ === 'color'} tone="violet" onClick={() => toggle(a.id, 'color')} />
                      ) : couleurFixe ? (
                        <PlainChip tone="violet">{couleurFixe}</PlainChip>
                      ) : null}

                      {/* Taille */}
                      {sizes.length > 0 ? (
                        <BreakdownChip
                          icon={Ruler} label={`${sizes.length} taille${sizes.length > 1 ? 's' : ''}`}
                          hint={fmtQty(totalLignes(sizes))} warn={ecartSur('size', sizes)}
                          active={open_ === 'size'} tone="blue" onClick={() => toggle(a.id, 'size')} />
                      ) : tailleFixe ? (
                        <PlainChip tone="blue">{tailleFixe}</PlainChip>
                      ) : null}

                      {/* Les caractéristiques du type : grammage et largeur d'un tissu, longueur et
                          curseur d'une fermeture, poids du cône d'un fil, épaisseur d'un accessoire. */}
                      {specs.map(s => (
                        <PlainChip key={s.cle} tone="stone">
                          <span className="font-bold text-stone-400">{s.label}</span> {s.valeur}
                        </PlainChip>
                      ))}
                      {specs.length === 0 && premierLibelle(a.specs)
                        ? <PlainChip tone="stone">{premierLibelle(a.specs)}</PlainChip> : null}
                    </div>

                    {avertissement && (
                      <p className="mt-2 flex items-start gap-1 text-[10px] font-bold text-amber-700">
                        <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                        <span>{avertissement}</span>
                      </p>
                    )}

                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-emerald-700 leading-none">{fmtQty(a.quantity)}</p>
                    <p className="text-[10px] font-black text-stone-400 uppercase mt-1">{unit}</p>
                    {hasEntries && (
                      <EntryBadge entered={entry?.total || 0} expected={quantite} unit={unit} />
                    )}
                  </div>
                </div>

                {/* Sous la ligne, sur toute la largeur de la carte : sur téléphone, la colonne
                    quantité ne laisse pas assez de place à la liste des variantes. */}
                {placements.length > 0 && (
                  <div className="px-3.5 pb-3.5 -mt-3.5">
                    <ArticlePlacements
                      dimension={articleVariantDimension(a)}
                      placements={placements}
                      search={search}
                      stores={stores}
                    />
                  </div>
                )}

                {open_ === 'quality' && (
                  <BreakdownTable
                    tone="fuchsia" unit={unit} search={search}
                    head={['Qualité', 'Quantité']}
                    expected={quantite} showEntry={hasEntries && ventilee === 'quality'}
                    rows={qualities.map((r: any) => {
                      // Le code de qualité (« CL-5 ») est le nom du métier ; les caractéristiques
                      // de la ligne priment sur celles de l'article, c'est ce qui distingue
                      // deux qualités du même produit.
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
                        qty: rowQty(r),
                        entered: enteredOf(r),
                      };
                    })}
                  />
                )}
                {open_ === 'color' && (
                  <BreakdownTable
                    tone="violet" unit={unit} search={search}
                    head={['Couleur', 'Quantité']}
                    expected={quantite} showEntry={hasEntries && ventilee === 'color'}
                    rows={colors.map((r: any) => {
                      const label = libelleCouleur(r);
                      const desc = premierLibelle(r.description);
                      return {
                        label: label || '—',
                        sub: desc && desc.toLowerCase() !== label.toLowerCase() ? desc : '',
                        qty: rowQty(r),
                        entered: enteredOf(r),
                      };
                    })}
                  />
                )}
                {open_ === 'size' && (
                  <BreakdownTable
                    tone="blue" unit={unit} search={search}
                    head={['Taille', 'Quantité']}
                    expected={quantite} showEntry={hasEntries && ventilee === 'size'}
                    rows={sizes.map((r: any) => ({
                      label: premierLibelle(r.size) || '—',
                      sub: premierLibelle(r.description),
                      qty: rowQty(r),
                      entered: enteredOf(r),
                    }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Le total du bas additionne exactement les lignes affichées au-dessus : c'est là que la
            fiche se recoupe avec l'en-tête du dossier. */}
        {footerTotals.length > 0 && (
          <div className="px-5 py-3 bg-stone-900 text-white flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
              {search ? 'Total affiché' : 'Total du dossier'} ·{' '}
              {visibleArticles.length}{search ? ` sur ${(articles || []).length}` : ''} référence{(search ? (articles || []).length : visibleArticles.length) > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {footerTotals.map(([unit, t]) => (
                <span key={unit} className="text-[11px] font-black bg-white/10 px-2.5 py-1 rounded-lg whitespace-nowrap">
                  {fmtQty(t.qty)} {unit}
                  {hasEntries && (
                    <span className={`ml-1.5 font-bold ${t.entered - t.qty > -0.001 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      · {fmtQty(t.entered)} en stock
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * L'état d'entrée en stock d'une référence : reçue et rangée, partiellement entrée, ou encore
 * attendue. C'est la première chose qu'un magasinier cherche sur la fiche d'un dossier.
 */
function EntryBadge({ entered, expected, unit }: { entered: number; expected: number; unit: string }) {
  const base = 'mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md border whitespace-nowrap';
  if (entered <= 0) {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>
        <Anchor className="w-2.5 h-2.5" /> En attente
      </span>
    );
  }
  if (expected <= 0 || Math.abs(entered - expected) < 0.001) {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>
        <CheckCircle2 className="w-2.5 h-2.5" /> Entré
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>
      <AlertTriangle className="w-2.5 h-2.5" /> {fmtQty(entered)} / {fmtQty(expected)} {unit}
    </span>
  );
}

const TONES = {
  fuchsia: { chip: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', active: 'bg-fuchsia-600 text-white border-fuchsia-600', head: 'bg-fuchsia-100/70 text-fuchsia-700', foot: 'bg-fuchsia-600' },
  violet:  { chip: 'bg-violet-50 text-violet-700 border-violet-200',    active: 'bg-violet-600 text-white border-violet-600',    head: 'bg-violet-100/70 text-violet-700',   foot: 'bg-violet-600' },
  blue:    { chip: 'bg-blue-50 text-blue-700 border-blue-200',          active: 'bg-blue-600 text-white border-blue-600',          head: 'bg-blue-100/70 text-blue-700',       foot: 'bg-blue-600' },
  stone:   { chip: 'bg-white text-stone-500 border-stone-200',          active: 'bg-stone-800 text-white border-stone-800',        head: 'bg-stone-100 text-stone-600',        foot: 'bg-stone-800' },
} as const;

type Tone = keyof typeof TONES;

function PlainChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${TONES[tone].chip}`}>
      {children}
    </span>
  );
}

function BreakdownChip({ icon: Icon, label, hint, warn, active, tone, onClick }: {
  icon: any; label: string; hint?: string; warn?: boolean; active: boolean; tone: Tone; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border transition-colors ${
        active ? TONES[tone].active : `${TONES[tone].chip} hover:brightness-95`
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
      {/* Le total ventilé se lit sans ouvrir : il doit recouper la quantité de l'article, et
          passe à l'ambre quand ce n'est pas le cas. */}
      {hint && (
        <span
          className={`font-bold ${warn && !active ? 'text-amber-600' : active ? 'text-white/70' : 'opacity-60'}`}
          title={warn ? "Ce total ne recoupe pas la quantité de l'article" : undefined}
        >
          {warn && !active ? '≠ ' : '· '}{hint}
        </span>
      )}
      <ChevronDown className={`w-3 h-3 transition-transform ${active ? 'rotate-180' : ''}`} />
    </button>
  );
}

/**
 * Une ligne par variante, avec sa quantité, ses précisions et — quand cette ventilation est celle
 * qui entre en stock — ce qui est déjà entré. Le pied rappelle le total et le confronte à la
 * quantité de l'article : les deux doivent se recouper sous les yeux du lecteur.
 */
function BreakdownTable({ tone, unit, head, rows, expected, showEntry, search }: {
  tone: Tone; unit: string; head: [string, string];
  rows: { label: string; sub?: string; qty: number; entered?: number }[];
  /** Quantité de l'article, pour dire si la ventilation se recoupe. */
  expected?: number;
  showEntry?: boolean;
  search?: string;
}) {
  const total = round3(rows.reduce((s, r) => s + r.qty, 0));
  const t = TONES[tone];
  const q = (search || '').trim().toLowerCase();
  const ecart = expected && expected > 0 ? round3(total - expected) : 0;
  return (
    <div className="mx-3.5 mb-3.5 rounded-xl overflow-hidden border border-stone-200 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
      <div className={`grid grid-cols-[1fr_auto] ${t.head}`}>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest">{head[0]}</div>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest text-right">{head[1]}</div>
      </div>
      <div className="divide-y divide-stone-100 max-h-64 overflow-y-auto">
        {rows.map((r, i) => {
          const vise = Boolean(q) && `${r.label} ${r.sub || ''}`.toLowerCase().includes(q);
          return (
            <div key={i} className={`grid grid-cols-[1fr_auto] transition-colors ${vise ? 'bg-amber-50' : 'hover:bg-stone-50'}`}>
              <div className="py-2 px-3 min-w-0">
                <p className="text-[11px] font-black text-stone-800 uppercase truncate" title={r.label}>{r.label}</p>
                {r.sub && <p className="text-[10px] font-medium text-stone-400 truncate" title={r.sub}>{r.sub}</p>}
              </div>
              <div className="py-2 px-3 text-right whitespace-nowrap self-center">
                <p className="text-[11px] font-black text-stone-900">
                  {fmtQty(r.qty)} <span className="text-stone-400 font-bold">{unit}</span>
                </p>
                {showEntry && <RowEntryState entered={r.entered} qty={r.qty} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`grid grid-cols-[1fr_auto] text-white ${t.foot}`}>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest">
          Total · {rows.length} ligne{rows.length > 1 ? 's' : ''}
        </div>
        <div className="py-2 px-3 text-[11px] font-black text-right whitespace-nowrap">{fmtQty(total)} {unit}</div>
      </div>
      {expected !== undefined && expected > 0 && (
        Math.abs(ecart) < 0.001 ? (
          <p className="px-3 py-1.5 border-t border-stone-100 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Égal à la quantité de l'article
          </p>
        ) : (
          <p className="px-3 py-1.5 border-t border-stone-100 text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Quantité de l'article {fmtQty(expected)} {unit} · écart {fmtQty(Math.abs(ecart))} {unit}
          </p>
        )
      )}
    </div>
  );
}

/** Ce qui distingue, ligne à ligne, la marchandise déjà entrée de celle qui est encore attendue. */
function RowEntryState({ entered, qty }: { entered?: number; qty: number }) {
  // Une ligne sans libellé n'entre jamais en stock : mieux vaut le dire que laisser un blanc.
  if (entered === undefined) {
    return <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">Hors entrée</p>;
  }
  if (entered <= 0) {
    return <p className="text-[9px] font-black uppercase tracking-wide text-amber-600">En attente</p>;
  }
  if (Math.abs(entered - qty) < 0.001) {
    return <p className="text-[9px] font-black uppercase tracking-wide text-emerald-600">Entré</p>;
  }
  return <p className="text-[9px] font-black uppercase tracking-wide text-amber-600">{fmtQty(entered)} entré</p>;
}

function LocationChip({ code, qty, store }: { code: string; qty?: number; store?: string }) {
  const extra = [qty !== undefined ? fmtQty(qty) : null, store || null].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-mono text-[10px] font-black whitespace-nowrap">
      <MapPin className="w-2.5 h-2.5" />{code}
      {extra.length > 0 && <span className="font-sans font-bold text-blue-500">· {extra.join(' · ')}</span>}
    </span>
  );
}

/**
 * Emplacements de rangement d'une référence du dossier. Article simple : une puce par
 * emplacement, comme avant. Article ventilé : une ligne par variante (« 305 → A-02-01 · 60,
 * A-02-02 · 40 »), dans une liste qui défile, pour rester lisible avec 30 couleurs et plus.
 */
function ArticlePlacements({ dimension, placements, search, stores }: {
  dimension: VariantDimension | null;
  placements: VariantPlacement[];
  search: string;
  stores: any[];
}) {
  const storeName = (id?: string) => stores.find((s: any) => s.id === id)?.name || id || '';

  if (!dimension || (placements.length === 1 && placements[0].key === '')) {
    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {placements.flatMap(p => p.locs).map(l => (
          <LocationChip
            key={`${l.storeId}-${l.code}`} code={l.code} qty={l.qty}
            store={stores.length > 1 && l.storeId ? storeName(l.storeId) : undefined}
          />
        ))}
      </div>
    );
  }

  const [one, many] = DIMENSION_NOUN[dimension];
  const storeIds = Array.from(new Set(placements.flatMap(p => p.locs.map(l => l.storeId || ''))));
  // Le lieu n'est rappelé sur chaque puce que si la référence a été rangée dans plusieurs lieux.
  const storeOnChip = stores.length > 1 && storeIds.length > 1;

  // « Même emplacement » à l'entrée : toutes les variantes au même endroit, une seule puce suffit.
  const first = placements[0].locs[0];
  const sameSpot = placements.length > 1 && Boolean(first) && placements.every(p =>
    p.unplaced === 0 && p.locs.length === 1 &&
    p.locs[0].code === first.code && p.locs[0].storeId === first.storeId);
  if (sameSpot) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <LocationChip
          code={first.code} qty={round3(placements.reduce((s, p) => s + p.locs[0].qty, 0))}
          store={stores.length > 1 && first.storeId ? storeName(first.storeId) : undefined}
        />
        <span className="text-[10px] font-bold text-stone-400">toutes les {placements.length} {many}</span>
      </div>
    );
  }

  // Une recherche qui vise une variante (« 305 ») ne garde que ses lignes : pas besoin de
  // faire défiler 30 couleurs pour la retrouver.
  const q = search.trim().toLowerCase();
  const matching = q ? placements.filter(p => `${p.label} ${p.sub || ''}`.toLowerCase().includes(q)) : [];
  const shown = matching.length > 0 && matching.length < placements.length ? matching : placements;
  const hidden = placements.length - shown.length;
  const onlyStore = stores.length > 1 && storeIds.length === 1 && storeIds[0] ? storeName(storeIds[0]) : '';

  return (
    <div className="mt-2 rounded-xl border border-blue-100 bg-white overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50/70 text-blue-700">
        <MapPin className="w-2.5 h-2.5 shrink-0" />
        <p className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
          Rangement · {placements.length} {placements.length > 1 ? many : one}
        </p>
        {onlyStore && <p className="ml-auto text-[10px] font-bold text-blue-500 truncate">{onlyStore}</p>}
      </div>
      <div className="max-h-44 overflow-y-auto divide-y divide-stone-100">
        {shown.map(p => {
          // Une variante rangée d'un seul bloc n'a pas besoin de rappeler sa quantité.
          const withQty = p.locs.length > 1 || p.unplaced > 0;
          return (
            <div key={p.key || '_'} className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-2 px-2.5 py-1">
              <p className="min-w-0 truncate text-[10px] font-black text-stone-800 uppercase" title={[p.label, p.sub].filter(Boolean).join(' — ')}>
                {p.label || '—'}
                {p.sub && <span className="ml-1 font-medium normal-case text-stone-400">{p.sub}</span>}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {p.locs.map(l => (
                  <LocationChip
                    key={`${l.storeId}-${l.code}`} code={l.code}
                    qty={withQty ? l.qty : undefined}
                    store={storeOnChip && l.storeId ? storeName(l.storeId) : undefined}
                  />
                ))}
                {p.unplaced > 0 && (
                  <span className="text-[10px] font-bold text-amber-600">
                    {p.locs.length > 0 ? '+ ' : ''}{fmtQty(p.unplaced)} sans emplacement
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <p className="px-2.5 py-1 border-t border-stone-100 text-[10px] font-bold text-stone-400">
          {hidden} autre{hidden > 1 ? 's' : ''} {hidden > 1 ? many : one} masquée{hidden > 1 ? 's' : ''} par la recherche
        </p>
      )}
    </div>
  );
}
