const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function test() {
  const doc = await db.collection('storeAccess').doc('lr2@gmail.com').get();
  console.log('Exists?', doc.exists);
}
test().catch(console.error);
