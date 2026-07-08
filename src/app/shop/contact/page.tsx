"use client";
import { useState } from 'react';
import { MessageCircle, Phone, Mail, MapPin, Clock, CheckCircle, Send } from 'lucide-react';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = encodeURIComponent(
      `Bonjour LEBTEX 👋\n\nNom: ${form.name}\nTél: ${form.phone}\nEmail: ${form.email}\nSujet: ${form.subject}\n\nMessage:\n${form.message}`
    );
    window.open(`https://wa.me/212760998347?text=${msg}`, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-16">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">Nous contacter</p>
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            On est là pour vous !
          </h1>
          <p className="text-gray-400 text-lg">Notre équipe répond dans l'heure sur WhatsApp</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-5 gap-10">

          {/* Contact Info (2/5) */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Nos coordonnées
              </h2>
              <div className="space-y-4">
                {[
                  { icon: MessageCircle, label: 'WhatsApp (Recommandé)', value: '+212 760 998 347', href: 'https://wa.me/212760998347', color: '#25D366', bg: '#f0fdf4' },
                  { icon: Phone, label: 'Téléphone', value: '0760 998 347', href: 'tel:+212760998347', color: '#C8102E', bg: '#fef2f4' },
                  { icon: Mail, label: 'Email', value: 'contact@lebtex.ma', href: 'mailto:contact@lebtex.ma', color: '#3B82F6', bg: '#eff6ff' },
                  { icon: MapPin, label: 'Adresse', value: 'Casablanca, Maroc', href: 'https://maps.google.com/?q=Casablanca+Maroc', color: '#D4A843', bg: '#fffbeb' },
                ].map(({ icon: Icon, label, value, href, color, bg }) => (
                  <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                    className="flex items-start gap-4 p-4 rounded-xl border border-[#E8E4DF] bg-white hover:shadow-md transition-all group">
                    <div className="p-2.5 rounded-xl" style={{ background: bg }}>
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-xs text-[#6B6B6B] font-medium mb-0.5">{label}</p>
                      <p className="font-semibold text-[#1A1A1A] group-hover:text-[#C8102E] transition-colors">{value}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="bg-white border border-[#E8E4DF] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-[#D4A843]" />
                <h3 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Horaires</h3>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { day: 'Lundi - Vendredi', hours: '8h00 - 20h00' },
                  { day: 'Samedi', hours: '9h00 - 18h00' },
                  { day: 'Dimanche', hours: '10h00 - 16h00' },
                ].map(({ day, hours }) => (
                  <div key={day} className="flex justify-between items-center py-2 border-b border-[#F3EFE8] last:border-0">
                    <span className="text-[#6B6B6B]">{day}</span>
                    <span className="font-semibold text-[#1A1A1A]">{hours}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[#25D366] font-semibold">
                <span className="w-2 h-2 bg-[#25D366] rounded-full animate-pulse" />
                WhatsApp disponible 7j/7
              </div>
            </div>
          </div>

          {/* Contact Form (3/5) */}
          <div className="md:col-span-3">
            <div className="bg-white border border-[#E8E4DF] rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Envoyez-nous un message
              </h2>
              <p className="text-[#6B6B6B] text-sm mb-6">Nous vous répondrons dans les 2h sur WhatsApp</p>

              {sent && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-green-700 font-medium">Message envoyé sur WhatsApp ! Nous vous répondons bientôt.</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Nom complet *</label>
                    <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                      placeholder="Votre nom"
                      aria-label="Nom complet"
                      className="w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Téléphone *</label>
                    <input required value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                      placeholder="06 XX XX XX XX"
                      aria-label="Téléphone"
                      className="w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Email (optionnel)</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                    placeholder="votre@email.com"
                    aria-label="Email"
                    className="w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Sujet *</label>
                  <select required value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                    aria-label="Sujet"
                    className="w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all bg-white">
                    <option value="">Choisir un sujet</option>
                    <option>Commande et livraison</option>
                    <option>Retour / remboursement</option>
                    <option>Question produit</option>
                    <option>Tarifs semi-gros / gros</option>
                    <option>Partenariat</option>
                    <option>Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Message *</label>
                  <textarea required rows={5} value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                    placeholder="Décrivez votre demande..."
                    aria-label="Message"
                    className="w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all resize-none" />
                </div>
                <button type="submit"
                  className="w-full py-4 bg-[#C8102E] hover:bg-[#a00d25] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-base">
                  <Send className="w-5 h-5" />
                  Envoyer via WhatsApp
                </button>
                <p className="text-xs text-center text-[#6B6B6B]">
                  En soumettant, vous serez redirigé vers WhatsApp avec votre message pré-rempli.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
