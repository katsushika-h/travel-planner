"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { currentTime } from "@/components/layout/useNow";
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
import { isTripInProgress, todayDate, todayTimeline } from "@/lib/today";
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

/** Today's next mapped stop while the trip is under way, else the earliest day's first mapped stop, else none. */
function defaultAnchorId(trip: Trip, items: readonly TravelObject[], mapped: readonly TravelObject[]) {
  const mappedIds = new Set(mapped.map((item) => item.id));
  const now = currentTime();
  if (isTripInProgress(trip, now)) {
    const date = todayDate(trip, now);
    const timeline = todayTimeline(items, date, now, trip.timezone);
    const upcoming = [timeline.next, ...timeline.upcoming].find((stop) => stop && mappedIds.has(stop.item.id));
    if (upcoming) return upcoming.item.id;
  }
  const dates = [...new Set(mapped.filter((item) => item.date).map((item) => item.date!.slice(0, 10)))].sort();
  if (!dates.length) return CENTRE;
  return sortDayDisplayItems(mapped.filter((item) => item.date?.slice(0, 10) === dates[0]))[0].id;
}

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
  const [initialAnchor] = useState(() => defaultAnchorId(trip, items, mappedItems));
  const [anchorChoice, setAnchorChoice] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(NEARBY_RADIUS.default);
  const [appliedRadius, setAppliedRadius] = useState<number>(NEARBY_RADIUS.default);
  const [category, setCategory] = useState<NearbyCategory>("food");
  const [report, setReport] = useState<Report | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const firstMapped = mappedItems[0]?.location;
  const [centreAnchor, setCentreAnchor] = useState<{ lat: number; lng: number } | null>(
    firstMapped ? { lat: firstMapped.lat!, lng: firstMapped.lng! } : null,
  );
  const latestCentre = useRef<{ lat: number; lng: number } | null>(null);
  const radiusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = useRef<HTMLUListElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setCacheVersion] = useState(0);
  const [detailsCache] = useState(() => new Map<string, PlaceDetails>());

  useEffect(() => () => clearTimeout(radiusTimer.current), []);

  const anchorId = anchorChoice ?? initialAnchor;
  const anchorItem = anchorId === CENTRE ? null : (mappedItems.find((item) => item.id === anchorId) ?? null);
  const centreMode = anchorItem === null;
  const anchorLat = anchorItem?.location?.lat;
  const anchorLng = anchorItem?.location?.lng;
  const anchor = useMemo(
    () => (anchorLat != null && anchorLng != null ? { lat: anchorLat, lng: anchorLng } : centreAnchor),
    [anchorLat, anchorLng, centreAnchor],
  );

  const groups = useMemo(() => {
    const byDate = new Map<string, TravelObject[]>();
    const ideas: TravelObject[] = [];
    for (const item of mappedItems) {
      if (!item.date) ideas.push(item);
      else byDate.set(item.date.slice(0, 10), [...(byDate.get(item.date.slice(0, 10)) ?? []), item]);
    }
    return {
      days: [...byDate]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, list]) => ({
          date,
          label: `${dayIndexForDate(date, trip.startDate) > 0 ? `Day ${dayIndexForDate(date, trip.startDate)} · ` : ""}${dayLabel(date)}`,
          items: sortDayDisplayItems(list),
        })),
      ideas,
    };
  }, [mappedItems, trip.startDate]);

  const markerNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const item of mappedItems) {
      if (!item.date) continue;
      const dayNumber = dayIndexForDate(item.date.slice(0, 10), trip.startDate);
      if (dayNumber > 0) numbers.set(item.id, dayNumber);
    }
    return numbers;
  }, [mappedItems, trip.startDate]);
  const dimmedItemIds = useMemo(
    () => new Set(anchorItem ? mappedItems.filter((item) => item.id !== anchorItem.id).map((item) => item.id) : []),
    [anchorItem, mappedItems],
  );

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

  function changeAnchor(value: string) {
    setAnchorChoice(value);
    setSelectedPlaceId(null);
    if (value === CENTRE && latestCentre.current) setCentreAnchor(latestCentre.current);
  }

  function changeRadius(value: number) {
    setRadius(value);
    clearTimeout(radiusTimer.current);
    radiusTimer.current = setTimeout(() => setAppliedRadius(value), RADIUS_DEBOUNCE_MS);
  }

  const categoryLabel = NEARBY_CATEGORIES.find((entry) => entry.id === category)!.label.toLowerCase();
  const radiusText = `${appliedRadius} m`;
  let status: string | null = null;
  if (!report) status = "Looking for places…";
  else if (report.zoom < MIN_ZOOM || report.features.length === 0) status = "Zoom in to see nearby places";

  const selectClass =
    "block min-h-11 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-2 text-sm text-foreground outline-none focus:border-foreground sm:min-h-9";
  const labelClass = "text-xs font-medium uppercase tracking-wide text-muted";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 pt-4 max-sm:gap-2 max-sm:pb-0 max-sm:pt-2 sm:flex-row sm:gap-12 sm:px-12 sm:pb-8 sm:pt-6"
      aria-label="Nearby places"
    >
      <div className="flex min-h-0 shrink-0 flex-col max-sm:order-2 max-sm:flex-[55_1_0%] max-sm:overflow-y-auto sm:w-72 lg:w-80">
        <h1 className="hidden text-[22px] font-medium tracking-tight sm:mb-4 sm:block">Nearby</h1>
        <div className="flex flex-col gap-4 max-sm:gap-3 sm:border-t sm:border-foreground sm:pt-4">
          <label className="block">
            <span className={labelClass}>Around</span>
            <select value={anchorId} onChange={(event) => changeAnchor(event.target.value)} className={selectClass}>
              <option value={CENTRE}>Map centre</option>
              {groups.days.map((group) => (
                <optgroup key={group.date} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
              {groups.ideas.length > 0 && (
                <optgroup label="Ideas">
                  {groups.ideas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {!mappedItems.length && (
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                Add a Google Maps link with coordinates to an item to search around it.
              </span>
            )}
          </label>
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
      <div className="flex min-h-[320px] min-w-0 flex-1 flex-col bg-surface max-sm:order-1 max-sm:min-h-0 max-sm:flex-[45_1_0%] sm:min-h-0">
        <MapLibreMap
          key={trip.id}
          trip={trip}
          items={mappedItems}
          typeColors={typeColors}
          onSelect={onSelect}
          markerNumbers={markerNumbers}
          selectedItemId={anchorItem?.id ?? null}
          dimmedItemIds={dimmedItemIds}
          fitKey="nearby"
          nearby={
            anchor
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
    </section>
  );
}
