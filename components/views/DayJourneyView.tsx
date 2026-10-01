"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ExternalLink, GripVertical, List, LocateFixed, Map as MapIcon, MapPin, Plus } from "lucide-react";
import { ItemNoteCard } from "@/components/notes/ItemNoteCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { eventItems, isNote } from "@/lib/note-domain";
import { Button } from "@/components/ui/button";
import { formatTripDate, shiftDate } from "@/lib/date-utils";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { itemDateSpan, itemScheduleLabel } from "@/lib/schedule-domain";
import { sortDayDisplayItems } from "@/lib/schedule-order";
import { typeColor } from "@/lib/type-color";
import type { LocationData, TravelObject, Trip } from "@/types/travel";

const LeafletMap = dynamic(() => import("./LeafletMap").then((module) => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid min-h-80 flex-1 place-items-center text-sm text-muted-foreground">Loading map…</div>,
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

function selectionRing(selected: boolean, primary: boolean) {
  return selected ? primary ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600" : "ring-2 ring-emerald-600" : "";
}

function safeMapsHref(location: LocationData | null | undefined, fallback: string) {
  if (location?.googleMapsUrl?.startsWith("https://") || location?.googleMapsUrl?.startsWith("http://")) return location.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location?.name || location?.address || fallback)}`;
}

function DropGap({ date, order, onCreate, onAddNote }: { date: string; order: number; onCreate: (date: string, order: number) => void; onAddNote?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-list:${date}:${order}` });
  return <div ref={setNodeRef} className={`group/gap flex h-11 items-center gap-2 transition sm:h-7 ${isOver ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
    <span className={`h-px flex-1 border-t ${isOver ? "border-2 border-emerald-500" : "border-dotted border-transparent group-hover/gap:border-stone-300 group-focus-within/gap:border-stone-300 dark:group-hover/gap:border-neutral-600"}`} />
    <div className={`flex items-center gap-1 rounded-md text-stone-500 transition-opacity dark:text-stone-400 ${isOver ? "opacity-100" : "opacity-0 group-hover/gap:opacity-100 group-focus-within/gap:opacity-100 [@media(hover:none)]:opacity-100"}`}>
      <button type="button" aria-label={`Add item at position ${order + 1}`} onClick={() => onCreate(date, order)} className="flex min-h-11 items-center gap-1 rounded px-2 text-[11px] font-medium hover:bg-stone-100 focus-visible:outline-2 dark:hover:bg-neutral-800 sm:min-h-7 sm:text-[10px]"><Plus size={12} /> Add event</button>
      {onAddNote && <><span aria-hidden="true" className="h-3 border-l border-stone-300 dark:border-neutral-600" /><button type="button" aria-label={`Add note at position ${order + 1}`} onClick={onAddNote} className="flex min-h-11 items-center gap-1 rounded px-2 text-[11px] font-medium hover:bg-stone-100 focus-visible:outline-2 dark:hover:bg-neutral-800 sm:min-h-7 sm:text-[10px]"><Plus size={12} /> Add note</button></>}
    </div>
  </div>;
}

function DayItemDrop({ date, order, children }: { date: string; order: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-item:${date}:${order}` });
  return <div ref={setNodeRef} className={isOver ? "rounded-xl ring-2 ring-inset ring-emerald-500" : ""}>{children}</div>;
}

const JourneyCard = memo(function JourneyCard({ item, date, number, color, selected, primary, highlighted, onSelect, onInspect, onHover }: { item: TravelObject; date: string; number: number; color: string; selected: boolean; primary: boolean; highlighted: boolean; onSelect: (item: TravelObject, additive?: boolean) => void; onInspect: (item: TravelObject) => void; onHover: (itemId: string | null) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `agenda:${date}:${item.id}`, data: { item, draggedDate: date } });
  const location = item.location?.name ?? item.location?.address;
  const scheduleLabel = itemScheduleLabel(item, "Flexible");
  const cost = item.cost?.amount != null ? `${item.cost.currency} ${item.cost.amount.toLocaleString()}` : null;
  const style: CSSProperties = { borderLeftColor: color, ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}) };
  return <article id={`day-card-${item.id}`} ref={setNodeRef} style={style} onDoubleClick={(event) => { if ((event.target as HTMLElement).closest("[data-reorder-handle]")) return; onInspect(item); }} onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)} className={`relative overflow-hidden rounded-xl border border-l-4 bg-white shadow-sm transition dark:bg-neutral-900 ${selectionRing(selected, primary)} ${highlighted ? "shadow-md ring-2 ring-emerald-400/70" : ""} ${isDragging ? "opacity-40" : ""}`}>
    {item.headerImage && <button type="button" data-item-content onClick={(event) => window.matchMedia("(max-width: 639px)").matches ? onInspect(item) : onSelect(item, event.shiftKey)} className="block h-36 w-full overflow-hidden border-b text-left sm:h-44"><img src={item.headerImage} alt="" className="size-full object-cover" /></button>}
    <div className="flex min-w-0 items-stretch">
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-stone-50 px-1 py-3 dark:bg-neutral-800/60"><span className="grid size-7 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: color }}>{number}</span><button type="button" data-reorder-handle aria-label={`Reorder ${item.title}`} className="flex min-h-11 min-w-11 touch-none items-center justify-center rounded text-muted-foreground hover:bg-stone-200 active:cursor-grabbing dark:hover:bg-neutral-700 sm:min-h-7 sm:min-w-7 sm:cursor-grab" {...attributes} {...listeners}><GripVertical size={15} /></button></div>
      <button type="button" data-item-content onClick={(event) => window.matchMedia("(max-width: 639px)").matches ? onInspect(item) : onSelect(item, event.shiftKey)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold">{item.title}</p>{item.isAllDay ? <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-stone-600 dark:bg-neutral-800 dark:text-stone-300">{scheduleLabel}</span> : <span className={`shrink-0 text-xs font-semibold ${item.startTime && item.endTime ? "text-violet-700 dark:text-violet-300" : "text-stone-500 dark:text-stone-400"}`}>{scheduleLabel}</span>}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{item.type}{cost ? ` · ${cost}` : ""}</p>
          <p className={`mt-2 flex items-center gap-1.5 truncate text-xs ${location ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}><MapPin size={12} className="shrink-0" />{location || "Location unavailable"}</p>
          {item.location?.openingHours?.[0] && <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">{item.location.openingHours[0]}</p>}
          {item.notes && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{item.notes}</p>}
        </div>
      </button>
      {location && <a href={safeMapsHref(item.location, item.title)} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} in Maps`} className="m-2 self-end rounded p-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"><ExternalLink size={13} /></a>}
    </div>
  </article>;
});

function DateSection({ noteFocusId, onAddNote, onSaveNote, onDeleteNote, date, dayNumber, items, trip, typeColors, selectedIds, primarySelectedId, highlightedItemId, sectionRef, onSelect, onInspect, onHover, onCreate, onFocusDay }: { noteFocusId: string | null; onAddNote: (date: string, order: number) => void; onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>; onDeleteNote: (note: TravelObject) => void; date: string; dayNumber: number; items: TravelObject[]; trip: Trip; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; highlightedItemId: string | null; sectionRef: (node: HTMLElement | null) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onInspect: (item: TravelObject) => void; onHover: (itemId: string | null) => void; onCreate: (date: string, order: number) => void; onFocusDay: () => void }) {
  const { setNodeRef: setSectionDropRef, isOver } = useDroppable({ id: `day-section:${date}:${items.length}` });
  const events = eventItems(items);
  const numbers = new Map(events.map((item, index) => [item.id, index + 1]));
  const fixedCount = items.filter((item) => item.startTime && item.endTime && !item.isAllDay).length;
  return <section ref={(node) => { sectionRef(node); setSectionDropRef(node); }} data-date={date} aria-labelledby={`day-heading-${date}`} className={`min-h-[42vh] scroll-mt-0 pb-8 ${isOver ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}>
    <header className={`sticky top-0 z-20 border-y bg-stone-50/95 backdrop-blur dark:bg-neutral-950/95 ${isOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:pb-2"><button type="button" onClick={onFocusDay} aria-label={`Show all ${events.length} ${events.length === 1 ? "place" : "places"} for ${formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })} on the map`} className="flex min-w-0 flex-1 items-end justify-between gap-3 px-4 py-3 text-left max-sm:basis-full hover:bg-stone-100/70 dark:hover:bg-neutral-900/70"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-700 dark:text-emerald-300">Day {dayNumber}</p><h2 id={`day-heading-${date}`} className="mt-0.5 truncate text-base font-semibold">{formatTripDate(`${date}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })}</h2></div><p className="hidden shrink-0 text-right text-[10px] leading-relaxed text-muted-foreground sm:block">{events.length} {events.length === 1 ? "place" : "places"}<br />{fixedCount} fixed {fixedCount === 1 ? "time" : "times"}</p></button><Button type="button" variant="outline" size="sm" className="mr-3 min-h-11 sm:hidden" onClick={() => onCreate(date, items.length)}><Plus size={14} /> Event</Button><Button type="button" variant="ghost" size="sm" className="mr-2 min-h-11 sm:hidden" onClick={() => onAddNote(date, items.length)}>+ Note</Button></div>
    </header>
    <div className="px-3 pt-3 sm:px-4">
      {items.length ? items.map((item, index) => <div key={item.id}><DropGap date={date} order={index} onCreate={onCreate} onAddNote={() => onAddNote(date, index)} /><DayItemDrop date={date} order={index}>{isNote(item) ? <ItemNoteCard item={item} date={date} autoFocus={noteFocusId === item.id} onSave={onSaveNote} onDelete={() => onDeleteNote(item)} /> : <JourneyCard item={item} date={date} number={numbers.get(item.id) ?? 0} color={typeColor(item.type, typeColors)} selected={selectedIds.has(item.id)} primary={primarySelectedId === item.id} highlighted={highlightedItemId === item.id} onSelect={onSelect} onInspect={onInspect} onHover={onHover} />}</DayItemDrop></div>) : <div className={`grid min-h-40 place-items-center rounded-xl border border-dashed px-4 text-center ${isOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}><div><p className="text-sm font-medium">Nothing planned</p><p className="mt-1 text-xs text-muted-foreground">Drop an idea on this date or add an item.</p><div className="mt-3"><DropGap date={date} order={0} onCreate={onCreate} onAddNote={() => onAddNote(date, 0)} /></div></div></div>}
      {items.length > 0 && <DropGap date={date} order={items.length} onCreate={onCreate} onAddNote={() => onAddNote(date, items.length)} />}
    </div>
  </section>;
}

export function DayJourneyView({ onCreateNote, onSaveNote, onDeleteNote, trip, items, typeColors, selectedIds, primarySelectedId, scrollRequest, onActiveDate, onSelect, onInspect, onCreateItem }: { onCreateNote: (date: string, order: number) => Promise<string | undefined>; onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>; onDeleteNote: (id: string) => Promise<void>; trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; scrollRequest: { date: string; nonce: number }; onActiveDate: (date: string) => void; onSelect: (item: TravelObject, additive?: boolean) => void; onInspect: (item: TravelObject) => void; onCreateItem: (date: string, order: number) => void }) {
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
    noteCreating.current = true; setNoteCreateError("");
    try { const id = await onCreateNote(date, order); if (id) setNoteFocusId(id); }
    catch (cause) { setNoteCreateError(cause instanceof Error ? cause.message : "Could not add note."); }
    finally { noteCreating.current = false; }
  }
  const dates = useMemo(() => tripDates(trip), [trip]);
  const grouped = useMemo(() => new Map(dates.map((date) => [date, sortDayDisplayItems(items.filter((item) => itemAppearsOnDate(item, date)))])), [dates, items]);
  const [activeDate, setActiveDate] = useState(() => dates.includes(scrollRequest.date) ? scrollRequest.date : dates[0]);
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
  useEffect(() => { onActiveDateRef.current = onActiveDate; }, [onActiveDate]);
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
    const root = scrollRef.current;
    const section = sectionRefs.current.get(date);
    if (!root || !section) return;
    root.scrollTo({ top: root.scrollTop + section.getBoundingClientRect().top - root.getBoundingClientRect().top, behavior });
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

  const activeItems = useMemo(() => eventItems(grouped.get(activeDate) ?? []), [activeDate, grouped]);
  const mappedItems = activeItems.filter((item) => hasMapCoordinates(item.location));
  const markerNumbers = useMemo(() => new Map(activeItems.map((item, index) => [item.id, index + 1])), [activeItems]);

  function selectFromMap(item: TravelObject) {
    onSelect(item);
    document.getElementById(`day-card-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setMobileSurface("itinerary");
  }

  return <div className="relative flex min-h-0 flex-1 flex-col">
    {deletingNote && <ConfirmDialog title="Delete note?" description="This permanently deletes this note. Other entries remain." pending={deletePending} error={deleteError} onCancel={() => setDeletingNote(null)} onConfirm={() => {
      if (deleteLock.current) return;
      deleteLock.current = true; setDeletePending(true); setDeleteError("");
      void onDeleteNote(deletingNote.id).then(() => { setDeletingNote(null); noteFocusRef.current?.focus(); }).catch((cause) => setDeleteError(cause instanceof Error ? cause.message : "Could not delete note.")).finally(() => { deleteLock.current = false; setDeletePending(false); });
    }} />}
    <div ref={noteFocusRef} tabIndex={-1}>
    {noteCreateError && <div role="alert" className="border-b px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{noteCreateError} Try Add note again.</div>}
    </div>
    <div className="flex shrink-0 border-b bg-white p-1 dark:bg-neutral-900 md:hidden"><Button type="button" size="sm" variant={mobileSurface === "itinerary" ? "secondary" : "ghost"} className="min-h-11 flex-1" onClick={() => setMobileSurface("itinerary")}><List size={14} /> Itinerary</Button><Button type="button" size="sm" variant={mobileSurface === "map" ? "secondary" : "ghost"} className="min-h-11 flex-1" onClick={() => setMobileSurface("map")}><MapIcon size={14} /> Map</Button></div>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,28.5%)_minmax(0,71.5%)]">
      <div ref={scrollRef} className={`${mobileSurface === "map" ? "hidden" : "block"} min-h-0 overflow-y-auto bg-stone-50/60 [overflow-anchor:none] dark:bg-neutral-950 md:block`} aria-label="Continuous trip itinerary">
        {dates.map((date, index) => <DateSection noteFocusId={noteFocusId} onAddNote={(date, order) => void addNote(date, order)} onSaveNote={onSaveNote} onDeleteNote={(note) => { setDeleteError(""); setDeletingNote(note); }} key={date} date={date} dayNumber={index + 1} items={grouped.get(date) ?? []} trip={trip} typeColors={typeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} highlightedItemId={hoveredItemId} sectionRef={(node) => { if (node) sectionRefs.current.set(date, node); else sectionRefs.current.delete(date); }} onSelect={onSelect} onInspect={onInspect} onHover={setHoveredItemId} onCreate={onCreateItem} onFocusDay={() => setActive(date, true)} />)}
      </div>
      <section className={`${mobileSurface === "map" ? "flex" : "hidden"} relative min-h-0 flex-col overflow-hidden border-l bg-white dark:bg-neutral-900 md:flex`} aria-label={`Map for ${activeDate}`}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{formatTripDate(`${activeDate}T12:00:00Z`, trip.timezone, { weekday: "long", month: "long", day: "numeric" })}</p><p className="mt-0.5 text-xs text-muted-foreground">{mappedItems.length} of {activeItems.length} {activeItems.length === 1 ? "place has" : "places have"} map coordinates</p></div>{mapMoved && mappedItems.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => { setMapMoved(false); setRecenterToken((token) => token + 1); }}><LocateFixed size={14} /> Recenter day</Button>}</header>
        {(desktopMapVisible || mobileSurface === "map") && <LeafletMap trip={trip} items={mappedItems} typeColors={typeColors} markerNumbers={markerNumbers} selectedItemId={primarySelectedId} hoveredItemId={hoveredItemId} onHover={setHoveredItemId} onSelect={selectFromMap} fitKey={activeDate} recenterToken={recenterToken} onUserMove={() => setMapMoved(true)} className="min-h-72 flex-1" />}
        {mappedItems.length === 0 && <div className="pointer-events-none absolute inset-x-4 top-20 z-[500] rounded-lg border bg-white/90 px-4 py-3 text-center text-xs text-muted-foreground shadow-sm backdrop-blur dark:bg-neutral-900/90">No locations with coordinates for this day.</div>}
      </section>
    </div>
  </div>;
}
