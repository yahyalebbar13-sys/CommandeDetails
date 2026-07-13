import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = {
    projectId: 'studio-9506506653-9b525',
    appId: '1:949158596969:web:76008c3d4edf496806edf8',
    apiKey: 'AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg',
    authDomain: 'studio-9506506653-9b525.firebaseapp.com',
    storageBucket: 'studio-9506506653-9b525.firebasestorage.app',
    measurementId: '',
    messagingSenderId: '949158596969'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const prod1 = {
  id: "custom_1781549677899_11okn",
  updates: {
    nameAr: "سحاب نايلون مقاس 5 - 75 سم نصف دائرة - 100 قطعة",
    categoryNameAr: "سحابات نايلون",
    shortDescriptionAr: "سحاب نايلون مقاس 5 بطول 75 سم مع منزلق قفل تلقائي. تصميم نصف دائرة مخصص للملابس والسترات والملابس الرياضية ومنتجات الخياطة. عبوة احترافية تحتوي على 100 قطعة.",
    descriptionAr: "هذا السحاب المصنوع من النايلون مقاس 5 بطول 75 سم مزود بمنزلق قفل تلقائي (Auto Lock) يضمن إغلاقاً موثوقاً وآمناً. بفضل مرونته ومقاومته العالية وتشطيبه عالي الجودة، فهو مناسب بشكل خاص لتفصيل الملابس الاحترافية والسترات والكنزات الصوفية والملابس الرياضية وغيرها من المنتجات النسيجية.\n\nيحافظ نظام القفل التلقائي على ثبات المنزلق في مكانه عند عدم استخدامه، مما يمنع الفتح غير المقصود. يُباع في عبوات تحتوي على 100 قطعة، ويعتبر هذا السحاب مثالياً لورش الخياطة ومصنعي الملابس وتجار الجملة.\n\nالمميزات\n- النوع: سحاب نايلون\n- المقاس: رقم 5\n- الطول: 75 سم\n- الموديل: نصف دائرة (Half Tour)\n- المنزلق: قفل تلقائي\n- متين ومرن\n- للاستخدام المهني\n- فتح وإغلاق سلس\n\nالمواصفات\n- المنتج: سحاب نايلون (Nylon Zipper)\n- الحجم: مقاس 5\n- الطول: 75 سم\n- نوع المنزلق: قفل تلقائي\n- التعبئة: 100 قطعة\n- التطبيق: الملابس وتفصيل المنسوجات\n\nالاستخدامات\n- السترات\n- الملابس الرياضية\n- الكنزات\n- ملابس العمل\n- الأزياء\n- التفصيل",
  }
};

const prod2 = {
  id: "custom_1781800044807_y5s58",
  updates: {
    nameAr: "سحاب نايلون مقاس 3 - 20 سم",
    categoryNameAr: "سحابات نايلون",
    shortDescriptionAr: "سحاب نايلون أبيض بطول 20 سم (مقاس 3). سلس ومقاوم وسهل الخياطة، وهو من إكسسوارات الخردوات الأساسية لتفصيل وإصلاح التنانير والفساتين والحقائب أو الوسائد الصغيرة.",
    descriptionAr: "أضف لمسة نهائية نظيفة واحترافية إلى إبداعاتك مع سحاب النايلون مقاس 3 الخاص بنا. مصمم للاستخدام اليومي، وتوفر أسنان السحاب البلاستيكية الحلزونية فتحاً وإغلاقاً سلساً دون عقبات.\n\nالميزات الرئيسية:\n- طول السحاب: 20 سم (مثالي للمشاريع الصغيرة والمتوسطة).\n- مقاس السحاب: رقم 3 (قياسي للخياطة الكلاسيكية).\n- المواد: أسنان من النايلون/البلاستيك المرن على شريط بوليستر.\n- اللون: أبيض سادة، أنيق وسهل التنسيق.\n- المنزلق: معدني بتشطيب مطابق، يوفر قبضة جيدة.\n- مثالي لـ: الملابس (التنانير، السراويل الخفيفة، الفساتين)، السلع الجلدية الصغيرة، الحقائب، الحقائب المدرسية، أغطية الوسائد والهوايات الإبداعية.\n\nخفيف ولكنه قوي، يمكن خياطة هذا السحاب بسهولة باستخدام آلة الخياطة ويضمن عمراً طويلاً لجميع مشاريع الخياطة الخاصة بك.",
    materialAr: "نايلون",
    specificationAr: "رقم 3"
  }
};

async function run() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  console.log("Updating Firebase...");
  await updateDoc(doc(db, 'shop_custom_products', prod1.id), prod1.updates);
  await updateDoc(doc(db, 'shop_custom_products', prod2.id), prod2.updates);

  console.log("Updating local JSON dump...");
  const dumpPath = 'src/lib/shop-firebase-dump.json';
  const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  
  let found = 0;
  for (const p of data.customProducts) {
    if (p.id === prod1.id) {
      Object.assign(p, prod1.updates);
      found++;
    }
    if (p.id === prod2.id) {
      Object.assign(p, prod2.updates);
      found++;
    }
  }
  
  fs.writeFileSync(dumpPath, JSON.stringify(data, null, 2));
  console.log("Done! Updated", found, "products in JSON.");
  process.exit(0);
}

run().catch(console.error);
