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
  const data = docs.docs.map(d => ({ id: d.id, ...d.data() }));
  require('fs').writeFileSync('storeAccess_dump.json', JSON.stringify(data, null, 2));
}
check().catch(console.error);
