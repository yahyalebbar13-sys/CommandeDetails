"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Truck,
  CheckCircle2,
  MessageCircle,
  RotateCcw,
  Mail,
  ArrowRight,
  MapPin,
  Instagram,
  Facebook,
  Phone,
  Heart,
} from "lucide-react";
import { getWhatsAppContact } from "@/lib/shop-utils";

// ─── Data ─────────────────────────────────────────────────────────────────────

const BOUTIQUE_LINKS = [
  { label: "Fermetures Nylon", href: "/shop/categories/fermetures-nylon" },
  { label: "Fermetures Résine", href: "/shop/categories/fermetures-resine" },
  { label: "Fermetures Métal", href: "/shop/categories/fermetures-metal" },
  {
    label: "Fermetures Invisibles",
    href: "/shop/categories/fermetures-invisibles",
  },
  { label: "Boutons", href: "/shop/categories/boutons" },
  { label: "Élastiques", href: "/shop/categories/elastiques" },
  { label: "Biais & Rubans", href: "/shop/categories/biais-rubans" },
  { label: "Scratch / Velcro", href: "/shop/categories/scratch-velcro" },
  {
    label: "Accessoires Couture",
    href: "/shop/categories/accessoires-couture",
  },
  { label: "Voir tout →", href: "/shop/categories", highlight: true },
];

const SERVICE_LINKS = [
  { label: "Contactez-nous", href: "/shop/contact" },
  { label: "FAQ", href: "/shop/faq" },
  { label: "Livraison & Retours", href: "/shop/livraison" },
  { label: "Suivi de commande", href: "/shop/suivi" },
  { label: "À propos de LEBTEX", href: "/shop/a-propos" },
  { label: "Service Import", href: "/shop/precommande" },
  { label: "Promotions en cours", href: "/shop/promotions" },
];

const GUARANTEES = [
  {
    icon: Truck,
    title: "Livraison rapide",
    desc: "Expédition le jour même avant 14h",
    color: "#10B981",
  },
  {
    icon: CheckCircle2,
    title: "Qualité garantie",
    desc: "Sélection rigoureuse de chaque produit",
    color: "#D4A843",
  },
  {
    icon: MessageCircle,
    title: "Support WhatsApp",
    desc: "Réponse rapide 7j/7",
    color: "#25D366",
  },
  {
    icon: RotateCcw,
    title: "Retour 14 jours",
    desc: "Satisfait ou remboursé sans question",
    color: "#3B82F6",
  },
];

// ─── Newsletter form ──────────────────────────────────────────────────────────
function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setIsLoading(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 900));
    setStatus("success");
    setIsLoading(false);
    setEmail("");
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-300">
            Inscription réussie !
          </p>
          <p className="text-xs text-green-400/80 mt-0.5">
            Vous recevrez nos meilleures offres.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.com"
          required
          className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D4A843]/40 focus:border-[#D4A843]/50 transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#C8102E" }}
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Inscription…
          </>
        ) : (
          <>
            S&apos;abonner aux offres
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400 text-center">
          Erreur. Veuillez réessayer.
        </p>
      )}
    </form>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShopFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="mt-auto"
      style={{ backgroundColor: "#0F0F0F", color: "#E5E7EB" }}
    >
      {/* ── Guarantees strip ──────────────────────────────────────────────────── */}
      <div
        className="border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {GUARANTEES.map((g) => {
              const Icon = g.icon;
              return (
                <div
                  key={g.title}
                  className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/3"
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: `${g.color}18` }}
                  >
                    <Icon
                      className="w-4.5 h-4.5"
                      style={{ color: g.color, width: "18px", height: "18px" }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {g.title}
                    </p>
                    <p
                      className="text-xs mt-0.5 leading-snug"
                      style={{ color: "#9CA3AF" }}
                    >
                      {g.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main footer body ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {/* ── Col 1: Brand ───────────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            {/* Logo */}
            <div className="flex items-center mb-4">
              <span
                className="font-display text-3xl font-black"
                style={{ color: "#FFFFFF" }}
              >
                LEB
              </span>
              <span
                className="font-display text-3xl font-black"
                style={{ color: "#C8102E" }}
              >
                TEX
              </span>
            </div>
            <p
              className="text-sm leading-relaxed mb-5"
              style={{ color: "#9CA3AF" }}
            >
              Votre spécialiste mercerie au Maroc 🇲🇦
              <br />
              Fermetures, boutons, élastiques, rubans — qualité professionnelle
              livrée partout au Maroc.
            </p>

            {/* Contact info */}
            <div className="space-y-2.5">
              <a
                href={getWhatsAppContact()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm group"
              >
                <Phone
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#25D366" }}
                />
                <span
                  className="group-hover:text-white transition-colors"
                  style={{ color: "#9CA3AF" }}
                >
                  +212 760 998 347
                </span>
              </a>
              <div className="flex items-center gap-2.5 text-sm">
                <MapPin
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#D4A843" }}
                />
                <span style={{ color: "#9CA3AF" }}>
                  Casablanca, Maroc
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Mail
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#C8102E" }}
                />
                <a
                  href="mailto:lebtexsarlau@gmail.com"
                  className="text-gray-600 dark:text-gray-400 hover:text-[#C8102E] dark:hover:text-[#D4A843] transition-colors"
                >
                  lebtexsarlau@gmail.com
                </a>
              </div>
            </div>

            {/* Social icons */}
            <div className="flex items-center gap-3 mt-6">
              <a
                href={getWhatsAppContact()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-[#25D366] hover:bg-[#25D366]/10 transition-all"
                aria-label="WhatsApp"
              >
                <Phone className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/lebtex.ma"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-pink-500 hover:bg-pink-500/10 transition-all"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://facebook.com/lebtex.ma"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-blue-500 hover:bg-blue-500/10 transition-all"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* ── Col 2: Boutique ────────────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              Boutique
            </h3>
            <ul className="space-y-2.5">
              {BOUTIQUE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`text-sm transition-colors flex items-center gap-1 group ${
                      link.highlight
                        ? "font-semibold"
                        : "hover:text-white"
                    }`}
                    style={{
                      color: link.highlight ? "#C8102E" : "#9CA3AF",
                    }}
                  >
                    {link.highlight ? (
                      <>
                        {link.label}
                      </>
                    ) : (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-600 group-hover:bg-[#C8102E] transition-colors flex-shrink-0" />
                        {link.label}
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Col 3: Service client ──────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              Service client
            </h3>
            <ul className="space-y-2.5">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors flex items-center gap-1 group"
                    style={{ color: "#9CA3AF" }}
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-600 group-hover:bg-[#C8102E] transition-colors flex-shrink-0" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Shipping badge */}
            <div
              className="mt-6 p-3 rounded-xl border"
              style={{
                borderColor: "rgba(212,168,67,0.2)",
                backgroundColor: "rgba(212,168,67,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Truck
                  className="w-3.5 h-3.5"
                  style={{ color: "#D4A843" }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "#D4A843" }}
                >
                  Livraison gratuite
                </span>
              </div>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                Dès 500 MAD d&apos;achat, partout au Maroc
              </p>
            </div>
          </div>

          {/* ── Col 4: Newsletter ──────────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              Offres exclusives
            </h3>
            <p className="text-sm mb-4" style={{ color: "#9CA3AF" }}>
              Abonnez-vous pour recevoir nos meilleures promotions, nouveautés
              et codes de réduction en avant-première.
            </p>
            <NewsletterForm />

            {/* Trust badges */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                Pas de spam — désinscription en 1 clic
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                Vos données sont protégées
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────────── */}
      <div
        className="border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      />

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Copyright */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#4B5563" }}>
            <span>© {currentYear} LEBTEX. Fait avec</span>
            <Heart
              className="w-3 h-3"
              style={{ color: "#C8102E", fill: "#C8102E" }}
            />
            <span>au Maroc 🇲🇦</span>
          </div>

          {/* Payment methods */}
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "#4B5563" }}>
              Paiement accepté :
            </span>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold"
              style={{
                borderColor: "rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "#9CA3AF",
              }}
            >
              💵 Paiement à la livraison (COD)
            </div>
          </div>

          {/* Legal links */}
          <div className="flex items-center gap-4 text-xs" style={{ color: "#4B5563" }}>
            <Link
              href="/shop/confidentialite"
              className="hover:text-gray-300 transition-colors"
            >
              Confidentialité
            </Link>
            <span>·</span>
            <Link
              href="/shop/conditions"
              className="hover:text-gray-300 transition-colors"
            >
              CGV
            </Link>
            <span>·</span>
            <Link
              href="/shop/mentions-legales"
              className="hover:text-gray-300 transition-colors"
            >
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
