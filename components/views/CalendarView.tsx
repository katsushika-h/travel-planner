"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Clock, GripVertical, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateParts, formatTripDate, monthGrid } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

type Mode = "month" | "week" | "day";
const defaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const palette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function typeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultColors[type] ?? palette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function sundayOf(date: string) { const value = new Date(`${date}T00:00:00Z`); return shiftDate(date, -value.getUTCDay()); }

function DayCell({ date, currentMonth, items, timezone, typeColors, reservedRows, onSelect, onCreateItem }: { date: string; currentMonth: string; items: TravelObject[]; timezone: string; typeColors: Record<string, string>; reservedRows: number; onSelect: (item: TravelObject) => void; onCreateItem: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const [, , day] = date.split("-").map(Number);
  const today = dateParts(new Date(), timezone).date;
  return <div ref={setNodeRef} onDoubleClick={() => onCreateItem(date)} title="Double-click to add an item" className={`min-h-[116px] border-b border-r p-1.5 transition-colors sm:min-h-[132px] ${date.slice(0, 7) === currentMonth ? "bg-white dark:bg-neutral-900" : "bg-stone-50/70 dark:bg-neutral-950"} ${isOver ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400 dark:bg-emerald-950" : ""}`}>
    <div className={`mb-1 flex h-6 w-6 items-center justify-center text-xs ${date === today ? "rounded-full bg-emerald-700 font-semibold text-white" : "text-stone-500 dark:text-stone-400"}`}>{day}</div>
    <div className="space-y-1" style={{ paddingTop: `${reservedRows * 22}px` }}>{items.map((item) => <EventChip key={item.id} item={item} timezone={timezone} color={typeColor(item.type, typeColors)} onSelect={onSelect} />)}</div>
  </div>;
}

function EventChip({ item, timezone, color, onSelect }: { item: TravelObject; timezone: string; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item }, disabled: item.id.startsWith("draft:") });
  const time = item.isAllDay ? "All day" : formatTripDate(item.startDateTime ?? "", timezone, { hour: "numeric", minute: "2-digit" });
  const style: CSSProperties = { backgroundColor: `${color}20`, borderColor: `${color}70`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={() => onSelect(item)} onDoubleClick={(event) => event.stopPropagation()} className={`group flex w-full items-start gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 ${isDragging ? "z-20 opacity-40" : ""}`} {...attributes} {...listeners}>
    <GripVertical size={11} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100" /><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span><span className="hidden shrink-0 text-[10px] opacity-75 sm:inline">{time}</span>
  </button>;
}

function MultiDayBar({ item, weekStart, startColumn, dayCount, lane, startsHere, endsHere, color, onSelect }: { item: TravelObject; weekStart: string; startColumn: number; dayCount: number; lane: number; startsHere: boolean; endsHere: boolean; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${weekStart}`, data: { item }, disabled: item.id.startsWith("draft:") });
  const style: CSSProperties = { left: `calc(${(startColumn / 7) * 100}% + 2px)`, width: `calc(${(dayCount / 7) * 100}% - 4px)`, top: `${29 + lane * 23}px`, backgroundColor: `${color}30`, borderColor: `${color}80`, color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} style={style} onClick={() => onSelect(item)} onDoubleClick={(event) => event.stopPropagation()} title={item.title} className={`absolute z-10 flex h-5 items-center gap-1 border px-1.5 text-left text-[10px] font-medium shadow-sm hover:brightness-95 ${startsHere ? "rounded-l-md" : "border-l-0"} ${endsHere ? "rounded-r-md" : "border-r-0"} ${isDragging ? "opacity-40" : ""}`} {...attributes} {...listeners}><span className="truncate">{item.title}</span></button>;
}

function ScheduleEvent({ item, date, timezone, color, hourHeight, narrowerOverlap, onSelect, onResize, onResizeStart }: { item: TravelObject; date: string; timezone: string; color: string; hourHeight: number; narrowerOverlap: boolean; onSelect: (item: TravelObject) => void; onResize: (item: TravelObject, endDate: string, endTime: string) => void; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => void }) {
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
  function resizeHandle(edge: "start" | "end") { return <div role="separator" aria-label={edge === "start" ? "Resize event start time" : "Resize event end time"} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setResize({ y: event.clientY, delta: 0, edge }); }} onPointerMove={updateResize} onPointerUp={finishResize} className={`absolute inset-x-0 h-2 cursor-ns-resize touch-none ${edge === "start" ? "top-0" : "bottom-0"}`} />; }
  return <div ref={setNodeRef} {...attributes} {...listeners} role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelect(item); }} onDoubleClick={(event) => event.stopPropagation()} className={`absolute z-[1] mx-1 w-[calc(100%-8px)] overflow-hidden rounded-md px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm ${isDragging ? "opacity-40" : ""}`} style={style} title={`${item.title} · ${start.time}–${end.time}`}>{resizeHandle("start")}<span className="block truncate font-semibold">{item.title}</span><span className="block truncate opacity-80">{start.time}–{end.time}</span>{resizeHandle("end")}</div>;
}

function ScheduleStripItem({ item, date, color, onSelect }: { item: TravelObject; date: string; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${date}`, data: { item }, disabled: item.id.startsWith("draft:") });
  const style: CSSProperties = { backgroundColor: color, color: "white", ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) };
  return <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onSelect(item)} title={item.title} style={style} className={`h-full w-full truncate rounded-full px-3 text-left text-sm font-medium shadow-sm hover:brightness-95 ${isDragging ? "opacity-40" : ""}`}>{item.title}</button>;
}

function UnscheduledDrawer({ items, typeColors, onSelect, onAdd }: { items: TravelObject[]; typeColors: Record<string, string>; onSelect: (item: TravelObject) => void; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  return <section className="shrink-0 border-t bg-stone-50 dark:bg-neutral-950">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold"><ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />Unscheduled <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] dark:bg-neutral-800">{items.length}</span><span className="ml-auto text-[10px] font-normal text-muted-foreground">{open ? "Drag an idea onto a date" : "Click to open"}</span></button>
    {open && <div className="flex items-center gap-2 overflow-x-auto px-3 pb-3">{items.map((item) => <UnscheduledCard key={item.id} item={item} color={typeColor(item.type, typeColors)} onSelect={onSelect} />)}<Button variant="outline" size="sm" className="h-9 shrink-0" onClick={onAdd}>+ Add idea</Button>{items.length === 0 && <span className="text-xs text-muted-foreground">No unscheduled ideas yet.</span>}</div>}
  </section>;
}

function UnscheduledCard({ item, color, onSelect }: { item: TravelObject; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } });
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={() => onSelect(item)} style={{ borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) }} className={`h-10 w-44 shrink-0 truncate rounded-md border border-l-4 bg-white px-2 text-left text-xs font-medium shadow-sm dark:bg-neutral-900 ${isDragging ? "opacity-40" : ""}`}>{item.title}<span className="ml-1 font-normal text-muted-foreground">· {item.type}</span></button>;
}

function ScheduleColumn({ date, items, allDayItems, timezone, typeColors, width, hourHeight, onSelect, onCreateItem, onResize, onResizeStart }: { date: string; items: TravelObject[]; allDayItems: TravelObject[]; timezone: string; typeColors: Record<string, string>; width: number; hourHeight: number; onSelect: (item: TravelObject) => void; onCreateItem: (date: string, time: string) => void; onResize: (item: TravelObject, endDate: string, endTime: string) => void; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return <div ref={setNodeRef} className={`relative shrink-0 border-r ${isOver ? "bg-emerald-50/70 dark:bg-emerald-950/30" : ""}`} style={{ width }}>
    <div className="sticky top-14 z-20 h-0 overflow-visible">{allDayItems.map((item, index) => <div key={item.id} className="absolute inset-x-1 h-9" style={{ top: index * 38 }}><ScheduleStripItem item={item} date={date} color={typeColor(item.type, typeColors)} onSelect={onSelect} /></div>)}</div>
    <div className="relative" style={{ height: 24 * hourHeight }} onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.round(((event.clientY - rect.top) / hourHeight * 60) / 15) * 15)); onCreateItem(date, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`); }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute w-full border-b border-stone-100 dark:border-neutral-800" style={{ top: hour * hourHeight, height: hourHeight }} />)}{items.map((item) => <ScheduleEvent key={item.id} item={item} date={date} timezone={timezone} color={typeColor(item.type, typeColors)} hourHeight={hourHeight} narrowerOverlap={items.some((other) => other.id !== item.id && Date.parse(other.startDateTime ?? "") < Date.parse(item.endDateTime ?? "") && Date.parse(other.endDateTime ?? "") > Date.parse(item.startDateTime ?? "") && Date.parse(other.endDateTime ?? "") - Date.parse(other.startDateTime ?? "") > Date.parse(item.endDateTime ?? "") - Date.parse(item.startDateTime ?? ""))} onSelect={onSelect} onResize={onResize} onResizeStart={onResizeStart} />)}</div>
  </div>;
}

export function CalendarView({ trip, items, typeColors = {}, onSelect, onMove, onResize, onResizeStart, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors?: Record<string, string>; onSelect: (item: TravelObject) => void; onMove: (item: TravelObject, date: string, time?: string) => Promise<void>; onResize: (item: TravelObject, endDate: string, endTime: string) => Promise<void>; onResizeStart: (item: TravelObject, startDate: string, startTime: string) => Promise<void>; onCreateItem: (date?: string, time?: string) => void }) {
  const start = trip.startDate.slice(0, 10);
  const [focusDate, setFocusDate] = useState(start);
  const [mode, setMode] = useState<Mode>("month");
  const [hourHeight, setHourHeight] = useState(52);
  const [dayWidth, setDayWidth] = useState(142);
  const [zoomDrag, setZoomDrag] = useState<{ centerX: number; centerY: number; distance: number; hourHeight: number; dayWidth: number } | null>(null);
  const today = dateParts(new Date(), trip.timezone).date;
  const month = useMemo(() => { const date = new Date(`${focusDate}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }, [focusDate]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const currentMonth = month.toISOString().slice(0, 7);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === "m") setMode("month"); else if (key === "w") setMode("week"); else if (key === "d") setMode("day"); else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const scheduledItems = items.filter((item): item is TravelObject & { startDateTime: string; endDateTime: string } => Boolean(item.startDateTime && item.endDateTime));
  const unscheduledItems = items.filter((item) => !item.startDateTime || !item.endDateTime);
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
  const scheduleItems = (date: string) => scheduledItems.filter((item) => { if (item.isAllDay) return false; const first = dateParts(item.startDateTime ?? "", trip.timezone); const last = dateParts(item.endDateTime ?? "", trip.timezone); return first.date <= date && (last.date > date || last.date === date && last.time > "00:00"); });
  async function handleDragEnd(event: DragEndEvent) { const target = String(event.over?.id ?? ""); if (!target.startsWith("day:")) return; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? items.find((candidate) => candidate.id === String(event.active.id)); const destination = target.slice(4); if (!item) return; const original = item.startDateTime ? dateParts(item.startDateTime, trip.timezone) : null; let nextDate = destination; let nextTime: string | undefined; if (mode !== "month" && original) { const [hour, minute] = original.time.split(":").map(Number); const total = hour * 60 + minute + Math.round((event.delta.y / hourHeight * 60) / 15) * 15; const dayShift = Math.floor(total / 1440); const withinDay = ((total % 1440) + 1440) % 1440; nextDate = shiftDate(destination, dayShift); nextTime = `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`; } if (!original || original.date !== nextDate || nextTime && original.time !== nextTime) await onMove(item, nextDate, nextTime); }
  function navigate(direction: number) { if (mode === "month") { const date = new Date(`${focusDate}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); setFocusDate(date.toISOString().slice(0, 10)); } else setFocusDate(shiftDate(focusDate, direction * (mode === "week" ? 7 : 1))); }
  function goToTripStart() { setFocusDate(start); }
  function goToToday() { setFocusDate(today); setMode("day"); }
  const title = mode === "month" ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month) : mode === "day" ? formatTripDate(`${focusDate}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${formatTripDate(`${weekDates[0]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric" })} – ${formatTripDate(`${weekDates[6]}T12:00:00Z`, trip.timezone, { month: "short", day: "numeric", year: "numeric" })}`;
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">Times shown in {trip.timezone}</p></div><div className="flex items-center gap-2"><div className="flex rounded-lg border p-0.5">{(["month", "week", "day"] as Mode[]).map((view) => <Button key={view} variant={mode === view ? "secondary" : "ghost"} size="sm" className="capitalize" onClick={() => setMode(view)}>{view}<kbd className="ml-1 rounded border px-1 text-[9px] font-normal opacity-60">{view === "month" ? "M" : view === "week" ? "W" : "D"}</kbd></Button>)}</div><Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous period"><ChevronLeft /></Button><Button variant="outline" size="sm" onClick={goToToday}>Today</Button><Button variant="outline" size="sm" onClick={goToTripStart}>Trip start</Button><Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Next period"><ChevronRight /></Button></div></div>
    {mode === "month" ? <><div className="grid grid-cols-7 border-b bg-stone-50 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:bg-neutral-800 dark:text-stone-300 sm:text-xs">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div><DndContext sensors={sensors} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="min-h-0 flex-1 overflow-y-auto">{weekSegments.map(({ days, segments, laneCount }) => <div key={days[0]} className="relative grid grid-cols-7">{days.map((date) => <DayCell key={date} date={date} currentMonth={currentMonth} items={byDay.get(date) ?? []} timezone={trip.timezone} typeColors={typeColors} reservedRows={laneCount} onSelect={onSelect} onCreateItem={onCreateItem} />)}{segments.map((segment) => <MultiDayBar key={`${segment.item.id}:${days[0]}`} item={segment.item} weekStart={days[0]} startColumn={segment.startColumn} dayCount={segment.dayCount} lane={segment.lane} startsHere={segment.startsHere} endsHere={segment.endsHere} color={typeColor(segment.item.type, typeColors)} onSelect={onSelect} />)}</div>)}</div><UnscheduledDrawer items={unscheduledItems} typeColors={typeColors} onSelect={onSelect} onAdd={() => onCreateItem()} /></DndContext></> : <DndContext sensors={sensors} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="min-h-0 flex-1 overflow-auto"><div className={`relative min-h-full ${mode === "week" ? "min-w-[1050px]" : "min-w-[520px]"}`} onPointerDown={(event) => { if ((event.target as HTMLElement).closest("[role=button],button")) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; setZoomDrag({ centerX, centerY, distance: Math.hypot(event.clientX - centerX, event.clientY - centerY), hourHeight, dayWidth }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!zoomDrag) return; const distance = Math.hypot(event.clientX - zoomDrag.centerX, event.clientY - zoomDrag.centerY); const scale = Math.min(2.1, Math.max(0.55, 1 + (distance - zoomDrag.distance) / 260)); setHourHeight(Math.min(110, Math.max(28, zoomDrag.hourHeight * scale))); setDayWidth(Math.min(240, Math.max(90, zoomDrag.dayWidth * scale))); }} onPointerUp={() => setZoomDrag(null)} onPointerCancel={() => setZoomDrag(null)}><div className="sticky top-0 z-30 bg-white shadow-sm dark:bg-neutral-900"><div className="flex border-b"><div className="sticky left-0 z-40 h-14 w-12 shrink-0 border-r bg-white dark:bg-neutral-900" />{visibleDates.map((date) => <div key={date} className="h-14 shrink-0 border-r" style={{ width: mode === "week" ? dayWidth : dayWidth * 2.96 }}><p className="pt-1 text-center text-xs font-medium"><span className={date === today ? "rounded-full bg-emerald-700 px-2 py-1 text-white" : undefined}>{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short", month: "short", day: "numeric" })}</span></p></div>)}</div></div><div className="flex"><div className="sticky left-0 z-20 w-12 shrink-0 bg-white dark:bg-neutral-900">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative border-b text-right text-[9px] text-muted-foreground" style={{ height: hourHeight }}><span className="absolute -top-2 right-1">{String(hour).padStart(2, "0")}:00</span></div>)}</div>{visibleDates.map((date) => <ScheduleColumn key={date} date={date} items={scheduleItems(date)} allDayItems={topItemsForDate(date)} timezone={trip.timezone} typeColors={typeColors} width={mode === "week" ? dayWidth : dayWidth * 2.96} hourHeight={hourHeight} onSelect={onSelect} onCreateItem={onCreateItem} onResize={onResize} onResizeStart={onResizeStart} />)}</div></div></div><UnscheduledDrawer items={unscheduledItems} typeColors={typeColors} onSelect={onSelect} onAdd={() => onCreateItem()} /></DndContext>}
    <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><Clock size={13} /> Drag items to reschedule. Double-click an empty time to add an item. Drag empty space toward the center to zoom out, or away from it to zoom in.</div>
  </div>;
}
