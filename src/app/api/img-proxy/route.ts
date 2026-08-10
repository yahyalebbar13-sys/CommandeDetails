import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  try {
    const data = await new Promise<Buffer>((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const options = url.startsWith('https')
        ? { rejectUnauthorized: false }
        : {};

      mod.get(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

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
  } catch {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
