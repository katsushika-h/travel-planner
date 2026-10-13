# WS3 — Board and Table

**Status:** Done, awaiting review · **Batch:** A
**Branch:** `claude/minimal-ui-ws3-board-table` (from `claude/minimal-ui-rewrite`) · **Port:** 3103
**Reference:** `docs/design/minimal-ui/screenshots/board-light.jpg`, `board-dark.jpg`, `table-light.jpg`, `table-dark-with-editor.jpg` (the editor half belongs to WS5). Source boards: `MinimalBoard*.dc.html`, `MinimalTable*.dc.html`.
**Owns:** `components/views/KanbanView.tsx`, `components/views/TableView.tsx`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens).

## Checklist

- [x] Board columns separated by whitespace, each with a 3px top rule and swatch in its type colour and the heading in `typeTextColor(color, theme)` from `lib/type-color.ts`; counts in Geist Mono; cards as rows with when (Geist Mono), title, place; "Idea" in the accent colour for unscheduled items.
- [x] Keep column drag, type change on drop, custom type creation, colour picker and ordering.
- [x] Board filter options All / Scheduled / Ideas only (client-side only; no new persisted state).
- [x] Table: filter field with underline, ink rule above the table, hairline rows, date shown once per day, Geist Mono for date/time/cost, type dot in type colour, selected rows shaded, bulk action bar for the selection (reuse existing actions), planned-cost footer **per currency**.
- [x] Keep sorting, inline edits, multi-select and currency totals.
- [x] 390px: the table scrolls horizontally inside its own box; the page does not.

## Parity items

- Kanban type changes, custom type creation/removal, colours, ordering.
- Table filtering, sorting, inline edits, selection, currency totals.

## Notes / Requests

**Requests for the coordinator**

1. `components/layout/AppShell.tsx`: pass `onDeleteSelected={(ids) => setPendingDeleteIds(ids)}` to `<TableView>`. The Table bulk bar shows **Delete** only when this optional prop is given (no AppShell edit was allowed). Until then the bar has Change type, Move to day, Unschedule and Clear.
2. Pre-existing, not caused by this change: unscheduling or moving several items at once fires one PATCH per item concurrently (`changeSelectedItems`), and the server's `dayOrder` compaction can trip the `TravelObject_schedule_shape` check, so one of two items stayed scheduled and the shell showed the database error. Single-item unschedule works. Consider serialising the PATCHes in `useItemActions`.

**What changed**

- Board: no outer card; "By type" heading with All / Scheduled / Ideas only (client-side `useState`, nothing persisted); columns separated by 24px with a 3px type-colour top rule, type-colour swatch (it is the colour picker), heading in `typeTextColor(color, theme)`, mono count, divider-row cards (mono when, title, place), "Idea" in `text-accent`, per-column "+ Add" (calls `onAddItem(type)`). Column drag, type change on drop, drop-on-card reordering, custom types and removal are unchanged. New-type input sits in the heading row.
- Table: "All items N" heading, underline filter field (now matches title, place or type), ink rule above the table, hairline rows, Day shown once per day (accent "Idea" when unscheduled), mono date/time/length/cost, type dot, `bg-surface-selected` selected rows with a 2px accent bar on the primary row, bulk bar (Change type, Move to day, Unschedule, Clear; Delete pending request 1), per-currency planned footer. Sorting (Day/Title/Type/Length/Planned/Tags), inline edits, multi-select, Ctrl/Cmd+A and the type/tag filter popover (now "Types & tags") are kept.
- Bulk actions reuse `onChangeItems`, `schedulePatchForMove` and the same unschedule patch as `useItemActions`.

**Intentional differences from the screenshots**

- Table keeps editable Start (datetime-local), Length and Tags columns so inline edits still work, and shows the Day label separately; the mock shows a plain Time range. Place is read-only. The planned cell shows the item's currency code in small mono next to the editable amount.
- Board cards drop the header image, tags and grip icon; columns use the real type names (Flight, Hotel, Commute...) rather than the mock's Stay/Transit.
- Board column width is fixed at 220px on phones and flexes on desktop; the page itself never scrolls horizontally.
- The old "Add item" button on the Board is replaced by per-column "+ Add" and the header "+".

## Verification log

- `npm run check`: passed (0 lint errors, 4 pre-existing `<img>` warnings in other files, tsc clean, Prettier clean, 94/94 tests).
- `npx next build --webpack`: succeeded.
- Hard-coded colour grep over both files: no output.
- Screenshots (port 3103, Minimal UI QA): Board and Table in light and dark at 1440 viewport and Board/Table at 390 (dark) compared against the references; light Board at 390 not separately captured. Browser screenshot frame was 800x500, so pixel-level comparison was visual only.
- Parity, run in the browser (light and dark rendering checked; behaviours run in one theme each): Board type change by dragging a card to another column (API confirmed), column reorder by drag, custom type creation, colour picker (border and heading colours updated), custom type removal via confirm dialog, Ideas-only filter; Table filter text, sort header, row selection, select-all, bulk Change type and Move to day (API confirmed), bulk Unschedule (single item works; multi-item race above), footer total shown per currency (JPY only in this trip, so a second-currency total was not exercised), 390px: table scrolls inside its own box (scrollWidth 1303 vs 358) and the page does not (390/390).
- Not verified: inline cell edits and keyboard shortcuts (1-6, Delete) were not exercised in the browser this pass; Delete in the bulk bar is not testable until request 1 lands; a trip with two currencies.
- Test data: created `WS3 test 1/2` and a `WS3 test type` column; all removed. Theme set back to light.
