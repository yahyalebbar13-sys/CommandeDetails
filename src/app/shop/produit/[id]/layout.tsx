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

// Fiche produit : la page elle-même est un composant client. Ce layout serveur lui donne
// son étiquette pour Google et l'aperçu WhatsApp (nom, prix, photo), et une vraie 404
// quand l'identifiant n'existe ni dans le catalogue figé ni dans Firestore.
// En cas de doute (Firestore injoignable), la page s'affiche normalement.
// Il ajoute les données structurées pour Google : le produit et son prix (seulement s'il a
// un prix) et le chemin « Accueil › Rayon › Produit ». Rien pour un produit masqué.
// Compteur anonyme « fiche vue » (lib/compteurs-boutique) : seulement quand le produit est
// trouvé, jamais pour une adresse en 404 ni quand Firestore n'a pas répondu.
// Adresse lisible (lib/liens-boutique) : une ancienne adresse (identifiant brut) ou un nom
// périmé redirige (308) vers /shop/produit/<nom>-<jeton> ; seul le jeton désigne le produit.
// La recherche de l'adresse (?ref=…, ?utm_source=…) suit, si un middleware la recopie
// dans l'en-tête ENTETE_RECHERCHE (lib/liens-boutique).
// La version arabe (src/app/ar/shop/produit/[id]/layout.tsx) fait la même chose sous /ar.

type Params = { params: Promise<{ id: string }> };

// Étiquettes (lib/catalogue-serveur), avec l'adresse arabe de la fiche (hreflang)
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesProduit((await params).id, 'fr');
}

export default async function ProduitLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { id: parametre } = await params;
  const id = idDepuisParametre(parametre);
  const trouve = await produitDeLaPage(id);
  if (trouve.etat === 'absent') notFound();
  // Pas l'adresse lisible du produit : redirection permanente vers elle
  if (trouve.etat !== 'inconnu' && decoderParametre(parametre) !== parametreProduit(trouve.produit)) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienProduit(trouve.produit) + recherche);
  }

  const visible = trouve.etat === 'catalogue' || (trouve.etat === 'firestore' && !trouve.masque);
  const rayons = catalogueFige().rayons;
  const donnees = visible
    ? [donneesProduit(trouve.produit, rayons), filArianeProduit(trouve.produit, rayons)].filter(d => d !== null)
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
