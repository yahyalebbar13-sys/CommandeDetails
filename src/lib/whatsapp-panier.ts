// Commander tout le panier par WhatsApp : un message lisible par l'équipe, avec chaque
// article, sa variante, sa quantité et son prix, puis le total hors livraison.

import type { CartItem } from './shop-types';
import type { Language } from './translations';
import { formatPrice, getWhatsAppContact } from './shop-utils';
import { libelleLignePanier } from './shop-variantes';

export function lienWhatsAppPanier(
  items: CartItem[],
  prixUnitaire: (item: CartItem) => number,
  language: Language,
): string {
  const ar = language === 'ar';
  const lignes = items.map(item => {
    const nom = ar && item.productNameAr ? item.productNameAr : item.productName;
    const variante = libelleLignePanier(item.variant, language);
    const prix = prixUnitaire(item);
    const detailPrix = prix > 0 ? `${formatPrice(prix)}${ar ? ' للوحدة' : '/u'}` : ar ? 'الثمن حسب الطلب' : 'prix sur demande';
    return `- ${nom}${variante ? ` — ${variante}` : ''} × ${item.quantity} (${detailPrix})`;
  });
  const total = items.reduce((s, item) => s + prixUnitaire(item) * item.quantity, 0);
  const ligneTotal = total > 0
    ? ar ? `المجموع: ${formatPrice(total)} (بدون التوصيل)` : `Total : ${formatPrice(total)} (hors livraison)`
    : '';
  const message = ar
    ? ['السلام عليكم LEBTEX، أريد أن أطلب:', ...lignes, ligneTotal].filter(Boolean).join('\n')
    : ['Bonjour LEBTEX, je voudrais commander :', ...lignes, ligneTotal].filter(Boolean).join('\n');
  return getWhatsAppContact(message);
}
