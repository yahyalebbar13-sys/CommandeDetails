"use client";

// Bouton WhatsApp flottant de la boutique, sur téléphone et sur ordinateur (monté par ShopFooter).
// - Téléphone : posé juste au-dessus de la barre du bas (≈ 57 px). Le panier et la fiche produit
//   ont leur propre barre collante en bas (Commander, liste de quantités) : il monte au-dessus.
// - Ordinateur : un peu plus haut que le bouton « haut de page » de la boutique.
// - Côté droit en français, côté gauche en arabe (sens de lecture).
// - Caché au checkout et à la confirmation, qui ont leurs propres boutons.
// - Sur une fiche produit, le message prérempli cite le produit et son lien.

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/language-context";
import { useShopProducts } from "@/contexts/shop-products-context";
import { getWhatsAppContact } from "@/lib/shop-utils";
import { cheminFrancais, idDepuisParametre, lienComplet, lienProduit } from "@/lib/liens-boutique";
import { nomProduit } from "@/lib/shop-textes";
import type { Language } from "@/lib/translations";

const PAGES_SANS_BOUTON = ["/shop/checkout", "/shop/confirmation"];

// Message prérempli : le produit de la fiche s'il y en a un (son nom affiché et l'adresse
// complète de sa fiche), sinon une prise de contact
export function messageFlottant(language: Language, produit?: { lien: string; nom: string } | null): string {
  if (produit) {
    const { lien } = produit;
    const article = produit.nom ? `${produit.nom} — ${lien}` : lien;
    return language === "ar"
      ? `السلام عليكم LEBTEX، أريد معلومات عن: ${article}`
      : `Bonjour LEBTEX, je voudrais des informations sur : ${article}`;
  }
  return language === "ar"
    ? "السلام عليكم LEBTEX، أريد أن أطلب أو أطرح سؤالاً"
    : "Bonjour LEBTEX, je voudrais commander / poser une question";
}

export default function WhatsAppFloat() {
  const { language } = useLanguage();
  const { getProductById } = useShopProducts();
  const pathname = usePathname() || "";
  // Même règle en arabe : /ar/shop/… se lit comme /shop/…
  const chemin = cheminFrancais(pathname);
  const [visible, setVisible] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000);
    const pulseTimer = setTimeout(() => setPulse(false), 6000);
    return () => { clearTimeout(timer); clearTimeout(pulseTimer); };
  }, []);

  if (!visible) return null;
  if (PAGES_SANS_BOUTON.some(page => chemin === page || chemin.startsWith(`${page}/`))) return null;

  // Fiche produit : /shop/produit/<nom>-<jeton> (ou l'ancien identifiant brut)
  const parametre = chemin.match(/^\/shop\/produit\/([^/]+)/)?.[1] || "";
  const id = parametre ? idDepuisParametre(parametre) : "";
  const produit = id ? getProductById(id) : undefined;
  // Produit hors du catalogue chargé (ajouté depuis) : l'adresse de la page, déjà la bonne
  const lien = lienComplet(produit ? lienProduit(produit, language) : pathname);
  const message = messageFlottant(language, id ? { lien, nom: produit ? nomProduit(produit, language) : "" } : null);

  // Pages avec une barre collante en bas sur téléphone : le bouton passe au-dessus
  const auDessusDUneBarre = chemin === "/shop/panier" || Boolean(id);
  const libelle = language === "ar" ? "تواصل معنا عبر واتساب" : "Écrivez-nous sur WhatsApp";

  return (
    <a
      href={getWhatsAppContact(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed z-[44] end-3 lg:end-6 lg:bottom-20 group ${
        auDessusDUneBarre
          ? "bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_5.5rem)]"
          : "bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)]"
      }`}
      aria-label={libelle}
    >
      {/* Bulle au survol (ordinateur), du côté du centre de la page ; elle ne capte aucun clic */}
      <span className="hidden sm:block absolute end-full me-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-white shadow-lg border border-gray-100 text-sm font-semibold text-gray-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        {libelle}
      </span>

      {/* Button */}
      <div className="relative">
        {/* Pulse ring */}
        {pulse && (
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
        )}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(37,211,102,0.4)] hover:scale-110 active:scale-95 transition-transform duration-200 cursor-pointer"
          style={{ backgroundColor: "#25D166" }}
        >
          {/* WhatsApp SVG icon */}
          <svg viewBox="0 0 32 32" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M16.004 2.667C8.636 2.667 2.667 8.636 2.667 16c0 2.356.636 4.658 1.848 6.672L2.667 29.333l6.862-1.799A13.267 13.267 0 0016.004 29.333C23.372 29.333 29.333 23.364 29.333 16S23.372 2.667 16.004 2.667zm0 24a10.625 10.625 0 01-5.474-1.521l-.39-.233-4.072 1.067 1.088-3.963-.255-.407A10.622 10.622 0 015.333 16c0-5.887 4.784-10.667 10.671-10.667S26.667 10.113 26.667 16 21.887 26.667 16.004 26.667zm5.848-7.953c-.32-.16-1.894-.935-2.188-1.04-.294-.107-.508-.16-.72.16-.215.32-.83 1.04-1.02 1.254-.187.213-.373.24-.694.08-.32-.16-1.352-.5-2.576-1.592-.952-.852-1.595-1.904-1.782-2.224-.187-.32-.02-.493.14-.653.146-.144.32-.374.48-.56.16-.187.214-.32.32-.534.107-.213.054-.4-.026-.56-.08-.16-.72-1.736-.985-2.376-.26-.624-.524-.54-.72-.55l-.614-.01c-.213 0-.56.08-.854.4-.293.32-1.12 1.094-1.12 2.67 0 1.578 1.147 3.104 1.307 3.318.16.213 2.26 3.45 5.48 4.837.765.33 1.362.527 1.828.675.768.244 1.467.21 2.02.127.615-.092 1.894-.775 2.16-1.524.268-.748.268-1.39.188-1.524-.08-.133-.294-.213-.614-.373z"/>
          </svg>
        </div>
      </div>
    </a>
  );
}
