"use client";
import Link from 'next/link';
import { Truck, Clock, MapPin, RotateCcw, Package, CheckCircle, AlertCircle, MessageCircle } from 'lucide-react';

const ZONES = [
  { city: 'Casablanca & Grand Casablanca', fee: 25, delay: '24 - 48h', partner: 'Amana / Cathedis' },
  { city: 'Rabat, Salé, Temara', fee: 35, delay: '1 - 2 jours', partner: 'Amana' },
  { city: 'Marrakech', fee: 35, delay: '2 - 3 jours', partner: 'Amana / Jibli' },
  { city: 'Fès, Meknès', fee: 35, delay: '2 - 3 jours', partner: 'Amana' },
  { city: 'Tanger, Tétouan', fee: 35, delay: '2 - 3 jours', partner: 'Cathedis' },
  { city: 'Agadir', fee: 35, delay: '2 - 3 jours', partner: 'Jibli' },
  { city: 'Oujda, Nador', fee: 40, delay: '3 - 4 jours', partner: 'Amana' },
  { city: 'Autres villes & zones rurales', fee: 50, delay: '3 - 5 jours', partner: 'Variable' },
];

export default function LivraisonPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">Livraison & Retours</p>
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Livraison Partout au Maroc 🇲🇦
          </h1>
          <p className="text-gray-400 text-lg">Paiement à la livraison • Suivi en temps réel • Retour facile</p>
          <div className="mt-6 inline-flex items-center gap-2 bg-[#D4A843]/20 border border-[#D4A843]/30 rounded-full px-5 py-2">
            <span className="text-[#D4A843] font-bold">🎉 Livraison GRATUITE dès 500 MAD d'achat !</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-12">

        {/* Key info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Truck, title: 'Livraison nationale', desc: 'Toutes les villes du Maroc', color: '#3B82F6', bg: '#eff6ff' },
            { icon: Clock, title: 'Traitement rapide', desc: 'Expédié le jour même (avant 14h)', color: '#10B981', bg: '#f0fdf4' },
            { icon: Package, title: 'Paiement livraison', desc: 'Payez à la réception', color: '#D4A843', bg: '#fffbeb' },
            { icon: RotateCcw, title: 'Retour 14 jours', desc: 'Satisfait ou remboursé', color: '#C8102E', bg: '#fef2f4' },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="bg-white border border-[#E8E4DF] rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-6 h-6" style={{ color }} />
              </div>
              <h3 className="font-bold text-[#1A1A1A] text-sm mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
              <p className="text-xs text-[#6B6B6B]">{desc}</p>
            </div>
          ))}
        </div>

        {/* Delivery zones table */}
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Zones & Tarifs de livraison
          </h2>
          <div className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-4 bg-[#F3EFE8] px-6 py-3 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
              <span>Destination</span>
              <span className="text-center">Frais</span>
              <span className="text-center">Délai estimé</span>
              <span className="text-center">Transporteur</span>
            </div>
            {ZONES.map((zone, i) => (
              <div key={zone.city} className={`px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-0 items-center border-t ${i === 0 ? 'border-t-0' : 'border-[#F3EFE8]'}`}>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#C8102E] shrink-0" />
                  <span className="font-semibold text-[#1A1A1A]">{zone.city}</span>
                </div>
                <div className="text-center">
                  <span className={`inline-block font-black text-lg ${zone.fee === 25 ? 'text-[#10B981]' : 'text-[#1A1A1A]'}`}>
                    {zone.fee} MAD
                  </span>
                  {zone.fee === 25 && <span className="block text-xs text-[#10B981]">Meilleur tarif</span>}
                </div>
                <div className="text-center">
                  <span className="font-semibold text-[#1A1A1A]">{zone.delay}</span>
                </div>
                <div className="text-center">
                  <span className="text-sm text-[#6B6B6B] bg-[#F3EFE8] px-3 py-1 rounded-full">{zone.partner}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#6B6B6B] mt-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Les délais sont estimatifs et peuvent varier selon les conditions. Livraison GRATUITE dès 500 MAD.
          </p>
        </div>

        {/* Process */}
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Comment ça marche ?
          </h2>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#E8E4DF] hidden md:block" />
            <div className="space-y-4">
              {[
                { step: '01', title: 'Commande passée', desc: 'Vous commandez sur le site. Notre équipe reçoit instantanément votre commande.', icon: Package },
                { step: '02', title: 'Confirmation (sous 2h)', desc: 'Notre équipe vous appelle pour confirmer la commande et les détails de livraison.', icon: CheckCircle },
                { step: '03', title: 'Préparation & expédition', desc: 'Votre commande est préparée avec soin et confiée au transporteur. Vous recevez un numéro de suivi.', icon: Truck },
                { step: '04', title: 'Livraison à votre porte', desc: 'Le livreur vous contacte avant la livraison. Vous payez en cash à la réception.', icon: MapPin },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div key={step} className="flex gap-6 items-start pl-0 md:pl-12 relative">
                  <div className="absolute left-0 top-2 w-12 h-12 rounded-full bg-[#C8102E] text-white font-black text-sm flex items-center justify-center hidden md:flex z-10" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {step}
                  </div>
                  <div className="bg-white border border-[#E8E4DF] rounded-2xl p-5 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className="w-5 h-5 text-[#C8102E]" />
                      <h3 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
                    </div>
                    <p className="text-[#6B6B6B] text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Returns policy */}
        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#fef2f4] rounded-xl">
              <RotateCcw className="w-6 h-6 text-[#C8102E]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Politique de retour</h2>
              <p className="text-sm text-[#6B6B6B]">14 jours pour changer d'avis</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#10B981]" /> Ce que nous acceptons
              </h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                {['Produits non utilisés dans leur emballage d\'origine', 'Retour dans les 14 jours suivant la réception', 'Produit défectueux ou mal livré (remboursement complet)', 'Produit non conforme à la description'].map(item => (
                  <li key={item} className="flex items-start gap-2"><span className="text-[#10B981] mt-0.5">✓</span>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F59E0B]" /> Ce que nous n'acceptons pas
              </h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                {['Produits utilisés ou lavés', 'Produits sans emballage d\'origine', 'Retour après 14 jours', 'Produits personnalisés ou sur mesure'].map(item => (
                  <li key={item} className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✗</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 p-4 bg-[#F3EFE8] rounded-xl">
            <p className="text-sm text-[#6B6B6B]">
              <strong className="text-[#1A1A1A]">Pour initier un retour :</strong> Contactez-nous sur WhatsApp avec votre numéro de commande et des photos du produit. Notre équipe vous guidera.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Une question sur votre livraison ?</h3>
          <p className="text-gray-400 mb-6">Nous répondons en moins d'une heure sur WhatsApp</p>
          <a href="https://wa.me/212760998347" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white px-8 py-3 rounded-xl font-bold transition-colors">
            <MessageCircle className="w-5 h-5" /> Contacter sur WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
