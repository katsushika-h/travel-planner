# ADR 0005: Independent notes in flexible item ordering

**Status:** Accepted (2026-10-01), supersedes ADR 0004.

**Decision:** Represent Day notes as TravelObject entries with immutable kind=note and noteBody. Reuse flexible scheduling and dayOrder; notes have no confirmed time, location, or cost. Filter them from Week, Month, other workspace views, maps, expenses and ICS. Week insertion indices are derived from the complete day sequence including hidden notes.

**Consequences:** Notes move and delete independently. Event reorder normalization preserves flexible note gaps. Add note creates a blank card at the selected gap without a dialog, focuses its title, and saves inline fields on blur with error retry. Convert existing ItemNote records preserving IDs, text and timestamps; their former parent no longer controls placement or deletion. Existing TravelObject.notes remains unchanged.
