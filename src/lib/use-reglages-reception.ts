"use client";

// Réglages de réception (magasins de retrait, RIB, camionnette, carte) côté boutique.
//
// Lus UNE fois par chargement de page dans shop_catalogue_settings/reception
// (lecture publique), puis gardés en mémoire : le checkout, la confirmation et le
// suivi s'en servent sans relire Firestore. Tant que la lecture n'a pas répondu,
// ou si elle échoue (hors ligne, document absent), on affiche les valeurs par
// défaut : le client ne doit jamais rester bloqué sur un écran vide. Le virement
// par défaut est désactivé : sans RIB lu et valable, on ne le propose pas.

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-db";
import {
  CHEMIN_REGLAGES_RECEPTION,
  REGLAGES_RECEPTION_DEFAUT,
  lireReglagesReception,
  type ReglagesReception,
} from "@/lib/reglages-reception";

let enCache: ReglagesReception | null = null;
let lectureEnCours: Promise<ReglagesReception> | null = null;

function chargerReglages(): Promise<ReglagesReception> {
  if (enCache) return Promise.resolve(enCache);
  if (lectureEnCours) return lectureEnCours;
  const lecture = getDoc(doc(db, CHEMIN_REGLAGES_RECEPTION.collection, CHEMIN_REGLAGES_RECEPTION.document))
    .then((snap) => {
      const lus = lireReglagesReception(snap.exists() ? snap.data() : null);
      enCache = lus;
      return lus;
    })
    .catch(() => {
      // Échec : on retentera au prochain chargement de page, pas en boucle.
      lectureEnCours = null;
      return REGLAGES_RECEPTION_DEFAUT;
    });
  lectureEnCours = lecture;
  return lecture;
}

/**
 * `reglages` vaut les valeurs par défaut tant que `charge` est faux.
 * N'affichez un RIB que lorsque `charge` est vrai (sinon il serait vide).
 */
export function useReglagesReception(): { reglages: ReglagesReception; charge: boolean } {
  const [reglages, setReglages] = useState<ReglagesReception>(enCache ?? REGLAGES_RECEPTION_DEFAUT);
  const [charge, setCharge] = useState<boolean>(!!enCache);

  useEffect(() => {
    if (enCache) return;
    let actif = true;
    chargerReglages().then((r) => {
      if (!actif) return;
      setReglages(r);
      setCharge(true);
    });
    return () => {
      actif = false;
    };
  }, []);

  return { reglages, charge };
}
