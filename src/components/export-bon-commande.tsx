
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportBonCommandeProps {
  article: any;
}

// ── Lebtex Brand Colors ──────────────────────────────────────────────────────
const NAVY  = [18, 33, 49]    as [number, number, number];
const GOLD  = [196, 160, 98]  as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];
const LIGHT = [245, 247, 249] as [number, number, number];
const MID   = [100, 110, 120] as [number, number, number];
const DARK  = [30, 42, 55]    as [number, number, number];
const GREEN = [16, 185, 129]  as [number, number, number];
const TEAL  = [20, 184, 166]  as [number, number, number];
const VIOLET= [124, 58, 237]  as [number, number, number];

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "⚡ URGENT",
  important: "▲ IMPORTANT",
  todo: "→ STANDARD",
};

const PRIORITY_COLORS: Record<string, [number, number, number]> = {
  urgent:    [220, 38, 38],
  important: [180, 83, 9],
  todo:      [60, 70, 80],
};

function fmt(n: number | string | undefined, decimals = 2) {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtQty(qty: number, unit: string) {
  return `${Number(qty).toLocaleString("fr-FR")} ${unit || ""}`.trim();
}

// Draw a section heading bar
function sectionBar(doc: jsPDF, y: number, label: string, color: [number,number,number], pageW: number, marginX: number) {
  doc.setFillColor(...color);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 8, 1.5, 1.5, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text(label.toUpperCase(), marginX + 4, y + 5.5);
  return y + 12;
}

// Small label + value pair inside a box
function infoBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, valColor: [number,number,number] = DARK) {
  doc.setFillColor(...LIGHT);
  doc.roundedRect(x, y, w, h, 1, 1, "F");
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID);
  doc.text(label.toUpperCase(), x + 3, y + 4);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...valColor);
  const lines = doc.splitTextToSize(value, w - 6);
  doc.text(lines[0] || "—", x + 3, y + 9.5);
}

export default function ExportBonCommande({ article }: ExportBonCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const contentW = pageW - marginX * 2;

    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const todayStr = new Date().toISOString().slice(0, 10);
    const ref = `BC-${Date.now().toString().slice(-8)}`;
    const supplier = (article.supplierId || "NON SPÉCIFIÉ").toUpperCase();
    const prio = article.priority || "todo";

    // ── HEADER ───────────────────────────────────────────────────────────────
    // Navy background
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 50, "F");

    // Gold left accent bar
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, 5, 50, "F");

    // Thin gold bottom border
    doc.setFillColor(...GOLD);
    doc.rect(0, 50, pageW, 0.8, "F");

    // Try logo
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => { doc.addImage(img, "PNG", marginX + 4, 10, 28, 14); resolve(); };
      img.onerror = () => {
        doc.setTextColor(...WHITE);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text("LEBTEX", marginX + 4, 22);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GOLD);
        doc.text("TEXTILE IMPORT", marginX + 4, 28);
        resolve();
      };
    });

    // Title block (right-aligned)
    doc.setTextColor(...WHITE);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("BON DE COMMANDE", pageW - marginX, 17, { align: "right" });

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 190, 200);
    doc.text(`Réf. : ${ref}`, pageW - marginX, 24, { align: "right" });
    doc.text(`Émis le : ${today}`, pageW - marginX, 29.5, { align: "right" });

    // Supplier pill
    doc.setFillColor(40, 55, 75);
    doc.roundedRect(pageW - marginX - 80, 33, 80, 13, 2, 2, "F");
    doc.setTextColor(...GOLD);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("FOURNISSEUR", pageW - marginX - 5, 38.5, { align: "right" });
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.text(supplier, pageW - marginX - 5, 43.5, { align: "right" });

    // Priority badge
    const prioLabel = PRIORITY_LABEL[prio] || "→ STANDARD";
    const prioColor = PRIORITY_COLORS[prio] || DARK;
    doc.setFillColor(...prioColor);
    doc.roundedRect(marginX + 4, 33, 38, 10, 2, 2, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(prioLabel, marginX + 4 + 19, 39.5, { align: "center" });

    let yPos = 58;

    // ── ARTICLE IDENTITY BLOCK ────────────────────────────────────────────────
    // Big article name
    doc.setFillColor(...NAVY);
    doc.roundedRect(marginX, yPos, contentW, 14, 2, 2, "F");
    doc.setFillColor(...GOLD);
    doc.rect(marginX, yPos, 3, 14, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const articleName = (article.name || "—").toUpperCase();
    doc.text(articleName, marginX + 8, yPos + 9.5);

    // Client preorder badge
    if (article.isPreorder && article.clientName) {
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(pageW - marginX - 55, yPos + 3, 52, 8, 2, 2, "F");
      doc.setTextColor(...WHITE);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text(`CLIENT : ${(article.clientName).toUpperCase()}`, pageW - marginX - 54 + 26, yPos + 7.8, { align: "center" });
    }

    yPos += 19;

    // ── INFO GRID (4 boxes) ───────────────────────────────────────────────────
    const boxH = 16;
    const gap = 2.5;
    const boxW4 = (contentW - gap * 3) / 4;

    infoBox(doc, marginX,                       yPos, boxW4, boxH, "Catégorie",   (article.categoryId || "—").toUpperCase(), NAVY);
    infoBox(doc, marginX + (boxW4 + gap),       yPos, boxW4, boxH, "Taille",      article.size && article.size !== "various" ? article.size.toUpperCase() : "VARIOUS");
    infoBox(doc, marginX + (boxW4 + gap) * 2,   yPos, boxW4, boxH, "Couleur",     (!article.colorBreakdown?.length && article.color) ? article.color.toUpperCase() : (article.colorBreakdown?.length ? `${article.colorBreakdown.length} COULEURS` : "—"));
    infoBox(doc, marginX + (boxW4 + gap) * 3,   yPos, boxW4, boxH, "Quantité Totale", fmtQty(article.quantity, article.unitOfMeasure), [16, 185, 129]);

    yPos += boxH + gap;

    const boxW2 = (contentW - gap) / 2;
    infoBox(doc, marginX,           yPos, boxW2, boxH, "Prix Unitaire (USD)", article.purchasePricePerUnit ? `$${fmt(article.purchasePricePerUnit, 4)}` : "—");
    infoBox(doc, marginX + boxW2 + gap, yPos, boxW2, boxH, "Montant Total (USD)",
      article.purchasePricePerUnit ? `$${fmt(Number(article.quantity) * Number(article.purchasePricePerUnit), 2)}` : "—",
      [196, 160, 98]);

    yPos += boxH + gap;

    // Specs / Zipper info
    if (article.zipperType || article.slider || article.specs) {
      const boxW3 = (contentW - gap * 2) / 3;
      if (article.zipperType) {
        infoBox(doc, marginX,                 yPos, boxW3, boxH, "Type Fermeture", article.zipperType.toUpperCase());
        infoBox(doc, marginX + boxW3 + gap,   yPos, boxW3, boxH, "Curseur (Slider)", (article.slider || "—").toUpperCase());
        infoBox(doc, marginX + (boxW3 + gap)*2, yPos, boxW3, boxH, "Type Slider",   (article.sliderType || "—").toUpperCase());
        yPos += boxH + gap;
      } else if (article.specs) {
        infoBox(doc, marginX, yPos, contentW, boxH, "Spécifications / Notes", article.specs);
        yPos += boxH + gap;
      }
    }

    yPos += 4;

    // ── COLOR BREAKDOWN TABLE ─────────────────────────────────────────────────
    const colorBreakdown: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
    if (colorBreakdown.length > 0) {
      yPos = sectionBar(doc, yPos, `🎨  Détail Couleurs — ${colorBreakdown.length} référence(s)`, VIOLET, pageW, marginX);

      const colorRows = colorBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.colorCode || "—").toUpperCase(),
        Number(r.rolls || 0).toLocaleString("fr-FR"),
        article.unitOfMeasure || "u",
        article.purchasePricePerUnit ? `$${fmt(article.purchasePricePerUnit, 4)}` : "—",
        article.purchasePricePerUnit ? `$${fmt(Number(r.rolls || 0) * Number(article.purchasePricePerUnit), 2)}` : "—",
      ]);

      const totalRolls = colorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
      const totalColorValue = article.purchasePricePerUnit
        ? totalRolls * Number(article.purchasePricePerUnit)
        : 0;

      // Add a totals row
      colorRows.push(["", "TOTAL", totalRolls.toLocaleString("fr-FR"), article.unitOfMeasure || "u", "", article.purchasePricePerUnit ? `$${fmt(totalColorValue, 2)}` : "—"]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Réf. Couleur", "Quantité", "Unité", "P.U. ($)", "Sous-Total ($)"]],
        body: colorRows,
        margin: { left: marginX, right: marginX },
        styles: { fontSize: 8, cellPadding: 3.5, font: "helvetica", textColor: DARK, lineColor: [220, 225, 235], lineWidth: 0.15 },
        headStyles: { fillColor: VIOLET, textColor: WHITE, fontSize: 7, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", cellWidth: 10, textColor: MID },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 28 },
          3: { halign: "center", cellWidth: 18, textColor: MID },
          4: { halign: "right", cellWidth: 28, textColor: MID },
          5: { halign: "right", cellWidth: 32, fontStyle: "bold" },
        },
        didParseCell: (data) => {
          // Last row = totals
          if (data.row.index === colorRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [237, 233, 254]; // violet-100
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = VIOLET;
          }
          // Alternating rows
          else if (data.row.index % 2 === 1 && data.section === "body") {
            data.cell.styles.fillColor = [249, 246, 255];
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── SIZE BREAKDOWN TABLE ──────────────────────────────────────────────────
    const sizeBreakdown: any[] = Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : [];
    if (sizeBreakdown.length > 0) {
      yPos = sectionBar(doc, yPos, `📐  Détail Tailles — ${sizeBreakdown.length} taille(s)`, TEAL, pageW, marginX);

      const sizeRows = sizeBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.size || "—").toUpperCase(),
        Number(r.quantity || 0).toLocaleString("fr-FR"),
        article.unitOfMeasure || "u",
        article.purchasePricePerUnit ? `$${fmt(article.purchasePricePerUnit, 4)}` : "—",
        article.purchasePricePerUnit ? `$${fmt(Number(r.quantity || 0) * Number(article.purchasePricePerUnit), 2)}` : "—",
      ]);

      const totalSizeQty = sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      const totalSizeValue = article.purchasePricePerUnit
        ? totalSizeQty * Number(article.purchasePricePerUnit)
        : 0;

      sizeRows.push(["", "TOTAL", totalSizeQty.toLocaleString("fr-FR"), article.unitOfMeasure || "u", "", article.purchasePricePerUnit ? `$${fmt(totalSizeValue, 2)}` : "—"]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Taille", "Quantité", "Unité", "P.U. ($)", "Sous-Total ($)"]],
        body: sizeRows,
        margin: { left: marginX, right: marginX },
        styles: { fontSize: 8, cellPadding: 3.5, font: "helvetica", textColor: DARK, lineColor: [220, 235, 230], lineWidth: 0.15 },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontSize: 7, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", cellWidth: 10, textColor: MID },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { halign: "right", cellWidth: 28 },
          3: { halign: "center", cellWidth: 18, textColor: MID },
          4: { halign: "right", cellWidth: 28, textColor: MID },
          5: { halign: "right", cellWidth: 32, fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.row.index === sizeRows.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [204, 251, 241]; // teal-100
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [15, 118, 110]; // teal-700
          } else if (data.row.index % 2 === 1 && data.section === "body") {
            data.cell.styles.fillColor = [240, 253, 250];
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── If NO breakdown: single summary table ─────────────────────────────────
    if (colorBreakdown.length === 0 && sizeBreakdown.length === 0) {
      yPos = sectionBar(doc, yPos, "📦  Récapitulatif Commande", NAVY, pageW, marginX);

      const singleRow = [[
        article.size && article.size !== "various" ? article.size.toUpperCase() : "—",
        (!article.colorBreakdown?.length && article.color) ? article.color.toUpperCase() : "—",
        fmtQty(article.quantity, article.unitOfMeasure),
        article.purchasePricePerUnit ? `$${fmt(article.purchasePricePerUnit, 4)}` : "—",
        article.purchasePricePerUnit ? `$${fmt(Number(article.quantity) * Number(article.purchasePricePerUnit), 2)}` : "—",
      ]];

      autoTable(doc, {
        startY: yPos,
        head: [["Taille", "Couleur", "Quantité", "P.U. ($)", "Montant Total ($)"]],
        body: singleRow,
        margin: { left: marginX, right: marginX },
        styles: { fontSize: 9, cellPadding: 5, font: "helvetica", textColor: DARK },
        headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", fontStyle: "bold" },
          1: { halign: "center", fontStyle: "bold" },
          2: { halign: "right" },
          3: { halign: "right", textColor: MID },
          4: { halign: "right", fontStyle: "bold", textColor: [16, 100, 60] },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 6;
    }

    yPos += 4;

    // ── GRAND TOTAL BOX ───────────────────────────────────────────────────────
    const grandTotal = Number(article.quantity) * Number(article.purchasePricePerUnit || 0);

    // Right-aligned total block
    const totalBoxW = 90;
    const totalBoxX = pageW - marginX - totalBoxW;

    doc.setFillColor(...NAVY);
    doc.roundedRect(totalBoxX, yPos, totalBoxW, 18, 2.5, 2.5, "F");
    doc.setFillColor(...GOLD);
    doc.rect(totalBoxX, yPos, 4, 18, "F");

    doc.setTextColor(...GOLD);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL GÉNÉRAL (USD)", totalBoxX + 8, yPos + 7);

    doc.setTextColor(...WHITE);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`$${grandTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageW - marginX - 4, yPos + 14, { align: "right" });

    yPos += 26;

    // ── DELIVERY & NOTES BLOCK ────────────────────────────────────────────────
    // Only if we have room, otherwise skip
    if (yPos < pageH - 50) {
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(marginX, yPos, pageW - marginX, yPos);
      yPos += 8;

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text("CONDITIONS & NOTES", marginX, yPos);
      yPos += 5;

      const notes = [
        "• Ce bon de commande constitue un engagement ferme de notre part.",
        "• Merci de nous confirmer la réception et la disponibilité des articles dans les plus brefs délais.",
        "• Délai de livraison souhaité : à confirmer avec le service logistique.",
        article.isPreorder && article.clientName ? `• Article réservé pour client : ${article.clientName}` : null,
        article.specs ? `• Spécifications supplémentaires : ${article.specs}` : null,
      ].filter(Boolean) as string[];

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MID);
      notes.forEach(line => {
        doc.text(line!, marginX + 2, yPos);
        yPos += 5;
      });
    }

    // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
    if (yPos < pageH - 35) {
      yPos += 6;
      const sigBoxW = (contentW - 10) / 2;

      doc.setFillColor(...LIGHT);
      doc.roundedRect(marginX, yPos, sigBoxW, 22, 2, 2, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MID);
      doc.text("ÉMIS PAR — LEBTEX TEXTILE IMPORT", marginX + 4, yPos + 5);
      doc.setFont("helvetica", "normal");
      doc.text("Service Achats & Logistique", marginX + 4, yPos + 10);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.3);
      doc.line(marginX + 4, yPos + 19, marginX + sigBoxW - 10, yPos + 19);
      doc.setFontSize(6);
      doc.setTextColor(180, 190, 200);
      doc.text("Signature & Cachet", marginX + 4, yPos + 22);

      doc.setFillColor(...LIGHT);
      doc.roundedRect(marginX + sigBoxW + 10, yPos, sigBoxW, 22, 2, 2, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MID);
      doc.text("ACCUSÉ DE RÉCEPTION — FOURNISSEUR", marginX + sigBoxW + 14, yPos + 5);
      doc.setFont("helvetica", "normal");
      doc.text(supplier, marginX + sigBoxW + 14, yPos + 10);
      doc.setDrawColor(...GOLD);
      doc.line(marginX + sigBoxW + 14, yPos + 19, marginX + contentW - 4, yPos + 19);
      doc.setFontSize(6);
      doc.setTextColor(180, 190, 200);
      doc.text("Signature & Cachet", marginX + sigBoxW + 14, yPos + 22);
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 5, 10, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 175, 190);
    doc.text(`Réf. ${ref} · Généré le ${todayStr} · Document Officiel LEBTEX TEXTILE IMPORT`, marginX + 4, pageH - 4);
    doc.text(`Page 1`, pageW - marginX, pageH - 4, { align: "right" });

    // ── SAVE ─────────────────────────────────────────────────────────────────
    const fileName = `BC-LEBTEX-${supplier}-${(article.name || "article").replace(/\s+/g, "_").toUpperCase()}-${todayStr}.pdf`;
    doc.save(fileName);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      className="h-7 w-7 text-stone-300 hover:text-[#122131] hover:bg-[#C4A062]/20 rounded-lg transition-colors"
      title="Exporter Bon de Commande PDF"
    >
      <Send className="w-3.5 h-3.5" />
    </Button>
  );
}
