'use client';
import { useEffect, useState } from 'react';

/**
 * AppLoader — masque le flash de l'ancienne version (SSR → hydratation).
 * S'affiche pendant que Next.js charge le JS côté client,
 * puis disparaît en fondu dès que React est prêt.
 */
export default function AppLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Dès que le composant monte, React est hydraté → on peut cacher le loader
    const fadeTimer = setTimeout(() => setFading(true), 300);
    const hideTimer = setTimeout(() => setVisible(false), 750);
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
        transition: 'opacity 0.45s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      {/* Logo LEBTEX */}
      <div style={{ marginBottom: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.webp"
          alt="LEBTEX"
          style={{ height: 56, objectFit: 'contain' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Spinner animé */}
      <div style={{ position: 'relative', width: 40, height: 40 }}>
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

      <style>{`
        @keyframes lebtex-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
