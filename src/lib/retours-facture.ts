/**
 * Les retours sur facture : ce qui a déjà été rendu, ligne par ligne.
 *
 * Depuis que chaque bon finit en facture, le retour sur facture est le seul moyen de rendre de
 * la marchandise après la finalisation. Rien n'empêchait de rendre deux fois la même ligne : la
 * quantité rendue n'était plafonnée que par la quantité vendue, sans déduire les retours déjà
 * faits — deux retours de 10 m sur une facture de 10 m faisaient rentrer 20 m.
 *
 * Le déjà-rendu se lit dans les mouvements eux-mêmes (entrées RETOUR portant l'identifiant de
 * la facture) : rien de plus à écrire, et les retours faits avant cette règle comptent aussi.
 *
 * Pur : vérifié par `npx tsx scripts/test-bon-sans-prix.ts`.
 */

const ACCENTS = /[̀-ͯ]/g;
const norm = (v: unknown): string => String(v ?? '').normalize('NFD').replace(ACCENTS, '').trim().toLowerCase();
const arrondi3 = (n: unknown) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Le mouvement de retour concerne-t-il cette ligne ? Même article, même couleur et taille ; la qualité si les deux la portent. */
function memeMarchandise(m: any, ligne: any): boolean {
  if (m?.articleId !== ligne?.articleId) return false;
  // Les étagères et la réserve sont deux stocks : un retour aux étagères ne solde pas une ligne
  // vendue depuis la réserve, ni l'inverse (src/lib/etageres.ts).
  if (Boolean(m?.etagere) !== Boolean(ligne?.etagere)) return false;
  if (norm(m?.color) !== norm(ligne?.color)) return false;
  if (norm(m?.size) !== norm(ligne?.size)) return false;
  if (norm(m?.quality) && norm(ligne?.quality) && norm(m.quality) !== norm(ligne.quality)) return false;
  return true;
}

/** Les entrées « retour client » déjà écrites pour cette facture. */
export const retoursDeLaFacture = (mouvements: any[], factureId: string): any[] =>
  (mouvements || []).filter(m => m?.factureId === factureId && m?.type === 'IN' && m?.reason === 'RETOUR');

/**
 * Ce qui a déjà été rendu sur chaque ligne de la facture (même ordre que `items`). Deux lignes de
 * la même marchandise se remplissent dans l'ordre, la première d'abord.
 */
export function dejaRenduParLigne(items: any[], mouvements: any[], factureId: string): number[] {
  const rendu = (items || []).map(() => 0);
  for (const m of retoursDeLaFacture(mouvements, factureId)) {
    let reste = Number(m.quantity) || 0;
    const candidates = (items || []).map((l, i) => i).filter(i => memeMarchandise(m, items[i]));
    for (const i of candidates) {
      if (reste <= 0) break;
      const place = Math.max(0, (Number(items[i]?.qty) || 0) - rendu[i]);
      const pris = Math.min(place, reste);
      rendu[i] = arrondi3(rendu[i] + pris);
      reste = arrondi3(reste - pris);
    }
    // Plus rendu que vendu (ancienne erreur) : le surplus reste sur la dernière ligne concernée.
    if (reste > 0 && candidates.length > 0) {
      const dernier = candidates[candidates.length - 1];
      rendu[dernier] = arrondi3(rendu[dernier] + reste);
    }
  }
  return rendu;
}

/** Ce qu'on peut encore rendre sur chaque ligne : vendu moins déjà rendu, jamais négatif. */
export function encoreRetournable(items: any[], mouvements: any[], factureId: string): number[] {
  const rendu = dejaRenduParLigne(items, mouvements, factureId);
  return (items || []).map((l, i) => Math.max(0, arrondi3((Number(l?.qty) || 0) - rendu[i])));
}

/**
 * Le contrôle à l'écriture : les lignes rendues maintenant, ajoutées à ce qui est déjà rentré,
 * dépassent-elles ce qui a été vendu ? Comparé par marchandise (article, couleur, taille), toutes
 * lignes de la facture confondues. Renvoie la phrase à afficher, ou null si tout va bien.
 */
export function depassementRetour(items: any[], mouvements: any[], factureId: string, lignesRendues: any[]): string | null {
  const dejaRentre = retoursDeLaFacture(mouvements, factureId);
  for (const l of lignesRendues || []) {
    const vendu = (items || []).filter(i => memeMarchandise(l, i)).reduce((s, i) => s + (Number(i?.qty) || 0), 0);
    const deja = dejaRentre.filter(m => memeMarchandise(m, l)).reduce((s, m) => s + (Number(m?.quantity) || 0), 0);
    const maintenant = (lignesRendues || []).filter(x => memeMarchandise(x, l)).reduce((s, x) => s + (Number(x?.qty) || 0), 0);
    if (arrondi3(deja + maintenant) > arrondi3(vendu) + 0.0005) {
      const quoi = [l?.nameFR || l?.productName, l?.color, l?.size].filter(Boolean).join(' ');
      const reste = Math.max(0, arrondi3(vendu - deja));
      return `${quoi} : ${arrondi3(vendu)} vendu(s), ${arrondi3(deja)} déjà rendu(s) — on ne peut plus en rendre que ${reste}.`;
    }
  }
  return null;
}
