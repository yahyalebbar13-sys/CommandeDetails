// Le bon de livraison d'une commande boutique : il part avec le colis. Le livreur y lit qui
// appeler, où aller et combien encaisser ; le client y signe la réception. Ces contrôles relisent
// le PDF produit : ce qui doit y être, ce qui ne doit jamais y être (prix d'achat, note interne,
// arabe illisible), et qu'aucun texte ne déborde ni n'en chevauche un autre.
// Lancer :
//   npx tsx scripts/test-pdf-commande-boutique.ts
//   npx tsx scripts/test-pdf-commande-boutique.ts --apercu <dossier>
//     (écrit aussi bon-une-commande.pdf et bons-lot.pdf dans ce dossier, pour les regarder)

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import jsPDF from 'jspdf';
import type { ShopOrder } from '../src/lib/shop-types';
import { formatPrice } from '../src/lib/shop-utils';
import {
  MARQUE_ARABE, MARQUE_AUTRE_ALPHABET, chiffresLatins, construireBonLivraison, exporterBonLivraison,
  nomFichierBonLivraison, telephonesImprimables, textePourPdf,
} from '../src/lib/pdf-commande-boutique';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// `save()` est la seule chose qui ne marche pas hors navigateur : on l'intercepte sur l'API jsPDF
// pour récupérer le nom du fichier qui aurait été téléchargé.
let telecharge: string | null = null;
(jsPDF as any).API.save = function (this: any, fichier: string) { telecharge = fichier; return this; };

// ─── Lire ce que le PDF écrit réellement ─────────────────────────────────────

/** Les caractères que la table WinAnsi range entre 0x80 et 0x9F. */
const WINANSI: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const decoder = (brut: string) => Array.from(brut.replace(/\\([()\\])/g, '$1'))
  .map(ch => WINANSI[ch.charCodeAt(0)] ?? ch).join('');

/** Un fragment de texte posé sur la page : position en points (origine en bas à gauche), taille, largeur. */
interface Ecrit { page: number; x: number; y: number; texte: string; taille: number; largeur: number }

/**
 * Relit le contenu de chaque page (avant compression) : police, taille, position et texte de
 * chaque fragment, et sa largeur réelle dans sa police.
 */
function lire(doc: jsPDF) {
  const k = (doc as any).internal.scaleFactor as number;
  const polices = new Map<string, { nom: string; style: string }>();
  for (const [nom, styles] of Object.entries(doc.getFontList())) {
    if (nom !== nom.toLowerCase()) continue;
    for (const style of styles) {
      try { polices.set((doc as any).internal.getFont(nom, style).id, { nom, style }); } catch { /* police absente */ }
    }
  }

  const ecrits: Ecrit[] = [];
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    const contenu = ((doc as any).internal.pages[page] as string[]).join('\n');
    for (const bloc of contenu.matchAll(/BT\n([\s\S]*?)\nET/g)) {
      let police = { nom: 'helvetica', style: 'normal' };
      let taille = 10, pas = 0, x = 0, y = 0, premierTd = true;
      for (const ligne of bloc[1].split('\n')) {
        let m: RegExpExecArray | null;
        if ((m = /^\/(\w+) ([\d.]+) Tf$/.exec(ligne))) {
          police = polices.get(m[1]) ?? police;
          taille = parseFloat(m[2]);
        } else if ((m = /^([\d.]+) TL$/.exec(ligne))) {
          pas = parseFloat(m[1]);
        } else if ((m = /^([-\d.]+) ([-\d.]+) Td$/.exec(ligne))) {
          // Le premier Td d'un bloc est absolu, les suivants relatifs à la ligne précédente.
          x = premierTd ? parseFloat(m[1]) : x + parseFloat(m[1]);
          y = premierTd ? parseFloat(m[2]) : y + parseFloat(m[2]);
          premierTd = false;
        } else if ((m = /^(T\* )?\((.*)\) Tj$/.exec(ligne))) {
          if (m[1]) y -= pas;
          const texte = decoder(m[2]);
          doc.setFont(police.nom, police.style);
          doc.setFontSize(taille);
          ecrits.push({ page, x, y, texte, taille, largeur: doc.getTextWidth(texte) * k });
        }
      }
    }
  }
  return { doc, ecrits, pages, texte: ecrits.map(e => e.texte).join(' ') };
}
type Lu = ReturnType<typeof lire>;

const texteDeLaPage = (lu: Lu, page: number) => lu.ecrits.filter(e => e.page === page).map(e => e.texte).join(' ');
const pageDe = (lu: Lu, motif: string) => lu.ecrits.find(e => e.texte.includes(motif))?.page ?? 0;
const paginations = (lu: Lu) => lu.ecrits.filter(e => /^Page \d+ \/ \d+$/.test(e.texte))
  .sort((a, b) => a.page - b.page).map(e => `${e.page}:${e.texte}`);

// A4 : 595,28 × 841,89 pt ; marge de 14 mm = 39,69 pt.
const LARGEUR_PAGE = 595.28;
const HAUTEUR_PAGE = 841.89;
const MARGE_PT = 39.69;
const MM = 72 / 25.4;

/** Rien ne sort des marges ni de la page. */
function horsMarges(lu: Lu): Ecrit[] {
  return lu.ecrits.filter(e => e.texte.trim() && (
    e.x < MARGE_PT - 0.5 || e.x + e.largeur > LARGEUR_PAGE - MARGE_PT + 0.5 || e.y < 5 || e.y > HAUTEUR_PAGE - 5));
}

/** Deux textes posés sur la même ligne qui se recouvrent : l'un déborde sur l'autre. */
function chevauchements(lu: Lu): string[] {
  const trouves: string[] = [];
  const visibles = lu.ecrits.filter(e => e.texte.trim());
  for (let i = 0; i < visibles.length; i++) {
    for (let j = i + 1; j < visibles.length; j++) {
      const a = visibles[i], b = visibles[j];
      if (a.page !== b.page) continue;
      if (Math.abs(a.y - b.y) >= Math.min(a.taille, b.taille) * 0.8) continue;
      const recouvrement = Math.min(a.x + a.largeur, b.x + b.largeur) - Math.max(a.x, b.x);
      if (recouvrement > 0.5) trouves.push(`p${a.page} « ${a.texte} » / « ${b.texte} »`);
    }
  }
  return trouves;
}

function controlesDeMiseEnPage(lu: Lu, nom: string) {
  const dehors = horsMarges(lu);
  check(`${nom} : rien ne sort des marges ni de la page`, dehors.length === 0,
    dehors.slice(0, 3).map(e => `p${e.page} « ${e.texte} » x=${e.x.toFixed(1)} fin=${(e.x + e.largeur).toFixed(1)} y=${e.y.toFixed(1)}`).join(' | '));
  const collisions = chevauchements(lu);
  check(`${nom} : aucun texte n’en chevauche un autre`, collisions.length === 0, collisions.slice(0, 3).join(' | '));
  check(`${nom} : aucun caractère illisible (arabe mal encodé, émoji)`,
    !/[þÿĀ-‒―-‗‛‟‧-￿]/.test(lu.texte.replace(/[—–’‘“”…•€™]/g, '')),
    (lu.texte.match(/[þÿĀ-￿]/g) || []).slice(0, 10).join(''));
  check(`${nom} : ni « undefined », ni « null », ni « NaN »`, !/undefined|null|NaN/.test(lu.texte));
}

// ─── Des commandes comme on en reçoit ────────────────────────────────────────

const ligne = (productName: string, prix: number, quantity: number, variant: any = null, unitPrice: number | undefined = prix) =>
  ({ productId: productName, productName, productImage: '/placeholder.png', price: prix, unitPrice, quantity, variant, maxStock: 99 }) as any;

const adresseLongue = 'Résidence Al Mansour, immeuble 14, appartement 7, 3e étage, rue Ibnou Mounir, '
  + 'à côté de la pharmacie Al Amal, quartier Maârif extension';
const noteDuClient = 'Merci d’appeler avant de passer, je suis à l’atelier jusqu’à 18 h. '
  + 'Sonner chez le gardien si personne ne répond.';

/** Deux téléphones, variante complète, adresse longue, note, une ligne « sur demande » à 0, une réduction. */
const complete: ShopOrder = {
  id: 'c1',
  orderNumber: 'LBT-MG2K3H7P-X9QF',
  customerName: 'Fatima Zahra Bennani',
  customerPhone: '0612345678',
  customerEmail: 'fz.bennani@gmail.com',
  status: 'confirmed',
  items: [
    { ...ligne('FERMETURE INVISIBLE NYLON N3', 3, 200, { model: 'Invisible', color: 'Noir 580', size: '20 cm' }, 2.5), purchasePrice: 1.37, costPrice: 1.37 },
    ligne('DOUBLURE POLYESTER 180G', 18, 25, { color: 'Beige 101' }),
    ligne('RUBAN SATIN DOUBLE FACE 1 CM', 0, 50, { color: 'Rouge bordeaux' }),
  ],
  subtotal: 950,
  deliveryFee: 25,
  discount: 50,
  couponCode: 'RENTREE50',
  total: 925,
  shippingAddress: {
    fullName: 'Fatima Zahra Bennani', phone: '06 12 34 56 78', phone2: '+212 7 01 02 03 04',
    address: adresseLongue, city: 'Casablanca', region: 'Casablanca-Settat', postalCode: '20330',
  },
  paymentMethod: 'cod',
  notes: noteDuClient,
  noteInterne: 'CLIENTE DIFFICILE — PAS DE REMISE',
  motifAnnulation: 'MOTIF SECRET',
  createdAt: { seconds: Date.UTC(2026, 8, 27, 13, 5) / 1000 },
};

/** Ancienne commande : le prix de gros a fait le sous-total, les lignes n'ont gardé que le prix de base. */
const ancienne: ShopOrder = {
  id: 'c2',
  orderNumber: 'LBT-MF9QZ1AB-K2LM',
  customerName: 'Atelier Noor',
  customerPhone: '0522334455',
  status: 'processing',
  items: [
    ligne('POPELINE COTON 120G', 20, 100, { color: 'Blanc' }, undefined),
    ligne('BIAIS COTON 2CM', 4, 50, { color: 'Noir', size: '2 cm' }, undefined),
  ],
  subtotal: 1750,
  deliveryFee: 0,
  total: 1750,
  shippingAddress: { fullName: 'Atelier Noor', phone: '0522334455', address: '12 bd Mohammed V', city: 'Rabat' },
  paymentMethod: 'cod',
  createdAt: '2026-08-14T09:30:00Z',
};

/** Tout en arabe, numéro tapé en chiffres arabes, pas encore confirmée. */
const arabe: ShopOrder = {
  id: 'c3',
  orderNumber: 'LBT-MG3A0C4D-7TRE',
  customerName: 'محمد العلوي',
  customerPhone: '٠٦٦١٢٢٣٣٤٤',
  status: 'pending',
  items: [ligne('CURSEUR N5 AUTOLOCK', 1.5, 500, { color: 'Nickel', size: 'N5' })],
  subtotal: 750,
  deliveryFee: 35,
  total: 785,
  shippingAddress: { fullName: 'محمد العلوي', phone: '٠٦٦١٢٢٣٣٤٤', address: 'حي السلام، زنقة 5 رقم ١٢', city: 'Fès' },
  paymentMethod: 'cod',
  notes: 'عافاك عيط قبل ما تجي',
  createdAt: new Date(Date.UTC(2026, 8, 26, 20, 40)),
};

const lot = [complete, ancienne, arabe];
const prix = (n: number) => formatPrice(n).replace(/[  ]/g, ' ');

(async () => {
  console.log('\n── Le texte des clients ──');
  check('un nom en arabe est remplacé par la mention, pas supprimé', textePourPdf('محمد العلوي') === MARQUE_ARABE, textePourPdf('محمد العلوي'));
  check('une adresse mêlée garde sa partie latine',
    textePourPdf('Rue 12, حي السلام، Casablanca') === `Rue 12, ${MARQUE_ARABE} Casablanca`, textePourPdf('Rue 12, حي السلام، Casablanca'));
  check('un passage arabe coupé de chiffres donne une seule mention',
    textePourPdf('زنقة 5 رقم ١٢') === `${MARQUE_ARABE} 12`, textePourPdf('زنقة 5 رقم ١٢'));
  check('les chiffres arabes-indiens deviennent des chiffres courants', chiffresLatins('٠٦٦١٢٢٣٣٤٤ / ۰۷') === '0661223344 / 07');
  check('une lettre latine inconnue de la police perd seulement son accent', textePourPdf('Doğan Şahin') === 'Dogan Sahin', textePourPdf('Doğan Şahin'));
  check('un autre alphabet est signalé', textePourPdf('王伟 Tanger') === `${MARQUE_AUTRE_ALPHABET} Tanger`, textePourPdf('王伟 Tanger'));
  check('un émoji disparaît sans laisser de trace', textePourPdf('Merci 🙏  beaucoup') === 'Merci beaucoup', textePourPdf('Merci 🙏  beaucoup'));
  check('rien donne rien', textePourPdf(undefined) === '' && textePourPdf(null) === '');

  console.log('\n── Les téléphones ──');
  check('les deux téléphones, au format marocain, sans doublon',
    JSON.stringify(telephonesImprimables(complete)) === JSON.stringify(['06 12 34 56 78', '07 01 02 03 04']),
    JSON.stringify(telephonesImprimables(complete)));
  check('un numéro tapé en chiffres arabes reste un numéro',
    JSON.stringify(telephonesImprimables(arabe)) === JSON.stringify(['06 61 22 33 44']), JSON.stringify(telephonesImprimables(arabe)));
  check('un numéro étranger est gardé tel quel',
    telephonesImprimables({ ...ancienne, customerPhone: '+33 6 12 34 56 78', shippingAddress: { ...ancienne.shippingAddress, phone: '' } })[0] === '+33 6 12 34 56 78');

  console.log('\n── Une commande complète ──');
  const une = lire(await construireBonLivraison(complete));
  check('elle tient sur une page', une.pages === 1, String(une.pages));
  check('le titre est celui du document', une.texte.includes('BON DE LIVRAISON'));
  check('le numéro de commande est écrit', une.texte.includes('LBT-MG2K3H7P-X9QF'));
  check('la date de réception est écrite en entier, heure du Maroc', une.texte.includes('Reçue le 27/09/2026 à 14:05'), une.texte.slice(0, 200));
  check('« TOTAL À ENCAISSER » est écrit', une.texte.includes('TOTAL À ENCAISSER'));
  const total = une.ecrits.filter(e => e.texte === prix(925));
  check('le total à encaisser est le plus gros montant de la page',
    total.length > 0 && Math.max(...total.map(e => e.taille)) >= 15, JSON.stringify(total.map(e => e.taille)));
  check('les deux téléphones sont écrits, en gras et en gros',
    ['06 12 34 56 78', '07 01 02 03 04'].every(t => une.ecrits.some(e => e.texte === t && e.taille >= 11)));
  check('l’e-mail du client est là', une.texte.includes('fz.bennani@gmail.com'));
  check('l’adresse longue est imprimée en entier', adresseLongue.split(' ').every(mot => une.texte.includes(mot)),
    une.ecrits.filter(e => e.texte.includes('Résidence') || e.texte.includes('Maârif')).map(e => e.texte).join(' | '));
  check('ville, région et code postal', une.texte.includes('CASABLANCA') && une.texte.includes('Région : Casablanca-Settat')
    && une.texte.includes('Code postal : 20330'));
  const variantes = ['Invisible', 'Noir 580', '20 cm', 'Beige 101', 'Rouge bordeaux'];
  check('modèle, couleur et taille ont chacun leur case, jamais entassés',
    variantes.every(v => une.ecrits.some(e => e.texte === v))
    && !une.ecrits.some(e => variantes.filter(v => e.texte.includes(v)).length > 1),
    variantes.filter(v => !une.ecrits.some(e => e.texte === v)).join(', '));
  check('le prix réellement facturé est celui de la ligne (prix de gros compris)',
    une.ecrits.some(e => e.texte === prix(2.5)) && une.ecrits.some(e => e.texte === prix(500)), une.texte);
  check('une ligne sans prix dit « à fixer »', une.ecrits.filter(e => e.texte === 'à fixer').length === 2);
  check('et le bon le signale', une.texte.includes('Prix à fixer avec le client avant l\'envoi'));
  check('livraison, réduction et sous-total', une.texte.includes('Réduction (RENTREE50)') && une.texte.includes(`-${prix(50)}`)
    && une.texte.includes(prix(25)) && une.texte.includes(prix(950)));
  check('« Paiement à la livraison »', une.texte.includes('Paiement à la livraison'));
  check('la note du client est imprimée en entier',
    une.texte.includes('NOTE DU CLIENT') && noteDuClient.split(' ').every(mot => une.texte.includes(mot)));
  check('trois vraies cases de signature', ['PRÉPARÉ PAR', 'LIVREUR', 'CLIENT — REÇU EN BON ÉTAT'].every(t => une.texte.includes(t))
    && une.ecrits.filter(e => e.texte === 'Signature :').length === 3);
  check('le pied dit que ce bon ne vaut pas facture', une.texte.includes('CE BON NE VAUT PAS FACTURE'));
  check('le pied est paginé', JSON.stringify(paginations(une)) === JSON.stringify(['1:Page 1 / 1']), JSON.stringify(paginations(une)));
  check('il porte l’identité LEBTEX', une.texte.includes('LEBTEX'));
  check('pas d’alerte sur une commande confirmée', !une.texte.includes('ne pas expédier') && !une.texte.includes('pas encore confirmée'));

  console.log('\n── Ce qui ne doit jamais y être ──');
  check('ni prix d’achat ni prix de revient', !une.texte.includes('1,37') && !une.texte.includes('1.37') && !/revient/i.test(une.texte));
  check('ni la note interne de l’équipe', !une.texte.includes('CLIENTE DIFFICILE'));
  check('ni le motif d’annulation', !une.texte.includes('MOTIF SECRET'));

  console.log('\n── La mise en page ──');
  controlesDeMiseEnPage(une, 'une commande');
  const colonneGauche = 14 * MM + 88 * MM;
  const debutDroite = 14 * MM + 94 * MM;
  const client = une.ecrits.filter(e => ['06 12 34 56 78', '07 01 02 03 04', 'fz.bennani@gmail.com'].includes(e.texte));
  check('les coordonnées du client restent dans leur encart', client.length === 3 && client.every(e => e.x + e.largeur <= colonneGauche - 3 * MM),
    client.map(e => (e.x + e.largeur) / MM).join(', '));
  const adresse = une.ecrits.filter(e => /Résidence|Mounir|Maârif/.test(e.texte));
  check('l’adresse reste dans l’encart « Livrer à »', adresse.length > 0 && adresse.every(e => e.x >= debutDroite),
    adresse.map(e => `${(e.x / MM).toFixed(1)} « ${e.texte} »`).join(' | '));

  console.log('\n── Une ancienne commande au prix de gros ──');
  const vieille = lire(await construireBonLivraison(ancienne));
  check('le bon prévient que le sous-total fait foi', vieille.texte.includes('Prix de gros appliqué : le sous-total fait foi'));
  check('le sous-total et le total sont ceux de la commande', vieille.texte.includes(prix(1750)));
  check('la livraison offerte s’écrit « Gratuite »', vieille.ecrits.some(e => e.texte === 'Gratuite'));
  check('pas de mention « prix à fixer » quand tout a un prix', !vieille.texte.includes('Prix à fixer'));
  check('sans date de réception lisible, pas de « Reçue le — »', !vieille.texte.includes('Reçue le —'));
  controlesDeMiseEnPage(vieille, 'ancienne commande');

  console.log('\n── Une commande écrite en arabe ──');
  const ar = lire(await construireBonLivraison(arabe));
  check('le nom et l’adresse en arabe sont remplacés par la mention, pas supprimés',
    (ar.texte.match(/\(en arabe — voir la commande\)/g) || []).length >= 3, ar.texte.slice(0, 400));
  check('le numéro de maison survit', ar.texte.includes(`${MARQUE_ARABE} 12`));
  check('le téléphone tapé en chiffres arabes est lisible', ar.ecrits.some(e => e.texte === '06 61 22 33 44'));
  check('la ville latine est là', ar.texte.includes('FÈS'));
  check('une commande pas encore confirmée le dit', ar.texte.includes('pas encore confirmée'));
  controlesDeMiseEnPage(ar, 'commande en arabe');

  console.log('\n── Un lot de trois commandes ──');
  const lu = lire(await construireBonLivraison(lot));
  check('trois commandes, trois pages', lu.pages === 3, String(lu.pages));
  check('chaque commande commence sur sa propre page',
    lot.every((c, i) => pageDe(lu, c.orderNumber) === i + 1), lot.map(c => pageDe(lu, c.orderNumber)).join(', '));
  check('chaque page ne parle que de sa commande',
    lot.every((c, i) => lot.every((autre, j) => i === j || !texteDeLaPage(lu, i + 1).includes(autre.orderNumber))));
  check('chaque bon a son propre « Page 1 / 1 »',
    JSON.stringify(paginations(lu)) === JSON.stringify(['1:Page 1 / 1', '2:Page 1 / 1', '3:Page 1 / 1']), JSON.stringify(paginations(lu)));
  check('chaque bon a son total à encaisser',
    [1, 2, 3].every(p => texteDeLaPage(lu, p).includes('TOTAL À ENCAISSER')));
  controlesDeMiseEnPage(lu, 'lot');

  console.log('\n── Un bon de plusieurs pages dans un lot ──');
  const longue: ShopOrder = {
    ...complete,
    id: 'c4',
    orderNumber: 'LBT-MG4LONG1-ZZZZ',
    items: Array.from({ length: 45 }, (_, i) =>
      ligne(`ARTICLE DE MERCERIE N° ${i + 1} AU NOM ASSEZ LONG POUR PASSER SUR DEUX LIGNES`, 10 + i, 3, { color: `Couleur ${i + 1}`, size: 'M' })),
  };
  const deux = lire(await construireBonLivraison([longue, complete]));
  // Dernière page où le long bon est nommé (son pied de page le nomme sur chacune).
  const pagesLongue = Math.max(0, ...deux.ecrits.filter(e => e.texte.includes('LBT-MG4LONG1')).map(e => e.page));
  check('le long bon passe sur plusieurs pages', pagesLongue >= 2, String(pagesLongue));
  check('la commande suivante commence sur une nouvelle page',
    pageDe(deux, complete.orderNumber) === pagesLongue + 1, `${pageDe(deux, complete.orderNumber)} / ${pagesLongue}`);
  const attendu = [...Array.from({ length: pagesLongue }, (_, i) => `${i + 1}:Page ${i + 1} / ${pagesLongue}`), `${pagesLongue + 1}:Page 1 / 1`];
  check('la pagination repart à 1 pour chaque bon', JSON.stringify(paginations(deux)) === JSON.stringify(attendu), JSON.stringify(paginations(deux)));
  check('les pages suivantes rappellent leur commande', texteDeLaPage(deux, 2).includes('Bon de livraison LBT-MG4LONG1-ZZZZ — suite'));
  check('les 45 articles sont tous imprimés', Array.from({ length: 45 }, (_, i) => `N° ${i + 1} AU`).every(t => deux.texte.includes(t)));
  check('les cases de signature ne sont pas perdues', deux.ecrits.filter(e => e.texte === 'Signature :').length === 6);
  controlesDeMiseEnPage(deux, 'long bon');

  console.log('\n── Cas limites ──');
  const annulee = lire(await construireBonLivraison({ ...ancienne, status: 'cancelled' }));
  check('une commande annulée imprimée par erreur le dit', annulee.texte.includes('ne pas expédier'));
  const vide = lire(await construireBonLivraison({ ...ancienne, items: [], subtotal: 0, total: 0 }));
  check('une commande sans article ne casse pas', vide.pages === 1 && vide.texte.includes('Aucun article'));
  const sansTel = lire(await construireBonLivraison({ ...ancienne, customerPhone: '', shippingAddress: { ...ancienne.shippingAddress, phone: '' } }));
  check('une commande sans téléphone le signale', sansTel.texte.includes('Aucun téléphone'));
  const tresLongue = `${adresseLongue}, ${adresseLongue}, ${adresseLongue}, ${adresseLongue}`;
  const adresseXXL = lire(await construireBonLivraison({ ...complete, shippingAddress: { ...complete.shippingAddress, address: tresLongue } }));
  check('une adresse démesurée renvoie à la commande au lieu de déborder',
    adresseXXL.texte.includes('adresse complète dans la commande'), adresseXXL.texte.slice(0, 300));
  controlesDeMiseEnPage(adresseXXL, 'adresse démesurée');
  const grosMontant = lire(await construireBonLivraison({ ...complete, subtotal: 1234567.5, total: 1234592.5, discount: 0 }));
  controlesDeMiseEnPage(grosMontant, 'gros montant');
  let refus = '';
  try { await construireBonLivraison([]); } catch (e: any) { refus = e?.message || ''; }
  check('une liste vide est refusée avec un message clair', refus === 'Aucune commande à imprimer.', refus);

  console.log('\n── Les noms de fichier ──');
  check('une commande', nomFichierBonLivraison(complete) === 'Bon-livraison-LBT-MG2K3H7P-X9QF.pdf', nomFichierBonLivraison(complete));
  check('un lot', nomFichierBonLivraison(lot, Date.UTC(2026, 8, 27, 10)) === 'Bons-livraison-3-commandes-2026-09-27.pdf',
    nomFichierBonLivraison(lot, Date.UTC(2026, 8, 27, 10)));
  check('un lot imprimé à minuit et demie à Casablanca porte la date du Maroc',
    nomFichierBonLivraison(lot, Date.UTC(2026, 8, 27, 23, 30)) === 'Bons-livraison-3-commandes-2026-09-28.pdf');
  check('un tableau d’une seule commande a le nom d’une commande', nomFichierBonLivraison([complete]) === 'Bon-livraison-LBT-MG2K3H7P-X9QF.pdf');
  await exporterBonLivraison(complete);
  check('le téléchargement porte ce nom', telecharge === 'Bon-livraison-LBT-MG2K3H7P-X9QF.pdf', String(telecharge));
  await exporterBonLivraison(lot);
  check('et celui du lot aussi', /^Bons-livraison-3-commandes-\d{4}-\d{2}-\d{2}\.pdf$/.test(String(telecharge)), String(telecharge));

  // ─── Aperçu ───
  const i = process.argv.indexOf('--apercu');
  if (i > 0 && process.argv[i + 1]) {
    const dossier = process.argv[i + 1];
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, 'bon-une-commande.pdf'), Buffer.from((await construireBonLivraison(complete)).output('arraybuffer')));
    writeFileSync(join(dossier, 'bons-lot.pdf'), Buffer.from((await construireBonLivraison(lot)).output('arraybuffer')));
    console.log(`\nAperçus écrits dans ${dossier} : bon-une-commande.pdf, bons-lot.pdf`);
  }

  console.log(`\n${pass} réussis, ${fail} échoués`);
  if (fail > 0) process.exit(1);
})();
