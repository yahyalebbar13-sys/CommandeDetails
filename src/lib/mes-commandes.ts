// ─── Faire revenir les pros : mes commandes, commander la même chose, suivi ──
// Trois outils de la boutique, purs (ni Firebase ni React) sauf la petite liste gardée
// dans le navigateur (localStorage, toujours sous try/catch) :
//   1. « Mes commandes sur ce téléphone » : les 20 dernières commandes passées ici
//      (identifiant, n°, date, total), écrites par le checkout et relues par /shop/suivi ;
//   2. « Commander la même chose » : les lignes d'une ancienne commande remises au panier
//      AU PRIX DU JOUR (catalogue actuel), même variante si elle existe encore, et la liste
//      de ce qui n'est plus disponible ;
//   3. le suivi depuis un autre téléphone (/api/shop/suivi) : n° et téléphone remis d'aplomb,
//      la commande n'est rendue que si LES DEUX correspondent (jamais par téléphone seul), et la
//      réponse ne garde que le minimum : ni adresse, ni notes, ni nom du transporteur.
// Testé par le script tsx du chantier (scratchpad).

import type {
  CartItem, LieuRetrait, ModeReception, MoyenPaiement, OrderStatus, ProductVariant, ShopProduct,
} from './shop-types';
import { ORDER_STATUS_LABELS } from './shop-types';
import type { Language } from './translations';
import { normaliserTelephoneMaroc, chiffresLatins } from './telephone-maroc';
import {
  dateDe, fraisColisAnnonces, moyenPaiementDe, prixUnitaireLigne, receptionDe, texteClientSur, transportPrevu,
} from './commandes-boutique';
import {
  DIMENSIONS, cleDe, construireCartItem, norm, sansPrix, variantIdPanier, variantesAchetables,
} from './shop-variantes';

// ─── 1. Mes commandes sur ce téléphone ───────────────────────────────────────

export interface CommandeLocale {
  /** Identifiant du document shop_orders : lien /shop/confirmation/{id}. */
  id: string;
  /** « LBT-… » ('' si inconnu). */
  numero: string;
  /** Date en millisecondes ; 0 = inconnue (commande d'avant cette liste). */
  date: number;
  /** Total en MAD ; 0 = inconnu ou à confirmer. */
  total: number;
}

export const CLE_MES_COMMANDES = 'lebtex_mes_commandes_v1';
export const MAX_MES_COMMANDES = 20;
// Ce que le checkout gardait avant cette liste : la dernière commande seulement.
const ANCIEN_ID = 'lebtex_last_order_id';
const ANCIEN_NUMERO = 'lebtex_last_order_number';
/** Identifiant de document Firestore (20 caractères d'ordinaire). */
const ID_COMMANDE = /^[A-Za-z0-9]{10,40}$/;

function commandeLocale(x: unknown): CommandeLocale | null {
  const o = x as Partial<Record<keyof CommandeLocale, unknown>> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !ID_COMMANDE.test(o.id)) return null;
  const date = Number(o.date);
  const total = Number(o.total);
  return {
    id: o.id,
    numero: normaliserNumeroCommande(o.numero) ?? '',
    date: Number.isFinite(date) && date > 0 ? date : 0,
    total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0,
  };
}

/** La liste relue d'un texte JSON : entrées valables, sans doublon, la plus récente d'abord, 20 au plus. */
export function lireListeCommandes(brut: string | null | undefined): CommandeLocale[] {
  let donnees: unknown;
  try {
    donnees = JSON.parse(brut || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(donnees)) return [];
  const vus = new Set<string>();
  const liste: CommandeLocale[] = [];
  for (const x of donnees) {
    const c = commandeLocale(x);
    if (c && !vus.has(c.id)) {
      vus.add(c.id);
      liste.push(c);
    }
  }
  // Tri stable : à date égale (ou inconnue), l'ordre gardé reste.
  return liste.sort((a, b) => b.date - a.date).slice(0, MAX_MES_COMMANDES);
}

/** La nouvelle commande en tête ; la même commande n'apparaît qu'une fois. */
export function ajouterALaListe(liste: CommandeLocale[], c: CommandeLocale): CommandeLocale[] {
  return [c, ...liste.filter(x => x.id !== c.id)].slice(0, MAX_MES_COMMANDES);
}

function stockage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // stockage refusé (navigation privée, réglages)
  }
}

/** Les commandes gardées sur ce téléphone ; à défaut, la dernière commande d'avant cette liste. */
export function lireMesCommandes(): CommandeLocale[] {
  const s = stockage();
  if (!s) return [];
  try {
    const liste = lireListeCommandes(s.getItem(CLE_MES_COMMANDES));
    if (liste.length > 0) return liste;
    const ancienne = commandeLocale({ id: s.getItem(ANCIEN_ID), numero: s.getItem(ANCIEN_NUMERO) });
    return ancienne ? [ancienne] : [];
  } catch {
    return [];
  }
}

/** Appelé par le checkout quand la commande est arrivée. Jamais bloquant. */
export function enregistrerCommande(c: CommandeLocale): void {
  const propre = commandeLocale(c);
  const s = stockage();
  if (!propre || !s) return;
  try {
    s.setItem(CLE_MES_COMMANDES, JSON.stringify(ajouterALaListe(lireMesCommandes(), propre)));
  } catch { /* stockage plein ou refusé : la commande est passée quand même */ }
}

/** « Ce n'est pas moi » (checkout) ou « Effacer de ce téléphone » (suivi). Les commandes restent chez LEBTEX. */
export function effacerMesCommandes(): void {
  const s = stockage();
  if (!s) return;
  try {
    s.removeItem(CLE_MES_COMMANDES);
    s.removeItem(ANCIEN_ID);
    s.removeItem(ANCIEN_NUMERO);
  } catch { /* rien n'était gardé */ }
}

// ─── 2. Commander la même chose ──────────────────────────────────────────────

/** Une ligne d'une ancienne commande, telle qu'enregistrée (ou rendue par /api/shop/suivi). */
export interface LigneARecommander {
  productId: string;
  productName?: string;
  productNameAr?: string;
  variant?: CartItem['variant'] | null;
  quantity: number;
}

/**
 * Pourquoi une ligne ne repart pas au panier :
 * retire (plus en vente, ou sans prix donc masqué), sans_prix (la variante n'a plus de prix),
 * rupture, variante (le choix taille / couleur n'existe plus), a_choisir (aucun choix
 * enregistré alors que le produit en demande un).
 */
export type RaisonIndisponible = 'retire' | 'sans_prix' | 'rupture' | 'variante' | 'a_choisir';

export interface LigneIndisponible {
  ligne: LigneARecommander;
  raison: RaisonIndisponible;
  /** Le produit du jour quand il existe encore : la fiche permet de choisir autre chose. */
  produit?: ShopProduct;
}

export interface ResultatRecommande {
  /** Lignes prêtes pour addItems, au prix et au nom du jour. */
  aAjouter: CartItem[];
  indisponibles: LigneIndisponible[];
  /** Quantité ramenée au stock connu (comme la fiche et le panier le font). */
  reduites: { ligne: LigneARecommander; quantite: number }[];
}

type VarianteTrouvee =
  | { cas: 'ok'; variante: ProductVariant | null }
  | { cas: 'variante' }
  | { cas: 'a_choisir' };

function aUnChoix(v?: CartItem['variant'] | null): v is NonNullable<CartItem['variant']> {
  return !!v && (DIMENSIONS.some(d => norm(v[d])) || !!String(v.variantId ?? '').trim());
}

/** La variante du jour qui correspond au choix d'hier : même identifiant, sinon même modèle · taille · couleur. */
function varianteDuJour(produit: ShopProduct, v?: CartItem['variant'] | null): VarianteTrouvee {
  const achetables = variantesAchetables(produit.variants);
  if (!aUnChoix(v)) {
    if (achetables.length === 0) return { cas: 'ok', variante: null };
    if (achetables.length === 1) return { cas: 'ok', variante: achetables[0] };
    return { cas: 'a_choisir' };
  }
  const id = String(v.variantId ?? '').trim();
  const parId = id ? achetables.find(x => variantIdPanier(x) === id) : undefined;
  if (parId) return { cas: 'ok', variante: parId };
  const cle = DIMENSIONS.map(d => norm(v[d])).join('|');
  const parChoix = cle.replace(/\|/g, '') ? achetables.find(x => DIMENSIONS.map(d => cleDe(x, d)).join('|') === cle) : undefined;
  return parChoix ? { cas: 'ok', variante: parChoix } : { cas: 'variante' };
}

/**
 * Les lignes d'une ancienne commande, remises d'aplomb pour le panier d'aujourd'hui.
 * `produitDuJour` : le catalogue de la boutique (useShopProducts().getProductById), qui ne
 * contient plus les produits retirés ni ceux sans prix.
 */
export function recommander(
  lignes: readonly LigneARecommander[] | null | undefined,
  produitDuJour: (id: string) => ShopProduct | undefined,
): ResultatRecommande {
  const resultat: ResultatRecommande = { aAjouter: [], indisponibles: [], reduites: [] };
  for (const ligne of Array.isArray(lignes) ? lignes : []) {
    if (!ligne || typeof ligne !== 'object') continue;
    const produit = typeof ligne.productId === 'string' ? produitDuJour(ligne.productId) : undefined;
    if (!produit) {
      resultat.indisponibles.push({ ligne, raison: 'retire' });
      continue;
    }
    if (sansPrix(produit)) {
      resultat.indisponibles.push({ ligne, raison: 'sans_prix', produit });
      continue;
    }
    if (produit.inStock === false) {
      resultat.indisponibles.push({ ligne, raison: 'rupture', produit });
      continue;
    }
    const trouvee = varianteDuJour(produit, ligne.variant);
    if (trouvee.cas !== 'ok') {
      resultat.indisponibles.push({ ligne, raison: trouvee.cas, produit });
      continue;
    }
    const demandee = Math.max(1, Math.round((Number(ligne.quantity) || 1) * 100) / 100);
    // Plafond de la fiche : le stock connu, jamais sous le minimum de commande ; 0 = sur commande.
    const stock = trouvee.variante ? Number(trouvee.variante.stock) || 0 : Number(produit.stockQty) || 0;
    const plafond = stock > 0 ? Math.max(Math.max(1, produit.minOrderQty || 1), stock) : Infinity;
    const quantite = Math.min(demandee, plafond);
    const item = construireCartItem(produit, trouvee.variante, quantite);
    if (!(item.price > 0)) {
      resultat.indisponibles.push({ ligne, raison: 'sans_prix', produit });
      continue;
    }
    if (quantite < demandee) resultat.reduites.push({ ligne, quantite });
    resultat.aAjouter.push(item);
  }
  return resultat;
}

// ─── 3. Suivi depuis un autre téléphone ──────────────────────────────────────

const STATUTS: OrderStatus[] = [
  'pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

/** Le statut lu dans une commande ; inconnu : « en attente ». */
export function statutCommande(v: unknown): OrderStatus {
  return STATUTS.includes(v as OrderStatus) ? (v as OrderStatus) : 'pending';
}

/** Libellés arabes des statuts (ORDER_STATUS_LABELS reste en français pour l'équipe). */
export const STATUT_AR: Record<OrderStatus, string> = {
  pending: 'في الانتظار',
  confirmed: 'مؤكَّد',
  processing: 'قيد التحضير',
  ready_for_pickup: 'جاهز للاستلام',
  shipped: 'تم الشحن',
  out_for_delivery: 'في الطريق إليك',
  delivered: 'تم التوصيل',
  cancelled: 'ملغى',
  returned: 'مُرجَع',
};

export function libelleStatut(status: OrderStatus, language: Language): string {
  return (language === 'ar' ? STATUT_AR[status] : ORDER_STATUS_LABELS[status]) || status;
}

/** Commande terminée : plus de virement à proposer. */
export function commandeTerminee(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled' || status === 'returned';
}

/**
 * Le n° tapé par le client, au format du checkout (« LBT-MG2K3H7P-X9QF »), ou null.
 * Accepté : minuscules, espaces ou tirets d'un autre clavier, chiffres arabes, sans « LBT- »,
 * ou précédé de « N° ».
 */
export function normaliserNumeroCommande(saisie: unknown): string | null {
  let s = chiffresLatins(String(saisie ?? ''))
    .toUpperCase()
    .replace(/[\s_\u00a0\u2010-\u2015\u2212]+/g, '-')
    .replace(/-+/g, '-');
  const debut = s.indexOf('LBT');
  if (debut > 0) s = s.slice(debut);
  s = s.replace(/^-+|-+$/g, '');
  const m = /^(?:LBT-?)?([A-Z0-9]{6,12})-([A-Z0-9]{1,6})$/.exec(s);
  return m ? `LBT-${m[1]}-${m[2]}` : null;
}

/** Ancienne commande sans n° du checkout : la page de confirmation montre son identifiant (20 caractères). */
export function identifiantCommandeSaisi(saisie: unknown): string | null {
  const s = String(saisie ?? '').trim();
  return /^[A-Za-z0-9]{20}$/.test(s) ? s : null;
}

/** Le téléphone donné (déjà au format 0XXXXXXXXX) est-il celui de la commande ? Principal, livraison ou 2e numéro. */
export function telephoneCorrespond(
  o: { customerPhone?: unknown; shippingAddress?: { phone?: unknown; phone2?: unknown } | null } | null | undefined,
  telephone: string | null,
): boolean {
  if (!telephone || !/^0\d{9}$/.test(telephone)) return false;
  return [o?.customerPhone, o?.shippingAddress?.phone, o?.shippingAddress?.phone2]
    .some(t => typeof t === 'string' && normaliserTelephoneMaroc(t) === telephone);
}

export interface LigneSuivie {
  productId: string;
  nom: string;
  nomAr?: string;
  variante?: CartItem['variant'];
  quantite: number;
  prixUnitaire: number;
  total: number;
}

/** Ce que /api/shop/suivi renvoie : le strict nécessaire pour suivre et recommander. */
export interface CommandeSuivie {
  numero: string;
  /** Date ISO de la commande (null : inconnue). */
  date: string | null;
  statut: OrderStatus;
  reception: { mode: ModeReception; lieu: LieuRetrait; transport: 'camionnette' | 'transporteur' };
  paiement: MoyenPaiement;
  lignes: LigneSuivie[];
  sousTotal: number;
  frais: number;
  /** Colis à 0 MAD d'une commande d'avant le 30/09/2026 qui y avait droit : « Offerte ». */
  fraisOfferts: boolean;
  total: number;
}

// Seuls ces champs texte de la variante sortent ; l'identifiant garde sa forme, sinon il est écarté.
const TEXTES_VARIANTE = ['model', 'modelAr', 'size', 'sizeAr', 'color', 'colorAr'] as const;

function varianteSure(v: unknown): CartItem['variant'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const brut = v as Record<string, unknown>;
  const sure: NonNullable<CartItem['variant']> = {};
  for (const champ of TEXTES_VARIANTE) {
    const t = typeof brut[champ] === 'string' ? texteClientSur(brut[champ], 80) : '';
    if (t) sure[champ] = t;
  }
  if (typeof brut.colorHex === 'string' && /^#?[0-9a-f]{3,8}$/i.test(brut.colorHex)) sure.colorHex = brut.colorHex;
  // Jamais affiché : sert seulement à retrouver la même variante (« Commander la même chose »).
  if (typeof brut.variantId === 'string' && /^[^\u0000-\u001f\u007f<>]{1,120}$/.test(brut.variantId)) sure.variantId = brut.variantId;
  return Object.keys(sure).length > 0 ? sure : undefined;
}

const montant = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/** La commande lue dans Firestore → la réponse minimale (jamais l'adresse, les notes, le transporteur). */
export function commandeSuivie(o: any): CommandeSuivie {
  const commande = o && typeof o === 'object' ? o : {};
  const items: any[] = Array.isArray(commande.items) ? commande.items.slice(0, 200) : [];
  const r = receptionDe({ reception: commande.reception, items });
  const frais = montant(commande.deliveryFee);
  return {
    // Pas texteClientSur : il masquerait « …123-4567… » (8 chiffres de suite) dans un vrai n°.
    numero: normaliserNumeroCommande(commande.orderNumber) ?? '',
    date: dateDe(commande.createdAt)?.toISOString() ?? null,
    statut: statutCommande(commande.status),
    reception: {
      mode: r.mode,
      lieu: r.lieu,
      transport: transportPrevu({ reception: commande.reception, items, shippingAddress: commande.shippingAddress }),
    },
    paiement: moyenPaiementDe(commande),
    lignes: items
      .filter(i => i && typeof i === 'object')
      .map(i => {
        const quantite = Math.max(0, Math.round((Number(i.quantity) || 0) * 100) / 100);
        const prixUnitaire = montant(prixUnitaireLigne(i));
        const nomAr = texteClientSur(i.productNameAr, 100);
        const variante = varianteSure(i.variant);
        return {
          productId: typeof i.productId === 'string' ? i.productId.slice(0, 100) : '',
          nom: texteClientSur(i.productName, 100) || 'Article',
          ...(nomAr ? { nomAr } : {}),
          ...(variante ? { variante } : {}),
          quantite,
          prixUnitaire,
          total: Math.round(prixUnitaire * quantite * 100) / 100,
        };
      }),
    sousTotal: montant(commande.subtotal),
    frais,
    fraisOfferts: r.mode === 'domicile' && frais <= 0 && fraisColisAnnonces({ ...commande, items }) === 'offerte',
    total: montant(commande.total),
  };
}

/** Les lignes d'une commande suivie, pour « Commander la même chose ». */
export function lignesDeSuivi(c: Pick<CommandeSuivie, 'lignes'>): LigneARecommander[] {
  return c.lignes.map(l => ({
    productId: l.productId,
    productName: l.nom,
    ...(l.nomAr ? { productNameAr: l.nomAr } : {}),
    variant: l.variante ?? null,
    quantity: l.quantite,
  }));
}

export type CodeSuivi = 'numero_invalide' | 'telephone_invalide' | 'introuvable' | 'trop_essais' | 'erreur' | 'reseau';

/** Messages du suivi, en français et en arabe (la route les renvoie, la page les montre). */
export const MESSAGES_SUIVI: Record<CodeSuivi, Record<Language, string>> = {
  numero_invalide: {
    fr: 'Vérifiez le numéro de commande : il commence par LBT- (exemple : LBT-MG2K3H7P-X9QF).',
    ar: 'تحقق من رقم الطلب: يبدأ بـ LBT- (مثال: LBT-MG2K3H7P-X9QF).',
  },
  telephone_invalide: {
    fr: 'Numéro de téléphone non reconnu : un numéro marocain de 10 chiffres, qui commence par 05, 06 ou 07.',
    ar: 'رقم الهاتف غير صحيح: رقم مغربي من 10 أرقام يبدأ بـ 05 أو 06 أو 07.',
  },
  introuvable: {
    fr: 'Aucune commande ne correspond à ce numéro et à ce téléphone. Vérifiez les deux, ou écrivez-nous sur WhatsApp.',
    ar: 'لا يوجد طلب بهذا الرقم وهذا الهاتف. تحقق منهما، أو راسلنا عبر واتساب.',
  },
  trop_essais: {
    fr: 'Trop d’essais. Réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.',
    ar: 'محاولات كثيرة. أعد المحاولة بعد بضع دقائق، أو راسلنا عبر واتساب.',
  },
  erreur: {
    fr: 'Le suivi ne répond pas pour le moment. Réessayez dans un instant.',
    ar: 'التتبع لا يستجيب حالياً. أعد المحاولة بعد قليل.',
  },
  reseau: {
    fr: 'Pas de connexion internet. Vérifiez votre connexion, puis réessayez.',
    ar: 'لا يوجد اتصال بالإنترنت. تحقق من اتصالك ثم أعد المحاولة.',
  },
};

/** Compteur d'essais d'une fenêtre fixe (en mémoire d'une instance du serveur). */
export interface CompteurEssais {
  debut: number;
  nombre: number;
}

/** +1 essai pour `cle` ; faux au-delà de `max` essais dans la fenêtre en cours. */
export function essaiPermis(
  compteurs: Map<string, CompteurEssais>,
  cle: string,
  maintenant: number,
  max: number,
  fenetreMs: number,
): boolean {
  const c = compteurs.get(cle);
  if (!c || maintenant - c.debut >= fenetreMs || c.debut > maintenant) {
    compteurs.set(cle, { debut: maintenant, nombre: 1 });
    return true;
  }
  if (c.nombre >= max) return false;
  c.nombre += 1;
  return true;
}

/** Oublie les fenêtres finies : la mémoire ne grossit pas sans fin. */
export function oublierEssaisFinis(compteurs: Map<string, CompteurEssais>, maintenant: number, fenetreMs: number): void {
  for (const [cle, c] of Array.from(compteurs)) {
    if (maintenant - c.debut >= fenetreMs || c.debut > maintenant) compteurs.delete(cle);
  }
}
