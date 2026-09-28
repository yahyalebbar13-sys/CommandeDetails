'use client';

// ─── Écran de connexion de l'espace équipe ───────────────────────────────────
// Un nom d'utilisateur et un mot de passe, donnés par l'administrateur. Pensé
// pour le téléphone du magasin : texte en 16 px (pas de zoom sur iPhone),
// grandes cibles, clavier sans majuscule automatique ni correcteur, Entrée valide.
//
// Le nom d'utilisateur devient l'e-mail technique du compte (emailEquipe), que
// l'employé ne voit jamais. La vérification de l'accès, une fois connecté, est
// menée par la page : ici on ne fait que se connecter.

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { browserLocalPersistence, setPersistence, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { AlertCircle, Eye, EyeOff, Info, Loader2, Lock, LogIn, UserRound } from 'lucide-react';
import { emailEquipe } from '@/lib/acces-equipe';
import { codeErreur, messageErreurConnexion, MESSAGE_PAS_INTERNET, verifierSaisie, type MessageConnexion } from './acces';
import { LogoLebtex } from './marque';

/** Le dernier nom d'utilisateur accepté sur cet appareil : pré-rempli à la prochaine connexion (ce n'est pas un secret). */
const CLE_IDENTIFIANT = 'lebtex_equipe_identifiant';

type Champ = 'identifiant' | 'motDePasse';

const CHAMP =
  'h-12 w-full rounded-xl border bg-[#141414] text-base text-white transition-colors '
  + 'focus:outline-none focus:ring-2 disabled:opacity-70';
const CHAMP_NORMAL = 'border-white/15 focus:border-[#E0314D] focus:ring-[#C8102E]/30';
const CHAMP_ERREUR = 'border-red-400/70 focus:border-red-400 focus:ring-red-500/30';

export function Connexion({ auth, message, onEffacerMessage, verification }: {
  auth: Auth;
  /** Message venu de la page (accès refusé, session terminée, déconnexion). */
  message: MessageConnexion | null;
  onEffacerMessage: () => void;
  /** Connecté : la page vérifie l'accès. Le formulaire reste affiché, occupé. */
  verification: boolean;
}) {
  const idBase = useId();
  const idErreur = `${idBase}-erreur`;
  const idMajuscules = `${idBase}-majuscules`;

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<{ texte: string; champ?: Champ } | null>(null);
  const [majuscules, setMajuscules] = useState(false);

  const champIdentifiant = useRef<HTMLInputElement>(null);
  const champMotDePasse = useRef<HTMLInputElement>(null);

  const occupe = envoi || verification;

  // Nom d'utilisateur déjà connu sur cet appareil : on passe directement au mot de passe.
  // Le curseur n'est posé d'office qu'avec une souris : sur téléphone, le clavier
  // cacherait l'écran avant même qu'on l'ait lu.
  useEffect(() => {
    let dernier = '';
    try { dernier = window.localStorage.getItem(CLE_IDENTIFIANT) || ''; } catch { /* stockage bloqué */ }
    if (dernier) setIdentifiant(dernier);
    if (window.matchMedia?.('(pointer: fine)').matches) {
      (dernier ? champMotDePasse : champIdentifiant).current?.focus();
    }
  }, []);

  function effacerErreurs() {
    if (erreur) setErreur(null);
    if (message) onEffacerMessage();
  }

  // Le champ à corriger reçoit le curseur, mais seulement une fois le formulaire
  // redevenu actif : un champ désactivé (pendant l'envoi) refuse le focus.
  const aFocaliser = useRef<Champ | null>(null);
  useEffect(() => {
    if (occupe || !aFocaliser.current) return;
    const champ = aFocaliser.current;
    aFocaliser.current = null;
    const cible = champ === 'identifiant' ? champIdentifiant.current : champMotDePasse.current;
    cible?.focus();
    // Mot de passe refusé : sélectionné, il se retape d'un coup.
    if (champ === 'motDePasse') cible?.select();
  });

  function signalerErreur(texte: string, champ?: Champ) {
    setErreur({ texte, champ });
    aFocaliser.current = champ ?? null;
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (occupe) return;
    effacerErreurs();

    const saisie = verifierSaisie(identifiant, motDePasse);
    if (!saisie.ok) { signalerErreur(saisie.texte, saisie.champ); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { signalerErreur(MESSAGE_PAS_INTERNET); return; }

    setEnvoi(true);
    try {
      // L'employé reste connecté sur son téléphone, même après avoir fermé la page.
      await setPersistence(auth, browserLocalPersistence).catch(() => { /* stockage bloqué : la session durera le temps de la visite */ });
      await signInWithEmailAndPassword(auth, emailEquipe(saisie.identifiant), motDePasse);
      try { window.localStorage.setItem(CLE_IDENTIFIANT, saisie.identifiant); } catch { /* rien : on le retapera */ }
      setIdentifiant(saisie.identifiant);
    } catch (err) {
      const { texte, identifiantsIncorrects } = messageErreurConnexion(codeErreur(err));
      signalerErreur(texte, identifiantsIncorrects ? 'motDePasse' : undefined);
    } finally {
      setEnvoi(false);
    }
  }

  // Verrouillage des majuscules : la cause n° 1 d'un « mot de passe incorrect » sur ordinateur.
  const suivreMajuscules = (e: KeyboardEvent<HTMLInputElement>) => {
    setMajuscules(!!e.getModifierState?.('CapsLock'));
  };

  const affiche: MessageConnexion | null = erreur ? { ton: 'erreur', texte: erreur.texte } : message;
  const erreurSur = (champ: Champ) => erreur?.champ === champ;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-[#0F0F0F] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-10">
      {/* Halo rouge discret en haut : la couleur de la marque, sans gêner la lecture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(200,16,46,0.20),transparent_70%)]"
      />

      <div className="relative my-auto w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoLebtex taille="grand" />
          <p className="mt-4 text-sm font-black tracking-[0.2em] text-gray-300">LEBTEX</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight text-white">Espace équipe</h1>
          <p className="mt-2 text-[15px] leading-snug text-gray-400">Commandes de la boutique et demandes des clients.</p>
        </div>

        <form
          onSubmit={soumettre}
          noValidate
          aria-busy={occupe}
          className="space-y-4 rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 shadow-2xl shadow-black/40 sm:p-6"
        >
          {affiche && (
            <div
              id={idErreur}
              role={affiche.ton === 'erreur' ? 'alert' : 'status'}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-snug ${
                affiche.ton === 'erreur'
                  ? 'border-red-500/40 bg-red-500/10 text-red-100'
                  : 'border-white/15 bg-white/5 text-gray-200'
              }`}
            >
              {affiche.ton === 'erreur'
                ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" aria-hidden />
                : <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" aria-hidden />}
              <span>{affiche.texte}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={`${idBase}-identifiant`} className="block text-sm font-medium text-gray-200">
              Nom d&apos;utilisateur
            </label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                ref={champIdentifiant}
                id={`${idBase}-identifiant`}
                name="username"
                type="text"
                value={identifiant}
                onChange={e => { setIdentifiant(e.target.value); effacerErreurs(); }}
                // Entrée (ou « Suivant » du clavier du téléphone) avant d'avoir tapé le mot de passe : on y passe, sans message d'erreur.
                onKeyDown={e => {
                  if (e.key === 'Enter' && identifiant.trim() && !motDePasse) { e.preventDefault(); champMotDePasse.current?.focus(); }
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="next"
                maxLength={60}
                disabled={occupe}
                aria-invalid={erreurSur('identifiant') || undefined}
                aria-describedby={erreurSur('identifiant') ? idErreur : undefined}
                className={`${CHAMP} ${erreurSur('identifiant') ? CHAMP_ERREUR : CHAMP_NORMAL} pl-11 pr-4`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idBase}-mot-de-passe`} className="block text-sm font-medium text-gray-200">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                ref={champMotDePasse}
                id={`${idBase}-mot-de-passe`}
                name="password"
                type={voirMotDePasse ? 'text' : 'password'}
                value={motDePasse}
                onChange={e => { setMotDePasse(e.target.value); effacerErreurs(); }}
                onKeyDown={suivreMajuscules}
                onKeyUp={suivreMajuscules}
                onBlur={() => setMajuscules(false)}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={200}
                disabled={occupe}
                aria-invalid={erreurSur('motDePasse') || undefined}
                aria-describedby={[erreurSur('motDePasse') ? idErreur : '', majuscules ? idMajuscules : ''].filter(Boolean).join(' ') || undefined}
                className={`${CHAMP} ${erreurSur('motDePasse') ? CHAMP_ERREUR : CHAMP_NORMAL} pl-11 pr-14`}
              />
              <button
                type="button"
                onClick={() => setVoirMotDePasse(v => !v)}
                aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={voirMotDePasse}
                title={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                {voirMotDePasse ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            {majuscules && (
              <p id={idMajuscules} className="text-sm font-medium text-amber-300">
                Majuscules verrouillées (touche Verr. Maj).
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={occupe}
            className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-base font-semibold text-white shadow-lg shadow-[#C8102E]/20 transition-colors hover:bg-[#a50d25] disabled:cursor-wait disabled:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            {verification
              ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Vérification de l&apos;accès…</>
              : envoi
                ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Connexion…</>
                : <><LogIn className="h-5 w-5" aria-hidden /> Se connecter</>}
          </button>
        </form>

        <div className="mt-6 space-y-1 text-center text-sm leading-relaxed text-gray-400">
          <p>Identifiants fournis par l&apos;administrateur.</p>
          <p>Mot de passe oublié ? Demandez-en un nouveau à l&apos;administrateur.</p>
        </div>
      </div>
    </main>
  );
}
