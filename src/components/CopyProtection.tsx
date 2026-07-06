'use client';

import { useEffect } from 'react';

/**
 * CopyProtection – composant invisible qui protège le contenu du site :
 *  - Bloque le clic droit (menu contextuel)
 *  - Bloque la sélection de texte via clavier (Ctrl+A)
 *  - Bloque les raccourcis d'inspection / sauvegarde (F12, Ctrl+U, Ctrl+S,
 *    Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C)
 *  - Bloque le glisser-déposer d'images
 */
export default function CopyProtection() {
  useEffect(() => {
    /* ── 1. Désactiver le clic droit ── */
    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    /* ── 2. Bloquer les raccourcis clavier sensibles ── */
    const blockShortcuts = (e: KeyboardEvent) => {
      if (!e.key) return;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // F12 — DevTools
      if (e.key === 'F12') { e.preventDefault(); return false; }

      if (ctrl) {
        // Ctrl+U — Voir la source
        if (key === 'u') { e.preventDefault(); return false; }
        // Ctrl+S — Enregistrer la page
        if (key === 's') { e.preventDefault(); return false; }
        // Ctrl+A — Sélectionner tout (Autorisé)
        // if (key === 'a') { e.preventDefault(); return false; }
        // Ctrl+C — Copier (Autorisé)
        // if (key === 'c') { e.preventDefault(); return false; }
        // Ctrl+P — Imprimer
        if (key === 'p') { e.preventDefault(); return false; }

        if (shift) {
          // Ctrl+Shift+I — Inspecteur
          if (key === 'i') { e.preventDefault(); return false; }
          // Ctrl+Shift+J — Console
          if (key === 'j') { e.preventDefault(); return false; }
          // Ctrl+Shift+C — Sélecteur d'éléments
          if (key === 'c') { e.preventDefault(); return false; }
        }
      }
    };

    /* ── 3. Bloquer le glisser-déposer ── */
    const blockDrag = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    /* ── 4. Bloquer la sélection de texte via souris (Désactivé pour permettre la copie) ── */
    // const blockSelectStart = (e: Event) => {
    //   e.preventDefault();
    //   return false;
    // };

    // Enregistrement des listeners
    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockShortcuts);
    document.addEventListener('dragstart', blockDrag);
    // document.addEventListener('selectstart', blockSelectStart);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockShortcuts);
      document.removeEventListener('dragstart', blockDrag);
      // document.removeEventListener('selectstart', blockSelectStart);
    };
  }, []);

  return null; // composant invisible
}
