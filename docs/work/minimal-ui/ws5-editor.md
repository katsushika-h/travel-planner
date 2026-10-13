# WS5 — Item editor, notes and dialogs

**Status:** Done, awaiting coordinator review · **Batch:** A
**Branch:** `claude/minimal-ui-ws5-editor` (from `claude/minimal-ui-rewrite`) · **Port:** 3105
**Reference:** `docs/design/minimal-ui/screenshots/item-editor-light.jpg`, and the docked editor in `table-dark-with-editor.jpg`. Source boards: `MinimalItem.dc.html`, `MinimalTableDark.dc.html`.
**Owns:** `components/inspector/*`, `components/notes/ItemNoteCard.tsx`, and the insides of `components/trip/CreateTripDialog.tsx`, `EditTripDialog.tsx`, `DeleteTripButton.tsx`, `ImportGoogleMapsCsvButton.tsx`, `ExportIcsButton.tsx` (keep their `menuItem` prop and trigger rendering from WS0; restyle the dialogs).

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens).

## Checklist

- [x] Editor layout: type dropdown with swatch, close button, large in-place title, then sections separated by dividers: When, Where, Cost and tags, Notes, Attachments; footer with "Saved" status and Delete item.
- [x] When: Fixed time / Flexible / All day / Unscheduled as plain-text options mapping exactly to the current schedule shapes; date, start, end fields (underlined inputs, Geist Mono for times). Keep `DateFields.tsx` keyboard behaviour (see `tests/date-fields.test.mjs`).
- [x] Where: place, Google Maps link, coordinate status ("Pinned · lat, lng" or "No location — paste a Maps link with coordinates"). A small map preview is optional; skip it if it costs too much.
- [x] Cost (amount + currency picker), tags, Markdown notes (restyle the MDX editor via the existing `.travel-markdown-editor` CSS hooks), attachments with drop zone.
- [x] Docked side panel on desktop, full-width surface on mobile (existing contract). The panel's placement wrapper lives in `AppShell.tsx` (coordinator); request placement changes rather than editing it.
- [x] Note cards and trip dialogs restyled with tokens.

## Parity items

- Create and edit all-day, fixed-time, flexible and multi-day items; schedule-mode switches keep valid shapes.
- Every field autosaves; Delete confirmation and the Delete hotkey (`tests/delete-hotkey.test.mjs`).
- Upload, list, download/preview and delete attachments.
- Trip create, edit and delete dialogs; CSV import entry point.

## Notes / Requests

**Intentional differences from the screenshots**

- No map preview in Where (optional in the spec). Coordinate status text is shown instead. The OSM attribution therefore does not appear in the editor, since no map is drawn there.
- No "11 min walk ... 4 min to spare" line: it needs the walking-routes work (WS7).
- Dates keep the three-field `DateFields` (DD / MM / YYYY) instead of one "Mon, Apr 5" text field, to keep its tested keyboard behaviour. Multi-day items get an "Ends" date next to "Starts" (fixed and all-day only); flexible shows Date plus Start (24h) only, and typing a start time makes it fixed (as before).
- Footer shows "Autosave on" rather than "Saved": the panel has no save-status prop, so a live "Saved" would be untrue.
- Header-image URL is kept (not in the mockup): preview and field at the top when set, "Add header image URL" field at the bottom of Attachments when not.
- Attachment rows use text "Download" and "Remove" links instead of icon buttons.
- Schedule modes replace the "All day" checkbox and the two trash buttons. Each mode writes the same shapes as before: Unscheduled `{date:null,isAllDay:false}`; All day `{date,endDate,startTime:null,endTime:null,placementTime:null,isAllDay:true}`; Flexible `{date,endDate,startTime:null,endTime:null,placementTime:(kept or "09:00"),isAllDay:false}`; Fixed `{date,endDate,startTime,endTime,placementTime:null,isAllDay:false}` (kept times, else start from placementTime or 09:00 and `oneHourEnd`). A missing date falls back to the trip start date. Time fields are not shown for All day or Unscheduled (saved times on an unscheduled item are kept and a hint says so).
- Trip dialogs: panel with a 1px ink top rule and underlined fields like `ConfirmDialog`; the rose icon tile in the delete dialog was removed. `ExportIcsButton` and `ImportGoogleMapsCsvButton` render no dialog of their own (button or menu item only), so they needed no change.
- `tests/delete-hotkey.test.mjs` mock got `@/lib/schedule-domain` (`scheduleKind`, `oneHourEnd`) because the panel now imports them; the assertions are unchanged.

**Requests for the coordinator**

- `AppShell.tsx` placement wrapper: on the Calendar tab the editor floats (`sm:absolute sm:inset-y-3 sm:right-3`); the panel has a left border and `bg-panel` but no shadow, so over the calendar it needs a shadow or border on the wrapper. Not checked on Calendar (WS2 owns that view).
- Optional: pass a save status (saving / saved / error) from the save queue to the panel so the footer can say "Saved".
- A `--scrim` token for dialog overlays: the trip dialogs use `bg-background/80` (token-only), while `ConfirmDialog` still uses `bg-black/40`. Pick one for consistency.
- `app/globals.css`: `.travel-markdown-editor.dark-theme` still hard-codes hex values (and the MDX link popups use them). The editor body is already themed via classes in `MarkdownEditorClient.tsx` (`p-0!`, `text-foreground!`), so only popups need tokens.
- `components/ui/button` hover for `ghost` is `bg-surface`; the editor close button uses the same.

## Verification log

Run on branch `claude/minimal-ui-ws5-editor`.

1. `npm run check`: pass. Lint 0 errors (6 warnings: the existing `<img>` warning in the editor header image and 5 elsewhere), `tsc` clean, Prettier clean, 94/94 tests including `date-fields` and `delete-hotkey`.
2. `npx next build --webpack`: succeeds.
3. Hard-coded colour grep over all owned files: prints nothing.
4. Screenshots (port 3105, Minimal UI QA, Table tab with the docked editor): light and dark at the pane width the browser pane allowed (about 1030px wide, the docked editor about 400px; the 1440px emulation was reset by the pane), and mobile 390px (dark) and 320px (dark). Compared with `item-editor-light.jpg` and `table-dark-with-editor.jpg`: same section order, divider rhythm, underlined fields, mono times, outlined tags with dashed "+ tag", dashed drop zone, footer. Differences listed above. Not captured at exactly 1440px, and 390px was only checked in dark.
5. Parity items in the browser: schedule-mode switches fixed to flexible to all day to unscheduled to fixed (each PATCH checked through the API: shapes as above); typing a start time on a flexible item makes it fixed with a one-hour end; title, tag add, type menu, currency; attachment upload (file input) and delete; delete confirmation opened from the editor and confirmed with the Delete key (item gone, API 404); existing multi-day all-day item shows Starts and Ends; Maps link without coordinates shows "No location - paste a Maps link with coordinates" and keeps the URL. Trip Edit dialog and Delete dialog (cancelled, real trip) opened in dark. Delete hotkey and DateFields keyboard behaviour covered by the unit tests. Test items were created through the API (`WS5 test ...`) and removed; the trip is back to its 21 baseline items. Create-trip dialog and CSV import were not exercised in the browser (same restyle as Edit; CSV unchanged).
6. Mobile contract: at 390px and 320px the editor is a full-screen surface, no horizontal overflow (`scrollWidth` equals viewport), 44px targets via `min-h-11`, safe-area padding kept, Tab trap and Escape logic untouched. Mode buttons fit on one row at 390px and wrap at 320px.
