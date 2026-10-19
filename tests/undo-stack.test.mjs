import assert from "node:assert/strict";
import test from "node:test";
import { isNoopEntry, pushBounded, restorePatches, snapshotItems } from "../lib/undo-stack.ts";

const item = (id, over = {}) => ({
  id,
  date: "2026-10-01",
  endDate: "2026-10-01",
  startTime: null,
  endTime: null,
  placementTime: "09:00",
  dayOrder: 0,
  isAllDay: false,
  type: "food",
  ...over,
});

test("restorePatches returns only changed fields of changed items", () => {
  const before = [item("a"), item("b", { dayOrder: 1 })];
  const snapshot = snapshotItems(before);
  const current = [item("a", { dayOrder: 1, date: "2026-10-02" }), item("b", { dayOrder: 1 })];
  assert.deepEqual(restorePatches(snapshot, current), [{ id: "a", patch: { date: "2026-10-01", dayOrder: 0 } }]);
});

test("restorePatches ignores items that no longer exist and snapshot copies values", () => {
  const source = [item("a")];
  const snapshot = snapshotItems(source);
  source[0].type = "hotel";
  assert.deepEqual(restorePatches(snapshot, [item("c")]), []);
  assert.deepEqual(restorePatches(snapshot, source), [{ id: "a", patch: { type: "food" } }]);
});

test("isNoopEntry is false for deletes and true when nothing differs", () => {
  const snapshot = snapshotItems([item("a")]);
  assert.equal(isNoopEntry({ label: "x", before: snapshot }, [item("a")]), true);
  assert.equal(isNoopEntry({ label: "x", before: snapshot, deleted: [item("z")] }, [item("a")]), false);
});

test("pushBounded keeps only the newest entries", () => {
  let stack = [];
  for (let i = 0; i < 25; i++) stack = pushBounded(stack, i, 20);
  assert.equal(stack.length, 20);
  assert.equal(stack[0], 5);
  assert.equal(stack.at(-1), 24);
});
