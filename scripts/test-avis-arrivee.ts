// Tests de la détection des avis d'arrivée et de la lecture des messages Gmail.
// Lancer :
//   npx tsx scripts/test-avis-arrivee.ts

import { detecterAvisArrivee, conteneurValide } from '../src/lib/avis-arrivee';
import { toComplet, toResume, htmlToText, remplacerCids, type GmailMessage } from '../src/lib/gmail-message';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const b64 = (s: string, enc: BufferEncoding = 'utf8') => Buffer.from(s, enc).toString('base64url');

console.log('\n── Reconnaissance ──');
const fr = detecterAvisArrivee({
  subject: "AVIS D'ARRIVEE - DOSSIER 26HD1004",
  text: [
    'Bonjour,',
    'Nous vous informons de l’arrivée de votre marchandise.',
    'Navire : MSC ANNA',
    'Voyage : 612N',
    "Date d'arrivée : 14/09/2026",
    'B/L N° : MEDUXY123456',
    'Conteneurs : MSCU 123456-6, TGHU9876542',
  ].join('\n'),
});
check('avis français reconnu dans l’objet', fr?.ou === 'objet', JSON.stringify(fr));
check('navire', fr?.navire === 'MSC ANNA', `→ ${fr?.navire}`);
check('date d’arrivée', fr?.dateArrivee === '2026-09-14', `→ ${fr?.dateArrivee}`);
check('BL', fr?.bl === 'MEDUXY123456', `→ ${fr?.bl}`);
check('deux conteneurs, séparateurs retirés', fr?.conteneurs.join() === 'MSCU1234566,TGHU9876542', `→ ${fr?.conteneurs}`);

check('apostrophe typographique', !!detecterAvisArrivee({ subject: 'Avis d’arrivée navire' }));
check('sans apostrophe', !!detecterAvisArrivee({ subject: 'AVIS ARRIVEE 26HD1004' }));
check('« Pre-Arrival Notice »', !!detecterAvisArrivee({ subject: 'Pre-Arrival Notice / B/L CNSHA1234567' }));
check('« ArrivalNotice.pdf » en pièce jointe',
  detecterAvisArrivee({ subject: 'Documents', attachments: [{ filename: 'ArrivalNotice.pdf' }] })?.ou === 'piece_jointe');
check('« AVIS_ARRIVEE_26HD1004.pdf » en pièce jointe',
  detecterAvisArrivee({ subject: 'Documents', attachments: [{ filename: 'AVIS_ARRIVEE_26HD1004.pdf' }] })?.ou === 'piece_jointe');

const prose = detecterAvisArrivee({
  subject: 'Info',
  text: 'Le navire MSC VALENCIA arrivera le 03/10/2026 au port de Casablanca.',
});
check('annonce en prose reconnue dans le corps', prose?.ou === 'corps', JSON.stringify(prose));
check('« MSC VALENCIA » gardé en entier', prose?.navire === 'MSC VALENCIA', `→ ${prose?.navire}`);
check('« arrivera le 03/10/2026 »', prose?.dateArrivee === '2026-10-03', `→ ${prose?.dateArrivee}`);

console.log('\n── Ce qui n’en est pas un ──');
check('confirmation de booking', !detecterAvisArrivee({
  subject: 'Booking confirmation 12345',
  text: 'Vessel: MSC ANNA\nETA Casablanca: 12/09/2026\nArrival port: Casablanca',
}));
check('publicité', !detecterAvisArrivee({ subject: 'Promo Black Friday -50%', text: 'Profitez !' }));
check('« nouvelle arrivée » de collection', !detecterAvisArrivee({ subject: 'Nouvelle arrivée : collection hiver' }));
check('facture transitaire', !detecterAvisArrivee({ subject: 'Facture transit dossier 26HD1004' }));

console.log('\n── Dates ──');
const date = (text: string) => detecterAvisArrivee({ subject: 'Arrival notice', text })?.dateArrivee;
check('ISO', date('ETA: 2026-09-21') === '2026-09-21', `→ ${date('ETA: 2026-09-21')}`);
check('« 5 octobre 2026 »', date("Date prévue d'arrivée : 5 octobre 2026") === '2026-10-05');
check('« Sep 21, 2026 »', date('Arrival date: Sep 21, 2026') === '2026-09-21');
check('jour de semaine + « 21 Sep 2026 »', date('ETA: Monday, 21 Sep 2026') === '2026-09-21');
check('port avant la date', date('ETA Casablanca : 21/09/2026') === '2026-09-21');
check('09/25/2026 lu mois/jour', date('ETA 09/25/2026') === '2026-09-25');
check('31/02 refusé', date('ETA 31/02/2026') === undefined);
check('date sans libellé ignorée', date('Envoyé le 01/09/2026') === undefined);

console.log('\n── BL et conteneurs ──');
const bl = (text: string) => detecterAvisArrivee({ subject: 'Arrival notice', text })?.bl;
check('premier BL plausible, pas « BL attached »', bl('BL attached.\nB/L No. MEDU1234567') === 'MEDU1234567', `→ ${bl('BL attached.\nB/L No. MEDU1234567')}`);
check('« Bill of lading number: 234567890 »', bl('Bill of lading number: 234567890') === '234567890');
check('« bleu » n’est pas un BL', bl('tissu bleu 123456') === undefined);
check('chiffre de contrôle ISO 6346 (exemple officiel)', conteneurValide('CSQU3054383'));
check('mauvais chiffre de contrôle refusé', !conteneurValide('CSQU3054384'));
check('conteneur invalide ignoré',
  detecterAvisArrivee({ subject: 'Arrival notice', text: 'Container CSQU3054384' })?.conteneurs.length === 0);

console.log('\n── Tableau HTML (compagnie maritime) ──');
const tableau = htmlToText(
  '<html><head><style>td{color:red}</style></head><body><p>Dear customer,</p><table>' +
  '<tr><td>Vessel / Voyage</td><td>CMA CGM TIGRIS / 0MX1RW1MA</td></tr>' +
  '<tr><td>ETA Casablanca</td><td>Monday, 21 Sep 2026</td></tr>' +
  '<tr><td>Container</td><td>CSQU3054383</td></tr>' +
  '<tr><td>Consignee</td><td>L&#39;entreprise &amp; fils &eacute;l&eacute;gance</td></tr></table></body></html>'
);
check('le style est retiré', !tableau.includes('color:red'), tableau);
check('entités décodées', tableau.includes("L'entreprise & fils élégance"), tableau);
const cma = detecterAvisArrivee({ subject: 'Arrival Notice - CNSHA1234567', text: tableau });
check('navire lu dans la cellule voisine', cma?.navire === 'CMA CGM TIGRIS', `→ ${cma?.navire}`);
check('date lue dans la cellule voisine', cma?.dateArrivee === '2026-09-21', `→ ${cma?.dateArrivee}`);
check('conteneur lu dans le tableau', cma?.conteneurs.join() === 'CSQU3054383', `→ ${cma?.conteneurs}`);

console.log('\n── Lecture d’un message Gmail ──');
const msg: GmailMessage = {
  id: 'm1',
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'Avis d&#39;arriv&eacute;e du navire',
  internalDate: String(Date.UTC(2026, 8, 10, 8, 30)),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Subject', value: "Avis d'arrivée 26HD1004" },
      { name: 'From', value: '"Transit Nord" <ops@transit.ma>' },
      { name: 'To', value: 'lebtexsarlau@gmail.com' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }], body: { data: b64('Navire : MSC ANNA — arrivée prévue le 14/09/2026') } },
          { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=UTF-8' }], body: { data: b64('<p>Navire : <b>MSC ANNA</b></p><img src="cid:logo">') } },
        ],
      },
      { mimeType: 'image/png', filename: 'logo.png', headers: [{ name: 'Content-ID', value: '<logo>' }, { name: 'Content-Disposition', value: 'inline; filename="logo.png"' }], body: { attachmentId: 'att-logo', size: 900 } },
      { mimeType: 'application/pdf', filename: 'AVIS_ARRIVEE.pdf', headers: [{ name: 'Content-Disposition', value: 'attachment; filename="AVIS_ARRIVEE.pdf"' }], body: { attachmentId: 'att-pdf', size: 52000 } },
    ],
  },
};
const complet = toComplet(msg);
check('objet', complet.subject === "Avis d'arrivée 26HD1004");
check('non lu', complet.unread);
check('date depuis internalDate', complet.date === '2026-09-10T08:30:00.000Z', `→ ${complet.date}`);
check('extrait décodé', complet.snippet === "Avis d'arrivée du navire", `→ ${complet.snippet}`);
check('texte UTF-8 avec accents et tiret', complet.text === 'Navire : MSC ANNA — arrivée prévue le 14/09/2026', `→ ${complet.text}`);
check('HTML gardé pour l’affichage', complet.html.includes('<b>MSC ANNA</b>'));
check('logo de signature pas listé, PDF listé',
  complet.attachments.map(a => a.filename).join() === 'AVIS_ARRIVEE.pdf', `→ ${complet.attachments.map(a => a.filename)}`);
check('pièce jointe → attachmentId', complet.attachments[0]?.attachmentId === 'att-pdf');
check('le message complet se lit comme un avis', detecterAvisArrivee(complet)?.dateArrivee === '2026-09-14');
check('liste : multipart/mixed ⇒ pièce jointe', toResume(msg).hasAttachments);

const latin1: GmailMessage = {
  id: 'm2',
  payload: {
    mimeType: 'text/plain',
    headers: [{ name: 'Content-Type', value: 'text/plain; charset=ISO-8859-1' }, { name: 'Date', value: 'Thu, 10 Sep 2026 10:00:00 +0100' }],
    body: { data: b64('Arrivée prévue', 'latin1') },
  },
};
const l1 = toComplet(latin1);
check('ISO-8859-1 décodé', l1.text === 'Arrivée prévue', `→ ${l1.text}`);
check('date depuis l’en-tête quand internalDate manque', l1.date === '2026-09-10T09:00:00.000Z', `→ ${l1.date}`);
check('sans objet', l1.subject === '(Sans objet)');

const htmlSeul = toComplet({
  id: 'm3',
  payload: { mimeType: 'text/html', body: { data: b64('<div>ETA&nbsp;: 21/09/2026</div><div>Navire | MSC ANNA</div>') } },
});
check('texte tiré du HTML quand il n’y a pas de version texte', htmlSeul.text.includes('ETA : 21/09/2026'), `→ ${JSON.stringify(htmlSeul.text)}`);

console.log('\n── Relecture : simples mentions ──');
check('sa propre demande « envoyez-nous l’avis d’arrivée »', !detecterAvisArrivee({
  subject: 'Dossier 26HD1004',
  text: "Bonjour, pouvez-vous nous envoyer l'avis d'arrivée du dossier 26HD1004 ? Merci",
}));
check('« quand le navire arrive, prévenez-nous »', !detecterAvisArrivee({ subject: 'Info', text: 'Quand le navire arrive, merci de nous prévenir.' }));
check('suivi « vessel has arrived at transhipment port »', !detecterAvisArrivee({ subject: 'Tracking', text: 'The vessel has arrived at transhipment port Tanger Med.' }));
check('« Arrival Notification »', !!detecterAvisArrivee({ subject: 'Arrival Notification MEDU1234567' }));
check('« Notification d’arrivée »', !!detecterAvisArrivee({ subject: "Notification d'arrivée conteneur" }));
check('faute « Avis d’arrivé »', !!detecterAvisArrivee({ subject: "Avis d'arrivé 26HD1004" }));
check('« AvisArrivee_MSC.pdf »', detecterAvisArrivee({ subject: 'Docs', attachments: [{ filename: 'AvisArrivee_MSC.pdf' }] })?.ou === 'piece_jointe');

console.log('\n── Relecture : la bonne date ──');
const ligneTableau = (entetes: string[], valeurs: string[]) =>
  htmlToText(`<table><tr>${entetes.map(e => `<th>${e}</th>`).join('')}</tr><tr>${valeurs.map(v => `<td>${v}</td>`).join('')}</tr></table>`);
const carrier = ligneTableau(
  ['Vessel', 'Voyage', 'Port of Loading', 'ETD', 'Port of Discharge', 'ETA'],
  ['MSC ANNA', '612N', 'NINGBO', '01/08/2026', 'CASABLANCA', '21/09/2026']
);
const avisCarrier = detecterAvisArrivee({ subject: 'Arrival notice', text: carrier });
check('en-tête de tableau : l’ETA, pas l’ETD', avisCarrier?.dateArrivee === '2026-09-21', `→ ${avisCarrier?.dateArrivee}`);
check('en-tête de tableau : le navire sous « Vessel »', avisCarrier?.navire === 'MSC ANNA', `→ ${avisCarrier?.navire}`);
check('« ETD | ETA » puis les valeurs', date('ETD | ETA |\n01/08/2026 | 21/09/2026 |') === '2026-09-21');
check('« ETA: TBC » ne prend pas la date de la ligne suivante', date('ETA: TBC\nDate facture: 01/09/2026') === undefined);
check('nouvelle ETA préférée à l’ancienne', date('Previous ETA: 15/09/2026\nNew ETA: 21/09/2026') === '2026-09-21');
check('« revised from … to … » : la dernière', date('ETA revised from 15/09/2026 to 21/09/2026') === '2026-09-21');
check('libellé en fin de ligne, date dessous', date("Date d'arrivée :\n14/09/2026") === '2026-09-14');
check('mois sans année + ligne suivante', date("Date prévue d'arrivée : 14 octobre\n25 colis") === undefined);
check('« 14 octobre, 30 cartons » n’est pas 2030', date('ETA : 14 octobre, 30 cartons') === undefined);
check('ISO avec heure', date('ETA : 2026-09-21T08:00:00') === '2026-09-21');
check('aaaa/mm/jj', date('ETA : 2026/10/03') === '2026-10-03');
check('« 14-Oct-26 »', date('ETA: 14-Oct-26') === '2026-10-14');

console.log('\n── Relecture : le bon navire ──');
const navire = (subject: string, text: string) => detecterAvisArrivee({ subject, text: text + '\nETA: 21/09/2026' })?.navire;
check('« Vessel / Voyage » en en-tête',
  navire('Arrival notice', ligneTableau(['Vessel / Voyage', 'Port of Loading'], ['CMA CGM TIGRIS / 0MX1RW1MA', 'NINGBO'])) === 'CMA CGM TIGRIS');
check('prose coupée « the vessel\\nwill berth »', navire('Arrival notice', 'please be informed that the vessel\nwill berth at Casablanca on 12/10/2026') === undefined);
check('prose coupée « du navire\\nà Casablanca »', navire("Avis d'arrivée", "l'arrivée prévue du navire\nà Casablanca le 12/10/2026") === undefined);
check('« Vessel: » vide puis un autre libellé', navire('Arrival notice', 'Vessel:\nPort of loading: Shanghai') === undefined);
check('objet « … navire » ne prend pas « Bonjour »', navire("Avis d'arrivée navire", 'Bonjour,\nveuillez trouver') === undefined);
check('« LE NAVIRE EST ARRIVE »', navire('AVIS ARRIVEE', 'LE NAVIRE EST ARRIVE AU PORT') === undefined);
check('« THE VESSEL HAS ARRIVED »', navire('ARRIVAL NOTICE', 'THE VESSEL HAS ARRIVED') === undefined);
check('« The vessel ETA Casablanca »', navire('Arrival notice', 'The vessel ETA Casablanca is confirmed') === undefined);
check('« Navire : MSC Anna, voyage 12 »', navire("Avis d'arrivée", 'Navire : MSC Anna, voyage 12') === 'MSC ANNA');

console.log('\n── Relecture : le bon BL ──');
check('« Date BL » n’est pas le BL', bl('Date BL : 01/08/2026\nN° BL : MEDUXY123456') === 'MEDUXY123456');
check('« Date du connaissement »', bl('Date du connaissement : 01/08/2026') === undefined);
check('mot en minuscules après « bl »', bl('le bl original2026') === undefined);
check('« Nº » (ordinal)', bl('B/L Nº: MEDUXY123456') === 'MEDUXY123456');

console.log('\n── Relecture : messages piégés (aucun blocage) ──');
const chrono = (label: string, fn: () => unknown, maxMs = 300) => {
  const t = Date.now();
  fn();
  const ms = Date.now() - t;
  check(`${label} (${ms} ms)`, ms < maxMs);
};
chrono('« navire » + 200 000 retours à la ligne', () =>
  detecterAvisArrivee({ subject: "Avis d'arrivée", text: 'navire' + '\n'.repeat(200_000) + '!' }));
chrono('« BL » + 200 000 CRLF', () =>
  detecterAvisArrivee({ subject: "Avis d'arrivée", text: 'BL' + '\r\n'.repeat(200_000) + '!' }));
chrono('HTML : 350 Ko de « <style » jamais fermés', () => htmlToText('<style '.repeat(50_000)));
chrono('HTML : 350 Ko de « <a » sans « > »', () => htmlToText('<a'.repeat(175_000)));
chrono('HTML : 200 Ko de « < » cachés', () => htmlToText('<div style=display:none>' + '<'.repeat(200_000)));
chrono('message complet piégé', () => detecterAvisArrivee(toComplet({
  id: 'x', payload: { mimeType: 'text/html', body: { data: b64('<style '.repeat(50_000)) } },
})));

console.log('\n── Relecture : images collées et jeux de caractères ──');
const avecImage = (html: string) => toComplet({
  id: 'img',
  payload: {
    mimeType: 'multipart/related',
    parts: [
      { mimeType: 'text/html', body: { data: b64(html) } },
      { mimeType: 'image/png', filename: 'image001.png', headers: [{ name: 'Content-ID', value: '<image001.png@01DB>' }, { name: 'Content-Disposition', value: 'inline; filename="image001.png"' }], body: { attachmentId: 'att-img', size: 3000 } },
    ],
  },
});
const colle = avecImage('<p>Voir capture :</p><img src="cid:image001.png@01DB">');
check('image collée gardée pour l’affichage', colle.images.length === 1 && colle.images[0].contentId === 'image001.png@01db');
check('image collée pas listée en pièce jointe', colle.attachments.length === 0);
const orpheline = avecImage('<p>Sans image</p>');
check('image « intégrée » non affichée → pièce jointe', orpheline.attachments.length === 1 && orpheline.images.length === 0);
const dejaUtf8 = toComplet({
  id: 'u',
  payload: {
    mimeType: 'text/plain',
    headers: [{ name: 'Content-Type', value: 'text/plain; charset=iso-8859-1' }],
    body: { data: b64("Date d'arrivée : 14/09/2026") },
  },
});
check('UTF-8 annoncé « iso-8859-1 » lu sans charabia', dejaUtf8.text === "Date d'arrivée : 14/09/2026", `→ ${dejaUtf8.text}`);

console.log('\n── 2e relecture : aucun blocage, même avec des milliers de libellés ──');
chrono('« ETA| » × 12 500 (50 Ko)', () => detecterAvisArrivee({ subject: 'Arrival notice', text: 'ETA|'.repeat(12_500) }));
chrono('« vessel| » × 7 000', () => detecterAvisArrivee({ subject: 'Arrival notice', text: 'vessel|'.repeat(7_000) }));
chrono('« B/L| » × 10 000', () => detecterAvisArrivee({ subject: 'Arrival notice', text: 'B/L|'.repeat(10_000) }));
chrono('objet géant « ETA| »', () => detecterAvisArrivee({ subject: 'Arrival notice ' + 'ETA|'.repeat(12_500), text: '|'.repeat(50_000) }));
chrono('tableau HTML de 12 000 cellules « ETA »', () =>
  detecterAvisArrivee({ subject: 'Arrival notice', text: htmlToText('<table><tr>' + '<th>ETA</th>'.repeat(12_000) + '</tr></table>') }));
chrono('nom de navire de 49 000 tirets', () =>
  detecterAvisArrivee({ subject: "Avis d'arrivée", text: 'Navire : MSC' + '-'.repeat(49_000) + 'X' }));
chrono('« <head » jamais fermés × 50 000', () => htmlToText('<head '.repeat(50_000)));
chrono('« <title » jamais fermés × 50 000', () => htmlToText('<title>'.repeat(50_000)));

console.log('\n── 2e relecture : la bonne date ──');
check('« au lieu du » : la nouvelle', date('Nouvelle ETA : 21/09/2026 au lieu du 15/09/2026') === '2026-09-21', `→ ${date('Nouvelle ETA : 21/09/2026 au lieu du 15/09/2026')}`);
check('« reportée au … (initialement …) »', date('ETA reportée au 21/09/2026 (initialement 15/09/2026)') === '2026-09-21');
check('« revised to … from … »', date('ETA revised to 21/09/2026 from 15/09/2026') === '2026-09-21');
check('« (updated on …) » n’est pas l’ETA', date('ETA: 21/09/2026 (updated on 18/09/2026)') === '2026-09-21');
check('ETD entre parenthèses ignorée', date("Date d'arrivée : 21/09/2026 au port de Casablanca (ETD 01/08/2026)") === '2026-09-21');
check('franchise après l’ETA ignorée', date('ETA: 21/09/2026 (free time up to 05/10/2026)') === '2026-09-21');
check('« ETA initiale » puis « ETA révisée »', date('ETA initiale : 15/09/2026\nETA révisée : 21/09/2026') === '2026-09-21');
check('« Original ETA » puis « Current ETA »', date('Original ETA: 15/09/2026\nCurrent ETA: 21/09/2026') === '2026-09-21');
check('« booking confirmed » ne fige pas l’ancienne', date('Your booking is confirmed ETA 15/09/2026\nRevised ETA: 21/09/2026') === '2026-09-21');
check('réponse : la nouvelle ETA en haut l’emporte sur l’historique cité',
  date('ETA : 28/09/2026\n\nLe 18/09/2026 à 10:00, Transit a écrit :\n> Nouvelle ETA : 21/09/2026 (au lieu du 15/09/2026)') === '2026-09-28');
check('« arrivera à Casablanca le … »', detecterAvisArrivee({ subject: 'Info', text: 'Le navire MSC ANNA arrivera à Casablanca le 21/09/2026.' })?.dateArrivee === '2026-09-21');
check('« Arrivée : … »', date('Arrivée : 21/09/2026') === '2026-09-21');
check('« Arrivée | … » (tableau)', date('Arrivée | 21/09/2026 |') === '2026-09-21');
check('« ATA: … »', date('ATA: 21/09/2026') === '2026-09-21');
check('« Arrival: … »', date('Arrival: 21/09/2026') === '2026-09-21');
check('« 21/SEP/2026 »', date('ETA: 21/SEP/2026') === '2026-09-21');
check('« ETA Terminal 2 | … »', date('ETA Terminal 2 | 21/09/2026 |') === '2026-09-21');
check('objet « Avis d’arrivée du 15/09 » n’est pas une ETA', date('Bonjour') === undefined &&
  detecterAvisArrivee({ subject: "Avis d'arrivée du 15/09/2026", text: 'Bonjour' })?.dateArrivee === undefined);

console.log('\n── 2e relecture : le bon navire ──');
check('en-tête inconnu « Carrier »', navire('Arrival notice', 'Vessel | Carrier | ETA |\nMSC ANNA | MSC | 21/09/2026 |') === 'MSC ANNA', `→ ${navire('Arrival notice', 'Vessel | Carrier | ETA |\nMSC ANNA | MSC | 21/09/2026 |')}`);
check('en-tête inconnu « Terminal »', navire('Arrival notice', 'Vessel | Terminal | POD |\nMSC ANNA | T2 | CASABLANCA |') === 'MSC ANNA');
check('« Vessel: » vide puis « Notify party: »', navire('Arrival notice', 'Vessel:\nNotify party: LEBTEX') === undefined);
check('« Vessel: » vide puis une phrase', navire('Arrival notice', 'Vessel:\nPlease find attached the notice') === undefined);
check('titre « VESSEL DETAILS » puis « Vessel Name: »', navire('Arrival notice', 'VESSEL DETAILS\nVessel Name: MSC ANNA') === 'MSC ANNA');
check('colonnes alignées « POL: »', navire('Arrival notice', 'Vessel: MSC ANNA          POL: NINGBO') === 'MSC ANNA', `→ ${navire('Arrival notice', 'Vessel: MSC ANNA          POL: NINGBO')}`);
check('tabulation « Nombre de colis »', navire("Avis d'arrivée", 'Navire :\tMSC ANNA\t\tNombre de colis :\t120') === 'MSC ANNA');
check('« (IMO …) » retiré', navire("Avis d'arrivée", 'Navire : MSC ANNA (IMO 9876543)') === 'MSC ANNA');
check('majuscules « ARRIVE LE »', navire("AVIS D'ARRIVEE", 'NAVIRE : MSC ANNA ARRIVE LE 21/09/2026') === 'MSC ANNA');
check('prose majuscules « ARRIVERA LE »', navire("AVIS D'ARRIVEE", 'LE NAVIRE MSC ANNA ARRIVERA LE 21/09/2026 AU PORT') === 'MSC ANNA');
check('voyage « 012W »', navire('ARRIVAL NOTICE', 'VESSEL/VOYAGE: COSCO SHIPPING ARIES 012W') === 'COSCO SHIPPING ARIES');
check('voyage « - 612N »', navire('Arrival notice', 'Vessel: MSC ANNA - 612N') === 'MSC ANNA');
check('« NAVIRE PORTEUR : »', navire("AVIS D'ARRIVEE", 'NAVIRE PORTEUR : MSC ANNA') === 'MSC ANNA');
check('« M/V » devant le nom', navire("Avis d'arrivée", 'Navire : M/V MSC ANNA') === 'MSC ANNA');
check('espace fine avant « : » (Outlook français)', navire("Avis d'arrivée", 'Navire : MSC ANNA') === 'MSC ANNA');

console.log('\n── 2e relecture : le bon BL ──');
check('« HBL N° : »', bl('HBL N° : SHA2026090123') === 'SHA2026090123');
check('« MBL : »', bl('MBL : MEDUXY123456') === 'MEDUXY123456');
check('BL sous un en-tête', bl('B/L No. | Vessel | ETA |\nMEDUXY123456 | MSC ANNA | 21/09/2026 |') === 'MEDUXY123456');
check('« B/L No. » seul, numéro dessous', bl('B/L No.\nMEDUXY123456') === 'MEDUXY123456');
check('espace fine avant « : »', bl('N° BL : MEDUXY123456') === 'MEDUXY123456');

console.log('\n── 2e relecture : ce qui est (ou n’est pas) un avis ──');
check('réponse « RE: Demande avis d’arrivée … pas encore reçu »',
  !detecterAvisArrivee({ subject: "RE: Demande avis d'arrivée dossier 26HD1004", text: 'Pas encore reçu, on revient vers vous.' }));
check('réponse dont seule la citation porte le BL',
  !detecterAvisArrivee({ subject: "RE: avis d'arrivée ?", text: "Pas encore.\n> Merci de nous envoyer l'avis d'arrivée du BL MEDU1234567" }));
check('« TR: Avis d’arrivée » avec seulement le PDF', !!detecterAvisArrivee({ subject: "TR: Avis d'arrivée MSC ANNA", text: '', attachments: [{ filename: 'MSCU_AN_883.pdf' }] }));
check('« Ci-joint l’avis d’arrivée » + PDF', detecterAvisArrivee({
  subject: 'TR: Dossier 26HD1004', text: "Bonjour, Ci-joint l'avis d'arrivée. Cordialement", attachments: [{ filename: 'scan0001.pdf' }],
})?.ou === 'corps');
check('« Please find attached the arrival notice » + PDF', !!detecterAvisArrivee({
  subject: 'MSC ANNA 612N / 26HD1004', text: 'Please find attached the arrival notice.', attachments: [{ filename: 'AN_MEDUXY123456.pdf' }],
}));
check('demande « pouvez-vous nous envoyer l’avis » + un PDF de commande', !detecterAvisArrivee({
  subject: 'Commande', text: "Pouvez-vous nous envoyer l'avis d'arrivée ? Ci-joint notre commande.", attachments: [{ filename: 'PO-118.pdf' }],
}));

console.log('\n── 2e relecture : HTML Outlook, jeux de caractères, images ──');
const outlook = htmlToText(
  '<table><tr><td><p class=MsoNormal>Navire</p></td><td><p class=MsoNormal>MSC ANNA</p></td></tr>' +
  "<tr><td><p class=MsoNormal>Date d'arrivée</p></td><td><p class=MsoNormal>21/09/2026</p></td></tr>" +
  '<tr><td><p>N° BL</p></td><td><p>MEDUAB123456</p></td></tr></table>'
);
const avisOutlook = detecterAvisArrivee({ subject: "AVIS D'ARRIVEE", text: outlook });
check('cellules <p> Outlook : navire', avisOutlook?.navire === 'MSC ANNA', JSON.stringify(outlook));
check('cellules <p> Outlook : date', avisOutlook?.dateArrivee === '2026-09-21');
check('cellules <p> Outlook : BL', avisOutlook?.bl === 'MEDUAB123456');
const enTeteDiv = htmlToText('<table><tr><th><div>Vessel</div></th><th><div>ETA</div></th><th><div>B/L</div></th></tr><tr><td><div>MSC ANNA</div></td><td><div>21/09/2026</div></td><td><div>MEDUAB123456</div></td></tr></table>');
const avisDiv = detecterAvisArrivee({ subject: 'Arrival notice', text: enTeteDiv });
check('en-tête <th><div> : navire, date, BL',
  avisDiv?.navire === 'MSC ANNA' && avisDiv?.dateArrivee === '2026-09-21' && avisDiv?.bl === 'MEDUAB123456', JSON.stringify(avisDiv));
check('</head> absent : le corps reste lisible',
  htmlToText('<html><head><meta charset="utf-8"><body><p>Navire : MSC ANNA</p><p>ETA : 21/09/2026</p>').includes('ETA : 21/09/2026'));
const latinAnnonceUtf8 = toComplet({
  id: 'l', payload: { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }], body: { data: b64("Date d'arrivée : 21/09/2026", 'latin1') } },
});
check('Latin-1 annoncé UTF-8 lu correctement', latinAnnonceUtf8.text === "Date d'arrivée : 21/09/2026", `→ ${latinAnnonceUtf8.text}`);
const prefixes = avecImage('<img src="cid:logo"><img src="CID:Logo2">');
check('Content-ID préfixe d’un autre : pas de confusion', prefixes.images.length === 0 && prefixes.attachments.length === 1);
check('remplacement exact des « cid: »',
  remplacerCids('<img src="cid:logo"><img src="cid:logo2"><img src="CID:Logo%402">', new Map([['logo', 'A'], ['logo2', 'B'], ['logo@2', 'C']])) ===
  '<img src="A"><img src="B"><img src="C">');

console.log('\n── 3e relecture : blocages ──');
chrono('50 Ko de lignes « eta eta eta … » sans date', () =>
  detecterAvisArrivee({ subject: 'Arrival notice', text: ('eta.'.repeat(30) + '.'.repeat(80) + '\n').repeat(250) }));
chrono('idem avec un historique cité (deux passes)', () =>
  detecterAvisArrivee({ subject: 'Arrival notice', text: ('eta.'.repeat(30) + '.'.repeat(80) + '\n').repeat(250) + '> cite' }));

console.log('\n── 3e relecture : colonnes et séparateurs ──');
const avis3 = (subject: string, text: string) => detecterAvisArrivee({ subject, text });
const tabule = avis3("AVIS D'ARRIVEE", 'NAVIRE\t: MSC ANNA\nN° BL\t: MEDUXY123456\nDATE ARRIVEE\t: 21/09/2026');
check('« NAVIRE<tab>: X » : navire', tabule?.navire === 'MSC ANNA', JSON.stringify(tabule));
check('« N° BL<tab>: X » : BL', tabule?.bl === 'MEDUXY123456');
check('« NAVIRE          : X » puis CLIENT', avis3("AVIS D'ARRIVEE", 'NAVIRE          : MSC ANNA\nCLIENT          : LEBTEX SARL\nETA : 21/09/2026')?.navire === 'MSC ANNA');
check('paires libellé/valeur sur une ligne',
  avis3('Arrival notice', 'Vessel: CMA CGM TIGRIS          POL: SHANGHAI          POD: CASABLANCA\nETA: 21/09/2026')?.navire === 'CMA CGM TIGRIS');
const troisCellules = htmlToText('<table><tr><td>NAVIRE</td><td>:</td><td>MSC ANNA</td></tr><tr><td>EXPEDITEUR</td><td>:</td><td>NINGBO TEXTILE CO</td></tr><tr><td>ETA</td><td>:</td><td>21/09/2026</td></tr></table>');
const a3 = avis3("AVIS D'ARRIVEE", troisCellules);
check('« NAVIRE | : | X » (3 cellules)', a3?.navire === 'MSC ANNA', JSON.stringify(troisCellules));
check('« ETA | : | date » (3 cellules)', a3?.dateArrivee === '2026-09-21');
const tirets = avis3('Arrival Notice', 'Vessel              Voyage     POD              ETA\n------------------  ---------  ---------------  ----------\nMSC ANNA            FA612N     CASABLANCA       21/09/2026');
check('ligne de tirets sous l’en-tête : navire', tirets?.navire === 'MSC ANNA', JSON.stringify(tirets));
check('ligne de tirets sous l’en-tête : date', tirets?.dateArrivee === '2026-09-21');
const indente = htmlToText('<table>\n <tr>\n  <th>Vessel</th>\n  <th>ETA</th>\n </tr>\n <tr>\n  <td>MSC ANNA</td>\n  <td>21/09/2026</td>\n </tr>\n</table>');
const aIndente = avis3('Arrival notice', indente);
check('tableau HTML indenté', aIndente?.navire === 'MSC ANNA' && aIndente?.dateArrivee === '2026-09-21', JSON.stringify(indente));
check('libellé coupé par le code HTML', date(htmlToText("<p>Date d'arriv&eacute;e\npr&eacute;vue : 21/09/2026</p>")) === '2026-09-21');

console.log('\n── 3e relecture : trajet ──');
check('ETA du transbordement puis de Casablanca',
  date('Vessel: MSC ANNA\nTranshipment port: ALGECIRAS   ETA: 10/09/2026\nPort of discharge: CASABLANCA  ETA: 21/09/2026') === '2026-09-21');
check('« ETA T/S Algeciras » puis « ETA Casablanca »', date('ETA T/S Algeciras: 10/09/2026\nETA Casablanca: 21/09/2026') === '2026-09-21');
check('ETA POL / ETD POL / ETA POD', date('ETA POL: 30/07/2026 ETD POL: 01/08/2026 ETA POD: 21/09/2026') === '2026-09-21');
check('« ETD/ETA : d1 - d2 »', date('ETD/ETA: 01/08/2026 - 21/09/2026') === '2026-09-21');
check('seule une ETA d’escale connue : gardée faute de mieux', date('ETA T/S Algeciras: 10/09/2026') === '2026-09-10');

console.log('\n── 3e relecture : tournures ──');
check('« accostera le »', avis3('Information', 'Le navire MSC ANNA accostera le 21/09/2026 au port de Casablanca.')?.dateArrivee === '2026-09-21');
check('« sera à quai le »', avis3('Information', 'Le navire MSC ANNA sera à quai le 21/09/2026.')?.dateArrivee === '2026-09-21');
check('« arrives at … on »', avis3('Information', 'Vessel MSC ANNA arrives at Casablanca on 21/09/2026.')?.dateArrivee === '2026-09-21');
check('« berthed … on »', avis3('Information', 'The vessel MSC ANNA berthed at Casablanca on 21/09/2026.')?.dateArrivee === '2026-09-21');
check('« will arrive … on »', avis3('Information', 'The vessel MSC ANNA will arrive at Casablanca on 21/09/2026.')?.dateArrivee === '2026-09-21');
check('« est attendu … le »', date('Le navire est attendu au port de Casablanca le 21/09/2026') === '2026-09-21');
check('« is expected to arrive … on »', date('The vessel is expected to arrive at Casablanca on 21/09/2026') === '2026-09-21');
check('« Date et heure d’arrivée »', date("Date et heure d'arrivée : 21/09/2026 08:00") === '2026-09-21');
check('« Arrival on »', date('Arrival on 21/09/2026') === '2026-09-21');

console.log('\n── 3e relecture : réponses et pièces jointes ──');
check('« RE: … BL X » + « pas encore reçu »', !avis3("RE: Demande avis d'arrivée BL MEDUXY123456", 'Bonjour,\nPas encore reçu, on revient vers vous.'));
check('« RE: Avis d’arrivée MSCU… ? » + « pas encore disponible »', !avis3("RE: Avis d'arrivée MSCU1234566 ?", 'Pas encore disponible.'));
check('« RE: … ETA » + « pas encore l’avis »', !avis3("RE: Avis d'arrivée - ETA 21/09/2026", "Nous n'avons pas encore l'avis, le navire a du retard."));
check('« RE: Avis d’arrivée » + PDF « AVIS_ARRIVEE_… »', !!detecterAvisArrivee({
  subject: "RE: Avis d'arrivée MSC ANNA", text: '', attachments: [{ filename: 'AVIS_ARRIVEE_MEDUXY123456.pdf' }],
}));
check('« RE: Avis d’arrivée » + « en PJ » + PDF', !!detecterAvisArrivee({
  subject: "RE: Avis d'arrivée", text: 'Bonjour, en PJ.', attachments: [{ filename: 'scan0001.pdf' }],
}));
check('« voir PJ l’avis d’arrivée » + PDF', !!detecterAvisArrivee({
  subject: 'Dossier 26HD1004', text: "Bonjour, voir PJ l'avis d'arrivée.", attachments: [{ filename: 'scan0001.pdf' }],
}));
check('« Réf : Avis d’arrivée » n’est pas une réponse', !!avis3("Réf : Avis d'arrivée 26HD1004", 'Bonjour'));
check('réponse-demande « PJ notre commande » + PO.pdf', !detecterAvisArrivee({
  subject: "RE: Avis d'arrivée", text: "Pouvez-vous nous envoyer l'avis d'arrivée ? PJ notre commande", attachments: [{ filename: 'PO.pdf' }],
}));

console.log(`\n═══ ${pass} réussis, ${fail} échoués ═══\n`);
process.exit(fail > 0 ? 1 : 0);
