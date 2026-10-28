"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { ItemNoteCard } from "@/components/notes/ItemNoteCard";
import type { SheetAction } from "@/components/ui/ActionSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatTripDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { isNote } from "@/lib/note-domain";
import type { DisplayLeg, TravelMode } from "@/lib/routed-legs";
import { occursOnItineraryDate } from "@/lib/schedule-domain";
import { canDropInDayOrder, compareScheduleOrder, sameDayGapOrder } from "@/lib/schedule-order";
import { dayHotels } from "@/lib/travel-legs";
import { typeColor } from "@/lib/type-color";
import { usePhone } from "@/components/views/calendar/usePhone";
import { useTodayMark, type TodayMark } from "@/components/views/useTodayMark";
import type { TravelObject, Trip, UpdateTravelObjectInput } from "@/types/travel";
import { DayStrip } from "./DayStrip";
import { PhoneJourneyRow, SheetHost } from "./PhoneJourneyRow";
import { tripDays } from "./plan-domain";
import { AddGap, EndSlot, StopRow } from "./StopRow";
import { useDayPlan } from "./useDayPlan";

/** Where each trip's list was last scrolled, with the day in view, so coming back to Plan resumes there. */
const savedScrollPositions = new Map<string, { top: number; date: string }>();

/** Asks the list to scroll to a day, or to one stop (centred). A new `nonce` repeats the request. */
export type ScrollRequest = { date: string; nonce: number; itemId?: string };

/** The stop expanded in the list, by day because a multi-day hotel shows on several days. */
export type ExpandedStop = { id: string; date: string };

type RowActions = (item: TravelObject, date: string, anchor: "start" | "end" | undefined, trigger: HTMLElement) => void;

const rowDropClass = "shadow-[inset_0_2px_0_var(--accent)]";

/** A list row that is a drop target for "insert before (or, in the lower half, after) this one". */
function DropRow({
  date,
  order,
  className = "",
  children,
}: {
  date: string;
  order: number;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-row:${date}:${order}` });
  return (
    <li ref={setNodeRef} className={`list-none ${className} ${isOver ? rowDropClass : ""}`}>
      {children}
    </li>
  );
}

/** A phone day with nothing in it: a drop target for the day and the places to add something. */
function PhoneEmptyDay({ date, onAdd, onAddNote }: { date: string; onAdd: () => void; onAddNote: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}:0` });
  const action =
    "flex min-h-11 items-center px-2 text-xs text-muted underline underline-offset-2 hover:text-foreground";
  return (
    <li
      ref={setNodeRef}
      className={`mt-3 grid min-h-40 list-none place-items-center border border-dashed px-4 text-center ${isOver ? "border-accent bg-surface" : "border-input-rule"}`}
    >
      <div>
        <p className="text-sm font-medium">Nothing planned</p>
        <p className="mt-1 text-xs text-muted">Drop an idea on this date or add an item.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" className={action} onClick={onAdd}>
            Add event
          </button>
          <button type="button" className={action} onClick={onAddNote}>
            Add note
          </button>
        </div>
      </div>
    </li>
  );
}

type RowHandlers = {
  onPick: (item: TravelObject, additive: boolean, date: string) => void;
  onEdit: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
  onChangeItem: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
  onSetLegMode: (leg: DisplayLeg, mode: TravelMode) => void;
  onCreateItem: (date: string, order: number) => void;
  onAddNote: (date: string, order: number) => void;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (note: TravelObject) => void;
  onActions: RowActions;
  onFindNearby?: (item: TravelObject) => void;
};

function DateSection({
  date,
  dayNumber,
  items,
  trip,
  typeColors,
  selectedIds,
  primarySelectedId,
  expanded,
  hoveredId,
  mode,
  overrides,
  noteFocusId,
  scrollRef,
  sectionRef,
  handlers,
  onFocusDay,
  phone,
  mark,
}: {
  date: string;
  dayNumber: number;
  /** The day's items in saved order, notes included. */
  items: TravelObject[];
  trip: Trip;
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  expanded: ExpandedStop | null;
  hoveredId: string | null;
  mode: TravelMode;
  overrides: Record<string, TravelMode> | undefined;
  noteFocusId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  sectionRef: (node: HTMLElement | null) => void;
  handlers: RowHandlers;
  onFocusDay: () => void;
  phone: boolean;
  /** Set only on today's section while the trip is in progress. */
  mark: TodayMark | null;
}) {
  // Routing starts when the section is first within reach of the viewport and then stays on, so a long trip does
  // not route every day at load and rows already shown never lose their legs. Phone rows show no legs.
  const nodeRef = useRef<HTMLElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = nodeRef.current;
    if (near || phone || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { root: scrollRef.current, rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, phone, scrollRef]);
  const plan = useDayPlan(items, date, mode, overrides, near && !phone);
  const { morning, evening, middleRows, events } = plan;
  const { onAddNote, onCreateItem } = handlers;
  const fixedCount = items.filter((item) => item.startTime && item.endTime && !item.isAllDay).length;
  const fullLabel = formatTripDate(`${date}T12:00:00Z`, trip.timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const shortLabel = `${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "short" })} ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { day: "numeric" })} ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { month: "short" })}`;
  // Saved orders count only the items dated on this day, so a hotel carried over from before is skipped.
  const savedOrder = (visibleGap: number) => sameDayGapOrder(items, date, visibleGap);
  const markFor = (item: TravelObject, anchor?: "start" | "end") =>
    mark && !anchor && mark.itemId === item.id
      ? {
          label: `${mark.kind}${mark.approximateTime ? ` ${mark.approximateTime}` : ""}`,
          leave: mark.leaveBy ? (mark.leaveNow ? "Leave now" : `Leave by ${mark.leaveBy}`) : undefined,
        }
      : undefined;
  const renderStop = (item: TravelObject, order: number, anchor?: "start" | "end") => {
    const stopMark = markFor(item, anchor);
    if (phone)
      return (
        <PhoneJourneyRow
          item={item}
          date={date}
          flexTime={plan.flexTimes.get(item.id)}
          color={typeColor(item.type, typeColors)}
          selected={selectedIds.has(item.id)}
          primary={primarySelectedId === item.id}
          anchor={anchor}
          markLabel={stopMark?.label}
          markLeave={stopMark?.leave}
          onInspect={handlers.onEdit}
          onActions={handlers.onActions}
        />
      );
    return (
      <StopRow
        item={item}
        date={date}
        order={order}
        number={plan.numbers.get(item.id) ?? null}
        color={typeColor(item.type, typeColors)}
        flexTime={plan.flexTimes.get(item.id)}
        // The end row is where the day finishes; its hotel's outgoing leg belongs to the start row.
        leg={anchor === "end" ? undefined : plan.legByFromId.get(item.id)}
        nextTitle={plan.nextTitles.get(item.id)}
        selected={selectedIds.has(item.id)}
        primary={primarySelectedId === item.id}
        expanded={expanded?.id === item.id && expanded.date === date}
        hovered={hoveredId === item.id}
        driveMode={mode === "drive"}
        canFindParking={plan.parkingOfferIds.has(item.id)}
        anchor={anchor}
        showParking={!(anchor === "end" && item.id === morning?.id)}
        onChangeItem={handlers.onChangeItem}
        onSetLegMode={handlers.onSetLegMode}
        onPick={(picked, additive) => handlers.onPick(picked, additive, date)}
        onEdit={handlers.onEdit}
        onHover={handlers.onHover}
        onFindNearby={handlers.onFindNearby}
      />
    );
  };
  // Pinned hotel rows sit outside the saved order, so they are not drop targets.
  const renderAnchor = (item: TravelObject, anchor: "start" | "end") =>
    phone ? (
      <li key={`${item.id}:${anchor}`} className="list-none">
        {renderStop(item, 0, anchor)}
      </li>
    ) : (
      <Fragment key={`${item.id}:${anchor}`}>{renderStop(item, items.indexOf(item), anchor)}</Fragment>
    );
  return (
    <section
      ref={(node) => {
        nodeRef.current = node;
        sectionRef(node);
      }}
      data-date={date}
      aria-label={fullLabel}
      className="scroll-mt-0 pb-8 sm:min-h-[42vh] max-sm:last-of-type:min-h-[calc(100dvh-14rem)]"
    >
      <header className="sticky top-0 z-20 border-t border-foreground bg-background">
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
        </div>
        <div className="hidden flex-wrap items-center justify-between gap-2 sm:flex">
          <button
            type="button"
            onClick={onFocusDay}
            aria-label={`Show all ${events.length} ${events.length === 1 ? "place" : "places"} for ${fullLabel} on the map`}
            className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-3.5 text-left hover:bg-surface"
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
      <ol aria-label={`Stops on ${fullLabel}`} className="px-4 pt-1 sm:px-0 sm:pt-0">
        {morning && renderAnchor(morning, "start")}
        {middleRows.map(({ item, order }) => (
          <Fragment key={`${item.id}:${date}`}>
            {!phone && (
              <AddGap
                label={`Add stop at position ${order + 1}`}
                noteLabel={`Add note at position ${order + 1}`}
                onAdd={() => onCreateItem(date, order)}
                onAddNote={() => onAddNote(date, savedOrder(order))}
              />
            )}
            {isNote(item) ? (
              <DropRow date={date} order={order}>
                <ItemNoteCard
                  item={item}
                  date={date}
                  autoFocus={noteFocusId === item.id}
                  onSave={handlers.onSaveNote}
                  onDelete={() => handlers.onDeleteNote(item)}
                />
              </DropRow>
            ) : phone ? (
              <DropRow date={date} order={order}>
                {renderStop(item, order)}
              </DropRow>
            ) : (
              renderStop(item, order)
            )}
          </Fragment>
        ))}
        {phone ? (
          items.length === 0 && (
            <PhoneEmptyDay
              date={date}
              onAdd={() => onCreateItem(date, savedOrder(items.length))}
              onAddNote={() => onAddNote(date, savedOrder(items.length))}
            />
          )
        ) : (
          <EndSlot
            date={date}
            order={items.length}
            empty={items.length === 0}
            onAdd={() => onCreateItem(date, items.length)}
            onAddNote={() => onAddNote(date, savedOrder(items.length))}
          />
        )}
        {evening && renderAnchor(evening, "end")}
      </ol>
    </section>
  );
}

/**
 * The Plan itinerary: one section per trip day in a single scroll, on desktop and phone. Desktop rows are
 * `StopRow`s with routed legs and parking; phone rows are compact, with a long-press sheet, a floating + and
 * today's now/next mark. Drag and drop is owned by the surrounding `TripDaysView` (`trip-row:` ids).
 */
export function DayList({
  trip,
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  expanded,
  hoveredId,
  mode,
  overrides,
  scrollRequest,
  onActiveDate,
  onPick,
  onEdit,
  onHover,
  onChangeItem,
  onSetLegMode,
  onCreateItem,
  onCreateNote,
  onSaveNote,
  onDeleteNote,
  onReorder,
  onLogExpense,
  onFindNearby,
  mapOpen,
  onMapOpenChange,
  map,
}: {
  trip: Trip;
  /** Dated items for the trip, notes included. */
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  expanded: ExpandedStop | null;
  hoveredId: string | null;
  mode: TravelMode;
  overrides: Record<string, TravelMode> | undefined;
  scrollRequest: ScrollRequest;
  /** The day in view changed (or, with `recenter`, the same day was chosen again to refit the map). */
  onActiveDate: (date: string, recenter?: boolean) => void;
  onPick: (item: TravelObject, additive: boolean, date: string) => void;
  onEdit: (item: TravelObject) => void;
  onHover: (itemId: string | null) => void;
  onChangeItem: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
  onSetLegMode: (leg: DisplayLeg, mode: TravelMode) => void;
  onCreateItem: (date: string, order: number) => void;
  onCreateNote: (date: string, order: number) => Promise<string | undefined>;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  /** Move an item to a gap of its day (the same call as a drag-drop). */
  onReorder: (item: TravelObject, date: string, order: number) => Promise<void>;
  /** Phone: opens the Spend expense form, linked to the item when given. */
  onLogExpense?: (item: TravelObject | null) => void;
  /** Opens the Nearby tab searching around a stop with coordinates. */
  onFindNearby?: (item: TravelObject) => void;
  /** Below `md` the itinerary and the day map share the screen; the app header toggles this. */
  mapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
  /** The day map, beside the list from `md` and in place of it below. */
  map: ReactNode;
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
  const openItemActions = useCallback<RowActions>((item, date, anchor, trigger) => {
    sheetTrigger.current = trigger;
    setSheet({ itemId: item.id, date, anchor });
  }, []);
  const dates = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const grouped = useMemo(
    () =>
      new Map(
        dates.map((date) => [
          date,
          items.filter((item) => occursOnItineraryDate(item, date)).sort(compareScheduleOrder),
        ]),
      ),
    [dates, items],
  );
  const [activeDate, setActiveDate] = useState(() =>
    dates.includes(scrollRequest.date) ? scrollRequest.date : dates[0],
  );
  const mobileSurface = mapOpen ? "map" : "itinerary";
  const mapOpenRef = useRef(mapOpen);
  useEffect(() => {
    mapOpenRef.current = mapOpen;
  }, [mapOpen]);
  // Today in the trip timezone (honours the dev-only `?today=` clock); the list flags the current/next stop on it.
  const { date: todayDate, mark } = useTodayMark(trip, items, phone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const handledInitialScroll = useRef(false);
  const restoredScroll = useRef(false);
  // Opening the list on a phone during the trip lands on today instead of the remembered position.
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

  const setActive = useCallback((date: string, recenter = false) => {
    const changed = activeDateRef.current !== date;
    if (changed) {
      activeDateRef.current = date;
      setActiveDate(date);
    }
    if (changed || recenter) onActiveDateRef.current(date, recenter);
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
    const saved = savedScrollPositions.get(trip.id);
    // Resume where the list was left, unless a different day, a selection or today's date asks for a scroll.
    if (
      saved &&
      saved.date === initialScrollRequest.current.date &&
      !initialSelectionRef.current &&
      !openAtToday.current
    ) {
      root.scrollTop = saved.top;
      restoredScroll.current = true;
    }
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
      savedScrollPositions.set(trip.id, { top: root.scrollTop, date: activeDateRef.current });
      detectActiveDate();
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      savedScrollPositions.set(trip.id, { top: root.scrollTop, date: activeDateRef.current });
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

  // Row ids end with their date, and a multi-day hotel appears on several days; the first match is the earliest.
  const scrollToItem = useCallback((itemId: string, behavior: ScrollBehavior = "smooth") => {
    const row = scrollRef.current?.querySelector(`[id^="plan-row-${CSS.escape(itemId)}-"]`);
    row?.scrollIntoView({ behavior, block: "center" });
  }, []);

  useEffect(() => {
    // Compared by identity so a repeated effect run (Strict Mode) stays on today; any later request moves on.
    if (openAtToday.current && scrollRequest === initialScrollRequest.current) {
      scrollToDate(todayDate, "auto");
      return;
    }
    if (!handledInitialScroll.current) {
      handledInitialScroll.current = true;
      if (restoredScroll.current) return;
    }
    // While the phone shows the map the list is parked, so the request only moves the map to that day.
    if (mapOpenRef.current && window.matchMedia("(max-width: 767px)").matches) setActive(scrollRequest.date, true);
    if (scrollRequest.itemId) scrollToItem(scrollRequest.itemId);
    else scrollToDate(scrollRequest.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today only matters for the first scroll
  }, [scrollRequest, scrollToDate, scrollToItem, trip.id]);

  useEffect(() => {
    if (focusedInitialSelectionRef.current) return;
    focusedInitialSelectionRef.current = true;
    const initialItemId = initialSelectionRef.current;
    if (!initialItemId) return;
    const selected = items.find((item) => item.id === initialItemId);
    const date = selected?.date?.slice(0, 10);
    if (!date || !dates.includes(date)) return;
    const frame = requestAnimationFrame(() => scrollToItem(initialItemId));
    return () => cancelAnimationFrame(frame);
  }, [dates, items, scrollToItem]);

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
    const { morning, evening } = dayHotels(list, date);
    const middle = list
      .map((entry, index) => ({ item: entry, index }))
      .filter((entry) => entry.item.id !== morning?.id && entry.item.id !== evening?.id);
    const position = sheet.anchor ? -1 : middle.findIndex((entry) => entry.item.id === item.id);
    const actions: SheetAction[] = [];
    if (position >= 0) {
      const index = middle[position].index;
      const gap = (visibleGap: number) => sameDayGapOrder(list, date, visibleGap);
      const previous = middle[position - 1];
      const next = middle[position + 1];
      // Same ordering rules as a drag-drop: the target gap is before the neighbour above, or after the one below.
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
    if (onFindNearby && hasMapCoordinates(item.location))
      actions.push({ id: "nearby", label: "Find nearby", onSelect: () => onFindNearby(item) });
    actions.push({ id: "open", label: "Open", onSelect: () => onEdit(item) });
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

  const handlers: RowHandlers = {
    onPick,
    onEdit,
    onHover,
    onChangeItem,
    onSetLegMode,
    onCreateItem,
    onAddNote: (date, order) => void addNote(date, order),
    onSaveNote,
    onDeleteNote: (note) => {
      setDeleteError("");
      setDeletingNote(note);
    },
    onActions: openItemActions,
    onFindNearby,
  };

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
          <div role="alert" className="border-b border-divider px-4 py-2 text-xs text-danger sm:px-0">
            {noteCreateError} Try Add note again.
          </div>
        )}
      </div>
      <div className="shrink-0 border-b border-divider bg-background pl-2 sm:hidden">
        <DayStrip days={dates} activeDate={activeDate} today={todayDate} variant="pills" onPick={pickDay} />
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
      <div className="relative grid min-h-0 flex-1 md:grid-cols-[minmax(380px,55%)_minmax(0,1fr)]">
        <div
          ref={scrollRef}
          className={`${mobileSurface === "map" ? "max-md:invisible max-md:absolute max-md:inset-0" : "block"} min-h-0 overflow-y-auto max-md:[overflow-anchor:none] sm:px-6 md:block lg:px-10`}
          aria-label="Continuous trip itinerary"
        >
          {dates.map((date, index) => (
            <DateSection
              key={date}
              date={date}
              dayNumber={index + 1}
              items={grouped.get(date) ?? []}
              trip={trip}
              typeColors={typeColors}
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              expanded={expanded}
              hoveredId={hoveredId}
              mode={mode}
              overrides={overrides}
              noteFocusId={noteFocusId}
              scrollRef={scrollRef}
              sectionRef={(node) => {
                if (node) sectionRefs.current.set(date, node);
                else sectionRefs.current.delete(date);
              }}
              handlers={handlers}
              onFocusDay={() => setActive(date, true)}
              phone={phone}
              mark={phone && date === todayDate ? mark : null}
            />
          ))}
          {/* Keeps the last row clear of the floating + button. */}
          <div aria-hidden className="h-24 sm:hidden" />
        </div>
        {map}
      </div>
    </div>
  );
}
