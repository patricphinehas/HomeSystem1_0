# Contributing to Home System

Thanks for your interest in improving Home System. This project is open source
under the [MIT License](LICENSE).

## Local setup

You need [mise](https://mise.jdx.dev) (or install Node 24 and pnpm 12 yourself).

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

Copy `.env.example` to `.env` and point `DB_SELECT` at a local MongoDB or
Postgres database before you expect to see data. An empty database stays empty
until you run `mise run seed` (or `pnpm seed`).

## Branch and pull request flow

1. Open an issue or comment on an existing one before large changes, so we do not
   duplicate work.
2. Fork the repository (or push a branch if you are a collaborator).
3. Create a branch from `main` with a short, descriptive name (for example
   `fix/calendar-timezone` or `feat/inventory-export`).
4. Make focused commits with clear messages.
5. Open a pull request against `main`. Fill in the PR template.
6. Keep the PR reasonably small; split unrelated changes into separate PRs.

Maintainers may ask for updates before merging. Be kind — see
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Checks before you open a PR

Run the same commands CI runs (no database or secrets required for these):

```bash
pnpm install --frozen-lockfile
pnpm check    # unit tests in lib/
pnpm build    # Next.js production build (includes TypeScript)
```

Optional but useful when you change data or configuration:

```bash
mise run doctor
```

## License

By submitting a pull request, patch, or other contribution to this repository,
you agree to license your contribution under the [MIT License](LICENSE), and you
represent that you have the right to do so. Contributions are voluntary unless
you have a separate written agreement with the project owner.

Questions? Open a [GitHub Discussion](https://github.com/patricphinehas/HomeSystem1_0/discussions)
or email [patricphinehas@gmail.com](mailto:patricphinehas@gmail.com).
