"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlannerTab = "calendar" | "kanban" | "days" | "table" | "map" | "expenses";
export type CalendarMode = "month" | "week" | "day";

/** Visible names for the persisted tab keys. Keys never change; only these labels do. */
export const plannerTabLabels: Record<PlannerTab, string> = {
  days: "Plan",
  calendar: "Calendar",
  kanban: "Board",
  table: "Table",
  map: "Map",
  expenses: "Spend",
};

/** Header order of the views. Number shortcuts keep their original keys (1 Calendar … 6 Spend). */
export const plannerTabOrder: PlannerTab[] = ["days", "calendar", "kanban", "table", "map", "expenses"];
export const plannerTabShortcuts: Record<PlannerTab, string> = {
  calendar: "1",
  kanban: "2",
  days: "3",
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
  theme: "light" | "dark";
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
  toggleTheme: () => void;
};

export const useTravelStore = create<TravelStore>()(
  persist(
    (set) => ({
      activeTripId: null,
      activeTab: "calendar",
      calendarMode: "month",
      sidebarCollapsed: false,
      theme: "light",
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
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
    }),
    { name: "travel-planner-ui" },
  ),
);
