const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, getDoc, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  projectId: "studio-9506506653-9b525",
  appId: "1:949158596969:web:76008c3d4edf496806edf8",
  apiKey: "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  authDomain: "studio-9506506653-9b525.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function test() {
  try {
    console.log('Signing in...');
    await signInWithEmailAndPassword(auth, 'lr2@gmail.com', 'password123');
    console.log('Signed in successfully.');
    
    console.log('Checking storeAccess...');
    const snap = await getDoc(doc(firestore, 'storeAccess', 'lr2@gmail.com'));
    console.log('storeAccess exists:', snap.exists());
    if (snap.exists()) {
      console.log('storeAccess data:', snap.data());
    }
    
    console.log('Checking stores collection...');
    const adminUid = 'TlOEmB5VVhPVfTE73S4pJV1FeTm1';
    const storesSnap = await getDocs(collection(firestore, 'users', adminUid, 'stores'));
    console.log('stores count:', storesSnap.size);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}
test();
