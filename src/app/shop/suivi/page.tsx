'use client';

// ─── Suivi de commande ───────────────────────────────────────────────────────
// 1. « Mes commandes sur ce téléphone » : les 20 dernières commandes passées ici
//    (lib/mes-commandes, gardées par le checkout), chacune avec le lien vers sa page
//    (/shop/confirmation/{id}, où le client voit l'état) et « Commander la même chose ».
// 2. Depuis un autre téléphone : n° de commande ET téléphone, vérifiés par le serveur
//    (/api/shop/suivi). Plus jamais de recherche par téléphone seul : les règles Firestore
//    la refusent aux visiteurs, et elle montrerait les commandes d'autrui.
// 3. Un lien vers Ma liste (les produits gardés d'un cœur).

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ChevronRight, Hash, Heart, Landmark, Loader2, MessageCircle, Package, Phone, Search, ShieldAlert,
  ShoppingBag, Store, Trash2, Truck,
} from 'lucide-react';
import { ORDER_STATUS_COLORS } from '@/lib/shop-types';
import { formatPrice, getWhatsAppContact } from '@/lib/shop-utils';
import { erreurTelephone, normaliserTelephoneMaroc, telephoneMarocLisible } from '@/lib/telephone-maroc';
import { libelleFrais } from '@/lib/livraison-boutique';
import { ribLisible, type ReglagesReception } from '@/lib/reglages-reception';
import { useReglagesReception } from '@/lib/use-reglages-reception';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { paire, premierTexte } from '@/lib/shop-textes';
import { libelleLignePanier } from '@/lib/shop-variantes';
import { lienPage } from '@/lib/liens-boutique';
import {
  MESSAGES_SUIVI,
  commandeTerminee,
  effacerMesCommandes,
  identifiantCommandeSaisi,
  lignesDeSuivi,
  lireMesCommandes,
  normaliserNumeroCommande,
  type CommandeLocale,
  type CommandeSuivie,
} from '@/lib/mes-commandes';
import { EtapesCommande, etapesCommande, libelleEtat } from '@/components/shop/EtatCommande';
import BoutonRecommander from '@/components/shop/BoutonRecommander';
import type { Language } from '@/lib/translations';

type Message = Record<Language, string>;

/** Date lisible (« 02 octobre 2026 ») ; '' si inconnue. */
function dateLisible(v: number | string | null, ar: boolean): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(ar ? 'ar-MA' : 'fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Message renvoyé par la route : seulement deux textes, sinon le message générique. */
function messageLu(v: unknown): Message {
  const m = v as Partial<Message> | null;
  return m && typeof m.fr === 'string' && typeof m.ar === 'string' ? { fr: m.fr, ar: m.ar } : MESSAGES_SUIVI.erreur;
}

// ─── Une commande retrouvée depuis un autre téléphone ─────────────────────────
function CarteSuivie({ c, numeroTape, reglages, reglagesCharges }: {
  c: CommandeSuivie;
  numeroTape: string;
  reglages: ReglagesReception;
  reglagesCharges: boolean;
}) {
  const { language } = useLanguage();
  const { getProductById } = useShopProducts();
  const ar = language === 'ar';
  const etapes = etapesCommande(c.reception, reglages, language);
  const couleur = ORDER_STATUS_COLORS[c.statut] || '#6B7280';
  const numero = c.numero || numeroTape;
  const date = dateLisible(c.date, ar);
  const lieu = reglages.lieux[c.reception.lieu];
  const titreFrais = ar
    ? c.reception.mode === 'transport' ? 'النقل' : c.reception.mode === 'retrait' ? 'الاستلام' : 'التوصيل'
    : c.reception.mode === 'transport' ? 'Transport' : c.reception.mode === 'retrait' ? 'Retrait' : 'Livraison';
  const valeurFrais = c.frais > 0
    ? formatPrice(c.frais)
    : c.reception.mode === 'retrait' || c.fraisOfferts
      ? (ar ? 'مجاني' : c.fraisOfferts ? 'Offerte' : 'Gratuit')
      : libelleFrais(null, language);
  const reception = c.reception.mode === 'retrait'
    ? (ar ? `الاستلام من ${lieu.nom}` : `Retrait à ${lieu.nom}`)
    : c.reception.mode === 'transport'
      ? c.reception.transport === 'camionnette'
        ? (ar ? 'النقل بشاحنة LEBTEX' : 'Transport par la camionnette LEBTEX')
        : (ar ? 'النقل إلى مستودع الناقل في مدينتك' : 'Transport jusqu’au dépôt du transporteur, dans votre ville')
      : (ar ? 'التوصيل إلى المنزل' : 'Livraison à domicile');
  const virement = c.paiement === 'virement' && !commandeTerminee(c.statut);
  // Comme la page de la commande : le total n'est pas final tant que le transport n'est pas chiffré,
  // ni s'il reste un article au prix à confirmer.
  const transportAConfirmer = c.reception.mode === 'transport' && c.frais <= 0;
  const sansPrix = c.lignes.some(l => l.prixUnitaire <= 0);
  // Lu par l'équipe : en français.
  const lienAide = getWhatsAppContact(`Bonjour LEBTEX, je souhaite des informations sur ma commande N° ${numero}.`);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${couleur}15` }}>
          <Package className="w-6 h-6" style={{ color: couleur }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <bdi dir="ltr" className="font-bold text-[#0F0F0F] font-mono text-sm break-all">{numero}</bdi>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${couleur}15`, color: couleur }}>
              {libelleEtat(c.statut, etapes, language)}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {date && <>{date} · </>}
            <bdi dir="ltr" className="font-semibold text-[#C8102E]">{c.total > 0 ? formatPrice(c.total) : ar ? 'قيد التأكيد' : 'À confirmer'}</bdi>
          </p>
        </div>
      </div>

      <EtapesCommande statut={c.statut} etapes={etapes} language={language} />

      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{ar ? 'المنتجات' : 'Articles'}</h3>
        <div className="space-y-2.5">
          {c.lignes.map((l, i) => {
            const nom = premierTexte(language, { fr: l.nom, ar: l.nomAr }, paire(getProductById(l.productId), 'name')) || l.nom;
            const variante = l.variante ? libelleLignePanier(l.variante, language) : '';
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F0F0F]">{nom}</p>
                  {variante && <p className="text-xs text-gray-500">{variante}</p>}
                  <p className="text-xs text-gray-500">
                    {ar ? 'الكمية: ' : 'Qté : '}{l.quantite}
                    {l.prixUnitaire > 0 && <> × <bdi dir="ltr">{formatPrice(l.prixUnitaire)}</bdi></>}
                  </p>
                </div>
                <p className="font-bold text-sm text-[#0F0F0F] shrink-0">
                  {l.prixUnitaire > 0
                    ? <bdi dir="ltr">{formatPrice(l.total)}</bdi>
                    : <span className="text-xs text-gray-500 font-semibold">{ar ? 'السعر قيد التأكيد' : 'Prix à confirmer'}</span>}
                </p>
              </div>
            );
          })}
        </div>
        <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{ar ? 'المجموع الفرعي' : 'Sous-total'}</span>
            <bdi dir="ltr" className="font-semibold">{c.sousTotal > 0 ? formatPrice(c.sousTotal) : ar ? 'قيد التأكيد' : 'À confirmer'}</bdi>
          </div>
          {sansPrix && c.sousTotal > 0 && (
            <p className="text-xs text-gray-500 -mt-1">{ar ? 'لا يشمل المنتجات التي سعرها قيد التأكيد' : 'Hors articles au prix à confirmer'}</p>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{titreFrais}</span>
            <span className="font-semibold text-end">{valeurFrais}</span>
          </div>
          <div className="flex justify-between gap-3 font-black pt-1.5 border-t border-gray-100">
            <span>{ar ? 'المجموع' : 'Total'}</span>
            <span className="text-[#C8102E] text-end">
              <bdi dir="ltr">{c.total > 0 ? formatPrice(c.total) : ar ? 'قيد التأكيد' : 'À confirmer'}</bdi>
              {transportAConfirmer && (
                <span className="block text-xs font-semibold text-gray-500">
                  {ar ? '+ ثمن النقل، يُحدَّد عبر الهاتف' : '+ transport, confirmé au téléphone'}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Comment la commande arrive : jamais l'adresse du client, jamais le nom du transporteur des colis */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
        {c.reception.mode === 'retrait'
          ? <Store className="w-4 h-4 text-[#C8102E] flex-shrink-0 mt-0.5" />
          : <Truck className="w-4 h-4 text-[#C8102E] flex-shrink-0 mt-0.5" />}
        <div className="text-sm text-gray-600">
          <p className="font-semibold text-[#0F0F0F]">{reception}</p>
          {c.reception.mode === 'retrait' && (
            <>
              <p>{lieu.adresse}</p>
              <p>{lieu.horaires}</p>
            </>
          )}
        </div>
      </div>

      {/* Virement choisi, commande en cours : le RIB de LEBTEX et le motif (le n° de commande) */}
      {virement && (
        <div className="rounded-xl border-2 border-[#1A1A1A] p-4 space-y-2 text-sm">
          <p className="font-black text-[#1A1A1A] flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#C8102E]" /> {ar ? 'الدفع بالتحويل البنكي' : 'Payer par virement'}
          </p>
          {!reglagesCharges ? (
            <p className="text-gray-500">{ar ? 'جاري تحميل المعلومات البنكية…' : 'Chargement des coordonnées bancaires…'}</p>
          ) : !reglages.virement.actif ? (
            <p className="text-gray-600">
              {ar
                ? 'معلوماتنا البنكية غير متوفرة حالياً. راسلنا عبر واتساب للاتفاق على الدفع.'
                : 'Nos coordonnées bancaires ne sont pas disponibles pour le moment. Écrivez-nous sur WhatsApp pour convenir du paiement.'}
            </p>
          ) : (
            <dl className="space-y-1.5">
              <div>
                <dt className="text-xs font-bold text-gray-500 uppercase">{ar ? 'صاحب الحساب' : 'Titulaire'}</dt>
                <dd className="font-semibold text-[#1A1A1A]">{reglages.virement.titulaire}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-gray-500 uppercase">{ar ? 'رقم الحساب البنكي (RIB)' : 'RIB'}</dt>
                <dd dir="ltr" className="font-black text-[#1A1A1A] tabular-nums select-all text-start">{ribLisible(reglages.virement.rib)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-gray-500 uppercase">{ar ? 'سبب التحويل' : 'Motif du virement'}</dt>
                <dd><bdi dir="ltr" className="font-black text-[#1A1A1A] select-all break-all">{numero}</bdi></dd>
              </div>
            </dl>
          )}
          <p className="flex items-start gap-2 text-xs font-semibold text-[#1A1A1A]">
            <ShieldAlert className="w-4 h-4 text-[#C8102E] flex-shrink-0" />
            {ar ? 'لن تطلب منك LEBTEX أبداً تغيير رقم الحساب البنكي (RIB) عبر رسالة.' : 'LEBTEX ne vous demandera jamais de changer de RIB par message.'}
          </p>
        </div>
      )}

      <BoutonRecommander lignes={lignesDeSuivi(c)} />

      <a
        href={lienAide}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[48px] items-center justify-between w-full p-4 rounded-xl bg-green-50 border border-green-100 hover:bg-green-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-green-700">
          <MessageCircle className="w-4 h-4 text-green-600" />
          {ar ? 'تواصل مع LEBTEX عبر واتساب' : 'Contacter LEBTEX sur WhatsApp'}
        </span>
        <ChevronRight className="w-4 h-4 text-green-600 rtl:rotate-180" />
      </a>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SuiviPage() {
  const { reglages, charge: reglagesCharges } = useReglagesReception();
  const { language } = useLanguage();
  const ar = language === 'ar';
  // null : pas encore lu (rendu serveur, premier affichage)
  const [mesCommandes, setMesCommandes] = useState<CommandeLocale[] | null>(null);
  const [numero, setNumero] = useState('');
  const [telephone, setTelephone] = useState('');
  const [recherche, setRecherche] = useState(false);
  const [trouvee, setTrouvee] = useState<{ commande: CommandeSuivie; numeroTape: string } | null>(null);
  const [erreur, setErreur] = useState<Message | null>(null);

  // Les commandes de ce téléphone, et le numéro de la dernière commande pour pré-remplir le champ.
  useEffect(() => {
    setMesCommandes(lireMesCommandes());
    try {
      const garde = localStorage.getItem('lebtex_customer_phone');
      if (garde) setTelephone(telephoneMarocLisible(normaliserTelephoneMaroc(garde) ?? garde));
    } catch { /* navigation privée : champ vide */ }
  }, []);

  const chercher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recherche) return;
    setTrouvee(null);
    if (!normaliserNumeroCommande(numero) && !identifiantCommandeSaisi(numero)) {
      setErreur(MESSAGES_SUIVI.numero_invalide);
      return;
    }
    const erreurTel = erreurTelephone(telephone, language);
    if (erreurTel) {
      setErreur({ fr: erreurTelephone(telephone, 'fr') ?? erreurTel, ar: erreurTelephone(telephone, 'ar') ?? erreurTel });
      return;
    }
    setErreur(null);
    setRecherche(true);
    try {
      const reponse = await fetch('/api/shop/suivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: numero.trim(), telephone: telephone.trim() }),
      });
      const corps = await reponse.json().catch(() => null);
      if (reponse.ok && corps?.ok && corps.commande && Array.isArray(corps.commande.lignes)) {
        // Ancienne commande retrouvée par son identifiant : il est sensible à la casse, on le garde tel quel.
        const numeroTape = normaliserNumeroCommande(numero) ?? identifiantCommandeSaisi(numero) ?? numero.trim();
        setTrouvee({ commande: corps.commande as CommandeSuivie, numeroTape });
      } else {
        setErreur(messageLu(corps?.message));
      }
    } catch {
      setErreur(MESSAGES_SUIVI.reseau);
    } finally {
      setRecherche(false);
    }
  };

  const effacerListe = () => {
    const question = ar
      ? 'حذف هذه القائمة من هذا الهاتف؟ تبقى طلباتك مسجلة لدى LEBTEX.'
      : 'Effacer cette liste de ce téléphone ? Vos commandes restent enregistrées chez LEBTEX.';
    if (!window.confirm(question)) return;
    effacerMesCommandes();
    setMesCommandes([]);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
      {/* En-tête */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C8102E] mb-4 shadow-lg shadow-[#C8102E]/25">
          <Truck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-[#0F0F0F]">{ar ? 'تتبع الطلب' : 'Suivi de commande'}</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {ar ? 'طلباتك على هذا الهاتف، أو ابحث برقم الطلب ورقم الهاتف.' : 'Vos commandes sur ce téléphone, ou une recherche par n° de commande et téléphone.'}
        </p>
      </div>

      {/* ── 1. Mes commandes sur ce téléphone ── */}
      {mesCommandes === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 text-[#C8102E] animate-spin" />
        </div>
      ) : mesCommandes.length > 0 && (
        <section className="mb-8" aria-labelledby="mes-commandes">
          <h2 id="mes-commandes" className="text-lg font-bold text-[#0F0F0F] mb-1">
            {ar ? 'طلباتي على هذا الهاتف' : 'Mes commandes sur ce téléphone'}
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            {ar
              ? 'الطلبات المرسلة من هذا المتصفح. افتح الطلب لترى حالته، أو اطلب نفس المنتجات بثمن اليوم.'
              : 'Les commandes passées depuis ce navigateur. Ouvrez une commande pour voir son état, ou recommandez les mêmes articles au prix du jour.'}
          </p>
          <ul className="space-y-3">
            {mesCommandes.map(c => {
              const date = dateLisible(c.date, ar);
              return (
                <li key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#C8102E]/10 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-[#C8102E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-[#0F0F0F]">
                        {c.numero
                          ? <bdi dir="ltr" className="font-mono break-all">{c.numero}</bdi>
                          : ar ? 'طلب' : 'Commande'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {[date, c.total > 0 ? formatPrice(c.total) : ''].filter(Boolean).join(' · ') || (ar ? 'آخر طلب' : 'Dernière commande')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
                    <Link
                      href={lienPage(`/shop/confirmation/${c.id}`, language)}
                      className="flex min-h-[44px] items-center justify-center gap-1.5 px-3 rounded-xl bg-[#0F0F0F] text-white text-xs font-bold hover:bg-black transition-colors"
                    >
                      {ar ? 'عرض الطلب وحالته' : 'Voir la commande et son état'}
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </Link>
                    <BoutonRecommander idCommande={c.id} compact />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="text-center mt-3">
            <button
              type="button"
              onClick={effacerListe}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-gray-500 hover:text-[#C8102E] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {ar ? 'حذف هذه القائمة من هذا الهاتف' : 'Effacer cette liste de ce téléphone'}
            </button>
          </div>
        </section>
      )}

      {/* ── 2. Retrouver une commande (n° + téléphone) ── */}
      <section aria-labelledby="retrouver">
        <h2 id="retrouver" className="text-lg font-bold text-[#0F0F0F] mb-3">
          {mesCommandes && mesCommandes.length > 0
            ? ar ? 'طلب آخر؟' : 'Une autre commande ?'
            : ar ? 'ابحث عن طلبك' : 'Retrouver une commande'}
        </h2>
        <form onSubmit={chercher} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4 space-y-4" noValidate>
          <div>
            <label htmlFor="numero-input" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {ar ? 'رقم الطلب *' : 'N° de commande *'}
            </label>
            <div dir="ltr" className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
              <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                id="numero-input"
                type="text"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="LBT-XXXXXXXX-XXXX"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 text-base font-mono bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400"
              />
            </div>
          </div>
          <div>
            <label htmlFor="phone-input" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {ar ? 'رقم الهاتف المستعمل في الطلب *' : 'Téléphone utilisé pour la commande *'}
            </label>
            {/* Un numéro s'écrit de gauche à droite, même sur le site en arabe. */}
            <div dir="ltr" className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white focus-within:border-[#C8102E] focus-within:ring-2 focus-within:ring-[#C8102E]/10 transition-all">
              <span className="text-sm">🇲🇦</span>
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                id="phone-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telephone}
                onChange={e => setTelephone(e.target.value)}
                placeholder="06 XX XX XX XX"
                className="flex-1 min-w-0 text-base bg-transparent text-[#0F0F0F] focus:outline-none placeholder-gray-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={recherche}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] py-3.5 rounded-xl font-bold text-white bg-[#C8102E] hover:bg-[#a50d25] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-[#C8102E]/20 text-sm"
          >
            {recherche ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {recherche ? (ar ? 'جاري البحث…' : 'Recherche…') : (ar ? 'عرض الطلب' : 'Afficher la commande')}
          </button>
        </form>

        <div aria-live="polite">
          {erreur && (
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5 mb-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-[#0F0F0F]">{erreur[language]}</p>
                <a
                  href={getWhatsAppContact()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-green-700 font-semibold hover:underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  {ar ? 'تواصل معنا عبر واتساب' : 'Contactez-nous sur WhatsApp'}
                </a>
              </div>
            </div>
          )}
          {trouvee && (
            <div className="mb-4">
              <CarteSuivie
                c={trouvee.commande}
                numeroTape={trouvee.numeroTape}
                reglages={reglages}
                reglagesCharges={reglagesCharges}
              />
            </div>
          )}
        </div>

        {!trouvee && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#D4A843]/10 border border-[#D4A843]/20">
            <div className="text-[#D4A843] text-lg flex-shrink-0">💡</div>
            <div className="text-sm text-gray-600">
              <p className="font-semibold text-[#0F0F0F]">{ar ? 'أين أجد رقم الطلب؟' : 'Où trouver le n° de commande ?'}</p>
              <p className="mt-1">
                {ar
                  ? 'يبدأ بـ LBT-. تجده في صفحة تأكيد الطلب، وفي رسالة التأكيد بالبريد الإلكتروني أو واتساب. الطلبات المرسلة من هذا المتصفح تظهر أعلى هذه الصفحة، وإلا اكتب رقم الطلب ورقم هاتفك.'
                  : 'Il commence par LBT-. Il est sur la page de confirmation, dans l’e-mail ou le message WhatsApp de confirmation. Les commandes passées depuis ce navigateur s’affichent en haut de cette page ; sinon, tapez le n° LBT-… et votre téléphone.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Ma liste ── */}
      <Link
        href={lienPage('/shop/ma-liste', language)}
        className="mt-8 flex min-h-[64px] items-center gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-[#C8102E] transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-[#C8102E]/10 flex items-center justify-center flex-shrink-0">
          <Heart className="w-5 h-5 text-[#C8102E] fill-[#C8102E]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-[#0F0F0F]">{ar ? 'قائمتي' : 'Ma liste'}</p>
          <p className="text-xs text-gray-500">
            {ar ? 'المنتجات التي حفظتها بالقلب ♡: اطلبها بلمسة واحدة.' : 'Les produits gardés avec le cœur ♡ : commandez-les d’un geste.'}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 rtl:rotate-180" />
      </Link>

      <div className="text-center mt-6">
        <Link
          href={lienPage('/shop/boutique', language)}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#C8102E] transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          {ar ? 'مواصلة التسوق' : 'Continuer les achats'}
        </Link>
      </div>
    </div>
  );
}
