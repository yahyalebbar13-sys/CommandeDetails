'use client';

// ─── Bouton « Publier en ligne » ─────────────────────────────────────────────
// La boutique lebtex.ma est figée à la construction du site : les produits,
// prix et catégories modifiés ici n'y arrivent qu'après une publication.
// La route /api/publish exige le jeton de l'administrateur, d'où authedFetch.
// Une confirmation avant l'envoi : un appui de travers relancerait le site.

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Globe, Loader2, X } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

type Etat = 'repos' | 'confirmer' | 'envoi' | 'lance' | 'echec';

const EXPLICATION =
  'Met en ligne sur lebtex.ma les produits, prix et catégories modifiés ici. Le site se met à jour en 2 minutes environ.';

async function publier(): Promise<void> {
  let res: Response;
  try {
    res = await authedFetch('/api/publish', { method: 'POST' });
  } catch {
    throw new Error("Pas de connexion internet : la publication n'est pas partie.");
  }
  if (res.ok) return;
  if (res.status === 401) throw new Error('Votre session a expiré : reconnectez-vous puis réessayez.');
  if (res.status === 403) throw new Error("Ce compte n'a pas le droit de publier le site.");
  let detail = '';
  try {
    const data = await res.json();
    detail = typeof data?.error === 'string' ? data.error : '';
  } catch {
    // Réponse non JSON (page d'erreur) : on garde le code seul.
  }
  throw new Error(detail || `Le serveur a refusé la publication (code ${res.status}).`);
}

export function BoutonPublier({ variante = 'en-tete' }: { variante?: 'en-tete' | 'panneau' }) {
  const [etat, setEtat] = useState<Etat>('repos');
  const [message, setMessage] = useState('');
  const minuterie = useRef<number | null>(null);

  const programmerRetour = (ms: number) => {
    if (minuterie.current) window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => { setEtat('repos'); setMessage(''); }, ms);
  };
  useEffect(() => () => { if (minuterie.current) window.clearTimeout(minuterie.current); }, []);

  const demander = () => { setEtat('confirmer'); setMessage(''); programmerRetour(10_000); };
  const annuler = () => { if (minuterie.current) window.clearTimeout(minuterie.current); setEtat('repos'); setMessage(''); };

  const lancer = async () => {
    if (minuterie.current) window.clearTimeout(minuterie.current);
    setEtat('envoi');
    setMessage('');
    try {
      await publier();
      setEtat('lance');
      setMessage('Publication lancée : le site sera à jour dans 2 minutes environ.');
      programmerRetour(6_000);
    } catch (err) {
      setEtat('echec');
      setMessage(err instanceof Error ? err.message : 'La publication a échoué.');
      // L'erreur reste affichée jusqu'à ce qu'on la ferme ou qu'on réessaie.
    }
  };

  // ── Dans le panneau « Plus » (téléphone) : tout s'affiche dans le flux ──
  if (variante === 'panneau') {
    return (
      <div className="space-y-2">
        {etat === 'confirmer' ? (
          <div className="rounded-xl border border-[#C8102E]/30 bg-[#C8102E]/10 p-3 space-y-3">
            <p className="text-sm text-gray-200">{EXPLICATION}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={annuler}
                className="min-h-[44px] rounded-xl border border-white/10 text-sm font-semibold text-gray-300">
                Annuler
              </button>
              <button type="button" onClick={lancer}
                className="min-h-[44px] rounded-xl bg-[#C8102E] text-sm font-bold text-white">
                Publier maintenant
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={demander} disabled={etat === 'envoi'}
            className="w-full min-h-[48px] flex items-center gap-3 px-4 rounded-xl text-sm font-semibold text-gray-200 bg-white/5 disabled:opacity-60">
            {etat === 'envoi' ? <Loader2 className="w-5 h-5 animate-spin text-[#C8102E]" /> : <Globe className="w-5 h-5 text-[#C8102E]" />}
            {etat === 'envoi' ? 'Publication en cours…' : 'Publier en ligne'}
          </button>
        )}
        {message && (
          <p role={etat === 'echec' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${etat === 'echec' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            {etat === 'echec' ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{message}</span>
          </p>
        )}
      </div>
    );
  }

  // ── Dans l'en-tête (ordinateur) : le message s'ouvre sous le bouton ──
  return (
    <div className="relative flex items-center gap-2">
      {etat === 'confirmer' ? (
        <>
          <button type="button" onClick={annuler}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-gray-300 border border-white/10 hover:bg-white/5">
            Annuler
          </button>
          <button type="button" onClick={lancer} title={EXPLICATION}
            className="min-h-[36px] px-3 rounded-lg text-xs font-bold text-white bg-[#C8102E] hover:bg-[#a50d25]">
            Confirmer la publication
          </button>
        </>
      ) : (
        <button type="button" onClick={demander} disabled={etat === 'envoi'} title={EXPLICATION}
          className={`min-h-[36px] flex items-center gap-2 px-3 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-70 ${
            etat === 'lance' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : etat === 'echec' ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : 'bg-[#C8102E]/10 border-[#C8102E]/30 text-red-200 hover:bg-[#C8102E]/20'
          }`}>
          {etat === 'envoi' ? <Loader2 className="w-4 h-4 animate-spin" />
            : etat === 'lance' ? <CheckCircle2 className="w-4 h-4" />
            : etat === 'echec' ? <AlertCircle className="w-4 h-4" />
            : <Globe className="w-4 h-4" />}
          {etat === 'envoi' ? 'Publication…' : etat === 'lance' ? 'Publication lancée' : etat === 'echec' ? 'Réessayer la publication' : 'Publier en ligne'}
        </button>
      )}
      {message && (
        <div role={etat === 'echec' ? 'alert' : 'status'}
          className={`absolute right-0 top-full mt-2 z-40 w-72 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-xl bg-[#141414] ${
            etat === 'echec' ? 'border-red-500/30 text-red-300' : 'border-emerald-500/30 text-emerald-300'
          }`}>
          <span className="flex-1">{message}</span>
          <button type="button" onClick={annuler} aria-label="Fermer le message"
            className="-m-1 p-1 rounded text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
