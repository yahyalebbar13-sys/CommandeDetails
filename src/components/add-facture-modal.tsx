"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { FileText, Calendar, Truck, Save, AlertTriangle, Hash, Ship, DollarSign, Building2, Mail, BellOff } from 'lucide-react';
import { STATUS_MAP } from '@/lib/status-utils';
import { aujourdHui, normaliserReference, referenceValide } from '@/lib/suivi-conteneur';
import {
  SOCIETES_DECLARANTES, articlesAPrevenir, notifierClientsDates, ouvrirSuiviEnFond,
  statutPourLesClients, transitaireDeLaSociete,
} from '@/lib/edition-dossier';

interface AddFactureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
  editFacture?: any | null;
  associatedArticles?: any[];
}

export default function AddFactureModal({ open, onOpenChange, editFacture, associatedArticles }: AddFactureModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isProvisional, setIsProvisional] = useState(false);

  const generateProvisionalId = () => {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CTR-${ym}-${rand}`;
  };

  const [formData, setFormData] = useState<any>({
    id: '',
    noBL: '',
    arrivalDate: '',
    stockEntryDate: '',
    shippingDate: '',
    shippingLine: '',
    supplierId: '',
    declaringCompany: '',
    forwarder: '',
    forwarderGivenDate: '',
    freightCost: 0,
    declaredValue: 0,
    invoicePaidDhs: 0,
    exchangeInvoiceAmount: 0,
    supplierInvoiceAmount: 0,
    additionalCostsAmount: 0
  });

  useEffect(() => {
    if (editFacture) {
      setFormData({
        id: editFacture.id || '',
        noBL: editFacture.noBL || '',
        // Date du jour à Casablanca : la même que celle qui décide si le conteneur est arrivé.
        arrivalDate: editFacture.arrivalDate || aujourdHui(),
        stockEntryDate: editFacture.stockEntryDate || '',
        shippingDate: editFacture.shippingDate || '',
        shippingLine: editFacture.shippingLine || '',
        supplierId: editFacture.supplierId || editFacture.supplier || '',
        declaringCompany: editFacture.declaringCompany || '',
        forwarder: editFacture.forwarder || '',
        forwarderGivenDate: editFacture.forwarderGivenDate || '',
        freightCost: Number(editFacture.freightCost) || Number(editFacture.freight) || 0,
        declaredValue: Number(editFacture.declaredValue) || 0,
        invoicePaidDhs: Number(editFacture.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(editFacture.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(editFacture.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(editFacture.additionalCostsAmount) || 0
      });
    } else {
      const provisional = editFacture?.id?.startsWith('CTR-') || false;
      setIsProvisional(provisional);
      setFormData({
        id: '',
        noBL: '',
        arrivalDate: aujourdHui(),
        stockEntryDate: '',
        shippingDate: '',
        shippingLine: '',
        supplierId: '',
        declaringCompany: '',
        forwarder: '',
        forwarderGivenDate: '',
        freightCost: 0,
        declaredValue: 0,
        invoicePaidDhs: 0,
        exchangeInvoiceAmount: 0,
        supplierInvoiceAmount: 0,
        additionalCostsAmount: 0
      });
    }
  }, [editFacture, open]);

  // Clients dont le statut change avec les dates saisies : on demande avant de
  // leur écrire (deux boutons en bas de la fenêtre), jamais d'office.
  const aPrevenirSaisie = editFacture
    ? articlesAPrevenir(
        associatedArticles || [],
        { arrivalDate: editFacture.arrivalDate || null, stockEntryDate: editFacture.stockEntryDate || null },
        { arrivalDate: formData.arrivalDate || null, stockEntryDate: formData.stockEntryDate || null },
      )
    : [];

  // Entrée dans un champ : enregistre seulement quand il n'y a pas de choix à faire.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (aPrevenirSaisie.length > 0) return;
    enregistrer(false);
  };

  const enregistrer = (prevenir: boolean) => {
    if (!user || !firestore || !formData.id) return;

    // Capture these BEFORE closing the modal — closing triggers re-render
    // which can cause editFacture / associatedArticles props to change
    const capturedEditFacture = editFacture;
    const capturedArticles = associatedArticles ? [...associatedArticles] : [];
    
    onOpenChange(false);

    const factureId = formData.id.toUpperCase().trim();
    const facturesRef = collection(firestore, 'users', user.uid, 'factures');
    const docRef = doc(facturesRef, factureId);
    
    // Horodate le MOMENT où la date d'entrée en stock est saisie (≠ la date saisie elle-même) :
    // le panneau "Arrivages Récents" de /stock liste les dossiers saisis depuis moins de 7 jours,
    // même quand la date d'entrée renseignée est plus ancienne.
    const stockEntryDateJustSet = Boolean(formData.stockEntryDate)
      && formData.stockEntryDate !== (capturedEditFacture?.stockEntryDate || '');

    // Dates avant / après : quand le statut que voient les clients change, le
    // dossier le retient, qu'ils soient prévenus ou non — sans quoi le bandeau
    // de /gestion reproposerait le même changement au prochain chargement.
    const datesAvant = { arrivalDate: capturedEditFacture?.arrivalDate || null, stockEntryDate: capturedEditFacture?.stockEntryDate || null };
    const datesApres = { arrivalDate: formData.arrivalDate || null, stockEntryDate: formData.stockEntryDate || null };
    const aPrevenir = capturedEditFacture ? articlesAPrevenir(capturedArticles, datesAvant, datesApres) : [];

    const factureData: any = {
      ...formData,
      id: factureId,
      noBL: formData.noBL.toUpperCase().trim(),
      shippingLine: formData.shippingLine.toUpperCase().trim(),
      forwarder: formData.forwarder,
      updatedAt: serverTimestamp()
    };
    if (stockEntryDateJustSet) {
      factureData.stockEntryDateSetAt = serverTimestamp();
    }
    if (aPrevenir.length > 0) {
      factureData.lastNotifiedStatus = statutPourLesClients(datesApres);
    }

    setDocumentNonBlocking(docRef, factureData, { merge: true });

    // ─── Suivi maritime, sans rien demander ──────────────────────────────────
    // Le n° de BL est déjà là : il n'y a aucune raison de le ressaisir ailleurs.
    // On n'ouvre un suivi (1 crédit) que sur une vraie nouveauté — dossier neuf,
    // ou connaissement changé — et jamais sur un arrivage déjà réceptionné.
    const blPrecedent = (capturedEditFacture?.noBL || '').toUpperCase().trim();
    const blActuel = normaliserReference(factureData.noBL || '');
    const dejaSuivi = Boolean(capturedEditFacture?.suivi?.shipmentId);
    const blChange = Boolean(blActuel) && blActuel !== normaliserReference(blPrecedent);
    // Le serveur écarte lui-même les dossiers en stock ou déjà arrivés (réponse
    // « verrouille » / « deja-arrive », sans toast) : la décision de dépenser un
    // crédit tient à un seul endroit, qui lit le dossier tel qu'il est enregistré.
    if (blActuel && referenceValide(blActuel) && (blChange || !dejaSuivi)) {
      ouvrirSuiviEnFond(factureId, blActuel, toast);
    }

    // ─── DEBUG ───────────────────────────────────────────────────────────────
    console.log('[Facture:save] capturedEditFacture:', capturedEditFacture?.id, 
      '| old arrivalDate:', capturedEditFacture?.arrivalDate, 
      '| new arrivalDate:', formData.arrivalDate,
      '| old stockEntryDate:', capturedEditFacture?.stockEntryDate,
      '| new stockEntryDate:', formData.stockEntryDate,
      '| capturedArticles count:', capturedArticles.length);
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Dates changées : les clients sont prévenus si leur statut change ───────
    if (prevenir && capturedEditFacture && (formData.arrivalDate !== capturedEditFacture.arrivalDate || formData.stockEntryDate !== capturedEditFacture.stockEntryDate) && capturedArticles.length > 0) {
      const notifCount = notifierClientsDates({
        firestore,
        adminUid: user.uid,
        articles: capturedArticles,
        avant: datesAvant,
        apres: datesApres,
        noBL: formData.noBL,
      });
      const skippedNoClient = capturedArticles.filter(a => !(a.clientName || '').trim()).length;

      console.log(`[Facture] Résumé: ${notifCount} emails lancés, ${skippedNoClient}/${capturedArticles.length} articles sans clientName`);

      toast({
        title: 'Dossier enregistré',
        description: skippedNoClient === capturedArticles.length
          ? `⚠️ Aucun email — les articles n'ont pas de "Nom client" défini (activer Précommande dans Modifier article)`
          : `${capturedArticles.length} articles liés${notifCount > 0 ? ` — ${notifCount} notification${notifCount > 1 ? 's' : ''} envoyée${notifCount > 1 ? 's' : ''}` : ''}.`,
      });
    } else {
      console.log(`[Facture:save] Pas de notification:`, {
        hasEditFacture: !!capturedEditFacture,
        arrivalDateChanged: formData.arrivalDate !== capturedEditFacture?.arrivalDate,
        stockEntryDateChanged: formData.stockEntryDate !== capturedEditFacture?.stockEntryDate,
        articlesCount: capturedArticles.length,
      });
      toast({
        title: editFacture?.isOrphaned ? 'Dossier régularisé' : 'Facture enregistrée',
        description: aPrevenir.length > 0
          ? `Référence ${factureId} — clients non prévenus.`
          : `Référence ${factureId} activée.`,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-stone-200 overflow-hidden p-0 rounded-2xl">
        <div className="bg-stone-900 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/10 rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none">
              {editFacture?.isOrphaned ? 'Régulariser Arrivage' : (editFacture ? 'Modifier Dossier' : 'Nouveau Dossier')}
            </DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Configuration transport et douane</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Toggle Conteneur Provisoire — only for new dossiers */}
          {!editFacture && (
            <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isProvisional ? 'bg-orange-50 border-orange-200' : 'bg-stone-50 border-stone-200'}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-700">Conteneur Complet Sans Facture</p>
                <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">Génère un ID provisoire (CTR-XXXXXX)</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isProvisional;
                  setIsProvisional(next);
                  if (next) setFormData((p: any) => ({ ...p, id: generateProvisionalId(), noBL: '' }));
                  else setFormData((p: any) => ({ ...p, id: '', noBL: '' }));
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isProvisional ? 'bg-orange-500' : 'bg-stone-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isProvisional ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">N° FACTURE / CONTENEUR</Label>
              {isProvisional ? (
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly
                    value={formData.id}
                    className="uppercase font-black border-orange-200 h-11 rounded-xl bg-orange-50 text-orange-700 flex-1" 
                  />
                  <span className="text-[8px] font-black text-orange-600 bg-orange-100 border border-orange-200 px-2 py-1 rounded-lg uppercase whitespace-nowrap">Provisoire</span>
                </div>
              ) : (
                <Input 
                  value={formData.id}
                  onChange={e => setFormData((prev: any) => ({ ...prev, id: e.target.value }))}
                  required 
                  disabled={!!editFacture && !editFacture.isOrphaned}
                  className="uppercase font-black border-stone-200 h-11 rounded-xl focus:ring-stone-900" 
                  placeholder="EX: 26HD1004"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Hash className="w-3 h-3" /> N° BL
              </Label>
              <Input 
                value={formData.noBL}
                onChange={e => setFormData((prev: any) => ({ ...prev, noBL: e.target.value }))}
                disabled={isProvisional}
                className={`uppercase font-black border-stone-200 h-11 rounded-xl focus:ring-stone-900 ${isProvisional ? 'opacity-50' : ''}`}
                placeholder={isProvisional ? 'Non disponible (provisoire)' : 'EX: COSU63...'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">FOURNISSEUR</Label>
              <Input 
                value={formData.supplierId}
                onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value.toUpperCase() }))}
                placeholder="EX: MH, JIMMY..."
                className="font-bold border-stone-200 h-11 rounded-xl uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Building2 className="w-3 h-3" /> SOCIÉTÉ DÉCLARANTE
              </Label>
              <Select 
                value={formData.declaringCompany} 
                onValueChange={v => {
                  const inferredForwarder = transitaireDeLaSociete(v) ?? formData.forwarder;
                  setFormData((prev: any) => ({ ...prev, declaringCompany: v, forwarder: inferredForwarder }));
                }}
              >
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir la société..." />
                </SelectTrigger>
                <SelectContent>
                  {SOCIETES_DECLARANTES.map(company => (
                    <SelectItem key={company} value={company} className="font-bold">{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ship className="w-3 h-3" /> COMPAGNIE MARITIME
              </Label>
              <Input 
                value={formData.shippingLine}
                onChange={e => setFormData((prev: any) => ({ ...prev, shippingLine: e.target.value }))}
                placeholder="EX: MSC, MAERSK..."
                className="font-bold border-stone-200 h-11 rounded-xl uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE D'EXPÉDITION (ETD)
              </Label>
              <Input 
                type="date"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.shippingDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, shippingDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE D'ARRIVÉE (ETA - PORT)
              </Label>
              <Input 
                type="date"
                required
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.arrivalDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE D'ENTRÉE EN STOCK
              </Label>
              <Input 
                type="date"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.stockEntryDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, stockEntryDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> FRAIS DE FRET ($)
              </Label>
              <Input 
                type="number"
                step="0.01"
                className="border-stone-200 h-11 font-black text-stone-900 rounded-xl"
                value={formData.freightCost}
                onChange={e => setFormData((prev: any) => ({ ...prev, freightCost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> TRANSITAIRE
              </Label>
              <Input 
                value={formData.forwarder}
                onChange={e => setFormData((prev: any) => ({ ...prev, forwarder: e.target.value.toUpperCase() }))}
                placeholder="EX: NOUH TRANSIT..."
                className="font-bold border-stone-200 h-11 rounded-xl uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE REMISE DOSSIER
              </Label>
              <Input 
                type="date"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.forwarderGivenDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, forwarderGivenDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> VALEUR DÉCLARÉE EN DOUANE ($)
              </Label>
              <Input 
                type="number"
                step="0.01"
                className="border-stone-200 h-11 font-black text-amber-600 rounded-xl"
                value={formData.declaredValue}
                onChange={e => setFormData((prev: any) => ({ ...prev, declaredValue: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> TOTAL DROITS PAYÉS (MAD)
              </Label>
              <div className="h-11 rounded-xl border border-red-200 bg-red-50 flex items-center px-3 gap-2">
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest flex-1">
                  Calculé automatiquement
                </span>
                <span className="text-[8px] font-black text-red-300 uppercase">
                  ΣDI + TPI + TVA (articles)
                </span>
              </div>
            </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-100">
            <div className="space-y-1.5 focus-within:text-emerald-600">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> FACTURE PAYÉE (MAD)
              </Label>
              <Input 
                type="number" step="0.01"
                className="border-stone-200 h-11 font-black text-emerald-600 rounded-xl"
                value={formData.invoicePaidDhs || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, invoicePaidDhs: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00 MAD"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> FACTURE D'ÉCHANGE (MAD)
              </Label>
              <Input 
                type="number" step="0.01"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.exchangeInvoiceAmount || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, exchangeInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00 MAD"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> FACTURE TRANSITAIRE (MAD)
              </Label>
              <Input 
                type="number" step="0.01"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.supplierInvoiceAmount || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, supplierInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00 MAD"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> FRAIS SUPP (MAD)
              </Label>
              <Input 
                type="number" step="0.01"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.additionalCostsAmount || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, additionalCostsAmount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00 MAD"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> TAUX DE CHANGE (MAD/$)
              </Label>
              <div className="relative">
                <Input
                  readOnly
                  className="border-stone-200 h-11 font-black text-blue-600 rounded-xl bg-blue-50 cursor-default"
                  value={
                    formData.declaredValue > 0
                      ? (formData.invoicePaidDhs / formData.declaredValue).toFixed(4)
                      : '—'
                  }
                  placeholder="Calculé automatiquement"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-blue-400 uppercase tracking-widest">
                  FACTURE PAYÉE ÷ VALEUR DOUANE
                </span>
              </div>
            </div>
          </div></div>
          
          {associatedArticles && associatedArticles.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-tight">Propagation Automatique</p>
                <p className="text-[9px] font-bold text-amber-600 uppercase leading-tight mt-0.5">
                  La modification des dates impactera {associatedArticles.length} articles déjà liés.
                </p>
              </div>
            </div>
          )}
        </form>

        {aPrevenirSaisie.length > 0 && editFacture && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-900">
            Pour les clients, le dossier passe de{' '}
            <strong>{STATUS_MAP[statutPourLesClients(editFacture)].label}</strong> à{' '}
            <strong>{STATUS_MAP[statutPourLesClients({ arrivalDate: formData.arrivalDate, stockEntryDate: formData.stockEntryDate })].label}</strong>.
            {' '}À prévenir : <strong>{[...new Set(aPrevenirSaisie.map(a => String(a.clientName).trim()))].join(', ')}</strong>.
          </div>
        )}

        <DialogFooter className="p-6 bg-stone-50 border-t border-stone-100 flex flex-row gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 text-[10px] font-black uppercase tracking-widest h-11">Annuler</Button>
          {aPrevenirSaisie.length > 0 ? (
            <>
              <Button variant="outline" onClick={() => enregistrer(false)} className="flex-1 border-stone-200 font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2">
                <BellOff className="w-4 h-4" /> Sans prévenir
              </Button>
              <Button onClick={() => enregistrer(true)} className="flex-[2] bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-stone-200">
                <Mail className="w-4 h-4" /> Enregistrer et prévenir ({aPrevenirSaisie.length})
              </Button>
            </>
          ) : (
            <Button onClick={() => enregistrer(false)} className="flex-[2] bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-stone-200">
              <Save className="w-4 h-4" /> Enregistrer le dossier
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
