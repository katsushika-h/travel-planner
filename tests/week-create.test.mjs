import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { eventItems, weekDropPositions } from "../lib/note-domain.ts";
import { compareScheduleOrder, isTimedItem, weekFixedLayers } from "../lib/schedule-order.ts";

// Render the Week component tree without a DOM or drag sensor. Exercise the
// actual slot handlers and callback wiring rather than matching source text.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/views/CalendarView.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexport { WeekPlanner };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: compiledModule, exports: compiledModule.exports,
  require(name) {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react") return { useState: (initial) => [initial, () => {}], useRef: (current) => ({ current }) };
    if (name === "@dnd-kit/core") return { useDroppable: () => ({}), useDraggable: () => ({}) };
    if (name === "@/lib/note-domain") return { eventItems, weekDropPositions };
    if (name === "@/lib/schedule-order") return { compareScheduleOrder, isTimedItem, weekFixedLayers };
    if (name === "@/lib/date-utils") return { formatTripDate: () => "Date" };
    if (name === "@/lib/schedule-domain") return { occursOnItineraryDate: (item, date) => item.date === date };
    if (name === "@/lib/type-color") return { typeColor: () => "#000000" };
    return {};
  },
});

function flatten(element) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(flatten);
  if (typeof element.type === "function") return flatten(element.type(element.props));
  return [element, ...flatten(element.props?.children)];
}
const date = "2026-10-10";
function renderWeek(items) {
  const calls = [];
  const nodes = flatten(compiledModule.exports.WeekPlanner({
    dates: [date], items, trip: { timezone: "Asia/Singapore" }, typeColors: {},
    selectedIds: new Set(), primarySelectedId: null, expandedDate: null, draggedItemId: null,
    onExpandedChange() {}, onSelect() {}, onResize() {}, onSelectDay() {},
    onCreateItem: (...args) => calls.push(args),
  }));
  return { nodes, calls, slots: nodes.filter((node) => node.props?.title === "Double-click to add an item at this time") };
}
function doubleClick(slot, offset) {
  slot.props.onDoubleClick({ clientY: 100 + offset, currentTarget: { getBoundingClientRect: () => ({ top: 100 }) } });
}

test("Week blank slots create timed items even when the day already has plans", () => {
  for (const existing of [[], [{ id: "fixed", kind: "event", date, endDate: date, startTime: "09:00", endTime: "10:00", dayOrder: 0 }], [{ id: "flexible", kind: "event", date, endDate: date, startTime: null, endTime: null, dayOrder: 0 }]]) {
    const { slots, calls } = renderWeek(existing);
    assert.equal(slots.length, 24);
    doubleClick(slots[14], 22);
    assert.deepEqual(calls, [[date, undefined, "14:30"]]);
  }
});

test("Week creation snaps to quarter hours and bounds the last slot", () => {
  const { slots, calls } = renderWeek([]);
  for (const offset of [0, 11, 22, 33]) doubleClick(slots[8], offset);
  doubleClick(slots[23], 43);
  assert.deepEqual(calls.map((call) => call[2]), ["08:00", "08:15", "08:30", "08:45", "23:45"]);
});

test("Week empty-day Add item still creates a flexible item", () => {
  const { nodes, calls } = renderWeek([]);
  const add = nodes.find((node) => node.type === "button" && node.props.children === "Add item");
  add.props.onClick();
  assert.deepEqual(calls, [[date, 0]]);
});
