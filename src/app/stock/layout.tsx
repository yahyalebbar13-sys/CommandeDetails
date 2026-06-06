import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stock Manager — StockVue',
  description: 'Logiciel complet de gestion de stock physique',
};

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
