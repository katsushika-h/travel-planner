"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { typeColor } from "@/lib/type-color";
import type { TravelObject } from "@/types/travel";
import { selectionRing } from "./calendar-shared";

function IdeaCard({
  item,
  color,
  selected,
  primary,
  onSelect,
  onInspect,
}: {
  item: TravelObject;
  color: string;
  selected: boolean;
  primary: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } });
  const place = item.location?.name ?? item.location?.address;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-idea-id={item.id}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item, event.shiftKey);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onInspect(item);
      }}
      style={{
        borderLeftColor: color,
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
      }}
      className={`w-full border-l-[3px] bg-surface px-3 py-2.5 text-left ${selectionRing(selected, primary)} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium">{item.title}</span>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-accent">Idea</span>
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-muted">{place || item.type}</span>
    </button>
  );
}

export function IdeasPanel({
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  position,
  onSelect,
  onInspect,
  onAdd,
  onClose,
}: {
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  /**
   * Where the panel docks: the left edge, beside the Day view timeline, or the right edge. On the right it floats over
   * the Plan map on phones and takes its own column from `md`, so the map's pins stay visible beside it.
   */
  position: "left" | "beside-timeline" | "right";
  /** Selects without opening the editor, so the idea's map pin stays in view. */
  onSelect: (item: TravelObject, additive?: boolean) => void;
  /** Opens the item editor (double-click). */
  onInspect: (item: TravelObject) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // The panel mounts only when opened, so focus the search box to let the user type straight away.
  // On close, the input unmounts; blur it first so focus never stays on a hidden element.
  useEffect(() => {
    const input = searchRef.current;
    input?.focus();
    return () => {
      if (document.activeElement === input) input?.blur();
    };
  }, []);
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" });
  const filtered = items.filter((item) =>
    `${item.title} ${item.type} ${item.location?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  // Type-ahead: a letter moves to the next idea whose title starts with it, wrapping around the list.
  function jumpToLetter(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || !/^[\p{L}\p{N}]$/u.test(event.key)) return;
    // Consume the key so it never also triggers a view shortcut.
    event.preventDefault();
    const letter = event.key.toLocaleLowerCase();
    const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.ideaId : undefined;
    const current = filtered.findIndex((item) => item.id === (focusedId ?? primarySelectedId));
    const match = [...filtered.slice(current + 1), ...filtered.slice(0, current + 1)].find((item) =>
      item.title.trim().toLocaleLowerCase().startsWith(letter),
    );
    if (!match) return;
    onSelect(match);
    event.currentTarget.querySelector<HTMLElement>(`[data-idea-id="${match.id}"]`)?.focus();
  }
  return (
    <aside
      ref={setNodeRef}
      data-map-overlay
      style={position === "beside-timeline" ? { left: "max(360px, 44%)" } : undefined}
      className={`absolute inset-y-0 z-[60] flex w-[min(88vw,320px)] flex-col border-divider bg-background ${position === "right" ? "right-0 border-l shadow-[-8px_0_24px_rgb(0_0_0/0.08)] md:static md:order-last md:w-60 md:shrink-0 md:shadow-none xl:w-80 dark:shadow-[-8px_0_24px_rgb(0_0_0/0.5)] md:dark:shadow-none" : "border-r shadow-[8px_0_24px_rgb(0_0_0/0.08)] dark:shadow-[8px_0_24px_rgb(0_0_0/0.5)]"} ${position === "left" ? "left-0" : ""} ${isOver ? "ring-1 ring-inset ring-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-foreground px-4 pb-3 pt-4">
        <div>
          <p className="text-[15px] font-medium">
            Ideas <span className="ml-1 font-mono text-sm font-normal text-muted">{items.length}</span>
          </p>
          <p className="mt-1 text-xs text-muted">Items without a day. Drag one onto a day; double-click to edit.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ideas"
          className="grid size-11 shrink-0 place-items-center text-muted hover:text-foreground sm:size-8"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      <label className="mx-4 mt-3 block">
        <span className="sr-only">Search ideas</span>
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ideas"
          className="h-9 w-full border-b border-input-rule bg-transparent text-sm outline-none placeholder:text-faint focus:border-foreground"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4" onKeyDown={jumpToLetter}>
        {filtered.map((item) => (
          <IdeaCard
            key={item.id}
            item={item}
            color={typeColor(item.type, typeColors)}
            selected={selectedIds.has(item.id)}
            primary={primarySelectedId === item.id}
            onSelect={onSelect}
            onInspect={onInspect}
          />
        ))}
        {filtered.length === 0 && (
          <p className="border border-dashed border-input-rule px-3 py-6 text-center text-xs text-muted">
            {items.length ? "No matching ideas" : "No ideas yet"}
          </p>
        )}
      </div>
      <div className="border-t border-divider p-4">
        <button
          type="button"
          onClick={onAdd}
          className="min-h-11 w-full border border-foreground text-sm hover:bg-surface sm:min-h-9"
        >
          Create idea
        </button>
        <p className="mt-2 text-center text-[11px] text-faint">Drop here to remove an item from the itinerary</p>
      </div>
    </aside>
  );
}
