import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Truck, Clock, MapPin, RotateCcw, Package, CheckCircle, AlertCircle, MessageCircle,
  Store, Banknote, Landmark, Phone,
} from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';
import {
  DELAI_ZONE, FRAIS_ZONE, GRANDES_VILLES, LIBELLE_ZONE, PERIPHERIE_CASABLANCA, VILLES_ELOIGNEES,
} from '@/lib/livraison-boutique';
import { PLAFOND_ESPECES_COLIS } from '@/lib/commandes-boutique';

// Page statique : tous les prix et délais viennent de livraison-boutique.ts,
// la même source que le panier et le formulaire de commande. Rien à recopier ici
// quand la grille change. Le virement n'est proposé au formulaire que si le patron a
// saisi son RIB : la page le dit (« si l'option est proposée »), sans le promettre.

export const metadata: Metadata = {
  title: 'Livraison, retrait et paiement | LEBTEX',
  description:
    `Colis livrés à domicile partout au Maroc : ${FRAIS_ZONE.casablanca} MAD à Casablanca en ${DELAI_ZONE.casablanca}, dès ${FRAIS_ZONE.standard} MAD ailleurs. ` +
    'Retrait gratuit à Casablanca. Rouleaux entiers : transport organisé par téléphone.',
};

/** Les 3 façons de recevoir une commande. */
const FACONS = [
  {
    icon: Truck,
    quoi: 'Petits articles et coupes pliées',
    exemples: 'Fermetures, boutons, fils, élastiques, rubans, tissu coupé',
    comment: 'Livraison à domicile, en colis',
    prix: `${formatPrice(FRAIS_ZONE.casablanca)} à ${formatPrice(FRAIS_ZONE.eloignee)} selon la ville`,
    prixNote: 'Un seul colis pour toute la commande, payé à la réception',
    delai: '24 h à 4 jours ouvrés',
  },
  {
    icon: Store,
    quoi: 'Toute commande',
    exemples: 'Petits articles au magasin de Derb Omar, rouleaux à notre dépôt CHRIFA',
    comment: 'Retrait gratuit à Casablanca',
    prix: 'Gratuit',
    prixNote: 'Vous payez sur place',
    delai: 'Prête en général le jour ouvré suivant l’appel',
  },
  {
    icon: Phone,
    quoi: 'Rouleaux entiers et grosses quantités',
    exemples: 'Ils ne partent pas en colis',
    comment: 'Transport organisé par téléphone',
    prix: 'Annoncé au téléphone',
    prixNote: 'Rien n’est envoyé avant votre accord',
    delai: 'Selon le transport choisi',
  },
];

/** Les paliers des colis Sendit, avec leurs villes. */
const PALIERS = [
  {
    zone: 'casablanca' as const,
    villes: 'Casablanca',
    note: `${formatPrice(FRAIS_ZONE.eloignee)} dans quelques zones éloignées de Casablanca, confirmé à l’appel`,
  },
  {
    zone: 'standard' as const,
    villes: [...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES].join(', '),
    note: '',
  },
  {
    zone: 'eloignee' as const,
    villes: `${VILLES_ELOIGNEES.join(', ')}, et toute ville qui n’est pas citée`,
    note: '',
  },
];

const ETAPES = [
  { step: '01', title: 'Commande passée', desc: 'Vous commandez sur le site. Notre équipe la reçoit tout de suite.', icon: Package },
  {
    step: '02', title: 'Appel de confirmation', icon: Phone,
    desc: 'Nous vous appelons aujourd’hui pendant nos horaires (lundi au samedi, 8h30–18h30), sinon le jour ouvré suivant : articles, adresse, frais.',
  },
  {
    step: '03', title: 'Préparation et expédition', icon: Truck,
    desc: 'Expédition sous 24 h (jours ouvrés) après l’appel. Pour un retrait, nous vous prévenons par WhatsApp quand la commande est prête, avec l’adresse et le lien Google Maps.',
  },
  {
    step: '04', title: 'Réception et paiement', icon: MapPin,
    desc: 'Le livreur vous appelle avant de passer. Vous payez à la réception, en espèces, ou par virement si l’option vous est proposée en commandant.',
  },
];

export default function LivraisonPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="bg-[#0F0F0F] text-white py-14 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">Livraison, retrait et paiement</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Livraison partout au Maroc 🇲🇦
          </h1>
          <p className="text-gray-300 text-base sm:text-lg">Livraison à domicile • Retrait gratuit à Casablanca • Paiement à la réception</p>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[#D4A843]/20 border border-[#D4A843]/30 rounded-3xl sm:rounded-full px-5 py-2">
            <span className="text-[#D4A843] font-bold">🚚 {formatPrice(FRAIS_ZONE.casablanca)} à Casablanca, en {DELAI_ZONE.casablanca}</span>
            <span className="text-[#E9C77A] text-sm">· dès {formatPrice(FRAIS_ZONE.standard)} partout ailleurs</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-12">

        {/* Key info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Truck, title: 'Livraison à domicile', desc: `Partout au Maroc, dès ${formatPrice(FRAIS_ZONE.casablanca)}`, color: '#3B82F6', bg: '#eff6ff' },
            { icon: Clock, title: 'Expédition sous 24 h', desc: 'Jours ouvrés, après l’appel de confirmation', color: '#10B981', bg: '#f0fdf4' },
            { icon: Store, title: 'Retrait gratuit', desc: 'À Casablanca, pour toute commande', color: '#D4A843', bg: '#fffbeb' },
            { icon: Banknote, title: 'Paiement à la réception', desc: 'En espèces (virement si l’option est proposée)', color: '#C8102E', bg: '#fef2f4' },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="bg-white border border-[#E8E4DF] rounded-2xl p-4 sm:p-5 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-6 h-6" style={{ color }} />
              </div>
              <h2 className="font-bold text-[#1A1A1A] text-sm mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h2>
              <p className="text-xs text-[#6B6B6B]">{desc}</p>
            </div>
          ))}
        </div>

        {/* Les 3 façons de recevoir sa commande */}
        <section>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            3 façons de recevoir votre commande
          </h2>
          <p className="text-sm text-[#6B6B6B] mb-6">Vous choisissez au moment de commander. Nous confirmons tout à l’appel.</p>
          <div className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[1.3fr_1fr_1fr_0.9fr] gap-4 bg-[#F3EFE8] px-6 py-3 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
              <span>Ce que vous commandez</span>
              <span>Comment</span>
              <span>Prix</span>
              <span>Délai</span>
            </div>
            {FACONS.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.comment}
                  className={`px-5 sm:px-6 py-5 grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_0.9fr] gap-2 md:gap-4 md:items-center ${i === 0 ? '' : 'border-t border-[#F3EFE8]'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FBF8F3] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-[#C8102E]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1A1A1A]">{f.quoi}</p>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">{f.exemples}</p>
                    </div>
                  </div>
                  <p className="text-sm text-[#1A1A1A] md:pl-0 pl-[52px]">
                    <span className="md:hidden text-[#6B6B6B]">Comment : </span>{f.comment}
                  </p>
                  <div className="text-sm md:pl-0 pl-[52px]">
                    <p className="font-bold text-[#1A1A1A]"><span className="md:hidden font-normal text-[#6B6B6B]">Prix : </span>{f.prix}</p>
                    <p className="text-xs text-[#0F7A55] mt-0.5">{f.prixNote}</p>
                  </div>
                  <p className="text-sm text-[#1A1A1A] md:pl-0 pl-[52px]">
                    <span className="md:hidden text-[#6B6B6B]">Délai : </span>{f.delai}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Tarifs des colis */}
        <section>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Tarifs de la livraison à domicile
          </h2>
          <p className="text-sm text-[#6B6B6B] mb-6">Le prix dépend de votre ville. Il s’affiche avant de valider la commande.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {PALIERS.map((p) => (
              <div key={p.zone} className="bg-white border border-[#E8E4DF] rounded-2xl p-5 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">{LIBELLE_ZONE[p.zone]}</p>
                <p className="mt-2 text-3xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {formatPrice(FRAIS_ZONE[p.zone])}
                </p>
                <p className="text-sm font-semibold text-[#1A1A1A] mt-1">Délai : {DELAI_ZONE[p.zone]}</p>
                {p.note && <p className="text-xs text-[#6B6B6B] mt-2">{p.note}</p>}
                <p className="text-sm text-[#6B6B6B] mt-4 pt-4 border-t border-[#F3EFE8] leading-relaxed">{p.villes}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#6B6B6B] mt-3 flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Les délais se comptent en jours ouvrés, à partir de l’appel de confirmation. Le prix du colis est le même quel que soit le montant de la commande ; le retrait est toujours gratuit.
          </p>
        </section>

        {/* Bon à savoir : colis */}
        <section className="bg-white border border-[#E8E4DF] rounded-2xl p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 bg-[#eff6ff] rounded-xl"><Package className="w-6 h-6 text-[#3B82F6]" /></div>
            <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Bon à savoir sur les colis</h2>
          </div>
          <ul className="space-y-3 text-sm text-[#4B4B4B]">
            {[
              'Le colis ne s’ouvre pas et ne s’essaie pas avant le paiement. Si vous voulez voir un article avant, demandez-nous des photos sur WhatsApp.',
              'Un problème à l’ouverture (article abîmé, erreur de notre part) ? Envoyez-nous une photo sur WhatsApp dans les 48 h : nous remplaçons à nos frais.',
              `Au-delà de ${formatPrice(PLAFOND_ESPECES_COLIS)} d’espèces pour un colis, nous vous proposons au téléphone la solution la plus simple (virement, retrait gratuit ou autre arrangement).`,
            ].map((t) => (
              <li key={t} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
        </section>

        {/* Rouleaux entiers */}
        <section className="bg-[#FFF8E6] border border-[#F0DDA8] rounded-2xl p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white rounded-xl"><Truck className="w-6 h-6 text-[#8a6a1f]" /></div>
            <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Rouleaux entiers et grosses quantités</h2>
          </div>
          <p className="text-sm text-[#4B4B4B] mb-4">
            Un rouleau entier est trop grand pour un colis. Pas de frais affichés : nous vous appelons pour organiser le transport, et rien n’est envoyé avant votre accord.
          </p>
          <ul className="space-y-3 text-sm text-[#4B4B4B]">
            <li className="flex items-start gap-2">
              <Store className="w-4 h-4 text-[#8a6a1f] mt-0.5 shrink-0" />
              <span><strong className="text-[#1A1A1A]">Retrait gratuit</strong> à notre dépôt CHRIFA, à Casablanca.</span>
            </li>
            <li className="flex items-start gap-2">
              <Truck className="w-4 h-4 text-[#8a6a1f] mt-0.5 shrink-0" />
              <span>
                <strong className="text-[#1A1A1A]">Notre camionnette</strong> à Casablanca et environs ({PERIPHERIE_CASABLANCA.join(', ')}), à la prochaine tournée.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#8a6a1f] mt-0.5 shrink-0" />
              <span>
                <strong className="text-[#1A1A1A]">Dans une autre ville</strong> : un transporteur emporte la marchandise jusqu’à son dépôt dans votre ville, et vous la récupérez à ce dépôt. Votre propre transporteur peut aussi venir la chercher chez nous.
              </span>
            </li>
          </ul>
        </section>

        {/* Paiement */}
        <section>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Paiement</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white border border-[#E8E4DF] rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Banknote className="w-5 h-5 text-[#10B981]" />
                <h3 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>En espèces, à la réception</h3>
              </div>
              <p className="text-sm text-[#6B6B6B]">Au livreur quand il vous remet le colis, ou au magasin quand vous retirez votre commande. Vous ne payez rien avant.</p>
            </div>
            <div className="bg-white border border-[#E8E4DF] rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Landmark className="w-5 h-5 text-[#3B82F6]" />
                <h3 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Par virement bancaire</h3>
              </div>
              <p className="text-sm text-[#6B6B6B]">
                Si l’option « Virement bancaire » vous est proposée en commandant : notre RIB s’affiche juste après la commande. Mettez votre numéro de commande en motif. Nous envoyons dès que l’argent est arrivé sur notre compte.
              </p>
              <p className="text-xs font-semibold text-[#C8102E] mt-3">LEBTEX ne change jamais de RIB par message.</p>
            </div>
          </div>
        </section>

        {/* Process */}
        <section>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Comment ça marche ?
          </h2>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#E8E4DF] hidden md:block" />
            <div className="space-y-4">
              {ETAPES.map(({ step, title, desc, icon: Icon }) => (
                <div key={step} className="flex gap-6 items-start pl-0 md:pl-12 relative">
                  <div className="absolute left-0 top-2 w-12 h-12 rounded-full bg-[#C8102E] text-white font-black text-sm items-center justify-center hidden md:flex z-10" style={{ fontFamily: 'Outfit, sans-serif' }}>
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
        </section>

        {/* Returns policy */}
        <section className="bg-white border border-[#E8E4DF] rounded-2xl p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#fef2f4] rounded-xl">
              <RotateCcw className="w-6 h-6 text-[#C8102E]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Politique de retour</h2>
              <p className="text-sm text-[#6B6B6B]">14 jours pour changer d’avis, sauf tissu coupé au mètre</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#10B981]" /> Ce que nous reprenons
              </h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                {[
                  'Article non utilisé, dans son emballage d’origine (film intact pour un rouleau)',
                  'Retour dans les 14 jours suivant la réception',
                  'Article abîmé ou erreur de notre part : remplacé à nos frais',
                  'Article non conforme à la description',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2"><span className="text-[#10B981] mt-0.5">✓</span>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F59E0B]" /> Ce que nous ne reprenons pas
              </h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                {[
                  'Tissu coupé au mètre à votre demande',
                  'Article utilisé ou lavé',
                  'Article sans son emballage d’origine',
                  'Retour après 14 jours',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2"><span className="text-red-500 mt-0.5">✗</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 p-4 bg-[#F3EFE8] rounded-xl space-y-2">
            <p className="text-sm text-[#4B4B4B]">
              <strong className="text-[#1A1A1A]">Pour faire un retour :</strong> écrivez-nous sur WhatsApp avec votre numéro de commande et des photos. Si vous changez d’avis, le transport du retour est à votre charge ; si l’erreur vient de nous, il est à la nôtre.
            </p>
            <p className="text-sm text-[#4B4B4B]">
              Tous les détails sont dans nos{' '}
              <Link href="/shop/conditions" className="text-[#C8102E] font-semibold underline hover:no-underline">conditions de vente</Link>.
            </p>
          </div>
        </section>

        {/* CTA */}
        <div className="bg-[#0F0F0F] rounded-2xl p-6 sm:p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Une question sur votre livraison ?</h3>
          <p className="text-gray-300 mb-6">Écrivez-nous sur WhatsApp, du lundi au samedi, de 8h30 à 18h30.</p>
          <a href="https://wa.me/212760998347" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 min-h-[48px] bg-[#25D366] hover:bg-[#1da851] text-white px-8 py-3 rounded-xl font-bold transition-colors">
            <MessageCircle className="w-5 h-5" /> Contacter sur WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
