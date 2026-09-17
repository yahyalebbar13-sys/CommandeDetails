// ─── Emails d'un dossier d'arrivage ───────────────────────────────────────────
// Cherche dans TOUTE la boîte (pas seulement les derniers messages affichés) les
// emails qui parlent d'un dossier, puis les note avec le moteur de
// rapprochement partagé afin d'afficher pourquoi chaque email a été retenu.
//
// POST /api/emails/search
//   { account: 'lebtex', facture: { id, noBL, supplierId, ... }, supplierEmails?: string[] }

import { NextRequest, NextResponse } from 'next/server';
import { simpleParser } from 'mailparser';
import { getImapAccount, createImapClient, addressText } from '@/lib/imap-accounts';
import {
  imapSearchTermsForFacture,
  scoreEmailAgainstFacture,
  SEUIL_MIN,
} from '@/lib/email-arrivage-match';
import type { Facture } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 40;

export async function POST(req: NextRequest) {
  let body: { account?: string; facture?: Facture; folder?: string; supplierEmails?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const { account: accountKey, facture, folder = 'INBOX', supplierEmails } = body;
  if (!facture || !facture.id) {
    return NextResponse.json({ error: 'Dossier manquant' }, { status: 400 });
  }

  const account = getImapAccount(accountKey);
  if (!account) {
    return NextResponse.json({ error: 'Compte non configuré' }, { status: 400 });
  }

  const terms = imapSearchTermsForFacture(facture);
  if (terms.length === 0) {
    return NextResponse.json({
      emails: [],
      account: account.label,
      searched: [],
      warning: 'Ce dossier n\'a pas de numéro de BL : impossible de retrouver ses emails automatiquement.',
    });
  }

  const client = createImapClient(account);

  try {
    await client.connect();
    await client.mailboxOpen(folder, { readOnly: true });

    // Un SEARCH par terme (objet OU corps), puis union des UID trouvés.
    const uids = new Set<number>();
    for (const term of terms) {
      try {
        const found = await client.search(
          { or: [{ header: { subject: term } }, { body: term }] },
          { uid: true }
        );
        for (const uid of found || []) uids.add(uid);
      } catch (e: any) {
        console.warn('[emails/search] SEARCH échoué pour', term, e?.message);
      }
    }

    if (uids.size === 0) {
      await client.logout();
      return NextResponse.json({ emails: [], account: account.label, searched: terms });
    }

    // Les plus récents d'abord, et on plafonne le nombre de messages téléchargés.
    const wanted = Array.from(uids).sort((a, b) => b - a).slice(0, MAX_MESSAGES);

    const results: any[] = [];
    for await (const msg of client.fetch(wanted, { envelope: true, flags: true, source: true }, { uid: true })) {
      try {
        // msg.source est optionnel côté types : sans corps, rien à analyser.
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const email = {
          uid: msg.uid,
          messageId: parsed.messageId || '',
          subject: parsed.subject || '(Sans objet)',
          from: parsed.from?.text || '',
          to: addressText(parsed.to),
          date: parsed.date?.toISOString() || '',
          text: parsed.text?.slice(0, 4000) || '',
          isUnread: !msg.flags?.has('\\Seen'),
          hasAttachments: (parsed.attachments || []).length > 0,
          attachments: (parsed.attachments || []).map((a: any) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        };

        const match = scoreEmailAgainstFacture(email, facture, {
          accountKey: account.key,
          supplier: { name: (facture.supplierId || '').trim(), emails: supplierEmails },
        });

        if (match.score >= SEUIL_MIN) results.push({ ...email, match });
      } catch {
        // message illisible → ignoré
      }
    }

    await client.logout();

    results.sort((a, b) => b.match.score - a.match.score);
    return NextResponse.json({
      emails: results,
      account: account.label,
      searched: terms,
      scanned: wanted.length,
    });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    console.error('[emails/search] Erreur:', err?.message);
    return NextResponse.json(
      { error: `Recherche impossible : ${err?.message || 'erreur IMAP'}` },
      { status: 500 }
    );
  }
}
