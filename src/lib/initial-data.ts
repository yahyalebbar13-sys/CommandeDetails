import { Order, Facture } from './types';

export const initialOrders: Order[] = [
  // ================== VISOR & TAG PINS ==================
  { category: "Visor for Cap", article: "Visor for Cap 2.8*72*182mm", specs: "20pcs/bundle", color: "WHITE", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 110, unit: "ctn", pa: 0.452, cbm: 3.20 },
  { category: "Visor for Cap", article: "Visor for Cap 2.8*72*182mm", specs: "20pcs/bundle", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 991, unit: "ctn", pa: 0.421, cbm: 28.50 },
  { category: "Tag Pin", article: "TAG PIN 35mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 360, unit: "box", pa: 0.437, cbm: 1.10 },
  { category: "Tag Pin", article: "TAG PIN 40mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 360, unit: "box", pa: 0.437, cbm: 1.15 },
  { category: "Tag Pin", article: "TAG PIN 45mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 360, unit: "box", pa: 0.437, cbm: 1.20 },
  { category: "Tag Pin", article: "TAG PIN 15mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 800, unit: "box", pa: 0.45, cbm: 2.10 },
  { category: "Tag Pin", article: "TAG PIN 25mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-21", arrivalDate: "2026-01-05", qty: 800, unit: "box", pa: 0.45, cbm: 2.20 },

  // ================== PACKAGING ==================
  { category: "Packaging", article: "OPP BAG 25*36+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 150, unit: "ctn", pa: 1.29, cbm: 4.50 },
  { category: "Packaging", article: "OPP BAG 28*41+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 200, unit: "ctn", pa: 1.29, cbm: 6.20 },
  { category: "Packaging", article: "OPP BAG 30*41+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 150, unit: "ctn", pa: 1.29, cbm: 4.80 },
  { category: "Packaging", article: "OPP BAG 32*46+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 200, unit: "ctn", pa: 1.29, cbm: 6.80 },
  { category: "Packaging", article: "OPP BAG 35*46+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 50, unit: "ctn", pa: 1.29, cbm: 1.80 },
  { category: "Packaging", article: "OPP BAG 40*60+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 50, unit: "ctn", pa: 1.29, cbm: 2.10 },

  // ================== HOOK & LOOP ==================
  { category: "Hook & Loop", article: "Loop 50MM QUALITY C", specs: "25p.y/roll", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-13", arrivalDate: "2026-01-28", qty: 720, unit: "rlx", pa: 1.81, cbm: 3.50 },
  { category: "Hook & Loop", article: "Hook and Loop 25yds/roll", specs: "20roll/ctn", color: "WHITE", supplier: "JACKSON", facture: "AP260015", orderDate: "2026-01-05", arrivalDate: "2026-02-20", qty: 300, unit: "ctn", pa: 18.0, cbm: 15.00 },

  // ================== THREADS ==================
  { category: "Sewing Thread", article: "Sewing Thread 40/2 (All Colors)", specs: "60g+39g", color: "COLORS", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 2910, unit: "doz", pa: 2.55, cbm: 4.80 },
  { category: "Sewing Thread", article: "Sewing Thread 40/2 (All Colors)", specs: "60g+39g", color: "COLORS", supplier: "MH", facture: "25MH114253", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 16650, unit: "doz", pa: 2.55, cbm: 28.00 },
  { category: "Sewing Thread", article: "Sewing Thread 40/2", specs: "60g+39g", color: "WHITE", supplier: "MH", facture: "26A00427", orderDate: "2026-01-20", arrivalDate: "2026-03-05", qty: 5720, unit: "doz", pa: 2.40, cbm: 9.50 },
  { category: "Sewing Thread", article: "Sewing Thread 40/2", specs: "60g+39g", color: "BLACK", supplier: "MH", facture: "26A00427", orderDate: "2026-01-20", arrivalDate: "2026-03-05", qty: 5720, unit: "doz", pa: 2.50, cbm: 9.50 },
  { category: "Sewing Thread", article: "Sewing Thread 40/2 (Colors Group)", specs: "60g+39g", color: "COLORS", supplier: "MH", facture: "26A00427", orderDate: "2026-01-20", arrivalDate: "2026-03-05", qty: 21760, unit: "doz", pa: 2.50, cbm: 36.20 },
  { category: "Sewing Thread", article: "Sewing Thread 4000y", specs: "16G PLASTIC CONE", color: "COLORS", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 1350, unit: "doz", pa: 4.72, cbm: 3.10 },
  
  { category: "Embroidery Thread", article: "Embroidery Thread 4400y", specs: "120D/2", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 23040, unit: "pcs", pa: 5.00, cbm: 8.50 },
  { category: "Embroidery Thread", article: "Embroidery Thread 4400y", specs: "120D/2", color: "WHITE", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 8400, unit: "pcs", pa: 5.00, cbm: 3.10 },
  { category: "Embroidery Thread", article: "Embroidery Thread 4400y", specs: "120D/2", color: "COLORS", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 34920, unit: "pcs", pa: 5.00, cbm: 12.80 },

  // ================== ZIPPERS ==================
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "12cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.05, cbm: 0.15 },
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "13cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.12, cbm: 0.16 },
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "14cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.19, cbm: 0.17 },
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "15cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.26, cbm: 0.18 },
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "16cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.33, cbm: 0.19 },
  { category: "Zipper No3", article: "NO.3 NYLON ZIPPER", specs: "C/E A/L 20cm", color: "COLOR", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 8450, unit: "bag", pa: 0.975, cbm: 5.50 },
  { category: "Zipper No4", article: "NO.4 NYLON ZIPPER", specs: "C/E 20cm PVC SLIDER", color: "COLOR", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 5050, unit: "bag", pa: 1.60, cbm: 4.10 },
  { category: "Zipper No5", article: "NO.5 NYLON ZIPPER SILVER TEETH", specs: "WITH O SLIDER 75cm", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 150, unit: "bag", pa: 6.30, cbm: 1.20 },
  { category: "Zipper No5", article: "NO.5 NYLON ZIPPER SILVER TEETH", specs: "WITH O SLIDER 1m20", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 100, unit: "bag", pa: 9.55, cbm: 1.10 },
  { category: "Zipper No5", article: "NO.5 Nylon Zipper O/E", specs: "HT SLIDER", color: "BLACK", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-21", arrivalDate: "2026-01-05", qty: 500, unit: "bag", pa: 3.7, cbm: 3.50 },
  { category: "Zipper No5", article: "NO.5 Nylon Zipper O/E", specs: "HT SLIDER", color: "COLOR", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-21", arrivalDate: "2026-01-05", qty: 12710, unit: "bag", pa: 4.1, cbm: 42.50 },
  
  // ================== ZIPPER LONG CHAIN ==================
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "20.5g/m", color: "A1001white", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 100, unit: "roll", pa: 7.46, cbm: 0.80 },
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "20.5g/m", color: "501white", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 100, unit: "roll", pa: 7.57, cbm: 0.80 },
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "20.5g/m", color: "BEIGE", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 100, unit: "roll", pa: 7.57, cbm: 0.80 },
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "20.5g/m", color: "DYED black", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 100, unit: "roll", pa: 7.46, cbm: 0.80 },
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "13g/m", color: "BEIGE 308", supplier: "MH", facture: "26A00038", orderDate: "2026-01-08", arrivalDate: "2026-02-20", qty: 2500, unit: "roll", pa: 4.345, cbm: 15.00 },
  { category: "Zipper Long Chain", article: "NO.5 Nylon Zipper Long Chain", specs: "13g/m", color: "WHITE", supplier: "MH", facture: "26A00038", orderDate: "2026-01-08", arrivalDate: "2026-02-20", qty: 300, unit: "roll", pa: 3.96, cbm: 1.80 },

  // ================== SLIDERS & PULLERS ==================
  { category: "Slider No3", article: "No.3 N/L Slider", specs: "1g/pc", color: "NICKEL", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 60000, unit: "pcs", pa: 0.0045, cbm: 0.20 },
  { category: "Slider No3", article: "NO.3 DECORATED SLIDER", specs: "1000pc/bag", color: "SHINNING NICKEL", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 25, unit: "bag", pa: 17.90, cbm: 0.10 },
  { category: "Slider No5", article: "No.5 N/L Slider", specs: "1.65g/pc", color: "NICKEL", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 1000000, unit: "pcs", pa: 0.0072, cbm: 3.50 },
  { category: "Slider No5", article: "No.5 N/L Slider", specs: "1.65g/pc", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 250000, unit: "pcs", pa: 0.0068, cbm: 0.85 },
  { category: "Slider No5", article: "NO.5 DECORATED SLIDER", specs: "1000pc/bag", color: "SHINNING NICKEL", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 25, unit: "bag", pa: 22.60, cbm: 0.12 },
  { category: "Slider No5", article: "NO.5 PVC SLIDER FOR NYLON ZIPPER", specs: "1000pc/bag", color: "BLACK NICKEL", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 150, unit: "bag", pa: 19.00, cbm: 0.60 },
  { category: "Slider No8", article: "No.8 N/L Slider", specs: "2.7g/pc", color: "NICKEL", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 200000, unit: "pcs", pa: 0.0118, cbm: 1.20 },
  { category: "Slider No8", article: "No.8 N/L Slider", specs: "2.7g/pc", color: "PAINT BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 100000, unit: "pcs", pa: 0.0112, cbm: 0.60 },
  { category: "Puller", article: "No.3 Reverse A/L Caraf Puller", specs: "2.42g", color: "x", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 150000, unit: "pcs", pa: 0.0291, cbm: 0.90 },
  { category: "Puller", article: "No.5 Reverse A/L Caraf Slider", specs: "3.35g/pc", color: "NICKEL", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 60000, unit: "pcs", pa: 0.0045, cbm: 0.40 },
  { category: "Puller", article: "Puller 80mm", specs: "2000pcs/bag", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 200000, unit: "pcs", pa: 0.011, cbm: 2.20 },

  // ================== TAPES & RIBBONS ==================
  { category: "Polyester Tape", article: "Polyester Tape 25mm", specs: "50m/roll", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 25800, unit: "m", pa: 0.0485, cbm: 2.50 },
  { category: "Polyester Tape", article: "Polyester Tape 30mm", specs: "50m/roll", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 25800, unit: "m", pa: 0.0592, cbm: 2.80 },
  { category: "Reflective Tape", article: "Reflective Tape 5cm", specs: "100m/roll", color: "SILVER", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-18", arrivalDate: "2026-02-02", qty: 100000, unit: "m", pa: 0.024, cbm: 6.50 },
  { category: "Reflective Tape", article: "Reflective Tape 4cm", specs: "100m/roll", color: "SILVER", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-18", arrivalDate: "2026-02-02", qty: 90000, unit: "m", pa: 0.0193, cbm: 5.50 },
  { category: "Reflective Tape", article: "Reflective Tape 3cm", specs: "100m/roll", color: "SILVER", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-18", arrivalDate: "2026-02-02", qty: 80000, unit: "m", pa: 0.01463, cbm: 4.20 },
  { category: "PP Tape", article: "PP Tape 2.5cm", specs: "50Y/roll", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-13", arrivalDate: "2026-01-28", qty: 2800, unit: "rlx", pa: 1.25, cbm: 3.60 },
  { category: "PP Tape", article: "PP Tape 3.8cm", specs: "50yard/roll", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 4400, unit: "rlx", pa: 1.16, cbm: 6.20 },
  { category: "Knitting Tape", article: "Knitting Elastic Tape 15mm", specs: "25m/roll", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 354.3, unit: "kg", pa: 1.90, cbm: 1.50 },
  { category: "Knitting Tape", article: "Knitting Elastic Tape 20mm", specs: "25m/roll", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 378, unit: "kg", pa: 1.90, cbm: 1.60 },
  { category: "Knitting Tape", article: "Knitting Elastic Tape 25mm", specs: "25m/roll", color: "BLACK", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 354.3, unit: "kg", pa: 1.90, cbm: 1.50 },
  { category: "Knitting Tape", article: "Knitting Elastic Tape 30mm", specs: "25m/roll", color: "WHITE", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 1228.5, unit: "kg", pa: 1.85, cbm: 4.80 },
  { category: "Ribbon", article: "Polyester Satin Ribbon 25mm", specs: "20M/bobbin", color: "A1391", supplier: "MH", facture: "25A07645", orderDate: "2025-12-19", arrivalDate: "2026-02-05", qty: 4000, unit: "rolls", pa: 0.142, cbm: 3.20 },

  // ================== INTERLINING ==================
  { category: "Woven Interlining", article: "WOVEN INTERLINING 225gsm", specs: "100m/roll", color: "WHITE", supplier: "JACKSON", facture: "AP260102", orderDate: "2026-01-03", arrivalDate: "2026-02-15", qty: 50, unit: "roll", pa: 82.0, cbm: 4.50 },
  { category: "Woven Interlining", article: "WOVEN INTERLINING 245gsm", specs: "100m/roll", color: "WHITE", supplier: "JACKSON", facture: "AP260102", orderDate: "2026-01-03", arrivalDate: "2026-02-15", qty: 100, unit: "roll", pa: 85.0, cbm: 9.50 },
  { category: "Woven Interlining", article: "WOVEN INTERLINING 245gsm", specs: "100m/roll", color: "WHITE", supplier: "JACKSON", facture: "AP260113", orderDate: "2026-01-13", arrivalDate: "2026-02-25", qty: 100, unit: "roll", pa: 85.0, cbm: 9.50 },
  { category: "Woven Interlining", article: "WOVEN INTERLINING 45gsm", specs: "100m/roll", color: "WHITE", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 28, unit: "roll", pa: 25.5, cbm: 2.10 },
  { category: "Woven Interlining", article: "WOVEN INTERLINING 45gsm PA GLUE", specs: "100m/roll", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 300, unit: "roll", pa: 25.5, cbm: 24.50 },
  { category: "Non Woven Interlining", article: "NON WOVEN INTERLINING 1050HF", specs: "100Y/ROLL", color: "WHITE", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 300, unit: "rlx", pa: 8.81, cbm: 18.00 },
  { category: "Non Woven Interlining", article: "NON WOVEN INTERLINING 1080HF", specs: "100Y/ROLL", color: "WHITE", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 100, unit: "rlx", pa: 12.65, cbm: 6.50 },
  { category: "Non Woven Interlining", article: "NON WOVEN INTERLINING 1030EF", specs: "90Y/roll", color: "WHITE", supplier: "MH", facture: "25A07618", orderDate: "2025-12-18", arrivalDate: "2026-02-02", qty: 3780, unit: "rlx", pa: 4.98, cbm: 68.00 },
  { category: "Non Woven Interlining", article: "NON WOVEN INTERLINING 1080HF", specs: "100Y/ROLL", color: "WHITE", supplier: "JACKSON", facture: "AP260103", orderDate: "2026-01-05", arrivalDate: "2026-02-20", qty: 200, unit: "rlx", pa: 12.6, cbm: 13.00 },
  { category: "Non Woven Interlining", article: "NON WOVEN INTERLINING 1050HF", specs: "100Y/ROLL", color: "WHITE", supplier: "JACKSON", facture: "AP260103", orderDate: "2026-01-05", arrivalDate: "2026-02-20", qty: 300, unit: "rlx", pa: 9.0, cbm: 18.00 },
  { category: "Hot Fuse Cutting Tape", article: "HOT-FUSE INTERLINING CUTTING TAPE", specs: "100m/roll", color: "WHITE", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 5440, unit: "roll", pa: 0.81, cbm: 8.50 },

  // ================== FABRICS ==================
  { category: "Fabric", article: "FABRIC 88g/m2", specs: "160cm 500m/Bale", color: "RAW WHITE", supplier: "JIMMY", facture: "25HD1047", orderDate: "2025-11-04", arrivalDate: "2025-12-15", qty: 106000, unit: "m", pa: 0.315, cbm: 65.00 },
  { category: "Fabric", article: "FABRIC 65g/m2", specs: "160cm 500m/Bale", color: "RAW WHITE", supplier: "JIMMY", facture: "25HD1047", orderDate: "2025-11-04", arrivalDate: "2025-12-15", qty: 92000, unit: "m", pa: 0.246, cbm: 52.00 },
  { category: "Pocketing Fabric", article: "POCKETING FABRIC 90% POLYESTER", specs: "45*45/96*72", color: "WHITE", supplier: "JXWX", facture: "JXWX25082", orderDate: "2025-11-19", arrivalDate: "2026-01-05", qty: 180000, unit: "m", pa: 0.355, cbm: 68.00 },

  // ================== HOME & FURNITURE ==================
  { category: "Home & Furniture", article: "MATRESS 205cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 1, unit: "pcs", pa: 50.0, cbm: 1.20 },
  { category: "Home & Furniture", article: "MATRESS 160*200*25cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 20, unit: "pcs", pa: 45.0, cbm: 16.00 },
  { category: "Home & Furniture", article: "MATRESS 140*190*25cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 15, unit: "pcs", pa: 40.0, cbm: 10.50 },
  { category: "Home & Furniture", article: "MATRESS 90*190*25cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 15, unit: "pcs", pa: 30.0, cbm: 6.50 },
  { category: "Home & Furniture", article: "SOFA 70*100*200cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 10, unit: "pcs", pa: 120.0, cbm: 14.00 },

  // ================== BUTTONS ==================
  { category: "Button", article: "COVERED MOULD BUTTON 15MM", specs: "1000set/bag", color: "ALUMINIUM", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 1000, unit: "bag", pa: 5.20, cbm: 0.85 }
];

export const initialFactures: Facture[] = [
  { id: "25MH114285", arrivalDate: "2026-01-25", supplier: "MH", freight: 1200 },
  { id: "26HD1004", arrivalDate: "2026-02-05", supplier: "JIMMY", freight: 850 },
  { id: "INV-JACK-001", arrivalDate: "2026-01-20", supplier: "JACKSON", freight: 450 },
  { id: "25HD1045", arrivalDate: "2026-01-05", supplier: "JIMMY", freight: 600 },
  { id: "25HD1047", arrivalDate: "2025-12-15", supplier: "JIMMY", freight: 2500 },
  { id: "JXWX25082", arrivalDate: "2026-01-05", supplier: "JXWX", freight: 3200 },
  { id: "AD12505JG26901A", arrivalDate: "2026-01-05", supplier: "AD", freight: 4500 },
  { id: "25MH114253", arrivalDate: "2025-12-20", supplier: "MH", freight: 1800 },
  { id: "26A00427", arrivalDate: "2026-03-05", supplier: "MH", freight: 2100 },
  { id: "AP260015", arrivalDate: "2026-02-20", supplier: "JACKSON", freight: 1100 },
  { id: "26A00038", arrivalDate: "2026-02-20", supplier: "MH", freight: 950 },
  { id: "AP260102", arrivalDate: "2026-02-15", supplier: "JACKSON", freight: 750 },
  { id: "AP260113", arrivalDate: "2026-02-25", supplier: "JACKSON", freight: 800 },
  { id: "25A07645", arrivalDate: "2026-02-05", supplier: "MH", freight: 650 },
  { id: "25A07618", arrivalDate: "2026-02-02", supplier: "MH", freight: 1400 },
  { id: "AP260103", arrivalDate: "2026-02-20", supplier: "JACKSON", freight: 1250 }
];
