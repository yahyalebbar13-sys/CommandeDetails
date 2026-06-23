'use client';
import { useEffect, useState } from 'react';

/**
 * AppLoader — masque TOUT le contenu jusqu'à ce que Firestore ait chargé.
 * 
 * Le problème : Next.js affiche les produits hardcodés (anciens) immédiatement, 
 * puis Firestore charge et les remplace → flash visible de l'ancienne version.
 * 
 * Solution : cet overlay couvre tout jusqu'à ce que le DOM soit hydraté + un délai
 * pour que Firestore ait le temps de charger. Ensuite il disparaît en fondu.
 */
export default function AppLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Attendre que React soit hydraté ET que Firestore ait eu le temps de répondre
    // 1.5s est suffisant pour Firestore en conditions normales
    const fadeTimer = setTimeout(() => setFading(true), 1500);
    const hideTimer = setTimeout(() => setVisible(false), 2000);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FBF8F3',
        transition: 'opacity 0.5s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      {/* Logo LEBTEX — grand et centré */}
      <div style={{ marginBottom: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.webp"
          alt="LEBTEX"
          style={{ height: 120, objectFit: 'contain' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Spinner animé */}
      <div style={{ position: 'relative', width: 44, height: 44 }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid #E8E4DF',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: '#C8102E',
          animation: 'lebtex-spin 0.8s linear infinite',
        }} />
      </div>

      {/* Texte */}
      <p style={{
        marginTop: 24,
        fontSize: 13,
        color: '#6B6B6B',
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '0.5px',
      }}>
        Chargement...
      </p>

      <style>{`
        @keyframes lebtex-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
