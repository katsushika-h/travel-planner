import assert from "node:assert/strict";
import test from "node:test";
import { isTripInProgress, leaveBy, legTravel, todayDate, todayTimeline } from "../lib/today.ts";

const trip = {
  startDate: "2026-11-29T00:00:00.000Z",
  endDate: "2026-12-07T00:00:00.000Z",
  timezone: "America/New_York",
};
let seq = 0;
function item(overrides = {}) {
  seq += 1;
  return {
    kind: "event",
    id: `i${seq}`,
    tripId: "t",
    title: `Item ${seq}`,
    type: "food",
    noteBody: null,
    date: "2026-11-29",
    endDate: "2026-11-29",
    startTime: null,
    endTime: null,
    placementTime: null,
    dayOrder: seq,
    isAllDay: false,
    createdAt: `2026-01-01T00:00:0${seq % 10}.000Z`,
    ...overrides,
  };
}
const fixed = (start, end, extra = {}) => item({ startTime: start, endTime: end, ...extra });
// 2026-11-29 in New York is UTC-5.
const at = (time) => new Date(`2026-11-29T${time}:00-05:00`);

test("trip in progress is judged on the trip timezone date, inclusive of both ends", () => {
  assert.equal(isTripInProgress(trip, new Date("2026-11-29T03:00:00Z")), false); // still Nov 28 in New York
  assert.equal(todayDate(trip, new Date("2026-11-29T03:00:00Z")), "2026-11-28");
  assert.equal(isTripInProgress(trip, new Date("2026-11-29T06:00:00Z")), true);
  assert.equal(isTripInProgress(trip, new Date("2026-12-08T03:00:00Z")), true); // Dec 7 evening in New York
  assert.equal(isTripInProgress(trip, new Date("2026-12-08T06:00:00Z")), false);
});

test("timeline splits done, next and upcoming from end times", () => {
  const a = fixed("09:00", "10:00");
  const b = fixed("12:00", "13:30");
  const c = fixed("18:00", "20:00");
  const tz = trip.timezone;
  let t = todayTimeline([c, a, b], "2026-11-29", at("08:00"), tz);
  assert.deepEqual([t.past.length, t.next.item.id, t.upcoming.length], [0, a.id, 2]);
  t = todayTimeline([a, b, c], "2026-11-29", at("10:00"), tz);
  assert.deepEqual(
    t.past.map((s) => s.item.id),
    [a.id],
  );
  assert.equal(t.next.item.id, b.id);
  assert.equal(t.next.inProgress, false);
  t = todayTimeline([a, b, c], "2026-11-29", at("12:30"), tz);
  assert.equal(t.next.item.id, b.id);
  assert.equal(t.next.inProgress, true);
  t = todayTimeline([a, b, c], "2026-11-29", at("21:00"), tz);
  assert.equal(t.past.length, 3);
  assert.equal(t.next, null);
});

test("flexible stops use the order-derived approximate time and start + 1 h", () => {
  const anchor = fixed("09:00", "10:00");
  const flex = item({ placementTime: "11:00" });
  const tz = trip.timezone;
  let t = todayTimeline([anchor, flex], "2026-11-29", at("11:30"), tz);
  assert.equal(t.next.item.id, flex.id);
  assert.equal(t.next.time, "11:00");
  assert.equal(t.next.approximate, true);
  assert.equal(t.next.confirmed, false);
  t = todayTimeline([anchor, flex], "2026-11-29", at("12:00"), tz);
  assert.equal(t.next, null);
});

test("notes, all-day items, spanning items and ideas are not stops", () => {
  const stop = fixed("09:00", "10:00");
  const note = item({ kind: "note", noteBody: "hi" });
  const hotel = item({ type: "hotel", isAllDay: true, date: "2026-11-28", endDate: "2026-11-30" });
  const spanning = fixed("22:00", "08:00", { date: "2026-11-28", endDate: "2026-11-29" });
  const idea = item({ date: null, endDate: null });
  const t = todayTimeline([stop, note, hotel, spanning, idea], "2026-11-29", at("08:00"), trip.timezone);
  assert.deepEqual([t.next.item.id, t.upcoming.length, t.past.length], [stop.id, 0, 0]);
});

test("an earlier stop is done once a later one has finished", () => {
  const flexNoTime = item();
  const later = fixed("09:00", "10:00");
  const t = todayTimeline([flexNoTime, later], "2026-11-29", at("10:30"), trip.timezone);
  assert.equal(t.past.length, 2);
});

test("other dates are all upcoming (future) or all past", () => {
  const stop = fixed("09:00", "10:00", { date: "2026-11-30", endDate: "2026-11-30" });
  assert.equal(todayTimeline([stop], "2026-11-30", at("23:00"), trip.timezone).next.item.id, stop.id);
  assert.equal(todayTimeline([stop], "2026-11-30", new Date("2026-12-02T12:00:00Z"), trip.timezone).past.length, 1);
});

test("leaveBy subtracts travel time and buffer, only for confirmed stops", () => {
  const confirmed = { confirmed: true, startMinutes: 12 * 60 };
  assert.equal(leaveBy(confirmed, 15 * 60), "11:35");
  assert.equal(leaveBy(confirmed, 15 * 60, 5), "11:40");
  assert.equal(leaveBy(confirmed, 61), "11:48"); // rounds the leg up to whole minutes
  assert.equal(leaveBy({ confirmed: false, startMinutes: 720 }, 900), null);
  assert.equal(leaveBy(confirmed, null), null);
  assert.equal(leaveBy(confirmed, 0), null);
  assert.equal(leaveBy({ confirmed: true, startMinutes: 5 }, 900), null);
});

test("legTravel reads routed, estimate and planned legs", () => {
  assert.equal(legTravel(undefined), null);
  assert.deepEqual(legTravel({ kind: "routed", mode: "walk", seconds: 300 }), { seconds: 300, estimated: false });
  assert.deepEqual(legTravel({ kind: "estimate", mode: "walk", seconds: 300 }), { seconds: 300, estimated: true });
  assert.equal(legTravel({ kind: "transfer", mode: "walk" }), null);
  assert.equal(legTravel({ kind: "far", mode: "walk", meters: 9000 }), null);
  const planned = {
    kind: "planned",
    mode: "drive",
    segments: [
      { role: "leg", mode: "drive", state: "routed", meters: 1, seconds: 600 },
      { role: "from-parking", mode: "walk", state: "estimate", meters: 1, seconds: 120 },
    ],
  };
  assert.deepEqual(legTravel(planned), { seconds: 720, estimated: true });
  planned.segments[0] = { role: "leg", mode: "drive", state: "estimate", meters: 1 };
  assert.equal(legTravel(planned), null);
});
