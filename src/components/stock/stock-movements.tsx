"use client";

import React, { useState, useMemo } from 'react';
import { Plus, ArrowDown, ArrowUp, ArrowLeftRight, ArrowRight, SlidersHorizontal, Search, Calendar, Download, MapPin, FileText, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { StockMovement, StockItem, StoreLocation } from '@/lib/types';
import StockMovementModal from './stock-movement-modal';
import type { StorageLocation } from '@/lib/warehouse-locations';
import { libelleFixe } from '@/lib/warehouse-locations';
import { specificationsEnLigne, qualiteDeLArticle } from '@/lib/specification-produit';
import { exportToFile, formatMovementsForExport } from '@/lib/export-utils';
import { exportMovementsPDF } from '@/lib/pdf-export-reports';

interface StockMovementsProps {
  movements: StockMovement[];
  stockItems: StockItem[];
  categories: any[];
  generalCategories?: any[];
  articles: any[];
  stores: any[];
  locations?: StorageLocation[];
  activeStore: StoreLocation | 'ALL';
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
  readOnly?: boolean;
}

/**
 * Quatre états, quatre couleurs : on doit lire la nature d'une ligne sans la déchiffrer.
 * Le transfert est à part — il n'ajoute ni ne retire de marchandise à l'entreprise, il la
 * déplace — et il s'écrit en deux lignes : un départ chez l'expéditeur, une arrivée chez
 * le destinataire.
 */
const STYLE_MOUVEMENT: Record<string, { label: string; icon: any; bg: string; text: string; border: string; qty: string }> = {
  IN:            { label: 'Entrée',              icon: ArrowDown,         bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', qty: 'text-emerald-600' },
  OUT:           { label: 'Sortie',              icon: ArrowUp,           bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     qty: 'text-red-600' },
  ADJUSTMENT:    { label: 'Ajustement',          icon: SlidersHorizontal, bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    qty: 'text-blue-600' },
  TRANSFERT_OUT: { label: 'Transfert · départ',  icon: ArrowLeftRight,    bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200',   qty: 'text-amber-600' },
  TRANSFERT_IN:  { label: 'Transfert · arrivée', icon: ArrowLeftRight,    bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200',   qty: 'text-amber-600' },
};

const cleDuMouvement = (m: StockMovement): string =>
  m?.reason === 'TRANSFERT'
    ? (m.type === 'IN' ? 'TRANSFERT_IN' : 'TRANSFERT_OUT')
    : (m?.type && STYLE_MOUVEMENT[m.type] ? m.type : 'ADJUSTMENT');

const REASON_LABELS: Record<string, string> = {
  ARRIVAGE: 'Arrivage', VENTE: 'Vente', PERTE: 'Perte',
  RETOUR: 'Retour', INVENTAIRE: 'Inventaire', TRANSFERT: 'Transfert',
};

/** 2026-09-23 → 23/09/2026, sans passer par Date (aucun décalage de fuseau possible). */
const dateFR = (iso?: string): string => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (iso || '—');
};

/** Ordre de lecture du journal : le jour d'abord, puis l'heure d'enregistrement. */
const instantEnregistrement = (m: any): number => {
  const c = m?.createdAt;
  if (!c) return 0;
  if (typeof c?.seconds === 'number') return c.seconds * 1000;
  if (typeof c?.toMillis === 'function') return c.toMillis();
  const t = new Date(c).getTime();
  return Number.isFinite(t) ? t : 0;
};

const estRenseigne = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  const t = String(v).trim();
  return t !== '' && t !== '0' && t.toLowerCase() !== 'various';
};

/**
 * Empile plusieurs sources de caractéristiques : la première qui porte une valeur gagne.
 * Le mouvement passe donc avant la ligne de qualité du produit, qui passe avant l'article.
 * Les valeurs vides et le « various » interne sont écartés — ils ne décrivent rien.
 */
const fusionnerCaracteristiques = (...sources: any[]): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [cle, valeur] of Object.entries(source)) {
      if (out[cle] !== undefined || !estRenseigne(valeur)) continue;
      out[cle] = valeur;
    }
  }
  return out;
};

export default function StockMovements({ movements, stockItems, categories, generalCategories = [], articles, stores, locations = [], activeStore, onAddMovement, readOnly = false }: StockMovementsProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFERT'>('all');
  const [filterCat, setFilterCat] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  // ── Répertoires de lecture ────────────────────────────────────────────────
  const articleParId = useMemo(() => {
    const index = new Map<string, any>();
    (articles || []).forEach((a: any) => { if (a?.id) index.set(String(a.id), a); });
    return index;
  }, [articles]);

  const nomDuMagasin = useMemo(() => {
    const index = new Map<string, string>();
    (stores || []).forEach((s: any) => { if (s?.id) index.set(String(s.id), String(s.name || s.id)); });
    return (id?: string | null): string => {
      if (!id) return 'Entrepôt';
      const nom = index.get(String(id));
      if (nom) return nom;
      return String(id) === 'ENTREPOT' ? 'Entrepôt' : String(id).replace(/_/g, ' ');
    };
  }, [stores]);

  const nomDeLaFamille = useMemo(() => {
    const index = new Map<string, string>();
    (categories || []).forEach((c: any) => {
      const nom = c?.nameFR || c?.name;
      if (c?.id) index.set(String(c.id), String(nom || c.id));
      if (c?.name) index.set(String(c.name), String(nom || c.name));
    });
    return (id?: string | null): string => (id ? (index.get(String(id)) || String(id)) : '');
  }, [categories]);

  const emplacementParCle = useMemo(() => {
    const index = new Map<string, StorageLocation>();
    (locations || []).forEach(l => {
      if (l?.code) index.set(`code:${l.code}`, l);
      if (l?.id) index.set(`id:${l.id}`, l);
    });
    return index;
  }, [locations]);

  /**
   * Tout ce qu'une ligne dit de la marchandise : son nom, sa famille, sa qualité, sa couleur,
   * sa taille et ses caractéristiques techniques — celles du modèle de son type (tissu,
   * fermeture, fil, curseur, ruban, accessoire), jamais deux types en dur.
   */
  const decrireLArticle = React.useCallback((m: StockMovement) => {
    const article = m?.articleId ? articleParId.get(String(m.articleId)) : undefined;
    const ligneQualite = (article?.qualityBreakdown || []).find(
      (r: any) => String(r?.quality || '').trim().toLowerCase() === String(m?.quality || '').trim().toLowerCase(),
    );
    const caracteristiques = fusionnerCaracteristiques(m, ligneQualite);
    return {
      nom: (m?.nameFR || m?.productName || article?.nameFR || article?.name || '—') as string,
      famille: nomDeLaFamille(m?.categoryId),
      qualite: qualiteDeLArticle(m),
      couleur: libelleFixe(m?.color),
      taille: libelleFixe(m?.size),
      specs: specificationsEnLigne(article || m, categories, generalCategories, caracteristiques),
    };
  }, [articleParId, categories, generalCategories, nomDeLaFamille]);

  /** Le trajet d'un transfert : l'arrivée porte son origine, le départ porte sa destination. */
  const trajetDuTransfert = React.useCallback((m: StockMovement) => {
    if (m?.reason !== 'TRANSFERT') return null;
    const depuis = m.type === 'IN' ? ((m as any).fromStoreId || null) : (m.storeId || null);
    const vers = m.type === 'IN' ? (m.storeId || m.toStoreId || null) : (m.toStoreId || null);
    if (!depuis || !vers || String(depuis) === String(vers)) return null;
    return { depuis: nomDuMagasin(depuis), vers: nomDuMagasin(vers), arrivee: m.type === 'IN' };
  }, [nomDuMagasin]);

  // Mois disponibles
  const months = useMemo(() => {
    const s = new Set<string>();
    movements.forEach(m => { if (m.date) s.add(m.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [movements]);

  // Catégories disponibles
  const catOptions = useMemo(() => {
    const s = new Set<string>();
    movements.forEach(m => { if (m.categoryId) s.add(m.categoryId); });
    return Array.from(s).sort();
  }, [movements]);

  // Filtres
  const filtered = useMemo(() => {
    let r = [...movements];
    if (filterType === 'TRANSFERT') r = r.filter(m => m.reason === 'TRANSFERT');
    else if (filterType !== 'all') r = r.filter(m => m.type === filterType);
    if (filterCat !== 'all')  r = r.filter(m => m.categoryId === filterCat);
    if (filterMonth !== 'all') r = r.filter(m => m.date?.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      const contient = (v: unknown) => String(v ?? '').toLowerCase().includes(q);
      r = r.filter(m =>
        contient(m.productName) ||
        contient(m.nameFR) ||
        contient(m.categoryId) ||
        contient(nomDeLaFamille(m.categoryId)) ||
        contient(m.quality) ||
        contient(m.color) ||
        contient(m.size) ||
        contient(m.locationCode) ||
        contient(nomDuMagasin(m.storeId)) ||
        contient(m.notes) ||
        contient(m.factureRef) ||
        contient(m.reason) ||
        contient(REASON_LABELS[m.reason])
      );
    }
    return r.sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (instantEnregistrement(b) - instantEnregistrement(a)),
    );
  }, [movements, filterType, filterCat, filterMonth, search, nomDeLaFamille, nomDuMagasin]);

  // Totaux filtrés
  const totalIN  = filtered.filter(m => m.type === 'IN').reduce((s, m) => s + m.quantity, 0);
  const totalOUT = filtered.filter(m => m.type === 'OUT').reduce((s, m) => s + m.quantity, 0);
  const nbTransferts = filtered.filter(m => m.reason === 'TRANSFERT').length;

  // Export Bilan Hebdomadaire Vendredi
  const handleExportFridayWeeklyPDF = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().split('T')[0];

    const weekMovements = movements.filter(m => m.date && m.date >= mondayStr);
    const dataToExport = weekMovements.length > 0 ? weekMovements : movements;

    exportMovementsPDF(
      dataToExport,
      `Bilan Hebdomadaire des Mouvements (Semaine du ${monday.toLocaleDateString('fr-FR')})`,
      `${dataToExport.length} mouvements enregistrés — Point Hebdomadaire Vendredi`
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-1">Traçabilité complète</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Journal des <span className="text-emerald-400">Mouvements</span></h1>
            <p className="text-stone-400 text-xs font-bold mt-2">{movements.length} mouvement{movements.length > 1 ? 's' : ''} enregistré{movements.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportFridayWeeklyPDF}
              className="bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-300 font-black uppercase text-[10px] tracking-widest px-5 h-11 rounded-2xl gap-2 shrink-0 shadow-sm"
              title="Exporter tous les mouvements de la semaine pour la mise au point du Vendredi avec la direction"
            >
              <Calendar className="w-4 h-4 text-amber-400" /> Bilan Vendredi (Semaine)
            </Button>
            <Button
              variant="outline"
              onClick={() => exportToFile(formatMovementsForExport(filtered), { filename: `mouvements-stock-${new Date().toISOString().split('T')[0]}`, sheetName: 'Mouvements' })}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-black uppercase text-[10px] tracking-widest px-5 h-11 rounded-2xl gap-2 shrink-0"
            >
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportMovementsPDF(filtered)}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-black uppercase text-[10px] tracking-widest px-5 h-11 rounded-2xl gap-2 shrink-0"
            >
              <Download className="w-4 h-4" /> PDF
            </Button>
            {!readOnly && (
              <Button
                onClick={() => setModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest px-5 h-11 rounded-2xl shadow-lg shadow-emerald-500/30 gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" /> Enregistrer un mouvement
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Entrées', value: totalIN, color: 'emerald', icon: ArrowDown },
          { label: 'Total Sorties', value: totalOUT, color: 'red', icon: ArrowUp },
          { label: 'Résultat Net', value: totalIN - totalOUT, color: totalIN - totalOUT >= 0 ? 'emerald' : 'red', icon: SlidersHorizontal },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`bg-white rounded-2xl p-4 shadow-lg border border-${color}-100`}>
            <div className={`flex items-center gap-2 mb-1`}>
              <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
              <p className={`text-[11px] font-black uppercase tracking-widest text-${color}-500`}>{label}</p>
            </div>
            <p className={`text-2xl font-black text-${color === 'red' ? 'red' : 'emerald'}-700`}>
              {value > 0 ? '+' : ''}{(Number(value) || 0).toLocaleString('fr-FR')}
            </p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input placeholder="Rechercher produit, qualité, couleur, emplacement, note..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
          </div>
          <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
            <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="IN">Entrées</SelectItem>
              <SelectItem value="OUT">Sorties</SelectItem>
              <SelectItem value="ADJUSTMENT">Ajustements</SelectItem>
              <SelectItem value="TRANSFERT">Transferts</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-10 w-44 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {catOptions.map(c => <SelectItem key={c} value={c}>{nomDeLaFamille(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Mois" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les mois</SelectItem>
              {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center">
              <ArrowLeftRight className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun mouvement trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Date', 'Mouvement', 'Article', 'Lieu', 'Motif et note', 'Quantité'].map((h, i) => (
                    <th key={h || i} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(m => {
                  const ts = STYLE_MOUVEMENT[cleDuMouvement(m)];
                  const Icon = ts.icon;
                  const article = decrireLArticle(m);
                  const trajet = trajetDuTransfert(m);
                  const emplacement = m.locationCode
                    ? emplacementParCle.get(`code:${m.locationCode}`)
                    : (m.locationId ? emplacementParCle.get(`id:${m.locationId}`) : undefined);
                  const codeEmplacement = m.locationCode || emplacement?.code;
                  const signe = m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : '±';

                  return (
                    <tr key={m.id} className="hover:bg-stone-50/50 transition-colors group align-top">

                      {/* Date */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-stone-600" title={m.date}>
                          <Calendar className="w-3 h-3 text-stone-300" />
                          {dateFR(m.date)}
                        </div>
                      </td>

                      {/* Mouvement — entrée, sortie, ajustement ou transfert */}
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border whitespace-nowrap ${ts.bg} ${ts.text} ${ts.border}`}>
                          <Icon className="w-3 h-3" />
                          {ts.label}
                        </span>
                      </td>

                      {/* Article — nom, famille, variante et caractéristiques du type */}
                      <td className="px-4 py-3 align-top max-w-[340px]">
                        <p className="text-[11px] font-black text-stone-800 uppercase leading-tight">{article.nom}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {article.famille && (
                            <span className="text-[11px] font-bold text-stone-400 uppercase">{article.famille}</span>
                          )}
                          {article.qualite && (
                            <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[11px] font-black uppercase">
                              {article.qualite}
                            </span>
                          )}
                          {article.couleur && (
                            <span className="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase">
                              {article.couleur}
                            </span>
                          )}
                          {article.taille && (
                            <span className="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase">
                              T. {article.taille}
                            </span>
                          )}
                        </div>
                        {article.specs && (
                          <p className="text-[10px] font-bold text-stone-400 mt-1 leading-snug line-clamp-2" title={article.specs}>
                            {article.specs}
                          </p>
                        )}
                      </td>

                      {/* Lieu — magasin, trajet du transfert, emplacement */}
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1 items-start">
                          {trajet ? (
                            <span className="inline-flex items-center gap-1 text-[11px] uppercase whitespace-nowrap">
                              <span className={trajet.arrivee ? 'font-bold text-stone-400' : 'font-black text-stone-700'}>{trajet.depuis}</span>
                              <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className={trajet.arrivee ? 'font-black text-stone-700' : 'font-bold text-stone-400'}>{trajet.vers}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-black text-stone-600 uppercase">{nomDuMagasin(m.storeId)}</span>
                          )}
                          {codeEmplacement && (
                            <span
                              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-mono text-[10px] font-black"
                              title={emplacement?.label ? `${codeEmplacement} — ${emplacement.label}` : codeEmplacement}
                            >
                              <MapPin className="w-2.5 h-2.5" />{codeEmplacement}
                            </span>
                          )}
                          {emplacement?.label && (
                            <span className="text-[10px] font-bold text-stone-400 uppercase leading-tight">{emplacement.label}</span>
                          )}
                        </div>
                      </td>

                      {/* Motif et note — c'est la note qu'on relit six mois plus tard */}
                      <td className="px-4 py-3 align-top max-w-[280px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-black text-stone-600 uppercase bg-stone-100 px-2 py-0.5 rounded-lg whitespace-nowrap">
                            {REASON_LABELS[m.reason] || m.reason}
                          </span>
                          {m.factureRef && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-stone-500 uppercase bg-stone-50 border border-stone-200 px-1.5 py-0.5 rounded" title={`Arrivage ${m.factureRef}`}>
                              <FileText className="w-2.5 h-2.5" />{m.factureRef}
                            </span>
                          )}
                        </div>
                        {m.notes ? (
                          <p className="mt-1 text-[10px] text-stone-500 font-medium leading-snug line-clamp-3 whitespace-pre-wrap" title={m.notes}>
                            <StickyNote className="w-2.5 h-2.5 inline-block mr-1 text-stone-300 align-[-1px]" />
                            {m.notes}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-stone-300 font-bold">Sans note</p>
                        )}
                      </td>

                      {/* Quantité */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className={`text-sm font-black ${ts.qty}`}>
                          {signe}{(Number(m.quantity) || 0).toLocaleString('fr-FR')} {m.unitOfMeasure}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer tableau */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{filtered.length} mouvement{filtered.length > 1 ? 's' : ''}</span>
            <div className="flex flex-wrap gap-4">
              <span className="text-[11px] font-black text-emerald-600 uppercase">+{(Number(totalIN) || 0).toLocaleString('fr-FR')} entrées</span>
              <span className="text-[11px] font-black text-red-600 uppercase">-{(Number(totalOUT) || 0).toLocaleString('fr-FR')} sorties</span>
              {nbTransferts > 0 && (
                <span className="text-[11px] font-black text-amber-600 uppercase">{nbTransferts} ligne{nbTransferts > 1 ? 's' : ''} de transfert</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <StockMovementModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        articles={articles}
        categories={categories}
        stockItems={stockItems}
        stores={stores}
        locations={locations}
        allMovements={movements}
        activeStore={activeStore}
        onSubmit={onAddMovement}
      />
    </div>
  );
}
