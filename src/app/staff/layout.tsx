import type { Metadata, Viewport } from 'next';

// Espace de travail de l'équipe : jamais dans les moteurs de recherche.
export const metadata: Metadata = {
  title: 'Espace équipe — LEBTEX',
  description: "Espace de travail de l'équipe LEBTEX : commandes de la boutique et demandes des clients.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

// Barre du navigateur (Android) de la couleur du fond sombre, plutôt que le rouge de la boutique.
export const viewport: Viewport = {
  themeColor: '#0F0F0F',
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#0F0F0F] text-gray-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      {children}
    </div>
  );
}
