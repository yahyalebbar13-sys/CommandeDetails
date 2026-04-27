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

export type ViewType = 'dashboard' | 'to-order' | 'pending' | 'transit' | 'factures' | 'general-categories' | 'categories' | 'suppliers' | 'data' | 'timeline' | 'cost-analysis' | 'cost-sale' | 'ai';
