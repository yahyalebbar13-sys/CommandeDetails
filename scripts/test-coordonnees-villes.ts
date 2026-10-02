// Le checkout qui se souvient du client, et les villes du formulaire en français
// et en arabe : chaque ville a son palier et son nom arabe, les frais des villes
// d'avant ne bougent pas, et les coordonnées gardées sur le téléphone n'en disent
// pas plus que nécessaire.
// Lancer depuis la racine du projet :
//   npx tsx scripts/test-coordonnees-villes.ts
// (prêt à être copié dans scripts/ : il n'importe que src/lib, par l'alias @/.)

// localStorage factice (tsx tourne dans Node).
const magasin = new Map<string, string>();
let bloque = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => { if (bloque) throw new Error('bloqué'); return magasin.has(k) ? magasin.get(k)! : null; },
  setItem: (k: string, v: string) => { if (bloque) throw new Error('bloqué'); magasin.set(k, String(v)); },
  removeItem: (k: string) => { if (bloque) throw new Error('bloqué'); magasin.delete(k); },
};

import {
  GRANDES_VILLES, NOM_ARABE_VILLE, PERIPHERIE_CASABLANCA, VILLES_ELOIGNEES, VILLES_FORMULAIRE,
  estPeripherieCasablanca, fraisColis, nomVille, normaliserVille, optionsVilles, zoneDeVille,
} from '@/lib/livraison-boutique';
import {
  coordonneesAGarder, coordonneesLues, ecrireCoordonnees, effacerCoordonnees, lireCoordonnees,
  memeClient, modeRepris, nomPourSaluer,
} from '@/lib/coordonnees-client';
import { ecrireBrouillon, effacerBrouillon, lireBrouillon } from '@/lib/brouillon-commande';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
};
const eq = (label: string, obtenu: unknown, attendu: unknown) =>
  check(label, JSON.stringify(obtenu) === JSON.stringify(attendu), `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

/**
 * Les 42 villes du formulaire avant le 02/10/2026, avec leurs frais d'alors
 * (« p » : périphérie de Casablanca, camionnette possible pour un rouleau).
 * Commandes, brouillons et adresses les contiennent telles quelles.
 */
const AVANT: Record<string, string[]> = {
  '20': ['Casablanca'],
  '35p': ['Bouskoura', 'Dar Bouazza', 'Médiouna', 'Mohammedia'],
  '35': ['Rabat', 'Salé', 'Marrakech', 'Fès', 'Meknès', 'Tanger', 'Agadir', 'Oujda', 'Béni Mellal', 'Berrechid',
    'El Jadida', 'Inezgane', 'Kenitra', 'Khouribga', 'Nador', 'Safi', 'Settat', 'Témara'],
  '45': ['Al Hoceima', 'Berkane', 'Chefchaouen', 'Dakhla', 'Errachidia', 'Essaouira', 'Guelmim', 'Khémisset',
    'Khénifra', 'Ksar el-Kébir', 'Laâyoune', 'Larache', 'Ouarzazate', 'Sidi Kacem', 'Taourirt', 'Taroudant', 'Taza',
    'Tétouan', 'Tiznit'],
};
const ANCIENNES = Object.values(AVANT).flat();

console.log('── Villes du formulaire ──');
{
  eq('42 anciennes villes dans la table', ANCIENNES.length, 42);
  eq('aucun doublon de valeur', new Set(VILLES_FORMULAIRE).size, VILLES_FORMULAIRE.length);
  eq('aucun doublon de clé normalisée', new Set(VILLES_FORMULAIRE.map(normaliserVille)).size, VILLES_FORMULAIRE.length);
  const ars = Object.values(NOM_ARABE_VILLE);
  eq('aucun nom arabe en double (même normalisé)', new Set(ars.map(normaliserVille)).size, ars.length);
  eq('Casablanca en tête', VILLES_FORMULAIRE[0], 'Casablanca');
  for (const v of VILLES_FORMULAIRE) {
    check(`${v} : nom arabe`, /[ء-ي]/.test(NOM_ARABE_VILLE[v] ?? '') && !/[a-z]/i.test(NOM_ARABE_VILLE[v]));
  }
  const classees = new Set(['Casablanca', ...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES, ...VILLES_ELOIGNEES].map(normaliserVille));
  eq('chaque ville du formulaire a un palier écrit', VILLES_FORMULAIRE.filter((v) => !classees.has(normaliserVille(v))), []);
  const formulaire = new Set(VILLES_FORMULAIRE.map(normaliserVille));
  eq('chaque ville des paliers est au formulaire',
    [...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES, ...VILLES_ELOIGNEES].filter((v) => !formulaire.has(normaliserVille(v))), []);
  const paliers = [...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES, ...VILLES_ELOIGNEES].map(normaliserVille);
  eq('aucune ville dans deux paliers', new Set(paliers).size, paliers.length);
  eq('les anciennes villes restent, écrites pareil', ANCIENNES.filter((v) => !VILLES_FORMULAIRE.includes(v)), []);
  const demandees = ['Tit Mellil', 'Had Soualem', 'Benguerir', 'Ben Slimane', 'Bouznika', 'Skhirat', 'Sidi Bennour',
    'Youssoufia', 'Fquih Ben Salah', 'Kelaa des Sraghna', 'Azemmour', 'Midelt', 'Ifrane', 'Azrou', 'Sefrou', 'Guercif',
    'Martil', "M'diq", 'Fnideq', 'Ouazzane', 'Souk El Arbaa', 'Sidi Slimane', 'Sidi Ifni', 'Tan-Tan', 'Zagora', 'Tinghir',
    'Ait Melloul', 'Lahraouiyine', 'Deroua', 'Nouaceur', 'Aïn Harrouda'];
  eq('toutes les villes demandées sont proposées', demandees.filter((v) => !formulaire.has(normaliserVille(v))), []);
}

console.log('── Frais : les anciennes villes ne bougent pas ──');
{
  for (const [palier, villes] of Object.entries(AVANT)) {
    const frais = parseInt(palier, 10);
    const peripherie = palier.endsWith('p');
    for (const v of villes) eq(`${v} : ${frais} DH${peripherie ? ', périphérie' : ''}`, [fraisColis(v), estPeripherieCasablanca(v)], [frais, peripherie]);
  }
  // Nouvelles villes : 35 DH seulement là où Sendit est à 35 DH (lu le 02/10/2026).
  for (const v of ['Bouznika', 'Ben Slimane', 'Aït Melloul']) {
    eq(`${v} : 35 DH, pas en périphérie (pas de camionnette)`, [fraisColis(v), estPeripherieCasablanca(v)], [35, false]);
  }
  for (const v of ['Tit Mellil', 'Had Soualem', 'Lahraouiyine', 'Deroua', 'Nouaceur', 'Aïn Harrouda']) {
    eq(`${v} : 35 DH, périphérie`, [fraisColis(v), estPeripherieCasablanca(v)], [35, true]);
  }
  eq('Skhirat : 45 DH (39 chez Sendit)', fraisColis('Skhirat'), 45);
  for (const v of VILLES_ELOIGNEES) eq(`${v} : 45 DH`, fraisColis(v), 45);
  eq('ville inconnue : 45 DH', fraisColis('Imzouren'), 45);
}

console.log('── Le nom arabe tapé dans « Autre ville » ──');
{
  for (const v of VILLES_FORMULAIRE) {
    const ar = NOM_ARABE_VILLE[v];
    eq(`${ar} = ${v}`, [zoneDeVille(ar), estPeripherieCasablanca(ar)], [zoneDeVille(v), estPeripherieCasablanca(v)]);
  }
  // Fautes de clavier courantes : ه pour ة, ي pour ى, sans hamza, avec tatweel, clavier persan.
  eq('« المحمديه » (ه pour ة)', [fraisColis('المحمديه'), estPeripherieCasablanca('المحمديه')], [35, true]);
  eq('« القنيطره »', fraisColis('القنيطره'), 35);
  eq('« ايت ملول » sans hamza', fraisColis('ايت ملول'), 35);
  eq('« اكادير » sans hamza', fraisColis('اكادير'), 35);
  eq('« المحمـــدية » avec tatweel', fraisColis('المحمـــدية'), 35);
  eq('« سلى » (ى pour ا) reste inconnue', fraisColis('سلى'), 45);
  eq('« تيط مليل » clavier persan (ی)', fraisColis('تیط ملیل'), 35);
  eq('« بن سليمان » en deux mots', fraisColis('بن سليمان'), 35);
  eq('« Benslimane » attaché', fraisColis('Benslimane'), 35);
  eq('« الدار البيضاء » : 20 DH', fraisColis('الدار البيضاء'), 20);
  eq('« كازا » : 20 DH', fraisColis('كازا'), 20);
  eq('arabe inconnu : 45 DH', fraisColis('إمزورن'), 45);
}

console.log('── Affichage : nom arabe, valeur française ──');
{
  eq('nomVille fr', nomVille('Kenitra', 'fr'), 'Kenitra');
  eq('nomVille ar', nomVille('Kenitra', 'ar'), 'القنيطرة');
  eq('ville tapée à la main : telle quelle', nomVille('Imzouren', 'ar'), 'Imzouren');
  for (const lang of ['fr', 'ar'] as const) {
    const o = optionsVilles(lang);
    eq(`${lang} : Casablanca en tête`, o[0].valeur, 'Casablanca');
    eq(`${lang} : toutes les villes`, o.map((x) => x.valeur).sort(), [...VILLES_FORMULAIRE].sort());
    const suite = o.slice(1).map((x) => x.libelle);
    eq(`${lang} : ordre alphabétique`, suite, [...suite].sort((a, b) => a.localeCompare(b, lang, { sensitivity: 'base' })));
    check(`${lang} : valeur toujours en français`, o.every((x) => !/[ء-ي]/.test(x.valeur)));
  }
}

console.log('── Coordonnées gardées ──');
{
  const champs = { fullName: '  Yassine   El Idrissi ', phone: '06 12 34 56 78', city: 'Kenitra', villeAutre: '', address: 'N° 5, Rue 3, Hay Salam', mode: 'domicile' };
  const c = coordonneesAGarder(champs)!;
  eq('ce qui est gardé', c, { fullName: 'Yassine El Idrissi', phone: '0612345678', city: 'Kenitra', villeAutre: '', address: 'N° 5, Rue 3, Hay Salam', mode: 'domicile' });
  eq('rien d’autre (ni e-mail, ni 2e numéro, ni remarque)',
    Object.keys(coordonneesAGarder({ ...champs, email: 'a@b.ma', notes: 'x', phone2: '0700000000' } as any)!).sort(),
    ['address', 'city', 'fullName', 'mode', 'phone', 'villeAutre']);
  eq('sans nom : rien', coordonneesAGarder({ ...champs, fullName: '  ' }), null);
  eq('numéro faux : rien', coordonneesAGarder({ ...champs, phone: '1234' }), null);
  eq('mode inconnu : vide', coordonneesAGarder({ ...champs, mode: 'avion' })!.mode, '');

  // Le mode d'un rouleau n'est jamais gardé (retrait à CHRIFA, choix toujours laissé au client).
  eq('petit colis, retrait : gardé', coordonneesAGarder({ ...champs, mode: 'retrait' }, false)!.mode, 'retrait');
  eq('rouleau, retrait : pas gardé', coordonneesAGarder({ ...champs, mode: 'retrait' }, true)!.mode, '');
  eq('rouleau, transport : pas gardé', coordonneesAGarder({ ...champs, mode: 'transport' }, true)!.mode, '');
  eq('transport sans rouleau : pas gardé', coordonneesAGarder({ ...champs, mode: 'transport' }, false)!.mode, '');
  eq('repris pour un petit colis : domicile', modeRepris({ mode: 'domicile' }, false), 'domicile');
  eq('repris pour un petit colis : retrait (Derb Omar)', modeRepris({ mode: 'retrait' }, false), 'retrait');
  eq('jamais coché d’office pour un rouleau (retrait)', modeRepris({ mode: 'retrait' }, true), '');
  eq('jamais coché d’office pour un rouleau (domicile)', modeRepris({ mode: 'domicile' }, true), '');
  eq('vieille valeur « transport » relue : rien', coordonneesLues({ ...c, mode: 'transport', majLe: 1 }, 2)!.mode, '');

  magasin.clear();
  eq('rien de gardé : null', lireCoordonnees(), null);
  ecrireCoordonnees(c, 1_000);
  eq('relu', lireCoordonnees(2_000), c);
  eq('plus d’un an sans commande : oublié', lireCoordonnees(1_000 + 366 * 24 * 3600_000), null);
  magasin.set('lebtex_coordonnees_client_v1', '{pas du json');
  eq('illisible : null', lireCoordonnees(), null);
  magasin.set('lebtex_coordonnees_client_v1', JSON.stringify({ ...c, phone: 'abc', majLe: 1 }));
  eq('numéro abîmé : null', lireCoordonnees(2), null);
  eq('sans date : null', coordonneesLues({ ...c }), null);
  ecrireCoordonnees(c);
  effacerCoordonnees();
  eq('effacé', lireCoordonnees(), null);
  bloque = true;
  ecrireCoordonnees(c);
  effacerCoordonnees();
  eq('localStorage bloqué : null, sans planter', lireCoordonnees(), null);
  bloque = false;

  // Brouillon et coordonnées : deux clés, effacer l’un ne touche pas l’autre.
  ecrireCoordonnees(c);
  ecrireBrouillon({ champs: { fullName: 'Autre', email: 'autre@exemple.ma' } });
  effacerBrouillon();
  eq('effacer le brouillon garde les coordonnées', lireCoordonnees(), c);
  eq('brouillon bien effacé', lireBrouillon(), null);
  effacerCoordonnees();

  // Bonjour à qui ? Le nom gardé en entier : jamais « عبد » ou « Mercerie » seuls.
  eq('nom simple', nomPourSaluer('Yassine El Idrissi'), 'Yassine El Idrissi');
  eq('prénom composé en عبد', nomPourSaluer('عبد الرحيم بناني'), 'عبد الرحيم بناني');
  eq('prénom composé en Abd', nomPourSaluer('Abd El Kader Bennani'), 'Abd El Kader Bennani');
  eq('nom de commerce', nomPourSaluer('Mercerie Nour'), 'Mercerie Nour');
  eq('civilité', nomPourSaluer('Mme Fatima Zahra'), 'Mme Fatima Zahra');
  eq('espaces en trop', nomPourSaluer('  Atelier   Salam  '), 'Atelier Salam');
  eq('trop long : coupé entre deux mots', nomPourSaluer('Atelier de couture Hay Mohammadi Casablanca'), 'Atelier de couture Hay…');
  eq('un seul mot trop long', nomPourSaluer('A'.repeat(40)), `${'A'.repeat(30)}…`);
  eq('vide', nomPourSaluer(''), '');

  check('même client : numéro écrit autrement', memeClient(c, { fullName: 'yassine el idrissi', phone: '+212612345678' }));
  check('autre nom : autre client', !memeClient(c, { fullName: 'Karim', phone: '0612345678' }));
  check('autre numéro : autre client', !memeClient(c, { fullName: c.fullName, phone: '0699999999' }));
  check('champs vidés (« Ce n’est pas moi ») : plus de « Bonjour »', !memeClient(c, { fullName: '', phone: '' }));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
