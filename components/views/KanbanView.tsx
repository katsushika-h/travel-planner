"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, GripVertical, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTripDate, startDateTimeFor } from "@/lib/date-utils";
import { api } from "@/lib/api-client";
import { compareScheduleOrder } from "@/lib/schedule-order";
import { typeColor } from "@/lib/type-color";
import { useTravelStore } from "@/store/use-travel-store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypes = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing"];
const emptyTypeOrder: string[] = [];
function itemDateLabel(item: TravelObject, timezone: string) {
  const start = startDateTimeFor(item, timezone);
  return start ? formatTripDate(start, timezone, { month: "short", day: "numeric", ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }) }) : "Unscheduled";
}

function Card({ item, timezone, color, selected, primary, onSelect }: { item: TravelObject; timezone: string; color: string; selected: boolean; primary: boolean; onSelect: (item: TravelObject, additive: boolean) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: item.id.startsWith("draft:") });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `card:${item.id}` });
  const location = item.location as { name?: string } | null;
  const dateLabel = itemDateLabel(item, timezone);
  return <div ref={setDropRef} className={`relative ${isOver ? "before:absolute before:inset-x-1 before:-top-1 before:z-20 before:border-t-2 before:border-emerald-500" : ""}`}><button ref={setNodeRef} data-travel-object-id={item.id} style={{ borderLeft: `4px solid ${color}` }} onClick={(event) => onSelect(item, event.shiftKey)} onDoubleClick={(event) => event.stopPropagation()} {...attributes} {...listeners} className={`w-full scroll-mx-4 touch-none overflow-hidden rounded-xl border border-l-4 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:bg-neutral-800 dark:hover:border-neutral-600 ${selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : ""} ${isDragging ? "opacity-40" : ""}`}>
    {item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}
    <div className="flex items-start gap-2 p-3"><GripVertical size={14} className="mt-0.5 shrink-0 text-stone-300" /><div className="min-w-0 flex-1"><p className="font-medium leading-snug">{item.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"><CalendarDays size={12} />{dateLabel}</p>{location?.name && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400"><MapPin size={12} />{location.name}</p>}{item.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600 dark:bg-neutral-700 dark:text-stone-200">{tag}</span>)}</div> : null}</div></div>
  </button></div>;
}

function DragPreview({ item, timezone, color }: { item: TravelObject; timezone: string; color: string }) {
  const location = item.location as { name?: string } | null;
  const dateLabel = itemDateLabel(item, timezone);
  return <div style={{ borderLeft: `4px solid ${color}` }} className="w-[270px] overflow-hidden rounded-xl border border-l-4 bg-white text-left shadow-xl dark:bg-neutral-800">
    {item.headerImage && <img src={item.headerImage} alt="" className="h-28 w-full object-cover" />}
    <div className="flex items-start gap-2 p-3"><GripVertical size={14} className="mt-0.5 shrink-0 text-stone-300" /><div className="min-w-0 flex-1"><p className="font-medium leading-snug">{item.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"><CalendarDays size={12} />{dateLabel}</p>{location?.name && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400"><MapPin size={12} />{location.name}</p>}</div></div>
  </div>;
}

function Column({ type, items, timezone, color, selectedIds, primarySelectedId, removable, onColorChange, onRemove, onSelect }: { type: string; items: TravelObject[]; timezone: string; color: string; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; removable: boolean; onColorChange: (color: string) => void; onRemove: () => void; onSelect: (item: TravelObject, additive: boolean) => void }) {
  const { setNodeRef: setTypeDropRef, isOver } = useDroppable({ id: `type:${type}` });
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: `column:${type}` });
  return <section ref={(node) => { setTypeDropRef(node); setSortableRef(node); }} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex min-h-[220px] w-[270px] shrink-0 flex-col rounded-xl border bg-stone-50/80 p-2.5 transition-colors dark:bg-neutral-950/80 ${isOver ? "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/70" : ""} ${isDragging ? "z-20 opacity-60 shadow-xl" : ""}`}>
    <header {...attributes} {...listeners} className="flex touch-none cursor-grab items-center gap-2 px-1 pb-3 active:cursor-grabbing"><GripVertical size={14} className="shrink-0 text-muted-foreground" /><input type="color" value={color} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onColorChange(event.target.value)} aria-label={`Change ${type} column color`} title="Change column color" className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0" /><h3 className="flex-1 text-sm font-semibold capitalize">{type}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500 dark:bg-neutral-800 dark:text-stone-300">{items.length}</span>{removable && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onRemove} aria-label={`Remove ${type} type`} title="Remove type" className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 size={14} /></button>}</header>
    <div className="flex flex-1 flex-col gap-2">{items.map((item) => <Card key={item.id} item={item} timezone={timezone} color={color} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} onSelect={onSelect} />)}{items.length === 0 && <div className="grid flex-1 place-items-center rounded-lg border border-dashed text-xs text-stone-400 dark:text-stone-500">No items</div>}</div>
  </section>;
}

export function KanbanView({ trip, items, eventTypes, typeColors, selectedIds, primarySelectedId, inspectedItemId, onSetTypeColor, onAddType, onSelect, onSelectForDrag, onMoveType, onReorder, onAddItem }: { trip: Trip; items: TravelObject[]; eventTypes: string[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; inspectedItemId: string | null; onSetTypeColor: (type: string, color: string) => void; onAddType: (type: string) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onSelectForDrag: (item: TravelObject) => void; onMoveType: (item: TravelObject, type: string) => Promise<void>; onReorder: (item: TravelObject, date: string, order: number, clearTime?: boolean) => Promise<void>; onAddItem?: (type?: string) => void }) {
  const availableTypes = [...new Set([...defaultTypes, ...eventTypes, ...items.map((item) => item.type)])];
  const savedTypeOrder = useTravelStore((state) => state.eventTypeOrderByTrip?.[trip.id] ?? emptyTypeOrder);
  const setEventTypeOrder = useTravelStore((state) => state.setEventTypeOrder);
  const types = [...savedTypeOrder.filter((type) => availableTypes.includes(type)), ...availableTypes.filter((type) => !savedTypeOrder.includes(type))];
  const [newType, setNewType] = useState("");
  const [activeItem, setActiveItem] = useState<TravelObject | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [pendingTypeRemoval, setPendingTypeRemoval] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const removeEventType = useTravelStore((state) => state.removeEventType);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  useEffect(() => {
    if (!inspectedItemId) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => { const target = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-travel-object-id]") ?? [])].find((element) => element.dataset.travelObjectId === inspectedItemId); target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }); });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [inspectedItemId]);
  function finishDrag() { setActiveItem(null); setActiveType(null); requestAnimationFrame(() => { suppressClickRef.current = false; }); }
  function handleDragStart(event: DragStartEvent) { suppressClickRef.current = true; const activeId = String(event.active.id); if (activeId.startsWith("column:")) { setActiveType(activeId.slice(7)); setActiveItem(null); return; } const item = items.find((candidate) => candidate.id === activeId) ?? null; setActiveItem(item); if (item && !selectedIds.has(item.id)) onSelectForDrag(item); }
  async function handleDragEnd(event: DragEndEvent) {
    finishDrag();
    const target = String(event.over?.id ?? "");
    const activeId = String(event.active.id);
    if (activeId.startsWith("column:")) {
      const sourceType = activeId.slice(7);
      const targetType = target.startsWith("column:") ? target.slice(7) : target.startsWith("type:") ? target.slice(5) : target.startsWith("card:") ? items.find((candidate) => candidate.id === target.slice(5))?.type : undefined;
      const from = types.indexOf(sourceType); const to = targetType ? types.indexOf(targetType) : -1;
      if (from >= 0 && to >= 0 && from !== to) setEventTypeOrder(trip.id, arrayMove(types, from, to));
      return;
    }
    const item = items.find((candidate) => candidate.id === activeId);
    if (target.startsWith("card:")) {
      const targetItem = items.find((candidate) => candidate.id === target.slice(5));
      if (item && targetItem && item.type !== targetItem.type) await onMoveType(item, targetItem.type);
      if (item && targetItem && !item.isAllDay && item.id !== targetItem.id && item.date !== null && item.date === targetItem.date) {
        const ordered = items.filter((candidate) => candidate.date === targetItem.date).sort(compareScheduleOrder);
        const order = Math.max(0, ordered.findIndex((candidate) => candidate.id === targetItem.id));
        const date = targetItem.date?.slice(0, 10) ?? null;
        if (date) await onReorder(item, date, order);
      }
      return;
    }
    if (!target.startsWith("type:")) return;
    const type = target.slice(5);
    if (item && item.type !== type) await onMoveType(item, type);
  }
  function selectFromClick(item: TravelObject, additive: boolean) { if (!suppressClickRef.current) onSelect(item, additive); }
  function createType(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const type = newType.trim().replace(/\s+/g, " ").slice(0, 20); if (!type) return; onAddType(type); setNewType(""); }
  async function removeType(type: string) { const affected = items.filter((item) => item.type === type); await Promise.all(affected.map((item) => api.updateObject(item.id, { type: "unclassified" }))); removeEventType(trip.id, type); window.location.reload(); }
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">By event type</p><p className="mt-0.5 text-xs text-muted-foreground">Drag cards between columns · timezone: {trip.timezone}</p></div><div className="flex gap-1"><Button type="button" onClick={() => onAddItem?.()}><Plus /> Add item</Button><form onSubmit={createType} className="flex gap-1"><input aria-label="New event type" value={newType} maxLength={20} onChange={(event) => setNewType(event.target.value)} placeholder="New type" className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm" /><Button type="submit" variant="outline" size="sm"><Plus /> Add type</Button></form></div></div>
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragCancel={finishDrag} onDragEnd={(event) => { void handleDragEnd(event); }}><SortableContext items={types.map((type) => `column:${type}`)} strategy={horizontalListSortingStrategy}><div ref={boardRef} className="flex min-h-0 flex-1 items-start gap-3 overflow-auto p-4">{types.map((type) => { const color = typeColor(type, typeColors); return <Column key={type} type={type} color={color} selectedIds={selectedIds} primarySelectedId={primarySelectedId} removable={!defaultTypes.includes(type)} onColorChange={(nextColor) => onSetTypeColor(type, nextColor)} onRemove={() => setPendingTypeRemoval(type)} items={items.filter((item) => item.type === type)} timezone={trip.timezone} onSelect={selectFromClick} />; })}</div></SortableContext><DragOverlay dropAnimation={null}>{activeItem ? <DragPreview item={activeItem} timezone={trip.timezone} color={typeColor(activeItem.type, typeColors)} /> : activeType ? <div className="w-[270px] rounded-xl border bg-background px-4 py-3 text-sm font-semibold capitalize shadow-xl">{activeType}</div> : null}</DragOverlay></DndContext>{pendingTypeRemoval && <ConfirmDialog title={`Remove ${pendingTypeRemoval} type?`} description="Items in this type will be reassigned to Unclassified." items={items.filter((item) => item.type === pendingTypeRemoval).map((item) => item.title)} onCancel={() => setPendingTypeRemoval(null)} onConfirm={() => { void removeType(pendingTypeRemoval); setPendingTypeRemoval(null); }} />}
  </div>;
}
