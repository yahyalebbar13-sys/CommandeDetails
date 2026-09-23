/**
 * Le devoir de formation, écrit avec les VRAIS noms des produits chargés.
 *
 * Une feuille qui dit « référence n°1, référence n°2 » n'apprend rien : la recrue passe son temps
 * à faire la correspondance au lieu de travailler. Ce fichier prend les lignes réellement chargées
 * par le stock de formation et produit deux documents imprimables : le devoir pour la recrue, le
 * corrigé pour le patron — avec les bons noms, les bonnes variantes et les bonnes quantités.
 *
 * Les opérations sont décrites UNE seule fois, sous forme de données (`construireVentes`,
 * `construireMouvements`). Le devoir les imprime, le corrigé les additionne : les deux documents
 * ne peuvent plus se contredire, et ajouter une vente ne demande pas de refaire les totaux à la
 * main. C'est ce qui permet d'en avoir autant — neuf ventes, dont trois par couleur.
 */

import type { LigneChargement } from './stock-formation';

/** Une chose sur laquelle on fait travailler la recrue : un produit, ou une variante précise. */
export type Cible = {
  rang: number;
  nom: string;
  /** Libellé de la variante (couleur, qualité, taille) quand le produit est ventilé. */
  variante: string | null;
  /** Quantité de départ de cette cible : celle du produit, ou celle de sa variante. */
  quantite: number;
  lieu: 'MAGASIN' | 'ENTREPOT';
};

/**
 * Un produit ventilé pris avec TOUTES ses couleurs. C'est sur lui que se font les ventes
 * multicouleurs : une facture qui porte quatre lignes du même produit, une par coloris, chacune
 * puisant dans son propre stock. C'est le geste le plus fréquent du magasin, et celui où se font
 * le plus d'erreurs.
 */
export type CibleMulti = {
  rang: number;
  nom: string;
  variantes: { label: string; quantite: number }[];
};

export type CiblesDevoir = {
  /** Cinq produits de la boutique, servis selon ce que leur rôle consomme dans le devoir. */
  a: Cible; b: Cible; c: Cible; d: Cible; e: Cible;
  /** Deux variantes précises, pour apprendre qu'une couleur a son propre stock. */
  v: Cible | null; w: Cible | null;
  /** Les deux produits les plus riches en couleurs : réservés aux ventes multicouleurs. */
  m: CibleMulti | null; n: CibleMulti | null;
  /** Un produit de la réserve, pour apprendre que la marchandise a un lieu. */
  r: Cible | null;
};

function cibleDeLaLigne(l: LigneChargement): Cible {
  const premiere = l.variantes[0];
  const ventile = Boolean(premiere?.label);
  return {
    rang: l.rang,
    nom: l.nom,
    variante: ventile ? premiere.label : null,
    quantite: ventile ? premiere.quantite : l.quantite,
    lieu: l.lieu,
  };
}

function multiDeLaLigne(l: LigneChargement): CibleMulti | null {
  const variantes = l.variantes
    .filter(v => v.label && v.quantite > 0)
    .map(v => ({ label: v.label, quantite: v.quantite }));
  return variantes.length > 0 ? { rang: l.rang, nom: l.nom, variantes } : null;
}

/**
 * Ce que chaque rôle doit pouvoir sortir du stock sans jamais passer sous zéro. Les rôles sont
 * servis dans cet ordre — du plus gourmand au moins gourmand — et les quantités de départ sont
 * triées de la même façon : sinon le rôle qui vend 200 unités tombe sur la référence qui n'en a
 * que 150, et le corrigé annonce un stock négatif.
 */
const BESOINS: { cle: 'a' | 'b' | 'c' | 'd' | 'e'; besoin: number }[] = [
  { cle: 'a', besoin: 200 }, // 50 vente 1 · 100 vente 3 · 50 transfert
  { cle: 'e', besoin: 200 }, // 200 vente 2
  { cle: 'b', besoin: 120 }, // 15 perte · 100 vente 2 · 5 écart d'inventaire
  { cle: 'c', besoin: 120 }, // 100 vente 3 · 20 commande préparée
  { cle: 'd', besoin: 60 },  // 20 vente 2 · 40 vente 4
];

/** Ce que consomment les deux variantes isolées : en dessous, leurs exercices sont retirés. */
const BESOIN_V = 30; // 10 perte · 20 vente 5
const BESOIN_W = 20; // 20 transfert

/**
 * Répartit les rôles du devoir sur les produits réellement chargés.
 *
 * Les deux produits les plus riches en couleurs partent d'abord aux ventes multicouleurs : c'est
 * l'exercice qui a le plus besoin de matière. Les cinq rôles « produit entier » vont ensuite aux
 * références sans ventilation les plus fournies ; s'il n'y en a pas cinq, on complète avec les
 * produits ventilés les plus pauvres en couleurs, pour ne pas abîmer les ventes par couleur.
 */
export function choisirCibles(lignes: LigneChargement[]): CiblesDevoir | null {
  const boutique = lignes.filter(l => l.lieu === 'MAGASIN');
  if (boutique.length < 5) return null;

  const parQuantite = (x: Cible, y: Cible) => y.quantite - x.quantite || x.rang - y.rang;
  const simples = boutique.filter(l => !l.variantes[0]?.label).map(cibleDeLaLigne).sort(parQuantite);
  // Les plus riches en couleurs d'abord : ce sont elles qui portent les ventes multicouleurs.
  const ventilees = boutique
    .filter(l => Boolean(l.variantes[0]?.label))
    .sort((x, y) => y.variantes.length - x.variantes.length || y.quantite - x.quantite || x.rang - y.rang);

  // Les deux produits les plus riches en couleurs sont réservés AVANT tout le reste : ce sont eux
  // qui portent les ventes par couleur, et rien d'autre ne sait le faire.
  const m = ventilees[0] ? multiDeLaLigne(ventilees[0]) : null;
  const n = ventilees[1] ? multiDeLaLigne(ventilees[1]) : null;
  const pool = ventilees.slice(2).map(cibleDeLaLigne).sort(parQuantite);

  // Les rôles « produit entier » prennent les références sans ventilation les plus fournies, puis,
  // s'il n'y en a pas cinq, les variantes les plus fournies de ce qui reste — les plus fournies,
  // parce que ces rôles sortent jusqu'à 200 unités.
  const principaux: Cible[] = [];
  for (const c of [...simples, ...pool]) {
    if (principaux.length >= BESOINS.length) break;
    principaux.push(c);
  }
  if (principaux.length < BESOINS.length) return null;

  principaux.sort(parQuantite);
  if (BESOINS.some((b, i) => principaux[i].quantite < b.besoin)) return null;

  const isolees = pool.filter(c => !principaux.some(p => p.rang === c.rang));
  const v = isolees[0] && isolees[0].quantite >= BESOIN_V ? isolees[0] : null;
  const w = isolees[1] && isolees[1].quantite >= BESOIN_W ? isolees[1] : null;

  const reserve = lignes.filter(l => l.lieu === 'ENTREPOT').map(cibleDeLaLigne).sort(parQuantite);

  return {
    a: principaux[0], e: principaux[1], b: principaux[2], c: principaux[3], d: principaux[4],
    v, w, m, n,
    r: reserve[0] || null,
  };
}

/** Comment on désigne une cible dans le texte du devoir. */
export function libelleCible(c: Cible | null): string {
  if (!c) return '—';
  return c.variante ? `${c.nom} — ${c.variante}` : c.nom;
}

// ── Les opérations du devoir, en données ─────────────────────────────────────

/** Les deux clients créés par la recrue, avec leur plafond de crédit. */
export const CLIENTS_DEVOIR = {
  NOOR:  { nom: 'ATELIER NOOR (formation)',   plafond: 5000 },
  ZAHRA: { nom: 'COUTURE ZAHRA (formation)',  plafond: 1000 },
};

/** Les prix de vente imposés par l'exercice. Aucun ne dérive d'un prix d'achat. */
const PRIX = {
  a1: 8, a3: 5,
  b2: 14,
  c3: 4, cBC: 6, cRefus: 6,
  d2: 20, d4: 11,
  e2: 5,
  v5: 9,
  m: 12,
  n: 18,
};

/** Où se joue le devoir : les noms de lieux tels qu'ils s'affichent à l'écran. */
export type Lieux = { boutique: string; autreMagasin: string; reserve: string };

const LIEUX_PAR_DEFAUT: Lieux = { boutique: 'la boutique', autreMagasin: "l'autre magasin", reserve: 'la réserve' };

/**
 * Une ligne de marchandise dans une vente. `cle` désigne la ligne de stock qui bouge.
 * `masquee` cache la quantité sur le devoir — la recrue doit la lire elle-même à l'écran.
 */
export type LigneVente = { cle: string; libelle: string; quantite: number; prix: number; masquee?: boolean };

/**
 * Un encaissement. `encaisse` dit si l'argent finit vraiment dans la caisse : un chèque remis en
 * banque et crédité compte, un chèque qui revient impayé ne compte pas. `differe` dit qu'il n'est
 * pas rentré le jour de la vente — c'est toute la différence entre vendre et encaisser.
 */
export type Reglement = { libelle: string; montant: number; encaisse: boolean; differe?: boolean };

export type Vente = {
  numero: number;
  titre: string;
  client: 'COMPTOIR' | 'NOOR' | 'ZAHRA';
  remisePct: number;
  lignes: LigneVente[];
  sousTotal: number;
  total: number;
  reglements: Reglement[];
  /** Ce qui part à crédit : le client repart avec la marchandise sans l'avoir payée. */
  reste: number;
  consigne: string;
  /** Vraie pour la vente passée par une commande préparée puis facturée. */
  viaCommande?: boolean;
};

/** Un mouvement de stock qui ne vient pas d'une vente. */
export type MouvementDevoir = { cle: string; libelle: string; delta: number; origine: string };

const arrondi = (n: number) => Math.round(n * 100) / 100;

const cleMulti = (prefixe: string, label: string) => `${prefixe}:${label}`;

/**
 * Les neuf ventes du devoir, dans l'ordre où elles se saisissent.
 *
 * Les trois ventes par couleur sont le cœur de l'exercice : une facture entière sur les coloris
 * d'un même produit, une facture qui mélange deux produits multicouleurs, et une dernière qui
 * vide une couleur jusqu'à la rupture. Les quantités par coloris sont bornées par ce qui a été
 * chargé : un produit à deux couleurs ne se voit pas demander quatre lignes.
 */
function construireVentes(cibles: CiblesDevoir): Vente[] {
  const pris: Record<string, number> = {};
  const dispo = (cle: string, stock: number) => Math.max(0, stock - (pris[cle] || 0));

  /**
   * Une ligne par coloris, bornée par ce qui a réellement été chargé : un produit à deux couleurs
   * ne se voit pas demander quatre lignes, et on ne vend jamais plus que ce qui est en rayon.
   * `null` dans l'échelle = ce coloris n'est pas concerné par cette vente ; `'tout'` = ce qu'il en
   * reste, quantité masquée sur le devoir pour que la recrue aille la lire à l'écran.
   */
  const prendreMulti = (
    cible: CibleMulti | null, prefixe: string, echelle: (number | 'tout' | null)[], prix: number,
  ): LigneVente[] => {
    if (!cible) return [];
    const lignes: LigneVente[] = [];
    cible.variantes.forEach((variante, i) => {
      const voulu = echelle[i];
      if (voulu === null || voulu === undefined) return;
      const cle = cleMulti(prefixe, variante.label);
      const restant = dispo(cle, variante.quantite);
      const quantite = voulu === 'tout' ? restant : Math.min(voulu, restant);
      if (quantite <= 0) return;
      pris[cle] = (pris[cle] || 0) + quantite;
      lignes.push({ cle, libelle: `${cible.nom} — ${variante.label}`, quantite, masquee: voulu === 'tout', prix });
    });
    return lignes;
  };

  const simple = (cle: string, cible: Cible | null, quantite: number, prix: number): LigneVente[] =>
    cible ? [{ cle, libelle: libelleCible(cible), quantite, prix }] : [];

  const ventes: Vente[] = [];
  const ajouter = (
    brut: Omit<Vente, 'sousTotal' | 'total' | 'reste'>,
    reglements: (total: number) => Reglement[],
  ) => {
    if (brut.lignes.length === 0) return;
    const sousTotal = arrondi(brut.lignes.reduce((s, l) => s + l.quantite * l.prix, 0));
    const total = arrondi(sousTotal * (1 - brut.remisePct / 100));
    const regles = reglements(total);
    const paye = arrondi(regles.reduce((s, r) => s + r.montant, 0));
    ventes.push({ ...brut, sousTotal, total, reglements: regles, reste: arrondi(Math.max(0, total - paye)) });
  };

  const especes = (montant: number): Reglement[] => [{ libelle: 'Espèces', montant, encaisse: true }];

  ajouter({
    numero: 1, titre: 'Au comptoir, sans client, en espèces', client: 'COMPTOIR', remisePct: 0,
    lignes: simple('a', cibles.a, 50, PRIX.a1),
    reglements: [], consigne: "La vente la plus simple : pas de client, tout est payé tout de suite.",
  }, especes);

  ajouter({
    numero: 2, titre: `${CLIENTS_DEVOIR.NOOR.nom}, remise de 5 %`, client: 'NOOR', remisePct: 5,
    lignes: [
      ...simple('e', cibles.e, 200, PRIX.e2),
      ...simple('b', cibles.b, 100, PRIX.b2),
      ...simple('d', cibles.d, 20, PRIX.d2),
    ],
    reglements: [],
    consigne: "Règlement en deux fois : une partie en espèces, le reste par chèque à 60 jours "
      + "(n° FORM-001). Le logiciel réclame une photo du chèque : prends n'importe quel papier en "
      + "photo, c'est un exercice.",
  }, total => [
    { libelle: 'Espèces', montant: arrondi(total - 1000), encaisse: true },
    // Le chèque finira dans la caisse : la banque le crédite à la partie « argent » du devoir.
    { libelle: 'Chèque FORM-001, échéance dans 60 jours', montant: 1000, encaisse: true, differe: true },
  ]);

  ajouter({
    numero: 3, titre: `${CLIENTS_DEVOIR.ZAHRA.nom}, entièrement à crédit`, client: 'ZAHRA', remisePct: 0,
    lignes: [
      ...simple('a', cibles.a, 100, PRIX.a3),
      ...simple('c', cibles.c, 100, PRIX.c3),
    ],
    reglements: [],
    consigne: "Rien n'est payé : la cliente emporte la marchandise et doit l'argent. "
      + "Note au passage que le même produit peut se vendre à un autre prix qu'à la vente 1.",
  }, () => []);

  ajouter({
    numero: 4, titre: `${CLIENTS_DEVOIR.NOOR.nom}, réglée par chèque`, client: 'NOOR', remisePct: 0,
    lignes: simple('d', cibles.d, 40, PRIX.d4),
    reglements: [],
    consigne: "Chèque n° FORM-002, échéance IL Y A 10 JOURS — une date déjà passée, on en aura "
      + "besoin plus loin. Photo du chèque obligatoire, comme à la vente 2.",
    // Ce chèque-là reviendra impayé : il paie la facture au moment de la vente, mais l'argent
    // n'entre jamais dans la caisse.
  }, total => [{ libelle: 'Chèque FORM-002, échéance dépassée', montant: total, encaisse: false, differe: true }]);

  ajouter({
    numero: 5, titre: 'Une seule couleur, au comptoir', client: 'COMPTOIR', remisePct: 0,
    lignes: simple('v', cibles.v, 20, PRIX.v5),
    reglements: [],
    consigne: "Attention à la ligne que tu choisis : ce produit existe en plusieurs variantes.",
  }, especes);

  ajouter({
    numero: 6, titre: 'Toutes les couleurs du même produit', client: 'COMPTOIR', remisePct: 0,
    lignes: prendreMulti(cibles.m, 'm', [20, 15, 10, 5], PRIX.m),
    reglements: [],
    consigne: "Une ligne par couleur, sur la MÊME facture. Ajoute-les une par une : le prix que tu "
      + "poses sur la première se recopie sur les suivantes du même produit — vérifie-le.",
  }, especes);

  ajouter({
    numero: 7, titre: `Deux produits, plusieurs couleurs — ${CLIENTS_DEVOIR.NOOR.nom}`, client: 'NOOR', remisePct: 0,
    lignes: [
      ...prendreMulti(cibles.m, 'm', [10, 6], PRIX.m),
      ...prendreMulti(cibles.n, 'n', [12, 8, 6, 4], PRIX.n),
    ],
    reglements: [],
    consigne: "La facture la plus longue du devoir. Prends ton temps : une erreur de coloris ici "
      + "ne se voit qu'à la livraison, devant le client. Règlement : 400,00 en espèces, le reste à crédit.",
  }, total => [{ libelle: 'Espèces', montant: Math.min(400, total), encaisse: true }]);

  ajouter({
    numero: 8, titre: 'Vider une couleur jusqu’à la rupture', client: 'COMPTOIR', remisePct: 0,
    lignes: prendreMulti(cibles.n, 'n',
      (cibles.n?.variantes || []).map((_, i, toutes) => (i === toutes.length - 1 ? 'tout' : null)), PRIX.n),
    reglements: [],
    consigne: "Vends TOUT ce qui reste de cette couleur — à toi de lire la quantité disponible. "
      + "Essaie d'abord de saisir 999 : que fait le champ ?",
  }, especes);

  ajouter({
    numero: 9, titre: `Commande préparée avant l’arrivée du client — ${CLIENTS_DEVOIR.NOOR.nom}`,
    client: 'NOOR', remisePct: 0, viaCommande: true,
    lignes: [
      // Le troisième coloris, ou le dernier s'il y en a moins : jamais celui qui a déjà le plus
      // servi aux ventes 6 et 7.
      ...prendreMulti(cibles.m, 'm',
        (cibles.m?.variantes || []).map((_, i, toutes) => (i === Math.min(2, toutes.length - 1) ? 8 : null)), PRIX.m),
      ...simple('c', cibles.c, 20, PRIX.cBC),
    ],
    reglements: [],
    consigne: `Monte le panier, puis « Préparer la commande » au lieu de « Encaisser ». Imprime le `
      + `bon. Va ensuite dans Commandes préparées, facture-la, puis encaisse la facture en espèces `
      + `depuis l'écran Factures.`,
  }, especes);

  return ventes;
}

/** Ce que la vente refusée par le plafond de crédit demande de saisir. Elle n'aboutit jamais. */
export function venteRefusee(cibles: CiblesDevoir) {
  const quantite = 50;
  return {
    client: CLIENTS_DEVOIR.ZAHRA.nom,
    libelle: libelleCible(cibles.c),
    quantite,
    prix: PRIX.cRefus,
    total: arrondi(quantite * PRIX.cRefus),
    plafond: CLIENTS_DEVOIR.ZAHRA.plafond,
  };
}

/** Le retour client : la seule entrée de marchandise qui ne vient pas d'un achat. */
export function retourDuDevoir(cibles: CiblesDevoir) {
  const quantite = 10;
  return {
    cle: 'e',
    libelle: libelleCible(cibles.e),
    quantite,
    prix: PRIX.e2,
    valeur: arrondi(quantite * PRIX.e2),
    remisePct: 5,
    /** Ce que la cliente avait réellement payé pour ces dix unités, remise déduite. */
    paye: arrondi(quantite * PRIX.e2 * 0.95),
  };
}

/** Tous les mouvements de stock du devoir qui ne sont pas des ventes. */
function construireMouvements(cibles: CiblesDevoir, lieux: Lieux): MouvementDevoir[] {
  const retour = retourDuDevoir(cibles);
  const mouvements: MouvementDevoir[] = [
    { cle: 'a', libelle: libelleCible(cibles.a), delta: +120, origine: "Entrée oubliée, rattrapée à la main" },
    { cle: 'b', libelle: libelleCible(cibles.b), delta: -15,  origine: 'Perte' },
    { cle: 'a', libelle: libelleCible(cibles.a), delta: -50,  origine: `Transfert vers ${lieux.autreMagasin}` },
    { cle: 'e', libelle: retour.libelle,          delta: +retour.quantite, origine: 'Retour client' },
    { cle: 'b', libelle: libelleCible(cibles.b), delta: -5,   origine: "Écart d'inventaire" },
  ];
  if (cibles.v) {
    mouvements.push({ cle: 'v', libelle: libelleCible(cibles.v), delta: -10, origine: 'Perte sur une seule couleur' });
  }
  if (cibles.w) {
    mouvements.push({ cle: 'w', libelle: libelleCible(cibles.w), delta: -20, origine: `Transfert vers ${lieux.autreMagasin}` });
    mouvements.push({ cle: 'w', libelle: libelleCible(cibles.w), delta: +12, origine: "Écart d'inventaire" });
  }
  // Un écart d'inventaire sur une couleur : la recrue doit compter la ligne du coloris, pas le
  // produit. C'est l'erreur la plus courante à l'inventaire d'un produit ventilé.
  const couleurComptee = cibles.m?.variantes[1];
  if (couleurComptee) {
    mouvements.push({
      cle: cleMulti('m', couleurComptee.label),
      libelle: `${cibles.m!.nom} — ${couleurComptee.label}`,
      delta: -3,
      origine: "Écart d'inventaire sur une couleur",
    });
  }
  return mouvements;
}

/** La couleur qu'on compte à l'inventaire, quand le produit multicouleur existe. */
export function couleurInventoriee(cibles: CiblesDevoir): { nom: string; label: string } | null {
  const variante = cibles.m?.variantes[1];
  return variante ? { nom: cibles.m!.nom, label: variante.label } : null;
}

export type LigneStock = { cle: string; libelle: string; depart: number; final: number };

export type Resultats = {
  /** Une ligne par stock suivi, dans l'ordre d'apparition dans le devoir. */
  lignes: LigneStock[];
  a: number; b: number; c: number; d: number; e: number;
  v: number | null; w: number | null;
  rReserve: number | null;
  /** Le détail par couleur des deux produits multicouleurs. */
  m: LigneStock[]; n: LigneStock[];
  chiffreAffaires: number; encaisse: number; creances: number;
  soldeNoor: number; soldeZahra: number;
  /** Ce que la cliente a payé en trop après le retour : un avoir que l'écran n'affiche pas. */
  avoirNoor: number;
  /** Le seuil d'alerte posé au début du devoir sur le produit b. */
  seuilAlerte: number;
};

/**
 * Ce que le stock et les comptes doivent valoir à la fin du devoir : tout est recalculé depuis les
 * opérations, jamais recopié. Les montants dépendent donc du catalogue — c'est le prix à payer
 * pour des ventes qui tombent juste sur les couleurs réellement chargées.
 */
export function calculerResultats(cibles: CiblesDevoir, lieux: Lieux = LIEUX_PAR_DEFAUT): Resultats {
  const ventes = construireVentes(cibles);
  const mouvements = construireMouvements(cibles, lieux);
  const retour = retourDuDevoir(cibles);

  const depart = new Map<string, { libelle: string; depart: number }>();
  const poser = (cle: string, libelle: string, quantite: number) => {
    if (!depart.has(cle)) depart.set(cle, { libelle, depart: quantite });
  };
  poser('a', libelleCible(cibles.a), cibles.a.quantite);
  poser('b', libelleCible(cibles.b), cibles.b.quantite);
  poser('c', libelleCible(cibles.c), cibles.c.quantite);
  poser('d', libelleCible(cibles.d), cibles.d.quantite);
  poser('e', libelleCible(cibles.e), cibles.e.quantite);
  if (cibles.v) poser('v', libelleCible(cibles.v), cibles.v.quantite);
  if (cibles.w) poser('w', libelleCible(cibles.w), cibles.w.quantite);
  for (const [prefixe, cible] of [['m', cibles.m], ['n', cibles.n]] as const) {
    for (const variante of cible?.variantes || []) {
      poser(cleMulti(prefixe, variante.label), `${cible!.nom} — ${variante.label}`, variante.quantite);
    }
  }
  if (cibles.r) poser('r', libelleCible(cibles.r), cibles.r.quantite);

  const delta = new Map<string, number>();
  const bouger = (cle: string, valeur: number) => delta.set(cle, (delta.get(cle) || 0) + valeur);
  for (const vente of ventes) for (const ligne of vente.lignes) bouger(ligne.cle, -ligne.quantite);
  for (const mouvement of mouvements) bouger(mouvement.cle, mouvement.delta);

  const lignes: LigneStock[] = Array.from(depart.entries()).map(([cle, d]) => ({
    cle, libelle: d.libelle, depart: d.depart, final: d.depart + (delta.get(cle) || 0),
  }));
  const valeur = (cle: string) => lignes.find(l => l.cle === cle)?.final ?? 0;
  const parPrefixe = (prefixe: string) => lignes.filter(l => l.cle.startsWith(`${prefixe}:`));

  // ── L'argent ──
  // Le retour rabote la facture de la vente 2 : c'est ce qui fait que le chiffre d'affaires final
  // n'est pas la somme des ventes saisies.
  const totalVente = (v: Vente) => (v.numero === 2 ? arrondi(v.total - retour.valeur) : v.total);
  const encaisseVente = (v: Vente) =>
    arrondi(v.reglements.reduce((s, r) => s + (r.encaisse ? r.montant : 0), 0));

  const chiffreAffaires = arrondi(ventes.reduce((s, v) => s + totalVente(v), 0));
  const encaisse = arrondi(ventes.reduce((s, v) => s + encaisseVente(v), 0));
  const soldeClient = (client: 'NOOR' | 'ZAHRA') => arrondi(ventes
    .filter(v => v.client === client)
    .reduce((s, v) => s + Math.max(0, arrondi(totalVente(v) - encaisseVente(v))), 0));
  const avoirNoor = arrondi(ventes
    .filter(v => v.client === 'NOOR')
    .reduce((s, v) => s + Math.max(0, arrondi(encaisseVente(v) - totalVente(v))), 0));

  const soldeNoor = soldeClient('NOOR');
  const soldeZahra = soldeClient('ZAHRA');

  return {
    lignes,
    a: valeur('a'), b: valeur('b'), c: valeur('c'), d: valeur('d'), e: valeur('e'),
    v: cibles.v ? valeur('v') : null,
    w: cibles.w ? valeur('w') : null,
    rReserve: cibles.r ? valeur('r') : null,
    m: parPrefixe('m'), n: parPrefixe('n'),
    chiffreAffaires, encaisse,
    creances: arrondi(soldeNoor + soldeZahra),
    soldeNoor, soldeZahra, avoirNoor,
    seuilAlerte: valeur('b') + 10,
  };
}

const echapper = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

const nb = (n: number) => n.toLocaleString('fr-MA');
const mad = (n: number) => `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`;

const STYLE = `
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #1c1917; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 1mm; letter-spacing: -.01em; }
  h2 { font-size: 12pt; margin: 7mm 0 2mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #1c1917;
       break-after: avoid; page-break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1mm; }
  p, li { margin: 0 0 1.8mm; }
  .chapeau { color: #57534e; font-size: 9.5pt; margin-bottom: 4mm; }
  .encadre { border: 1px solid #d6d3d1; background: #fafaf9; border-radius: 3mm;
             padding: 3mm 3.5mm; margin: 2.5mm 0; font-size: 9.5pt; break-inside: avoid; }
  .encadre b { display: block; margin-bottom: .8mm; }
  table { width: 100%; border-collapse: collapse; margin: 2.5mm 0; font-size: 9.5pt;
          break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; border-bottom: 1.5px solid #1c1917; padding: 1.5mm 2mm;
       font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #57534e; }
  td { border-bottom: 1px solid #e7e5e4; padding: 1.8mm 2mm; vertical-align: top; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .prod { font-weight: 700; }
  .var { color: #7c3aed; font-weight: 700; }
  .rep { color: #a8a29e; letter-spacing: .06em; }
  .q { margin: 1.5mm 0 2.5mm; }
  .note { font-size: 9pt; color: #57534e; }
  ul { margin: 0 0 2mm; padding-left: 5mm; }
  .sig { margin-top: 6mm; font-size: 9pt; color: #78716c; }
  @media print { .rep { color: #d6d3d1; } }
`;

/** Une ligne « question → pointillés » où écrire la réponse. */
const q = (texte: string, taille = 28) =>
  `<p class="q">${texte}<br><span class="rep">${'.'.repeat(taille)}</span></p>`;

const prod = (c: Cible | null) =>
  c ? (c.variante
      ? `<span class="prod">${echapper(c.nom)}</span> — <span class="var">${echapper(c.variante)}</span>`
      : `<span class="prod">${echapper(c.nom)}</span>`)
    : '—';

/** Le nom d'un produit multicouleur, sans coloris : « Doublure polyester ». */
const nomMulti = (c: CibleMulti | null) => (c ? `<span class="prod">${echapper(c.nom)}</span>` : '—');

/** Un produit écrit « Nom — COLORIS » : le produit en gras, le coloris en violet. */
const libelleProduit = (libelle: string) => {
  const [nom, variante] = libelle.split(' — ');
  return variante
    ? `<span class="prod">${echapper(nom)}</span> — <span class="var">${echapper(variante)}</span>`
    : `<span class="prod">${echapper(nom)}</span>`;
};

const tableauVente = (v: Vente) => `
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead><tbody>
${v.lignes.map(l => `<tr><td>${libelleProduit(l.libelle)}</td><td class="n">${l.masquee ? 'tout le reste' : nb(l.quantite)}</td><td class="n">${mad(l.prix)}</td></tr>`).join('')}
</tbody></table>`;

const enTeteVente = (v: Vente) => {
  const client = v.client === 'COMPTOIR' ? 'Comptoir, sans client'
    : v.client === 'NOOR' ? CLIENTS_DEVOIR.NOOR.nom : CLIENTS_DEVOIR.ZAHRA.nom;
  const remise = v.remisePct > 0 ? ` · remise ${v.remisePct} %` : '';
  return `<h3>Vente ${v.numero} — ${echapper(v.titre)}</h3>
<p class="note">${echapper(client)}${remise}</p>`;
};

/** Le devoir, prêt à imprimer. Aucun en-tête à remplir : c'est une feuille de travail, pas un examen. */
export function devoirHtml(lignes: LigneChargement[], cibles: CiblesDevoir, lieux: Lieux): string {
  const ventes = construireVentes(cibles);
  const resultats = calculerResultats(cibles, lieux);
  const refus = venteRefusee(cibles);
  const retour = retourDuDevoir(cibles);
  const couleur = couleurInventoriee(cibles);
  const venteParNumero = (numero: number) => ventes.find(v => v.numero === numero);

  const boutique = lignes.filter(l => l.lieu === 'MAGASIN');
  const reserve = lignes.filter(l => l.lieu === 'ENTREPOT');
  const ligneTableau = (l: LigneChargement) => `
    <tr>
      <td class="prod">${echapper(l.nom)}</td>
      <td>${echapper(l.categorie)}</td>
      <td class="n">${nb(l.quantite)}</td>
      <td>${l.variantes[0]?.label
        ? l.variantes.map(v => `<span class="var">${echapper(v.label)}</span> ${nb(v.quantite)}`).join(' · ')
        : '<span class="note">une seule ligne</span>'}</td>
    </tr>`;

  const blocVente = (numero: number, extra = '') => {
    const v = venteParNumero(numero);
    if (!v) return '';
    return `${enTeteVente(v)}${tableauVente(v)}
<p class="note">${echapper(v.consigne)}</p>
${v.reglements.length > 0 && v.client !== 'COMPTOIR'
  ? `<p>Règlement : ${v.reglements.map(r => `<b>${mad(r.montant)}</b> — ${echapper(r.libelle)}`).join(' · ')}${v.reste > 0 ? ` · le reste à crédit` : ''}</p>`
  : ''}
${extra}`;
  };

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Devoir de formation — ${echapper(lieux.boutique)}</title><style>${STYLE}</style></head><body>

<h1>Devoir de formation — logiciel de stock</h1>
<p class="chapeau">Un stock d'entraînement a été chargé sur de vrais produits. Rien n'est de la
vraie marchandise : tout sera effacé à la fin. Tu ne peux rien casser — mais tu travailles comme
si c'était vrai, parce que c'est exactement ce que tu feras la semaine prochaine.</p>

<div class="encadre">
  <b>Quatre règles</b>
  Tu ne touches jamais à l'écran /gestion, sauf là où le devoir te le dit.<br>
  Si un écran refuse une opération, tu ne forces pas : tu notes le message dans la marge et tu
  passes à la suite. Savoir lire un refus fait partie du métier.<br>
  Si le logiciel affiche <b>« vente à perte »</b>, c'est que le prix imposé par l'exercice est
  en dessous de ce que la marchandise a coûté. Tu ne peux pas la valider seul, et c'est voulu :
  appelle ton responsable, lui seul peut passer outre.<br>
  Un chèque réclame une <b>photo</b> avant d'être enregistré. Prends n'importe quel papier en
  photo : ici il n'y a pas de vrai chèque.
</div>

<h2>Ton stock de départ</h2>
<p class="note">Un produit <b>simple</b> n'a qu'une ligne de stock. Un produit <b>ventilé</b>
existe en plusieurs couleurs, qualités ou tailles, et <b>chaque variante a son propre stock</b> :
vendre du bleu ne touche pas au rouge. C'est ce qui cause le plus d'erreurs en magasin.</p>

<h3>En boutique (${echapper(lieux.boutique)})</h3>
<table><thead><tr><th>Produit</th><th>Famille</th><th class="n">Quantité</th><th>Détail</th></tr></thead>
<tbody>${boutique.map(ligneTableau).join('')}</tbody></table>

<h3>En réserve (${echapper(lieux.reserve)})</h3>
<table><thead><tr><th>Produit</th><th>Famille</th><th class="n">Quantité</th><th>Détail</th></tr></thead>
<tbody>${reserve.map(ligneTableau).join('')}</tbody></table>

<h2>1. Lire un stock</h2>
<p class="note">Écran <b>Stock</b>.</p>
${q(`Quelle quantité pour ${prod(cibles.a)} ?`, 14)}
${cibles.m ? q(`Cherche ${nomMulti(cibles.m)}. Combien de lignes apparaissent pour ce produit, et pourquoi ?`, 60) : ''}
${cibles.m ? q(`Pour ce même produit : quelle couleur a le plus de stock, et combien ? Et la plus faible ?`, 45) : ''}
${cibles.m ? q(`Additionne les couleurs : combien fait le produit en tout ?`, 20) : ''}
${cibles.r ? q(`Cherche ${prod(cibles.r)}. Quelle quantité, et à quel endroit se trouve-t-elle ?`, 40) : ''}
${q(`Va dans <b>Mouvements</b> et retrouve l'entrée de ${prod(cibles.a)}. Quelle raison, et que dit la note ?`, 60)}
<div class="encadre"><b>À retenir</b>
L'écran <b>Stock</b> montre où on en est. L'écran <b>Mouvements</b> montre comment on y est arrivé.
Quand un chiffre semble faux, la réponse est toujours dans les mouvements.</div>

<h2>2. Poser un seuil d'alerte</h2>
<p>Un seuil, c'est la quantité en dessous de laquelle le produit doit être signalé. C'est lui qui
transforme « je crois qu'on va en manquer » en une alerte que tout le monde voit.</p>
<p class="note">Écran <b>Alertes</b> → le produit ${prod(cibles.b)} → bouton de seuil.
Pose <b>${nb(resultats.seuilAlerte)}</b>. Le seuil se pose sur un produit, pas sur une couleur.</p>
${q(`Le produit apparaît-il tout de suite dans les alertes ? Pourquoi ?`, 45)}
${q(`On y reviendra à la fin du devoir. Note ici la quantité qu'il a aujourd'hui.`, 16)}

<h2>3. Détecter un besoin et le transmettre à l'import</h2>
<p>Un client demande un produit qu'on n'a pas, ou tu vois un rayon qui se vide : c'est un
<b>besoin</b>. Tu ne commandes rien toi-même — l'import décide, négocie et achète. Ton travail
est de <b>détecter le besoin, l'écrire proprement, et le transmettre</b>.</p>
<div class="encadre">
  <b>Le processus, dans l'ordre</b>
  1. <b>Détecter</b> le besoin : rupture, demande client répétée, saison qui arrive.<br>
  2. <b>L'écrire</b> dans le logiciel : produit, quantité, couleur ou qualité voulue, et
     <b>pourquoi</b> tu le demandes. Un besoin sans justification ne sera pas traité.<br>
  3. <b>L'imprimer en PDF</b> — c'est la trace écrite, datée, de ce que le magasin a demandé.<br>
  4. <b>Le donner au commercial</b> pour qu'il confirme : bonne référence, bonne quantité, bon
     moment. C'est lui qui connaît la demande du marché.<br>
  5. Le <b>service import</b> reçoit le besoin visé, le transforme en commande, suit le transit
     et l'arrivage. La marchandise revient des mois plus tard.
</div>
<p class="note">Écran <b>Demandes d'import</b> → <b>Nouvelle demande</b>. Commence le nom par
<b>FORMATION —</b> pour qu'on puisse l'effacer ensuite. Quantité : 500. Écris une vraie
justification, comme si tu la défendais devant le commercial.</p>
${q(`Quel est le statut de ta demande juste après l'envoi ?`, 24)}
${q(`Cette demande fait-elle bouger le stock ? Pourquoi ?`, 50)}
${q(`Combien d'étapes séparent ta demande de la marchandise en rayon ? Cite-les dans l'ordre.`, 60)}
${q(`Imprime ta demande et fais-la relire. Qu'est-ce que le commercial a corrigé ou confirmé ?`, 55)}

<h2>4. Transférer de la marchandise</h2>
<p>Un transfert déplace de la marchandise <b>d'un magasin à un autre</b>. Il écrit toujours
<b>deux</b> mouvements : une sortie au départ, une entrée à l'arrivée. La marchandise part
physiquement avec le bon imprimé.</p>
<p class="note"><b>À faire avec ton responsable</b> : seul un compte administrateur peut valider un
transfert. Tu regardes, tu notes, tu poses des questions.</p>

<h3>a. De ${echapper(lieux.boutique)} vers ${echapper(lieux.autreMagasin)}</h3>
<table><thead><tr><th>Produit</th><th class="n">Quantité</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)}</td><td class="n">50</td></tr>
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td class="n">20</td></tr>` : ''}
</tbody></table>
${q(`Le lieu de départ ne se change pas. Pourquoi, à ton avis ?`, 50)}
${cibles.w ? q(`Le transfert de la variante a-t-il touché les autres couleurs du même produit ? Pourquoi ?`, 50) : ''}
${q(`Vérifie dans <b>Mouvements</b> : combien de lignes ce transfert a-t-il écrites, et lesquelles ?`, 55)}

${cibles.r ? `<h3>b. Ce qui est en réserve ne part pas d'ici</h3>
<p class="note">Essaie d'ajouter ${prod(cibles.r)} à un transfert vers ${echapper(lieux.autreMagasin)}.</p>
${q(`Que dit le logiciel, et pourquoi ?`, 55)}` : ''}

<h2>5. Corriger le stock à la main</h2>
<p class="note">Écran <b>Mouvements</b> → <b>Nouveau mouvement</b>.</p>
<p><b>a.</b> Une livraison de <b>120</b> unités de ${prod(cibles.a)} n'a jamais été saisie.
Fais-la entrer en boutique — motif <b>Ajustement inventaire</b>, avec une note claire.</p>
<p><b>b.</b> <b>15</b> unités de ${prod(cibles.b)} ont été abîmées par une infiltration. Sors-les,
motif <b>Perte</b>, avec une note qui explique.</p>
${cibles.v ? `<p><b>c.</b> <b>10</b> unités de ${prod(cibles.v)} sont tombées dans l'huile. Sors-les.</p>` : ''}
${cibles.v ? q(`Les autres variantes de ce produit ont-elles changé ?`, 20) : ''}
${q(`Pourquoi faut-il toujours écrire une note sur un mouvement ?`, 55)}

<h3>d. Un achat au marché</h3>
<p>Acheter chez un grossiste de Casablanca n'a rien à voir avec un arrivage d'import : c'est une
<b>dépense</b> du magasin, payée tout de suite, et la marchandise entre en stock le jour même.</p>
<p class="note"><b>Avec ton responsable</b> — écran <b>Frais &amp; Dépenses</b> →
<b>Achat Marchandise (Marché)</b>. Choisis une référence du catalogue (il n'y a pas de saisie
libre : c'est ce qui évite les doublons mal orthographiés), 60 unités à 25,00, fournisseur
« Marché Derb Omar », et coche l'ajout au stock.</p>
${q(`Combien d'écritures cet achat a-t-il créées, et lesquelles ?`, 55)}
${q(`Pourquoi ce n'est pas un « arrivage » ?`, 50)}

<h2>6. Les clients et les premières ventes</h2>
<p><b>Crée deux clients</b> : <b>${echapper(CLIENTS_DEVOIR.NOOR.nom)}</b>, plafond de crédit
${nb(CLIENTS_DEVOIR.NOOR.plafond)} — <b>${echapper(CLIENTS_DEVOIR.ZAHRA.nom)}</b>, plafond
${nb(CLIENTS_DEVOIR.ZAHRA.plafond)}.</p>

${blocVente(1, q(`Total encaissé ?`, 16))}
${blocVente(2, `${q(`Total après remise ? Reste dû ? Statut de la facture ?`, 40)}
${q(`La cliente a tout payé et la facture n'est pas « payée ». Pourquoi ? <span class="note">(la question la plus importante du devoir)</span>`, 60)}`)}
${blocVente(3, q(`Total ? Statut ? Combien ${echapper(CLIENTS_DEVOIR.ZAHRA.nom)} doit-elle maintenant ?`, 40))}
${blocVente(4)}
${blocVente(5, q(`Quelles lignes de ce produit ont bougé dans l'écran Stock ?`, 50))}

<h2>7. Vendre par couleur</h2>
<p>C'est ici que le métier se joue. Un client ne demande pas « du ruban » : il demande
<b>ce ruban, en noir, en blanc et en beige</b>, et pas les mêmes quantités. Chaque coloris est une
ligne de stock à part : tu dois choisir la bonne ligne, autant de fois qu'il y a de couleurs.</p>

${blocVente(6, `${q(`Combien de lignes ta facture porte-t-elle ?`, 14)}
${q(`Dans <b>Mouvements</b> : combien de sorties cette seule vente a-t-elle écrites ?`, 20)}
${cibles.m && cibles.m.variantes.length > 4 ? q(`Une couleur de ce produit n'a pas été vendue. A-t-elle bougé ?`, 20) : q(`Reprends l'écran Stock : quelles couleurs ont baissé, et de combien ?`, 50)}`)}
${blocVente(7, `${q(`Combien de lignes, et pour combien de produits différents ?`, 24)}
${q(`Reste dû après le règlement ? Que devient-il pour la cliente ?`, 40)}`)}
${blocVente(8, `${q(`Quelle quantité restait-il réellement ? Qu'a fait le champ quand tu as saisi 999 ?`, 45)}
${q(`Une fois la vente passée, quel mot l'écran Stock affiche-t-il sur cette ligne ?`, 24)}
${q(`Les autres couleurs de ce produit sont-elles concernées ?`, 24)}`)}

<h2>8. Préparer une commande avant l'arrivée du client</h2>
<p>Un client appelle et passe prendre sa marchandise dans l'après-midi : on prépare son bon
<b>à l'avance</b>. Une commande préparée ne sort rien du stock et n'encaisse rien — c'est un
papier. C'est sa <b>facturation</b> qui fait sortir la marchandise.</p>
${blocVente(9, `${q(`Après « Préparer la commande » : le stock a-t-il bougé ?`, 24)}
${q(`Où retrouves-tu cette commande, et dans quel état est-elle ?`, 40)}
${q(`Après l'avoir facturée : le stock a-t-il bougé cette fois ? Et le statut de la facture ?`, 45)}
${q(`Une commande préparée réserve-t-elle la marchandise ? Que se passerait-il si tu vendais ces mêmes pièces entre-temps ?`, 55)}`)}

<h2>9. Une vente que le logiciel refuse</h2>
<p class="note">Reprends la caisse pour ${echapper(refus.client)} :
<b>${nb(refus.quantite)}</b> × ${prod(cibles.c)} à ${mad(refus.prix)}, <b>à crédit</b>.</p>
${q(`Que se passe-t-il au moment de valider ?`, 45)}
${q(`<b>Refuse</b> la confirmation. Qu'est-ce qui a été créé dans le logiciel ?`, 40)}
${q(`Cette cliente a un plafond de ${mad(refus.plafond)}. Que faut-il faire avant de pouvoir lui vendre davantage ?`, 55)}

<h2>10. Un retour client</h2>
<p>Un client rapporte de la marchandise : elle <b>revient en stock</b> et il faut lui rendre sa
valeur. C'est le seul mouvement qui fait entrer de la marchandise sans achat.</p>
<p class="note">Écran <b>Factures</b> → la facture de la vente 2 → <b>Retour</b>.
${echapper(CLIENTS_DEVOIR.NOOR.nom)} rapporte <b>${nb(retour.quantite)}</b> unités de
${prod(cibles.e)}.</p>
${q(`Quelle quantité ce produit affiche-t-il après le retour ?`, 20)}
${q(`Quel type de mouvement le retour a-t-il créé, et dans quel lieu ?`, 45)}
${q(`De combien la facture a-t-elle baissé ? La cliente avait payé une remise de ${retour.remisePct} % sur ces unités : le compte tombe-t-il juste ?`, 55)}

<h2>11. L'argent : chèques, banque, impayé</h2>
<p class="note">Écran <b>Trésorerie</b>.</p>
<p><b>a.</b> Affecte le chèque FORM-001 (${mad(1000)}) à la société LEBTEX.
<b>b.</b> Émets un bordereau de remise contenant ce chèque.
<b>c.</b> La banque a crédité : marque FORM-001 comme encaissé.</p>
${q(`Référence du bordereau ?`, 30)}
${q(`Statut de la facture de la vente 2 maintenant ?`, 30)}
<p><b>d.</b> Le chèque FORM-002 revient <b>impayé</b>. Déclare-le.</p>
${q(`Que deviennent la facture de la vente 4 et le solde d'${echapper(CLIENTS_DEVOIR.NOOR.nom)} ?`, 45)}
${q(`En une phrase : quelle différence entre <b>vendre</b> et <b>encaisser</b> ?`, 55)}

<h2>12. L'inventaire physique</h2>
<p>L'inventaire aveugle, c'est compter <b>sans regarder</b> ce que dit l'ordinateur. L'écart
n'apparaît qu'après ta saisie : si tu vois le chiffre avant, tu ne comptes plus, tu recopies.</p>
<p class="note">Écran <b>Inventaire</b>. Vérifie que ${echapper(lieux.boutique)} est bien
sélectionné en haut.</p>
<table><thead><tr><th>Produit</th><th>Ce que tu comptes en rayon</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)}</td><td>exactement ce que l'écran affiche</td></tr>
<tr><td>${prod(cibles.b)}</td><td>ce que l'écran affiche <b>moins 5</b></td></tr>
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td>ce que l'écran affiche <b>plus 12</b></td></tr>` : ''}
${couleur ? `<tr><td><span class="prod">${echapper(couleur.nom)}</span> — <span class="var">${echapper(couleur.label)}</span></td><td>ce que l'écran affiche <b>moins 3</b></td></tr>` : ''}
</tbody></table>
${q(`Quels écarts le logiciel affiche-t-il ?`, 40)}
${couleur ? q(`Pour la couleur comptée : l'écart touche-t-il les autres coloris du produit ?`, 40) : ''}
${q(`Un écart positif, c'est plus en rayon que dans l'ordinateur. Cite deux causes possibles.`, 55)}
${q(`Valide la session, puis regarde dans <b>Mouvements</b> : combien de lignes ta validation a-t-elle écrites, et de quel type ?`, 55)}

<h2>13. La boucle est bouclée</h2>
<p class="note">Retourne à l'écran <b>Alertes</b>, celui de la partie 2.</p>
${q(`${prod(cibles.b)} y apparaît-il maintenant ? Pourquoi, alors qu'il n'y était pas au début ?`, 55)}
${cibles.n ? q(`Et la couleur que tu as vidée à la vente 8 : comment est-elle signalée ?`, 40) : ''}
${q(`Une alerte, c'est le début de quoi ? <span class="note">(relis la partie 3)</span>`, 45)}

<h2>14. Contrôle final</h2>
<p class="note">À remplir sans rien modifier. Tout se lit dans <b>Stock</b>, <b>Clients</b> et le
<b>Tableau de bord</b>.</p>
<table><thead><tr><th>Question</th><th class="n">Réponse</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.b)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.c)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.d)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.e)} en boutique</td><td class="n rep">............</td></tr>
${cibles.v ? `<tr><td>${prod(cibles.v)}</td><td class="n rep">............</td></tr>` : ''}
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td class="n rep">............</td></tr>` : ''}
${[...resultats.m, ...resultats.n].map(l => `<tr><td>${libelleProduit(l.libelle)}</td><td class="n rep">............</td></tr>`).join('')}
<tr><td>Chiffre d'affaires de toutes les ventes</td><td class="n rep">............</td></tr>
<tr><td>Argent réellement encaissé</td><td class="n rep">............</td></tr>
<tr><td>Solde dû par ${echapper(CLIENTS_DEVOIR.NOOR.nom)}</td><td class="n rep">............</td></tr>
<tr><td>Solde dû par ${echapper(CLIENTS_DEVOIR.ZAHRA.nom)}</td><td class="n rep">............</td></tr>
</tbody></table>
${q(`Entre le chiffre d'affaires et l'argent encaissé il y a un écart. Où est passé cet argent ?`, 60)}
${q(`Cite tous les types de mouvements que tu as créés pendant ce devoir, et pour chacun ce qu'il fait au stock : entrée, sortie, ou les deux.`, 60)}

<h2>Ce qu'on attend de toi</h2>
<ul>
<li><b>La rigueur avant la vitesse.</b> Une quantité fausse saisie en trois secondes coûte une journée à retrouver.</li>
<li><b>Une couleur n'est pas le produit.</b> Vendre du bleu ne touche jamais au rouge.</li>
<li><b>Un mouvement porte toujours un motif lisible.</b> C'est la seule trace qui l'explique six mois après.</li>
<li><b>Un chèque n'est pas de l'argent</b> tant que la banque ne l'a pas crédité.</li>
<li><b>La marchandise a un lieu.</b> Ce qui est en réserve ne part pas d'un magasin.</li>
<li><b>On ne force jamais un écran qui refuse.</b> On note, et on demande.</li>
</ul>
</body></html>`;
}

/** Le corrigé, avec les réponses calculées sur les produits réellement chargés. */
export function corrigeHtml(lignes: LigneChargement[], cibles: CiblesDevoir, lieux: Lieux): string {
  const r = calculerResultats(cibles, lieux);
  const ventes = construireVentes(cibles);
  const refus = venteRefusee(cibles);
  const retour = retourDuDevoir(cibles);
  const couleur = couleurInventoriee(cibles);
  const depart = (c: Cible | null) => (c ? nb(c.quantite) : '—');
  const venteParNumero = (numero: number) => ventes.find(v => v.numero === numero);
  const totalDe = (numero: number) => {
    const v = venteParNumero(numero);
    return v ? mad(v.total) : '—';
  };
  const ligneResultat = (l: LigneStock) => `
    <tr><td>${libelleProduit(l.libelle)}</td>
    <td class="n">${nb(l.depart)}</td><td class="n"><b>${nb(l.final)}</b></td></tr>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Corrigé — devoir de formation</title><style>${STYLE}</style></head><body>

<h1>Corrigé du devoir de formation</h1>
<p class="chapeau">À garder. Ne pas donner avant la correction.</p>

<div class="encadre"><b>Deux choses à savoir avant de lancer le devoir</b>
Le devoir impose des prix de vente. Sur certaines références, le prix imposé tombe sous le coût
de la marchandise : l'écran affiche « vente à perte » et <b>refuse</b> la vente à un compte
vendeur. C'est la règle, pas une panne. Valide alors ces ventes depuis <b>ton</b> compte
(« Valider malgré la perte ») pour que les totaux ci-dessous restent justes.<br>
Les transferts et l'achat au marché demandent aussi un compte administrateur : ce sont les deux
exercices à faire avec la recrue, pas à lui laisser seul.</div>

<div class="encadre"><b>Avant de nettoyer</b>
Le bouton « Reset Stock (0) » n'efface pas que le devoir : il supprime tout le fichier clients de
l'écran Stock, tous les mouvements, ventes, factures et paiements, toutes les dépenses et remises,
tous les transferts, les commandes préparées et tout le journal d'audit. Il supprime aussi les
références créées par un achat au marché. Les arrivages gardent leur statut mais perdent leurs
mouvements : ceux déjà réconciliés repasseront « à compléter ».<br>
Si une réconciliation d'arrivages est en cours, ne reset pas : supprime à la main les mouvements
notés « STOCK DE FORMATION », les deux clients « (formation) » et les factures du devoir.<br>
La <b>demande d'import</b> de la partie 3 vit dans /gestion → Besoins : elle commence par
« FORMATION — », à supprimer là-bas.</div>

<h2>Les produits du devoir</h2>
<table><thead><tr><th>Rôle</th><th>Produit</th><th class="n">Départ</th><th class="n">Attendu à la fin</th></tr></thead><tbody>
<tr><td>Produit principal</td><td>${prod(cibles.a)}</td><td class="n">${depart(cibles.a)}</td><td class="n"><b>${nb(r.a)}</b></td></tr>
<tr><td>Perte + vente + inventaire</td><td>${prod(cibles.b)}</td><td class="n">${depart(cibles.b)}</td><td class="n"><b>${nb(r.b)}</b></td></tr>
<tr><td>Crédit + commande préparée</td><td>${prod(cibles.c)}</td><td class="n">${depart(cibles.c)}</td><td class="n"><b>${nb(r.c)}</b></td></tr>
<tr><td>Deux ventes</td><td>${prod(cibles.d)}</td><td class="n">${depart(cibles.d)}</td><td class="n"><b>${nb(r.d)}</b></td></tr>
<tr><td>Vente + retour client</td><td>${prod(cibles.e)}</td><td class="n">${depart(cibles.e)}</td><td class="n"><b>${nb(r.e)}</b></td></tr>
${cibles.v ? `<tr><td>Couleur : perte + vente</td><td>${prod(cibles.v)}</td><td class="n">${depart(cibles.v)}</td><td class="n"><b>${nb(r.v!)}</b></td></tr>` : ''}
${cibles.w ? `<tr><td>Couleur : transfert + inventaire</td><td>${prod(cibles.w)}</td><td class="n">${depart(cibles.w)}</td><td class="n"><b>${nb(r.w!)}</b></td></tr>` : ''}
${cibles.r ? `<tr><td>Réserve (ne bouge pas)</td><td>${prod(cibles.r)}</td><td class="n">${depart(cibles.r)}</td><td class="n"><b>${nb(r.rReserve!)}</b></td></tr>` : ''}
</tbody></table>

${r.m.length > 0 ? `<h3>Les couleurs de ${nomMulti(cibles.m)} — ventes 6, 7, 9 et inventaire</h3>
<table><thead><tr><th>Couleur</th><th class="n">Départ</th><th class="n">Attendu</th></tr></thead>
<tbody>${r.m.map(ligneResultat).join('')}</tbody></table>` : ''}
${r.n.length > 0 ? `<h3>Les couleurs de ${nomMulti(cibles.n)} — ventes 7 et 8</h3>
<table><thead><tr><th>Couleur</th><th class="n">Départ</th><th class="n">Attendu</th></tr></thead>
<tbody>${r.n.map(ligneResultat).join('')}</tbody></table>` : ''}

<h2>Les réponses</h2>

<h3>1. Lire un stock</h3>
<ul>
<li>Quantité de départ de ${prod(cibles.a)} : <b>${depart(cibles.a)}</b>.</li>
${cibles.m ? `<li>${echapper(cibles.m.nom)} affiche <b>${nb(cibles.m.variantes.length)} lignes</b>, une par couleur : chacune a son propre stock. La plus fournie est <b>${echapper(cibles.m.variantes[0].label)}</b> avec <b>${nb(cibles.m.variantes[0].quantite)}</b>, la plus faible <b>${echapper(cibles.m.variantes[cibles.m.variantes.length - 1].label)}</b> avec <b>${nb(cibles.m.variantes[cibles.m.variantes.length - 1].quantite)}</b>. Total : <b>${nb(cibles.m.variantes.reduce((s, v) => s + v.quantite, 0))}</b>.</li>` : ''}
${cibles.r ? `<li>${prod(cibles.r)} : <b>${depart(cibles.r)}</b>, en <b>réserve</b> — pas en boutique.</li>` : ''}
<li>Le mouvement d'origine porte la raison <b>Inventaire</b> et la note <b>« STOCK DE FORMATION »</b>.</li>
<li>Stock = où on en est ; Mouvements = comment on y est arrivé.</li>
</ul>

<h3>2. Le seuil</h3>
<ul>
<li>Non, le produit n'apparaît pas : il en a <b>${depart(cibles.b)}</b>, bien au-dessus du seuil de
<b>${nb(r.seuilAlerte)}</b>. L'alerte ne se déclenche que quand le stock tombe au niveau du seuil.</li>
<li>Le seuil se pose sur la référence. Sur un produit ventilé, il vaut pour le produit, pas pour
un coloris pris à part.</li>
</ul>

<h3>3. Le besoin transmis à l'import</h3>
<ul>
<li>Statut après envoi : <b>Envoyée</b>.</li>
<li><b>Le stock ne bouge pas</b> : une demande n'est qu'un besoin transmis. Rien n'est acheté, rien n'est reçu.</li>
<li>Étapes attendues : détecter → écrire → imprimer → faire viser par le commercial → l'import
commande → transit → arrivage → entrée en stock → transfert en boutique. Trois étapes dans le bon
ordre suffisent pour le point.</li>
<li>La dernière question n'a pas de bonne réponse écrite : elle vérifie qu'il est allé voir le
commercial. C'est le réflexe qu'on veut installer.</li>
</ul>

<h3>4. Transferts</h3>
<ul>
<li>Un transfert écrit <b>deux</b> mouvements : une sortie au départ, une entrée à l'arrivée.</li>
<li>Le départ est figé sur <b>${echapper(lieux.boutique)}</b> : c'est le magasin qui approvisionne
les autres. On ne transfère pas dans l'autre sens depuis cet écran.</li>
${cibles.w ? `<li>Les autres couleurs n'ont pas bougé : un transfert porte sur une variante précise.</li>` : ''}
${cibles.r ? `<li>${prod(cibles.r)} est refusé : <b>« stock insuffisant au lieu de départ »</b>. La marchandise est en réserve, pas dans le magasin. Un transfert part toujours du magasin principal.</li>` : ''}
</ul>

<h3>5. Mouvements manuels et achat au marché</h3>
<ul>
<li>L'entrée de 120 doit être imputée à <b>${echapper(lieux.boutique)}</b>, pas à la réserve. Motif
<b>Ajustement inventaire</b> : « Arrivage fournisseur » est réservé aux conteneurs d'import et ne
propose que les entrepôts.</li>
<li>La perte de 15 doit porter le motif <b>Perte</b> et une note explicite.</li>
${cibles.v ? `<li>Les autres couleurs sont inchangées après la perte sur un seul coloris.</li>` : ''}
<li>La note est la seule trace qui explique le mouvement des mois plus tard.</li>
<li>L'achat au marché crée <b>deux</b> écritures : une <b>dépense</b> et une <b>entrée en stock</b>.
Ce n'est pas un arrivage : aucun conteneur, aucun transit, payé sur place.</li>
</ul>

<h3>6 et 7. Les ventes</h3>
<ul>
${ventes.filter(v => !v.viaCommande).map(v => `<li>Vente ${v.numero} : ${v.lignes.length} ligne(s) · sous-total <b>${mad(v.sousTotal)}</b>${v.remisePct > 0 ? ` − ${v.remisePct} % = <b>${mad(v.total)}</b>` : ''}${v.remisePct === 0 ? ` = <b>${mad(v.total)}</b>` : ''}${v.reste > 0 ? ` · reste dû <b>${mad(v.reste)}</b>` : ''}.</li>`).join('')}
<li><b>La question clé (vente 2)</b> : la cliente a bien remis ${totalDe(2)}, mais ${mad(1000)}
sont un chèque à 60 jours. Tant que la banque n'a pas crédité, cet argent n'est pas encaissé : la
facture est « en attente », pas « payée ». Elle passera en « payée » à l'encaissement.
<span class="note">Donner 0 à « c'est un bug ».</span></li>
${cibles.m ? `<li>Vente 6 : <b>${nb(venteParNumero(6)?.lignes.length || 0)} lignes</b> sur la même facture, et autant de sorties dans Mouvements — une par coloris. Le prix posé sur la première couleur se recopie automatiquement sur les autres lignes du même produit.</li>` : ''}
${cibles.n ? `<li>Vente 8 : le champ quantité <b>refuse d'aller au-delà du disponible</b> — il se cale tout seul sur le stock de la couleur. Après la vente, la ligne affiche <b>Rupture</b>, et les autres coloris n'ont pas bougé.</li>` : ''}
<li>Une vente n'est jamais « du produit » : c'est une ligne de stock précise. C'est le point à
vérifier en priorité en corrigeant.</li>
</ul>

<h3>8. La commande préparée</h3>
<ul>
<li>« Préparer la commande » <b>ne bouge pas le stock</b> et n'encaisse rien. La commande se
retrouve dans <b>Commandes préparées</b>, à l'état <b>Confirmé</b>.</li>
<li>C'est la <b>facturation</b> qui écrit les sorties. La facture sort <b>impayée</b> : il faut
l'encaisser depuis l'écran Factures.</li>
<li>Une commande préparée <b>ne réserve rien</b> : une vente passée entre-temps peut prendre les
mêmes pièces, et la facturation ne trouverait plus le stock. C'est la limite à connaître.</li>
</ul>

<h3>9. La vente refusée</h3>
<ul>
<li>Le logiciel annonce un <b>dépassement du plafond de crédit</b> : ${mad(refus.total)} de plus
sur un encours déjà à ${mad(r.soldeZahra)}, pour un plafond de ${mad(refus.plafond)}.</li>
<li>En refusant la confirmation, <b>rien n'est créé</b> : ni facture, ni mouvement. Le panier reste
à l'écran.</li>
<li>Pour vendre davantage : encaisser d'abord ce qui est dû, ou faire relever le plafond par le
responsable. <span class="note">Le logiciel demande confirmation, il n'interdit pas — c'est au
vendeur de ne pas passer outre tout seul.</span></li>
</ul>

<h3>10. Retour client</h3>
<ul>
<li>${prod(cibles.e)} après retour : <b>${nb(r.e)}</b>.</li>
<li>Le retour crée une <b>entrée</b>, motif <b>Retour</b>, dans la boutique.</li>
<li>La facture baisse de <b>${mad(retour.valeur)}</b> — le prix de la ligne. Mais la cliente
n'avait payé que <b>${mad(retour.paye)}</b> pour ces unités, remise de ${retour.remisePct} %
déduite : elle récupère <b>${mad(arrondi(retour.valeur - retour.paye))}</b> de trop. La remise
n'est pas reprise sur le retour. <b>Donne le point à qui le remarque</b> — c'est exactement le
réflexe recherché.</li>
${r.avoirNoor > 0 ? `<li>Comme la facture était intégralement réglée, la cliente se retrouve avec un <b>avoir de ${mad(r.avoirNoor)}</b> que l'écran n'affiche pas dans son solde : à déduire d'un prochain achat.</li>` : ''}
</ul>

<h3>11. L'argent</h3>
<ul>
<li>Bordereau de la forme <b>BRC-LEB-&lt;date&gt;-001</b>.</li>
<li>Après encaissement, la facture de la vente 2 passe à <b>Payée</b>.</li>
<li>Après l'impayé, la facture de la vente 4 redevient <b>Impayée</b> et le solde
d'${echapper(CLIENTS_DEVOIR.NOOR.nom)} remonte à <b>${mad(r.soldeNoor)}</b>.</li>
<li>Vendre sort la marchandise ; encaisser fait entrer l'argent. Les deux peuvent être séparés de
plusieurs mois, ou ne jamais se rejoindre.</li>
<li class="note">Si le logiciel refuse l'impayé, c'est que l'échéance n'est pas assez ancienne :
il faut au moins deux jours après la date d'échéance. Sécurité voulue, pas une panne.</li>
</ul>

<h3>12. Inventaire</h3>
<ul>
<li>Écarts : <b>0</b> pour ${prod(cibles.a)}, <b>−5</b> pour ${prod(cibles.b)}${cibles.w ? `, <b>+12</b> pour ${prod(cibles.w)}` : ''}${couleur ? `, <b>−3</b> pour ${echapper(couleur.nom)} — ${echapper(couleur.label)}` : ''}.</li>
${couleur ? `<li>L'écart ne touche <b>que</b> le coloris compté : les autres couleurs du produit gardent leur stock.</li>` : ''}
<li>Causes possibles d'un écart positif : vente encaissée sans être saisie, entrée saisie deux
fois, retour jamais enregistré, erreur de comptage précédente, marchandise rangée à deux endroits.</li>
<li>La validation écrit <b>${nb(1 + (cibles.w ? 1 : 0) + (couleur ? 1 : 0))}</b> ligne(s)
d'ajustement : un écart nul n'écrit rien, donc le premier produit ne donne aucune ligne.
<span class="note">Peu le remarquent.</span></li>
</ul>

<h3>13. La boucle</h3>
<ul>
<li>Oui : ${prod(cibles.b)} est tombé à <b>${nb(r.b)}</b>, au niveau du seuil de
<b>${nb(r.seuilAlerte)}</b> posé au début. L'alerte se déclenche toute seule.</li>
${cibles.n ? `<li>La couleur vidée à la vente 8 est signalée <b>Rupture</b>.</li>` : ''}
<li>Une alerte, c'est le <b>début d'un besoin d'import</b> : détecter, écrire, imprimer, faire
viser, transmettre. Le devoir tourne en rond, et c'est le but.</li>
</ul>

<h3>14. Contrôle final</h3>
<table><thead><tr><th>Question</th><th class="n">Réponse</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)} en boutique</td><td class="n"><b>${nb(r.a)}</b></td></tr>
<tr><td>${prod(cibles.b)} en boutique</td><td class="n"><b>${nb(r.b)}</b></td></tr>
<tr><td>${prod(cibles.c)} en boutique</td><td class="n"><b>${nb(r.c)}</b></td></tr>
<tr><td>${prod(cibles.d)} en boutique</td><td class="n"><b>${nb(r.d)}</b></td></tr>
<tr><td>${prod(cibles.e)} en boutique</td><td class="n"><b>${nb(r.e)}</b></td></tr>
${cibles.v ? `<tr><td>${prod(cibles.v)}</td><td class="n"><b>${nb(r.v!)}</b></td></tr>` : ''}
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td class="n"><b>${nb(r.w!)}</b></td></tr>` : ''}
${[...r.m, ...r.n].map(ligne => `<tr><td>${libelleProduit(ligne.libelle)}</td><td class="n"><b>${nb(ligne.final)}</b></td></tr>`).join('')}
<tr><td>Chiffre d'affaires</td><td class="n"><b>${mad(r.chiffreAffaires)}</b></td></tr>
<tr><td>Argent réellement encaissé</td><td class="n"><b>${mad(r.encaisse)}</b></td></tr>
<tr><td>Solde ${echapper(CLIENTS_DEVOIR.NOOR.nom)}</td><td class="n"><b>${mad(r.soldeNoor)}</b></td></tr>
<tr><td>Solde ${echapper(CLIENTS_DEVOIR.ZAHRA.nom)}</td><td class="n"><b>${mad(r.soldeZahra)}</b></td></tr>
</tbody></table>
<p><b>L'écart de ${mad(arrondi(r.chiffreAffaires - r.encaisse))}</b> entre le chiffre d'affaires et
la caisse, c'est ${mad(r.soldeZahra)} jamais réglés sur la vente à crédit, plus ${mad(r.soldeNoor)}
dus par ${echapper(CLIENTS_DEVOIR.NOOR.nom)} — un chèque revenu impayé et un reste à payer —
${r.avoirNoor > 0 ? `moins ${mad(r.avoirNoor)} payés en trop après le retour` : 'le compte tombe juste'}.
Vendre n'est pas encaisser.</p>

<h3>Les types de mouvements</h3>
<table><thead><tr><th>Mouvement</th><th>Effet sur le stock</th></tr></thead><tbody>
<tr><td>Entrée (achat au marché, correction)</td><td>entrée</td></tr>
<tr><td>Vente</td><td>sortie</td></tr>
<tr><td>Perte</td><td>sortie</td></tr>
<tr><td>Transfert</td><td><b>les deux</b> : sortie d'un lieu, entrée dans l'autre</td></tr>
<tr><td>Retour client</td><td>entrée</td></tr>
<tr><td>Ajustement d'inventaire</td><td>entrée ou sortie, selon le signe de l'écart</td></tr>
<tr><td>Commande préparée</td><td><b>aucun</b> — tant qu'elle n'est pas facturée</td></tr>
<tr><td>Demande d'import</td><td><b>aucun</b> — ce n'est pas un mouvement</td></tr>
</tbody></table>

<h2>Comment lire le résultat</h2>
<p>Les cinq réponses qui comptent vraiment, quel que soit le reste : <b>une couleur a son propre
stock</b> · <b>un chèque n'est pas de l'argent</b> · <b>la marchandise a un lieu</b> ·
<b>vendre n'est pas encaisser</b> · <b>un écran qui refuse a une raison</b>. Qui a ces cinq-là
comprendra le reste tout seul.</p>
<p class="sig">Généré depuis le stock de formation — ${echapper(lieux.boutique)}.</p>
</body></html>`;
}
