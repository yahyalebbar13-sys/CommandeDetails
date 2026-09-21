// ─── Carte du trajet ──────────────────────────────────────────────────────────
// ShipsGo publie la route d'un conteneur en GeoJSON : les ports en `Point`, les
// traversées en `LineString`, et la position du navire sur le segment en cours.
// Ce fichier projette tout ça dans un repère de dessin — le composant n'a plus
// qu'à tracer des `path` et des cercles, sans aucune librairie de cartographie.
//
// Pur : aucun appel réseau — testé par scripts/test-suivi-carte.ts.

export type EtatTroncon = 'PAST' | 'CURRENT' | 'FUTURE';

export type PortCarte = {
  x: number;
  y: number;
  nom: string;
  code?: string;
  pays?: string;
  etat: EtatTroncon;
};

export type SegmentCarte = {
  /** Attribut `d` d'un <path> SVG. */
  d: string;
  /** true : déjà navigué (trait plein) ; false : à venir (pointillés). */
  parcouru: boolean;
  navire?: string;
  voyage?: string;
  depart?: string;
  arrivee?: string;
};

export type Carte = {
  largeur: number;
  hauteur: number;
  ports: PortCarte[];
  segments: SegmentCarte[];
  /** Position du navire, quand il est en mer. */
  navire?: { x: number; y: number; nom?: string; voyage?: string };
};

type Coord = [number, number];

/**
 * Mercator, bornée à ±85° (au-delà, la projection part à l'infini et aucune
 * route maritime n'y passe). Le résultat n'a pas d'unité : seul compte le
 * rapport entre les points, recadré ensuite sur la zone de dessin.
 */
function projeter([lon, lat]: Coord): Coord {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [lon, -Math.log(Math.tan(Math.PI / 4 + phi / 2)) * (180 / Math.PI)];
}

/** Coordonnée plausible ? Une route ne passe pas par [0,0] sans raison, mais on l'accepte. */
function coordValide(c: any): c is Coord {
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

/**
 * Un trajet transpacifique franchit le méridien 180° : les longitudes sautent
 * de +179 à -179 et le tracé traverserait toute la carte à l'envers. On décale
 * alors les longitudes négatives d'un tour complet pour garder un trait continu.
 */
function recollerAntimeridien(toutes: Coord[]): (c: Coord) => Coord {
  const lons = toutes.map(c => c[0]);
  const brut = Math.max(...lons) - Math.min(...lons);
  if (brut <= 180) return c => c;
  const decalees = lons.map(l => (l < 0 ? l + 360 : l));
  const apres = Math.max(...decalees) - Math.min(...decalees);
  // On ne recolle que si ça resserre vraiment le trajet.
  return apres < brut ? (c => [c[0] < 0 ? c[0] + 360 : c[0], c[1]] as Coord) : (c => c);
}

export function preparerCarte(
  geojson: any,
  opts: { largeur?: number; hauteur?: number; marge?: number } = {},
): Carte | null {
  const largeur = opts.largeur ?? 640;
  const hauteur = opts.hauteur ?? 260;
  const marge = opts.marge ?? 26;

  const features: any[] = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length) return null;

  // ── Tout ramasser avant de projeter : le cadrage dépend de l'ensemble ──────
  const points: { coord: Coord; props: any }[] = [];
  const lignes: { coords: Coord[]; props: any }[] = [];

  for (const f of features) {
    const g = f?.geometry;
    if (g?.type === 'Point' && coordValide(g.coordinates)) {
      points.push({ coord: g.coordinates as Coord, props: f.properties || {} });
    } else if (g?.type === 'LineString' && Array.isArray(g.coordinates)) {
      const coords = (g.coordinates as any[]).filter(coordValide) as Coord[];
      if (coords.length >= 2) lignes.push({ coords, props: f.properties || {} });
    }
  }
  if (!points.length && !lignes.length) return null;

  const positionNavire: Coord | undefined = lignes
    .map(l => l.props?.current?.coordinates)
    .find(coordValide);

  const toutes: Coord[] = [
    ...points.map(p => p.coord),
    ...lignes.flatMap(l => l.coords),
    ...(positionNavire ? [positionNavire] : []),
  ];
  const recoller = recollerAntimeridien(toutes);
  const projetees = toutes.map(c => projeter(recoller(c)));

  const xs = projetees.map(c => c[0]);
  const ys = projetees.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Même échelle sur les deux axes : sans ça, un trajet est-ouest s'étire en hauteur.
  const etendueX = Math.max(maxX - minX, 1e-6);
  const etendueY = Math.max(maxY - minY, 1e-6);
  const echelle = Math.min((largeur - 2 * marge) / etendueX, (hauteur - 2 * marge) / etendueY);
  const decalageX = (largeur - etendueX * echelle) / 2;
  const decalageY = (hauteur - etendueY * echelle) / 2;

  const versEcran = (c: Coord): Coord => {
    const [px, py] = projeter(recoller(c));
    return [
      Math.round((px - minX) * echelle * 100) / 100 + decalageX,
      Math.round((py - minY) * echelle * 100) / 100 + decalageY,
    ];
  };

  const chemin = (coords: Coord[]): string =>
    coords.map((c, i) => {
      const [x, y] = versEcran(c);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

  // ── Segments ──────────────────────────────────────────────────────────────
  const segments: SegmentCarte[] = [];
  for (const { coords, props } of lignes) {
    const etat: EtatTroncon = props?.status || 'FUTURE';
    const commun = {
      navire: props?.vessel?.name || undefined,
      voyage: props?.voyage || undefined,
      depart: props?.events?.DEPA?.location?.name || undefined,
      arrivee: props?.events?.ARRV?.location?.name || undefined,
    };

    // Le segment en cours se coupe en deux à la position du navire.
    const index: number | undefined = props?.current?.index;
    if (etat === 'CURRENT' && typeof index === 'number' && index > 0 && index < coords.length - 1) {
      segments.push({ d: chemin(coords.slice(0, index + 1)), parcouru: true, ...commun });
      segments.push({ d: chemin(coords.slice(index)), parcouru: false, ...commun });
    } else {
      segments.push({ d: chemin(coords), parcouru: etat === 'PAST', ...commun });
    }
  }

  // ── Ports ─────────────────────────────────────────────────────────────────
  const ports: PortCarte[] = points.map(({ coord, props }) => {
    const [x, y] = versEcran(coord);
    return {
      x, y,
      nom: props?.location?.name || '—',
      code: props?.location?.code || undefined,
      pays: props?.location?.country?.name || undefined,
      etat: props?.status || 'FUTURE',
    };
  });

  const navire = positionNavire
    ? (() => {
        const [x, y] = versEcran(positionNavire);
        const seg = lignes.find(l => l.props?.current?.coordinates);
        return { x, y, nom: seg?.props?.vessel?.name || undefined, voyage: seg?.props?.voyage || undefined };
      })()
    : undefined;

  return { largeur, hauteur, ports, segments, navire };
}
