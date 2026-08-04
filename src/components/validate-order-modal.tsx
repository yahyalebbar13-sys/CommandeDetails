
"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { sendStatusNotification } from '@/lib/send-status-notification';
import { Ship, CalendarDays, CheckCircle2, Loader2, Scissors, Package } from 'lucide-react';

interface ValidateOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  factures: any[];
}

export default function ValidateOrderModal({ open, onOpenChange, order, factures }: ValidateOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    factureId: '',
    arrivalDate: ''
  });
  const [autofillVisible, setAutofillVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Split state
  const [splitMode, setSplitMode] = useState(false);
  const [splitColorQtys, setSplitColorQtys] = useState<Record<string, number>>({});
  const [splitQty, setSplitQty] = useState<number>(0);

  useEffect(() => {
    if (open) {
      setFormData({ factureId: '', arrivalDate: '' });
      setAutofillVisible(false);
      setSplitMode(false);
      setSplitColorQtys({});
      setSplitQty(0);
    }
  }, [open]);

  const handleFactureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData(prev => ({ ...prev, factureId: val }));
    
    const knownFacture = factures.find(f => f.id === val);
    if (knownFacture) {
      setFormData(prev => ({ ...prev, arrivalDate: knownFacture.arrivalDate }));
      setAutofillVisible(true);
      setTimeout(() => setAutofillVisible(false), 3000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !order || !formData.factureId || !formData.arrivalDate) return;

    setIsSending(true);
    
    const docRef = doc(firestore, 'users', user.uid, 'articles', order.id);

    const hasBreakdown = Array.isArray(order.colorBreakdown) && order.colorBreakdown.length > 1;

    let notificationQuantity = order.quantity;
    let notificationColor = order.color;
    let notificationColorBreakdown = order.colorBreakdown;

    // Chercher si l'article existe déjà dans ce conteneur pour les fusionner
    const articlesRef = collection(firestore, 'users', user.uid, 'articles');
    const q = query(articlesRef, where('factureId', '==', formData.factureId));
    const snap = await getDocs(q);
    const existingArticlesInFacture = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const originalOrderId = order.originalOrderId || order.id;

    const existingMergeTarget = existingArticlesInFacture.find((a: any) => 
      (a.originalOrderId === originalOrderId) || 
      (a.id === originalOrderId) || 
      (a.name === order.name && a.categoryId === order.categoryId && a.clientName === order.clientName && a.supplierId === order.supplierId)
    );

    if (splitMode) {
      //  LOGIQUE DE FRACTIONNEMENT 
      if (hasBreakdown) {
        const selectedColorCodes = Object.keys(splitColorQtys).filter(k => splitColorQtys[k] > 0);
        
        if (selectedColorCodes.length === 0) {
          toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez saisir une quantit pour au moins une couleur.' });
          setIsSending(false);
          return;
        }

        let allColorsCompletelySent = true;
        for (const row of order.colorBreakdown) {
          if ((splitColorQtys[row.colorCode] || 0) < Number(row.rolls)) {
            allColorsCompletelySent = false;
            break;
          }
        }
        
        if (allColorsCompletelySent) {
          toast({ variant: 'destructive', title: 'Erreur', description: 'Vous avez slectionn toute la commande. Dsactivez le fractionnement pour expdier toute la commande.' });
          setIsSending(false);
          return;
        }
        
        const splitRows: any[] = [];
        const remainRows: any[] = [];
        
        for (const row of order.colorBreakdown) {
          const sentQty = splitColorQtys[row.colorCode] || 0;
          const origQty = Number(row.rolls) || 0;
          if (sentQty > 0) {
            splitRows.push({ ...row, rolls: sentQty });
          }
          if (origQty - sentQty > 0) {
            remainRows.push({ ...row, rolls: origQty - sentQty });
          }
        }

        const splitTotal = splitRows.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
        const remainTotal = remainRows.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
        
        notificationQuantity = splitTotal;
        notificationColor = splitRows.length === 1 ? splitRows[0].colorCode : 'various';
        notificationColorBreakdown = splitRows.length > 1 ? splitRows : null;

        // Fusion ou Nouvel article (partie en transit)
        if (existingMergeTarget) {
          let mergedBreakdown = existingMergeTarget.colorBreakdown || [];
          if (!Array.isArray(mergedBreakdown)) mergedBreakdown = [];
          
          const newBreakdown = [...mergedBreakdown];
          for (const row of splitRows) {
            const existingRowIndex = newBreakdown.findIndex((r: any) => r.colorCode === row.colorCode);
            if (existingRowIndex >= 0) {
              newBreakdown[existingRowIndex] = {
                ...newBreakdown[existingRowIndex],
                rolls: Number(newBreakdown[existingRowIndex].rolls || 0) + Number(row.rolls || 0)
              };
            } else {
              newBreakdown.push({ ...row });
            }
          }

          const existingRef = doc(firestore, 'users', user.uid, 'articles', existingMergeTarget.id);
          updateDocumentNonBlocking(existingRef, {
            quantity: Number(existingMergeTarget.quantity || 0) + splitTotal,
            colorBreakdown: newBreakdown.length > 1 ? newBreakdown : null,
            color: newBreakdown.length === 1 ? newBreakdown[0].colorCode : 'various'
          });
        } else {
          const newId = crypto.randomUUID();
          const newRef = doc(firestore, 'users', user.uid, 'articles', newId);
          setDocumentNonBlocking(newRef, {
            ...order,
            id: newId,
            originalOrderId: originalOrderId,
            factureId: formData.factureId,
            status: 'SHIPPED',
            arrivalDate: formData.arrivalDate,
            validatedAt: serverTimestamp(),
            quantity: splitTotal,
            color: notificationColor,
            colorBreakdown: notificationColorBreakdown,
          }, { merge: true });
        }

        // Original rduit (reste en PI, sans facture)
        updateDocumentNonBlocking(docRef, {
          quantity: remainTotal,
          originalOrderId: originalOrderId,
          color: remainRows.length === 1 ? remainRows[0].colorCode : 'various',
          colorBreakdown: remainRows.length > 1 ? remainRows : null,
        });

      } else {
        const qty = Number(splitQty);
        const origQty = Number(order.quantity) || 0;
        if (!qty || qty <= 0 || qty >= origQty) {
          toast({ variant: 'destructive', title: 'Erreur', description: 'Quantit  expdier invalide.' });
          setIsSending(false);
          return;
        }

        notificationQuantity = qty;

        // Fusion ou Nouvel article
        if (existingMergeTarget) {
          const existingRef = doc(firestore, 'users', user.uid, 'articles', existingMergeTarget.id);
          updateDocumentNonBlocking(existingRef, {
            quantity: Number(existingMergeTarget.quantity || 0) + qty,
          });
        } else {
          const newId = crypto.randomUUID();
          const newRef = doc(firestore, 'users', user.uid, 'articles', newId);
          setDocumentNonBlocking(newRef, {
            ...order,
            id: newId,
            originalOrderId: originalOrderId,
            factureId: formData.factureId,
            status: 'SHIPPED',
            arrivalDate: formData.arrivalDate,
            validatedAt: serverTimestamp(),
            quantity: qty,
            colorBreakdown: null,
          }, { merge: true });
        }

        // Original rduit
        updateDocumentNonBlocking(docRef, { quantity: origQty - qty, originalOrderId: originalOrderId });
      }
    } else {
      //  NORMAL (Toute la commande) 
      updateDocumentNonBlocking(docRef, {
        factureId: formData.factureId,
        status: 'SHIPPED',
        arrivalDate: formData.arrivalDate,
        validatedAt: serverTimestamp()
      });
    }

    toast({ 
      title: "Commande expdie !", 
      description: `L'article ${order.name} est associ  la facture ${formData.factureId}.` 
    });

    //  Send notification if article has a clientName 
    const clientName = (order.clientName || '').trim();
    if (clientName) {
      toast({ title: ' Envoi en cours...', description: `Notification client  ${clientName}` });
      
      let transitDuration: string | undefined;
      const transitArrivalDate = formData.arrivalDate;
      if (transitArrivalDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eta = new Date(transitArrivalDate);
        eta.setHours(0, 0, 0, 0);
        const diffMs = eta.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          transitDuration = diffDays === 1 ? '1 jour' : `${diffDays} jours`;
        } else if (diffDays === 0) {
          transitDuration = "aujourd'hui";
        }
      }

      const result = await sendStatusNotification({
        firestore,
        adminUid: user.uid,
        clientName,
        articleName: order.categoryId || order.name,
        oldStatus: 'PI',
        newStatus: 'SHIPPED',
        quantity: notificationQuantity,
        unitOfMeasure: order.unitOfMeasure,
        specs: order.specs,
        color: notificationColor,
        size: order.size,
        estimatedProductionDelay: order.estimatedProductionDelay,
        imageUrl: order.imageUrl || undefined,
        transitArrivalDate,
        transitDuration,
      });
      if (result.ok) {
        toast({ title: ' Notification envoye', description: `Email envoy  ${result.email}` });
      } else if (result.error) {
        toast({ title: ' Erreur notification', description: result.error, variant: 'destructive' });
      }
    }

    setIsSending(false);
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-700 flex items-center gap-2">
            <Ship className="w-6 h-6" /> Validation d'Expdition
          </DialogTitle>
          <DialogDescription className="text-stone-500">
            Assignez un numro de facture et une date d'arrive pour confirmer l'expdition.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-2">
          <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Article en cours</div>
          <div className="font-bold text-stone-800">{order.name}</div>
          <div className="text-sm text-stone-600">{order.quantity?.toLocaleString()} {order.unitOfMeasure}  {order.supplierId}</div>
          {order.isPreorder && order.clientName && (
            <div className="mt-1 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex items-center gap-1">
               Notification client : {order.clientName}
            </div>
          )}
        </div>

        {/* Choix d'expdition */}
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setSplitMode(false)}
            className={`flex-1 p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
              !splitMode ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Package className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-black uppercase">Toute la cde</span>
            <span className="text-[9px] font-bold opacity-70">Part entier</span>
          </button>
          
          <button
            type="button"
            onClick={() => setSplitMode(true)}
            className={`flex-1 p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
              splitMode ? 'bg-orange-50 border-orange-400 text-orange-800 shadow-sm' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Scissors className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-black uppercase">Fractionner</span>
            <span className="text-[9px] font-bold opacity-70">Une partie part</span>
          </button>
        </div>

        {/* UI Fractionnement */}
        {splitMode && (
          <div className="bg-orange-50 p-4 rounded-xl border-2 border-dashed border-orange-300 space-y-3 mb-2">
            {Array.isArray(order.colorBreakdown) && order.colorBreakdown.length > 1 ? (
              <div className="space-y-2">
                <p className="text-[9px] font-black text-orange-700 uppercase tracking-widest">Saisissez la quantit  expdier par couleur :</p>
                <div className="space-y-1.5">
                  {order.colorBreakdown.map((row: any) => {
                    const rowMax = Number(row.rolls) || 0;
                    const val = splitColorQtys[row.colorCode] || '';
                    const isSelected = !!val && val > 0;
                    return (
                      <div key={row.colorCode} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                        isSelected ? 'bg-orange-100 border-orange-400' : 'bg-white border-stone-200'
                      }`}>
                        <span className="text-[10px] font-black uppercase w-20 truncate">{row.colorCode}</span>
                        <Input
                          type="number"
                          min={0}
                          max={rowMax}
                          value={val}
                          onChange={e => {
                            let n = Number(e.target.value);
                            if (n > rowMax) n = rowMax;
                            if (n < 0) n = 0;
                            setSplitColorQtys(prev => ({ ...prev, [row.colorCode]: n }));
                          }}
                          placeholder="0"
                          className="h-8 border-orange-200 bg-white font-bold rounded-lg flex-1 text-right"
                        />
                        <span className="text-[9px] text-stone-400 font-bold w-14 text-right">/ {rowMax}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Rcapitulatif auto */}
                {Object.values(splitColorQtys).some(v => v > 0) && (() => {
                  const transitQty = Object.values(splitColorQtys).reduce((s, v) => s + (v || 0), 0);
                  const remainQty = Number(order.quantity) - transitQty;
                  return (
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-orange-200">
                      <div className="text-[10px]">
                        <span className="font-black text-blue-700 uppercase"> Transit :</span> <span className="font-bold">{transitQty} {order.unitOfMeasure}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="font-black text-amber-700 uppercase"> Reste :</span> <span className="font-bold">{remainQty} {order.unitOfMeasure}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[9px] font-black text-orange-700 uppercase tracking-widest">Quantit  expdier (sur {order.quantity}) :</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={(Number(order.quantity) || 1) - 1}
                    value={splitQty || ''}
                    onChange={e => setSplitQty(Number(e.target.value))}
                    placeholder="Ex: 500"
                    className="h-11 border-orange-200 bg-white font-bold rounded-xl flex-1"
                  />
                  <span className="text-[10px] font-bold text-orange-700">{order.unitOfMeasure}</span>
                </div>
                {splitQty > 0 && Number(order.quantity) > splitQty && (
                  <div className="flex gap-4 mt-2 pt-2 border-t border-orange-200">
                    <div className="text-[10px]">
                      <span className="font-black text-blue-700 uppercase"> Transit :</span> <span className="font-bold">{splitQty} {order.unitOfMeasure}</span>
                    </div>
                    <div className="text-[10px]">
                      <span className="font-black text-amber-700 uppercase"> Reste :</span> <span className="font-bold">{Number(order.quantity) - splitQty} {order.unitOfMeasure}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Conteneurs récents — clic rapide */}
          {factures.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Ajouter à un conteneur existant</Label>
              <div className="space-y-1.5">
                {[...factures]
                  .sort((a, b) => (b.createdAt || b.shippingDate || '').localeCompare(a.createdAt || a.shippingDate || ''))
                  .slice(0, 5)
                  .map(f => {
                    const isSelected = formData.factureId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFormData({ factureId: f.id, arrivalDate: f.arrivalDate || '' });
                          setAutofillVisible(true);
                          setTimeout(() => setAutofillVisible(false), 2000);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'bg-blue-50 border-blue-400 shadow-sm'
                            : 'bg-stone-50 border-stone-200 hover:bg-blue-50 hover:border-blue-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Ship className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-500' : 'text-stone-400'}`} />
                          <div className="min-w-0">
                            <p className={`text-[11px] font-black uppercase tracking-tight truncate ${isSelected ? 'text-blue-700' : 'text-stone-700'}`}>{f.id}</p>
                            <p className="text-[9px] font-bold text-stone-400">{f.arrivalDate || 'Date non definie'}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="font-bold text-stone-800">Ou saisir un nouveau N° de Facture / Conteneur</Label>
            <div className="relative">
              <Input 
                value={formData.factureId}
                onChange={handleFactureInput}
                required 
                autoFocus={factures.length === 0}
                className="uppercase font-bold border-blue-200 focus:ring-blue-500" 
                placeholder="Ex: 26HD1004"
              />
            </div>
            {autofillVisible && (
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 mt-2 animate-pulse">
                <CheckCircle2 className="w-3 h-3" />
                Date recupérée du conteneur !
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-blue-700 font-bold flex items-center gap-1">
              <CalendarDays className="w-4 h-4" /> Date d'Arrivée prévue
            </Label>
            <Input 
              type="date"
              required
              className={`bg-blue-50 border-blue-200 font-bold ${autofillVisible ? "highlight-autofill" : ""}`}
              value={formData.arrivalDate}
              onChange={e => setFormData(prev => ({ ...prev, arrivalDate: e.target.value }))}
            />
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSending || !formData.factureId || !formData.arrivalDate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
            Confirmer l'expdition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
