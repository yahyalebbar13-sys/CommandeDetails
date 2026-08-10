import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

// Follow redirects manually with https.get (which supports rejectUnauthorized)
function fetchWithRedirects(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    const isHttps = url.startsWith('https');
    const mod = isHttps ? https : http;
    const options = isHttps ? { rejectUnauthorized: false } : {};

    mod.get(url, options, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        // Handle relative redirects
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return fetchWithRedirects(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  try {
    const data = await fetchWithRedirects(url);

    const contentType =
      url.includes('.png') ? 'image/png' :
      url.includes('.webp') ? 'image/webp' :
      'image/jpeg';

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('img-proxy error:', url, e);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
