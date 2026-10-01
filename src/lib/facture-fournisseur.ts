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
  /**
   * Répartition lue dans le packing details (onglet PD) : couleurs, tailles,
   * dans l'unité de la ligne. Absente sans PD ou si ses quantités ne
   * retombent pas sur celle de la ligne.
   */
  details?: Detail[];
};

/** Une variante expédiée : « BLACK NICKEL · 50 000 », « WHITE 25MM · 244 kg ». */
export type Detail = {
  couleur: string;
  taille: string;
  quantite: number;
  /** Le modèle ou code de la colonne STYLE / ITEM NO. — jamais pris pour une couleur. */
  modele?: string;
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
  /** Un packing details a donné les couleurs ou tailles d'au moins une ligne. */
  aLesDetails: boolean;
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

// « 43-24 13# No.5 … » (MH), « 119-01. No.3 … », « 123-01.NO.5 … » (NINGBO APPAREL).
const RE_TITRE = /^(\d{1,3}(?:-\d{1,3})+)(?:\.\s*|\s+)(.+)$/;
/** Une unité par lot : « 100PCS » = la quantité se compte par centaines de pièces. */
const RE_UNITE_LOT = /^(\d+)\s*(PCS?|PIECES?|SETS?)\.?$/i;
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
  /** Lignes qui partageaient leurs colis, poids et volume (cellules fusionnées), réparties au prorata. */
  partages: string[];
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
  // Un titre numéroté vient d'être lu et n'a pas encore de ligne : la ligne
  // suivante sans code est son détail (« 119-01. No.3 Nylon Zipper » puis
  // « 20cm , C/E , PIN LOCK SLIDER | 1900 | 100PCS »), pas une ligne autonome.
  let titreEnAttente = false;

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
    // « FREIGHT CHARGE » en description (MH), « SEA FREIGHT » dans la colonne des prix (NINGBO APPAREL).
    if (/FREIGHT/i.test(desc) || (!desc && cellules.some(c => /FREIGHT/i.test(c)))) {
      const f = num(r, col.montant);
      if (f != null) frets.push(f);
      continue;
    }

    let quantite = num(r, col.qte);
    let prixUnitaire = num(r, col.prix);
    const montant = num(r, col.montant);
    const colis = num(r, col.colis);
    const poidsNet = num(r, col.nw);
    const poidsBrut = num(r, col.gw);
    const volume = num(r, col.cbm);
    let unite = texte(r[col.unite]);
    // « 1900 | 100PCS » : ramené en pièces (190 000 pcs), le prix à la pièce.
    const lot = unite.match(RE_UNITE_LOT);
    if (lot && Number(lot[1]) > 1) {
      const k = Number(lot[1]);
      if (quantite != null) quantite = Math.round(quantite * k * 1000) / 1000;
      if (prixUnitaire != null) prixUnitaire = Math.round((prixUnitaire / k) * 1e8) / 1e8;
      unite = lot[2].toLowerCase().replace(/^pieces?$/, 'pcs');
    }
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
      if (desc && !code) {
        titre = titreSeul ? { ref: titreSeul[1], texte: titreSeul[2].trim() } : { ref: '', texte: desc };
        titreEnAttente = Boolean(titreSeul);
      }
      continue;
    }
    // Montant seul sans quantité ni poids : frais divers, pas une marchandise.
    if (quantite == null && poidsNet == null && volume == null && !unite) continue;

    // Ligne détail « 6573-5140 500pcs/bag… » sous son titre ; ou ligne autonome
    // (« SMART LOCK | 7 | PKGS ») qui porte elle-même sa description.
    const m = code;
    const sousLeTitre = !m && titreEnAttente;
    const autonome = !m && !sousLeTitre && Boolean(desc);
    titreEnAttente = false;
    lignes.push({
      index: lignes.length,
      ref: autonome ? '' : titre.ref,
      titre: autonome ? desc : titre.texte,
      code: m ? m[1].toUpperCase() : '',
      spec: m ? m[2].trim() : sousLeTitre ? desc : '',
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

  const aLesPoids = col.nw >= 0 || col.cbm >= 0;
  return {
    lignes,
    frets,
    totaux,
    aUnTotal,
    aLesPrix: col.prix >= 0 || col.montant >= 0,
    aLesPoids,
    partages: aLesPoids ? repartirCellulesFusionnees(lignes) : [],
  };
}

const sansMesures = (l: LigneFacture) => [l.colis, l.poidsNet, l.poidsBrut, l.volume].every(v => v == null);

/**
 * Cellules fusionnées du packing list : une ligne sans colis, poids ni volume
 * qui suit une ligne qui en a partage les siens (NINGBO APPAREL, 123-01 et
 * 123-02 : 602 colis, 8 608,6 kg, 26 m³ pour les deux). Sans partage, la
 * première porterait le tout. On répartit au prorata des quantités, même
 * unité seulement ; la dernière ligne prend l'arrondi pour garder le total.
 * Renvoie les groupes répartis, pour le dire à l'utilisateur.
 */
function repartirCellulesFusionnees(lignes: LigneFacture[]): string[] {
  const dits: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const tete = lignes[i];
    if (sansMesures(tete) || tete.quantite == null) continue;
    let fin = i + 1;
    while (fin < lignes.length && sansMesures(lignes[fin]) && lignes[fin].quantite != null
      && lignes[fin].unite.toLowerCase() === tete.unite.toLowerCase()) fin++;
    if (fin === i + 1) continue;
    const groupe = lignes.slice(i, fin);
    const total = groupe.reduce((s, l) => s + l.quantite!, 0);
    if (total <= 0) continue;
    const champs: [keyof Pick<LigneFacture, 'colis' | 'poidsNet' | 'poidsBrut' | 'volume'>, number][] =
      [['colis', 0], ['poidsNet', 2], ['poidsBrut', 2], ['volume', 3]];
    for (const [k, d] of champs) {
      const v = tete[k];
      if (v == null) continue;
      let reste = v;
      groupe.forEach((l, j) => {
        const part = j === groupe.length - 1 ? reste : Math.round((v * l.quantite! / total) * 10 ** d) / 10 ** d;
        l[k] = Math.round(part * 10 ** d) / 10 ** d;
        reste -= part;
      });
    }
    dits.push(groupe.map(l => [l.ref, l.code].filter(Boolean).join(' ') || l.titre).join(' et '));
    i = fin - 1;
  }
  return dits;
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
    numeroPD: numeroPackingDetails(grille),
    numeroCommande: valeurApres(/^ORDER NO\.?:?$/i),
    dateFacture: valeurApres(/^DATE:?$/i),
  };
}

/** « PACKING DETAILS OF 26MH114221 » (MH), « PACKING DETAILS-25931A » (NINGBO APPAREL) en tête du PD. */
const RE_TETE_PD = /^PACKING DETAILS?(?:\s+OF)?[\s:：-]+([A-Z0-9][A-Z0-9-]*)/i;
const numeroPackingDetails = (grille: Cellule[][]) =>
  (grille.slice(0, 5).flatMap(r => r.map(texte)).map(c => c.match(RE_TETE_PD)?.[1]).find(Boolean) || '').toUpperCase();

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
    partages: tableaux.flatMap(t => t.partages),
  };
}

/** `nom` : ce qu'on montre (« fichier · onglet » quand il y a plusieurs fichiers) ; `onglet` : le nom de l'onglet seul. */
type Grille = { nom: string; onglet: string; grille: Cellule[][]; format: Format };

function assembler(grilles: Grille[]): LectureFacture {
  const avertissements: string[] = [];
  let entete = { fournisseur: '', numeroFacture: '', numeroCommande: '', dateFacture: '' };
  let numeroPD = '';
  const numerosFacture = new Set<string>();
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
    numeroPD ||= e.numeroPD;
    if (e.numeroFacture) numerosFacture.add(e.numeroFacture);
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

  // Sans « INVOICE NO. » nulle part, le n° en tête du PD.
  entete.numeroFacture ||= numeroPD;
  const vide = {
    ...entete, lignes: [], fret: null, frets: [],
    totaux: { colis: null, poidsNet: null, poidsBrut: null, volume: null, montant: null },
    aLesPrix: false, aLesPoids: false, totauxIncoherents: false, aLesDetails: false,
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
  if (pl?.partages.length) {
    avertissements.push(`Colis, poids et volume communs dans le packing list (cellules fusionnées) pour ${pl.partages.join(' ; ')} : répartis au prorata des quantités, vérifie.`);
  }

  // Couleurs et tailles du packing details, quand il est là (onglet PD ou collage).
  const blocs = grilles.flatMap(g => lireBlocsDetails(g.grille, g.format));
  const avecDetails = blocs.length ? rattacherDetails(lignes, blocs, avertissements) : 0;
  const pdFourni = grilles.some(g => g.onglet === 'packing details' || /^PD/i.test(g.onglet)) || Boolean(numeroPD);
  if (pdFourni && !blocs.length) {
    avertissements.push('Packing details : aucun tableau COLOR / SIZE reconnu — couleurs et tailles non lues.');
  } else if (pdFourni && !avecDetails) {
    avertissements.push('Packing details lu mais rattaché à aucune ligne du PL (titres ou codes différents ?) — couleurs et tailles non lues.');
  }
  if (numerosFacture.size > 1) {
    avertissements.push(`Les fichiers portent des n° de facture différents (${[...numerosFacture].join(', ')}) : vérifie qu'ils vont ensemble.`);
  }
  const memeNumero = (a: string, b: string) => a === b || a.endsWith(b) || b.endsWith(a);
  if (numeroPD && entete.numeroFacture && !memeNumero(numeroPD, entete.numeroFacture)) {
    avertissements.push(`Le packing details porte le n° ${numeroPD}, la facture le n° ${entete.numeroFacture} : vérifie que c'est le bon PD.`);
  }
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
    avertissements.push(`Poids net : les lignes font ${arrondir(somme('poidsNet'))} kg, le total du packing list ${arrondir(totaux.poidsNet!)} kg.`);
  }
  if (ecart(somme('volume'), totaux.volume)) {
    totauxIncoherents = true;
    avertissements.push(`Volume : les lignes font ${arrondir(somme('volume'))} m³, le total du packing list ${arrondir(totaux.volume!)} m³.`);
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
    aLesDetails: avecDetails > 0,
    avertissements,
  };
}

const arrondir = (n: number) => Math.round(n * 100) / 100;

// ── Packing details (onglet PD) : couleurs, tailles par ligne ────────────────
//
//   16-5 No.5 N/L Slider … gold          ← titres (une ou plusieurs lignes du PL)
//   6573-5015 ,5000pcs/carton            ← codes
//   COLOR | QTY(PCS) | CTNS | CTN NO#    ← en-tête (COLOR, SIZE, STYLE…)
//   GOLD  | 50000    | 10   | 1-10       ← une variante
//   TOTAL | 200000   | 40

type UniteDetail = 'pc' | 'doz' | 'gross' | 'set' | 'm' | 'yd' | 'roll' | 'kg' | 'bag' | 'card' | 'qty';

/** L'unité d'une colonne du PD ; null pour ce qui n'est pas une quantité (cartons, n° de carton, commentaires). */
function uniteColonne(entete: string): UniteDetail | null {
  const s = entete.toUpperCase().replace(/[\s（）]/g, '');
  if (!s || /CTN|NO#|COMMENT|\/ROLL|NO\.|REMARK/.test(s)) return null;
  if (/PCS|NUM|PIECE/.test(s)) return 'pc';
  if (/DOZ/.test(s)) return 'doz';
  if (/GROSS/.test(s)) return 'gross';
  if (/SET/.test(s)) return 'set';
  if (/YARD|YDS/.test(s)) return 'yd';
  if (/MET|MTS/.test(s)) return 'm';
  if (/ROLL/.test(s)) return 'roll';
  if (/KG/.test(s)) return 'kg';
  if (/BAG/.test(s)) return 'bag';
  if (/CARD/.test(s)) return 'card';
  if (/^QTY/.test(s)) return 'qty';
  return null;
}

/** L'unité d'une ligne du PL, dans le vocabulaire du PD. */
function uniteLigne(u: string): UniteDetail | null {
  const s = String(u || '').toLowerCase().replace(/[.\s]/g, '');
  if (/^(pcs?|pieces?|piece)$/.test(s)) return 'pc';
  if (/^doz/.test(s)) return 'doz';
  if (/^gross/.test(s)) return 'gross';
  if (/^sets?$/.test(s)) return 'set';
  if (/^(yds?|yards?)$/.test(s)) return 'yd';
  if (/^(m|mts|meters?|metres?)$/.test(s)) return 'm';
  if (/^rolls?$/.test(s)) return 'roll';
  if (/^kgs?$/.test(s)) return 'kg';
  if (/^(bags?|box(es)?)$/.test(s)) return 'bag';
  if (/^cards?$/.test(s)) return 'card';
  return null;
}

const PIECES: Partial<Record<UniteDetail, number>> = { pc: 1, set: 1, doz: 12, gross: 144 };

/** Combien d'unités de la ligne dans une unité du PD (12 pièces = 1 douzaine). */
function facteurDetail(de: UniteDetail, vers: UniteDetail | null): number | null {
  if (!vers || de === vers || de === 'qty') return de === 'qty' || de === vers ? 1 : null;
  if (PIECES[de] && PIECES[vers]) return PIECES[de]! / PIECES[vers]!;
  if (de === 'm' && vers === 'yd') return 1 / 0.9144;
  if (de === 'yd' && vers === 'm') return 0.9144;
  return null;
}

/** `libre` : lue dans une phrase (« total 190000PCS »), pas dans un tableau — écartée si le bloc a un tableau. */
type RangDetail = { style: string; couleur: string; taille: string; valeurs: { unite: UniteDetail; valeur: number }[]; libre?: boolean };
type BlocDetails = { refs: string[]; codes: string[]; rangs: RangDetail[] };
type ColonnesDetails = { couleur: number; taille: number; style: number; quantites: { i: number; unite: UniteDetail }[] };

function enteteDetails(r: Cellule[]): ColonnesDetails | null {
  const c = r.map(x => texte(x).toUpperCase());
  const idx = (re: RegExp) => c.findIndex(x => re.test(x));
  const couleur = idx(/^COLOU?RS?$/);
  const taille = idx(/^SIZES?$/);
  const style = idx(/^(STYLE|ITEM ?NO\.?#?|ITEM|CODE)$/);
  if (couleur < 0 && taille < 0 && style < 0) return null;
  const quantites = c
    .map((x, i) => ({ i, unite: [couleur, taille, style].includes(i) ? null : uniteColonne(x) }))
    .filter((q): q is { i: number; unite: UniteDetail } => q.unite != null);
  return quantites.length ? { couleur, taille, style, quantites } : null;
}

// Quantité totale écrite en phrase : « TOTAL 38CTNS , 190000PCS », « total 2480kg », « 2880rolls ».
// Pas un contenu (« 5000PCS/CTN », « 25m/roll », « 4.0g/200m »), pas des cartons.
const RE_QTE_LIBRE = /(?<![\/\d.,])(\d+(?:[.,]\d+)?)\s*(PCS|PC|PIECES?|SETS?|DOZ(?:ENS?)?|GROSS|ROLLS?|KGS?|MTS|METERS?|METRES?|M|YDS|YARDS?|BAGS?)(?![A-Z])(?!\s*\/)/gi;
const COULEUR_VAGUE = /^(VARIOUS|MIXED|ASSORTED|MULTI|DIFFERENT|ALL|SAME|AS|THE|ANY|BY)$/;

/** Ce qu'une phrase du PD dit : « 75cm , O/E , Black color », « Size: 4.0cm , … total 2480kg ». */
function lirePhraseDetail(t: string, format: Format) {
  const valeurs = [...t.matchAll(RE_QTE_LIBRE)]
    .map(m => ({ unite: uniteLigne(m[2]), valeur: lireNombre(m[1], format) }))
    .filter((v): v is { unite: UniteDetail; valeur: number } => v.unite != null && v.valeur != null && v.valeur > 0);
  const couleurEcrite = t.match(/COLOU?RS?\s*[:：]\s*([^,，;]+)/i)?.[1].trim().toUpperCase();
  const couleurAvant = [...t.matchAll(/([A-Z][A-Z0-9#]*)\s+COLOU?RS?\b/gi)]
    .map(m => m[1].toUpperCase()).filter(c => !COULEUR_VAGUE.test(c)).pop();
  const taille = t.match(/SIZES?\s*[:：]\s*([^,，;]+)/i)?.[1].trim().toUpperCase() || '';
  return { valeurs, couleur: couleurEcrite || couleurAvant || '', taille };
}

/** Les blocs d'un packing details, dans l'ordre du document. */
function lireBlocsDetails(grille: Cellule[][], format: Format): BlocDetails[] {
  const blocs: BlocDetails[] = [];
  let colonnes: ColonnesDetails | null = null;
  let precedent: RangDetail | null = null;
  // Le bloc en cours : le dernier ouvert. Un titre ou un code après des variantes en ouvre un autre.
  const courant = (ouvrir: boolean): BlocDetails => {
    const dernier = blocs[blocs.length - 1];
    if (dernier && !(ouvrir && dernier.rangs.length)) return dernier;
    const b: BlocDetails = { refs: [], codes: [], rangs: [] };
    blocs.push(b);
    return b;
  };

  // Un PL collé avec le PD : ses lignes (de « DESCRIPTION OF GOODS » à TOTAL) ne sont pas des blocs.
  let dansLePL = false;
  // Sans tableau (NINGBO APPAREL), couleur et taille s'écrivent en phrases sous le titre :
  // « BLACK COLOR » puis « PACKS: 5000PCS/CTN , TOTAL 38CTNS , 190000PCS ».
  let phrase = { couleur: '', taille: '' };
  for (const r of grille) {
    const cellules = r.map(texte);
    const premier = cellules.find(Boolean) ?? '';
    if (trouverColonnes(r)) { dansLePL = true; colonnes = null; continue; }
    if (dansLePL) {
      if (cellules.some(x => RE_TOTAL.test(x)) || /^PACKED IN/i.test(premier)) dansLePL = false;
      continue;
    }
    if (!premier) { colonnes = null; continue; }
    const entete = enteteDetails(r);
    if (entete) { courant(false); colonnes = entete; precedent = null; continue; }
    if (colonnes) {
      if (cellules.some(x => RE_TOTAL.test(x))) { colonnes = null; continue; }
      const cols: ColonnesDetails = colonnes;
      const valeurs = cols.quantites
        .map(q => ({ unite: q.unite, valeur: lireNombre(r[q.i], format) }))
        .filter((v): v is { unite: UniteDetail; valeur: number } => v.valeur != null);
      if (valeurs.length) {
        let rang: RangDetail = {
          style: cols.style >= 0 ? cellules[cols.style] || '' : '',
          couleur: cols.couleur >= 0 ? cellules[cols.couleur] || '' : '',
          taille: cols.taille >= 0 ? cellules[cols.taille] || '' : '',
          valeurs,
        };
        // Suite sans libellé (« | | 20000 ») : même variante que la ligne d'au-dessus.
        if (precedent) rang = { style: rang.style || precedent.style, couleur: rang.couleur || precedent.couleur, taille: rang.taille || precedent.taille, valeurs };
        courant(false).rangs.push(rang);
        precedent = rang;
        continue;
      }
      colonnes = null;
    }
    const code = premier.match(RE_CODE);
    const titre = code ? null : premier.match(RE_TITRE);
    if (titre || code) {
      if (titre) courant(true).refs.push(titre[1]);
      else courant(true).codes.push(code![1].toUpperCase());
      phrase = { couleur: '', taille: '' };
      continue;
    }
    // Une phrase sous un titre ; « total: 2480kg + 2380.8kg » récapitule, on ne la compte pas.
    const dernier = blocs[blocs.length - 1];
    if (!dernier || (!dernier.refs.length && !dernier.codes.length) || /^TOTAL\b/i.test(premier)) continue;
    precedent = null;
    const lu = lirePhraseDetail(cellules.filter(Boolean).join(' , '), format);
    if (!lu.valeurs.length) {
      phrase = { couleur: lu.couleur || phrase.couleur, taille: lu.taille || phrase.taille };
      continue;
    }
    dernier.rangs.push({ style: '', couleur: lu.couleur || phrase.couleur, taille: lu.taille || phrase.taille, valeurs: lu.valeurs, libre: true });
  }
  // Un bloc qui a son tableau : les phrases (« total 524ctns , 524000pcs ») le doubleraient.
  return blocs
    .map(b => (b.rangs.some(r => !r.libre) ? { ...b, rangs: b.rangs.filter(r => !r.libre) } : b))
    .filter(b => b.rangs.length);
}

/** La quantité d'une variante dans l'unité de la ligne (null si aucune colonne ne s'y ramène). */
function quantiteDans(rang: RangDetail, ligne: LigneFacture): number | null {
  const vers = uniteLigne(ligne.unite);
  for (const v of [...rang.valeurs].sort((a, b) => Number(b.unite === vers) - Number(a.unite === vers))) {
    const k = facteurDetail(v.unite, vers);
    if (k != null) return v.valeur * k;
  }
  // Une seule colonne de quantité, d'unité inconnue de la ligne : on la prend telle quelle.
  return rang.valeurs.length === 1 && !vers ? rang.valeurs[0].valeur : null;
}

const egal = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.005);

/**
 * Les ensembles de valeurs dont la somme tombe sur `cible` (à la tolérance de
 * `egal`) — deux au plus : au-delà d'une, c'est ambigu. Une valeur null n'entre
 * dans aucun ensemble. Recherche bornée : trop longue, elle se dit ambiguë.
 */
function combinaisons(valeurs: (number | null)[], cible: number): number[][] {
  const tol = Math.max(0.011, Math.abs(cible) * 0.005);
  const idx = valeurs.map((v, i) => i).filter(i => valeurs[i] != null && valeurs[i]! > 0).sort((a, b) => valeurs[b]! - valeurs[a]!);
  const reste = idx.map((_, k) => idx.slice(k).reduce((s, i) => s + valeurs[i]!, 0));
  const trouvees: number[][] = [];
  let pas = 0;
  const chercher = (k: number, somme: number, pris: number[]) => {
    if (trouvees.length > 1 || ++pas > 200_000) return;
    if (Math.abs(somme - cible) <= tol && pris.length) { trouvees.push([...pris]); return; }
    if (k >= idx.length || somme > cible + tol || somme + reste[k] < cible - tol) return;
    pris.push(idx[k]);
    chercher(k + 1, somme + valeurs[idx[k]]!, pris);
    pris.pop();
    chercher(k + 1, somme, pris);
  };
  chercher(0, 0, []);
  return pas > 200_000 ? [[], []] : trouvees;
}

/** Pour comparer des couleurs écrites différemment : « Black Nickle » = « BLACK NICKEL ». */
export const cleTexte = (t: string) => t.toUpperCase().replace(/NICKLE/g, 'NICKEL').replace(/[^0-9A-Z]+/g, ' ').trim();

/**
 * Rattache chaque bloc du PD aux lignes du PL qu'il détaille : par le code
 * quand le bloc en porte un par variante, sinon dans l'ordre, une ligne après
 * l'autre, tant que les quantités retombent juste. Rien n'est rattaché si
 * les sommes ne correspondent pas.
 */
function rattacherDetails(lignes: LigneFacture[], blocs: BlocDetails[], avertissements: string[]): number {
  let rattachees = 0;
  const echecs: string[] = [];
  for (const bloc of blocs) {
    const parRef = lignes.filter(l =>
      (l.ref && bloc.refs.includes(l.ref)) || (!bloc.refs.length && l.code && bloc.codes.includes(l.code)));
    const parCodeEcrit = bloc.refs.length && bloc.codes.length ? parRef.filter(l => bloc.codes.includes(l.code)) : [];
    const cibles = parCodeEcrit.length ? parCodeEcrit : parRef;
    if (!cibles.length || cibles.some(l => l.quantite == null)) continue;
    // Codes tapés de travers dans le PD (« 6620·-0212 ») : chiffres, lettres et tiret seulement.
    const codeRang = (r: RangDetail) => r.style.toUpperCase().replace(/[^0-9A-Z-]/g, '').match(RE_CODE)?.[1] ?? null;
    const sansSuffixe = (x: string) => x.replace(/[A-Z]+$/, '');
    const parCode = bloc.rangs.every(r => codeRang(r));
    // Le code exact d'abord ; sans son suffixe (6621-0243 pour 6621-0243B) seulement s'il est absent du bloc.
    const codesDuBloc = new Set(bloc.rangs.map(codeRang));
    const memeCode = (r: RangDetail, l: LigneFacture) =>
      !parCode || codeRang(r) === l.code || (!codesDuBloc.has(l.code) && sansSuffixe(codeRang(r)!) === sansSuffixe(l.code));
    const motsDe = (t: string) => new Set(cleTexte(t).split(' ').filter(Boolean));
    const motsLigne = new Map(cibles.map(l => [l, motsDe(`${l.titre} ${l.spec}`)]));
    const dims = ['couleur', 'taille'] as const;
    const motsDim = Object.fromEntries(dims.map(k => [k, new Set(bloc.rangs.flatMap(r => [...motsDe(r[k])]))])) as Record<'couleur' | 'taille', Set<string>>;
    const contredit = (m: Map<LigneFacture, RangDetail[]>) => cibles.length > 1 && cibles.some(l => dims.some(k => {
      const propres = [...motsLigne.get(l)!].filter(w => motsDim[k].has(w) && !cibles.every(l2 => motsLigne.get(l2)!.has(w)));
      // une rangée qui porte une autre valeur dans cette dimension contredit la ligne ; une rangée vide ne dit rien
      return propres.length > 0 && (m.get(l) || []).some(r => r[k] && !propres.some(w => motsDe(r[k]).has(w)));
    }));
    const retombe = (m: Map<LigneFacture, RangDetail[]>) => !contredit(m) && new Set([...m.values()].flat()).size === bloc.rangs.length && [...m.values()].flat().length === bloc.rangs.length && cibles.every(l => {
      const qs = (m.get(l) || []).map(r => quantiteDans(r, l));
      return qs.length > 0 && qs.every(q => q != null) && egal(qs.reduce<number>((s2, q) => s2 + q!, 0), l.quantite!);
    });

    // 1. Par le code porté par chaque variante (colonne STYLE / ITEM NO.).
    const parLeCode = () => new Map(cibles.map(l => {
      const exacts = bloc.rangs.filter(r => codeRang(r) === l.code);
      return [l, exacts.length ? exacts : bloc.rangs.filter(r => memeCode(r, l))] as [LigneFacture, RangDetail[]];
    }));
    // 2. Par la couleur écrite sur la ligne (« …28L white ») ; le reste à la
    //    seule ligne qui n'en dit rien (« 20S/3,color »).
    const parLaCouleur = () => {
      const m = new Map<LigneFacture, RangDetail[]>();
      const libres = new Set(bloc.rangs);
      const muettes: LigneFacture[] = [];
      for (const l of cibles) {
        const t = ` ${cleTexte(`${l.titre} ${l.spec}`)} `;
        const rangs = [...libres].filter(r => memeCode(r, l) && r.couleur && t.includes(` ${cleTexte(r.couleur)} `));
        if (!rangs.length) { muettes.push(l); continue; }
        // la plus longue couleur l'emporte : NICKEL est dans BLACK NICKEL
        for (const r of [...rangs]) if (rangs.some(r2 => r2 !== r && cleTexte(r2.couleur) !== cleTexte(r.couleur) && ` ${cleTexte(r2.couleur)} `.includes(` ${cleTexte(r.couleur)} `))) rangs.splice(rangs.indexOf(r), 1);
        m.set(l, rangs);
        rangs.forEach(r => libres.delete(r));
      }
      if (muettes.length === 1 && m.size) m.set(muettes[0], [...libres].filter(r => memeCode(r, muettes[0])));
      return m;
    };
    // 3. Dans l'ordre : les variantes remplissent une ligne, puis la suivante.
    const dansLOrdre = () => {
      const m = new Map<LigneFacture, RangDetail[]>();
      let i = 0;
      for (const l of cibles) {
        const pris: RangDetail[] = [];
        let cumul = 0;
        while (i < bloc.rangs.length) {
          const q = quantiteDans(bloc.rangs[i], l);
          if (q == null) break;
          if (pris.length && Math.abs(cumul + q - l.quantite!) >= Math.abs(cumul - l.quantite!)) break;
          pris.push(bloc.rangs[i]);
          cumul += q;
          i++;
        }
        m.set(l, pris);
      }
      return m;
    };
    // 4. Par combinaison : chaque couleur reste entière et chaque ligne doit
    //    retomber juste, dans n'importe quel ordre (Twill 25MH114168 : le PL
    //    coupe le 03-1 en 2 057 m et 69 946 m ; les 2 057 m sont WHITE, la
    //    dernière couleur du PD). Une seule combinaison possible, sinon rien.
    const parCombinaison = () => {
      const m = new Map<LigneFacture, RangDetail[]>();
      if (cibles.length < 2) return m;
      const parCle = new Map<string, RangDetail[]>();
      for (const r of bloc.rangs) {
        const k = [r.style, r.couleur, r.taille].map(cleTexte).join('|');
        parCle.set(k, [...(parCle.get(k) || []), r]);
      }
      let restants = [...parCle.values()];
      const ordre = [...cibles].sort((a, b) => a.quantite! - b.quantite!);
      for (const l of ordre.slice(0, -1)) {
        const qtes = restants.map(g => (g.every(r => memeCode(r, l))
          ? g.reduce<number | null>((s, r) => { const q = quantiteDans(r, l); return s == null || q == null ? null : s + q; }, 0)
          : null));
        const solutions = combinaisons(qtes, l.quantite!);
        if (solutions.length !== 1) return new Map<LigneFacture, RangDetail[]>();
        const pris = new Set(solutions[0]);
        m.set(l, restants.filter((_, i) => pris.has(i)).flat());
        restants = restants.filter((_, i) => !pris.has(i));
      }
      m.set(ordre[ordre.length - 1], restants.flat());
      return m;
    };
    // La première lecture dont toutes les sommes retombent juste l'emporte.
    const essais = [...(parCode ? [parLeCode] : []), parLaCouleur, dansLOrdre, parCombinaison];
    const affectation = essais.map(e => e()).find(retombe) ?? new Map<LigneFacture, RangDetail[]>();
    for (const l of cibles) {
      const rangs = affectation.get(l) || [];
      const quantites = rangs.map(r => quantiteDans(r, l));
      const total = quantites.reduce<number>((s, q) => s + (q ?? NaN), 0);
      if (!rangs.length || !Number.isFinite(total) || !egal(total, l.quantite!)) {
        echecs.push([l.ref, l.code].filter(Boolean).join(' '));
        continue;
      }
      l.details = rangs.map((r, k) => ({
        couleur: r.couleur,
        taille: r.taille,
        quantite: Math.round(quantites[k]! * 1000) / 1000,
        ...(r.style ? { modele: r.style } : {}),
      }));
      rattachees++;
    }
  }
  const faits = new Set(lignes.filter(l => l.details).map(l => [l.ref, l.code].filter(Boolean).join(' ')));
  const echecsRestants = echecs.filter(e => !faits.has(e));
  echecs.length = 0; echecs.push(...echecsRestants);
  if (echecs.length) {
    avertissements.push(`Packing details : quantités qui ne retombent pas sur le PL pour ${echecs.slice(0, 6).join(', ')}${echecs.length > 6 ? '…' : ''} — couleurs et tailles non lues pour ces lignes.`);
  }
  return rattachees;
}

/** Onglets d'origine seulement : « INV (2) », « PL(2) » sont des copies retouchées. */
const estCopie = (nom: string) => /\(\s*\d+\s*\)\s*$/.test(nom);

/** Lit un classeur déjà ouvert avec la bibliothèque xlsx. */
export function lireClasseurFacture(wb: WorkBook, utils: typeof import('xlsx').utils): LectureFacture {
  return lireClasseursFacture([{ nom: '', wb }], utils);
}

/**
 * Lit plusieurs classeurs ensemble, comme un seul : facture, PL et PD envoyés
 * en fichiers séparés (« ORIGINAL INVOICE-25931A.xlsx », « PACKING
 * DETAILS-25931A.xlsx »…).
 */
export function lireClasseursFacture(classeurs: { nom: string; wb: WorkBook }[], utils: typeof import('xlsx').utils): LectureFacture {
  const grilles = classeurs.flatMap(({ nom: fichier, wb }) => wb.SheetNames.filter(n => !estCopie(n)).map(onglet => {
    const grille = utils.sheet_to_json<Cellule[]>(wb.Sheets[onglet], { header: 1, raw: true, defval: null, blankrows: true });
    const nom = classeurs.length > 1 ? `${fichier} · ${onglet}` : onglet;
    return { nom, onglet, grille, format: detecterFormat(grille.flat()) };
  }));
  return assembler(grilles);
}

const enGrille = (t: string): Cellule[][] => t.replace(/\r/g, '').split('\n').map(l => l.split('\t'));

/**
 * Lit un tableau copié depuis Excel et collé (colonnes séparées par des
 * tabulations) : le packing list, et en option le packing details.
 */
export function lireTexteColle(textelibre: string, details = ''): LectureFacture {
  const morceaux = [
    { nom: 'collage', onglet: 'collage', grille: enGrille(textelibre) },
    { nom: 'packing details', onglet: 'packing details', grille: details.trim() ? enGrille(details) : [] },
  ];
  // Un seul format pour les deux : les poids décimaux du PL tranchent pour le PD.
  const format = detecterFormat(morceaux.flatMap(m => m.grille.flat()));
  return assembler(morceaux.filter(m => m.grille.length).map(m => ({ ...m, format })));
}
