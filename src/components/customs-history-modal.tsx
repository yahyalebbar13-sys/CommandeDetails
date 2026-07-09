import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirebase } from '@/firebase';
import { getDoc, getDocs, doc, collection } from 'firebase/firestore';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CustomsHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[]; // tous les articles de la catégorie sélectionnée
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
      const data: any[] = [];

      try {
        // Charger toutes les déclarations douanières d'un coup
        const allDeclarations: Record<string, any> = {};
        const declSnaps = await getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'));
        declSnaps.forEach(s => { allDeclarations[s.id] = s.data(); });

        // Pour chaque article de la catégorie, trouver dans quelle(s) facture(s) il est arrivé
        // Un article peut apparaître dans plusieurs factures (champ factureId ou via mouvements)
        // On utilise directement le champ factureId de l'article (= le dossier d'arrivage)
        const seen = new Set<string>();

        articles.forEach(article => {
          // Récupérer toutes les factures liées à cet article
          // La source principale est article.factureId (arrivage unique)
          // mais on cherche aussi dans toutes les factures si l'article y apparaît
          const articleFactureIds: string[] = [];

          // 1) Champ direct sur l'article
          if (article.factureId) articleFactureIds.push(article.factureId);

          // 2) Chercher dans toutes les factures (champ articles ou lignes)
          factures.forEach(f => {
            if (f.id && !articleFactureIds.includes(f.id)) {
              // Vérifier si la facture contient cet article
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
            // L'article n'a pas encore de dossier d'arrivage (En production ou en transit)
            data.push({
              factureId: null,
              factureRef: '—',
              date: article.arrivalDate || '—',
              articleId: article.id,
              articleName: `${article.name || article.productName || ''}${article.color ? ` - ${article.color}` : ''}${article.size ? ` (${article.size})` : ''}`.trim(),
              defaultHsCode: article.hsCode || null,
              defaultImportDuty: article.importDutyRate || article.importDuty || null,
              defaultTva: article.tvaRate || article.tva || null,
              hasOverride: false,
              override: null,
              status: 'PENDING' // Pseudo status pour l'UI
            });
          } else {
            // Dédoublonnage article+facture
            articleFactureIds.forEach(fid => {
              const key = `${article.id}_${fid}`;
              if (seen.has(key)) return;
              seen.add(key);

              const facture = factures.find(f => f.id === fid);
              const decl = allDeclarations[fid];
              const overrideData = decl?.overrides?.[article.id] || null;
              const hasOverride = !!overrideData && Object.keys(overrideData).length > 0;

              // Récupérer le code HS de la catégorie depuis dp_declarations ou l'article
              const defaultHsCode = decl?.hsCode || decl?.hs_code || article.hsCode || null;
              const defaultImportDuty = decl?.importDutyRate || article.importDutyRate || article.importDuty || null;
              const defaultTva = decl?.tvaRate || article.tvaRate || article.tva || null;

              data.push({
                factureId: fid,
                factureRef: facture?.ref || facture?.containerRef || fid,
                date: facture?.date || facture?.arrivalDate || article.arrivalDate || '—',
                articleId: article.id,
                articleName: `${article.name || article.productName || ''}${article.color ? ` - ${article.color}` : ''}${article.size ? ` (${article.size})` : ''}`.trim(),
                defaultHsCode,
                defaultImportDuty,
                defaultTva,
                hasOverride,
                override: overrideData,
                status: 'ARRIVED'
              });
            });
          }
        });

        // Trier par date décroissante, puis par nom d'article
        data.sort((a, b) => {
          const da = a.date && a.date !== '—' ? new Date(a.date).getTime() : 0;
          const db = b.date && b.date !== '—' ? new Date(b.date).getTime() : 0;
          if (db !== da) return db - da;
          return a.articleName.localeCompare(b.articleName);
        });

        if (mounted) setHistoryData(data);
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
        {/* Header sombre */}
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
              <p className="text-stone-500 font-bold text-sm">Aucun dédouanement enregistré pour cette catégorie.</p>
            </div>
          ) : (
            <div className="bg-[#111] border border-stone-800 rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-stone-800 hover:bg-transparent">
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest w-[90px] py-3 px-4">Date</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Dossier</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Produit</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">Code HS</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest py-3 px-4">DI / TVA</TableHead>
                    <TableHead className="font-black text-[9px] uppercase text-stone-500 tracking-widest text-right py-3 px-4">Override</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((row, i) => {
                    const isOverride = row.hasOverride;
                    const isPending = row.status === 'PENDING';
                    
                    const hsCode = isOverride && row.override?.hsCode ? row.override.hsCode : row.defaultHsCode || '—';
                    const di = isOverride && row.override?.importDuty ? `${row.override.importDuty}%`
                      : isOverride && row.override?.importDutyRate ? `${row.override.importDutyRate}%`
                      : row.defaultImportDuty ? `${row.defaultImportDuty}%` : '—';
                    const tva = isOverride && row.override?.tva ? `${row.override.tva}%`
                      : isOverride && row.override?.tvaRate ? `${row.override.tvaRate}%`
                      : row.defaultTva ? `${row.defaultTva}%` : '—';

                    return (
                      <TableRow key={i} className={`border-stone-800/50 hover:bg-white/[0.03] transition-colors ${isPending ? 'opacity-60' : ''}`}>
                        <TableCell className="font-bold text-stone-400 text-xs py-3 px-4">{row.date}</TableCell>
                        <TableCell className="py-3 px-4">
                          {isPending ? (
                            <span className="font-bold text-[9px] uppercase text-stone-500 tracking-wider">En attente</span>
                          ) : (
                            <span className="font-black text-white text-xs bg-stone-800 px-2 py-0.5 rounded-md">{row.factureRef}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-stone-300 text-xs uppercase py-3 px-4">{row.articleName}</TableCell>
                        <TableCell className="py-3 px-4">
                          <span className="font-black text-amber-400 text-xs font-mono">{hsCode}</span>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">DI: {di}</span>
                            <span className="text-[10px] font-bold text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">TVA: {tva}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-3 px-4">
                          {isPending ? (
                            <span className="text-[9px] font-bold text-stone-600 uppercase">—</span>
                          ) : isOverride ? (
                            <div className="flex flex-col items-end gap-1">
                              <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 text-[8px] font-black uppercase tracking-widest px-2 hover:bg-red-500/20">
                                Fausse Déclaration
                              </Badge>
                              {row.override?.customsValuePerKg && (
                                <span className="text-[9px] font-bold text-stone-500">{row.override.customsValuePerKg} MAD/kg</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[9px] font-bold text-stone-700 uppercase">Standard</span>
                          )}
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
