"use client";

import { useMemo } from "react";
import { eventItems } from "@/lib/note-domain";
import { flexibleDisplayTimes } from "@/lib/schedule-domain";
import type { TravelMode } from "@/lib/routed-legs";
import { dayRouteStops } from "@/lib/travel-legs";
import type { TravelObject } from "@/types/travel";
import { stopNumbers } from "./plan-domain";
import { useDayRoutes } from "./useDayRoutes";

const NO_STOPS: TravelObject[] = [];

/**
 * Everything one day's Plan rows need: the hotels pinned to its ends, the rows between them, map numbers,
 * flexible times and, when `route` is on, the routed legs, parking offers and next-stop titles.
 * A day section far from the viewport passes `route: false`, so it makes no routing request.
 */
export function useDayPlan(
  /** The day's items in saved order, notes included. */
  dayItems: TravelObject[],
  date: string,
  mode: TravelMode,
  overrides: Record<string, TravelMode> | undefined,
  route: boolean,
) {
  // Last night's hotel is pinned to the start of the day and tonight's to the end; the route runs between them.
  const { morning, evening, stops } = useMemo(() => dayRouteStops(dayItems, date), [dayItems, date]);
  const routeStops = route ? stops : NO_STOPS;
  const middleRows = useMemo(
    () =>
      dayItems
        .map((item, order) => ({ item, order }))
        .filter(({ item }) => item.id !== morning?.id && item.id !== evening?.id),
    [dayItems, morning, evening],
  );
  const { legs, mapLegs, planned, estimatedNote } = useDayRoutes(routeStops, mode, overrides);
  const legByFromId = useMemo(() => new Map(legs.map((leg) => [leg.fromId, leg])), [legs]);
  const nextTitles = useMemo(() => {
    const titles = new Map(dayItems.map((item) => [item.id, item.title]));
    return new Map(legs.map((leg) => [leg.fromId, titles.get(leg.toId) ?? ""]));
  }, [legs, dayItems]);
  // Stops a drive arrives at (and the day's first stop, where the car starts) can have a car park picked.
  const parkingOfferIds = useMemo(() => {
    const ids = new Set<string>();
    if (mode !== "drive") return ids;
    for (const leg of planned) {
      if (leg.segments.some((segment) => segment.mode === "drive" && segment.role === "leg")) ids.add(leg.toId);
    }
    if (routeStops[0]) ids.add(routeStops[0].id);
    return ids;
  }, [mode, planned, routeStops]);
  const events = useMemo(() => eventItems(dayItems), [dayItems]);
  // Map numbers follow the rows as shown: start hotel, the day's stops, then tonight's hotel (once if it is the same).
  const numbers = useMemo(
    () =>
      stopNumbers([
        ...(morning ? [morning] : []),
        ...eventItems(middleRows.map(({ item }) => item)),
        ...(evening && evening.id !== morning?.id ? [evening] : []),
      ]),
    [morning, evening, middleRows],
  );
  const flexTimes = useMemo(() => flexibleDisplayTimes(events), [events]);
  return {
    morning,
    evening,
    stops: routeStops,
    middleRows,
    legs,
    mapLegs,
    planned,
    estimatedNote,
    legByFromId,
    nextTitles,
    parkingOfferIds,
    events,
    numbers,
    flexTimes,
  };
}
