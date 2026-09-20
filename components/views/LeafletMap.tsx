"use client";

import { useEffect, useRef } from "react";
import L, { type Map as LeafletMapInstance } from "leaflet";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypeColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const typePalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function markerColor(type: string, colors: Record<string, string>) {
  const fallback = defaultTypeColors[type] ?? typePalette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % typePalette.length];
  const candidate = colors[type] ?? fallback;
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function popupContent(item: TravelObject, trip: Trip) {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = item.title || "Untitled item";
  content.appendChild(title);
  const details = document.createElement("div");
  details.style.margin = "4px 0 8px";
  details.style.color = "#57534e";
  const date = item.startDateTime ? new Intl.DateTimeFormat(undefined, { timeZone: trip.timezone, month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }).format(new Date(item.startDateTime)) : "Unscheduled";
  details.textContent = [item.location?.name, item.type, date].filter(Boolean).join(" · ");
  content.appendChild(details);
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = "Open details";
  action.style.color = "#047857";
  action.style.fontWeight = "600";
  action.dataset.openItem = item.id;
  content.appendChild(action);
  return content;
}

export function LeafletMap({ trip, items, typeColors, onSelect }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; onSelect: (item: TravelObject) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map: LeafletMapInstance = L.map(container, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    const markerIcons = new Map<string, L.DivIcon>();
    const bounds: Array<[number, number]> = [];
    for (const item of items) {
      const point: [number, number] = [item.location!.lat!, item.location!.lng!];
      bounds.push(point);
      const popup = popupContent(item, trip);
      const color = markerColor(item.type, typeColors);
      let markerIcon = markerIcons.get(color);
      if (!markerIcon) {
        markerIcon = L.divIcon({ className: "travel-map-marker", html: `<svg aria-hidden="true" viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>`, iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -38] });
        markerIcons.set(color, markerIcon);
      }
      popup.querySelector("button")?.addEventListener("click", () => onSelectRef.current(item));
      L.marker(point, { title: item.title || "Untitled item", icon: markerIcon }).addTo(map).bindPopup(popup).on("click", () => onSelectRef.current(item));
    }
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);
    requestAnimationFrame(() => map.invalidateSize());
    return () => { resizeObserver.disconnect(); map.remove(); };
  }, [items, trip, typeColors]);

  return <div ref={containerRef} className="min-h-[360px] flex-1 bg-stone-100 text-sm text-stone-600" />;
}
