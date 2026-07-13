import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, orderBy, query, limit } from 'firebase/firestore';

const firebaseConfig = {
    projectId: 'studio-9506506653-9b525',
    appId: '1:949158596969:web:76008c3d4edf496806edf8',
    apiKey: 'AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg',
    authDomain: 'studio-9506506653-9b525.firebaseapp.com',
    storageBucket: 'studio-9506506653-9b525.firebasestorage.app',
    measurementId: '',
    messagingSenderId: '949158596969'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const q = query(collection(db, 'shop_custom_products'));
  const snap = await getDocs(q);
  console.log(JSON.stringify(snap.docs.map(d => ({id: d.id, ...d.data()})), null, 2));
  process.exit(0);
}

run().catch(console.error);
