const admin = require("firebase-admin");
const sa = require("./service-account.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
async function fix() {
  await admin.auth().updateUser("pALrm6qj2Pa6WntTLWbNY6NiGh12", { password: "123456" });
  console.log("Mot de passe de yahya.lebbb@gmail.com mis a: 123456");
}
fix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
