// ─── Marque LEBTEX de l'espace équipe ────────────────────────────────────────
// Le vrai logo (le même que l'icône du site, déjà en cache) sur une tuile
// blanche : il est dessiné sur fond blanc et se lit mal directement sur le noir.

export function LogoLebtex({ taille = 'petit' }: { taille?: 'petit' | 'grand' }) {
  const grand = taille === 'grand';
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-white/10 ${
        grand ? 'h-16 w-16 rounded-2xl shadow-2xl shadow-black/50' : 'h-9 w-9 rounded-xl'
      }`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- petite image statique, déjà chargée comme icône du site */}
      <img
        src="/favicon.png"
        alt=""
        width={grand ? 56 : 32}
        height={grand ? 56 : 32}
        decoding="async"
        className={grand ? 'h-14 w-14 object-contain' : 'h-8 w-8 object-contain'}
      />
    </span>
  );
}
