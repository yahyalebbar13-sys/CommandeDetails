import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirebase } from '@/firebase';
import { getDoc, doc } from 'firebase/firestore';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CustomsHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[];
  categoryName: string;
  entriesIN: any[];
  factures: any[];
}

export default function CustomsHistoryModal({ open, onOpenChange, articles, categoryName, entriesIN, factures }: CustomsHistoryModalProps) {
  const { firestore, user } = useFirebase();
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !articles.length || !firestore || !user) return;
    
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      const data: any[] = [];
      
      // Get unique factures that have entries in this category
      const factureIds = Array.from(new Set(entriesIN.map(mv => mv.factureId).filter(Boolean)));
      
      try {
        await Promise.all(
          factureIds.map(async (fid: string) => {
            const snap = await getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', fid));
            const facture = factures.find(f => f.id === fid);
            
            // For each facture, find all entries that belong to it
            const factureEntries = entriesIN.filter(mv => mv.factureId === fid);
            
            // Group by articleId within this facture to avoid duplicating rows if multiple entries for same article
            const uniqueArticleIds = Array.from(new Set(factureEntries.map(mv => mv._realArticleId || mv.articleId).filter(Boolean)));
            
            uniqueArticleIds.forEach(articleId => {
              const article = articles.find(a => a.id === articleId);
              if (!article) return;
              
              let overrideData = null;
              if (snap.exists() && snap.data().overrides && snap.data().overrides[articleId]) {
                overrideData = snap.data().overrides[articleId];
              }
              
              const entry = factureEntries.find(mv => (mv._realArticleId || mv.articleId) === articleId);
              
              data.push({
                factureId: fid,
                factureRef: facture?.ref || facture?.id || fid,
                date: entry?.date || facture?.date || '—',
                articleName: `${article.name} ${article.color ? `- ${article.color}` : ''} ${article.size ? `(${article.size})` : ''}`,
                defaultHsCode: article.hsCode,
                defaultImportDuty: article.importDuty,
                defaultTva: article.tva,
                hasOverride: !!overrideData && Object.keys(overrideData).length > 0,
                override: overrideData
              });
            });
          })
        );
        
        // Sort by date descending
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (mounted) setHistoryData(data);
      } catch (err) {
        console.error("Error fetching customs history:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchData();
    return () => { mounted = false; };
  }, [open, articles, firestore, user, entriesIN, factures]);

  if (!articles || articles.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-stone-50">
        <DialogHeader className="p-6 bg-white border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-stone-900 tracking-tighter">
                Historique de Dédouanement
              </DialogTitle>
              <p className="text-sm font-bold text-stone-500 mt-1 uppercase tracking-widest">
                Catégorie : <span className="text-stone-900">{categoryName}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-stone-300 animate-spin mb-4" />
              <p className="text-sm font-bold text-stone-500 uppercase tracking-widest">Chargement de l'historique...</p>
            </div>
          ) : historyData.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-stone-100">
              <p className="text-stone-400 font-bold">Aucun dédouanement enregistré pour les produits de cette catégorie.</p>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500 w-[100px]">Date</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500">Dossier</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500">Produit</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500">Code HS</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500">DI / TVA</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-stone-500 text-right">Fausse Déclaration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((row, i) => {
                    const isOverride = row.hasOverride;
                    const hsCode = isOverride && row.override.hsCode ? row.override.hsCode : row.defaultHsCode || 'Par défaut';
                    const di = isOverride && row.override.importDuty ? `${row.override.importDuty}%` : (row.defaultImportDuty ? `${row.defaultImportDuty}%` : '—');
                    const tva = isOverride && row.override.tva ? `${row.override.tva}%` : (row.defaultTva ? `${row.defaultTva}%` : '20%');

                    return (
                      <TableRow key={i} className="hover:bg-stone-50/50 transition-colors">
                        <TableCell className="font-bold text-stone-600 text-xs">{row.date}</TableCell>
                        <TableCell className="font-black text-stone-900 text-xs">{row.factureRef}</TableCell>
                        <TableCell className="font-bold text-stone-800 text-xs uppercase">{row.articleName}</TableCell>
                        <TableCell className="font-bold text-stone-600 text-xs">{hsCode}</TableCell>
                        <TableCell className="font-bold text-stone-600 text-xs">DI: {di} | TVA: {tva}</TableCell>
                        <TableCell className="text-right">
                          {isOverride ? (
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100 text-[9px] font-black uppercase tracking-widest px-2">
                                Override Appliqué
                              </Badge>
                              {row.override.customsValuePerKg && (
                                <span className="text-[10px] font-bold text-stone-500">Val: {row.override.customsValuePerKg} MAD/kg</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest">Non</span>
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
