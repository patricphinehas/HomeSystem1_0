# Home System

Household inventory, bill entry and price analytics. Next.js 16 renders the
pages, Express serves every `/api/*` route, and `.env` chooses the database.

`DB_SELECT=mongodb` uses the local MongoDB (`MONGODB_URI`, database `MONGODB_DB`).
`DB_SELECT=supabase` uses `DATABASE_URL`. Nothing shows data until that database
is reachable, and an empty one means an empty app until `pnpm seed` runs.

```bash
mise run setup      # toolchain + dependencies, creates .env if missing
mise run doctor     # check Node, pnpm, packages, the selected database, ports
mise run migrate    # Postgres schema, or Mongo indexes
mise run seed       # starter inventory + demo bills (-- --clear to replace)
mise run develop    # pages on :3000, data API on :4000
```

Without mise (`winget install jdx.mise`), the same things are `pnpm install`,
`pnpm run doctor`, `pnpm migrate`, `pnpm seed`, `pnpm dev` and `pnpm check`.
`pnpm doctor` is pnpm’s own command and does not run this project’s checks.

- `/` — counters and what to buy next.
- `/inventory` — a tab per category; an item joins **Buy next** when its count reaches its minimum. Tag items here, or open a row’s chart button for its full purchase history.
- `/upload` — enter a bill; each line is priced per kg / litre / piece and compared with what it used to cost.
- `/analytics` — spend, projection, deviations and price inflation.
- `/mcp` — the household data as MCP tools any client can call, plus a chat window that calls them for you (Ollama, NVIDIA NIM or OpenRouter).
- `/manual` — the user manual, page by page.
- `/settings` — user, database, inference engine and theme. Writes `.env`.

Architecture, the API, the price maths, decisions, progress and known issues:
[`docs/README.md`](docs/README.md).
