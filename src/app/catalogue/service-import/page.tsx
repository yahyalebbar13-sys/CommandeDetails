'use client'

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe2, TrendingDown, Search, Smartphone, ShieldCheck, Ship, Camera, Clock, MapPin, Phone } from 'lucide-react';

export default function ServiceImportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0C0C0C] to-[#1A1A1A] text-white p-4 md:p-8 font-sans" style={{ fontFamily: 'Inter, Outfit, sans-serif' }}>
      <div className="max-w-6xl mx-auto">
        <Link href="/catalogue" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Retour au catalogue
        </Link>

        <div className="text-center mb-16 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#0052cc]/20 rounded-full blur-[120px]"></div>
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-6">
            <Globe2 className="w-5 h-5 text-[#D4A843] mr-2" />
            <span className="text-sm font-medium tracking-wider text-gray-300 uppercase">Service B2B Professionnel</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 relative z-10 bg-gradient-to-r from-white via-white to-gray-400 text-transparent bg-clip-text">
            Service Import & <br /> <span className="text-[#C8102E]">Précommandes Directes</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto relative z-10">
            Import direct de Chine en grande quantité avec des tarifs ultra-compétitifs. Nous gérons tout, de l'usine à votre entrepôt.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {[
            { icon: TrendingDown, title: 'Tarifs Directs d\'Usine', desc: 'Bénéficiez de prix sans intermédiaires pour vos grandes séries.' },
            { icon: Search, title: 'Sourcing Sur Mesure', desc: 'Nous trouvons ou fabriquons exactement l\'accessoire qu\'il vous faut.' },
            { icon: Smartphone, title: 'App de Suivi Exclusive', desc: 'Suivez votre commande en temps réel sur notre application dédiée.' },
            { icon: ShieldCheck, title: 'Qualité Garantie', desc: 'Contrôle qualité strict effectué sur place avant l\'embarquement.' },
          ].map((feature, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-[#C8102E]/20 to-transparent rounded-xl flex items-center justify-center mb-6">
                <feature.icon className="w-6 h-6 text-[#C8102E]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-[#111111] to-[#1A1A1A] border border-white/10 rounded-3xl p-8 md:p-12 mb-24 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-[#C8102E]/5 to-transparent pointer-events-none"></div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
            <div>
              <div className="inline-block bg-[#D4A843]/20 text-[#D4A843] font-bold px-3 py-1 rounded-full text-sm mb-6">
                Innovation LEBTEX
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Une transparence totale sur votre production</h2>
              <p className="text-lg text-gray-300 mb-8">
                Ne restez plus dans le flou. Grâce à notre système de suivi, vous êtes informé de chaque étape de votre importation, comme si vous y étiez.
              </p>
              
              <ul className="space-y-6">
                {[
                  { icon: Clock, title: 'Suivi de production', desc: 'Étapes de fabrication en temps réel' },
                  { icon: Camera, title: 'Photos/Vidéos', desc: 'Validation du contrôle qualité en images' },
                  { icon: Ship, title: 'Fret Maritime', desc: 'Position du conteneur et suivi douanier' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <div className="bg-white/10 p-3 rounded-xl mr-4 shrink-0">
                      <item.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-lg">{item.title}</h4>
                      <p className="text-gray-400">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="relative">
              <div className="aspect-[9/16] md:aspect-square bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl border border-gray-700 shadow-2xl overflow-hidden relative">
                {/* Mockup App Interface */}
                <div className="absolute inset-0 p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                    <div className="font-bold">Commande #8492</div>
                    <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-bold">En transit</div>
                  </div>
                  
                  <div className="space-y-6 flex-1">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 rounded-full bg-green-500"></div>
                        <div className="w-0.5 h-12 bg-green-500"></div>
                      </div>
                      <div>
                        <div className="font-bold">Production Terminée</div>
                        <div className="text-sm text-gray-400">12 Août 2026</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 rounded-full bg-green-500"></div>
                        <div className="w-0.5 h-12 bg-green-500"></div>
                      </div>
                      <div>
                        <div className="font-bold">Contrôle Qualité Validé</div>
                        <div className="text-sm text-gray-400">14 Août 2026 (Voir les 12 photos)</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 rounded-full bg-[#D4A843] animate-pulse"></div>
                        <div className="w-0.5 h-12 bg-gray-700"></div>
                      </div>
                      <div>
                        <div className="font-bold text-[#D4A843]">Embarquement Navire</div>
                        <div className="text-sm text-gray-400">Prévu le 18 Août 2026</div>
                      </div>
                    </div>
                    <div className="flex gap-4 opacity-50">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 rounded-full bg-gray-700"></div>
                      </div>
                      <div>
                        <div className="font-bold">Arrivée Port de Casablanca</div>
                        <div className="text-sm text-gray-400">Est. 22 Septembre 2026</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#C8102E] rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl"></div>
          <div className="mb-8 md:mb-0 relative z-10">
            <h2 className="text-3xl font-bold mb-4">Prêt à optimiser vos coûts ?</h2>
            <p className="text-white/80 text-lg max-w-lg">
              Prenez rendez-vous avec notre bureau d'import pour discuter de vos besoins spécifiques.
            </p>
          </div>
          <div className="relative z-10 flex flex-col space-y-4 min-w-[300px]">
            <div className="flex items-center bg-black/20 p-4 rounded-xl backdrop-blur-sm">
              <MapPin className="w-6 h-6 mr-4 text-[#D4A843]" />
              <div>
                <div className="font-bold">Bureau Import</div>
                <div className="text-sm text-white/80">LEBTEX Hay Chrifa, Casablanca</div>
              </div>
            </div>
            <div className="flex items-center bg-black/20 p-4 rounded-xl backdrop-blur-sm">
              <Clock className="w-6 h-6 mr-4 text-[#D4A843]" />
              <div>
                <div className="font-bold">Lun-Sam 09h-18h</div>
                <div className="text-sm text-white/80">Sur rendez-vous uniquement</div>
              </div>
            </div>
            <a href="tel:+212760998347" className="flex items-center justify-center bg-white text-[#C8102E] font-bold py-4 px-6 rounded-xl hover:bg-gray-100 transition-colors shadow-lg">
              <Phone className="w-5 h-5 mr-2" />
              +212 760 998 347
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
