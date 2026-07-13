const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const dumpPath = path.join(__dirname, 'src/lib/shop-firebase-dump.json');
const data = JSON.parse(readFileSync(dumpPath, 'utf8'));

const colorMap = {
  'Blanc': 'أبيض', 'Noir': 'أسود', 'Rouge': 'أحمر', 'Bleu': 'أزرق',
  'Vert': 'أخضر', 'Jaune': 'أصفر', 'Rose': 'وردي', 'Violet': 'بنفسجي',
  'Orange': 'برتقالي', 'Gris': 'رمادي', 'Marron': 'بني', 'Beige': 'بيج',
  'Doré': 'ذهبي', 'Argenté': 'فضي', 'Argent': 'فضي', 'Or': 'ذهبي',
  'Nickel': 'نيكل', 'NICKEL': 'نيكل'
};

let fixed = 0;
// Fix in customProducts
data.customProducts.forEach(p => {
  (p.variants || []).forEach(v => {
    if (v.color && colorMap[v.color]) {
      v.colorAr = colorMap[v.color];
      fixed++;
    }
  });
});
// Fix in overrides
Object.values(data.overrides).forEach(ov => {
  (ov.variants || []).forEach(v => {
    if (v.color && colorMap[v.color]) {
      v.colorAr = colorMap[v.color];
      fixed++;
    }
  });
});

// Also translate categoryNameAr in overrides
const catMap = {
  'Bobines de fil': 'بكرات الخيط', 'Doublure': 'بطانة', 'Tissu & Doublure': 'أقمشة وبطانة',
  'Rubans': 'أشرطة', 'Velcro': 'فيلكرو', 'Élastiques': 'مطاطات',
  'Accessoires': 'إكسسوارات', 'Accessoires Couture': 'مستلزمات الخياطة',
  'Boutons': 'أزرار', 'Fermetures': 'سحابات', 'Fermetures Nylon': 'سحابات نايلون',
  'Fermetures Invisibles': 'سحابات خفية', 'Fermetures Résine': 'سحابات بلاستيكية',
  'Fermetures Métal': 'سحابات معدنية', 'Entoilage': 'حشو',
  'Fermeture Nylon N3 10-50cm': 'سحاب نايلون مقاس 3 - 10-50 سم',
  'Fermeture en Nylon N3 10-50cm': 'سحاب نايلون مقاس 3 - 10-50 سم',
  'Fermeture en Nylon N°5 ': 'سحاب نايلون مقاس 5',
  'Fermeture en Nylon N°5': 'سحاب نايلون مقاس 5'
};

Object.keys(data.overrides).forEach(k => {
  const ov = data.overrides[k];
  if (ov.categoryName && catMap[ov.categoryName] && (!ov.categoryNameAr || !/[\u0600-\u06FF]/.test(ov.categoryNameAr))) {
    ov.categoryNameAr = catMap[ov.categoryName];
    fixed++;
  }
});
data.customProducts.forEach(p => {
  if (p.categoryName && catMap[p.categoryName] && (!p.categoryNameAr || !/[\u0600-\u06FF]/.test(p.categoryNameAr))) {
    p.categoryNameAr = catMap[p.categoryName];
    fixed++;
  }
});

writeFileSync(dumpPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Fixed ' + fixed + ' fields');
