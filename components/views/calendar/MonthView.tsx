"use client";

import { eventItems } from "@/lib/note-domain";
import { useState, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateParts, formatTripDate, shiftDate, startDateTimeFor } from "@/lib/date-utils";
import { compareScheduleOrder, isTimedItem, sortDayDisplayItems } from "@/lib/schedule-order";
import { itemDateSpan, occursOnItineraryDate } from "@/lib/schedule-domain";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";
import { selectionRing } from "./calendar-shared";

function EventChip({
  item,
  timezone,
  color,
  selected,
  primary,
  onSelect,
}: {
  item: TravelObject;
  timezone: string;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled: item.id.startsWith("draft:"),
  });
  const start = startDateTimeFor(item, timezone);
  const time = item.isAllDay
    ? "All day"
    : start
      ? formatTripDate(start, timezone, { hour: "numeric", minute: "2-digit" })
      : "Flexible";
  const style: CSSProperties = {
    backgroundColor: `${color}20`,
    borderColor: `${color}70`,
    color,
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={(event) => onSelect(item, event.shiftKey)}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`group flex w-full items-start gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 ${selectionRing(selected, primary)} ${isDragging ? "z-20 opacity-40" : ""}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={11} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100" />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
      <span className="hidden shrink-0 text-[10px] opacity-75 sm:inline">{time}</span>
    </button>
  );
}

function DayCell({
  date,
  currentMonth,
  items,
  timezone,
  typeColors,
  reservedRows,
  selectedIds,
  primarySelectedId,
  onSelect,
  onCreateItem,
}: {
  date: string;
  currentMonth: string;
  items: TravelObject[];
  timezone: string;
  typeColors: Record<string, string>;
  reservedRows: number;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onCreateItem: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const [, , day] = date.split("-").map(Number);
  const today = dateParts(new Date(), timezone).date;
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={() => onCreateItem(date)}
      title="Double-click to add an item"
      className={`min-h-[116px] border-b border-r p-1.5 transition-colors sm:min-h-[132px] ${date.slice(0, 7) === currentMonth ? "bg-white dark:bg-neutral-900" : "bg-stone-50/70 dark:bg-neutral-950"} ${isOver ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400 dark:bg-emerald-950" : ""}`}
    >
      <div
        className={`mb-1 flex h-6 w-6 items-center justify-center text-xs ${date === today ? "rounded-full bg-emerald-700 font-semibold text-white" : "text-stone-500 dark:text-stone-400"}`}
      >
        {day}
      </div>
      <div className="space-y-1" style={{ paddingTop: `${reservedRows * 22}px` }}>
        {items.map((item) => (
          <EventChip
            key={item.id}
            item={item}
            timezone={timezone}
            color={typeColor(item.type, typeColors)}
            selected={selectedIds.has(item.id)}
            primary={primarySelectedId === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function MultiDayBar({
  item,
  weekStart,
  startColumn,
  dayCount,
  lane,
  startsHere,
  endsHere,
  color,
  selected,
  primary,
  onSelect,
}: {
  item: TravelObject;
  weekStart: string;
  startColumn: number;
  dayCount: number;
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  // The grabbed day keeps its offset under the pointer, as in Week and Day views.
  const [draggedDate, setDraggedDate] = useState<string>();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${item.id}:${weekStart}`,
    data: { item, draggedDate },
    disabled: item.id.startsWith("draft:"),
  });
  const style: CSSProperties = {
    left: `calc(${(startColumn / 7) * 100}% + 2px)`,
    width: `calc(${(dayCount / 7) * 100}% - 4px)`,
    top: `${29 + lane * 23}px`,
    backgroundColor: `${color}30`,
    borderColor: `${color}80`,
    color,
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={(event) => onSelect(item, event.shiftKey)}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDownCapture={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const column = Math.floor(((event.clientX - rect.left) / rect.width) * dayCount);
        setDraggedDate(shiftDate(weekStart, startColumn + Math.min(Math.max(column, 0), dayCount - 1)));
      }}
      title={item.title}
      className={`absolute z-10 flex h-5 items-center gap-1 border px-1.5 text-left text-[10px] font-medium shadow-sm hover:brightness-95 ${startsHere ? "rounded-l-md" : "border-l-0"} ${endsHere ? "rounded-r-md" : "border-r-0"} ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="truncate">{item.title}</span>
    </button>
  );
}

/** Month grid on wider screens and a per-date agenda list on phones. */
export function MonthView({
  trip,
  items,
  grid,
  currentMonth,
  start,
  tripEnd,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
  onInspect,
  onCreateItem,
  onOpenDay,
}: {
  trip: Trip;
  items: TravelObject[];
  grid: string[];
  currentMonth: string;
  start: string;
  tripEnd: string;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onCreateItem: (date?: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const spans = eventItems(items)
    .map((item) => {
      const { first, last } = itemDateSpan(item);
      return { item, start: first!, end: last ?? first! };
    })
    .filter(({ item, start: spanStart, end }) => Boolean(spanStart && end && (end > spanStart || item.isAllDay)));
  const byDay = new Map<string, TravelObject[]>();
  for (const item of eventItems(items)) {
    const { first } = itemDateSpan(item);
    if (first && !spans.some((span) => span.item.id === item.id)) byDay.set(first, [...(byDay.get(first) ?? []), item]);
  }
  const weeks = Array.from({ length: 6 }, (_, index) => grid.slice(index * 7, index * 7 + 7));
  const weekSegments = weeks.map((days) => {
    const segments = spans
      .filter(({ start: spanStart, end }) => spanStart <= days[6] && end >= days[0])
      .map(({ item, start: spanStart, end }) => {
        const segmentStart = spanStart < days[0] ? days[0] : spanStart;
        const segmentEnd = end > days[6] ? days[6] : end;
        const startColumn = days.indexOf(segmentStart);
        const endColumn = days.indexOf(segmentEnd);
        return {
          item,
          start: segmentStart,
          end: segmentEnd,
          startColumn,
          dayCount: endColumn - startColumn + 1,
          startsHere: spanStart >= days[0],
          endsHere: end <= days[6],
        };
      })
      .sort(
        (a, b) =>
          Number(b.item.isAllDay) - Number(a.item.isAllDay) || a.startColumn - b.startColumn || b.dayCount - a.dayCount,
      );
    const laneEnds: string[] = [];
    const placed = segments.map((segment) => {
      let lane = laneEnds.findIndex((end) => end < segment.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      return { ...segment, lane };
    });
    return { days, segments: placed, laneCount: laneEnds.length };
  });
  const mobileMonthDates = grid.filter((date) => date.startsWith(currentMonth) && date >= start && date <= tripEnd);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto sm:hidden">
        {mobileMonthDates.length ? (
          mobileMonthDates.map((date) => {
            const dayItems = sortDayDisplayItems(eventItems(items).filter((item) => occursOnItineraryDate(item, date)));
            const label = formatTripDate(`${date}T12:00:00Z`, trip.timezone, {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
            return (
              <section key={date} className="border-b px-3 py-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onOpenDay(date)} className="min-h-11 min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    onClick={() => onCreateItem(date)}
                    aria-label={`Add item on ${label}`}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
                {dayItems.length ? (
                  <div className="mt-2 space-y-1">
                    {dayItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onInspect(item)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-left dark:bg-neutral-800"
                      >
                        <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">
                          {item.isAllDay ? "All day" : isTimedItem(item) ? item.startTime : "Flexible"}
                        </span>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: typeColor(item.type, typeColors) }}
                        />
                        <span className="min-w-0 truncate text-sm">{item.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No plans yet.</p>
                )}
              </section>
            );
          })
        ) : (
          <div className="grid min-h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            No trip dates in this month.
          </div>
        )}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto sm:block">
        <div className="min-w-[700px]">
          <div className="sticky top-0 z-20 grid grid-cols-7 border-b bg-stone-50 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:bg-neutral-800 dark:text-stone-300 sm:text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>
          {weekSegments.map(({ days, segments, laneCount }) => (
            <div key={days[0]} className="relative grid grid-cols-7">
              {days.map((date) => (
                <DayCell
                  key={date}
                  date={date}
                  currentMonth={currentMonth}
                  items={(byDay.get(date) ?? []).sort(compareScheduleOrder)}
                  timezone={trip.timezone}
                  typeColors={typeColors}
                  reservedRows={laneCount}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  onSelect={onSelect}
                  onCreateItem={onCreateItem}
                />
              ))}
              {segments.map((segment) => (
                <MultiDayBar
                  key={`${segment.item.id}:${days[0]}`}
                  item={segment.item}
                  weekStart={days[0]}
                  startColumn={segment.startColumn}
                  dayCount={segment.dayCount}
                  lane={segment.lane}
                  startsHere={segment.startsHere}
                  endsHere={segment.endsHere}
                  color={typeColor(segment.item.type, typeColors)}
                  selected={selectedIds.has(segment.item.id)}
                  primary={primarySelectedId === segment.item.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
