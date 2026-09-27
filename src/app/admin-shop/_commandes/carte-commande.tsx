'use client';

// ─── Une commande dans la file ───────────────────────────────────────────────
// Ce qu'il faut pour décider sans ouvrir : depuis quand elle attend, combien,
// qui, où, quoi. Appeler et WhatsApp sont sur la carte : c'est le geste n° 1.
// Le numéro est écrit en clair : sur le PC du magasin, « Appeler » n'appelle pas,
// il faut pouvoir le lire pour le taper sur son portable.

import { memo, type MouseEvent } from 'react';
import { Clock, MapPin, MessageCircle, Phone, PhoneOff } from 'lucide-react';
import { ORDER_STATUS_COLORS, type ShopOrder } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import {
  depuisQuand,
  enRetard,
  lienAppel,
  lienWhatsAppClient,
  telephonesCommande,
  telLisible,
} from '@/lib/commandes-boutique';
import { messageWhatsAppDuMoment, resumeArticles } from './outils-ecran';
import { BadgeStatut, BOUTON_APPEL, BOUTON_INACTIF, BOUTON_WHATSAPP } from './elements';

const arreter = (e: MouseEvent) => e.stopPropagation();

export const CarteCommande = memo(function CarteCommande({
  commande: o,
  maintenant,
  nouvelle,
  selectionnee,
  afficherStatut,
  onOuvrir,
}: {
  commande: ShopOrder;
  maintenant: number;
  nouvelle: boolean;
  selectionnee: boolean;
  afficherStatut: boolean;
  onOuvrir: (id: string) => void;
}) {
  const retard = enRetard(o, maintenant);
  const couleur = ORDER_STATUS_COLORS[o.status] || '#6B7280';
  const nom = o.customerName || o.shippingAddress?.fullName || 'Client sans nom';
  const ville = o.shippingAddress?.city;
  const tel = telephonesCommande(o)[0];
  const appel = lienAppel(tel);
  const whatsapp = lienWhatsAppClient(tel, messageWhatsAppDuMoment(o, maintenant));
  const ouvrir = () => { if (o.id) onOuvrir(o.id); };

  return (
    <article
      onClick={ouvrir}
      className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-[#1A1A1A] transition-colors ${
        selectionnee
          ? 'border-[#C8102E]/80 ring-1 ring-[#C8102E]/50 bg-[#1F1A1B]'
          : retard
            ? 'border-red-500/50 hover:border-red-400/70'
            : 'border-white/10 hover:border-white/25'
      }`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: couleur }} />

      <button
        type="button"
        onClick={e => { e.stopPropagation(); ouvrir(); }}
        aria-label={`Ouvrir la commande ${o.orderNumber} de ${nom}`}
        aria-current={selectionnee ? 'true' : undefined}
        className="block w-full pl-5 pr-4 pt-3.5 pb-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/60 rounded-t-2xl"
      >
        {/* Seul le total partage la ligne du haut : le nom et l'âge gardent toute la largeur du téléphone. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {nouvelle && (
              <span className="rounded-full bg-[#C8102E] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                Nouvelle
              </span>
            )}
            <span className={`inline-flex items-center gap-1 whitespace-nowrap ${retard ? 'font-semibold text-red-400' : 'text-gray-300'}`}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {depuisQuand(o.createdAt, maintenant)}
              {retard && <span className="font-bold"> · en retard</span>}
            </span>
          </div>
          <p className="shrink-0 text-lg font-extrabold leading-tight tabular-nums text-white">{formatPrice(Number(o.total) || 0)}</p>
        </div>
        <p className="mt-1.5 truncate text-base font-bold text-gray-100">{nom}</p>
        {ville && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-gray-300">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            {ville}
          </p>
        )}
        {tel && (
          <p className="mt-0.5 flex items-center gap-1 text-sm tabular-nums tracking-wide text-gray-200">
            <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            {telLisible(tel)}
          </p>
        )}
        <p className="mt-2 line-clamp-2 text-sm text-gray-300">{resumeArticles(o)}</p>
        <p className="mt-1 truncate font-mono text-xs text-gray-400">{o.orderNumber}</p>
        {afficherStatut && <BadgeStatut statut={o.status} className="mt-2" />}
      </button>

      <div className="flex gap-2 pl-5 pr-4 pb-3.5 pt-1.5">
        {appel ? (
          <a href={appel} onClick={arreter} className={`${BOUTON_APPEL} flex-1`} aria-label={`Appeler ${nom} au ${telLisible(tel)}`}>
            <Phone className="h-4 w-4" aria-hidden /> Appeler
          </a>
        ) : (
          <span className={`${BOUTON_INACTIF} flex-1`} aria-disabled="true">
            <PhoneOff className="h-4 w-4" aria-hidden /> Pas de numéro
          </span>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={arreter}
            className={`${BOUTON_WHATSAPP} flex-1`}
            aria-label={`Écrire à ${nom} sur WhatsApp`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
          </a>
        )}
      </div>
    </article>
  );
});
