import type { Metadata } from 'next';
import '../../app/globals.css';
import { Toaster } from '@/components/ui/toaster';
// NOTE: NO FirebaseClientProvider here — the client portal uses its own isolated Firebase app

export const metadata: Metadata = {
  title: 'LEBTEX — Espace client',
  description: 'Suivez vos commandes LEBTEX, de la fabrication à la livraison.',
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
