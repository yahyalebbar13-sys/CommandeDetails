// ─── Réglages de réception et de paiement de la boutique ─────────────────────
// Ce que le patron règle dans /admin-shop → « Réception & paiement », et que la
// boutique lit pour le formulaire de commande, la confirmation, les messages et
// les documents : magasins de retrait, virement (RIB), camionnette, carte.
//
// Document Firestore : shop_catalogue_settings/reception (lecture publique,
// écriture admin — mêmes règles que le reste de shop_catalogue_settings). Rien
// de secret ici : un RIB se donne au client pour qu'il paie.
//
// Pur : testé avec les outils de livraison (scripts/test-livraison-boutique.ts).

import type { LieuRetrait } from './shop-types';

export const CHEMIN_REGLAGES_RECEPTION = { collection: 'shop_catalogue_settings', document: 'reception' } as const;

export interface LieuDeRetrait {
  nom: string;
  adresse: string;
  /** Lien Google Maps envoyé au client. */
  lienMaps: string;
  telephone: string;
  horaires: string;
  /** Proposé au client (un magasin fermé temporairement se désactive ici). */
  actif: boolean;
}

export interface ReglagesReception {
  lieux: Record<LieuRetrait, LieuDeRetrait>;
  virement: { actif: boolean; titulaire: string; banque: string; rib: string };
  camionnette: {
    actif: boolean;
    /** Prix à Casablanca et en périphérie (Mohammedia, Bouskoura, Dar Bouazza, Médiouna…), en DH. */
    prixCasablanca: number;
    prixPeripherie: number;
    /** Jours de tournée, en clair : « mardi et jeudi ». */
    jours: string;
  };
  /** Paiement par carte en ligne : seulement quand un prestataire (Attijari Payment, Payzone…) est branché. */
  carte: { actif: boolean };
  majLe?: string;
}

/**
 * CHRIFA, où l'on retire les rouleaux : le magasin du Boulevard Haïfa (confirmé par le
 * patron le 29/09/2026 ; ce n'est PAS l'entrepôt d'Aïn Chock des documents /stock).
 */
const ADRESSE_CHRIFA = 'Boulevard Haïfa, Casablanca';
const MAPS_CHRIFA = 'https://maps.google.com/?cid=2046553088855253995';

/**
 * Valeurs de départ, en mots du client (pas de « stock » ni de code Google : le code
 * H9RR+MP ne sert qu'au ramassage Sendit, ajouté par la route de ramassage). CHRIFA
 * = l'entrepôt de la rue 65 (adresse des documents LEBTEX), et non le magasin du
 * boulevard Haïfa : à faire confirmer par le patron, puis enregistrer dans
 * « Réception & paiement », qui prime toujours sur ces valeurs.
 */
export const REGLAGES_RECEPTION_DEFAUT: ReglagesReception = {
  lieux: {
    derb_omar: {
      nom: 'LEBTEX Derb Omar',
      adresse: 'Derb Omar, Casablanca',
      lienMaps: 'https://www.google.com/maps?q=33.591740,-7.607993',
      telephone: '+212 760 998 347',
      horaires: 'Lundi au samedi, 8h30 – 18h30',
      actif: true,
    },
    chrifa: {
      nom: 'LEBTEX CHRIFA',
      adresse: ADRESSE_CHRIFA,
      lienMaps: MAPS_CHRIFA,
      telephone: '+212 760 998 347',
      horaires: 'Lundi au samedi, 8h30 – 18h30',
      actif: true,
    },
  },
  virement: { actif: false, titulaire: '', banque: '', rib: '' },
  camionnette: { actif: true, prixCasablanca: 50, prixPeripherie: 80, jours: 'mardi et jeudi' },
  carte: { actif: false },
};

const texte = (v: unknown, defaut: string, max = 300) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : defaut;
const nombre = (v: unknown, defaut: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : defaut;
const booleen = (v: unknown, defaut: boolean) => (typeof v === 'boolean' ? v : defaut);

/** RIB marocain : 24 chiffres (espaces tolérés). */
export function ribValide(rib: string): boolean {
  return /^\d{24}$/.test(String(rib ?? '').replace(/\s/g, ''));
}

/** « 123 456 78901234567890123 45 » : le RIB découpé comme sur un relevé (banque, ville, compte, clé). */
export function ribLisible(rib: string): string {
  const c = String(rib ?? '').replace(/\s/g, '');
  return /^\d{24}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 22)} ${c.slice(22)}` : c;
}

/**
 * Réglages lus dans Firestore, remis d'aplomb : chaque champ absent ou illisible prend
 * sa valeur par défaut. Le virement n'est proposé que si le RIB est complet et valable.
 */
export function lireReglagesReception(brut: unknown): ReglagesReception {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, any>;
  const d = REGLAGES_RECEPTION_DEFAUT;
  const lieu = (cle: LieuRetrait): LieuDeRetrait => {
    const l = b.lieux?.[cle] ?? {};
    const def = d.lieux[cle];
    return {
      nom: texte(l.nom, def.nom, 80),
      adresse: texte(l.adresse, def.adresse),
      lienMaps: texte(l.lienMaps, def.lienMaps, 500),
      telephone: texte(l.telephone, def.telephone, 40),
      horaires: texte(l.horaires, def.horaires, 120),
      actif: booleen(l.actif, def.actif),
    };
  };
  const v = b.virement ?? {};
  const virement = {
    titulaire: texte(v.titulaire, '', 120),
    banque: texte(v.banque, '', 120),
    rib: texte(v.rib, '', 40).replace(/\s/g, ''),
    actif: false,
  };
  virement.actif = booleen(v.actif, false) && !!virement.titulaire && ribValide(virement.rib);
  const c = b.camionnette ?? {};
  return {
    lieux: { derb_omar: lieu('derb_omar'), chrifa: lieu('chrifa') },
    virement,
    camionnette: {
      actif: booleen(c.actif, d.camionnette.actif),
      prixCasablanca: nombre(c.prixCasablanca, d.camionnette.prixCasablanca),
      prixPeripherie: nombre(c.prixPeripherie, d.camionnette.prixPeripherie),
      jours: texte(c.jours, d.camionnette.jours, 80),
    },
    carte: { actif: booleen(b.carte?.actif, false) },
    majLe: typeof b.majLe === 'string' ? b.majLe : undefined,
  };
}
