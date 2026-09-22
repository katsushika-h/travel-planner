"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarRange, Compass, LoaderCircle, Map as MapIcon, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Sun, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";
import { DeleteTripButton } from "@/components/trip/DeleteTripButton";
import { EditTripDialog } from "@/components/trip/EditTripDialog";
import { ImportGoogleMapsCsvButton } from "@/components/trip/ImportGoogleMapsCsvButton";
import { ObjectInspectorPanel } from "@/components/inspector/ObjectInspectorPanel";
import { CalendarView } from "@/components/views/CalendarView";
import { KanbanView } from "@/components/views/KanbanView";
import { TripDaysView } from "@/components/views/TripDaysView";
import { TableView } from "@/components/views/TableView";
import { MapView } from "@/components/views/MapView";
import { api } from "@/lib/api-client";
import { dayIndexForDate, dateParts, zonedDateTimeToUtc } from "@/lib/date-utils";
import { compareScheduleOrder } from "@/lib/schedule-order";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";

const EMPTY_EVENT_TYPES: string[] = [];
const EMPTY_EVENT_TYPE_COLORS: Record<string, string> = {};


function TripList({ trips, activeTripId, collapsed, onSelect }: { trips: Trip[]; activeTripId: string | null; collapsed: boolean; onSelect: (id: string) => void }) {
  return <nav aria-label="Your trips" className="max-h-52 space-y-1 overflow-y-auto pr-1">{trips.length ? trips.map((trip) => <button key={trip.id} type="button" title={collapsed ? trip.title : undefined} aria-current={trip.id === activeTripId ? "page" : undefined} onClick={() => onSelect(trip.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${trip.id === activeTripId ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800"} ${collapsed ? "justify-center px-0" : ""}`}><span className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${trip.id === activeTripId ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500 dark:bg-neutral-800 dark:text-stone-300"}`}>{trip.title.slice(0, 1).toUpperCase()}</span>{!collapsed && <span className="min-w-0 flex-1 truncate">{trip.title}</span>}</button>) : <p className={`px-2 py-2 text-xs text-muted-foreground ${collapsed ? "sr-only" : ""}`}>No trips yet</p>}</nav>;
}

export function AppShell() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<TravelObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const saveQueues = useRef(new Map<string, Partial<TravelObject>>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savingIds = useRef(new Set<string>());
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [itemsTripId, setItemsTripId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const activeTripId = useTravelStore((state) => state.activeTripId);
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  const activeTab = useTravelStore((state) => state.activeTab);
  const setCalendarMode = useTravelStore((state) => state.setCalendarMode);
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
  const selectedItem = items.find((item) => item.id === inspectedItemId) ?? null;
  const activeTripKey = activeTrip?.id;

  async function openCreateItem(date?: string, time?: string, type = "unclassified", title = "(untitled event)", dayOrder?: number) {
    if (!activeTrip) return;
    if (!date) {
      try {
        const created = await api.createObject({ tripId: activeTrip.id, title, type, startDateTime: null, endDateTime: null, dayIndex: null, isAllDay: false, location: null, cost: null, notes: null, tags: [] });
        setItems((current) => [...current, created]);
        replaceSelection([created.id], created.id);
        setInspectedItemId(created.id);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create itinerary item."); }
      return;
    }
    if (!time) {
      try {
        const created = await api.createObject({ tripId: activeTrip.id, title, type, date, startTime: null, endTime: null, placementTime: "09:00", startDateTime: null, endDateTime: null, dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)), dayOrder: null, isAllDay: false, location: null, cost: null, notes: null, tags: [] });
        if (dayOrder !== undefined) setItems(sortBySchedule(await api.reorderObjects({ tripId: activeTrip.id, objectId: created.id, date, dayOrder })));
        else setItems((current) => [...current, created]);
        replaceSelection([created.id], created.id);
        setInspectedItemId(created.id);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create itinerary item."); }
      return;
    }
    const startDate = date ?? activeTrip.startDate.slice(0, 10);
    const startDateTime = zonedDateTimeToUtc(startDate, time, activeTrip.timezone);
    const endDateTime = new Date(Date.parse(startDateTime) + 60 * 60_000).toISOString();
    const endTime = dateParts(endDateTime, activeTrip.timezone).time;
    try {
      const created = await api.createObject({ tripId: activeTrip.id, title, type, date: startDate, startTime: time, endTime, placementTime: null, startDateTime, endDateTime, dayIndex: Math.max(1, dayIndexForDate(startDate, activeTrip.startDate)), dayOrder: null, isAllDay: false, location: null, cost: null, notes: null, tags: [] });
      setItems((current) => sortBySchedule([...current, created]));
      replaceSelection([created.id], created.id);
      setInspectedItemId(created.id);
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

  function sortBySchedule(objects: TravelObject[]) {
    return [...objects].sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || compareScheduleOrder(a, b));
  }

  async function flushItemSave(id: string) {
    if (savingIds.current.has(id)) return;
    savingIds.current.add(id);
    let scheduleChanged = false;
    try {
      while (saveQueues.current.has(id)) {
        const patch = saveQueues.current.get(id)!;
        saveQueues.current.delete(id);
        scheduleChanged ||= ["date", "endDate", "startTime", "endTime", "isAllDay"].some((field) => field in patch);
        try {
          const updated = await api.updateObject(id, patch);
          const newer = saveQueues.current.get(id) ?? {};
          setItems((current) => sortBySchedule(current.map((item) => item.id === id ? { ...updated, ...newer } : item)));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save item changes.");
          break;
        }
      }
      if (scheduleChanged && activeTripKey) {
        const refreshed = await api.objects(activeTripKey);
        setItems(sortBySchedule(refreshed));
      }
    } finally { savingIds.current.delete(id); }
  }

  function changeItem(id: string, patch: Partial<TravelObject>, immediate = false) {
    setItems((current) => sortBySchedule(current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));
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
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedIds((current) => { const next = new Set(current); next.delete(id); setPrimarySelectedId((primary) => primary === id ? next.values().next().value ?? null : primary); return next; });
    setInspectedItemId((current) => current === id ? null : current);
  }

  async function moveItem(item: TravelObject, date: string, time?: string) {
    if (!activeTrip) return;
    if (item.isAllDay) {
      const sourceDate = item.date?.slice(0, 10) ?? date;
      const sourceEndDate = item.endDate?.slice(0, 10) ?? sourceDate;
      const durationDays = Math.max(0, Math.round((Date.parse(`${sourceEndDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86_400_000));
      const endDate = new Date(Date.parse(`${date}T00:00:00Z`) + durationDays * 86_400_000).toISOString().slice(0, 10);
      changeItem(item.id, { date, endDate, startTime: null, endTime: null, placementTime: null, isAllDay: true, dayOrder: null, startDateTime: zonedDateTimeToUtc(date, "00:00", activeTrip.timezone), endDateTime: zonedDateTimeToUtc(endDate, "00:00", activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
      return;
    }
    if (!item.startDateTime || !item.endDateTime) {
      if (!time && !item.startTime && !item.endTime) {
        changeItem(item.id, { date, endDate: date, startTime: null, endTime: null, placementTime: item.placementTime ?? "09:00", isAllDay: false, dayOrder: null, startDateTime: null, endDateTime: null, dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
        return;
      }
      const restoredTime = time ?? item.startTime ?? "09:00";
      const restoredEndTime = item.endTime ?? new Date(Date.parse(`${date}T${restoredTime}:00Z`) + 60 * 60_000).toISOString().slice(11, 16);
      const restoredEndDate = item.endTime ? date : new Date(Date.parse(`${date}T${restoredTime}:00Z`) + 60 * 60_000).toISOString().slice(0, 10);
      changeItem(item.id, { date, endDate: restoredEndDate, startTime: restoredTime, endTime: restoredEndTime, placementTime: null, startDateTime: zonedDateTimeToUtc(date, restoredTime, activeTrip.timezone), endDateTime: zonedDateTimeToUtc(restoredEndDate, restoredEndTime, activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
      return;
    }
    const start = dateParts(item.startDateTime, activeTrip.timezone);
    const end = dateParts(item.endDateTime, activeTrip.timezone);
    const wallStart = Date.parse(`${start.date}T${start.time}:00Z`);
    const wallEnd = Date.parse(`${end.date}T${end.time}:00Z`);
    const duration = Math.max(15, Math.round((wallEnd - wallStart) / 60_000));
    const newStartTime = time ?? start.time;
    const newStartWall = Date.parse(`${date}T${newStartTime}:00Z`);
    const newEndWall = new Date(newStartWall + duration * 60_000);
    const endDate = newEndWall.toISOString().slice(0, 10); const endTime = newEndWall.toISOString().slice(11, 16);
    changeItem(item.id, { date, endDate, startTime: newStartTime, endTime, placementTime: null, startDateTime: zonedDateTimeToUtc(date, newStartTime, activeTrip.timezone), endDateTime: zonedDateTimeToUtc(endDate, endTime, activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
  }

  function resizeItem(item: TravelObject, edge: "start" | "end", time: string) {
    if (!activeTrip || !item.date || !item.startTime || !item.endTime) return;
    const date = item.date.slice(0, 10);
    const startTime = edge === "start" ? time : item.startTime;
    const endTime = edge === "end" ? time : item.endTime;
    changeItem(item.id, { date, endDate: item.endDate?.slice(0, 10) ?? date, startTime, endTime, placementTime: null, isAllDay: false, startDateTime: zonedDateTimeToUtc(date, startTime, activeTrip.timezone), endDateTime: zonedDateTimeToUtc(item.endDate?.slice(0, 10) ?? date, endTime, activeTrip.timezone), dayIndex: Math.max(1, dayIndexForDate(date, activeTrip.startDate)) }, true);
  }

  function replaceSelection(ids: Iterable<string>, primaryId: string | null = null) {
    const next = new Set(ids);
    setSelectedIds(next);
    setPrimarySelectedId(primaryId && next.has(primaryId) ? primaryId : next.values().next().value ?? null);
  }

  function selectItem(item: TravelObject, additive = false, inspect = true) {
    if (!additive) { replaceSelection([item.id], item.id); if (inspect) setInspectedItemId(item.id); return; }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      setPrimarySelectedId((primary) => next.has(item.id) ? item.id : primary === item.id ? next.values().next().value ?? null : primary);
      if (inspect && !additive) setInspectedItemId(next.has(item.id) ? item.id : next.values().next().value ?? null);
      return next;
    });
  }

  function inspectItem(item: TravelObject) {
    if (!selectedIds.has(item.id)) replaceSelection([item.id], item.id); else setPrimarySelectedId(item.id);
    setInspectedItemId(item.id);
  }

  function clearSelection() { replaceSelection([]); setInspectedItemId(null); }
  function closeInspector() { clearSelection(); }

  function changeSelectedItems(ids: string[], patchForItem: (item: TravelObject) => Partial<TravelObject>, immediate = true) {
    for (const item of items) if (ids.includes(item.id)) changeItem(item.id, patchForItem(item), immediate);
  }

  async function deleteSelectedItems(ids: string[]) {
    for (const id of ids) { const timer = saveTimers.current.get(id); if (timer) clearTimeout(timer); saveTimers.current.delete(id); saveQueues.current.delete(id); }
    const results = await Promise.allSettled(ids.map((id) => api.deleteObject(id)));
    const deleted = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
    const failed = ids.filter((id) => !deleted.has(id));
    setItems((current) => current.filter((item) => !deleted.has(item.id)));
    setPendingDeleteIds(null);
    replaceSelection(failed, failed.includes(primarySelectedId ?? "") ? primarySelectedId : failed[0] ?? null);
    setInspectedItemId((current) => current && deleted.has(current) ? failed[0] ?? null : current);
    if (failed.length) setError(`Could not delete ${failed.length === 1 ? "one selected item" : `${failed.length} selected items`}.`);
  }

  async function moveSelectedItems(item: TravelObject, date: string, time?: string) {
    const moving = selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
    const original = item.startDateTime ? dateParts(item.startDateTime, activeTrip?.timezone ?? "UTC") : null;
    const destinationTime = time ?? original?.time ?? "09:00";
    const destinationWall = Date.parse(`${date}T${destinationTime}:00Z`);
    const originalWall = original ? Date.parse(`${original.date}T${original.time}:00Z`) : null;
    await Promise.all(moving.map((candidate) => {
      if (originalWall == null || !candidate.startDateTime) return moveItem(candidate, date, destinationTime);
      const candidateStart = dateParts(candidate.startDateTime, activeTrip?.timezone ?? "UTC");
      const shifted = new Date(Date.parse(`${candidateStart.date}T${candidateStart.time}:00Z`) + destinationWall - originalWall);
      return moveItem(candidate, shifted.toISOString().slice(0, 10), shifted.toISOString().slice(11, 16));
    }));
  }

  async function moveSelectedItemsToDay(item: TravelObject, date: string) {
    const moving = selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
    await Promise.all(moving.map((candidate) => moveItem(candidate, date)));
  }

  async function unscheduleSelectedItems(item: TravelObject) {
    const moving = selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
    for (const candidate of moving) changeItem(candidate.id, { date: null, endDate: null, placementTime: null, isAllDay: false, startDateTime: null, endDateTime: null, dayIndex: null, dayOrder: null }, true);
  }

  async function reorderItem(item: TravelObject, date: string, order: number, clearTime = false, placementTime?: string) {
    if (!activeTrip) return;
    try {
      const updated = await api.reorderObjects({ tripId: activeTrip.id, objectId: item.id, date, dayOrder: order, clearTime, placementTime });
      setItems(sortBySchedule(updated));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reorder itinerary."); }
  }

  async function moveType(item: TravelObject, type: string) {
    const moving = selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
    try {
      const changed = await Promise.all(moving.map((candidate) => candidate.type === type ? Promise.resolve(candidate) : api.updateObject(candidate.id, { type })));
      const byId = new Map(changed.map((candidate) => [candidate.id, candidate]));
      setItems((current) => sortBySchedule(current.map((candidate) => byId.get(candidate.id) ?? candidate)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change item type."); }
  }

  const eventTypes = [...new Set(["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing", ...savedEventTypes, ...items.map((item) => item.type)])];
  const boardItems = items;
  const scheduledBoardItems = items;
  const tripLabel = useMemo(() => activeTrip ? `${activeTrip.title} · ${new Date(`${activeTrip.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "Select a trip", [activeTrip]);
  const selectTrip = (id: string) => { if (id !== activeTripId) clearSelection(); setActiveTripId(id); };
  const onTripCreated = (trip: Trip) => { clearSelection(); setTrips((current) => [...current, trip]); setActiveTripId(trip.id); };
  const onTripSaved = (trip: Trip) => setTrips((current) => current.map((existing) => existing.id === trip.id ? trip : existing));
  const onTripDeleted = () => {
    const remaining = trips.filter((trip) => trip.id !== activeTripId);
    setTrips(remaining);
    setActiveTripId(remaining[0]?.id ?? null);
    setItems([]);
    setItemsTripId(null);
    clearSelection();
  };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "Escape") { setSelectedIds(new Set()); setPrimarySelectedId(null); setInspectedItemId(null); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.size) { event.preventDefault(); setPendingDeleteIds([...selectedIds]); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const calendarMode = ({ q: "month", w: "week", e: "day" } as const)[event.key.toLowerCase() as "q" | "w" | "e"];
      if (calendarMode) { setActiveTab("calendar"); setCalendarMode(calendarMode); event.preventDefault(); return; }
      const tab = ({ "1": "calendar", "2": "kanban", "3": "days", "4": "table", "5": "map" } as const)[event.key as "1" | "2" | "3" | "4" | "5"];
      if (tab) { setActiveTab(tab); event.preventDefault(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, setActiveTab, setCalendarMode]);

  return <main style={{ colorScheme: theme }} className={`flex h-dvh min-h-[620px] overflow-hidden ${theme === "dark" ? "dark bg-neutral-950 text-stone-100" : "bg-[#f7f7f4] text-stone-900"}`}>
    <aside className={`z-10 flex shrink-0 flex-col border-r bg-[#fbfbf9] transition-[width] duration-200 dark:bg-neutral-900 ${collapsed ? "w-[68px]" : "w-[230px]"}`}>
      <div className={`flex h-[68px] items-center border-b ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white"><Compass size={19} /></div>{!collapsed && <div className="min-w-0"><p className="font-semibold tracking-tight">Wayfarer</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-400">Travel planner</p></div>}</div>
      <div className={`px-3 pt-5 ${collapsed ? "px-2" : ""}`}><div className={`mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 ${collapsed ? "justify-center" : ""}`}>{!collapsed && <span>Workspace</span>}<button onClick={toggleSidebar} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</button></div>
        <nav className="space-y-1">{([{ id: "calendar" as const, label: "Calendar", shortcut: "1", icon: CalendarDays }, { id: "kanban" as const, label: "Kanban", shortcut: "2", icon: Rows3 }, { id: "days" as const, label: "Itinerary", shortcut: "3", icon: CalendarRange }, { id: "table" as const, label: "Table", shortcut: "4", icon: TableProperties }, { id: "map" as const, label: "Map", shortcut: "5", icon: MapIcon }]).map(({ id, label, shortcut, icon: Icon }) => <button key={id} title={collapsed ? label : undefined} onClick={() => setActiveTab(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${activeTab === id ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800"} ${collapsed ? "justify-center px-0" : ""}`}><Icon size={17} />{!collapsed && <><span className="flex-1 text-left">{label}</span><kbd className="rounded border px-1 text-[9px] opacity-60">{shortcut}</kbd></>}</button>)}</nav>
      </div>
      <div className={`mt-7 px-3 ${collapsed ? "px-2" : ""}`}>
        <div className={`mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 ${collapsed ? "justify-center" : ""}`}>
          {!collapsed && <span>Your trips</span>}
          {!collapsed && <div className="flex items-center gap-1">{activeTrip && <EditTripDialog key={activeTrip.id} trip={activeTrip} onSaved={onTripSaved} />}<CreateTripDialog onCreated={onTripCreated} /></div>}
        </div>
        <TripList trips={trips} activeTripId={activeTripId} collapsed={collapsed} onSelect={selectTrip} />
      </div>
      <div className={`mt-auto border-t p-3 ${collapsed ? "px-2" : ""}`}>
        <div className="mb-2 space-y-1 border-b pb-2">
          {activeTrip && <ImportGoogleMapsCsvButton compact={collapsed} trip={activeTrip} eventTypes={eventTypes} onAddType={(type) => addEventType(activeTrip.id, type)} onImported={(imported) => setItems((current) => sortBySchedule([...current, ...imported]))} onError={setError} />}
          <Button type="button" variant="ghost" size={collapsed ? "icon" : "sm"} className={collapsed ? "mx-auto flex" : "w-full justify-start"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={collapsed ? theme === "dark" ? "Switch to light mode" : "Switch to dark mode" : undefined} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}{!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}</Button>
        </div>
        <div className={`flex items-center gap-1 rounded-lg p-2 ${collapsed ? "justify-center" : ""}`}><div className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800">{activeTrip?.title.slice(0, 1).toUpperCase() ?? "T"}</div>{!collapsed && <span className="min-w-0 flex-1 truncate text-xs font-medium">{tripLabel}</span>}{activeTrip && <DeleteTripButton trip={activeTrip} compact onDeleted={onTripDeleted} onError={setError} />}</div>
      </div>
    </aside>
    <section className="relative flex min-w-0 flex-1 flex-col">
      {error && <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loadingTrips ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" /></div> : !activeTrip ? <div className="grid flex-1 place-items-center p-6"><div className="max-w-md text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Compass size={25} /></div><h2 className="mt-5 text-xl font-semibold">Make room for the good parts</h2><p className="mt-2 text-sm leading-relaxed text-stone-500">Create a trip to bring dates, stays, meals, and little discoveries into one clear plan.</p><div className="mt-5 flex justify-center"><CreateTripDialog onCreated={onTripCreated} /></div></div></div> : <div className="flex min-h-0 flex-1 gap-3 p-3 sm:p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{itemsTripId !== activeTrip.id ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" /></div> : activeTab === "calendar" ? <CalendarView trip={activeTrip} items={boardItems} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectItem} onInspect={inspectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMove={moveSelectedItems} onResize={resizeItem} onUnschedule={unscheduleSelectedItems} onFlexibleDrop={reorderItem} onCreateItem={openCreateItem} /> : activeTab === "kanban" ? <KanbanView trip={activeTrip} items={scheduledBoardItems} eventTypes={eventTypes} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} inspectedItemId={inspectedItemId} onSetTypeColor={(type, color) => setEventTypeColor(activeTrip.id, type, color)} onAddType={(type) => addEventType(activeTrip.id, type)} onSelect={selectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMoveType={moveType} onReorder={reorderItem} onAddItem={(type) => void openCreateItem(undefined, "09:00", type ?? "unclassified")} /> : activeTab === "days" ? <TripDaysView trip={activeTrip} items={scheduledBoardItems} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} inspectedItemId={inspectedItemId} onSelect={selectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMove={moveSelectedItemsToDay} onReorder={reorderItem} onCreateItem={(date) => void openCreateItem(date)} /> : activeTab === "table" ? <TableView trip={activeTrip} items={boardItems} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={(item, additive) => selectItem(item, additive, false)} onInspect={inspectItem} onSelectionChange={replaceSelection} onChangeItems={changeSelectedItems} /> : <MapView key={activeTrip.id} trip={activeTrip} items={boardItems} typeColors={eventTypeColors} onSelect={inspectItem} />}</div>
        {selectedItem && <div className={`z-[100] min-h-0 ${activeTab === "calendar" ? "absolute inset-y-3 right-3 w-[min(92vw,600px)]" : "w-[min(38vw,760px)] min-w-[400px] shrink-0 max-lg:absolute max-lg:inset-y-3 max-lg:right-3 max-lg:w-[min(92vw,600px)] max-lg:min-w-0"}`}><ObjectInspectorPanel key={selectedItem.id} item={selectedItem} timeZone={activeTrip.timezone} defaultCurrency={activeTrip.defaultCurrency ?? "USD"} onClose={closeInspector} onChange={changeItem} onDelete={deleteItem} tripStartDate={activeTrip.startDate} eventTypes={eventTypes} typeColors={eventTypeColors} darkMode={theme === "dark"} /></div>}
      </div>}
      {pendingDeleteIds && <ConfirmDialog title={`Delete ${pendingDeleteIds.length === 1 ? "selected item" : `${pendingDeleteIds.length} selected items`}?`} description="This cannot be undone." items={items.filter((item) => pendingDeleteIds.includes(item.id)).map((item) => item.title)} onCancel={() => setPendingDeleteIds(null)} onConfirm={() => { void deleteSelectedItems(pendingDeleteIds); }} />}
    </section>
  </main>;
}
