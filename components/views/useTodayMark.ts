"use client";

import { useMemo } from "react";
import { useNow } from "@/components/layout/useNow";
import { dateParts } from "@/lib/date-utils";
import { occursOnItineraryDate } from "@/lib/schedule-domain";
import { compareScheduleOrder } from "@/lib/schedule-order";
import { isTripInProgress, leaveBy, legTravel, todayDate, todayTimeline } from "@/lib/today";
import { dayRouteStops } from "@/lib/travel-legs";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import { useDayRoutes } from "./plan/useDayRoutes";

/** The item to flag in today's section of the Trip list. */
export type TodayMark = {
  itemId: string;
  kind: "now" | "next";
  /** `~HH:MM` for a flexible stop (an order-derived estimate); null when it has no time. Never shown as confirmed. */
  approximateTime: string | null;
  /** `HH:MM` to leave by; only for a confirmed stop with a known travel time, and not while it is under way. */
  leaveBy: string | null;
  leaveNow: boolean;
};

/**
 * Today (in the trip timezone) and, while the trip is in progress and `enabled`, the current stop (started, not over)
 * or else the next one, with when to leave. The same timeline, routed legs and leave-by rule the former Today view used.
 */
export function useTodayMark(trip: Trip, items: readonly TravelObject[], enabled: boolean) {
  const now = useNow();
  const date = todayDate(trip, now);
  const clock = dateParts(now, trip.timezone).time;
  const active = enabled && isTripInProgress(trip, now);
  const dayItems = useMemo(
    () => (active ? items.filter((item) => occursOnItineraryDate(item, date)).sort(compareScheduleOrder) : []),
    [active, items, date],
  );
  const timeline = useMemo(
    () => (active ? todayTimeline(items, date, now, trip.timezone) : null),
    // The clock only matters to the minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, items, date, clock, trip.timezone],
  );
  const { stops } = useMemo(() => dayRouteStops(dayItems, date), [dayItems, date]);
  const mode = useTravelStore((state) => state.travelModeByTrip[trip.id] ?? "walk");
  const overrides = useTravelStore((state) => state.legOverridesByTrip[trip.id]);
  // The same routed-legs fetch Plan uses; with no stops (not active) nothing is requested.
  const { legs } = useDayRoutes(stops, mode, overrides);

  const next = timeline?.next ?? null;
  let mark: TodayMark | null = null;
  if (next) {
    const travel = legTravel(legs.find((leg) => leg.toId === next.item.id));
    const leave = !next.inProgress && travel && !travel.estimated ? leaveBy(next, travel.seconds) : null;
    mark = {
      itemId: next.item.id,
      kind: next.inProgress ? "now" : "next",
      approximateTime: next.approximate && next.time ? `~${next.time}` : null,
      leaveBy: leave,
      leaveNow: leave !== null && leave <= clock,
    };
  }
  return { date, mark };
}
