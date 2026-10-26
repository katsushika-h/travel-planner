"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { api } from "@/lib/api-client";
import { dayIndexForDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import {
  NEARBY_CATEGORIES,
  NEARBY_RADIUS,
  nearbyPlaces,
  type NearbyCategory,
  type NearbyPlace,
} from "@/lib/nearby-places";
import { mapsNameSearchUrl, type PlaceDetails } from "@/lib/place-details";
import { sortDayDisplayItems } from "@/lib/schedule-order";
import { estimateWalk, formatDistance, haversineMeters } from "@/lib/travel-legs";
import type { TravelObject, Trip } from "@/types/travel";
import type { MapSuggestion, NearbyFeatureLike } from "./MapLibreMap";

const MapLibreMap = dynamic(() => import("./MapLibreMap").then((module) => module.MapLibreMap), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

const CENTRE = "centre";
const MAX_ROWS = 50;
/** Places only exist in zoom-14 tiles. */
const MIN_ZOOM = 14;
/** Map centre mode re-anchors only after the centre has moved this far, so the ring does not chase every pixel. */
const CENTRE_MOVE_METERS = 25;
const RADIUS_DEBOUNCE_MS = 150;
const NO_SUGGESTIONS: MapSuggestion[] = [];

function dayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Compact phone label such as "Sun 29", without the month. */
function shortDayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function walkMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function PlaceDetailsPanel({
  place,
  details,
  status,
  onRetry,
}: {
  place: NearbyPlace;
  details: PlaceDetails | null;
  status: "loading" | "error" | null;
  onRetry: () => void;
}) {
  const linkClass = "inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-8";
  const facts = details
    ? [
        details.cuisine && `Cuisine: ${details.cuisine.replace(/[_;]/g, (c) => (c === "_" ? " " : ", "))}`,
        details.religion && `Religion: ${details.religion.replace(/_/g, " ")}`,
        details.openingHours && `Listed hours: ${details.openingHours} (may be out of date)`,
      ].filter(Boolean)
    : [];
  const summary = details?.summary ?? null;
  const other = summary ? null : (details?.otherWikipedia ?? null);
  const hasContent =
    details && (details.description || summary || other || facts.length > 0 || details.website || details.nameEn);
  return (
    <div className="pb-3 text-xs text-muted">
      {status === "loading" && <p className="py-1">Loading details…</p>}
      {status === "error" && (
        <p className="flex items-center gap-2 py-1">
          Couldn&apos;t load details.
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 border border-divider px-3 text-xs text-foreground hover:bg-surface sm:min-h-8"
          >
            Retry
          </button>
        </p>
      )}
      {details && (
        <div className="space-y-1.5">
          {details.nameEn && details.nameEn !== place.name && <p className="text-foreground">{details.nameEn}</p>}
          {details.description && <p>{details.description}</p>}
          {summary && (
            <div className="flex gap-2">
              {summary.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- small external Wikipedia thumbnail
                <img
                  src={summary.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="size-16 shrink-0 bg-surface object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="line-clamp-4">{summary.extract}</p>
                <p className="mt-0.5">
                  <a href={summary.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    From Wikipedia (CC BY-SA)
                  </a>
                </p>
              </div>
            </div>
          )}
          {facts.map((fact) => (
            <p key={String(fact)}>{fact}</p>
          ))}
          {details.website && (
            <p>
              <a
                href={details.website}
                target="_blank"
                rel="noreferrer"
                className="break-all underline underline-offset-2"
              >
                Website
              </a>
            </p>
          )}
          {!hasContent && <p>No description on OpenStreetMap.</p>}
        </div>
      )}
      <p className="flex flex-wrap gap-x-4">
        <a
          href={mapsNameSearchUrl(place.name, place.lat, place.lng)}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          Search in Google Maps
        </a>
        {details && (
          <a href={details.osmUrl} target="_blank" rel="noreferrer" className={linkClass}>
            OpenStreetMap
          </a>
        )}
        {other && (
          <a href={other.url} target="_blank" rel="noreferrer" className={linkClass}>
            Wikipedia ({other.language})
          </a>
        )}
      </p>
    </div>
  );
}

type Report = { features: NearbyFeatureLike[]; zoom: number; circleInView: boolean };

export function MapView({
  trip,
  items,
  typeColors,
  onSelect,
  onAddIdea,
}: {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  onSelect: (item: TravelObject) => void;
  onAddIdea: (place: NearbyPlace) => void;
}) {
  const mappedItems = useMemo(() => items.filter((item) => hasMapCoordinates(item.location)), [items]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  // null = browse; CENTRE = searching around the map centre; otherwise the id of the picked pin.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(NEARBY_RADIUS.default);
  const [appliedRadius, setAppliedRadius] = useState<number>(NEARBY_RADIUS.default);
  const [category, setCategory] = useState<NearbyCategory>("food");
  const [report, setReport] = useState<Report | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [centreAnchor, setCentreAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const latestCentre = useRef<{ lat: number; lng: number } | null>(null);
  const radiusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = useRef<HTMLUListElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setCacheVersion] = useState(0);
  const [detailsCache] = useState(() => new Map<string, PlaceDetails>());

  useEffect(() => () => clearTimeout(radiusTimer.current), []);

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of mappedItems) {
      if (!item.date) continue;
      const date = item.date.slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return [...counts].sort(([left], [right]) => left.localeCompare(right));
  }, [mappedItems]);
  const availableDates = useMemo(() => new Set(days.map(([date]) => date)), [days]);
  const activeDates = useMemo(
    () => new Set([...selectedDates].filter((date) => availableDates.has(date))),
    [availableDates, selectedDates],
  );
  const dimmedItemIds = useMemo(
    () =>
      activeDates.size
        ? new Set(
            mappedItems.filter((item) => !item.date || !activeDates.has(item.date.slice(0, 10))).map((item) => item.id),
          )
        : new Set<string>(),
    [activeDates, mappedItems],
  );
  // One selected day numbers its stops in display order; otherwise a pin shows its trip day.
  const markerNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    if (activeDates.size === 1) {
      const [date] = activeDates;
      sortDayDisplayItems(mappedItems.filter((item) => item.date?.slice(0, 10) === date)).forEach((item, index) =>
        numbers.set(item.id, index + 1),
      );
      return numbers;
    }
    for (const item of mappedItems) {
      if (!item.date) continue;
      const dayNumber = dayIndexForDate(item.date.slice(0, 10), trip.startDate);
      if (dayNumber > 0) numbers.set(item.id, dayNumber);
    }
    return numbers;
  }, [activeDates, mappedItems, trip.startDate]);
  const unmappedCount = items.length - mappedItems.length;

  const centreMode = anchorId === CENTRE;
  const anchorItem =
    anchorId === null || centreMode ? null : (mappedItems.find((item) => item.id === anchorId) ?? null);
  const searching = centreMode || anchorItem !== null;
  const itemAnchor = useMemo(() => {
    const location = mappedItems.find((item) => item.id === anchorId)?.location;
    return location?.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null;
  }, [anchorId, mappedItems]);
  const anchor = centreMode ? centreAnchor : itemAnchor;

  const places = useMemo(
    () =>
      anchor && report
        ? nearbyPlaces({ features: report.features, anchor, radiusMeters: appliedRadius, category, items })
        : [],
    [anchor, report, appliedRadius, category, items],
  );
  const shown = places.slice(0, MAX_ROWS);
  // MapLibreMap rebuilds its markers when this array changes and the POI report fires on every idle, so the array
  // is keyed on the place ids alone (an id encodes name, class and position).
  const idKey = shown.map((place) => place.id).join("\n");
  const suggestions = useMemo(
    () => (idKey ? shown.map(({ id, name, lat, lng, type }) => ({ id, name, lat, lng, type })) : NO_SUGGESTIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey],
  );

  const expandedPlace = expandedId ? (shown.find((place) => place.id === expandedId) ?? null) : null;
  const expandedKey = expandedPlace?.osm ? `${expandedPlace.osm.osmType}/${expandedPlace.osm.osmId}` : null;
  const expandedOsm = expandedPlace?.osm ?? null;
  useEffect(() => {
    if (!expandedKey || !expandedOsm || detailsCache.has(expandedKey)) return;
    const controller = new AbortController();
    api
      .placeDetails(expandedOsm.osmType, expandedOsm.osmId, controller.signal)
      .then((result) => {
        detailsCache.set(expandedKey, result);
        setCacheVersion((version) => version + 1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedKey(expandedKey);
      });
    return () => controller.abort();
    // expandedOsm is derived from expandedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey, attempt]);

  function expandPlace(id: string) {
    setExpandedId(id);
    setFailedKey(null);
    setSelectedPlaceId(id);
  }

  useEffect(() => {
    if (!selectedPlaceId) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-place-id]") ?? [];
    for (const row of rows)
      if (row.dataset.placeId === selectedPlaceId) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPlaceId]);

  const onPoiFeatures = useCallback(
    (
      features: NearbyFeatureLike[],
      state: { zoom: number; circleInView: boolean; center: { lat: number; lng: number } },
    ) => {
      latestCentre.current = state.center;
      setReport({ features, zoom: state.zoom, circleInView: state.circleInView });
      if (centreMode)
        setCentreAnchor((current) =>
          !current || haversineMeters(current, state.center) > CENTRE_MOVE_METERS ? state.center : current,
        );
    },
    [centreMode],
  );

  function changeAnchor(value: string | null) {
    setAnchorId(value);
    setExpandedId(null);
    setSelectedPlaceId(null);
    setHoveredId(null);
    setFailedKey(null);
    if (value === CENTRE && latestCentre.current) setCentreAnchor(latestCentre.current);
  }

  function openAnchorDetails() {
    const item = items.find((candidate) => candidate.id === anchorId);
    if (item) onSelect(item);
  }

  function pickPin(item: TravelObject) {
    if (item.id !== anchorId) changeAnchor(item.id);
  }

  function filterDay(date: string, event: MouseEvent<HTMLButtonElement>) {
    if (searching) changeAnchor(null);
    setSelectedDates((current) => {
      if (!event.shiftKey && !window.matchMedia("(max-width: 639px)").matches)
        return current.size === 1 && current.has(date) ? new Set() : new Set([date]);
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function showAllDays() {
    if (searching) changeAnchor(null);
    setSelectedDates(new Set());
  }

  function changeRadius(value: number) {
    setRadius(value);
    clearTimeout(radiusTimer.current);
    radiusTimer.current = setTimeout(() => setAppliedRadius(value), RADIUS_DEBOUNCE_MS);
  }

  const categoryLabel = NEARBY_CATEGORIES.find((entry) => entry.id === category)!.label.toLowerCase();
  const radiusText = `${appliedRadius} m`;
  let status: string | null = null;
  if (!report || !anchor) status = "Looking for places…";
  else if (report.zoom < MIN_ZOOM || report.features.length === 0) status = "Zoom in to see nearby places";

  const labelClass = "text-xs font-medium uppercase tracking-wide text-muted";
  const allActive = activeDates.size === 0;
  // Browse: on phones each row is a 44px touch target around a 32px pill; from sm up the pill is `display: contents`,
  // so the desktop grid is a list. Search: the pills row at every width.
  const rowBase = searching
    ? "flex min-h-11 shrink-0 items-center text-left transition-colors"
    : "grid items-baseline text-left transition-colors hover:bg-surface max-sm:flex max-sm:min-h-11 max-sm:shrink-0 max-sm:items-center sm:min-h-14 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-x-3 sm:border-b sm:border-divider sm:py-3";
  const pillClass = (active: boolean) =>
    `${searching ? "flex h-8 items-center gap-x-2 whitespace-nowrap rounded-full border px-3" : "max-sm:flex max-sm:h-8 max-sm:items-center max-sm:gap-x-2 max-sm:whitespace-nowrap max-sm:rounded-full max-sm:border max-sm:px-3 sm:contents"} ${active ? (searching ? "border-ink" : "max-sm:border-ink") : searching ? "border-divider" : "max-sm:border-divider"}`;
  const hide = searching ? "hidden" : "max-sm:hidden";

  const anchorNumber = anchorItem ? markerNumbers.get(anchorItem.id) : undefined;
  const anchorDayNumber = anchorItem?.date ? dayIndexForDate(anchorItem.date.slice(0, 10), trip.startDate) : 0;
  const anchorWhen = anchorItem
    ? anchorItem.date
      ? `${anchorDayNumber > 0 ? `Day ${anchorDayNumber} · ` : ""}${dayLabel(anchorItem.date.slice(0, 10))}`
      : "Idea"
    : "Moves with the map";
  const anchorTitle = anchorItem ? anchorItem.title || "Untitled item" : "Map centre";

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-4 max-sm:gap-2 max-sm:pb-0 max-sm:pt-2 sm:grid sm:grid-cols-[18rem_minmax(0,1fr)] sm:gap-x-12 sm:gap-y-0 sm:overflow-hidden sm:px-12 sm:pb-8 sm:pt-6 lg:grid-cols-[20rem_minmax(0,1fr)] ${searching ? "overflow-hidden sm:grid-rows-[auto_minmax(0,1fr)]" : "overflow-y-auto sm:grid-rows-[minmax(0,1fr)_auto]"}`}
      aria-label="Nearby places"
    >
      <nav
        aria-label="Filter map by day"
        className="flex min-w-0 shrink-0 flex-col max-sm:order-1 sm:col-start-1 sm:row-start-1 sm:min-h-0"
      >
        <h1 className="hidden text-[22px] font-medium tracking-tight sm:mb-4 sm:block">Nearby</h1>
        {mappedItems.length === 0 ? (
          <div className="py-2 sm:border-t sm:border-foreground sm:pt-4">
            <p className="text-sm font-medium">No locations to map yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Paste a Google Maps link containing coordinates into an item. Links without embedded coordinates stay
              saved but cannot appear on this map.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`flex gap-2 overflow-x-auto pb-1 ${searching ? "sm:mb-3" : "sm:flex-col sm:gap-0 sm:overflow-y-auto sm:border-t sm:border-foreground sm:pb-0"}`}
            >
              <button type="button" aria-pressed={allActive} onClick={showAllDays} className={rowBase}>
                <span className={pillClass(allActive)}>
                  <span className={`font-mono text-lg font-light ${hide} ${allActive ? "text-accent" : "text-faint"}`}>
                    —
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={`text-[15px] max-sm:text-[13px] ${searching ? "text-[13px]" : ""} ${allActive ? "font-semibold" : ""}`}
                    >
                      All days
                    </span>
                    <span className={`text-xs text-muted ${hide}`}>{trip.title}</span>
                  </span>
                  <span className="font-mono text-xs text-muted">{mappedItems.length}</span>
                </span>
              </button>
              {days.map(([date, count]) => {
                const dayNumber = dayIndexForDate(date, trip.startDate);
                const active = activeDates.has(date);
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={active}
                    title={`${count} mapped ${count === 1 ? "item" : "items"}`}
                    onClick={(event) => filterDay(date, event)}
                    className={rowBase}
                  >
                    <span className={pillClass(active)}>
                      <span className={`font-mono text-lg font-light ${hide} ${active ? "text-accent" : "text-faint"}`}>
                        {dayNumber > 0 ? String(dayNumber).padStart(2, "0") : "·"}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span
                          className={`text-[15px] max-sm:text-[13px] ${searching ? "text-[13px]" : ""} ${active ? "font-semibold" : ""}`}
                        >
                          <span className={searching ? "" : "sm:hidden"}>
                            {dayNumber > 0 ? `${dayNumber} ` : ""}
                            {shortDayLabel(date)}
                          </span>
                          <span className={searching ? "hidden" : "max-sm:hidden"}>{dayLabel(date)}</span>
                        </span>
                        <span className={`text-xs text-muted ${hide}`}>
                          {count} {count === 1 ? "stop" : "stops"}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-muted">{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {!searching && (
              <>
                <p className="mt-4 text-[13px] leading-normal text-muted max-sm:hidden">
                  Picking a day fits the map to its stops.
                  <span className="hidden sm:inline"> Shift-click to select several days.</span>
                  {unmappedCount > 0 &&
                    ` ${unmappedCount} ${unmappedCount === 1 ? "item has" : "items have"} no location and ${unmappedCount === 1 ? "isn't" : "aren't"} shown.`}
                </p>
                {unmappedCount > 0 && (
                  <p
                    className="mt-2 w-fit rounded-full border border-divider px-3 py-1 text-xs text-muted sm:hidden"
                    title={`${unmappedCount} ${unmappedCount === 1 ? "item has" : "items have"} no location and ${unmappedCount === 1 ? "isn't" : "aren't"} shown on the map.`}
                  >
                    {unmappedCount} without location
                  </p>
                )}
              </>
            )}
          </>
        )}
      </nav>
      <div
        className={`flex min-h-0 min-w-0 flex-col bg-surface max-sm:order-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:min-h-0 ${searching ? "min-h-[320px] max-sm:min-h-0 max-sm:flex-[45_1_0%]" : "min-h-[320px] flex-1"}`}
      >
        <MapLibreMap
          key={trip.id}
          trip={trip}
          items={mappedItems}
          typeColors={typeColors}
          onSelect={onSelect}
          onMarkerClick={pickPin}
          markerNumbers={markerNumbers}
          selectedItemId={anchorItem?.id ?? null}
          dimmedItemIds={dimmedItemIds}
          fitKey={[...activeDates].sort().join(",") || "all"}
          nearby={
            searching && anchor
              ? {
                  anchor,
                  radiusMeters: appliedRadius,
                  fit: !centreMode,
                  suggestions,
                  hoveredSuggestionId: hoveredId,
                  onHoverSuggestion: setHoveredId,
                  onSelectSuggestion: expandPlace,
                }
              : undefined
          }
          onPoiFeatures={onPoiFeatures}
          className="min-h-[360px] flex-1 max-sm:min-h-0"
        />
      </div>
      {!searching ? (
        <div className="shrink-0 max-sm:order-3 max-sm:pb-3 sm:col-start-1 sm:row-start-2 sm:mt-4">
          {mappedItems.length > 0 && (
            <p className="text-[13px] leading-normal text-muted">Pick a pin on the map to find places near it.</p>
          )}
          <button
            type="button"
            onClick={() => changeAnchor(CENTRE)}
            className="inline-flex min-h-11 items-center text-[13px] underline underline-offset-2 hover:text-foreground sm:min-h-8"
          >
            Search around the map centre
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 shrink-0 flex-col max-sm:order-3 max-sm:flex-[55_1_0%] max-sm:overflow-y-auto sm:col-start-1 sm:row-start-2">
          <div className="flex flex-col gap-4 max-sm:gap-3 sm:border-t sm:border-foreground sm:pt-4">
            <div>
              <span className={labelClass}>Around</span>
              <div className="flex items-center gap-3 border-b border-divider py-2">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-accent font-mono text-xs"
                >
                  {anchorItem ? (anchorNumber ?? "·") : <span className="size-1.5 rounded-full bg-accent" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{anchorTitle}</p>
                  <p className="truncate text-xs text-muted">{anchorWhen}</p>
                </div>
                {anchorItem && (
                  <button
                    type="button"
                    onClick={openAnchorDetails}
                    className="min-h-11 shrink-0 border border-divider px-3 text-xs hover:bg-surface sm:min-h-8"
                  >
                    Details
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => changeAnchor(null)}
                  aria-label={`Stop searching around ${anchorItem ? anchorTitle : "the map centre"}`}
                  className="grid size-11 shrink-0 place-items-center text-lg leading-none text-muted hover:bg-surface hover:text-foreground sm:size-8"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="nearby-radius" className="flex items-baseline justify-between gap-2">
                <span className={labelClass}>Radius</span>
                <span className="text-xs text-muted">
                  {radius} m · about {walkMinutes(estimateWalk(radius).seconds)} min walk
                </span>
              </label>
              <input
                id="nearby-radius"
                type="range"
                min={NEARBY_RADIUS.min}
                max={NEARBY_RADIUS.max}
                step={NEARBY_RADIUS.step}
                value={radius}
                onChange={(event) => changeRadius(Number(event.target.value))}
                className="block h-11 w-full accent-foreground sm:h-7"
              />
            </div>
            <div role="group" aria-label="Category" className="grid grid-cols-3 border border-divider">
              {NEARBY_CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={category === entry.id}
                  onClick={() => setCategory(entry.id)}
                  className={`min-h-11 text-sm transition-colors hover:bg-surface sm:min-h-9 ${category === entry.id ? "bg-surface font-semibold text-foreground shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted"}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:min-h-0 sm:flex-1">
            {status ? (
              <p className="py-3 text-sm text-muted">{status}</p>
            ) : (
              <>
                {places.length === 0 ? (
                  <p className="py-3 text-sm text-muted">
                    No {categoryLabel} within {radiusText}.{appliedRadius < NEARBY_RADIUS.max && " Try a wider radius."}
                  </p>
                ) : (
                  <ul ref={listRef} className="border-t border-divider sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
                    {shown.map((place) => {
                      const active = hoveredId === place.id || selectedPlaceId === place.id;
                      const expanded = expandedId === place.id;
                      const key = place.osm ? `${place.osm.osmType}/${place.osm.osmId}` : null;
                      const cached = key ? (detailsCache.get(key) ?? null) : null;
                      const rowStatus = cached || !key ? null : failedKey === key ? "error" : "loading";
                      return (
                        <li
                          key={place.id}
                          data-place-id={place.id}
                          onMouseEnter={() => setHoveredId(place.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={`border-b border-divider transition-colors ${active ? "bg-surface" : ""}`}
                        >
                          <div className="flex items-center gap-2 py-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              onClick={() => {
                                setExpandedId(expanded ? null : place.id);
                                if (!expanded) {
                                  setFailedKey(null);
                                  setSelectedPlaceId(place.id);
                                }
                              }}
                              className="min-h-11 min-w-0 flex-1 text-left sm:min-h-9"
                            >
                              <span className="block truncate text-sm font-medium">{place.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {place.subclass.replace(/_/g, " ")} · {formatDistance(place.meters)} ·{" "}
                                {walkMinutes(place.walkSeconds)} min walk
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onAddIdea(place)}
                              aria-label={`Add ${place.name} as an idea`}
                              className="min-h-11 shrink-0 border border-divider px-3 text-xs hover:bg-surface sm:min-h-8"
                            >
                              + Idea
                            </button>
                          </div>
                          {expanded && (
                            <PlaceDetailsPanel
                              place={place}
                              details={cached}
                              status={rowStatus}
                              onRetry={() => {
                                setFailedKey(null);
                                setAttempt((count) => count + 1);
                              }}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {report && !report.circleInView && (
                  <p className="mt-2 text-xs text-muted">
                    Part of the radius is off screen, so some places may be missing.
                  </p>
                )}
              </>
            )}
            <p className="mt-3 pb-3 text-xs text-muted sm:pb-0">
              From OpenStreetMap. No ratings or opening hours; coverage varies.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
