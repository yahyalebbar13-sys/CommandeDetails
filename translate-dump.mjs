import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

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

async function translateProductData(data) {
    if (data.name && !data.nameAr) data.nameAr = await translateText(data.name);
    if (data.description && !data.descriptionAr) data.descriptionAr = await translateText(data.description);
    if (data.shortDescription && !data.shortDescriptionAr) data.shortDescriptionAr = await translateText(data.shortDescription);
    if (data.categoryName && !data.categoryNameAr) data.categoryNameAr = await translateText(data.categoryName);
    if (data.material && !data.materialAr) data.materialAr = await translateText(data.material);
    if (data.specification && !data.specificationAr) data.specificationAr = await translateText(data.specification);
    
    if (data.variants && Array.isArray(data.variants)) {
        for (const variant of data.variants) {
            if (variant.color && !variant.colorAr) variant.colorAr = await translateText(variant.color);
            if (variant.size && !variant.sizeAr) variant.sizeAr = await translateText(variant.size);
        }
    }
}

async function translateCategoryData(data) {
    if (data.name && !data.nameAr) data.nameAr = await translateText(data.name);
    if (data.description && !data.descriptionAr) data.descriptionAr = await translateText(data.description);
}

async function run() {
  if (!GEMINI_API_KEY) {
      console.error("Missing GEMINI_API_KEY in .env.local");
      process.exit(1);
  }
  
  const dumpPath = path.join(__dirname, 'src', 'lib', 'shop-firebase-dump.json');
  console.log("Reading " + dumpPath);
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  
  console.log("Translating overrides...");
  for (const id in dump.overrides) {
      console.log(`Translating override ${id}`);
      await translateProductData(dump.overrides[id]);
  }
  
  console.log("Translating custom products...");
  for (const product of dump.customProducts) {
      console.log(`Translating product ${product.id}`);
      await translateProductData(product);
  }
  
  console.log("Translating custom categories...");
  for (const cat of dump.customCategories) {
      console.log(`Translating category ${cat.id}`);
      await translateCategoryData(cat);
  }
  
  console.log("Translating category overrides...");
  for (const id in dump.categoryOverrides) {
      console.log(`Translating cat override ${id}`);
      await translateCategoryData(dump.categoryOverrides[id]);
  }
  
  fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
  console.log("Saved translations to shop-firebase-dump.json");
}

run();
