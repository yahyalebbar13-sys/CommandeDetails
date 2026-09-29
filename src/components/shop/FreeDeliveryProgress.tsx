"use client";

import React from "react";
import { Truck } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { formatPrice, getFreeDeliveryProgress, FREE_DELIVERY_THRESHOLD } from "@/lib/shop-utils";
import {
  TEXTE_TRANSPORT_VOLUMINEUX, TEXTE_TRANSPORT_VOLUMINEUX_AR, TEXTE_VOLUMINEUX_COURT, TEXTE_VOLUMINEUX_COURT_AR,
} from "@/lib/livraison-boutique";

// Paliers de livraison gratuite, la ville n'étant pas encore connue :
// d'abord Casablanca, puis tout le Maroc (seuils dans shop-utils).
// Un panier avec un rouleau entier ne part pas par colis Sendit : la livraison
// offerte ne le concerne pas, on affiche à la place la notice du transport.
// En `compact` (pied du tiroir, toujours visible), une seule ligne : la notice
// complète y écrasait la liste des articles sur un petit téléphone.
export default function FreeDeliveryProgress({
  subtotal,
  compact = false,
  volumineux = false,
}: {
  subtotal: number;
  compact?: boolean;
  volumineux?: boolean;
}) {
  const { t, language } = useLanguage();
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

  const { stage, remaining, progress } = getFreeDeliveryProgress(subtotal);
  const casaUnlocked = stage !== "none";

  const title =
    stage === "everywhere"
      ? t("free_delivery_unlocked")
      : stage === "casablanca"
        ? t("free_delivery_casa_unlocked")
        : t("free_delivery_casa_progress", { amount: formatPrice(remaining) });

  const hint =
    stage === "casablanca"
      ? t("free_delivery_other_progress", { amount: formatPrice(remaining) })
      : stage === "none"
        ? t("free_delivery_other_cities", { amount: formatPrice(FREE_DELIVERY_THRESHOLD) })
        : null;

  return (
    <div
      className={`rounded-xl border ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${
        casaUnlocked ? "bg-emerald-50 border-emerald-200" : "bg-[#D4A843]/10 border-[#D4A843]/30"
      }`}
    >
      <div className={`flex items-center gap-2 font-semibold text-[#0F0F0F] ${compact ? "text-xs" : "text-sm"}`}>
        <Truck className={`w-4 h-4 flex-shrink-0 ${casaUnlocked ? "text-emerald-600" : "text-[#D4A843]"}`} />
        <span>{title}</span>
      </div>
      {stage !== "everywhere" && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-white overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#D4A843] to-[#C8102E] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1.5 text-xs text-[#6B6B6B]">{hint}</p>}
    </div>
  );
}
