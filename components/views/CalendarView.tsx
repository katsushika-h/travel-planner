"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Clock, GripVertical, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateParts, formatTripDate, monthGrid } from "@/lib/date-utils";
import { useTravelStore } from "@/store/use-travel-store";
import { api } from "@/lib/api-client";
import type { TravelObject, Trip } from "@/types/travel";

type Mode = "month" | "week" | "day";
const defaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const palette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function typeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultColors[type] ?? palette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function sundayOf(date: string) { const value = new Date(`${date}T00:00:00Z`); return shiftDate(date, -value.getUTCDay()); }

function selectionRing(selected: boolean, primary: boolean) { return selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : ""; }

function CalendarDragPreview({ items, timezone, typeColors }: { items: TravelObject[]; timezone: string; typeColors: Record<string, string> }) {
  return <div className="w-56 space-y-1.5">{items.map((item) => <article key={item.id} className="rounded-md border border-l-4 bg-background px-3 py-2 text-xs shadow-xl" style={{ borderLeftColor: typeColor(item.type, typeColors) }}><p className="truncate font-semibold">{item.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.startDateTime ? formatTripDate(item.startDateTime, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }) : "Unscheduled"} · {item.type}</p></article>)}</div>;
}

function DayCell({ date, currentMonth, items, timezone, typeColors, reservedRows, selectedIds, primarySelectedId, onSelect, onCreateItem }: { date: string; currentMonth: string; items: TravelObject[]; timezone: string; typeColors: Record<string, string>; reservedRows: number; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onCreateItem: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const [, , day] = date.split("-").map(Number);
  const today = dateParts(new Date(), timezone).date;
  return <div ref={setNodeRef} onDoubleClick={() => onCreateItem(date)} title="Double-click to add an item" className={`min-h-[116px] border-b border-r p-1.5 transition-colors sm:min-h-[132px] ${date.slice(0, 7) === currentMonth ? "bg-white dark:bg-neutral-900" : "bg-stone-50/70 dark:bg-neutral-950"} ${isOver ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400 dark:bg-emerald-950" : ""}`}>
    <div className={`mb-1 flex h-6 w-6 items-center justify-center text-xs ${date === today ? "rounded-full bg-emerald-700 font-semibold text-white" : "text-stone-500 dark:text-stone-400"}`}>{day}</div>
    <div className="space-y-1" style={{ paddingTop: `${reservedRows * 22}px` }}>{items.map((item) => <EventChip key={item.id} item={item} timezone={timezone} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}</div>
  </div>;
}

function EventChip({ item, timezone, color, selected, primary, onSelect }: { item: TravelObject; timezone: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item }, disabled: item.id.startsWith("draft:") });
  const time = item.isAllDay ? "All day" : formatTripDate(item.startDateTime ?? "", timezone, { hour: "numeric", minute: "2-digit" });
  const style: CSSProperties = { backgroundColor: `${color}20`, borderColor: `${color}70`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} className={`group flex w-full items-start gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 ${selectionRing(selected, primary)} ${isDragging ? "z-20 opacity-40" : ""}`} {...attributes} {...listeners}>
    <GripVertical size={11} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100" /><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span><span className="hidden shrink-0 text-[10px] opacity-75 sm:inline">{time}</span>
  </button>;
}

function MultiDayBar({ item, weekStart, startColumn, dayCount, lane, startsHere, endsHere, color, selected, primary, onSelect }: { item: TravelObject; weekStart: string; startColumn: number; dayCount: number; lane: number; startsHere: boolean; endsHere: boolean; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${weekStart}`, data: { item }, disabled: item.id.startsWith("draft:") });
  const style: CSSProperties = { left: `calc(${(startColumn / 7) * 100}% + 2px)`, width: `calc(${(dayCount / 7) * 100}% - 4px)`, top: `${29 + lane * 23}px`, backgroundColor: `${color}30`, borderColor: `${color}80`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} title={item.title} className={`absolute z-10 flex h-5 items-center gap-1 border px-1.5 text-left text-[10px] font-medium shadow-sm hover:brightness-95 ${startsHere ? "rounded-l-md" : "border-l-0"} ${endsHere ? "rounded-r-md" : "border-r-0"} ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`} {...attributes} {...listeners}><span className="truncate">{item.title}</span></button>;
}

function ScheduleEvent({ item, date, timezone, color, hourHeight, narrowerOverlap, selected, primary, onSelect, onResize, onResizeStart }: { item: TravelObject; date: string; timezone: string; color: string; hourHeight: number; narrowerOverlap: boolean; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void; onResize: (item: TravelObject, endDate: string, endTime: string) => void; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item }, disabled: item.id.startsWith("draft:") });
  const actualStart = dateParts(item.startDateTime ?? "", timezone); const actualEnd = dateParts(item.endDateTime ?? "", timezone);
  const start = { ...actualStart, ...(actualStart.date < date ? { date, time: "00:00" } : {}) };
  const end = { ...actualEnd, ...(actualEnd.date > date ? { date: shiftDate(date, 1), time: "00:00" } : {}) };
  const [h, m] = start.time.split(":").map(Number);
  const startAbsolute = Date.parse(`${start.date}T${start.time}:00Z`); const endAbsolute = Date.parse(`${end.date}T${end.time}:00Z`);
  const [resize, setResize] = useState<{ y: number; delta: number; edge: "start" | "end" } | null>(null);
  const deltaMinutes = resize?.delta ?? 0;
  const topMinutes = h * 60 + m + (resize?.edge === "start" ? deltaMinutes : 0);
  const duration = Math.max(15, (endAbsolute - startAbsolute) / 60_000 + (resize?.edge === "end" ? deltaMinutes : resize?.edge === "start" ? -deltaMinutes : 0));
  const style: CSSProperties = { top: topMinutes / 60 * hourHeight, height: Math.max(25, duration / 60 * hourHeight), left: narrowerOverlap ? "calc(12% + 4px)" : 4, width: narrowerOverlap ? "calc(88% - 8px)" : "calc(100% - 8px)", borderLeft: `3px solid ${color}`, backgroundColor: `${color}24`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  function updateResize(event: React.PointerEvent<HTMLDivElement>) { if (resize) setResize({ ...resize, delta: Math.round(((event.clientY - resize.y) / hourHeight * 60) / 15) * 15 }); }
  function finishResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!resize) return; event.stopPropagation();
    const change = Math.round(((event.clientY - resize.y) / hourHeight * 60) / 15) * 15;
    if (resize.edge === "start") { const adjusted = new Date(Math.min(endAbsolute - 15 * 60_000, startAbsolute + change * 60_000)); onResizeStart(item, adjusted.toISOString().slice(0, 10), adjusted.toISOString().slice(11, 16)); }
    else { const adjusted = new Date(Math.max(startAbsolute + 15 * 60_000, endAbsolute + change * 60_000)); onResize(item, adjusted.toISOString().slice(0, 10), adjusted.toISOString().slice(11, 16)); }
    setResize(null);
  }
  function resizeHandle(edge: "start" | "end") { return <div role="separator" aria-label={edge === "start" ? "Resize event start time" : "Resize event end time"} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setResize({ y: event.clientY, delta: 0, edge }); }} onPointerMove={updateResize} onPointerUp={finishResize} className={`absolute inset-x-0 z-10 h-2 cursor-ns-resize touch-none opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${edge === "start" ? "top-0" : "bottom-0"}`}><span className={`absolute left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-current/70 ${edge === "start" ? "top-0" : "bottom-0"}`} /></div>; }
  return <div ref={setNodeRef} {...attributes} {...listeners} role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelect(item, event.shiftKey); }} onDoubleClick={(event) => event.stopPropagation()} className={`group absolute z-[1] mx-1 w-[calc(100%-8px)] overflow-hidden rounded-md px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`} style={style} title={`${item.title} · ${start.time}–${end.time}`}>{resizeHandle("start")}<span className="block truncate font-semibold">{item.title}</span><span className="block truncate opacity-80">{start.time}–{end.time}</span>{resizeHandle("end")}</div>;
}

function ScheduleStripItem({ item, date, color, selected, primary, onSelect }: { item: TravelObject; date: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${date}`, data: { item }, disabled: item.id.startsWith("draft:") });
  const style: CSSProperties = { backgroundColor: color, color: "white", ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} {...attributes} {...listeners} onClick={(event) => onSelect(item, event.shiftKey)} title={item.title} style={style} className={`h-full w-full truncate rounded-full px-3 text-left text-sm font-medium shadow-sm hover:brightness-95 ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}>{item.title}</button>;
}

function UnscheduledDrawer({ items, typeColors, selectedIds, primarySelectedId, onSelect, onAdd }: { items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" });
  const visible = open || isOver;
  function openDrawer() { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); }
  function closeDrawer() { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 2000); }
  return <section ref={setNodeRef} onMouseEnter={openDrawer} onMouseLeave={closeDrawer} className={`absolute inset-x-0 bottom-0 z-50 ${isOver ? "ring-2 ring-inset ring-emerald-500" : ""}`}>
    <div className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${visible ? "grid-rows-[auto_1fr]" : "grid-rows-[auto_0fr]"}`}>
      <button type="button" aria-expanded={visible} onFocus={openDrawer} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) closeDrawer(); }} className={`flex items-center gap-2 border border-b-0 bg-stone-100 px-4 py-2.5 text-left text-xs font-semibold shadow-xl transition-[width,border-radius] duration-200 dark:bg-neutral-800 ${visible ? "w-full rounded-t-xl" : "mx-auto w-fit rounded-t-xl"}`}><ChevronDown size={14} className={`transition-transform ${visible ? "rotate-180" : ""}`} />Unscheduled <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] dark:bg-neutral-700">{items.length}</span>{visible && <span className="ml-auto text-[10px] font-normal text-muted-foreground">Drop here to remove the schedule</span>}</button>
      <div className="min-h-0 overflow-hidden"><div className="flex w-full items-center gap-2 overflow-x-auto border-x border-t bg-stone-100 px-3 pb-3 pt-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">{items.map((item) => <UnscheduledCard key={item.id} item={item} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}<Button variant="outline" size="sm" className="h-9 shrink-0" onClick={onAdd}>+ Add idea</Button>{items.length === 0 && <span className="text-xs text-muted-foreground">No unscheduled ideas yet.</span>}</div></div>
    </div>
  </section>;
}

function UnscheduledCard({ item, color, selected, primary, onSelect }: { item: TravelObject; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } });
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(item, event.shiftKey); }} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) }} className={`h-10 w-44 shrink-0 truncate rounded-md border border-l-4 bg-white px-2 text-left text-xs font-medium shadow-sm dark:bg-neutral-900 ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}>{item.title}<span className="ml-1 font-normal text-muted-foreground">· {item.type}</span></button>;
}

function FlexiblePlanItem({ item, index, date, color, selected, primary, onSelect }: { item: TravelObject; index: number; date: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { setNodeRef: setDropRef } = useDroppable({ id: `flexible:${date}:${index}` });
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } });
  return <div ref={setDropRef}><button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={(event) => onSelect(item, event.shiftKey)} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`flex w-full items-center gap-2 rounded-md border border-l-4 bg-white px-2 py-1.5 text-left text-xs shadow-sm dark:bg-neutral-900 ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}><span className="grid size-5 shrink-0 place-items-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-500 dark:bg-neutral-800">{index + 1}</span><GripVertical size={12} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span></button></div>;
}

function FlexiblePlanBand({ date, items, typeColors, selectedIds, primarySelectedId, onSelect }: { date: string; items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `flexible:${date}` });
  return <div ref={setNodeRef} className={`border-b border-emerald-100 bg-emerald-50/70 p-2 dark:border-emerald-900 dark:bg-emerald-950/25 ${isOver ? "ring-2 ring-inset ring-emerald-400" : ""}`}><p className="mb-1 text-[9px] font-bold uppercase tracking-[.16em] text-emerald-800 dark:text-emerald-300">Flexible plan</p><div className="max-h-28 space-y-1 overflow-y-auto">{items.map((item, index) => <FlexiblePlanItem key={item.id} item={item} index={index} date={date} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}</div>{items.length === 0 && <p className="text-[10px] text-muted-foreground">Drop ordered activities here</p>}</div>;
}

function SubHourGridLines({ hourHeight }: { hourHeight: number }) {
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 24 * hourHeight }}>{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="absolute inset-x-0 border-t border-stone-100/70 dark:border-neutral-800/50" style={{ top: (hour + 0.5) * hourHeight }} />)}</div>;
}

function ScheduleColumn({ date, items, flexibleItems, allDayItems, timezone, typeColors, width, hourHeight, selectedIds, primarySelectedId, onSelect, onCreateItem, onResize, onResizeStart }: { date: string; items: TravelObject[]; flexibleItems?: TravelObject[]; allDayItems: TravelObject[]; timezone: string; typeColors: Record<string, string>; width: number; hourHeight: number; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onCreateItem: (date: string, time: string) => void; onResize: (item: TravelObject, endDate: string, endTime: string) => void; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => void }) {
  const flexiblePlanItems = flexibleItems ?? items.filter((item) => !item.startDateTime && !item.endDateTime);
  items = items.filter((item) => Boolean(item.startDateTime && item.endDateTime));
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return <div ref={setNodeRef} className={`relative shrink-0 border-r ${isOver ? "bg-emerald-50/70 dark:bg-emerald-950/30" : ""}`} style={{ width }}>
    <div className="sticky top-14 z-20 h-0 overflow-visible">{allDayItems.map((item, index) => <div key={item.id} className="absolute inset-x-1 h-6" style={{ top: index * 28 }}><ScheduleStripItem item={item} date={date} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} /></div>)}</div>
    <FlexiblePlanBand date={date} items={flexiblePlanItems} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={onSelect} />
    <SubHourGridLines hourHeight={hourHeight} />
    <div className="relative" style={{ height: 24 * hourHeight }} onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.round(((event.clientY - rect.top) / hourHeight * 60) / 15) * 15)); onCreateItem(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`); }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute w-full border-b border-stone-100 dark:border-neutral-800" style={{ top: hour * hourHeight, height: hourHeight }} />)}{items.map((item) => <ScheduleEvent key={item.id} item={item} date={date} timezone={timezone} color={typeColor(item.type, typeColors)} hourHeight={hourHeight} narrowerOverlap={items.some((other) => other.id !== item.id && Date.parse(other.startDateTime ?? "") < Date.parse(item.endDateTime ?? "") && Date.parse(other.endDateTime ?? "") > Date.parse(item.startDateTime ?? "") && Date.parse(other.endDateTime ?? "") - Date.parse(other.startDateTime ?? "") > Date.parse(item.endDateTime ?? "") - Date.parse(item.startDateTime ?? ""))} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} onResize={onResize} onResizeStart={onResizeStart} />)}</div>
  </div>;
}

export function CalendarView({ trip, items, typeColors = {}, selectedIds, primarySelectedId, onSelect, onSelectForDrag, onMove, onUnschedule, onResize, onResizeStart, onFlexibleDrop = async (item, date, order, clearTime) => { const dayIndex = Math.max(1, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${trip.startDate.slice(0, 10)}T00:00:00Z`)) / 86400000) + 1); await api.reorderObjects({ tripId: trip.id, objectId: item.id, dayIndex, dayOrder: order, clearTime }); window.location.reload(); }, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors?: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onSelectForDrag: (item: TravelObject) => void; onMove: (item: TravelObject, date: string, time?: string) => Promise<void>; onUnschedule: (item: TravelObject) => Promise<void>; onResize: (item: TravelObject, endDate: string, endTime: string) => Promise<void>; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => Promise<void>; onFlexibleDrop?: (item: TravelObject, date: string, order: number, clearTime: boolean) => Promise<void>; onCreateItem: (date?: string, time?: string) => void }) {
  const start = trip.startDate.slice(0, 10);
  const mode = useTravelStore((state) => state.calendarMode);
  const setMode = useTravelStore((state) => state.setCalendarMode);
  const [focusDate, setFocusDate] = useState(start);
  const [hourHeight, setHourHeight] = useState(52);
  const [dayWidth, setDayWidth] = useState(142);
  const [zoomDrag, setZoomDrag] = useState<{ x: number; y: number; hourHeight: number; dayWidth: number } | null>(null);
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const suppressClickRef = useRef(false);
  const today = dateParts(new Date(), trip.timezone).date;
  const month = useMemo(() => { const date = new Date(`${focusDate}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }, [focusDate]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const currentMonth = month.toISOString().slice(0, 7);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const scheduledItems = items.filter((item): item is TravelObject & { startDateTime: string; endDateTime: string } => Boolean(item.startDateTime && item.endDateTime));
  const unscheduledItems = items.filter((item) => !item.startDateTime && !item.endDateTime && item.dayIndex === null);
  const flexibleItems = (date: string) => items.filter((item) => !item.startDateTime && !item.endDateTime && item.dayIndex === Math.max(1, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${trip.startDate.slice(0, 10)}T00:00:00Z`)) / 86400000) + 1)).sort((a, b) => (a.dayOrder ?? Number.MAX_SAFE_INTEGER) - (b.dayOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt));
  const spans = scheduledItems.map((item) => ({ item, start: dateParts(item.startDateTime ?? "", trip.timezone).date, end: dateParts(item.endDateTime ?? "", trip.timezone).date })).filter(({ item, start, end }) => end > start || item.isAllDay);
  const byDay = new Map<string, TravelObject[]>();
  for (const item of scheduledItems) { const date = dateParts(item.startDateTime ?? "", trip.timezone).date; if (!spans.some((span) => span.item.id === item.id)) byDay.set(date, [...(byDay.get(date) ?? []), item]); }
  const weeks = Array.from({ length: 6 }, (_, index) => grid.slice(index * 7, index * 7 + 7));
  const weekSegments = weeks.map((days) => {
    const segments = spans.filter(({ start, end }) => start <= days[6] && end >= days[0]).map(({ item, start, end }) => { const segmentStart = start < days[0] ? days[0] : start; const segmentEnd = end > days[6] ? days[6] : end; const startColumn = days.indexOf(segmentStart); const endColumn = days.indexOf(segmentEnd); return { item, start: segmentStart, end: segmentEnd, startColumn, dayCount: endColumn - startColumn + 1, startsHere: start >= days[0], endsHere: end <= days[6] }; }).sort((a, b) => Number(b.item.isAllDay) - Number(a.item.isAllDay) || a.startColumn - b.startColumn || b.dayCount - a.dayCount);
    const laneEnds: string[] = []; const placed = segments.map((segment) => { let lane = laneEnds.findIndex((end) => end < segment.start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = segment.end; return { ...segment, lane }; }); return { days, segments: placed, laneCount: laneEnds.length };
  });
  const weekStart = sundayOf(focusDate); const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)); const visibleDates = mode === "day" ? [focusDate] : weekDates;
  const topItemsForDate = (date: string) => scheduledItems.filter((item) => {
    const first = dateParts(item.startDateTime ?? "", trip.timezone).date;
    const last = dateParts(item.endDateTime ?? "", trip.timezone).date;
    return item.isAllDay && first <= date && last >= date;
  });
  const scheduleItems = (date: string) => [...scheduledItems.filter((item) => { if (item.isAllDay) return false; const first = dateParts(item.startDateTime ?? "", trip.timezone); const last = dateParts(item.endDateTime ?? "", trip.timezone); return first.date <= date && (last.date > date || last.date === date && last.time > "00:00"); }), ...(mode === "week" ? flexibleItems(date) : [])];
  function finishDrag() { setActiveItem(null); requestAnimationFrame(() => { suppressClickRef.current = false; }); }
  async function handleDragEnd(event: DragEndEvent) { finishDrag(); const target = String(event.over?.id ?? ""); const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? items.find((candidate) => candidate.id === String(event.active.id)); if (!item) return; if (target === "unscheduled") { if (item.startDateTime || item.endDateTime) await onUnschedule(item); return; } if (target.startsWith("flexible:")) { const [, date, rawOrder] = target.split(":"); if (date) await onFlexibleDrop(item, date, Number.isFinite(Number(rawOrder)) ? Number(rawOrder) : flexibleItems(date).length, Boolean(item.startDateTime || item.endDateTime)); return; } if (!target.startsWith("day:")) return; const destination = target.slice(4); const original = item.startDateTime ? dateParts(item.startDateTime, trip.timezone) : null; let nextDate = destination; let nextTime: string | undefined; if (mode !== "month" && original) { const [hour, minute] = original.time.split(":").map(Number); const total = hour * 60 + minute + Math.round((event.delta.y / hourHeight * 60) / 15) * 15; const dayShift = Math.floor(total / 1440); const withinDay = ((total % 1440) + 1440) % 1440; nextDate = shiftDate(destination, dayShift); nextTime = `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`; } if (!original || original.date !== nextDate || nextTime && original.time !== nextTime) await onMove(item, nextDate, nextTime); }
  function handleDragStart(event: DragStartEvent) { suppressClickRef.current = true; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? items.find((candidate) => candidate.id === String(event.active.id).split(":")[0]); setActiveItem(item ?? null); if (item && !selectedIds.has(item.id)) onSelectForDrag(item); }
  function selectFromClick(item: TravelObject, additive = false) { if (!suppressClickRef.current) onSelect(item, additive); }
  const activeDragItems = activeItem ? [activeItem, ...items.filter((item) => item.id !== activeItem.id && selectedIds.has(item.id))] : [];
  function navigate(direction: number) { if (mode === "month") { const date = new Date(`${focusDate}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); setFocusDate(date.toISOString().slice(0, 10)); } else setFocusDate(shiftDate(focusDate, direction * (mode === "week" ? 7 : 1))); }
  useEffect(() => {
    function navigateWithArrow(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      navigate(direction);
    }
    window.addEventListener("keydown", navigateWithArrow);
    return () => window.removeEventListener("keydown", navigateWithArrow);
  });
  function goToTripStart() { setFocusDate(start); }
  function goToToday() { setFocusDate(today); setMode("day"); }
  const title = mode === "month" ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month) : mode === "day" ? formatTripDate(`${focusDate}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${formatTripDate(`${weekDates[0]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${weekDates[6]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}`;
  return <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">Times shown in {trip.timezone}</p></div><div className="flex items-center gap-2"><div className="flex rounded-lg border p-0.5">{(["month", "week", "day"] as Mode[]).map((view) => <Button key={view} variant={mode === view ? "secondary" : "ghost"} size="sm" className="capitalize" onClick={() => setMode(view)}>{view}<kbd className="ml-1 rounded border px-1 text-[9px] font-normal opacity-60">{view === "month" ? "Q" : view === "week" ? "W" : "E"}</kbd></Button>)}</div><Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous period"><ChevronLeft /></Button><Button variant="outline" size="sm" onClick={goToToday}>Today</Button><Button variant="outline" size="sm" onClick={goToTripStart}>Trip start</Button><Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Next period"><ChevronRight /></Button></div></div>
    {mode === "month" ? <><div className="grid grid-cols-7 border-b bg-stone-50 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:bg-neutral-800 dark:text-stone-300 sm:text-xs">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div><DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="min-h-0 flex-1 overflow-y-auto">{weekSegments.map(({ days, segments, laneCount }) => <div key={days[0]} className="relative grid grid-cols-7">{days.map((date) => <DayCell key={date} date={date} currentMonth={currentMonth} items={byDay.get(date) ?? []} timezone={trip.timezone} typeColors={typeColors} reservedRows={laneCount} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onCreateItem={onCreateItem} />)}{segments.map((segment) => <MultiDayBar key={`${segment.item.id}:${days[0]}`} item={segment.item} weekStart={days[0]} startColumn={segment.startColumn} dayCount={segment.dayCount} lane={segment.lane} startsHere={segment.startsHere} endsHere={segment.endsHere} color={typeColor(segment.item.type, typeColors)} selected={selectedIds.has(segment.item.id)} primary={primarySelectedId === segment.item.id} onSelect={selectFromClick} />)}</div>)}</div><UnscheduledDrawer items={unscheduledItems} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onAdd={() => onCreateItem()} /><DragOverlay dropAnimation={null}>{activeDragItems.length ? <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} /> : null}</DragOverlay></DndContext></> : <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="min-h-0 flex-1 overflow-auto"><div className={`relative min-h-full ${mode === "week" ? "min-w-[1050px]" : "min-w-[520px]"}`} onPointerDown={(event) => { if ((event.target as HTMLElement).closest("[role=button],button")) return; setZoomDrag({ x: event.clientX, y: event.clientY, hourHeight, dayWidth }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!zoomDrag) return; const deltaX = event.clientX - zoomDrag.x; const deltaY = event.clientY - zoomDrag.y; setHourHeight(Math.min(110, Math.max(28, zoomDrag.hourHeight + deltaY * 0.35))); setDayWidth(Math.min(240, Math.max(90, zoomDrag.dayWidth + deltaX * 0.35))); }} onPointerUp={() => setZoomDrag(null)} onPointerCancel={() => setZoomDrag(null)}><div className="sticky top-0 z-30 bg-white shadow-sm dark:bg-neutral-900"><div className="flex border-b"><div className="sticky left-0 z-40 h-14 w-12 shrink-0 border-r bg-white dark:bg-neutral-900" />{visibleDates.map((date) => <div key={date} className="h-14 shrink-0 border-r" style={{ width: mode === "week" ? dayWidth : dayWidth * 2.96 }}><p className="pt-1 text-center text-xs font-medium"><span className={date === today ? "rounded-full bg-emerald-700 px-2 py-1 text-white" : undefined}>{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short", month: "short", day: "numeric" })}</span></p></div>)}</div></div><div className="flex"><div className="sticky left-0 z-20 w-12 shrink-0 bg-white dark:bg-neutral-900">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative border-b text-right text-[9px] text-muted-foreground" style={{ height: hourHeight }}><span className="absolute -top-2 right-1">{String(hour).padStart(2, "0")}:00</span></div>)}</div>{visibleDates.map((date) => <ScheduleColumn key={date} date={date} items={scheduleItems(date)} allDayItems={topItemsForDate(date)} timezone={trip.timezone} typeColors={typeColors} width={mode === "week" ? dayWidth : dayWidth * 2.96} hourHeight={hourHeight} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onCreateItem={onCreateItem} onResize={onResize} onResizeStart={onResizeStart} />)}</div></div></div><UnscheduledDrawer items={unscheduledItems} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onAdd={() => onCreateItem()} /><DragOverlay dropAnimation={null}>{activeDragItems.length ? <CalendarDragPreview items={activeDragItems} timezone={trip.timezone} typeColors={typeColors} /> : null}</DragOverlay></DndContext>}
    <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><Clock size={13} /> Drag items to reschedule. Double-click an empty time to add an item. Drag empty space horizontally to change day width or vertically to change the time scale.</div>
  </div>;
}
