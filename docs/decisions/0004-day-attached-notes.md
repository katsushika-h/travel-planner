# ADR 0004: Separate note objects with parent-derived placement

**Status:** Superseded by [ADR 0005](0005-independent-day-notes.md) (2026-10-01)

**Decision:** Store each Day-view note as an ItemNote linked to a required TravelObject. Notes have independent IDs, optional titles, plain-text bodies, and timestamps, but no schedule or dayOrder. Derive trip membership and visible placement from the parent. Display multiple notes by createdAt then ID. Render note cards only in Day view, outside event selection and dragging. Existing TravelObject.notes stays unchanged.

**Consequences:** Moving or unscheduling the parent retains its notes. Multi-day parents show the same note below every visible occurrence. Deleting a parent cascades to its notes; event deletion confirmation discloses this. Notes do not enter ordering APIs, other workspace views, map markers, expenses, or ICS export. No independent note reorder or parent reassignment is included.
