"use client";

import { useState, type FormEvent } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarDays, GripVertical, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTripDate } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypes = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing"];
const defaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const palette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function typeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultColors[type] ?? palette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; }

function Card({ item, timezone, color, onSelect }: { item: TravelObject; timezone: string; color: string; onSelect: (item: TravelObject) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: item.id.startsWith("draft:") });
  const style = { ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}), borderLeft: `4px solid ${color}` };
  const location = item.location as { name?: string } | null;
  return <button ref={setNodeRef} style={style} onClick={() => onSelect(item)} onDoubleClick={(event) => event.stopPropagation()} {...attributes} {...listeners} className={`w-full rounded-xl border border-l-4 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:bg-neutral-800 dark:hover:border-neutral-600 ${isDragging ? "z-20 opacity-40" : ""}`}>
    <div className="flex items-start gap-2"><GripVertical size={14} className="mt-0.5 shrink-0 text-stone-300" /><div className="min-w-0 flex-1"><p className="font-medium leading-snug">{item.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"><CalendarDays size={12} />{formatTripDate(item.startDateTime, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) })}</p>{location?.name && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400"><MapPin size={12} />{location.name}</p>}{item.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600 dark:bg-neutral-700 dark:text-stone-200">{tag}</span>)}</div> : null}</div></div>
  </button>;
}

function Column({ type, items, timezone, color, onColorChange, onSelect, onAddItem }: { type: string; items: TravelObject[]; timezone: string; color: string; onColorChange: (color: string) => void; onSelect: (item: TravelObject) => void; onAddItem: (type: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `type:${type}` });
  return <section ref={setNodeRef} className={`flex min-h-[220px] w-[270px] shrink-0 flex-col rounded-xl border bg-stone-50/80 p-2.5 transition-colors dark:bg-neutral-950/80 ${isOver ? "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/70" : ""}`}>
    <header className="flex items-center gap-2 px-1 pb-3"><input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} aria-label={`Change ${type} column color`} title="Change column color" className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0" /><h3 className="flex-1 text-sm font-semibold capitalize">{type}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500 dark:bg-neutral-800 dark:text-stone-300">{items.length}</span></header>
    <div className="flex flex-1 flex-col gap-2" onDoubleClick={() => onAddItem(type)} title="Double-click to add an item in this type">{items.map((item) => <Card key={item.id} item={item} timezone={timezone} color={color} onSelect={onSelect} />)}{items.length === 0 && <div className="grid flex-1 place-items-center rounded-lg border border-dashed text-xs text-stone-400 dark:text-stone-500">Double-click to add item</div>}</div>
  </section>;
}

export function KanbanView({ trip, items, eventTypes, typeColors, onSetTypeColor, onAddType, onSelect, onMoveType, onAddItem }: { trip: Trip; items: TravelObject[]; eventTypes: string[]; typeColors: Record<string, string>; onSetTypeColor: (type: string, color: string) => void; onAddType: (type: string) => void; onSelect: (item: TravelObject) => void; onMoveType: (item: TravelObject, type: string) => Promise<void>; onAddItem: (type?: string) => void }) {
  const types = [...new Set([...defaultTypes, ...eventTypes, ...items.map((item) => item.type)])];
  const [newType, setNewType] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  async function handleDragEnd(event: DragEndEvent) {
    const target = String(event.over?.id ?? "");
    if (!target.startsWith("type:")) return;
    const item = items.find((candidate) => candidate.id === String(event.active.id));
    const type = target.slice(5);
    if (item && item.type !== type) await onMoveType(item, type);
  }
  function createType(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const type = newType.trim().replace(/\s+/g, " ").slice(0, 20); if (!type) return; onAddType(type); setNewType(""); }
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">By event type</p><p className="mt-0.5 text-xs text-muted-foreground">Drag cards between columns · timezone: {trip.timezone}</p></div><div className="flex items-center gap-2"><form onSubmit={createType} className="flex gap-1"><input aria-label="New event type" value={newType} maxLength={20} onChange={(event) => setNewType(event.target.value)} placeholder="New type" className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm" /><Button type="submit" variant="outline" size="sm"><Plus /> Add type</Button></form><Button size="sm" onClick={() => onAddItem()}><Plus /> Add item</Button></div></div>
    <DndContext sensors={sensors} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="flex min-h-0 flex-1 items-start gap-3 overflow-auto p-4">{types.map((type) => { const color = typeColor(type, typeColors); return <Column key={type} type={type} color={color} onColorChange={(nextColor) => onSetTypeColor(type, nextColor)} items={items.filter((item) => item.type === type)} timezone={trip.timezone} onSelect={onSelect} onAddItem={onAddItem} />; })}</div></DndContext>
  </div>;
}
