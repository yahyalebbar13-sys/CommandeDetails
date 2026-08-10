const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function check() {
  const docs = await db.collection('storeAccess').get();
  docs.forEach(d => {
    console.log("");
  });
}
check().catch(console.error);
