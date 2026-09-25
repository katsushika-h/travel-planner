# ADR 0002: Expose only canonical schedule fields in the API

**Status:** Accepted (2026-09-25)

**Decision:** Travel-object create, update, reorder, and read responses use `date`, `endDate`, `startTime`, `endTime`, `placementTime`, `dayOrder`, and `isAllDay`. Remove `startDateTime`, `endDateTime`, and `dayIndex` from shared client types and API responses. Reject those keys in create, update, and reorder requests with HTTP 400, including when their value is null.

**Why:** The UI and importer already use canonical schedule fields. Derived timestamps cannot distinguish a flexible visual position from a confirmed time, and maintaining two public representations invites conflicting writes.

**Consequences:** This is a breaking request and response change for external API clients. Clients must send separate date and time fields. CSV input headers such as “End DateTime” remain accepted and are converted to canonical fields before API creation. Historical Prisma migrations remain untouched. No database schema change is required.

**Verification:** The unit suite, isolated webpack production build, and database-backed API and ordering HTTP fixtures pass. The fixtures check canonical response shapes and reject each removed key.
