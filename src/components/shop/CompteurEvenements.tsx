"use client";

// Compteurs anonymes (lib/compteurs-boutique) : compte l'arrivée sur la page panier et sur le
// formulaire de commande, et chaque ouverture d'une conversation WhatsApp avec LEBTEX.
// Ne rend rien. À monter une fois, dans le layout de la boutique.
// (La fiche produit vue est comptée par CompteVueProduit ci-dessous, l'ajout au panier dans
// shop-cart-context, l'ouverture du tiroir dans CartDrawer.)

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { compter, estLienWhatsApp, evenementDuChemin } from "@/lib/compteurs-boutique";

export default function CompteurEvenements() {
  const chemin = usePathname();
  // Dernier chemin compté : une page n'est comptée qu'une fois par arrivée
  const dernier = useRef<string | null>(null);

  useEffect(() => {
    if (!chemin || chemin === dernier.current) return;
    dernier.current = chemin;
    const evenement = evenementDuChemin(chemin);
    if (evenement) compter(evenement);
  }, [chemin]);

  useEffect(() => {
    // Liens WhatsApp vers un numéro (wa.me/212…) : un seul écouteur pour toute la page
    const surClic = (e: MouseEvent) => {
      const lien = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (lien && estLienWhatsApp(lien.getAttribute("href"))) compter("clic_whatsapp");
    };
    // Boutons qui ouvrent WhatsApp par window.open (demande de prix, page contact, conseiller) :
    // on regarde l'adresse au passage, puis l'ouverture se fait exactement comme avant
    const ouvrir = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string) {
      if (estLienWhatsApp(String(url ?? ""))) compter("clic_whatsapp");
      return ouvrir.call(window, url, target, features);
    };
    document.addEventListener("click", surClic, true);
    return () => {
      document.removeEventListener("click", surClic, true);
      window.open = ouvrir;
    };
  }, []);

  return null;
}

// Fiche produit vue : monté par le layout de la fiche (src/app/shop/produit/[id]/layout.tsx)
// seulement quand le produit existe. Une adresse de produit retiré (404) n'est pas comptée.
// Une fois par fiche ouverte (passer d'une fiche à l'autre compte chaque fiche).
export function CompteVueProduit({ id }: { id: string }) {
  const dernier = useRef<string | null>(null);

  useEffect(() => {
    if (dernier.current === id) return;
    dernier.current = id;
    compter("vue_produit");
  }, [id]);

  return null;
}
