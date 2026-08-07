import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ── Désactiver le cache du routeur Next.js 15 côté client ──────────────────
  // Empêche l'affichage d'une ancienne version lors de la navigation
  experimental: {
    staleTimes: {
      dynamic: 0,  // pages dynamiques : jamais en cache
      static: 0,   // pages statiques : jamais en cache non plus
    },
  },
  images: {
    // Servir WebP / AVIF automatiquement (jusqu'à 90% plus léger que PNG/JPEG)
    formats: ['image/avif', 'image/webp'],
    // Cache images 30 jours
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Tailles d'appareils courants
    deviceSizes: [375, 640, 768, 1024, 1280, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // ── Headers HTTP : forcer Firebase CDN + navigateur à ne JAMAIS servir d'ancienne version ─
  async headers() {
    return [
      {
        // Toutes les pages HTML
        source: '/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        // Assets statiques Next.js : cache permanent (nom unique par build)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Images optimisées Next.js
        source: '/_next/image(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000' },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/shop',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      {
        source: '/produit/:path*',
        destination: '/shop/produit/:path*',
        permanent: true,
      },
      {
        source: '/categorie/:path*',
        destination: '/shop/categorie/:path*',
        permanent: true,
      },
      {
        source: '/categories/:path*',
        destination: '/shop/categories/:path*',
        permanent: true,
      },
      {
        source: '/boutique/:path*',
        destination: '/shop/boutique/:path*',
        permanent: true,
      },
      {
        source: '/promotions/:path*',
        destination: '/shop/promotions/:path*',
        permanent: true,
      },
      {
        source: '/a-propos',
        destination: '/shop/a-propos',
        permanent: true,
      },
      {
        source: '/contact',
        destination: '/shop/contact',
        permanent: true,
      },
      {
        source: '/faq',
        destination: '/shop/faq',
        permanent: true,
      },
      {
        source: '/livraison',
        destination: '/shop/livraison',
        permanent: true,
      }
    ];
  },
};

export default nextConfig;
