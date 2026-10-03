import { redirect } from 'next/navigation';

// Ancienne adresse des magasins, comme /shop/boutiques : vers À propos, en arabe
export default function BoutiquesPage() {
  redirect('/ar/shop/a-propos');
}
