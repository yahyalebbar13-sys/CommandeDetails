'use client';

// Fiche produit : prix, choix du modèle / de la taille / de la couleur, quantité et ajout au panier.
// Tout est visible dès l'arrivée et se choisit dans l'ordre qu'on veut ; le bouton rouge n'est
// jamais gris (s'il manque un choix, il montre où). La logique est dans lib/shop-variantes.
// Sans prix (le produit, ou la variante choisie) : « Prix sur demande », pas d'état de stock,
// et le bouton rouge demande le prix sur WhatsApp au lieu d'ajouter au panier.
// Sous le prix : ce qu'on achète (« Vendu par rouleau de 50 m ») et, quand c'est sûr, le prix
// au mètre ou à la pièce (lib/unite-vente). Promotion : ancien prix barré et « -X % », seulement
// si l'admin a saisi un « Prix barré » plus haut que le prix facturé.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Layers, ListPlus, MessageCircle, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { useShopCartActions, useShopCartState } from '@/contexts/shop-cart-context';
import type { CartItem, ProductVariant, ShopProduct } from '@/lib/shop-types';
import type { Language } from '@/lib/translations';
import { translations } from '@/lib/translations';
import { formatPrice, getDiscountPercent, getWhatsAppContact, hasActivePromo } from '@/lib/shop-utils';
import { prixUnitaire, textePrixUnitaire, texteUnite, uniteDeVente } from '@/lib/unite-vente';
import {
  analyserVariantes,
  blocsManquants,
  choisirOption,
  cleDe,
  construireCartItem,
  estCouleurClaire,
  estTransparent,
  etatStock,
  exempleDe,
  libelleLignePanier,
  libelleValeur,
  libelleVariante,
  messageDemandePrix,
  optionCompatible,
  PRIX_SUR_DEMANDE,
  prixDe,
  prixDesVariantes,
  prixUniqueDOption,
  prixVarientDansBloc,
  sansPrix,
  selectionDe,
  trierVariantes,
  identifiant,
  varianteResolue,
  variantesCompatibles,
  variantIdPanier,
  type DimVariante,
  type Selection,
} from '@/lib/shop-variantes';
import { lienComplet, lienProduit } from '@/lib/liens-boutique';

const QTE_MAX_SANS_STOCK = 9999;

// ─── Textes ─────────────────────────────────────────────────────────────────

type Mots = { fr: string; ar: string };

function motsDim(dim: DimVariante, grammage: boolean) {
  if (dim === 'model') return { nom: { fr: 'Modèle', ar: 'الموديل' }, le: { fr: 'le modèle', ar: 'الموديل' }, un: { fr: 'un modèle', ar: 'الموديل' }, plusieurs: { fr: 'modèles', ar: 'عدة موديلات' }, change: { fr: 'Modèle changé', ar: 'تم تغيير الموديل' }, autre: { fr: 'Un autre modèle ? Touchez-le en haut', ar: 'موديل آخر؟ اختره من الأعلى' } };
  if (dim === 'size' && grammage) return { nom: { fr: 'Grammage', ar: 'الوزن' }, le: { fr: 'le grammage', ar: 'الوزن' }, un: { fr: 'un grammage', ar: 'الوزن' }, plusieurs: { fr: 'grammages', ar: 'عدة أوزان' }, change: { fr: 'Grammage changé', ar: 'تم تغيير الوزن' }, autre: { fr: 'Un autre grammage ? Touchez-le en haut', ar: 'وزن آخر؟ اختره من الأعلى' } };
  if (dim === 'size') return { nom: { fr: 'Taille', ar: 'المقاس' }, le: { fr: 'la taille', ar: 'المقاس' }, un: { fr: 'une taille', ar: 'المقاس' }, plusieurs: { fr: 'tailles', ar: 'عدة مقاسات' }, change: { fr: 'Taille changée', ar: 'تم تغيير المقاس' }, autre: { fr: 'Une autre taille ? Touchez-la en haut', ar: 'مقاس آخر؟ اختره من الأعلى' } };
  return { nom: { fr: 'Couleur', ar: 'اللون' }, le: { fr: 'la couleur', ar: 'اللون' }, un: { fr: 'une couleur', ar: 'اللون' }, plusieurs: { fr: 'couleurs', ar: 'عدة ألوان' }, change: { fr: 'Couleur changée', ar: 'تم تغيير اللون' }, autre: { fr: 'Une autre couleur ? Touchez-la en haut', ar: 'لون آخر؟ اختره من الأعلى' } };
}

// « la taille et la couleur » / « المقاس واللون »
function enumerer(mots: Mots[], language: Language): string {
  const liste = mots.map(m => m[language === 'ar' ? 'ar' : 'fr']);
  if (language === 'ar') return liste.join(' و');
  if (liste.length <= 1) return liste.join('');
  return `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`;
}

const t = (language: Language, fr: string, ar: string) => (language === 'ar' ? ar : fr);

// ─── Petits éléments ────────────────────────────────────────────────────────

// Pastille d'une variante : sa photo, sinon sa couleur (damier pour le transparent)
function Pastille({ v, taille, photo = true }: { v: ProductVariant; taille: 'sm' | 'md' | 'lg'; photo?: boolean }) {
  const dims = taille === 'sm' ? 'size-6' : taille === 'md' ? 'size-8' : 'size-12';
  if (photo && v.image) {
    const dimsPhoto = taille === 'sm' ? 'size-6' : taille === 'md' ? 'size-10' : 'size-12';
    return <img src={v.image} alt="" loading="lazy" decoding="async" className={`${dimsPhoto} shrink-0 rounded-lg object-cover bg-neutral-100`} />;
  }
  const style: React.CSSProperties = estTransparent(v)
    ? { background: 'repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%) 50% / 10px 10px' }
    : { backgroundColor: v.colorHex || '#d4d4d4' };
  const contour = estTransparent(v) || estCouleurClaire(v.colorHex) ? 'ring-black/40' : 'ring-black/15';
  return <span aria-hidden="true" className={`${dims} inline-block shrink-0 rounded-full ring-1 ring-inset ${contour}`} style={style} />;
}

function Coche({ dedans = false }: { dedans?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute ${dedans ? 'top-2 end-2' : '-top-2 -end-2'} size-6 rounded-full bg-[#C8102E] text-white grid place-items-center shadow`}
    >
      <Check className="size-4" strokeWidth={3} />
    </span>
  );
}

// Chiffres arabes-indiens (٠-٩, ۰-۹) des claviers arabes → chiffres latins
function chiffresLatins(texte: string): string {
  return texte.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) & 0xf));
}

// Compteur − [champ] + ; toujours de gauche à droite, même en arabe
function Compteur({
  valeur,
  min,
  max,
  onChange,
  language,
  petit = false,
  nom,
}: {
  valeur: number;
  min: number;
  max: number;
  onChange: (valeur: number, depasse: boolean) => void;
  language: Language;
  petit?: boolean;
  // Ce que compte ce compteur (liste de quantités : « 25mm · Noir »), pour les lecteurs d'écran
  nom?: string;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);
  // Dans la liste, le pied collant couvre le bas de l'écran : le focus s'arrête au-dessus
  const marge = petit ? 'scroll-mb-36 lg:scroll-mb-24' : '';
  const bouton = `${petit ? 'size-11' : 'size-12'} ${marge}`;
  const champ = `${petit ? 'w-12 h-11 text-lg' : 'w-16 h-12 text-xl'} ${marge}`;
  const suffixe = nom ? ` — ${nom}` : '';

  const valider = () => {
    if (saisie === null) return;
    const n = saisie === '' ? min : parseInt(saisie, 10);
    setSaisie(null);
    if (isNaN(n)) return;
    onChange(Math.max(min, Math.min(max, n)), n > max);
  };

  return (
    <div dir="ltr" className="inline-flex items-stretch rounded-xl border-2 border-neutral-300 overflow-hidden bg-white shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, valeur - 1), false)}
        disabled={valeur <= min}
        aria-label={t(language, `Diminuer${suffixe}`, `إنقاص${suffixe}`)}
        className={`${bouton} grid place-items-center text-neutral-800 active:bg-neutral-100 disabled:text-neutral-300`}
      >
        <Minus className="size-5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={saisie ?? String(valeur)}
        onFocus={e => e.currentTarget.select()}
        onChange={e => {
          const texte = chiffresLatins(e.target.value).replace(/\D/g, '').slice(0, 5);
          setSaisie(texte);
          // Le total du bouton suit la saisie, sans attendre la sortie du champ
          const n = parseInt(texte, 10);
          if (!isNaN(n) && n >= min && n <= max) onChange(n, false);
        }}
        onBlur={valider}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label={t(language, `Quantité${suffixe}`, `الكمية${suffixe}`)}
        className={`${champ} border-x-2 border-neutral-300 text-center font-black tabular-nums outline-none focus:bg-neutral-50`}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, valeur + 1), valeur + 1 > max)}
        aria-label={t(language, `Augmenter${suffixe}`, `زيادة${suffixe}`)}
        className={`${bouton} grid place-items-center text-neutral-800 active:bg-neutral-100`}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

// ─── Composant ──────────────────────────────────────────────────────────────

interface ChoixVarianteProps {
  product: ShopProduct;
  // Variante retenue (null tant que le choix n'est pas complet) : spécifications de la fiche
  onSelectionChange?: (variante: ProductVariant | null) => void;
  // Photo à montrer en grand dans la galerie
  onImagePreview?: (image?: string) => void;
}

export default function ChoixVariante({ product, onSelectionChange, onImagePreview }: ChoixVarianteProps) {
  const { language } = useLanguage();
  const { addItems, openCart } = useShopCartActions();
  const { items: panier } = useShopCartState();

  const analyse = useMemo(() => analyserVariantes(product.variants), [product.variants]);
  const aVariantes = analyse.achetables.length > 0;
  const aChoisir = analyse.aChoisir;
  const minQte = Math.max(1, product.minOrderQty || 1);

  // ── État du choix simple
  const [selection, setSelection] = useState<Selection>({});
  const [avis, setAvis] = useState<{ dim: DimVariante | 'liste'; texte: string } | null>(null);
  const [quantite, setQuantite] = useState(minQte);
  const [avisMax, setAvisMax] = useState<number | null>(null);
  const [relance, setRelance] = useState(false);
  const [surligne, setSurligne] = useState<DimVariante | 'liste' | null>(null);
  const [ajoute, setAjoute] = useState(false);
  // Choix simple qui vient d'être ajouté tel quel : la liste ne le recopie pas (sinon il partirait deux fois)
  const [dernierAjout, setDernierAjout] = useState<string | null>(null);

  // ── État de la liste de quantités (ateliers)
  const [modeListe, setModeListe] = useState(false);
  const [qtesListe, setQtesListe] = useState<Record<string, number>>({});
  const [ajoutesListe, setAjoutesListe] = useState<number | null>(null);
  const [alerteListe, setAlerteListe] = useState(false);

  const blocs = useRef<Partial<Record<DimVariante | 'liste', HTMLDivElement | null>>>({});
  const hautListe = useRef<HTMLDivElement | null>(null);
  const minuteries = useRef<number[]>([]);
  useEffect(() => () => minuteries.current.forEach(id => window.clearTimeout(id)), []);
  const plusTard = (fn: () => void, ms: number) => {
    minuteries.current.push(window.setTimeout(fn, ms));
  };

  const variante = useMemo(() => {
    if (analyse.achetables.length === 1) return analyse.achetables[0];
    return varianteResolue(analyse, selection);
  }, [analyse, selection]);
  const compatibles = useMemo(() => variantesCompatibles(analyse, selection), [analyse, selection]);
  const manquants = blocsManquants(analyse, selection);
  const complet = !aVariantes || variante !== null;

  // Tient la fiche au courant (spécifications de la variante)
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    onSelectionChangeRef.current?.(variante);
  }, [variante]);

  // ── Prix et disponibilité
  const prix = variante
    ? { montant: prixDe(product.price, variante), aPartirDe: false }
    : aVariantes
      ? prixDesVariantes(product.price, compatibles)
      : { montant: product.price || 0, aPartirDe: false };
  const promo = !prix.aPartirDe && hasActivePromo(product.comparePrice, prix.montant);
  // Aucun prix pour ce qui est choisi (ou pour tout le produit) : on demande le prix sur WhatsApp
  const demandePrix = prix.montant <= 0;
  // Ce qu'on achète pour ce prix (variante choisie, sinon ce que toutes les variantes partagent)
  // Filet de sécurité : une lecture qui échoue n'empêche jamais de choisir ni d'acheter
  const unite = useMemo(() => {
    try {
      return uniteDeVente(product, variante);
    } catch {
      return null;
    }
  }, [product, variante]);
  const parUnite = demandePrix ? null : prixUnitaire(unite, prix.montant);
  const produitSansPrix = useMemo(() => sansPrix(product), [product]);
  // Prix en chiffres, ou « Prix sur demande » dans la langue du site
  const textePrix = (montant: number) => (montant > 0 ? formatPrice(montant) : PRIX_SUR_DEMANDE[language]);

  const stockProduitSimple = product.stockQty ?? 0;
  const enRupture = !aVariantes && stockProduitSimple <= 0;
  const stockAffiche = variante ? variante.stock : aVariantes ? Math.max(0, ...compatibles.map(v => v.stock)) : stockProduitSimple;
  const maxQte = (() => {
    const stock = variante ? variante.stock : aVariantes ? 0 : stockProduitSimple;
    return stock > 0 ? Math.max(minQte, stock) : QTE_MAX_SANS_STOCK;
  })();

  // La nouvelle variante a moins de stock que la quantité voulue : on la ramène au maximum
  useEffect(() => {
    if (quantite > maxQte) {
      setQuantite(maxQte);
      setAvisMax(maxQte);
    }
  }, [maxQte, quantite]);

  const changerQuantite = (valeur: number, depasse: boolean) => {
    setQuantite(valeur);
    setAvisMax(depasse && maxQte < QTE_MAX_SANS_STOCK ? maxQte : null);
  };

  // ── Toucher une option
  const montrerPhoto = (suite: Selection, dim: DimVariante | null, cle: string | null) => {
    const resolue = analyse.achetables.length === 1 ? analyse.achetables[0] : varianteResolue(analyse, suite);
    if (resolue?.image) return onImagePreview?.(resolue.image);
    const avecPhoto = variantesCompatibles(analyse, suite).find(v => v.image && (!dim || cleDe(v, dim) === cle));
    if (avecPhoto?.image) onImagePreview?.(avecPhoto.image);
  };

  const toucherOption = (dim: DimVariante, cle: string) => {
    if (selection[dim] === cle) return;
    const { selection: suite, ajustements } = choisirOption(analyse, selection, dim, cle);
    setSelection(suite);
    setAvis(null);
    if (ajustements.length > 0) {
      const touchee = libelleValeur(exempleDe(analyse, dim, cle)!, dim, language);
      const a = ajustements[0];
      const mots = motsDim(a.dim, analyse.grammage);
      const ancienne = libelleValeur(exempleDe(analyse, a.dim, a.ancienne)!, a.dim, language);
      const texte = a.nouvelle !== null
        ? (() => {
            const nouvelle = libelleValeur(exempleDe(analyse, a.dim, a.nouvelle)!, a.dim, language);
            return language === 'ar'
              ? `${mots.change.ar} إلى ${nouvelle} لأن ${touchee} غير متوفر مع ${ancienne}.`
              : `${mots.change.fr} en ${nouvelle} : ${touchee} n'existe pas en ${ancienne}.`;
          })()
        : language === 'ar'
          ? `${ancienne} غير متوفر مع ${touchee}، اختر ${mots.le.ar} من جديد.`
          : `${ancienne} n'existe pas en ${touchee} : choisissez à nouveau ${mots.le.fr}.`;
      setAvis({ dim: a.dim, texte });
    }
    montrerPhoto(suite, dim, cle);
  };

  const toucherLigne = (v: ProductVariant) => {
    const suite = selectionDe(analyse, v);
    setSelection(suite);
    setAvis(null);
    montrerPhoto(suite, null, null);
  };

  // Le client a choisi : la carte « Votre choix » quitte l'ambre
  useEffect(() => {
    if (complet) setRelance(false);
  }, [complet]);

  // ── Ajouter au panier (choix simple)
  const ajouter = () => {
    if (ajoute || enRupture) return;
    if (!complet) {
      const premier: DimVariante | 'liste' = analyse.listeUnique ? 'liste' : manquants[0];
      blocs.current[premier]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setRelance(true);
      setSurligne(premier);
      plusTard(() => setSurligne(null), 2000);
      try {
        navigator.vibrate?.(50);
      } catch {}
      return;
    }
    // Jamais de ligne sans prix au panier (le bouton est alors le lien WhatsApp)
    if (demandePrix) return;
    addItems([construireCartItem(product, variante, Math.max(minQte, quantite))], { ouvrir: false });
    setAjoute(true);
    setDernierAjout(variante ? identifiant(variante) : '');
    plusTard(() => setAjoute(false), 1500);
  };

  // Un nouveau choix ou une nouvelle quantité n'est plus « déjà ajouté »
  useEffect(() => {
    setDernierAjout(null);
  }, [variante, quantite]);

  // ── Liste de quantités
  const variantesTriees = useMemo(() => trierVariantes(analyse), [analyse]);
  const prixDifferentsListe = useMemo(
    () => new Set(analyse.achetables.map(v => prixDe(product.price, v))).size > 1,
    [analyse, product.price],
  );
  // Une ligne sans prix n'a pas de compteur : elle ne reçoit jamais de quantité
  const totalListe = variantesTriees.reduce((s, v) => s + (qtesListe[identifiant(v)] || 0), 0);
  const montantListe = variantesTriees.reduce((s, v) => s + (qtesListe[identifiant(v)] || 0) * prixDe(product.price, v), 0);

  const ouvrirListe = () => {
    if (variante && complet && !demandePrix && !qtesListe[identifiant(variante)] && dernierAjout !== identifiant(variante)) {
      setQtesListe(q => ({ ...q, [identifiant(variante)]: quantite }));
    }
    setModeListe(true);
    setAlerteListe(false);
    requestAnimationFrame(() => hautListe.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const ajouterListe = () => {
    if (ajoutesListe !== null) return;
    const lignes: CartItem[] = variantesTriees
      .filter(v => (qtesListe[identifiant(v)] || 0) > 0 && prixDe(product.price, v) > 0)
      .map(v => construireCartItem(product, v, qtesListe[identifiant(v)]));
    if (lignes.length === 0) {
      setAlerteListe(true);
      hautListe.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    addItems(lignes, { ouvrir: false });
    setAjoutesListe(totalListe);
    setQtesListe({});
    setAlerteListe(false);
    plusTard(() => setAjoutesListe(null), 1500);
  };

  // ── Ce produit dans le panier
  const dansPanier = panier.filter(item => item.productId === product.id);
  // Ligne du panier qui correspond au choix actuel (rappel sous le bouton, contre les doubles ajouts)
  const ligneActuelle = complet
    ? dansPanier.find(item => (variante ? item.variant?.variantId === variantIdPanier(variante) : !item.variant))
    : undefined;
  const libellePanier = (item: CartItem) => {
    const v = item.variant?.variantId ? analyse.achetables.find(x => variantIdPanier(x) === item.variant!.variantId) : undefined;
    if (v) return libelleVariante(v, analyse, language);
    return libelleLignePanier(item.variant, language) || (language === 'ar' && product.nameAr ? product.nameAr : product.name);
  };

  // ── WhatsApp
  const nomProduit = language === 'ar' && product.nameAr ? product.nameAr : product.name;
  const lienFiche = lienComplet(lienProduit(product, language));
  const messageWhatsApp = (() => {
    if (modeListe && totalListe > 0) {
      const lignes = variantesTriees
        .filter(v => (qtesListe[identifiant(v)] || 0) > 0)
        .map(v => `- ${libelleVariante(v, analyse, language)} × ${qtesListe[identifiant(v)]}`)
        .join('\n');
      return language === 'ar'
        ? `السلام عليكم LEBTEX، أريد أن أطلب:\n${nomProduit}\n${lignes}\n${lienFiche}`
        : `Bonjour LEBTEX, je voudrais commander :\n${nomProduit}\n${lignes}\n${lienFiche}`;
    }
    if (!modeListe && complet && !enRupture) {
      const libelle = variante ? libelleVariante(variante, analyse, language) : '';
      const ligne = `${nomProduit}${libelle ? ` — ${libelle}` : ''} × ${quantite}`;
      return language === 'ar'
        ? `السلام عليكم LEBTEX، أريد أن أطلب:\n${ligne}\n${lienFiche}`
        : `Bonjour LEBTEX, je voudrais commander :\n${ligne}\n${lienFiche}`;
    }
    return language === 'ar'
      ? `السلام عليكم LEBTEX، عندي سؤال حول: ${nomProduit}\n${lienFiche}`
      : `Bonjour LEBTEX, j'ai une question sur : ${nomProduit}\n${lienFiche}`;
  })();

  // Demande de prix (en français, pour l'équipe) : la variante choisie, ou les choix déjà faits
  const choixEnFrancais = variante
    ? libelleVariante(variante, analyse, 'fr')
    : aChoisir
        .filter(d => selection[d] !== undefined)
        .map(d => libelleValeur(exempleDe(analyse, d, selection[d]!)!, d, 'fr'))
        .join(' · ');
  const lienDemandePrix = getWhatsAppContact(messageDemandePrix(product, choixEnFrancais));

  // ── Rendu des blocs de choix
  const titreBloc = (dim: DimVariante) => {
    const mots = motsDim(dim, analyse.grammage);
    const cle = selection[dim];
    if (cle === undefined) return <>{t(language, `Choisissez ${mots.le.fr}`, `اختر ${mots.le.ar}`)}</>;
    return (
      <>
        {language === 'ar' ? `${mots.nom.ar}:` : `${mots.nom.fr} :`}{' '}
        <bdi className="font-black text-[#C8102E]">{libelleValeur(exempleDe(analyse, dim, cle)!, dim, language)}</bdi>
      </>
    );
  };

  const classesOption = (choisi: boolean, incompatible: boolean) =>
    `relative rounded-xl border-2 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C8102E]/30 ${
      choisi
        ? 'border-[#C8102E] bg-red-50 text-neutral-900'
        : incompatible
          ? 'border-dashed border-neutral-300 bg-neutral-50 text-neutral-400'
          : 'border-neutral-300 bg-white text-neutral-900 hover:border-neutral-500'
    }`;

  const avisSous = (dim: DimVariante | 'liste') =>
    avis && avis.dim === dim ? (
      <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        {avis.texte}
      </p>
    ) : null;

  const conteneurBloc = (cle: DimVariante | 'liste') =>
    `scroll-mt-40 rounded-2xl p-2 -mx-2 transition-colors ${surligne === cle ? 'ring-4 ring-amber-300 bg-amber-50' : ''}`;

  const choixActuelTexte = (dim: DimVariante) =>
    aChoisir
      .filter(d => d !== dim && selection[d] !== undefined)
      .map(d => libelleValeur(exempleDe(analyse, d, selection[d]!)!, d, language))
      .join(' · ');

  const renderBloc = (dim: DimVariante) => {
    const valeurs = analyse.valeurs[dim];
    const prixSurOptions = prixVarientDansBloc(analyse, product.price, dim);
    const idTitre = `choix-${dim}`;
    const libelles = valeurs.map(val => libelleValeur(val.exemple, dim, language));

    let grille = 'grid grid-cols-2 sm:grid-cols-3 gap-2';
    if (dim === 'model') grille = 'grid grid-cols-2 sm:grid-cols-3 gap-3';
    if (dim === 'size') {
      grille = prixSurOptions || libelles.some(l => l.length > 6) ? 'grid grid-cols-3 sm:grid-cols-4 gap-2' : 'grid grid-cols-4 sm:grid-cols-6 gap-2';
    }

    return (
      <div
        key={dim}
        ref={el => {
          blocs.current[dim] = el;
        }}
        role="radiogroup"
        aria-labelledby={idTitre}
        className={conteneurBloc(dim)}
      >
        <h2 id={idTitre} className={`mb-2 text-base font-bold ${surligne === dim ? 'text-amber-800' : 'text-neutral-900'}`}>
          {titreBloc(dim)}
        </h2>
        <div className={grille}>
          {valeurs.map((val, i) => {
            const choisi = selection[dim] === val.cle;
            const incompatible = !choisi && !optionCompatible(analyse, selection, dim, val.cle);
            const prixOption = prixSurOptions ? prixUniqueDOption(analyse, product.price, dim, val.cle) : 0;
            const variantesOption = analyse.achetables.filter(v => cleDe(v, dim) === val.cle);
            const surCommande = variantesOption.every(v => v.stock <= 0);
            // Option dont aucune variante n'a de prix : jamais d'état de stock
            const optionSansPrix = variantesOption.every(v => prixDe(product.price, v) <= 0);
            const libelle = libelles[i];
            const ariaLabel = incompatible
              ? t(language, `${libelle}, pas disponible avec ${choixActuelTexte(dim)}`, `${libelle}، غير متوفر مع ${choixActuelTexte(dim)}`)
              : undefined;
            const sousLigne = incompatible
              ? null
              : prixOption > 0
                ? <bdi dir="ltr">{formatPrice(prixOption)}</bdi>
                : optionSansPrix
                  ? (prixSurOptions ? PRIX_SUR_DEMANDE[language] : null)
                  : surCommande
                    ? t(language, 'Sur commande', 'متوفر عند الطلب')
                    : null;

            if (dim === 'model') {
              return (
                <button
                  key={val.cle || 'standard'}
                  type="button"
                  role="radio"
                  aria-checked={choisi}
                  aria-label={ariaLabel}
                  onClick={() => toucherOption(dim, val.cle)}
                  className={`${classesOption(choisi, incompatible)} flex flex-col overflow-hidden rounded-2xl text-start`}
                >
                  {val.exemple.image ? (
                    <img
                      src={val.exemple.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`w-full aspect-square object-cover bg-neutral-100 ${incompatible ? 'opacity-40' : ''}`}
                    />
                  ) : (
                    <span className="w-full aspect-square bg-neutral-100 grid place-items-center">
                      <Layers className="size-8 text-neutral-400" />
                    </span>
                  )}
                  <span className="p-2 text-base font-bold leading-snug line-clamp-2 min-h-[3.25rem]">{libelle}</span>
                  {sousLigne && <span className="px-2 pb-2 -mt-1 text-sm font-semibold text-neutral-600">{sousLigne}</span>}
                  {choisi && <Coche dedans />}
                </button>
              );
            }

            if (dim === 'size') {
              return (
                <button
                  key={val.cle || 'standard'}
                  type="button"
                  role="radio"
                  aria-checked={choisi}
                  aria-label={ariaLabel}
                  onClick={() => toucherOption(dim, val.cle)}
                  className={`${classesOption(choisi, incompatible)} min-h-12 px-1 py-1 flex flex-col items-center justify-center text-center`}
                >
                  <bdi dir="ltr" className="text-base font-bold leading-tight">{libelle}</bdi>
                  {sousLigne && <span className="text-sm font-semibold text-neutral-600 leading-tight">{sousLigne}</span>}
                  {choisi && <Coche />}
                </button>
              );
            }

            return (
              <button
                key={val.cle || 'standard'}
                type="button"
                role="radio"
                aria-checked={choisi}
                aria-label={ariaLabel}
                onClick={() => toucherOption(dim, val.cle)}
                className={`${classesOption(choisi, incompatible)} min-h-12 px-3 py-1.5 flex items-center gap-3 text-start`}
              >
                <span className={`flex shrink-0 ${incompatible ? 'opacity-40' : ''}`}>
                  <Pastille v={val.exemple} taille="md" />
                </span>
                <span className="min-w-0">
                  <span className="text-base font-semibold leading-tight line-clamp-2">{libelle}</span>
                  {sousLigne && <span className="block text-sm text-neutral-600">{sousLigne}</span>}
                </span>
                {choisi && <Coche />}
              </button>
            );
          })}
        </div>
        {avisSous(dim)}
      </div>
    );
  };

  const renderListeUnique = () => {
    const mots = aChoisir.map(d => motsDim(d, analyse.grammage).le);
    const idTitre = 'choix-liste';
    const avecCouleur = analyse.valeurs.color.length > 0;
    return (
      <div
        ref={el => {
          blocs.current.liste = el;
        }}
        role="radiogroup"
        aria-labelledby={idTitre}
        className={conteneurBloc('liste')}
      >
        <h2 id={idTitre} className={`mb-2 text-base font-bold ${surligne === 'liste' ? 'text-amber-800' : 'text-neutral-900'}`}>
          {t(language, `Choisissez ${enumerer(mots, 'fr')}`, `اختر ${enumerer(mots, 'ar')}`)}
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {variantesTriees.map(v => {
            const choisi = variante === v;
            const p = prixDe(product.price, v);
            return (
              <button
                key={identifiant(v)}
                type="button"
                role="radio"
                aria-checked={choisi}
                onClick={() => toucherLigne(v)}
                className={`${classesOption(choisi, false)} w-full min-h-14 px-3 py-2 flex items-center gap-3 text-start`}
              >
                {(v.image || avecCouleur) && <Pastille v={v} taille="md" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-bold leading-snug">{libelleVariante(v, analyse, language, aChoisir)}</span>
                  {v.stock <= 0 && p > 0 && <span className="block text-sm text-neutral-600">{t(language, 'Sur commande', 'متوفر عند الطلب')}</span>}
                </span>
                {prixDifferentsListe && (
                  <bdi dir={p > 0 ? 'ltr' : undefined} className={`shrink-0 font-black text-[#C8102E] ${p > 0 ? 'text-base' : 'text-sm'}`}>
                    {textePrix(p)}
                  </bdi>
                )}
                {choisi && <Coche />}
              </button>
            );
          })}
        </div>
        {avisSous('liste')}
      </div>
    );
  };

  // ── Ligne d'informations fixes : « Taille : 75cm · Couleur : Noir »
  const infosFixes = analyse.fixes.map(dim => {
    const v = analyse.valeurs[dim][0].exemple;
    const mots = motsDim(dim, analyse.grammage);
    return (
      <span key={dim} className="inline-flex items-center gap-1.5">
        <span>{language === 'ar' ? `${mots.nom.ar}:` : `${mots.nom.fr} :`}</span>
        {dim === 'color' && <Pastille v={v} taille="sm" photo={false} />}
        <bdi className="font-bold text-neutral-900">{libelleValeur(v, dim, language)}</bdi>
      </span>
    );
  });

  // ── Textes de la carte « Votre choix » et du bouton « Plusieurs »
  const texteIncomplet = analyse.listeUnique
    ? t(language, 'Touchez votre choix dans la liste ↑', 'اختر من القائمة ↑')
    : language === 'ar'
      ? `اختر ${enumerer(manquants.map(d => motsDim(d, analyse.grammage).un), 'ar')} ↑`
      : `Touchez ${enumerer(manquants.map(d => motsDim(d, analyse.grammage).un), 'fr')} ↑`;

  const libellePlusieurs = aChoisir.length === 1
    ? t(language, `Commander plusieurs ${motsDim(aChoisir[0], analyse.grammage).plusieurs.fr} en une fois`, `اطلب ${motsDim(aChoisir[0], analyse.grammage).plusieurs.ar} مرة واحدة`)
    : t(language, 'Commander plusieurs articles en une fois', 'اطلب عدة أصناف مرة واحدة');

  const titreListe = aChoisir.length === 1
    ? (() => {
        const d = aChoisir[0];
        const parDim: Record<DimVariante, Mots> = {
          model: { fr: 'Quantité par modèle', ar: 'الكمية لكل موديل' },
          size: analyse.grammage ? { fr: 'Quantité par grammage', ar: 'الكمية لكل وزن' } : { fr: 'Quantité par taille', ar: 'الكمية لكل مقاس' },
          color: { fr: 'Quantité par couleur', ar: 'الكمية لكل لون' },
        };
        return language === 'ar' ? parDim[d].ar : parDim[d].fr;
      })()
    : t(language, 'Quantité par article', 'الكمية لكل صنف');

  const aideAutre = analyse.listeUnique
    ? t(language, 'Un autre article ? Touchez-le dans la liste, puis « Ajouter au panier ».', 'صنف آخر؟ اختره من القائمة ثم اضغط «أضف للسلة».')
    : aChoisir.length > 0
      ? (() => {
          const mots = motsDim(aChoisir[aChoisir.length - 1], analyse.grammage).autre;
          return language === 'ar' ? `${mots.ar} ثم اضغط «أضف للسلة».` : `${mots.fr}, puis « Ajouter au panier ».`;
        })()
      : null;

  const etat = etatStock(stockAffiche);
  const totalSimple = complet ? quantite * prix.montant : 0;

  return (
    <div className="space-y-4">
      {/* ── 1. Prix et disponibilité ── */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-4 border-b border-neutral-100">
        <span className="flex items-baseline gap-2">
          {prix.aPartirDe && <span className="text-base font-semibold text-neutral-600">{translations.price_from[language]}</span>}
          <bdi dir={demandePrix ? undefined : 'ltr'} className={`font-black text-[#C8102E] ${demandePrix ? 'text-2xl' : 'text-3xl'}`}>
            {textePrix(prix.montant)}
          </bdi>
        </span>
        {promo && !demandePrix && (
          <span className="flex items-baseline gap-2">
            <bdi dir="ltr" className="text-lg font-semibold text-neutral-400 line-through">{formatPrice(product.comparePrice as number)}</bdi>
            <span dir="ltr" className="self-center bg-[#C8102E] text-white text-xs font-black px-2 py-0.5 rounded-full">
              -{getDiscountPercent(prix.montant, product.comparePrice as number)}%
            </span>
          </span>
        )}
        {/* Sans prix : pas d'état de stock, sauf la rupture (comme sur la carte) */}
        {(!demandePrix || enRupture) && (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
              enRupture ? 'text-rose-700' : etat === 'en_stock' ? 'text-emerald-700' : etat === 'limite' ? 'text-amber-700' : 'text-neutral-600'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${
                enRupture ? 'bg-rose-500' : etat === 'en_stock' ? 'bg-emerald-500' : etat === 'limite' ? 'bg-amber-500' : 'bg-neutral-400'
              }`}
            />
            {enRupture
              ? t(language, 'Rupture de stock', 'نفد المخزون')
              : etat === 'en_stock'
                ? t(language, 'En stock', 'متوفر')
                : etat === 'limite'
                  ? t(language, 'Stock limité', 'الكمية محدودة')
                  : t(language, 'Sur commande', 'متوفر عند الطلب')}
          </span>
        )}
        {/* Ce qu'on achète, puis le prix au mètre ou à la pièce s'il est sûr */}
        {unite && (
          <p className="basis-full text-base text-neutral-700">
            {texteUnite(unite, language)}
            {parUnite && (
              <>
                <span aria-hidden="true" className="text-neutral-400"> · </span>
                <span className="font-bold text-neutral-900">{textePrixUnitaire(parUnite, language, prix.aPartirDe)}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* ── 2. Informations fixes ── */}
      {infosFixes.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-neutral-700">
          {infosFixes.map((info, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span aria-hidden="true" className="text-neutral-400">·</span>}
              {info}
            </React.Fragment>
          ))}
        </p>
      )}

      {!modeListe ? (
        <>
          {/* ── 3. Choix ── */}
          {aChoisir.length > 0 && (
            <section id="choix" className="scroll-mt-40 space-y-4">
              {analyse.listeUnique ? renderListeUnique() : aChoisir.map(renderBloc)}
            </section>
          )}

          {/* ── 4. Votre choix ── */}
          {aChoisir.length > 0 &&
            (variante ? (
              <div aria-live="polite" className="rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-3 flex items-center gap-3">
                {(variante.image || analyse.valeurs.color.length > 0) && <Pastille v={variante} taille="lg" />}
                <div className="min-w-0">
                  <p className="text-sm text-neutral-500">{t(language, 'Votre choix', 'اختيارك')}</p>
                  <p className="text-lg font-bold text-neutral-900 leading-snug">{libelleVariante(variante, analyse, language)}</p>
                  <p className="text-base font-black text-[#C8102E]">
                    <bdi dir={demandePrix ? undefined : 'ltr'}>{textePrix(prix.montant)}</bdi>
                  </p>
                  {!demandePrix && etat === 'limite' && <p className="text-sm font-semibold text-amber-700">{t(language, 'Stock limité', 'الكمية محدودة')}</p>}
                  {!demandePrix && etat === 'sur_commande' && <p className="text-sm text-neutral-600">{t(language, 'Sur commande', 'متوفر عند الطلب')}</p>}
                </div>
              </div>
            ) : (
              <div
                aria-live="polite"
                className={`rounded-2xl border-2 p-3 ${relance ? 'border-amber-400 bg-amber-50' : 'border-dashed border-neutral-300 bg-white'}`}
              >
                <p className={`text-base font-bold ${relance ? 'text-amber-900' : 'text-neutral-700'}`}>{texteIncomplet}</p>
              </div>
            ))}

          {/* ── 5. Quantité (rien à compter tant que le prix est à demander) ── */}
          {!enRupture && !demandePrix && (
            <div className="pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-bold text-neutral-900">{t(language, 'Quantité', 'الكمية')}</span>
                <Compteur valeur={quantite} min={minQte} max={maxQte} onChange={changerQuantite} language={language} />
              </div>
              {avisMax !== null && avisMax === maxQte && (
                <p className="mt-1 text-end text-sm text-amber-700">
                  {t(language, `Maximum ${avisMax} pour cet article`, `الحد الأقصى ${avisMax} لهذا المنتج`)}
                </p>
              )}
            </div>
          )}

          {/* ── 6. Ajouter (ou demander le prix) ── */}
          <div className="space-y-2">
            {demandePrix ? (
              <a
                href={lienDemandePrix}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-14 px-4 rounded-2xl bg-[#C8102E] hover:bg-[#a00d25] active:bg-[#a00d25] shadow-lg shadow-[#C8102E]/20 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="size-5 shrink-0" />
                {t(language, 'Demander le prix sur WhatsApp', 'اسأل عن الثمن في واتساب')}
              </a>
            ) : enRupture ? (
              <button
                type="button"
                disabled
                className="w-full min-h-14 px-4 rounded-2xl bg-neutral-100 text-neutral-400 text-base font-bold flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <ShoppingCart className="size-5" />
                {t(language, 'Rupture de stock', 'نفد المخزون')}
              </button>
            ) : (
              <button
                type="button"
                onClick={ajouter}
                className={`w-full min-h-14 px-4 rounded-2xl text-white text-base font-bold flex items-center justify-center gap-2 transition-colors ${
                  ajoute ? 'bg-emerald-600' : 'bg-[#C8102E] hover:bg-[#a00d25] active:bg-[#a00d25] shadow-lg shadow-[#C8102E]/20'
                }`}
              >
                {ajoute ? <Check className="size-5" strokeWidth={3} /> : <ShoppingCart className="size-5" />}
                {ajoute ? (
                  t(language, 'Ajouté au panier', 'تمت الإضافة إلى السلة')
                ) : (
                  <span>
                    {t(language, 'Ajouter au panier', 'أضف للسلة')}
                    {totalSimple > 0 && (
                      <>
                        {' · '}
                        <bdi dir="ltr">{formatPrice(totalSimple)}</bdi>
                      </>
                    )}
                  </span>
                )}
              </button>
            )}

            {ligneActuelle && !ajoute && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check className="size-4 shrink-0" strokeWidth={3} />
                <span>
                  {t(language, 'Déjà dans votre panier : ', 'في سلتك: ')}
                  <bdi dir="ltr">× {ligneActuelle.quantity}</bdi>
                </span>
              </p>
            )}

            {/* ── 7. WhatsApp (déjà le bouton principal quand le prix est à demander) ── */}
            {!demandePrix && (
              <a
                href={getWhatsAppContact(messageWhatsApp)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-2xl border-2 border-[#25D366] bg-white text-[#128C7E] text-base font-bold flex items-center justify-center gap-2"
              >
                <MessageCircle className="size-5" />
                {t(language, 'Commander sur WhatsApp', 'اطلب عبر واتساب')}
              </a>
            )}

            {/* ── 8. Plusieurs (la liste remplit le panier : pas pour un produit sans prix) ── */}
            {aChoisir.length > 0 && analyse.achetables.length >= 3 && !produitSansPrix && (
              <button
                type="button"
                onClick={ouvrirListe}
                className="w-full min-h-12 px-3 rounded-2xl border-2 border-neutral-300 bg-white text-base font-bold text-neutral-800 flex items-center justify-center gap-2"
              >
                <ListPlus className="size-5 shrink-0" />
                {libellePlusieurs}
              </button>
            )}
          </div>
        </>
      ) : (
        /* ── Liste de quantités (ateliers) ── */
        <div ref={hautListe} className="scroll-mt-40">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-neutral-900">{titreListe}</h3>
            <button
              type="button"
              onClick={() => setModeListe(false)}
              className="min-h-11 px-2 text-sm font-semibold text-neutral-700 underline underline-offset-4"
            >
              {t(language, 'Revenir au choix simple', 'الرجوع للاختيار العادي')}
            </button>
          </div>
          <p className="mb-3 text-sm text-neutral-600">
            {t(language, 'Indiquez la quantité voulue sur chaque ligne, puis ajoutez tout en une fois.', 'اكتب الكمية في كل سطر، ثم أضف الكل مرة واحدة.')}
          </p>

          <ul className="rounded-2xl border border-neutral-200 divide-y divide-neutral-100">
            {variantesTriees.map(v => {
              const q = qtesListe[identifiant(v)] || 0;
              const p = prixDe(product.price, v);
              return (
                <li key={identifiant(v)} className={`flex min-h-16 items-center gap-3 px-3 py-2 ${q > 0 ? 'bg-red-50' : ''}`}>
                  {(v.image || analyse.valeurs.color.length > 0) && <Pastille v={v} taille="md" />}
                  <span className="flex-1 min-w-0">
                    <span className={`text-base leading-snug line-clamp-2 ${q > 0 ? 'font-bold' : 'font-semibold'}`}>
                      {libelleVariante(v, analyse, language, aChoisir)}
                    </span>
                    {p <= 0 ? (
                      <span className="block text-sm font-semibold text-[#C8102E]">{PRIX_SUR_DEMANDE[language]}</span>
                    ) : prixDifferentsListe ? (
                      <span className="block text-sm text-neutral-600"><bdi dir="ltr">{formatPrice(p)}</bdi></span>
                    ) : v.stock <= 0 ? (
                      <span className="block text-sm text-neutral-600">{t(language, 'Sur commande', 'متوفر عند الطلب')}</span>
                    ) : null}
                  </span>
                  {/* Sans prix : pas de compteur, cette ligne ne va pas au panier */}
                  {p > 0 && (
                    <Compteur
                      valeur={q}
                      min={0}
                      max={v.stock > 0 ? v.stock : QTE_MAX_SANS_STOCK}
                      onChange={valeur => {
                        setQtesListe(prev => ({ ...prev, [identifiant(v)]: valeur }));
                        setAlerteListe(false);
                      }}
                      language={language}
                      petit
                      nom={libelleVariante(v, analyse, language, aChoisir)}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] lg:bottom-4 z-30 mt-3 bg-white/95 backdrop-blur py-2">
            {alerteListe && (
              <p role="alert" className="mb-2 text-sm font-semibold text-[#C8102E]">
                {t(language, 'Indiquez au moins une quantité', 'اكتب الكمية في سطر واحد على الأقل')}
              </p>
            )}
            <button
              type="button"
              onClick={ajouterListe}
              className={`w-full min-h-14 px-4 rounded-2xl text-white flex flex-col items-center justify-center leading-tight transition-colors ${
                ajoutesListe !== null ? 'bg-emerald-600' : 'bg-[#C8102E] hover:bg-[#a00d25] shadow-lg shadow-[#C8102E]/20'
              }`}
            >
              <span className="text-base font-bold">
                {ajoutesListe !== null
                  ? t(language, `${ajoutesListe} article${ajoutesListe > 1 ? 's' : ''} ajouté${ajoutesListe > 1 ? 's' : ''} au panier`, 'تمت الإضافة إلى السلة')
                  : totalListe > 0
                    ? t(language, `Ajouter ${totalListe} article${totalListe > 1 ? 's' : ''} au panier`, `أضف للسلة — العدد: ${totalListe}`)
                    : t(language, 'Ajouter au panier', 'أضف للسلة')}
              </span>
              {ajoutesListe === null && totalListe > 0 && (
                <span className="text-sm text-white/85">
                  {t(language, 'Total : ', 'المجموع: ')}
                  <bdi dir="ltr">{formatPrice(montantListe)}</bdi>
                </span>
              )}
            </button>
          </div>

          <a
            href={getWhatsAppContact(messageWhatsApp)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full h-12 rounded-2xl border-2 border-[#25D366] bg-white text-[#128C7E] text-base font-bold flex items-center justify-center gap-2"
          >
            <MessageCircle className="size-5" />
            {t(language, 'Envoyer cette liste sur WhatsApp', 'أرسل هذه القائمة عبر واتساب')}
          </a>
        </div>
      )}

      {/* ── 9. Dans votre panier ── */}
      {dansPanier.length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-base font-bold text-emerald-800">{t(language, 'Dans votre panier', 'في سلتك')}</p>
          {dansPanier.map(item => (
            <div key={item.variant?.variantId || item.productId} className="flex items-center gap-2 text-base text-neutral-900">
              {item.variant?.colorHex ? (
                <span
                  aria-hidden="true"
                  className={`size-6 shrink-0 rounded-full ring-1 ring-inset ${estCouleurClaire(item.variant.colorHex) ? 'ring-black/40' : 'ring-black/15'}`}
                  style={{ backgroundColor: item.variant.colorHex }}
                />
              ) : item.productImage ? (
                <img src={item.productImage} alt="" className="size-6 shrink-0 rounded-md object-cover" />
              ) : null}
              <span className="min-w-0 truncate">{libellePanier(item)}</span>
              <bdi dir="ltr" className="ms-auto shrink-0 font-bold tabular-nums">× {item.quantity}</bdi>
            </div>
          ))}
          <button
            type="button"
            onClick={openCart}
            className="w-full h-12 rounded-xl bg-neutral-900 text-white text-base font-bold"
          >
            {t(language, 'Voir mon panier et commander', 'عرض السلة وإتمام الطلب')}
          </button>
          {aideAutre && !modeListe && <p className="text-sm text-neutral-600">{aideAutre}</p>}
        </div>
      )}
    </div>
  );
}
