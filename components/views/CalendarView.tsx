"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Clock, GripVertical, Lightbulb, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayJourneyView } from "@/components/views/DayJourneyView";
import { dateParts, formatTripDate, monthGrid, shiftDate, startDateTimeFor } from "@/lib/date-utils";
import { useTravelStore } from "@/store/use-travel-store";
import { api } from "@/lib/api-client";
import { canDropInDayOrder, compareScheduleOrder, isTimedItem, weekFixedLayers, weekFlexibleDropOrder } from "@/lib/schedule-order";
import { allDayDropStartDate, itemDateSpan, occursOnItineraryDate } from "@/lib/schedule-domain";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";

type Mode = "month" | "week" | "day";
function sundayOf(date: string) { const value = new Date(`${date}T00:00:00Z`); return shiftDate(date, -value.getUTCDay()); }
function selectionRing(selected: boolean, primary: boolean) { return selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : ""; }
const agendaSort = compareScheduleOrder;

function CalendarDragPreview({ items, timezone, typeColors }: { items: TravelObject[]; timezone: string; typeColors: Record<string, string> }) {
  return <div className="w-64 space-y-1.5">{items.map((item) => { const start = startDateTimeFor(item, timezone); return <article key={item.id} className="rounded-lg border border-l-4 bg-background px-3 py-2 text-xs shadow-xl" style={{ borderLeftColor: typeColor(item.type, typeColors) }}><p className="truncate font-semibold">{item.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{start ? formatTripDate(start, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }) : "Idea"} · {item.type}</p></article>; })}</div>;
}

function EventChip({ item, timezone, color, selected, primary, onSelect }: { item: TravelObject; timezone: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item }, disabled: item.id.startsWith("draft:") });
  const start = startDateTimeFor(item, timezone);
  const time = item.isAllDay ? "All day" : start ? formatTripDate(start, timezone, { hour: "numeric", minute: "2-digit" }) : "Flexible";
  const style: CSSProperties = { backgroundColor: `${color}20`, borderColor: `${color}70`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} className={`group flex w-full items-start gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 ${selectionRing(selected, primary)} ${isDragging ? "z-20 opacity-40" : ""}`} {...attributes} {...listeners}><GripVertical size={11} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100" /><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span><span className="hidden shrink-0 text-[10px] opacity-75 sm:inline">{time}</span></button>;
}

function DayCell({ date, currentMonth, items, timezone, typeColors, reservedRows, selectedIds, primarySelectedId, onSelect, onCreateItem }: { date: string; currentMonth: string; items: TravelObject[]; timezone: string; typeColors: Record<string, string>; reservedRows: number; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onCreateItem: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` }); const [, , day] = date.split("-").map(Number); const today = dateParts(new Date(), timezone).date;
  return <div ref={setNodeRef} onDoubleClick={() => onCreateItem(date)} title="Double-click to add an item" className={`min-h-[116px] border-b border-r p-1.5 transition-colors sm:min-h-[132px] ${date.slice(0, 7) === currentMonth ? "bg-white dark:bg-neutral-900" : "bg-stone-50/70 dark:bg-neutral-950"} ${isOver ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400 dark:bg-emerald-950" : ""}`}><div className={`mb-1 flex h-6 w-6 items-center justify-center text-xs ${date === today ? "rounded-full bg-emerald-700 font-semibold text-white" : "text-stone-500 dark:text-stone-400"}`}>{day}</div><div className="space-y-1" style={{ paddingTop: `${reservedRows * 22}px` }}>{items.map((item) => <EventChip key={item.id} item={item} timezone={timezone} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}</div></div>;
}

function MultiDayBar({ item, weekStart, startColumn, dayCount, lane, startsHere, endsHere, color, selected, primary, onSelect }: { item: TravelObject; weekStart: string; startColumn: number; dayCount: number; lane: number; startsHere: boolean; endsHere: boolean; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${weekStart}`, data: { item }, disabled: item.id.startsWith("draft:") });
  const style: CSSProperties = { left: `calc(${(startColumn / 7) * 100}% + 2px)`, width: `calc(${(dayCount / 7) * 100}% - 4px)`, top: `${29 + lane * 23}px`, backgroundColor: `${color}30`, borderColor: `${color}80`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} title={item.title} className={`absolute z-10 flex h-5 items-center gap-1 border px-1.5 text-left text-[10px] font-medium shadow-sm hover:brightness-95 ${startsHere ? "rounded-l-md" : "border-l-0"} ${endsHere ? "rounded-r-md" : "border-r-0"} ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`} {...attributes} {...listeners}><span className="truncate">{item.title}</span></button>;
}

function IdeaCard({ item, color, selected, primary, onSelect }: { item: TravelObject; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } }); const place = item.location?.name ?? item.location?.address;
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={(event) => { event.stopPropagation(); onSelect(item, event.shiftKey); }} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`w-full rounded-lg border border-l-4 bg-background px-3 py-2.5 text-left shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}><span className="block truncate text-xs font-semibold">{item.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{place || item.type}</span></button>;
}

function IdeasPanel({ items, typeColors, selectedIds, primarySelectedId, besideTimeline, onSelect, onAdd, onClose }: { items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; besideTimeline: boolean; onSelect: (item: TravelObject, additive?: boolean) => void; onAdd: () => void; onClose: () => void }) {
  const [query, setQuery] = useState(""); const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" }); const filtered = items.filter((item) => `${item.title} ${item.type} ${item.location?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <aside ref={setNodeRef} style={besideTimeline ? { left: "max(280px, 28.5%)" } : undefined} className={`absolute inset-y-0 z-40 flex w-[min(88vw,320px)] flex-col border-r bg-stone-50/95 shadow-xl backdrop-blur dark:bg-neutral-950/95 ${besideTimeline ? "" : "left-0"} ${isOver ? "ring-2 ring-inset ring-emerald-500" : ""}`}><div className="flex items-start justify-between gap-2 border-b px-3 py-3"><div><p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb size={14} /> Ideas <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] dark:bg-neutral-800">{items.length}</span></p><p className="mt-1 text-[10px] leading-snug text-muted-foreground">Created and imported items without a day</p></div><Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close ideas"><X /></Button></div><label className="relative mx-3 mt-3"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ideas" className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:border-emerald-600" /></label><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{filtered.map((item) => <IdeaCard key={item.id} item={item} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}{filtered.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{items.length ? "No matching ideas" : "No ideas yet"}</p>}</div><div className="border-t p-3"><Button type="button" variant="outline" size="sm" className="w-full" onClick={onAdd}><Plus size={14} /> Create idea</Button><p className="mt-2 text-center text-[10px] text-muted-foreground">Drop here to remove an item from the itinerary</p></div></aside>;
}

const weekHourStart = 0;
const weekHourEnd = 24;
const weekRowHeight = 44;

function weekMinutes(value: string | null) { if (!value) return null; const [hours, minutes] = value.split(":").map(Number); return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null; }
function weekTimeLabel(minutes: number) { const bounded = Math.max(0, Math.min(23 * 60 + 45, Math.round(minutes / 15) * 15)); return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`; }
function WeekTimeSlot({ date, hour }: { date: string; hour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-time:${date}:${hour}` });
  return <div ref={setNodeRef} className={`h-[44px] border-t border-stone-200/80 dark:border-neutral-800 ${isOver ? "bg-emerald-50/80 dark:bg-emerald-950/30" : ""}`} />;
}

function WeekResizeHandle({ item, edge, onResize, onPreview, onEnd }: { item: TravelObject; edge: "start" | "end"; onResize: (item: TravelObject, edge: "start" | "end", time: string) => void; onPreview: (edge: "start" | "end", time: string) => void; onEnd: () => void }) {
  const previewRef = useRef<number | null>(null);
  function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault(); event.stopPropagation();
    const base = weekMinutes(edge === "start" ? item.startTime : item.endTime) ?? (edge === "start" ? weekHourStart * 60 : weekHourStart * 60 + 60);
    const other = weekMinutes(edge === "start" ? item.endTime : item.startTime) ?? (edge === "start" ? base + 60 : base - 60);
    const origin = event.clientY;
    const onMove = (move: PointerEvent) => {
      const delta = Math.round(((move.clientY - origin) / weekRowHeight) * 60 / 15) * 15;
      const next = edge === "start" ? Math.min(base + delta, other - 15) : Math.max(base + delta, other + 15);
      previewRef.current = Math.max(0, Math.min(23 * 60 + 45, next)); onPreview(edge, weekTimeLabel(previewRef.current));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); if (previewRef.current !== null) onResize(item, edge, weekTimeLabel(previewRef.current)); previewRef.current = null; onEnd(); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true });
  }
  return <span role="button" aria-label={`Adjust ${edge} time for ${item.title}`} tabIndex={0} onPointerDown={onPointerDown} className={`absolute left-1/2 z-30 h-2 w-12 -translate-x-1/2 cursor-ns-resize rounded-full bg-emerald-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 ${edge === "start" ? "-top-1" : "-bottom-1"}`} />;
}

function WeekFixedItem({ item, color, layer, onSelect, onResize }: { item: TravelObject; color: string; layer: { left: number; zIndex: number }; onSelect: (item: TravelObject) => void; onResize: (item: TravelObject, edge: "start" | "end", time: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `week:${item.id}`, data: { item } });
  const [preview, setPreview] = useState<{ edge: "start" | "end"; time: string } | null>(null);
  const start = weekMinutes(item.startTime); const end = weekMinutes(item.endTime) ?? (start ?? weekHourStart * 60) + 60; const top = Math.max(0, ((start ?? weekHourStart * 60) - weekHourStart * 60) / 60 * weekRowHeight); const height = Math.max(34, (end - (start ?? weekHourStart * 60)) / 60 * weekRowHeight);
  const previewStart = preview?.edge === "start" ? weekMinutes(preview.time)! : start!; const previewEnd = preview?.edge === "end" ? weekMinutes(preview.time)! : end; const ghostTop = ((previewStart - (start ?? weekHourStart * 60)) / 60) * weekRowHeight; const ghostHeight = Math.max(15, ((previewEnd - previewStart) / 60) * weekRowHeight);
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={() => onSelect(item)} style={{ top, height, left: layer.left, right: 4, zIndex: isDragging ? 40 : layer.zIndex, borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) }} className={`group absolute overflow-visible rounded-md border border-l-4 bg-background/95 px-2 py-1.5 text-left text-[10px] shadow-sm ${isDragging ? "opacity-40" : ""}`}>{preview && <span aria-hidden className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-emerald-400 bg-emerald-400/15" style={{ top: ghostTop, height: ghostHeight }}><span className="absolute -top-4 right-0 rounded bg-emerald-700 px-1 text-[8px] font-medium text-white">{previewStart === previewEnd ? preview.time : `${weekTimeLabel(previewStart)}–${weekTimeLabel(previewEnd)}`}</span></span>}<WeekResizeHandle item={item} edge="start" onResize={onResize} onPreview={(edge, time) => setPreview({ edge, time })} onEnd={() => setPreview(null)} /><span className="block truncate font-semibold">{item.title}</span><span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{item.startTime}–{item.endTime} · {item.type}</span><WeekResizeHandle item={item} edge="end" onResize={onResize} onPreview={(edge, time) => setPreview({ edge, time })} onEnd={() => setPreview(null)} /></button>;
}

function WeekFlexibleGap({ date, order }: { date: string; order: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-flex:${date}:${order}` });
  return <div ref={setNodeRef} className={`h-1 rounded transition ${isOver ? "bg-emerald-500" : ""}`} />;
}

function WeekClusterItem({ item, color, selected, primary, onSelect }: { item: TravelObject; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `week:${item.id}`, data: { item } });
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={(event) => onSelect(item, event.shiftKey)} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`flex min-w-0 items-center gap-1 rounded border border-dashed px-1.5 py-1 text-left text-[9px] ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}><span className="grid size-3 shrink-0 place-items-center rounded-full text-[7px] font-bold text-white" style={{ backgroundColor: color }}>{item.dayOrder != null ? item.dayOrder + 1 : "·"}</span><span className="min-w-0 flex-1 truncate">{item.title}</span></button>;
}

function WeekAllDayItem({ item, date, color, selected, primary, onSelect }: { item: TravelObject; date: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `week-all-day:${date}:${item.id}`, data: { item, draggedDate: date } });
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={(event) => onSelect(item, event.shiftKey)} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`flex h-6 w-full min-w-0 items-center rounded border border-l-4 bg-background px-1.5 text-left text-[9px] shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`} title={item.title}><span className="truncate font-medium">{item.title}</span></button>;
}

function WeekAllDayLane({ date, items, height, typeColors, selectedIds, primarySelectedId, onSelect }: { date: string; items: TravelObject[]; height: number; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return <div ref={setNodeRef} style={{ height }} className={`space-y-1 overflow-y-auto border-b px-1 py-1 ${isOver ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-stone-50/70 dark:bg-neutral-950/40"}`}>{items.map((item) => <WeekAllDayItem key={item.id} item={item} date={date} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}</div>;
}

function WeekFlexibleChunk({ date, anchor, top, items, expanded, dropOrder, typeColors, selectedIds, primarySelectedId, onToggle, onExpand, onCollapse, onSelect }: { date: string; anchor: string; top: number; items: TravelObject[]; expanded: boolean; dropOrder: Map<string, number>; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onToggle: () => void; onExpand: () => void; onCollapse: () => void; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-cluster:${date}:${anchor.replace(":", "")}:${dropOrder.get(items[0]?.id) ?? 0}` });
  return <div ref={setNodeRef} onMouseEnter={onExpand} onMouseLeave={onCollapse} onFocusCapture={onExpand} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCollapse(); }} className={`absolute inset-x-1 z-30 ${isOver ? "rounded-md ring-2 ring-emerald-400" : ""}`} style={{ top }}><button type="button" onClick={onToggle} className="flex h-12 w-full flex-col items-start justify-center rounded-md border border-dashed border-emerald-500 bg-emerald-950/90 px-2 text-left text-[9px] text-emerald-50 shadow-sm"><span className="font-semibold">{items.length} Flexible idea{items.length === 1 ? "" : "s"}</span><span className="text-[8px] text-emerald-200">{anchor} · {expanded ? "Click to collapse" : "ordered · hover to expand"}</span></button>{expanded && <div className="absolute left-full top-0 z-[100] w-48 rounded-lg border border-stone-600 bg-neutral-900 p-2 shadow-2xl"><p className="mb-1 text-[10px] font-semibold text-stone-100">Flexible ideas · ordered</p><div className="space-y-1">{items.map((item) => <div key={item.id}><WeekFlexibleGap date={date} order={dropOrder.get(item.id) ?? 0} /><WeekClusterItem item={item} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} /></div>)}</div></div>}</div>;
}

function WeekDayColumn({ date, items, allDayHeight, trip, typeColors, selectedIds, primarySelectedId, expandedChunk, draggedItemId, onExpandedChange, onSelect, onResize, onSelectDay, onCreateItem }: { date: string; items: TravelObject[]; allDayHeight: number; trip: Trip; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; expandedChunk: string | null; draggedItemId: string | null; onExpandedChange: (key: string | null) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onResize: (item: TravelObject, edge: "start" | "end", time: string) => void; onSelectDay: () => void; onCreateItem: (date: string, order: number) => void }) {
  const allDayItems = items.filter((item) => item.isAllDay).sort(agendaSort);
  const orderedItems = items.filter((item) => !item.isAllDay).sort(agendaSort);
  const fixedItems = orderedItems.filter((item) => !item.isAllDay && item.startTime && item.endTime);
  const flexibleItems = orderedItems.filter((item) => !item.startTime || !item.endTime);
  const globalOrder = new Map(orderedItems.map((item, index) => [item.id, index]));
  const dropOrder = new Map(items.filter((item) => item.date?.slice(0, 10) === date).sort(agendaSort).map((item, index) => [item.id, index]));
  const chunkGroups = [...flexibleItems.reduce((groups, item) => {
    const position = globalOrder.get(item.id) ?? 0;
    const previousFixed = [...orderedItems.slice(0, position)].reverse().find(isTimedItem);
    const nextFixed = orderedItems.slice(position + 1).find(isTimedItem);
    const anchorMinutes = previousFixed
      ? weekMinutes(previousFixed.endTime) ?? 0
      : Math.max(0, (weekMinutes(nextFixed?.startTime ?? null) ?? 15) - 15);
    const anchor = weekTimeLabel(anchorMinutes);
    const chunkKey = `${previousFixed?.id ?? "before"}-${nextFixed?.id ?? "after"}`;
    const group = groups.get(chunkKey) ?? { anchor, items: [] as TravelObject[] };
    group.items.push(item);
    groups.set(chunkKey, group);
    return groups;
  }, new Map<string, { anchor: string; items: TravelObject[] }>())];
  const chunkHeight = 48;
  const fixedLayers = weekFixedLayers(fixedItems);
  const fixedRects = fixedItems.map((item) => {
    const start = weekMinutes(item.startTime) ?? 0;
    const end = weekMinutes(item.endTime) ?? start + 60;
    return { top: (start / 60) * weekRowHeight, bottom: (end / 60) * weekRowHeight };
  });
  const placedRects: Array<{ top: number; bottom: number }> = [];
  const overlaps = (top: number, bottom: number) => [...fixedRects, ...placedRects].some((rect) => top < rect.bottom && bottom > rect.top);
  const findFreeTop = (preferred: number) => {
    const maxTop = 24 * weekRowHeight - chunkHeight;
    const bounded = Math.max(0, Math.min(maxTop, preferred));
    for (let offset = 0; offset <= maxTop; offset += 11) {
      const upward = bounded - offset;
      if (upward >= 0 && !overlaps(upward, upward + chunkHeight)) return upward;
      const downward = bounded + offset;
      if (downward <= maxTop && !overlaps(downward, downward + chunkHeight)) return downward;
    }
    return bounded;
  };
  const chunks = chunkGroups.map(([chunkKey, chunk]) => {
    const preferred = ((weekMinutes(chunk.anchor) ?? 0) / 60) * weekRowHeight;
    const top = findFreeTop(preferred);
    placedRects.push({ top, bottom: top + chunkHeight });
    return { chunkKey, ...chunk, top };
  });
  return <section className={`relative ${expandedChunk?.startsWith(`${date}:`) || chunks.some((chunk) => chunk.items.some((item) => item.id === draggedItemId)) ? "z-40" : "z-0"} min-w-0 border-l bg-white dark:bg-neutral-900`}><button type="button" onClick={onSelectDay} className="relative z-10 flex h-14 w-full flex-col justify-center border-b px-2 text-left hover:bg-stone-50 dark:hover:bg-neutral-800"><span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short" })}</span><span className="truncate text-xs font-semibold">{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })}</span><span className="text-[9px] text-muted-foreground">{items.length} {items.length === 1 ? "place" : "places"}</span></button>{allDayHeight > 0 && <WeekAllDayLane date={date} items={allDayItems} height={allDayHeight} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={onSelect} />}<div className="relative min-h-[1056px]">{Array.from({ length: weekHourEnd - weekHourStart }, (_, index) => <WeekTimeSlot key={index} date={date} hour={weekHourStart + index} />)}{fixedItems.map((item) => <WeekFixedItem key={item.id} item={item} color={typeColor(item.type, typeColors)} layer={fixedLayers.get(item.id)!} onSelect={onSelect} onResize={onResize} />)}{chunks.map((chunk) => <WeekFlexibleChunk key={chunk.chunkKey} date={date} anchor={chunk.anchor} top={chunk.top} items={chunk.items} expanded={expandedChunk === `${date}:${chunk.chunkKey}` || chunk.items.some((item) => item.id === draggedItemId)} dropOrder={dropOrder} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onToggle={() => onExpandedChange(expandedChunk === `${date}:${chunk.chunkKey}` ? null : `${date}:${chunk.chunkKey}`)} onExpand={() => onExpandedChange(`${date}:${chunk.chunkKey}`)} onCollapse={() => { if (expandedChunk === `${date}:${chunk.chunkKey}`) onExpandedChange(null); }} onSelect={onSelect} />)}{items.length === 0 && <button type="button" onDoubleClick={() => onCreateItem(date, 0)} className="absolute inset-x-2 top-4 rounded border border-dashed py-3 text-[10px] text-muted-foreground">Double-click to add</button>}</div></section>;
}

function WeekPlanner({ dates, items, trip, typeColors, selectedIds, primarySelectedId, expandedDate, draggedItemId, onExpandedChange, onSelect, onResize, onSelectDay, onCreateItem }: { dates: string[]; items: TravelObject[]; trip: Trip; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; expandedDate: string | null; draggedItemId: string | null; onExpandedChange: (key: string | null) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onResize: (item: TravelObject, edge: "start" | "end", time: string) => void; onSelectDay: (date: string) => void; onCreateItem: (date: string, order: number) => void }) {
  const datedItems = dates.map((date) => items.filter((item) => item.isAllDay ? occursOnItineraryDate(item, date) : item.date?.slice(0, 10) === date));
  const allDayRows = Math.max(0, ...datedItems.map((dayItems) => dayItems.filter((item) => item.isAllDay).length));
  const allDayHeight = allDayRows ? allDayRows * 28 + 8 : 0;
  return <div className="min-h-0 flex-1 overflow-auto bg-stone-50/60 dark:bg-neutral-950"><div className="grid min-w-[980px] grid-cols-[44px_repeat(7,minmax(120px,1fr))]"><div className="relative bg-white pt-14 text-right text-[10px] text-muted-foreground dark:bg-neutral-900">{allDayHeight > 0 && <div style={{ height: allDayHeight }} className="border-b px-1 pt-1 text-[9px]">All day</div>}{Array.from({ length: weekHourEnd - weekHourStart }, (_, index) => <div key={index} className="h-[44px] border-t px-1 pt-1">{String(weekHourStart + index).padStart(2, "0")}:00</div>)}<div className="absolute bottom-0 right-1 text-[10px]">24:00</div></div>{dates.map((date, index) => <WeekDayColumn key={date} date={date} items={datedItems[index]} allDayHeight={allDayHeight} trip={trip} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} expandedChunk={expandedDate} draggedItemId={draggedItemId} onExpandedChange={onExpandedChange} onSelect={onSelect} onResize={onResize} onSelectDay={() => onSelectDay(date)} onCreateItem={onCreateItem} />)}</div></div>;
}

export function CalendarView({ trip, items, typeColors = {}, selectedIds, primarySelectedId, onSelect, onInspect, onSelectForDrag, onMove, onResize = () => undefined, onUnschedule, onFlexibleDrop = async (item, date, order, clearTime, placementTime) => { await api.reorderObjects({ tripId: trip.id, objectId: item.id, date, dayOrder: order, clearTime, placementTime }); window.location.reload(); }, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors?: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean, inspect?: boolean) => void; onInspect: (item: TravelObject) => void; onSelectForDrag: (item: TravelObject) => void; onMove: (item: TravelObject, date: string, time?: string) => Promise<void>; onResize?: (item: TravelObject, edge: "start" | "end", time: string) => void; onUnschedule: (item: TravelObject) => Promise<void>; onFlexibleDrop?: (item: TravelObject, date: string, order: number, clearTime: boolean, placementTime?: string) => Promise<void>; onCreateItem: (date?: string, time?: string, type?: string, title?: string, dayOrder?: number) => void }) {
  const start = trip.startDate.slice(0, 10); const tripEnd = trip.endDate.slice(0, 10); const mode = useTravelStore((state) => state.calendarMode); const setMode = useTravelStore((state) => state.setCalendarMode); const selectedAtMount = primarySelectedId ? items.find((item) => item.id === primarySelectedId) : null; const selectedDateAtMount = selectedAtMount ? itemDateSpan(selectedAtMount).first : null; const initialDate = selectedDateAtMount && selectedDateAtMount >= start && selectedDateAtMount <= tripEnd ? selectedDateAtMount : start; const [focusDate, setFocusDate] = useState(initialDate); const [expandedWeekDate, setExpandedWeekDate] = useState<string | null>(null); const [dayScrollRequest, setDayScrollRequest] = useState({ date: initialDate, nonce: 0 }); const [activeItem, setActiveItem] = useState<TravelObject | null>(null); const [ideasOpen, setIdeasOpen] = useState(false); const suppressClickRef = useRef(false); const previousModeRef = useRef<Mode>(mode); const today = dateParts(new Date(), trip.timezone).date; const month = useMemo(() => { const date = new Date(`${focusDate}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }, [focusDate]); const grid = useMemo(() => monthGrid(month), [month]); const currentMonth = month.toISOString().slice(0, 7); const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } })); const ideas = items.filter((item) => item.date === null); const scheduledItems = items.filter((item) => item.date !== null);
  const spans = scheduledItems.map((item) => { const { first, last } = itemDateSpan(item); return { item, start: first!, end: last ?? first! }; }).filter(({ item, start: spanStart, end }) => Boolean(spanStart && end && (end > spanStart || item.isAllDay))); const byDay = new Map<string, TravelObject[]>(); for (const item of scheduledItems) { const { first } = itemDateSpan(item); if (first && !spans.some((span) => span.item.id === item.id)) byDay.set(first, [...(byDay.get(first) ?? []), item]); }
  const weeks = Array.from({ length: 6 }, (_, index) => grid.slice(index * 7, index * 7 + 7)); const weekSegments = weeks.map((days) => { const segments = spans.filter(({ start: spanStart, end }) => spanStart <= days[6] && end >= days[0]).map(({ item, start: spanStart, end }) => { const segmentStart = spanStart < days[0] ? days[0] : spanStart; const segmentEnd = end > days[6] ? days[6] : end; const startColumn = days.indexOf(segmentStart); const endColumn = days.indexOf(segmentEnd); return { item, start: segmentStart, end: segmentEnd, startColumn, dayCount: endColumn - startColumn + 1, startsHere: spanStart >= days[0], endsHere: end <= days[6] }; }).sort((a, b) => Number(b.item.isAllDay) - Number(a.item.isAllDay) || a.startColumn - b.startColumn || b.dayCount - a.dayCount); const laneEnds: string[] = []; const placed = segments.map((segment) => { let lane = laneEnds.findIndex((end) => end < segment.start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = segment.end; return { ...segment, lane }; }); return { days, segments: placed, laneCount: laneEnds.length }; }); const weekStart = sundayOf(focusDate); const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const requestDay = useCallback((date: string) => { const bounded = date < start ? start : date > tripEnd ? tripEnd : date; setFocusDate(bounded); setDayScrollRequest((request) => ({ date: bounded, nonce: request.nonce + 1 })); }, [start, tripEnd]);
  useEffect(() => { const changedMode = previousModeRef.current !== mode; previousModeRef.current = mode; if (!changedMode || mode === "month" || !primarySelectedId) return; const selected = items.find((item) => item.id === primarySelectedId); const selectedDate = selected ? itemDateSpan(selected).first : null; if (!selectedDate) return; const frame = requestAnimationFrame(() => { if (mode === "day") requestDay(selectedDate); else setFocusDate(selectedDate); }); return () => cancelAnimationFrame(frame); }, [items, mode, primarySelectedId, requestDay]);
  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return; const target = event.target; if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return; if (event.code === "Space" && mode !== "month") { event.preventDefault(); setIdeasOpen((open) => !open); return; } const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0; if (!direction || mode === "month") return; event.preventDefault(); if (mode === "day") requestDay(shiftDate(focusDate, direction)); else setFocusDate((date) => shiftDate(date, direction)); } window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [focusDate, mode, requestDay]);
  function finishDrag() { setActiveItem(null); requestAnimationFrame(() => { suppressClickRef.current = false; }); }
  function handleDragStart(event: DragStartEvent) { suppressClickRef.current = true; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? items.find((candidate) => candidate.id === String(event.active.id).split(":").at(-1)); setActiveItem(item ?? null); if (item && !selectedIds.has(item.id)) onSelectForDrag(item); }
  async function handleDragEnd(event: DragEndEvent) {
    finishDrag();
    const target = String(event.over?.id ?? "");
    const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item;
    if (!item) return;
    if (target === "unscheduled") { if (!item.isAllDay && item.date !== null) await onUnschedule(item); return; }
    if (item.isAllDay) {
      const date = target.startsWith("day:") ? target.slice(4) : target.startsWith("day-") || target.startsWith("week-") ? target.split(":")[1] : null;
      if (date && item.date) { const draggedDate = (event.active.data.current as { draggedDate?: string } | undefined)?.draggedDate ?? item.date; const nextStart = allDayDropStartDate(item.date, draggedDate, date); if (item.date !== nextStart) await onMove(item, nextStart); setFocusDate(date); }
      return;
    }
    if (mode === "week") {
      const flexible = !item.startTime || !item.endTime;
      if (target.startsWith("week-time:")) {
        const [, date, rawHour] = target.split(":");
        if (date) { const targetTime = `${String(Number(rawHour)).padStart(2, "0")}:00`; if (flexible) await onFlexibleDrop(item, date, weekFlexibleDropOrder(scheduledItems, date, targetTime), true, targetTime); else await onMove(item, date, targetTime); setFocusDate(date); }
        return;
      }
      if (target.startsWith("week-cluster:")) {
        const [, date, rawAnchor, rawOrder] = target.split(":");
        if (date) { const targetTime = `${rawAnchor.slice(0, 2)}:${rawAnchor.slice(2, 4)}`; if (flexible) await onFlexibleDrop(item, date, Number(rawOrder) || 0, true, targetTime); else await onMove(item, date, targetTime); setFocusDate(date); }
        return;
      }
      if (target.startsWith("week-flex:")) {
        const [, date, rawOrder] = target.split(":");
        if (date) { const targetTime = item.placementTime ?? "09:00"; if (flexible) await onFlexibleDrop(item, date, Number(rawOrder) || 0, true, targetTime); else await onMove(item, date, targetTime); setFocusDate(date); }
        return;
      }
    }
    if (target.startsWith("day-item:") || target.startsWith("day-list:") || target.startsWith("day-section:")) {
      const [, date, rawOrder] = target.split(":");
      if (date) {
        const order = Number(rawOrder) || 0;
        if (!canDropInDayOrder(scheduledItems, item, date, order)) return;
        await onFlexibleDrop(item, date, order, false);
        setFocusDate(date);
      }
      return;
    }
    if (target.startsWith("day:")) await onMove(item, target.slice(4));
  }
  function selectFromClick(item: TravelObject, additive = false) { if (!suppressClickRef.current) onSelect(item, additive); }
  function selectDayItem(item: TravelObject, additive = false) { if (!suppressClickRef.current) onSelect(item, additive, false); }
  function navigate(direction: number) { if (mode === "month") { const date = new Date(`${focusDate}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); setFocusDate(date.toISOString().slice(0, 10)); } else if (mode === "week") setFocusDate(shiftDate(focusDate, direction * 7)); else requestDay(shiftDate(focusDate, direction)); }
  function goToToday() { setMode("day"); requestDay(today >= start && today <= tripEnd ? today : start); }
  const activeDragItems = activeItem ? [activeItem, ...items.filter((item) => item.id !== activeItem.id && selectedIds.has(item.id))] : [];
  const title = mode === "month" ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month) : mode === "week" ? `${formatTripDate(`${weekDates[0]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${weekDates[6]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}` : `${formatTripDate(`${start}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${tripEnd}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}`;
  return <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{mode === "week" ? "Choose a day, then arrange its visit order" : mode === "day" ? "Continuous itinerary · map follows the active day" : `Times shown in ${trip.timezone}`}</p></div><div className="flex max-w-full flex-wrap items-center gap-2">{mode !== "month" && <><Button variant={ideasOpen ? "secondary" : "outline"} size="sm" title="Open Ideas (Space)" onClick={() => setIdeasOpen((open) => !open)}><Lightbulb size={14} /> Ideas <span className="rounded-full bg-background/70 px-1.5 text-[10px]">{ideas.length}</span><kbd className="rounded border px-1 text-[9px] font-normal opacity-70">Space</kbd></Button><Button variant="outline" size="sm" onClick={() => onCreateItem()}><Plus size={14} /> Add idea</Button></>}<div className="flex rounded-lg border p-0.5">{(["month", "week", "day"] as Mode[]).map((view) => <Button key={view} variant={mode === view ? "secondary" : "ghost"} size="sm" className="capitalize" onClick={() => { setMode(view); if (view === "day") requestDay(focusDate); }}>{view}<kbd className="ml-1 rounded border px-1 text-[9px] font-normal opacity-60">{view === "month" ? "Q" : view === "week" ? "W" : "E"}</kbd></Button>)}</div><Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous period"><ChevronLeft /></Button><Button variant="outline" size="sm" onClick={goToToday}>Today</Button><Button variant="outline" size="sm" onClick={() => mode === "day" ? requestDay(start) : setFocusDate(start)}>Trip start</Button><Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Next period"><ChevronRight /></Button></div></div>
    {mode === "month" ? <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="min-h-0 flex-1 overflow-auto"><div className="min-w-[700px]"><div className="sticky top-0 z-20 grid grid-cols-7 border-b bg-stone-50 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:bg-neutral-800 dark:text-stone-300 sm:text-xs">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>{weekSegments.map(({ days, segments, laneCount }) => <div key={days[0]} className="relative grid grid-cols-7">{days.map((date) => <DayCell key={date} date={date} currentMonth={currentMonth} items={(byDay.get(date) ?? []).sort(agendaSort)} timezone={trip.timezone} typeColors={typeColors} reservedRows={laneCount} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onCreateItem={onCreateItem} />)}{segments.map((segment) => <MultiDayBar key={`${segment.item.id}:${days[0]}`} item={segment.item} weekStart={days[0]} startColumn={segment.startColumn} dayCount={segment.dayCount} lane={segment.lane} startsHere={segment.startsHere} endsHere={segment.endsHere} color={typeColor(segment.item.type, typeColors)} selected={selectedIds.has(segment.item.id)} primary={primarySelectedId === segment.item.id} onSelect={selectFromClick} />)}</div>)}</div></div><DragOverlay dropAnimation={null}>{activeDragItems.length ? <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} /> : null}</DragOverlay></DndContext> : <DndContext sensors={sensors} collisionDetection={(args) => { const collisions = pointerWithin(args); const exactGap = collisions.find(({ id }) => String(id).startsWith("day-list:") || String(id).startsWith("day-item:") || String(id).startsWith("week-flex:") || String(id).startsWith("week-cluster:")); return exactGap ? [exactGap] : collisions.length ? collisions : closestCorners(args); }} onDragStart={handleDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="relative flex min-h-0 flex-1 flex-col">{ideasOpen && <IdeasPanel items={ideas} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} besideTimeline={mode === "day"} onSelect={selectFromClick} onAdd={() => onCreateItem()} onClose={() => setIdeasOpen(false)} />}{mode === "week" ? <WeekPlanner dates={weekDates} items={scheduledItems} trip={trip} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} expandedDate={expandedWeekDate} draggedItemId={activeItem?.id ?? null} onExpandedChange={setExpandedWeekDate} onSelectDay={(date) => { setFocusDate(date); setExpandedWeekDate(date); }} onSelect={selectFromClick} onResize={onResize} onCreateItem={(date, order) => onCreateItem(date, undefined, undefined, "(untitled event)", order)} /> : <DayJourneyView trip={trip} items={scheduledItems} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} scrollRequest={dayScrollRequest} onActiveDate={setFocusDate} onSelect={selectDayItem} onInspect={onInspect} onCreateItem={(date, order) => onCreateItem(date, undefined, undefined, "(untitled event)", order)} />}</div><DragOverlay dropAnimation={null}>{activeDragItems.length ? <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} /> : null}</DragOverlay></DndContext>}
    <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><Clock size={13} />{mode === "month" ? <><span className="sm:hidden">Swipe sideways for more days.</span><span className="hidden sm:inline">Drag items to another date. Double-click a date to add an item.</span></> : mode === "week" ? "Drag an idea onto a day, then drop it into the exact visit-order gap." : "Scroll the whole trip; the map follows the active day. Drag cards into exact order gaps."}{mode !== "month" && <span className="ml-auto">Press <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-800">Space</kbd> to toggle Ideas</span>}</div></div>;
}
