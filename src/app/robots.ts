import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/shop',
        disallow: ['/admin-shop', '/gestion', '/staff', '/api'],
      },
    ],
    sitemap: 'https://lebtex.ma/sitemap.xml',
    host: 'https://lebtex.ma',
  };
}
