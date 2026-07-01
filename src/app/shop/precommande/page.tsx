"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Globe, Truck, Smartphone, Percent, MapPin, 
  MessageCircle, ArrowRight, ShieldCheck, Clock, Phone
} from "lucide-react";
import { getWhatsAppContact } from "@/lib/shop-utils";

// ─── Intersection Observer Hook ───────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function RevealSection({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const IMPORT_FEATURES = [
  {
    icon: <Percent className="w-8 h-8" />,
    title: "Tarifs Directs d'Usine",
    desc: "En commandant directement de Chine, vous bénéficiez de nos prix d'importateur, imbattables sur le marché local.",
    color: "#C8102E"
  },
  {
    icon: <Globe className="w-8 h-8" />,
    title: "Sourcing Sur Mesure",
    desc: "Au-delà de nos produits standards, nous pouvons sourcer et importer n'importe quel accessoire de mercerie spécifique à vos besoins.",
    color: "#D4A843"
  },
  {
    icon: <Smartphone className="w-8 h-8" />,
    title: "App de Suivi Exclusive",
    desc: "Dès que votre commande est validée, accédez à une application dédiée pour suivre la fabrication et l'acheminement de votre marchandise en temps réel.",
    color: "#1A1A1A"
  },
  {
    icon: <ShieldCheck className="w-8 h-8" />,
    title: "Qualité Garantie",
    desc: "Nous contrôlons la qualité directement à la source. Vous recevez exactement ce que vous avez commandé, sans mauvaises surprises.",
    color: "#10B981"
  }
];

// ─── Page Component ───────────────────────────────────────────────────────────
export default function PrecommandePage() {
  const [waLink, setWaLink] = useState("");

  useEffect(() => {
    // Generate WhatsApp link dynamically on client side
    setWaLink(getWhatsAppContact("Bonjour LEBTEX, je souhaite avoir plus d'informations sur votre service d'import et de précommande depuis la Chine."));
  }, []);

  return (
    <main className="min-h-screen bg-[#FBF8F3] pt-24 pb-20" style={{ fontFamily: 'Inter, sans-serif' }}>
      
      {/* ── Header Section ───────────────────────────────────────────────────── */}
      <section className="relative px-6 py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#1A1A1A] opacity-[0.97]" />
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-[#C8102E]/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto">
          <RevealSection>
            <div className="max-w-3xl">
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-[#D4A843]/20 text-[#D4A843] mb-6 border border-[#D4A843]/30">
                Service Professionnel B2B
              </span>
              <h1 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Service Import & <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8102E] to-[#ff4b69]">
                  Précommandes Directes
                </span>
              </h1>
              <p className="text-lg text-gray-300 mb-10 leading-relaxed max-w-2xl">
                Optimisez vos coûts de production grâce à notre service d'import direct de Chine. Commandez nos produits ou des accessoires sur mesure en grande quantité et profitez de tarifs défiant toute concurrence locale.
              </p>
              
              <div className="flex flex-wrap gap-4">
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#25D366]/20"
                    style={{ backgroundColor: "#25D366" }}
                  >
                    <MessageCircle className="w-5 h-5" />
                    Parler à un conseiller
                  </a>
                )}
                <a
                  href="#localisation"
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/20"
                >
                  <MapPin className="w-5 h-5" />
                  Prendre Rendez-vous
                </a>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <RevealSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-black text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Pourquoi choisir notre service d'import ?
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                LEBTEX met à votre disposition son réseau de fournisseurs asiatiques et son expertise en logistique internationale.
              </p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            {IMPORT_FEATURES.map((feature, i) => (
              <RevealSection key={i} delay={i * 100}>
                <div className="bg-white rounded-3xl p-8 border border-[#E8E4DF] shadow-sm hover:shadow-xl transition-all duration-300 flex gap-6 group h-full">
                  <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
                    style={{ backgroundColor: `${feature.color}15`, color: feature.color }}
                  >
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#1A1A1A] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {feature.title}
                    </h3>
                    <p className="text-gray-500 leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── The Tracking App Feature (Highlight) ───────────────────────────── */}
      <section className="py-20 px-6 bg-white border-y border-[#E8E4DF]">
        <div className="max-w-7xl mx-auto">
          <RevealSection>
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-wider">
                  <Smartphone className="w-4 h-4" /> Innovation LEBTEX
                </div>
                <h2 className="text-3xl md:text-5xl font-black text-[#1A1A1A] leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Votre commande dans <br/> le creux de votre main.
                </h2>
                <p className="text-lg text-gray-500 leading-relaxed">
                  L'importation internationale peut être stressante. C'est pourquoi nous avons développé une application exclusive pour nos clients B2B ayant des précommandes en cours.
                </p>
                <ul className="space-y-4 pt-4">
                  {[
                    "Suivi de la production en usine",
                    "Photos et vidéos du contrôle qualité",
                    "Statut du fret maritime et localisation du conteneur",
                    "Date de livraison estimée à votre atelier"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-gray-700 font-medium">
                      <div className="w-6 h-6 rounded-full bg-[#C8102E]/10 text-[#C8102E] flex items-center justify-center flex-shrink-0">
                        <CheckCheck className="w-3.5 h-3.5" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 w-full max-w-md lg:max-w-none mx-auto">
                <div className="relative aspect-square md:aspect-video lg:aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 shadow-2xl flex items-center justify-center">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                  <Smartphone className="w-32 h-32 text-gray-300" />
                  <div className="absolute inset-x-0 bottom-10 text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Aperçu de l'Application</p>
                  </div>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── Commercial Service & Location ────────────────────────────────────── */}
      <section id="localisation" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <RevealSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-black text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Discutons de votre projet d'Import
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                Notre équipe commerciale vous accueille pour étudier vos besoins, sélectionner les échantillons et finaliser vos précommandes.
              </p>
            </div>
          </RevealSection>

          <div className="bg-white rounded-3xl shadow-xl border border-[#E8E4DF] overflow-hidden flex flex-col md:flex-row">
            {/* Map */}
            <div className="w-full md:w-1/2 h-80 md:h-auto relative">
              <iframe
                src="https://maps.google.com/maps?q=33.528759,-7.606666&t=&z=15&ie=UTF8&iwloc=&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0"
              />
            </div>
            
            {/* Details */}
            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A843]/10 text-[#D4A843] text-xs font-bold uppercase tracking-widest mb-6 w-fit">
                Bureau Commercial
              </div>
              <h3 className="text-2xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                LEBTEX — Hay Chrifa
              </h3>
              <p className="text-gray-500 mb-8">
                Venez découvrir notre espace de vente à Hay Chrifa. Notre bureau vous accueille pour faciliter vos échanges B2B.
              </p>
              
              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#C8102E] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Adresse</p>
                    <p className="text-gray-500 text-sm">Hay Chrifa, Casablanca</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[#C8102E] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Horaires d'ouverture</p>
                    <p className="text-gray-500 text-sm">Lundi à Samedi : 09h00 – 18h00</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-[#C8102E] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Contact Direct</p>
                    <p className="text-gray-500 text-sm">+212 760 998 347</p>
                  </div>
                </div>
              </div>

              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: "#1A1A1A" }}
                >
                  Contacter le Service Commercial
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
      
    </main>
  );
}

// CheckCheck icon
function CheckCheck(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}
