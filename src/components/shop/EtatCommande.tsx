'use client';

// ─── Où en est la commande : les étapes de SON parcours ─────────────────────
// Partagé par /shop/suivi et la page de la commande (/shop/confirmation/{id}).
// Un colis à domicile, un retrait au magasin et le transport d'un rouleau ne passent
// pas par les mêmes étapes : pas de « remis au transporteur » pour un retrait.
// Le nom du transporteur des colis n'apparaît jamais (« le livreur »).

import React from 'react';
import { CheckCircle2, Clock, MapPin, Package, Store, Truck, XCircle } from 'lucide-react';
import { ORDER_STATUS_COLORS, type LieuRetrait, type ModeReception, type OrderStatus } from '@/lib/shop-types';
import type { ReglagesReception } from '@/lib/reglages-reception';
import type { Language } from '@/lib/translations';
import { libelleStatut } from '@/lib/mes-commandes';

export interface EtapeSuivi {
  status: OrderStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/** Ce qu'il faut savoir de la réception pour choisir le parcours. */
export interface ParcoursCommande {
  mode: ModeReception;
  lieu: LieuRetrait;
  transport: 'camionnette' | 'transporteur';
}

// Rang de chaque statut dans l'avancement : place une commande sur les étapes de
// SON parcours même si l'équipe a choisi un statut d'un autre parcours.
const RANG_STATUT: Partial<Record<OrderStatus, number>> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  ready_for_pickup: 3,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
};

export function etapesCommande(p: ParcoursCommande, reglages: ReglagesReception, language: Language): EtapeSuivi[] {
  const ar = language === 'ar';
  const nomLieu = reglages.lieux[p.lieu].nom;
  const livree: EtapeSuivi = {
    status: 'delivered',
    label: ar ? 'تم التوصيل' : 'Livrée',
    description: ar ? 'تم توصيل الطلب بنجاح' : 'Commande livrée avec succès',
    icon: <CheckCircle2 className="w-5 h-5" />,
  };
  const debut: EtapeSuivi[] = [
    {
      status: 'pending',
      label: ar ? 'في الانتظار' : 'En attente',
      description: ar
        ? p.mode === 'transport'
          ? 'تم استلام الطلب: سنتصل بك لتنظيم النقل'
          : 'تم استلام الطلب، في انتظار التأكيد'
        : p.mode === 'transport'
          ? 'Commande reçue : nous vous appelons pour organiser le transport'
          : 'Commande reçue, en attente de confirmation',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      status: 'confirmed',
      label: ar ? 'مؤكَّد' : 'Confirmée',
      description: ar
        ? p.mode === 'transport' ? 'اتفقنا معك على النقل عبر الهاتف' : 'أكد فريقنا الطلب'
        : p.mode === 'transport' ? 'Transport convenu avec vous au téléphone' : 'Commande confirmée par notre équipe',
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
    {
      status: 'processing',
      label: ar ? 'قيد التحضير' : 'En préparation',
      description: ar ? `يُحضَّر طلبك في ${nomLieu}` : `Votre commande est en cours de préparation à ${nomLieu}`,
      icon: <Package className="w-5 h-5" />,
    },
  ];

  if (p.mode === 'retrait') {
    return [
      ...debut,
      {
        status: 'ready_for_pickup',
        label: ar ? 'جاهز للاستلام' : 'Prête à retirer',
        description: ar
          ? `يمكنك استلامه من ${nomLieu} بتقديم رقم طلبك`
          : `Venez la retirer à ${nomLieu} avec votre numéro de commande`,
        icon: <Store className="w-5 h-5" />,
      },
      {
        status: 'delivered',
        label: ar ? 'تم الاستلام' : 'Retirée',
        description: ar ? 'تم استلام الطلب من المحل' : 'Commande retirée au magasin',
        icon: <CheckCircle2 className="w-5 h-5" />,
      },
    ];
  }

  // « Prête à retirer » veut toujours dire « prête dans un magasin LEBTEX » : pas d'étape
  // « arrivée au dépôt du transporteur » (l'équipe ne la pose pas, et ce statut enverrait
  // l'adresse de CHRIFA). Nous prévenons le client par téléphone quand le camion arrive.
  if (p.mode === 'transport' && p.transport === 'transporteur') {
    return [
      ...debut,
      {
        status: 'shipped',
        label: ar ? 'سُلِّم للناقل' : 'Remise au transporteur',
        description: ar
          ? 'في الطريق إلى مستودعه في مدينتك: نتصل بك عند وصوله ونعطيك عنوان المستودع'
          : 'En route vers son dépôt, dans votre ville : nous vous appelons à son arrivée, avec l’adresse du dépôt',
        icon: <Truck className="w-5 h-5" />,
      },
      {
        status: 'delivered',
        label: ar ? 'تم الاستلام' : 'Récupérée',
        description: ar ? 'تم استلام البضاعة من مستودع الناقل' : 'Marchandise récupérée au dépôt du transporteur',
        icon: <CheckCircle2 className="w-5 h-5" />,
      },
    ];
  }

  if (p.mode === 'transport') {
    return [
      ...debut,
      {
        status: 'shipped',
        label: ar ? 'تم التحميل' : 'Chargée',
        description: ar ? 'تم تحميل طلبك في شاحنتنا' : 'Chargée dans notre camionnette',
        icon: <Truck className="w-5 h-5" />,
      },
      {
        status: 'out_for_delivery',
        label: ar ? 'في الطريق إليك' : 'En livraison',
        description: ar ? 'سائقنا في الطريق إليك' : 'Notre chauffeur est en route vers vous',
        icon: <MapPin className="w-5 h-5" />,
      },
      livree,
    ];
  }

  return [
    ...debut,
    {
      status: 'shipped',
      label: ar ? 'تم الشحن' : 'Expédiée',
      description: ar ? 'سُلِّم الطرد إلى عامل التوصيل' : 'Colis remis au livreur',
      icon: <Truck className="w-5 h-5" />,
    },
    {
      status: 'out_for_delivery',
      label: ar ? 'في الطريق إليك' : 'En livraison',
      description: ar ? 'عامل التوصيل في الطريق إليك' : 'Le livreur est en route vers vous',
      icon: <MapPin className="w-5 h-5" />,
    },
    livree,
  ];
}

/** « Retirée » plutôt que « Livré » pour un retrait : le libellé de l'étape du parcours. */
export function libelleEtat(statut: OrderStatus, etapes: EtapeSuivi[], language: Language): string {
  return etapes.find(e => e.status === statut)?.label || libelleStatut(statut, language);
}

function indexEtape(etapes: EtapeSuivi[], status: OrderStatus): number {
  const exact = etapes.findIndex(s => s.status === status);
  if (exact !== -1) return exact;
  const rang = RANG_STATUT[status] ?? 0;
  let idx = 0;
  etapes.forEach((s, i) => {
    if ((RANG_STATUT[s.status] ?? 0) <= rang) idx = i;
  });
  return idx;
}

/** Les étapes, verticales ; annulée ou retournée : un seul encadré. */
export function EtapesCommande({ statut, etapes, language }: { statut: OrderStatus; etapes: EtapeSuivi[]; language: Language }) {
  const ar = language === 'ar';
  const currentIdx = indexEtape(etapes, statut);

  if (statut === 'cancelled' || statut === 'returned') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
        <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-700">{libelleStatut(statut, language)}</p>
          <p className="text-sm text-red-600 mt-0.5">
            {statut === 'cancelled'
              ? ar ? 'تم إلغاء هذا الطلب.' : 'Cette commande a été annulée.'
              : ar ? 'بدأت عملية إرجاع لهذا الطلب.' : 'Un retour a été initié pour cette commande.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {etapes.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const color = done ? (ORDER_STATUS_COLORS[step.status] || '#6B7280') : '#D1D5DB';

        return (
          <div key={step.status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                  active ? 'ring-4 ring-offset-2' : ''
                }`}
                style={{
                  background: done ? color : '#F3F4F6',
                  color: done ? 'white' : '#9CA3AF',
                  boxShadow: active ? `0 0 0 4px ${color}25` : 'none',
                }}
              >
                {active ? (
                  <span className="relative flex items-center justify-center">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
                      style={{ background: color }}
                    />
                    {step.icon}
                  </span>
                ) : (
                  step.icon
                )}
              </div>
              {i < etapes.length - 1 && (
                <div
                  className="w-0.5 flex-1 my-1 min-h-[32px] transition-all duration-700"
                  style={{ background: done && i < currentIdx ? color : '#E5E7EB' }}
                />
              )}
            </div>
            <div className="flex-1 pb-6 pt-2">
              <p
                className={`font-semibold text-sm transition-colors ${
                  done ? 'text-[#0F0F0F]' : 'text-gray-500'
                } ${active ? 'text-base' : ''}`}
              >
                {step.label}
                {active && (
                  <span
                    className="ms-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: `${color}18`, color }}
                  >
                    {ar ? 'قيد التنفيذ' : 'En cours'}
                  </span>
                )}
              </p>
              <p className={`text-xs mt-0.5 ${done ? 'text-gray-600' : 'text-gray-500'}`}>{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
