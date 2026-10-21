"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useNow } from "@/components/layout/useNow";
import { dateParts, formatTripDate, shiftDate } from "@/lib/date-utils";
import {
  layoutOverlaps,
  phoneDaySegments,
  phoneHourRange,
  phoneLaneBars,
  shiftWeekSelection,
  weekStartOf,
  type PhoneSegment,
} from "@/lib/phone-week";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";
import { selectionRing } from "./calendar-shared";

const GUTTER = 24;
const columns = "grid grid-cols-[24px_repeat(7,minmax(0,1fr))]";
const LANE_PITCH = 18;
const MIN_ROW = 32;
const MAX_ROW = 72;
const GRID_PAD = 8;
const SWIPE_DISTANCE = 56;
const weekdayLetters = ["M", "T", "W", "T", "F", "S", "S"];

const label = (date: string, options: Intl.DateTimeFormatOptions) =>
  formatTripDate(`${date}T12:00:00Z`, "UTC", options);

function clockLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Compressed week for phones: month header, seven equal date columns, an all-day lane, and an hour grid fitted
 * to the week's used hours. Tapping an item selects it (opens the inspector); one pill adds on the selected date.
 */
export function PhoneWeek({
  trip,
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
  onCreateItem,
}: {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onCreateItem: (date: string, order: number) => void;
}) {
  const start = trip.startDate.slice(0, 10);
  const end = trip.endDate.slice(0, 10);
  const today = dateParts(useNow(), trip.timezone).date;
  const [selectedDate, setSelectedDate] = useState(() => (today >= start && today <= end ? today : start));
  const weekStart = weekStartOf(selectedDate);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);

  const { tripBar, bars, overflow, laneCount } = useMemo(
    () => phoneLaneBars(items, dates, { start, end }),
    [items, dates, start, end],
  );
  const segmentsByDate = useMemo(() => dates.map((date) => phoneDaySegments(items, date)), [items, dates]);
  const { startHour, endHour } = useMemo(() => phoneHourRange(segmentsByDate.flat()), [segmentsByDate]);
  const hours = endHour - startHour;

  // Fit the hour range to the height left for the grid; scroll inside the grid only when it does not fit.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rowHeight = Math.max(MIN_ROW, Math.min(MAX_ROW, Math.floor((available - GRID_PAD * 2) / hours))) || MIN_ROW;
  const contentHeight = hours * rowHeight + GRID_PAD * 2;

  // When the hours do not fit, open on the week's first item that starts within its own day.
  const firstStart = useMemo(() => {
    const starts = segmentsByDate.flat().filter((segment) => !segment.continued);
    return starts.length ? Math.min(...starts.map((segment) => segment.start)) : startHour * 60;
  }, [segmentsByDate, startHour]);
  const measured = available > 0;
  useEffect(() => {
    if (!measured) return;
    scrollRef.current?.scrollTo({ top: Math.max(0, ((firstStart - startHour * 60) / 60) * rowHeight - 4) });
    // Re-anchor when the visible week or its hour range changes, not on every resize or edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, startHour, measured]);

  const goWeek = useCallback(
    (direction: number) => setSelectedDate((date) => shiftWeekSelection(date, direction, start, end)),
    [start, end],
  );
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      goWeek(event.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goWeek]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(event: TouchEvent) {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  function onTouchEnd(event: TouchEvent) {
    const from = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!from || !touch) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) goWeek(dx < 0 ? 1 : -1);
  }

  const firstMonth = label(dates[0], { month: "short" });
  const lastMonth = label(dates[6], { month: "short" });
  const monthTitle = dates[0].slice(0, 7) === dates[6].slice(0, 7) ? firstMonth : `${firstMonth} – ${lastMonth}`;
  const todayNumber = Number(today.slice(8, 10));
  const iconButton =
    "grid size-11 shrink-0 place-items-center text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring [&_svg]:size-[18px]";
  const barBase =
    "absolute h-4 min-w-0 truncate px-1 text-left text-[11px] leading-4 before:absolute before:-inset-y-px before:inset-x-0 before:content-['']";
  const pillOrder = items.filter((item) => item.date?.slice(0, 10) === selectedDate).length;
  const lanesHeight = laneCount * LANE_PITCH + (overflow.some(Boolean) ? 16 : 0);

  function blockLabel({ item, flexible, start }: PhoneSegment) {
    if (!flexible) return `${item.title}, ${item.startTime}–${item.endTime}`;
    return `${item.title}, flexible, not a confirmed time${item.placementTime ? `, placed near ${clockLabel(start)}` : ""}`;
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-hidden bg-background sm:hidden"
    >
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-divider">
        <div className="flex justify-start">
          <button type="button" className={iconButton} onClick={() => goWeek(-1)} aria-label="Previous week">
            <ChevronLeft strokeWidth={1.5} />
          </button>
          <button type="button" className={iconButton} onClick={() => goWeek(1)} aria-label="Next week">
            <ChevronRight strokeWidth={1.5} />
          </button>
        </div>
        <h1 className="truncate px-1 text-center text-[15px] font-medium tracking-tight">{monthTitle}</h1>
        <div className="flex justify-end">
          <button
            type="button"
            className={iconButton}
            onClick={() => setSelectedDate(today)}
            aria-label={`Go to today, ${label(today, { weekday: "long", day: "numeric", month: "long" })}`}
          >
            <span className="grid size-[26px] place-items-center border border-foreground font-mono text-xs leading-none">
              {todayNumber}
            </span>
          </button>
        </div>
      </header>
      <div role="group" aria-label="Week days" className={`${columns} shrink-0 px-0`}>
        <div />
        {dates.map((date, index) => {
          const selected = date === selectedDate;
          const isToday = date === today;
          const inTrip = date >= start && date <= end;
          const dayNumber =
            Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${label(date, { weekday: "long", day: "numeric", month: "long" })}${inTrip ? `, day ${dayNumber}` : ""}${isToday ? ", today" : ""}`}
              onClick={() => setSelectedDate(date)}
              className={`flex h-11 min-w-0 flex-col items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring ${selected ? "ring-1 ring-inset ring-foreground" : ""}`}
            >
              <span className={`text-[11px] leading-none ${isToday ? "text-accent" : "text-muted"}`}>
                {weekdayLetters[index]}
              </span>
              <span
                className={`mt-1 font-mono text-[15px] leading-none ${isToday ? "font-medium text-accent" : inTrip ? "" : "text-faint"}`}
              >
                {Number(date.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
      {lanesHeight > 0 && (
        <div className={`${columns} shrink-0 border-b border-divider pt-1 pb-1`}>
          <div />
          <div className="relative col-span-7" style={{ height: lanesHeight }}>
            {tripBar && (
              <div
                className="absolute h-4 truncate bg-surface px-1 text-[11px] leading-4 text-muted"
                style={{
                  left: `calc(${(tripBar.startColumn / 7) * 100}% + 1px)`,
                  width: `calc(${(tripBar.dayCount / 7) * 100}% - 2px)`,
                  top: 0,
                }}
              >
                {trip.title}
              </div>
            )}
            {bars.map(({ item, startColumn, dayCount, lane }) => {
              const note = item.kind === "note";
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`${item.title}, ${note ? "note" : "all day"}`}
                  onClick={() => onSelect(item)}
                  className={`${barBase} ${note ? "bg-surface text-foreground" : "border-l-[3px] bg-surface text-foreground"} ${selectionRing(selectedIds.has(item.id), primarySelectedId === item.id)}`}
                  style={{
                    left: `calc(${(startColumn / 7) * 100}% + 1px)`,
                    width: `calc(${(dayCount / 7) * 100}% - 2px)`,
                    top: lane * LANE_PITCH,
                    ...(note
                      ? {}
                      : { borderLeftColor: item.type === "hotel" ? "var(--ink)" : typeColor(item.type, typeColors) }),
                  }}
                >
                  {item.title}
                </button>
              );
            })}
            {overflow.map((count, index) =>
              count ? (
                <button
                  key={dates[index]}
                  type="button"
                  aria-label={`${count} more on ${label(dates[index], { weekday: "long", day: "numeric", month: "long" })}`}
                  onClick={() => setSelectedDate(dates[index])}
                  className="absolute h-4 text-center font-mono text-[10px] leading-4 text-muted before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
                  style={{
                    left: `${(index / 7) * 100}%`,
                    width: `${100 / 7}%`,
                    top: laneCount * LANE_PITCH,
                  }}
                >
                  +{count}
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-b border-divider">
        <div className="relative" style={{ height: contentHeight }}>
          <div className="absolute inset-y-0" style={{ left: GUTTER, right: 0 }} aria-hidden="true">
            <div
              className="absolute inset-y-0 bg-surface-selected"
              style={{ left: `${(dates.indexOf(selectedDate) / 7) * 100}%`, width: `${100 / 7}%` }}
            />
            {Array.from({ length: hours + 1 }, (_, index) => (
              <div key={index}>
                <div
                  className="absolute inset-x-0 border-t border-divider"
                  style={{ top: GRID_PAD + index * rowHeight }}
                />
                {index < hours && (
                  <div
                    className="absolute inset-x-0 border-t border-dotted border-divider"
                    style={{ top: GRID_PAD + index * rowHeight + rowHeight / 2 }}
                  />
                )}
              </div>
            ))}
          </div>
          <div aria-hidden="true">
            {Array.from({ length: hours + 1 }, (_, index) => (
              <span
                key={index}
                className="absolute w-5 text-right font-mono text-[11px] leading-none text-faint"
                style={{ top: GRID_PAD + index * rowHeight - 5 }}
              >
                {startHour + index}
              </span>
            ))}
          </div>
          <div className={`${columns} absolute inset-0`}>
            <div />
            {dates.map((date, index) => {
              const segments = segmentsByDate[index];
              const layout = layoutOverlaps(segments);
              return (
                <div
                  key={date}
                  role="group"
                  aria-label={label(date, { weekday: "long", day: "numeric", month: "long" })}
                  className={`relative min-w-0 border-l border-divider`}
                >
                  {segments.map((segment, position) => {
                    const { col, cols } = layout[position];
                    const { item } = segment;
                    const top = GRID_PAD + ((segment.start - startHour * 60) / 60) * rowHeight;
                    const height = Math.max(20, ((segment.end - segment.start) / 60) * rowHeight - 1);
                    return (
                      <button
                        key={`${item.id}:${date}`}
                        type="button"
                        aria-label={blockLabel(segment)}
                        onClick={() => onSelect(item)}
                        className={`absolute min-w-0 overflow-hidden px-[3px] py-0.5 text-left text-[11px] leading-[1.15] [overflow-wrap:anywhere] ${
                          segment.flexible
                            ? "border border-dashed border-input-rule bg-background text-muted"
                            : "border-l-[3px] bg-surface text-foreground"
                        } ${selectionRing(selectedIds.has(item.id), primarySelectedId === item.id)}`}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / cols) * 100}% + 1px)`,
                          width: `calc(${100 / cols}% - 2px)`,
                          zIndex: 1 + position,
                          ...(segment.flexible ? {} : { borderLeftColor: typeColor(item.type, typeColors) }),
                        }}
                      >
                        {item.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex h-14 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => onCreateItem(selectedDate, pillOrder)}
          className="flex h-11 items-center gap-3 rounded-full bg-foreground pr-3 pl-5 text-sm text-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <span>
            Add on {Number(selectedDate.slice(8, 10))} {label(selectedDate, { month: "short" })}
          </span>
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
