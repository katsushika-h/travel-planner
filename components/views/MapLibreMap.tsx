"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreInstance, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { filterStyle } from "@/lib/css-filter-style";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { applyCartoPalette } from "@/lib/osm-carto-style";
import { useResolvedTheme } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import type { MapLeg, MapParkingMarker } from "./LeafletMap";
import {
  PARKING_MARKER_SIZE,
  markerColor,
  markerHtml,
  markerSize,
  overlayInsets,
  parkingHtml,
  popupContent,
  type MarkerState,
} from "./map-markers";

/** Keyless OpenFreeMap style (see docs/work/3d-map-poc.md); MapLibre shows its attribution. */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// MapLibre 6 finds its worker next to its own module, which a bundled chunk is not; let the bundler emit the file.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** Fits at city scale or closer tilt the camera; a whole-country trip stays flat. */
const TILT_MIN_ZOOM = 12;

/**
 * Liberty recoloured with the OSM Carto palette, so the map reads like the Leaflet maps' openstreetmap.org tiles. Dark
 * mode runs those colours through the same `--map-tile-filter` token the Leaflet tiles use, so both maps share one
 * dark palette, while the canvas itself stays unfiltered and buildings keep normal lighting: roofs lit more than
 * walls, and walls darkening smoothly by up to 25% toward the base relative to each building's own height (MapLibre's
 * vertical gradient, re-formulated by `scripts/patch-maplibre-shader.mjs`). Buildings are opaque so that base shading
 * is not washed out by the ground.
 * `diff: false` rebuilds the style on a theme switch.
 */
function applyStyle(map: MapLibreInstance) {
  map.setStyle(STYLE_URL, {
    diff: false,
    transformStyle: (_previous, next) => {
      const carto = applyCartoPalette(next);
      for (const layer of carto.layers)
        if (layer.type === "fill-extrusion")
          layer.paint = { ...layer.paint, "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true };
      // Read when the style arrives, after the theme class has been applied to the page.
      const filter = getComputedStyle(document.documentElement).getPropertyValue("--map-tile-filter").trim();
      return filterStyle(carto, filter || "none");
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
  /** Called when the map cannot start or its style fails, so the caller can fall back to Leaflet. */
  onFailure?: () => void;
  className?: string;
}

/** Proof-of-concept WebGL map with extruded OpenStreetMap buildings, matching the Map tab's use of `LeafletMap`. */
export function MapLibreMap({
  trip,
  items,
  typeColors,
  onSelect,
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
  onFailure,
  className = "min-h-[360px] flex-1",
}: MapLibreMapProps) {
  const theme = useResolvedTheme();
  const themeRef = useRef(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreInstance | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onHover, onUserMove, onFailure });
  const legsRef = useRef(legs);
  const styleReadyRef = useRef(false);
  const lastFitRef = useRef("");
  const lastSelectedItemRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    callbacksRef.current = { onSelect, onHover, onUserMove, onFailure };
  }, [onFailure, onHover, onSelect, onUserMove]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    styleReadyRef.current = false;
    applyStyle(map);
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
      callbacksRef.current.onFailure?.();
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
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
    });
    map.on("error", (event) => {
      // Only a style that never loaded is fatal; a missing tile or glyph is not.
      if (!styleLoaded) callbacksRef.current.onFailure?.();
      console.warn("Map error", event.error);
    });
    applyStyle(map);
    mapRef.current = map;
    const markers = markersRef.current;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      stopGestures();
      map.remove();
      mapRef.current = null;
      markers.clear();
      styleReadyRef.current = false;
      lastFitRef.current = "";
      lastSelectedItemRef.current = undefined;
    };
  }, []);

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
      element.addEventListener("click", () => callbacksRef.current.onSelect(item));
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
      pitch: Math.max(map.getPitch(), 45),
    };
    const container = map.getContainer();
    if (container.clientWidth > 0 && container.clientHeight > 0) map.flyTo({ ...target, duration: 550 });
    else map.jumpTo(target);
    // One popup at a time, as on Leaflet: close the previous stop's before opening this one's.
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
    if (!map || lastFitRef.current === nextFit) return;
    lastFitRef.current = nextFit;
    const timer = window.setTimeout(() => {
      map.resize();
      if (!points.length) return;
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
      const tilted = camera.zoom >= TILT_MIN_ZOOM;
      map.easeTo({
        ...camera,
        zoom: tilted ? camera.zoom - 0.5 : camera.zoom,
        pitch: tilted ? 45 : 0,
        bearing: 0,
        duration: 800,
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [dimmedItemIds, fitKey, items, preview, recenterToken]);

  return <div ref={containerRef} className={`travel-maplibre-map relative z-0 isolate text-sm ${className}`} />;
}
