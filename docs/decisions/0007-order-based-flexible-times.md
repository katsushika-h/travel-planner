# ADR 0007: Order-based flexible times

**Status:** Accepted (2026-10-14).

**Context:** A flexible item has no confirmed `startTime`, only a `placementTime`: a 15-minute visual position on the Week/Day time grid. Reordering a day changes `dayOrder` but not `placementTime`, so the saved list order and `placementTime` drift apart. Plan and Day already derived an approximate `~HH:MM` from same-day order (after the preceding fixed item), while Board printed `placementTime` directly, so the same item showed different times in different views.

**Decision:** Any text approximate time for a flexible item comes from the `dayOrder`-based derivation in `lib/schedule-domain.ts` (`flexibleDisplayTimes` per day, `tripFlexibleDisplayTimes` across a trip): the item's `placementTime` is a starting point, clamped so it never precedes the previous fixed item's end or the previous flexible item's time and never passes the next fixed item's start. A flexible item without a `placementTime` gets no derived time. `placementTime` only positions items on the Week/Day time grid and is never printed as text. When the derivation yields no time, views fall back to their plain wording ("Flexible" in Plan, "anytime" on Board). The editor's `placementTime` field and the persisted schema are unchanged.

**Consequences:** All views agree on the displayed time of a flexible item. The Week grid can still disagree with the order for flexible groups before any fixed anchor (`WeekPlanner.tsx`, which positions such groups from the first item's `placementTime`). A possible later follow-up is to sync `placementTime` when an item is reordered, which would make the derivation unnecessary.
