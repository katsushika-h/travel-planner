# WS3 — Board and Table

**Status:** Not started · **Batch:** A
**Branch:** `claude/minimal-ui-ws3-board-table` (from `claude/minimal-ui-rewrite`) · **Port:** 3103
**Reference:** `docs/design/minimal-ui/screenshots/board-light.jpg`, `board-dark.jpg`, `table-light.jpg`, `table-dark-with-editor.jpg` (the editor half belongs to WS5). Source boards: `MinimalBoard*.dc.html`, `MinimalTable*.dc.html`.
**Owns:** `components/views/KanbanView.tsx`, `components/views/TableView.tsx`.

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens).

## Checklist

- [ ] Board columns separated by whitespace, each with a 3px top rule and swatch in its type colour and the heading in `typeTextColor(color, theme)` from `lib/type-color.ts`; counts in Geist Mono; cards as rows with when (Geist Mono), title, place; "Idea" in the accent colour for unscheduled items.
- [ ] Keep column drag, type change on drop, custom type creation, colour picker and ordering.
- [ ] Board filter options All / Scheduled / Ideas only (client-side only; no new persisted state).
- [ ] Table: filter field with underline, ink rule above the table, hairline rows, date shown once per day, Geist Mono for date/time/cost, type dot in type colour, selected rows shaded, bulk action bar for the selection (reuse existing actions), planned-cost footer **per currency**.
- [ ] Keep sorting, inline edits, multi-select and currency totals.
- [ ] 390px: the table scrolls horizontally inside its own box; the page does not.

## Parity items

- Kanban type changes, custom type creation/removal, colours, ordering.
- Table filtering, sorting, inline edits, selection, currency totals.

## Notes / Requests

_(fill in)_

## Verification log

_(record each done-check and its result)_
