"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportClientCommandeProps {
  article: any;
}

// ── Brand Colors ────────────────────────────────────────────────────────────
const NAVY: [number, number, number] = [15, 23, 42]; // slate-900
const GOLD: [number, number, number] = [196, 160, 98]; // Lebtex gold
const TEXT_MAIN: [number, number, number] = [30, 41, 59]; // slate-800
const TEXT_MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const LIGHT_BG: [number, number, number] = [248, 250, 252]; // slate-50
const BORDER_COLOR: [number, number, number] = [226, 232, 240]; // slate-200

// ── Formatage numérique avec point comme séparateur de milliers ────────────
function fmtNum(n: number): string {
  if (n == null || isNaN(n)) return "0";
  const parts = n.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
  return parts.join(",");
}

function fmtQty(qty: number, unit: string): string {
  return `${fmtNum(Number(qty))} ${unit || ""}`.trim();
}

export default function ExportClientCommande({ article }: ExportClientCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const contentW = pageW - marginX * 2;

    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const todayStr = new Date().toISOString().slice(0, 10);
    const ref = `CONF-${Date.now().toString().slice(-8)}`;

    let yPos = 16;

    // ── 1. HEADER ─────────────────────────────────────────────────────────────
    // Try logo
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => {
        doc.addImage(img, "PNG", marginX, yPos, 36, 18);
        resolve();
      };
      img.onerror = () => {
        doc.setTextColor(...NAVY);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("LEBTEX", marginX, yPos + 8);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GOLD);
        doc.text("TEXTILE IMPORT", marginX, yPos + 13);
        resolve();
      };
    });

    // Right Side: Title & Info
    doc.setTextColor(...NAVY);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CONFIRMATION DE COMMANDE", pageW - marginX, yPos + 8, { align: "right" });

    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.line(pageW - marginX - 60, yPos + 11, pageW - marginX, yPos + 11);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_MAIN);
    doc.text(`Réf: ${ref}`, pageW - marginX, yPos + 17, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Date: ${today}`, pageW - marginX, yPos + 22, { align: "right" });

    yPos += 35;

    // ── 2. CLIENT BADGE ─────────────────────────────────────────────────────
    if (article.clientName) {
      doc.setFillColor(238, 242, 255); // indigo-50
      doc.setDrawColor(199, 210, 254); // indigo-200
      doc.setLineWidth(0.3);
      doc.roundedRect(marginX, yPos, contentW, 10, 1, 1, "FD");
      
      doc.setTextColor(79, 70, 229); // indigo-600
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(`CLIENT : ${(article.clientName).toUpperCase()}`, pageW / 2, yPos + 6.5, { align: "center" });
      yPos += 16;
    }

    // ── 3. ARTICLE IDENTITY ───────────────────────────────────────────────────
    doc.setFillColor(...NAVY);
    doc.roundedRect(marginX, yPos, contentW, 16, 1.5, 1.5, "F");
    
    // Golden accent line on the left
    doc.setFillColor(...GOLD);
    doc.rect(marginX, yPos, 4, 16, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text((article.name || "—").toUpperCase(), marginX + 10, yPos + 10.5);

    yPos += 24;

    // ── 4. SPECIFICATIONS BLOCK ───────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("SPÉCIFICATIONS", marginX, yPos);
    
    yPos += 4;
    
    // Draw a nice bordered box for specs
    const specBoxH = article.zipperType || article.slider || article.specs ? 32 : 18;
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, yPos, contentW, specBoxH, 1, 1, "FD");

    const colorLabel = (() => {
      const cb: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
      if (cb.length > 0) return `${cb.length} COULEURS`;
      if (article.color && article.color !== "various") return article.color.toUpperCase();
      return "—";
    })();

    // Top row of specs
    const specW = contentW / 4;
    const drawSpecItem = (x: number, y: number, label: string, value: string) => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      doc.text(label.toUpperCase(), x, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_MAIN);
      const lines = doc.splitTextToSize(value || "—", specW - 4);
      doc.text(lines[0] || "—", x, y + 5);
    };

    drawSpecItem(marginX + 4, yPos + 6, "Catégorie", (article.categoryId || "—").toUpperCase());
    drawSpecItem(marginX + 4 + specW, yPos + 6, "Taille", article.size && article.size !== "various" ? article.size.toUpperCase() : "VARIOUS");
    drawSpecItem(marginX + 4 + specW * 2, yPos + 6, "Couleur", colorLabel);
    
    // Highlight Quantity
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("QUANTITÉ TOTALE", marginX + 4 + specW * 3, yPos + 6);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(fmtQty(article.quantity, article.unitOfMeasure), marginX + 4 + specW * 3, yPos + 11.5);

    // Bottom row if zipper or specs exist
    if (article.zipperType || article.slider || article.specs) {
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(marginX + 4, yPos + 16, pageW - marginX - 4, yPos + 16);
      
      if (article.zipperType) {
        drawSpecItem(marginX + 4, yPos + 22, "Type Fermeture", article.zipperType.toUpperCase());
        drawSpecItem(marginX + 4 + specW, yPos + 22, "Curseur (Slider)", (article.slider || "—").toUpperCase());
        drawSpecItem(marginX + 4 + specW * 2, yPos + 22, "Type Slider", (article.sliderType || "—").toUpperCase());
      } else if (article.specs) {
        drawSpecItem(marginX + 4, yPos + 22, "Spécifications Techniques / Notes", article.specs);
      }
    }

    yPos += specBoxH + 12;

    // ── 5. DETAILS TABLES ─────────────────────────────────────────────────────
    const colorBreakdown: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
    const sizeBreakdown: any[] = Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : [];

    const drawSectionTitle = (title: string, subtitle: string, y: number) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(title.toUpperCase(), marginX, y);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      doc.text(subtitle, pageW - marginX, y, { align: "right" });
      
      return y + 4;
    };

    if (colorBreakdown.length > 0) {
      yPos = drawSectionTitle("Détail par Couleur", `${colorBreakdown.length} référence(s)`, yPos);

      const colorRows = colorBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.colorCode || "—").toUpperCase(),
        fmtQty(Number(r.rolls || 0), article.unitOfMeasure),
      ]);

      const totalRolls = colorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
      colorRows.push(["", "TOTAL GÉNÉRAL", fmtQty(totalRolls, article.unitOfMeasure)]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Désignation Couleur", "Quantité Demandée"]],
        body: colorRows,
        margin: { left: marginX, right: marginX, bottom: 30 },
        styles: {
          fontSize: 9,
          cellPadding: 5,
          font: "helvetica",
          textColor: TEXT_MAIN,
          lineColor: BORDER_COLOR,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: LIGHT_BG,
          textColor: TEXT_MUTED,
          fontSize: 8,
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          0: { cellWidth: 15, textColor: TEXT_MUTED },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 50, fontStyle: "bold", textColor: NAVY },
        },
        didParseCell: (data) => {
          if (data.row.index === colorRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [241, 245, 249]; // slate-100
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;
    }

    if (sizeBreakdown.length > 0) {
      if (yPos > pageH - 50) {
        doc.addPage();
        yPos = 20;
      }

      yPos = drawSectionTitle("Détail par Taille", `${sizeBreakdown.length} taille(s)`, yPos);

      const sizeRows = sizeBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.size || "—").toUpperCase(),
        fmtQty(Number(r.quantity || 0), article.unitOfMeasure),
      ]);

      const totalSizeQty = sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      sizeRows.push(["", "TOTAL GÉNÉRAL", fmtQty(totalSizeQty, article.unitOfMeasure)]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Désignation Taille", "Quantité Demandée"]],
        body: sizeRows,
        margin: { left: marginX, right: marginX, bottom: 30 },
        styles: {
          fontSize: 9,
          cellPadding: 5,
          font: "helvetica",
          textColor: TEXT_MAIN,
          lineColor: BORDER_COLOR,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: LIGHT_BG,
          textColor: TEXT_MUTED,
          fontSize: 8,
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          0: { cellWidth: 15, textColor: TEXT_MUTED },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 50, fontStyle: "bold", textColor: NAVY },
        },
        didParseCell: (data) => {
          if (data.row.index === sizeRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [241, 245, 249];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;
    }

    if (colorBreakdown.length === 0 && sizeBreakdown.length === 0) {
      yPos = drawSectionTitle("Récapitulatif", "1 ligne", yPos);

      const singleRow = [[
        article.size && article.size !== "various" ? article.size.toUpperCase() : "—",
        (!article.colorBreakdown?.length && article.color) ? article.color.toUpperCase() : "—",
        fmtQty(article.quantity, article.unitOfMeasure),
      ]];

      autoTable(doc, {
        startY: yPos,
        head: [["Taille", "Couleur", "Quantité Demandée"]],
        body: singleRow,
        margin: { left: marginX, right: marginX, bottom: 30 },
        styles: { fontSize: 9, cellPadding: 6, font: "helvetica", textColor: TEXT_MAIN, lineColor: BORDER_COLOR, lineWidth: 0.2 },
        headStyles: { fillColor: LIGHT_BG, textColor: TEXT_MUTED, fontSize: 8, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", fontStyle: "bold" },
          1: { halign: "center", fontStyle: "bold" },
          2: { halign: "right", fontStyle: "bold", textColor: NAVY },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;
    }

    // ── CONDITIONS DE VENTE ───────────────────────────────────────────────────
    if (yPos > pageH - 85) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, yPos, contentW, 22, 1.5, 1.5, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("CONDITIONS DE VENTE :", marginX + 4, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MAIN);
    doc.text("• Condition de paiement : solde à la livraison ou à la réception.", marginX + 4, yPos + 11);
    doc.text("• Les délais sont donnés à titre indicatif et peuvent varier selon les conditions d'importation.", marginX + 4, yPos + 15);
    doc.text("• Clause non-annulation : toute commande validée accompagnée d'un acompte est ferme, définitive, non annulable et non remboursable.", marginX + 4, yPos + 19);

    yPos += 28;

    // ── 6. SIGNATURE BLOCK ────────────────────────────────────────────────────
    if (yPos > pageH - 45) {
      doc.addPage();
      yPos = 20;
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.4);
    doc.line(marginX, yPos, pageW - marginX, yPos);
    yPos += 8;

    const sigBoxW = (contentW - 12) / 2;

    // Lebtex signature (Left)
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("ÉMIS PAR LEBTEX TEXTILE IMPORT", marginX + 6, yPos + 7);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Service Commercial", marginX + 6, yPos + 11);
    
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(marginX + 6, yPos + 22, marginX + sigBoxW - 6, yPos + 22);

    // Client signature (Right)
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX + sigBoxW + 12, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("ACCUSÉ DE RÉCEPTION CLIENT", marginX + sigBoxW + 18, yPos + 7);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Lu et approuvé (Cachet et signature)", marginX + sigBoxW + 18, yPos + 11);
    
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marginX + sigBoxW + 18, yPos + 22, marginX + contentW - 6, yPos + 22);
    doc.setLineDashPattern([], 0); // reset

    // ── 7. FOOTER ─────────────────────────────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Informations de l'entreprise
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      
      const companyInfoLine1 = "LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc";
      const companyInfoLine2 = "Tel : 05 22 25 77 78 / 05 22 31 62 88 - Fax : 05 22 58 03 46 - Portable : 06 61 10 15 60 - Email : Contact.lebtex@gmail.com";
      const companyInfoLine3 = "Patente : 34011181 - R.C : 704617 - I.F : 68814237 - ICE : 003823212000094";
      
      doc.text(companyInfoLine1, pageW / 2, pageH - 24, { align: "center" });
      doc.text(companyInfoLine2, pageW / 2, pageH - 20, { align: "center" });
      doc.text(companyInfoLine3, pageW / 2, pageH - 16, { align: "center" });

      doc.setFillColor(...NAVY);
      doc.rect(0, pageH - 12, pageW, 12, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, pageH - 12, 4, 12, "F");
      
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Document Officiel LEBTEX  |  Réf. ${ref}  |  Généré le ${todayStr}`, marginX + 4, pageH - 5);
      
      doc.text(`Page ${i} sur ${pageCount}`, pageW - marginX, pageH - 5, { align: "right" });
    }

    // ── SAVE ──────────────────────────────────────────────────────────────────
    const artName = (article.name || "article").replace(/\s+/g, "_").toUpperCase();
    const fileName = `CONF-CLIENT-${artName}-${todayStr}.pdf`;
    doc.save(fileName);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      className="h-8 w-8 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
      title="Confirmation de Commande (PDF Client)"
    >
      <UserCheck className="w-4 h-4" />
    </Button>
  );
}
