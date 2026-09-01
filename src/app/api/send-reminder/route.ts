import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function POST(req: NextRequest) {
  try {
    const { to, clientName, invoiceNumber, amount, dueDate, remainingBalance } = await req.json();

    if (!to || !clientName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const subject = `Relance - Facture ${invoiceNumber || 'N/A'} - Solde impayé`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1917;">
        <div style="background: linear-gradient(135deg, #6d28d9, #4c1d95); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">LEBTEX SARL AU</h1>
          <p style="color: #c4b5fd; margin: 5px 0 0; font-size: 12px;">Relance de paiement</p>
        </div>
        <div style="padding: 30px; background: #fafaf9; border: 1px solid #e7e5e4; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 14px;">Bonjour <strong>${clientName}</strong>,</p>
          <p style="font-size: 14px; color: #57534e;">Nous nous permettons de vous rappeler que la facture suivante reste impayée :</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f5f5f4;">
              <td style="padding: 10px; font-size: 12px; font-weight: bold; color: #78716c;">N° Facture</td>
              <td style="padding: 10px; font-size: 14px; font-weight: bold;">${invoiceNumber || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-size: 12px; font-weight: bold; color: #78716c;">Montant total</td>
              <td style="padding: 10px; font-size: 14px;">${Number(amount).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD</td>
            </tr>
            <tr style="background: #f5f5f4;">
              <td style="padding: 10px; font-size: 12px; font-weight: bold; color: #78716c;">Solde restant dû</td>
              <td style="padding: 10px; font-size: 16px; font-weight: bold; color: #dc2626;">${Number(remainingBalance).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD</td>
            </tr>
            ${dueDate ? `<tr><td style="padding: 10px; font-size: 12px; font-weight: bold; color: #78716c;">Échéance</td><td style="padding: 10px; font-size: 14px; color: #dc2626; font-weight: bold;">${dueDate}</td></tr>` : ''}
          </table>
          <p style="font-size: 14px; color: #57534e;">Nous vous serions reconnaissants de bien vouloir procéder au règlement de cette facture dans les meilleurs délais.</p>
          <p style="font-size: 14px; color: #57534e;">Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce message.</p>
          <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 20px 0;" />
          <p style="font-size: 11px; color: #a8a29e;">Cordialement,<br><strong>LEBTEX SARL AU</strong><br>Mercerie, fils à coudre, fermetures à glissière et accessoires textile</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"LEBTEX" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json({ error: error.message || 'Failed to send email' }, { status: 500 });
  }
}
