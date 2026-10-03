// Textes des rayons de la boutique, en français et en arabe (03/10/2026).
// Pour chaque rayon :
// - une phrase d'introduction (160 caractères au plus) : sous le titre du rayon, sur sa
//   carte dans « Nos catégories », et pour la meta description de la page ;
// - un texte complet, affiché sous les produits (« À propos de ce rayon »).
// Règles d'écriture : rien que ce que disent les fiches du rayon (aucun chiffre ni
// caractéristique inventés), pas de superlatifs, le transporteur n'est jamais nommé,
// aucune livraison offerte. Quand les produits d'un rayon changent, relire son texte.
// Un rayon se retrouve par son identifiant, puis par son slug Firestore (alias).
// Aucun import « client » : utilisable aussi par le serveur (layout, plan du site).

import type { ShopCategory } from './shop-types';
import type { Language } from './translations';

type Bilingue<T> = Record<Language, T>;

export interface TexteRayon {
  id: string;
  slug: string;
  intro: Bilingue<string>;
  paragraphes: Bilingue<string[]>;
}

// Dernier paragraphe : prix de gros, livraison et retrait (même discours que la FAQ)
const FIN: Bilingue<string> = {
  fr: "Les prix affichés sont des prix de gros ; pour une grosse quantité, demandez un prix sur WhatsApp. Livraison partout au Maroc, retrait gratuit à Casablanca.",
  ar: 'الأثمنة المعروضة هي أثمنة الجملة؛ للكميات الكبيرة اطلب الثمن عبر واتساب. التوصيل لجميع مدن المغرب، والاستلام مجاني في الدار البيضاء.',
};

// Rayons de rouleaux de tissu : un rouleau entier part par un transport organisé au téléphone
const FIN_ROULEAU: Bilingue<string> = {
  fr: "Livraison partout au Maroc ; pour un rouleau entier, nous vous appelons pour organiser le transport. Retrait toujours gratuit à Casablanca. Les prix affichés sont des prix de gros ; pour une grosse quantité, demandez un prix sur WhatsApp.",
  ar: 'التوصيل لجميع مدن المغرب؛ وبالنسبة للفة الكاملة، نتصل بك لترتيب النقل. الاستلام دائماً مجاني في الدار البيضاء. الأثمنة المعروضة هي أثمنة الجملة؛ للكميات الكبيرة اطلب الثمن عبر واتساب.',
};

export const TEXTES_RAYONS: TexteRayon[] = [
  // ─── Fermetures nylon et leurs sous-rayons ──────────────────────────────────
  {
    id: 'fermetures-nylon',
    slug: 'fermetures-nylon',
    intro: {
      fr: "Fermetures éclair en nylon N°3 et N°5, en lots de 50 ou 100 pièces, et fermeture au mètre en rouleau : pour ateliers de confection et tailleurs.",
      ar: 'سحابات نايلون رقم 3 ورقم 5، في حزم من 50 أو 100 قطعة، وسحاب متصل في لفة يُقص حسب الطول: للمعامل والخياطين.',
    },
    paragraphes: {
      fr: [
        "La fermeture en nylon a une maille en spirale, souple et légère. Ce rayon réunit trois familles, rangées en sous-rayons.",
        "Le N°3 est la maille fine : jupes, robes, pantalons légers, trousses et housses de coussin. Il existe aussi en fermeture invisible, dont la maille se cache dans la couture. Le N°5, plus large et plus solide, va sur les vestes, blousons, sweats et vêtements de travail. La fermeture continue N°5, vendue en rouleau, se coupe à la longueur voulue et se monte avec des curseurs N°5.",
        "Sur la fiche, regardez la taille de la maille, la longueur et le type. Une fermeture séparable (Open-End) s'ouvre en deux, comme sur une veste ; une fermeture non séparable reste fermée en bas, comme sur une jupe. Vente par lots de 50 ou de 100 pièces, souvent en plusieurs couleurs.",
        FIN.fr,
      ],
      ar: [
        'سحاب النايلون أسنانه على شكل حلزون، وهو مرن وخفيف. يضم هذا القسم ثلاثة أنواع، مرتبة في أقسام فرعية.',
        'رقم 3 هو الحجم الرقيق: للتنانير والفساتين والسراويل الخفيفة والمقلمات وأغطية الوسائد. ويوجد أيضاً في شكل سحاب مخفي تختفي أسنانه داخل الخياطة. رقم 5 أعرض وأمتن، ويُركب على الجاكيتات والبلوزونات والسويتات وملابس العمل. أما السحاب المتصل رقم 5، المبيع في لفة، فيُقص حسب الطول المطلوب وتُركب عليه رؤوس سحاب رقم 5.',
        'في صفحة المنتج، انظر إلى رقم السحاب والطول والنوع. السحاب المنفصل (Open-End) ينفتح إلى جزأين كما في الجاكيت؛ والسحاب غير المنفصل يبقى مغلقاً من الأسفل كما في التنورة. البيع في حزم من 50 أو 100 قطعة، وغالباً بعدة ألوان.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_fermeture-en-nylon-n-3-10-50cm_1783357489301',
    slug: 'fermeture-en-nylon-n-3-10-50cm',
    intro: {
      fr: "Fermetures nylon N°3, classiques ou invisibles, en lots de 100 pièces et en plusieurs couleurs : pour jupes, robes, pantalons, trousses et coussins.",
      ar: 'سحابات نايلون رقم 3، عادية أو مخفية، في حزم من 100 قطعة وبعدة ألوان: للتنانير والفساتين والسراويل والمقلمات والوسائد.',
    },
    paragraphes: {
      fr: [
        "La maille N°3 est la plus fine de nos fermetures en nylon. Légère et discrète, elle convient aux tissus fins à moyens : coton, crêpe, viscose, lin.",
        "Ce sous-rayon propose deux familles. La fermeture classique reste visible : jupes, robes, braguettes de pantalons et de shorts, trousses, pochettes, housses de coussin. La fermeture invisible se cache dans la couture et seule la tirette se voit : elle convient aux robes, jupes, pantalons habillés et corsages.",
        "Sur la fiche, vérifiez la longueur, écrite dans le nom, et le curseur. Un curseur autobloquant (Auto-Lock) reste en place quand on ne le tire pas. Le lot à curseur PU est non séparable : la fermeture reste fermée en bas. Vente par lots de 100 pièces ; choisissez la couleur sur la fiche avant d'ajouter au panier.",
        FIN.fr,
      ],
      ar: [
        'رقم 3 هو أرق سحابات النايلون عندنا. خفيف وغير بارز، ويناسب الأقمشة الرقيقة والمتوسطة: القطن، والكريب، والفيسكوز، والكتان.',
        'يضم هذا القسم نوعين. السحاب العادي يبقى ظاهراً: للتنانير والفساتين وفتحات السراويل والشورتات والمقلمات والحقائب الصغيرة وأغطية الوسائد. أما السحاب المخفي فيختفي داخل الخياطة ولا يظهر منه إلا المقبض: يناسب الفساتين والتنانير والسراويل الأنيقة والبلوزات.',
        'في صفحة المنتج، تحقق من الطول المكتوب في الاسم ومن رأس السحاب. رأس السحاب ذاتي القفل (Auto-Lock) يبقى في مكانه عندما لا تسحبه. حزمة السحابات برأس PU غير منفصلة: تبقى مغلقة من الأسفل. البيع في حزم من 100 قطعة؛ اختر اللون في صفحة المنتج قبل إضافته إلى السلة.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_fermeture-en-nylon-no5-50cm-1m20_1783357644052',
    slug: 'fermeture-en-nylon-no5-50cm-1m20',
    intro: {
      fr: "Fermetures éclair N°5 pour vestes, blousons, sweats, vêtements de sport et de travail, en lots de 50 ou 100 pièces, avec plusieurs modèles de curseur.",
      ar: 'سحابات رقم 5 للجاكيتات والبلوزونات والسويتات وملابس الرياضة والعمل، في حزم من 50 أو 100 قطعة، مع عدة أنواع من رؤوس السحاب.',
    },
    paragraphes: {
      fr: [
        "La maille N°5 est plus large et plus solide que le N°3. C'est la taille des fermetures de vestes, blousons, manteaux, parkas, sweats zippés, survêtements, uniformes et vêtements de travail.",
        "Pour une veste ou un manteau, prenez une fermeture séparable, marquée « Open-End » ou « O/E » : elle s'ouvre entièrement en deux. La plupart des modèles ont un curseur autobloquant (Auto-Lock), qui ne glisse pas tout seul.",
        "Les modèles se distinguent ensuite par leur curseur (Half Tour, Pipa, PU, « O ») et par leur style : dents argentées ou dorées, style trois couleurs, ou montage inversé, où la spirale se cache à l'intérieur pour un aspect lisse.",
        "La longueur est écrite dans le nom de chaque article. Vente par lots de 50 ou de 100 pièces ; quand plusieurs couleurs existent, choisissez-la sur la fiche.",
        FIN.fr,
      ],
      ar: [
        'رقم 5 أعرض وأمتن من رقم 3. هو حجم سحابات الجاكيتات والبلوزونات والمعاطف والباركات والسويتات بالسحاب وملابس الرياضة واللباس الموحد وملابس العمل.',
        'للجاكيت أو المعطف، اختر سحاباً منفصلاً مكتوباً عليه «Open-End» أو «O/E»: ينفتح كلياً إلى جزأين. وأغلب الموديلات برأس سحاب ذاتي القفل (Auto-Lock) لا ينزلق وحده.',
        'ثم تختلف الموديلات حسب رأس السحاب (Half Tour، Pipa، PU، «O») وحسب الشكل: أسنان فضية أو ذهبية، أو تصميم بثلاثة ألوان، أو تركيب معكوس تختفي فيه الأسنان إلى الداخل ليبدو السحاب أملس.',
        'الطول مكتوب في اسم كل منتج. البيع في حزم من 50 أو 100 قطعة؛ وعندما تتوفر عدة ألوان، اختر اللون في صفحة المنتج.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_rouleau-fermeture-en-nylon_1786386569049',
    slug: 'rouleau-fermeture-en-nylon',
    intro: {
      fr: "Fermeture nylon N°5 au mètre, en rouleau de 200 m : coupez la longueur voulue et montez un curseur N°5. Pour sacs, housses et ameublement.",
      ar: 'سحاب نايلون رقم 5 بالمتر، في لفة من 200 م: قص الطول الذي تحتاجه وركّب رأس سحاب رقم 5. للحقائب والأغطية والأثاث.',
    },
    paragraphes: {
      fr: [
        "La fermeture continue, aussi appelée fermeture au mètre ou « long chain », est livrée en rouleau, sans butées ni curseur. Vous coupez exactement la longueur dont vous avez besoin, sans perte, puis vous enfilez un curseur.",
        "Elle sert surtout aux longues ouvertures et à la fabrication en série : sacs de voyage, sacs à dos, trousses, housses de canapé, de matelas et de coussins, tentes et bâches, vêtements de travail.",
        "Le curseur doit avoir la même taille que la maille. Ce rouleau a une maille N°5 : il se monte avec des curseurs N°5, comme ceux du rayon des curseurs pour fermeture en nylon. Le rouleau fait 200 m ; la couleur se choisit sur la fiche.",
        FIN.fr,
      ],
      ar: [
        'السحاب المتصل، ويسمى أيضاً السحاب بالمتر أو «long chain»، يأتي في لفة بدون أطراف ثابتة وبدون رأس سحاب. تقص الطول الذي تحتاجه بالضبط، بدون ضياع، ثم تُدخل رأس السحاب.',
        'يُستعمل خاصة للفتحات الطويلة وللإنتاج بكميات كبيرة: حقائب السفر، وحقائب الظهر، والمقلمات، وأغطية الكنبات والمراتب والوسائد، والخيام والأغطية الواقية (الباش)، وملابس العمل.',
        'يجب أن يكون رأس السحاب من نفس رقم الأسنان. هذه اللفة رقم 5: تُركب عليها رؤوس سحاب رقم 5، مثل التي في قسم رؤوس سحاب النايلون. طول اللفة 200 م، واللون يُختار في صفحة المنتج.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_curseur-pour-fermeture-en-nylon_1779365148873',
    slug: 'curseur-pour-fermeture-en-nylon',
    intro: {
      fr: "Curseurs N°5 pour fermeture en nylon, en pack de 500 pièces : pour monter une fermeture au mètre ou remplacer un curseur abîmé.",
      ar: 'رؤوس سحاب رقم 5 لسحاب النايلون، في حزمة من 500 قطعة: لتركيب السحاب بالمتر أو لتعويض رأس سحاب مكسور.',
    },
    paragraphes: {
      fr: [
        "Le curseur est la pièce qui ouvre et ferme la fermeture éclair. Il se choisit d'après la maille : un curseur N°5 va sur une fermeture en nylon N°5.",
        "On en a besoin dans deux cas. Pour fabriquer : une fermeture continue coupée au mètre n'a pas de curseur, on l'enfile après la coupe. Pour réparer : on remplace un curseur cassé sur un vêtement, un sac ou une housse sans changer toute la fermeture.",
        "Le modèle proposé est un curseur N°5 noir, au design « Half Tour » (demi-tour), vendu en pack de 500 pièces. Il s'utilise en maroquinerie (sacs à dos, sacoches, trousses), en prêt-à-porter (vestes, manteaux, sweats), en ameublement (housses de coussins) et pour l'équipement de plein air (tentes, sacs de couchage).",
        FIN.fr,
      ],
      ar: [
        'رأس السحاب (المزلاج) هو القطعة التي تفتح السحاب وتغلقه. يُختار حسب رقم الأسنان: رأس رقم 5 يُركب على سحاب نايلون رقم 5.',
        'تحتاجه في حالتين. للتصنيع: السحاب المتصل المقصوص بالمتر ليس له رأس، فيُركب بعد القص. وللإصلاح: تعوض رأساً مكسوراً في لباس أو حقيبة أو غطاء دون تغيير السحاب كله.',
        'الموديل المعروض رأس سحاب رقم 5 أسود، بتصميم «Half Tour» (نصف دورة)، يُباع في حزمة من 500 قطعة. يُستعمل في الحقائب (حقائب الظهر، الحقائب الصغيرة، المقلمات)، وفي الملابس الجاهزة (الجاكيتات، المعاطف، السويتات)، وفي الأثاث (أغطية الوسائد)، وفي أدوات التخييم (الخيام، أكياس النوم).',
        FIN.ar,
      ],
    },
  },

  // ─── Fermetures plastique / résine et métal ─────────────────────────────────
  {
    id: 'fermetures-resine',
    slug: 'fermetures-resine',
    intro: {
      fr: "Fermetures éclair à dents en plastique (résine) N°5, en lots de 50 ou 100 pièces : pour vestes, manteaux, parkas, sacs, trousses et poches.",
      ar: 'سحابات بأسنان من البلاستيك (الراتنج) رقم 5، في حزم من 50 أو 100 قطعة: للجاكيتات والمعاطف والباركات والحقائب والمقلمات والجيوب.',
    },
    paragraphes: {
      fr: [
        "Les fermetures en plastique, aussi appelées fermetures en résine ou Delrin, ont des dents en plastique injecté fixées sur un ruban en polyester. Elles résistent bien à la traction et aux lavages fréquents : on les pose sur les vêtements d'extérieur, les vêtements de sport, les uniformes, les sacs et les trousses.",
        "Ce rayon propose aujourd'hui la maille N°5, réunie dans un sous-rayon : longues fermetures séparables pour vestes, blousons et manteaux, modèle à double curseur qui s'ouvre aussi par le bas pour les pièces longues, et petites fermetures non séparables pour trousses, pochettes et poches.",
        "Avant de commander, vérifiez sur la fiche la longueur, le type (séparable ou non), la forme du curseur et la couleur. Vente par lots de 50 ou de 100 pièces.",
        FIN.fr,
      ],
      ar: [
        'سحابات البلاستيك، وتسمى أيضاً سحابات الراتنج (ريزين) أو Delrin، أسنانها من البلاستيك المحقون مثبتة على شريط من البوليستر. تتحمل الشد والغسل المتكرر، وتُركب على الملابس الخارجية وملابس الرياضة واللباس الموحد والحقائب والمقلمات.',
        'يضم هذا القسم حالياً الرقم 5، في قسم فرعي: سحابات طويلة منفصلة للجاكيتات والبلوزونات والمعاطف، وموديل برأسين ينفتح أيضاً من الأسفل للقطع الطويلة، وسحابات قصيرة غير منفصلة للمقلمات والحقائب الصغيرة والجيوب.',
        'قبل الطلب، تحقق في صفحة المنتج من الطول، والنوع (منفصل أو لا)، وشكل رأس السحاب، واللون. البيع في حزم من 50 أو 100 قطعة.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_fermeture-en-plastique-n-5_1782932843486',
    slug: 'fermeture-en-plastique-n-5',
    intro: {
      fr: "Fermetures plastique N°5 de 16 ou 75 cm, séparables ou non, curseur Half Tour ou double curseur : en lots de 50 ou 100 pièces.",
      ar: 'سحابات بلاستيك رقم 5 بطول 16 أو 75 سم، منفصلة أو غير منفصلة، برأس Half Tour أو برأسين: في حزم من 50 أو 100 قطعة.',
    },
    paragraphes: {
      fr: [
        "Toutes les fermetures de ce sous-rayon ont une maille N°5 en plastique injecté. Trois questions suffisent pour choisir.",
        "Quelle longueur ? En 75 cm, elles équipent les vestes, blousons, manteaux et sweats zippés. En 16 cm, elles vont sur les trousses, pochettes, porte-monnaie et poches.",
        "Séparable ou non ? Une fermeture séparable (Open-End, O/E) s'ouvre entièrement, comme sur une veste. Une fermeture non séparable (Closed-End, C/E) reste fermée en bas, comme sur une trousse. Le modèle à double curseur s'ouvre aussi par le bas : pratique pour les manteaux longs et les parkas.",
        "Quel curseur ? Le Half Tour a une tirette en demi-cercle, facile à saisir, même avec des gants. Un curseur autobloquant (Auto-Lock) reste en place. Vente par lots de 50 ou de 100 pièces.",
        FIN.fr,
      ],
      ar: [
        'كل سحابات هذا القسم رقم 5 بأسنان من البلاستيك المحقون. ثلاثة أسئلة تكفي للاختيار.',
        'ما الطول؟ بطول 75 سم تُركب على الجاكيتات والبلوزونات والمعاطف والسويتات بالسحاب. وبطول 16 سم على المقلمات والحقائب الصغيرة ومحافظ النقود والجيوب.',
        'منفصل أم لا؟ السحاب المنفصل (Open-End أو O/E) ينفتح كلياً كما في الجاكيت. والسحاب غير المنفصل (Closed-End أو C/E) يبقى مغلقاً من الأسفل كما في المقلمة. أما الموديل برأسين فينفتح أيضاً من الأسفل: مناسب للمعاطف الطويلة والباركات.',
        'أي رأس سحاب؟ رأس Half Tour له مقبض على شكل نصف دائرة، سهل المسك حتى بالقفازات. والرأس ذاتي القفل (Auto-Lock) يبقى في مكانه. البيع في حزم من 50 أو 100 قطعة.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'fermetures-metal',
    slug: 'fermetures-metal',
    intro: {
      fr: "Fermeture éclair à dents en laiton N°5, ruban pur coton, 75 cm, séparable, en sachet de 100 : pour blousons, manteaux, vestes en jean, sacs.",
      ar: 'سحاب بأسنان من النحاس الأصفر رقم 5، بشريط قطن خالص، 75 سم، منفصل، في كيس من 100 قطعة: للبلوزونات والمعاطف وجاكيتات الجينز والحقائب.',
    },
    paragraphes: {
      fr: [
        "La fermeture métal a des dents en métal : elle est solide et bien visible. On la pose sur les tissus épais et le cuir : manteaux d'hiver, blousons en cuir, parkas, vestes en jean, sacs de voyage et maroquinerie.",
        "Le modèle proposé a des dents en laiton, une maille N°5 et un ruban en pur coton. Il mesure 75 cm et il est séparable : il s'ouvre entièrement, comme sur une veste. Sa finition « black nickel » (nickel noir) lui donne une teinte sombre et résiste à l'oxydation.",
        "Pour choisir une fermeture métal, comparez la taille de la maille, la longueur, le type (séparable ou non) et la finition des dents. Ce modèle se vend en sachet de 100 pièces.",
        FIN.fr,
      ],
      ar: [
        'سحاب المعدن أسنانه من المعدن: متين وظاهر. يُركب على الأقمشة السميكة والجلد: معاطف الشتاء، والبلوزونات الجلدية، والباركات، وجاكيتات الجينز، وحقائب السفر، والمصنوعات الجلدية.',
        'الموديل المعروض أسنانه من النحاس الأصفر، رقم 5، بشريط من القطن الخالص. طوله 75 سم وهو منفصل: ينفتح كلياً كما في الجاكيت. لمسته «black nickel» (نيكل أسود) تعطيه لوناً داكناً وتقاوم التأكسد.',
        'لاختيار سحاب معدني، قارن رقم الأسنان، والطول، والنوع (منفصل أو لا)، وتشطيب الأسنان. هذا الموديل يُباع في كيس من 100 قطعة.',
        FIN.ar,
      ],
    },
  },

  // ─── Boutons, élastiques, rubans, accessoires ───────────────────────────────
  {
    id: 'boutons',
    slug: 'boutons',
    intro: {
      fr: "Boutons pression à ressort, boutons 2 trous en résine, moules de boutons à recouvrir et presse manuelle : en sachets et lots pour ateliers.",
      ar: 'أزرار الكبس بالنابض، وأزرار بثقبين من الراتنج، وقوالب أزرار تُكسى بالقماش، ومكبس يدوي: في أكياس وحزم للمعامل.',
    },
    paragraphes: {
      fr: [
        "Ce rayon réunit des boutons et le matériel pour les poser.",
        "Le bouton pression à ressort (type W, 15 mm, en fer) équipe les vestes, blousons, vêtements de travail, uniformes, sacs et pochettes. Il se vend en sachet de 1000 ensembles et se fixe par sertissage : le rayon propose une presse manuelle en fonte d'acier, à fixer sur l'établi, qui fonctionne avec des matrices universelles.",
        "Le bouton 2 trous en résine se coud : confection en atelier, uniformes, retouches et remplacement de boutons. Il se vend par 10 grosses, soit 1440 pièces. Sa taille est donnée en lignes (L) : vérifiez-la sur la fiche.",
        "Les moules en aluminium se recouvrent de tissu pour faire des boutons assortis : robes, chemisiers, manteaux, caftans, capitonnage de canapés, têtes de lit et salons marocains. Ils existent en 15, 18, 20 et 25 mm, par 1000 sets, et se montent avec une presse pour boutons recouverts, pas avec celle des boutons pression.",
        FIN.fr,
      ],
      ar: [
        'يضم هذا القسم الأزرار والأداة التي تُركب بها.',
        'زر الكبس بالنابض (نوع W، 15 مم، من الحديد) يُركب على الجاكيتات والبلوزونات وملابس العمل واللباس الموحد والحقائب الصغيرة. يُباع في كيس من 1000 طقم ويُثبت بالكبس: يقدم القسم مكبساً يدوياً من حديد الزهر، يُثبت على طاولة العمل، ويشتغل بقوالب (ماتريس) متعددة الاستعمالات.',
        'الزر بثقبين من الراتنج يُخاط: للخياطة في المعامل، واللباس الموحد، والإصلاحات وتعويض الأزرار. يُباع بـ 10 غروس، أي 1440 قطعة. مقاسه مكتوب بالخطوط (L): تحقق منه في صفحة المنتج.',
        'قوالب الألومنيوم تُكسى بالقماش لصنع أزرار من نفس قماش اللباس: للفساتين والقمصان النسائية والمعاطف والقفاطين، وكذلك لتنجيد الكنبات ورؤوس الأسرّة والصالونات المغربية. متوفرة بمقاسات 15 و18 و20 و25 مم، في حزم من 1000 طقم، وتُركب بمكبس خاص بالأزرار المكسوة، وليس بمكبس أزرار الكبس.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'elastiques',
    slug: 'elastiques',
    intro: {
      fr: "Élastique tressé en rouleau de 100 yards et sangles élastiques vertes pour canapés et fauteuils : pour la confection et la tapisserie.",
      ar: 'مطاط مضفور في لفة من 100 ياردة، وأحزمة مطاطية خضراء للكنبات والكراسي: للخياطة والتنجيد.',
    },
    paragraphes: {
      fr: [
        "Ce rayon sert deux métiers.",
        "Pour la confection, l'élastique tressé se passe dans une coulisse : ceintures de pantalons et de jupes, poignets, bas de manches, sous-vêtements, draps-housses, masques. Il retrouve sa forme après l'étirement. Il se vend au rouleau de 100 yards, soit environ 91 m, en blanc ou en noir ; les choix proposés sont sur la fiche.",
        "Pour la tapisserie d'ameublement, les sangles élastiques vertes forment le fond des assises et des dossiers : canapés, fauteuils, chaises rembourrées, banquettes. Elles se fixent avec des agrafes ou des clous. Deux largeurs : 4,8 cm en rouleau de 45 m, et 7 cm en rouleau de 40 m.",
        "Pour choisir, partez de l'usage, puis regardez la largeur et la longueur du rouleau.",
        FIN.fr,
      ],
      ar: [
        'يخدم هذا القسم حرفتين.',
        'في الخياطة، يُدخل المطاط المضفور في الممر (الكوليس): حزام السراويل والتنانير، وأساور الأكمام وأطرافها، والملابس الداخلية، وأغطية الأفرشة المطاطية، والكمامات. يرجع إلى شكله بعد الشد. يُباع في لفة من 100 ياردة، أي حوالي 91 م، بالأبيض أو الأسود؛ والاختيارات المتوفرة في صفحة المنتج.',
        'في تنجيد الأثاث، تشكل الأحزمة المطاطية الخضراء قاعدة المقاعد والظهور: الكنبات، والكراسي بذراعين، والكراسي المحشوة، والبنكات. تُثبت بالدبابيس (الأگراف) أو بالمسامير. عرضان: 4,8 سم في لفة من 45 م، و7 سم في لفة من 40 م.',
        'للاختيار، ابدأ بالاستعمال، ثم انظر إلى العرض وطول اللفة.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'biais-rubans',
    slug: 'biais-rubans',
    intro: {
      fr: "Ruban satin, ruban velours (moubra), biais passepoil à cordon, bande auto-agrippante (scratch) et ruban réfléchissant, en rouleaux et bobines.",
      ar: 'شريط ساتان، وشريط مخملي (موبرا)، وبياي بحبل داخلي، وشريط لاصق (سكراتش)، وشريط عاكس للضوء، في لفات وبكرات.',
    },
    paragraphes: {
      fr: [
        "Ce rayon réunit les rubans de finition et de décoration. Pour chacun, regardez sur la fiche la largeur, la longueur du rouleau et la couleur.",
        "Le ruban satin 25 mm, brillant et souple, sert aux nœuds, aux emballages cadeaux, à la décoration de fêtes et à la couture : pack de 10 rouleaux de 20 m. Le ruban velours, appelé moubra, garnit les tenues traditionnelles et les accessoires : rouleau de 100 yards, en plusieurs couleurs.",
        "Le biais passepoil de 10 mm, en polyester avec cordon intégré, se glisse entre deux tissus pour souligner une couture : coussins, bords de canapés, sacs, vestes, cols. Il se vend en bobine de 70 yards.",
        "La bande auto-agrippante, ou scratch, se coud ; rouleau de 25 yards, en 2,5 cm ou 5 cm. Le ruban réfléchissant, à coudre, équipe les vêtements de travail, les uniformes et les tenues de sport : rouleau de 100 m, en 3, 4 ou 5 cm.",
        FIN.fr,
      ],
      ar: [
        'يضم هذا القسم أشرطة التشطيب والزينة. لكل شريط، انظر في صفحة المنتج إلى العرض وطول اللفة واللون.',
        'شريط الساتان 25 مم، لامع ومرن، يُستعمل للفيونكات وتغليف الهدايا وتزيين الحفلات والخياطة: حزمة من 10 لفات، كل لفة 20 م. وشريط المخمل، المعروف بالموبرا، يزين الملابس التقليدية والإكسسوارات: لفة من 100 ياردة، بعدة ألوان.',
        'البياي (passepoil) بعرض 10 مم، من البوليستر بحبل داخلي، يوضع بين قطعتين من القماش لإبراز الخياطة: الوسائد، وحواشي الكنبات، والحقائب، والجاكيتات، والياقات. يُباع في بكرة من 70 ياردة.',
        'الشريط اللاصق (سكراتش) يُخاط، ويُباع في لفة من 25 ياردة، بعرض 2,5 سم أو 5 سم. والشريط العاكس للضوء، الذي يُخاط أيضاً، يُستعمل في ملابس العمل واللباس الموحد وملابس الرياضة: لفة من 100 م، بعرض 3 أو 4 أو 5 سم.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_accessoires-de-confection_1781638538209',
    slug: 'accessoires-de-confection',
    intro: {
      fr: "Petites fournitures et outils d'atelier : mètres ruban, coupe-fils, agrafes, anneaux de lingerie, épingles, attaches d'étiquettes, colle et spray.",
      ar: 'لوازم صغيرة وأدوات للمعمل: أمتار القياس، ومقصات الخيوط، ومشابك السراويل، وحلقات الملابس الداخلية، ودبابيس الأمان، ومشابك الإتيكيت، والغراء.',
    },
    paragraphes: {
      fr: [
        "Ce rayon regroupe les petites fournitures et les outils qui servent chaque jour en atelier.",
        "Pour mesurer et couper : mètres ruban de 150 cm et 1,9 cm de large, et coupe-fils, vendus par pack de 12 pour équiper plusieurs postes.",
        "Pour fermer et assembler : agrafes métalliques pour ceintures de pantalons et de jupes (sachet de 100 ensembles), anneaux ronds transparents de 10 mm pour bretelles de lingerie (sachet de 1000) et épingles à nourrice dorées (lot de 1728).",
        "Pour étiqueter : attaches transparentes pour pistolet à étiquettes, en boîte de 5000, de 1,5 à 5 cm de long.",
        "Pour coller : mini pistolet à colle chaude 20 W, livré avec 3 bâtons de colle, pour rubans, dentelles et strass ; adhésif temporaire en spray, qui tient un appliqué, un stabilisateur de broderie ou un patron en place le temps de coudre.",
        FIN.fr,
      ],
      ar: [
        'يضم هذا القسم اللوازم الصغيرة والأدوات التي يحتاجها المعمل كل يوم.',
        'للقياس والقص: أمتار القياس بطول 150 سم وعرض 1,9 سم، ومقصات الخيوط، تُباع في رزم من 12 قطعة لتجهيز عدة مواقع عمل.',
        'للإغلاق والتجميع: مشابك معدنية لأحزمة السراويل والتنانير (كيس من 100 طقم)، وحلقات دائرية شفافة 10 مم لحمالات الملابس الداخلية (كيس من 1000)، ودبابيس أمان ذهبية (1728 قطعة).',
        'للإتيكيت: مشابك شفافة لمسدس الإتيكيت، في علبة من 5000، بطول من 1,5 إلى 5 سم.',
        'للصق: مسدس غراء ساخن صغير 20 واط، مع 3 أصابع غراء، للأشرطة والدانتيل والستراس؛ ولاصق مؤقت بخاخ يثبت القطعة المضافة أو حشوة التطريز أو الباترون في مكانها أثناء الخياطة.',
        FIN.ar,
      ],
    },
  },

  // ─── Fil, doublure, tissus, entoilages ──────────────────────────────────────
  {
    // Rayon « Bobines de fil », enregistré sous l'ancien slug tissu-doublure
    id: 'cat_tissu-doublure_1779472078832',
    slug: 'tissu-doublure',
    intro: {
      fr: "Fil à coudre polyester 40/2, 40/3 et 20/3, en packs de bobines ou en bobine de 1 kg : pour la confection, les jeans et les vêtements de travail.",
      ar: 'خيط خياطة بوليستر 40/2 و40/3 و20/3، في حزم من البكرات أو في بكرة من 1 كغ: للخياطة والجينز وملابس العمل.',
    },
    paragraphes: {
      fr: [
        "Un fil se choisit d'après son numéro : 40/2, 40/3 ou 20/3. Le premier chiffre indique la finesse : plus il est petit, plus le fil est épais. Le second donne le nombre de brins retordus ensemble : un fil à 3 brins résiste mieux qu'un fil à 2 brins.",
        "Le 40/2 est le fil polyvalent : chemises, pantalons, robes, t-shirts, ourlets, retouches, pose de fermetures, linge de maison. Il se vend en pack de 12 bobines, en plusieurs couleurs, et en bobine de 1 kg pour la production en série.",
        "Le 40/3 et le 20/3 sont des fils forts pour les tissus épais et les coutures qui travaillent : jeans, vêtements de travail, sacs, ameublement. Le 20/3 est le plus épais des trois. Le 40/3 se vend en boîte de 12 bobines, le 20/3 en pack de 6 bobines de 350 g.",
        "Tous ces fils sont en polyester ; choisissez la couleur sur la fiche avant d'ajouter au panier.",
        FIN.fr,
      ],
      ar: [
        'يُختار الخيط حسب رقمه: 40/2 أو 40/3 أو 20/3. الرقم الأول يدل على الرقة: كلما كان أصغر كان الخيط أغلظ. والرقم الثاني هو عدد الفتلات المبرومة معاً: الخيط بثلاث فتلات أمتن من الخيط بفتلتين.',
        '40/2 هو الخيط لكل الاستعمالات: القمصان، والسراويل، والفساتين، والتيشيرتات، والحواشي، والإصلاحات، وتركيب السحابات، ومفروشات البيت. يُباع في حزمة من 12 بكرة بعدة ألوان، وفي بكرة من 1 كغ للإنتاج بكميات كبيرة.',
        '40/3 و20/3 خيوط قوية للأقمشة السميكة وللخياطة التي تتحمل الشد: الجينز، وملابس العمل، والحقائب، والأثاث. و20/3 هو الأغلظ بين الثلاثة. يُباع 40/3 في علبة من 12 بكرة، و20/3 في حزمة من 6 بكرات من 350 غ.',
        'كل هذه الخيوط من البوليستر. اختر اللون في صفحة المنتج قبل إضافته إلى السلة.',
        FIN.ar,
      ],
    },
  },
  {
    id: 'cat_doublure-taffeta_1788213522923',
    slug: 'doublure-taffeta',
    intro: {
      fr: "Doublures taffetas 170T et 210T en 150 cm de large, vendues au rouleau en plusieurs couleurs : pour vestes, manteaux, jupes, robes et sacs.",
      ar: 'بطانة تافتا 170T و210T بعرض 150 سم، تُباع باللفة وبعدة ألوان: للجاكيتات والمعاطف والتنانير والفساتين والحقائب.',
    },
    paragraphes: {
      fr: [
        "La doublure habille l'intérieur d'un vêtement ou d'un sac : elle cache les coutures, protège le tissu et rend le vêtement plus facile à enfiler.",
        "Le taffetas est une doublure en polyester, lisse et légère, qui résiste aux frottements. Le nombre suivi d'un T (170T, 210T) indique la densité du tissage : plus il est élevé, plus la toile est serrée.",
        "Le 170T sert à doubler vestes, manteaux, jupes et robes, ainsi que sacs, pochettes et bagages. Le 210T sert aux vestes, manteaux, blousons et uniformes, aux sacs, sacs à dos et valises.",
        "Les deux qualités font 150 cm de large et se vendent au rouleau. La longueur du rouleau et les couleurs disponibles sont indiquées sur chaque fiche.",
        FIN_ROULEAU.fr,
      ],
      ar: [
        'البطانة تكسو داخل اللباس أو الحقيبة: تخفي الخياطة، وتحمي القماش، وتجعل اللباس أسهل في اللبس.',
        'التافتا بطانة من البوليستر، ملساء وخفيفة، تتحمل الاحتكاك. الرقم المتبوع بحرف T (170T و210T) يدل على كثافة النسج: كلما ارتفع كان النسيج أكثر تراصاً.',
        '170T تُستعمل لتبطين الجاكيتات والمعاطف والتنانير والفساتين، وكذلك الحقائب والحقائب الصغيرة وحقائب السفر. و210T للجاكيتات والمعاطف والبلوزونات واللباس الموحد، وللحقائب وحقائب الظهر وحقائب السفر.',
        'الجودتان بعرض 150 سم وتُباعان باللفة. طول اللفة والألوان المتوفرة مكتوبة في صفحة كل منتج.',
        FIN_ROULEAU.ar,
      ],
    },
  },
  {
    // Rayon « Tissus », enregistré sous l'ancien slug fermetures-invisibles
    id: 'fermetures-invisibles',
    slug: 'fermetures-invisibles',
    intro: {
      fr: "Feutrine en 150 cm et tissu popeline 100 % polyester, vendus au rouleau : pour chemises, uniformes, maroquinerie, tapisserie et décoration.",
      ar: 'لباد بعرض 150 سم وقماش بوبلين 100% بوليستر، يُباعان باللفة: للقمصان واللباس الموحد والحقائب والتنجيد والديكور.',
    },
    paragraphes: {
      fr: [
        "Ce rayon propose des tissus vendus au rouleau entier, pour les ateliers qui produisent en série.",
        "La popeline 100 % polyester a un tissage fin et régulier ; elle est légère, résistante et facile d'entretien. Elle sert aux chemises, blouses, robes, uniformes scolaires, vêtements de travail et articles promotionnels. Elle se vend en rouleau de 50 m, en plusieurs couleurs à choisir sur la fiche.",
        "La feutrine est un non-tissé en polyester de 150 cm de large. Elle se coud, se colle et se découpe net, sans s'effilocher. On l'utilise en maroquinerie (doublures et renforts de sacs), en tapisserie, pour les chapeaux, les étuis, l'habillage de vitrines et les loisirs créatifs. Elle existe en plusieurs grammages, en noir ou en blanc : plus le grammage est élevé, plus la feutrine est épaisse.",
        FIN_ROULEAU.fr,
      ],
      ar: [
        'يقدم هذا القسم أقمشة تُباع باللفة الكاملة، للمعامل التي تنتج بكميات كبيرة.',
        'البوبلين 100% بوليستر نسجه رقيق ومنتظم، وهو خفيف ومتين وسهل الصيانة. يُستعمل للقمصان والبلوزات والفساتين واللباس المدرسي الموحد وملابس العمل والمنتجات الإشهارية. يُباع في لفة من 50 م، بعدة ألوان تختارها في صفحة المنتج.',
        'اللباد قماش غير منسوج من البوليستر بعرض 150 سم. يُخاط ويُلصق ويُقص بشكل نظيف دون أن يتنسّل. يُستعمل في صناعة الحقائب (بطانة وتقوية)، وفي التنجيد، وللقبعات، والعلب، وتزيين الواجهات، والأشغال اليدوية. يتوفر بعدة أوزان، بالأسود أو الأبيض: كلما كان الوزن أكبر كان اللباد أسمك.',
        FIN_ROULEAU.ar,
      ],
    },
  },
  {
    id: 'cat_entoilages-et-thermocollants-viseline_1786450695789',
    slug: 'entoilages-et-thermocollants-viseline',
    intro: {
      fr: "Entoilages thermocollants, non-tissés et crin (pastro), vendus au rouleau : pour donner de la tenue aux cols, poignets et devants de vestes.",
      ar: 'حشوات لاصقة بالحرارة (فازلين) وغير منسوجة، وحشوة الكرين (باسترو)، تُباع باللفة: لتقوية الياقات والأكمام وواجهات الجاكيتات.',
    },
    paragraphes: {
      fr: [
        "L'entoilage se pose sur l'envers du tissu pour lui donner de la tenue : cols, poignets, devants de vestes. L'entoilage thermocollant, appelé aussi viseline, se colle au fer chaud. Le crin (pastro) donne du maintien aux plastrons, cols et revers des vestes, costumes et manteaux.",
        "Pour choisir, regardez le grammage, en g/m² : le non-tissé de 27 g/m² est léger et garde la souplesse des tissus fins ; la 1040EF, d'environ 40 g/m², tient sans raidir ; la 1050HF, de 62 g/m², donne une tenue ferme. Vérifiez aussi la largeur (90 ou 150 cm) et la couleur : le noir existe pour certains articles.",
        "Les entoilages se vendent au rouleau ; la longueur est indiquée sur chaque fiche. Ils sont classés en deux sous-rayons : renfort et broderie.",
        FIN_ROULEAU.fr,
      ],
      ar: [
        'الحشوة توضع على ظهر القماش لتعطيه التماسك: الياقات، والأكمام، وواجهات الجاكيتات. الحشوة اللاصقة بالحرارة، المعروفة بالفازلين، تُلصق بالمكواة الساخنة. أما الكرين (باسترو) فيعطي التماسك لصدور الجاكيتات والبدلات والمعاطف ولياقاتها وطيّاتها.',
        'للاختيار، انظر إلى الوزن بالغرام في المتر المربع: الحشوة غير المنسوجة 27 غ/م² خفيفة وتحافظ على ليونة الأقمشة الرقيقة؛ و1040EF، حوالي 40 غ/م²، تعطي التماسك بدون صلابة؛ و1050HF، 62 غ/م²، تعطي تماسكاً قوياً. وتحقق أيضاً من العرض (90 أو 150 سم) ومن اللون: الأسود متوفر لبعض المنتجات.',
        'تُباع الحشوات باللفة، وطول اللفة مكتوب في صفحة كل منتج. وهي مرتبة في قسمين فرعيين: التقوية والتطريز.',
        FIN_ROULEAU.ar,
      ],
    },
  },
  {
    id: 'cat_entoilage-non-tisse-pour-renfort_1788375299484',
    slug: 'entoilage-non-tisse-pour-renfort',
    intro: {
      fr: "Entoilages non-tissés blancs de 27 et 62 g/m² en rouleau de 100 yards, et crin (pastro) en 50 m : pour cols, poignets, devants de vestes.",
      ar: 'حشوات غير منسوجة بيضاء 27 و62 غ/م² في لفة من 100 ياردة، وكرين (باسترو) في 50 م: للياقات والأكمام وواجهات الجاكيتات.',
    },
    paragraphes: {
      fr: [
        "Un entoilage de renfort donne de la tenue au tissu. Ce sous-rayon propose trois produits, du plus léger au plus ferme.",
        "L'entoilage non-tissé blanc de 27 g/m² est très léger : il renforce les cols et poignets des chemises, blouses et robes, et sert aussi de stabilisateur pour la broderie machine. Rouleau de 100 yards, 90 cm de large.",
        "La viseline 1050HF, thermocollante, pèse 62 g/m² : elle donne une tenue ferme aux cols, poignets et devants de vestes, et stabilise les doublures et fonds de sacs. Rouleau de 100 yards, 90 cm de large, blanc.",
        "Le crin (pastro), non-tissé lui aussi, tient les plastrons, devants, cols et revers des vestes, costumes et manteaux. Rouleau de 50 m. Pour un tissu fin, prenez le plus léger ; pour une pièce qui doit garder sa forme, la 1050HF ou le crin.",
        FIN_ROULEAU.fr,
      ],
      ar: [
        'حشوة التقوية تعطي التماسك للقماش. يضم هذا القسم ثلاثة منتجات، من الأخف إلى الأقوى.',
        'الحشوة غير المنسوجة البيضاء 27 غ/م² خفيفة جداً: تقوي ياقات وأكمام القمصان والبلوزات والفساتين، وتُستعمل أيضاً لتثبيت القماش في التطريز بالآلة. لفة من 100 ياردة، بعرض 90 سم.',
        'فازلين 1050HF، لاصقة بالحرارة، وزنها 62 غ/م²: تعطي تماسكاً قوياً للياقات والأكمام وواجهات الجاكيتات، وتثبت بطانات الحقائب وقيعانها. لفة من 100 ياردة، بعرض 90 سم، بيضاء.',
        'الكرين (باسترو)، وهو أيضاً غير منسوج، يعطي التماسك لصدور وواجهات وياقات وطيّات الجاكيتات والبدلات والمعاطف. لفة من 50 م. للقماش الرقيق اختر الأخف؛ وللقطعة التي يجب أن تحافظ على شكلها، اختر 1050HF أو الكرين.',
        FIN_ROULEAU.ar,
      ],
    },
  },
  {
    id: 'cat_entoilage-non-tisse-pour-broderie_1788374280642',
    slug: 'entoilage-non-tisse-pour-broderie',
    intro: {
      fr: "Viseline 1040EF : entoilage non-tissé thermocollant d'environ 40 g/m², en 150 cm de large et rouleau de 90 yards, blanc ou noir.",
      ar: 'فازلين 1040EF: حشوة غير منسوجة لاصقة بالحرارة، حوالي 40 غ/م²، بعرض 150 سم وفي لفة من 90 ياردة، بيضاء أو سوداء.',
    },
    paragraphes: {
      fr: [
        "Pour broder, le tissu doit rester bien à plat : un entoilage non-tissé posé sur l'envers l'empêche de plisser ou de se déformer pendant le travail.",
        "La viseline 1040EF est un entoilage non-tissé thermocollant : elle se fixe au fer chaud. Avec environ 40 g/m², elle apporte du maintien sans rendre le tissu raide. Sa fiche l'indique pour les cols, poignets et pattes de boutonnage de chemises, les devants de vêtements, les uniformes et les vêtements traditionnels.",
        "Elle se vend en rouleau de 90 yards, en 150 cm de large, en blanc ou en noir : le noir pour un tissu foncé, le blanc pour un tissu clair.",
        "Pour un tissu très fin, l'entoilage non-tissé de 27 g/m², plus léger, se trouve dans le sous-rayon renfort. Pour tenir le stabilisateur en place, l'adhésif temporaire en spray est dans les accessoires de confection.",
        FIN_ROULEAU.fr,
      ],
      ar: [
        'عند التطريز، يجب أن يبقى القماش مسطحاً: حشوة غير منسوجة توضع على ظهره تمنعه من التجعد أو التشوه أثناء العمل.',
        'فازلين 1040EF حشوة غير منسوجة لاصقة بالحرارة: تُثبت بالمكواة الساخنة. بوزن حوالي 40 غ/م²، تعطي التماسك بدون أن تجعل القماش صلباً. وصفحتها تذكر استعمالها لياقات وأكمام وأشرطة أزرار القمصان، وواجهات الملابس، واللباس الموحد، والملابس التقليدية.',
        'تُباع في لفة من 90 ياردة، بعرض 150 سم، بالأبيض أو الأسود: الأسود للقماش الداكن، والأبيض للقماش الفاتح.',
        'للقماش الرقيق جداً، توجد الحشوة غير المنسوجة 27 غ/م²، وهي أخف، في قسم التقوية. ولتثبيت الحشوة في مكانها، يوجد اللاصق المؤقت البخاخ في قسم لوازم الخياطة.',
        FIN_ROULEAU.ar,
      ],
    },
  },
];

// Le texte d'un rayon : par son identifiant, sinon par son slug Firestore. null s'il n'en a pas.
export function texteRayon(rayon: Pick<ShopCategory, 'id' | 'slug'> | null | undefined): TexteRayon | null {
  if (!rayon) return null;
  return TEXTES_RAYONS.find(t => t.id === rayon.id) ?? TEXTES_RAYONS.find(t => t.slug === rayon.slug) ?? null;
}

// Phrase d'introduction dans la langue voulue ('' si le rayon n'a pas de texte)
export function introRayon(rayon: Pick<ShopCategory, 'id' | 'slug'> | null | undefined, langue: Language): string {
  return texteRayon(rayon)?.intro[langue] ?? '';
}

// Texte complet, paragraphe par paragraphe ([] si le rayon n'a pas de texte)
export function paragraphesRayon(rayon: Pick<ShopCategory, 'id' | 'slug'> | null | undefined, langue: Language): string[] {
  return texteRayon(rayon)?.paragraphes[langue] ?? [];
}
