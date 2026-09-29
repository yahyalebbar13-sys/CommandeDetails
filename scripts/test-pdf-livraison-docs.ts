// Les papiers des rouleaux et du retrait : devis de transport, bon de retrait, feuille de route de
// la camionnette, bon de remise au transporteur. Ces contrôles relisent les PDF produits : ce qui
// doit y être (prix convenu, validité, RIB lisible, lieu, colis, espèces attendues, signatures),
// ce qui ne doit jamais y être (note interne, prix d'achat, RIB ailleurs que sur le devis, arabe
// illisible), et qu'aucun texte ne déborde ni n'en chevauche un autre.
// Lancer :
//   npx tsx scripts/test-pdf-livraison-docs.ts
//   npx tsx scripts/test-pdf-livraison-docs.ts --apercu <dossier>
//     (écrit aussi des exemples de chaque document dans ce dossier, pour les regarder)

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import jsPDF from 'jspdf';
import type { ShopOrder } from '../src/lib/shop-types';
import { formatPrice } from '../src/lib/shop-utils';
import { lireReglagesReception } from '../src/lib/reglages-reception';
import { MARQUE_ARABE } from '../src/lib/pdf-commande-boutique';
import {
  MENTION_RIB, PLAFOND_ESPECES_TOURNEE, arretsRanges, construireBonRemiseTransporteur, construireBonRetrait,
  construireDevisTransport, construireFeuilleDeRoute, especesAttendues, exporterBonRemiseTransporteur,
  exporterBonRetrait, exporterDevisTransport, exporterFeuilleDeRoute, lieuDeRetraitDe, nomFichierBonRemiseTransporteur,
  nomFichierBonRetrait, nomFichierDevisTransport, nomFichierFeuilleDeRoute, totalDevisTransport,
  type ArretTournee, type OptionsBonRemiseTransporteur, type OptionsDevisTransport,
} from '../src/lib/pdf-livraison-docs';

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

// ─── Lire ce que le PDF écrit réellement (même lecteur que test-pdf-commande-boutique) ─────

const WINANSI: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const decoder = (brut: string) => Array.from(brut.replace(/\\([()\\])/g, '$1'))
  .map(ch => WINANSI[ch.charCodeAt(0)] ?? ch).join('');

interface Ecrit { page: number; x: number; y: number; texte: string; taille: number; largeur: number }

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
const paginations = (lu: Lu) => lu.ecrits.filter(e => /^Page \d+ \/ \d+$/.test(e.texte))
  .sort((a, b) => a.page - b.page).map(e => `${e.page}:${e.texte}`);
const compte = (lu: Lu, texte: string) => lu.ecrits.filter(e => e.texte === texte).length;
/** Premier fragment qui contient `motif`, dans l'ordre de lecture (page, puis de haut en bas). */
const position = (lu: Lu, motif: string) => {
  const e = lu.ecrits.filter(x => x.texte.includes(motif)).sort((a, b) => a.page - b.page || b.y - a.y)[0];
  return e ? e.page * 10_000 - e.y : -1;
};

const LARGEUR_PAGE = 595.28;
const HAUTEUR_PAGE = 841.89;
const MARGE_PT = 39.69;

function horsMarges(lu: Lu): Ecrit[] {
  return lu.ecrits.filter(e => e.texte.trim() && (
    e.x < MARGE_PT - 0.5 || e.x + e.largeur > LARGEUR_PAGE - MARGE_PT + 0.5 || e.y < 5 || e.y > HAUTEUR_PAGE - 5));
}

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

function rienDInterne(lu: Lu, nom: string) {
  check(`${nom} : ni note interne, ni motif d’annulation, ni prix d’achat`,
    !lu.texte.includes('CLIENT DIFFICILE') && !lu.texte.includes('MOTIF SECRET') && !lu.texte.includes('812,5')
    && !/revient/i.test(lu.texte), lu.texte.slice(0, 200));
}

// ─── Des commandes et des réglages comme on en aura ──────────────────────────

const RIB = '011780000012345678901234';
const RIB_LISIBLE = '011 780 0000123456789012 34';
const reglages = lireReglagesReception({
  virement: { actif: true, titulaire: 'LEBTEX SARLAU', banque: 'Banque Populaire', rib: '011 780 0000123456789012 34' },
});
const reglagesSansVirement = lireReglagesReception({ carte: { actif: true } });

const ligne = (productName: string, prix: number, quantity: number, variant: any = null, volumineux = false) =>
  ({ productId: productName, productName, productImage: '/placeholder.png', price: prix, unitPrice: prix, quantity, variant, maxStock: 99, volumineux }) as any;

/** Deux rouleaux entiers à livrer à Casablanca par la camionnette, payés en espèces. */
const rouleaux: ShopOrder = {
  id: 'r1',
  orderNumber: 'LBT-MG9ROUL1-A1B2',
  customerName: 'Atelier Salma Couture',
  customerPhone: '0612345678',
  customerEmail: 'salma.couture@gmail.com',
  status: 'confirmed',
  items: [
    { ...ligne('TAFFETA FABRIC ROULEAU 100 M', 1200, 2, { color: 'Noir 580' }, true), purchasePrice: 812.5 },
    ligne('DOUBLURE POLYESTER 180G ROULEAU 50 M', 900, 1, { color: 'Beige 101' }, true),
  ],
  subtotal: 3300,
  deliveryFee: 0,
  total: 3300,
  shippingAddress: {
    fullName: 'Salma Idrissi', phone: '06 12 34 56 78', phone2: '0522998877',
    address: 'Rue Abou Kacem Chabi, immeuble 7, rez-de-chaussée, atelier au fond de la cour', city: 'Casablanca',
  },
  paymentMethod: 'cod',
  reception: { mode: 'transport', volumineux: true, preferenceTransport: 'camionnette' },
  noteInterne: 'CLIENT DIFFICILE — PAS DE REMISE',
  motifAnnulation: 'MOTIF SECRET',
  createdAt: { seconds: Date.UTC(2026, 8, 29, 8, 30) / 1000 },
};

/** Grosse commande pour Agadir, par un transporteur de Derb Omar, avec une réduction. */
const agadir: ShopOrder = {
  id: 'a1',
  orderNumber: 'LBT-MG9AGAD1-C3D4',
  customerName: 'Boutique Tissus Souss',
  customerPhone: '0661234567',
  status: 'confirmed',
  items: [
    ligne('TAFFETA FABRIC ROULEAU 100 M', 1200, 3, { color: 'Rouge bordeaux' }, true),
    ligne('ENTOILAGE THERMOCOLLANT ROULEAU 100 M', 850, 2, { color: 'Blanc', size: '90 cm' }, true),
  ],
  subtotal: 5300,
  deliveryFee: 0,
  discount: 100,
  couponCode: 'PRO100',
  total: 5200,
  shippingAddress: { fullName: 'Brahim Oufkir', phone: '0661234567', address: 'Hay Dakhla, rue 12, n° 4', city: 'Agadir' },
  paymentMethod: 'cod',
  reception: { mode: 'transport', volumineux: true, preferenceTransport: 'transporteur' },
  createdAt: '2026-09-28T16:10:00Z',
};

/** Petits articles à retirer à Derb Omar, payés par virement. */
const petite: ShopOrder = {
  id: 'p1',
  orderNumber: 'LBT-MG9PETI1-E5F6',
  customerName: 'Nadia Berrada',
  customerPhone: '0700112233',
  status: 'ready_for_pickup',
  items: [
    ligne('FERMETURE INVISIBLE NYLON N3', 3, 100, { model: 'Invisible', color: 'Noir 580', size: '20 cm' }),
    ligne('FIL POLYESTER 120 5000 M', 25, 4, { color: 'Blanc optique' }),
  ],
  subtotal: 400,
  deliveryFee: 0,
  total: 400,
  shippingAddress: { fullName: 'Nadia Berrada', phone: '0700112233', address: '', city: 'Casablanca' },
  paymentMethod: 'virement',
  reception: { mode: 'retrait', volumineux: false, lieuRetrait: 'derb_omar' },
  createdAt: new Date(Date.UTC(2026, 8, 29, 9, 45)),
};

/** Tout en arabe, numéro tapé en chiffres arabes, pas encore confirmée. */
const arabe: ShopOrder = {
  id: 'ar1',
  orderNumber: 'LBT-MG9ARAB1-7TRE',
  customerName: 'محمد العلوي',
  customerPhone: '٠٦٦١٢٢٣٣٤٤',
  status: 'pending',
  items: [ligne('TAFFETA FABRIC ROULEAU 100 M', 1200, 1, { color: 'Nickel' }, true)],
  subtotal: 1200,
  deliveryFee: 0,
  total: 1200,
  shippingAddress: { fullName: 'محمد العلوي', phone: '٠٦٦١٢٢٣٣٤٤', address: 'حي السلام، زنقة 5 رقم ١٢', city: 'Fès' },
  paymentMethod: 'cod',
  reception: { mode: 'transport', volumineux: true },
  notes: 'عافاك عيط قبل ما تجي',
  createdAt: new Date(Date.UTC(2026, 8, 29, 20, 40)),
};

const prix = (n: number) => formatPrice(n).replace(/[   ]/g, ' ');
const EMIS = Date.UTC(2026, 8, 29, 10, 0); // 11:00 au Maroc

const devisCamionnette: OptionsDevisTransport = {
  reglages, mode: 'camionnette', prixTransport: 50, poidsEstimeKg: 38.5, nbColis: 3,
  delai: 'tournée du jeudi 01/10', emisLe: EMIS,
};
const devisTransporteur: OptionsDevisTransport = {
  reglages: reglagesSansVirement, mode: 'transporteur', prixTransport: 350, paiementTransport: 'a_l_arrivee',
  transporteur: 'Transport Souss Express', depot: 'Dépôt Souss Express, route de Marrakech, Inezgane', emisLe: EMIS,
};
const remiseComplete: OptionsBonRemiseTransporteur = {
  transporteur: 'Transport Souss Express', telephoneTransporteur: '0661 23 45 67', chauffeur: 'Brahim',
  plaque: '12345-a-6', depot: 'Dépôt Souss Express, route de Marrakech, Inezgane', nbColis: 4, poidsKg: 76.5,
  numeroEnvoi: 'SE-2026-0042', paiementTransport: 'a_l_arrivee', prixTransport: 350, remisLe: EMIS,
};

(async () => {
  console.log('\n── Le magasin de retrait ──');
  check('une commande de rouleaux se retire à CHRIFA', lieuDeRetraitDe(rouleaux) === 'chrifa');
  check('des petits articles se retirent à Derb Omar', lieuDeRetraitDe({ ...petite, reception: undefined }) === 'derb_omar');
  check('une ancienne commande sans réception mais avec un rouleau va à CHRIFA',
    lieuDeRetraitDe({ ...rouleaux, reception: undefined }) === 'chrifa');
  check('le lieu écrit sur la commande l’emporte', lieuDeRetraitDe({ ...petite, reception: { mode: 'retrait', volumineux: false, lieuRetrait: 'chrifa' } }) === 'chrifa');

  console.log('\n── Devis : camionnette à Casablanca, virement proposé ──');
  check('total = articles + transport', totalDevisTransport(rouleaux, devisCamionnette) === 3350, String(totalDevisTransport(rouleaux, devisCamionnette)));
  const dc = lire(await construireDevisTransport(rouleaux, devisCamionnette));
  check('il tient sur une page', dc.pages === 1, String(dc.pages));
  check('le titre est celui du document', dc.texte.includes('DEVIS DE TRANSPORT'));
  check('le numéro de commande est écrit', dc.texte.includes('LBT-MG9ROUL1-A1B2'));
  check('la date du devis, heure du Maroc', dc.texte.includes('Établi le 29/09/2026 à 11:00'), dc.texte.slice(0, 300));
  check('la validité de 48 h, avec sa date de fin', dc.texte.includes('Valable 48 h, jusqu’au 01/10/2026 à 11:00')
    && dc.texte.includes('Prix du transport garanti 48 h, jusqu’au 01/10/2026 à 11:00.'));
  check('le mode : camionnette LEBTEX', dc.texte.includes('CAMIONNETTE LEBTEX') && dc.texte.includes('Camionnette LEBTEX'));
  check('les jours de tournée viennent des réglages', dc.texte.includes('Tournées : mardi et jeudi'));
  check('le poids estimé et les colis', dc.texte.includes('Poids estimé : environ 38,5 kg') && dc.texte.includes('3 colis'), dc.texte);
  check('le délai convenu', dc.texte.includes('Quand : tournée du jeudi 01/10'));
  check('l’adresse de livraison', dc.texte.includes('Rue Abou Kacem Chabi') && dc.texte.includes('CASABLANCA'));
  check('le prix du transport est écrit', dc.ecrits.some(e => e.texte === prix(50)));
  const totalDc = dc.ecrits.filter(e => e.texte === prix(3350));
  check('le total (articles + transport) est en gros', totalDc.length >= 2 && Math.max(...totalDc.map(e => e.taille)) >= 13,
    JSON.stringify(totalDc.map(e => e.taille)));
  check('les articles et leur couleur', dc.texte.includes('TAFFETA FABRIC ROULEAU 100 M') && dc.ecrits.some(e => e.texte === 'Noir 580')
    && dc.ecrits.some(e => e.texte === prix(2400)));
  check('les téléphones du client', ['06 12 34 56 78', '05 22 99 88 77'].every(t => dc.ecrits.some(e => e.texte === t)));
  check('les espèces au chauffeur LEBTEX', dc.texte.includes('Espèces : au chauffeur LEBTEX'));
  check('pas d’avertissement de plafond sous 5 000 MAD', !dc.texte.includes('Au-delà de'));
  check('le RIB, découpé comme sur un relevé', dc.ecrits.some(e => e.texte === RIB_LISIBLE), dc.texte);
  check('le RIB en gros', dc.ecrits.some(e => e.texte === RIB_LISIBLE && e.taille >= 12));
  check('le titulaire et la banque', dc.texte.includes('LEBTEX SARLAU') && dc.texte.includes('Banque Populaire'));
  check('le motif du virement est le numéro de commande', dc.texte.includes('Commande LBT-MG9ROUL1-A1B2') && dc.texte.includes('Motif'));
  check('une capture d’écran ne vaut pas paiement', dc.texte.includes('une capture d’écran ne suffit pas'));
  check('« LEBTEX ne change jamais de RIB par message. »', dc.texte.includes(MENTION_RIB));
  check('et le pied de page le répète', dc.texte.includes(MENTION_RIB.toUpperCase()));
  check('pas de carte tant qu’elle n’est pas active', !dc.texte.includes('Carte bancaire'));
  check('le RIB n’est jamais écrit collé (24 chiffres d’un bloc)', !dc.texte.includes(RIB));
  check('le pied est paginé', JSON.stringify(paginations(dc)) === JSON.stringify(['1:Page 1 / 1']), JSON.stringify(paginations(dc)));
  rienDInterne(dc, 'devis camionnette');
  controlesDeMiseEnPage(dc, 'devis camionnette');

  console.log('\n── Devis : camionnette offerte, au-dessus du plafond d’espèces ──');
  const grosse: ShopOrder = { ...rouleaux, items: [ligne('TAFFETA FABRIC ROULEAU 100 M', 1200, 5, { color: 'Noir' }, true), ligne('DOUBLURE ROULEAU', 400, 1, null, true)], subtotal: 6400, total: 6400 };
  const dg = lire(await construireDevisTransport(grosse, { ...devisCamionnette, prixTransport: 0 }));
  check('un transport offert s’écrit « Offert »', dg.ecrits.some(e => e.texte === 'Offert'));
  check('le total est celui des articles', dg.ecrits.some(e => e.texte === prix(6400)));
  check('au-delà de 5 000 MAD, le virement est proposé sans être imposé',
    dg.texte.includes(`Au-delà de ${prix(PLAFOND_ESPECES_TOURNEE)}`) && dg.texte.includes('on s’arrange au téléphone'), dg.texte);
  controlesDeMiseEnPage(dg, 'devis au-dessus du plafond');

  console.log('\n── Devis : transporteur jusqu’à Agadir, transport payé à l’arrivée ──');
  check('le transport payé à l’arrivée n’entre pas dans le total', totalDevisTransport(agadir, devisTransporteur) === 5200);
  check('payé avec la commande, il y entre', totalDevisTransport(agadir, { ...devisTransporteur, paiementTransport: 'avec_la_commande' }) === 5550);
  const dt = lire(await construireDevisTransport(agadir, devisTransporteur));
  check('il tient sur une page', dt.pages === 1, String(dt.pages));
  check('le mode : transporteur jusqu’à la ville du client', dt.texte.includes('TRANSPORTEUR') && dt.texte.includes('Transporteur jusqu’à AGADIR'));
  check('le nom du transporteur et son dépôt', dt.texte.includes('Transport Souss Express') && dt.texte.includes('route de Marrakech, Inezgane'));
  check('le client récupère au dépôt', dt.texte.includes('vous la récupérez à ce dépôt'), dt.texte);
  check('la réduction est déduite', dt.texte.includes('Réduction (PRO100)') && dt.texte.includes(`-${prix(100)}`));
  check('le total à payer à LEBTEX exclut le transport', dt.ecrits.some(e => e.texte === prix(5200)) && !dt.texte.includes(prix(5550)));
  check('le transport est annoncé, payé au transporteur', dt.texte.includes(`+ transport ${prix(350)}, payé au transporteur`), dt.texte);
  check('les espèces se règlent comme convenu au téléphone', dt.texte.includes('Espèces : selon ce qui est convenu au téléphone.'));
  check('pas d’avertissement de tournée pour un transporteur', !dt.texte.includes('Au-delà de'));
  check('virement pas réglé : aucun RIB', !dt.texte.includes('Titulaire') && !dt.texte.includes(RIB_LISIBLE));
  check('la carte, une fois active, est proposée', dt.texte.includes('Carte bancaire'));
  check('la mention RIB reste, même sans virement', dt.texte.includes(MENTION_RIB));
  controlesDeMiseEnPage(dt, 'devis transporteur');

  console.log('\n── Devis : cas limites ──');
  const sansPrix: ShopOrder = { ...rouleaux, items: [...rouleaux.items, ligne('ROULEAU SUR COMMANDE', 0, 1, null, true)] };
  const ds = lire(await construireDevisTransport(sansPrix, devisCamionnette));
  check('un article sans prix dit « à fixer »', compte(ds, 'à fixer') === 2);
  check('et le devis le signale', ds.texte.includes('Prix à fixer au téléphone') && ds.texte.includes('TOTAL (HORS PRIX À FIXER)'));
  const da = lire(await construireDevisTransport(arabe, { ...devisTransporteur, depot: undefined, transporteur: undefined }));
  check('un client écrit en arabe : mention, pas de caractères cassés', (da.texte.match(/\(en arabe — voir la commande\)/g) || []).length >= 1);
  check('son téléphone en chiffres arabes est lisible', da.ecrits.some(e => e.texte === '06 61 22 33 44'));
  check('sans dépôt connu, le devis dit qu’il sera donné au départ', da.texte.includes('Dépôt du transporteur à FÈS : adresse donnée au départ'), da.texte);
  check('une commande pas encore confirmée le dit', da.texte.includes('pas encore confirmée'));
  controlesDeMiseEnPage(da, 'devis en arabe');
  const dl = lire(await construireDevisTransport({ ...rouleaux, subtotal: 1234567.5, total: 1234567.5 }, devisCamionnette));
  controlesDeMiseEnPage(dl, 'devis au gros montant');

  console.log('\n── Bon de retrait : rouleaux à CHRIFA, espèces ──');
  const br = lire(await construireBonRetrait(rouleaux, reglages, { nbColis: 3 }));
  check('il tient sur une page', br.pages === 1, String(br.pages));
  check('le titre et le numéro', br.texte.includes('BON DE RETRAIT') && br.texte.includes('LBT-MG9ROUL1-A1B2'));
  check('la date de la commande', br.texte.includes('Reçue le 29/09/2026 à 09:30'), br.texte.slice(0, 300));
  check('le lieu vient des réglages : CHRIFA', br.ecrits.some(e => e.texte === 'CHRIFA') && br.texte.includes('LEBTEX CHRIFA')
    && br.texte.includes('Boulevard Haïfa') && br.texte.includes('Lundi au samedi'));
  check('le téléphone du magasin', br.texte.includes('+212 760 998 347'));
  check('les articles à remettre', br.texte.includes('ARTICLES À REMETTRE') && br.texte.includes('DOUBLURE POLYESTER 180G ROULEAU 50 M'));
  check('le montant à payer', br.texte.includes('TOTAL À PAYER') && compte(br, prix(3300)) >= 2);
  check('le retrait est gratuit', br.texte.includes('Retrait') && br.ecrits.some(e => e.texte === 'Gratuit'));
  check('paiement sur place', br.texte.includes('Paiement sur place.'));
  check('le nombre de colis', br.texte.includes('Nombre de colis remis :') && br.ecrits.some(e => e.texte === '3' && e.taille >= 13));
  check('les cases « remis par » et « reçu par »', br.texte.includes('REMIS PAR (LEBTEX)') && br.texte.includes('REÇU PAR — EN BON ÉTAT')
    && compte(br, 'Nom :') === 2 && compte(br, 'Date :') === 2 && compte(br, 'Signature :') === 2);
  check('celui qui vient à la place du client est prévu', br.texte.includes('S’il envoie quelqu’un'));
  check('pas d’alerte de virement pour des espèces', !br.texte.includes('pas encore vu'));
  check('pas de RIB sur un bon de retrait', !br.texte.includes(RIB_LISIBLE) && !br.texte.includes('Titulaire'));
  check('le pied dit que ce bon ne vaut pas facture', br.texte.includes('CE BON NE VAUT PAS FACTURE'));
  rienDInterne(br, 'bon de retrait');
  controlesDeMiseEnPage(br, 'bon de retrait');

  console.log('\n── Bon de retrait : payé par virement, à Derb Omar ──');
  const bp = lire(await construireBonRetrait(petite, reglages, { paiementRecu: true, nbColis: 1 }));
  check('Derb Omar', bp.ecrits.some(e => e.texte === 'DERB OMAR') && bp.texte.includes('LEBTEX Derb Omar'));
  check('« Payé par virement » à la place du montant', bp.ecrits.some(e => e.texte === 'Payé par virement'));
  check('reste à payer : 0', bp.texte.includes('RESTE À PAYER') && bp.ecrits.some(e => e.texte === prix(0)));
  check('le montant déjà payé est rappelé', bp.texte.includes(`Déjà payé par virement : ${prix(400)}.`), bp.texte);
  check('aucune alerte', !bp.texte.includes('pas encore vu'));
  controlesDeMiseEnPage(bp, 'retrait payé');

  const bv = lire(await construireBonRetrait(petite, reglages));
  check('virement annoncé mais pas vu : encaisser sur place ou attendre', bv.texte.includes('Virement pas encore vu sur le compte')
    && bv.texte.includes('capture d’écran ne suffit pas'), bv.texte);
  check('le montant reste à payer', bv.texte.includes('TOTAL À PAYER'));
  check('sans nombre de colis connu, la case reste à remplir', bv.texte.includes('Nombre de colis remis :')
    && !bv.ecrits.some(e => /^\d+$/.test(e.texte) && e.taille >= 13));
  controlesDeMiseEnPage(bv, 'retrait virement non vu');

  const bo = lire(await construireBonRetrait(rouleaux, reglages, { lieu: 'derb_omar' }));
  check('le magasin peut être choisi à l’impression', bo.ecrits.some(e => e.texte === 'DERB OMAR'));
  const bferme = lire(await construireBonRetrait(rouleaux, lireReglagesReception({ lieux: { chrifa: { nom: 'Stock CHRIFA — quai 2', adresse: 'Rue 8, Chrifa', horaires: 'Lun.–sam., 9h – 17h' } } })));
  check('le nom et l’adresse suivent les réglages', bferme.texte.includes('Stock CHRIFA — quai 2') && bferme.texte.includes('Rue 8, Chrifa'));
  const ba = lire(await construireBonRetrait(arabe, reglages));
  check('en arabe : mention, pas de caractères cassés', ba.texte.includes(MARQUE_ARABE));
  check('une commande pas encore confirmée le dit', ba.texte.includes('pas encore confirmée'));
  controlesDeMiseEnPage(ba, 'retrait en arabe');
  const ancienne = lire(await construireBonRetrait({ ...rouleaux, paymentMethod: undefined as any }, reglages));
  check('une ancienne commande sans moyen de paiement se lit en espèces, sans alerte', !ancienne.texte.includes('pas encore vu')
    && ancienne.texte.includes('TOTAL À PAYER'));
  const bann = lire(await construireBonRetrait({ ...rouleaux, status: 'cancelled' }, reglages));
  check('une commande annulée : ne rien remettre', bann.texte.includes('ne rien remettre'));

  console.log('\n── Feuille de route ──');
  const mohammedia: ShopOrder = {
    ...rouleaux, id: 'm1', orderNumber: 'LBT-MG9MOHA1-0001', customerName: 'Couture Mohammedia', customerPhone: '0611111111',
    total: 1200, subtotal: 1200, shippingAddress: { fullName: 'Couture Mohammedia', phone: '0611111111', address: 'Bd Hassan II, n° 45', city: 'Mohammedia' },
  };
  const aVirement: ShopOrder = {
    ...rouleaux, id: 'v1', orderNumber: 'LBT-MG9VIRE1-0002', customerName: 'Karima Tazi', customerPhone: '0622222222',
    paymentMethod: 'virement', total: 2500, subtotal: 2500,
    shippingAddress: { fullName: 'Karima Tazi', phone: '0622222222', address: 'Rue 14, Hay Moulay Rachid', city: 'casablanca' },
  };
  const virementNonVu: ShopOrder = {
    ...rouleaux, id: 'v2', orderNumber: 'LBT-MG9VIRE2-0003', customerName: 'Omar Benjelloun', customerPhone: '0633333333',
    paymentMethod: 'virement', total: 800, subtotal: 800,
    shippingAddress: { fullName: 'Omar Benjelloun', phone: '0633333333', address: 'Rue Ibnou Mounir, n° 8', city: 'Casablanca' },
  };
  const annulee: ShopOrder = {
    ...rouleaux, id: 'x1', orderNumber: 'LBT-MG9ANNU1-0004', customerName: 'Client Bouskoura', status: 'cancelled',
    customerPhone: '0644444444', shippingAddress: { fullName: 'Client Bouskoura', phone: '0644444444', address: 'Ville Verte', city: 'Bouskoura' },
  };
  const avecTransport: ShopOrder = {
    ...rouleaux, id: 't1', orderNumber: 'LBT-MG9TRAN1-0005', customerName: 'Hind Alaoui', customerPhone: '0655555555',
    total: 1500, subtotal: 1500, notes: 'Appeler 30 min avant, 3e étage sans ascenseur.',
    shippingAddress: { fullName: 'Hind Alaoui', phone: '0655555555', address: 'Résidence Al Fath, bloc C', city: 'Casablanca' },
  };
  const arrets: (ShopOrder | ArretTournee)[] = [
    { commande: mohammedia, nbColis: 1 },
    { commande: rouleaux, nbColis: 3, quartier: 'Maârif' },
    { commande: annulee, nbColis: 2 },
    { commande: aVirement, nbColis: 2, quartier: 'Aïn Sebaâ', paiementRecu: true },
    { commande: virementNonVu, nbColis: 1, quartier: 'Maârif' },
    { commande: avecTransport, nbColis: 2, quartier: 'Aïn Sebaâ', aEncaisser: 1550 },
  ];
  const ranges = arretsRanges(arrets).map(a => a.arret.commande.orderNumber);
  check('rangés par ville puis par quartier, l’ordre donné gardé dans un quartier',
    JSON.stringify(ranges) === JSON.stringify(['LBT-MG9ANNU1-0004', 'LBT-MG9VIRE1-0002', 'LBT-MG9TRAN1-0005', 'LBT-MG9ROUL1-A1B2', 'LBT-MG9VIRE2-0003', 'LBT-MG9MOHA1-0001']),
    JSON.stringify(ranges));
  check('« casablanca » et « Casablanca » vont ensemble', arretsRanges(arrets).filter(a => a.ville === 'CASABLANCA').length === 4);
  const accents = lire(await construireFeuilleDeRoute([
    { commande: rouleaux, quartier: 'Aïn Sebaâ' }, { commande: mohammedia, quartier: 'Centre' },
    { commande: { ...virementNonVu, paymentMethod: 'cod' }, quartier: 'ain sebaa' },
  ], { date: Date.UTC(2026, 8, 30, 7) }));
  check('« Aïn Sebaâ » et « ain sebaa » : un seul titre de quartier', compte(accents, 'CASABLANCA — AÏN SEBAÂ') === 1
    && !accents.texte.includes('CASABLANCA — AIN SEBAA'), accents.ecrits.filter(e => e.texte.startsWith('CASABLANCA')).map(e => e.texte).join(' | '));
  check('espèces attendues : annulée et virement vu exclus, montant convenu retenu',
    especesAttendues(arrets) === 3300 + 1200 + 800 + 1550, String(especesAttendues(arrets)));

  const fr = lire(await construireFeuilleDeRoute(arrets, { date: Date.UTC(2026, 8, 30, 7), chauffeur: 'Hassan', vehicule: 'Camionnette 45678-B-1' }));
  check('elle tient sur une page', fr.pages === 1, String(fr.pages));
  check('le titre et le jour', fr.texte.includes('FEUILLE DE ROUTE') && fr.texte.includes('Mercredi 30/09/2026'), fr.texte.slice(0, 300));
  check('le chauffeur et le véhicule', fr.ecrits.some(e => e.texte === 'Hassan') && fr.texte.includes('Camionnette 45678-B-1'));
  check('le départ par défaut : le stock de CHRIFA', fr.texte.includes('LEBTEX CHRIFA'));
  const groupes = ['BOUSKOURA', 'CASABLANCA — AÏN SEBAÂ', 'CASABLANCA — MAÂRIF', 'MOHAMMEDIA'];
  check('une ligne de titre par ville et quartier, dans l’ordre', groupes.every(g => fr.ecrits.some(e => e.texte === g))
    && groupes.every((g, i) => i === 0 || position(fr, groupes[i - 1]) < position(fr, g)),
    groupes.map(g => position(fr, g)).join(', '));
  check('chaque client avec son téléphone et son numéro de commande',
    ['Karima Tazi', '06 22 22 22 22', 'LBT-MG9VIRE1-0002', 'Couture Mohammedia', '06 11 11 11 11', '06 12 34 56 78 / 05 22 99 88 77']
      .every(t => fr.ecrits.some(e => e.texte === t)));
  check('l’adresse et la note du client', fr.texte.includes('Rue Ibnou Mounir, n° 8') && fr.texte.includes('Note : Appeler 30 min avant'));
  check('une commande annulée : « ne pas livrer », rien à encaisser', fr.texte.includes('ANNULÉE : ne pas livrer') && fr.ecrits.some(e => e.texte === '—'));
  check('un virement vu : « Déjà payé », rien à encaisser', fr.ecrits.some(e => e.texte === 'Déjà payé'));
  check('un virement pas vu : appeler le bureau', fr.texte.includes('Virement non vu : appeler le bureau')
    && fr.texte.includes('1 virement annoncé n’est pas encore vu sur le compte'));
  check('le montant convenu au téléphone remplace le total', fr.ecrits.some(e => e.texte === prix(1550)));
  check('le total des espèces attendues', compte(fr, prix(6850)) >= 2 && fr.texte.includes('ESPÈCES ATTENDUES'));
  check('au-dessus du plafond, l’alerte le dit avant la liste',
    fr.texte.includes(`au-dessus du plafond de ${prix(5000)} par tournée`) && position(fr, 'au-dessus du plafond') < position(fr, 'BOUSKOURA'));
  check('le plafond est rappelé dans les consignes', fr.texte.includes(`${prix(5000)} d’espèces au plus par tournée.`));
  check('seul le chauffeur nommé encaisse', fr.texte.includes('Seul le chauffeur nommé ci-dessus encaisse'));
  check('5 arrêts et 9 colis (l’annulée ne compte pas)', fr.texte.includes('5 arrêts · 9 colis'), fr.texte.slice(0, 400));
  check('une colonne « Encaissé » à remplir à la main', fr.texte.includes('Encaissé'));
  check('trois cases de signature', ['CHARGÉ PAR', 'CHAUFFEUR — COLIS REÇUS', 'RETOUR — ESPÈCES COMPTÉES'].every(t => fr.texte.includes(t))
    && compte(fr, 'Signature :') === 3 && compte(fr, 'Montant :') === 1);
  check('document interne', fr.texte.includes('DOCUMENT INTERNE'));
  check('pas de RIB sur la feuille de route', !fr.texte.includes(RIB_LISIBLE));
  rienDInterne(fr, 'feuille de route');
  controlesDeMiseEnPage(fr, 'feuille de route');

  const petiteTournee = lire(await construireFeuilleDeRoute([rouleaux, mohammedia], { date: Date.UTC(2026, 8, 30, 7) }));
  check('sous le plafond : pas d’alerte', !petiteTournee.texte.includes('au-dessus du plafond'));
  check('des commandes seules sont acceptées', petiteTournee.texte.includes('LBT-MG9ROUL1-A1B2') && petiteTournee.texte.includes(prix(4500)));
  check('sans chauffeur ni colis connus, rien d’inventé', !petiteTournee.texte.includes('colis ·') && !petiteTournee.texte.includes(' colis'), petiteTournee.texte.slice(0, 300));
  controlesDeMiseEnPage(petiteTournee, 'petite tournée');
  const plafondHaut = lire(await construireFeuilleDeRoute(arrets, { date: Date.UTC(2026, 8, 30, 7), plafondEspeces: 10000 }));
  check('le plafond se règle', !plafondHaut.texte.includes('au-dessus du plafond') && plafondHaut.texte.includes(`${prix(10000)} d’espèces au plus par tournée`));

  const longue = Array.from({ length: 40 }, (_, i): ArretTournee => ({
    commande: {
      ...rouleaux, id: `l${i}`, orderNumber: `LBT-LONG${String(i).padStart(4, '0')}-ZZZZ`, customerName: `Client numéro ${i + 1}`,
      customerPhone: `06${String(10000000 + i).padStart(8, '0')}`,
      shippingAddress: { fullName: `Client ${i}`, phone: '', address: `Résidence ${i}, immeuble ${i % 7}, appartement ${i}, rue très longue du quartier ${i % 5}`, city: i % 3 ? 'Casablanca' : 'Mohammedia' },
    },
    nbColis: 1 + (i % 3),
    quartier: `Quartier ${i % 4}`,
  }));
  const fl = lire(await construireFeuilleDeRoute([...longue, { commande: arabe, nbColis: 1 }], { date: Date.UTC(2026, 8, 30, 7), chauffeur: 'Hassan' }));
  check('une longue tournée passe sur plusieurs pages', fl.pages >= 2, String(fl.pages));
  check('l’en-tête du tableau revient sur chaque page', Array.from({ length: fl.pages }, (_, i) => i + 1)
    .filter(p => fl.ecrits.some(e => e.page === p && e.texte === 'À encaisser')).length >= fl.pages - 1
    && fl.ecrits.filter(e => e.texte === 'À encaisser').length >= fl.pages - 1);
  check('les pages suivantes rappellent la tournée', texteDeLaPage(fl, 2).includes('Feuille de route du Mercredi 30/09/2026 — suite'));
  check('les 41 arrêts sont imprimés', longue.every(a => fl.texte.includes(a.commande.orderNumber)) && fl.texte.includes('LBT-MG9ARAB1-7TRE'));
  check('la pagination suit', paginations(fl).length === fl.pages && paginations(fl)[0] === `1:Page 1 / ${fl.pages}`, JSON.stringify(paginations(fl)));
  check('l’arrêt en arabe garde son téléphone', fl.ecrits.some(e => e.texte === '06 61 22 33 44'));
  controlesDeMiseEnPage(fl, 'longue tournée');
  let refus = '';
  try { await construireFeuilleDeRoute([]); } catch (e: any) { refus = e?.message || ''; }
  check('une tournée vide est refusée avec un message clair', refus === 'Aucune commande dans la tournée.', refus);

  console.log('\n── Bon de remise au transporteur ──');
  const rt = lire(await construireBonRemiseTransporteur(agadir, remiseComplete));
  check('il tient sur une page', rt.pages === 1, String(rt.pages));
  check('le titre et le numéro', rt.texte.includes('BON DE REMISE') && rt.texte.includes('LBT-MG9AGAD1-C3D4'));
  check('la ville de destination', rt.ecrits.some(e => e.texte === 'AGADIR'));
  check('le transporteur, son téléphone, le chauffeur, la plaque', rt.texte.includes('Transport Souss Express')
    && rt.ecrits.some(e => e.texte === '06 61 23 45 67') && rt.ecrits.some(e => e.texte === 'Brahim') && rt.ecrits.some(e => e.texte === '12345-A-6'));
  check('le dépôt où le client récupère', rt.texte.includes('route de Marrakech, Inezgane') && rt.texte.includes('Récupère la marchandise au dépôt'));
  check('le destinataire et ses téléphones', rt.texte.includes('Boutique Tissus Souss') && rt.ecrits.some(e => e.texte === '06 61 23 45 67'));
  check('colis, poids, valeur déclarée et n° d’envoi', compte(rt, '4') >= 2 && rt.texte.includes('76,5 kg')
    && rt.ecrits.some(e => e.texte === prix(5200)) && rt.texte.includes('SE-2026-0042'));
  check('le contenu sans les prix', rt.texte.includes('CONTENU') && rt.texte.includes('ENTOILAGE THERMOCOLLANT ROULEAU 100 M')
    && !rt.texte.includes('P.U.') && !rt.ecrits.some(e => e.texte === prix(1200)));
  check('le transport payé à l’arrivée', rt.texte.includes(`Transport : payé par le destinataire à l’arrivée (${prix(350)}).`));
  check('par défaut, le transporteur n’encaisse rien', rt.texte.includes('Rien à encaisser pour LEBTEX'));
  check('trois signatures : LEBTEX, transporteur, destinataire', ['REMIS PAR (LEBTEX)', 'TRANSPORTEUR — REÇU', 'DESTINATAIRE AU DÉPÔT'].every(t => rt.texte.includes(t))
    && compte(rt, 'Signature :') === 3);
  check('pas de RIB sur le bon de remise', !rt.texte.includes(RIB_LISIBLE));
  rienDInterne(rt, 'bon de remise');
  controlesDeMiseEnPage(rt, 'bon de remise');

  const rm = lire(await construireBonRemiseTransporteur(agadir, { transporteur: 'Camion Hamid' }));
  check('ce qu’on ignore se remplit à la main', compte(rm, '________________') >= 3 && rm.ecrits.some(e => e.texte === '____'), rm.texte);
  check('par défaut, le transport est réglé par LEBTEX', rm.texte.includes('Transport : réglé par LEBTEX.'));
  check('par défaut, la valeur déclarée est celle des articles après réduction', rm.ecrits.some(e => e.texte === prix(5200)));
  controlesDeMiseEnPage(rm, 'bon de remise minimal');
  const re = lire(await construireBonRemiseTransporteur(agadir, { ...remiseComplete, aEncaisser: 2000, valeurDeclaree: 6000 }));
  check('un encaissement convenu est écrit en clair', re.texte.includes(`À encaisser auprès du destinataire, pour LEBTEX : ${prix(2000)}.`));
  check('une valeur déclarée donnée est reprise', re.ecrits.some(e => e.texte === prix(6000)));
  controlesDeMiseEnPage(re, 'bon de remise avec encaissement');
  const rar = lire(await construireBonRemiseTransporteur(arabe, { ...remiseComplete, villeDestination: undefined }));
  check('en arabe : mention, ville latine gardée', rar.texte.includes(MARQUE_ARABE) && rar.ecrits.some(e => e.texte === 'FÈS'));
  controlesDeMiseEnPage(rar, 'bon de remise en arabe');

  console.log('\n── Les noms de fichier ──');
  check('devis', nomFichierDevisTransport(rouleaux) === 'Devis-transport-LBT-MG9ROUL1-A1B2.pdf', nomFichierDevisTransport(rouleaux));
  check('bon de retrait', nomFichierBonRetrait(rouleaux) === 'Bon-retrait-LBT-MG9ROUL1-A1B2.pdf');
  check('feuille de route, au jour du Maroc', nomFichierFeuilleDeRoute({ date: Date.UTC(2026, 8, 29, 23, 30) }) === 'Feuille-de-route-2026-09-30.pdf',
    nomFichierFeuilleDeRoute({ date: Date.UTC(2026, 8, 29, 23, 30) }));
  check('bon de remise', nomFichierBonRemiseTransporteur(agadir) === 'Bon-remise-transporteur-LBT-MG9AGAD1-C3D4.pdf');
  check('un numéro bizarre reste un nom de fichier propre', nomFichierBonRetrait({ ...rouleaux, orderNumber: 'LBT/é 12?' }) === 'Bon-retrait-LBT-e-12.pdf',
    nomFichierBonRetrait({ ...rouleaux, orderNumber: 'LBT/é 12?' }));
  await exporterDevisTransport(rouleaux, devisCamionnette);
  check('le devis se télécharge sous son nom', telecharge === 'Devis-transport-LBT-MG9ROUL1-A1B2.pdf', String(telecharge));
  await exporterBonRetrait(rouleaux, reglages);
  check('le bon de retrait aussi', telecharge === 'Bon-retrait-LBT-MG9ROUL1-A1B2.pdf', String(telecharge));
  await exporterFeuilleDeRoute(arrets, { date: Date.UTC(2026, 8, 30, 7) });
  check('la feuille de route aussi', telecharge === 'Feuille-de-route-2026-09-30.pdf', String(telecharge));
  await exporterBonRemiseTransporteur(agadir, remiseComplete);
  check('le bon de remise aussi', telecharge === 'Bon-remise-transporteur-LBT-MG9AGAD1-C3D4.pdf', String(telecharge));

  // ─── Aperçu ───
  const i = process.argv.indexOf('--apercu');
  if (i > 0 && process.argv[i + 1]) {
    const dossier = process.argv[i + 1];
    mkdirSync(dossier, { recursive: true });
    const ecrireFichier = async (nom: string, doc: Promise<jsPDF>) =>
      writeFileSync(join(dossier, nom), Buffer.from((await doc).output('arraybuffer')));
    await ecrireFichier('devis-camionnette.pdf', construireDevisTransport(rouleaux, devisCamionnette));
    await ecrireFichier('devis-transporteur.pdf', construireDevisTransport(agadir, devisTransporteur));
    await ecrireFichier('bon-retrait.pdf', construireBonRetrait(rouleaux, reglages, { nbColis: 3 }));
    await ecrireFichier('bon-retrait-virement-non-vu.pdf', construireBonRetrait(petite, reglages));
    await ecrireFichier('feuille-de-route.pdf', construireFeuilleDeRoute(arrets, { date: Date.UTC(2026, 8, 30, 7), chauffeur: 'Hassan', vehicule: 'Camionnette 45678-B-1' }));
    await ecrireFichier('bon-remise-transporteur.pdf', construireBonRemiseTransporteur(agadir, remiseComplete));
    console.log(`\nAperçus écrits dans ${dossier} : devis-camionnette.pdf, devis-transporteur.pdf, bon-retrait.pdf, `
      + 'bon-retrait-virement-non-vu.pdf, feuille-de-route.pdf, bon-remise-transporteur.pdf');
  }

  console.log(`\n${pass} réussis, ${fail} échoués`);
  if (fail > 0) process.exit(1);
})();
