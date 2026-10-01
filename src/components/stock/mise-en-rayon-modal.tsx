"use client";

/**
 * La fenêtre de MISE EN RAYON : Réserve → Étagères de CHRIFA (src/lib/mise-en-rayon.ts).
 *
 * 1. Choisir le produit (sa qualité, sa taille) — la couleur n'existe pas sur les étagères.
 * 2. Couleur par couleur, dire ce qui sort de la réserve : un nombre ENTIER de cartons ou de
 *    rouleaux, et/ou « le reste d'un carton ouvert » compté en pièces ou en mètres.
 * 3. La conversion s'affiche en direct (« 3 cartons = 7 200 pièces ») avec le total qui part sur
 *    les étagères ; un seul bouton écrit le tout dans un seul lot.
 *
 * Un produit dont le contenu du carton ou du rouleau n'est pas connu est bloqué, avec le message
 * prévu pour l'administrateur. Une réserve qui affiche moins que ce qu'on sort ne bloque pas :
 * c'est signalé ici, puis au journal.
 *
 * La fenêtre ne se ferme jamais au clic extérieur (règle de /stock, assurée par DialogContent).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Search, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Encadre, Recapitulatif, LigneResume, BoutonValider, SectionFormulaire } from './ui-formulaire';
import type { StockItem } from '@/lib/types';
import {
  produitsDesEtageres, lignesDeReserve, cleEtagere, MESSAGE_SANS_CONTENU, LIBELLE_RESERVE, LIBELLE_ETAGERES,
  uniteEnFrancais, type ProduitEtagere,
} from '@/lib/etageres';
import {
  preparerCouleur, calculerCouleur, nombreFr,
  type PreparationCouleur, type SaisieCouleur, type ProduitMisEnRayon, type CouleurMiseEnRayon,
} from '@/lib/mise-en-rayon';
import { disponibleDepuis } from '@/lib/stock-disponible';
import { uniteDecimale } from '@/lib/unites-pole';
import type { ColisDeSortie } from '@/lib/conditionnement';

const sansAccent = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Ce que l'on tape pour une couleur : les champs restent du texte tant qu'on écrit. */
type Brouillon = { colis: Partial<Record<ColisDeSortie, string>>; reste: string };

const versSaisie = (b: Brouillon | undefined): SaisieCouleur => {
  const lire = (t?: string) => {
    const texte = String(t ?? '').trim().replace(',', '.');
    return texte === '' ? undefined : Number(texte);
  };
  const colis: SaisieCouleur['colis'] = {};
  for (const [k, v] of Object.entries(b?.colis || {})) {
    const n = lire(v);
    if (n !== undefined) colis[k as ColisDeSortie] = n;
  }
  return { colis, reste: lire(b?.reste) };
};

const cleLigne = (l: any) => String(l?.articleId || '');

export default function MiseEnRayonModal({
  open, onOpenChange, rechercheInitiale, stockItems, articles, categories, generalCategories, stores, magasin, onValider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le nom du produit d'où la fenêtre a été ouverte (fiche) : la liste s'y place directement. */
  rechercheInitiale?: string;
  /** Le stock vu du magasin principal : sa réserve (magasin + entrepôts) et ses lignes Étagères. */
  stockItems: StockItem[];
  articles: any[];
  categories: any[];
  generalCategories: any[];
  stores: any[];
  magasin: string;
  onValider: (plan: { produit: ProduitMisEnRayon; couleurs: CouleurMiseEnRayon[] }) => Promise<void>;
}) {
  const reserve = useMemo(() => lignesDeReserve(stockItems), [stockItems]);
  // Les produits qui ont de la réserve : c'est d'elle que la marchandise part.
  const produits = useMemo(() => {
    const avecReserve = new Set(reserve.map(l => cleEtagere(l)));
    return produitsDesEtageres(stockItems, categories, generalCategories).filter(p => avecReserve.has(p.cle));
  }, [stockItems, reserve, categories, generalCategories]);

  const [recherche, setRecherche] = useState(rechercheInitiale || '');
  const [cleChoisie, setCleChoisie] = useState<string | null>(null);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le serveur n'a pas répondu à temps : l'envoi est peut-être passé. Pas de second envoi. */
  const [incertain, setIncertain] = useState(false);
  // Rouvrir la fenêtre (après avoir regardé le journal) repart d'un état propre.
  useEffect(() => {
    if (open) { setIncertain(false); setErreur(null); }
  }, [open]);

  const liste = useMemo(() => {
    const q = sansAccent(recherche).trim();
    const filtres = !q ? produits : produits.filter(p => sansAccent(
      `${p.nameFR || ''} ${p.productName} ${p.quality || ''} ${p.size || ''} ${p.categoryNameFR || ''} ${p.categoryId}`,
    ).includes(q));
    return filtres.slice(0, 60);
  }, [produits, recherche]);

  // Ouverte depuis une fiche : si un seul produit correspond, il est choisi d'office.
  useEffect(() => {
    if (!open || cleChoisie || !rechercheInitiale) return;
    if (liste.length === 1) setCleChoisie(liste[0].cle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rechercheInitiale, liste.length]);

  const choisi: ProduitEtagere | null = cleChoisie ? produits.find(p => p.cle === cleChoisie) || null : null;
  const couleurs = useMemo(() => (choisi
    ? reserve.filter(l => cleEtagere(l) === choisi.cle)
      .sort((a, b) => String(a.color || '').localeCompare(String(b.color || ''), 'fr', { numeric: true, sensitivity: 'base' }))
    : []), [reserve, choisi]);
  const preparations = useMemo(() => {
    const parLigne = new Map<string, PreparationCouleur>();
    for (const l of couleurs) parLigne.set(cleLigne(l), preparerCouleur(l, { articles, categories, generalCategories }));
    return parLigne;
  }, [couleurs, articles, categories, generalCategories]);
  const pretes = couleurs.filter(l => preparations.get(cleLigne(l))?.pret);
  const produitBloque = Boolean(choisi) && pretes.length === 0;
  const raisonsBlocage = useMemo(() => Array.from(new Set(
    Array.from(preparations.values()).flatMap(p => (p.pret ? [] : p.raisons)),
  )), [preparations]);
  const uniteVente = (() => {
    for (const l of pretes) { const p = preparations.get(cleLigne(l)); if (p?.pret) return p.uniteVente; }
    return choisi?.uniteVente || '';
  })();

  // Les calculs de chaque couleur, en direct.
  const calculs = useMemo(() => {
    const parLigne = new Map<string, ReturnType<typeof calculerCouleur>>();
    for (const l of couleurs) {
      const p = preparations.get(cleLigne(l));
      if (p?.pret) parLigne.set(cleLigne(l), calculerCouleur(p, versSaisie(brouillons[cleLigne(l)])));
    }
    return parLigne;
  }, [couleurs, preparations, brouillons]);
  const totalVente = arrondi3(Array.from(calculs.values()).reduce((s, c) => s + c.totalVente, 0));
  const erreursSaisie = Array.from(calculs.entries()).flatMap(([cle, c]) => {
    const l = couleurs.find(x => cleLigne(x) === cle);
    return c.erreurs.map(e => `${l?.color || 'Sans couleur'} : ${e}`);
  });

  const changer = (cle: string, champ: ColisDeSortie | 'reste', valeur: string) => {
    setErreur(null);
    setBrouillons(prev => {
      const b: Brouillon = prev[cle] || { colis: {}, reste: '' };
      return {
        ...prev,
        [cle]: champ === 'reste' ? { ...b, reste: valeur } : { ...b, colis: { ...b.colis, [champ]: valeur } },
      };
    });
  };

  const choisir = (cle: string | null) => { setCleChoisie(cle); setBrouillons({}); setErreur(null); };

  const raisonDesactive = incertain
    ? 'Envoi peut-être déjà passé : vérifiez le journal des mouvements, puis rouvrez cette fenêtre si besoin.'
    : !choisi ? 'Choisissez d\'abord un produit.'
    : produitBloque ? MESSAGE_SANS_CONTENU
      : erreursSaisie.length > 0 ? erreursSaisie[0]
        : totalVente <= 0 ? 'Indiquez au moins un carton, un rouleau ou un reste.'
          : null;

  const valider = async () => {
    if (!choisi || raisonDesactive) return;
    setEnCours(true);
    setErreur(null);
    try {
      const plan: CouleurMiseEnRayon[] = couleurs
        .map(l => ({ ligne: l, preparation: preparations.get(cleLigne(l))!, saisie: versSaisie(brouillons[cleLigne(l)]) }))
        .filter(c => c.preparation?.pret && (calculs.get(cleLigne(c.ligne))?.totalVente || 0) > 0);
      await onValider({
        produit: {
          articleId: choisi.articleId, categoryId: choisi.categoryId, productName: choisi.productName,
          nameFR: choisi.nameFR, quality: choisi.quality, size: choisi.size, uniteVente: uniteVente || choisi.uniteVente,
        },
        couleurs: plan,
      });
      onOpenChange(false);
    } catch (e: any) {
      setErreur(e?.message || 'La mise en rayon n\'a pas pu être enregistrée.');
      // Peut-être passée : on vide la saisie et on bloque, pour qu'un second clic n'écrive pas
      // une deuxième mise en rayon.
      if (e?.incertain) { setIncertain(true); setBrouillons({}); }
    } finally {
      setEnCours(false);
    }
  };

  const libelleProduit = (p: ProduitEtagere) =>
    [p.nameFR || p.productName, p.quality, p.size].filter(Boolean).join(' · ');

  return (
    <Dialog open={open} onOpenChange={o => { if (!enCours) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
        <div className="bg-teal-900 text-white px-5 py-4 sticky top-0 z-10">
          <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-300" /> Mettre en rayon
          </DialogTitle>
          <DialogDescription className="text-[12px] text-teal-100/90 font-medium mt-1 flex items-center gap-1.5 flex-wrap">
            {LIBELLE_RESERVE} <ArrowRight className="w-3.5 h-3.5" /> {LIBELLE_ETAGERES}
          </DialogDescription>
        </div>

        <div className="p-5 space-y-5">
          {!choisi ? (
            <SectionFormulaire numero={1} titre="Quel produit mettez-vous en rayon ?"
              aide="Un produit = sa famille, sa qualité et sa taille. Les couleurs se choisissent à l'étape suivante.">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <Input
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Nom du produit, qualité, taille…"
                  className="pl-9 h-11 rounded-xl font-bold"
                  autoFocus
                />
                {recherche && (
                  <button type="button" onClick={() => setRecherche('')} title="Effacer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-stone-400 hover:bg-stone-100 flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl border border-stone-200 divide-y divide-stone-100 max-h-[50vh] overflow-y-auto">
                {liste.length === 0 && (
                  <p className="p-6 text-center text-[12px] font-bold text-stone-500">Aucun produit en réserve ne correspond.</p>
                )}
                {liste.map(p => (
                  <button key={p.cle} type="button" onClick={() => choisir(p.cle)}
                    className="w-full text-left px-4 py-3 hover:bg-teal-50/60 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-stone-900 uppercase truncate">{libelleProduit(p)}</p>
                      <p className="text-[11px] font-medium text-stone-500">
                        {p.categoryNameFR || p.categoryId} · sur les étagères : {p.comptable ? `${nombreFr(p.quantite)} ${p.uniteVente}` : 'unité de vente à définir'}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
                  </button>
                ))}
              </div>
            </SectionFormulaire>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">Produit</p>
                  <p className="text-[15px] font-black text-stone-900 uppercase">{libelleProduit(choisi)}</p>
                  <p className="text-[11px] font-bold text-teal-800 mt-0.5">
                    Déjà sur les étagères : {choisi.comptable ? `${nombreFr(choisi.quantite)} ${choisi.uniteVente}` : '—'}
                  </p>
                </div>
                <Button variant="outline" onClick={() => choisir(null)} disabled={enCours}
                  className="h-9 rounded-xl text-[11px] font-black uppercase">Changer de produit</Button>
              </div>

              {produitBloque ? (
                <Encadre ton="attention" titre={MESSAGE_SANS_CONTENU}>
                  La mise en rayon se fait en cartons ou en rouleaux entiers : sans savoir ce qu'ils contiennent,
                  le logiciel ne peut pas dire combien de pièces ou de mètres arrivent sur les étagères. Il n'invente pas de chiffre.
                  {raisonsBlocage.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 space-y-0.5 text-[11px] font-medium">
                      {raisonsBlocage.slice(0, 4).map(r => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                </Encadre>
              ) : (
                <SectionFormulaire numero={2} titre="Couleur par couleur : que sortez-vous de la réserve ?"
                  aide={`Des cartons ou rouleaux ENTIERS, et/ou le reste d'un carton ouvert compté en ${uniteVente || 'unité de vente'}. Un carton entamé ne sort de la réserve que de cette façon.`}>
                  <div className="space-y-3">
                    {couleurs.map(l => {
                      const cle = cleLigne(l);
                      const prep = preparations.get(cle);
                      const nom = l.color || 'Sans couleur';
                      if (!prep?.pret) {
                        return (
                          <div key={cle} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-[13px] font-black uppercase text-stone-800">{nom}</p>
                            <p className="text-[11px] font-bold text-amber-800 mt-0.5">{prep && !prep.pret ? prep.message : MESSAGE_SANS_CONTENU}</p>
                            {prep && !prep.pret && prep.raisons.length > 0 && (
                              <ul className="mt-1 list-disc pl-5 space-y-0.5 text-[11px] font-medium text-amber-900">
                                {prep.raisons.slice(0, 3).map(r => <li key={r}>{r}</li>)}
                              </ul>
                            )}
                          </div>
                        );
                      }
                      const dispo = disponibleDepuis(l, magasin, stores);
                      const calcul = calculs.get(cle);
                      const b = brouillons[cle];
                      const depasse = calcul && calcul.totalReserve > dispo + 0.0005 ? arrondi3(calcul.totalReserve - Math.max(0, dispo)) : 0;
                      return (
                        <div key={cle} className={`rounded-2xl border px-4 py-3 ${calcul && calcul.totalVente > 0 ? 'border-teal-300 bg-teal-50/40' : 'border-stone-200 bg-white'}`}>
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <p className="text-[13px] font-black uppercase text-stone-900">{nom}</p>
                            <p className="text-[11px] font-bold text-stone-500">
                              En réserve : <span className="text-stone-900">{nombreFr(dispo)} {uniteEnFrancais(prep.uniteReserve, dispo)}</span>
                              <span className="text-stone-400"> · {prep.detailFacteur}</span>
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {prep.colis.map(c => (
                              <label key={c.colis} className="block">
                                <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">{c.pluriel} entiers</span>
                                <Input
                                  type="number" inputMode="numeric" min="0" step="1"
                                  value={b?.colis?.[c.colis] ?? ''}
                                  onChange={e => changer(cle, c.colis, e.target.value)}
                                  placeholder="0"
                                  className="h-10 rounded-xl font-black"
                                  aria-label={`${c.pluriel} entiers — ${nom}`}
                                />
                                <span className="block text-[10px] font-medium text-stone-400 mt-0.5">{c.detail}</span>
                              </label>
                            ))}
                            <label className="block">
                              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">Reste d'un {prep.colis[0]?.nom || 'colis'} ouvert ({prep.uniteVente})</span>
                              <Input
                                type="number" inputMode={uniteDecimale(prep.uniteVente) ? 'decimal' : 'numeric'} min="0"
                                step={uniteDecimale(prep.uniteVente) ? '0.01' : '1'}
                                value={b?.reste ?? ''}
                                onChange={e => changer(cle, 'reste', e.target.value)}
                                placeholder="0"
                                className="h-10 rounded-xl font-black"
                                aria-label={`Reste d'un colis ouvert — ${nom}`}
                              />
                            </label>
                          </div>
                          {calcul && (calcul.parties.length > 0 || calcul.erreurs.length > 0 || calcul.avertissements.length > 0) && (
                            <div className="mt-2 space-y-1">
                              {calcul.parties.length > 0 && (
                                <p className="text-[12px] font-black text-teal-900">
                                  {calcul.parties.map(p => p.texte).join(' + ')}
                                  {calcul.parties.length > 1 ? ` = ${nombreFr(calcul.totalVente)} ${prep.uniteVente}` : ''}
                                  <span className="text-[11px] font-bold text-stone-500"> · sort de la réserve : {nombreFr(calcul.totalReserve)} {uniteEnFrancais(prep.uniteReserve, calcul.totalReserve)}</span>
                                </p>
                              )}
                              {calcul.erreurs.map(e => <p key={e} className="text-[11px] font-bold text-rose-700">{e}</p>)}
                              {calcul.avertissements.map(e => <p key={e} className="text-[11px] font-bold text-amber-700">{e}</p>)}
                              {depasse > 0 && (
                                <p className="text-[11px] font-bold text-amber-800 flex items-start gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  La réserve n'affiche que {nombreFr(dispo)} {uniteEnFrancais(prep.uniteReserve, dispo)} : la sortie passe quand même, et l'écart (+{nombreFr(depasse)}) sera signalé au journal.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionFormulaire>
              )}

              {!produitBloque && (
                <Recapitulatif titre="Ce qui part sur les étagères">
                  <LigneResume libelle="Total mis en rayon" valeur={`${nombreFr(totalVente)} ${uniteVente}`} fort ton={totalVente > 0 ? 'positif' : 'neutre'} />
                  {choisi.comptable && (
                    <LigneResume libelle="Sur les étagères après" valeur={`${nombreFr(arrondi3(choisi.quantite + totalVente))} ${uniteVente}`} />
                  )}
                  <LigneResume libelle="Couleur" valeur="aucune sur les étagères : une quantité totale" />
                </Recapitulatif>
              )}

              {erreur && <Encadre ton="attention" titre={incertain ? 'Enregistrement incertain' : "Rien n'a été enregistré"}>{erreur}</Encadre>}
            </>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enCours}
              className="h-11 rounded-xl text-[11px] font-black uppercase">Annuler</Button>
            {choisi && (
              <BoutonValider onClick={valider} raisonDesactive={raisonDesactive} enCours={enCours}>
                Mettre en rayon{totalVente > 0 ? ` · ${nombreFr(totalVente)} ${uniteVente}` : ''}
              </BoutonValider>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
