# Home System

> Self-hosted household operations — inventory, grocery bills, spend analytics, and a shared family calendar.

**Stack:** [Next.js](https://nextjs.org/) 16 (UI) · [Express](https://expressjs.com/) (API) · MongoDB or Postgres (via `.env`)

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
| Analytics | Monthly spend, projections, deviations, and inflation |
| Calendar | Shared events, RSVPs, bookings, and comments |
| MCP | Household data as MCP tools, plus chat (Ollama, NVIDIA NIM, or OpenRouter) |
| Settings | Profile, region, database, inference engine, and theme |

## Getting started

### Prerequisites

- [mise](https://mise.jdx.dev) (recommended) or **Node 24** and **pnpm 12**
- **MongoDB** or **Postgres** (Supabase-compatible via `DATABASE_URL`)

### Install and run

1. Copy [`.env.example`](.env.example) to `.env`.
2. Set `DB_SELECT` to `mongodb` or `supabase` and fill in the matching connection settings.
3. Run:

```bash
mise run setup      # toolchain + dependencies, creates .env if missing
mise run doctor     # check Node, pnpm, packages, the selected database, ports
mise run migrate    # Postgres schema, or Mongo indexes
mise run seed       # inventory, demo bills, subscriptions and calendar (-- --clear)
mise run develop    # pages on :3000, data API on :4000
```

**Without mise** ([install](https://mise.jdx.dev) · Windows: `winget install jdx.mise`):

```bash
pnpm install
pnpm run doctor    # this project's checks — not pnpm's built-in doctor
pnpm migrate
pnpm seed
pnpm dev
pnpm check
```

The app needs a reachable database. Until you seed, an empty database shows an empty UI.

## Documentation

Deep dive (architecture, API, pricing maths, decisions): [`docs/README.md`](docs/README.md).

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
