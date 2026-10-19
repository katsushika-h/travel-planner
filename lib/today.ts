import type { TravelObject, Trip } from "../types/travel.ts";
import { dateParts } from "./date-utils.ts";
import { eventItems } from "./note-domain.ts";
import type { DisplayLeg } from "./routed-legs.ts";
import { flexibleDisplayTimes, occursOnItineraryDate, scheduleKind } from "./schedule-domain.ts";
import { compareScheduleOrder } from "./schedule-order.ts";

/** Pure logic for the Today view: what is done, what is next, and when to leave. Nothing here is persisted. */

/** A stop without an end time is treated as lasting this long. */
export const DEFAULT_STOP_MINUTES = 60;
/** Slack added before the travel time when working out when to leave. */
export const LEAVE_BUFFER_MINUTES = 10;

export type TodayStop = {
  item: TravelObject;
  /** `HH:MM`, or null for a flexible stop that has no order-derived time. */
  time: string | null;
  /** True for a flexible stop whose time is the order-derived estimate (shown as `~HH:MM`). */
  approximate: boolean;
  /** True for a confirmed start time (start and end both set). */
  confirmed: boolean;
  startMinutes: number | null;
  /** Minutes since midnight at which the stop is over; null when its time is unknown. */
  endMinutes: number | null;
  done: boolean;
  /** Started but not over yet. */
  inProgress: boolean;
};

export type TodayTimeline = { past: TodayStop[]; next: TodayStop | null; upcoming: TodayStop[] };

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The calendar date `now` falls on in the trip's timezone. */
export function todayDate(trip: Pick<Trip, "timezone">, now: Date) {
  return dateParts(now, trip.timezone).date;
}

/** Whether today (in the trip timezone) is between the trip's first and last day, inclusive. */
export function isTripInProgress(trip: Pick<Trip, "startDate" | "endDate" | "timezone">, now: Date) {
  const today = todayDate(trip, now);
  return trip.startDate.slice(0, 10) <= today && today <= trip.endDate.slice(0, 10);
}

/**
 * The day's stops split into past, next and upcoming. Notes, all-day items (hotels) and items that only span the
 * date from an earlier day are not stops. Flexible stops use the same order-derived `~HH:MM` as Plan. A stop is
 * done once its end time (or start + 1 h) has passed; since the day runs in order, a stop before a done one is done.
 */
export function todayTimeline(
  items: readonly TravelObject[],
  date: string,
  now: Date,
  timeZone: string,
): TodayTimeline {
  const events = eventItems(items.filter((item) => occursOnItineraryDate(item, date))).sort(compareScheduleOrder);
  const flexTimes = flexibleDisplayTimes(events);
  const clock = dateParts(now, timeZone);
  const nowMinutes = clock.date === date ? toMinutes(clock.time) : clock.date > date ? Infinity : -Infinity;

  const stops: TodayStop[] = events
    .filter((item) => !item.isAllDay && item.date === date)
    .map((item) => {
      const confirmed = scheduleKind(item) === "fixed";
      const time = confirmed ? item.startTime : (flexTimes.get(item.id) ?? null);
      const startMinutes = time ? toMinutes(time) : null;
      let endMinutes: number | null = null;
      if (confirmed) {
        const endsLater = !!item.endDate && item.endDate.slice(0, 10) > date;
        const end = toMinutes(item.endTime!);
        endMinutes = endsLater ? Infinity : end > startMinutes! ? end : startMinutes! + DEFAULT_STOP_MINUTES;
      } else if (startMinutes !== null) {
        endMinutes = startMinutes + DEFAULT_STOP_MINUTES;
      }
      const done = endMinutes !== null && nowMinutes >= endMinutes;
      return {
        item,
        time,
        approximate: !confirmed && time !== null,
        confirmed,
        startMinutes,
        endMinutes,
        done,
        inProgress: !done && startMinutes !== null && nowMinutes >= startMinutes,
      };
    });

  for (let index = stops.length - 2; index >= 0; index--) {
    if (!stops[index].done && stops[index + 1].done) stops[index] = { ...stops[index], done: true, inProgress: false };
  }
  const past = stops.filter((stop) => stop.done);
  const rest = stops.filter((stop) => !stop.done);
  return { past, next: rest[0] ?? null, upcoming: rest.slice(1) };
}

/**
 * When to leave for `next`: its start minus the travel time and a buffer, as `HH:MM`. Only for a stop with a
 * confirmed start time and a known travel time; flexible stops have none.
 */
export function leaveBy(
  next: Pick<TodayStop, "confirmed" | "startMinutes">,
  legSeconds: number | null | undefined,
  bufferMinutes = LEAVE_BUFFER_MINUTES,
) {
  if (!next.confirmed || next.startMinutes === null) return null;
  if (typeof legSeconds !== "number" || !Number.isFinite(legSeconds) || legSeconds <= 0) return null;
  const leave = next.startMinutes - Math.ceil(legSeconds / 60) - bufferMinutes;
  return leave >= 0 ? formatMinutes(leave) : null;
}

/**
 * Travel time of a Plan leg: summed over a Drive-mode leg's segments. `estimated` is true when any part is a
 * straight-line estimate rather than a routed time. Null when there is no usable time (transfer, unmapped, too far).
 */
export function legTravel(leg: DisplayLeg | undefined): { seconds: number; estimated: boolean } | null {
  if (!leg) return null;
  if (leg.kind === "planned") {
    const segments = leg.segments ?? [];
    if (!segments.length || segments.some((segment) => segment.seconds === undefined)) return null;
    return {
      seconds: segments.reduce((sum, segment) => sum + (segment.seconds ?? 0), 0),
      estimated: segments.some((segment) => segment.state === "estimate"),
    };
  }
  if ((leg.kind === "routed" || leg.kind === "estimate") && typeof leg.seconds === "number")
    return { seconds: leg.seconds, estimated: leg.kind === "estimate" };
  return null;
}
