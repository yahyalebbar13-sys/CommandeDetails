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
  initialQty: number;      // quantité à l'arrivage (article.quantity)
  mouvementsIn: number;    // SUM des mouvements IN supplémentaires
  mouvementsOut: number;   // SUM des mouvements OUT
  currentQty: number;      // initialQty + mouvementsIn - mouvementsOut
  totalValue: number;      // currentQty * purchasePricePerUnit
  minThreshold?: number;   // seuil d'alerte bas
  lastMovementDate?: string;
  stockEntryDate?: string;
};

