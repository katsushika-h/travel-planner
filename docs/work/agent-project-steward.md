# Apply Agent Project Steward

**Status:** Complete (2026-09-23)

**Goal:** Make the repository's agent guidance concise, discoverable, and verifiable.

**Scope:** Documentation structure and npm validation scripts; no product behavior or deployment change.

**Checklist**

- [x] Inspect existing guidance, package commands, architecture, and working-tree changes.
- [x] Keep the root guide short and move occasional-use architecture detail to `docs/architecture.md`.
- [x] Record the established schedule-field decision in a concise ADR.
- [x] Expose one canonical lint/typecheck command.
- [x] Validate the new command and review the resulting diff.

**Current state:** Root guidance links to architecture, decision, and future work records. `npm run check` runs lint and type checking. No test runner exists in this project.

**Durable decision:** Documentation is added incrementally. Future substantial tasks should update one relevant `docs/work/` file instead of growing the root guide or repeating the historical handoff.

**Important finding:** `README.md` describes the original proof of concept and does not reflect every implemented feature; use current code and architecture notes for current behavior.

**Verification:** `npm run check` passed on 2026-09-23: type checking passed; lint had six existing `<img>` warnings and no errors. `git diff --check` passed. No build was run because this change does not affect app behavior.

**Remaining work:** None for this setup. Existing schedule-order review remains a separate product task.

**Next step:** Use this structure on the next substantial change; add a work record only when that change needs a handoff.
