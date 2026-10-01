# Independent Day notes

**Status:** Complete and available locally.

**Goal:** Independent flexible note cards in Day, hidden from Week, with immediate gap insertion and inline title/body editing.

**Scope:** Shared TravelObject persistence and dayOrder; immutable note kind, noteBody, flexible-only validation. Complete Week ordering indices include hidden notes. Event counts, numbering, maps, other views and ICS exclude notes. Existing attached notes migrate without content loss. Event deletion does not delete independent notes.

## Checklist

- [x] Preserve existing mobile/order changes and read applicable framework guidance.
- [x] Implement note persistence, migration, validation and ordinary item CRUD.
- [x] Replace parent note loading/editor with immediate creation and inline fields.
- [x] Enable independent Day dragging and full-sequence Week drop indices.
- [x] Filter notes from other views, counts, maps and export.
- [x] Verify migration with disposable records in a rolled-back transaction, including conversion and independent deletion lifecycle.
- [x] Apply migration locally and regenerate Prisma client.
- [x] npm run check: 65 tests passed, typecheck passed, six existing image lint warnings.
- [x] Final API contract and targeted browser checks.
- [x] Isolated webpack production build.

## Verification and current state

- API contract passed: immediate blank note at specified gap, inline edits, flexible-only validation, independent moves/deletion, event deletion retains note.
- Browser passed: Add note inserts without a dialog and focuses title, direct editing saves on blur, reload preserves text, dragging before event works, empty-day creation works, Week renders no note card or extra count.
- npm run check passed (65 tests, typecheck, six pre-existing image warnings). Tests include hidden Week indices and fixed-event reorder preserving a flexible note slot.
- npx next build --webpack passed in /tmp/travel-notes-verification after synchronizing final source and removing obsolete attached-note files from that temporary copy.
- Migration conversion verified using disposable fixtures in a rolled-back transaction, then applied locally. IDs, text, timestamps and independent lifecycle are preserved.
- git diff --check passed. Disposable API/browser trips removed. Existing retained QA records preserved. Local dev server remains on port 3000.

Remaining optional regression coverage: Week pointer dragging around multiple hidden notes, cross-day browser dragging, injected inline-save failure, rapid trip switching, and real-phone touch testing. These are not claimed as verified. No Docker build or deployment performed.

Next step: use the implemented feature locally; deployment requires a separate request.

## Note field polish (2026-10-01)

Title/body fields are borderless in all states. Body height follows text and width via layout measurement and ResizeObserver; manual resize is disabled. Successful saves clear the status text. Delete appears only near its control on hover, with keyboard focus and touch access retained. Targeted ESLint, TypeScript, and diff checks passed. Browser computed styles confirmed zero border, resize:none, and body height matching scrollHeight on an existing note; retained note contents were not edited.

## Note limit and shared insertion controls (2026-10-01)

Note body input and server validation now cap text at 500 characters; boundary tests accept 500 and reject 501. Add event and Add note share one insertion bar, hidden until gap hover or keyboard focus, including empty-day insertion. Touch devices keep the controls visible. Browser verified maxlength=500 and a shared hidden action container that reveals with keyboard focus. npm run check passed (65 tests and typecheck; six existing lint warnings).
