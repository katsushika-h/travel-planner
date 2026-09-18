
# Custom Travel Planner — Architecture & Specification Document (v3)

> **v3 changelog:** Scoped down to a single-user, local-machine proof of concept. Replaced Supabase with plain Postgres + Prisma. Removed Realtime as a requirement. Added trip-level timezone as a first-class requirement. Corrected the iCal "real-time sync" claim. Added a concrete file structure and a step-by-step build order.

---

## 1. Executive Summary
A bespoke, high-density travel planning web application designed to eliminate cluttered UI by providing a unified system for organizing trip itineraries across three synchronized views: **Calendar**, **Kanban**, and an **Itinerary View**.

**Proof-of-concept scope:** single user, running entirely on a local machine. No authentication, no multi-user collaboration, and no realtime sync are required for this phase. The app uses **Next.js (App Router, TypeScript)** for the frontend and **Postgres + Prisma** for persistent local data storage. A dynamic **iCal subscription feed** is planned as a fast-follow for syncing with external calendar platforms (Google Calendar, Apple Calendar, etc.) — see §8.2 for an important caveat on what "sync" actually means here.

---

## 2. Tech Stack & Infrastructure

* **Frontend Framework:** Next.js (App Router, TypeScript, React)
* **Styling & UI:** Tailwind CSS, Lucide Icons, `shadcn/ui` components (Combobox, Sheet, Select)
* **Drag-and-Drop:** `dnd-kit`
* **Maps Integration:** `@vis.gl/react-google-maps` (or `@react-google-maps/api`) — deferred until after the Calendar/Kanban POC (§9)
* **Backend & Database:** Postgres (local, via Docker) + Prisma ORM
* **State Management:** Zustand (`useTravelStore`)
* **Hosting:** Local machine for POC; Vercel deferred until a hosted phase

### 2.1 Why Postgres + Prisma instead of Supabase
Supabase bundles hosted Postgres with Auth, Realtime, and Storage. None of those extras are needed for a single-user local POC:

| Supabase feature | Needed for POC? |
|---|---|
| Auth | No — single user, no login |
| Realtime | No — no concurrent clients to sync |
| Storage | No — not used anywhere in this spec |
| Auto-generated client API | No — hand-written Next.js Route Handlers are simple enough at this scale |

Plain **Postgres + Prisma + Next.js Route Handlers** is a more standard, lighter-weight combination for this scope. The schema is unchanged either way (Prisma models map directly to the same tables). Migrating to Supabase later, if hosted deployment or multi-user support is ever needed, remains straightforward since it's Postgres underneath — nothing here locks that door shut.

---

## 3. Navigation & Collapsible Sidebar State

The navigation sidebar (`AppSidebar.tsx`) supports two visual states toggled via a collapse button at the top:

1. **Expanded Mode (Default Width: 200px):**
   * Displays icon + text labels for each tab (`[📅] Calendar`, `[📋] Kanban`, `[🗺️] Map Visualizer`).
   * Displays active trip selector dropdown and settings at the bottom.
2. **Compact / Icon-Only Mode (Width: 64px):**
   * Hides text labels, showing icons only (`[📅]`, `[📋]`, `[🗺️]`).
   * Hovering over icons renders tooltips with tab names.
   * Expands the main stage container automatically using CSS grid transition: `grid-template-columns: var(--sidebar-width) 1fr;`

> **POC note:** The Map Visualizer tab is deferred (§9). The POC sidebar ships with Calendar and Kanban only.

```typescript
interface SidebarState {
  isCollapsed: boolean;
  activeTab: 'calendar' | 'kanban' | 'map';
  toggleSidebar: () => void;
  setActiveTab: (tab: 'calendar' | 'kanban' | 'map') => void;
}
```

---

## 4. UI/UX Architecture & Workspace Specifications

```
┌────┬──────────────────────────────────────────────┬───────────────────────────┐
│NAV │ MAIN STAGE (Left 2/3)                        │ NOTION-STYLE PANEL (1/3)  │
│    ├──────────────────────────────────────────────┴───────────────────────────┤
│[📅]│ [ TAB 1: CALENDAR VIEW ]                                                 │
│[📋]│ • Left 2/3: Day / Week / Month Grid (POC: Month only)                    │
│    │ • Right 1/3: Notion-style Side Inspector Panel                           │
│    ├──────────────────────────────────────────────────────────────────────────┤
│    │ [ TAB 2: KANBAN VIEW ]                                                   │
│    │ • Left 2/3: Columns grouped by Type (Food, Hotel, Flight, Custom...)     │
│    │ • Right 1/3: Notion-style Side Inspector Panel                           │
└────┴──────────────────────────────────────────────────────────────────────────┘
```

> Map Visualizer layout is unchanged from v2 and retained in this doc (§9) for when it's built, but is out of scope for the current POC.

### Tab 1: Calendar View (POC: Month only)
* **Layout:** Takes up the left 2/3 of the screen width.
* **Modes:** Month view only for the POC. Week/Day time-grid with drag-to-resize is deferred (§9) — it is the single most time-consuming piece of UI in the whole project and is intentionally cut from the first milestone.
* **Interactions:**
  * **Drag-to-move:** Dragging an event chip from one day cell to another updates `startDateTime`/`endDateTime` (same time-of-day, new date) and `dayIndex`.
  * **Quick Create:** Deferred to post-POC; not required for the drag-and-drop milestone.
* **Inspector Sync:** Clicking any object opens a Notion-style side panel in the rightmost 1/3 of the page to edit item details.

### Tab 2: Kanban View
* **Layout:** Takes up the left 2/3 of the screen width.
* **Categorization:** Columns are organized by object `type` (`commute`, `food`, `hotel`, `flight`, `activity`, `sightseeing`, or any user-defined custom type).
* **Interactions:** Dragging an event card across columns automatically mutates its `type` field in the database.
* **Inspector Sync:** Clicking any card opens the right 1/3 Notion-style side inspector panel.

---

## 5. Individual Object Data Model (`types/travel.ts`)

```typescript
export type DefaultEventType = 
  | 'commute' 
  | 'food' 
  | 'hotel' 
  | 'flight' 
  | 'activity' 
  | 'sightseeing';

// Supports base default types + dynamic user-created string types
export type EventType = DefaultEventType | (string & {});

export interface LocationData {
  name?: string;
  address?: string;
  googleMapsUrl?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  openingHours?: string[];
}

export interface CostData {
  amount: number;
  currency: string;
}

export interface Trip {
  id: string;
  title: string;
  startDate: string;   // ISO date
  endDate: string;      // ISO date
  timezone: string;     // IANA timezone string, e.g. "Asia/Tokyo" — NEW in v3
  createdAt: string;
}

export interface TravelObject {
  id: string;
  tripId: string;
  title: string;
  type: EventType;
  
  // Timing & Scheduling
  startDateTime: string; // ISO 8601 String, stored UTC
  endDateTime: string;   // ISO 8601 String, stored UTC
  dayIndex: number;      // 1-based index (Day 1, Day 2...)
  isAllDay: boolean;
  
  // Optional Geographic Location & Cost (Allows non-location entries)
  location?: LocationData;
  cost?: CostData;
  
  // Metadata & Notes
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
```

> **Timezone handling (new in v3):** `Trip.timezone` is required at trip-creation time and stored as an IANA name, not a UTC offset (offsets don't survive DST correctly). All `TravelObject` timestamps remain `TIMESTAMPTZ`/UTC in the database, but must be **rendered** in the trip's timezone throughout the UI (calendar grid, inspector panel), not the browser's local timezone — otherwise a trip planned from a different timezone than the destination will display confusing offsets. A single `Trip.timezone` field assumes one timezone per trip; multi-timezone trips (e.g. long-haul flights crossing zones) are a known limitation, not solved in this phase.

---

## 6. Type Selection & Custom Types Mechanics

When editing an object in the inspector panel, the type selector operates using a **Combobox / Select with Create** pattern.

```
┌─────────────────────────────────────────────────────────┐
│ Event Type                                              │
├─────────────────────────────────────────────────────────┤
│ [ 🍜 Food                                            ▼ ]│
└──────────────────────┬──────────────────────────────────┘
                       │ DROPDOWN MENU
                       ├──────────────────────────────────┐
                       │ DEFAULT TYPES                    │
                       │   ✈️ Flight                       │
                       │   🏨 Hotel                       │
                       │   🍜 Food                        │
                       │   🚃 Commute                     │
                       │   🎟️ Activity                    │
                       │   📸 Sightseeing                 │
                       ├──────────────────────────────────┤
                       │ YOUR CUSTOM TYPES                │
                       │   🛍️ Shopping                    │
                       │   🎒 Packing List                │
                       ├──────────────────────────────────┤
                       │ ➕ Create new type: "___"        │
                       └──────────────────────────────────┘
```

### Behavioral Rules:
1. **Preset List:** Standard categories (`flight`, `hotel`, `food`, `commute`, `activity`, `sightseeing`) are always present at the top.
2. **Dynamic Aggregation:** The app dynamically scans existing `travel_objects` for the active trip, extracts unique custom types, and lists them under **"YOUR CUSTOM TYPES"**.
3. **Inline Creation:** Typing a non-existent category into the combobox input renders a `+ Create custom type "[Input]"` option. Selecting it assigns the custom string to `type` and automatically generates a new column for it in **Kanban View**.
4. **Known gap:** Nothing currently prevents near-duplicate custom types from typos (e.g. `"Shoping"` vs `"Shopping"`). A future iteration should consider a per-trip `custom_types` lookup table rather than scanning for uniques, to avoid permanent typo'd types requiring bulk-migration cleanup.

---

## 7. Database Schema (Postgres via Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Trip {
  id            String   @id @default(uuid())
  title         String
  startDate     DateTime
  endDate       DateTime
  timezone      String   @default("UTC") // IANA timezone string — required at creation
  createdAt     DateTime @default(now())

  travelObjects TravelObject[]
}

model TravelObject {
  id            String   @id @default(uuid())
  tripId        String
  trip          Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)

  title         String
  type          String   @default("activity") // flexible string to allow custom types

  // Timing
  startDateTime DateTime
  endDateTime   DateTime
  dayIndex      Int      @default(1)
  isAllDay      Boolean  @default(false)

  // Optional payloads (nullable JSON)
  location      Json?
  cost          Json?

  // Metadata
  notes         String?
  tags          String[] @default([])

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tripId, startDateTime, endDateTime])
  @@index([tripId, type])
}
```

Run `npx prisma migrate dev --name init` to generate the corresponding SQL migration and Prisma Client types automatically — no hand-written SQL or `supabase gen types` step required.

---

## 8. External Integration Specifications (deferred beyond initial POC)

### 8.1 Google Places API Integration
* **Endpoint:** Next.js Route Handler `/api/places/details`
* **Workflow:**
  1. User pastes a Google Maps URL or searches a location string in the right inspector panel.
  2. The server calls Google Places API (`Place Details` / `Text Search`).
  3. The response extracts `name`, `formatted_address`, `geometry.location.lat`, `geometry.location.lng`, and `place_id`, populating the object's `location` JSON field.
* **Cost note (single-user POC):** With one local user, total call volume is bounded by manual interaction, not concurrent usage — realistically low enough to stay within Google's free monthly credit. The actual risk during development is repeated dev-loop reloads re-fetching the same place data; mitigate by caching resolved `location` data into the object immediately (already in the schema) and never re-calling Places for an object that already has `lat`/`lng`.

### 8.2 Live iCal / Google Calendar Export
* **Endpoint:** Next.js Route Handler `/api/trips/[tripId]/ical`
* **Workflow:**
  1. Generates a standard `text/calendar` (`.ics`) payload containing all scheduled `travel_objects` for a given `tripId`.
  2. Users subscribe via Google Calendar (*Other Calendars → From URL*).
  3. External calendar clients pick up changes on their **own refresh cycle** — for Google Calendar this is typically every 12–24 hours, not immediately.
* **Correction from v2:** This is **not** real-time sync. iCal subscription is pull-based and rate-limited by the subscribing client, not by this app. If genuinely live push updates to Google Calendar are ever required, that needs the Google Calendar API with OAuth — a substantially larger integration than a public `.ics` feed, and out of scope for this POC.
* The `VTIMEZONE` block in the generated `.ics` should use the trip's `timezone` field so external calendars display events correctly regardless of the subscriber's own local timezone.

---

## 9. Proof-of-Concept Scope & Deferred Items

**In scope for the POC:**
- Trip creation, including required timezone selection.
- Calendar tab — **Month view only**, with drag-and-drop to move events between days.
- Kanban tab — drag-and-drop to recategorize events across type columns, including custom type creation.
- Shared Notion-style inspector panel, used by both views.
- Local Postgres + Prisma persistence, survives page reload.

**Explicitly deferred (not required for POC completion):**
- Map Visualizer tab (Google Maps embed, Places API integration, scroll/pan sync).
- Calendar Week/Day views with hourly time-grid and drag-to-resize.
- iCal export endpoint.
- Authentication, multi-user support, Realtime sync, and Row-Level Security — all irrelevant at single-user/local scope, revisit if the project moves toward hosted/multi-user deployment.
- Quick-create via double-click on the calendar grid.

---

## 10. Project File Structure

```
travel-planner/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── trips/
│   │       │   ├── route.ts              # GET (list), POST (create)
│   │       │   └── [tripId]/route.ts     # GET one, PATCH, DELETE
│   │       └── travel-objects/
│   │           ├── route.ts              # GET (list by tripId), POST (create)
│   │           └── [objectId]/route.ts   # PATCH, DELETE
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   └── AppSidebar.tsx
│   │   ├── views/
│   │   │   ├── CalendarView.tsx
│   │   │   ├── calendar/
│   │   │   │   ├── MonthGrid.tsx
│   │   │   │   ├── DayCell.tsx
│   │   │   │   └── EventChip.tsx
│   │   │   ├── KanbanView.tsx
│   │   │   └── kanban/
│   │   │       ├── KanbanColumn.tsx
│   │   │       ├── KanbanCard.tsx
│   │   │       └── AddTypeButton.tsx
│   │   ├── inspector/
│   │   │   ├── ObjectInspectorPanel.tsx
│   │   │   └── TypeCombobox.tsx
│   │   ├── trip/
│   │   │   └── CreateTripDialog.tsx      # includes required timezone selector
│   │   └── ui/                           # shadcn/ui generated components
│   │
│   ├── lib/
│   │   ├── prisma.ts                     # shared PrismaClient singleton
│   │   ├── api-client.ts                 # typed fetch wrappers
│   │   ├── date-utils.ts                 # dayIndex <-> date math, timezone-aware formatting
│   │   └── utils.ts
│   │
│   ├── store/
│   │   └── useTravelStore.ts
│   │
│   └── types/
│       └── travel.ts
│
├── .env                                  # DATABASE_URL for local Postgres
├── docker-compose.yml                    # local Postgres container (postgres:18)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 11. Build Order (POC)

1. Confirm Node 18+ and Docker are installed.
2. Scaffold the Next.js app (`create-next-app`, TypeScript + Tailwind + App Router + `src/`).
3. Run local Postgres via `docker-compose.yml`.
4. Install Prisma, connect it to Postgres via `DATABASE_URL`.
5. Add the `Trip` model, migrate, verify a manual row in Prisma Studio.
6. Build `GET`/`POST /api/trips`, verify with `curl` before touching the UI.
7. Render trips in a bare unstyled page fetching from the API.
8. Introduce Zustand with a single piece of state (`activeTripId`) and wire it to the trip list.
9. **Checkpoint:** full-stack loop (Postgres → Prisma → API → React → Zustand) is proven. Add the `TravelObject` model from this point.
10. Build the collapsible sidebar and Calendar/Kanban tab shell.
11. Build the shared `ObjectInspectorPanel` once, before either view — both will reuse it unchanged.
12. Build Calendar Month view with drag-to-move (`dnd-kit`).
13. Build Kanban view with drag-to-recategorize (`dnd-kit`).
14. Wire persistence and reload correctness (refetch from API on load, don't rely on in-memory state surviving a refresh).
15. Smoke-test drag interactions end to end: cross-week calendar drags, cross-column Kanban drags including a freshly created custom type, and inspector edits reflecting correctly in both views.

---

## 12. Estimated Timeline

Rough estimate assuming solo, AI-assisted ("vibe coding") development, single user, local machine:

| Phase | Estimate |
|---|---|
| Setup (steps 1–9 above) | 0.5–1 day |
| Sidebar, tab shell, inspector panel | 0.5–1 day |
| Kanban view (drag-and-drop, dynamic columns) | 1–2 days |
| Calendar Month view (drag-and-drop) | 0.5–1 day |
| Timezone selector + timezone-aware rendering | 0.5 day |
| Persistence, reload correctness, bug fixing | 1–2 days |
| **Total** | **~4–7 focused working days** |

This is notably shorter than the full v2 scope (~10–16 days) primarily because Week/Day calendar drag-to-resize and the Map Visualizer — the two most time-consuming and bug-prone components — are deferred out of this milestone.
