"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreInstance, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { filterStyle } from "@/lib/css-filter-style";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { applyCartoPalette } from "@/lib/osm-carto-style";
import { useResolvedTheme } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import { markerColor, markerHtml, markerSize, overlayInsets, popupContent, type MarkerState } from "./map-markers";

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
 * walls, and walls darkening toward the base through MapLibre's `fill-extrusion-vertical-gradient` (at the default
 * light, up to 16% at the base). Buildings are opaque so that base shading is not washed out by the ground.
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

type SafariGestureEvent = Event & { rotation: number; scale: number };

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
  const container = map.getCanvasContainer();
  map.dragRotate.disable();

  let last: { x: number; y: number } | null = null;
  const move = (event: MouseEvent) => {
    if (!last) return;
    const pitch = map.getPitch() - (event.clientY - last.y) * 0.5;
    map.jumpTo({
      bearing: map.getBearing() + (event.clientX - last.x) * 0.8,
      pitch: Math.min(map.getMaxPitch(), Math.max(map.getMinPitch(), pitch)),
    });
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
    map.panBy([event.deltaX, event.deltaY], { animate: false });
  };

  // iOS Safari sends gesture events alongside touches, which MapLibre already handles; only a trackpad needs these.
  let touching = false;
  const touch = (event: TouchEvent) => {
    touching = event.touches.length > 0;
  };
  let gesture: { bearing: number; zoom: number } | null = null;
  const gestureStart = (event: Event) => {
    if (touching) return;
    event.preventDefault();
    gesture = { bearing: map.getBearing(), zoom: map.getZoom() };
  };
  const gestureChange = (event: Event) => {
    if (!gesture || touching) return;
    event.preventDefault();
    const { rotation, scale } = event as SafariGestureEvent;
    map.jumpTo({
      bearing: gesture.bearing - rotation,
      // Skip the scale while the same pinch also arrives as Ctrl+wheel events, which already zoom.
      ...(event.timeStamp - pinchAt > 200 ? { zoom: gesture.zoom + Math.log2(scale) } : {}),
    });
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

function setMarkerState(marker: Marker, color: string, number: number | undefined, state: MarkerState) {
  const element = marker.getElement();
  const size = markerSize(number != null, state);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.zIndex = state === "dimmed" ? "0" : "1";
  element.innerHTML = markerHtml(color, number, state);
  marker.getPopup()?.setOffset(size / 2);
}

export interface MapLibreMapProps {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  onSelect: (item: TravelObject) => void;
  markerNumbers?: ReadonlyMap<string, number>;
  fitKey?: string;
  /** Items drawn as small muted dots (for example, stops outside a selected day). */
  dimmedItemIds?: ReadonlySet<string>;
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
  fitKey,
  dimmedItemIds,
  onFailure,
  className = "min-h-[360px] flex-1",
}: MapLibreMapProps) {
  const theme = useResolvedTheme();
  const themeRef = useRef(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreInstance | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onFailure });
  const lastFitRef = useRef("");

  useEffect(() => {
    callbacksRef.current = { onSelect, onFailure };
  }, [onFailure, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
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
    let styleLoaded = false;
    map.on("style.load", () => {
      styleLoaded = true;
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
      lastFitRef.current = "";
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
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([item.location!.lng!, item.location!.lat!])
        .setPopup(new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setDOMContent(popup))
        .addTo(map);
      setMarkerState(marker, markerColor(item.type, typeColors), number, "default");
      markersRef.current.set(item.id, marker);
    }
  }, [items, markerNumbers, trip, typeColors]);

  useEffect(() => {
    for (const item of items) {
      const marker = markersRef.current.get(item.id);
      if (!marker) continue;
      const state: MarkerState = dimmedItemIds?.has(item.id) ? "dimmed" : "default";
      setMarkerState(marker, markerColor(item.type, typeColors), markerNumbers?.get(item.id), state);
    }
  }, [dimmedItemIds, items, markerNumbers, typeColors]);

  useEffect(() => {
    const map = mapRef.current;
    const located = items.filter((item) => hasMapCoordinates(item.location));
    const focused = located.filter((item) => !dimmedItemIds?.has(item.id));
    const points = (focused.length ? focused : located).map(
      (item) => [item.location!.lng!, item.location!.lat!] as [number, number],
    );
    const nextFit = fitKey ?? "items";
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
  }, [dimmedItemIds, fitKey, items]);

  return <div ref={containerRef} className={`travel-maplibre-map relative z-0 isolate text-sm ${className}`} />;
}
