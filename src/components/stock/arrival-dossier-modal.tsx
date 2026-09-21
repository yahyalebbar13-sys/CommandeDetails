"use client";

import React, { useMemo, useState } from 'react';
import {
  Anchor, CheckCircle2, ChevronDown, Palette, Ruler, Sparkles, Search, X,
  Package, Calendar, Ship, MapPin, Box, FileDown, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getArticleFrenchName } from '@/lib/product-name-utils';
import {
  articleInboundVariants, articleVariantDimension, compareLocationCodes, variantKey,
  type VariantDimension,
} from '@/lib/warehouse-locations';

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

const isVarious = (v: any) => String(v || '').toLowerCase() === 'various';

/** Quantité d'une ligne de ventilation — les lignes couleur anciennes utilisent `rolls`. */
const rowQty = (row: any) => Number(row?.quantity ?? row?.rolls) || 0;

/** « 150CM », « 150 cm » et « 150cm » désignent la même mesure. */
function sameMeasure(a: any, b: any): boolean {
  const norm = (v: any) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
}

function articleName(a: any): string {
  return (a.nameFR || a.productName || a.name || a.categoryId || 'Article').trim();
}

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

const DIMENSION_NOUN: Record<VariantDimension, [string, string]> = {
  quality: ['qualité', 'qualités'],
  color: ['couleur', 'couleurs'],
  size: ['taille', 'tailles'],
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

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
      const sub = String((dimension === 'quality' ? line.row?.nameFR : line.row?.description) || '').trim();
      rows.set(line.key, {
        key: line.key, label: line.label, locs: [], unplaced: 0,
        sub: sub && sub.toLowerCase() !== line.label.toLowerCase() ? sub : undefined,
      });
    }
  }

  for (const m of movs) {
    const value = dimension ? String(m[dimension] ?? '').trim() : '';
    const key = dimension ? variantKey({ dimension, value }) : '';
    let row = rows.get(key);
    if (!row) {
      row = { key, label: value, locs: [], unplaced: 0 };
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
        ...(a.colorBreakdown || []).map((r: any) => `${r.colorCode || ''} ${r.description || ''} ${r.color || ''}`),
        ...(a.sizeBreakdown || []).map((r: any) => r.size),
        ...(a.qualityBreakdown || []).map((r: any) => `${r.quality || ''} ${r.nameFR || ''}`),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [articles, search, categories, generalCategories]);

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
            const open_ = expanded[a.id] || null;
            const placements = placementsByArticle[a.id] || [];

            return (
              <div key={a.id} className="rounded-2xl border border-stone-100 bg-stone-50/60 overflow-hidden">
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-stone-900 uppercase leading-tight">{frName(a)}</p>
                    {a.categoryId && frName(a).toLowerCase() !== String(a.categoryId).toLowerCase() && (
                      <p className="text-[10px] font-bold text-stone-400 uppercase mt-0.5">{a.categoryId}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {/* Qualité */}
                      {qualities.length > 0 ? (
                        <BreakdownChip
                          icon={Sparkles} label={`${qualities.length} qualité${qualities.length > 1 ? 's' : ''}`}
                          active={open_ === 'quality'} tone="fuchsia" onClick={() => toggle(a.id, 'quality')} />
                      ) : a.quality ? (
                        <PlainChip tone="fuchsia">{a.quality}</PlainChip>
                      ) : null}

                      {/* Couleur */}
                      {colors.length > 0 ? (
                        <BreakdownChip
                          icon={Palette} label={`${colors.length} couleur${colors.length > 1 ? 's' : ''}`}
                          active={open_ === 'color'} tone="violet" onClick={() => toggle(a.id, 'color')} />
                      ) : a.color && !isVarious(a.color) ? (
                        <PlainChip tone="violet">{a.color}</PlainChip>
                      ) : null}

                      {/* Taille */}
                      {sizes.length > 0 ? (
                        <BreakdownChip
                          icon={Ruler} label={`${sizes.length} taille${sizes.length > 1 ? 's' : ''}`}
                          active={open_ === 'size'} tone="blue" onClick={() => toggle(a.id, 'size')} />
                      ) : a.size && !isVarious(a.size) ? (
                        <PlainChip tone="blue">{a.size}</PlainChip>
                      ) : null}

                      {/* La largeur est souvent déjà portée par la taille (« 150CM ») : ne pas la répéter. */}
                      {a.fabricWidth && sameMeasure(a.size, `${a.fabricWidth}cm`) === false
                        ? <PlainChip tone="stone">{a.fabricWidth} cm</PlainChip> : null}
                      {a.gsm ? <PlainChip tone="stone">{a.gsm} g/m²</PlainChip> : null}
                      {a.zipperType ? <PlainChip tone="stone">{a.zipperType}</PlainChip> : null}
                      {a.slider ? <PlainChip tone="stone">{a.slider}</PlainChip> : null}
                    </div>

                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-emerald-700 leading-none">{fmtQty(a.quantity)}</p>
                    <p className="text-[10px] font-black text-stone-400 uppercase mt-1">{unit}</p>
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
                    tone="fuchsia" unit={unit}
                    head={['Qualité', 'Quantité']}
                    rows={qualities.map((r: any) => ({
                      label: r.nameFR || r.quality || '—',
                      sub: [r.nameFR && r.quality ? r.quality : null, r.gsm ? `${r.gsm} g/m²` : null, r.fabricWidth ? `${r.fabricWidth} cm` : null, r.size || null]
                        .filter(Boolean).join(' · '),
                      qty: rowQty(r),
                    }))}
                  />
                )}
                {open_ === 'color' && (
                  <BreakdownTable
                    tone="violet" unit={unit}
                    head={['Couleur', 'Quantité']}
                    rows={colors.map((r: any) => ({
                      label: r.colorCode || r.color || '—',
                      sub: r.description && r.description !== r.colorCode ? r.description : '',
                      qty: rowQty(r),
                    }))}
                  />
                )}
                {open_ === 'size' && (
                  <BreakdownTable
                    tone="blue" unit={unit}
                    head={['Taille', 'Quantité']}
                    rows={sizes.map((r: any) => ({
                      label: r.size || '—',
                      sub: r.description || '',
                      qty: rowQty(r),
                    }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
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

function BreakdownChip({ icon: Icon, label, active, tone, onClick }: {
  icon: any; label: string; active: boolean; tone: Tone; onClick: () => void;
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
      <ChevronDown className={`w-3 h-3 transition-transform ${active ? 'rotate-180' : ''}`} />
    </button>
  );
}

function BreakdownTable({ tone, unit, head, rows }: {
  tone: Tone; unit: string; head: [string, string];
  rows: { label: string; sub?: string; qty: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const t = TONES[tone];
  return (
    <div className="mx-3.5 mb-3.5 rounded-xl overflow-hidden border border-stone-200 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
      <div className={`grid grid-cols-[1fr_auto] ${t.head}`}>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest">{head[0]}</div>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest text-right">{head[1]}</div>
      </div>
      <div className="divide-y divide-stone-100 max-h-64 overflow-y-auto">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] hover:bg-stone-50 transition-colors">
            <div className="py-2 px-3 min-w-0">
              <p className="text-[11px] font-black text-stone-800 uppercase truncate">{r.label}</p>
              {r.sub && <p className="text-[10px] font-medium text-stone-400 truncate">{r.sub}</p>}
            </div>
            <div className="py-2 px-3 text-[11px] font-black text-stone-900 text-right whitespace-nowrap self-center">
              {fmtQty(r.qty)} <span className="text-stone-400 font-bold">{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-[1fr_auto] text-white ${t.foot}`}>
        <div className="py-2 px-3 text-[9px] font-black uppercase tracking-widest">Total</div>
        <div className="py-2 px-3 text-[11px] font-black text-right whitespace-nowrap">{fmtQty(total)} {unit}</div>
      </div>
    </div>
  );
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
