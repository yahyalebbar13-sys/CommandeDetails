"use client";
import Link from 'next/link';
import { Award, Users, TrendingUp, Heart, MapPin, Star, MessageCircle } from 'lucide-react';

const TEAM_VALUES = [
  { icon: '🎯', title: 'Qualité avant tout', desc: 'Chaque produit est soigneusement sélectionné auprès de fournisseurs certifiés pour garantir la meilleure qualité.' },
  { icon: '⚡', title: 'Réactivité', desc: 'Commandes traitées le jour même, équipe disponible 7j/7 sur WhatsApp pour répondre à toutes vos questions.' },
  { icon: '💰', title: 'Prix compétitifs', desc: 'Meilleurs prix du marché grâce à nos partenariats directs avec les fabricants. Semi-gros et détail.' },
  { icon: '🤝', title: 'Partenariat à long terme', desc: 'Nous construisons des relations durables avec nos clients. Votre satisfaction est notre priorité absolue.' },
];

const STATS = [
  { number: '500+', label: 'Produits disponibles' },
  { number: '2000+', label: 'Clients satisfaits' },
  { number: '4.8★', label: 'Note moyenne' },
  { number: '48h', label: 'Délai Casablanca max' },
];

export default function AProposPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">Notre histoire</p>
          <h1 className="text-4xl md:text-6xl font-black mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            À Propos de <span style={{ color: '#C8102E' }}>LEBTEX</span>
          </h1>
          <p className="text-gray-300 text-xl max-w-2xl mx-auto leading-relaxed">
            Votre spécialiste en accessoires textiles et mercerie au Maroc, depuis plus de 10 ans.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-[#C8102E] py-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-white text-center">
            {STATS.map(({ number, label }) => (
              <div key={label}>
                <p className="text-4xl font-black mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{number}</p>
                <p className="text-red-200 text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-16">

        {/* Story */}
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-black text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Notre histoire
            </h2>
            <div className="space-y-4 text-[#6B6B6B] leading-relaxed">
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
              <p className="font-bold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Casablanca</p>
              <p className="text-red-200 text-sm">Siège & entrepôt principal</p>
            </div>
            <div className="bg-[#D4A843] rounded-2xl p-6 text-white">
              <TrendingUp className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>+10 ans</p>
              <p className="text-yellow-200 text-sm">D'expérience dans le secteur</p>
            </div>
            <div className="bg-[#0F0F0F] rounded-2xl p-6 text-white">
              <Users className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>2000+</p>
              <p className="text-gray-400 text-sm">Clients fidèles</p>
            </div>
            <div className="bg-[#10B981] rounded-2xl p-6 text-white">
              <Award className="w-8 h-8 mb-3 opacity-80" />
              <p className="font-bold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Qualité</p>
              <p className="text-emerald-200 text-sm">Garantie sur tous les produits</p>
            </div>
          </div>
        </div>

        {/* Values */}
        <div>
          <h2 className="text-3xl font-black text-[#1A1A1A] mb-2 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>Nos valeurs</h2>
          <p className="text-center text-[#6B6B6B] mb-8">Ce qui nous guide au quotidien</p>
          <div className="grid md:grid-cols-2 gap-5">
            {TEAM_VALUES.map(({ icon, title, desc }) => (
              <div key={title} className="bg-white border border-[#E8E4DF] rounded-2xl p-6 flex gap-4">
                <span className="text-3xl shrink-0">{icon}</span>
                <div>
                  <h3 className="font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
                  <p className="text-[#6B6B6B] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div>
          <h2 className="text-3xl font-black text-[#1A1A1A] mb-2 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>Ce que disent nos clients</h2>
          <div className="grid md:grid-cols-3 gap-5 mt-8">
            {[
              { name: 'Fatima Z.', city: 'Casablanca', rating: 5, text: 'Excellente qualité de fermetures, livraison rapide. Je commande régulièrement pour mon atelier de couture.' },
              { name: 'Ahmed B.', city: 'Marrakech', rating: 5, text: 'Prix imbattables pour les élastiques et biais. Service client très réactif sur WhatsApp. Je recommande !' },
              { name: 'Samira R.', city: 'Rabat', rating: 4, text: 'Large gamme de produits, tout ce qu\'il faut pour la mercerie. Paiement à la livraison très pratique.' },
            ].map(({ name, city, rating, text }) => (
              <div key={name} className="bg-white border border-[#E8E4DF] rounded-2xl p-6">
                <div className="flex text-[#D4A843] mb-3 text-lg">{'★'.repeat(rating)}</div>
                <p className="text-[#6B6B6B] text-sm leading-relaxed mb-4 italic">"{text}"</p>
                <div className="flex items-center gap-2">
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

        {/* CTA */}
        <div className="bg-[#0F0F0F] rounded-2xl p-10 text-center text-white">
          <Heart className="w-10 h-10 text-[#C8102E] mx-auto mb-4" />
          <h3 className="text-3xl font-black mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Rejoignez la famille LEBTEX</h3>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">Commandez dès maintenant et découvrez pourquoi des milliers de couturiers nous font confiance.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/shop/boutique"
              className="px-8 py-4 bg-[#C8102E] hover:bg-[#a00d25] text-white font-bold rounded-xl transition-colors">
              Découvrir la boutique
            </Link>
            <a href="https://wa.me/212760998347" target="_blank" rel="noopener noreferrer"
              className="px-8 py-4 bg-[#25D366] hover:bg-[#1da851] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5" /> Nous contacter
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
