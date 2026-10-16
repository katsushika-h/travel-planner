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
import { dayLegs, dayTotals, formatDuration } from "@/lib/travel-legs";
import type { TravelObject, Trip } from "@/types/travel";
import { DayStrip } from "./plan/DayStrip";
import { PlanMap } from "./plan/PlanMap";
import { plannedTotals, stopMeta, stopNumbers, stopTimeLabel, tripDays } from "./plan/plan-domain";
import { AddGap, EndSlot, NoteBlock, StopRow } from "./plan/StopRow";

/** Remembers the day each trip was last viewed so switching views and back keeps the place. */
const lastViewedDate = new Map<string, string>();

function initialDate(trip: Trip, days: string[], items: TravelObject[], primaryId: string | null) {
  const primary = primaryId ? items.find((item) => item.id === primaryId) : null;
  const primaryDate = primary?.date?.slice(0, 10);
  if (primaryDate && days.includes(primaryDate)) return primaryDate;
  const remembered = lastViewedDate.get(trip.id);
  if (remembered && days.includes(remembered)) return remembered;
  const today = dateParts(new Date(), trip.timezone).date;
  return days.includes(today) ? today : days[0];
}

export function TripDaysView({
  trip,
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
  onInspect,
  onSelectForDrag,
  onMove,
  onReorder,
  onCreateItem,
}: {
  trip: Trip;
  /** Dated items for the trip. Notes are shown inline when present. */
  items: TravelObject[];
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
  onCreateItem: (date: string, order?: number) => void;
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
    lastViewedDate.set(trip.id, date);
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
  const legs = useMemo(() => dayLegs(dayItems), [dayItems]);
  const legByFromId = useMemo(() => new Map(legs.map((leg) => [leg.fromId, leg])), [legs]);
  const nextTitles = useMemo(() => {
    const titles = new Map(dayItems.map((item) => [item.id, item.title]));
    return new Map(legs.map((leg) => [leg.fromId, titles.get(leg.toId) ?? ""]));
  }, [legs, dayItems]);
  const walking = useMemo(() => {
    if (!legs.some((leg) => leg.status === "ok" && leg.walkable)) return "";
    return `~${formatDuration(dayTotals(legs).seconds)} walking`;
  }, [legs]);
  const events = useMemo(() => eventItems(dayItems), [dayItems]);
  const numbers = useMemo(() => stopNumbers(events), [events]);
  const flexTimes = useMemo(() => flexibleDisplayTimes(events), [events]);
  const mapped = useMemo(() => events.filter((item) => hasMapCoordinates(item.location)), [events]);
  const unmapped = events.filter((item) => !hasMapCoordinates(item.location));
  // A multi-day item's planned cost belongs to its first day only, so day totals never double count it.
  const totals = plannedTotals(events.filter((item) => item.date?.slice(0, 10) === date));
  const weekday = formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "long" });
  const summary = [weekday, `${events.length} ${events.length === 1 ? "stop" : "stops"}`, totals.join(", "), walking]
    .filter(Boolean)
    .join(" · ");

  function pickDay(next: string) {
    if (next === date) return;
    setActiveDate(next);
    setExpandedId(null);
    setMapMoved(false);
    setRecenterToken((token) => token + 1);
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

  const listLabel = formatTripDate(`${date}T12:00:00Z`, "UTC", { month: "long", day: "numeric" });
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8 sm:px-12">
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => pointerWithin(args).slice(0, 1)}
        onDragStart={onDragStart}
        onDragCancel={finishDrag}
        onDragEnd={(event) => {
          onDragEnd(event);
          finishDrag();
        }}
      >
        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 bg-background px-4 pt-3 sm:-mx-12 sm:px-12 sm:pt-4">
          <DayStrip days={days} activeDate={date} today={today} onPick={pickDay} />
          <p className="text-sm text-muted">{summary}</p>
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
        <div className="mt-4 flex flex-col gap-12 md:mt-6 md:flex-row">
          <div className={`min-w-0 md:block md:flex-[1_1_520px] ${mobileSurface === "map" ? "hidden" : ""}`}>
            <ol aria-label={`Stops on ${listLabel}`} className="border-t border-foreground">
              {dayItems.map((item, order) => (
                <Fragment key={`${item.id}:${date}`}>
                  <AddGap label={`Add stop at position ${order + 1}`} onAdd={() => onCreateItem(date, order)} />
                  {isNote(item) ? (
                    <NoteBlock item={item} date={date} order={order} />
                  ) : (
                    <StopRow
                      item={item}
                      date={date}
                      order={order}
                      number={numbers.get(item.id) ?? null}
                      flexTime={flexTimes.get(item.id)}
                      leg={legByFromId.get(item.id)}
                      nextTitle={nextTitles.get(item.id)}
                      selected={selectedIds.has(item.id)}
                      primary={primarySelectedId === item.id}
                      expanded={expandedId === item.id}
                      hovered={hoveredId === item.id}
                      onPick={pickStop}
                      onEdit={editStop}
                      onHover={setHoveredId}
                    />
                  )}
                </Fragment>
              ))}
              <EndSlot
                date={date}
                order={dayItems.length}
                empty={dayItems.length === 0}
                onAdd={() => onCreateItem(date, dayItems.length)}
              />
            </ol>
          </div>
          {(mapVisible || mobileSurface === "map") && (
            <div
              className={`min-w-0 md:sticky md:top-28 md:block md:flex-[1_1_420px] md:self-start ${mobileSurface === "list" ? "hidden" : ""}`}
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
              />
            </div>
          )}
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
