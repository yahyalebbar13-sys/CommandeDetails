"use client";

import React, { createContext, useContext } from 'react';

/**
 * Masque les prix d'achat dans un sous-arbre de formulaire.
 *
 * Le formulaire de commande (AddOrderForm) et ses tableaux de ventilation (couleur, taille,
 * qualité, design) affichent des colonnes de prix. Quand un magasin envoie une demande au
 * service import, il ne doit voir aucun prix : plutôt que de faire descendre une prop à travers
 * chaque composant, le formulaire pose ce contexte et les tableaux le lisent.
 *
 * Par défaut les prix sont visibles, pour que rien ne change là où le contexte n'est pas posé.
 */
const PriceVisibilityContext = createContext<boolean>(true);

export function PriceVisibilityProvider({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return <PriceVisibilityContext.Provider value={visible}>{children}</PriceVisibilityContext.Provider>;
}

export function usePricesVisible(): boolean {
  return useContext(PriceVisibilityContext);
}
