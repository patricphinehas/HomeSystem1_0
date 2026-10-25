# Contributing to Home System

Thanks for your interest in improving Home System. This project is
**source-available** under the [Functional Source License](LICENSE) (FSL-1.1-ALv2).
See [docs/licensing.md](docs/licensing.md) for self-host vs commercial use.

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

<!-- REVIEW FOR PATRIC: Contributor terms below — please read before merging outside contributions. -->

### Contributor terms

By submitting a pull request, patch, or other contribution to this repository,
you agree that:

1. **License.** Your contribution is licensed under the same terms as the
   project: FSL-1.1-ALv2 ([LICENSE](LICENSE)), including the future Apache 2.0
   grant two years after each release that includes your contribution.

2. **Relicensing.** You grant Patric Phinehas Raj and successors the right to
   use, modify, and sublicense your contribution under any license, including
   proprietary or commercial terms, so a paid hosted offering can include
   community improvements without license conflicts.

3. **Authority.** You have the right to submit the work and it does not violate
   any third-party rights.

4. **No expectation of compensation.** Contributions are voluntary unless you
   have a separate written agreement with the project owner.

If you cannot agree to these terms, please do not submit a contribution. For
questions, open a [GitHub Discussion](https://github.com/patricphinehas/HomeSystem1_0/discussions)
or email [patricphinehas@gmail.com](mailto:patricphinehas@gmail.com).

<!-- END REVIEW FOR PATRIC -->
