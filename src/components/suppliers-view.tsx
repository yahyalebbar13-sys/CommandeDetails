"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, ChevronLeft, Package, Calendar, Clock, Ship, FileText, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SuppliersViewProps {
  articles: any[];
  factures: any[];
  onNavigateToFacture: (factureId: string) => void;
}

export default function SuppliersView({ articles, factures, onNavigateToFacture }: SuppliersViewProps) {
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
        onBack={() => setSelectedSupplier(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <h2 className="text-2xl font-bold text-stone-800">Analyse Fournisseurs</h2>
        <p className="text-stone-600">Performance financière par partenaire commercial. Cliquez sur un nom pour voir les détails.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {supplierStats.map(([name, stat]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedSupplier(name)}
            className="cursor-pointer border-l-4 border-l-stone-800 shadow-sm hover:shadow-md hover:border-amber-300 transition-all group"
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl font-bold group-hover:text-amber-600 transition-colors">{name}</CardTitle>
                <Users className="w-4 h-4 text-stone-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-700 mb-4">{Math.round(stat.val).toLocaleString()} $</div>
              <div className="space-y-1 text-sm text-stone-500">
                <div className="flex justify-between">
                  <span>Articles commandés:</span>
                  <span className="font-bold text-stone-700">{stat.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Types de produits:</span>
                  <span className="font-bold text-stone-700">{stat.categories.size}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupplierDetailView({ supplierName, articles, factures, onBack, onNavigateToFacture }: { supplierName: string, articles: any[], factures: any[], onBack: () => void, onNavigateToFacture: (id: string) => void }) {
  const supArticles = useMemo(() => articles.filter(o => o.supplierId === supplierName), [articles, supplierName]);
  
  const now = new Date();
  const totalVal = supArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0);
  const totalQty = supArticles.reduce((s, o) => s + o.quantity, 0);
  const categoriesCount = new Set(supArticles.map(o => o.categoryId)).size;

  const futureArrivals = supArticles.map(o => new Date(o.arrivalDate).getTime()).filter(t => t > now.getTime());
  const nextArrivalDate = futureArrivals.length ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0] : 'Aucune';

  const supplierFactures = useMemo(() => {
    const ids = Array.from(new Set(supArticles.map(a => a.factureId).filter(Boolean)));
    
    return ids.map(id => {
      const factInfo = factures.find(f => f.id === id);
      const fArticles = supArticles.filter(a => a.factureId === id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = factInfo?.freightCost || factInfo?.freight || 0;
      
      return {
        id,
        arrivalDate: factInfo?.arrivalDate || fArticles[0]?.arrivalDate || '-',
        itemsVal,
        freight,
        cbm,
        total: itemsVal + freight,
        isArrived: factInfo?.arrivalDate ? new Date(factInfo.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [supArticles, factures]);

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-stone-800">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="text-stone-500 hover:text-stone-800 mb-2 p-0 h-auto">
            <ChevronLeft className="w-4 h-4 mr-1" /> Retour aux fournisseurs
          </Button>
          <h2 className="text-3xl font-bold text-stone-900">{supplierName}</h2>
        </div>
        <div className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200">
          <div className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">Volume Financier</div>
          <div className="text-2xl font-black text-amber-700">{Math.round(totalVal).toLocaleString()} $</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Quantité Totale" value={totalQty.toLocaleString()} icon={<Package className="w-4 h-4 text-stone-400" />} />
        <StatCard label="Types Produits" value={categoriesCount} icon={<Ship className="w-4 h-4 text-stone-400" />} />
        <StatCard label="Prochaine Arrivée" value={nextArrivalDate} icon={<Clock className="w-4 h-4 text-blue-400" />} className="bg-blue-50/50" />
        <StatCard label="Nombre Factures" value={supplierFactures.length} icon={<FileText className="w-4 h-4 text-stone-400" />} />
      </div>

      <Card className="overflow-hidden shadow-sm border-stone-200">
        <CardHeader className="bg-stone-50 py-4 px-6 border-b">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-stone-500" />
            Liste des Factures & Arrivages de {supplierName}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Statut</TableHead>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>Arrivée</TableHead>
                  <TableHead className="text-right">Volume CBM</TableHead>
                  <TableHead className="text-right">Valeur Articles</TableHead>
                  <TableHead className="text-right">Total (+Fret)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierFactures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-stone-400 italic py-8">Aucune facture enregistrée</TableCell>
                  </TableRow>
                ) : supplierFactures.map((f, i) => (
                  <TableRow key={i} className="hover:bg-stone-50 transition-colors">
                    <TableCell>
                      {f.isArrived ? 
                        <Badge className="bg-green-100 text-green-800 border-green-200">✅ Arrivé</Badge> : 
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">🚢 En Transit</Badge>
                      }
                    </TableCell>
                    <TableCell className="font-black text-stone-800">{f.id}</TableCell>
                    <TableCell className={`font-bold ${f.isArrived ? 'text-green-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                    <TableCell className="text-right text-emerald-700 font-bold">{f.cbm.toFixed(2)} m³</TableCell>
                    <TableCell className="text-right font-medium">{Math.round(f.itemsVal).toLocaleString()} $</TableCell>
                    <TableCell className="text-right font-black text-amber-700">{Math.round(f.total).toLocaleString()} $</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="hover:bg-stone-100 border-stone-200"
                        onClick={() => onNavigateToFacture(f.id)}
                      >
                        Consulter <ArrowRight className="ml-1 w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon, className }: any) {
  return (
    <Card className={`bg-white p-5 rounded-xl shadow-sm border border-stone-100 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">{label}</span>
      </div>
      <div className="text-xl font-bold text-stone-800">{value}</div>
    </Card>
  );
}