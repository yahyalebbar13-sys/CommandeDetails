/**
 * Le devoir de formation et son corrigé, en vrai PDF téléchargé.
 *
 * Avant, les deux documents ne sortaient que par la fenêtre d'impression du navigateur : il
 * fallait passer par « Enregistrer au format PDF », les pop-ups bloqués empêchaient tout, et le
 * fichier n'avait ni nom ni bandeau LEBTEX. Un document qu'on envoie à une recrue doit être un
 * fichier, pas une manipulation.
 *
 * Le contenu n'est pas réécrit ici : ce module rend le HTML déjà produit par
 * src/lib/devoir-formation.ts. Une seule source pour le texte, deux sorties — sinon le devoir
 * imprimé et le devoir exporté finissent par ne plus dire la même chose.
 *
 * Le HTML accepté est celui que ce fichier-là génère, et lui seul : h1/h2/h3, p (chapeau, note,
 * question), div.encadre, table, ul, et en ligne b, br, span (prod, var, note, rep).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Couleurs communes aux documents LEBTEX ──
const NOIR: [number, number, number] = [28, 25, 23];          // stone-900
const GRIS: [number, number, number] = [87, 83, 78];          // stone-600
const GRIS_CLAIR: [number, number, number] = [168, 162, 158]; // stone-400
const TRAIT: [number, number, number] = [214, 211, 209];      // stone-300
const FOND: [number, number, number] = [250, 250, 249];       // stone-50
const VIOLET: [number, number, number] = [124, 58, 237];      // violet-600

const MARGE = 14;
const HAUT = 20;
const BAS = 280;

type Style = { gras?: boolean; couleur?: [number, number, number]; taille?: number };
type Fragment = { texte: string; style: Style; saut?: boolean };

const ENTITES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'",
};

const decoder = (s: string) => s.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, m => ENTITES[m] ?? m);

/**
 * Un morceau de HTML en ligne → une suite de fragments stylés. Les balises non reconnues sont
 * retirées plutôt qu'affichées : mieux vaut une ligne sans gras qu'une ligne pleine de chevrons.
 */
function fragments(html: string, base: Style = {}): Fragment[] {
  const sortie: Fragment[] = [];
  const pile: Style[] = [base];
  const jeton = /<\/?(b|strong|span|br)\b([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;

  while ((m = jeton.exec(html)) !== null) {
    const [tout, balise, attributs, texte] = m;
    if (texte !== undefined) {
      const propre = decoder(texte).replace(/\s+/g, ' ');
      if (propre.trim() || propre === ' ') sortie.push({ texte: propre, style: pile[pile.length - 1] });
      continue;
    }
    const nom = (balise || '').toLowerCase();
    if (nom === 'br') { sortie.push({ texte: '', style: pile[pile.length - 1], saut: true }); continue; }
    if (tout.startsWith('</')) { if (pile.length > 1) pile.pop(); continue; }

    const courant = pile[pile.length - 1];
    if (nom === 'b' || nom === 'strong') {
      pile.push({ ...courant, gras: true });
    } else {
      const classe = /class="([^"]*)"/.exec(attributs || '')?.[1] || '';
      if (classe.includes('var')) pile.push({ ...courant, gras: true, couleur: VIOLET });
      else if (classe.includes('prod')) pile.push({ ...courant, gras: true, couleur: NOIR });
      else if (classe.includes('note')) pile.push({ ...courant, couleur: GRIS });
      else if (classe.includes('rep')) pile.push({ ...courant, couleur: GRIS_CLAIR });
      else pile.push(courant);
    }
  }
  return sortie;
}

/** Le texte brut d'un morceau de HTML : pour les cellules de tableau et les mesures. */
const texteBrut = (html: string) =>
  decoder(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Le rédacteur : un curseur, une largeur, et de quoi passer à la page suivante tout seul. */
class Redacteur {
  y = HAUT;
  readonly largeur: number;

  constructor(readonly doc: jsPDF) {
    this.largeur = doc.internal.pageSize.getWidth() - 2 * MARGE;
  }

  place(hauteur: number) {
    if (this.y + hauteur > BAS) {
      this.doc.addPage();
      this.y = HAUT;
    }
  }

  /** Une suite de fragments, coupée aux mots, en respectant gras et couleurs. */
  riche(frags: Fragment[], taille: number, interligne = 1.45, indent = 0) {
    const { doc } = this;
    doc.setFontSize(taille);
    const hauteurLigne = (taille * interligne) / 2.83; // points → mm
    const gauche = MARGE + indent;
    const largeurUtile = this.largeur - indent;
    let x = gauche;
    let ligneCommencee = false;

    const nouvelleLigne = () => {
      this.y += hauteurLigne;
      x = gauche;
      ligneCommencee = false;
      this.place(hauteurLigne);
    };

    this.place(hauteurLigne);
    for (const frag of frags) {
      if (frag.saut) { nouvelleLigne(); continue; }
      doc.setFont('helvetica', frag.style.gras ? 'bold' : 'normal');
      doc.setTextColor(...(frag.style.couleur || NOIR));
      const mots = frag.texte.split(' ').filter((mot, i, tous) => mot !== '' || i === tous.length - 1);
      for (const mot of mots) {
        if (mot === '') continue;
        const largeurMot = doc.getTextWidth(mot);
        const espace = ligneCommencee ? doc.getTextWidth(' ') : 0;
        if (ligneCommencee && x + espace + largeurMot > gauche + largeurUtile) nouvelleLigne();
        doc.setFont('helvetica', frag.style.gras ? 'bold' : 'normal');
        doc.setTextColor(...(frag.style.couleur || NOIR));
        if (ligneCommencee) x += espace;
        doc.text(mot, x, this.y);
        x += largeurMot;
        ligneCommencee = true;
      }
    }
    this.y += hauteurLigne;
  }

  /** Les lignes pointillées où la recrue écrit sa réponse. */
  reponse(nombre: number) {
    const { doc } = this;
    doc.setDrawColor(...TRAIT);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.7, 1.1], 0);
    for (let i = 0; i < nombre; i++) {
      this.place(6);
      this.y += 4.5;
      doc.line(MARGE, this.y, MARGE + this.largeur, this.y);
    }
    doc.setLineDashPattern([], 0);
    this.y += 3;
  }

  encadre(interieur: string) {
    const { doc } = this;
    const frags = fragments(interieur);
    const depart = this.y;
    const pageDepart = (doc as any).internal.getCurrentPageInfo().pageNumber;
    this.y += 3.5;
    this.riche(frags, 9, 1.45, 3.5);
    this.y += 1.5;
    const pageFin = (doc as any).internal.getCurrentPageInfo().pageNumber;
    // Un cadre à cheval sur deux pages se dessinerait de travers : on ne le trace que lorsque le
    // texte tient sur une seule page, le contenu reste lisible dans tous les cas.
    if (pageFin === pageDepart) {
      doc.setFillColor(...FOND);
      doc.setDrawColor(...TRAIT);
      doc.setLineWidth(0.25);
      doc.roundedRect(MARGE - 2, depart - 3, this.largeur + 4, this.y - depart + 2, 2, 2, 'S');
    }
    this.y += 2;
  }
}

/** Les blocs de premier niveau du document, dans l'ordre. */
function blocs(html: string): { balise: string; attributs: string; contenu: string }[] {
  const corps = /<body>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const motif = /<(h1|h2|h3|p|div|table|ul)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const sortie: { balise: string; attributs: string; contenu: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = motif.exec(corps)) !== null) {
    sortie.push({ balise: m[1].toLowerCase(), attributs: m[2] || '', contenu: m[3] });
  }
  return sortie;
}

/** Les lignes d'un tableau HTML : l'en-tête, puis le corps, avec les colonnes à aligner à droite. */
function tableau(contenu: string) {
  const lignes = (bloc: string) =>
    Array.from(bloc.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(tr =>
      Array.from(tr[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)).map(cell => ({
        texte: texteBrut(cell[3]),
        droite: /class="[^"]*\bn\b/.test(cell[2] || ''),
        grise: /class="[^"]*rep/.test(cell[2] || ''),
      })));

  const entete = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(contenu)?.[1];
  const corps = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(contenu)?.[1] ?? contenu;
  return { entete: entete ? lignes(entete) : [], corps: lignes(corps) };
}

/** Le bandeau LEBTEX en haut de la première page. */
function bandeau(doc: jsPDF, titre: string, chapeau: string) {
  const largeur = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NOIR);
  doc.rect(0, 0, largeur, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('LEBTEX', MARGE, 14);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_CLAIR);
  doc.text('Mercerie, fils à coudre, fermetures à glissière', MARGE, 20.5);
  const maintenant = new Date();
  doc.text(`Édité le ${maintenant.toLocaleDateString('fr-FR')}`, largeur - MARGE, 14, { align: 'right' });

  doc.setTextColor(...NOIR);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(titre.toUpperCase(), MARGE, 42);
  if (chapeau) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    const lignes = doc.splitTextToSize(chapeau, largeur - 2 * MARGE);
    doc.text(lignes, MARGE, 48);
    return 48 + lignes.length * 4 + 3;
  }
  return 50;
}

function piedDePage(doc: jsPDF, titre: string) {
  const pages = doc.getNumberOfPages();
  const largeur = doc.internal.pageSize.getWidth();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_CLAIR);
    doc.text(titre, MARGE, 290);
    doc.text(`${page} / ${pages}`, largeur - MARGE, 290, { align: 'right' });
  }
}

/**
 * Rend en PDF le HTML produit par devoirHtml / corrigeHtml. Séparé du téléchargement pour être
 * relisible hors du navigateur — un document de formation se vérifie avant d'être envoyé.
 */
export function construireDevoirFormationPDF(html: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const contenu = blocs(html);

  const titre = texteBrut(contenu.find(b => b.balise === 'h1')?.contenu || 'Devoir de formation');
  const chapeau = texteBrut(
    contenu.find(b => b.balise === 'p' && b.attributs.includes('chapeau'))?.contenu || '');

  const redacteur = new Redacteur(doc);
  redacteur.y = bandeau(doc, titre, chapeau);

  for (const bloc of contenu) {
    const { balise, attributs, contenu: interieur } = bloc;
    if (balise === 'h1') continue;
    if (balise === 'p' && attributs.includes('chapeau')) continue;

    if (balise === 'h2') {
      redacteur.place(16);
      redacteur.y += 5;
      redacteur.riche(fragments(interieur, { gras: true }), 12.5, 1.2);
      doc.setDrawColor(...NOIR);
      doc.setLineWidth(0.4);
      doc.line(MARGE, redacteur.y - 2.5, MARGE + redacteur.largeur, redacteur.y - 2.5);
      redacteur.y += 2;
      continue;
    }

    if (balise === 'h3') {
      redacteur.place(12);
      redacteur.y += 2.5;
      redacteur.riche(fragments(interieur, { gras: true }), 10.5, 1.25);
      continue;
    }

    if (balise === 'div' && attributs.includes('encadre')) {
      redacteur.encadre(interieur);
      continue;
    }

    if (balise === 'ul') {
      for (const li of interieur.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        redacteur.place(8);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...NOIR);
        doc.text('•', MARGE, redacteur.y);
        redacteur.riche(fragments(li[1]), 9.5, 1.4, 4);
      }
      redacteur.y += 1.5;
      continue;
    }

    if (balise === 'table') {
      const { entete, corps } = tableau(interieur);
      const colonnes: Record<number, any> = {};
      (entete[0] || corps[0] || []).forEach((cellule, i) => {
        if (cellule.droite) colonnes[i] = { halign: 'right' };
      });
      autoTable(doc, {
        startY: redacteur.y + 1,
        margin: { left: MARGE, right: MARGE, top: HAUT, bottom: 18 },
        head: entete.map(ligne => ligne.map(c => c.texte)),
        body: corps.map(ligne => ligne.map(c => c.texte)),
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: NOIR, lineColor: TRAIT, lineWidth: 0.1 },
        headStyles: { fillColor: NOIR, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: FOND },
        columnStyles: colonnes,
        didParseCell: data => {
          const source = (data.section === 'head' ? entete : corps)[data.row.index]?.[data.column.index];
          if (source?.grise) data.cell.styles.textColor = GRIS_CLAIR;
        },
      });
      redacteur.y = (doc as any).lastAutoTable.finalY + 3;
      continue;
    }

    if (balise === 'p') {
      const question = attributs.includes('class="q"');
      const note = attributs.includes('note') || attributs.includes('sig');
      // La zone de réponse : autant de lignes que le devoir en réservait de pointillés.
      const pointilles = /<span class="rep">(\.+)<\/span>/.exec(interieur)?.[1]?.length || 0;
      const texte = interieur.replace(/<span class="rep">[\s\S]*?<\/span>/g, '').replace(/<br\s*\/?>\s*$/i, '');
      redacteur.riche(fragments(texte, note ? { couleur: GRIS } : {}), note ? 9 : 10, 1.45);
      if (question) redacteur.reponse(pointilles > 45 ? 2 : 1);
      else redacteur.y += 1;
    }
  }

  piedDePage(doc, titre);
  return doc;
}

/**
 * Le même document, téléchargé.
 *
 * @param html     le document complet généré par src/lib/devoir-formation.ts
 * @param fichier  nom du fichier téléchargé, sans extension
 */
export function exportDevoirFormationPDF(html: string, fichier: string) {
  construireDevoirFormationPDF(html).save(`${fichier}.pdf`);
}
