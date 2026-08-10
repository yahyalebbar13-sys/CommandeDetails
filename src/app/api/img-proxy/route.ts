import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

// Agent that skips SSL verification (for Firebase Storage cert issues)
const agent = new https.Agent({ rejectUnauthorized: false });

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  try {
    // Use Node fetch with custom agent — follows redirects AND skips SSL
    const resp = await fetch(url, {
      // @ts-expect-error — Node.js fetch accepts agent via dispatcher
      agent,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      // Fallback: try without agent (some URLs don't need SSL bypass)
      const resp2 = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (!resp2.ok) throw new Error(`Failed: ${resp2.status}`);
      const buf2 = Buffer.from(await resp2.arrayBuffer());
      const ct2 = resp2.headers.get('content-type') || 'image/jpeg';
      return new NextResponse(buf2, {
        headers: {
          'Content-Type': ct2,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 
      (url.includes('.png') ? 'image/png' :
       url.includes('.webp') ? 'image/webp' : 'image/jpeg');

    return new NextResponse(buf, {
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
