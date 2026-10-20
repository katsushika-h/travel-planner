import assert from "node:assert/strict";
import test from "node:test";
import { layoutOverlaps, phoneDaySegments, phoneHourRange, phoneLaneBars, weekStartOf } from "../lib/phone-week.ts";

const item = (id, fields = {}) => ({
  kind: "event",
  id,
  title: id,
  type: "activity",
  date: "2026-12-02",
  endDate: null,
  startTime: null,
  endTime: null,
  placementTime: null,
  dayOrder: null,
  isAllDay: false,
  createdAt: "2026-12-01T00:00:00.000Z",
  ...fields,
});
const week = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"];

test("overnight items clip at midnight and continue on the next date", () => {
  const night = item("night", { date: "2026-12-02", endDate: "2026-12-03", startTime: "22:00", endTime: "06:00" });
  assert.deepEqual(
    phoneDaySegments([night], "2026-12-02").map(({ start, end, continued }) => [start, end, continued]),
    [[1320, 1440, false]],
  );
  assert.deepEqual(
    phoneDaySegments([night], "2026-12-03").map(({ start, end, continued }) => [start, end, continued]),
    [[0, 360, true]],
  );
  assert.deepEqual(phoneDaySegments([night], "2026-12-04"), []);
});

test("flexible items sit at placementTime as unconfirmed blocks; all-day items and notes are not blocks", () => {
  const flexible = item("flex", { placementTime: "16:15" });
  const [segment] = phoneDaySegments(
    [flexible, item("stay", { isAllDay: true }), item("note", { kind: "note" })],
    "2026-12-02",
  );
  assert.equal(segment.flexible, true);
  assert.equal(segment.start, 16 * 60 + 15);
  assert.equal(phoneDaySegments([flexible], "2026-12-03").length, 0);
});

test("hour range pads one hour, keeps at least eight hours and stays inside the day", () => {
  assert.deepEqual(phoneHourRange([{ start: 10 * 60, end: 11 * 60 }]), { startHour: 7, endHour: 15 });
  assert.deepEqual(phoneHourRange([{ start: 9 * 60 + 30, end: 18 * 60 }]), { startHour: 8, endHour: 19 });
  assert.deepEqual(phoneHourRange([{ start: 22 * 60, end: 24 * 60 }]), { startHour: 16, endHour: 24 });
  assert.deepEqual(phoneHourRange([{ start: 0, end: 360 }]), { startHour: 0, endHour: 8 });
  assert.deepEqual(phoneHourRange([]), { startHour: 9, endHour: 17 });
});

test("overlapping blocks share the width; separate blocks keep full width", () => {
  const layout = layoutOverlaps([
    { start: 600, end: 720 },
    { start: 660, end: 780 },
    { start: 700, end: 760 },
    { start: 900, end: 960 },
  ]);
  assert.deepEqual(layout, [
    { col: 0, cols: 3 },
    { col: 1, cols: 3 },
    { col: 2, cols: 3 },
    { col: 0, cols: 1 },
  ]);
});

test("lane bars put the trip first, span stays by night, and count overflow beyond the lane cap", () => {
  const hotel = item("hotel", { type: "hotel", isAllDay: true, date: "2026-12-01", endDate: "2026-12-04" });
  const note = item("note", { kind: "note", date: "2026-12-03" });
  const extra1 = item("extra1", { isAllDay: true, date: "2026-12-02", endDate: "2026-12-03" });
  const extra2 = item("extra2", { isAllDay: true, date: "2026-12-03" });
  const result = phoneLaneBars([hotel, note, extra1, extra2], week, { start: "2026-11-30", end: "2026-12-05" });
  assert.deepEqual(result.tripBar, { startColumn: 1, dayCount: 6 });
  const hotelBar = result.bars.find((bar) => bar.item.id === "hotel");
  assert.deepEqual([hotelBar.startColumn, hotelBar.dayCount, hotelBar.lane], [2, 3, 1]);
  assert.ok(result.bars.every((bar) => bar.lane >= 1 && bar.lane <= 2));
  assert.equal(result.bars.length, 2);
  assert.equal(result.overflow[4], 2);
  assert.equal(
    result.overflow.reduce((a, b) => a + b, 0),
    2,
  );
  assert.equal(result.laneCount, 3);
});

test("week starts on Monday", () => {
  assert.equal(weekStartOf("2026-12-02"), "2026-11-30");
  assert.equal(weekStartOf("2026-11-30"), "2026-11-30");
  assert.equal(weekStartOf("2026-11-29"), "2026-11-23");
});
