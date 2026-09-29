"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle, MessageCircle, ShoppingBag, Package, Truck, MapPin, Phone, ArrowRight, Clock,
  Store, Landmark, Copy, Check, ShieldAlert, Info,
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { formatPrice, getWhatsAppContact } from '@/lib/shop-utils';
import {
  detailsVariante, moyenPaiementDe, numeroCommandeAffichable, prixUnitaireLigne, receptionDe, texteClientSur, totalLigne,
  transportPrevu, varianteLisible, type ReceptionLue,
} from '@/lib/commandes-boutique';
import { delaiColis, TEXTE_TRANSPORT_VOLUMINEUX } from '@/lib/livraison-boutique';
import { ribLisible, type ReglagesReception } from '@/lib/reglages-reception';
import { useReglagesReception } from '@/lib/use-reglages-reception';
import type { MoyenPaiement } from '@/lib/shop-types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

type Etape = { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; status: 'done' | 'current' | 'pending' };

/** Ce que le client lit selon son mode de réception : colis Sendit, retrait, ou transport d'un rouleau. */
function etapesPour(
  r: ReceptionLue,
  transport: 'camionnette' | 'transporteur',
  paiement: MoyenPaiement,
  ville: string,
  reglages: ReglagesReception,
): Etape[] {
  const recue: Etape = { icon: CheckCircle, title: 'Commande reçue', desc: 'Votre commande a été enregistrée.', status: 'done' };
  const lieu = reglages.lieux[r.lieu];

  if (r.mode === 'retrait') {
    return [
      recue,
      { icon: Phone, title: 'Confirmation (sous 2 h)', desc: 'Nous vous appelons pendant nos horaires pour confirmer la commande.', status: 'current' },
      { icon: Package, title: 'Préparation', desc: `Votre commande est préparée à ${lieu.nom}.`, status: 'pending' },
      { icon: Store, title: 'Prête à retirer', desc: "Nous vous envoyons l'adresse exacte et le jour de retrait par WhatsApp.", status: 'pending' },
      {
        icon: CheckCircle,
        title: 'Retrait',
        desc: paiement === 'cod'
          ? 'Donnez votre numéro de commande et votre nom. Vous payez sur place.'
          : 'Donnez votre numéro de commande et votre nom au magasin.',
        status: 'pending',
      },
    ];
  }

  if (r.mode === 'transport') {
    const depart: Etape = transport === 'camionnette'
      ? {
          icon: Truck,
          title: 'Livraison par notre camionnette',
          desc: reglages.camionnette.actif
            ? `Tournées : ${reglages.camionnette.jours}. Nous vous prévenons la veille.`
            : 'Le jour de livraison est fixé avec vous au téléphone.',
          status: 'pending',
        }
      : {
          icon: Truck,
          title: 'Envoi par transporteur',
          desc: `Notre transporteur habituel livre la marchandise à son dépôt${ville ? `, à ${ville}` : ''}.`,
          status: 'pending',
        };
    const arrivee: Etape = transport === 'camionnette'
      ? {
          icon: MapPin,
          title: 'Réception',
          desc: paiement === 'cod' ? "Au pied de l'immeuble. Vous payez à la livraison." : "Au pied de l'immeuble.",
          status: 'pending',
        }
      : {
          icon: MapPin,
          title: 'Récupération au dépôt',
          desc: 'Vous récupérez la marchandise au dépôt du transporteur : nous vous donnons son adresse au téléphone.',
          status: 'pending',
        };
    return [
      recue,
      {
        icon: Phone,
        title: 'Appel pour le transport (sous 2 h)',
        desc: 'Nous vous appelons pendant nos horaires pour organiser le transport et vous donner son prix. Rien ne part avant votre accord.',
        status: 'current',
      },
      { icon: Package, title: 'Préparation', desc: `Votre commande est préparée à ${reglages.lieux.chrifa.nom}.`, status: 'pending' },
      depart,
      arrivee,
    ];
  }

  return [
    recue,
    { icon: Phone, title: 'Confirmation (sous 2 h)', desc: "Nous vous appelons pendant nos horaires pour confirmer la commande et l'adresse.", status: 'current' },
    { icon: Package, title: 'Préparation', desc: 'Votre commande est préparée avec soin.', status: 'pending' },
    { icon: Truck, title: 'Expédition par Sendit', desc: `Délai estimé : ${ville ? delaiColis(ville) : '24 h à 4 jours ouvrés'}`, status: 'pending' },
    {
      icon: MapPin,
      title: 'Livraison',
      desc: paiement === 'cod'
        ? 'Vous payez le livreur en espèces. Le colis ne s’ouvre pas avant le paiement.'
        : 'Livraison à votre adresse, par le livreur Sendit.',
      status: 'pending',
    },
  ];
}

/** Le lien Maps vient des réglages : on n'accepte qu'une adresse web, jamais autre chose. */
function lienSur(url: string): string | undefined {
  return /^https:\/\//i.test(url) ? url : undefined;
}

/**
 * Le RIB en groupes insécables (banque, ville, compte, clé) : sur téléphone, la ligne ne se
 * coupe qu'entre deux groupes, jamais au milieu du n° de compte que le client recopie.
 */
function RibEnGroupes({ rib }: { rib: string }) {
  const groupes = ribLisible(rib).split(' ').filter(Boolean);
  return (
    <span className="text-base font-black text-[#1A1A1A] tabular-nums tracking-wide select-all">
      {groupes.map((g, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          <span className="whitespace-nowrap">{g}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

// Copier le RIB ou le motif d'un geste : moins d'erreurs de saisie dans l'appli de la banque.
function BoutonCopier({ texte, libelle }: { texte: string; libelle: string }) {
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch { /* presse-papiers refusé : le texte reste lisible et sélectionnable */ }
  };
  return (
    <button
      type="button"
      onClick={copier}
      aria-label={`Copier ${libelle}`}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-[#E8E4DF] bg-white text-xs font-bold text-[#1A1A1A] hover:border-[#C8102E] hover:text-[#C8102E] transition-colors"
    >
      {copie ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4" />}
      {copie ? 'Copié' : 'Copier'}
    </button>
  );
}

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { reglages, charge: reglagesCharges } = useReglagesReception();

  useEffect(() => {
    if (!id) { setError(true); setLoading(false); return; }
    getDoc(doc(db, 'shop_orders', id))
      .then(snap => {
        if (snap.exists()) setOrder({ id: snap.id, ...snap.data() });
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <div className="w-12 h-12 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center max-w-md px-6">
          <p className="text-5xl mb-4">😕</p>
          <h1 className="text-2xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Commande introuvable</h1>
          <p className="text-[#6B6B6B] mb-6">Nous n'avons pas trouvé cette commande.</p>
          <Link href="/shop/boutique" className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors inline-block">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  // Ancienne commande (sans `reception`) : colis à domicile, espèces — comme avant.
  const reception = receptionDe(order);
  // Tout ce qui suit a été écrit par le navigateur qui a créé la commande. À côté du vrai RIB,
  // rien ne doit pouvoir se lire comme un « nouveau RIB LEBTEX » : n° de la forme du checkout
  // (sinon l'identifiant du document), nom et adresse bornés, sans suite de chiffres.
  const numero = numeroCommandeAffichable(order);
  const nomClient = texteClientSur(order.shippingAddress?.fullName, 30);
  const adresseClient = texteClientSur(order.shippingAddress?.address, 200);
  const paiement = moyenPaiementDe(order);
  const transport = transportPrevu(order);
  const ville: string = order.shippingAddress?.city || '';
  const lieu = reglages.lieux[reception.lieu];
  const fraisLivraison = Number(order.deliveryFee) || 0;
  // Transport d'un rouleau : prix donné au téléphone. Tant que l'équipe ne l'a pas ajouté, il reste « à confirmer ».
  const transportAConfirmer = reception.mode === 'transport' && fraisLivraison === 0;
  const steps = etapesPour(reception, transport, paiement, ville, reglages);

  const ligneLivraison =
    reception.mode === 'retrait'
      ? 'Gratuit (retrait)'
      : transportAConfirmer
        ? 'À confirmer par téléphone'
        : fraisLivraison === 0
          ? 'Offerte'
          : formatPrice(fraisLivraison);

  const lignePaiement =
    paiement === 'virement'
      ? 'Virement bancaire (coordonnées ci-dessous)'
      : paiement === 'carte'
        ? 'Carte bancaire : nous vous envoyons le lien de paiement après notre appel'
        : reception.mode === 'retrait'
          ? 'Espèces, au moment du retrait'
          : reception.mode === 'transport' && transport === 'transporteur'
            ? 'Paiement convenu avec vous au téléphone'
            : 'Espèces, à la livraison';

  const libelleReception =
    reception.mode === 'retrait'
      ? `Retrait à ${lieu.nom}`
      : reception.mode === 'transport'
        ? transport === 'camionnette' ? 'Transport : camionnette LEBTEX' : `Transport jusqu'au dépôt du transporteur${ville ? ` (${ville})` : ''}`
        : 'À domicile par Sendit';

  // Message WhatsApp : reprend le prix réellement facturé, la variante complète, le mode
  // de réception et le moyen de paiement (jamais « livraison gratuite » pour un transport).
  const messageWhatsApp = (() => {
    const lignes: string[] = ['Bonjour LEBTEX,', '', 'Je souhaite confirmer ma commande :', `N° ${numero}`];
    if (nomClient) lignes.push(nomClient);
    const articles = (order.items || []) as any[];
    if (articles.length > 0) {
      lignes.push('', 'Articles :');
      articles.forEach((item, i) => {
        const variante = varianteLisible(item.variant);
        const prix = prixUnitaireLigne(item) > 0 ? ` = ${formatPrice(totalLigne(item))}` : '';
        lignes.push(`${i + 1}. ${texteClientSur(item.productName, 100)}${variante ? ` (${texteClientSur(variante, 80)})` : ''} × ${item.quantity}${prix}`);
      });
    }
    lignes.push('', `Sous-total : ${formatPrice(Number(order.subtotal) || 0)}`);
    lignes.push(`${reception.mode === 'transport' ? 'Transport' : reception.mode === 'retrait' ? 'Retrait' : 'Livraison'} : ${ligneLivraison}`);
    lignes.push(`Total : ${formatPrice(Number(order.total) || 0)}${transportAConfirmer ? ' + transport' : ''}`);
    lignes.push('', `Réception : ${libelleReception}`);
    if (reception.mode !== 'retrait' && (adresseClient || ville)) {
      lignes.push(`Adresse : ${[adresseClient, ville].filter(Boolean).join(', ')}`);
    }
    lignes.push(`Paiement : ${paiement === 'virement' ? 'virement bancaire' : paiement === 'carte' ? 'carte bancaire' : 'espèces'}`);
    lignes.push('', 'Merci !');
    return lignes.join('\n');
  })();
  const whatsappLink = getWhatsAppContact(messageWhatsApp);

  const merci = `Merci${nomClient ? ` ${nomClient}` : ''} !`;
  const introduction =
    reception.mode === 'transport'
      ? `${merci} Nous vous appelons sous 2 h (pendant nos horaires) pour organiser le transport. Rien ne part avant votre accord.`
      : reception.mode === 'retrait'
        ? `${merci} Nous vous appelons pour confirmer la commande, puis nous la préparons. Vous recevrez l'adresse et le jour de retrait par WhatsApp.`
        : `${merci} Nous vous appelons sous 2 h (pendant nos horaires) pour la confirmer avec vous.`;

  const lienMaps = lienSur(lieu.lienMaps);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen py-10 px-4">
      <style>{`@keyframes scaleIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}.scale-in{animation:scaleIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards}`}</style>
      <div className="max-w-2xl mx-auto">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="scale-in w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200">
            <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Commande reçue !</h1>
          <p className="text-[#6B6B6B] mb-4">{introduction}</p>
          <div className="inline-flex items-center gap-2 bg-[#0F0F0F] text-white px-5 py-2.5 rounded-full">
            <span className="text-[#D4A843] text-xs font-black uppercase tracking-widest">N° Commande</span>
            <span className="font-black text-base tracking-wider break-all">{numero}</span>
          </div>
        </div>

        {/* Rouleau entier : la notice du transport (transport à organiser, ou ancienne commande
            « à domicile ») ; pour un retrait, une phrase courte qui ne parle pas de transport. */}
        {reception.volumineux && (
          <div className="flex gap-3 p-4 mb-5 rounded-2xl bg-amber-50 border border-amber-200">
            <Info className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#2A2A2A] leading-relaxed">
              {reception.mode === 'retrait' ? `Rouleau entier : préparé et retiré à ${lieu.nom}.` : TEXTE_TRANSPORT_VOLUMINEUX}
            </p>
          </div>
        )}

        {/* Payer par virement */}
        {paiement === 'virement' && (
          <div className="bg-white border-2 border-[#1A1A1A] rounded-2xl p-6 mb-5">
            <h2 className="font-black text-[#1A1A1A] mb-1 text-base flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Landmark className="w-5 h-5 text-[#C8102E]" /> Payer par virement
            </h2>
            {!reglagesCharges ? (
              <p className="text-sm text-[#6B6B6B] mt-3">Chargement des coordonnées bancaires…</p>
            ) : !reglages.virement.actif ? (
              <p className="text-sm text-[#4A4A4A] mt-3 leading-relaxed">
                Nos coordonnées bancaires ne sont pas disponibles pour le moment. Nous vous appelons pour convenir du paiement.
              </p>
            ) : (
              <>
                <p className="text-sm text-[#4A4A4A] mb-4 leading-relaxed">
                  {transportAConfirmer
                    ? 'Attendez notre appel : nous vous donnons le prix du transport, puis le montant total à virer.'
                    : 'Vous pouvez faire le virement dès maintenant, ou après notre appel de confirmation.'}
                </p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Titulaire du compte</dt>
                    <dd className="text-sm font-semibold text-[#1A1A1A]">{reglages.virement.titulaire}</dd>
                  </div>
                  {reglages.virement.banque && (
                    <div>
                      <dt className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Banque</dt>
                      <dd className="text-sm font-semibold text-[#1A1A1A]">{reglages.virement.banque}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">RIB</dt>
                    {/* Sur téléphone, le bouton passe sous le RIB : le n° garde toute la largeur. */}
                    <dd className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <RibEnGroupes rib={reglages.virement.rib} />
                      <BoutonCopier texte={reglages.virement.rib} libelle="le RIB" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Montant</dt>
                    <dd className="text-base font-black text-[#C8102E]">
                      {formatPrice(Number(order.total) || 0)}
                      {transportAConfirmer && <span className="text-sm font-semibold text-[#4A4A4A]"> + le transport, confirmé au téléphone</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Motif du virement</dt>
                    <dd className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-base font-black text-[#1A1A1A] tracking-wider select-all break-all">{numero}</span>
                      <BoutonCopier texte={numero} libelle="le motif" />
                    </dd>
                  </div>
                </dl>
                <p className="text-sm text-[#4A4A4A] mt-4 leading-relaxed">
                  Nous confirmons la réception du virement par WhatsApp. Pas besoin de nous envoyer de capture d&apos;écran :
                  nous vérifions directement sur notre compte.
                </p>
              </>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#FBF8F3] border border-[#E8E4DF] px-3 py-2.5 text-sm font-semibold text-[#1A1A1A]">
              <ShieldAlert className="w-4 h-4 text-[#C8102E] flex-shrink-0 mt-0.5" />
              LEBTEX ne vous demandera jamais de changer de RIB par message.
            </p>
          </div>
        )}

        {/* Steps */}
        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 mb-5">
          <h2 className="font-black text-[#1A1A1A] mb-5 text-sm uppercase tracking-wider" style={{ fontFamily: 'Outfit, sans-serif' }}>Prochaines étapes</h2>
          <div className="space-y-4">
            {steps.map(({ icon: Icon, title, desc, status }) => (
              <div key={title} className="flex gap-4 items-start">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${status === 'done' ? 'bg-[#10B981]' : status === 'current' ? 'bg-[#C8102E]' : 'bg-[#F3EFE8]'}`}>
                  <Icon className={`w-4 h-4 ${status !== 'pending' ? 'text-white' : 'text-[#6B6B6B]'}`} />
                </div>
                <div className="pt-1 flex-1">
                  <p className={`font-bold text-sm ${status !== 'pending' ? 'text-[#1A1A1A]' : 'text-[#6B6B6B]'}`}>{title}</p>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">{desc}</p>
                </div>
                {status === 'current' && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-[#C8102E] bg-[#C8102E]/10 px-2 py-1 rounded-full">
                    <Clock className="w-3 h-3" /> En cours
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 mb-5">
          <h2 className="font-black text-[#1A1A1A] mb-4 text-sm uppercase tracking-wider" style={{ fontFamily: 'Outfit, sans-serif' }}>Récapitulatif de commande</h2>
          <div className="space-y-3 mb-4">
            {(order.items || []).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                {item.productImage && <img src={item.productImage} alt={item.productName} loading="lazy" decoding="async" className="w-12 h-12 rounded-xl object-cover border border-[#E8E4DF]" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#1A1A1A] truncate">{texteClientSur(item.productName, 100)}</p>
                  {detailsVariante(item.variant).map(d => (
                    <p key={d.libelle} className="text-xs text-[#6B6B6B]">{d.libelle} : {d.valeur}</p>
                  ))}
                  <p className="text-xs text-[#6B6B6B]">
                    Qté : {item.quantity}{prixUnitaireLigne(item) > 0 && ` × ${formatPrice(prixUnitaireLigne(item))}`}
                  </p>
                  {item.volumineux && <p className="text-xs font-semibold text-amber-700">Article volumineux</p>}
                </div>
                <p className="font-black text-[#1A1A1A] text-sm shrink-0">
                  {prixUnitaireLigne(item) > 0 ? formatPrice(totalLigne(item)) : <span className="text-xs text-[#6B6B6B] font-semibold">Prix à confirmer</span>}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-[#F3EFE8] pt-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[#6B6B6B]">Sous-total</span><span className="font-semibold">{formatPrice(order.subtotal)}</span></div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-[#6B6B6B]">{reception.mode === 'transport' ? 'Transport' : reception.mode === 'retrait' ? 'Retrait' : 'Livraison'}</span>
              <span className={`font-semibold text-right ${ligneLivraison === 'Offerte' || reception.mode === 'retrait' ? 'text-green-700' : ''}`}>{ligneLivraison}</span>
            </div>
            <div className="flex justify-between gap-3 font-black text-base pt-2 border-t border-[#F3EFE8]">
              <span>Total à payer</span>
              <span className="text-[#C8102E] text-right">
                {formatPrice(order.total)}
                {transportAConfirmer && <span className="block text-xs font-semibold text-[#6B6B6B]">+ transport, confirmé au téléphone</span>}
              </span>
            </div>
            <p className="text-xs text-[#6B6B6B]">Paiement : {lignePaiement}</p>
          </div>

          {/* Où et comment la commande arrive */}
          {reception.mode === 'retrait' ? (
            <div className="mt-4 pt-4 border-t border-[#F3EFE8]">
              <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-2">Lieu de retrait</p>
              <div className="flex gap-2">
                <Store className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                <div className="text-sm text-[#1A1A1A]">
                  <p className="font-semibold">{lieu.nom}</p>
                  <p className="text-[#6B6B6B]">{lieu.adresse}</p>
                  <p className="text-[#6B6B6B]">{lieu.horaires}</p>
                  {lienMaps && (
                    <a href={lienMaps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-h-[44px] font-semibold text-[#C8102E] underline">
                      <MapPin className="w-4 h-4" /> Voir sur Google Maps
                    </a>
                  )}
                  <p className="text-xs text-[#6B6B6B]">L&apos;adresse exacte et le jour vous sont confirmés par WhatsApp.</p>
                </div>
              </div>
            </div>
          ) : order.shippingAddress && (
            <div className="mt-4 pt-4 border-t border-[#F3EFE8]">
              <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-2">
                {reception.mode === 'transport' && transport === 'transporteur' ? 'Envoi' : 'Adresse de livraison'}
              </p>
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                <div className="text-sm text-[#1A1A1A]">
                  <p className="font-semibold">{nomClient}</p>
                  {reception.mode === 'transport' && transport === 'transporteur' ? (
                    <p className="text-[#6B6B6B]">Jusqu&apos;au dépôt du transporteur{ville ? ` à ${ville}` : ''} : vous y récupérez la marchandise.</p>
                  ) : (
                    <p className="text-[#6B6B6B]">{[adresseClient, ville].filter(Boolean).join(', ')}</p>
                  )}
                  <p className="text-[#6B6B6B]">📞 {order.shippingAddress.phone}</p>
                </div>
              </div>
              {reception.mode === 'domicile' && ville && (
                <p className="text-xs text-[#047857] font-semibold mt-2 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Par Sendit · délai estimé : {delaiColis(ville)}</p>
              )}
            </div>
          )}
        </div>

        {/* WhatsApp CTA */}
        <div className="bg-[#0F0F0F] rounded-2xl p-6 mb-5 text-white text-center">
          <h3 className="font-black text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Une question sur votre commande ?</h3>
          <p className="text-gray-400 text-sm mb-4">Contactez-nous sur WhatsApp, réponse rapide garantie 📲</p>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white px-6 py-3 rounded-xl font-bold transition-colors">
            <MessageCircle className="w-5 h-5" /> Contacter LEBTEX
          </a>
          <p className="text-xs text-gray-400 mt-3">Réf. {numero}</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/shop/boutique"
            className="flex items-center justify-center gap-2 py-3 bg-white border border-[#E8E4DF] rounded-xl font-semibold text-[#1A1A1A] hover:border-[#C8102E] hover:text-[#C8102E] transition-all text-sm">
            <ShoppingBag className="w-4 h-4" /> Continuer les achats
          </Link>
          <Link href="/shop/suivi"
            className="flex items-center justify-center gap-2 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors text-sm">
            Suivre ma commande <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
