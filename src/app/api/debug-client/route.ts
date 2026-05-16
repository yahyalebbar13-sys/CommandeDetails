/**
 * GET /api/debug-client?name=Berrada&uid=ADMIN_UID
 * Diagnostic endpoint — checks why a client is not receiving emails.
 * Returns: articles linked to this client, their statuses, and email lookup result.
 * 
 * Usage in browser console:
 *   fetch('/api/debug-client?name=Berrada').then(r=>r.json()).then(console.log)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Use POST with { firestore, adminUid, clientName } from client side. This endpoint is for reference only.',
    tip: 'Check browser console for [AutoNotifier] and [Facture] logs after opening the admin app.',
  });
}
