"use client";

import React, { useState } from "react";
import { MapPin, Phone, Clock, ChevronLeft, ChevronRight, Star, Award, Package } from "lucide-react";

// ─── Store Data ───────────────────────────────────────────────────────────────
const STORES = [
  {
    id: 1,
    name: "Boulevard Haïfa",
    badge: "Magasin Principal",
    badgeColor: "#C8102E",
    address: "Boulevard Haïfa, Casablanca",
    city: "Casablanca",
    phone: "+212 760 998 347",
    hours: "Lun–Sam : 8h30 – 18h30",
    specialty: "Tous les produits · Spécialiste fermetures & mercerie",
    description:
      "Notre magasin historique et principal. Vous y trouverez l'intégralité de notre gamme : fermetures éclair nylon, métal et plastique, élastiques, rubans, boutons, accessoires couture et bien plus. Un stock massif sur place, disponible immédiatement.",
    mapUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.5!2d-7.6190!3d33.5731!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzPCsDM0JzIzLjIiTiA3wrAzNycwOC40Ilc!5e0!3m2!1sfr!2sma!4v1",
    mapLink: "https://maps.google.com/?q=Boulevard+Haifa+Casablanca",
    photos: [
      "/boutiques/haifa-1.jpg",
      "/boutiques/haifa-2.jpg",
      "/boutiques/haifa-3.jpg",
      "/boutiques/haifa-4.jpg",
      "/boutiques/haifa-5.jpg",
    ],
    stats: [
      { label: "Références en stock", value: "5 000+" },
      { label: "Années d'expérience", value: "15+" },
      { label: "Clients professionnels", value: "2 000+" },
    ],
  },
  {
    id: 2,
    name: "Magasin 2 – Casablanca",
    badge: "Bientôt mis à jour",
    badgeColor: "#64748B",
    address: "Casablanca",
    city: "Casablanca",
    phone: "+212 760 998 347",
    hours: "Lun–Sam : 8h30 – 18h30",
    specialty: "Fermetures & élastiques",
    description:
      "Notre deuxième point de vente à Casablanca. Spécialisé dans les fermetures et élastiques. Contactez-nous pour l'adresse précise.",
    mapUrl: "",
    mapLink: "https://wa.me/212760998347",
    photos: [],
    stats: [],
  },
  {
    id: 3,
    name: "Magasin 3 – Casablanca",
    badge: "Bientôt mis à jour",
    badgeColor: "#64748B",
    address: "Casablanca",
    city: "Casablanca",
    phone: "+212 760 998 347",
    hours: "Lun–Sam : 8h30 – 18h30",
    specialty: "Accessoires couture",
    description:
      "Notre troisième point de vente à Casablanca. Pour l'adresse précise et les disponibilités, contactez-nous par WhatsApp.",
    mapUrl: "",
    mapLink: "https://wa.me/212760998347",
    photos: [],
    stats: [],
  },
];

// ─── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({ photos, storeName }: { photos: string[]; storeName: string }) {
  const [current, setCurrent] = useState(0);

  if (!photos.length) {
    return (
      <div className="w-full h-72 bg-gray-100 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400">
        <Package className="w-12 h-12 opacity-40" />
        <p className="text-sm font-medium">Photos bientôt disponibles</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-72 sm:h-80 lg:h-96 rounded-2xl overflow-hidden group">
      {/* Main photo */}
      <img
        src={photos[current]}
        alt={`${storeName} - photo ${current + 1}`}
        className="w-full h-full object-cover transition-all duration-500"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

      {/* Nav arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((c) => (c - 1 + photos.length) % photos.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <button
            onClick={() => setCurrent((c) => (c + 1) % photos.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
          >
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </>
      )}

      {/* Dots */}
      {photos.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current ? "bg-white w-5" : "bg-white/60"
              }`}
            />
          ))}
        </div>
      )}

      {/* Counter */}
      <div className="absolute top-3 right-3 bg-black/50 backdrop-blur text-white text-xs px-2.5 py-1 rounded-full font-medium">
        {current + 1} / {photos.length}
      </div>
    </div>
  );
}

// ─── Store Card ───────────────────────────────────────────────────────────────
function StoreCard({ store }: { store: (typeof STORES)[0] }) {
  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_40px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
      {/* Photos */}
      <div className="p-5 pb-0">
        <PhotoCarousel photos={store.photos} storeName={store.name} />
      </div>

      {/* Info */}
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-xl font-bold text-gray-900">{store.name}</h2>
            <span
              className="text-xs font-bold px-3 py-1 rounded-full text-white whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: store.badgeColor }}
            >
              {store.badge}
            </span>
          </div>
          <p className="text-sm text-gray-500 font-medium">{store.specialty}</p>
        </div>

        {/* Stats (main store only) */}
        {store.stats.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {store.stats.map((s) => (
              <div key={s.label} className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black" style={{ color: "#C8102E" }}>
                  {s.value}
                </p>
                <p className="text-[10px] font-medium text-gray-500 leading-tight mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed">{store.description}</p>

        {/* Details */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4" style={{ color: "#C8102E" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{store.address}</p>
              <p className="text-xs text-gray-400">{store.city}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4" style={{ color: "#C8102E" }} />
            </div>
            <a
              href={`tel:${store.phone.replace(/\s/g, "")}`}
              className="text-sm font-semibold text-gray-800 hover:text-red-600 transition-colors"
            >
              {store.phone}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4" style={{ color: "#C8102E" }} />
            </div>
            <p className="text-sm font-semibold text-gray-800">{store.hours}</p>
          </div>
        </div>

        {/* Google Maps embed (main store) */}
        {store.mapUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-100" style={{ height: 200 }}>
            <iframe
              src={store.mapUrl}
              width="100%"
              height="200"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Carte ${store.name}`}
            />
          </div>
        )}

        {/* CTA */}
        <div className="flex gap-2 pt-1">
          <a
            href={store.mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#C8102E" }}
          >
            <MapPin className="w-4 h-4" />
            Voir sur Maps
          </a>
          <a
            href={`https://wa.me/212760998347?text=Bonjour LEBTEX, je voudrais des informations sur le magasin ${encodeURIComponent(store.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm bg-green-500 text-white transition-all hover:bg-green-600 active:scale-[0.98]"
          >
            <Phone className="w-4 h-4" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BoutiquesPage() {
  return (
    <div className="min-h-screen" style={{ background: "#FBF8F3" }}>
      {/* Hero */}
      <div
        className="relative py-16 sm:py-20 text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 60%, #C8102E 100%)" }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #C8102E 0%, transparent 50%), radial-gradient(circle at 80% 20%, #fff 0%, transparent 40%)" }}
        />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-xs font-semibold tracking-widest uppercase mb-5">
            <Award className="w-3.5 h-3.5" />
            Présence physique au Maroc
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4 leading-tight">
            Nos Boutiques
            <span className="block text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #fff 0%, #f87171 100%)" }}>
              à Casablanca
            </span>
          </h1>
          <p className="text-white/70 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            LEBTEX est présent physiquement avec <strong className="text-white">3 magasins</strong> à Casablanca.
            Venez découvrir nos stocks directement sur place ou commandez en ligne.
          </p>

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {[
              { icon: "📦", text: "Stock massif sur place" },
              { icon: "⭐", text: "+15 ans d'expérience" },
              { icon: "🇲🇦", text: "3 magasins Casablanca" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 text-sm font-medium">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stores Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {STORES.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-12 bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 text-center shadow-sm">
          <div className="text-3xl mb-3">🚚</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Vous n'êtes pas à Casablanca ?</h3>
          <p className="text-gray-500 text-sm max-w-lg mx-auto">
            Pas de problème ! Nous livrons dans <strong className="text-gray-700">tout le Maroc</strong> en 24–72h.
            Commandez en ligne ou via WhatsApp et recevez vos produits chez vous.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/shop/boutique"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "#C8102E" }}
            >
              🛍️ Commander en ligne
            </a>
            <a
              href="https://wa.me/212760998347"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              💬 Commander via WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
