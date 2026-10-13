"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { compareScheduleOrder } from "@/lib/schedule-order";
import { typeColor, typeTextColor } from "@/lib/type-color";
import { useTravelStore } from "@/store/use-travel-store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TravelObject, Trip } from "@/types/travel";

const defaultTypes = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing"];
const emptyTypeOrder: string[] = [];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Sat 03" for a YYYY-MM-DD date string. */
export function shortDayLabel(date: string) {
  const day = date.slice(0, 10);
  const weekday = weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${day.slice(8, 10)}`;
}

/** Compact "when" label: "Idea" for unscheduled items, otherwise day plus time. */
export function itemWhenLabel(item: TravelObject) {
  if (!item.date) return "Idea";
  const first = item.date.slice(0, 10);
  const day = shortDayLabel(first);
  const last = item.endDate?.slice(0, 10) ?? first;
  if (item.isAllDay) return last !== first ? `${day} → ${shortDayLabel(last)}` : `${day} · All day`;
  if (item.startTime && item.endTime) return `${day} · ${item.startTime}`;
  if (item.startTime) return `${day} · after ${item.startTime}`;
  if (item.endTime) return `${day} · before ${item.endTime}`;
  return `${day} · ${item.placementTime ? `~${item.placementTime}` : "anytime"}`;
}

type BoardFilter = "all" | "scheduled" | "ideas";
const boardFilters: { value: BoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ideas", label: "Ideas only" },
];

function CardText({ item }: { item: TravelObject }) {
  const location = item.location as { name?: string } | null;
  return (
    <>
      <span className={`font-mono text-xs ${item.date ? "text-muted" : "text-accent"}`}>{itemWhenLabel(item)}</span>
      <span className="text-[15px] font-medium leading-snug">{item.title}</span>
      {location?.name && <span className="truncate text-xs text-muted">{location.name}</span>}
    </>
  );
}

function Card({
  item,
  selected,
  primary,
  onSelect,
}: {
  item: TravelObject;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled: item.id.startsWith("draft:"),
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `card:${item.id}` });
  return (
    <div
      ref={setDropRef}
      className={`relative ${isOver ? "before:absolute before:inset-x-0 before:-top-px before:z-20 before:border-t-2 before:border-foreground" : ""}`}
    >
      <button
        ref={setNodeRef}
        data-travel-object-id={item.id}
        onClick={(event) => onSelect(item, event.shiftKey)}
        onDoubleClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
        className={`flex w-full scroll-mx-4 touch-pan-y cursor-grab flex-col gap-1 border-b border-divider px-2 py-3 in-data-[density=compact]:py-1.5 text-left transition-colors hover:bg-surface sm:touch-none ${selected ? "bg-surface-selected" : ""} ${primary ? "shadow-[inset_2px_0_0_var(--accent)]" : ""} ${isDragging ? "opacity-40" : ""}`}
      >
        <CardText item={item} />
      </button>
    </div>
  );
}

function DragPreview({ item }: { item: TravelObject }) {
  return (
    <div className="flex w-[220px] flex-col gap-1 border border-foreground bg-background px-2 py-3 text-left shadow-md">
      <CardText item={item} />
    </div>
  );
}

function Column({
  type,
  items,
  color,
  headingColor,
  selectedIds,
  primarySelectedId,
  removable,
  onColorChange,
  onRemove,
  onSelect,
  onAdd,
}: {
  type: string;
  items: TravelObject[];
  color: string;
  headingColor: string;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  removable: boolean;
  onColorChange: (color: string) => void;
  onRemove: () => void;
  onSelect: (item: TravelObject, additive: boolean) => void;
  onAdd?: () => void;
}) {
  const { setNodeRef: setTypeDropRef, isOver } = useDroppable({ id: `type:${type}` });
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `column:${type}` });
  return (
    <section
      ref={(node) => {
        setTypeDropRef(node);
        setSortableRef(node);
      }}
      aria-label={type}
      style={{ transform: CSS.Transform.toString(transform), transition, borderTopColor: color }}
      className={`flex min-h-[160px] w-[220px] shrink-0 flex-col border-t-[3px] transition-colors sm:w-auto sm:min-w-[200px] sm:flex-1 ${isOver ? "bg-surface" : ""} ${isDragging ? "z-20 opacity-60" : ""}`}
    >
      <header
        {...attributes}
        {...listeners}
        className="flex touch-none cursor-grab items-center gap-2 pb-3.5 pt-3 active:cursor-grabbing"
      >
        <input
          type="color"
          value={color}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onColorChange(event.target.value)}
          aria-label={`Change ${type} column color`}
          title="Change column color"
          className="size-2 shrink-0 cursor-pointer appearance-none rounded-[2px] border-0 bg-transparent p-0 [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[2px] [&::-webkit-color-swatch]:border-0"
        />
        <h3 className="flex-1 text-[15px] font-semibold capitalize" style={{ color: headingColor }}>
          {type}
        </h3>
        <span className="font-mono text-xs text-muted">{items.length}</span>
        {removable && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRemove}
            aria-label={`Remove ${type} type`}
            title="Remove type"
            className="p-1 max-sm:grid max-sm:size-11 max-sm:place-items-center text-muted hover:bg-surface hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        )}
      </header>
      <div className="flex flex-col">
        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            primary={primarySelectedId === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
      {onAdd && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onAdd}
          aria-label={`Add ${type} item`}
          className="mt-2 self-start px-2 py-2 max-sm:min-h-11 text-[13px] text-muted hover:text-foreground"
        >
          + Add
        </button>
      )}
    </section>
  );
}

export function KanbanView({
  trip,
  items,
  eventTypes,
  typeColors,
  selectedIds,
  primarySelectedId,
  inspectedItemId,
  onSetTypeColor,
  onAddType,
  onSelect,
  onSelectForDrag,
  onMoveType,
  onReorder,
  onAddItem,
}: {
  trip: Trip;
  items: TravelObject[];
  eventTypes: string[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  inspectedItemId: string | null;
  onSetTypeColor: (type: string, color: string) => void;
  onAddType: (type: string) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onSelectForDrag: (item: TravelObject) => void;
  onMoveType: (item: TravelObject, type: string) => Promise<void>;
  onReorder: (item: TravelObject, date: string, order: number, clearTime?: boolean) => Promise<void>;
  onAddItem?: (type?: string) => void;
}) {
  const availableTypes = [...new Set([...defaultTypes, ...eventTypes, ...items.map((item) => item.type)])];
  const savedTypeOrder = useTravelStore((state) => state.eventTypeOrderByTrip?.[trip.id] ?? emptyTypeOrder);
  const setEventTypeOrder = useTravelStore((state) => state.setEventTypeOrder);
  const types = [
    ...savedTypeOrder.filter((type) => availableTypes.includes(type)),
    ...availableTypes.filter((type) => !savedTypeOrder.includes(type)),
  ];
  const theme = useTravelStore((state) => state.theme);
  const [filter, setFilter] = useState<BoardFilter>("all");
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
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const target = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-travel-object-id]") ?? [])].find(
          (element) => element.dataset.travelObjectId === inspectedItemId,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [inspectedItemId]);
  function finishDrag() {
    setActiveItem(null);
    setActiveType(null);
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  }
  function handleDragStart(event: DragStartEvent) {
    suppressClickRef.current = true;
    const activeId = String(event.active.id);
    if (activeId.startsWith("column:")) {
      setActiveType(activeId.slice(7));
      setActiveItem(null);
      return;
    }
    const item = items.find((candidate) => candidate.id === activeId) ?? null;
    setActiveItem(item);
    if (item && !selectedIds.has(item.id)) onSelectForDrag(item);
  }
  async function handleDragEnd(event: DragEndEvent) {
    finishDrag();
    const target = String(event.over?.id ?? "");
    const activeId = String(event.active.id);
    if (activeId.startsWith("column:")) {
      const sourceType = activeId.slice(7);
      const targetType = target.startsWith("column:")
        ? target.slice(7)
        : target.startsWith("type:")
          ? target.slice(5)
          : target.startsWith("card:")
            ? items.find((candidate) => candidate.id === target.slice(5))?.type
            : undefined;
      const from = types.indexOf(sourceType);
      const to = targetType ? types.indexOf(targetType) : -1;
      if (from >= 0 && to >= 0 && from !== to) setEventTypeOrder(trip.id, arrayMove(types, from, to));
      return;
    }
    const item = items.find((candidate) => candidate.id === activeId);
    if (target.startsWith("card:")) {
      const targetItem = items.find((candidate) => candidate.id === target.slice(5));
      if (item && targetItem && item.type !== targetItem.type) await onMoveType(item, targetItem.type);
      if (
        item &&
        targetItem &&
        !item.isAllDay &&
        item.id !== targetItem.id &&
        item.date !== null &&
        item.date === targetItem.date
      ) {
        const ordered = items.filter((candidate) => candidate.date === targetItem.date).sort(compareScheduleOrder);
        const order = Math.max(
          0,
          ordered.findIndex((candidate) => candidate.id === targetItem.id),
        );
        const date = targetItem.date?.slice(0, 10) ?? null;
        if (date) await onReorder(item, date, order);
      }
      return;
    }
    if (!target.startsWith("type:")) return;
    const type = target.slice(5);
    if (item && item.type !== type) await onMoveType(item, type);
  }
  function selectFromClick(item: TravelObject, additive: boolean) {
    if (!suppressClickRef.current) onSelect(item, additive);
  }
  function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const type = newType.trim().replace(/\s+/g, " ").slice(0, 20);
    if (!type) return;
    onAddType(type);
    setNewType("");
  }
  async function removeType(type: string) {
    const affected = items.filter((item) => item.type === type);
    await Promise.all(affected.map((item) => api.updateObject(item.id, { type: "unclassified" })));
    removeEventType(trip.id, type);
    window.location.reload();
  }
  const shownItems = items.filter((item) =>
    filter === "all" ? true : filter === "scheduled" ? item.date !== null : item.date === null,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 pb-5 pt-6 sm:px-12">
        <h1 className="text-[22px] font-medium tracking-tight">By type</h1>
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 text-sm">
          <div role="group" aria-label="Show items" className="flex gap-7">
            {boardFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`py-2 max-sm:min-h-11 max-sm:min-w-11 max-sm:px-1 ${filter === value ? "font-medium shadow-[inset_0_-1px_0_var(--ink)]" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={createType} className="flex min-w-0 items-baseline gap-3">
            <input
              aria-label="New event type"
              value={newType}
              maxLength={20}
              onChange={(event) => setNewType(event.target.value)}
              placeholder="New type"
              className="w-28 min-w-0 border-0 border-b border-input-rule bg-transparent py-1.5 max-sm:min-h-11 text-sm outline-none placeholder:text-faint focus:border-foreground"
            />
            <button type="submit" className="py-2 max-sm:min-h-11 max-sm:px-1 text-muted hover:text-foreground">
              + Add type
            </button>
          </form>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={finishDrag}
        onDragEnd={(event) => {
          void handleDragEnd(event);
        }}
      >
        <SortableContext items={types.map((type) => `column:${type}`)} strategy={horizontalListSortingStrategy}>
          <div ref={boardRef} className="flex min-h-0 flex-1 items-start gap-6 overflow-auto px-4 pb-12 sm:px-12">
            {types.map((type) => {
              const color = typeColor(type, typeColors);
              return (
                <Column
                  key={type}
                  type={type}
                  color={color}
                  headingColor={typeTextColor(color, theme)}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  removable={!defaultTypes.includes(type)}
                  onColorChange={(nextColor) => onSetTypeColor(type, nextColor)}
                  onRemove={() => setPendingTypeRemoval(type)}
                  items={shownItems.filter((item) => item.type === type)}
                  onSelect={selectFromClick}
                  onAdd={onAddItem ? () => onAddItem(type) : undefined}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <DragPreview item={activeItem} />
          ) : activeType ? (
            <div className="w-[220px] border border-foreground bg-background px-4 py-3 text-sm font-semibold capitalize shadow-md">
              {activeType}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {pendingTypeRemoval && (
        <ConfirmDialog
          title={`Remove ${pendingTypeRemoval} type?`}
          description="Items in this type will be reassigned to Unclassified."
          items={items.filter((item) => item.type === pendingTypeRemoval).map((item) => item.title)}
          onCancel={() => setPendingTypeRemoval(null)}
          onConfirm={() => {
            void removeType(pendingTypeRemoval);
            setPendingTypeRemoval(null);
          }}
        />
      )}
    </div>
  );
}
