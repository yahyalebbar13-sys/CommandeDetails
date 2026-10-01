"use client";

import React from 'react';
import { AlertTriangle, Tag, Banknote } from 'lucide-react';
import { libelleAnciennete, SEUIL_URGENCE_MINUTES, type RappelComptoir } from '@/lib/bon-sans-prix';

/**
 * Le bandeau rouge des ventes comptoir pas encore réglées.
 *
 * Une vente comptoir part avec la marchandise et sans prix : si on ne la chiffre pas dans la
 * foulée, plus personne ne se souvient du prix fait au client. Ce bandeau reste donc en haut de
 * TOUS les écrans de /stock — compte magasin comme administrateur — tant qu'un bon comptoir
 * attend. Il reste collé en haut de l'écran quand on fait défiler une longue liste. Il dit
 * combien, depuis quand pour le plus ancien, et mène droit à la saisie. Passé
 * SEUIL_URGENCE_MINUTES, il se fait plus insistant.
 *
 * Deux attentes différentes, deux phrases : un bon qui attend ses PRIX, et un bon déjà chiffré
 * (ou facturé) qui attend seulement d'être ENCAISSÉ.
 */
export default function BandeauBonsComptoir({ rappel, onSaisir, surEcranDesBons = false, lectureSeule = false, horsLigne = false }: {
  rappel: RappelComptoir;
  onSaisir: () => void;
  /** Sur l'écran des bons lui-même : le bandeau reste, mais ne clignote plus (on y est). */
  surEcranDesBons?: boolean;
  /** Compte en lecture seule : il voit l'alerte, mais n'a rien à saisir — pas de bouton. */
  lectureSeule?: boolean;
  /** Le bandeau « connexion perdue » occupe déjà le haut de l'écran : on se place dessous. */
  horsLigne?: boolean;
}) {
  if (rappel.nombre <= 0) return null;
  const numero = rappel.plusAncien?.orderNumber || '';
  const urgent = rappel.urgent;
  const aChiffrer = rappel.nombreAChiffrer;
  const aEncaisser = rappel.nombreAEncaisser;

  const titre = aChiffrer > 0
    ? (aChiffrer === 1 ? 'Une vente comptoir attend ses prix' : `${aChiffrer} ventes comptoir attendent leurs prix`)
      + (aEncaisser > 0 ? ` · ${aEncaisser} à encaisser` : '')
    : (aEncaisser === 1 ? 'Une vente comptoir reste à encaisser' : `${aEncaisser} ventes comptoir restent à encaisser`);

  const consigne = aChiffrer > 0
    ? (urgent
      ? `Plus de ${SEUIL_URGENCE_MINUTES} minutes : récupérez le bon auprès du commercial et saisissez les prix maintenant.`
      : 'Le client est parti avec la marchandise : saisissez les prix dès que le commercial rend le bon.')
    : 'Les prix sont saisis : il reste à finaliser le bon et à encaisser le client (règlement en totalité).';

  return (
    <div
      role="alert"
      className={`sticky ${horsLigne ? 'top-10' : 'top-2'} z-[60] mb-5 rounded-2xl border-2 shadow-lg flex flex-col sm:flex-row sm:items-center gap-3 ${
        urgent
          ? `border-red-700 bg-red-600 text-white p-4 sm:p-5 shadow-red-600/30 ${surEcranDesBons ? '' : 'animate-pulse'}`
          : 'border-red-300 bg-red-50 text-red-900 p-4'
      }`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${urgent ? 'bg-white/20' : 'bg-red-100'}`}>
        {urgent ? <AlertTriangle className="w-6 h-6 text-white" />
          : aChiffrer > 0 ? <Tag className="w-5 h-5 text-red-600" /> : <Banknote className="w-5 h-5 text-red-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-black uppercase tracking-tight ${urgent ? 'text-base' : 'text-sm'}`}>{titre}</p>
        <p className={`text-[12px] font-bold leading-snug mt-0.5 ${urgent ? 'text-red-50' : 'text-red-800'}`}>
          {numero ? `Bon ${numero}` : 'Le plus ancien'} : {libelleAnciennete(rappel.minutesPlusAncien)}.
          {' '}
          {lectureSeule ? 'Ce compte est en lecture seule : prévenez le gestionnaire du magasin.' : consigne}
        </p>
      </div>
      {!lectureSeule && (
        <button
          type="button"
          onClick={onSaisir}
          className={`shrink-0 h-12 px-6 rounded-xl font-black uppercase text-[12px] tracking-widest transition-colors ${
            urgent ? 'bg-white text-red-700 hover:bg-red-50' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {aChiffrer > 0 ? 'Saisir les prix' : 'Encaisser'}
        </button>
      )}
    </div>
  );
}
