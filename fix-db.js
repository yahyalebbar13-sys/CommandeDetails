const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function fixEmails() {
  const snapshot = await db.collection('storeAccess').get();
  for (const doc of snapshot.docs) {
    if (doc.id !== doc.id.toLowerCase()) {
      console.log('Fixing:', doc.id, 'to', doc.id.toLowerCase());
      await db.collection('storeAccess').doc(doc.id.toLowerCase()).set(doc.data());
      await db.collection('storeAccess').doc(doc.id).delete();
    }
  }
}
fixEmails().catch(console.error);
