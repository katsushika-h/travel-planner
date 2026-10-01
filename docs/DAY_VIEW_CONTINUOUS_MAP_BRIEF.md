# Day View: Continuous Trip Scroll with Active-Day Map

## Purpose

Redesign the Calendar **Day** view so that it is clearly differentiated from the Week planning view.

The Week view remains the workspace for assigning ideas to dates and arranging visit order. The Day view becomes a continuous trip-reading experience: the complete trip itinerary scrolls in a left column while a Leaflet map on the right follows the currently active day.

This document is an implementation brief. It is intended to be transferable into another development chat without requiring the original design discussion.

## Existing product context

- The app is a single-user travel planner built with Next.js, React, TypeScript, Tailwind CSS, Zustand, Prisma, and PostgreSQL.
- Calendar has Month, Week, and Day modes.
- Week currently uses a seven-day strip plus a focused compact agenda.
- Day currently uses the same focused agenda with more detailed cards.
- `date` assigns an item to a day.
- `dayOrder` is the canonical visit sequence within a day.
- `startTime` and `endTime` represent confirmed times only.
- Flexible items have a date and order but no confirmed time.
- Undated manually created and imported items are all shown in **Ideas**.
- Locations can contain names, addresses, Google Maps links, and coordinates.
- The existing Map view uses Leaflet and OpenStreetMap.
- Selecting an item opens the existing inspector as an overlay in Calendar views.

## Product roles

### Week view: planning

- Assign Ideas to dates.
- Compare how busy different days are.
- Reorder places within a selected day.
- Display compact agenda cards.

### Day view: reading and spatial context

- Scroll continuously through every date in the trip.
- Read each day's ordered itinerary in sequence.
- See the active day's locations on a synchronized map.
- Inspect practical information without using a 24-hour calendar grid.

## Recommended desktop layout

```text
┌──────────────────────────┬────────────────────────────────────────┐
│ CONTINUOUS ITINERARY     │ ACTIVE-DAY LEAFLET MAP                 │
│ approximately 35–40%     │ approximately 60–65%                   │
│                          │                                        │
│ # Sunday, November 29    │ Markers for Sunday, November 29        │
│  1. First place          │                                        │
│  travel leg              │       1       2                        │
│  2. Second place         │                  3                     │
│                          │                                        │
│ # Monday, November 30    │ Map changes when Monday becomes active │
│  ...                     │                                        │
└──────────────────────────┴────────────────────────────────────────┘
```

- The itinerary column should normally occupy 35–40% of the available Calendar width.
- The map should occupy the remaining 60–65%.
- The divider may be resizable later, but that is not required initially.
- The inspector must overlay the map rather than shrinking the itinerary column.

## Continuous itinerary behavior

### Trip-wide scroll

- Render every calendar date from the trip's start date through its end date.
- This is a continuous trip scroll, not an actually unbounded or generated infinite list.
- Preserve the scroll position when opening or closing the inspector.
- Preserve the scroll position when switching away from Day and returning during the same session when practical.

### Date sections

Each date is a separate semantic section with a sticky header.

Example:

```text
Day 3
# Tuesday, December 1
5 places · 2 fixed times
```

- The header should remain visible until the following date header replaces it.
- Include the trip day number, formatted date, item count, and fixed-time count.
- Empty dates must still be rendered.

Example empty state:

```text
# Friday, December 4
Nothing planned
[Add item] [Drop ideas here]
```

### Active-day detection

- Define a stable reading line near the top of the itinerary viewport.
- A date becomes active when its section header crosses that line.
- Do not switch the active day merely because a small portion of another section enters the viewport.
- Use `IntersectionObserver` where practical, with a deterministic fallback based on section positions.
- Update the active date without causing scroll jumps.

### Day navigation

- Keep the seven-day date strip in the Calendar header.
- Clicking a date scrolls its section into view.
- Previous/next navigation scrolls to the corresponding date section.
- When an inspector-selected item exists, entering Day view should scroll to its date and then to its card.
- The active date in the strip must follow the continuous itinerary scroll.

## Item ordering and cards

### Ordering rules

- All-day items appear at the beginning of their date section.
- Non-all-day items are ordered by `dayOrder`.
- Fixed-time items retain their actual `startTime` and `endTime` and act as visible chronological anchors.
- Flexible items retain an ordered position without being assigned an invented time.
- Displayed sequence numbers are derived from the rendered order and are not stored separately.

### Narrow Day card variant

Do not squeeze the existing wide detailed card into the itinerary column. Create a dedicated narrow detailed variant.

Always visible:

- Sequence number.
- Title.
- Fixed start/end time when present.
- Type.
- Location name.
- Drag handle or another clear reorder affordance.

Conditionally visible or expandable:

- Notes preview.
- Cost.
- Opening hours.
- Attachment indicator.
- Maps link.
- Small image thumbnail.

Avoid full-width image headers in the narrow column.

### Drag and drop

- Preserve gap-based reordering within each date.
- Dropping into a gap updates `dayOrder` transactionally.
- Dropping onto a date header appends the item to that date.
- Fixed-time items must retain their confirmed times when reordered.
- Moving an item between dates updates its date and reindexes both source and destination dates.

## Map behavior

### Scope

- The map displays only locatable items for the active date.
- Do not display markers from surrounding dates.
- Reuse the existing Leaflet and OpenStreetMap implementation and attribution rules.

### Markers

- Marker numbers must match itinerary sequence numbers.
- Use item type colors consistently between cards and markers.
- Marker popups should show at least title, type, location, and fixed time when applicable.
- Items without coordinates remain visible in the itinerary and show a clear “Location unavailable” state.

### Card and map synchronization

- Selecting or hovering a card highlights the matching marker.
- Selecting a marker scrolls the matching card into view and selects it.
- Opening an item through either surface opens the normal inspector.
- Selection must remain synchronized with the existing global selection model.

### Map viewport

- On the first activation of a date, fit all of that day's markers with comfortable padding.
- A one-marker day should use a sensible local zoom.
- A zero-marker day should retain a neutral regional view or show an empty-map message.
- Do not continuously recenter after the user manually pans or zooms.
- Once the user moves the map, expose a **Recenter day** action.
- Changing the active date may fit the new day's markers after a short debounce.
- Ensure Leaflet calls `invalidateSize()` after layout changes, inspector changes, or hidden-to-visible transitions.

## Travel legs

- Travel legs belong between consecutive non-all-day itinerary items.
- If no route timing has been calculated, show a truthful action such as **Open directions** rather than inventing a duration.
- Google Maps directions links can be generated from the two items' coordinates, place identifiers, names, or addresses.
- Automatic labels such as “24 min by car” or “11 min walk” require a routing provider.

Recommended future routing architecture:

1. Form route legs from adjacent items after sorting by `dayOrder`.
2. Send origin, destination, and travel mode to a configured routing provider.
3. Cache provider, mode, duration, distance, and calculation timestamp.
4. Invalidate or recalculate a leg when either location, the item order, or travel mode changes.
5. Preserve an external directions link as a fallback.

Do not silently add Google API billing. Provider selection is a separate product and deployment decision. Viable choices include Google Routes API, a self-hosted Valhalla/OSRM service, or manual travel estimates.

## Ideas behavior

- Ideas includes every item with `date === null`, regardless of whether it was imported or manually created.
- Do not permanently allocate a third column to Ideas in Day view.
- Open Ideas as an overlay using the existing Ideas button or Space shortcut.
- Permit dragging an Idea onto a date header to append it.
- Permit dragging an Idea into a specific gap to assign both its date and `dayOrder`.
- Dropping a scheduled item back into Ideas removes its date and order.

## Inspector behavior

- The inspector overlays the map from the right.
- It must not resize or compress the itinerary column.
- Opening and closing the inspector must preserve itinerary scroll position and map state.
- When switching to Day with an inspector-selected item, focus its date and scroll its card into view.

## Responsive behavior

### Desktop

- Side-by-side itinerary and map.
- Inspector overlays the map.

### Tablet

- Prefer a roughly 45/55 split if both surfaces remain usable.
- Ideas remains an overlay.

### Narrow/mobile

- Stack or tab the two surfaces rather than squeezing them side by side.
- The itinerary is the default visible surface.
- Provide a clear Map toggle that preserves the active date and selected item.
- Keep date headers sticky.

## Performance

- Render the complete trip normally for typical trips.
- Avoid virtualization initially because it complicates sticky headers, drag and drop, marker-to-card scrolling, and measurement.
- Consider windowing only when trips exceed approximately 30 days or several hundred items.
- Memoize per-day item grouping and marker data.
- Debounce active-day map fitting during rapid scrolling.

## Accessibility

- Date sections use semantic headings.
- The active date change should not steal keyboard focus.
- Marker actions need accessible item names.
- Every itinerary card must remain keyboard selectable.
- Drag-and-drop actions should have keyboard-accessible alternatives where supported by the existing system.
- Do not rely on marker color alone; pair color with sequence numbers and text.

## Relationship to the global Map view

The Day map is contextual and synchronized with the itinerary. The existing Map workspace remains the trip-wide geographic overview with broader filters.

- Day map: one active date, ordered markers, itinerary synchronization.
- Global Map view: whole-trip exploration and cross-day filtering.

These views should reuse shared marker, popup, bounds, and attribution utilities rather than duplicate Leaflet logic.

## Naming

The view may remain named **Day** because one date is always active even though surrounding dates remain scrollable. Renaming it to **Journey** or **Trip** is optional and should be treated as a separate navigation decision.

## Out of scope for the first implementation

- Adding a paid routing API.
- Self-hosting routing infrastructure.
- True infinite date generation outside trip boundaries.
- Automatic itinerary optimization.
- Automatic selection of walking versus driving mode.
- Virtualizing normal-sized trips.
- Replacing the global Map workspace.

## Suggested implementation sequence

1. Extract reusable Leaflet marker, popup, and bounds behavior from the current Map view.
2. Build the Day split layout with a scrollable itinerary column and persistent map.
3. Render every trip date as a section with sticky headers and empty states.
4. Implement active-day detection and date-strip synchronization.
5. Filter map markers to the active date and fit bounds on date changes.
6. Add card-to-marker and marker-to-card synchronization.
7. Add item focusing when entering Day from an inspector selection.
8. Restore Ideas drag targets for date headers and exact order gaps.
9. Verify inspector overlay behavior and Leaflet resizing.
10. Test responsive stacking/toggling.
11. Run lint, TypeScript, production build, and browser interaction checks.

## Acceptance criteria

- Day view renders every date in the active trip in one continuous scroll.
- Every date has a sticky heading and empty dates remain visible.
- Scrolling changes the active date predictably.
- The date strip reflects the active section and can scroll to another section.
- The Leaflet map displays only items belonging to the active date.
- Marker numbers match itinerary sequence numbers.
- Selecting a card focuses its marker.
- Selecting a marker scrolls to and selects its card.
- User map movement is respected; the map does not continuously recenter.
- A Recenter day action restores the active-day bounds.
- Items without coordinates remain usable in the itinerary.
- Ideas includes both manually created and imported undated items.
- Ideas can be dropped onto a date or into an exact order gap.
- Fixed-time items retain their confirmed times during reorder operations.
- The inspector overlays the map without changing itinerary width or scroll position.
- Entering Day with a selected item focuses that item's date and card.
- The layout has a usable narrow/mobile fallback.
- OSM attribution remains visible.
- No routing duration is displayed unless it comes from stored manual data or a configured routing provider.
