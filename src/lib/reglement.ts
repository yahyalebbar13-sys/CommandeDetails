/**
 * Règle unique de l'imputation d'un règlement client et du statut d'une facture.
 *
 * Avant ce fichier, trois écrans décidaient chacun de leur côté : la caisse marquait une facture
 * réglée par chèque « PENDING », l'écran Clients la marquait « PAID » (le client sortait de
 * l'encours sans qu'un dirham soit encaissé), et l'écran Factures faisait un troisième choix. Pire,
 * deux lignes de règlement sur la même facture (espèces + chèque) partaient chacune du solde
 * d'AVANT et s'écrasaient l'une l'autre dans le même lot : seule la dernière comptait, et la
 * différence restait réclamée au client.
 *
 * Tout passe désormais par ces fonctions : les montants s'agrègent par facture avant d'écrire, et
 * le statut se déduit toujours du même triplet (total, payé, effet en attente).
 */

export type LigneImputation = { invoiceId: string; amount: number };

/** Ce qui se règle sur un bout de papier : encaissé plus tard, et qui peut revenir impayé. */
const EFFETS = new Set(['CHEQUE', 'EFFET', 'LC', 'LCN', 'TRAITE']);

export function estEffet(methode: unknown): boolean {
  return EFFETS.has(String(methode ?? '').trim().toUpperCase());
}

/** Arrondi au centime : les montants circulent en flottant et 0,1 + 0,2 ne vaut pas 0,3. */
export function centimes(montant: unknown): number {
  return Math.round((Number(montant) || 0) * 100) / 100;
}

/** Deux montants en dirhams sont égaux si moins d'un demi-centime les sépare. */
export function memeMontant(a: unknown, b: unknown): boolean {
  return Math.abs(centimes(a) - centimes(b)) < 0.005;
}

/**
 * L'effet est-il encore en l'air ? Un chèque remis mais pas encaissé laisse la facture « en
 * attente » : elle n'est pas payée tant que la banque n'a pas crédité. Un effet rejeté ne
 * l'est plus non plus — il redevient une créance, traitée par le chemin de rejet.
 */
export function effetEnAttente(paiement: any): boolean {
  if (!estEffet(paiement?.method)) return false;
  const statut = String(paiement?.status ?? 'PENDING').trim().toUpperCase();
  return statut !== 'CLEARED' && statut !== 'REJECTED';
}

/**
 * Les factures qu'un paiement solde, et pour quel montant. Un règlement global peut couvrir
 * plusieurs factures (allocations) ; les paiements anciens n'en ont qu'une seule.
 */
export function imputationsDuPaiement(paiement: any): LigneImputation[] {
  const allocations = Array.isArray(paiement?.allocations) ? paiement.allocations : null;
  if (allocations && allocations.length > 0) {
    return allocations
      .map((a: any) => ({ invoiceId: String(a?.invoiceId || ''), amount: centimes(a?.amount) }))
      .filter((a: LigneImputation) => a.invoiceId && a.amount > 0);
  }
  const invoiceId = String(paiement?.invoiceId || '');
  const amount = centimes(paiement?.amount);
  return invoiceId && amount > 0 ? [{ invoiceId, amount }] : [];
}

/**
 * Répartit un montant sur des factures, la plus ancienne d'abord, sans jamais dépasser le solde de
 * chacune. Le reliquat (un client qui paie plus qu'il ne doit) n'est imputé nulle part : il reste
 * un acompte, il ne va pas gonfler artificiellement la dernière facture.
 */
export function repartirSurFactures(
  montant: unknown,
  factures: { id: string; reste: number }[]
): LigneImputation[] {
  let restant = centimes(montant);
  const lignes: LigneImputation[] = [];
  for (const f of factures) {
    if (restant <= 0.005) break;
    const part = centimes(Math.min(restant, Number(f.reste) || 0));
    if (part <= 0.005) continue;
    lignes.push({ invoiceId: f.id, amount: part });
    restant = centimes(restant - part);
  }
  return lignes;
}

export type StatutFacture = 'UNPAID' | 'PARTIAL' | 'PAID' | 'PENDING';

/**
 * Le statut d'une facture, décidé à un seul endroit.
 * - soldée et tout est encaissé            → PAID
 * - soldée mais un effet court encore      → PENDING (l'argent n'est pas en banque)
 * - partiellement réglée                   → PARTIAL, ou PENDING si un effet court
 * - rien de reçu                           → UNPAID
 */
export function statutFacture(total: unknown, paye: unknown, effetEnCours: boolean): StatutFacture {
  const reste = centimes(centimes(total) - centimes(paye));
  if (reste <= 0.005) return effetEnCours ? 'PENDING' : 'PAID';
  if (centimes(paye) > 0.005) return effetEnCours ? 'PENDING' : 'PARTIAL';
  return 'UNPAID';
}

/** Solde restant dû d'une facture, borné à [0, total]. */
export function resteADevoir(facture: any): number {
  const total = centimes(facture?.totalAfterDiscount);
  const paye = centimes(facture?.paidAmount);
  return Math.max(0, centimes(total - paye));
}

/**
 * Agrège plusieurs lignes de règlement par facture. C'est ce qui manquait : chaque ligne écrivait
 * sa propre mise à jour sur le même document, la dernière écrasant les précédentes.
 */
export function agregerParFacture(paiements: any[]): Map<string, { montant: number; effetEnCours: boolean }> {
  const parFacture = new Map<string, { montant: number; effetEnCours: boolean }>();
  for (const paiement of paiements || []) {
    const enAttente = effetEnAttente(paiement);
    for (const ligne of imputationsDuPaiement(paiement)) {
      const acc = parFacture.get(ligne.invoiceId) || { montant: 0, effetEnCours: false };
      acc.montant = centimes(acc.montant + ligne.amount);
      acc.effetEnCours = acc.effetEnCours || enAttente;
      parFacture.set(ligne.invoiceId, acc);
    }
  }
  return parFacture;
}
