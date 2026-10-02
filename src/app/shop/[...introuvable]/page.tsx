import { notFound } from 'next/navigation';

// Toute adresse inconnue sous /shop affiche la page introuvable de la boutique
// (statut 404), au lieu de la page anglaise par défaut de Next.
export default function Introuvable() {
  notFound();
}
