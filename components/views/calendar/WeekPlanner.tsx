"use client";

import { eventItems, weekDropPositions } from "@/lib/note-domain";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatTripDate, shiftDate } from "@/lib/date-utils";
import { compareScheduleOrder, weekFixedLayers, weekFlexibleWindows } from "@/lib/schedule-order";
import { occursOnItineraryDate } from "@/lib/schedule-domain";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";
import { isBookedItem, selectionRing } from "./calendar-shared";

const weekHourStart = 0;
const weekHourEnd = 24;
const weekRowHeight = 44;
const weekGridColumns = "grid grid-cols-[48px_repeat(7,minmax(0,1fr))] sm:grid-cols-[56px_repeat(7,minmax(0,1fr))]";
const weekDayMs = 24 * 60 * 60 * 1000;
/** `weekFixedLayers` steps 8px per overlap; the Minimal design indents 12px. */
const weekLayerStep = 12;

function weekMinutes(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}
function weekTimeLabel(minutes: number) {
  const bounded = Math.max(0, Math.min(23 * 60 + 45, Math.round(minutes / 15) * 15));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}
function WeekTimeSlot({
  date,
  hour,
  onCreateItem,
}: {
  date: string;
  hour: number;
  onCreateItem: (date: string, time: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-time:${date}:${hour}` });
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={(event) => {
        const minutes =
          hour * 60 + ((event.clientY - event.currentTarget.getBoundingClientRect().top) / weekRowHeight) * 60;
        onCreateItem(date, weekTimeLabel(minutes));
      }}
      title="Double-click to add an item at this time"
      className={`h-[44px] border-t border-divider ${isOver ? "bg-surface" : ""}`}
    />
  );
}

function WeekResizeHandle({
  item,
  edge,
  onResize,
  onPreview,
  onEnd,
}: {
  item: TravelObject;
  edge: "start" | "end";
  onResize: (item: TravelObject, edge: "start" | "end", time: string) => void;
  onPreview: (edge: "start" | "end", time: string) => void;
  onEnd: () => void;
}) {
  const previewRef = useRef<number | null>(null);
  function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const base =
      weekMinutes(edge === "start" ? item.startTime : item.endTime) ??
      (edge === "start" ? weekHourStart * 60 : weekHourStart * 60 + 60);
    const other =
      weekMinutes(edge === "start" ? item.endTime : item.startTime) ?? (edge === "start" ? base + 60 : base - 60);
    const origin = event.clientY;
    const onMove = (move: PointerEvent) => {
      const delta = Math.round((((move.clientY - origin) / weekRowHeight) * 60) / 15) * 15;
      const next = edge === "start" ? Math.min(base + delta, other - 15) : Math.max(base + delta, other + 15);
      previewRef.current = Math.max(0, Math.min(23 * 60 + 45, next));
      onPreview(edge, weekTimeLabel(previewRef.current));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (previewRef.current !== null) onResize(item, edge, weekTimeLabel(previewRef.current));
      previewRef.current = null;
      onEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  return (
    <span
      role="button"
      aria-label={`Adjust ${edge} time for ${item.title}`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      className={`absolute left-1/2 z-30 h-6 w-14 -translate-x-1/2 cursor-ns-resize transition-opacity after:absolute after:left-1/2 after:top-1/2 after:h-1 after:w-8 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-foreground after:content-[''] sm:h-2 sm:w-12 sm:rounded-full sm:bg-foreground sm:opacity-0 sm:after:hidden sm:group-hover:opacity-100 ${edge === "start" ? "-top-3 sm:-top-1" : "-bottom-3 sm:-bottom-1"}`}
    />
  );
}

function WeekFixedItem({
  item,
  color,
  layer,
  selected,
  primary,
  onSelect,
  onResize,
}: {
  item: TravelObject;
  color: string;
  layer: { left: number; zIndex: number };
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onResize: (item: TravelObject, edge: "start" | "end", time: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `week:${item.id}`,
    data: { item },
  });
  const [preview, setPreview] = useState<{ edge: "start" | "end"; time: string } | null>(null);
  const start = weekMinutes(item.startTime);
  const end = weekMinutes(item.endTime) ?? (start ?? weekHourStart * 60) + 60;
  const top = Math.max(0, (((start ?? weekHourStart * 60) - weekHourStart * 60) / 60) * weekRowHeight);
  const height = Math.max(30, ((end - (start ?? weekHourStart * 60)) / 60) * weekRowHeight - 3);
  const previewStart = preview?.edge === "start" ? weekMinutes(preview.time)! : start!;
  const previewEnd = preview?.edge === "end" ? weekMinutes(preview.time)! : end;
  const ghostTop = ((previewStart - (start ?? weekHourStart * 60)) / 60) * weekRowHeight;
  const ghostHeight = Math.max(15, ((previewEnd - previewStart) / 60) * weekRowHeight);
  const depth = Math.max(0, Math.round((layer.left - 4) / 8));
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(event) => onSelect(item, event.shiftKey)}
      style={{
        top,
        height,
        left: 4 + depth * weekLayerStep,
        right: 4,
        zIndex: isDragging ? 40 : layer.zIndex,
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
      }}
      className={`group absolute flex flex-col items-stretch justify-start overflow-visible border-l-[3px] bg-surface px-2 py-[5px] text-left ${depth ? "shadow-[0_0_0_1px_var(--background),0_2px_8px_rgb(0_0_0/0.12)] dark:shadow-[0_0_0_1px_var(--background),0_2px_10px_rgb(0_0_0/0.6)]" : ""} ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
    >
      {isBookedItem(item) && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground" />
      )}
      {preview && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 border border-dashed border-accent bg-accent/10"
          style={{ top: ghostTop, height: ghostHeight }}
        >
          <span className="absolute -top-4 right-0 bg-foreground px-1 font-mono text-[9px] text-background">
            {previewStart === previewEnd ? preview.time : `${weekTimeLabel(previewStart)}–${weekTimeLabel(previewEnd)}`}
          </span>
        </span>
      )}
      <WeekResizeHandle
        item={item}
        edge="start"
        onResize={onResize}
        onPreview={(edge, time) => setPreview({ edge, time })}
        onEnd={() => setPreview(null)}
      />
      <span className="block truncate text-xs font-medium leading-tight">{item.title}</span>
      <span className="block truncate font-mono text-[10px] leading-snug text-muted">
        {item.startTime}–{item.endTime}
      </span>
      <WeekResizeHandle
        item={item}
        edge="end"
        onResize={onResize}
        onPreview={(edge, time) => setPreview({ edge, time })}
        onEnd={() => setPreview(null)}
      />
    </button>
  );
}

function WeekFlexibleGap({ date, order }: { date: string; order: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-flex:${date}:${order}` });
  return <div ref={setNodeRef} className={`h-1 transition ${isOver ? "bg-accent" : ""}`} />;
}

function WeekClusterItem({
  item,
  color,
  selected,
  primary,
  onSelect,
}: {
  item: TravelObject;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `week:${item.id}`,
    data: { item },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      title={item.title}
      onClick={(event) => onSelect(item, event.shiftKey)}
      style={{
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
      }}
      className={`flex min-h-6 w-full min-w-0 items-center gap-1.5 border border-l-[3px] border-divider bg-background px-1.5 text-left text-[11px] ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="shrink-0 font-mono text-[10px] text-faint">
        {item.dayOrder != null ? item.dayOrder + 1 : "·"}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}

type AllDaySegment = {
  item: TravelObject;
  startColumn: number;
  dayCount: number;
  lane: number;
  nights: number;
};

/** All-day items become one bar spanning the week days they occupy, stacked into lanes. */
function allDaySegments(items: TravelObject[], dates: string[]) {
  const spans = eventItems(items)
    .filter((item) => item.isAllDay && item.date)
    .sort(compareScheduleOrder)
    .map((item) => {
      const first = item.date!.slice(0, 10);
      const last = (item.endDate ?? item.date!).slice(0, 10);
      // A stay covers its nights: the check-out day is not an occupied column.
      const lastColumn = item.type === "hotel" && last > first ? shiftDate(last, -1) : last;
      const columns = dates.flatMap((date, index) =>
        occursOnItineraryDate(item, date) && date <= lastColumn ? [index] : [],
      );
      if (!columns.length) return null;
      const nights = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / weekDayMs);
      return { item, startColumn: columns[0], dayCount: columns.length, nights };
    })
    .filter((span): span is NonNullable<typeof span> => span !== null)
    .sort((a, b) => a.startColumn - b.startColumn || b.dayCount - a.dayCount);
  const laneEnds: number[] = [];
  const segments: AllDaySegment[] = spans.map((span) => {
    let lane = laneEnds.findIndex((end) => end <= span.startColumn);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = span.startColumn + span.dayCount;
    return { ...span, lane };
  });
  return { segments, laneCount: laneEnds.length };
}

function tripDayNumber(trip: Trip, date: string) {
  const first = trip.startDate?.slice(0, 10);
  const last = trip.endDate?.slice(0, 10);
  if (!first || date < first || (last && date > last)) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / weekDayMs) + 1;
}

function WeekAllDayCell({ date }: { date: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return <div ref={setNodeRef} className={isOver ? "bg-surface" : ""} />;
}

function WeekAllDayBar({
  segment,
  weekStart,
  color,
  selected,
  primary,
  onSelect,
}: {
  segment: AllDaySegment;
  weekStart: string;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { item, startColumn, dayCount, lane, nights } = segment;
  // The grabbed day keeps its offset under the pointer, as in Month.
  const [draggedDate, setDraggedDate] = useState<string>();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `week-all-day:${weekStart}:${item.id}`,
    data: { item, draggedDate },
  });
  const suffix = item.type === "hotel" ? `${nights} ${nights === 1 ? "night" : "nights"}` : `${nights + 1} days`;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      title={item.title}
      onClick={(event) => onSelect(item, event.shiftKey)}
      onPointerDownCapture={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const column = Math.floor(((event.clientX - rect.left) / rect.width) * dayCount);
        setDraggedDate(shiftDate(weekStart, startColumn + Math.min(Math.max(column, 0), dayCount - 1)));
      }}
      style={{
        left: `calc(${(startColumn / 7) * 100}% + 6px)`,
        width: `calc(${(dayCount / 7) * 100}% - 12px)`,
        top: 6 + lane * 26,
        borderTopColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
      }}
      className={`absolute z-10 flex h-[22px] min-w-0 items-baseline gap-1.5 border-t bg-background pt-[3px] text-left text-xs ${selected ? "text-accent" : ""} ${primary ? "font-medium" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="truncate">{item.title}</span>
      <span className="shrink-0 text-muted">· {suffix}</span>
    </button>
  );
}

function WeekAllDayBand({
  dates,
  segments,
  laneCount,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
}: {
  dates: string[];
  segments: AllDaySegment[];
  laneCount: number;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const stays = segments.every(({ item }) => item.type === "hotel");
  return (
    <div className={`${weekGridColumns} border-b border-divider`}>
      <div className="pt-[9px] text-[11px] text-muted">{stays ? "Stays" : "All day"}</div>
      <div className="relative col-span-7" style={{ height: laneCount * 26 + 10 }}>
        <div className="absolute inset-0 grid grid-cols-7">
          {dates.map((date) => (
            <WeekAllDayCell key={date} date={date} />
          ))}
        </div>
        {segments.map((segment) => (
          <WeekAllDayBar
            key={segment.item.id}
            segment={segment}
            weekStart={dates[0]}
            color={stays || segment.item.type === "hotel" ? "var(--ink)" : typeColor(segment.item.type, typeColors)}
            selected={selectedIds.has(segment.item.id)}
            primary={primarySelectedId === segment.item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

const weekWindowCompactHeight = 22;

// Flexible items fill the free time between their fixed neighbours; a gap too short for the list collapses to one line.
function WeekFlexibleWindow({
  date,
  label,
  description,
  anchor,
  top,
  height,
  compact,
  items,
  expanded,
  dropOrder,
  typeColors,
  selectedIds,
  primarySelectedId,
  onToggle,
  onCollapse,
  onSelect,
}: {
  date: string;
  label: string;
  description: string;
  anchor: string;
  top: number;
  height: number;
  compact: boolean;
  items: TravelObject[];
  expanded: boolean;
  dropOrder: Map<string, number>;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onToggle: () => void;
  onCollapse: () => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `week-cluster:${date}:${anchor.replace(":", "")}:${dropOrder.get(items[0]?.id) ?? 0}`,
  });
  const frame = `border border-dashed ${isOver ? "border-accent bg-surface" : "border-input-rule"}`;
  const list = items.map((item) => (
    <div key={item.id}>
      <WeekFlexibleGap date={date} order={dropOrder.get(item.id) ?? 0} />
      <WeekClusterItem
        item={item}
        color={typeColor(item.type, typeColors)}
        selected={selectedIds.has(item.id)}
        primary={primarySelectedId === item.id}
        onSelect={onSelect}
      />
    </div>
  ));
  if (!compact)
    return (
      <div
        ref={setNodeRef}
        role="group"
        aria-label={`Flexible: ${description}`}
        title={description}
        className={`absolute inset-x-1 z-20 flex flex-col overflow-hidden p-1 ${frame}`}
        style={{ top, height }}
      >
        <span className="truncate px-0.5 text-[10px] text-muted">{label}</span>
        {list}
      </div>
    );
  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-1 z-30"
      style={{ top }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCollapse();
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${items.length} flexible ${items.length === 1 ? "item" : "items"}, ${description}`}
        title={description}
        onClick={onToggle}
        className={`flex w-full min-w-0 items-center gap-1 bg-background px-1.5 text-left text-[10px] text-muted ${frame}`}
        style={{ height: weekWindowCompactHeight }}
      >
        <span className="shrink-0 font-medium text-foreground">+{items.length} flexible</span>
        <span className="min-w-0 truncate">· {items.map((item) => item.title).join(", ")}</span>
      </button>
      {expanded && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 border border-input-rule bg-background p-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.15)] dark:shadow-[0_8px_24px_rgb(0_0_0/0.6)]">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] text-muted">{label}</span>
            <button
              type="button"
              onClick={onCollapse}
              className="min-h-11 shrink-0 px-1.5 text-[10px] underline underline-offset-2 hover:text-accent sm:min-h-6"
              aria-label="Close flexible items"
            >
              Close
            </button>
          </div>
          {list}
        </div>
      )}
    </div>
  );
}

function WeekDayColumn({
  date,
  items,
  trip,
  typeColors,
  selectedIds,
  primarySelectedId,
  expandedChunk,
  draggedItemId,
  onExpandedChange,
  onSelect,
  onResize,
  onCreateItem,
}: {
  date: string;
  items: TravelObject[];
  trip: Trip;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  expandedChunk: string | null;
  draggedItemId: string | null;
  onExpandedChange: (key: string | null) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onResize: (item: TravelObject, edge: "start" | "end", time: string) => void;
  onCreateItem: (date: string, order?: number, time?: string) => void;
}) {
  const visibleItems = eventItems(items);
  const orderedItems = visibleItems.filter((item) => !item.isAllDay).sort(compareScheduleOrder);
  const fixedItems = orderedItems.filter((item) => item.startTime && item.endTime);
  const dropOrder = weekDropPositions(items, date);
  const fixedLayers = weekFixedLayers(fixedItems);
  const toTop = (minutes: number) => (minutes / 60) * weekRowHeight;
  const dayHeight = 24 * weekRowHeight;
  const windows = weekFlexibleWindows(orderedItems).map((slot) => {
    const needed = 20 + slot.items.length * 28;
    const start = weekMinutes(slot.start);
    const end = weekMinutes(slot.end);
    let top: number;
    let height = needed;
    let compact = false;
    if (start !== null && end !== null) {
      top = toTop(start);
      const gap = toTop(end) - top;
      if (gap >= needed) height = gap;
      else {
        compact = true;
        if (gap < weekWindowCompactHeight) top = toTop(end) - weekWindowCompactHeight;
      }
    } else if (start !== null) top = toTop(start);
    else if (end !== null) {
      top = toTop(end) - needed;
      if (top < 0) {
        compact = true;
        top = toTop(end) - weekWindowCompactHeight;
      }
    } else top = toTop(weekMinutes(slot.items[0].placementTime) ?? 9 * 60);
    top = Math.max(0, Math.min(dayHeight - (compact ? weekWindowCompactHeight : height), top));
    const label =
      start !== null && end !== null
        ? `Flexible · ${slot.start}–${slot.end}`
        : start !== null
          ? `Flexible · after ${slot.start}`
          : end !== null
            ? `Flexible · before ${slot.end}`
            : "Flexible · anytime";
    const description =
      slot.previous && slot.next
        ? `between ${slot.previous.title} and ${slot.next.title}`
        : slot.previous
          ? `after ${slot.previous.title}`
          : slot.next
            ? `before ${slot.next.title}`
            : "anytime this day";
    return { ...slot, top, height, compact, label, description, anchor: weekTimeLabel((top / weekRowHeight) * 60) };
  });
  return (
    <section
      className={`relative ${expandedChunk?.startsWith(`${date}:`) || windows.some((slot) => slot.items.some((item) => item.id === draggedItemId)) ? "z-40" : "z-0"} min-w-0 border-l border-divider`}
    >
      <div className="relative min-h-[1056px]">
        {Array.from({ length: weekHourEnd - weekHourStart }, (_, index) => (
          <WeekTimeSlot
            key={index}
            date={date}
            hour={weekHourStart + index}
            onCreateItem={(date, time) => onCreateItem(date, undefined, time)}
          />
        ))}
        {fixedItems.map((item) => (
          <WeekFixedItem
            key={item.id}
            item={item}
            color={typeColor(item.type, typeColors)}
            layer={fixedLayers.get(item.id)!}
            selected={selectedIds.has(item.id)}
            primary={primarySelectedId === item.id}
            onSelect={onSelect}
            onResize={onResize}
          />
        ))}
        {windows.map((slot) => (
          <WeekFlexibleWindow
            key={slot.key}
            date={date}
            label={slot.label}
            description={slot.description}
            anchor={slot.anchor}
            top={slot.top}
            height={slot.height}
            compact={slot.compact}
            items={slot.items}
            expanded={expandedChunk === `${date}:${slot.key}` || slot.items.some((item) => item.id === draggedItemId)}
            dropOrder={dropOrder}
            typeColors={typeColors}
            selectedIds={selectedIds}
            primarySelectedId={primarySelectedId}
            onToggle={() => onExpandedChange(expandedChunk === `${date}:${slot.key}` ? null : `${date}:${slot.key}`)}
            onCollapse={() => {
              if (expandedChunk === `${date}:${slot.key}`) onExpandedChange(null);
            }}
            onSelect={onSelect}
          />
        ))}
        {visibleItems.length === 0 && (
          <button
            type="button"
            onClick={() => onCreateItem(date, items.filter((item) => item.date?.slice(0, 10) === date).length)}
            className="absolute inset-x-2 top-4 min-h-11 border border-dashed border-input-rule py-3 text-[11px] text-faint hover:text-foreground"
          >
            Add item
          </button>
        )}
      </div>
    </section>
  );
}

function WeekDayHeader({ date, trip, onSelectDay }: { date: string; trip: Trip; onSelectDay: () => void }) {
  const dayNumber = tripDayNumber(trip, date);
  return (
    <button
      type="button"
      onClick={onSelectDay}
      className="flex min-w-0 items-baseline gap-1.5 px-1.5 pb-3 pt-3.5 text-left hover:bg-surface sm:gap-2 sm:px-2.5"
    >
      <span className="font-mono text-xl font-light sm:text-2xl">{date.slice(8, 10)}</span>
      <span className="truncate text-xs text-muted">
        {formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short" })}
        {dayNumber ? ` · Day ${dayNumber}` : ""}
      </span>
    </button>
  );
}

export function WeekPlanner({
  dates,
  items,
  trip,
  typeColors,
  selectedIds,
  primarySelectedId,
  expandedDate,
  draggedItemId,
  onExpandedChange,
  onSelect,
  onResize,
  onSelectDay,
  onCreateItem,
}: {
  dates: string[];
  items: TravelObject[];
  trip: Trip;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  expandedDate: string | null;
  draggedItemId: string | null;
  onExpandedChange: (key: string | null) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onResize: (item: TravelObject, edge: "start" | "end", time: string) => void;
  onSelectDay: (date: string) => void;
  onCreateItem: (date: string, order?: number, time?: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const datedItems = dates.map((date) =>
    items.filter((item) => (item.isAllDay ? occursOnItineraryDate(item, date) : item.date?.slice(0, 10) === date)),
  );
  const { segments, laneCount } = allDaySegments(items, dates);
  // Open on the first item of the week rather than midnight; all 24 hours stay reachable by scrolling.
  const firstMinutes = Math.min(
    ...datedItems.flatMap((dayItems) =>
      eventItems(dayItems)
        .filter((item) => !item.isAllDay)
        .map((item) => weekMinutes(item.startTime) ?? weekMinutes(item.placementTime) ?? 9 * 60),
    ),
    8 * 60,
  );
  const weekKey = dates[0];
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, (firstMinutes / 60) * weekRowHeight - weekRowHeight / 2) });
    // Re-anchor only when the visible week changes, never while items are being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 pb-6 sm:px-7">
      <div className="min-w-[900px]">
        <div className="sticky top-0 z-50 border-t border-foreground bg-background">
          <div className={weekGridColumns}>
            <div />
            {dates.map((date) => (
              <WeekDayHeader key={date} date={date} trip={trip} onSelectDay={() => onSelectDay(date)} />
            ))}
          </div>
          {laneCount > 0 && (
            <WeekAllDayBand
              dates={dates}
              segments={segments}
              laneCount={laneCount}
              typeColors={typeColors}
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              onSelect={onSelect}
            />
          )}
        </div>
        <div className={`${weekGridColumns} border-b border-divider`}>
          <div className="relative text-right font-mono text-[11px] text-faint">
            {Array.from({ length: weekHourEnd - weekHourStart }, (_, index) => (
              <div key={index} className="relative h-[44px]">
                <span className={`absolute right-2 ${index === 0 ? "top-0.5" : "-top-[7px]"}`}>
                  {String(weekHourStart + index).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
          {dates.map((date, index) => (
            <WeekDayColumn
              key={date}
              date={date}
              items={datedItems[index]}
              trip={trip}
              typeColors={typeColors}
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              expandedChunk={expandedDate}
              draggedItemId={draggedItemId}
              onExpandedChange={onExpandedChange}
              onSelect={onSelect}
              onResize={onResize}
              onCreateItem={onCreateItem}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
