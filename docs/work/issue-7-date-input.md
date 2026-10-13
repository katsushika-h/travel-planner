# Issue 7: Item date field keyboard entry

**Status:** Implementation complete; ready for PR review.

**Goal:** Start day → month → year → end day with Tab. Save each valid segment edit on leaving it; Enter saves and leaves the field. Default blank years to the current year.

**Scope:** Replace the inspector's two native date controls with one small DateFields component used for Start and End. Keep canonical date strings, range rules, and the existing save queue. No dependencies, API, or schema changes.

## Checklist

- [x] Read issue #7 (no comments), inspect clean working tree, and branch from updated origin/main.
- [x] Provide separately labeled numeric day/month/year fields in DOM order.
- [x] Commit valid dates on blur (including Tab), with immediate save requests; Enter blurs the active segment.
- [x] Default blank years to the current year in the trip timezone.
- [x] Validate calendar dates and end-date ordering without saving incomplete/invalid drafts.
- [x] Add regression tests and run npm run check and git diff --check.
- [x] Browser-check the actual inspector in an isolated in-memory preview at desktop and 320px widths.

**Findings:** Native date segments aren't individual DOM inputs. The inspector's desktop Tab handler deliberately advances between whole inputs, so it skips directly from Start to End. Independent segment inputs reuse that existing navigation and the mobile browser's natural Tab order.

**Current state:** Start and End use day/month/year text inputs with numeric keyboards, select-on-focus, accessible labels and validation errors. Valid edits commit on blur rather than each keystroke; incomplete dates remain drafts until complete. Year defaults when a date is empty or its year is cleared. External schedule changes synchronize draft values without remounting input elements. Starting after the end still advances the end to the new start; an end before the start remains unsaved. Both date callbacks request immediate persistence through the existing queue.

**Verification:** npm run check passed lint/type checking and all 71 tests, with six existing image warnings. Six component-handler regression tests cover ordered fields, per-segment commits, default year/padding, incomplete/invalid/leap dates, end-date bounds, Enter, and external changes. git diff --check passed. A temporary copy under /private/tmp rendered the actual inspector with in-memory updates and mocked attachment loading; no database was connected. Browser checks confirmed Tab moved through Start day/month/year to End day, each valid edit emitted immediate=true, Enter saved and removed field focus, and empty-date entry defaulted to 2026. At 320px the fields fit and Tab still advanced through them. The viewport was restored and the temporary tab closed. Production build and database persistence were not tested.

**Remaining work / next step:** Review and merge the PR. Verify persistence after reload against a disposable item if further database-backed QA is desired.
