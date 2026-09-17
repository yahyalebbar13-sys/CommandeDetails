import { NextRequest, NextResponse } from 'next/server';
import { simpleParser } from 'mailparser';
import { getImapAccount, createImapClient } from '@/lib/imap-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountKey = searchParams.get('account');
  const uid = searchParams.get('uid');
  const filename = searchParams.get('filename');

  if (!accountKey || !uid || !filename) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  const account = getImapAccount(accountKey);
  if (!account) {
    return NextResponse.json({ error: 'Compte non configuré' }, { status: 400 });
  }

  const client = createImapClient(account);

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Fetch the specific message by UID
    const message = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!message || !message.source) {
      await client.logout();
      return NextResponse.json({ error: 'Email non trouvé' }, { status: 404 });
    }

    const parsed = await simpleParser(message.source);
    await client.logout();

    const attachment = (parsed.attachments || []).find(a => a.filename === filename);
    if (!attachment) {
      return NextResponse.json({ error: 'Pièce jointe non trouvée' }, { status: 404 });
    }

    // Return the file buffer
    return new NextResponse(attachment.content, {
      headers: {
        'Content-Type': attachment.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      }
    });

  } catch (err: any) {
    try { await client.logout(); } catch {}
    console.error('[Attachment Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
