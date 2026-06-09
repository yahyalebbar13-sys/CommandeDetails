import https from 'https';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy d'images Firebase Storage — contourne les restrictions CORS du navigateur.
 * Utilise https.get() avec rejectUnauthorized: false pour contourner le proxy SSL
 * du réseau local (même mécanisme que NODE_TLS_REJECT_UNAUTHORIZED=0).
 *
 * Usage : /api/image-proxy?url=<encodeURIComponent(firebaseUrl)>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Sécurité : uniquement les URLs Firebase Storage
  if (
    !url.startsWith('https://firebasestorage.googleapis.com') &&
    !url.startsWith('https://storage.googleapis.com')
  ) {
    return new NextResponse('Only Firebase Storage URLs are allowed', { status: 403 });
  }

  return new Promise<NextResponse>((resolve) => {
    // Utilise https.get() avec rejectUnauthorized: false pour contourner le proxy SSL
    const agent = new https.Agent({ rejectUnauthorized: false });

    https.get(url, { agent }, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          resolve(new NextResponse(`Firebase Storage error: ${res.statusCode}`, { status: res.statusCode }));
          return;
        }
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve(new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        }));
      });

      res.on('error', (err: Error) => {
        console.error('[image-proxy] Response error:', err);
        resolve(new NextResponse('Stream error', { status: 500 }));
      });
    }).on('error', (err: Error) => {
      console.error('[image-proxy] Request error:', err);
      resolve(new NextResponse('Request error', { status: 500 }));
    });
  });
}
