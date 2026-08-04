import type { Metadata } from 'next';
import '../../app/globals.css';
import { Toaster } from '@/components/ui/toaster';
// NOTE: NO FirebaseClientProvider here — the client portal uses its own isolated Firebase app

export const metadata: Metadata = {
  title: 'StockVue — Espace Client',
  description: 'Portail client sécurisé pour consulter vos précommandes.',
  manifest: '/client-manifest.json',
  appleWebApp: {
    capable: true,
    title: 'LEBTEX',
    statusBarStyle: 'black-translucent',
  },
};

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
