import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { isLocalMarketPurchaseArticle } from '@/lib/local-purchase';
import { verifyAdmin } from '@/lib/require-admin';

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
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getApps()[0];
}

export async function POST(req: Request) {
  // Efface stock, ventes, clients… : réservé à l'administrateur. Les données visées
  // sont celles de l'uid VÉRIFIÉ du jeton — plus jamais un adminUid fourni dans le
  // corps de la requête, qui permettait de viser n'importe quel compte.
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  const adminUid = check.uid;

  try {
    const adminApp = getFirebaseAdminApp();
    const db = getFirestore(adminApp);

    const report: Record<string, number> = {
      deletedMovements: 0,
      deletedClients: 0,
      deletedSales: 0,
      deletedSaleOrders: 0,
      deletedInvoices: 0,
      deletedClientPayments: 0,
      deletedCommercialExpenses: 0,
      deletedCheckRemittances: 0,
      deletedTransferOrders: 0,
      deletedStores: 0,
      cleanedArticlesStock: 0,
      deletedLocalTestArticles: 0,
      deletedAuditLogEntries: 0,
    };

    // 1. Supprimer tous les mouvements de stock (/stock uniquement)
    const movsSnap = await db.collection('users').doc(adminUid).collection('stockMovements').get();
    for (const d of movsSnap.docs) {
      await d.ref.delete();
      report.deletedMovements++;
    }

    // 2. Supprimer tous les clients du point de vente /stock
    const clientsSnap = await db.collection('users').doc(adminUid).collection('clients').get();
    for (const d of clientsSnap.docs) {
      await d.ref.delete();
      report.deletedClients++;
    }

    // 3. Supprimer les ventes et documents de caisse /stock
    const salesSnap = await db.collection('users').doc(adminUid).collection('sales').get();
    for (const d of salesSnap.docs) {
      await d.ref.delete();
      report.deletedSales++;
    }

    const saleOrdersSnap = await db.collection('users').doc(adminUid).collection('saleOrders').get();
    for (const d of saleOrdersSnap.docs) {
      await d.ref.delete();
      report.deletedSaleOrders++;
    }

    const invoicesSnap = await db.collection('users').doc(adminUid).collection('invoices').get();
    for (const d of invoicesSnap.docs) {
      await d.ref.delete();
      report.deletedInvoices++;
    }

    const clientPaymentsSnap = await db.collection('users').doc(adminUid).collection('clientPayments').get();
    for (const d of clientPaymentsSnap.docs) {
      await d.ref.delete();
      report.deletedClientPayments++;
    }

    // 4. Supprimer les dépenses commerciales & remises de chèques de test
    const expensesSnap = await db.collection('users').doc(adminUid).collection('commercialExpenses').get();
    for (const d of expensesSnap.docs) {
      await d.ref.delete();
      report.deletedCommercialExpenses++;
    }

    const remittancesSnap = await db.collection('users').doc(adminUid).collection('checkRemittances').get();
    for (const d of remittancesSnap.docs) {
      await d.ref.delete();
      report.deletedCheckRemittances++;
    }

    // 5. Supprimer les transferts de test
    const transfersSnap = await db.collection('users').doc(adminUid).collection('transferOrders').get();
    for (const d of transfersSnap.docs) {
      await d.ref.delete();
      report.deletedTransferOrders++;
    }

    // 6b. Supprimer le journal d'audit /stock (jamais nettoyé auparavant, d'où l'impression
    // que le reset "ne marche pas" : les vieilles entrées de test restaient visibles indéfiniment)
    const auditLogSnap = await db.collection('users').doc(adminUid).collection('auditLog').get();
    for (const d of auditLogSnap.docs) {
      await d.ref.delete();
      report.deletedAuditLogEntries++;
    }

    // 6. Supprimer l'Entrepôt Principal (ENTREPOT) dans les stores
    const entrepotRef = db.collection('users').doc(adminUid).collection('stores').doc('ENTREPOT');
    const entrepotDoc = await entrepotRef.get();
    if (entrepotDoc.exists) {
      await entrepotRef.delete();
      report.deletedStores++;
    }

    // 7. Nettoyer le stock local sur les articles sans JAMAIS toucher aux arrivages/commandes de /gestion
    const articlesSnap = await db.collection('users').doc(adminUid).collection('articles').get();
    for (const artDoc of articlesSnap.docs) {
      const data = artDoc.data();
      // Si l'article est purement un achat local créé dans /stock (ex: "Marché local").
      if (isLocalMarketPurchaseArticle(data)) {
        await artDoc.ref.delete();
        report.deletedLocalTestArticles++;
      } else if (data.initialQtyByStore) {
        // Retirer uniquement le stock physique de test par magasin sans JAMAIS toucher au statut ou à la date d'entrée en stock de /gestion !
        await artDoc.ref.update({
          initialQtyByStore: FieldValue.delete(),
        });
        report.cleanedArticlesStock++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Données de test /stock réinitialisées avec succès. /gestion préservé à 100%.',
      report,
    });
  } catch (error: any) {
    console.error('Reset stock error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Erreur lors de la réinitialisation' },
      { status: 500 }
    );
  }
}
