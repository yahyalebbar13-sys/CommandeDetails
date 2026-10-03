import type { Metadata } from 'next';
import { donneesSecteurs, etiquettesSecteurs, filArianeSecteurs, jsonLd } from '@/lib/catalogue-serveur';

// Liste des secteurs d'activité (la page est un composant client) : son étiquette pour
// Google, sa version arabe (hreflang), et ses données structurées : la liste des secteurs
// et le chemin « Accueil › Secteurs ».
// Dans le groupe (liste) : ce layout ne s'applique pas aux pages des secteurs
// (/shop/secteurs/[slug]), qui ont les leurs.
// La version arabe (src/app/ar/shop/secteurs/(liste)/layout.tsx) fait la même chose sous /ar.
export const metadata: Metadata = etiquettesSecteurs('fr');

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {[donneesSecteurs('fr'), filArianeSecteurs('fr')].map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      {children}
    </>
  );
}
