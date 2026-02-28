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
};

export type Facture = {
  id: string;
  arrivalDate: string;
  supplier: string;
  freight: number;
};

export type ViewType = 'dashboard' | 'factures' | 'categories' | 'suppliers' | 'data' | 'pending';
