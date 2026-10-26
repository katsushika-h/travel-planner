"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, IControl, Map as MapLibreInstance, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { filterStyle } from "@/lib/css-filter-style";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { applyCartoPalette } from "@/lib/osm-carto-style";
import { useResolvedTheme, useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import {
  PARKING_MARKER_SIZE,
  markerColor,
  markerHtml,
  markerSize,
  overlayInsets,
  parkingHtml,
  popupContent,
  type MapLeg,
  type MapParkingMarker,
  type MarkerState,
} from "./map-markers";

/** Keyless OpenFreeMap style (see docs/work/3d-map-poc.md); MapLibre shows its attribution. */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Flat openstreetmap.org raster tiles, used once if the OpenFreeMap style cannot be fetched; there are no buildings. */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Only a style that has not loaded yet is worth replacing, and only once; a missing tile or glyph is not. */
const shouldUseFallbackStyle = (styleLoaded: boolean, usingFallback: boolean) => !styleLoaded && !usingFallback;

/** The `--map-tile-filter` token for the current theme; read when a style is applied, after the theme class is set. */
const tileFilter = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--map-tile-filter").trim() || "none";

// MapLibre 6 finds its worker next to its own module, which a bundled chunk is not; let the bundler emit the file.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** Fits at city scale or closer tilt the camera; a whole-country trip stays flat. */
const TILT_MIN_ZOOM = 12;

/**
 * Liberty recoloured with the OSM Carto palette, so the map reads like the openstreetmap.org tiles. Dark mode runs
 * those colours through the `--map-tile-filter` token, while the canvas itself stays unfiltered and buildings keep
 * normal lighting: roofs lit more than walls, and walls darkening smoothly by up to 25% toward the base relative to
 * each building's own height (MapLibre's vertical gradient, re-formulated by `scripts/patch-maplibre-shader.mjs`).
 * Buildings are opaque so that base shading is not washed out by the ground. `diff: false` rebuilds the style on a
 * theme switch. The raster fallback goes through the same filter, applied
 * directly: `transformStyle` would wait for a style that failed to load, which never comes.
 */
function applyStyle(map: MapLibreInstance, fallback: boolean) {
  if (fallback) {
    map.setStyle(filterStyle(FALLBACK_STYLE, tileFilter()), { diff: false });
    return;
  }
  map.setStyle(STYLE_URL, {
    diff: false,
    transformStyle: (_previous, next) => {
      const carto = applyCartoPalette(next);
      for (const layer of carto.layers)
        if (layer.type === "fill-extrusion")
          layer.paint = { ...layer.paint, "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true };
      return filterStyle(carto, tileFilter());
    },
  });
}

const LEG_SOURCE = "route-legs";
const LEG_LAYERS = [
  { id: "route-legs-drive", mode: "drive" },
  { id: "route-legs-walk", mode: "walk" },
] as const;
const ROUTE_ATTRIBUTION = 'Routes &copy; <a href="https://openrouteservice.org/">openrouteservice</a> by HeiGIT';

/**
 * Draws routed legs as one GeoJSON source and a line layer per mode (a dash pattern cannot vary per feature), in the
 * accent colour, dashed for walking. The layers sit below the buildings so a building in front hides the route behind
 * it. The source, and with it the routes' attribution, exists only while there are legs. Called on every `style.load`,
 * because a theme switch rebuilds the style, and whenever the legs change.
 */
function drawLegs(map: MapLibreInstance, legs: MapLeg[] | undefined) {
  const drawn = (legs ?? []).filter((leg) => leg.positions.length >= 2);
  const source = map.getSource(LEG_SOURCE) as GeoJSONSource | undefined;
  if (!drawn.length) {
    for (const { id } of LEG_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (source) map.removeSource(LEG_SOURCE);
    return;
  }
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: drawn.map((leg) => ({
      type: "Feature",
      properties: { mode: leg.mode },
      geometry: { type: "LineString", coordinates: leg.positions.map(([lat, lng]) => [lng, lat]) },
    })),
  };
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(LEG_SOURCE, { type: "geojson", data, attribution: ROUTE_ATTRIBUTION });
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d9381e";
  const beforeId = map.getLayer("building-3d") ? "building-3d" : undefined;
  for (const { id, mode } of LEG_LAYERS)
    map.addLayer(
      {
        id,
        type: "line",
        source: LEG_SOURCE,
        filter: ["==", ["get", "mode"], mode],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": color,
          // Wider as the map zooms in, so routes stay readable between buildings at street level.
          "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 3, 17, 9],
          "line-opacity": 0.85,
          ...(mode === "walk" ? { "line-dasharray": [1, 1.5] } : {}),
        },
      },
      beforeId,
    );
}

export type MapSuggestion = { id: string; name: string; lat: number; lng: number; type: string };

export type NearbyFeatureLike = {
  id?: unknown;
  properties?: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown };
};

export type NearbyLayer = {
  anchor: { lat: number; lng: number };
  radiusMeters: number;
  /** False leaves the camera alone (the anchor follows the map centre); default true fits the circle. */
  fit?: boolean;
  suggestions: MapSuggestion[];
  hoveredSuggestionId?: string | null;
  onHoverSuggestion?: (id: string | null) => void;
  onSelectSuggestion?: (id: string) => void;
};

const RING_SOURCE = "nearby-ring";
const RING_FILL = "nearby-ring-fill";
const RING_LINE = "nearby-ring-line";
const NEARBY_MIN_ZOOM = 14;
const NEARBY_MAX_ZOOM = 17;

/** A circle of `radiusMeters` around the anchor as a closed 64-segment polygon (flat-earth approximation). */
function circlePolygon(anchor: { lat: number; lng: number }, radiusMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.max(Math.cos((anchor.lat * Math.PI) / 180), 0.01));
  const ring: [number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    ring.push([anchor.lng + dLng * Math.cos(angle), anchor.lat + dLat * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function circleBounds(anchor: { lat: number; lng: number }, radiusMeters: number) {
  const ring = circlePolygon(anchor, radiusMeters).geometry.coordinates[0];
  return ring.reduce(
    (box, point) => box.extend(point as [number, number]),
    new maplibregl.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]),
  );
}

/**
 * Draws the nearby radius as a GeoJSON polygon with a light accent fill and a dashed accent outline, below the
 * buildings. Called on every `style.load` (a theme switch or the raster fallback rebuilds the style, which is also
 * when `--accent` is re-read) and whenever the anchor or radius changes.
 */
function drawRing(map: MapLibreInstance, nearby: Pick<NearbyLayer, "anchor" | "radiusMeters"> | undefined) {
  const source = map.getSource(RING_SOURCE) as GeoJSONSource | undefined;
  if (!nearby) {
    for (const id of [RING_FILL, RING_LINE]) if (map.getLayer(id)) map.removeLayer(id);
    if (source) map.removeSource(RING_SOURCE);
    return;
  }
  const data = circlePolygon(nearby.anchor, nearby.radiusMeters);
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(RING_SOURCE, { type: "geojson", data });
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d9381e";
  const beforeId = map.getLayer("building-3d") ? "building-3d" : undefined;
  map.addLayer(
    { id: RING_FILL, type: "fill", source: RING_SOURCE, paint: { "fill-color": color, "fill-opacity": 0.08 } },
    beforeId,
  );
  map.addLayer(
    {
      id: RING_LINE,
      type: "line",
      source: RING_SOURCE,
      paint: { "line-color": color, "line-width": 2, "line-opacity": 0.85, "line-dasharray": [2, 2] },
    },
    beforeId,
  );
}

/** A "3D"/"2D" button under the zoom buttons that shows and sets the shared `map3d` preference. */
class Map3dControl implements IControl {
  private container = document.createElement("div");
  private button = document.createElement("button");

  constructor(
    private on: boolean,
    private onToggle: (on: boolean) => void,
  ) {
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    this.button.type = "button";
    this.button.className = "travel-map-3d-toggle";
    this.button.addEventListener("click", () => this.onToggle(!this.on));
    this.container.append(this.button);
    this.set(on);
  }

  set(on: boolean) {
    this.on = on;
    this.button.textContent = on ? "3D" : "2D";
    this.button.title = on ? "Switch to a flat 2D map" : "Switch to a tilted 3D map";
    this.button.setAttribute("aria-label", this.button.title);
    this.button.setAttribute("aria-pressed", String(on));
  }

  onAdd() {
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }
}

type SafariGestureEvent = Event & { rotation: number; scale: number; clientX: number; clientY: number };

/** Degrees of rotation per pixel of sideways drag (MapLibre's own drag-rotate uses 0.8, which felt too fast). */
const DRAG_ROTATE_DEGREES_PER_PIXEL = 0.4;

/**
 * Map-app gestures on top of MapLibre's defaults (drag to pan, double-click to zoom, touch pinch and twist):
 * - Cmd+drag, Ctrl+drag or right-drag rotates (sideways) and tilts (up and down), turning the same way as Google Maps.
 *   MapLibre's own Ctrl/right-drag turns the other way, so its drag-rotate is switched off.
 * - On a trackpad, two-finger scrolling pans, as in Apple Maps; pinch (a Ctrl+wheel event) and a mouse wheel zoom.
 * - Safari reports a trackpad twist (and pinch) as gesture events, which rotate (and zoom) the map. Other browsers
 *   never pass a trackpad twist to the page.
 * Listeners run in the capture phase so MapLibre's handlers never see what these take over.
 */
function mapAppGestures(map: MapLibreInstance) {
  // The jumps and pans below pass `originalEvent`, so they count as user moves like MapLibre's own gestures.
  const container = map.getCanvasContainer();
  map.dragRotate.disable();

  let last: { x: number; y: number } | null = null;
  const move = (event: MouseEvent) => {
    if (!last) return;
    const pitch = map.getPitch() - (event.clientY - last.y) * 0.5;
    map.jumpTo(
      {
        bearing: map.getBearing() + (event.clientX - last.x) * DRAG_ROTATE_DEGREES_PER_PIXEL,
        pitch: Math.min(map.getMaxPitch(), Math.max(map.getMinPitch(), pitch)),
      },
      { originalEvent: event },
    );
    last = { x: event.clientX, y: event.clientY };
  };
  const end = () => {
    last = null;
    container.style.removeProperty("cursor");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", end);
  };
  const start = (event: MouseEvent) => {
    const rotating = event.button === 2 || (event.button === 0 && (event.metaKey || event.ctrlKey));
    if (!rotating) return;
    event.stopPropagation();
    if (event.type !== "mousedown" || last) return;
    event.preventDefault();
    last = { x: event.clientX, y: event.clientY };
    container.style.cursor = "grabbing";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };
  const noMenu = (event: MouseEvent) => event.preventDefault();

  // Chrome and Safari report a trackpad's wheelDeltaY as -3 × deltaY and a mouse wheel in notches of 120. Firefox
  // has no wheelDeltaY, so there only sideways scrolling is known to be a trackpad.
  let pinchAt = -Infinity;
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
      pinchAt = event.timeStamp;
      return;
    }
    const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    const trackpad =
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
      (event.deltaX !== 0 || (legacy !== undefined && legacy !== 0 && legacy === -3 * event.deltaY));
    if (!trackpad) return;
    event.stopPropagation();
    event.preventDefault();
    map.panBy([event.deltaX, event.deltaY], { animate: false }, { originalEvent: event });
  };

  // iOS Safari sends gesture events alongside touches, which MapLibre already handles; only a trackpad needs these.
  let touching = false;
  const touch = (event: TouchEvent) => {
    touching = event.touches.length > 0;
  };
  // The pinch and twist stay anchored where they started, as in Apple Maps, not at the map's centre.
  let gesture: { bearing: number; zoom: number; around: maplibregl.LngLat } | null = null;
  const gestureStart = (event: Event) => {
    if (touching) return;
    event.preventDefault();
    const { clientX, clientY } = event as SafariGestureEvent;
    const box = container.getBoundingClientRect();
    const around = map.unproject([clientX - box.left, clientY - box.top]);
    gesture = { bearing: map.getBearing(), zoom: map.getZoom(), around };
  };
  const gestureChange = (event: Event) => {
    if (!gesture || touching) return;
    event.preventDefault();
    const { rotation, scale } = event as SafariGestureEvent;
    map.easeTo(
      {
        bearing: gesture.bearing - rotation,
        // Skip the scale while the same pinch also arrives as Ctrl+wheel events, which already zoom.
        ...(event.timeStamp - pinchAt > 200 ? { zoom: gesture.zoom + Math.log2(scale) } : {}),
        around: gesture.around,
        duration: 0,
      },
      { originalEvent: event },
    );
  };
  const gestureEnd = () => {
    gesture = null;
  };

  const listeners: [string, EventListener, AddEventListenerOptions][] = [
    ["pointerdown", start as EventListener, { capture: true }],
    ["mousedown", start as EventListener, { capture: true }],
    ["contextmenu", noMenu as EventListener, { capture: true }],
    ["wheel", wheel as EventListener, { capture: true, passive: false }],
    ["touchstart", touch as EventListener, { capture: true, passive: true }],
    ["touchend", touch as EventListener, { capture: true, passive: true }],
    ["touchcancel", touch as EventListener, { capture: true, passive: true }],
    ["gesturestart", gestureStart, { capture: true }],
    ["gesturechange", gestureChange, { capture: true }],
    ["gestureend", gestureEnd, { capture: true }],
  ];
  for (const [type, listener, options] of listeners) container.addEventListener(type, listener, options);
  return () => {
    end();
    for (const [type, listener, options] of listeners) container.removeEventListener(type, listener, options);
  };
}

/** Stacking of pins, lowest first: parking "P" (0), dimmed, default, active, then the preview pin. */
const MARKER_Z_INDEX: Record<MarkerState, string> = { dimmed: "1", default: "2", active: "3", preview: "4" };

function setMarkerState(marker: Marker, color: string, number: number | undefined, state: MarkerState) {
  const element = marker.getElement();
  const size = markerSize(number != null, state);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.zIndex = MARKER_Z_INDEX[state];
  element.innerHTML = markerHtml(color, number, state);
  marker.getPopup()?.setOffset(size / 2);
}

export interface MapLibreMapProps {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  onSelect: (item: TravelObject) => void;
  /** Replaces `onSelect` for clicks on a stop's pin; the popup's "Open details" button still calls `onSelect`. */
  onMarkerClick?: (item: TravelObject) => void;
  markerNumbers?: ReadonlyMap<string, number>;
  selectedItemId?: string | null;
  hoveredItemId?: string | null;
  onHover?: (itemId: string | null) => void;
  fitKey?: string;
  recenterToken?: number;
  /** Called when the user (not a fit or flight) moves, zooms or rotates the map. */
  onUserMove?: () => void;
  /** Items drawn as small muted dots (for example, stops outside a selected day). */
  dimmedItemIds?: ReadonlySet<string>;
  /** Routed leg lines, drawn in the accent colour (dashed for walking) under the buildings. */
  legs?: MapLeg[];
  /** Small "P" markers for saved car parks; they show a title tooltip and open nothing. */
  parkingMarkers?: MapParkingMarker[];
  /** An item outside `items` (a selected idea) shown as a temporary dashed pin; the map frames it with the day. */
  previewItem?: TravelObject | null;
  /** Nearby mode: a radius ring, suggestion dots and a circle fit that takes precedence over `fitKey`. */
  nearby?: NearbyLayer;
  /** Reports the vector tiles' POI features on each map `idle`, with the zoom and whether the circle is in view. */
  onPoiFeatures?: (
    features: NearbyFeatureLike[],
    state: { zoom: number; circleInView: boolean; center: { lat: number; lng: number } },
  ) => void;
  className?: string;
}

/** WebGL map with extruded OpenStreetMap buildings (flat when the 2D preference is on) for the Map and Plan views. */
export function MapLibreMap({
  trip,
  items,
  typeColors,
  onSelect,
  onMarkerClick,
  markerNumbers,
  selectedItemId = null,
  hoveredItemId = null,
  onHover,
  fitKey,
  recenterToken = 0,
  onUserMove,
  dimmedItemIds,
  legs,
  parkingMarkers,
  previewItem = null,
  nearby,
  onPoiFeatures,
  className = "min-h-[360px] flex-1",
}: MapLibreMapProps) {
  const theme = useResolvedTheme();
  const themeRef = useRef(theme);
  const map3d = useTravelStore((state) => state.map3d);
  const map3dRef = useRef(map3d);
  const toggleRef = useRef<Map3dControl | null>(null);
  const fallbackRef = useRef(false);
  const [unsupported, setUnsupported] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreInstance | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onMarkerClick, onHover, onUserMove });
  const legsRef = useRef(legs);
  const styleReadyRef = useRef(false);
  const lastFitRef = useRef("");
  const lastSelectedItemRef = useRef<string | null | undefined>(undefined);
  const nearbyRef = useRef<Pick<NearbyLayer, "anchor" | "radiusMeters"> | undefined>(undefined);
  const poiRef = useRef(onPoiFeatures);

  useEffect(() => {
    poiRef.current = onPoiFeatures;
  }, [onPoiFeatures]);

  useEffect(() => {
    callbacksRef.current = { onSelect, onMarkerClick, onHover, onUserMove };
  }, [onHover, onMarkerClick, onSelect, onUserMove]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    styleReadyRef.current = false;
    applyStyle(map, fallbackRef.current);
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreInstance;
    try {
      map = new maplibregl.Map({
        container,
        center: [0, 20],
        zoom: 1,
        attributionControl: { compact: false },
      });
    } catch {
      // The constructor throws without WebGL; this runs once, to swap the map for a note.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnsupported(true);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
    const toggle = new Map3dControl(map3dRef.current, (on) => useTravelStore.getState().setMap3d(on));
    map.addControl(toggle, "top-left");
    toggleRef.current = toggle;
    if (!map3dRef.current) map.setMaxPitch(0);
    const stopGestures = mapAppGestures(map);
    // Only camera changes that carry the user's pointer, wheel or touch event count; fits and flights have none.
    map.on("movestart", (event) => {
      if ((event as { originalEvent?: Event }).originalEvent) callbacksRef.current.onUserMove?.();
    });
    let styleLoaded = false;
    map.on("style.load", () => {
      styleLoaded = true;
      styleReadyRef.current = true;
      drawLegs(map, legsRef.current);
      drawRing(map, nearbyRef.current);
    });
    // Reported only once the map settles, never per frame; the raster fallback has no POI source, so it reports [].
    map.on("idle", () => {
      const report = poiRef.current;
      const circle = nearbyRef.current;
      if (!report || !styleReadyRef.current) return;
      const features = map.getSource("openmaptiles")
        ? (map.querySourceFeatures("openmaptiles", { sourceLayer: "poi" }) as unknown as NearbyFeatureLike[])
        : [];
      const circleInView = circle
        ? (() => {
            const view = map.getBounds();
            const box = circleBounds(circle.anchor, circle.radiusMeters);
            return view.contains(box.getSouthWest()) && view.contains(box.getNorthEast());
          })()
        : false;
      const { lat, lng } = map.getCenter();
      report(features, { zoom: map.getZoom(), circleInView, center: { lat, lng } });
    });
    map.on("error", (event) => {
      if (shouldUseFallbackStyle(styleLoaded, fallbackRef.current)) {
        fallbackRef.current = true;
        applyStyle(map, true);
      }
      console.warn("Map error", event.error);
    });
    applyStyle(map, fallbackRef.current);
    mapRef.current = map;
    const markers = markersRef.current;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      stopGestures();
      map.remove();
      mapRef.current = null;
      toggleRef.current = null;
      markers.clear();
      styleReadyRef.current = false;
      lastFitRef.current = "";
      lastSelectedItemRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const wasOn = map3dRef.current;
    map3dRef.current = map3d;
    toggleRef.current?.set(map3d);
    if (!map) return;
    // Flattens immediately when off; back on, a city-scale view tilts again, as a fit would.
    map.setMaxPitch(map3d ? null : 0);
    if (map3d && !wasOn && map.getZoom() >= TILT_MIN_ZOOM) map.easeTo({ pitch: 45, duration: 400 });
  }, [map3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();
    for (const item of items.filter((item) => hasMapCoordinates(item.location))) {
      const number = markerNumbers?.get(item.id);
      const element = document.createElement("div");
      element.className = "travel-map-marker";
      element.title = item.title || "Untitled item";
      element.style.cursor = "pointer";
      const popup = popupContent(item, number);
      popup.querySelector("button")?.addEventListener("click", () => callbacksRef.current.onSelect(item));
      element.addEventListener("click", () => {
        const { onMarkerClick, onSelect } = callbacksRef.current;
        (onMarkerClick ?? onSelect)(item);
      });
      element.addEventListener("mouseenter", () => callbacksRef.current.onHover?.(item.id));
      element.addEventListener("mouseleave", () => callbacksRef.current.onHover?.(null));
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([item.location!.lng!, item.location!.lat!])
        .setPopup(new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setDOMContent(popup))
        .addTo(map);
      setMarkerState(marker, markerColor(item.type, typeColors), number, "default");
      markersRef.current.set(item.id, marker);
    }
  }, [items, markerNumbers, trip, typeColors]);

  useEffect(() => {
    legsRef.current = legs;
    const map = mapRef.current;
    // Before the style loads (or while a theme switch rebuilds it), `style.load` draws the latest legs.
    if (map && styleReadyRef.current) drawLegs(map, legs);
  }, [legs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = (parkingMarkers ?? []).map((spot) => {
      const element = document.createElement("div");
      element.className = "travel-map-marker";
      element.title = spot.name ? `Parking: ${spot.name}` : "Parking";
      element.style.width = `${PARKING_MARKER_SIZE}px`;
      element.style.height = `${PARKING_MARKER_SIZE}px`;
      element.style.zIndex = "0";
      element.style.pointerEvents = "none";
      element.innerHTML = parkingHtml();
      return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([spot.lng, spot.lat]).addTo(map);
    });
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [parkingMarkers]);

  const nearbyLat = nearby?.anchor.lat;
  const nearbyLng = nearby?.anchor.lng;
  const nearbyRadius = nearby?.radiusMeters;
  const hasNearby = nearby != null;
  const nearbyFit = nearby?.fit ?? true;

  useEffect(() => {
    nearbyRef.current =
      nearbyLat != null && nearbyLng != null && nearbyRadius != null
        ? { anchor: { lat: nearbyLat, lng: nearbyLng }, radiusMeters: nearbyRadius }
        : undefined;
    const map = mapRef.current;
    // Before the style loads (or while a theme switch rebuilds it), `style.load` draws the latest ring.
    if (map && styleReadyRef.current) drawRing(map, nearbyRef.current);
  }, [nearbyLat, nearbyLng, nearbyRadius]);

  // Fits the circle, clamped to zoom 14-17 (places only exist in zoom-14 tiles), then reports once the map settles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !nearbyFit || nearbyLat == null || nearbyLng == null || nearbyRadius == null) return;
    const timer = window.setTimeout(() => {
      map.resize();
      const inset = overlayInsets(map.getContainer());
      const camera = map.cameraForBounds(circleBounds({ lat: nearbyLat, lng: nearbyLng }, nearbyRadius), {
        padding: { top: 32, bottom: 32, left: 32 + inset.left, right: 32 + inset.right },
        maxZoom: NEARBY_MAX_ZOOM,
      });
      if (!camera?.center) return;
      map.easeTo({
        ...camera,
        zoom: Math.min(NEARBY_MAX_ZOOM, Math.max(NEARBY_MIN_ZOOM, camera.zoom ?? NEARBY_MIN_ZOOM)),
        pitch: 0,
        bearing: 0,
        duration: 800,
      });
      map.triggerRepaint();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [nearbyFit, nearbyLat, nearbyLng, nearbyRadius]);

  const nearbyCallbacksRef = useRef<Pick<NearbyLayer, "onHoverSuggestion" | "onSelectSuggestion">>(undefined);
  useEffect(() => {
    nearbyCallbacksRef.current = nearby
      ? { onHoverSuggestion: nearby.onHoverSuggestion, onSelectSuggestion: nearby.onSelectSuggestion }
      : undefined;
  }, [nearby]);

  const suggestions = nearby?.suggestions;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !suggestions?.length) return;
    const markers = suggestions.map((place) => {
      const element = document.createElement("div");
      element.className = "travel-map-suggestion";
      element.title = place.name;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", place.name);
      const dot = document.createElement("span");
      dot.className = "travel-map-suggestion-dot";
      dot.style.background = markerColor(place.type, typeColors);
      element.append(dot);
      element.dataset.suggestionId = place.id;
      element.addEventListener("mouseenter", () => nearbyCallbacksRef.current?.onHoverSuggestion?.(place.id));
      element.addEventListener("mouseleave", () => nearbyCallbacksRef.current?.onHoverSuggestion?.(null));
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        nearbyCallbacksRef.current?.onSelectSuggestion?.(place.id);
      });
      return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map);
    });
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [suggestions, typeColors]);

  const hoveredSuggestionId = nearby?.hoveredSuggestionId ?? null;
  useEffect(() => {
    const container = mapRef.current?.getContainer();
    if (!container) return;
    for (const element of container.querySelectorAll<HTMLElement>("[data-suggestion-id]"))
      element.classList.toggle("is-hovered", element.dataset.suggestionId === hoveredSuggestionId);
  }, [hoveredSuggestionId, suggestions, typeColors]);

  const preview = previewItem && hasMapCoordinates(previewItem.location) ? previewItem : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !preview) return;
    const element = document.createElement("div");
    element.className = "travel-map-marker";
    element.title = preview.title || "Untitled item";
    element.style.cursor = "pointer";
    const popup = popupContent(preview);
    popup.querySelector("button")?.remove();
    const marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([preview.location!.lng!, preview.location!.lat!])
      .setPopup(new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setDOMContent(popup))
      .addTo(map);
    setMarkerState(marker, markerColor(preview.type, typeColors), undefined, "preview");
    return () => {
      marker.remove();
    };
  }, [preview, typeColors]);

  useEffect(() => {
    for (const item of items) {
      const marker = markersRef.current.get(item.id);
      if (!marker) continue;
      const state: MarkerState =
        item.id === selectedItemId || item.id === hoveredItemId
          ? "active"
          : dimmedItemIds?.has(item.id)
            ? "dimmed"
            : "default";
      setMarkerState(marker, markerColor(item.type, typeColors), markerNumbers?.get(item.id), state);
    }
  }, [dimmedItemIds, hoveredItemId, items, markerNumbers, selectedItemId, typeColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastSelectedItemRef.current === selectedItemId) return;
    lastSelectedItemRef.current = selectedItemId;
    if (!selectedItemId) {
      for (const marker of markersRef.current.values()) if (marker.getPopup()?.isOpen()) marker.togglePopup();
      return;
    }
    const selected = items.find((item) => item.id === selectedItemId && hasMapCoordinates(item.location));
    if (!selected) return;
    const target = {
      center: [selected.location!.lng!, selected.location!.lat!] as [number, number],
      zoom: Math.max(map.getZoom(), 16),
      pitch: map3dRef.current ? Math.max(map.getPitch(), 45) : 0,
    };
    const container = map.getContainer();
    if (container.clientWidth > 0 && container.clientHeight > 0) map.flyTo({ ...target, duration: 550 });
    else map.jumpTo(target);
    // One popup at a time: close the previous stop's before opening this one's.
    for (const [id, other] of markersRef.current)
      if (id !== selectedItemId && other.getPopup()?.isOpen()) other.togglePopup();
    const marker = markersRef.current.get(selectedItemId);
    if (marker && !marker.getPopup()?.isOpen()) marker.togglePopup();
  }, [items, selectedItemId]);

  useEffect(() => {
    const map = mapRef.current;
    const located = items.filter((item) => hasMapCoordinates(item.location));
    const focused = located.filter((item) => !dimmedItemIds?.has(item.id));
    const points = [...(focused.length ? focused : located), ...(preview ? [preview] : [])].map(
      (item) => [item.location!.lng!, item.location!.lat!] as [number, number],
    );
    // Showing or clearing a preview pin reframes the day so the pin is seen in relation to its stops.
    const nextFit = `${fitKey ?? "items"}:${recenterToken}:${preview?.id ?? ""}`;
    if (!map) return;
    // The nearby circle owns the camera; forgetting the last fit makes leaving nearby mode refit the items.
    if (hasNearby) {
      lastFitRef.current = "";
      return;
    }
    if (lastFitRef.current === nextFit) return;
    const timer = window.setTimeout(() => {
      map.resize();
      if (!points.length) return;
      // Marked only once the fit runs: a re-render that cancels this timer (Plan's stops settle just after mount)
      // must not leave the day unfitted.
      lastFitRef.current = nextFit;
      const bounds = points.reduce(
        (box, point) => box.extend(point),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      const inset = overlayInsets(map.getContainer());
      const camera = map.cameraForBounds(bounds, {
        padding: { top: 48, bottom: 48, left: 48 + inset.left, right: 48 + inset.right },
        maxZoom: points.length === 1 ? 16 : 15.5,
      });
      if (!camera?.zoom) return;
      // City-scale fits tilt; a whole-country trip stays flat. The fit ignores pitch, and perspective spreads the
      // near edge, so a tilted fit backs off half a zoom level to keep edge pins in frame.
      const tilted = map3dRef.current && camera.zoom >= TILT_MIN_ZOOM;
      map.easeTo({
        ...camera,
        zoom: tilted ? camera.zoom - 0.5 : camera.zoom,
        pitch: tilted ? 45 : 0,
        bearing: 0,
        duration: 800,
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [dimmedItemIds, fitKey, hasNearby, items, preview, recenterToken]);

  if (unsupported)
    return (
      <div className={`grid place-items-center bg-surface px-6 text-center text-sm text-muted ${className}`}>
        The map needs WebGL, which this browser has turned off.
      </div>
    );
  return <div ref={containerRef} className={`travel-maplibre-map relative z-0 isolate text-sm ${className}`} />;
}
