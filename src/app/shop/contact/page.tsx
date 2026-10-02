"use client";
import { useState } from 'react';
import { MessageCircle, Phone, Mail, MapPin, Clock, Send, Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import {
  ADRESSE_SIEGE,
  EMAIL_LEBTEX,
  lienTel,
  ligneNumerosLegaux,
  RAISON_SOCIALE,
  TELEPHONES_SIEGE,
  WHATSAPP_BOUTIQUE,
} from '@/lib/identite-lebtex';

// Horaires réels de l'équipe (les mêmes que le pied de page et les magasins)
const HORAIRES = { fr: 'du lundi au samedi, 8h30–18h30', ar: 'من الإثنين إلى السبت، 8:30 – 18:30' };

// Sujets du formulaire, dans la langue du site (le message WhatsApp reprend le texte choisi)
const SUJETS = [
  { fr: 'Commande et livraison', ar: 'الطلب والتوصيل' },
  { fr: 'Retour / remboursement', ar: 'الإرجاع / الاسترداد' },
  { fr: 'Question produit', ar: 'سؤال عن منتج' },
  { fr: 'Tarifs semi-gros / gros', ar: 'أثمنة نصف الجملة / الجملة' },
  { fr: 'Partenariat', ar: 'شراكة' },
  { fr: 'Autre', ar: 'موضوع آخر' },
];

// Siège : l'adresse des documents officiels, à ouvrir dans Google Maps
const CARTE_SIEGE = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADRESSE_SIEGE.fr}, Maroc`)}`;

export default function ContactPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = encodeURIComponent(
      ar
        ? `السلام عليكم LEBTEX\n\nالاسم: ${form.name}\nالهاتف: ${form.phone}\nالبريد: ${form.email}\nالموضوع: ${form.subject}\n\nالرسالة:\n${form.message}`
        : `Bonjour LEBTEX 👋\n\nNom: ${form.name}\nTél: ${form.phone}\nEmail: ${form.email}\nSujet: ${form.subject}\n\nMessage:\n${form.message}`
    );
    window.open(`https://wa.me/212760998347?text=${msg}`, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  };

  // Coordonnées : WhatsApp d'abord, puis les fixes du siège, l'e-mail, les magasins et le siège
  const coordonnees = [
    { icon: MessageCircle, label: ar ? 'واتساب (الأفضل)' : 'WhatsApp (recommandé)', value: WHATSAPP_BOUTIQUE, ltr: true, href: 'https://wa.me/212760998347', color: '#25D366', bg: '#f0fdf4' },
    ...TELEPHONES_SIEGE.map(tel => (
      { icon: Phone, label: ar ? 'الهاتف الثابت (المقر)' : 'Téléphone fixe (siège)', value: tel, ltr: true, href: lienTel(tel), color: '#C8102E', bg: '#fef2f4' }
    )),
    { icon: Mail, label: ar ? 'البريد الإلكتروني' : 'E-mail', value: EMAIL_LEBTEX, ltr: true, href: `mailto:${EMAIL_LEBTEX}`, color: '#3B82F6', bg: '#eff6ff' },
    { icon: MapPin, label: ar ? 'محلاتنا' : 'Nos magasins', value: ar ? 'درب عمر وشارع حيفا، الدار البيضاء' : 'Derb Omar et Boulevard Haïfa, Casablanca', ltr: false, href: '/shop/a-propos', color: '#D4A843', bg: '#fffbeb' },
    { icon: Building2, label: ar ? 'المقر' : 'Siège', value: ADRESSE_SIEGE[language], ltr: false, href: CARTE_SIEGE, color: '#0F0F0F', bg: '#F3EFE8' },
  ];

  const champ = 'w-full px-4 py-3 border border-[#E8E4DF] rounded-xl focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] outline-none transition-all';

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">{ar ? 'اتصل بنا' : 'Nous contacter'}</p>
          <h1 className="text-3xl md:text-5xl font-black mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {ar ? 'نحن هنا لخدمتك!' : 'On est là pour vous !'}
          </h1>
          <p className="text-gray-400 text-base sm:text-lg">{ar ? 'نجيبك على واتساب' : 'Réponse sur WhatsApp'} {HORAIRES[language]}</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="grid md:grid-cols-5 gap-10">

          {/* Contact Info (2/5) */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {ar ? 'معلومات الاتصال' : 'Nos coordonnées'}
              </h2>
              <div className="space-y-4">
                {coordonnees.map(({ icon: Icon, label, value, ltr, href, color, bg }) => (
                  <a key={`${label}-${value}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                    className="flex items-start gap-4 p-4 rounded-xl border border-[#E8E4DF] bg-white hover:shadow-md transition-all group">
                    <div className="p-2.5 rounded-xl shrink-0" style={{ background: bg }}>
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-[#6B6B6B] font-medium mb-0.5">{label}</p>
                      <p className="font-semibold text-[#1A1A1A] group-hover:text-[#C8102E] transition-colors break-words">
                        {ltr ? <bdi dir="ltr">{value}</bdi> : value}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
              {/* Identité légale (celle des factures) */}
              <p className="mt-4 text-xs text-[#6B6B6B] leading-relaxed">
                <bdi dir="ltr">{RAISON_SOCIALE}</bdi> — {ligneNumerosLegaux(language)}
              </p>
            </div>

            {/* Hours */}
            <div className="bg-white border border-[#E8E4DF] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-[#D4A843]" />
                <h3 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>{ar ? 'أوقات العمل' : 'Horaires'}</h3>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { day: ar ? 'من الإثنين إلى السبت' : 'Lundi - Samedi', hours: '8h30 - 18h30' },
                  { day: ar ? 'الأحد' : 'Dimanche', hours: ar ? 'مغلق' : 'Fermé' },
                ].map(({ day, hours }) => (
                  <div key={day} className="flex justify-between items-center py-2 border-b border-[#F3EFE8] last:border-0">
                    <span className="text-[#6B6B6B]">{day}</span>
                    <bdi className="font-semibold text-[#1A1A1A]">{hours}</bdi>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[#128C7E] font-semibold">
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                {ar ? 'نجيبك على واتساب' : 'Réponse sur WhatsApp'} {HORAIRES[language]}
              </div>
            </div>
          </div>

          {/* Contact Form (3/5) */}
          <div className="md:col-span-3">
            <div className="bg-white border border-[#E8E4DF] rounded-2xl p-5 sm:p-8">
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {ar ? 'أرسل لنا رسالة' : 'Envoyez-nous un message'}
              </h2>
              <p className="text-[#6B6B6B] text-sm mb-6">
                {ar
                  ? 'نجيبك على واتساب اليوم خلال أوقات العمل (من الإثنين إلى السبت، 8:30 – 18:30)، وإلا في يوم العمل الموالي.'
                  : 'Nous vous répondons sur WhatsApp aujourd’hui pendant nos horaires (lundi au samedi, 8h30–18h30), sinon le jour ouvré suivant.'}
              </p>

              {/* Rien n'est parti tant que le client n'a pas appuyé sur Envoyer dans WhatsApp */}
              {sent && (
                <div role="status" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-green-700 font-medium">
                    {ar ? 'واتساب يفتح برسالتك: اضغط على «إرسال» لتصلنا.' : 'WhatsApp s’ouvre avec votre message : appuyez sur Envoyer pour nous l’envoyer.'}
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">{ar ? 'الاسم الكامل *' : 'Nom complet *'}</label>
                    <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                      placeholder={ar ? 'اسمك' : 'Votre nom'}
                      aria-label={ar ? 'الاسم الكامل' : 'Nom complet'}
                      className={champ} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">{ar ? 'الهاتف *' : 'Téléphone *'}</label>
                    <input required type="tel" dir="ltr" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                      placeholder="06 XX XX XX XX"
                      aria-label={ar ? 'الهاتف' : 'Téléphone'}
                      className={champ} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">{ar ? 'البريد الإلكتروني (اختياري)' : 'Email (optionnel)'}</label>
                  <input type="email" dir="ltr" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                    placeholder="votre@email.com"
                    aria-label={ar ? 'البريد الإلكتروني' : 'Email'}
                    className={champ} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">{ar ? 'الموضوع *' : 'Sujet *'}</label>
                  <select required value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                    aria-label={ar ? 'الموضوع' : 'Sujet'}
                    className={`${champ} bg-white`}>
                    <option value="">{ar ? 'اختر موضوعاً' : 'Choisir un sujet'}</option>
                    {SUJETS.map(sujet => <option key={sujet.fr}>{sujet[language]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">{ar ? 'الرسالة *' : 'Message *'}</label>
                  <textarea required rows={5} value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                    placeholder={ar ? 'اكتب طلبك...' : 'Décrivez votre demande...'}
                    aria-label={ar ? 'الرسالة' : 'Message'}
                    className={`${champ} resize-none`} />
                </div>
                <button type="submit"
                  className="w-full py-4 bg-[#C8102E] hover:bg-[#a00d25] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-base">
                  <Send className="w-5 h-5 rtl:-scale-x-100" />
                  {ar ? 'إرسال عبر واتساب' : 'Envoyer via WhatsApp'}
                </button>
                <p className="text-xs text-center text-[#6B6B6B]">
                  {ar
                    ? 'عند الإرسال، يفتح واتساب برسالتك جاهزة.'
                    : 'En soumettant, vous serez redirigé vers WhatsApp avec votre message pré-rempli.'}
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
