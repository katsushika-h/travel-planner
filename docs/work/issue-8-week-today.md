# Issue #8: Today in Week view

**Status:** Complete.

**Goal and scope:** Keep Week view active when Today is clicked and navigate to the current date in the trip timezone.

- [x] Set Week focus directly to today, including dates outside the trip.
- [x] Clear a previously expanded week day.
- [x] Preserve existing Month and Day itinerary navigation.
- [x] Check desktop/mobile handlers and in-trip/out-of-trip dates.

**Findings:** Today unconditionally switched to Day and bounded navigation to the trip. Week can display dates outside the trip, so it now uses direct week focus.

**Verification:** Lint, typecheck, the full Node suite, changed-file Prettier, and `git diff --check` passed. `npm run check` stops at the pre-existing untracked `.claude/launch.json` formatting warning; that file was left untouched.

**Remaining work / next step:** Review and merge the PR. No schema or deployment changes.
