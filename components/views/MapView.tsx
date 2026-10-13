"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type MouseEvent } from "react";
import { dayIndexForDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { sortDayDisplayItems } from "@/lib/schedule-order";
import type { TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-muted">Loading map…</div>,
});

function dayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function MapView({
  trip,
  items,
  typeColors,
  onSelect,
}: {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  onSelect: (item: TravelObject) => void;
}) {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const mappedItems = useMemo(() => items.filter((item) => hasMapCoordinates(item.location)), [items]);
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of mappedItems) {
      if (!item.date) continue;
      const date = item.date.slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return [...counts].sort(([left], [right]) => left.localeCompare(right));
  }, [mappedItems]);
  const availableDates = useMemo(() => new Set(days.map(([date]) => date)), [days]);
  const activeDates = useMemo(
    () => new Set([...selectedDates].filter((date) => availableDates.has(date))),
    [availableDates, selectedDates],
  );
  const dimmedItemIds = useMemo(
    () =>
      activeDates.size
        ? new Set(
            mappedItems.filter((item) => !item.date || !activeDates.has(item.date.slice(0, 10))).map((item) => item.id),
          )
        : new Set<string>(),
    [activeDates, mappedItems],
  );
  // One selected day numbers its stops in display order; otherwise a pin shows its trip day.
  const markerNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    if (activeDates.size === 1) {
      const [date] = activeDates;
      sortDayDisplayItems(mappedItems.filter((item) => item.date?.slice(0, 10) === date)).forEach((item, index) =>
        numbers.set(item.id, index + 1),
      );
      return numbers;
    }
    for (const item of mappedItems) {
      if (!item.date) continue;
      const dayNumber = dayIndexForDate(item.date.slice(0, 10), trip.startDate);
      if (dayNumber > 0) numbers.set(item.id, dayNumber);
    }
    return numbers;
  }, [activeDates, mappedItems, trip.startDate]);
  const unmappedCount = items.length - mappedItems.length;

  function filterDay(date: string, event: MouseEvent<HTMLButtonElement>) {
    setSelectedDates((current) => {
      if (!event.shiftKey && !window.matchMedia("(max-width: 639px)").matches)
        return current.size === 1 && current.has(date) ? new Set() : new Set([date]);
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  if (!mappedItems.length)
    return (
      <section className="grid min-h-0 flex-1 place-items-center p-8 text-center" aria-label="Trip locations map">
        <div className="max-w-sm">
          <p className="text-sm font-medium">No locations to map yet</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Paste a Google Maps link containing coordinates into an item. Links without embedded coordinates stay saved
            but cannot appear on this map.
          </p>
        </div>
      </section>
    );

  const allActive = activeDates.size === 0;
  const rowBase =
    "grid items-baseline text-left transition-colors hover:bg-surface max-sm:min-h-11 max-sm:shrink-0 max-sm:grid-cols-[auto_auto] max-sm:gap-x-2 max-sm:border max-sm:border-divider max-sm:px-3 max-sm:py-2 sm:min-h-14 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-x-3 sm:border-b sm:border-divider sm:py-3";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4 sm:flex-row sm:gap-12 sm:overflow-hidden sm:px-12 sm:pb-8 sm:pt-6"
      aria-label="Trip locations map"
    >
      <nav aria-label="Filter map by day" className="flex shrink-0 flex-col sm:min-h-0 sm:w-72 lg:w-80">
        <h1 className="hidden text-[22px] font-medium tracking-tight sm:mb-4 sm:block">Whole trip</h1>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-col sm:gap-0 sm:overflow-y-auto sm:border-t sm:border-foreground sm:pb-0">
          <button
            type="button"
            aria-pressed={allActive}
            onClick={() => setSelectedDates(new Set())}
            className={rowBase}
          >
            <span className={`font-mono text-lg font-light max-sm:hidden ${allActive ? "text-accent" : "text-faint"}`}>
              —
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={`text-[15px] ${allActive ? "font-semibold" : ""}`}>All days</span>
              <span className="text-xs text-muted max-sm:hidden">{trip.title}</span>
            </span>
            <span className="font-mono text-xs text-muted">{mappedItems.length}</span>
          </button>
          {days.map(([date, count]) => {
            const dayNumber = dayIndexForDate(date, trip.startDate);
            const active = activeDates.has(date);
            return (
              <button
                key={date}
                type="button"
                aria-pressed={active}
                title={`${count} mapped ${count === 1 ? "item" : "items"}`}
                onClick={(event) => filterDay(date, event)}
                className={rowBase}
              >
                <span className={`font-mono text-lg font-light max-sm:hidden ${active ? "text-accent" : "text-faint"}`}>
                  {dayNumber > 0 ? String(dayNumber).padStart(2, "0") : "·"}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={`text-[15px] ${active ? "font-semibold" : ""}`}>
                    <span className="sm:hidden">{dayNumber > 0 ? `Day ${dayNumber} · ` : ""}</span>
                    {dayLabel(date)}
                  </span>
                  <span className="text-xs text-muted max-sm:hidden">
                    {count} {count === 1 ? "stop" : "stops"}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[13px] leading-normal text-muted">
          Picking a day fits the map to its stops.
          <span className="hidden sm:inline"> Shift-click to select several days.</span>
          <span className="sm:hidden"> Tap days to select several.</span>
          {unmappedCount > 0 &&
            ` ${unmappedCount} ${unmappedCount === 1 ? "item has" : "items have"} no location and ${unmappedCount === 1 ? "isn't" : "aren't"} shown.`}
        </p>
      </nav>
      <div className="flex min-h-[320px] min-w-0 flex-1 flex-col bg-surface max-sm:h-[60dvh] max-sm:flex-none sm:min-h-0">
        <LeafletMap
          key={trip.id}
          trip={trip}
          items={mappedItems}
          typeColors={typeColors}
          onSelect={onSelect}
          markerNumbers={markerNumbers}
          dimmedItemIds={dimmedItemIds}
          fitKey={[...activeDates].sort().join(",") || "all"}
        />
      </div>
    </section>
  );
}
