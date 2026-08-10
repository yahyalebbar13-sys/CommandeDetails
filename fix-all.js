const admin = require("firebase-admin");
const sa = require("./service-account.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const auth = admin.auth();
async function fix() {
  const email = "yahya.lebbbb@gmail.com";
  // Create or update Firebase Auth
  try {
    await auth.getUserByEmail(email);
    await auth.updateUser((await auth.getUserByEmail(email)).uid, { password: "123456" });
    console.log("Auth: password updated for", email);
  } catch(e) {
    const u = await auth.createUser({ email, password: "123456" });
    console.log("Auth: created", email, "uid:", u.uid);
  }
  // Create storeAccess
  await db.collection("storeAccess").doc(email).set({
    role: "COMMERCIAL", storeId: "ENTREPOT", adminUid: "TIOEmB5VVhPVfTE73S4pJVlFeTm1"
  });
  console.log("StoreAccess: created for", email);
}
fix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
