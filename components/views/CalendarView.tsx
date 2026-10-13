"use client";

import { eventItems, isNote } from "@/lib/note-domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Clock, Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayJourneyView } from "@/components/views/DayJourneyView";
import { dateParts, formatTripDate, monthGrid, shiftDate } from "@/lib/date-utils";
import { useTravelStore } from "@/store/use-travel-store";
import { api } from "@/lib/api-client";
import { canDropInDayOrder, weekFlexibleDropOrder } from "@/lib/schedule-order";
import { allDayDropStartDate, itemDateSpan } from "@/lib/schedule-domain";
import type { TravelObject, Trip } from "@/types/travel";
import { CalendarDragPreview } from "./calendar/calendar-shared";
import { IdeasPanel } from "./calendar/IdeasPanel";
import { MonthView } from "./calendar/MonthView";
import { WeekPlanner } from "./calendar/WeekPlanner";

type Mode = "month" | "week" | "day";

/** Month drops follow the pointer; the wide drag preview would otherwise bias drops to the right. */
const monthCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  return collisions.length ? collisions : rectIntersection(args);
};
function sundayOf(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  return shiftDate(date, -value.getUTCDay());
}

export function CalendarView({
  onCreateNote,
  onSaveNote,
  onDeleteNote,
  trip,
  items,
  typeColors = {},
  selectedIds,
  primarySelectedId,
  onSelect,
  onInspect,
  onSelectForDrag,
  onMove,
  onResize = () => undefined,
  onUnschedule,
  onFlexibleDrop = async (item, date, order, clearTime, placementTime) => {
    await api.reorderObjects({ tripId: trip.id, objectId: item.id, date, dayOrder: order, clearTime, placementTime });
    window.location.reload();
  },
  onCreateItem,
}: {
  onCreateNote: (date: string, order: number) => Promise<string | undefined>;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  trip: Trip;
  items: TravelObject[];
  typeColors?: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean, inspect?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onSelectForDrag: (item: TravelObject) => void;
  onMove: (item: TravelObject, date: string, time?: string) => Promise<void>;
  onResize?: (item: TravelObject, edge: "start" | "end", time: string) => void;
  onUnschedule: (item: TravelObject) => Promise<void>;
  onFlexibleDrop?: (
    item: TravelObject,
    date: string,
    order: number,
    clearTime: boolean,
    placementTime?: string,
  ) => Promise<void>;
  onCreateItem: (date?: string, time?: string, type?: string, title?: string, dayOrder?: number) => void;
}) {
  const start = trip.startDate.slice(0, 10);
  const tripEnd = trip.endDate.slice(0, 10);
  const mode = useTravelStore((state) => state.calendarMode);
  const setMode = useTravelStore((state) => state.setCalendarMode);
  const selectedAtMount = primarySelectedId ? items.find((item) => item.id === primarySelectedId) : null;
  const selectedDateAtMount = selectedAtMount ? itemDateSpan(selectedAtMount).first : null;
  const initialDate =
    selectedDateAtMount && selectedDateAtMount >= start && selectedDateAtMount <= tripEnd ? selectedDateAtMount : start;
  const [focusDate, setFocusDate] = useState(initialDate);
  const [expandedWeekDate, setExpandedWeekDate] = useState<string | null>(null);
  const [dayScrollRequest, setDayScrollRequest] = useState({ date: initialDate, nonce: 0 });
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const suppressClickRef = useRef(false);
  const previousModeRef = useRef<Mode>(mode);
  const today = dateParts(new Date(), trip.timezone).date;
  const month = useMemo(() => {
    const date = new Date(`${focusDate}T00:00:00Z`);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }, [focusDate]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const currentMonth = month.toISOString().slice(0, 7);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const ideas = eventItems(items).filter((item) => item.date === null);
  const scheduledItems = items.filter((item) => item.date !== null);
  const weekStart = sundayOf(focusDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const requestDay = useCallback(
    (date: string) => {
      const bounded = date < start ? start : date > tripEnd ? tripEnd : date;
      setFocusDate(bounded);
      setDayScrollRequest((request) => ({ date: bounded, nonce: request.nonce + 1 }));
    },
    [start, tripEnd],
  );
  useEffect(() => {
    const changedMode = previousModeRef.current !== mode;
    previousModeRef.current = mode;
    if (!changedMode || mode === "month" || !primarySelectedId) return;
    const selected = items.find((item) => item.id === primarySelectedId);
    const selectedDate = selected ? itemDateSpan(selected).first : null;
    if (!selectedDate) return;
    const frame = requestAnimationFrame(() => {
      if (mode === "day") requestDay(selectedDate);
      else setFocusDate(selectedDate);
    });
    return () => cancelAnimationFrame(frame);
  }, [items, mode, primarySelectedId, requestDay]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
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
      if (event.code === "Space" && mode !== "month") {
        event.preventDefault();
        setIdeasOpen((open) => !open);
        return;
      }
      const direction =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (!direction || mode === "month") return;
      event.preventDefault();
      if (mode === "day") requestDay(shiftDate(focusDate, direction));
      else setFocusDate((date) => shiftDate(date, direction));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusDate, mode, requestDay]);
  function finishDrag() {
    setActiveItem(null);
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  }
  function handleDragStart(event: DragStartEvent) {
    suppressClickRef.current = true;
    const item =
      (event.active.data.current as { item?: TravelObject } | undefined)?.item ??
      items.find((candidate) => candidate.id === String(event.active.id).split(":").at(-1));
    setActiveItem(item ?? null);
    if (item && !selectedIds.has(item.id)) onSelectForDrag(item);
  }
  async function handleDragEnd(event: DragEndEvent) {
    finishDrag();
    const target = String(event.over?.id ?? "");
    const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item;
    if (!item) return;
    if (target === "unscheduled") {
      if (!item.isAllDay && item.date !== null) await onUnschedule(item);
      return;
    }
    if (item.isAllDay) {
      const date = target.startsWith("day:")
        ? target.slice(4)
        : target.startsWith("day-") || target.startsWith("week-")
          ? target.split(":")[1]
          : null;
      if (date && item.date) {
        const draggedDate =
          (event.active.data.current as { draggedDate?: string } | undefined)?.draggedDate ?? item.date;
        const nextStart = allDayDropStartDate(item.date, draggedDate, date);
        if (item.date !== nextStart) await onMove(item, nextStart);
        setFocusDate(date);
      }
      return;
    }
    if (mode === "week") {
      const flexible = !item.startTime || !item.endTime;
      if (target.startsWith("week-time:")) {
        const [, date, rawHour] = target.split(":");
        if (date) {
          const targetTime = `${String(Number(rawHour)).padStart(2, "0")}:00`;
          if (flexible)
            await onFlexibleDrop(item, date, weekFlexibleDropOrder(scheduledItems, date, targetTime), true, targetTime);
          else await onMove(item, date, targetTime);
          setFocusDate(date);
        }
        return;
      }
      if (target.startsWith("week-cluster:")) {
        const [, date, rawAnchor, rawOrder] = target.split(":");
        if (date) {
          const targetTime = `${rawAnchor.slice(0, 2)}:${rawAnchor.slice(2, 4)}`;
          if (flexible) await onFlexibleDrop(item, date, Number(rawOrder) || 0, true, targetTime);
          else await onMove(item, date, targetTime);
          setFocusDate(date);
        }
        return;
      }
      if (target.startsWith("week-flex:")) {
        const [, date, rawOrder] = target.split(":");
        if (date) {
          const targetTime = item.placementTime ?? "09:00";
          if (flexible) await onFlexibleDrop(item, date, Number(rawOrder) || 0, true, targetTime);
          else await onMove(item, date, targetTime);
          setFocusDate(date);
        }
        return;
      }
    }
    if (target.startsWith("day-item:") || target.startsWith("day-list:") || target.startsWith("day-section:")) {
      const [, date, rawOrder] = target.split(":");
      if (date) {
        const order = Number(rawOrder) || 0;
        if (!isNote(item) && !canDropInDayOrder(scheduledItems, item, date, order)) return;
        await onFlexibleDrop(item, date, order, false);
        setFocusDate(date);
      }
      return;
    }
    if (target.startsWith("day:")) await onMove(item, target.slice(4));
  }
  function selectFromClick(item: TravelObject, additive = false) {
    if (!suppressClickRef.current) onSelect(item, additive);
  }
  function selectDayItem(item: TravelObject, additive = false) {
    if (!suppressClickRef.current) onSelect(item, additive, false);
  }
  function navigate(direction: number) {
    if (mode === "month") {
      const date = new Date(`${focusDate}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + direction);
      setFocusDate(date.toISOString().slice(0, 10));
    } else if (mode === "week") setFocusDate(shiftDate(focusDate, direction * 7));
    else requestDay(shiftDate(focusDate, direction));
  }
  function goToToday() {
    setMode("day");
    requestDay(today >= start && today <= tripEnd ? today : start);
  }
  const activeDragItems = activeItem
    ? [activeItem, ...items.filter((item) => item.id !== activeItem.id && selectedIds.has(item.id))]
    : [];
  const title =
    mode === "month"
      ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)
      : mode === "week"
        ? `${formatTripDate(`${weekDates[0]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${weekDates[6]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}`
        : `${formatTripDate(`${start}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${tripEnd}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
      <div className="hidden flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:flex">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "week"
              ? "Choose a day, then arrange its visit order"
              : mode === "day"
                ? "Continuous itinerary · map follows the active day"
                : `Times shown in ${trip.timezone}`}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {mode !== "month" && (
            <>
              <Button
                variant={ideasOpen ? "secondary" : "outline"}
                size="sm"
                title="Open Ideas (Space)"
                onClick={() => setIdeasOpen((open) => !open)}
              >
                <Lightbulb size={14} /> Ideas{" "}
                <span className="rounded-full bg-background/70 px-1.5 text-[10px]">{ideas.length}</span>
                <kbd className="rounded border px-1 text-[9px] font-normal opacity-70">Space</kbd>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onCreateItem()}>
                <Plus size={14} /> Add idea
              </Button>
            </>
          )}
          <div className="flex rounded-lg border p-0.5">
            {(["month", "week", "day"] as Mode[]).map((view) => (
              <Button
                key={view}
                variant={mode === view ? "secondary" : "ghost"}
                size="sm"
                className="capitalize"
                onClick={() => {
                  setMode(view);
                  if (view === "day") requestDay(focusDate);
                }}
              >
                {view}
                <kbd className="ml-1 rounded border px-1 text-[9px] font-normal opacity-60">
                  {view === "month" ? "Q" : view === "week" ? "W" : "E"}
                </kbd>
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous period">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (mode === "day" ? requestDay(start) : setFocusDate(start))}
          >
            Trip start
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Next period">
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="shrink-0 border-b bg-background px-3 py-2 sm:hidden">
        <div className="flex min-h-10 items-center justify-between gap-2">
          <strong className="min-w-0 truncate text-sm">{mode === "day" ? "Day itinerary" : title}</strong>
          {mode === "day" ? (
            <div className="flex gap-2">
              <Button
                className="min-h-11"
                variant={ideasOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIdeasOpen((open) => !open)}
              >
                <Lightbulb size={14} /> Ideas {ideas.length}
              </Button>
              <Button className="min-h-11" variant="outline" size="sm" onClick={() => onCreateItem()}>
                <Plus size={14} /> Idea
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button
                className="size-11"
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                aria-label="Previous period"
              >
                <ChevronLeft />
              </Button>
              <Button
                className="size-11"
                variant="ghost"
                size="icon"
                onClick={() => navigate(1)}
                aria-label="Next period"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
        {mode !== "day" && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex rounded-lg border p-0.5">
              {(["month", "week", "day"] as Mode[]).map((view) => (
                <Button
                  key={view}
                  variant={mode === view ? "secondary" : "ghost"}
                  size="sm"
                  className="min-h-11 capitalize"
                  onClick={() => {
                    setMode(view);
                    if (view === "day") requestDay(focusDate);
                  }}
                >
                  {view}
                </Button>
              ))}
            </div>
            <Button className="min-h-11" variant="ghost" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
        )}
        {mode === "week" && (
          <p className="mt-2 text-xs text-muted-foreground">Swipe sideways to see the rest of the week.</p>
        )}
      </div>
      {mode === "month" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={monthCollisionDetection}
          onDragStart={handleDragStart}
          onDragCancel={finishDrag}
          onDragEnd={(event) => {
            void handleDragEnd(event);
          }}
        >
          <MonthView
            trip={trip}
            items={scheduledItems}
            grid={grid}
            currentMonth={currentMonth}
            start={start}
            tripEnd={tripEnd}
            typeColors={typeColors}
            selectedIds={selectedIds}
            primarySelectedId={primarySelectedId}
            onSelect={selectFromClick}
            onInspect={onInspect}
            onCreateItem={onCreateItem}
            onOpenDay={(date) => {
              setMode("day");
              requestDay(date);
            }}
          />
          <DragOverlay dropAnimation={null}>
            {activeDragItems.length ? (
              <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const collisions = pointerWithin(args);
            const exactGap = collisions.find(
              ({ id }) =>
                String(id).startsWith("day-list:") ||
                String(id).startsWith("day-item:") ||
                String(id).startsWith("week-flex:") ||
                String(id).startsWith("week-cluster:"),
            );
            return exactGap ? [exactGap] : collisions.length ? collisions : closestCorners(args);
          }}
          onDragStart={handleDragStart}
          onDragCancel={finishDrag}
          onDragEnd={(event) => {
            void handleDragEnd(event);
          }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            {ideasOpen && (
              <IdeasPanel
                items={ideas}
                typeColors={typeColors}
                selectedIds={selectedIds}
                primarySelectedId={primarySelectedId}
                besideTimeline={mode === "day"}
                onSelect={selectFromClick}
                onAdd={() => onCreateItem()}
                onClose={() => setIdeasOpen(false)}
              />
            )}
            {mode === "week" ? (
              <WeekPlanner
                dates={weekDates}
                items={scheduledItems}
                trip={trip}
                typeColors={typeColors}
                selectedIds={selectedIds}
                primarySelectedId={primarySelectedId}
                expandedDate={expandedWeekDate}
                draggedItemId={activeItem?.id ?? null}
                onExpandedChange={setExpandedWeekDate}
                onSelectDay={(date) => {
                  setFocusDate(date);
                  setExpandedWeekDate(date);
                }}
                onSelect={selectFromClick}
                onResize={onResize}
                onCreateItem={(date, order, time) => onCreateItem(date, time, undefined, "(untitled event)", order)}
              />
            ) : (
              <DayJourneyView
                key={trip.id}
                onCreateNote={onCreateNote}
                onSaveNote={onSaveNote}
                onDeleteNote={onDeleteNote}
                trip={trip}
                items={scheduledItems}
                typeColors={typeColors}
                selectedIds={selectedIds}
                primarySelectedId={primarySelectedId}
                scrollRequest={dayScrollRequest}
                onActiveDate={setFocusDate}
                onSelect={selectDayItem}
                onInspect={onInspect}
                onCreateItem={(date, order) => onCreateItem(date, undefined, undefined, "(untitled event)", order)}
              />
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragItems.length ? (
              <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <div className="hidden items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
        <Clock size={13} />
        {mode === "month"
          ? "Drag items to another date. Double-click a date to add an item."
          : mode === "week"
            ? "Double-click a time slot to add an item. Drag ideas into exact visit-order gaps."
            : "Scroll the whole trip; the map follows the active day. Drag cards into exact order gaps."}
        {mode !== "month" && (
          <span className="ml-auto">
            Press{" "}
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
              Space
            </kbd>{" "}
            to toggle Ideas
          </span>
        )}
      </div>
    </div>
  );
}
