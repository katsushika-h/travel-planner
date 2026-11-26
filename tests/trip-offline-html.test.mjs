import assert from "node:assert/strict";
import test from "node:test";
import { createTripOfflineHtml, offlineFileName } from "../lib/trip-offline-html.ts";

const trip = {
  id: "trip-1",
  title: "Kyoto <&> Osaka",
  startDate: "2026-10-03",
  endDate: "2026-10-04",
  timezone: "Asia/Tokyo",
  defaultCurrency: "JPY",
  createdAt: "2026-09-01T00:00:00.000Z",
};
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
const expense = (id, fields = {}) => ({
  id,
  tripId: trip.id,
  travelObjectId: null,
  description: id,
  date: "2026-10-03",
  amount: "1000.000",
  currency: "JPY",
  category: "food",
  notes: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...fields,
});

const render = (input) =>
  createTripOfflineHtml({ trip, items: [], expenses: [], generatedAt: new Date("2026-10-04T03:00:00Z"), ...input });

test("escapes trip and item text and keeps only web links", () => {
  const html = render({
    items: [
      item("<script>alert(1)</script>", {
        notes: "hi",
        location: { name: "Shrine", googleMapsUrl: "javascript:alert(1)" },
      }),
    ],
  });
  assert.match(html, /<title>Kyoto &lt;&amp;&gt; Osaka<\/title>/);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("javascript:alert"));
  assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Shrine/);
});

test("lists every day, ideas, and per-currency spending with linked expenses", () => {
  const html = render({
    items: [item("Temple", { cost: { amount: 500, currency: "JPY" } }), item("Someday", { date: null, endDate: null })],
    expenses: [
      expense("Lunch", { travelObjectId: "Temple" }),
      expense("Train", { amount: "2.500", currency: "EUR", category: "transport", date: "2026-10-04" }),
      expense("Other trip", { tripId: "trip-2", amount: "999.000" }),
    ],
  });
  assert.match(html, /id="day-1"/);
  assert.match(html, /id="day-2"/);
  assert.match(html, /id="ideas"/);
  assert.match(html, /Total spent · EUR · 1 entry</);
  assert.match(html, /Total spent · JPY · 1 entry</);
  assert.match(html, /<span class="label">Spent<\/span><ul class="spent"><li>Lunch/);
  assert.ok(!html.includes("Other trip"));
  assert.match(html, /data-filter="transport"/);
});

test("counts unlogged item costs, maps legacy categories and converts with trip rates", () => {
  const html = createTripOfflineHtml({
    trip: { ...trip, exchangeRates: { EUR: "160" } },
    items: [item("Ryokan", { type: "hotel", cost: { amount: 20000, currency: "JPY" } })],
    expenses: [expense("Bus", { amount: "10.000", currency: "EUR", category: "accommodation" })],
    generatedAt: new Date("2026-10-04T03:00:00Z"),
  });
  const jpy = html.slice(html.indexOf('data-currency="JPY"><div'));
  assert.match(jpy, /Total spent · JPY · 2 entries<\/span><span class="num">¥21,600</);
  assert.match(html, /Ryokan<\/span><span class="muted meta">Hotel · itinerary cost/);
  assert.ok(!html.includes(">Accommodation<"));
  assert.ok(!html.includes("no exchange rate"));
});

test("names currencies left out for lack of a rate", () => {
  const html = render({ expenses: [expense("Coffee", { amount: "3.000", currency: "EUR" })] });
  assert.match(html, /Not included \(no exchange rate\): EUR/);
});

test("embeds attachments as downloadable data links", () => {
  const html = render({
    items: [item("Hotel")],
    attachments: new Map([
      ["Hotel", [{ fileName: "booking.pdf", contentType: "application/pdf", base64: "JVBERg==" }]],
    ]),
  });
  assert.match(html, /href="data:application\/pdf;base64,JVBERg==" download="booking\.pdf"/);
});

test("shows an empty spending tab without expenses", () => {
  assert.match(render({}), /No expenses recorded\./);
});

test("file name follows the trip title", () => {
  assert.equal(offlineFileName("Kyoto & Osaka 2026"), "Kyoto-Osaka-2026.html");
  assert.equal(offlineFileName("  "), "trip.html");
});
