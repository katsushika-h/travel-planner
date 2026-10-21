import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "../lib/date-utils.ts";
import * as notes from "../lib/note-domain.ts";
import * as schedule from "../lib/schedule-domain.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/views/CalendarView.tsx", import.meta.url), "utf8");
function calendar(initialMode, start, end, today) {
  const opened = [];
  const states = [];
  let index = 0;
  let mode = initialMode;
  const changes = [];
  const store = {
    calendarMode: mode,
    setCalendarMode(next) {
      mode = next;
      changes.push(next);
    },
  };
  const WeekPlanner = () => null;
  const compiledModule = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      require(name) {
        if (name === "react/jsx-runtime") return require(name);
        if (name === "react")
          return {
            useState(value) {
              const slot = index++;
              if (!(slot in states)) states[slot] = value;
              return [
                states[slot],
                (next) => {
                  states[slot] = typeof next === "function" ? next(states[slot]) : next;
                },
              ];
            },
            useMemo: (fn) => fn(),
            useCallback: (fn) => fn,
            useEffect() {},
            useRef: (current) => ({ current }),
          };
        if (name === "@/store/use-travel-store")
          return { useTravelStore: (select) => select({ ...store, calendarMode: mode }) };
        if (name === "@/lib/date-utils")
          return { ...dates, dateParts: () => ({ date: today }), formatTripDate: () => "Date" };
        if (name === "@/lib/note-domain") return notes;
        if (name === "@/lib/schedule-domain") return schedule;
        if (name === "@/lib/working-day") return { workingDay: () => undefined, setWorkingDay() {} };
        if (name === "@dnd-kit/core") return { useSensors: () => [], useSensor: () => null };
        if (name === "./calendar/usePhone") return { usePhone: () => false };
        if (name === "./calendar/WeekPlanner") return { WeekPlanner };
        return {};
      },
    },
  );
  function flatten(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    return [node, ...flatten(node.props?.children)];
  }
  function render() {
    index = 0;
    return flatten(
      compiledModule.exports.CalendarView({
        trip: { startDate: start, endDate: end, timezone: "Asia/Singapore" },
        items: [],
        selectedIds: new Set(),
        primarySelectedId: null,
        onOpenDay: (date) => opened.push(date),
      }),
    );
  }
  return { render, changes, opened, states, WeekPlanner };
}

test("desktop and mobile Today keep Week mode and show the current week even outside the trip", () => {
  for (const today of ["2026-10-13", "2026-09-20", "2026-11-20"]) {
    for (const buttonIndex of [0, 1]) {
      const view = calendar("week", "2026-10-01", "2026-10-31", today);
      const buttons = view.render().filter((node) => node.props?.children === "Today");
      assert.equal(buttons.length, 2);
      buttons[buttonIndex].props.onClick();
      assert.deepEqual(view.changes, []);
      const week = view.render().find((node) => node.type === view.WeekPlanner);
      assert.ok(week.props.dates.includes(today));
      assert.equal(week.props.expandedDate, null);
    }
  }
});

test("Month Today opens the Plan view on today, or on the trip start outside the trip", () => {
  for (const today of ["2026-10-13", "2026-11-20"]) {
    const view = calendar("month", "2026-10-01", "2026-10-31", today);
    view
      .render()
      .find((node) => node.props?.children === "Today")
      .props.onClick();
    assert.deepEqual(view.changes, []);
    assert.deepEqual(view.opened, [today === "2026-10-13" ? today : "2026-10-01"]);
  }
});
