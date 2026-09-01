/**
 * migrate-to-master.mjs — Script de migration initiale
 * 
 * Crée les documents `products_master` à partir des articles Gestion existants.
 * 
 * Usage:
 *   node migrate-to-master.mjs
 * 
 * Ce script :
 * 1. Lit tous les articles de users/{adminUid}/articles
 * 2. Les regroupe par nom + catégorie + couleur
 * 3. Crée un ProductMaster par groupe
 * 4. Tente de matcher avec les produits Shop existants
 * 5. Affiche un rapport
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ── Init Firebase Admin ────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

// ── Config ─────────────────────────────────────────────────────────────────────
// Get adminUid from publicConfig
async function getAdminUid() {
  const doc = await db.collection('publicConfig').doc('adminConfig').get();
  if (doc.exists) return doc.data().adminUid;
  // Fallback: list users collection and pick first
  const users = await db.collection('users').limit(1).get();
  if (!users.empty) return users.docs[0].id;
  throw new Error('Cannot determine adminUid');
}

function normalizeProductName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔄 Migration vers products_master...\n');

  const adminUid = await getAdminUid();
  console.log(`👤 Admin UID: ${adminUid}\n`);

  // 1. Load Gestion articles
  const articlesSnap = await db.collection('users').doc(adminUid).collection('articles').get();
  const articles = articlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 ${articles.length} articles Gestion trouvés`);

  // 2. Load Shop products (custom + overrides)
  const customSnap = await db.collection('shop_custom_products').get();
  const customProducts = customSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const overridesSnap = await db.collection('shop_product_overrides').get();
  const overrides = {};
  overridesSnap.docs.forEach(d => { overrides[d.id] = d.data(); });
  
  console.log(`🛒 ${customProducts.length} produits Shop trouvés`);
  console.log(`📝 ${Object.keys(overrides).length} overrides Shop trouvés\n`);

  // 3. Check existing products_master
  const existingSnap = await db.collection('products_master').get();
  const existingMasters = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const linkedArticleIds = new Set();
  existingMasters.forEach(pm => {
    (pm.gestionArticleIds || []).forEach(id => linkedArticleIds.add(id));
  });
  console.log(`✅ ${existingMasters.length} fiches produit existantes (${linkedArticleIds.size} articles déjà liés)\n`);

  // 4. Filter unlinked articles
  const unlinked = articles.filter(a => !linkedArticleIds.has(a.id));
  console.log(`🔗 ${unlinked.length} articles non liés à migrer\n`);

  if (unlinked.length === 0) {
    console.log('✨ Rien à migrer — tous les articles sont déjà liés !');
    return;
  }

  // 5. Group by name + category + color
  const groups = new Map();
  for (const a of unlinked) {
    const key = `${normalizeProductName(a.name || '')}__${a.categoryId || ''}__${normalizeProductName(a.color || '')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  console.log(`📁 ${groups.size} groupes de produits uniques\n`);

  // 6. Try to match with Shop products
  const shopLookup = new Map();
  customProducts.forEach(p => {
    const norm = normalizeProductName(p.name || '');
    if (norm) shopLookup.set(norm, p);
  });

  // 7. Create ProductMaster documents
  let created = 0;
  let matched = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const [key, groupArticles] of groups) {
    const first = groupArticles[0];

    // Build master
    const master = {
      nameEN: first.name || '',
      nameFR: '',
      nameAR: '',
      nameStock: '',
      gestionArticleIds: groupArticles.map(a => a.id),
      gestionCategoryId: first.categoryId || '',
      gestionGeneralCategoryId: first.generalCategoryId || '',
      specs: first.specs || '',
      color: first.color || '',
      unitOfMeasure: first.unitOfMeasure || '',
      purchasePriceFOB: Number(first.purchasePricePerUnit) || 0,
      purchasePriceMAD: Number(first.purchasePriceMAD) || 0,
      supplierId: first.supplierId || '',
      images: [],
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Try to match with a Shop product
    const normName = normalizeProductName(first.name || '');
    let bestMatch = null;
    let bestScore = 0;

    for (const [shopNorm, shopProduct] of shopLookup) {
      let score = 0;
      if (normName === shopNorm) score = 100;
      else if (normName.includes(shopNorm) || shopNorm.includes(normName)) score = 70;
      else {
        const aWords = new Set(normName.match(/[a-z0-9]+/g) || []);
        const sWords = new Set(shopNorm.match(/[a-z0-9]+/g) || []);
        const common = [...aWords].filter(w => sWords.has(w));
        const total = new Set([...aWords, ...sWords]).size;
        if (total > 0) score = Math.round((common.length / total) * 100);
      }

      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestMatch = shopProduct;
      }
    }

    if (bestMatch) {
      master.shopProductId = bestMatch.id;
      master.nameFR = bestMatch.name || '';
      master.nameAR = bestMatch.nameAr || '';
      master.shopCategorySlug = bestMatch.categorySlug || '';
      master.sellingPrice = Number(bestMatch.price) || 0;
      master.wholesalePrice = Number(bestMatch.wholesalePrice) || 0;
      master.images = bestMatch.images || [];
      master.shortDescription = bestMatch.shortDescription || '';
      master.description = bestMatch.description || '';
      matched++;
      // Remove from lookup to avoid double-matching
      shopLookup.delete(normalizeProductName(bestMatch.name || ''));
    }

    const ref = db.collection('products_master').doc();
    batch.set(ref, master);
    batchCount++;
    created++;

    // Firestore batches max 500 operations
    if (batchCount >= 450) {
      await batch.commit();
      batchCount = 0;
      console.log(`  ... ${created} fiches créées...`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  // 8. Report
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RAPPORT DE MIGRATION');
  console.log('═'.repeat(60));
  console.log(`✅ ${created} fiches produit créées`);
  console.log(`🔗 ${matched} matchés automatiquement avec des produits Shop`);
  console.log(`⚠️  ${created - matched} sans correspondance Shop (à lier manuellement)`);
  console.log(`📦 ${unlinked.length} articles Gestion traités`);
  console.log('═'.repeat(60));
  console.log('\n💡 Ouvrez /gestion → Produits pour voir et compléter les liaisons.');
}

main().catch(console.error);
