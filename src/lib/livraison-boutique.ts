// ─── Livraison de la boutique : frais, délais, modes de réception ────────────
// Une seule source pour tout ce que le site annonce sur la livraison : bandeaux,
// fiche produit, panier, formulaire de commande, confirmation, e-mails, pages
// Livraison et FAQ. Décisions du patron du 29/09/2026 :
//
// - Les colis partent par Sendit, qui ramasse au magasin de Derb Omar. Le client
//   paie le palier de LEBTEX, juste au-dessus du prix public de Sendit :
//   20 DH à Casablanca, 35 DH dans la périphérie de Casablanca et les grandes
//   villes, 45 DH dans les villes éloignées. Une ville que la liste ne connaît
//   pas (« Autre ville » tapée à la main) paie 45 DH : au téléphone, le prix ne
//   peut que baisser, jamais monter.
// - Plus aucune livraison offerte (décision du 30/09/2026) : le colis se paie
//   toujours, quel que soit le montant. Seul le retrait au magasin est gratuit.
//   Les commandes passées avant gardent la règle de leur date (commandes-boutique.ts).
// - Un rouleau entier (article « volumineux ») ne part jamais par Sendit : pas
//   de frais affichés, le transport s'organise par téléphone.
//
// Pur (aucun import de valeur) : testé par scripts/test-livraison-boutique.ts.
// Plus tard, quand les clés Sendit seront posées, le prix viendra du quartier
// choisi (GET /districts) ; cette grille restera la valeur de secours.

import type { LieuRetrait, ModeReception } from './shop-types';

export type ZoneLivraison = 'casablanca' | 'standard' | 'eloignee';

/** Frais d'un colis Sendit par zone, en DH (payés par le client). */
export const FRAIS_ZONE: Record<ZoneLivraison, number> = {
  casablanca: 20,
  standard: 35,
  eloignee: 45,
};

/** Délai annoncé après la confirmation de la commande (Sendit, jours ouvrés). */
export const DELAI_ZONE: Record<ZoneLivraison, string> = {
  casablanca: '24-48h',
  standard: '1-3 jours ouvrés',
  eloignee: '2-4 jours ouvrés',
};

/** Même délai, écrit en arabe (inséré dans les phrases arabes de la boutique). */
export const DELAI_ZONE_AR: Record<ZoneLivraison, string> = {
  casablanca: '24 إلى 48 ساعة',
  standard: 'من 1 إلى 3 أيام عمل',
  eloignee: 'من 2 إلى 4 أيام عمل',
};

/** Délai d'une zone dans la langue du site. */
export function delaiZone(zone: ZoneLivraison, language: 'fr' | 'ar'): string {
  return language === 'ar' ? DELAI_ZONE_AR[zone] : DELAI_ZONE[zone];
}

/** Nom lisible de chaque zone, pour les tableaux de prix. */
export const LIBELLE_ZONE: Record<ZoneLivraison, string> = {
  casablanca: 'Casablanca',
  standard: 'Périphérie de Casablanca et grandes villes',
  eloignee: 'Villes éloignées et autres villes',
};

/** Même nom, écrit en arabe. */
export const LIBELLE_ZONE_AR: Record<ZoneLivraison, string> = {
  casablanca: 'الدار البيضاء',
  standard: 'ضواحي الدار البيضاء والمدن الكبرى',
  eloignee: 'المدن البعيدة وباقي المدن',
};

// ─── Les villes par palier (sendit.ma/tarifs, lu le 28/09/2026) ──────────────
// Les noms sont écrits comme sur le site ; la recherche ignore accents, casse,
// espaces et tirets. Toute ville absente de ces listes est « éloignée ».

/**
 * Communes collées à Casablanca : colis à 35 DH, et camionnette LEBTEX possible pour un rouleau.
 * Les quatre premières sont celles que cite le patron ; les suivantes (Grand Casablanca)
 * sont ajoutées le 29/09/2026 pour qu'un rouleau n'y parte pas « par transporteur » :
 * liste à faire confirmer par le patron.
 */
export const PERIPHERIE_CASABLANCA: readonly string[] = [
  'Mohammedia', 'Bouskoura', 'Dar Bouazza', 'Médiouna',
  'Tit Mellil', 'Aïn Harrouda', 'Nouaceur', 'Had Soualem', 'Lahraouiyine', 'Deroua',
];

/** Grandes villes à 35 DH. */
export const GRANDES_VILLES: readonly string[] = [
  'Rabat', 'Salé', 'Témara', 'Kénitra', 'Fès', 'Meknès', 'Marrakech', 'Tanger', 'Agadir',
  'Inezgane', 'Oujda', 'Nador', 'El Jadida', 'Settat', 'Berrechid', 'Safi', 'Béni Mellal', 'Khouribga',
];

/**
 * Villes éloignées à 45 DH, pour l'affichage : toute ville absente des deux listes
 * du dessus paie aussi 45 DH, qu'elle soit ici ou non.
 */
export const VILLES_ELOIGNEES: readonly string[] = [
  'Tétouan', 'Taza', 'Al Hoceima', 'Khémisset', 'Guelmim', 'Laâyoune', 'Dakhla', 'Berkane',
  'Larache', 'Ksar el-Kébir', 'Khénifra', 'Sidi Kacem', 'Taourirt',
  'Tiznit', 'Essaouira', 'Ouarzazate', 'Errachidia', 'Taroudant', 'Chefchaouen',
];

/**
 * « Ksar el-Kébir », « KSAR EL KEBIR » et « ksarelkebir » donnent la même clé.
 * Les lettres arabes sont gardées (sans leurs voyelles) pour reconnaître « الدار البيضاء ».
 */
export function normaliserVille(ville: string): string {
  return String(ville ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064a]/g, '');
}

/** Autres façons courantes d'écrire une ville (clé normalisée → nom de la liste). */
const ALIAS: Record<string, string> = {
  casa: 'Casablanca',
  darelbeida: 'Casablanca',
  'الدارالبيضاء': 'Casablanca',
  'البيضاء': 'Casablanca',
  'كازا': 'Casablanca',
  'كازابلانكا': 'Casablanca',
  mohamedia: 'Mohammedia',
  mohammadia: 'Mohammedia',
  darbouaza: 'Dar Bouazza',
  // Quartiers de Casablanca parfois écrits comme une ville.
  sidimaarouf: 'Casablanca',
  ainsebaa: 'Casablanca',
  sidimoumen: 'Casablanca',
  titmelil: 'Tit Mellil',
  tizmellil: 'Tit Mellil',
  ainharrouda: 'Aïn Harrouda',
  ainharouda: 'Aïn Harrouda',
  hadsoualem: 'Had Soualem',
  hadsouallem: 'Had Soualem',
  lahraouiyine: 'Lahraouiyine',
  lahraouyine: 'Lahraouiyine',
  draoua: 'Deroua',
  sale: 'Salé',
  fez: 'Fès',
  tangier: 'Tanger',
  tangiers: 'Tanger',
  marrakesh: 'Marrakech',
  jadida: 'El Jadida',
  eljadida: 'El Jadida',
  berchid: 'Berrechid',
  benimellal: 'Béni Mellal',
  tetuan: 'Tétouan',
  hoceima: 'Al Hoceima',
  alhoceima: 'Al Hoceima',
  alhoceyma: 'Al Hoceima',
  laayoun: 'Laâyoune',
  layoune: 'Laâyoune',
  elayoun: 'Laâyoune',
  ksarelkebir: 'Ksar el-Kébir',
  ksarkebir: 'Ksar el-Kébir',
};

const cles = (villes: readonly string[]) => new Set(villes.map(normaliserVille));

/** Quartiers de Casablanca souvent écrits après « Casa » (« Casa Maarif ») dans « Autre ville ». */
const QUARTIERS_CASABLANCA = cles([
  'Anfa', 'Maarif', 'Maârif', 'Ain Sebaa', 'Ain Chock', 'Aïn Chock', 'Ain Diab', 'Hay Hassani', 'Hay Mohammadi',
  'Sidi Maarouf', 'Sidi Moumen', 'Sidi Bernoussi', 'Bernoussi', 'Oulfa', 'Lissasfa', 'Ben Msik', 'Sbata',
  'Moulay Rachid', 'Derb Sultan', 'Mers Sultan', 'Derb Omar', 'Habous', 'Roches Noires', 'Belvédère', 'Bourgogne',
  'Gauthier', 'Racine', 'Oasis', 'Californie', 'Centre', 'Centre ville', 'Sidi Belyout', 'Salmia', 'Attacharouk',
]);
const CLES_CASABLANCA = cles(['Casablanca']);
const CLES_PERIPHERIE = cles(PERIPHERIE_CASABLANCA);
const CLES_STANDARD = cles([...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES]);

/**
 * La clé de la ville, alias compris. « Casablanca - Ain Sebaa » (format des quartiers
 * Sendit), « Casablanca, Maârif » ou « Casablanca (Anfa) » se lisent comme « Casablanca ».
 */
function cleVille(ville: string): string {
  const brut = String(ville ?? '');
  const essayer = (texte: string) => {
    const cle = normaliserVille(texte);
    const alias = ALIAS[cle];
    return alias ? normaliserVille(alias) : cle;
  };
  const entiere = essayer(brut);
  if (CLES_STANDARD.has(entiere) || CLES_CASABLANCA.has(entiere)) return entiere;
  const debut = brut.split(/\s+-\s+|,|\(/)[0];
  const cle = debut !== brut ? essayer(debut) : entiere;
  if (CLES_STANDARD.has(cle) || CLES_CASABLANCA.has(cle)) return cle;
  // « Casablanca Anfa », « Casa Maarif », « الدار البيضاء المعاريف » tapés dans « Autre ville » :
  // la ville suivie d'un quartier reste Casablanca. « Casablancaaa » ou « Casa Nostra », non.
  const mots = brut.trim().split(/[\s,()-]+/).filter(Boolean);
  const premierMot = normaliserVille(mots[0] ?? '');
  const suite = normaliserVille(mots.slice(1).join(' '));
  if (premierMot === 'casablanca' || /^الدارالبيضاء/.test(entiere)
    || ((premierMot === 'casa' || premierMot === 'كازا') && QUARTIERS_CASABLANCA.has(suite))) {
    return normaliserVille('Casablanca');
  }
  return cle;
}

export function zoneDeVille(ville: string): ZoneLivraison {
  const cle = cleVille(ville);
  if (CLES_CASABLANCA.has(cle)) return 'casablanca';
  if (CLES_STANDARD.has(cle)) return 'standard';
  return 'eloignee';
}

export function estCasablanca(ville: string): boolean {
  return zoneDeVille(ville) === 'casablanca';
}

export function estPeripherieCasablanca(ville: string): boolean {
  return CLES_PERIPHERIE.has(cleVille(ville));
}

/** Frais d'un colis Sendit pour cette ville, payés par le client. */
export function fraisColis(ville: string): number {
  return FRAIS_ZONE[zoneDeVille(ville)];
}

export function delaiColis(ville: string, language: 'fr' | 'ar' = 'fr'): string {
  return delaiZone(zoneDeVille(ville), language);
}

/** « 20 MAD à Casablanca · 35 MAD périphérie et grandes villes · 45 MAD ailleurs » : la grille en une ligne (même unité que les prix du site). */
export const RESUME_FRAIS =
  `${FRAIS_ZONE.casablanca} MAD à Casablanca · ${FRAIS_ZONE.standard} MAD périphérie et grandes villes · ${FRAIS_ZONE.eloignee} MAD ailleurs`;
export const RESUME_FRAIS_AR =
  `${FRAIS_ZONE.casablanca} درهم في الدار البيضاء · ${FRAIS_ZONE.standard} درهم في الضواحي والمدن الكبرى · ${FRAIS_ZONE.eloignee} درهم في باقي المدن`;

/** Un seul rouleau entier suffit : la commande ne part pas par colis. */
export function commandeVolumineuse(items: { volumineux?: boolean }[]): boolean {
  return Array.isArray(items) && items.some((i) => i?.volumineux === true);
}

/** Ce que le client peut choisir : jamais de colis pour un volumineux, toujours le retrait gratuit. */
export function modesPossibles(volumineux: boolean): ModeReception[] {
  return volumineux ? ['retrait', 'transport'] : ['domicile', 'retrait'];
}

/** Les petits articles se préparent à Derb Omar (où Sendit ramasse), les rouleaux à CHRIFA (le stock). */
export function lieuRetraitPour(volumineux: boolean): LieuRetrait {
  return volumineux ? 'chrifa' : 'derb_omar';
}

/**
 * Frais de réception à ajouter au total :
 * - domicile : colis Sendit, toujours le palier de la ville, quel que soit le montant ;
 * - retrait : toujours gratuit ;
 * - transport : null, le prix se donne au téléphone (jamais « 0 », jamais « gratuit »).
 * Un mode inconnu se lit comme « domicile » : c'est ce qu'étaient toutes les anciennes commandes.
 */
export function fraisLivraison(p: { mode: ModeReception; ville: string }): number | null {
  if (p.mode === 'retrait') return 0;
  if (p.mode === 'transport') return null;
  return fraisColis(p.ville);
}

/** 0 n'arrive plus que pour le retrait au magasin : « Gratuit ». Français par défaut. */
export function libelleFrais(frais: number | null, language: 'fr' | 'ar' = 'fr'): string {
  const ar = language === 'ar';
  if (frais === null || typeof frais !== 'number' || !Number.isFinite(frais) || frais < 0) {
    return ar ? 'يُحدَّد عبر الهاتف' : 'À confirmer par téléphone';
  }
  if (frais === 0) return ar ? 'مجاني' : 'Gratuit';
  return ar ? `${frais} درهم` : `${frais} DH`;
}

/** Notice commune aux rouleaux entiers : fiche produit, panier, formulaire, confirmation. */
export const TEXTE_TRANSPORT_VOLUMINEUX =
  'Article volumineux (rouleau entier) : il ne part pas par colis. ' +
  'Vous pouvez le retirer gratuitement à Casablanca, le recevoir par notre camionnette ' +
  'à Casablanca et environs, ou le faire envoyer par transporteur jusqu’à son dépôt dans ' +
  'votre ville, où vous le récupérez. Nous vous appelons pour organiser le transport ; ' +
  'rien n’est envoyé avant votre accord.';

/** La même notice, pour le site en arabe. */
export const TEXTE_TRANSPORT_VOLUMINEUX_AR =
  'منتج كبير الحجم (لفافة كاملة): لا يُرسل في طرد. ' +
  'يمكنكم استلامه مجاناً في الدار البيضاء، أو توصيله بشاحنتنا داخل الدار البيضاء وضواحيها، ' +
  'أو إرساله مع ناقل إلى مستودعه في مدينتكم حيث تستلمونه. سنتصل بكم لتنظيم النقل، ' +
  'ولا يُرسل أي شيء قبل موافقتكم.';

/** Une ligne, là où la place manque (pied du tiroir du panier). */
export const TEXTE_VOLUMINEUX_COURT = 'Rouleau entier : retrait gratuit ou transport organisé par téléphone.';
export const TEXTE_VOLUMINEUX_COURT_AR = 'لفافة كاملة: استلام مجاني أو نقل يُنظَّم عبر الهاتف.';
