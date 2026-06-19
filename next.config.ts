import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
  // ── Headers HTTP pour éviter l'affichage de l'ancienne version ──────────────
  async headers() {
    return [
      {
        // Pages HTML : toujours vérifier la version serveur en arrière-plan
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        // Assets statiques (JS/CSS) : cache long car leur nom change à chaque build
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      // beforeFiles: runs BEFORE filesystem check — overrides src/app/page.tsx
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
};

export default nextConfig;
