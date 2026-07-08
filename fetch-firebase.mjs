import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = {
  projectId: "studio-9506506653-9b525",
  appId: "1:949158596969:web:76008c3d4edf496806edf8",
  apiKey: "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  authDomain: "studio-9506506653-9b525.firebaseapp.com",
  storageBucket: "studio-9506506653-9b525.firebasestorage.app",
  measurementId: "",
  messagingSenderId: "949158596969"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function dumpData() {
  console.log("Fetching from Firebase...");
  const overridesSnap = await getDocs(collection(db, 'shop_product_overrides'));
  const customProductsSnap = await getDocs(collection(db, 'shop_custom_products'));
  const customCategoriesSnap = await getDocs(collection(db, 'shop_custom_categories'));
  const categoryOverridesSnap = await getDocs(collection(db, 'shop_category_overrides'));

  const overrides = {};
  overridesSnap.forEach(d => { overrides[d.id] = d.data(); });

  const customProducts = customProductsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customCategories = customCategoriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const categoryOverrides = {};
  categoryOverridesSnap.forEach(d => { categoryOverrides[d.id] = d.data(); });

  const data = {
    overrides,
    customProducts,
    customCategories,
    categoryOverrides
  };

  const outPath = path.join(__dirname, 'src', 'lib', 'shop-firebase-dump.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log("Data dumped to:", outPath);
}

dumpData().catch(console.error).then(() => process.exit(0));
