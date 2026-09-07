import { addPdfLogoHeader } from './pdf-export';

export async function exportGlobalPackingPDF(articles: any[], generalCategories: any[]) {
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
  const categories = Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b));

  for (let i = 0; i < categories.length; i++) {
    const catName = categories[i];
    const catArticles = byCategory.get(catName)!;

    // We need to flatten the colorBreakdown and sizeBreakdown if they exist
    const tableBody: any[] = [];
    
    catArticles.forEach(art => {
      const hasQualityB = art.qualityBreakdown && art.qualityBreakdown.length > 0;
      const hasColorB = art.colorBreakdown && art.colorBreakdown.length > 0;
      const hasSizeB = art.sizeBreakdown && art.sizeBreakdown.length > 0;

      if (hasQualityB) {
        art.qualityBreakdown.forEach((qb: any) => {
          const specsDetail = [
            qb.gsm ? `${qb.gsm}gsm` : null,
            qb.fabricWidth ? `${qb.fabricWidth}cm` : null,
            qb.rollLength ? `${qb.rollLength}${qb.rollLengthUnit || 'm'}` : null,
            qb.packagingPerBag ? `${qb.packagingPerBag}rlx/sac` : null,
            qb.zipperType ? `Zip: ${qb.zipperType}` : null,
            qb.slider ? `Curseur: ${qb.slider}` : null,
            qb.pcsPerBag ? `${qb.pcsPerBag}p/bag` : null,
            qb.bagsPerCarton ? `${qb.bagsPerCarton}b/ctn` : null,
          ].filter(Boolean).join(' · ');
          tableBody.push([
            art.color || '-',
            `${(qb.quality || '-').toUpperCase()}${specsDetail ? ' (' + specsDetail + ')' : ''}`,
            `${qb.quantity || 0} ${art.unitOfMeasure || 'pcs'}`
          ]);
        });
      } else if (hasColorB) {
        art.colorBreakdown.forEach((cb: any) => {
          tableBody.push([
            cb.colorCode || art.color || '-',
            art.size || '-',
            `${cb.rolls || cb.quantity || 0} ${art.unitOfMeasure || 'pcs'}`
          ]);
        });
      } else if (hasSizeB) {
        art.sizeBreakdown.forEach((sb: any) => {
          tableBody.push([
            art.color || '-',
            (sb.size || '-') + (sb.description ? `\n${sb.description}` : ''),
            `${sb.quantity || 0} ${art.unitOfMeasure || 'pcs'}`
          ]);
        });
      } else {
        const specsDetail = [
          art.zipperType ? `Zip: ${art.zipperType}` : null,
          art.slider ? `Curseur: ${art.slider}` : null,
          art.pcsPerBag ? `${art.pcsPerBag}p/bag` : null,
          art.bagsPerCarton ? `${art.bagsPerCarton}b/ctn` : null,
          art.gsm ? `${art.gsm}gsm` : null,
          art.fabricWidth ? `${art.fabricWidth}cm` : null,
          art.packagingPerBag ? `${art.packagingPerBag}rlx/sac` : null,
        ].filter(Boolean).join(' · ');
        const sizeOrSpecs = [art.size && art.size !== 'various' ? art.size : null, specsDetail || null].filter(Boolean).join(' — ') || art.size || '-';

        tableBody.push([
          art.color || '-',
          sizeOrSpecs,
          `${art.quantity || 0} ${art.unitOfMeasure || 'pcs'}`
        ]);
      }
    });

    // Check general category
    const sampleArt = catArticles[0];
    const genCatId = sampleArt.generalCategoryId;
    const gcObj = generalCategories?.find(g => g.id === genCatId);
    const gcName = gcObj ? gcObj.name : 'Divers';

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
    doc.text(`Catégorie: ${catName} (${gcName})`, 10, startY);
    
    startY += 4;

    autoTable(doc, {
      startY: startY,
      head: [['Couleur', 'Taille / Specs', 'Quantité']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [63, 63, 70], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 150 },
        2: { cellWidth: 'auto', halign: 'right' }
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
