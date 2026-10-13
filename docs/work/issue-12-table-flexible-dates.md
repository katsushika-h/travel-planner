# Issue #12: Table flexible dates

**Status:** Complete.

**Goal and scope:** Display and sort date-only items in Table without assigning confirmed times.

- [x] Sort canonical dates and times, including flexible items.
- [x] Use date inputs for dated flexible and all-day items.
- [x] Preserve date spans and flexible status on edits; retain timed editing and unscheduling.
- [x] Add component regression checks and run the canonical check.

**Findings:** The derived timestamp helper intentionally returns null for flexible items. Table now uses canonical date/time fields directly; other timestamp consumers retain their existing semantics.

**Verification:** Lint and typecheck passed; changed-file Prettier and `git diff --check` passed. `npm run check` stops at the unrelated, pre-existing untracked `.claude/launch.json` formatting warning. The full Node suite passed, including the Table regressions.

**Remaining work / next step:** Review and merge the PR. No schema or deployment changes.
