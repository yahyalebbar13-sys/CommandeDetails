import type { Metadata } from 'next';
import { metadata as etiquettesFrancaises } from '@/app/shop/a-propos/layout';
import PageAPropos from '@/app/shop/a-propos/page';
import PageEnFrancais from '@/app/ar/PageEnFrancais';

// Page pas encore traduite (lib/liens-boutique) : son texte français dans la coque arabe.
// Pour Google, une seule adresse : la française (mêmes étiquettes, adresse canonique /shop).
export const metadata: Metadata = etiquettesFrancaises;

export default function Page() {
  return (
    <PageEnFrancais>
      <PageAPropos />
    </PageEnFrancais>
  );
}
