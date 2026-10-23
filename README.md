# Home System

Household inventory, bills, subscriptions, and a shared family calendar — with
price analytics and MCP tools on top. Next.js renders the pages, Express serves
every `/api/*` route, and `.env` chooses the database.

`DB_SELECT=mongodb` uses local MongoDB (`MONGODB_URI`, database `MONGODB_DB`).
`DB_SELECT=supabase` uses `DATABASE_URL`. Nothing shows data until that database
is reachable; an empty one stays empty until `pnpm seed` runs.

## Quick start

```bash
mise run setup      # toolchain + dependencies; creates .env if missing
mise run doctor     # Node, pnpm, packages, selected database, ports
mise run migrate    # Postgres schema, or Mongo indexes
mise run seed       # inventory, demo bills, subscriptions, calendar (-- --clear)
mise run develop    # pages on :3000, data API on :4000
```

Without [mise](https://mise.jdx.dev) (`winget install jdx.mise` on Windows):
`pnpm install`, `pnpm run doctor`, `pnpm migrate`, `pnpm seed`, and `pnpm dev`.
Note: `pnpm doctor` is pnpm’s own command, not this project’s checks.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Counters and what to buy next. |
| `/control` | Low stock, recent bills, subscriptions, and whether the API and database answered. |
| `/inventory` | A tab per category; **Buy next** when count ≤ minimum. Tags and per-item purchase history (chart button on a row). |
| `/subscriptions` | Recurring costs with cycle, plus monthly and yearly totals. |
| `/calendar` | Shared family calendar: plan a day, open an entry for venue, RSVPs, booking, tickets, and comments. |
| `/upload` | Enter a bill; each line is priced per kg / litre / piece and compared with past prices. |
| `/analytics` | Spend, projection, deviations, and price inflation. |
| `/mcp` | Household data as MCP tools, plus a chat UI (Ollama, NVIDIA NIM, or OpenRouter). |
| `/manual` | User manual, page by page. |
| `/settings` | You, family, region (locale, timezone, currency), database, inference, and theme. Everything except the family list and theme writes to `.env`. |

Architecture, the API, price maths, decisions, progress, and known issues:
[`docs/README.md`](docs/README.md). Deployment notes:
[`docs/architecture.md`](docs/architecture.md).
