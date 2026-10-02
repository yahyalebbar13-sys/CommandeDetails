import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google du service import (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'Service import et précommandes',
  description:
    'Pour les professionnels : précommandez en grande quantité des accessoires de mercerie, importés directement par LEBTEX.',
  chemin: '/shop/precommande',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
