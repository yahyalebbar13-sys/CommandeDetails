"use client";

import React from "react";
import Link from "next/link";
import { Banknote, ChevronRight, Store, Truck } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import {
  FRAIS_ZONE, LIBELLE_ZONE, LIBELLE_ZONE_AR, RESUME_FRAIS, RESUME_FRAIS_AR,
  TEXTE_TRANSPORT_VOLUMINEUX, TEXTE_TRANSPORT_VOLUMINEUX_AR, TEXTE_VOLUMINEUX_COURT, TEXTE_VOLUMINEUX_COURT_AR,
  delaiZone, libelleFrais, type ZoneLivraison,
} from "@/lib/livraison-boutique";

const ZONES: ZoneLivraison[] = ["casablanca", "standard", "eloignee"];

// Ce que coûte la réception, la ville n'étant pas encore connue (panier) : la
// grille des colis et le retrait gratuit. Plus de livraison offerte depuis le
// 30/09/2026, donc plus de barre « plus que X DH ».
// Un panier avec un rouleau entier ne part pas par colis Sendit : on affiche à la
// place la notice du transport.
// En `compact` (pied du tiroir, toujours visible), une seule ligne : la notice
// complète y écrasait la liste des articles sur un petit téléphone.
// En `fiche` (fiche produit) : la grille ville par ville avec les délais, le retrait
// gratuit et le paiement à la livraison. Le transporteur n'est jamais nommé.
export default function InfoLivraison({
  compact = false,
  volumineux = false,
  fiche = false,
}: {
  compact?: boolean;
  volumineux?: boolean;
  fiche?: boolean;
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

  if (fiche) {
    return (
      <div className="rounded-2xl border border-[#E8E4DF] bg-[#FBF8F3] p-4 space-y-3" dir={ar ? "rtl" : "ltr"}>
        <div>
          <p className="flex items-center gap-2 text-base font-bold text-[#0F0F0F]">
            <Truck className="size-5 shrink-0 text-[#C8102E]" />
            {ar ? "التوصيل إلى المنزل في كل المدن" : "Livraison à domicile dans toutes les villes"}
          </p>
          <ul className="mt-2 divide-y divide-[#E8E4DF]">
            {ZONES.map(zone => (
              <li key={zone} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#0F0F0F]">{ar ? LIBELLE_ZONE_AR[zone] : LIBELLE_ZONE[zone]}</span>
                  <span className="block text-sm text-[#4A4A4A]">{delaiZone(zone, language)}</span>
                </span>
                <bdi className="shrink-0 text-base font-black text-[#0F0F0F]">{libelleFrais(FRAIS_ZONE[zone], language)}</bdi>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0F7A55]">
          <Store className="size-5 shrink-0" />
          {ar ? "استلام مجاني من محلنا بالدار البيضاء" : "Retrait gratuit en magasin, à Casablanca"}
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0F0F0F]">
          <Banknote className="size-5 shrink-0 text-[#0F7A55]" />
          {ar ? "الدفع عند الاستلام" : "Paiement à la livraison"}
        </p>
        <Link href="/shop/livraison" className="inline-flex items-center gap-1 min-h-11 text-sm font-bold text-[#C8102E] hover:underline">
          {ar ? "لائحة المدن والآجال" : "Liste des villes et des délais"}
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-2 rounded-xl border bg-[#FBF8F3] border-[#E8E4DF] px-4 py-3" dir={ar ? "rtl" : "ltr"}>
      <Truck className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#C8102E]" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold text-[#0F0F0F]">{ar ? "التوصيل إلى المنزل" : "Livraison à domicile"}</p>
        <p className="text-[#4A4A4A]">{ar ? RESUME_FRAIS_AR : RESUME_FRAIS}</p>
        <p className="text-[#0F7A55] font-medium">{ar ? "أو استلام مجاني من المحل" : "Ou retrait gratuit en magasin"}</p>
      </div>
    </div>
  );
}
