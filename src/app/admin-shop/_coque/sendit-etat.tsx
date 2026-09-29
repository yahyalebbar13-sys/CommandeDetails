'use client';

// ─── Carte « Sendit » de l'écran Réception & paiement ────────────────────────
// Dit au patron où en est le branchement avec Sendit, sans jamais afficher une
// clé : variables posées ou non sur Vercel, connexion (compte, échéance du
// jeton), ville de ramassage, nombre de quartiers, statuts du compte, et le
// webhook à déclarer dans Sendit avec le dernier appel reçu.
//
// Lecture seule : /api/admin/sendit/etat (administrateur). « Tester la
// connexion » se reconnecte à neuf ; rien n'est créé chez Sendit.

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, Loader2, RefreshCw, Truck, X } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { dateHeure } from '@/lib/commandes-boutique';
import { copierTexte } from '../_commandes/elements';

interface Variables {
  clePublique: boolean;
  clePrivee: boolean;
  secretWebhook: boolean;
  jetonWebhook: boolean;
  ramassage: number | null;
}

interface DernierWebhook {
  le: string | null;
  nombre: number;
  format: string;
  preuve: string;
  commandeTrouvee: boolean;
  resultat: string;
  champs: string[];
  evenement: { event: string; statut: string; ancienStatut: string; statutRetour: string; lastActionAt: string };
}

interface RefusWebhook {
  le: string | null;
  nombre: number;
  signature: 'absente' | 'hex' | 'base64' | 'autre';
  jeton: boolean;
  signeeAvecClePublique: boolean;
}

/** Ce qu'un appel refusé veut dire, et quoi faire, en une phrase. */
function conseilRefus(r: RefusWebhook): string {
  if (r.signeeAvecClePublique) {
    return 'Sendit signe avec la clé PUBLIQUE : recopiez-la aussi dans SENDIT_WEBHOOK_SECRET sur Vercel, puis redéployez.';
  }
  if (r.signature !== 'absente') {
    return 'La signature ne correspond ni à SENDIT_WEBHOOK_SECRET ni à la clé privée : vérifiez la clé choisie dans Sendit, ou passez par « ?token= ».';
  }
  if (r.jeton) return 'Le jeton de l’adresse ne correspond pas à SENDIT_WEBHOOK_TOKEN : recopiez l’adresse complète dans Sendit.';
  return 'Appel sans signature ni jeton : ajoutez « ?token= » et la valeur de SENDIT_WEBHOOK_TOKEN à la fin de l’adresse dans Sendit. Si ce n’est pas Sendit, ignorez.';
}

interface EtatSendit {
  configure: boolean;
  connecte?: boolean;
  erreur?: string;
  compte?: string;
  jetonExpireLe?: string | null;
  jetonGardeJusquA?: string;
  villesRamassage?: { id: number; name: string }[];
  ramassage?: { id: number; nom: string; source: 'variable' | 'automatique' } | null;
  statuts?: { code: string; libelle: string }[];
  nombreQuartiers?: number | null;
  erreurs?: string[];
  variables: Variables;
  webhook: { url: string; dernier: DernierWebhook | null; refus?: RefusWebhook | null };
}

const ROUTE = '/api/admin/sendit/etat';
const CARTE = 'bg-[#1A1A1A] rounded-2xl border border-white/5';
const BOUTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-gray-100 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';

const quand = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const t = dateHeure(iso);
  return /^\d/.test(t) ? `le ${t}` : t;
};

function Pastille({ ton, children }: { ton: 'ok' | 'erreur' | 'neutre'; children: ReactNode }) {
  const styles = {
    ok: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    erreur: 'border-red-500/40 bg-red-500/15 text-red-200',
    neutre: 'border-white/15 bg-white/5 text-gray-300',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[ton]}`}>{children}</span>;
}

function Variable({ nom, posee, role, facultative = false }: { nom: string; posee: boolean; role: string; facultative?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      {posee
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-label="posée" />
        : <X className={`mt-0.5 h-4 w-4 shrink-0 ${facultative ? 'text-gray-400' : 'text-red-400'}`} aria-label="pas posée" />}
      <span className="min-w-0 text-sm">
        <code className="font-mono text-gray-100">{nom}</code>
        <span className="text-gray-400"> · {posee ? 'posée' : facultative ? 'facultative, pas posée' : 'à poser'} · {role}</span>
      </span>
    </li>
  );
}

function Info({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 px-3.5 py-2.5">
      <p className="text-xs text-gray-400">{libelle}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-100 break-words">{children}</p>
    </div>
  );
}

export function CarteSenditEtat() {
  const idTitre = useId();
  const [etat, setEtat] = useState<EtatSendit | null>(null);
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState('');
  const [test, setTest] = useState(false);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async (tester = false) => {
    if (tester) setTest(true);
    else setLecture('chargement');
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), 35_000);
    try {
      const rep = await authedFetch(`${ROUTE}${tester ? '?tester=1' : ''}`, { cache: 'no-store', signal: controleur.signal });
      const corps = await rep.json().catch(() => null);
      if (!rep.ok) throw new Error(String(corps?.error || 'État de Sendit illisible.'));
      setEtat(corps as EtatSendit);
      setLecture('ok');
    } catch (e) {
      setErreur((e as Error)?.name === 'AbortError' ? 'Le serveur n’a pas répondu à temps. Réessayez.' : (e as Error)?.message || 'État de Sendit illisible.');
      setLecture('erreur');
    } finally {
      clearTimeout(minuterie);
      setTest(false);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  useEffect(() => {
    if (!copie) return;
    const t = window.setTimeout(() => setCopie(false), 2500);
    return () => window.clearTimeout(t);
  }, [copie]);

  const pastille = !etat
    ? null
    : !etat.configure
      ? <Pastille ton="neutre">Pas encore branché</Pastille>
      : etat.connecte
        ? <Pastille ton="ok"><Check className="h-3.5 w-3.5" aria-hidden /> Connecté</Pastille>
        : <Pastille ton="erreur"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Connexion refusée</Pastille>;

  // Un refus ne compte que s'il est plus récent que le dernier appel accepté : sinon c'est déjà réglé.
  const refus = etat?.webhook.refus;
  const accepteLe = etat?.webhook.dernier?.le;
  const refusRecent = !!refus?.le && (!accepteLe || Date.parse(refus.le) > Date.parse(accepteLe));

  const nomRamassage = etat?.ramassage
    ? etat.ramassage.nom || etat.villesRamassage?.find(v => v.id === etat.ramassage?.id)?.name || `n° ${etat.ramassage.id}`
    : '';

  return (
    <section className={`${CARTE} overflow-hidden`} aria-labelledby={idTitre} aria-busy={lecture === 'chargement'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-4 md:px-6">
        <h2 id={idTitre} className="flex items-center gap-2 text-base font-semibold text-white">
          <Truck className="h-5 w-5 text-gray-400" aria-hidden /> Sendit (livraison des colis)
        </h2>
        {pastille}
      </div>

      <div className="space-y-5 px-4 py-5 md:px-6">
        {lecture === 'chargement' && (
          <p className="flex items-center gap-3 text-sm text-gray-300" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-[#C8102E]" aria-hidden /> Lecture de l’état de Sendit…
          </p>
        )}

        {lecture === 'erreur' && (
          <div className="space-y-3">
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {erreur}
            </p>
            <button type="button" onClick={() => void charger()} className={BOUTON}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
            </button>
          </div>
        )}

        {lecture === 'ok' && etat && (
          <>
            <p className="text-sm leading-relaxed text-gray-300">
              {!etat.configure
                ? 'Le site est prêt, mais les clés Sendit ne sont pas encore posées : l’équipe crée les colis sur app.sendit.ma en attendant.'
                : etat.connecte
                  ? 'Le site parle à Sendit : l’équipe peut créer les colis, imprimer les étiquettes A4 et demander le ramassage depuis la fiche d’une commande.'
                  : 'Les clés sont posées, mais Sendit refuse la connexion.'}
            </p>

            {etat.configure && !etat.connecte && etat.erreur && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {etat.erreur}
              </p>
            )}

            {etat.connecte && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Info libelle="Compte Sendit">{etat.compte || '—'}</Info>
                <Info libelle="Connexion valable jusqu’à">{quand(etat.jetonGardeJusquA)}{etat.jetonExpireLe ? ` (jeton : ${quand(etat.jetonExpireLe)})` : ''}</Info>
                <Info libelle="Ville de ramassage">
                  {etat.ramassage ? `${nomRamassage} (${etat.ramassage.source === 'variable' ? 'choisie dans SENDIT_PICKUP_DISTRICT_ID' : 'trouvée automatiquement'})` : 'introuvable'}
                </Info>
                <Info libelle="Quartiers Sendit">{typeof etat.nombreQuartiers === 'number' ? etat.nombreQuartiers : '—'}</Info>
              </div>
            )}

            {etat.erreurs && etat.erreurs.length > 0 && (
              <ul className="space-y-1 text-sm text-amber-200">
                {etat.erreurs.map(e => <li key={e} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e}</li>)}
              </ul>
            )}

            {etat.connecte && (etat.villesRamassage?.length ?? 0) > 1 && (
              <details>
                <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-gray-300 hover:text-white">
                  Villes de ramassage ({etat.villesRamassage!.length})
                </summary>
                <p className="mb-2 text-xs text-gray-400">
                  Pour en imposer une, mettez son numéro dans SENDIT_PICKUP_DISTRICT_ID sur Vercel.
                </p>
                <ul className="grid gap-1 text-sm text-gray-300 sm:grid-cols-2">
                  {etat.villesRamassage!.map(v => <li key={v.id}><span className="font-mono text-gray-400">{v.id}</span> · {v.name}</li>)}
                </ul>
              </details>
            )}

            {etat.connecte && (etat.statuts?.length ?? 0) > 0 && (
              <details>
                <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-gray-300 hover:text-white">
                  Statuts du compte Sendit ({etat.statuts!.length})
                </summary>
                <ul className="grid gap-1 text-sm text-gray-300 sm:grid-cols-2">
                  {etat.statuts!.map(s => <li key={s.code}><span className="font-mono text-gray-400">{s.code}</span> · {s.libelle}</li>)}
                </ul>
              </details>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-200">Variables sur Vercel (Production, cochées « Sensitive »)</p>
              <ul className="mt-1 divide-y divide-white/5">
                <Variable nom="SENDIT_PUBLIC_KEY" posee={etat.variables.clePublique} role="la clé publique" />
                <Variable nom="SENDIT_PRIVATE_KEY" posee={etat.variables.clePrivee} role="la clé privée" />
                <Variable nom="SENDIT_WEBHOOK_SECRET" posee={etat.variables.secretWebhook} facultative
                  role="la clé qui signe le webhook (sans elle, la clé privée est essayée)" />
                <Variable nom="SENDIT_WEBHOOK_TOKEN" posee={etat.variables.jetonWebhook} facultative
                  role="au moins 24 caractères, si Sendit ne signe pas" />
                <Variable nom="SENDIT_PICKUP_DISTRICT_ID" posee={etat.variables.ramassage !== null} facultative
                  role="ville de ramassage (sinon Casablanca)" />
              </ul>
              {!etat.configure && (
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  Les clés se créent dans app.sendit.ma → Paramètres → Intégrations API. Collez-les vous-même dans Vercel
                  (jamais dans un message ni dans le code), puis redéployez le site.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-200">Webhook (statuts des colis en direct)</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 break-all rounded-lg bg-[#0F0F0F] px-3 py-2 font-mono text-sm text-gray-100">{etat.webhook.url}</code>
                <button type="button" onClick={async () => setCopie(await copierTexte(etat.webhook.url))} className={BOUTON}>
                  <span aria-live="polite" className="inline-flex items-center gap-2">
                    {copie ? <><Check className="h-4 w-4 text-emerald-300" aria-hidden /> Copiée</> : <><ClipboardCopy className="h-4 w-4" aria-hidden /> Copier</>}
                  </span>
                </button>
              </div>
              <p className="text-xs leading-relaxed text-gray-400">
                Dans Sendit : API → Intégration Webhook → Créer un webhook. Collez cette adresse, événement « Mise à jour du
                statut du colis », et choisissez la clé API posée sur Vercel. Si Sendit ne signe pas ses envois, ajoutez
                à la fin de l’adresse « ?token= » suivi de la valeur de SENDIT_WEBHOOK_TOKEN.
              </p>
              {etat.webhook.dernier?.le ? (
                <div className="rounded-xl bg-white/5 px-3.5 py-2.5 text-sm text-gray-300">
                  <p>
                    Dernier appel reçu {quand(etat.webhook.dernier.le)} ({etat.webhook.dernier.nombre} au total) ·
                    forme {etat.webhook.dernier.format || '—'} · preuve : {etat.webhook.dernier.preuve || '—'}
                  </p>
                  <p className="mt-0.5 text-gray-400">
                    {etat.webhook.dernier.evenement.statut
                      ? `Statut ${etat.webhook.dernier.evenement.ancienStatut ? `${etat.webhook.dernier.evenement.ancienStatut} → ` : ''}${etat.webhook.dernier.evenement.statut}`
                      : 'Statut illisible'}
                    {' · '}{etat.webhook.dernier.commandeTrouvee ? 'commande retrouvée' : 'aucune commande rattachée'}
                    {etat.webhook.dernier.champs.length ? ` · champs : ${etat.webhook.dernier.champs.join(', ')}` : ''}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun appel de Sendit reçu pour l’instant.</p>
              )}
              {refusRecent && etat.webhook.refus && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Appel refusé {quand(etat.webhook.refus.le)} (signature : {etat.webhook.refus.signature}
                    {etat.webhook.refus.jeton ? ', jeton présent' : ''}). {conseilRefus(etat.webhook.refus)}
                  </span>
                </div>
              )}
            </div>

            {etat.configure && (
              <button type="button" onClick={() => void charger(true)} disabled={test} className={BOUTON}>
                {test ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                Tester la connexion
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
