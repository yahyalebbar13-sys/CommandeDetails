"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportBonCommandeProps { article: any; }

// ── Brand ────────────────────────────────────────────────────────────────────
const NAVY:   [number,number,number] = [15, 23, 42];
const GOLD:   [number,number,number] = [196, 160, 98];
const WHITE:  [number,number,number] = [255, 255, 255];
const MUTED:  [number,number,number] = [100, 116, 139];
const BORDER: [number,number,number] = [226, 232, 240];
const BG:     [number,number,number] = [248, 250, 252];
const GOLD_LIGHT: [number,number,number] = [254, 249, 240];

function fmtNum(n: number) {
  if (n == null || isNaN(n)) return "0";
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtQty(qty: number, unit: string) {
  return `${fmtNum(Number(qty))} ${unit || ""}`.trim();
}

export default function ExportBonCommande({ article }: ExportBonCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const MX = 15;
    const CW = W - MX * 2;

    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const todayStr = new Date().toISOString().slice(0, 10);
    const ref = `PO-LBX-${Date.now().toString().slice(-8)}`;
    let y = 0;

    // ════════════════════════════════════════════════════════════════════════
    // HEADER BAND — full-width navy
    // ════════════════════════════════════════════════════════════════════════
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 38, "F");

    // Gold left accent
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, 5, 38, "F");

    // Logo / company name
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => { doc.addImage(img, "PNG", 10, 6, 32, 16); resolve(); };
      img.onerror = () => {
        doc.setTextColor(...WHITE);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("LEBTEX", 12, 20);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GOLD);
        doc.text("TEXTILE IMPORT", 12, 26);
        resolve();
      };
    });

    // Document title (right side of header)
    doc.setTextColor(...WHITE);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PURCHASE ORDER", W - MX, 18, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GOLD);
    doc.text(`Ref: ${ref}`, W - MX, 26, { align: "right" });
    doc.setTextColor(148, 163, 184);
    doc.text(`Date: ${today}`, W - MX, 31, { align: "right" });

    y = 44;

    // ════════════════════════════════════════════════════════════════════════
    // CLIENT ORDER BADGE
    // ════════════════════════════════════════════════════════════════════════
    if (article.isPreorder && article.clientName) {
      doc.setFillColor(238, 242, 255);
      doc.setDrawColor(199, 210, 254);
      doc.setLineWidth(0.3);
      doc.roundedRect(MX, y, CW, 9, 1, 1, "FD");
      doc.setTextColor(67, 56, 202);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text(`★  SPECIAL CLIENT ORDER — ${article.clientName.toUpperCase()}  ★`, W / 2, y + 5.8, { align: "center" });
      y += 14;
    }

    // ════════════════════════════════════════════════════════════════════════
    // FROM / TO BLOCK
    // ════════════════════════════════════════════════════════════════════════
    const colW = (CW - 6) / 2;

    // FROM — LEBTEX
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, y, colW, 34, 1, 1, "FD");
    // Gold top bar
    doc.setFillColor(...GOLD);
    doc.roundedRect(MX, y, colW, 6, 1, 1, "F");
    doc.rect(MX, y + 3, colW, 3, "F"); // fill corners
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("FROM", MX + 4, y + 4.5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("LEBTEX TEXTILE IMPORT", MX + 4, y + 12);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("31 Rue 65, Lot. Al Hamd Ain-Chock", MX + 4, y + 17);
    doc.text("Casablanca, Morocco", MX + 4, y + 21.5);
    doc.text("Tel: +212 6 61 10 15 60", MX + 4, y + 26);
    doc.text("Contact.lebtex@gmail.com", MX + 4, y + 30);

    // TO — Supplier
    const toX = MX + colW + 6;
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(toX, y, colW, 34, 1, 1, "FD");
    doc.setFillColor(...NAVY);
    doc.roundedRect(toX, y, colW, 6, 1, 1, "F");
    doc.rect(toX, y + 3, colW, 3, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("TO  (SUPPLIER)", toX + 4, y + 4.5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    const supplierName = (article.supplierName || article.fournisseurId || "SUPPLIER NAME").toUpperCase();
    doc.text(supplierName, toX + 4, y + 12);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(article.supplierAddress || "Address: __________________________", toX + 4, y + 17);
    doc.text(article.supplierCity    || "City / Country: ___________________", toX + 4, y + 21.5);
    doc.text(article.supplierTel     || "Tel: ______________________________", toX + 4, y + 26);
    doc.text(article.supplierEmail   || "Email: ____________________________", toX + 4, y + 30);

    y += 40;

    // ════════════════════════════════════════════════════════════════════════
    // ARTICLE BANNER
    // ════════════════════════════════════════════════════════════════════════
    doc.setFillColor(...NAVY);
    doc.roundedRect(MX, y, CW, 14, 1.5, 1.5, "F");
    doc.setFillColor(...GOLD);
    doc.rect(MX, y, 5, 14, "F");
    doc.roundedRect(MX, y, 5, 14, 1.5, 1.5, "F");

    doc.setTextColor(...WHITE);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text((article.name || article.categoryId || "ARTICLE").toUpperCase(), MX + 10, y + 9.5);

    // Qty badge (top right of banner)
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GOLD);
    doc.text(`TOTAL QTY: ${fmtQty(article.quantity, article.unitOfMeasure)}`, W - MX - 2, y + 5.5, { align: "right" });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`Unit: ${article.unitOfMeasure || "—"}`, W - MX - 2, y + 10.5, { align: "right" });

    y += 20;

    // ════════════════════════════════════════════════════════════════════════
    // ORDER SPECIFICATIONS GRID
    // ════════════════════════════════════════════════════════════════════════
    // Label + divider
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("ORDER SPECIFICATIONS", MX, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MX + 44, y - 1, W - MX, y - 1);
    y += 4;

    const colorLabel = (() => {
      const cb: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
      if (cb.length > 0) return `${cb.length} COLOR(S)`;
      return (article.color && article.color !== "various") ? article.color.toUpperCase() : "—";
    })();

    const specs: [string,string][] = [
      ["Category / Product",  (article.categoryId || "—").toUpperCase()],
      ["Size",                article.size && article.size !== "various" ? article.size.toUpperCase() : "VARIOUS"],
      ["Color",               colorLabel],
      ["Quantity Ordered",    fmtQty(article.quantity, article.unitOfMeasure)],
      ["HS Code",             article.hsCode || "—"],
      ["CBM",                 article.cubicMeasurement != null ? `${article.cubicMeasurement} m³` : "—"],
    ];
    if (article.zipperType) {
      specs.push(["Zipper Type", article.zipperType.toUpperCase()]);
      specs.push(["Slider / Type", `${article.slider || "—"} / ${article.sliderType || "—"}`.toUpperCase()]);
    }
    if (article.specs) specs.push(["Technical Notes", article.specs]);

    // 2-column spec grid
    const specCols = 2;
    const cellW = CW / specCols;
    const cellH = 10;
    specs.forEach((s, i) => {
      const col = i % specCols;
      const row = Math.floor(i / specCols);
      const cx = MX + col * cellW;
      const cy = y + row * cellH;

      if (col % 2 === 0) doc.setFillColor(...BG); else doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.rect(cx, cy, cellW, cellH, "FD");

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(s[0].toUpperCase(), cx + 3, cy + 3.5);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(s[1], cellW - 6);
      doc.text(lines[0], cx + 3, cy + 8);
    });

    const specRows = Math.ceil(specs.length / specCols);
    y += specRows * cellH + 10;

    // ════════════════════════════════════════════════════════════════════════
    // BREAKDOWN TABLES
    // ════════════════════════════════════════════════════════════════════════
    const colorBreakdown: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(article.sizeBreakdown)  ? article.sizeBreakdown  : [];

    const drawTable = (title: string, head: string[][], body: any[][], totalRow: any[]) => {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(title, MX, y);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(MX + title.length * 1.6, y - 1, W - MX, y - 1);
      y += 3;

      body.push(totalRow);

      autoTable(doc, {
        startY: y,
        head,
        body,
        margin: { left: MX, right: MX, bottom: 25 },
        styles: {
          fontSize: 8,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          font: "helvetica",
          textColor: [30, 41, 59],
          lineColor: BORDER,
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: NAVY,
          textColor: WHITE,
          fontSize: 7.5,
          fontStyle: "bold",
          halign: "left",
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = GOLD_LIGHT;
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
        columnStyles: {
          0: { cellWidth: 10, textColor: MUTED, halign: "center" },
          [head[0].length - 1]: { halign: "right", fontStyle: "bold", textColor: NAVY, cellWidth: 40 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    };

    if (colorBreakdown.length > 0) {
      const rows = colorBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.colorCode || "—").toUpperCase(),
        r.description || "—",
        fmtQty(Number(r.rolls || 0), article.unitOfMeasure),
      ]);
      const total = colorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
      drawTable("COLOR BREAKDOWN", [["#", "Color Reference", "Description", "Qty"]], rows, ["", "GRAND TOTAL", "", fmtQty(total, article.unitOfMeasure)]);
    }

    if (sizeBreakdown.length > 0) {
      if (y > H - 60) { doc.addPage(); y = 20; }
      const rows = sizeBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.size || "—").toUpperCase(),
        fmtQty(Number(r.quantity || 0), article.unitOfMeasure),
      ]);
      const total = sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      drawTable("SIZE BREAKDOWN", [["#", "Size", "Qty"]], rows, ["", "GRAND TOTAL", fmtQty(total, article.unitOfMeasure)]);
    }

    if (colorBreakdown.length === 0 && sizeBreakdown.length === 0) {
      const rows = [[
        article.size && article.size !== "various" ? article.size.toUpperCase() : "—",
        article.color ? article.color.toUpperCase() : "—",
        fmtQty(article.quantity, article.unitOfMeasure),
      ]];
      drawTable("ORDER SUMMARY", [["Size", "Color", "Qty"]], rows, ["TOTAL", "", fmtQty(article.quantity, article.unitOfMeasure)]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TERMS & CONDITIONS
    // ════════════════════════════════════════════════════════════════════════
    if (y > H - 80) { doc.addPage(); y = 20; }

    doc.setFillColor(...GOLD_LIGHT);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, y, CW, 22, 1, 1, "FD");
    // Gold left border
    doc.setFillColor(...GOLD);
    doc.rect(MX, y, 3, 22, "F");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("TERMS & CONDITIONS", MX + 7, y + 5.5);

    const terms = [
      "1. Please acknowledge receipt of this Purchase Order within 48 hours.",
      "2. All goods must conform strictly to the specifications listed above.",
      "3. Delivery must be completed within the agreed lead time. Any delays must be communicated immediately.",
      "4. Invoices must reference Purchase Order number: " + ref,
    ];
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 80);
    terms.forEach((t, i) => doc.text(t, MX + 7, y + 10 + i * 3.5));
    y += 28;

    // ════════════════════════════════════════════════════════════════════════
    // SIGNATURE BLOCK
    // ════════════════════════════════════════════════════════════════════════
    if (y > H - 55) { doc.addPage(); y = 20; }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MX, y, W - MX, y);
    y += 6;

    const sigW = (CW - 8) / 2;

    // Supplier box
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MX, y, sigW, 30, 1, 1, "FD");
    doc.setFillColor(...BORDER);
    doc.roundedRect(MX, y, sigW, 6, 1, 1, "F");
    doc.rect(MX, y + 3, sigW, 3, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text("SUPPLIER ACKNOWLEDGEMENT", MX + 4, y + 4.5);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Name: ___________________________", MX + 4, y + 12);
    doc.text("Stamp & Signature:", MX + 4, y + 17);
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(MX + 6, y + 27, MX + sigW - 4, y + 27);
    doc.setLineDashPattern([], 0);

    // LEBTEX box
    const leX = MX + sigW + 8;
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(leX, y, sigW, 30, 1, 1, "FD");
    doc.setFillColor(...NAVY);
    doc.roundedRect(leX, y, sigW, 6, 1, 1, "F");
    doc.rect(leX, y + 3, sigW, 3, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("ISSUED BY LEBTEX TEXTILE IMPORT", leX + 4, y + 4.5);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Purchasing & Logistics Department", leX + 4, y + 12);
    doc.text("Authorized Signature:", leX + 4, y + 17);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(leX + 6, y + 27, leX + sigW - 4, y + 27);

    // ════════════════════════════════════════════════════════════════════════
    // FOOTER (all pages)
    // ════════════════════════════════════════════════════════════════════════
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);

      // Thin gold separator
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(MX, H - 18, W - MX, H - 18);

      doc.setFontSize(6.3);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca, Morocco", W / 2, H - 14.5, { align: "center" });
      doc.text("Tel: +212 6 61 10 15 60  |  Email: Contact.lebtex@gmail.com  |  Tax ID: 34011181  |  ICE: 003823212000094", W / 2, H - 11, { align: "center" });

      doc.setFillColor(...NAVY);
      doc.rect(0, H - 8, W, 8, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, H - 8, 4, 8, "F");

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`Purchase Order  |  ${ref}  |  ${todayStr}  |  CONFIDENTIAL`, MX + 5, H - 3.5);
      doc.text(`Page ${i} / ${pages}`, W - MX, H - 3.5, { align: "right" });
    }

    const name = (article.name || article.categoryId || "PO").replace(/\s+/g, "_").toUpperCase();
    doc.save(`PO-LEBTEX-${name}-${todayStr}.pdf`);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      className="h-8 w-8 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors border border-transparent hover:border-stone-200"
      title="Export Purchase Order (PDF)"
    >
      <FileDown className="w-4 h-4" />
    </Button>
  );
}
