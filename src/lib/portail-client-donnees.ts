// ─── Ce qu'un client a le droit de voir ───────────────────────────────────────
// Jusqu'ici, l'espace client lisait TOUTE la base de l'administrateur (tous
// les articles de tous les clients, avec prix d'achat et fournisseurs) et
// filtrait à l'écran : n'importe quel client pouvait tout lire avec les outils
// du navigateur. Désormais le serveur choisit les commandes du client et n'en
// renvoie qu'une liste blanche de champs. Tout champ absent d'ici ne sort pas.
//
// Pur : testé par scripts/test-portail-client.ts.

import { computeEffectiveStatus } from './status-utils';
import { getArticleDisplayName } from './product-name-utils';
import { dossierVerrouille } from './suivi-conteneur';

/** Nom de client comparable : minuscules, sans accents ni ponctuation. */
export function normaliserNomClient(nom: unknown): string {
  return String(nom ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Les noms sous lesquels ce client passe commande, normalisés (vides écartés). */
function nomsDuClient(client: string, alias: readonly string[] = []): Set<string> {
  return new Set([client, ...alias].map(normaliserNomClient).filter(Boolean));
}

/**
 * Cette commande est-elle à ce client ? Même nom exactement, une fois casse,
 * accents et ponctuation mis de côté — ou l'un des autres noms (`alias`) que
 * l'administrateur a inscrits pour lui dans clientAccess. Jamais « l'un
 * contient l'autre » : « ATELIER ECLAIR » ne voit pas « ATELIER ECLAIR NORD »,
 * qui est peut-être un autre client.
 */
export function commandeDuClient(clientDeLaCommande: unknown, client: string, alias: readonly string[] = []): boolean {
  const a = normaliserNomClient(clientDeLaCommande);
  return Boolean(a) && nomsDuClient(client, alias).has(a);
}

const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const nombre = (v: unknown) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : undefined);

/** Retire les clés vides (réponse JSON plus légère, et rien d'indéfini). */
function propre<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as T;
}

export type CommandeClient = {
  id: string;
  statut: string;
  nom: string;
  reference?: string;
  famille?: string;
  photo?: string;
  quantite: number;
  unite?: string;
  commandeeLe?: string;
  couleur?: string;
  taille?: string;
  caracteristiques?: string;
  qualite?: string;
  fermeture?: string;
  couleurs?: { code: string; quantite: number }[];
  tailles?: { taille: string; quantite: number }[];
  qualites?: { qualite: string; quantite: number }[];
  prixConvenuMad?: number;
  conteneurId?: string;
  arriveeLe?: string;
  entrepotLe?: string;
};

export type ConteneurClient = {
  id: string;
  connaissement?: string;
  compagnie?: string;
  embarqueLe?: string;
  arriveeLe?: string;
  /** Première date d'arrivée annoncée par la compagnie (suivi.etaInitiale) — mesure du retard. */
  arriveeInitiale?: string;
  entrepotLe?: string;
  suivi?: {
    statut?: string;
    navire?: string;
    portDepart?: string;
    portArrivee?: string;
    avancement?: number;
    lienCarte?: string;
    majLe?: string;
    etapes?: { code: string; libelle: string; reel: boolean; date: string; lieu?: string; navire?: string }[];
  };
};

/** Une commande, réduite à ce que le client peut voir. */
export function assainirCommande(a: any, facture: any, categories: any[], poles: any[]): CommandeClient {
  const fusion = { ...a, arrivalDate: facture?.arrivalDate || null, stockEntryDate: facture?.stockEntryDate || null };
  const { frenchName, originalName, hasDifferentFrenchName } = getArticleDisplayName(fusion, categories, poles);
  const categorie = categories.find(c => c.id === a.categoryId || (c.name && String(c.name).toLowerCase() === String(a.categoryId || '').toLowerCase()));
  const liste = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : []) as any[];
  return propre({
    id: String(a.id),
    statut: computeEffectiveStatus(fusion),
    nom: frenchName,
    reference: hasDifferentFrenchName ? originalName : undefined,
    famille: texte(categorie?.nameFR) || texte(categorie?.name),
    photo: texte(a.imageUrl) || texte(a.designImageUrl) || texte(categorie?.imageUrl),
    quantite: nombre(a.quantity) ?? 0,
    unite: texte(a.unitOfMeasure),
    commandeeLe: texte(a.orderDate),
    couleur: texte(a.color) && String(a.color).toLowerCase() !== 'various' ? texte(a.color) : undefined,
    taille: texte(a.size) && String(a.size).toLowerCase() !== 'various' ? texte(a.size) : undefined,
    caracteristiques: texte(a.specs),
    qualite: texte(a.quality),
    fermeture: texte(a.zipperType) ? [texte(a.zipperType), texte(a.slider) && `curseur ${a.slider}`].filter(Boolean).join(' · ') : undefined,
    couleurs: liste(a.colorBreakdown).map(r => ({ code: String(r?.colorCode || r?.color || '').trim(), quantite: nombre(r?.rolls ?? r?.quantity) ?? 0 })).filter(r => r.code),
    tailles: liste(a.sizeBreakdown).map(r => ({ taille: String(r?.size || '').trim(), quantite: nombre(r?.quantity ?? r?.rolls) ?? 0 })).filter(r => r.taille),
    qualites: liste(a.qualityBreakdown).map(r => ({ qualite: String(r?.nameFR || r?.quality || '').trim(), quantite: nombre(r?.quantity) ?? 0 })).filter(r => r.qualite),
    // Le prix de VENTE convenu avec le client, seulement une fois le devis confirmé.
    prixConvenuMad: a.devisConfirmed ? nombre(a.devisPrixVenteUniteMad) : undefined,
    conteneurId: facture ? String(facture.id) : undefined,
    arriveeLe: texte(facture?.arrivalDate),
    entrepotLe: texte(facture?.stockEntryDate),
  });
}

/** Un conteneur (dossier d'arrivage), réduit à ce que le client peut voir. */
export function assainirConteneur(f: any): ConteneurClient {
  const s = f?.suivi;
  // Un dossier entré en stock n'a plus de suivi, côté client comme côté admin.
  const suivi = s?.shipmentId && !dossierVerrouille(f) ? propre({
    statut: texte(s.statut),
    navire: texte(s.navire),
    portDepart: texte(s.portChargement),
    portArrivee: texte(s.portDechargement),
    avancement: nombre(s.avancement),
    lienCarte: texte(s.lienCarte),
    majLe: texte(s.majLe),
    etapes: (Array.isArray(s.etapes) ? s.etapes : []).map((e: any) => propre({
      code: String(e?.code || ''), libelle: String(e?.libelle || ''), reel: Boolean(e?.reel),
      date: String(e?.date || ''), lieu: texte(e?.lieu), navire: texte(e?.navire),
    })).filter((e: any) => e.code && e.date),
  }) : undefined;
  return propre({
    id: String(f.id),
    connaissement: texte(f.noBL),
    compagnie: texte(f.shippingLine),
    embarqueLe: texte(f.shippingDate),
    arriveeLe: texte(f.arrivalDate),
    // Première date annoncée par la COMPAGNIE (cf. suivi-sync.ts) — jamais une
    // date tapée à la main au bureau, qui n'a rien d'un engagement.
    arriveeInitiale: texte(s?.etaInitiale),
    entrepotLe: texte(f.stockEntryDate),
    suivi,
  });
}

/** Tout ce que l'espace client reçoit : ses commandes et leurs conteneurs, rien d'autre. */
export function construirePortail(entree: {
  client: string;
  /** Autres noms du même client (clientAccess.aliases). */
  alias?: readonly string[];
  articles: any[];
  factures: any[];
  categories: any[];
  poles: any[];
}): { commandes: CommandeClient[]; conteneurs: Record<string, ConteneurClient> } {
  const noms = nomsDuClient(entree.client, entree.alias);
  const siennes = entree.articles.filter(a => {
    const nom = normaliserNomClient(a?.clientName);
    return Boolean(nom) && noms.has(nom);
  });
  const facturesParId = new Map(entree.factures.map(f => [String(f.id), f]));
  const conteneurs: Record<string, ConteneurClient> = {};
  const commandes = siennes.map(a => {
    const f = a.factureId ? facturesParId.get(String(a.factureId)) : undefined;
    if (f && !conteneurs[String(f.id)]) conteneurs[String(f.id)] = assainirConteneur(f);
    return assainirCommande(a, f, entree.categories, entree.poles);
  });
  return { commandes, conteneurs };
}
