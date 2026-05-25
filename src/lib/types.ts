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

// ── Types de vente (POS rapide) ────────────────────────────────────────────────
export type SaleItem = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  categoryId: string;
  generalCategoryId?: string;
  unitOfMeasure: string;
  qty: number;
  unitPrice: number;      // prix unitaire retenu (peut être modifié)
  sellingPrice: number;   // prix de vente catalogue
  costPrice: number;      // prix d'achat (pour marge)
  totalPrice: number;     // qty * unitPrice
  totalCost: number;      // qty * costPrice
  margin: number;         // totalPrice - totalCost
};

export type Sale = {
  id: string;
  items: SaleItem[];
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  date: string;
  clientId?: string;
  clientName?: string;
  notes?: string;
  createdAt?: any;
};

// ── Module Commercial ──────────────────────────────────────────────────────────
export type Client = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt?: any;
};

export type OrderItem = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  categoryId: string;
  generalCategoryId?: string;
  unitOfMeasure: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
};

export type SaleOrderStatus = 'DRAFT' | 'CONFIRMED' | 'INVOICED' | 'CANCELLED';

export type SaleOrder = {
  id: string;
  clientId?: string;
  clientName?: string;
  items: OrderItem[];
  totalAmount: number;
  discount?: number;      // remise en %
  totalAfterDiscount: number;
  status: SaleOrderStatus;
  date: string;
  notes?: string;
  createdAt?: any;
};

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export type Invoice = {
  id: string;
  invoiceNumber?: string;
  clientId?: string;
  clientName?: string;
  orderId?: string;
  items: OrderItem[];
  totalAmount: number;
  discount?: number;
  totalAfterDiscount: number;
  paidAmount: number;
  remainingBalance: number;
  status: InvoiceStatus;
  date: string;
  dueDate?: string;
  notes?: string;
  createdAt?: any;
};

export type PaymentMethod = 'CASH' | 'VIREMENT' | 'CHEQUE' | 'AUTRE';

export type ClientPayment = {
  id: string;
  clientId: string;
  invoiceId?: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes?: string;
  createdAt?: any;
};
