# Home System

Household inventory, bill entry and price analytics. Next.js 16 renders the
pages, Express serves every `/api/*` route, MongoDB stores all of it.

```bash
mise run setup      # toolchain + dependencies
mise run doctor     # check Node, pnpm, packages, MongoDB and the ports
mise run seed       # starter inventory + demo bills (-- --clear to replace)
mise run develop    # pages on :3000, data API on :4000
```

Without mise (`winget install jdx.mise`), the same things are `pnpm install`,
`pnpm doctor`, `pnpm seed`, `pnpm dev` and `pnpm check`.

MongoDB is expected at `mongodb://127.0.0.1:27017` (`MONGODB_URI` to change it),
database `homesystem`. Nothing works without it, and an empty database means an
empty app until `pnpm seed` runs.

- `/` — counters and what to buy next.
- `/inventory` — a tab per category (one Mongo document each); an item joins **Buy next** when its count reaches its minimum. Tag items here, or open a row’s chart button for its full purchase history.
- `/upload` — enter a bill; each line is priced per kg / litre / piece and compared with what it used to cost.
- `/analytics` — spend, projection, deviations and price inflation.

Architecture, the API, the price maths, decisions, progress and known issues:
[`docs/README.md`](docs/README.md).
