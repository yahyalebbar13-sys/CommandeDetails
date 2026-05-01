"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, Circle, Loader2, Save, ShieldCheck,
  AlertTriangle, Scale, Banknote, Package, FileSearch
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

// ── The 4 mandatory check items — all 100% manual ──
type CheckItem = {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
};

const CHECK_ITEMS: CheckItem[] = [
  {
    id: 'douane_ok',
    label: 'Montant de la douane correct',
    desc: 'Les droits de douane payés (DI + TPI + TVA) sont corrects.',
    icon: <Scale className="w-5 h-5" />,
    color: '#ef4444',
  },
  {
    id: 'facture_mad_ok',
    label: 'Facture Payée (MAD) correcte',
    desc: 'Le montant de la facture payée en MAD est correct.',
    icon: <Banknote className="w-5 h-5" />,
    color: '#f59e0b',
  },
  {
    id: 'nw_cbm_ok',
    label: 'Net Weight, CBM et montant facture corrects',
    desc: 'Les poids nets, volumes CBM et le montant de la facture sont corrects.',
    icon: <Package className="w-5 h-5" />,
    color: '#0ea5e9',
  },
  {
    id: 'dp_ok',
    label: 'DP créée et montant DP correct',
    desc: 'La Déclaration Provisoire existe et les prix unitaires (PU) sont corrects.',
    icon: <FileSearch className="w-5 h-5" />,
    color: '#10b981',
  },
];

export default function DossierChecklistModal({ open, onOpenChange, facture }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
}) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load saved checks from Firebase — stored under users/{uid}/checklists/{factureId}
  useEffect(() => {
    if (!open || !facture?.id || !firestore || !user) return;
    setLoading(true);
    getDoc(doc(firestore, 'users', user.uid, 'checklists', facture.id))
      .then(snap => {
        setChecks(snap.exists() ? snap.data().checks || {} : {});
      })
      .catch(() => {})
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
      toast({ title: 'Sauvegardé !', description: `Vérification du dossier ${facture.id} enregistrée.` });
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err) {
      console.error('Checklist save error:', err);
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder. Vérifiez votre connexion.', variant: 'destructive' });
    } finally { setSaving(false); }
  }, [facture?.id, firestore, user, checks, toast]);

  const allOk = CHECK_ITEMS.every(i => !!checks[i.id]);
  const doneCount = CHECK_ITEMS.filter(i => !!checks[i.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl border-stone-200 flex flex-col">

        {/* Header */}
        <div className="bg-stone-900 p-6 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500 rounded-xl shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-black text-lg uppercase tracking-tight leading-none">
                  Vérification Dossier
                </DialogTitle>
                <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                  {facture?.id}
                  {facture?.declaringCompany && (
                    <span className="text-blue-400 ml-2">· {facture.declaringCompany}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Score pill */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-sm transition-colors ${
              allOk ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white'
            }`}>
              {doneCount}/{CHECK_ITEMS.length}
            </div>
          </div>

          {/* Status banner */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
            allOk
              ? 'bg-emerald-500/15 border border-emerald-500/30'
              : 'bg-amber-500/15 border border-amber-500/30'
          }`}>
            {allOk ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                  Dossier validé — visible dans Coût de Vente
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                  {CHECK_ITEMS.length - doneCount} vérification{CHECK_ITEMS.length - doneCount > 1 ? 's' : ''} manquante{CHECK_ITEMS.length - doneCount > 1 ? 's' : ''} — Coût de Vente masqué
                </span>
              </>
            )}
          </div>
        </div>

        {/* Check items — all manual */}
        <div className="p-4 space-y-3 bg-stone-50 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement...</span>
            </div>
          ) : (
            CHECK_ITEMS.map((item, idx) => {
              const checked = !!checks[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer active:scale-95 ${
                    checked
                      ? 'bg-emerald-50 border-emerald-200 shadow-sm shadow-emerald-100'
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {/* Checkbox visual */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-300'
                  }`}>
                    {checked
                      ? <CheckCircle2 className="w-5 h-5" />
                      : <Circle className="w-5 h-5" />
                    }
                  </div>

                  {/* Colored icon */}
                  <div className={`p-2 rounded-xl shrink-0 transition-colors ${
                    checked ? 'bg-emerald-100' : 'bg-stone-100'
                  }`} style={{ color: checked ? '#10b981' : item.color }}>
                    {item.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-black uppercase tracking-tight leading-snug transition-colors ${
                      checked ? 'text-emerald-700 line-through opacity-70' : 'text-stone-800'
                    }`}>
                      {item.label}
                    </p>
                    <p className={`text-[9px] font-medium mt-0.5 leading-relaxed transition-colors ${
                      checked ? 'text-emerald-500' : 'text-stone-400'
                    }`}>
                      {item.desc}
                    </p>
                  </div>

                  {/* Number badge */}
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-colors ${
                    checked ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-500'
                  }`}>
                    {idx + 1}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-stone-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${allOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              {allOk ? 'Coût de Vente déverrouillé' : 'Coût de Vente verrouillé'}
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              savedOk ? 'bg-emerald-500 text-white scale-95' : 'bg-stone-900 hover:bg-stone-700 text-white'
            } disabled:opacity-50`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : savedOk ? <CheckCircle2 className="w-3.5 h-3.5" />
              : <Save className="w-3.5 h-3.5" />}
            {savedOk ? 'Sauvegardé !' : 'Sauvegarder'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
