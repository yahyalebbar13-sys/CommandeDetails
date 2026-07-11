import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function translateText(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') return text;
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Translate the following e-commerce product text from French to Arabic. Preserve formatting, newlines, and professional tone. Respond ONLY with the Arabic translation, nothing else.\n\nText to translate:\n${text}` }]
        }],
        generationConfig: {
            temperature: 0.1
        }
      })
    });
    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
        return data.candidates[0].content.parts[0].text.trim();
    }
  } catch (e) {
    console.error("Translation error for text:", text.substring(0, 50), e);
  }
  return text;
}

// Function to translate an object's fields
async function translateProductData(data) {
    const updates = {};
    if (data.name && !data.nameAr) updates.nameAr = await translateText(data.name);
    if (data.description && !data.descriptionAr) updates.descriptionAr = await translateText(data.description);
    if (data.shortDescription && !data.shortDescriptionAr) updates.shortDescriptionAr = await translateText(data.shortDescription);
    if (data.categoryName && !data.categoryNameAr) updates.categoryNameAr = await translateText(data.categoryName);
    if (data.material && !data.materialAr) updates.materialAr = await translateText(data.material);
    if (data.specification && !data.specificationAr) updates.specificationAr = await translateText(data.specification);
    
    return updates;
}

async function translateCategoryData(data) {
    const updates = {};
    if (data.name && !data.nameAr) updates.nameAr = await translateText(data.name);
    if (data.description && !data.descriptionAr) updates.descriptionAr = await translateText(data.description);
    return updates;
}

async function processCollection(collectionName, isProduct) {
  console.log(`Processing collection: ${collectionName}`);
  const snap = await getDocs(collection(db, collectionName));
  
  for (const document of snap.docs) {
    const data = document.data();
    console.log(` Translating ${document.id}...`);
    
    let updates = {};
    if (isProduct) {
        updates = await translateProductData(data);
    } else {
        updates = await translateCategoryData(data);
    }
    
    if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, collectionName, document.id), updates);
        console.log(`  Updated ${document.id} with ${Object.keys(updates).length} translated fields.`);
    } else {
        console.log(`  No new translations needed for ${document.id}.`);
    }
  }
}

async function run() {
  if (!GEMINI_API_KEY) {
      console.error("Missing GEMINI_API_KEY in .env.local");
      process.exit(1);
  }
  console.log("Starting automatic translation via Gemini...");
  
  await processCollection('shop_custom_products', true);
  await processCollection('shop_product_overrides', true);
  await processCollection('shop_custom_categories', false);
  await processCollection('shop_category_overrides', false);
  
  console.log("All translations completed!");
  process.exit(0);
}

run();
