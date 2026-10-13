# Maps coordinate priority

Status: Complete

Goal: Resolve Google Maps links to their place pin when the same URL also contains a different map camera position.

Scope: Coordinate extraction in `/api/maps/resolve` and route regression tests. No database, public response shape, or dependency changes.

Checklist:
- [x] Prefer valid `!3d/!4d` place coordinates over `@` camera coordinates.
- [x] Prefer coordinate query/destination parameters over camera positions, independent of URL parameter order.
- [x] Retain camera-only, invalid-coordinate, short-link redirect, and coordinate-free URL behavior.
- [x] Run focused tests, canonical checks, and `git diff --check`.

Current state and findings: Place data is checked first, followed by `query`, `q`, `destination`, and `daddr`; camera coordinates remain a fallback. The existing approximate feature-ID fallback remains unchanged. The same resolver is used by inspector edits and Google Maps CSV imports.

Verification: Six new route tests pass with mocked Google fetch responses. `npm run check` passes on the PR branch with 79 tests and six existing image warnings. `git diff --check` passes.

Remaining work: None for this fix. Previously saved coordinates are not recalculated automatically.

Next step: Review and merge the PR, then re-resolve affected Maps links to update their saved coordinates.
