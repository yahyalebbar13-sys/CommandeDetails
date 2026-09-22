/**
 * Le devoir de formation, écrit avec les VRAIS noms des produits chargés.
 *
 * Une feuille qui dit « référence n°1, référence n°2 » n'apprend rien : la recrue passe son temps
 * à faire la correspondance au lieu de travailler. Ce fichier prend les lignes réellement chargées
 * par le stock de formation et produit deux documents imprimables : le devoir pour la recrue, le
 * corrigé pour le patron — avec les bons noms, les bonnes variantes et les bonnes quantités.
 *
 * Les montants d'argent, eux, ne dépendent d'aucun produit : les prix de vente sont imposés par
 * l'exercice, donc le chiffre d'affaires et les soldes clients sont les mêmes pour tout le monde.
 */

import type { LigneChargement } from './stock-formation';

/** Une chose sur laquelle on fait travailler la recrue : un produit, ou une variante précise. */
export type Cible = {
  rang: number;
  nom: string;
  /** Libellé de la variante (couleur, qualité, taille) quand le produit est ventilé. */
  variante: string | null;
  /** Quantité de départ de cette cible : celle du produit, ou celle de sa variante. */
  quantite: number;
  lieu: 'MAGASIN' | 'ENTREPOT';
};

export type CiblesDevoir = {
  /** Cinq produits de la boutique, servis selon ce que leur rôle consomme dans le devoir. */
  a: Cible; b: Cible; c: Cible; d: Cible; e: Cible;
  /** Deux variantes précises, pour apprendre qu'une couleur a son propre stock. */
  v: Cible | null; w: Cible | null;
  /** Un produit de la réserve, pour le transfert entrepôt → magasin. */
  r: Cible | null;
};

function cibleDeLaLigne(l: LigneChargement): Cible {
  const premiere = l.variantes[0];
  const ventile = Boolean(premiere?.label);
  return {
    rang: l.rang,
    nom: l.nom,
    variante: ventile ? premiere.label : null,
    quantite: ventile ? premiere.quantite : l.quantite,
    lieu: l.lieu,
  };
}

/**
 * Répartit les rôles du devoir sur les produits réellement chargés.
 *
 * Les cinq rôles « produit entier » vont aux références sans ventilation les plus fournies — les
 * exercices leur demandent jusqu'à 200 unités, il faut de la marge. S'il n'y en a pas cinq, on
 * complète avec des variantes : la recrue travaille alors sur « ce produit, couleur rouge », ce
 * qui reste juste. Les deux rôles « variante » vont aux ventilations les plus fournies restantes.
 */
export function choisirCibles(lignes: LigneChargement[]): CiblesDevoir | null {
  const boutique = lignes.filter(l => l.lieu === 'MAGASIN').map(cibleDeLaLigne);
  if (boutique.length < 5) return null;

  const parQuantite = (x: Cible, y: Cible) => y.quantite - x.quantite || x.rang - y.rang;
  const simples = boutique.filter(c => !c.variante).sort(parQuantite);
  const ventiles = boutique.filter(c => c.variante).sort(parQuantite);

  const principaux: Cible[] = [];
  while (principaux.length < 5 && simples.length > 0) principaux.push(simples.shift()!);
  while (principaux.length < 5 && ventiles.length > 0) principaux.push(ventiles.shift()!);
  if (principaux.length < 5) return null;

  const reserve = lignes.filter(l => l.lieu === 'ENTREPOT').map(cibleDeLaLigne).sort(parQuantite);

  // Les rôles sont servis dans l'ordre de ce qu'ils CONSOMMENT, pas dans l'ordre alphabétique :
  // le rôle « a » sort 200 unités au total et le rôle « e » aussi, tandis que « d » n'en sort que
  // 60. Servir a, b, c, d, e dans cet ordre donnait au rôle « e » la cinquième quantité — et le
  // stock passait négatif au milieu du devoir.
  const [pourA, pourE, pourC, pourB, pourD] = principaux;
  return {
    a: pourA, b: pourB, c: pourC, d: pourD, e: pourE,
    v: ventiles[0] || null,
    w: ventiles[1] || null,
    r: reserve[0] || null,
  };
}

/** Comment on désigne une cible dans le texte du devoir. */
export function libelleCible(c: Cible | null): string {
  if (!c) return '—';
  return c.variante ? `${c.nom} — ${c.variante}` : c.nom;
}

export type Resultats = {
  a: number; b: number; c: number; d: number; e: number;
  v: number | null; w: number | null;
  rReserve: number | null; rBoutique: number | null;
  chiffreAffaires: number; encaisse: number; creances: number;
  soldeNoor: number; soldeZahra: number;
};

/**
 * Ce que le stock et les comptes doivent valoir à la fin du devoir. Les opérations sont fixes,
 * seules les quantités de départ changent d'un catalogue à l'autre.
 */
export function calculerResultats(cibles: CiblesDevoir): Resultats {
  return {
    // + 120 rachat · − 50 vente 1 · − 100 vente 3 · − 50 transfert vers l'autre magasin
    a: cibles.a.quantite + 120 - 50 - 100 - 50,
    // − 15 perte · − 100 vente 2 · − 5 écart d'inventaire
    b: cibles.b.quantite - 15 - 100 - 5,
    // − 150 vente 3
    c: cibles.c.quantite - 150,
    // − 20 vente 2 · − 40 vente 4
    d: cibles.d.quantite - 20 - 40,
    // − 200 vente 2 · + 10 retour client
    e: cibles.e.quantite - 200 + 10,
    // − 10 perte sur la variante · − 20 vente 5
    v: cibles.v ? cibles.v.quantite - 10 - 20 : null,
    // − 20 transfert · + 12 écart d'inventaire
    w: cibles.w ? cibles.w.quantite - 20 + 12 : null,
    rReserve: cibles.r ? cibles.r.quantite - 100 : null,
    rBoutique: cibles.r ? 100 : null,
    chiffreAffaires: 3011,
    encaisse: 2281,
    creances: 730,
    soldeNoor: 440,
    soldeZahra: 290,
  };
}

export type Lieux = { boutique: string; autreMagasin: string; reserve: string };

const echapper = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

const nb = (n: number) => n.toLocaleString('fr-MA');
const mad = (n: number) => `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`;

const STYLE = `
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #1c1917; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 1mm; letter-spacing: -.01em; }
  h2 { font-size: 12pt; margin: 7mm 0 2mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #1c1917;
       break-after: avoid; page-break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1mm; }
  p, li { margin: 0 0 1.8mm; }
  .chapeau { color: #57534e; font-size: 9.5pt; margin-bottom: 4mm; }
  .encadre { border: 1px solid #d6d3d1; background: #fafaf9; border-radius: 3mm;
             padding: 3mm 3.5mm; margin: 2.5mm 0; font-size: 9.5pt; break-inside: avoid; }
  .encadre b { display: block; margin-bottom: .8mm; }
  table { width: 100%; border-collapse: collapse; margin: 2.5mm 0; font-size: 9.5pt;
          break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; border-bottom: 1.5px solid #1c1917; padding: 1.5mm 2mm;
       font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #57534e; }
  td { border-bottom: 1px solid #e7e5e4; padding: 1.8mm 2mm; vertical-align: top; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .prod { font-weight: 700; }
  .var { color: #7c3aed; font-weight: 700; }
  .rep { color: #a8a29e; letter-spacing: .06em; }
  .q { margin: 1.5mm 0 2.5mm; }
  .note { font-size: 9pt; color: #57534e; }
  ul { margin: 0 0 2mm; padding-left: 5mm; }
  .sig { margin-top: 6mm; font-size: 9pt; color: #78716c; }
  @media print { .rep { color: #d6d3d1; } }
`;

/** Une ligne « question → pointillés » où écrire la réponse. */
const q = (texte: string, taille = 28) =>
  `<p class="q">${texte}<br><span class="rep">${'.'.repeat(taille)}</span></p>`;

const prod = (c: Cible | null) =>
  c ? (c.variante
      ? `<span class="prod">${echapper(c.nom)}</span> — <span class="var">${echapper(c.variante)}</span>`
      : `<span class="prod">${echapper(c.nom)}</span>`)
    : '—';

/** Le devoir, prêt à imprimer. Aucun en-tête à remplir : c'est une feuille de travail, pas un examen. */
export function devoirHtml(lignes: LigneChargement[], cibles: CiblesDevoir, lieux: Lieux): string {
  const boutique = lignes.filter(l => l.lieu === 'MAGASIN');
  const reserve = lignes.filter(l => l.lieu === 'ENTREPOT');
  const ligneTableau = (l: LigneChargement) => `
    <tr>
      <td class="prod">${echapper(l.nom)}</td>
      <td>${echapper(l.categorie)}</td>
      <td class="n">${nb(l.quantite)}</td>
      <td>${l.variantes[0]?.label
        ? l.variantes.map(v => `<span class="var">${echapper(v.label)}</span> ${nb(v.quantite)}`).join(' · ')
        : '<span class="note">une seule ligne</span>'}</td>
    </tr>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Devoir de formation — ${echapper(lieux.boutique)}</title><style>${STYLE}</style></head><body>

<h1>Devoir de formation — logiciel de stock</h1>
<p class="chapeau">Un stock d'entraînement a été chargé sur de vrais produits. Rien n'est de la
vraie marchandise : tout sera effacé à la fin. Tu ne peux rien casser — mais tu travailles comme
si c'était vrai, parce que c'est exactement ce que tu feras la semaine prochaine.</p>

<div class="encadre">
  <b>Deux règles</b>
  Tu ne touches jamais à l'écran /gestion, sauf là où le devoir te le dit.<br>
  Si un écran refuse une opération, tu ne forces pas : tu notes le message dans la marge et tu
  passes à la suite. Savoir lire un refus fait partie du métier.
</div>

<h2>Ton stock de départ</h2>
<p class="note">Un produit <b>simple</b> n'a qu'une ligne de stock. Un produit <b>ventilé</b>
existe en plusieurs couleurs, qualités ou tailles, et <b>chaque variante a son propre stock</b> :
vendre du bleu ne touche pas au rouge. C'est ce qui cause le plus d'erreurs en magasin.</p>

<h3>En boutique (${echapper(lieux.boutique)})</h3>
<table><thead><tr><th>Produit</th><th>Famille</th><th class="n">Quantité</th><th>Détail</th></tr></thead>
<tbody>${boutique.map(ligneTableau).join('')}</tbody></table>

<h3>En réserve (${echapper(lieux.reserve)})</h3>
<table><thead><tr><th>Produit</th><th>Famille</th><th class="n">Quantité</th><th>Détail</th></tr></thead>
<tbody>${reserve.map(ligneTableau).join('')}</tbody></table>

<h2>1. Lire un stock</h2>
<p class="note">Écran <b>Stock</b>.</p>
${q(`Quelle quantité pour ${prod(cibles.a)} ?`, 14)}
${cibles.v ? q(`Cherche <span class="prod">${echapper(cibles.v.nom)}</span>. Combien de lignes apparaissent pour ce produit, et pourquoi ?`, 60) : ''}
${cibles.v ? q(`Pour ce même produit : quelle variante a le plus de stock, et combien ?`, 40) : ''}
${cibles.r ? q(`Cherche ${prod(cibles.r)}. Quelle quantité, et à quel endroit se trouve-t-elle ?`, 40) : ''}
${q(`Va dans <b>Mouvements</b> et retrouve l'entrée de ${prod(cibles.a)}. Quelle raison, et que dit la note ?`, 60)}
<div class="encadre"><b>À retenir</b>
L'écran <b>Stock</b> montre où on en est. L'écran <b>Mouvements</b> montre comment on y est arrivé.
Quand un chiffre semble faux, la réponse est toujours dans les mouvements.</div>

<h2>2. Détecter un besoin et le transmettre à l'import</h2>
<p>Un client demande un produit qu'on n'a pas, ou tu vois un rayon qui se vide : c'est un
<b>besoin</b>. Tu ne commandes rien toi-même — l'import décide, négocie et achète. Ton travail
est de <b>détecter le besoin, l'écrire proprement, et le transmettre</b>.</p>
<div class="encadre">
  <b>Le processus, dans l'ordre</b>
  1. <b>Détecter</b> le besoin : rupture, demande client répétée, saison qui arrive.<br>
  2. <b>L'écrire</b> dans le logiciel : produit, quantité, couleur ou qualité voulue, et
     <b>pourquoi</b> tu le demandes. Un besoin sans justification ne sera pas traité.<br>
  3. <b>L'imprimer en PDF</b> — c'est la trace écrite, datée, de ce que le magasin a demandé.<br>
  4. <b>Le donner au commercial</b> pour qu'il confirme : bonne référence, bonne quantité, bon
     moment. C'est lui qui connaît la demande du marché.<br>
  5. Le <b>service import</b> reçoit le besoin validé, le transforme en commande, suit le transit
     et l'arrivage. La marchandise revient des mois plus tard.
</div>
<p class="note">Écran <b>Demandes d'import</b> → <b>Nouvelle demande</b>. Commence le nom par
<b>FORMATION —</b> pour qu'on puisse l'effacer ensuite. Quantité : 500. Écris une vraie
justification, comme si tu la défendais devant le commercial.</p>
${q(`Quel est le statut de ta demande juste après l'envoi ?`, 24)}
${q(`Cette demande fait-elle bouger le stock ? Pourquoi ?`, 50)}
${q(`Combien d'étapes séparent ta demande de la marchandise en rayon ? Cite-les dans l'ordre.`, 60)}
${q(`Imprime ta demande et fais-la relire. Qu'est-ce que le commercial a corrigé ou confirmé ?`, 55)}

<h2>3. Transférer de la marchandise</h2>
<p>Un transfert déplace de la marchandise <b>d'un lieu à un autre</b> : d'un magasin vers un autre
magasin, ou de l'entrepôt vers un magasin. Il écrit toujours <b>deux</b> mouvements : une sortie
au départ, une entrée à l'arrivée. La marchandise part physiquement avec le bon imprimé.</p>
<p class="note"><b>À faire avec ton responsable</b> : seul un compte administrateur peut valider un
transfert. Tu regardes, tu notes, tu poses des questions.</p>

<h3>a. De ${echapper(lieux.boutique)} vers ${echapper(lieux.autreMagasin)}</h3>
<table><thead><tr><th>Produit</th><th class="n">Quantité</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)}</td><td class="n">50</td></tr>
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td class="n">20</td></tr>` : ''}
</tbody></table>
${cibles.w ? q(`Le transfert de la variante a-t-il touché les autres couleurs du même produit ? Pourquoi ?`, 50) : ''}

<h3>b. De la réserve vers ${echapper(lieux.boutique)}</h3>
${cibles.r ? `<table><thead><tr><th>Produit</th><th class="n">Quantité</th></tr></thead><tbody>
<tr><td>${prod(cibles.r)}</td><td class="n">100</td></tr></tbody></table>` : '<p class="note">Rien en réserve à transférer.</p>'}
${q(`Vérifie dans <b>Mouvements</b> : combien de lignes ce transfert a-t-il écrites, et lesquelles ?`, 55)}

<h2>4. Corriger le stock à la main</h2>
<p class="note">Écran <b>Mouvements</b> → <b>Nouveau mouvement</b>.</p>
<p><b>a.</b> Le patron rachète <b>120</b> unités de ${prod(cibles.a)} au marché et te les apporte
en boutique. Fais-les entrer, avec une note claire.</p>
<p><b>b.</b> <b>15</b> unités de ${prod(cibles.b)} ont été abîmées par une infiltration. Sors-les,
motif <b>Perte</b>, avec une note qui explique.</p>
${cibles.v ? `<p><b>c.</b> <b>10</b> unités de ${prod(cibles.v)} sont tombées dans l'huile. Sors-les.</p>` : ''}
${cibles.v ? q(`Les autres variantes de ce produit ont-elles changé ?`, 20) : ''}
${q(`Pourquoi faut-il toujours écrire une note sur un mouvement ?`, 55)}

<h2>5. Les clients et la caisse</h2>
<p><b>Crée deux clients</b> : <b>ATELIER NOOR (formation)</b>, plafond de crédit 5 000 —
<b>COUTURE ZAHRA (formation)</b>, plafond 1 000.</p>

<h3>Vente 1 — comptoir, sans client, espèces</h3>
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead>
<tbody><tr><td>${prod(cibles.a)}</td><td class="n">50</td><td class="n">6,00</td></tr></tbody></table>
${q(`Total encaissé ?`, 16)}

<h3>Vente 2 — ATELIER NOOR, remise de 5 %</h3>
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead><tbody>
<tr><td>${prod(cibles.e)}</td><td class="n">200</td><td class="n">0,90</td></tr>
<tr><td>${prod(cibles.b)}</td><td class="n">100</td><td class="n">14,00</td></tr>
<tr><td>${prod(cibles.d)}</td><td class="n">20</td><td class="n">20,00</td></tr>
</tbody></table>
<p>Règlement en deux fois : <b>881,00 en espèces</b> + <b>1 000,00 par chèque</b> n° FORM-001,
échéance dans 60 jours.</p>
${q(`Total après remise ? Reste dû ? Statut de la facture ?`, 40)}
${q(`Le client a tout payé et la facture n'est pas « payée ». Pourquoi ? <span class="note">(la question la plus importante du devoir)</span>`, 60)}

<h3>Vente 3 — COUTURE ZAHRA, entièrement à crédit</h3>
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)}</td><td class="n">100</td><td class="n">2,00</td></tr>
<tr><td>${prod(cibles.c)}</td><td class="n">150</td><td class="n">0,60</td></tr>
</tbody></table>
${q(`Total ? Statut ?`, 30)}

<h3>Vente 4 — ATELIER NOOR, réglée par chèque</h3>
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead>
<tbody><tr><td>${prod(cibles.d)}</td><td class="n">40</td><td class="n">11,00</td></tr></tbody></table>
<p>Chèque de <b>440,00</b> n° FORM-002, <b>échéance = il y a 10 jours</b> (une date déjà passée :
on en aura besoin plus loin).</p>

${cibles.v ? `<h3>Vente 5 — une variante précise, comptoir, espèces</h3>
<table><thead><tr><th>Produit</th><th class="n">Qté</th><th class="n">Prix de vente</th></tr></thead>
<tbody><tr><td>${prod(cibles.v)}</td><td class="n">20</td><td class="n">5,00</td></tr></tbody></table>
${q(`Quelles lignes de ce produit ont bougé dans l'écran Stock ?`, 50)}` : ''}

${cibles.r ? q(`Essaie de vendre 10 unités de ${prod(cibles.r)}. Que se passe-t-il ? Pourquoi ?`, 55) : ''}

<h2>6. Un retour client</h2>
<p>Un client rapporte de la marchandise : elle <b>revient en stock</b> et il faut lui rendre sa
valeur. C'est le seul mouvement qui fait entrer de la marchandise sans achat.</p>
<p class="note">Écran <b>Factures</b> → la facture de la vente 2 → <b>Retour</b>. ATELIER NOOR
rapporte <b>10</b> unités de ${prod(cibles.e)}.</p>
${q(`Quelle quantité ce produit affiche-t-il après le retour ?`, 20)}
${q(`Quel type de mouvement le retour a-t-il créé, et dans quel lieu ?`, 45)}
${q(`Le montant rendu au client te paraît-il juste par rapport au prix de vente ? Note ce que tu observes, même si ça te semble bizarre.`, 55)}

<h2>7. L'argent : chèques, banque, impayé</h2>
<p class="note">Écran <b>Trésorerie</b>.</p>
<p><b>a.</b> Affecte le chèque FORM-001 (1 000,00) à la société LEBTEX.
<b>b.</b> Émets un bordereau de remise contenant ce chèque.
<b>c.</b> La banque a crédité : marque FORM-001 comme encaissé.</p>
${q(`Référence du bordereau ?`, 30)}
${q(`Statut de la facture de la vente 2 maintenant ?`, 30)}
<p><b>d.</b> Le chèque FORM-002 revient <b>impayé</b>. Déclare-le.</p>
${q(`Que deviennent la facture de la vente 4 et le solde d'ATELIER NOOR ?`, 45)}
${q(`En une phrase : quelle différence entre <b>vendre</b> et <b>encaisser</b> ?`, 55)}

<h2>8. L'inventaire physique</h2>
<p>L'inventaire aveugle, c'est compter <b>sans regarder</b> ce que dit l'ordinateur. L'écart
n'apparaît qu'après ta saisie : si tu vois le chiffre avant, tu ne comptes plus, tu recopies.</p>
<p class="note">Écran <b>Inventaire</b>. Vérifie que ${echapper(lieux.boutique)} est bien
sélectionné en haut.</p>
<table><thead><tr><th>Produit</th><th>Ce que tu comptes en rayon</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)}</td><td>exactement ce que l'écran affiche</td></tr>
<tr><td>${prod(cibles.b)}</td><td>ce que l'écran affiche <b>moins 5</b></td></tr>
${cibles.w ? `<tr><td>${prod(cibles.w)}</td><td>ce que l'écran affiche <b>plus 12</b></td></tr>` : ''}
</tbody></table>
${q(`Quels écarts le logiciel affiche-t-il ?`, 40)}
${q(`Pour le dernier, l'écart est positif : plus en rayon que dans l'ordinateur. Cite deux causes possibles.`, 55)}
${q(`Valide la session, puis regarde dans <b>Mouvements</b> : combien de lignes ta validation a-t-elle écrites, et de quel type ?`, 55)}

<h2>9. Contrôle final</h2>
<p class="note">À remplir sans rien modifier. Tout se lit dans <b>Stock</b>, <b>Clients</b> et le
<b>Tableau de bord</b>.</p>
<table><thead><tr><th>Question</th><th class="n">Réponse</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.b)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.c)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.d)} en boutique</td><td class="n rep">............</td></tr>
<tr><td>${prod(cibles.e)} en boutique</td><td class="n rep">............</td></tr>
${cibles.r ? `<tr><td>${prod(cibles.r)} en boutique</td><td class="n rep">............</td></tr>` : ''}
<tr><td>Chiffre d'affaires de toutes les ventes</td><td class="n rep">............</td></tr>
<tr><td>Argent réellement encaissé</td><td class="n rep">............</td></tr>
<tr><td>Solde dû par ATELIER NOOR</td><td class="n rep">............</td></tr>
<tr><td>Solde dû par COUTURE ZAHRA</td><td class="n rep">............</td></tr>
</tbody></table>
${q(`Entre le chiffre d'affaires et l'argent encaissé il y a un écart. Où est passé cet argent ?`, 60)}
${q(`Cite tous les types de mouvements que tu as créés pendant ce devoir, et pour chacun ce qu'il fait au stock : entrée, sortie, ou les deux.`, 60)}

<h2>Ce qu'on attend de toi</h2>
<ul>
<li><b>La rigueur avant la vitesse.</b> Une quantité fausse saisie en trois secondes coûte une journée à retrouver.</li>
<li><b>Une variante n'est pas le produit.</b> Vendre du bleu ne touche jamais au rouge.</li>
<li><b>Un mouvement porte toujours un motif lisible.</b> C'est la seule trace qui l'explique six mois après.</li>
<li><b>Un chèque n'est pas de l'argent</b> tant que la banque ne l'a pas crédité.</li>
<li><b>La marchandise a un lieu.</b> Un produit en réserve n'est pas vendable en boutique.</li>
<li><b>On ne force jamais un écran qui refuse.</b> On note, et on demande.</li>
</ul>
</body></html>`;
}

/** Le corrigé, avec les réponses calculées sur les produits réellement chargés. */
export function corrigeHtml(lignes: LigneChargement[], cibles: CiblesDevoir, lieux: Lieux): string {
  const r = calculerResultats(cibles);
  const depart = (c: Cible | null) => (c ? nb(c.quantite) : '—');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Corrigé — devoir de formation</title><style>${STYLE}</style></head><body>

<h1>Corrigé du devoir de formation</h1>
<p class="chapeau">À garder. Ne pas donner avant la correction.</p>

<div class="encadre"><b>Avant de nettoyer</b>
Le bouton « Reset Stock (0) » n'efface pas que le devoir : il supprime tout le fichier clients de
l'écran Stock, tous les mouvements, ventes, factures et paiements, toutes les dépenses et remises,
tous les transferts et tout le journal d'audit. Les arrivages gardent leur statut mais perdent
leurs mouvements : ceux déjà réconciliés repasseront « à compléter ».<br>
Si une réconciliation d'arrivages est en cours, ne reset pas : supprime à la main les mouvements
notés « STOCK DE FORMATION », les deux clients « (formation) » et les factures du devoir.<br>
La <b>demande d'import</b> de la partie 2 vit dans /gestion → Besoins : elle commence par
« FORMATION — », à supprimer là-bas.</div>

<h2>Les produits du devoir</h2>
<table><thead><tr><th>Rôle</th><th>Produit</th><th class="n">Départ</th><th class="n">Attendu à la fin</th></tr></thead><tbody>
<tr><td>Produit principal</td><td>${prod(cibles.a)}</td><td class="n">${depart(cibles.a)}</td><td class="n"><b>${nb(r.a)}</b></td></tr>
<tr><td>Perte + vente + inventaire</td><td>${prod(cibles.b)}</td><td class="n">${depart(cibles.b)}</td><td class="n"><b>${nb(r.b)}</b></td></tr>
<tr><td>Vente à crédit</td><td>${prod(cibles.c)}</td><td class="n">${depart(cibles.c)}</td><td class="n"><b>${nb(r.c)}</b></td></tr>
<tr><td>Deux ventes</td><td>${prod(cibles.d)}</td><td class="n">${depart(cibles.d)}</td><td class="n"><b>${nb(r.d)}</b></td></tr>
<tr><td>Vente + retour client</td><td>${prod(cibles.e)}</td><td class="n">${depart(cibles.e)}</td><td class="n"><b>${nb(r.e)}</b></td></tr>
${cibles.v ? `<tr><td>Variante : perte + vente</td><td>${prod(cibles.v)}</td><td class="n">${depart(cibles.v)}</td><td class="n"><b>${nb(r.v!)}</b></td></tr>` : ''}
${cibles.w ? `<tr><td>Variante : transfert + inventaire</td><td>${prod(cibles.w)}</td><td class="n">${depart(cibles.w)}</td><td class="n"><b>${nb(r.w!)}</b></td></tr>` : ''}
${cibles.r ? `<tr><td>Réserve → boutique</td><td>${prod(cibles.r)}</td><td class="n">${depart(cibles.r)}</td><td class="n"><b>${nb(r.rReserve!)}</b> en réserve · <b>${nb(r.rBoutique!)}</b> en boutique</td></tr>` : ''}
</tbody></table>

<h2>Les réponses</h2>

<h3>1. Lire un stock</h3>
<ul>
<li>Quantité de départ de ${prod(cibles.a)} : <b>${depart(cibles.a)}</b>.</li>
${cibles.v ? `<li>${echapper(cibles.v.nom)} affiche <b>plusieurs lignes</b>, une par variante : chacune a son propre stock. La plus fournie est <b>${echapper(cibles.v.variante || '')}</b> avec <b>${depart(cibles.v)}</b>.</li>` : ''}
${cibles.r ? `<li>${prod(cibles.r)} : <b>${depart(cibles.r)}</b>, en <b>réserve</b> — pas en boutique.</li>` : ''}
<li>Le mouvement d'origine porte la raison <b>Inventaire</b> et la note <b>« STOCK DE FORMATION »</b>.</li>
<li>Stock = où on en est ; Mouvements = comment on y est arrivé.</li>
</ul>

<h3>2. Le besoin transmis à l'import</h3>
<ul>
<li>Statut après envoi : <b>Envoyée</b>.</li>
<li><b>Le stock ne bouge pas</b> : une demande n'est qu'un besoin transmis. Rien n'est acheté, rien n'est reçu.</li>
<li>Étapes attendues : détecter → écrire → imprimer → faire valider par le commercial → l'import
commande → transit → arrivage → entrée en stock → transfert en boutique. Trois étapes dans le bon
ordre suffisent pour le point.</li>
<li>La dernière question n'a pas de bonne réponse écrite : elle vérifie qu'il est allé voir le
commercial. C'est le réflexe qu'on veut installer.</li>
</ul>

<h3>3. Transferts</h3>
<ul>
<li>Un transfert écrit <b>deux</b> mouvements : une sortie au départ, une entrée à l'arrivée.</li>
${cibles.w ? `<li>Les autres variantes n'ont pas bougé : un transfert porte sur une variante précise.</li>` : ''}
${cibles.r ? `<li>Après le transfert : <b>${nb(r.rReserve!)}</b> en réserve, <b>${nb(r.rBoutique!)}</b> en boutique.</li>` : ''}
</ul>

<h3>4. Mouvements manuels</h3>
<ul>
<li>L'entrée de 120 doit être imputée à <b>${echapper(lieux.boutique)}</b>, pas à la réserve.</li>
<li>La perte de 15 doit porter le motif <b>Perte</b> et une note explicite.</li>
${cibles.v ? `<li>Les autres variantes sont inchangées après la perte sur une seule couleur.</li>` : ''}
<li>La note est la seule trace qui explique le mouvement des mois plus tard.</li>
</ul>

<h3>5. Ventes</h3>
<ul>
<li>Vente 1 : <b>${mad(300)}</b>.</li>
<li>Vente 2 : sous-total <b>${mad(1980)}</b> − 5 % = <b>${mad(1881)}</b> · reste dû <b>0,00</b> ·
statut <b>En attente</b>.</li>
<li><b>La question clé</b> : le client a bien remis 1 881 MAD, mais 1 000 sont un chèque à
60 jours. Tant que la banque n'a pas crédité, cet argent n'est pas encaissé : la facture est
« en attente », pas « payée ». Elle passera en « payée » à l'encaissement.
<span class="note">Donner 0 à « c'est un bug ».</span></li>
<li>Vente 3 : <b>${mad(290)}</b>, statut <b>Impayée</b>. Vente 4 : <b>${mad(440)}</b> par chèque.</li>
${cibles.v ? `<li>Vente 5 : <b>${mad(100)}</b>. <b>Seule</b> la ligne ${echapper(cibles.v.variante || '')} a baissé, de 20.</li>` : ''}
${cibles.r ? `<li>La vente d'un produit en réserve est impossible depuis la boutique : le lieu de vente ne propose que des endroits qui ont la marchandise.</li>` : ''}
</ul>

<h3>6. Retour client</h3>
<ul>
<li>${prod(cibles.e)} après retour : <b>${nb(r.e)}</b>.</li>
<li>Le retour crée une <b>entrée</b>, motif <b>Retour</b>, dans la boutique.</li>
<li>Montant attendu par le calcul : <b>${mad(9)}</b> (10 × 0,90). <b>Le logiciel peut afficher
autre chose</b> : c'est un défaut connu, correction prévue. <b>Donne le point à celui qui le
remarque</b> — c'est exactement le réflexe recherché.</li>
</ul>

<h3>7. L'argent</h3>
<ul>
<li>Bordereau de la forme <b>BRC-LEB-&lt;date&gt;-001</b>.</li>
<li>Après encaissement, la facture de la vente 2 passe à <b>Payée</b>.</li>
<li>Après l'impayé, la facture de la vente 4 redevient <b>Impayée</b> et le solde d'ATELIER NOOR
remonte à <b>${mad(r.soldeNoor)}</b>.</li>
<li>Vendre sort la marchandise ; encaisser fait entrer l'argent. Les deux peuvent être séparés de
plusieurs mois, ou ne jamais se rejoindre.</li>
<li class="note">Si le logiciel refuse l'impayé, c'est que l'échéance n'est pas assez ancienne :
il faut au moins deux jours après la date d'échéance. Sécurité voulue, pas une panne.</li>
</ul>

<h3>8. Inventaire</h3>
<ul>
<li>Écarts : <b>0</b> pour ${prod(cibles.a)}, <b>−5</b> pour ${prod(cibles.b)}${cibles.w ? `, <b>+12</b> pour ${prod(cibles.w)}` : ''}.</li>
<li>Causes possibles d'un écart positif : vente encaissée sans être saisie, entrée saisie deux
fois, retour jamais enregistré, erreur de comptage précédente, marchandise rangée à deux endroits.</li>
<li>La validation écrit <b>${cibles.w ? 'deux' : 'une'}</b> ligne(s) d'ajustement : un écart nul
n'écrit rien. <span class="note">Peu le remarquent.</span></li>
</ul>

<h3>9. Contrôle final</h3>
<table><thead><tr><th>Question</th><th class="n">Réponse</th></tr></thead><tbody>
<tr><td>${prod(cibles.a)} en boutique</td><td class="n"><b>${nb(r.a)}</b></td></tr>
<tr><td>${prod(cibles.b)} en boutique</td><td class="n"><b>${nb(r.b)}</b></td></tr>
<tr><td>${prod(cibles.c)} en boutique</td><td class="n"><b>${nb(r.c)}</b></td></tr>
<tr><td>${prod(cibles.d)} en boutique</td><td class="n"><b>${nb(r.d)}</b></td></tr>
<tr><td>${prod(cibles.e)} en boutique</td><td class="n"><b>${nb(r.e)}</b></td></tr>
${cibles.r ? `<tr><td>${prod(cibles.r)} en boutique</td><td class="n"><b>${nb(r.rBoutique!)}</b></td></tr>` : ''}
<tr><td>Chiffre d'affaires</td><td class="n"><b>${mad(r.chiffreAffaires)}</b></td></tr>
<tr><td>Argent réellement encaissé</td><td class="n"><b>${mad(r.encaisse)}</b></td></tr>
<tr><td>Solde ATELIER NOOR</td><td class="n"><b>${mad(r.soldeNoor)}</b></td></tr>
<tr><td>Solde COUTURE ZAHRA</td><td class="n"><b>${mad(r.soldeZahra)}</b></td></tr>
</tbody></table>
<p><b>L'écart de ${mad(r.creances)}</b> = ${mad(r.soldeZahra)} jamais réglés (vente à crédit) +
${mad(r.soldeNoor)} d'un chèque revenu impayé. Vendre n'est pas encaisser.</p>

<h3>Les types de mouvements</h3>
<table><thead><tr><th>Mouvement</th><th>Effet sur le stock</th></tr></thead><tbody>
<tr><td>Entrée (achat, correction)</td><td>entrée</td></tr>
<tr><td>Vente</td><td>sortie</td></tr>
<tr><td>Perte</td><td>sortie</td></tr>
<tr><td>Transfert</td><td><b>les deux</b> : sortie d'un lieu, entrée dans l'autre</td></tr>
<tr><td>Retour client</td><td>entrée</td></tr>
<tr><td>Ajustement d'inventaire</td><td>entrée ou sortie, selon le signe de l'écart</td></tr>
<tr><td>Demande d'import</td><td><b>aucun</b> — ce n'est pas un mouvement</td></tr>
</tbody></table>

<h2>Comment lire le résultat</h2>
<p>Les quatre réponses qui comptent vraiment, quel que soit le reste : <b>une variante a son
propre stock</b> · <b>un chèque n'est pas de l'argent</b> · <b>la marchandise a un lieu</b> ·
<b>vendre n'est pas encaisser</b>. Qui a ces quatre-là comprendra le reste tout seul.</p>
<p class="sig">Généré depuis le stock de formation — ${echapper(lieux.boutique)}.</p>
</body></html>`;
}
