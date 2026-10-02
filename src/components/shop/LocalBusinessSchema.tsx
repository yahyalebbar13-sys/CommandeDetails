import { SITE_URL } from '@/lib/catalogue-serveur';

// JSON-LD structured data for Google — LocalBusiness + Store schema
// This tells Google exactly what LEBTEX sells and where it is
// Seulement des informations vraies : pas d'avis, pas de note, pas de rue ni de
// coordonnées GPS tant qu'on ne les a pas (le centre de Casablanca n'est pas le magasin).
export default function LocalBusinessSchema() {
  const logo = {
    '@type': 'ImageObject',
    url: `${SITE_URL}/logo.png`,
    width: 1536,
    height: 1024,
  };

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'Store'],
        '@id': `${SITE_URL}/#business`,
        name: 'LEBTEX',
        alternateName: ['لبتكس', 'Lebtex Mercerie'],
        description:
          'Mercerie en gros et au détail à Casablanca : fermetures éclair, fils, doublures, entoilages, boutons, élastiques, rubans. Livraison partout au Maroc, paiement à la livraison. خردوات الخياطة بالجملة والتقسيط في الدار البيضاء.',
        url: SITE_URL,
        logo,
        image: `${SITE_URL}/og-lebtex.jpg`,
        // Le numéro affiché sur la page À propos et partout sur le site (WhatsApp compris).
        telephone: '+212 760 998 347',
        email: 'lebtexsarlau@gmail.com',
        priceRange: '$$',
        currenciesAccepted: 'MAD',
        paymentAccepted: 'Espèces, à la livraison ou au retrait',
        // Rue et code postal à ajouter quand le patron les aura donnés
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Casablanca',
          addressRegion: 'Casablanca-Settat',
          addressCountry: 'MA',
        },
        areaServed: [
          { '@type': 'City', name: 'Casablanca' },
          { '@type': 'City', name: 'Rabat' },
          { '@type': 'City', name: 'Marrakech' },
          { '@type': 'City', name: 'Fès' },
          { '@type': 'City', name: 'Tanger' },
          { '@type': 'Country', name: 'Maroc' },
        ],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Mercerie & Accessoires Textiles',
          itemListElement: [
            {
              '@type': 'OfferCatalog',
              name: 'Fermetures Éclair — سحاب',
              description: 'Fermetures nylon, métal, plastique. سحاب نايلون ومعدن وبلاستيك.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Élastiques — مطاط',
              description: 'Élastiques plats, ronds, tressés pour couture. مطاط للخياطة.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Boutons — أزرار',
              description: 'Boutons pression, décoratifs, chemise. أزرار ضغط وزخرفية.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Rubans & Galons — أشرطة',
              description: 'Rubans tissés, galons, dentelles. أشرطة ودانتيل.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Fils à Coudre — خيوط',
              description: 'Fils couture polyester et coton. خيوط الخياطة.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Tissus & Textiles — أقمشة',
              description: 'Tissus couture, doublures, toiles. أقمشة وخامات.',
            },
          ],
        },
        // sameAs : ajouter ici les pages Google Business, Facebook, Instagram une fois vérifiées
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            opens: '08:30',
            closes: '18:30',
          },
        ],
        keywords: 'fermeture éclair, élastique, bouton, ruban, tissu, mercerie, Maroc, سحاب, مطاط, أزرار, قماش',
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'LEBTEX',
        url: SITE_URL,
        logo,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'LEBTEX',
        description: 'Mercerie & Accessoires Textiles au Maroc',
        publisher: { '@id': `${SITE_URL}/#business` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/shop/boutique?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
        inLanguage: ['fr-MA', 'ar-MA'],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
