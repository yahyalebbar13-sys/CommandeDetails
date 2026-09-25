// ─── Petits outils de l'espace client ─────────────────────────────────────────
// Les mots (quantités accordées, délais dits en jours), la recherche sans
// accents et le lien WhatsApp déjà rédigé, partagés par les écrans de l'espace
// client. Pur : rien ici ne touche au navigateur ni à la base.

import { libelleUnite } from '@/lib/unites-pole';
import { nombreFr } from '@/lib/statut-client';

// ─── Quantités ────────────────────────────────────────────────────────────────

/** Unités au singulier / au pluriel, comme on les dit à un client. */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'],
  'rolls': ['rouleau', 'rouleaux'],
  'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'],
  'bag': ['sac', 'sacs'],
  'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};

const UNITES_PIECES = ['', 'u', 'unité', 'unités', 'pc', 'pcs', 'pièce', 'pièces', 'piece', 'pieces'];

/** Le mot de l'unité, au singulier et au pluriel. */
export function motsUnite(unite?: string | null): [string, string] {
  const u = (unite || '').trim();
  const connue = UNITES_DITES[u] || UNITES_DITES[u.toLowerCase()];
  if (connue) return connue;
  if (UNITES_PIECES.includes(u.toLowerCase())) return ['pièce', 'pièces'];
  const libelle = libelleUnite(u).toLowerCase();
  return [libelle, libelle];
}

/** « 1 000 mètres », « 1 rouleau », « 1,5 mètre » : en français, le pluriel commence à 2. */
export function quantiteLisible(q: unknown, unite?: string | null): string {
  const n = Number(q) || 0;
  const [un, plusieurs] = motsUnite(unite);
  return `${nombreFr(n)} ${Math.abs(n) >= 2 ? plusieurs : un}`;
}

/** Le mot de l'unité seule, au singulier : « mètre », « rouleau », « pièce ». */
export const uniteSeule = (unite?: string | null) => motsUnite(unite)[0];

export const pluriel = (n: number, un: string, plusieurs: string) => (Math.abs(n) >= 2 ? plusieurs : un);

/** « 3 commandes », « 1 commande ». */
export const compte = (n: number, un: string, plusieurs: string) => `${nombreFr(n)} ${pluriel(n, un, plusieurs)}`;

// ─── Délais ───────────────────────────────────────────────────────────────────

/** « aujourd’hui », « demain », « dans 12 jours ». */
export function dansNJours(n: number): string {
  if (n <= 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  return `dans ${nombreFr(n)} jours`;
}

/** « 3 jours », « 1 jour ». */
export const jours = (n: number) => compte(Math.abs(n), 'jour', 'jours');

/** « à l’instant », « il y a 4 min », « il y a 2 h », « le 12/10/2026 ». */
export function depuis(iso: string | undefined, maintenant: number): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return undefined;
  const minutes = Math.floor(Math.max(0, maintenant - t) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `le ${new Date(t).toLocaleDateString('fr-FR')}`;
}

// ─── Recherche ────────────────────────────────────────────────────────────────

/** Texte comparable : minuscules, sans accents, espaces simples. */
export function sansAccents(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Les mots d'une recherche : chacun doit se retrouver dans la commande. */
export function motsDeRecherche(q: string): string[] {
  return sansAccents(q).split(' ').filter(Boolean);
}

// ─── Retrait ──────────────────────────────────────────────────────────────────

/** Un seul nom pour le retrait, partout dans l'espace client. */
export const RETRAIT = 'Retrait à notre entrepôt';

/** L'adresse où le client vient retirer sa marchandise. */
export const ADRESSE_ENTREPOT = '31 Rue 65, Lot. Al Hamd, Aïn Chock, Casablanca';

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/** Lien WhatsApp vers LEBTEX, message déjà écrit ; rien sans numéro. */
export function lienWhatsApp(numero: string | undefined, message: string): string | undefined {
  const chiffres = String(numero || '').replace(/\D/g, '');
  if (!chiffres) return undefined;
  return `https://wa.me/${chiffres}?text=${encodeURIComponent(message)}`;
}

/** Le premier message d'un client qui nous écrit depuis son espace. */
export function messageContact(clientName: string): string {
  const nom = (clientName || '').trim();
  return `Bonjour LEBTEX,\n${nom ? `Ici ${nom}. ` : ''}Je vous écris depuis mon espace client au sujet de mes commandes :\n\n`;
}
