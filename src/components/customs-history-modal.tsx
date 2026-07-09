import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirebase } from '@/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { Loader2, ShieldAlert } from 'lucide-react';

interface CustomsHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[];
  categoryName: string;
  factures: any[];
}

export default function CustomsHistoryModal({ open, onOpenChange, articles, categoryName, factures }: CustomsHistoryModalProps) {
  const { firestore, user } = useFirebase();
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !articles.length || !firestore || !user) return;

    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      
      try {
        const allDeclarations: Record<string, any> = {};
        const declSnaps = await getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'));
        declSnaps.forEach(s => { allDeclarations[s.id] = s.data(); });

        const groups = new Map<string, any>();

        articles.forEach(article => {
          const articleFactureIds: string[] = [];
          if (article.factureId) articleFactureIds.push(article.factureId);

          factures.forEach(f => {
            if (f.id && !articleFactureIds.includes(f.id)) {
              const lines = f.articles || f.lignes || f.items || [];
              const found = lines.some((l: any) =>
                (l.articleId === article.id) ||
                (l.id === article.id) ||
                (l._realArticleId === article.id)
              );
              if (found) articleFactureIds.push(f.id);
            }
          });

          if (articleFactureIds.length === 0) {
            // PENDING
            const key = 'PENDING';
            if (!groups.has(key)) {
              groups.set(key, {
                status: 'PENDING',
                date: '—',
                factureRef: '—',
                count: 0
              });
            }
            groups.get(key).count++;
          } else {
            articleFactureIds.forEach(fid => {
              const facture = factures.find(f => f.id === fid);
              const decl = allDeclarations[fid];
              const overrideData = decl?.overrides?.[article.id] || null;
              const hasOverride = !!overrideData && Object.keys(overrideData).length > 0;

              const defaultHsCode = decl?.hsCode || decl?.hs_code || article.hsCode || '—';
              const defaultImportDuty = decl?.importDutyRate || article.importDutyRate || article.importDuty || '—';
              const defaultTva = decl?.tvaRate || article.tvaRate || article.tva || '—';
              const defaultTpi = decl?.tpiRate || article.tpiRate || article.tpi || '—';
              const defaultVal = decl?.customsValuePerKg || article.customsValuePerKg || '—';

              const hsCode = hasOverride && overrideData.hsCode ? overrideData.hsCode : defaultHsCode;
              const di = hasOverride && (overrideData.importDuty || overrideData.importDutyRate) ? (overrideData.importDuty || overrideData.importDutyRate) : defaultImportDuty;
              const tva = hasOverride && (overrideData.tva || overrideData.tvaRate) ? (overrideData.tva || overrideData.tvaRate) : defaultTva;
              const tpi = hasOverride && (overrideData.tpi || overrideData.tpiRate) ? (overrideData.tpi || overrideData.tpiRate) : defaultTpi;
              const val = hasOverride && overrideData.customsValuePerKg ? overrideData.customsValuePerKg : defaultVal;

              const sig = `${fid}_${hsCode}_${di}_${tva}_${tpi}_${val}_${hasOverride}`;

              if (!groups.has(sig)) {
                groups.set(sig, {
                  factureId: fid,
                  factureRef: facture?.ref || facture?.containerRef || fid,
                  date: facture?.date || facture?.arrivalDate || article.arrivalDate || '—',
                  status: 'ARRIVED',
                  hasOverride,
                  hsCode, di, tva, tpi, val,
                  baseHsCode: defaultHsCode,
                  baseDi: defaultImportDuty,
                  baseTva: defaultTva,
                  baseTpi: defaultTpi,
                  baseVal: defaultVal,
                  count: 0
                });
              }
              groups.get(sig).count++;
            });
          }
        });

        const arr = Array.from(groups.values());
        arr.sort((a, b) => {
          if (a.status === 'PENDING') return 1;
          if (b.status === 'PENDING') return -1;
          const da = a.date !== '—' ? new Date(a.date).getTime() : 0;
          const db = b.date !== '—' ? new Date(b.date).getTime() : 0;
          return db - da;
        });

        if (mounted) setHistoryData(arr);
      } catch (err) {
        console.error('Error fetching customs history:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [open, articles, firestore, user, factures]);

  if (!articles || articles.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-[#0f0f0f] border-stone-800">
        <DialogHeader className="p-6 bg-[#111] border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-white tracking-tighter">
                Historique de Dédouanement
              </DialogTitle>
              <p className="text-xs font-bold text-stone-500 mt-0.5 uppercase tracking-widest">
                Catégorie : <span className="text-orange-400">{categoryName}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-orange-400 animate-spin mb-4" />
              <p className="text-sm font-bold text-stone-500 uppercase tracking-widest">Chargement...</p>
            </div>
          ) : historyData.length === 0 ? (
            <div className="text-center py-16 bg-[#111] rounded-2xl border border-stone-800">
              <ShieldAlert className="w-8 h-8 text-stone-700 mx-auto mb-3" />
              <p className="text-stone-500 font-bold text-sm">Aucun historique disponible.</p>
            </div>
          ) : (
            <div className="bg-[#111] border border-stone-800 rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-stone-800 hover:bg-transparent">
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest w-[100px] py-3 px-4">Date</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Dossier</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Code HS</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Val. Douane</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">DI</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">TPI</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">TVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((row, i) => {
                    const isPending = row.status === 'PENDING';
                    
                    if (isPending) {
                      return (
                        <TableRow key={i} className="border-stone-800/50 hover:bg-white/[0.03] transition-colors opacity-60">
                          <TableCell className="font-bold text-stone-400 text-xs py-3 px-4">—</TableCell>
                          <TableCell className="py-3 px-4">
                            <span className="font-bold text-[9px] uppercase text-stone-500 tracking-wider">
                              En attente ({row.count} produit{row.count > 1 ? 's' : ''})
                            </span>
                          </TableCell>
                          <TableCell colSpan={5} className="py-3 px-4">
                            <span className="text-[9px] font-bold text-stone-600 uppercase">—</span>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const renderCell = (currentVal: any, baseVal: any, format: (v: any) => string) => {
                      if (!row.hasOverride || currentVal === baseVal) {
                        return <span className="text-xs font-bold text-stone-300">{format(currentVal)}</span>;
                      }
                      
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-amber-400">{format(currentVal)}</span>
                          <span className="text-[9px] font-bold text-stone-500 line-through">Base: {format(baseVal)}</span>
                        </div>
                      );
                    };

                    return (
                      <TableRow key={i} className={`border-stone-800/50 hover:bg-white/[0.03] transition-colors ${row.hasOverride ? 'bg-red-950/10' : ''}`}>
                        <TableCell className="font-bold text-stone-400 text-xs py-3 px-4">{row.date}</TableCell>
                        <TableCell className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-black text-white text-xs bg-stone-800 px-2 py-0.5 rounded-md">{row.factureRef}</span>
                            <span className="text-[9px] font-bold text-stone-500">{row.count} produit{row.count > 1 ? 's' : ''}</span>
                            {row.hasOverride && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                                  Exception
                                </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {renderCell(row.hsCode, row.baseHsCode, v => v !== '—' ? v : '—')}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {renderCell(row.val, row.baseVal, v => v !== '—' ? `${v} MAD` : '—')}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {renderCell(row.di, row.baseDi, v => v !== '—' ? `${v}%` : '—')}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {renderCell(row.tpi, row.baseTpi, v => v !== '—' ? `${v}%` : '—')}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {renderCell(row.tva, row.baseTva, v => v !== '—' ? `${v}%` : '—')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
