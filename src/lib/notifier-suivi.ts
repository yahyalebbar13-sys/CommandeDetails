// ─── Prévenir quand un conteneur bouge ────────────────────────────────────────
// Serveur uniquement. Deux canaux, tous deux facultatifs :
//
//   • Email     — via la boîte Gmail déjà utilisée par l'alerte de stock bas.
//                 Rien à configurer de plus, et sur téléphone l'application
//                 Gmail pousse la notification.
//   • Telegram  — vraie notification instantanée, si TELEGRAM_BOT_TOKEN et
//                 TELEGRAM_CHAT_ID sont renseignés. Gratuit et sans limite.
//
// Un envoi qui échoue ne doit jamais faire échouer la mise à jour du dossier :
// tout est enveloppé, et l'échec part dans les journaux.

import nodemailer from 'nodemailer';
import { resumerChangements, type Changement } from './suivi-changements';
import type { SuiviConteneur } from './suivi-conteneur';

const jourFr = (iso?: string) => {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
};

async function envoyerTelegram(texte: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chat) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texte, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function envoyerEmail(objet: string, html: string): Promise<void> {
  const gmailUser = process.env.GMAIL_USER || 'yahya.lebbar13@gmail.com';
  const appPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!appPass) return;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: appPass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"Lebtex Arrivages" <${gmailUser}>`,
    to: process.env.SUIVI_ALERTE_EMAIL || gmailUser,
    subject: objet,
    html,
  });
}

function corpsHtml(factureId: string, suivi: SuiviConteneur, changements: Changement[]): string {
  const lignes = changements.map(c => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
        <p style="margin:0;font-size:13px;font-weight:800;color:${c.important ? '#111827' : '#6B7280'}">${c.titre}</p>
        ${c.detail ? `<p style="margin:2px 0 0;font-size:11px;color:#9CA3AF">${c.detail}</p>` : ''}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#1c1917;padding:24px 28px;border-radius:18px 18px 0 0">
          <p style="margin:0 0 4px;color:#fbbf24;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.25em">Suivi conteneur</p>
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:900;text-transform:uppercase">Dossier ${factureId}</h1>
          <p style="margin:6px 0 0;color:#a8a29e;font-size:12px">
            ${suivi.reference}${suivi.compagnie ? ` · ${suivi.compagnie}` : ''}${suivi.navire ? ` · ${suivi.navire}` : ''}
          </p>
        </td></tr>
        <tr><td style="background:#fff;padding:8px 0">
          <table width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
        </td></tr>
        <tr><td style="background:#fff;padding:16px 28px 24px">
          <p style="margin:0;font-size:12px;color:#6B7280">
            Arrivée ${suivi.dateDechargementReelle ? 'réelle' : 'annoncée'} :
            <strong style="color:#111827">${jourFr(suivi.dateDechargement)}</strong>
            ${suivi.portDechargement ? ` à ${suivi.portDechargement}` : ''}
          </p>
          ${suivi.lienCarte ? `<p style="margin:10px 0 0"><a href="${suivi.lienCarte}" style="font-size:12px;color:#2563eb;font-weight:700">Voir le conteneur sur la carte →</a></p>` : ''}
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:14px 28px;border-radius:0 0 18px 18px">
          <p style="margin:0;font-size:10px;color:#9CA3AF;font-weight:700">
            Message automatique — la date du dossier a été mise à jour toute seule.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Prévient des changements d'un conteneur. Ne lève jamais : une notification
 * ratée ne doit pas empêcher un webhook d'être acquitté ni un dossier d'être
 * enregistré.
 */
export async function notifierChangements(
  factureId: string,
  suivi: SuiviConteneur,
  changements: Changement[],
): Promise<void> {
  if (!changements.length) return;

  const tete = changements[0].titre;
  const objet = `🚢 ${factureId} — ${tete}`;
  const texte =
    `<b>🚢 Dossier ${factureId}</b>\n${suivi.reference}${suivi.compagnie ? ` · ${suivi.compagnie}` : ''}\n\n` +
    `${resumerChangements(changements)}\n\n` +
    `Arrivée ${suivi.dateDechargementReelle ? 'réelle' : 'annoncée'} : ${jourFr(suivi.dateDechargement)}` +
    `${suivi.portDechargement ? ` à ${suivi.portDechargement}` : ''}`;

  const envois = await Promise.allSettled([
    envoyerEmail(objet, corpsHtml(factureId, suivi, changements)),
    envoyerTelegram(texte),
  ]);
  for (const e of envois) {
    if (e.status === 'rejected') console.error('[notifier-suivi]', e.reason?.message || e.reason);
  }
}
