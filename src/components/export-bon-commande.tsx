
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportBonCommandeProps {
  article: any;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "URGENT",
  important: "IMPORTANT",
  todo: "À FAIRE",
};

// Lebtex Branding Colors
const LEBTEX_NAVY = [18, 33, 49] as [number, number, number];    // #122131
const LEBTEX_GOLD = [196, 160, 98] as [number, number, number];  // #C4A062
const LEBTEX_WHITE = [255, 255, 255] as [number, number, number];
const LEBTEX_LIGHT = [245, 247, 249] as [number, number, number];
const LEBTEX_MID = [100, 110, 120] as [number, number, number];

function formatQty(qty: number, unit: string) {
  return `${Number(qty).toLocaleString("fr-FR")} ${unit || ""}`.trim();
}

function formatPrice(price: number | string | undefined) {
  if (price === undefined || price === "" || price === null) return "-";
  const n = Number(price);
  if (isNaN(n) || n === 0) return "-";
  return `$${n.toFixed(4)}`;
}

function formatTotal(qty: number, price: number | string | undefined) {
  if (price === undefined || price === "" || price === null) return "-";
  const p = Number(price);
  const q = Number(qty);
  if (isNaN(p) || isNaN(q) || p === 0) return "-";
  return `$${(p * q).toFixed(2)}`;
}

export default function ExportBonCommande({ article }: ExportBonCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const today = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // ── Header principal ──────────────────────────────────────────────────────
    doc.setFillColor(...LEBTEX_NAVY);
    doc.rect(0, 0, pageW, 42, "F");

    // Barre accent gold
    doc.setFillColor(...LEBTEX_GOLD);
    doc.rect(0, 0, 5, 42, "F");

    // Logo Text or Image
    const tryAddLogo = () => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = '/logo.png';
        img.onload = () => {
          // Add logo image if exists
          doc.addImage(img, 'PNG', marginX + 4, 8, 30, 15);
          resolve();
        };
        img.onerror = () => {
          // Fallback to text logo if image fails
          doc.setTextColor(...LEBTEX_WHITE);
          doc.setFontSize(22);
          doc.setFont("helvetica", "bold");
          doc.text("LEBTEX", marginX + 4, 18);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...LEBTEX_GOLD);
          doc.text("TEXTILE IMPORT", marginX + 4, 25);
          resolve();
        };
      });
    };

    await tryAddLogo();

    // Bon de Commande Title
    doc.setTextColor(...LEBTEX_WHITE);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BON DE COMMANDE", pageW - marginX - 2, 16, { align: "right" });

    // Date + ref
    doc.setTextColor(180, 190, 200);
    doc.setFontSize(7.5);
    const ref = `BC-${Date.now().toString().slice(-6)}`;
    doc.text(`Réf : ${ref}`, pageW - marginX - 2, 23, { align: "right" });
    doc.text(`Émis le : ${today}`, pageW - marginX - 2, 28, { align: "right" });

    // Supplier info
    const supplier = (article.supplierId || "NON SPÉCIFIÉ").toUpperCase();
    doc.setTextColor(...LEBTEX_WHITE);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(supplier, pageW - marginX - 2, 36, { align: "right" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LEBTEX_GOLD);
    doc.text("FOURNISSEUR", pageW - marginX - 2, 39, { align: "right" });

    let yPos = 55;

    // ── Détails Article ─────────────────────────────────────────────────────
    doc.setFillColor(...LEBTEX_NAVY);
    doc.roundedRect(marginX, yPos, pageW - marginX * 2, 10, 2, 2, "F");
    doc.setTextColor(...LEBTEX_WHITE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("DÉTAILS DE LA COMMANDE", marginX + 4, yPos + 6.5);

    yPos += 15;

    const prio = article.priority || "todo";
    const prioLabel = PRIORITY_LABEL[prio] || "-";

    // Description complète
    let desc = article.name || "-";
    if (article.size) desc += `\nTaille: ${article.size}`;
    if (article.zipperType) desc += `  |  ${article.zipperType}`;
    if (article.slider) desc += ` / Curseur: ${article.slider}`;
    if (article.sliderType) desc += ` (${article.sliderType})`;
    if (article.specs) desc += `\nNote: ${article.specs}`;
    if (article.isPreorder && article.clientName) desc += `\n[Précommande: ${article.clientName}]`;

    const tableBody = [[
      prioLabel,
      desc,
      article.color || "-",
      formatQty(article.quantity, article.unitOfMeasure),
      formatPrice(article.purchasePricePerUnit),
      formatTotal(article.quantity, article.purchasePricePerUnit),
    ]];

    autoTable(doc, {
      startY: yPos,
      head: [["PRIORITÉ", "ARTICLE / DESCRIPTION", "COULEUR", "QUANTITÉ", "P.U ($)", "TOTAL ($)"]],
      body: tableBody,
      margin: { left: marginX, right: marginX },
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        font: "helvetica",
        textColor: [18, 33, 49],
        lineColor: [220, 225, 230],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [240, 242, 245],
        textColor: LEBTEX_MID,
        fontSize: 7,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 20, fontStyle: "bold" },
        1: { cellWidth: "auto" },
        2: { halign: "center", cellWidth: 25 },
        3: { halign: "center", cellWidth: 25 },
        4: { halign: "right", cellWidth: 25 },
        5: { halign: "right", cellWidth: 25, fontStyle: "bold" },
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.section === "body") {
          const val = String(data.cell.raw || "");
          if (val === "URGENT") {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fillColor = [254, 242, 242];
          } else if (val === "IMPORTANT") {
            data.cell.styles.textColor = [180, 83, 9];
            data.cell.styles.fillColor = [255, 251, 235];
          }
        }
      },
    });

    // @ts-ignore
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // ── Total ──────────────────────────────────────────────────────────────
    const total = Number(article.quantity) * Number(article.purchasePricePerUnit || 0);

    doc.setFillColor(...LEBTEX_NAVY);
    doc.roundedRect(pageW - marginX - 70, yPos, 70, 15, 2, 2, "F");
    doc.setFillColor(...LEBTEX_GOLD);
    doc.rect(pageW - marginX - 70, yPos, 3, 15, "F");

    doc.setTextColor(...LEBTEX_WHITE);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("TOTAL À PAYER", pageW - marginX - 62, yPos + 6);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...LEBTEX_GOLD);
    doc.text(`$${total.toFixed(2)}`, pageW - marginX - 5, yPos + 10.5, { align: "right" });

    yPos += 30;

    // ── Notes & Conditions ────────────────────────────────────────────────
    doc.setDrawColor(...LEBTEX_GOLD);
    doc.setLineWidth(0.5);
    doc.line(marginX, yPos, pageW - marginX, yPos);
    yPos += 10;
    doc.setTextColor(...LEBTEX_MID);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Ce document est un bon de commande officiel de LEBTEX TEXTILE IMPORT. Merci de confirmer la réception.", marginX, yPos);

    // ── Footer ─────────────────────────────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    doc.setFontSize(7);
    doc.setTextColor(180, 190, 200);
    doc.text(`PI-${ref} · Généré le ${todayStr}`, marginX, 285);
    doc.text(`LEBTEX TEXTILE IMPORT · Document système`, pageW - marginX, 285, { align: "right" });

    // ── Export ─────────────────────────────────────────────────────────────
    const fileName = `LEBTEX-${supplier}-${article.name}-${todayStr}.pdf`.replace(/\s+/g, "_");
    doc.save(fileName);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      className="h-7 w-7 text-stone-300 hover:text-[#122131] hover:bg-[#C4A062]/10 rounded-lg"
      title="Exporter PDF (Branding Lebtex)"
    >
      <Send className="w-3.5 h-3.5" />
    </Button>
  );
}
