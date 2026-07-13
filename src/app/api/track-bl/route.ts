import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

// SSL agent that bypasses certificate verification (Windows dev environment)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// SCAC code → Display name
const SCAC_TO_NAME: Record<string, string> = {
  MAEU: 'MAERSK', MRKU: 'MAERSK', MRSK: 'MAERSK',
  MSCU: 'MSC', MSDU: 'MSC', MEDU: 'MSC', MSCW: 'MSC',
  CMDU: 'CMA CGM', CMAU: 'CMA CGM', CGMU: 'CMA CGM', CGMX: 'CMA CGM',
  EGLV: 'EVERGREEN', EGHU: 'EVERGREEN',
  COSU: 'COSCO', CSNU: 'COSCO',
  HLCU: 'HAPAG-LLOYD', HLXU: 'HAPAG-LLOYD',
  OOLU: 'OOCL', OOCU: 'OOCL',
  YMLU: 'YANG MING', YMLP: 'YANG MING',
  APZU: 'APL', APMU: 'APL', APLU: 'APL',
  ONEY: 'ONE',
  ZIMU: 'ZIM',
  PILU: 'PIL',
  SUDU: 'HAMBURG SUD', HDMU: 'HAMBURG SUD',
  WHLC: 'WAN HAI',
  SNKU: 'SAFMARINE',
};

function extractScac(blNumber: string): string | null {
  const upper = blNumber.toUpperCase().trim();
  const prefix4 = upper.substring(0, 4);
  const prefix3 = upper.substring(0, 3);
  if (SCAC_TO_NAME[prefix4]) return prefix4;
  if (SCAC_TO_NAME[prefix3]) return prefix3;
  if (/^[A-Z]{4}/.test(upper)) return prefix4;
  return null;
}

// HTTP request using native https module (bypasses SSL issues on Windows)
function httpsRequest(url: string, options: { method: string; headers: Record<string, string>; body?: string }): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method,
      headers: options.headers,
      agent: httpsAgent,
    };

    if (options.body) {
      reqOptions.headers!['Content-Length'] = Buffer.byteLength(options.body).toString();
    }

    const req = https.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode || 0, data: raw });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const blNumber = searchParams.get('bl')?.trim().toUpperCase();

  if (!blNumber) {
    return NextResponse.json({ error: 'N° de B/L requis' }, { status: 400 });
  }

  const apiKey = process.env.TERMINAL49_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API non configurée' }, { status: 500 });
  }

  const scac = extractScac(blNumber);
  const carrierName = scac ? (SCAC_TO_NAME[scac] || scac) : null;

  const headers = {
    'Authorization': `Token ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  try {
    // ── STEP 1: Create tracking request ──────────────────────────────────────
    const createBody = JSON.stringify({
      data: {
        type: 'tracking_request',
        attributes: {
          request_number: blNumber,
          ...(scac ? { scac } : {}),
        },
      },
    });

    const createRes = await httpsRequest(
      'https://api.terminal49.com/v2/tracking_requests',
      { method: 'POST', headers, body: createBody }
    );

    let trackingRequestId: string | null = null;

    if (createRes.status === 201) {
      trackingRequestId = createRes.data?.data?.id || null;
    } else if (createRes.status === 409 || createRes.status === 422) {
      // Already exists — search for it
      const searchRes = await httpsRequest(
        `https://api.terminal49.com/v2/tracking_requests?request_number=${encodeURIComponent(blNumber)}`,
        { method: 'GET', headers }
      );
      if (searchRes.status === 200) {
        trackingRequestId = searchRes.data?.data?.[0]?.id || null;
      }
    }

    if (!trackingRequestId) {
      const errDetail = createRes.data?.errors?.[0]?.detail || 'B/L introuvable ou format invalide';
      return NextResponse.json({ error: errDetail, carrier: carrierName, scac }, { status: 404 });
    }

    // ── STEP 2: Poll until found (max ~20 seconds) ────────────────────────────
    let shipmentData: any = null;
    let finalStatus = 'pending';
    const MAX_TRIES = 10;
    const INTERVAL_MS = 2000;

    for (let i = 0; i < MAX_TRIES; i++) {
      await sleep(INTERVAL_MS);

      const pollRes = await httpsRequest(
        `https://api.terminal49.com/v2/tracking_requests/${trackingRequestId}?include=shipment`,
        { method: 'GET', headers }
      );

      if (pollRes.status !== 200) continue;

      finalStatus = pollRes.data?.data?.attributes?.status || 'pending';

      if (finalStatus === 'found' || finalStatus === 'delivered') {
        const included: any[] = pollRes.data?.included || [];
        const shipment = included.find((r: any) => r.type === 'shipment');
        if (shipment) { shipmentData = shipment; break; }
      }

      if (finalStatus === 'not_found' || finalStatus === 'failed') break;
    }

    if (!shipmentData) {
      return NextResponse.json({
        error: finalStatus === 'not_found' || finalStatus === 'failed'
          ? 'B/L non trouvé chez la compagnie maritime'
          : 'Délai dépassé — réessaie dans 1 minute',
        carrier: carrierName,
        scac,
        status: finalStatus,
      }, { status: 404 });
    }

    // ── STEP 3: Parse real shipment data ─────────────────────────────────────
    const sAttrs = shipmentData?.attributes || {};
    const fmt = (d: string | null | undefined) => {
      if (!d) return null;
      try { return new Date(d).toISOString().split('T')[0]; } catch { return null; }
    };

    return NextResponse.json({
      bl: blNumber,
      carrier: sAttrs.shipping_line_name || carrierName || scac,
      scac,
      eta: fmt(sAttrs.pod_eta || sAttrs.estimated_arrival_at),
      etd: fmt(sAttrs.pol_etd || sAttrs.estimated_departure_at),
      vessel: sAttrs.vessel_name || null,
      pod: sAttrs.pod_name || sAttrs.pod_locode || null,
      pol: sAttrs.pol_name || sAttrs.pol_locode || null,
      status: sAttrs.shipping_line_status || sAttrs.status || null,
    });

  } catch (err: any) {
    console.error('[track-bl] error:', err);
    return NextResponse.json({ error: 'Erreur réseau: ' + err.message }, { status: 500 });
  }
}
