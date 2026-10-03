import { notFound } from 'next/navigation';

// Toute adresse inconnue sous /ar (et /ar/shop/…) affiche la page introuvable arabe
// (statut 404), au lieu de la page anglaise par défaut de Next.
export default function Introuvable() {
  notFound();
}
