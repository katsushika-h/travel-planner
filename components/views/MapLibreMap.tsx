"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreInstance, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { useResolvedTheme } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import { markerColor, markerHtml, markerSize, overlayInsets, popupContent, type MarkerState } from "./map-markers";

/** Keyless OpenFreeMap styles (see docs/work/3d-map-poc.md); MapLibre shows their attribution. */
const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// MapLibre 6 finds its worker next to its own module, which a bundled chunk is not; let the bundler emit the file.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

const BUILDINGS_LAYER = "building-3d";
/** Buildings extrude from this zoom (as in the Liberty style). */
const BUILDINGS_MIN_ZOOM = 14;
/** Fits at city scale or closer tilt the camera; a whole-country trip stays flat. */
const TILT_MIN_ZOOM = 12;

/** Adds the extruded buildings layer when a style lacks one (Dark has only flat outlines), coloured from tokens. */
function ensureBuildings(map: MapLibreInstance) {
  if (map.getLayer(BUILDINGS_LAYER)) return;
  const tokens = getComputedStyle(document.documentElement);
  // `--surface` disappears into the near-black Dark style; the faint ink tone reads as grey blocks at this opacity.
  const color = tokens.getPropertyValue("--faint").trim() || "#8a8a88";
  const firstSymbol = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: BUILDINGS_LAYER,
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: BUILDINGS_MIN_ZOOM,
      paint: {
        "fill-extrusion-color": color,
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        "fill-extrusion-opacity": 0.45,
      },
    },
    firstSymbol,
  );
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreInstance | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onFailure });
  const themeRef = useRef(theme);
  const lastFitRef = useRef("");

  useEffect(() => {
    callbacksRef.current = { onSelect, onFailure };
  }, [onFailure, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreInstance;
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URLS[themeRef.current],
        center: [0, 20],
        zoom: 1,
        attributionControl: { compact: false },
      });
    } catch {
      callbacksRef.current.onFailure?.();
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
    let styleLoaded = false;
    map.on("style.load", () => {
      styleLoaded = true;
      ensureBuildings(map);
    });
    map.on("error", (event) => {
      // Only a style that never loaded is fatal; a missing tile or glyph is not.
      if (!styleLoaded) callbacksRef.current.onFailure?.();
      console.warn("Map error", event.error);
    });
    mapRef.current = map;
    const markers = markersRef.current;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
      lastFitRef.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(STYLE_URLS[theme]);
  }, [theme]);

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
