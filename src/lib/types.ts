
export type OrderStatus = 'TO_ORDER' | 'PI' | 'SHIPPED';

export type Category = {
  id: string;
  name: string;
};

export type Order = {
  category: string;
  article: string;
  specs?: string;
  color?: string;
  supplier: string;
  facture: string;
  orderDate: string;
  arrivalDate: string;
  qty: number;
  unit: string;
  pa: number;
  cbm: number;
  status?: OrderStatus;
};

export type Facture = {
  id: string;
  arrivalDate: string;
  supplier: string;
  freight: number;
};

export type ViewType = 'dashboard' | 'to-order' | 'pending' | 'factures' | 'categories' | 'suppliers' | 'data';
