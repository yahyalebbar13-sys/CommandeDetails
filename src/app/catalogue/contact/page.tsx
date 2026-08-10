'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Phone, Mail, MapPin, Clock, Send, ChevronRight } from 'lucide-react';

export default function ContactPage() {
  const [message, setMessage] = useState('');

  const handleWhatsAppRedirect = (e: React.FormEvent) => {
    e.preventDefault();
    const encodedMessage = encodeURIComponent(message || "Bonjour, je vous contacte depuis le site web LEBTEX concernant le catalogue.");
    window.open(`https://wa.me/212760998347?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0C0C0C] to-[#1A1A1A] text-white p-4 md:p-8 font-sans" style={{ fontFamily: 'Inter, Outfit, sans-serif' }}>
      <div className="max-w-6xl mx-auto">
        <Link href="/catalogue" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Retour au catalogue
        </Link>

        <div className="text-center mb-16 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#25D366]/10 rounded-full blur-[100px]"></div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 relative z-10 bg-gradient-to-r from-white via-white to-gray-400 text-transparent bg-clip-text">
            On est là pour <span className="text-[#D4A843]">vous !</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto relative z-10">
            Notre équipe commerciale répond dans l'heure sur WhatsApp pour toutes vos demandes de devis ou commandes.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 mb-16">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-[#25D366]/20 to-transparent border border-[#25D366]/30 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#25D366]/20 rounded-full blur-xl group-hover:bg-[#25D366]/30 transition-all"></div>
              <MessageSquare className="w-8 h-8 text-[#25D366] mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">WhatsApp Direct</h3>
              <p className="text-gray-300 mb-4">+212 760 998 347</p>
              <a href="https://wa.me/212760998347" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[#25D366] font-medium hover:underline">
                Discuter maintenant <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md hover:bg-white/10 transition-colors">
              <Phone className="w-8 h-8 text-[#C8102E] mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Téléphone</h3>
              <p className="text-gray-300 mb-4">+212 760 998 347</p>
              <a href="tel:+212760998347" className="inline-flex items-center text-[#C8102E] font-medium hover:underline">
                Appeler le service commercial <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md hover:bg-white/10 transition-colors">
              <Mail className="w-8 h-8 text-gray-400 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Email</h3>
              <p className="text-gray-300 mb-4">contact@lebtex.ma</p>
              <a href="mailto:contact@lebtex.ma" className="inline-flex items-center text-gray-300 font-medium hover:text-white transition-colors">
                Nous envoyer un email <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl h-full flex flex-col">
              <h2 className="text-3xl font-bold mb-6">Envoyez-nous un message</h2>
              <p className="text-gray-400 mb-8">
                Utilisez ce formulaire pour pré-remplir votre message WhatsApp. C'est le moyen le plus rapide d'obtenir une réponse de notre équipe.
              </p>

              <form onSubmit={handleWhatsAppRedirect} className="flex-1 flex flex-col">
                <div className="mb-6 flex-1">
                  <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                    Votre message
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Bonjour, je suis intéressé par vos articles de mercerie. Pourriez-vous m'envoyer plus de détails sur..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E] transition-all resize-none"
                  ></textarea>
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#25D366] to-[#1DA851] text-white font-bold py-4 rounded-xl flex items-center justify-center hover:shadow-lg hover:shadow-[#25D366]/20 transition-all hover:-translate-y-1"
                >
                  <Send className="w-5 h-5 mr-2" />
                  Envoyer via WhatsApp
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center mb-6">
              <Clock className="w-8 h-8 text-[#D4A843] mr-4" />
              <h2 className="text-2xl font-bold">Nos Horaires</h2>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-gray-300">Lundi - Vendredi</span>
                <span className="font-bold text-white">08:00 - 20:00</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-gray-300">Samedi</span>
                <span className="font-bold text-white">09:00 - 18:00</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-gray-300">Dimanche</span>
                <span className="font-bold text-white">10:00 - 16:00</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-[#25D366] font-medium flex items-center"><MessageSquare className="w-4 h-4 mr-2" /> WhatsApp</span>
                <span className="font-bold text-[#25D366]">7j/7</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center mb-6">
              <MapPin className="w-8 h-8 text-[#C8102E] mr-4" />
              <h2 className="text-2xl font-bold">Adresse</h2>
            </div>
            <div className="h-full flex flex-col justify-center">
              <p className="text-xl font-bold text-white mb-2">LEBTEX Siège Social</p>
              <p className="text-gray-300 text-lg mb-6">
                Boulevard Haïfa<br />
                Casablanca, Maroc
              </p>
              <Link href="/catalogue/a-propos" className="text-[#D4A843] font-medium hover:underline inline-flex items-center">
                Voir tous nos magasins <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
