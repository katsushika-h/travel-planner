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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { dateParts, formatTripDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { eventItems, isNote } from "@/lib/note-domain";
import { allDayDropStartDate, flexibleDisplayTimes, occursOnItineraryDate } from "@/lib/schedule-domain";
import { compareScheduleOrder, isTimedItem, itineraryDropPosition } from "@/lib/schedule-order";
import { displayTotals, drivePlanTotals, parkingSpots, type DisplayLeg, type TravelMode } from "@/lib/routed-legs";
import { dayRouteStops, formatDuration } from "@/lib/travel-legs";
import { typeColor } from "@/lib/type-color";
import { setWorkingDay, workingDay } from "@/lib/working-day";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip, UpdateTravelObjectInput } from "@/types/travel";
import { IdeasPanel } from "./calendar/IdeasPanel";
import { DayStrip } from "./plan/DayStrip";
import { PlanMap } from "./plan/PlanMap";
import { plannedTotals, stopMeta, stopNumbers, stopTimeLabel, tripDays } from "./plan/plan-domain";
import { AddGap, EndSlot, NoteBlock, StopRow } from "./plan/StopRow";
import { useDayRoutes } from "./plan/useDayRoutes";

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
}) {
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const today = dateParts(new Date(), trip.timezone).date;
  const [activeDate, setActiveDate] = useState(() => initialDate(trip, days, items, primarySelectedId));
  const [expandedId, setExpandedId] = useState<string | null>(primarySelectedId);
  const [seenPrimaryId, setSeenPrimaryId] = useState(primarySelectedId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mobileSurface, setMobileSurface] = useState<"list" | "map">("list");
  const [mapVisible, setMapVisible] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const suppressClickRef = useRef(false);
  const date = days.includes(activeDate) ? activeDate : initialDate(trip, days, items, null);

  // Selection that changes elsewhere (map pin, search, editor) expands that stop and shows its day.
  if (seenPrimaryId !== primarySelectedId) {
    setSeenPrimaryId(primarySelectedId);
    setExpandedId(primarySelectedId);
    // Clearing the selection brings the map back to the whole day after it flew to a stop.
    if (!primarySelectedId) setRecenterToken((token) => token + 1);
    const selected = primarySelectedId ? items.find((item) => item.id === primarySelectedId) : null;
    const selectedDate = selected?.date?.slice(0, 10);
    if (selected && selectedDate && days.includes(selectedDate) && !occursOnItineraryDate(selected, date)) {
      setActiveDate(selectedDate);
      setMapMoved(false);
      setRecenterToken((token) => token + 1);
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
  // Last night's hotel is pinned to the start of the day and tonight's to the end; the route runs between them.
  const { morning, evening, stops: routeStops } = useMemo(() => dayRouteStops(dayItems, date), [dayItems, date]);
  const middleRows = useMemo(
    () =>
      dayItems
        .map((item, order) => ({ item, order }))
        .filter(({ item }) => item.id !== morning?.id && item.id !== evening?.id),
    [dayItems, morning, evening],
  );
  const { legs, mapLegs, planned, estimatedNote } = useDayRoutes(routeStops, mode, overrides);
  const legByFromId = useMemo(() => new Map(legs.map((leg) => [leg.fromId, leg])), [legs]);
  const nextTitles = useMemo(() => {
    const titles = new Map(dayItems.map((item) => [item.id, item.title]));
    return new Map(legs.map((leg) => [leg.fromId, titles.get(leg.toId) ?? ""]));
  }, [legs, dayItems]);
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
  // Stops a drive arrives at (and the day's first stop, where the car starts) can have a car park picked.
  const parkingOfferIds = useMemo(() => {
    const ids = new Set<string>();
    if (mode !== "drive") return ids;
    for (const leg of planned) {
      if (leg.segments.some((segment) => segment.mode === "drive" && segment.role === "leg")) ids.add(leg.toId);
    }
    if (routeStops[0]) ids.add(routeStops[0].id);
    return ids;
  }, [mode, planned, routeStops]);
  const parkingMarkers = useMemo(
    () =>
      mode === "drive"
        ? [...parkingSpots(dayItems)].map(([id, spot]) => ({ id, lat: spot.lat, lng: spot.lng, name: spot.name }))
        : undefined,
    [mode, dayItems],
  );
  const setLegMode = (leg: DisplayLeg, next: TravelMode) =>
    setLegOverride(trip.id, `${leg.fromId}>${leg.toId}`, next === leg.defaultMode ? null : next);
  const events = useMemo(() => eventItems(dayItems), [dayItems]);
  // Map numbers follow the rows as shown: start hotel, the day's stops, then tonight's hotel (once if it is the same).
  const numbers = useMemo(
    () =>
      stopNumbers([
        ...(morning ? [morning] : []),
        ...eventItems(middleRows.map(({ item }) => item)),
        ...(evening && evening.id !== morning?.id ? [evening] : []),
      ]),
    [morning, evening, middleRows],
  );
  const flexTimes = useMemo(() => flexibleDisplayTimes(events), [events]);
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

  function pickDay(next: string) {
    if (next === date) return;
    setActiveDate(next);
    setExpandedId(null);
    setMapMoved(false);
    setRecenterToken((token) => token + 1);
  }

  // From `md` the Ideas panel takes a column beside the map, so the narrower or wider map refits the day.
  function toggleIdeas(open: boolean) {
    setIdeasOpen(open);
    if (!mapMoved) setRecenterToken((token) => token + 1);
  }

  function pickStop(item: TravelObject, additive: boolean) {
    if (suppressClickRef.current) return;
    if (additive) {
      onSelect(item, true);
      return;
    }
    if (expandedId === item.id && primarySelectedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    onSelect(item, false);
  }

  function editStop(item: TravelObject) {
    (onInspect ?? onSelect)(item);
  }

  function selectFromMap(item: TravelObject) {
    setExpandedId(item.id);
    onSelect(item);
    setMobileSurface("list");
    requestAnimationFrame(() =>
      document.getElementById(`plan-row-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
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
    if (item && !selectedIds.has(item.id)) onSelectForDrag(item);
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
      const dragged = event.active.rect.current.translated;
      const over = event.over?.rect;
      if (dragged && over && dragged.top + dragged.height / 2 > over.top + over.height / 2) gap += 1;
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

  const renderStop = (item: TravelObject, order: number, anchor?: "start" | "end") => (
    <StopRow
      key={anchor ? `${item.id}:${date}:${anchor}` : undefined}
      item={item}
      date={date}
      order={order}
      number={numbers.get(item.id) ?? null}
      color={typeColor(item.type, typeColors)}
      flexTime={flexTimes.get(item.id)}
      // The end row is where the day finishes; its hotel's outgoing leg belongs to the start row.
      leg={anchor === "end" ? undefined : legByFromId.get(item.id)}
      nextTitle={nextTitles.get(item.id)}
      selected={selectedIds.has(item.id)}
      primary={primarySelectedId === item.id}
      expanded={expandedId === item.id}
      hovered={hoveredId === item.id}
      driveMode={mode === "drive"}
      canFindParking={parkingOfferIds.has(item.id)}
      anchor={anchor}
      showParking={!(anchor === "end" && item.id === morning?.id)}
      onChangeItem={onChangeItem}
      onSetLegMode={setLegMode}
      onPick={pickStop}
      onEdit={editStop}
      onHover={setHoveredId}
    />
  );
  const listLabel = formatTripDate(`${date}T12:00:00Z`, "UTC", { month: "long", day: "numeric" });
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
            onAdd={onCreateIdea}
            onClose={() => toggleIdeas(false)}
          />
        )}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-8 sm:px-12 ${ideasOpen ? "md:px-6 xl:px-12" : ""}`}
        >
          <div
            className={`sticky top-0 z-20 -mx-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 bg-background px-4 pt-3 sm:-mx-12 sm:px-12 sm:pt-4 ${ideasOpen ? "md:-mx-6 md:px-6 xl:-mx-12 xl:px-12" : ""}`}
          >
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
                onClick={() => toggleIdeas(!ideasOpen)}
                className={`min-h-8 text-xs ${ideasOpen ? "text-foreground" : "text-muted hover:text-foreground"}`}
              >
                Ideas <span className="font-mono">{ideas.length}</span>
              </button>
            </div>
            <div className="flex basis-full border-b border-divider md:hidden" role="group" aria-label="Plan surface">
              {(["list", "map"] as const).map((surface) => (
                <button
                  key={surface}
                  type="button"
                  aria-pressed={mobileSurface === surface}
                  onClick={() => setMobileSurface(surface)}
                  className={`min-h-11 flex-1 text-sm ${mobileSurface === surface ? "font-medium text-foreground shadow-[inset_0_-1px_0_var(--ink)]" : "text-muted"}`}
                >
                  {surface === "list" ? "Stops" : "Map"}
                </button>
              ))}
            </div>
          </div>
          {/* With Ideas beside them, the list keeps room for its stop rows and the map takes the rest. */}
          <div className={`mt-4 flex flex-col gap-12 md:mt-6 md:flex-row ${ideasOpen ? "md:gap-8" : ""}`}>
            <div
              className={`min-w-0 md:block ${ideasOpen ? "md:flex-[1_1_380px] lg:flex-[1_0_380px]" : "md:flex-[1_1_520px]"} ${mobileSurface === "map" ? "hidden" : ""}`}
            >
              <ol aria-label={`Stops on ${listLabel}`} className="border-t border-foreground">
                {morning && renderStop(morning, dayItems.indexOf(morning), "start")}
                {middleRows.map(({ item, order }) => (
                  <Fragment key={`${item.id}:${date}`}>
                    <AddGap label={`Add stop at position ${order + 1}`} onAdd={() => onCreateItem(date, order)} />
                    {isNote(item) ? <NoteBlock item={item} date={date} order={order} /> : renderStop(item, order)}
                  </Fragment>
                ))}
                <EndSlot
                  date={date}
                  order={dayItems.length}
                  empty={dayItems.length === 0}
                  onAdd={() => onCreateItem(date, dayItems.length)}
                />
                {evening && renderStop(evening, dayItems.indexOf(evening), "end")}
              </ol>
            </div>
            {(mapVisible || mobileSurface === "map") && (
              <div
                className={`min-w-0 md:sticky md:top-28 md:block md:flex-[1_1_420px] md:self-start ${ideasOpen ? "md:min-w-60" : ""} ${mobileSurface === "list" ? "hidden" : ""}`}
              >
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
              </div>
            )}
          </div>
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
