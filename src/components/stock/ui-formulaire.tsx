"use client";

/**
 * Briques communes des formulaires de /stock.
 *
 * Pourquoi ce fichier : chaque écran réinventait son propre étiquetage. Les libellés étaient en
 * capitales à 11 px, très espacés — lisibles pour qui connaît déjà le logiciel, illisibles pour
 * quelqu'un qui arrive. Aucun champ ne disait à quoi il sert ni ce qu'il déclenche, rien ne
 * regroupait les questions (« quel produit ? », « combien ? », « où ? »), et un bouton grisé ne
 * disait jamais pourquoi il l'était.
 *
 * Ces composants ne portent AUCUNE logique métier : ils habillent des champs qui existent déjà.
 * Règle pour la suite : dans /stock, un champ de formulaire passe par `Champ`, un groupe de
 * champs par `SectionFormulaire`, et un bouton qui enregistre par `BoutonValider`.
 */

import React from 'react';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';

/** Classes communes des contrôles, pour que tous les champs aient la même taille partout. */
export const CLASSE_CHAMP =
  'h-11 rounded-xl border-stone-200 text-sm font-bold text-stone-900 placeholder:font-medium placeholder:text-stone-400';

/**
 * Un groupe de champs qui répondent à une même question, numéroté.
 * Le numéro n'est pas décoratif : il donne à un débutant l'ordre dans lequel remplir, et un
 * repère pour poser une question (« je bloque sur l'étape 2 »).
 */
export function SectionFormulaire({
  numero, titre, aide, children, className = '', action,
}: {
  numero?: number;
  titre: string;
  aide?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <header className="flex items-start gap-2.5 border-b border-stone-100 pb-2">
        {numero !== undefined && (
          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-stone-900 text-white text-[11px] font-black flex items-center justify-center">
            {numero}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-stone-900 leading-tight">{titre}</h3>
          {aide && <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5">{aide}</p>}
        </div>
        {action}
      </header>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/**
 * Un champ : son libellé, ce qu'il sert à faire, et son erreur éventuelle.
 *
 * - `aide` dit la CONSÉQUENCE, pas la répétition du libellé. « Date » n'a pas besoin d'aide ;
 *   « Lieu » en a besoin, parce que c'est ce champ qui décide d'où la marchandise sort.
 * - `obligatoire` remplace l'astérisque collé au libellé, que personne ne remarquait.
 */
export function Champ({
  label, obligatoire, aide, erreur, htmlFor, children, className = '', indice,
}: {
  label: React.ReactNode;
  obligatoire?: boolean;
  aide?: React.ReactNode;
  erreur?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  /** Petite valeur affichée à droite du libellé : stock disponible, total calculé… */
  indice?: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-bold text-stone-800 leading-tight">
          {label}
          {obligatoire && <span className="ml-1 text-rose-500" title="Champ obligatoire">•</span>}
        </label>
        {indice && <span className="text-[11px] font-bold text-stone-500 shrink-0">{indice}</span>}
      </div>
      {aide && <p className="text-[11px] font-medium text-stone-500 leading-snug">{aide}</p>}
      {children}
      {erreur && (
        <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {erreur}
        </p>
      )}
    </div>
  );
}

/**
 * Un encadré d'explication. À utiliser quand une règle du métier n'est pas devinable depuis les
 * champs : « un achat au marché entre en réserve, pas en boutique », « un chèque ne solde la
 * facture qu'une fois encaissé ».
 */
export function Encadre({
  ton = 'info', titre, children, className = '',
}: {
  ton?: 'info' | 'attention' | 'astuce';
  titre?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info:      { boite: 'bg-stone-50 border-stone-200 text-stone-700', icone: 'text-stone-400', Icone: Info },
    attention: { boite: 'bg-amber-50 border-amber-200 text-amber-900', icone: 'text-amber-500', Icone: AlertTriangle },
    astuce:    { boite: 'bg-violet-50 border-violet-200 text-violet-900', icone: 'text-violet-500', Icone: Lightbulb },
  }[ton];
  const Icone = styles.Icone;
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3 ${styles.boite} ${className}`}>
      <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${styles.icone}`} />
      <div className="text-[11px] font-medium leading-snug space-y-0.5">
        {titre && <p className="font-black">{titre}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Une ligne « libellé → valeur » d'un récapitulatif avant validation. */
export function LigneResume({
  libelle, valeur, fort, ton = 'neutre',
}: {
  libelle: React.ReactNode;
  valeur: React.ReactNode;
  fort?: boolean;
  ton?: 'neutre' | 'positif' | 'alerte';
}) {
  const couleur = ton === 'positif' ? 'text-emerald-700' : ton === 'alerte' ? 'text-rose-600' : 'text-stone-900';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${fort ? 'text-[13px] font-bold text-stone-800' : 'text-[11px] font-medium text-stone-500'} leading-tight`}>
        {libelle}
      </span>
      <span className={`${fort ? 'text-base font-black' : 'text-[13px] font-bold'} ${couleur} tabular-nums shrink-0`}>
        {valeur}
      </span>
    </div>
  );
}

/**
 * Récapitulatif de ce qui va être enregistré. Sur tout ce qui touche à la marchandise ou à
 * l'argent, on relit avant de valider — c'est le dernier endroit où une erreur coûte une
 * correction au lieu d'un inventaire.
 */
export function Recapitulatif({
  titre = 'À enregistrer', children, className = '',
}: { titre?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-stone-50 p-3.5 space-y-2 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{titre}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * Bouton d'enregistrement. `raisonDesactive` s'affiche sous le bouton quand il est grisé : un
 * bouton mort sans explication est la première cause d'appel au support.
 */
export function BoutonValider({
  children, onClick, raisonDesactive, enCours, libelleEnCours = 'Enregistrement…', type = 'button', className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** Non vide = bouton désactivé, et voici pourquoi, en une phrase. */
  raisonDesactive?: string | null;
  enCours?: boolean;
  libelleEnCours?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const desactive = Boolean(raisonDesactive) || Boolean(enCours);
  return (
    <div className="space-y-1.5">
      <button
        type={type}
        onClick={onClick}
        disabled={desactive}
        className={`w-full h-12 rounded-2xl bg-stone-900 text-white text-[13px] font-black tracking-wide
          hover:bg-stone-800 active:scale-[0.99] transition-all shadow-md
          disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
      >
        {enCours ? libelleEnCours : children}
      </button>
      {raisonDesactive && !enCours && (
        <p className="text-[11px] font-bold text-stone-500 text-center leading-snug">{raisonDesactive}</p>
      )}
    </div>
  );
}
