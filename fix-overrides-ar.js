const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const dumpPath = path.join(__dirname, 'src/lib/shop-firebase-dump.json');
const data = JSON.parse(readFileSync(dumpPath, 'utf8'));

// For each customProduct that has an override, sync the Arabic fields
// from customProducts into the override so the override doesn't overwrite
// good Arabic translations with old French ones.
let fixed = 0;
data.customProducts.forEach(product => {
  const ov = data.overrides[product.id];
  if (!ov) return;
  
  // Sync nameAr
  if (product.nameAr && /[\u0600-\u06FF]/.test(product.nameAr)) {
    if (!ov.nameAr || !/[\u0600-\u06FF]/.test(ov.nameAr)) {
      console.log(`FIX nameAr: ${product.id} | "${(ov.nameAr||'').substring(0,30)}" -> "${product.nameAr.substring(0,30)}"`);
      ov.nameAr = product.nameAr;
      fixed++;
    }
  }
  
  // Sync descriptionAr
  if (product.descriptionAr && /[\u0600-\u06FF]/.test(product.descriptionAr)) {
    if (!ov.descriptionAr || !/[\u0600-\u06FF]/.test(ov.descriptionAr)) {
      console.log(`FIX descriptionAr: ${product.id}`);
      ov.descriptionAr = product.descriptionAr;
      fixed++;
    }
  }
  
  // Sync shortDescriptionAr
  if (product.shortDescriptionAr && /[\u0600-\u06FF]/.test(product.shortDescriptionAr)) {
    if (!ov.shortDescriptionAr || !/[\u0600-\u06FF]/.test(ov.shortDescriptionAr)) {
      console.log(`FIX shortDescriptionAr: ${product.id}`);
      ov.shortDescriptionAr = product.shortDescriptionAr;
      fixed++;
    }
  }
  
  // Sync materialAr
  if (product.materialAr && /[\u0600-\u06FF]/.test(product.materialAr)) {
    if (!ov.materialAr || !/[\u0600-\u06FF]/.test(ov.materialAr)) {
      console.log(`FIX materialAr: ${product.id} | "${(ov.materialAr||'')}" -> "${product.materialAr}"`);
      ov.materialAr = product.materialAr;
      fixed++;
    }
  }
  
  // Sync specificationAr
  if (product.specificationAr && /[\u0600-\u06FF]/.test(product.specificationAr)) {
    if (!ov.specificationAr || !/[\u0600-\u06FF]/.test(ov.specificationAr)) {
      console.log(`FIX specificationAr: ${product.id} | "${(ov.specificationAr||'')}" -> "${product.specificationAr}"`);
      ov.specificationAr = product.specificationAr;
      fixed++;
    }
  }
  
  // Sync packagingAr
  if (product.packagingAr && /[\u0600-\u06FF]/.test(product.packagingAr)) {
    if (!ov.packagingAr || !/[\u0600-\u06FF]/.test(ov.packagingAr)) {
      console.log(`FIX packagingAr: ${product.id}`);
      ov.packagingAr = product.packagingAr;
      fixed++;
    }
  }
  
  // Sync categoryNameAr 
  if (product.categoryNameAr && /[\u0600-\u06FF]/.test(product.categoryNameAr)) {
    if (!ov.categoryNameAr || !/[\u0600-\u06FF]/.test(ov.categoryNameAr)) {
      ov.categoryNameAr = product.categoryNameAr;
      fixed++;
    }
  }
  
  // Also sync material/specification/packaging FR if override has empty ones
  if (product.material && !ov.material) { ov.material = product.material; fixed++; }
  if (product.specification && !ov.specification) { ov.specification = product.specification; fixed++; }
  if (product.packaging && !ov.packaging) { ov.packaging = product.packaging; fixed++; }
});

writeFileSync(dumpPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`\nDone! Fixed ${fixed} override fields.`);

// Verify
console.log('\n=== VERIFICATION ===');
const d2 = JSON.parse(readFileSync(dumpPath, 'utf8'));
['custom_1780496515405_uryjt', 'custom_1780502082575_qi5br', 'custom_1781549677899_11okn'].forEach(id => {
  const ov = d2.overrides[id];
  if (!ov) return;
  console.log(`\n${id}:`);
  console.log('  nameAr:', (ov.nameAr || 'MISSING').substring(0, 40));
  console.log('  materialAr:', ov.materialAr || 'MISSING');
  console.log('  specificationAr:', ov.specificationAr || 'MISSING');
  console.log('  packagingAr:', ov.packagingAr || 'MISSING');
});
