"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { CalendarDays, CalendarRange, ChevronDown, Compass, List, LoaderCircle, Map as MapIcon, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, ReceiptText, Rows3, Sun, TableProperties, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";
import { DeleteTripButton } from "@/components/trip/DeleteTripButton";
import { EditTripDialog } from "@/components/trip/EditTripDialog";
import { ExportIcsButton } from "@/components/trip/ExportIcsButton";
import { ImportGoogleMapsCsvButton } from "@/components/trip/ImportGoogleMapsCsvButton";
import { ObjectInspectorPanel } from "@/components/inspector/ObjectInspectorPanel";
import { CalendarView } from "@/components/views/CalendarView";
import { KanbanView } from "@/components/views/KanbanView";
import { TripDaysView } from "@/components/views/TripDaysView";
import { TableView } from "@/components/views/TableView";
import { MapView } from "@/components/views/MapView";
import { ExpensesView } from "@/components/views/ExpensesView";
import { useTripData } from "@/components/layout/useTripData";
import { useItemSaveQueue } from "@/components/layout/useItemSaveQueue";
import { useItemSelection } from "@/components/layout/useItemSelection";
import { eventItems, isNote } from "@/lib/note-domain";
import { api } from "@/lib/api-client";
import { groupedMoveTarget, oneHourEnd, resizeFixedTimeRange, schedulePatchForMove } from "@/lib/schedule-domain";
import { mergeCreatedTravelObject, sortTravelObjects } from "@/lib/schedule-order";
import { useTravelStore } from "@/store/use-travel-store";
import type { CreateTravelObjectInput, TravelObject, Trip, UpdateTravelObjectInput } from "@/types/travel";

const EMPTY_EVENT_TYPES: string[] = [];
const EMPTY_EVENT_TYPE_COLORS: Record<string, string> = {};


function TripList({ trips, activeTripId, collapsed, onSelect }: { trips: Trip[]; activeTripId: string | null; collapsed: boolean; onSelect: (id: string) => void }) {
  return <nav aria-label="Your trips" className="max-h-52 space-y-1 overflow-y-auto pr-1">{trips.length ? trips.map((trip) => <button key={trip.id} type="button" title={collapsed ? trip.title : undefined} aria-current={trip.id === activeTripId ? "page" : undefined} onClick={() => onSelect(trip.id)} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition sm:min-h-0 ${trip.id === activeTripId ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800"} ${collapsed ? "justify-center px-0" : ""}`}><span className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${trip.id === activeTripId ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500 dark:bg-neutral-800 dark:text-stone-300"}`}>{trip.title.slice(0, 1).toUpperCase()}</span>{!collapsed && <span className="min-w-0 flex-1 truncate">{trip.title}</span>}</button>) : <p className={`px-2 py-2 text-xs text-muted-foreground ${collapsed ? "sr-only" : ""}`}>No trips yet</p>}</nav>;
}

export function AppShell() {
  const { selectedIds, setSelectedIds, primarySelectedId, setPrimarySelectedId, inspectedItemId, setInspectedItemId, replaceSelection, selectItem, inspectItem, clearSelection, closeInspector } = useItemSelection();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [deletingItems, setDeletingItems] = useState(false);
  const [error, setError] = useState("");
  const activeTripId = useTravelStore((state) => state.activeTripId);
  const setActiveTripId = useTravelStore((state) => state.setActiveTripId);
  const { trips, setTrips, items, setItems, loadingTrips, tripsLoadError, retryTrips, itemsTripId, setItemsTripId, itemsLoadError, retryItems, activeTrip } = useTripData(activeTripId, setActiveTripId);
  const activeTab = useTravelStore((state) => state.activeTab);
  const calendarMode = useTravelStore((state) => state.calendarMode);
  const setCalendarMode = useTravelStore((state) => state.setCalendarMode);
  const collapsed = useTravelStore((state) => state.sidebarCollapsed);
  const [narrowScreen, setNarrowScreen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrowScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const sidebarCollapsed = narrowScreen ? !mobileSidebarOpen : collapsed;
  const mobileDestination = activeTab === "calendar" ? calendarMode === "day" ? "day" : "calendar" : activeTab === "map" ? "places" : activeTab === "expenses" ? "spend" : "more";
  const theme = useTravelStore((state) => state.theme);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);
  const setActiveTab = useTravelStore((state) => state.setActiveTab);
  const toggleSidebar = useTravelStore((state) => state.toggleSidebar);
  const toggleTheme = useTravelStore((state) => state.toggleTheme);
  const savedEventTypes = useTravelStore((state) => activeTrip ? state.eventTypesByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPES : EMPTY_EVENT_TYPES);
  const eventTypeColors = useTravelStore((state) => activeTrip ? state.eventTypeColorsByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPE_COLORS : EMPTY_EVENT_TYPE_COLORS);
  const addEventType = useTravelStore((state) => state.addEventType);
  const setEventTypeColor = useTravelStore((state) => state.setEventTypeColor);
  const selectedItem = items.find((item) => item.id === inspectedItemId && !isNote(item)) ?? null;
  const activeTripKey = activeTrip?.id;
  const activeTripKeyRef = useRef(activeTripKey);
  useLayoutEffect(() => { activeTripKeyRef.current = activeTripKey; }, [activeTripKey]);
  const { changeItem, cancelPendingSave } = useItemSaveQueue(activeTripKey, setItems, setError);

  function openMobileMenu(event: MouseEvent<HTMLButtonElement>) {
    mobileMenuTriggerRef.current = event.currentTarget;
    setMobileSidebarOpen(true);
  }

  function closeMobileMenu() {
    setMobileSidebarOpen(false);
    mobileMenuTriggerRef.current?.focus();
  }

  function handleMobileMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!mobileSidebarOpen || event.key !== "Tab") return;
    const focusable = [...(mobileMenuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"])') ?? [])].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  useEffect(() => {
    if (mobileSidebarOpen) mobileMenuCloseRef.current?.focus();
  }, [mobileSidebarOpen]);

  async function openCreateItem(date?: string, time?: string, type = "unclassified", title = "(untitled event)", dayOrder?: number) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    let schedule: Pick<CreateTravelObjectInput, "date" | "endDate" | "startTime" | "endTime" | "placementTime" | "dayOrder">;
    if (!date) schedule = { date: null, endDate: null, startTime: null, endTime: null, placementTime: null };
    else if (!time) schedule = { date, endDate: date, startTime: null, endTime: null, placementTime: "09:00", dayOrder: null };
    else {
      const { endDate, endTime } = oneHourEnd(date, time, activeTrip.timezone);
      schedule = { date, endDate, startTime: time, endTime, placementTime: null, dayOrder: null };
    }
    try {
      const created = await api.createObject({ tripId, title, type, ...schedule, isAllDay: false, location: null, cost: null, notes: null, tags: [] });
      if (activeTripKeyRef.current !== tripId) return;
      if (date && !time && dayOrder !== undefined) {
        const reordered = await api.reorderObjects({ tripId, objectId: created.id, date, dayOrder });
        if (activeTripKeyRef.current !== tripId) return;
        setItems(sortTravelObjects(reordered));
      } else setItems((current) => date ? mergeCreatedTravelObject(current, created) : [...current, created]);
      replaceSelection([created.id], created.id);
      setInspectedItemId(created.id);
    } catch (cause) { if (activeTripKeyRef.current === tripId) setError(cause instanceof Error ? cause.message : "Could not create itinerary item."); }
  }

  async function createNote(date: string, order: number) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    const created = await api.createObject({ tripId, kind: "note", type: "unclassified", title: "Note", noteBody: "", date, endDate: date, isAllDay: false, dayOrder: order });
    if (activeTripKeyRef.current !== tripId) return;
    setItems((current) => mergeCreatedTravelObject(current, created));
    return created.id;
  }

  async function saveNote(id: string, data: { title: string; noteBody: string }) {
    const tripId = activeTrip?.id;
    const updated = await api.updateObject(id, data);
    if (activeTripKeyRef.current !== tripId) return;
    // A content response must not overwrite a concurrent move or reorder.
    setItems((current) => current.map((item) => item.id === id ? { ...item, title: updated.title, noteBody: updated.noteBody, updatedAt: updated.updatedAt } : item));
  }

  async function deleteItem(id: string) {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    cancelPendingSave(id);
    await api.deleteObject(id);
    if (activeTripKeyRef.current !== tripId) return;
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedIds((current) => { const next = new Set(current); next.delete(id); setPrimarySelectedId((primary) => primary === id ? next.values().next().value ?? null : primary); return next; });
    setInspectedItemId((current) => current === id ? null : current);
  }

  async function moveItem(item: TravelObject, date: string, time?: string) {
    if (!activeTrip) return;
    const patch = schedulePatchForMove(item, date, time);
    if (patch) changeItem(item.id, patch, true);
  }

  function resizeItem(item: TravelObject, edge: "start" | "end", time: string) {
    if (!activeTrip || !item.date || !item.startTime || !item.endTime) return;
    const date = item.date.slice(0, 10);
    const schedule = { ...resizeFixedTimeRange(date, item.endDate?.slice(0, 10) ?? null, item.startTime, item.endTime, edge, time), isAllDay: false };
    changeItem(item.id, { ...schedule, placementTime: null }, true);
  }

  function changeSelectedItems(ids: string[], patchForItem: (item: TravelObject) => UpdateTravelObjectInput, immediate = true) {
    for (const item of items) if (ids.includes(item.id)) changeItem(item.id, patchForItem(item), immediate);
  }

  async function deleteSelectedItems(ids: string[]) {
    const tripId = activeTrip?.id;
    if (!tripId || deletingItems) return;
    setDeletingItems(true);
    for (const id of ids) cancelPendingSave(id);
    const deleted = new Set<string>();
    for (const id of ids) {
      try { await api.deleteObject(id); deleted.add(id); }
      catch { /* keep failed items selected below */ }
    }
    setDeletingItems(false);
    if (activeTripKeyRef.current !== tripId) return;
    const failed = ids.filter((id) => !deleted.has(id));
    setItems((current) => current.filter((item) => !deleted.has(item.id)));
    setPendingDeleteIds(null);
    replaceSelection(failed, failed.includes(primarySelectedId ?? "") ? primarySelectedId : failed[0] ?? null);
    setInspectedItemId((current) => current && deleted.has(current) ? failed[0] ?? null : current);
    if (failed.length) setError(`Could not delete ${failed.length === 1 ? "one selected item" : `${failed.length} selected items`}.`);
  }

  function selectedActionItems(item: TravelObject) {
    return selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
  }

  async function moveSelectedItems(item: TravelObject, date: string, time?: string) {
    const moving = selectedActionItems(item);
    await Promise.all(moving.map((candidate) => {
      const target = groupedMoveTarget(item, candidate, date, activeTrip?.timezone ?? "UTC", time);
      return moveItem(candidate, target.date, target.time);
    }));
  }

  async function moveSelectedItemsToDay(item: TravelObject, date: string) {
    const moving = selectedActionItems(item);
    await Promise.all(moving.map((candidate) => moveItem(candidate, date)));
  }

  async function unscheduleSelectedItems(item: TravelObject) {
    const moving = selectedActionItems(item);
    for (const candidate of moving) changeItem(candidate.id, { date: null, endDate: null, placementTime: null, isAllDay: false, dayOrder: null }, true);
  }

  async function reorderItem(item: TravelObject, date: string, order: number, clearTime = false, placementTime?: string) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    if (item.isAllDay) { if (item.date?.slice(0, 10) !== date) await moveItem(item, date); return; }
    try {
      const updated = await api.reorderObjects({ tripId, objectId: item.id, date, dayOrder: order, clearTime, placementTime });
      if (activeTripKeyRef.current === tripId) setItems(sortTravelObjects(updated));
    } catch (cause) { if (activeTripKeyRef.current === tripId) setError(cause instanceof Error ? cause.message : "Could not reorder itinerary."); }
  }

  async function moveType(item: TravelObject, type: string) {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    const moving = selectedActionItems(item);
    try {
      const changed = await Promise.all(moving.map((candidate) => candidate.type === type ? Promise.resolve(candidate) : api.updateObject(candidate.id, { type })));
      if (activeTripKeyRef.current !== tripId) return;
      const byId = new Map(changed.map((candidate) => [candidate.id, candidate]));
      setItems((current) => sortTravelObjects(current.map((candidate) => byId.get(candidate.id) ?? candidate)));
    } catch (cause) { if (activeTripKeyRef.current === tripId) setError(cause instanceof Error ? cause.message : "Could not change item type."); }
  }

  const events = eventItems(items);
  const eventTypes = [...new Set(["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing", ...savedEventTypes, ...events.map((item) => item.type)])];
  const itineraryItems = events.filter((item) => item.date !== null);
  const tripLabel = useMemo(() => activeTrip ? `${activeTrip.title} · ${new Date(`${activeTrip.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "Select a trip", [activeTrip]);
  const selectTrip = (id: string) => { if (id !== activeTripId) { clearSelection(); setPendingDeleteIds(null); } setActiveTripId(id); };
  const onTripCreated = (trip: Trip) => { clearSelection(); setTrips((current) => [...current, trip]); setActiveTripId(trip.id); };
  const onTripSaved = (trip: Trip) => setTrips((current) => current.map((existing) => existing.id === trip.id ? trip : existing));
  const onTripDeleted = (deletedTripId: string) => {
    const remaining = trips.filter((trip) => trip.id !== deletedTripId);
    setTrips((current) => current.filter((trip) => trip.id !== deletedTripId));
    if (activeTripKeyRef.current !== deletedTripId) return;
    setActiveTripId(remaining[0]?.id ?? null);
    setItems([]);
    setItemsTripId(null);
    clearSelection();
  };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "Escape" && mobileSidebarOpen) { closeMobileMenu(); return; }
      if (event.key === "Escape") { setSelectedIds(new Set()); setPrimarySelectedId(null); setInspectedItemId(null); return; }
      if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "Delete" || event.key === "Backspace") && activeTab !== "expenses" && selectedIds.size) { event.preventDefault(); setPendingDeleteIds([...selectedIds]); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const calendarMode = ({ q: "month", w: "week", e: "day" } as const)[event.key.toLowerCase() as "q" | "w" | "e"];
      if (calendarMode) { setActiveTab("calendar"); setCalendarMode(calendarMode); event.preventDefault(); return; }
      const tab = ({ "1": "calendar", "2": "kanban", "3": "days", "4": "table", "5": "map", "6": "expenses" } as const)[event.key as "1" | "2" | "3" | "4" | "5" | "6"];
      if (tab) { setActiveTab(tab); event.preventDefault(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, mobileSidebarOpen, selectedIds, setActiveTab, setCalendarMode, setSelectedIds, setPrimarySelectedId, setInspectedItemId]);

  return <main style={{ colorScheme: theme }} className={`flex h-dvh min-h-0 overflow-hidden sm:min-h-[620px] ${theme === "dark" ? "dark bg-neutral-950 text-stone-100" : "bg-[#f7f7f4] text-stone-900"}`}>
    {mobileSidebarOpen && <button type="button" className="fixed inset-0 z-40 bg-black/35 sm:hidden" aria-label="Close navigation" onClick={closeMobileMenu} />}
    <aside ref={mobileMenuRef} role={mobileSidebarOpen && narrowScreen ? "dialog" : undefined} aria-modal={mobileSidebarOpen && narrowScreen ? true : undefined} aria-label="Workspace and trips" onKeyDown={handleMobileMenuKeyDown} className={`z-50 hidden shrink-0 flex-col border-r bg-[#fbfbf9] transition-[width] duration-200 dark:bg-neutral-900 sm:flex ${sidebarCollapsed ? "sm:w-[68px]" : "sm:w-[230px]"} ${mobileSidebarOpen ? "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:flex max-sm:max-h-[85dvh] max-sm:w-full max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:border-t max-sm:shadow-2xl" : ""}`}>
      <div className="flex items-center justify-between border-b px-4 py-3 sm:hidden"><p className="text-sm font-semibold">Workspace and trips</p><Button ref={mobileMenuCloseRef} type="button" variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={closeMobileMenu} aria-label="Close menu"><X /></Button></div>
      <div className={`hidden h-[68px] items-center border-b sm:flex ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"}`}><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white"><Compass size={19} /></div>{!sidebarCollapsed && <div className="min-w-0"><p className="font-semibold tracking-tight">Wayfarer</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-400">Travel planner</p></div>}</div>
      <div className={`px-3 pt-5 ${sidebarCollapsed ? "px-2" : ""}`}><div className={`mb-2 hidden items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 sm:flex ${sidebarCollapsed ? "justify-center" : ""}`}>{!sidebarCollapsed && <span>Workspace</span>}<button onClick={toggleSidebar} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</button></div>
        <nav className="space-y-1">{([{ id: "calendar" as const, label: "Calendar", shortcut: "1", icon: CalendarDays }, { id: "kanban" as const, label: "Kanban", shortcut: "2", icon: Rows3 }, { id: "days" as const, label: "Itinerary", shortcut: "3", icon: CalendarRange }, { id: "table" as const, label: "Table", shortcut: "4", icon: TableProperties }, { id: "map" as const, label: "Map", shortcut: "5", icon: MapIcon }, { id: "expenses" as const, label: "Expenses", shortcut: "6", icon: ReceiptText }]).map(({ id, label, shortcut, icon: Icon }) => <button key={id} title={sidebarCollapsed ? label : undefined} onClick={() => { setActiveTab(id); closeMobileMenu(); }} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition sm:min-h-0 ${activeTab === id ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800"} ${sidebarCollapsed ? "justify-center px-0" : ""}`}><Icon size={17} />{!sidebarCollapsed && <><span className="flex-1 text-left">{label}</span><kbd className="rounded border px-1 text-[9px] opacity-60">{shortcut}</kbd></>}</button>)}</nav>
      </div>
      <div className={`mt-7 px-3 ${sidebarCollapsed ? "px-2" : ""}`}>
        <div className={`mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400 ${sidebarCollapsed ? "justify-center" : ""}`}>
          {!sidebarCollapsed && <span>Your trips</span>}
          {!sidebarCollapsed && <div className="flex items-center gap-1">{activeTrip && <EditTripDialog key={activeTrip.id} trip={activeTrip} onSaved={onTripSaved} />}<CreateTripDialog onCreated={(trip) => { onTripCreated(trip); closeMobileMenu(); }} /></div>}
        </div>
        <TripList trips={trips} activeTripId={activeTripId} collapsed={sidebarCollapsed} onSelect={(id) => { selectTrip(id); closeMobileMenu(); }} />
      </div>
      <div className={`mt-auto border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${sidebarCollapsed ? "px-2" : ""}`}>
        <div className="mb-2 space-y-1 border-b pb-2">
          {activeTrip && <ImportGoogleMapsCsvButton compact={sidebarCollapsed} trip={activeTrip} eventTypes={eventTypes} onAddType={(type) => addEventType(activeTrip.id, type)} onImported={(imported) => { if (activeTripKeyRef.current === activeTrip.id) setItems((current) => sortTravelObjects([...current, ...imported])); }} onError={(message) => { if (activeTripKeyRef.current === activeTrip.id) setError(message); }} />}
          {activeTrip && itemsTripId === activeTrip.id && <ExportIcsButton compact={sidebarCollapsed} trip={activeTrip} items={events} />}
          <Button type="button" variant="ghost" size={sidebarCollapsed ? "icon" : "sm"} className={sidebarCollapsed ? "mx-auto flex size-11 sm:size-8" : "min-h-11 w-full justify-start sm:min-h-0"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={sidebarCollapsed ? theme === "dark" ? "Switch to light mode" : "Switch to dark mode" : undefined} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}{!sidebarCollapsed && (theme === "dark" ? "Light mode" : "Dark mode")}</Button>
        </div>
        <div className={`flex items-center gap-1 rounded-lg p-2 ${sidebarCollapsed ? "justify-center" : ""}`}><div className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800">{activeTrip?.title.slice(0, 1).toUpperCase() ?? "T"}</div>{!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-xs font-medium">{tripLabel}</span>}{activeTrip && <DeleteTripButton trip={activeTrip} compact onDeleted={() => onTripDeleted(activeTrip.id)} onError={(message) => { if (activeTripKeyRef.current === activeTrip.id) setError(message); }} />}</div>
      </div>
    </aside>
    <section className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-white px-4 py-3 dark:bg-neutral-900 sm:hidden"><div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-800 text-white"><Compass size={17} /></span><span className="truncate text-sm font-semibold">Wayfarer</span></div><button type="button" onClick={openMobileMenu} aria-expanded={mobileSidebarOpen} aria-label="Choose trip and open workspace menu" className="flex min-h-11 min-w-0 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><span className="max-w-36 truncate">{activeTrip?.title ?? "Choose trip"}</span><ChevronDown size={14} className="shrink-0" /></button></header>
      {error && <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loadingTrips ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" aria-label="Loading trips" /></div> : tripsLoadError ? <div className="grid flex-1 place-items-center p-6"><div role="alert" className="max-w-sm text-center"><p className="text-sm text-rose-700 dark:text-rose-300">{tripsLoadError}</p><Button type="button" className="mt-4 min-h-11" onClick={retryTrips}>Retry loading trips</Button></div></div> : !activeTrip ? <div className="grid flex-1 place-items-center p-6"><div className="max-w-md text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Compass size={25} /></div><h2 className="mt-5 text-xl font-semibold">Make room for the good parts</h2><p className="mt-2 text-sm leading-relaxed text-stone-500">Create a trip to bring dates, stays, meals, and little discoveries into one clear plan.</p><div className="mt-5 flex justify-center"><CreateTripDialog onCreated={onTripCreated} /></div></div></div> : <div className="flex min-h-0 flex-1 gap-3 p-0 sm:p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{itemsTripId !== activeTrip.id ? <div className="grid flex-1 place-items-center p-6">{itemsLoadError ? <div role="alert" className="max-w-sm text-center"><p className="text-sm text-rose-700 dark:text-rose-300">{itemsLoadError}</p><Button type="button" className="mt-4 min-h-11" onClick={retryItems}>Retry loading itinerary</Button></div> : <LoaderCircle className="animate-spin text-emerald-700" aria-label="Loading itinerary" />}</div> : activeTab === "calendar" ? <CalendarView onCreateNote={createNote} onSaveNote={saveNote} onDeleteNote={deleteItem} trip={activeTrip} items={items} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={selectItem} onInspect={inspectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMove={moveSelectedItems} onResize={resizeItem} onUnschedule={unscheduleSelectedItems} onFlexibleDrop={reorderItem} onCreateItem={openCreateItem} /> : activeTab === "kanban" ? <KanbanView trip={activeTrip} items={events} eventTypes={eventTypes} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} inspectedItemId={inspectedItemId} onSetTypeColor={(type, color) => setEventTypeColor(activeTrip.id, type, color)} onAddType={(type) => addEventType(activeTrip.id, type)} onSelect={selectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMoveType={moveType} onReorder={reorderItem} onAddItem={(type) => void openCreateItem(undefined, "09:00", type ?? "unclassified")} /> : activeTab === "days" ? <TripDaysView trip={activeTrip} items={itineraryItems} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} inspectedItemId={inspectedItemId} onSelect={selectItem} onSelectForDrag={(item) => selectItem(item, false, false)} onMove={moveSelectedItemsToDay} onReorder={reorderItem} onCreateItem={(date) => void openCreateItem(date)} /> : activeTab === "table" ? <TableView trip={activeTrip} items={events} typeColors={eventTypeColors} selectedIds={selectedIds} primarySelectedId={primarySelectedId} onSelect={(item, additive) => selectItem(item, additive, false)} onInspect={inspectItem} onSelectionChange={replaceSelection} onChangeItems={changeSelectedItems} /> : activeTab === "expenses" ? <ExpensesView key={activeTrip.id} trip={activeTrip} items={events} /> : <MapView key={activeTrip.id} trip={activeTrip} items={events} typeColors={eventTypeColors} onSelect={inspectItem} />}</div>
        {activeTab !== "expenses" && selectedItem && <div role={narrowScreen ? "dialog" : undefined} aria-modal={narrowScreen ? true : undefined} aria-label={narrowScreen ? `Edit ${selectedItem.title}` : undefined} className={`z-[100] min-h-0 max-sm:fixed max-sm:inset-0 ${activeTab === "calendar" ? "sm:absolute sm:inset-y-3 sm:right-3 sm:w-[min(92vw,600px)]" : "sm:w-[min(38vw,760px)] sm:min-w-[400px] sm:shrink-0 max-lg:sm:absolute max-lg:sm:inset-y-3 max-lg:sm:right-3 max-lg:sm:w-[min(92vw,600px)] max-lg:sm:min-w-0"}`}><ObjectInspectorPanel key={selectedItem.id} item={selectedItem} timeZone={activeTrip.timezone} defaultCurrency={activeTrip.defaultCurrency ?? "USD"} onClose={closeInspector} onChange={changeItem} onRequestDelete={(id) => setPendingDeleteIds([id])} tripStartDate={activeTrip.startDate} eventTypes={eventTypes} typeColors={eventTypeColors} darkMode={theme === "dark"} /></div>}
      </div>}
      {activeTrip && <nav aria-label="Mobile workspace" className="z-20 grid shrink-0 grid-cols-5 border-t bg-white px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:bg-neutral-900 sm:hidden">
        {([{ id: "day", label: "Day", icon: List, onClick: () => { setActiveTab("calendar"); setCalendarMode("day"); } }, { id: "calendar", label: "Calendar", icon: CalendarDays, onClick: () => { setActiveTab("calendar"); setCalendarMode("month"); } }, { id: "places", label: "Places", icon: MapIcon, onClick: () => setActiveTab("map") }, { id: "spend", label: "Spend", icon: ReceiptText, onClick: () => setActiveTab("expenses") }]).map(({ id, label, icon: Icon, onClick }) => <button key={id} type="button" aria-current={mobileDestination === id ? "page" : undefined} onClick={onClick} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium ${mobileDestination === id ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-500 dark:text-stone-400"}`}><Icon size={17} />{label}</button>)}
        <button type="button" aria-current={mobileDestination === "more" ? "page" : undefined} aria-expanded={mobileSidebarOpen} onClick={openMobileMenu} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium ${mobileDestination === "more" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" : "text-stone-500 dark:text-stone-400"}`}><MoreHorizontal size={18} />More</button>
      </nav>}
      {pendingDeleteIds && <ConfirmDialog confirmOnDelete pending={deletingItems} title={`Delete ${pendingDeleteIds.length === 1 ? "selected item" : `${pendingDeleteIds.length} selected items`}?`} description="These selected entries will be permanently deleted. Press Delete again or Enter to confirm." items={items.filter((item) => pendingDeleteIds.includes(item.id)).map((item) => item.title)} onCancel={() => setPendingDeleteIds(null)} onConfirm={() => { void deleteSelectedItems(pendingDeleteIds); }} />}
    </section>
  </main>;
}
