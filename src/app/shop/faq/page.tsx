"use client";
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Phone, Mail, MapPin } from 'lucide-react';

const FAQS = [
  {
    category: "Livraison",
    questions: [
      { q: "Quels sont les délais de livraison ?", a: "Casablanca : 24-48h. Grandes villes (Rabat, Marrakech, Fès, Tanger, Agadir) : 1-2 jours. Autres villes : 3-5 jours ouvrables." },
      { q: "Quels sont les frais de livraison ?", a: "Casablanca : 25 MAD. Grandes villes : 35 MAD. Autres régions : 50 MAD. Livraison GRATUITE dès 500 MAD d'achat !" },
      { q: "Livrez-vous dans tout le Maroc ?", a: "Oui, nous livrons dans toutes les villes et régions du Maroc via nos partenaires logistiques (Amana, Jibli, Cathedis)." },
      { q: "Comment suivre ma commande ?", a: "Une fois votre commande expédiée, vous recevrez un numéro de suivi. Vous pouvez aussi utiliser notre page de suivi sur le site ou nous contacter sur WhatsApp." },
    ]
  },
  {
    category: "Paiement",
    questions: [
      { q: "Quels modes de paiement acceptez-vous ?", a: "Nous acceptons le paiement à la livraison (cash). Vous payez uniquement quand vous recevez votre commande et vérifiez les articles." },
      { q: "Est-ce sécurisé de commander en ligne ?", a: "Absolument. Avec le paiement à la livraison, vous ne payez qu'à la réception. Aucun risque financier !" },
      { q: "Puis-je obtenir une facture ?", a: "Oui, une facture est disponible sur demande. Contactez-nous via WhatsApp après votre commande." },
    ]
  },
  {
    category: "Produits",
    questions: [
      { q: "Vos produits sont-ils de qualité professionnelle ?", a: "Oui, tous nos produits sont sélectionnés auprès de fournisseurs certifiés. Nous proposons des produits pour professionnels et particuliers." },
      { q: "Proposez-vous des prix de gros ?", a: "Oui ! Nous proposons des tarifs semi-gros et gros selon les quantités commandées. Contactez-nous pour un devis personnalisé." },
      { q: "Les couleurs correspondent-elles aux photos ?", a: "Nous faisons notre maximum pour que les photos soient fidèles. Des légères variations sont possibles selon les écrans. En cas de doute, contactez-nous avant commande." },
      { q: "Puis-je commander des échantillons ?", a: "Oui, contactez-nous sur WhatsApp pour commander des échantillons avant de passer une grande commande." },
    ]
  },
  {
    category: "Retours & SAV",
    questions: [
      { q: "Puis-je retourner un produit ?", a: "Oui, vous avez 14 jours après réception pour retourner un produit non utilisé dans son emballage d'origine. Les frais de retour sont à votre charge." },
      { q: "Que faire si je reçois un produit défectueux ?", a: "Contactez-nous immédiatement via WhatsApp avec des photos. Nous remplaçons ou remboursons tout produit défectueux gratuitement." },
      { q: "Comment annuler ma commande ?", a: "Contactez-nous dans les 2h suivant la commande via WhatsApp ou téléphone. Après expédition, l'annulation n'est plus possible." },
    ]
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#E8E4DF] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-[#FBF8F3] transition-colors"
      >
        <span className="font-semibold text-[#1A1A1A] pr-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-[#C8102E] shrink-0" /> : <ChevronDown className="w-5 h-5 text-[#6B6B6B] shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 bg-white border-t border-[#E8E4DF]">
          <p className="text-[#6B6B6B] leading-relaxed pt-4">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const categories = ['all', ...FAQS.map(f => f.category)];
  const filtered = activeCategory === 'all' ? FAQS : FAQS.filter(f => f.category === activeCategory);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">Centre d'aide</p>
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Questions Fréquentes
          </h1>
          <p className="text-gray-400 text-lg">Trouvez rapidement les réponses à vos questions</p>
        </div>
      </div>

      {/* Categories filter */}
      <div className="sticky top-16 bg-white border-b border-[#E8E4DF] z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? 'bg-[#C8102E] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'all' ? 'Toutes les questions' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {filtered.map(section => (
          <div key={section.category} className="mb-10">
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-4 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <span className="w-1 h-6 rounded bg-[#C8102E] inline-block" />
              {section.category}
            </h2>
            <div className="space-y-3">
              {section.questions.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="mt-12 bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Vous n'avez pas trouvé votre réponse ?</h3>
          <p className="text-gray-400 mb-6">Notre équipe est disponible 6j/7 pour vous aider</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://wa.me/212760998347" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white px-6 py-3 rounded-xl font-semibold transition-colors">
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </a>
            <a href="tel:+212760998347"
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
              <Phone className="w-5 h-5" /> 0760 998 347
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
