// Tests de l'accès de l'équipe (lib/acces-equipe.ts) : identifiant, e-mail
// fabriqué, mot de passe ; et ce que l'écran /staff décide sans Firebase
// (app/staff/_espace/acces.ts). Aucun appel réseau.
// Lancer :
//   npx tsx scripts/test-acces-equipe.ts

import {
  DOMAINE_EQUIPE,
  EVENEMENT_ACCES_REFUSE,
  MOT_DE_PASSE_MIN,
  REGLE_IDENTIFIANT,
  emailEquipe,
  identifiantDeEmail,
  identifiantValide,
  motDePasseAcceptable,
  normaliserIdentifiant,
  problemeIdentifiant,
  signalerAccesRefuse,
} from '../src/lib/acces-equipe';
import {
  classerErreurVerification,
  compteAffiche,
  reactionSansAcces,
  roleDepuisJeton,
  verifierSaisie,
} from '../src/app/staff/_espace/acces';
import { adresseEquipe, lireAdresseEquipe } from '../src/app/staff/_espace/adresse';
import { ADMIN_EMAIL } from '../src/lib/constants';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Normalisation ──');
check('espaces autour retirés, minuscules', normaliserIdentifiant('  Magasin.Derb  ') === 'magasin.derb');
check('majuscules seules', normaliserIdentifiant('EQUIPE') === 'equipe');
check('autre chose qu’un texte → vide',
  normaliserIdentifiant(undefined) === '' && normaliserIdentifiant(null) === '' && normaliserIdentifiant(42) === '' && normaliserIdentifiant({}) === '');
check('les espaces au milieu restent (et seront refusés)', normaliserIdentifiant(' a b c ') === 'a b c');

console.log('\n── Identifiants valides ──');
for (const v of ['equipe', 'lebtex.equipe', 'magasin_1', 'vente-casa', '007', 'abc', 'a'.repeat(30)]) {
  check(`« ${v.length > 12 ? v.slice(0, 12) + '…' : v} » accepté`, identifiantValide(v) && problemeIdentifiant(v) === null);
}

console.log('\n── Identifiants refusés ──');
const refuses: [string, string, RegExp][] = [
  ['', 'vide', /Choisissez/],
  ['ab', 'trop court', /au moins 3/],
  ['a'.repeat(31), 'trop long', /30 caractères/],
  ['élodie', 'accent', /accent/],
  ['équipe', 'accent en tête', /accent/],
  ['mag asin', 'espace au milieu', /espace/],
  ['.equipe', 'commence par un point', /commencer/],
  ['-equipe', 'commence par un tiret', /commencer/],
  ['equipe@lebtex', 'arobase', /que des lettres/],
  ['equipe/1', 'barre oblique', /que des lettres/],
  ['Equipe', 'majuscule non normalisée', /commencer|que des lettres/],
];
for (const [v, pourquoi, attendu] of refuses) {
  const raison = problemeIdentifiant(v);
  check(`${pourquoi} refusé`, !identifiantValide(v) && raison !== null && attendu.test(raison), `→ ${raison}`);
}
check('majuscules acceptées une fois normalisées', identifiantValide(normaliserIdentifiant('  EQUIPE  ')));
check('accent toujours refusé après normalisation', !identifiantValide(normaliserIdentifiant(' Élodie ')));

console.log('\n── E-mail fabriqué ──');
check('domaine factice', DOMAINE_EQUIPE === 'equipe.lebtex.ma');
check('identifiant → e-mail', emailEquipe('magasin') === 'magasin@equipe.lebtex.ma');
check('e-mail normalisé (majuscules, espaces)', emailEquipe('  Magasin ') === 'magasin@equipe.lebtex.ma');
check('e-mail → identifiant', identifiantDeEmail('magasin@equipe.lebtex.ma') === 'magasin');
check('aller-retour', identifiantDeEmail(emailEquipe('vente.casa_2')) === 'vente.casa_2');
check('e-mail en majuscules reconnu', identifiantDeEmail('MAGASIN@EQUIPE.LEBTEX.MA') === 'magasin');
check('autre domaine → null', identifiantDeEmail('magasin@gmail.com') === null);
check('domaine voisin → null',
  identifiantDeEmail('magasin@lebtex.ma') === null
  && identifiantDeEmail('magasin@xequipe.lebtex.ma') === null
  && identifiantDeEmail('magasin@equipe.lebtex.ma.evil.com') === null);
check('sous-domaine piégé → null', identifiantDeEmail('a@b.equipe.lebtex.ma') === null);
check('partie locale invalide → null', identifiantDeEmail('ab@equipe.lebtex.ma') === null && identifiantDeEmail('@equipe.lebtex.ma') === null);
check('pas un texte → null', identifiantDeEmail(undefined as unknown as string) === null);

console.log('\n── Mots de passe acceptés ──');
for (const v of ['Tissus.Rabat!', 'Kx9#mP2q', 'fil-rouge-2026', 'bobine 34 bleue', 'LeB7ex_Derb']) {
  check(`« ${v} » accepté`, motDePasseAcceptable(v, 'magasin') === null, `→ ${motDePasseAcceptable(v, 'magasin')}`);
}
check('longueur minimale exacte acceptée', MOT_DE_PASSE_MIN === 8 && motDePasseAcceptable('Rb7#kq2z') === null);

console.log('\n── Mots de passe refusés ──');
const mdpRefuses: [string, string, RegExp, string?][] = [
  ['', 'vide', /Choisissez/],
  ['Ab3#kq2', 'trop court (7)', /au moins 8/],
  ['x'.repeat(101), 'trop long', /100 caractères/],
  [' Kx9#mP2q', 'espace au début', /espace/],
  ['Kx9#mP2q ', 'espace à la fin', /espace/],
  ['11111111', 'un seul chiffre répété', /trop simple/],
  ['aaaaaaaaaa', 'une seule lettre répétée', /trop simple/],
  ['12121212', 'deux chiffres alternés', /trop simple/],
  ['12345678', 'suite croissante', /trop simple/],
  ['98765432', 'suite décroissante', /trop simple/],
  ['abcdefghij', 'suite de lettres', /trop simple/],
  ['1234-5678', 'suite coupée par un symbole', /deviner/],
  ['password', 'mot courant', /deviner/],
  ['Lebtex2026!', 'nom de la société + chiffres', /deviner/],
  ['azerty123', 'clavier + chiffres', /deviner/],
  ['MotDePasse1', 'mot de passe en français', /deviner/],
  ['omar2026!x', 'contient l’identifiant', /nom d'utilisateur/, 'omar2026'],
  ['xx-vente.casa-9', 'contient l’identifiant (avec point)', /nom d'utilisateur/, 'vente.casa'],
  ['Vente.Casa#9', 'contient l’identifiant (majuscules)', /nom d'utilisateur/, 'VENTE.CASA'],
];
for (const [v, pourquoi, attendu, id] of mdpRefuses) {
  const raison = motDePasseAcceptable(v, id ?? 'magasin');
  check(`${pourquoi} refusé`, raison !== null && attendu.test(raison), `→ ${raison}`);
}
check('égal à l’identifiant refusé', motDePasseAcceptable('boutiquederb', 'boutiquederb') !== null);
check('identifiant trop court ignoré (pas de faux refus)', motDePasseAcceptable('Kx9#mP2q', 'kx') === null);
check('sans identifiant : accepté', motDePasseAcceptable('fil-rouge-2026') === null);
check('pas un texte → refusé', motDePasseAcceptable(undefined as unknown as string) !== null);

console.log('\n── Règle affichée (un seul texte partout) ──');
check('la règle cite le tiret bas', /tiret bas/.test(REGLE_IDENTIFIANT));
check('la règle dit 3 à 30 caractères', /3 à 30 caractères/.test(REGLE_IDENTIFIANT));
check('la règle dit par quoi commencer', /commence par une lettre ou un chiffre/.test(REGLE_IDENTIFIANT));
{
  const s = verifierSaisie('a', 'x');
  check('saisie mal écrite → même règle que l’admin', !s.ok && s.champ === 'identifiant' && s.texte.includes(REGLE_IDENTIFIANT));
}

console.log('\n── Saisie de connexion (/staff) ──');
{
  const a = verifierSaisie('  Magasin ', 'secret');
  check('majuscules et espaces tolérés', a.ok && a.identifiant === 'magasin');
  const b = verifierSaisie('magasin@equipe.lebtex.ma', 'secret');
  check('e-mail technique accepté (gestionnaire de mots de passe)', b.ok && b.identifiant === 'magasin');
  const c = verifierSaisie('patron@gmail.com', 'secret');
  check('autre adresse e-mail refusée', !c.ok && c.champ === 'identifiant');
  const d = verifierSaisie('magasin', '');
  check('mot de passe vide refusé', !d.ok && d.champ === 'motDePasse');
  const e = verifierSaisie('vente_casa', 'x');
  check('tiret bas accepté à la connexion', e.ok);
}

console.log('\n── Qui entre dans /staff ──');
check('administrateur reconnu', roleDepuisJeton(ADMIN_EMAIL.toUpperCase(), {}) === 'admin');
check('badge staff reconnu', roleDepuisJeton('magasin@equipe.lebtex.ma', { staff: true }) === 'staff');
check('sans badge : refusé', roleDepuisJeton('magasin@equipe.lebtex.ma', {}) === null);
check('badge mal formé : refusé', roleDepuisJeton('x@gmail.com', { staff: 'true' }) === null);

console.log('\n── Compte sans accès : jamais de déconnexion d’office hors équipe ──');
check('compte du domaine équipe sans badge → déconnecté', reactionSansAcces('squat@equipe.lebtex.ma') === 'deconnecter');
check('compte client (Gmail) → écran « autre compte »', reactionSansAcces('client@gmail.com') === 'autre_compte');
check('compte magasin (/gestion) → écran « autre compte »', reactionSansAcces('casa@lebtex.ma') === 'autre_compte');
check('sans e-mail → écran « autre compte »', reactionSansAcces(null) === 'autre_compte' && reactionSansAcces(undefined) === 'autre_compte');
check('domaine piégé → écran « autre compte »', reactionSansAcces('x@equipe.lebtex.ma.evil.com') === 'autre_compte');

console.log('\n── Refus de Firebase à la vérification ──');
check('compte désactivé', classerErreurVerification('auth/user-disabled') === 'desactive');
check('session révoquée (mot de passe changé)', classerErreurVerification('auth/user-token-expired') === 'session');
check('réseau : on attend', classerErreurVerification('auth/network-request-failed') === 'reseau');
check('inconnu : on propose de réessayer', classerErreurVerification('auth/quelque-chose') === 'autre');

console.log('\n── Compte affiché ──');
{
  const equipe = compteAffiche('staff', 'Magasin@Equipe.Lebtex.ma');
  check('équipe : le nom d’utilisateur, jamais l’e-mail technique', equipe.detail === 'magasin' && !equipe.detail.includes('@'));
  check('équipe : titre et initiale', equipe.titre === 'Compte équipe' && equipe.initiale === 'M');
  const admin = compteAffiche('admin', ADMIN_EMAIL);
  check('administrateur : titre', admin.titre === 'Administrateur');
}

console.log('\n── Signal « accès refusé » ──');
check('nom d’événement stable', EVENEMENT_ACCES_REFUSE === 'lebtex:acces-equipe-refuse');
{
  let ok = true;
  try { signalerAccesRefuse(401); } catch { ok = false; }
  check('sans navigateur (serveur) : ne plante pas', ok);
}

console.log('\n── Adresse de l’onglet Coût de vente ──');
check('?onglet=cout-vente → onglet coût de vente', lireAdresseEquipe('?onglet=cout-vente').onglet === 'cout-vente');
check('une commande demandée l’emporte', lireAdresseEquipe('?onglet=cout-vente&commande=A1').onglet === 'commandes');
check('onglet inconnu → commandes', lireAdresseEquipe('?onglet=gestion').onglet === 'commandes');
check('adresse écrite puis relue', lireAdresseEquipe(new URL(adresseEquipe('https://www.lebtex.ma/staff', 'cout-vente', null), 'https://x').search).onglet === 'cout-vente');
check('retour aux commandes : paramètre retiré', adresseEquipe('https://www.lebtex.ma/staff?onglet=cout-vente', 'commandes', null) === '/staff');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
