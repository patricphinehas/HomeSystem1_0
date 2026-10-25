# Electron migration: Home System as a desktop app

**Status: planned, nothing built.** Written 2026-10-26. This is the plan for
packaging this repo as one desktop application that installs with its own
SQLite database and can be pointed at MongoDB or Supabase afterwards. Windows
`.exe` first, then Linux (deb, rpm, AppImage).

Nothing described here has been run. Where a claim comes from somewhere it is
marked: **verified** means this repo's own copy of Next's docs under
`node_modules/next/dist/docs/`, and the Electron version facts come from its
release history, both checked 2026-10-26. Everything else is a decision to be
tested in phase 0.

`docs/architecture.md` is the audit of where this app can run; it calls this
plan **Target B** and points here rather than repeating it.

---

## Why a desktop build

It is the only target where the app is what it claims to be: a household
installs one file, gets a working database with it, and owns everything
afterwards — no account, no hosted database, no service to keep alive. The
inflation figure the app exists to derive is built from that household's own
receipts, and this is the arrangement where those receipts never leave the
house.

It also deletes four of the blockers in `docs/architecture.md` instead of
solving them:

| Blocker in the hosted target | On the desktop |
|---|---|
| 2 — rewrites die in a static export | Next runs for real; no export, no `NEXT_PUBLIC_API_URL` |
| 3 — CORS between two origins | One origin, one port |
| 5 — a public, unauthenticated API | Loopback only, plus a per-launch token (phase 4) |
| 7 — a cloud API cannot reach a LAN controller | The app *is* on the LAN, so `/devices` works |

Blocker 7 is the real prize. `server/edge.ts` calls a private address, so the
smart home only ever works where the API is on the same network as the
controllers. A desktop install is that place, and it is the first time
`/devices` would be driven against real hardware rather than
`scripts/edge-sim.mjs`.

And the dev proxy's timeout (phase 22 in `docs/README.md`) stops existing,
because there is no proxy: Express serves `/api/*` and hands everything else to
Next in the same process.

---

## The shape

```
HomeSystem.exe  (Electron)
 ├── main process
 │    ├── one http server on 127.0.0.1:<ephemeral port>
 │    │     ├── /api/*  → the Express app from server/ (routes unchanged)
 │    │     └── *       → the Next request handler (next({ dev: false }))
 │    ├── DB_SELECT=sqlite by default → <userData>/homesystem.db
 │    └── app menu: open data folder, back up, load demo data, clear, relaunch
 └── BrowserWindow → http://127.0.0.1:<port>/   (sandboxed, no node integration)
```

`<userData>` is Electron's per-user application directory —
`%APPDATA%/HomeSystem` on Windows, `~/.config/HomeSystem` on Linux. It holds
`.env`, the SQLite file and logs. Everything writable lives there and nothing
writable lives inside the installed program, which is what makes a per-user
install possible and an uninstall safe.

One process, one port, one origin. The 14 rewrites in `next.config.ts` are a
dev-and-hosted concern and are simply unused here.

---

## Decisions, with recommendations

These are the four choices that change the work. The recommendation is what
the phases below assume.

1. **How Next is served — in-process custom server, or a spawned standalone
   build?** *Recommendation: custom server.* It is one process, one port, and
   no IPC; the cost is shipping `next` and its SWC binaries. **Verified:**
   Next's custom-server guide states `output: "standalone"` does not trace
   custom server files and the two cannot be used together, and the `output`
   reference states a Windows standalone build that falls back to junction
   points is not relocatable — a packaging hazard. Measure the installer in
   phase 5 and revisit only if the size is unacceptable.
2. **Gate the local port with a token?** *Recommendation: yes* (phase 4). A
   loopback port is reachable by every other process on the machine, and this
   API has no authentication at all.
3. **Code signing now?** *Recommendation: later.* Unsigned means a SmartScreen
   warning on first run — noise for a household, not acceptable for wider
   distribution.
4. **Installer scope.** *Recommendation: per-user NSIS, `oneClick: false`*, so
   it never asks for an administrator and installs without elevation.

The existing `pnpm dev` flow does not change in any of this. Every repo change
below keeps today's behaviour as its default.

---

## Phase 0 — two spikes, before any app code

Both of these can sink the design, so they get proven first in a throwaway
Electron project, not inside this repo.

**Spike 1: `node:sqlite` inside Electron.** Electron ≥41 bundles Node 24 (44.x
is on Node 24.21) and `node:sqlite` has been in Node since 22.5, so
`server/db.sqlite.ts` should work with no native addon and no `electron-rebuild`.
Prove it: `require('node:sqlite')` in the main process, open a file seeded by
`pnpm seed`, read a row back. Two caveats to check while there — the API is
synchronous and will block whichever process opens it, and a bundler may need
`node:sqlite` marked external.

*If it is missing*, the fallback is `better-sqlite3`: a native build per
Electron ABI and a second SQLite driver to keep in step with the first. That is
a different plan, and the point of this spike is to find out before committing
rather than after.

**Spike 2: Next 16 from a custom server inside Electron.** `next({ dev: false })`
over a Turbopack production build with `cacheComponents` on, Express mounted at
`/api`, one port, a `BrowserWindow` pointed at it. Prove `/analytics` draws its
charts (the client components hydrate) and `/devices` reaches the simulator.

**Acceptance for the phase:** a window showing `/analytics` with data from a
SQLite file in `userData`. Nothing else gets written until this passes.

---

## Phase 1 — make the server embeddable

Repo changes only; nothing Electron-specific. This is the refactor that lets
the same code run in both targets.

| Change | Why |
|---|---|
| Split `server/index.ts` into `createApi()` (routes + error middleware, no `listen`) and a thin entry that listens | Today the file ends in `app.listen` and exports nothing, so it cannot be mounted |
| Add `server/host.ts`: one server that mounts `createApi()` at `/api` and the Next handler for everything else | The single-port arrangement, testable from the repo before Electron exists |
| Injected paths for `.env` and `.mcp.json`, defaulting to today's values | `server/settings.ts` and `server/mcp.ts` resolve them as `new URL("../…", import.meta.url)`, which inside an asar is read-only |
| `SQLITE_PATH` keeps its `data/homesystem.db` default; the desktop sets it explicitly | The repo behaves exactly as it does now |
| Compile `server/` + `lib/` to JS with esbuild for packaging | Both rely on Node's type stripping, which is a repo convenience and not something to lean on inside Electron |
| Make the seed callable as a module, not only as a script | Phase 3 needs "load demo data" from a menu, not a spawned `pnpm seed` |

**Acceptance:** `node server/host.ts` serves pages and API on one port from the
repo; `pnpm check` (90 tests) and `tsc --noEmit` stay clean; `pnpm dev` is
unaffected.

---

## Phase 2 — the Electron shell

- `desktop/main.ts` and `desktop/preload.ts`, bundled by esbuild into
  `desktop/dist`. Electron pinned to an exact version.
- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  `will-navigate` and `setWindowOpenHandler` confined to the local origin;
  external links handed to the OS browser.
- A single-instance lock. Two processes on one SQLite file is the one reliable
  way to meet `SQLITE_BUSY`, so a second launch focuses the open window.
- Window size and position remembered in `userData`.
- Menu: Reload · Zoom · DevTools (dev builds only) · **Data** (open folder,
  back up, load demo data, clear data) · Help → the in-app `/manual`.
- `pnpm desktop` runs the shell against `next dev` for iteration;
  `pnpm desktop:prod` runs it against the built output.

---

## Phase 3 — first run, and the database the user chooses

- On first launch, write `<userData>/.env` from `.env.example` with
  `DB_SELECT=sqlite` and `SQLITE_PATH=<userData>/homesystem.db`, then
  `applySchema()`. The file and its directory are created on first use, so
  there is no migration step to explain.
- One first-run screen: **Start empty** or **Load demo data**, so the app is
  never a blank page on day one.
- **Changing database later needs almost no new UI.** Settings → Database is
  already driven by `DB_CHOICES` in `server/db-select.ts` and already writes
  `.env`. The desktop turns the existing "needs a restart" note into an offer:
  *Restart now* → `app.relaunch()`.
- MongoDB and Supabase work from the desktop with no extra code — both drivers
  are bundled and the connection string is just another setting. A **Test
  connection** button on that tab is the one addition worth making.
- Switching `DB_SELECT` still copies nothing across. The desktop should say so
  at the moment of switching, not only in the manual.
- Back up = copy the file: `DatabaseSync.backup()` if this Node exposes it,
  otherwise quiesce and copy, writing `homesystem-YYYY-MM-DD.db` wherever the
  user points. Restore is the same move in reverse, which is the whole appeal
  of the SQLite option.

---

## Phase 4 — close the no-auth hole, on this target only

The API has no authentication, which is fine on a loopback port right up until
you remember that every other process on the machine can reach a loopback port.

- The main process mints a random token per launch, injects it into the
  window's session (cookie, or a header via `webRequest.onBeforeSendHeaders`),
  and `createApi()` refuses anything without it.
- MCP is the deliberate exception, because the point of it is that *other*
  clients call it. A panel shows the endpoint, the token and a copyable client
  config, behind an explicit **allow other apps on this computer** toggle that
  is off by default.
- The project invariants hold unchanged: no device token or secret is stored in
  the database or sent to the browser, `GET /api/settings` answers `set: true`
  and never a value, and live device readings are still never persisted.

**Acceptance:** `curl` without the token gets a 401; the window is unaffected;
an MCP client sending the header works.

---

## Phase 5 — Windows first

- **electron-builder** pinned to 26.x, NSIS target, `oneClick: false`, per-user
  install, app id, icons, output named `HomeSystem-Setup-x.y.z.exe`.
- What ships: the `.next` build output, compiled `server/`, `lib/` and
  `desktop/`, `sqlite/schema.sql`, `supabase/schema.sql`,
  `scripts/starter-inventory.mjs`, and production `node_modules`.
  `asarUnpack` for anything that has to exist as a real file on disk.
- Uninstall asks whether to keep the data folder, and keeps it by default.

**Acceptance:** install on a clean Windows account; launch; load demo data;
enter a bill; watch `/analytics` move; point `/devices` at `scripts/edge-sim.mjs`
and send a command; restart and confirm the data is still there. Then uninstall
and confirm the database survived.

---

## Phase 6 — Linux

The same config on a Linux runner, three targets covering the distributions
named: **deb** (Ubuntu, Mint), **rpm** (Fedora, openSUSE), **AppImage** for
everything else. Desktop entry and icons, plus a note about the sandbox
requirements some distributions impose on Electron.

---

## Phase 7 — signing and updates

A decision, not a default (see above). In cost order: ship unsigned with a
documented SmartScreen warning; sign with an OV or EV certificate; or
distribute only from a release page with published checksums. Auto-update
(`electron-updater` against GitHub Releases) is worth the moving parts only
once there is somebody to update other than the author.

---

## Phase 8 — CI

GitHub Actions on a tag: `tsc --noEmit` and `pnpm check` first, then a
`windows-latest` job and an `ubuntu-latest` job producing the installers as
release artifacts. Nothing gets built by hand twice.

---

## What this does not solve

- **Two copies of the app do not share a database.** A desktop install is one
  machine's. A second machine either points at a MongoDB or a Supabase, or it
  is a second household.
- **There is still no authentication inside the app.** The phase 4 token keeps
  other local processes out; it does not make the calendar's `createdBy` an
  identity. That seam is still the one sketched under *Future: authentication*
  in `docs/architecture.md`.
- **Size.** A custom server means shipping `next` and its SWC binaries; expect
  an installer in the hundreds of megabytes before any standalone optimisation.
  Measure it in phase 5 before deciding whether it matters.
- **The smart home is still only simulator-verified.** The desktop build makes
  real hardware *possible*; it does not make it tested.

---

## Risks, in the order they would bite

| Risk | Where it shows up | What to do about it |
|---|---|---|
| `node:sqlite` unavailable or unusable in Electron | Phase 0, spike 1 | Fall back to `better-sqlite3`, and accept a native build per ABI |
| Next's custom server not viable in a packaged app | Phase 0, spike 2 | Switch to the spawned standalone server, with the Windows relocatability caveat |
| Installer size | Phase 5 | Prune `node_modules`, then consider standalone |
| Type stripping unavailable in the packaged runtime | Phase 1 | The esbuild step, which is in the plan already |
| Two writers on one SQLite file | Phase 2 | Single-instance lock; WAL plus `busy_timeout` 4s is the backstop, and is untested under contention |
| Unsigned installer warnings | Phase 7 | A decision, documented either way |

---

## Rough effort

Phase 0 half a day · phases 1–3 about a day each · phase 4 half a day · phase 5
a day · phase 6 half a day · phases 7–8 a day between them. Six to seven days,
and phases 0–3 are the ones that prove the idea is worth the rest.
