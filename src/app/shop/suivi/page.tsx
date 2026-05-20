'use client';

import React, { useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type ShopOrder,
  type OrderStatus,
} from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import {
  Search,
  Package,
  CheckCircle2,
  Clock,
  Truck,
  MapPin,
  XCircle,
  ShoppingBag,
  MessageCircle,
  Loader2,
  AlertCircle,
  Phone,
  Hash,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';

// ─── Firebase init ─────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Status step config ────────────────────────────────────────────────────────
const TRACKING_STEPS: {
  status: OrderStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    status: 'pending',
    label: 'En attente',
    description: 'Commande reçue, en attente de confirmation',
    icon: <Clock className="w-5 h-5" />,
  },
  {
    status: 'confirmed',
    label: 'Confirmée',
    description: 'Commande confirmée par notre équipe',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
  {
    status: 'processing',
    label: 'En préparation',
    description: 'Votre colis est en cours de préparation',
    icon: <Package className="w-5 h-5" />,
  },
  {
    status: 'shipped',
    label: 'Expédiée',
    description: 'Colis remis au transporteur',
    icon: <Truck className="w-5 h-5" />,
  },
  {
    status: 'out_for_delivery',
    label: 'En livraison',
    description: 'Le livreur est en route vers vous',
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    status: 'delivered',
    label: 'Livrée',
    description: 'Commande livrée avec succès',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
];

function getStepIndex(status: OrderStatus): number {
  const idx = TRACKING_STEPS.findIndex((s) => s.status === status);
  return idx === -1 ? 0 : idx;
}

// ─── Vertical Stepper ─────────────────────────────────────────────────────────
function StatusStepper({ order }: { order: ShopOrder }) {
  const currentIdx = getStepIndex(order.status);
  const isCancelled = order.status === 'cancelled' || order.status === 'returned';

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
        <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-700">
            {ORDER_STATUS_LABELS[order.status]}
          </p>
          <p className="text-sm text-red-600 mt-0.5">
            {order.status === 'cancelled'
              ? 'Cette commande a été annulée.'
              : 'Un retour a été initié pour cette commande.'}
          </p>
        </div>
      </div>
    );
  }

  // Find timestamps from trackingNotes
  const getTimestamp = (status: OrderStatus): string | null => {
    const note = order.trackingNotes?.find((n) => n.status === status);
    if (!note?.timestamp?.toDate) return null;
    return note.timestamp.toDate().toLocaleDateString('fr-MA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="relative">
      {TRACKING_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const future = i > currentIdx;
        const color = done ? ORDER_STATUS_COLORS[step.status] : '#D1D5DB';
        const timestamp = getTimestamp(step.status);

        return (
          <div key={step.status} className="flex gap-4">
            {/* Left column: icon + line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                  active ? 'ring-4 ring-offset-2' : ''
                }`}
                style={{
                  background: done ? color : '#F3F4F6',
                  color: done ? 'white' : '#9CA3AF',
                  ringColor: active ? color : 'transparent',
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
              {i < TRACKING_STEPS.length - 1 && (
                <div
                  className="w-0.5 flex-1 my-1 min-h-[32px] transition-all duration-700"
                  style={{ background: done && i < currentIdx ? color : '#E5E7EB' }}
                />
              )}
            </div>

            {/* Right column: content */}
            <div className="flex-1 pb-6 pt-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p
                    className={`font-semibold text-sm transition-colors ${
                      done ? 'text-[#0F0F0F]' : 'text-gray-400'
                    } ${active ? 'text-base' : ''}`}
                  >
                    {step.label}
                    {active && (
                      <span
                        className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${color}18`, color }}
                      >
                        En cours
                      </span>
                    )}
                  </p>
                  <p className={`text-xs mt-0.5 ${done ? 'text-gray-500' : 'text-gray-300'}`}>
                    {step.description}
                  </p>
                  {/* Note from trackingNotes */}
                  {done && order.trackingNotes?.find((n) => n.status === step.status)?.message && (
                    <p className="text-xs text-gray-600 mt-1 italic">
                      "{order.trackingNotes.find((n) => n.status === step.status)?.message}"
                    </p>
                  )}
                </div>
                {timestamp && (
                  <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {timestamp}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Result Card ─────────────────────────────────────────────────────────
function OrderResult({ order }: { order: ShopOrder }) {
  const statusColor = ORDER_STATUS_COLORS[order.status] || '#6B7280';
  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
  const date = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleDateString('fr-MA', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  const whatsappText = encodeURIComponent(
    `Bonjour LEBTEX 👋\n\nJe souhaite des informations sur ma commande :\n📦 N° ${order.orderNumber}\n\nMerci !`
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Order header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 text-gray-400" />
              <p className="font-bold text-[#0F0F0F] font-mono text-lg">{order.orderNumber}</p>
            </div>
            <p className="text-gray-500 text-sm">{date}</p>
            <p className="text-gray-500 text-sm">
              {order.items?.reduce((s, i) => s + i.quantity, 0) || 0} article(s) •{' '}
              <span className="font-bold text-[#C8102E]">{formatPrice(order.total)}</span>
            </p>
          </div>
          <div>
            <span
              className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: `${statusColor}15`, color: statusColor }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Status tracker */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-6">
          Suivi de la commande
        </h3>
        <StatusStepper order={order} />
      </div>

      {/* Shipping address */}
      {order.shippingAddress && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
            Adresse de livraison
          </h3>
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#C8102E18' }}
            >
              <MapPin className="w-5 h-5 text-[#C8102E]" />
            </div>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p className="font-semibold text-[#0F0F0F]">
                {order.shippingAddress.fullName}
              </p>
              <p>{order.shippingAddress.address}</p>
              <p>
                {order.shippingAddress.city}
                {order.shippingAddress.region && `, ${order.shippingAddress.region}`}
                {order.shippingAddress.postalCode && ` ${order.shippingAddress.postalCode}`}
              </p>
              <p className="flex items-center gap-1.5 text-[#C8102E] font-medium pt-1">
                <Phone className="w-3.5 h-3.5" />
                {order.shippingAddress.phone}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
          Articles commandés
        </h3>
        <div className="space-y-3">
          {order.items?.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0"
            >
              {item.productImage ? (
                <img
                  src={item.productImage}
                  alt={item.productName}
                  className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag className="w-6 h-6 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#0F0F0F] truncate">
                  {item.productName}
                </p>
                {item.variant?.color && (
                  <p className="text-xs text-gray-500 mt-0.5">Couleur: {item.variant.color}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">Qté: {item.quantity}</p>
              </div>
              <p className="font-bold text-[#0F0F0F] text-sm flex-shrink-0">
                {formatPrice(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {/* Total summary */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Sous-total</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Frais de livraison</span>
            <span>{formatPrice(order.deliveryFee)}</span>
          </div>
          {order.discount ? (
            <div className="flex justify-between text-sm text-green-600">
              <span>Réduction</span>
              <span>-{formatPrice(order.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold text-[#0F0F0F] pt-2 border-t border-gray-100">
            <span>Total</span>
            <span className="text-[#C8102E] text-base">{formatPrice(order.total)}</span>
          </div>
        </div>
      </div>

      {/* WhatsApp support */}
      <a
        href={`https://wa.me/212760998347?text=${whatsappText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between w-full p-5 rounded-2xl bg-green-50 border border-green-100 hover:bg-green-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center shadow-md shadow-green-500/25">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-green-800 text-sm">Besoin d'aide ?</p>
            <p className="text-xs text-green-600">
              Contactez-nous sur WhatsApp pour toute question
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-green-600 group-hover:translate-x-1 transition-transform" />
      </a>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SuiviPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShopOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setLoading(true);
    setNotFound(false);
    setResult(null);
    setSearched(false);

    try {
      const q = query(
        collection(db, 'shop_orders'),
        where('orderNumber', '==', orderNumber.trim().toUpperCase())
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setNotFound(true);
        setSearched(true);
        return;
      }

      const orderDoc = snap.docs[0];
      const orderData = { id: orderDoc.id, ...orderDoc.data() } as ShopOrder;

      // If phone is provided, verify it matches
      if (phone.trim()) {
        const orderPhone = orderData.shippingAddress?.phone?.replace(/\s/g, '') || '';
        const inputPhone = phone.trim().replace(/\s/g, '');
        if (!orderPhone.includes(inputPhone) && !inputPhone.includes(orderPhone.slice(-8))) {
          setNotFound(true);
          setSearched(true);
          return;
        }
      }

      setResult(orderData);
      setSearched(true);
    } catch (err) {
      console.error('Error fetching order:', err);
      setNotFound(true);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setNotFound(false);
    setSearched(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
      {/* Page header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C8102E] mb-4 shadow-lg shadow-[#C8102E]/25">
          <Truck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-[#0F0F0F]">Suivi de commande</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Entrez votre numéro de commande pour suivre la livraison en temps réel
        </p>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSearch}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Numéro de commande *
          </label>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
            <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Ex: LBT-M1ABC2-XY12"
              className="flex-1 text-sm bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400 font-mono"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Téléphone de commande (optionnel)
          </label>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
            <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 06 12 34 56 78"
              className="flex-1 text-sm bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Pour sécuriser votre recherche (recommandé)
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !orderNumber.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-[#C8102E] hover:bg-[#a50d25] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-[#C8102E]/20 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recherche…
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Suivre ma commande
              </>
            )}
          </button>
          {searched && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-3.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Nouvelle recherche
            </button>
          )}
        </div>
      </form>

      {/* Not found */}
      {notFound && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-[#0F0F0F]">Commande introuvable</p>
              <p className="text-sm text-gray-500 mt-1">
                Vérifiez le numéro de commande et le téléphone saisis. Le numéro de commande
                commence par <span className="font-mono font-semibold">LBT-</span>.
              </p>
              <a
                href="https://wa.me/212760998347"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium mt-3 hover:underline"
              >
                <MessageCircle className="w-4 h-4" />
                Contactez-nous sur WhatsApp pour de l'aide
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && <OrderResult order={result} />}

      {/* Info box */}
      {!searched && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#D4A843]/10 border border-[#D4A843]/20 mt-2">
          <div className="text-[#D4A843] text-lg flex-shrink-0">💡</div>
          <div className="text-sm text-gray-600">
            <p className="font-semibold text-[#0F0F0F]">Où trouver mon numéro de commande ?</p>
            <p className="mt-1">
              Votre numéro de commande vous a été envoyé par SMS ou WhatsApp lors de la confirmation.
              Il commence toujours par <span className="font-mono font-semibold">LBT-</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
