'use client';

// ─── Accès équipe ────────────────────────────────────────────────────────────
// L'équipe du magasin a UN seul compte, partagé, pour l'espace /staff : un nom
// d'utilisateur et un mot de passe que le patron tape ici lui-même (rien n'est
// écrit dans le code). Avec cet accès, l'équipe traite les commandes de la
// boutique et les demandes des clients, rien d'autre.
//
// Tout passe par /api/admin/acces-equipe, réservée au compte administrateur :
// c'est le serveur qui crée le compte et range le mot de passe. Cet écran ne le
// relit jamais : une fois enregistré, il n'est plus affiché nulle part.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';
import * as Boite from '@radix-ui/react-alert-dialog';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  Power,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { dateHeure } from '@/lib/commandes-boutique';
import {
  motDePasseAcceptable,
  MOT_DE_PASSE_MIN,
  normaliserIdentifiant,
  problemeIdentifiant,
  REGLE_IDENTIFIANT,
} from '@/lib/acces-equipe';

const ROUTE = '/api/admin/acces-equipe';

/** Ce qu'on lit à l'équipe (court, sans « https ») et ce qu'on colle dans un message (cliquable partout). */
const LIEN_AFFICHE = 'www.lebtex.ma/staff';
const LIEN_COPIE = 'https://www.lebtex.ma/staff';

// ─── Données de l'accès (réponse de la route) ─────────────────────────────────

/**
 * Le compte ne correspond plus à ce qui est enregistré (la route le signale) :
 *   email_modifie : adresse de connexion changée depuis un navigateur ;
 *   nom_a_enregistrer : un changement de nom ne s'est pas enregistré jusqu'au bout.
 * Dans les deux cas l'équipe est bloquée jusqu'au prochain enregistrement.
 */
type Anomalie = 'email_modifie' | 'nom_a_enregistrer';

interface EtatAcces {
  configure: boolean;
  identifiant: string;
  desactive: boolean;
  creeLe: string | null;
  majLe: string | null;
  derniereConnexion: string | null;
  anomalie: Anomalie | null;
}

/** Réponse relue champ par champ : un écran d'admin ne doit pas planter sur une réponse inattendue. */
function lireEtat(data: unknown): EtatAcces | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.configure !== 'boolean') return null;
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    configure: d.configure,
    identifiant: texte(d.identifiant) ?? '',
    desactive: d.desactive === true,
    creeLe: texte(d.creeLe),
    majLe: texte(d.majLe),
    derniereConnexion: texte(d.derniereConnexion),
    anomalie: d.anomalie === 'email_modifie' || d.anomalie === 'nom_a_enregistrer' ? d.anomalie : null,
  };
}

const NOM_DEJA_PRIS = "Ce nom d'utilisateur est déjà pris. Choisissez-en un autre.";
/** Le refus « nom déjà pris » (la route explique aussi comment libérer le nom). */
const estNomDejaPris = (message: string) => /déjà pris/i.test(message);

function messageErreur(statut: number, detail: string, enregistrement: boolean): string {
  switch (statut) {
    case 401:
      return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    case 403:
      return "Seul le compte administrateur peut gérer l'accès de l'équipe.";
    case 404:
      return "Cette fonction n'est pas encore en ligne sur le site. Réessayez après la prochaine mise à jour.";
    case 409:
      // 409 dit aussi « modifié sur un autre écran » ou « compte supprimé » : le texte du serveur passe tel quel.
      return detail || NOM_DEJA_PRIS;
    default:
      // La route répond en français simple, sans détail interne (format du nom, mot de passe refusé…).
      if (detail) return detail;
      if (statut === 400) return "Le nom d'utilisateur ou le mot de passe ne convient pas. Vérifiez-les puis réessayez.";
      return enregistrement
        ? `Le serveur n'a pas pu enregistrer (code ${statut}). Rien n'a changé : réessayez dans un instant.`
        : `Le serveur n'a pas répondu correctement (code ${statut}). Réessayez dans un instant.`;
  }
}

/** Lit (sans corps) ou enregistre (avec corps) l'accès ; renvoie l'état à jour ou lève une erreur lisible. */
async function appelerRoute(corps?: Record<string, unknown>): Promise<EtatAcces> {
  const enregistrement = !!corps;
  let res: Response;
  try {
    res = await authedFetch(ROUTE, corps
      ? { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }
      : { cache: 'no-store' });
  } catch {
    throw new Error(
      enregistrement
        ? "Pas de connexion internet : rien n'a été enregistré."
        : "Pas de connexion internet : l'accès de l'équipe n'a pas pu être lu.",
    );
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Page d'erreur non JSON : on garde le code seul.
  }
  if (res.ok) {
    const etat = lireEtat(data);
    if (etat) return etat;
    throw new Error('Réponse inattendue du serveur. Rechargez la page.');
  }
  const brut = (data as { error?: unknown } | null)?.error;
  const detail = typeof brut === 'string' ? brut.trim() : '';
  throw new Error(messageErreur(res.status, detail, enregistrement));
}

// ─── Petits éléments communs ──────────────────────────────────────────────────

const CARTE = 'bg-[#1A1A1A] rounded-2xl border border-white/5';
// 16 px dans les champs : en dessous, l'iPhone zoome la page à chaque saisie.
const CHAMP =
  'w-full h-12 rounded-xl bg-[#0F0F0F] border px-4 text-base text-white placeholder:text-gray-400 outline-none transition-colors focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/30 disabled:opacity-60';

type Message = { ton: 'ok' | 'erreur'; texte: string };

function BandeauMessage({ message, onFermer }: { message: Message; onFermer?: () => void }) {
  const ok = message.ton === 'ok';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${
        ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'
      }`}
    >
      {ok ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-px" aria-hidden /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-px" aria-hidden />}
      <span className="flex-1 min-w-0">{message.texte}</span>
      {onFermer && (
        <button type="button" onClick={onFermer} aria-label="Fermer le message"
          className="-m-2 w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg text-current opacity-80 hover:opacity-100 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60">
          <X className="w-4 h-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

function Aide({ id, ton = 'neutre', children }: { id?: string; ton?: 'neutre' | 'erreur' | 'ok'; children: ReactNode }) {
  const couleur = ton === 'erreur' ? 'text-red-300' : ton === 'ok' ? 'text-emerald-300' : 'text-gray-400';
  return (
    <p id={id} className={`mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug ${couleur}`}>
      {ton === 'erreur' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />}
      {ton === 'ok' && <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

function Pastille({ etat }: { etat: EtatAcces }) {
  const s = !etat.configure
    ? { texte: 'Pas encore créé', classes: 'bg-white/5 border-white/15 text-gray-300', point: 'bg-gray-400' }
    : etat.desactive
      ? { texte: 'Désactivé', classes: 'bg-red-500/10 border-red-500/40 text-red-300', point: 'bg-red-500' }
      : etat.anomalie
        ? { texte: 'Bloqué : à remettre en ordre', classes: 'bg-amber-500/10 border-amber-500/40 text-amber-200', point: 'bg-amber-400' }
        : { texte: 'Actif', classes: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', point: 'bg-emerald-400' };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${s.classes}`}>
      <span className={`h-2 w-2 rounded-full ${s.point}`} aria-hidden />
      {s.texte}
    </span>
  );
}

/** Copie de secours pour les navigateurs sans presse-papiers moderne (anciens Android, page non sécurisée). */
function copierALancienne(texte: string): boolean {
  try {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(zone);
    return ok;
  } catch {
    return false;
  }
}

function BoutonCopier({ texte }: { texte: string }) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos');
  const minuterie = useRef<number | null>(null);
  useEffect(() => () => { if (minuterie.current) window.clearTimeout(minuterie.current); }, []);

  const copier = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texte);
      ok = true;
    } catch {
      ok = copierALancienne(texte);
    }
    setEtat(ok ? 'copie' : 'echec');
    if (minuterie.current) window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setEtat('repos'), ok ? 2500 : 5000);
  };

  return (
    <>
      <button
        type="button"
        onClick={copier}
        className={`min-h-[44px] flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold border transition-colors ${
          etat === 'copie'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-white/5 border-white/10 text-gray-100 hover:bg-white/10'
        }`}
      >
        {etat === 'copie' ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
        {etat === 'copie' ? 'Copié' : 'Copier'}
      </button>
      <span className="sr-only" role="status">{etat === 'copie' ? 'Lien copié.' : ''}</span>
      {etat === 'echec' && (
        <p className="basis-full text-[13px] text-amber-300">
          La copie n&apos;a pas marché sur cet appareil : recopiez le lien à la main.
        </p>
      )}
    </>
  );
}

// ─── Présentation ─────────────────────────────────────────────────────────────

function Presentation() {
  return (
    <section className={`${CARTE} p-4 md:p-6`} aria-labelledby="acces-equipe-intro">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#C8102E]/15 text-[#E0314D] flex items-center justify-center flex-shrink-0" aria-hidden>
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 id="acces-equipe-intro" className="text-white font-semibold text-base">L&apos;espace de l&apos;équipe</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-300">
            Un seul accès pour toute l&apos;équipe. Avec lui, l&apos;équipe voit et traite les commandes de la boutique
            et les demandes des clients, rien d&apos;autre (pas de gestion des produits, pas de chiffre d&apos;affaires,
            pas de publication).
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">L&apos;équipe peut</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-200">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden />Appeler, confirmer et préparer les commandes</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden />Imprimer les bons de livraison</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden />Répondre aux demandes des clients</li>
            <li className="flex gap-2"><Eye className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden />Voir le détail des commandes : articles, prix, nom, téléphone et adresse du client</li>
          </ul>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">L&apos;équipe n&apos;a pas accès à</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
            <li className="flex gap-2"><Ban className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden />La modification des produits, des prix et des catégories</li>
            <li className="flex gap-2"><Ban className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden />Le tableau de bord (chiffre d&apos;affaires) et le fichier clients</li>
            <li className="flex gap-2"><Ban className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden />Le stock, la gestion et la publication du site</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── État de l'accès ──────────────────────────────────────────────────────────

function Info({ icone, libelle, children }: { icone: ReactNode; libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="w-9 h-9 rounded-lg bg-white/5 text-gray-300 flex items-center justify-center flex-shrink-0" aria-hidden>
        {icone}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{libelle}</p>
        <div className="text-sm text-white font-semibold break-words">{children}</div>
      </div>
    </div>
  );
}

/** Le compte ne correspond plus à ce qui est enregistré : ce qui s'est passé, et le geste qui répare. */
function AvertissementAnomalie({ anomalie }: { anomalie: Anomalie }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm leading-relaxed text-amber-100">
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-px text-amber-300" aria-hidden />
      {anomalie === 'email_modifie' ? (
        <p>
          <strong className="font-semibold">Le compte de l&apos;équipe a été modifié depuis un navigateur</strong>{' '}
          (son adresse de connexion a changé, pas depuis cet écran). Par sécurité, l&apos;équipe est bloquée.
          Choisissez un <strong className="font-semibold">nouveau mot de passe</strong> ci-dessous et enregistrez :
          le compte est remis en ordre et toutes les sessions ouvertes sont fermées.
        </p>
      ) : (
        <p>
          <strong className="font-semibold">Le dernier changement de nom d&apos;utilisateur ne s&apos;est pas enregistré jusqu&apos;au bout.</strong>{' '}
          L&apos;équipe est bloquée en attendant : appuyez sur « Enregistrer » ci-dessous pour le terminer.
        </p>
      )}
    </div>
  );
}

function CarteEtat({ lecture, erreur, etat, onReessayer }: {
  lecture: 'chargement' | 'ok' | 'erreur';
  erreur: string;
  etat: EtatAcces | null;
  onReessayer: () => void;
}) {
  return (
    <section className={`${CARTE} overflow-hidden`} aria-labelledby="acces-equipe-etat" aria-busy={lecture === 'chargement'}>
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="acces-equipe-etat" className="text-white font-semibold text-base">État de l&apos;accès</h2>
        {lecture === 'ok' && etat && <Pastille etat={etat} />}
      </div>

      <div className="px-4 md:px-6 py-5 space-y-5">
        {lecture === 'chargement' && (
          <div className="flex items-center gap-3 text-sm text-gray-300" role="status">
            <Loader2 className="w-5 h-5 animate-spin text-[#C8102E]" aria-hidden />
            Lecture de l&apos;accès de l&apos;équipe…
          </div>
        )}

        {lecture === 'erreur' && (
          <div className="space-y-3">
            <BandeauMessage message={{ ton: 'erreur', texte: erreur }} />
            <button type="button" onClick={onReessayer}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl border border-white/15 text-sm font-semibold text-gray-100 hover:bg-white/5">
              <RefreshCw className="w-4 h-4" aria-hidden />
              Réessayer
            </button>
          </div>
        )}

        {lecture === 'ok' && etat && (
          <>
            <p className="text-sm text-gray-300 leading-relaxed">
              {!etat.configure
                ? "L'équipe n'a pas encore d'accès. Créez-le ci-dessous : il sera prêt tout de suite."
                : etat.desactive
                  ? "L'équipe ne peut plus se connecter. Réactivez l'accès plus bas pour la laisser entrer."
                  : etat.anomalie
                    ? "L'équipe ne peut plus rien faire pour le moment : l'accès est à remettre en ordre (voir ci-dessous)."
                    : "L'équipe peut se connecter avec le nom d'utilisateur ci-dessous et le mot de passe que vous lui avez donné."}
            </p>

            {etat.configure && etat.anomalie && <AvertissementAnomalie anomalie={etat.anomalie} />}

            {etat.configure && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Info icone={<UserRound className="w-4 h-4" />} libelle="Nom d'utilisateur">
                  <span className="font-mono">{etat.identifiant || '—'}</span>
                </Info>
                <Info icone={<Clock className="w-4 h-4" />} libelle="Dernière connexion">
                  {etat.derniereConnexion ? dateHeure(etat.derniereConnexion) : <span className="text-gray-300 font-medium">Pas encore de connexion</span>}
                </Info>
                {(etat.creeLe || etat.majLe) && (
                  <p className="sm:col-span-2 text-xs text-gray-400">
                    {etat.creeLe && <>Créé {dateHeure(etat.creeLe).replace(/^(\d)/, 'le $1')}</>}
                    {etat.creeLe && etat.majLe && ' · '}
                    {etat.majLe && <>Modifié {dateHeure(etat.majLe).replace(/^(\d)/, 'le $1')}</>}
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-gray-400" aria-hidden />
                Lien à donner à l&apos;équipe
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[12rem] min-h-[44px] flex items-center px-4 rounded-xl bg-[#0F0F0F] border border-white/10 font-mono text-[15px] text-white select-all break-all">
                  {LIEN_AFFICHE}
                </span>
                <BoutonCopier texte={LIEN_COPIE} />
              </div>
              <Aide>
                Pour l&apos;essayer vous-même, ouvrez ce lien dans une fenêtre de navigation privée ou sur un autre appareil.
              </Aide>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Champ mot de passe (avec l'œil pour afficher / masquer) ──────────────────

function ChampMotDePasse({
  id, refChamp, valeur, onChange, onBlur, visible, onBasculer, invalide, descriptionId, disabled, placeholder,
}: {
  id: string;
  refChamp: Ref<HTMLInputElement>;
  valeur: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  visible: boolean;
  onBasculer: () => void;
  invalide: boolean;
  descriptionId: string;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        ref={refChamp}
        type={visible ? 'text' : 'password'}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        // « new-password » : le navigateur ne remplit pas ici le mot de passe du patron.
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalide || undefined}
        aria-describedby={descriptionId}
        className={`${CHAMP} pr-14 ${invalide ? 'border-red-500/60' : 'border-white/10'}`}
      />
      <button
        type="button"
        onClick={onBasculer}
        aria-controls={id}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
      >
        {visible ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
      </button>
    </div>
  );
}

// ─── Formulaire : créer ou modifier ───────────────────────────────────────────

/** Ce que l'on dit au patron après un enregistrement réussi : ce qui change vraiment pour l'équipe. */
function messageEnregistre({ creation, nouveauMotDePasse, idChange, nom, desactive }: {
  creation: boolean; nouveauMotDePasse: boolean; idChange: boolean; nom: string; desactive: boolean;
}): string {
  if (creation) {
    return `Accès créé. Donnez à l'équipe le lien ${LIEN_AFFICHE}, le nom d'utilisateur « ${nom} » et le mot de passe que vous venez de choisir.`;
  }
  // Un accès désactivé le reste (ce formulaire ne le réactive pas) : ne pas laisser croire que l'équipe peut entrer.
  if (desactive) {
    return `${nouveauMotDePasse ? 'Mot de passe enregistré' : "Nom d'utilisateur enregistré"}. L'accès reste désactivé : `
      + "réactivez-le plus bas pour que l'équipe puisse entrer.";
  }
  if (nouveauMotDePasse) {
    return "Enregistré. Les sessions de l'équipe sont fermées : ses actions sont bloquées tout de suite, et chaque écran "
      + 'revient à la page de connexion dans les minutes qui suivent. '
      + `Elle se reconnecte avec ${idChange ? `le nom d'utilisateur « ${nom} » et ` : ''}le nouveau mot de passe.`;
  }
  return idChange
    ? `Enregistré. L'équipe se connecte désormais avec le nom d'utilisateur « ${nom} ».`
    : `Accès remis en ordre. L'équipe se connecte avec le nom d'utilisateur « ${nom} ».`;
}

function FormulaireAcces({ etat, onEtat }: { etat: EtatAcces; onEtat: (e: EtatAcces) => void }) {
  const creation = !etat.configure;
  const base = useId();
  const ids = {
    identifiant: `${base}-identifiant`,
    aideIdentifiant: `${base}-aide-identifiant`,
    motDePasse: `${base}-mdp`,
    aideMotDePasse: `${base}-aide-mdp`,
    confirmation: `${base}-confirmation`,
    aideConfirmation: `${base}-aide-confirmation`,
  };
  const refIdentifiant = useRef<HTMLInputElement>(null);
  const refMotDePasse = useRef<HTMLInputElement>(null);
  const refConfirmation = useRef<HTMLInputElement>(null);

  const [identifiant, setIdentifiant] = useState(etat.identifiant);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [voirConfirmation, setVoirConfirmation] = useState(false);
  // Les erreurs d'un champ n'apparaissent qu'une fois le champ quitté (ou au premier envoi) :
  // « Au moins 3 caractères » dès la première lettre tapée ne ferait que gêner.
  const [quittes, setQuittes] = useState({ identifiant: false, motDePasse: false, confirmation: false });
  const [essai, setEssai] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoiRef = useRef(false); // deux appuis rapides n'envoient qu'une fois
  const [message, setMessage] = useState<Message | null>(null);

  const id = normaliserIdentifiant(identifiant);
  const raisonId = problemeIdentifiant(id);
  const idChange = !creation && id !== etat.identifiant;
  const mdpSaisi = motDePasse !== '' || confirmation !== '';
  // Compte modifié depuis un navigateur : la route exige un nouveau mot de passe pour le remettre en ordre.
  const mdpExige = creation || etat.anomalie === 'email_modifie';
  const raisonMdp = motDePasse
    ? motDePasseAcceptable(motDePasse, id) // même contrôle que le serveur, nom d'utilisateur compris
    : creation
      ? 'Choisissez un mot de passe.'
      : mdpExige
        ? 'Choisissez un nouveau mot de passe pour remettre le compte en ordre.'
        : confirmation
          ? "Tapez d'abord le nouveau mot de passe."
          : null;
  const raisonConf = mdpExige || mdpSaisi
    ? confirmation === ''
      ? 'Retapez le mot de passe pour le confirmer.'
      : confirmation !== motDePasse
        ? 'Les deux mots de passe ne sont pas identiques.'
        : null
    : null;
  // Accès à remettre en ordre : un simple « Enregistrer » répare (nom), rien n'est alors « inchangé ».
  const rienAChanger = !creation && !idChange && !mdpSaisi && !etat.anomalie;

  const erreurId = !!raisonId && (essai || (quittes.identifiant && id !== ''));
  const erreurMdp = !!raisonMdp && (essai || (quittes.motDePasse && motDePasse !== ''));
  const erreurConf = !!raisonConf && (essai || (confirmation !== '' && (quittes.confirmation || confirmation.length >= motDePasse.length)));

  const quitter = (champ: keyof typeof quittes) => setQuittes(q => (q[champ] ? q : { ...q, [champ]: true }));

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoiRef.current) return;
    setEssai(true);
    setMessage(null);
    if (raisonId) { refIdentifiant.current?.focus(); return; }
    if (raisonMdp) { refMotDePasse.current?.focus(); return; }
    if (raisonConf) { refConfirmation.current?.focus(); return; }
    if (rienAChanger) return;

    const corps: { identifiant: string; motDePasse?: string } = { identifiant: id };
    if (motDePasse) corps.motDePasse = motDePasse;

    envoiRef.current = true;
    setEnvoi(true);
    try {
      const nouvel = await appelerRoute(corps);
      onEtat(nouvel);
      const nom = nouvel.identifiant || id;
      setIdentifiant(nom);
      // Le mot de passe ne reste nulle part à l'écran une fois enregistré.
      setMotDePasse('');
      setConfirmation('');
      setVoirMotDePasse(false);
      setVoirConfirmation(false);
      setEssai(false);
      setQuittes({ identifiant: false, motDePasse: false, confirmation: false });
      setMessage({ ton: 'ok', texte: messageEnregistre({ creation, nouveauMotDePasse: !!corps.motDePasse, idChange, nom, desactive: nouvel.desactive }) });
    } catch (err) {
      setMessage({ ton: 'erreur', texte: err instanceof Error ? err.message : "L'enregistrement a échoué. Réessayez." });
      if (err instanceof Error && estNomDejaPris(err.message)) refIdentifiant.current?.focus();
    } finally {
      envoiRef.current = false;
      setEnvoi(false);
    }
  };

  // Toute nouvelle saisie efface le message précédent (réussite ou erreur) : il ne décrit plus l'écran.
  const saisie = <T,>(maj: (v: T) => void) => (v: T) => { maj(v); if (message) setMessage(null); };

  const aideMdpNeutre = `Au moins ${MOT_DE_PASSE_MIN} caractères. Évitez le nom du magasin ou un numéro de téléphone.`;

  return (
    <section className={`${CARTE} overflow-hidden`} aria-labelledby="acces-equipe-formulaire">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex items-start gap-3">
        <KeyRound className="w-5 h-5 text-[#E0314D] flex-shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <h2 id="acces-equipe-formulaire" className="text-white font-semibold text-base">
            {creation ? "Créer l'accès de l'équipe" : "Modifier l'accès"}
          </h2>
          <p className="mt-0.5 text-sm text-gray-300">
            {creation
              ? "Choisissez un nom d'utilisateur et un mot de passe. Vous les donnerez ensuite à l'équipe."
              : "Changez le nom d'utilisateur ou le mot de passe. Laissez le mot de passe vide pour ne pas le changer."}
          </p>
        </div>
      </div>

      <form onSubmit={envoyer} noValidate className="px-4 md:px-6 py-5 space-y-5">
        {/* Nom d'utilisateur */}
        <div>
          <label htmlFor={ids.identifiant} className="block text-sm font-semibold text-gray-200 mb-1.5">
            Nom d&apos;utilisateur
          </label>
          <input
            id={ids.identifiant}
            ref={refIdentifiant}
            type="text"
            name="identifiant-equipe"
            value={identifiant}
            onChange={e => saisie(setIdentifiant)(normaliserIdentifiant(e.target.value))}
            onBlur={() => quitter('identifiant')}
            // Pas « username » : le navigateur proposerait l'e-mail du patron ou enregistrerait l'accès équipe comme le sien.
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder="ex. equipe"
            disabled={envoi}
            aria-invalid={erreurId || undefined}
            aria-describedby={ids.aideIdentifiant}
            className={`${CHAMP} font-mono ${erreurId ? 'border-red-500/60' : 'border-white/10'}`}
          />
          {erreurId ? (
            <Aide id={ids.aideIdentifiant} ton="erreur">{raisonId}</Aide>
          ) : (
            <Aide id={ids.aideIdentifiant}>
              {REGLE_IDENTIFIANT}
              {idChange && !raisonId && (
                <span className="block mt-1 text-amber-300">
                  L&apos;équipe devra utiliser ce nouveau nom pour se connecter.
                </span>
              )}
            </Aide>
          )}
        </div>

        {/* Mot de passe */}
        <div>
          <label htmlFor={ids.motDePasse} className="block text-sm font-semibold text-gray-200 mb-1.5">
            {creation ? 'Mot de passe' : 'Nouveau mot de passe'}
            {!creation && <span className="ml-1.5 font-normal text-gray-400">(facultatif)</span>}
          </label>
          <ChampMotDePasse
            id={ids.motDePasse}
            refChamp={refMotDePasse}
            valeur={motDePasse}
            onChange={saisie(setMotDePasse)}
            onBlur={() => quitter('motDePasse')}
            visible={voirMotDePasse}
            onBasculer={() => setVoirMotDePasse(v => !v)}
            invalide={erreurMdp}
            descriptionId={ids.aideMotDePasse}
            disabled={envoi}
            placeholder={creation ? undefined : 'Laisser vide pour ne pas le changer'}
          />
          {erreurMdp ? (
            <Aide id={ids.aideMotDePasse} ton="erreur">{raisonMdp}</Aide>
          ) : motDePasse && !raisonMdp ? (
            <Aide id={ids.aideMotDePasse} ton="ok">Mot de passe accepté.</Aide>
          ) : (
            <Aide id={ids.aideMotDePasse}>{aideMdpNeutre}</Aide>
          )}
        </div>

        {/* Confirmation */}
        <div>
          <label htmlFor={ids.confirmation} className="block text-sm font-semibold text-gray-200 mb-1.5">
            Confirmer le mot de passe
          </label>
          <ChampMotDePasse
            id={ids.confirmation}
            refChamp={refConfirmation}
            valeur={confirmation}
            onChange={saisie(setConfirmation)}
            onBlur={() => quitter('confirmation')}
            visible={voirConfirmation}
            onBasculer={() => setVoirConfirmation(v => !v)}
            invalide={erreurConf}
            descriptionId={ids.aideConfirmation}
            disabled={envoi}
          />
          {erreurConf ? (
            <Aide id={ids.aideConfirmation} ton="erreur">{raisonConf}</Aide>
          ) : confirmation && confirmation === motDePasse ? (
            <Aide id={ids.aideConfirmation} ton="ok">Les deux mots de passe sont identiques.</Aide>
          ) : (
            <Aide id={ids.aideConfirmation}>Tapez-le une seconde fois, pour éviter une faute de frappe.</Aide>
          )}
        </div>

        {!creation && (
          <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${
            motDePasse ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/[0.03] text-gray-300'
          }`}>
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${motDePasse ? 'text-amber-300' : 'text-gray-400'}`} aria-hidden />
            <span>
              Changer le mot de passe ferme la session de l&apos;équipe sur tous ses appareils : ses actions sont
              bloquées tout de suite, et chaque écran revient à la page de connexion dans les minutes qui suivent.
            </span>
          </div>
        )}

        {message && <BandeauMessage message={message} onFermer={() => setMessage(null)} />}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
          <button
            type="submit"
            disabled={envoi || rienAChanger}
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-[#C8102E] text-sm font-bold text-white shadow-lg shadow-[#C8102E]/20 hover:bg-[#a50d25] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            {envoi && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {envoi ? 'Enregistrement…' : creation ? "Créer l'accès" : 'Enregistrer'}
          </button>
          {rienAChanger && !message && (
            <p className="text-[13px] text-gray-400">Modifiez le nom d&apos;utilisateur ou tapez un nouveau mot de passe pour enregistrer.</p>
          )}
        </div>
      </form>
    </section>
  );
}

// ─── Désactiver / réactiver ───────────────────────────────────────────────────

function ZoneActivation({ etat, onEtat }: { etat: EtatAcces; onEtat: (e: EtatAcces) => void }) {
  const [boiteOuverte, setBoiteOuverte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoiRef = useRef(false);
  const [message, setMessage] = useState<Message | null>(null);

  const changer = async (desactive: boolean) => {
    if (envoiRef.current) return;
    envoiRef.current = true;
    setEnvoi(true);
    setMessage(null);
    try {
      // L'identifiant enregistré (pas celui du formulaire, peut-être en cours de modification).
      const nouvel = await appelerRoute({ identifiant: etat.identifiant, desactive });
      onEtat(nouvel);
      setMessage({
        ton: 'ok',
        texte: desactive
          ? "Accès désactivé : l'équipe ne peut plus rien enregistrer, ni se connecter. Ses écrans reviennent à la page de connexion dans les minutes qui suivent."
          : "Accès réactivé : l'équipe peut de nouveau se connecter.",
      });
    } catch (err) {
      setMessage({ ton: 'erreur', texte: err instanceof Error ? err.message : 'Le changement a échoué. Réessayez.' });
    } finally {
      envoiRef.current = false;
      setEnvoi(false);
    }
  };

  const desactive = etat.desactive;

  return (
    <section
      className={`rounded-2xl border p-4 md:p-6 ${desactive ? 'bg-[#1A1A1A] border-white/5' : 'bg-red-500/[0.04] border-red-500/20'}`}
      aria-labelledby="acces-equipe-activation"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 id="acces-equipe-activation" className="text-white font-semibold text-base flex items-center gap-2">
            <Power className={`w-4 h-4 ${desactive ? 'text-emerald-400' : 'text-red-400'}`} aria-hidden />
            {desactive ? "Réactiver l'accès" : "Désactiver l'accès"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-300">
            {desactive && etat.anomalie === 'email_modifie'
              // La route refuse de réactiver ce compte sans nouveau mot de passe : on le dit avant l'appui.
              ? "Le compte a été modifié depuis un navigateur : choisissez d'abord un nouveau mot de passe ci-dessus et enregistrez, puis réactivez l'accès."
              : desactive
              ? "L'équipe pourra de nouveau entrer avec le nom d'utilisateur et le mot de passe actuels. Pour les changer, modifiez-les ci-dessus avant de réactiver."
              : "L'équipe ne peut plus rien faire ni se connecter, jusqu'à ce que vous réactiviez l'accès. Si un employé quitte le magasin, changez plutôt le mot de passe : les autres continuent avec le nouveau."}
          </p>
        </div>
        {desactive ? (
          <button
            type="button"
            onClick={() => changer(false)}
            disabled={envoi}
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {envoi && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {envoi ? 'Réactivation…' : "Réactiver l'accès"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setMessage(null); setBoiteOuverte(true); }}
            disabled={envoi}
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 rounded-xl border border-red-500/40 bg-red-500/10 text-sm font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {envoi && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {envoi ? 'Désactivation…' : "Désactiver l'accès"}
          </button>
        )}
      </div>

      {message && <div className="mt-4"><BandeauMessage message={message} onFermer={() => setMessage(null)} /></div>}

      {/* Radix directement (comme les confirmations des commandes) : le thème de ui/ est clair. */}
      <Boite.Root open={boiteOuverte} onOpenChange={setBoiteOuverte}>
        <Boite.Portal>
          <Boite.Overlay className="fixed inset-0 z-[80] bg-black/75 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Boite.Content className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 text-gray-100 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <Boite.Title className="text-lg font-bold text-gray-100 leading-snug">
              Désactiver l&apos;accès de l&apos;équipe ?
            </Boite.Title>
            <Boite.Description asChild>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-300">
                <p>
                  L&apos;équipe ne peut plus rien enregistrer ni se connecter, sur aucun appareil. Ses écrans reviennent
                  à la page de connexion dans les minutes qui suivent.
                </p>
                <p>Les commandes et les demandes des clients ne sont pas touchées. Vous pourrez réactiver l&apos;accès à tout moment.</p>
              </div>
            </Boite.Description>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Boite.Cancel className="h-11 px-4 rounded-xl border border-white/15 text-sm font-semibold text-gray-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60">
                Retour
              </Boite.Cancel>
              <Boite.Action
                onClick={() => changer(true)}
                className="h-11 px-4 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                Désactiver l&apos;accès
              </Boite.Action>
            </div>
          </Boite.Content>
        </Boite.Portal>
      </Boite.Root>
    </section>
  );
}

// ─── Rappel de sécurité ───────────────────────────────────────────────────────

function RappelSecurite() {
  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-white/5 px-4 py-3.5 md:px-6 text-[13px] leading-relaxed text-gray-400">
      <LockKeyhole className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" aria-hidden />
      <p>
        N&apos;envoyez jamais le mot de passe par e-mail : donnez-le de vive voix ou par message privé.
        Il n&apos;est plus affiché ici après l&apos;enregistrement.
      </p>
    </aside>
  );
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export function AccesEquipe(): JSX.Element {
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState<EtatAcces | null>(null);
  // L'écran peut être quitté pendant la lecture : on n'écrit plus rien ensuite.
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => { monte.current = false; };
  }, []);

  const charger = useCallback(async () => {
    setLecture('chargement');
    setErreur('');
    try {
      const lu = await appelerRoute();
      if (!monte.current) return;
      setEtat(lu);
      setLecture('ok');
    } catch (err) {
      if (!monte.current) return;
      setErreur(err instanceof Error ? err.message : "L'accès de l'équipe n'a pas pu être lu.");
      setLecture('erreur');
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const majEtat = useCallback((e: EtatAcces) => { if (monte.current) setEtat(e); }, []);

  return (
    <div className="max-w-2xl space-y-4 md:space-y-5">
      <Presentation />
      <CarteEtat lecture={lecture} erreur={erreur} etat={etat} onReessayer={charger} />
      {/* Tant que l'état n'est pas lu, pas de formulaire : on ne sait pas s'il faut créer ou modifier. */}
      {lecture === 'ok' && etat && (
        <>
          <FormulaireAcces etat={etat} onEtat={majEtat} />
          {etat.configure && <ZoneActivation etat={etat} onEtat={majEtat} />}
        </>
      )}
      <RappelSecurite />
    </div>
  );
}
