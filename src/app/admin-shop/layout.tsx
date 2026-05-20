import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin LEBTEX — Tableau de bord e-commerce',
  description: 'Dashboard administrateur LEBTEX — Gestion commandes, produits et clients',
  robots: 'noindex, nofollow',
};

export default function AdminShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {children}
    </div>
  );
}
