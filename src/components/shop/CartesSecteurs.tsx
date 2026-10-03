'use client';

// ─── Cartes des secteurs d'activité (lib/secteurs-boutique) ─────────────────
// - MosaiqueSecteur : 2 × 2 photos de produits du secteur (aucune image à fournir)
// - CarteSecteur : la grande carte de la page /shop/secteurs
// - CarteSecteurCompacte : la petite carte des rangées (accueil, autres secteurs)
// - RangeeSecteurs : une rangée de petites cartes qui défile sur téléphone

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Briefcase } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import {
  compteArticles,
  lienSecteur,
  lienSecteurs,
  photosSecteur,
  adressePhotoSecteur,
  photoDuSite,
  secteursVisibles,
  type SecteurRempli,
} from '@/lib/secteurs-boutique';

// ─── Mosaïque 2 × 2 ─────────────────────────────────────────────────────────
// Images décoratives (alt vide) : le nom du secteur est écrit sur la carte.
export function MosaiqueSecteur({
  photos,
  sizes,
  className = '',
}: {
  photos: string[];
  sizes: string;
  className?: string;
}) {
  const cases = [0, 1, 2, 3].map(i => photos[i]);
  return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 aspect-square bg-[#E8E4DF] overflow-hidden ${className}`}>
      {cases.map((src, i) =>
        src ? (
          <div key={i} className="relative bg-gray-50 overflow-hidden">
            <Image
              src={src}
              alt=""
              fill
              sizes={sizes}
              quality={60}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : (
          <div key={i} className="bg-[#F3EFE8]" />
        )
      )}
    </div>
  );
}

// ─── Photo du métier (carte) ───────────────────────────────────────────────
// Image décorative (alt vide) : le nom du secteur est écrit sur la carte. Photo du site :
// optimisée par Next ; photo Unsplash : servie par son CDN à la bonne taille.
function PhotoCarte({ secteur, largeur, className = '' }: { secteur: SecteurRempli['secteur']; largeur: number; className?: string }) {
  if (!secteur.photo) return null;
  return (
    <div className={`relative aspect-square overflow-hidden bg-[#E8E4DF] ${className}`}>
      <Image
        src={adressePhotoSecteur(secteur.photo, largeur, largeur)}
        alt=""
        fill
        unoptimized={!photoDuSite(secteur.photo)}
        sizes={`${largeur / 2}px`}
        quality={70}
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}

// ─── Grande carte (page des secteurs) ───────────────────────────────────────
export function CarteSecteur({ rempli }: { rempli: SecteurRempli }) {
  const { language } = useLanguage();
  const { secteur, produits } = rempli;
  const photos = useMemo(() => photosSecteur(rempli), [rempli]);
  return (
    <Link
      href={lienSecteur(secteur, language)}
      className="group flex flex-col h-full overflow-hidden rounded-2xl bg-white border border-[#E8E4DF] hover:shadow-lg transition-shadow touch-manipulation"
    >
      {secteur.photo ? <PhotoCarte secteur={secteur} largeur={480} /> : <MosaiqueSecteur photos={photos} sizes="(max-width: 1024px) 25vw, 190px" />}
      <div className="flex flex-col flex-1 p-3 sm:p-4">
        <h2
          className="font-bold text-[#0F0F0F] text-sm sm:text-lg leading-snug group-hover:text-[#C8102E] transition-colors"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {secteur.nom[language]}
        </h2>
        <p className="mt-1 text-[11px] sm:text-sm text-gray-500 leading-snug line-clamp-3 sm:line-clamp-none flex-1">
          {secteur.accroche[language]}
        </p>
        <div className="mt-2.5 pt-2 border-t border-[#F0ECE8] flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs font-semibold text-gray-600">{compteArticles(produits.length, language)}</span>
          <span className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] flex items-center justify-center flex-shrink-0">
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Petite carte (rangées) ─────────────────────────────────────────────────
export function CarteSecteurCompacte({ rempli }: { rempli: SecteurRempli }) {
  const { language } = useLanguage();
  const { secteur, produits } = rempli;
  const photos = useMemo(() => photosSecteur(rempli), [rempli]);
  return (
    <Link
      href={lienSecteur(secteur, language)}
      className="group flex flex-col h-full overflow-hidden rounded-xl bg-white border border-[#E8E4DF] hover:border-[#C8102E] transition-colors touch-manipulation"
    >
      {secteur.photo ? <PhotoCarte secteur={secteur} largeur={240} /> : <MosaiqueSecteur photos={photos} sizes="(max-width: 1024px) 72px, 100px" />}
      <div className="px-2 py-2 flex flex-col flex-1">
        <p className="text-xs font-bold text-[#0F0F0F] leading-tight line-clamp-2 group-hover:text-[#C8102E] transition-colors">
          {secteur.nom[language]}
        </p>
        <p className="mt-auto pt-1 text-[10px] text-gray-500">{compteArticles(produits.length, language)}</p>
      </div>
    </Link>
  );
}

// ─── Rangée de petites cartes ───────────────────────────────────────────────
// Accueil (juste après les rayons) et bas d'une page secteur (`sauf` : le secteur ouvert).
// Défile sur téléphone ; sur ordinateur, toutes les cartes sur une ligne.
export function RangeeSecteurs({ sauf, titre }: { sauf?: string; titre?: string }) {
  const { t, language } = useLanguage();
  const { products, categories } = useShopProducts();
  const secteurs = useMemo(
    () => secteursVisibles(products, categories).filter(s => s.secteur.slug !== sauf),
    [products, categories, sauf]
  );
  if (secteurs.length === 0) return null;

  return (
    <section className="pt-6 px-4 sm:px-6 lg:px-12">
      <div className="container mx-auto">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Briefcase className="w-5 h-5 text-[#C8102E] flex-shrink-0" />
            <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {titre ?? t('secteurs_par_secteur')}
            </h2>
          </div>
          <Link
            href={lienSecteurs(language)}
            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#C8102E] touch-manipulation"
          >
            {t('secteurs_tous')} <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-6 lg:overflow-visible">
          {secteurs.map(s => (
            <div key={s.secteur.slug} className="w-[34%] min-w-[120px] max-w-[160px] flex-shrink-0 snap-start lg:w-auto lg:min-w-0 lg:max-w-none">
              <CarteSecteurCompacte rempli={s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
