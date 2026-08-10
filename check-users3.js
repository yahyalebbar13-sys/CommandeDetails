const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
async function check() {
  const BAD_UID = 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
  const GOOD_UID = 'TlOEmB5VVhPVfTE73S4pJV1FeTm1';
  
  const c1 = await db.collection('users').doc(BAD_UID).listCollections();
  console.log('BAD_UID collections:', c1.map(c => c.id));
  
  const c2 = await db.collection('users').doc(GOOD_UID).listCollections();
  console.log('GOOD_UID collections:', c2.map(c => c.id));
}
check().catch(console.error);
