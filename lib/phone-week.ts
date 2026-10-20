import { shiftDate } from "./date-utils.ts";
import { isNote } from "./note-domain.ts";
import { occursOnItineraryDate, scheduleKind } from "./schedule-domain.ts";
import { compareScheduleOrder } from "./schedule-order.ts";
import type { TravelObject } from "../types/travel.ts";

/** Pure layout helpers for the phone Week view (`components/views/calendar/PhoneWeek.tsx`). */

const DAY_MINUTES = 24 * 60;
/** A flexible item has no duration; it is drawn as a short placeholder, never as a booking length. */
export const FLEXIBLE_BLOCK_MINUTES = 45;
/** Shortest drawn block, so a 15-minute item stays readable and tappable. */
export const MIN_BLOCK_MINUTES = 30;
export const DEFAULT_FLEXIBLE_MINUTES = 9 * 60;
export const MIN_VISIBLE_HOURS = 8;

export function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

export type PhoneSegment = {
  item: TravelObject;
  date: string;
  /** Minutes from midnight of `date`. */
  start: number;
  end: number;
  /** Placed from `placementTime`: an unconfirmed position, not a booked time. */
  flexible: boolean;
  /** An overnight item continuing from the previous day (starts at midnight). */
  continued: boolean;
};

/** Timed and flexible event blocks for one date. Overnight items clip at midnight and continue on the next date. */
export function phoneDaySegments(items: readonly TravelObject[], date: string): PhoneSegment[] {
  const segments: PhoneSegment[] = [];
  for (const item of items) {
    if (isNote(item) || item.isAllDay || !item.date || !occursOnItineraryDate(item, date)) continue;
    if (scheduleKind(item) === "fixed") {
      const first = item.date.slice(0, 10);
      const last = (item.endDate ?? item.date).slice(0, 10);
      const startTime = timeToMinutes(item.startTime)!;
      const endTime = timeToMinutes(item.endTime)!;
      const start = date === first ? startTime : 0;
      let end = date === last ? endTime : DAY_MINUTES;
      if (end <= start) end = Math.min(DAY_MINUTES, Math.max(end, start + MIN_BLOCK_MINUTES));
      segments.push({ item, date, start, end, flexible: false, continued: date !== first });
    } else if (scheduleKind(item) === "flexible") {
      const placed = timeToMinutes(item.placementTime) ?? DEFAULT_FLEXIBLE_MINUTES;
      const start = Math.min(placed, DAY_MINUTES - FLEXIBLE_BLOCK_MINUTES);
      segments.push({ item, date, start, end: start + FLEXIBLE_BLOCK_MINUTES, flexible: true, continued: false });
    }
  }
  return segments.sort((a, b) => a.start - b.start || b.end - a.end || compareScheduleOrder(a.item, b.item));
}

/**
 * Whole hours the grid shows: the week's used minutes padded by one hour each side, widened to at least
 * `MIN_VISIBLE_HOURS` and clamped to the day. With nothing to show it is 09:00-17:00.
 */
export function phoneHourRange(segments: readonly { start: number; end: number }[]) {
  if (!segments.length) return { startHour: 9, endHour: 17 };
  let startHour = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.start)) / 60) - 1);
  let endHour = Math.min(24, Math.ceil(Math.max(...segments.map((s) => s.end)) / 60) + 1);
  let missing = MIN_VISIBLE_HOURS - (endHour - startHour);
  while (missing > 0) {
    if (endHour < 24) endHour += 1;
    else if (startHour > 0) startHour -= 1;
    else break;
    missing -= 1;
    if (missing > 0 && startHour > 0) {
      startHour -= 1;
      missing -= 1;
    }
  }
  return { startHour, endHour };
}

/**
 * Overlapping blocks of one day share the column width: each gets a sub-column (`col`) out of the `cols` its
 * overlap cluster needs. Returns one entry per input, in input order.
 */
export function layoutOverlaps(blocks: readonly { start: number; end: number }[]) {
  const order = blocks
    .map((_, index) => index)
    .sort((a, b) => blocks[a].start - blocks[b].start || blocks[b].end - blocks[a].end);
  const result = blocks.map(() => ({ col: 0, cols: 1 }));
  let cluster: number[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const close = () => {
    for (const index of cluster) result[index].cols = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const index of order) {
    const { start, end } = blocks[index];
    if (cluster.length && start >= clusterEnd) close();
    let col = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (col < 0) col = columnEnds.length;
    columnEnds[col] = end;
    result[index].col = col;
    cluster.push(index);
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  close();
  return result;
}

export type LaneBar = { item: TravelObject; startColumn: number; dayCount: number; lane: number };

/**
 * The all-day lane under the dates. `tripBar` spans the trip's dates in the week (lane 0). All-day events and
 * day notes follow as bars packed into the remaining lanes, at most `maxLanes` lanes in total; a bar that does not
 * fit is dropped and counted in `overflow` for each day column it covers. A stay covers its nights, so its
 * check-out day is not a column.
 */
export function phoneLaneBars(
  items: readonly TravelObject[],
  dates: readonly string[],
  trip: { start: string; end: string },
  maxLanes = 3,
) {
  const tripColumns = dates.flatMap((date, index) => (date >= trip.start && date <= trip.end ? [index] : []));
  const tripBar = tripColumns.length ? { startColumn: tripColumns[0], dayCount: tripColumns.length } : null;
  const itemLanes = Math.max(0, maxLanes - (tripBar ? 1 : 0));
  const spans = items
    .filter((item) => item.date && (isNote(item) || item.isAllDay))
    .map((item) => {
      const first = item.date!.slice(0, 10);
      const last = (item.endDate ?? item.date!).slice(0, 10);
      const lastColumn = item.type === "hotel" && !isNote(item) && last > first ? shiftDate(last, -1) : last;
      const columns = dates.flatMap((date, index) =>
        occursOnItineraryDate(item, date) && date <= lastColumn ? [index] : [],
      );
      return columns.length ? { item, startColumn: columns[0], dayCount: columns.length } : null;
    })
    .filter((span): span is NonNullable<typeof span> => span !== null)
    .sort((a, b) => a.startColumn - b.startColumn || b.dayCount - a.dayCount || compareScheduleOrder(a.item, b.item));
  const laneEnds: number[] = [];
  const bars: LaneBar[] = [];
  const overflow = dates.map(() => 0);
  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end <= span.startColumn);
    if (lane < 0) lane = laneEnds.length;
    if (lane >= itemLanes) {
      for (let column = span.startColumn; column < span.startColumn + span.dayCount; column += 1) overflow[column] += 1;
      continue;
    }
    laneEnds[lane] = span.startColumn + span.dayCount;
    bars.push({ ...span, lane: lane + (tripBar ? 1 : 0) });
  }
  const laneCount = (tripBar ? 1 : 0) + laneEnds.length;
  return { tripBar, bars, overflow, laneCount };
}

/** Monday on or before a calendar date (phone weeks start on Monday). */
export function weekStartOf(date: string) {
  return shiftDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}
