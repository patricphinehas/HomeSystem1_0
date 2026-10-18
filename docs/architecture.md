# Deployment architecture

Target: **pages on GitHub Pages, API on Render, data in MongoDB Atlas**, deployed
by hand. This file is the plan plus the list of things that stop it working
today. Written 2026-10-18 as an audit and a target; none of the blockers below
have been changed in the code. The calendar section at the end was a sketch then
and is built now (2026-10-19) — it is described as it stands.

For how the app works internally, see [`README.md`](README.md).

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

`next.config.ts` rewrites eight `/api/*` paths to the Express origin. Next's own
docs list Rewrites under **Unsupported Features** for `output: "export"`, and
there is no server on Pages to run them. Silently, every `/api/*` call becomes a
request to `<user>.github.io/api/...` and returns the Pages 404.

The eight rewrites get deleted and replaced by an absolute API base URL baked in
at build time (`NEXT_PUBLIC_API_URL`). That touches 8 files holding 13 hardcoded
`fetch("/api/...")` calls:

```
app/mcp/chat.tsx      app/mcp/page.tsx      app/settings/page.tsx
app/sidebar.tsx       app/upload/page.tsx   app/use-inventory.ts
app/use-subscriptions.ts                    app/use-calendar.ts
```

Worth routing all of them through one helper (`app/use-api.ts` already exists and
is the natural home) rather than editing eleven call sites and then forgetting
the twelfth.

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

- `POST /api/mcp` exposes `set_quantity`, `add_bill` and `add_event` — anyone can
  write to the household data, and there is no route to delete a bill again.
- `PUT /api/calendar` replaces the whole family calendar.
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

# The shared family calendar

Built on 2026-10-19, after this file first sketched it, and widened the same day
into something you can actually plan a night out with. `/calendar`, an `events`
collection (Mongo) or table (Postgres), `GET`/`PUT /api/calendar`, and the
`list_events` / `add_event` MCP tools.

**What an entry holds.** Date, start and end time, the activity it blocks the
day for, a title, a venue, a link, the people invited, an RSVP from each of
them, a booking status with the name it is reserved under, notes, and a comment
thread. One flat shape, not a type per activity: a movie's theatre and ticket
link are a dinner's restaurant and booking link, so `kind` changes only what the
dialog calls `venue` and `link`, never what is stored.

What the sketch said to leave out was left out:

- **No recurrence.** One `CalEvent` is one occurrence. "Every second Friday" is
  RRULE, which is timezones, DST and exceptions to a series, and it is where
  calendar projects die. `lib/calendar.ts` carries the reason and the upgrade
  path (take `rrule`, expand on read) in a `ponytail:` comment.
- **No invitations, no reminders, no notifications.** An RSVP is somebody
  ticking a box on the page; nothing is sent to anyone.
- **No timezone.** A date is `yyyy-mm-dd` and a time is `HH:MM`, both read as
  local. Movie night is at eight o'clock wherever the reader is, not at an
  instant on a global timeline, so nothing is ever converted. The month grid
  walks UTC midnights purely as a calendar with no clocks in it, which is what
  keeps a day exactly 86400000ms across a DST change. Overnight events are
  refused rather than wrapped — one entry is one date.

**Where authentication would bite.** Three fields are names rather than people,
and all three are the same missing piece:

| Field | Today | With a sign-in |
|---|---|---|
| `people[]` | names, from `HOUSEHOLD_PEOPLE` in settings or typed | household members |
| `rsvp` | keyed by that name; anyone can answer for anyone | keyed by the signed-in user |
| `comments[].by` | signed with `USER_NAME`, so a signature | an author |

None of that blocks the feature in one trusted house, and none of it survives
contact with a public URL. The seam is the same one the auth section above
describes; nothing in `lib/calendar.ts` needs to change, only who the page
believes you are.

**One thing worth knowing about the link field.** It is coerced to `https://`
when the scheme is missing and refused unless it is `http(s)`. A `javascript:`
href in shared, editable data is an attack on whoever opens the entry, and this
is editable by everyone in the house by design.

**What it did not borrow yet.** The `nextDue` predictions in `lib/analytics.ts`
are still only on the item report. Surfacing them as read-only entries on the
month grid — "toor dal likely needed" — is the one thing that makes a calendar
here better than a calendar anywhere else, and it is the obvious next piece.
`analyse()` does not return `nextDue` per item today, so it needs either a new
pure helper over `priceHistory()` or a `/api/analytics` field; not hard, just
not done.

**Deploying it changes nothing above.** `/api/calendar` is one more route behind
the same three blockers as the rest: it needs the absolute `NEXT_PUBLIC_API_URL`
(blocker 2), CORS (blocker 3), and it is an unauthenticated write on a public URL
(blocker 5) — anyone could fill the family calendar with whatever they liked,
or read where the house will be on Friday night. Add it to the write set that
gets protected first.

**Still worth asking:** if the family already lives in Google Calendar, a link
out beats maintaining this, and the inventory due-date tie-in above is the only
real argument against.
