import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'System Console',
  description: 'System monitoring and analytics dashboard',
  robots: { index: false, follow: false },
  manifest: '/y-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SysConsole',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function YConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0a 100%)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </div>
  );
}
