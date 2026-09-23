// ─── Lignes logistiques : c'est la ligne qui porte les spécifications ─────────
// Une ligne (Fabric, Zipper, Thread…) définit les « Spécifications Qualités à
// donner » de TOUS ses pôles : un pôle ne choisit pas ses spécifications, il
// les reçoit de sa ligne. Changer un pôle de ligne lui donne celles de la
// nouvelle ; changer les spécifications d'une ligne les change pour tous ses
// pôles. Les catégories suivent leur pôle.
//
// Le pôle garde une COPIE (`specType`) : c'est elle que lisent les formulaires
// de commande, /stock et les PDF, sans avoir à connaître les lignes. Ce fichier
// dit ce que cette copie doit valoir.
//
// Les lignes sont enregistrées dans le document de l'administrateur
// (`users/{uid}.lignesLogistiques`) : { [nom]: { specType } }. Une ligne connue
// seulement par ses pôles, ou une ligne de base jamais enregistrée, reçoit une
// spécification déduite — à confirmer.
//
// Pur : aucun Firestore ici — testé par scripts/test-lignes-logistiques.ts.

import type { GeneralCategory } from './types';

export type SpecType = NonNullable<GeneralCategory['specType']>;

export const SPEC_TYPES: SpecType[] = ['fabric', 'zipper', 'thread', 'slider', 'tape', 'accessory', 'none'];

export const LIBELLE_SPEC: Record<SpecType, { emoji: string; label: string; detail: string }> = {
  fabric:    { emoji: '🧵', label: 'Fabric',     detail: 'GSM, largeur, longueur du rouleau' },
  zipper:    { emoji: '⚡', label: 'Zipper',     detail: 'Longueur, type, curseur, pcs/bag' },
  thread:    { emoji: '🪡', label: 'Thread',     detail: 'Cône, poids du fil, longueur' },
  slider:    { emoji: '🎛️', label: 'Slider',     detail: 'Photo, taille, poids, pcs/bag' },
  tape:      { emoji: '🎗️', label: 'Ruban',      detail: 'Largeur, poids/m, rouleau' },
  accessory: { emoji: '🧷', label: 'Accessoire', detail: 'Taille, épaisseur, pcs/box' },
  none:      { emoji: '▫️', label: 'Aucune',     detail: 'Pas de fiche qualité' },
};

/** Lignes toujours proposées, avec leur couleur. */
export const COULEUR_LIGNE: Record<string, string> = {
  'Fabric':           '#8B5CF6',
  'Slider et puller': '#3B82F6',
  'Zipper':           '#F59E0B',
  'Thread':           '#0D9488',
  'Ruban':            '#EC4899',
  'Bouton':           '#10B981',
  'Accessoire':       '#E11D48',
  'Accessoires':      '#E11D48',
  'Reste':            '#6B7280',
};

const COULEURS_LIBRES = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899', '#0D9488'];

export function couleurDeLigne(nom: string): string {
  return COULEUR_LIGNE[nom] || COULEURS_LIBRES[(nom || '').length % COULEURS_LIBRES.length];
}

/** Deux écritures d'une même ligne (« Zipper », « zipper ») sont la même ligne. */
export function cleLigne(nom?: string | null): string {
  return (nom || '').trim().toLowerCase();
}

/**
 * Spécification proposée pour une ligne jamais enregistrée, d'après son nom.
 * Mêmes mots-clés que le formulaire de pôle historique — « Ruban » donne enfin
 * `tape` (il donnait « aucune »).
 */
export function specParDefautDeLigne(nom?: string | null): SpecType {
  const l = cleLigne(nom);
  if (!l) return 'none';
  if (l.includes('slider') || l.includes('puller') || l.includes('curseur')) return 'slider';
  if (l.includes('zipper') || l.includes('fermeture')) return 'zipper';
  if (l.includes('ruban') || l.includes('tape')) return 'tape';
  if (l.includes('accessoire') || l.includes('accessory') || l.includes('bouton') || l.includes('button')
    || l.includes('fourniture') || l.includes('mercerie')) return 'accessory';
  if (l.includes('fabric') || l.includes('tissu')) return 'fabric';
  if (l === 'thread' || l.includes('thread') || /\bfils?\b/.test(l)) return 'thread';
  return 'none';
}

export type LignesEnregistrees = Record<string, { specType?: SpecType } | undefined>;

export type LigneLogistique = {
  nom: string;
  specType: SpecType;
  /** D'où vient la spécification : enregistrée par l'admin, ou déduite. */
  source: 'enregistree' | 'poles' | 'defaut';
  couleur: string;
  /** Identifiants des pôles de la ligne. */
  poles: string[];
  /** Pôles dont la copie `specType` ne correspond pas à la ligne. */
  polesAHarmoniser: string[];
};

type PoleMinimal = Pick<GeneralCategory, 'id' | 'line' | 'specType'>;

/**
 * Toutes les lignes connues — de base, enregistrées, ou portées par un pôle —
 * avec la spécification que chacune impose.
 */
export function listerLignes(
  enregistrees: LignesEnregistrees | null | undefined,
  poles: PoleMinimal[],
): LigneLogistique[] {
  const noms = new Map<string, string>(); // clé → nom affiché (première écriture rencontrée)
  const ajouter = (nom?: string | null) => {
    const cle = cleLigne(nom);
    if (cle && !noms.has(cle)) noms.set(cle, (nom || '').trim());
  };
  Object.keys(COULEUR_LIGNE).forEach(ajouter);
  Object.keys(enregistrees || {}).forEach(ajouter);
  poles.forEach(p => ajouter(p.line));

  const enregistreeDe = (cle: string) => {
    for (const [nom, def] of Object.entries(enregistrees || {})) {
      if (cleLigne(nom) === cle && def?.specType && SPEC_TYPES.includes(def.specType)) return def.specType;
    }
    return undefined;
  };

  return Array.from(noms.entries()).map(([cle, nom]) => {
    const siens = poles.filter(p => cleLigne(p.line) === cle);
    let specType = enregistreeDe(cle);
    let source: LigneLogistique['source'] = 'enregistree';
    if (!specType) {
      // Une ligne dont tous les pôles s'accordent garde leur choix ; sinon, le nom tranche.
      const explicites = Array.from(new Set(siens.map(p => p.specType).filter(s => s && s !== 'none'))) as SpecType[];
      if (explicites.length === 1) {
        specType = explicites[0];
        source = 'poles';
      } else {
        specType = specParDefautDeLigne(nom);
        source = 'defaut';
      }
    }
    return {
      nom,
      specType,
      source,
      couleur: couleurDeLigne(nom),
      poles: siens.map(p => p.id),
      polesAHarmoniser: siens.filter(p => (p.specType || 'none') !== specType).map(p => p.id),
    };
  });
}

/** La ligne de ce nom, s'il y en a une. */
export function trouverLigne(lignes: LigneLogistique[], nom?: string | null): LigneLogistique | undefined {
  const cle = cleLigne(nom);
  return cle ? lignes.find(l => cleLigne(l.nom) === cle) : undefined;
}

/**
 * Spécification que doit recevoir un pôle de cette ligne. Une ligne inconnue
 * (nom tapé à la main, pas encore enregistrée) prend la déduction par le nom.
 */
export function specPourLigne(lignes: LigneLogistique[], nom?: string | null): SpecType {
  return trouverLigne(lignes, nom)?.specType ?? specParDefautDeLigne(nom);
}
