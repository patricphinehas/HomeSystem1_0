# Electron migration: Home System as a desktop app

**Status: phases 0, 1, 2 and most of 5 are built and run; 3, 4, 6, 7 and 8 are
not.** Written 2026-10-26, built the same day. This is the plan for packaging
this repo as one desktop application that installs with its own SQLite database
and can be pointed at MongoDB or Supabase afterwards — Windows `.exe` first,
then Linux (deb, rpm, AppImage) — and, from here on, the record of what
actually happened when it was.

Each phase below says what it is, then what was run. **Built** means it exists
in the repo and was exercised; **not started** means exactly that. The claims
marked **verified** come from this repo's own copy of Next's docs under
`node_modules/next/dist/docs/`; the rest were settled by running them.

| | |
|---|---|
| Electron | 44.9.3, pinned exactly — Node 24.22.0, Chrome 152 |
| Installer | `dist/HomeSystem-Setup-0.1.0.exe`, **186 MB**, per-user NSIS, unsigned |
| Installed size | 755 MB (490 MB of Electron, 263 MB of app.asar) |
| Database | SQLite, in `%APPDATA%/homesystem/homesystem.db`, created on first run |
| Not in it yet | the first-run chooser and backups (phase 3), the API token (phase 4), Linux targets (6), signing and updates (7), CI (8) |

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

## Phase 0 — two spikes, before any app code — **built, both passed**

Both of these could have sunk the design, so they were proven first in a
throwaway Electron project outside the repo.

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

**What was run.** Spike 1: `node:sqlite` loads in Electron's main process and
exports `DatabaseSync, Session, StatementSync, backup, constants`. It opened
the repo's own seeded file (20 bills, 90 bill lines, 28 items, SQLite 3.53.4 —
the same engine version the repo's Node has), created a fresh file under
`userData` with WAL on, foreign keys on and a committed transaction, proved the
`on delete cascade` fires and that a rollback leaves nothing behind. **No
`better-sqlite3`, no native build, no `electron-rebuild`.** One correction to
the plan above: the backup API is `sqlite.backup(...)` at module level, not
`db.backup()` — phase 3 wants the former.

Spike 2: `next({ dev: false })` prepared in ~330 ms inside Electron, served the
production build on one ephemeral loopback port with `/api/*` going to Express
first, and the window hydrated (a sidebar group answered a real click),
client-side navigation kept the document, four Recharts surfaces drew on
`/analytics`, and `/devices` rendered. The custom server is viable; the
standalone route was not needed.

Two incidental findings that shaped the rest: Electron needs a `package.json`
with `main` in the app directory (a bare `main.js` gets "Unable to find
Electron app"), and it warns in the console about a missing Content Security
Policy, which is why phase 2 sets one.

---

## Phase 1 — make the server embeddable — **built**

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

**What was built.** `server/api.ts` holds every route and exports
`createApi()`; `server/index.ts` is now eleven lines that listen on `API_PORT`,
so `pnpm dev` and `pnpm api` are untouched. `server/host.ts` is the single-port
host, runnable on its own (`pnpm host`). `server/paths.ts` resolves `.env`,
`.mcp.json` and `sqlite/schema.sql`, each overridable by an environment
variable (`HOME_SYSTEM_ENV_FILE`, `HOME_SYSTEM_MCP_FILE`,
`HOME_SYSTEM_SQLITE_SCHEMA`) and each read per call, so a launcher that sets
them late is still obeyed. `scripts/build-desktop.mjs` bundles with esbuild,
every bare import left external.

**What was run.** `node server/host.ts` served `/`, `/analytics`,
`/inventory`, `/devices`, `/manual` and `/settings` as 200s and all five API
routes beside them on one port. The compiled bundle (`desktop/dist/host.mjs`,
127 kB, no type stripping involved) served the same. `PUT /api/settings` with
`HOME_SYSTEM_ENV_FILE` pointed at a scratch file wrote to that file and left
the repo's `.env` byte-identical. 90 tests and `tsc --noEmit` clean throughout.

The seed is still a script rather than a callable module; phase 3's menu item
is what needs that, so it was left alone.

---

## Phase 2 — the Electron shell — **built**

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
- `pnpm desktop` builds the bundles and runs the app against the production
  build; `pnpm desktop:dev` runs Next's dev server in the same process.

**What was built.** `desktop/main.ts` and `desktop/preload.ts`, bundled to
`desktop/dist/` — the output moved out of `build/`, because electron-builder
claims that directory as its own resources folder. The window is
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, with
`will-navigate` and `setWindowOpenHandler` confined to the app's own origin and
anything else handed to the OS browser. A Content Security Policy of `'self'`
throughout is set on every response — `connect-src 'self'` being the line that
matters, since it is what a stray script would need to send the household's
data anywhere. There is a single-instance lock, a File/View/Help menu, a log at
`<userData>/logs/main.log` because a packaged app has no console, and the
window's size and position are remembered.

**What was run,** against the real window over the DevTools protocol: the app
came up on a random loopback port with its data in `%APPDATA%/homesystem`; the
preload bridge was there and `window.require` and `window.process` were both
`undefined`, which is context isolation proving itself from the renderer's
side; a sidebar group answered a click; `/analytics` drew four charts from a
seeded database; a link click navigated to `/inventory` without reloading the
document; and the content security policy changed none of it.

**Three bugs that only running it could have found.**

1. `server/db.sqlite.ts` resolved `SQLITE_PATH` once, at import. The desktop
   sets that variable after its own process starts, so the app quietly used the
   repo's `data/homesystem.db` instead of the one in the user's data directory.
   The path is read per call now, and `describeTarget()` reports the file that
   is actually open.
2. The schema path resolved relative to the bundle, which sits one directory
   deeper than `server/` — `desktop/dist/../sqlite/schema.sql` does not exist.
   The desktop now sets `HOME_SYSTEM_SQLITE_SCHEMA` explicitly, which is what
   `server/paths.ts` was for.
3. The window's size was never saved: a close that comes from a quit does not
   always reach the window's own `close` event. It is saved on `before-quit` as
   well now, and the write no longer swallows its error silently.

One thing worth knowing for phase 3: Next loads any `.env` in its project
directory into `process.env` itself. Values the desktop sets before starting
the host still win, because Next does not overwrite what is already there — but
a `.env` shipped beside the program would otherwise fill in every key the
household's own file does not mention.

---

## Phase 3 — first run, and the database the user chooses — **not started**

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

## Phase 4 — close the no-auth hole, on this target only — **not started**

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

## Phase 5 — Windows first — **the installer builds; not yet installed on a clean machine**

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

**What was built.** `electron-builder.yml` (electron-builder 26.18.0, pinned),
`pnpm pack` for an unpacked build and `pnpm dist:win` for the installer. The
icon in `desktop/resources/` is a placeholder drawn from the app's own accent
colour — a house with three rising bars — and is the first thing a designer
should replace. `pnpm dist:linux` is configured for deb, rpm and AppImage but
has never been run; that is phase 6.

**What was run.** The unpacked build (`dist/win-unpacked`) launched, served its
pages, read the SQLite database in `%APPDATA%/homesystem`, reported 19 bills
through `/api/analytics` and drew the analytics charts — **from inside the
asar**, including Next compiling `next.config.ts` out of the archive in 29 ms.
Then `HomeSystem-Setup-0.1.0.exe`, **186 MB**, built clean and unsigned. **It
has not been installed**: that changes a machine, and it is the household's
call rather than the build's.

**Two packaging facts worth keeping.** `.next/dev` holds hundreds of megabytes
of `next dev` leftovers (756 MB here) that the production server never opens —
shipping it made the first package 1.5 GB, and excluding it along with the
build cache took the app archive to 263 MB. And electron-builder treats
`./build` as its own resources directory and excludes it from the app, which is
why the esbuild output lives in `desktop/dist` instead.

---

## Phase 6 — Linux — **configured, never run**

The same config on a Linux runner, three targets covering the distributions
named: **deb** (Ubuntu, Mint), **rpm** (Fedora, openSUSE), **AppImage** for
everything else. Desktop entry and icons, plus a note about the sandbox
requirements some distributions impose on Electron.

---

## Phase 7 — signing and updates — **not started**

A decision, not a default (see above). In cost order: ship unsigned with a
documented SmartScreen warning; sign with an OV or EV certificate; or
distribute only from a release page with published checksums. Auto-update
(`electron-updater` against GitHub Releases) is worth the moving parts only
once there is somebody to update other than the author.

---

## Phase 8 — CI — **not started**

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
- **Size.** Measured rather than guessed: a 186 MB installer and 755 MB on
  disk, most of it Electron itself. If that is too much, the standalone server
  is the next thing to try, with the Windows caveat above.
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

## What to do next

In this order, and the first one is small:

1. **Install the built installer on a clean Windows account** and run phase 5's
   acceptance list against it. Everything above was verified from the repo and
   from `dist/win-unpacked`; an installed copy is the one thing nobody has
   seen.
2. **Phase 3**, which is what makes the app usable by somebody who did not
   build it: a first-run screen, demo data from the menu, a backup that copies
   the file, and a restart offer when the database is switched.
3. **Phase 4**, before this is ever run on a machine with other people on it.
4. Then Linux, then signing, then CI.

## Rough effort

The original estimate was six to seven days: half a day for phase 0, about a
day each for 1 to 3. Phases 0, 1, 2 and the packaging took one sitting between
them, which says more about the groundwork already in the repo — pure `lib/`,
one database facade, a settings page that already writes `.env` — than about
the estimate. What is left is phases 3 and 4, and those are the ones with real
decisions in them.
