import assert from "node:assert/strict";
import test from "node:test";
import { createTripPrintModel, dayRouteHref } from "../lib/trip-print.ts";
import { safeMapsHref } from "../components/views/plan/plan-domain.ts";

const trip = { id: "trip-1", startDate: "2026-10-03", endDate: "2026-10-05" };
const base = {
  kind: "event",
  noteBody: null,
  tripId: trip.id,
  type: "activity",
  date: "2026-10-03",
  endDate: "2026-10-03",
  startTime: null,
  endTime: null,
  placementTime: null,
  dayOrder: 0,
  isAllDay: false,
  notes: null,
  location: null,
  cost: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const item = (id, fields = {}) => ({ ...base, id, title: id, ...fields });

test("lists every trip day with its items in display order, skipping ideas and other trips", () => {
  const { days } = createTripPrintModel(trip, [
    item("late", { startTime: "18:00", endTime: "19:00", dayOrder: 0 }),
    item("early", { startTime: "09:00", endTime: "10:00", dayOrder: 1 }),
    item("idea", { date: null, endDate: null }),
    item("other", { tripId: "trip-2" }),
  ]);
  assert.deepEqual(
    days.map((day) => [day.dayNumber, day.date]),
    [
      [1, "2026-10-03"],
      [2, "2026-10-04"],
      [3, "2026-10-05"],
    ],
  );
  assert.deepEqual(
    days[0].items.map((entry) => [entry.id, entry.time]),
    [
      ["early", "09:00–10:00"],
      ["late", "18:00–19:00"],
    ],
  );
  assert.equal(days[1].items.length, 0);
});

test("multi-day items print once in full, then as continued lines", () => {
  const { days } = createTripPrintModel(trip, [
    item("hotel", {
      type: "hotel",
      isAllDay: true,
      endDate: "2026-10-05",
      notes: "Check-in 15:00",
      cost: { amount: 300, currency: "EUR" },
      location: { name: "Gracery" },
    }),
    item("flight", { date: "2026-10-04", endDate: "2026-10-05", startTime: "23:30", endTime: "01:00" }),
  ]);
  const [first, second] = [days[0].items[0], days[1].items[0]];
  assert.equal(first.time, "All day");
  assert.equal(first.until, "through 10-05");
  assert.equal(first.notes, "Check-in 15:00");
  assert.ok(first.cost);
  assert.ok(first.mapsHref);
  assert.equal(second.time, "Continued");
  assert.equal(second.notes, null);
  assert.equal(second.cost, null);
  assert.equal(second.mapsHref, null);

  const flight = days[1].items.find((entry) => entry.id === "flight");
  assert.equal(flight.time, "23:30");
  assert.equal(flight.until, "until 10-05 01:00");
  assert.equal(days[2].items.find((entry) => entry.id === "flight").until, null);
});

test("flexible items, day notes and per-currency totals", () => {
  const { days, totals } = createTripPrintModel(trip, [
    item("walk", { placementTime: "14:15", cost: { amount: 1000, currency: "JPY" } }),
    item("tea", { cost: { amount: 500, currency: "JPY" } }),
    item("taxi", { cost: { amount: 12, currency: "EUR" } }),
    item("note", { kind: "note", noteBody: "Buy a Suica card" }),
  ]);
  assert.equal(days[0].items[0].time, "Flexible");
  assert.deepEqual(days[0].notes, ["Buy a Suica card"]);
  assert.equal(days[0].items.length, 3);
  assert.equal(totals.length, 2);
  assert.ok(totals.some((total) => total.includes("1,500")));
});

test("maps links fall back from saved URL to name to coordinates", () => {
  assert.equal(safeMapsHref({ googleMapsUrl: "https://maps.app.goo.gl/x", name: "A" }), "https://maps.app.goo.gl/x");
  assert.match(safeMapsHref({ name: "思い出横丁" }), /query=%E6%80%9D/);
  assert.match(safeMapsHref({ lat: 35.69, lng: 139.7 }), /query=35\.69%2C139\.7$/);
  assert.equal(safeMapsHref({ lat: 200, lng: 0 }), null);
});

test("day route runs from last night's hotel through the stops, and needs two points", () => {
  const hotel = item("hotel", {
    type: "hotel",
    isAllDay: true,
    date: "2026-10-02",
    endDate: "2026-10-04",
    location: { lat: 35.69, lng: 139.7 },
  });
  const shrine = item("shrine", { startTime: "09:00", endTime: "10:00", location: { name: "Meiji Jingu" } });
  const nowhere = item("nowhere", { dayOrder: 1 });
  assert.equal(
    dayRouteHref([hotel, shrine, nowhere], "2026-10-03"),
    "https://www.google.com/maps/dir/35.69%2C139.7/Meiji%20Jingu/35.69%2C139.7",
  );
  assert.equal(dayRouteHref([shrine, nowhere], "2026-10-03"), null);
});

test("notes print as plain text", () => {
  const { days } = createTripPrintModel(trip, [
    item("tea", { notes: "**Book** ahead&#x20;" }),
    item("note", { kind: "note", noteBody: "- Buy *Suica*" }),
  ]);
  assert.equal(days[0].items[0].notes, "Book ahead");
  assert.deepEqual(days[0].notes, ["Buy Suica"]);
});
