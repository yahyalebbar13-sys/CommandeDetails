// Tests de l'e-mail de confirmation envoyé au client (lib/email-confirmation-client.ts).
// Lancer :
//   npx tsx scripts/test-email-confirmation-client.ts
// Avec un aperçu de l'e-mail (commande réaliste) écrit dans un fichier HTML :
//   npx tsx scripts/test-email-confirmation-client.ts --apercu <chemin.html>

import { writeFileSync } from 'node:fs';
import { EMAIL_LEBTEX, echecEnvoiGmail, emailConfirmationClient, statutPermetConfirmation } from '../src/lib/email-confirmation-client';
import type { OrderStatus, ShopOrder } from '../src/lib/shop-types';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// Commande passée il y a 3 min : le 27/09/2026 à 14:57, heure de Casablanca (UTC+1).
const PASSEE = Date.UTC(2026, 8, 27, 13, 57);
const horodatage = (ms: number) => ({ seconds: ms / 1000, nanoseconds: 0 });

function commande(p: Partial<ShopOrder> = {}): ShopOrder {
  return {
    id: 'AbCdEf0123456789XyZw',
    orderNumber: 'LBT-MG1K2Z3A-7QX2',
    customerName: 'Fatima Zahra El Idrissi',
    customerPhone: '0612345678',
    customerEmail: 'fatima@example.com',
    status: 'confirmed',
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
    notes: 'Livrer après 18h, 2e étage.',
    createdAt: horodatage(PASSEE),
    ...p,
  };
}

console.log('\n── Statuts qui permettent la confirmation ──');
const oui: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];
const non: OrderStatus[] = ['delivered', 'cancelled', 'returned'];
check('en attente → confirmée → en livraison : oui', oui.every(statutPermetConfirmation));
check('livrée, annulée, retournée : non', non.every(s => !statutPermetConfirmation(s)));
check('statut inconnu : non', !statutPermetConfirmation('piratee' as OrderStatus));
check('adresse de LEBTEX', EMAIL_LEBTEX === 'lebtexsarlau@gmail.com');

console.log('\n── Sujet selon le statut ──');
const recue = emailConfirmationClient(commande({ status: 'pending' }));
const confirmee = emailConfirmationClient(commande({ status: 'confirmed' }));
const preparation = emailConfirmationClient(commande({ status: 'processing' }));
const partie = emailConfirmationClient(commande({ status: 'shipped' }));
const enLivraison = emailConfirmationClient(commande({ status: 'out_for_delivery' }));
check('en attente : « bien reçu »', recue.sujet === 'Nous avons bien reçu votre commande n° LBT-MG1K2Z3A-7QX2 — LEBTEX', recue.sujet);
check('confirmée : « Confirmation de votre commande »', confirmee.sujet === 'Confirmation de votre commande n° LBT-MG1K2Z3A-7QX2 — LEBTEX', confirmee.sujet);
check('préparation et livraison : même sujet de confirmation',
  [preparation, partie, enLivraison].every(e => e.sujet === confirmee.sujet));
const piegeSujet = emailConfirmationClient(commande({ orderNumber: 'LBT-1\r\nBcc: x@y.fr' + 'Z'.repeat(200) }));
check('sujet sur une seule ligne, longueur bornée', !/[\r\n]/.test(piegeSujet.sujet) && piegeSujet.sujet.length < 120, piegeSujet.sujet);

console.log('\n── Phrase d’ouverture selon le statut ──');
const nbFois = (texte: string, bout: string) => texte.split(bout).length - 1;
check('en attente : reçue', recue.texte.includes('\nNous avons bien reçu votre commande n° LBT-MG1K2Z3A-7QX2.\n'));
check('en attente : l’appel annoncé une seule fois', nbFois(recue.texte, 'Nous vous appelons') === 1 && nbFois(recue.html, 'Nous vous appelons') === 1,
  String(nbFois(recue.texte, 'Nous vous appelons')));
check('confirmée : confirmée, sans annoncer la préparation',
  confirmee.texte.includes('\nVotre commande n° LBT-MG1K2Z3A-7QX2 est confirmée.\n') && !/prépar/i.test(confirmee.texte) && !/prépar/i.test(confirmee.html));
check('en préparation : confirmée et en cours de préparation', preparation.texte.includes('est confirmée et en cours de préparation.'));
check('expédiée : en route avec la société de livraison', partie.texte.includes('est confirmée et elle est en route avec notre société de livraison.'));
check('en livraison : même phrase', enLivraison.texte.includes('en route avec notre société de livraison'));
check('titre du bandeau HTML selon le statut',
  recue.html.includes('>Commande bien reçue<') && confirmee.html.includes('>Commande confirmée<')
  && preparation.html.includes('>Commande en préparation<') && partie.html.includes('>Commande en route<'));

console.log('\n── Contenu ──');
const e = confirmee;
check('Bonjour + nom', e.texte.startsWith('Bonjour Fatima Zahra El Idrissi,') && e.html.includes('Bonjour Fatima Zahra El Idrissi,'));
check('n° et date complète', e.texte.includes('Commande n° LBT-MG1K2Z3A-7QX2, passée le 27/09/2026 à 14:57 sur www.lebtex.ma'),
  e.texte.split('\n').find(l => l.startsWith('Commande n°')));
check('ligne : quantité × produit (variante) : total', e.texte.includes('• 10 × Fermeture Nylon N3 (20 cm · Noir 580) : 100 MAD'));
check('2e ligne avec couleur et taille', e.texte.includes('• 5 × Taffetas doublure (Bleu nuit · 150 cm) : 90 MAD'));
check('prix appliqué (gros), pas le prix de base', !e.texte.includes('120 MAD') && e.html.includes('100 MAD'));
check('variante détaillée dans le HTML', e.html.includes('Modèle : <strong') && e.html.includes('Taille : <strong') && e.html.includes('150 cm'));
check('livraison', e.texte.includes('Livraison (Casablanca) : 25 MAD') && e.html.includes('Livraison (Casablanca)'));
check('total à payer à la livraison', e.texte.includes('TOTAL À PAYER À LA LIVRAISON : 215 MAD') && /Total à payer à la livraison[\s\S]*?font-size:28px[^>]*>215 MAD/.test(e.html));
check('adresse complète', e.texte.includes('12 Rue Atlas, Maârif') && e.texte.includes('Casablanca · Grand Casablanca')
  && e.html.includes('12 Rue Atlas, Maârif') && e.html.includes('Casablanca · Grand Casablanca'));
check('téléphones lisibles', e.texte.includes('Téléphone : 06 12 34 56 78 / 06 61 00 11 22') && e.html.includes('06 12 34 56 78 / 06 61 00 11 22'));
check('livreur et paiement en espèces',
  e.texte.includes('Notre société de livraison vous appellera avant de passer. Le paiement se fait en espèces à la réception du colis.'));
check('« répondez simplement à cet e-mail »', e.texte.includes('Pour toute question, répondez simplement à cet e-mail.') && e.html.includes('répondez simplement à cet e-mail'));
check('signature', e.texte.includes('L’équipe LEBTEX — www.lebtex.ma — lebtexsarlau@gmail.com')
  && e.html.includes('L’équipe LEBTEX') && e.html.includes('mailto:lebtexsarlau@gmail.com') && e.html.includes('href="https://www.lebtex.ma"'));
check('note du client jamais reprise (texte libre de qui a créé la commande)',
  !e.texte.includes('VOTRE NOTE') && !e.texte.includes('Livrer après 18h') && !e.html.includes('Livrer après 18h') && !/Votre note/i.test(e.html));
check('pas de bouton d’appel ni de WhatsApp (e-mail au client)', !e.html.includes('tel:') && !e.html.includes('wa.me'));
check('pas de lien vers l’admin', !e.html.includes('admin-shop') && !e.texte.includes('admin-shop'));
check('pas de mention prix de gros quand les lignes collent', !e.texte.includes('prix de gros'));
check('pas de « prix à confirmer » quand tout a un prix', !e.texte.includes('prix à confirmer') && !e.html.includes('prix à confirmer'));
check('en attente : on appelle d’abord, puis le livreur',
  recue.texte.includes('Nous vous appelons d’abord pour confirmer la commande et l’adresse de livraison.')
  && recue.texte.includes('Ensuite, notre société de livraison vous appellera avant de passer.')
  && !recue.texte.includes('\nNotre société de livraison'));
check('confirmée : pas « nous vous appelons d’abord »', !e.texte.includes('Nous vous appelons d’abord'));

console.log('\n── Montants particuliers ──');
const gratuite = emailConfirmationClient(commande({ deliveryFee: 0, total: 190 }));
check('livraison gratuite', gratuite.texte.includes('Livraison (Casablanca) : gratuite') && gratuite.html.includes('>gratuite<'));
const reduite = emailConfirmationClient(commande({ discount: 20, couponCode: 'RENTREE', total: 195 }));
check('réduction affichée', reduite.texte.includes('Réduction (RENTREE) : -20 MAD') && reduite.html.includes('Réduction (RENTREE)'));
check('pas de réduction sans réduction', !e.texte.includes('Réduction'));
const surDemande = emailConfirmationClient(commande({
  items: [
    { productId: 'p1', productName: 'Fermeture Nylon N3', productImage: '', price: 10, unitPrice: 10, quantity: 2, maxStock: 0 },
    { productId: 'p', productName: 'Tissu brodé', productImage: '', price: 0, unitPrice: 0, quantity: 3, maxStock: 0 },
  ],
  subtotal: 20, total: 45,
}));
check('ligne sans prix : « prix à confirmer »', surDemande.texte.includes('• 3 × Tissu brodé : prix à confirmer') && surDemande.html.includes('prix à confirmer'));
check('total « hors articles au prix à confirmer »',
  surDemande.texte.includes('TOTAL À PAYER À LA LIVRAISON : 45 MAD (hors articles au prix à confirmer)')
  && surDemande.html.includes('hors articles au prix à confirmer'));
const ancienne = emailConfirmationClient(commande({
  items: [{ productId: 'p1', productName: 'Curseur', productImage: '', price: 12, quantity: 10, maxStock: 0 }],
  subtotal: 100, total: 125,
}));
check('ancienne commande au prix de gros : quantités seules, sans montant par ligne',
  ancienne.texte.split('\n').includes('• 10 × Curseur') && !ancienne.texte.includes('120 MAD') && !ancienne.html.includes('120 MAD'),
  ancienne.texte.split('\n').find(l => l.startsWith('•')));
check('ancienne commande : simplement « Sous-total »',
  ancienne.texte.includes('\nSous-total : 100 MAD') && !/prix de gros/i.test(ancienne.texte) && !/prix de gros/i.test(ancienne.html));
const ancienneSurDemande = emailConfirmationClient(commande({
  items: [
    { productId: 'p1', productName: 'Curseur', productImage: '', price: 12, quantity: 10, maxStock: 0 },
    { productId: 'p2', productName: 'Tissu brodé', productImage: '', price: 0, quantity: 2, maxStock: 0 },
  ],
  subtotal: 100, total: 125,
}));
check('ancienne commande : « prix à confirmer » reste dit', ancienneSurDemande.texte.includes('• 2 × Tissu brodé : prix à confirmer'));

console.log('\n── Date : jamais « aujourd’hui » ──');
const maintenant = emailConfirmationClient(commande({ createdAt: horodatage(Date.now() - 60_000) }));
check('commande de tout à l’heure : date complète', !/aujourd/i.test(maintenant.texte) && !/aujourd/i.test(maintenant.html) && /passée le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}/.test(maintenant.texte),
  maintenant.texte.split('\n').find(l => l.startsWith('Commande n°')));
const hier = emailConfirmationClient(commande({ createdAt: horodatage(Date.now() - 86_400_000) }));
check('commande d’hier : date complète, pas « hier »', !/\bhier\b/.test(hier.texte) && /passée le \d{2}\/\d{2}\/\d{4}/.test(hier.texte));
const sansDate = emailConfirmationClient(commande({ createdAt: undefined }));
check('sans date : pas de « passée le — »', !sansDate.texte.includes('passée le') && sansDate.texte.includes('Commande n° LBT-MG1K2Z3A-7QX2 sur www.lebtex.ma'));

console.log('\n── Échappement ──');
const piege = emailConfirmationClient(commande({
  orderNumber: 'LBT-<b>1</b>',
  customerName: '<script>alert(1)</script>',
  shippingAddress: { fullName: '<img src=x onerror=alert(2)>', phone: '0612345678', address: `<b>rue</b> "Atlas" & fils, à l'angle`, city: 'Casa<script>' },
  notes: `Sonner "deux fois" l'après-midi & pas avant <b>14h</b>`,
  couponCode: '"><svg>', discount: 5,
  items: [{ productId: 'p', productName: 'Ruban <i>satin</i> & "or"', productImage: '', price: 5, unitPrice: 5, quantity: 2, maxStock: 0,
    variant: { color: '"><svg onload=alert(3)>' } }],
  subtotal: 10, total: 30,
}));
check('nom : jamais de <script> brut', !piege.html.includes('<script') && piege.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
check('nom de livraison échappé', !piege.html.includes('<img') && piege.html.includes('&lt;img src=x onerror=alert(2)&gt;'));
check('adresse : guillemets, apostrophe et & échappés',
  piege.html.includes('&lt;b&gt;rue&lt;/b&gt; &quot;Atlas&quot; &amp; fils, à l&#39;angle') && !piege.html.includes('<b>rue') && !piege.html.includes(`l'angle`));
check('note piégée : absente du HTML et du texte', !piege.html.includes('deux fois') && !piege.texte.includes('deux fois'));
check('produit et variante échappés', piege.html.includes('Ruban &lt;i&gt;satin&lt;/i&gt; &amp; &quot;or&quot;')
  && !piege.html.includes('<i>satin') && !piege.html.includes('<svg') && piege.html.includes('&quot;&gt;&lt;svg onload=alert(3)&gt;'));
check('n° de commande et code promo échappés', piege.html.includes('LBT-&lt;b&gt;1&lt;/b&gt;') && !piege.html.includes('<b>1</b>'));
check('ville échappée (titre de la livraison compris)', !piege.html.includes('Casa<script>') && piege.html.includes('Casa&lt;script&gt;'));
check('<title> échappé', /<title>[^<]*&lt;b&gt;1&lt;\/b&gt;[^<]*<\/title>/.test(piege.html));
check('texte brut : données telles quelles', piege.texte.includes('<script>alert(1)</script>') && piege.texte.includes('"Atlas" & fils'));

console.log('\n── Commande abîmée ──');
let abimee: ReturnType<typeof emailConfirmationClient> | null = null;
try {
  abimee = emailConfirmationClient({ orderNumber: 'X', status: 'pending', customerName: '', items: 'pas une liste' as any,
    subtotal: 0, deliveryFee: 0, total: 0, shippingAddress: undefined as any, paymentMethod: 'cod' } as ShopOrder);
} catch (err) {
  check('ne plante pas', false, String((err as Error)?.message));
}
if (abimee) {
  check('ne plante pas', true);
  check('sans nom : « Bonjour, »', abimee.texte.startsWith('Bonjour,'));
  check('sans téléphone : « — »', abimee.texte.includes('Téléphone : —'));
}
let lignesAbimees: ReturnType<typeof emailConfirmationClient> | null = null;
try {
  lignesAbimees = emailConfirmationClient(commande({
    items: [
      { productId: 'a', price: 5, unitPrice: 5 } as any,
      { productId: 'b', productName: '   ', quantity: { x: 1 }, price: 0 } as any,
      null as any,
      'pas une ligne' as any,
    ],
    subtotal: 0, total: 25,
  }));
} catch (err) {
  check('lignes abîmées : ne plante pas', false, String((err as Error)?.message));
}
if (lignesAbimees) {
  const puces = lignesAbimees.texte.split('\n').filter(l => l.startsWith('•'));
  check('lignes abîmées : ni « undefined » ni « [object Object] »',
    !/undefined|\[object/.test(lignesAbimees.texte) && !/undefined|\[object/.test(lignesAbimees.html), puces.join(' | '));
  check('lignes abîmées : « ? × Article », dans le texte comme dans le HTML',
    puces.length === 2 && puces.every(l => l.startsWith('• ? × Article')) && nbFois(lignesAbimees.html, '? × Article') === 2, puces.join(' | '));
}

console.log('\n── Échec d’envoi Gmail (formes des erreurs nodemailer) ──');
const erreurSmtp = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { code, ...extra });
const auth = echecEnvoiGmail(erreurSmtp('EAUTH', 'Invalid login: 535-5.7.8', { command: 'AUTH PLAIN', responseCode: 535 }));
check('EAUTH : sûr, cite GMAIL_APP_PASSWORD, GMAIL_USER, Vercel et le redéploiement',
  !auth.incertain && /GMAIL_APP_PASSWORD/.test(auth.message) && /GMAIL_USER/.test(auth.message)
  && /Vercel/.test(auth.message) && /redéploy/i.test(auth.message) && auth.message.includes(EMAIL_LEBTEX), auth.message);
const rcpt = echecEnvoiGmail(erreurSmtp('EENVELOPE', 'Recipient command failed', { command: 'RCPT TO', responseCode: 553 }));
check('RCPT TO refusé : adresse du client', !rcpt.incertain && /adresse e-mail du client/.test(rcpt.message), rcpt.message);
const quota = echecEnvoiGmail(erreurSmtp('EENVELOPE', 'Mail command failed: 550 5.4.5 Daily user sending limit exceeded', { command: 'MAIL FROM', responseCode: 550 }));
check('MAIL FROM refusé (limite du jour) : pas « adresse du client »',
  !quota.incertain && !/adresse e-mail du client/.test(quota.message) && /limite/.test(quota.message) && /plus tard/.test(quota.message), quota.message);
const data = echecEnvoiGmail(erreurSmtp('EENVELOPE', 'Data command failed', { command: 'DATA', responseCode: 451 }));
check('DATA refusé : pas « adresse du client »', !data.incertain && !/adresse e-mail du client/.test(data.message), data.message);
const connexion = echecEnvoiGmail(erreurSmtp('ETIMEDOUT', 'Connection timeout', { command: 'CONN' }));
const accueil = echecEnvoiGmail(erreurSmtp('ETIMEDOUT', 'Greeting never received', { command: 'CONN' }));
const refusee = echecEnvoiGmail(erreurSmtp('ESOCKET', 'connect ECONNREFUSED 1.2.3.4:587', { command: 'CONN', syscall: 'connect' }));
const dns = echecEnvoiGmail(erreurSmtp('EDNS', 'getaddrinfo ENOTFOUND smtp.gmail.com', { command: 'CONN' }));
check('connexion impossible (délai, accueil, refus, DNS) : sûr, « pas parti »',
  [connexion, accueil, refusee, dns].every(r => !r.incertain && /n’est pas parti/.test(r.message)), connexion.message);
const silence = echecEnvoiGmail(erreurSmtp('ETIMEDOUT', 'Timeout', { command: 'CONN' }));
const coupure = echecEnvoiGmail(erreurSmtp('ECONNECTION', 'Connection closed unexpectedly', { command: 'CONN' }));
const reset = echecEnvoiGmail(erreurSmtp('ESOCKET', 'read ECONNRESET', { command: 'CONN', syscall: 'read' }));
const sansCode = echecEnvoiGmail(new Error('???'));
check('coupure en plein envoi (silence, fermeture, reset, inconnu) : incertain, « Messages envoyés »',
  [silence, coupure, reset, sansCode].every(r => r.incertain && /peut-être parti/.test(r.message) && r.message.includes('Messages envoyés')),
  silence.message);
const autre = echecEnvoiGmail(erreurSmtp('EMESSAGE', 'Message failed: 552 5.3.4', { command: 'DATA', responseCode: 552 }));
check('autre refus : code cité, pas de mot de passe', !autre.incertain && autre.message.includes('EMESSAGE 552') && !/mot de passe/.test(autre.message), autre.message);
const piegeCode = echecEnvoiGmail(erreurSmtp('<b>X</b>', 'x'));
check('code nettoyé', !piegeCode.message.includes('<'), piegeCode.message);

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
