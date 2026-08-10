const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
const REAL_UID = 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
const WRONG_UID = 'TlOEmB5VVhPVfTE73S4pJV1FeTm1';

async function revert() {
  console.log('Reverting publicConfig...');
  await db.collection('publicConfig').doc('adminConfig').set({ adminUid: REAL_UID }, { merge: true });
  
  console.log('Reverting storeAccess...');
  const sa = await db.collection('storeAccess').get();
  for (const doc of sa.docs) {
    if (doc.data().adminUid === WRONG_UID) {
      console.log('Reverting storeAccess:', doc.id);
      await db.collection('storeAccess').doc(doc.id).set({ adminUid: REAL_UID }, { merge: true });
    }
  }
  
  console.log('Reverting clientAccess...');
  const ca = await db.collection('clientAccess').get();
  for (const doc of ca.docs) {
    if (doc.data().adminUid === WRONG_UID) {
      console.log('Reverting clientAccess:', doc.id);
      await db.collection('clientAccess').doc(doc.id).set({ adminUid: REAL_UID }, { merge: true });
    }
  }
  console.log('Done!');
}
revert().catch(console.error);
