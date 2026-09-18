"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import { Plus, MapPin, GripVertical } from "lucide-react";
import { formatTripDate, dateParts } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypeColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const typePalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function eventTypeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultTypeColors[type] ?? typePalette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % typePalette.length]; }
function shiftDate(date: string, count: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
function TripDayColumn({ date, index, items, timezone, colorMap, onSelect, onCreate }: { date: string; index: number; items: TravelObject[]; timezone: string; colorMap: Record<string, string>; onSelect: (item: TravelObject) => void; onCreate: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}` });
  return <section ref={setNodeRef} className={`flex min-h-0 w-[280px] shrink-0 flex-col rounded-xl border bg-white dark:bg-neutral-900 ${isOver ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}>
    <header className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-xs font-medium text-muted-foreground">Day {index + 1}</p><h2 className="text-sm font-semibold">{formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "short", month: "short", day: "numeric" })}</h2></div><button type="button" onClick={() => onCreate(date)} title="Add item on this day" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Plus size={15} /></button></header>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" onDoubleClick={() => onCreate(date)} title="Double-click to add an item">{items.map((item) => <DayCard key={`${item.id}:${date}`} item={item} date={date} timezone={timezone} color={eventTypeColor(item.type, colorMap)} onSelect={onSelect} />)}{items.length === 0 && <button type="button" onDoubleClick={(event) => { event.stopPropagation(); onCreate(date); }} className="grid min-h-24 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Double-click to add an item</button>}</div>
  </section>;
}
function DayCard({ item, date, timezone, color, onSelect }: { item: TravelObject; date: string; timezone: string; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${item.id}:${date}`, data: { item } }); const place = (item.location as { name?: string } | null)?.name;
  return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={() => onSelect(item)} style={{ borderLeft: `4px solid ${color}`, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) }} className={`w-full overflow-hidden rounded-lg border bg-background text-left shadow-sm ${isDragging ? "opacity-40" : ""}`}>{item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}<div className="p-3"><p className="flex items-center gap-1.5 text-sm font-medium"><GripVertical size={13} className="shrink-0 text-muted-foreground"/><span className="truncate">{item.title}</span></p><p className="mt-1 pl-5 text-xs text-muted-foreground">{item.isAllDay ? "All day" : `${dateParts(item.startDateTime, timezone).time}–${dateParts(item.endDateTime, timezone).time}`} · {item.type}</p>{place && <p className="mt-1 flex items-center gap-1 pl-5 text-xs text-muted-foreground"><MapPin size={11}/>{place}</p>}</div></button>;
}
function DragPreview({ item, timezone, color }: { item: TravelObject; timezone: string; color: string }) {
  const place = (item.location as { name?: string } | null)?.name;
  return <article className="w-[280px] overflow-hidden rounded-lg border bg-background text-left shadow-xl" style={{ borderLeft: `4px solid ${color}` }}>{item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}<div className="p-3"><p className="flex items-center gap-1.5 text-sm font-medium"><GripVertical size={13} className="shrink-0 text-muted-foreground"/><span className="truncate">{item.title}</span></p><p className="mt-1 pl-5 text-xs text-muted-foreground">{item.isAllDay ? "All day" : `${dateParts(item.startDateTime, timezone).time}–${dateParts(item.endDateTime, timezone).time}`} · {item.type}</p>{place && <p className="mt-1 flex items-center gap-1 pl-5 text-xs text-muted-foreground"><MapPin size={11}/>{place}</p>}</div></article>;
}
export function TripDaysView({ trip, items, typeColors, onSelect, onMove, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; onSelect: (item: TravelObject) => void; onMove: (item: TravelObject, date: string) => Promise<void>; onCreateItem: (date: string) => void }) {
  const start = trip.startDate.slice(0, 10); const end = trip.endDate.slice(0, 10); const days: string[] = []; for (let date = start, i = 0; date <= end && i < 1000; date = shiftDate(date, 1), i++) days.push(date);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const onDragStart = (event: DragStartEvent) => setActiveItem((event.active.data.current as { item?: TravelObject } | undefined)?.item ?? null);
  const onDragEnd = (event: DragEndEvent) => { const target = String(event.over?.id ?? ""); if (!target.startsWith("trip-day:")) return; const item = (event.active.data.current as { item?: TravelObject } | undefined)?.item; const date = target.slice("trip-day:".length); if (item && dateParts(item.startDateTime, trip.timezone).date !== date) void onMove(item, date); };
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-stone-50 dark:bg-neutral-950"><header className="border-b bg-white px-4 py-3 dark:bg-neutral-900"><h2 className="text-sm font-semibold">Itinerary</h2><p className="text-xs text-muted-foreground">Move an item to another day to keep its time and change its date.</p></header><DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={() => setActiveItem(null)} onDragEnd={(event) => { onDragEnd(event); setActiveItem(null); }}><div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">{days.map((date, index) => <TripDayColumn key={date} date={date} index={index} timezone={trip.timezone} items={items.filter((item) => dateParts(item.startDateTime, trip.timezone).date <= date && dateParts(item.endDateTime, trip.timezone).date >= date).sort((a, b) => {
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    if (a.isAllDay && b.isAllDay) {
      const span = (item: TravelObject) => { const first = dateParts(item.startDateTime, trip.timezone).date; const last = dateParts(item.endDateTime, trip.timezone).date; return Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`); };
      const lengthOrder = span(b) - span(a); if (lengthOrder) return lengthOrder;
    }
    return Date.parse(a.startDateTime) - Date.parse(b.startDateTime) || a.title.localeCompare(b.title);
  })} colorMap={typeColors} onSelect={onSelect} onCreate={onCreateItem} />)}</div><DragOverlay>{activeItem && <DragPreview item={activeItem} timezone={trip.timezone} color={eventTypeColor(activeItem.type, typeColors)} />}</DragOverlay></DndContext></div>;
}
