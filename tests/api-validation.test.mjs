import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { readTravelObjectContent, readTravelObjectIdentity, rejectLegacyScheduleFields } from "../lib/api-validation.ts";

test("removed schedule request keys are rejected even when null", () => {
  for (const field of ["startDateTime", "endDateTime", "dayIndex"]) {
    assert.throws(() => rejectLegacyScheduleFields({ [field]: null }), new RegExp(`${field} is no longer supported`));
  }
  assert.doesNotThrow(() => rejectLegacyScheduleFields({ date: "2026-09-24", startTime: "09:00", dayOrder: 0 }));
});

test("identity parsing keeps create requirements and partial-update fields", () => {
  assert.deepEqual(readTravelObjectIdentity({ title: "  Museum  " }, "create"), { title: "Museum", type: "unclassified" });
  assert.deepEqual(readTravelObjectIdentity({}, "update"), {});
  assert.deepEqual(readTravelObjectIdentity({ type: "food" }, "update"), { type: "food" });
  assert.throws(() => readTravelObjectIdentity({ type: null }, "update"), /type must be a non-empty string/);
  assert.throws(() => readTravelObjectIdentity({}, "create"), /title must be a non-empty string/);
  assert.throws(() => readTravelObjectIdentity({ title: " " }, "update"), /title must be a non-empty string/);
});

test("content parsing keeps create defaults and update omission semantics", () => {
  assert.deepEqual(readTravelObjectContent({}, "create"), {
    headerImage: null, location: undefined, cost: undefined, notes: undefined, tags: undefined,
  });
  assert.deepEqual(readTravelObjectContent({}, "update"), {});
  assert.deepEqual(readTravelObjectContent({ location: null, cost: null, notes: null, tags: [] }, "update"), {
    location: Prisma.JsonNull, cost: Prisma.JsonNull, notes: null, tags: [],
  });
});

test("content parsing retains field validation order and messages", () => {
  assert.throws(() => readTravelObjectContent({ headerImage: "data:image/png;base64,AA", location: [] }, "update"), /headerImage must be an http or https image URL/);
  assert.throws(() => readTravelObjectContent({ location: [], cost: { amount: -1, currency: "USD" } }, "update"), /location must be a JSON object or null/);
  assert.throws(() => readTravelObjectContent({ tags: "bad" }, "create"), /tags must be an array of strings/);
});
