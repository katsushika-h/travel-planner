import { itemScheduleLabel } from "@/lib/schedule-domain";
import { defaultTypeColor, typeColor } from "@/lib/type-color";
import { placeLabel } from "@/lib/place-label";
import type { TravelObject } from "@/types/travel";

/** Marker and popup DOM shared by the Leaflet and MapLibre maps, so both draw identical pins. */

export function markerColor(type: string, colors: Record<string, string>) {
  const color = typeColor(type, colors);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : defaultTypeColor(type);
}

export type MarkerState = "default" | "active" | "dimmed" | "preview";

export function markerSize(numbered: boolean, state: MarkerState = "default") {
  const size =
    state === "active" || state === "preview" ? (numbered ? 36 : 22) : state === "dimmed" ? 10 : numbered ? 26 : 16;
  return size;
}

/** Numbered stops are outlined circles; unnumbered stops are small type-colour dots. Colours come from theme tokens. */
export function markerHtml(color: string, number?: number, state: MarkerState = "default") {
  const numbered = number != null;
  return `<span class="travel-map-pin" aria-hidden="true" data-numbered="${numbered}" data-active="${state === "active"}" data-dimmed="${state === "dimmed"}" data-preview="${state === "preview"}" style="--pin-type: ${color}">${numbered ? number : ""}</span>`;
}

export function popupContent(item: TravelObject, number?: number) {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${number == null ? "" : `${number}. `}${item.title || "Untitled item"}`;
  content.appendChild(title);
  const details = document.createElement("div");
  details.className = "travel-map-popup-meta";
  const fixedTime = itemScheduleLabel(item);
  details.textContent = [item.type, placeLabel(item), fixedTime].filter(Boolean).join(" · ");
  content.appendChild(details);
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = "Open details";
  action.className = "travel-map-popup-action";
  action.dataset.openItem = item.id;
  content.appendChild(action);
  return content;
}

/**
 * How far floating panels marked `data-map-overlay` reach into the map from its left and right edges, so a fit can
 * keep pins out from under them. A panel covering most of the map (a phone) is ignored.
 */
export function overlayInsets(container: HTMLElement) {
  const box = container.getBoundingClientRect();
  let left = 0;
  let right = 0;
  for (const element of document.querySelectorAll("[data-map-overlay]")) {
    const panel = element.getBoundingClientRect();
    if (panel.bottom <= box.top || panel.top >= box.bottom) continue;
    if (panel.left <= box.left && panel.right > box.left) left = Math.max(left, panel.right - box.left);
    else if (panel.right >= box.right && panel.left < box.right) right = Math.max(right, box.right - panel.left);
  }
  return left + right > box.width - 160 ? { left: 0, right: 0 } : { left, right };
}
