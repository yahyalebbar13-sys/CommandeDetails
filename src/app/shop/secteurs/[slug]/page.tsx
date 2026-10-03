'use client';

// ─── Page d'un secteur d'activité ───────────────────────────────────────────
// Bandeau (photos du secteur assombries, nom, accroche), présentation (premier paragraphe
// visible, la suite derrière « Lire la suite » : tout le texte reste dans la page pour
// Google), une section par famille d'articles avec les cartes produit habituelles, puis la
// demande de devis sur WhatsApp et les autres secteurs.
// Le layout serveur répond 404 pour un secteur inconnu ou sans assez de produits, et
// redirige une adresse écrite autrement : ici, le secteur existe toujours.

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, LayoutGrid, MessageCircle, Package } from 'lucide-react';
import ProductCard from '@/components/shop/ProductCard';
import { RangeeSecteurs } from '@/components/shop/CartesSecteurs';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { lienPage } from '@/lib/liens-boutique';
import {
  compteArticles,
  lienSecteurs,
  photosSecteur,
  adressePhotoSecteur,
  creditPhotoSecteur,
  photoDuSite,
  secteurDepuisParametre,
  secteursVisibles,
} from '@/lib/secteurs-boutique';
import { getWhatsAppContact } from '@/lib/shop-utils';

export default function SecteurPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const { t, language } = useLanguage();
  const isAr = language === 'ar';
  const { products, categories } = useShopProducts();
  const [ouvert, setOuvert] = useState(false);
  const idSuite = useId();

  // Même règle que le layout serveur (lib/secteurs-boutique), sur le même catalogue
  const rempli = useMemo(() => {
    const secteur = secteurDepuisParametre(slug);
    if (!secteur) return null;
    return secteursVisibles(products, categories).find(s => s.secteur.slug === secteur.slug) ?? null;
  }, [slug, products, categories]);
  const photos = useMemo(() => (rempli ? photosSecteur(rempli) : []), [rempli]);

  if (!rempli) return null;
  const { secteur, familles, produits } = rempli;
  const [premier, ...suite] = secteur.presentation[language];

  return (
    <div className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ═══ Bandeau : photos du secteur en fond assombri ═══ */}
      <section className="relative overflow-hidden bg-[#0F0F0F]">
        {secteur.photo ? (
          <Image
            src={adressePhotoSecteur(secteur.photo, 1600, 700)}
            alt=""
            fill
            unoptimized={!photoDuSite(secteur.photo)}
            sizes="100vw"
            quality={70}
            priority
            className="object-cover"
          />
        ) : (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 sm:grid-cols-4 sm:grid-rows-1" aria-hidden="true">
          {photos.map((src, i) => (
            <div key={src} className="relative">
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                quality={50}
                priority={i < 2}
                className="object-cover"
              />
            </div>
          ))}
        </div>
        )}
        <div className="absolute inset-0 bg-[#0F0F0F]/65" />
        {secteur.photo && creditPhotoSecteur(secteur.photo) && (
          <p className="absolute bottom-1.5 end-2 z-10 text-[9px] text-white/55">
            {isAr ? 'صورة: ' : 'Photo : '}
            <a href={creditPhotoSecteur(secteur.photo)!.lienAuteur} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              {secteur.photo.auteur}
            </a>
            {' / '}
            <a href={creditPhotoSecteur(secteur.photo)!.lienUnsplash} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              Unsplash
            </a>
          </p>
        )}

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
          {/* « › » est un signe miroir : le navigateur l'affiche « ‹ » en arabe */}
          <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60 mb-3">
            <Link href={lienPage('/shop', language)} className="hover:text-white transition-colors">
              {isAr ? 'الرئيسية' : 'Accueil'}
            </Link>
            <span>›</span>
            <Link href={lienSecteurs(language)} className="hover:text-white transition-colors">
              {t('secteurs_titre')}
            </Link>
            <span>›</span>
            <span className="text-white/90">{secteur.nom[language]}</span>
          </nav>
          <h1 className="text-[26px] sm:text-4xl lg:text-5xl font-black text-white leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {secteur.nom[language]}
          </h1>
          <p className="mt-2 max-w-2xl text-white/85 text-sm sm:text-lg leading-snug">{secteur.accroche[language]}</p>
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#D4A843]">
            <Package className="w-3.5 h-3.5" />
            <span>{compteArticles(produits.length, language)}</span>
            <span className="text-white/40">·</span>
            <span className="text-white/75 font-normal">
              {isAr ? 'التوصيل لجميع مدن المغرب' : 'Livraison partout au Maroc'}
            </span>
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* ═══ Présentation : premier paragraphe, puis « Lire la suite » ═══ */}
        <section className="pt-6 sm:pt-8">
          <div className="max-w-3xl text-sm sm:text-base text-gray-700 leading-relaxed space-y-3">
            <p>{premier}</p>
            {suite.length > 0 && (
              <div id={idSuite} hidden={!ouvert} className="space-y-3">
                {suite.map((paragraphe, i) => (
                  <p key={i}>{paragraphe}</p>
                ))}
              </div>
            )}
          </div>
          {suite.length > 0 && (
            <button
              type="button"
              onClick={() => setOuvert(v => !v)}
              aria-expanded={ouvert}
              aria-controls={idSuite}
              className="mt-2 inline-flex items-center gap-1 min-h-[44px] text-sm font-bold text-[#C8102E] touch-manipulation"
            >
              {ouvert ? t('secteurs_lire_moins') : t('secteurs_lire_suite')}
              <ChevronDown className={`w-4 h-4 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
            </button>
          )}
        </section>

        {/* ═══ Familles : raccourcis (défilent sur téléphone) ═══ */}
        {familles.length > 1 && (
          <nav className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1">
            {familles.map(({ famille, produits: siens }) => (
              <a
                key={famille.cle}
                href={`#${famille.cle}`}
                className="flex-shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-white border border-[#E8E4DF] text-xs sm:text-sm font-semibold text-[#1A1A1A] hover:border-[#C8102E] hover:text-[#C8102E] transition-colors touch-manipulation"
              >
                {famille.nom[language]}
                <span className="px-1.5 py-0.5 rounded-full bg-[#F3EFE8] text-[10px] font-black text-gray-600">{siens.length}</span>
              </a>
            ))}
          </nav>
        )}

        {/* ═══ Une section par famille ═══ */}
        {familles.map(({ famille, produits: siens }) => (
          <section key={famille.cle} id={famille.cle} className="scroll-mt-40 pt-7 sm:pt-9">
            <div className="flex items-end justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <LayoutGrid className="w-5 h-5 text-[#C8102E] flex-shrink-0" />
                <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {famille.nom[language]}
                </h2>
              </div>
              <span className="flex-shrink-0 text-xs text-gray-500">{compteArticles(siens.length, language)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
              {siens.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))}

        {/* ═══ Commande pour votre atelier : devis sur WhatsApp ═══ */}
        {/* Pas de remise annoncée : un devis, demandé sur WhatsApp */}
        <section className="pt-9">
          <div
            className="rounded-2xl overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-5 sm:px-6"
            style={{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)' }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#D4A843]/15 flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-[#D4A843]" />
              </div>
              <div>
                <h2 className="text-white font-black text-base sm:text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {t('secteurs_commande_atelier')}
                </h2>
                <p className="text-gray-300 text-xs sm:text-sm mt-0.5">
                  {isAr
                    ? 'أرسل لائحتك (السلع والكميات) على واتساب، ونرد عليك بعرض سعر. الاستلام مجاني في الدار البيضاء.'
                    : 'Envoyez votre liste (articles et quantités) sur WhatsApp : nous vous répondons avec un devis. Retrait gratuit à Casablanca.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:items-end flex-shrink-0">
              <a
                href={getWhatsAppContact(secteur.devis[language])}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5a] text-white font-bold text-sm touch-manipulation"
              >
                <MessageCircle className="w-4 h-4" />
                {t('secteurs_devis')}
              </a>
              <Link
                href={lienSecteurs(language)}
                className="inline-flex items-center justify-center min-h-[40px] px-2 text-xs font-semibold text-[#D4A843] hover:text-white transition-colors touch-manipulation"
              >
                {t('secteurs_autres')}
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ Les autres secteurs ═══ */}
      <div className="pb-8">
        <RangeeSecteurs sauf={secteur.slug} titre={isAr ? 'قطاعات أخرى' : 'Autres secteurs'} />
      </div>
    </div>
  );
}
