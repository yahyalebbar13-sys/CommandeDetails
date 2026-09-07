"use client";

import React, { useState, useMemo } from 'react';
import { 
  Receipt, Fuel, Utensils, Car, ParkingCircle, Package, MoreHorizontal,
  Plus, Search, Filter, Calendar, Download, Trash2, CheckCircle2, 
  Clock, AlertCircle, Camera, Check, X, ShieldAlert, Sparkles, Building2, User
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
  CARBURANT:     { label: 'Carburant',     icon: Fuel,          color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  TRANSPORT:     { label: 'Transport',     icon: Car,           color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  REPAS:         { label: 'Repas / Déjeuners', icon: Utensils,  color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200' },
  PEAGE_PARKING: { label: 'Péage & Parking', icon: ParkingCircle, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  FOURNITURES:   { label: 'Fournitures',   icon: Package,       color: 'text-stone-600',  bg: 'bg-stone-50 border-stone-200' },
  AUTRE:         { label: 'Autre / Divers', icon: MoreHorizontal, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
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
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('CARBURANT');
  const [newDescription, setNewDescription] = useState('');
  const [newCommercialName, setNewCommercialName] = useState(currentUserName || '');
  const [newStoreId, setNewStoreId] = useState<string>(activeStore !== 'ALL' && activeStore !== 'ALL_MAIN' ? activeStore : (stores[0]?.id || ''));
  const [newReceiptUrl, setNewReceiptUrl] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
        const catLabel = (CATEGORY_CONFIG[e.category]?.label || '').toLowerCase();
        if (!desc.includes(q) && !comm.includes(q) && !catLabel.includes(q)) return false;
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
    let totalCarburant = 0;
    let totalPending = 0;

    expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      if (e.date?.startsWith(currentMonthPrefix)) totalMonth += amt;
      if (e.date && e.date >= mondayStr) totalWeek += amt;
      if (e.category === 'CARBURANT') totalCarburant += amt;
      if (!e.status || e.status === 'PENDING') totalPending += amt;
    });

    return { totalMonth, totalWeek, totalCarburant, totalPending, count: expenses.length };
  }, [expenses]);

  // Soumission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) {
      toast({ variant: 'destructive', title: 'Montant invalide', description: 'Veuillez renseigner un montant supérieur à 0.' });
      return;
    }
    if (!newDescription.trim()) {
      toast({ variant: 'destructive', title: 'Motif requis', description: 'Veuillez préciser la nature de la dépense.' });
      return;
    }

    setSaving(true);
    try {
      await onAddExpense({
        date: newDate,
        amount: amt,
        category: newCategory,
        description: newDescription.trim(),
        commercialName: newCommercialName.trim() || currentUserName || 'Commercial',
        commercialId: currentUserId || undefined,
        storeId: newStoreId || undefined,
        receiptUrl: newReceiptUrl.trim() || undefined,
        status: userRole === 'ADMIN' ? 'APPROVED' : 'PENDING',
      });

      toast({ title: 'Dépense enregistrée avec succès' });
      setIsModalOpen(false);
      setNewAmount('');
      setNewDescription('');
      setNewReceiptUrl('');
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
                Gestion Commerciale & Frais
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <span>Frais & <span className="text-amber-500">Dépenses</span></span>
            </h1>
            <p className="text-stone-400 text-xs sm:text-sm font-bold mt-1 max-w-2xl">
              Notes de frais des commerciaux (carburant, déplacements, déjeuners). Déclarez vos tickets en temps réel avec photo justificative.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              onClick={handleExportPDF}
              variant="outline"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Mois */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              Ce mois-ci
            </span>
            <Receipt className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
            {fmt$(kpis.totalMonth)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Total des frais déclarés du mois
          </p>
        </div>

        {/* Cette semaine */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
              Cette semaine
            </span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight">
            {fmt$(kpis.totalWeek)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Point hebdomadaire (Vendredi)
          </p>
        </div>

        {/* Carburant */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Carburant
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
            {fmt$(kpis.totalCarburant)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Gasoil & Essence tournées
          </p>
        </div>

        {/* En attente validation */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
              En Attente
            </span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight">
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
            placeholder="Rechercher commercial, motif..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs font-bold rounded-xl border-stone-200 bg-stone-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre Catégorie */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 bg-stone-50/50 w-40">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes catégories</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                <SelectItem key={k} value={k}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre Mois */}
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 bg-stone-50/50 w-36">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes dates</SelectItem>
              {availableMonths.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Liste des Dépenses ── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <Receipt className="w-12 h-12 text-stone-200 mx-auto" />
            <p className="text-stone-400 font-black uppercase text-xs tracking-wider">Aucune dépense enregistrée</p>
            <Button
              onClick={() => setIsModalOpen(true)}
              variant="outline"
              className="rounded-xl text-xs font-black uppercase"
            >
              Ajouter le premier reçu
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-100 text-[10px] font-black uppercase tracking-wider text-stone-500">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Commercial / Magasin</th>
                  <th className="py-3 px-4">Catégorie</th>
                  <th className="py-3 px-4">Motif & Justificatif</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs font-bold text-stone-800">
                {filteredExpenses.map(expense => {
                  const catCfg = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.AUTRE;
                  const Icon = catCfg.icon;

                  return (
                    <tr key={expense.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-stone-600 font-bold">
                        {expense.date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-black text-stone-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-stone-400" />
                          <span>{expense.commercialName || 'Commercial'}</span>
                        </div>
                        {expense.storeId && (
                          <div className="text-[10px] text-stone-400 font-bold">
                            {stores.find(s => s.id === expense.storeId)?.name || expense.storeId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${catCfg.bg} ${catCfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {catCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-stone-800 font-medium line-clamp-2">{expense.description}</p>
                        {expense.receiptUrl && (
                          <button
                            onClick={() => setPreviewImage(expense.receiptUrl!)}
                            className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <Camera className="w-3 h-3" /> Voir ticket / reçu
                          </button>
                        )}
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
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              <span>Déclarer une Dépense</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
                <Label className="text-[10px] font-black uppercase text-stone-500">Montant (MAD) *</Label>
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

            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-stone-500">Motif / Description *</Label>
              <Input
                placeholder="Ex: Plein carburant camionnette tournée Derb Omar"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="rounded-xl h-10 text-xs font-bold"
                required
              />
            </div>

            {userRole === 'ADMIN' && (
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
                  <Label className="text-[10px] font-black uppercase text-stone-500">Magasin</Label>
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
            )}

            {/* Photo / Justificatif du reçu */}
            <div className="space-y-1 pt-1">
              <Label className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-stone-400" />
                <span>Photo du ticket / reçu de caisse</span>
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
                  <Check className="w-3 h-3" /> Image jointe avec succès
                </p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-xl text-xs font-black uppercase">
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl text-xs font-black uppercase tracking-wider px-6">
                {saving ? 'Enregistrement...' : 'Enregistrer la Dépense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal Visualisation Image / Reçu ── */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg rounded-3xl p-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase">Justificatif de dépense</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="mt-2 flex justify-center">
              <img src={previewImage} alt="Justificatif" className="max-h-[70vh] rounded-2xl object-contain shadow-md" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
