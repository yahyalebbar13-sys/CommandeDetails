// ─── L'onglet et la fiche ouverte, gardés dans l'adresse de l'espace équipe ──
//   /staff                    → Commandes
//   /staff?commande=ID        → Commandes, fiche de la commande ID ouverte
//   /staff?onglet=demandes    → Demandes clients
//   /staff?onglet=cout-vente  → Coût de vente (lecture seule)
// Un rechargement garde l'écran, et un lien vers une commande ouvre sa fiche.
// Pur (ni React ni navigateur) : testable seul.

export type OngletEquipe = 'commandes' | 'demandes' | 'cout-vente';

export const TITRES_ONGLETS: Record<OngletEquipe, string> = {
  commandes: 'Commandes',
  demandes: 'Demandes clients',
  'cout-vente': 'Coût de vente',
};

/**
 * Repère posé sur l'entrée d'historique ajoutée à l'ouverture d'une fiche :
 * le bouton Retour du téléphone la retire (et ferme la fiche) au lieu de quitter l'espace.
 */
export const MARQUE_FICHE = 'lebtexFicheEquipe';

/** Lit l'adresse. Une commande demandée force l'onglet Commandes. */
export function lireAdresseEquipe(search: string): { onglet: OngletEquipe; commande: string | null } {
  const p = new URLSearchParams(search);
  const commande = p.get('commande')?.trim() || null;
  if (commande) return { onglet: 'commandes', commande };
  const onglet = p.get('onglet')?.trim().toLowerCase();
  return { onglet: onglet === 'demandes' || onglet === 'cout-vente' ? onglet : 'commandes', commande: null };
}

/** Adresse à jour (les autres paramètres et l'ancre sont gardés). Commandes, l'onglet par défaut, n'apparaît pas. */
export function adresseEquipe(href: string, onglet: OngletEquipe, commande: string | null): string {
  const url = new URL(href);
  if (onglet !== 'commandes') url.searchParams.set('onglet', onglet);
  else url.searchParams.delete('onglet');
  if (commande && onglet === 'commandes') url.searchParams.set('commande', commande);
  else url.searchParams.delete('commande');
  return `${url.pathname}${url.search}${url.hash}`;
}
