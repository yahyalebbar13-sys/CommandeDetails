"use client";

import React, { useMemo, useState } from 'react';
import {
  Send, Plus, Search, X, ClipboardList, Factory, Ship, Anchor, CheckCircle2, Store as StoreIcon,
  Palette, Ruler, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddOrderModal from '@/components/add-order-modal';
import { useEnrichedArticles } from '@/hooks/use-enriched-articles';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/status-utils';
import { getArticleFrenchName } from '@/lib/product-name-utils';

/**
 * Demandes de nouveaux produits envoyées par les magasins au service import.
 *
 * Une demande est un article `TO_ORDER` créé depuis /stock avec `requestSource: 'STORE'` : il
 * apparaît tel quel dans « Besoins » de /gestion. Le magasin suit ensuite son avancement jusqu'à
 * l'arrivée en stock. Aucun prix ni fournisseur n'est affiché ici.
 */

interface StoreImportRequestsViewProps {
  articles: any[];
  factures: any[];
  categories: any[];
  generalCategories: any[];
  stores: any[];
  adminUid: string | null;
  /** Magasin du compte connecté ; null pour une vue multi-magasins (CHRIFA principal, admin). */
  storeId: string | null;
  /** Vrai quand le compte voit les demandes de tous les magasins. */
  seesAllStores: boolean;
  readOnly?: boolean;
}

type Stage = 'SENT' | 'ORDERED' | 'ON_THE_WAY' | 'AT_PORT' | 'RECEIVED';

const STAGES: Record<Stage, { label: string; icon: any; cls: string; dot: string }> = {
  SENT:       { label: "Envoyée à l'import",        icon: Send,         cls: 'bg-stone-100 text-stone-700 border-stone-200',       dot: 'bg-stone-400' },
  ORDERED:    { label: 'Commandée au fournisseur',   icon: Factory,      cls: 'bg-amber-50 text-amber-800 border-amber-200',        dot: 'bg-amber-500' },
  ON_THE_WAY: { label: 'En route',                   icon: Ship,         cls: 'bg-blue-50 text-blue-800 border-blue-200',           dot: 'bg-blue-500' },
  AT_PORT:    { label: 'Au port — dédouanement',     icon: Anchor,       cls: 'bg-violet-50 text-violet-800 border-violet-200',     dot: 'bg-violet-500' },
  RECEIVED:   { label: 'Arrivée en stock',           icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',  dot: 'bg-emerald-500' },
};

const STAGE_ORDER: Stage[] = ['SENT', 'ORDERED', 'ON_THE_WAY', 'AT_PORT', 'RECEIVED'];

function toStage(s: EffectiveStatus): Stage {
  switch (s) {
    case 'PI': return 'ORDERED';
    case 'SHIPPED':
    case 'TRANSIT': return 'ON_THE_WAY';
    case 'CUSTOMS': return 'AT_PORT';
    case 'STOCK':
    case 'DELIVERED': return 'RECEIVED';
    default: return 'SENT';
  }
}

const fmtQty = (n: any) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });

function fmtDate(v: any): string {
  const d = v?.toDate ? v.toDate() : (typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : (v ? new Date(v) : null));
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

type Filter = 'ACTIVE' | 'RECEIVED' | 'ALL';

export default function StoreImportRequestsView({
  articles, factures, categories, generalCategories, stores, adminUid, storeId, seesAllStores, readOnly,
}: StoreImportRequestsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [search, setSearch] = useState('');

  const enriched = useEnrichedArticles(articles, factures);
  const storeName = (id?: string | null) => stores.find((s: any) => s.id === id)?.name || id || '';

  const requests = useMemo(() => {
    return (enriched || [])
      .filter((a: any) => a.requestSource === 'STORE' && (seesAllStores || a.requestedByStore === storeId))
      .map((a: any) => {
        const stage = toStage(computeEffectiveStatus({
          status: a.status, arrivalDate: a.arrivalDate, stockEntryDate: a.stockEntryDate,
        }));
        const created = a.requestedAt || a.createdAt;
        const ts = created?.toDate ? created.toDate().getTime() : (created?.seconds ? created.seconds * 1000 : 0);
        return { a, stage, ts, frName: getArticleFrenchName(a, categories, generalCategories) };
      })
      .sort((x, y) => y.ts - x.ts);
  }, [enriched, seesAllStores, storeId, categories, generalCategories]);

  const counts = useMemo(() => ({
    ACTIVE: requests.filter(r => r.stage !== 'RECEIVED').length,
    RECEIVED: requests.filter(r => r.stage === 'RECEIVED').length,
    ALL: requests.length,
  }), [requests]);

  const byStage = useMemo(() => {
    const acc: Record<Stage, number> = { SENT: 0, ORDERED: 0, ON_THE_WAY: 0, AT_PORT: 0, RECEIVED: 0 };
    requests.forEach(r => { acc[r.stage]++; });
    return acc;
  }, [requests]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      if (filter === 'ACTIVE' && r.stage === 'RECEIVED') return false;
      if (filter === 'RECEIVED' && r.stage !== 'RECEIVED') return false;
      if (!q) return true;
      return [r.frName, r.a.name, r.a.categoryId, r.a.color, r.a.quality, r.a.requestedByStoreName, r.a.notes]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [requests, filter, search]);

  const canRequest = Boolean(storeId && adminUid && !readOnly);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Service import</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Demandes <span className="text-amber-400">d'Import</span>
            </h2>
            <p className="text-stone-400 text-xs mt-2 max-w-lg">
              Un produit manque ou n'existe pas encore ? Envoyez une demande : elle arrive directement
              dans les Besoins de l'import, et vous suivez ici son avancement jusqu'à l'arrivée en stock.
            </p>
          </div>
          {canRequest && (
            <Button
              onClick={() => setModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black uppercase text-[11px] tracking-widest px-6 h-12 rounded-2xl gap-2 shadow-lg shadow-amber-500/20 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nouvelle demande
            </Button>
          )}
        </div>

        {/* Étapes */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-2 mt-6">
          {STAGE_ORDER.map(st => {
            const conf = STAGES[st];
            const Icon = conf.icon;
            return (
              <div key={st} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
                  <Icon className="w-3 h-3" /> {conf.label}
                </p>
                <p className="text-2xl font-black text-white mt-0.5">{byStage[st]}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtres + recherche */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {([
            ['ACTIVE', 'En cours'],
            ['RECEIVED', 'Reçues'],
            ['ALL', 'Toutes'],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${
                filter === key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >
              {label} <span className="opacity-60 ml-1">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit, une couleur…"
            className="h-10 pl-9 rounded-xl border-stone-200 text-xs font-semibold"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
          <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600 font-black uppercase text-xs tracking-widest">
            {requests.length === 0 ? 'Aucune demande envoyée' : 'Aucune demande dans cette vue'}
          </p>
          {requests.length === 0 && canRequest && (
            <p className="text-stone-400 text-[11px] font-medium mt-1">
              Cliquez sur « Nouvelle demande » pour demander un produit au service import.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(({ a, stage, frName }) => {
            const conf = STAGES[stage];
            const Icon = conf.icon;
            const stepIndex = STAGE_ORDER.indexOf(stage);
            const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.length : 0;
            const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.length : 0;
            const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.length : 0;
            const internal = String(a.name || a.categoryId || '');

            return (
              <div key={a.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-black text-stone-900 uppercase leading-tight">{frName}</p>
                      {internal && internal.toLowerCase() !== frName.toLowerCase() && (
                        <span className="text-[10px] font-bold text-stone-400 uppercase">· {internal}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {a.quality && <Chip>{a.quality}</Chip>}
                      {a.color && String(a.color).toLowerCase() !== 'various' && <Chip>{a.color}</Chip>}
                      {a.size && String(a.size).toLowerCase() !== 'various' && <Chip>{a.size}</Chip>}
                      {qualities > 1 && <Chip icon={Sparkles}>{qualities} qualités</Chip>}
                      {colors > 0 && <Chip icon={Palette}>{colors} couleur{colors > 1 ? 's' : ''}</Chip>}
                      {sizes > 0 && <Chip icon={Ruler}>{sizes} taille{sizes > 1 ? 's' : ''}</Chip>}
                      {seesAllStores && a.requestedByStore && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-900 text-white">
                          <StoreIcon className="w-3 h-3" /> {a.requestedByStoreName || storeName(a.requestedByStore)}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-stone-400">Demandée le {fmtDate(a.requestedAt || a.createdAt)}</span>
                    </div>
                    {a.notes && <p className="text-[11px] text-stone-500 mt-1.5 italic">« {a.notes} »</p>}
                  </div>

                  <div className="flex items-center gap-4 md:gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-xl font-black text-stone-900 leading-none">{fmtQty(a.quantity)}</p>
                      <p className="text-[10px] font-black text-stone-400 uppercase mt-1">{a.unitOfMeasure || 'pcs'}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-3 py-1.5 rounded-full border whitespace-nowrap ${conf.cls}`}>
                      <Icon className="w-3.5 h-3.5" /> {conf.label}
                    </span>
                  </div>
                </div>

                {/* Barre d'avancement */}
                <div className="flex gap-1 mt-3">
                  {STAGE_ORDER.map((st, i) => (
                    <div
                      key={st}
                      className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? STAGES[stage].dot : 'bg-stone-100'}`}
                      title={STAGES[st].label}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canRequest && (
        <AddOrderModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          adminUid={adminUid}
          activeStore={storeId || undefined}
          storeRequest={{ storeId: storeId!, storeName: storeName(storeId) }}
        />
      )}
    </div>
  );
}

function Chip({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border bg-stone-50 text-stone-600 border-stone-200">
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
