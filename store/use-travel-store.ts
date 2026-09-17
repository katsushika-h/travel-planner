"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlannerTab = "calendar" | "kanban" | "days";

type TravelStore = {
  activeTripId: string | null;
  activeTab: PlannerTab;
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
  eventTypesByTrip: Record<string, string[]>;
  eventTypeColorsByTrip: Record<string, Record<string, string>>;
  addEventType: (tripId: string, type: string) => void;
  setEventTypeColor: (tripId: string, type: string, color: string) => void;
  setActiveTripId: (id: string | null) => void;
  setActiveTab: (tab: PlannerTab) => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
};

export const useTravelStore = create<TravelStore>()(
  persist(
    (set) => ({
      activeTripId: null,
      activeTab: "calendar",
      sidebarCollapsed: false,
      theme: "light",
      eventTypesByTrip: {},
      eventTypeColorsByTrip: {},
      addEventType: (tripId, type) => set((state) => ({ eventTypesByTrip: { ...state.eventTypesByTrip, [tripId]: [...new Set([...(state.eventTypesByTrip[tripId] ?? []), type])] } })),
      setEventTypeColor: (tripId, type, color) => set((state) => ({ eventTypeColorsByTrip: { ...state.eventTypeColorsByTrip, [tripId]: { ...state.eventTypeColorsByTrip[tripId], [type]: color } } })),
      setActiveTripId: (activeTripId) => set({ activeTripId }),
      setActiveTab: (activeTab) => set({ activeTab }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
    }),
    { name: "travel-planner-ui" },
  ),
);
