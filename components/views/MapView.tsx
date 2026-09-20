"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type MouseEvent } from "react";
import { dateParts, dayIndexForDate } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Loading map…</div>,
});

export function MapView({ trip, items, typeColors, onSelect }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; onSelect: (item: TravelObject) => void }) {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const mappedItems = useMemo(() => items.filter((item) => {
    const lat = item.location?.lat;
    const lng = item.location?.lng;
    return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  }), [items]);
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of mappedItems) {
      if (!item.startDateTime) continue;
      const date = dateParts(item.startDateTime, trip.timezone).date;
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return [...counts].sort(([left], [right]) => left.localeCompare(right));
  }, [mappedItems, trip.timezone]);
  const availableDates = useMemo(() => new Set(days.map(([date]) => date)), [days]);
  const activeDates = useMemo(() => new Set([...selectedDates].filter((date) => availableDates.has(date))), [availableDates, selectedDates]);
  const visibleItems = useMemo(() => activeDates.size ? mappedItems.filter((item) => item.startDateTime && activeDates.has(dateParts(item.startDateTime, trip.timezone).date)) : mappedItems, [activeDates, mappedItems, trip.timezone]);

  function filterDay(date: string, event: MouseEvent<HTMLButtonElement>) {
    setSelectedDates((current) => {
      if (!event.shiftKey) return current.size === 1 && current.has(date) ? new Set() : new Set([date]);
      const next = new Set(current);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900" aria-label="Trip locations map">
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div><h2 className="text-sm font-semibold">Trip map</h2><p className="mt-0.5 text-xs text-muted-foreground">{activeDates.size ? `${visibleItems.length} of ${mappedItems.length} mapped items shown` : `${mappedItems.length} of ${items.length} items have coordinates`}</p></div>
    </header>
    {mappedItems.length ? <><LeafletMap key={trip.id} trip={trip} items={visibleItems} typeColors={typeColors} onSelect={onSelect} /><footer className="shrink-0 border-t px-4 py-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Filter by day</p><p className="text-[10px] text-muted-foreground">Shift-click to select multiple</p></div><div className="flex gap-2 overflow-x-auto pb-1"><button type="button" aria-pressed={activeDates.size === 0} onClick={() => setSelectedDates(new Set())} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${activeDates.size === 0 ? "border-emerald-700 bg-emerald-700 text-white" : "bg-background hover:border-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-300"}`}>All</button>{days.map(([date, count]) => { const dayNumber = dayIndexForDate(date, trip.startDate); const label = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`)); const active = activeDates.has(date); return <button key={date} type="button" aria-pressed={active} title={`${count} mapped ${count === 1 ? "item" : "items"}`} onClick={(event) => filterDay(date, event)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-emerald-700 bg-emerald-700 text-white" : "bg-background hover:border-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-300"}`}>{dayNumber > 0 ? `Day ${dayNumber} · ` : ""}{label}<span className={`ml-1.5 ${active ? "text-emerald-100" : "text-muted-foreground"}`}>{count}</span></button>; })}</div></footer></> : <div className="grid min-h-0 flex-1 place-items-center p-8 text-center"><div className="max-w-sm"><p className="text-sm font-medium">No locations to map yet</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Paste a Google Maps link containing coordinates into an item. Links without embedded coordinates stay saved but cannot appear on this map.</p></div></div>}
  </section>;
}
