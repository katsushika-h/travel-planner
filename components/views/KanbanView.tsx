"use client";

import { useEffect, useState, type FormEvent } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CalendarDays, GripVertical, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTripDate } from "@/lib/date-utils";
import { api } from "@/lib/api-client";
import { useTravelStore } from "@/store/use-travel-store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypes = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing"];
const defaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const palette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function typeColor(type: string, colors: Record<string, string>) { return colors[type] ?? defaultColors[type] ?? palette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; }

function Card({ item, timezone, color, selected, onSelect }: { item: TravelObject; timezone: string; color: string; selected: boolean; onSelect: (item: TravelObject, additive: boolean) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: item.id.startsWith("draft:") });
  const style = { borderLeft: `4px solid ${color}` };
  const location = item.location as { name?: string } | null;
  const dateLabel = item.startDateTime ? formatTripDate(item.startDateTime, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }) : "Unscheduled";
  return <button ref={setNodeRef} style={style} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} {...attributes} {...listeners} className={`w-full touch-none overflow-hidden rounded-xl border border-l-4 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:bg-neutral-800 dark:hover:border-neutral-600 ${selected ? "ring-2 ring-emerald-600 ring-offset-2" : ""} ${isDragging ? "opacity-40" : ""}`}>
    {item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}
    <div className="flex items-start gap-2 p-3"><GripVertical size={14} className="mt-0.5 shrink-0 text-stone-300" /><div className="min-w-0 flex-1"><p className="font-medium leading-snug">{item.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"><CalendarDays size={12} />{dateLabel}</p>{location?.name && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400"><MapPin size={12} />{location.name}</p>}{item.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600 dark:bg-neutral-700 dark:text-stone-200">{tag}</span>)}</div> : null}</div></div>
  </button>;
}

function DragPreview({ item, timezone, color }: { item: TravelObject; timezone: string; color: string }) {
  const location = item.location as { name?: string } | null;
  const dateLabel = item.startDateTime ? formatTripDate(item.startDateTime, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }) : "Unscheduled";
  return <div style={{ borderLeft: `4px solid ${color}` }} className="w-[270px] overflow-hidden rounded-xl border border-l-4 bg-white text-left shadow-xl dark:bg-neutral-800">
    {item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}
    <div className="flex items-start gap-2 p-3"><GripVertical size={14} className="mt-0.5 shrink-0 text-stone-300" /><div className="min-w-0 flex-1"><p className="font-medium leading-snug">{item.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"><CalendarDays size={12} />{dateLabel}</p>{location?.name && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400"><MapPin size={12} />{location.name}</p>}</div></div>
  </div>;
}

function Column({ type, items, timezone, color, selectedIds, removable, onColorChange, onRemove, onSelect, onAddItem }: { type: string; items: TravelObject[]; timezone: string; color: string; selectedIds: Set<string>; removable: boolean; onColorChange: (color: string) => void; onRemove: () => void; onSelect: (item: TravelObject, additive: boolean) => void; onAddItem: (type: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `type:${type}` });
  return <section ref={setNodeRef} className={`flex min-h-[220px] w-[270px] shrink-0 flex-col rounded-xl border bg-stone-50/80 p-2.5 transition-colors dark:bg-neutral-950/80 ${isOver ? "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/70" : ""}`}>
    <header className="flex items-center gap-2 px-1 pb-3"><input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} aria-label={`Change ${type} column color`} title="Change column color" className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0" /><h3 className="flex-1 text-sm font-semibold capitalize">{type}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500 dark:bg-neutral-800 dark:text-stone-300">{items.length}</span>{removable && <button type="button" onClick={onRemove} aria-label={`Remove ${type} type`} title="Remove type" className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 size={14} /></button>}</header>
    <div className="flex flex-1 flex-col gap-2">{items.map((item) => <Card key={item.id} item={item} timezone={timezone} color={color} selected={selectedIds.has(item.id)} onSelect={onSelect} />)}{items.length === 0 && <div className="grid flex-1 place-items-center rounded-lg border border-dashed text-xs text-stone-400 dark:text-stone-500">No items</div>}</div>
  </section>;
}

export function KanbanView({ trip, items, eventTypes, typeColors, onSetTypeColor, onAddType, onSelect, onMoveType }: { trip: Trip; items: TravelObject[]; eventTypes: string[]; typeColors: Record<string, string>; onSetTypeColor: (type: string, color: string) => void; onAddType: (type: string) => void; onSelect: (item: TravelObject) => void; onMoveType: (item: TravelObject, type: string) => Promise<void>; onAddItem?: (type?: string) => void }) {
  const types = [...new Set([...defaultTypes, ...eventTypes, ...items.map((item) => item.type)])];
  const [newType, setNewType] = useState("");
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<TravelObject[] | null>(null);
  const [pendingTypeRemoval, setPendingTypeRemoval] = useState<string | null>(null);
  const removeEventType = useTravelStore((state) => state.removeEventType);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  function handleDragStart(event: DragStartEvent) { setActiveItem(items.find((item) => item.id === String(event.active.id)) ?? null); }
  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const target = String(event.over?.id ?? "");
    if (!target.startsWith("type:")) return;
    const item = items.find((candidate) => candidate.id === String(event.active.id));
    const type = target.slice(5);
    if (item && item.type !== type) await onMoveType(item, type);
  }
  function createType(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const type = newType.trim().replace(/\s+/g, " ").slice(0, 20); if (!type) return; onAddType(type); setNewType(""); }
  function selectItem(item: TravelObject, additive: boolean) { setSelectedIds((current) => additive ? new Set(current.has(item.id) ? [...current].filter((id) => id !== item.id) : [...current, item.id]) : new Set([item.id])); onSelect(item); }
  async function removeType(type: string) { const affected = items.filter((item) => item.type === type); await Promise.all(affected.map((item) => api.updateObject(item.id, { type: "unclassified" }))); removeEventType(trip.id, type); window.location.reload(); }
  useEffect(() => { function handleDelete(event: KeyboardEvent) { if (event.key === "Escape") { setSelectedIds(new Set()); return; } if (event.key !== "Delete" || !selectedIds.size || event.defaultPrevented) return; const target = event.target; if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return; const selected = items.filter((item) => selectedIds.has(item.id)); if (!selected.length) return; event.preventDefault(); setPendingDelete(selected); } window.addEventListener("keydown", handleDelete); return () => window.removeEventListener("keydown", handleDelete); }, [items, selectedIds]);
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">By event type</p><p className="mt-0.5 text-xs text-muted-foreground">Drag cards between columns · timezone: {trip.timezone}</p></div><form onSubmit={createType} className="flex gap-1"><input aria-label="New event type" value={newType} maxLength={20} onChange={(event) => setNewType(event.target.value)} placeholder="New type" className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm" /><Button type="submit" variant="outline" size="sm"><Plus /> Add type</Button></form></div>
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragCancel={() => setActiveItem(null)} onDragEnd={(event) => { void handleDragEnd(event); }}><div className="flex min-h-0 flex-1 items-start gap-3 overflow-auto p-4">{types.map((type) => { const color = typeColor(type, typeColors); return <Column key={type} type={type} color={color} selectedIds={selectedIds} removable={!defaultTypes.includes(type)} onColorChange={(nextColor) => onSetTypeColor(type, nextColor)} onRemove={() => setPendingTypeRemoval(type)} items={items.filter((item) => item.type === type)} timezone={trip.timezone} onSelect={selectItem} onAddItem={() => undefined} />; })}</div><DragOverlay dropAnimation={null}>{activeItem ? <DragPreview item={activeItem} timezone={trip.timezone} color={typeColor(activeItem.type, typeColors)} /> : null}</DragOverlay></DndContext>{pendingDelete && <ConfirmDialog title="Delete selected items?" description="This cannot be undone." items={pendingDelete.map((item) => item.title)} onCancel={() => setPendingDelete(null)} onConfirm={() => { void Promise.all(pendingDelete.map((item) => api.deleteObject(item.id))).then(() => window.location.reload()); }} />}{pendingTypeRemoval && <ConfirmDialog title={`Remove ${pendingTypeRemoval} type?`} description="Items in this type will be reassigned to Unclassified." items={items.filter((item) => item.type === pendingTypeRemoval).map((item) => item.title)} onCancel={() => setPendingTypeRemoval(null)} onConfirm={() => { void removeType(pendingTypeRemoval); setPendingTypeRemoval(null); }} />}
  </div>;
}
