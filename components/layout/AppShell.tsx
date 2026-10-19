"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import {
  CalendarDays,
  ChevronDown,
  Compass,
  List,
  LoaderCircle,
  Map as MapIcon,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";
import { ObjectInspectorPanel } from "@/components/inspector/ObjectInspectorPanel";
import { CalendarView } from "@/components/views/CalendarView";
import { KanbanView } from "@/components/views/KanbanView";
import { TripDaysView } from "@/components/views/TripDaysView";
import { TableView } from "@/components/views/TableView";
import { MapView } from "@/components/views/MapView";
import { ExpensesView } from "@/components/views/ExpensesView";
import { useTripData } from "@/components/layout/useTripData";
import { useItemActions } from "@/components/layout/useItemActions";
import { useItemSelection } from "@/components/layout/useItemSelection";
import { menuItemClassName } from "@/components/ui/menu-item";
import { ItemSearch } from "@/components/layout/ItemSearch";
import { TripMenuContents, TripSwitcher, moveMenuFocus, useMenuDismiss } from "@/components/layout/TripMenu";
import { api } from "@/lib/api-client";
import { parseMapsUrl, placeNameFromMapsUrl } from "@/lib/maps-link";
import { eventItems, isNote } from "@/lib/note-domain";
import { formatTripDateRange } from "@/lib/trip-dates";

import { sortTravelObjects } from "@/lib/schedule-order";
import {
  plannerTabLabels,
  plannerTabOrder,
  plannerTabShortcuts,
  useResolvedTheme,
  useTravelStore,
} from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";

const EMPTY_EVENT_TYPES: string[] = [];
const EMPTY_EVENT_TYPE_COLORS: Record<string, string> = {};

export function AppShell() {
  const selection = useItemSelection();
  const {
    selectedIds,
    setSelectedIds,
    primarySelectedId,
    setPrimarySelectedId,
    inspectedItemId,
    setInspectedItemId,
    replaceSelection,
    selectItem,
    inspectItem,
    clearSelection,
    closeInspector,
  } = selection;
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const activeTripId = useTravelStore((state) => state.activeTripId);
  const setActiveTripId = useTravelStore((state) => state.setActiveTripId);
  const {
    trips,
    setTrips,
    items,
    setItems,
    loadingTrips,
    tripsLoadError,
    retryTrips,
    itemsTripId,
    setItemsTripId,
    itemsLoadError,
    retryItems,
    activeTrip,
  } = useTripData(activeTripId, setActiveTripId);
  const activeTab = useTravelStore((state) => state.activeTab);
  const calendarMode = useTravelStore((state) => state.calendarMode);
  const setCalendarMode = useTravelStore((state) => state.setCalendarMode);
  const [narrowScreen, setNarrowScreen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrowScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const mobileDestination =
    activeTab === "calendar"
      ? calendarMode === "day"
        ? "day"
        : "calendar"
      : activeTab === "map"
        ? "places"
        : activeTab === "expenses"
          ? "spend"
          : "more";
  const theme = useTravelStore((state) => state.theme);
  const resolvedTheme = useResolvedTheme();
  const compact = useTravelStore((state) => state.compact);
  const toggleCompact = useTravelStore((state) => state.toggleCompact);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  const setActiveTab = useTravelStore((state) => state.setActiveTab);
  const cycleTheme = useTravelStore((state) => state.cycleTheme);
  const savedEventTypes = useTravelStore((state) =>
    activeTrip ? (state.eventTypesByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPES) : EMPTY_EVENT_TYPES,
  );
  const eventTypeColors = useTravelStore((state) =>
    activeTrip ? (state.eventTypeColorsByTrip[activeTrip.id] ?? EMPTY_EVENT_TYPE_COLORS) : EMPTY_EVENT_TYPE_COLORS,
  );
  const addEventType = useTravelStore((state) => state.addEventType);
  const setEventTypeColor = useTravelStore((state) => state.setEventTypeColor);
  const selectedItem = items.find((item) => item.id === inspectedItemId && !isNote(item)) ?? null;
  const activeTripKey = activeTrip?.id;
  const activeTripKeyRef = useRef(activeTripKey);
  useLayoutEffect(() => {
    activeTripKeyRef.current = activeTripKey;
  }, [activeTripKey]);

  function openMobileMenu(event: MouseEvent<HTMLButtonElement>) {
    mobileMenuTriggerRef.current = event.currentTarget;
    setMobileSidebarOpen(true);
  }

  function closeMobileMenu() {
    setMobileSidebarOpen(false);
    mobileMenuTriggerRef.current?.focus();
  }
  useMenuDismiss(mobileSidebarOpen, mobileMenuRef, mobileMenuTriggerRef, closeMobileMenu);

  function handleMobileMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    moveMenuFocus(event, mobileMenuRef.current);
    if (!mobileSidebarOpen || event.key !== "Tab") return;
    // Dialogs opened from the sheet are portals; leave their own focus trap in charge.
    if (!(event.target instanceof Node) || !mobileMenuRef.current?.contains(event.target)) return;
    const focusable = [
      ...(mobileMenuRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"])',
      ) ?? []),
    ].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (mobileSidebarOpen) mobileMenuCloseRef.current?.focus();
  }, [mobileSidebarOpen]);

  const {
    changeItem,
    openCreateItem,
    createNote,
    saveNote,
    deleteItem,
    resizeItem,
    changeSelectedItems,
    deleteSelectedItems,
    deletingItems,
    moveSelectedItems,
    moveSelectedItemsToDay,
    unscheduleSelectedItems,
    reorderItem,
    moveType,
  } = useItemActions({
    activeTrip,
    activeTripKeyRef,
    items,
    setItems,
    selection,
    setPendingDeleteIds,
    setError,
  });

  const events = eventItems(items);
  const eventTypes = [
    ...new Set([
      "unclassified",
      "flight",
      "hotel",
      "food",
      "commute",
      "activity",
      "sightseeing",
      ...savedEventTypes,
      ...events.map((item) => item.type),
    ]),
  ];
  const selectTrip = (id: string) => {
    if (id !== activeTripId) {
      clearSelection();
      setPendingDeleteIds(null);
    }
    setActiveTripId(id);
  };
  const onTripCreated = (trip: Trip) => {
    clearSelection();
    setTrips((current) => [...current, trip]);
    setActiveTripId(trip.id);
  };
  const onTripSaved = (trip: Trip) =>
    setTrips((current) => current.map((existing) => (existing.id === trip.id ? trip : existing)));
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
      if (
        event.defaultPrevented ||
        document.querySelector('[role="dialog"][aria-modal="true"], [aria-label="Trip menu"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key === "Escape") {
        setSelectedIds(new Set());
        setPrimarySelectedId(null);
        setInspectedItemId(null);
        return;
      }
      if (
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key === "Delete" || event.key === "Backspace") &&
        activeTab !== "expenses" &&
        selectedIds.size
      ) {
        event.preventDefault();
        setPendingDeleteIds([...selectedIds]);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const calendarMode = ({ q: "month", w: "week", e: "day" } as const)[event.key.toLowerCase() as "q" | "w" | "e"];
      if (calendarMode) {
        setActiveTab("calendar");
        setCalendarMode(calendarMode);
        event.preventDefault();
        return;
      }
      const tab = plannerTabOrder.find((id) => plannerTabShortcuts[id] === event.key);
      if (tab) {
        setActiveTab(tab);
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, selectedIds, setActiveTab, setCalendarMode, setSelectedIds, setPrimarySelectedId, setInspectedItemId]);

  useEffect(() => {
    if (!activeTrip) return;
    function onPaste(event: ClipboardEvent) {
      if (
        event.defaultPrevented ||
        document.querySelector('[role="dialog"][aria-modal="true"], [aria-label="Trip menu"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      const url = parseMapsUrl(event.clipboardData?.getData("text/plain") ?? "");
      if (!url) return;
      event.preventDefault();
      const link = url.toString();
      void (async () => {
        let name = placeNameFromMapsUrl(link);
        let coordinates: { lat?: number; lng?: number } = {};
        try {
          const resolved = await api.resolveMapsUrl(link);
          name ??= resolved.name?.trim() || null;
          if (resolved.lat != null && resolved.lng != null) coordinates = { lat: resolved.lat, lng: resolved.lng };
        } catch {
          setError("Could not look up that Google Maps link; saved it without a map pin.");
        }
        await openCreateItem(undefined, undefined, "unclassified", (name ?? "New place").slice(0, 100), undefined, {
          ...(name ? { name: name.slice(0, 300) } : {}),
          googleMapsUrl: link,
          ...coordinates,
        });
      })();
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // openCreateItem closes over the active trip, which this effect is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip]);

  const tripMenuProps = {
    trips,
    activeTrip,
    exportItems: activeTrip && itemsTripId === activeTrip.id ? events : null,
    eventTypes,
    theme,
    onSelectTrip: selectTrip,
    onTripCreated,
    onTripSaved,
    onTripDeleted,
    onAddType: addEventType,
    onImported: (tripId: string, imported: TravelObject[]) => {
      if (activeTripKeyRef.current === tripId) setItems((current) => sortTravelObjects([...current, ...imported]));
    },
    onItemsUpdated: (tripId: string, updated: TravelObject[]) => {
      if (activeTripKeyRef.current !== tripId || !updated.length) return;
      const byId = new Map(updated.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => byId.get(item.id) ?? item));
    },
    onError: (tripId: string, message: string) => {
      if (activeTripKeyRef.current === tripId) setError(message);
    },
    onToggleTheme: cycleTheme,
  };
  const mobileSheetOpen = mobileSidebarOpen && narrowScreen;

  return (
    <main
      style={{ colorScheme: resolvedTheme }}
      data-density={compact ? "compact" : "comfortable"}
      className={`flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground sm:min-h-[620px] ${resolvedTheme === "dark" ? "dark" : ""}`}
    >
      {mobileSheetOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-scrim sm:hidden"
          aria-label="Close navigation"
          onClick={() => closeMobileMenu()}
        />
      )}
      {mobileSheetOpen && (
        <div
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Trips and workspace"
          onKeyDown={handleMobileMenuKeyDown}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto border-t border-foreground bg-panel pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden"
        >
          <div className="flex items-center justify-between border-b border-divider px-4 py-1">
            <p className="text-sm font-medium">Trips and workspace</p>
            <Button
              ref={mobileMenuCloseRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-11"
              onClick={() => closeMobileMenu()}
              aria-label="Close menu"
            >
              <X />
            </Button>
          </div>
          <div className="border-b border-divider py-2">
            <p className="px-4 pt-1 pb-2 text-xs text-muted">Views</p>
            {(["days", "kanban", "table"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => {
                  setActiveTab(id);
                  closeMobileMenu();
                }}
                className={`${menuItemClassName} ${activeTab === id ? "font-medium" : ""}`}
              >
                {plannerTabLabels[id]}
              </button>
            ))}
          </div>
          <TripMenuContents {...tripMenuProps} onDone={() => closeMobileMenu()} />
        </div>
      )}
      <header className="hidden shrink-0 flex-wrap items-center gap-x-6 gap-y-1 px-6 pt-4 sm:flex lg:gap-x-10 lg:px-12">
        <TripSwitcher {...tripMenuProps} />
        {activeTrip && (
          <nav aria-label="Views" className="flex flex-1 flex-wrap gap-x-5 lg:gap-x-7">
            {plannerTabOrder.map((id) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                title={`${plannerTabLabels[id]} (${plannerTabShortcuts[id]})`}
                onClick={() => setActiveTab(id)}
                className={`min-h-11 py-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring ${activeTab === id ? "font-medium text-foreground shadow-[inset_0_-1px_0_var(--ink)]" : "text-muted hover:text-foreground"}`}
              >
                {plannerTabLabels[id]}
              </button>
            ))}
          </nav>
        )}
        {!activeTrip && <div className="flex-1" />}
        {activeTrip && (
          <>
            <button
              type="button"
              aria-label="Compact rows"
              aria-pressed={compact}
              title={compact ? "Compact rows: on" : "Compact rows: off"}
              onClick={toggleCompact}
              className={`grid size-10 place-items-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring ${compact ? "text-accent" : "text-muted hover:text-foreground"}`}
            >
              <Rows3 className="size-[18px]" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Search items"
              title="Search items"
              onClick={() => setSearchOpen(true)}
              className="grid size-10 place-items-center text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
            >
              <Search className="size-[18px]" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Add an item"
              title="Add an item"
              onClick={() => void openCreateItem()}
              className="grid size-10 place-items-center rounded-full border border-foreground text-foreground outline-none transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-4" strokeWidth={1.5} />
            </button>
          </>
        )}
      </header>
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-divider bg-background px-4 py-1 sm:hidden">
          <button
            type="button"
            onClick={openMobileMenu}
            aria-expanded={mobileSidebarOpen}
            aria-label="Choose trip and open workspace menu"
            className="flex min-h-11 min-w-0 items-baseline gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            <span className="truncate text-base font-medium tracking-tight">{activeTrip?.title ?? "Choose trip"}</span>
            {activeTrip && (
              <span className="shrink-0 text-xs text-muted">
                {formatTripDateRange(activeTrip.startDate, activeTrip.endDate)}
              </span>
            )}
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 self-center text-muted" />
          </button>
          {activeTrip && (
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                aria-label="Compact rows"
                aria-pressed={compact}
                onClick={toggleCompact}
                className={`grid size-11 place-items-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring ${compact ? "text-accent" : "text-muted"}`}
              >
                <Rows3 className="size-[18px]" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Search items"
                onClick={() => setSearchOpen(true)}
                className="grid size-11 place-items-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                <Search className="size-[18px]" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Add an item"
                onClick={() => void openCreateItem()}
                className="grid size-11 place-items-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                <Plus className="size-[18px]" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </header>
        {error && (
          <div
            role="alert"
            className="mx-5 mt-4 flex items-start justify-between gap-3 border border-danger py-3 pr-2 pl-4 text-sm text-danger"
          >
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              title="Dismiss"
              onClick={() => setError("")}
              className="-my-2 grid size-11 shrink-0 place-items-center outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring sm:size-9"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
        {loadingTrips ? (
          <div className="grid flex-1 place-items-center">
            <LoaderCircle className="animate-spin text-muted" aria-label="Loading trips" />
          </div>
        ) : tripsLoadError ? (
          <div className="grid flex-1 place-items-center p-6">
            <div role="alert" className="max-w-sm text-center">
              <p className="text-sm text-danger">{tripsLoadError}</p>
              <Button type="button" className="mt-4 min-h-11" onClick={retryTrips}>
                Retry loading trips
              </Button>
            </div>
          </div>
        ) : !activeTrip ? (
          <div className="grid flex-1 place-items-center p-6">
            <div className="max-w-md text-center">
              <div className="mx-auto grid size-14 place-items-center border border-foreground text-foreground">
                <Compass size={25} />
              </div>
              <h2 className="mt-5 text-xl font-semibold">Make room for the good parts</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Create a trip to bring dates, stays, meals, and little discoveries into one clear plan.
              </p>
              <div className="mt-5 flex justify-center">
                <CreateTripDialog onCreated={onTripCreated} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3 p-0 sm:p-5">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {itemsTripId !== activeTrip.id ? (
                <div className="grid flex-1 place-items-center p-6">
                  {itemsLoadError ? (
                    <div role="alert" className="max-w-sm text-center">
                      <p className="text-sm text-danger">{itemsLoadError}</p>
                      <Button type="button" className="mt-4 min-h-11" onClick={retryItems}>
                        Retry loading itinerary
                      </Button>
                    </div>
                  ) : (
                    <LoaderCircle className="animate-spin text-muted" aria-label="Loading itinerary" />
                  )}
                </div>
              ) : activeTab === "calendar" ? (
                <CalendarView
                  onCreateNote={createNote}
                  onSaveNote={saveNote}
                  onDeleteNote={deleteItem}
                  trip={activeTrip}
                  items={items}
                  typeColors={eventTypeColors}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  onSelect={selectItem}
                  onInspect={inspectItem}
                  onSelectForDrag={(item) => selectItem(item, false, false)}
                  onMove={moveSelectedItems}
                  onResize={resizeItem}
                  onUnschedule={unscheduleSelectedItems}
                  onFlexibleDrop={reorderItem}
                  onCreateItem={openCreateItem}
                />
              ) : activeTab === "kanban" ? (
                <KanbanView
                  trip={activeTrip}
                  items={events}
                  eventTypes={eventTypes}
                  typeColors={eventTypeColors}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  inspectedItemId={inspectedItemId}
                  onSetTypeColor={(type, color) => setEventTypeColor(activeTrip.id, type, color)}
                  onAddType={(type) => addEventType(activeTrip.id, type)}
                  onSelect={selectItem}
                  onSelectForDrag={(item) => selectItem(item, false, false)}
                  onMoveType={moveType}
                  onReorder={reorderItem}
                  onAddItem={(type) => void openCreateItem(undefined, "09:00", type ?? "unclassified")}
                />
              ) : activeTab === "days" ? (
                <TripDaysView
                  trip={activeTrip}
                  items={items.filter((item) => item.date !== null)}
                  ideas={events.filter((item) => item.date === null)}
                  typeColors={eventTypeColors}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  onSelect={(item, additive) => selectItem(item, additive, false)}
                  onInspect={inspectItem}
                  onSelectForDrag={(item) => selectItem(item, false, false)}
                  onMove={moveSelectedItemsToDay}
                  onReorder={reorderItem}
                  onUnschedule={unscheduleSelectedItems}
                  onCreateItem={(date, order) =>
                    void openCreateItem(date, undefined, "unclassified", "(untitled event)", order)
                  }
                  onCreateIdea={() => void openCreateItem()}
                  onChangeItem={changeItem}
                />
              ) : activeTab === "table" ? (
                <TableView
                  trip={activeTrip}
                  items={events}
                  typeColors={eventTypeColors}
                  selectedIds={selectedIds}
                  primarySelectedId={primarySelectedId}
                  onSelect={(item, additive) => selectItem(item, additive, false)}
                  onInspect={inspectItem}
                  onSelectionChange={replaceSelection}
                  onChangeItems={changeSelectedItems}
                  onDeleteSelected={(ids) => setPendingDeleteIds(ids)}
                />
              ) : activeTab === "expenses" ? (
                <ExpensesView key={activeTrip.id} trip={activeTrip} items={events} />
              ) : (
                <MapView
                  key={activeTrip.id}
                  trip={activeTrip}
                  items={events}
                  typeColors={eventTypeColors}
                  onSelect={inspectItem}
                />
              )}
            </div>
            {activeTab !== "expenses" && selectedItem && (
              <div
                role={narrowScreen ? "dialog" : undefined}
                aria-modal={narrowScreen ? true : undefined}
                aria-label={narrowScreen ? `Edit ${selectedItem.title}` : undefined}
                className={`z-[100] min-h-0 max-sm:fixed max-sm:inset-0 ${activeTab === "calendar" ? "sm:absolute sm:inset-y-3 sm:right-3 sm:w-[min(92vw,600px)] sm:shadow-xl" : "sm:w-[min(38vw,760px)] sm:min-w-[400px] sm:shrink-0 max-lg:sm:absolute max-lg:sm:inset-y-3 max-lg:sm:right-3 max-lg:sm:w-[min(92vw,600px)] max-lg:sm:min-w-0"}`}
              >
                <ObjectInspectorPanel
                  key={selectedItem.id}
                  item={selectedItem}
                  timeZone={activeTrip.timezone}
                  defaultCurrency={activeTrip.defaultCurrency ?? "USD"}
                  onClose={closeInspector}
                  onChange={changeItem}
                  onRequestDelete={(id) => setPendingDeleteIds([id])}
                  tripStartDate={activeTrip.startDate}
                  eventTypes={eventTypes}
                  typeColors={eventTypeColors}
                  darkMode={resolvedTheme === "dark"}
                />
              </div>
            )}
          </div>
        )}
        {activeTrip && (
          <nav
            aria-label="Mobile workspace"
            className="z-20 grid shrink-0 grid-cols-5 border-t border-divider bg-background px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden"
          >
            {[
              {
                id: "day",
                label: "Day",
                icon: List,
                onClick: () => {
                  setActiveTab("calendar");
                  setCalendarMode("day");
                },
              },
              {
                id: "calendar",
                label: "Calendar",
                icon: CalendarDays,
                onClick: () => {
                  setActiveTab("calendar");
                  setCalendarMode("month");
                },
              },
              { id: "places", label: "Places", icon: MapIcon, onClick: () => setActiveTab("map") },
              { id: "spend", label: "Spend", icon: ReceiptText, onClick: () => setActiveTab("expenses") },
            ].map(({ id, label, icon: Icon, onClick }) => (
              <button
                key={id}
                type="button"
                aria-current={mobileDestination === id ? "page" : undefined}
                onClick={onClick}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] ${mobileDestination === id ? "font-medium text-foreground shadow-[inset_0_2px_0_var(--ink)]" : "text-muted"}`}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-current={mobileDestination === "more" ? "page" : undefined}
              aria-expanded={mobileSidebarOpen}
              onClick={openMobileMenu}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] ${mobileDestination === "more" ? "font-medium text-foreground shadow-[inset_0_2px_0_var(--ink)]" : "text-muted"}`}
            >
              <MoreHorizontal size={18} />
              More
            </button>
          </nav>
        )}
        {searchOpen && activeTrip && (
          <ItemSearch
            items={events}
            onClose={() => setSearchOpen(false)}
            onPick={(item) => {
              setSearchOpen(false);
              // The inspector is not shown on Spend, so move to a view that has it first.
              if (activeTab === "expenses") setActiveTab("days");
              inspectItem(item);
            }}
          />
        )}
        {pendingDeleteIds && (
          <ConfirmDialog
            confirmOnDelete
            pending={deletingItems}
            title={`Delete ${pendingDeleteIds.length === 1 ? "selected item" : `${pendingDeleteIds.length} selected items`}?`}
            description="These selected entries will be permanently deleted. Press Delete again or Enter to confirm."
            items={items.filter((item) => pendingDeleteIds.includes(item.id)).map((item) => item.title)}
            onCancel={() => setPendingDeleteIds(null)}
            onConfirm={() => {
              void deleteSelectedItems(pendingDeleteIds);
            }}
          />
        )}
      </section>
    </main>
  );
}
