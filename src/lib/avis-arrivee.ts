// ─── Avis d'arrivée ───────────────────────────────────────────────────────────
// La compagnie maritime ou le transitaire prévient par email qu'un navire
// arrive : « Avis d'arrivée », « Arrival Notice ». On les reconnaît par règles
// (instantané, gratuit, sans IA) et on en tire ce qui sert au dossier : navire,
// date d'arrivée, n° de BL, conteneurs. Pur : testé par scripts/test-avis-arrivee.ts.
//
// Le texte est lu comme un tableau : chaque ligne est découpée une seule fois
// en cellules (« | », tabulation ou large blanc). La valeur d'un libellé est
// dans la suite de sa cellule, dans la cellule voisine, ou — sous un en-tête de
// tableau — dans la même colonne à la ligne suivante. Jamais plus loin : une
// date d'une autre ligne ne peut pas devenir la date d'arrivée. Chaque ligne
// n'est parcourue qu'un nombre borné de fois, quel que soit le message.

export type AvisArrivee = {
  /** Bout de texte qui a fait reconnaître l'avis — affiché pour justifier. */
  preuve: string;
  ou: 'objet' | 'piece_jointe' | 'corps';
  navire?: string;
  /** yyyy-mm-dd */
  dateArrivee?: string;
  bl?: string;
  conteneurs: string[];
};

type EmailLisible = {
  subject?: string;
  text?: string;
  attachments?: { filename?: string }[] | null;
};

/**
 * Recherche Gmail des avis d'arrivée reçus (ni envoyés, ni brouillons) sur
 * 120 jours. Elle ratisse large ; detecterAvisArrivee() tranche ensuite.
 */
export const RECHERCHE_GMAIL_AVIS =
  'newer_than:120d -in:sent -in:drafts -from:me {' +
  '"avis d\'arrivée" "avis d\'arrivee" "avis d arrivee" "avis arrivée" "avis arrivee" "avis d\'arrivé" ' +
  '"notification d\'arrivée" "notification d\'arrivee" "arrival notice" "arrival notification" "notice of arrival" ' +
  'filename:arrivee filename:arrival filename:arrivalnotice filename:avisarrivee filename:avisdarrivee}';

/** Au-delà, un message n'apporte plus rien à la détection et ne ferait que la ralentir. */
const TAILLE_MAX = 50_000;
/** Libellés examinés au plus par ligne : un message piégé n'en répète pas des milliers. */
const LIBELLES_PAR_LIGNE = 30;
/** Longueur lue pour une valeur : un nom de navire, une date ou un BL tiennent largement. */
const VALEUR_MAX = 80;
/**
 * Lectures de date autorisées par message. Un avis réel en fait quelques
 * centaines ; un message piégé (des milliers de libellés « ETA ») s'arrête là
 * au lieu de bloquer la page.
 */
const LECTURES_MAX = 4000;
let lecturesRestantes = LECTURES_MAX;

// ─── Normalisation ────────────────────────────────────────────────────────────
/**
 * Sans accents, apostrophes droites, lignes vides resserrées ; la casse et les
 * retours à la ligne sont gardés. Une tabulation ou un large blanc (colonnes
 * alignées d'un texte brut) devient un séparateur de cellule « | ».
 */
function aplatir(s: string | undefined, max = TAILLE_MAX): string {
  return (s || '')
    .slice(0, max)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200b-\u200d\u2060]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/\t[^\S\n]*|[^\S\n]{3,}/g, ' | ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[ \n]*/g, '\n');
}

// ─── Lignes et cellules ───────────────────────────────────────────────────────
type Ligne = {
  texte: string;
  /** Début de chaque cellule (la première commence à 0). */
  debuts: number[];
  /** En-tête de tableau : au moins trois cellules remplies et aucun chiffre. */
  entete: boolean;
};

function analyserLigne(texte: string): Ligne {
  const debuts = [0];
  for (let i = texte.indexOf('|'); i !== -1; i = texte.indexOf('|', i + 1)) debuts.push(i + 1);
  let remplies = 0;
  for (let c = 0; c < debuts.length && remplies < 3; c++) if (cellule({ texte, debuts, entete: false }, c).trim()) remplies++;
  // « NAVIRE | : | MSC ANNA » ou « Vessel: X | POL: Y » : des paires libellé/valeur, pas un en-tête.
  return { texte, debuts, entete: remplies >= 3 && !/\d/.test(texte) && !texte.includes(':') };
}

function decouper(texte: string): Ligne[] {
  return texte.split('\n').map(analyserLigne);
}

/** Indice de la cellule qui contient la position (recherche dichotomique). */
function indiceCellule(l: Ligne, pos: number): number {
  let bas = 0, haut = l.debuts.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if (l.debuts[milieu] <= pos) bas = milieu; else haut = milieu - 1;
  }
  return bas;
}

function finCellule(l: Ligne, i: number): number {
  return i + 1 < l.debuts.length ? l.debuts[i + 1] - 1 : l.texte.length;
}

function cellule(l: Ligne, i: number): string {
  if (i >= l.debuts.length) return '';
  return l.texte.slice(l.debuts[i], Math.min(finCellule(l, i), l.debuts[i] + VALEUR_MAX));
}

/**
 * Où peut se trouver la valeur d'un libellé occupant [debut, fin) de la ligne n :
 * la suite de sa cellule, la cellule voisine, la même colonne à la ligne suivante.
 */
const SEPARATEUR = /^[\s\-=_|+:]*[\-=_][\s\-=_|+:]*$/;
const sansDeuxPoints = (s: string) => s.replace(/^ ?: ?/, '');

function autour(lignes: Ligne[], n: number, debut: number, fin: number) {
  const l = lignes[n];
  const iv = indiceCellule(l, fin);
  // Sous un en-tête, une ligne de tirets ou de « = » sépare souvent les valeurs.
  const suivante = lignes[n + 1] && SEPARATEUR.test(lignes[n + 1].texte) ? lignes[n + 2] : lignes[n + 1];
  return {
    // « Navire\t: MSC ANNA » devient « Navire | : MSC ANNA » : le « : » n'est pas la valeur.
    reste: sansDeuxPoints(l.texte.slice(fin, Math.min(finCellule(l, iv), fin + VALEUR_MAX))),
    voisine: sansDeuxPoints(cellule(l, iv + 1).trim()),
    dessous: suivante ? cellule(suivante, indiceCellule(l, debut)) : '',
    avant: l.texte.slice(Math.max(0, debut - 25), debut),
    debutLigne: l.texte.slice(Math.max(0, debut - 60), debut),
    seulSurSaLigne: !l.texte.slice(0, debut).trim() && !l.texte.slice(fin, fin + VALEUR_MAX).trim(),
    entete: l.entete,
  };
}

/** Parcourt les libellés de chaque ligne, dans la limite de LIBELLES_PAR_LIGNE. */
function* libelles(lignes: Ligne[], motif: RegExp) {
  for (let n = 0; n < lignes.length; n++) {
    let vus = 0;
    for (const m of lignes[n].texte.matchAll(motif)) {
      if (++vus > LIBELLES_PAR_LIGNE) break;
      const debut = m.index ?? 0;
      yield { n, m, ...autour(lignes, n, debut, debut + m[0].length) };
    }
  }
}

// ─── Reconnaissance ───────────────────────────────────────────────────────────
// Formules qui désignent un avis d'arrivée à elles seules.
const MOTIFS_FORTS: RegExp[] = [
  /\bavis ?(?:de ?|d ?'? ?)?arrivee?\b/i,
  /\bnotification d ?'? ?arrivee?\b/i,
  /\barrival ?noti(?:ce|fication)\b/i,
  /\bnotice of arrival\b/i,
];
// Tournures qui parlent d'une arrivée sans être forcément un avis.
const MOTIFS_FAIBLES: RegExp[] = [
  /\bnavire\b.{0,30}\b(?:arrive|arrivera|accoste|accostera|a quai)\b/i,
  /\bvessel\b.{0,30}\b(?:arrived|arrives|arriving|will arrive|berthed|berthing)\b/i,
];

function premierMotif(texte: string, motifs: RegExp[]): string | null {
  for (const motif of motifs) {
    const m = texte.match(motif);
    if (m) return m[0].trim();
  }
  return null;
}

// Début de l'historique cité d'une réponse ou d'un transfert.
const CITATION = /^(?:>|(?:de|from|envoye|sent|expediteur) ?:|(?:le|on) .{0,120}(?:a ecrit|wrote) ?:?$|-{2,} ?(?:original message|message d'origine|forwarded message|message transfere))/i;

/** Le message lui-même, sans l'historique cité en dessous. */
function sansCitation(corps: string): string {
  const lignes = corps.split('\n');
  const i = lignes.findIndex(l => CITATION.test(l));
  return i === -1 ? corps : lignes.slice(0, i).join('\n');
}

// « Ci-joint l'avis d'arrivée » avec un PDF : l'avis est la pièce jointe.
const ENVOI_JOINT = /\b(?:ci-?joint|en piece jointe|voir (?:la )?piece jointe|p\.? ?j|voici|veuillez trouver|find attached|please find|here is|attached|enclosed)\b/i;
// « Pouvez-vous nous envoyer l'avis d'arrivée ? » : c'est une demande, pas un avis.
const DEMANDE = /\b(?:pouvez-vous|pourriez-vous|merci de (?:nous )?(?:envoyer|transmettre|faire parvenir)|please send|kindly send|could you send|enverrons|attendons)\b/i;
const FICHIER_DOCUMENT = /\.(?:pdf|jpe?g|png|tiff?)$/i;

// ─── Dates ────────────────────────────────────────────────────────────────────
const MOIS: [RegExp, number][] = [
  [/^janv?|^jan/, 1], [/^fevr?|^feb/, 2], [/^mars|^mar/, 3], [/^avr|^apr/, 4],
  [/^mai|^may/, 5], [/^juin|^jun/, 6], [/^juil|^jul/, 7], [/^aout|^aug/, 8],
  [/^sept?|^sep/, 9], [/^oct/, 10], [/^nov/, 11], [/^dec/, 12],
];

function moisDepuisNom(nom: string): number | null {
  const n = nom.toLowerCase();
  for (const [re, num] of MOIS) if (re.test(n)) return num;
  return null;
}

function isoSiValide(annee: number, mois: number, jour: number): string | null {
  if (annee < 100) annee += 2000;
  if (annee < 2015 || annee > 2040 || mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCMonth() !== mois - 1) return null; // 31/02 et consorts
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

const NOMS_MOIS = 'janv|janvier|jan|january|fevr|fevrier|feb|february|mars|mar|march|avr|avril|apr|april|mai|may|juin|jun|june|juil|juillet|jul|july|aout|aug|august|sept|septembre|sep|september|oct|octobre|october|nov|novembre|november|dec|decembre|december';
const JOUR_SEMAINE = /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? /i;
const DATE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/;
const DATE_CHIFFRES = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?!\d)/;
// « 14 octobre 2026 », « 14-Oct-26 », « 21/SEP/2026 ». Une année à deux chiffres
// suivie d'un mot (« 14 octobre, 30 cartons ») n'est pas une année.
const DATE_JOUR_MOIS = new RegExp(`^(\\d{1,2})(?:er|st|nd|rd|th)?[ \\-/]*(${NOMS_MOIS})\\.?(?:[ \\-/]+|, ?)(\\d{4}|\\d{2}(?! ?[a-z]))(?!\\d)`, 'i');
const DATE_MOIS_JOUR = new RegExp(`^(${NOMS_MOIS})\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})(?!\\d)`, 'i');

/** Date lue au tout début du fragment, avec la longueur lue. Jour avant mois, comme au Maroc. */
function lireDate(fragment: string): { iso: string; longueur: number } | null {
  if (--lecturesRestantes < 0) return null;
  const semaine = fragment.match(JOUR_SEMAINE);
  const decalage = semaine ? semaine[0].length : 0;
  const f = fragment.slice(decalage, decalage + 40);
  const lu = (iso: string | null, m: RegExpMatchArray) => (iso ? { iso, longueur: decalage + m[0].length } : null);

  let m = f.match(DATE_ISO);
  if (m) return lu(isoSiValide(+m[1], +m[2], +m[3]), m);
  m = f.match(DATE_CHIFFRES);
  if (m) {
    const a = +m[1], b = +m[2];
    // 09/25/2026 ne peut être que mois/jour : on retourne.
    return lu(b > 12 && a <= 12 ? isoSiValide(+m[3], a, b) : isoSiValide(+m[3], b, a), m);
  }
  m = f.match(DATE_JOUR_MOIS);
  if (m) { const mois = moisDepuisNom(m[2]); return lu(mois ? isoSiValide(+m[3], mois, +m[1]) : null, m); }
  m = f.match(DATE_MOIS_JOUR);
  if (m) { const mois = moisDepuisNom(m[1]); return lu(mois ? isoSiValide(+m[3], mois, +m[2]) : null, m); }
  return null;
}

/** Les dates du segment (lues en début de mot), avec le texte qui précède chacune. */
function datesDans(segment: string): { iso: string; avant: string }[] {
  const out: { iso: string; avant: string }[] = [];
  let finPrecedente = 0;
  for (let i = 0; i < segment.length; i++) {
    if (i > 0 && /[A-Za-z0-9]/.test(segment[i - 1])) continue;
    const d = lireDate(segment.slice(i, i + 50));
    if (!d) continue;
    out.push({ iso: d.iso, avant: segment.slice(Math.max(finPrecedente, i - 30), i) });
    i += d.longueur - 1;
    finPrecedente = i + 1;
  }
  return out;
}

const LIBELLES_DATE = new RegExp(
  '(?:date (?:prevue |previsionnelle |estimee )?(?:d\'|de |d )?(?:arrivee|accostage)(?: prevue| estimee)?' +
    '|arrivee (?:prevue|estimee|previsionnelle)|accostage(?: prevu)?' +
    '|^arrivee(?: navire)? ?(?=[:|]|le\\b)' +
    '|\\beta\\b|\\be\\.t\\.a\\.?|\\bata\\b|estimated time of arrival|arrival date|expected arrival|date of arrival|discharge date' +
    '|\\barrival ?(?=[:|])|arriving on|arrived on' +
    '|arrive(?:ra|e)?\\b[^|\\n]{0,40}?\\ble\\b|will arrive\\b[^|\\n]{0,40}?\\bon\\b' +
    '|accost\\w*[^|\\n]{0,40}?\\ble\\b|(?:sera )?a quai[^|\\n]{0,40}?\\ble\\b|\\battendue?s?\\b[^|\\n]{0,40}?\\ble\\b' +
    '|(?:expected|scheduled|due) to (?:arrive|berth)[^|\\n]{0,40}?\\bon\\b|\\barrives\\b[^|\\n]{0,40}?\\bon\\b' +
    '|\\bberth\\w*[^|\\n]{0,40}?\\bon\\b|en date du|date (?:et |\\/ ?)heure d\'arrivee|\\barrival on\\b)' +
    '(?: ?(?:le|on|at|du)\\b)? ?[:|\\-]? ?',
  'gi'
);
// Juste avant le libellé : « Previous ETA », « Original ETA ».
const LIBELLE_PERIME = /\b(?:previous|old|initial|initiale|ancienne|precedente|original|originale)\b[^|]*$/i;
// Juste avant une date : elle n'est pas (ou plus) la date d'arrivée.
const DATE_PERIMEE = /\b(?:au lieu d[eu']?|instead of|previous(?:ly)?|was|initial(?:e|ement|ly)?|ancienne|original(?:ly|e)?|franchise|free ?time|up to|jusqu'?au|updated on|mis a jour le|etd|depart|departure)\b/i;
// « ETA revised from 15/09 to 21/09 », « du 15/09 au 21/09 » : la première date est l'ancienne.
const DEBUT_INTERVALLE = /\b(?:from|du)\s*$/i;
// Escale ou départ : pas l'arrivée au Maroc.
const ETAPE = /\b(?:t\/s|tranship\w*|transbord\w*|pol|loading|chargement|origin|origine)\b/i;
// Destination : c'est bien l'arrivée qui compte.
const DESTINATION = /\b(?:pod|discharge|dechargement|destination|final|casablanca|tanger|agadir|jorf)\b/i;
// La date annoncée est la plus récente.
const DATE_A_JOUR = /\b(?:new|nouvelle|revised|revisee|updated|mise a jour|current|actuelle|reportee|decalee|latest|derniere)\b/i;

function extraireDate(lignes: Ligne[]): string | undefined {
  let premiere: string | undefined;
  let etape: string | undefined;
  for (const x of libelles(lignes, LIBELLES_DATE)) {
    if (LIBELLE_PERIME.test(x.avant)) continue;
    const dates = datesDans(x.reste);
    const valables = dates.filter((d, i) =>
      !DATE_PERIMEE.test(d.avant) && !(DEBUT_INTERVALLE.test(d.avant) && i < dates.length - 1)
    );
    // « ETD/ETA : 01/08/2026 - 21/09/2026 » : la seconde date est l'arrivée.
    let choix = /\betd ?\/ ?$/i.test(x.avant) ? valables[1] ?? valables[valables.length - 1] : valables[0];
    if (!dates.length && x.entete) {
      // En-tête de tableau (« ETD | ETA ») : la date est dessous, dans la même colonne.
      const d = lireDate(x.dessous.trim());
      if (d) choix = { iso: d.iso, avant: '' };
    } else if (!dates.length) {
      // « ETA Casablanca | 21/09/2026 », puis libellé en fin de ligne avec la date dessous.
      const d = lireDate(x.voisine.trim()) || lireDate(x.dessous.trim());
      if (d) choix = { iso: d.iso, avant: '' };
    }
    if (!choix) continue;
    const qualif = x.avant + x.m[0] + choix.avant;
    if (DATE_A_JOUR.test(qualif) || DESTINATION.test(qualif)) return choix.iso;
    if (ETAPE.test(x.debutLigne + x.m[0] + choix.avant)) { etape ??= choix.iso; continue; }
    premiere ??= choix.iso;
  }
  return premiere ?? etape;
}

// ─── Navire ───────────────────────────────────────────────────────────────────
// « Navire : X », « Vessel | X », « Vessel / Voyage : X / 612N », « Navire porteur : X ».
const LIBELLE_NAVIRE = /\b(?:nom du navire|navire(?: porteur| attendu| mere)?|vessel(?: name)?|m\/v)(?: ?(?:\/|&) ?voy(?:age)?\.?)? ?([:|])? ?/gi;
// Sans libellé, seul un nom EN MAJUSCULES juste après le mot passe (« le navire MSC ANNA »).
const NAVIRE_EN_CLAIR = /\b(?:[Nn]avire|NAVIRE|[Vv]essel|VESSEL|[Mm]\/[Vv]|MV) ([A-Z0-9][A-Z0-9 .\-]{2,40})/;
// Une cellule qui commence par l'un de ces mots est un libellé ou un titre, pas un nom.
const AUTRE_LIBELLE = /^(?:voyage|voy|port|pol|pod|eta|etd|ata|date|loading|discharge|arrival|departure|flag|pavillon|escale|call|shipper|consignee|notify|b\/l|bl|hbl|mbl|container|conteneur|booking|carrier|terminal|compagnie|imo|commodity|marchandise|details|particulars|information|info|name|nom|schedule|operator|agent|line|porteur|attendu|please|merci|bonjour|dear)\b/i;
// Ni un nom : « LE NAVIRE EST ARRIVÉ », « THE VESSEL HAS ARRIVED ».
const MOT_VIDE = /^(?:est|sera|a|au|aux|du|de|des|le|la|les|en|has|is|was|will|arriv\w*|the|to|on|at|doit|devrait|prevu\w*|expected|tbc|tba|n\/a)\b/i;
// Ce qui suit le nom dans la même cellule : verbe, voyage, autre champ.
const APRES_NOM = / (?:est|sera|arriv\w*|eta|etd|prevu\w*|expected|has|is|was|will|pol|pod|flag|pavillon|escale|port|imo|nombre|call|voyage|voy\.?|v\.? ?\d\w*)\b.*$/i;

/**
 * Nom de navire tiré d'une cellule, ou undefined si ce n'en est pas un.
 * `dessous` : valeur prise à la ligne suivante, où l'on exige un nom en
 * majuscules sans « : » (sinon c'est un autre champ ou une phrase).
 */
function nomDeNavire(brut: string, dessous = false): string | undefined {
  const cellule = brut.slice(0, VALEUR_MAX).replace(/^\s*m\/?v\.?\s+/i, '');
  if (dessous && cellule.includes(':')) return undefined;
  let nom = cellule.split(/[/,;:(]/)[0].trim();
  if (!nom || AUTRE_LIBELLE.test(nom) || MOT_VIDE.test(nom) || /^[a-z]/.test(nom)) return undefined;
  if (dessous) {
    const lettres = nom.replace(/[^A-Za-z]/g, '');
    if (!lettres || lettres.replace(/[^A-Z]/g, '').length < lettres.length * 0.8) return undefined;
  }
  nom = nom
    .replace(APRES_NOM, '')
    .replace(/ [a-z].*$/, '') // « MSC ANNA prévue le… »
    .replace(/(?: -)? (?=\w*\d)\w{3,}$/, '') // voyage final : « 012W », « - 612N »
    .replace(/[ .\-']+$/, '')
    .toUpperCase();
  return nom.length >= 3 && /[A-Z]/.test(nom) ? nom : undefined;
}

function extraireNavire(lignes: Ligne[]): string | undefined {
  for (const x of libelles(lignes, LIBELLE_NAVIRE)) {
    // Sans « : » ni « | », seul un libellé isolé sur sa ligne compte :
    // « le navire arrivera » n'annonce pas un nom.
    if (!x.m[1] && !x.seulSurSaLigne) continue;
    const essais: [string, boolean][] = x.entete
      ? [[x.dessous, true]]
      : [[x.reste, false], [x.reste.trim() ? '' : x.voisine, false], [x.dessous, true]];
    for (const [valeur, dessous] of essais) {
      const nom = valeur && nomDeNavire(valeur, dessous);
      if (nom) return nom;
    }
  }
  // Aucun libellé : un nom en majuscules dans une phrase.
  for (const l of lignes) {
    const clair = l.texte.match(NAVIRE_EN_CLAIR);
    const nom = clair && nomDeNavire(clair[1]);
    if (nom) return nom;
  }
  return undefined;
}

// ─── BL et conteneurs ─────────────────────────────────────────────────────────
const LIBELLE_BL = /\b(?:bill of lading|connaissement|[hm]?b\/l|[hm]?bl)\b(?: ?(?:n[°ºo]\.?|no\.?|number|nr\.?|#))? ?([:|\-])? ?/gi;

/** Numéro de BL en tête de la cellule : majuscules et chiffres, pas une date. */
function numeroBL(brut: string): string | undefined {
  const m = brut.trim().match(/^([A-Z0-9][A-Z0-9\-/]{5,24})(?![A-Za-z0-9])/);
  if (!m) return undefined;
  const bl = m[1].replace(/[\-/]+$/, '');
  if (lireDate(bl) || !/\d/.test(bl) || bl.replace(/[\-/]/g, '').length < 6) return undefined;
  return bl;
}

function extraireBL(lignes: Ligne[]): string | undefined {
  for (const x of libelles(lignes, LIBELLE_BL)) {
    if (/\bdate\b[^|]*$/i.test(x.avant)) continue; // « Date BL : 01/08/2026 »
    const essais = x.entete
      ? [x.dessous]
      : [x.reste, x.reste.trim() ? '' : x.voisine, x.reste.trim() && !x.seulSurSaLigne ? '' : x.dessous];
    for (const valeur of essais) {
      const bl = valeur && numeroBL(valeur);
      if (bl) return bl;
    }
  }
  return undefined;
}

/** Chiffre de contrôle ISO 6346 : écarte les suites de lettres et chiffres qui ressemblent à un conteneur. */
export function conteneurValide(code: string): boolean {
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(code)) return false;
  const valeurs: Record<string, number> = {};
  let v = 10;
  for (const lettre of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v++;
    valeurs[lettre] = v++;
  }
  let somme = 0;
  for (let i = 0; i < 10; i++) {
    const n = i < 4 ? valeurs[code[i]] : Number(code[i]);
    somme += n * 2 ** i;
  }
  return (somme % 11) % 10 === Number(code[10]);
}

function extraireConteneurs(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of texte.toUpperCase().matchAll(/\b([A-Z]{3}[UJZ]) ?-?(\d{6}) ?-?(\d)\b/g)) {
    const code = m[1] + m[2] + m[3];
    if (conteneurValide(code)) vus.add(code);
  }
  return Array.from(vus);
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────
/** L'avis d'arrivée porté par cet email, ou null si ce n'en est pas un. */
export function detecterAvisArrivee(email: EmailLisible): AvisArrivee | null {
  lecturesRestantes = LECTURES_MAX;
  const objet = aplatir(email.subject, 1000);
  const fichiers = (email.attachments || []).map(a => a?.filename || '');
  // « AVIS_ARRIVEE_MSC.pdf » doit se lire « AVIS ARRIVEE MSC pdf ».
  const piecesJointes = aplatir(fichiers.map(f => f.replace(/[_\-.]+/g, ' ')).join('\n'), 5000);
  const corps = aplatir(email.text);
  const lieux: [string, AvisArrivee['ou']][] = [[objet, 'objet'], [piecesJointes, 'piece_jointe'], [corps, 'corps']];

  let preuve: string | null = null;
  let ou: AvisArrivee['ou'] = 'objet';
  let faible = false;
  for (const motifs of [MOTIFS_FORTS, MOTIFS_FAIBLES]) {
    for (const [texte, lieu] of lieux) {
      preuve = premierMotif(texte, motifs);
      if (preuve) { ou = lieu; break; }
    }
    if (preuve) break;
    faible = true;
  }
  if (!preuve) return null;

  // Le message d'abord, l'historique cité ensuite : une réponse qui annonce
  // une nouvelle ETA l'emporte sur l'ancienne citée en dessous.
  const haut = sansCitation(corps);
  const lignesHaut = decouper(`${objet}\n${haut}`);
  const lignesTout = haut.length === corps.length ? lignesHaut : decouper(`${objet}\n${corps}`);
  const dateHaut = extraireDate(lignesHaut);
  const blHaut = extraireBL(lignesHaut);
  const conteneursHaut = extraireConteneurs(`${objet}\n${haut}`);
  const complete = <T,>(auDebut: T | undefined, lire: (l: Ligne[]) => T | undefined) =>
    auDebut ?? (lignesTout !== lignesHaut ? lire(lignesTout) : undefined);

  const avis: AvisArrivee = {
    preuve,
    ou,
    navire: complete(extraireNavire(lignesHaut), extraireNavire),
    dateArrivee: complete(dateHaut, extraireDate),
    bl: complete(blHaut, extraireBL),
    conteneurs: conteneursHaut.length ? conteneursHaut : extraireConteneurs(`${objet}\n${corps}`),
  };

  // « Merci de nous envoyer l'avis d'arrivée » n'est pas un avis. Une simple
  // mention (dans le corps, en tournure faible, ou dans l'objet d'une réponse
  // « RE: ») doit être accompagnée d'une donnée d'arrivée — celle du message
  // lui-même pour une réponse, pas de l'historique cité — ou de l'avis en
  // pièce jointe (« ci-joint l'avis d'arrivée » + un PDF).
  const reponse = /^(?:re|aw|antw|rep|sv) ?:/i.test(objet);
  // Une réponse hérite de l'objet d'origine : seules comptent les données de son corps.
  let donnees: boolean;
  if (reponse) {
    const lignesCorps = decouper(haut);
    donnees = !!(extraireDate(lignesCorps) || extraireBL(lignesCorps) || extraireConteneurs(haut).length);
  } else {
    donnees = !!(avis.dateArrivee || avis.bl || avis.conteneurs.length);
  }
  const avisEnPieceJointe = !!premierMotif(piecesJointes, MOTIFS_FORTS);
  const joint = fichiers.some(f => FICHIER_DOCUMENT.test(f)) && ENVOI_JOINT.test(haut) && !DEMANDE.test(haut);
  const simpleMention = !avisEnPieceJointe && (faible || ou === 'corps' || (ou === 'objet' && reponse));
  if (simpleMention && !donnees && !joint) return null;
  return avis;
}
