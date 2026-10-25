# Home System

> Self-hosted household operations — inventory, grocery bills, spend analytics, and a shared family calendar.

**Your own inflation rate, from your own receipts.** A published figure is an
average over a basket somebody else chose. This works out what *your* basket
did — weighted by what you actually spend, carried forward through the months
you did not buy something, and traceable line by line to the bills behind it —
so "things cost more" becomes a number you can check, and plan a year of
supplies against.

Everything else is there to feed that number or to live off it: what is in the
cupboards and what it cost, the bills behind those prices, the subscriptions,
the shared calendar. The smart home — air conditioning, hot water and pumps,
through an edge controller on your own network — is an extension, and the MCP
tools are another way to ask the same data questions. Both are there so that
one machine in the house can run the lot.

**Stack:** [Next.js](https://nextjs.org/) 16 (UI) · [Express](https://expressjs.com/) (API) · SQLite, MongoDB, or Postgres (via `.env`)

## Screenshots

<p align="center">
  <img src="docs/images/dashboard.png" alt="Overview — stock counters, buy-next list, and categories" width="720" />
</p>

<p align="center">
  <img src="docs/images/analytics.png" alt="Analytics — spend, inflation, and category breakdown" width="360" />
  &nbsp;
  <img src="docs/images/calendar.png" alt="Family calendar with events and RSVPs" width="360" />
</p>

<p align="center">
  <img src="docs/images/inventory.png" alt="Inventory tabs and buy-next checklist" width="360" />
  &nbsp;
  <img src="docs/images/upload.png" alt="Bill entry and recent purchases" width="360" />
</p>

*Demo data shown; run `pnpm seed` after setup to load the same sample household.*

## Features

| Module | Description |
| --- | --- |
| Overview | Stock counters and a **Buy next** list when items hit their minimum |
| Inventory | Category tabs, tags, and purchase history per item |
| Bills | Per-unit pricing (kg, litre, piece) with comparison to past purchases |
| Subscriptions | Renewals, monthly and yearly cost, and who holds or shares each one |
| Analytics | Monthly spend, projections, deviations, and inflation |
| Calendar | Shared events, RSVPs, bookings, and comments |
| Smart home | Air conditioning, hot water, pumps, and sensors through an edge controller on `/devices` |
| Activity | Household activity and what the app can check about the machine it runs on, on `/control` |
| MCP | Household data as MCP tools, plus chat (Ollama, NVIDIA NIM, or OpenRouter) |
| Settings | Profile, region, database, inference engine, and theme |
| Manual | The in-app user manual, in the same order as the sidebar |

## Before you start

Four conditions. `pnpm run doctor` checks every one of them and names the one
that failed.

1. **Node 24, pnpm 12.14** — both pinned in `mise.toml`. Node 22.18 is the
   floor, because `server/` and `scripts/` are TypeScript run through Node's own
   type stripping, with no build step.
2. **`.env` exists** (copy `.env.example`) and sets `DB_SELECT` to `sqlite`,
   `mongodb` or `supabase`. There is no default and nothing starts without it.
3. **That database answers.** `sqlite` needs nothing running — it creates
   `SQLITE_PATH` (default `data/homesystem.db`) on first use; `mongodb` uses
   `MONGODB_URI` and `MONGODB_DB`; `supabase` uses the pooled `DATABASE_URL`.
   No page shows data until it is reachable, and an empty database means an
   empty app until `pnpm seed` runs.
4. **Ports 3000 and 4000 are free** — the pages and the data API.

And two rules worth knowing before the first run:

- **Nothing here is authenticated** — not `PUT /api/settings`, not the MCP
  endpoint, not the calendar. This is a home-network app: keep ports 3000 and
  4000 off the internet.
- **`/devices` needs an edge controller** on the LAN, and the app never talks to
  a device any other way. `pnpm edge` runs a simulated one; every other page
  works without it.

## Which database

One interface, three backings, chosen by one line in `.env`. A switch takes
effect as soon as the API restarts, and **nothing is copied across**: each
database keeps whatever was put into it.

| `DB_SELECT` | Needs | Good for |
|---|---|---|
| `sqlite` | nothing — Node's built-in `node:sqlite` | one machine, one file, no services: the standalone option |
| `mongodb` | a MongoDB on `MONGODB_URI` | a database you already run, on the LAN or on Atlas |
| `supabase` | the pooled `DATABASE_URL` | hosted Postgres, schema in `supabase/schema.sql` |

The SQLite route is the shortest one there is:

```bash
cp .env.example .env        # then set DB_SELECT=sqlite
pnpm install
pnpm migrate                # optional — the file is created on first use anyway
pnpm seed                   # starter inventory, demo bills, subscriptions, calendar, devices
pnpm dev                    # pages on :3000, data API on :4000
```

That writes one file, `data/homesystem.db` (override it with `SQLITE_PATH`),
and that file is the whole household: back it up by copying it, move to another
machine by moving it. Two files appear beside it while the app runs (`-wal`,
`-shm`) — that is write-ahead logging, and they fold back in when the API
stops. The schema is `sqlite/schema.sql`, which is `supabase/schema.sql` with
SQLite's three fewer types; both are `create table if not exists`, so `migrate`
is safe to re-run. `pnpm seed --clear` empties the database first.

## Getting started

```bash
mise run setup      # toolchain + dependencies, creates .env if missing
mise run doctor     # Node, pnpm, packages, the database, the controllers, ports
mise run migrate    # Postgres schema, or Mongo indexes
mise run seed       # inventory, demo bills, subscriptions, calendar, devices (-- --clear)
mise run edge       # a simulated edge controller on :8099, for /devices
mise run develop    # pages on :3000, data API on :4000
mise run check      # the tests
```

**Without mise** ([install](https://mise.jdx.dev) · Windows: `winget install jdx.mise`):

```bash
pnpm install
pnpm run doctor    # this project's checks — not pnpm's built-in doctor
pnpm migrate
pnpm seed
pnpm edge
pnpm dev
pnpm check
```

`pnpm doctor` is pnpm's own command and does not run this project's checks.
`pnpm run doctor` does.

## The pages

The sidebar is in this order, and the order is the argument: the two pages that
answer "what is this costing us?" sit at the top level, what feeds them is
grouped underneath, and the extensions come after that.

- `/` — **Overview**: today's plans, what is coming up from tomorrow on, the counters and what to buy next.
- `/analytics` — **Analytics**: your basket's own price index and inflation rate, spend over time with a projection, where the money goes, per-purchase deviations and the biggest price moves — every figure derived from bills you entered.

**Groceries & expenses**

- `/inventory` — a tab per category; an item joins **Buy next** when its count reaches its minimum. Tag items here, or open a row's chart button for its full purchase history.
- `/upload` — enter a bill; each line is priced per kg / litre / piece and compared with what it used to cost. A JSON import maps a shop's own line names onto your items.
- `/subscriptions` — what renews, what it costs per month and per year, who holds it and who it is shared with.

**Automations & monitoring**

- `/devices` — **Smart home**: air conditioners, thermostats, water heaters, pumps and tank sensors, each behind an edge controller on your own network. **Control** polls live readings and switches things on, off, warmer or cooler; **Setup** is the registry — which controllers exist, what they own, and how far each unit may be pushed. No device credential is ever stored here, and no reading is either.
- `/control` — household activity in one place, plus what the app can actually check about the machine it runs on, and what it cannot.

**And the rest**

- `/calendar` — the shared family calendar: pick a day, add what is planned, then open it for the activity, venue, who is coming and their RSVPs, the booking, tickets and the comments.
- `/mcp` — **Inference engine**: the household data as MCP tools any client can call, plus a chat window that calls them for you (Ollama, NVIDIA NIM or OpenRouter).
- `/settings` — tabs for you, the family, the region (locale, timezone, currency), the database, the inference engine and the theme. Everything but the family list and the theme writes to `.env`.
- `/manual` — the user manual, page by page, in the same order as the sidebar.

## The docs

- [`docs/README.md`](docs/README.md) — the development log: the rules a change
  has to respect, how to run it, the architecture, the API, the edge protocol,
  the price maths, every decision and what it cost, the known issues, and the
  phase-by-phase record.
- [`docs/architecture.md`](docs/architecture.md) — the deployment plan, the
  blockers that stop it working today, and the authentication seam.
- [`electron_migration.md`](electron_migration.md) — the plan for shipping this
  as a desktop app: installs with SQLite, connects to the database of your
  choice, Windows `.exe` first and then deb, rpm and AppImage. Planned, not
  built.
- `/manual` in the running app — the same thing written for whoever lives in
  the house rather than whoever changes the code.

## License

Source-available under the [Functional Source License 1.1](LICENSE) (**FSL-1.1-ALv2**, [Fair Source](https://fair.io/)).

| Use | |
| --- | --- |
| Self-host for personal or internal use | Allowed — free |
| Commercial hosting or competing product | [Commercial terms](docs/licensing.md) |
| Each release, after two years | Becomes [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) |

FSL is not OSI open source; prefer **source-available** or **Fair Source** when that distinction matters.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) for how to participate and report issues safely.
