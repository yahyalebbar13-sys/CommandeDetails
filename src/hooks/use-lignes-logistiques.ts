'use client';

// ─── Lignes logistiques de l'administrateur ───────────────────────────────────
// Lit les définitions enregistrées (`users/{uid}.lignesLogistiques`) et les
// croise avec les pôles (cf. lib/lignes-logistiques.ts). `definirLigne` est le
// SEUL chemin pour changer les spécifications d'une ligne : il enregistre la
// ligne et recopie la spécification sur tous ses pôles, dans une même écriture.

import { useCallback, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { GeneralCategory } from '@/lib/types';
import {
  cleLigne, listerLignes, specPourLigne, trouverLigne,
  type LignesEnregistrees, type LigneLogistique, type SpecType,
} from '@/lib/lignes-logistiques';

export function useLignesLogistiques(poles: GeneralCategory[] | null | undefined) {
  const { user } = useUser();
  const firestore = useFirestore();

  const refAdmin = useMemoFirebase(
    () => (user && firestore ? doc(firestore, 'users', user.uid) : null),
    [user, firestore],
  );
  const { data } = useDoc<{ lignesLogistiques?: LignesEnregistrees }>(refAdmin);

  const listePoles = useMemo(() => poles || [], [poles]);
  const lignes: LigneLogistique[] = useMemo(
    () => listerLignes(data?.lignesLogistiques, listePoles),
    [data?.lignesLogistiques, listePoles],
  );

  /**
   * Enregistre (ou redéfinit) la ligne `nom` avec ces spécifications, et les
   * applique à tous ses pôles. Renvoie le nombre de pôles mis à jour.
   */
  const definirLigne = useCallback(async (nom: string, specType: SpecType): Promise<number> => {
    if (!user || !firestore) throw new Error('Connexion requise');
    const propre = nom.trim();
    if (!propre) throw new Error('Nom de ligne manquant');
    // Une ligne déjà connue garde son écriture : « zipper » tapé à la main
    // rejoint « Zipper », il n'en crée pas une deuxième.
    const nomRetenu = trouverLigne(lignes, propre)?.nom ?? propre;

    const lot = writeBatch(firestore);
    // `id` : la règle Firestore l'exige si le document de l'admin n'existe pas encore.
    lot.set(doc(firestore, 'users', user.uid), {
      id: user.uid,
      lignesLogistiques: { [nomRetenu]: { specType } },
    }, { merge: true });

    const aMettreAJour = listePoles.filter(p => cleLigne(p.line) === cleLigne(nomRetenu) && (p.specType || 'none') !== specType);
    aMettreAJour.forEach(p => {
      lot.update(doc(firestore, 'users', user.uid, 'generalCategories', p.id), { specType });
    });
    await lot.commit();
    return aMettreAJour.length;
  }, [user, firestore, lignes, listePoles]);

  return {
    lignes,
    /** Spécifications qu'un pôle de cette ligne doit recevoir. */
    specPourLigne: useCallback((nom?: string | null) => specPourLigne(lignes, nom), [lignes]),
    trouverLigne: useCallback((nom?: string | null) => trouverLigne(lignes, nom), [lignes]),
    definirLigne,
  };
}
