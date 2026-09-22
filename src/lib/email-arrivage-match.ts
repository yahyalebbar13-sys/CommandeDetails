// ─── Rapprochement Email ↔ Arrivage ──────────────────────────────────────────
// Moteur pur (aucune I/O) : sert à la vue Emails pour rattacher un avis
// d'arrivée à son dossier.
//
// Principe : chaque dossier d'arrivage porte un numéro de BL (ex: 26HD1004) qui
// se retrouve presque toujours dans l'objet, le corps ou le nom d'une pièce
// jointe des emails du transitaire / fournisseur / compagnie maritime.
// On note chaque couple (email, dossier) sur un faisceau d'indices, et on garde
// le meilleur. Rien n'est deviné en silence : chaque point marqué est justifié
// par une raison affichable.

import type { Facture } from './types';
import type { SuiviConteneur } from './suivi-conteneur';

// ─── Types ────────────────────────────────────────────────────────────────────
export type MatchConfidence = 'sure' | 'probable' | 'faible';

export type MatchReason = {
  code: string;
  label: string;
  points: number;
};

export type ArrivageMatch = {
  factureId: string;
  noBL?: string;
  supplierId?: string;
  declaringCompany?: string;
  arrivalDate?: string;
  score: number;
  confidence: MatchConfidence;
  reasons: MatchReason[];
};

export type MatchableEmail = {
  subject?: string;
  from?: string;
  to?: string;
  text?: string;
  date?: string;
  attachments?: { filename?: string }[] | null;
};

/** Profil fournisseur réduit aux champs utiles au rapprochement. */
export type SupplierHint = {
  /** Nom du fournisseur tel que stocké dans Facture.supplierId */
  name: string;
  /** Emails connus du fournisseur (supplierProfiles.email) */
  emails?: string[];
};

// ─── Boîte mail ↔ société déclarante ──────────────────────────────────────────
// Les deux boîtes Gmail (cf. lib/gmail-browser.ts).
export const ACCOUNT_COMPANY: Record<string, string> = {
  lebtex: 'Lebtex',
  robeinbox: 'Robe in box',
};

// Seuils de score
const SEUIL_SURE = 55;
const SEUIL_PROBABLE = 30;
/** En dessous, on considère qu'il n'y a pas de rapprochement. */
export const SEUIL_MIN = 22;

// ─── Normalisation ────────────────────────────────────────────────────────────
/**
 * Réduit une chaîne à ses lettres et chiffres en majuscules.
 * « BL n° 26-HD 1004 » → « BLN26HD1004 » : le numéro reste trouvable quelle que
 * soit la ponctuation, les espaces ou la casse utilisés par l'expéditeur.
 */
export function normalizeRef(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Un numéro de dossier n'est fiable comme motif que s'il est assez long. */
function isRefUsable(ref: string): boolean {
  return ref.length >= 5 && /\d/.test(ref);
}

/**
 * Repère les références de dossier plausibles dans un texte libre.
 * Format observé chez Lebtex : 2 à 5 chiffres, 1 à 3 lettres, 3 à 5 chiffres
 * (26HD1004, 10426HT1004…). Sert à proposer un dossier quand aucun ne matche.
 */
export function extractRefCandidates(text: string | null | undefined): string[] {
  const norm = normalizeRef(text);
  const found = norm.match(/\d{2,5}[A-Z]{1,3}\d{3,5}/g) || [];
  return Array.from(new Set(found));
}

// ─── Fenêtre de dates du dossier ──────────────────────────────────────────────
function parseDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

const JOUR = 86400000;

/**
 * Période pendant laquelle un dossier « vit » : des documents d'expédition
 * jusqu'à un mois et demi après l'arrivée (dédouanement, DUM, factures).
 */
function dossierWindow(f: Facture): { start: number; end: number } | null {
  const ship = parseDate(f.shippingDate);
  const arr = parseDate(f.arrivalDate);
  const stock = parseDate(f.stockEntryDate);
  const anchors = [ship, arr, stock].filter((x): x is number => x !== null);
  if (anchors.length === 0) return null;
  return {
    start: Math.min(...anchors) - 21 * JOUR,
    end: Math.max(...anchors) + 45 * JOUR,
  };
}

// ─── Cœur du rapprochement ────────────────────────────────────────────────────
type Haystack = {
  subject: string;
  body: string;
  attachments: string;
  rawSubject: string;
  rawBody: string;
  fromLower: string;
  date: number | null;
};

function buildHaystack(email: MatchableEmail): Haystack {
  const rawSubject = email.subject || '';
  const rawBody = email.text || '';
  const attachNames = (email.attachments || []).map(a => a?.filename || '').join(' ');
  return {
    subject: normalizeRef(rawSubject),
    body: normalizeRef(rawBody),
    attachments: normalizeRef(attachNames),
    rawSubject,
    rawBody,
    fromLower: (email.from || '').toLowerCase(),
    date: parseDate(email.date),
  };
}

/** Mot présent dans un texte brut, avec frontières de mot (évite « MH » dans « MHZ »). */
function hasWord(haystack: string, word: string): boolean {
  if (word.length < 3) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, 'i').test(haystack);
}

// Mots trop communs dans les raisons sociales pour identifier qui que ce soit.
const MOTS_GENERIQUES = new Set([
  'TRANSIT', 'TRANSPORT', 'TRANSPORTS', 'LOGISTICS', 'LOGISTIQUE', 'SHIPPING',
  'SARL', 'SARLAU', 'SAS', 'SA', 'LTD', 'LIMITED', 'LLC', 'INC', 'CO', 'COMPANY',
  'IMPORT', 'EXPORT', 'IMPEX', 'TRADING', 'TRADE', 'GROUP', 'GROUPE',
  'INTERNATIONAL', 'GLOBAL', 'WORLD', 'MAROC', 'MOROCCO', 'TEXTILE', 'TEXTILES',
  'AND', 'THE', 'DES', 'DE', 'DU', 'LA', 'LE', 'LES',
]);

/**
 * Cherche un nom de partenaire (fournisseur, transitaire) dans un texte.
 * Le nom complet est l'indice fort. À défaut, on accepte un mot distinctif du
 * nom — « NOUH TRANSIT » se retrouve dans « nouh@transit.ma » via « NOUH »,
 * alors que « TRANSIT » seul ne prouverait rien.
 *
 * @returns 'phrase' si le nom complet est présent, 'token' pour un mot
 *          distinctif, null sinon.
 */
function findPartnerName(haystacks: string[], name: string): 'phrase' | 'token' | null {
  const clean = (name || '').trim();
  if (!clean) return null;
  if (haystacks.some(h => hasWord(h, clean))) return 'phrase';

  // Un nom d'un seul mot a déjà été testé en entier ci-dessus.
  const words = clean.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length < 2) return null;

  const distinctifs = words.filter(
    w => w.length >= 4 && !MOTS_GENERIQUES.has(w.toUpperCase())
  );
  return distinctifs.some(w => haystacks.some(h => hasWord(h, w))) ? 'token' : null;
}

// Villes et ports qui reviennent dans presque tous les messages : un navire qui
// ne se distingue que par un de ces mots ferait correspondre n'importe quoi.
const LIEUX_COURANTS = new Set([
  'TANGER', 'TANGIER', 'CASABLANCA', 'CASA', 'MAROC', 'MOROCCO', 'AGADIR',
  'NINGBO', 'SHANGHAI', 'SHENZHEN', 'QINGDAO', 'BUSAN', 'YANTIAN', 'XIAMEN',
  'SINGAPORE', 'VALENCIA', 'BARCELONA', 'ALGECIRAS', 'ROTTERDAM', 'ANTWERP',
  'HAMBURG', 'GENOVA', 'GENOA', 'MALTA', 'PIRAEUS', 'JEBEL', 'DUBAI', 'PORT',
]);

/**
 * Ce nom de navire peut-il servir d'indice ?
 *
 * « SEASPAN BRIGHTNESS » ou « MSC ANNA » désignent un bateau. « TANGER A »,
 * lui, se retrouverait dans « Tanger a été atteint » : un navire qui n'a pour
 * seul mot distinctif qu'un nom de port est écarté, sans quoi il rattacherait à
 * un dossier tous les messages parlant de la région.
 */
export function navireIdentifiable(nom: string | null | undefined): boolean {
  const clean = (nom || '').trim();
  if (clean.length < 6) return false;
  const mots = clean.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return mots.some(m => m.length >= 4 && !LIEUX_COURANTS.has(m.toUpperCase()) && !MOTS_GENERIQUES.has(m.toUpperCase()));
}

/**
 * Note un email contre un dossier d'arrivage.
 * @param accountKey boîte mail d'où vient l'email ('lebtex' | 'robeinbox')
 */
export function scoreEmailAgainstFacture(
  email: MatchableEmail,
  facture: Facture,
  opts: { accountKey?: string; supplier?: SupplierHint } = {}
): ArrivageMatch {
  const h = buildHaystack(email);
  const reasons: MatchReason[] = [];
  const add = (code: string, label: string, points: number) => {
    reasons.push({ code, label, points });
  };

  // ① Numéro de BL / dossier — l'indice décisif
  const bl = normalizeRef(facture.noBL);
  if (isRefUsable(bl)) {
    if (h.subject.includes(bl)) {
      add('bl_objet', `N° BL ${facture.noBL} dans l'objet`, 60);
    } else if (h.attachments.includes(bl)) {
      add('bl_piece_jointe', `N° BL ${facture.noBL} dans une pièce jointe`, 48);
    } else if (h.body.includes(bl)) {
      add('bl_corps', `N° BL ${facture.noBL} dans le corps du message`, 45);
    }
  }

  // ② Fournisseur — par email d'expéditeur (fiable) ou par nom cité
  const supplierName = (facture.supplierId || '').trim();
  const supplierEmails = opts.supplier?.emails || [];
  const fromMatch = supplierEmails.some(
    e => e && h.fromLower.includes(e.toLowerCase().trim())
  );
  if (fromMatch) {
    add('fournisseur_expediteur', `Expéditeur = fournisseur ${supplierName}`, 28);
  } else {
    const inHeader = findPartnerName([h.rawSubject, h.fromLower], supplierName);
    const inBody = inHeader ? null : findPartnerName([h.rawBody], supplierName);
    if (inHeader) {
      add('fournisseur_objet', `Fournisseur ${supplierName} cité dans l'objet`, inHeader === 'phrase' ? 16 : 11);
    } else if (inBody) {
      add('fournisseur_corps', `Fournisseur ${supplierName} cité dans le message`, inBody === 'phrase' ? 8 : 5);
    }
  }

  // ③ Transitaire
  const forwarder = (facture.forwarder || '').trim();
  const forwarderHit = findPartnerName([h.rawSubject, h.fromLower, h.rawBody], forwarder);
  if (forwarderHit) {
    add('transitaire', `Transitaire ${forwarder} cité`, forwarderHit === 'phrase' ? 12 : 9);
  }

  // ④ Compagnie maritime
  const line = (facture.shippingLine || '').trim();
  if (line && (hasWord(h.rawSubject, line) || hasWord(h.rawBody, line))) {
    add('compagnie', `Compagnie ${line} citée`, 8);
  }

  // ⑤ Ce que la compagnie maritime nous a appris du conteneur
  // Un numéro de conteneur est unique au monde : le voir dans un message ne
  // laisse aucun doute sur le dossier concerné, même si le message ne dit ni
  // « avis d'arrivée » ni le numéro de BL.
  const suivi = (facture as any).suivi as SuiviConteneur | undefined;
  if (suivi?.shipmentId) {
    for (const numero of suivi.conteneurs || []) {
      const n = normalizeRef(numero);
      if (n.length < 10) continue;
      if (h.subject.includes(n)) { add('conteneur_objet', `Conteneur ${numero} dans l'objet`, 58); break; }
      if (h.attachments.includes(n)) { add('conteneur_piece_jointe', `Conteneur ${numero} dans une pièce jointe`, 46); break; }
      if (h.body.includes(n)) { add('conteneur_corps', `Conteneur ${numero} dans le message`, 44); break; }
    }

    // Le navire ne désigne pas un dossier à lui seul — plusieurs conteneurs
    // voyagent sur le même bateau — mais c'est un indice sérieux, et c'est
    // souvent le seul mot commun entre un préavis et le dossier.
    const navire = (suivi.navire || '').trim();
    if (navireIdentifiable(navire)) {
      if (hasWord(h.rawSubject, navire)) add('navire_objet', `Navire ${navire} dans l'objet`, 18);
      else if (hasWord(h.rawBody, navire)) add('navire_corps', `Navire ${navire} cité`, 12);
    }

    // Le n° de voyage seul ressemble à n'importe quelle référence : il ne
    // compte qu'en compagnie du navire, où il confirme le bon départ.
    const voyage = (suivi.voyage || '').trim();
    const navireVu = reasons.some(r => r.code.startsWith('navire_'));
    if (navireVu && voyage.length >= 3 && (hasWord(h.rawSubject, voyage) || hasWord(h.rawBody, voyage))) {
      add('voyage', `Voyage ${voyage} confirmé`, 8);
    }
  }

  // ⑥ Société déclarante ↔ boîte mail
  const expected = opts.accountKey ? ACCOUNT_COMPANY[opts.accountKey] : undefined;
  const declaring = (facture.declaringCompany || '').trim();
  if (expected && declaring) {
    const declaringNorm = normalizeRef(declaring);
    const knownCompanies = Object.values(ACCOUNT_COMPANY).map(normalizeRef);
    if (declaringNorm === normalizeRef(expected)) {
      add('societe', `Dossier déclaré par ${declaring}`, 10);
    } else if (knownCompanies.includes(declaringNorm)) {
      // Le dossier appartient explicitement à l'autre boîte → forte pénalité.
      add('societe_autre', `Dossier déclaré par ${declaring}, pas ${expected}`, -30);
    }
    // Société hors des deux boîtes (ex: « New fournitures ») → neutre.
  }

  // ⑦ Cohérence de date
  const window = dossierWindow(facture);
  if (window && h.date !== null) {
    if (h.date >= window.start && h.date <= window.end) {
      add('periode', 'Email dans la période du dossier', 10);
    } else {
      add('hors_periode', 'Email hors de la période du dossier', -12);
    }
  }

  const score = reasons.reduce((s, r) => s + r.points, 0);
  return {
    factureId: facture.id,
    noBL: facture.noBL,
    supplierId: facture.supplierId,
    declaringCompany: facture.declaringCompany,
    arrivalDate: facture.arrivalDate,
    score,
    confidence: score >= SEUIL_SURE ? 'sure' : score >= SEUIL_PROBABLE ? 'probable' : 'faible',
    reasons: reasons.sort((a, b) => b.points - a.points),
  };
}

/**
 * Classe tous les dossiers pour un email donné, du plus probable au moins.
 * Ne renvoie que les candidats au-dessus du seuil minimal.
 */
export function matchEmailToArrivages(
  email: MatchableEmail,
  factures: Facture[],
  opts: { accountKey?: string; suppliers?: Record<string, SupplierHint>; limit?: number } = {}
): ArrivageMatch[] {
  const { accountKey, suppliers, limit = 3 } = opts;
  const scored = factures
    .map(f =>
      scoreEmailAgainstFacture(email, f, {
        accountKey,
        supplier: suppliers?.[(f.supplierId || '').trim()],
      })
    )
    .filter(m => m.score >= SEUIL_MIN)
    .sort((a, b) => b.score - a.score);

  // Un email ne concerne qu'un dossier : si le premier est « sûr » et détaché
  // du suivant, on ne propose que lui.
  if (scored.length > 1 && scored[0].confidence === 'sure' && scored[0].score - scored[1].score >= 25) {
    return [scored[0]];
  }
  return scored.slice(0, limit);
}

/** Le meilleur candidat, ou null s'il n'y a rien de crédible. */
export function bestArrivageForEmail(
  email: MatchableEmail,
  factures: Facture[],
  opts: { accountKey?: string; suppliers?: Record<string, SupplierHint> } = {}
): ArrivageMatch | null {
  return matchEmailToArrivages(email, factures, { ...opts, limit: 1 })[0] || null;
}

export const MATCH_THRESHOLDS = { SEUIL_SURE, SEUIL_PROBABLE, SEUIL_MIN };

// ─── Chercher par ce qu'on sait, plutôt que par ce qu'on espère ───────────────
// La détection par mots-clés ne trouve que les messages qui disent « avis
// d'arrivée ». Or un transitaire écrit « Votre conteneur TIIU7634594 », une
// compagnie met le n° de BL en objet sans autre formule, et un préavis parle du
// navire. Tous ces messages ont un point commun : ils citent quelque chose que
// nous connaissons déjà — parce que le dossier le porte, ou parce que la
// compagnie nous l'a dit via ShipsGo.

/** Une référence à chercher dans la boîte, et d'où elle vient. */
export type ReferenceRecherchable = {
  terme: string;
  /** Le dossier qui l'a fournie. */
  factureId: string;
  type: 'bl' | 'conteneur' | 'navire';
};

/** Les dossiers dont il vaut la peine de fouiller la correspondance. */
function dossierVivant(f: Facture, maintenant: number): boolean {
  const w = dossierWindow(f);
  if (!w) return true;                       // sans date, on ne présume rien
  return maintenant >= w.start && maintenant <= w.end;
}

/**
 * Les termes à chercher dans Gmail pour ne rien rater des dossiers en cours :
 * numéros de BL, numéros de conteneurs et noms de navires.
 */
export function referencesRecherchables(
  factures: Facture[],
  opts: { maintenant?: number; maxTermes?: number } = {},
): ReferenceRecherchable[] {
  const maintenant = opts.maintenant ?? Date.now();
  const maxTermes = opts.maxTermes ?? 24;
  const sorties: ReferenceRecherchable[] = [];
  const vus = new Set<string>();

  const ajouter = (terme: string, factureId: string, type: ReferenceRecherchable['type']) => {
    const t = terme.trim();
    const cle = t.toUpperCase();
    if (!t || vus.has(cle)) return;
    vus.add(cle);
    sorties.push({ terme: t, factureId, type });
  };

  // Les dossiers les plus récents d'abord : c'est là que l'actualité se joue.
  const vivants = factures
    .filter(f => dossierVivant(f, maintenant))
    .sort((a, b) => String(b.arrivalDate || '').localeCompare(String(a.arrivalDate || '')));

  for (const f of vivants) {
    const suivi = (f as any).suivi as SuiviConteneur | undefined;
    // Le conteneur d'abord : c'est le terme qui ne peut désigner rien d'autre.
    for (const c of suivi?.conteneurs || []) if (normalizeRef(c).length >= 10) ajouter(c, f.id, 'conteneur');
    const bl = (f.noBL || '').trim();
    if (isRefUsable(normalizeRef(bl))) ajouter(bl, f.id, 'bl');
    if (navireIdentifiable(suivi?.navire)) ajouter(suivi!.navire!, f.id, 'navire');
  }

  return sorties.slice(0, maxTermes);
}

/**
 * Requête Gmail correspondante. Gmail traite `{a b c}` comme un OU, et met
 * entre guillemets ce qui contient une espace (« SEASPAN BRIGHTNESS »).
 * Renvoie '' quand il n'y a rien à chercher — à l'appelant de ne pas
 * interroger la boîte pour rien.
 */
export function rechercheGmailReferences(
  refs: ReferenceRecherchable[],
  opts: { jours?: number } = {},
): string {
  if (!refs.length) return '';
  const jours = opts.jours ?? 120;
  const termes = refs.map(r => (/\s/.test(r.terme) ? `"${r.terme.replace(/"/g, '')}"` : r.terme));
  return `newer_than:${jours}d -in:sent -in:drafts -from:me {${termes.join(' ')}}`;
}

/** Ce qui, dans un email, a déclenché sa remontée — pour le dire à l'écran. */
export function referencesCitees(email: MatchableEmail, refs: ReferenceRecherchable[]): ReferenceRecherchable[] {
  const h = buildHaystack(email);
  return refs.filter(r => {
    if (r.type === 'navire') return hasWord(h.rawSubject, r.terme) || hasWord(h.rawBody, r.terme);
    const n = normalizeRef(r.terme);
    return n.length >= 5 && (h.subject.includes(n) || h.body.includes(n) || h.attachments.includes(n));
  });
}
