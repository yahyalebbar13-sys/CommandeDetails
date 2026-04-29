"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Circle, Loader2, Save, ShieldCheck,
  AlertTriangle, FileText, DollarSign, Ship, Package, Zap, Building2
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

// ── Types ──
type CheckItem = {
  id: string;
  label: string;
  desc: string;
  critical?: boolean;
  autoFn?: (facture: any, dp: Record<string, string>) => boolean | null; // null = unknown
};

type Section = { id: string; label: string; icon: React.ReactNode; color: string; items: CheckItem[] };

// ── Sections & Items ──
const SECTIONS: Section[] = [
  {
    id: 'docs', label: 'Documents Officiels', color: '#6366f1',
    icon: <FileText className="w-4 h-4" />,
    items: [
      { id: 'bl',         label: 'N° BL renseigné',           desc: 'Le numéro de connaissement est saisi.',         critical: true,  autoFn: (f) => !!f.noBL },
      { id: 'eta',        label: "Date d'arrivée (ETA)",       desc: 'La date ETA est confirmée.',                    critical: true,  autoFn: (f) => !!f.arrivalDate },
      { id: 'etd',        label: "Date d'expédition (ETD)",    desc: 'La date ETD est renseignée.',                   critical: false, autoFn: (f) => !!f.shippingDate },
      { id: 'shippingLine',label: 'Compagnie maritime',        desc: 'La shipping line est identifiée.',              critical: false, autoFn: (f) => !!f.shippingLine },
      { id: 'forwarder',  label: 'Transitaire désigné',        desc: 'Le transitaire est nommé dans le dossier.',     critical: false, autoFn: (f) => !!f.forwarder },
      { id: 'company',    label: 'Société déclarante',         desc: 'La société importatrice est sélectionnée.',     critical: true,  autoFn: (f) => !!f.declaringCompany },
    ],
  },
  {
    id: 'finance', label: 'Financier', color: '#f59e0b',
    icon: <DollarSign className="w-4 h-4" />,
    items: [
      { id: 'valDecl',    label: 'Valeur déclarée ($)',        desc: 'La valeur douane en $ est saisie.',             critical: true,  autoFn: (f) => (Number(f.declaredValue) || 0) > 0 },
      { id: 'facturePay', label: 'Facture payée (MAD)',        desc: 'Le montant payé en MAD est enregistré.',        critical: true,  autoFn: (f) => (Number(f.invoicePaidDhs) || 0) > 0 },
      { id: 'tauxChange', label: 'Taux de change cohérent',   desc: 'Taux calculé entre 9.5 et 12 MAD/$.',           critical: false,
        autoFn: (f) => {
          const val = Number(f.declaredValue); const paid = Number(f.invoicePaidDhs);
          if (!val || !paid) return null;
          const t = paid / val;
          return t >= 9.5 && t <= 12;
        }
      },
      { id: 'factEchange', label: 'Facture échange (MAD)',    desc: 'Montant facture échange saisi.',                critical: false, autoFn: (f) => (Number(f.exchangeInvoiceAmount) || 0) > 0 },
      { id: 'factTrans',  label: 'Facture transitaire (MAD)', desc: 'Montant facture transitaire saisi.',            critical: false, autoFn: (f) => (Number(f.supplierInvoiceAmount) || 0) > 0 },
    ],
  },
  {
    id: 'logistique', label: 'Logistique', color: '#0ea5e9',
    icon: <Ship className="w-4 h-4" />,
    items: [
      { id: 'fret',       label: 'Fret maritime ($)',          desc: 'Le coût de fret armateur est saisi.',           critical: false, autoFn: (f) => (Number(f.freightCost) || 0) > 0 },
      { id: 'cbm',        label: 'CBM articles cohérent',      desc: 'Les volumes CBM des articles sont renseignés.', critical: false, autoFn: null },
      { id: 'nw',         label: 'Poids net renseigné',        desc: 'Les poids NW des articles sont saisis.',        critical: false, autoFn: null },
      { id: 'stockDate',  label: 'Date entrée stock',          desc: "La date d'entrée en stock est confirmée.",      critical: false, autoFn: (f) => !!f.stockEntryDate },
    ],
  },
  {
    id: 'douane', label: 'Douane & DP', color: '#10b981',
    icon: <Package className="w-4 h-4" />,
    items: [
      { id: 'dp',         label: 'DP créée',                   desc: 'La déclaration provisoire existe pour ce dossier.', critical: true,  autoFn: (_f, dp) => Object.keys(dp).length > 0 },
      { id: 'dpPU',       label: 'PU remplis dans la DP',      desc: 'Au moins un prix unitaire est saisi dans la DP.',   critical: true,  autoFn: (_f, dp) => Object.values(dp).some(v => parseFloat(v) > 0) },
      { id: 'droits',     label: 'Droits de douane payés',     desc: 'Les droits (DI+TPI+TIC+TVA) ont été réglés.',       critical: false, autoFn: (f) => (Number(f.customsPaidDhs) || 0) > 0 },
    ],
  },
  {
    id: 'confirm', label: 'Confirmations Manuelles', color: '#8b5cf6',
    icon: <Zap className="w-4 h-4" />,
    items: [
      { id: 'supplierOk', label: 'Fournisseur vérifié',        desc: "L'identité du fournisseur est validée manuellement.", critical: true, autoFn: null },
      { id: 'marchandise',label: 'Marchandise conforme',       desc: 'La marchandise reçue correspond au bon de commande.',  critical: true, autoFn: null },
      { id: 'docsClass',  label: 'Documents classés',          desc: 'Tous les documents physiques sont archivés.',          critical: false, autoFn: null },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap(s => s.items);

export default function DossierChecklistModal({ open, onOpenChange, facture }: {
  open: boolean; onOpenChange: (open: boolean) => void; facture: any;
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

  const isChecked = (item: CheckItem): boolean => {
    if (item.autoFn) {
      const result = item.autoFn(facture || {}, dpMap);
      if (result !== null) return result;
    }
    return !!manualChecks[item.id];
  };

  const isAuto = (item: CheckItem): boolean | null => {
    if (!item.autoFn) return null;
    return item.autoFn(facture || {}, dpMap);
  };

  const toggle = (item: CheckItem) => {
    if (item.autoFn && item.autoFn(facture || {}, dpMap) !== null) return; // auto items not toggleable
    setManualChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }));
    setSavedOk(false);
  };

  const handleSave = useCallback(async () => {
    if (!facture?.id || !firestore) return;
    setSaving(true);
    try {
      await setDoc(doc(firestore, 'checklists', facture.id),
        { checks: manualChecks, savedAt: new Date().toISOString(), factureId: facture.id },
        { merge: true });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } finally { setSaving(false); }
  }, [facture?.id, firestore, manualChecks]);

  const done = ALL_ITEMS.filter(i => isChecked(i)).length;
  const total = ALL_ITEMS.length;
  const pct = Math.round((done / total) * 100);
  const criticals = ALL_ITEMS.filter(i => i.critical);
  const criticalsDone = criticals.filter(i => isChecked(i)).length;
  const allCriticalOk = criticalsDone === criticals.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-3xl border-stone-200 max-h-[90vh] flex flex-col">

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
                  {facture?.id} {facture?.declaringCompany && <span className="text-blue-400 ml-2">· {facture.declaringCompany}</span>}
                </p>
              </div>
            </div>

            {/* Score ring */}
            <div className="flex flex-col items-center">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle cx="32" cy="32" r="26" fill="none"
                    stroke={pct === 100 ? '#10b981' : pct >= 70 ? '#0ea5e9' : pct >= 40 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 26}`}
                    strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-black text-sm leading-none">{pct}%</span>
                </div>
              </div>
              <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-1">{done}/{total}</span>
            </div>
          </div>

          {/* Critical status */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${allCriticalOk ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-amber-500/15 border border-amber-500/25'}`}>
            {allCriticalOk
              ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Tous les points critiques sont validés</span></>
              : <><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /><span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{criticals.length - criticalsDone} point{criticals.length - criticalsDone > 1 ? 's' : ''} critique{criticals.length - criticalsDone > 1 ? 's' : ''} manquant{criticals.length - criticalsDone > 1 ? 's' : ''}</span></>
            }
          </div>
        </div>

        {/* Sections */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 bg-stone-50">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement...</span>
            </div>
          ) : (
            SECTIONS.map(section => {
              const sectionDone = section.items.filter(i => isChecked(i)).length;
              return (
                <div key={section.id} className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
                  {/* Section header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100"
                    style={{ background: `${section.color}08` }}>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg" style={{ background: `${section.color}18`, color: section.color }}>
                        {section.icon}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: section.color }}>
                        {section.label}
                      </span>
                    </div>
                    <span className="text-[9px] font-black text-stone-400 uppercase">
                      {sectionDone}/{section.items.length}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-stone-50">
                    {section.items.map(item => {
                      const checked = isChecked(item);
                      const autoResult = isAuto(item);
                      const isManual = autoResult === null;
                      const isAutoFailed = autoResult === false;

                      return (
                        <button
                          key={item.id}
                          onClick={() => toggle(item)}
                          disabled={!isManual}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group ${
                            checked ? 'bg-emerald-50/50' : isAutoFailed ? 'bg-red-50/40' : 'hover:bg-stone-50'
                          } ${isManual ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          {/* Status icon */}
                          <div className="shrink-0">
                            {checked
                              ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              : isAutoFailed
                              ? <XCircle className="w-5 h-5 text-red-400" />
                              : <Circle className={`w-5 h-5 ${item.critical ? 'text-amber-300' : 'text-stone-200'}`} />
                            }
                          </div>

                          {/* Labels */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-[11px] font-black uppercase tracking-tight leading-none ${
                                checked ? 'text-emerald-600 line-through opacity-60' : isAutoFailed ? 'text-red-600' : 'text-stone-800'
                              }`}>
                                {item.label}
                              </p>
                              {item.critical && !checked && (
                                <span className="text-[7px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0">
                                  Critique
                                </span>
                              )}
                            </div>
                            <p className={`text-[9px] font-medium mt-0.5 ${checked ? 'text-emerald-400/60' : isAutoFailed ? 'text-red-400' : 'text-stone-400'}`}>
                              {item.desc}
                            </p>
                          </div>

                          {/* Auto / Manual badge */}
                          <div className="shrink-0">
                            {!isManual
                              ? <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                                  checked ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'
                                }`}>Auto</span>
                              : <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">Manuel</span>
                            }
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-stone-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${allCriticalOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              {allCriticalOk ? 'Dossier prêt pour validation' : 'En attente de validation critique'}
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
