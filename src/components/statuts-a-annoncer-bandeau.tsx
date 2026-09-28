"use client";

// Les changements de statut d'arrivage qui attendent une décision : prévenir
// les clients par message, ou ne rien leur envoyer. Rien ne part sans un clic.

import React, { useState } from 'react';
import { Mail, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { STATUS_MAP, type EffectiveStatus } from '@/lib/status-utils';
import type { ChangementDeStatut } from '@/lib/edition-dossier';

const libelleStatut = (s: EffectiveStatus) => `${STATUS_MAP[s]?.emoji ?? ''} ${STATUS_MAP[s]?.label ?? s}`;
const jourCourt = (iso?: string | null) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return j && m && a ? `${j}/${m}` : String(iso);
};

type Props = {
  aAnnoncer: ChangementDeStatut[];
  prevenir: (c: ChangementDeStatut) => Promise<number>;
  ignorer: (c: ChangementDeStatut) => Promise<boolean>;
};

export default function StatutsAAnnoncerBandeau({ aAnnoncer, prevenir, ignorer }: Props) {
  const { toast } = useToast();
  const [enCours, setEnCours] = useState<string | null>(null);

  if (!aAnnoncer.length) return null;

  const agir = async (c: ChangementDeStatut, envoyer: boolean) => {
    setEnCours(c.facture.id);
    try {
      if (envoyer) {
        const n = await prevenir(c);
        toast({
          title: n === 1 ? 'Un message envoyé' : `${n} messages envoyés`,
          description: `${c.facture.id} : ${libelleStatut(c.nouveau)}.`,
        });
      } else if (await ignorer(c)) {
        toast({ title: 'Clients non prévenus', description: `${c.facture.id} : ${libelleStatut(c.nouveau)}, sans message.` });
      } else {
        toast({ variant: 'destructive', title: 'Non enregistré', description: 'Réessayez dans un instant.' });
      }
    } finally {
      setEnCours(null);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3" aria-label="Changements de statut à annoncer">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-amber-600 shrink-0" />
        <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-800">
          {aAnnoncer.length === 1 ? 'Un arrivage a changé de statut' : `${aAnnoncer.length} arrivages ont changé de statut`}
          {' '}— prévenir les clients ?
        </h2>
      </div>
      <ul className="space-y-2">
        {aAnnoncer.map(c => {
          const clients = [...new Set(c.articles.map(a => String(a.clientName).trim()))];
          const occupe = enCours === c.facture.id;
          const date = c.nouveau === 'STOCK' ? c.facture.stockEntryDate : c.facture.arrivalDate;
          return (
            <li key={c.facture.id} className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl bg-white border border-amber-100 px-3 py-2.5 min-w-0">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[12px] text-stone-700 min-w-0">
                  <span className="font-black text-stone-900">{c.facture.id}</span>
                  {c.facture.noBL ? <span className="text-stone-400"> · {c.facture.noBL}</span> : null}
                  {' '}: {libelleStatut(c.ancien)} → <strong>{libelleStatut(c.nouveau)}</strong>
                  {date ? <span className="text-stone-400"> ({jourCourt(date)})</span> : null}
                </p>
                <p className="text-[11px] text-stone-500 truncate">
                  {c.articles.length === 1 ? '1 message' : `${c.articles.length} messages`} (un par article) :{' '}
                  <span className="font-bold text-indigo-700">{clients.join(', ')}</span>
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  disabled={occupe}
                  onClick={() => agir(c, true)}
                  className="h-9 rounded-xl bg-stone-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest gap-1.5"
                >
                  {occupe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Prévenir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={occupe}
                  onClick={() => agir(c, false)}
                  className="h-9 rounded-xl border-stone-200 text-[10px] font-black uppercase tracking-widest gap-1.5"
                >
                  <BellOff className="w-3.5 h-3.5" /> Ne pas prévenir
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
