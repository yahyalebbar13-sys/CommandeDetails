"use client";

// ─── Nous joindre ─────────────────────────────────────────────────────────────
// Le bloc « Une question ? » de la barre latérale, du menu du téléphone et de
// l'aide : WhatsApp avec un premier message déjà écrit (le client n'a plus
// qu'à compléter), et la question par écrit, suivie dans « Mes demandes ».

import React from 'react';
import { MessageCircle, MessageCircleQuestion } from 'lucide-react';
import { lienWhatsApp, messageContact } from './portail-outils';

export function BlocContact({ whatsapp, clientName, onQuestion, className = '' }: {
  whatsapp?: string;
  clientName: string;
  /** Ouvre le formulaire « Poser une question ». */
  onQuestion?: () => void;
  className?: string;
}) {
  const lien = lienWhatsApp(whatsapp, messageContact(clientName));
  if (!lien && !onQuestion) return null;
  return (
    <div className={`rounded-2xl border border-stone-200 bg-[#F9F6F0] p-4 ${className}`}>
      <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest">Une question ?</p>
      <p className="mt-1 text-xs font-medium text-stone-500 leading-snug">
        Notre équipe vous répond, par écrit ou sur WhatsApp.
      </p>
      <div className="mt-3 grid gap-2">
        {lien && (
          <a
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest shadow-sm shadow-emerald-600/20 transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Écrire sur WhatsApp
          </a>
        )}
        {onQuestion && (
          <button
            type="button"
            onClick={onQuestion}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-stone-200 hover:border-[#c4a062] text-stone-700 hover:text-stone-900 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <MessageCircleQuestion className="w-4 h-4" /> Poser une question
          </button>
        )}
      </div>
    </div>
  );
}
