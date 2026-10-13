import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as dateUtils from "../lib/date-utils.ts";
import * as schedule from "../lib/schedule-domain.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/views/TableView.tsx", import.meta.url), "utf8");
function render(items, direction = "asc") {
  let stateIndex = 0;
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
            useState: (value) => [stateIndex++ === 1 ? direction : value, () => {}],
            useMemo: (fn) => fn(),
            useEffect() {},
            useRef: (current) => ({ current }),
          };
        if (name === "@/lib/date-utils") return dateUtils;
        if (name === "@/components/views/KanbanView") return { shortDayLabel: (date) => date };
        if (name === "@/lib/schedule-domain") return schedule;
        if (name === "@/lib/type-color") return { typeColor: () => "#000000" };
        return {};
      },
    },
  );
  const patches = [];
  const tree = compiledModule.exports.TableView({
    trip: { timezone: "America/New_York", startDate: "2026-05-01", endDate: "2026-05-05" },
    items,
    typeColors: {},
    selectedIds: new Set(),
    primarySelectedId: null,
    onSelect() {},
    onInspect() {},
    onSelectionChange() {},
    onChangeItems(ids, patch) {
      patches.push(
        ...items.filter((item) => ids.includes(item.id)).map((item) => JSON.parse(JSON.stringify(patch(item)))),
      );
    },
  });
  function flatten(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node.type === "function") return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
  }
  return { nodes: flatten(tree), patches };
}
const item = (id, date, startTime = null, endTime = null, isAllDay = false) => ({
  id,
  title: id,
  type: "food",
  date,
  endDate: date,
  startTime,
  endTime,
  isAllDay,
});

test("Table displays date-only items and orders them among timed and undated items", () => {
  const items = [
    item("A later", "2026-03-10"),
    item("B earlier", "2026-03-08"),
    item("C timed", "2026-03-08", "09:00", "10:00"),
    item("D undated", null),
    item("E all-day", "2026-03-09", null, null, true),
  ];
  const { nodes } = render(items);
  const starts = nodes.filter((node) => node.type === "input" && node.props["aria-label"]?.startsWith("Start date"));
  assert.deepEqual(
    starts.map((node) => [node.props["aria-label"], node.props.type, node.props.defaultValue]),
    [
      ["Start date for B earlier", "date", "2026-03-08"],
      ["Start date for C timed", "datetime-local", "2026-03-08T09:00"],
      ["Start date for E all-day", "date", "2026-03-09"],
      ["Start date for A later", "date", "2026-03-10"],
      ["Start date for D undated", "datetime-local", ""],
    ],
  );
  const descending = render(items, "desc").nodes.filter(
    (node) => node.type === "input" && node.props["aria-label"]?.startsWith("Start date"),
  );
  assert.deepEqual(
    descending.map((node) => node.props["aria-label"]),
    starts.map((node) => node.props["aria-label"]).reverse(),
  );
});

test("Table date-only edits preserve flexible spans and clearing unschedules", () => {
  const flexible = { ...item("Flexible", "2026-03-08"), endDate: "2026-03-10" };
  const { nodes, patches } = render([flexible]);
  const input = nodes.find((node) => node.props["aria-label"] === "Start date for Flexible");
  input.props.onBlur({ currentTarget: { value: "2026-03-14" } });
  assert.deepEqual(patches[0], { date: "2026-03-14", endDate: "2026-03-16", placementTime: null });
  input.props.onBlur({ currentTarget: { value: "" } });
  assert.deepEqual(patches[1], { date: null, endDate: null, placementTime: null, dayOrder: null });
});
