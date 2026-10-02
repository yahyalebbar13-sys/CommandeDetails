'use client';

// « Du même rayon » : jusqu'à 8 produits proches du produit affiché, en vrais liens
// (Google les suit et ils sont dans le HTML envoyé par le serveur : le catalogue du
// contexte est déjà là au premier rendu). D'abord le rayon du produit, puis ses
// sous-rayons, les rayons voisins, le rayon parent et les rayons de la même famille.
// Jamais le produit lui-même ni un produit masqué (le contexte les a déjà retirés).
// Sans prix : « Prix sur demande ». Pas de prix barré.

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, ImageOff } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { optimisable } from '@/components/shop/GaleriePhotos';
import { formatPrice } from '@/lib/shop-utils';
import { nomProduit } from '@/lib/shop-textes';
import { PRIX_SUR_DEMANDE, prixProduitAffiche, sansPrix } from '@/lib/shop-variantes';
import type { ShopCategory, ShopProduct } from '@/lib/shop-types';

const MAX_PRODUITS = 8;

const dansLeRayon = (p: ShopProduct, slug: string) =>
  p.categorySlug === slug || !!p.additionalCategorySlugs?.includes(slug) || !!p.categoryAliases?.some(a => a.slug === slug);

// Mots d'un texte (nom de rayon ou de produit), sans accents et au singulier :
// « fermetures-metal » → fermeture, metal (mots courts et numéros comme « n-5 » ou « 50cm » exclus)
const MOTS_VIDES = new Set(['pour', 'avec', 'sans']);
const motsDe = (texte: string) =>
  new Set(
    texte
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(m => m.length >= 4 && !/\d/.test(m) && !MOTS_VIDES.has(m))
      .map(m => m.replace(/[sx]$/, '')),
  );

// Produits proches, dans un ordre stable (le même au serveur et au navigateur).
// Beaucoup de rayons n'ont qu'un ou deux produits : après le rayon, ses sous-rayons, ses
// voisins et son parent viennent les rayons de la même famille (« fermetures-metal » → les
// autres rayons de fermetures), ceux qui ont le plus de mots en commun d'abord. La famille,
// ce sont les mots du rayon que le nom du produit reprend ; un produit d'un rayon de la
// famille n'est repris que si son nom les reprend aussi (un tissu rangé par erreur chez
// les fermetures ne s'affiche pas sur la fiche d'une fermeture, et inversement).
export function produitsDuMemeRayon(product: ShopProduct, products: ShopProduct[], categories: ShopCategory[], max = MAX_PRODUITS): ShopProduct[] {
  const slug = product.categorySlug;
  const parent = categories.find(c => c.slug === slug)?.parentSlug;
  const proches = [
    slug,
    ...categories.filter(c => c.parentSlug === slug).map(c => c.slug),
    ...(parent ? categories.filter(c => c.parentSlug === parent && c.slug !== slug).map(c => c.slug) : []),
    ...(parent ? [parent] : []),
  ];
  const nom = motsDe(product.name || '');
  const famille = new Set(Array.from(motsDe(`${slug} ${parent || ''}`)).filter(m => nom.has(m)));
  const enCommun = (texte: string) => Array.from(motsDe(texte)).filter(m => famille.has(m)).length;
  const rayonsFamille = categories
    .map((c, ordre) => ({ slug: c.slug, communs: enCommun(c.slug), ordre }))
    .filter(c => c.communs > 0 && !proches.includes(c.slug))
    .sort((a, b) => b.communs - a.communs || a.ordre - b.ordre)
    .map(c => c.slug);

  const vus = new Set([product.id]);
  const choisis: ShopProduct[] = [];
  const ajouter = (rayon: string, garder: (p: ShopProduct) => boolean) => {
    const groupe = products.filter(p => !vus.has(p.id) && dansLeRayon(p, rayon) && garder(p));
    groupe.forEach(p => vus.add(p.id));
    // Dans chaque rayon, ceux qui ont un prix d'abord (l'ordre du catalogue est gardé)
    choisis.push(...groupe.filter(p => !sansPrix(p)), ...groupe.filter(p => sansPrix(p)));
  };
  for (const rayon of proches) ajouter(rayon, () => true);
  for (const rayon of rayonsFamille) {
    if (choisis.length >= max) break;
    ajouter(rayon, p => enCommun(p.name || '') > 0);
  }
  return choisis.slice(0, max);
}

export default function MemeRayon({ produits, lienRayon }: { produits: ShopProduct[]; lienRayon: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  if (produits.length === 0) return null;

  return (
    <section aria-labelledby="meme-rayon" className="mt-14 pt-8 border-t border-neutral-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id="meme-rayon" className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {ar ? 'من نفس القسم' : 'Du même rayon'}
        </h2>
        <Link
          href={lienRayon}
          className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-bold text-[#C8102E] hover:underline"
        >
          {ar ? 'كل القسم' : 'Tout le rayon'}
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {produits.map(p => {
          const nom = nomProduit(p, language);
          const prix = prixProduitAffiche(p);
          const photo = p.images?.[0];
          return (
            <li key={p.id}>
              <Link
                href={`/shop/produit/${p.id}`}
                prefetch={false}
                className="group block h-full rounded-2xl border border-[#E8E4DF] bg-white overflow-hidden hover:border-neutral-400"
              >
                <span className="relative block aspect-square bg-[#FBF8F3]">
                  {photo ? (
                    <Image
                      src={photo}
                      alt={nom}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      unoptimized={!optimisable(photo)}
                      className="object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-neutral-300">
                      <ImageOff className="size-8" />
                    </span>
                  )}
                </span>
                <span className="block p-2.5">
                  <span className="block text-sm font-semibold text-[#0F0F0F] leading-snug line-clamp-2 min-h-[2.5rem]" dir="auto">
                    {nom}
                  </span>
                  <span className="mt-1 block text-sm font-black text-[#C8102E]">
                    {prix.montant > 0 ? (
                      <>
                        {prix.aPartirDe && <span className="font-semibold text-neutral-600">{ar ? 'ابتداءً من ' : 'À partir de '}</span>}
                        <bdi dir="ltr">{formatPrice(prix.montant)}</bdi>
                      </>
                    ) : (
                      PRIX_SUR_DEMANDE[language]
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
