"use client";

// ─── Carte du trajet, en SVG ──────────────────────────────────────────────────
// Dessinée à partir de la route ShipsGo (cf. lib/suivi-carte.ts) : aucune
// librairie de cartographie, aucune tuile à télécharger. Pas de fond de carte
// non plus — ce qui compte ici est la forme du voyage, les escales et l'endroit
// où se trouve le navire, pas la géographie exacte des côtes.

import React from 'react';
import type { Carte } from '@/lib/suivi-carte';

export default function SuiviCarte({ carte }: { carte: Carte }) {
  const { largeur, hauteur, segments, ports, navire } = carte;

  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      className="w-full h-auto rounded-2xl bg-gradient-to-b from-sky-50 to-stone-50 border border-stone-100"
      role="img"
      aria-label="Trajet du conteneur"
    >
      {/* Traversées : plein pour ce qui est fait, pointillé pour ce qui reste */}
      {segments.map((s, i) => (
        <path
          key={`s-${i}`}
          d={s.d}
          fill="none"
          stroke={s.parcouru ? '#1c1917' : '#a8a29e'}
          strokeWidth={s.parcouru ? 2 : 1.5}
          strokeDasharray={s.parcouru ? undefined : '5 5'}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={s.parcouru ? 0.9 : 0.55}
        >
          {(s.navire || s.arrivee) && (
            <title>{[s.navire, s.voyage, s.depart && s.arrivee ? `${s.depart} → ${s.arrivee}` : null].filter(Boolean).join(' · ')}</title>
          )}
        </path>
      ))}

      {/* Ports */}
      {ports.map((p, i) => {
        const passe = p.etat === 'PAST';
        const courant = p.etat === 'CURRENT';
        const aDroite = p.x > largeur * 0.72;
        return (
          <g key={`p-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={courant ? 5 : 4}
              fill={courant ? '#d97706' : passe ? '#1c1917' : '#ffffff'}
              stroke={courant ? '#d97706' : '#1c1917'}
              strokeWidth={1.5}
            >
              <title>{[p.nom, p.pays].filter(Boolean).join(' · ')}</title>
            </circle>
            <text
              x={aDroite ? p.x - 8 : p.x + 8}
              y={p.y + 3.5}
              textAnchor={aDroite ? 'end' : 'start'}
              className="select-none"
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.08em',
                fill: passe || courant ? '#1c1917' : '#78716c',
              }}
            >
              {p.nom}
            </text>
          </g>
        );
      })}

      {/* Navire */}
      {navire && (
        <g>
          <circle cx={navire.x} cy={navire.y} r={9} fill="#d97706" opacity={0.18}>
            <animate attributeName="r" values="7;12;7" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={navire.x} cy={navire.y} r={4.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5}>
            <title>{[navire.nom, navire.voyage].filter(Boolean).join(' · ') || 'Position actuelle'}</title>
          </circle>
        </g>
      )}
    </svg>
  );
}
