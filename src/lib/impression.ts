import { messageSiVersionPerimee } from './version-perimee';

/**
 * Imprimer un document du logiciel, sans dépendre d'une fenêtre pop-up.
 *
 * Toutes les impressions du magasin faisaient la même chose : `window.open`, `document.write`,
 * puis `print()` dans la foulée. Trois façons de bloquer, et le magasin les a toutes rencontrées :
 *
 * - le navigateur refuse la fenêtre (bloqueur de pop-ups, ou clic parti d'une promesse qui a
 *   perdu le geste de l'utilisateur) et le code repartait en silence : rien ne s'ouvrait, rien ne
 *   le disait ;
 * - `print()` partait avant que le logo distant soit chargé : la boîte d'impression s'ouvrait sur
 *   un document sans en-tête, ou sur une page blanche ;
 * - une fenêtre déjà ouverte gardait le focus et la suivante s'écrivait derrière.
 *
 * Ici, le document s'écrit dans une iframe cachée de la page courante : aucun bloqueur ne s'y
 * oppose, on attend les images, puis on imprime. La fenêtre pop-up ne sert plus que de secours, et
 * si elle est refusée, l'appelant reçoit une erreur qu'il peut montrer.
 */

/** L'erreur levée quand le navigateur a refusé la fenêtre de secours. */
export const POPUP_BLOQUEE = 'POPUP_BLOQUEE';

/** Le message à afficher à l'utilisateur pour une impression qui n'a pas pu s'ouvrir. */
export function messageImpression(e: any): string {
  // Une nouvelle version mise en ligne pendant que la page etait ouverte : la fabrique de PDF
  // n'existe plus sous ce nom. Ce n'est pas une panne, c'est une page perimee — on le dit, et
  // on recharge.
  const perimee = messageSiVersionPerimee(e);
  if (perimee) return perimee;

  return e?.message === POPUP_BLOQUEE
    ? "Le navigateur n'a pas ouvert la fenêtre d'impression. Autorisez les pop-ups pour ce site, puis réessayez — "
      + "et si le bouton reste sans effet, rechargez la page."
    : (e?.message || "L'aperçu n'a pas pu s'ouvrir. Réessayez.");
}

/**
 * Attend que les images du document soient chargées — sans jamais dépasser `maxMs` : un logo
 * introuvable ne doit pas empêcher d'imprimer une facture.
 */
function attendreImages(doc: Document | null | undefined, maxMs = 4000): Promise<void> {
  return new Promise(resolve => {
    let fini = false;
    const terminer = () => { if (!fini) { fini = true; resolve(); } };
    setTimeout(terminer, maxMs);
    try {
      const images = Array.from(doc?.images || []).filter(img => !img.complete);
      if (images.length === 0) { terminer(); return; }
      let restantes = images.length;
      const une = () => { restantes -= 1; if (restantes <= 0) terminer(); };
      for (const img of images) {
        img.addEventListener('load', une, { once: true });
        img.addEventListener('error', une, { once: true });
      }
    } catch (_) {
      terminer();
    }
  });
}

/** Le secours : une vraie fenêtre, pour les navigateurs qui refusent d'imprimer une iframe. */
async function imprimerParFenetre(html: string): Promise<void> {
  const fenetre = window.open('', '_blank');
  if (!fenetre) throw new Error(POPUP_BLOQUEE);
  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
  await attendreImages(fenetre.document);
  fenetre.focus();
  fenetre.print();
}

/**
 * Écrit `html` dans une iframe cachée et ouvre la boîte d'impression du navigateur.
 *
 * À appeler directement depuis le clic — surtout pas après un `await` : certains navigateurs
 * n'autorisent l'impression que tant que le geste de l'utilisateur est « frais ».
 */
export async function imprimerHtml(html: string): Promise<void> {
  if (typeof document === 'undefined') throw new Error("Impression impossible hors d'un navigateur.");

  const cadre = document.createElement('iframe');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.setAttribute('tabindex', '-1');
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(cadre);

  // L'iframe ne se retire pas tout de suite : sur certains navigateurs la boîte d'impression est
  // asynchrone, et retirer le document avant qu'elle s'ouvre annule l'impression. On attend donc
  // le signal de fin d'impression, avec un délai en simple filet de sécurité — une boîte laissée
  // ouverte une heure ne doit pas empêcher le document de partir quand l'utilisateur y revient.
  const retirerPlusTard = () => {
    let retire = false;
    const retirer = () => { if (!retire) { retire = true; try { cadre.remove(); } catch (_) {} } };
    try { cadre.contentWindow?.addEventListener('afterprint', retirer, { once: true }); } catch (_) {}
    setTimeout(retirer, 300000);
  };

  try {
    const doc = cadre.contentDocument;
    const fenetre = cadre.contentWindow;
    if (!doc || !fenetre) throw new Error('iframe');
    doc.open();
    doc.write(html);
    doc.close();
    await attendreImages(doc);
    fenetre.focus();
    fenetre.print();
    retirerPlusTard();
  } catch (_) {
    try { cadre.remove(); } catch (__) {}
    // L'iframe a échoué : on retombe sur la fenêtre, et si elle est refusée l'appelant le saura.
    await imprimerParFenetre(html);
  }
}

/**
 * Le texte d'une donnee, rendu inoffensif dans un document HTML.
 *
 * Un nom de produit qui contient « < » ou « & » cassait le balisage : la boite d'impression
 * s'ouvrait sur un document tronque, ou blanc. Comme cela depend de la donnee, le magasin le
 * voyait « de fois » — sur cette facture-la, jamais sur les autres.
 */
export function echapperHtml(valeur: unknown): string {
  return String(valeur ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ));
}
