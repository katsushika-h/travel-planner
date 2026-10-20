"use client";

import dynamic from "next/dynamic";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Navigation, Plus } from "lucide-react";
import { ItemNoteCard } from "@/components/notes/ItemNoteCard";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { eventItems, isNote } from "@/lib/note-domain";
import { formatTripDate, shiftDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { flexibleDisplayTimes, itemDateSpan } from "@/lib/schedule-domain";
import { canDropInDayOrder, sameDayGapOrder, sortDayDisplayItems } from "@/lib/schedule-order";
import { dayHotels } from "@/lib/travel-legs";
import { markdownToPlainText } from "@/lib/text-utils";
import { typeColor } from "@/lib/type-color";
import { formatPlannedCost, stopNumbers } from "@/components/views/plan/plan-domain";
import { placeLabel } from "@/lib/place-label";
import { useTodayMark, type TodayMark } from "@/components/views/useTodayMark";
import { DayStrip } from "@/components/views/plan/DayStrip";
import type { LocationData, TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid min-h-80 flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

const savedScrollPositions = new Map<string, number>();

const phoneQuery = "(max-width: 639px)";
function subscribePhone(callback: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
/** True below 640px, where rows are compact and reorder/insert move behind a long-press. */
function usePhone() {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 8;

function tripDates(trip: Trip) {
  const dates: string[] = [];
  const end = trip.endDate.slice(0, 10);
  for (let date = trip.startDate.slice(0, 10); date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

function itemAppearsOnDate(item: TravelObject, date: string) {
  const { first, last } = itemDateSpan(item);
  return Boolean(first && first <= date && last && last >= date);
}

function safeMapsHref(location: LocationData | null | undefined, fallback: string) {
  if (location?.googleMapsUrl?.startsWith("https://") || location?.googleMapsUrl?.startsWith("http://"))
    return location.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location?.name || location?.address || fallback)}`;
}

function DropGap({
  date,
  order,
  onCreate,
  onAddNote,
}: {
  date: string;
  order: number;
  onCreate: (date: string, order: number) => void;
  onAddNote?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-list:${date}:${order}` });
  const action =
    "flex min-h-11 items-center px-2 text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline focus-visible:underline sm:min-h-7";
  return (
    <div
      ref={setNodeRef}
      className={`group/gap flex h-11 items-center gap-2 transition sm:h-7 ${isOver ? "bg-surface" : ""}`}
    >
      <span
        className={`h-px flex-1 ${isOver ? "bg-accent" : "bg-transparent group-hover/gap:bg-divider group-focus-within/gap:bg-divider"}`}
      />
      <div
        className={`flex items-center gap-1 transition-opacity ${isOver ? "opacity-100" : "opacity-0 group-hover/gap:opacity-100 group-focus-within/gap:opacity-100 [@media(hover:none)]:opacity-100"}`}
      >
        <button
          type="button"
          aria-label={`Add item at position ${order + 1}`}
          onClick={() => onCreate(date, order)}
          className={action}
        >
          Add event
        </button>
        {onAddNote && (
          <button type="button" aria-label={`Add note at position ${order + 1}`} onClick={onAddNote} className={action}>
            Add note
          </button>
        )}
      </div>
    </div>
  );
}

function DayItemDrop({ date, order, children }: { date: string; order: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-item:${date}:${order}` });
  return (
    <div ref={setNodeRef} className={isOver ? "ring-1 ring-inset ring-accent" : ""}>
      {children}
    </div>
  );
}

/** A day's items split around its hotels, as in the Plan view: last night's first, tonight's last. */
function dayAnchors(items: TravelObject[], date: string) {
  const { morning, evening } = dayHotels(items, date);
  const middle = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.id !== morning?.id && item.id !== evening?.id);
  // Numbers follow the cards as shown; a hotel kept for both nights is numbered once.
  const numbers = stopNumbers([
    ...(morning ? [morning] : []),
    ...eventItems(middle.map(({ item }) => item)),
    ...(evening && evening.id !== morning?.id ? [evening] : []),
  ]);
  return { morning, evening, middle, numbers };
}

/** Large mono start time in the Plan list: confirmed start, `~` derived time for flexible items, or a label. */
function timeLabel(item: TravelObject, flexibleTime?: string, anchor?: "start" | "end") {
  if (anchor) return { text: anchor === "start" ? "Start" : "End", flexible: false, small: true };
  if (item.isAllDay) return { text: "All day", flexible: false, small: true };
  if (item.startTime && item.endTime) return { text: item.startTime, flexible: false, small: false };
  if (flexibleTime) return { text: `~${flexibleTime}`, flexible: true, small: false };
  return { text: "Flexible", flexible: true, small: true };
}

type CardProps = {
  item: TravelObject;
  date: string;
  number: number | null;
  flexTime?: string;
  color: string;
  selected: boolean;
  primary: boolean;
  highlighted: boolean;
  /** A hotel pinned to the start (last night's) or end (tonight's) of the day. */
  anchor?: "start" | "end";
  phone: boolean;
  /** Phone, today's current or next stop during the trip: "now" / "next ~17:00" and its leave-by line. */
  markLabel?: string;
  markLeave?: string;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
  /** Phone long-press / context menu / Shift+F10: open the row's action sheet. */
  onActions: (item: TravelObject, date: string, anchor: "start" | "end" | undefined, trigger: HTMLElement) => void;
};

const JourneyCard = memo(function JourneyCard(props: CardProps) {
  return props.phone ? <PhoneJourneyRow {...props} /> : <DesktopJourneyCard {...props} />;
});

/** Whether the item has anything Maps can open: a saved URL, a name or an address. */
function hasPlace(item: TravelObject) {
  const location = item.location;
  return Boolean(location && (location.googleMapsUrl || location.name?.trim() || location.address?.trim()));
}

/** Compact two-line phone row: time, type dot, title over one muted meta line, navigate button. */
function PhoneJourneyRow({
  item,
  date,
  flexTime,
  color,
  selected,
  primary,
  anchor,
  markLabel,
  markLeave,
  onInspect,
  onActions,
}: CardProps) {
  const time = timeLabel(item, flexTime, anchor);
  const place = placeLabel(item);
  const cost = item.cost?.amount != null ? formatPlannedCost(item.cost.amount, item.cost.currency) : null;
  const located = hasPlace(item);
  const meta: ReactNode[] = [
    markLabel ? <span className="font-medium text-accent">{markLabel}</span> : null,
    markLeave ? <span className="font-medium text-foreground">{markLeave}</span> : null,
    place ?? item.type.charAt(0).toUpperCase() + item.type.slice(1),
    item.startTime && item.endTime && !item.isAllDay ? `until ${item.endTime}` : null,
    cost,
  ].filter(Boolean);
  if (!located) meta.push(<span className="text-accent">No location</span>);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const longPressed = useRef(false);
  const openActions = () => {
    if (buttonRef.current) onActions(item, date, anchor, buttonRef.current);
  };
  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  useEffect(() => cancelPress, []);
  return (
    <article
      id={anchor === "end" ? `day-card-${item.id}-end` : `day-card-${item.id}`}
      className={`relative flex min-h-[52px] items-stretch border-b border-divider bg-background select-none [-webkit-touch-callout:none] ${selected && !primary ? "ring-1 ring-inset ring-accent" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        data-item-content
        aria-haspopup="dialog"
        aria-keyshortcuts="Shift+F10 ContextMenu"
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onInspect(item);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          longPressed.current = false;
          cancelPress();
          press.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
              press.current = null;
              longPressed.current = true;
              openActions();
            }, LONG_PRESS_MS),
          };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(event) => {
          event.preventDefault();
          cancelPress();
          longPressed.current = true;
          openActions();
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            openActions();
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left select-none [-webkit-touch-callout:none]"
      >
        <span
          className={`min-w-10 shrink-0 font-mono tracking-tighter ${time.small ? "max-w-10 text-[11px] leading-tight" : "text-[13px]"} ${primary ? "text-accent" : time.flexible ? "text-muted" : ""}`}
        >
          {time.flexible && !time.small ? (
            <>
              <span className="sr-only">Approximately </span>
              {time.text}
            </>
          ) : (
            time.text
          )}
        </span>
        <span aria-hidden className="size-2 shrink-0" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-tight font-medium break-words">{item.title}</span>
          <span className="mt-0.5 block truncate text-xs leading-tight text-muted">
            {meta.map((part, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {part}
              </span>
            ))}
          </span>
        </span>
      </button>
      {located && (
        <a
          href={safeMapsHref(item.location, item.title)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.title} in Maps`}
          className="grid size-11 shrink-0 place-items-center self-center text-muted outline-none hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <Navigation aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
        </a>
      )}
    </article>
  );
}

/** Builds the sheet in its own render, so the (ref-using) action callbacks are only called from handlers. */
function SheetHost({
  build,
  triggerRef,
  onClose,
}: {
  build: () => { title: string; actions: SheetAction[] } | null;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: (restoreFocus: boolean) => void;
}) {
  const view = build();
  if (!view) return null;
  return <ActionSheet title={view.title} actions={view.actions} triggerRef={triggerRef} onClose={onClose} />;
}

const DesktopJourneyCard = memo(function DesktopJourneyCard({
  item,
  date,
  number,
  flexTime,
  color,
  selected,
  primary,
  highlighted,
  anchor,
  onSelect,
  onInspect,
  onHover,
}: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: anchor === "end" ? `agenda:${date}:${item.id}:end` : `agenda:${date}:${item.id}`,
    data: { item, draggedDate: date },
  });
  const location = placeLabel(item);
  const time = timeLabel(item, flexTime, anchor);
  const cost = item.cost?.amount != null ? formatPlannedCost(item.cost.amount, item.cost.currency) : null;
  const detail = [
    item.type.charAt(0).toUpperCase() + item.type.slice(1),
    item.startTime && item.endTime && !item.isAllDay ? `until ${item.endTime}` : null,
    location ?? null,
  ].filter(Boolean);
  const style: CSSProperties = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {};
  const active = primary || highlighted;
  return (
    <article
      id={anchor === "end" ? `day-card-${item.id}-end` : `day-card-${item.id}`}
      ref={setNodeRef}
      style={style}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-reorder-handle]")) return;
        onInspect(item);
      }}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      className={`relative border-b border-divider bg-background ${selected && !primary ? "ring-1 ring-inset ring-accent" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      {item.headerImage && (
        <button
          type="button"
          data-item-content
          onClick={(event) =>
            window.matchMedia("(max-width: 639px)").matches ? onInspect(item) : onSelect(item, event.shiftKey)
          }
          className="block h-36 w-full overflow-hidden text-left sm:h-44 in-data-[density=compact]:hidden"
        >
          <img src={item.headerImage} alt="" className="size-full object-cover" />
        </button>
      )}
      <div className="flex min-w-0 items-stretch">
        <button
          type="button"
          data-item-content
          onClick={(event) =>
            window.matchMedia("(max-width: 639px)").matches ? onInspect(item) : onSelect(item, event.shiftKey)
          }
          className="flex min-w-0 flex-1 items-start gap-3 py-4 in-data-[density=compact]:items-baseline in-data-[density=compact]:py-1 pr-2 text-left"
        >
          <span
            className={`w-[72px] shrink-0 font-mono ${time.small ? "pt-1.5 text-xs" : "text-[22px] font-light leading-8 in-data-[density=compact]:text-base in-data-[density=compact]:leading-6"} ${primary ? "text-accent" : time.flexible ? "text-muted" : ""}`}
          >
            {time.text}
          </span>
          <span className={`w-5 shrink-0 pt-1.5 font-mono text-[11px] ${active ? "text-accent" : "text-faint"}`}>
            {number != null ? String(number).padStart(2, "0") : "—"}
          </span>
          <span className="min-w-0 flex-1 in-data-[density=compact]:flex in-data-[density=compact]:items-baseline in-data-[density=compact]:gap-3">
            <span className="flex min-w-0 items-center gap-2 in-data-[density=compact]:shrink-0 in-data-[density=compact]:max-w-[55%]">
              <span aria-hidden className="size-2 shrink-0" style={{ backgroundColor: color }} />
              <span className="min-w-0 truncate text-[17px] font-medium leading-tight">{item.title}</span>
            </span>
            <span className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-muted in-data-[density=compact]:mt-0 in-data-[density=compact]:min-w-0 in-data-[density=compact]:flex-1 in-data-[density=compact]:text-xs">
              <span className="min-w-0 truncate">{detail.join(" · ")}</span>
              {cost && <span className="shrink-0 font-mono text-xs">{cost}</span>}
            </span>
            {!location && (
              <span className="mt-0.5 block text-xs text-accent in-data-[density=compact]:hidden">No location</span>
            )}
            {item.location?.openingHours?.[0] && (
              <span className="mt-1.5 line-clamp-1 block text-xs text-faint in-data-[density=compact]:hidden">
                {item.location.openingHours[0]}
              </span>
            )}
            {item.notes && (
              <span className="mt-2 line-clamp-2 block text-[13px] leading-relaxed text-muted in-data-[density=compact]:hidden">
                {markdownToPlainText(item.notes)}
              </span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end justify-between py-3 in-data-[density=compact]:flex-row in-data-[density=compact]:items-center in-data-[density=compact]:gap-1 in-data-[density=compact]:py-0">
          <button
            type="button"
            data-reorder-handle
            aria-label={`Reorder ${item.title}`}
            className="flex min-h-11 min-w-11 touch-none items-center justify-center text-faint hover:text-foreground active:cursor-grabbing sm:min-h-7 sm:min-w-7 sm:cursor-grab"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
          </button>
          {location && (
            <a
              href={safeMapsHref(item.location, item.title)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.title} in Maps`}
              className="px-1 py-2 in-data-[density=compact]:py-0 text-xs underline underline-offset-2 hover:text-accent max-sm:flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:justify-center"
            >
              Maps
            </a>
          )}
        </div>
      </div>
    </article>
  );
});

function DateSection({
  noteFocusId,
  onAddNote,
  onSaveNote,
  onDeleteNote,
  date,
  dayNumber,
  items,
  trip,
  typeColors,
  selectedIds,
  primarySelectedId,
  highlightedItemId,
  sectionRef,
  onSelect,
  onInspect,
  onHover,
  onCreate,
  onFocusDay,
  phone,
  mark,
  onActions,
}: {
  noteFocusId: string | null;
  onAddNote: (date: string, order: number) => void;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (note: TravelObject) => void;
  date: string;
  dayNumber: number;
  items: TravelObject[];
  trip: Trip;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  highlightedItemId: string | null;
  sectionRef: (node: HTMLElement | null) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
  onCreate: (date: string, order: number) => void;
  onFocusDay: () => void;
  phone: boolean;
  /** Set only on today's section while the trip is in progress. */
  mark: TodayMark | null;
  onActions: CardProps["onActions"];
}) {
  const gapOrder = (visibleGap: number) => sameDayGapOrder(items, date, visibleGap);
  const { setNodeRef: setSectionDropRef, isOver } = useDroppable({
    id: `day-section:${date}:${gapOrder(items.length)}`,
  });
  const events = eventItems(items);
  const { morning, evening, middle, numbers } = dayAnchors(items, date);
  const flexTimes = flexibleDisplayTimes(events);
  const fixedCount = items.filter((item) => item.startTime && item.endTime && !item.isAllDay).length;
  const fullLabel = formatTripDate(`${date}T12:00:00Z`, trip.timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const shortLabel = `${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short" })} ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { day: "numeric" })} ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { month: "short" })}`;
  const markFor = (item: TravelObject, anchor?: "start" | "end") =>
    mark && !anchor && mark.itemId === item.id
      ? {
          label: `${mark.kind}${mark.approximateTime ? ` ${mark.approximateTime}` : ""}`,
          leave: mark.leaveBy ? (mark.leaveNow ? "Leave now" : `Leave by ${mark.leaveBy}`) : undefined,
        }
      : undefined;
  // Pinned hotel cards sit outside the saved order, so they are not drop targets.
  const renderCard = (item: TravelObject, anchor?: "start" | "end") => (
    <JourneyCard
      key={anchor ? `${item.id}:${anchor}` : undefined}
      item={item}
      date={date}
      number={numbers.get(item.id) ?? null}
      flexTime={flexTimes.get(item.id)}
      color={typeColor(item.type, typeColors)}
      selected={selectedIds.has(item.id)}
      primary={primarySelectedId === item.id}
      highlighted={highlightedItemId === item.id}
      anchor={anchor}
      phone={phone}
      markLabel={markFor(item, anchor)?.label}
      markLeave={markFor(item, anchor)?.leave}
      onSelect={onSelect}
      onInspect={onInspect}
      onHover={onHover}
      onActions={onActions}
    />
  );
  return (
    <section
      ref={(node) => {
        sectionRef(node);
        setSectionDropRef(node);
      }}
      data-date={date}
      aria-label={fullLabel}
      className={`scroll-mt-0 pb-8 sm:min-h-[42vh] max-sm:last-of-type:min-h-[calc(100dvh-14rem)] ${isOver ? "bg-surface/60" : ""}`}
    >
      <header className={`sticky top-0 z-20 border-t bg-background ${isOver ? "border-accent" : "border-foreground"}`}>
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <button
            type="button"
            onClick={onFocusDay}
            aria-label={`Show all ${events.length} ${events.length === 1 ? "place" : "places"} for ${fullLabel} on the map`}
            className="min-h-11 min-w-0 flex-1 truncate px-4 text-left text-xs text-muted"
          >
            <h2 className="inline font-normal">
              <span className="font-medium text-foreground">{shortLabel}</span> · {events.length}{" "}
              {events.length === 1 ? "stop" : "stops"}
            </h2>
          </button>
          {items.length === 0 && (
            <>
              <button
                type="button"
                className="min-h-11 shrink-0 px-1.5 text-xs underline underline-offset-2"
                onClick={() => onCreate(date, gapOrder(items.length))}
              >
                Add event
              </button>
              <button
                type="button"
                className="mr-2.5 min-h-11 shrink-0 px-1.5 text-xs text-muted underline underline-offset-2"
                onClick={() => onAddNote(date, gapOrder(items.length))}
              >
                Add note
              </button>
            </>
          )}
        </div>
        <div className="hidden flex-wrap items-center justify-between gap-2 sm:flex">
          <button
            type="button"
            onClick={onFocusDay}
            aria-label={`Show all ${events.length} ${events.length === 1 ? "place" : "places"} for ${fullLabel} on the map`}
            className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-6 py-3.5 text-left hover:bg-surface"
          >
            <span className="flex min-w-0 items-baseline gap-3">
              <span className="shrink-0 font-mono text-xs text-faint">Day {dayNumber}</span>
              <h2 className="min-w-0 truncate text-[17px] font-medium">{fullLabel}</h2>
            </span>
            <span className="shrink-0 text-right text-xs text-muted">
              {events.length} {events.length === 1 ? "stop" : "stops"} · {fixedCount} fixed
            </span>
          </button>
        </div>
      </header>
      <div className="px-4 pt-1 sm:px-6">
        {morning && renderCard(morning, "start")}
        {middle.length ? (
          middle.map(({ item, index }) => (
            <div key={item.id}>
              {!phone && (
                <DropGap
                  date={date}
                  order={gapOrder(index)}
                  onCreate={onCreate}
                  onAddNote={() => onAddNote(date, gapOrder(index))}
                />
              )}
              <DayItemDrop date={date} order={gapOrder(index)}>
                {isNote(item) ? (
                  <ItemNoteCard
                    item={item}
                    date={date}
                    autoFocus={noteFocusId === item.id}
                    onSave={onSaveNote}
                    onDelete={() => onDeleteNote(item)}
                  />
                ) : (
                  renderCard(item)
                )}
              </DayItemDrop>
            </div>
          ))
        ) : (
          <div
            className={`mt-3 grid min-h-40 place-items-center border border-dashed px-4 text-center ${isOver ? "border-accent bg-surface" : "border-input-rule"}`}
          >
            <div>
              <p className="text-sm font-medium">Nothing planned</p>
              <p className="mt-1 text-xs text-muted">Drop an idea on this date or add an item.</p>
              <div className="mt-3">
                <DropGap date={date} order={0} onCreate={onCreate} onAddNote={() => onAddNote(date, 0)} />
              </div>
            </div>
          </div>
        )}
        {middle.length > 0 && !phone && (
          <DropGap
            date={date}
            order={gapOrder(items.length)}
            onCreate={onCreate}
            onAddNote={() => onAddNote(date, gapOrder(items.length))}
          />
        )}
        {evening && renderCard(evening, "end")}
      </div>
    </section>
  );
}

export function DayJourneyView({
  onCreateNote,
  onSaveNote,
  onDeleteNote,
  trip,
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  scrollRequest,
  onActiveDate,
  onSelect,
  onInspect,
  onCreateItem,
  onReorder,
  previewItem,
  mapOpen,
  onMapOpenChange,
  onLogExpense,
}: {
  onCreateNote: (date: string, order: number) => Promise<string | undefined>;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  scrollRequest: { date: string; nonce: number };
  onActiveDate: (date: string) => void;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onCreateItem: (date: string, order: number) => void;
  /** Move an item to a gap of its day (the same call as a drag-drop in Day). */
  onReorder: (item: TravelObject, date: string, order: number) => Promise<void>;
  /** A selected idea shown as a temporary pin on the day map. */
  previewItem?: TravelObject | null;
  /** Below `md` the itinerary and the day map share the screen; the app header toggles this. */
  mapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
  /** Phone: opens the Spend expense form, linked to the item when given. */
  onLogExpense?: (item: TravelObject | null) => void;
}) {
  const [noteFocusId, setNoteFocusId] = useState<string | null>(null);
  const [noteCreateError, setNoteCreateError] = useState("");
  const noteCreating = useRef(false);
  const [deletingNote, setDeletingNote] = useState<TravelObject | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const noteFocusRef = useRef<HTMLDivElement>(null);
  async function addNote(date: string, order: number) {
    if (noteCreating.current) return;
    noteCreating.current = true;
    setNoteCreateError("");
    try {
      const id = await onCreateNote(date, order);
      if (id) setNoteFocusId(id);
    } catch (cause) {
      setNoteCreateError(cause instanceof Error ? cause.message : "Could not add note.");
    } finally {
      noteCreating.current = false;
    }
  }
  const phone = usePhone();
  const [sheet, setSheet] = useState<{ itemId: string; date: string; anchor?: "start" | "end" } | "add" | null>(null);
  const sheetTrigger = useRef<HTMLElement | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const openItemActions = useCallback<CardProps["onActions"]>((item, date, anchor, trigger) => {
    sheetTrigger.current = trigger;
    setSheet({ itemId: item.id, date, anchor });
  }, []);
  const dates = useMemo(() => tripDates(trip), [trip]);
  const grouped = useMemo(
    () =>
      new Map(dates.map((date) => [date, sortDayDisplayItems(items.filter((item) => itemAppearsOnDate(item, date)))])),
    [dates, items],
  );
  const [activeDate, setActiveDate] = useState(() =>
    dates.includes(scrollRequest.date) ? scrollRequest.date : dates[0],
  );
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const mobileSurface = mapOpen ? "map" : "itinerary";
  const mapOpenRef = useRef(mapOpen);
  useEffect(() => {
    mapOpenRef.current = mapOpen;
  }, [mapOpen]);
  // Today in the trip timezone (honours the dev-only `?today=` clock); the Trip list flags the current/next stop on it.
  const { date: todayDate, mark } = useTodayMark(trip, items, phone);
  const today = todayDate;
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const handledInitialScroll = useRef(false);
  // Opening the Trip list on a phone during the trip lands on today instead of the remembered position.
  const initialScrollRequest = useRef(scrollRequest);
  const openAtToday = useRef(phone && dates.includes(todayDate) && !primarySelectedId);
  const activeDateRef = useRef(activeDate);
  const initialSelectionRef = useRef(primarySelectedId);
  const previousSelectionRef = useRef(primarySelectedId);
  const lastScrollTopRef = useRef(0);
  const focusedInitialSelectionRef = useRef(false);
  const onActiveDateRef = useRef(onActiveDate);
  useEffect(() => {
    onActiveDateRef.current = onActiveDate;
  }, [onActiveDate]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktopMapVisible(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const setActive = useCallback((date: string, recenter = false) => {
    const changed = activeDateRef.current !== date;
    if (changed) {
      activeDateRef.current = date;
      setActiveDate(date);
      setMapMoved(false);
      setRecenterToken((token) => token + 1);
      onActiveDateRef.current(date);
    } else if (recenter) {
      setMapMoved(false);
      setRecenterToken((token) => token + 1);
    }
  }, []);

  const detectActiveDate = useCallback(() => {
    const root = scrollRef.current;
    if (!root || root.clientHeight === 0) return;
    // While the phone shows the map, the list is only parked off-screen (to keep its scroll position).
    if (mapOpenRef.current && window.matchMedia("(max-width: 767px)").matches) return;
    const readingLine = root.getBoundingClientRect().top + 84;
    let next = dates[0];
    for (const date of dates) {
      const section = sectionRefs.current.get(date);
      if (!section) continue;
      if (section.getBoundingClientRect().top <= readingLine) next = date;
      else break;
    }
    setActive(next);
  }, [dates, setActive]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const restored = savedScrollPositions.get(trip.id);
    if (restored != null && !initialSelectionRef.current && !openAtToday.current) root.scrollTop = restored;
    lastScrollTopRef.current = root.scrollTop;
    detectActiveDate();
    const observer = new IntersectionObserver(() => detectActiveDate(), {
      root,
      rootMargin: "-80px 0px -65% 0px",
      threshold: [0, 1],
    });
    for (const section of sectionRefs.current.values()) observer.observe(section);
    const onScroll = () => {
      lastScrollTopRef.current = root.scrollTop;
      savedScrollPositions.set(trip.id, root.scrollTop);
      detectActiveDate();
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      savedScrollPositions.set(trip.id, root.scrollTop);
      root.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [detectActiveDate, trip.id]);

  useLayoutEffect(() => {
    const previous = previousSelectionRef.current;
    previousSelectionRef.current = primarySelectedId;
    if (!previous || primarySelectedId) return;
    const root = scrollRef.current;
    if (!root) return;
    const position = lastScrollTopRef.current;
    root.scrollTop = position;
    const frame = requestAnimationFrame(() => {
      root.scrollTop = position;
    });
    return () => cancelAnimationFrame(frame);
  }, [primarySelectedId]);

  const scrollToDate = useCallback((date: string, behavior: ScrollBehavior = "smooth") => {
    const root = scrollRef.current;
    const section = sectionRefs.current.get(date);
    if (!root || !section) return;
    root.scrollTo({
      top: root.scrollTop + section.getBoundingClientRect().top - root.getBoundingClientRect().top,
      behavior,
    });
  }, []);

  useEffect(() => {
    // Compared by identity so a repeated effect run (Strict Mode) stays on today; any later request moves on.
    if (openAtToday.current && scrollRequest === initialScrollRequest.current) {
      scrollToDate(todayDate, "auto");
      return;
    }
    if (!handledInitialScroll.current) {
      handledInitialScroll.current = true;
      if (savedScrollPositions.has(trip.id) && !initialSelectionRef.current) return;
    }
    scrollToDate(scrollRequest.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today only matters for the first scroll
  }, [scrollRequest, scrollToDate, trip.id]);

  useEffect(() => {
    if (focusedInitialSelectionRef.current) return;
    focusedInitialSelectionRef.current = true;
    const initialItemId = initialSelectionRef.current;
    if (!initialItemId) return;
    const selected = items.find((item) => item.id === initialItemId);
    const date = selected?.date?.slice(0, 10);
    if (!date || !dates.includes(date)) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`day-card-${initialItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [dates, items]);

  const activeItems = useMemo(() => eventItems(grouped.get(activeDate) ?? []), [activeDate, grouped]);
  const mappedItems = activeItems.filter((item) => hasMapCoordinates(item.location));
  const markerNumbers = useMemo(
    () => dayAnchors(grouped.get(activeDate) ?? [], activeDate).numbers,
    [activeDate, grouped],
  );

  function selectFromMap(item: TravelObject) {
    onSelect(item);
    document.getElementById(`day-card-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    onMapOpenChange(false);
  }

  /** Actions for the long-pressed row, or for the floating + (the end of the day in view). */
  function sheetContent(): { title: string; actions: SheetAction[] } | null {
    if (sheet === "add") {
      const list = grouped.get(activeDate) ?? [];
      const end = sameDayGapOrder(list, activeDate, list.length);
      const label = formatTripDate(`${activeDate}T12:00:00Z`, trip.timezone, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return {
        title: `Add to ${label}`,
        actions: [
          { id: "event", label: "Add event", onSelect: () => onCreateItem(activeDate, end) },
          { id: "note", label: "Add note", onSelect: () => void addNote(activeDate, end) },
          ...(onLogExpense
            ? [
                {
                  id: "expense",
                  label: "Add expense",
                  onSelect: () => onLogExpense(mark ? (items.find((item) => item.id === mark.itemId) ?? null) : null),
                },
              ]
            : []),
        ],
      };
    }
    const item = sheet ? items.find((candidate) => candidate.id === sheet.itemId) : null;
    if (!sheet || !item) return null;
    const { date } = sheet;
    const list = grouped.get(date) ?? [];
    const { middle } = dayAnchors(list, date);
    const position = sheet.anchor ? -1 : middle.findIndex((entry) => entry.item.id === item.id);
    const actions: SheetAction[] = [];
    if (position >= 0) {
      const index = middle[position].index;
      const gap = (visibleGap: number) => sameDayGapOrder(list, date, visibleGap);
      const previous = middle[position - 1];
      const next = middle[position + 1];
      // Same ordering rules as a drag-drop in Day: the target gap is before the neighbour above, or after the one below.
      const upOrder = previous ? gap(previous.index) : null;
      const downOrder = next ? gap(next.index + 1) : null;
      const canMove = (order: number | null) =>
        order != null && !item.isAllDay && (isNote(item) || canDropInDayOrder(items, item, date, order));
      actions.push(
        { id: "above", label: "Insert event above", onSelect: () => onCreateItem(date, gap(index)) },
        { id: "below", label: "Insert event below", onSelect: () => onCreateItem(date, gap(index + 1)) },
        { id: "note", label: "Insert note below", onSelect: () => void addNote(date, gap(index + 1)) },
        {
          id: "up",
          label: "Move up",
          disabled: !canMove(upOrder),
          restoreFocus: true,
          onSelect: () => void onReorder(item, date, upOrder!),
        },
        {
          id: "down",
          label: "Move down",
          disabled: !canMove(downOrder),
          restoreFocus: true,
          onSelect: () => void onReorder(item, date, downOrder!),
        },
      );
    }
    actions.push({ id: "open", label: "Open", onSelect: () => onInspect(item) });
    return { title: item.title, actions };
  }
  function closeSheet(restoreFocus: boolean) {
    const trigger = sheet === "add" ? fabRef.current : sheetTrigger.current;
    setSheet(null);
    if (restoreFocus) requestAnimationFrame(() => trigger?.focus());
  }

  function pickDay(date: string) {
    if (mapOpen) setActive(date, true);
    else scrollToDate(date);
  }

  // A hidden list loses its scroll position; return to the active day when it is shown again.
  const previousMapOpen = useRef(mapOpen);
  useLayoutEffect(() => {
    const wasOpen = previousMapOpen.current;
    previousMapOpen.current = mapOpen;
    if (!wasOpen || mapOpen) return;
    const date = activeDateRef.current;
    scrollToDate(date, "auto");
    // Note cards resize after the list is shown again, so settle on the day once more.
    const frame = requestAnimationFrame(() => scrollToDate(date, "auto"));
    return () => cancelAnimationFrame(frame);
  }, [mapOpen, scrollToDate]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {deletingNote && (
        <ConfirmDialog
          title="Delete note?"
          description="This permanently deletes this note. Other entries remain."
          pending={deletePending}
          error={deleteError}
          onCancel={() => setDeletingNote(null)}
          onConfirm={() => {
            if (deleteLock.current) return;
            deleteLock.current = true;
            setDeletePending(true);
            setDeleteError("");
            void onDeleteNote(deletingNote.id)
              .then(() => {
                setDeletingNote(null);
                noteFocusRef.current?.focus();
              })
              .catch((cause) => setDeleteError(cause instanceof Error ? cause.message : "Could not delete note."))
              .finally(() => {
                deleteLock.current = false;
                setDeletePending(false);
              });
          }}
        />
      )}
      <div ref={noteFocusRef} tabIndex={-1}>
        {noteCreateError && (
          <div role="alert" className="border-b border-divider px-4 py-2 text-xs text-danger">
            {noteCreateError} Try Add note again.
          </div>
        )}
      </div>
      <div className="shrink-0 border-b border-divider bg-background pl-2 sm:hidden">
        <DayStrip days={dates} activeDate={activeDate} today={today} variant="pills" onPick={pickDay} />
      </div>
      <div className="flex shrink-0 gap-6 border-b border-divider px-4 max-sm:hidden md:hidden">
        {(["itinerary", "map"] as const).map((surface) => (
          <button
            key={surface}
            type="button"
            aria-pressed={mobileSurface === surface}
            className={`min-h-11 min-w-11 border-b px-0.5 text-sm capitalize ${mobileSurface === surface ? "border-foreground font-medium" : "border-transparent text-muted"}`}
            onClick={() => onMapOpenChange(surface === "map")}
          >
            {surface}
          </button>
        ))}
      </div>
      {phone && sheet && (
        <SheetHost build={sheetContent} triggerRef={sheet === "add" ? fabRef : sheetTrigger} onClose={closeSheet} />
      )}
      {phone && !mapOpen && (
        <button
          ref={fabRef}
          type="button"
          aria-label="Add to this day"
          aria-haspopup="dialog"
          onClick={() => setSheet("add")}
          className="absolute right-4 bottom-4 z-30 grid size-12 place-items-center rounded-full bg-ink text-background shadow-[0_2px_10px_var(--scrim)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <Plus aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
      )}
      <div className="relative grid min-h-0 flex-1 md:grid-cols-[minmax(360px,44%)_minmax(0,1fr)]">
        <div
          ref={scrollRef}
          className={`${mobileSurface === "map" ? "max-md:invisible max-md:absolute max-md:inset-0" : "block"} min-h-0 overflow-y-auto [overflow-anchor:none] md:block`}
          aria-label="Continuous trip itinerary"
        >
          {dates.map((date, index) => (
            <DateSection
              noteFocusId={noteFocusId}
              onAddNote={(date, order) => void addNote(date, order)}
              onSaveNote={onSaveNote}
              onDeleteNote={(note) => {
                setDeleteError("");
                setDeletingNote(note);
              }}
              key={date}
              date={date}
              dayNumber={index + 1}
              items={grouped.get(date) ?? []}
              trip={trip}
              typeColors={typeColors}
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              highlightedItemId={hoveredItemId}
              sectionRef={(node) => {
                if (node) sectionRefs.current.set(date, node);
                else sectionRefs.current.delete(date);
              }}
              onSelect={onSelect}
              onInspect={onInspect}
              onHover={setHoveredItemId}
              onCreate={onCreateItem}
              onFocusDay={() => setActive(date, true)}
              phone={phone}
              mark={phone && date === todayDate ? mark : null}
              onActions={openItemActions}
            />
          ))}
          {/* Keeps the last row clear of the floating + button. */}
          <div aria-hidden className="h-24 sm:hidden" />
        </div>
        <section
          className={`${mobileSurface === "map" ? "flex" : "hidden"} relative min-h-0 flex-col overflow-hidden border-l border-divider md:flex`}
          aria-label={`Map for ${activeDate}`}
        >
          <header className="flex shrink-0 items-baseline justify-between gap-3 border-t border-foreground px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-medium">
                {formatTripDate(`${activeDate}T12:00:00Z`, trip.timezone, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {mappedItems.length} of {activeItems.length} {activeItems.length === 1 ? "place has" : "places have"}{" "}
                map coordinates
              </p>
            </div>
            {mapMoved && mappedItems.length > 0 && (
              <button
                type="button"
                className="min-h-11 shrink-0 text-sm underline underline-offset-2 hover:text-accent sm:min-h-8"
                onClick={() => {
                  setMapMoved(false);
                  setRecenterToken((token) => token + 1);
                }}
              >
                Recenter day
              </button>
            )}
          </header>
          {(desktopMapVisible || mobileSurface === "map") && (
            <LeafletMap
              trip={trip}
              items={mappedItems}
              typeColors={typeColors}
              markerNumbers={markerNumbers}
              selectedItemId={primarySelectedId}
              hoveredItemId={hoveredItemId}
              onHover={setHoveredItemId}
              onSelect={selectFromMap}
              fitKey={activeDate}
              recenterToken={recenterToken}
              onUserMove={() => setMapMoved(true)}
              previewItem={previewItem}
              className="min-h-72 flex-1"
            />
          )}
          {mappedItems.length === 0 && (
            <div className="pointer-events-none absolute inset-x-4 top-20 z-[500] border border-divider bg-background/90 px-4 py-3 text-center text-xs text-muted">
              No locations with coordinates for this day.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
