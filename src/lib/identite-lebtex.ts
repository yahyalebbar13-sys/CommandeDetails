// Identité légale de LEBTEX, reprise des documents officiels de /gestion (pied des
// factures et des bons, src/lib/pdf-export.ts) : c'est la société qui vend sur lebtex.ma.
// Une seule source pour la boutique : pied de page, conditions de vente, confidentialité,
// À propos, Contact et données pour Google (LocalBusinessSchema).
// Constantes et fonctions pures : utilisables côté serveur comme dans le navigateur.

import type { Language } from './translations';

/** Nom de la société sur les documents officiels (02/10/2026 : remplace « LEBTEX SARL AU » sur la boutique). */
export const RAISON_SOCIALE = 'LEBTEX TEXTILE IMPORT';

/** Siège, découpé pour les données Google. */
export const SIEGE = {
  rue: '31 Rue 65, Lotissement Al Hamd',
  quartier: 'Aïn Chock',
  ville: 'Casablanca',
  pays: 'Maroc',
} as const;

/** Adresse du siège, à lire d'un trait. */
export const ADRESSE_SIEGE: Record<Language, string> = {
  fr: `${SIEGE.rue}, ${SIEGE.quartier}, ${SIEGE.ville}`,
  ar: '31 زنقة 65، تجزئة الحمد، عين الشق، الدار البيضاء',
};

/** Numéros légaux, tels qu'imprimés sur les factures. */
export const NUMEROS_LEGAUX = {
  patente: '34011181',
  rc: '704617',
  identifiantFiscal: '68814237',
  ice: '003823212000094',
} as const;

/** Téléphones fixes du siège. */
export const TELEPHONES_SIEGE = ['+212 522 25 77 78', '+212 522 31 62 88'] as const;
/** WhatsApp de la boutique (aussi joignable par appel). */
export const WHATSAPP_BOUTIQUE = '+212 760 998 347';
export const EMAIL_LEBTEX = 'lebtexsarlau@gmail.com';

/** Lien « tel: » d'un numéro écrit avec des espaces. */
export function lienTel(numero: string): string {
  return `tel:${numero.replace(/\s/g, '')}`;
}

/** « Patente 34011181 · RC 704617 · IF 68814237 · ICE 003823212000094 », dans la langue du site. */
export function ligneNumerosLegaux(language: Language): string {
  const n = NUMEROS_LEGAUX;
  return language === 'ar'
    ? `الرسم المهني ${n.patente} · السجل التجاري ${n.rc} · التعريف الضريبي ${n.identifiantFiscal} · ICE ${n.ice}`
    : `Patente ${n.patente} · RC ${n.rc} · IF ${n.identifiantFiscal} · ICE ${n.ice}`;
}
