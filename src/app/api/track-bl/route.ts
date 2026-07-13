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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const T49_HEADERS = (apiKey: string) => ({
  'Authorization': `Token ${apiKey}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

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
  const hdrs = T49_HEADERS(apiKey);

  try {
    // ── STEP 1: Create tracking request ──────────────────────────────────────
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
      headers: hdrs,
      body: JSON.stringify(createBody),
    });

    const createData = await createRes.json();

    // 409 = already exists — extract existing ID from the error or search by BL
    let trackingRequestId: string | null = null;

    if (createRes.status === 201) {
      trackingRequestId = createData?.data?.id || null;
    } else if (createRes.status === 409 || createRes.status === 422) {
      // Search for existing tracking request
      const searchRes = await fetch(
        `https://api.terminal49.com/v2/tracking_requests?request_number=${encodeURIComponent(blNumber)}`,
        { method: 'GET', headers: hdrs }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        trackingRequestId = searchData?.data?.[0]?.id || null;
      }
    } else {
      const detail = createData?.errors?.[0]?.detail || 'B/L introuvable ou format invalide';
      return NextResponse.json({ error: detail, carrier: carrierName }, { status: 404 });
    }

    if (!trackingRequestId) {
      return NextResponse.json({ error: 'Impossible de créer la demande de tracking', carrier: carrierName }, { status: 404 });
    }

    // ── STEP 2: Poll until status ≠ 'pending' (max 20 seconds) ────────────
    let shipmentData: any = null;
    let finalStatus = 'pending';
    const MAX_TRIES = 10;
    const INTERVAL_MS = 2000;

    for (let i = 0; i < MAX_TRIES; i++) {
      await sleep(INTERVAL_MS);

      const pollRes = await fetch(
        `https://api.terminal49.com/v2/tracking_requests/${trackingRequestId}?include=shipment,shipment.transport_events,shipment.transport_events.location`,
        { method: 'GET', headers: hdrs }
      );

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      finalStatus = pollData?.data?.attributes?.status || 'pending';

      if (finalStatus === 'found' || finalStatus === 'delivered') {
        // Extract shipment from included
        const included: any[] = pollData?.included || [];
        const shipment = included.find((r: any) => r.type === 'shipment');
        if (shipment) {
          shipmentData = shipment;
          break;
        }
      }

      if (finalStatus === 'not_found' || finalStatus === 'failed') {
        break;
      }
      // 'pending' or 'retrying' → keep polling
    }

    if (!shipmentData && finalStatus !== 'found') {
      // Timeout or not found
      return NextResponse.json({
        error: finalStatus === 'not_found' || finalStatus === 'failed'
          ? 'B/L non trouvé chez la compagnie maritime'
          : 'Délai dépassé — Terminal49 n\'a pas encore récupéré les données (réessaie dans 1 min)',
        carrier: carrierName,
        scac,
        status: finalStatus,
      }, { status: 404 });
    }

    // ── STEP 3: Parse shipment data ───────────────────────────────────────────
    const sAttrs = shipmentData?.attributes || {};

    const fmt = (d: string | null | undefined) => {
      if (!d) return null;
      try { return new Date(d).toISOString().split('T')[0]; } catch { return null; }
    };

    const eta = fmt(sAttrs.pod_eta || sAttrs.estimated_arrival_at);
    const etd = fmt(sAttrs.pol_etd || sAttrs.estimated_departure_at);
    const vessel = sAttrs.vessel_name || null;
    const pod = sAttrs.pod_name || sAttrs.pod_locode || null;
    const pol = sAttrs.pol_name || sAttrs.pol_locode || null;
    const shippingLine = sAttrs.shipping_line_name || carrierName || scac || null;
    const status = sAttrs.shipping_line_status || sAttrs.status || null;

    return NextResponse.json({ bl: blNumber, carrier: shippingLine, scac, eta, etd, vessel, pod, pol, status });

  } catch (err: any) {
    console.error('[track-bl] error:', err);
    return NextResponse.json({ error: 'Erreur réseau: ' + err.message }, { status: 500 });
  }
}
