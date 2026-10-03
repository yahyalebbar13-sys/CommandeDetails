// Secteurs d'activité de la boutique (03/10/2026), sur le modèle des « scénarios » d'un
// grossiste : une page par métier (tapissier, couture traditionnelle, atelier de
// confection…), qui réunit les familles d'articles utiles à ce métier.
//
// Pour chaque secteur : son adresse (/shop/secteurs/<slug>, /ar/shop/secteurs/<slug>),
// son nom, une accroche (120 caractères au plus), un texte de présentation, ses familles
// d'articles et le message WhatsApp prérempli de la demande de devis.
// Les produits d'une famille ne sont pas une liste figée : une règle les choisit dans le
// catalogue visible (sans les produits sans prix, déjà filtrés par la boutique), d'après
// les mots du nom français du produit et ses rayons. Un produit ajouté dans l'admin avec
// le bon nom rejoint donc son secteur tout seul.
// Règles d'écriture des textes : rien que ce que disent les fiches (aucun chiffre ni
// caractéristique inventés), pas de superlatifs, le transporteur n'est jamais nommé,
// aucune livraison offerte. Quand les produits d'un secteur changent, relire son texte.
// Fonctions pures, sans rien de « client » : partagées par le navigateur et le serveur
// (étiquettes Google, plan du site, vraie 404).

import { trouverRayon } from './catalogue-boutique';
import { decoderParametre, lienPage, slugifier, type LangueLien } from './liens-boutique';
import type { ShopCategory, ShopProduct } from './shop-types';

export type Bilingue<T = string> = Record<LangueLien, T>;

// ─── Règle de choix des produits ────────────────────────────────────────────
// Les mots s'écrivent en minuscules, sans accents ni ponctuation (« 40/2 » → « 40 2 »,
// « auto-agrippante » → « auto agrippant »). Ils se cherchent en mots entiers dans le nom
// français du produit, avec une fin de pluriel ou de féminin tolérée (e, s, es, x) :
// « fermeture » trouve « fermetures », « elastique » trouve « elastiques ».
export interface RegleProduits {
  /** Au moins un de ces mots ou expressions dans le nom du produit… */
  mots?: readonly string[];
  /** …ou un produit rangé dans un de ces rayons (slug Firestore), ou dans un de leurs sous-rayons */
  rayons?: readonly string[];
  /** Et tous ces mots dans le nom */
  avec?: readonly string[];
  /** Et aucun de ces mots dans le nom */
  sauf?: readonly string[];
  /** Et aucun produit de ces rayons (slug Firestore) */
  saufRayons?: readonly string[];
  /** Produits pris en plus, quoi que disent les mots (identifiant du catalogue) */
  ids?: readonly string[];
}

export interface FamilleSecteur {
  /** Ancre de la section sur la page (#sangles) */
  cle: string;
  nom: Bilingue;
  regle: RegleProduits;
}

export interface Secteur {
  /** Morceau d'adresse, en lettres latines : le même en français et en arabe */
  slug: string;
  nom: Bilingue;
  /** Titre pour Google (complété par « | LEBTEX ») */
  titreGoogle: Bilingue;
  /** Une phrase, 120 caractères au plus : carte, bandeau, description pour Google */
  accroche: Bilingue;
  /** Paragraphes : le premier toujours visible, les autres derrière « Lire la suite » */
  presentation: Bilingue<readonly string[]>;
  familles: readonly FamilleSecteur[];
  /** Début du message WhatsApp de la demande de devis */
  devis: Bilingue;
}

// Un secteur n'est montré qu'à partir de ce nombre de produits (avec prix)
export const MIN_PRODUITS_SECTEUR = 3;

// Les produits qui ne vont pas dans l'élastique de confection
const SANGLES = ['sangle', 'tapissier', 'canape'] as const;

// Ce qui n'est pas une fermeture, malgré « plastique » ou « résine » dans son nom
// (boutons en résine, pistolet et attaches d'étiquettes en plastique)
const PAS_FERMETURE = ['bouton', 'pistolet', 'attache', 'etiquette'] as const;

// Dernière phrase des présentations : livraison et retrait, le même discours que la FAQ et
// que les textes des rayons (lib/textes-rayons). Les secteurs qui vendent du tissu au
// rouleau (feutrine, doublures, entoilages, popeline) prennent la phrase des rayons de
// rouleaux (FIN_ROULEAU de lib/textes-rayons, à garder pareille) : un rouleau entier de
// tissu part par un transport organisé au téléphone.
const FIN: Bilingue = {
  fr: 'Livraison partout au Maroc, retrait gratuit à Casablanca.',
  ar: 'التوصيل لجميع مدن المغرب، والاستلام مجاني في الدار البيضاء.',
};
const FIN_ROULEAU: Bilingue = {
  fr: 'Livraison partout au Maroc ; pour un rouleau entier de tissu, nous vous appelons pour organiser le transport. Retrait toujours gratuit à Casablanca.',
  ar: 'التوصيل لجميع مدن المغرب؛ وبالنسبة للفة الكاملة من القماش، نتصل بك لترتيب النقل. الاستلام دائماً مجاني في الدار البيضاء.',
};

// ─── Les secteurs, dans l'ordre d'affichage ─────────────────────────────────

export const SECTEURS: readonly Secteur[] = [
  // ─── Tapisserie (demandé en premier, 03/10/2026) ────────────────────────────
  {
    slug: 'tapisserie-et-canapes',
    nom: { fr: 'Tapisserie et canapés', ar: 'التنجيد والكنبات' },
    titreGoogle: { fr: 'Fournitures de tapisserie et canapés', ar: 'لوازم التنجيد والكنبات' },
    accroche: {
      fr: 'Sangles, fermeture au mètre, boutons à recouvrir, passepoil, feutrine : les fournitures du tapissier.',
      ar: 'السانغل، والسحاب المتصل، وقوالب الأزرار، والبياي، واللباد: لوازم الطابسري.',
    },
    presentation: {
      fr: [
        'Canapé, fauteuil, banquette ou salon marocain : LEBTEX vend aux tapissiers les fournitures pour les fabriquer ou les refaire, au rouleau et en lots.',
        "Le fond de l'assise se fait avec des sangles de 4,8 cm, en rouleau de 45 m, ou de 7 cm, en rouleau de 40 m. Pour les housses et les coussins déhoussables, la fermeture nylon N°5 au mètre, en rouleau de 200 m, se coupe à la longueur voulue et se monte avec des curseurs N°5, vendus par 500.",
        `Pour le capitonnage, les moules de boutons à recouvrir (de 15 à 25 mm, par 1000 sets) prennent le tissu du canapé. Le biais passepoil borde les coussins. Complétez avec la feutrine en 150 cm, le scratch, un fil fort 20/3 ou 40/3 et un pistolet à colle pour les galons. ${FIN_ROULEAU.fr}`,
      ],
      ar: [
        'لصنع أو تجديد كنبة أو كرسي بذراعين أو سدّاري أو صالون مغربي، هذه هي اللوازم التي تبيعها LEBTEX للطابسرية، باللفة وبالحزمة.',
        'قاعدة المقعد تُصنع بالأحزمة (السانغل): بعرض 4,8 سم في لفة من 45 م، أو بعرض 7 سم في لفة من 40 م. ولأغطية الكنبات والوسائد التي تُنزع، يُقص سحاب النايلون المتصل رقم 5، في لفة من 200 م، حسب الطول المطلوب، وتُركب عليه رؤوس سحاب رقم 5، تُباع في حزمة من 500.',
        `وللكابيتوناج، تُكسى قوالب الأزرار (من 15 إلى 25 مم، في حزم من 1000 طقم) بقماش الكنبة. والبياي يزيّن حواشي الوسائد. وأكمل باللباد بعرض 150 سم، والسكراتش، وخيط قوي 20/3 أو 40/3، ومسدس الغراء لتثبيت الگالون. ${FIN_ROULEAU.ar}`,
      ],
    },
    familles: [
      {
        cle: 'sangles',
        nom: { fr: 'Sangles de canapé', ar: 'أحزمة الكنبات (السانغل)' },
        regle: { mots: ['sangle'] },
      },
      {
        cle: 'fermetures-housses',
        nom: { fr: 'Fermeture au mètre et curseurs', ar: 'السحاب المتصل ورؤوسه' },
        regle: {
          mots: ['fermeture continue', 'long chain'],
          rayons: ['rouleau-fermeture-en-nylon', 'curseur-pour-fermeture-en-nylon'],
        },
      },
      {
        cle: 'capitonnage',
        nom: { fr: 'Capitonnage et passepoil', ar: 'الكابيتوناج والبياي' },
        regle: { mots: ['a recouvrir', 'moule', 'passepoil'] },
      },
      {
        cle: 'feutrine-scratch',
        nom: { fr: 'Feutrine et scratch', ar: 'اللباد والسكراتش' },
        regle: { mots: ['feutrine', 'auto agrippant', 'scratch', 'velcro'] },
      },
      {
        cle: 'fil-colle',
        nom: { fr: 'Fil fort et colle', ar: 'خيط قوي وغراء' },
        regle: { mots: ['20 3', '40 3', 'pistolet a colle'] },
      },
      {
        // Vide tant que les aiguilles courbes de tapissier n'ont pas de prix
        cle: 'aiguilles',
        nom: { fr: 'Aiguilles de tapissier', ar: 'إبر الطابسري' },
        regle: { mots: ['aiguille'], avec: ['tapissier'] },
      },
    ],
    devis: {
      fr: 'Bonjour LEBTEX, je suis tapissier et je voudrais un devis pour : ',
      ar: 'السلام عليكم LEBTEX، أنا طابسري وأريد عرض سعر لـ: ',
    },
  },

  // ─── Couture traditionnelle ─────────────────────────────────────────────────
  {
    slug: 'caftan-djellaba-et-takchita',
    nom: { fr: 'Caftan, djellaba et takchita', ar: 'القفطان والجلابة والتكشيطة' },
    titreGoogle: { fr: 'Mercerie pour caftan, djellaba et takchita', ar: 'خردوات القفطان والجلابة والتكشيطة' },
    accroche: {
      fr: 'Fil 40/2, moubra, ruban satin, boutons, fermetures invisibles, entoilage et doublure pour la couture traditionnelle.',
      ar: 'خيط 40/2، والموبرا، وشريط الساتان، والأزرار، والسحابات المخفية، والحشوة والبطانة للخياطة التقليدية.',
    },
    presentation: {
      fr: [
        'Caftan, djellaba et takchita se cousent avec des fournitures fines, assorties au tissu. LEBTEX les vend en packs et au rouleau aux tailleurs et aux ateliers de couture traditionnelle.',
        'Le fil polyester 40/2 sert aux coutures courantes : pack de 12 bobines en plusieurs couleurs, ou bobine de 1 kg. Pour les finitions, le ruban velours (moubra) se vend en rouleau de 100 yards, le ruban satin 25 mm en pack de 10 rouleaux de 20 m, et le biais passepoil à cordon en bobine de 70 yards.',
        `Pour fermer : moules de boutons à recouvrir de tissu, boutons pression, boutons en résine et fermetures invisibles N°3 de 20 cm, par 100. Pour la tenue et l'intérieur : la viseline thermocollante, dont la 1040EF, indiquée pour les vêtements traditionnels, et les doublures taffetas en 150 cm. ${FIN_ROULEAU.fr}`,
      ],
      ar: [
        'القفطان والجلابة والتكشيطة تُخاط بلوازم رقيقة تتماشى مع القماش. تبيعها LEBTEX في حزم وباللفة، للخياطين ومعامل الخياطة التقليدية.',
        'خيط البوليستر 40/2 للخياطة العادية: حزمة من 12 بكرة بعدة ألوان، أو بكرة من 1 كغ. وللتشطيب، شريط المخمل (الموبرا) في لفة من 100 ياردة، وشريط الساتان 25 مم في حزمة من 10 لفات من 20 م، والبياي بحبل داخلي في بكرة من 70 ياردة.',
        `وللإغلاق: قوالب الأزرار التي تُكسى بالقماش، وأزرار الكبس، وأزرار الراتنج، والسحابات المخفية رقم 3 بطول 20 سم، في حزمة من 100. ولتقوية القماش وتبطينه: الفازلين اللاصق حرارياً، ومنه 1040EF المناسب للملابس التقليدية، وبطانة التافتا بعرض 150 سم. ${FIN_ROULEAU.ar}`,
      ],
    },
    familles: [
      {
        cle: 'fil',
        nom: { fr: 'Fil à coudre 40/2', ar: 'خيط الخياطة 40/2' },
        regle: { mots: ['40 2'] },
      },
      {
        cle: 'finitions',
        nom: { fr: 'Moubra, satin et passepoil', ar: 'الموبرا والساتان والبياي' },
        regle: { mots: ['moubra', 'velvet', 'velours', 'satin', 'passepoil'] },
      },
      {
        cle: 'boutons',
        nom: { fr: 'Boutons', ar: 'الأزرار' },
        regle: { mots: ['bouton'], sauf: ['presse'] },
      },
      {
        cle: 'fermetures-invisibles',
        nom: { fr: 'Fermetures invisibles', ar: 'السحابات المخفية' },
        regle: { mots: ['invisible'], avec: ['fermeture'] },
      },
      {
        cle: 'entoilage-doublure',
        nom: { fr: 'Entoilage et doublure', ar: 'الحشوة والبطانة' },
        regle: { mots: ['viseline', 'entoilage', 'doublure', 'taffeta'], sauf: ['crin', 'pastro'] },
      },
      {
        // Vide tant que l'applicateur de strass (« tenues traditionnelles » sur sa fiche)
        // n'a pas de prix
        cle: 'strass',
        nom: { fr: 'Pose de strass', ar: 'تركيب الستراس' },
        regle: { mots: ['strass'] },
      },
    ],
    devis: {
      fr: 'Bonjour LEBTEX, je couds des caftans et des djellabas et je voudrais un devis pour : ',
      ar: 'السلام عليكم LEBTEX، أخيط القفاطين والجلابات وأريد عرض سعر لـ: ',
    },
  },

  // ─── Ateliers de confection ─────────────────────────────────────────────────
  {
    slug: 'confection-et-pret-a-porter',
    nom: { fr: 'Confection et prêt-à-porter', ar: 'الخياطة والملابس الجاهزة' },
    titreGoogle: { fr: 'Fournitures pour ateliers de confection', ar: 'لوازم معامل الخياطة والملابس الجاهزة' },
    accroche: {
      fr: 'Fermetures en lots, fils, élastique, boutons, entoilages, doublures et outils pour les ateliers de confection.',
      ar: 'سحابات بالحزمة، وخيوط، ومطاط، وأزرار، وحشوات، وبطانة، وأدوات لمعامل الخياطة.',
    },
    presentation: {
      fr: [
        'Un atelier de confection achète en quantité. LEBTEX vend ses fournitures en lots, en packs et au rouleau, au prix affiché.',
        'Les fermetures se vendent par lots de 50 ou 100 pièces : nylon N°3 pour jupes, robes et pantalons, nylon N°5 pour vestes, sweats et blousons, plastique et laiton N°5 pour manteaux, parkas et poches. Le fil polyester 40/2 couvre les coutures courantes, en pack de 12 bobines ou en bobine de 1 kg ; le 40/3 et le 20/3 tiennent les tissus épais et les jeans.',
        `Complétez avec l'élastique tressé en rouleau de 100 yards, les boutons pression ou en résine, les agrafes de pantalon, les entoilages et les doublures au rouleau, et l'équipement des postes : coupe-fils et mètres ruban par 12, épingles. Pour une grosse quantité, demandez un prix sur WhatsApp. ${FIN_ROULEAU.fr}`,
      ],
      ar: [
        'معمل الخياطة يشتري بالكمية. تبيع LEBTEX لوازمها في حزم وباللفة، بالثمن المعروض في صفحة كل منتج.',
        'تُباع السحابات في حزم من 50 أو 100 قطعة: النايلون رقم 3 للتنانير والفساتين والسراويل، والنايلون رقم 5 للجاكيتات والسويتات والبلوزونات، والبلاستيك والنحاس الأصفر رقم 5 للمعاطف والباركات والجيوب. خيط البوليستر 40/2 للخياطة العادية، في حزمة من 12 بكرة أو بكرة من 1 كغ؛ أما 40/3 و20/3 فللأقمشة الغليظة والجينز.',
        `وأكمل بالمطاط المضفور في لفة من 100 ياردة، وأزرار الكبس أو الراتنج، ومشابك السراويل، والحشوات والبطانة باللفة، وأدوات المعمل: مقصات الخيوط وأمتار القياس في حزم من 12، ودبابيس الأمان. للكميات الكبيرة اطلب الثمن عبر واتساب. ${FIN_ROULEAU.ar}`,
      ],
    },
    familles: [
      {
        cle: 'fermetures-nylon',
        nom: { fr: 'Fermetures nylon N°3 et N°5', ar: 'سحابات النايلون رقم 3 ورقم 5' },
        regle: {
          mots: ['nylon'],
          avec: ['fermeture'],
          sauf: ['continue', 'plastique', 'delrin'],
          saufRayons: ['curseur-pour-fermeture-en-nylon', 'rouleau-fermeture-en-nylon'],
        },
      },
      {
        // Plastique (dont le lot Delrin rangé dans un rayon nylon) et laiton : manteaux,
        // parkas, blousons, poches (applications de leurs fiches)
        cle: 'fermetures-plastique-metal',
        nom: { fr: 'Fermetures plastique et métal', ar: 'سحابات البلاستيك والمعدن' },
        regle: {
          mots: ['plastique', 'resine', 'resign', 'delrin', 'laiton'],
          rayons: ['fermetures-resine', 'fermetures-metal'],
          sauf: PAS_FERMETURE,
        },
      },
      {
        cle: 'fils',
        nom: { fr: 'Fils à coudre', ar: 'خيوط الخياطة' },
        regle: { mots: ['fil'], sauf: ['coupe fil'] },
      },
      {
        cle: 'elastique',
        nom: { fr: 'Élastique', ar: 'المطاط' },
        regle: { mots: ['elastique'], sauf: SANGLES },
      },
      {
        cle: 'boutons-agrafes',
        nom: { fr: 'Boutons et agrafes', ar: 'الأزرار والمشابك' },
        regle: { mots: ['bouton', 'agrafe'] },
      },
      {
        cle: 'entoilages-doublures',
        nom: { fr: 'Entoilages et doublures', ar: 'الحشوات والبطانة' },
        regle: { mots: ['viseline', 'entoilage', 'doublure', 'taffeta', 'crin'] },
      },
      {
        cle: 'outils',
        nom: { fr: 'Outils des postes de travail', ar: 'أدوات المعمل' },
        // Aiguilles et roulette de traçage : rangées ici dès qu'elles auront un prix ; les
        // aiguilles de tapissier vont à la tapisserie
        regle: {
          mots: ['coupe fil', 'ciseau', 'metre ruban', 'metres ruban', 'epingle', 'aiguille', 'roulette'],
          sauf: ['tapissier'],
        },
      },
    ],
    devis: {
      fr: "Bonjour LEBTEX, j'ai un atelier de confection et je voudrais un devis pour : ",
      ar: 'السلام عليكم LEBTEX، عندي معمل خياطة وأريد عرض سعر لـ: ',
    },
  },

  // ─── Vêtements de travail, uniformes, sport ─────────────────────────────────
  {
    slug: 'vetements-de-travail-uniformes-et-sport',
    nom: { fr: 'Vêtements de travail, uniformes et sport', ar: 'ملابس العمل واللباس الموحد والرياضة' },
    titreGoogle: {
      fr: 'Mercerie pour vêtements de travail et uniformes',
      ar: 'لوازم ملابس العمل واللباس الموحد والرياضة',
    },
    accroche: {
      fr: 'Ruban réfléchissant, scratch, fermetures plastique, boutons pression, fil fort : pour tenues de travail et de sport.',
      ar: 'شريط عاكس، وسكراتش، وسحابات بلاستيك، وأزرار كبس، وخيط قوي: لملابس العمل والرياضة.',
    },
    presentation: {
      fr: [
        'Bleus de travail, blouses, uniformes scolaires, tenues de sport : ces vêtements sont lavés souvent. Voici les fournitures LEBTEX qui leur conviennent.',
        // « Séparable » : seules les fiches Halftour et Delrin le disent (Open-End) ; la
        // fiche du modèle à double curseur dit « bidirectionnelle », le lot de 16 cm « non
        // séparable » (poches)
        "Le ruban réfléchissant à coudre, en rouleau de 100 m et en 3, 4 ou 5 cm de large, rend la tenue visible la nuit. La bande auto-agrippante (scratch), en 2,5 ou 5 cm, ferme les poches et les pattes. Les fermetures plastique Halftour 75 cm et Delrin 70 cm sont séparables : elles s'ouvrent entièrement, comme sur une veste. Le modèle à double curseur s'ouvre dans les deux sens ; celui de 16 cm va aux poches.",
        `Ajoutez l'élastique tressé, les boutons pression à ressort et leur presse manuelle, un fil fort 20/3 ou 40/3, la popeline polyester en rouleau de 50 m pour les uniformes et la doublure 210T pour les vestes. ${FIN_ROULEAU.fr}`,
      ],
      ar: [
        'ملابس العمل، والوزرات، واللباس المدرسي الموحد، وملابس الرياضة: تُغسل كثيراً. هذه لوازم LEBTEX المناسبة لها.',
        'الشريط العاكس للضوء، الذي يُخاط، في لفة من 100 م وبعرض 3 أو 4 أو 5 سم، يجعل اللباس ظاهراً في الليل. والشريط اللاصق (سكراتش)، بعرض 2,5 أو 5 سم، يغلق الجيوب والألسنة. وسحابات البلاستيك «هاف تور» بطول 75 سم و«ديلرين» بطول 70 سم منفصلة: تنفتح بالكامل كما في الجاكيت. والنموذج برأسين ينفتح في الاتجاهين؛ وسحاب 16 سم للجيوب.',
        `وأضف المطاط المضفور، وأزرار الكبس بالنابض مع المكبس اليدوي، وخيطاً قوياً 20/3 أو 40/3، وقماش البوبلين البوليستر في لفة من 50 م للزي الموحد، وبطانة 210T للجاكيتات. ${FIN_ROULEAU.ar}`,
      ],
    },
    familles: [
      {
        cle: 'reflechissant-scratch',
        nom: { fr: 'Ruban réfléchissant et scratch', ar: 'الشريط العاكس والسكراتش' },
        regle: { mots: ['reflechissant', 'auto agrippant', 'scratch', 'velcro'] },
      },
      {
        // Séparables (Halftour, Delrin), à double curseur, et le lot de 16 cm pour les poches
        // (sa fiche : « poches de pantalons de travail ») ; pas les boutons en résine ni le
        // pistolet d'attaches « plastiques »
        cle: 'fermetures-plastique',
        nom: { fr: 'Fermetures plastique N°5', ar: 'سحابات البلاستيك رقم 5' },
        regle: {
          mots: ['plastique', 'resine', 'resign', 'delrin'],
          rayons: ['fermetures-resine'],
          sauf: PAS_FERMETURE,
        },
      },
      {
        cle: 'elastique-pression',
        nom: { fr: 'Élastique et boutons pression', ar: 'المطاط وأزرار الكبس' },
        regle: { mots: ['elastique', 'pression'], sauf: SANGLES },
      },
      {
        cle: 'fil-fort',
        nom: { fr: 'Fil fort', ar: 'خيط قوي' },
        regle: { mots: ['20 3', '40 3'] },
      },
      {
        cle: 'tissu-doublure',
        nom: { fr: 'Popeline et doublure', ar: 'البوبلين والبطانة' },
        regle: { mots: ['popeline', '210t'] },
      },
    ],
    devis: {
      fr: 'Bonjour LEBTEX, je fabrique des vêtements de travail et des uniformes et je voudrais un devis pour : ',
      ar: 'السلام عليكم LEBTEX، أصنع ملابس العمل واللباس الموحد وأريد عرض سعر لـ: ',
    },
  },

  // ─── Lingerie, enfants ──────────────────────────────────────────────────────
  {
    slug: 'lingerie-et-vetements-d-enfants',
    nom: { fr: "Lingerie et vêtements d'enfants", ar: 'الملابس الداخلية وملابس الأطفال' },
    titreGoogle: { fr: "Fournitures pour lingerie et vêtements d'enfants", ar: 'لوازم الملابس الداخلية وملابس الأطفال' },
    accroche: {
      fr: "Élastique tressé, anneaux transparents, ruban satin et boutons pression pour la lingerie et les vêtements d'enfants.",
      ar: 'مطاط مضفور، وحلقات شفافة، وشريط ساتان، وأزرار كبس للملابس الداخلية وملابس الأطفال.',
    },
    presentation: {
      fr: [
        "Soutiens-gorge, nuisettes, maillots de bain, pyjamas, vêtements de bébé et d'enfant : ces pièces demandent des fournitures souples et discrètes.",
        "L'élastique tressé se passe dans une coulisse : ceintures, poignets, bas de manches, sous-vêtements. Il se vend en rouleau de 100 yards, soit environ 91 m, en blanc ou en noir. Les anneaux ronds transparents de 10 mm, en sachet de 1000, règlent les bretelles de lingerie sans se voir. Le ruban satin 25 mm, en pack de 10 rouleaux de 20 m, sert aux nœuds et aux finitions.",
        // Bouton pression 15 mm type W : sa fiche cite vestes, blousons, uniformes et sacs,
        // pas la lingerie ; d'où « vestes et blousons d'enfants »
        `Pour les vestes et blousons d'enfants, les boutons pression à ressort de 15 mm se posent avec la presse manuelle, sans couture. La couleur se choisit sur la fiche quand il y en a plusieurs. ${FIN.fr}`,
      ],
      ar: [
        'حمالات الصدر، وقمصان النوم، وملابس السباحة، والبيجامات، وملابس الرضع والأطفال: تحتاج هذه القطع إلى لوازم مرنة لا تظهر.',
        'المطاط المضفور يُدخل في الممر (الكوليس): حزام السراويل والتنانير، والمعاصم، وأطراف الأكمام، والملابس الداخلية. يُباع في لفة من 100 ياردة، أي حوالي 91 م، بالأبيض أو الأسود. والحلقات الدائرية الشفافة 10 مم، في كيس من 1000، تُعدّل حمالات الملابس الداخلية دون أن تظهر. وشريط الساتان 25 مم، في حزمة من 10 لفات من 20 م، للفيونكات والتشطيب.',
        `ولجاكيتات وبلوزونات الأطفال، تُركب أزرار الكبس بالنابض 15 مم بالمكبس اليدوي، دون خياطة. يُختار اللون في صفحة المنتج عندما تكون عدة ألوان. ${FIN.ar}`,
      ],
    },
    familles: [
      {
        cle: 'elastique-anneaux',
        nom: { fr: 'Élastique et anneaux', ar: 'المطاط والحلقات' },
        regle: { mots: ['elastique', 'anneau'], sauf: SANGLES },
      },
      {
        cle: 'satin',
        nom: { fr: 'Ruban satin', ar: 'شريط الساتان' },
        regle: { mots: ['satin'] },
      },
      {
        cle: 'pression',
        nom: { fr: 'Boutons pression', ar: 'أزرار الكبس' },
        regle: { mots: ['pression'] },
      },
    ],
    devis: {
      fr: "Bonjour LEBTEX, je fabrique de la lingerie et des vêtements d'enfants et je voudrais un devis pour : ",
      ar: 'السلام عليكم LEBTEX، أصنع الملابس الداخلية وملابس الأطفال وأريد عرض سعر لـ: ',
    },
  },

  // ─── Merceries, revendeurs, petit matériel ──────────────────────────────────
  {
    slug: 'etiquetage-finition-et-atelier',
    nom: { fr: 'Étiquetage, finition et atelier', ar: 'الإتيكيت والتشطيب والمعمل' },
    titreGoogle: { fr: "Étiquetage, finition et petit matériel d'atelier", ar: 'الإتيكيت والتشطيب وأدوات المعمل' },
    accroche: {
      fr: "Attaches d'étiquettes, coupe-fils, mètres ruban, épingles, colle et spray : le petit matériel des merceries et ateliers.",
      ar: 'مشابك الإتيكيت، ومقصات الخيوط، وأمتار القياس، والدبابيس، والغراء والبخاخ: أدوات محلات الخردوات والمعامل.',
    },
    presentation: {
      fr: [
        'Merceries, revendeurs et ateliers utilisent chaque jour le même petit matériel. LEBTEX le vend en boîtes et en packs, pour équiper plusieurs postes ou garnir un rayon.',
        'Pour étiqueter : attaches transparentes pour pistolet à étiquettes, en boîte de 5000, de 1,5 à 5 cm de long, et épingles à nourrice dorées par 1728. Pour couper et mesurer : coupe-fils et mètres ruban de 150 cm, vendus par 12.',
        'Pour coller : mini pistolet à colle chaude 20 W, livré avec 3 bâtons, pour rubans, dentelles et strass, et adhésif temporaire en spray, qui tient un appliqué ou un patron le temps de coudre. Les prix affichés sont des prix de gros ; pour une grosse quantité, demandez un prix sur WhatsApp. Livraison partout au Maroc, retrait gratuit à Casablanca.',
      ],
      ar: [
        'محلات الخردوات والتجار والمعامل يستعملون كل يوم نفس الأدوات الصغيرة. تبيعها LEBTEX في علب وحزم، لتجهيز عدة مراكز عمل أو لملء رفوف المحل.',
        'للإتيكيت: مشابك شفافة لمسدس الإتيكيت، في علبة من 5000، بطول من 1,5 إلى 5 سم، ودبابيس أمان ذهبية في حزمة من 1728. للقص والقياس: مقصات الخيوط وأمتار القياس بطول 150 سم، في حزم من 12.',
        'للصق: مسدس غراء ساخن صغير 20 واط مع 3 أعواد غراء، للأشرطة والدانتيل والستراس، ولاصق مؤقت بخاخ يثبت القطعة المزخرفة أو الباترون حتى تنتهي الخياطة. الأثمنة المعروضة هي أثمنة الجملة؛ للكميات الكبيرة اطلب الثمن عبر واتساب. التوصيل لجميع مدن المغرب، والاستلام مجاني في الدار البيضاء.',
      ],
    },
    familles: [
      {
        cle: 'etiquetage',
        nom: { fr: 'Étiquetage', ar: 'الإتيكيت' },
        regle: { mots: ['etiquette', 'epingle'] },
      },
      {
        cle: 'couper-mesurer',
        nom: { fr: 'Couper et mesurer', ar: 'القص والقياس' },
        regle: { mots: ['coupe fil', 'ciseau', 'metre ruban', 'metres ruban'] },
      },
      {
        cle: 'colle',
        nom: { fr: 'Colle et spray', ar: 'الغراء والبخاخ' },
        regle: { mots: ['colle', 'adhesif'] },
      },
      {
        // Vide tant que l'huile pour machines à coudre n'a pas de prix
        cle: 'entretien',
        nom: { fr: 'Entretien des machines', ar: 'صيانة الآلات' },
        regle: { mots: ['huile', 'lubrifiant'] },
      },
    ],
    devis: {
      fr: 'Bonjour LEBTEX, je tiens une mercerie et je voudrais un devis pour : ',
      ar: 'السلام عليكم LEBTEX، عندي محل خردوات وأريد عرض سعر لـ: ',
    },
  },
];

// ─── Adresses ───────────────────────────────────────────────────────────────

// Adresse française de la liste des secteurs, et d'un secteur
export const CHEMIN_SECTEURS = '/shop/secteurs';

export function cheminSecteur(secteur: Pick<Secteur, 'slug'>): string {
  return `${CHEMIN_SECTEURS}/${secteur.slug}`;
}

// Liens, dans la langue voulue (lib/liens-boutique : /ar devant en arabe)
export function lienSecteurs(langue?: LangueLien): string {
  return lienPage(CHEMIN_SECTEURS, langue);
}

export function lienSecteur(secteur: Pick<Secteur, 'slug'>, langue?: LangueLien): string {
  return lienPage(cheminSecteur(secteur), langue);
}

// Le secteur d'une adresse : son slug, ou la même adresse écrite autrement (majuscules,
// accents, espaces : « Tapisserie et canapés »). Inconnu : null.
export function secteurDepuisParametre(param: string): Secteur | null {
  const brut = decoderParametre(param);
  if (!brut) return null;
  const ecrit = slugifier(brut, 200);
  return SECTEURS.find(s => s.slug === brut) ?? SECTEURS.find(s => s.slug === ecrit) ?? null;
}

// ─── Choix des produits ─────────────────────────────────────────────────────

// « Fil à Coudre 40/2– Pack » → « fil a coudre 40 2 pack » : minuscules, sans accents,
// lettres et chiffres séparés par une espace
export function normaliser(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const motifs = new Map<string, RegExp>();

// Le mot (ou l'expression) en entier dans le texte normalisé, fin de pluriel tolérée
function contient(texte: string, mot: string): boolean {
  let motif = motifs.get(mot);
  if (!motif) {
    const m = normaliser(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    motif = new RegExp(`(?:^| )${m}(?:e|s|es|x)?(?= |$)`);
    motifs.set(mot, motif);
  }
  return motif.test(texte);
}

// Les rayons du produit (principal, rayons en plus, alias) et leurs rayons parents
function rayonsDuProduit(p: ShopProduct, rayons: ShopCategory[]): Set<string> {
  const slugs = [
    p.categorySlug,
    ...(p.additionalCategorySlugs ?? []),
    ...(p.categoryAliases ?? []).map(a => a?.slug),
  ].filter((s): s is string => typeof s === 'string' && s !== '');
  const tous = new Set(slugs);
  for (const s of slugs) {
    const rayon = trouverRayon(rayons, s);
    if (rayon) {
      tous.add(rayon.slug);
      if (rayon.parentSlug) tous.add(rayon.parentSlug);
    }
  }
  return tous;
}

// Le produit répond-il à la règle ?
export function produitSuitRegle(p: ShopProduct, regle: RegleProduits, rayons: ShopCategory[]): boolean {
  if (regle.ids?.includes(p.id)) return true;
  const nom = normaliser(p.name);
  const ses = rayonsDuProduit(p, rayons);
  const parMot = (regle.mots ?? []).some(m => contient(nom, m));
  const parRayon = (regle.rayons ?? []).some(r => ses.has(r));
  if (!parMot && !parRayon) return false;
  if (!(regle.avec ?? []).every(m => contient(nom, m))) return false;
  if ((regle.sauf ?? []).some(m => contient(nom, m))) return false;
  if ((regle.saufRayons ?? []).some(r => ses.has(r))) return false;
  return true;
}

export type FamilleRemplie = { famille: FamilleSecteur; produits: ShopProduct[] };
export type SecteurRempli = { secteur: Secteur; familles: FamilleRemplie[]; produits: ShopProduct[] };

// Les familles du secteur avec leurs produits : chaque produit dans la première famille qui
// le prend (jamais deux fois sur la page), les produits disponibles d'abord, puis l'ordre du
// catalogue. Une famille sans produit n'est pas gardée.
export function remplirSecteur(secteur: Secteur, produits: ShopProduct[], rayons: ShopCategory[]): SecteurRempli {
  const pris = new Set<string>();
  const familles = secteur.familles
    .map(famille => {
      const siens = produits.filter(p => !pris.has(p.id) && produitSuitRegle(p, famille.regle, rayons));
      siens.forEach(p => pris.add(p.id));
      const ordonnes = [...siens.filter(p => p.inStock !== false), ...siens.filter(p => p.inStock === false)];
      return { famille, produits: ordonnes };
    })
    .filter(f => f.produits.length > 0);
  return { secteur, familles, produits: familles.flatMap(f => f.produits) };
}

// Les secteurs montrés : ceux qui ont au moins MIN_PRODUITS_SECTEUR produits, dans l'ordre
export function secteursVisibles(produits: ShopProduct[], rayons: ShopCategory[]): SecteurRempli[] {
  return SECTEURS.map(s => remplirSecteur(s, produits, rayons)).filter(s => s.produits.length >= MIN_PRODUITS_SECTEUR);
}

// ─── Photos et textes courts ────────────────────────────────────────────────

// Première photo du produit (sinon celle d'une de ses variantes)
function photoDe(p: ShopProduct): string | undefined {
  return p.images?.find(Boolean) || p.variants?.find(v => v?.image)?.image;
}

// Jusqu'à `n` photos différentes pour la mosaïque du secteur : une par famille à tour de
// rôle (des articles variés), les produits disponibles d'abord
export function photosSecteur(rempli: Pick<SecteurRempli, 'familles'>, n = 4): string[] {
  const photos: string[] = [];
  const files = rempli.familles.map(f => [...f.produits]);
  while (photos.length < n && files.some(f => f.length > 0)) {
    for (const file of files) {
      if (photos.length >= n) break;
      while (file.length > 0) {
        const photo = photoDe(file.shift() as ShopProduct);
        if (photo && !photos.includes(photo)) {
          photos.push(photo);
          break;
        }
      }
    }
  }
  return photos;
}

// « 11 articles » ; en arabe, le nom s'accorde avec le nombre (1, 2, de 3 à 10, au-delà)
export function compteArticles(n: number, langue: LangueLien): string {
  if (langue === 'ar') {
    if (n === 1) return 'منتج واحد';
    if (n === 2) return 'منتجان';
    return `${n} ${n >= 3 && n <= 10 ? 'منتجات' : 'منتجاً'}`;
  }
  return `${n} article${n > 1 ? 's' : ''}`;
}
