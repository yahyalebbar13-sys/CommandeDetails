"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, MessageCircle, ShoppingBag, Package, Truck, MapPin, Phone, ArrowRight, Clock } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { formatPrice, buildWhatsAppLink, getDeliveryDays } from '@/lib/shop-utils';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
          <Link prefetch={true} >
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const whatsappLink = buildWhatsAppLink(order.orderNumber, order.total, order.shippingAddress?.fullName || '');
  const deliveryDays = order.shippingAddress?.city ? getDeliveryDays(order.shippingAddress.city) : '3-5 jours';
  const steps = [
    { icon: CheckCircle, title: 'Commande reçue', desc: 'Votre commande a été enregistrée.', status: 'done' },
    { icon: Phone, title: 'Confirmation (sous 2h)', desc: 'Notre équipe vous contactera pour confirmer.', status: 'current' },
    { icon: Package, title: 'Préparation', desc: 'Votre commande sera préparée avec soin.', status: 'pending' },
    { icon: Truck, title: 'Expédition', desc: `Délai estimé : ${deliveryDays}`, status: 'pending' },
    { icon: MapPin, title: 'Livraison', desc: 'Livraison à votre adresse, paiement en cash.', status: 'pending' },
  ];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen py-10 px-4">
      <style>{`@keyframes scaleIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}.scale-in{animation:scaleIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards}`}</style>
      <div className="max-w-2xl mx-auto">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="scale-in w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200">
            <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Commande Confirmée ! 🎉</h1>
          <p className="text-[#6B6B6B] mb-4">Merci {order.shippingAddress?.fullName} ! Votre commande a bien été reçue.</p>
          <div className="inline-flex items-center gap-2 bg-[#0F0F0F] text-white px-5 py-2.5 rounded-full">
            <span className="text-[#D4A843] text-xs font-black uppercase tracking-widest">N° Commande</span>
            <span className="font-black text-base tracking-wider">{order.orderNumber}</span>
          </div>
        </div>

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
                  <p className="font-semibold text-sm text-[#1A1A1A] truncate">{item.productName}</p>
                  {item.variant?.color && <p className="text-xs text-[#6B6B6B]">Couleur: {item.variant.color}</p>}
                  <p className="text-xs text-[#6B6B6B]">Qté: {item.quantity}</p>
                </div>
                <p className="font-black text-[#1A1A1A] text-sm shrink-0">{formatPrice(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-[#F3EFE8] pt-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[#6B6B6B]">Sous-total</span><span className="font-semibold">{formatPrice(order.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6B6B6B]">Livraison</span><span className="font-semibold">{order.deliveryFee === 0 ? '🎉 Gratuit' : formatPrice(order.deliveryFee)}</span></div>
            <div className="flex justify-between font-black text-base pt-2 border-t border-[#F3EFE8]">
              <span>Total à payer</span><span className="text-[#C8102E]">{formatPrice(order.total)}</span>
            </div>
            <p className="text-xs text-[#6B6B6B] flex items-center gap-1">💵 Paiement en cash à la livraison</p>
          </div>
          {order.shippingAddress && (
            <div className="mt-4 pt-4 border-t border-[#F3EFE8]">
              <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-2">Adresse de livraison</p>
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                <div className="text-sm text-[#1A1A1A]">
                  <p className="font-semibold">{order.shippingAddress.fullName}</p>
                  <p className="text-[#6B6B6B]">{order.shippingAddress.address}, {order.shippingAddress.city}</p>
                  <p className="text-[#6B6B6B]">📞 {order.shippingAddress.phone}</p>
                </div>
              </div>
              <p className="text-xs text-[#10B981] font-semibold mt-2 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Délai estimé : {deliveryDays}</p>
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
          <p className="text-xs text-gray-500 mt-3">Réf. {order.orderNumber}</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link prefetch={true} >
            <ShoppingBag className="w-4 h-4" /> Continuer les achats
          </Link>
          <Link prefetch={true} >
            Suivre ma commande <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
