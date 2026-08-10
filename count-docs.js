const admin = require("firebase-admin");
const sa = require("./service-account.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function countDocs(collectionPath) {
  const snap = await db.collection(collectionPath).get();
  console.log(collectionPath, "->", snap.size, "documents");
}

async function check() {
  const adminUid = "TIOEmB5VVhPVfTE73S4pJVlFeTm1";
  await countDocs(`users/${adminUid}/articles`);
  await countDocs(`users/${adminUid}/categories`);
  await countDocs(`users/${adminUid}/stockMovements`);
  await countDocs(`users/${adminUid}/sales`);
  await countDocs(`users/${adminUid}/clients`);
  await countDocs(`users/${adminUid}/saleOrders`);
  await countDocs(`users/${adminUid}/invoices`);
  await countDocs(`users/${adminUid}/transferOrders`);
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
