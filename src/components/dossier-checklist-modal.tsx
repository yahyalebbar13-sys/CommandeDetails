"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Circle, Loader2, Save, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ── Définition des points de contrôle ──
export const CHECKLIST_ITEMS: { id: string; label: string; desc: string; critical?: boolean }[] = [
  { id: 'bl',         label: 'N° BL vérifié',               desc: 'Le numéro de connaissement correspond au document reçu.',            critical: true },
  { id: 'eta',        label: 'Date d\'arrivée confirmée',    desc: 'La date ETA est correcte et mise à jour.',                           critical: true },
  { id: 'supplier',   label: 'Fournisseur correct',          desc: 'L\'identité du fournisseur est validée.',                            critical: true },
  { id: 'valDecl',    label: 'Valeur déclarée en douane ($)', desc: 'La valeur déclarée ($) est vérifiée et alignée avec la DP.',         critical: true },
  { id: 'facturePay', label: 'Facture payée (MAD)',           desc: 'Le montant payé en MAD est enregistré et confirmé.',                 critical: true },
  { id: 'tauxChange', label: 'Taux de change cohérent',      desc: 'Le taux calculé (MAD/$) est raisonnable par rapport au marché.',     critical: false },
  { id: 'fret',       label: 'Fret maritime renseigné ($)',  desc: 'Le coût de fret est saisi et correspond à la facture armateur.',     critical: false },
  { id: 'transitaire','label': 'Facture transitaire OK',     desc: 'Le montant de la facture transitaire est confirmé.',                 critical: false },
  { id: 'cbm',        label: 'CBM total cohérent',           desc: 'Le volume total (m³) est cohérent avec le dossier.',                 critical: false },
  { id: 'dp',         label: 'DP créée et validée',          desc: 'La déclaration provisoire a été saisie et exportée.',               critical: false },
  { id: 'droits',     label: 'Droits de douane payés',       desc: 'Les droits (DI + TPI + TIC + TVA) ont été réglés.',                 critical: false },
];

export type ChecklistState = Record<string, boolean>;

interface DossierChecklistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
}

export default function DossierChecklistModal({ open, onOpenChange, facture }: DossierChecklistModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [checks, setChecks] = useState<ChecklistState>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load from Firebase
  useEffect(() => {
    if (!open || !facture?.id || !firestore || !user) return;
    setLoading(true);
    getDoc(doc(firestore, 'users', user.uid, 'checklists', facture.id))
      .then(snap => {
        if (snap.exists()) setChecks(snap.data().checks || {});
        else setChecks({});
      })
      .finally(() => setLoading(false));
  }, [open, facture?.id, firestore, user]);

  const toggle = (id: string) => {
    setChecks(prev => ({ ...prev, [id]: !prev[id] }));
    setSavedOk(false);
  };

  const handleSave = useCallback(async () => {
    if (!facture?.id || !firestore || !user) return;
    setSaving(true);
    try {
      await setDoc(
        doc(firestore, 'users', user.uid, 'checklists', facture.id),
        { checks, savedAt: new Date().toISOString(), factureId: facture.id },
        { merge: true }
      );
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [facture?.id, firestore, user, checks]);

  const total = CHECKLIST_ITEMS.length;
  const done = CHECKLIST_ITEMS.filter(i => checks[i.id]).length;
  const criticalItems = CHECKLIST_ITEMS.filter(i => i.critical);
  const criticalDone = criticalItems.filter(i => checks[i.id]).length;
  const allCriticalDone = criticalDone === criticalItems.length;
  const pct = Math.round((done / total) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border-stone-200">
        {/* Header */}
        <div className="bg-stone-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-black text-lg uppercase tracking-tight leading-none">
                  Vérification Dossier
                </DialogTitle>
                <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                  {facture?.id}
                </p>
              </div>
            </div>
            {/* Score badge */}
            <div className={`px-4 py-2 rounded-xl text-center ${allCriticalDone ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-amber-500/20 border border-amber-500/30'}`}>
              <p className="text-[8px] font-black uppercase tracking-widest text-stone-400 mb-0.5">Progression</p>
              <p className={`text-xl font-black leading-none ${allCriticalDone ? 'text-emerald-400' : 'text-amber-400'}`}>
                {done}/{total}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[8px] font-bold text-stone-500 uppercase tracking-widest">{pct}% complété</span>
            {!allCriticalDone && (
              <span className="flex items-center gap-1 text-[8px] font-black text-amber-400 uppercase tracking-widest">
                <AlertTriangle className="w-2.5 h-2.5" /> {criticalItems.length - criticalDone} point{criticalItems.length - criticalDone > 1 ? 's' : ''} critique{criticalItems.length - criticalDone > 1 ? 's' : ''} restant{criticalItems.length - criticalDone > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Checklist */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement...</span>
          </div>
        ) : (
          <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
            {CHECKLIST_ITEMS.map(item => {
              const checked = !!checks[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`w-full flex items-start gap-4 p-4 rounded-2xl text-left transition-all border ${
                    checked
                      ? 'bg-emerald-50 border-emerald-200'
                      : item.critical
                      ? 'bg-amber-50/50 border-amber-100 hover:bg-amber-50'
                      : 'bg-stone-50 border-stone-100 hover:bg-stone-100/80'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {checked
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <Circle className={`w-5 h-5 ${item.critical ? 'text-amber-400' : 'text-stone-300'}`} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-[12px] font-black uppercase tracking-tight leading-none ${checked ? 'text-emerald-700 line-through opacity-70' : 'text-stone-800'}`}>
                        {item.label}
                      </p>
                      {item.critical && !checked && (
                        <span className="shrink-0 text-[7px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                          Critique
                        </span>
                      )}
                    </div>
                    <p className={`text-[9px] font-medium mt-0.5 ${checked ? 'text-emerald-500/70' : 'text-stone-400'}`}>
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
          <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
            {allCriticalDone ? '✅ Points critiques validés' : '⚠ Validez tous les points critiques'}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
              savedOk ? 'bg-emerald-500 text-white' : 'bg-stone-900 hover:bg-stone-700 text-white'
            } disabled:opacity-50`}
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : savedOk
              ? <CheckCircle2 className="w-3.5 h-3.5" />
              : <Save className="w-3.5 h-3.5" />
            }
            {savedOk ? 'Sauvegardé !' : 'Sauvegarder'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
