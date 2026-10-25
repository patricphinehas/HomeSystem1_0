# Home System — development log

**The point of it is the household's own inflation rate.** A published figure
averages a basket somebody else chose; this derives one from the receipts that
were actually entered — spend-weighted, carried forward through the months a
thing was not bought, and traceable line by line to the bill behind it. That is
what the price maths below is for, and it is why `/analytics` sits at the top
level of the nav beside the overview rather than inside a group.

Everything else either feeds that number or lives off it: the inventory and
what it costs, the bills behind those prices, the subscriptions, the shared
calendar. The smart home (air conditioning, hot water, pumps, through an edge
controller on the LAN) is an extension and the MCP tools are another way to ask
the same data questions — both there so one machine in the house can run the
whole thing.

A Next.js app for the pages, an Express API for the data, and `DB_SELECT` in
`.env` choosing SQLite, MongoDB or Supabase behind it. No data file: from the
first seed the database is the only copy, and the only things written to disk
at runtime are `.env`, by the settings page, and the SQLite file, when that is
the database.

This file is the development log and the reference for changing the code.
**Rules and conditions** comes first, then what the app does and how it is put
together, then the contracts (the API, the edge protocol), then the maths, then
the decisions, what is broken, and the phase-by-phase record. The deployment
plan and the authentication seam are in [`architecture.md`](architecture.md),
the desktop build is planned in
[`../electron_migration.md`](../electron_migration.md), and the manual for
whoever lives in the house is the in-app `/manual` page.

Last updated: 2026-10-26.

## Rules and conditions

Read this section before changing anything here. Everything after it is context:
what the app does, how it is built, and why each awkward bit is the way it is.

### The rules

Invariants, not preferences. Breaking one is a bug even when the app still runs.

1. **The `normalize*` function is the only gate.** Every write passes through
   its validator in `lib/` — `normalizeInventory`, `normalizeBill`,
   `normalizeSubscriptions`, `normalizeCalendar`, `normalizeFamily`,
   `normalizeDevices` — and every device command through `planCommand`. A route
   never trusts a body. A check that lives only in a form is not a check: the
   page, the API and the MCP tool call the same function, so hiding a button is
   never the mechanism.
2. **`lib/` stays pure and tested.** No `fetch`, no database handle, no
   `process.env`, no clock it did not receive as an argument. Anything that
   computes gets a test beside it in `lib/*.test.ts`, and `pnpm check` passes
   before a change is called done (90 tests today).
3. **A name may be blank.** Every form here saves on every keystroke, so
   clearing a field to retype it must not be rejected. This has been found three
   times — item names, calendar titles, device names — and it is now a rule
   rather than a surprise.
4. **No secret in the database, and none in the browser.** A controller row
   names an `.env` key (`tokenEnv`); it never holds the token. `GET /api/settings`
   answers `set: true` and never a value. A database target is reported with the
   password stripped.
5. **Live readings are never stored.** Device state is read through the
   controllers on every request and written down nowhere. A temperature is true
   for a few seconds; a stored one is a lie with a timestamp.
6. **The app never talks to a device.** Everything goes through an edge
   controller on the household's own LAN, over the three routes in
   **The edge protocol**. One integration, and no vendor SDK in this repo.
7. **No clock read during render.** `cacheComponents` bakes a prerendered clock
   into the build, so "today" comes from `todayISO()` inside an effect, or from
   a parameter. Three phases have hit this; it is not a style point.
8. **Next has no route handlers.** Next renders pages, Express owns every
   `/api/*` path, and `next.config.ts` rewrites across. One origin for the
   browser, and therefore no CORS configuration anywhere.
9. **Bills are write-once.** No edit route, no delete route; a mistake is
   corrected by entering a correcting bill. For the same reason
   `bill_items.item_id` is deliberately not a foreign key — deleting an item
   must not delete what you paid for it.
10. **A date is a day and a time is a wall clock.** `yyyy-mm-dd` and `HH:MM`,
    stored without a timezone and never converted. Movie night is at eight
    o'clock wherever the reader is.
11. **Nothing is authenticated.** Not the pages, not `PUT /api/settings`, not
    the MCP endpoint. Ports 3000 and 4000 do not go on the internet. Every
    other deployment decision hangs off this one — see
    [`architecture.md`](architecture.md).

### Conditions to run

All of these have to hold before the app shows anything, and
`mise run doctor` (or `pnpm run doctor`) checks each one and names the one that
failed:

- **Node and pnpm.** `mise.toml` pins Node 24 and pnpm 12.14.0; the floor is
  Node 22.18, because `server/` and `scripts/` are TypeScript run through
  Node's own type stripping with no build step.
- **`.env` exists** (copy `.env.example`) and sets `DB_SELECT` to `sqlite`,
  `mongodb` or `supabase`. Missing or anything else is a hard failure, in
  `doctor` and in the API. `sqlite` is the one that needs nothing else
  installed, which is what makes a standalone install one line of config.
- **The selected database is reachable.** `sqlite` needs nothing running and
  creates `SQLITE_PATH` (default `data/homesystem.db`) on first use; `mongodb`
  needs `MONGODB_URI`; `supabase` needs the pooled `DATABASE_URL`. Nothing on
  any page has data until it answers, and the pages name the host or the file
  they tried — never a password.
- **The database holds something.** An empty one means an empty app until
  `pnpm seed` runs or you add a category by hand. This is a warning, not a
  failure.
- **Ports 3000 and 4000 are free** — pages and data API. Also a warning: often
  it is just your own dev server.
- **An edge controller answers, for `/devices` only.** Every other page works
  without one. `pnpm edge` runs a simulated controller on :8099, which is also
  the spec a household's real one is written against.
- **A `.env` key per controller token**, where the controller wants one.
  `tokenEnv` names it: the row is the first half of adding a controller and the
  key is the second. A controller that wants a token the API does not have
  answers 401, and `doctor` prints that as the reason rather than "down".

### Working rules

- **The docs change in the same commit as the code.** A new phase gets a
  paragraph under **Done so far**; a shortcut taken knowingly gets a line under
  **Decisions, and what they cost** and a `ponytail:` comment at the site;
  anything broken goes under **Known issues** with its fix and leaves when the
  fix lands; anything wanted but not started goes under **Next up**. Bump the
  date at the top of this file.
- **Say what was verified and what was assumed.** "Works" means it was run.
  **Known issues** is where the unverified parts are listed by name — the
  phone layout, the mise tasks, real device hardware — and that list is more
  useful than a confident README.
- **`AGENTS.md` is regenerated by `next dev`.** Commit it with your work;
  deleting it from a diff only brings it back as an uncommitted change.
- **One file per job, and no fifth one.** `docs/README.md` is the development
  log, `docs/architecture.md` is the deployment audit and the auth seam,
  `electron_migration.md` is the plan for the desktop build, and the in-app
  `/manual` page is the one written for whoever lives in the house. New prose
  belongs in one of those four. A plan for a target gets its own file so the
  audit stays an audit; prose about the app as it is does not.

## Running it

`mise.toml` is the front door. mise itself is not bundled: `winget install jdx.mise`
on Windows, `curl https://mise.run | sh` elsewhere.

```bash
mise run setup      # mise install (Node 24, pnpm 12.14) + pnpm install + create .env
#                     set DB_SELECT in .env
mise run doctor     # toolchain, dependencies, config, selected database, ports
mise run migrate    # Postgres schema, or Mongo indexes (safe to re-run)
mise run seed       # inventory, demo bills, subscriptions, calendar, devices (-- --clear)
mise run develop    # pages on :3000, data API on :4000
mise run edge       # a simulated edge controller on :8099, for /devices
mise run check      # the test suite
mise run build      # production build of the pages
```

`DB_SELECT` in `.env` is the only required choice. `sqlite` needs nothing else
and writes one file (`SQLITE_PATH`, default `data/homesystem.db`), which is the
quickest way to a working app and the way to run this on one machine with no
services; `mongodb` has defaults for the URI and database name; `supabase` also
needs `DATABASE_URL`. `seed` prepares the selected database itself, so on a
fresh project `migrate` is optional — doubly so on SQLite, where the file is
created on first use.

Every task is a thin wrapper over a script that also works on its own, for
anyone without mise:

```bash
pnpm install
pnpm run doctor # same checks (`pnpm doctor` is pnpm's own command)
pnpm dev        # same two processes
pnpm dev:web    # just Next
pnpm api        # just the data API (node --watch)
pnpm edge       # the simulated edge controller
pnpm check      # 90 tests
pnpm seed       # inventory, demo bills, subscriptions, calendar, devices (--clear)
pnpm build      # production build
```

`doctor` checks Node (22.18+, since `server/` and `scripts/` are TypeScript run
without a build step), pnpm against the `packageManager` pin, the key packages,
whether `.env` was loaded, that the database named by `DB_SELECT` answers,
whether it holds anything, whether every configured edge controller answers
(with the reason when one does not), and whether `:3000` and `:4000` are free. Missing
requirements exit 1; "database is empty" and "port already in use" are warnings,
because both are often fine.

The selected database has to be reachable before **any** page shows data, and an
empty one means an empty app until `seed` runs or you add a category by hand.
When it is unreachable the pages say which host was tried — never a password.

`/devices` needs one more thing: a controller to talk to. `pnpm edge` is one —
seven simulated devices with a crude physics model, which `pnpm seed` writes a
matching registry for, so the page works end to end before any hardware exists.
Every other page is indifferent to it.

## Configuration

`.env` (a copy of `.env.example`, which is the one `.env*` file git keeps) holds
`DB_SELECT`, the settings for whichever database that names, `API_PORT` and
`API_URL`. Next loads it itself; every node entry point loads it with
`--env-file-if-exists=.env`. It is deliberately *not* duplicated in an `[env]`
block in `mise.toml`: one place to change it.

`DB_SELECT` is `sqlite`, `mongodb` or `supabase`. `mise run doctor` fails if it
is missing or none of those. `sqlite` uses `SQLITE_PATH` (default
`data/homesystem.db`), creates the file and its directory on first use, and
needs nothing else running — it is the option that makes this a standalone
system rather than an app in front of a database somebody has to keep up. `mongodb` uses `MONGODB_URI` (default
`mongodb://127.0.0.1:27017`) and `MONGODB_DB` (default `homesystem`). `supabase`
requires `DATABASE_URL` — the pooled connection string (transaction mode, port
6543). The password must be URL-encoded if it contains `@ : / ? # %`. Named
prepared statements are off for port 6543, because Supavisor transaction mode
drops them between queries.

The Supabase publishable and service-role keys are listed in `.env.example` but
unused: the server connects with the database password, not through PostgREST.
That matters for the security posture — see the schema note below.

The Supabase MCP server is configured in `.mcp.json` at project scope, for
schema work from the editor.

Beyond the database, `.env` holds who you are (`USER_NAME`, `HOUSEHOLD_NAME`),
the region (`LOCALE`, `TIMEZONE`, `CURRENCY`), the inference engine and its key,
the two ports, and the edge settings. Most of it is editable from `/settings`,
which patches this file in place — comments and key order survive — and then
says which keys need a restart, because the database drivers read theirs once at
module load. Who lives in the house is **not** here: that is a `family`
collection, for the reason phase 19 gives.

| Variable | Default | Used by |
|---|---|---|
| `DB_SELECT` | none — **required**, `supabase` or `mongodb` | Express, seed, migrate, doctor |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Mongo, when selected |
| `MONGODB_DB` | `homesystem` | Mongo, when selected |
| `SQLITE_PATH` | `data/homesystem.db` | SQLite, when selected |
| `DATABASE_URL` | none — **required when supabase** | Postgres, when selected |
| `API_PORT` | `4000` | Express |
| `API_URL` | `http://127.0.0.1:4000` | Next (rewrite target) |
| `USER_NAME` / `HOUSEHOLD_NAME` | blank | the sidebar, a comment's signature |
| `LOCALE` / `TIMEZONE` / `CURRENCY` | `en-IN` / system / `INR` | `lib/region.ts`, every formatter, and what `todayISO()` calls today |
| `CHAT_PROVIDER` | `ollama` | which engine `/api/chat` and the chat window use |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434` / `llama3.1` | that engine |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL` | none / `nvidia/nemotron-3-super-120b-a12b` | that engine |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | none / `anthropic/claude-sonnet-4.5` | that engine |
| `EDGE_TOKEN` | blank | the default `tokenEnv`; blank means a controller is called unauthenticated |
| `EDGE_TIMEOUT_MS` | `4000` | `server/edge.ts` — a LAN box answers in milliseconds or not at all |
| `EDGE_CACHE_MS` | `1500` | how long one read of the house is reused |
| `EDGE_PORT` | `8099` | `scripts/edge-sim.mjs` only, not the app |

A key named by a controller's `tokenEnv` is read at request time and is not in
this table, because the household invents the name: `KITCHEN_PI_TOKEN` is as
valid as `EDGE_TOKEN`, and nothing but that one controller reads it.

## What it does

- **Overview** (`/`) — what the calendar has for today, what is coming up from tomorrow on (the next six, each labelled Tomorrow / in so many days / by date), four counters (categories, items, running low, out of stock) and the first six things to buy. The plans are read-only here; the sections link to `/calendar`.
- **Home control** (`/control`) — low stock, recent bills, and subscriptions, plus whether the data API and the selected database answered. The machine panel names that database target and says which home-device controls are not connected.
- **Inventory management** (`/inventory`) — one tab per category plus a **Buy next** tab. Add, rename, re-count, tag and delete items and categories inline; every edit saves immediately. The chart button on a row opens that item’s whole purchase history: price per unit over time, how often it gets bought, when it is next due, and which shop has been cheapest.
- **Enter bill** (`/upload`) — a bill's date, shop and lines. Each line is reduced to a price per kg / litre / piece and compared with what that item has cost before.
- **Subscriptions** (`/subscriptions`) — what renews and what it costs: a cost plus a cycle (weekly, monthly, quarterly, yearly or one-off), put on one scale so the page totals per month and per year. Who holds it, whether it is shared, and with how many. A one-off is recorded and kept out of the recurring totals.
- **Analytics** (`/analytics`) — the household's own inflation rate, and the working behind it: a spend-weighted basket index from the first month with data, inflation per item and averaged, spend over time with a projection, where the money goes, per-purchase price deviations, and the biggest price moves. Every figure comes from bills that were entered here, which is the whole argument for it — see **The price maths**.
- **MCP tools** (`/mcp`) — two tabs: **Chat**, which asks the household data a question and shows every tool call it makes, and **Tools & clients**, which lists the tools with their arguments, the block to paste into an MCP client, and the servers `.mcp.json` points at.
- **User manual** (`/manual`) — the manual written for whoever lives here rather than whoever builds it: every page, what it is for, and what to do when something looks wrong. Prose only; it fetches nothing.
- **Settings** (`/settings`) — six tabs: **You**, **Family**, **Region**, **Database**, **Inference** and **Appearance**. Everything but the family list and the theme is written to `.env`; a dot on a tab says it is holding an unsaved change.
- **Smart home** (`/devices`) — air conditioners, thermostats, water heaters, pumps and tank sensors, every one of them behind an **edge controller** on the household's own network. **Control** polls live readings through those controllers and sends one command per button; **Setup** is the registry — which controllers exist, what each owns, the range a unit may be pushed to, and which devices are monitor-only. No device credential is ever in this app and nothing is opened to the internet: the only thing the API talks to is a box on the LAN. `pnpm edge` runs a simulated controller so the page works before any hardware does.
- **Calendar** (`/calendar`) — the shared family calendar: a month grid, the chosen day's plans, and what is coming up. Clicking a day lists it beside the grid; **Add** puts a new entry on it (activity, title, start, duration). Clicking an entry — in the grid, in the day's list, or in "Coming up" — opens it in a dialog: venue, link, who is invited and what each of them has said, whether it needs a booking and whose name it is under, notes, and the comments. Whoever added an entry is the only one offered the fields; everyone else sees the same detail as text and can still answer and comment. One occurrence per entry; there is no recurrence.

An item is "low" when `qty <= min`. Hitting the minimum is already a problem, so the threshold is inclusive — the one rule the test suite pins down from day one.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | Next.js 16.4.2, App Router | Serves the pages and the inventory API. |
| UI | React 19.3, Tailwind 4 (`@tailwindcss/turbopack`) | No component library; the design system is ~10 CSS variables in `app/globals.css`. |
| Charts | Recharts 3.10 | Line, pie and scatter out of the box, with SVG we can style against our own tokens. |
| Icons | `@phosphor-icons/react` | |
| Markdown | `react-markdown` 10 + `remark-gfm` | The chat answers in Markdown. It builds React elements and never sets innerHTML, which is the point: model output must not become markup. |
| Motion | GSAP 3.15 (core only) | Page leave (`power2.in`) and enter (`power2.out`). Loaded with a dynamic `import()` so it is not in the first server bundle. |
| Data API | Express 5 (`server/`) | Asked for explicitly; its own process on port 4000, and the only thing that talks to the database. |
| Storage | `DB_SELECT` in `.env`: `sqlite`, `mongodb` or `supabase` | Same API whichever it is. SQLite tables in `sqlite/schema.sql` through Node's built-in `node:sqlite` (no dependency); Postgres tables in `supabase/schema.sql`; Mongo keeps a category document and a bill document. `server/db.ts` picks the driver and nothing above it knows which. |
| Tests | `node --test` over `lib/*.test.ts` | In the runtime already; no Jest/Vitest config to maintain. |
| Dev annotator | `agentation` (dev dependency) | Click-to-annotate toolbar for pointing a coding agent at an element; mounted in development only. |
| Package manager | pnpm 12.14 | `pnpm-workspace.yaml` skips `sharp` and `unrs-resolver` builds. |

Next.js 16 conventions used here that differ from older versions: `cacheComponents` and `partialPrefetching` in `next.config.ts`, the generated `LayoutProps<"/">` type in `app/layout.tsx`, Tailwind wired through a Turbopack CSS rule instead of PostCSS, and `middleware` now being called `proxy` (we don't use it — plain `rewrites` do the job). `AGENTS.md` is regenerated by `next dev`; commit it with your work rather than deleting it from the diff.

`"type": "module"` is set, so `.ts` files run directly under Node 24's type stripping (`node server/index.ts`) without a build step or a reparse warning.

## Two processes

```
browser → :3000  Next.js (pages only)
                   └── rewrite ─────────→ :4000 Express ── DB_SELECT=sqlite | mongodb | supabase
```

The rewrites live in `next.config.ts`. Next has no route handlers at all — it
renders pages and forwards every `/api/*` path to Express, so the browser only
ever talks to one origin and there is no CORS configuration anywhere.
`scripts/dev.mjs` starts both processes, so `pnpm dev` is the whole app.

One thing to know about that arrow: in development it is Next's own dev proxy,
and it has its own timeout. `experimental.proxyTimeout` is set to 150s because
the default 30s silently turns a slow model turn into an opaque 500 that looks
like an API fault and is not one — phase 22 is the whole story.

## File map

```
app/
  layout.tsx            sidebar + main shell, fonts, metadata
  main-frame.tsx        the one client component every page is inside; applies the region
  page-frame.tsx        PageGrid / PageHeader — the two-column matrix every page uses
  sidebar.tsx           nav, active link from usePathname(); a menu on a phone
  page-motion.tsx       page leave/enter; GSAP imported on the client
  loading.tsx           route skeleton while the next segment streams in
  page.tsx              Overview: today, coming up, counters, buy next
  control/page.tsx      home control: activity, the smart-home summary, and what the machine can report
  devices/page.tsx      smart home: the live Control tab and the Setup registry
  devices/device-card.tsx  one device: its reading and its two or three controls
  inventory/page.tsx    tabs, Buy next, item rows, tags, add/delete forms
  subscriptions/page.tsx  what renews, what it costs per month and per year
  upload/page.tsx       bill entry, live per-unit price, JSON import, recent bills
  import-map-dialog.tsx an imported bill's line names, mapped onto inventory items
  bill-detail.tsx       one stored bill, line by line, in a <dialog>
  item-history.tsx      one item’s purchase history, in a native <dialog>
  analytics/
    page.tsx            filter row, stat tiles, chart cards, price-move table
    charts.tsx          the charts; the four on the page each carry a legend and a table twin
    palette.ts          validated chart colours, light and dark
  calendar/page.tsx     month grid, the day's plans, what is coming up
  calendar/event-dialog.tsx  one entry in full, in a <dialog>
  mcp/
    page.tsx            tabs: the chat, and the tools any client can call
    chat.tsx            the chat window; engine dropdown, tool calls shown inline
  manual/page.tsx       the user manual, prose only, no data fetching
  settings/page.tsx     tabs: you, family, region, database, inference, appearance
  settings/family.tsx   the household list, saved as you type
  theme.tsx             system / light / dark, localStorage, no server involvement
  ui.tsx                Stepper, Skeleton, Notice, Card, TagEditor, Tabs, loaders
  use-inventory.ts      inventory load + optimistic save
  use-calendar.ts       calendar load + optimistic save
  use-subscriptions.ts  subscriptions load + optimistic save
  use-devices.ts        the device registry, and the polled live state + commands
  use-family.ts         household load + optimistic save
  use-region.ts         applies locale/timezone/currency in the browser
  use-household.ts      your name, the household's, and who is in it
  use-api.ts            read-only JSON fetch with reload
  agentation.tsx        dev-only annotation toolbar
  globals.css           colour tokens, light + dark, focus ring
lib/
  inventory.ts          types, isLow, lowStock, totals, tags, validation
  units.ts              unit table, unit price, cheapest
  bill.ts               bill shape, validation, price comparison
  analytics.ts          spend, projection, deviation, inflation, index, per-item report
  match-inventory.ts    a bill line matched to an item: by name, alias or regex
  subscriptions.ts      what renews: validation, and every cycle on one scale
  money.ts              money and percentage formatting, in the region's currency
  region.ts             locale, timezone and currency, and what "today" means
  chat-log.ts           what was asked, a day at a time
  env-file.ts           patching .env in place, for the settings page
  calendar.ts           the shared calendar: types, validation, month-grid and duration maths
  devices.ts            smart home: the capability table, validation, and the command gate
  family.ts             who lives here: names, roles, validation
  *.test.ts             90 tests over the lib modules
server/
  index.ts              the Express routes, transport only
  db.ts                 reads DB_SELECT and forwards to one driver
  db-select.ts          the three choices, and what DB_SELECT is set to
  db.postgres.ts        Supabase queries
  db.mongo.ts           MongoDB queries
  db.sqlite.ts          SQLite queries, over Node's built-in node:sqlite
  mcp.ts                the tool registry and the MCP JSON-RPC endpoint
  chat.ts               one OpenAI-compatible chat path for all three engines
  settings.ts           the .env-backed settings routes
  edge.ts               the only code that calls an edge controller: three routes, a token, a cache
scripts/
  doctor.mjs            the requirement checks behind `mise run doctor`
  migrate.mjs           applies supabase/schema.sql
  dev.mjs               runs Next and the API together
  seed.mjs              starter inventory + demo bills, subscriptions, calendar, devices
  edge-sim.mjs          a working edge controller, simulated: the protocol by example
  starter-inventory.mjs the 6 categories / 28 items a fresh database starts with
supabase/schema.sql     the Postgres tables, with RLS on and no policies
sqlite/schema.sql       the same tables for SQLite: no arrays, no jsonb, no RLS
mise.toml               toolchain pins and the tasks
.env.example            configuration template, Supabase block included
.mcp.json               Supabase MCP server, project scope
```

There is no `data/` directory and no JSON fixture loaded at runtime: the starter
inventory is seed data in `scripts/`, and from the first seed the database is the
only copy.

## The API

Twenty-two routes. All maths and validation lives in `lib/` as pure functions; `server/index.ts` is transport only.

**`GET /api/inventory`** — `{ categories: [{ id, name, items }] }`, ordered by the stored `order` field.

**`PUT /api/inventory`** — the whole inventory document. Validated by `normalizeInventory` (ids present, unique and short; names and rooms length-capped but allowed to be blank, because the UI saves on every keystroke; quantities and minimums finite and >= 0; tags cleaned, deduped and capped at 8; up to 20 aliases and 5 regex patterns per item, each pattern compiled before it is stored so a broken one is refused here rather than at import time). Stored in one transaction: every category and item upserted with its position, then anything not in the payload deleted. A rejected payload never reaches the database.

**`POST /api/bills`** — body `{ date, store, note?, items: [{ name, itemId?, category?, qty, unit, cost }] }`.
Validates through `normalizeBill` (the only gate: date format and not in the future, shop present, 1–200 lines, every line named, quantity > 0, cost >= 0), stores the bill, and answers `201` with the stored bill plus a `comparisons` array saying, per line, whether this was the **best** price yet, **cheaper**, the **same**, **pricier**, or a **new** item.

An import is the same POST with an **array** body, up to 100 bills. It is all-or-nothing: every bill is validated before anything is written, and a failure names which bill in the file broke it, so a bad file never leaves half an import behind (there is no route to delete a bill again). A batch answers with a count rather than price comparisons, because comparing a batch against a history it is itself extending would report nonsense.

A shop's names are not the household's names, so an import is matched to the inventory before it is sent: `lib/match-inventory.ts` matches a line by item id, then by name, then by an item's `aliases`, then by its `patterns` (case-insensitive regexes, for a till that prints "TOOR DAL 1KG BRAND"), and `app/import-map-dialog.tsx` asks about whatever is left. Picking an item there offers to keep the shop's spelling as an alias, so the same bill matches itself next month. Unmatched lines still import — a purchase with a name and no item is a shape the price history already tolerates.

**`GET /api/bills?limit=20`** — recent bills, newest first, 1–200.

**`GET /api/analytics`** — the whole report: totals, spend by category and shop, monthly series, projection, month deviation, price index, inflation (per item and averaged), per-purchase deviations, the price book, and the flat purchase lines.

**`GET` / `PUT /api/subscriptions`** — the subscriptions document, validated by `normalizeSubscriptions`.

**`GET` / `PUT /api/calendar`** — the family calendar, validated by `normalizeCalendar`: a title, a real `yyyy-mm-dd` date (`2026-02-30` is refused), 24-hour `HH:MM` times or empty for all day, an end time that has to be after the start and on the same day, a `http(s)` link (a bare host gets `https://` put in front of it; `javascript:` is refused), at most 20 people, an RSVP per person, a booking status of empty / `needed` / `booked`, the name of whoever added it, notes, and at most 50 comments. A title may be blank, because the dialog saves on every keystroke and clearing the field to retype it must not be rejected — the same rule as item names. Written whole, like subscriptions, and stored back in calendar order. A date here is a day and a time is a wall clock: neither carries a timezone, because movie night is at eight o'clock wherever the reader is.

**`GET /api/mcp`** — what the MCP server offers (tools with their JSON Schemas), the servers listed in `.mcp.json` with their query strings stripped, and the three inference engines with whether each has a key.

**`POST /api/mcp`** — MCP itself, JSON-RPC: `initialize`, `ping`, `tools/list`, `tools/call`, singly or batched. Hand-rolled rather than `@modelcontextprotocol/sdk`: tools only, one JSON response per request, no SSE, no sessions, no resources or prompts. `server/mcp.ts` carries the ceiling and the upgrade path in a `ponytail:` comment, and `TOOLS` is already the shape the SDK wants.

**`POST /api/chat`** — `{ provider?, messages }`. Runs one turn against the configured engine with the same tool registry attached, executes whatever tools it asks for, and loops up to five rounds before giving up. Answers with only the messages the turn added, tool calls and tool results included, so the page can show the reasoning. Ollama, NVIDIA NIM and OpenRouter all speak the OpenAI chat-completions API, so there is one code path and an engine is a base URL, a key and a model name. Not streamed. An unreachable, unkeyed or wrong-model engine is a `502` naming which — it is the user's to fix, not a server fault.

**`GET /api/chat-log`** — what was asked, newest day first. There is no write route: the API appends to the day itself at the end of a successful turn, so a failed turn leaves nothing behind and the log is the same whichever client asked.

**`GET` / `PUT /api/family`** — who lives here, validated by `normalizeFamily`. A name may be blank while it is being typed, but two people may not share one: the calendar keys invitations and RSVPs by name, so a duplicate would make two people one.

**`GET` / `PUT /api/devices`** — the smart-home registry: `{ controllers: [...], devices: [...] }`, validated by `normalizeDevices`. A device must point at a controller that exists in the same payload, two devices may not share one address on one controller, and a per-unit setpoint range is narrowed into what its kind allows rather than taken as given. A controller address is stored as typed (with `http://` filled in when the scheme is missing) and checked where it is used, not here: the form saves on every keystroke and `http:` is an unavoidable state on the way to `http://192.168.1.50`, so refusing it would make the field impossible to type in. `server/edge.ts` is the gate — http(s) only, no credentials in the URL — and an address that is not one reads as unreachable, which it is. Written whole, like the calendar. Names may be blank while they are being typed. No token is stored: a controller row carries `tokenEnv`, the name of the `.env` key the API reads when it calls out.

**`GET /api/devices/state`** — what the house is doing, read through every controller in parallel. Always `200` when the registry reads: a controller that did not answer is reported alongside the ones that did, with the reason, because "the kitchen Pi is down" is the useful answer and a `502` would hide the four devices that are fine. Readings are keyed by device id; addresses a controller reported that no device claims come back under `discovered`, which is what Setup offers as "reported but not added". Answers are cached for `EDGE_CACHE_MS` (1.5s) so three widgets polling do not become three requests to one Pi.

**`POST /api/devices/command`** — `{ deviceId, power?, setpoint?, mode?, fan? }`. Two gates before anything reaches hardware: the device has to be in the registry, and `planCommand` has to agree the instruction is one that device takes. A control the kind does not have, an unknown mode, or a device marked monitor-only is a `400` with the reason; a setpoint past the unit's limit is brought back to it and the answer says `clamped: true`. The controller's own reading of the device comes back when it offers one, so the page can show what happened rather than what was asked. A controller that is off or refuses is a `502` naming it — the household's to fix, not a server fault.

**`GET /api/devices/check?controller=<id>`** — one controller's `/health`, behind the Setup page's **Test** button. The browser never calls a controller itself: the token lives on the server, and a LAN address is not reachable from wherever the page happens to be open.

**`GET` / `PUT /api/settings`** — the `.env`-backed settings. Secrets go out as `set: true` and never as values; an empty secret on a write means "keep it". A write patches `.env` (comments and key order survive, see `lib/env-file.ts`) and sets `process.env`, then answers with which keys need a restart: `DB_SELECT` and the engine settings are live, but the Mongo URI and the Postgres URL are read once at module load by the drivers, so the page says so rather than appearing to work. Unknown keys and invalid choices are a `400`.

There is no authentication on any of this, including the MCP endpoint and the settings write. It is a localhost household app; do not expose port 3000 or 4000.

Failure modes: `400` with a human message for a bad bill or unparseable body; `503` when `DB_SELECT` is missing or invalid, when Supabase is selected and `DATABASE_URL` is unset, when the chosen database cannot be reached (naming the host or the file it tried, never a password), when a SQLite file cannot be opened or is locked by another process, or when the Postgres tables are missing (`42P01`, answered with "run mise run migrate"); `500` otherwise.

## The edge protocol

Three routes, on the controller. This is the whole contract between the app and
a household's hardware; `scripts/edge-sim.mjs` implements it in 200 lines with
no dependencies, and `server/edge.ts` is the only code in the app that calls it.

```
GET  <url>/health
  -> { ok: true, name?, version? }

GET  <url>/state
  -> { devices: [ { address, online?, power?,
                    value? | temperature? | level?,
                    setpoint? | target?, mode?, fan?, watts?, at? } ] }

POST <url>/command   { address, power?, setpoint?, mode?, fan? }
  -> { ok: true, state?: { ...one reading, as above... } }
  -> { ok: false, error: "..." }      the controller holds the hardware and
                                      gets the last word, even though the app
                                      has already validated the command
```

Everything but `address` is optional: a controller reports what it knows, and
`fromEdge` in `lib/devices.ts` fills the rest in as `null` rather than letting a
missing field become `NaN` on a card. Both spellings exist because the two
things a controller already has are usually called `temperature` and `target`.

Authentication is `authorization: Bearer <token>`, where the token comes from
the `.env` key the controller row names. A controller with no token configured
is called as an open endpoint, which is fine for a box on your own LAN and is
not fine over the internet.

Redirects are not followed (`redirect: "manual"`): a controller that answers
with a 302 is misconfigured, and following it could hand the token to whatever
it points at. Nothing is retried. Reading is `GET /state` and polling is the
app's business, not the controller's.

## How data flows

**Inventory** round-trips through the database: `useInventory()` fetches once, every edit builds a whole new document and `PUT`s it, React state updates first so the UI is instant, and a failed write shows "Not saved. Your last change is only in this tab." The `PUT` is one transaction — upsert every category and item with its position, then delete what is no longer there — so a half-applied edit is impossible. The client contract has not changed through two storage moves (file → Mongo → Postgres); only `server/` has ever known where the data lives.

**Bills** go one way. The form validates with the same `normalizeBill` the API uses (so the error appears next to the field, not after a round trip), `POST`s, and shows the returned per-line verdicts. Nothing is edited after the fact — a wrong bill is a new bill.

**Analytics** fetches `/api/analytics` once and then recomputes the whole report **in the browser** from the returned `lines` whenever the date filter changes, by calling the same `analyse()` the server called. One code path, no refetch, and the stat tiles can't disagree with the charts.

**Tags** live on inventory items, not on bills. Grouping spend by tag is a join done on the client between `lines[].itemId` and the current inventory — the page already holds both — so re-tagging an item immediately changes the history, which is the point of tagging things after the fact. An item can carry several tags, so tag shares overlap; the card says so.

**Home control** reads those same payloads: inventory for low stock, `/api/bills` for recent bills, `/api/subscriptions`, and `/api/settings` for whether the database answered and which non-secret target it is aimed at. It adds no route.

## The price maths

**One base unit per metric.** `lib/units.ts` reduces mass to kg, volume to L and countables to pieces (a dozen is 12). A unit it doesn't recognise — pack, bottle, strip, ream — becomes *its own base*, so a price per bottle is never compared with a price per kg. That is what makes "500 g for ₹60" and "1 kg for ₹110" comparable, and it is what the **lowest price** is computed over: within a bill, two sizes of the same item get the cheaper one flagged; across bills, today's price is compared with that item's best and last.

**An item's base can change.** If something is bought by weight most of the time and "by the pack" once, the base with the most *purchases* wins (not the most money — one bulk sack shouldn't redefine the item) and the odd-base purchases drop out of that item's price history.

**Inflation** is reported three ways, because they answer different questions:

- *Per item*: first recorded price to latest, plus an annualised figure — but only when the two prices are at least 30 days apart, since annualising a three-week sample produces nonsense.
- *Average*: the plain mean across items ("how much did a typical item move") and the spend-weighted mean ("how much did my bill move" — 40% on cardamom matters less than 8% on rice).
- *Basket index*: spend-weighted, first month = 100. An item joins the index from the month of its first price, and its last known price is carried forward through months it wasn't bought in — otherwise the index would track what we happened to shop for rather than what things cost.

**Projection** is a least-squares trend over the monthly totals, extended three months, clamped at zero, falling back to the mean until three months exist.

**Deviation** comes in two forms: the month's spend against the mean of the three months before it (the stat tile), and each repeat purchase against that item's own running average price (the scatter).

## Charts

Built with the data-viz method: form first, colour last, validated rather than eyeballed.

| Card | Form | Why |
|---|---|---|
| Spend over time | 2-series line, projection dashed | trend over time; the dash marks "not measured yet" |
| Where the money goes | donut, 5 slices + folded "Other" | part-to-whole at a glance; past 6 segments a pie stops being readable |
| Price index | single line + reference line at 100 | one series is the point, so no legend box |
| Deviation per purchase | scatter, bubble area = line cost | position carries the deviation, size carries the money at stake |
| One item’s price (drawer) | single line, dots per purchase | every purchase is a real event worth marking; no legend, the title names it |

The series uses the page's own colours. Slot 0 is the accent emerald and slot 1
is the warn amber, so the spent line, the price line and an "at or below" mark
are the same green as the sidebar, and a projection or an "above usual" mark is
the same amber as a warning tile. Three quieter companions (slate, clay, khaki)
fill the donut; the folded tail is stone and named in the legend. Every named
light slot is at least 5:1 against white. Each chart still has a legend and a
table twin behind "Show table".

The scatter encodes the same split as **shape** — triangle for "paid more",
circle for "paid at or below" — and names it in the legend. Each point carries
a 24px transparent hit area so a small dot is still catchable.

## Decisions, and what they cost

- **`DB_SELECT` picks SQLite, MongoDB or Supabase.** One process owns the data whichever it is, and the pages never know which. Cost: the selected database has to be reachable, and a household app follows whichever host that line names. Mongo replaces a category as one document; Postgres and SQLite keep the same data in tables. Switching `DB_SELECT` does not copy data across.
- **SQLite runs on Node's own `node:sqlite`, not a driver package.** It ships in Node 22.5+ and this project already pins Node 24, so the standalone option costs no dependency, no native build and no install step — which is the only reason it is worth having a third driver at all. Cost: it is the newest of the three APIs, and a household on an older Node cannot use that option (`doctor` checks the version first).
- **SQLite stores money as `real`, and arrays and maps as JSON text.** Every figure here is computed as a JavaScript double in tested `lib/` code, so storing paise as integers would make one driver disagree with the other two about what a price is. Tags, modes, people, an RSVP map and a comment thread are read and written whole and never queried into, so JSON text loses nothing. Cost: no SQL-side sum of a column is exact to the paisa, and no query can filter inside those columns. Both are fine until this becomes a ledger.
- **The SQLite file is the backup.** No dump format, no export route: copy `data/homesystem.db` and you have the household. Cost: copying it while the API is writing can catch a half-finished transaction, so copy it with the API stopped, or use `sqlite3 .backup`.
- **`bill_items.item_id` is deliberately not a foreign key.** Deleting an inventory item must not delete what you paid for it: the purchase history is the only record that outlives a deleted item or category, and it is what a lost category was once rebuilt from. Every other relationship is a real foreign key with `on delete cascade`.
- **Row-level security is on, with no policies.** Supabase exposes PostgREST on every project, so tables left open are readable by anyone holding the publishable key. RLS with no policies denies that outright, while this app's own connection — which authenticates as the database owner, not through PostgREST — is unaffected.
- **Positions are explicit columns.** `categories.position` and `items.position` keep the tab and row order the UI relies on; Postgres has no inherent row order to borrow.
- **The analytics route scans every bill on each request.** Right at household scale (a decade of weekly bills is a few thousand small documents) and it keeps the maths in one tested place instead of an aggregation pipeline. If it ever gets slow, cache the payload and invalidate on POST.
- **Bills are write-once.** No edit, no delete route. A mistake is corrected by entering a correcting bill. Cheap now; add a `DELETE` when it actually bites.
- **Seeding is an explicit command, never automatic.** `pnpm seed` writes the starter inventory and eight months of invented bills, refusing a non-empty database unless `--clear`. The bill prices are made up, every demo bill is noted as such, and the inventory passes through the same validation the API uses so seed data can't be a shape the app would reject.
- **The whole inventory document is PUT on every edit, last writer wins.** Two tabs editing at once lose one of the edits. Marked in `server/index.ts`.
- **Optimistic save with no retry queue.** One banner, no spinner, no queue.
- **Shopping ticks live in component state** (`picked` in `BuyNext`). They belong to one trip, not to the inventory, so they are deliberately lost on reload.
- **No auth, no multi-user.** It runs on the home network.
- **`newId()` is `Math.random().toString(36)`.** Collision risk is irrelevant at a few hundred items.
- **No NAS or machine metrics.** Home control only shows checks the app can make: the page loaded, `/api/settings` answered, and the database health already on that payload (target with the password stripped, plus ok / error). Disk, shares, and power are listed as not connected. There is no new route for them. Devices are the exception and have their own page, because an edge controller is a thing that actually answers.
- **Devices are reached through an edge controller, never directly.** One box on the LAN speaks Zigbee, Tuya, Modbus, IR or a GPIO relay and answers three HTTP routes; the app integrates once instead of once per vendor, no device credential is ever in this app, and a protocol change is a change on the controller. Cost: the household has to run that box, and nothing works without it — which is why `scripts/edge-sim.mjs` ships as a working one.
- **A token is named, not stored.** A controller row carries `tokenEnv` (`EDGE_TOKEN` by default) and the API reads that key when it calls out, so a secret is never in the database, never in a backup of it, and never sent to the browser. Cost: adding a controller is two steps — the row, and the key in `.env`.
- **Live readings are never stored.** `/api/devices/state` reads through the controllers on every request (with a 1.5s coalescing cache) and nothing is written down. A temperature is true for a few seconds; a stored one is a lie with a timestamp. Cost: no history and no charts of the house, which is the next thing somebody will want — it needs a time-series table and a writer, deliberately not started.
- **Polling, not a push feed.** Every few seconds per open page, paused while the tab is in the background. An MQTT or WebSocket feed is fewer bytes and faster, but it needs a connection held open through the API, a broker, and reconnection logic, and nobody in a house notices five seconds. `GET /state` is already the shape a push feed would deliver.
- **A setpoint past a unit's limit is clamped, not refused.** Asking for 90°C of hot water is a mistake about the device, not about the intention, and the safe reading of "as hot as it goes" is the top of its range. The answer says `clamped: true` and the card says "that is as far as this one goes". Everything else — an unknown mode, a control the kind does not have, a monitor-only device — is refused with the reason.
- **One command per press, no retries and no queue.** A failed command is reported and the person presses again, which is what anybody does with a light switch. Retrying a physical action automatically is how a pump runs twice; at-least-once delivery belongs on the controller with an idempotency key, not here.
- **No schedules, no automations, no scenes.** "Cool the bedroom at ten" is a scheduler, and a scheduler that has to survive restarts is a service, not a page. The calendar already holds what the house is doing; wiring one to the other is a deliberate non-goal for now.

## Known issues

- **The data API must be restarted after `DB_SELECT` changes.** Node reads `.env` at startup. A process started against Supabase keeps using Supabase until it is restarted.
- **Phone width was checked at 390×844** on 2026-10-18 with a device-metrics override. Headless Chrome on Windows still clamps a real window to 500px, and a physical phone has not been used. At 390px the sidebar is a top bar and a menu, the page does not scroll sideways, and the subscriptions table (832px wide) scrolls inside its card.
- **The bill form has still not been typed through by hand.** Navigation was clicked in a browser on 2026-10-18 (overview, inventory, home control, settings, subscriptions), including the phone-width override. Earlier states that need a click to reach — the history drawer, the delete confirmation — were rendered by temporarily forcing them and then reverting. The tag → spend join was verified against real data outside the UI.
- **The mise tasks have not been run through mise** — it isn't installed on the machine they were written on. Each task's command was run directly and works (`node scripts/doctor.mjs`, `node scripts/seed.mjs`, `node scripts/dev.mjs`), so what is unverified is the `mise.toml` itself: the tool pins resolving, `[env]` reaching the tasks, and `mise run seed -- --clear` forwarding its argument.
- **Deleting an item is still one click, and bills are still write-once.** The confirmation added in phase 10 covers categories only. Nothing in the app can recover a deleted item or category: the documents are gone, and the only trace is the purchase history, which keeps the item id and name of anything that was ever bought (that is what the lost category was rebuilt from).
- **SQLite has not been run as a household's real database.** Every route, the pages built for production, and the smart home through the simulator were driven against a scratch file on 2026-10-26 (see phase 25), but it has held nothing but seed data for a few minutes. What is unmeasured: a database that has been written to for months, and two API processes on one file — WAL allows one writer at a time and `busy_timeout` is 4s, which is ample for a household and untested under anything else.
- **The smart home has only ever been driven against the simulator.** `scripts/edge-sim.mjs` on 127.0.0.1:8099, verified on 2026-10-26: the registry, live readings, every control, the clamp, the monitor-only refusal, a controller switched off mid-session, and a controller demanding a token the API did not have. No real relay, air conditioner or geyser has been on the other end, so what is unverified is a vendor's idea of the contract — how long a real IR blaster takes to answer, whether it confirms state at all, and what a Tuya bridge does with a setpoint it dislikes.
- **The devices page has no history.** Readings are never stored, so there is no chart of the house and no "when did the pump last run". That needs a time-series table and a writer, and is deliberately not started.
- **A command's effect on a *second* device shows up on the next poll**, not immediately: `send` merges the controller's answer for the one device it touched. A pump that a tank's float switch cuts out reads as still on for up to five seconds. That is the honest order — the app finds out when the controller says so.
- Recharts ships a sizeable client bundle for four charts. Fine for a LAN app; worth a second look if the analytics page ever needs to be fast over a slow link.

## Next up

- **A desktop build is planned and written up**, not started: one Electron installer that carries SQLite with it and can be pointed at MongoDB or Supabase afterwards, Windows `.exe` first, then deb/rpm/AppImage. The phases, the two spikes that come before any app code, and the repo changes it needs (`createApi()` out of `server/index.ts`, injected paths for `.env`, `.mcp.json` and the schema, a compile step instead of type stripping) are in [`electron_migration.md`](../electron_migration.md), which `docs/architecture.md` points at as *Target B*. It is also what makes the smart home work for real, since the API would finally be on the same network as the controllers.
- Nothing is committed to. Candidates, none of them needed yet: expiry dates, bumping inventory stock straight from a saved bill, barcode entry, a `DELETE /api/bills/:id`, per-shop price comparison.
- **Due-date hints on the calendar**, which is the one thing that would make a calendar here better than a calendar anywhere else: `lib/analytics.ts` already predicts a `nextDue` per item for the item report, so "toor dal likely needed" could sit on the month grid as a read-only entry. `analyse()` does not return `nextDue` per item today, so it needs either a new pure helper over `priceHistory()` or a field on `/api/analytics` — not hard, just not done.
- For the smart home specifically, in the order they would actually be wanted: a reading history (a time-series table plus a writer, which unlocks "the geyser ran four hours yesterday" and a cost per device from the watts already being reported); schedules, which are a service and not a page, and should probably read the calendar rather than invent a second one; and a push feed to replace the polling, which is a transport change because `/state` is already the shape a push would deliver.

## Done so far

**Phase 25 — a third database, and a nav that argues for the app.** Two things,
both about standing on its own.

**SQLite** is now the third `DB_SELECT`, through Node's built-in `node:sqlite`
— so the option that needs nothing installed also costs no dependency.
`server/db.sqlite.ts` answers the same interface as the other two drivers,
`sqlite/schema.sql` is `supabase/schema.sql` with SQLite's three fewer types
(`text[]` and `jsonb` become JSON text, `boolean` becomes 0/1, `numeric`
becomes `real`), and the file and its directory are created on first use, which
is why `migrate` is optional there. Every whole-document write is one `begin
immediate` transaction, `pragma foreign_keys = on` makes the schema's cascades
real (SQLite leaves them off), and WAL is on so a page reading does not block
on a bill being written. `prune()` is the shared "delete whatever is no longer
in the document" half of those writes, and it binds one placeholder per id
rather than interpolating, because an id comes from a payload.

Verified against a scratch file on 2026-10-26, not inferred: `migrate`, `seed`
(6 categories, 28 items, 19 bills, 4 people, 6 subscriptions, 9 events, 1
controller, 7 devices), every read route, a whole-inventory round trip
including tags, aliases and patterns, a category added and dropped again (the
prune), a refused payload that left the database untouched, a posted bill
coming back with its price verdict, a calendar entry with RSVPs and a comment,
subscriptions, family, the device registry, a clamped command through the
simulator, and `tools/call low_stock` over MCP. Then the production build was
served against that API and the pages driven in a browser: `/analytics` drew
every chart from it (basket index 103.4, +3.3% spend-weighted over 22 repeat
items), `/inventory` its six tabs, `/devices` its seven devices live through
the simulator. `doctor` reports it as `SQLite <path> · SQLite 3.53.4`. The API's error middleware learned
`SQLITE_CANTOPEN` and friends, so an unwritable or locked file is a `503`
naming the file rather than an opaque `500`. `@types/node` went from 20 to 24
on the way, since `node:sqlite` has no types before that.

That types bump had one consequence worth recognising on sight: pnpm re-links
`next` under a path that includes its peer versions
(`next@16.4.2_@types+node@20._...` became `..._@types+node@24._...`), so the
`next dev` that was already running was left resolving modules from a
directory that no longer existed. The symptom is Next failing to find *its
own* files — `Can't resolve './instant-validation/boundary'` and friends — and
the overlay then reporting `Route "/mcp": Could not validate that a segment in
your UI has instant navigation`, naming whichever page you happened to be on.
Nothing in `app/` is wrong when that happens and `export const instant = false`
would be the wrong fix (it throws in a Client Component anyway). Restart the
dev server: a fresh one logs none of it.

**The sidebar is nested**, and the order is the argument the app makes for
itself: Overview and Analytics at the top level, because the household's own
inflation rate is the thing this exists to work out and it should not be two
clicks away; **Groceries & expenses** (inventory, enter bill, subscriptions)
under it, because that is what feeds the number; **Automations & monitoring**
(smart home, home control) and **Inference engine** (MCP tools & chat) below as
what they are — extensions. A group holding the page you are on cannot be
collapsed out from under you.

The indent cost the rail 21 pixels, and that was enough to break it: a grid
item's `min-width` is `auto`, so "Inventory management" stopped fitting, pushed
the column to 220px inside a 207px rail, and the nav grew a sideways scrollbar
— `overflow-x` computes to `auto` when the other axis is not `visible`, which
is the part that is easy to forget. Reported from the page itself, measured in
a browser (`scrollWidth` 220 against `clientWidth` 207), fixed by putting
`min-w-0` on every box between the rail and the label so a long one truncates
instead of widening the column, and by shortening the label to "Inventory",
which is all it needs to say inside a group called Groceries & expenses. Then
measured again on six pages, collapsed and expanded: 207 against 207.

`/manual` was reordered to match, and its
analytics section now says what the index is actually for: a published rate
averages a basket somebody else chose, and this one is yours and checkable line
by line.

**Phase 24 — the house itself: air conditioning, hot water, pumps.** `/devices`, two tables (`controllers`, `devices`), four routes, two MCP tools and a simulated controller to develop against. The shape of it is the decision: **the app never talks to a device.** Every device belongs to an edge controller — one box on the LAN that already speaks Zigbee, Tuya, Modbus, IR or a relay on a GPIO pin — and that box answers three HTTP routes (`/health`, `/state`, `/command`). So there is one integration instead of one per vendor, no device credential is ever in this app, nothing is opened to the internet, and swapping a Tuya air conditioner for a Zigbee one is a change on the Pi. `scripts/edge-sim.mjs` is a working implementation of that contract with a crude physical model behind it — switch the geyser on and the water actually warms up at about three degrees a minute — so the whole page can be built and demonstrated without owning a relay. It is also the spec a household's own controller is written against.

`lib/devices.ts` holds a **capability table**: one row per kind (air conditioner, thermostat, water heater, pump, tank, switch, sensor) saying which of power, setpoint, mode and fan it has, what its reading means, and the range a setpoint may sit in. The page draws its controls from that table and never from what the controller reported, because what the app is willing to send has to be decidable with the network down — otherwise an unreachable device collapses to a name instead of showing greyed-out controls. `planCommand` is the single gate in front of the hardware and the page, the API and the MCP tool all go through it: a geyser rated to 60 is not asked for 75 (clamped, and the answer says so), an air conditioner is not asked for a mode it does not have (refused with the list), a tank is not asked to switch itself on (refused), and a device marked **monitor only** is refused for everybody — enforced on the server, so hiding the buttons is not the mechanism.

Two things are deliberately *not* stored. **Tokens**: a controller row names an `.env` key (`tokenEnv`, `EDGE_TOKEN` by default) and the API reads it at request time, so the secret is never in the database or a backup of it and never reaches the browser. **Readings**: `/api/devices/state` reads through the controllers on every request and writes nothing down, because a temperature is true for a few seconds and a stored one is a lie with a timestamp. The cost is that there is no history of the house, which is the obvious next feature and needs a time-series table and a writer.

Three things came out of actually running it. Node's `fetch` reports a switched-off controller, a wrong address and an expired certificate identically as **"fetch failed"**, hiding the real code in `cause` — which is useless on a page, so `server/edge.ts` maps them to "Nothing is listening at 127.0.0.1:8099", "does not resolve", and so on, the same way the database errors in `server/index.ts` already did. A controller that is down must not be a `502`: `/api/devices/state` always answers, reporting the controller as down beside the ones that answered, or "the kitchen Pi is off" would hide the four devices that are fine. And the setup form **must not re-sort itself** — it saves on every keystroke, and sorting the stored document by room would move the row out from under the cursor, so `normalizeDevices` keeps insertion order and `byRoom` sorts only on the way to the screen. The same bug as the calendar's blank title, found before it shipped this time.

**Phase 23 — the overview answers "what is on today?".** The front page counted tins and said nothing about the day, so the calendar was a click away from the first question anyone asks it. `/` now opens with **Today** (that date's entries, earliest first, an all-day one leading) and **Coming up** (the next six from tomorrow on, each labelled by `whenLabel` — Tomorrow, in so many days, or the plain day/month). Both are read-only lists that link to `/calendar`: there is no deep link to a single entry, because the calendar page holds the open entry in local state, and inventing one to serve two summary rows would have been the larger change. `whenLabel` moved out of `app/calendar/page.tsx` into `lib/calendar.ts` rather than being copied, and grew a guard on the way — the original read `in -2 days` for a past date, which the calendar page never showed it because it only ever fed it upcoming events. Today is still read in an effect, not during render: a clock read while prerendering bakes the build date into the page, which is the same `cacheComponents` rule phases 6 and 11 ran into.

**Phase 22 — the long wait, and what it was hiding.** `POST /api/chat` had been failing with a bare `Internal Server Error` and a response body DevTools would not even show. It was not the API: its error middleware logs every 500 and the log was clean. It was **the dev proxy in front of the rewrites**, which gives up after 30s (`proxyTimeout || 30000` in `next/dist/server/lib/router-utils/proxy-request.js`) and answers plain text. A reasoning model with two tool rounds takes 11-30s, and one measured turn took 71. Three numbers now stack deliberately: a 90s timeout per model call, a 110s budget for the whole turn (rounds already running finish, none is started past it), and `experimental.proxyTimeout` at 150s above both — so a slow provider comes back as a legible 502 or a part-way answer, never as the proxy's opaque 500. The client also now says "the data API did not answer" when a reply has no JSON in it, because that is the proxy talking and not the API.

**Chat history**, while we were in there: a `chats` collection keyed by day (`lib/chat-log.ts`), written by the API at the end of a turn and read back through a day picker in the chat header. Reasoning traces and tool-call ids are dropped on the way in — large, provider-specific, and meaningless a day later. Asking something while reading an old day starts today's thread rather than appending to one already written.

**Two CSS loaders** from uiverse.io (both MIT, both recoloured to the theme's tokens): Nawsome's nine-box choreography for the one wait long enough to deserve watching — the model writing, with the seconds counted beside it — and elijahgummer's bars everywhere else. `Skeleton` keeps its name and its `rows` prop, because fifteen call sites pass it; `rows` now reserves the height rather than drawing grey blocks, so nothing jumps when the data lands. Both stop moving under `prefers-reduced-motion`.

**Subscriptions grew a cost and a cycle**, which is the thing a subscription page is for and which this one had been missing. `cost` plus one of `monthly`/`quarterly`/`yearly`/`weekly`/`one-off`, with `yearlyCost`, `monthlyCost` and `subscriptionTotals` putting them on one scale; the page shows per-month and per-year totals and a per-month figure on each row. A one-off is recorded but kept out of the recurring totals. A fixed set of cycles rather than a number of days: "every 3 months" is a quarter, and a free-form interval would buy nothing and cost a renewal-date calculator. Rows written before the columns existed read as a free monthly subscription.

**Phase 21 — region, and a model that had been retired.** Three things in one go, all of them things that only show up from using the app.

The chat started answering `NVIDIA NIM (Nemotron) refused the request: Gone`. 410 Gone from `integrate.api.nvidia.com` means the model has left the catalogue, and the default here — `nvidia/llama-3.3-nemotron-super-49b-v1.5` — had. `GET /v1/models` with the key lists what an account can actually call; the successor is `nvidia/nemotron-3-super-120b-a12b`, confirmed to emit `tool_calls` before it was made the default. The error message was its own bug: `complete()` parsed the body as JSON and fell back to `response.statusText`, so a non-JSON error body became the single word "Gone". It now reads the body as text first and reports the status, the model and whatever the provider actually said.

**Region, timezone and currency** are settings now (`lib/region.ts`, a **Region** tab). `en-IN` and `₹` were hardcoded in `money.ts` across 46 call sites, so the locale and currency live in one module that the formatters read and `setRegion` fills — the call sites keep their signatures. Lakhs stay lakhs for rupees and become millions for everything else. Timezone feeds `todayISO()`, which means MCP's idea of "today" is the household's and not the server's. Values are validated on save against Intl itself, including the trap that `new Intl.DateTimeFormat("sdfsdf")` does not throw — a well-formed but unknown tag silently falls back, which on screen looks like the setting did nothing, so `supportedLocalesOf` has to be asked as well. The browser applier is a key on `PageMotion` rather than a context: it repaints once, only when the fetched region differs from the defaults, and 46 call sites did not have to become hooks. All three are dropdowns, filled from `Intl.supportedValuesOf` — 418 timezones grouped by continent, 162 currencies with their names — and built in the browser rather than sent by the API, because that is 20KB on a route the sidebar fetches on every page. Whatever is already configured is always offered back, so an unusual tag typed straight into `.env` does not vanish on the next save.

**The chat renders Markdown.** The models were already answering in it and the page was showing the asterisks.

**Phase 20 — /mcp is two tabs.** Asking the data a question and wiring another client up to the same tools are two jobs, and nobody wants both at once, so **Chat** and **Tools & clients** are tabs. The chat gets the whole pane and is taller for it. The tab strip itself moved into `app/ui.tsx` as `Tabs` the moment a second page wanted one — `/settings` had it first, copied is where it would have stayed.

**Phase 19 — the household is data, not configuration.** Who lives here started as `HOUSEHOLD_PEOPLE`, a comma-separated line in `.env`, which was wrong twice over: the calendar points at these people by name, and `.env` is for things the server needs before it can talk to anything. It is now a `family` collection (Mongo) / table (Postgres) behind `GET`/`PUT /api/family`, with `list_family` on the MCP side, and the setting is gone. A person is a name and a role and nothing else — no contact details, no birthdays, because nothing reads them and a field nothing reads goes stale; the obvious next one is a colour for the calendar chips, when the grid actually uses it. Two people may not share a name, since an RSVP is keyed by name and a duplicate would make two people one. `cleanPerson` moved from `calendar.ts` to `family.ts` and the calendar imports it, which is the right direction: events reference people. **Settings became tabs** at the same time — You, Family, Database, Inference, Appearance — because the page had grown past the point where one scroll of cards was readable, and because the family list does not belong under a "Save to .env" button. Two of the five tabs save themselves (family writes per keystroke, the theme never leaves the browser), so the save bar only appears on the three that are `.env`, and a dot marks a tab holding an unsaved change.

**Phase 18 — the calendar entry grows up.** A title and a time was not enough to plan a movie night with. An entry now carries the activity it blocks the day for, an end time (typed, or picked as a duration — the duration is only a way of writing the end time, and only the end time is stored), a venue, a link, the people invited, an RSVP from each of them, a booking status with the name it is reserved under, notes and a comment thread. One flat shape rather than a type per activity: a movie's theatre and ticket link are a dinner's restaurant and booking link, so `kind` only changes what the dialog calls `venue` and `link` and never what is stored. A seat number would be the point to reconsider that. The detail lives in a native `<dialog>` (`app/calendar/event-dialog.tsx`), reached from the day panel or from "Coming up", so the month grid stays a month grid. Three things fall out of having no sign-in: `people` are names rather than accounts (picked from `HOUSEHOLD_PEOPLE` in settings, or typed — both work), an RSVP is keyed by that name, and a comment is signed with `USER_NAME`, which makes it a signature and not an identity. Links are coerced to `https://` when the scheme is missing and refused unless they are `http(s)` — a `javascript:` href in shared, editable data is an attack on whoever opens it. Overnight events are refused rather than wrapped: one entry is one date, and 23:00–01:00 would mean "minus 22 hours" everywhere a duration is worked out.

Two things came back from using it. The first was a real bug: the dialog saves on every keystroke and `normalizeCalendar` demanded a title, so clearing the title to retype it was rejected and the field appeared frozen — `normalizeInventory` had already solved that for item names, and the calendar now follows it. The second was the shape of the day panel: an add form sitting permanently under the list reads as part of the day, so it went behind an **Add** button, and the empty day says what to press. `createdBy` arrived at the same time: the author gets the fields, everyone else gets the same detail as text with the RSVP buttons and the comment box still live. It is a courtesy and not a permission — `canEdit` compares two strings from settings, and `PUT /api/calendar` still takes an edit from anybody. Authentication is what turns it into a rule.

**Phase 17 — the shared calendar.** `/calendar`, an `events` collection/table, `GET`/`PUT /api/calendar`, and two more MCP tools (`list_events`, `add_event`) so the chat window can answer "when is the next movie night". A date is stored as `yyyy-mm-dd` and a time as `HH:MM`, both without a timezone, so nothing is ever converted; the month grid walks UTC midnights purely as a calendar with no clocks in it, which keeps a day exactly 86400000ms across a DST change. **No recurrence** — that is RRULE, timezones, DST and exceptions to a series, and `lib/calendar.ts` carries the reason and the upgrade path in a `ponytail:` comment. In Postgres the columns are `on_date` and `at_time` because `date` and `time` are type names, and `at_time` is text because `''` means all day, which is not a time. `who` is free text: with no sign-in there is nothing to take an author from, so the field is a label, not an identity.

Writing the local-date helper turned up a real bug next door. `today()` in `lib/bill.ts` was `new Date().toISOString().slice(0, 10)`, which is **UTC** — in IST that is still yesterday until 05:30, so between midnight and half five a bill dated today was rejected as "dated in the future". `pnpm seed --clear` hit it first (it builds its dates from local parts, and the last demo bill is today's), but the bill form had the same hole for anyone entering a receipt late at night. `today` is now `todayISO` from `lib/calendar.ts` — one implementation for both — and a test pins it with a local-parts date that a `toISOString()` version fails anywhere but UTC. `seed.mjs` also seeds six subscriptions and nine calendar entries either side of today, so `/subscriptions`, `/calendar` and `/control` are no longer empty after a fresh seed.

**Phase 16 — motion, home control, and a phone layout.** GSAP is loaded with a dynamic `import()` from `app/page-motion.tsx`, one wrapper around the page pane, so it stays out of the server bundle. A navigation leaves with `power2.in` (opacity and a few pixels of translate, 200ms) and enters with `power2.out` (280ms). `prefers-reduced-motion` skips both and the pane stays visible. Tweens are killed on cleanup; a second navigation while a leave is already underway swaps to the newest page instead of chaining fades. `app/loading.tsx` is the route skeleton. **Home control** (`/control`) lists low stock, recent bills, and subscriptions from the existing hooks, and whether the data API and the selected database answered. It links to the page that can change each of those, and it says NAS shares, volumes, and power switches are not connected. On a narrow screen the sidebar is a top bar with a menu; wide tables scroll inside their cards.

**Phase 15 — chart colours follow the page.** Light-theme charts were a blue / orange / mint / yellow / pink set, three of which sat under 3:1 on white and none of which were the emerald or amber used everywhere else. The series is now those two tokens plus slate, clay and khaki. The palette also follows the theme toggle (`data-theme`), not only the operating system.

**Phase 14 — compact page matrix.** Every page uses the same shell: the main pane is full width with compact padding, and the content is a two-column grid (`PageGrid` in `app/page-frame.tsx`). Headers, filters, add forms and empty messages sit inside cells, so a page with no rows still shows its controls. Overview, inventory, bills, subscriptions, analytics, settings, the manual and MCP all follow it. The sidebar user block stays pinned to the bottom.

**Phase 13 — `DB_SELECT`.** The API can talk to either database. `.env` sets `DB_SELECT` to `supabase` or `mongodb`; `server/db.ts` forwards every call to `db.postgres.ts` or `db.mongo.ts`. Mongo stores one document per category (items embedded, `order` for tab order) and one document per bill, which is the shape the local `homesystem` database already had. Subscriptions are a third collection. This machine's `.env` selects MongoDB.

**Phase 12 — Supabase.** MongoDB replaced by Postgres. Four tables in `supabase/schema.sql` (`categories`, `items`, `bills`, `bill_items`), every query in `server/db.ts` on the `postgres` driver, `PUT /api/inventory` as one transaction with explicit `position` columns, row-level security enabled with no policies, and `bill_items.item_id` left without a foreign key so deleting an item keeps its purchase history. Migrate, seed and doctor moved with it; the `mongodb` dependency is gone. The pricing logic in `lib/` was not changed. The direct `db.*` host is IPv6-only and does not resolve from this machine, so `.env` uses the transaction pooler in ap-northeast-2 (port 6543). Schema applied there on 2026-10-18; the tables were empty afterwards.

**Phase 11 — JSON import, a copyable schema, and `.env`.** `POST /api/bills` now also takes an array (`normalizeBills`), and `/upload` grew an import card: pick a `.json` file, validated in the browser by the same function the API uses so the error names the bill rather than the request, plus a **Copy sample** button and a `<details>` field reference showing the exact shape. The sample is a real import, not an illustration — a test parses it through `normalizeBills` and asserts the 250 g line prices at ₹528/kg. Configuration moved into `.env`. One bug caught before it shipped: the sample built its dates with `today()` at module load, which is a clock read inside a prerendered client component — the same `cacheComponents` error the bill form hit in phase 6. The date is a parameter now, defaulting to a fixed one for the prerender and taking the page's own bill date after hydration.

**Seed data.** Groceries, Cleaning, Bath & utilities, Games, Stationery, Wellness & health — 28 items with rooms, units and minimums.

**Phase 10 — confirm before deleting a category.** One click used to delete a category and every item in it, with no undo and no history to recover from (which is exactly how a category got lost). The button is now two-step: the first click turns it into “Delete <name> and its N items?” with Delete and Cancel, switching tabs abandons it, and nothing is written until Delete is pressed. Inline rather than a `confirm()` dialog or a modal — it names what will be lost, in place, without blocking the page.

**Phase 9 — mise tasks.** `mise.toml` pins Node 24 and pnpm 12.14.0, holds the Mongo and port settings in `[env]`, and defines `setup`, `doctor`, `seed`, `develop`, `check` and `build`. `scripts/doctor.mjs` is the interesting one: it checks the Node version against what type stripping needs, pnpm against the `packageManager` pin, the key packages, Mongo's reachability and version, whether the database has been seeded, and whether the two ports are free — exiting 1 only for things that actually block a run. Two bugs in the first cut of it, both found by running it: the port probe bound `127.0.0.1`, which on Windows succeeds even when a server already holds `0.0.0.0`, so it called busy ports free; and passing argv alongside `shell: true` trips a Node deprecation warning.

**Phase 8 — per-item history.** The price series was always stored; now you can look at one item's. A chart-line button on every inventory row opens a native `<dialog>` (Escape, focus trapping and the backdrop come free) showing: how many times it has been bought and since when, when it was last bought, the average gap between purchases and the next due date, total spent and total quantity, a line of the price per base unit for every purchase with the average as a reference line, a table of every purchase (date, shop, quantity, paid, per-unit, with the best price marked), and a per-shop ranking by average price. `itemReport()` in `lib/analytics.ts` computes it, matching purchases on inventory id *and* on name so free-typed bills still line up. The analytics payload is fetched lazily — only once a history is first opened — and the drawer is a `next/dynamic` import so the chart library stays out of the inventory page's initial load.

**Phase 7a — `agentation`.** Installed as a dev dependency and mounted in `app/layout.tsx` through `app/agentation.tsx`, which renders nothing outside development. Click-to-annotate toolbar in the bottom-right. Not wired to its MCP server: that needs `npx -y agentation-mcp server` configured on the agent side and `endpoint="http://localhost:4747"` on the component.

**Phase 7 — everything in the database.** The inventory moved off disk into Mongo (`categories`, one document per category, `_id` = the category's id, `order` for the tab order, index on `items.id`). `GET`/`PUT /api/inventory` moved from the Next route handler to Express, so Next now has no route handlers at all and every `/api/*` path is rewritten; `app/api/` and `data/` are gone. `normalizeInventory` was written as the new trust boundary — the old route only checked that `categories` was an array — and `pnpm seed` now seeds the starter inventory as well as the bills, from `scripts/starter-inventory.mjs`. Verified end to end: GET, a PUT that adds a tag, a PUT that drops a category (the document is deleted), a PUT that restores it (order intact), and two rejected payloads that left the database untouched. Tests: 24.

**Phase 6 — bills, prices and analytics.**

- `lib/units.ts`: unit table and per-base-unit pricing, with unknown units kept as their own base.
- `lib/bill.ts`: the bill shape, full field validation, and the price verdict shared by the form and the API.
- `lib/analytics.ts`: monthly spend, trend projection, month deviation, price history, per-item and average inflation, the basket index, per-purchase deviations and the price book — all pure.
- `server/`: Express 5 with a lazily-connected Mongo client, indexes on `date` and `items.key`, three routes, and a 503 that names the database when Mongo is down.
- `next.config.ts`: rewrites for the two bill paths; `scripts/dev.mjs` runs both processes with one `pnpm dev` (spawning through `process.execPath`, because spawning the `.cmd` shims without a shell fails with EINVAL on Windows).
- `/upload`: bill entry with a live per-base-unit price per line, best/last comparison, a "cheapest size on this bill" flag when the same item appears twice, client-side validation through the same `normalizeBill`, and a recent-bills list.
- `/analytics`: date-range filter row, four stat tiles, the four charts with legends and table twins, and a biggest-price-moves table.
- Tags: `tags?: string[]` on `Item`, a `TagEditor` chip field in each inventory row with suggestions from tags already in use, and spend-by-tag on the analytics breakdown.
- `scripts/seed.mjs` for demo bills; `"type": "module"` so the `.ts` server and scripts run directly.
- Tests grew from 2 to 21, covering units, bill validation and every analytics function.

**Phase 5 — Buy-next write-back fix.** `BuyNext` used to write back the *flattened* object `lowStock()` produces, so changing a quantity from the Buy-next tab persisted the view-only `category` and `categoryId` fields onto the item. It now passes the new quantity up as a number and the page applies it to the stored item, so no derived field can reach the file; the two stray keys were stripped from `data/inventory.json`.

**Phase 4 — overview.** Counter strip, "Buy next" preview capped at six rows, empty states for both pages, loading skeletons.

**Phase 3 — inventory UI.** Category tabs with counts, Buy next tab with picked-off checkboxes and "Copy list" to the clipboard, inline rename of items and categories, room field, `Stepper` for counts, per-item minimum, delete item and delete category, add-item and add-category forms.

**Phase 2 — model and storage.** `Item`/`Category`/`Inventory` types, `isLow`/`lowStock`/`totals` in `lib/inventory.ts`, `GET`/`PUT` route over `data/inventory.json`, `useInventory()` hook with optimistic save and an error banner.

**Phase 1 — shell.** Next.js 16 app scaffolded, stock boilerplate stripped, Tailwind 4 wired via Turbopack, colour tokens and dark mode in `globals.css`, sidebar + main layout, Geist fonts.

## Where the numbers come from

Audited on 2026-10-18 against MongoDB, before the cutover to Postgres. The client fetches and `lib/` have not changed since, so the static half — no mock data in the pages — still describes the app. The empirical half has not been repeated against Supabase: `server/db.ts` has never executed a query. The write-up below is the record of that Mongo check, not a verification of the current database.

**Statically.** The only `fetch` calls in the client are `/api/inventory`
(`use-inventory.ts`), `/api/analytics` and `/api/bills` (`use-api.ts`,
`upload/page.tsx`). The server reads nothing but the two Mongo collections. The
array literals left in `app/` are the nav links, the date-range presets, the
axis tick steps and `COMMON_UNITS` (a datalist of unit suggestions for the bill
form) — interface, not content. No mock, sample or fallback dataset exists
anywhere in `app/`, `lib/` or `server/`; the numeric `?? 0` defaults are
empty-series guards that render as ₹0, not stand-ins for missing data.

**Empirically.** Pointed the API at an empty database (`MONGODB_DB=homesystem_probe`)
and loaded every page: Overview showed 0/0/0/0, Inventory had no tabs at all,
Analytics rendered no charts and no stat tiles, and the bill form had no shop or
item suggestions and a ₹0.00 total. Nothing that looked like data survived an
empty database. Then wrote a single canary category and two canary bills
*directly into Mongo*, bypassing the UI, and every figure moved to match them:
1 category / 1 item / 1 running low, ₹176 spent, ₹88 per bill, +28.6% basket
inflation (77 → 99 per jar), a one-slice pie at 100%, and August gap-filled as
₹0 between the two bills. Probe database dropped afterwards.

**The one nuance:** what `pnpm seed` writes is invented — the bills, the six
subscriptions and the nine calendar entries alike. They are real database rows
and everything on screen is genuinely derived from them, but they are not real
purchases or real plans; every bill is noted "demo data" and so is every
calendar entry, and `mise run seed -- --clear` plus your own entries replace
them. The starter inventory is likewise seed data in `scripts/`, read once at
seed time and never again.
