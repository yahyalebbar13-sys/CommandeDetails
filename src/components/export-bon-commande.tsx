
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportBonCommandeProps {
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

export default function ExportBonCommande({ article }: ExportBonCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const contentW = pageW - marginX * 2;

    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const todayStr = new Date().toISOString().slice(0, 10);
    const ref = `BC-${Date.now().toString().slice(-8)}`;

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
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("PURCHASE ORDER", pageW - marginX, yPos + 8, { align: "right" });

    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.line(pageW - marginX - 45, yPos + 11, pageW - marginX, yPos + 11);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_MAIN);
    doc.text(`Ref: ${ref}`, pageW - marginX, yPos + 17, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Date: ${today}`, pageW - marginX, yPos + 22, { align: "right" });

    yPos += 35;

    // ── 2. PREORDER BADGE ─────────────────────────────────────────────────────
    if (article.isPreorder && article.clientName) {
      doc.setFillColor(238, 242, 255); // indigo-50
      doc.setDrawColor(199, 210, 254); // indigo-200
      doc.setLineWidth(0.3);
      doc.roundedRect(marginX, yPos, contentW, 10, 1, 1, "FD");
      
      doc.setTextColor(79, 70, 229); // indigo-600
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(`SPECIAL CLIENT ORDER: ${(article.clientName).toUpperCase()}`, pageW / 2, yPos + 6.5, { align: "center" });
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
    doc.text("ORDER SPECIFICATIONS", marginX, yPos);
    
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

    drawSpecItem(marginX + 4, yPos + 6, "Category", (article.categoryId || "—").toUpperCase());
    drawSpecItem(marginX + 4 + specW, yPos + 6, "Size", article.size && article.size !== "various" ? article.size.toUpperCase() : "VARIOUS");
    drawSpecItem(marginX + 4 + specW * 2, yPos + 6, "Color", colorLabel);
    
    // Highlight Quantity
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("TOTAL QTY", marginX + 4 + specW * 3, yPos + 6);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(fmtQty(article.quantity, article.unitOfMeasure), marginX + 4 + specW * 3, yPos + 11.5);

    // Bottom row if zipper or specs exist
    if (article.zipperType || article.slider || article.specs) {
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(marginX + 4, yPos + 16, pageW - marginX - 4, yPos + 16);
      
      if (article.zipperType) {
        drawSpecItem(marginX + 4, yPos + 22, "Zipper Type", article.zipperType.toUpperCase());
        drawSpecItem(marginX + 4 + specW, yPos + 22, "Slider", (article.slider || "—").toUpperCase());
        drawSpecItem(marginX + 4 + specW * 2, yPos + 22, "Slider Type", (article.sliderType || "—").toUpperCase());
      } else if (article.specs) {
        drawSpecItem(marginX + 4, yPos + 22, "Technical Specifications / Notes", article.specs);
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
      yPos = drawSectionTitle("Color Breakdown", `${colorBreakdown.length} color(s)`, yPos);

      const colorRows = colorBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.colorCode || "—").toUpperCase(),
        fmtQty(Number(r.rolls || 0), article.unitOfMeasure),
      ]);

      const totalRolls = colorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
      colorRows.push(["", "GRAND TOTAL", fmtQty(totalRolls, article.unitOfMeasure)]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Color Reference", "Qty Ordered"]],
        body: colorRows,
        margin: { left: marginX, right: marginX, bottom: 20 },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          font: "helvetica",
          textColor: TEXT_MAIN,
          lineColor: BORDER_COLOR,
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [80, 80, 80],
          fontSize: 7,
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          0: { cellWidth: 12, textColor: TEXT_MUTED },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 45, fontStyle: "bold", textColor: NAVY },
        },
        didParseCell: (data) => {
          if (data.row.index === colorRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [235, 240, 248];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 8;
    }

    if (sizeBreakdown.length > 0) {
      // Manage page break if necessary
      if (yPos > pageH - 50) {
        doc.addPage();
        yPos = 20;
      }

      yPos = drawSectionTitle("Size Breakdown", `${sizeBreakdown.length} size(s)`, yPos);

      const sizeRows = sizeBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.size || "—").toUpperCase(),
        fmtQty(Number(r.quantity || 0), article.unitOfMeasure),
      ]);

      const totalSizeQty = sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      sizeRows.push(["", "GRAND TOTAL", fmtQty(totalSizeQty, article.unitOfMeasure)]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Size", "Qty Ordered"]],
        body: sizeRows,
        margin: { left: marginX, right: marginX, bottom: 20 },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          font: "helvetica",
          textColor: TEXT_MAIN,
          lineColor: BORDER_COLOR,
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [80, 80, 80],
          fontSize: 7,
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          0: { cellWidth: 12, textColor: TEXT_MUTED },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 45, fontStyle: "bold", textColor: NAVY },
        },
        didParseCell: (data) => {
          if (data.row.index === sizeRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [235, 240, 248];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 8;
    }

    // Single summary row if no breakdowns
    if (colorBreakdown.length === 0 && sizeBreakdown.length === 0) {
      yPos = drawSectionTitle("Summary", "1 line", yPos);

      const singleRow = [[
        article.size && article.size !== "various" ? article.size.toUpperCase() : "—",
        (!article.colorBreakdown?.length && article.color) ? article.color.toUpperCase() : "—",
        fmtQty(article.quantity, article.unitOfMeasure),
      ]];

      autoTable(doc, {
        startY: yPos,
        head: [["Size", "Color", "Qty Ordered"]],
        body: singleRow,
        margin: { left: marginX, right: marginX, bottom: 20 },
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica", textColor: TEXT_MAIN, lineColor: BORDER_COLOR, lineWidth: 0.15 },
        headStyles: { fillColor: [240, 240, 240], textColor: [80, 80, 80], fontSize: 7, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", fontStyle: "bold" },
          1: { halign: "center", fontStyle: "bold" },
          2: { halign: "right", fontStyle: "bold", textColor: NAVY },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── 6. SIGNATURE BLOCK ────────────────────────────────────────────────────
    // If not enough space for signatures, add page
    if (yPos > pageH - 60) {
      doc.addPage();
      yPos = 20;
    }

    // Separator line
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.4);
    doc.line(marginX, yPos, pageW - marginX, yPos);
    yPos += 8;

    const sigBoxW = (contentW - 12) / 2;

    // Supplier signature (Left)
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("SUPPLIER ACKNOWLEDGEMENT", marginX + 6, yPos + 7);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Stamp and signature required for validation", marginX + 6, yPos + 11);
    
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marginX + 6, yPos + 22, marginX + sigBoxW - 6, yPos + 22);
    doc.setLineDashPattern([], 0);

    // Lebtex signature (Right)
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX + sigBoxW + 12, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("ISSUED BY LEBTEX TEXTILE IMPORT", marginX + sigBoxW + 18, yPos + 7);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Purchasing & Logistics Department", marginX + sigBoxW + 18, yPos + 11);
    
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(marginX + sigBoxW + 18, yPos + 22, marginX + contentW - 6, yPos + 22);

    // ── 7. FOOTER ─────────────────────────────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Informations de l'entreprise
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      
      const companyInfoLine1 = "LEBTEX TEXTILE IMPORT - 31 Rue 65, Lotissement Al Hamd Ain-Chock, Casablanca, Morocco";
      const companyInfoLine2 = "Tel: +212 5 22 25 77 78 / +212 5 22 31 62 88 - Fax: +212 5 22 58 03 46 - Mobile: +212 6 61 10 15 60 - Email: Contact.lebtex@gmail.com";
      const companyInfoLine3 = "Tax ID: 34011181 - R.C: 704617 - I.F: 68814237 - ICE: 003823212000094";
      
      doc.text(companyInfoLine1, pageW / 2, pageH - 24, { align: "center" });
      doc.text(companyInfoLine2, pageW / 2, pageH - 20, { align: "center" });
      doc.text(companyInfoLine3, pageW / 2, pageH - 16, { align: "center" });

      doc.setFillColor(...NAVY);
      doc.rect(0, pageH - 12, pageW, 12, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, pageH - 12, 4, 12, "F");
      
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`Official LEBTEX Document  |  Ref. ${ref}  |  Generated on ${todayStr}`, marginX + 4, pageH - 5);
      
      doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 5, { align: "right" });
    }

    // ── SAVE ──────────────────────────────────────────────────────────────────
    const artName = (article.name || "article").replace(/\s+/g, "_").toUpperCase();
    const fileName = `PO-LEBTEX-${artName}-${todayStr}.pdf`;
    doc.save(fileName);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      className="h-8 w-8 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors border border-transparent hover:border-stone-200"
      title="Exporter Bon de Commande (PDF Fournisseur)"
    >
      <FileDown className="w-4 h-4" />
    </Button>
  );
}
