import type { Metadata } from 'next';
import { adressePage } from '@/lib/catalogue-serveur';

// Accueil arabe : la page d'accueil de la boutique, en arabe. Adresse canonique /ar/shop,
// version française https://www.lebtex.ma (hreflang). Titre et description : layout /ar.
export const metadata: Metadata = adressePage('/shop', undefined, 'ar');

export { default } from '@/app/shop/page';
