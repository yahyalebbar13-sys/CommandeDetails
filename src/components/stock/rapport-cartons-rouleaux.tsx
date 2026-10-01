"use client";

// ─── Rapport « Cartons et rouleaux » (admin, lecture seule) ──────────────────
// La réserve sortira bientôt au CARTON ou au ROULEAU, converti en unité de vente du pôle. Ce
// rapport dit, produit par produit, si le logiciel sait déjà faire cette conversion — et, sinon,
// quoi saisir et où. Il n'écrit rien et ne charge rien de plus : il lit les articles, familles,
// pôles et le stock que /stock a déjà en main. Aucun prix n'y figure.

import React, { useMemo, useState } from 'react';
import { Boxes, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  construireRapportCartonsRouleaux, estManqueDuPole, type ProduitDuRapport,
} from '@/lib/rapport-cartons-rouleaux';
import { LIBELLE_SOURCE, NOM_DU_TYPE, type ResultatColis } from '@/lib/conditionnement';
import { libelleUnite } from '@/lib/unites-pole';

interface Props {
  stockItems: any[];
  articles: any[];
  categories: any[];
  generalCategories: any[];
  factures?: any[];
}

const nf = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** Le colis calculé, ses facteurs, ce qui manque et les désaccords — pour un calcul retenu ou une variante. */
function Calcul({ r, pret }: { r: ResultatColis; pret: boolean }) {
  const siennes = r.manques.filter(m => !estManqueDuPole(m.genre));
  return (
    <>
      {r.colis.map(colis => (
        <div key={colis.colis}>
          <p className={`text-[13px] font-black ${pret && colis.enUniteDeVente ? 'text-emerald-800' : 'text-stone-600'}`}>
            {colis.detail}
            {!colis.enUniteDeVente && <span className="text-[11px] font-bold text-red-700"> — pas encore en unité de vente</span>}
          </p>
          <p className="text-[10px] font-bold text-stone-400">
            {colis.facteurs.map(f => `${f.label} : ${f.valeur} (${LIBELLE_SOURCE[f.source]})`).join(' · ')}
          </p>
        </div>
      ))}
      {r.colis.length === 0 && (
        <p className="text-[12px] font-black text-red-700">Colis de sortie inconnu</p>
      )}
      {siennes.map(m => (
        <p key={m.texte} className="text-[11px] font-bold text-red-700">→ {m.texte}</p>
      ))}
      {r.desaccords.map(d => (
        <p key={d.texte} className={`text-[11px] font-bold ${d.bloquant ? 'text-red-700' : 'text-amber-700'}`}>
          ⚠ Désaccord : {d.texte}
        </p>
      ))}
    </>
  );
}

export default function RapportCartonsRouleaux({ stockItems, articles, categories, generalCategories, factures = [] }: Props) {
  const [recherche, setRecherche] = useState('');
  const [aCompleterSeulement, setACompleterSeulement] = useState(false);

  const rapport = useMemo(
    () => construireRapportCartonsRouleaux(stockItems, articles, categories, generalCategories, factures),
    [stockItems, articles, categories, generalCategories, factures],
  );

  const poles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const garde = (p: ProduitDuRapport, nomPole: string) =>
      (!aCompleterSeulement || !p.pret)
      && (!q || [p.nom, p.famille, p.qualite, nomPole].some(v => String(v || '').toLowerCase().includes(q)));
    return rapport.poles
      .map(pole => ({ ...pole, produits: pole.produits.filter(p => garde(p, pole.nom)) }))
      .filter(pole => pole.produits.length > 0);
  }, [rapport, recherche, aCompleterSeulement]);

  const c = rapport.compteurs;
  const compteurs = [
    { label: 'Produits prêts', valeur: c.produitsPrets, ton: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
    { label: 'Produits à compléter', valeur: c.produitsACompleter, ton: 'text-red-700 bg-red-50 border-red-100' },
    { label: 'Pôles sans unité de vente valable', valeur: c.polesSansUniteVente, ton: 'text-amber-700 bg-amber-50 border-amber-100', sous: `sur ${c.polesEnStock} pôles en stock` },
    { label: 'Pôles sans type', valeur: c.polesSansType, ton: 'text-amber-700 bg-amber-50 border-amber-100', sous: 'ligne logistique à régler' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-stone-900 to-stone-700 p-6 sm:p-8 rounded-3xl shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <Boxes className="w-6 h-6 text-[#CC8626]" />
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Cartons et rouleaux</h1>
        </div>
        <p className="text-stone-300 text-xs font-medium max-w-2xl leading-relaxed">
          Bientôt, la réserve (CHRIFA et entrepôts) sortira uniquement au carton ou au rouleau, et le logiciel
          le convertira en unité de vente du pôle (pièces ou mètres). Ce rapport montre, pour chaque produit en
          stock, ce que contient son carton ou son rouleau — ou ce qu'il faut encore saisir. Le rapport lui-même
          ne change rien : il est en lecture seule.
        </p>
        <p className="text-amber-300 text-xs font-bold max-w-2xl leading-relaxed mt-2">
          ⚠ Unités des pôles : une unité fixée sur un pôle s'impose aussitôt à tout son stock, sans conversion.
          Sur un pôle sans unité d'achat, fixer l'unité de vente seule ferait afficher « 120 m » pour 120 rouleaux.
          Suivre l'ordre indiqué dans chaque consigne.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {compteurs.map(k => (
          <div key={k.label} className={`rounded-2xl border p-4 ${k.ton}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{k.label}</p>
            <p className="text-3xl font-black mt-1">{k.valeur}</p>
            {k.sous && <p className="text-[10px] font-bold opacity-70">{k.sous}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Chercher un produit, une famille, un pôle…"
            className="pl-9 h-10 rounded-xl"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-stone-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={aCompleterSeulement}
            onChange={e => setACompleterSeulement(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          À compléter seulement
        </label>
      </div>

      {poles.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-stone-200 rounded-3xl text-stone-400 text-sm font-bold">
          {rapport.poles.length === 0 ? 'Aucun produit en stock.' : 'Aucun produit ne correspond.'}
        </div>
      ) : poles.map(pole => (
        <section key={pole.id || 'sans-pole'} className="rounded-3xl border border-stone-200 bg-white overflow-hidden">
          <header className="p-4 sm:p-5 bg-stone-50 border-b border-stone-100 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-base font-black uppercase tracking-tight text-stone-900">{pole.nom}</h2>
              <span className="text-[11px] font-bold text-stone-500">
                Type : {pole.type
                  ? <>{NOM_DU_TYPE[pole.type] || pole.type}{pole.typeDevine && <span className="text-amber-700"> (supposé ⚠)</span>}</>
                  : <span className="text-amber-700">aucun ⚠</span>}
              </span>
              <span className="text-[11px] font-bold text-stone-500">
                Achat : {pole.uniteAchat ? libelleUnite(pole.uniteAchat) : <span className="text-stone-400">libre</span>}
              </span>
              <span className="text-[11px] font-bold text-stone-500">
                Vente : {pole.uniteVente
                  ? <>{libelleUnite(pole.uniteVente)}{!pole.uniteVenteValable && <span className="text-amber-700"> (ne convient pas ⚠)</span>}</>
                  : <span className="text-amber-700">non fixée ⚠</span>}
              </span>
            </div>
            {pole.consignes.map(t => (
              <p key={t} className="text-[11px] font-bold text-amber-800 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {t}
              </p>
            ))}
          </header>

          <div className="divide-y divide-stone-100">
            {pole.produits.map(p => {
              const r = p.resultat;
              // Les consignes du pôle sont dites en tête : sous le produit, on y renvoie seulement
              // quand rien d'autre n'explique pourquoi il n'est pas prêt.
              const bloqueParLePole = !p.pret
                && r.manques.some(m => estManqueDuPole(m.genre))
                && !r.manques.some(m => !estManqueDuPole(m.genre))
                && !r.desaccords.some(d => d.bloquant)
                && p.variantes.every(v => v.resultat.pret || v.resultat.manques.every(m => estManqueDuPole(m.genre)));
              const stockTexte = p.stocks.map(s => `${nf(s.quantite)} ${s.unite}`).join(' + ');
              return (
                <div key={p.cle} className={`p-4 sm:px-5 grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] gap-2 md:gap-6 ${p.pret ? '' : 'bg-red-50 border-l-4 border-red-500'}`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-black text-stone-900 flex items-center gap-1.5">
                      {p.pret
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                      <span className="truncate">{p.nom}</span>
                    </p>
                    <p className="text-[11px] font-bold text-stone-500 truncate">
                      {p.famille}{p.qualite ? ` · qualité ${p.qualite}` : ''}
                    </p>
                    <p className="text-[11px] font-medium text-stone-500">
                      En stock : {stockTexte} · {p.arrivage}
                    </p>
                  </div>

                  <div className="min-w-0 space-y-1">
                    {p.precision && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{p.precision}</p>
                    )}
                    <Calcul r={r} pret={p.pret} />
                    {bloqueParLePole && (
                      <p className="text-[11px] font-bold text-red-700">→ voir la consigne du pôle ci-dessus</p>
                    )}
                    {p.variantes.map(v => (
                      <div key={v.libelle} className="mt-2 pt-2 border-t border-dashed border-stone-200 space-y-1">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${v.resultat.pret ? 'text-amber-700' : 'text-red-700'}`}>
                          ⚠ {v.resultat.pret ? 'Autre colis' : 'À compléter'} — {v.libelle}
                        </p>
                        <Calcul r={v.resultat} pret={v.resultat.pret} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
