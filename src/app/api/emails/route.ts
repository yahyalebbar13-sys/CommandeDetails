import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// Comptes disponibles
const ACCOUNTS: Record<string, { user: string; pass: string; label: string }> = {
  lebtex: {
    user: process.env.IMAP_USER_LEBTEX || '',
    pass: process.env.IMAP_PASS_LEBTEX || '',
    label: 'LEBTEX',
  },
  robeinbox: {
    user: process.env.IMAP_USER_ROBEINBOX || '',
    pass: process.env.IMAP_PASS_ROBEINBOX || '',
    label: 'ROBE IN BOX',
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountKey = searchParams.get('account') || 'lebtex';
  const folder = searchParams.get('folder') || 'INBOX';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50);

  const account = ACCOUNTS[accountKey];
  if (!account || !account.user || !account.pass) {
    return NextResponse.json({ error: 'Compte non configuré' }, { status: 400 });
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
    tls: { rejectUnauthorized: false }, // Bypass SSL issues for local proxy/antivirus
  });

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
        const parsed = await simpleParser(msg.source);
        emails.push({
          uid: msg.uid,
          seq: msg.seq,
          subject: parsed.subject || '(Sans objet)',
          from: parsed.from?.text || '',
          to: parsed.to?.text || '',
          date: parsed.date?.toISOString() || '',
          text: parsed.text?.slice(0, 2000) || '',
          html: parsed.html || '',
          isUnread: !msg.flags.has('\\Seen'),
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
