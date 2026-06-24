"use client";
import React, { useState } from "react";
import Link from "next/link";
import {
  Award, Users, TrendingUp, Heart, MapPin, Star,
  MessageCircle, Phone, Clock, ChevronLeft, ChevronRight,
  Package, Shield, Zap, Handshake
} from "lucide-react";

// ─── Data ──────────────────────────────────────────────────────────────────────

const STATS = [
  { number: "500+", label: "Produits disponibles" },
  { number: "2000+", label: "Clients satisfaits" },
  { number: "+15", label: "Ans d'expérience" },
  { number: "48h", label: "Délai Casablanca max" },
];

const TEAM_VALUES = [
  { icon: <Shield className="w-6 h-6" />, title: "Qualité avant tout", desc: "Chaque produit est soigneusement sélectionné auprès de fournisseurs certifiés pour garantir la meilleure qualité." },
  { icon: <Zap className="w-6 h-6" />, title: "Réactivité", desc: "Commandes traitées le jour même, équipe disponible 7j/7 sur WhatsApp pour répondre à toutes vos questions." },
  { icon: <TrendingUp className="w-6 h-6" />, title: "Prix compétitifs", desc: "Meilleurs prix du marché grâce à nos partenariats directs avec les fabricants. Semi-gros et détail." },
  { icon: <Handshake className="w-6 h-6" />, title: "Partenariat durable", desc: "Nous construisons des relations durables avec nos clients. Votre satisfaction est notre priorité absolue." },
];

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
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3325.960193314!2d-7.60478372449582!3d33.52842057335868!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xda633655c4f8119%3A0x1c70dc167bfb1beb!2sLEBTEX!5e0!3m2!1sfr!2sma!4v1781027009148!5m2!1sfr!2sma",
    mapLink: "https://maps.google.com/?cid=2046553088855253995",
    photos: [
      "/boutiques/haifa-1.jpg",
      "/boutiques/haifa-2.jpg",
      "/boutiques/haifa-3.jpg",
    ],
    stats: [
      { label: "Références en stock", value: "5 000+" },
      { label: "Années d'expérience", value: "15+" },
      { label: "Clients professionnels", value: "2 000+" },
    ],
  },
  {
    id: 2,
    name: "Derb Omar",
    badge: "Vente Détail & Gros",
    badgeColor: "#D4A843",
    address: "Derb Omar, Casablanca",
    city: "Casablanca — H9RR+MRR",
    phone: "+212 760 998 347",
    hours: "Lun–Sam : 8h30 – 18h30",
    specialty: "Détail & Semi-gros · Fils, rubans, accessoires couture",
    description:
      "Notre magasin Derb Omar est spécialisé dans la vente au détail avec une large gamme de fils, rubans, élastiques et accessoires couture. Nous acceptons également les commandes en gros pour les professionnels et ateliers de confection. Derb Omar est le quartier historique du textile à Casablanca — venez directement sur place pour choisir parmi un stock varié et coloré.",
    mapUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d830.1456023!2d-7.607993!3d33.591740!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xda7d282d2dad555%3A0x0!2zMzPCsDM1JzMwLjMiTiA3wrAzNicyOC44Ilc!5e0!3m2!1sfr!2sma!4v1750000000000!5m2!1sfr!2sma",
    mapLink: "https://www.google.com/maps?q=33.591740,-7.607993",
    photos: [
      "/boutiques/derb-omar-1.webp",
      "/boutiques/derb-omar-2.webp",
      "/boutiques/derb-omar-3.webp",
    ],
    stats: [
      { label: "Vente au détail", value: "✓" },
      { label: "Commandes en gros", value: "✓" },
      { label: "Fils & rubans", value: "1 000+" },
    ],
  },
];

// ─── Photo Carousel ────────────────────────────────────────────────────────────
function PhotoCarousel({ photos, storeName }: { photos: string[]; storeName: string }) {
  const [current, setCurrent] = useState(0);

  if (!photos.length) {
    return (
      <div className="w-full h-56 bg-gray-100 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400">
        <Package className="w-10 h-10 opacity-40" />
        <p className="text-sm font-medium">Photos bientôt disponibles</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-56 rounded-2xl overflow-hidden group">
      <img
        src={photos[current]}
        alt={`${storeName} — photo ${current + 1}`}
        className="w-full h-full object-cover transition-all duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((c) => (c - 1 + photos.length) % photos.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
          <button
            onClick={() => setCurrent((c) => (c + 1) % photos.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4 text-gray-700" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? "bg-white w-5" : "bg-white/60 w-1.5"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────
function StoreCard({ store }: { store: (typeof STORES)[0] }) {
  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_40px_rgba(0,0,0,0.07)] border border-[#E8E4DF] overflow-hidden flex flex-col">
      {/* Photos */}
      <div className="p-5 pb-0">
        <PhotoCarousel photos={store.photos} storeName={store.name} />
      </div>

      {/* Info */}
      <div className="p-6 space-y-5 flex-1 flex flex-col">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              className="text-xl font-bold text-[#1A1A1A]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {store.name}
            </h3>
            <span
              className="text-[10px] font-bold px-3 py-1 rounded-full text-white whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: store.badgeColor }}
            >
              {store.badge}
            </span>
          </div>
          <p className="text-sm text-gray-500 font-medium">{store.specialty}</p>
        </div>

        {/* Stats */}
        {store.stats.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {store.stats.map((s) => (
              <div key={s.label} className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-base font-black" style={{ color: "#C8102E" }}>{s.value}</p>
                <p className="text-[10px] font-medium text-gray-500 leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed flex-1">{store.description}</p>

        {/* Contact Info */}
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
              className="text-sm font-semibold text-gray-800 hover:text-[#C8102E] transition-colors"
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

        {/* Google Maps Embed */}
        {store.mapUrl && (
          <div className="rounded-2xl overflow-hidden border border-[#E8E4DF]" style={{ height: 220 }}>
            <iframe
              src={store.mapUrl}
              width="100%"
              height="220"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Carte ${store.name}`}
            />
          </div>
        )}

        {/* CTAs */}
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
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm bg-[#25D366] text-white hover:bg-[#1da851] transition-colors active:scale-[0.98]"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AProposPage() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#FBF8F3" }} className="min-h-screen">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div
        className="relative py-24 sm:py-32 text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 60%, #C8102E 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, #C8102E 0%, transparent 50%), radial-gradient(circle at 80% 20%, #fff 0%, transparent 40%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-xs font-semibold tracking-widest uppercase mb-5">
            <Award className="w-3.5 h-3.5" />
            Notre histoire
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black mb-6 leading-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            À Propos de{" "}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #fff 0%, #f87171 100%)" }}>
              LEBTEX
            </span>
          </h1>
          <p className="text-white/70 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Votre spécialiste en accessoires textiles et mercerie au Maroc, depuis plus de 15 ans.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              { icon: "📦", text: "Stock massif sur place" },
              { icon: "⭐", text: "+15 ans d'expérience" },
              { icon: "🇲🇦", text: "2 magasins à Casablanca" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 text-sm font-medium">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#C8102E] py-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-white text-center">
            {STATS.map(({ number, label }) => (
              <div key={label}>
                <p className="text-4xl font-black mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{number}</p>
                <p className="text-red-200 text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16 space-y-20">

        {/* ── Notre Histoire ────────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[#C8102E] text-xs font-bold uppercase tracking-widest mb-3">Notre histoire</p>
            <h2 className="text-3xl font-black text-[#1A1A1A] mb-6" style={{ fontFamily: "Outfit, sans-serif" }}>
              Passion pour le textile depuis plus de 15 ans
            </h2>
            <div className="space-y-4 text-[#6B6B6B] leading-relaxed text-[15px]">
              <p>
                LEBTEX est née de la passion pour le textile et la mercerie. Fondée à Casablanca, notre entreprise s'est donnée pour mission de rendre accessibles les meilleurs accessoires de couture à tous les professionnels et amateurs du Maroc.
              </p>
              <p>
                Nous travaillons directement avec des fournisseurs de renommée internationale pour vous proposer des fermetures éclair, boutons, élastiques, rubans et bien plus encore — à des prix compétitifs, sans compromis sur la qualité.
              </p>
              <p>
                Aujourd'hui, LEBTEX livre dans tout le Maroc et accompagne des centaines de couturiers, stylistes, ateliers et entreprises textiles dans leur activité quotidienne.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#C8102E] rounded-2xl p-6 text-white">
              <MapPin className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Casablanca</p>
              <p className="text-red-200 text-sm">2 points de vente</p>
            </div>
            <div className="bg-[#D4A843] rounded-2xl p-6 text-white">
              <TrendingUp className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>+15 ans</p>
              <p className="text-yellow-200 text-sm">D'expérience dans le secteur</p>
            </div>
            <div className="bg-[#0F0F0F] rounded-2xl p-6 text-white">
              <Users className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>2000+</p>
              <p className="text-gray-400 text-sm">Clients fidèles</p>
            </div>
            <div className="bg-[#10B981] rounded-2xl p-6 text-white">
              <Award className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Qualité</p>
              <p className="text-emerald-200 text-sm">Garantie sur tous les produits</p>
            </div>
          </div>
        </div>

        {/* ── Nos Valeurs ───────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10">
            <p className="text-[#C8102E] text-xs font-bold uppercase tracking-widest mb-3">Ce qui nous définit</p>
            <h2 className="text-3xl font-black text-[#1A1A1A]" style={{ fontFamily: "Outfit, sans-serif" }}>Nos valeurs</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {TEAM_VALUES.map(({ icon, title, desc }) => (
              <div key={title} className="bg-white border border-[#E8E4DF] rounded-2xl p-6 flex gap-4 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-[#C8102E]/10 flex items-center justify-center flex-shrink-0 text-[#C8102E]">
                  {icon}
                </div>
                <div>
                  <h3 className="font-bold text-[#1A1A1A] mb-2 text-base" style={{ fontFamily: "Outfit, sans-serif" }}>{title}</h3>
                  <p className="text-[#6B6B6B] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Nos Magasins ──────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10">
            <p className="text-[#C8102E] text-xs font-bold uppercase tracking-widest mb-3">Présence physique</p>
            <h2 className="text-3xl font-black text-[#1A1A1A]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Nos Magasins à Casablanca
            </h2>
            <p className="text-[#6B6B6B] mt-3 max-w-xl mx-auto text-[15px]">
              Venez nous rendre visite directement sur place. Nos équipes vous accueilleront et vous aideront à trouver les accessoires qu'il vous faut.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {STORES.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>

          {/* Delivery banner */}
          <div className="mt-10 bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
            <div className="text-3xl mb-3">🚚</div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>Vous n'êtes pas à Casablanca ?</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
              Pas de problème ! Nous livrons dans <strong className="text-white">tout le Maroc</strong> en 24–72h.
              Commandez en ligne ou via WhatsApp et recevez vos produits chez vous.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shop/boutique"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white bg-[#C8102E] hover:bg-[#a00d25] transition-colors"
              >
                🛍️ Commander en ligne
              </Link>
              <a
                href="https://wa.me/212760998347"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-[#25D366] text-white hover:bg-[#1da851] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Commander via WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* ── Témoignages ───────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10">
            <p className="text-[#C8102E] text-xs font-bold uppercase tracking-widest mb-3">Avis clients</p>
            <h2 className="text-3xl font-black text-[#1A1A1A]" style={{ fontFamily: "Outfit, sans-serif" }}>Ce que disent nos clients</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: "Fatima Z.", city: "Casablanca", rating: 5, text: "Excellente qualité de fermetures, livraison rapide. Je commande régulièrement pour mon atelier de couture." },
              { name: "Ahmed B.", city: "Marrakech", rating: 5, text: "Prix imbattables pour les élastiques et biais. Service client très réactif sur WhatsApp. Je recommande !" },
              { name: "Samira R.", city: "Rabat", rating: 4, text: "Large gamme de produits, tout ce qu'il faut pour la mercerie. Paiement à la livraison très pratique." },
            ].map(({ name, city, rating, text }) => (
              <div key={name} className="bg-white border border-[#E8E4DF] rounded-2xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex text-[#D4A843] mb-3 text-lg">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</div>
                <p className="text-[#6B6B6B] text-sm leading-relaxed mb-4 italic">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#C8102E] text-white flex items-center justify-center font-bold text-sm">
                    {name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1A1A1A] text-sm">{name}</p>
                    <p className="text-xs text-[#6B6B6B]">{city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA Final ─────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-10 text-center">
          <Heart className="w-10 h-10 text-[#C8102E] mx-auto mb-4" />
          <h3 className="text-3xl font-black text-[#1A1A1A] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>Rejoignez la famille LEBTEX</h3>
          <p className="text-gray-400 mb-8 max-w-md mx-auto text-[15px]">
            Commandez dès maintenant et découvrez pourquoi des milliers de couturiers nous font confiance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/shop/boutique"
              className="px-8 py-4 bg-[#C8102E] hover:bg-[#a00d25] text-white font-bold rounded-xl transition-colors"
            >
              Découvrir la boutique
            </Link>
            <a
              href="https://wa.me/212760998347"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-[#25D366] hover:bg-[#1da851] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> Nous contacter
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
