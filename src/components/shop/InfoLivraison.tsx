"use client";

import React from "react";
import { Truck } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import {
  RESUME_FRAIS, RESUME_FRAIS_AR,
  TEXTE_TRANSPORT_VOLUMINEUX, TEXTE_TRANSPORT_VOLUMINEUX_AR, TEXTE_VOLUMINEUX_COURT, TEXTE_VOLUMINEUX_COURT_AR,
} from "@/lib/livraison-boutique";

// Ce que coûte la réception, la ville n'étant pas encore connue (panier) : la
// grille des colis et le retrait gratuit. Plus de livraison offerte depuis le
// 30/09/2026, donc plus de barre « plus que X DH ».
// Un panier avec un rouleau entier ne part pas par colis Sendit : on affiche à la
// place la notice du transport.
// En `compact` (pied du tiroir, toujours visible), une seule ligne : la notice
// complète y écrasait la liste des articles sur un petit téléphone.
export default function InfoLivraison({
  compact = false,
  volumineux = false,
}: {
  compact?: boolean;
  volumineux?: boolean;
}) {
  const { language } = useLanguage();
  const ar = language === "ar";

  if (volumineux) {
    const texte = compact
      ? ar ? TEXTE_VOLUMINEUX_COURT_AR : TEXTE_VOLUMINEUX_COURT
      : ar ? TEXTE_TRANSPORT_VOLUMINEUX_AR : TEXTE_TRANSPORT_VOLUMINEUX;
    return (
      <div className={`flex gap-2 rounded-xl border bg-amber-50 border-amber-200 ${compact ? "px-3 py-2" : "px-4 py-3"}`} dir={ar ? "rtl" : "ltr"}>
        <Truck className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-700" />
        <p className={`text-[#2A2A2A] leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>{texte}</p>
      </div>
    );
  }

  if (compact) return null;

  return (
    <div className="flex gap-2 rounded-xl border bg-[#FBF8F3] border-[#E8E4DF] px-4 py-3" dir={ar ? "rtl" : "ltr"}>
      <Truck className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#C8102E]" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold text-[#0F0F0F]">{ar ? "التوصيل بواسطة Sendit" : "Livraison Sendit"}</p>
        <p className="text-[#4A4A4A]">{ar ? RESUME_FRAIS_AR : RESUME_FRAIS}</p>
        <p className="text-[#0F7A55] font-medium">{ar ? "أو استلام مجاني من المحل" : "Ou retrait gratuit en magasin"}</p>
      </div>
    </div>
  );
}
