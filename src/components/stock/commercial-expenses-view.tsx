"use client";

import React, { useState, useMemo } from 'react';
import { 
  Receipt, Fuel, Utensils, Car, ParkingCircle, Package, MoreHorizontal,
  Plus, Search, Filter, Calendar, Download, Trash2, CheckCircle2, 
  Clock, AlertCircle, Camera, Check, X, ShieldAlert, Sparkles, Building2, User,
  ShoppingBag, ArrowDownRight, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { CommercialExpense, ExpenseCategory, StoreLocation, Store } from '@/lib/types';
import { exportReportPDF } from '@/lib/pdf-export-reports';

interface CommercialExpensesViewProps {
  expenses: CommercialExpense[];
  stores: Store[];
  activeStore: StoreLocation | 'ALL';
  userRole: 'ADMIN' | 'COMMERCIAL';
  currentUserName?: string;
  currentUserId?: string;
  onAddExpense: (expense: Omit<CommercialExpense, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateExpenseStatus?: (id: string, status: 'PENDING' | 'APPROVED' | 'REIMBURSED') => Promise<void>;
  onDeleteExpense?: (id: string) => Promise<void>;
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; icon: any; color: string; bg: string }> = {
  ACHAT_MARCHANDISE: { label: 'Achat Marchandise (Marché)', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  CARBURANT:         { label: 'Carburant',                icon: Fuel,        color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  TRANSPORT:         { label: 'Transport',                icon: Car,         color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  REPAS:             { label: 'Repas / Déjeuners',        icon: Utensils,    color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200' },
  PEAGE_PARKING:     { label: 'Péage & Parking',          icon: ParkingCircle, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  FOURNITURES:       { label: 'Fournitures',              icon: Package,     color: 'text-stone-600',  bg: 'bg-stone-50 border-stone-200' },
  AUTRE:             { label: 'Autre / Divers',           icon: MoreHorizontal, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
};

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';

export default function CommercialExpensesView({
  expenses = [],
  stores = [],
  activeStore,
  userRole,
  currentUserName,
  currentUserId,
  onAddExpense,
  onUpdateExpenseStatus,
  onDeleteExpense,
}: CommercialExpensesViewProps) {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Modal d'ajout
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newAmount, setNewAmount] = useState<string>('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('ACHAT_MARCHANDISE');
  const [newDescription, setNewDescription] = useState('');
  const [newCommercialName, setNewCommercialName] = useState(currentUserName || '');
  const [newStoreId, setNewStoreId] = useState<string>(activeStore !== 'ALL' && activeStore !== 'ALL_MAIN' ? activeStore : (stores[0]?.id || ''));
  const [newReceiptUrl, setNewReceiptUrl] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Champs spécifiques Achat Marchandise
  const [newArticleName, setNewArticleName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [newUnitOfMeasure, setNewUnitOfMeasure] = useState('pcs');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddToStock, setNewAddToStock] = useState(true);

  // Mois disponibles
  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach(e => { if (e.date) s.add(e.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [expenses]);

  // Filtrage
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (selectedCategory !== 'ALL' && e.category !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && (e.status || 'PENDING') !== selectedStatus) return false;
      if (selectedMonth !== 'ALL' && !e.date?.startsWith(selectedMonth)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const comm = (e.commercialName || '').toLowerCase();
        const art = (e.articleName || '').toLowerCase();
        const supp = (e.supplierName || '').toLowerCase();
        const catLabel = (CATEGORY_CONFIG[e.category]?.label || '').toLowerCase();
        if (!desc.includes(q) && !comm.includes(q) && !catLabel.includes(q) && !art.includes(q) && !supp.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, selectedCategory, selectedStatus, selectedMonth, search]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().substring(0, 7);

    // Semaine actuelle (lundi à aujourd'hui)
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    const mondayStr = monday.toISOString().split('T')[0];

    let totalMonth = 0;
    let totalWeek = 0;
    let totalMarchandise = 0;
    let totalCarburant = 0;
    let totalPending = 0;

    expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      if (e.date?.startsWith(currentMonthPrefix)) totalMonth += amt;
      if (e.date && e.date >= mondayStr) totalWeek += amt;
      if (e.category === 'ACHAT_MARCHANDISE') totalMarchandise += amt;
      if (e.category === 'CARBURANT') totalCarburant += amt;
      if (!e.status || e.status === 'PENDING') totalPending += amt;
    });

    return { totalMonth, totalWeek, totalMarchandise, totalCarburant, totalPending, count: expenses.length };
  }, [expenses]);

  // Calcul automatique du montant total si quantité et prix unitaire changent
  const handleQtyChange = (qtyVal: string) => {
    setNewQuantity(qtyVal);
    const q = parseFloat(qtyVal);
    const p = parseFloat(newUnitPrice);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setNewAmount((q * p).toFixed(2));
    }
  };

  const handlePriceChange = (priceVal: string) => {
    setNewUnitPrice(priceVal);
    const q = parseFloat(newQuantity);
    const p = parseFloat(priceVal);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setNewAmount((q * p).toFixed(2));
    }
  };

  // Soumission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) {
      toast({ variant: 'destructive', title: 'Montant invalide', description: 'Veuillez renseigner un montant supérieur à 0.' });
      return;
    }

    const isMarchandise = newCategory === 'ACHAT_MARCHANDISE';
    if (isMarchandise && !newArticleName.trim()) {
      toast({ variant: 'destructive', title: 'Désignation requise', description: 'Veuillez indiquer le nom de la marchandise achetée.' });
      return;
    }

    if (!isMarchandise && !newDescription.trim()) {
      toast({ variant: 'destructive', title: 'Motif requis', description: 'Veuillez préciser la nature de la dépense.' });
      return;
    }

    const desc = isMarchandise
      ? `Achat marché : ${newArticleName.trim()}${newQuantity ? ` (${newQuantity} ${newUnitOfMeasure})` : ''}${newSupplierName.trim() ? ` chez ${newSupplierName.trim()}` : ''}${newDescription.trim() ? ` — ${newDescription.trim()}` : ''}`
      : newDescription.trim();

    setSaving(true);
    try {
      await onAddExpense({
        date: newDate,
        amount: amt,
        category: newCategory,
        description: desc,
        commercialName: newCommercialName.trim() || currentUserName || 'Commercial',
        ...(currentUserId ? { commercialId: currentUserId } : {}),
        ...(newStoreId ? { storeId: newStoreId } : {}),
        ...(newReceiptUrl.trim() ? { receiptUrl: newReceiptUrl.trim() } : {}),
        status: userRole === 'ADMIN' ? 'APPROVED' : 'PENDING',
        ...(isMarchandise ? {
          articleName: newArticleName.trim() || undefined,
          quantity: newQuantity ? parseFloat(newQuantity) : undefined,
          unitPrice: newUnitPrice ? parseFloat(newUnitPrice) : (newQuantity ? amt / parseFloat(newQuantity) : undefined),
          unitOfMeasure: newUnitOfMeasure || 'pcs',
          supplierName: newSupplierName.trim() || undefined,
          addToStock: newAddToStock,
        } : {}),
      });

      setIsModalOpen(false);
      setNewAmount('');
      setNewDescription('');
      setNewReceiptUrl('');
      setNewArticleName('');
      setNewQuantity('');
      setNewUnitPrice('');
      setNewSupplierName('');
      setNewAddToStock(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || 'Action impossible.' });
    } finally {
      setSaving(false);
    }
  };

  // Upload photo
  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setNewReceiptUrl(b64);
    };
    reader.readAsDataURL(file);
  };

  // Export PDF
  const handleExportPDF = () => {
    const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const marchandise = filteredExpenses.filter(e => e.category === 'ACHAT_MARCHANDISE').reduce((s, e) => s + (e.amount || 0), 0);
    const carburant = filteredExpenses.filter(e => e.category === 'CARBURANT').reduce((s, e) => s + (e.amount || 0), 0);

    exportReportPDF({
      title: 'Frais & Dépenses des Commerciaux',
      subtitle: `${filteredExpenses.length} note(s) de frais — Total : ${fmt$(total)}`,
      columns: [
        { header: 'Date', dataKey: 'date', width: 22 },
        { header: 'Commercial', dataKey: 'commercial', width: 30 },
        { header: 'Catégorie', dataKey: 'category', width: 25 },
        { header: 'Motif / Description', dataKey: 'description' },
        { header: 'Montant (MAD)', dataKey: 'amount', width: 25 },
        { header: 'Statut', dataKey: 'status', width: 22 },
      ],
      data: filteredExpenses.map(e => ({
        date: e.date || '',
        commercial: e.commercialName || '—',
        category: CATEGORY_CONFIG[e.category]?.label || e.category,
        description: e.description || '',
        amount: `${(e.amount || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
        status: e.status === 'APPROVED' ? 'Validé' : e.status === 'REIMBURSED' ? 'Remboursé' : 'En attente',
      })),
      summaryRows: [
        { label: 'Total Général Dépenses', value: fmt$(total) },
        { label: 'Achats Marchandise Marché', value: fmt$(marchandise) },
        { label: 'Part Carburant', value: fmt$(carburant) },
      ],
      footer: 'LEBTEX SARL AU — Relevé Officiel des Frais Commerciaux & Justificatifs',
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-3 py-1 rounded-full">
                Gestion Commerciale & Dépenses
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <span>Frais, Dépenses & <span className="text-amber-500">Achats Marché</span></span>
            </h1>
            <p className="text-xs sm:text-sm text-stone-400 font-medium mt-2 max-w-xl">
              Suivi des dépenses sur le terrain, achats de marchandise au marché (dépannage local), carburant et justificatifs de frais.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="bg-stone-800 hover:bg-stone-700 text-white border-stone-700 font-black text-xs uppercase px-4 h-11 rounded-2xl gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </Button>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs uppercase px-5 h-11 rounded-2xl gap-2 shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Déclarer une dépense</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Mois */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              Ce mois-ci
            </span>
            <Receipt className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            {fmt$(kpis.totalMonth)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Total des frais déclarés
          </p>
        </div>

        {/* Cette semaine */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
              Cette semaine
            </span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
            {fmt$(kpis.totalWeek)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Bilan hebdomadaire (Vendredi)
          </p>
        </div>

        {/* Achats Marchandise Marché */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Marchandise
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 tracking-tight">
            {fmt$(kpis.totalMarchandise)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Achats dépannage marché
          </p>
        </div>

        {/* Carburant */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Carburant
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight">
            {fmt$(kpis.totalCarburant)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Gasoil & Essence tournées
          </p>
        </div>

        {/* En attente validation */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
              En Attente
            </span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-orange-600 tracking-tight">
            {fmt$(kpis.totalPending)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            À valider par la direction
          </p>
        </div>
      </div>

      {/* ── Toolbar & Filtres ── */}
      <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input
            placeholder="Rechercher commercial, marchandise, motif..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs font-bold rounded-xl border-stone-200 bg-stone-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre Catégorie */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[170px]">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les catégories</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                <SelectItem key={k} value={k}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre Statut */}
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[130px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">⏳ En attente</SelectItem>
              <SelectItem value="APPROVED">✅ Validé</SelectItem>
              <SelectItem value="REIMBURSED">💵 Remboursé</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre Mois */}
          {availableMonths.length > 0 && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[120px]">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les mois</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ── Table des Dépenses ── */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 mx-auto flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="text-sm font-black uppercase tracking-wider text-stone-400">
              Aucune note de frais enregistrée
            </p>
            <Button
              onClick={() => setIsModalOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-black uppercase"
            >
              Ajouter une dépense
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/50 text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Commercial / Magasin</th>
                  <th className="py-3 px-4">Catégorie</th>
                  <th className="py-3 px-4">Détails & Marchandise</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExpenses.map(expense => {
                  const catCfg = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.AUTRE;
                  const Icon = catCfg.icon;
                  const store = stores.find(s => s.id === expense.storeId);
                  const isMarchandise = expense.category === 'ACHAT_MARCHANDISE';

                  return (
                    <tr key={expense.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-600 font-bold">
                        {expense.date || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-stone-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-stone-400" />
                          <span>{expense.commercialName || 'Commercial'}</span>
                        </div>
                        {store && (
                          <span className="text-[10px] text-stone-400 font-bold flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" /> {store.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${catCfg.bg} ${catCfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {catCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="text-stone-800 font-bold line-clamp-2">{expense.description}</p>
                          
                          {/* Badge spécifique Achat Marchandise & Entrée Stock */}
                          {isMarchandise && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {expense.articleName && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  <Tag className="w-3 h-3 text-indigo-600" />
                                  {expense.articleName} {expense.quantity ? `(${expense.quantity} ${expense.unitOfMeasure || 'pcs'})` : ''}
                                </span>
                              )}
                              {(expense.stockMovementId || expense.addToStock) && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Entré en stock magasin
                                </span>
                              )}
                              {expense.supplierName && (
                                <span className="text-[10px] text-stone-500 font-bold">
                                  Vendeur : <span className="text-stone-700">{expense.supplierName}</span>
                                </span>
                              )}
                            </div>
                          )}

                          {expense.receiptUrl && (
                            <button
                              onClick={() => setPreviewImage(expense.receiptUrl!)}
                              className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <Camera className="w-3 h-3" /> Voir ticket / reçu
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-stone-900">
                          {fmt$(expense.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {expense.status === 'APPROVED' ? (
                          <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">
                            Validé
                          </span>
                        ) : expense.status === 'REIMBURSED' ? (
                          <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full uppercase">
                            Remboursé
                          </span>
                        ) : (
                          <span className="text-[9px] font-black text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full uppercase">
                            En attente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {userRole === 'ADMIN' && onUpdateExpenseStatus && expense.status !== 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onUpdateExpenseStatus(expense.id, 'APPROVED')}
                              className="h-8 px-2.5 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[10px] font-black uppercase"
                              title="Valider la dépense"
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Valider
                            </Button>
                          )}
                          {onDeleteExpense && (userRole === 'ADMIN' || expense.status === 'PENDING') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteExpense(expense.id)}
                              className="h-8 w-8 p-0 text-stone-300 hover:text-red-600 rounded-xl"
                              title="Supprimer la note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal d'Ajout d'une Dépense ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              <span>Déclarer une Dépense / Achat Marché</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-stone-500">Catégorie de dépense</Label>
              <Select value={newCategory} onValueChange={(v: ExpenseCategory) => setNewCategory(v)}>
                <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                    <SelectItem key={k} value={k}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SECTION DÉDIÉE : ACHAT MARCHANDISE DU MARCHÉ */}
            {newCategory === 'ACHAT_MARCHANDISE' && (
              <div className="p-4 rounded-2xl bg-indigo-50/80 border-2 border-indigo-200 space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-indigo-700" />
                  <p className="text-xs font-black uppercase text-indigo-950 tracking-wider">
                    Détail Marchandise Achetée au Marché
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase text-indigo-900">
                    Nom / Désignation de l'article *
                  </Label>
                  <Input
                    placeholder="Ex: Fermetures 50cm, Fil 40/2 Blanc, Boutons..."
                    value={newArticleName}
                    onChange={e => {
                      setNewArticleName(e.target.value);
                      if (!newDescription.trim()) {
                        setNewDescription(`Achat marché : ${e.target.value}`);
                      }
                    }}
                    className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-indigo-900">Quantité</Label>
                    <Input
                      type="number"
                      step="any"
                      min="1"
                      placeholder="Ex: 20"
                      value={newQuantity}
                      onChange={e => handleQtyChange(e.target.value)}
                      className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-indigo-900">Unité</Label>
                    <Select value={newUnitOfMeasure} onValueChange={setNewUnitOfMeasure}>
                      <SelectTrigger className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pcs">pcs (unités)</SelectItem>
                        <SelectItem value="rouleaux">rouleaux</SelectItem>
                        <SelectItem value="boîtes">boîtes</SelectItem>
                        <SelectItem value="mètres">mètres</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="paquets">paquets</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-indigo-900">P.U Achat (DH)</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ex: 12"
                      value={newUnitPrice}
                      onChange={e => handlePriceChange(e.target.value)}
                      className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase text-indigo-900">
                    Fournisseur / Vendeur du marché (Optionnel)
                  </Label>
                  <Input
                    placeholder="Ex: Grossiste Derb Omar, Marché local..."
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                  />
                </div>

                {/* Case à cocher : Entrer directement en stock magasin */}
                <div className="pt-1 flex items-start gap-2 bg-white/90 p-2.5 rounded-xl border border-indigo-200">
                  <input
                    type="checkbox"
                    id="addToStock"
                    checked={newAddToStock}
                    onChange={e => setNewAddToStock(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="addToStock" className="text-[11px] text-indigo-950 font-bold leading-tight cursor-pointer">
                    <span className="font-black">Entrer automatiquement cette marchandise en stock</span>
                    <span className="block text-[10px] text-indigo-700 font-normal mt-0.5">
                      Crée un mouvement d'entrée physique (IN) dans le stock du magasin pour la vente immédiate.
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Date</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="rounded-xl h-10 text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Montant Total (MAD) *</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="Ex: 250"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  className="rounded-xl h-10 text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-stone-500">
                {newCategory === 'ACHAT_MARCHANDISE' ? 'Précisions / Note supplémentaire' : 'Motif / Description *'}
              </Label>
              <Input
                placeholder={newCategory === 'ACHAT_MARCHANDISE' ? 'Note ou détail pour la caisse / comptabilité' : 'Ex: Plein carburant camionnette tournée Derb Omar'}
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="rounded-xl h-10 text-xs font-bold"
                required={newCategory !== 'ACHAT_MARCHANDISE'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Commercial</Label>
                <Input
                  placeholder="Nom du commercial"
                  value={newCommercialName}
                  onChange={e => setNewCommercialName(e.target.value)}
                  className="rounded-xl h-10 text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Magasin rattaché</Label>
                <Select value={newStoreId} onValueChange={setNewStoreId}>
                  <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Photo / Justificatif du reçu */}
            <div className="space-y-1 pt-1">
              <Label className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-stone-400" />
                <span>Photo du bon / ticket de caisse / reçu marché</span>
              </Label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptFile}
                className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer"
              />
              {newReceiptUrl && (
                <p className="text-[10px] text-emerald-600 font-black flex items-center gap-1 mt-1">
                  <Check className="w-3 h-3" /> Justificatif photo chargé avec succès
                </p>
              )}
            </div>

            <DialogFooter className="pt-4 flex justify-between items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl text-xs font-bold"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs uppercase px-5 rounded-xl shadow-md"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer la Dépense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal Visualisation Photo Reçu ── */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-3 bg-stone-900 border-stone-800 rounded-3xl overflow-hidden">
          <div className="flex justify-between items-center p-2 text-white">
            <span className="text-xs font-black uppercase tracking-wider">Justificatif / Reçu</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewImage(null)}
              className="text-stone-400 hover:text-white h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          {previewImage && (
            <div className="max-h-[75vh] overflow-auto rounded-2xl flex items-center justify-center bg-black/40 p-2">
              <img
                src={previewImage}
                alt="Reçu"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-2xl"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
