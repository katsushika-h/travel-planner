# Mobile UI implementation

**Status:** In progress (2026-09-30). The mobile shell, Day touch actions, Month agenda, full-width inspector, and secondary-view adjustments are implemented. A persistent populated QA trip supplies representative schedule, map, long-text, and expense data; a second retained trip supplies a true empty state. Item and expense creation/editing, exact-gap insertion, reload, populated-to-empty trip switching, itinerary display, expense totals, pointer reorder, and user-confirmed phone keyboard and touch reorder checks are verified. Browser viewport checks cover inspector dismissal, dark-theme type menu, long-title display, short-height containment, short-screen expense form visibility, and empty states across all six mobile destinations. The expense load-failure state now has an explicit retry path; injected-error UI verification remains open. **Pass 6 (compact trip-use layout) is implemented (2026-10-21):** one-row header and day pills, compact two-line rows with long-press actions and floating +, four-tab nav (Trip / Places / Spend / More) with Today merged into Trip (`useTodayMark.ts`; `TodayView.tsx` deleted at the user's request — its Directions/parking lines, done state, "Day N of M" and inline note form were dropped), phone Week starting Monday (`PhoneWeek.tsx`, `lib/phone-week.ts`, tests), compact Places, and More → Calendar / Ideas. `npm run check` passes (231 tests). Browser-checked at 390x844 (dark) and, per step, 320x568; desktop Day unchanged. Light theme and the Monday-start week (including previous-week navigation) were checked at 390x844, and Trip/Places at 320x568 with no horizontal overflow (2026-10-21). Changing week keeps the weekday but snaps to the nearest trip day when that week overlaps the trip (`shiftWeekSelection`); checked 30 Nov → 29 Nov → 6 Dec → 7 Dec. Open: real-phone long-press/swipe check, and end-to-end runs of Insert above/below from the long-press sheet.

**Goal:** Make the Travel Planner usable on a phone with the **Trip scroll** design: a compact trip header, continuous Day itinerary, day-map switch, and bottom navigation. The mockup in the planning conversation illustrates the layout with sample data; this document is the implementation contract.

**Scope:** Mobile layout and interaction for the existing six workspace views, trip controls, item creation, and inspection. Keep the desktop UI and existing data contracts. No API, schema, migration, authentication, routing, or Docker work is planned. The alternative **Day picker** mockup is not part of this pass.

## Current state and constraints

- `AppShell.tsx` owns view selection, trips, item creation, and the inspector. The mobile implementation now hides its sidebar until the trip header or More opens it and removes the 620px minimum height below 640px.
- `CalendarView.tsx` owns Month, Week, and Day modes. Day uses `DayJourneyView.tsx`, which already scrolls continuously through trip dates and switches between itinerary and day map below `md`.
- Month now has a mobile agenda while the existing grid remains on larger screens. Week retains its contained horizontal timeline.
- `ObjectInspectorPanel.tsx` now has a full-width mobile surface; its desktop panel remains. Expense records and planned item costs are separate; the mobile UI must preserve that distinction.
- A phone test exposed a stuck initial trip spinner. `useTripData.ts` now gives trip and itinerary requests a 30-second timeout and a visible retry action, so a stalled request has a recoverable state. Starting the dev server with `npm run dev -- --hostname 10.57.136.79` resolved the phone loading failure on this network.
- Persistent UI test source: trip **Codex Mobile UI QA**, ID `7dd7f36f-351c-4981-b4af-1efb499d8fa5`, in the existing `travelplanner` database. Keep this trip and its baseline records; the user explicitly asked that the data source not be deleted afterward. The unrelated `MacOS Test Trip` was left untouched.
- Persistent empty-state UI test source: trip **Codex Mobile UI Empty QA**, created 2026-09-30 with dates 2026-09-30–2026-10-01, `Asia/Singapore`, and default currency SGD. It has no itinerary items or actual expenses. Keep it; it is intentionally retained for empty-state and trip-switch checks.
- The QA trip contains 12 itinerary items: fixed-time mapped arrival, flexible mapped food stop, fixed-time mapped attraction, a multi-day all-day hotel, an overnight timed item, a 93-character title with long notes, an unscheduled idea with a Maps URL but no coordinates, the `Touch reorder A`/`Touch reorder B` pair, `QA form creation — retained on Dec 3` (13:00–13:30), `QA exact-gap insertion — retained` (inserted between A and B at `dayOrder` 1), and `QA mobile fields — retained on Dec 3` (14:00–14:45, Kyoto Station test counter, Maps URL without coordinates, note, `mobile-persistence` tag, and SGD 36.50 planned estimate). It has 4 actual expenses: two linked JPY records, one unlinked USD record, and `QA expense form entry — retained` (SGD 13.25, linked to the UI-created item). Item cost estimates remain separate from actual expenses (the hotel estimate is SGD while its JPY expense is 72,000).
- At planning time, `DayJourneyView.tsx`, `lib/schedule-order-service.ts`, `lib/schedule-order.ts`, and `tests/schedule-order.test.mjs` have unrelated uncommitted edits. Recheck `git status` and their diffs before each pass; preserve and coordinate with that work.
- Read `AGENTS.md`, the applicable `docs/decisions/` records, and the relevant `node_modules/next/dist/docs/` guide before editing Next.js code. Do not use `docs/README.md` as a current implementation specification.

## Screen and navigation contract

Bottom navigation since Pass 6 (2026-10-21): Trip, Places, Spend, More.

| Mobile destination | Existing state or view | Expected behavior |
| --- | --- | --- |
| Trip | `activeTab: "calendar"`, `calendarMode: "day"` | Continuous compact itinerary with day pills; the header map icon switches to the Day map. During the trip it opens on today and marks now/next with leave-by. Floating + adds an event, note, or expense; long-press a row for insert/move/open. |
| Places | `activeTab: "map"` | Whole-trip map filling the screen, compact day filters, and a "without location" chip. Distinct from the Day map. |
| Spend | `activeTab: "expenses"` | Existing actual-expense view. |
| More → Calendar | `activeTab: "calendar"`, `calendarMode: "week"` (Month renders as week on phones) | `PhoneWeek`: compressed Monday-start week with all-day lane, fitted hour grid, and "Add on <date>". |
| More → Ideas | `activeTab: "calendar"`, `calendarMode: "day"` with the Ideas panel open | Unscheduled ideas with search and Create idea. |
| More | `days`, `kanban`, `table`, plus trip actions | Opens a mobile menu. A selected workspace remains indicated when the menu closes. |

The trip header opens the existing trip switch/create/edit actions. More also exposes import, ICS export, theme, and delete through their existing components. Do not duplicate trip or item business logic. Use the current `activeTab` and `calendarMode` store fields; derive mobile navigation selection from them. Keep desktop keyboard shortcuts and sidebar behavior.

## Agent work sequence

Complete these passes in order. One agent should own a pass and update this document before handing it off. Passes 1–3 touch `AppShell.tsx` or Day state, so avoid simultaneous edits there. Each agent should check the working tree, inspect the prior diff, and commit or hand off only its own changes.

### Pass 1 — Mobile shell and navigation

- [x] Add a mobile-only trip header, bottom navigation, trip menu, and More menu in `components/layout/AppShell.tsx` (extract a shared component only if desktop and mobile truly reuse its behavior).
- [x] Hide the desktop sidebar below 640px; remove the mobile 620px minimum-height constraint and account for safe-area insets and short viewports.
- [x] Check the mobile layout while the on-screen keyboard is open; the user confirmed the keyboard works on their phone.
- [x] Map Day, Calendar, Places, Spend, and More exactly as above. Make active state, labels, focus order, menu dismissal, and touch targets clear. Preserve the active trip and selected item when switching views where existing behavior does so.
- [x] Verify one-trip, light/dark, and desktop states.
- [x] Verify empty-trip and trip-switch states. Pass 1 is complete when all six views and all trip actions remain reachable at 320px without the permanent sidebar.

### Pass 2 — Continuous Day experience

- [x] Update `components/views/DayJourneyView.tsx` and only the needed Calendar wrapper layout to match the mockup's day heading, readable cards, Add action, and local Itinerary/Day map control.
- [x] Derive the heading from the active trip date and trip timezone. Keep the existing continuous scroll and active-day/map synchronization; do not introduce a separate selected-day store.
- [x] Reuse current schedule labels and ordering helpers. Confirmed times show their time; flexible items show **Flexible** and never imply a booking time. All-day spans and empty dates remain visible and correct.
- [x] Keep map selection returning to the matching card, visible OpenStreetMap attribution, and honest handling of saved Maps URLs without coordinates.
- [x] Browser-check scroll, select, map switch, and map-to-card selection at 320px and 390px. If touch dragging interferes with scrolling, adjust activation/handles without rewriting `dayOrder` rules.
- [x] Check item creation and reload persistence on the persistent QA trip; retain the trip and its baseline records.
- [x] Check exact-gap insertion on the persistent QA trip. The UI inserted and retained an item at position 2 between the two reorder fixtures; API readback showed dayOrder 0/1/2.

### Pass 3 — Item inspection and creation

- [x] Make the selected `ObjectInspectorPanel` a full-width mobile surface with a visible close action, safe-area padding, and a scrollable content area. Preserve the desktop side panel.
- [x] In the desktop preview, Add on the empty Dec 3 date created an item and opened its inspector using the existing flow. Check the same interaction at a phone width and keep the separate path for an unscheduled idea.
- [x] Check focus on open/close and Escape/back behavior.
- [x] In a 320px-wide browser phone viewport, verify the dark-theme inspector and its Type popover. Escape dismissed the popover; the labeled Close control returned focus to the selected item.
- [ ] Verify the remaining dialogs in a dark-theme phone viewport.
- [x] Verify editing with a real phone's on-screen keyboard; the user confirmed it works.
- [x] Verify date, time, location, Maps URL, notes, tag, and SGD 36.50 planned cost on `QA mobile fields — retained on Dec 3` after autosave and reload. Keep this QA record.
- [x] Verify the item delete confirmation, initial focus, safe Cancel/Enter dismissal, and focus restoration while preserving retained fixture data.
- [ ] Verify a successful item deletion only against a separately authorized disposable record; no retained fixture data has been deleted.

### Pass 4 — Remaining mobile views

- [x] In `CalendarView.tsx`, provide a readable mobile Month date/agenda presentation with tap-to-open and tap-to-add. Retain the existing Month grid on larger screens and keep Week accessible; any intentionally horizontal Week scrolling must be obvious and contained.
- [x] Check `MapView.tsx` controls and attribution, and `ExpensesView.tsx` forms, per-currency totals, empty list, and filters at 320px. Planned costs stay separate from actual spending.
- [x] Confirm Kanban, the existing Itinerary board, and Table are reachable from More and fit at 320px; Table scrolls within its own container.
- [x] Audit touch alternatives for actions that were previously available only on hover or double-click. Header-image controls remain visible on touch, Calendar Week exposes visible resize handles and a single-tap empty-day Add action, and trip/import/export/theme actions in the mobile menu have 44px targets.
- [x] At 320px, inspect the long-title item in Day, the populated Kanban board, and the inspector in a 400px-short viewport. Page width stayed contained; only Kanban's own track scrolls horizontally.
- [x] Check empty states across Day, Calendar, Places, Spend, Kanban, Itinerary, and Table at a 320x400 browser viewport; switch from the empty trip to the populated QA trip and back while confirming 0/0 and 12/12 table counts.
- [x] Give failed expense loads a distinct alert and retry action; keep planned costs visible and suppress “No expenses recorded yet” until the expense request succeeds.
- [ ] Simulate an expense-request failure and verify the retry path in the browser and on a phone.
- [ ] Check loading and error states across the remaining views, then repeat on a real phone where available.

### Pass 5 — Integration and completion

- [ ] Browser-test 320px, 390px, tablet, and desktop widths in light and dark modes. Cover trip switch; Day/Calendar/Places/Spend/More; add/edit/delete; map marker selection; Month/Week/Day changes; expense entry; and touch reorder where available.
- [x] Check page-width containment for the 320px Kanban and inspector states. Kanban scrolling stays in its own track; the inspector's 44x44 Close control stays visible while its fields scroll within the panel. Keyboard activation and Escape dismissal restore focus.
- [x] Verify real-phone touch reorder; the user confirmed it works.
- [x] Verify real-phone on-screen keyboard behavior; the user confirmed it works.
- [ ] Verify remaining forms and menus against real phone touch behavior.
- [x] Run `npm run check` after the latest code changes; lint, typecheck, and all 61 tests passed.
- [ ] Run `npx next build --webpack` after the live development server is stopped; its shared `.next` output is in use.
- [ ] Add behavioral tests where a practical seam exists, especially if navigation mapping or reorder behavior changes. Report only checks actually run.
- [ ] Update this file with findings, exact verification, remaining limitations, and final status. Add an ADR only if implementation requires a durable new decision; update `docs/architecture.md` only for an architectural change.

### Pass 6 — Compact trip-use layout (planned 2026-10-20)

**Why:** On a phone the app is used to follow an already-made plan, not to plan. At 390x844 the Day view spends ~290px on chrome before the first item (trip header, "Day itinerary · Ideas · Add idea" bar, Itinerary/Map tabs, day heading, Add event/Add note row); each card is ~170px with an Add row between cards, so only ~3 stops fit. Target: ~88px of chrome and ~9 stops visible. The before/after mockup was shown in the planning conversation (2026-10-20). All changes apply below 640px only; desktop is unchanged. No API, schema, or persisted-format changes.

**Decisions (user, 2026-10-20):** Today merges into a single **Trip** tab. Reorder and exact-position insert move behind long-press. Mobile Calendar becomes a compressed Week view only (no Month); its layout follows a reference image the user will supply.

Header and day navigation (`AppShell.tsx`, `CalendarView.tsx`, `plan/DayStrip.tsx`):

- [ ] Mobile header is one 44px row: trip name + chevron (opens the existing trip menu), Day-map toggle, Search. Remove the date range and the compact-rows toggle; compact density is the mobile default.
- [ ] Add a sticky, horizontally scrolling day-pill strip ("1 Sun 29") under the header, reusing `DayStrip`. Tapping a pill scrolls the continuous list; scrolling updates the active pill. Derive the active day from the existing scroll/active-day logic — no new selected-day store.
- [ ] Hide the "Day itinerary / Ideas / Add idea" bar and the Itinerary/Map tabs on mobile. The header map toggle switches the Day map in place; Ideas move to More.
- [ ] Replace the per-day heading with a small sticky label ("Sun 29 Nov · 6 stops"). Empty days keep a visible label and an Add action.

Item rows (`DayJourneyView.tsx`):

- [ ] Single compact row (~52px, 44px minimum touch target): time (13px mono), type-colour dot, title (one line, ellipsis), one muted meta line (type or place · cost or duration), navigate icon on the right. Drop stop numbers, drag handles, and the "Maps" text link from the default row.
- [ ] Flexible items show their `placementTime` as an approximate muted label (e.g. "~16") and never as a confirmed time. All-day and multi-day items stay correct.
- [ ] "No location" becomes an inline warning in the meta line, not its own line.
- [ ] Remove the between-item "Add event / Add note" rows. A floating + adds an event or note to the day in view (menu); long-press a row for Insert above/below, Move up/down, and Reorder mode. Touch reorder must keep current `dayOrder` behavior (see invariants).

Trip tab replaces Today (`AppShell.tsx`, `TodayView.tsx`, `DayJourneyView.tsx`):

- [ ] Bottom navigation becomes four tabs: **Trip**, **Places**, **Spend**, **More**. Remove the separate Today destination and `todayMode` switching once Trip covers it.
- [ ] While the trip is in progress, Trip opens scrolled to today, marks the current or next item ("now"/"next") with its leave-by time from the existing Today logic, and keeps tonight's stay visible as its row. Move Today's quick actions (add note, add expense) into the + menu. Outside the trip, Trip opens at day 1 (or the last viewed day).
- [x] `TodayView.tsx` deleted (user decision 2026-10-21); now/next and leave-by live in `components/views/useTodayMark.ts`.

Calendar (`CalendarView.tsx`, `calendar/WeekPlanner.tsx`):

Mobile Calendar is a compressed seven-day week only; Month is not shown on mobile. Reachable from More. Reference: `docs/design/mobile/week-reference.png` (a phone calendar's week view, supplied by the user 2026-10-20).

- [ ] Header: month name centred, Search, and a Today button showing today's date number. No Month/Week/Day switcher on mobile.
- [ ] Day header row: seven columns (weekday letter over date), no horizontal scroll at 320px. The selected day has an outline; today is marked. Swipe left/right changes week. Tapping a date selects it.
- [ ] All-day lane under the dates: the trip as a full-width bar, then all-day/multi-day items and day notes as bars spanning their dates, truncated to one line each. Cap the lane height (e.g. three lanes) with a "+N" overflow.
- [ ] Time grid: narrow hour gutter, hour lines, and half-hour dotted lines. Fit the trip's used hour range to the screen height instead of a fixed 24h scroll; keep it scrollable when the range doesn't fit. Timed items are blocks at their start/end with wrapped titles; overlapping items share the column.
- [ ] Flexible items must look different from confirmed times (e.g. muted or dashed outline at `placementTime`), so the week never presents them as bookings.
- [ ] Floating "Add on <selected date> +" pill creates an item on the selected day via the existing create flow. Tapping a block opens the inspector. Reuse `WeekPlanner.tsx` layout logic where possible; desktop Week is unchanged.

Places (`MapView.tsx`):

- [ ] Remove the help paragraph on mobile, use the same pill strip for day filters, and let the map fill the remaining height. Keep OpenStreetMap attribution and the "N items have no location" count (as a small chip).

More menu:

- [ ] Add Calendar (week) and Ideas; keep Kanban, Itinerary, Table, and trip actions.

Verification:

- [ ] At 320x568 and 390x844 in light and dark: chrome height above the first item ≤ ~100px at 390px; no horizontal page overflow; every action from the previous mobile layout is still reachable (add, insert at position, reorder, ideas, calendar, map).
- [ ] On `Codex Mobile UI QA`: flexible/all-day/overnight/long-title rows render correctly; long-press insert and reorder preserve `dayOrder` (API readback); Trip tab "now/next" with a trip date covering today (use the empty QA trip's dates or a temporary date override, not the user's trips).
- [ ] Real-phone check of long-press vs scroll conflict and the + menu.
- [ ] `npm run check`; add tests if a mobile navigation-mapping or row-label helper is extracted.

## Invariants and acceptance

- Persisted/API schedule fields remain `date`, `endDate`, `startTime`, `endTime`, `placementTime`, and `dayOrder`. Mobile presentation must not turn `placementTime` into a confirmed time or reorder items differently from Calendar/Itinerary.
- The same trip data, item save queue, selection, map component, and expense records serve mobile and desktop. No mobile-only copy of persisted state.
- Every current workspace and trip action remains reachable; desktop behavior remains intact.
- The first usable milestone is Pass 1 plus Pass 2. Do not mark the project complete until Passes 3–5 pass their checks.

**Findings:** The current Day view supplies the main mobile interaction already. The largest gaps are the permanent mobile sidebar, crowded Calendar chrome, and narrow inspector. Keeping the continuous Day view avoids a second date-navigation model.

**Verification so far:** `npm run check` passed after the latest inspector target-size changes (lint: 0 errors and 6 `<img>` warnings; typecheck passed; 61 tests passed), and `git diff --check` passed. `npx next build --webpack` passed after the prior mobile changes; it has not been rerun while the restarted development server is active. At 390px the Day card opens and closes the full-width inspector with focus restored; the Day map fits saved coordinates and selecting a marker returns to its card. At 320px the More sheet exposes all workspaces and trip actions and scrolls in a short viewport. It traps keyboard focus, closes with Escape, restores focus to More, and keeps page width at 320px. Browser checks confirmed 44px targets for Day map/itinerary switches, Add gaps, reorder handles, Calendar controls, menu rows, and trip rows. Day, Calendar, Places, Spend, and More navigation were checked at 320px; each showed the expected selected state. Places loaded with OpenStreetMap attribution and day filters. Spend showed the actual expense list, category/currency/sort filters, separate planned totals, and the Add expense fields. Kanban, Itinerary, and Table were inspected at 320px. Table's page width stayed 320px while its table scrolls internally. Kanban controls now wrap, and Itinerary exposes 44px Add targets and a single-tap empty-day action. The mobile touch audit changed the inspector image URL/remove controls to stay visible on touch, made the empty Calendar Week day tap-to-add, exposed Week resize handles on touch, and enlarged the inspector's remove, currency, tag, and attachment controls for phone use. Import/export/theme and trip create/edit/delete controls now use 44px targets in the mobile menu. Tablet (768px), desktop (1280px), and dark mobile views were also inspected. The Day map initially failed to fit in development because Leaflet effect cleanup retained the previous fit key; `LeafletMap.tsx` now resets its lifecycle refs on cleanup and avoids an animated fly-to before it has a measured size. The retest had no new map error. In the restarted LAN preview, a tap opened a flexible-ideas cluster and its Close button dismissed it; this exposed and fixed a focus-plus-click double-toggle that had canceled the first tap. A read-only pass over the original trip confirmed empty Day sections show their Add action, long Japanese item titles render, inspector fields/actions load, and attachment loading resolves without an error. The original trip's Expenses view showed no actual expenses and its existing SGD planned total, then switched back to the QA trip successfully. Reloading the QA trip showed all 11 baseline saved items and the Ideas count. Through the UI, Add on empty Dec 3 created an item and opened the inspector; after editing its time and leaving the field, the API retained 13:00–13:30 across reload. Add at exact position 2 on Dec 2 inserted and named `QA exact-gap insertion — retained` between A and B; API readback preserved A/B order around it at dayOrder 0/1/2. The expense form created a linked SGD 12.75 food expense; editing it through the UI to SGD 13.25 updated the currency total. The QA Expenses view showed 4 actual expenses grouped as JPY 72,500, SGD 13.25, and USD 18.50, while planned item costs remained separately grouped as JPY 17,700 and SGD 680 before the mobile cost-field test below. The pointer drag test moved reorder B above A, then moved A back above B; API readback confirmed their original order and flexible placement times were restored. This was a desktop-width pointer test, not a phone touch test. The user's original trip was not edited.

**Phone loading finding (2026-09-29):** At `http://10.57.136.79:3000`, the phone initially showed “Choose trip” and a spinner, and tapping the trip control had no effect. The same phone could open `/api/trips` directly and see JSON; the MacBook received HTTP 200 from both trip and itinerary APIs through that LAN address. The server-rendered page loaded but its client interactions did not start. Restarting the dev server with `npm run dev -- --hostname 10.57.136.79` and reloading the phone page fixed it, as confirmed by the user; the mobile view also loaded through that address in browser verification. This is consistent with Next.js development origin/host handling. The IP is specific to the current Wi-Fi network and may change. `npm run check` and `git diff --check` passed after the timeout/retry change; production build was not rerun while the user's dev server was running.

**Inspector close visibility (2026-09-29):** The user's phone screenshot showed the Next.js development indicator covering the inspector's top-right close icon. The inspector now uses a labeled **Close** control at the leading edge on mobile, while keeping its close icon on the trailing edge on desktop. `next.config.ts` places the Next.js development indicator at the lower left for future dev-server starts. At both 320px and 390px, the Close label remained clear with the current indicator still at the top right; tapping it dismissed the inspector. The current dev server still showed the indicator at the top right after editing `next.config.ts`; restart the dev server for that configuration to take effect. `npm run check` passed (61 tests, typecheck passed, lint had 0 errors and 6 existing `<img>` warnings); `git diff --check` passed.

**Short mobile dialogs (2026-09-29):** Create, edit, delete-trip, and item-confirmation portals now align to the top on narrow screens, scroll within the overlay, and cap their panel height using `100dvh`; trip dialog action buttons have 44px mobile targets. On the 320px-wide, 400px-high preview, the Create and Edit trip panels scrolled to expose their lower fields and actions. Both were dismissed without submitting; no trip or itinerary data changed. The preview cannot show a real phone's software keyboard, so the actual keyboard-open check remains outstanding. The final `npm run check` passed (61 tests; typecheck passed; lint had 0 errors and 6 `<img>` warnings), and `git diff --check` passed.

**Phone-width browser continuation (2026-09-29):** With browser viewport overrides at 390x844, 320x568, and 320x400, the mobile More sheet opened and closed with Escape, restoring focus; keyboard activation opened Day. The Day itinerary showed its five dates and the long-title fixture. At 320px, the long-title item inspector opened with its labeled Close control; Enter closed it and focus returned to the selected item. In dark theme, the inspector's Type menu opened with the expected category list and Escape dismissed it. The theme was returned to light and the viewport was restored to normal after testing. At 320x568, document width remained 320px; the only horizontal overflow was the contained Kanban track (1994px scroll width). At 320x400, the inspector Close target measured 44x44 at the top, the page had no horizontal overflow, and the inspector fields scrolled inside a 291px panel with 1420px of content. These checks used browser viewport emulation, not a physical phone. The checks themselves did not edit existing fixture rows; a separate retained item was added later as described below. The real software keyboard, phone touch reorder, loading/empty/error states, and remaining short-screen forms still need device verification.

**Mobile cost-field persistence (2026-09-29):** At 390px, entering `36.50` in the numeric planned-cost field appeared to work but was lost when another control triggered a React rerender. `ObjectInspectorPanel.tsx` normalized number input by assigning `target.value` even when the text was already valid and unchanged, which prevented React's controlled input from receiving the change. The input capture handler now writes back only when sanitization changes the text. Filled `36.50` in the phone-width preview, opened the Type picker to force a rerender, waited for autosave, then reloaded. The item retained `SGD 36.50`, the other edited fields (date, time, place, Maps URL, note, and tag) persisted, and the card displayed `SGD 36.5`. This created and retained `QA mobile fields — retained on Dec 3`; no rows were deleted. The Expenses view continued to show actual totals of JPY 72,500, SGD 13.25, and USD 18.50, separately from planned totals of JPY 17,700 and SGD 716.50. `npm run check` passed after the fix (61 tests; typecheck passed; lint had 0 errors and 6 `<img>` warnings); `git diff --check` passed, and the untracked implementation note has no trailing whitespace.

**Short-screen expense forms (2026-09-30):** At a 320x400 browser viewport, **Add expense** inserted its form below the visible area of the nested scroll container, so tapping the button looked like a no-op. `ExpensesView.tsx` now scrolls the first field into view when a create or edit form opens on phone widths. At 320x400 the create and edit forms opened with the first field visible; the page stayed 320px wide. Add, Cancel, Save, the form controls, filters, and expense row actions now have 44px minimum targets. I canceled both the blank create draft and the edit draft; the edit draft displayed its retained description, date, amount, currency, category, and linked itinerary item. The four saved expenses and currency totals were unchanged. `npm run check` passed after these changes (61 tests; typecheck passed; lint had 0 errors and 6 `<img>` warnings), and `git diff --check` passed. Browser viewport emulation does not simulate the phone software keyboard or physical touch.

**Trip loading and empty expense state (2026-09-30):** A fresh browser tab initially showed the trip-loading indicator, then resolved to the saved trips and QA Expenses view. At 320px, switched read-only to `MacOS Test Trip`: the actual-expense summary and entries showed the empty state, while planned item costs remained separately listed as SGD 4,040.91; page width stayed at 320px. Switched back to `Codex Mobile UI QA` and confirmed its four expenses and saved totals. Neither trip's records were changed. Trip loading and empty expenses are checked; error states and the Expenses loading indicator still need coverage.

**Empty-trip mobile views and trip switching (2026-09-30):** Created and retained `Codex Mobile UI Empty QA` with a two-day date range, `Asia/Singapore`, and SGD default currency; it has 0 itinerary items and 0 expenses. At 320x400, Day showed both empty dates with Add actions, Calendar showed its no-plans agenda and Add action, Places showed 0/0 mapped items and its no-locations guidance, Spend showed no expenses and no planned costs, Kanban showed empty columns, Itinerary showed both days with Add actions, and Table showed 0/0 items with a contained, readable empty message. Switched from the empty trip to `Codex Mobile UI QA` and confirmed 12/12 items and existing totals; switched back and confirmed 0/0. All six bottom-navigation destinations and the More sheet remained reachable. No fixture rows were edited or deleted. Error-state and true phone interaction checks remain open.

**Real-phone confirmation (2026-09-30):** The user confirmed the on-screen keyboard and itinerary reordering both work on their phone. This closes the real-device keyboard and reorder checks. Remaining form/menu touch checks and request error states are still open. A follow-up `npm run check` passed: lint had 0 errors and 6 existing `<img>` warnings, typecheck passed, and all 61 tests passed.

**Expense load failure recovery (2026-09-30):** A failed expense request now has a separate alert with **Retry loading expenses**. It keeps planned item-cost totals visible, hides the expense list and category summary, and disables adding an expense until the records load, so a failed request cannot be mistaken for an empty trip. The retained QA trip's success state was rechecked in the live browser: all four expenses and the JPY/SGD/USD actual totals and separate JPY/SGD planned totals remain visible. A controlled failed-request browser check has not been run because the shared dev server and database are in use. `npm run check` passed after the change (61 tests, typecheck passed, lint had 0 errors and 6 existing `<img>` warnings).

**Portal theme and keyboard focus (2026-09-29):** `AppShell` now applies the active theme class and native color scheme to the document root, so dialogs rendered under `document.body` inherit dark-mode variables and selectors. The shared modal focus hook moves focus into trip create/edit/delete and item-confirmation dialogs, traps Tab, and restores the opener on dismissal; trip settings now also dismisses on Escape. In the live preview, trip-settings focus moved from its opener to Close and into the form with Tab; Escape closed it and restored focus. Create-trip opened and dismissed with Escape, returning focus to New trip. The trip-delete prompt opened with Cancel focused and dismissed with Escape. I also opened the item confirmation from a selected itinerary card, verified Cancel received focus, and pressed Enter to cancel safely without deleting the item. No saved trip data changed. `npm run check` passed (61 tests; typecheck passed; lint had 0 errors and 6 `<img>` warnings), and `git diff --check` passed. The dark-theme phone-width inspector and Type-menu checks are now covered by the continuation entry below; actual software-keyboard behavior remains unverified.

**Remaining work / next step:** continue with the retained `Codex Mobile UI QA` trip. The UI-created items, expense, and exact-gap item are part of the retained fixture. Cover request error states; check the remaining forms and menus on a real phone; and resolve any short-screen issues surfaced during device testing. Successful item deletion remains untested because both retained QA trips and their records are being preserved. Loading successfully resolved in the current browser session. Rerun `npx next build --webpack` when the live development server is stopped so the production build does not conflict with its `.next` output. Keep Passes 1–5 open until these remaining checks pass. No Docker build or push is needed for this UI pass.
