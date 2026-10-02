import { permanentRedirect } from 'next/navigation';

// Plus de page Promotions (décision du patron, 02/10/2026) : aucun prix barré ni
// pourcentage de réduction sur la boutique. Les anciens liens (Google, partages
// WhatsApp, favoris) mènent à la boutique, en redirection permanente (308).
export default function PromotionsPage() {
  permanentRedirect('/shop/boutique');
}
