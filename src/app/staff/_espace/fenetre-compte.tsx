'use client';

// ─── Fenêtre « Compte » / « Se déconnecter ? » ───────────────────────────────
// La déconnexion demande une confirmation légère : sur le téléphone du magasin,
// un appui de travers obligerait à retaper le mot de passe. Même fenêtre pour
// l'onglet « Compte » du téléphone et le bouton « Se déconnecter » de l'ordinateur.
// Téléphone : panneau qui monte du bas. Ordinateur : petite fenêtre centrée.

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, LogOut, ShieldCheck, X } from 'lucide-react';
import type { CompteAffiche } from './acces';

export function FenetreCompte({ compte, intention, onFermer, onDeconnexion }: {
  compte: CompteAffiche;
  /** « compte » : l'onglet Compte du téléphone ; « deconnexion » : le bouton de l'ordinateur. */
  intention: 'compte' | 'deconnexion';
  onFermer: () => void;
  onDeconnexion: () => Promise<void>;
}) {
  const idTitre = useId();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);
  const premierBouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  // La page se redessine souvent (commandes en direct, horloge) : l'effet ne doit
  // tourner qu'à l'ouverture, sinon le focus sauterait sans cesse.
  const onFermerRef = useRef(onFermer);
  useEffect(() => { onFermerRef.current = onFermer; }, [onFermer]);

  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    premierBouton.current?.focus();
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onFermerRef.current(); return; }
      // Le focus reste dans la fenêtre (Tab / Maj+Tab tournent entre ses boutons).
      if (e.key !== 'Tab' || !panneau.current) return;
      const boutons = Array.from(panneau.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!boutons.length) return;
      const premier = boutons[0];
      const dernier = boutons[boutons.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    };
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('keydown', auClavier);
      document.body.style.overflow = avant;
      if (precedent && document.contains(precedent)) precedent.focus({ preventScroll: true });
    };
  }, []);

  async function deconnecter() {
    if (envoi) return;
    setEnvoi(true);
    setEchec(false);
    try {
      await onDeconnexion();
      // La page passe à l'écran de connexion : cette fenêtre disparaît avec l'espace.
    } catch {
      setEchec(true);
      setEnvoi(false);
    }
  }

  const deconnexionSeule = intention === 'deconnexion';
  const admin = compte.role === 'admin';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-4" role="presentation">
      {/* Le fond ne ferme pas : un clic a cote ne doit pas effacer une saisie. */}
      <div className="absolute inset-0 bg-black/70" aria-hidden />
      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#141414] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl md:max-w-sm md:rounded-2xl md:border md:p-5"
      >
        {/* Poignée : se lit comme un panneau qu'on peut refermer (téléphone). */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3">
          <h2 id={idTitre} className="pt-2 text-lg font-bold text-white">
            {deconnexionSeule ? 'Se déconnecter ?' : 'Votre compte'}
          </h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#1A1A1A] p-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8102E] text-base font-bold text-white" aria-hidden>
            {compte.initiale}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-gray-400">{compte.titre}</p>
            <p className="truncate text-[15px] font-semibold text-gray-100">{compte.detail}</p>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          {deconnexionSeule
            ? admin
              // Même session que l'admin boutique (une seule par navigateur), et /staff
              // n'accepte que le nom d'utilisateur de l'équipe : le patron revient par l'admin.
              ? "Vous serez aussi déconnecté de l'admin boutique sur cet appareil. Pour revenir, reconnectez-vous depuis l'admin."
              : "Pour revenir, il faudra retaper le nom d'utilisateur et le mot de passe."
            : 'Vous restez connecté sur cet appareil, même après avoir fermé la page.'}
        </p>
        {admin ? (
          <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-gray-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" aria-hidden />
            <span>
              Connecté en administrateur : vous voyez l&apos;espace tel que l&apos;équipe le voit.
              {!deconnexionSeule && " Se déconnecter ici vous déconnecte aussi de l'admin sur cet appareil."}
            </span>
          </p>
        ) : !deconnexionSeule && (
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            Mot de passe oublié ou à changer : demandez à l&apos;administrateur.
          </p>
        )}

        {echec && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            La déconnexion n&apos;a pas abouti. Réessayez.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 md:flex-row-reverse">
          <button
            type="button"
            onClick={() => void deconnecter()}
            disabled={envoi}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 text-[15px] font-semibold text-red-200 ring-1 ring-inset ring-red-500/40 transition-colors hover:bg-red-500/25 disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            {envoi
              ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Déconnexion…</>
              : <><LogOut className="h-4 w-4" aria-hidden /> Se déconnecter</>}
          </button>
          {/* Le curseur part ici, jamais sur « Se déconnecter » : Entrée ne doit pas déconnecter. */}
          <button
            ref={premierBouton}
            type="button"
            onClick={onFermer}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-white/15 px-4 text-[15px] font-medium text-gray-100 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            {deconnexionSeule ? 'Annuler' : 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  );
}
