'use client';

import { useEffect } from 'react';

/**
 * CopyProtection – composant invisible qui protège le contenu du site :
 *  - Bloque le clic droit (menu contextuel)
 *  - Bloque la sélection de texte via clavier (Ctrl+A)
 *  - Bloque les raccourcis d'inspection / sauvegarde (F12, Ctrl+U, Ctrl+S,
 *    Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C)
 *  - Bloque le glisser-déposer d'images
 *  - Détecte l'ouverture des DevTools et vide la page en conséquence
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
        // Ctrl+A — Sélectionner tout
        if (key === 'a') { e.preventDefault(); return false; }
        // Ctrl+C — Copier (bloque la copie directe)
        if (key === 'c') { e.preventDefault(); return false; }
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

    /* ── 4. Bloquer la sélection de texte via souris ── */
    const blockSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    /* ── 5. Détection DevTools (méthode de différence de taille de fenêtre) ── */
    let devToolsOpen = false;
    const threshold = 160;

    const detectDevTools = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      if (widthDiff > threshold || heightDiff > threshold) {
        if (!devToolsOpen) {
          devToolsOpen = true;
          // Rediriger vers la page d'accueil ou afficher un avertissement
          document.body.innerHTML =
            `<div style="
              display:flex;
              flex-direction:column;
              align-items:center;
              justify-content:center;
              height:100vh;
              background:#0F0F0F;
              color:#C8102E;
              font-family:Inter,sans-serif;
              text-align:center;
              gap:16px;
            ">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <h1 style="font-size:1.8rem;font-weight:700;margin:0">Accès non autorisé</h1>
              <p style="color:#999;font-size:1rem;max-width:400px;margin:0">
                L'inspection du code source de ce site est interdite.<br/>
                Veuillez fermer les outils de développement.
              </p>
            </div>`;
        }
      } else {
        devToolsOpen = false;
      }
    };

    const devToolsInterval = setInterval(detectDevTools, 1000);

    // Enregistrement des listeners
    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockShortcuts);
    document.addEventListener('dragstart', blockDrag);
    document.addEventListener('selectstart', blockSelectStart);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockShortcuts);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('selectstart', blockSelectStart);
      clearInterval(devToolsInterval);
    };
  }, []);

  return null; // composant invisible
}
