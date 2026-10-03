'use client';

// « Envoyer à un collègue » : le nom du produit et le lien de sa fiche.
// Sur un téléphone qui sait partager (navigator.share), la feuille de partage s'ouvre
// (WhatsApp, Messenger, SMS…) ; sinon, WhatsApp sans destinataire (wa.me/?text=), que
// le client choisit lui-même. Sans JavaScript, le lien WhatsApp marche aussi.

import React from 'react';
import { Send } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { lienComplet, lienProduit } from '@/lib/liens-boutique';
import type { ShopProduct } from '@/lib/shop-types';

// produit : son identifiant et son nom français (l'adresse lisible) ; nom : celui affiché
export default function PartagerProduit({ produit, nom }: { produit: Pick<ShopProduct, 'id' | 'name'>; nom: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const lien = lienComplet(lienProduit(produit, language));
  const texte = ar ? `شاهد هذا المنتج عند LEBTEX: ${nom}` : `Regarde ce produit chez LEBTEX : ${nom}`;
  const lienWhatsApp = `https://wa.me/?text=${encodeURIComponent(`${texte}\n${lien}`)}`;

  const partager = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return; // le lien WhatsApp s'ouvre
    e.preventDefault();
    try {
      await navigator.share({ title: nom, text: texte, url: lien });
    } catch (err) {
      // Partage fermé par le client : rien à faire ; autre refus : WhatsApp (dans cet onglet si la fenêtre est bloquée)
      if ((err as Error)?.name === 'AbortError') return;
      const fenetre = window.open(lienWhatsApp, '_blank');
      if (fenetre) fenetre.opener = null;
      else window.location.href = lienWhatsApp;
    }
  };

  return (
    <a
      href={lienWhatsApp}
      target="_blank"
      rel="noopener noreferrer"
      onClick={partager}
      className="w-full min-h-12 px-4 rounded-2xl border-2 border-neutral-300 bg-white text-base font-bold text-neutral-800 hover:border-neutral-500 flex items-center justify-center gap-2"
    >
      <Send className="size-5 shrink-0 rtl:-scale-x-100" />
      {ar ? 'أرسل لزميل' : 'Envoyer à un collègue'}
    </a>
  );
}
