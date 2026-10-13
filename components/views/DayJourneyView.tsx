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
  type CSSProperties,
  type ReactNode,
} from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { ItemNoteCard } from "@/components/notes/ItemNoteCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { eventItems, isNote } from "@/lib/note-domain";
import { formatTripDate, shiftDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { itemDateSpan } from "@/lib/schedule-domain";
import { sortDayDisplayItems } from "@/lib/schedule-order";
import { typeColor } from "@/lib/type-color";
import { flexibleDisplayTimes, formatPlannedCost, stopNumbers } from "@/components/views/plan/plan-domain";
import type { LocationData, TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid min-h-80 flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

const savedScrollPositions = new Map<string, number>();

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

/** Large mono start time in the Plan list: confirmed start, `~` placement for flexible items, or a label. */
function timeLabel(item: TravelObject, flexibleTime?: string) {
  if (item.isAllDay) return { text: "All day", flexible: false, small: true };
  if (item.startTime && item.endTime) return { text: item.startTime, flexible: false, small: false };
  const placement = flexibleTime ?? item.placementTime;
  if (placement) return { text: `~${placement}`, flexible: true, small: false };
  return { text: "Flexible", flexible: true, small: true };
}

const JourneyCard = memo(function JourneyCard({
  item,
  date,
  number,
  flexTime,
  color,
  selected,
  primary,
  highlighted,
  onSelect,
  onInspect,
  onHover,
}: {
  item: TravelObject;
  date: string;
  number: number | null;
  flexTime?: string;
  color: string;
  selected: boolean;
  primary: boolean;
  highlighted: boolean;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `agenda:${date}:${item.id}`,
    data: { item, draggedDate: date },
  });
  const location = item.location?.name ?? item.location?.address;
  const time = timeLabel(item, flexTime);
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
      id={`day-card-${item.id}`}
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
                {item.notes}
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
}) {
  const { setNodeRef: setSectionDropRef, isOver } = useDroppable({ id: `day-section:${date}:${items.length}` });
  const events = eventItems(items);
  const numbers = stopNumbers(events);
  const flexTimes = flexibleDisplayTimes(events);
  const fixedCount = items.filter((item) => item.startTime && item.endTime && !item.isAllDay).length;
  return (
    <section
      ref={(node) => {
        sectionRef(node);
        setSectionDropRef(node);
      }}
      data-date={date}
      aria-labelledby={`day-heading-${date}`}
      className={`min-h-[42vh] scroll-mt-0 pb-8 ${isOver ? "bg-surface/60" : ""}`}
    >
      <header className={`sticky top-0 z-20 border-t bg-background ${isOver ? "border-accent" : "border-foreground"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 max-sm:pb-2">
          <button
            type="button"
            onClick={onFocusDay}
            aria-label={`Show all ${events.length} ${events.length === 1 ? "place" : "places"} for ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })} on the map`}
            className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface max-sm:basis-full sm:px-6"
          >
            <span className="flex min-w-0 items-baseline gap-3">
              <span className="shrink-0 font-mono text-xs text-faint">Day {dayNumber}</span>
              <h2 id={`day-heading-${date}`} className="min-w-0 truncate text-[17px] font-medium">
                {formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
            </span>
            <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
              {events.length} {events.length === 1 ? "stop" : "stops"} · {fixedCount} fixed
            </span>
          </button>
          <button
            type="button"
            className="mr-1 min-h-11 px-2 text-[13px] underline underline-offset-2 sm:hidden"
            onClick={() => onCreate(date, items.length)}
          >
            Add event
          </button>
          <button
            type="button"
            className="mr-3 min-h-11 px-2 text-[13px] text-muted underline underline-offset-2 sm:hidden"
            onClick={() => onAddNote(date, items.length)}
          >
            Add note
          </button>
        </div>
      </header>
      <div className="px-4 pt-1 sm:px-6">
        {items.length ? (
          items.map((item, index) => (
            <div key={item.id}>
              <DropGap date={date} order={index} onCreate={onCreate} onAddNote={() => onAddNote(date, index)} />
              <DayItemDrop date={date} order={index}>
                {isNote(item) ? (
                  <ItemNoteCard
                    item={item}
                    date={date}
                    autoFocus={noteFocusId === item.id}
                    onSave={onSaveNote}
                    onDelete={() => onDeleteNote(item)}
                  />
                ) : (
                  <JourneyCard
                    item={item}
                    date={date}
                    number={numbers.get(item.id) ?? null}
                    flexTime={flexTimes.get(item.id)}
                    color={typeColor(item.type, typeColors)}
                    selected={selectedIds.has(item.id)}
                    primary={primarySelectedId === item.id}
                    highlighted={highlightedItemId === item.id}
                    onSelect={onSelect}
                    onInspect={onInspect}
                    onHover={onHover}
                  />
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
        {items.length > 0 && (
          <DropGap
            date={date}
            order={items.length}
            onCreate={onCreate}
            onAddNote={() => onAddNote(date, items.length)}
          />
        )}
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
  const [mobileSurface, setMobileSurface] = useState<"itinerary" | "map">("itinerary");
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const handledInitialScroll = useRef(false);
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
    if (restored != null && !initialSelectionRef.current) root.scrollTop = restored;
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
    if (!handledInitialScroll.current) {
      handledInitialScroll.current = true;
      if (savedScrollPositions.has(trip.id) && !initialSelectionRef.current) return;
    }
    scrollToDate(scrollRequest.date);
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
  const markerNumbers = useMemo(() => stopNumbers(activeItems), [activeItems]);

  function selectFromMap(item: TravelObject) {
    onSelect(item);
    document.getElementById(`day-card-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setMobileSurface("itinerary");
  }

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
      <div className="flex shrink-0 gap-6 border-b border-divider px-4 md:hidden">
        {(["itinerary", "map"] as const).map((surface) => (
          <button
            key={surface}
            type="button"
            aria-pressed={mobileSurface === surface}
            className={`min-h-11 min-w-11 border-b px-0.5 text-sm capitalize ${mobileSurface === surface ? "border-foreground font-medium" : "border-transparent text-muted"}`}
            onClick={() => setMobileSurface(surface)}
          >
            {surface}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(360px,44%)_minmax(0,1fr)]">
        <div
          ref={scrollRef}
          className={`${mobileSurface === "map" ? "hidden" : "block"} min-h-0 overflow-y-auto [overflow-anchor:none] md:block`}
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
            />
          ))}
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
