// ─── Les étapes d'une commande, telles que le client les voit ─────────────────
// Le statut interne (TO_ORDER, PI, SHIPPED, TRANSIT, CUSTOMS, STOCK, DELIVERED)
// ne doit jamais s'afficher tel quel côté client — une notification disait
// « Le statut est passé à : PI ». Ici, chaque statut devient une étape du
// parcours, dite en français clair, dans l'ordre où la commande les traverse.
//
// Pur : testé par scripts/test-statut-client.ts.

export type EtapeClient = 'enregistree' | 'fabrication' | 'mer' | 'douane' | 'prete' | 'livree';

export const ETAPES_CLIENT: { id: EtapeClient; court: string; titre: string; phrase: string }[] = [
  { id: 'enregistree', court: 'Enregistrée', titre: 'Commande enregistrée', phrase: 'Votre commande est enregistrée ; elle sera bientôt lancée en fabrication.' },
  { id: 'fabrication', court: 'Fabrication', titre: 'En fabrication', phrase: "Votre commande est en cours de fabrication chez notre fournisseur." },
  { id: 'mer', court: 'En mer', titre: 'En mer', phrase: 'Votre marchandise est à bord, en route vers le Maroc.' },
  { id: 'douane', court: 'Douane', titre: 'Arrivée au port — dédouanement', phrase: 'Le conteneur est arrivé au port ; le dédouanement est en cours.' },
  { id: 'prete', court: 'Prête', titre: 'Prête à livrer', phrase: 'Votre marchandise est dans notre entrepôt, prête à être livrée ou retirée.' },
  { id: 'livree', court: 'Livrée', titre: 'Livrée', phrase: 'Votre commande vous a été livrée.' },
];

/** Étape du parcours pour un statut (interne ou calculé d'après les dates). */
export function etapeClient(statut?: string | null): EtapeClient {
  switch ((statut || '').toUpperCase()) {
    case 'PI': return 'fabrication';
    case 'SHIPPED':
    case 'TRANSIT': return 'mer';
    case 'CUSTOMS': return 'douane';
    case 'STOCK': return 'prete';
    case 'DELIVERED': return 'livree';
    default: return 'enregistree';
  }
}

/** Rang de l'étape dans le parcours (0 = enregistrée … 5 = livrée). */
export function rangEtape(etape: EtapeClient): number {
  return ETAPES_CLIENT.findIndex(e => e.id === etape);
}

export function titreEtape(statut?: string | null): string {
  return ETAPES_CLIENT[rangEtape(etapeClient(statut))].titre;
}

export function phraseEtape(statut?: string | null): string {
  return ETAPES_CLIENT[rangEtape(etapeClient(statut))].phrase;
}

/** Date lisible en français (10/08/2026) ; rien si la date est absente ou illisible. */
export function dateFr(iso?: string | null): string {
  if (!iso) return '';
  const jour = String(iso).slice(0, 10);
  const [a, m, j] = jour.split('-');
  if (a && m && j && /^\d{4}$/.test(a)) return `${j}/${m}/${a}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
}

/** Nombre à la française : 1 000 ; 2,5. */
export function nombreFr(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '0';
}
