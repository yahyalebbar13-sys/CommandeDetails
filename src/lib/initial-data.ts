import { Order, Facture } from './types';

export const initialOrders: Order[] = [
  { category: "Visor for Cap", article: "Visor for Cap 2.8*72*182mm", specs: "20pcs/bundle", color: "WHITE", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 110, unit: "ctn", pa: 0.452, cbm: 3.20 },
  { category: "Visor for Cap", article: "Visor for Cap 2.8*72*182mm", specs: "20pcs/bundle", color: "BLACK", supplier: "MH", facture: "25MH114285", orderDate: "2025-12-12", arrivalDate: "2026-01-25", qty: 991, unit: "ctn", pa: 0.421, cbm: 28.50 },
  { category: "Tag Pin", article: "TAG PIN 35mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 360, unit: "box", pa: 0.437, cbm: 1.10 },
  { category: "Tag Pin", article: "TAG PIN 40mm", specs: "5000pc/box", color: "TRANSPARENT", supplier: "JIMMY", facture: "26HD1004", orderDate: "2025-12-20", arrivalDate: "2026-02-05", qty: 360, unit: "box", pa: 0.437, cbm: 1.15 },
  { category: "Packaging", article: "OPP BAG 25*36+4", specs: "1KG/BAG, 25KG/CTN", color: "CLEAR", supplier: "JACKSON", facture: "INV-JACK-001", orderDate: "2025-12-08", arrivalDate: "2026-01-20", qty: 150, unit: "ctn", pa: 1.29, cbm: 4.50 },
  { category: "Sewing Thread", article: "Sewing Thread 40/2", specs: "60g+39g", color: "COLORS", supplier: "MH", facture: "25MH114285", orderDate: "2025-11-05", arrivalDate: "2025-12-20", qty: 2910, unit: "doz", pa: 2.55, cbm: 4.80 },
  { category: "Zipper No5", article: "NO.5 NYGURADE ZIPPER", specs: "12cm SEMI AUTO", color: "BLACK", supplier: "JIMMY", facture: "25HD1045", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 100, unit: "bag", pa: 4.05, cbm: 0.15 },
  { category: "Fabric", article: "FABRIC 88g/m2", specs: "160cm 500m/Bale", color: "RAW WHITE", supplier: "JIMMY", facture: "25HD1047", orderDate: "2025-11-04", arrivalDate: "2025-12-15", qty: 106000, unit: "m", pa: 0.315, cbm: 65.00 },
  { category: "Pocketing Fabric", article: "POCKETING FABRIC 90% POLYESTER", specs: "45*45/96*72", color: "WHITE", supplier: "JXWX", facture: "JXWX25082", orderDate: "2025-11-19", arrivalDate: "2026-01-05", qty: 180000, unit: "m", pa: 0.355, cbm: 68.00 },
  { category: "Home & Furniture", article: "MATRESS 160*200*25cm", specs: "-", color: "-", supplier: "AD", facture: "AD12505JG26901A", orderDate: "2025-11-20", arrivalDate: "2026-01-05", qty: 20, unit: "pcs", pa: 45.0, cbm: 16.00 }
];

export const initialFactures: Facture[] = [
  { id: "25MH114285", arrivalDate: "2026-01-25", supplier: "MH", freight: 1200 },
  { id: "26HD1004", arrivalDate: "2026-02-05", supplier: "JIMMY", freight: 850 },
  { id: "INV-JACK-001", arrivalDate: "2026-01-20", supplier: "JACKSON", freight: 450 },
  { id: "25HD1045", arrivalDate: "2026-01-05", supplier: "JIMMY", freight: 600 },
  { id: "25HD1047", arrivalDate: "2025-12-15", supplier: "JIMMY", freight: 2500 },
  { id: "JXWX25082", arrivalDate: "2026-01-05", supplier: "JXWX", freight: 3200 },
  { id: "AD12505JG26901A", arrivalDate: "2026-01-05", supplier: "AD", freight: 4500 }
];