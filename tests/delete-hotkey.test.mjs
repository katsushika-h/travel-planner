import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
class Element {
  constructor(tagName = "BUTTON", isContentEditable = false) { Object.assign(this, { tagName, isContentEditable }); }
}
function loadComponent(path) {
  const effects = [];
  const refs = [];
  const stateChanges = [];
  const listeners = new Map();
  const compiledModule = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports, HTMLElement: Element,
    window: { matchMedia: () => ({ matches: false }) },
    document: { body: {}, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: () => {} },
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react") return {
        useEffect: (effect) => effects.push(effect),
        useRef: (current) => { const ref = { current }; refs.push(ref); return ref; },
        useState: (value) => [typeof value === "function" ? value() : value, (next) => stateChanges.push(next)],
      };
      if (name === "react-dom") return { createPortal: (tree) => tree };
      if (name === "@/components/ui/use-modal-focus") return { useModalFocus() {} };
      if (name === "@/lib/type-color") return { typeColor: () => "#000000" };
      return {};
    },
  });
  return { exports: compiledModule.exports, effects, refs, stateChanges, listeners };
}
function keyEvent(key, overrides = {}) {
  return { key, target: new Element(), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
}

function inspector() {
  const loaded = loadComponent("../components/inspector/ObjectInspectorPanel.tsx");
  const requests = [];
  const tree = loaded.exports.ObjectInspectorPanel({ item: { id: "item", title: "Item", type: "unclassified" }, eventTypes: [], typeColors: {}, onRequestDelete: (id) => requests.push(id) });
  return { ...loaded, tree, requests };
}

test("Inspector Delete and Backspace request confirmation without deleting immediately", () => {
  const { tree, requests } = inspector();
  for (const key of ["Delete", "Backspace"]) {
    const event = keyEvent(key);
    tree.props.onKeyDown(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(requests, ["item", "item"]);
});

test("Inspector deletion shortcuts preserve editing and ignore held or modified keys", () => {
  const { tree, requests } = inspector();
  for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) tree.props.onKeyDown(keyEvent("Delete", { target: new Element(tag) }));
  tree.props.onKeyDown(keyEvent("Backspace", { target: new Element("DIV", true) }));
  for (const modifiers of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { defaultPrevented: true }]) tree.props.onKeyDown(keyEvent("Delete", modifiers));
  assert.deepEqual(requests, []);
});

function confirmation(props = {}) {
  const loaded = loadComponent("../components/ui/ConfirmDialog.tsx");
  const actions = [];
  loaded.exports.ConfirmDialog({ title: "Delete item?", description: "Delete", confirmOnDelete: true, onConfirm: () => actions.push("confirm"), onCancel: () => actions.push("cancel"), ...props });
  let focused = false;
  if (loaded.refs[1]) loaded.refs[1].current = { focus() { focused = true; } };
  loaded.effects.forEach((effect) => effect());
  return { ...loaded, actions, focused, onKeyDown: loaded.listeners.get("keydown") };
}

test("Item confirmation focuses Delete for native Enter activation and confirms on a second Delete", () => {
  const { focused, onKeyDown, actions } = confirmation();
  assert.equal(focused, true);
  onKeyDown(keyEvent("Delete"));
  onKeyDown(keyEvent("Backspace"));
  assert.deepEqual(actions, ["confirm", "confirm"]);
});

test("Confirmation ignores repeat and modifiers, cancels on Escape, and blocks actions while pending", () => {
  const { onKeyDown, actions } = confirmation();
  for (const modifiers of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) onKeyDown(keyEvent("Delete", modifiers));
  onKeyDown(keyEvent("Escape"));
  assert.deepEqual(actions, ["cancel"]);
  const pending = confirmation({ pending: true });
  for (const key of ["Delete", "Backspace", "Escape"]) pending.onKeyDown(keyEvent(key));
  assert.deepEqual(pending.actions, []);
});

test("Other confirmation dialogs retain their existing keyboard and focus behavior", () => {
  const { focused, onKeyDown, actions } = confirmation({ confirmOnDelete: false });
  assert.equal(focused, false);
  onKeyDown(keyEvent("Delete"));
  onKeyDown(keyEvent("Backspace"));
  assert.deepEqual(actions, []);
});
