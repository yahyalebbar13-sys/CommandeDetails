const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function check() {
  const doc = await db.collection('publicConfig').doc('adminConfig').get();
  console.log('AdminConfig:', doc.data());
}
check().catch(console.error);
