"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Circle, Loader2, Save, ShieldCheck,
  AlertTriangle, Scale, Banknote, Package, FileSearch
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ── The 4 mandatory check items ──
type CheckItem = {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  // autoFn returns true/false if detectable automatically, null if manual
  autoFn?: (facture: any, dp: Record<string, string>, articles: any[]) => boolean | null;
};

const CHECK_ITEMS: CheckItem[] = [
  {
    id: 'douane_ok',
    label: 'Montant de la douane correct',
    desc: 'Les droits de douane payés (DI + TPI + TVA) sont renseignés et corrects.',
    icon: <Scale className="w-5 h-5" />,
    color: '#ef4444',
    autoFn: (f) => (Number(f.customsPaidDhs) || 0) > 0,
  },
  {
    id: 'facture_mad_ok',
    label: 'Facture Payée (MAD) correcte',
    desc: 'Le montant de la facture payée en MAD est saisi et validé.',
    icon: <Banknote className="w-5 h-5" />,
    color: '#f59e0b',
    autoFn: (f) => (Number(f.invoicePaidDhs) || 0) > 0,
  },
  {
    id: 'nw_cbm_ok',
    label: 'Net Weight, CBM et montant facture corrects',
    desc: 'Les poids nets, volumes CBM et montant de facture des articles sont tous renseignés.',
    icon: <Package className="w-5 h-5" />,
    color: '#0ea5e9',
    autoFn: (f, _dp, articles) => {
      if (!articles || articles.length === 0) return null;
      const dossierArticles = articles.filter((a: any) => a.factureId === f.id);
      if (dossierArticles.length === 0) return null;
      const allHaveNW = dossierArticles.every((a: any) => (Number(a.netWeight) || 0) > 0);
      const allHaveCBM = dossierArticles.every((a: any) => (Number(a.cubicMeasurement) || 0) > 0);
      const hasInvoiceAmount = (Number(f.declaredValue) || 0) > 0;
      return allHaveNW && allHaveCBM && hasInvoiceAmount;
    },
  },
  {
    id: 'dp_ok',
    label: 'DP créée et montant DP correct',
    desc: 'La Déclaration Provisoire existe et les prix unitaires (PU) sont renseignés.',
    icon: <FileSearch className="w-5 h-5" />,
    color: '#10b981',
    autoFn: (_f, dp) => {
      if (Object.keys(dp).length === 0) return false;
      return Object.values(dp).some(v => parseFloat(v) > 0);
    },
  },
];

export const CHECKLIST_ITEM_IDS = CHECK_ITEMS.map(i => i.id);

export default function DossierChecklistModal({ open, onOpenChange, facture, articles = [] }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
  articles?: any[];
}) {
  const { firestore, user } = useFirebase();
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [dpMap, setDpMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !facture?.id || !firestore || !user) return;
    setLoading(true);
    Promise.all([
      getDoc(doc(firestore, 'checklists', facture.id)),
      getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', facture.id)),
    ]).then(([checkSnap, dpSnap]) => {
      setManualChecks(checkSnap.exists() ? checkSnap.data().checks || {} : {});
      setDpMap(dpSnap.exists() ? dpSnap.data().puMap || {} : {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open, facture?.id, firestore, user]);

  const getStatus = (item: CheckItem): boolean => {
    if (item.autoFn) {
      const result = item.autoFn(facture || {}, dpMap, articles);
      if (result !== null) return result;
    }
    return !!manualChecks[item.id];
  };

  const isAuto = (item: CheckItem): boolean => !!item.autoFn && item.autoFn(facture || {}, dpMap, articles) !== null;

  const toggle = (item: CheckItem) => {
    if (isAuto(item)) return;
    setManualChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }));
    setSavedOk(false);
  };

  const handleSave = useCallback(async () => {
    if (!facture?.id || !firestore) return;
    setSaving(true);
    try {
      await setDoc(
        doc(firestore, 'checklists', facture.id),
        { checks: manualChecks, savedAt: new Date().toISOString(), factureId: facture.id },
        { merge: true }
      );
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } finally { setSaving(false); }
  }, [facture?.id, firestore, manualChecks]);

  const allOk = CHECK_ITEMS.every(i => getStatus(i));
  const doneCount = CHECK_ITEMS.filter(i => getStatus(i)).length;

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
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-sm ${
              allOk ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white'
            }`}>
              {doneCount}/{CHECK_ITEMS.length}
            </div>
          </div>

          {/* Status banner */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
            allOk
              ? 'bg-emerald-500/15 border border-emerald-500/30'
              : 'bg-amber-500/15 border border-amber-500/30'
          }`}>
            {allOk ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                  Dossier validé — visible dans Coût de Vente
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                  {CHECK_ITEMS.length - doneCount} vérification{CHECK_ITEMS.length - doneCount > 1 ? 's' : ''} manquante{CHECK_ITEMS.length - doneCount > 1 ? 's' : ''} — Coût de Vente masqué
                </span>
              </>
            )}
          </div>
        </div>

        {/* Check items */}
        <div className="p-4 space-y-3 bg-stone-50 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement...</span>
            </div>
          ) : (
            CHECK_ITEMS.map((item, idx) => {
              const checked = getStatus(item);
              const auto = isAuto(item);
              const failed = auto && !checked;

              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item)}
                  disabled={auto}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                    checked
                      ? 'bg-emerald-50 border-emerald-200'
                      : failed
                      ? 'bg-red-50 border-red-200'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  } ${auto ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {/* Number badge */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${
                    checked ? 'bg-emerald-500 text-white' : failed ? 'bg-red-100 text-red-500' : 'bg-stone-100 text-stone-400'
                  }`}>
                    {checked ? <CheckCircle2 className="w-4 h-4" /> : failed ? <XCircle className="w-4 h-4" /> : idx + 1}
                  </div>

                  {/* Icon */}
                  <div className={`p-2 rounded-xl shrink-0 ${
                    checked ? 'bg-emerald-100' : failed ? 'bg-red-100' : 'bg-stone-100'
                  }`} style={{ color: checked ? '#10b981' : failed ? '#ef4444' : item.color }}>
                    {item.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-black uppercase tracking-tight leading-snug ${
                      checked ? 'text-emerald-700' : failed ? 'text-red-700' : 'text-stone-800'
                    }`}>
                      {item.label}
                    </p>
                    <p className={`text-[9px] font-medium mt-0.5 leading-relaxed ${
                      checked ? 'text-emerald-500' : failed ? 'text-red-400' : 'text-stone-400'
                    }`}>
                      {item.desc}
                    </p>
                  </div>

                  {/* Badge auto/manual */}
                  <div className="shrink-0">
                    <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      auto
                        ? checked ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'
                        : 'bg-violet-100 text-violet-500'
                    }`}>
                      {auto ? 'Auto' : 'Manuel'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-stone-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${allOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
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
