const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function testAccess() {
  try {
    const doc = await db.collection('storeAccess').doc('lr2@gmail.com').get();
    console.log('Server access:', doc.exists);
  } catch (e) {
    console.log('Error:', e.message);
  }
}
testAccess();
