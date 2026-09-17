// ─── Détection du type d'un email de dossier ─────────────────────────────────
// Les emails d'import se répètent : le transitaire, Portnet et la compagnie
// maritime envoient toujours les mêmes messages, avec les mêmes tournures.
// On les reconnaît donc par règles — instantané, gratuit, sans appel réseau,
// et donc rejouable à chaque actualisation sans rien mettre en cache.
//
// L'IA (/api/analyze-email) ne sert qu'aux messages qu'aucune règle ne
// reconnaît : voir needsAiFallback().
//
// Pour ajouter un type d'email : une entrée dans REGLES, rien d'autre.

// ─── Types ────────────────────────────────────────────────────────────────────
export type EmailEventType =
  | 'ENGAGEMENT'
  | 'AVIS_ARRIVEE'
  | 'DOCUMENTS_EXPEDITION'
  | 'DUM'
  | 'BON_A_DELIVRER'
  | 'MAINLEVEE'
  | 'SORTIE_MARCHANDISE'
  | 'FACTURE_TRANSITAIRE'
  | 'PAIEMENT'
  | 'PROFORMA'
  | 'RELANCE_SURESTARIE';

export type EmailEvent = {
  type: EmailEventType;
  /** Libellé affichable, ex. « Engagement disponible ». */
  label: string;
  /** Ce qu'il y a à faire dans le logiciel. */
  action?: string;
  /** Point de la checklist dossier que cet email fait avancer. */
  checklistId?: string;
  /** À remonter tout de suite (blocage ou coût qui court). */
  urgent: boolean;
  /** Bout de texte qui a déclenché la règle — pour justifier à l'écran. */
  preuve: string;
  /** 'objet' pèse plus lourd que 'corps'. */
  ou: 'objet' | 'corps';
};

type Regle = {
  type: EmailEventType;
  label: string;
  action?: string;
  checklistId?: string;
  urgent?: boolean;
  motifs: RegExp[];
  /** Si l'un de ces motifs sort, la règle ne s'applique pas. */
  exclusions?: RegExp[];
};

// ─── Normalisation ────────────────────────────────────────────────────────────
/**
 * Minuscules, sans accents, espaces resserrés.
 * « Bon à Délivrer » et « BON A DELIVRER » deviennent « bon a delivrer ».
 */
export function normalizeText(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Catalogue des emails récurrents ──────────────────────────────────────────
// L'ordre compte : le premier type reconnu dans l'objet l'emporte.
const REGLES: Regle[] = [
  {
    type: 'ENGAGEMENT',
    label: 'Engagement disponible',
    action: 'Récupérer l\'engagement d\'importation sur Portnet',
    urgent: true,
    motifs: [
      /engagement d[e']? ?importation/,
      /titre d[e']? ?importation/,
      /\bengagement\b.{0,30}\b(disponible|valide|signe|impute|souscrit)\b/,
      /\b(disponible|valide|signe)\b.{0,30}\bengagement\b/,
      /demande d[e']? ?engagement/,
    ],
  },
  {
    type: 'AVIS_ARRIVEE',
    label: 'Avis d\'arrivée',
    action: 'Vérifier la date d\'arrivée du dossier',
    urgent: true,
    motifs: [
      /avis d[e']? ?arrivee/,
      /arrival notice/,
      /notice of arrival/,
      /\bnavire\b.{0,30}\b(arrive|accoste|a quai)\b/,
      /vessel arriv/,
      /\beta\b.{0,20}\d/,
    ],
  },
  {
    type: 'MAINLEVEE',
    label: 'Mainlevée douane',
    action: 'Dossier dédouané — préparer l\'enlèvement',
    checklistId: 'douane_ok',
    urgent: true,
    motifs: [
      /mainlevee/,
      /main levee/,
      /bon a enlever/,
      /customs release/,
      /\bdedouane(e|ment)?\b.{0,25}\b(ok|termine|accorde)\b/,
    ],
  },
  {
    type: 'SORTIE_MARCHANDISE',
    label: 'Sortie de marchandise',
    action: 'Marchandise sortie du port — planifier l\'entrée en stock',
    urgent: true,
    motifs: [
      /sortie (de (la )?)?marchandise/,
      /bon de sortie/,
      /gate ?out/,
      /\bmarchandise\b.{0,25}\b(sortie|enlevee|livree)\b/,
      /enlevement (effectue|realise|fait)/,
    ],
  },
  {
    type: 'BON_A_DELIVRER',
    label: 'Bon à délivrer',
    action: 'BAD reçu — vérifier qu\'il est affecté au dossier',
    urgent: true,
    motifs: [
      /bon a delivrer/,
      /\bb\.? ?a\.? ?d\.?\b(?! ?news)/,
      /delivery order/,
      /\bd\/o\b/,
      /\bbon\b.{0,20}\baffecte\b/,
      /\baffectation\b.{0,20}\bbon\b/,
    ],
  },
  {
    type: 'DUM',
    label: 'DUM',
    action: 'Déclaration en douane — contrôler le montant des droits',
    checklistId: 'douane_ok',
    motifs: [
      /\bdum\b/,
      /declaration unique/,
      /declaration en douane/,
      /declaration douaniere/,
    ],
  },
  {
    type: 'RELANCE_SURESTARIE',
    label: 'Surestaries / magasinage',
    action: 'Frais qui courent — traiter en priorité',
    urgent: true,
    motifs: [
      /surestarie/,
      /\bdemurrage\b/,
      /\bdetention\b.{0,25}\b(conteneur|container)\b/,
      /frais de magasinage/,
      /\bstorage charges?\b/,
    ],
  },
  {
    type: 'FACTURE_TRANSITAIRE',
    label: 'Facture transitaire',
    action: 'Saisir les frais dans le coût de revient',
    checklistId: 'facture_mad_ok',
    motifs: [
      /facture.{0,25}(transit|transitaire|dedouanement)/,
      /(transit|transitaire).{0,25}facture/,
      /note d[e']? ?honoraires/,
      /\bdebours\b/,
      /decompte (definitif|des frais)/,
    ],
  },
  {
    type: 'PAIEMENT',
    label: 'Paiement / virement',
    action: 'Rapprocher le paiement du dossier',
    motifs: [
      /avis de virement/,
      /\bswift\b/,
      /payment (confirmation|advice|received)/,
      /\b(virement|paiement)\b.{0,25}\b(effectue|emis|recu|confirme)\b/,
      /remise documentaire/,
      /\bt\/?t copy\b/,
    ],
  },
  {
    type: 'DOCUMENTS_EXPEDITION',
    label: 'Documents d\'expédition',
    action: 'Archiver les documents dans le dossier',
    checklistId: 'nw_cbm_ok',
    motifs: [
      /bill of lading/,
      /\bb\/l\b/,
      /packing list/,
      /certificat d[e']? ?origine/,
      /certificate of origin/,
      /shipping documents/,
      /documents? (d[e']? ?)?(expedition|embarquement)/,
      /\bconnaissement\b/,
    ],
  },
  {
    type: 'PROFORMA',
    label: 'Facture proforma',
    action: 'Rapprocher de la commande fournisseur',
    motifs: [
      /proforma/,
      /pro-?forma invoice/,
      /\bp\/i\b/,
      /quotation/,
    ],
  },
];

// ─── Détection ────────────────────────────────────────────────────────────────
type DetectableEmail = {
  subject?: string;
  text?: string;
  attachments?: { filename?: string }[] | null;
};

function premierMotifTrouve(regle: Regle, texte: string): string | null {
  for (const motif of regle.motifs) {
    const m = texte.match(motif);
    if (m) return m[0].trim();
  }
  return null;
}

/**
 * Types d'événement reconnus dans un email.
 * Un même message peut en porter plusieurs (« DUM + bon à délivrer »), ils sont
 * tous renvoyés, ceux repérés dans l'objet d'abord.
 */
export function detectEmailEvents(email: DetectableEmail): EmailEvent[] {
  const objet = normalizeText(email.subject);
  // Les noms de pièces jointes sont aussi parlants que le corps
  // (« DUM_26HD1004.pdf », « BAD.pdf »). Leurs séparateurs deviennent des
  // espaces, sinon « DUM_26HD1004 » ne se lit pas comme le mot « dum ».
  const piecesJointes = normalizeText(
    (email.attachments || [])
      .map(a => (a?.filename || '').replace(/[_\-.]+/g, ' '))
      .join(' ')
  );
  const corps = normalizeText(email.text) + ' ' + piecesJointes;

  const trouves: EmailEvent[] = [];

  for (const regle of REGLES) {
    const exclu = (regle.exclusions || []).some(x => x.test(objet) || x.test(corps));
    if (exclu) continue;

    const dansObjet = premierMotifTrouve(regle, objet);
    const preuve = dansObjet ?? premierMotifTrouve(regle, corps);
    if (!preuve) continue;

    trouves.push({
      type: regle.type,
      label: regle.label,
      action: regle.action,
      checklistId: regle.checklistId,
      urgent: !!regle.urgent,
      preuve,
      ou: dansObjet ? 'objet' : 'corps',
    });
  }

  // Ce qui est annoncé dans l'objet passe devant.
  return trouves.sort((a, b) => (a.ou === b.ou ? 0 : a.ou === 'objet' ? -1 : 1));
}

/** L'événement principal de l'email, ou null si aucune règle ne s'applique. */
export function mainEmailEvent(email: DetectableEmail): EmailEvent | null {
  return detectEmailEvents(email)[0] || null;
}

/**
 * Vrai quand aucune règle ne reconnaît l'email : c'est le seul cas où
 * l'analyse IA apporte quelque chose, et donc où l'appeler coûte moins
 * qu'il ne rapporte.
 */
export function needsAiFallback(email: DetectableEmail): boolean {
  return detectEmailEvents(email).length === 0;
}

/** Les types reconnus, pour construire des filtres dans l'interface. */
export const TYPES_CONNUS: { type: EmailEventType; label: string; urgent: boolean }[] =
  REGLES.map(r => ({ type: r.type, label: r.label, urgent: !!r.urgent }));
