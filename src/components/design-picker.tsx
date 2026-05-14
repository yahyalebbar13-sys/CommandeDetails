"use client";

/**
 * DesignPicker — visual selector that loads designs for a given category
 * and lets the user pick one (ref + photo). Sets designRef + designImageUrl on the article.
 *
 * Props:
 *   categoryName   — the subcategory name (e.g. "NYLON ZIPPER NO5") used to look up the Firestore category doc
 *   subCategories  — list of all subcategory docs (to resolve the category ID)
 *   value          — currently selected design ref
 *   onChange       — (ref, imageUrl) => void
 */

import React, { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { BookImage, CheckCircle2, X as XIcon } from 'lucide-react';
import type { Design } from './design-library';

interface DesignPickerProps {
  categoryName: string;
  subCategories: any[];
  value?: string;          // selected design ref
  onChange: (ref: string, imageUrl: string | null) => void;
}

export default function DesignPicker({ categoryName, subCategories, value, onChange }: DesignPickerProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  // Resolve category ID from name
  const categoryId = useMemo(() => {
    const name = (categoryName || '').trim().toLowerCase();
    const cat = (subCategories || []).find((c: any) => (c.name || '').trim().toLowerCase() === name);
    return cat?.id || null;
  }, [categoryName, subCategories]);

  // Load designs for this category
  const designsRef = useMemoFirebase(
    () => user && categoryId
      ? collection(firestore, 'users', user.uid, 'categories', categoryId, 'designs')
      : null,
    [firestore, user, categoryId]
  );

  const { data: rawDesigns } = useCollection(designsRef);
  const designs: Design[] = (rawDesigns || []) as Design[];

  if (!categoryName || designs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
          <BookImage className="w-3 h-3 text-amber-600" />
          Design / Modèle
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('', null)}
            className="text-[9px] font-black text-stone-300 hover:text-red-400 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
          >
            <XIcon className="w-2.5 h-2.5" /> Effacer
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
        {designs.map((design) => {
          const selected = value === design.ref;
          return (
            <button
              key={design.id}
              type="button"
              onClick={() => onChange(design.ref, design.imageUrl || null)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border-2 transition-all p-1.5 ${
                selected
                  ? 'border-amber-500 bg-amber-100 shadow-md shadow-amber-200/60 scale-105'
                  : 'border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50'
              }`}
              style={{ minWidth: 64 }}
            >
              {/* Image or placeholder */}
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-stone-50 flex items-center justify-center">
                {design.imageUrl ? (
                  <img src={design.imageUrl} alt={design.ref} className="w-full h-full object-contain" />
                ) : (
                  <BookImage className="w-6 h-6 text-stone-200" />
                )}
              </div>

              {/* Ref label */}
              <span className={`text-[9px] font-black uppercase leading-tight text-center max-w-[56px] break-words ${
                selected ? 'text-amber-800' : 'text-stone-600'
              }`}>
                {design.ref}
              </span>

              {/* Selected checkmark */}
              {selected && (
                <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Design sélectionné : {value}
        </p>
      )}
    </div>
  );
}
