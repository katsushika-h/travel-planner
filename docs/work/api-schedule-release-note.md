# API schedule contract change — 2026-09-25

Travel-object API responses now return only canonical schedule fields: `date`, `endDate`, `startTime`, `endTime`, `placementTime`, `dayOrder`, and `isAllDay`. The removed `startDateTime`, `endDateTime`, and `dayIndex` keys are absent from GET, POST, PATCH, and reorder responses. Requests containing any removed key now return HTTP 400 with a field-specific error.

Clients should send date-only `date` and `endDate` strings (`YYYY-MM-DD`) and separate `startTime` and `endTime` strings (`HH:MM`) for confirmed times. Flexible items use `placementTime` as a visual position without confirmed times. All-day items use a date span and `isAllDay: true` without times. Use `date: null` to unschedule an item. `dayOrder` remains the order within a date.

The PostgreSQL schema and historical migrations did not change. Google Maps CSV input still accepts its existing combined date/time column labels and converts them before calling the API. Any external client using the removed keys must update its request parsing and response handling.
