# WS5 — Item editor, notes and dialogs

**Status:** Not started · **Batch:** A
**Branch:** `claude/minimal-ui-ws5-editor` (from `claude/minimal-ui-rewrite`) · **Port:** 3105
**Reference:** `docs/design/minimal-ui/screenshots/item-editor-light.jpg`, and the docked editor in `table-dark-with-editor.jpg`. Source boards: `MinimalItem.dc.html`, `MinimalTableDark.dc.html`.
**Owns:** `components/inspector/*`, `components/notes/ItemNoteCard.tsx`, and the insides of `components/trip/CreateTripDialog.tsx`, `EditTripDialog.tsx`, `DeleteTripButton.tsx`, `ImportGoogleMapsCsvButton.tsx`, `ExportIcsButton.tsx` (keep their `menuItem` prop and trigger rendering from WS0; restyle the dialogs).

Read first: `AGENTS.md`, [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, environment gotchas), [README.md](README.md) (done-checks), `docs/design/minimal-ui/README.md` (tokens).

## Checklist

- [ ] Editor layout: type dropdown with swatch, close button, large in-place title, then sections separated by dividers: When, Where, Cost and tags, Notes, Attachments; footer with "Saved" status and Delete item.
- [ ] When: Fixed time / Flexible / All day / Unscheduled as plain-text options mapping exactly to the current schedule shapes; date, start, end fields (underlined inputs, Geist Mono for times). Keep `DateFields.tsx` keyboard behaviour (see `tests/date-fields.test.mjs`).
- [ ] Where: place, Google Maps link, coordinate status ("Pinned · lat, lng" or "No location — paste a Maps link with coordinates"). A small map preview is optional; skip it if it costs too much.
- [ ] Cost (amount + currency picker), tags, Markdown notes (restyle the MDX editor via the existing `.travel-markdown-editor` CSS hooks), attachments with drop zone.
- [ ] Docked side panel on desktop, full-width surface on mobile (existing contract). The panel's placement wrapper lives in `AppShell.tsx` (coordinator); request placement changes rather than editing it.
- [ ] Note cards and trip dialogs restyled with tokens.

## Parity items

- Create and edit all-day, fixed-time, flexible and multi-day items; schedule-mode switches keep valid shapes.
- Every field autosaves; Delete confirmation and the Delete hotkey (`tests/delete-hotkey.test.mjs`).
- Upload, list, download/preview and delete attachments.
- Trip create, edit and delete dialogs; CSV import entry point.

## Notes / Requests

_(fill in)_

## Verification log

_(record each done-check and its result)_
