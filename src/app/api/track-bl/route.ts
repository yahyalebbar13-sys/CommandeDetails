// Fix SSL certificate verification on Windows dev environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NextRequest, NextResponse } from 'next/server';

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
  SMLU: 'SIMATECH',
};

// Extract SCAC from B/L number (first 4 uppercase letters)
function extractScac(blNumber: string): string | null {
  const upper = blNumber.toUpperCase().trim();
  // Most B/L numbers start with a 4-letter SCAC followed by digits
  const match = upper.match(/^([A-Z]{3,4})/);
  if (!match) return null;
  const prefix4 = upper.substring(0, 4);
  const prefix3 = upper.substring(0, 3);
  // Prefer 4-letter match
  if (SCAC_TO_NAME[prefix4]) return prefix4;
  if (SCAC_TO_NAME[prefix3]) return prefix3;
  // Return raw 4-letter prefix anyway — Terminal49 may still recognize it
  return prefix4;
}

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
    // Terminal49 API: POST /v2/tracking_requests
    // Required fields: request_number (B/L) + scac (carrier code)
    const createBody = {
      data: {
        type: 'tracking_request',
        attributes: {
          request_number: blNumber,
          ...(scac ? { scac } : {}),
        },
      },
    };

    const createRes = await fetch('https://api.terminal49.com/v2/tracking_requests', {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody),
    });

    const createData = await createRes.json();

    // 422 may mean B/L already tracked or format issue — try to GET it
    if (createRes.status === 422 || createRes.status === 409) {
      // Try fetching existing tracking
      const getRes = await fetch(
        `https://api.terminal49.com/v2/tracking_requests?request_number=${encodeURIComponent(blNumber)}`,
        { method: 'GET', headers }
      );
      if (getRes.ok) {
        const getData = await getRes.json();
        return parseResponse(getData, blNumber, carrierName, scac);
      }
    }

    if (!createRes.ok) {
      const detail = createData?.errors?.[0]?.detail || 'B/L introuvable';
      return NextResponse.json({
        error: detail,
        carrier: carrierName,
        scac,
      }, { status: 404 });
    }

    return parseResponse(createData, blNumber, carrierName, scac);

  } catch (err: any) {
    console.error('[track-bl] error:', err);
    return NextResponse.json({ error: 'Erreur réseau: ' + err.message }, { status: 500 });
  }
}

function parseResponse(data: any, blNumber: string, carrierName: string | null, scac: string | null) {
  try {
    const attrs = data?.data?.attributes || {};
    const included: any[] = data?.included || [];

    // Shipment data
    const shipment = included.find((r: any) => r.type === 'shipment');
    const sAttrs = shipment?.attributes || {};

    // Port of discharge event for ETA
    const podEvent = included.find((r: any) =>
      r.type === 'transport_event' &&
      ['arrival', 'discharge', 'pod_arrival'].includes(r.attributes?.event_type || '')
    );

    const fmt = (d: string | null | undefined) => {
      if (!d) return null;
      try { return new Date(d).toISOString().split('T')[0]; } catch { return null; }
    };

    const eta = fmt(
      sAttrs.pod_eta ||
      sAttrs.estimated_arrival_at ||
      podEvent?.attributes?.estimated_at ||
      attrs.pod_eta ||
      attrs.estimated_arrival_at
    );

    const etd = fmt(
      sAttrs.pol_etd ||
      sAttrs.estimated_departure_at ||
      attrs.pol_etd
    );

    const vessel =
      sAttrs.vessel_name ||
      sAttrs.vessel?.name ||
      attrs.vessel_name || null;

    const pod =
      sAttrs.pod_name ||
      sAttrs.pod?.name ||
      sAttrs.pod_locode ||
      attrs.pod_name || null;

    const shippingLine =
      sAttrs.shipping_line_name ||
      attrs.shipping_line_name ||
      carrierName || scac || null;

    const status =
      sAttrs.shipping_line_status ||
      sAttrs.status ||
      attrs.status ||
      (data?.data?.attributes?.status) || null;

    return NextResponse.json({
      bl: blNumber,
      carrier: shippingLine,
      scac,
      eta,
      etd,
      vessel,
      pod,
      status,
    });
  } catch (e: any) {
    return NextResponse.json({
      bl: blNumber,
      carrier: carrierName,
      scac,
      eta: null,
      etd: null,
      vessel: null,
      pod: null,
      status: null,
      parse_error: e.message,
    });
  }
}
