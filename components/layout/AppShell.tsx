"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarRange, ChevronDown, Compass, LoaderCircle, Moon, PanelLeftClose, PanelLeftOpen, Plus, Rows3, Search, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";
import { EditTripDialog } from "@/components/trip/EditTripDialog";
import { ObjectInspectorPanel } from "@/components/inspector/ObjectInspectorPanel";
import { CalendarView } from "@/components/views/CalendarView";
import { KanbanView } from "@/components/views/KanbanView";
import { TripDaysView } from "@/components/views/TripDaysView";
import { api } from "@/lib/api-client";
import { dayIndexForDate, dateParts, zonedDateTimeToUtc } from "@/lib/date-utils";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";

const EMPTY_EVENT_TYPES: string[] = [];
const EMPTY_EVENT_TYPE_COLORS: Record<string, string> = {};


function TripSelector({ trips, activeTripId, collapsed, onSelect }: { trips: Trip[]; activeTripId: string | null; collapsed: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  return <div className="relative">
    <button type="button" disabled={!trips.length} aria-haspopup="menu" aria-expanded={open} title={collapsed ? activeTrip?.title ?? "No trips yet" : undefined} onClick={() => setOpen((value) => !value)} className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-stone-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:cursor-default disabled:opacity-60 ${collapsed ? "justify-center px-0" : ""}`}>
      {collapsed ? <span className="grid size-8 place-items-center rounded-md bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{activeTrip?.title.slice(0, 1).toUpperCase() ?? "—"}</span> : <><span className="min-w-0 flex-1 truncate">{activeTrip?.title ?? "No trips yet"}</span><ChevronDown size={15} className="shrink-0 text-stone-400" /></>}
    </button>
    {open && <div role="menu" aria-label="Select active trip" className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border bg-white p-1 shadow-xl dark:bg-neutral-800">{trips.map((trip) => <button key={trip.id} type="button" role="menuitemradio" aria-checked={trip.id === activeTripId} onClick={() => { onSelect(trip.id); setOpen(false); }} className={`w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-neutral-700 ${trip.id === activeTripId ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : ""}`}>{trip.title}</button>)}</div>}
  </div>;
}

export function AppShell() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<TravelObject[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const saveQueues = useRef(new Map<string, Partial<TravelObject>>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savingIds = useRef(new Set<string>());
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [itemsTripId, setItemsTripId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const activeTripId = useTravelStore((state) => state.activeTripId);
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  const activeTab = useTravelStore((state) => state.activeTab);
  const collapsed = useTravelStore((state) => state.sidebarCollapsed);
  const theme = useTravelStore((state) => state.theme);
  const setActiveTripId = useTravelStore((state) => state.setActiveTripId);
  const setActiveTab = useTravelStore((state) => state.setActiveTab);
  const toggleSidebar = useTravelStore((state) => state.toggleSidebar);
  const toggleTheme = useTravelStore((state) => state.toggleTheme);
  const savedEventTypes = useTravelStore((state) => activeTrip ? state.eventTypesByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPES : EMPTY_EVENT_TYPES);
  const eventTypeColors = useTravelStore((state) => activeTrip ? state.eventTypeColorsByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPE_COLORS : EMPTY_EVENT_TYPE_COLORS);
  const addEventType = useTravelStore((state) => state.addEventType);
  const setEventTypeColor = useTravelStore((state) => state.setEventTypeColor);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const activeTripKey = activeTrip?.id;

  async function openCreateItem(date?: string, time = "09:00", type = "unclassified", title = "(untitled event)") {
    if (!activeTrip) return;
    const startDate = date ?? activeTrip.startDate.slice(0, 10);
    const startDateTime = zonedDateTimeToUtc(startDate, time, activeTrip.timezone);
    const endDateTime = new Date(Date.parse(startDateTime) + 60 * 60_000).toISOString();
    try {
      const created = await api.createObject({ tripId: activeTrip.id, title, type, startDateTime, endDateTime, dayIndex: Math.max(1, dayIndexForDate(startDate, activeTrip.startDate)), isAllDay: false, location: null, cost: null, notes: null, tags: [] });
      setItems((current) => sortByStartTime([...current, created]));
      setSelectedItemId(created.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create itinerary item."); }
  }

  useEffect(() => {
    let cancelled = false;
    void api.trips().then((result) => {
      if (cancelled) return;
      setTrips(result);
      if (!result.some((trip) => trip.id === activeTripId)) setActiveTripId(result[0]?.id ?? null);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load trips.");
    }).finally(() => {
      if (!cancelled) setLoadingTrips(false);
    });
    return () => { cancelled = true; };
  }, [activeTripId, setActiveTripId]);

  useEffect(() => {
    if (!activeTripKey) return;
    let cancelled = false;
    void api.objects(activeTripKey).then((result) => {
      if (cancelled) return;
      setItems(result);
      setItemsTripId(activeTripKey);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load itinerary.");
    });
    return () => { cancelled = true; };
  }, [activeTripKey]);

  function sortByStartTime(objects: TravelObject[]) {
    return [...objects].sort((a, b) =>
      Date.parse(a.startDateTime) - Date.parse(b.startDateTime) || a.createdAt.localeCompare(b.createdAt),
    );
  }

  async function flushItemSave(id: string) {
    if (savingIds.current.has(id)) return;
    savingIds.current.add(id);
    try {
      while (saveQueues.current.has(id)) {
        const patch = saveQueues.current.get(id)!;
        saveQueues.current.delete(id);
        try {
          const updated = await api.updateObject(id, patch);
          const newer = saveQueues.current.get(id) ?? {};
          setItems((current) => sortByStartTime(current.map((item) => item.id === id ? { ...updated, ...newer } : item)));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save item changes.");
          break;
        }
      }
    } finally { savingIds.current.delete(id); }
  }

  function changeItem(id: string, patch: Partial<TravelObject>, immediate = false) {
    setItems((current) => sortByStartTime(current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));
    saveQueues.current.set(id, { ...(saveQueues.current.get(id) ?? {}), ...patch });
    const oldTimer = saveTimers.current.get(id);
    if (oldTimer) clearTimeout(oldTimer);
    if (immediate) { saveTimers.current.delete(id); void flushItemSave(id); }
    else saveTimers.current.set(id, setTimeout(() => { saveTimers.current.delete(id); void flushItemSave(id); }, 450));
  }

  async function deleteItem(id: string) {
    const timer = saveTimers.current.get(id); if (timer) clearTimeout(timer);
    saveTimers.current.delete(id); saveQueues.current.delete(id);
    await api.deleteObject(id);
    setItems((current) => current.filter((item) => item.id !== id)); setSelectedItemId(null);
  }

  async function moveItem(item: TravelObject, date: string, time?: string) {
    if (!activeTrip) return;
    const start = dateParts(item.startDateTime, activeTrip.timezone);
    const end = dateParts(item.endDateTime, activeTrip.timezone);
    const wallStart = Date.parse(`${start.date}T${start.time}:00Z`);
    const wallEnd = Date.parse(`${end.date}T${end.time}:00Z`);
    const duration = Math.max(15, Math.round((wallEnd - wallStart) / 60_000));
    const newStartTime = time ?? start.time;
    const newStartWall = Date.parse(`${date}T${newStartTime}:00Z`);
    const newEndWall = new Date(newStartWall + duration * 60_000);
    const endDate = newEndWall.toISOString().slice(0, 10); const endTime = newEndWall.toISOString().slice(11, 16);
    changeItem(item.id, { startDateTime: zonedDateTimeToUtc(date, newStartTime, activeTrip.timezone), endDateTime: zonedDateTimeToUtc(endDate, endTime, activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
  }

  async function resizeItem(item: TravelObject, endDate: string, endTime: string) {
    if (!activeTrip) return;
    changeItem(item.id, { endDateTime: zonedDateTimeToUtc(endDate, endTime, activeTrip.timezone) }, true);
  }

  async function resizeStartItem(item: TravelObject, startDate: string, startTime: string) {
    if (!activeTrip) return;
    changeItem(item.id, { startDateTime: zonedDateTimeToUtc(startDate, startTime, activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(startDate, activeTrip.startDate)) }, true);
  }

  function closeInspector() { setSelectedItemId(null); }

  async function moveType(item: TravelObject, type: string) { changeItem(item.id, { type }, true); }

  const eventTypes = [...new Set(["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing", ...savedEventTypes, ...items.map((item) => item.type)])];
  const boardItems = items;
  const tripLabel = useMemo(() => activeTrip ? `${activeTrip.title} · ${new Date(`${activeTrip.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "Select a trip", [activeTrip]);
  const selectTrip = (id: string) => { if (id !== activeTripId) setSelectedItemId(null); setActiveTripId(id); };
  const onTripCreated = (trip: Trip) => { setSelectedItemId(null); setTrips((current) => [...current, trip]); setActiveTripId(trip.id); };
  const onTripSaved = (trip: Trip) => setTrips((current) => current.map((existing) => existing.id === trip.id ? trip : existing));
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const tab = ({ c: "calendar", k: "kanban", i: "days" } as const)[event.key.toLowerCase() as "c" | "k" | "i"];
      if (tab) { setActiveTab(tab); event.preventDefault(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveTab]);

  return <main style={{ colorScheme: theme }} className={`flex h-dvh min-h-[620px] overflow-hidden ${theme === "dark" ? "dark bg-neutral-950 text-stone-100" : "bg-[#f7f7f4] text-stone-900"}`}>
    <aside className={`z-10 flex shrink-0 flex-col border-r bg-[#fbfbf9] transition-[width] duration-200 dark:bg-neutral-900 ${collapsed ? "w-[68px]" : "w-[230px]"}`}>
      <div className={`flex h-[68px] items-center border-b ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white"><Compass size={19} /></div>{!collapsed && <div className="min-w-0"><p className="font-semibold tracking-tight">Wayfarer</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-400">Travel planner</p></div>}</div>
      <div className={`px-3 pt-5 ${collapsed ? "px-2" : ""}`}><div className={`mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 ${collapsed ? "justify-center" : ""}`}>{!collapsed && <span>Workspace</span>}<button onClick={toggleSidebar} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</button></div>
        <nav className="space-y-1">{([{ id: "calendar" as const, label: "Calendar", shortcut: "C", icon: CalendarDays }, { id: "kanban" as const, label: "Kanban", shortcut: "K", icon: Rows3 }, { id: "days" as const, label: "Itinerary", shortcut: "I", icon: CalendarRange }]).map(({ id, label, shortcut, icon: Icon }) => <button key={id} title={collapsed ? label : undefined} onClick={() => setActiveTab(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${activeTab === id ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800"} ${collapsed ? "justify-center px-0" : ""}`}><Icon size={17} />{!collapsed && <><span className="flex-1 text-left">{label}</span><kbd className="rounded border px-1 text-[9px] opacity-60">{shortcut}</kbd></>}</button>)}</nav>
      </div>
      <div className={`mt-7 px-3 ${collapsed ? "px-2" : ""}`}>
        <div className={`mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 ${collapsed ? "justify-center" : ""}`}>
          {!collapsed && <span>Your trips</span>}
          {!collapsed && <div className="flex items-center gap-1">{activeTrip && <EditTripDialog key={activeTrip.id} trip={activeTrip} onSaved={onTripSaved} />}<CreateTripDialog onCreated={onTripCreated} /></div>}
        </div>
        <TripSelector trips={trips} activeTripId={activeTripId} collapsed={collapsed} onSelect={selectTrip} />
      </div>
      <div className="mt-auto border-t p-3">{!collapsed && <div className="mb-3 rounded-lg bg-stone-100/80 p-3"><div className="flex items-center gap-2 text-xs font-medium"><Sparkles size={14} className="text-emerald-700" />Plan at your pace</div><p className="mt-1 text-[11px] leading-relaxed text-stone-500">Keep every stop and detail together in one calm workspace.</p></div>}<div className={`flex items-center gap-2 rounded-lg p-2 ${collapsed ? "justify-center" : ""}`}><div className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800">{activeTrip?.title.slice(0, 1).toUpperCase() ?? "T"}</div>{!collapsed && <span className="min-w-0 flex-1 truncate text-xs font-medium">{tripLabel}</span>}</div></div>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-[68px] items-center justify-between gap-3 border-b bg-[#fbfbf9] px-4 dark:bg-neutral-900 sm:px-7"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-800 dark:text-emerald-300">Your journey</p><h1 className="truncate text-base font-semibold sm:text-lg">{activeTrip?.title ?? "Travel workspace"}</h1></div><div className="flex items-center gap-2">{activeTrip && <><Button onClick={() => openCreateItem()}><Plus /> Add item</Button></>}<Button variant="ghost" size="icon" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</Button><Button variant="ghost" size="icon" aria-label="Search" title="Search coming soon"><Search /></Button></div></header>
      {error && <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loadingTrips ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" /></div> : !activeTrip ? <div className="grid flex-1 place-items-center p-6"><div className="max-w-md text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Compass size={25} /></div><h2 className="mt-5 text-xl font-semibold">Make room for the good parts</h2><p className="mt-2 text-sm leading-relaxed text-stone-500">Create a trip to bring dates, stays, meals, and little discoveries into one clear plan.</p><div className="mt-5 flex justify-center"><CreateTripDialog onCreated={onTripCreated} /></div></div></div> : <div className="flex min-h-0 flex-1 gap-3 p-3 sm:p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{itemsTripId !== activeTrip.id ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" /></div> : activeTab === "calendar" ? <CalendarView trip={activeTrip} items={boardItems} typeColors={eventTypeColors} onSelect={(item) => setSelectedItemId(item.id)} onMove={moveItem} onResize={resizeItem} onResizeStart={resizeStartItem} onCreateItem={openCreateItem} /> : activeTab === "kanban" ? <KanbanView trip={activeTrip} items={boardItems} eventTypes={eventTypes} typeColors={eventTypeColors} onSetTypeColor={(type, color) => setEventTypeColor(activeTrip.id, type, color)} onAddType={(type) => addEventType(activeTrip.id, type)} onSelect={(item) => setSelectedItemId(item.id)} onMoveType={moveType} onAddItem={(type) => void openCreateItem(undefined, "09:00", type ?? "unclassified")} /> : <TripDaysView trip={activeTrip} items={boardItems} typeColors={eventTypeColors} onSelect={(item) => setSelectedItemId(item.id)} onMove={moveItem} onCreateItem={(date) => void openCreateItem(date)} />}</div>
        {selectedItem && <div className="z-20 min-h-0 w-[min(38vw,760px)] min-w-[400px] shrink-0 max-lg:absolute max-lg:inset-y-3 max-lg:right-3 max-lg:w-[min(92vw,600px)] max-lg:min-w-0"><ObjectInspectorPanel key={selectedItem.id} item={selectedItem} timeZone={activeTrip.timezone} defaultCurrency={activeTrip.defaultCurrency ?? "USD"} onClose={closeInspector} onChange={changeItem} onDelete={deleteItem} tripStartDate={activeTrip.startDate} eventTypes={eventTypes} typeColors={eventTypeColors} darkMode={theme === "dark"} /></div>}
      </div>}
    </section>
  </main>;
}
