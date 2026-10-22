/**
 * Keyboard shortcuts shown in the "?" help overlay. Add new shortcuts here only; the overlay renders whatever
 * is listed. Document only shortcuts that exist in code.
 *
 * A key token is a literal label ("Q", "Esc", "Shift", "Click") or "Mod", which renders as ⌘ on Apple
 * platforms and Ctrl elsewhere. Tokens in one `keys` array are pressed together.
 */
export type Shortcut = { keys: string[]; description: string };
export type ShortcutGroup = { title: string; shortcuts: Shortcut[] };

export const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], description: "Show or hide this list" },
      { keys: ["Mod", "K"], description: "Search items" },
      { keys: ["Esc"], description: "Clear the selection and close the item panel" },
      { keys: ["Delete"], description: "Delete the selected items (asks first)" },
      { keys: ["Mod", "Z"], description: "Undo the last move, reorder, type change or delete" },
      { keys: ["Mod", "Shift", "Z"], description: "Redo" },
      { keys: ["Ctrl", "Y"], description: "Redo (alternative, Windows and Linux style)" },
      { keys: ["Mod", "D"], description: "Duplicate the selected items" },
      { keys: ["Mod", "V"], description: "Paste a Google Maps link to add it as an idea" },
    ],
  },
  {
    title: "Views",
    shortcuts: [
      { keys: ["1"], description: "Plan" },
      { keys: ["2"], description: "Calendar" },
      { keys: ["3"], description: "Kanban" },
      { keys: ["4"], description: "Table" },
      { keys: ["5"], description: "Map" },
      { keys: ["6"], description: "Spend" },
    ],
  },
  {
    title: "Calendar",
    shortcuts: [
      { keys: ["Q"], description: "Month view" },
      { keys: ["W"], description: "Week view" },
      { keys: ["←"], description: "Previous week" },
      { keys: ["→"], description: "Next week" },
      { keys: ["Space"], description: "Show or hide Ideas (week view)" },
    ],
  },
  {
    title: "Plan and Ideas",
    shortcuts: [
      { keys: ["Space"], description: "Show or hide the Ideas panel (opens with the search box focused)" },
      { keys: ["Esc"], description: "In the Ideas search, clear the text, then close the panel" },
      { keys: ["A–Z"], description: "In the Ideas list, jump to the next idea starting with that letter" },
      { keys: ["Double-click"], description: "Open an idea in the item panel" },
    ],
  },
  {
    title: "Selection",
    shortcuts: [
      { keys: ["Shift", "Click"], description: "Add or remove an item from the selection" },
      { keys: ["Mod", "Click"], description: "Same, in the Plan view" },
      { keys: ["Shift", "Click"], description: "Filter the Map by several days at once" },
      { keys: ["Mod", "A"], description: "Select all visible rows in the Table" },
    ],
  },
  {
    title: "Item panel and editing",
    shortcuts: [
      { keys: ["Enter"], description: "Save the field you are editing" },
      { keys: ["Esc"], description: "Cancel a Table cell edit" },
      { keys: ["Tab"], description: "Next field in the item panel" },
      { keys: ["Shift", "Tab"], description: "Previous field in the item panel" },
      { keys: ["Space"], description: "Add the typed tag" },
      { keys: ["Backspace"], description: "In an empty tag box, remove the last tag" },
      { keys: ["Delete"], description: "Delete the open item when no field has focus" },
    ],
  },
  {
    title: "Search, menus and dialogs",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Move through search results or menu items" },
      { keys: ["Enter"], description: "Open the highlighted search result" },
      { keys: ["Home", "End"], description: "Jump to the first or last menu item" },
      { keys: ["Esc"], description: "Close search, menus and dialogs" },
      { keys: ["Delete"], description: "Confirm a delete dialog" },
    ],
  },
];

/** True on Apple platforms, where "Mod" is ⌘. */
export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform ?? "");
}

export function formatShortcutKey(key: string, apple: boolean) {
  if (key === "Mod") return apple ? "⌘" : "Ctrl";
  if (key === "Delete") return apple ? "⌫" : "Del";
  if (key === "Backspace") return apple ? "⌫" : "Backspace";
  return key;
}

/** True for the platform command key: ⌘ on Apple platforms, Ctrl elsewhere. Either is accepted so handlers need no platform check. */
export function isModKey(event: { metaKey: boolean; ctrlKey: boolean }) {
  return event.metaKey || event.ctrlKey;
}

/** Mod+K, the global item search shortcut. */
export function isSearchShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}) {
  return isModKey(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}

/** Tooltip for the Search button, with the shortcut hint for the platform. */
export function searchButtonTitle(apple: boolean) {
  return `Search items (${apple ? "⌘K" : "Ctrl K"})`;
}
