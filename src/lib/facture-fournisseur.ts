/**
 * Lecture d'une facture fournisseur au format de MH (NINGBO MH INDUSTRY) :
 * un classeur Excel « 26MH114221+INV.xlsx » dont l'onglet INV porte les prix
 * et l'onglet PL (packing list) les colis, poids et volumes — ligne pour ligne,
 * dans le même ordre. On lit aussi un tableau collé depuis Excel (tabulations).
 *
 * Structure commune aux deux onglets, repérée par la ligne d'en-tête
 * « DESCRIPTION OF GOODS » :
 *
 *   43-24 13# No.5 A/L Slider … for Plastic Zipper 4.3g/pc        ← ligne titre
 *   6573-5140  500pcs/bag 10bags/carton | 102000 | pcs. | …        ← ligne détail
 *
 * Une ligne titre peut avoir plusieurs lignes détail (codes ou prix différents).
 * Les onglets « INV (2) », « PL (2) » sont des copies retouchées pour la
 * déclaration : on les ignore, seuls INV et PL font foi.
 *
 * Aucune dépendance au navigateur : le module se teste avec tsx.
 */

import type { WorkBook } from 'xlsx';

export type LigneFacture = {
  /** Rang dans la facture (0, 1, 2…) — sert de clé stable. */
  index: number;
  /** Référence de ligne du fournisseur : « 43-24 ». Vide si la ligne n'a pas de titre. */
  ref: string;
  /** Texte du titre sans la référence : « 13# No.5 A/L Slider … 4.3g/pc ». */
  titre: string;
  /** Code article du fournisseur : « 6573-5140 ». */
  code: string;
  /** Reste de la ligne détail : « 500pcs/bag 10bags/carton ». */
  spec: string;
  quantite: number | null;
  unite: string;
  /** Prix unitaire USD, dans l'unité de la facture (onglet INV). */
  prixUnitaire: number | null;
  montant: number | null;
  colis: number | null;
  /** Poids net total de la ligne, kg (onglet PL). */
  poidsNet: number | null;
  poidsBrut: number | null;
  /** Volume total de la ligne, m³ (onglet PL). */
  volume: number | null;
};

export type TotauxFacture = {
  colis: number | null;
  poidsNet: number | null;
  poidsBrut: number | null;
  volume: number | null;
  montant: number | null;
};

export type LectureFacture = {
  fournisseur: string;
  numeroFacture: string;
  numeroCommande: string;
  dateFacture: string;
  lignes: LigneFacture[];
  /** Fret porté par la facture (« FREIGHT CHARGE »), USD ; la somme s'il y en a plusieurs. */
  fret: number | null;
  /** Chaque ligne de fret trouvée : plus d'une, il faut regarder avant de reporter. */
  frets: number[];
  totaux: TotauxFacture;
  /** Ce qui a été trouvé : les prix (INV), les poids et volumes (PL). */
  aLesPrix: boolean;
  aLesPoids: boolean;
  /** La somme des lignes ne retombe pas sur le total du document (poids ou volume). */
  totauxIncoherents: boolean;
  /** Ce qui cloche, dit pour l'utilisateur. */
  avertissements: string[];
};

type Format = 'eu' | 'us';
type Cellule = string | number | boolean | null | undefined;

// ── Nombres ──────────────────────────────────────────────────────────────────

const EU = /^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/;
const US = /^-?\d{1,3}(,\d{3})*\.\d+$|^-?\d+\.\d+$/;
const MILLIERS_EU = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
const MILLIERS_US = /^-?[1-9]\d{0,2}(,\d{3})+$/;

const nettoyer = (s: string) => s.replace(/US\$|USD|\$| |\s/gi, '');

/**
 * Devine si les nombres écrits en texte sont à la française (1.000,00) ou à
 * l'anglaise (1,000.00). Un tableau copié depuis un Excel français arrive en
 * « 420,00 » ; le classeur lui-même donne de vrais nombres.
 */
export function detecterFormat(cellules: Cellule[]): Format {
  let eu = 0;
  let us = 0;
  for (const c of cellules) {
    if (typeof c !== 'string') continue;
    const s = nettoyer(c);
    // « 1,600 » ou « 1.600 » : milliers ou décimales selon le pays — ne départage rien.
    if (!s || /^-?\d{1,3}([.,]\d{3})+$/.test(s)) continue;
    if (EU.test(s)) eu++;
    else if (US.test(s)) us++;
  }
  return eu > us ? 'eu' : 'us';
}

export function lireNombre(v: Cellule, format: Format = 'us'): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = nettoyer(v);
  if (!s || !/^-?[\d.,]*\d[\d.,]*$/.test(s)) return null;
  let t = s;
  if (format === 'eu') {
    // « 1.000,00 » → 1000 ; « 1.272 » → 1272 ; « 0.315 » reste un décimal.
    if (s.includes(',')) t = s.replace(/\./g, '').replace(',', '.');
    else if (MILLIERS_EU.test(s)) t = s.replace(/\./g, '');
  } else {
    // « 1,000.00 » → 1000 ; « 1,272 » → 1272 ; « 420,00 » isolé → 420.
    if (s.includes('.')) t = s.replace(/,/g, '');
    else if (MILLIERS_US.test(s)) t = s.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(s)) t = s.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── Grille de cellules ───────────────────────────────────────────────────────

const texte = (c: Cellule) => (c == null ? '' : String(c).replace(/\s+/g, ' ').trim());

type Colonnes = {
  desc: number;
  qte: number;
  unite: number;
  prix: number;
  montant: number;
  colis: number;
  nw: number;
  gw: number;
  cbm: number;
};

/** Une ligne d'en-tête « DESCRIPTION OF GOODS … ITEM NO. » : le format « YAHI », non lu. */
const estEnteteYahi = (ligne: Cellule[]) =>
  ligne.some(c => /^DESCRIPTION OF GOODS/i.test(texte(c))) && ligne.some(c => /^ITEM NO\.?$/i.test(texte(c)));

function trouverColonnes(ligne: Cellule[]): Colonnes | null {
  const idx = (re: RegExp) => ligne.findIndex(c => re.test(texte(c)));
  const desc = idx(/^DESCRIPTION OF GOODS/i);
  const qte = idx(/^QUANTITY\b/i);
  if (desc < 0 || qte < 0) return null;
  // Le format « YAHI » (ORDER NO. / ITEM NO. …) décale ses colonnes : on ne le lit pas.
  if (estEnteteYahi(ligne)) return null;
  // L'unité peut partager la cellule de l'en-tête : « N.W. (KGS) », « MEAS.(CBM) ».
  const colonnes: Colonnes = {
    desc,
    qte,
    unite: qte + 1,
    prix: idx(/^UNIT\s*PRICE/i),
    montant: idx(/^AMOUNT/i),
    colis: idx(/^PKGS?\.?(\s|\(|$)/i),
    nw: idx(/^N\.?\s?W\.?(\s|\(|$)/i),
    gw: idx(/^G\.?\s?W\.?(\s|\(|$)/i),
    cbm: idx(/^MEAS/i),
  };
  return colonnes;
}

const RE_TITRE = /^(\d{1,3}(?:-\d{1,3})+)\s+(.+)$/;
const RE_CODE = /^(\d{3,4}-\d{3,4}[A-Z]{0,2})(?=[\s,/(]|$)\s*(.*)$/i;
const RE_TOTAL = /^(GRAND\s+|SUB\s*-?\s*)?TOTAL(\s+AMOUNT)?\s*[:：]?$/i;

type Tableau = {
  lignes: LigneFacture[];
  frets: number[];
  totaux: TotauxFacture;
  /** Une ligne de total trouvée (sinon, pas de contrôle des sommes possible). */
  aUnTotal: boolean;
  aLesPrix: boolean;
  aLesPoids: boolean;
};

/**
 * Lit un tableau (un onglet, ou un collage) à partir de sa ligne d'en-tête.
 * Renvoie null s'il n'y a pas d'en-tête « DESCRIPTION OF GOODS ».
 */
function lireTableau(grille: Cellule[][], debut: number, format: Format): Tableau | null {
  const col = trouverColonnes(grille[debut] || []);
  if (!col) return null;
  const num = (r: Cellule[], i: number) => (i >= 0 ? lireNombre(r[i], format) : null);

  const lignes: LigneFacture[] = [];
  const totaux: TotauxFacture = { colis: null, poidsNet: null, poidsBrut: null, volume: null, montant: null };
  const frets: number[] = [];
  let aUnTotal = false;
  let titre = { ref: '', texte: '' };

  for (let i = debut + 1; i < grille.length; i++) {
    const r = grille[i] || [];
    // La description peut déborder sur les cellules voisines avant la quantité.
    const desc = r.slice(col.desc, col.qte).map(texte).filter(Boolean).join(' ').trim();
    const cellules = r.map(texte);

    // Une nouvelle ligne d'en-tête : fin de ce tableau.
    if (i > debut + 1 && trouverColonnes(r)) break;

    // Totaux : « TOTAL: » (packing list), « TOTAL AMOUNT: » (facture), « GRAND TOTAL »…
    const libelleTotal = cellules.find(c => RE_TOTAL.test(c));
    if (libelleTotal) {
      if (/^SUB/i.test(libelleTotal)) continue;
      aUnTotal = true;
      if (/AMOUNT/i.test(libelleTotal)) {
        totaux.montant = num(r, col.montant) ?? lireNombre(cellules.filter(Boolean).pop(), format);
      } else {
        totaux.colis = num(r, col.colis);
        totaux.poidsNet = num(r, col.nw);
        totaux.poidsBrut = num(r, col.gw);
        totaux.volume = num(r, col.cbm);
        totaux.montant = num(r, col.montant) ?? totaux.montant;
      }
      continue;
    }
    if (/^(SAYS|PACKED IN|SHIPPING MARK)/i.test(desc)) continue;
    if (/FREIGHT/i.test(desc)) {
      const f = num(r, col.montant);
      if (f != null) frets.push(f);
      continue;
    }

    const quantite = num(r, col.qte);
    const prixUnitaire = num(r, col.prix);
    const montant = num(r, col.montant);
    const colis = num(r, col.colis);
    const poidsNet = num(r, col.nw);
    const poidsBrut = num(r, col.gw);
    const volume = num(r, col.cbm);
    const unite = texte(r[col.unite]);
    const aDesChiffres = [quantite, prixUnitaire, montant, colis, poidsNet, volume].some(v => v != null);
    const code = desc.match(RE_CODE);

    // Sans description ni quantité, une ligne n'est jamais une marchandise
    // (total sous un autre libellé, reste d'une mise en page décalée).
    if (!desc && quantite == null) continue;

    const titreSeul = desc.match(RE_TITRE);
    const quantiteSeule = quantite != null && [prixUnitaire, montant, poidsNet, volume].every(v => v == null);
    if (!aDesChiffres || (titreSeul && !code && quantiteSeule)) {
      // Ligne titre (« 43-24 13# No.5 … »), ou libellé sans chiffres (« ELSE FEE »).
      // Une ligne à code sans chiffres ne devient pas le titre des suivantes.
      if (desc && !code) titre = titreSeul ? { ref: titreSeul[1], texte: titreSeul[2].trim() } : { ref: '', texte: desc };
      continue;
    }
    // Montant seul sans quantité ni poids : frais divers, pas une marchandise.
    if (quantite == null && poidsNet == null && volume == null && !unite) continue;

    // Ligne détail « 6573-5140 500pcs/bag… » sous son titre ; ou ligne autonome
    // (« SMART LOCK | 7 | PKGS ») qui porte elle-même sa description.
    const m = code;
    const autonome = !m && Boolean(desc);
    lignes.push({
      index: lignes.length,
      ref: autonome ? '' : titre.ref,
      titre: autonome ? desc : titre.texte,
      code: m ? m[1].toUpperCase() : '',
      spec: m ? m[2].trim() : '',
      quantite,
      unite,
      prixUnitaire,
      montant,
      colis,
      poidsNet,
      poidsBrut,
      volume,
    });
  }

  return {
    lignes,
    frets,
    totaux,
    aUnTotal,
    aLesPrix: col.prix >= 0 || col.montant >= 0,
    aLesPoids: col.nw >= 0 || col.cbm >= 0,
  };
}

// ── En-tête : n° de facture, commande, date, fournisseur ──────────────────────

function lireEntete(grille: Cellule[][]) {
  const valeurApres = (re: RegExp) => {
    for (const r of grille.slice(0, 15)) {
      const i = r.findIndex(c => re.test(texte(c)));
      if (i < 0) continue;
      const suite = r.slice(i + 1).map(texte).find(Boolean);
      if (suite) return suite;
      // « INVOICE NO: 26MH114221 » dans une seule cellule.
      const m = texte(r[i]).match(/:\s*(.+)$/);
      if (m) return m[1].trim();
    }
    return '';
  };
  const fournisseur =
    grille.slice(0, 5).map(r => r.map(texte).find(c => /CO\.?,?\s*LTD|INDUSTRY|TRADING/i.test(c))).find(Boolean) || '';
  return {
    fournisseur,
    numeroFacture: valeurApres(/^INVOICE NO\.?:?/i).toUpperCase(),
    numeroCommande: valeurApres(/^ORDER NO\.?:?$/i),
    dateFacture: valeurApres(/^DATE:?$/i),
  };
}

// ── Assemblage facture + packing list ────────────────────────────────────────

const cle = (l: LigneFacture) => `${l.ref}|${l.code}`;
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * Rapproche les lignes de la facture (prix) et du packing list (poids, volume).
 * Les deux onglets suivent le même ordre : on apparie ligne à ligne sur la
 * référence et le code (la quantité peut manquer d'un côté). Si l'ordre
 * diverge, on cherche la même référence + code, à quantité égale d'abord.
 */
function fusionner(inv: LigneFacture[], pl: LigneFacture[], avertissements: string[]): LigneFacture[] {
  if (!inv.length) return pl;
  if (!pl.length) return inv;
  const memeOrdre = inv.length === pl.length && inv.every((l, i) => cle(l) === cle(pl[i]));
  const restantes = [...pl];
  const ecarts: string[] = [];
  const fusion = inv.map((l, i) => {
    let p: LigneFacture | undefined;
    if (memeOrdre) p = pl[i];
    else {
      const memes = restantes.filter(x => cle(x) === cle(l));
      p = memes.find(x => x.quantite === l.quantite)
        ?? memes.find(x => x.quantite == null || l.quantite == null)
        ?? (memes.length === 1 ? memes[0] : undefined);
      if (p) restantes.splice(restantes.indexOf(p), 1);
    }
    if (!p) return l;
    if (l.quantite != null && p.quantite != null && l.quantite !== p.quantite) {
      ecarts.push(`${[l.ref, l.code].filter(Boolean).join(' ')} (facture ${l.quantite}, packing list ${p.quantite})`);
    }
    return {
      ...l,
      quantite: l.quantite ?? p.quantite,
      unite: l.unite || p.unite,
      colis: p.colis,
      poidsNet: p.poidsNet,
      poidsBrut: p.poidsBrut,
      volume: p.volume,
    };
  });
  if (ecarts.length) avertissements.push(`Quantités différentes entre facture et packing list : ${ecarts.join(' ; ')}. La facture fait foi.`);
  if (!memeOrdre) {
    const sansPoids = fusion.filter(l => l.poidsNet == null && l.volume == null).length;
    if (sansPoids) avertissements.push(`${pluriel(sansPoids, 'ligne de la facture introuvable', 'lignes de la facture introuvables')} dans le packing list : poids et volume inconnus, ceux des fiches sont gardés.`);
    if (restantes.length) avertissements.push(`${pluriel(restantes.length, 'ligne du packing list absente', 'lignes du packing list absentes')} de la facture : ignorée${restantes.length > 1 ? 's' : ''}.`);
  }
  return fusion;
}

/** Les tableaux d'un même onglet (coupés par un saut de page) mis bout à bout. */
function boutABout(tableaux: Tableau[]): Tableau | undefined {
  if (!tableaux.length) return undefined;
  if (tableaux.length === 1) return tableaux[0];
  const dernier = <K extends keyof TotauxFacture>(k: K) =>
    [...tableaux].reverse().map(t => t.totaux[k]).find(v => v != null) ?? null;
  return {
    lignes: tableaux.flatMap(t => t.lignes),
    frets: tableaux.flatMap(t => t.frets),
    totaux: { colis: dernier('colis'), poidsNet: dernier('poidsNet'), poidsBrut: dernier('poidsBrut'), volume: dernier('volume'), montant: dernier('montant') },
    aUnTotal: tableaux.some(t => t.aUnTotal),
    aLesPrix: tableaux.some(t => t.aLesPrix),
    aLesPoids: tableaux.some(t => t.aLesPoids),
  };
}

function assembler(grilles: { nom: string; grille: Cellule[][]; format: Format }[]): LectureFacture {
  const avertissements: string[] = [];
  let entete = { fournisseur: '', numeroFacture: '', numeroCommande: '', dateFacture: '' };
  const factures: { nom: string; t: Tableau }[] = [];
  const packings: { nom: string; t: Tableau }[] = [];
  let yahi = false;

  for (const { nom, grille, format } of grilles) {
    const e = lireEntete(grille);
    entete = {
      fournisseur: entete.fournisseur || e.fournisseur,
      numeroFacture: entete.numeroFacture || e.numeroFacture,
      numeroCommande: entete.numeroCommande || e.numeroCommande,
      dateFacture: entete.dateFacture || e.dateFacture,
    };
    const inv: Tableau[] = [];
    const pl: Tableau[] = [];
    grille.forEach((r, i) => {
      if (estEnteteYahi(r)) yahi = true;
      if (!trouverColonnes(r)) return;
      const t = lireTableau(grille, i, format);
      if (!t || !t.lignes.length) return;
      (t.aLesPoids ? pl : inv).push(t);
    });
    const i = boutABout(inv);
    const p = boutABout(pl);
    if (i) factures.push({ nom, t: i });
    if (p) packings.push({ nom, t: p });
  }

  const vide = {
    ...entete, lignes: [], fret: null, frets: [],
    totaux: { colis: null, poidsNet: null, poidsBrut: null, volume: null, montant: null },
    aLesPrix: false, aLesPoids: false, totauxIncoherents: false,
  };
  if (!factures.length && !packings.length) {
    return {
      ...vide,
      avertissements: [yahi
        ? 'Format « YAHI » (colonne ITEM NO.) non pris en charge : prends le classeur …+INV.xlsx (onglets INV et PL), ou colle le tableau.'
        : 'Aucun tableau « DESCRIPTION OF GOODS » trouvé.'],
    };
  }
  // Un onglet de chaque sorte ; s'il y en a d'autres, on le dit.
  if (factures.length > 1) avertissements.push(`${factures.length} factures trouvées : seul l'onglet « ${factures[0].nom} » est lu.`);
  if (packings.length > 1) avertissements.push(`${packings.length} packing lists trouvés : seul l'onglet « ${packings[0].nom} » est lu.`);
  const inv = factures[0]?.t;
  const pl = packings[0]?.t;

  const lignes = fusionner(inv?.lignes || [], pl?.lignes || [], avertissements).map((l, index) => ({ ...l, index }));
  const totaux: TotauxFacture = {
    colis: pl?.totaux.colis ?? null,
    poidsNet: pl?.totaux.poidsNet ?? null,
    poidsBrut: pl?.totaux.poidsBrut ?? null,
    volume: pl?.totaux.volume ?? null,
    montant: inv?.totaux.montant ?? pl?.totaux.montant ?? null,
  };

  // Contrôles : la somme des lignes doit retomber sur les totaux du document.
  const somme = (k: 'poidsNet' | 'volume') => lignes.reduce((s, l) => s + (l[k] || 0), 0);
  const ecart = (a: number, b: number | null) => b != null && Math.abs(a - b) > Math.max(0.011, Math.abs(b) * 0.001);
  let totauxIncoherents = false;
  if (ecart(somme('poidsNet'), totaux.poidsNet)) {
    totauxIncoherents = true;
    avertissements.push(`Poids net : les lignes font ${arrondir(somme('poidsNet'))} kg, le total du packing list ${totaux.poidsNet} kg.`);
  }
  if (ecart(somme('volume'), totaux.volume)) {
    totauxIncoherents = true;
    avertissements.push(`Volume : les lignes font ${arrondir(somme('volume'))} m³, le total du packing list ${totaux.volume} m³.`);
  }
  if (pl && !pl.aUnTotal) avertissements.push('Packing list sans ligne TOTAL : les sommes de poids et de volume ne peuvent pas être contrôlées.');
  const sansQuantite = lignes.filter(l => l.quantite == null).length;
  if (sansQuantite) avertissements.push(`${pluriel(sansQuantite, 'ligne', 'lignes')} sans quantité dans le document.`);

  const frets = inv?.frets.length ? inv.frets : pl?.frets || [];
  if (frets.length > 1) avertissements.push(`${frets.length} lignes de fret (${frets.join(' + ')} $) : vérifie avant de reporter le total dans le dossier.`);

  return {
    ...entete,
    lignes,
    fret: frets.length ? arrondir(frets.reduce((s, f) => s + f, 0)) : null,
    frets,
    totaux,
    aLesPrix: Boolean(inv?.aLesPrix || pl?.aLesPrix),
    aLesPoids: Boolean(pl?.aLesPoids),
    totauxIncoherents,
    avertissements,
  };
}

const arrondir = (n: number) => Math.round(n * 100) / 100;

/** Onglets d'origine seulement : « INV (2) », « PL(2) » sont des copies retouchées. */
const estCopie = (nom: string) => /\(\s*\d+\s*\)\s*$/.test(nom);

/** Lit un classeur déjà ouvert avec la bibliothèque xlsx. */
export function lireClasseurFacture(wb: WorkBook, utils: typeof import('xlsx').utils): LectureFacture {
  const noms = wb.SheetNames.filter(n => !estCopie(n));
  const grilles = noms.map(nom => {
    const grille = utils.sheet_to_json<Cellule[]>(wb.Sheets[nom], { header: 1, raw: true, defval: null, blankrows: true });
    return { nom, grille, format: detecterFormat(grille.flat()) };
  });
  return assembler(grilles);
}

/** Lit un tableau copié depuis Excel et collé (colonnes séparées par des tabulations). */
export function lireTexteColle(textelibre: string): LectureFacture {
  const grille: Cellule[][] = textelibre
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.split('\t'));
  return assembler([{ nom: 'collage', grille, format: detecterFormat(grille.flat()) }]);
}
