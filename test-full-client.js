const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const app = initializeApp({
  projectId: "studio-9506506653-9b525",
  appId: "1:949158596969:web:76008c3d4edf496806edf8",
  apiKey: "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  authDomain: "studio-9506506653-9b525.firebaseapp.com",
});

const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  console.log("1. Signing in as lr2@gmail.com...");
  const cred = await signInWithEmailAndPassword(auth, 'lr2@gmail.com', 'password123');
  console.log("   OK. user.email =", cred.user.email);
  console.log("   user.uid =", cred.user.uid);

  const emailLower = cred.user.email.toLowerCase();
  console.log("\n2. Reading storeAccess/" + emailLower + "...");
  try {
    const snap = await getDoc(doc(db, 'storeAccess', emailLower));
    console.log("   exists?", snap.exists());
    if (snap.exists()) {
      const data = snap.data();
      console.log("   data:", JSON.stringify(data));
      
      console.log("\n3. Reading stores under adminUid =", data.adminUid);
      const { collection: coll, getDocs } = require('firebase/firestore');
      const storesSnap = await getDocs(coll(db, 'users', data.adminUid, 'stores'));
      console.log("   stores count:", storesSnap.size);
      storesSnap.forEach(d => console.log("   -", d.id, JSON.stringify(d.data())));
    }
  } catch (err) {
    console.error("   ERROR:", err.code, err.message);
  }
}
test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
