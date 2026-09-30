"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ShoppingBag,
  Truck,
  User,
  MapPin,
  Phone,
  Mail,
  FileText,
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
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";

import {
  useShopCart,
  getCartItemUnitPrice,
  groupCartItemsByProduct,
  summarizeCartProduct,
} from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import {
  formatPrice,
  formatPriceOrOnRequest,
  generateOrderNumber,
  MOROCCAN_CITIES,
} from "@/lib/shop-utils";
import {
  FRAIS_ZONE,
  TEXTE_TRANSPORT_VOLUMINEUX,
  commandeVolumineuse,
  delaiColis,
  estCasablanca,
  estPeripherieCasablanca,
  fraisLivraison,
  libelleFrais,
  lieuRetraitPour,
  modesPossibles,
} from "@/lib/livraison-boutique";
import { PLAFOND_ESPECES_COLIS } from "@/lib/commandes-boutique";
import { useReglagesReception } from "@/lib/use-reglages-reception";
import type { ReglagesReception } from "@/lib/reglages-reception";
import type {
  LieuRetrait,
  ModeReception,
  MoyenPaiement,
  ReceptionCommande,
  ShippingAddress,
} from "@/lib/shop-types";

// ─── Firebase init ────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Valeur de la liste des villes quand le client écrit lui-même sa ville.
const AUTRE_VILLE = "__autre__";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormData {
  firstName: string;
  lastName: string;
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
  acceptTerms: boolean;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

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
  reglages: ReglagesReception
): ChoixReception {
  const ville = villeSaisie(form);
  const lieuRetrait = lieuRetraitPour(volumineux);
  const modes = modesPossibles(volumineux).filter(
    (m) => m !== "retrait" || reglages.lieux[lieuRetrait].actif
  );
  // Petits articles : « à domicile » coché d'office, comme avant. Volumineux : le client
  // choisit lui-même entre retrait et transport, les deux ne demandent pas la même chose.
  const mode: ModeReception | null = modes.includes(form.mode as ModeReception)
    ? (form.mode as ModeReception)
    : !volumineux && modes.length > 0
      ? modes[0]
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
function prixFrais(frais: number | null): string {
  return frais === null || !Number.isFinite(frais) || frais < 0
    ? libelleFrais(null)
    : frais === 0 ? libelleFrais(0) : formatPrice(frais);
}

/** Libellé de l'option « espèces », dit dans les mots du mode choisi. */
function libelleEspeces(choix: ChoixReception): { titre: string; texte: string } {
  if (choix.mode === "retrait") {
    return { titre: "Espèces au retrait", texte: "Vous payez au magasin, au moment du retrait. Rien à payer maintenant." };
  }
  if (choix.mode === "transport") {
    return choix.preferenceTransport === "camionnette"
      ? { titre: "Espèces à la livraison", texte: "Vous payez notre chauffeur LEBTEX à la livraison. Rien à payer maintenant." }
      : { titre: "Espèces à la réception", texte: "Nous convenons avec vous, au téléphone, du moment du paiement. Rien à payer maintenant." };
  }
  if (choix.mode === "domicile") {
    return { titre: "Espèces à la livraison", texte: "Vous payez le livreur à la réception. Rien à payer maintenant." };
  }
  return { titre: "Espèces à la livraison ou au retrait", texte: "Rien à payer maintenant." };
}

// ─── Progress Steps ───────────────────────────────────────────────────────────
function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { label: "Panier", num: 1 },
    { label: "Livraison", num: 2 },
    { label: "Confirmation", num: 3 },
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
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}
function InputField({ label, required, error, children }: InputFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#0F0F0F] mb-1.5">
        {label}
        {required && <span className="text-[#C8102E] ml-1">*</span>}
        {!required && <span className="text-[#6B6B6B] text-xs ml-1.5">(optionnel)</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

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
  prix?: string;
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
function validate(form: FormData, choix: ChoixReception): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = "Le prénom est requis";
  if (!form.lastName.trim()) errors.lastName = "Le nom est requis";
  if (!form.phone.trim()) {
    errors.phone = "Le téléphone est requis";
  } else if (!/^(06|07)\d{8}$/.test(form.phone.replace(/[\s\-]/g, ""))) {
    errors.phone = "Format invalide — commencez par 06 ou 07 (10 chiffres)";
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Adresse email invalide";
  }
  // Retrait au magasin : la ville ne change ni les frais ni le lieu, elle devient facultative.
  if (!form.city && choix.mode !== "retrait") errors.city = "La ville est requise";
  else if (form.city === AUTRE_VILLE && !form.villeAutre.trim()) errors.villeAutre = "Écrivez le nom de votre ville";
  if (!choix.mode) errors.mode = "Choisissez comment recevoir votre commande";
  if (choix.adresseRequise && !form.address.trim()) errors.address = "L'adresse est requise pour la livraison";
  if (!form.acceptTerms) errors.acceptTerms = "Vous devez accepter les conditions";
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

function calculerTotaux(choix: ChoixReception, subtotal: number, paiement: MoyenPaiement): Totaux {
  const { ville, mode, frais, fraisConnus, volumineux } = choix;
  const titreLigne =
    mode === "retrait" ? "Retrait" : mode === "transport" ? "Transport" : `Livraison${ville ? ` — ${ville}` : ""}`;
  const valeurLigne = !mode
    ? volumineux ? "Selon le mode choisi" : "Selon la ville"
    : mode === "retrait"
      ? "Gratuit"
      : !fraisConnus
        ? "Selon la ville"
        : prixFrais(frais);
  const legendeTotal =
    mode === "transport"
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

/** Sous-total, frais et total : le client les voit juste avant « Confirmer ma commande ». */
function ResumeAvantValidation({ subtotal, choix, paiement }: { subtotal: number; choix: ChoixReception; paiement: MoyenPaiement }) {
  const { language } = useLanguage();
  const t = calculerTotaux(choix, subtotal, paiement);
  return (
    <div className="lg:hidden mb-5 rounded-2xl border border-[#E8E4DF] bg-[#FBF8F3] px-4 py-3 space-y-2" aria-label="Résumé de la commande">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[#6B6B6B]">Sous-total</span>
        <span className="font-semibold text-[#0F0F0F] tabular-nums">{formatPriceOrOnRequest(subtotal, language)}</span>
      </div>
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="text-[#6B6B6B]">{t.titreLigne}</span>
        <span className={`font-semibold text-right ${choix.mode === "retrait" ? "text-green-700" : "text-[#0F0F0F]"}`}>{t.valeurLigne}</span>
      </div>
      <div className="border-t border-[#E8E4DF] pt-2 flex items-start justify-between gap-3">
        <span className="font-bold text-[#0F0F0F]">Total</span>
        <div className="text-right">
          <span className="font-bold text-[#C8102E] text-lg tabular-nums">{formatPriceOrOnRequest(subtotal > 0 ? t.total : 0, language)}</span>
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
  const { ville, mode, frais, fraisConnus } = choix;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const hasUnpricedItems = items.some((item) => getCartItemUnitPrice(item, productQtyMap?.[item.productId] || item.quantity) <= 0);
  const { titreLigne, valeurLigne, total, legendeTotal } = calculerTotaux(choix, subtotal, paiement);

  const rassurance =
    paiement === "carte"
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
          Votre commande / طلبيتك
        </h2>
        <p className="text-gray-400 text-xs mt-0.5">
          {itemCount} article{itemCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* Items — un bloc par produit, ses variantes résumées en dessous */}
      <div className="divide-y divide-[#E8E4DF] max-h-72 overflow-y-auto shop-scrollbar">
        {groupCartItemsByProduct(items).map(({ productId, items: productItems }) => {
          const first = productItems[0];
          const productTotalQty = productQtyMap?.[productId] || first.quantity;
          const { total: productTotal } = summarizeCartProduct(productItems, productTotalQty);
          const variantsSummary = productItems
            .filter((item) => item.variant)
            .map((item) => {
              const label = [item.variant?.model, item.variant?.size, item.variant?.color].filter(Boolean).join(" ");
              return `${label || "Standard"} ×${item.quantity}`;
            })
            .join(" · ");

          return (
            <div key={productId} className="flex gap-3 px-5 py-3">
              {/* Thumb */}
              <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]">
                {first.productImage ? (
                  <Image
                    src={first.productImage}
                    alt={first.productName}
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
                <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[1.25rem] bg-[#C8102E] text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {productTotalQty}
                </span>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#0F0F0F] truncate">{first.productName}</p>
                {variantsSummary && (
                  <p className="text-xs text-[#6B6B6B] mt-0.5 line-clamp-2" title={variantsSummary}>
                    {variantsSummary}
                  </p>
                )}
                {first.volumineux && (
                  <p className="text-xs font-semibold text-amber-700 mt-0.5">Article volumineux</p>
                )}
              </div>
              <span className="text-xs font-bold text-[#0F0F0F] flex-shrink-0 tabular-nums">
                {formatPriceOrOnRequest(productTotal, language)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="px-5 py-4 border-t border-[#E8E4DF] space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6B6B6B]">Sous-total</span>
          <span className="font-semibold text-[#0F0F0F] tabular-nums">{formatPriceOrOnRequest(subtotal, language)}</span>
        </div>
        {subtotal > 0 && hasUnpricedItems && (
          <p className="text-xs text-[#6B6B6B] -mt-1.5">
            {language === 'ar' ? 'لا يشمل المنتجات حسب الطلب' : 'Hors articles sur demande'}
          </p>
        )}
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-[#6B6B6B] flex items-center gap-1.5">
            {mode === "retrait" ? <Store className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
            {titreLigne}
          </span>
          <span
            className={`font-semibold text-right ${
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
              Délai estimé
            </span>
            <span className="font-medium text-[#0F0F0F]">{delaiColis(ville)}</span>
          </div>
        )}
        <div className="border-t border-[#E8E4DF] pt-2.5 flex items-center justify-between">
          <span className="font-bold text-[#0F0F0F]">Total</span>
          <div className="text-right">
            <span className="font-bold text-[#C8102E] text-xl shop-font-display tabular-nums">
              {formatPriceOrOnRequest(subtotal > 0 ? total : 0, language)}
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

// ─── Main Checkout Page ───────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart, productQtyMap } = useShopCart();
  const { reglages } = useReglagesReception();
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
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
    acceptTerms: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const volumineux = useMemo(() => commandeVolumineuse(items), [items]);
  const choix = useMemo(
    () => calculerChoix(form, volumineux, reglages),
    [form, volumineux, reglages]
  );
  // Un moyen de paiement retiré des réglages entre-temps retombe sur les espèces.
  const paiement: MoyenPaiement =
    (form.paiement === "virement" && !reglages.virement.actif) || (form.paiement === "carte" && !reglages.carte.actif)
      ? "cod"
      : form.paiement;
  const lieu = reglages.lieux[choix.lieuRetrait];
  const especes = libelleEspeces(choix);
  const totalConnu = subtotal + (choix.fraisConnus && choix.frais !== null ? choix.frais : 0);

  // Redirect if cart empty
  useEffect(() => {
    if (items.length === 0 && !orderSuccess) {
      router.replace("/shop/panier");
    }
  }, [items.length, router, orderSuccess]);

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validate(form, choix);
      const mode = choix.mode;
      if (Object.keys(validationErrors).length > 0 || !mode) {
        setErrors(validationErrors);
        // Scroll to first error
        setTimeout(() => {
          const firstErrorEl = document.querySelector('[data-error="true"]');
          firstErrorEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
        return;
      }

      setIsSubmitting(true);

      try {
        // Transport d'un rouleau : prix donné au téléphone, la commande part à 0 et
        // l'équipe l'ajoute après l'accord du client.
        const deliveryFee = choix.frais ?? 0;
        const total = subtotal + deliveryFee;
        const orderNumber = generateOrderNumber();

        const reception: ReceptionCommande = {
          mode,
          volumineux: choix.volumineux,
          ...(mode === "retrait" ? { lieuRetrait: choix.lieuRetrait } : {}),
          ...(mode === "transport" ? { preferenceTransport: choix.preferenceTransport } : {}),
        };

        const shippingAddress: ShippingAddress = {
          fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          phone: form.phone.trim(),
          ...(form.phone2.trim() ? { phone2: form.phone2.trim() } : {}),
          address: form.address.trim(),
          city: choix.ville,
          ...(form.region.trim() ? { region: form.region.trim() } : {}),
          ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
        };

        // Sanitize phone: remove spaces and dashes for consistent lookup
        const cleanPhone = form.phone.trim().replace(/[\s\-]/g, '');

        const docRef = await addDoc(collection(db, "shop_orders"), {
          orderNumber,
          customerName: shippingAddress.fullName,
          customerPhone: cleanPhone,
          customerEmail: form.email.trim() || null,
          shippingAddress,
          items: items.map((item) => {
            // Clean undefined values from variant object as Firestore does not support them
            const cleanVariant = item.variant
              ? Object.fromEntries(Object.entries(item.variant).filter(([_, v]) => v !== undefined))
              : null;

            return {
              productId: item.productId || 'unknown',
              productName: item.productName || 'Produit',
              productImage: item.productImage || '/placeholder.png',
              price: item.price || 0,
              // Prix réellement facturé (prix de gros compris), calculé comme le
              // sous-total du panier : somme(unitPrice × quantité) = subtotal.
              unitPrice: Number(getCartItemUnitPrice(item, productQtyMap[item.productId])) || 0,
              quantity: item.quantity || 1,
              variant: cleanVariant && Object.keys(cleanVariant).length > 0 ? cleanVariant : null,
              maxStock: item.maxStock ?? 99,
              // L'équipe voit quelle ligne est un rouleau entier (préparé à CHRIFA).
              ...(item.volumineux ? { volumineux: true } : {}),
            };
          }),
          subtotal: subtotal || 0,
          deliveryFee: deliveryFee || 0,
          total: total || 0,
          paymentMethod: paiement,
          reception,
          status: "pending",
          notes: form.notes.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Save customer info for auto-tracking on suivi page
        // Isolated try/catch: localStorage failure must NOT crash the checkout
        try {
          localStorage.setItem('lebtex_customer_phone', cleanPhone);
          localStorage.setItem('lebtex_last_order_id', docRef.id);
          localStorage.setItem('lebtex_last_order_number', orderNumber);
        } catch { /* ignore localStorage errors (private browsing, quota) */ }

        // Prévient le commerçant par e-mail. Sans await et sans suite en cas
        // d'échec : l'alerte ne doit jamais retarder ni faire échouer la commande.
        // keepalive laisse partir la requête même si la page change aussitôt.
        fetch('/api/shop/commandes/alerte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: docRef.id }),
          keepalive: true,
        }).catch(() => {});

        // IMPORTANT: redirect FIRST, then clear cart
        // If we clearCart first, items.length === 0 causes the component to unmount before navigation
        setOrderSuccess(true);
        clearCart();
        router.push(`/shop/confirmation/${docRef.id}`);
      } catch (err: any) {
        console.error("Erreur Checkout:", err);
        setSubmitError(
          `Erreur (${err?.code || 'Inconnue'}): ${err?.message || "Veuillez réessayer ou nous contacter sur WhatsApp."}`
        );
        setIsSubmitting(false);
      }
    },
    [form, choix, paiement, items, subtotal, productQtyMap, clearCart, router]
  );

  if (items.length === 0 && !orderSuccess) return null;

  // Texte de l'option transport : ce qui se passe dépend de la ville.
  const texteTransport = !choix.ville
    ? "Choisissez d'abord votre ville."
    : choix.preferenceTransport === "camionnette"
      ? reglages.camionnette.actif
        ? `Notre camionnette LEBTEX vous livre au pied de l'immeuble. Tournées : ${reglages.camionnette.jours}.`
        : "Livraison à votre adresse, organisée avec vous au téléphone."
      : `Notre transporteur habituel livre la marchandise à son dépôt, à ${choix.ville}. Vous la récupérez à ce dépôt : nous vous donnons son adresse au téléphone.`;

  const placeholderNotes =
    choix.mode === "retrait"
      ? "Ex : je passerai samedi matin"
      : choix.mode === "transport"
        ? "Ex : meilleur moment pour vous appeler"
        : "Ex : livrer après 18h, sonnez au 2ème étage";

  return (
    <div className="min-h-screen bg-[#FBF8F3]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E8E4DF] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/shop/panier"
              aria-label="Retour au panier"
              className="-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-2 text-sm text-[#6B6B6B] hover:text-[#C8102E] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Retour au panier</span>
            </Link>
            <span className="hidden sm:inline text-[#E8E4DF]" aria-hidden>|</span>
            <h1 className="text-lg font-bold text-[#0F0F0F] shop-font-display min-w-0">
              <span className="sm:hidden">Commande</span>
              <span className="hidden sm:inline">Finaliser la commande / إنهاء الطلب</span>
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

              {/* ── Section 1: Personal Info ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<User className="w-4 h-4" />}
                  title="Informations personnelles / المعلومات الشخصية"
                  subtitle="Vos coordonnées pour le suivi de commande"
                />
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InputField label="Prénom" required error={errors.firstName}>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setField("firstName", e.target.value)}
                        placeholder="Yassine"
                        data-error={!!errors.firstName}
                        className={inputCls(errors.firstName)}
                        autoComplete="given-name"
                      />
                    </InputField>
                    <InputField label="Nom" required error={errors.lastName}>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setField("lastName", e.target.value)}
                        placeholder="El Idrissi"
                        data-error={!!errors.lastName}
                        className={inputCls(errors.lastName)}
                        autoComplete="family-name"
                      />
                    </InputField>
                  </div>

                  <InputField
                    label="Téléphone principal"
                    required
                    error={errors.phone}
                  >
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                        <span className="text-sm">🇲🇦</span>
                        <span className="text-xs text-[#6B6B6B] font-medium">+212</span>
                      </div>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        placeholder="06 XX XX XX XX"
                        data-error={!!errors.phone}
                        className={`${inputCls(errors.phone)} pl-[4.5rem]`}
                        autoComplete="tel"
                        maxLength={14}
                      />
                    </div>
                  </InputField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Téléphone secondaire" error={errors.phone2}>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" />
                        <input
                          type="tel"
                          value={form.phone2}
                          onChange={(e) => setField("phone2", e.target.value)}
                          placeholder="07 XX XX XX XX"
                          className={`${inputCls(errors.phone2)} pl-10`}
                          autoComplete="tel"
                          maxLength={14}
                        />
                      </div>
                    </InputField>
                    <InputField label="Email" error={errors.email}>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setField("email", e.target.value)}
                          placeholder="vous@exemple.com"
                          className={`${inputCls(errors.email)} pl-10`}
                          autoComplete="email"
                        />
                      </div>
                    </InputField>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Réception (ville, mode, adresse) ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<MapPin className="w-4 h-4" />}
                  title="Réception de la commande / استلام الطلب"
                  subtitle="Votre ville, puis la façon de recevoir votre commande"
                />
                <div className="space-y-5">
                  {choix.volumineux && (
                    <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                      <Info className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-[#2A2A2A] leading-relaxed">{TEXTE_TRANSPORT_VOLUMINEUX}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Ville / المدينة" required={choix.mode !== "retrait"} error={errors.city}>
                      <select
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                        data-error={!!errors.city}
                        className={inputCls(errors.city)}
                        autoComplete="address-level2"
                      >
                        <option value="">Sélectionner une ville...</option>
                        {MOROCCAN_CITIES.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                        <option value={AUTRE_VILLE}>Autre ville (écrivez-la)</option>
                      </select>
                    </InputField>
                    {form.city === AUTRE_VILLE && (
                      <InputField label="Votre ville" required error={errors.villeAutre}>
                        <input
                          type="text"
                          value={form.villeAutre}
                          onChange={(e) => setField("villeAutre", e.target.value)}
                          placeholder="ex : Sidi Bennour"
                          data-error={!!errors.villeAutre}
                          className={inputCls(errors.villeAutre)}
                          autoComplete="address-level2"
                          maxLength={60}
                        />
                      </InputField>
                    )}
                  </div>

                  <fieldset data-error={!!errors.mode}>
                    <legend className="block text-sm font-medium text-[#0F0F0F] mb-2">
                      Comment voulez-vous recevoir votre commande ?
                      <span className="text-[#C8102E] ml-1">*</span>
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
                              titre="À domicile par Sendit"
                              prix={prixConnu ? prixFrais(fraisDomicile) : `${formatPrice(FRAIS_ZONE.casablanca)} à ${formatPrice(FRAIS_ZONE.eloignee)}`}
                            >
                              <p>
                                Livraison à votre adresse{prixConnu ? `, sous ${delaiColis(choix.ville)}` : ", prix selon la ville"}.
                                {" "}{paiement === "cod" ? "Vous payez à la réception : le" : "Le"} colis ne s&apos;ouvre pas avant le paiement.
                              </p>
                              {/* Plan §3.1 : Sendit facture plus cher quelques quartiers excentrés ; on le dit avant l'appel. */}
                              {prixConnu && estCasablanca(choix.ville) && (
                                <p className="text-xs text-[#6B6B6B]">
                                  {formatPrice(FRAIS_ZONE.eloignee)} dans quelques zones éloignées de Casablanca, confirmé à l&apos;appel.
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
                              titre={`Retrait gratuit à ${lieu.nom}`}
                              prix="Gratuit"
                              prixGratuit
                            >
                              <p>{lieu.adresse} · {lieu.horaires}.</p>
                              <p>L&apos;adresse exacte et le jour vous sont confirmés par WhatsApp.</p>
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
                            titre="Livraison / transport"
                            prix={prixFrais(null)}
                          >
                            <p>{texteTransport}</p>
                            <p>Nous vous appelons avec le prix du transport : rien ne part avant votre accord.</p>
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

                  {choix.adresseRequise && (
                    <>
                      <InputField label="Adresse complète / العنوان الكامل" required error={errors.address}>
                        <input
                          type="text"
                          value={form.address}
                          onChange={(e) => setField("address", e.target.value)}
                          placeholder="N° X, Rue ..., Quartier ..."
                          data-error={!!errors.address}
                          className={inputCls(errors.address)}
                          autoComplete="street-address"
                        />
                      </InputField>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField label="Région / الجهة" error={errors.region}>
                          <input
                            type="text"
                            value={form.region}
                            onChange={(e) => setField("region", e.target.value)}
                            placeholder="ex: Grand Casablanca"
                            className={inputCls(errors.region)}
                            autoComplete="address-level1"
                          />
                        </InputField>
                        <InputField label="Code postal / الرمز البريدي" error={errors.postalCode}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.postalCode}
                            onChange={(e) => setField("postalCode", e.target.value)}
                            placeholder="ex: 20000"
                            className={`${inputCls(errors.postalCode)} max-w-40`}
                            autoComplete="postal-code"
                            maxLength={5}
                          />
                        </InputField>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Section 3: Payment ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<ShieldCheck className="w-4 h-4" />}
                  title="Paiement / الدفع"
                  subtitle="Choisissez ce qui vous arrange"
                />
                <fieldset className="space-y-3">
                  <legend className="sr-only">Moyen de paiement</legend>
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
                      titre="Virement bancaire"
                    >
                      <p>
                        Notre RIB s&apos;affiche après la commande. Mettez votre numéro de commande en motif du
                        virement. Nous vous confirmons la réception par WhatsApp.
                      </p>
                    </OptionCarte>
                  )}
                  {reglages.carte.actif && (
                    <OptionCarte
                      name="paiement"
                      checked={paiement === "carte"}
                      onSelect={() => setField("paiement", "carte")}
                      icone={<CreditCard className="w-4 h-4" />}
                      titre="Carte bancaire"
                    >
                      <p>Paiement en ligne sécurisé : nous vous envoyons le lien après notre appel de confirmation.</p>
                    </OptionCarte>
                  )}
                </fieldset>

                {/* Plafond d'espèces d'un colis Sendit (règle validée le 29/09/2026) : on prévient,
                    on propose le virement, on n'impose rien. */}
                {choix.mode === "domicile" && paiement === "cod" && totalConnu > PLAFOND_ESPECES_COLIS && (
                  <div className="mt-4 flex gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[#4A4A4A] leading-relaxed">
                      Au-delà de {formatPrice(PLAFOND_ESPECES_COLIS)} d&apos;espèces pour un colis, nous vous proposons au
                      téléphone la solution la plus simple (virement, retrait gratuit ou autre arrangement)
                      {reglages.virement.actif ? " ; vous pouvez aussi choisir le virement dès maintenant." : "."}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Section 4: Notes ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<FileText className="w-4 h-4" />}
                  title="Notes de commande"
                  subtitle="Une précision pour notre équipe ?"
                />
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder={placeholderNotes}
                  rows={3}
                  className="w-full px-4 py-3 text-base border border-[#E8E4DF] rounded-xl bg-[#FBF8F3] text-[#0F0F0F] placeholder:text-[#6B6B6B]/50 focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40 transition-all resize-none"
                />
              </div>

              {/* ── Section 5: Terms + Submit ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                {/* Terms checkbox */}
                <label
                  className={`flex items-start gap-3 cursor-pointer group mb-6 ${
                    errors.acceptTerms ? "text-red-600" : ""
                  }`}
                  data-error={!!errors.acceptTerms}
                >
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={form.acceptTerms}
                      onChange={(e) => setField("acceptTerms", e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                        form.acceptTerms
                          ? "bg-[#C8102E] border-[#C8102E]"
                          : errors.acceptTerms
                          ? "border-red-400 bg-red-50"
                          : "border-[#E8E4DF] bg-[#FBF8F3] group-hover:border-[#C8102E]/40"
                      }`}
                    >
                      {form.acceptTerms && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>
                  <span className={`text-sm leading-relaxed ${errors.acceptTerms ? "text-red-600" : "text-[#6B6B6B]"}`}>
                    J&apos;accepte les{" "}
                    <Link href="/shop/conditions" className="text-[#C8102E] underline hover:no-underline">
                      conditions générales de vente
                    </Link>{" "}
                    et la{" "}
                    <Link href="/shop/confidentialite" className="text-[#C8102E] underline hover:no-underline">
                      politique de confidentialité
                    </Link>{" "}
                    de LEBTEX.
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p className="text-xs text-red-500 -mt-4 mb-4 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.acceptTerms}
                  </p>
                )}

                {/* Sur téléphone, le récapitulatif vient après le bouton : le total se voit ici avant de valider. */}
                <ResumeAvantValidation subtotal={subtotal} choix={choix} paiement={paiement} />

                {/* Submit error */}
                {submitError && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 leading-relaxed">{submitError}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-[#C8102E] hover:bg-[#a00d25] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-[#C8102E]/25 hover:shadow-xl hover:shadow-[#C8102E]/35 hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-3 shop-btn-press shop-font-display text-base"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Validation en cours...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Confirmer ma commande
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-4 mt-4">
                  <Shield className="w-4 h-4 text-[#D4A843]" />
                  <p className="text-xs text-[#6B6B6B] text-center">
                    Commande sécurisée · {paiement === "carte" ? "Paiement par carte" : "Rien à payer maintenant"} ·{" "}
                    <Link href="/shop/conditions" className="underline hover:text-[#C8102E]">Retour sous 14 jours (sauf tissu coupé)</Link>
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
