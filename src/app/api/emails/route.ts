import { NextRequest, NextResponse } from 'next/server';
import { simpleParser } from 'mailparser';
import { getImapAccount, createImapClient, addressText } from '@/lib/imap-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountKey = searchParams.get('account') || 'lebtex';
  const folder = searchParams.get('folder') || 'INBOX';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50);

  const account = getImapAccount(accountKey);
  if (!account) {
    return NextResponse.json({ error: 'Compte non configuré' }, { status: 400 });
  }

  const client = createImapClient(account);

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(folder);
    const total = mailbox.exists;

    if (total === 0) {
      await client.logout();
      return NextResponse.json({ emails: [], total: 0, account: account.label });
    }

    // Récupérer les N derniers emails
    const start = Math.max(1, total - limit + 1);
    const range = `${start}:${total}`;
    const emails: any[] = [];

    for await (const msg of client.fetch(range, { envelope: true, flags: true, bodyStructure: true, source: true })) {
      try {
        // msg.source est optionnel côté types : sans corps, rien à analyser.
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        emails.push({
          uid: msg.uid,
          seq: msg.seq,
          messageId: parsed.messageId || '',
          subject: parsed.subject || '(Sans objet)',
          from: parsed.from?.text || '',
          to: addressText(parsed.to),
          date: parsed.date?.toISOString() || '',
          // 4000 caractères : le n° de dossier apparaît souvent après la
          // signature ou dans un historique de réponse cité.
          text: parsed.text?.slice(0, 4000) || '',
          html: parsed.html || '',
          isUnread: !msg.flags?.has('\\Seen'),
          hasAttachments: (parsed.attachments || []).length > 0,
          attachments: (parsed.attachments || []).map((a: any) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        });
      } catch {
        // skip malformed messages
      }
    }

    await client.logout();

    // Retourner du plus récent au plus ancien
    return NextResponse.json({
      emails: emails.reverse(),
      total,
      account: account.label,
      folder,
    });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    console.error('[IMAP] Erreur:', err.message);
    return NextResponse.json(
      { error: `Impossible de se connecter : ${err.message}` },
      { status: 500 }
    );
  }
}
