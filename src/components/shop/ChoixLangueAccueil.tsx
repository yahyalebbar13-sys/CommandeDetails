"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { langueDejaProposee, langueEnregistree, marquerLangueProposee, useLanguage } from "@/contexts/language-context";
import { useShopCartState } from "@/contexts/shop-cart-context";
import type { Language } from "@/lib/translations";

/**
 * Petite carte d'accueil, une seule fois par navigateur, pour choisir la langue.
 * Toujours écrite dans les deux langues : on ne sait pas encore laquelle le client lit.
 * Choisir ouvre la même page dans cette langue (/shop/… ↔ /ar/shop/…, language-context).
 * Une langue déjà choisie par le bouton de l'en-tête vaut réponse : la carte ne vient plus.
 */
export default function ChoixLangueAccueil() {
  const { language, setLanguage } = useLanguage();
  const { isOpen: panierOuvert } = useShopCartState();
  const [ouverte, setOuverte] = useState(false);
  const [suggereArabe, setSuggereArabe] = useState(false);
  const langueALOuverture = useRef<Language | null>(null);

  useEffect(() => {
    if (langueDejaProposee()) return;
    const minuteur = window.setTimeout(() => {
      if (langueDejaProposee()) return;
      // Première visite d'un navigateur réglé en arabe : on met العربية en avant, sans rien changer
      setSuggereArabe(!langueEnregistree() && /^ar\b/i.test(navigator.language || ""));
      setOuverte(true);
    }, 700);
    return () => window.clearTimeout(minuteur);
  }, []);

  const fermer = useCallback(() => {
    marquerLangueProposee();
    setOuverte(false);
  }, []);

  // Langue changée par le bouton de l'en-tête pendant que la carte est là : le choix est fait
  useEffect(() => {
    if (!ouverte) return;
    if (langueALOuverture.current === null) {
      langueALOuverture.current = language;
    } else if (language !== langueALOuverture.current) {
      fermer();
    }
  }, [ouverte, language, fermer]);

  useEffect(() => {
    if (!ouverte || panierOuvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouverte, panierOuvert, fermer]);

  if (!ouverte) return null;

  const enAvant: Language = suggereArabe ? "ar" : language;

  // Fermée d'abord : si le stockage refuse la langue, la carte ne reste pas bloquée à l'écran
  const choisir = (langue: Language) => {
    fermer();
    setLanguage(langue);
  };

  const classeBouton = (langue: Language) =>
    `flex-1 min-h-11 px-3 rounded-xl text-base font-semibold border transition-colors active:scale-[0.98] touch-manipulation ${
      enAvant === langue
        ? "bg-[#C8102E] border-[#C8102E] text-white shadow-[0_6px_16px_-6px_rgba(200,16,46,0.55)] hover:bg-[#B00E28]"
        : "bg-white border-[#E8E4DF] text-gray-800 hover:bg-gray-50"
    }`;

  return (
    <div
      role="dialog"
      aria-label="Choisissez votre langue · اختر لغتك"
      className="fixed z-[45] left-3 right-3 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)] sm:left-auto sm:w-80 lg:right-6 lg:bottom-24 bg-white rounded-2xl border border-[#E8E4DF] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-4 animate-in fade-in-0 slide-in-from-bottom-3 duration-300 motion-reduce:animate-none"
    >
      <button
        type="button"
        onClick={fermer}
        className="absolute top-1 end-1 w-11 h-11 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        aria-label="Fermer · إغلاق"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="px-10 text-center">
        <p lang="fr" dir="ltr" className="text-sm font-semibold text-gray-900 leading-snug">
          Choisissez votre langue
        </p>
        <p lang="ar" dir="rtl" className="text-base font-semibold text-gray-900 leading-snug mt-0.5">
          اختر لغتك
        </p>
      </div>

      {/* Français toujours à gauche, العربية à droite, quelle que soit la langue affichée */}
      <div dir="ltr" className="flex gap-2 mt-3">
        <button type="button" lang="fr" onClick={() => choisir("fr")} className={classeBouton("fr")}>
          Français
        </button>
        <button type="button" lang="ar" dir="rtl" onClick={() => choisir("ar")} className={classeBouton("ar")}>
          العربية
        </button>
      </div>
    </div>
  );
}
