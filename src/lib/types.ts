
export type OrderStatus = 'TO_ORDER' | 'PI' | 'SHIPPED';

export type GeneralCategory = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  generalCategoryId?: string;
};

export type Order = {
  id: string;
  generalCategoryId?: string;
  categoryId: string;
  name: string;
  specs?: string;
  color?: string;
  supplierId: string;
  factureId?: string;
  orderDate: string;
  arrivalDate?: string;
  quantity: number;
  unitOfMeasure: string;
  purchasePricePerUnit: number;
  cubicMeasurement?: number;
  status: OrderStatus;
  createdAt?: any;
};

export type Facture = {
  id: string;
  arrivalDate: string;
  supplierId: string;
  freightCost: number;
};

export type ViewType = 'dashboard' | 'to-order' | 'pending' | 'factures' | 'general-categories' | 'categories' | 'suppliers' | 'data';
