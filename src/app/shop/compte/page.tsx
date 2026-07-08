'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
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
  LogOut,
  Package,
  User as UserIcon,
  Heart,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  Truck,
  MapPin,
  ShoppingBag,
  MessageCircle,
  Loader2,

} from 'lucide-react';

// ─── Firebase init ─────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ─── Status timeline steps ─────────────────────────────────────────────────────
const STATUS_STEPS: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  confirmed: <CheckCircle2 className="w-4 h-4" />,
  processing: <Package className="w-4 h-4" />,
  shipped: <Truck className="w-4 h-4" />,
  out_for_delivery: <MapPin className="w-4 h-4" />,
  delivered: <CheckCircle2 className="w-4 h-4" />,
};

function getStepIndex(status: OrderStatus): number {
  const idx = STATUS_STEPS.indexOf(status);
  return idx === -1 ? 0 : idx;
}

// ─── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: ShopOrder }) {
  const [expanded, setExpanded] = useState(false);
  const stepIdx = getStepIndex(order.status);
  const statusColor = ORDER_STATUS_COLORS[order.status] || '#6B7280';
  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;

  const date = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleDateString('fr-MA', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#0F0F0F]/8 overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Card header */}
      <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${statusColor}18` }}
          >
            <Package className="w-5 h-5" style={{ color: statusColor }} />
          </div>
          <div>
            <p className="font-bold text-[#0F0F0F] text-sm font-mono">{order.orderNumber}</p>
            <p className="text-xs text-gray-500 mt-0.5">{date}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${statusColor}18`, color: statusColor }}
          >
            {statusLabel}
          </span>
          <span className="text-sm text-gray-500">
            {order.items?.reduce((s, i) => s + i.quantity, 0) || 0} article(s)
          </span>
          <span className="font-bold text-[#C8102E]">{formatPrice(order.total)}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#C8102E] transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#C8102E]/30"
          >
            {expanded ? (
              <>
                Masquer <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Voir détails <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mini status timeline */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-0">
          {STATUS_STEPS.filter((s) => s !== 'cancelled' && s !== 'returned').map((step, i) => {
            const done = i <= stepIdx && order.status !== 'cancelled';
            const active = i === stepIdx && order.status !== 'cancelled';
            return (
              <React.Fragment key={step}>
                <div
                  className="flex flex-col items-center"
                  title={ORDER_STATUS_LABELS[step]}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      active
                        ? 'ring-2 ring-offset-1'
                        : ''
                    }`}
                    style={{
                      background: done ? statusColor : '#E5E7EB',
                      color: done ? 'white' : '#9CA3AF',
                      ringColor: active ? statusColor : 'transparent',
                    }}
                  >
                    {STATUS_ICONS[step]}
                  </div>
                </div>
                {i < STATUS_STEPS.filter((s) => s !== 'cancelled' && s !== 'returned').length - 1 && (
                  <div
                    className="flex-1 h-0.5 transition-all duration-500"
                    style={{ background: i < stepIdx ? statusColor : '#E5E7EB' }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Articles commandés
            </p>
            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {item.productImage ? (
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="w-10 h-10 rounded-lg object-cover border border-gray-100"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-[#0F0F0F]">{item.productName}</p>
                      {item.variant?.color && (
                        <p className="text-xs text-gray-500">Couleur: {item.variant.color}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#0F0F0F]">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} × {formatPrice(item.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-[#FBF8F3] rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Sous-total</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Livraison</span>
              <span>{formatPrice(order.deliveryFee)}</span>
            </div>
            {order.discount ? (
              <div className="flex justify-between text-sm text-green-600">
                <span>Réduction</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold text-[#0F0F0F] text-base border-t border-gray-200 pt-2 mt-2">
              <span>Total</span>
              <span className="text-[#C8102E]">{formatPrice(order.total)}</span>
            </div>
          </div>

          {/* Shipping address */}
          {order.shippingAddress && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
              <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                <p className="font-semibold">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.address}</p>
                <p>
                  {order.shippingAddress.city}
                  {order.shippingAddress.postalCode && `, ${order.shippingAddress.postalCode}`}
                </p>
                <p className="text-blue-600 mt-1">📞 {order.shippingAddress.phone}</p>
              </div>
            </div>
          )}

          {/* Tracking notes */}
          {order.trackingNotes && order.trackingNotes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Historique
              </p>
              <div className="space-y-2">
                {order.trackingNotes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: ORDER_STATUS_COLORS[note.status] || '#6B7280' }}
                    />
                    <div>
                      <span className="font-medium" style={{ color: ORDER_STATUS_COLORS[note.status] || '#374151' }}>
                        {ORDER_STATUS_LABELS[note.status]}
                      </span>
                      <span className="text-gray-500 ml-2 text-xs">
                        {note.timestamp?.toDate
                          ? note.timestamp.toDate().toLocaleDateString('fr-MA', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                      {note.message && <p className="text-gray-600 text-xs mt-0.5">{note.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Auth Form ─────────────────────────────────────────────────────────────────
function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      onSuccess();
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('Email ou mot de passe incorrect.');
      } else if (code === 'auth/too-many-requests') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else {
        setError('Erreur de connexion. Vérifiez vos identifiants.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      await updateProfile(cred.user, { displayName: regName });
      // Create user doc in Firestore
      await setDoc(doc(db, 'shop_customers', cred.user.uid), {
        uid: cred.user.uid,
        email: regEmail,
        displayName: regName,
        phone: '',
        addresses: [],
        totalOrders: 0,
        totalSpent: 0,
        createdAt: serverTimestamp(),
      });
      onSuccess();
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('Cet email est déjà utilisé. Connectez-vous à la place.');
      } else if (code === 'auth/invalid-email') {
        setError('Email invalide.');
      } else {
        setError('Erreur lors de la création du compte.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#0F0F0F] text-sm focus:outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all placeholder-gray-400';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C8102E] mb-4 shadow-lg shadow-[#C8102E]/25">
            <UserIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F0F0F]">Mon Compte</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez vos commandes et votre profil</p>
        </div>

        {/* WhatsApp note */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-green-50 border border-green-100 mb-6">
          <MessageCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">
            <span className="font-semibold">Pas de compte ?</span> Vous pouvez aussi commander
            directement via WhatsApp sans créer de compte !{' '}
            <a
              href="https://wa.me/212760998347"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Nous contacter
            </a>
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
              tab === 'login'
                ? 'bg-white text-[#C8102E] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Se connecter
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
              tab === 'register'
                ? 'bg-white text-[#C8102E] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Créer un compte
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 mb-4 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Login form */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="votre@email.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-[#C8102E] hover:bg-[#a50d25] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-[#C8102E]/20 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connexion…
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>
        )}

        {/* Register form */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Nom complet
              </label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Votre nom complet"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="votre@email.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Confirmer le mot de passe
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Répétez le mot de passe"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-[#C8102E] hover:bg-[#a50d25] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-[#C8102E]/20 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création…
                </>
              ) : (
                'Créer mon compte'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Account Dashboard ─────────────────────────────────────────────────────────
function AccountDashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'wishlist'>('orders');
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initials = (user.displayName || user.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Fetch orders
  useEffect(() => {
    if (!user.email) return;
    setLoadingOrders(true);
    const fetchOrders = async () => {
      try {
        const q = query(
          collection(db, 'shop_orders'),
          where('customerEmail', '==', user.email),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShopOrder));
        setOrders(data);
      } catch {
        // Silently handle order fetch failures
      } finally {
        setLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [user.email]);

  // Fetch profile phone
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'shop_customers', user.uid));
        if (snap.exists()) {
          setPhone(snap.data().phone || '');
        }
      } catch {}
    };
    fetchProfile();
  }, [user.uid]);

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      await setDoc(
        doc(db, 'shop_customers', user.uid),
        { phone, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 3000);
    } catch {}
    setSavingPhone(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      setSigningOut(false);
    }
  };

  const tabs = [
    { key: 'orders', label: 'Mes Commandes', icon: <Package className="w-4 h-4" /> },
    { key: 'profile', label: 'Mon Profil', icon: <UserIcon className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Profile header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C8102E] to-[#a50d25] flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-[#C8102E]/20 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#0F0F0F]">
            {user.displayName || 'Client LEBTEX'}
          </h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Mail className="w-3.5 h-3.5" />
            {user.email}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {orders.length} commande{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-[#C8102E] transition-all text-sm font-medium"
        >
          {signingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          Se déconnecter
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 mb-6 gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
              activeTab === t.key
                ? 'bg-[#C8102E] text-white shadow-md shadow-[#C8102E]/20'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}

      {/* Orders */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {loadingOrders ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#C8102E]" />
              <p className="text-gray-500 text-sm">Chargement de vos commandes…</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
                <ShoppingBag className="w-10 h-10 text-gray-300" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[#0F0F0F]">Aucune commande</p>
                <p className="text-gray-500 text-sm mt-1">
                  Vous n'avez pas encore passé de commande.
                </p>
              </div>
              <a
                href="/shop"
                className="px-6 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a50d25] transition-colors shadow-md shadow-[#C8102E]/20"
              >
                Commencer mes achats
              </a>
            </div>
          ) : (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      )}

      {/* Profile */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <h2 className="text-lg font-bold text-[#0F0F0F]">Informations personnelles</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Nom complet
              </label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700">
                <UserIcon className="w-4 h-4 text-gray-400" />
                {user.displayName || '—'}
              </div>
              <p className="text-xs text-gray-400 mt-1">Modifiable depuis votre profil Firebase</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Email
              </label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700">
                <Mail className="w-4 h-4 text-gray-400" />
                {user.email}
              </div>
              <p className="text-xs text-gray-400 mt-1">Email de connexion (non modifiable)</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Numéro de téléphone
              </label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: 06 12 34 56 78"
                    className="flex-1 text-sm bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={handleSavePhone}
                  disabled={savingPhone}
                  className="px-5 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a50d25] disabled:opacity-60 transition-all flex items-center gap-2"
                >
                  {savingPhone ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : phoneSaved ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : null}
                  {phoneSaved ? 'Sauvegardé !' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wishlist */}
      {activeTab === 'wishlist' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center">
            <Heart className="w-10 h-10 text-[#C8102E]/30" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[#0F0F0F]">Wishlist vide</p>
            <p className="text-gray-500 text-sm mt-1">
              Sauvegardez vos produits favoris pour les retrouver facilement.
            </p>
          </div>
          <a
            href="/shop"
            className="px-6 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a50d25] transition-colors shadow-md shadow-[#C8102E]/20"
          >
            Découvrir nos produits
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function ComptePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#C8102E]" />
          <p className="text-gray-500 text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={() => {}} />;
  }

  return <AccountDashboard user={user} />;
}
