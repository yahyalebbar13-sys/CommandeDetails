import type { Metadata } from 'next';
import { metadata as etiquettesFrancaises } from '@/app/shop/faq/layout';
import PageFaq from '@/app/shop/faq/page';
import PageEnFrancais from '@/app/ar/PageEnFrancais';

// Page pas encore traduite (lib/liens-boutique) : son texte français dans la coque arabe.
// Pour Google, une seule adresse : la française (mêmes étiquettes, adresse canonique /shop).
export const metadata: Metadata = etiquettesFrancaises;

export default function Page() {
  return (
    <PageEnFrancais>
      <PageFaq />
    </PageEnFrancais>
  );
}
