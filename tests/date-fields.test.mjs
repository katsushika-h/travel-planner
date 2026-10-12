import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../components/inspector/DateFields.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function inputs(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(inputs);
  return [...(tree.type === "input" ? [tree] : []), ...inputs(tree.props?.children)];
}
function editor(initialValue = "2026-10-10", options = {}) {
  let state;
  let version = 0;
  const changes = [];
  const props = { label: "Start date", value: initialValue, defaultYear: "2026", onChange(date) { changes.push(date); props.value = date; }, ...options };
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports,
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react") return {
        useId: () => "date-error",
        useState(initial) {
          state ??= initial();
          return [state, (next) => { state = next; version++; }];
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render() {
    let tree, previous;
    do { previous = version; tree = compiledModule.exports.DateFields(props); } while (version !== previous);
    return inputs(tree);
  }
  const field = (part) => render().find((input) => input.props["aria-label"].endsWith(part));
  return {
    changes, props, render, field,
    type(part, value) { field(part).props.onChange({ target: { value } }); },
    blur(part) { field(part).props.onBlur(); },
  };
}

test("Date segments follow day/month/year order and save each valid field on blur", () => {
  const entry = editor();
  assert.deepEqual(entry.render().map((input) => input.props["aria-label"]), ["Start date day", "Start date month", "Start date year"]);
  for (const [part, value] of [["day", "15"], ["month", "11"], ["year", "2027"]]) {
    entry.type(part, value);
    entry.blur(part);
  }
  assert.deepEqual(entry.changes, ["2026-10-15", "2026-11-15", "2027-11-15"]);
});

test("New dates default to the current year and pad single-digit day/month", () => {
  const entry = editor("");
  assert.equal(entry.field("year").props.value, "2026");
  entry.type("day", "3"); entry.blur("day");
  assert.deepEqual(entry.changes, []);
  entry.type("month", "4"); entry.blur("month");
  assert.deepEqual(entry.changes, ["2026-04-03"]);
  entry.type("year", ""); entry.blur("year");
  assert.equal(entry.field("year").props.value, "2026");
});

test("Invalid dates and short years remain drafts, and leap dates are validated", () => {
  const entry = editor("2028-02-28");
  entry.type("day", "31"); entry.blur("day");
  assert.deepEqual(entry.changes, []);
  assert.equal(entry.field("day").props["aria-invalid"], true);
  entry.type("day", "29"); entry.blur("day");
  assert.deepEqual(entry.changes, ["2028-02-29"]);
  entry.type("year", "2027"); entry.blur("year");
  assert.equal(entry.changes.length, 1);
  entry.type("year", "27"); entry.blur("year");
  assert.equal(entry.changes.length, 1);
});

test("End dates cannot precede the start date", () => {
  const entry = editor("2026-10-12", { label: "End date", min: "2026-10-10" });
  entry.type("day", "9"); entry.blur("day");
  assert.deepEqual(entry.changes, []);
  assert.equal(entry.field("day").props["aria-invalid"], true);
  entry.type("day", "10"); entry.blur("day");
  assert.deepEqual(entry.changes, ["2026-10-10"]);
});

test("Enter leaves the segment and commits through blur without submitting", () => {
  const entry = editor();
  entry.type("day", "16");
  let prevented = false;
  entry.field("day").props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; }, currentTarget: { blur() { entry.blur("day"); } } });
  assert.equal(prevented, true);
  assert.deepEqual(entry.changes, ["2026-10-16"]);
});

test("External date changes reset drafts without changing the input keys", () => {
  const entry = editor();
  entry.type("day", "22");
  entry.props.value = "2027-12-24";
  assert.deepEqual(entry.render().map((input) => input.props.value), ["24", "12", "2027"]);
  entry.props.value = "";
  assert.deepEqual(entry.render().map((input) => input.props.value), ["", "", "2026"]);
});
