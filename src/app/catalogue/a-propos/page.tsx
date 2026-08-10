'use client'

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Package, Clock, Award, CheckCircle, Store, MapPin, Sparkles } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0C0C0C] to-[#1A1A1A] text-white p-4 md:p-8 font-sans" style={{ fontFamily: 'Inter, Outfit, sans-serif' }}>
      <div className="max-w-6xl mx-auto">
        <Link href="/catalogue" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Retour au catalogue
        </Link>

        <div className="text-center mb-16 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#C8102E]/20 rounded-full blur-[100px]"></div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 relative z-10 bg-gradient-to-r from-white via-white to-gray-400 text-transparent bg-clip-text">
            À Propos de <span className="text-[#C8102E]">LEBTEX</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto relative z-10">
            Votre spécialiste en accessoires textiles et mercerie au Maroc, depuis plus de 15 ans.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {[
            { icon: Package, stat: '500+', label: 'Produits' },
            { icon: Users, stat: '2000+', label: 'Clients' },
            { icon: Clock, stat: '+15 Ans', label: 'Expérience' },
            { icon: Award, stat: '48h', label: 'Délai max' },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors group">
              <item.icon className="w-10 h-10 text-[#D4A843] mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <div className="text-3xl font-bold text-white mb-2">{item.stat}</div>
              <div className="text-gray-400 font-medium">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-16 mb-20">
          <div>
            <h2 className="text-3xl font-bold mb-8 flex items-center">
              <Sparkles className="w-8 h-8 text-[#D4A843] mr-3" />
              Notre Histoire
            </h2>
            <div className="space-y-6 text-gray-300 text-lg leading-relaxed">
              <p>
                Fondée à Casablanca, LEBTEX s'est imposée comme un acteur incontournable de la fourniture pour professionnels du textile au Maroc. Notre aventure a commencé avec une vision simple : fournir les meilleurs accessoires et articles de mercerie avec une fiabilité sans faille.
              </p>
              <p>
                Aujourd'hui, nous collaborons avec des fournisseurs internationaux de premier plan pour vous apporter des produits innovants, résistants et adaptés aux tendances actuelles. Que vous soyez un créateur indépendant ou une grande usine de confection, nous avons les solutions qu'il vous faut.
              </p>
              <p>
                Avec notre réseau de distribution performant, nous livrons partout au Maroc, garantissant à nos partenaires de ne jamais manquer de la matière première essentielle à leurs créations.
              </p>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-8 flex items-center">
              <CheckCircle className="w-8 h-8 text-[#C8102E] mr-3" />
              Nos Valeurs
            </h2>
            <div className="grid gap-4">
              {[
                { title: 'Qualité avant tout', desc: 'Des matériaux rigoureusement sélectionnés.' },
                { title: 'Réactivité', desc: 'Une équipe dédiée à répondre à vos besoins d\'urgence.' },
                { title: 'Prix compétitifs', desc: 'Des tarifs étudiés pour optimiser vos coûts de production.' },
                { title: 'Partenariat durable', desc: 'Nous grandissons avec nos clients.' },
              ].map((valeur, i) => (
                <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 flex items-start">
                  <div className="bg-[#C8102E]/20 p-2 rounded-lg mr-4 mt-1">
                    <CheckCircle className="w-5 h-5 text-[#C8102E]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-white mb-1">{valeur.title}</h3>
                    <p className="text-gray-400">{valeur.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-bold mb-8 text-center">Nos Magasins</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-white/5 to-transparent backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden relative group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#C8102E]/10 rounded-full blur-2xl z-0"></div>
              <div className="h-48 w-full relative z-10 overflow-hidden">
                <img src="/boutiques/haifa-1.jpg" alt="Magasin Boulevard Haïfa" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#151515] to-transparent"></div>
              </div>
              <div className="p-8 relative z-10 -mt-12">
                <div className="bg-[#C8102E]/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-[#C8102E]/30 mb-6">
                  <Store className="w-6 h-6 text-[#C8102E]" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Magasin Principal</h3>
                <div className="flex items-start text-gray-300 mb-6">
                  <MapPin className="w-5 h-5 mr-2 mt-1 shrink-0 text-gray-500" />
                  <p>Boulevard Haïfa<br />Casablanca, Maroc</p>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#D4A843] mr-2" /> Toute la gamme de produits</li>
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#D4A843] mr-2" /> Spécialité fermetures & mercerie</li>
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#D4A843] mr-2" /> Espace professionnels</li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white/5 to-transparent backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden relative group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#D4A843]/10 rounded-full blur-2xl z-0"></div>
              <div className="h-48 w-full relative z-10 overflow-hidden">
                <img src="/boutiques/derb-omar-1.webp" alt="Magasin Derb Omar" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#151515] to-transparent"></div>
              </div>
              <div className="p-8 relative z-10 -mt-12">
                <div className="bg-[#D4A843]/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-[#D4A843]/30 mb-6">
                  <Store className="w-6 h-6 text-[#D4A843]" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Succursale Derb Omar</h3>
                <div className="flex items-start text-gray-300 mb-6">
                  <MapPin className="w-5 h-5 mr-2 mt-1 shrink-0 text-gray-500" />
                  <p>Quartier Derb Omar<br />Casablanca, Maroc</p>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#C8102E] mr-2" /> Vente au Détail & Gros</li>
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#C8102E] mr-2" /> Spécialité fils, rubans et accessoires</li>
                  <li className="flex items-center text-gray-300"><CheckCircle className="w-4 h-4 text-[#C8102E] mr-2" /> Stock disponible sur place</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
