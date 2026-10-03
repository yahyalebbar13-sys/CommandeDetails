import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  catalogueFige, donneesProduit, etiquettesProduit, filArianeProduit, jsonLd, produitDeLaPage,
} from '@/lib/catalogue-serveur';
import {
  decoderParametre, ENTETE_RECHERCHE, idDepuisParametre, lienProduit, parametreProduit, rechercheAGarder,
} from '@/lib/liens-boutique';
import { CompteVueProduit } from '@/components/shop/CompteurEvenements';

// Fiche produit en arabe : le même travail que le layout français
// (src/app/shop/produit/[id]/layout.tsx, à garder pareil), à l'adresse /ar/shop/produit/… :
// étiquettes et données Google en arabe (nom, description, adresse /ar), vraie 404 pour un
// produit inconnu ou sans prix, redirection 308 d'une ancienne adresse ou d'un nom périmé
// vers l'adresse lisible arabe. Firestore injoignable : la page s'affiche normalement.

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesProduit((await params).id, 'ar');
}

export default async function ProduitLayoutArabe({ children, params }: Params & { children: React.ReactNode }) {
  const { id: parametre } = await params;
  const id = idDepuisParametre(parametre);
  const trouve = await produitDeLaPage(id);
  if (trouve.etat === 'absent') notFound();
  if (trouve.etat !== 'inconnu' && decoderParametre(parametre) !== parametreProduit(trouve.produit)) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienProduit(trouve.produit, 'ar') + recherche);
  }

  const visible = trouve.etat === 'catalogue' || (trouve.etat === 'firestore' && !trouve.masque);
  const rayons = catalogueFige().rayons;
  const donnees = visible
    ? [donneesProduit(trouve.produit, rayons, 'ar'), filArianeProduit(trouve.produit, rayons, 'ar')].filter(d => d !== null)
    : [];

  return (
    <>
      {donnees.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      {trouve.etat !== 'inconnu' && <CompteVueProduit id={id} />}
      {children}
    </>
  );
}
