// Tests du tableau des arrivages (lib/tableau-arrivages.ts), des chiffres d'un
// dossier (lib/chiffres-dossier.ts) et de ce qu'entraîne une modification
// (lib/edition-dossier.ts).
// Lancer :
//   npx tsx scripts/test-tableau-arrivages.ts

import {
  ANOMALIES, FILTRES_VIDES, NON_RENSEIGNE, construireLignes, correspond, filtrerLignes, jourCourt,
  joursJusqua, lireNombre, statutDuDossier, totaliser, trierLignes, valeursDistinctes,
  type FiltresArrivages,
} from '../src/lib/tableau-arrivages';
import { coutsDuDossier, droitsPayesDuDossier, resumerDossier, tauxDeChangeDossier } from '../src/lib/chiffres-dossier';
import { articlesAPrevenir, statutPourLesClients, transitaireDeLaSociete } from '../src/lib/edition-dossier';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const proche = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const json = (v: unknown) => JSON.stringify(v);

// Dates relatives à aujourd'hui : les statuts se calculent sur la date du jour.
const jour = (decalage: number) => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const subCategories = [
  { name: 'NON WOVEN', customsValuePerKg: 5, importDutyRate: 10, tvaRate: 20 },
  { name: 'ZIPPER' },
];

console.log('\n── Chiffres d\'un dossier ──');
{
  const facture = { id: 'D1', invoicePaidDhs: 100000, declaredValue: 10000, exchangeInvoiceAmount: 1200, supplierInvoiceAmount: 2400, freightCost: 100 };
  const articles = [
    { id: 'a1', factureId: 'D1', categoryId: 'NON WOVEN', quantity: 100, purchasePricePerUnit: 2, cubicMeasurement: 10, netWeight: 1000 },
    { id: 'a2', factureId: 'D1', categoryId: 'ZIPPER', quantity: 50, purchasePricePerUnit: 4, cubicMeasurement: 30, netWeight: 500 },
  ];
  const r = resumerDossier(facture, articles);
  check('valeur marchandise 100×2 + 50×4 = 400 $', r.itemsVal === 400, `→ ${r.itemsVal}`);
  check('CBM 40, poids 1500', r.cbm === 40 && r.netWeight === 1500);
  check('facture réelle = marchandise + fret', r.realFactureValue === 500);
  check('efficience fret 100 / 40', proche(r.efficiency, 2.5));
  check('complet (poids et CBM partout)', r.isIncomplete === false);
  check('taux de change 100 000 / 10 000', tauxDeChangeDossier(facture) === 10);

  // Calcul fait à la main : frais revient (1200 + 2400 + 100×10) / 1,2 = 3 833,33.
  const c = coutsDuDossier(facture, articles, subCategories, { 'NON WOVEN': '1.5' });
  check('coût de revient 4 558,33 + 4 875', proche(c.revient, 4558.333333333333 + 4875), `→ ${c.revient}`);
  check('coût de vente (DP sur NON WOVEN seul) 4 137,5', proche(c.vente, 4137.5), `→ ${c.vente}`);
  check('DP remplie', c.hasDp === true);
  check('sans DP : pas de coût de vente', coutsDuDossier(facture, articles, subCategories, {}).hasDp === false);
  check('dossier vide : zéro', json(coutsDuDossier(facture, [], subCategories, {})) === json({ revient: 0, vente: 0, hasDp: false }));

  check('droits payés : 500 DI + 1 100 TVA', proche(droitsPayesDuDossier(articles, subCategories), 1600));
  check('droits : le poids retouché en Coût de Revient prime', proche(droitsPayesDuDossier(articles, subCategories, { a1: { netWeight: 2000 } }), 3200));
}

console.log('\n── Lignes du tableau ──');
const factures = [
  { id: 'MH1', supplierId: 'MH', declaringCompany: 'Lebtex', forwarder: 'IDRISTRANS', shippingLine: 'MSC', noBL: 'MEDUKV285573', arrivalDate: jour(12), declaredValue: 10000, invoicePaidDhs: 100000, suivi: { conteneurs: ['MSCU1234567'], navire: 'MSC Aurora' } },
  { id: 'JIMMY2', supplierId: 'jimmy', declaringCompany: 'Robe in box', forwarder: 'NOUH TRANSIT TRANSPORT', shippingLine: 'COSCO', noBL: '', arrivalDate: jour(-3) },
  { id: 'MH3', supplierId: 'MH', declaringCompany: 'Lebtex', shippingLine: 'MSC', noBL: 'X1', arrivalDate: jour(-10), stockEntryDate: jour(-2), declaredValue: 5000, invoicePaidDhs: 52000 },
  { id: 'VIEUX', supplierId: 'MH', arrivalDate: jour(-90) },
  { id: 'VALIDE', supplierId: 'MH', status: 'STOCK', arrivalDate: jour(-5) },
];
const articles = [
  { id: 'a1', factureId: 'MH1', categoryId: 'NON WOVEN', name: 'Non woven 1030EF', color: 'Écru', quantity: 100, purchasePricePerUnit: 2, cubicMeasurement: 10, netWeight: 1000, clientName: 'Adil' },
  { id: 'a2', factureId: 'MH1', categoryId: 'NON WOVEN', name: 'Non woven 1030E', quantity: 10, purchasePricePerUnit: 1, cubicMeasurement: 1, netWeight: 0, clientName: 'adil' },
  { id: 'a3', factureId: 'MH1', categoryId: 'ZIPPER', name: 'No5 zipper', quantity: 5, purchasePricePerUnit: 1, cubicMeasurement: 1, netWeight: 5, colorBreakdown: [{ colorCode: '3036', rolls: 5 }] },
  { id: 'a4', factureId: 'JIMMY2', categoryId: 'ZIPPER', name: 'Slider', quantity: 1, purchasePricePerUnit: 1, cubicMeasurement: 1, netWeight: 1, clientName: 'Karim' },
  { id: 'a5', factureId: 'MH3', categoryId: 'ZIPPER', name: 'Long chain', quantity: 1, purchasePricePerUnit: 3, cubicMeasurement: 2, netWeight: 2 },
  { id: 'orphelin', factureId: 'INCONNU', quantity: 1 },
  { id: 'pi', factureId: '', quantity: 1 },
];
const lignes = construireLignes({
  factures, articles, subCategories,
  declarations: { MH1: { puMap: { 'NON WOVEN': '1.5' } } },
  verifications: { MH1: { douane_ok: true, facture_mad_ok: true, nw_cbm_ok: true, dp_ok: true }, JIMMY2: { douane_ok: true } },
});
const L = (id: string) => lignes.find(l => l.id === id)!;
{
  check('une ligne par dossier, articles sans dossier ignorés', lignes.length === 5 && L('MH1').itemsCount === 3);
  check('en route → transit', L('MH1').statut === 'TRANSIT', L('MH1').statut);
  check('arrivé, pas entré en stock → dédouanement', L('JIMMY2').statut === 'CUSTOMS', L('JIMMY2').statut);
  check('date d\'entrée passée → en stock', L('MH3').statut === 'STOCK');
  check('arrivé il y a plus d\'un mois → en stock', L('VIEUX').statut === 'STOCK');
  check('validé par /stock (status STOCK) → en stock', L('VALIDE').statut === 'STOCK');
  check('entrée en stock prévue plus tard → pas encore en stock',
    statutDuDossier({ arrivalDate: jour(-2), stockEntryDate: jour(3) }) === 'CUSTOMS');
  check('catégories, la plus fournie d\'abord', json(L('MH1').categories) === json([{ nom: 'NON WOVEN', nombre: 2 }, { nom: 'ZIPPER', nombre: 1 }]));
  check('clients sans doublon de casse', json(L('MH1').clients) === json(['Adil']));
  check('un article sans poids = dossier incomplet', L('MH1').articlesIncomplets === 1 && L('MH1').isIncomplete);
  check('coûts et DP repris', L('MH1').hasDp && L('MH1').vente > 0 && !L('JIMMY2').hasDp);
  check('vérifications reprises', L('MH1').verifications.dp_ok === true && Object.keys(L('VIEUX').verifications).length === 0);
}

console.log('\n── Recherche ──');
{
  check('par n° de dossier', correspond(L('MH1'), 'mh1'));
  check('par article, sans accent', correspond(L('MH1'), 'ecru'));
  check('par code couleur d\'une répartition', correspond(L('MH1'), '3036'));
  check('par n° de conteneur du suivi', correspond(L('MH1'), 'MSCU1234567'));
  check('par navire', correspond(L('MH1'), 'aurora'));
  check('par client', correspond(L('JIMMY2'), 'karim'));
  check('tous les mots doivent y être', correspond(L('MH1'), 'msc zipper') && !correspond(L('MH1'), 'msc karim'));
  check('recherche vide = tout', correspond(L('VIEUX'), '   '));
}

console.log('\n── Filtres ──');
const filtre = (p: Partial<FiltresArrivages>, attendues: string[] = []) =>
  filtrerLignes(lignes, { ...FILTRES_VIDES, ...p }, attendues).map(l => l.id).sort().join(',');
{
  check('statut transit', filtre({ statut: 'transit' }) === 'MH1');
  check('statut dédouanement', filtre({ statut: 'douane' }) === 'JIMMY2');
  check('statut stock', filtre({ statut: 'stock' }) === 'MH3,VALIDE,VIEUX');
  check('fournisseur, casse ignorée', filtre({ fournisseur: 'JIMMY' }) === 'JIMMY2');
  check('transitaire non renseigné', filtre({ transitaire: NON_RENSEIGNE }) === 'MH3,VALIDE,VIEUX');
  check('période d\'arrivée', filtre({ du: jour(-11), au: jour(0) }) === 'JIMMY2,MH3,VALIDE');
  check('période : sans date d\'arrivée, écarté', filtrerLignes([...lignes, ...construireLignes({ factures: [{ id: 'SANS' }], articles: [], subCategories })], { ...FILTRES_VIDES, du: '2000-01-01' }).every(l => l.id !== 'SANS'));
  check('filtres cumulés', filtre({ fournisseur: 'MH', statut: 'stock', recherche: 'chain' }) === 'MH3');
  check('anomalie : sans BL', filtre({ anomalie: 'sans-bl' }) === 'JIMMY2,VALIDE,VIEUX');
  check('anomalie : sans valeur déclarée', filtre({ anomalie: 'sans-valeur' }) === 'JIMMY2,VALIDE,VIEUX');
  check('anomalie : poids ou CBM manquants', filtre({ anomalie: 'poids-cbm' }) === 'MH1');
  check('anomalie : aucun article', filtre({ anomalie: 'vide' }) === 'VALIDE,VIEUX');
  const quatre = ['douane_ok', 'facture_mad_ok', 'nw_cbm_ok', 'dp_ok'];
  check('anomalie : vérification incomplète', filtre({ anomalie: 'verification' }, quatre) === 'JIMMY2,MH3,VALIDE,VIEUX');
  check('chaque anomalie a un libellé', ANOMALIES.every(a => a.libelle.length > 3));
  check('valeurs distinctes sans doublon de casse', json(valeursDistinctes([{ s: 'MH' }, { s: 'mh' }, { s: 'Jimmy' }, { s: '' }], f => f.s)) === json(['Jimmy', 'MH']));
}

console.log('\n── Tri ──');
{
  const l = [{ id: 'a', v: 3 }, { id: 'b', v: null }, { id: 'c', v: 10 }, { id: 'd', v: 1 }, { id: 'e', v: '' }];
  const ids = (x: { id: string }[]) => x.map(y => y.id).join('');
  check('croissant, vides en bas', ids(trierLignes(l, x => x.v as any, 'asc')) === 'dacbe');
  check('décroissant, vides toujours en bas', ids(trierLignes(l, x => x.v as any, 'desc')) === 'cadbe');
  check('texte : 26MH2 avant 26MH10', ids(trierLignes([{ id: '1', v: '26MH10' }, { id: '2', v: '26MH2' }], x => x.v, 'asc')) === '21');
  check('stable à égalité', ids(trierLignes([{ id: 'x', v: 1 }, { id: 'y', v: 1 }, { id: 'z', v: 1 }], x => x.v, 'desc')) === 'xyz');
}

console.log('\n── Totaux ──');
{
  const t = totaliser(lignes);
  check('dossiers et articles', t.dossiers === 5 && t.articles === 5);
  check('CBM total', proche(t.cbm, 10 + 1 + 1 + 1 + 2));
  check('valeur déclarée cumulée', t.declaredValue === 15000);
  check('taux moyen pondéré (152 000 / 15 000)', proche(t.tauxMoyen, 152000 / 15000), `→ ${t.tauxMoyen}`);
  check('coût de vente : seulement les dossiers avec DP', proche(t.vente, L('MH1').vente) && proche(t.ecart, L('MH1').revient - L('MH1').vente));
  check('liste vide : zéros, pas de NaN', Object.values(totaliser([])).every(v => v === 0));
}

console.log('\n── Saisie des montants ──');
{
  const cas: [string, number | null][] = [
    ['12 500,50', 12500.5], ['12500.5', 12500.5], ['12.500,50', 12500.5], ['12,500.50', 12500.5],
    ['1 250 MAD', 1250], ['300$', 300], ['7', 7], ['0,5', 0.5], ['.5', 0.5], ['5.', 5],
    ['', 0], ['   ', 0], ['-5', null], ['abc', null], ['1.2.3', null], ['12a', null],
  ];
  for (const [saisie, attendu] of cas) {
    const lu = lireNombre(saisie);
    check(`« ${saisie} » → ${attendu}`, lu === attendu, `→ ${lu}`);
  }
}

console.log('\n── Dates ──');
{
  check('jour court', jourCourt('2026-11-18') === '18/11/26' && jourCourt('') === '' && jourCourt(undefined) === '');
  check('jours jusqu\'à', joursJusqua('2026-10-10', '2026-09-28') === 12 && joursJusqua('2026-09-25', '2026-09-28') === -3);
  check('jours jusqu\'à une date absente', joursJusqua('', '2026-09-28') === null);
}

console.log('\n── Modification d\'un dossier ──');
{
  check('Lebtex → IDRISTRANS', transitaireDeLaSociete('Lebtex') === 'IDRISTRANS');
  check('Robe in box et New fournitures → NOUH', transitaireDeLaSociete('Robe in box') === 'NOUH TRANSIT TRANSPORT' && transitaireDeLaSociete('New fournitures') === 'NOUH TRANSIT TRANSPORT');
  check('société inconnue → rien', transitaireDeLaSociete('Autre') === undefined);

  const avant = { arrivalDate: jour(-3), stockEntryDate: null };
  const arts = [{ id: 'x', clientName: 'Adil' }, { id: 'y', clientName: '  ' }, { id: 'z' }];
  check('statut client : arrivé → dédouanement', statutPourLesClients(avant) === 'CUSTOMS');
  check('entrée en stock → seuls les articles avec client sont prévenus',
    json(articlesAPrevenir(arts, avant, { ...avant, stockEntryDate: jour(0) }).map(a => a.id)) === json(['x']));
  check('date retouchée sans changer le statut → personne', articlesAPrevenir(arts, avant, { ...avant, arrivalDate: jour(-4) }).length === 0);
  check('entrée en stock prévue plus tard → personne aujourd\'hui', articlesAPrevenir(arts, avant, { ...avant, stockEntryDate: jour(5) }).length === 0);
  check('ETA repoussée dans le futur → retour en transit, prévenus',
    articlesAPrevenir(arts, avant, { ...avant, arrivalDate: jour(4) }).length === 1);
}

console.log(`\n${pass} réussi(s), ${fail} échec(s)\n`);
if (fail > 0) process.exit(1);
