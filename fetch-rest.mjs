import fs from 'fs';
import https from 'https';


const projectId = 'studio-9506506653-9b525';
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchCollection(col) {
  const url = `${baseUrl}/${col}`;
  const res = await fetch(url, { agent });
  const json = await res.json();
  if (!json.documents) return {};
  
  const result = {};
  for (const doc of json.documents) {
    const id = doc.name.split('/').pop();
    const data = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      if (v.stringValue !== undefined) data[k] = v.stringValue;
      else if (v.booleanValue !== undefined) data[k] = v.booleanValue;
      else if (v.integerValue !== undefined) data[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) data[k] = v.doubleValue;
      else if (v.arrayValue !== undefined) {
         if (v.arrayValue.values) {
           data[k] = v.arrayValue.values.map(val => val.stringValue || val.integerValue || val.doubleValue || val.booleanValue || (val.mapValue ? convertMap(val.mapValue) : val));
         } else {
           data[k] = [];
         }
      }
      else if (v.mapValue !== undefined) data[k] = convertMap(v.mapValue);
    }
    result[id] = data;
  }
  return result;
}

function convertMap(mapValue) {
  const data = {};
  if (!mapValue.fields) return data;
  for (const [k, v] of Object.entries(mapValue.fields)) {
      if (v.stringValue !== undefined) data[k] = v.stringValue;
      else if (v.booleanValue !== undefined) data[k] = v.booleanValue;
      else if (v.integerValue !== undefined) data[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) data[k] = v.doubleValue;
  }
  return data;
}

async function run() {
  const overrides = await fetchCollection('shop_product_overrides');
  const categoryOverrides = await fetchCollection('shop_category_overrides');
  const customProductsObj = await fetchCollection('shop_custom_products');
  const customCategoriesObj = await fetchCollection('shop_custom_categories');
  
  const customProducts = Object.keys(customProductsObj).map(k => ({ id: k, ...customProductsObj[k] }));
  const customCategories = Object.keys(customCategoriesObj).map(k => ({ id: k, ...customCategoriesObj[k] }));
  
  const data = { overrides, categoryOverrides, customProducts, customCategories };
  fs.writeFileSync('src/lib/shop-firebase-dump.json', JSON.stringify(data, null, 2));
  console.log('Dump complete!');
}
run().catch(console.error);
