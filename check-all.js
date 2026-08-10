const admin = require("firebase-admin");
const sa = require("./service-account.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });

async function check() {
  // 1. Check if yahya.lebbb@gmail.com exists in Firebase Auth
  try {
    const u = await admin.auth().getUserByEmail("yahya.lebbb@gmail.com");
    console.log("AUTH: yahya.lebbb@gmail.com EXISTS, uid =", u.uid);
  } catch(e) {
    console.log("AUTH: yahya.lebbb@gmail.com DOES NOT EXIST:", e.code);
  }

  // 2. Check storeAccess document
  const snap = await admin.firestore().collection("storeAccess").doc("yahya.lebbb@gmail.com").get();
  console.log("STORE ACCESS: exists =", snap.exists);
  if (snap.exists) console.log("STORE ACCESS data:", JSON.stringify(snap.data()));

  // 3. List ALL Firebase Auth users to see what exists
  const listResult = await admin.auth().listUsers(20);
  console.log("\nALL AUTH USERS:");
  listResult.users.forEach(u => console.log(" -", u.email, "uid:", u.uid));
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
