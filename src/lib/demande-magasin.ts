/**
 * Le parcours d'une demande d'import écrite par un magasin.
 *
 * Une demande n'est pas un objet à part : c'est un article ordinaire de la collection `articles`,
 * marqué `requestSource: 'STORE'` et laissé au statut `TO_ORDER` jusqu'à ce que le service import
 * le lance. Le statut ne dit donc RIEN de l'avancement côté magasin — et c'est le champ `status`
 * que tout le reste du logiciel lit (arrivages, coûts, portails). On n'y touche pas.
 *
 * Ce que ce module ajoute, c'est l'étape côté magasin, dans un champ à part :
 *
 *   1. `DRAFT`       — le magasin a écrit sa demande. Elle n'appartient qu'à lui : personne ne la
 *                      voit dans /gestion. C'est le moment où on l'imprime et où le commercial la
 *                      relit, stylo à la main.
 *   2. `COMMERCIAL`  — le magasin l'a envoyée. Elle apparaît alors dans /gestion, où le commercial
 *                      la confirme et où le service import décide du lancement.
 *
 * Avant, la demande partait à l'import à la seconde où le formulaire était validé : le commercial
 * découvrait des lignes que personne n'avait relues, et le magasin ne pouvait plus rien corriger.
 *
 * Une demande écrite avant cette règle ne porte aucune étape : elle compte comme déjà envoyée,
 * jamais comme un brouillon — sinon elle disparaîtrait de /gestion du jour au lendemain.
 */

export type EtapeDemandeMagasin = 'DRAFT' | 'COMMERCIAL';

/** Le champ porté par le document. */
export const CHAMP_ETAPE = 'requestStage';

/** Vrai pour un article qui est une demande écrite depuis un magasin. */
export function estDemandeMagasin(article: any): boolean {
  return Boolean(article) && article.requestSource === 'STORE';
}

/**
 * Vrai tant que le magasin n'a pas envoyé sa demande. C'est le seul filtre que /gestion applique :
 * un brouillon n'existe pas encore pour le service import.
 */
export function estBrouillonMagasin(article: any): boolean {
  return estDemandeMagasin(article) && article?.[CHAMP_ETAPE] === 'DRAFT';
}

/** L'étape d'une demande, en traitant l'absence d'étape comme « déjà envoyée ». */
export function etapeDemande(article: any): EtapeDemandeMagasin {
  return article?.[CHAMP_ETAPE] === 'DRAFT' ? 'DRAFT' : 'COMMERCIAL';
}

/** Ce qu'on écrit sur le document au moment où le magasin envoie sa demande. */
export function champsEnvoiAuCommercial(quand: unknown): Record<string, unknown> {
  return { [CHAMP_ETAPE]: 'COMMERCIAL', sentToCommercialAt: quand };
}
