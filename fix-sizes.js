/**
 * fix-sizes.js — Scan all articles to extract used sizes per category,
 * then pre-populate `availableSizes` on each category document.
 * 
 * Modes:
 *   node fix-sizes.js           → DRY RUN (shows what would change)
 *   node fix-sizes.js --write   → APPLY changes to Firestore
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const UID = 'TIOEmB5VVhPVfTE73S4pJVlFeTm1';
const WRITE = process.argv.includes('--write');

async function main() {
  console.log(`\n═══ Processing user: ${UID} ═══`);
  console.log(`Mode: ${WRITE ? '✅ WRITE' : '🔍 DRY RUN'}\n`);

  // 1. Load all categories
  const catsSnap = await db.collection('users').doc(UID).collection('categories').get();
  const categories = {};
  catsSnap.forEach(doc => {
    const d = doc.data();
    categories[d.name] = { id: doc.id, ...d };
  });

  // 2. Load all articles
  const articlesSnap = await db.collection('users').doc(UID).collection('articles').get();
  const articles = [];
  articlesSnap.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));

  console.log(`  → ${Object.keys(categories).length} categories, ${articles.length} articles\n`);

  // 3. Scan articles to extract unique sizes per categoryId
  const sizesByCategory = {};
  let normalizedCount = 0;

  for (const art of articles) {
    const catName = art.categoryId || art.name;
    if (!catName) continue;
    if (!sizesByCategory[catName]) sizesByCategory[catName] = new Set();

    // Single size
    if (art.size && art.size !== 'various' && art.size.trim()) {
      const normalized = art.size.trim().toUpperCase();
      sizesByCategory[catName].add(normalized);

      if (art.size !== normalized) {
        normalizedCount++;
        console.log(`    [NORMALIZE] Article ${art.id}: "${art.size}" → "${normalized}"`);
        if (WRITE) {
          await db.collection('users').doc(UID).collection('articles').doc(art.id)
            .update({ size: normalized });
        }
      }
    }

    // Multi-size breakdown
    if (Array.isArray(art.sizeBreakdown)) {
      let breakdownUpdated = false;
      const updatedBreakdown = art.sizeBreakdown.map(row => {
        if (row.size && row.size.trim()) {
          const normalized = row.size.trim().toUpperCase();
          sizesByCategory[catName].add(normalized);
          if (row.size !== normalized) {
            breakdownUpdated = true;
            normalizedCount++;
            return { ...row, size: normalized };
          }
        }
        return row;
      });

      if (breakdownUpdated) {
        console.log(`    [NORMALIZE] Article ${art.id}: sizeBreakdown sizes normalized`);
        if (WRITE) {
          await db.collection('users').doc(UID).collection('articles').doc(art.id)
            .update({ sizeBreakdown: updatedBreakdown });
        }
      }
    }
  }

  // 4. Report findings and update categories
  console.log(`\n  ── Sizes found per category ──`);
  let updatedCats = 0;

  for (const [catName, sizesSet] of Object.entries(sizesByCategory)) {
    const sizes = Array.from(sizesSet).sort();
    if (sizes.length === 0) continue;

    const cat = categories[catName];
    if (!cat) {
      console.log(`    ⚠ Category "${catName}" not found in categories collection (orphan articles)`);
      continue;
    }

    const existing = Array.isArray(cat.availableSizes) ? cat.availableSizes : [];
    const merged = Array.from(new Set([...existing, ...sizes])).sort();
    const isNew = JSON.stringify(merged) !== JSON.stringify(existing);

    if (isNew) {
      updatedCats++;
      console.log(`    ✓ ${catName}: ${merged.join(', ')} ${existing.length > 0 ? `(was: ${existing.join(', ')})` : '(NEW)'}`);
      if (WRITE) {
        await db.collection('users').doc(UID).collection('categories').doc(cat.id)
          .update({ availableSizes: merged });
      }
    } else {
      console.log(`    ─ ${catName}: ${merged.join(', ')} (unchanged)`);
    }
  }

  console.log(`\n  Summary:`);
  console.log(`    Categories to update: ${updatedCats}`);
  console.log(`    Article sizes to normalize: ${normalizedCount}`);
  console.log(`    Mode: ${WRITE ? '✅ WRITE (applied)' : '🔍 DRY RUN (use --write to apply)'}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
