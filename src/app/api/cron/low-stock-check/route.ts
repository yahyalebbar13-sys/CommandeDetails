import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

function getFirebaseAdminApp() {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-9506506653-9b525';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ?.replace(/\\n/g, '\n')
      ?.replace(/\\\//g, '/')
      ?.replace(/\\U/g, 'U');

    if (!clientEmail || !privateKey) {
      throw new Error(`Missing env vars. email=${!!clientEmail}, key=${!!privateKey}`);
    }

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }
  return getApps()[0];
}

interface LowStockRow {
  productName: string;
  categoryId: string;
  currentQty: number;
  minThreshold: number;
  unitOfMeasure: string;
}

/**
 * Alerte quotidienne de stock bas — déclenchée par Vercel Cron (voir vercel.json).
 * Calcul simplifié : quantité par article (sans exploser les variantes couleur/
 * taille/qualité comme le fait computeStockItems côté client) — suffisant pour
 * un digest d'alerte, pas pour l'affichage détaillé du stock.
 */
export async function GET(req: NextRequest) {
  // Sécurise l'endpoint si CRON_SECRET est configuré (recommandé en prod) ; sinon
  // reste accessible pour fonctionner immédiatement sans configuration supplémentaire.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const adminApp = getFirebaseAdminApp();
    const db = getFirestore(adminApp);

    const adminConfigSnap = await db.doc('publicConfig/adminConfig').get();
    const adminUid = adminConfigSnap.exists ? adminConfigSnap.data()?.adminUid : 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
    if (!adminUid) {
      return NextResponse.json({ error: 'adminUid introuvable' }, { status: 500 });
    }

    const [articlesSnap, movementsSnap, categoriesSnap] = await Promise.all([
      db.collection(`users/${adminUid}/articles`).get(),
      db.collection(`users/${adminUid}/stockMovements`).get(),
      db.collection(`users/${adminUid}/categories`).get(),
    ]);

    const categoriesById = new Map<string, any>();
    categoriesSnap.forEach(d => categoriesById.set(d.id, d.data()));
    const catLabel = (catId: string) => {
      const c = categoriesById.get(catId) || [...categoriesById.values()].find((c: any) => c.name === catId);
      return c ? (c.nameFR || c.name) : catId;
    };

    // Net des mouvements par article (tous magasins confondus)
    const netByArticle = new Map<string, number>();
    movementsSnap.forEach(d => {
      const m = d.data();
      if (!m.articleId) return;
      const delta = m.type === 'IN' ? Number(m.quantity) || 0
        : m.type === 'OUT' ? -(Number(m.quantity) || 0)
        : m.type === 'ADJUSTMENT' ? Number(m.quantity) || 0
        : 0;
      netByArticle.set(m.articleId, (netByArticle.get(m.articleId) || 0) + delta);
    });

    const lowStock: LowStockRow[] = [];
    const ruptures: LowStockRow[] = [];

    articlesSnap.forEach(d => {
      const a = d.data();
      const threshold = a.minStockThreshold;
      if (threshold == null) return; // pas de seuil configuré = pas d'alerte

      const initialQty = a.initialQtyByStore
        ? Object.values(a.initialQtyByStore).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
        : (Number(a.quantity) || 0);
      const currentQty = initialQty + (netByArticle.get(d.id) || 0);

      if (currentQty <= threshold) {
        const row: LowStockRow = {
          productName: a.nameFR || a.name || catLabel(a.categoryId) || d.id,
          categoryId: catLabel(a.categoryId),
          currentQty,
          minThreshold: threshold,
          unitOfMeasure: a.unitOfMeasure || 'unité',
        };
        (currentQty <= 0 ? ruptures : lowStock).push(row);
      }
    });

    if (lowStock.length === 0 && ruptures.length === 0) {
      return NextResponse.json({ success: true, sent: false, reason: 'Aucune alerte à envoyer.' });
    }

    const gmailUser = process.env.GMAIL_USER || 'yahya.lebbar13@gmail.com';
    const appPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
    if (!appPass) {
      return NextResponse.json({ error: 'GMAIL_APP_PASSWORD manquant' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: appPass },
      tls: { rejectUnauthorized: false },
    });

    const rowHtml = (r: LowStockRow, isRupture: boolean) => `
      <tr>
        <td style="padding:8px 14px;font-size:12px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6">${r.productName}</td>
        <td style="padding:8px 14px;font-size:11px;color:#6B7280;border-bottom:1px solid #f3f4f6">${r.categoryId}</td>
        <td style="padding:8px 14px;font-size:12px;font-weight:800;text-align:right;color:${isRupture ? '#DC2626' : '#D97706'};border-bottom:1px solid #f3f4f6">${r.currentQty} ${r.unitOfMeasure}</td>
        <td style="padding:8px 14px;font-size:11px;color:#9CA3AF;text-align:right;border-bottom:1px solid #f3f4f6">seuil : ${r.minThreshold}</td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:linear-gradient(135deg,#b45309,#78350f);padding:28px 32px;border-radius:20px 20px 0 0">
          <p style="margin:0 0 4px;color:#fde68a;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.25em">Alerte Stock Quotidienne</p>
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:900;text-transform:uppercase">
            ${ruptures.length} rupture(s) · ${lowStock.length} stock(s) bas
          </h1>
        </td></tr>
        <tr><td style="background:#ffffff;padding:28px 32px">
          ${ruptures.length > 0 ? `
            <p style="margin:0 0 10px;font-size:11px;color:#DC2626;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">Ruptures totales (${ruptures.length})</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #fecaca;border-radius:12px;overflow:hidden;margin-bottom:24px">
              ${ruptures.map(r => rowHtml(r, true)).join('')}
            </table>` : ''}
          ${lowStock.length > 0 ? `
            <p style="margin:0 0 10px;font-size:11px;color:#D97706;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">Stock sous le seuil (${lowStock.length})</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #fde68a;border-radius:12px;overflow:hidden">
              ${lowStock.map(r => rowHtml(r, false)).join('')}
            </table>` : ''}
          <p style="margin:24px 0 0;font-size:11px;color:#9CA3AF">Rapport automatique généré chaque jour. Consultez le module Stock pour réapprovisionner.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1.5px solid #f3f4f6;padding:16px 32px;border-radius:0 0 20px 20px">
          <p style="margin:0;font-size:10px;color:#9CA3AF;font-weight:700">Lebtex — Alerte automatique de stock</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await transporter.sendMail({
      from: `"Lebtex Stock" <${gmailUser}>`,
      to: gmailUser,
      subject: `⚠️ ${ruptures.length} rupture(s) · ${lowStock.length} stock(s) bas — Rapport quotidien`,
      html,
    });

    return NextResponse.json({ success: true, sent: true, ruptures: ruptures.length, lowStock: lowStock.length });
  } catch (err: any) {
    console.error('[low-stock-check] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
