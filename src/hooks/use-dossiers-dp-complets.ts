"use client";

// Les dossiers dont la déclaration provisoire a un PU sur chaque ligne
// (lib/cout-de-vente, dpComplete). Coût de Vente et Coût de Revient
// n'affichent que ceux-là : un PU manquant fausserait leurs chiffres.
// Suivi en direct : un PU saisi dans Déc. Prov. fait apparaître le dossier.

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { dpComplete } from '@/lib/cout-de-vente';

export function useDossiersDpComplets(
  articles: any[],
  factures: any[],
  subCategories: any[],
  generalCategories: any[],
  actif = true,
): { complets: Set<string>; charge: boolean } {
  const { user, firestore } = useFirebase();
  const [puMaps, setPuMaps] = useState<Record<string, Record<string, string>> | null>(null);

  useEffect(() => {
    if (!actif || !firestore || !user) return;
    return onSnapshot(
      collection(firestore, 'users', user.uid, 'dp_declarations'),
      snap => {
        const r: Record<string, Record<string, string>> = {};
        snap.docs.forEach(d => { r[d.id] = d.data().puMap || {}; });
        setPuMaps(r);
      },
      () => setPuMaps({}),
    );
  }, [actif, firestore, user]);

  const complets = useMemo(() => {
    const ids = new Set<string>();
    if (!puMaps) return ids;
    const parDossier = new Map<string, any[]>();
    for (const a of articles) {
      if (!a?.factureId) continue;
      const l = parDossier.get(a.factureId);
      if (l) l.push(a); else parDossier.set(a.factureId, [a]);
    }
    for (const f of factures) {
      if (dpComplete(parDossier.get(f.id) || [], subCategories, generalCategories, puMaps[f.id] || {})) ids.add(f.id);
    }
    return ids;
  }, [puMaps, articles, factures, subCategories, generalCategories]);

  return { complets, charge: puMaps !== null };
}
