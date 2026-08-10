const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const auth = admin.auth();
async function run() {
  const u1 = await auth.getUserByEmail('lr2@gmail.com');
  await auth.updateUser(u1.uid, { password: 'password123' });
  console.log('Password reset to password123 for lr2@gmail.com');
}
run().catch(console.error);
