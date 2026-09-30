// La livraison de la boutique : frais par ville (jamais offerts), modes de
// réception, rouleaux entiers, et les réglages de réception (RIB, camionnette).
//
// Ce que le client voit avant de commander : un prix faux ici, c'est un appel
// de plus ou une marge perdue sur chaque colis.
// Lancer :
//   npx tsx scripts/test-livraison-boutique.ts

import {
  DELAI_ZONE, FRAIS_ZONE, GRANDES_VILLES, PERIPHERIE_CASABLANCA, RESUME_FRAIS,
  TEXTE_TRANSPORT_VOLUMINEUX, VILLES_ELOIGNEES,
  commandeVolumineuse, delaiColis, estCasablanca, estPeripherieCasablanca, fraisColis,
  fraisLivraison, libelleFrais, lieuRetraitPour, modesPossibles,
  normaliserVille, zoneDeVille,
} from '../src/lib/livraison-boutique';
import {
  REGLAGES_RECEPTION_DEFAUT, lireReglagesReception, ribLisible, ribValide,
} from '../src/lib/reglages-reception';
import * as shopUtils from '../src/lib/shop-utils';
import { getDeliveryDays, getDeliveryFee, isCasablanca } from '../src/lib/shop-utils';
import * as livraison from '../src/lib/livraison-boutique';
import { DELIVERY_ZONES, MOROCCAN_CITIES } from '../src/lib/shop-types';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
/** JSON aux clés triées : l'ordre des champs d'un objet ne compte pas. */
const stable = (v: any): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, stable(obtenu) === stable(attendu), `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

console.log('\n── La grille Sendit : 20 / 35 / 45 DH ──');
{
  eq('Casablanca 20 DH', FRAIS_ZONE.casablanca, 20);
  eq('périphérie et grandes villes 35 DH', FRAIS_ZONE.standard, 35);
  eq('villes éloignées 45 DH', FRAIS_ZONE.eloignee, 45);
  eq('délai Casablanca', DELAI_ZONE.casablanca, '24-48h');
  eq('délai standard', DELAI_ZONE.standard, '1-3 jours ouvrés');
  eq('délai éloigné', DELAI_ZONE.eloignee, '2-4 jours ouvrés');
  eq('la grille en une ligne, en MAD comme les prix du site', RESUME_FRAIS,
    '20 MAD à Casablanca · 35 MAD périphérie et grandes villes · 45 MAD ailleurs');
}

console.log('\n── Chaque ville du plan tombe dans son palier ──');
{
  eq('Casablanca', zoneDeVille('Casablanca'), 'casablanca');
  for (const v of PERIPHERIE_CASABLANCA) eq(`périphérie : ${v}`, zoneDeVille(v), 'standard');
  for (const v of GRANDES_VILLES) eq(`grande ville : ${v}`, zoneDeVille(v), 'standard');
  for (const v of VILLES_ELOIGNEES) eq(`éloignée : ${v}`, zoneDeVille(v), 'eloignee');
  eq('Sidi Kacem 45 DH', fraisColis('Sidi Kacem'), 45);
  eq('Taourirt 45 DH', fraisColis('Taourirt'), 45);
  eq('Oujda passe à 35 DH (40 avant)', fraisColis('Oujda'), 35);
  eq('Mohammedia passe à 35 DH (50 avant)', fraisColis('Mohammedia'), 35);
}

console.log('\n── Accents, casse, espaces, tirets, alias ──');
{
  eq('« casablanca »', zoneDeVille('casablanca'), 'casablanca');
  eq('« CASABLANCA  » avec espaces', zoneDeVille('  CASABLANCA  '), 'casablanca');
  eq('« Casa »', zoneDeVille('Casa'), 'casablanca');
  eq('« Dar El Beida »', zoneDeVille('Dar El Beida'), 'casablanca');
  eq('« الدار البيضاء »', zoneDeVille('الدار البيضاء'), 'casablanca');
  eq('« Casablanca - Ain Sebaa » (quartier Sendit)', zoneDeVille('Casablanca - Ain Sebaa'), 'casablanca');
  eq('« Casablanca, Maârif »', zoneDeVille('Casablanca, Maârif'), 'casablanca');
  eq('« Casablanca (Anfa) »', zoneDeVille('Casablanca (Anfa)'), 'casablanca');
  eq('« Mediouna » sans accent', zoneDeVille('Mediouna'), 'standard');
  eq('« dar-bouazza »', zoneDeVille('dar-bouazza'), 'standard');
  eq('« Dar Bouaza » (faute courante)', zoneDeVille('Dar Bouaza'), 'standard');
  eq('« Mohamedia »', zoneDeVille('Mohamedia'), 'standard');
  eq('« Kenitra » (liste) = « Kénitra »', zoneDeVille('Kenitra'), 'standard');
  eq('« FES »', zoneDeVille('FES'), 'standard');
  eq('« Fez »', zoneDeVille('Fez'), 'standard');
  eq('« Temara »', zoneDeVille('Temara'), 'standard');
  eq('« sale »', zoneDeVille('sale'), 'standard');
  eq('« Beni-Mellal »', zoneDeVille('Beni-Mellal'), 'standard');
  eq('« KSAR EL KEBIR »', zoneDeVille('KSAR EL KEBIR'), 'eloignee');
  eq('« Laayoune »', zoneDeVille('Laayoune'), 'eloignee');
  eq('« Mohammedia - Centre »', zoneDeVille('Mohammedia - Centre'), 'standard');
  eq('normalisation : « Ksar el-Kébir »', normaliserVille('Ksar el-Kébir'), 'ksarelkebir');
}

console.log('\n── Ville inconnue ou vide : 45 DH (le prix ne peut que baisser au téléphone) ──');
{
  eq('« Autre ville »', zoneDeVille('Autre ville'), 'eloignee');
  eq('« Tinghir » (tapée librement)', fraisColis('Tinghir'), 45);
  eq('chaîne vide', zoneDeVille(''), 'eloignee');
  eq('undefined à l’exécution (ancienne commande)', zoneDeVille(undefined as any), 'eloignee');
  eq('null à l’exécution', fraisColis(null as any), 45);
  eq('« Casablancaaa » n’est pas Casablanca', zoneDeVille('Casablancaaa'), 'eloignee');
  eq('« Casa Nostra » n’est pas Casablanca', zoneDeVille('Casa Nostra'), 'eloignee');
  eq('délai d’une ville inconnue', delaiColis('Tinghir'), '2-4 jours ouvrés');
}

console.log('\n── Casablanca et sa périphérie ──');
{
  check('Casablanca est Casablanca', estCasablanca('Casablanca'));
  check('Mohammedia n’est pas Casablanca', !estCasablanca('Mohammedia'));
  check('Bouskoura est en périphérie', estPeripherieCasablanca('Bouskoura'));
  check('Médiouna est en périphérie', estPeripherieCasablanca('médiouna'));
  check('Casablanca n’est pas « périphérie »', !estPeripherieCasablanca('Casablanca'));
  check('Rabat n’est pas en périphérie', !estPeripherieCasablanca('Rabat'));
  check('ville vide : ni l’un ni l’autre', !estCasablanca('') && !estPeripherieCasablanca(''));
}

console.log('\n── Plus aucune livraison offerte (30/09/2026) ──');
{
  for (const nom of ['SEUIL_OFFERTE_CASABLANCA', 'SEUIL_OFFERTE_AUTRES', 'livraisonOfferte', 'seuilOfferte']) {
    check(`livraison-boutique n'exporte plus ${nom}`, !(nom in livraison));
  }
  for (const nom of ['FREE_DELIVERY_THRESHOLD', 'CASABLANCA_FREE_DELIVERY_THRESHOLD', 'isEligibleForFreeDelivery', 'getFreeDeliveryProgress']) {
    check(`shop-utils n'exporte plus ${nom}`, !(nom in shopUtils));
  }
}

console.log('\n── Frais selon le mode de réception ──');
{
  eq('domicile Casablanca : 20', fraisLivraison({ mode: 'domicile', ville: 'Casablanca' }), 20);
  eq('domicile Bouskoura : 35', fraisLivraison({ mode: 'domicile', ville: 'Bouskoura' }), 35);
  eq('domicile Tétouan : 45', fraisLivraison({ mode: 'domicile', ville: 'Tétouan' }), 45);
  eq('domicile, gros panier : toujours payant (plus de seuil)', fraisLivraison({ mode: 'domicile', ville: 'Casablanca', sousTotal: 5000 } as any), 20);
  eq('retrait : toujours 0', fraisLivraison({ mode: 'retrait', ville: 'Tétouan' }), 0);
  eq('retrait sans ville : 0', fraisLivraison({ mode: 'retrait', ville: '' }), 0);
  eq('transport : null (à confirmer)', fraisLivraison({ mode: 'transport', ville: 'Casablanca' }), null);
  eq('transport, autre ville : null quand même', fraisLivraison({ mode: 'transport', ville: 'Agadir' }), null);
  eq('mode inconnu (ancienne commande) : lu comme domicile', fraisLivraison({ mode: undefined as any, ville: 'Rabat' }), 35);
}

console.log('\n── Le libellé des frais ──');
{
  eq('20 DH', libelleFrais(20), '20 DH');
  eq('45 DH', libelleFrais(45), '45 DH');
  eq('0 (retrait) : Gratuit, jamais « Offerte »', libelleFrais(0), 'Gratuit');
  eq('null : à confirmer', libelleFrais(null), 'À confirmer par téléphone');
  eq('NaN : à confirmer, jamais « NaN DH »', libelleFrais(NaN), 'À confirmer par téléphone');
  eq('négatif : à confirmer', libelleFrais(-5), 'À confirmer par téléphone');
}

console.log('\n── Rouleaux entiers : modes et lieu de retrait ──');
{
  check('panier vide : pas volumineux', !commandeVolumineuse([]));
  check('petits articles : pas volumineux', !commandeVolumineuse([{}, { volumineux: false }]));
  check('un rouleau suffit', commandeVolumineuse([{}, { volumineux: true }]));
  check('valeur « true » en texte : ignorée', !commandeVolumineuse([{ volumineux: 'true' as any }]));
  check('liste absente à l’exécution : pas volumineux', !commandeVolumineuse(undefined as any));
  check('ligne nulle dans la liste : ignorée', !commandeVolumineuse([null as any]));
  eq('volumineux : retrait ou transport, jamais domicile', modesPossibles(true), ['retrait', 'transport']);
  eq('petits articles : domicile ou retrait', modesPossibles(false), ['domicile', 'retrait']);
  eq('volumineux : retrait à CHRIFA', lieuRetraitPour(true), 'chrifa');
  eq('petits articles : retrait à Derb Omar', lieuRetraitPour(false), 'derb_omar');
  check('notice : ne part pas par colis', TEXTE_TRANSPORT_VOLUMINEUX.includes('ne part pas par colis'));
  check('notice : retrait gratuit', TEXTE_TRANSPORT_VOLUMINEUX.includes('gratuitement'));
  check('notice : camionnette', TEXTE_TRANSPORT_VOLUMINEUX.includes('camionnette'));
  check('notice : dépôt du transporteur dans la ville', TEXTE_TRANSPORT_VOLUMINEUX.includes('dépôt') && TEXTE_TRANSPORT_VOLUMINEUX.includes('récupérez'));
  check('notice : rien avant accord', TEXTE_TRANSPORT_VOLUMINEUX.includes('avant votre accord'));
  check('notice : aucun prix', !/\d+\s*DH/.test(TEXTE_TRANSPORT_VOLUMINEUX));
}

console.log('\n── La liste des villes du formulaire ──');
{
  eq('aucun doublon', new Set(MOROCCAN_CITIES).size, MOROCCAN_CITIES.length);
  for (const v of ['Témara', 'Bouskoura', 'Dar Bouazza', 'Médiouna', 'Tiznit']) check(`${v} ajoutée`, MOROCCAN_CITIES.includes(v));
  // Les adresses enregistrées pré-remplissent la liste : aucune ancienne entrée ne disparaît.
  const anciennes = ['Casablanca', 'Rabat', 'Salé', 'Marrakech', 'Fès', 'Meknès', 'Tanger', 'Agadir', 'Oujda', 'Kenitra',
    'Tétouan', 'El Jadida', 'Safi', 'Mohammedia', 'Khouribga', 'Béni Mellal', 'Nador', 'Laâyoune', 'Dakhla', 'Settat',
    'Berrechid', 'Khémisset', 'Inezgane', 'Taza', 'Guelmim', 'Larache', 'Ksar el-Kébir', 'Berkane', 'Al Hoceima',
    'Taourirt', 'Khénifra', 'Sidi Kacem'];
  eq('les 32 anciennes villes sont toutes là', anciennes.filter((v) => !MOROCCAN_CITIES.includes(v)), []);
  eq('Casablanca en tête', MOROCCAN_CITIES[0], 'Casablanca');
  const suite = MOROCCAN_CITIES.slice(9);
  const triee = [...suite].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  eq('après les 9 grandes, ordre alphabétique', suite, triee);
  // Chaque ville du formulaire est classée exprès (aucune ne tombe à 45 DH par oubli).
  const classees = new Set([...['Casablanca'], ...PERIPHERIE_CASABLANCA, ...GRANDES_VILLES, ...VILLES_ELOIGNEES].map(normaliserVille));
  eq('toutes les villes du formulaire ont un palier écrit', MOROCCAN_CITIES.filter((v) => !classees.has(normaliserVille(v))), []);
}

console.log('\n── Les anciens noms de shop-utils suivent la nouvelle grille ──');
{
  eq('getDeliveryFee Casablanca', getDeliveryFee('Casablanca'), 20);
  eq('getDeliveryFee Marrakech', getDeliveryFee('Marrakech'), 35);
  eq('getDeliveryFee inconnue', getDeliveryFee('Tinghir'), 45);
  eq('getDeliveryDays Casablanca', getDeliveryDays('Casablanca'), '24-48h');
  eq('getDeliveryDays Rabat', getDeliveryDays('Rabat'), '1-3 jours ouvrés');
  check('isCasablanca(« casa »)', isCasablanca('casa'));
  check('isCasablanca ne reconnaît plus « Casanova » par morceau', !isCasablanca('Casanova'));
  eq('DELIVERY_ZONES (déprécié) aligné : Casablanca', DELIVERY_ZONES.casablanca.fee, 20);
  eq('DELIVERY_ZONES (déprécié) aligné : autres', DELIVERY_ZONES.other.fee, 45);
}

console.log('\n── Réglages de réception : RIB ──');
{
  const rib = '011780000012345678901234';
  check('24 chiffres : valable', ribValide(rib));
  check('24 chiffres avec espaces : valable', ribValide('011 780 0000123456789012 34'));
  check('23 chiffres : refusé', !ribValide(rib.slice(1)));
  check('25 chiffres : refusé', !ribValide(rib + '5'));
  check('une lettre : refusé', !ribValide(rib.slice(0, 23) + 'A'));
  check('vide : refusé', !ribValide(''));
  check('undefined à l’exécution : refusé', !ribValide(undefined as any));
  eq('RIB lisible : banque, ville, compte, clé', ribLisible(rib), '011 780 0000123456789012 34');
  eq('RIB lisible depuis un RIB espacé', ribLisible('0117 8000 0012 3456 7890 1234'), '011 780 0000123456789012 34');
  eq('RIB invalide : rendu tel quel (sans espaces)', ribLisible('12 34'), '1234');
}

console.log('\n── Réglages de réception : lecture tolérante ──');
{
  eq('document absent : valeurs par défaut', lireReglagesReception(undefined), { ...REGLAGES_RECEPTION_DEFAUT, majLe: undefined });
  eq('document illisible (texte) : valeurs par défaut', lireReglagesReception('n’importe quoi').camionnette, REGLAGES_RECEPTION_DEFAUT.camionnette);
  const d = lireReglagesReception(null);
  check('par défaut : virement caché (pas de RIB)', !d.virement.actif);
  check('par défaut : carte cachée (pas de prestataire)', !d.carte.actif);
  check('par défaut : deux lieux de retrait actifs', d.lieux.derb_omar.actif && d.lieux.chrifa.actif);
  eq('par défaut : camionnette 50 / 80 DH', [d.camionnette.prixCasablanca, d.camionnette.prixPeripherie], [50, 80]);
  check('la camionnette n’a plus de seuil « offerte dès »', !('offerteDes' in d.camionnette));
  check('un vieux document avec offerteDes : ignoré', !('offerteDes' in lireReglagesReception({ camionnette: { offerteDes: 2000 } }).camionnette));
  eq('par défaut : tournées', d.camionnette.jours, 'mardi et jeudi');

  const ok = lireReglagesReception({ virement: { actif: true, titulaire: ' LEBTEX SARL AU ', banque: 'Banque', rib: '011 780 0000123456789012 34' } });
  check('virement complet : proposé', ok.virement.actif);
  eq('titulaire nettoyé', ok.virement.titulaire, 'LEBTEX SARL AU');
  eq('RIB rangé sans espaces', ok.virement.rib, '011780000012345678901234');
  check('RIB faux : virement caché même si « actif »', !lireReglagesReception({ virement: { actif: true, titulaire: 'LEBTEX', rib: '123' } }).virement.actif);
  check('sans titulaire : virement caché', !lireReglagesReception({ virement: { actif: true, titulaire: '  ', rib: '011780000012345678901234' } }).virement.actif);
  check('« actif » en texte : virement caché', !lireReglagesReception({ virement: { actif: 'true', titulaire: 'LEBTEX', rib: '011780000012345678901234' } }).virement.actif);
  check('actif faux : virement caché', !lireReglagesReception({ virement: { actif: false, titulaire: 'LEBTEX', rib: '011780000012345678901234' } }).virement.actif);

  const c = lireReglagesReception({ camionnette: { actif: false, prixCasablanca: -10, prixPeripherie: 'x', jours: '   ' } });
  check('camionnette désactivable', !c.camionnette.actif);
  eq('prix négatif : valeur par défaut', c.camionnette.prixCasablanca, 50);
  eq('prix en texte : valeur par défaut', c.camionnette.prixPeripherie, 80);
  eq('jours vides : valeur par défaut', c.camionnette.jours, 'mardi et jeudi');
  eq('prix NaN : valeur par défaut', lireReglagesReception({ camionnette: { prixCasablanca: NaN } }).camionnette.prixCasablanca, 50);

  const l = lireReglagesReception({ lieux: { chrifa: { actif: false, nom: 'x'.repeat(200), adresse: '  12 rue X  ' } } });
  check('lieu désactivable', !l.lieux.chrifa.actif);
  eq('nom coupé à 80 caractères', l.lieux.chrifa.nom.length, 80);
  eq('adresse nettoyée', l.lieux.chrifa.adresse, '12 rue X');
  eq('champ absent : valeur par défaut', l.lieux.chrifa.telephone, REGLAGES_RECEPTION_DEFAUT.lieux.chrifa.telephone);
  eq('l’autre lieu garde ses valeurs', l.lieux.derb_omar, REGLAGES_RECEPTION_DEFAUT.lieux.derb_omar);

  check('carte activée seulement par un vrai booléen', lireReglagesReception({ carte: { actif: true } }).carte.actif && !lireReglagesReception({ carte: { actif: 1 } }).carte.actif);
  eq('date de mise à jour gardée', lireReglagesReception({ majLe: '2026-09-29T10:00:00Z' }).majLe, '2026-09-29T10:00:00Z');
  eq('date illisible : absente', lireReglagesReception({ majLe: 12 }).majLe, undefined);
}

console.log(`\n${pass} réussis, ${fail} échoués\n`);
if (fail > 0) process.exit(1);
