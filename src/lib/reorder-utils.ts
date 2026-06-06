/**
 * Logique de rappel de commande par catégorie.
 *
 * Principe :
 *  - La date de référence est le dernier `arrivalDate` d'un article de cette catégorie.
 *  - La catégorie a un champ `orderSchedule` (tableau de saisons) qui définit
 *    l'intervalle en jours entre deux commandes selon la période de l'année.
 *  - L'alerte est supprimée si des articles PI (commande en cours chez le fournisseur)
 *    existent déjà pour cette catégorie.
 */

export type OrderScheduleSeason = {
  /** Étiquette libre : "Été", "Hiver", "Ramadan", etc. */
  season: string;
  /**
   * Numéros des mois concernés (1 = jan … 12 = déc).
   * Si vide [] → saison de fallback (toute l'année sauf mois déjà couverts).
   */
  months: number[];
  /** Nombre de jours entre deux commandes pendant cette saison. */
  intervalDays: number;
};

export type ReorderAlert = {
  /** Nombre de jours restants avant de devoir commander (négatif = dépassé). */
  daysLeft: number;
  /** Date cible pour la prochaine commande. */
  nextOrderDate: string;
  /** Date du dernier arrivage pris comme référence. */
  lastArrivalDate: string;
  /** Saison active qui s'applique. */
  season: OrderScheduleSeason;
  /** Niveau d'alerte. */
  level: 'OVERDUE' | 'URGENT' | 'SOON' | 'OK';
};

/**
 * Calcule l'alerte de réapprovisionnement pour une catégorie.
 *
 * @param category  L'objet catégorie Firestore (doit avoir `orderSchedule`).
 * @param articles  Tous les articles de l'application.
 * @returns         Un objet `ReorderAlert` ou `null` si pas de configuration.
 */
export function computeReorderAlert(
  category: any,
  articles: any[]
): ReorderAlert | null {
  // 1. Vérifier que la catégorie a un planning de commande
  const schedule: OrderScheduleSeason[] = category?.orderSchedule;
  if (!Array.isArray(schedule) || schedule.length === 0) return null;

  // 2. Filtrer les articles de cette catégorie
  const catArticles = articles.filter(
    (a) => a.categoryId === category.name || a.categoryId === category.id
  );
  if (catArticles.length === 0) return null;

  // 3. Supprimer l'alerte si une commande PI est déjà en cours pour cette catégorie
  const hasPiInProgress = catArticles.some((a) => a.status === 'PI');
  if (hasPiInProgress) return null;

  // 4. Trouver la date du dernier arrivage (arrivalDate le plus récent, non vide)
  const arrivedArticles = catArticles
    .filter((a) => a.arrivalDate && typeof a.arrivalDate === 'string' && a.arrivalDate !== '')
    .sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));

  if (arrivedArticles.length === 0) return null;
  const lastArrivalDate = arrivedArticles[0].arrivalDate as string;

  // 5. Trouver la saison active (selon le mois courant)
  const currentMonth = new Date().getMonth() + 1; // 1-12
  let activeSeason =
    schedule.find((s) => s.months.includes(currentMonth)) ??
    schedule.find((s) => s.months.length === 0); // fallback

  if (!activeSeason) return null;

  // 6. Calculer la date de prochaine commande
  const lastArrival = new Date(lastArrivalDate);
  const nextOrderDate = new Date(lastArrival);
  nextOrderDate.setDate(nextOrderDate.getDate() + activeSeason.intervalDays);

  // 7. Calculer les jours restants
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  nextOrderDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.round(
    (nextOrderDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 8. Niveau d'alerte
  let level: ReorderAlert['level'];
  if (daysLeft <= 0) level = 'OVERDUE';
  else if (daysLeft <= 14) level = 'URGENT';
  else if (daysLeft <= 30) level = 'SOON';
  else level = 'OK';

  return {
    daysLeft,
    nextOrderDate: nextOrderDate.toISOString().split('T')[0],
    lastArrivalDate,
    season: activeSeason,
    level,
  };
}

/** Formatte le label du badge selon le niveau. */
export function formatReorderBadge(alert: ReorderAlert): string {
  if (alert.level === 'OVERDUE') {
    const overdue = Math.abs(alert.daysLeft);
    return `Commander maintenant ! (dépassé de ${overdue}j)`;
  }
  return `Commander dans ${alert.daysLeft}j`;
}
