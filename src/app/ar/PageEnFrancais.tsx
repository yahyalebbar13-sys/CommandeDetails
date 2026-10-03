// Page pas encore traduite (PAGES_EN_FRANCAIS_SEULEMENT, lib/liens-boutique), ouverte en
// arabe : l'en-tête et le pied de page restent arabes, son texte français se lit de
// gauche à droite. Son adresse canonique est la française (étiquettes de la page française).
// La langue de la boutique reste l'arabe à l'intérieur : ses liens restent en /ar, et un bloc
// déjà traduit (le siège dans À propos) s'affiche en arabe ; il porte alors son propre dir.
export default function PageEnFrancais({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" lang="fr">
      {children}
    </div>
  );
}
