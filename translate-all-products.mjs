import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpPath = join(__dirname, 'src/lib/shop-firebase-dump.json');
const data = JSON.parse(readFileSync(dumpPath, 'utf8'));

// Complete data for all 23 products — both FR and AR
const allData = {
  'custom_1780496515405_uryjt': {
    material: '100% Polyester',          materialAr: '100% بوليستر',
    specification: 'Titre 40/2',          specificationAr: 'مقاس 40/2',
    packaging: '10 bobines/lot',          packagingAr: '10 بكرات في العبوة',
    nameAr: 'خيط خياطة 40/2',
    shortDescriptionAr: 'خيط خياطة 40/2 عالي الجودة، مصمم لأعمال الخياطة الصناعية والحرفية.',
    descriptionAr: 'خيط خياطة 40/2 – المتانة والانتظام والأداء العالي\n\nخيطنا المصنوع من البوليستر 40/2 يجمع بين القوة الاستثنائية والنعومة الممتازة. مثالي للخياطة الصناعية والحرفية على حدٍّ سواء.\n\nالمميزات الرئيسية:\n• مقاومة فائقة للكسر والشد\n• ملمس ناعم لا يؤثر على القماش\n• ألوان ثابتة لا تبهت بعد الغسيل\n• مناسب لجميع أنواع ماكينات الخياطة\n\nمثالي لـ: خياطة الملابس، التطريز الصناعي، ورش الخياطة.',
  },
  'custom_1780502082575_qi5br': {
    material: '100% Polyester',           materialAr: '100% بوليستر',
    specification: 'Compatible canettes standards', specificationAr: 'متوافق مع جميع المكوكات القياسية',
    packaging: 'Boîte multi-bobines',     packagingAr: 'علبة متعددة البكرات',
    nameAr: 'خيط المكوك (كانيت)',
    shortDescriptionAr: 'خيط مكوك عالي الجودة مناسب لجميع ماكينات الخياطة الصناعية.',
    descriptionAr: 'خيط المكوك (كانيت) – دقة لا تتنازل عنها\n\nخيط المكوك المصنوع من البوليستر عالي الجودة يضمن خياطة سلسة وثابتة بدون انقطاع. متوافق مع أغلب ماكينات الخياطة.\n\nالمميزات:\n• قوة شد عالية ومرونة مثالية\n• سطح أملس لتسهيل انزلاق الخيط\n• لا يتعقد أثناء الخياطة',
  },
  'custom_1780503129736_5if0z': {
    material: 'Polyester + adhésif thermique', materialAr: 'بوليستر مع طبقة لاصقة حرارية',
    specification: '1040EF',              specificationAr: '1040EF',
    packaging: 'Rouleau complet',         packagingAr: 'رول كامل',
    nameAr: 'فيزلين 1040EF – قماش حشو حراري لاصق',
    shortDescriptionAr: 'قماش حشو حراري لاصق عالي الجودة مثالي للخياطة الاحترافية وتصميم الملابس.',
    descriptionAr: 'فيزلين 1040EF – الحشو الحراري الاحترافي\n\nفيزلين 1040EF هو قماش حشو حراري لاصق يُستخدم لتقوية وتثبيت الأقمشة في مشاريع الخياطة المختلفة.\n\nالمميزات:\n• يُطبَّق بالحرارة بسهولة تامة\n• يُقوّي القماش ويحافظ على شكله\n• لا يسبب التجعد أو الالتصاق الزائد\n• مناسب لأقمشة متعددة',
  },
  'custom_1780595583026_yc5ik': {
    material: '100% Polyester',           materialAr: '100% بوليستر',
    specification: 'Largeur 150 cm',      specificationAr: 'عرض 150 سم',
    packaging: 'Rouleau 50 mètres',       packagingAr: 'رول من 50 متراً',
    nameAr: 'بطانة 210T عرض 1.50 م – قماش بطانة خفيف',
    shortDescriptionAr: 'قماش بطانة خفيف الوزن بعرض 1.50 م، مثالي للملابس والتصميمات الاحترافية.',
    descriptionAr: 'بطانة 210T – الرفاهية والإتقان في كل قطعة\n\nبطانة 210T بعرض 1.50 م تُضفي نعومة ومظهراً احترافياً لملابسك. لمسة ناعمة تُريح البشرة وتُحسن تدلّي الملابس.\n\nالمميزات:\n• وزن خفيف للراحة الكاملة\n• سهلة الخياطة والقص\n• أساسية لبطانة الجاكيتات والفساتين والسراويل\n• متوفرة بألوان متعددة',
  },
  'custom_1780597564525_qupv8': {
    material: '100% Polyester',           materialAr: '100% بوليستر',
    specification: 'Titre 20/3',          specificationAr: 'مقاس 20/3',
    packaging: '6 bobines × 500m = 3000m', packagingAr: '6 بكرات × 500 متر = 3000 متر',
    nameAr: 'خيط بوليستر 20/3 – حزمة 6 بكرات (3000 م)',
    shortDescriptionAr: 'حزمة 6 بكرات خيط بوليستر 20/3 بطول 3000 متر، مثالي للخياطة الصناعية.',
    descriptionAr: 'خيط بوليستر 20/3 – القوة للخياطة الثقيلة\n\nخيطنا 20/3 مصمم للخياطة الثقيلة والاحترافية. سميك ومتين، يُستخدم لخياطة الأحذية والحقائب والمعدات الرياضية وغيرها.\n\nالمميزات:\n• سماكة مثالية للخياطة الثقيلة\n• مقاومة فائقة للشد والكسر\n• ألوان متعددة ثابتة',
  },
  'custom_1780601016715_p3t1p': {
    material: '100% Polyester',           materialAr: '100% بوليستر',
    specification: 'Titre 40/3',          specificationAr: 'مقاس 40/3',
    packaging: '12 bobines/lot',          packagingAr: '12 بكرة في الحزمة',
    nameAr: 'خيط بوليستر 40/3 – حزمة 12 بكرة',
    shortDescriptionAr: 'حزمة 12 بكرة من خيط بوليستر 40/3 عالي الجودة، مناسب للخياطة الصناعية والحرفية.',
    descriptionAr: 'خيط بوليستر 40/3 – الاحتراف في كل غرزة\n\nخيط بوليستر 40/3 هو الخيار المفضل للمحترفين. جودة ثابتة، متانة عالية، وألوان لا تبهت مع الغسيل.',
  },
  'custom_1780932946065_4li5t': {
    material: '100% Polyester satin',     materialAr: '100% بوليستر ساتان',
    specification: 'Largeur 25 mm',       specificationAr: 'عرض 25 مم',
    packaging: '10 rouleaux/lot',          packagingAr: '10 بكرات في الحزمة',
    nameAr: 'شريط ساتان 25 مم – حزمة 10 قطع',
    shortDescriptionAr: 'شريط ساتان عالي الجودة بعرض 25 مم، يُباع في حزمة 10 بكرات.',
    descriptionAr: 'شريط ساتان 25 مم – الأناقة والتنوع\n\nشريط الساتان 25 مم مثالي لإضفاء لمسة أنيقة على هداياك وملابسك وديكورات الفعاليات.',
  },
  'custom_1781027836259_yb000': {
    material: '100% Polyester',           materialAr: '100% بوليستر',
    specification: 'Largeur 150 cm',      specificationAr: 'عرض 150 سم',
    packaging: 'Rouleau 50 mètres',       packagingAr: 'رول من 50 متراً',
    nameAr: 'قماش بوبلين بوليستر 100% – رول 50 متراً',
    shortDescriptionAr: 'قماش بوبلين بوليستر 100% عالي الجودة، مثالي للملابس والمفروشات. رول كامل 50 متراً.',
    descriptionAr: 'بوبلين بوليستر 100% – الجودة المضمونة لكل استخدام\n\nبوبلين البوليستر يجمع بين المتانة وسهولة العناية. نسيج ناعم مقاوم للتجاعيد ومناسب للاستخدام اليومي.',
  },
  'custom_1781213370895_92nbv': {
    material: 'Fer galvanisé',            materialAr: 'حديد مطلي',
    specification: 'Ø 15 mm — Type W',    specificationAr: 'قطر 15 مم – نوع W',
    packaging: '1000 ensembles complets', packagingAr: '1000 طقم كامل (1000 قطعة علوية + 1000 قطعة سفلية)',
    nameAr: 'دبابيس ضغط زنبركية 15 مم بيضاء – 1000 طقم',
    shortDescriptionAr: 'دبابيس ضغط زنبركية 15 مم بيضاء اللون مصنوعة من الحديد – 1000 طقم كامل.',
    descriptionAr: 'دبابيس الضغط الزنبركية 15 مم – الإغلاق المثالي\n\nدبابيس الضغط الزنبركية 15 مم توفر إغلاقاً موثوقاً وسريعاً لمختلف المنتجات النسيجية.',
  },
  'custom_1781548051720_mliyd': {
    material: '100% Polyester velours',   materialAr: '100% بوليستر مخمل',
    specification: '100 yards/rouleau',   specificationAr: 'طول 100 يارد',
    packaging: '1 rouleau',               packagingAr: 'رول واحد كامل',
    nameAr: 'شريط مخمل (مُبرة) – 100 يارد/رول',
    shortDescriptionAr: 'شريط مخمل عالي الجودة بملمس ناعم وفاخر، يُباع في رول 100 يارد.',
    descriptionAr: 'شريط المخمل (المُبرة) – الفخامة في كل لمسة\n\nشريط المخمل بملمسه الناعم المخملي يُضفي لمسة فخامة لا مثيل لها على تصميماتك.',
  },
  'custom_1781549677899_11okn': {
    material: 'Nylon',                    materialAr: 'نايلون',
    specification: 'N°5 — 75 cm demi-tour', specificationAr: 'مقاس 5 – طول 75 سم نصف دائرة',
    packaging: '100 pièces/lot',          packagingAr: '100 قطعة في الحزمة',
  },
  'custom_1781639488186_8gm8s': {
    material: '100% Résine',              materialAr: '100% راتنج',
    specification: 'Blanc — 2 trous',     specificationAr: 'أبيض – 2 ثقوب',
    packaging: '1440 pièces (10 grosses)', packagingAr: '1440 قطعة (10 غروس)',
  },
  'custom_1781800044807_y5s58': {
    packagingAr: '100 قطعة في الحزمة', // already has material/spec
  },
  'custom_1781800977018_7ht78': {
    packaging: '1 rouleau',               packagingAr: 'رول واحد',
    nameAr: 'رول شريط فيلكرو (سكراتش) – عرض 2.5 سم',
    shortDescriptionAr: 'شريط فيلكرو عالي الجودة بعرض 2.5 سم. نظام إغلاق سريع وقابل لإعادة الاستخدام.',
    descriptionAr: 'شريط الفيلكرو – الإغلاق الذكي والعملي\n\nشريط الفيلكرو يوفر حلاً لإغلاق سريعاً وقابلاً لإعادة الاستخدام آلاف المرات.',
  },
  'custom_1781882828844_wzuoq': {
    material: 'Polyester',                materialAr: 'بوليستر',
    packaging: '12 pièces',               packagingAr: '12 قطعة في الحزمة',
    nameAr: 'حزمة 12 متر شريط – عرض 150 سم',
    shortDescriptionAr: 'شريط نسيج عالي الجودة بعرض 150 سم – حزمة 12 قطعة.',
    descriptionAr: 'شريط 150 سم – معيار الصناعة النسيجية\n\nشريط نسيجي احترافي بعرض 150 سم مُحسَّن للمتانة واللدونة في بيئة العمل الصناعي.',
  },
  'custom_1781885141767_1ok3o': {
    material: 'Acier inoxydable',         materialAr: 'فولاذ مقاوم للصدأ',
    specification: 'Coupe-fil standard',  specificationAr: 'مقص خيوط قياسي',
    packaging: '12 pièces',               packagingAr: '12 قطعة في الحزمة',
    nameAr: 'حزمة 12 مقص خيوط احترافي',
    shortDescriptionAr: 'هذه الحزمة من 12 مقص خيوط مثالية لقطع الخيوط بسرعة ودقة في أي ورشة خياطة.',
    descriptionAr: 'مقص الخيوط الاحترافي – الدقة والسرعة في كل قطعة\n\nمقص الخيوط المُصمَّم للخياطين والمحترفين يُوفر قطعاً نظيفاً ودقيقاً للخيوط الزائدة دون إتلاف القماش.',
  },
  'custom_1782228665235_uvyn0': {
    packaging: '1 rouleau',               packagingAr: 'رول واحد',
    nameAr: 'رول مطاط مضفر – 100 يارد',
    shortDescriptionAr: 'رول مطاط مضفر عالي الجودة، مناسب لجميع أعمال الخياطة.',
    descriptionAr: 'المطاط المضفر – الشريك المثالي للتشطيبات المتينة\n\nمطاطنا المضفر يجمع بين البوليستر عالي المقاومة ومطاط اللاتكس/الإيلاستين لمرونة مثالية تدوم طويلاً.',
  },
  'custom_1782301687832_m5bv4': {
    packaging: '1000 sets complets',      packagingAr: '1000 طقم كامل (1000 jزء علوي + 1000 ظهر بحلقة)',
    nameAr: '1000 طقم قوالب أزرار ألومنيوم قابلة للتغطية',
    shortDescriptionAr: '1000 طقم قوالب أزرار ألومنيوم لتغطيتها بقماش مطابق لتصميماتك.',
    descriptionAr: 'قوالب الأزرار القابلة للتغطية – إبداع بلمسة شخصية\n\nأعطِ تصميماتك لمسة مميزة وفريدة بتغطية الأزرار بقماش مطابق.',
  },
  'custom_1782415355559_rjysz': {
    packaging: '10 grosses = 1440 pièces', packagingAr: '10 غروس = 1440 قطعة',
    nameAr: '10 غروس (1440 قطعة) أزرار راتنج 4 ثقوب',
    shortDescriptionAr: 'حزمة صناعية 1440 قطعة من أزرار الراتنج 4 ثقوب عالية الجودة.',
    descriptionAr: 'أزرار الراتنج 4 ثقوب – الزر المرجعي للخياطة الصناعية\n\nالزر المفضل للمصانع والأعمال الكبيرة. جودة ثابتة وسعر تنافسي.',
  },
  'custom_1782935835919_kgfc8': {
    packaging: '50 pièces',               packagingAr: '50 قطعة في الحزمة',
    nameAr: 'لوت 50 سحاب بلاستيك 75 سم قابل للفصل',
    shortDescriptionAr: 'لوت 50 سحاب بلاستيك 75 سم قابل للفصل بتصميم نصف دائرة عالي الجودة.',
    descriptionAr: 'سحاب البلاستيك 75 سم القابل للفصل – تصميم قوي واحترافي\n\nهذا اللوت من 50 سحاب بلاستيك مُصمَّم للسترات والجاكيتات الرياضية.',
  },
  'custom_1783358909721_9avjc': {
    material: 'Nylon',                    materialAr: 'نايلون عالي الجودة',
    specification: 'Invisible — 20 cm',   specificationAr: 'خفي – طول 20 سم',
    packaging: '100 pièces',              packagingAr: '100 قطعة في الحزمة',
    nameAr: 'لوت 100 سحاب نايلون خفي – 20 سم',
    shortDescriptionAr: 'لوت 100 سحاب نايلون خفي بطول 20 سم لتشطيبات نظيفة وغير مرئية.',
    descriptionAr: 'سحاب النايلون الخفي 20 سم – فن التشطيب الاحترافي\n\nالسحاب الخفي يوفر تشطيبة نظيفة ومخفية تماماً. الحل المثالي للفساتين والتنانير الراقية.',
  },
  'custom_1783767948587_e8w0r': {
    material: 'Nylon + curseur PU',       materialAr: 'نايلون مع منزلق بولي يوريتان',
    specification: 'N°3 — 20 cm — curseur PU', specificationAr: 'مقاس 3 – طول 20 سم – منزلق PU',
    packaging: '100 pièces',              packagingAr: '100 قطعة في الحزمة',
    nameAr: 'لوت 100 سحاب نايلون مقاس 3 – 20 سم منزلق PU',
    shortDescriptionAr: 'لوت 100 سحاب نايلون مقاس 3 بطول 20 سم مع منزلق PU احترافي.',
    descriptionAr: 'سحاب نايلون مقاس 3 مع منزلق PU – الاحتراف في كل غرزة\n\nلوت اقتصادي 100 قطعة من أرقى السحابات لضمان تشطيبات احترافية.',
  },
  'custom_1783768966494_93lor': {
    material: 'Plastique Delrin (Polyacétal)', materialAr: 'بلاستيك ديلرين (بولي أسيتال)',
    specification: 'N°5 — 70 cm — curseur M832', specificationAr: 'مقاس 5 – طول 70 سم – منزلق M832',
    packaging: '50 pièces',               packagingAr: '50 قطعة في الحزمة',
    nameAr: 'لوت 50 سحاب بلاستيك Delrin مقاس 5 – 70 سم منزلق M832',
    shortDescriptionAr: 'لوت 50 سحاب بلاستيك Delrin مقاس 5 بطول 70 سم مع منزلق M832 احترافي.',
    descriptionAr: 'سحاب Delrin مقاس 5 مع منزلق M832 – تكامل الجودة والقوة\n\nلوت اقتصادي 50 قطعة من سحابات البلاستيك الصناعي Delrin، المعروف بمتانته.',
  },
};

let updated = 0;
data.customProducts = data.customProducts.map(product => {
  const t = allData[product.id];
  if (!t) return product;
  updated++;
  return { ...product, ...t };
});

writeFileSync(dumpPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Done! Updated ${updated} products with complete FR+AR data.`);

// Verify
const d2 = JSON.parse(readFileSync(dumpPath, 'utf8'));
d2.customProducts.forEach(p => {
  const hasMat = !!p.material;
  const hasSpec = !!p.specification;
  const hasPack = !!p.packaging;
  if (!hasMat || !hasSpec || !hasPack) {
    console.log(`⚠️  Missing: ${p.id} | mat:${hasMat} spec:${hasSpec} pack:${hasPack}`);
  } else {
    console.log(`✅ ${p.id.substring(0,30)} | mat:${p.material.substring(0,20)}`);
  }
});
