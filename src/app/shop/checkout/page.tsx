"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  ShoppingBag,
  Truck,
  User,
  MapPin,
  Phone,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Package,
  ShieldCheck,
  Store,
  Banknote,
  Landmark,
  CreditCard,
  Info,
  MessageCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, doc, getDocFromServer, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";

import {
  useShopCart,
  getCartItemUnitPrice,
  getCartItemVariantKey,
  groupCartItemsByProduct,
  summarizeCartProduct,
} from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import { useShopProducts } from "@/contexts/shop-products-context";
import {
  formatPrice,
  generateOrderNumber,
  getWhatsAppContact,
} from "@/lib/shop-utils";
import { premierTexte } from "@/lib/shop-textes";
import { libelleLignePanier } from "@/lib/shop-variantes";
import type { Language } from "@/lib/translations";
import { erreurTelephone, normaliserTelephoneMaroc, telephoneMarocLisible } from "@/lib/telephone-maroc";
import {
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  memeEnvoi,
  messagePrixAConfirmer,
  messageWhatsAppCommande,
  signatureCommande,
  suiteRenvoi,
  type BrouillonCommande,
  type LigneMessage,
} from "@/lib/brouillon-commande";
import { CHOIX_CONNU_PAR, connuParValide, lireProvenanceStockee, provenanceCommande } from "@/lib/provenance-boutique";
import {
  FRAIS_ZONE,
  TEXTE_TRANSPORT_VOLUMINEUX,
  TEXTE_TRANSPORT_VOLUMINEUX_AR,
  commandeVolumineuse,
  delaiColis,
  estCasablanca,
  estPeripherieCasablanca,
  fraisLivraison,
  libelleFrais,
  lieuRetraitPour,
  modesPossibles,
  nomVille,
  optionsVilles,
  VILLES_FORMULAIRE,
} from "@/lib/livraison-boutique";
import {
  coordonneesAGarder,
  ecrireCoordonnees,
  effacerCoordonnees,
  lireCoordonnees,
  memeClient,
  modeRepris,
  nomPourSaluer,
  type CoordonneesClient,
} from "@/lib/coordonnees-client";
import { PLAFOND_ESPECES_COLIS } from "@/lib/commandes-boutique";
import { useReglagesReception } from "@/lib/use-reglages-reception";
import type { ReglagesReception } from "@/lib/reglages-reception";
import type {
  CartItem,
  ConnuPar,
  LieuRetrait,
  ModeReception,
  MoyenPaiement,
  ReceptionCommande,
  ShippingAddress,
  ShopProduct,
} from "@/lib/shop-types";

// ─── Firebase init ────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Valeur de la liste des villes quand le client écrit lui-même sa ville.
const AUTRE_VILLE = "__autre__";

/** Sans réponse du serveur au bout de ce temps, on dit au client que le réseau est lent. */
const DELAI_ENVOI_MS = 15_000;
/** Vérifier qu'une commande est arrivée : au-delà, on ne peut pas le savoir. */
const DELAI_VERIFICATION_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────
// Un type (pas une interface) : le formulaire se range tel quel dans le brouillon.
type FormData = {
  /** Nom complet, en un seul champ (enregistré dans customerName et shippingAddress.fullName). */
  fullName: string;
  phone: string;
  phone2: string;
  email: string;
  /** Ville de la liste, ou AUTRE_VILLE. */
  city: string;
  /** Ville écrite à la main quand elle n'est pas dans la liste. */
  villeAutre: string;
  /** Vide tant que le client n'a pas choisi (une commande volumineuse n'a pas de choix par défaut). */
  mode: ModeReception | "";
  paiement: MoyenPaiement;
  address: string;
  region: string;
  postalCode: string;
  notes: string;
  /** Réponse facultative à « Comment avez-vous connu LEBTEX ? ». */
  connuPar: ConnuPar | "";
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const FORM_VIDE: FormData = {
  fullName: "",
  phone: "",
  phone2: "",
  email: "",
  city: "",
  villeAutre: "",
  mode: "",
  paiement: "cod",
  address: "",
  region: "",
  postalCode: "",
  notes: "",
  connuPar: "",
};

/** Le formulaire repris du brouillon : des textes bornés, et seulement des choix permis. */
function formDepuisBrouillon(champs: Record<string, string>): FormData {
  const t = (cle: keyof FormData, max = 300) => (typeof champs[cle] === "string" ? champs[cle].slice(0, max) : "");
  const city = t("city", 80);
  const mode = t("mode");
  const paiement = t("paiement");
  return {
    fullName: t("fullName", 120),
    phone: t("phone", 30),
    phone2: t("phone2", 30),
    email: t("email", 200),
    city: city === AUTRE_VILLE || VILLES_FORMULAIRE.includes(city) ? city : "",
    villeAutre: t("villeAutre", 60),
    mode: mode === "domicile" || mode === "retrait" || mode === "transport" ? mode : "",
    paiement: paiement === "virement" || paiement === "carte" ? paiement : "cod",
    address: t("address", 300),
    region: t("region", 120),
    postalCode: t("postalCode", 10),
    notes: t("notes", 1000),
    connuPar: connuParValide(t("connuPar")) ?? "",
  };
}

/** Des champs du bloc « facultatif » sont remplis : on l'ouvre, le client voit ce qu'il a tapé. */
function facultatifsRemplis(f: FormData): boolean {
  return !!(f.phone2.trim() || f.email.trim() || f.notes.trim() || f.region.trim() || f.postalCode.trim());
}

type PreferenceTransport = NonNullable<ReceptionCommande["preferenceTransport"]>;

/** Tout ce que la ville, le panier et le mode choisi décident, calculé une fois. */
interface ChoixReception {
  ville: string;
  volumineux: boolean;
  /** Modes proposés (le retrait disparaît si son magasin est fermé dans les réglages). */
  modes: ModeReception[];
  /** Mode retenu, ou null tant qu'il faut choisir. */
  mode: ModeReception | null;
  lieuRetrait: LieuRetrait;
  preferenceTransport: PreferenceTransport;
  /** Frais du mode retenu : null = transport à confirmer par téléphone. */
  frais: number | null;
  /** Faux tant que le mode ou (pour un colis) la ville manque : on n'affiche pas un prix au hasard. */
  fraisConnus: boolean;
  adresseRequise: boolean;
}

function villeSaisie(form: Pick<FormData, "city" | "villeAutre">): string {
  return form.city === AUTRE_VILLE ? form.villeAutre.trim() : form.city;
}

// Rouleau livré à Casablanca ou en périphérie : notre camionnette. Ailleurs : un
// transporteur habituel de Derb Omar, jusqu'à son dépôt dans la ville du client.
function transportPour(ville: string): PreferenceTransport {
  return estCasablanca(ville) || estPeripherieCasablanca(ville) ? "camionnette" : "transporteur";
}

function calculerChoix(
  form: FormData,
  volumineux: boolean,
  reglages: ReglagesReception,
  /** Mode de la dernière commande gardé sur ce téléphone (petits articles seulement), ou "". */
  modeGarde: ModeReception | "" = ""
): ChoixReception {
  const ville = villeSaisie(form);
  const lieuRetrait = lieuRetraitPour(volumineux);
  const modes = modesPossibles(volumineux).filter(
    (m) => m !== "retrait" || reglages.lieux[lieuRetrait].actif
  );
  // Petits articles : « à domicile » coché d'office, comme avant (ou le mode de sa dernière
  // commande de petits articles). Volumineux : le client choisit lui-même entre retrait et
  // transport, les deux ne demandent pas la même chose ; rien n'est jamais coché d'office.
  const modeOffice = modeGarde && modes.includes(modeGarde) ? modeGarde : modes[0];
  const mode: ModeReception | null = modes.includes(form.mode as ModeReception)
    ? (form.mode as ModeReception)
    : !volumineux && modes.length > 0
      ? modeOffice
      : null;
  const preferenceTransport = transportPour(ville);
  const frais = mode ? fraisLivraison({ mode, ville }) : null;
  return {
    ville,
    volumineux,
    modes,
    mode,
    lieuRetrait,
    preferenceTransport,
    frais,
    fraisConnus: mode !== null && (mode !== "domicile" || !!ville),
    // Le transporteur livre à son dépôt, le client y récupère : pas besoin de son adresse.
    adresseRequise: mode === "domicile" || (mode === "transport" && preferenceTransport === "camionnette"),
  };
}

/**
 * Frais tels que le client les lit : « 35 MAD », « Gratuit » (retrait), « À confirmer par téléphone ».
 * Même unité que les prix du site (formatPrice) : jamais « 35 DH » à côté de « 685 MAD ».
 */
function prixFrais(frais: number | null, language: Language): string {
  return frais === null || !Number.isFinite(frais) || frais < 0
    ? libelleFrais(null, language)
    : frais === 0 ? libelleFrais(0, language) : formatPrice(frais);
}

/** Nom arabe d'une ligne du panier : celui copié à l'ajout, sinon celui du catalogue ('' s'il n'y en a pas). */
function nomArabe(item: CartItem, produit: ShopProduct | undefined): string {
  return premierTexte("ar", { ar: item.productNameAr }, { ar: produit?.nameAr });
}

/** Libellé de l'option « espèces », dit dans les mots du mode choisi. */
function libelleEspeces(choix: ChoixReception, language: Language): { titre: string; texte: string } {
  const ar = language === "ar";
  const rien = ar ? "لا تدفع شيئاً الآن." : "Rien à payer maintenant.";
  if (choix.mode === "retrait") {
    return ar
      ? { titre: "نقداً عند الاستلام من المحل", texte: `تدفع في المحل عند استلام طلبك. ${rien}` }
      : { titre: "Espèces au retrait", texte: `Vous payez au magasin, au moment du retrait. ${rien}` };
  }
  if (choix.mode === "transport") {
    if (choix.preferenceTransport === "camionnette") {
      return ar
        ? { titre: "نقداً عند التوصيل", texte: `تدفع لسائق LEBTEX عند التوصيل. ${rien}` }
        : { titre: "Espèces à la livraison", texte: `Vous payez notre chauffeur LEBTEX à la livraison. ${rien}` };
    }
    return ar
      ? { titre: "نقداً عند الاستلام", texte: `نتفق معك عبر الهاتف على وقت الدفع. ${rien}` }
      : { titre: "Espèces à la réception", texte: `Nous convenons avec vous, au téléphone, du moment du paiement. ${rien}` };
  }
  if (choix.mode === "domicile") {
    return ar
      ? { titre: "نقداً عند التوصيل", texte: `تدفع لعامل التوصيل عند الاستلام. ${rien}` }
      : { titre: "Espèces à la livraison", texte: `Vous payez le livreur à la réception. ${rien}` };
  }
  return { titre: ar ? "نقداً عند التوصيل أو الاستلام" : "Espèces à la livraison ou au retrait", texte: rien };
}

// ─── Progress Steps ───────────────────────────────────────────────────────────
function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const steps = [
    { label: ar ? "السلة" : "Panier", num: 1 },
    { label: ar ? "التوصيل" : "Livraison", num: 2 },
    { label: ar ? "التأكيد" : "Confirmation", num: 3 },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, idx) => (
        <React.Fragment key={s.num}>
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s.num < step
                  ? "bg-green-500 text-white"
                  : s.num === step
                  ? "bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/30"
                  : "bg-[#E8E4DF] text-[#6B6B6B]"
              }`}
            >
              {s.num < step ? <CheckCircle2 className="w-4 h-4" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                s.num === step ? "text-[#C8102E]" : "text-[#6B6B6B]"
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 mx-2 transition-colors ${
                s.num < step ? "bg-green-400" : "bg-[#E8E4DF]"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-[#C8102E]/10 border border-[#C8102E]/20 flex items-center justify-center text-[#C8102E] flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="font-bold text-[#0F0F0F] shop-font-display">{title}</h2>
        {subtitle && <p className="text-xs text-[#6B6B6B] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Input Field ─────────────────────────────────────────────────────────────
interface InputFieldProps {
  label: string;
  /** id du champ : le libellé lui est rattaché, le message d'erreur aussi (`${id}-erreur`). */
  id?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}
function InputField({ label, id, required, error, children }: InputFieldProps) {
  const { language } = useLanguage();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[#0F0F0F] mb-1.5">
        {label}
        {required && <span className="text-[#C8102E] ms-1">*</span>}
        {!required && <span className="text-[#6B6B6B] text-xs ms-1.5">{language === "ar" ? "(اختياري)" : "(optionnel)"}</span>}
      </label>
      {children}
      {error && (
        <p id={id ? `${id}-erreur` : undefined} className="text-xs text-red-500 mt-1 flex items-start gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Attributs d'accessibilité d'un champ qui peut être en erreur. */
const aria = (id: string, error?: string) =>
  error ? { "aria-invalid": true, "aria-describedby": `${id}-erreur` } : {};

// 16 px dans les champs : en dessous, le téléphone zoome sur le formulaire.
const inputCls = (error?: string) =>
  `w-full px-4 py-3 text-base border rounded-xl bg-[#FBF8F3] text-[#0F0F0F] placeholder:text-[#6B6B6B]/50 focus:outline-none focus:ring-2 transition-all ${
    error
      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
      : "border-[#E8E4DF] focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40"
  }`;

// ─── Carte à choix (mode de réception, paiement) ─────────────────────────────
function OptionCarte({
  name,
  checked,
  onSelect,
  icone,
  titre,
  prix,
  prixGratuit,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  icone: React.ReactNode;
  titre: string;
  prix?: React.ReactNode;
  /** « Gratuit » en vert : le retrait au magasin, le seul mode sans frais. */
  prixGratuit?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
        checked
          ? "border-[#C8102E] bg-[#C8102E]/[0.04]"
          : "border-[#E8E4DF] bg-white hover:border-[#C8102E]/40"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 w-5 h-5 flex-shrink-0 accent-[#C8102E]"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-bold text-[#0F0F0F] text-sm sm:text-base flex items-center gap-2">
            <span className="text-[#C8102E] flex-shrink-0">{icone}</span>
            {titre}
          </span>
          {prix && (
            <span className={`text-sm font-bold tabular-nums ${prixGratuit ? "text-green-700" : "text-[#0F0F0F]"}`}>
              {prix}
            </span>
          )}
        </div>
        {children && <div className="mt-1 text-sm text-[#4A4A4A] leading-relaxed space-y-1">{children}</div>}
      </div>
    </label>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(form: FormData, choix: ChoixReception, language: Language): FormErrors {
  const ar = language === "ar";
  const errors: FormErrors = {};
  if (!form.fullName.trim()) errors.fullName = ar ? "الاسم الكامل مطلوب" : "Le nom complet est requis";
  const erreurTel = erreurTelephone(form.phone, language);
  if (erreurTel) errors.phone = erreurTel;
  // Le 2e numéro est facultatif, mais s'il est écrit, il doit pouvoir servir.
  const erreurTel2 = erreurTelephone(form.phone2, language, false);
  if (erreurTel2) errors.phone2 = erreurTel2;
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = ar ? "بريد إلكتروني غير صحيح" : "Adresse email invalide";
  }
  // Retrait au magasin : la ville ne change ni les frais ni le lieu, elle devient facultative.
  if (!form.city && choix.mode !== "retrait") errors.city = ar ? "المدينة مطلوبة" : "La ville est requise";
  else if (form.city === AUTRE_VILLE && !form.villeAutre.trim()) errors.villeAutre = ar ? "اكتب اسم مدينتك" : "Écrivez le nom de votre ville";
  if (!choix.mode) errors.mode = ar ? "اختر طريقة استلام طلبك" : "Choisissez comment recevoir votre commande";
  if (choix.adresseRequise && !form.address.trim()) errors.address = ar ? "العنوان مطلوب للتوصيل" : "L'adresse est requise pour la livraison";
  return errors;
}

// ─── Totaux (récapitulatif, et résumé au-dessus du bouton sur téléphone) ──────
// Plan §3.4 : le prix se voit avant la commande, jamais après. Sur téléphone, le
// récapitulatif vient après le bouton : le même bloc est répété juste au-dessus.

interface Totaux {
  titreLigne: string;
  valeurLigne: string;
  total: number;
  legendeTotal: string;
}

function calculerTotaux(choix: ChoixReception, subtotal: number, paiement: MoyenPaiement, language: Language): Totaux {
  const { ville, mode, frais, fraisConnus, volumineux } = choix;
  const ar = language === "ar";
  const selonVille = ar ? "حسب المدينة" : "Selon la ville";
  const titreLigne =
    mode === "retrait"
      ? ar ? "الاستلام" : "Retrait"
      : mode === "transport"
        ? ar ? "النقل" : "Transport"
        : `${ar ? "التوصيل" : "Livraison"}${ville ? ` — ${nomVille(ville, language)}` : ""}`;
  const valeurLigne = !mode
    ? volumineux ? (ar ? "حسب الطريقة المختارة" : "Selon le mode choisi") : selonVille
    : mode === "retrait"
      ? libelleFrais(0, language)
      : !fraisConnus
        ? selonVille
        : prixFrais(frais, language);
  const legendeTotal = ar
    ? mode === "transport"
      ? "+ ثمن النقل يُحدَّد عبر الهاتف"
      : !fraisConnus
        ? volumineux ? "+ حسب الطريقة المختارة" : "+ التوصيل حسب المدينة"
        : paiement === "virement"
          ? "بالتحويل البنكي"
          : paiement === "carte"
            ? "بالبطاقة البنكية"
            : mode === "retrait" ? "الدفع عند الاستلام من المحل" : "الدفع عند الاستلام"
    : mode === "transport"
      ? "+ transport à confirmer par téléphone"
      : !fraisConnus
        ? volumineux ? "+ selon le mode choisi" : "+ livraison selon la ville"
        : paiement === "virement"
          ? "Par virement bancaire"
          : paiement === "carte"
            ? "Par carte bancaire"
            : mode === "retrait" ? "Payé au retrait" : "Payé à la réception";
  return {
    titreLigne,
    valeurLigne,
    total: subtotal + (fraisConnus && frais !== null ? frais : 0),
    legendeTotal,
  };
}

/** Un montant, ou « À confirmer » quand il vaut 0 : les mêmes mots que les lignes sans prix. */
function montantOuAConfirmer(montant: number, ar: boolean): string {
  return montant > 0 ? formatPrice(montant) : ar ? "قيد التأكيد" : "À confirmer";
}

/** Sous-total, frais et total : le client les voit juste avant « Confirmer ma commande ». */
function ResumeAvantValidation({ subtotal, choix, paiement }: { subtotal: number; choix: ChoixReception; paiement: MoyenPaiement }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const t = calculerTotaux(choix, subtotal, paiement, language);
  return (
    <div className="lg:hidden mb-5 rounded-2xl border border-[#E8E4DF] bg-[#FBF8F3] px-4 py-3 space-y-2" aria-label={ar ? "ملخص الطلب" : "Résumé de la commande"}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[#6B6B6B]">{ar ? "المجموع الفرعي" : "Sous-total"}</span>
        <span className="font-semibold text-[#0F0F0F] tabular-nums">{montantOuAConfirmer(subtotal, ar)}</span>
      </div>
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="text-[#6B6B6B]">{t.titreLigne}</span>
        <span className={`font-semibold text-end ${choix.mode === "retrait" ? "text-green-700" : "text-[#0F0F0F]"}`}>{t.valeurLigne}</span>
      </div>
      <div className="border-t border-[#E8E4DF] pt-2 flex items-start justify-between gap-3">
        <span className="font-bold text-[#0F0F0F]">{ar ? "المجموع" : "Total"}</span>
        <div className="text-end">
          <span className="font-bold text-[#C8102E] text-lg tabular-nums">{montantOuAConfirmer(subtotal > 0 ? t.total : 0, ar)}</span>
          <p className="text-xs text-[#6B6B6B]">{t.legendeTotal}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Order Summary sidebar ────────────────────────────────────────────────────
interface SummaryPanelProps {
  items: ReturnType<typeof useShopCart>["items"];
  subtotal: number;
  productQtyMap: Record<string, number>;
  choix: ChoixReception;
  paiement: MoyenPaiement;
}
function SummaryPanel({ items, subtotal, productQtyMap, choix, paiement }: SummaryPanelProps) {
  const { language } = useLanguage();
  const { getProductById } = useShopProducts();
  const ar = language === "ar";
  const { ville, mode, frais, fraisConnus } = choix;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const hasUnpricedItems = items.some((item) => getCartItemUnitPrice(item, productQtyMap?.[item.productId] || item.quantity) <= 0);
  const { titreLigne, valeurLigne, total, legendeTotal } = calculerTotaux(choix, subtotal, paiement, language);

  const rassurance = ar
    ? paiement === "carte"
      ? "الدفع بالبطاقة آمن."
      : paiement === "virement"
        ? "لا تدفع شيئاً الآن: يظهر رقم حسابنا البنكي (RIB) بعد الطلب."
        : "لا تدفع شيئاً الآن: تدفع عند استلام طلبك."
    : paiement === "carte"
      ? "Paiement par carte sécurisé."
      : paiement === "virement"
        ? "Rien à payer maintenant : notre RIB s'affiche après la commande."
        : "Rien à payer maintenant : vous payez à la réception de votre commande.";

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#0F0F0F] to-[#1a1a1a]">
        <h2 className="text-white font-bold shop-font-display flex items-center gap-2">
          <Package className="w-4 h-4 text-[#D4A843]" />
          {ar ? "طلبك" : "Votre commande"}
        </h2>
        <p className="text-gray-400 text-xs mt-0.5">
          {ar ? `عدد القطع: ${itemCount}` : `${itemCount} article${itemCount > 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Items — un bloc par produit, ses variantes résumées en dessous */}
      <div className="divide-y divide-[#E8E4DF] max-h-72 overflow-y-auto shop-scrollbar">
        {groupCartItemsByProduct(items).map(({ productId, items: productItems }) => {
          const first = productItems[0];
          const productTotalQty = productQtyMap?.[productId] || first.quantity;
          const { total: productTotal } = summarizeCartProduct(productItems, productTotalQty);
          const prixAConfirmer = productItems.some((item) => getCartItemUnitPrice(item, productTotalQty) <= 0);
          const variantsSummary = productItems
            .filter((item) => item.variant)
            .map((item) => {
              const label = libelleLignePanier(item.variant, language);
              return `${label || (ar ? "قياسي" : "Standard")} ×${item.quantity}`;
            })
            .join(ar ? "، " : ", ");
          const nom = (ar && nomArabe(first, getProductById(productId))) || first.productName;

          return (
            <div key={productId} className="flex gap-3 px-5 py-3">
              {/* Thumb */}
              <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]">
                {first.productImage ? (
                  <Image
                    src={first.productImage}
                    alt={nom}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-[#D4A843]/40" />
                  </div>
                )}
                {/* Qty badge */}
                <span className="absolute -top-1.5 -end-1.5 h-5 min-w-[1.25rem] bg-[#C8102E] text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {productTotalQty}
                </span>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#0F0F0F] truncate">{nom}</p>
                {variantsSummary && (
                  <p className="text-xs text-[#6B6B6B] mt-0.5 line-clamp-2" title={variantsSummary}>
                    {variantsSummary}
                  </p>
                )}
                {first.volumineux && (
                  <p className="text-xs font-semibold text-amber-700 mt-0.5">{ar ? "منتج كبير الحجم" : "Article volumineux"}</p>
                )}
                {prixAConfirmer && productTotal > 0 && (
                  <p className="text-xs font-semibold text-amber-700 mt-0.5">{ar ? "جزء منه: السعر قيد التأكيد" : "En partie : prix à confirmer"}</p>
                )}
              </div>
              <span className="text-xs font-bold text-[#0F0F0F] flex-shrink-0 tabular-nums">
                {productTotal > 0
                  ? formatPrice(productTotal)
                  : <span className="font-semibold text-amber-700">{ar ? "السعر قيد التأكيد" : "Prix à confirmer"}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="px-5 py-4 border-t border-[#E8E4DF] space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6B6B6B]">{ar ? "المجموع الفرعي" : "Sous-total"}</span>
          <span className="font-semibold text-[#0F0F0F] tabular-nums">{montantOuAConfirmer(subtotal, ar)}</span>
        </div>
        {subtotal > 0 && hasUnpricedItems && (
          <p className="text-xs text-[#6B6B6B] -mt-1.5">
            {ar ? 'لا يشمل المنتجات التي سعرها قيد التأكيد' : 'Hors articles au prix à confirmer'}
          </p>
        )}
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-[#6B6B6B] flex items-center gap-1.5">
            {mode === "retrait" ? <Store className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
            {titreLigne}
          </span>
          <span
            className={`font-semibold text-end ${
              mode === "retrait" ? "text-green-700" : fraisConnus && frais !== null ? "text-[#0F0F0F] tabular-nums" : "text-xs text-[#6B6B6B]"
            }`}
          >
            {valeurLigne}
          </span>
        </div>
        {mode === "domicile" && ville && (
          <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
            <span className="flex items-center gap-1.5">
              <Truck className="w-3 h-3" />
              {ar ? "المدة المتوقعة" : "Délai estimé"}
            </span>
            <span className="font-medium text-[#0F0F0F]">{delaiColis(ville, language)}</span>
          </div>
        )}
        <div className="border-t border-[#E8E4DF] pt-2.5 flex items-center justify-between">
          <span className="font-bold text-[#0F0F0F]">{ar ? "المجموع" : "Total"}</span>
          <div className="text-end">
            <span className="font-bold text-[#C8102E] text-xl shop-font-display tabular-nums">
              {montantOuAConfirmer(subtotal > 0 ? total : 0, ar)}
            </span>
            <p className="text-xs text-[#6B6B6B]">{legendeTotal}</p>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 bg-[#FBF8F3] border border-[#E8E4DF] rounded-xl px-3 py-2">
          <Shield className="w-4 h-4 text-[#D4A843] flex-shrink-0" />
          <p className="text-xs text-[#6B6B6B] leading-tight">{rassurance}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Envoi de la commande : réseau lent, sans doublon ─────────────────────────
// L'identifiant de la commande est choisi une fois (gardé dans le brouillon) et la
// commande s'écrit avec setDoc : renvoyée, elle vise le même document. La règle
// Firestore n'autorise que la création ; réécrire une commande qui existe est
// refusé, signe qu'un envoi précédent est passé : on le vérifie sur le serveur
// (getDocFromServer ; lire une commande par son identifiant est ouvert à tous).

type EtatEnvoi = "repos" | "envoi" | "lent" | "erreur";

/** Une écriture partie. Le SDK Firestore la garde et la réessaie seul tant que la page reste ouverte. */
interface EnvoiCommande {
  id: string;
  numero: string;
  telephone: string;
  promesse: Promise<void>;
  fini: "non" | "ok" | "refus";
  erreur?: unknown;
}

const DELAI_PASSE: unique symbol = Symbol("delai");

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T | typeof DELAI_PASSE> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<typeof DELAI_PASSE>((resoudre) => {
    minuteur = setTimeout(() => resoudre(DELAI_PASSE), ms);
  });
  return Promise.race([p, delai]).finally(() => clearTimeout(minuteur));
}

/** La commande est-elle arrivée chez nous ? null : impossible de le savoir (pas de connexion). */
async function commandeExiste(id: string): Promise<boolean | null> {
  try {
    const snap = await avecDelai(getDocFromServer(doc(db, "shop_orders", id)), DELAI_VERIFICATION_MS);
    if (snap === DELAI_PASSE || snap.metadata.hasPendingWrites) return null;
    return snap.exists();
  } catch {
    return null;
  }
}

/** Code d'une erreur Firebase (« permission-denied »…) : montré en petit, jamais comme message. */
function codeErreurDe(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code.slice(0, 60) : "inconnue";
}

interface DonneesCommande {
  form: FormData;
  choix: ChoixReception;
  mode: ModeReception;
  paiement: MoyenPaiement;
  items: CartItem[];
  productQtyMap: Record<string, number>;
  subtotal: number;
  language: Language;
  getProductById: (id: string) => ShopProduct | undefined;
}

/** Ce qui part dans shop_orders, sans le n° ni les horodatages. */
function contenuCommande(d: DonneesCommande) {
  const { form, choix, mode } = d;
  // Validés avant : enregistrés au format 0XXXXXXXXX, que lisent l'admin, le suivi et le transporteur.
  const telephone = normaliserTelephoneMaroc(form.phone) ?? form.phone.trim();
  const telephone2 = form.phone2.trim() ? normaliserTelephoneMaroc(form.phone2) ?? form.phone2.trim() : "";
  const nom = form.fullName.trim().replace(/\s+/g, " ");
  // Transport d'un rouleau : prix donné au téléphone, la commande part à 0 et
  // l'équipe l'ajoute après l'accord du client.
  const deliveryFee = choix.frais ?? 0;

  const reception: ReceptionCommande = {
    mode,
    volumineux: choix.volumineux,
    ...(mode === "retrait" ? { lieuRetrait: choix.lieuRetrait } : {}),
    ...(mode === "transport" ? { preferenceTransport: choix.preferenceTransport } : {}),
  };

  const shippingAddress: ShippingAddress = {
    fullName: nom,
    phone: telephone,
    ...(telephone2 ? { phone2: telephone2 } : {}),
    address: form.address.trim(),
    city: choix.ville,
    ...(form.region.trim() ? { region: form.region.trim() } : {}),
    ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
  };

  return {
    customerName: nom,
    customerPhone: telephone,
    customerEmail: form.email.trim() || null,
    shippingAddress,
    items: d.items.map((item) => {
      // Clean undefined values from variant object as Firestore does not support them
      const cleanVariant = item.variant
        ? Object.fromEntries(Object.entries(item.variant).filter(([, v]) => v !== undefined))
        : null;
      // Nom arabe vu par le client dans le récapitulatif ; absent plutôt que vide (Firestore refuse undefined).
      const productNameAr = nomArabe(item, d.getProductById(item.productId));

      return {
        productId: item.productId || "unknown",
        productName: item.productName || "Produit",
        ...(productNameAr ? { productNameAr } : {}),
        productImage: item.productImage || "/placeholder.png",
        price: item.price || 0,
        // Prix réellement facturé (prix de gros compris), calculé comme le
        // sous-total du panier : somme(unitPrice × quantité) = subtotal.
        unitPrice: Number(getCartItemUnitPrice(item, d.productQtyMap[item.productId])) || 0,
        quantity: item.quantity || 1,
        variant: cleanVariant && Object.keys(cleanVariant).length > 0 ? cleanVariant : null,
        maxStock: item.maxStock ?? 99,
        // L'équipe voit quelle ligne est un rouleau entier (préparé à CHRIFA).
        ...(item.volumineux ? { volumineux: true } : {}),
      };
    }),
    subtotal: d.subtotal || 0,
    deliveryFee: deliveryFee || 0,
    total: d.subtotal + deliveryFee || 0,
    paymentMethod: d.paiement,
    reception,
    status: "pending",
    notes: form.notes.trim() || null,
    // D'où vient le client : publicité, lien, réponse à « Comment avez-vous connu LEBTEX ? ».
    provenance: provenanceCommande(lireProvenanceStockee(), d.language, form.connuPar),
  };
}

/** Les lignes du panier pour un message WhatsApp (en français : lu par l'équipe). */
function lignesMessage(items: CartItem[], productQtyMap: Record<string, number>): LigneMessage[] {
  return items.map((item) => ({
    nom: item.productName || "Article",
    variante: libelleLignePanier(item.variant, "fr"),
    quantite: item.quantity || 1,
    prixUnitaire: getCartItemUnitPrice(item, productQtyMap[item.productId]),
  }));
}

/** Le mode de réception dit à l'équipe (jamais le nom du transporteur des colis). */
function texteReception(choix: ChoixReception, nomLieu: string): string {
  if (choix.mode === "retrait") return `Réception : retrait gratuit à ${nomLieu}`;
  if (choix.mode === "transport") {
    return `Réception : transport ${choix.preferenceTransport === "camionnette" ? "par la camionnette LEBTEX" : "jusqu’au dépôt du transporteur"} (prix à confirmer)`;
  }
  if (choix.mode === "domicile") {
    const frais = choix.fraisConnus && choix.frais !== null ? formatPrice(choix.frais) : "à confirmer";
    return `Réception : livraison à domicile${choix.ville ? ` (${choix.ville})` : ""}, ${frais}`;
  }
  return "Réception : à convenir";
}

/** Le numéro tel qu'on le relit : « 06 12 34 56 78 » s'il est reconnu, sinon tel que tapé. */
function telephoneSaisiLisible(saisie: string): string {
  const n = normaliserTelephoneMaroc(saisie);
  return n ? telephoneMarocLisible(n) : saisie.trim();
}

// ─── Main Checkout Page ───────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart, removeItem, productQtyMap, charge } = useShopCart();
  const { reglages } = useReglagesReception();
  const { language } = useLanguage();
  const { getProductById } = useShopProducts();
  const ar = language === "ar";
  const [form, setForm] = useState<FormData>(FORM_VIDE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [orderSuccess, setOrderSuccess] = useState(false);
  // Brouillon relu : avant, on n'écrit rien (le formulaire vide écraserait la saisie gardée).
  const [brouillonLu, setBrouillonLu] = useState(false);
  // Bloc « e-mail, 2e numéro, remarque » : replié tant que le client n'en a pas besoin.
  const [facultatifOuvert, setFacultatifOuvert] = useState(false);
  const [etatEnvoi, setEtatEnvoi] = useState<EtatEnvoi>("repos");
  const [codeErreur, setCodeErreur] = useState<string | null>(null);
  // Coordonnées gardées sur ce téléphone après une commande précédente (null : aucune).
  const [souvenir, setSouvenir] = useState<CoordonneesClient | null>(null);
  // Case « Se souvenir de moi sur ce téléphone », cochée d'office. Le ref la donne telle
  // qu'elle est quand la commande arrive (le client peut la changer pendant « connexion lente »).
  const [seSouvenir, setSeSouvenir] = useState(true);
  const seSouvenirRef = useRef(true);
  // Coordonnées de la commande envoyée, gardées si la case est cochée quand elle arrive.
  const aGarder = useRef<CoordonneesClient | null>(null);

  // Identifiant, n° et empreinte de la commande en cours : gardés avec le brouillon.
  const envoiPrevu = useRef<Omit<BrouillonCommande, "champs" | "majLe">>({});
  const envoiEnCours = useRef<EnvoiCommande | null>(null);
  // Un seul envoi à la fois (posé avant toute attente : un double appui ne passe pas).
  const verrou = useRef(false);
  const terminee = useRef(false);
  const monte = useRef(true);
  const etatRef = useRef<EtatEnvoi>("repos");

  const volumineux = useMemo(() => commandeVolumineuse(items), [items]);
  const villes = useMemo(() => optionsVilles(language), [language]);
  // Le formulaire montre encore la personne gardée sur ce téléphone : ligne « Bonjour ».
  const clientGarde = !!souvenir && memeClient(souvenir, form);
  // Son mode de réception, coché d'office comme ses autres coordonnées sont pré-remplies
  // (jamais pour un rouleau) ; « Ce n'est pas moi » l'oublie avec elles.
  const modeGarde = souvenir ? modeRepris(souvenir, volumineux) : "";
  const choix = useMemo(
    () => calculerChoix(form, volumineux, reglages, modeGarde),
    [form, volumineux, reglages, modeGarde]
  );
  // Un moyen de paiement retiré des réglages entre-temps retombe sur les espèces.
  const paiement: MoyenPaiement =
    (form.paiement === "virement" && !reglages.virement.actif) || (form.paiement === "carte" && !reglages.carte.actif)
      ? "cod"
      : form.paiement;
  const lieu = reglages.lieux[choix.lieuRetrait];
  const especes = libelleEspeces(choix, language);
  const totalConnu = subtotal + (choix.fraisConnus && choix.frais !== null ? choix.frais : 0);
  // D'anciens paniers peuvent garder un article sans prix : la commande ne part pas avec.
  const lignesSansPrix = useMemo(
    () => items.filter((item) => getCartItemUnitPrice(item, productQtyMap[item.productId]) <= 0),
    [items, productQtyMap]
  );

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  // Le brouillon de ce navigateur : le client retrouve ce qu'il avait tapé. Sans
  // brouillon, les coordonnées gardées à sa dernière commande remplissent le formulaire.
  // Leur mode n'entre pas dans le formulaire : il n'est qu'un choix d'office (modeGarde),
  // décidé avec le panier en cours, et le brouillon ne garde que ce que le client a choisi.
  useEffect(() => {
    const b = lireBrouillon();
    const s = lireCoordonnees();
    setSouvenir(s);
    if (b) {
      const repris = formDepuisBrouillon(b.champs);
      setForm(repris);
      setFacultatifOuvert(facultatifsRemplis(repris));
      envoiPrevu.current = {
        ...(b.idCommande ? { idCommande: b.idCommande } : {}),
        ...(b.numeroCommande ? { numeroCommande: b.numeroCommande } : {}),
        ...(b.signature ? { signature: b.signature } : {}),
        ...(b.envoyeLe ? { envoyeLe: b.envoyeLe } : {}),
      };
    } else if (s) {
      setForm(formDepuisBrouillon({
        fullName: s.fullName,
        phone: telephoneMarocLisible(s.phone),
        city: s.city,
        villeAutre: s.villeAutre,
        address: s.address,
      }));
    }
    setBrouillonLu(true);
  }, []);

  // Gardé pendant la saisie (un peu après la dernière touche), jamais après la commande.
  useEffect(() => {
    if (!brouillonLu || terminee.current) return;
    const minuteur = setTimeout(() => {
      if (terminee.current) return;
      const rienTape = (Object.keys(FORM_VIDE) as (keyof FormData)[]).every((k) => form[k] === FORM_VIDE[k]);
      // Tout effacé (et rien d'envoyé) : on ne garde pas l'ancien brouillon.
      if (rienTape && !envoiPrevu.current.idCommande) return effacerBrouillon();
      ecrireBrouillon({ champs: { ...form }, ...envoiPrevu.current });
    }, 400);
    return () => clearTimeout(minuteur);
  }, [form, brouillonLu]);

  // Panier vraiment vide (une fois relu du navigateur) : retour au panier.
  useEffect(() => {
    if (charge && items.length === 0 && !orderSuccess) {
      router.replace("/shop/panier");
    }
  }, [charge, items.length, router, orderSuccess]);

  const setField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // « Ce n'est pas moi » : téléphone partagé. On oublie la personne précédente sur ce
  // téléphone : ses coordonnées gardées, son brouillon (e-mail, 2e numéro, remarque
  // compris), l'identifiant de commande de ce brouillon, et le numéro que /shop/suivi
  // relit tout seul. Le formulaire repart vide.
  const oublierCoordonnees = useCallback(() => {
    effacerCoordonnees();
    effacerBrouillon();
    try {
      localStorage.removeItem("lebtex_customer_phone");
      localStorage.removeItem("lebtex_last_order_id");
      localStorage.removeItem("lebtex_last_order_number");
    } catch { /* navigation privée : rien n'était gardé */ }
    setSouvenir(null);
    aGarder.current = null;
    envoiPrevu.current = {};
    setForm(FORM_VIDE);
    setFacultatifOuvert(false);
    setErrors({});
    document.getElementById("checkout-nom")?.focus();
  }, []);

  const changerEtat = useCallback((etat: EtatEnvoi) => {
    etatRef.current = etat;
    setEtatEnvoi(etat);
  }, []);

  /** La commande est chez nous : une seule fois par page, quel que soit le chemin qui y mène. */
  const reussir = useCallback(
    (envoi: Pick<EnvoiCommande, "id" | "numero" | "telephone">) => {
      if (terminee.current || !monte.current) return;
      terminee.current = true;

      // Save customer info for auto-tracking on suivi page
      // Isolated try/catch: localStorage failure must NOT crash the checkout
      try {
        localStorage.setItem("lebtex_customer_phone", envoi.telephone);
        localStorage.setItem("lebtex_last_order_id", envoi.id);
        if (envoi.numero) localStorage.setItem("lebtex_last_order_number", envoi.numero);
      } catch { /* ignore localStorage errors (private browsing, quota) */ }

      // Coordonnées pour la prochaine commande, seulement si la case est cochée à cet instant.
      if (seSouvenirRef.current && aGarder.current) ecrireCoordonnees(aGarder.current);
      else effacerCoordonnees();

      // Prévient le commerçant par e-mail. Sans await et sans suite en cas
      // d'échec : l'alerte ne doit jamais retarder ni faire échouer la commande.
      // keepalive laisse partir la requête même si la page change aussitôt.
      // (La route n'envoie qu'une alerte par commande, même appelée deux fois.)
      fetch("/api/shop/commandes/alerte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: envoi.id }),
        keepalive: true,
      }).catch(() => {});

      effacerBrouillon();

      // IMPORTANT: redirect FIRST, then clear cart
      // If we clearCart first, items.length === 0 causes the component to unmount before navigation
      setOrderSuccess(true);
      clearCart();
      router.push(`/shop/confirmation/${envoi.id}`);
    },
    [clearCart, router]
  );

  /**
   * Écriture refusée : souvent parce que la commande existe déjà (un envoi précédent
   * est passé). On le vérifie sur le serveur avant de parler d'erreur. `etatAttendu` :
   * si le client a relancé entre-temps, c'est ce nouvel essai qui conclura.
   */
  const conclureRefus = useCallback(
    async (envoi: EnvoiCommande, etatAttendu: EtatEnvoi) => {
      const existe = await commandeExiste(envoi.id);
      if (!monte.current || terminee.current) return;
      if (existe) return reussir(envoi);
      if (etatRef.current !== etatAttendu) return;
      setCodeErreur(codeErreurDe(envoi.erreur));
      changerEtat("erreur");
    },
    [reussir, changerEtat]
  );

  /** Attendre la réponse du serveur, 15 s au plus ; refusée, vérifier si la commande est déjà là. */
  const attendre = useCallback(
    async (envoi: EnvoiCommande) => {
      const issue = await avecDelai(
        envoi.promesse.then(() => "ok" as const, () => "refus" as const),
        DELAI_ENVOI_MS
      );
      if (!monte.current || terminee.current) return;
      if (issue === "ok") return reussir(envoi);
      if (issue === DELAI_PASSE) {
        // L'écriture continue en arrière-plan : si elle aboutit ou est refusée, on enchaîne tout seul.
        setCodeErreur(null);
        changerEtat("lent");
        return;
      }
      return conclureRefus(envoi, "envoi");
    },
    [reussir, changerEtat, conclureRefus]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (verrou.current || terminee.current || lignesSansPrix.length > 0) return;

      const validationErrors = validate(form, choix, language);
      const mode = choix.mode;
      if (Object.keys(validationErrors).length > 0 || !mode) {
        setErrors(validationErrors);
        if (validationErrors.phone2 || validationErrors.email) setFacultatifOuvert(true);
        // Scroll to first error
        setTimeout(() => {
          const firstErrorEl = document.querySelector('[data-error="true"]');
          firstErrorEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
        return;
      }

      verrou.current = true;
      setCodeErreur(null);
      changerEtat("envoi");
      // Ce que le client envoie ; écrit seulement quand la commande est arrivée, et si la
      // case est encore cochée à ce moment-là (reussir). Le mode d'un rouleau n'est pas gardé.
      aGarder.current = coordonneesAGarder(
        {
          fullName: form.fullName, phone: form.phone, city: form.city, villeAutre: form.villeAutre,
          address: form.address, mode,
        },
        choix.volumineux
      );

      try {
        // Un envoi précédent est encore en route (réseau lent) : on l'attend encore, sans réécrire.
        const enRoute = envoiEnCours.current;
        if (enRoute?.fini === "ok") return reussir(enRoute);
        if (enRoute?.fini === "non") {
          await attendre(enRoute);
          return;
        }

        const contenu = contenuCommande({
          form, choix, mode, paiement, items, productQtyMap, subtotal, language, getProductById,
        });
        // « Même commande » = même panier, même téléphone : changer l'adresse puis réessayer
        // ne doit pas créer une 2e commande.
        const signature = signatureCommande({ items: contenu.items, telephone: contenu.customerPhone });

        // L'identifiant du brouillon, tant que c'est la même commande.
        const prevu = envoiPrevu.current;
        let idCommande = prevu.idCommande;
        let numeroCommande = prevu.numeroCommande;
        if (idCommande && prevu.envoyeLe) {
          // Déjà envoyé une fois (cette page ou une page fermée) : est-ce arrivé ?
          // null = le serveur ne répond pas (réseau faible) : on écrit quand même, sans risque.
          const existe = await commandeExiste(idCommande);
          if (!monte.current || terminee.current) return;
          const suite = suiteRenvoi(existe, memeEnvoi(prevu, signature));
          if (suite === "deja-la") {
            return reussir({ id: idCommande, numero: numeroCommande ?? "", telephone: contenu.customerPhone });
          }
          // Une autre commande (déjà arrivée, ou peut-être) : celle-ci en est une nouvelle.
          // La même, sans réponse du serveur : renvoyée sous le même identifiant ; si elle est
          // déjà là, la règle refuse de la réécrire et conclureRefus la retrouve.
          // (Seul l'administrateur connecté dans ce navigateur a le droit de réécrire : sa
          // commande test serait alors remplacée par la même, remise « en attente ».)
          if (suite === "nouveau") idCommande = undefined;
        }
        if (!idCommande || !numeroCommande) {
          idCommande = doc(collection(db, "shop_orders")).id;
          numeroCommande = generateOrderNumber();
        }
        envoiPrevu.current = { idCommande, numeroCommande, signature, envoyeLe: Date.now() };
        ecrireBrouillon({ champs: { ...form }, ...envoiPrevu.current });

        const promesse = setDoc(doc(db, "shop_orders", idCommande), {
          ...contenu,
          orderNumber: numeroCommande,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const envoi: EnvoiCommande = {
          id: idCommande,
          numero: numeroCommande,
          telephone: contenu.customerPhone,
          promesse,
          fini: "non",
        };
        envoiEnCours.current = envoi;
        promesse.then(
          () => {
            envoi.fini = "ok";
            // Arrivée après le message « connexion lente » : on enchaîne sans attendre le client.
            if (etatRef.current === "lent") reussir(envoi);
          },
          (err) => {
            envoi.fini = "refus";
            envoi.erreur = err;
            // Refus arrivé après le message « connexion lente » : personne ne l'attend plus ;
            // on vérifie si la commande est là, sinon on montre l'erreur.
            if (etatRef.current === "lent" && envoiEnCours.current === envoi && monte.current && !terminee.current) {
              void conclureRefus(envoi, "lent");
            }
          }
        );
        await attendre(envoi);
      } catch (err) {
        // Erreur avant même l'envoi (données refusées par le SDK…).
        console.error("Erreur Checkout:", err);
        if (monte.current && !terminee.current) {
          setCodeErreur(codeErreurDe(err));
          changerEtat("erreur");
        }
      } finally {
        verrou.current = false;
        if (monte.current && !terminee.current && etatRef.current === "envoi") changerEtat("repos");
      }
    },
    [
      form, choix, paiement, items, subtotal, productQtyMap, language, getProductById, lignesSansPrix.length,
      reussir, attendre, conclureRefus, changerEtat,
    ]
  );

  const retirerLignesSansPrix = useCallback(() => {
    for (const item of lignesSansPrix) removeItem(item.productId, getCartItemVariantKey(item));
  }, [lignesSansPrix, removeItem]);

  // Commande arrivée (le panier vient d'être vidé) : plus de formulaire ni de message « lent »
  // pendant que la confirmation s'ouvre, parfois lentement.
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center px-4" role="status" aria-live="polite">
        <div className="max-w-sm w-full rounded-2xl border border-[#E8E4DF] bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" aria-hidden />
          <p className="mt-3 text-lg font-bold text-[#0F0F0F] shop-font-display">
            {ar ? "تم تسجيل طلبك" : "Commande enregistrée"}
          </p>
          <p className="mt-1 text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#C8102E]" aria-hidden />
            {ar ? "جاري فتح صفحة التأكيد…" : "Ouverture de la confirmation…"}
          </p>
        </div>
      </div>
    );
  }

  // Panier pas encore relu après un rechargement : on attend, sans renvoyer au panier.
  if (!charge) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-[#C8102E]" aria-hidden />
        <span className="sr-only">{ar ? "جاري التحميل…" : "Chargement…"}</span>
      </div>
    );
  }
  if (items.length === 0) return null;

  // Texte de l'option transport : ce qui se passe dépend de la ville.
  const texteTransport = ar
    ? !choix.ville
      ? "اختر مدينتك أولاً."
      : choix.preferenceTransport === "camionnette"
        ? reglages.camionnette.actif
          ? `توصل شاحنة LEBTEX طلبك إلى أسفل العمارة. أيام الجولات: ${reglages.camionnette.jours}.`
          : "التوصيل إلى عنوانك، ونتفق معك على موعده عبر الهاتف."
        : `يوصل ناقلنا المعتاد البضاعة إلى مستودعه في ${nomVille(choix.ville, "ar")}. تستلمها من هذا المستودع، ونعطيك عنوانه عبر الهاتف.`
    : !choix.ville
      ? "Choisissez d'abord votre ville."
      : choix.preferenceTransport === "camionnette"
        ? reglages.camionnette.actif
          ? `Notre camionnette LEBTEX vous livre au pied de l'immeuble. Tournées : ${reglages.camionnette.jours}.`
          : "Livraison à votre adresse, organisée avec vous au téléphone."
        : `Notre transporteur habituel livre la marchandise à son dépôt, à ${choix.ville}. Vous la récupérez à ce dépôt : nous vous donnons son adresse au téléphone.`;

  const placeholderNotes = ar
    ? choix.mode === "retrait"
      ? "مثال: سأمر يوم السبت صباحاً"
      : choix.mode === "transport"
        ? "مثال: أفضل وقت للاتصال بك"
        : "مثال: التوصيل بعد السادسة مساءً، الطابق الثاني"
    : choix.mode === "retrait"
      ? "Ex : je passerai samedi matin"
      : choix.mode === "transport"
        ? "Ex : meilleur moment pour vous appeler"
        : "Ex : livrer après 18h, sonnez au 2ème étage";

  // Articles sans prix : leurs noms, et le message pour demander leur prix.
  const nomLigne = (item: CartItem) => {
    const nom = (ar && nomArabe(item, getProductById(item.productId))) || item.productName;
    const variante = libelleLignePanier(item.variant, language);
    return variante ? `${nom} (${variante})` : nom;
  };
  const lienPrixWhatsApp = lignesSansPrix.length > 0
    ? getWhatsAppContact(messagePrixAConfirmer(lignesMessage(lignesSansPrix, productQtyMap)))
    : "";

  // Envoi bloqué (réseau lent ou erreur) : toute la commande, prête à partir sur WhatsApp.
  const enDifficulte = etatEnvoi === "lent" || etatEnvoi === "erreur";
  const lienSecours = enDifficulte
    ? getWhatsAppContact(
        messageWhatsAppCommande({
          lignes: lignesMessage(items, productQtyMap),
          sousTotal: subtotal,
          ligneReception: texteReception(choix, lieu.nom),
          total: choix.fraisConnus ? totalConnu : null,
          totalEnPlus: choix.mode === "transport" ? "+ transport à confirmer" : "",
          nom: form.fullName.trim().replace(/\s+/g, " "),
          telephone: telephoneSaisiLisible(form.phone),
          ville: choix.ville,
          adresse: choix.adresseRequise ? form.address.trim() : "",
          paiement: paiement === "virement" ? "virement bancaire" : paiement === "carte" ? "carte bancaire" : "espèces",
          remarque: form.notes.trim(),
          numero: envoiPrevu.current.numeroCommande,
        })
      )
    : "";

  return (
    <div className="min-h-screen bg-[#FBF8F3]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E8E4DF] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/shop/panier"
              aria-label={ar ? "العودة إلى السلة" : "Retour au panier"}
              className="-ms-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-2 text-sm text-[#6B6B6B] hover:text-[#C8102E] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              <span className="hidden sm:inline">{ar ? "العودة إلى السلة" : "Retour au panier"}</span>
            </Link>
            <span className="hidden sm:inline text-[#E8E4DF]" aria-hidden>|</span>
            <h1 className="text-lg font-bold text-[#0F0F0F] shop-font-display min-w-0">
              <span className="sm:hidden">{ar ? "الطلب" : "Commande"}</span>
              <span className="hidden sm:inline">{ar ? "إنهاء الطلب" : "Finaliser la commande"}</span>
            </h1>
          </div>
          <div className="hidden sm:flex">
            <ProgressSteps step={2} />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* ── Left: Form (60%) ── */}
            <div className="lg:col-span-3 space-y-6">

              {/* ── Articles sans prix : à retirer ou à faire chiffrer avant de commander ── */}
              {lignesSansPrix.length > 0 && (
                <div id="articles-sans-prix" role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="font-bold text-[#0F0F0F] flex items-center gap-2">
                    <Info className="w-5 h-5 text-amber-700 flex-shrink-0" />
                    {ar ? "سعر بعض المنتجات قيد التأكيد" : "Prix à confirmer pour certains articles"}
                  </p>
                  <p className="text-sm text-[#4A4A4A] mt-1.5 leading-relaxed">
                    {ar
                      ? "لا يمكن إرسال الطلب وهذه المنتجات في السلة. احذفها لطلب الباقي، أو اسألنا عن سعرها عبر واتساب."
                      : "La commande ne peut pas partir avec ces articles. Retirez-les pour commander le reste, ou demandez-nous leur prix sur WhatsApp."}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-sm text-[#0F0F0F] list-disc ps-5">
                    {lignesSansPrix.map((item) => (
                      <li key={`${item.productId}::${getCartItemVariantKey(item) ?? ""}`}>
                        {nomLigne(item)} <bdi dir="ltr">×{item.quantity}</bdi>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={retirerLignesSansPrix}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E8E4DF] bg-white px-4 text-sm font-bold text-[#0F0F0F] hover:border-[#C8102E] hover:text-[#C8102E] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {ar ? "حذف هذه المنتجات" : "Retirer ces articles"}
                    </button>
                    <a
                      href={lienPrixWhatsApp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:bg-[#1da851] transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {ar ? "اسأل عن السعر عبر واتساب" : "Demander le prix sur WhatsApp"}
                    </a>
                  </div>
                </div>
              )}

              {/* ── Section 1: Coordonnées ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<User className="w-4 h-4" />}
                  title={ar ? "معلوماتك" : "Vos coordonnées"}
                  subtitle={ar ? "نتصل بك على هذا الرقم لتأكيد الطلب" : "Nous vous appelons à ce numéro pour confirmer la commande"}
                />
                {/* Coordonnées reprises de la dernière commande : « Ce n'est pas moi » les efface. */}
                {souvenir && clientGarde && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-[#E8E4DF] bg-[#FBF8F3] px-4 py-2.5">
                    <p className="min-w-0 break-words text-sm text-[#0F0F0F]">
                      {ar ? (
                        <>مرحباً <bdi className="font-semibold">{nomPourSaluer(souvenir.fullName)}</bdi>، معلوماتك جاهزة من طلبك السابق.</>
                      ) : (
                        <>Bonjour <bdi className="font-semibold">{nomPourSaluer(souvenir.fullName)}</bdi> — vos coordonnées sont reprises.</>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={oublierCoordonnees}
                      className="min-h-[44px] text-sm font-semibold text-[#C8102E] underline hover:no-underline"
                    >
                      {ar ? "لست أنا" : "Ce n'est pas moi"}
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  <InputField id="checkout-nom" label={ar ? "الاسم الكامل" : "Nom complet"} required error={errors.fullName}>
                    <input
                      id="checkout-nom"
                      type="text"
                      value={form.fullName}
                      onChange={(e) => setField("fullName", e.target.value)}
                      placeholder={ar ? "مثال: ياسين الإدريسي" : "Ex : Yassine El Idrissi"}
                      data-error={!!errors.fullName}
                      {...aria("checkout-nom", errors.fullName)}
                      className={inputCls(errors.fullName)}
                      autoComplete="name"
                      maxLength={120}
                    />
                  </InputField>

                  <InputField id="checkout-tel" label={ar ? "رقم الهاتف" : "Téléphone"} required error={errors.phone}>
                    {/* Un numéro s'écrit de gauche à droite, même sur le site en arabe. */}
                    <div className="relative" dir="ltr">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none" aria-hidden>
                        <span className="text-sm">🇲🇦</span>
                        <span className="text-xs text-[#6B6B6B] font-medium">+212</span>
                      </div>
                      <input
                        id="checkout-tel"
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        placeholder="06 12 34 56 78"
                        data-error={!!errors.phone}
                        {...aria("checkout-tel", errors.phone)}
                        className={`${inputCls(errors.phone)} pl-[4.5rem]`}
                        autoComplete="tel"
                        maxLength={24}
                      />
                    </div>
                  </InputField>
                </div>
              </div>

              {/* ── Section 2: Réception (ville, mode, adresse) ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<MapPin className="w-4 h-4" />}
                  title={ar ? "استلام الطلب" : "Réception de la commande"}
                  subtitle={ar ? "مدينتك، ثم طريقة استلام طلبك" : "Votre ville, puis la façon de recevoir votre commande"}
                />
                <div className="space-y-5">
                  {choix.volumineux && (
                    <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                      <Info className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-[#2A2A2A] leading-relaxed">{ar ? TEXTE_TRANSPORT_VOLUMINEUX_AR : TEXTE_TRANSPORT_VOLUMINEUX}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField id="checkout-ville" label={ar ? "المدينة" : "Ville"} required={choix.mode !== "retrait"} error={errors.city}>
                      <select
                        id="checkout-ville"
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                        data-error={!!errors.city}
                        {...aria("checkout-ville", errors.city)}
                        className={inputCls(errors.city)}
                        autoComplete="address-level2"
                      >
                        <option value="">{ar ? "اختر مدينة..." : "Sélectionner une ville..."}</option>
                        {/* En arabe, le nom arabe s'affiche ; la commande garde le nom français. */}
                        {villes.map((v) => (
                          <option key={v.valeur} value={v.valeur}>
                            {v.libelle}
                          </option>
                        ))}
                        <option value={AUTRE_VILLE}>{ar ? "مدينة أخرى (اكتبها)" : "Autre ville (écrivez-la)"}</option>
                      </select>
                    </InputField>
                    {form.city === AUTRE_VILLE && (
                      <InputField id="checkout-ville-autre" label={ar ? "مدينتك" : "Votre ville"} required error={errors.villeAutre}>
                        <input
                          id="checkout-ville-autre"
                          type="text"
                          value={form.villeAutre}
                          onChange={(e) => setField("villeAutre", e.target.value)}
                          placeholder={ar ? "مثال: إمزورن" : "ex : Imzouren"}
                          data-error={!!errors.villeAutre}
                          {...aria("checkout-ville-autre", errors.villeAutre)}
                          className={inputCls(errors.villeAutre)}
                          autoComplete="address-level2"
                          maxLength={60}
                        />
                      </InputField>
                    )}
                  </div>

                  <fieldset data-error={!!errors.mode}>
                    <legend className="block text-sm font-medium text-[#0F0F0F] mb-2">
                      {ar ? "كيف تريد استلام طلبك؟" : "Comment voulez-vous recevoir votre commande ?"}
                      <span className="text-[#C8102E] ms-1">*</span>
                    </legend>
                    <div className="space-y-3">
                      {choix.modes.map((m) => {
                        if (m === "domicile") {
                          const prixConnu = !!choix.ville;
                          const fraisDomicile = prixConnu
                            ? fraisLivraison({ mode: "domicile", ville: choix.ville })
                            : null;
                          return (
                            <OptionCarte
                              key={m}
                              name="mode"
                              checked={choix.mode === m}
                              onSelect={() => setField("mode", m)}
                              icone={<Truck className="w-4 h-4" />}
                              titre={ar ? "التوصيل إلى المنزل" : "Livraison à domicile"}
                              prix={
                                prixConnu
                                  ? prixFrais(fraisDomicile, language)
                                  : ar
                                    ? <bdi dir="ltr">{`${formatPrice(FRAIS_ZONE.casablanca)} – ${formatPrice(FRAIS_ZONE.eloignee)}`}</bdi>
                                    : `${formatPrice(FRAIS_ZONE.casablanca)} à ${formatPrice(FRAIS_ZONE.eloignee)}`
                              }
                            >
                              {ar ? (
                                <p>
                                  التوصيل إلى عنوانك{prixConnu ? `، والمدة المتوقعة ${delaiColis(choix.ville, language)}` : "، والثمن حسب المدينة"}.
                                  {" "}{paiement === "cod" ? "تدفع عند الاستلام: " : ""}لا يُفتح الطرد قبل الدفع.
                                </p>
                              ) : (
                                <p>
                                  Livraison à votre adresse{prixConnu ? `, sous ${delaiColis(choix.ville)}` : ", prix selon la ville"}.
                                  {" "}{paiement === "cod" ? "Vous payez à la réception : le" : "Le"} colis ne s&apos;ouvre pas avant le paiement.
                                </p>
                              )}
                              {/* Plan §3.1 : Sendit facture plus cher quelques quartiers excentrés ; on le dit avant l'appel. */}
                              {prixConnu && estCasablanca(choix.ville) && (
                                <p className="text-xs text-[#6B6B6B]">
                                  {ar ? (
                                    <><bdi dir="ltr">{formatPrice(FRAIS_ZONE.eloignee)}</bdi> في بعض المناطق البعيدة من الدار البيضاء، نؤكده لك عند الاتصال.</>
                                  ) : (
                                    <>{formatPrice(FRAIS_ZONE.eloignee)} dans quelques zones éloignées de Casablanca, confirmé à l&apos;appel.</>
                                  )}
                                </p>
                              )}
                            </OptionCarte>
                          );
                        }
                        if (m === "retrait") {
                          return (
                            <OptionCarte
                              key={m}
                              name="mode"
                              checked={choix.mode === m}
                              onSelect={() => setField("mode", m)}
                              icone={<Store className="w-4 h-4" />}
                              titre={ar ? `استلام مجاني من ${lieu.nom}` : `Retrait gratuit à ${lieu.nom}`}
                              prix={libelleFrais(0, language)}
                              prixGratuit
                            >
                              <p>{lieu.adresse} · {lieu.horaires}.</p>
                              <p>{ar ? "نؤكد لك العنوان بالضبط واليوم عبر واتساب." : "L'adresse exacte et le jour vous sont confirmés par WhatsApp."}</p>
                            </OptionCarte>
                          );
                        }
                        return (
                          <OptionCarte
                            key={m}
                            name="mode"
                            checked={choix.mode === m}
                            onSelect={() => setField("mode", m)}
                            icone={<Truck className="w-4 h-4" />}
                            titre={ar ? "التوصيل / النقل" : "Livraison / transport"}
                            prix={prixFrais(null, language)}
                          >
                            <p>{texteTransport}</p>
                            <p>
                              {ar
                                ? "نتصل بك لنعطيك ثمن النقل: لا يُرسل أي شيء قبل موافقتك."
                                : "Nous vous appelons avec le prix du transport : rien ne part avant votre accord."}
                            </p>
                          </OptionCarte>
                        );
                      })}
                    </div>
                    {errors.mode && (
                      <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.mode}
                      </p>
                    )}
                  </fieldset>

                  {/* Région et code postal : dans le bloc facultatif, plus bas. */}
                  {choix.adresseRequise && (
                    <InputField id="checkout-adresse" label={ar ? "العنوان الكامل" : "Adresse complète"} required error={errors.address}>
                      <input
                        id="checkout-adresse"
                        type="text"
                        value={form.address}
                        onChange={(e) => setField("address", e.target.value)}
                        placeholder={ar ? "رقم ...، زنقة ...، حي ..." : "N° X, Rue ..., Quartier ..."}
                        data-error={!!errors.address}
                        {...aria("checkout-adresse", errors.address)}
                        className={inputCls(errors.address)}
                        autoComplete="street-address"
                        maxLength={300}
                      />
                    </InputField>
                  )}
                </div>
              </div>

              {/* ── Section 3: Payment ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<ShieldCheck className="w-4 h-4" />}
                  title={ar ? "الدفع" : "Paiement"}
                  subtitle={ar ? "اختر ما يناسبك" : "Choisissez ce qui vous arrange"}
                />
                <fieldset className="space-y-3">
                  <legend className="sr-only">{ar ? "طريقة الدفع" : "Moyen de paiement"}</legend>
                  <OptionCarte
                    name="paiement"
                    checked={paiement === "cod"}
                    onSelect={() => setField("paiement", "cod")}
                    icone={<Banknote className="w-4 h-4" />}
                    titre={especes.titre}
                  >
                    <p>{especes.texte}</p>
                  </OptionCarte>
                  {reglages.virement.actif && (
                    <OptionCarte
                      name="paiement"
                      checked={paiement === "virement"}
                      onSelect={() => setField("paiement", "virement")}
                      icone={<Landmark className="w-4 h-4" />}
                      titre={ar ? "تحويل بنكي" : "Virement bancaire"}
                    >
                      {ar ? (
                        <p>
                          يظهر رقم حسابنا البنكي (RIB) بعد الطلب. اكتب رقم طلبك في سبب التحويل، وسنؤكد لك الاستلام
                          عبر واتساب.
                        </p>
                      ) : (
                        <p>
                          Notre RIB s&apos;affiche après la commande. Mettez votre numéro de commande en motif du
                          virement. Nous vous confirmons la réception par WhatsApp.
                        </p>
                      )}
                    </OptionCarte>
                  )}
                  {reglages.carte.actif && (
                    <OptionCarte
                      name="paiement"
                      checked={paiement === "carte"}
                      onSelect={() => setField("paiement", "carte")}
                      icone={<CreditCard className="w-4 h-4" />}
                      titre={ar ? "بطاقة بنكية" : "Carte bancaire"}
                    >
                      <p>
                        {ar
                          ? "دفع آمن عبر الإنترنت: نرسل لك الرابط بعد مكالمة التأكيد."
                          : "Paiement en ligne sécurisé : nous vous envoyons le lien après notre appel de confirmation."}
                      </p>
                    </OptionCarte>
                  )}
                </fieldset>

                {/* Plafond d'espèces d'un colis Sendit (règle validée le 29/09/2026) : on prévient,
                    on propose le virement, on n'impose rien. */}
                {choix.mode === "domicile" && paiement === "cod" && totalConnu > PLAFOND_ESPECES_COLIS && (
                  <div className="mt-4 flex gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    {ar ? (
                      <p className="text-sm text-[#4A4A4A] leading-relaxed">
                        إذا تجاوز الدفع نقداً <bdi dir="ltr">{formatPrice(PLAFOND_ESPECES_COLIS)}</bdi> للطرد الواحد، نقترح
                        عليك عبر الهاتف الحل الأبسط (تحويل بنكي أو استلام مجاني أو ترتيب آخر)
                        {reglages.virement.actif ? "، ويمكنك أيضاً اختيار التحويل البنكي من الآن." : "."}
                      </p>
                    ) : (
                      <p className="text-sm text-[#4A4A4A] leading-relaxed">
                        Au-delà de {formatPrice(PLAFOND_ESPECES_COLIS)} d&apos;espèces pour un colis, nous vous proposons au
                        téléphone la solution la plus simple (virement, retrait gratuit ou autre arrangement)
                        {reglages.virement.actif ? " ; vous pouvez aussi choisir le virement dès maintenant." : "."}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 4: Facultatif (2e numéro, e-mail, détails d'adresse, remarque) ── */}
              <details
                open={facultatifOuvert}
                onToggle={(e) => setFacultatifOuvert(e.currentTarget.open)}
                className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm"
              >
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-[#0F0F0F] [&::-webkit-details-marker]:hidden">
                  <span>
                    {ar
                      ? "أضف بريداً إلكترونياً أو رقماً ثانياً أو ملاحظة (اختياري)"
                      : "Ajouter un e-mail, un 2e numéro ou une remarque (facultatif)"}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 flex-shrink-0 text-[#6B6B6B] transition-transform ${facultatifOuvert ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </summary>
                <div className="space-y-4 px-6 pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField id="checkout-tel2" label={ar ? "رقم هاتف ثانٍ" : "2e numéro de téléphone"} error={errors.phone2}>
                      <div className="relative" dir="ltr">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" aria-hidden />
                        <input
                          id="checkout-tel2"
                          type="tel"
                          inputMode="tel"
                          value={form.phone2}
                          onChange={(e) => setField("phone2", e.target.value)}
                          placeholder="07 12 34 56 78"
                          data-error={!!errors.phone2}
                          {...aria("checkout-tel2", errors.phone2)}
                          className={`${inputCls(errors.phone2)} pl-10`}
                          autoComplete="tel"
                          maxLength={24}
                        />
                      </div>
                    </InputField>
                    <InputField id="checkout-email" label={ar ? "البريد الإلكتروني" : "E-mail"} error={errors.email}>
                      <div className="relative" dir="ltr">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" aria-hidden />
                        <input
                          id="checkout-email"
                          type="email"
                          inputMode="email"
                          value={form.email}
                          onChange={(e) => setField("email", e.target.value)}
                          placeholder="vous@exemple.com"
                          data-error={!!errors.email}
                          {...aria("checkout-email", errors.email)}
                          className={`${inputCls(errors.email)} pl-10`}
                          autoComplete="email"
                          maxLength={200}
                        />
                      </div>
                    </InputField>
                  </div>

                  {choix.adresseRequise && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField id="checkout-region" label={ar ? "الجهة" : "Région"} error={errors.region}>
                        <input
                          id="checkout-region"
                          type="text"
                          value={form.region}
                          onChange={(e) => setField("region", e.target.value)}
                          placeholder={ar ? "مثال: الدار البيضاء الكبرى" : "ex: Grand Casablanca"}
                          className={inputCls(errors.region)}
                          autoComplete="address-level1"
                          maxLength={120}
                        />
                      </InputField>
                      <InputField id="checkout-code-postal" label={ar ? "الرمز البريدي" : "Code postal"} error={errors.postalCode}>
                        <input
                          id="checkout-code-postal"
                          type="text"
                          inputMode="numeric"
                          value={form.postalCode}
                          onChange={(e) => setField("postalCode", e.target.value)}
                          placeholder={ar ? "مثال: 20000" : "ex: 20000"}
                          className={`${inputCls(errors.postalCode)} max-w-40`}
                          autoComplete="postal-code"
                          maxLength={5}
                        />
                      </InputField>
                    </div>
                  )}

                  <InputField id="checkout-remarque" label={ar ? "ملاحظة لفريقنا" : "Remarque pour notre équipe"}>
                    <textarea
                      id="checkout-remarque"
                      value={form.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      placeholder={placeholderNotes}
                      rows={3}
                      maxLength={1000}
                      className="w-full px-4 py-3 text-base border border-[#E8E4DF] rounded-xl bg-[#FBF8F3] text-[#0F0F0F] placeholder:text-[#6B6B6B]/50 focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40 transition-all resize-none"
                    />
                  </InputField>
                </div>
              </details>

              {/* ── Section 5: Submit ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                {/* Jamais obligatoire : savoir d'où viennent les clients (bouche-à-oreille, statuts WhatsApp…). */}
                <div className="mb-5">
                  <InputField id="checkout-connu-par" label={ar ? "كيف تعرفت على LEBTEX؟" : "Comment avez-vous connu LEBTEX ?"}>
                    <select
                      id="checkout-connu-par"
                      value={form.connuPar}
                      onChange={(e) => setField("connuPar", connuParValide(e.target.value) ?? "")}
                      className={inputCls()}
                    >
                      <option value="">{ar ? "اختر…" : "Choisir…"}</option>
                      {CHOIX_CONNU_PAR.map((c) => (
                        <option key={c.valeur} value={c.valeur}>
                          {ar ? c.ar : c.fr}
                        </option>
                      ))}
                    </select>
                  </InputField>
                </div>

                {/* Gardé seulement sur ce téléphone, après une commande réussie (jamais l'e-mail ni la remarque). */}
                <label className="mb-5 flex min-h-[44px] cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={seSouvenir}
                    onChange={(e) => {
                      seSouvenirRef.current = e.target.checked;
                      setSeSouvenir(e.target.checked);
                    }}
                    className="mt-0.5 w-5 h-5 flex-shrink-0 accent-[#C8102E]"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-[#0F0F0F]">{ar ? "تذكّرني على هذا الهاتف" : "Se souvenir de moi sur ce téléphone"}</span>
                    <span className="block text-xs text-[#6B6B6B] mt-0.5">
                      {ar
                        ? "في المرة القادمة، ستجد اسمك ورقمك ومدينتك وعنوانك جاهزة."
                        : "La prochaine fois, votre nom, votre numéro, votre ville et votre adresse seront déjà remplis."}
                    </span>
                  </span>
                </label>

                {/* Sur téléphone, le récapitulatif vient après le bouton : le total se voit ici avant de valider. */}
                <ResumeAvantValidation subtotal={subtotal} choix={choix} paiement={paiement} />

                {enDifficulte ? (
                  // Réseau lent ou erreur : jamais d'anglais ni de texte technique (le code reste en petit).
                  <div
                    role="alert"
                    className={`rounded-2xl border p-4 ${etatEnvoi === "lent" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}
                  >
                    <p className="font-bold text-[#0F0F0F] flex items-start gap-2">
                      <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${etatEnvoi === "lent" ? "text-amber-700" : "text-red-600"}`} />
                      {etatEnvoi === "lent"
                        ? ar ? "الاتصال بطيء" : "La connexion est lente"
                        : ar ? "لم يُسجَّل طلبك بعد" : "Votre commande n'est pas encore enregistrée"}
                    </p>
                    <p className="text-sm text-[#4A4A4A] mt-1.5 leading-relaxed">
                      {etatEnvoi === "lent"
                        ? ar
                          ? "لم يصلنا طلبك بعد. اضغط على «أعد المحاولة»: لن يُسجَّل طلبك مرتين أبداً. يمكنك أيضاً إرساله لنا عبر واتساب."
                          : "Votre commande n'est pas encore arrivée chez nous. Appuyez sur « Réessayer » : elle ne sera jamais enregistrée deux fois. Vous pouvez aussi nous l'envoyer sur WhatsApp."
                        : ar
                          ? "تحقق من اتصالك بالإنترنت، ثم اضغط على «أعد المحاولة»: لن يُسجَّل طلبك مرتين أبداً. يمكنك أيضاً إرساله لنا عبر واتساب، ونعالجه بنفس الطريقة."
                          : "Vérifiez votre connexion internet, puis appuyez sur « Réessayer » : elle ne sera jamais enregistrée deux fois. Vous pouvez aussi nous l'envoyer sur WhatsApp, nous la traitons de la même façon."}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="submit"
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-bold text-white hover:bg-[#a00d25] transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        {ar ? "أعد المحاولة" : "Réessayer"}
                      </button>
                      <a
                        href={lienSecours}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:bg-[#1da851] transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        {ar ? "أرسل طلبي عبر واتساب" : "Envoyer ma commande sur WhatsApp"}
                      </a>
                    </div>
                    {codeErreur && (
                      <p className="mt-3 text-xs text-[#6B6B6B]">
                        {ar ? "الرمز: " : "Code : "}<bdi dir="ltr">{codeErreur}</bdi>
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={etatEnvoi === "envoi" || lignesSansPrix.length > 0}
                    className="w-full py-4 bg-[#C8102E] hover:bg-[#a00d25] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-[#C8102E]/25 hover:shadow-xl hover:shadow-[#C8102E]/35 hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-3 shop-btn-press shop-font-display text-base"
                  >
                    {etatEnvoi === "envoi" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {ar ? "جاري التأكيد..." : "Validation en cours..."}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        {ar ? "تأكيد طلبي" : "Confirmer ma commande"}
                        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                      </>
                    )}
                  </button>
                )}

                {lignesSansPrix.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-amber-700 text-center">
                    {ar
                      ? "احذف أولاً المنتجات التي سعرها قيد التأكيد (أعلى الصفحة)."
                      : "Retirez d'abord les articles au prix à confirmer (en haut de la page)."}
                  </p>
                )}

                {/* Plus de case à cocher : la phrase suffit, et ne bloque personne. La politique de
                    confidentialité reste à portée de main là où le client donne ses coordonnées (loi 09-08). */}
                <p className="mt-3 text-xs text-[#6B6B6B] text-center leading-relaxed">
                  {ar ? (
                    <>
                      بتأكيد طلبك، فأنت توافق على{" "}
                      <Link href="/shop/conditions" className="text-[#C8102E] underline hover:no-underline">شروط البيع</Link>{" "}
                      و
                      <Link href="/shop/confidentialite" className="text-[#C8102E] underline hover:no-underline">سياسة الخصوصية</Link>{" "}
                      لدينا.
                    </>
                  ) : (
                    <>
                      En confirmant, vous acceptez nos{" "}
                      <Link href="/shop/conditions" className="text-[#C8102E] underline hover:no-underline">conditions de vente</Link>{" "}
                      et notre{" "}
                      <Link href="/shop/confidentialite" className="text-[#C8102E] underline hover:no-underline">politique de confidentialité</Link>.
                    </>
                  )}
                </p>

                <div className="flex items-center justify-center gap-4 mt-4">
                  <Shield className="w-4 h-4 text-[#D4A843]" />
                  <p className="text-xs text-[#6B6B6B] text-center">
                    {ar ? (
                      <>
                        طلب آمن · {paiement === "carte" ? "الدفع بالبطاقة" : "لا تدفع شيئاً الآن"} ·{" "}
                        <Link href="/shop/conditions" className="underline hover:text-[#C8102E]">إرجاع خلال 14 يوماً (ما عدا القماش المقصوص)</Link>
                      </>
                    ) : (
                      <>
                        Commande sécurisée · {paiement === "carte" ? "Paiement par carte" : "Rien à payer maintenant"} ·{" "}
                        <Link href="/shop/conditions" className="underline hover:text-[#C8102E]">Retour sous 14 jours (sauf tissu coupé)</Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Right: Order Summary (40%) ── */}
            <div className="lg:col-span-2">
              <div className="sticky top-24">
                <SummaryPanel
                  items={items}
                  subtotal={subtotal}
                  productQtyMap={productQtyMap}
                  choix={choix}
                  paiement={paiement}
                />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
