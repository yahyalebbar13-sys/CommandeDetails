"use client";

import React, { useState, useCallback } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import {
  ImagePlus, Trash2, Loader2, Plus, X as XIcon,
  BookImage, Tag, Pencil, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

interface DesignLibraryProps {
  categoryId: string;          // Firestore category doc ID
  categoryName: string;        // Display name (e.g. "NYLON ZIPPER NO5")
}

export interface Design {
  id: string;
  ref: string;
  description?: string;
  imageUrl?: string;
  createdAt?: any;
}

// ── Hook to load designs for a category ─────────────────────────────────────
export function useCategoryDesigns(categoryId: string | null) {
  const { user } = useUser();
  const firestore = useFirestore();

  const ref = useMemoFirebase(
    () => user && categoryId
      ? collection(firestore, 'users', user.uid, 'categories', categoryId, 'designs')
      : null,
    [firestore, user, categoryId]
  );

  const { data: rawDesigns = [], isLoading } = useCollection(ref);
  return { designs: (rawDesigns || []) as Design[], isLoading };
}

// ── Design Library Manager UI ────────────────────────────────────────────────
export default function DesignLibrary({ categoryId, categoryName }: DesignLibraryProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { designs } = useCategoryDesigns(categoryId);

  // ── Add new design form ──
  const [showForm, setShowForm] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  // ── Edit description in-place ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; id?: string; name?: string; design?: any}>({open: false});

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Format invalide', description: 'Sélectionnez une image.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Fichier trop grand', description: 'Maximum 5 MB.' });
      return;
    }
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleAddDesign = async () => {
    if (!user || !firestore || !newRef.trim()) {
      toast({ variant: 'destructive', title: 'Référence requise', description: 'Entrez une référence pour ce design.' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const designId = `design_${Date.now()}`;
      let imageUrl: string | undefined;

      if (pendingFile) {
        const storage = getStorage(getApp());
        const path = `users/${user.uid}/categories/${categoryId}/designs/${designId}`;
        const imgRef = storageRef(storage, path);
        const task = uploadBytesResumable(imgRef, pendingFile);

        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => {
              imageUrl = await getDownloadURL(task.snapshot.ref);
              resolve();
            }
          );
        });
      }

      const docRef = doc(firestore, 'users', user.uid, 'categories', categoryId, 'designs', designId);
      setDocumentNonBlocking(docRef, {
        ref: newRef.trim().toUpperCase(),
        description: newDesc.trim(),
        imageUrl: imageUrl || null,
        createdAt: serverTimestamp(),
      }, { merge: false });

      toast({ title: '✅ Design ajouté', description: `Référence ${newRef.trim().toUpperCase()} enregistrée.` });

      // Reset form
      setNewRef('');
      setNewDesc('');
      setPendingFile(null);
      setPendingPreview(null);
      setShowForm(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDesign = async (design: Design) => {
    if (!user || !firestore) return;
    setDeleteConfirm({ open: true, id: design.id, name: design.ref, design });
  };

  const handleSaveDesc = (design: Design) => {
    if (!user || !firestore) return;
    const docRef = doc(firestore, 'users', user.uid, 'categories', categoryId, 'designs', design.id);
    updateDocumentNonBlocking(docRef, { description: editingDesc.trim() });
    setEditingId(null);
    toast({ title: 'Description mise à jour' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl border border-amber-200">
            <BookImage className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">Catalogue Designs</p>
            <p className="text-sm font-black text-stone-900 uppercase leading-none">{categoryName}</p>
          </div>
          <span className="ml-2 text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-widest">
            {designs.length} design{designs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm(v => !v)}
          className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[9px] tracking-widest h-8 px-4 rounded-xl gap-1.5"
        >
          {showForm ? <XIcon className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Annuler' : 'Nouveau Design'}
        </Button>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <div className="bg-stone-50 border-2 border-amber-200 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nouveau design
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: fields */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Référence *
                </label>
                <Input
                  value={newRef}
                  onChange={e => setNewRef(e.target.value.toUpperCase())}
                  placeholder="Ex: Y-15, D3, SLIDER-NO5-NI..."
                  className="font-black uppercase border-amber-200 focus:border-amber-400 bg-white text-sm"
                  disabled={uploading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Description (optionnel)</label>
                <Input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Ex: Nylon No5 — Argent brillant..."
                  className="border-stone-200 bg-white text-sm"
                  disabled={uploading}
                />
              </div>
            </div>

            {/* Right: image drop */}
            <div>
              <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block mb-1">
                Photo du design
              </label>
              <label className={`flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden
                ${uploading ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50'}`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2 w-full px-6">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    <div className="w-full bg-stone-200 rounded-full h-1.5">
                      <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-amber-600">{uploadProgress}%</span>
                  </div>
                ) : pendingPreview ? (
                  <div className="relative w-full h-full">
                    <img src={pendingPreview} alt="preview" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setPendingFile(null); setPendingPreview(null); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6 text-stone-300 mb-1" />
                    <span className="text-[9px] font-bold text-stone-300 uppercase">Cliquer pour ajouter</span>
                    <span className="text-[8px] text-stone-200">JPG, PNG, WEBP · max 5 MB</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-amber-100">
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setPendingFile(null); setPendingPreview(null); setNewRef(''); setNewDesc(''); }}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddDesign}
              disabled={uploading || !newRef.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[9px] tracking-widest gap-1.5"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer le Design
            </Button>
          </div>
        </div>
      )}

      {/* ── Design grid ── */}
      {designs.length === 0 && !showForm ? (
        <div className="text-center py-10 text-stone-300 font-bold uppercase text-[9px] tracking-widest border-2 border-dashed border-stone-100 rounded-2xl">
          Aucun design enregistré — cliquez sur « Nouveau Design » pour commencer
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {designs.map((design) => (
            <div key={design.id} className="group bg-white rounded-xl border border-stone-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              {/* Image */}
              <div className="w-full h-28 bg-stone-50 flex items-center justify-center overflow-hidden border-b border-stone-50 relative">
                {design.imageUrl ? (
                  <img src={design.imageUrl} alt={design.ref} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <BookImage className="w-8 h-8 text-stone-200" />
                    <span className="text-[8px] font-bold text-stone-200 uppercase">Pas de photo</span>
                  </div>
                )}
                {/* Delete overlay */}
                <button
                  type="button"
                  onClick={() => handleDeleteDesign(design)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Info */}
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-black text-stone-900 uppercase truncate leading-none">{design.ref}</p>
                  <button
                    type="button"
                    onClick={() => { setEditingId(design.id); setEditingDesc(design.description || ''); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil className="w-3 h-3 text-stone-300 hover:text-amber-600" />
                  </button>
                </div>
                {editingId === design.id ? (
                  <div className="flex gap-1">
                    <Input
                      value={editingDesc}
                      onChange={e => setEditingDesc(e.target.value)}
                      className="h-6 text-[9px] px-1.5 border-amber-300"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveDesc(design); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <button type="button" onClick={() => handleSaveDesc(design)} className="shrink-0 w-6 h-6 bg-amber-500 rounded flex items-center justify-center hover:bg-amber-600">
                      <Check className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  design.description && (
                    <p className="text-[8px] text-stone-400 font-medium leading-tight truncate">{design.description}</p>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => !o && setDeleteConfirm({open: false})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer définitivement "{deleteConfirm.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (deleteConfirm.design && user && firestore) {
                const design = deleteConfirm.design;
                try {
                  if (design.imageUrl) {
                    const storage = getStorage(getApp());
                    await deleteObject(storageRef(storage, `users/${user.uid}/categories/${categoryId}/designs/${design.id}`)).catch(() => {});
                  }
                  await deleteDoc(doc(firestore, 'users', user.uid, 'categories', categoryId, 'designs', design.id));
                  toast({ title: 'Design supprimé', description: design.ref });
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Erreur', description: err.message });
                }
              }
            }} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
