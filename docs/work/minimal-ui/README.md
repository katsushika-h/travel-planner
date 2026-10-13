# Minimal UI rewrite — workstream notes

One file per workstream. Each agent edits **only its own file** (checklist, Notes / Requests, Verification log). The coordinator owns [../minimal-ui-rewrite.md](../minimal-ui-rewrite.md) (rules, sequence, status) and merges workstreams.

| Workstream | File | Branch | Port | Batch |
| --- | --- | --- | --- | --- |
| WS0 Foundation | (done; see the main plan) | `claude/minimal-ui-ws0-foundation` | 3100 | merged |
| WS3 Board + Table | [ws3-board-table.md](ws3-board-table.md) | `claude/minimal-ui-ws3-board-table` | 3103 | A |
| WS4 Map + Spend | [ws4-map-spend.md](ws4-map-spend.md) | `claude/minimal-ui-ws4-map-spend` | 3104 | A |
| WS5 Item editor + dialogs | [ws5-editor.md](ws5-editor.md) | `claude/minimal-ui-ws5-editor` | 3105 | A |
| WS1 Plan view | [ws1-plan.md](ws1-plan.md) | `claude/minimal-ui-ws1-plan` | 3101 | B |
| WS2 Calendar | [ws2-calendar.md](ws2-calendar.md) | `claude/minimal-ui-ws2-calendar` | 3102 | B |

Reference screenshots for every canonical board are in [docs/design/minimal-ui/screenshots/](../../design/minimal-ui/screenshots/). Compare your running view against them in both themes.

## Done-checks every workstream must pass

The coordinator re-runs these before merging. Record the result of each in your Verification log.

1. `npm run check` passes (lint 0 errors, `tsc`, Prettier, all Node tests).
2. `npx next build --webpack` succeeds.
3. **No hard-coded colours in files you own.** This must print nothing (type colours via `typeColor()`/`typeTextColor()` and inline `style` from them are fine):

   ```bash
   grep -nE "(stone|neutral|emerald|rose|amber|orange|sky|slate|gray|zinc)-[0-9]{2,3}|bg-white|text-white|bg-black|#[0-9a-fA-F]{3,8}\b" <your owned files>
   ```

4. **Screenshots compared:** your view at 1440px in light and dark next to the matching reference screenshot, and at 390px. Note any intentional differences in Notes.
5. **Parity items** listed in your file, run in the browser in both themes.
6. **Mobile contract** in [../mobile-ui-implementation.md](../mobile-ui-implementation.md) still holds for your views at 320–390px.
7. **Milestone commits:** commit work in progress on your branch at each meaningful milestone (message prefix `WIP:` is fine), so a stopped agent leaves a clean restart point. Finish with a normal commit.
