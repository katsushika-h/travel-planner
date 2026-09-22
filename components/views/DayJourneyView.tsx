"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ExternalLink, GripVertical, List, LocateFixed, Map as MapIcon, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTripDate } from "@/lib/date-utils";
import type { LocationData, TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid min-h-80 flex-1 place-items-center text-sm text-muted-foreground">Loading map…</div>,
});

const savedScrollPositions = new Map<string, number>();
const defaultTypeColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const typePalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];

function typeColor(type: string, colors: Record<string, string>) {
  return colors[type] ?? defaultTypeColors[type] ?? typePalette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % typePalette.length];
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function tripDates(trip: Trip) {
  const dates: string[] = [];
  const end = trip.endDate.slice(0, 10);
  for (let date = trip.startDate.slice(0, 10); date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

function itemAppearsOnDate(item: TravelObject, date: string) {
  const first = item.date?.slice(0, 10);
  const last = item.endDate?.slice(0, 10) ?? first;
  return Boolean(first && first <= date && last && last >= date);
}

function itinerarySort(a: TravelObject, b: TravelObject) {
  return Number(b.isAllDay) - Number(a.isAllDay)
    || (a.dayOrder ?? Number.MAX_SAFE_INTEGER) - (b.dayOrder ?? Number.MAX_SAFE_INTEGER)
    || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
    || a.createdAt.localeCompare(b.createdAt);
}

function hasCoordinates(item: TravelObject) {
  return Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lng);
}

function selectionRing(selected: boolean, primary: boolean) {
  return selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : "";
}

function safeMapsHref(location: LocationData | null | undefined, fallback: string) {
  if (location?.googleMapsUrl?.startsWith("https://") || location?.googleMapsUrl?.startsWith("http://")) return location.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location?.name || location?.address || fallback)}`;
}

function DropGap({ date, order, onCreate }: { date: string; order: number; onCreate: (date: string, order: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-list:${date}:${order}` });
  return <div ref={setNodeRef} className={`group flex h-7 items-center gap-2 transition ${isOver ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}><span className={`h-px flex-1 border-t ${isOver ? "border-2 border-emerald-500" : "border-dotted border-transparent group-hover:border-stone-300 dark:group-hover:border-neutral-600"}`} /><button type="button" aria-label={`Add item at position ${order + 1}`} onClick={() => onCreate(date, order)} className={`flex min-h-7 items-center gap-1 text-[10px] font-medium ${isOver ? "text-emerald-700" : "text-transparent group-hover:text-stone-500 dark:group-hover:text-stone-400"}`}><Plus size={11} /> Add</button></div>;
}

function JourneyCard({ item, number, color, selected, primary, highlighted, onSelect, onHover }: { item: TravelObject; number: number; color: string; selected: boolean; primary: boolean; highlighted: boolean; onSelect: (item: TravelObject, additive?: boolean) => void; onHover: (itemId: string | null) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `agenda:${item.id}`, data: { item } });
  const location = item.location?.name ?? item.location?.address;
  const fixed = Boolean(item.startTime && item.endTime && !item.isAllDay);
  const cost = item.cost?.amount != null ? `${item.cost.currency} ${item.cost.amount.toLocaleString()}` : null;
  const style: CSSProperties = { borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) };
  return <article id={`day-card-${item.id}`} ref={setNodeRef} style={style} onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)} className={`relative overflow-hidden rounded-xl border border-l-4 bg-white shadow-sm transition dark:bg-neutral-900 ${selectionRing(selected, primary)} ${highlighted ? "shadow-md ring-2 ring-emerald-400/70" : ""} ${isDragging ? "opacity-40" : ""}`}>
    {item.headerImage && <button type="button" onClick={(event) => onSelect(item, event.shiftKey)} className="block h-36 w-full overflow-hidden border-b text-left sm:h-44"><img src={item.headerImage} alt="" className="size-full object-cover" /></button>}
    <div className="flex min-w-0 items-stretch">
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-stone-50 px-1 py-3 dark:bg-neutral-800/60"><span className="grid size-7 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: color }}>{number}</span><button type="button" aria-label={`Reorder ${item.title}`} className="cursor-grab rounded p-1 text-muted-foreground hover:bg-stone-200 active:cursor-grabbing dark:hover:bg-neutral-700" {...attributes} {...listeners}><GripVertical size={15} /></button></div>
      <button type="button" onClick={(event) => onSelect(item, event.shiftKey)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold">{item.title}</p>{item.isAllDay ? <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-stone-600 dark:bg-neutral-800 dark:text-stone-300">All day</span> : fixed ? <span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">{item.startTime}–{item.endTime}</span> : null}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{item.type}{cost ? ` · ${cost}` : ""}</p>
          <p className={`mt-2 flex items-center gap-1.5 truncate text-xs ${location ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}><MapPin size={12} className="shrink-0" />{location || "Location unavailable"}</p>
          {item.location?.openingHours?.[0] && <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">{item.location.openingHours[0]}</p>}
          {item.notes && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{item.notes}</p>}
        </div>
      </button>
      {location && <a href={safeMapsHref(item.location, item.title)} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} in Maps`} className="m-2 self-end rounded p-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"><ExternalLink size={13} /></a>}
    </div>
  </article>;
}

function DateSection({ date, dayNumber, items, trip, typeColors, selectedIds, primarySelectedId, highlightedItemId, sectionRef, onSelect, onHover, onCreate }: { date: string; dayNumber: number; items: TravelObject[]; trip: Trip; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; highlightedItemId: string | null; sectionRef: (node: HTMLElement | null) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onHover: (itemId: string | null) => void; onCreate: (date: string, order: number) => void }) {
  const { setNodeRef: setHeaderDropRef, isOver } = useDroppable({ id: `day-list:${date}:${items.length}` });
  const fixedCount = items.filter((item) => item.startTime && item.endTime && !item.isAllDay).length;
  return <section ref={sectionRef} data-date={date} aria-labelledby={`day-heading-${date}`} className="min-h-[42vh] scroll-mt-0 pb-8">
    <header ref={setHeaderDropRef} className={`sticky top-0 z-20 border-y bg-stone-50/95 px-4 py-3 backdrop-blur dark:bg-neutral-950/95 ${isOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : ""}`}>
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-700 dark:text-emerald-300">Day {dayNumber}</p><h2 id={`day-heading-${date}`} className="mt-0.5 text-base font-semibold">{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })}</h2></div><p className="shrink-0 text-right text-[10px] leading-relaxed text-muted-foreground">{items.length} {items.length === 1 ? "place" : "places"}<br />{fixedCount} fixed {fixedCount === 1 ? "time" : "times"}</p></div>
    </header>
    <div className="px-3 pt-3 sm:px-4">
      {items.length ? items.map((item, index) => <div key={item.id}><DropGap date={date} order={index} onCreate={onCreate} /><JourneyCard item={item} number={index + 1} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} highlighted={highlightedItemId === item.id} onSelect={onSelect} onHover={onHover} /></div>) : <div className={`grid min-h-40 place-items-center rounded-xl border border-dashed px-4 text-center ${isOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}><div><p className="text-sm font-medium">Nothing planned</p><p className="mt-1 text-xs text-muted-foreground">Drop an idea on this date or add an item.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onCreate(date, 0)}><Plus size={14} /> Add item</Button></div></div>}
      {items.length > 0 && <DropGap date={date} order={items.length} onCreate={onCreate} />}
    </div>
  </section>;
}

export function DayJourneyView({ trip, items, typeColors, selectedIds, primarySelectedId, scrollRequest, onActiveDate, onSelect, onCreateItem }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; scrollRequest: { date: string; nonce: number }; onActiveDate: (date: string) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onCreateItem: (date: string, order: number) => void }) {
  const dates = useMemo(() => tripDates(trip), [trip]);
  const grouped = useMemo(() => new Map(dates.map((date) => [date, items.filter((item) => itemAppearsOnDate(item, date)).sort(itinerarySort)])), [dates, items]);
  const [activeDate, setActiveDate] = useState(() => dates.includes(scrollRequest.date) ? scrollRequest.date : dates[0]);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mobileSurface, setMobileSurface] = useState<"itinerary" | "map">("itinerary");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const handledInitialScroll = useRef(false);
  const activeDateRef = useRef(activeDate);
  const initialSelectionRef = useRef(primarySelectedId);
  const previousSelectionRef = useRef(primarySelectedId);
  const lastScrollTopRef = useRef(0);
  const focusedInitialSelectionRef = useRef(false);
  const onActiveDateRef = useRef(onActiveDate);
  useEffect(() => { onActiveDateRef.current = onActiveDate; }, [onActiveDate]);

  const setActive = useCallback((date: string) => {
    if (activeDateRef.current === date) return;
    activeDateRef.current = date;
    setActiveDate(date);
    setMapMoved(false);
    setRecenterToken((token) => token + 1);
    onActiveDateRef.current(date);
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
    const observer = new IntersectionObserver(() => detectActiveDate(), { root, rootMargin: "-80px 0px -65% 0px", threshold: [0, 1] });
    for (const section of sectionRefs.current.values()) observer.observe(section);
    const onScroll = () => { lastScrollTopRef.current = root.scrollTop; savedScrollPositions.set(trip.id, root.scrollTop); detectActiveDate(); };
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
    const frame = requestAnimationFrame(() => { root.scrollTop = position; });
    return () => cancelAnimationFrame(frame);
  }, [primarySelectedId]);

  const scrollToDate = useCallback((date: string, behavior: ScrollBehavior = "smooth") => {
    sectionRefs.current.get(date)?.scrollIntoView({ behavior, block: "start" });
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
    const frame = requestAnimationFrame(() => document.getElementById(`day-card-${initialItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [dates, items]);

  const activeItems = useMemo(() => grouped.get(activeDate) ?? [], [activeDate, grouped]);
  const mappedItems = activeItems.filter(hasCoordinates);
  const markerNumbers = useMemo(() => new Map(activeItems.map((item, index) => [item.id, index + 1])), [activeItems]);

  function selectFromMap(item: TravelObject) {
    onSelect(item);
    document.getElementById(`day-card-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setMobileSurface("itinerary");
  }

  return <div className="relative flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 border-b bg-white p-1 dark:bg-neutral-900 md:hidden"><Button type="button" size="sm" variant={mobileSurface === "itinerary" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMobileSurface("itinerary")}><List size={14} /> Itinerary</Button><Button type="button" size="sm" variant={mobileSurface === "map" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMobileSurface("map")}><MapIcon size={14} /> Map</Button></div>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,28.5%)_minmax(0,71.5%)]">
      <div ref={scrollRef} className={`${mobileSurface === "map" ? "hidden" : "block"} min-h-0 overflow-y-auto bg-stone-50/60 [overflow-anchor:none] dark:bg-neutral-950 md:block`} aria-label="Continuous trip itinerary">
        {dates.map((date, index) => <DateSection key={date} date={date} dayNumber={index + 1} items={grouped.get(date) ?? []} trip={trip} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} highlightedItemId={hoveredItemId} sectionRef={(node) => { if (node) sectionRefs.current.set(date, node); else sectionRefs.current.delete(date); }} onSelect={onSelect} onHover={setHoveredItemId} onCreate={onCreateItem} />)}
      </div>
      <section className={`${mobileSurface === "map" ? "flex" : "hidden"} relative min-h-0 flex-col overflow-hidden border-l bg-white dark:bg-neutral-900 md:flex`} aria-label={`Map for ${activeDate}`}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{formatTripDate(`${activeDate}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })}</p><p className="mt-0.5 text-xs text-muted-foreground">{mappedItems.length} of {activeItems.length} {activeItems.length === 1 ? "place has" : "places have"} map coordinates</p></div>{mapMoved && mappedItems.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => { setMapMoved(false); setRecenterToken((token) => token + 1); }}><LocateFixed size={14} /> Recenter day</Button>}</header>
        <LeafletMap trip={trip} items={mappedItems} typeColors={typeColors} markerNumbers={markerNumbers} selectedItemId={primarySelectedId} hoveredItemId={hoveredItemId} onHover={setHoveredItemId} onSelect={selectFromMap} fitKey={activeDate} recenterToken={recenterToken} onUserMove={() => setMapMoved(true)} className="min-h-72 flex-1" />
        {mappedItems.length === 0 && <div className="pointer-events-none absolute inset-x-4 top-20 z-[500] rounded-lg border bg-white/90 px-4 py-3 text-center text-xs text-muted-foreground shadow-sm backdrop-blur dark:bg-neutral-900/90">No locations with coordinates for this day.</div>}
      </section>
    </div>
  </div>;
}
