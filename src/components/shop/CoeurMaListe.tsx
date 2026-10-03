'use client';

// ─── Le cœur « Ma liste » (favoris) ──────────────────────────────────────────
// Sur les cartes produit et la fiche. Toucher le cœur garde le produit sur ce téléphone
// (lib/ma-liste) ; un petit message le confirme, avec le lien vers /shop/ma-liste, ou
// « Annuler » après un retrait.
//
// Un seul message pour toute la page, affiché par UN hôte : celui qu'une page pose hors des
// cartes (HoteMessageMaListe, sur Ma liste), sinon le premier cœur monté. Si l'hôte disparaît
// (carte retirée de Ma liste), un autre prend le relais : le message reste à l'écran.
// Le message est rendu dans <body> (portail). Dans React, les événements d'un portail suivent
// l'arbre React, pas celui de la page : sans le stopPropagation du message, un toucher dessus
// remonterait jusqu'au lien de la carte qui l'héberge et ouvrirait la fiche.

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { basculerMaListe, remettreDansMaListe, useDansMaListe } from '@/lib/ma-liste';
import { lienPage } from '@/lib/liens-boutique';

// ─── Le message, partagé par tous les cœurs ──────────────────────────────────
type Message = { ajoute: boolean; productId: string; position: number };
type Etat = { message: Message | null; hote: number | null };

let etat: Etat = { message: null, hote: null };
const hotes: number[] = []; // l'hôte posé par une page en tête, puis les cœurs
let dernierHote = 0;
let minuteur: ReturnType<typeof setTimeout> | undefined;
const abonnes = new Set<() => void>();

function changer(partiel: Partial<Etat>) {
  etat = { ...etat, ...partiel };
  abonnes.forEach(f => f());
}
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};

function montrerMessage(message: Message | null) {
  clearTimeout(minuteur);
  changer({ message });
  // Après un retrait, un peu plus de temps pour « Annuler ».
  if (message) minuteur = setTimeout(() => changer({ message: null }), message.ajoute ? 4000 : 6000);
}

function inscrire(n: number, prioritaire: boolean) {
  if (prioritaire) hotes.unshift(n);
  else hotes.push(n);
  if (etat.hote !== hotes[0]) changer({ hote: hotes[0] });
}

function desinscrire(n: number) {
  const i = hotes.indexOf(n);
  if (i >= 0) hotes.splice(i, 1);
  const hote = hotes[0] ?? null;
  if (etat.hote !== hote) changer({ hote });
}

/** Le message à afficher par CE composant (null s'il n'est pas l'hôte) : seul l'hôte se redessine. */
function useMessageHote(prioritaire: boolean): Message | null {
  const [numero] = useState(() => ++dernierHote);
  useEffect(() => {
    inscrire(numero, prioritaire);
    return () => desinscrire(numero);
  }, [numero, prioritaire]);
  const lire = useCallback(() => (etat.hote === numero ? etat.message : null), [numero]);
  return useSyncExternalStore(abonner, lire, () => null);
}

function MessageMaListe({ message }: { message: Message }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const lien = 'flex min-h-[44px] items-center font-bold text-[#D4A843] whitespace-nowrap hover:underline';
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      dir={ar ? 'rtl' : 'ltr'}
      onClick={e => e.stopPropagation()}
      className="fixed inset-x-4 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)] lg:bottom-6 z-50 mx-auto max-w-sm flex items-center justify-between gap-3 rounded-xl bg-[#0F0F0F] px-4 py-2 text-sm text-white shadow-lg"
    >
      <span className="flex items-center gap-2 py-1.5">
        <Heart className={`w-4 h-4 flex-shrink-0 ${message.ajoute ? 'fill-[#C8102E] text-[#C8102E]' : 'text-white/70'}`} />
        {message.ajoute ? (ar ? 'أُضيف إلى قائمتي' : 'Ajouté à Ma liste') : (ar ? 'حُذف من قائمتي' : 'Retiré de Ma liste')}
      </span>
      {message.ajoute ? (
        <Link href={lienPage('/shop/ma-liste', language)} className={lien}>
          {ar ? 'عرض قائمتي' : 'Voir ma liste'}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            remettreDansMaListe(message.productId, message.position);
            montrerMessage(null);
          }}
          className={`${lien} cursor-pointer`}
        >
          {ar ? 'تراجع' : 'Annuler'}
        </button>
      )}
    </div>,
    document.body
  );
}

/**
 * Hôte du message posé par une page, hors des cartes (Ma liste) : le message survit à la
 * carte qui disparaît quand on retire son cœur.
 */
export function HoteMessageMaListe() {
  const message = useMessageHote(true);
  return message ? <MessageMaListe message={message} /> : null;
}

interface Props {
  productId: string;
  /** Taille et position du bouton (« absolute bottom-1.5 end-1.5 w-9 h-9 »…). */
  className?: string;
  /** pastille : rond blanc posé sur une photo ; bordure : petit rond bordé (barre du haut de la fiche). */
  apparence?: 'pastille' | 'bordure';
}

export default function CoeurMaListe({ productId, className = '', apparence = 'pastille' }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const dansListe = useDansMaListe(productId);
  const message = useMessageHote(false);

  const toucher = (e: React.MouseEvent) => {
    // Sur une carte, le cœur est dans le lien de la fiche : il ne doit pas l'ouvrir.
    e.preventDefault();
    e.stopPropagation();
    montrerMessage({ ...basculerMaListe(productId), productId });
  };

  const couleurs =
    apparence === 'bordure'
      ? dansListe
        ? 'bg-rose-50 border border-rose-200 text-[#C8102E]'
        : 'border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-white'
      : `bg-white/90 shadow-sm ${dansListe ? 'text-[#C8102E]' : 'text-neutral-600 hover:text-[#C8102E]'}`;

  return (
    <>
      <button
        type="button"
        onClick={toucher}
        aria-pressed={dansListe}
        aria-label={
          dansListe
            ? ar ? 'احذف من قائمتي' : 'Retirer de Ma liste'
            : ar ? 'أضف إلى قائمتي' : 'Ajouter à Ma liste'
        }
        className={`rounded-full flex items-center justify-center cursor-pointer touch-manipulation transition-colors active:scale-90 ${couleurs} ${className}`}
      >
        <Heart className={`w-4 h-4 ${dansListe ? 'fill-current' : ''}`} />
      </button>
      {message && <MessageMaListe message={message} />}
    </>
  );
}
