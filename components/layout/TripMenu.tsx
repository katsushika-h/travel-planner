"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Check, ChevronDown, Keyboard, Monitor, Moon, Sun } from "lucide-react";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";
import { DeleteTripButton } from "@/components/trip/DeleteTripButton";
import { EditTripDialog } from "@/components/trip/EditTripDialog";
import { ExportIcsButton } from "@/components/trip/ExportIcsButton";
import { ImportGoogleMapsCsvButton } from "@/components/trip/ImportGoogleMapsCsvButton";
import { ImportReservationButton } from "@/components/trip/ImportReservationButton";
import { RecalculateMapPinsButton } from "@/components/trip/RecalculateMapPinsButton";
import { menuItemClassName } from "@/components/ui/menu-item";
import { formatTripDateRange } from "@/lib/trip-dates";
import type { ThemePreference } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";

const themeLabels: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

export type TripMenuProps = {
  trips: Trip[];
  activeTrip: Trip | null;
  /** Calendar export is offered only once the active trip's items have loaded. */
  exportItems: TravelObject[] | null;
  eventTypes: string[];
  theme: ThemePreference;
  onSelectTrip: (id: string) => void;
  onTripCreated: (trip: Trip) => void;
  onTripSaved: (trip: Trip) => void;
  onTripDeleted: (id: string) => void;
  onAddType: (tripId: string, type: string) => void;
  onImported: (tripId: string, items: TravelObject[]) => void;
  onItemsUpdated: (tripId: string, items: TravelObject[]) => void;
  onError: (tripId: string, message: string) => void;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
  /** Closes the surrounding menu after an action that finishes the user's intent. */
  onDone: () => void;
};

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]):not(.sr-only)';

function otherModalOpen(panel: HTMLElement | null) {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some((dialog) => dialog !== panel);
}

/** Arrow keys move between the menu's buttons; Tab keeps working as usual. */
export function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (!container || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  if (!(event.target instanceof Node) || !container.contains(event.target)) return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0,
  );
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next].focus();
}

/**
 * Escape and outside clicks close an open menu and return focus to its trigger. Dialogs opened from the
 * menu (create, edit, delete) are portals; while one is open the menu stays put underneath it.
 */
export function useMenuDismiss(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  onClose: (restoreFocus: boolean) => void,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || otherModalOpen(panelRef.current)) return;
      event.preventDefault();
      onCloseRef.current(true);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      onCloseRef.current(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, panelRef, triggerRef]);
}

function MenuSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-divider py-2 last:border-b-0">
      {label && <p className="px-4 pt-1 pb-2 text-xs text-muted">{label}</p>}
      {children}
    </div>
  );
}

/** Trip list and trip actions; shared by the desktop trip switcher and the mobile More sheet. */
export function TripMenuContents({
  trips,
  activeTrip,
  exportItems,
  eventTypes,
  theme,
  onSelectTrip,
  onTripCreated,
  onTripSaved,
  onTripDeleted,
  onAddType,
  onImported,
  onItemsUpdated,
  onError,
  onToggleTheme,
  onShowShortcuts,
  onDone,
}: TripMenuProps) {
  return (
    <>
      <MenuSection label="Trips">
        {trips.length ? (
          <ul className="max-h-60 overflow-y-auto">
            {trips.map((trip) => {
              const current = trip.id === activeTrip?.id;
              return (
                <li key={trip.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    data-current-trip={current ? "" : undefined}
                    onClick={() => {
                      onSelectTrip(trip.id);
                      onDone();
                    }}
                    className={`${menuItemClassName} justify-between py-2`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate ${current ? "font-medium" : ""}`}>{trip.title}</span>
                      <span className="font-mono text-xs text-muted">
                        {formatTripDateRange(trip.startDate, trip.endDate)}
                      </span>
                    </span>
                    {current && <Check aria-hidden="true" className="text-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-2 text-sm text-muted">No trips yet</p>
        )}
      </MenuSection>
      <MenuSection>
        <CreateTripDialog
          menuItem
          onCreated={(trip) => {
            onTripCreated(trip);
            onDone();
          }}
        />
        {activeTrip && (
          <>
            <EditTripDialog
              key={activeTrip.id}
              menuItem
              trip={activeTrip}
              onSaved={(trip) => {
                onTripSaved(trip);
                onDone();
              }}
            />
            <ImportGoogleMapsCsvButton
              menuItem
              trip={activeTrip}
              eventTypes={eventTypes}
              onAddType={(type) => onAddType(activeTrip.id, type)}
              onImported={(imported) => onImported(activeTrip.id, imported)}
              onError={(message) => onError(activeTrip.id, message)}
            />
            <ImportReservationButton
              key={`reservation-${activeTrip.id}`}
              trip={activeTrip}
              eventTypes={eventTypes}
              onAddType={(type) => onAddType(activeTrip.id, type)}
              onImported={(imported) => onImported(activeTrip.id, imported)}
              onError={(message) => onError(activeTrip.id, message)}
              onDone={onDone}
            />
            <RecalculateMapPinsButton
              key={`recalculate-${activeTrip.id}`}
              trip={activeTrip}
              onUpdated={(updated) => onItemsUpdated(activeTrip.id, updated)}
              onError={(message) => onError(activeTrip.id, message)}
            />
            {exportItems && <ExportIcsButton menuItem trip={activeTrip} items={exportItems} />}
          </>
        )}
      </MenuSection>
      <MenuSection>
        <button type="button" className={menuItemClassName} onClick={onToggleTheme}>
          {theme === "system" ? <Monitor /> : theme === "dark" ? <Moon /> : <Sun />}
          Theme: {themeLabels[theme]}
        </button>
        <button
          type="button"
          className={menuItemClassName}
          onClick={() => {
            onDone();
            onShowShortcuts();
          }}
        >
          <Keyboard />
          Keyboard shortcuts
        </button>
      </MenuSection>
      {activeTrip && (
        <MenuSection>
          <DeleteTripButton
            key={activeTrip.id}
            menuItem
            trip={activeTrip}
            onDeleted={() => {
              onTripDeleted(activeTrip.id);
              onDone();
            }}
            onError={(message) => onError(activeTrip.id, message)}
          />
        </MenuSection>
      )}
    </>
  );
}

/** Desktop trip switcher: trip name and dates as a button that opens the trip menu. */
export function TripSwitcher(props: Omit<TripMenuProps, "onDone">) {
  const { activeTrip } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  useMenuDismiss(open, panelRef, triggerRef, close);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-current-trip]") ?? panel?.querySelector<HTMLElement>("button"))?.focus();
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={activeTrip ? `Switch trip, current trip ${activeTrip.title}` : "Choose a trip"}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 max-w-[min(28rem,60vw)] items-baseline gap-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <span className="truncate text-xl font-medium tracking-tight">{activeTrip?.title ?? "Choose a trip"}</span>
        {activeTrip && (
          <span className="shrink-0 text-sm text-muted">
            {formatTripDateRange(activeTrip.startDate, activeTrip.endDate)}
          </span>
        )}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 self-center text-muted" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Trip menu"
          onKeyDown={(event) => moveMenuFocus(event, panelRef.current)}
          className="absolute top-full left-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] border-t border-foreground bg-panel text-foreground shadow-[0_16px_40px_rgb(0_0_0/0.14)] dark:shadow-[0_16px_40px_rgb(0_0_0/0.6)]"
        >
          <TripMenuContents {...props} onDone={() => close(true)} />
        </div>
      )}
    </div>
  );
}
