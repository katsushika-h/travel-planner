"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { Plus, MapPin, GripVertical } from "lucide-react";
import { formatTripDate, dateParts } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";
import { api } from "@/lib/api-client";

const defaultTypeColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const typePalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function eventTypeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultTypeColors[type] ?? typePalette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % typePalette.length]; }
function shiftDate(date: string, count: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
function TripDayColumn({ date, index, items, timezone, colorMap, selectedIds, primarySelectedId, onSelect, onCreate }: { date: string; index: number; items: TravelObject[]; timezone: string; colorMap: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onCreate: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}` });
  return <section ref={setNodeRef} className={`flex min-h-0 w-[280px] shrink-0 flex-col rounded-xl border bg-white dark:bg-neutral-900 ${isOver ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}>
    <header className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-xs font-medium text-muted-foreground">Day {index + 1}</p><h2 className="text-sm font-semibold">{formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "short", month: "short", day: "numeric" })}</h2></div><button type="button" onClick={() => onCreate(date)} title="Add item on this day" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Plus size={15} /></button></header>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" onDoubleClick={() => onCreate(date)} title="Double-click to add an item">{items.map((item, order) => <DayCard key={`${item.id}:${date}`} item={item} order={order} date={date} timezone={timezone} color={eventTypeColor(item.type, colorMap)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}{items.length === 0 && <button type="button" onDoubleClick={(event) => { event.stopPropagation(); onCreate(date); }} className="grid min-h-24 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Double-click to add an item</button>}</div>
  </section>;
}
function DayCard({ item, order, date, timezone, color, selected, primary, onSelect }: { item: TravelObject; order: number; date: string; timezone: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive?: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${date}`, data: { item } }); const place = (item.location as { name?: string } | null)?.name;
  const time = item.startDateTime && !item.isAllDay ? dateParts(item.startDateTime, timezone).time : item.isAllDay ? "All day" : "";
  return <button ref={setNodeRef} data-travel-object-id={item.id} {...attributes} {...listeners} type="button" onClick={(event) => onSelect(item, event.shiftKey)} style={{ borderLeft: `4px solid ${color}`, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`w-full scroll-mx-4 overflow-hidden rounded-lg border bg-background text-left shadow-sm ${selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : ""} ${isDragging ? "opacity-40" : ""}`}>{item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}<div className="flex gap-3 p-3"><span className="w-5 shrink-0 pt-0.5 text-center text-xs font-semibold text-muted-foreground">{order + 1}</span><div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 text-sm font-medium"><GripVertical size={13} className="shrink-0 text-muted-foreground"/><span className="truncate">{item.title}</span></p><p className="mt-1 text-xs text-muted-foreground"><span className={time && time !== "All day" ? "mr-2 text-stone-400" : "mr-2"}>{time}</span>{item.isAllDay ? "All day" : item.type}</p>{place && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11}/>{place}</p>}</div></div></button>;
}
function DragPreview({ item, timezone, color }: { item: TravelObject; timezone: string; color: string }) {
  const place = (item.location as { name?: string } | null)?.name;
  const scheduleLabel = item.isAllDay ? "All day" : item.startDateTime && item.endDateTime ? `${dateParts(item.startDateTime, timezone).time}–${dateParts(item.endDateTime, timezone).time}` : "Flexible plan";
  return <article className="w-[280px] overflow-hidden rounded-lg border bg-background text-left shadow-xl" style={{ borderLeft: `4px solid ${color}` }}>{item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}<div className="p-3"><p className="flex items-center gap-1.5 text-sm font-medium"><GripVertical size={13} className="shrink-0 text-muted-foreground"/><span className="truncate">{item.title}</span></p><p className="mt-1 pl-5 text-xs text-muted-foreground">{scheduleLabel} · {item.type}</p>{place && <p className="mt-1 flex items-center gap-1 pl-5 text-xs text-muted-foreground"><MapPin size={11}/>{place}</p>}</div></article>;
}
export function TripDaysView({ trip, items, typeColors, selectedIds, primarySelectedId, inspectedItemId, onSelect, onSelectForDrag, onMove, onReorder, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; inspectedItemId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onSelectForDrag: (item: TravelObject) => void; onMove: (item: TravelObject, date: string) => Promise<void>; onReorder?: (item: TravelObject, date: string, order: number, clearTime: boolean) => Promise<void>; onCreateItem: (date: string) => void }) {
  const [localItems, setLocalItems] = useState<TravelObject[] | null>(null);
  useEffect(() => setLocalItems(null), [items]);
  items = (localItems ?? items).filter((item) => item.dayIndex !== null || (item.startDateTime && item.endDateTime));
  const start = trip.startDate.slice(0, 10); const end = trip.endDate.slice(0, 10); const days: string[] = []; for (let date = start, i = 0; date <= end && i < 1000; date = shiftDate(date, 1), i++) days.push(date);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  useEffect(() => {
    if (!inspectedItemId) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => { const board = boardRef.current; if (!board) return; const center = board.getBoundingClientRect().left + board.clientWidth / 2; const candidates = [...board.querySelectorAll<HTMLElement>("[data-travel-object-id]")].filter((element) => element.dataset.travelObjectId === inspectedItemId); const target = candidates.reduce<HTMLElement | null>((nearest, candidate) => !nearest || Math.abs(candidate.getBoundingClientRect().left + candidate.clientWidth / 2 - center) < Math.abs(nearest.getBoundingClientRect().left + nearest.clientWidth / 2 - center) ? candidate : nearest, null); target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }); });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [inspectedItemId]);
  const finishDrag = () => { setActiveItem(null); requestAnimationFrame(() => { suppressClickRef.current = false; }); };
  const onDragStart = (event: DragStartEvent) => { suppressClickRef.current = true; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item ?? null; setActiveItem(item); if (item && !selectedIds.has(item.id)) onSelectForDrag(item); };
  const orderedForDate = (date: string) => items.filter((item) => {
    if (item.startDateTime && item.endDateTime) {
      const first = dateParts(item.startDateTime, trip.timezone).date;
      const last = dateParts(item.endDateTime, trip.timezone).date;
      return first <= date && last >= date;
    }
    return item.dayIndex === days.indexOf(date) + 1;
  }).sort((a, b) => (a.dayOrder ?? Number.MAX_SAFE_INTEGER) - (b.dayOrder ?? Number.MAX_SAFE_INTEGER) || (a.startDateTime ? Date.parse(a.startDateTime) : Number.MAX_SAFE_INTEGER) - (b.startDateTime ? Date.parse(b.startDateTime) : Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt));
  async function persistReorder(item: TravelObject, date: string, order: number, clearTime: boolean) {
    if (onReorder) { await onReorder(item, date, order, clearTime); return; }
    const dayIndex = Math.max(1, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${trip.startDate.slice(0, 10)}T00:00:00Z`)) / 86400000) + 1);
    setLocalItems(await api.reorderObjects({ tripId: trip.id, objectId: item.id, dayIndex, dayOrder: order, clearTime }));
  }
  const onDragEnd = (event: DragEndEvent) => { const target = String(event.over?.id ?? ""); if (!target.startsWith("trip-day:")) return; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item; const date = target.slice("trip-day:".length); if (!item) return; const destinationDay = days.indexOf(date) + 1; if (item.startDateTime && item.endDateTime && item.dayIndex !== destinationDay) { void onMove(item, date); return; } const targetItems = orderedForDate(date).filter((candidate) => candidate.id !== item.id); void persistReorder(item, date, targetItems.length, false); };
  const selectFromClick = (item: TravelObject, additive = false) => { if (!suppressClickRef.current) onSelect(item, additive); };
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-stone-50 dark:bg-neutral-950"><header className="border-b bg-white px-4 py-3 dark:bg-neutral-900"><h2 className="text-sm font-semibold">Itinerary</h2><p className="text-xs text-muted-foreground">Ordered plan · timed items keep their actual time; flexible items have no confirmed time.</p></header><DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { onDragEnd(event); finishDrag(); }}><div ref={boardRef} className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">{days.map((date, index) => <TripDayColumn key={date} date={date} index={index} timezone={trip.timezone} items={orderedForDate(date)} colorMap={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectFromClick} onCreate={onCreateItem} />)}</div><DragOverlay>{activeItem && <DragPreview item={activeItem} timezone={trip.timezone} color={eventTypeColor(activeItem.type, typeColors)} />}</DragOverlay></DndContext></div>;
}
