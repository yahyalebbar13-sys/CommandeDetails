// ─── Lecture d'un message renvoyé par l'API Gmail ─────────────────────────────
// Pur (ni réseau ni DOM) : testable sous Node, cf. scripts/test-avis-arrivee.ts.
// L'API renvoie l'arbre MIME du message ; chaque partie texte porte son contenu
// en base64 « url ».

export type GmailHeader = { name: string; value: string };

export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

export type PieceJointe = {
  filename: string;
  mimeType: string;
  size: number;
  /** Absent quand Gmail a livré le contenu directement dans `data`. */
  attachmentId?: string;
  data?: string;
};

/** Image collée dans le corps (« cid: » dans le HTML) : affichée dans le message, pas listée. */
export type ImageIntegree = PieceJointe & { contentId: string };

/** Ce qu'il faut pour afficher une ligne de la liste. */
export type EmailResume = {
  id: string;
  subject: string;
  from: string;
  /** ISO 8601 */
  date: string;
  snippet: string;
  unread: boolean;
  hasAttachments: boolean;
};

/** Le message ouvert, avec son contenu et ses pièces jointes. */
export type EmailComplet = EmailResume & {
  to: string;
  /** Texte brut, ou texte tiré du HTML quand le message n'a pas de version texte. */
  text: string;
  html: string;
  attachments: PieceJointe[];
  images: ImageIntegree[];
};

// ─── Décodage ─────────────────────────────────────────────────────────────────
export function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Gmail renvoie parfois le texte déjà converti en UTF-8 tout en gardant
 * l'en-tête d'origine (« charset=iso-8859-1 »). On essaie donc l'UTF-8 strict
 * d'abord : un vrai texte Latin-1 accentué n'est presque jamais de l'UTF-8
 * valide, et retombe sur le jeu de caractères annoncé.
 */
function decodeBytes(bytes: Uint8Array, charset: string | undefined): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { /* pas de l'UTF-8 : jeu de caractères annoncé */ }
  // Annoncé UTF-8 (ou rien) sans en être : c'est presque toujours du Windows-1252.
  const annonce = /^(?:utf-?8|us-ascii|ascii)$/i.test(charset || '') ? '' : charset;
  try {
    return new TextDecoder(annonce || 'windows-1252').decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function header(part: GmailPart | undefined, name: string): string {
  const lower = name.toLowerCase();
  return part?.headers?.find(h => h.name.toLowerCase() === lower)?.value || '';
}

function charsetOf(part: GmailPart): string | undefined {
  return header(part, 'Content-Type').match(/charset="?([^";\s]+)"?/i)?.[1];
}

const ENTITES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ucirc: 'û', ugrave: 'ù',
  Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', deg: '°', euro: '€',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITES[code] ?? m;
  });
}

/** Au-delà, un corps HTML n'apporte plus rien au texte servant à la détection. */
const HTML_MAX = 500_000;

/**
 * Retire <style>, <script>, <head> et <title> avec leur contenu. Chaque
 * caractère n'est parcouru qu'une fois : un message piégé (balises jamais
 * fermées) ne peut pas bloquer la page.
 */
function sansBlocs(html: string): string {
  const ouvrant = /<(style|script|head|title)\b/gi;
  // Balises dont on sait déjà qu'aucune fermeture ne suit : inutile de la rechercher encore.
  const sansFermeture = new Set<string>();
  let sansBody = false;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = ouvrant.exec(html))) {
    out += html.slice(pos, m.index) + ' ';
    const balise = m[1].toLowerCase();
    let f: RegExpExecArray | null = null;
    if (!sansFermeture.has(balise)) {
      const fermant = new RegExp(`</${balise}\\s*>`, 'gi');
      fermant.lastIndex = m.index;
      f = fermant.exec(html);
      if (!f) sansFermeture.add(balise);
    }
    if (f) {
      pos = f.index + f[0].length;
    } else if (balise === 'head' || balise === 'title') {
      // </head> est facultatif : le texte reprend au <body>, sinon juste après la balise.
      let b: RegExpExecArray | null = null;
      if (!sansBody) {
        const corps = /<body\b/gi;
        corps.lastIndex = m.index;
        b = corps.exec(html);
        if (!b) sansBody = true;
      }
      pos = b ? b.index : m.index + m[0].length;
    } else {
      return out; // <style> ou <script> jamais fermé : la suite n'est pas du texte lisible
    }
    ouvrant.lastIndex = pos;
  }
  return out + html.slice(pos);
}

/**
 * Texte lisible d'un corps HTML, pour la détection (l'affichage, lui, garde le
 * HTML). Les fins de cellule deviennent « | » : un tableau « Navire | MSC ANNA »
 * se lit encore comme un libellé suivi de sa valeur.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    sansBlocs(html.slice(0, HTML_MAX))
      // Les retours à la ligne du code HTML ne sont pas ceux du texte affiché :
      // seules les balises (<br>, fins de paragraphe, de ligne, de cellule) comptent.
      .replace(/\s+/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^<>]*>/g, ' ')
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[ \n]*/g, '\n')
    // Cellule dont le contenu est un <p> ou un <div> (Outlook) : « Navire\n| MSC ANNA »
    // redevient « Navire | MSC ANNA », sur la même ligne que son libellé.
    .replace(/\n\|/g, ' |')
    .trim();
}

// ─── Images collées (« cid: ») ────────────────────────────────────────────────
/** Content-ID comparable à une référence « cid: » du HTML (casse et %40 indifférents). */
export function normaliserCid(id: string): string {
  let s = id.trim().replace(/^<|>$/g, '');
  try { s = decodeURIComponent(s); } catch { /* laissé tel quel */ }
  return s.toLowerCase();
}

const REFERENCE_CID = /cid:([^"'\s)>]+)/gi;

/** Les Content-ID auxquels le HTML fait référence. */
export function cidsReferences(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(REFERENCE_CID)) out.add(normaliserCid(m[1]));
  return out;
}

/** Remplace chaque référence « cid:X » connue par son contenu ; les autres restent telles quelles. */
export function remplacerCids(html: string, contenus: Map<string, string>): string {
  return html.replace(REFERENCE_CID, (m, id: string) => contenus.get(normaliserCid(id)) ?? m);
}

// ─── Lecture ──────────────────────────────────────────────────────────────────
function dateOf(msg: GmailMessage): string {
  const ms = Number(msg.internalDate);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const parsed = Date.parse(header(msg.payload, 'Date'));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

/** Ligne de liste, depuis un message demandé au format `metadata` ou `full`. */
export function toResume(msg: GmailMessage): EmailResume {
  return {
    id: msg.id,
    subject: header(msg.payload, 'Subject') || '(Sans objet)',
    from: header(msg.payload, 'From'),
    date: dateOf(msg),
    snippet: decodeEntities(msg.snippet || ''),
    unread: (msg.labelIds || []).includes('UNREAD'),
    // Au format metadata, Gmail ne détaille pas les parties : un message
    // « multipart/mixed » est celui qui porte des pièces jointes.
    hasAttachments: (msg.payload?.mimeType || '').toLowerCase() === 'multipart/mixed',
  };
}

/** Message complet, depuis un message demandé au format `full`. */
export function toComplet(msg: GmailMessage): EmailComplet {
  const textes: string[] = [];
  const htmls: string[] = [];
  const attachments: PieceJointe[] = [];
  const images: ImageIntegree[] = [];

  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    const disposition = header(part, 'Content-Disposition').toLowerCase();
    const contentId = normaliserCid(header(part, 'Content-ID'));
    const aContenu = !!(part.body?.attachmentId || part.body?.data);
    const estTexte = mime === 'text/plain' || mime === 'text/html';
    const fichier: PieceJointe = {
      filename: part.filename || (contentId ? contentId.split('@')[0] : '') || 'piece-jointe',
      mimeType: mime || 'application/octet-stream',
      size: part.body?.size || 0,
      attachmentId: part.body?.attachmentId,
      data: part.body?.attachmentId ? undefined : part.body?.data,
    };

    if (aContenu && mime.startsWith('image/') && contentId && !disposition.startsWith('attachment')) {
      images.push({ ...fichier, contentId });
    } else if (aContenu && (part.filename || disposition.startsWith('attachment') || (!estTexte && !mime.startsWith('multipart/')))) {
      attachments.push(fichier);
    } else if (part.body?.data && estTexte) {
      const contenu = decodeBytes(base64UrlToBytes(part.body.data), charsetOf(part));
      (mime === 'text/plain' ? textes : htmls).push(contenu);
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(msg.payload);

  const html = htmls.join('\n');
  // Une image « intégrée » que le HTML n'affiche pas reste accessible comme pièce jointe.
  const references = cidsReferences(html);
  const affichees = images.filter(img => references.has(img.contentId));
  for (const img of images) if (!affichees.includes(img)) attachments.push(img);

  const text = textes.length ? textes.join('\n') : htmlToText(html);
  return {
    ...toResume(msg),
    to: header(msg.payload, 'To'),
    text,
    html,
    attachments,
    images: affichees,
    hasAttachments: attachments.length > 0,
  };
}
