"use client";

import React, { useMemo, useState, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, History, AlertTriangle } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface HistoryRevientViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

export default function HistoryRevientView({ articles, factures, subCategories }: HistoryRevientViewProps) {
  const { user, firestore } = useFirebase();
  const [declarations, setDeclarations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all dp_declarations to get overrides for all factures
  useEffect(() => {
    if (!firestore || !user) return;
    setLoading(true);
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const decls: Record<string, any> = {};
        snap.forEach(doc => {
          decls[doc.id] = doc.data();
        });
        setDeclarations(decls);
      })
      .catch(err => console.error('Error fetching declarations for history:', err))
      .finally(() => setLoading(false));
  }, [firestore, user]);

  const allComputedArticles = useMemo(() => {
    if (loading) return [];
    
    // We compute cost for ALL articles, grouping them conceptually by their facture
    // But we just return a flat array for the table
    const result = [];

    // Group articles by factureId
    const articlesByFacture = articles.reduce((acc, a) => {
      if (!acc[a.factureId]) acc[a.factureId] = [];
      acc[a.factureId].push(a);
      return acc;
    }, {} as Record<string, any[]>);

    for (const facture of factures) {
      const dossierArticles = articlesByFacture[facture.id] || [];
      if (dossierArticles.length === 0) continue;

      const factureDecl = declarations[facture.id] || {};
      const overrides = factureDecl.overrides || {};

      // ── Taux de change ──
      const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
      const declaredValue = Number(facture.declaredValue) || 0;
      const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

      // ── Frais logistiques totaux du dossier (MAD) ──
      const exchange = Number(facture.exchangeInvoiceAmount) || 0;
      const transitaire = Number(facture.supplierInvoiceAmount) || 0;
      const fraisSupp = Number(facture.additionalCostsAmount) || 0;
      const fretMad = (Number(facture.freightCost) || 0) * tauxChange;
      const mtFraisTotal = (exchange + transitaire + fraisSupp + fretMad) / 1.20;

      // ── CBM total du dossier ──
      const cbmTotal = dossierArticles.reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0);

      const rows = dossierArticles.map((a: any) => {
        const ov = overrides[a.id] || {};
        const hasOverride = Object.keys(ov).length > 0;

        const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(a.cubicMeasurement)) || 0;
        const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(a.netWeight)) || 0;
        const qty = (ov.quantity != null ? Number(ov.quantity) : Number(a.quantity)) || 0;

        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

        const cat = subCategories.find(c => c.name === a.categoryId);
        const customsValuePerKg = ov.customsValuePerKg != null
          ? Number(ov.customsValuePerKg)
          : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
        const importDutyRate = ov.importDutyRate != null
          ? Number(ov.importDutyRate) / 100
          : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null);
        const tpiRate = ov.tpiRate != null
          ? Number(ov.tpiRate) / 100
          : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null);
        const ticRate = ov.ticRate != null
          ? Number(ov.ticRate) / 100
          : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : null);
        const tvaRate = ov.tvaRate != null
          ? Number(ov.tvaRate) / 100
          : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null);
        const hasCustData = customsValuePerKg !== null;

        const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
        const di = importDutyRate != null ? valDouane * importDutyRate : 0;
        const tpi = tpiRate != null ? valDouane * tpiRate : 0;
        const tic = ticRate != null ? valDouane * ticRate : 0;
        const tva = tvaRate != null ? (valDouane + di + tpi + tic) * tvaRate : 0;
        const totalDouane = di + tpi + tic + tva;

        const pauDollar = (ov.purchasePricePerUnit != null ? Number(ov.purchasePricePerUnit) : Number(a.purchasePricePerUnit)) || 0;
        const valAchatMad = qty * pauDollar * tauxChange;

        const mtTotal = hasCustData ? (valAchatMad + fraisCmd + totalDouane) : 0;
        const pauTtc = (hasCustData && qty > 0) ? mtTotal / qty : 0;

        return {
          ...a,
          factureName: facture.id,
          factureDate: facture.arrivalDate,
          cbm, nw, qty, pauDollar,
          valAchatMad,
          fraisCmd,
          cat,
          customsValuePerKg, importDutyRate, tpiRate, ticRate, tvaRate,
          hasCustData,
          valDouane, di, tpi, tic, tva, totalDouane,
          mtTotal, pauTtc,
          missingData: !hasCustData,
          hasOverride,
          _ov: ov
        };
      });

      result.push(...rows);
    }

    // Filtrer pour ne garder que les produits arrivés en stock (ou déjà livrés/vendus depuis le stock)
    const inStockArticles = result.filter(a => a.status === 'STOCK' || a.status === 'DELIVERED');

    // Sort by factureDate descending, then by article name
    return inStockArticles.sort((a, b) => {
      const dateDiff = (b.factureDate || '').localeCompare(a.factureDate || '');
      if (dateDiff !== 0) return dateDiff;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [articles, factures, subCategories, declarations, loading]);

  const filteredArticles = useMemo(() => {
    if (!searchTerm) return allComputedArticles;
    const lower = searchTerm.toLowerCase();
    return allComputedArticles.filter((a: any) => 
      (a.name || '').toLowerCase().includes(lower) ||
      (a.categoryId || '').toLowerCase().includes(lower) ||
      (a.factureName || '').toLowerCase().includes(lower)
    );
  }, [allComputedArticles, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-6">
        <Loader2 className="animate-spin text-sky-500 w-12 h-12" />
        <p className="text-stone-400 font-black uppercase tracking-[0.3em] text-[10px]">Chargement de l'historique...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-sky-500 rounded-xl">
                <History className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">Vue Globale</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Historique Coût Revient</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Historique complet des prix d'achat unitaires TTC pour tous les articles de tous vos dossiers.
            </p>
          </div>

          <div className="w-full lg:w-96 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Chercher un article, catégorie, dossier..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 text-white placeholder-stone-500 font-bold text-sm rounded-xl pl-12 pr-4 h-12 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
        </div>
      </header>

      {/* ── Tableau détaillé ── */}
      <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="bg-stone-900 px-8 py-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">
            Tous les Articles
          </h3>
          <Badge className="bg-sky-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
            {filteredArticles.length} résultats
          </Badge>
        </div>

        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-stone-50 shadow-sm">
              <TableRow className="border-b border-stone-100">
                <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 px-6">Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 min-w-[200px]">Article</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">QTÉ</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-sky-500 py-4 text-right">Val. Achat (MAD)</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-indigo-400 py-4 text-right">Frais Log. (MAD)</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right">Tot. Douane (MAD)</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">MT Total (MAD)</TableHead>
                <TableHead className="text-[9px] font-black uppercase text-emerald-600 py-4 text-right pr-6">P.A.U TTC (MAD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArticles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                    Aucun article trouvé
                  </TableCell>
                </TableRow>
              )}
              {filteredArticles.map((row: any) => (
                <TableRow
                  key={row.id + row.factureId}
                  className="border-stone-50 hover:bg-stone-50/50 transition-colors"
                >
                  {/* Dossier */}
                  <TableCell className="py-4 px-6">
                    <div className="font-black text-[11px] text-stone-900 uppercase">{row.factureName}</div>
                    <div className="text-[9px] text-stone-400 font-bold">{row.factureDate}</div>
                  </TableCell>

                  {/* Article */}
                  <TableCell className="py-4">
                    <div className="font-black text-[11px] text-stone-900 uppercase leading-tight flex items-center gap-1.5">
                      {row.name || row.categoryId}
                      {row.hasOverride && (
                        <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-amber-600 bg-amber-100 px-1 py-0.5 rounded uppercase" title="Modifié dans Cost Analysis">
                          <AlertTriangle className="w-2 h-2" /> Override
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-stone-400 font-bold uppercase mt-0.5">
                      {row.categoryId} {row.size && row.size !== 'various' ? `— T: ${row.size}` : ''}
                    </div>
                  </TableCell>

                  {/* QTÉ */}
                  <TableCell className="text-right font-black text-[11px] text-stone-900 py-4">
                    {Number(row.qty).toLocaleString('fr-MA')}
                    <div className="text-[8px] text-stone-400 font-bold uppercase">{row.unitOfMeasure}</div>
                  </TableCell>

                  {/* Valeur achat en MAD */}
                  <TableCell className="text-right font-black text-[11px] text-sky-700 py-4">
                    {row.valAchatMad > 0 ? row.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—'}
                  </TableCell>

                  {/* Frais logistiques */}
                  <TableCell className="text-right font-black text-[11px] text-indigo-700 py-4">
                    {row.cbm > 0 ? row.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—'}
                  </TableCell>

                  {/* Total douane */}
                  <TableCell className="text-right font-black text-[11px] text-orange-700 py-4">
                    {row.hasCustData && row.nw > 0 ? row.totalDouane.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—'}
                  </TableCell>

                  {/* MT Total */}
                  <TableCell className="text-right font-black text-[11px] text-stone-900 py-4">
                    {row.mtTotal > 0 ? row.mtTotal.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—'}
                  </TableCell>

                  {/* PAU TTC */}
                  <TableCell className="text-right py-4 pr-6 bg-emerald-50/20">
                    {row.pauTtc > 0 ? (
                      <div>
                        <p className="font-black text-base text-emerald-700 leading-none">
                          {row.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </p>
                      </div>
                    ) : (
                      <span className="text-stone-300 font-normal text-[9px]">Manquant</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
