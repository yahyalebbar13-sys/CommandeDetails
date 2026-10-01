"use client";

/**
 * Le comptage des ÉTAGÈRES de CHRIFA (src/lib/etageres.ts).
 *
 * Les étagères sont le « détail » du magasin principal : on y vend à l'unité de vente du pôle
 * (pièce ou mètre), et leur stock n'a pas de couleur — une quantité par produit (famille +
 * qualité + taille). Le patron donnera les quantités à installer au départ : c'est par cet écran
 * qu'elles entrent, puis qu'elles se recomptent.
 *
 * Même règle que l'inventaire de la réserve : le chiffre du logiciel reste masqué tant que le
 * chiffre compté n'est pas saisi. L'écart s'écrit en ajustement « Inventaire » sur les étagères
 * (etagere: true, magasin principal, sans couleur, unité de vente) — la réserve n'en est jamais
 * touchée.
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, EyeOff, Minus, Plus, Equal, Search, X, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';
import type { StockItem, StockMovement } from '@/lib/types';
import {
  produitsDesEtageres, ajustementEtagere, MESSAGE_SANS_UNITE_VENTE, LIBELLE_ETAGERES,
  type ProduitEtagere,
} from '@/lib/etageres';
import { uniteDecimale, pasDeSaisie } from '@/lib/unites-pole';
import { getLocalDateString } from '@/lib/constants';

/** Une ligne comptée, telle que la liste « Comptages de cette session » l'affiche. */
export interface CompteEtagere {
  cle: string;
  productName: string;
  quality?: string;
  size?: string;
  unite: string;
  theorique: number;
  compte: number;
  /**
   * Première installation de ce produit sur les étagères : ce qui y est posé est encore compté
   * dans la réserve. La réserve de ce produit est à recompter (mode Réserve, hors étagères).
   */
  reserveARecompter?: boolean;
}

const arrondi3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const sansAccent = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ComptageEtageres({
  stockItems, categories, generalCategories, magasin, nomDuLieu, onAddMovement, onCompte,
}: {
  /** Les lignes de stock de la vue du magasin principal, lignes Étagères comprises. */
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  /** Le magasin principal : les étagères sont chez lui. */
  magasin: string;
  nomDuLieu: string;
  /** Rend false quand l'écriture a échoué (message déjà affiché). */
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<boolean | void>;
  onCompte: (ligne: CompteEtagere) => void;
}) {
  const produits = useMemo(
    () => produitsDesEtageres(stockItems, categories, generalCategories),
    [stockItems, categories, generalCategories],
  );
  const [recherche, setRecherche] = useState('');
  const [cleChoisie, setCleChoisie] = useState<string | null>(null);
  const [valeur, setValeur] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Relu à chaque rendu : après une écriture, le chiffre du logiciel suit aussitôt.
  const choisi: ProduitEtagere | null = cleChoisie ? produits.find(p => p.cle === cleChoisie) || null : null;
  const unite = choisi?.uniteVente || 'unité';
  const decimale = uniteDecimale(unite);

  const listes = useMemo(() => {
    const q = sansAccent(recherche).trim();
    const filtres = !q ? produits : produits.filter(p => sansAccent(
      `${p.nameFR || ''} ${p.productName} ${p.quality || ''} ${p.size || ''} ${p.categoryNameFR || ''} ${p.categoryId}`,
    ).includes(q));
    return filtres.slice(0, 60);
  }, [produits, recherche]);

  const compte = valeur === '' ? null : arrondi3(Number(String(valeur).replace(',', '.')));
  // Jamais encore compté ni mis en rayon : c'est l'installation de la quantité de départ. Ce qui
  // est déjà sur les étagères a toujours été compté dans la réserve (le magasin en fait partie).
  const premiereInstallation = Boolean(choisi) && !choisi!.dejaSurEtageres;
  const ecart = choisi && compte !== null && Number.isFinite(compte) ? arrondi3(compte - choisi.quantite) : null;

  const raisonBloque = (): string | null => {
    if (!choisi) return 'Choisissez d\'abord le produit compté.';
    if (!choisi.comptable) return MESSAGE_SANS_UNITE_VENTE;
    if (valeur === '' || compte === null || !Number.isFinite(compte)) return 'Saisissez la quantité comptée sur les étagères.';
    if (compte < 0) return 'Une quantité comptée ne peut pas être négative.';
    if (!decimale && !Number.isInteger(compte)) return `Les ${unite} se comptent en nombres entiers.`;
    return null;
  };

  const valider = async () => {
    if (!choisi || enCours || raisonBloque() || compte === null) return;
    setEnCours(true);
    try {
      const mouvement = ajustementEtagere({ produit: choisi, compte, magasin, date: getLocalDateString() });
      if (mouvement) {
        // Écriture refusée (règles, réseau…) : le comptage n'est PAS noté fait, le produit reste
        // choisi et la saisie reste là pour recommencer.
        const ok = await onAddMovement(mouvement as Omit<StockMovement, 'id' | 'createdAt'>);
        if (ok === false) return;
      }
      onCompte({
        cle: choisi.cle,
        productName: choisi.nameFR || choisi.productName,
        quality: choisi.quality,
        size: choisi.size,
        unite,
        theorique: choisi.quantite,
        compte,
        ...(premiereInstallation && compte > 0 ? { reserveARecompter: true } : {}),
      });
      setCleChoisie(null);
      setValeur('');
    } finally {
      setEnCours(false);
    }
  };

  if (!choisi) {
    return (
      <SectionFormulaire
        numero={1}
        titre="Quel produit des étagères comptez-vous ?"
        aide="Une ligne par produit : famille, qualité et taille. La couleur ne compte pas sur les étagères — additionnez toutes les couleurs du même produit."
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <Input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Chercher un produit, une qualité, une taille…"
            className={`${CLASSE_CHAMP} pl-9`}
          />
        </div>
        {listes.length === 0 ? (
          <p className="text-[12px] font-bold text-stone-400 text-center py-6">Aucun produit ne correspond.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-stone-100 rounded-2xl border border-stone-200">
            {listes.map(p => (
              <button
                key={p.cle}
                type="button"
                onClick={() => { setCleChoisie(p.cle); setValeur(''); }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-teal-50/60 transition-colors flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-black text-stone-900 leading-tight truncate">{p.nameFR || p.productName}</span>
                  <span className="block text-[11px] font-bold text-stone-500 mt-0.5 truncate">
                    {[p.quality, p.size].filter(Boolean).join(' · ') || p.categoryNameFR || p.categoryId}
                  </span>
                </span>
                {/* Comptage à l'aveugle : aucune quantité ici, seulement l'unité de comptage. */}
                {p.comptable ? (
                  <span className="text-[11px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg shrink-0">
                    en {p.uniteVente}
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shrink-0">
                    Unité de vente à définir
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {produits.length > listes.length && (
          <p className="text-[11px] font-medium text-stone-400 text-center">
            {listes.length} produits affichés sur {produits.length} — précisez la recherche pour trouver les autres.
          </p>
        )}
      </SectionFormulaire>
    );
  }

  const raison = raisonBloque();

  return (
    <>
      <SectionFormulaire
        numero={1}
        titre="Produit compté sur les étagères"
        aide="Vérifiez la qualité et la taille : elles ont chacune leur stock. La couleur, elle, ne compte pas ici."
        action={
          <button
            type="button"
            onClick={() => { setCleChoisie(null); setValeur(''); }}
            title="Changer de produit"
            className="text-[11px] font-bold text-stone-400 hover:text-stone-700 inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Changer
          </button>
        }
      >
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-700 inline-flex items-center gap-1">
            <Layers className="w-3 h-3" /> {LIBELLE_ETAGERES}
          </p>
          <p className="text-sm font-black text-stone-900 leading-tight mt-1">{choisi.nameFR || choisi.productName}</p>
          <p className="text-[11px] font-bold text-stone-500 mt-1">
            {[choisi.quality, choisi.size].filter(Boolean).join(' · ') || choisi.categoryNameFR || choisi.categoryId} · toutes couleurs
          </p>
        </div>
      </SectionFormulaire>

      {!choisi.comptable ? (
        <Encadre ton="attention" titre="Ce produit ne peut pas encore être compté sur les étagères">
          {MESSAGE_SANS_UNITE_VENTE}. Les étagères se comptent dans l'unité de vente du pôle (pièce ou
          mètre) ; sans elle, le logiciel n'écrit rien plutôt que d'inventer un chiffre.
        </Encadre>
      ) : (
        <>
          <SectionFormulaire
            numero={2}
            titre="Combien y en a-t-il sur les étagères ?"
            aide={`Toutes les couleurs ensemble, en ${unite}. Ne comptez pas la réserve : elle a son propre inventaire.`}
          >
            <Champ
              label="Quantité comptée sur les étagères"
              obligatoire
              htmlFor="etageres-quantite-comptee"
              indice={unite}
              aide={decimale ? 'Les décimales sont permises (ex. 12,5).' : 'En nombre entier.'}
            >
              <Input
                id="etageres-quantite-comptee"
                type="number" min={0} step={pasDeSaisie(unite)} autoFocus
                value={valeur}
                onChange={e => setValeur(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') valider(); }}
                className={`${CLASSE_CHAMP} text-xl md:text-xl font-black bg-white border-teal-200`}
                placeholder="0"
              />
            </Champ>

            {ecart !== null && (
              <div className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 border ${
                ecart === 0 ? 'bg-emerald-50 border-emerald-200' : ecart > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
              }`}>
                <span className={`text-[13px] font-bold leading-tight flex items-center gap-2 ${
                  ecart === 0 ? 'text-emerald-800' : ecart > 0 ? 'text-blue-800' : 'text-red-800'
                }`}>
                  {ecart === 0 ? <Equal className="w-4 h-4 shrink-0" /> : ecart > 0 ? <Plus className="w-4 h-4 shrink-0" /> : <Minus className="w-4 h-4 shrink-0" />}
                  {ecart === 0
                    ? 'Aucun écart : les étagères étaient déjà justes'
                    : ecart > 0
                      ? 'Il y en a plus que ce que dit le logiciel'
                      : 'Il y en a moins que ce que dit le logiciel'}
                </span>
                <span className={`text-xl font-black tabular-nums shrink-0 ${
                  ecart === 0 ? 'text-emerald-800' : ecart > 0 ? 'text-blue-800' : 'text-red-800'
                }`}>
                  {ecart > 0 ? '+' : ''}{ecart}
                </span>
              </div>
            )}
          </SectionFormulaire>

          <SectionFormulaire
            numero={3}
            titre="Relisez, puis enregistrez"
            aide="La correction porte sur les étagères seulement : la réserve ne bouge pas."
          >
            {premiereInstallation && (
              <Encadre ton="attention" titre="Attention au double comptage avec la réserve">
                C'est la première fois que ce produit est compté sur les étagères. Jusqu'ici, ce qui y est posé
                était encore compté dans la <span className="font-black">réserve</span>. Après cet enregistrement,
                recomptez la réserve de ce produit (mode « Réserve, hors étagères »), sinon ces {unite} seront
                comptées deux fois. Pour un carton ouvert, « Mettre en rayon » (le reste d'un carton ouvert)
                le retire directement de la réserve.
              </Encadre>
            )}
            {ecart === null ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-3.5 flex items-start gap-2.5">
                <EyeOff className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
                <p className="text-[11px] font-medium text-stone-500 leading-snug">
                  Le chiffre du logiciel reste masqué tant que le vôtre n'est pas saisi.
                </p>
              </div>
            ) : (
              <>
                <Recapitulatif titre="Avant d'enregistrer">
                  <LigneResume libelle="Lieu compté" valeur={`${nomDuLieu} · étagères`} />
                  <LigneResume libelle="Annoncé par le logiciel" valeur={`${choisi.quantite} ${unite}`} />
                  <LigneResume libelle="Compté sur les étagères" valeur={`${compte} ${unite}`} />
                  <LigneResume
                    fort
                    libelle="Écart"
                    ton={ecart === 0 ? 'positif' : 'alerte'}
                    valeur={ecart === 0 ? 'aucun' : `${ecart > 0 ? '+' : ''}${ecart} ${unite}`}
                  />
                </Recapitulatif>
                {ecart === 0 ? (
                  <Encadre ton="info">
                    Écart nul : <span className="font-black">aucun mouvement n'est écrit</span>. Le comptage
                    est seulement noté dans la liste de droite.
                  </Encadre>
                ) : (
                  <Encadre ton="attention">
                    Une correction de <span className="font-black">{ecart > 0 ? '+' : ''}{ecart} {unite}</span> va
                    être écrite sur les étagères de {nomDuLieu}, au motif « Inventaire », datée du jour.
                    La réserve n'est pas touchée{premiereInstallation ? ' : pensez à la recompter juste après' : ''}.
                  </Encadre>
                )}
              </>
            )}

            <BoutonValider
              onClick={valider}
              enCours={enCours}
              libelleEnCours="Enregistrement…"
              raisonDesactive={raison}
              className="!bg-teal-700 hover:!bg-teal-800"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Valider ce comptage des étagères
              </span>
            </BoutonValider>
          </SectionFormulaire>
        </>
      )}
    </>
  );
}
