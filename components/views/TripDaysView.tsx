"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
import { dateParts, formatTripDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";

import { allDayDropStartDate, occursOnItineraryDate } from "@/lib/schedule-domain";
import { compareScheduleOrder, isTimedItem, itineraryDropPosition } from "@/lib/schedule-order";
import { displayTotals, drivePlanTotals, parkingSpots, type DisplayLeg, type TravelMode } from "@/lib/routed-legs";
import { formatDuration } from "@/lib/travel-legs";
import { setWorkingDay, workingDay } from "@/lib/working-day";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip, UpdateTravelObjectInput } from "@/types/travel";
import { IdeasPanel } from "./calendar/IdeasPanel";
import { DayList, type ExpandedStop, type ScrollRequest } from "./plan/DayList";
import { DayStrip } from "./plan/DayStrip";
import { PlanMap } from "./plan/PlanMap";
import { plannedTotals, stopMeta, stopTimeLabel, tripDays } from "./plan/plan-domain";
import { useDayPlan } from "./plan/useDayPlan";

function initialDate(trip: Trip, days: string[], items: TravelObject[], primaryId: string | null) {
  const primary = primaryId ? items.find((item) => item.id === primaryId) : null;
  const primaryDate = primary?.date?.slice(0, 10);
  if (primaryDate && days.includes(primaryDate)) return primaryDate;
  const remembered = workingDay(trip.id);
  if (remembered && days.includes(remembered)) return remembered;
  const today = dateParts(new Date(), trip.timezone).date;
  return days.includes(today) ? today : days[0];
}

export function TripDaysView({
  trip,
  items,
  ideas,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
  onInspect,
  onSelectForDrag,
  onMove,
  onReorder,
  onUnschedule,
  onCreateItem,
  onCreateIdea,
  onChangeItem,
  onCreateNote,
  onSaveNote,
  onDeleteNote,
  onLogExpense,
  mapOpen = false,
  onMapOpenChange = () => undefined,
  ideasRequested = false,
  onIdeasRequestHandled = () => undefined,
}: {
  trip: Trip;
  /** Dated items for the trip. Notes are shown inline when present. */
  items: TravelObject[];
  /** Undated items, shown in the Ideas panel and dragged from there onto a day. */
  ideas: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  inspectedItemId?: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  /** Opens the item editor. Falls back to `onSelect` when the shell does not distinguish selecting from editing. */
  onInspect?: (item: TravelObject) => void;
  onSelectForDrag: (item: TravelObject) => void;
  onMove: (item: TravelObject, date: string) => Promise<void>;
  onReorder: (item: TravelObject, date: string, order: number, clearTime: boolean) => Promise<void>;
  /** Removes an item's date, returning it to Ideas. */
  onUnschedule: (item: TravelObject) => Promise<void>;
  onCreateItem: (date: string, order?: number) => void;
  onCreateIdea: () => void;
  /** Saves a patch to an item (used to store a stop's parking spot). */
  onChangeItem: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
  onCreateNote: (date: string, order: number) => Promise<string | undefined>;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  /** Phone: the + menu's "Add expense". */
  onLogExpense?: (item: TravelObject | null) => void;
  /** Phone: show the day map instead of the itinerary. Owned by the app header toggle. */
  mapOpen?: boolean;
  onMapOpenChange?: (open: boolean) => void;
  /** Phone: the More sheet's Ideas row asks for Plan with Ideas open; `onIdeasRequestHandled` clears it. */
  ideasRequested?: boolean;
  onIdeasRequestHandled?: () => void;
}) {
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const today = dateParts(new Date(), trip.timezone).date;
  // The day in view is reported by the list as it scrolls; picking a day (or a stop elsewhere) sends it a request.
  const [activeDate, setActiveDate] = useState(() => initialDate(trip, days, items, primarySelectedId));
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>(() => ({ date: activeDate, nonce: 0 }));
  const [expanded, setExpanded] = useState<ExpandedStop | null>(() => {
    const primary = primarySelectedId ? items.find((item) => item.id === primarySelectedId) : null;
    return primary ? { id: primary.id, date: primary.date?.slice(0, 10) ?? activeDate } : null;
  });
  const [seenPrimaryId, setSeenPrimaryId] = useState(primarySelectedId);
  // The stop just picked in the list, so its selection is not mistaken for one made elsewhere (and scrolled to).
  const [listPickedId, setListPickedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapVisible, setMapVisible] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  // Opened from the phone More sheet; the request is cleared once handled so a remount does not reopen Ideas.
  const [handledIdeasRequest, setHandledIdeasRequest] = useState(false);
  if (ideasRequested !== handledIdeasRequest) {
    setHandledIdeasRequest(ideasRequested);
    if (ideasRequested) setIdeasOpen(true);
  }
  useEffect(() => {
    if (ideasRequested) onIdeasRequestHandled();
  }, [ideasRequested, onIdeasRequestHandled]);
  const suppressClickRef = useRef(false);
  const date = days.includes(activeDate) ? activeDate : initialDate(trip, days, items, null);

  // Selection that changes elsewhere (map pin, search, editor) expands that stop and scrolls to its day.
  if (seenPrimaryId !== primarySelectedId) {
    setSeenPrimaryId(primarySelectedId);
    const fromList = listPickedId === primarySelectedId;
    if (listPickedId) setListPickedId(null);
    // Clearing the selection brings the map back to the whole day after it flew to a stop.
    if (!primarySelectedId) {
      setExpanded(null);
      setRecenterToken((token) => token + 1);
    } else if (!fromList) {
      const selected = items.find((item) => item.id === primarySelectedId);
      const selectedDate = selected?.date?.slice(0, 10);
      const shownOnActiveDay = selected ? occursOnItineraryDate(selected, date) : false;
      setExpanded({ id: primarySelectedId, date: shownOnActiveDay ? date : (selectedDate ?? date) });
      if (selected && selectedDate && days.includes(selectedDate) && !shownOnActiveDay) {
        setScrollRequest((request) => ({ date: selectedDate, itemId: selected.id, nonce: request.nonce + 1 }));
      }
    }
  }

  useEffect(() => {
    setWorkingDay(trip.id, date);
  }, [trip.id, date]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setMapVisible(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Space toggles the Ideas panel, as in the Calendar, unless typing or a dialog is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      event.preventDefault();
      setIdeasOpen((open) => !open);
      if (!mapMoved) setRecenterToken((token) => token + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mapMoved]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const dayItems = useMemo(
    () => items.filter((item) => occursOnItineraryDate(item, date)).sort(compareScheduleOrder),
    [items, date],
  );
  const mode = useTravelStore((state) => state.travelModeByTrip[trip.id] ?? "walk");
  const setTravelMode = useTravelStore((state) => state.setTravelMode);
  const overrides = useTravelStore((state) => state.legOverridesByTrip[trip.id]);
  const setLegOverride = useTravelStore((state) => state.setLegOverride);
  // The active day feeds the summary and the map; each list section routes itself (they share one route cache).
  const { legs, mapLegs, estimatedNote, events, numbers, flexTimes } = useDayPlan(
    dayItems,
    date,
    mode,
    overrides,
    true,
  );
  const travelTotal = useMemo(() => {
    if (mode === "drive") {
      const total = drivePlanTotals(legs);
      return (["drive", "walk"] as const)
        .filter((key) => total[key].counted > 0)
        .map(
          (key) =>
            `${total[key].approximate ? "~" : ""}${formatDuration(total[key].seconds)} ${key === "drive" ? "driving" : "walking"}`,
        )
        .join(" · ");
    }
    const total = displayTotals(legs);
    if (!total.counted) return "";
    return `${total.approximate ? "~" : ""}${formatDuration(total.seconds)} walking`;
  }, [legs, mode]);
  const parkingMarkers = useMemo(
    () =>
      mode === "drive"
        ? [...parkingSpots(dayItems)].map(([id, spot]) => ({ id, lat: spot.lat, lng: spot.lng, name: spot.name }))
        : undefined,
    [mode, dayItems],
  );
  const setLegMode = (leg: DisplayLeg, next: TravelMode) =>
    setLegOverride(trip.id, `${leg.fromId}>${leg.toId}`, next === leg.defaultMode ? null : next);
  const mapped = useMemo(() => events.filter((item) => hasMapCoordinates(item.location)), [events]);
  // The idea selected in the open Ideas panel gets a temporary pin on the day map.
  const previewIdea = ideasOpen ? (ideas.find((idea) => idea.id === primarySelectedId) ?? null) : null;
  const unmapped = events.filter((item) => !hasMapCoordinates(item.location));
  // A multi-day item's planned cost belongs to its first day only, so day totals never double count it.
  const totals = plannedTotals(events.filter((item) => item.date?.slice(0, 10) === date));
  const weekday = formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "long" });
  const summary = [
    weekday,
    `${events.length} ${events.length === 1 ? "stop" : "stops"}`,
    totals.join(", "),
    travelTotal,
  ]
    .filter(Boolean)
    .join(" · ");

  // The list reports the day in view; the map refits to it.
  function onActiveDate(next: string) {
    setActiveDate(next);
    setMapMoved(false);
    setRecenterToken((token) => token + 1);
  }

  function pickDay(next: string) {
    setScrollRequest((request) => ({ date: next, nonce: request.nonce + 1 }));
  }

  // From `md` the Ideas panel takes a column beside the map, so the narrower or wider map refits the day.
  function toggleIdeas(open: boolean) {
    setIdeasOpen(open);
    if (!mapMoved) setRecenterToken((token) => token + 1);
  }

  function pickStop(item: TravelObject, additive: boolean, itemDate: string) {
    if (suppressClickRef.current) return;
    setListPickedId(item.id);
    if (additive) {
      onSelect(item, true);
      return;
    }
    if (expanded?.id === item.id && expanded.date === itemDate && primarySelectedId === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded({ id: item.id, date: itemDate });
    onSelect(item, false);
  }

  function editStop(item: TravelObject) {
    (onInspect ?? onSelect)(item);
  }

  function selectFromMap(item: TravelObject) {
    setListPickedId(item.id);
    setExpanded({ id: item.id, date });
    onSelect(item);
    onMapOpenChange(false);
    setScrollRequest((request) => ({ date, itemId: item.id, nonce: request.nonce + 1 }));
  }

  const finishDrag = () => {
    setActiveItem(null);
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  };
  const onDragStart = (event: DragStartEvent) => {
    suppressClickRef.current = true;
    const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? null;
    setActiveItem(item);
    if (item && !selectedIds.has(item.id)) {
      // Keep the open stop as it is: expanding the dragged one would shift the rows under the pointer.
      setSeenPrimaryId(item.id);
      onSelectForDrag(item);
    }
  };
  const onDragEnd = (event: DragEndEvent) => {
    if (event.over?.id === "unscheduled") {
      const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item;
      if (item && !item.isAllDay && item.date !== null) void onUnschedule(item);
      return;
    }
    const [kind, targetDate, rawOrder] = String(event.over?.id ?? "").split(":");
    if ((kind !== "trip-day" && kind !== "trip-row") || !targetDate) return;
    const data = event.active.data.current as { item?: TravelObject; draggedDate?: string } | undefined;
    const item = data?.item;
    if (!item) return;
    // Dropping on a stop inserts before it or, in its lower half, after it. A day button has no position (end).
    let gap = rawOrder === undefined ? Number.NaN : Number(rawOrder);
    if (kind === "trip-row") {
      // Judge the half by the pointer, as the collision check does; an open row is much taller than its handle.
      const start = getEventCoordinates(event.activatorEvent);
      const over = event.over?.rect;
      if (start && over && start.y + event.delta.y > over.top + over.height / 2) gap += 1;
    }
    const draggedDate = data?.draggedDate ?? item.date ?? targetDate;
    if (item.isAllDay) {
      if (!item.date) return;
      const nextStart = allDayDropStartDate(item.date, draggedDate, targetDate);
      if (item.date !== nextStart) void onMove(item, nextStart);
      return;
    }
    // Dropping a stop on the day button of the day it is already on changes nothing.
    if (kind === "trip-day" && rawOrder === undefined && targetDate === draggedDate) return;
    const { requestedOrder, betweenTimedAnchors } = itineraryDropPosition(
      items.filter((candidate) => occursOnItineraryDate(candidate, targetDate)).sort(compareScheduleOrder),
      item,
      targetDate,
      gap,
    );
    if (betweenTimedAnchors) {
      void onReorder(item, targetDate, requestedOrder, true);
      return;
    }
    if (isTimedItem(item) && item.date !== targetDate) {
      void onMove(item, targetDate);
      return;
    }
    void onReorder(item, targetDate, requestedOrder, false);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          // On phones the Ideas panel floats over the page, so it wins over the rows and day buttons beneath it.
          const hits = pointerWithin(args);
          return hits
            .filter((hit) => hit.id === "unscheduled")
            .concat(hits)
            .slice(0, 1);
        }}
        onDragStart={onDragStart}
        onDragCancel={finishDrag}
        onDragEnd={(event) => {
          onDragEnd(event);
          finishDrag();
        }}
      >
        {ideasOpen && (
          <IdeasPanel
            items={ideas}
            typeColors={typeColors}
            selectedIds={selectedIds}
            primarySelectedId={primarySelectedId}
            position="right"
            onSelect={(item, additive) => {
              if (!suppressClickRef.current) onSelect(item, additive);
            }}
            onInspect={editStop}
            onAdd={onCreateIdea}
            onClose={() => toggleIdeas(false)}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="hidden shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 bg-background px-6 pt-4 pb-3 sm:flex lg:px-10">
            <DayStrip days={days} activeDate={date} today={today} onPick={pickDay} />
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <p>{summary}</p>
              {estimatedNote && <p className="text-xs">Estimated distances</p>}
              <div role="group" aria-label="Travel mode" className="flex border border-divider">
                {(["walk", "drive"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => setTravelMode(trip.id, option)}
                    className={`min-h-8 px-2.5 text-xs ${mode === option ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
                  >
                    {option === "walk" ? "Walk" : "Drive"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={ideasOpen}
                title="Ideas (Space)"
                onClick={() => toggleIdeas(!ideasOpen)}
                className={`min-h-8 text-xs ${ideasOpen ? "text-foreground" : "text-muted hover:text-foreground"}`}
              >
                Ideas <span className="font-mono">{ideas.length}</span>
              </button>
            </div>
          </div>
          <DayList
            trip={trip}
            items={items}
            typeColors={typeColors}
            selectedIds={selectedIds}
            primarySelectedId={primarySelectedId}
            expanded={expanded}
            hoveredId={hoveredId}
            mode={mode}
            overrides={overrides}
            scrollRequest={scrollRequest}
            onActiveDate={onActiveDate}
            onPick={pickStop}
            onEdit={editStop}
            onHover={setHoveredId}
            onChangeItem={onChangeItem}
            onSetLegMode={setLegMode}
            onCreateItem={onCreateItem}
            onCreateNote={onCreateNote}
            onSaveNote={onSaveNote}
            onDeleteNote={onDeleteNote}
            onReorder={(item, itemDate, order) => onReorder(item, itemDate, order, false)}
            onLogExpense={onLogExpense}
            mapOpen={mapOpen}
            onMapOpenChange={onMapOpenChange}
            map={
              <div
                className={`${mapOpen ? "flex" : "hidden"} min-h-0 min-w-0 flex-col border-l border-divider md:flex ${ideasOpen ? "md:min-w-60" : ""}`}
              >
                {(mapVisible || mapOpen) && (
                  <PlanMap
                    trip={trip}
                    date={date}
                    mapped={mapped}
                    unmappedCount={unmapped.length}
                    typeColors={typeColors}
                    markerNumbers={numbers}
                    selectedItemId={primarySelectedId}
                    hoveredItemId={hoveredId}
                    recenterToken={recenterToken}
                    mapMoved={mapMoved}
                    onHover={setHoveredId}
                    onSelect={selectFromMap}
                    onUserMove={() => setMapMoved(true)}
                    onRecenter={() => {
                      setMapMoved(false);
                      setRecenterToken((token) => token + 1);
                    }}
                    onAddLink={unmapped[0] ? () => editStop(unmapped[0]) : undefined}
                    legs={mapLegs}
                    parkingMarkers={parkingMarkers}
                    previewItem={previewIdea}
                  />
                )}
              </div>
            }
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div className="border border-foreground bg-background px-4 py-3 shadow-lg">
              <p className="truncate text-base font-medium">{activeItem.title}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted">
                {stopTimeLabel(activeItem, flexTimes.get(activeItem.id))} · {stopMeta(activeItem)}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
