// Fix SSL certificate verification on Windows dev environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NextRequest, NextResponse } from 'next/server';

// Carrier detection from B/L prefix
const BL_CARRIER_MAP: Record<string, string> = {
  MAEU: 'MAERSK', MRKU: 'MAERSK', MRSK: 'MAERSK', MAERSK: 'MAERSK',
  MSCU: 'MSC', MSDU: 'MSC', MEDU: 'MSC', MSCW: 'MSC',
  CMAU: 'CMA CGM', CGMU: 'CMA CGM', CGMX: 'CMA CGM', CMDU: 'CMA CGM',
  EGLV: 'EVERGREEN', EGHU: 'EVERGREEN',
  COSU: 'COSCO', COSCOX: 'COSCO', CSNU: 'COSCO',
  HLCU: 'HAPAG-LLOYD', HLXU: 'HAPAG-LLOYD',
  OOLU: 'OOCL', OOCU: 'OOCL',
  YMLU: 'YANG MING', YMLP: 'YANG MING',
  APZU: 'APL', APMU: 'APL',
  ONEY: 'ONE', ONEU: 'ONE',
  SNKU: 'SAFMARINE',
  ZIMU: 'ZIM', ZIME: 'ZIM',
  PILU: 'PIL',
  WHLC: 'WAN HAI',
  SMLU: 'SIMATECH',
  TEXU: 'TEXTAINER',
  SUDU: 'HAMBURG SUD', HDMU: 'HAMBURG SUD',
};

function detectCarrier(blNumber: string): string | null {
  if (!blNumber) return null;
  const upper = blNumber.toUpperCase().trim();
  // Try prefixes from longest to shortest
  for (const prefix of Object.keys(BL_CARRIER_MAP).sort((a, b) => b.length - a.length)) {
    if (upper.startsWith(prefix)) return BL_CARRIER_MAP[prefix];
  }
  return null;
}

// Terminal49 carrier codes for their API
const CARRIER_T49_CODES: Record<string, string> = {
  'MAERSK': 'maersk',
  'MSC': 'msc',
  'CMA CGM': 'cma-cgm',
  'EVERGREEN': 'evergreen',
  'COSCO': 'cosco',
  'HAPAG-LLOYD': 'hapag-lloyd',
  'OOCL': 'oocl',
  'YANG MING': 'yang-ming',
  'APL': 'apl',
  'ONE': 'one',
  'ZIM': 'zim',
  'PIL': 'pil',
  'HAMBURG SUD': 'hamburg-sud',
  'WAN HAI': 'wan-hai-lines',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const blNumber = searchParams.get('bl')?.trim().toUpperCase();

  if (!blNumber) {
    return NextResponse.json({ error: 'B/L number required' }, { status: 400 });
  }

  const apiKey = process.env.TERMINAL49_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const detectedCarrier = detectCarrier(blNumber);
  const carrierCode = detectedCarrier ? CARRIER_T49_CODES[detectedCarrier] : null;

  try {
    // Step 1: Create a tracking request on Terminal49
    const createBody: any = {
      data: {
        type: 'tracking_request',
        attributes: {
          bl_number: blNumber,
          ...(carrierCode ? { shipping_line_scac: carrierCode } : {}),
        },
      },
    };

    const createRes = await fetch('https://api.terminal49.com/v2/tracking_requests', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('[track-bl] T49 create error:', createRes.status, errText);
      
      // Try GET instead (may already be tracked)
      const getRes = await fetch(
        `https://api.terminal49.com/v2/tracking_requests?bl_number=${encodeURIComponent(blNumber)}`,
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!getRes.ok) {
        return NextResponse.json({
          error: 'B/L introuvable ou compagnie maritime non supportée',
          carrier: detectedCarrier,
        }, { status: 404 });
      }
      
      const getData = await getRes.json();
      return parseAndRespond(getData, blNumber, detectedCarrier);
    }

    const createData = await createRes.json();

    // If status is pending, poll once more after a short wait (or return what we have)
    // For immediate response, we parse what's available
    return parseAndRespond(createData, blNumber, detectedCarrier);

  } catch (err: any) {
    console.error('[track-bl] fetch error:', err);
    return NextResponse.json({ error: 'Erreur réseau', details: err.message }, { status: 500 });
  }
}

function parseAndRespond(data: any, blNumber: string, detectedCarrier: string | null) {
  try {
    // Terminal49 returns JSON:API format
    const attrs = data?.data?.attributes || {};
    const included = data?.included || [];

    // Find the shipment in included resources
    const shipment = included.find((r: any) => r.type === 'shipment') || {};
    const shipAttrs = shipment?.attributes || {};

    // Find port of discharge event
    const podEvent = included.find((r: any) =>
      r.type === 'transport_event' &&
      (r.attributes?.event_type === 'arrival' || r.attributes?.event_type === 'discharge')
    );

    // Extract ETA
    const eta: string | null =
      shipAttrs?.pod_eta ||
      shipAttrs?.estimated_arrival ||
      podEvent?.attributes?.estimated_at ||
      podEvent?.attributes?.actual_at ||
      attrs?.pod_eta ||
      null;

    // Extract vessel
    const vessel: string | null =
      shipAttrs?.vessel_name ||
      attrs?.vessel_name ||
      null;

    // Extract POD name
    const pod: string | null =
      shipAttrs?.pod_locode ||
      shipAttrs?.pod_name ||
      attrs?.pod_name ||
      null;

    // Extract ETD
    const etd: string | null =
      shipAttrs?.pol_etd ||
      shipAttrs?.estimated_departure ||
      attrs?.pol_etd ||
      null;

    // Status
    const status: string | null =
      shipAttrs?.shipping_line_status ||
      attrs?.status ||
      null;

    // Format dates to YYYY-MM-DD
    const fmt = (d: string | null) => {
      if (!d) return null;
      try { return new Date(d).toISOString().split('T')[0]; } catch { return null; }
    };

    const shippingLine =
      shipAttrs?.shipping_line_name ||
      attrs?.shipping_line_name ||
      detectedCarrier ||
      null;

    return NextResponse.json({
      bl: blNumber,
      carrier: shippingLine,
      eta: fmt(eta),
      etd: fmt(etd),
      vessel,
      pod,
      status,
      raw_status: attrs?.status,
    });
  } catch (parseErr: any) {
    console.error('[track-bl] parse error:', parseErr);
    return NextResponse.json({
      bl: blNumber,
      carrier: detectedCarrier,
      eta: null,
      etd: null,
      vessel: null,
      pod: null,
      status: null,
      parse_error: parseErr.message,
    });
  }
}
