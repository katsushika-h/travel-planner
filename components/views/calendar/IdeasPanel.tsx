"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Lightbulb, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { typeColor } from "@/lib/type-color";
import type { TravelObject } from "@/types/travel";
import { selectionRing } from "./calendar-shared";

function IdeaCard({
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } });
  const place = item.location?.name ?? item.location?.address;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item, event.shiftKey);
      }}
      style={{
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
      }}
      className={`w-full rounded-lg border border-l-4 bg-background px-3 py-2.5 text-left shadow-sm ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="block truncate text-xs font-semibold">{item.title}</span>
      <span className="mt-1 block truncate text-[10px] text-muted-foreground">{place || item.type}</span>
    </button>
  );
}

export function IdeasPanel({
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  besideTimeline,
  onSelect,
  onAdd,
  onClose,
}: {
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  besideTimeline: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" });
  const filtered = items.filter((item) =>
    `${item.title} ${item.type} ${item.location?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <aside
      ref={setNodeRef}
      style={besideTimeline ? { left: "max(280px, 28.5%)" } : undefined}
      className={`absolute inset-y-0 z-40 flex w-[min(88vw,320px)] flex-col border-r bg-stone-50/95 shadow-xl backdrop-blur dark:bg-neutral-950/95 ${besideTimeline ? "" : "left-0"} ${isOver ? "ring-2 ring-inset ring-emerald-500" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb size={14} /> Ideas{" "}
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
              {items.length}
            </span>
          </p>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Created and imported items without a day
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close ideas">
          <X />
        </Button>
      </div>
      <label className="relative mx-3 mt-3">
        <Search
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ideas"
          className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:border-emerald-600"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.map((item) => (
          <IdeaCard
            key={item.id}
            item={item}
            color={typeColor(item.type, typeColors)}
            selected={selectedIds.has(item.id)}
            primary={primarySelectedId === item.id}
            onSelect={onSelect}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {items.length ? "No matching ideas" : "No ideas yet"}
          </p>
        )}
      </div>
      <div className="border-t p-3">
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAdd}>
          <Plus size={14} /> Create idea
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Drop here to remove an item from the itinerary
        </p>
      </div>
    </aside>
  );
}
