"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { TravelObject } from "@/types/travel";
import { formatPlannedCost, isConfirmedTime, safeMapsHref, stopMeta, stopTimeLabel } from "./plan-domain";

/** Hover-revealed insertion point between stops. Always visible on touch screens. */
export function AddGap({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <li className="relative h-11 list-none sm:h-0">
      <div className="group/gap absolute inset-x-0 top-1/2 z-10 flex h-11 -translate-y-1/2 items-center justify-center sm:h-6">
        <button
          type="button"
          aria-label={label}
          onClick={onAdd}
          className="flex min-h-11 items-center gap-1 bg-background px-3 text-xs text-muted opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-foreground sm:min-h-6 sm:px-2 sm:opacity-0 sm:group-hover/gap:opacity-100"
        >
          + Add stop
        </button>
      </div>
    </li>
  );
}

/** Empty day or end of day: also the drop target for "last in this day". */
export function EndSlot({
  date,
  order,
  empty,
  onAdd,
}: {
  date: string;
  order: number;
  empty: boolean;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}:${order}` });
  return (
    <li
      ref={setNodeRef}
      className={`flex list-none items-center ${empty ? "min-h-28 flex-col justify-center gap-2" : "min-h-14"} ${isOver ? "shadow-[inset_0_2px_0_var(--accent)]" : ""}`}
    >
      {empty && <p className="text-sm text-muted">Nothing planned for this day.</p>}
      <button
        type="button"
        onClick={onAdd}
        className="min-h-11 px-1 text-sm text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
      >
        + Add stop
      </button>
    </li>
  );
}

export function NoteBlock({ item, date, order }: { item: TravelObject; date: string; order: number }) {
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `${item.id}:${date}`,
    data: { item, draggedDate: date },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `trip-row:${date}:${order}` });
  const title = item.title && item.title !== "Note" ? item.title : null;
  return (
    <li
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      data-travel-object-id={item.id}
      {...listeners}
      className={`border-b border-divider py-3 ${isDragging ? "opacity-40" : ""} ${isOver ? "shadow-[inset_0_2px_0_var(--accent)]" : ""}`}
    >
      <div className="border border-dashed border-input-rule px-4 py-3 text-sm sm:ml-[156px]">
        {title && <p className="font-medium">{title}</p>}
        {item.noteBody ? (
          <p className="whitespace-pre-wrap leading-relaxed text-muted">{item.noteBody}</p>
        ) : (
          !title && <p className="text-faint">Empty note</p>
        )}
      </div>
    </li>
  );
}

/** One stop: large time, map number, title and meta, planned cost; expands to notes with Maps and Edit. */
export function StopRow({
  item,
  date,
  order,
  number,
  flexTime,
  selected,
  primary,
  expanded,
  hovered,
  onPick,
  onEdit,
  onHover,
}: {
  item: TravelObject;
  date: string;
  order: number;
  number: number | null;
  /** Display time for a flexible stop, derived from list order (see `flexibleDisplayTimes`). */
  flexTime?: string;
  selected: boolean;
  primary: boolean;
  expanded: boolean;
  hovered: boolean;
  onPick: (item: TravelObject, additive: boolean) => void;
  onEdit: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
}) {
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `${item.id}:${date}`,
    data: { item, draggedDate: date },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `trip-row:${date}:${order}` });
  const confirmed = isConfirmedTime(item);
  const cost =
    item.cost && typeof item.cost.amount === "number" ? formatPlannedCost(item.cost.amount, item.cost.currency) : "";
  const mapsHref = safeMapsHref(item.location);
  const accentWhenOpen = primary ? "text-accent" : null;
  const timeLabel = stopTimeLabel(item, flexTime);
  const bodyId = `plan-stop-${item.id}`;
  return (
    <li
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      id={`plan-row-${item.id}`}
      data-travel-object-id={item.id}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      className={`border-b border-divider ${selected && !primary ? "bg-surface-selected" : hovered ? "bg-surface" : ""} ${isDragging ? "opacity-40" : ""} ${isOver ? "shadow-[inset_0_2px_0_var(--accent)]" : ""}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? bodyId : undefined}
        onClick={(event) => onPick(item, event.shiftKey || event.metaKey || event.ctrlKey)}
        {...listeners}
        className="grid w-full grid-cols-[76px_24px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-5 text-left focus-visible:outline-2 focus-visible:outline-foreground sm:grid-cols-[112px_28px_minmax(0,1fr)_auto] sm:gap-x-4"
      >
        <span
          className={`font-mono font-light tracking-tight ${/^~?\d{2}:\d{2}$/.test(timeLabel) ? "text-xl sm:text-[28px]" : "text-base sm:text-xl"} ${accentWhenOpen ?? (confirmed ? "text-foreground" : "text-muted")}`}
        >
          {timeLabel}
        </span>
        <span className={`font-mono text-xs ${accentWhenOpen ?? "text-faint"}`}>
          {number != null ? String(number).padStart(2, "0") : "—"}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-base font-medium tracking-tight sm:text-lg">{item.title}</span>
          <span className="truncate text-[13px] text-muted">{stopMeta(item)}</span>
        </span>
        <span className="font-mono text-[13px] text-muted">{cost}</span>
      </button>
      {expanded && (
        <div id={bodyId} className="flex flex-wrap gap-x-8 gap-y-3 pb-6 sm:pl-[156px]">
          <p className="min-w-0 flex-1 basis-60 whitespace-pre-wrap leading-relaxed text-muted">
            {item.notes || "No notes yet."}
          </p>
          <div className="flex items-start gap-5 text-sm">
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center underline underline-offset-4 hover:text-accent sm:min-h-0"
              >
                Maps
              </a>
            )}
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="flex min-h-11 items-center underline underline-offset-4 hover:text-accent sm:min-h-0"
            >
              Edit
            </button>
          </div>
        </div>
      )}
      {/* Reserved: a travel-time line (walking leg to the next stop) arrives with WS7 and renders here. */}
    </li>
  );
}
