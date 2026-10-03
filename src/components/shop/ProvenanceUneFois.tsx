"use client";

import { useEffect, useState } from "react";
import CaptureProvenance from "@/components/shop/CaptureProvenance";

// CaptureProvenance une seule fois par chargement de page, comme capturerVisite le demande.
// La coque de la boutique (CoqueBoutique) est remontée à chaque passage /shop ↔ /ar : ce sont
// deux layouts. Sans cette garde, la visite serait relue en pleine navigation (le référent est
// toujours le site d'origine) et la publicité d'arrivée (utm_…) remplacée par une source sans
// campagne. Un vrai rechargement remet la variable à zéro : nouvelle capture, comme avant /ar.
let dejaMontee = false;

export default function ProvenanceUneFois() {
  const [monter] = useState(() => !dejaMontee);
  useEffect(() => {
    dejaMontee = true;
  }, []);
  return monter ? <CaptureProvenance /> : null;
}
