'use client';

// ─── Emails d'un dossier d'arrivage ───────────────────────────────────────────
// Cherche dans toute la boîte mail (et pas seulement les derniers messages) les
// emails qui parlent de ce dossier, via /api/emails/search.
// La recherche est déclenchée à la demande : un SEARCH IMAP sur l'historique
// complet prend quelques secondes, on ne le lance donc pas à chaque ouverture.

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mail, Loader2, AlertCircle, Paperclip, Anchor,
  RefreshCw, Inbox, ExternalLink, Check, Flame, Tag,
} from 'lucide-react';
import type { Facture } from '@/lib/types';
import { authedFetch, openEmailAttachment } from '@/lib/authed-fetch';
import { accountKeysForCompany, ACCOUNT_COMPANY, type ArrivageMatch } from '@/lib/email-arrivage-match';
import { detectEmailEvents, type EmailEvent, type EmailEventType } from '@/lib/email-events';

type FoundEmail = {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: string;
  isUnread: boolean;
  hasAttachments: boolean;
  attachments: { filename: string; contentType: string; size: number }[];
  match: ArrivageMatch;
  /** Boîte d'où provient le message — nécessaire pour ouvrir les pièces jointes. */
  accountKey: string;
};

const CONFIDENCE_STYLE: Record<ArrivageMatch['confidence'], { chip: string; label: string }> = {
  sure:     { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Sûr' },
  probable: { chip: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Probable' },
  faible:   { chip: 'bg-stone-100 text-stone-500 border-stone-200',      label: 'Incertain' },
};

// Le parcours d'un dossier d'import, dans l'ordre. Les emails du dossier
// disent où il en est : chaque étape passe au vert dès qu'un email l'atteste.
const ETAPES: { type: EmailEventType; court: string }[] = [
  { type: 'ENGAGEMENT',           court: 'Engagement' },
  { type: 'DOCUMENTS_EXPEDITION', court: 'Documents' },
  { type: 'AVIS_ARRIVEE',         court: 'Arrivée' },
  { type: 'DUM',                  court: 'DUM' },
  { type: 'MAINLEVEE',            court: 'Mainlevée' },
  { type: 'BON_A_DELIVRER',       court: 'BAD' },
  { type: 'SORTIE_MARCHANDISE',   court: 'Sortie' },
];

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fromName(from: string) {
  const m = from.match(/^(.+?)\s*</);
  return m ? m[1].replace(/"/g, '').trim() : from.split('@')[0];
}

export default function DossierEmailsPanel({
  facture,
  supplierEmails,
}: {
  facture: Facture;
  /** Emails connus du fournisseur — améliore la détection. */
  supplierEmails?: string[];
}) {
  const [emails, setEmails] = useState<FoundEmail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const accountKeys = accountKeysForCompany(facture.declaringCompany);

  // Ce que les emails du dossier racontent, tous types confondus.
  const eventsParEmail = new Map<string, EmailEvent[]>();
  const typesAtteints = new Set<EmailEventType>();
  const alertes: EmailEvent[] = [];
  for (const email of emails || []) {
    const evs = detectEmailEvents(email);
    eventsParEmail.set(`${email.accountKey}-${email.uid}`, evs);
    for (const ev of evs) {
      typesAtteints.add(ev.type);
      if (ev.type === 'RELANCE_SURESTARIE') alertes.push(ev);
    }
  }

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    try {
      // Une requête par boîte concernée, en parallèle.
      // allSettled : une boîte qui échoue (réseau, réponse non JSON) ne doit pas
      // faire perdre les résultats de l'autre.
      const settled = await Promise.allSettled(
        accountKeys.map(async accountKey => {
          const res = await authedFetch('/api/emails/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: accountKey, facture, supplierEmails }),
          });
          const data = await res.json().catch(() => ({ error: `Réponse illisible (HTTP ${res.status})` }));
          return { accountKey, data };
        })
      );
      const responses = settled.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { accountKey: accountKeys[i], data: { error: 'Erreur réseau' } as any }
      );

      const found: FoundEmail[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      for (const { accountKey, data } of responses) {
        if (data?.error) { errors.push(`${ACCOUNT_COMPANY[accountKey] || accountKey} : ${data.error}`); continue; }
        if (data?.warning) warnings.push(data.warning);
        // Le serveur s'est arrêté avant d'avoir tout dépouillé.
        if (data?.partiel) {
          warnings.push(
            `Boîte ${ACCOUNT_COMPANY[accountKey] || accountKey} : recherche écourtée, ` +
            'les emails les plus anciens du dossier peuvent manquer. Relance pour continuer.'
          );
        }
        for (const email of data?.emails || []) found.push({ ...email, accountKey });
      }

      found.sort((a, b) => b.match.score - a.match.score);
      setEmails(found);
      // Une boîte en échec n'annule pas les résultats de l'autre.
      if (errors.length > 0 && found.length === 0) setError(errors.join(' · '));
      else if (errors.length > 0) setWarning(errors.join(' · '));
      else if (warnings.length > 0) setWarning(warnings[0]);
    } catch {
      setError('Erreur réseau. Vérifiez que le serveur tourne.');
    } finally {
      setLoading(false);
    }
  }, [facture, supplierEmails, accountKeys]);

  return (
    <section className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-stone-100 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-900 rounded-xl">
            <Mail className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-[13px] font-black text-stone-900 uppercase tracking-tight">
              Emails du dossier
            </h3>
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              {facture.noBL ? `BL ${facture.noBL}` : 'Aucun n° de BL'}
              {' · '}
              {accountKeys.map(k => ACCOUNT_COMPANY[k]).join(' + ')}
            </p>
          </div>
        </div>
        <Button
          onClick={search}
          disabled={loading}
          variant="outline"
          className="h-9 gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-stone-200"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : emails === null ? <Inbox className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Recherche…' : emails === null ? 'Chercher les emails' : 'Relancer'}
        </Button>
      </div>

      <div className="p-6">
        {error ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-[11px] font-bold text-red-700">{error}</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
              Analyse de la boîte mail…
            </p>
          </div>
        ) : emails === null ? (
          <p className="text-[11px] font-medium text-stone-400 text-center py-6">
            Lance la recherche pour retrouver tous les emails liés à ce dossier
            (transitaire, fournisseur, compagnie maritime).
          </p>
        ) : (
          <div className="space-y-3">
            {warning && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[10px] font-bold text-amber-700">{warning}</p>
              </div>
            )}

            {emails.length === 0 ? (
              <p className="text-[11px] font-medium text-stone-400 text-center py-6">
                Aucun email trouvé pour ce dossier.
              </p>
            ) : (
              <>
                {/* Où en est le dossier, d'après ses emails */}
                <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-2">
                    Avancement d'après les emails
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ETAPES.map(etape => {
                      const fait = typesAtteints.has(etape.type);
                      return (
                        <span
                          key={etape.type}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                            fait
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-stone-300 border-stone-200'
                          }`}
                        >
                          {fait && <Check className="w-2.5 h-2.5" />}
                          {etape.court}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[9px] font-bold text-stone-400 mt-2">
                    Une étape passe au vert dès qu'un email l'atteste — ce n'est pas
                    une saisie, c'est ce que disent les messages reçus.
                  </p>
                </div>

                {alertes.length > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
                    <Flame className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-black text-rose-800 uppercase tracking-tight">
                        Frais qui courent sur ce dossier
                      </p>
                      <p className="text-[10px] font-bold text-rose-600 mt-0.5">
                        {alertes.length} email{alertes.length > 1 ? 's' : ''} de surestaries ou magasinage.
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                  {emails.length} email{emails.length > 1 ? 's' : ''} rattaché{emails.length > 1 ? 's' : ''}
                </p>
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-100 overflow-hidden">
                  {emails.map(email => {
                    const style = CONFIDENCE_STYLE[email.match.confidence];
                    return (
                      <div key={`${email.accountKey}-${email.uid}`} className="p-3.5 hover:bg-stone-50/70 transition-colors">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-black text-stone-900">{fromName(email.from)}</span>
                              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                                {formatDate(email.date)}
                              </span>
                              {email.isUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Non lu" />
                              )}
                            </div>
                            <p className="text-[12px] font-semibold text-stone-700 mt-0.5">{email.subject}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {(eventsParEmail.get(`${email.accountKey}-${email.uid}`) || []).map(ev => (
                                <span
                                  key={ev.type}
                                  title={ev.action}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                                    ev.urgent
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-sky-50 text-sky-700 border-sky-200'
                                  }`}
                                >
                                  {ev.urgent ? <Flame className="w-2.5 h-2.5" /> : <Tag className="w-2.5 h-2.5" />}
                                  {ev.label}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span
                            title={email.match.reasons.map(r => r.label).join(' · ')}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest shrink-0 ${style.chip}`}
                          >
                            <Anchor className="w-2.5 h-2.5" />
                            {style.label}
                          </span>
                        </div>

                        {/* Motifs du rattachement */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {email.match.reasons.filter(r => r.points > 0).map(r => (
                            <span
                              key={r.code}
                              className="text-[9px] font-bold text-stone-500 bg-stone-100 rounded px-1.5 py-0.5"
                            >
                              {r.label}
                            </span>
                          ))}
                        </div>

                        {email.hasAttachments && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {email.attachments.map((a, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  openEmailAttachment({ account: email.accountKey, uid: email.uid, filename: a.filename || '', contentType: a.contentType })
                                    .catch(err => setWarning(`Pièce jointe inaccessible : ${err?.message || 'réessayez'}`));
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-stone-200 text-[9px] font-bold text-stone-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
                              >
                                <Paperclip className="w-2.5 h-2.5" />
                                {a.filename || 'Pièce jointe'}
                                <ExternalLink className="w-2 h-2 opacity-50" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
