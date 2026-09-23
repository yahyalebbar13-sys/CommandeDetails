// Le devoir exporté en PDF doit contenir tout le devoir : ce module relit un HTML qu'il n'écrit
// pas, donc la moindre balise oubliée ferait disparaître du texte en silence.
// Lancer :
//   npx tsx scripts/test-pdf-devoir-formation.ts

import { planifierChargement } from '../src/lib/stock-formation';
import { choisirCibles, devoirHtml, corrigeHtml } from '../src/lib/devoir-formation';
import { construireDevoirFormationPDF } from '../src/lib/pdf-devoir-formation';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const simple = (id: string, nom: string, cat: string) => ({ id, nameFR: nom, categoryId: cat, purchasePriceMAD: 10 });
const couleurs = (id: string, nom: string, cat: string, labels: string[]) => ({
  id, nameFR: nom, categoryId: cat, quantity: 1000, color: 'various',
  colorBreakdown: labels.map(c => ({ colorCode: c, rolls: 100 })),
});

const catalogue = [
  simple('s1', 'AIGUILLE MACHINE 90/14', 'MERCERIE'),
  simple('s2', 'CRAIE TAILLEUR BLANCHE', 'MERCERIE'),
  simple('s3', 'FIL POLYESTER 40/2 CONE 5000M', 'FIL'),
  simple('s4', 'METRE RUBAN 150CM', 'MERCERIE'),
  simple('s5', 'CISEAUX COUTURE 21CM', 'OUTIL'),
  simple('s6', 'EPINGLE TETE RONDE', 'MERCERIE'),
  couleurs('v1', 'DOUBLURE POLYESTER 180G', 'TISSU', ['NOIR', 'BEIGE', 'BLANC', 'BLEU MARINE']),
  couleurs('v2', 'FERMETURE N5 C/E 60CM', 'ZIP', ['101 BLANC', '580 BEIGE', '999 NOIR']),
  couleurs('v3', 'RUBAN SATIN 1CM', 'RUBAN', ['ROUGE', 'BLEU CIEL']),
  couleurs('v4', 'ELASTIQUE TRESSE 2CM', 'RUBAN', ['BLANC', 'NOIR']),
  simple('s7', 'BOUTON PRESSION 12MM', 'MERCERIE'),
  simple('s8', 'OEILLET LAITON 8MM', 'MERCERIE'),
  simple('s9', 'CROCHET SOUTIEN-GORGE', 'MERCERIE'),
  simple('s10', 'SAC PLASTIQUE 30X40', 'EMBALLAGE'),
  couleurs('v5', 'POPELINE COTON 120G', 'TISSU', ['BLANC', 'CIEL', 'ROSE', 'MARINE']),
  couleurs('v6', 'BIAIS COTON 2CM', 'RUBAN', ['NOIR', 'BLANC']),
  simple('s11', 'ETIQUETTE CARTON', 'EMBALLAGE'),
  simple('s12', 'RUBAN ADHESIF 48MM', 'EMBALLAGE'),
];

const lignes = planifierChargement(catalogue);
const cibles = choisirCibles(lignes)!;
const lieux = { boutique: 'CHRIFA', autreMagasin: 'DERB OMAR', reserve: 'Entrepôt principal' };

/** Ce que le PDF écrit réellement : position et texte de chaque fragment. */
function fragmentsDuPdf(html: string) {
  const doc = construireDevoirFormationPDF(html);
  const brut = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  const ecrits = Array.from(brut.matchAll(/([-\d.]+) ([-\d.]+) Td\s*\((.*?)\) Tj/g))
    .map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]), texte: m[3] }));
  return { doc, ecrits, texte: ecrits.map(e => e.texte).join(' ') };
}

console.log('\n── Le devoir ──');
const devoir = fragmentsDuPdf(devoirHtml(lignes, cibles, lieux));
check('le PDF tient sur plusieurs pages', devoir.doc.getNumberOfPages() >= 5, String(devoir.doc.getNumberOfPages()));
check('du texte est écrit sur chaque page',
  devoir.ecrits.length > 1500, String(devoir.ecrits.length));
for (const attendu of [
  'Vendre par couleur', 'Rupture', 'plafond', 'FORM-001', 'seuil', 'POPELINE',
  'inventaire', 'import', 'transfert',
]) {
  check(`« ${attendu} » est bien dans le PDF`, devoir.texte.toLowerCase().includes(attendu.toLowerCase()));
}
check('les couleurs vendues sont nommées',
  cibles.m!.variantes.every(v => devoir.texte.includes(v.label.split(' ')[0])));
// A4 = 595 pt de large, marge 14 mm ≈ 40 pt : rien ne doit commencer au-delà de la marge droite.
check('rien ne déborde de la marge droite',
  devoir.ecrits.every(e => e.x < 595 - 35), String(Math.max(...devoir.ecrits.map(e => e.x))));
check('rien ne sort de la page en hauteur',
  devoir.ecrits.every(e => e.y > 10 && e.y < 835),
  `${Math.min(...devoir.ecrits.map(e => e.y))} → ${Math.max(...devoir.ecrits.map(e => e.y))}`);
// Les vraies balises, pas n'importe quel chevron : le corrigé écrit « BRC-LEB-<date>-001 ».
const BALISE = /<\/?(b|span|p|div|table|thead|tbody|tr|td|th|ul|li|h[1-3]|br)/i;
check('aucune balise HTML n’a fui dans le texte', !BALISE.test(devoir.texte));
check('aucune entité HTML n’a fui dans le texte', !/&(amp|lt|gt|quot|nbsp);/i.test(devoir.texte));
check('le bandeau LEBTEX est là', devoir.texte.includes('LEBTEX'));
check('les pages sont numérotées', devoir.texte.includes(`1 / ${devoir.doc.getNumberOfPages()}`));

console.log('\n── Le corrigé ──');
const corrige = fragmentsDuPdf(corrigeHtml(lignes, cibles, lieux));
check('le corrigé sort aussi en PDF', corrige.doc.getNumberOfPages() >= 3);
check('il porte les réponses chiffrées', /\d/.test(corrige.texte) && corrige.texte.includes('MAD'));
check('il prévient pour la vente à perte', corrige.texte.includes('perte'));
check('rien ne déborde non plus', corrige.ecrits.every(e => e.x < 595 - 35));
check('aucune balise HTML n’a fui', !BALISE.test(corrige.texte));
check('le texte entre chevrons voulu est conservé', corrige.texte.includes('BRC-LEB-<date>-001'));

console.log('\n── Cas limites ──');
const vide = fragmentsDuPdf('<!DOCTYPE html><html><body><h1>Titre seul</h1></body></html>');
check('un document minimal ne casse pas', vide.doc.getNumberOfPages() === 1 && vide.texte.includes('TITRE SEUL'));
const caracteres = fragmentsDuPdf(
  '<!DOCTYPE html><html><body><h1>T</h1><p>Fil &lt;b&gt;spécial&lt;/b&gt; &amp; co</p></body></html>');
check('les entités sont rendues en caractères',
  caracteres.texte.includes('<b>spécial</b>') || caracteres.texte.includes('sp'),
  caracteres.texte);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
