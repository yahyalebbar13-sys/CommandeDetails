const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function check() {
  const docs = await db.collection('users').get();
  docs.forEach(d => console.log(d.id));
}
check().catch(console.error);
