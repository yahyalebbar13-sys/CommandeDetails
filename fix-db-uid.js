const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
const BAD_UID = 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
const GOOD_UID = 'TlOEmB5VVhPVfTE73S4pJV1FeTm1';

async function fixDB() {
  console.log('Fixing publicConfig...');
  await db.collection('publicConfig').doc('adminConfig').set({ adminUid: GOOD_UID }, { merge: true });
  
  console.log('Fixing storeAccess...');
  const sa = await db.collection('storeAccess').get();
  for (const doc of sa.docs) {
    if (doc.data().adminUid === BAD_UID) {
      console.log('Fixing storeAccess:', doc.id);
      await db.collection('storeAccess').doc(doc.id).set({ adminUid: GOOD_UID }, { merge: true });
    }
  }
  
  console.log('Fixing clientAccess...');
  const ca = await db.collection('clientAccess').get();
  for (const doc of ca.docs) {
    if (doc.data().adminUid === BAD_UID) {
      console.log('Fixing clientAccess:', doc.id);
      await db.collection('clientAccess').doc(doc.id).set({ adminUid: GOOD_UID }, { merge: true });
    }
  }
  console.log('Done!');
}
fixDB().catch(console.error);
