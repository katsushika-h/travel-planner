import assert from "node:assert/strict";
import test from "node:test";
import { isModKey, isSearchShortcut, searchButtonTitle, shortcutGroups } from "../lib/keyboard-shortcuts.ts";

const key = (over) => ({ key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });

test("isModKey accepts Cmd or Ctrl", () => {
  assert.equal(isModKey(key({ metaKey: true })), true);
  assert.equal(isModKey(key({ ctrlKey: true })), true);
  assert.equal(isModKey(key({})), false);
});

test("isSearchShortcut matches Mod+K only", () => {
  assert.equal(isSearchShortcut(key({ metaKey: true })), true);
  assert.equal(isSearchShortcut(key({ ctrlKey: true, key: "K" })), true);
  assert.equal(isSearchShortcut(key({})), false);
  assert.equal(isSearchShortcut(key({ ctrlKey: true, key: "j" })), false);
  assert.equal(isSearchShortcut(key({ ctrlKey: true, altKey: true })), false);
  assert.equal(isSearchShortcut(key({ ctrlKey: true, shiftKey: true })), false);
});

test("search button title shows the platform hint and the shortcut is documented", () => {
  assert.equal(searchButtonTitle(true), "Search items (⌘K)");
  assert.equal(searchButtonTitle(false), "Search items (Ctrl K)");
  const global = shortcutGroups.find((group) => group.title === "Global");
  assert.ok(global.shortcuts.some((s) => s.keys.join("+") === "Mod+K" && s.description === "Search items"));
});
