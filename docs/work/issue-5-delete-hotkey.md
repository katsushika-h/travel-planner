# Issue 5: Item deletion keyboard flow

**Status:** Implementation complete; ready for PR review.

**Goal:** With an item open, Delete opens a confirmation dialog; a second Delete confirms. Enter activates the initially focused Delete button, and Escape cancels.

**Scope:** Item inspector, selected-item deletion, shared confirmation dialog's opt-in deletion shortcut, and component-handler regression tests. No API or schema changes.

## Checklist

- [x] Read issue #5 (no comments), inspect clean working tree, and branch from updated origin/main independently of issue #4.
- [x] Route inspector keyboard and trash-button deletion through the selected-item confirmation flow.
- [x] Add opt-in Delete/Backspace confirmation and initial Delete-button focus for native Enter activation.
- [x] Preserve text editing, ignore held/modified keys, and disable confirmation/cancellation while deletion is pending.
- [x] Run component-handler regression tests, npm run check, and git diff --check.

**Findings:** AppShell ignores shortcuts while modal dialogs are open, including the mobile inspector. The inspector had no local deletion shortcut, and its trash button used a separate inline confirmation. ConfirmDialog only handled Escape and focused Cancel, so a second Delete did nothing and Enter canceled instead of confirming.

**Current state:** The inspector locally handles Delete/Backspace outside editable controls and requests confirmation for its current item. Its trash button requests the same dialog. Global selection shortcuts continue to support bulk deletion outside the inspector, with repeat and modifier guards. Only selected-item confirmation opts into Delete/Backspace confirmation and Delete-button focus; other confirmation dialogs retain their previous focus and keyboard behavior. Pending deletion disables buttons and keyboard actions. Existing bulk-delete handling retains failed items and reports failures.

**Verification:** npm run check passed lint/type checking and all 70 tests with six existing image warnings. Five new tests exercise actual inspector and confirmation component handlers using installed TypeScript transpilation and mocked React/browser bindings, covering opening confirmation, editable fields, repeats/modifiers, initial confirmation focus, Escape, pending state, and opt-in isolation. Narrow tests also passed after the final test-harness adjustment. git diff --check passed. Browser interaction, actual data deletion, and production build were not run.

**Remaining work / next step:** Review and merge the PR. Optional browser smoke check using a disposable item: open its inspector, move focus out of text inputs, press Delete, then press Delete again; repeat with Enter confirmation and Escape cancellation. Confirm Delete/Backspace in a text field edits text normally. Do not use retained QA records for deletion checks.
