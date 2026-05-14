import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Status labels in French
const STATUS_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  TO_ORDER:  { label: 'À Commander',             emoji: '📋', color: '#6B7280' },
  PI:        { label: 'Production Lancée (PI)',   emoji: '🏭', color: '#F59E0B' },
  SHIPPED:   { label: 'Expédié / En Transit',     emoji: '🚢', color: '#3B82F6' },
  DELIVERED: { label: 'Livré',                   emoji: '✅', color: '#10B981' },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clientEmail,
      clientName,
      articleName,
      oldStatus,
      newStatus,
      quantity,
      unitOfMeasure,
      specs,
      color,
      size,
      estimatedProductionDelay,
    } = body;

    if (!clientEmail || !newStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Nodemailer transporter using Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const newStatusInfo = STATUS_LABELS[newStatus] || { label: newStatus, emoji: '📦', color: '#6B7280' };
    const oldStatusInfo = STATUS_LABELS[oldStatus] || { label: oldStatus || '-', emoji: '📦', color: '#6B7280' };

    const detailRows = [
      specs       && `<tr><td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Spécifications</td><td style="padding:6px 12px;font-weight:600;font-size:13px;color:#111827">${specs}</td></tr>`,
      color       && `<tr><td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Couleur</td><td style="padding:6px 12px;font-weight:600;font-size:13px;color:#111827;text-transform:uppercase">${color}</td></tr>`,
      size        && `<tr><td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Taille</td><td style="padding:6px 12px;font-weight:600;font-size:13px;color:#111827">${size}</td></tr>`,
      quantity    && `<tr><td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Quantité</td><td style="padding:6px 12px;font-weight:600;font-size:13px;color:#111827">${Number(quantity).toLocaleString('fr-FR')} ${unitOfMeasure || ''}</td></tr>`,
      estimatedProductionDelay && `<tr><td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Délai estimé</td><td style="padding:6px 12px;font-weight:600;font-size:13px;color:#111827">${estimatedProductionDelay}</td></tr>`,
    ].filter(Boolean).join('');

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mise à jour de votre commande</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:32px 40px;border-radius:16px 16px 0 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0;color:#c4a062;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.2em">Portail Client · LEBTEX</p>
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em">Mise à jour<br/><span style="color:#c4a062">de votre commande</span></h1>
                  </td>
                  <td align="right" style="vertical-align:top">
                    <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px 16px;text-align:center">
                      <div style="font-size:28px">${newStatusInfo.emoji}</div>
                      <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em">NOUVEAU STATUT</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px">

              <!-- Greeting -->
              <p style="margin:0 0 24px;font-size:15px;color:#374151;font-weight:500">
                Bonjour <strong style="color:#111827">${clientName || 'Client'}</strong>,
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6">
                Le statut de votre commande <strong style="color:#111827;text-transform:uppercase">${articleName}</strong> vient d'être mis à jour.
              </p>

              <!-- Status change banner -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
                <tr>
                  <td style="background:#f9fafb;border:2px solid #f3f4f6;border-radius:12px;padding:20px">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" width="40%">
                          <p style="margin:0 0 6px;font-size:10px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">Ancien statut</p>
                          <span style="background:${oldStatusInfo.color}20;color:${oldStatusInfo.color};font-size:12px;font-weight:800;text-transform:uppercase;padding:6px 14px;border-radius:99px;letter-spacing:0.05em">${oldStatusInfo.label}</span>
                        </td>
                        <td align="center" width="20%">
                          <span style="font-size:20px">→</span>
                        </td>
                        <td align="center" width="40%">
                          <p style="margin:0 0 6px;font-size:10px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">Nouveau statut</p>
                          <span style="background:${newStatusInfo.color}25;color:${newStatusInfo.color};font-size:12px;font-weight:800;text-transform:uppercase;padding:6px 14px;border-radius:99px;letter-spacing:0.05em;border:1px solid ${newStatusInfo.color}40">${newStatusInfo.label}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Article details -->
              <p style="margin:0 0 12px;font-size:10px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.15em">Détails de la commande</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:12px;overflow:hidden;margin-bottom:28px">
                <tr style="background:#f9fafb">
                  <td style="padding:6px 12px;color:#6B7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Article</td>
                  <td style="padding:6px 12px;font-weight:800;font-size:13px;color:#111827;text-transform:uppercase">${articleName}</td>
                </tr>
                ${detailRows}
              </table>

              <!-- Status-specific message -->
              ${newStatus === 'PI' ? `
              <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;margin-bottom:24px">
                <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;line-height:1.6">
                  🏭 <strong>Votre commande est en cours de production.</strong><br/>
                  Notre équipe surveille activement l'avancement de la fabrication. Vous serez notifié dès l'expédition.
                </p>
              </div>` : ''}
              ${newStatus === 'SHIPPED' ? `
              <div style="background:#DBEAFE;border:1px solid #BFDBFE;border-radius:12px;padding:16px 20px;margin-bottom:24px">
                <p style="margin:0;font-size:13px;color:#1E40AF;font-weight:600;line-height:1.6">
                  🚢 <strong>Votre commande est en transit.</strong><br/>
                  La marchandise a été expédiée et est en route. Nous vous tiendrons informé de la date d'arrivée prévue.
                </p>
              </div>` : ''}
              ${newStatus === 'DELIVERED' ? `
              <div style="background:#D1FAE5;border:1px solid #A7F3D0;border-radius:12px;padding:16px 20px;margin-bottom:24px">
                <p style="margin:0;font-size:13px;color:#065F46;font-weight:600;line-height:1.6">
                  ✅ <strong>Votre commande a été livrée !</strong><br/>
                  Merci de votre confiance. N'hésitez pas à nous contacter si vous avez des questions concernant votre livraison.
                </p>
              </div>` : ''}

              <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6">
                Pour toute question, contactez notre équipe logistique ou consultez votre <strong style="color:#111827">portail client</strong>.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;border-radius:0 0 16px 16px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:12px;color:#9CA3AF;font-weight:700">© 2025 LEBTEX Textile Import</p>
                    <p style="margin:2px 0 0;font-size:10px;color:#D1D5DB">Cet email a été envoyé automatiquement suite à une mise à jour de votre commande.</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;font-size:10px;color:#D1D5DB;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">🔒 Portail Sécurisé</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `"LEBTEX Textile Import" <${process.env.GMAIL_USER}>`,
      to: clientEmail,
      subject: `${newStatusInfo.emoji} Mise à jour commande : ${articleName} — ${newStatusInfo.label}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[send-notification] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
