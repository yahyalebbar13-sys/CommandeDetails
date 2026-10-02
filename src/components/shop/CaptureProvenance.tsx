"use client";

// Note d'où vient le client (publicité, lien partagé, autre site) à la première
// page de sa visite. Ne rend rien. À monter une fois, dans le layout de la boutique.
// Le détail est dans src/lib/provenance-boutique.ts.

import { useEffect } from "react";
import { capturerVisite } from "@/lib/provenance-boutique";

export default function CaptureProvenance() {
  useEffect(() => {
    try {
      capturerVisite();
    } catch { /* jamais bloquant pour la page */ }
  }, []);
  return null;
}
