'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Paperclip, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ViewType } from '@/lib/types';

interface Email {
  uid: number;
  subject: string;
  from: string;
  date: string;
  isUnread: boolean;
  hasAttachments: boolean;
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

const ACCOUNTS = [
  { key: 'lebtex', label: 'LEBTEX', color: 'bg-amber-500', text: 'text-amber-500' },
  { key: 'robeinbox', label: 'ROBE IN BOX', color: 'bg-violet-500', text: 'text-violet-500' },
];

export default function RecentEmailsWidget({ onNavigate }: { onNavigate: (view: ViewType) => void }) {
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, Email[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.all([
          fetch('/api/emails?account=lebtex&limit=4').then(res => res.json()),
          fetch('/api/emails?account=robeinbox&limit=4').then(res => res.json())
        ]);
        
        if (isMounted) {
          setEmailsByAccount({
            lebtex: results[0].emails || [],
            robeinbox: results[1].emails || []
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchAll();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-900 rounded-xl"><Mail className="w-4 h-4 text-amber-400" /></div>
          <div>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Aperçu rapide</p>
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight">Derniers Emails</h3>
          </div>
        </div>
        <Button variant="ghost" onClick={() => onNavigate('emails')} className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-900">
          Voir tout ➔
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ACCOUNTS.map(acct => {
          const emails = emailsByAccount[acct.key] || [];
          return (
            <div key={acct.key} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
              <div className={`px-5 py-3 flex items-center gap-2 border-b border-stone-100`}>
                <span className={`w-2 h-2 rounded-full ${acct.color}`} />
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-900">{acct.label}</span>
              </div>
              
              <div className="divide-y divide-stone-50">
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-300" />
                  </div>
                ) : emails.length === 0 ? (
                  <div className="flex justify-center items-center py-8 text-[11px] font-black text-stone-400 uppercase tracking-widest">
                    Aucun email
                  </div>
                ) : (
                  emails.map((e, idx) => (
                    <div key={e.uid || idx} className={`px-5 py-3 hover:bg-stone-50 transition-colors cursor-pointer ${e.isUnread ? 'bg-amber-50/20' : ''}`} onClick={() => onNavigate('emails')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] truncate ${e.isUnread ? 'font-black text-stone-900' : 'font-semibold text-stone-600'}`}>
                          {fromName(e.from)}
                        </span>
                        <span className="text-[9px] text-stone-400 font-medium shrink-0">{formatDate(e.date)}</span>
                      </div>
                      <p className={`text-[11px] truncate mt-0.5 ${e.isUnread ? 'font-bold text-stone-800' : 'text-stone-500 font-medium'}`}>
                        {e.subject}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
