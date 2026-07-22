'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Inbox, RefreshCw, Mail, MailOpen, Paperclip,
  ChevronLeft, Building2, AlertCircle, Loader2, Search
} from 'lucide-react';

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

export default function EmailsView() {
  const [activeAccount, setActiveAccount] = useState('lebtex');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [search, setSearch] = useState('');

  const fetchEmails = useCallback(async (account: string) => {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await fetch(`/api/emails?account=${account}&limit=30`);
      const data: EmailsResponse = await res.json();
      if (data.error) { setError(data.error); setEmails([]); }
      else { setEmails(data.emails); setAccountLabel(data.account); }
    } catch {
      setError('Erreur réseau. Vérifiez que le serveur tourne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmails(activeAccount); }, [activeAccount, fetchEmails]);

  const filtered = emails.filter(e =>
    !search || e.subject.toLowerCase().includes(search.toLowerCase()) ||
    e.from.toLowerCase().includes(search.toLowerCase())
  );

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
            onClick={() => setActiveAccount(a.key)}
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
            </div>

            {/* Attachments */}
            {selected.hasAttachments && (
              <div className="flex gap-2 px-6 py-3 bg-stone-50 border-b border-stone-100 flex-wrap">
                {selected.attachments.map((a, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-stone-200 text-[10px] font-bold text-stone-600">
                    <Paperclip className="w-3 h-3" />
                    {a.filename || 'Pièce jointe'}
                    <span className="text-stone-400">· {(a.size / 1024).toFixed(0)} Ko</span>
                  </span>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">
              {selected.html ? (
                <div
                  className="prose prose-sm max-w-none text-stone-700"
                  dangerouslySetInnerHTML={{ __html: selected.html }}
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
