"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ListTodo, Trash2, ArrowRight, Pencil, Settings2, MousePointer2,
  Flame, AlertTriangle, CheckSquare, MessageSquareWarning, Send,
  ChevronDown, Package, X, Clock, CheckCircle2, Anchor, ChevronRight,
  Container, FileText, Check, UserCircle2
} from 'lucide-react';
import { useUser, useFirestore, deleteDocumentNonBlocking, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import LaunchOrderModal from './launch-order-modal';
import ExportBonCommande from './export-bon-commande';
import ExportClientCommande from './export-client-commande';
import { exportPropositionFournisseurPDF, exportPriceProposalPDF } from '@/lib/export-proposition-pdf';
import { exportBesoinsPDF } from '@/lib/pdf-export';
import { getStorage, ref as storageRef, getBlob } from 'firebase/storage';

interface ToOrderViewProps {
  articles: any[];
  factures: any[];
  onEdit: (article: any) => void;
}

export default function ToOrderView({ articles, factures, onEdit }: ToOrderViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  // Load supplier profiles for auto-fill in bon de commande
  const supplierProfilesRef = useMemoFirebase(
    () => user ? collection(firestore, 'users', user.uid, 'supplierProfiles') : null,
    [firestore, user]
  );
  const { data: supplierProfiles = [] } = useCollection(supplierProfilesRef);
  const supplierProfileMap = useMemo(() => {
    const map: Record<string, any> = {};
    (supplierProfiles || []).forEach((p: any) => { if (p.id) map[p.id] = p; });
    return map;
  }, [supplierProfiles]);

  // ── Sélection pour proposition fournisseur ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPropositionModal, setShowPropositionModal] = useState(false);
  const [propositionFournisseur, setPropositionFournisseur] = useState('');
  const [propositionNote, setPropositionNote] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isExportingBesoinsPDF, setIsExportingBesoinsPDF] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Réclamation state — étape 1 : arrivage, étape 2 : commande
  const [selectedFactureId, setSelectedFactureId] = useState<string>('');
  const [reclamationArticleId, setReclamationArticleId] = useState<string>('');
  const [reclamationText, setReclamationText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [factureDropdownOpen, setFactureDropdownOpen] = useState(false);
  const [articleDropdownOpen, setArticleDropdownOpen] = useState(false);

  // ── Besoins ──────────────────────────────────────────────────────────
  const toOrderArticles = useMemo(() => {
    const priorityOrder = { 'urgent': 0, 'important': 1, 'todo': 2 };
    return [...articles]
      .filter(o => o.status === 'TO_ORDER')
      .sort((a, b) => {
        const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
        const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
        if (pA !== pB) return pA - pB;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
  }, [articles]);

  // ── Conteneurs Complets : grouper par fournisseur ─────────────────────
  const containerGroups = useMemo(() => {
    const fullContainerArts = toOrderArticles.filter(o => o.isFullContainer);
    const map = new Map<string, any[]>();
    fullContainerArts.forEach(o => {
      const key = o.supplierId || 'Sans Fournisseur';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries()).map(([supplier, arts]) => ({ supplier, arts }));
  }, [toOrderArticles]);

  const normalArticles = useMemo(() => toOrderArticles.filter(o => !o.isFullContainer), [toOrderArticles]);
  const [collapsedContainers, setCollapsedContainers] = useState<Set<string>>(new Set());
  const toggleContainer = useCallback((key: string) => {
    setCollapsedContainers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Arrivages (factures) qui ont au moins un article associé ─────────
  const facturesWithArticles = useMemo(() => {
    const factureIds = new Set(articles.filter(a => a.factureId).map(a => a.factureId));
    return factures
      .filter(f => factureIds.has(f.id))
      .sort((a, b) => (b.arrivalDate || '').localeCompare(a.arrivalDate || ''));
  }, [articles, factures]);

  // ── Articles de l'arrivage sélectionnée ─────────────────────────────
  const articlesOfSelectedFacture = useMemo(() => {
    if (!selectedFactureId) return [];
    return articles
      .filter(a => a.factureId === selectedFactureId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [articles, selectedFactureId]);

  // ── Réclamations existantes ──────────────────────────────────────────
  const articlesWithReclamation = useMemo(() => {
    return articles.filter(a => a.reclamation && a.reclamation.trim() !== '');
  }, [articles]);

  // ── Articles sélectionnés pour proposition ───────────────────────────
  const selectedArticles = useMemo(
    () => toOrderArticles.filter(o => selectedIds.has(o.id)),
    [toOrderArticles, selectedIds]
  );

  // ── Helpers ──────────────────────────────────────────────────────────
  const getFactureLabel = (f: any) => {
    const numFacture = f.id ? `Facture ${f.id}` : 'Sans Facture';
    const date = f.arrivalDate ? new Date(f.arrivalDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return `${numFacture}${date ? ' · ' + date : ''}`;
  };

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("ZIPPER") && !c.includes("LONG CHAIN") && !c.includes("SLIDER");
  };

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleActionDelete = (id: string, name: string) => {
    if (!user || !firestore || !id) return;
    if (window.confirm(`Supprimer ce rappel pour "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Rappel supprimé", description: name });
    }
  };

  const handleSubmitReclamation = () => {
    if (!user || !firestore) return;
    if (!selectedFactureId) {
      toast({ title: "Sélectionnez un arrivage", description: "Veuillez choisir l'arrivage concerné.", variant: "destructive" });
      return;
    }
    if (!reclamationArticleId) {
      toast({ title: "Sélectionnez une commande", description: "Veuillez choisir la commande défectueuse.", variant: "destructive" });
      return;
    }
    if (!reclamationText.trim()) {
      toast({ title: "Réclamation vide", description: "Veuillez saisir le texte de la réclamation.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const docRef = doc(firestore, 'users', user.uid, 'articles', reclamationArticleId);
    const facture = factures.find(f => f.id === selectedFactureId);
    updateDocumentNonBlocking(docRef, {
      reclamation: reclamationText.trim(),
      reclamationDate: new Date().toISOString(),
      reclamationStatus: 'open',
      reclamationFactureId: selectedFactureId,
      reclamationFactureLabel: getFactureLabel(facture),
    });

    const article = articlesOfSelectedFacture.find(a => a.id === reclamationArticleId);
    toast({ title: "Réclamation enregistrée", description: `"${article?.name}" — ${getFactureLabel(facture)}` });

    setReclamationText('');
    setReclamationArticleId('');
    setSelectedFactureId('');
    setIsSubmitting(false);
  };

  const handleDeleteReclamation = (articleId: string, articleName: string) => {
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer la réclamation pour "${articleName}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      updateDocumentNonBlocking(docRef, { reclamation: '', reclamationDate: null, reclamationStatus: null, reclamationFactureId: null, reclamationFactureLabel: null });
      toast({ title: "Réclamation supprimée", description: articleName });
    }
  };

  const handleCloseReclamation = (articleId: string, articleName: string) => {
    if (!user || !firestore) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
    updateDocumentNonBlocking(docRef, { reclamationStatus: 'closed' });
    toast({ title: "Réclamation clôturée", description: articleName });
  };

  // ── Ouvrir modal proposition ─────────────────────────────────────────
  const handleOpenProposition = () => {
    // Pré-remplir le fournisseur si tous les articles ont le même supplierId
    const suppliers = [...new Set(selectedArticles.map(a => a.supplierId).filter(Boolean))];
    setPropositionFournisseur(suppliers.length === 1 ? suppliers[0] : '');
    setPropositionNote('');
    setShowPropositionModal(true);
  };

  // ── Generate quantity proposal PDF (no statuses) ─────────────────────
  const handleGenerateProposition = async () => {
    if (selectedArticles.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      await exportPropositionFournisseurPDF(selectedArticles, propositionFournisseur, propositionNote);
      setShowPropositionModal(false);
      clearSelection();
      toast({ title: "PDF generated ✓", description: `Proposal for ${propositionFournisseur || 'supplier'} — ${selectedArticles.length} item(s)` });
    } catch (e) {
      console.error(e);
      toast({ title: "PDF Error", variant: "destructive" });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ── Generate price proposal PDF ───────────────────────────────────────
  const handleGeneratePricePDF = async () => {
    if (selectedArticles.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      await exportPriceProposalPDF(selectedArticles, propositionFournisseur, propositionNote);
      setShowPropositionModal(false);
      clearSelection();
      toast({ title: "Price PDF generated ✓", description: `Price proposal for ${propositionFournisseur || 'supplier'} — ${selectedArticles.length} item(s)` });
    } catch (e) {
      console.error(e);
      toast({ title: "PDF Error", variant: "destructive" });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ── Firebase Storage image loader (bypasses CORS via SDK) ─────────────
  const firebaseImageLoader = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
      const storage = getStorage();
      const ref = storageRef(storage, url);
      const blob = await getBlob(ref);
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // ── Export Besoins PDF ────────────────────────────────────────────────
  const handleExportBesoinsPDF = async () => {
    const toExport = besoinTab === 'mine' ? pureNormalArticles : clientNormalArticles;
    if (toExport.length === 0) return;
    setIsExportingBesoinsPDF(true);
    try {
      await exportBesoinsPDF(toExport, firebaseImageLoader);
      toast({ title: "PDF Besoins généré ✓", description: `${toExport.length} article(s) exporté(s)` });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur PDF", variant: "destructive" });
    } finally {
      setIsExportingBesoinsPDF(false);
    }
  };

  const selectedReclamationArticle = articlesOfSelectedFacture.find(a => a.id === reclamationArticleId);
  const selectedFacture = factures.find(f => f.id === selectedFactureId);

  const urgentCount = toOrderArticles.filter(a => (a.priority || 'todo') === 'urgent').length;
  const importantCount = toOrderArticles.filter(a => (a.priority || 'todo') === 'important').length;
  const todoCount = toOrderArticles.filter(a => (a.priority || 'todo') === 'todo').length;
  const openReclamations = articlesWithReclamation.filter(a => a.reclamationStatus !== 'closed').length;

  // ── Composant case à cocher article ─────────────────────────────────
  const ArticleCheckbox = ({ id }: { id: string }) => {
    const checked = selectedIds.has(id);
    return (
      <button
        type="button"
        onClick={e => { e.stopPropagation(); toggleSelect(id); }}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
          checked
            ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/30'
            : 'border-stone-300 hover:border-amber-400 bg-white'
        }`}
        title={checked ? 'Désélectionner' : 'Sélectionner pour proposition'}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
    );
  };

  // ── Separate client articles from normal in kanban ──
  const clientNormalArticles = useMemo(() => normalArticles.filter(o => o.isPreorder && o.clientName), [normalArticles]);
  const pureNormalArticles   = useMemo(() => normalArticles.filter(o => !(o.isPreorder && o.clientName)), [normalArticles]);

  // ── Onglet actif dans la section Besoins ────────────────────────────
  const [besoinTab, setBesoinTab] = useState<'mine' | 'clients'>('mine');
  const activeBesoinArticles = besoinTab === 'mine' ? pureNormalArticles : clientNormalArticles;
  return (
    <div className="space-y-8 fade-in">

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STICKY TOP BAR — Supplier Proposal (replaces fixed bottom bar)  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-40 animate-in slide-in-from-top-2 duration-300 -mx-0">
          <div className="bg-stone-900 border-b border-white/10 shadow-2xl px-5 py-3 flex items-center gap-4">
            {/* Icon + counter */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none">
                  {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
                </p>
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                  {selectedArticles.map(a => a.name || a.categoryId).join(' · ').slice(0, 60)}{selectedIds.size > 3 ? '…' : ''}
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={clearSelection}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white flex items-center justify-center transition-all"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenProposition}
                className="flex items-center gap-2 h-9 px-4 bg-amber-500 hover:bg-amber-400 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/30 active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                Propose to Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header premium ─── */}
      <header className="bg-stone-900 rounded-[2rem] shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
        <div className="relative z-10 p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Logistique — Gestion</p>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
              Besoins &<br /><span className="text-amber-500">Réclamations</span>
            </h2>
            <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3">Articles en attente · Incidents qualité</p>
            {pureNormalArticles.length > 0 && (
              <button
                type="button"
                onClick={handleExportBesoinsPDF}
                disabled={isExportingBesoinsPDF}
                className="mt-4 flex items-center gap-2 h-9 px-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-900 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95"
              >
                <FileText className="w-4 h-4" />
                {isExportingBesoinsPDF ? 'Génération...' : 'Exporter PDF Mes Commandes'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:w-auto w-full">
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Urgent</p>
              <div className="text-2xl font-black text-red-400">{urgentCount}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Important</p>
              <div className="text-2xl font-black text-amber-400">{importantCount}</div>
            </div>
            <div className="bg-stone-700/50 border border-stone-600/30 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">À Faire</p>
              <div className="text-2xl font-black text-stone-300">{todoCount}</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Réclamations</p>
              <div className="text-2xl font-black text-orange-400">{openReclamations}</div>
            </div>
          </div>
        </div>
      </header>


      {/* ─── Conteneurs Complets ─── */}
      {containerGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-xl border border-orange-200">
              <Container className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.25em]">Commandes en production</p>
              <p className="text-lg font-black text-stone-900 uppercase tracking-tight leading-none">Conteneurs <span className="text-orange-500">Complets</span></p>
            </div>
            <span className="ml-auto text-[9px] font-black bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1 rounded-full uppercase tracking-widest">
              {containerGroups.length} groupe{containerGroups.length > 1 ? 's' : ''} · {containerGroups.reduce((s, g) => s + g.arts.length, 0)} article{containerGroups.reduce((s, g) => s + g.arts.length, 0) > 1 ? 's' : ''}
            </span>
          </div>

          {containerGroups.map(({ supplier, arts }) => {
            const collapsed = collapsedContainers.has(supplier);
            return (
              <div key={supplier} className="rounded-2xl border-2 border-orange-200 bg-orange-50/40 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleContainer(supplier)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 bg-orange-100/60 hover:bg-orange-100 transition-colors text-left"
                >
                  <Container className="w-4 h-4 text-orange-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-orange-800 uppercase tracking-widest truncate">{supplier}</p>
                    <p className="text-[9px] font-bold text-orange-500 uppercase">{arts.length} commande{arts.length > 1 ? 's' : ''} · Conteneur complet (PI)</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-orange-500 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`} />
                </button>

                {!collapsed && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {arts.map(o => {
                      const isZipper = isZipperCategory(o.categoryId);
                      const priorityConf = {
                        urgent: { dot: 'bg-red-500', label: 'Urgent', badge: 'bg-red-100 text-red-700', borderLeft: 'border-l-red-400' },
                        important: { dot: 'bg-amber-400', label: 'Important', badge: 'bg-amber-100 text-amber-700', borderLeft: 'border-l-amber-400' },
                        todo: { dot: 'bg-stone-400', label: 'À faire', badge: 'bg-stone-100 text-stone-500', borderLeft: 'border-l-stone-300' },
                      }[o.priority || 'todo'] || { dot: 'bg-stone-400', label: 'À faire', badge: 'bg-stone-100 text-stone-500', borderLeft: 'border-l-stone-300' };
                      const isSelected = selectedIds.has(o.id);
                      return (
                        <div key={o.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all p-4 space-y-2.5 border-l-4 ${priorityConf.borderLeft} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <ArticleCheckbox id={o.id} />
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-stone-900 text-[11px] uppercase leading-tight truncate">{o.name}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase ${priorityConf.badge}`}>
                                  <span className={`inline-block w-1 h-1 rounded-full ${priorityConf.dot} mr-1`} />
                                  {priorityConf.label}
                                </span>
                                {o.isPreorder && o.clientName && (
                                  <span className="text-[7px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase">{o.clientName}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-black text-stone-900 whitespace-nowrap shrink-0">
                              {Number(o.quantity).toLocaleString()} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {o.size && <span className="text-[8px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.size}</span>}
                            {o.color && <span className="text-[8px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.color}</span>}
                            {isZipper && o.zipperType && <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded uppercase">{o.zipperType} {o.slider || ''}</span>}
                            {!isZipper && o.specs && <span className="text-[8px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded">{o.specs}</span>}
                          </div>
                          <div className="flex items-center justify-end gap-1 pt-2 border-t border-stone-50">
                            {o.clientName && <ExportClientCommande article={o} />}
                            <ExportBonCommande article={o} supplierProfile={supplierProfileMap[o.supplierId] || undefined} />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => onEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleActionDelete(o.id, o.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" onClick={() => { setSelectedArticle(o); setIsLaunchModalOpen(true); }} className="bg-orange-600 hover:bg-orange-700 text-white font-black uppercase text-[8px] tracking-widest px-3 h-7 rounded-lg ml-1 gap-1">
                              Commander <ArrowRight className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Besoins Kanban ─── */}
      {normalArticles.length === 0 && containerGroups.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-20 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            Aucun besoin identifié pour le moment.
          </CardContent>
        </Card>
      ) : normalArticles.length > 0 && (
        <div className="space-y-8">


          {/* ── Standard Orders — avec onglets Mes Commandes / Clients ── */}
          {(pureNormalArticles.length > 0 || clientNormalArticles.length > 0) && (
            <div className="space-y-4">

              {/* Tab Bar */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBesoinTab('mine')}
                  className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all duration-200 ${
                    besoinTab === 'mine'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-200'
                      : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <Package className="w-4 h-4 shrink-0" />
                  Mes Commandes
                  <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black ${
                    besoinTab === 'mine' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {pureNormalArticles.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBesoinTab('clients')}
                  className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all duration-200 ${
                    besoinTab === 'clients'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200'
                      : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <UserCircle2 className="w-4 h-4 shrink-0" />
                  Commandes Clients
                  <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black ${
                    besoinTab === 'clients' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {clientNormalArticles.length}
                  </span>
                </button>
              </div>

              {/* Section header with export button */}
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${
                  besoinTab === 'mine' ? 'bg-stone-100 border-stone-200' : 'bg-indigo-50 border-indigo-200'
                }`}>
                  <ListTodo className={`w-4 h-4 ${besoinTab === 'mine' ? 'text-stone-600' : 'text-indigo-600'}`} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.25em]">
                    {besoinTab === 'mine' ? 'Mes Commandes' : 'Commandes Clients'}
                  </p>
                  <p className="text-lg font-black text-stone-900 uppercase tracking-tight leading-none">
                    {besoinTab === 'mine'
                      ? <>Général <span className="text-amber-500">Besoins</span></>
                      : <>Précommandes <span className="text-indigo-500">Clients</span></>
                    }
                  </p>
                </div>
                <span className="ml-auto text-[9px] font-black bg-stone-100 text-stone-700 border border-stone-200 px-3 py-1 rounded-full uppercase tracking-widest">
                  {activeBesoinArticles.length} article{activeBesoinArticles.length > 1 ? 's' : ''}
                </span>
                {activeBesoinArticles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportBesoinsPDF}
                    disabled={isExportingBesoinsPDF}
                    className="flex items-center gap-1.5 h-8 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-200 active:scale-95"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {isExportingBesoinsPDF ? 'Export...' : 'Export PDF'}
                  </button>
                )}
              </div>

              {activeBesoinArticles.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-stone-200 py-16 text-center text-stone-300 text-[10px] font-black uppercase tracking-widest">
                  {besoinTab === 'mine' ? 'Aucune commande personnelle.' : 'Aucune commande client.'}
                </div>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {([
                  { prio: 'urgent',    label: 'Urgent',    dotColor: 'bg-red-500',   borderColor: 'border-red-200',   borderLeft: 'border-l-red-400',   bgColor: 'bg-red-50',   textColor: 'text-red-700',   badgeCls: 'bg-red-500 text-white' },
                  { prio: 'important', label: 'Important', dotColor: 'bg-amber-400', borderColor: 'border-amber-200', borderLeft: 'border-l-amber-400', bgColor: 'bg-amber-50', textColor: 'text-amber-700', badgeCls: 'bg-amber-400 text-white' },
                  { prio: 'todo',      label: 'To Do',     dotColor: 'bg-stone-400', borderColor: 'border-stone-200', borderLeft: 'border-l-stone-300', bgColor: 'bg-stone-50', textColor: 'text-stone-600', badgeCls: 'bg-stone-100 text-stone-500 border border-stone-200' },
                ] as const).map(col => {
                  const colArts = activeBesoinArticles.filter(o => (o.priority || 'todo') === col.prio);
                  return (
                    <div key={col.prio} className="space-y-3">
                      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${col.bgColor} border ${col.borderColor}`}>
                        <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${col.textColor}`}>{col.label}</span>
                        <span className={`ml-auto text-[9px] font-black px-2 py-0.5 rounded-full ${col.badgeCls}`}>{colArts.length}</span>
                      </div>
                      {colArts.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-stone-200 py-8 text-center text-stone-300 text-[9px] font-black uppercase tracking-widest">Empty</div>
                      ) : colArts.map(o => {
                        const isZipper = isZipperCategory(o.categoryId);
                        const isSelected = selectedIds.has(o.id);
                        return (
                          <div key={o.id} className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 space-y-3 border-l-4 ${col.borderLeft} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <ArticleCheckbox id={o.id} />
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-stone-900 text-[12px] uppercase leading-tight">{o.name}</p>
                              </div>
                              <span className="text-[10px] font-black text-stone-900 whitespace-nowrap shrink-0">
                                {Number(o.quantity).toLocaleString()} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span>
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {o.size && <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-lg uppercase">{o.size}</span>}
                              {o.color && <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-lg uppercase">{o.color}</span>}
                              {isZipper && o.zipperType && <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg uppercase">{o.zipperType} {o.slider || ''}</span>}
                              {!isZipper && o.specs && <span className="text-[9px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-lg">{o.specs}</span>}
                            </div>
                            <div className="flex items-center justify-end gap-1 pt-2 border-t border-stone-50">
                              {o.clientName && <ExportClientCommande article={o} />}
                              <ExportBonCommande article={o} supplierProfile={supplierProfileMap[o.supplierId] || undefined} />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => onEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleActionDelete(o.id, o.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" onClick={() => { setSelectedArticle(o); setIsLaunchModalOpen(true); }} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[8px] tracking-widest px-3 h-7 rounded-lg ml-1 gap-1">
                                Order <ArrowRight className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Réclamations Section ─── */}
      <div className="space-y-6">

        {/* Section Header */}
        <div className="bg-stone-900 rounded-[2rem] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-1">Qualité · Suivi</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <MessageSquareWarning className="w-6 h-6 text-orange-500" />
              Réclamations
            </h2>
            <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-1">
              Sélectionnez l&apos;arrivage puis la commande défectueuse.
            </p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 px-5 py-3 rounded-2xl relative z-10 text-center">
            <div className="text-[8px] text-orange-400 font-black uppercase tracking-widest mb-0.5">En cours</div>
            <div className="text-2xl font-black text-orange-400">
              {openReclamations}
            </div>
          </div>
        </div>

        {/* ── Formulaire nouvelle réclamation ── */}
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4">
            <h3 className="text-white font-black uppercase tracking-widest text-[11px] flex items-center gap-2">
              <MessageSquareWarning className="w-4 h-4" />
              Nouvelle Réclamation
            </h3>
          </div>
          <CardContent className="p-6 space-y-6">

            {/* Breadcrumb étapes */}
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className={`px-3 py-1 rounded-full ${selectedFactureId ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-400'}`}>
                1. Arrivage
              </span>
              <ChevronRight className="w-3 h-3 text-stone-300" />
              <span className={`px-3 py-1 rounded-full ${reclamationArticleId ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-400'}`}>
                2. Commande
              </span>
              <ChevronRight className="w-3 h-3 text-stone-300" />
              <span className={`px-3 py-1 rounded-full ${reclamationText.trim() ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-400'}`}>
                3. Réclamation
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── Étape 1 : Arrivage ── */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                  <Anchor className="w-3 h-3" /> Arrivage *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setFactureDropdownOpen(p => !p); setArticleDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left text-xs font-bold transition-all
                      ${selectedFactureId ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300'}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Anchor className="w-3.5 h-3.5 flex-shrink-0" />
                      {selectedFacture ? getFactureLabel(selectedFacture) : 'Sélectionner un arrivage…'}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${factureDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {selectedFacture?.noBL && (
                    <div className="mt-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-2">
                      <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">N° BL :</span>
                      <span className="text-[10px] font-black text-indigo-700 uppercase">{selectedFacture.noBL}</span>
                    </div>
                  )}

                  {factureDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {facturesWithArticles.length === 0 ? (
                        <div className="p-4 text-center text-stone-400 text-xs font-bold">Aucun arrivage avec commandes</div>
                      ) : (
                        facturesWithArticles.map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setSelectedFactureId(f.id);
                              setReclamationArticleId('');
                              setFactureDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-orange-50 hover:text-orange-700 transition-colors flex items-center gap-2 border-b border-stone-50 last:border-0
                              ${selectedFactureId === f.id ? 'bg-orange-50 text-orange-700' : 'text-stone-700'}`}
                          >
                            <Anchor className="w-3 h-3 flex-shrink-0 text-stone-400" />
                            <div>
                              <div className="uppercase">{f.id ? `Facture ${f.id}` : 'Sans Facture'}</div>
                              {f.noBL && <div className="text-[10px] text-indigo-500 font-bold uppercase">BL: {f.noBL}</div>}
                              {f.arrivalDate && (
                                <div className="text-[10px] text-stone-400 font-normal">
                                  Arrivée : {new Date(f.arrivalDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Étape 2 : Commande ── */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Commande Défectueuse *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    disabled={!selectedFactureId}
                    onClick={() => { setArticleDropdownOpen(p => !p); setFactureDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left text-xs font-bold transition-all
                      ${!selectedFactureId ? 'border-stone-100 bg-stone-50/50 text-stone-300 cursor-not-allowed' :
                        reclamationArticleId ? 'border-orange-400 bg-orange-50 text-orange-800' :
                        'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300'}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Package className="w-3.5 h-3.5 flex-shrink-0" />
                      {selectedReclamationArticle ? (
                        <span className="uppercase">{selectedReclamationArticle.name}{selectedReclamationArticle.color ? ` — ${selectedReclamationArticle.color}` : ''}</span>
                      ) : (
                        selectedFactureId ? 'Sélectionner une commande…' : 'Choisir un arrivage d\'abord'
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${articleDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {articleDropdownOpen && selectedFactureId && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {articlesOfSelectedFacture.length === 0 ? (
                        <div className="p-4 text-center text-stone-400 text-xs font-bold">Aucune commande pour cet arrivage</div>
                      ) : (
                        articlesOfSelectedFacture.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => { setReclamationArticleId(a.id); setArticleDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-orange-50 hover:text-orange-700 transition-colors flex items-center gap-2 border-b border-stone-50 last:border-0
                              ${reclamationArticleId === a.id ? 'bg-orange-50 text-orange-700' : 'text-stone-700'}`}
                          >
                            <Package className="w-3 h-3 flex-shrink-0 text-stone-400" />
                            <div>
                              <div className="uppercase">{a.name}</div>
                              <div className="text-[10px] text-stone-400 font-normal">
                                {[a.color, a.size].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Étape 3 : Texte réclamation ── */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                  <MessageSquareWarning className="w-3 h-3" /> Description *
                </label>
                <Textarea
                  value={reclamationText}
                  onChange={e => setReclamationText(e.target.value)}
                  disabled={!reclamationArticleId}
                  placeholder={reclamationArticleId ? "Décrivez le problème constaté…" : "Sélectionnez d'abord une commande"}
                  rows={4}
                  className="resize-none rounded-xl border-2 border-stone-200 focus:border-orange-400 focus:ring-0 text-sm font-medium text-stone-800 placeholder:text-stone-300 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSubmitReclamation}
                disabled={isSubmitting || !selectedFactureId || !reclamationArticleId || !reclamationText.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-[10px] tracking-widest px-6 h-10 rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                Soumettre la Réclamation
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Réclamations existantes ── */}
        {articlesWithReclamation.length > 0 && (
          <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-6 py-4">
              <h3 className="text-stone-700 font-black uppercase tracking-widest text-[11px] flex items-center gap-2">
                <MessageSquareWarning className="w-4 h-4 text-orange-500" />
                Réclamations Enregistrées
              </h3>
            </div>
            <CardContent className="p-0">
              <div className="divide-y divide-stone-50">
                {articlesWithReclamation.map(a => {
                  const isClosed = a.reclamationStatus === 'closed';
                  const recDate = a.reclamationDate
                    ? new Date(a.reclamationDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                    : null;
                  return (
                    <div key={a.id} className={`p-5 flex flex-col sm:flex-row gap-4 transition-colors ${isClosed ? 'bg-stone-50/60 opacity-60' : 'hover:bg-orange-50/20'}`}>

                      {/* Infos commande + arrivage */}
                      <div className="flex-shrink-0 min-w-[180px] space-y-1">
                        {a.reclamationFactureLabel && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Anchor className="w-3 h-3 text-orange-400 flex-shrink-0" />
                            <span className="text-[10px] font-black text-orange-700 uppercase">{a.reclamationFactureLabel}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                          <span className="font-black text-stone-900 text-xs uppercase">{a.name}</span>
                        </div>
                        {(a.color || a.size) && (
                          <div className="text-[10px] text-stone-400 font-bold uppercase ml-5">
                            {[a.color, a.size].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {recDate && (
                          <div className="flex items-center gap-1 ml-5">
                            <Clock className="w-2.5 h-2.5 text-stone-300" />
                            <span className="text-[9px] text-stone-400 font-bold">{recDate}</span>
                          </div>
                        )}
                        <div className="ml-5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider
                            ${isClosed ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                            {isClosed
                              ? <><CheckCircle2 className="w-2.5 h-2.5" /> Clôturée</>
                              : <><AlertTriangle className="w-2.5 h-2.5" /> Ouverte</>}
                          </span>
                        </div>
                      </div>

                      {/* Texte réclamation */}
                      <div className="flex-1 bg-white rounded-xl border border-stone-100 p-4">
                        <p className="text-sm text-stone-700 font-medium leading-relaxed whitespace-pre-wrap">{a.reclamation}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 items-start flex-shrink-0">
                        {!isClosed && (
                          <Button variant="ghost" size="sm" onClick={() => handleCloseReclamation(a.id, a.name)}
                            className="h-8 px-3 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clôturer
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteReclamation(a.id, a.name)}
                          className="h-8 px-3 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5">
                          <X className="w-3.5 h-3.5" /> Supprimer
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <LaunchOrderModal open={isLaunchModalOpen} onOpenChange={setIsLaunchModalOpen} article={selectedArticle} />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL — Proposition fournisseur                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showPropositionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header modal */}
            <div className="bg-stone-900 px-7 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-xl">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Export PDF</p>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight leading-none">Proposition Fournisseur</h3>
                </div>
              </div>
              <button
                onClick={() => setShowPropositionModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corps modal */}
            <div className="p-7 space-y-5">

              {/* Résumé articles */}
              <div className="bg-stone-50 rounded-2xl border border-stone-100 p-4">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3">
                  {selectedArticles.length} article{selectedArticles.length > 1 ? 's' : ''} inclus dans la proposition
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {selectedArticles.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        a.priority === 'urgent' ? 'bg-red-500' :
                        a.priority === 'important' ? 'bg-amber-400' : 'bg-stone-300'
                      }`} />
                      <span className="text-[11px] font-bold text-stone-700 uppercase">{a.name || a.categoryId}</span>
                      <span className="ml-auto text-[10px] font-black text-stone-500">
                        {Number(a.quantity).toLocaleString()} {a.unitOfMeasure}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Champ fournisseur */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                  Nom du Fournisseur
                </label>
                <input
                  type="text"
                  value={propositionFournisseur}
                  onChange={e => setPropositionFournisseur(e.target.value)}
                  placeholder="Ex : YKK China, Coats Shanghai…"
                  className="w-full bg-stone-50 border-2 border-stone-200 focus:border-amber-400 focus:outline-none text-stone-900 text-sm font-bold rounded-xl px-4 h-11 transition-colors placeholder:text-stone-300"
                />
              </div>

              {/* Champ note */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                  Remarques / Note (optionnel)
                </label>
                <textarea
                  value={propositionNote}
                  onChange={e => setPropositionNote(e.target.value)}
                  placeholder="Ex : Livraison demandée avant le 30 juillet. Incoterm FOB Shanghai."
                  rows={3}
                  className="w-full bg-stone-50 border-2 border-stone-200 focus:border-amber-400 focus:outline-none text-stone-900 text-sm font-medium rounded-xl px-4 py-3 resize-none transition-colors placeholder:text-stone-300"
                />
              </div>

              {/* Boutons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowPropositionModal(false)}
                  className="flex-1 h-11 rounded-xl border-2 border-stone-200 text-stone-500 font-black text-[10px] uppercase tracking-widest hover:bg-stone-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateProposition}
                  disabled={isGeneratingPDF}
                  className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-stone-200 disabled:text-stone-400 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/25 active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  {isGeneratingPDF ? 'Generating…' : 'Proposal PDF (Qty)'}
                </button>
                <button
                  onClick={handleGeneratePricePDF}
                  disabled={isGeneratingPDF}
                  className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-stone-200 disabled:text-stone-400 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  {isGeneratingPDF ? 'Generating…' : 'Price PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
