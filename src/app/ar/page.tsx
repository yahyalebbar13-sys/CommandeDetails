import { permanentRedirect } from 'next/navigation';

// Une seule adresse pour l'accueil arabe : /ar/shop (comme /shop pour le français).
// /ar, facile à écrire sur une affiche ou dans un message, y mène (308).
export default function AccueilArabe() {
  permanentRedirect('/ar/shop');
}
