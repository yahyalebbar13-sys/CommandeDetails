'use client';
import { useEffect, useState } from 'react';

/**
 * AppLoader — masque TOUT le contenu jusqu'à ce que Firestore ait chargé.
 * 
 * S'affiche pendant 1.5s pour donner le temps à la base de données
 * de charger les produits à jour et éviter tout flash d'ancienne version.
 */
export default function AppLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Attendre que React soit hydraté ET que Firestore ait eu le temps de répondre
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
        background: '#FBF8F3', // Crème
        transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'all',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background glow */}
      <div 
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(200,16,46,0.04) 0%, rgba(251,248,243,0) 70%)',
          borderRadius: '50%',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
        }}
      />

      <div 
        style={{ 
          position: 'relative', 
          zIndex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          transition: 'transform 1s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1s ease',
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* Logo LEBTEX — Très grand */}
        <div style={{ marginBottom: 48 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="LEBTEX"
            style={{ 
              height: 180, // Agrandissement significatif
              objectFit: 'contain',
              filter: 'drop-shadow(0px 8px 24px rgba(0,0,0,0.06))',
              animation: 'lebtex-float 4s ease-in-out infinite'
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Barre de chargement premium */}
        <div style={{ width: 180, height: 4, background: '#EAE5DE', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            background: '#C8102E', // Rouge LEBTEX
            borderRadius: 4,
            animation: 'lebtex-progress 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          }} />
        </div>

        {/* Texte */}
        <p style={{
          marginTop: 20,
          fontSize: 12,
          fontWeight: 600,
          color: '#8A847C',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          animation: 'lebtex-pulse-text 2s ease-in-out infinite'
        }}>
          Chargement
        </p>
      </div>

      <style>{`
        @keyframes lebtex-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes lebtex-progress {
          0% { width: 0%; opacity: 1; }
          70% { width: 80%; opacity: 1; }
          100% { width: 100%; opacity: 0.8; }
        }
        @keyframes lebtex-pulse-text {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
