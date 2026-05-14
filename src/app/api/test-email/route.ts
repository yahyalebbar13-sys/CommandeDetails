import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to') || process.env.GMAIL_USER;

  const appPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.GMAIL_USER, pass: appPass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"LEBTEX Test" <${process.env.GMAIL_USER}>`,
      to: to!,
      subject: '✅ Test Notification LEBTEX',
      html: '<h2>✅ Les notifications Gmail fonctionnent !</h2><p>Si vous recevez cet email, la configuration est correcte.</p>',
    });

    return NextResponse.json({ success: true, sentTo: to, from: process.env.GMAIL_USER });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
