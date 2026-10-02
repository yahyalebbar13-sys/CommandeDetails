import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Politique de confidentialité de lebtex.ma (lien obligatoire du formulaire de
// commande). Loi 09-08 : dire ce qu'on collecte, pourquoi, qui y a accès,
// combien de temps, et comment exercer ses droits. À garder en phase avec ce
// que le site enregistre vraiment (shop_orders, comptes clients, panier local).

export const metadata: Metadata = {
  title: 'Politique de confidentialité | LEBTEX',
  description: 'Ce que LEBTEX fait de vos informations personnelles quand vous commandez sur lebtex.ma (loi 09-08).',
};

const VERSION = '02/10/2026';

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
const EMAIL = 'lebtexsarlau@gmail.com';

export default function ConfidentialitePage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      <div className="bg-[#0F0F0F] text-white py-12 sm:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-[#D4A843] text-sm font-semibold uppercase tracking-widest mb-3">LEBTEX</p>
          <h1 className="text-3xl sm:text-4xl font-black mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Politique de confidentialité
          </h1>
          <p className="text-gray-300 text-sm">Version du {VERSION}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <article className="bg-white border border-[#E8E4DF] rounded-2xl p-5 sm:p-8">
          <p className="text-[15px] sm:text-base leading-relaxed text-[#3F3F3F] mb-6">
            Quand vous commandez sur lebtex.ma, vous nous confiez des informations personnelles. Voici, en clair, ce que nous en faisons,
            conformément à la loi 09-08 sur la protection des données personnelles.
          </p>

          <Section n={1} titre="Qui est responsable">
            <p>
              LEBTEX SARL AU, Casablanca. Pour toute question sur vos données : <a href={`mailto:${EMAIL}`} className={lien}>{EMAIL}</a>.
            </p>
          </Section>

          <Section n={2} titre="Ce que nous collectons">
            <Liste items={[
              'À la commande : votre nom, vos numéros de téléphone, votre adresse et votre ville, votre e-mail si vous le donnez, vos remarques, les articles commandés, le montant, le mode de réception et le moyen de paiement choisis.',
              'Si vous créez un compte : votre e-mail, votre nom, votre téléphone et les adresses que vous enregistrez.',
              'Les messages que vous nous envoyez (WhatsApp, e-mail) et les notes de l’appel de confirmation.',
              'Si vous payez par virement : le nom de l’émetteur et le montant, tels qu’ils apparaissent sur notre relevé bancaire.',
              'Sur votre appareil : votre panier, votre langue et ce que vous tapez dans le formulaire de commande (effacé une fois la commande passée) sont gardés dans votre navigateur, pour ne rien perdre si la page se recharge. Nous mesurons aussi la fréquentation du site de façon anonyme, sans cookie publicitaire.',
              'D’où vient votre visite : le lien par lequel vous êtes arrivé (par exemple une publicité ou un message WhatsApp), le site d’origine, la première page vue et, si vous y répondez, « Comment avez-vous connu LEBTEX ? ». Ces informations sont jointes à votre commande.',
            ]} />
            <p>Nous ne collectons aucun numéro de carte bancaire.</p>
          </Section>

          <Section n={3} titre="Pourquoi">
            <Liste items={[
              'Préparer, livrer et suivre votre commande, et vous appeler pour la confirmer.',
              'Vous envoyer la confirmation et le suivi de votre commande (WhatsApp, e-mail).',
              'Établir une facture si vous la demandez, et tenir notre comptabilité.',
              'Traiter un retour, un échange ou une réclamation.',
              'Savoir quelles annonces et quels messages amènent des commandes, pour mieux dépenser notre publicité.',
            ]} />
            <p>Nous ne vous envoyons pas de publicité sans votre accord.</p>
          </Section>

          <Section n={4} titre="Qui y a accès">
            <Liste items={[
              'L’équipe LEBTEX qui traite votre commande.',
              'Le transporteur qui livre votre commande (la société de livraison pour les colis, ou le transporteur chargé d’un envoi) : il reçoit seulement ce qu’il faut pour livrer, c’est-à-dire votre nom, votre téléphone, votre adresse, votre ville et le montant à encaisser.',
              'Nos prestataires techniques (hébergement du site et de la base de données), qui gardent ces informations pour notre compte.',
            ]} />
            <p>Vos informations ne sont jamais vendues ni louées.</p>
          </Section>

          <Section n={5} titre="Combien de temps">
            <Liste items={[
              'Les commandes et les factures : 10 ans, la durée de conservation des pièces comptables.',
              'Votre compte : tant que vous ne demandez pas sa suppression.',
              'Les messages : le temps de traiter votre demande.',
            ]} />
          </Section>

          <Section n={6} titre="Vos droits">
            <p>
              Vous pouvez demander à voir les informations que nous avons sur vous, les faire corriger, ou vous opposer à leur utilisation
              pour un motif légitime. Écrivez à <a href={`mailto:${EMAIL}`} className={lien}>{EMAIL}</a> avec votre nom et votre numéro de
              téléphone ou de commande. Vous pouvez aussi vous adresser à la CNDP, l’autorité marocaine de protection des données (www.cndp.ma).
            </p>
          </Section>

          <Section n={7} titre="Sécurité">
            <Liste items={[
              'L’accès aux commandes est réservé à l’équipe LEBTEX.',
              'Nous ne vous demanderons jamais de mot de passe ou de code par message.',
              'LEBTEX ne change jamais de RIB par message : en cas de doute, appelez-nous au +212 760 998 347.',
            ]} />
          </Section>

          <p className="pt-6 border-t border-[#EFEAE3] text-[15px] sm:text-base text-[#3F3F3F]">
            Voir aussi nos <Link href="/shop/conditions" className={lien}>conditions générales de vente</Link>.
          </p>
        </article>

        <p className="text-xs text-[#6B6B6B] mt-4 text-center">Document à faire valider par notre conseiller.</p>
      </div>
    </div>
  );
}
