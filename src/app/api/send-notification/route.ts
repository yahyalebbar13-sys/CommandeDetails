import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Status labels in French
const STATUS_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  TO_ORDER:  { label: 'À Commander',             emoji: '📋', color: '#6B7280' },
  PI:        { label: 'Production Lancée (PI)',   emoji: '🏭', color: '#F59E0B' },
  // SHIPPED = same display as TRANSIT (boat transport only)
  SHIPPED:   { label: 'En Transit',               emoji: '🚢', color: '#3B82F6' },
  TRANSIT:   { label: 'En Transit',               emoji: '🚢', color: '#3B82F6' },
  CUSTOMS:   { label: 'En Dédouanement',         emoji: '🛃', color: '#8B5CF6' },
  STOCK:     { label: 'En Stock',                emoji: '✅', color: '#10B981' },
  DELIVERED: { label: 'Livré',                   emoji: '📦', color: '#059669' },
};

// Per-status contextual message block
function getStatusBlock(newStatus: string, estimatedProductionDelay?: string, transitArrivalDate?: string, transitDuration?: string, noBL?: string | null): string {
  switch (newStatus) {
    case 'TO_ORDER':
      return `
        <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1.5px solid #e2e8f0;border-left:4px solid #6B7280;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#374151;font-weight:800;display:flex;align-items:center;gap:6px">
            📋 <strong>Votre commande a été enregistrée</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.7">
            Nous avons bien pris en compte votre précommande. Notre équipe va lancer la procédure de commande auprès du fournisseur. Vous serez informé dès le début de la production.
          </p>
        </div>`;
    case 'PI':
      return `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-left:4px solid #F59E0B;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#92400E;font-weight:800;display:flex;align-items:center;gap:6px">
            🏭 <strong>La production de votre commande a démarré !</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#92400E;line-height:1.7">
            Notre fournisseur a officiellement lancé la fabrication de votre commande.
            ${estimatedProductionDelay
              ? `<br/><br/>⏱️ <strong>Délai de production estimé : ${estimatedProductionDelay}</strong>`
              : ''
            }
            <br/><br/>Vous serez notifié dès que le conteneur est expédié.
          </p>
        </div>`;
    case 'SHIPPED':
    case 'TRANSIT':
      if (!noBL) {
        // Pas encore de B/L — message sans date ni tracking
        return `
          <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px solid #bfdbfe;border-left:4px solid #3B82F6;border-radius:12px;padding:18px 20px;margin-bottom:24px">
            <p style="margin:0 0 6px;font-size:13px;color:#1E40AF;font-weight:800;display:flex;align-items:center;gap:6px">
              🚢 <strong>Votre commande est en transit maritime !</strong>
            </p>
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.7">
              Le conteneur est actuellement en mer, en cours d'acheminement vers le Maroc.<br/><br/>
              ⏳ <strong>Le B/L (connaissement) est en cours de dépôt.</strong><br/>
              Vous recevrez automatiquement une mise à jour dès que le numéro de B/L est enregistré et que le suivi en ligne est disponible.
            </p>
          </div>`;
      }
      return `
        <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px solid #bfdbfe;border-left:4px solid #3B82F6;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#1E40AF;font-weight:800;display:flex;align-items:center;gap:6px">
            🚢 <strong>Votre commande est en transit maritime !</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.7">
            Le conteneur est actuellement en mer, en cours d'acheminement vers le Maroc.
            ${
              transitArrivalDate
                ? `<br/><br/>📅 <strong>Date d'arrivée estimée : ${transitArrivalDate}</strong>${transitDuration ? ` <span style="color:#3B82F6;font-size:12px">(${transitDuration} restants)</span>` : ''}`
                : ''
            }
            <br/><br/>Vous serez notifié dès l'arrivée au port et le passage en dédouanement.
          </p>
        </div>`;
    case 'CUSTOMS':
      return `
        <div style="background:linear-gradient(135deg,#faf5ff,#f3e8ff);border:1.5px solid #e9d5ff;border-left:4px solid #8B5CF6;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#5B21B6;font-weight:800;display:flex;align-items:center;gap:6px">
            🛃 <strong>Votre commande est en cours de dédouanement !</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#5B21B6;line-height:1.7">
            Le conteneur est arrivé au port et est actuellement en cours de traitement douanier.${transitArrivalDate ? `<br/><br/>📅 <strong>Date d'arrivée port : ${transitArrivalDate}</strong>` : ''}<br/><br/>
            Vous serez notifié dès que la marchandise est disponible en stock.
          </p>
        </div>`;
    case 'STOCK':
      return `
        <div style="background:linear-gradient(135deg,#f0fdfa,#ccfbf1);border:1.5px solid #99f6e4;border-left:4px solid #10B981;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#065F46;font-weight:800;display:flex;align-items:center;gap:6px">
            ✅ <strong>Votre commande est disponible en stock !</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#065F46;line-height:1.7">
            La marchandise a passé les contrôles douaniers et est désormais disponible dans nos entrepôts.${transitArrivalDate ? `<br/><br/>📦 <strong>Entrée en stock le : ${transitArrivalDate}</strong>` : ''}<br/><br/>
            Notre équipe vous contactera prochainement pour organiser la livraison.
          </p>
        </div>`;
    case 'DELIVERED':
      return `
        <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1.5px solid #a7f3d0;border-left:4px solid #059669;border-radius:12px;padding:18px 20px;margin-bottom:24px">
          <p style="margin:0 0 6px;font-size:13px;color:#065F46;font-weight:800;display:flex;align-items:center;gap:6px">
            ✅ <strong>Votre commande a été livrée avec succès !</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#065F46;line-height:1.7">
            Nous avons le plaisir de vous confirmer que votre commande vous a été remise. 
            Nous vous remercions pour votre confiance et espérons que vous serez satisfait de votre livraison.<br/><br/>
            Pour toute question, n'hésitez pas à nous contacter.
          </p>
        </div>`;
    default:
      return '';
  }
}

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
      imageUrl,
      transitArrivalDate,
      transitDuration,
      noBL,
    } = body;

    if (!clientEmail || !newStatus) {
      return NextResponse.json({ error: 'Missing required fields (clientEmail, newStatus)' }, { status: 400 });
    }

    // Remove spaces from App Password (Google shows them for readability)
    // Fallback to hardcoded values if env vars are not available (Firebase App Hosting plan limitation)
    const gmailUser = process.env.GMAIL_USER || 'yahya.lebbar13@gmail.com';
    const appPass = (process.env.GMAIL_APP_PASSWORD || 'goaqptrilxzeznvy').replace(/\s/g, '');

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: appPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify SMTP connection before sending
    await transporter.verify().catch(() => {
      // Non-fatal: continue anyway, sendMail will throw if truly broken
    });

    const newStatusInfo = STATUS_LABELS[newStatus] || { label: newStatus, emoji: '📦', color: '#6B7280' };
    const oldStatusInfo = STATUS_LABELS[oldStatus] || { label: oldStatus || '-', emoji: '📦', color: '#6B7280' };

    // Build order detail rows
    const detailRows = [
      specs     && `<tr><td style="padding:8px 14px;color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;border-bottom:1px solid #f3f4f6">Spécifications</td><td style="padding:8px 14px;font-weight:600;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6">${specs}</td></tr>`,
      color     && `<tr><td style="padding:8px 14px;color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;border-bottom:1px solid #f3f4f6">Couleur</td><td style="padding:8px 14px;font-weight:600;font-size:12px;color:#111827;text-transform:uppercase;border-bottom:1px solid #f3f4f6">${color}</td></tr>`,
      size      && `<tr><td style="padding:8px 14px;color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;border-bottom:1px solid #f3f4f6">Taille</td><td style="padding:8px 14px;font-weight:600;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6">${size}</td></tr>`,
      quantity  && `<tr><td style="padding:8px 14px;color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb">Quantité</td><td style="padding:8px 14px;font-weight:700;font-size:13px;color:#111827">${Number(quantity).toLocaleString('fr-FR')} ${unitOfMeasure || ''}</td></tr>`,
    ].filter(Boolean).join('');

    const statusBlock = getStatusBlock(newStatus, estimatedProductionDelay, transitArrivalDate, transitDuration, noBL);

    // Subject line varies per status
    const subjectMap: Record<string, string> = {
      TO_ORDER:  `📋 Commande enregistrée — ${articleName}`,
      PI:        `🏭 Production lancée — ${articleName}`,
      SHIPPED:   `🚢 En transit maritime — ${articleName}`,
      TRANSIT:   `🚢 En transit — ${articleName}`,
      CUSTOMS:   `🛃 En dédouanement — ${articleName}`,
      STOCK:     `✅ En stock — ${articleName}`,
      DELIVERED: `✅ Livraison confirmée — ${articleName}`,
    };
    const subject = subjectMap[newStatus] || `${newStatusInfo.emoji} Mise à jour commande : ${articleName} — ${newStatusInfo.label}`;

    // Product image block
    // Firebase Storage URLs are often blocked by email clients (Gmail, Outlook) due to security policies.
    // We embed the image as a linked image but with a safe fallback message if blocked.
    // For best deliverability, images should be hosted on a public CDN (not Firebase Storage with auth tokens).
    const isFirebaseStorageUrl = imageUrl && imageUrl.includes('firebasestorage.googleapis.com');
    const productImageBlock = imageUrl ? `
      <tr><td style="background:#ffffff;padding:0 40px 24px">
        <p style="margin:0 0 10px;font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.18em">Photo du produit</p>
        <div style="border:1.5px solid #f3f4f6;border-radius:14px;overflow:hidden;text-align:center;background:#f9fafb;padding:12px">
          <img src="${imageUrl}" alt="Photo produit" width="300" style="max-width:100%;max-height:220px;object-fit:contain;border-radius:8px;display:block;margin:0 auto" />
          ${isFirebaseStorageUrl ? `<p style="margin:8px 0 0;font-size:9px;color:#9CA3AF">Si l'image ne s'affiche pas, consultez votre portail client.</p>` : ''}
        </div>
      </td></tr>` : '';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:32px 40px 28px;border-radius:20px 20px 0 0">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0 0 4px;color:#c4a062;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.25em">Portail Client · LEBTEX</p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;line-height:1.2">
                Mise à jour<br/><span style="color:#c4a062">de votre commande</span>
              </h1>
            </td>
            <td align="right" style="vertical-align:top">
              <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 18px;text-align:center;min-width:64px">
                <div style="font-size:30px;line-height:1">${newStatusInfo.emoji}</div>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.45);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em">NOUVEAU STATUT</p>
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px 40px">

          <p style="margin:0 0 6px;font-size:13px;color:#6B7280;font-weight:500">Bonjour,</p>
          <p style="margin:0 0 24px;font-size:16px;color:#111827;font-weight:800;text-transform:uppercase;letter-spacing:0.02em">${clientName}</p>

          <!-- Status change timeline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="background:#f9fafb;border:2px solid #f3f4f6;border-radius:14px;padding:16px 20px">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td align="center" width="40%">
                  <p style="margin:0 0 6px;font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">Ancien statut</p>
                  <span style="background:${oldStatusInfo.color}18;color:${oldStatusInfo.color};font-size:10px;font-weight:800;text-transform:uppercase;padding:5px 12px;border-radius:99px;display:inline-block">${oldStatusInfo.label}</span>
                </td>
                <td align="center" width="20%">
                  <span style="font-size:18px;color:#9CA3AF">→</span>
                </td>
                <td align="center" width="40%">
                  <p style="margin:0 0 6px;font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">Nouveau statut</p>
                  <span style="background:${newStatusInfo.color}20;color:${newStatusInfo.color};font-size:10px;font-weight:800;text-transform:uppercase;padding:5px 12px;border-radius:99px;border:1.5px solid ${newStatusInfo.color}35;display:inline-block">${newStatusInfo.label}</span>
                </td>
              </tr></table>
            </td></tr>
          </table>

          <!-- Contextual status message -->
          ${statusBlock}

          <!-- Order details table -->
          <p style="margin:0 0 10px;font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase;letter-spacing:0.18em">Détails de la commande</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #f3f4f6;border-radius:12px;overflow:hidden;margin-bottom:28px">
            <tr style="background:#0f172a">
              <td style="padding:8px 14px;color:#c4a062;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">Article</td>
              <td style="padding:8px 14px;font-weight:800;font-size:11px;color:#ffffff;text-transform:uppercase">${articleName}</td>
            </tr>
            ${detailRows}
          </table>

          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.7">
            Pour toute question, contactez notre équipe ou consultez votre <strong style="color:#111827">portail client</strong>.
          </p>
        </td></tr>

        ${productImageBlock}

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1.5px solid #f3f4f6;padding:18px 40px;border-radius:0 0 20px 20px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><p style="margin:0;font-size:11px;color:#9CA3AF;font-weight:700">© 2025 LEBTEX Textile Import</p><p style="margin:2px 0 0;font-size:9px;color:#D1D5DB">Email automatique — mise à jour de votre commande.</p></td>
            <td align="right"><p style="margin:0;font-size:9px;color:#D1D5DB;font-weight:700;text-transform:uppercase">🔒 Portail Sécurisé</p></td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `"LEBTEX Textile Import" <${gmailUser}>`,
      to: clientEmail,
      subject,
      html,
    });

    return NextResponse.json({ success: true, sentTo: clientEmail });
  } catch (err: any) {
    console.error('[send-notification] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
