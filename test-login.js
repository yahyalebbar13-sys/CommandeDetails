const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc } = require("firebase/firestore");
const app = initializeApp({
  projectId: "studio-9506506653-9b525",
  apiKey: "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  authDomain: "studio-9506506653-9b525.firebaseapp.com",
});
async function test() {
  const cred = await signInWithEmailAndPassword(getAuth(app), "yahya.lebbb@gmail.com", "123456");
  console.log("1. LOGIN OK, email:", cred.user.email);
  const snap = await getDoc(doc(getFirestore(app), "storeAccess", cred.user.email));
  console.log("2. STORE ACCESS:", snap.exists() ? snap.data() : "NOT FOUND");
}
test().then(() => process.exit(0)).catch(e => { console.error("FAIL:", e.message); process.exit(1); });
