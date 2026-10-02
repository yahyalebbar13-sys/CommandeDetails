"use client";
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Phone } from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';
import { DELAI_ZONE, FRAIS_ZONE, PERIPHERIE_CASABLANCA } from '@/lib/livraison-boutique';
import { PLAFOND_ESPECES_COLIS } from '@/lib/commandes-boutique';
import { useReglagesReception } from '@/lib/use-reglages-reception';

// Les prix et délais viennent de livraison-boutique.ts : la FAQ dit
// toujours la même chose que le panier et le formulaire de commande. Les réponses
// qui parlent du virement ne s'affichent que si le virement est proposé au
// formulaire (RIB saisi par le patron dans « Réception & paiement »).
const prix = (zone: keyof typeof FRAIS_ZONE) => formatPrice(FRAIS_ZONE[zone]);

const FAQS = [
  {
    category: "Livraison",
    questions: [
      { q: "Comment sont livrés mes colis ?", a: "Nos colis sont livrés à domicile par notre service de livraison, dans toutes les villes du Maroc. Le livreur vous appelle avant de passer." },
      { q: "Quels sont les délais de livraison ?", a: `Nous expédions sous 24 h (jours ouvrés) après l'appel de confirmation. Casablanca : ${DELAI_ZONE.casablanca}. Périphérie de Casablanca et grandes villes : ${DELAI_ZONE.standard}. Villes éloignées : ${DELAI_ZONE.eloignee}.` },
      { q: "Quels sont les frais de livraison ?", a: `Casablanca : ${prix('casablanca')} (${prix('eloignee')} dans quelques zones éloignées, confirmé à l'appel). Périphérie de Casablanca (${PERIPHERIE_CASABLANCA.join(', ')}) et grandes villes : ${prix('standard')}. Villes éloignées et autres villes : ${prix('eloignee')}. Un seul prix par colis, quel que soit le montant de la commande. Le retrait au magasin, lui, est toujours gratuit.` },
      { q: "Puis-je ouvrir le colis avant de payer ?", a: "Non : le colis ne s'ouvre pas et ne s'essaie pas avant le paiement. Si vous voulez voir un article avant, demandez-nous des photos sur WhatsApp. Un problème à l'ouverture (article abîmé, erreur de notre part) ? Envoyez-nous une photo dans les 48 h : nous remplaçons à nos frais." },
      { q: "Puis-je retirer ma commande ?", a: "Oui, le retrait est gratuit à Casablanca, pour toute commande : les petits articles au magasin de Derb Omar, les rouleaux à notre dépôt CHRIFA. Choisissez « Retrait gratuit » en commandant. Nous vous envoyons l'adresse exacte et le lien Google Maps par WhatsApp quand la commande est prête. Elle vous attend 7 jours ouvrés." },
      { q: "Livrez-vous les rouleaux ?", a: "Oui, mais pas en colis : un rouleau entier est trop grand. Nous vous appelons pour organiser le transport : retrait gratuit à notre dépôt CHRIFA, livraison par notre camionnette à Casablanca et environs, ou envoi par un transporteur jusqu'à son dépôt dans votre ville, où vous récupérez la marchandise. Le prix vous est annoncé au téléphone ; rien n'est envoyé avant votre accord." },
      { q: "Mon transporteur peut-il venir chercher ma commande ?", a: "Oui. Donnez-nous son nom et son téléphone à l'appel. Il se présente avec votre numéro de commande et votre nom, au magasin de Derb Omar (petits articles) ou à notre dépôt CHRIFA (rouleaux). La façon de régler la commande est convenue avec vous au téléphone." },
      { q: "Livrez-vous dans tout le Maroc ?", a: "Oui, nos colis sont livrés à domicile dans toutes les villes du Maroc. Pour une ville que notre liste ne connaît pas, écrivez-la en commandant : nous confirmons le prix à l'appel." },
      { q: "Comment suivre ma commande ?", a: "Utilisez la page « Suivi de commande » du site avec votre numéro de commande, ou écrivez-nous sur WhatsApp." },
    ]
  },
  {
    category: "Paiement",
    questions: [
      { q: "Quels modes de paiement acceptez-vous ?", a: "En espèces à la réception : au livreur, ou au magasin si vous retirez votre commande. Ou par virement bancaire. Vous ne payez rien avant d'avoir commandé et d'avoir été appelé.", virement: true },
      { q: "Quels modes de paiement acceptez-vous ?", a: "En espèces à la réception : au livreur, ou au magasin si vous retirez votre commande. Vous ne payez rien avant d'avoir commandé et d'avoir été appelé.", virement: false },
      { q: "Comment payer par virement ?", a: "Choisissez « Virement bancaire » en commandant : notre RIB s'affiche juste après la commande. Mettez votre numéro de commande (LBT-…) en motif du virement. Nous envoyons ou remettons la commande dès que l'argent est arrivé sur notre compte : une capture d'écran ne suffit pas. Attention : LEBTEX ne change jamais de RIB par message.", virement: true },
      { q: "Y a-t-il un montant maximum en espèces ?", a: `Oui, pour un colis : au-delà de ${formatPrice(PLAFOND_ESPECES_COLIS)} d'espèces, nous vous proposons au téléphone la solution la plus simple (virement, retrait gratuit ou autre arrangement).` },
      { q: "Puis-je obtenir une facture ?", a: "Oui, une facture est disponible sur demande. Contactez-nous via WhatsApp après votre commande." },
    ]
  },
  {
    category: "Produits",
    questions: [
      { q: "Vos produits sont-ils de qualité professionnelle ?", a: "Oui : nos produits viennent de fournisseurs sélectionnés et sont contrôlés à l'arrivée. Nous proposons des produits pour professionnels et particuliers." },
      { q: "Proposez-vous des prix de gros ?", a: "Nos prix affichés sont des prix de gros (lots, rouleaux). Pour une grosse quantité, demandez un prix sur WhatsApp." },
      { q: "Pourquoi certains articles affichent « Prix sur demande » ?", a: "Leur prix n'est pas encore en ligne : ils ne se commandent pas sur le site. Touchez « Demander le prix sur WhatsApp » sur la fiche, nous vous répondons pendant nos horaires (lundi au samedi, 8h30–12h30 et 14h–18h)." },
      { q: "Les couleurs correspondent-elles aux photos ?", a: "Nous faisons notre maximum pour que les photos soient fidèles. De légères variations sont possibles selon les écrans, et entre deux bains de teinture. En cas de doute, contactez-nous avant de commander." },
      { q: "Puis-je commander des échantillons ?", a: "Oui, contactez-nous sur WhatsApp pour commander des échantillons avant de passer une grande commande." },
    ]
  },
  {
    category: "Retours & SAV",
    questions: [
      { q: "Puis-je retourner un produit ?", a: "Oui, vous avez 14 jours après réception pour retourner un article non utilisé, dans son emballage d'origine. Le tissu coupé au mètre à votre demande n'est ni repris ni échangé. Si vous changez d'avis, le transport du retour est à votre charge." },
      { q: "Que faire si je reçois un produit abîmé ou une erreur ?", a: "Envoyez-nous des photos sur WhatsApp dans les 48 h. Nous remplaçons l'article à nos frais, ou nous vous remboursons." },
      { q: "Comment annuler ma commande ?", a: "Écrivez-nous sur WhatsApp ou appelez-nous avant l'expédition : l'annulation est gratuite. Pour un rouleau entier, la commande devient ferme quand vous acceptez le prix du transport." },
    ]
  },
];

/** `virement` : réponse montrée seulement quand le virement est proposé (true) ou ne l'est pas (false). */
type Question = { q: string; a: string; virement?: boolean };

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#E8E4DF] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
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
  const { reglages, charge } = useReglagesReception();
  // Tant que les réglages ne sont pas lus, on ne promet pas le virement.
  const virementActif = charge && reglages.virement.actif;
  const faqs = FAQS.map(f => ({
    ...f,
    questions: (f.questions as Question[]).filter(q => q.virement === undefined || q.virement === virementActif),
  }));
  const categories = ['all', ...faqs.map(f => f.category)];
  const filtered = activeCategory === 'all' ? faqs : faqs.filter(f => f.category === activeCategory);

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
              className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
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
              {section.questions.map((item) => (
                <FaqItem key={`${item.q}-${item.virement ?? ''}`} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="mt-12 bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Vous n'avez pas trouvé votre réponse ?</h3>
          <p className="text-gray-300 mb-6">Notre équipe vous répond du lundi au samedi, de 8h30 à 12h30 et de 14h à 18h.</p>
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
