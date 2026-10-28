"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DisplayLeg, TravelMode } from "@/lib/routed-legs";
import type { TravelObject, UpdateTravelObjectInput } from "@/types/travel";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { markdownToPlainText } from "@/lib/text-utils";
import { LegLine } from "./LegLine";
import { ParkingControl } from "./ParkingControl";
import { formatPlannedCost, isConfirmedTime, safeMapsHref, stopMeta, stopTimeLabel } from "./plan-domain";

/** Hover-revealed insertion point between stops. Always visible on touch screens. */
export function AddGap({
  onAdd,
  onAddNote,
  label,
  noteLabel,
}: {
  onAdd: () => void;
  onAddNote?: () => void;
  label: string;
  noteLabel?: string;
}) {
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
        {onAddNote && (
          <button
            type="button"
            aria-label={noteLabel}
            onClick={onAddNote}
            className="flex min-h-11 items-center gap-1 bg-background px-3 text-xs text-muted opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-foreground sm:min-h-6 sm:px-2 sm:opacity-0 sm:group-hover/gap:opacity-100"
          >
            + Add note
          </button>
        )}
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
  onAddNote,
}: {
  date: string;
  order: number;
  empty: boolean;
  onAdd: () => void;
  onAddNote?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}:${order}` });
  return (
    <li
      ref={setNodeRef}
      className={`flex list-none items-center ${empty ? "min-h-28 flex-col justify-center gap-2" : "min-h-14"} ${isOver ? "shadow-[inset_0_2px_0_var(--accent)]" : ""}`}
    >
      {empty && <p className="text-sm text-muted">Nothing planned for this day.</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAdd}
          className="min-h-11 px-1 text-sm text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
        >
          + Add stop
        </button>
        {onAddNote && (
          <button
            type="button"
            onClick={onAddNote}
            className="min-h-11 px-1 text-sm text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
          >
            + Add note
          </button>
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
  color,
  flexTime,
  leg,
  nextTitle,
  selected,
  primary,
  expanded,
  hovered,
  driveMode = false,
  canFindParking = false,
  anchor,
  showParking = true,
  onChangeItem,
  onSetLegMode,
  onPick,
  onEdit,
  onHover,
  onFindNearby,
}: {
  item: TravelObject;
  date: string;
  order: number;
  number: number | null;
  /** Item type colour, shown as a stripe in the gutter left of the row. */
  color: string;
  /** Display time for a flexible stop, derived from list order (see `flexibleDisplayTimes`). */
  flexTime?: string;
  /** Walking estimate to the next stop, when there is one. */
  leg?: DisplayLeg;
  nextTitle?: string;
  selected: boolean;
  primary: boolean;
  expanded: boolean;
  hovered: boolean;
  /** Drive mode shows saved parking, the parking search and per-leg walk/drive choices. */
  driveMode?: boolean;
  /** Whether a drive arrives here (or the car starts here), so a parking search is offered. */
  canFindParking?: boolean;
  /** A hotel pinned to the start (last night's) or end (tonight's) of the day. It is not a drop target. */
  anchor?: "start" | "end";
  /** False on the end row when the same hotel already shows its parking on the start row. */
  showParking?: boolean;
  onChangeItem?: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
  onSetLegMode?: (leg: DisplayLeg, mode: TravelMode) => void;
  onPick: (item: TravelObject, additive: boolean) => void;
  onEdit: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
  /** Opens the Nearby tab searching around this stop; offered only when it has coordinates. */
  onFindNearby?: (item: TravelObject) => void;
}) {
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: anchor === "end" ? `${item.id}:${date}:end` : `${item.id}:${date}`,
    data: { item, draggedDate: date },
  });
  // Pinned hotel rows sit outside the saved order, so dropping onto them would land in the wrong place.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `trip-row:${date}:${order}`, disabled: !!anchor });
  const confirmed = isConfirmedTime(item);
  const cost =
    item.cost && typeof item.cost.amount === "number" ? formatPlannedCost(item.cost.amount, item.cost.currency) : "";
  const mapsHref = safeMapsHref(item.location);
  const accentWhenOpen = primary ? "text-accent" : null;
  const timeLabel = anchor === "start" ? "Start" : anchor === "end" ? "End" : stopTimeLabel(item, flexTime);
  // A multi-day hotel shows on several days, so row ids carry the date.
  const idSuffix = `-${date}${anchor === "end" ? "-end" : ""}`;
  const bodyId = `plan-stop-${item.id}${idSuffix}`;
  return (
    <li
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      id={`plan-row-${item.id}${idSuffix}`}
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
        // Double-click opens the editor, as in the old Day view; its two clicks leave the expansion as it was.
        onDoubleClick={() => onEdit(item)}
        {...listeners}
        className="relative grid w-full grid-cols-[76px_24px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-5 in-data-[density=compact]:py-2 text-left focus-visible:outline-2 focus-visible:outline-foreground sm:grid-cols-[112px_28px_minmax(0,1fr)_auto] sm:gap-x-4"
      >
        <span aria-hidden="true" className="absolute inset-y-0 -left-3 w-[3px]" style={{ backgroundColor: color }} />
        <span
          className={`font-mono font-light tracking-tight ${/^~?\d{2}:\d{2}$/.test(timeLabel) ? "text-xl sm:text-[28px] in-data-[density=compact]:text-base in-data-[density=compact]:sm:text-xl" : "text-base sm:text-xl in-data-[density=compact]:sm:text-base"} ${accentWhenOpen ?? (confirmed ? "text-foreground" : "text-muted")}`}
        >
          {timeLabel}
        </span>
        <span className={`font-mono text-xs ${accentWhenOpen ?? "text-faint"}`}>
          {number != null ? String(number).padStart(2, "0") : "—"}
        </span>
        <span className="flex min-w-0 flex-col gap-1 in-data-[density=compact]:gap-0">
          <span className="truncate text-base font-medium tracking-tight sm:text-lg in-data-[density=compact]:sm:text-base">
            {item.title}
          </span>
          <span className="truncate text-[13px] text-muted">{stopMeta(item)}</span>
        </span>
        <span className="font-mono text-[13px] text-muted">{cost}</span>
      </button>
      {expanded && (
        <div id={bodyId} className="flex flex-wrap gap-x-8 gap-y-3 pb-6 sm:pl-[156px]">
          <p className="min-w-0 flex-1 basis-60 whitespace-pre-wrap leading-relaxed text-muted">
            {(item.notes && markdownToPlainText(item.notes)) || "No notes yet."}
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
            {onFindNearby && hasMapCoordinates(item.location) && (
              <button
                type="button"
                onClick={() => onFindNearby(item)}
                className="flex min-h-11 items-center underline underline-offset-4 hover:text-accent sm:min-h-0"
              >
                Nearby
              </button>
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
      {driveMode && showParking && onChangeItem && (
        <ParkingControl item={item} canFind={canFindParking} onChangeItem={onChangeItem} />
      )}
      {leg && (
        <LegLine
          leg={leg}
          nextTitle={nextTitle ?? "the next stop"}
          onSetMode={driveMode && onSetLegMode ? (next) => onSetLegMode(leg, next) : undefined}
        />
      )}
    </li>
  );
}
