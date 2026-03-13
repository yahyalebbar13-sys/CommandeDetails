
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Users, ChevronLeft, Package, Calendar, Clock, 
  Ship, FileText, ArrowRight, Factory, DollarSign, Plus, 
  Trash2, Landmark, CheckCircle2, History 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SuppliersViewProps {
  articles: any[];
  factures: any[];
  payments: any[];
  onNavigateToFacture: (factureId: string) => void;
}

export default function SuppliersView({ articles, factures, payments, onNavigateToFacture }: SuppliersViewProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const supplierStats = useMemo(() => {
    const stats: Record<string, { val: number; orders: number; categories: Set<string> }> = {};
    articles.forEach(o => {
      const sup = o.supplierId || 'Inconnu';
      if (!stats[sup]) stats[sup] = { val: 0, orders: 0, categories: new Set() };
      stats[sup].val += (o.quantity * o.purchasePricePerUnit);
      stats[sup].orders += 1;
      stats[sup].categories.add(o.categoryId || 'Inconnu');
    });
    return Object.entries(stats).sort((a, b) => b[1].val - a[1].val);
  }, [articles]);

  if (selectedSupplier) {
    return (
      <SupplierDetailView 
        supplierName={selectedSupplier} 
        articles={articles} 
        factures={factures}
        payments={payments}
        onBack={() => setSelectedSupplier(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <header className="bg-stone-900 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Analyse des <br /><span className="text-amber-500">Partenaires</span></h2>
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3">Gestion de la performance financière par fournisseur</p>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {supplierStats.map(([name, stat]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedSupplier(name)}
            className="cursor-pointer border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group active:scale-95 status-glow-amber"
          >
            <div className="h-1 w-full bg-stone-900 group-hover:bg-amber-500 transition-colors" />
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-amber-600 transition-colors">{name}</CardTitle>
                <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-amber-500 transition-colors">
                  <Users className="w-4 h-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-stone-900 mb-6">{Math.round(stat.val).toLocaleString()} $</div>
              <div className="space-y-2 pt-4 border-t border-stone-50">
                <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                  <span>Articles</span>
                  <span className="text-stone-900">{stat.orders}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                  <span>Familles</span>
                  <span className="text-stone-900">{stat.categories.size}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupplierDetailView({ 
  supplierName, 
  articles, 
  factures, 
  payments,
  onBack, 
  onNavigateToFacture 
}: { 
  supplierName: string, 
  articles: any[], 
  factures: any[], 
  payments: any[],
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const supArticles = useMemo(() => articles.filter(o => o.supplierId === supplierName), [articles, supplierName]);
  const supPayments = useMemo(() => (payments || []).filter(p => p.supplierId === supplierName).sort((a, b) => b.date.localeCompare(a.date)), [payments, supplierName]);
  
  const now = new Date();
  
  // Total Réel (Articles + Fret)
  const totalItemsVal = supArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0);
  
  const supplierFactures = useMemo(() => {
    const ids = Array.from(new Set(supArticles.map(a => a.factureId).filter(Boolean)));
    
    return ids.map(id => {
      const factInfo = factures.find(f => f.id === id);
      const fArticles = supArticles.filter(a => a.factureId === id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = Number(factInfo?.freightCost) || Number(factInfo?.freight) || 0;
      const declared = Number(factInfo?.declaredValue) || itemsVal + freight;
      
      return {
        id,
        arrivalDate: factInfo?.arrivalDate || fArticles[0]?.arrivalDate || '-',
        itemsVal,
        freight,
        cbm,
        declared,
        totalReal: itemsVal + freight,
        isArrived: factInfo?.arrivalDate ? new Date(factInfo.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [supArticles, factures]);

  const totalRealVal = supplierFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalDeclaredVal = supplierFactures.reduce((s, f) => s + f.declared, 0);
  const totalPaid = supPayments.reduce((s, p) => s + Number(p.amount), 0);
  const currentGap = totalRealVal - totalDeclaredVal;
  const remainingToPay = currentGap - totalPaid;

  const handleDeletePayment = (paymentId: string) => {
    if (!user || !firestore) return;
    if (window.confirm("Supprimer ce paiement ?")) {
      const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', paymentId);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Paiement supprimé" });
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Fournisseurs
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Dossier Partenaire Consolidé</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{supplierName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supplierFactures.length} Dossiers
                </Badge>
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supArticles.length} Articles
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Valeur Réelle Totale" value={Math.round(totalRealVal).toLocaleString()} sub="$" color="text-white" />
            <SummaryBlock label="Valeur Déclarée Totale" value={Math.round(totalDeclaredVal).toLocaleString()} sub="$" color="text-amber-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence Totale</p>
              <div className="text-xl font-black text-blue-400">{Math.round(currentGap).toLocaleString()} $</div>
            </div>
            <div className={`p-5 rounded-2xl text-white shadow-lg border ${remainingToPay <= 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'}`}>
              <p className="text-[8px] font-black opacity-70 uppercase tracking-widest mb-1">Reste à Régulariser</p>
              <div className="text-xl font-black">{Math.round(remainingToPay).toLocaleString()} $</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-stone-100 rounded-lg">
                <FileText className="w-4 h-4 text-stone-500" />
              </div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Historique des Factures & Arrivages</h3>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Volume CBM</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Réelle</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4 text-amber-600">Valeur Déclarée</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierFactures.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun dossier détecté</TableCell></TableRow>
                  ) : supplierFactures.map((f) => (
                    <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                      <TableCell className="py-3">
                        {f.isArrived ? 
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                        }
                      </TableCell>
                      <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                      <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                      <TableCell className="py-3 text-right font-bold text-stone-500 text-[10px]">{f.cbm.toFixed(3)} m³</TableCell>
                      <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Math.round(f.totalReal).toLocaleString()} $</TableCell>
                      <TableCell className="py-3 text-right font-black text-amber-600 text-[11px] bg-amber-50/30">{Math.round(f.declared).toLocaleString()} $</TableCell>
                      <TableCell className="py-3">
                        <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Landmark className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Règlements Différence</h3>
              </div>
              <Button 
                onClick={() => setIsPaymentModalOpen(true)}
                className="bg-stone-900 hover:bg-black text-white h-8 text-[9px] font-black uppercase px-3 rounded-lg shadow-lg shadow-stone-200"
              >
                <Plus className="w-3 h-3 mr-1.5" /> Transmettre
              </Button>
            </div>

            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-stone-50 py-3 border-b">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 flex items-center gap-2">
                  <History className="w-3 h-3" /> Historique des règlements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {supPayments.length === 0 ? (
                      <TableRow><TableCell className="text-center py-10 text-stone-300 font-bold uppercase text-[9px]">Aucun règlement enregistré</TableCell></TableRow>
                    ) : supPayments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-blue-50/20 transition-colors group border-stone-50">
                        <TableCell className="py-3 pl-4">
                          <div className="text-[10px] font-black text-stone-900">{p.date}</div>
                          <div className="text-[8px] font-bold text-stone-400 uppercase truncate max-w-[120px]">{p.notes || 'Règlement diff.'}</div>
                        </TableCell>
                        <TableCell className="py-3 text-right font-black text-blue-600">
                          {Math.round(p.amount).toLocaleString()} $
                        </TableCell>
                        <TableCell className="py-3 pr-4 w-10">
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)} className="h-6 w-6 text-stone-200 hover:text-red-500 opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {supPayments.length > 0 && (
                <div className="p-4 bg-stone-50 border-t flex justify-between items-center">
                  <span className="text-[9px] font-black text-stone-400 uppercase">Total Transmis</span>
                  <span className="text-xs font-black text-blue-700">{Math.round(totalPaid).toLocaleString()} $</span>
                </div>
              )}
            </Card>
          </section>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Landmark className="w-5 h-5 text-amber-600" />
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Note Comptable</h4>
            </div>
            <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">
              "Le 'Reste à Régulariser' représente la somme due au partenaire pour compenser l'écart entre la facturation réelle et les montants déclarés en douane, déduction faite de vos transmissions déjà saisies."
            </p>
          </div>
        </div>
      </div>

      <AddPaymentModal 
        open={isPaymentModalOpen} 
        onOpenChange={setIsPaymentModalOpen} 
        supplierId={supplierName} 
      />
    </div>
  );
}

function SummaryBlock({ label, value, sub, color }: { label: string, value: string, sub?: string, color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-center min-w-[140px] backdrop-blur-md">
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <div className={`text-xl font-black ${color} leading-none`}>
        {value} <span className="text-[10px] font-normal text-stone-500 ml-1">{sub}</span>
      </div>
    </div>
  );
}

function AddPaymentModal({ open, onOpenChange, supplierId }: { open: boolean, onOpenChange: (o: boolean) => void, supplierId: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.amount) return;

    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', id);
    
    setDocumentNonBlocking(docRef, {
      ...formData,
      id,
      supplierId,
      createdAt: serverTimestamp()
    }, { merge: true });

    toast({ title: "Règlement enregistré", description: `${formData.amount} $ pour ${supplierId}` });
    onOpenChange(false);
    setFormData({ amount: 0, date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 border-none overflow-hidden">
        <div className="bg-stone-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Transmettre Fonds</DialogTitle>
              <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Règlement différence {supplierId}</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant Transmis ($)</Label>
            <Input 
              type="number" 
              required 
              value={formData.amount}
              onChange={e => setFormData(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
              className="h-12 border-stone-200 font-black text-lg rounded-xl focus:ring-stone-900"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Date de Transmission</Label>
            <Input 
              type="date" 
              required 
              value={formData.date}
              onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Notes / Référence</Label>
            <Input 
              placeholder="Ex: Virement Western, Cash..." 
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
        </form>
        <DialogFooter className="p-6 bg-stone-50 gap-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 font-black uppercase text-[10px] tracking-widest flex-1">Annuler</Button>
          <Button onClick={handleSubmit} className="h-11 bg-stone-900 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200">
            Confirmer l'envoi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
