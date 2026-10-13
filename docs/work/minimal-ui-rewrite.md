# Minimal UI rewrite

**Status:** In progress (2026-10-13). WS0 Foundation merged into the integration branch. Next: user checkpoint, then batch A (WS3, WS4, WS5).

**Goal:** Rebuild the workspace UI in the Minimal design, in light and dark themes, without changing behaviour, the API, the schema or persisted client state.

**Design source:** [docs/design/minimal-ui](../design/minimal-ui/README.md) (canonical boards, reference screenshots, design tokens, how to read the mockups). Decision: [ADR 0006](../decisions/0006-minimal-ui.md).

**Branch:** `claude/minimal-ui-rewrite` (integration branch, created from `origin/main` at `e5f79fa`). All workstream branches start from it and merge back into it. Open one PR from it to `main` when Phase 2 is complete.

**Scope:**

- In: app shell and header, theme tokens and fonts, all six views (Plan, Calendar, Board, Table, Map, Spend), the item editor, trip dialogs and menus, map theming, light and dark, existing mobile layout restyled.
- Out (separate later work): walking routes and travel times (needs a routing provider, server route, cache table and migration — see Phase 3), MapLibre or 3D maps, new features not in the mockups, API or schema changes.

## Workstreams

Each workstream has its own notes file under [minimal-ui/](minimal-ui/README.md); agents edit only their own file. This plan is maintained by the coordinator.

| Workstream | Notes file | Batch | Status |
| --- | --- | --- | --- |
| WS0 Foundation | this file (below) | 0 | Merged |
| WS3 Board + Table | [ws3-board-table.md](minimal-ui/ws3-board-table.md) | A | Not started |
| WS4 Map + Spend | [ws4-map-spend.md](minimal-ui/ws4-map-spend.md) | A | Not started |
| WS5 Item editor + dialogs | [ws5-editor.md](minimal-ui/ws5-editor.md) | A | Not started |
| WS1 Plan view | [ws1-plan.md](minimal-ui/ws1-plan.md) | B | Not started |
| WS2 Calendar | [ws2-calendar.md](minimal-ui/ws2-calendar.md) | B | Not started |
| WS6 Integration, QA, docs, PR | this file (below) | C | Not started |
| WS7 Walking routes | this file (below) | Later | Needs decision |

## Rules for every agent

Read these before editing:

1. `AGENTS.md` (important invariants), this plan, your workstream file, [minimal-ui/README.md](minimal-ui/README.md) (done-checks), and the design README. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
2. **Behaviour must not change.** Keep `date`/`endDate`/`startTime`/`endTime`/`placementTime`/`dayOrder` handling, drag and drop, multi-select, keyboard shortcuts (1–6 views in header order: 1 Plan, 2 Calendar, 3 Board, 4 Table, 5 Map, 6 Spend — renumbered by user decision on 2026-10-13; Q/W/E calendar modes, Space for Ideas, Delete with confirmation), autosave, Maps URL handling, attachments, and expense rules (actual expenses separate from planned costs; totals per currency, no conversion).
3. **Do not change persisted state.** Keep the `PlannerTab` values (`calendar`, `kanban`, `days`, `table`, `map`, `expenses`), `calendarMode`, `theme` and `sidebarCollapsed` in `store/use-travel-store.ts`. Labels come from `plannerTabLabels` (`days` is **Plan**, `kanban` **Board**, `expenses` **Spend**).
4. **Use theme tokens, not colours.** Use the CSS variables and Tailwind token classes from WS0 (`bg-background`, `text-foreground`, `text-muted`, `text-faint`, `border-divider`, `bg-surface`, `bg-panel`, `text-accent`, `text-danger`, `border-input-rule`, `font-mono`). Type colours come from `typeColor()` and `typeTextColor()` in `lib/type-color.ts`. Do not add hard-coded colours. Unlike stock shadcn, `accent` here is the vermilion highlight (selected stop, "Idea", warnings), not a neutral hover colour: use `bg-surface` for hover and `bg-surface-selected` for selected rows, never `hover:bg-accent`.
5. **Mobile stays working.** The mobile contract in [mobile-ui-implementation.md](mobile-ui-implementation.md) must keep working at 320–390px.
6. **Own only your files.** Shared files are owned by the coordinator after WS0: `AppShell.tsx`, `globals.css`, `layout.tsx`, `LeafletMap.tsx`, `lib/type-color.ts`, `components/ui/*`, `components/layout/TripMenu.tsx`, `ItemSearch.tsx`, the store. Put needed changes under **Notes / Requests** in your workstream file.
7. **Keep OSM attribution visible** on every map. No new map provider, API key or billing.
8. Prettier formats files (`npm run format`). Add or update behavioural tests where a practical seam exists.
9. **Commit work in progress at milestones** on your branch; never push, merge or open a PR.

### Environment gotchas

- Work in your own git worktree. Turbopack rejects a symlinked `node_modules`, so run `npm ci` in each worktree, and copy `.env` from the main checkout.
- In a fresh worktree, run `npx prisma generate` and `npx next typegen` before `npm run typecheck`, or Prisma types, `LayoutProps` and route types are missing. Revert the resulting `next-env.d.ts` change before committing.
- PostgreSQL runs in Docker (`travel-planner-postgres-1`, port 5433). Start Docker Desktop if the app shows "Request failed".
- Use the port listed for your workstream (`npm run dev -- -p 31NN`).
- Test data: do not delete or rewrite the retained trips **Codex Mobile UI QA**, **Codex Mobile UI Empty QA** or **MacOS Test Trip**. Use **Minimal UI QA** (ID `e397046e-53c7-4929-bf4f-44e7b0c3e3cc`); add test items there and leave its baseline items in place.

## Work sequence and review gate

```
Batch 0   WS0 Foundation                           merged
          → user checkpoint: review the running app
Batch A   WS3 Board+Table · WS4 Map+Spend · WS5 Editor   (parallel)
Batch B   WS1 Plan · WS2 Calendar                        (parallel, after A merges)
Batch C   WS6 Integration, parity QA, docs, PR
Later     WS7 Walking routes (needs a routing-provider decision)
```

Running at most three workstreams at once keeps machine load and merge work manageable. Batch A goes first because its views are the most self-contained; WS1 and WS2 share patterns (Plan list, Day mode) and benefit from batch A's settled styles.

**Review gate (coordinator, before every merge):**

1. Read the workstream's report and diff; check it stayed inside its owned files.
2. Re-run the done-checks in [minimal-ui/README.md](minimal-ui/README.md) (do not rely on the agent's report).
3. Run the branch, compare against the reference screenshots in both themes and at 390px.
4. Run a code review on the diff; send real problems back to the agent, fix trivial ones directly.
5. Merge with `--no-ff`, re-run `npm run check`, push, and summarise for the user what the agent built, kept, dropped, and what was fixed or sent back.

## Open decisions

- **Plan view cross-day moves** (WS1 default): drag onto a day in the day strip instead of the old multi-column layout. The user can override.

---

## WS0 — Foundation (merged)

Merged as `245f856` (agent commits `fa18887` and review fixes `dffa0bb`).

Delivered: light/dark tokens in `globals.css` mapped into Tailwind `@theme` (shadcn variables point at them); Geist and Geist Mono via `next/font/google`; one-line header (trip switcher, plain-text tabs, search, add) replacing the sidebar; `components/layout/TripMenu.tsx` shared by the desktop popover and the mobile More sheet (which also lists Plan, Board, Table); `components/layout/ItemSearch.tsx`; `lib/trip-dates.ts`; `typeTextColor()` and `contrastRatio()` in `lib/type-color.ts` with tests; themed `LeafletMap` (tile-pane filters, numbered circle pins, `dimmedItemIds`, attribution); token-based `button.tsx` and `ConfirmDialog.tsx`; `menuItem` prop on `components/trip/*` triggers. Retained QA trip **Minimal UI QA** (`e397046e-53c7-4929-bf4f-44e7b0c3e3cc`, 21 items, two JPY and one SGD expense).

Review findings fixed before merge: mobile More sheet lacked Plan/Board/Table (views were unreachable on phones); shortcuts fired while the trip menu was open; search pick on Spend did nothing; search combobox ARIA state; an eslint-disable in `LeafletMap`. Not verified in a browser: CSV file selection.

## WS6 — Integration, parity QA, docs (Batch C)

**Owner:** coordinator on `claude/minimal-ui-rewrite` · **Port:** 3100

- [ ] Resolve outstanding Requests; remove now-unused code and colour classes (the done-check grep over `components/` should only show deliberate leftovers).
- [ ] Run the parity matrix in `docs/REFACTORING_TRACKER.md` ("Required parity matrix") in both themes.
- [ ] Mobile pass at 320 and 390px against [mobile-ui-implementation.md](mobile-ui-implementation.md).
- [ ] Accessibility pass: focus order and visible focus in header, trip menu, tabs, editor; text contrast 4.5:1 for body and type-coloured headings in both themes.
- [ ] `npm run check` and `npx next build --webpack`.
- [ ] Update `docs/architecture.md` (shell layout, theme tokens) and the `AGENTS.md` code map; mark this plan complete.
- [ ] Open the PR from `claude/minimal-ui-rewrite` to `main` with before/after screenshots in both themes.

## WS7 — Walking routes and travel times (later, separate PR)

Not part of this rewrite. Needs a decision from the user first: routing provider (hosted OpenRouteService or GraphHopper with a key, or self-hosted OSRM/Valhalla on the NAS). Plan when approved: server route that calls the provider and caches each leg in a new Postgres table (migration), walking time and distance between consecutive located stops in the Plan list ("11 min walk · 0.8 km · Directions"), a "tight" warning when a leg exceeds the gap before the next fixed item, and the route drawn on the day map. `docs/design/minimal-ui/assets/walking-legs-day3.json` shows the intended output.

## Findings

- PR #14 (flexible windows) and PR #15 (Prettier, Calendar split into `components/views/calendar/`, `useItemActions`) are on `main`; this plan targets that structure.
- The Week card top-alignment fix was never merged; WS2 applies it in `WeekPlanner.tsx`.
- Before the rewrite, components hard-coded `stone`/`neutral`/`emerald` classes on about 125 lines (most in `DayJourneyView`, `TableView`, `AppShell`, `KanbanView`, `WeekPlanner`); WS0 cleared `AppShell`.
- Agents' reports can overstate verification: WS0 reported the mobile sheet "works" while three views were unreachable. Keep the coordinator's independent browser check in the review gate.

## Verification log (coordinator)

- WS0 merge `245f856`: `npm run check` (0 lint errors, 94/94 tests) and `npx next build --webpack` passed on the WS0 branch; `npm run check` passed again after the merge. Browser on port 3100: header, trip menu, dark theme, map filter at 1440px; mobile header, bottom nav and More sheet (Views section) at 375px; code review findings resolved.
