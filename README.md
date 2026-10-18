# Home System

Household inventory, bill entry and price analytics. Next.js 16 renders the
pages, Express serves every `/api/*` route, Supabase (Postgres) stores all of it.

```bash
mise run setup      # toolchain + dependencies, then paste DATABASE_URL into .env
mise run doctor     # check Node, pnpm, packages, Supabase and the ports
mise run migrate    # apply supabase/schema.sql (seed does this too)
mise run seed       # starter inventory + demo bills (-- --clear to replace)
mise run develop    # pages on :3000, data API on :4000
```

Without mise (`winget install jdx.mise`), the same things are `pnpm install`,
`pnpm run doctor`, `pnpm migrate`, `pnpm seed`, `pnpm dev` and `pnpm check`.
`pnpm doctor` is pnpm’s own command and does not run this project’s checks.

`DATABASE_URL` in `.env` is required — the Supabase dashboard connection string
(Project Settings → Database → URI). Nothing shows data without it, and an
empty database means an empty app until `pnpm seed` runs.

- `/` — counters and what to buy next.
- `/inventory` — a tab per category; an item joins **Buy next** when its count reaches its minimum. Tag items here, or open a row’s chart button for its full purchase history.
- `/upload` — enter a bill; each line is priced per kg / litre / piece and compared with what it used to cost.
- `/analytics` — spend, projection, deviations and price inflation.

Architecture, the API, the price maths, decisions, progress and known issues:
[`docs/README.md`](docs/README.md).
