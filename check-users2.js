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
  
  const d1 = await db.collection('users').doc(BAD_UID).get();
  console.log('BAD_UID exists?', d1.exists);
  
  const d2 = await db.collection('users').doc(GOOD_UID).get();
  console.log('GOOD_UID exists?', d2.exists);
}
check().catch(console.error);
