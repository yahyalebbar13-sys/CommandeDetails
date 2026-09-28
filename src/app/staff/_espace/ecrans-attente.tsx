'use client';

// ─── Écrans d'attente de l'espace équipe ─────────────────────────────────────
// Pendant qu'on retrouve la session ou qu'on vérifie l'accès, quand la
// vérification est impossible (pas de réseau), et quand un compte d'une autre
// partie du site est connecté dans ce navigateur : jamais une page blanche, et
// toujours une action possible.

import { useState } from 'react';
import { Loader2, LogOut, RefreshCw, UserRound, WifiOff } from 'lucide-react';
import { LogoLebtex } from './marque';

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-[#0F0F0F] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-10">
      <div className="my-auto flex w-full max-w-sm flex-col items-center text-center">
        <LogoLebtex taille="grand" />
        {children}
      </div>
    </main>
  );
}

const BOUTON_PRINCIPAL =
  'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#a50d25] disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70';
const BOUTON_SECONDAIRE =
  'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-[15px] font-medium text-gray-200 transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70';

/**
 * Bouton « Se déconnecter » de ces écrans : grisé pendant la déconnexion, puis
 * de nouveau utilisable avec un message si elle a échoué (sinon il resterait
 * bloqué pour toujours).
 */
function useDeconnexion(onDeconnexion: () => Promise<void>) {
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);
  const deconnecter = async () => {
    if (envoi) return;
    setEnvoi(true);
    setEchec(false);
    try {
      await onDeconnexion();
      // Réussi : la page passe à l'écran de connexion, celui-ci disparaît.
    } catch {
      setEchec(true);
      setEnvoi(false);
    }
  };
  return { envoi, echec, deconnecter };
}

function MessageEchec() {
  return (
    <p role="alert" className="mt-3 text-sm text-red-300">
      La déconnexion n&apos;a pas abouti. Vérifiez Internet, puis réessayez.
    </p>
  );
}

/** Chargement ou vérification : le logo, un indicateur et une phrase. */
export function EcranAttente({ texte }: { texte: string }) {
  return (
    <Cadre>
      <div className="mt-6 flex items-center gap-2.5 text-gray-300" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-[#E0314D]" aria-hidden />
        <span className="text-[15px]">{texte}</span>
      </div>
    </Cadre>
  );
}

/**
 * La session existe mais l'accès n'a pas pu être vérifié (réseau coupé,
 * serveur injoignable). On ne déconnecte pas : on réessaie au retour du réseau.
 */
export function EcranVerificationImpossible({ horsLigne, onReessayer, onDeconnexion }: {
  horsLigne: boolean;
  onReessayer: () => void;
  /** Rejette si la déconnexion a échoué. */
  onDeconnexion: () => Promise<void>;
}) {
  const { envoi, echec, deconnecter } = useDeconnexion(onDeconnexion);
  return (
    <Cadre>
      <div className="mt-6 w-full rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 text-left">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0" role="alert">
            <h1 className="text-base font-semibold text-white">
              {horsLigne ? 'Pas de connexion Internet' : "L'accès n'a pas pu être vérifié"}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-300">
              {horsLigne
                ? "L'espace équipe s'ouvrira tout seul dès que le réseau reviendra."
                : 'Le serveur ne répond pas pour le moment. Réessayez dans un instant.'}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={onReessayer} className={BOUTON_PRINCIPAL}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
          </button>
          <button type="button" disabled={envoi} onClick={() => void deconnecter()} className={BOUTON_SECONDAIRE}>
            {envoi
              ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Déconnexion…</>
              : <><LogOut className="h-4 w-4" aria-hidden /> Se déconnecter</>}
          </button>
        </div>
        {echec && <MessageEchec />}
      </div>
    </Cadre>
  );
}

/**
 * Un compte d'une autre partie du site (gestion, stock, compte client…) est
 * connecté dans ce navigateur. Le site n'a qu'une session par navigateur : on
 * ne le déconnecte pas d'office (ce serait couper le travail d'un autre onglet),
 * on explique et on laisse choisir.
 */
export function EcranAutreCompte({ email, onDeconnexion }: {
  email: string;
  /** Rejette si la déconnexion a échoué. */
  onDeconnexion: () => Promise<void>;
}) {
  const { envoi, echec, deconnecter } = useDeconnexion(onDeconnexion);
  return (
    <Cadre>
      <p className="mt-4 text-sm font-black tracking-[0.2em] text-gray-300">LEBTEX</p>
      <h1 className="mt-1 text-[22px] font-bold leading-tight text-white">Espace équipe</h1>
      <div className="mt-6 w-full rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 text-left">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Un autre compte est connecté</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-300">
              Ce navigateur est connecté avec
              {email ? <> le compte <span className="break-all font-medium text-gray-100">{email}</span>,</> : ' un autre compte,'}
              {' '}qui n&apos;a pas accès à l&apos;espace équipe.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              Pour ouvrir l&apos;espace équipe ici, déconnectez ce compte : il faudra ensuite vous y reconnecter
              pour l&apos;utiliser. Pour garder les deux ouverts, utilisez une fenêtre de navigation privée.
            </p>
          </div>
        </div>
        <div className="mt-5 flex">
          <button type="button" disabled={envoi} onClick={() => void deconnecter()} className={BOUTON_PRINCIPAL}>
            {envoi
              ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Déconnexion…</>
              : <><LogOut className="h-4 w-4" aria-hidden /> Déconnecter ce compte</>}
          </button>
        </div>
        {echec && <MessageEchec />}
      </div>
    </Cadre>
  );
}
