"use client";

import { eventItems, weekDropPositions } from "@/lib/note-domain";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatTripDate } from "@/lib/date-utils";
import { compareScheduleOrder, weekFixedLayers, weekFlexibleWindows } from "@/lib/schedule-order";
import { occursOnItineraryDate } from "@/lib/schedule-domain";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";
import { selectionRing } from "./calendar-shared";

const weekHourStart = 0;
const weekHourEnd = 24;
const weekRowHeight = 44;

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
      className={`h-[44px] border-t border-stone-200/80 dark:border-neutral-800 ${isOver ? "bg-emerald-50/80 dark:bg-emerald-950/30" : ""}`}
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
      className={`absolute left-1/2 z-30 h-6 w-14 -translate-x-1/2 cursor-ns-resize rounded-full bg-emerald-500 opacity-100 shadow-sm transition-opacity sm:h-2 sm:w-12 sm:opacity-0 sm:group-hover:opacity-100 ${edge === "start" ? "-top-3 sm:-top-1" : "-bottom-3 sm:-bottom-1"}`}
    />
  );
}

function WeekFixedItem({
  item,
  color,
  layer,
  onSelect,
  onResize,
}: {
  item: TravelObject;
  color: string;
  layer: { left: number; zIndex: number };
  onSelect: (item: TravelObject) => void;
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
  const height = Math.max(34, ((end - (start ?? weekHourStart * 60)) / 60) * weekRowHeight);
  const previewStart = preview?.edge === "start" ? weekMinutes(preview.time)! : start!;
  const previewEnd = preview?.edge === "end" ? weekMinutes(preview.time)! : end;
  const ghostTop = ((previewStart - (start ?? weekHourStart * 60)) / 60) * weekRowHeight;
  const ghostHeight = Math.max(15, ((previewEnd - previewStart) / 60) * weekRowHeight);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onSelect(item)}
      style={{
        top,
        height,
        left: layer.left,
        right: 4,
        zIndex: isDragging ? 40 : layer.zIndex,
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
      }}
      className={`group absolute overflow-visible rounded-md border border-l-4 bg-background/95 px-2 py-1.5 text-left text-[10px] shadow-sm ${isDragging ? "opacity-40" : ""}`}
    >
      {preview && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-emerald-400 bg-emerald-400/15"
          style={{ top: ghostTop, height: ghostHeight }}
        >
          <span className="absolute -top-4 right-0 rounded bg-emerald-700 px-1 text-[8px] font-medium text-white">
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
      <span className="block truncate font-semibold">{item.title}</span>
      <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
        {item.startTime}–{item.endTime} · {item.type}
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
  return <div ref={setNodeRef} className={`h-1 rounded transition ${isOver ? "bg-emerald-500" : ""}`} />;
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
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}
      className={`flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded border bg-background px-1.5 text-left text-[10px] font-medium shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="shrink-0 font-mono text-[9px] font-normal text-muted-foreground">
        {item.dayOrder != null ? item.dayOrder + 1 : "·"}
      </span>
      <span aria-hidden className="size-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}

function WeekAllDayItem({
  item,
  date,
  color,
  selected,
  primary,
  onSelect,
}: {
  item: TravelObject;
  date: string;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `week-all-day:${date}:${item.id}`,
    data: { item, draggedDate: date },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(event) => onSelect(item, event.shiftKey)}
      style={{
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
      }}
      className={`flex h-6 w-full min-w-0 items-center rounded border border-l-4 bg-background px-1.5 text-left text-[9px] shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
      title={item.title}
    >
      <span className="truncate font-medium">{item.title}</span>
    </button>
  );
}

function WeekAllDayLane({
  date,
  items,
  height,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
}: {
  date: string;
  items: TravelObject[];
  height: number;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return (
    <div
      ref={setNodeRef}
      style={{ height }}
      className={`space-y-1 overflow-y-auto border-b px-1 py-1 ${isOver ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-stone-50/70 dark:bg-neutral-950/40"}`}
    >
      {items.map((item) => (
        <WeekAllDayItem
          key={item.id}
          item={item}
          date={date}
          color={typeColor(item.type, typeColors)}
          selected={selectedIds.has(item.id)}
          primary={primarySelectedId === item.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

const weekWindowHatch: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(120, 113, 108, 0.08) 0 6px, transparent 6px 12px)",
};
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
  const frame = `rounded-md border border-dashed ${isOver ? "border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/60" : "border-stone-300 bg-stone-50/90 dark:border-neutral-600 dark:bg-neutral-900/90"}`;
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
        style={{ top, height, ...weekWindowHatch }}
      >
        <span className="truncate px-0.5 text-[9px] text-muted-foreground">{label}</span>
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
        className={`flex w-full min-w-0 items-center gap-1 px-1.5 text-left text-[10px] text-muted-foreground shadow-sm ${frame}`}
        style={{ height: weekWindowCompactHeight, ...weekWindowHatch }}
      >
        <span className="shrink-0 font-semibold text-foreground">+{items.length} flexible</span>
        <span className="min-w-0 truncate">· {items.map((item) => item.title).join(", ")}</span>
      </button>
      {expanded && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-md border bg-background p-1.5 shadow-xl">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[9px] text-muted-foreground">{label}</span>
            <button
              type="button"
              onClick={onCollapse}
              className="min-h-11 shrink-0 rounded px-1.5 text-[10px] hover:bg-muted sm:min-h-6"
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
  allDayHeight,
  trip,
  typeColors,
  selectedIds,
  primarySelectedId,
  expandedChunk,
  draggedItemId,
  onExpandedChange,
  onSelect,
  onResize,
  onSelectDay,
  onCreateItem,
}: {
  date: string;
  items: TravelObject[];
  allDayHeight: number;
  trip: Trip;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  expandedChunk: string | null;
  draggedItemId: string | null;
  onExpandedChange: (key: string | null) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onResize: (item: TravelObject, edge: "start" | "end", time: string) => void;
  onSelectDay: () => void;
  onCreateItem: (date: string, order?: number, time?: string) => void;
}) {
  const visibleItems = eventItems(items);
  const allDayItems = visibleItems.filter((item) => item.isAllDay).sort(compareScheduleOrder);
  const orderedItems = visibleItems.filter((item) => !item.isAllDay).sort(compareScheduleOrder);
  const fixedItems = orderedItems.filter((item) => !item.isAllDay && item.startTime && item.endTime);
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
      className={`relative ${expandedChunk?.startsWith(`${date}:`) || windows.some((slot) => slot.items.some((item) => item.id === draggedItemId)) ? "z-40" : "z-0"} min-w-0 border-l bg-white dark:bg-neutral-900`}
    >
      <button
        type="button"
        onClick={onSelectDay}
        className="relative z-10 flex h-14 w-full flex-col justify-center border-b px-2 text-left hover:bg-stone-50 dark:hover:bg-neutral-800"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          {formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short" })}
        </span>
        <span className="truncate text-xs font-semibold">
          {formatTripDate(`${date}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {visibleItems.length} {visibleItems.length === 1 ? "place" : "places"}
        </span>
      </button>
      {allDayHeight > 0 && (
        <WeekAllDayLane
          date={date}
          items={allDayItems}
          height={allDayHeight}
          typeColors={typeColors}
          selectedIds={selectedIds}
          primarySelectedId={primarySelectedId}
          onSelect={onSelect}
        />
      )}
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
            className="absolute inset-x-2 top-4 min-h-11 rounded border border-dashed py-3 text-[10px] text-muted-foreground"
          >
            Add item
          </button>
        )}
      </div>
    </section>
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
  const datedItems = dates.map((date) =>
    items.filter((item) => (item.isAllDay ? occursOnItineraryDate(item, date) : item.date?.slice(0, 10) === date)),
  );
  const allDayRows = Math.max(0, ...datedItems.map((dayItems) => dayItems.filter((item) => item.isAllDay).length));
  const allDayHeight = allDayRows ? allDayRows * 28 + 8 : 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-stone-50/60 dark:bg-neutral-950">
      <div className="grid min-w-[980px] grid-cols-[44px_repeat(7,minmax(120px,1fr))]">
        <div className="relative bg-white pt-14 text-right text-[10px] text-muted-foreground dark:bg-neutral-900">
          {allDayHeight > 0 && (
            <div style={{ height: allDayHeight }} className="border-b px-1 pt-1 text-[9px]">
              All day
            </div>
          )}
          {Array.from({ length: weekHourEnd - weekHourStart }, (_, index) => (
            <div key={index} className="h-[44px] border-t px-1 pt-1">
              {String(weekHourStart + index).padStart(2, "0")}:00
            </div>
          ))}
          <div className="absolute bottom-0 right-1 text-[10px]">24:00</div>
        </div>
        {dates.map((date, index) => (
          <WeekDayColumn
            key={date}
            date={date}
            items={datedItems[index]}
            allDayHeight={allDayHeight}
            trip={trip}
            typeColors={typeColors}
            selectedIds={selectedIds}
            primarySelectedId={primarySelectedId}
            expandedChunk={expandedDate}
            draggedItemId={draggedItemId}
            onExpandedChange={onExpandedChange}
            onSelect={onSelect}
            onResize={onResize}
            onSelectDay={() => onSelectDay(date)}
            onCreateItem={onCreateItem}
          />
        ))}
      </div>
    </div>
  );
}
