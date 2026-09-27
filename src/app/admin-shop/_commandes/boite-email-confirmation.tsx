'use client';

// ─── Aperçu avant d'envoyer la confirmation par e-mail au client ─────────────
// Le commerçant relit ce qui part (destinataire, objet, texte) avant d'appuyer
// sur « Envoyer ». L'envoi est attendu : la boîte reste ouverte tant que Gmail
// n'a pas répondu, et dit clairement pourquoi si ce n'est pas parti.
// Même allure que boites-confirmation.tsx (Radix directement : il faut passer
// au-dessus de la fiche plein écran du téléphone, et le thème de ui/ est clair).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Boite from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Info, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ShopOrder } from '@/lib/shop-types';
import { dateHeure } from '@/lib/commandes-boutique';
import { EMAIL_LEBTEX, delaiLivraisonParDefaut, emailConfirmationClient } from '@/lib/email-confirmation-client';
import { ErreurConfirmationRecente, ErreurEnregistrement, type EmailEnvoye } from './actions-commandes';

type Etat =
  | { cas: 'repos' }
  | { cas: 'envoi' }
  /** 409 : un e-mail est parti (ou part, `enCours`) il y a moins de 2 min. */
  | { cas: 'recente'; le: string; enCours: boolean }
  | { cas: 'erreur'; message: string; incertain: boolean };

export type ResultatEnvoi = EmailEnvoye;

/**
 * En attente, l'e-mail est un accusé de réception (« nous vous appelons ») ;
 * ensuite, une confirmation. Le bouton et la boîte le disent.
 */
export function libelleEmailClient(statut: ShopOrder['status'], dejaEnvoye: boolean): string {
  if (statut === 'pending') return dejaEnvoye ? 'Renvoyer l’accusé de réception par e-mail' : 'Envoyer l’accusé de réception par e-mail';
  return dejaEnvoye ? 'Renvoyer la confirmation par e-mail' : 'Envoyer la confirmation par e-mail';
}

export function BoiteEmailConfirmation({
  commande, emailClient, ouverte, dejaEnvoyee, maintenant, envoyer, onFermer, onEnvoye,
}: {
  commande: ShopOrder;
  /** L'adresse telle que la fiche l'affiche (le serveur relit la sienne dans la commande). */
  emailClient: string;
  ouverte: boolean;
  /** Un e-mail du même genre (accusé ou confirmation) est déjà parti : on parle de « renvoyer ». */
  dejaEnvoyee: boolean;
  maintenant: number;
  envoyer: (options: { forcer: boolean; delai: string }) => Promise<ResultatEnvoi>;
  onFermer: () => void;
  onEnvoye: (r: ResultatEnvoi) => void;
}) {
  const { toast } = useToast();
  const idMessage = useId();
  const [etat, setEtat] = useState<Etat>({ cas: 'repos' });
  // Délai annoncé au client : celui du barème pour sa ville, modifiable (« 24-48h »…) ; vide = pas de délai dans l'e-mail.
  const [delai, setDelai] = useState('');
  const idDelai = useId();
  const verrou = useRef(false);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  useEffect(() => {
    if (ouverte) {
      setEtat({ cas: 'repos' });
      setDelai(delaiLivraisonParDefaut(commande));
    }
    // Pré-rempli à l'ouverture seulement : ce que tape le commerçant n'est pas écrasé par une mise à jour de la commande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte]);

  // Le texte exact qui partira : le serveur le reconstruit depuis la commande, remise
  // d'aplomb par le même normaliserCommande que celle affichée ici.
  const apercu = useMemo(
    () => (ouverte ? emailConfirmationClient(commande, { delaiLivraison: delai }) : null),
    [ouverte, commande, delai],
  );
  const enEnvoi = etat.cas === 'envoi';

  async function lancer(forcer: boolean) {
    if (verrou.current) return;
    verrou.current = true;
    setEtat({ cas: 'envoi' });
    try {
      const r = await envoyer({ forcer, delai });
      // Même si la fiche s'est fermée entre-temps : le parent affiche le message de réussite.
      onEnvoye(r);
    } catch (e) {
      const err = e as Error;
      const message = err?.message || 'L’e-mail n’est pas parti. Réessayez.';
      if (!monte.current) {
        // Boîte déjà démontée : le message à l'écran est le seul moyen de le dire.
        toast({ variant: 'destructive', title: `E-mail non envoyé (${commande.orderNumber})`, description: message });
        return;
      }
      if (e instanceof ErreurConfirmationRecente) {
        setEtat({ cas: 'recente', le: e.dejaEnvoyeeLe, enCours: e.enCours });
      } else {
        setEtat({ cas: 'erreur', message, incertain: e instanceof ErreurEnregistrement && e.peutEtreFait });
      }
    } finally {
      verrou.current = false;
    }
  }

  const enAttente = commande.status === 'pending';
  const titre = libelleEmailClient(commande.status, dejaEnvoyee);
  // Pendant un envoi en cours (autre appui, ou fonction coupée il y a moins d'une
  // minute), on ne propose pas de forcer : ce serait le double e-mail assuré.
  const forcerAuProchain = etat.cas === 'recente' && !etat.enCours;

  return (
    <Boite.Root
      open={ouverte}
      // Pendant l'envoi, ni Échap ni « Annuler » : on attend la réponse de Gmail (bornée à ~35 s).
      onOpenChange={o => { if (!o && !enEnvoi) onFermer(); }}
    >
      <Boite.Portal>
        <Boite.Overlay className="fixed inset-0 z-[80] bg-black/75 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Boite.Content
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 text-gray-100 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Boite.Title className="text-lg font-bold leading-snug text-gray-100">{titre}</Boite.Title>
          <Boite.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-gray-300">
              Relisez le message : le client le reçoit tel quel, mis en page. S’il répond, sa réponse arrive dans {EMAIL_LEBTEX}.
            </div>
          </Boite.Description>

          {enAttente && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-sm text-gray-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span>
                La commande est encore « en attente » : l’e-mail dit au client qu’on va l’appeler.
                Si c’est déjà fait, confirmez d’abord la commande.
              </span>
            </p>
          )}

          {apercu && (
            <>
              <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 rounded-xl border border-white/10 bg-[#141414] px-3 py-2.5 text-sm">
                <dt className="text-gray-400">À</dt>
                <dd className="min-w-0 break-all font-semibold text-gray-100">{emailClient}</dd>
                <dt className="text-gray-400">De</dt>
                <dd className="min-w-0 break-words text-gray-200">{EMAIL_LEBTEX} — adresse du site</dd>
                <dt className="text-gray-400">Objet</dt>
                <dd className="min-w-0 break-words text-gray-100" dir="auto">{apercu.sujet}</dd>
              </dl>

              <label htmlFor={idDelai} className="mt-4 block text-sm font-semibold text-gray-200">Délai de livraison annoncé</label>
              <input
                id={idDelai}
                type="text"
                value={delai}
                onChange={e => setDelai(e.target.value)}
                maxLength={30}
                disabled={enEnvoi}
                placeholder="ex. 24-48h — laisser vide pour ne pas en parler"
                className="mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-[#141414] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none disabled:opacity-60 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">L’e-mail dira « la livraison est prévue sous … ».</p>

              <p className="mt-4 text-sm font-semibold text-gray-200" id={idMessage}>Message</p>
              <pre
                tabIndex={0}
                aria-labelledby={idMessage}
                dir="auto"
                className="mt-1.5 max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#141414] p-3 font-sans text-sm leading-relaxed text-gray-200 focus:border-white/30 focus:outline-none"
              >
                {apercu.texte}
              </pre>
            </>
          )}

          <div aria-live="polite">
            {etat.cas === 'recente' && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">Rien n’est parti cette fois.</strong>{' '}
                  {etat.enCours
                    ? `Un envoi est déjà en cours pour ce client (lancé ${dateHeure(etat.le, maintenant)}). Attendez une minute puis réessayez : s’il est parti entre-temps, la fiche l’indiquera.`
                    : `Un e-mail vient déjà d’être envoyé à ce client (${dateHeure(etat.le, maintenant)}). Vous pouvez le renvoyer quand même.`}
                </span>
              </p>
            )}
            {etat.cas === 'erreur' && (
              etat.incertain ? (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span><strong className="font-semibold">À vérifier.</strong> {etat.message}</span>
                </p>
              ) : (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span><strong className="font-semibold text-red-100">E-mail non envoyé.</strong> {etat.message}</span>
                </p>
              )
            )}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boite.Cancel
              disabled={enEnvoi}
              className="h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            >
              Annuler
            </Boite.Cancel>
            {/* Pas Boite.Action : elle fermerait la boîte avant de savoir si l'e-mail est parti. */}
            <button
              type="button"
              onClick={() => void lancer(forcerAuProchain)}
              disabled={enEnvoi || !apercu}
              aria-busy={enEnvoi}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-bold text-white hover:bg-[#A50D26] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              {enEnvoi
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Envoi en cours…</>
                : <><Send className="h-4 w-4" aria-hidden /> {forcerAuProchain ? 'Renvoyer quand même' : etat.cas === 'recente' ? 'Réessayer' : 'Envoyer'}</>}
            </button>
          </div>
        </Boite.Content>
      </Boite.Portal>
    </Boite.Root>
  );
}
