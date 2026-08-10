// JSON-LD structured data for Google — LocalBusiness + Store schema
// This tells Google exactly what LEBTEX sells and where it is
export default function LocalBusinessSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'Store'],
        '@id': 'https://lebtex.ma/#business',
        name: 'LEBTEX',
        alternateName: ['لبتكس', 'Lebtex Mercerie'],
        description:
          'Spécialiste en mercerie au Maroc : fermetures éclair nylon et métal, élastiques, boutons pression, rubans, fils à coudre, tissus. Vente en gros et détail. Livraison rapide partout au Maroc. سحاب، مطاط، أزرار، أقمشة بالجملة في المغرب.',
        url: 'https://lebtex.ma',
        logo: {
          '@type': 'ImageObject',
          url: 'https://lebtex.ma/logo.png',
          width: 512,
          height: 512,
        },
        image: 'https://lebtex.ma/hero-banner.png',
        telephone: '+212600000000', // Update with real number
        email: 'lebtexsarlau@gmail.com',
        priceRange: '₺₺',
        currenciesAccepted: 'MAD',
        paymentAccepted: 'Cash, Paiement à la livraison',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Casablanca',
          addressRegion: 'Grand Casablanca',
          addressCountry: 'MA',
          postalCode: '20000',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: '33.5731',
          longitude: '-7.5898',
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
        sameAs: [
          'https://lebtex.ma',
          // Add Google My Business URL, Facebook, Instagram URLs here
        ],
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            opens: '08:00',
            closes: '18:00',
          },
        ],
        keywords: 'fermeture éclair, élastique, bouton, ruban, tissu, mercerie, Maroc, سحاب, مطاط, أزرار, قماش',
      },
      {
        '@type': 'Organization',
        '@id': 'https://lebtex.ma/#organization',
        name: 'LEBTEX',
        url: 'https://lebtex.ma',
        logo: {
          '@type': 'ImageObject',
          url: 'https://lebtex.ma/logo.png',
          width: 512,
          height: 512,
        },
        sameAs: [
          'https://lebtex.ma',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://lebtex.ma/#website',
        url: 'https://lebtex.ma',
        name: 'LEBTEX',
        description: 'Mercerie & Accessoires Textiles au Maroc',
        publisher: { '@id': 'https://lebtex.ma/#business' },
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://lebtex.ma/shop/boutique?q={search_term_string}',
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
