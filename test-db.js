const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
db.collection('storeAccess').get().then(snapshot => {
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
}).catch(console.error);
