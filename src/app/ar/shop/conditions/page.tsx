import type { Metadata } from 'next';
import { metadata as adresseFrancaise } from '@/app/shop/conditions/layout';
import PageConditions, { metadata as etiquettesFrancaises } from '@/app/shop/conditions/page';
import PageEnFrancais from '@/app/ar/PageEnFrancais';

// Page pas encore traduite (lib/liens-boutique) : son texte français dans la coque arabe.
// Pour Google, une seule adresse : la française (mêmes étiquettes, adresse canonique /shop).
export const metadata: Metadata = { ...etiquettesFrancaises, ...adresseFrancaise };

export default function Page() {
  return (
    <PageEnFrancais>
      <PageConditions />
    </PageEnFrancais>
  );
}
