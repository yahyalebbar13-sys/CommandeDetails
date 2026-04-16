
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ListTodo, Trash2, ArrowRight, Pencil, Settings2, MousePointer2,
  Flame, AlertTriangle, CheckSquare, MessageSquareWarning, Send,
  ChevronDown, Package, X, Clock, CheckCircle2, Anchor, ChevronRight
} from 'lucide-react';
import { useUser, useFirestore, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import LaunchOrderModal from './launch-order-modal';

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

  const selectedFacture = factures.find(f => f.id === selectedFactureId);
  const selectedReclamationArticle = articlesOfSelectedFacture.find(a => a.id === reclamationArticleId);

  return (
    <div className="space-y-8 fade-in">

      {/* ─── Header Besoins ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-stone-800">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 flex items-center gap-2">
            <ListTodo className="w-8 h-8 text-stone-600" />
            Articles À Commander
          </h2>
          <p className="text-stone-600 mt-1">Liste des besoins identifiés en attente de commande officielle.</p>
        </div>
        <div className="bg-stone-50 px-4 py-2 rounded-lg border border-stone-200">
          <div className="text-[10px] text-stone-500 font-black uppercase">Rappels en cours</div>
          <div className="text-2xl font-black text-stone-800">{toOrderArticles.length} Besoins</div>
        </div>
      </div>

      {/* ─── Besoins Table ─── */}
      <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase py-4">Désignation</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Taille</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Couleur</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Technique / Spécifications</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Importance</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Quantité Prévue</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toOrderArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-stone-400 italic font-bold">
                    Aucun besoin identifié pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                toOrderArticles.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  const priorityConfig = o.priority === 'urgent'
                    ? { border: 'border-l-4 border-l-red-500', rowBg: 'hover:bg-red-50/40', badge: 'bg-red-500 text-white shadow-sm shadow-red-200', label: 'Urgent', icon: <Flame className="w-3 h-3" /> }
                    : o.priority === 'important'
                    ? { border: 'border-l-4 border-l-amber-400', rowBg: 'hover:bg-amber-50/40', badge: 'bg-amber-400 text-white shadow-sm shadow-amber-200', label: 'Important', icon: <AlertTriangle className="w-3 h-3" /> }
                    : { border: 'border-l-4 border-l-stone-300', rowBg: 'hover:bg-stone-50', badge: 'bg-stone-100 text-stone-500 border border-stone-200', label: 'À faire', icon: <CheckSquare className="w-3 h-3" /> };
                  return (
                    <TableRow key={o.id} className={`transition-colors border-b border-stone-50 ${priorityConfig.border} ${priorityConfig.rowBg}`}>
                      <TableCell className="py-3">
                        <div className="font-black text-stone-900 text-xs uppercase">{o.name}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-600 uppercase">{o.size || '-'}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-900 uppercase">{o.color || '-'}</span>
                      </TableCell>
                      <TableCell className="text-[10px] py-3">
                        {isZipper ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {o.zipperType || '-'}</span>
                            <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {o.slider || '-'} ({o.sliderType || '-'})</span>
                          </div>
                        ) : (
                          <span className="text-stone-500 font-bold uppercase">{o.specs || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${priorityConfig.badge}`}>
                          {priorityConfig.icon}{priorityConfig.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-black text-xs py-3">
                        {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1 uppercase">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex justify-end items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-xl" onClick={() => onEdit(o)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl" onClick={() => handleActionDelete(o.id, o.name)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" onClick={() => { setSelectedArticle(o); setIsLaunchModalOpen(true); }} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[9px] tracking-widest px-4 h-8 rounded-lg ml-2">
                            Commander <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Réclamations Section ─── */}
      <div className="space-y-6">

        {/* Section Header */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-orange-500">
          <div>
            <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              <MessageSquareWarning className="w-7 h-7 text-orange-500" />
              Réclamations
            </h2>
            <p className="text-stone-500 mt-1 text-sm">
              Sélectionnez l'arrivage puis la commande défectueuse et rédigez votre réclamation.
            </p>
          </div>
          <div className="bg-orange-50 px-4 py-2 rounded-lg border border-orange-100">
            <div className="text-[10px] text-orange-400 font-black uppercase">En cours</div>
            <div className="text-2xl font-black text-orange-600">
              {articlesWithReclamation.filter(a => a.reclamationStatus !== 'closed').length} Réclamation(s)
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
                        {/* Arrivage */}
                        {a.reclamationFactureLabel && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Anchor className="w-3 h-3 text-orange-400 flex-shrink-0" />
                            <span className="text-[10px] font-black text-orange-700 uppercase">{a.reclamationFactureLabel}</span>
                          </div>
                        )}
                        {/* Article */}
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
    </div>
  );
}
