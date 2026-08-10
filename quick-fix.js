const admin = require("firebase-admin");
const sa = require("./service-account.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
async function fix() {
  await db.collection("storeAccess").doc("yahya.lebbb@gmail.com").set({
    role: "COMMERCIAL",
    storeId: "ENTREPOT",
    adminUid: "TIOEmB5VVhPVfTE73S4pJVlFeTm1"
  });
  console.log("OK: yahya.lebbb@gmail.com ajoute a storeAccess");
}
fix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
