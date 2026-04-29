"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Building2, Ship, Anchor, TrendingUp, TrendingDown, Download, Search, Filter } from 'lucide-react';

interface ShipmentsTableViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

const COMPANY_COLORS: Record<string, string> = {
  'New fournitures': 'bg-violet-100 text-violet-700 border-violet-200',
  'Lebtex': 'bg-blue-100 text-blue-700 border-blue-200',
  'Robe in box': 'bg-rose-100 text-rose-700 border-rose-200',
};

const fmt = (n: number, dec = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function ShipmentsTableView({ articles, factures, subCategories }: ShipmentsTableViewProps) {
  const { user, firestore } = useFirebase();
  const [dpDeclarations, setDpDeclarations] = useState<Record<string, Record<string, string>>>({});
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [sortKey, setSortKey] = useState<string>('arrivalDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!firestore || !user) return;
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const r: Record<string, Record<string, string>> = {};
        snap.docs.forEach(d => { if (d.data().puMap) r[d.id] = d.data().puMap; });
        setDpDeclarations(r);
      }).catch(() => {});
  }, [firestore, user]);

  const rows = useMemo(() => {
    const MARGE = 0.05;
    return (factures || []).map(f => {
      const fArticles = articles.filter(a => a.factureId === f.id);
      const cbm = fArticles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);
      const nw = fArticles.reduce((s, a) => s + (Number(a.netWeight) || 0), 0);
      const itemsVal = fArticles.reduce((s, a) => s + (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0), 0);
      const freight = Number(f.freightCost) || 0;
      const realVal = itemsVal + freight;
      const declaredVal = Number(f.declaredValue) || realVal;
      const invoicePaidDhs = Number(f.invoicePaidDhs) || 0;
      const tauxChange = declaredVal > 0 ? invoicePaidDhs / declaredVal : 0;
      const exchange = Number(f.exchangeInvoiceAmount) || 0;
      const transitaire = Number(f.supplierInvoiceAmount) || 0;
      const fraisSupp = Number(f.additionalCostsAmount) || 0;
      const fretMad = freight * tauxChange;
      const totalFraisLog = exchange + transitaire + fraisSupp;
      const mtFraisRevient = (totalFraisLog + fretMad) / 1.20;
      const mtFraisVente = totalFraisLog / 1.20;
      const cbmTotal = cbm;
      const puMap = dpDeclarations[f.id] || {};
      const hasDp = Object.values(puMap).some(v => parseFloat(v as string) > 0);

      let revient = 0;
      fArticles.forEach(a => {
        const aCbm = Number(a.cubicMeasurement) || 0;
        const aNw = Number(a.netWeight) || 0;
        const qty = Number(a.quantity) || 0;
        const fraisCmd = cbmTotal > 0 ? (aCbm / cbmTotal) * mtFraisRevient : 0;
        const valAchat = qty * (Number(a.purchasePricePerUnit) || 0) * tauxChange;
        const cat = subCategories.find((c: any) => c.name === a.categoryId);
        const vd = cat?.customsValuePerKg != null ? aNw * Number(cat.customsValuePerKg) : 0;
        const di = cat?.importDutyRate != null ? vd * Number(cat.importDutyRate) / 100 : 0;
        const tpi = cat?.tpiRate != null ? vd * Number(cat.tpiRate) / 100 : 0;
        const tic = cat?.ticRate != null ? vd * Number(cat.ticRate) / 100 : 0;
        const tva = cat?.tvaRate != null ? (vd + di + tpi) * Number(cat.tvaRate) / 100 : 0;
        revient += valAchat + fraisCmd + di + tpi + tic + tva;
      });

      const catMap: Record<string, { qty: number; nw: number; cbm: number }> = {};
      fArticles.forEach(a => {
        const k = a.categoryId || '—';
        if (!catMap[k]) catMap[k] = { qty: 0, nw: 0, cbm: 0 };
        catMap[k].qty += Number(a.quantity) || 0;
        catMap[k].nw += Number(a.netWeight) || 0;
        catMap[k].cbm += Number(a.cubicMeasurement) || 0;
      });
      let vente = 0;
      Object.entries(catMap).forEach(([catId, { qty, nw: cNw, cbm: cCbm }]) => {
        const pu = parseFloat(puMap[catId] ?? '') || 0;
        if (!pu) return;
        const valAchat = qty * pu * tauxChange;
        const fraisCmd = cbmTotal > 0 ? (cCbm / cbmTotal) * mtFraisVente : 0;
        const cat = subCategories.find((c: any) => c.name === catId);
        const vd = cat?.customsValuePerKg != null ? cNw * Number(cat.customsValuePerKg) : 0;
        const di = cat?.importDutyRate != null ? vd * Number(cat.importDutyRate) / 100 : 0;
        const tpi = cat?.tpiRate != null ? vd * Number(cat.tpiRate) / 100 : 0;
        const tic = cat?.ticRate != null ? vd * Number(cat.ticRate) / 100 : 0;
        const totalHT = valAchat + fraisCmd + di + tpi + tic;
        const baseTva = vd + di + tpi + fraisCmd;
        const tva = cat?.tvaRate != null ? baseTva * Number(cat.tvaRate) / 100 : 0;
        vente += totalHT + totalHT * MARGE + tva;
      });

      return {
        id: f.id, declaringCompany: f.declaringCompany || '—', supplierId: f.supplierId || '—',
        shippingDate: f.shippingDate || '—', arrivalDate: f.arrivalDate || '—', stockEntryDate: f.stockEntryDate || '—',
        noBL: f.noBL || '—', shippingLine: f.shippingLine || '—', forwarder: f.forwarder || '—',
        cbm, nw, itemsVal, freight, realVal, declaredVal,
        invoicePaidDhs, tauxChange, exchange, transitaire, fraisSupp, totalFraisLog,
        revient, vente, diff: revient - vente, hasDp,
        articlesCount: fArticles.length,
      };
    });
  }, [factures, articles, subCategories, dpDeclarations]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filterCompany) r = r.filter(x => x.declaringCompany === filterCompany);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => x.id.toLowerCase().includes(q) || x.supplierId.toLowerCase().includes(q) || x.noBL.toLowerCase().includes(q));
    }
    return [...r].sort((a: any, b: any) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, filterCompany, search, sortKey, sortDir]);

  const totals = useMemo(() => ({
    cbm: filtered.reduce((s, r) => s + r.cbm, 0),
    nw: filtered.reduce((s, r) => s + r.nw, 0),
    realVal: filtered.reduce((s, r) => s + r.realVal, 0),
    invoicePaidDhs: filtered.reduce((s, r) => s + r.invoicePaidDhs, 0),
    totalFraisLog: filtered.reduce((s, r) => s + r.totalFraisLog, 0),
    revient: filtered.reduce((s, r) => s + r.revient, 0),
    vente: filtered.reduce((s, r) => s + r.vente, 0),
    diff: filtered.reduce((s, r) => s + r.diff, 0),
  }), [filtered]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const exportCSV = () => {
    const headers = ['Dossier','Société','Fournisseur','ETD','ETA','Entrée Stock','N° BL','Shipping Line','Transitaire','CBM','NW (kg)','Val. Facture $','Val. Déclarée $','Fret $','Payé MAD','Taux','Frais Log MAD','Coût Revient MAD','Coût Vente MAD','Différence MAD','DP'];
    const rows2 = filtered.map(r => [r.id,r.declaringCompany,r.supplierId,r.shippingDate,r.arrivalDate,r.stockEntryDate,r.noBL,r.shippingLine,r.forwarder,r.cbm.toFixed(2),r.nw.toFixed(0),r.realVal.toFixed(2),r.declaredVal.toFixed(2),r.freight.toFixed(2),r.invoicePaidDhs.toFixed(0),r.tauxChange.toFixed(4),r.totalFraisLog.toFixed(0),r.revient.toFixed(0),r.vente.toFixed(0),r.diff.toFixed(0),r.hasDp?'Oui':'Non']);
    const csv = [headers, ...rows2].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'arrivages.csv'; a.click();
  };

  const Th = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
    <th onClick={() => handleSort(k)} className={`px-3 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:bg-stone-800 transition-colors ${right ? 'text-right' : 'text-left'} ${sortKey === k ? 'text-amber-400' : 'text-stone-400'}`}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <header className="bg-stone-900 rounded-3xl p-8 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
        <div className="relative z-10">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">Registre Complet</p>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">Tableau <span className="text-amber-500">Arrivages</span></h1>
          <p className="text-stone-400 text-sm mt-3">{filtered.length} dossier{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} · {factures.length} au total</p>
        </div>
        <div className="flex flex-wrap gap-3 relative z-10">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 h-10">
            <Search className="w-3.5 h-3.5 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="bg-transparent text-white text-[11px] font-bold outline-none w-36 placeholder:text-stone-600" />
          </div>
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="bg-white/5 border border-white/10 text-stone-300 text-[10px] font-black uppercase rounded-2xl px-4 h-10 outline-none">
            <option value="">Toutes sociétés</option>
            <option value="New fournitures">New fournitures</option>
            <option value="Lebtex">Lebtex</option>
            <option value="Robe in box">Robe in box</option>
          </select>
          <button onClick={exportCSV} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl px-5 h-10 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </header>

      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'CBM Total', val: `${fmt(totals.cbm, 1)} m³`, color: 'text-sky-600' },
          { label: 'NW Total', val: `${fmt(totals.nw)} kg`, color: 'text-stone-700' },
          { label: 'Val. Réelle', val: `${fmt(totals.realVal, 0)} $`, color: 'text-amber-600' },
          { label: 'Payé MAD', val: `${fmt(totals.invoicePaidDhs / 1000, 0)}K`, color: 'text-stone-700' },
          { label: 'Frais Log.', val: `${fmt(totals.totalFraisLog / 1000, 0)}K`, color: 'text-stone-700' },
          { label: 'Coût Revient', val: `${fmt(totals.revient / 1000, 1)}K`, color: 'text-stone-900' },
          { label: 'Coût Vente', val: `${fmt(totals.vente / 1000, 1)}K`, color: 'text-sky-700' },
          { label: 'Différence', val: `${totals.diff >= 0 ? '+' : ''}${fmt(totals.diff / 1000, 1)}K`, color: totals.diff >= 0 ? 'text-emerald-600' : 'text-red-600' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-3 text-center">
            <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-sm font-black ${color} leading-none`}>{val}</p>
            <p className="text-[7px] text-stone-300 font-bold uppercase mt-0.5">MAD</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-stone-900 sticky top-0 z-10">
                <Th k="id" label="Dossier" />
                <Th k="declaringCompany" label="Société" />
                <Th k="supplierId" label="Fournisseur" />
                <Th k="shippingDate" label="ETD" />
                <Th k="arrivalDate" label="ETA" />
                <Th k="stockEntryDate" label="Entrée Stock" />
                <Th k="noBL" label="N° BL" />
                <Th k="shippingLine" label="Armateur" />
                <Th k="forwarder" label="Transitaire" />
                <Th k="articlesCount" label="Réfs" right />
                <Th k="cbm" label="CBM" right />
                <Th k="nw" label="NW kg" right />
                <Th k="itemsVal" label="Marchandise $" right />
                <Th k="freight" label="Fret $" right />
                <Th k="realVal" label="Val. Réelle $" right />
                <Th k="declaredVal" label="Déclarée $" right />
                <Th k="invoicePaidDhs" label="Payé MAD" right />
                <Th k="tauxChange" label="Taux" right />
                <Th k="exchange" label="Échange MAD" right />
                <Th k="transitaire" label="Fact. Transit." right />
                <Th k="fraisSupp" label="Frais Supp." right />
                <Th k="revient" label="Coût Revient" right />
                <Th k="vente" label="Coût Vente" right />
                <Th k="diff" label="Différence" right />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className={`border-b border-stone-50 hover:bg-amber-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-stone-50/30'}`}>
                  <td className="px-3 py-2.5 font-black text-stone-900 uppercase whitespace-nowrap">{r.id}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.declaringCompany !== '—'
                      ? <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${COMPANY_COLORS[r.declaringCompany] || 'bg-stone-100 text-stone-600'}`}>{r.declaringCompany}</span>
                      : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-stone-600 whitespace-nowrap">{r.supplierId}</td>
                  <td className="px-3 py-2.5 text-stone-500 whitespace-nowrap">{r.shippingDate}</td>
                  <td className="px-3 py-2.5 font-bold text-stone-700 whitespace-nowrap">{r.arrivalDate}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.stockEntryDate !== '—' ? <span className="text-emerald-600 font-bold">{r.stockEntryDate}</span> : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-stone-500 whitespace-nowrap">{r.noBL}</td>
                  <td className="px-3 py-2.5 text-stone-500 whitespace-nowrap">{r.shippingLine}</td>
                  <td className="px-3 py-2.5 text-stone-500 whitespace-nowrap">{r.forwarder}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-stone-600">{r.articlesCount}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-sky-600">{fmt(r.cbm, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-stone-600">{fmt(r.nw)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-amber-700">{fmt(r.itemsVal, 0)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{fmt(r.freight, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-stone-800">{fmt(r.realVal, 0)}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600 font-bold">{fmt(r.declaredVal, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{r.invoicePaidDhs > 0 ? fmt(r.invoicePaidDhs) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{r.tauxChange > 0 ? r.tauxChange.toFixed(3) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{r.exchange > 0 ? fmt(r.exchange) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{r.transitaire > 0 ? fmt(r.transitaire) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{r.fraisSupp > 0 ? fmt(r.fraisSupp) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-black text-stone-900">{r.revient > 0 ? `${fmt(r.revient / 1000, 1)}K` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-black text-sky-700">
                    {r.hasDp && r.vente > 0 ? `${fmt(r.vente / 1000, 1)}K` : <span className="text-[8px] text-amber-500 font-bold">DP manquante</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.hasDp && r.vente > 0 ? (
                      <span className={`font-black ${r.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.diff >= 0 ? '+' : ''}{fmt(r.diff / 1000, 1)}K
                      </span>
                    ) : <span className="text-stone-300">—</span>}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-stone-900 text-white font-black border-t-2 border-stone-700">
                <td className="px-3 py-3 text-[9px] uppercase tracking-widest text-stone-400" colSpan={10}>TOTAL ({filtered.length} dossiers)</td>
                <td className="px-3 py-3 text-right text-sky-300">{fmt(totals.cbm, 1)}</td>
                <td className="px-3 py-3 text-right">{fmt(totals.nw)}</td>
                <td className="px-3 py-3 text-right text-amber-400">{fmt(totals.realVal, 0)}</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right">{fmt(totals.realVal, 0)}</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right text-emerald-400">{fmt(totals.invoicePaidDhs)}</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right text-stone-400">—</td>
                <td className="px-3 py-3 text-right">{fmt(totals.revient / 1000, 1)}K</td>
                <td className="px-3 py-3 text-right text-sky-300">{fmt(totals.vente / 1000, 1)}K</td>
                <td className={`px-3 py-3 text-right text-lg ${totals.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totals.diff >= 0 ? '+' : ''}{fmt(totals.diff / 1000, 1)}K
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-stone-300 font-black uppercase text-[11px] tracking-[0.2em]">Aucun dossier trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}
