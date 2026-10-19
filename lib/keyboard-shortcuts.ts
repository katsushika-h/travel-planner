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
      { keys: ["Esc"], description: "Clear the selection and close the item panel" },
      { keys: ["Delete"], description: "Delete the selected items (asks first)" },
      { keys: ["Mod", "Z"], description: "Undo the last move, reorder, type change or delete" },
      { keys: ["Mod", "Shift", "Z"], description: "Redo" },
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
      { keys: ["E"], description: "Day view" },
      { keys: ["←"], description: "Previous week or day" },
      { keys: ["→"], description: "Next week or day" },
      { keys: ["Space"], description: "Show or hide Ideas (week and day views)" },
    ],
  },
  {
    title: "Plan and Ideas",
    shortcuts: [
      { keys: ["Space"], description: "Show or hide the Ideas panel" },
      { keys: ["A–Z"], description: "In the Ideas panel, jump to the next idea starting with that letter" },
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
