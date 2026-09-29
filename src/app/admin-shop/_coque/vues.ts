// ─── Les écrans de l'admin boutique et leur place dans l'adresse ─────────────
// La vue et la commande ouverte vivent dans l'adresse (?vue=…&commande=…) :
// un rechargement garde l'écran, et le lien de l'e-mail « nouvelle commande »
// (/admin-shop?commande=ID) ouvre directement la fiche.

export type VueAdmin = 'commandes' | 'tableau' | 'produits' | 'categories' | 'clients' | 'catalogue' | 'reception' | 'equipe';

export const VUE_PAR_DEFAUT: VueAdmin = 'commandes';

export const TITRES_VUES: Record<VueAdmin, string> = {
  commandes: 'Commandes',
  tableau: 'Tableau de bord',
  produits: 'Produits',
  categories: 'Catégories',
  clients: 'Clients',
  catalogue: 'Catalogue',
  // Magasins de retrait, virement (RIB), camionnette, carte : réglé par le patron, lu par la boutique.
  reception: 'Réception & paiement',
  // Le compte partagé de l'équipe (/staff) : créé, modifié, désactivé par le patron seul.
  equipe: 'Accès équipe',
};

const VUES = Object.keys(TITRES_VUES) as VueAdmin[];

/** Anciennes adresses encore en favori (l'ancien identifiant anglais). */
const ALIAS: Record<string, VueAdmin> = { dashboard: 'tableau', 'tableau-de-bord': 'tableau', paiement: 'reception', livraison: 'reception' };

export function vueValide(v: string | null | undefined): VueAdmin | null {
  if (!v) return null;
  const propre = v.trim().toLowerCase();
  if ((VUES as string[]).includes(propre)) return propre as VueAdmin;
  return ALIAS[propre] ?? null;
}

/** Lit l'adresse au montage. Une commande demandée force l'écran Commandes. */
export function lireAdresse(search: string): { vue: VueAdmin; commande: string | null } {
  const p = new URLSearchParams(search);
  const commande = p.get('commande')?.trim() || null;
  if (commande) return { vue: 'commandes', commande };
  return { vue: vueValide(p.get('vue')) ?? VUE_PAR_DEFAUT, commande: null };
}

/** Adresse à jour (les autres paramètres et l'ancre sont gardés). */
export function adresseAvec(href: string, vue: VueAdmin, commande: string | null): string {
  const url = new URL(href);
  url.searchParams.set('vue', vue);
  if (commande && vue === 'commandes') url.searchParams.set('commande', commande);
  else url.searchParams.delete('commande');
  return `${url.pathname}${url.search}${url.hash}`;
}
