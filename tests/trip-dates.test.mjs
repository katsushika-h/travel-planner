import assert from "node:assert/strict";
import test from "node:test";
import { formatTripDateRange } from "../lib/trip-dates.ts";

test("trip date ranges stay compact and use calendar dates without timezone shifts", () => {
  assert.equal(formatTripDateRange("2027-04-03T00:00:00.000Z", "2027-04-10T00:00:00.000Z"), "Apr 3 – 10");
  assert.equal(formatTripDateRange("2027-04-28", "2027-05-03"), "Apr 28 – May 3");
  assert.equal(formatTripDateRange("2026-12-29", "2027-01-02"), "Dec 29, 2026 – Jan 2, 2027");
  assert.equal(formatTripDateRange("2027-04-03", "2027-04-03"), "Apr 3");
});
