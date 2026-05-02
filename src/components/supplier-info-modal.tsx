"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  Factory, MapPin, Phone, Mail, User, Building2, Globe,
  Save, Loader2, CreditCard, CheckCircle2
} from 'lucide-react';

export interface SupplierProfile {
  id: string;           // = supplierId (nom du fournisseur)
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  contactPerson: string;
  bankName?: string;
  bankAccount?: string;
  notes?: string;
  updatedAt?: string;
}

interface SupplierInfoModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId: string;   // nom du fournisseur (clé)
  onSaved?: (profile: SupplierProfile) => void;
}

const EMPTY: Omit<SupplierProfile, 'id'> = {
  name: '', address: '', city: '', country: 'China',
  phone: '', email: '', contactPerson: '',
  bankName: '', bankAccount: '', notes: '',
};

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
        {icon}{label}
      </Label>
      {children}
    </div>
  );
}

export default function SupplierInfoModal({ open, onOpenChange, supplierId, onSaved }: SupplierInfoModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [form, setForm] = useState<Omit<SupplierProfile, 'id'>>({ ...EMPTY, name: supplierId });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load existing profile from Firebase
  useEffect(() => {
    if (!open || !supplierId || !firestore || !user) return;
    setLoading(true);
    setSavedOk(false);
    getDoc(doc(firestore, 'users', user.uid, 'supplierProfiles', supplierId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as SupplierProfile;
          setForm({
            name: data.name || supplierId,
            address: data.address || '',
            city: data.city || '',
            country: data.country || 'China',
            phone: data.phone || '',
            email: data.email || '',
            contactPerson: data.contactPerson || '',
            bankName: data.bankName || '',
            bankAccount: data.bankAccount || '',
            notes: data.notes || '',
          });
        } else {
          setForm({ ...EMPTY, name: supplierId });
        }
      })
      .catch(() => setForm({ ...EMPTY, name: supplierId }))
      .finally(() => setLoading(false));
  }, [open, supplierId, firestore, user]);

  const set = (k: keyof typeof EMPTY, v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!user || !firestore || !supplierId) return;
    setSaving(true);
    try {
      const profile: SupplierProfile = { id: supplierId, ...form, updatedAt: new Date().toISOString() };
      await setDoc(
        doc(firestore, 'users', user.uid, 'supplierProfiles', supplierId),
        profile,
        { merge: true }
      );
      setSavedOk(true);
      toast({ title: '✅ Fiche fournisseur sauvegardée', description: `Les infos de ${supplierId} sont maintenant disponibles dans les bons de commande.` });
      onSaved?.(profile);
      setTimeout(() => onOpenChange(false), 800);
    } catch (err: any) {
      toast({ title: '❌ Erreur', description: err?.message || 'Impossible de sauvegarder.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "h-10 border-stone-200 font-bold rounded-xl text-[12px] focus-visible:ring-amber-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-stone-200 max-h-[92vh] overflow-y-auto rounded-2xl p-0">

        {/* Header */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-6 flex items-start gap-4 text-white sticky top-0 z-10">
          <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 shrink-0">
            <Factory className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">
              Fiche Fournisseur
            </DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
              {supplierId}
            </p>
          </div>
          {savedOk && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-[9px] font-black uppercase">
              <CheckCircle2 className="w-4 h-4" /> Sauvegardé
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement…</span>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* Section: Identité */}
            <SectionLabel icon={<Factory className="w-3 h-3" />} label="Identité" />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldRow icon={<Building2 className="w-3 h-3" />} label="Nom officiel du fournisseur">
                  <Input className={inputCls} placeholder="ex: GUANGZHOU ZIPPER CO., LTD" value={form.name} onChange={e => set('name', e.target.value)} />
                </FieldRow>
              </div>
              <FieldRow icon={<User className="w-3 h-3" />} label="Contact principal">
                <Input className={inputCls} placeholder="ex: Mr. Zhang Wei" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
              </FieldRow>
              <FieldRow icon={<Globe className="w-3 h-3" />} label="Pays">
                <Input className={inputCls} placeholder="China" value={form.country} onChange={e => set('country', e.target.value)} />
              </FieldRow>
            </div>

            {/* Section: Adresse */}
            <SectionLabel icon={<MapPin className="w-3 h-3" />} label="Adresse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldRow icon={<MapPin className="w-3 h-3" />} label="Adresse complète">
                  <Input className={inputCls} placeholder="No. 123, Industrial Zone, ..." value={form.address} onChange={e => set('address', e.target.value)} />
                </FieldRow>
              </div>
              <FieldRow icon={<Building2 className="w-3 h-3" />} label="Ville / Province">
                <Input className={inputCls} placeholder="Guangzhou, Guangdong" value={form.city} onChange={e => set('city', e.target.value)} />
              </FieldRow>
            </div>

            {/* Section: Contact */}
            <SectionLabel icon={<Phone className="w-3 h-3" />} label="Contact" />
            <div className="grid grid-cols-2 gap-3">
              <FieldRow icon={<Phone className="w-3 h-3" />} label="Téléphone / WhatsApp">
                <Input className={inputCls} placeholder="+86 20 0000 0000" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </FieldRow>
              <FieldRow icon={<Mail className="w-3 h-3" />} label="Email">
                <Input className={inputCls} type="email" placeholder="contact@supplier.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </FieldRow>
            </div>

            {/* Section: Banque (optionnel) */}
            <SectionLabel icon={<CreditCard className="w-3 h-3" />} label="Informations Bancaires (optionnel)" />
            <div className="grid grid-cols-2 gap-3">
              <FieldRow icon={<Building2 className="w-3 h-3" />} label="Nom de la banque">
                <Input className={inputCls} placeholder="Bank of China..." value={form.bankName || ''} onChange={e => set('bankName', e.target.value)} />
              </FieldRow>
              <FieldRow icon={<CreditCard className="w-3 h-3" />} label="N° de compte">
                <Input className={inputCls} placeholder="IBAN / Account" value={form.bankAccount || ''} onChange={e => set('bankAccount', e.target.value)} />
              </FieldRow>
            </div>

            {/* Notes */}
            <FieldRow icon={<Factory className="w-3 h-3" />} label="Notes internes (facultatif)">
              <textarea
                rows={2}
                placeholder="Notes sur ce fournisseur..."
                value={form.notes || ''}
                onChange={e => set('notes', e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-[12px] font-bold text-stone-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
              />
            </FieldRow>

            {/* Info */}
            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-wider text-center">
              Ces infos s'ajouteront automatiquement dans les bons de commande de ce fournisseur
            </p>

            {/* Submit */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 bg-stone-900 hover:bg-black text-white font-black uppercase tracking-widest rounded-xl gap-2 shadow-lg"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde…</>
                : <><Save className="w-4 h-4" /> Sauvegarder la fiche</>
              }
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 -mb-1">
      <div className="p-1.5 bg-stone-100 rounded-lg text-stone-500">{icon}</div>
      <span className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">{label}</span>
      <div className="flex-1 h-px bg-stone-100" />
    </div>
  );
}
