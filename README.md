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
mise run seed       # inventory, demo bills, subscriptions and calendar (-- --clear)
mise run develop    # pages on :3000, data API on :4000
```

Without mise (`winget install jdx.mise`), the same things are `pnpm install`,
`pnpm run doctor`, `pnpm migrate`, `pnpm seed`, `pnpm dev` and `pnpm check`.
`pnpm doctor` is pnpm’s own command and does not run this project’s checks.

- `/` — counters and what to buy next.
- `/inventory` — a tab per category; an item joins **Buy next** when its count reaches its minimum. Tag items here, or open a row’s chart button for its full purchase history.
- `/upload` — enter a bill; each line is priced per kg / litre / piece and compared with what it used to cost.
- `/analytics` — spend, projection, deviations and price inflation.
- `/calendar` — the shared family calendar: pick a day, add what is planned, then open it for the activity, venue, who is coming and their RSVPs, the booking, tickets and the comments.
- `/mcp` — the household data as MCP tools any client can call, plus a chat window that calls them for you (Ollama, NVIDIA NIM or OpenRouter).
- `/manual` — the user manual, page by page.
- `/settings` — tabs for you, the family, the region (locale, timezone, currency), the database, the inference engine and the theme. Everything but the family list and the theme writes to `.env`.

Architecture, the API, the price maths, decisions, progress and known issues:
[`docs/README.md`](docs/README.md).

## License

Home System is **source-available** under the [Functional Source License 1.1](LICENSE)
(FSL-1.1-ALv2, [Fair Source](https://fair.io/)).

- **Self-host:** use, modify, and run it for yourself or your organization — free.
- **Commercial hosting / competing product:** not covered by FSL alone; you need a
  separate commercial license from the maintainer (see [docs/licensing.md](docs/licensing.md)).
- **Later:** each published version becomes [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
  two years after that version ships.

FSL is not OSI-approved open source. Do not describe the project as “open source”
if you need the strict OSI meaning.

## Contributing

Bug reports, feature ideas, and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for local setup, the PR workflow, and contributor
terms. Please follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues:
[SECURITY.md](SECURITY.md).
