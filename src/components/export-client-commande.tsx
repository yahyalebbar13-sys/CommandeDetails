"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportClientCommandeProps { article: any; }

// ── Brand ────────────────────────────────────────────────────────────────────
const NAVY:       [number,number,number] = [15, 23, 42];
const GOLD:       [number,number,number] = [196, 160, 98];
const WHITE:      [number,number,number] = [255, 255, 255];
const MUTED:      [number,number,number] = [100, 116, 139];
const BORDER:     [number,number,number] = [226, 232, 240];
const BG:         [number,number,number] = [248, 250, 252];
const GOLD_LIGHT: [number,number,number] = [254, 249, 240];

function fmtNum(n: number) {
  if (n == null || isNaN(n)) return "0";
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function fmtQty(qty: number, unit: string) {
  return `${fmtNum(Number(qty))} ${unit || ""}`.trim();
}

export default function ExportClientCommande({ article }: ExportClientCommandeProps) {
  const handleExport = async () => {
    if (!article) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const MX = 15;
    const CW = W - MX * 2;

    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const todayStr = new Date().toISOString().slice(0, 10);
    const ref = `CC-LBX-${Date.now().toString().slice(-8)}`;
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
      const drawBg = () => {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(7, 3, 38, 22, 2, 2, "F");
      };
      
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => { drawBg(); doc.addImage(img, "PNG", 10, 6, 32, 16); resolve(); };
      img.onerror = () => {
        drawBg();
        doc.setTextColor(15, 23, 42);
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
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CONFIRMATION DE COMMANDE", W - MX, 18, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GOLD);
    doc.text(`Réf: ${ref}`, W - MX, 26, { align: "right" });
    doc.setTextColor(148, 163, 184);
    doc.text(`Date: ${today}`, W - MX, 31, { align: "right" });

    y = 44;

    // ════════════════════════════════════════════════════════════════════════
    // FROM / TO BLOCK
    // ════════════════════════════════════════════════════════════════════════
    const colW = (CW - 6) / 2;

    // FROM — LEBTEX (left)
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, y, colW, 34, 1, 1, "FD");
    doc.setFillColor(...GOLD);
    doc.roundedRect(MX, y, colW, 6, 1, 1, "F");
    doc.rect(MX, y + 3, colW, 3, "F");
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("ÉMETTEUR", MX + 4, y + 4.5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("LEBTEX TEXTILE IMPORT", MX + 4, y + 12);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("31 Rue 65, Lot. Al Hamd Ain-Chock", MX + 4, y + 17);
    doc.text("Casablanca, Maroc", MX + 4, y + 21.5);
    doc.text("Tél : +212 6 61 10 15 60", MX + 4, y + 26);
    doc.text("Contact.lebtex@gmail.com", MX + 4, y + 30);

    // TO — Client (right)
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
    doc.text("CLIENT", toX + 4, y + 4.5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text((article.clientName || "NOM DU CLIENT").toUpperCase(), toX + 4, y + 12);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(article.clientAddress  || "Adresse : ________________________", toX + 4, y + 17);
    doc.text(article.clientCity     || "Ville / Pays : ____________________", toX + 4, y + 21.5);
    doc.text(article.clientTel      || "Tél : _____________________________", toX + 4, y + 26);
    doc.text(article.clientEmail    || "Email : ___________________________", toX + 4, y + 30);

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

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GOLD);
    doc.text(`QTÉ TOTALE : ${fmtQty(article.quantity, article.unitOfMeasure)}`, W - MX - 2, y + 5.5, { align: "right" });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`Unité : ${article.unitOfMeasure || "—"}`, W - MX - 2, y + 10.5, { align: "right" });

    y += 20;

    // ════════════════════════════════════════════════════════════════════════
    // SPÉCIFICATIONS
    // ════════════════════════════════════════════════════════════════════════
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("SPÉCIFICATIONS DE LA COMMANDE", MX, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MX + 65, y - 1, W - MX, y - 1);
    y += 4;

    const colorLabel = (() => {
      const cb: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
      if (cb.length > 0) return `${cb.length} COULEUR(S)`;
      return (article.color && article.color !== "various") ? article.color.toUpperCase() : "—";
    })();

    const specs: [string, string][] = [
      ["Désignation / Catégorie", (article.categoryId || "—").toUpperCase()],
      ["Taille",                  article.size && article.size !== "various" ? article.size.toUpperCase() : "DIVERSES"],
      ["Couleur",                 colorLabel],
      ["Quantité commandée",      fmtQty(article.quantity, article.unitOfMeasure)],
      ["Date de commande",        article.orderDate || todayStr],
      ["Date d'arrivée estimée",  article.arrivalDate || "À confirmer"],
    ];
    if (article.zipperType) {
      specs.push(["Type Fermeture", article.zipperType.toUpperCase()]);
      specs.push(["Curseur / Type", `${article.slider || "—"} / ${article.sliderType || "—"}`.toUpperCase()]);
    }
    if (article.specs) specs.push(["Notes Techniques", article.specs]);

    // 2-column spec grid
    const cellW = CW / 2;
    const cellH = 10;
    specs.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
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

    y += Math.ceil(specs.length / 2) * cellH + 10;

    // ════════════════════════════════════════════════════════════════════════
    // TABLEAUX DE DÉTAIL
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
      doc.line(MX + title.length * 1.55, y - 1, W - MX, y - 1);
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
      drawTable("DÉTAIL PAR COULEUR", [["#", "Référence Couleur", "Description", "Quantité"]], rows, ["", "TOTAL GÉNÉRAL", "", fmtQty(total, article.unitOfMeasure)]);
    }

    if (sizeBreakdown.length > 0) {
      if (y > H - 60) { doc.addPage(); y = 20; }
      const rows = sizeBreakdown.map((r: any, i: number) => [
        String(i + 1),
        (r.size || "—").toUpperCase(),
        fmtQty(Number(r.quantity || 0), article.unitOfMeasure),
      ]);
      const total = sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      drawTable("DÉTAIL PAR TAILLE", [["#", "Taille", "Quantité"]], rows, ["", "TOTAL GÉNÉRAL", fmtQty(total, article.unitOfMeasure)]);
    }

    if (colorBreakdown.length === 0 && sizeBreakdown.length === 0) {
      const rows = [[
        article.size && article.size !== "various" ? article.size.toUpperCase() : "—",
        article.color ? article.color.toUpperCase() : "—",
        fmtQty(article.quantity, article.unitOfMeasure),
      ]];
      drawTable("RÉCAPITULATIF DE LA COMMANDE", [["Taille", "Couleur", "Quantité"]], rows, ["TOTAL", "", fmtQty(article.quantity, article.unitOfMeasure)]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONDITIONS DE VENTE
    // ════════════════════════════════════════════════════════════════════════
    if (y > H - 80) { doc.addPage(); y = 20; }

    doc.setFillColor(...GOLD_LIGHT);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, y, CW, 28, 1, 1, "FD");
    doc.setFillColor(...GOLD);
    doc.rect(MX, y, 3, 28, "F");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("CONDITIONS DE VENTE", MX + 7, y + 5.5);

    const terms = [
      "1. Toute commande validée accompagnée d'un acompte est ferme, définitive, non annulable et non remboursable.",
      "2. Conditions de paiement : solde intégral exigible à la livraison ou à réception de la marchandise.",
      "3. Les délais d'arrivée sont donnés à titre indicatif et peuvent varier selon les conditions d'importation.",
      "4. Toute réclamation relative à la qualité ou aux quantités doit être formulée dans les 48h suivant la livraison.",
    ];
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 80);
    terms.forEach((t, i) => doc.text(t, MX + 7, y + 10 + i * 4));
    y += 34;

    // ════════════════════════════════════════════════════════════════════════
    // BLOC SIGNATURES
    // ════════════════════════════════════════════════════════════════════════
    if (y > H - 55) { doc.addPage(); y = 20; }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MX, y, W - MX, y);
    y += 6;

    const sigW = (CW - 8) / 2;

    // LEBTEX box (left)
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MX, y, sigW, 30, 1, 1, "FD");
    doc.setFillColor(...NAVY);
    doc.roundedRect(MX, y, sigW, 6, 1, 1, "F");
    doc.rect(MX, y + 3, sigW, 3, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("ÉMIS PAR LEBTEX TEXTILE IMPORT", MX + 4, y + 4.5);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Service Commercial", MX + 4, y + 12);
    doc.text("Cachet et signature :", MX + 4, y + 17);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MX + 6, y + 27, MX + sigW - 4, y + 27);

    // Client box (right)
    const clX = MX + sigW + 8;
    doc.setFillColor(...BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(clX, y, sigW, 30, 1, 1, "FD");
    doc.setFillColor(...BORDER);
    doc.roundedRect(clX, y, sigW, 6, 1, 1, "F");
    doc.rect(clX, y + 3, sigW, 3, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text("BON POUR ACCORD — CLIENT", clX + 4, y + 4.5);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Nom : ___________________________", clX + 4, y + 12);
    doc.text("Lu et approuvé (cachet & signature) :", clX + 4, y + 17);
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(clX + 6, y + 27, clX + sigW - 4, y + 27);
    doc.setLineDashPattern([], 0);

    // ════════════════════════════════════════════════════════════════════════
    // FOOTER (toutes les pages)
    // ════════════════════════════════════════════════════════════════════════
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);

      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(MX, H - 18, W - MX, H - 18);

      doc.setFontSize(6.3);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca, Maroc", W / 2, H - 14.5, { align: "center" });
      doc.text("Tél : +212 6 61 10 15 60  |  Email : Contact.lebtex@gmail.com  |  Patente : 34011181  |  ICE : 003823212000094", W / 2, H - 11, { align: "center" });

      doc.setFillColor(...NAVY);
      doc.rect(0, H - 8, W, 8, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, H - 8, 4, 8, "F");

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`Confirmation de Commande  |  ${ref}  |  ${todayStr}  |  CONFIDENTIEL`, MX + 5, H - 3.5);
      doc.text(`Page ${i} / ${pages}`, W - MX, H - 3.5, { align: "right" });
    }

    const name = (article.name || article.categoryId || "CMD").replace(/\s+/g, "_").toUpperCase();
    doc.save(`CONF-CLIENT-LEBTEX-${name}-${todayStr}.pdf`);
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
