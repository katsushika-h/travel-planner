"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TravelMode } from "../lib/routed-legs.ts";

export type PlannerTab = "calendar" | "kanban" | "days" | "table" | "map" | "expenses";
export type CalendarMode = "month" | "week";
/** What the user chose; "system" follows the OS colour scheme. */
export type ThemePreference = "system" | "light" | "dark";

/** Visible names for the persisted tab keys. Keys never change; only these labels do. */
export const plannerTabLabels: Record<PlannerTab, string> = {
  days: "Plan",
  calendar: "Calendar",
  kanban: "Board",
  table: "Table",
  map: "Map",
  expenses: "Spend",
};

/** Header order of the views. Number shortcuts follow it (1 Plan … 6 Spend). */
export const plannerTabOrder: PlannerTab[] = ["days", "calendar", "kanban", "table", "map", "expenses"];
export const plannerTabShortcuts: Record<PlannerTab, string> = {
  days: "1",
  calendar: "2",
  kanban: "3",
  table: "4",
  map: "5",
  expenses: "6",
};

type TravelStore = {
  activeTripId: string | null;
  activeTab: PlannerTab;
  calendarMode: CalendarMode;
  /** Persisted from the old sidebar layout; no longer read by the header layout. Kept so stored state stays valid. */
  sidebarCollapsed: boolean;
  theme: ThemePreference;
  /** Denser rows in Plan, Board and Table. */
  compact: boolean;
  /** Map and Plan show tilted fits with extruded buildings; off keeps the map flat. */
  map3d: boolean;
  setMap3d: (map3d: boolean) => void;
  /** Walk or drive for the Plan view legs; a missing entry means walk. */
  travelModeByTrip: Record<string, TravelMode>;
  setTravelMode: (tripId: string, mode: TravelMode) => void;
  /** Per-leg walk/drive overrides for Drive mode, keyed "fromId>toId". A missing entry means the automatic choice. */
  legOverridesByTrip: Record<string, Record<string, TravelMode>>;
  /** Pass `null` to clear the override. */
  setLegOverride: (tripId: string, legKey: string, mode: TravelMode | null) => void;
  eventTypesByTrip: Record<string, string[]>;
  eventTypeColorsByTrip: Record<string, Record<string, string>>;
  eventTypeOrderByTrip: Record<string, string[]>;
  addEventType: (tripId: string, type: string) => void;
  removeEventType: (tripId: string, type: string) => void;
  setEventTypeColor: (tripId: string, type: string, color: string) => void;
  setEventTypeOrder: (tripId: string, types: string[]) => void;
  setActiveTripId: (id: string | null) => void;
  setActiveTab: (tab: PlannerTab) => void;
  setCalendarMode: (mode: CalendarMode) => void;
  toggleSidebar: () => void;
  cycleTheme: () => void;
  toggleCompact: () => void;
};

export const useTravelStore = create<TravelStore>()(
  persist(
    (set) => ({
      activeTripId: null,
      activeTab: "calendar",
      calendarMode: "month",
      sidebarCollapsed: false,
      theme: "system",
      compact: false,
      map3d: true,
      setMap3d: (map3d) => set({ map3d }),
      travelModeByTrip: {},
      setTravelMode: (tripId, mode) =>
        set((state) => ({ travelModeByTrip: { ...state.travelModeByTrip, [tripId]: mode } })),
      legOverridesByTrip: {},
      setLegOverride: (tripId, legKey, mode) =>
        set((state) => {
          const next = { ...state.legOverridesByTrip[tripId] };
          if (mode) next[legKey] = mode;
          else delete next[legKey];
          return { legOverridesByTrip: { ...state.legOverridesByTrip, [tripId]: next } };
        }),
      eventTypesByTrip: {},
      eventTypeColorsByTrip: {},
      eventTypeOrderByTrip: {},
      addEventType: (tripId, type) =>
        set((state) => ({
          eventTypesByTrip: {
            ...state.eventTypesByTrip,
            [tripId]: [...new Set([...(state.eventTypesByTrip[tripId] ?? []), type])],
          },
        })),
      removeEventType: (tripId, type) =>
        set((state) => ({
          eventTypesByTrip: {
            ...state.eventTypesByTrip,
            [tripId]: (state.eventTypesByTrip[tripId] ?? []).filter((entry) => entry !== type),
          },
        })),
      setEventTypeColor: (tripId, type, color) =>
        set((state) => ({
          eventTypeColorsByTrip: {
            ...state.eventTypeColorsByTrip,
            [tripId]: { ...state.eventTypeColorsByTrip[tripId], [type]: color },
          },
        })),
      setEventTypeOrder: (tripId, types) =>
        set((state) => ({ eventTypeOrderByTrip: { ...state.eventTypeOrderByTrip, [tripId]: types } })),
      setActiveTripId: (activeTripId) => set({ activeTripId }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setCalendarMode: (calendarMode) => set({ calendarMode }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      cycleTheme: () =>
        set((state) => ({
          theme: state.theme === "system" ? "light" : state.theme === "light" ? "dark" : "system",
        })),
      toggleCompact: () => set((state) => ({ compact: !state.compact })),
    }),
    {
      name: "travel-planner-ui",
      version: 2,
      // v0 persisted "light" as the default, so it rarely reflects a choice; move it to "system". Keep "dark".
      // v1 had a Calendar Day mode; it is now the Plan view, so Calendar-on-Day opens Plan and Calendar is left on Week.
      migrate: (persisted, version) => {
        const state = persisted as Partial<TravelStore>;
        if (version < 1 && state.theme === "light") state.theme = "system";
        if (version < 2 && (state.calendarMode as string | undefined) === "day") {
          if (!state.activeTab || state.activeTab === "calendar") state.activeTab = "days";
          state.calendarMode = "week";
        }
        return state as TravelStore;
      },
    },
  ),
);

const darkQuery = "(prefers-color-scheme: dark)";

function subscribeToSystemDark(notify: () => void) {
  const query = window.matchMedia(darkQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** The light or dark scheme in effect: the stored preference, or the OS scheme when it is "system". */
export function useResolvedTheme(): "light" | "dark" {
  const theme = useTravelStore((state) => state.theme);
  const systemDark = useSyncExternalStore(
    subscribeToSystemDark,
    () => window.matchMedia(darkQuery).matches,
    () => false,
  );
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}
