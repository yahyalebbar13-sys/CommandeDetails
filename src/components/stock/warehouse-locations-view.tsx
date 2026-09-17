"use client";

import React, { useState, useMemo } from 'react';
import {
  MapPin, Plus, Save, Trash2, QrCode, Grid3x3, Layers, Loader2,
  Wand2, Package, Ruler, Warehouse, X, Search, CheckCircle2, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { collection, doc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import type { Store } from '@/lib/types';
import {
  StorageLocation, StorageZone, ZONE_COLOR_KEYS, zoneColor, buildLocationCode,
  normalizeSegment, generateLocationCodes, MAX_GENERATED_LOCATIONS, computeLocationOccupancy,
  compareLocationCodes, locationQrPayload, parseLocationCode,
} from '@/lib/warehouse-locations';

interface WarehouseLocationsViewProps {
  stores: Store[];
  locations: StorageLocation[];
  movements: any[];
  adminUid: string | null;
  readOnly?: boolean;
}

const EMPTY_GENERATOR = {
  zone: '',
  rackFrom: 1,
  rackTo: 10,
  levelFrom: 1,
  levelTo: 4,
  withLevels: true,
};

export default function WarehouseLocationsView({
  stores, locations, movements, adminUid, readOnly,
}: WarehouseLocationsViewProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [activeStoreId, setActiveStoreId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<StorageZone & { _originalCode?: string }>({ code: '', name: '', color: 'emerald' });

  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generator, setGenerator] = useState(EMPTY_GENERATOR);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Partial<StorageLocation>>({});

  // ── Lieu actif ─────────────────────────────────────────────────────────────
  const sortedStores = useMemo(
    () => [...(stores || [])].sort((a, b) => {
      // Les entrepôts d'abord : ce sont eux qu'on adresse en priorité.
      if (a.type !== b.type) return a.type === 'WAREHOUSE' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [stores]
  );

  const currentStoreId = activeStoreId || sortedStores[0]?.id || '';
  const currentStore = sortedStores.find(s => s.id === currentStoreId);
  const zones: StorageZone[] = useMemo(
    () => ((currentStore as any)?.zones || []) as StorageZone[],
    [currentStore]
  );

  const storeLocations = useMemo(
    () => (locations || [])
      .filter(l => l.storeId === currentStoreId)
      .sort((a, b) => compareLocationCodes(a.code, b.code)),
    [locations, currentStoreId]
  );

  const occupancy = useMemo(() => computeLocationOccupancy(movements || []), [movements]);

  const visibleLocations = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return storeLocations;
    return storeLocations.filter(l =>
      l.code.includes(q) || (l.label || '').toUpperCase().includes(q)
    );
  }, [storeLocations, search]);

  // Regroupement zone → rack, pour restituer la géographie réelle de l'entrepôt.
  const grouped = useMemo(() => {
    const byZone: Record<string, Record<string, StorageLocation[]>> = {};
    for (const loc of visibleLocations) {
      const z = loc.zone || '—';
      const r = loc.rack || '—';
      if (!byZone[z]) byZone[z] = {};
      if (!byZone[z][r]) byZone[z][r] = [];
      byZone[z][r].push(loc);
    }
    return byZone;
  }, [visibleLocations]);

  const stats = useMemo(() => {
    const occupied = storeLocations.filter(l => (occupancy[l.code]?.quantity || 0) > 0).length;
    return {
      zones: zones.length,
      total: storeLocations.length,
      occupied,
      free: storeLocations.length - occupied,
    };
  }, [storeLocations, occupancy, zones.length]);

  const canWrite = Boolean(firestore && adminUid && currentStoreId && !readOnly);

  // ── Zones ──────────────────────────────────────────────────────────────────
  const openZoneModal = (zone?: StorageZone) => {
    setEditingZone(zone
      ? { ...zone, _originalCode: zone.code }
      : { code: '', name: '', color: ZONE_COLOR_KEYS[zones.length % ZONE_COLOR_KEYS.length] });
    setZoneModalOpen(true);
  };

  const handleSaveZone = async () => {
    if (!canWrite || !currentStore) return;
    const code = normalizeSegment(editingZone.code);
    if (!code) {
      toast({ variant: 'destructive', title: 'Code requis', description: 'Donne un code court à la zone (A, B, RECEPTION…).' });
      return;
    }
    const original = editingZone._originalCode;
    if (code !== original && zones.some(z => z.code === code)) {
      toast({ variant: 'destructive', title: 'Zone existante', description: `La zone ${code} existe déjà dans ${currentStore.name}.` });
      return;
    }

    setBusy(true);
    try {
      const next = original
        ? zones.map(z => (z.code === original ? { code, name: editingZone.name || '', color: editingZone.color || 'stone' } : z))
        : [...zones, { code, name: editingZone.name || '', color: editingZone.color || 'stone' }];

      await setDoc(
        doc(firestore!, 'users', adminUid!, 'stores', currentStoreId),
        { zones: next },
        { merge: true }
      );

      // Renommer une zone doit suivre sur ses emplacements, sinon leurs codes pointent vers
      // une zone qui n'existe plus et ils disparaissent de la grille.
      if (original && code !== original) {
        const affected = storeLocations.filter(l => l.zone === original);
        if (affected.length > 0) {
          const batch = writeBatch(firestore!);
          for (const loc of affected) {
            batch.update(doc(firestore!, 'users', adminUid!, 'storageLocations', loc.id), {
              zone: code,
              code: buildLocationCode({ zone: code, rack: loc.rack, level: loc.level }),
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      }

      toast({ title: 'Zone enregistrée', description: `Zone ${code} · ${currentStore.name}` });
      setZoneModalOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Enregistrement impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteZone = async (zone: StorageZone) => {
    if (!canWrite || !currentStore) return;
    const inZone = storeLocations.filter(l => l.zone === zone.code);
    const ok = await confirm({
      title: `Supprimer la zone ${zone.code}`,
      description: inZone.length > 0
        ? `${inZone.length} emplacement(s) de cette zone seront également supprimés. Les mouvements déjà rattachés conservent leur code mais ne pointeront plus vers un emplacement configuré.`
        : 'Cette zone ne contient aucun emplacement.',
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await setDoc(
        doc(firestore!, 'users', adminUid!, 'stores', currentStoreId),
        { zones: zones.filter(z => z.code !== zone.code) },
        { merge: true }
      );
      if (inZone.length > 0) {
        const batch = writeBatch(firestore!);
        for (const loc of inZone) {
          batch.delete(doc(firestore!, 'users', adminUid!, 'storageLocations', loc.id));
        }
        await batch.commit();
      }
      toast({ title: 'Zone supprimée', description: `Zone ${zone.code} retirée.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Suppression impossible.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Génération en lot ──────────────────────────────────────────────────────
  const generatedCodes = useMemo(() => generateLocationCodes(generator), [generator]);
  const existingCodes = useMemo(() => new Set(storeLocations.map(l => l.code)), [storeLocations]);
  const newCodes = useMemo(() => generatedCodes.filter(c => !existingCodes.has(c)), [generatedCodes, existingCodes]);

  const handleGenerate = async () => {
    if (!canWrite) return;
    if (newCodes.length === 0) {
      toast({ variant: 'destructive', title: 'Rien à créer', description: 'Tous ces emplacements existent déjà.' });
      return;
    }
    if (newCodes.length > MAX_GENERATED_LOCATIONS) {
      toast({
        variant: 'destructive',
        title: 'Plage trop large',
        description: `${newCodes.length} emplacements d'un coup — limite ${MAX_GENERATED_LOCATIONS}. Réduis la plage de racks ou de niveaux.`,
      });
      return;
    }

    setBusy(true);
    try {
      const zoneCode = normalizeSegment(generator.zone);
      // Créer la zone à la volée si elle n'existe pas encore, pour éviter des emplacements
      // orphelins invisibles dans la grille.
      if (zoneCode && !zones.some(z => z.code === zoneCode)) {
        await setDoc(
          doc(firestore!, 'users', adminUid!, 'stores', currentStoreId),
          { zones: [...zones, { code: zoneCode, name: '', color: ZONE_COLOR_KEYS[zones.length % ZONE_COLOR_KEYS.length] }] },
          { merge: true }
        );
      }

      // writeBatch plafonne à 500 opérations — MAX_GENERATED_LOCATIONS tient dans un seul lot.
      const batch = writeBatch(firestore!);
      const coll = collection(firestore!, 'users', adminUid!, 'storageLocations');
      for (const code of newCodes) {
        const parts = parseLocationCode(code);
        batch.set(doc(coll), {
          storeId: currentStoreId,
          zone: parts.zone,
          rack: parts.rack || null,
          level: parts.level || null,
          code,
          active: true,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();

      toast({ title: '✅ Emplacements créés', description: `${newCodes.length} emplacement(s) ajouté(s) dans ${currentStore?.name}.` });
      setGeneratorOpen(false);
      setGenerator(EMPTY_GENERATOR);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Création impossible.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Emplacement unitaire ───────────────────────────────────────────────────
  const openLocationModal = (loc?: StorageLocation) => {
    setEditingLocation(loc ? { ...loc } : { zone: zones[0]?.code || '', active: true });
    setLocationModalOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!canWrite) return;
    const zone = normalizeSegment(editingLocation.zone);
    if (!zone) {
      toast({ variant: 'destructive', title: 'Zone requise', description: 'Choisis la zone de cet emplacement.' });
      return;
    }
    const code = buildLocationCode({ zone, rack: editingLocation.rack, level: editingLocation.level });
    const duplicate = storeLocations.find(l => l.code === code && l.id !== editingLocation.id);
    if (duplicate) {
      toast({ variant: 'destructive', title: 'Code déjà utilisé', description: `${code} existe déjà dans ${currentStore?.name}.` });
      return;
    }

    const num = (v: any) => (v === '' || v === undefined || v === null ? null : Number(v) || null);
    const payload = {
      storeId: currentStoreId,
      zone,
      rack: normalizeSegment(editingLocation.rack) || null,
      level: normalizeSegment(editingLocation.level) || null,
      code,
      label: editingLocation.label?.trim() || null,
      lengthCm: num(editingLocation.lengthCm),
      widthCm: num(editingLocation.widthCm),
      heightCm: num(editingLocation.heightCm),
      maxPallets: num(editingLocation.maxPallets),
      maxKg: num(editingLocation.maxKg),
      notes: editingLocation.notes?.trim() || null,
      active: editingLocation.active !== false,
      updatedAt: serverTimestamp(),
    };

    setBusy(true);
    try {
      if (editingLocation.id) {
        await updateDoc(doc(firestore!, 'users', adminUid!, 'storageLocations', editingLocation.id), payload);
      } else {
        if (zone && !zones.some(z => z.code === zone)) {
          await setDoc(
            doc(firestore!, 'users', adminUid!, 'stores', currentStoreId),
            { zones: [...zones, { code: zone, name: '', color: ZONE_COLOR_KEYS[zones.length % ZONE_COLOR_KEYS.length] }] },
            { merge: true }
          );
        }
        await addDoc(collection(firestore!, 'users', adminUid!, 'storageLocations'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      toast({ title: 'Emplacement enregistré', description: code });
      setLocationModalOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Enregistrement impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!canWrite || !editingLocation.id) return;
    const occ = occupancy[editingLocation.code || '']?.quantity || 0;
    const ok = await confirm({
      title: `Supprimer ${editingLocation.code}`,
      description: occ > 0
        ? `Cet emplacement contient encore ${occ.toLocaleString('fr-MA')} unité(s) selon les mouvements. Déplace le stock avant de le supprimer, sinon la quantité restera sans adresse.`
        : 'Cet emplacement est vide et peut être supprimé.',
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteDoc(doc(firestore!, 'users', adminUid!, 'storageLocations', editingLocation.id));
      toast({ title: 'Emplacement supprimé', description: editingLocation.code });
      setLocationModalOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Suppression impossible.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Planche d'étiquettes QR ────────────────────────────────────────────────
  const handlePrintLabels = async (zoneCode?: string) => {
    const target = zoneCode
      ? storeLocations.filter(l => l.zone === zoneCode)
      : visibleLocations;

    if (target.length === 0) {
      toast({ variant: 'destructive', title: 'Rien à imprimer', description: 'Aucun emplacement dans cette sélection.' });
      return;
    }

    setBusy(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const labels = await Promise.all(target.map(async loc => ({
        code: loc.code,
        label: loc.label || '',
        dataUrl: await QRCode.toDataURL(locationQrPayload(currentStoreId, loc.code), {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
        }),
      })));

      const win = window.open('', '_blank');
      if (!win) {
        toast({ variant: 'destructive', title: 'Fenêtre bloquée', description: "Autorise les pop-ups pour imprimer les étiquettes." });
        return;
      }

      const storeName = currentStore?.name || currentStoreId;
      const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

      win.document.write(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Étiquettes ${esc(storeName)}${zoneCode ? ` — Zone ${esc(zoneCode)}` : ''}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; color: #1c1917; }
  h1 { font-size: 13px; text-transform: uppercase; letter-spacing: .18em; margin: 0 0 2mm; }
  .meta { font-size: 10px; color: #78716c; margin-bottom: 5mm; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .label { border: 1.5px solid #1c1917; border-radius: 3mm; padding: 3mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .label img { width: 100%; max-width: 34mm; height: auto; display: block; margin: 0 auto 2mm; }
  .code { font-size: 17px; font-weight: 800; letter-spacing: .06em; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .desc { font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #57534e; margin-top: 1mm; min-height: 11px; }
  .store { font-size: 8px; text-transform: uppercase; letter-spacing: .14em; color: #a8a29e; margin-top: 1.5mm; }
  @media print { .no-print { display: none; } }
</style></head><body>
<h1>Étiquettes d'emplacement — ${esc(storeName)}${zoneCode ? ` · Zone ${esc(zoneCode)}` : ''}</h1>
<div class="meta">${labels.length} étiquette(s) · généré le ${new Date().toLocaleDateString('fr-MA')} · à coller sur le rack correspondant</div>
<div class="grid">
${labels.map(l => `  <div class="label">
    <img src="${l.dataUrl}" alt="${esc(l.code)}">
    <div class="code">${esc(l.code)}</div>
    <div class="desc">${esc(l.label)}</div>
    <div class="store">${esc(storeName)}</div>
  </div>`).join('\n')}
</div>
</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e?.message || 'Génération des QR impossible.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (sortedStores.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
        <Warehouse className="w-12 h-12 text-stone-300 mx-auto mb-4" />
        <p className="text-stone-600 font-black uppercase text-xs tracking-widest">Aucun lieu de stockage</p>
        <p className="text-stone-400 text-[11px] font-medium mt-1">Crée d'abord un entrepôt dans Paramètres.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Adressage physique</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Emplacements <span className="text-blue-400">de Stockage</span>
            </h2>
            <p className="text-stone-400 text-xs mt-2 max-w-lg">
              Découpe n'importe quel lieu — entrepôt <em>ou</em> magasin — en zones, racks et
              niveaux. Chaque emplacement porte un code (A-03-02) et un QR code à imprimer et
              coller sur le rack réel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { label: 'Zones', value: stats.zones, cls: 'text-white' },
              { label: 'Emplacements', value: stats.total, cls: 'text-white' },
              { label: 'Occupés', value: stats.occupied, cls: 'text-emerald-400' },
              { label: 'Libres', value: stats.free, cls: 'text-stone-300' },
            ].map(s => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">{s.label}</p>
                <p className={`text-2xl font-black mt-0.5 ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sélecteur de lieu */}
      <div className="flex flex-wrap gap-2">
        {sortedStores.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveStoreId(s.id); setSearch(''); }}
            className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${
              s.id === currentStoreId
                ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            {s.type === 'WAREHOUSE' ? '📦' : '🏪'} {s.name}
            <span className="ml-2 opacity-60">
              {(locations || []).filter(l => l.storeId === s.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Barre d'actions */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-900">
              Zones de {currentStore?.name}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handlePrintLabels()}
              disabled={busy || storeLocations.length === 0}
              variant="outline"
              className="h-9 rounded-xl text-[10px] font-black uppercase tracking-widest border-stone-200 gap-2"
            >
              <QrCode className="w-3.5 h-3.5" /> Imprimer les étiquettes
            </Button>
            {canWrite && (
              <>
                <Button
                  onClick={() => { setGenerator({ ...EMPTY_GENERATOR, zone: zones[0]?.code || 'A' }); setGeneratorOpen(true); }}
                  disabled={busy}
                  className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest gap-2"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Générer en lot
                </Button>
                <Button
                  onClick={() => openLocationModal()}
                  disabled={busy}
                  className="h-9 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase tracking-widest gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Emplacement
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {zones.map(z => {
            const c = zoneColor(z);
            const count = storeLocations.filter(l => l.zone === z.code).length;
            return (
              <div key={z.code} className={`group flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border ${c.bg} ${c.border}`}>
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className={`text-[11px] font-black uppercase tracking-widest ${c.text}`}>{z.code}</span>
                {z.name && <span className="text-[10px] font-bold text-stone-500">{z.name}</span>}
                <span className="text-[10px] font-black text-stone-400">{count}</span>
                <button
                  onClick={() => handlePrintLabels(z.code)}
                  disabled={busy || count === 0}
                  title={`Imprimer les étiquettes de la zone ${z.code}`}
                  className="p-1 rounded-md text-stone-400 hover:text-blue-600 hover:bg-white transition-colors disabled:opacity-30"
                >
                  <QrCode className="w-3 h-3" />
                </button>
                {canWrite && (
                  <>
                    <button onClick={() => openZoneModal(z)} className="p-1 rounded-md text-stone-400 hover:text-stone-900 hover:bg-white transition-colors">
                      <Save className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDeleteZone(z)} className="p-1 rounded-md text-stone-400 hover:text-red-600 hover:bg-white transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {canWrite && (
            <button
              onClick={() => openZoneModal()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-stone-200 text-[11px] font-black uppercase tracking-widest text-stone-400 hover:border-stone-400 hover:text-stone-700 transition-colors"
            >
              <Plus className="w-3 h-3" /> Zone
            </button>
          )}
          {zones.length === 0 && !canWrite && (
            <p className="text-[11px] font-bold text-stone-400 uppercase">Aucune zone configurée</p>
          )}
        </div>
      </div>

      {/* Recherche */}
      {storeLocations.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer par code ou libellé — ex: A-03"
            className="h-12 pl-11 rounded-2xl border-stone-200 font-bold"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Grille des emplacements */}
      {storeLocations.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
          <Grid3x3 className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600 font-black uppercase text-xs tracking-widest">Aucun emplacement dans {currentStore?.name}</p>
          <p className="text-stone-400 text-[11px] font-medium mt-1 max-w-md mx-auto">
            Commence par « Générer en lot » : choisis une zone, une plage de racks et de niveaux,
            et tous les emplacements sont créés d'un coup.
          </p>
        </div>
      ) : visibleLocations.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
          <p className="text-stone-500 font-black uppercase text-xs tracking-widest">Aucun emplacement ne correspond à « {search} »</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([zoneCode, racks]) => {
              const zone = zones.find(z => z.code === zoneCode);
              const c = zoneColor(zone);
              return (
                <div key={zoneCode} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                  <div className={`flex items-center gap-3 px-5 py-3 border-b ${c.bg} ${c.border}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    <h3 className={`text-sm font-black uppercase tracking-widest ${c.text}`}>Zone {zoneCode}</h3>
                    {zone?.name && <span className="text-[11px] font-bold text-stone-500">{zone.name}</span>}
                    <span className="ml-auto text-[10px] font-black text-stone-400 uppercase tracking-widest">
                      {Object.values(racks).flat().length} emplacement(s)
                    </span>
                  </div>
                  <div className="p-5 space-y-4">
                    {Object.entries(racks)
                      .sort(([a], [b]) => compareLocationCodes(a, b))
                      .map(([rackCode, locs]) => (
                        <div key={rackCode}>
                          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">
                            {rackCode === '—' ? 'Sans rack' : `Rack ${rackCode}`}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                            {locs.map(loc => {
                              const occ = occupancy[loc.code];
                              const qty = occ?.quantity || 0;
                              const inactive = loc.active === false;
                              return (
                                <button
                                  key={loc.id}
                                  onClick={() => openLocationModal(loc)}
                                  className={`text-left p-3 rounded-xl border-2 transition-all hover:shadow-md hover:scale-[1.02] ${
                                    inactive
                                      ? 'bg-stone-50 border-stone-200 opacity-60'
                                      : qty > 0
                                        ? 'bg-emerald-50 border-emerald-300'
                                        : 'bg-white border-stone-200 hover:border-stone-400'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono text-xs font-black text-stone-900">{loc.code}</span>
                                    {inactive
                                      ? <EyeOff className="w-3 h-3 text-stone-400 shrink-0" />
                                      : qty > 0
                                        ? <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                        : <MapPin className="w-3 h-3 text-stone-300 shrink-0" />}
                                  </div>
                                  {loc.label && (
                                    <p className="text-[9px] font-bold text-stone-500 uppercase truncate mt-0.5">{loc.label}</p>
                                  )}
                                  <p className={`text-[10px] font-black mt-1 ${qty > 0 ? 'text-emerald-700' : 'text-stone-300'}`}>
                                    {qty > 0
                                      ? `${qty.toLocaleString('fr-MA')} u. · ${occ?.references} réf.`
                                      : 'Libre'}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── Modal Zone ── */}
      <Dialog open={zoneModalOpen} onOpenChange={setZoneModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Zone de stockage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Code de la zone</label>
              <Input
                value={editingZone.code}
                onChange={e => setEditingZone(z => ({ ...z, code: e.target.value }))}
                placeholder="A"
                className="h-12 rounded-xl font-black font-mono uppercase text-lg"
              />
              <p className="text-[11px] text-stone-400 font-bold">Court et parlant : A, B, RECEPTION, EXPEDITION…</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Contenu de la zone</label>
              <Input
                value={editingZone.name || ''}
                onChange={e => setEditingZone(z => ({ ...z, name: e.target.value }))}
                placeholder="Ex: Fils · Fermetures · Tissus volumineux"
                className="h-12 rounded-xl font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Couleur</label>
              <div className="flex flex-wrap gap-2">
                {ZONE_COLOR_KEYS.map(k => {
                  const c = zoneColor({ code: '', color: k });
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditingZone(z => ({ ...z, color: k }))}
                      className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all ${
                        editingZone.color === k ? 'border-stone-900 scale-110' : 'border-stone-200'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.dot}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setZoneModalOpen(false)} disabled={busy} className="rounded-xl text-[10px] font-black uppercase">Annuler</Button>
            <Button onClick={handleSaveZone} disabled={busy} className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-8">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Enregistrer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Générateur ── */}
      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-blue-500" /> Générer des emplacements
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Zone</label>
              <Input
                value={generator.zone}
                onChange={e => setGenerator(g => ({ ...g, zone: e.target.value }))}
                placeholder="A"
                list="zone-codes"
                className="h-12 rounded-xl font-black font-mono uppercase"
              />
              <datalist id="zone-codes">
                {zones.map(z => <option key={z.code} value={z.code}>{z.name}</option>)}
              </datalist>
              <p className="text-[11px] text-stone-400 font-bold">La zone est créée automatiquement si elle n'existe pas encore.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Rack — de</label>
                <Input type="number" min={1} value={generator.rackFrom}
                  onChange={e => setGenerator(g => ({ ...g, rackFrom: Number(e.target.value) || 1 }))}
                  className="h-11 rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Rack — à</label>
                <Input type="number" min={1} value={generator.rackTo}
                  onChange={e => setGenerator(g => ({ ...g, rackTo: Number(e.target.value) || 1 }))}
                  className="h-11 rounded-xl font-bold" />
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
              <input
                type="checkbox"
                checked={generator.withLevels}
                onChange={e => setGenerator(g => ({ ...g, withLevels: e.target.checked }))}
                className="w-4 h-4 accent-blue-600"
              />
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-stone-700">Découper en niveaux</p>
                <p className="text-[10px] font-bold text-stone-400">Décoche pour du stockage au sol (une adresse par rack).</p>
              </div>
            </label>

            {generator.withLevels && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Niveau — de</label>
                  <Input type="number" min={1} value={generator.levelFrom}
                    onChange={e => setGenerator(g => ({ ...g, levelFrom: Number(e.target.value) || 1 }))}
                    className="h-11 rounded-xl font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Niveau — à</label>
                  <Input type="number" min={1} value={generator.levelTo}
                    onChange={e => setGenerator(g => ({ ...g, levelTo: Number(e.target.value) || 1 }))}
                    className="h-11 rounded-xl font-bold" />
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Aperçu</p>
              <p className="text-2xl font-black text-blue-900 mt-1">
                {newCodes.length} <span className="text-sm font-bold">nouvel(le)s adresse(s)</span>
              </p>
              {generatedCodes.length !== newCodes.length && (
                <p className="text-[11px] font-bold text-blue-600 mt-0.5">
                  {generatedCodes.length - newCodes.length} déjà existante(s), elles seront ignorées.
                </p>
              )}
              {newCodes.length > 0 && (
                <p className="text-[11px] font-mono font-bold text-blue-700 mt-2 leading-relaxed break-all">
                  {newCodes.slice(0, 8).join(' · ')}{newCodes.length > 8 ? ` · … · ${newCodes[newCodes.length - 1]}` : ''}
                </p>
              )}
              {newCodes.length > MAX_GENERATED_LOCATIONS && (
                <p className="text-[11px] font-black text-red-600 uppercase mt-2">
                  Limite de {MAX_GENERATED_LOCATIONS} par lot dépassée — réduis la plage.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGeneratorOpen(false)} disabled={busy} className="rounded-xl text-[10px] font-black uppercase">Annuler</Button>
            <Button
              onClick={handleGenerate}
              disabled={busy || newCodes.length === 0 || newCodes.length > MAX_GENERATED_LOCATIONS}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-8"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Créer {newCodes.length}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Emplacement ── */}
      <Dialog open={locationModalOpen} onOpenChange={setLocationModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              {editingLocation.id ? editingLocation.code : 'Nouvel emplacement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Zone</label>
                <Input value={editingLocation.zone || ''} list="zone-codes-loc"
                  onChange={e => setEditingLocation(l => ({ ...l, zone: e.target.value }))}
                  className="h-11 rounded-xl font-black font-mono uppercase" />
                <datalist id="zone-codes-loc">
                  {zones.map(z => <option key={z.code} value={z.code}>{z.name}</option>)}
                </datalist>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Rack</label>
                <Input value={editingLocation.rack || ''}
                  onChange={e => setEditingLocation(l => ({ ...l, rack: e.target.value }))}
                  placeholder="03" className="h-11 rounded-xl font-bold font-mono" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Niveau</label>
                <Input value={editingLocation.level || ''}
                  onChange={e => setEditingLocation(l => ({ ...l, level: e.target.value }))}
                  placeholder="02" className="h-11 rounded-xl font-bold font-mono" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-900 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500">Code généré</p>
              <p className="font-mono text-xl font-black text-white tracking-widest mt-0.5">
                {buildLocationCode({
                  zone: normalizeSegment(editingLocation.zone),
                  rack: editingLocation.rack,
                  level: editingLocation.level,
                }) || '—'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Libellé (optionnel)</label>
              <Input value={editingLocation.label || ''}
                onChange={e => setEditingLocation(l => ({ ...l, label: e.target.value }))}
                placeholder="Ex: Fils 40/2 rouges" className="h-11 rounded-xl font-bold" />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5 mb-2">
                <Ruler className="w-3 h-3" /> Dimensions (cm)
              </p>
              <div className="grid grid-cols-3 gap-3">
                {([['lengthCm', 'Longueur'], ['widthCm', 'Largeur'], ['heightCm', 'Hauteur']] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase text-stone-400">{label}</label>
                    <Input type="number" min={0} value={(editingLocation as any)[key] ?? ''}
                      onChange={e => setEditingLocation(l => ({ ...l, [key]: e.target.value }))}
                      className="h-11 rounded-xl font-bold" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5 mb-2">
                <Package className="w-3 h-3" /> Capacité
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase text-stone-400">Palettes max.</label>
                  <Input type="number" min={0} value={editingLocation.maxPallets ?? ''}
                    onChange={e => setEditingLocation(l => ({ ...l, maxPallets: e.target.value as any }))}
                    className="h-11 rounded-xl font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase text-stone-400">Charge max. (kg)</label>
                  <Input type="number" min={0} value={editingLocation.maxKg ?? ''}
                    onChange={e => setEditingLocation(l => ({ ...l, maxKg: e.target.value as any }))}
                    className="h-11 rounded-xl font-bold" />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
              <input type="checkbox" checked={editingLocation.active !== false}
                onChange={e => setEditingLocation(l => ({ ...l, active: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-stone-700">Emplacement actif</p>
                <p className="text-[10px] font-bold text-stone-400">Un emplacement inactif n'est plus proposé lors des entrées en stock.</p>
              </div>
            </label>

            {editingLocation.code && occupancy[editingLocation.code] && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Contenu actuel</p>
                <p className="text-sm font-black text-emerald-900 mt-0.5">
                  {occupancy[editingLocation.code].quantity.toLocaleString('fr-MA')} unité(s) ·{' '}
                  {occupancy[editingLocation.code].references} référence(s)
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            {editingLocation.id && canWrite && (
              <Button variant="outline" onClick={handleDeleteLocation} disabled={busy}
                className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-[10px] font-black uppercase gap-2">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </Button>
            )}
            <Button variant="ghost" onClick={() => setLocationModalOpen(false)} disabled={busy} className="rounded-xl text-[10px] font-black uppercase ml-auto">Annuler</Button>
            {canWrite && (
              <Button onClick={handleSaveLocation} disabled={busy} className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-8">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Enregistrer</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
