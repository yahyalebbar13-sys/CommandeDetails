'use client';

// Photos de la fiche produit : la grande photo, les vignettes, et la photo en plein écran
// au toucher. En plein écran : pincer pour zoomer, toucher deux fois (ou double clic, ou
// molette) pour zoomer et dézoomer, glisser de côté pour la photo suivante, vers le bas
// pour fermer. Fermer : la croix, la touche Échap ou le bouton « retour » du téléphone.
// Sans bibliothèque : pointer events et transform CSS.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageOff, X, ZoomIn } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import type { Language } from '@/lib/translations';

const ZOOM_MAX = 4;
const ZOOM_DOUBLE_APPUI = 2.5;

const t = (language: Language, fr: string, ar: string) => (language === 'ar' ? ar : fr);

// Photos que next/image sait réduire (domaines de next.config.ts) ; les autres s'affichent telles quelles
export function optimisable(src: string): boolean {
  return src.startsWith('/') || /^https:\/\/(firebasestorage\.googleapis\.com|picsum\.photos|images\.unsplash\.com|placehold\.co)\//.test(src);
}

// ─── Une photo qu'on peut zoomer ────────────────────────────────────────────

type Geste =
  | { type: 'pince'; d0: number; s0: number; x0: number; y0: number; mx: number; my: number }
  | { type: 'glisse'; px: number; py: number; x0: number; y0: number; debut: number; bouge: boolean };

function PhotoZoom({
  src,
  alt,
  onSuivante,
  onPrecedente,
  onFermer,
}: {
  src: string;
  alt: string;
  onSuivante: () => void;
  onPrecedente: () => void;
  onFermer: () => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const calque = useRef<HTMLDivElement>(null);
  // Zoom et décalage courants : écrits directement dans le style, sans re-rendu à chaque mouvement
  const vue = useRef({ s: 1, x: 0, y: 0 });
  const doigts = useRef(new Map<number, { x: number; y: number }>());
  const geste = useRef<Geste | null>(null);
  const dernierAppui = useRef({ t: 0, x: 0, y: 0 });

  const mesure = () => {
    const r = cadre.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  };

  const appliquer = (anime: boolean, decalage = { x: 0, y: 0 }) => {
    const el = calque.current;
    if (!el) return;
    const { s, x, y } = vue.current;
    el.style.transition = anime ? 'transform 200ms ease-out' : 'none';
    el.style.transform = `translate3d(${x + decalage.x}px, ${y + decalage.y}px, 0) scale(${s})`;
  };

  // La photo zoomée ne sort pas du cadre
  const borner = () => {
    const { w, h } = mesure();
    const v = vue.current;
    v.s = Math.min(ZOOM_MAX, Math.max(1, v.s));
    if (v.s < 1.02) Object.assign(v, { s: 1, x: 0, y: 0 });
    const mx = (w * (v.s - 1)) / 2;
    const my = (h * (v.s - 1)) / 2;
    v.x = Math.min(mx, Math.max(-mx, v.x));
    v.y = Math.min(my, Math.max(-my, v.y));
  };

  // Zoomer en gardant sous le doigt (px, py) le même point de la photo
  const zoomerVers = (s: number, px: number, py: number) => {
    const { cx, cy } = mesure();
    const v = vue.current;
    const fx = px - cx;
    const fy = py - cy;
    v.x = fx - ((fx - v.x) * s) / v.s;
    v.y = fy - ((fy - v.y) * s) / v.s;
    v.s = s;
  };

  // Un doigt pose ou lève : le geste repart de l'état actuel
  const demarrer = () => {
    const pts = Array.from(doigts.current.values());
    const v = vue.current;
    if (pts.length >= 2) {
      const [a, b] = pts;
      geste.current = { type: 'pince', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: v.s, x0: v.x, y0: v.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else if (pts.length === 1) {
      geste.current = { type: 'glisse', px: pts[0].x, py: pts[0].y, x0: v.x, y0: v.y, debut: Date.now(), bouge: false };
    } else {
      geste.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      cadre.current?.setPointerCapture(e.pointerId);
    } catch {}
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    demarrer();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geste.current;
    if (!g) return;
    const v = vue.current;
    if (g.type === 'pince') {
      const pts = Array.from(doigts.current.values());
      if (pts.length < 2) return;
      const [a, b] = pts;
      const s = Math.min(ZOOM_MAX, Math.max(1, (g.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      const { cx, cy } = mesure();
      // Le point de la photo pris entre les doigts au départ reste entre les doigts
      v.x = (a.x + b.x) / 2 - cx - ((g.mx - cx - g.x0) * s) / g.s0;
      v.y = (a.y + b.y) / 2 - cy - ((g.my - cy - g.y0) * s) / g.s0;
      v.s = s;
      appliquer(false);
      return;
    }
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.bouge = true;
    if (v.s > 1) {
      v.x = g.x0 + dx;
      v.y = g.y0 + dy;
      borner();
      appliquer(false);
    } else if (g.bouge) {
      // Photo entière : elle suit le doigt, de côté (changer de photo) ou vers le bas (fermer)
      appliquer(false, Math.abs(dx) > Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: Math.max(0, dy) });
    }
  };

  const finir = (e: React.PointerEvent, annule: boolean) => {
    const g = geste.current;
    doigts.current.delete(e.pointerId);
    const v = vue.current;
    if (!annule && g?.type === 'glisse' && doigts.current.size === 0) {
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      if (!g.bouge && Date.now() - g.debut < 300) {
        // Un appui ; le deuxième, rapproché, zoome ou dézoome
        const avant = dernierAppui.current;
        if (Date.now() - avant.t < 320 && Math.hypot(e.clientX - avant.x, e.clientY - avant.y) < 40) {
          dernierAppui.current = { t: 0, x: 0, y: 0 };
          if (v.s > 1) Object.assign(v, { s: 1, x: 0, y: 0 });
          else zoomerVers(ZOOM_DOUBLE_APPUI, e.clientX, e.clientY);
        } else {
          dernierAppui.current = { t: Date.now(), x: e.clientX, y: e.clientY };
        }
      } else if (v.s <= 1 && g.bouge) {
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) onSuivante();
          else onPrecedente();
        } else if (dy > 100 && dy > Math.abs(dx)) {
          onFermer();
        }
      }
    }
    borner();
    appliquer(true);
    demarrer();
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = Math.min(ZOOM_MAX, Math.max(1, vue.current.s * Math.exp(-e.deltaY * 0.0015)));
    zoomerVers(s, e.clientX, e.clientY);
    borner();
    appliquer(false);
  };

  return (
    <div
      ref={cadre}
      className="absolute inset-0 overflow-hidden cursor-zoom-in"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => finir(e, false)}
      onPointerCancel={e => finir(e, true)}
      onWheel={onWheel}
      onDragStart={e => e.preventDefault()}
    >
      <div ref={calque} className="absolute inset-0 will-change-transform" style={{ transformOrigin: 'center center' }}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="100vw"
          draggable={false}
          unoptimized={!optimisable(src)}
          className="object-contain"
        />
      </div>
    </div>
  );
}

// ─── Plein écran ────────────────────────────────────────────────────────────

function Visionneuse({
  photos,
  index,
  alt,
  onIndexChange,
  onFermer,
}: {
  photos: string[];
  index: number;
  alt: string;
  onIndexChange: (i: number) => void;
  onFermer: () => void;
}) {
  const { language } = useLanguage();
  const boite = useRef<HTMLDivElement>(null);
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  const suivante = useCallback(() => n > 1 && onIndexChange((index + 1) % n), [index, n, onIndexChange]);
  const precedente = useCallback(() => n > 1 && onIndexChange((index - 1 + n) % n), [index, n, onIndexChange]);

  // La page ne défile plus derrière ; le focus va sur « Fermer »
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boutonFermer.current?.focus();
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  // Clavier : Échap ferme, les flèches changent de photo, Tab reste dans la fenêtre
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onFermer();
      } else if (e.key === 'ArrowRight') {
        suivante();
      } else if (e.key === 'ArrowLeft') {
        precedente();
      } else if (e.key === 'Tab' && boite.current) {
        const boutons = Array.from(boite.current.querySelectorAll<HTMLElement>('button'));
        if (boutons.length === 0) return;
        const premier = boutons[0];
        const dernier = boutons[boutons.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        } else if (!boite.current.contains(document.activeElement)) {
          e.preventDefault();
          premier.focus();
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onFermer, suivante, precedente]);

  const fleche = 'grid place-items-center size-12 rounded-full bg-white/15 text-white hover:bg-white/25 active:bg-white/30';

  return (
    <div
      ref={boite}
      role="dialog"
      aria-modal="true"
      aria-label={t(language, `Photos : ${alt}`, `الصور: ${alt}`)}
      dir="ltr"
      className="fixed inset-0 z-[1000] flex flex-col bg-black/95 select-none"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <span className="text-sm font-semibold tabular-nums" aria-live="polite">
          {n > 1 ? `${index + 1} / ${n}` : ''}
        </span>
        <button ref={boutonFermer} type="button" onClick={onFermer} aria-label={t(language, 'Fermer', 'إغلاق')} className={fleche}>
          <X className="size-6" />
        </button>
      </div>

      <div className="relative flex-1">
        <PhotoZoom
          key={photos[index]}
          src={photos[index]}
          alt={n > 1 ? `${alt} — ${index + 1}/${n}` : alt}
          onSuivante={suivante}
          onPrecedente={precedente}
          onFermer={onFermer}
        />
        {n > 1 && (
          <>
            <button type="button" onClick={precedente} aria-label={t(language, 'Photo précédente', 'الصورة السابقة')} className={`${fleche} absolute left-2 top-1/2 -translate-y-1/2`}>
              <ChevronLeft className="size-7" />
            </button>
            <button type="button" onClick={suivante} aria-label={t(language, 'Photo suivante', 'الصورة التالية')} className={`${fleche} absolute right-2 top-1/2 -translate-y-1/2`}>
              <ChevronRight className="size-7" />
            </button>
          </>
        )}
      </div>

      <p className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-white/70" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {t(language, 'Écartez deux doigts ou touchez deux fois pour zoomer', 'باعد بين إصبعين أو المس مرتين للتكبير')}
      </p>
    </div>
  );
}

// ─── Galerie de la fiche ────────────────────────────────────────────────────

interface GaleriePhotosProps {
  images: string[];
  index: number;
  onIndexChange: (i: number) => void;
  // Nom du produit : texte de remplacement des photos
  alt: string;
  // Pastilles posées sur la grande photo (« Nouveau », favoris)
  children?: React.ReactNode;
}

export default function GaleriePhotos({ images, index, onIndexChange, alt, children }: GaleriePhotosProps) {
  const { language } = useLanguage();
  const [pleinEcran, setPleinEcran] = useState(false);
  // Ouverte, d'après les gestes du client (l'état React et l'historique suivent un peu après)
  const ouverte = useRef(false);
  const declencheur = useRef<HTMLElement | null>(null);
  const courant = Math.min(Math.max(0, index), Math.max(0, images.length - 1));
  const photo = images[courant];

  const ouvrir = () => {
    if (!photo || ouverte.current) return;
    ouverte.current = true;
    declencheur.current = document.activeElement as HTMLElement | null;
    // Une entrée d'historique : le bouton « retour » du téléphone ferme la photo au lieu de quitter la fiche
    try {
      window.history.pushState({ photoPleinEcran: true }, '');
    } catch {}
    setPleinEcran(true);
  };

  // Fermée tout de suite, et un seul retour en arrière : la croix touchée deux fois, Échap
  // appuyé deux fois ou un glissé suivi de la croix ne font pas quitter la fiche
  const fermer = useCallback(() => {
    if (!ouverte.current) return;
    ouverte.current = false;
    setPleinEcran(false);
    if (window.history.state?.photoPleinEcran) window.history.back();
  }, []);

  // Bouton « retour » du téléphone : l'entrée ajoutée est déjà retirée, il reste à fermer
  useEffect(() => {
    if (!pleinEcran) return;
    const surRetour = () => {
      ouverte.current = false;
      setPleinEcran(false);
    };
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, [pleinEcran]);

  // Fermée : le focus revient là où il était
  const etaitOuverte = useRef(false);
  useEffect(() => {
    if (etaitOuverte.current && !pleinEcran) declencheur.current?.focus?.();
    etaitOuverte.current = pleinEcran;
  }, [pleinEcran]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square rounded-3xl overflow-hidden bg-neutral-50 border border-neutral-200/80 shadow-xs">
        {photo ? (
          <button
            type="button"
            onClick={ouvrir}
            aria-label={t(language, 'Voir la photo en grand', 'عرض الصورة بالحجم الكبير')}
            className="absolute inset-0 block w-full h-full cursor-zoom-in"
          >
            <Image
              src={photo}
              alt={alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized={!optimisable(photo)}
              className="object-cover"
            />
            <span aria-hidden="true" className="absolute bottom-3 end-3 size-10 rounded-full bg-white/90 text-neutral-800 shadow-sm grid place-items-center">
              <ZoomIn className="size-5" />
            </span>
          </button>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-neutral-300">
            <ImageOff className="size-12" />
          </div>
        )}
        {children}
      </div>

      {/* Vignettes : photos du produit puis photos des variantes */}
      {images.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={t(language, `Photo ${i + 1} sur ${images.length}`, `الصورة ${i + 1} من ${images.length}`)}
              aria-current={i === courant ? 'true' : undefined}
              className={`relative size-16 sm:size-[4.5rem] rounded-2xl overflow-hidden border-2 transition-all flex-shrink-0 bg-neutral-50 ${
                i === courant ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200 hover:border-neutral-400 opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={src} alt="" fill sizes="72px" unoptimized={!optimisable(src)} className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {pleinEcran && photo &&
        createPortal(
          <Visionneuse photos={images} index={courant} alt={alt} onIndexChange={onIndexChange} onFermer={fermer} />,
          document.body,
        )}
    </div>
  );
}
