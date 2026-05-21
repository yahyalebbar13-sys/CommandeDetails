'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
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
  ChevronDown,
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

  return (
    <div className="relative">
      {TRACKING_STEPS.map((step, i) => {
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
              {i < TRACKING_STEPS.length - 1 && (
                <div
                  className="w-0.5 flex-1 my-1 min-h-[32px] transition-all duration-700"
                  style={{ background: done && i < currentIdx ? color : '#E5E7EB' }}
                />
              )}
            </div>
            <div className="flex-1 pb-6 pt-2">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Card (compact, expandable) ──────────────────────────────────────────
function OrderCard({ order }: { order: ShopOrder }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = ORDER_STATUS_COLORS[order.status] || '#6B7280';
  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
  const date = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleDateString('fr-MA', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) || 0;

  const whatsappText = encodeURIComponent(
    `Bonjour LEBTEX 👋\n\nJe souhaite des informations sur ma commande :\n📦 N° ${order.orderNumber}\n\nMerci !`
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Status icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${statusColor}15` }}
        >
          <Package className="w-6 h-6" style={{ color: statusColor }} />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-[#0F0F0F] font-mono text-sm">{order.orderNumber}</p>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${statusColor}15`, color: statusColor }}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {date} · {itemCount} article{itemCount > 1 ? 's' : ''} · <span className="font-semibold text-[#C8102E]">{formatPrice(order.total)}</span>
          </p>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-5">
          {/* Status tracker */}
          <StatusStepper order={order} />

          {/* Items */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Articles</h4>
            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  {item.productImage ? (
                    <img src={item.productImage} alt={item.productName} className="w-10 h-10 rounded-lg object-cover border border-gray-100" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0F0F0F] truncate">{item.productName}</p>
                    <p className="text-xs text-gray-400">Qté: {item.quantity}</p>
                  </div>
                  <p className="font-bold text-sm text-[#0F0F0F]">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping address */}
          {order.shippingAddress && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
              <MapPin className="w-4 h-4 text-[#C8102E] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-600">
                <p className="font-semibold text-[#0F0F0F]">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.address}, {order.shippingAddress.city}</p>
                <p className="text-[#C8102E] font-medium">📞 {order.shippingAddress.phone}</p>
              </div>
            </div>
          )}

          {/* WhatsApp help */}
          <a
            href={`https://wa.me/212760998347?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full p-4 rounded-xl bg-green-50 border border-green-100 hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700">Contacter LEBTEX sur WhatsApp</span>
            </div>
            <ChevronRight className="w-4 h-4 text-green-600" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function SuiviPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState('');
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Auto-load orders from saved phone on mount
  useEffect(() => {
    const savedPhone = localStorage.getItem('lebtex_customer_phone');
    if (savedPhone) {
      fetchOrdersByPhone(savedPhone);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchOrdersByPhone = async (phone: string) => {
    setLoading(true);
    setNotFound(false);
    setOrders([]);

    try {
      // Normalize phone — search with raw digits
      const cleanPhone = phone.replace(/[\s\-]/g, '');

      const q = query(
        collection(db, 'shop_orders'),
        where('customerPhone', '==', cleanPhone),
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setNotFound(true);
        setSearched(true);
        setLoading(false);
        return;
      }

      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShopOrder));
      // Sort by createdAt descending (newest first)
      results.sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb.getTime() - ta.getTime();
      });
      setOrders(results);
      setSearched(true);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setNotFound(true);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone.trim()) return;
    // Save phone for auto-load next time
    localStorage.setItem('lebtex_customer_phone', searchPhone.trim());
    await fetchOrdersByPhone(searchPhone.trim());
  };

  const handleLogout = () => {
    localStorage.removeItem('lebtex_customer_phone');
    localStorage.removeItem('lebtex_last_order_id');
    localStorage.removeItem('lebtex_last_order_number');
    setOrders([]);
    setSearched(false);
    setNotFound(false);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#C8102E] animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Chargement de vos commandes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
      {/* Page header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C8102E] mb-4 shadow-lg shadow-[#C8102E]/25">
          <Truck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-[#0F0F0F]">Suivi de commande</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {orders.length > 0
            ? `${orders.length} commande${orders.length > 1 ? 's' : ''} trouvée${orders.length > 1 ? 's' : ''}`
            : 'Retrouvez vos commandes avec votre numéro de téléphone'}
        </p>
      </div>

      {/* ── If we have orders, show them ── */}
      {orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map(order => (
            <OrderCard key={order.id || order.orderNumber} order={order} />
          ))}

          {/* Change phone / logout */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#C8102E] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Changer de numéro
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Search form ── */}
          <form
            onSubmit={handleSearch}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Votre numéro de téléphone *
              </label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
                <span className="text-sm">🇲🇦</span>
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="tel"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="06 XX XX XX XX"
                  className="flex-1 text-sm bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Le numéro utilisé lors de votre commande
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !searchPhone.trim()}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-white bg-[#C8102E] hover:bg-[#a50d25] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-[#C8102E]/20 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recherche…
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Afficher mes commandes
                </>
              )}
            </button>
          </form>

          {/* Not found */}
          {notFound && (
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-[#0F0F0F]">Aucune commande trouvée</p>
                <p className="text-sm text-gray-500 mt-1">
                  Vérifiez le numéro de téléphone utilisé lors de votre commande.
                </p>
                <a
                  href="https://wa.me/212760998347"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium mt-3 hover:underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  Contactez-nous sur WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* Info box — only before first search */}
          {!searched && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#D4A843]/10 border border-[#D4A843]/20 mt-2">
              <div className="text-[#D4A843] text-lg flex-shrink-0">💡</div>
              <div className="text-sm text-gray-600">
                <p className="font-semibold text-[#0F0F0F]">Comment ça marche ?</p>
                <p className="mt-1">
                  Entrez le numéro de téléphone que vous avez utilisé lors de votre commande. 
                  Toutes vos commandes seront affichées automatiquement avec leur statut en temps réel.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
