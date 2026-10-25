# Deployment architecture

Target: **pages on GitHub Pages, API on Render, data in MongoDB Atlas**, deployed
by hand. This file is the plan, plus the list of things that stop it working
today.

## Rules and conditions

**Status.** Written 2026-10-18 as an audit and a target, and extended on
2026-10-26 when `/devices` added a blocker of its own. **None of the blockers
below have been changed in the code**, so nothing here describes a deployment
that exists. The app runs on a home network, and that is the only arrangement
it has ever run in.

**Conditions any deployment has to satisfy.** They are not negotiable in the
order they are written, and the first one is the whole reason this file is
cautious:

1. **Nothing is authenticated.** Not the pages, not `PUT /api/settings`, not
   `POST /api/mcp`, not `POST /api/chat`. A public URL in front of this app is
   a stranger's write access to the household data and a stranger's spend on
   your model credits. Either authentication lands first (the seam is designed
   at the end of this file) or the write routes are disabled before the API is
   reachable.
2. **No secret reaches the browser, ever.** `GET /api/settings` answers
   `set: true` and never a value; `externalServers()` strips the query string
   off `.mcp.json` URLs; a database error names the host and never the
   password. Any host that changes this is the wrong host.
3. **`NEXT_PUBLIC_*` is public by definition.** The API URL belongs there.
   Nothing else does.
4. **A device is only reachable from inside the house.** `server/edge.ts` calls
   a private LAN address, so the API has to run somewhere that can route to it
   — see blocker 7. No cloud host satisfies this without a tunnel or a reversed
   direction.
5. **Reversibility.** Every step in **Manual deploy order** is a dashboard
   setting or an env var, and the one-way doors are called out where they are.
   The database is the only copy of the data: back it up before pointing a new
   deployment at it.

**Rules for changing this file.** It is an audit, so it only ever says what was
run. A blocker leaves this list when the code changes, not when a fix is
described, and a blocker that was verified says how. If the topology changes,
the whole topology changes: there is one target in here, not a menu.

For how the app works internally, the rules a change has to respect, and the
development log, see [`README.md`](README.md).

## Target topology

```
  browser
     |
     |  https://<user>.github.io/HomeSystem1_0        static export, no server
     |  ├── HTML/JS/CSS built by `next build`         GitHub Pages
     |  └── every fetch goes cross-origin ──────┐
     |                                          |
     |                                          v
     |                      https://homesystem-api.onrender.com
     |                      Express, server/index.ts, Node 24   Render web service
     |                      ├── /api/inventory /bills /analytics
     |                      ├── /api/subscriptions /calendar /settings
     |                      ├── /api/mcp     (JSON-RPC, tools)
     |                      └── /api/chat ──────────────┐
     |                                   |              |
     |                                   v              v
     |                   mongodb+srv://...mongodb.net   Ollama / NVIDIA / OpenRouter
     |                   MongoDB Atlas M0               whichever CHAT_PROVIDER names
```

Three hosts, three failure domains. The pages host has no server at all, which
is the root of most of the work below: today the browser and the API share an
origin and Next proxies `/api/*` across. On Pages there is nothing to proxy with.

## Blockers — these fail the deploy, in order

### 1. `output: "export"` is incompatible with the current `next.config.ts`

Verified by running it. With the config as it stands:

```
Error: Invariant: PPR cannot be enabled in export mode
```

Both `cacheComponents: true` **and** `partialPrefetching: true` have to go.
Removing only `partialPrefetching` is not enough — `cacheComponents` turns PPR
on by itself and the build fails with the same invariant. With both removed the
export succeeds and writes all ten pages to `out/`.

Cost of removing them: the app loses partial prerendering and the Cache
Components model. Every page here is already `"use client"` and fetches on
mount, so in practice nothing on screen changes.

### 2. `rewrites` do not exist in a static export

`next.config.ts` rewrites fourteen `/api/*` paths to the Express origin. Next's
own docs list Rewrites under **Unsupported Features** for `output: "export"`,
and there is no server on Pages to run them. Silently, every `/api/*` call
becomes a request to `<user>.github.io/api/...` and returns the Pages 404.

The rewrites get deleted and replaced by an absolute API base URL baked in at
build time (`NEXT_PUBLIC_API_URL`). Recounted 2026-10-26: that is **30
hardcoded `/api/...` paths across 15 files**, and it grows with every feature —

```
app/analytics/page.tsx   app/control/page.tsx     app/devices/page.tsx
app/inventory/page.tsx   app/mcp/chat.tsx         app/mcp/page.tsx
app/settings/page.tsx    app/upload/page.tsx      app/use-calendar.ts
app/use-devices.ts       app/use-family.ts        app/use-household.ts
app/use-inventory.ts     app/use-region.ts        app/use-subscriptions.ts
```

which is the argument for routing all of them through one helper
(`app/use-api.ts` already exists and is the natural home) rather than editing
thirty call sites and then forgetting the thirty-first.

### 3. No CORS on the API

`server/index.ts` says, accurately for today: *"the browser only ever talks to
one origin and there is no CORS configuration anywhere."* Once the pages are on
`github.io` and the API on `onrender.com`, every request is cross-origin and
every one is blocked until the API sends `Access-Control-Allow-Origin`. The
`PUT`/`POST` routes also need the preflight (`OPTIONS`) answered.

Allowlist the one Pages origin. Do not use `*` — see blocker 5.

### 4. Render's port is ignored

```js
const port = Number(process.env.API_PORT ?? 4000);
```

Render injects `PORT` and health-checks that port; the app listens on 4000 and
the deploy is marked unhealthy and killed. Read `PORT` first, keep `API_PORT` as
the local fallback. There is also no health route — add a trivial `GET /healthz`
for Render to poll, so a database outage does not read as a dead service.

The start command also needs writing: `package.json` has no production entry for
the API, only `"api": "node --env-file-if-exists=.env --watch server/index.ts"`,
and `--watch` must not ship. Render needs Node 24 (the server is TypeScript run
through Node's own type stripping, no build step).

### 5. Nothing is authenticated, and the API becomes public

This is the one that matters. On a public Render URL, with no auth:

- `POST /api/mcp` exposes `set_quantity`, `add_bill`, `add_event` and
  `set_device` — anyone can write to the household data, and there is no route
  to delete a bill again. `set_device` is the one that reaches past the data:
  it switches a geyser on.
- `PUT /api/calendar` replaces the whole family calendar, and
  `PUT /api/devices` the device registry — a controller address is a URL the
  API will then call.
- `PUT /api/settings` lets anyone rewrite `DB_SELECT`, `MONGODB_URI` and
  `DATABASE_URL`, i.e. repoint the running app at a database they control.
- `POST /api/chat` is an open proxy to whatever model is configured. With
  `OPENROUTER_API_KEY` set, that is a stranger spending your credits.

Today this is all fine because it is localhost-only. The moment it has a public
URL it is not. Either put auth in before the API is reachable (see below), or
deploy with `/api/settings`, `/api/mcp` and `/api/chat` disabled and only the
read routes live.

### 6. `PUT /api/settings` writes a file, and Render's disk is ephemeral

`server/settings.ts` patches `.env` on disk and sets `process.env`. On Render the
write will appear to succeed and will be wiped on the next deploy or restart.
Worse, the settings page is the only UI for the chat provider and keys, so it
would look configurable and silently keep reverting.

On Render, environment variables are the store. Either make the settings page
read-only when a `RENDER` env var is present and tell the user to set them in the
dashboard, or keep the writable settings in Mongo instead of `.env` — but the
database connection string itself can never live in the database, so that part
stays dashboard-only regardless.

### 7. The smart home cannot work from a cloud API

Added 2026-10-26, with `/devices`. This one is not a bug to fix in the code; it
is a property of the topology, and it is the first blocker on this list that the
app is right about and the deployment is wrong about.

An edge controller lives on the household's LAN at something like
`http://192.168.1.50:8080`. `server/edge.ts` calls it from wherever the API
runs. On Render that is a datacentre with no route to a private address, so
every controller reads as "cannot be reached from this machine" and nothing on
the page works — correctly, and with the right message, but uselessly.

Three ways out, in increasing order of how much they cost:

1. **Run the API at home** and the pages wherever. The API is one Node process
   that already has to reach the LAN; this is the arrangement the app assumes,
   and `/devices` is the part of it that genuinely requires it. The cost is a
   machine at home that stays on, and a way in for the browser if the pages are
   hosted elsewhere.
2. **Reverse the direction.** The controller polls the API for pending commands
   instead of being called. That works through any NAT with no inbound rule,
   needs a queue table and an idempotency key per command (two controllers'
   worth of "did that pump already run?"), and makes every command slower by
   half a poll interval.
3. **A tunnel** (Tailscale, Cloudflare Tunnel, WireGuard) from the API host into
   the home network. Least code, one more service to keep alive, and it puts a
   route into the house that has to be looked after.

Nothing here is chosen. Until it is, `/devices` is a LAN feature: with the API
on Render, expect the devices page to be the one thing that does not work, and
expect it to say so by name.

## Smaller things, worth fixing while you are in there

- **Atlas IP allowlist.** Render's outbound IPs are not static on the free plan,
  so Atlas Network Access needs `0.0.0.0/0`. That makes the database password the
  only thing protecting the data — use a long generated one, and a database user
  scoped to the one database, not an Atlas admin.
- **`serverSelectionTimeoutMS: 3000`** (`server/db.mongo.ts`) is tight for an
  Atlas M0 from a cold Render instance. 10000 is a better fit once there is a
  network between them.
- **Render free tier sleeps.** After 15 minutes idle the first request takes
  ~30s. Every client fetch here has no timeout and no retry, so the first page
  load after a quiet spell shows the "could not load" notice rather than a spinner.
  Worth a retry on the first failure, or a paid instance.
- **`mise run migrate`** creates the Mongo indexes; run it once against Atlas
  before the first real use, or the first queries scan collections.
- **`.env` is correctly gitignored** (`.env*` with `!.env.example`) and nothing
  secret is tracked. Verified with `git ls-files`.
- **Secrets never reach the browser.** `GET /api/settings` returns `set: true`
  instead of values for every secret field; `externalServers()` strips the query
  string off `.mcp.json` URLs, so the Supabase project ref is not published.
  Both still hold after the move — keep them that way.
- **SQLite is not an option on Render**, and it is worth saying so before
  somebody tries it: the disk is ephemeral, so `data/homesystem.db` would be
  silently wiped on every deploy and restart, exactly as `.env` is in blocker
  6. SQLite is for the arrangement in blocker 7 instead — the API running at
  home, where it is also the thing that makes that blocker disappear: one
  process, one file, a LAN route to the controllers and nothing else to keep
  alive.
- **Supabase/Postgres stays supported** but goes unused in this topology.
  `DB_SELECT=mongodb` on Render; the Postgres driver costs nothing idle.


## Environment variables, per host

| Variable | Pages (build) | Render | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | — | the Render URL, baked into the bundle at build |
| `PORT` | — | ✅ (injected) | must be what the server listens on |
| `DB_SELECT` | — | `mongodb` | |
| `MONGODB_URI` | — | ✅ secret | `mongodb+srv://...` from Atlas |
| `MONGODB_DB` | — | `homesystem` | |
| `CHAT_PROVIDER` | — | `openrouter` | Ollama is local-only, unreachable from Render |
| `OPENROUTER_API_KEY` | — | ✅ secret | only if chat is exposed at all |
| `OPENROUTER_MODEL` | — | optional | |
| `ALLOWED_ORIGIN` | — | ✅ | the Pages origin, for CORS |
| `EDGE_TOKEN` | — | ✅ secret | only useful if the API can reach the LAN — see blocker 7 |
| `EDGE_TIMEOUT_MS` | — | optional | 4000 suits a LAN; raise it through a tunnel |

`NEXT_PUBLIC_*` is compiled into the JavaScript and is public by definition. The
API URL is fine there. Nothing else is.

## Manual deploy order

1. **Atlas** — create the M0 cluster, a scoped database user, allowlist
   `0.0.0.0/0`, copy the `mongodb+srv://` string.
2. **Render** — new Web Service from the repo, Node 24, build `pnpm install`,
   start the production API command (to be added), env vars from the table, health
   check path `/healthz` (to be added). Deploy, then run the migration once.
3. **Verify the API alone**, before any frontend exists:
   `curl https://<service>.onrender.com/api/inventory` should return JSON, and
   `/healthz` should return 200 while the database is up.
4. **GitHub Pages** — build with `NEXT_PUBLIC_API_URL` set to the Render URL,
   publish `out/`. Add `.nojekyll` or Pages will drop the `_next/` directory.
   If served from a project path rather than a custom domain, `basePath` and
   `assetPrefix` both need setting to `/HomeSystem1_0`.
5. **Set `ALLOWED_ORIGIN`** on Render to the final Pages origin and redeploy.

Step 4's `.nojekyll` and `basePath` are the two that bite silently: without them
the page loads and every asset 404s.

---

# Future: authentication

Not built. Designing for it now costs nothing and keeps the seam in one place.

**The shape that fits this app.** One household, a handful of people, no
self-service signup. That rules out most of the complexity: there is no tenant
model, no roles beyond "in the house" and, for a while, no per-user data at all.

**Where it goes.** One Express middleware in front of the route table in
`server/index.ts`, and nothing in `lib/` — the pure functions never learn about
users. The routes split in three:

- public: `/healthz`
- read: the `GET` routes
- write: `PUT /api/inventory`, `POST /api/bills`, `PUT /api/subscriptions`,
  `PUT /api/calendar`, `PUT /api/settings`, `POST /api/mcp`, `POST /api/chat`

Protect the write set first; it is where all the damage is.

**What it costs the client.** The static export cannot use an HttpOnly session
cookie set by a redirect flow without a server on the pages origin. So either a
bearer token the browser holds (simpler, and fine for a household), or a cookie
with `SameSite=None; Secure` scoped to the API domain and CORS credentials on.
The bearer token is the lazy option and the one that fits GitHub Pages.

**The user already half-exists.** `USER_NAME` and `HOUSEHOLD_NAME` are in
settings and the sidebar renders an avatar and a disabled "Log out" placeholder.
That placeholder is the hook — when auth lands it becomes real, and the settings
fields move from `.env` to a user record.

**The MCP endpoint needs its own answer.** An MCP client is not a browser and
will not do an interactive login. A per-client token in a header is the usual
shape, and `POST /api/mcp` should take that rather than ride on a browser session.

**Do not hand-roll password storage.** If this ever needs more than a shared
household token, reach for a hosted identity provider rather than writing
password hashing, reset flows and session invalidation into this repo.

---

# Appendix: the calendar as a worked example

Built on 2026-10-19, after this file sketched it, and widened the same day into
something you can plan a night out with. What an entry holds, and why it holds
nothing more — no recurrence, no invitations, no timezone, no overnight events
— is in [`README.md`](README.md) (phases 17 and 18) and in `lib/calendar.ts`.
What belongs here is the part that is about deploying it, because the calendar
is the feature where every missing piece of authentication is visible at once.

**Three fields are names rather than people**, and all three are the same
missing piece:

| Field | Today | With a sign-in |
|---|---|---|
| `people[]` | names, from the `family` collection or typed | household members |
| `rsvp` | keyed by that name; anyone can answer for anyone | keyed by the signed-in user |
| `comments[].by` | signed with `USER_NAME`, so a signature | an author |

None of that blocks the feature in one trusted house, and none of it survives
contact with a public URL. The seam is the one the authentication section above
describes: nothing in `lib/calendar.ts` changes, only who the page believes you
are.

**Deploying it changes nothing above.** `/api/calendar` is one more route behind
the same blockers as the rest — the absolute `NEXT_PUBLIC_API_URL` (2), CORS
(3), and an unauthenticated write on a public URL (5). Anyone could fill the
family calendar with whatever they liked, or read where the house will be on
Friday night. It goes in the write set that gets protected first.

**Still worth asking:** if the family already lives in Google Calendar, a link
out beats maintaining this. The one real argument against it is the inventory
tie-in — read-only "toor dal likely needed" entries on the month grid, from the
`nextDue` predictions `lib/analytics.ts` already computes per item. That is a
feature idea, so it lives under **Next up** in the development log and not here.
