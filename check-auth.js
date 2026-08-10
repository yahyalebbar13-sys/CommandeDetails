const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const auth = admin.auth();
async function check() {
  try {
    const u1 = await auth.getUserByEmail('lr2@gmail.com');
    console.log('lr2@gmail.com exists:', u1.uid);
  } catch (e) {
    console.log('lr2@gmail.com error:', e.message);
  }
  
  try {
    const u2 = await auth.getUserByEmail('l2b@gmail.com');
    console.log('l2b@gmail.com exists:', u2.uid);
  } catch (e) {
    console.log('l2b@gmail.com error:', e.message);
  }
}
check().catch(console.error);
