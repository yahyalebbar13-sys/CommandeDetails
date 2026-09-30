import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPrice } from '@/lib/shop-utils';
import { DELAI_ZONE, FRAIS_ZONE, PERIPHERIE_CASABLANCA } from '@/lib/livraison-boutique';
import { PLAFOND_ESPECES_COLIS } from '@/lib/commandes-boutique';

// Conditions de vente de lebtex.ma (lien obligatoire du formulaire de commande).
// Les prix et délais viennent de livraison-boutique.ts, comme au panier.
// Choix du patron (29/09/2026) : pas d'arrhes, pas d'avance obligatoire, pas de
// paiement imposé avant le départ hors de Casablanca ; on propose, on n'impose pas.
// Le plafond d'espèces d'un colis est une règle de LEBTEX, jamais présentée comme
// celle du livreur. Le virement n'existe que si le patron a saisi son RIB (sinon
// l'option est cachée au formulaire) : le texte le dit.
//
// À FAIRE (hors page) : faire relire ce document par le conseiller de LEBTEX.
// La mention « à faire valider » n'est plus affichée aux clients.

export const metadata: Metadata = {
  title: 'Conditions générales de vente | LEBTEX',
  description: 'Commande, prix, livraison, retrait, paiement, retours : les conditions de vente de lebtex.ma.',
};

const VERSION = '29/09/2026';

function Section({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <section className="py-6 border-t border-[#EFEAE3]">
      <h2 className="text-lg sm:text-xl font-bold text-[#1A1A1A] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
        {n}. {titre}
      </h2>
      <div className="space-y-3 text-[15px] sm:text-base leading-relaxed text-[#3F3F3F]">{children}</div>
    </section>
  );
}

function Liste({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 list-disc pl-5 marker:text-[#C8102E]">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

const lien = 'text-[#C8102E] font-semibold underline hover:no-underline';

export default function ConditionsPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      <div className="bg-[#0F0F0F] text-white py-12 sm:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">LEBTEX</p>
          <h1 className="text-3xl sm:text-4xl font-black mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Conditions générales de vente
          </h1>
          <p className="text-gray-300 text-sm">Version du {VERSION}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <article className="bg-white border border-[#E8E4DF] rounded-2xl p-5 sm:p-8">
          <p className="text-[15px] sm:text-base leading-relaxed text-[#3F3F3F] mb-6">
            Ces conditions s’appliquent aux commandes passées sur lebtex.ma. En validant votre commande, vous les acceptez.
            Les points importants sont repris en clair sur notre page{' '}
            <Link href="/shop/livraison" className={lien}>Livraison, retrait et paiement</Link>.
          </p>

          <Section n={1} titre="Qui vend">
            <p>
              LEBTEX SARL AU, Casablanca. Téléphone et WhatsApp : <a href="tel:+212760998347" className={lien}>+212 760 998 347</a>.
              E-mail : <a href="mailto:lebtexsarlau@gmail.com" className={lien}>lebtexsarlau@gmail.com</a>.
              Horaires : du lundi au samedi, de 8h30 à 18h30.
            </p>
          </Section>

          <Section n={2} titre="Commande et confirmation">
            <Liste items={[
              'Votre commande est enregistrée sur le site, puis confirmée par téléphone : nous vous appelons sous 2 h pendant nos horaires, sinon le jour ouvré suivant.',
              'Si un article n’est plus disponible, nous vous le disons à l’appel et vous proposons une autre couleur (avec photo), d’attendre le prochain arrivage, un envoi partiel ou l’annulation. Vous ne payez que ce que vous recevez.',
              'Une commande qui contient un article volumineux (rouleau entier) devient ferme quand vous acceptez le prix du transport annoncé au téléphone. Avant cela, vous pouvez l’annuler sans frais.',
              'Toute autre commande peut être annulée sans frais avant son expédition ou sa remise.',
            ]} />
          </Section>

          <Section n={3} titre="Prix et frais">
            <Liste items={[
              'Les prix affichés sont les prix à payer, en dirhams (MAD). Aucune taxe ne s’y ajoute.',
              <>Colis livré par Sendit : {formatPrice(FRAIS_ZONE.casablanca)} à Casablanca ; {formatPrice(FRAIS_ZONE.standard)} dans la périphérie de Casablanca ({PERIPHERIE_CASABLANCA.join(', ')}) et les grandes villes ; {formatPrice(FRAIS_ZONE.eloignee)} dans les villes éloignées et toute ville absente de notre liste. Quelques zones éloignées de Casablanca sont à {formatPrice(FRAIS_ZONE.eloignee)} : nous vous le disons à l’appel, avant l’envoi.</>,
              'Le prix du colis ne dépend que de la ville : il est le même quel que soit le montant de la commande.',
              'Retrait en magasin : toujours gratuit.',
              'Rouleau entier ou grosse quantité : le prix du transport vous est annoncé au téléphone, avant tout envoi. Il n’est jamais ajouté sans votre accord.',
            ]} />
          </Section>

          <Section n={4} titre="Modes de réception">
            <p><strong className="text-[#1A1A1A]">Colis à domicile (petits articles, coupes pliées).</strong></p>
            <Liste items={[
              `Livré par Sendit, qui vous appelle avant de passer. Expédition sous 24 h (jours ouvrés) après l’appel de confirmation. Délai indicatif : Casablanca ${DELAI_ZONE.casablanca}, périphérie et grandes villes ${DELAI_ZONE.standard}, villes éloignées ${DELAI_ZONE.eloignee}.`,
              'Le colis ne s’ouvre pas et ne s’essaie pas avant le paiement.',
            ]} />
            <p><strong className="text-[#1A1A1A]">Retrait gratuit à Casablanca (toute commande).</strong></p>
            <Liste items={[
              'Les petits articles se retirent au magasin LEBTEX de Derb Omar, les rouleaux à notre dépôt LEBTEX CHRIFA. L’adresse exacte et le lien Google Maps vous sont envoyés par WhatsApp quand la commande est prête.',
              'La commande est gardée 7 jours ouvrés. Au-delà, elle est annulée et les articles retournent en stock.',
              'Une autre personne peut la retirer à votre place avec votre numéro de commande et votre nom.',
            ]} />
            <p><strong className="text-[#1A1A1A]">Rouleaux entiers et grosses quantités.</strong></p>
            <Liste items={[
              'Ils ne partent jamais en colis. Nous vous appelons pour organiser le transport.',
              'À Casablanca et environs : livraison par la camionnette LEBTEX, à la prochaine tournée.',
              'Dans une autre ville : un transporteur emporte la marchandise jusqu’à son dépôt dans votre ville, et vous la récupérez à ce dépôt. Le transporteur ne livre pas à domicile.',
              'Votre propre transporteur peut aussi venir chercher la marchandise chez nous, avec votre numéro de commande.',
            ]} />
          </Section>

          <Section n={5} titre="Paiement">
            <Liste items={[
              'En espèces à la réception : au livreur Sendit, ou au magasin lors du retrait.',
              'Par virement bancaire, si l’option est proposée au moment de commander : notre RIB s’affiche après la commande. Indiquez votre numéro de commande en motif. La commande est envoyée ou remise dès que l’argent est arrivé sur notre compte ; une capture d’écran de virement ne suffit pas.',
              `Au-delà de ${formatPrice(PLAFOND_ESPECES_COLIS)} d’espèces pour un colis, nous vous proposons au téléphone la solution la plus simple (virement, retrait gratuit ou autre arrangement).`,
              'Pour un rouleau ou un envoi par transporteur, la façon de payer la marchandise et le transport est convenue avec vous au téléphone, avant le départ.',
              'LEBTEX ne change jamais de RIB par message. En cas de doute, appelez-nous.',
            ]} />
          </Section>

          <Section n={6} titre="À la réception">
            <Liste items={[
              'Vérifiez la marchandise dès réception. Un dommage visible (carton ouvert ou écrasé, rouleau mouillé ou abîmé) est à nous signaler sous 48 h, avec des photos, sur WhatsApp.',
              'Pour un envoi par transporteur, vérifiez aussi le nombre de colis devant lui avant de signer.',
            ]} />
          </Section>

          <Section n={7} titre="Tissus : bains de teinture et métrage">
            <Liste items={[
              'De légers écarts de couleur sont possibles entre deux bains de teinture. Si votre commande mélange deux bains, nous vous prévenons avant l’envoi.',
              'Un rouleau est vendu au métrage de son étiquette, à plus ou moins 2 % près. Sur demande, nous le remesurons avant l’envoi.',
              'Une coupe au mètre est mesurée au moment de la préparation de votre commande.',
            ]} />
          </Section>

          <Section n={8} titre="Retours, échanges et rétractation">
            <Liste items={[
              'La loi 31-08 sur la protection du consommateur vous donne 7 jours après la réception pour vous rétracter, sans avoir à donner de motif. LEBTEX va plus loin : un article non utilisé, dans son emballage d’origine (film intact pour un rouleau), est repris pendant 14 jours après la réception.',
              'Le tissu coupé au mètre, ou tout article préparé sur mesure à votre demande, n’est ni repris ni échangé.',
              'Si vous changez d’avis, le transport du retour est à votre charge. Un rouleau ne s’échange que si le même bain est disponible.',
              'Article défectueux, abîmé pendant le transport ou erreur de notre part : nous le remplaçons à nos frais, transport compris, ou nous vous remboursons.',
              'Le remboursement se fait par virement, au plus tard 15 jours après le retour de l’article.',
              'Pour tout retour, écrivez-nous d’abord sur WhatsApp avec votre numéro de commande et des photos.',
            ]} />
          </Section>

          <Section n={9} titre="Données personnelles">
            <p>
              Nous utilisons vos informations seulement pour traiter et livrer votre commande. Tout est expliqué dans notre{' '}
              <Link href="/shop/confidentialite" className={lien}>politique de confidentialité</Link>.
            </p>
          </Section>

          <Section n={10} titre="Désaccord">
            <p>
              En cas de problème, écrivez-nous : nous cherchons d’abord une solution à l’amiable. Ces conditions sont soumises au droit marocain.
            </p>
          </Section>
        </article>

      </div>
    </div>
  );
}
