const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
  "projectId": "studio-9506506653-9b525",
  "appId": "1:949158596969:web:76008c3d4edf496806edf8",
  "apiKey": "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  "authDomain": "studio-9506506653-9b525.firebaseapp.com",
  "storageBucket": "studio-9506506653-9b525.firebasestorage.app",
  "measurementId": "",
  "messagingSenderId": "949158596969"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function sync() {
  console.log("Fetching overrides...");
  const overridesSnap = await getDocs(collection(db, 'shop_product_overrides'));
  const overrides = {};
  overridesSnap.forEach(doc => {
    overrides[doc.id] = doc.data();
  });

  console.log("Fetching custom products...");
  const customProductsSnap = await getDocs(collection(db, 'shop_custom_products'));
  const customProducts = [];
  customProductsSnap.forEach(doc => {
    const data = doc.data();
    data.id = doc.id;
    customProducts.push(data);
  });

  console.log("Fetching custom categories...");
  const customCategoriesSnap = await getDocs(collection(db, 'shop_custom_categories'));
  const customCategories = [];
  customCategoriesSnap.forEach(doc => {
    const data = doc.data();
    if (!data.slug) data.slug = doc.id;
    customCategories.push(data);
  });

  console.log("Fetching category overrides...");
  const categoryOverridesSnap = await getDocs(collection(db, 'shop_category_overrides'));
  const categoryOverrides = {};
  categoryOverridesSnap.forEach(doc => {
    categoryOverrides[doc.id] = doc.data();
  });

  const dumpPath = path.join(__dirname, 'src/lib/shop-firebase-dump.json');
  const data = {
    overrides,
    customProducts,
    customCategories,
    categoryOverrides
  };

  fs.writeFileSync(dumpPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Dump updated successfully at ${dumpPath}`);
  process.exit(0);
}

sync().catch(e => {
  console.error(e);
  process.exit(1);
});
