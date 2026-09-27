// Tests de l'e-mail « nouvelle commande » (lib/alerte-commande-boutique.ts).
// Lancer :
//   npx tsx scripts/test-alerte-commande-boutique.ts
// Avec un aperçu de l'e-mail (commande réaliste) écrit dans un fichier HTML :
//   npx tsx scripts/test-alerte-commande-boutique.ts --apercu <chemin.html>

import { writeFileSync } from 'node:fs';
import { emailAlertesEnPause, emailDuClient, emailNouvelleCommande, echapperHtml } from '../src/lib/alerte-commande-boutique';
import type { ShopOrder } from '../src/lib/shop-types';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// 27/09/2026 15:00 à Casablanca (UTC+1)
const MAINTENANT = Date.UTC(2026, 8, 27, 14, 0);
const ilYa = (min: number) => ({ seconds: (MAINTENANT - min * 60_000) / 1000, nanoseconds: 0 });
const LIEN = 'https://www.lebtex.ma/admin-shop?commande=AbCdEf0123456789XyZw';

function commande(p: Partial<ShopOrder> = {}): ShopOrder & { id: string } {
  return {
    id: 'AbCdEf0123456789XyZw',
    orderNumber: 'LBT-MG1K2Z3A-7QX2',
    customerName: 'Fatima Zahra El Idrissi',
    customerPhone: '0612345678',
    customerEmail: 'fatima@example.com',
    status: 'pending',
    items: [
      { productId: 'p1', productName: 'Fermeture Nylon N3', productImage: '', price: 12, unitPrice: 10, quantity: 10, maxStock: 99,
        variant: { model: '20 cm', color: 'Noir 580' } },
      { productId: 'p2', productName: 'Taffetas doublure', productImage: '', price: 18, unitPrice: 18, quantity: 5, maxStock: 0,
        variant: { color: 'Bleu nuit', size: '150 cm' } },
    ],
    subtotal: 190,
    deliveryFee: 25,
    total: 215,
    shippingAddress: { fullName: 'Fatima Zahra El Idrissi', phone: '0612345678', phone2: '+212 661-00-11-22',
      address: '12 Rue Atlas, Maârif', city: 'Casablanca', region: 'Grand Casablanca' },
    paymentMethod: 'cod',
    notes: 'Livrer après 18h, 2e étage (interphone en panne).',
    createdAt: ilYa(3),
    ...p,
  };
}

console.log('\n── Échappement ──');
check('échappe les cinq caractères', echapperHtml(`<a href="x">'&'</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
const piege = emailNouvelleCommande(commande({
  customerName: '<script>alert(1)</script>',
  shippingAddress: { fullName: '<img src=x onerror=alert(2)>', phone: '0612345678', address: '<b>rue</b> "Atlas"', city: 'Casa<script>' },
  notes: `Sonner "deux fois" l'après-midi & pas avant <b>14h</b>`,
  items: [{ productId: 'p', productName: 'Ruban <i>satin</i>', productImage: '', price: 5, unitPrice: 5, quantity: 2, maxStock: 0,
    variant: { color: '"><svg onload=alert(3)>' } }],
  subtotal: 10, total: 35,
}), LIEN, MAINTENANT);
check('nom : jamais de <script> brut', !piege.html.includes('<script') && piege.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
check('nom de livraison échappé', !piege.html.includes('<img') && piege.html.includes('&lt;img src=x onerror=alert(2)&gt;'));
check('note : guillemets, apostrophe et & échappés',
  piege.html.includes('Sonner &quot;deux fois&quot; l&#39;après-midi &amp; pas avant &lt;b&gt;14h&lt;/b&gt;')
  && !piege.html.includes(`"deux fois"`) && !piege.html.includes(`l'après-midi`) && !piege.html.includes('<b>14h'));
check('adresse échappée', piege.html.includes('&lt;b&gt;rue&lt;/b&gt; &quot;Atlas&quot;') && !piege.html.includes('<b>rue'));
check('produit et variante échappés', !piege.html.includes('<i>satin') && !piege.html.includes('<svg') && piege.html.includes('&quot;&gt;&lt;svg onload=alert(3)&gt;'));
check('sujet sur une seule ligne', !/[\r\n]/.test(piege.sujet), piege.sujet);
check('un nom très long est coupé dans le sujet',
  emailNouvelleCommande(commande({ customerName: 'A'.repeat(500) }), LIEN, MAINTENANT).sujet.length < 200);
check('texte brut : garde les données telles quelles', piege.texte.includes('<script>alert(1)</script>'));

console.log('\n── Contenu ──');
const e = emailNouvelleCommande(commande(), LIEN, MAINTENANT);
check('sujet : nom, ville, total, numéro',
  e.sujet.startsWith('🛒 Nouvelle commande — Fatima Zahra El Idrissi, Casablanca — ') && e.sujet.includes('215') && e.sujet.includes('LBT-MG1K2Z3A-7QX2'), e.sujet);
check('reçue aujourd’hui à l’heure du Maroc', e.html.includes('Reçue aujourd&#39;hui à 14:57') && e.texte.includes("Reçue aujourd'hui à 14:57"));
check('bandeau « Nouvelle commande sur lebtex.ma »', e.html.includes('Nouvelle commande sur lebtex.ma'));
check('total à encaisser en gros', /Total à encaisser[\s\S]*?font-size:34px[^>]*>215/.test(e.html));
check('lien d’appel du principal', e.html.includes('href="tel:+212612345678"'));
check('lien d’appel du 2e numéro', e.html.includes('href="tel:+212661001122"'));
check('deux téléphones lisibles', e.html.includes('06 12 34 56 78') && e.html.includes('06 61 00 11 22'));
check('deux liens WhatsApp avec le message de confirmation',
  e.html.includes('href="https://wa.me/212612345678?text=Bonjour%20Fatima') && e.html.includes('href="https://wa.me/212661001122?text='));
check('lien admin sur le bouton', e.html.includes(`href="${LIEN}"`) && e.html.includes('Ouvrir la commande') && e.texte.includes(LIEN));
check('variante complète', e.html.includes('Modèle : <strong') && e.html.includes('20 cm') && e.html.includes('Taille : <strong') && e.html.includes('150 cm'));
check('prix appliqué, pas le prix de base', e.html.includes('10 MAD / unité') && !e.html.includes('12 MAD / unité'), '');
check('livraison, sous-total', e.html.includes('Sous-total') && e.html.includes('190') && e.html.includes('Livraison (Casablanca)'));
check('note du client', e.html.includes('Livrer après 18h') && e.texte.includes('NOTE DU CLIENT'));
check('adresse complète', e.html.includes('12 Rue Atlas, Maârif') && e.html.includes('Casablanca · Grand Casablanca'));
check('pas de mention prix de gros quand les lignes collent', !e.html.includes('Prix de gros appliqué'));
check('pas de « prix à fixer » quand tout a un prix', !e.html.includes('prix à fixer'));
check('promesse au client rappelée', e.html.includes('un appel sous 2 h') && e.texte.includes('un appel sous 2 h'));
check('répondre écrit au client', e.html.includes('répondre à cet e-mail écrit directement au client'));
check('livraison gratuite', emailNouvelleCommande(commande({ deliveryFee: 0, total: 190 }), LIEN, MAINTENANT).html.includes('>gratuite<'));
check('réduction affichée', emailNouvelleCommande(commande({ discount: 20, couponCode: 'RENTREE', total: 195 }), LIEN, MAINTENANT).html.includes('Réduction (RENTREE)'));

console.log('\n── Cas particuliers ──');
const surDemande = emailNouvelleCommande(commande({
  items: [{ productId: 'p', productName: 'Tissu brodé', productImage: '', price: 0, unitPrice: 0, quantity: 3, maxStock: 0 }],
  subtotal: 0, total: 50, deliveryFee: 50,
}), LIEN, MAINTENANT);
check('prix à fixer en rouge', /color:#C8102E[^>]*>prix à fixer/.test(surDemande.html));
check('avertissement en tête', surDemande.html.includes('1 article sans prix'));
check('sujet signale le prix à fixer', surDemande.sujet.includes('+ prix à fixer'), surDemande.sujet);
check('texte brut : PRIX À FIXER', surDemande.texte.includes('PRIX À FIXER'));
const ancienne = emailNouvelleCommande(commande({
  items: [{ productId: 'p1', productName: 'Curseur', productImage: '', price: 12, quantity: 10, maxStock: 0 }],
  subtotal: 100, total: 125,
}), LIEN, MAINTENANT);
check('prix de gros sans prix enregistré : le sous-total fait foi', ancienne.html.includes('le sous-total fait foi') && ancienne.texte.includes('le sous-total fait foi'));
const sansEmail = emailNouvelleCommande(commande({ customerEmail: undefined }), LIEN, MAINTENANT);
check('sans e-mail client : pas de promesse de réponse', !sansEmail.html.includes('répondre à cet e-mail'));
const unSeul = emailNouvelleCommande(commande({ shippingAddress: { fullName: 'X', phone: '06 12 34 56 78', address: 'a', city: 'Rabat' } }), LIEN, MAINTENANT);
check('un seul numéro quand le même est répété', (unSeul.html.match(/href="tel:/g) || []).length === 1);
const sansDate = emailNouvelleCommande(commande({ createdAt: undefined }), LIEN, MAINTENANT);
check('horodatage pas encore revenu : reçue à l’instant', sansDate.texte.includes("Reçue aujourd'hui à 15:00"), sansDate.texte.split('\n')[1]);
check('e-mail client valide gardé', emailDuClient({ customerEmail: ' a.b@exemple.ma ' }) === 'a.b@exemple.ma');
check('e-mail client douteux écarté', emailDuClient({ customerEmail: 'x@y.z\r\nBcc: z@w.fr' }) === null && emailDuClient({ customerEmail: 'pas-un-email' }) === null && emailDuClient({}) === null);

// ── Alertes en pause ──
const pause = emailAlertesEnPause({ plafond: 15, periode: 'heure' }, new Date(MAINTENANT + 3600_000), 'https://www.lebtex.ma/admin-shop?vue=commandes&x="<b>', MAINTENANT);
check('pause : heure de reprise au Maroc', pause.sujet.includes('16:00') && pause.texte.includes('aujourd’hui vers 16:00'), pause.sujet);
check('pause : lien échappé', pause.html.includes('&quot;&lt;b&gt;') && !pause.html.includes('"<b>'));
check('pause : les commandes restent dans l’admin', pause.texte.includes('continuent d’arriver dans l’admin'));
const pauseJour = emailAlertesEnPause({ plafond: 60, periode: 'jour' }, new Date(MAINTENANT + 20 * 3600_000), 'https://x', MAINTENANT);
check('pause du jour : « demain »', pauseJour.texte.includes('demain vers') && pauseJour.texte.includes('en 24 heures'));

// ── Aperçu ──
const i = process.argv.indexOf('--apercu');
if (i >= 0) {
  const chemin = process.argv[i + 1];
  if (!chemin) { console.log('\n--apercu attend un chemin de fichier'); process.exit(1); }
  writeFileSync(chemin, e.html, 'utf-8');
  console.log(`\nAperçu écrit : ${chemin}\nSujet : ${e.sujet}`);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
