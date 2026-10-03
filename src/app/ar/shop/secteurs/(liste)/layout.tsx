import type { Metadata } from 'next';
import { donneesSecteurs, etiquettesSecteurs, filArianeSecteurs, jsonLd } from '@/lib/catalogue-serveur';

// Liste des secteurs en arabe : le même travail que le layout français
// (src/app/shop/secteurs/(liste)/layout.tsx, à garder pareil), à l'adresse /ar/shop/secteurs.
export const metadata: Metadata = etiquettesSecteurs('ar');

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {[donneesSecteurs('ar'), filArianeSecteurs('ar')].map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      {children}
    </>
  );
}
