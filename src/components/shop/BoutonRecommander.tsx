'use client';

// ─── « Commander la même chose » ─────────────────────────────────────────────
// Les lignes d'une ancienne commande remises au panier AU PRIX DU JOUR (catalogue actuel),
// avec la même variante si elle existe encore (lib/mes-commandes : recommander). Ce qui
// n'est plus disponible est dit sous le bouton ; le panier s'ouvre s'il a reçu quelque chose.
// Lignes données directement (page de la commande, résultat du suivi), ou lues au toucher
// par l'identifiant de la commande (« Mes commandes sur ce téléphone » : lecture par
// identifiant autorisée, une seule lecture par toucher).

import React, { useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase-db';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { recommander, type LigneARecommander, type RaisonIndisponible, type ResultatRecommande } from '@/lib/mes-commandes';
import { paire, premierTexte } from '@/lib/shop-textes';
import { libelleLignePanier } from '@/lib/shop-variantes';
import { lienProduit } from '@/lib/liens-boutique';
import type { Language } from '@/lib/translations';

const RAISONS: Record<RaisonIndisponible, Record<Language, string>> = {
  retire: { fr: 'n’est plus en vente', ar: 'لم يعد معروضاً للبيع' },
  sans_prix: { fr: 'prix à demander sur WhatsApp', ar: 'اسأل عن الثمن عبر واتساب' },
  rupture: { fr: 'en rupture de stock', ar: 'نفد من المخزون' },
  variante: { fr: 'ce choix n’existe plus', ar: 'هذا الاختيار لم يعد متوفراً' },
  a_choisir: { fr: 'taille ou couleur à choisir', ar: 'اختر المقاس أو اللون' },
};

interface Props {
  /** Lignes déjà lues (page de la commande, résultat du suivi). */
  lignes?: LigneARecommander[];
  /** Sinon : identifiant de la commande, lue au toucher. */
  idCommande?: string;
  /** Bouton plus bas, texte plus petit (liste « Mes commandes »). */
  compact?: boolean;
}

export default function BoutonRecommander({ lignes, idCommande, compact = false }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const { getProductById } = useShopProducts();
  const { addItems } = useShopCartActions();
  const [lecture, setLecture] = useState<'repos' | 'en_cours' | 'erreur'>('repos');
  const [resultat, setResultat] = useState<ResultatRecommande | null>(null);

  const lancer = async () => {
    if (lecture === 'en_cours') return;
    let source = lignes;
    if (!source && idCommande) {
      setLecture('en_cours');
      try {
        const snap = await getDoc(doc(db, 'shop_orders', idCommande));
        const items = snap.exists() ? snap.data()?.items : null;
        source = Array.isArray(items) ? items : [];
      } catch {
        setLecture('erreur');
        return;
      }
    }
    const r = recommander(source ?? [], getProductById);
    setLecture('repos');
    setResultat(r);
    // addItems ouvre le panier ; rien à ajouter : il reste fermé, le message dit pourquoi.
    if (r.aAjouter.length > 0) addItems(r.aAjouter);
  };

  const nomLigne = (l: LigneARecommander) =>
    premierTexte(language, paire(l, 'productName'), paire(getProductById(l.productId), 'name')) || (ar ? 'منتج' : 'Article');
  const varianteLigne = (l: LigneARecommander) => (l.variant ? libelleLignePanier(l.variant, language) : '');
  const nbAjoutees = resultat?.aAjouter.length ?? 0;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={lancer}
        disabled={lecture === 'en_cours'}
        className={`flex w-full items-center justify-center rounded-xl border-2 border-[#C8102E] bg-white text-[#C8102E] font-bold hover:bg-[#C8102E] hover:text-white disabled:opacity-60 transition-colors ${
          compact ? 'min-h-[44px] gap-1.5 px-3 text-xs' : 'min-h-[48px] gap-2 px-4 py-3 text-sm'
        }`}
      >
        {lecture === 'en_cours' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        {ar ? 'اطلب نفس الشيء' : 'Commander la même chose'}
      </button>

      <div aria-live="polite">
        {lecture === 'erreur' && (
          <p className="mt-2 text-xs text-red-700 flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {ar ? 'تعذّر قراءة الطلب. تحقق من اتصالك ثم أعد المحاولة.' : 'Impossible de relire la commande. Vérifiez votre connexion, puis réessayez.'}
          </p>
        )}

        {resultat && (
          <div className="mt-2 space-y-1.5 text-xs text-start">
            {nbAjoutees > 0 ? (
              <p className="flex items-start gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {ar
                  ? `أُضيف إلى السلة (${nbAjoutees}) بثمن اليوم.`
                  : `${nbAjoutees} article${nbAjoutees > 1 ? 's' : ''} remis au panier, au prix du jour.`}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 font-semibold text-[#4A4A4A]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                {ar ? 'لم يُضف أي منتج إلى السلة.' : 'Aucun article n’a pu être remis au panier.'}
              </p>
            )}

            {resultat.reduites.map((r, i) => (
              <p key={`q${i}`} className="text-[#4A4A4A]">
                {ar
                  ? <>الكمية صارت <bdi dir="ltr">{r.quantite}</bdi> لـ {nomLigne(r.ligne)} (المخزون المتوفر).</>
                  : <>Quantité ramenée à {r.quantite} pour {nomLigne(r.ligne)} (stock disponible).</>}
              </p>
            ))}

            {resultat.indisponibles.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="font-bold text-[#1A1A1A] mb-1">{ar ? 'غير متوفر:' : 'Plus disponible :'}</p>
                <ul className="space-y-1">
                  {resultat.indisponibles.map((x, i) => {
                    const variante = varianteLigne(x.ligne);
                    // Produit toujours en vente : sa fiche permet de choisir autre chose.
                    const lien = x.produit && x.raison !== 'retire' ? lienProduit(x.produit, language) : null;
                    return (
                      <li key={`i${i}`} className="text-[#4A4A4A]">
                        • <span className="font-semibold text-[#1A1A1A]">{nomLigne(x.ligne)}</span>
                        {variante && <> ({variante})</>} : {RAISONS[x.raison][language]}
                        {lien && (
                          <>
                            {' '}
                            <Link href={lien} className="font-bold text-[#C8102E] underline whitespace-nowrap">
                              {ar ? 'عرض المنتج' : 'Voir le produit'}
                            </Link>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
