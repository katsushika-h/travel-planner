# MCP server learning plan

**Status:** In progress (steps 1–3 done). Learning project.

**Goal:** Build a small Model Context Protocol (MCP) server that lets an AI client such as Claude Code read and edit trips through the existing HTTP API, and learn how each part of MCP maps onto that API along the way.

**Scope:** A separate `mcp-server/` package that calls `/api/*` over HTTP. No changes to route handlers, validation, the Prisma schema, or the browser app. The optional last step adds an HTTP transport inside Next.js; skip it unless you want to learn remote transports.

**Why go through the HTTP API instead of Prisma?** The route handlers already hold every rule in `docs/api.md`: schedule validation (ADR 0001, 0002), `dayOrder` renumbering, expense decimal strings (ADR 0003), and cascading deletes. An MCP server that calls those routes is just another API client, like `lib/api-client.ts`. It cannot bypass a rule, and you learn MCP without re-implementing the domain.

## The mental model

```
┌──────────────┐  JSON-RPC over stdio   ┌──────────────────┐   HTTP + JSON   ┌───────────────────┐
│ Host / client │ ─────────────────────▶ │ travel-planner   │ ──────────────▶ │ Next.js /api/*    │
│ (Claude Code, │ ◀───────────────────── │ MCP server       │ ◀────────────── │ route handlers    │
│  Inspector)   │  tools/list, tools/call│ (mcp-server/)    │  200/201/4xx    │ → Prisma → Postgres│
└──────────────┘                         └──────────────────┘                 └───────────────────┘
```

- **Host and client:** the AI app (Claude Code) starts your server and speaks MCP to it.
- **Server:** your program. It advertises what it can do and translates MCP calls into API requests.
- **Transport:** how messages travel. **stdio** (the host launches your server as a child process and talks over stdin/stdout) is the simplest and is used until step 11. **Streamable HTTP** is the remote option.
- **Primitives:**
  - **Tools:** actions the model decides to call, such as `create_item`. Most of this plan is tools.
  - **Resources:** read-only data the client can attach as context, addressed by URI, such as `trip://{tripId}/itinerary`.
  - **Prompts:** reusable, user-chosen message templates, such as "plan this day".
- **Lifecycle:** `initialize` (exchange versions and capabilities) → `tools/list` (the client learns your tool names and JSON Schemas) → `tools/call` (the model calls one with arguments) → your server returns `content`, or `isError: true`.

Keep two layers of validation in mind. The MCP input schema (zod) catches shape errors before a request is sent and tells the model what arguments exist. The API remains the authority on business rules. When it returns `400 { "error": "..." }`, pass that message back so the model can correct itself.

## Safety before you start

- The API has **no authentication** (see `AGENTS.md`). Any tool you expose can change or delete any trip. Point the server at your **local dev database**, never the NAS deployment, while learning.
- Mark write tools with annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can ask for confirmation.
- In a stdio server, **stdout is the protocol channel**. `console.log` corrupts it. Log with `console.error`.
- The Nearby, place-details, parking, and route-legs endpoints call third-party services (Overpass, Wikidata, openrouteservice) with usage policies. Do not expose them as tools in this project unless you add rate limiting; a model may call a tool in a loop.

## Checklist

Each step has a **Learn** goal, a **Do** task, and a **Check** that proves it works. Commit after each step.

### 1. Explore the API as a plain client

- **Learn:** the MCP server is only a translator. You need to know the API it translates to.
- **Do:** start Postgres and `npm run dev`. Create a test trip and use `curl` for the examples in `docs/api.md`: list trips, create an item, `PATCH` its schedule, and send an invalid request (for example, `startTime` without `endTime`) to see a `400` error body.
- **Check:** you can predict the status code and body of each request before sending it.
- [x] Done

### 2. Scaffold the server package

- **Learn:** how an MCP server is packaged and launched.
- **Do:** create `mcp-server/` with its own `package.json` so the app's dependencies stay unchanged. Install `@modelcontextprotocol/sdk` and `zod`, plus `tsx` and `typescript` as dev dependencies. Add `mcp-server/src/index.ts`, which creates an `McpServer({ name: "travel-planner", version: "0.1.0" })` and connects it to a `StdioServerTransport`. Read the SDK README for the installed version first; the API has changed between releases.
- **Check:** `npx tsx mcp-server/src/index.ts` starts and waits silently for input. Ctrl+C exits.
- [x] Done

### 3. A hello-world tool and the Inspector

- **Learn:** the `tools/list` and `tools/call` messages, and how a zod schema becomes the JSON Schema the model sees.
- **Do:** register a `ping` tool that takes `{ name: string }` and returns `{ content: [{ type: "text", text: "Hello, <name>" }] }`. Run the MCP Inspector: `npx @modelcontextprotocol/inspector npx tsx mcp-server/src/index.ts`.
- **Check:** in the Inspector, connect, list tools, call `ping`, and read the raw JSON-RPC messages in its history panel. Find the `initialize` exchange and your tool's `inputSchema`.
- [x] Done

### 4. An API client for the server

- **Learn:** where the MCP-to-HTTP boundary sits and how API errors become MCP errors.
- **Do:** add `mcp-server/src/api.ts`, a small `request()` helper modelled on `lib/api-client.ts`. It reads the base URL from `TRAVEL_PLANNER_URL` (default `http://localhost:3000`), sends JSON, returns `undefined` for `204`, and throws `new Error(body.error)` for non-2xx responses. Do not import from the app; the server is a separate process.
- **Check:** a temporary `ping` variant that calls `GET /api/trips` returns your trips in the Inspector.
- [ ] Done

### 5. Read-only tools

- **Learn:** designing tools for a model: clear names, descriptions that state units and formats, and compact results.
- **Do:** replace `ping` with:
  - `list_trips`: no input; `GET /api/trips`.
  - `list_items`: `{ tripId }`; `GET /api/travel-objects?tripId=…`. Consider returning a trimmed summary (id, title, type, date, times, `dayOrder`) as text and the full rows as `structuredContent`.
  - `get_item`: `{ itemId }`; `GET /api/travel-objects/{id}`.

  Wrap each handler so a thrown API error returns `{ isError: true, content: [{ type: "text", text: message }] }` instead of crashing. Mark these tools `readOnlyHint: true`.
- **Check:** in the Inspector, an unknown `tripId` returns an `isError` result with the API's `404` message.
- [ ] Done

### 6. Connect it to Claude Code

- **Learn:** how a host discovers, launches, and approves a server.
- **Do:** add a project-scoped `.mcp.json` at the repository root:

  ```json
  {
    "mcpServers": {
      "travel-planner": {
        "command": "npx",
        "args": ["tsx", "mcp-server/src/index.ts"],
        "env": { "TRAVEL_PLANNER_URL": "http://localhost:3000" }
      }
    }
  }
  ```

  Restart Claude Code in this repository and approve the server.
- **Check:** ask "What trips do I have, and what is on the first day of the earliest one?" and watch the model call `list_trips` and then `list_items`.
- [ ] Done

### 7. Resources

- **Learn:** the difference between a tool (the model chooses to act) and a resource (the client attaches context).
- **Do:** register a resource template `trip://{tripId}/itinerary` that fetches the trip and its items and returns a readable day-by-day text itinerary. Implement list support so clients can browse one resource per trip.
- **Check:** the Inspector's Resources tab lists your trips and reads an itinerary. In Claude Code, reference it with `@` to attach it.
- [ ] Done

### 8. Write tools that respect the schedule rules

- **Learn:** letting the API enforce business rules, and turning its validation errors into feedback the model can act on.
- **Do:** add `create_item` (`POST /api/travel-objects`) and `update_item` (`PATCH /api/travel-objects/{id}`). Describe the schedule fields in the tool description: `date` as `YYYY-MM-DD`, `startTime` and `endTime` as `HH:MM` set together, `placementTime` on 15-minute steps for flexible items only, `date: null` for an unscheduled idea. Do not accept `startDateTime`, `endDateTime`, or `dayIndex`. Use zod for shape only; leave cross-field rules to the API.
- **Check:** ask Claude to "add a 10:00–11:30 visit to Kumamoto Castle on the second day". Then try a request that breaks a rule (for example, an end time before the start time) and confirm the model reads the `400` message and retries correctly. Verify the result in the app's Plan view.
- [ ] Done

### 9. Reorder and delete

- **Learn:** tool annotations and how a client uses them to ask for confirmation.
- **Do:** add `move_item` (`POST /api/travel-objects/reorder` with `tripId`, `objectId`, `date`, `dayOrder`, and optional `clearTime`/`placementTime`) and `delete_item` (`DELETE /api/travel-objects/{id}`). Mark `delete_item` with `destructiveHint: true` and `move_item` with `idempotentHint: true`. Note that reorder returns every item in the trip; summarize the destination day rather than returning all of it.
- **Check:** move an item to another day and confirm its `dayOrder` and the old day's renumbering in the app. Claude Code asks before running `delete_item`.
- [ ] Done

### 10. Expenses and a prompt

- **Learn:** respecting a domain invariant the model would otherwise get wrong, and the prompt primitive.
- **Do:** add `list_expenses` and `add_expense`. Require `amount` as a decimal string (ADR 0003) and `category` as one of the six allowed values. Add `trip_spending_summary`, which totals expenses **per currency** without conversion and keeps planned item `cost` separate. Then register a prompt, `plan_day`, with arguments `tripId` and `date`, that tells the model to read the day's items and suggest an order.
- **Check:** in Claude Code, `/mcp__travel-planner__plan_day` appears as a slash command. A spending summary with JPY and SGD expenses shows two separate totals.
- [ ] Done

### 11. Tests

- **Learn:** testing a server without a real host.
- **Do:** add `mcp-server/tests/` using `node --test`. Connect an SDK `Client` to your server over the SDK's in-memory transport, and stub `fetch` to return canned API responses. Cover: tool list contents, a successful call, and a `400` that becomes `isError`.
- **Check:** the tests pass without the app or database running.
- [ ] Done

### 12. Optional: a remote transport inside Next.js

- **Learn:** Streamable HTTP, sessions, and why a remote MCP endpoint needs authentication.
- **Do:** read `node_modules/next/dist/docs/` for route handlers in Next.js 16, then sketch `app/api/mcp/route.ts` using the SDK's Streamable HTTP transport. Here the server could call the same functions the routes use instead of HTTP. Write down which choice you would make and why.
- **Check:** before exposing it anywhere, list what it would need: authentication (the app has none), Origin checking against DNS rebinding, and rate limiting. Do not deploy it without those. If you keep this design, record it in a short ADR in `docs/decisions/`.
- [ ] Done

## Current state

Steps 1–3 done; the `ping` tool is registered and was checked over raw stdio and in the Inspector. `mcp-server/` is its own npm package (`@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7, `tsx`, `typescript`) with `src/index.ts`: an `McpServer` on a `StdioServerTransport` with one tool, `ping`. Run it with `npm start` inside `mcp-server/` after `npm install` there. The root `tsconfig.json` and `.dockerignore` exclude `mcp-server`, so the app's type check and image do not depend on it; root ESLint and Prettier still cover it. `docs/api.md` and `lib/api-client.ts` are the references for every tool.

## Remaining work

Steps 4–12.

## Findings

Record surprises here as you go, such as a tool description that confused the model, or an API error message worth improving.

- Step 1: a dated item created without times gets `placementTime: "09:00"` and `dayOrder: 0`. Setting `startTime`/`endTime` clears `placementTime`. Every error body is `{ "error": "…" }` with a sentence a model can act on, such as `startTime and endTime must both be set or both be null.`, so the MCP server can pass messages through unchanged. `DELETE /api/trips/{id}` returns `204` with no body and removes the trip's items.
- Step 2: in SDK 1.32, `registerTool` replaces the deprecated `tool()` method. A server with no tools advertises empty `capabilities`, and `tools/list` then fails with JSON-RPC error `-32601 Method not found`; registering a tool adds the `tools` capability. Replies can arrive out of order, so clients match them by `id`.
- Step 3: the zod shape `{ name: z.string().describe(…) }` becomes a draft-07 JSON Schema in `tools/list`, with `.describe()` text as the property `description` and `required: ["name"]`. Registering the tool makes `initialize` advertise `capabilities.tools.listChanged: true`. Bad arguments (`name: 42`) do **not** produce a JSON-RPC error: the SDK returns a normal result with `isError: true` and the message `Input validation error: … expected string, received number at name`, so the model can read it and retry. In the same run the `id: 4` reply arrived before `id: 3`.

## Verification

Record the checks actually run for each step.

- Step 1 (2026-11-11): `curl` against `npm run dev` with local Postgres: `GET /api/trips` 200, `POST /api/trips` 201, `POST /api/travel-objects` 201, `PATCH` times 200, `PATCH` start without end 400, `PATCH` `dayIndex` 400, `GET` unknown item 404, `DELETE` trip 204. The test trip was deleted afterwards.
- Step 2 (2026-11-11): `npm run typecheck` in `mcp-server/` passed. Piping raw `initialize`, `notifications/initialized`, and `tools/list` messages into `npx tsx src/index.ts` returned `serverInfo` `travel-planner` 0.1.0 and `-32601` for `tools/list`, with the startup log on stderr only. Root `npm run check` passed (279 tests).
- Step 3 (2026-11-14): `npm run typecheck` in `mcp-server/` passed. Piping `initialize`, `notifications/initialized`, `tools/list`, and two `tools/call` messages into `npx tsx src/index.ts` listed `ping` with its schema and annotations, returned `Hello, Zen`, and returned `isError: true` for a numeric `name`. The Inspector check (connect, list tools, call `ping`, read the History panel) was then done by hand.

## Next step

Step 4: the `request()` helper in `mcp-server/src/api.ts`.
