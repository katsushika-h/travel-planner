# Issue 4: Restore Week time-slot creation

**Status:** Implementation complete; ready for PR review.

**Goal:** Double-clicking blank space in Week creates an item at that date/time, including days that already have items. The item opens in the existing inspector, where Remove time makes it flexible.

**Scope:** Week slot event handling and creation callback wiring; regression tests. Reuse the existing quarter-hour rounding and AppShell's one-hour creation flow.

## Checklist

- [x] Read issue #4 and comments (none), inspect clean working tree, and branch from updated origin/main.
- [x] Restore slot double-click creation and pass the clicked time through WeekPlanner to AppShell.
- [x] Preserve the empty-day flexible Add item action and existing drag/drop handlers.
- [x] Test populated/empty days, quarter-hour rounding, the final slot, and the empty-day action.
- [x] Run npm run check and git diff --check.

**Findings:** WeekTimeSlot had only a droppable handler. The only Week creation action was conditional on the day having no visible items. AppShell already creates timed items and opens their inspector; ObjectInspectorPanel already supports Remove time. No API or schema changes are needed.

**Current state:** Double-clicking a blank slot creates a timed item at the nearest quarter hour (bounded to 23:45). The Week footer and slot tooltip advertise the gesture. Double-clicking item cards retains their existing behavior because the handler belongs to the background slots, not the column.

**Verification:** All 68 tests, lint, and TypeScript checking passed via npm run check, with six existing image warnings. Three new component-handler regression tests use the installed TypeScript compiler and mocked hooks/drag bindings; they render WeekPlanner and invoke actual slot callbacks without a browser or database. The same tests against origin/main fail the two timed-creation cases and pass the existing empty-day case. git diff --check passed. Browser interaction and production build were not run.

**Remaining work / next step:** Review and merge the PR. Optional browser smoke check: on a populated Week day, double-click blank space at 14:30; confirm the inspector shows that date and 14:30–15:30, then choose Remove time and confirm the item becomes flexible.
