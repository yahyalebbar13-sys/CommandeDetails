'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Inbox, RefreshCw, Mail, MailOpen, Paperclip,
  ChevronLeft, Building2, AlertCircle, Loader2, Search,
  Sparkles, Brain, CheckCircle2, Anchor, Link2Off, HelpCircle, Flame, Tag
} from 'lucide-react';
import type { Facture } from '@/lib/types';
import { authedFetch, openEmailAttachment } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import {
  matchEmailToArrivages,
  normalizeRef,
  type ArrivageMatch,
  type SupplierHint,
} from '@/lib/email-arrivage-match';
import {
  detectEmailEvents,
  needsAiFallback,
  TYPES_CONNUS,
  type EmailEvent,
  type EmailEventType,
} from '@/lib/email-events';

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

interface Email {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  text: string;
  html: string;
  isUnread: boolean;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
}

interface EmailsResponse {
  emails: Email[];
  total: number;
  account: string;
  folder: string;
  error?: string;
}

const ACCOUNTS = [
  { key: 'lebtex', label: 'LEBTEX', color: 'bg-amber-500' },
  { key: 'robeinbox', label: 'ROBE IN BOX', color: 'bg-violet-500' },
];

// Couleurs par niveau de certitude du rapprochement email ↔ arrivage
const CONFIDENCE_STYLE: Record<ArrivageMatch['confidence'], { chip: string; dot: string; label: string }> = {
  sure:     { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Sûr' },
  probable: { chip: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   label: 'Probable' },
  faible:   { chip: 'bg-stone-100 text-stone-500 border-stone-200',      dot: 'bg-stone-400',   label: 'Incertain' },
};

/** Pastille du type d'email détecté (« Bon à délivrer », « Engagement »…). */
function EventChip({ event, compact = false }: { event: EmailEvent; compact?: boolean }) {
  return (
    <span
      title={`Reconnu sur « ${event.preuve} » dans l'${event.ou}${event.action ? ` — ${event.action}` : ''}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
        event.urgent
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-sky-50 text-sky-700 border-sky-200'
      }`}
    >
      {event.urgent ? <Flame className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} /> : <Tag className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />}
      {event.label}
    </span>
  );
}

/** Pastille compacte « BL 26HD1004 · MH » pour la liste des emails. */
function ArrivageChip({ match, compact = false }: { match: ArrivageMatch; compact?: boolean }) {
  const style = CONFIDENCE_STYLE[match.confidence];
  return (
    <span
      title={match.reasons.map(r => r.label).join(' · ')}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${style.chip}`}
    >
      <Anchor className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {match.noBL || 'Dossier'}
      {!compact && match.supplierId && <span className="font-bold opacity-60">· {match.supplierId}</span>}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 24 * 7) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fromName(from: string) {
  const m = from.match(/^(.+?)\s*</);
  return m ? m[1].replace(/"/g, '').trim() : from.split('@')[0];
}

type ArrivageFilter = 'all' | 'linked' | 'unlinked';

export default function EmailsView({
  factures = [],
  supplierHints,
}: {
  /** Dossiers d'arrivage, pour rattacher chaque email au bon dossier. */
  factures?: Facture[];
  /** Emails connus par fournisseur (supplierProfiles) — améliore la détection. */
  supplierHints?: Record<string, SupplierHint>;
} = {}) {
  const [activeAccount, setActiveAccount] = useState('lebtex');
  const [arrivageFilter, setArrivageFilter] = useState<ArrivageFilter>('all');
  const [typeFilter, setTypeFilter] = useState<EmailEventType | 'all'>('all');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [search, setSearch] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const { toast } = useToast();
  // Numéro de la dernière requête lancée : une réponse plus ancienne (changement de
  // boîte rapide) est ignorée, sinon les emails d'une boîte s'affichaient sous l'autre
  // et leurs pièces jointes étaient demandées à la mauvaise boîte.
  const requeteCourante = useRef(0);

  const fetchEmails = useCallback(async (account: string) => {
    const requete = ++requeteCourante.current;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await authedFetch(`/api/emails?account=${encodeURIComponent(account)}&limit=30`);
      const data: EmailsResponse = await res.json();
      if (requete !== requeteCourante.current) return;
      if (data.error) { setError(data.error); setEmails([]); }
      else { setEmails(data.emails); setAccountLabel(data.account); }
    } catch {
      if (requete !== requeteCourante.current) return;
      setError('Erreur réseau. Vérifiez que le serveur tourne.');
    } finally {
      if (requete === requeteCourante.current) setLoading(false);
    }
  }, []);

  const analyzeEmail = async () => {
    if (!selected) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await authedFetch('/api/analyze-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selected.subject,
          text: selected.text,
          from: selected.from,
        }),
      });
      const data = await res.json();
      setAiResult(data);
    } catch (err) {
      console.error(err);
      setAiResult({ error: 'Erreur lors de l\'analyse IA' });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => { fetchEmails(activeAccount); }, [activeAccount, fetchEmails]);

  // Réinitialiser l'IA quand on change d'email
  useEffect(() => { setAiResult(null); }, [selected]);

  // ── Rapprochement email ↔ dossier d'arrivage ──────────────────────────────
  // Recalculé localement : aucun appel réseau, les dossiers sont déjà chargés.
  const matchesByUid = useMemo(() => {
    const map = new Map<number, ArrivageMatch[]>();
    if (!factures.length) return map;
    for (const email of emails) {
      map.set(
        email.uid,
        matchEmailToArrivages(email, factures, {
          accountKey: activeAccount,
          suppliers: supplierHints,
        })
      );
    }
    return map;
  }, [emails, factures, activeAccount, supplierHints]);

  // Type de chaque email, reconnu par règles : aucun appel réseau, donc
  // recalculé à chaque actualisation sans rien coûter ni rien mettre en cache.
  const eventsByUid = useMemo(() => {
    const map = new Map<number, EmailEvent[]>();
    for (const email of emails) map.set(email.uid, detectEmailEvents(email));
    return map;
  }, [emails]);

  const urgentCount = useMemo(
    () => emails.filter(e => (eventsByUid.get(e.uid) || []).some(ev => ev.urgent)).length,
    [emails, eventsByUid]
  );

  // Types réellement présents dans la boîte — inutile de proposer les autres.
  const typesPresents = useMemo(() => {
    const vus = new Set<EmailEventType>();
    for (const list of eventsByUid.values()) for (const ev of list) vus.add(ev.type);
    return TYPES_CONNUS.filter(t => vus.has(t.type));
  }, [eventsByUid]);

  const linkedCount = useMemo(
    () => emails.filter(e => (matchesByUid.get(e.uid)?.length ?? 0) > 0).length,
    [emails, matchesByUid]
  );

  const filtered = emails.filter(e => {
    const q = search.toLowerCase();
    const matches = matchesByUid.get(e.uid) || [];
    if (q) {
      const hit =
        e.subject.toLowerCase().includes(q) ||
        e.from.toLowerCase().includes(q) ||
        // Le n° de dossier est cherchable directement
        matches.some(m => (m.noBL || '').toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (arrivageFilter === 'linked' && matches.length === 0) return false;
    if (arrivageFilter === 'unlinked' && matches.length > 0) return false;
    if (typeFilter !== 'all') {
      const events = eventsByUid.get(e.uid) || [];
      if (!events.some(ev => ev.type === typeFilter)) return false;
    }
    return true;
  });

  const selectedMatches = selected ? matchesByUid.get(selected.uid) || [] : [];
  const selectedEvents = selected ? eventsByUid.get(selected.uid) || [] : [];

  const acct = ACCOUNTS.find(a => a.key === activeAccount)!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-stone-900 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-stone-900 uppercase">Boîte Mail</h1>
            <p className="text-[11px] text-stone-400 font-medium uppercase tracking-widest">
              {accountLabel || '—'} · {emails.length} email{emails.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button
          onClick={() => fetchEmails(activeAccount)}
          disabled={loading}
          variant="outline"
          className="h-9 gap-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-stone-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Account switcher */}
      <div className="flex gap-2">
        {ACCOUNTS.map(a => (
          <button
            key={a.key}
            onClick={() => { setActiveAccount(a.key); setTypeFilter('all'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              activeAccount === a.key
                ? 'bg-stone-900 text-white shadow-lg'
                : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${a.color}`} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Filtre par rattachement à un arrivage */}
      {factures.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'all',      label: `Tous · ${emails.length}` },
            { key: 'linked',   label: `Rattachés · ${linkedCount}` },
            { key: 'unlinked', label: `Non rattachés · ${emails.length - linkedCount}` },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setArrivageFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                arrivageFilter === f.key
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >
              {f.key === 'linked' && <Anchor className="w-3 h-3" />}
              {f.key === 'unlinked' && <Link2Off className="w-3 h-3" />}
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Filtre par type d'email détecté */}
      {typesPresents.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
              typeFilter === 'all'
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            Tous types
          </button>
          {typesPresents.map(t => (
            <button
              key={t.type}
              onClick={() => setTypeFilter(t.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                typeFilter === t.type
                  ? 'bg-stone-900 text-white border-stone-900'
                  : t.urgent
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >
              {t.urgent && <Flame className="w-3 h-3" />}
              {t.label}
            </button>
          ))}
          {urgentCount > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600">
              <Flame className="w-3 h-3" />
              {urgentCount} à traiter
            </span>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden" style={{ minHeight: 560 }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">
              Connexion à {acct.label}…
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm font-bold text-red-600 max-w-sm text-center">{error}</p>
          </div>
        ) : selected ? (
          /* ── Email Detail ── */
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-stone-100">
              <button onClick={() => setSelected(null)} className="text-stone-400 hover:text-stone-900 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-black text-stone-900 truncate">{selected.subject}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">{selected.from} · {formatDate(selected.date)}</p>
              </div>
              {selected.hasAttachments && (
                <div className="flex items-center gap-1 text-stone-400">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">{selected.attachments.length}</span>
                </div>
              )}
              {needsAiFallback(selected) ? (
                <Button
                  onClick={analyzeEmail}
                  disabled={aiLoading}
                  className="ml-4 h-8 gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-violet-200" />}
                  Analyser (IA)
                </Button>
              ) : (
                <span
                  title="Type reconnu par règles, sans appel à l'IA"
                  className="ml-4 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Lu automatiquement
                </span>
              )}
            </div>

            {/* Ce que dit cet email — reconnu par règles, sans clic ni IA */}
            {selectedEvents.length > 0 && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-white border border-stone-200 space-y-3">
                <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">
                  Ce que dit cet email
                </h4>
                {selectedEvents.map(ev => (
                  <div key={ev.type} className="flex items-start gap-3">
                    <EventChip event={ev} />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {ev.action && (
                        <p className="text-[11px] font-bold text-stone-700">{ev.action}</p>
                      )}
                      <p className="text-[10px] text-stone-400 font-medium">
                        Reconnu sur «&nbsp;{ev.preuve}&nbsp;» dans l'{ev.ou}
                        {ev.checklistId && ` · fait avancer « ${ev.checklistId} » dans la checklist`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rapprochement avec un dossier d'arrivage */}
            {factures.length > 0 && (
              <div className="mx-6 mt-4">
                {selectedMatches.length === 0 ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
                    <HelpCircle className="w-4 h-4 text-stone-400 shrink-0" />
                    <p className="text-[11px] font-bold text-stone-500">
                      Aucun dossier d'arrivage reconnu dans cet email.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3">
                    <div className="flex items-center gap-2">
                      <Anchor className="w-4 h-4 text-stone-900" />
                      <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">
                        {selectedMatches.length > 1 ? 'Dossiers possibles' : 'Dossier d\u2019arrivage'}
                      </h4>
                    </div>
                    {selectedMatches.map(m => {
                      const style = CONFIDENCE_STYLE[m.confidence];
                      return (
                        <div key={m.factureId} className="rounded-lg border border-stone-100 bg-stone-50/60 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <ArrivageChip match={m} />
                              {m.declaringCompany && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  <Building2 className="w-3 h-3" /> {m.declaringCompany}
                                </span>
                              )}
                            </div>
                            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-stone-400">
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              {style.label} · {m.score} pts
                            </span>
                          </div>
                          {/* Pourquoi ce dossier a été retenu — jamais de magie opaque */}
                          <ul className="space-y-0.5">
                            {m.reasons.filter(r => r.points > 0).map(r => (
                              <li key={r.code} className="flex items-start gap-1.5 text-[10px] text-stone-500 font-medium">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                                {r.label}
                              </li>
                            ))}
                            {m.reasons.filter(r => r.points < 0).map(r => (
                              <li key={r.code} className="flex items-start gap-1.5 text-[10px] text-stone-400 font-medium">
                                <AlertCircle className="w-3 h-3 text-stone-300 shrink-0 mt-0.5" />
                                {r.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* AI Result Card */}
            {aiResult && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-violet-50 border border-violet-100 flex gap-4 animate-in fade-in zoom-in-95">
                <div className="mt-1"><Brain className="w-5 h-5 text-violet-500" /></div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-[11px] font-black text-violet-900 uppercase tracking-widest">
                    Analyse Intelligente
                  </h4>
                  {aiResult.error ? (
                    <p className="text-sm text-red-600">{aiResult.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-violet-800 font-medium">{aiResult.resume}</p>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {aiResult.dossierId && (() => {
                          const known = factures.find(
                            f => normalizeRef(f.noBL) === normalizeRef(aiResult.dossierId)
                          );
                          return (
                            <Badge
                              variant="outline"
                              className={`font-bold ${
                                known
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-white border-violet-200 text-violet-700'
                              }`}
                            >
                              Dossier: {aiResult.dossierId}
                              {known ? ' \u2713 connu' : ' \u2014 inconnu'}
                            </Badge>
                          );
                        })()}
                        {aiResult.typeAction && (
                          <Badge variant="outline" className="bg-white border-violet-200 text-violet-700 font-bold">
                            {aiResult.typeAction.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {aiResult.dateAction && (
                          <Badge variant="outline" className="bg-white border-violet-200 text-violet-700 font-bold">
                            Date: {aiResult.dateAction}
                          </Badge>
                        )}
                      </div>
                      {aiResult.actionSuggeree && (
                        <div className="mt-3 pt-3 border-t border-violet-100 flex items-center justify-between">
                          <p className="text-xs font-semibold text-violet-900">
                            Action à faire : {aiResult.actionSuggeree}
                          </p>
                          <Button size="sm" className="h-7 text-[10px] bg-violet-600 hover:bg-violet-700 gap-1.5" disabled>
                            <CheckCircle2 className="w-3 h-3" />
                            Appliquer (Bientôt)
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Attachments */}
            {selected.hasAttachments && (
              <div className="flex gap-2 px-6 py-3 bg-stone-50 border-b border-stone-100 flex-wrap">
                {selected.attachments.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      openEmailAttachment({ account: activeAccount, uid: selected.uid, filename: a.filename, contentType: a.contentType })
                        .catch(err => toast({ variant: 'destructive', title: 'Pièce jointe inaccessible', description: err?.message || 'Réessayez.' }));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-stone-200 text-[10px] font-bold text-stone-600 hover:border-violet-300 hover:text-violet-700 transition-colors"
                  >
                    <Paperclip className="w-3 h-3" />
                    {a.filename || 'Pièce jointe'}
                    <span className="text-stone-400">· {(a.size / 1024).toFixed(0)} Ko</span>
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">
              {selected.html ? (
                <iframe
                  title={selected.subject || 'Email'}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:#44403c;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${selected.html}</body></html>`}
                  className="w-full h-[65vh] border-0 bg-white rounded-lg"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700 leading-relaxed">
                  {selected.text || '(Contenu vide)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          /* ── Email List ── */
          <div>
            {/* Search */}
            <div className="px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2">
                <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="bg-transparent text-sm text-stone-700 placeholder-stone-400 outline-none flex-1 font-medium"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Mail className="w-8 h-8 text-stone-200" />
                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Aucun email</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {filtered.map(email => (
                  <button
                    key={email.uid}
                    onClick={() => setSelected(email)}
                    className={`w-full text-left px-5 py-3.5 hover:bg-stone-50 transition-colors flex items-start gap-3 ${
                      email.isUnread ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="flex-shrink-0 mt-1.5">
                      {email.isUnread
                        ? <div className="w-2 h-2 rounded-full bg-amber-500" />
                        : <div className="w-2 h-2 rounded-full bg-transparent" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${email.isUnread ? 'font-black text-stone-900' : 'font-semibold text-stone-600'}`}>
                          {fromName(email.from)}
                        </span>
                        <span className="text-[10px] text-stone-400 font-medium shrink-0">{formatDate(email.date)}</span>
                      </div>
                      <p className={`text-[12px] truncate mt-0.5 ${email.isUnread ? 'font-bold text-stone-800' : 'text-stone-500 font-medium'}`}>
                        {email.subject}
                      </p>
                      {((matchesByUid.get(email.uid) || []).length > 0 ||
                        (eventsByUid.get(email.uid) || []).length > 0) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {(eventsByUid.get(email.uid) || []).slice(0, 2).map(ev => (
                            <EventChip key={ev.type} event={ev} compact />
                          ))}
                          {(matchesByUid.get(email.uid) || []).slice(0, 2).map(m => (
                            <ArrivageChip key={m.factureId} match={m} compact />
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-stone-400 truncate mt-0.5 font-normal">
                        {email.text?.slice(0, 100) || ''}
                      </p>
                    </div>

                    {email.hasAttachments && (
                      <Paperclip className="w-3.5 h-3.5 text-stone-300 mt-1 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
