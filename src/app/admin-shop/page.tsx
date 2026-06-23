'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  limit,
  where,
  Timestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type ShopOrder,
  type OrderStatus,
} from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import { SHOP_PRODUCTS_DATA, SHOP_CATEGORIES } from '@/lib/shop-products-data';
import type { ShopProduct } from '@/lib/shop-types';
import type { ProductOverride } from '@/contexts/shop-products-context';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  LogOut,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  MapPin,
  BarChart2,
  ChevronDown,
  Shield,
  ExternalLink,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Save,
  Image as ImageIcon,
  Tag,
  Star,
  Zap,
  Sparkles,
  X,
  Check,
  Pencil,
  Search,
  Plus,
  FolderPlus,
  Trash2,
  Grid3X3,
  MessageCircle,
  Phone,
  Upload,
} from 'lucide-react';

// ─── Firebase init ─────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const ADMIN_EMAIL = 'yahya.lebbar13@gmail.com';

// ─── Image Uploader Component ──────────────────────────────────────────────────
function ImageUploader({
  value,
  onChange,
  folder = 'shop/images',
  label,
  aspectRatio = 'aspect-video',
}: {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
  aspectRatio?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert("Le fichier sélectionné n'est pas une image valide (doit être JPG, PNG, WEBP, etc.).");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const uniqueName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const fileRef = storageRef(storage, uniqueName);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Erreur lors du téléversement: ${err.message || 'Problème de connexion ou de permissions'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
    else alert("Aucun fichier n'a été détecté lors du glisser-déposer.");
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <ImageIcon className="w-3 h-3" /> {label}
        </label>
      )}

      {value ? (
        <div className={`relative group rounded-xl overflow-hidden border border-white/10 ${aspectRatio}`}>
          <img
            src={value}
            alt="Aperçu"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
          />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
            >
              Changer
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-2 py-6 ${
            dragOver
              ? 'border-[#C8102E] bg-[#C8102E]/10'
              : 'border-white/10 hover:border-white/25 bg-white/[0.02]'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 text-[#C8102E] animate-spin" />
              <p className="text-xs text-gray-400">Téléversement…</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-gray-500" />
              <div className="text-center">
                <p className="text-xs text-gray-400">
                  <span className="text-[#C8102E] font-semibold">Cliquer</span> ou glisser une image
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">PNG, JPG, WebP · Max 5 MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* URL input toggle */}
      {!value && (
        <div>
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showUrlInput ? '✕ Fermer' : '🔗 Ou coller une URL'}
          </button>
          {showUrlInput && (
            <input
              type="text"
              placeholder="https://..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange((e.target as HTMLInputElement).value);
                  setShowUrlInput(false);
                }
              }}
              onBlur={(e) => {
                if (e.target.value.trim()) {
                  onChange(e.target.value.trim());
                  setShowUrlInput(false);
                }
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs focus:outline-none focus:border-[#C8102E]/50 placeholder-gray-600"
            />
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function MiniImageUploader({
  value,
  onChange,
  folder = 'shop/variants',
}: {
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return alert("Image invalide.");
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const uniqueName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const fileRef = storageRef(storage, uniqueName);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-8 h-8 rounded-full border border-white/20 bg-white/5 overflow-hidden flex-shrink-0 cursor-pointer hover:border-[#C8102E]/50 transition-all flex items-center justify-center group"
      onClick={() => fileInputRef.current?.click()}
      title="Ajouter une image pour ce modèle"
    >
      {value ? (
        <img src={value} alt="Variant" className="w-full h-full object-cover" />
      ) : (
        <ImageIcon className="w-3.5 h-3.5 text-gray-400 group-hover:text-white" />
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <Loader2 className="w-3 h-3 text-white animate-spin" />
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
}

// ─── Multi-Image Uploader ─────────────────────────────────────────────────────
function MultiImageUploader({
  images,
  onChange,
  folder = 'shop/products',
}: {
  images: string[];
  onChange: (images: string[]) => void;
  folder?: string;
}) {
  const handleImageChange = (index: number, url: string) => {
    const newImages = [...images];
    newImages[index] = url;
    onChange(newImages);
  };

  const handleRemove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...images, '']);
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
        <ImageIcon className="w-3 h-3" /> Images
      </label>

      <div className="grid grid-cols-2 gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative">
            <ImageUploader
              value={img}
              onChange={(url) => handleImageChange(i, url)}
              folder={folder}
              aspectRatio="aspect-square"
            />
            {images.length > 1 && img && (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="absolute top-1 right-1 z-10 p-1 rounded-md bg-black/60 text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="text-xs text-gray-500 hover:text-[#C8102E] transition-colors font-medium flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Ajouter une image
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isToday(ts: any): boolean {
  if (!ts) return false;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

function formatDate(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('fr-MA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OrderStatus }) {
  const color = ORDER_STATUS_COLORS[status] || '#6B7280';
  const label = ORDER_STATUS_LABELS[status] || status;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: `${color}18`, color }}
    >
      {label}
    </span>
  );
}

// ─── Status Dropdown ──────────────────────────────────────────────────────────
const STATUS_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
];

function StatusDropdown({
  orderId,
  currentStatus,
  onUpdated,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  onUpdated: (id: string, status: OrderStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = async (newStatus: OrderStatus) => {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(false);
    try {
      await updateDoc(doc(db, 'shop_orders', orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      onUpdated(orderId, newStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-all disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            Modifier <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[180px] animate-in slide-in-from-top-2 duration-150">
            {STATUS_FLOW.map((s) => {
              const color = ORDER_STATUS_COLORS[s] || '#6B7280';
              const label = ORDER_STATUS_LABELS[s];
              const isCurrent = s === currentStatus;
              return (
                <button
                  key={s}
                  onClick={() => handleChange(s)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left hover:bg-gray-50 transition-colors ${
                    isCurrent ? 'bg-gray-50' : ''
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span className={isCurrent ? 'font-semibold text-gray-800' : 'text-gray-600'}>
                    {label}
                  </span>
                  {isCurrent && (
                    <CheckCircle2 className="w-3 h-3 ml-auto text-gray-400" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  sub,
  icon,
  color,
  trend,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}) {
  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
            <ArrowUpRight className="w-3 h-3" />
            {trend}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-400 font-medium">{title}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Sidebar (desktop) + Bottom Nav (mobile) ───────────────────────────────────────────
function Sidebar({ activeNav, onNav }: { activeNav: string; onNav: (v: string) => void }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'commandes', label: 'Commandes', icon: <Package className="w-5 h-5" /> },
    { id: 'produits', label: 'Produits', icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'categories', label: 'Catégories', icon: <Grid3X3 className="w-5 h-5" /> },
    { id: 'clients', label: 'Clients', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-[#0F0F0F] border-r border-white/5 flex-col min-h-screen">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C8102E] flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm tracking-wide">LEBTEX</p>
              <p className="text-gray-500 text-xs">Administration</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/25'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}

          <div className="pt-4 border-t border-white/5 mt-4">
            <a
              href="/shop"
              target="_blank"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Voir la boutique
            </a>
          </div>
        </nav>

        {/* Version */}
        <div className="px-5 py-4 border-t border-white/5">
          <p className="text-xs text-gray-600">LEBTEX Admin v1.0</p>
        </div>
      </aside>

      {/* ─── Mobile Bottom Navigation Bar ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0F0F0F] border-t border-white/10 flex items-center justify-around px-2 py-2 safe-area-bottom">
        {navItems.map((item) => {
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                active ? 'text-[#C8102E]' : 'text-gray-500'
              }`}
            >
              {item.icon}
              <span className="text-[9px] font-semibold uppercase tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ─── Dashboard view ────────────────────────────────────────────────────────────
function DashboardView({ orders }: { orders: ShopOrder[] }) {
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const revenue = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'returned')
    .reduce((s, o) => s + (o.total || 0), 0);
  const todayOrders = orders.filter((o) => isToday(o.createdAt)).length;

  // Top cities
  const cityMap: Record<string, number> = {};
  orders.forEach((o) => {
    const city = o.shippingAddress?.city || 'Inconnue';
    cityMap[city] = (cityMap[city] || 0) + 1;
  });
  const topCities = Object.entries(cityMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCityCount = topCities[0]?.[1] || 1;

  // Top products
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach((o) => {
    o.items?.forEach((item) => {
      if (!productMap[item.productId]) {
        productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      }
      productMap[item.productId].qty += item.quantity;
      productMap[item.productId].revenue += item.price * item.quantity;
    });
  });
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Recent 10 orders
  const recentOrders = [...orders].slice(0, 10);

  return (
    <div className="space-y-8 pb-20">
      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Total commandes"
          value={totalOrders}
          icon={<Package className="w-5 h-5" />}
          color="#C8102E"
          sub="Toutes périodes"
        />
        <MetricCard
          title="En attente"
          value={pendingOrders}
          icon={<Clock className="w-5 h-5" />}
          color="#F59E0B"
          sub="À confirmer"
        />
        <MetricCard
          title="Chiffre d'affaires"
          value={formatPrice(revenue)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="#10B981"
          sub="Hors annulations"
        />
        <MetricCard
          title="Aujourd'hui"
          value={todayOrders}
          icon={<Calendar className="w-5 h-5" />}
          color="#8B5CF6"
          sub="Nouvelles commandes"
        />
      </div>

      {/* Quick stats */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top cities */}
        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#C8102E]" />
              Top Villes
            </h3>
            <span className="text-xs text-gray-500">{topCities.length} villes</span>
          </div>
          {topCities.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {topCities.map(([city, count]) => (
                <div key={city} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 font-medium">{city}</span>
                    <span className="text-gray-500">
                      {count} commande{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(count / maxCityCount) * 100}%`,
                        background: 'linear-gradient(90deg, #C8102E, #D4A843)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#D4A843]" />
              Produits les plus commandés
            </h3>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background:
                        i === 0
                          ? '#D4A84320'
                          : i === 1
                          ? '#C8102E15'
                          : '#ffffff08',
                      color:
                        i === 0 ? '#D4A843' : i === 1 ? '#C8102E' : '#6B7280',
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-xs font-medium truncate">{p.name}</p>
                    <p className="text-gray-600 text-xs">{p.qty} unités vendues</p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">
                    {formatPrice(p.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent orders table */}
      <RecentOrdersTable orders={recentOrders} />
    </div>
  );
}

// ─── Recent Orders Table ───────────────────────────────────────────────────────
function RecentOrdersTable({
  orders: initialOrders,
}: {
  orders: ShopOrder[];
}) {
  const [orders, setOrders] = useState<ShopOrder[]>(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  };

  return (
    <div className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Package className="w-4 h-4 text-[#C8102E]" />
          Commandes récentes
        </h3>
        <span className="text-xs text-gray-500">{orders.length} commandes</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              {['N° Commande', 'Client', 'Ville', 'Total', 'Statut', 'Date', 'Actions'].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  Aucune commande
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-4 py-3 font-mono text-gray-300 font-medium whitespace-nowrap">
                    {order.orderNumber}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-gray-200 font-medium whitespace-nowrap">
                        {order.customerName}
                      </p>
                      {order.customerEmail && (
                        <p className="text-gray-600 text-[10px] truncate max-w-[140px]">
                          {order.customerEmail}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {order.shippingAddress?.city || '—'}
                  </td>
                  <td className="px-4 py-3 text-white font-semibold whitespace-nowrap">
                    {formatPrice(order.total)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {order.id && (
                      <StatusDropdown
                        orderId={order.id}
                        currentStatus={order.status}
                        onUpdated={handleStatusUpdate}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Order Detail Drawer ── */}
      {selectedOrder && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-xl bg-[#141414] border-l border-white/10 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#141414] border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-white font-bold text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#C8102E]" />
                  Commande {selectedOrder.orderNumber}
                </h2>
                <p className="text-gray-500 text-xs mt-0.5">{formatDate(selectedOrder.createdAt)}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Status + change */}
              <div className="flex items-center justify-between bg-[#1A1A1A] rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs font-semibold uppercase">Statut</span>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                {selectedOrder.id && (
                  <StatusDropdown
                    orderId={selectedOrder.id}
                    currentStatus={selectedOrder.status}
                    onUpdated={handleStatusUpdate}
                  />
                )}
              </div>

              {/* Customer info */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 space-y-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Client</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#C8102E]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#C8102E] font-bold text-base">
                      {(selectedOrder.customerName || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{selectedOrder.customerName}</p>
                    {selectedOrder.customerEmail && (
                      <p className="text-gray-500 text-xs">{selectedOrder.customerEmail}</p>
                    )}
                  </div>
                </div>
                {/* Phone + WhatsApp */}
                {(selectedOrder.customerPhone || selectedOrder.shippingAddress?.phone) && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-gray-300 font-mono">
                        {selectedOrder.customerPhone || selectedOrder.shippingAddress?.phone}
                      </span>
                    </div>
                    <a
                      href={`https://wa.me/${(selectedOrder.customerPhone || selectedOrder.shippingAddress?.phone || '').replace(/^0/, '212').replace(/[\s\-]/g, '')}?text=${encodeURIComponent(`Bonjour ${selectedOrder.customerName} 👋\n\nConcernant votre commande ${selectedOrder.orderNumber} chez LEBTEX :\n`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/15 text-[#25D366] text-xs font-semibold hover:bg-[#25D366]/25 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>

              {/* Shipping address */}
              {selectedOrder.shippingAddress && (
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 space-y-2">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Adresse de livraison</h3>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[#C8102E] flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-300 space-y-0.5">
                      <p className="font-semibold text-white">{selectedOrder.shippingAddress.fullName}</p>
                      <p>{selectedOrder.shippingAddress.address}</p>
                      <p>
                        {selectedOrder.shippingAddress.city}
                        {selectedOrder.shippingAddress.region && `, ${selectedOrder.shippingAddress.region}`}
                        {selectedOrder.shippingAddress.postalCode && ` ${selectedOrder.shippingAddress.postalCode}`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Articles */}
              <div className="bg-[#1A1A1A] rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Articles ({selectedOrder.items?.reduce((s, i) => s + i.quantity, 0) || 0})
                  </h3>
                </div>
                <div className="divide-y divide-white/5">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3">
                      {item.productImage ? (
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="w-5 h-5 text-gray-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{item.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.variant?.color && (
                            <span className="text-gray-500 text-xs">Couleur: {item.variant.color}</span>
                          )}
                          {item.variant?.size && (
                            <span className="text-gray-500 text-xs">Taille: {item.variant.size}</span>
                          )}
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {item.quantity} × {formatPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-white font-bold text-sm flex-shrink-0">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price breakdown */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 space-y-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Récapitulatif</h3>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Sous-total</span>
                  <span>{formatPrice(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Livraison</span>
                  <span>{selectedOrder.deliveryFee === 0 ? <span className="text-green-400">Gratuite</span> : formatPrice(selectedOrder.deliveryFee)}</span>
                </div>
                {selectedOrder.discount ? (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Réduction{selectedOrder.couponCode ? ` (${selectedOrder.couponCode})` : ''}</span>
                    <span>-{formatPrice(selectedOrder.discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-bold text-white pt-2 border-t border-white/5 text-base">
                  <span>Total</span>
                  <span className="text-[#C8102E]">{formatPrice(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 flex items-center gap-3">
                <DollarSign className="w-4 h-4 text-[#D4A843]" />
                <div>
                  <p className="text-white text-sm font-semibold">
                    {selectedOrder.paymentMethod === 'cod' ? 'Paiement à la livraison (COD)' : selectedOrder.paymentMethod || 'COD'}
                  </p>
                  <p className="text-gray-500 text-xs">💵 Le client paie à la réception</p>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Notes du client</h3>
                  <p className="text-gray-300 text-sm italic">"{selectedOrder.notes}"</p>
                </div>
              )}

              {/* WhatsApp full CTA */}
              <a
                href={`https://wa.me/${(selectedOrder.customerPhone || selectedOrder.shippingAddress?.phone || '').replace(/^0/, '212').replace(/[\s\-]/g, '')}?text=${encodeURIComponent(`Bonjour ${selectedOrder.customerName} 👋\n\nVotre commande ${selectedOrder.orderNumber} chez LEBTEX :\n📦 ${selectedOrder.items?.length || 0} article(s)\n💰 Total: ${formatPrice(selectedOrder.total)}\n\n`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#1da851] transition-colors shadow-lg shadow-[#25D366]/20"
              >
                <MessageCircle className="w-5 h-5" />
                Contacter le client sur WhatsApp
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── All Orders View ───────────────────────────────────────────────────────────
function CommandesView({ orders: initialOrders }: { orders: ShopOrder[] }) {
  const [orders, setOrders] = useState<ShopOrder[]>(initialOrders);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.orderNumber?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.shippingAddress?.city?.toLowerCase().includes(q) ||
      o.customerEmail?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
  };

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par numéro, client, ville…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8102E]/50 transition-colors"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as OrderStatus | 'all')}
          className="px-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#C8102E]/50 transition-colors appearance-none"
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-500">
        {filtered.length} commande{filtered.length !== 1 ? 's' : ''} trouvée{filtered.length !== 1 ? 's' : ''}
      </div>

      <RecentOrdersTable orders={filtered} />
    </div>
  );
}

// ─── Modal: Éditer Catégorie ────────────────────────────────────────────────
function EditCategorieModal({
  category,
  allCategories,
  onClose,
  onUpdated,
}: {
  category: { id: string; slug: string; name: string; image?: string | null; description?: string | null; color?: string; priority?: number; isCustom: boolean; parentSlug?: string | null };
  allCategories: any[];
  onClose: () => void;
  onUpdated: (c: any) => void;
}) {
  const [form, setForm] = useState({
    name: category.name || '',
    image: (category.image as string) || '',
    description: (category.description as string) || '',
    color: category.color || '#C8102E',
    priority: category.priority?.toString() || '0',
    parentSlug: category.parentSlug || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true);
    setError('');
    try {
      const update = {
        name: form.name.trim(),
        image: form.image.trim() || null,
        description: form.description.trim() || null,
        color: form.color,
        priority: parseInt(form.priority) || 0,
        parentSlug: form.parentSlug || null,
      };
      
      if (category.isCustom) {
        // Custom category saved in Firestore — update the document directly
        await setDoc(doc(db, 'shop_custom_categories', category.id), { ...update, slug: category.slug }, { merge: true });
      } else {
        // Built-in category — save an override document
        await setDoc(doc(db, 'shop_category_overrides', category.slug), { ...update, slug: category.slug }, { merge: true });
      }
      onUpdated({ ...category, ...update });
    } catch (err: any) {
      setError('Erreur: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1A1A1A]">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#D4A843]" /> Modifier « {category.name} »
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Nom, Couleur, Priorité */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Catégorie Parente</label>
              <select
                value={form.parentSlug}
                onChange={e => setForm(p => ({ ...p, parentSlug: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              >
                <option value="">Aucune (Catégorie principale)</option>
                {allCategories.filter(c => !c.parentSlug && c.slug !== category.slug).map(c => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Priorité (Tri)</label>
              <input
                type="number"
                value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                placeholder="Ex: 100"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Couleur d'accent</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className="w-10 h-10 p-0 border-0 rounded bg-transparent cursor-pointer"
                />
                <span className="text-gray-400 text-sm font-mono">{form.color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Photo */}
          <ImageUploader
            value={form.image}
            onChange={(url) => setForm(p => ({ ...p, image: url }))}
            folder="shop/categories"
            label="Photo de couverture"
          />

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Description affichée sur la page de la catégorie"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4A843]/60 placeholder-gray-600 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3 sticky bottom-0 bg-[#1A1A1A]">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-all">Annuler</button>
          <button
            onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4A843] text-black text-sm font-semibold hover:bg-[#c49b3a] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Categories View ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function CategoriesView() {
  type CatItem = { id: string; slug: string; name: string; image?: string | null; description?: string | null; color?: string; priority?: number; isCustom: boolean };
  const [customCats, setCustomCats] = useState<CatItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<CatItem>>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CatItem | null>(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_category_overrides')),
    ]).then(([ccSnap, ovSnap]) => {
      setCustomCats(ccSnap.docs.map(d => ({ id: d.id, ...d.data(), isCustom: true } as CatItem)));
      const ov: Record<string, any> = {};
      ovSnap.docs.forEach(d => { ov[d.id] = d.data(); });
      setOverrides(ov);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Merge hardcoded + custom
  const allCats: CatItem[] = [
    ...SHOP_CATEGORIES.map(c => ({
      ...c,
      isCustom: false,
      ...(overrides[c.slug] || {}),
    })),
    ...customCats,
  ].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Catégories</h2>
          <p className="text-gray-500 text-xs mt-0.5">{allCats.length} catégories au total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4A843] text-black text-sm font-semibold hover:bg-[#c49b3a] transition-all"
        >
          <FolderPlus className="w-4 h-4" /> Nouvelle
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px] gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4A843]" />
          <span className="text-gray-400 text-sm">Chargement…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allCats.map(cat => (
            <div
              key={cat.id}
              className={`bg-[#1A1A1A] rounded-2xl overflow-hidden border transition-all hover:border-white/15 ${
                cat.isCustom ? 'border-[#D4A843]/30' : 'border-white/5'
              }`}
            >
              {/* Photo header */}
              <div className="relative h-28 overflow-hidden">
                {cat.image ? (
                  <img src={cat.image as string} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${cat.color || '#C8102E'}40, ${cat.color || '#C8102E'}10)` }}>
                    <span className="text-4xl opacity-30 font-bold" style={{ color: cat.color }}>
                      {cat.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-transparent to-transparent" />
                {cat.isCustom && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold text-[#D4A843] bg-[#0F0F0F]/80 px-1.5 py-0.5 rounded-full">Custom</span>
                )}
              </div>
              {/* Info */}
              <div className="p-4">
                <p className="text-white font-semibold text-sm">{cat.name}</p>
                {cat.parentSlug && (
                  <p className="text-[10px] text-[#D4A843] font-bold mt-0.5 uppercase tracking-wide flex items-center gap-1">
                    ↳ Sous-catégorie de {allCats.find((c: any) => c.slug === cat.parentSlug)?.name || cat.parentSlug}
                  </p>
                )}
                <p className="text-gray-500 text-xs mt-1 line-clamp-2">{cat.description || 'Aucune description'}</p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-gray-600 text-[10px] font-mono">/{cat.slug} · Prio: {cat.priority || 0}</p>
                  <div className="flex items-center gap-2">
                    <a href={`/shop/categorie/${cat.slug}`} target="_blank" className="text-[10px] text-[#D4A843] hover:underline">Voir →</a>
                    <button
                      onClick={() => setEditingCat(cat)}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg transition-all"
                    >
                      <Pencil className="w-3 h-3" /> Modifier
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NouvelleCategorieModal
          allCategories={allCats}
          onClose={() => setShowModal(false)}
          onCreated={cat => { setCustomCats(prev => [...prev, { ...cat, isCustom: true } as CatItem]); setShowModal(false); }}
        />
      )}

      {editingCat && (
        <EditCategorieModal
          category={editingCat}
          allCategories={allCats}
          onClose={() => setEditingCat(null)}
          onUpdated={updated => {
            if (updated.isCustom) {
              setCustomCats(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
            } else {
              setOverrides(prev => ({ ...prev, [updated.slug]: updated }));
            }
            setEditingCat(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Client aggregation type ──────────────────────────────────────────────────
interface AggregatedClient {
  phone: string;
  name: string;
  email: string | null;
  city: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: any;
  lastOrderStatus: OrderStatus;
  orders: ShopOrder[];
}

// ─── Clients View ─────────────────────────────────────────────────────────────
function ClientsView({ orders }: { orders: ShopOrder[] }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'orders' | 'spent' | 'recent'>('recent');
  const [selectedClient, setSelectedClient] = useState<AggregatedClient | null>(null);

  // Aggregate clients from orders by phone number
  const clients = React.useMemo(() => {
    const map = new Map<string, AggregatedClient>();
    for (const order of orders) {
      const phone = order.customerPhone || order.shippingAddress?.phone || '';
      if (!phone) continue;
      const cleanPhone = phone.replace(/[\s\-]/g, '');
      const existing = map.get(cleanPhone);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent += order.total || 0;
        existing.orders.push(order);
        // Keep the latest order info
        const existDate = existing.lastOrderDate?.toDate?.() || new Date(0);
        const orderDate = order.createdAt?.toDate?.() || new Date(0);
        if (orderDate > existDate) {
          existing.lastOrderDate = order.createdAt;
          existing.lastOrderStatus = order.status;
          existing.name = order.customerName || existing.name;
          existing.email = order.customerEmail || existing.email;
          existing.city = order.shippingAddress?.city || existing.city;
        }
      } else {
        map.set(cleanPhone, {
          phone: cleanPhone,
          name: order.customerName || order.shippingAddress?.fullName || '—',
          email: order.customerEmail || null,
          city: order.shippingAddress?.city || '—',
          totalOrders: 1,
          totalSpent: order.total || 0,
          lastOrderDate: order.createdAt,
          lastOrderStatus: order.status,
          orders: [order],
        });
      }
    }
    return Array.from(map.values());
  }, [orders]);

  // Sort
  const sorted = React.useMemo(() => {
    const arr = [...clients];
    if (sortBy === 'orders') arr.sort((a, b) => b.totalOrders - a.totalOrders);
    else if (sortBy === 'spent') arr.sort((a, b) => b.totalSpent - a.totalSpent);
    else {
      arr.sort((a, b) => {
        const da = a.lastOrderDate?.toDate?.() || new Date(0);
        const db2 = b.lastOrderDate?.toDate?.() || new Date(0);
        return db2.getTime() - da.getTime();
      });
    }
    return arr;
  }, [clients, sortBy]);

  // Filter
  const filtered = sorted.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.city.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  // Stats
  const totalClients = clients.length;
  const totalRevenue = clients.reduce((s, c) => s + c.totalSpent, 0);
  const repeatClients = clients.filter((c) => c.totalOrders > 1).length;
  const topCity = clients.reduce((acc, c) => {
    acc[c.city] = (acc[c.city] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCityName = Object.entries(topCity).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  return (
    <div className="space-y-5 pb-20">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Total clients"
          value={totalClients}
          icon={<Users className="w-5 h-5" />}
          color="#C8102E"
        />
        <MetricCard
          title="Clients fidèles"
          value={repeatClients}
          sub={`${totalClients > 0 ? Math.round((repeatClients / totalClients) * 100) : 0}% du total`}
          icon={<Star className="w-5 h-5" />}
          color="#D4A843"
        />
        <MetricCard
          title="Chiffre d'affaires"
          value={formatPrice(totalRevenue)}
          icon={<DollarSign className="w-5 h-5" />}
          color="#10B981"
        />
        <MetricCard
          title="Ville principale"
          value={topCityName}
          sub={`${topCity[topCityName] || 0} clients`}
          icon={<MapPin className="w-5 h-5" />}
          color="#3B82F6"
        />
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, ville, email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8102E]/50 transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#C8102E]/50 transition-colors appearance-none"
        >
          <option value="recent">Plus récent</option>
          <option value="orders">Plus de commandes</option>
          <option value="spent">Plus gros CA</option>
        </select>
      </div>

      <p className="text-xs text-gray-500">
        {filtered.length} client{filtered.length !== 1 ? 's' : ''} trouvé{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Users className="w-10 h-10 text-gray-600" />
          <p className="text-gray-400 text-sm font-medium">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden">
          {/* Header (desktop) */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3 border-b border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">Client</div>
            <div className="col-span-2">Téléphone</div>
            <div className="col-span-2">Ville</div>
            <div className="col-span-1 text-center">Cmd</div>
            <div className="col-span-2 text-right">Total dépensé</div>
            <div className="col-span-2 text-right">Dernière cmd</div>
          </div>

          {filtered.map((client) => {
            const lastDate = client.lastOrderDate?.toDate
              ? client.lastOrderDate.toDate().toLocaleDateString('fr-MA', {
                  day: '2-digit',
                  month: 'short',
                })
              : '—';
            const statusColor = ORDER_STATUS_COLORS[client.lastOrderStatus] || '#6B7280';

            return (
              <button
                key={client.phone}
                onClick={() => setSelectedClient(client)}
                className="w-full text-left hover:bg-white/3 transition-colors border-b border-white/5 last:border-0"
              >
                {/* Desktop row */}
                <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3.5 items-center">
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#C8102E]/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#C8102E] font-bold text-sm">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{client.name}</p>
                      {client.email && (
                        <p className="text-gray-600 text-xs truncate">{client.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-gray-300 text-sm font-mono">{client.phone}</div>
                  <div className="col-span-2 text-gray-400 text-sm">{client.city}</div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                      client.totalOrders > 1
                        ? 'bg-[#D4A843]/15 text-[#D4A843]'
                        : 'bg-white/5 text-gray-400'
                    }`}>
                      {client.totalOrders}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-white font-semibold text-sm">
                    {formatPrice(client.totalSpent)}
                  </div>
                  <div className="col-span-2 text-right flex items-center justify-end gap-2">
                    <span className="text-gray-400 text-xs">{lastDate}</span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusColor }}
                    />
                  </div>
                </div>

                {/* Mobile card */}
                <div className="lg:hidden px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#C8102E]/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#C8102E] font-bold text-base">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{client.name}</p>
                      <p className="text-gray-500 text-xs">{client.phone} · {client.city}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white text-sm font-bold">{formatPrice(client.totalSpent)}</p>
                      <p className="text-gray-500 text-xs">
                        {client.totalOrders} cmd{client.totalOrders > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Client detail drawer */}
      {selectedClient && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedClient(null)}
          />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-[#141414] border-l border-white/10 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#141414] border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C8102E]/15 flex items-center justify-center">
                  <span className="text-[#C8102E] font-bold text-lg">
                    {selectedClient.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-white font-bold text-base">{selectedClient.name}</h2>
                  <p className="text-gray-500 text-xs">{selectedClient.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Client stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1A1A1A] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-xl font-bold text-white">{selectedClient.totalOrders}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Commandes</p>
                </div>
                <div className="bg-[#1A1A1A] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-xl font-bold text-[#D4A843]">{formatPrice(selectedClient.totalSpent)}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Total</p>
                </div>
                <div className="bg-[#1A1A1A] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-xl font-bold text-white">{formatPrice(Math.round(selectedClient.totalSpent / selectedClient.totalOrders))}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Panier moy.</p>
                </div>
              </div>

              {/* Client info */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 space-y-2.5">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Informations</h3>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-gray-300 font-mono">{selectedClient.phone}</span>
                </div>
                {selectedClient.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-300">{selectedClient.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-gray-300">{selectedClient.city}</span>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <a
                href={`https://wa.me/${selectedClient.phone.startsWith('0') ? '212' + selectedClient.phone.slice(1) : selectedClient.phone}?text=${encodeURIComponent(`Bonjour ${selectedClient.name} 👋\n\nMerci pour votre commande chez LEBTEX !\n`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#1da851] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Contacter sur WhatsApp
              </a>

              {/* Orders list */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Historique des commandes ({selectedClient.orders.length})
                </h3>
                <div className="space-y-2.5">
                  {selectedClient.orders
                    .sort((a, b) => {
                      const da = a.createdAt?.toDate?.() || new Date(0);
                      const db2 = b.createdAt?.toDate?.() || new Date(0);
                      return db2.getTime() - da.getTime();
                    })
                    .map((order) => {
                      const oDate = order.createdAt?.toDate
                        ? order.createdAt.toDate().toLocaleDateString('fr-MA', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—';
                      const oColor = ORDER_STATUS_COLORS[order.status] || '#6B7280';
                      const oLabel = ORDER_STATUS_LABELS[order.status] || order.status;
                      const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) || 0;
                      return (
                        <div
                          key={order.id}
                          className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono text-xs font-bold">{order.orderNumber}</span>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: `${oColor}18`, color: oColor }}
                              >
                                {oLabel}
                              </span>
                            </div>
                            <span className="text-gray-500 text-xs">{oDate}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-xs">
                              {itemCount} article{itemCount > 1 ? 's' : ''}
                            </span>
                            <span className="text-white font-bold text-sm">{formatPrice(order.total)}</span>
                          </div>
                          {/* Items preview */}
                          {order.items && order.items.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                              {order.items.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500 truncate max-w-[200px]">
                                    {item.quantity}× {item.productName}
                                  </span>
                                  <span className="text-gray-400">{formatPrice(item.price * item.quantity)}</span>
                                </div>
                              ))}
                              {order.items.length > 3 && (
                                <p className="text-[10px] text-gray-600">
                                  +{order.items.length - 3} autre{order.items.length - 3 > 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Placeholder views ─────────────────────────────────────────────────────────
function ComingSoonView({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-gray-500">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-gray-300 font-semibold">{title}</p>
        <p className="text-gray-600 text-sm mt-1">Section en cours de développement</p>
      </div>
    </div>
  );
}

// ─── Products View ─────────────────────────────────────────────────────────────
function ProduitsView() {
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>({});
  const [customProducts, setCustomProducts] = useState<ShopProduct[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductOverride>({});
  type EditStockStatus = 'available' | 'limited' | 'out_of_stock';
  const EDIT_PRESET_COLORS = [
    { name: 'Noir', hex: '#1a1a1a' }, { name: 'Blanc', hex: '#f5f5f5' },
    { name: 'Rouge', hex: '#e53e3e' }, { name: 'Bleu', hex: '#3182ce' },
    { name: 'Vert', hex: '#38a169' }, { name: 'Jaune', hex: '#d69e2e' },
    { name: 'Orange', hex: '#dd6b20' }, { name: 'Rose', hex: '#d53f8c' },
    { name: 'Violet', hex: '#805ad5' }, { name: 'Marron', hex: '#92400e' },
    { name: 'Gris', hex: '#718096' }, { name: 'Beige', hex: '#d4b896' },
    { name: 'Doré', hex: '#D4A843' }, { name: 'Argenté', hex: '#a0aec0' },
  ];
  const EDIT_STOCK_STATUS: Record<EditStockStatus, { label: string; stock: number }> = {
    available: { label: '✓ Disponible', stock: 999 },
    limited: { label: '⚡ Stock limité', stock: 5 },
    out_of_stock: { label: '✗ Rupture', stock: 0 },
  };
  const stockToStatus = (stock: number): EditStockStatus =>
    stock === 0 ? 'out_of_stock' : stock <= 10 ? 'limited' : 'available';
  const [editVariants, setEditVariants] = useState<Array<{ id: string; color: string; colorHex: string; image?: string; size: string; stockStatus: EditStockStatus; price: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showNewProductModal, setShowNewProductModal] = useState(false);

  const [allCategoriesLocal, setAllCategoriesLocal] = useState<Array<{ slug: string; name: string; icon?: string; priority?: number }>>(SHOP_CATEGORIES);

  // Load overrides + custom products + custom categories from Firestore
  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'shop_product_overrides')),
      getDocs(collection(db, 'shop_custom_products')),
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_category_overrides')),
    ]).then(([ovSnap, cpSnap, ccSnap, catOverSnap]) => {
      const ov: Record<string, ProductOverride> = {};
      ovSnap.docs.forEach(d => { ov[d.id] = d.data() as ProductOverride; });
      setOverrides(ov);
      setCustomProducts(cpSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct)));
      
      // Build overrides map for base categories
      const catOverrides: Record<string, any> = {};
      catOverSnap.docs.forEach(d => { catOverrides[d.id] = d.data(); });
      
      // Merge base categories with their overrides
      const mergedBase = SHOP_CATEGORIES.map(c => ({ ...c, ...(catOverrides[c.slug] || {}) }));
      
      // Add custom categories (not already in base)
      const existingSlugs = new Set(SHOP_CATEGORIES.map(c => c.slug));
      const customCats = ccSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((c: any) => !existingSlugs.has(c.slug));
      
      // Combine and sort by priority
      const allCats = [...mergedBase, ...customCats].sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
      setAllCategoriesLocal(allCats);
    }).catch(() => {}).finally(() => setLoadingOverrides(false));
  }, []);

  // Get merged product (hardcoded + override)
  const getMergedProduct = (p: ShopProduct): ShopProduct => {
    const ov = overrides[p.id];
    if (!ov) return p;
    return { ...p, ...ov } as ShopProduct;
  };

  // Filter products (hardcoded + custom)
  const allProducts = [
    ...SHOP_PRODUCTS_DATA,
    ...customProducts.filter(cp => !SHOP_PRODUCTS_DATA.find(p => p.id === cp.id)),
  ];
  const filteredProducts = allProducts.filter(p => {
    const merged = getMergedProduct(p);
    if ((overrides[p.id] as any)?.hidden) return false; // skip hidden products
    const matchCategory = filterCategory === 'all' || p.categorySlug === filterCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || merged.name.toLowerCase().includes(q) || (merged.categoryName || '').toLowerCase().includes(q);
    return matchCategory && matchSearch;
  });

  const startEdit = (product: ShopProduct) => {
    const merged = getMergedProduct(product);
    setEditingId(product.id);
    setEditForm({
      name: merged.name,
      categorySlug: merged.categorySlug,
      shortDescription: merged.shortDescription || '',
      description: merged.description || '',
      price: merged.price,
      comparePrice: merged.comparePrice || undefined,
      images: [...merged.images],
      isFeatured: merged.isFeatured || false,
      isNew: merged.isNew || false,
      isPromo: merged.isPromo || false,
      inStock: merged.inStock,
      stockQty: merged.stockQty,
    });
    // Initialize variant editor from current product variants
    setEditVariants((merged.variants || []).map(v => ({
      id: v.id,
      color: v.color || '',
      colorHex: v.colorHex || '#C8102E',
      image: v.image || '',
      size: v.size || '',
      stockStatus: stockToStatus(v.stock ?? 999),
      price: v.price?.toString() || '',
    })));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditVariants([]);
  };

  const saveEdit = async (productId: string) => {
    setSaving(true);
    try {
      // Build variants with clean objects (no undefined)
      const builtVariants = editVariants
        .map((v, i) => {
          const s = EDIT_STOCK_STATUS[v.stockStatus];
          const colorName = v.color.trim() || `Couleur ${i + 1}`;
          const obj: Record<string, unknown> = {
            id: v.id,
            stock: s.stock,
            inStock: s.stock > 0,
            color: colorName,
            colorHex: v.colorHex || '#C8102E',
          };
          if (v.size) obj.size = v.size;
          if (v.image) obj.image = v.image;
          if (v.price) obj.price = parseFloat(v.price);
          return obj;
        });

      // Build override without undefined values
      const base: Record<string, unknown> = {};
      if (editForm.name?.trim()) base.name = editForm.name.trim();
      if (editForm.categorySlug?.trim()) base.categorySlug = editForm.categorySlug.trim();
      if (editForm.shortDescription !== undefined) base.shortDescription = editForm.shortDescription;
      if (editForm.description !== undefined) base.description = editForm.description;
      if (editForm.price !== undefined) base.price = editForm.price;
      if (editForm.comparePrice !== undefined) base.comparePrice = editForm.comparePrice;
      if (editForm.images) base.images = editForm.images;
      if (editForm.isFeatured !== undefined) base.isFeatured = editForm.isFeatured;
      if (editForm.isNew !== undefined) base.isNew = editForm.isNew;
      if (editForm.isPromo !== undefined) base.isPromo = editForm.isPromo;
      base.variants = builtVariants;
      if (builtVariants.length > 0) {
        base.inStock = builtVariants.some((v: any) => v.stock > 0);
        base.stockQty = builtVariants.reduce((s: number, v: any) => s + v.stock, 0);
      } else {
        if (editForm.inStock !== undefined) base.inStock = editForm.inStock;
        if (editForm.stockQty !== undefined) base.stockQty = editForm.stockQty;
      }
      // Champs fiche produit
      if ((editForm as any).material) base.material = (editForm as any).material;
      if ((editForm as any).specification) base.specification = (editForm as any).specification;
      if ((editForm as any).weight) base.weight = parseFloat((editForm as any).weight) || undefined;
      if ((editForm as any).width) base.width = (editForm as any).width;
      if ((editForm as any).packaging) base.packaging = (editForm as any).packaging;

      await setDoc(doc(db, 'shop_product_overrides', productId), base, { merge: true });
      setOverrides(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), ...base } as any }));
      setEditingId(null);
      setEditVariants([]);
      setSavedId(productId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      console.error('Error saving override:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateEditImage = (index: number, url: string) => {
    const imgs = [...(editForm.images || [])];
    imgs[index] = url;
    setEditForm(prev => ({ ...prev, images: imgs }));
  };

  const addEditImage = () => {
    setEditForm(prev => ({ ...prev, images: [...(prev.images || []), ''] }));
  };

  const removeEditImage = (index: number) => {
    const imgs = [...(editForm.images || [])];
    imgs.splice(index, 1);
    setEditForm(prev => ({ ...prev, images: imgs }));
  };

  const deleteProduct = async (productId: string, productName: string, isCustom: boolean) => {
    if (!confirm(`⚠️ Supprimer "${productName}" ?

Cette action est irréversible.`)) return;
    try {
      if (isCustom) {
        // Custom product: delete entirely from Firestore
        await deleteDoc(doc(db, 'shop_custom_products', productId));
        try { await deleteDoc(doc(db, 'shop_product_overrides', productId)); } catch (_) {}
        setCustomProducts(prev => prev.filter(p => p.id !== productId));
      } else {
        // Hardcoded product: mark as hidden in overrides
        await setDoc(doc(db, 'shop_product_overrides', productId), { hidden: true }, { merge: true });
        setOverrides(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), hidden: true } as any }));
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Erreur lors de la suppression.');
    }
  };

  if (loadingOverrides) {
    return (
      <div className="flex items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#C8102E]" />
        <span className="text-gray-400 text-sm">Chargement des produits…</span>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-5 pb-24">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher un produit…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8102E]/50 transition-colors"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#C8102E]/50 transition-colors appearance-none"
        >
          <option value="all">Toutes les catégories</option>
          {allCategoriesLocal.map(c => (
            <option key={c.slug} value={c.slug}>{c.icon || ''} {c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-600 hidden sm:block">💡 Modifications instantanées sur la boutique</p>
          <button
            onClick={() => setShowNewProductModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8102E] text-white text-xs font-semibold hover:bg-[#a50d25] transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Nouveau produit
          </button>
        </div>
      </div>

      {/* Products list */}
      <div className="space-y-3">
        {filteredProducts.map(product => {
          const merged = getMergedProduct(product);
          const isEditing = editingId === product.id;
          const justSaved = savedId === product.id;
          const hasOverride = !!overrides[product.id];
          const isCustom = customProducts.some(cp => cp.id === product.id);

          return (
            <div
              key={product.id}
              className={`bg-[#1A1A1A] rounded-2xl border transition-all ${
                isEditing ? 'border-[#C8102E]/50 ring-1 ring-[#C8102E]/20' :
                justSaved ? 'border-emerald-500/50' :
                isCustom ? 'border-[#C8102E]/25' :
                hasOverride ? 'border-[#D4A843]/30' : 'border-white/5'
              }`}
            >
              <div className="p-4 flex gap-4">
                {/* Image */}
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
                  {merged.images[0] ? (
                    <img src={merged.images[0]} alt={merged.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white text-sm font-semibold truncate">{merged.name}</p>
                      <p className="text-gray-500 text-xs">
                        {merged.categoryName} · {product.id}
                        {isCustom && <span className="ml-1.5 text-[9px] font-bold text-[#C8102E] bg-[#C8102E]/10 px-1.5 py-0.5 rounded-full">Nouveau</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasOverride && !isEditing && (
                        <span className="text-[10px] font-bold text-[#D4A843] bg-[#D4A843]/10 px-2 py-0.5 rounded-full">Modifié</span>
                      )}
                      {justSaved && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Sauvegardé
                        </span>
                      )}
                      {!isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(product)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-all"
                          >
                            <Pencil className="w-3 h-3" /> Modifier
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id, merged.name, isCustom)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-medium transition-all"
                            title="Supprimer ce produit"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white text-xs font-medium transition-all"
                          >
                            <X className="w-3 h-3" /> Annuler
                          </button>
                          <button
                            onClick={() => saveEdit(product.id)}
                            disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C8102E] text-white text-xs font-semibold hover:bg-[#a50d25] transition-all disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Sauvegarder
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Current values (display mode) */}
                  {!isEditing && (
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-white font-bold text-sm">{formatPrice(merged.price)}</span>
                      {merged.comparePrice && (
                        <span className="text-gray-500 text-xs line-through">{formatPrice(merged.comparePrice)}</span>
                      )}
                      <div className="flex gap-1.5 ml-auto">
                        {merged.isFeatured && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">⭐ Vedette</span>}
                        {merged.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">✨ Nouveau</span>}
                        {merged.isPromo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">🏷️ Promo</span>}
                        {!merged.inStock && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">Rupture</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Edit form */}
              {isEditing && (
                <div className="px-4 pb-4 pt-0 border-t border-white/5 mt-0">
                  {/* Text fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 mb-4 border-b border-white/5 pb-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nom du produit</label>
                      <input type="text" value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[#C8102E]/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Catégorie</label>
                      <select value={editForm.categorySlug || ''} onChange={e => setEditForm(p => ({ ...p, categorySlug: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-[#111] border border-white/10 text-white text-sm outline-none focus:border-[#C8102E]/50">
                        {allCategoriesLocal.map(c => <option key={c.slug} value={c.slug}>{c.icon || ''} {c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description courte</label>
                      <input type="text" value={editForm.shortDescription || ''} onChange={e => setEditForm(p => ({ ...p, shortDescription: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[#C8102E]/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description complète</label>
                      <textarea value={editForm.description || ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[#C8102E]/50 resize-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    {/* Price */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Prix (MAD)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={editForm.price || ''}
                        onChange={e => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-bold focus:outline-none focus:border-[#C8102E]/50"
                      />
                    </div>

                    {/* Compare Price */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Ancien prix (barré)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={editForm.comparePrice || ''}
                        onChange={e => setEditForm(prev => ({ ...prev, comparePrice: parseFloat(e.target.value) || null }))}
                        placeholder="Laisser vide si pas de promo"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/50 placeholder-gray-600"
                      />
                    </div>

                    {/* Stock */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock</label>
                      <input
                        type="number"
                        value={editForm.stockQty || ''}
                        onChange={e => setEditForm(prev => ({ ...prev, stockQty: parseInt(e.target.value) || 0, inStock: (parseInt(e.target.value) || 0) > 0 }))}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/50"
                      />
                    </div>

                    {/* Toggles */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Badges</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'isFeatured', label: '⭐ Vedette', color: 'amber' },
                          { key: 'isNew', label: '✨ Nouveau', color: 'emerald' },
                          { key: 'isPromo', label: '🏷️ Promo', color: 'red' },
                        ].map(({ key, label, color }) => (
                          <button
                            key={key}
                            onClick={() => setEditForm(prev => ({ ...prev, [key]: !(prev as any)[key] }))}
                            className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-all border ${
                              (editForm as any)[key]
                                ? `bg-${color}-500/20 text-${color}-400 border-${color}-500/30`
                                : 'bg-white/5 text-gray-500 border-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Images */}
                  <div className="mt-4">
                    <MultiImageUploader
                      images={editForm.images || []}
                      onChange={(imgs) => setEditForm(prev => ({ ...prev, images: imgs }))}
                      folder="shop/products"
                    />
                  </div>

                  {/* Couleurs */}
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Couleurs disponibles</label>
                      <button
                        type="button"
                        onClick={() => setEditVariants(v => [...v, { id: `v_${Date.now()}`, color: '', colorHex: '#C8102E', stockStatus: 'available', price: '' }])}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A843]/20 text-[#D4A843] text-xs font-semibold hover:bg-[#D4A843]/30 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ajouter une couleur
                      </button>
                    </div>
                    {editVariants.length === 0 && (
                      <p className="text-xs text-gray-600 py-2 px-3 rounded-lg bg-white/3 border border-white/5">
                        Pas de couleurs — stock et prix unique.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {editVariants.map(v => (
                        <div key={v.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <MiniImageUploader value={v.image} onChange={url => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, image: url } : x))} />
                            <input type="color" value={v.colorHex}
                              onChange={e => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, colorHex: e.target.value } : x))}
                              className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent flex-shrink-0" style={{ padding: '1px' }}
                            />
                            <input type="text" value={v.color}
                              onChange={e => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, color: e.target.value } : x))}
                              placeholder="Couleur (opt.)"
                              className="w-24 flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600 min-w-0"
                            />
                            <input type="text" value={v.size}
                              onChange={e => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, size: e.target.value } : x))}
                              placeholder="Taille (opt.)"
                              className="w-24 flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600 min-w-0 border-l border-white/10 pl-2"
                            />
                            <select
                              value={v.stockStatus}
                              onChange={e => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, stockStatus: e.target.value as EditStockStatus } : x))}
                              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#C8102E]/50 cursor-pointer"
                              style={{ color: v.stockStatus === 'available' ? '#10B981' : v.stockStatus === 'limited' ? '#D4A843' : '#ef4444' }}
                            >
                              <option value="available" style={{ color: '#10B981', background: '#1a1a1a' }}>✓ Disponible</option>
                              <option value="limited" style={{ color: '#D4A843', background: '#1a1a1a' }}>⚡ Stock limité</option>
                              <option value="out_of_stock" style={{ color: '#ef4444', background: '#1a1a1a' }}>✗ Rupture</option>
                            </select>
                            <input type="number" value={v.price}
                              onChange={e => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, price: e.target.value } : x))}
                              placeholder={editForm.price?.toString() || 'Prix'}
                              className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-center outline-none focus:border-[#C8102E]/50"
                            />
                            <button onClick={() => setEditVariants(ev => ev.filter(x => x.id !== v.id))} className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Preset color chips */}
                          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                            {EDIT_PRESET_COLORS.map(c => (
                              <button
                                key={c.name}
                                onClick={() => setEditVariants(ev => ev.map(x => x.id === v.id ? { ...x, color: c.name, colorHex: c.hex } : x))}
                                title={c.name}
                                className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${v.color === c.name ? 'border-white scale-110' : 'border-transparent'}`}
                                style={{ background: c.hex }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ─── Fiche technique ─── */}
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <p className="text-[10px] font-bold text-[#D4A843] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <span>📋</span> Fiche technique
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: 'material',      label: '🧵 Matériau',      placeholder: 'Ex: Nylon, Polyester...' },
                        { key: 'specification', label: '📐 Spécification',  placeholder: 'Ex: NO5, ISO 9001...' },
                        { key: 'width',         label: '↔️ Largeur',        placeholder: 'Ex: 5 cm, 120mm...' },
                        { key: 'packaging',     label: '📦 Emballage',      placeholder: 'Ex: Sachet 100 pcs...' },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key} className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
                          <input
                            type="text"
                            value={(editForm as any)[key] || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4A843]/50 placeholder-gray-600"
                          />
                        </div>
                      ))}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">⚖️ Poids (g)</label>
                        <input
                          type="number" min="0"
                          value={(editForm as any).weight || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, weight: e.target.value }))}
                          placeholder="Ex: 250"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4A843]/50 placeholder-gray-600"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* Modal Nouveau Produit */}
    {showNewProductModal && (
      <NouveauProduitModal
        allCategories={allCategoriesLocal}
        onClose={() => setShowNewProductModal(false)}
        onCreated={product => {
          setCustomProducts(prev => [...prev, product]);
          setShowNewProductModal(false);
        }}
      />
    )}
    </>
  );
}

// ─── Modal: Nouveau Produit ───────────────────────────────────────────────────
function NouveauProduitModal({
  onClose,
  onCreated,
  allCategories,
}: {
  onClose: () => void;
  onCreated: (p: ShopProduct) => void;
  allCategories: Array<{ slug: string; name: string; icon?: string }>;
}) {
  const [form, setForm] = useState({
    name: '',
    shortDescription: '',
    description: '',
    categorySlug: allCategories[0]?.slug || '',
    price: '',
    comparePrice: '',
    stockQty: '0',
    images: ['', '', ''],
    tags: '',
    isFeatured: false,
    isNew: true,
    isPromo: false,
    minOrderQty: '1',
    // Fiche technique
    material: '',
    specification: '',
    weight: '',
    width: '',
    packaging: '',
  });
  type StockStatus = 'available' | 'limited' | 'out_of_stock';
  type VariantForm = { id: string; color: string; colorHex: string; image?: string; size: string; stockStatus: StockStatus; price: string };
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PRESET_COLORS = [
    { name: 'Noir', hex: '#1a1a1a' }, { name: 'Blanc', hex: '#f5f5f5' },
    { name: 'Rouge', hex: '#e53e3e' }, { name: 'Bleu', hex: '#3182ce' },
    { name: 'Vert', hex: '#38a169' }, { name: 'Jaune', hex: '#d69e2e' },
    { name: 'Orange', hex: '#dd6b20' }, { name: 'Rose', hex: '#d53f8c' },
    { name: 'Violet', hex: '#805ad5' }, { name: 'Marron', hex: '#92400e' },
    { name: 'Gris', hex: '#718096' }, { name: 'Beige', hex: '#d4b896' },
    { name: 'Doré', hex: '#D4A843' }, { name: 'Argenté', hex: '#a0aec0' },
  ];
  const STOCK_STATUS: Record<StockStatus, { label: string; stock: number; color: string }> = {
    available: { label: 'Disponible', stock: 999, color: '#10B981' },
    limited: { label: 'Stock limité', stock: 5, color: '#D4A843' },
    out_of_stock: { label: 'Rupture', stock: 0, color: '#ef4444' },
  };

  const addVariant = () => setVariants(v => [
    ...v,
    { id: `v_${Date.now()}`, color: '', colorHex: '#C8102E', size: '', stockStatus: 'available', price: '' },
  ]);
  const removeVariant = (id: string) => setVariants(v => v.filter(x => x.id !== id));
  const updateVariant = <K extends keyof VariantForm>(id: string, field: K, val: VariantForm[K]) =>
    setVariants(v => v.map(x => x.id === id ? { ...x, [field]: val } : x));
  const applyPresetColor = (variantId: string, name: string, hex: string) => {
    setVariants(v => v.map(x => x.id === variantId ? { ...x, color: name, colorHex: hex } : x));
  };

  // Clean builder — never sends undefined to Firestore, auto-generates color name if empty
  const buildVariant = (v: VariantForm, index: number) => {
    const s = STOCK_STATUS[v.stockStatus];
    const colorName = v.color.trim();
    const sizeName = v.size.trim();
    const finalColorName = (!colorName && !sizeName) ? `Option ${index + 1}` : colorName;

    const obj: Record<string, unknown> = {
      id: v.id,
      stock: s.stock,
      inStock: s.stock > 0,
      ...(finalColorName && { color: finalColorName, colorHex: v.colorHex || '#C8102E' }),
      ...(sizeName && { size: sizeName }),
    };
    if (v.image) obj.image = v.image;
    if (v.price) obj.price = parseFloat(v.price);
    return obj;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Le nom est requis'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Le prix est requis'); return; }
    if (!form.categorySlug) { setError('La catégorie est requise'); return; }
    setSaving(true);
    setError('');
    try {
      const cat = allCategories.find(c => c.slug === form.categorySlug);
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const builtVariants = variants
        .map((v, i) => buildVariant(v, i));

      const product = {
        id,
        slug,
        name: form.name.trim(),
        description: form.description.trim() || form.name,
        categorySlug: form.categorySlug,
        categoryName: cat?.name || form.categorySlug,
        images: form.images.filter(Boolean),
        price: parseFloat(form.price),
        inStock: builtVariants.length > 0
          ? builtVariants.some((v: any) => v.stock > 0)
          : parseInt(form.stockQty) > 0,
        stockQty: builtVariants.length > 0
          ? builtVariants.reduce((s: number, v: any) => s + v.stock, 0)
          : parseInt(form.stockQty) || 0,
        variants: builtVariants,
        tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        isFeatured: form.isFeatured,
        isNew: form.isNew,
        isPromo: form.isPromo,
        rating: 5,
        reviewCount: 0,
        minOrderQty: parseInt(form.minOrderQty) || 1,
        // Only include optional fields when they have values
        ...(form.shortDescription.trim() ? { shortDescription: form.shortDescription.trim() } : {}),
        ...(form.comparePrice ? { comparePrice: parseFloat(form.comparePrice) } : {}),
        // Fiche technique
        ...(form.material.trim() ? { material: form.material.trim() } : {}),
        ...(form.specification.trim() ? { specification: form.specification.trim() } : {}),
        ...(form.weight ? { weight: parseFloat(form.weight) } : {}),
        ...(form.width.trim() ? { width: form.width.trim() } : {}),
        ...(form.packaging.trim() ? { packaging: form.packaging.trim() } : {}),
      };
      await setDoc(doc(db, 'shop_custom_products', id), product);
      const imgCount = (product.images as string[]).length;
      const colorCount = (product.variants as any[]).length;
      onCreated(product);
      alert(`✅ Produit enregistré !\n📷 ${imgCount} image${imgCount !== 1 ? 's' : ''}\n🎨 ${colorCount} couleur${colorCount !== 1 ? 's' : ''}\n\nIl apparaîtra dans la boutique dans quelques secondes.`);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1A1A1A] px-6 py-4 border-b border-white/10 flex items-center justify-between z-10">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#C8102E]" /> Nouveau Produit
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Nom + Catégorie */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nom du produit *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Fermeture Nylon NO5 30cm"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Catégorie *</label>
              <select
                value={form.categorySlug}
                onChange={e => setForm(p => ({ ...p, categorySlug: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 appearance-none"
              >
                {allCategories.map(c => (
                  <option key={c.slug} value={c.slug}>{c.icon || ''} {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description courte */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description courte</label>
            <input
              type="text"
              value={form.shortDescription}
              onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
              placeholder="Résumé en 1 ligne"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description complète</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Description détaillée du produit..."
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600 resize-none"
            />
          </div>

          {/* ─── Fiche technique ─── */}
          <div className="pt-2">
            <p className="text-[10px] font-bold text-[#D4A843] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span>📋</span> Fiche technique
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'material',      label: '🧵 Matériau',      placeholder: 'Ex: Nylon, Polyester...' },
                { key: 'specification', label: '📐 Spécification',  placeholder: 'Ex: NO5, ISO 9001...' },
                { key: 'width',         label: '↔️ Largeur',        placeholder: 'Ex: 5 cm, 120mm...' },
                { key: 'packaging',     label: '📦 Emballage',      placeholder: 'Ex: Sachet 100 pcs...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
                  <input
                    type="text"
                    value={(form as any)[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4A843]/60 placeholder-gray-600"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">⚖️ Poids (g)</label>
                <input
                  type="number" min="0"
                  value={form.weight}
                  onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
                  placeholder="Ex: 250"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4A843]/60 placeholder-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Prix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Prix (MAD) *</label>
              <input
                type="number" step="0.5" min="0"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-bold focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ancien prix (barré)</label>
              <input
                type="number" step="0.5" min="0"
                value={form.comparePrice}
                onChange={e => setForm(p => ({ ...p, comparePrice: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock</label>
              <input
                type="number" min="0"
                value={form.stockQty}
                onChange={e => setForm(p => ({ ...p, stockQty: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Qté min.</label>
              <input
                type="number" min="1"
                value={form.minOrderQty}
                onChange={e => setForm(p => ({ ...p, minOrderQty: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tags (séparés par virgule)</label>
            <input
              type="text"
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              placeholder="nylon, fermeture, no5"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
            />
          </div>

          {/* Images */}
          <MultiImageUploader
            images={form.images}
            onChange={(imgs) => setForm(p => ({ ...p, images: imgs }))}
            folder="shop/products"
          />

          {/* Badges */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Badges</label>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'isFeatured', label: '⭐ Vedette' },
                { key: 'isNew', label: '✨ Nouveau' },
                { key: 'isPromo', label: '🏷️ Promo' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setForm(p => ({ ...p, [key]: !(p as any)[key] }))}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                    (form as any)[key]
                      ? 'bg-[#C8102E]/20 text-[#ff6b6b] border-[#C8102E]/40'
                      : 'bg-white/5 text-gray-500 border-white/10 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Couleurs par Taille ───────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Variantes (Tailles & Couleurs)</label>
              <button
                type="button"
                onClick={() => {
                  const size = prompt("Nom de la nouvelle taille (laissez vide pour une taille standard) :", "");
                  if (size !== null) {
                    setVariants(v => [...v, { id: `v_${Date.now()}`, color: '', colorHex: '#C8102E', size: size.trim(), stockStatus: 'available', price: '' }]);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A843]/20 text-[#D4A843] text-xs font-semibold hover:bg-[#D4A843]/30 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter une taille
              </button>
            </div>

            {variants.length === 0 && (
              <p className="text-xs text-gray-600 py-2 px-3 rounded-lg bg-white/3 border border-white/5">
                Pas de variantes — stock et prix unique pour ce produit.
              </p>
            )}

            {Object.entries(
              variants.reduce((acc, v) => {
                const s = v.size || '';
                if (!acc[s]) acc[s] = [];
                acc[s].push(v);
                return acc;
              }, {} as Record<string, typeof variants>)
            ).map(([size, vars]) => (
              <div key={size} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-[#D4A843] text-xs uppercase tracking-wider">
                    {size ? `Taille : ${size}` : 'Taille Standard (Par défaut)'}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setVariants(v => [...v, { id: `v_${Date.now()}`, color: '', colorHex: '#C8102E', size, stockStatus: 'available', price: '' }])}
                      className="text-xs text-[#C8102E] hover:underline font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Ajouter Couleur
                    </button>
                    <button
                      onClick={() => setVariants(v => v.filter(x => (x.size || '') !== size))}
                      className="text-xs text-gray-500 hover:text-red-400 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Supprimer Taille
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {vars.map(v => (
                    <div key={v.id} className="rounded-xl bg-[#111] border border-white/5 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <MiniImageUploader value={v.image} onChange={url => updateVariant(v.id, 'image', url)} />
                        <input
                          type="color"
                          value={v.colorHex}
                          onChange={e => updateVariant(v.id, 'colorHex', e.target.value)}
                          title="Choisir couleur"
                          className="w-8 h-8 rounded-full cursor-pointer border-0 flex-shrink-0 bg-transparent"
                          style={{ padding: '1px' }}
                        />
                        <input
                          type="text"
                          value={v.color}
                          onChange={e => updateVariant(v.id, 'color', e.target.value)}
                          placeholder="Couleur (opt.)"
                          className="w-24 flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600 min-w-0"
                        />
                        <select
                          value={v.stockStatus}
                          onChange={e => updateVariant(v.id, 'stockStatus', e.target.value as any)}
                          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#C8102E]/50 cursor-pointer"
                          style={{ color: STOCK_STATUS[v.stockStatus].color }}
                        >
                          <option value="available" style={{ color: '#10B981', background: '#1a1a1a' }}>✓ Disponible</option>
                          <option value="limited" style={{ color: '#D4A843', background: '#1a1a1a' }}>⚡ Stock limité</option>
                          <option value="out_of_stock" style={{ color: '#ef4444', background: '#1a1a1a' }}>✗ Rupture</option>
                        </select>
                        <input
                          type="number"
                          value={v.price}
                          onChange={e => updateVariant(v.id, 'price', e.target.value)}
                          placeholder={form.price || 'Prix'}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-center outline-none focus:border-[#C8102E]/50"
                        />
                        <button onClick={() => removeVariant(v.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Preset color chips */}
                      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c.name}
                            onClick={() => applyPresetColor(v.id, c.name, c.hex)}
                            title={c.name}
                            className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                              v.color === c.name ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ background: c.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#1A1A1A] px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C8102E] text-white text-sm font-semibold hover:bg-[#a50d25] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer le produit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nouvelle Catégorie ────────────────────────────────────────────────
function NouvelleCategorieModal({
  allCategories,
  onClose,
  onCreated,
}: {
  allCategories: any[];
  onClose: () => void;
  onCreated: (c: { id: string; slug: string; name: string; image?: string; description?: string; color?: string; priority?: number; parentSlug?: string }) => void;
}) {
  const [form, setForm] = useState({ name: '', image: '', description: '', color: '#C8102E', priority: '0', parentSlug: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true);
    setError('');
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `cat_${slug}_${Date.now()}`;
      const cat = { id, slug, name: form.name.trim(), image: form.image.trim() || null, description: form.description.trim() || null, color: form.color, priority: parseInt(form.priority) || 0, parentSlug: form.parentSlug || null };
      await setDoc(doc(db, 'shop_custom_categories', id), cat);
      onCreated(cat as any);
    } catch (err: any) {
      setError('Erreur: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-[#D4A843]" /> Nouvelle Catégorie
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Nom & Priorité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nom de la catégorie *</label>
              <input
                type="text" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Boutons Pression"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Priorité (Tri)</label>
              <input
                type="number" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                placeholder="Ex: 100"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Catégorie Parente (Optionnel)</label>
            <select
              value={form.parentSlug}
              onChange={e => setForm(p => ({ ...p, parentSlug: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60"
            >
              <option value="">Aucune (Catégorie principale)</option>
              {allCategories.filter(c => !c.parentSlug).map(c => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Photo URL */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> Photo de la catégorie (URL)
            </label>
            <input
              type="text" value={form.image}
              onChange={e => setForm(p => ({ ...p, image: e.target.value }))}
              placeholder="https://exemple.com/photo-categorie.jpg"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600"
            />
            {form.image && (
              <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video">
                <img src={form.image} alt="Aperçu" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-gray-500 text-xs" style={{ display: 'none' }}>Image invalide</div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description de la page</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Décrivez cette catégorie et ses produits..."
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600 resize-none"
            />
          </div>

          {/* Couleur */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Couleur accent</label>
            <div className="flex gap-3 items-center">
              <input
                type="color" value={form.color}
                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
              <span className="text-gray-400 text-sm font-mono">{form.color}</span>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-all">Annuler</button>
          <button
            onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4A843] text-black text-sm font-semibold hover:bg-[#c49b3a] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Access Denied ─────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <Shield className="w-10 h-10 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Accès refusé</h1>
          <p className="text-gray-500 text-sm mt-2">
            Vous n'avez pas les permissions nécessaires pour accéder à cette section.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href="/shop"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8102E] text-white text-sm font-semibold hover:bg-[#a50d25] transition-colors"
          >
            Retour à la boutique
          </a>
          <button
            onClick={() => signOut(auth)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login screen for admin ────────────────────────────────────────────────────
function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      setError('Accès refusé. Identifiant non autorisé.');
      return;
    }
    setLoading(true);
    try {
      const { signInWithEmailAndPassword: signIn } = await import('firebase/auth');
      await signIn(auth, email.trim(), password);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Mot de passe incorrect.');
      else if (code === 'auth/too-many-requests') setError('Trop de tentatives. Réessayez dans quelques minutes.');
      else setError('Erreur de connexion. Vérifiez vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#C8102E] flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-red-900/40">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            LEB<span className="text-[#C8102E]">TEX</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Espace Administration</p>
        </div>

        <form onSubmit={handleLogin} className="bg-[#1A1A1A] rounded-2xl border border-white/10 p-6 space-y-4 shadow-2xl">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Identifiant</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com" required autoComplete="username"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mot de passe</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#C8102E]/60 placeholder-gray-600 transition-all"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-1">
                {showPwd ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading || !email || !password}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a50d25] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Connexion…</> : <><Shield className="w-4 h-4" /> Se connecter</>}
          </button>
        </form>
        <p className="text-center text-gray-700 text-xs mt-6">Accès réservé à l'administrateur uniquement</p>
      </div>
    </div>
  );
}

// ─── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminShopPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const q = query(
        collection(db, 'shop_orders'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShopOrder));
      setOrders(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.email === ADMIN_EMAIL) {
      fetchOrders();
    }
  }, [user, fetchOrders]);

  // Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#C8102E]" />
          <p className="text-gray-500 text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) return <AdminLogin />;

  // Wrong user
  if (user.email !== ADMIN_EMAIL) return <AccessDenied />;

  // Render dashboard
  const totalOrders = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex">
      {/* Sidebar */}
      <Sidebar activeNav={activeNav} onNav={setActiveNav} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-[#0F0F0F] border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-10 flex-shrink-0">
          <div>
            <h1 className="text-white font-bold text-base capitalize">{activeNav}</h1>
            {lastRefreshed && (
              <p className="text-gray-600 text-xs">
                Actualisé à{' '}
                {lastRefreshed.toLocaleTimeString('fr-MA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Pending badge */}
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 text-xs font-semibold">
                  {pendingCount} en attente
                </span>
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={fetchOrders}
              disabled={loadingOrders}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all text-xs font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
              Actualiser
            </button>

            {/* User info + logout */}
            <div className="flex items-center gap-3 pl-3 border-l border-white/10">
              <div className="w-8 h-8 rounded-lg bg-[#C8102E] flex items-center justify-center text-white text-xs font-bold">
                {(user.displayName || user.email || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-white text-xs font-medium">{user.displayName || 'Admin'}</p>
                <p className="text-gray-600 text-[10px]">{user.email}</p>
              </div>
              <button
                onClick={() => signOut(auth)}
                className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 p-6 overflow-auto">
          {loadingOrders && orders.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#C8102E]" />
              <p className="text-gray-500 text-sm">Chargement des commandes…</p>
            </div>
          ) : (
            <>
              {activeNav === 'dashboard' && <DashboardView orders={orders} />}
              {activeNav === 'commandes' && <CommandesView orders={orders} />}
              {activeNav === 'produits' && <ProduitsView />}
              {activeNav === 'categories' && <CategoriesView />}
              {activeNav === 'clients' && <ClientsView orders={orders} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
