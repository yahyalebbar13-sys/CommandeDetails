import { addPdfLogoHeader } from './pdf-export';
import { getArticleFrenchName } from './product-name-utils';
import {
  qualiteDeLArticle, specificationsArticle, type LigneSpecification,
} from './specification-produit';

/**
 * Packing details global : tout ce qui est en cours de production, en transit ou en douane,
 * regroupé par famille. Document logistique, sans aucun montant.
 *
 * Les caractéristiques techniques sont lues dans le modèle du type de chaque article (tissu,
 * fermeture, fil, curseur, ruban, accessoire) — voir src/lib/specification-produit.ts. Avant,
 * seuls le tissu et la fermeture étaient traités en dur : un fil ou un accessoire s'imprimait
 * sans la moindre caractéristique.
 */

/** Le conditionnement, dans les clés des six modèles : c'est ce que le magasinier compte. */
const CLES_CONDITIONNEMENT = new Set([
  'packagingPerBag', 'pcsPerBag', 'bagsPerCarton',
  'rollsPerShrink', 'rollsPerCarton', 'pcsPerBox', 'boxPerCarton',
]);

/** Les polices standard de jsPDF sont en WinAnsi : apostrophes et guillemets courbes y passent mal. */
function txt(v: any): string {
  return String(v ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

const isVarious = (v: any) => String(v || '').toLowerCase() === 'various';

/** Un libellé fixe de l'article : vide s'il est absent ou s'il vaut « various ». */
const fixe = (v: any): string => {
  const t = String(v ?? '').trim();
  return !t || isVarious(t) ? '' : t;
};

/** « 150CM », « 150 cm » et « 150cm » désignent la même mesure. */
const sameMeasure = (a: any, b: any): boolean => {
  const norm = (v: any) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
};

/** « GSM 180 · Largeur (cm) 150 · Pcs/bag 20 » */
const enLigne = (lignes: LigneSpecification[]): string =>
  lignes.map(l => `${l.label} ${l.valeur}`).join(' · ');

export async function exportGlobalPackingPDF(articles: any[], generalCategories: any[], categories: any[] = []) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // Filter active commands: PI (Production), SHIPPED/TRANSIT (Transit), CUSTOMS (Douane)
  const activeStatuses = ['PI', 'SHIPPED', 'TRANSIT', 'CUSTOMS'];
  const activeArticles = articles.filter(a => activeStatuses.includes(a.status));

  // Group by categoryId
  const byCategory = new Map<string, any[]>();
  activeArticles.forEach(a => {
    const cat = a.categoryId || 'SANS CATÉGORIE';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Colors
  const NAVY = [28, 25, 23];
  const GOLD = [251, 191, 36];

  // ── Caractéristiques techniques, dans le modèle du type de l'article ─────
  // Une ligne de qualité porte les siennes, qui priment : c'est ce qui distingue deux qualités
  // du même produit. La taille et la largeur déjà imprimées dans leur colonne ne sont pas répétées,
  // et « various » — marque interne d'un article ventilé — ne s'imprime jamais.
  const caracteristiques = (art: any, ligneQualite?: any, tailleAffichee?: any): LigneSpecification[] =>
    specificationsArticle(art, categories, generalCategories, ligneQualite).filter(l => {
      if (isVarious(l.valeur)) return false;
      if (l.cle === 'size') return !sameMeasure(tailleAffichee, l.valeur);
      if (l.cle === 'fabricWidth') return !sameMeasure(tailleAffichee, `${l.valeur}cm`);
      return true;
    });

  const specsTexte = (art: any, ligneQualite?: any, tailleAffichee?: any) =>
    enLigne(caracteristiques(art, ligneQualite, tailleAffichee));

  /** Le seul conditionnement : à rappeler sur les lignes de couleur et de taille. */
  const conditionnementTexte = (art: any) =>
    enLigne(caracteristiques(art).filter(l => CLES_CONDITIONNEMENT.has(l.cle)));

  /** Nom commercial français, doublé du libellé interne quand il en dit plus. */
  const designation = (art: any): string => {
    const frName = txt(getArticleFrenchName(art, categories, generalCategories));
    const interne = txt(art.name || art.categoryId || '');
    return interne && interne.toLowerCase() !== frName.toLowerCase() ? `${frName}\n${interne}` : frName;
  };

  // Header
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pageW, 28, 'F');

  await addPdfLogoHeader(doc, 8, 4, 38, 19, true);

  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKING DETAILS GLOBAL - COMMANDES EN COURS', 54, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('fr-FR');
  doc.text(`Généré le: ${dateStr} | Statuts inclus: Production, Transit, Douane`, 54, 20);

  let startY = 35;

  // Sort categories alphabetically
  const categoryNames = Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b));

  for (let i = 0; i < categoryNames.length; i++) {
    const catName = categoryNames[i];
    const catArticles = byCategory.get(catName)!;

    // We need to flatten the colorBreakdown and sizeBreakdown if they exist
    const tableBody: any[] = [];

    catArticles.forEach(art => {
      const hasQualityB = art.qualityBreakdown && art.qualityBreakdown.length > 0;
      const hasColorB = art.colorBreakdown && art.colorBreakdown.length > 0;
      const hasSizeB = art.sizeBreakdown && art.sizeBreakdown.length > 0;

      const unite = art.unitOfMeasure || 'pcs';
      const nom = designation(art);
      // Libellés fixes de l'article : répétés sur chaque variante, pour que la ligne se lise seule.
      const qualiteFixe = qualiteDeLArticle(art) || '';
      const couleurFixe = fixe(art.color);
      const tailleFixe = fixe(art.size);
      const conditionnement = conditionnementTexte(art);

      if (hasQualityB) {
        // Une ligne par qualité, avec SES caractéristiques.
        art.qualityBreakdown.forEach((qb: any) => {
          const taille = fixe(qb.size) || tailleFixe;
          tableBody.push([
            nom,
            txt(qb.nameFR || qualiteDeLArticle(art, qb) || '-'),
            txt(couleurFixe || '-'),
            txt(taille || '-'),
            txt(specsTexte(art, qb, taille) || '-'),
            `${qb.quantity || 0} ${unite}`,
          ]);
        });
      } else if (hasColorB) {
        // Une ligne par couleur : mêmes caractéristiques que l'article, conditionnement rappelé.
        art.colorBreakdown.forEach((cb: any) => {
          const label = fixe(cb.colorCode) || fixe(cb.color) || couleurFixe;
          const couleur = cb.description && cb.description !== label
            ? `${label || '-'} — ${cb.description}` : (label || '-');
          tableBody.push([
            nom,
            txt(qualiteFixe || '-'),
            txt(couleur),
            txt(tailleFixe || '-'),
            txt(conditionnement || '-'),
            `${cb.rolls || cb.quantity || 0} ${unite}`,
          ]);
        });
      } else if (hasSizeB) {
        // Une ligne par taille.
        art.sizeBreakdown.forEach((sb: any) => {
          const taille = fixe(sb.size) || '-';
          tableBody.push([
            nom,
            txt(qualiteFixe || '-'),
            txt(couleurFixe || '-'),
            txt(sb.description ? `${taille} — ${sb.description}` : taille),
            txt(conditionnement || '-'),
            `${sb.quantity || 0} ${unite}`,
          ]);
        });
      } else {
        tableBody.push([
          nom,
          txt(qualiteFixe || '-'),
          txt(couleurFixe || '-'),
          txt(tailleFixe || '-'),
          txt(specsTexte(art, undefined, tailleFixe) || '-'),
          `${art.quantity || 0} ${unite}`,
        ]);
      }
    });

    // Check general category
    const sampleArt = catArticles[0];
    const genCatId = sampleArt.generalCategoryId;
    const gcObj = generalCategories?.find(g => g.id === genCatId);
    const gcName = gcObj ? (gcObj.nameFR || gcObj.name) : 'Divers';

    // Before drawing a new table, check if we need to add a new page manually
    // to avoid a category title floating alone at the bottom.
    if (startY > pageH - 40 && i > 0) {
      doc.addPage();
      startY = 20;
    }

    // Print category title above the table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(txt(`Catégorie: ${catName} (${gcName})`), 10, startY);

    startY += 4;

    autoTable(doc, {
      startY: startY,
      head: [['Désignation', 'Qualité', 'Couleur', 'Taille', 'Caractéristiques', 'Quantité']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [63, 63, 70], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: {
        fontSize: 8, cellPadding: 2.5, textColor: [40, 40, 40],
        overflow: 'linebreak', valign: 'middle',
      },
      // Les caractéristiques peuvent aller jusqu'à huit valeurs (une fermeture) : elles prennent
      // la colonne la plus large, en 7 pt, pour tenir sur deux ou trois lignes.
      columnStyles: {
        0: { cellWidth: 56, fontStyle: 'bold' },
        1: { cellWidth: 30 },
        2: { cellWidth: 34 },
        3: { cellWidth: 24 },
        4: { cellWidth: 'auto', fontSize: 7 },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 10, right: 10, bottom: 15 },
      didDrawPage: (data: any) => {
        startY = data.cursor.y;
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 12;
  }

  // Footer
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(`Global Packing Details  |  ${dateStr}`, 10, pageH - 5);
    doc.text(`Page ${i} / ${pages}`, pageW - 10, pageH - 5, { align: "right" });
  }

  doc.save(`Global_Packing_Details_${dateStr.replace(/\//g, '-')}.pdf`);
}
