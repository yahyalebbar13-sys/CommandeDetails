// ─── Numéro de téléphone marocain saisi par un client ────────────────────────
// Le client tape son numéro comme il le lit : « 06 12 34 56 78 », « +212 6 12…»,
// « 00212 (0)6… », avec des points ou des tirets, ou au clavier arabe (٠٦١٢…).
// On l'accepte sous toutes ces formes et on l'enregistre toujours de la même
// façon, 0XXXXXXXXX (10 chiffres) : c'est ce que lisent l'admin, le suivi, les
// bons de livraison et le transporteur (telInternational / telephoneSendit).
//
// Pur (ni Firebase ni React).

import type { Language } from './translations';

/** Chiffres arabes-indiens (٠-٩) et persans (۰-۹) → chiffres latins. */
export function chiffresLatins(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) & 0xf));
}

/**
 * Séparateurs tolérés entre les chiffres : espaces (y compris insécables), points,
 * tirets (et leurs variantes), parenthèses, et les marques de sens invisibles
 * qu'ajoute parfois un clavier arabe. Tout autre caractère rend le numéro invalide
 * (deux numéros dans le même champ, une lettre…).
 */
const SEPARATEURS = /[\s.\-‐-―−() ‎‏‪-‮⁦-⁩]/g;

/**
 * Le numéro au format 0XXXXXXXXX, ou null s'il n'est pas un numéro marocain :
 * mobile (06, 07) ou fixe (05), 10 chiffres ; ou +212 / 00212 / 212 suivi de
 * 9 chiffres, avec ou sans le 0 ; ou 9 chiffres seuls (le champ affiche déjà +212).
 */
export function normaliserTelephoneMaroc(saisie: unknown): string | null {
  const brut = chiffresLatins(String(saisie ?? '')).replace(SEPARATEURS, '');
  if (!/^\+?\d+$/.test(brut)) return null;
  let chiffres = brut.replace(/^\+/, '');
  if (brut.startsWith('+')) {
    if (!chiffres.startsWith('212')) return null;
    chiffres = chiffres.slice(3);
  } else if (chiffres.startsWith('00212')) {
    chiffres = chiffres.slice(5);
  } else if (chiffres.startsWith('212') && (chiffres.length === 12 || chiffres.length === 13)) {
    chiffres = chiffres.slice(3);
  }
  if (chiffres.length === 10 && chiffres.startsWith('0')) chiffres = chiffres.slice(1);
  return /^[567]\d{8}$/.test(chiffres) ? `0${chiffres}` : null;
}

/** « 06 12 34 56 78 » : le numéro enregistré, tel qu'on le relit au client. */
export function telephoneMarocLisible(tel: string): string {
  return /^0\d{9}$/.test(tel) ? tel.replace(/(\d{2})(?=\d)/g, '$1 ') : tel;
}

/**
 * L'exemple dans une phrase en arabe : isolé de gauche à droite (U+2066…U+2069), sinon
 * les groupes de chiffres s'affichent dans l'ordre inverse (« 78 56 34 12 06 »).
 */
const EXEMPLE_AR = '⁦06 12 34 56 78⁩';

/**
 * Le message à montrer sous le champ, ou null si le numéro est bon.
 * `obligatoire` : le numéro principal ; le 2e numéro, lui, peut rester vide.
 */
export function erreurTelephone(saisie: string, language: Language, obligatoire = true): string | null {
  const ar = language === 'ar';
  if (!String(saisie ?? '').trim()) {
    if (!obligatoire) return null;
    return ar ? `رقم الهاتف مطلوب. مثال: ${EXEMPLE_AR}` : 'Le téléphone est requis. Exemple : 06 12 34 56 78';
  }
  if (normaliserTelephoneMaroc(saisie)) return null;
  return ar
    ? `رقم غير صحيح: رقم مغربي من 10 أرقام يبدأ بـ 05 أو 06 أو 07. مثال: ${EXEMPLE_AR}`
    : 'Numéro non reconnu : un numéro marocain de 10 chiffres, qui commence par 05, 06 ou 07. Exemple : 06 12 34 56 78';
}
