/**
 * Recolours OpenFreeMap's Liberty style with the OpenStreetMap Carto palette (the openstreetmap.org tiles the Leaflet
 * maps use), so the 3D map reads like Plan's map in both themes: pink motorways, salmon trunks, orange primaries,
 * yellow secondaries, white minor roads, grey-cyan water and Carto greens. Layout and widths stay Liberty's.
 */

type StyleLayer = { id: string; type: string; paint?: Record<string, unknown> };

/** OSM Carto road colours: [fill, casing]. */
export const cartoRoads = {
  motorway: ["#e892a2", "#dc2a67"],
  trunk: ["#f9b29c", "#c84e2f"],
  primary: ["#fcd6a4", "#a06b00"],
  secondary: ["#f7fabf", "#707d05"],
  tertiary: ["#ffffff", "#8f8f8f"],
  minor: ["#ffffff", "#bbbbbb"],
} as const;

type RoadClass = keyof typeof cartoRoads;

/** Carto area and line colours by Liberty layer id. */
const cartoLayers: Record<string, [property: string, color: string]> = {
  background: ["background-color", "#f2efe9"],
  park: ["fill-color", "#c8facc"],
  landuse_residential: ["fill-color", "#e0dfdf"],
  landcover_wood: ["fill-color", "#add19e"],
  landcover_grass: ["fill-color", "#cdebb0"],
  landuse_cemetery: ["fill-color", "#aacbaf"],
  water: ["fill-color", "#aad3df"],
  waterway_river: ["line-color", "#aad3df"],
  waterway_other: ["line-color", "#aad3df"],
  waterway_tunnel: ["line-color", "#aad3df"],
  building: ["fill-color", "#d9d0c9"],
  "building-3d": ["fill-extrusion-color", "#d9d0c9"],
};

/** Colour by feature class, for Liberty layers that draw several road classes at once. */
function byClass(classes: RoadClass[], part: 0 | 1, fallback: RoadClass): unknown {
  return [
    "match",
    ["get", "class"],
    ...classes.flatMap((name) => [name, cartoRoads[name][part]]),
    cartoRoads[fallback][part],
  ];
}

/** The road classes a Liberty road layer draws, from its id without the tunnel_/road_/bridge_ prefix and _casing. */
const roadLayerClasses: Record<string, RoadClass[]> = {
  motorway: ["motorway"],
  motorway_link: ["motorway"],
  trunk_primary: ["trunk", "primary"],
  secondary_tertiary: ["secondary", "tertiary"],
  link: ["motorway", "trunk", "primary", "secondary", "tertiary"],
  minor: ["minor"],
  street: ["minor"],
  service_track: ["minor"],
};

export function cartoRoadColor(layerId: string): unknown {
  const match = /^(?:tunnel|road|bridge)_(.+?)(_casing)?$/.exec(layerId);
  const classes = match && roadLayerClasses[match[1]];
  if (!classes) return null;
  const part = match[2] ? 1 : 0;
  return classes.length === 1 ? cartoRoads[classes[0]][part] : byClass(classes, part, classes[classes.length - 1]);
}

export function applyCartoPalette<T extends { layers: StyleLayer[] }>(style: T): T {
  const carto = structuredClone(style);
  for (const layer of carto.layers) {
    const area = cartoLayers[layer.id];
    if (area) {
      layer.paint = { ...layer.paint, [area[0]]: area[1] };
      continue;
    }
    if (layer.type !== "line") continue;
    const road = cartoRoadColor(layer.id);
    if (road) layer.paint = { ...layer.paint, "line-color": road };
  }
  return carto;
}
