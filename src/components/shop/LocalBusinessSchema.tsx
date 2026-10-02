import { SITE_URL } from '@/lib/catalogue-serveur';
import {
  EMAIL_LEBTEX,
  NUMEROS_LEGAUX,
  RAISON_SOCIALE,
  SIEGE,
  TELEPHONES_SIEGE,
  WHATSAPP_BOUTIQUE,
} from '@/lib/identite-lebtex';

// JSON-LD structured data for Google — LocalBusiness + Store schema
// This tells Google exactly what LEBTEX sells and where it is
// Seulement des informations vraies : pas d'avis, pas de note, pas de coordonnées GPS
// tant qu'on ne les a pas (le centre de Casablanca n'est pas le magasin).
// Identité légale (02/10/2026) : celle des factures de /gestion (lib/identite-lebtex).
export default function LocalBusinessSchema() {
  const logo = {
    '@type': 'ImageObject',
    url: `${SITE_URL}/logo.png`,
    width: 1536,
    height: 1024,
  };

  // Société qui vend : raison sociale, numéros légaux (IF = identifiant fiscal ; ICE, RC et
  // patente en identifiants marocains) et numéros de contact. Sur la société ET sur le magasin.
  const identiteLegale = {
    legalName: RAISON_SOCIALE,
    taxID: NUMEROS_LEGAUX.identifiantFiscal,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'ICE', value: NUMEROS_LEGAUX.ice },
      { '@type': 'PropertyValue', propertyID: 'RC', value: NUMEROS_LEGAUX.rc },
      { '@type': 'PropertyValue', propertyID: 'IF', value: NUMEROS_LEGAUX.identifiantFiscal },
      { '@type': 'PropertyValue', propertyID: 'Patente', value: NUMEROS_LEGAUX.patente },
    ],
    // WhatsApp de la boutique d'abord (le numéro affiché partout), puis les fixes du siège
    contactPoint: [WHATSAPP_BOUTIQUE, ...TELEPHONES_SIEGE].map(telephone => ({
      '@type': 'ContactPoint',
      telephone,
      contactType: 'customer service',
      areaServed: 'MA',
      availableLanguage: ['French', 'Arabic'],
    })),
  };

  // Adresse du siège (Aïn Chock) : seulement sur la société. Les clients sont reçus dans les
  // magasins (Derb Omar, boulevard Haïfa) : le magasin garde la ville seule, sans rue, tant que
  // la rue exacte n'est pas connue (sinon Google placerait le magasin au siège).
  // Pas de code postal : il n'est pas sur les documents.
  const adresseSiege = {
    '@type': 'PostalAddress',
    streetAddress: `${SIEGE.rue}, ${SIEGE.quartier}`,
    addressLocality: SIEGE.ville,
    addressRegion: 'Casablanca-Settat',
    addressCountry: 'MA',
  };
  const adresseMagasin = {
    '@type': 'PostalAddress',
    addressLocality: 'Casablanca',
    addressRegion: 'Casablanca-Settat',
    addressCountry: 'MA',
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
        telephone: WHATSAPP_BOUTIQUE,
        email: EMAIL_LEBTEX,
        priceRange: '$$',
        currenciesAccepted: 'MAD',
        paymentAccepted: 'Espèces, à la livraison ou au retrait',
        // Raison sociale et numéros légaux ; l'adresse du siège reste sur la société (#organization)
        ...identiteLegale,
        address: adresseMagasin,
        parentOrganization: { '@id': `${SITE_URL}/#organization` },
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
        email: EMAIL_LEBTEX,
        ...identiteLegale,
        address: adresseSiege,
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
