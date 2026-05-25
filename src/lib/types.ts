export type OrderStatus = 'TO_ORDER' | 'PI' | 'SHIPPED';

export type GeneralCategory = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  generalCategoryId?: string;
  hsCode?: string;
  customsValuePerKg?: number;
  importDutyRate?: number;
  tpiRate?: number;
  tvaRate?: number;
};

export type Order = {
  id: string;
  generalCategoryId?: string;
  categoryId: string;
  name: string;
  specs?: string;
  color?: string;
  size?: string;
  zipperType?: string;
  slider?: string;
  sliderType?: string;
  supplierId: string;
  factureId?: string;
  orderDate: string;
  arrivalDate?: string;
  stockEntryDate?: string;
  quantity: number;
  unitOfMeasure: string;
  purchasePricePerUnit: number;
  cubicMeasurement?: number;
  netWeight?: number;
  priority?: 'urgent' | 'important' | 'todo';
  status: OrderStatus;
  createdAt?: any;
};

export type Facture = {
  id: string;
  noBL?: string;
  arrivalDate: string;
  stockEntryDate?: string;
  shippingDate?: string;
  shippingLine?: string;
  supplierId: string;
  declaringCompany?: "New fournitures" | "Lebtex" | "Robe in box";
  forwarder?: string;
  forwarderGivenDate?: string;
  freightCost: number;
  declaredValue?: number;
  customsPaidDhs?: number;
  invoicePaidDhs?: number;
  exchangeInvoiceAmount?: number;
  supplierInvoiceAmount?: number;
  additionalCostsAmount?: number;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: number;
  date: string;
  notes?: string;
};

export type ViewType = 'dashboard' | 'to-order' | 'pending' | 'transit' | 'factures' | 'general-categories' | 'categories' | 'suppliers' | 'data' | 'timeline' | 'cost-analysis' | 'cost-sale' | 'dp' | 'reconciliation' | 'devis-pi' | 'ai';

export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';
export type StockMovementReason = 'ARRIVAGE' | 'VENTE' | 'PERTE' | 'RETOUR' | 'INVENTAIRE' | 'TRANSFERT';

export type StockMovement = {
  id: string;
  articleId: string;
  categoryId: string;
  productName: string;
  color?: string;
  size?: string;
  unitOfMeasure: string;
  type: StockMovementType;
  reason: StockMovementReason;
  quantity: number;      // toujours positif — direction donnée par type
  date: string;          // YYYY-MM-DD
  notes?: string;
  factureId?: string;    // référence si mouvement IN lié à un arrivage
  createdAt?: any;
};

// Stock item calculé (non stocké — calculé en mémoire)
export type StockItem = {
  articleId: string;
  categoryId: string;
  productName: string;
  color?: string;
  size?: string;
  unitOfMeasure: string;
  purchasePricePerUnit: number;
  sellingPrice?: number;        // prix de vente configuré par l'admin
  initialQty: number;
  mouvementsIn: number;
  mouvementsOut: number;
  currentQty: number;
  totalValue: number;           // currentQty * purchasePricePerUnit
  totalSellingValue?: number;   // currentQty * sellingPrice
  minThreshold?: number;
  lastMovementDate?: string;
  stockEntryDate?: string;
};

// ── Types de vente ─────────────────────────────────────────────────────────────
export type SaleItem = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  categoryId: string;
  unitOfMeasure: string;
  qty: number;
  sellingPrice: number;   // prix unitaire au moment de la vente
  costPrice: number;      // prix d'achat au moment de la vente
  totalPrice: number;     // qty * sellingPrice
  totalCost: number;      // qty * costPrice
  margin: number;         // totalPrice - totalCost
};

export type Sale = {
  id: string;
  items: SaleItem[];
  totalAmount: number;    // SUM(items.totalPrice)
  totalCost: number;      // SUM(items.totalCost)
  totalMargin: number;    // totalAmount - totalCost
  date: string;           // YYYY-MM-DD
  clientName?: string;
  notes?: string;
  createdAt?: any;
};

