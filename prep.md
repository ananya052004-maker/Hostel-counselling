# VIT Hostel Guide — Project Prep Notes

## What this project does

A browsing and counselling-simulation tool for VIT Vellore students.
Two parts:

- **Browse**: pick men's/women's/all hostels, filter by room type
  (1/2/3/4/6-bed) and accommodation type (Hostel vs Apartment), search by
  block code or name, and open a detail modal with room-count breakdowns,
  AC/Non-AC tags, mess info, contact numbers, and photos. There's a
  dark-mode toggle (persisted in `localStorage`).
- **Counselling**: register with CGPA + branch, rank up to 8 hostel/
  room-type choices, and see a live estimate of what you'd get — then a
  final result once an admin runs an actual counselling round. See
  "Counselling / allotment simulation" below for the full mechanics.

Data (block names, phone numbers, room-type structure) is seeded from the
official VIT hostel page; room counts are indicative placeholders — the UI
tells users to confirm the real numbers on VTOP.

## Tech stack

**Frontend**
- Vanilla JavaScript (no framework) — [src/main.js](src/main.js) builds the
  entire UI by setting `innerHTML` on `#root` and wiring event listeners.
- Plain CSS — [src/styles.css](src/styles.css).
- [Vite](https://vitejs.dev/) as the dev server / bundler. In dev, Vite
  proxies any `/api/*` request to the Express backend (see
  [vite.config.js](vite.config.js)).

**Backend**
- [Express](https://expressjs.com/), split into modules:
  - [db.js](db.js) — opens `data/hostels.db` (SQLite, via
    [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)), creates
    all tables, seeds the hostel catalog from
    [src/data.js](src/data.js).
  - [lib/auth.js](lib/auth.js) — random session token creation, and two
    middlewares: `requireAuth` (student session) and `requireAdmin`
    (shared-secret header, only active if `ADMIN_KEY` is set).
  - [lib/allocate.js](lib/allocate.js) — the **counselling allocation
    engine** (see below).
  - [routes/hostels.js](routes/hostels.js) — hostel listing/detail/
    live-availability endpoints.
  - [routes/auth.js](routes/auth.js) — `POST /api/auth/identify`,
    `POST /api/auth/register`, `GET /api/auth/me`.
  - [routes/counselling.js](routes/counselling.js) — preference
    submission, allocation status, and admin-only allocation-run/stats
    endpoints.
  - [server.js](server.js) — wires the routers together and serves the
    built frontend in production.

### Counselling / allotment simulation

This is the backend-heavy part: a simplified version of how VIT's real
seniority-based hostel counselling works.

1. **Log in or register — no password** (`POST /api/auth/identify`, then
   `POST /api/auth/register` if needed). A student types only an email.
   `identify` looks it up: if an account with that email exists, it logs
   them straight in (`{found: true, token, student}`); if not, it
   returns `{found: false}` and the frontend reveals the rest of the
   registration form (name, regNo, gender, CGPA, branch) pre-filled with
   that email. Once registered, the same email always just logs in from
   then on — no separate "sign up again" step. A random session token is
   returned either way and must be sent as `Authorization: Bearer
   <token>` on authenticated requests. Branch must be one of the codes
   from `GET /api/branches`.

   **Trade-off, on purpose:** there is no password, so anyone who knows
   or guesses a student's email can open their session — this is
   intentionally traded for frictionless UX in a classroom/demo tool,
   not meant for an environment with an adversarial user base. If this
   ever needs to be real (grades real room assignments, has user data
   worth protecting), add back a verification step — e.g. a one-time
   code emailed on `identify`, verified before issuing the session token.
2. **Rank preferences** (`POST /api/preferences`) — a student submits an
   ordered list of up to 8 `{hostelCode, roomType}` choices. The server
   validates each one (hostel exists, room type offered, gender category
   matches) and rejects duplicates. Preferences are locked once the
   student has an `allocated` result — you can't change your mind after
   a room is granted, but a waitlisted student can resubmit.
3. **Run allocation** (`POST /api/admin/run-allocation`, admin-key
   protected) — [lib/allocate.js](lib/allocate.js) implements a **serial
   dictatorship** algorithm. Pending students (no `allocated` row yet)
   are sorted by priority and each is granted the highest-ranked choice
   that still has unused capacity for their gender. Seat usage is
   tracked per `(hostel_code, room_type)` in the `seat_usage` table and
   incremented inside a single SQLite transaction, so capacity can never
   be oversold. Anyone who exhausts their list without a free seat is
   marked `waitlisted` (and reconsidered on the next run).

   **Priority rule:** students are grouped by branch, smallest
   `approxStrength` first — that whole group is processed before the
   next-larger branch. *Within* the same branch, higher CGPA goes first.
   So branch size is the dominant factor; CGPA only breaks ties inside a
   branch. See [src/data.js](src/data.js) `branchStrengths` for the
   branch list and the important caveat about where those numbers come
   from (next section).
4. **Check status** (`GET /api/allocation/me`) — a student sees
   `not_processed`, `waitlisted`, or `allocated` with their assigned
   block/room type. Only `allocated` is treated as final/locked by the
   UI — a `waitlisted` result from a past round is still live, since
   waitlisted students are reconsidered on the next run.
5. **Live estimate** (`GET /api/allocation/preview`) — answers "what
   would I get right now, and what happens to each of my ranked choices?"
   *without* waiting for an admin round and without writing anything to
   the database. It replays the exact same priority order and seat logic
   as a real run, starting from whatever seats are already committed,
   processing only the students strictly ahead of the asking student in
   priority order to build a seat-usage snapshot, then walks that
   student's own ranked list once against it (nothing processed *after*
   a student can change that student's own outcome in a serial
   dictatorship, so this is cheap and exact — not a rough guess).
   Returns:
   - a top-level `likely_allocated` / `likely_waitlisted` summary (or the
     real `allocated` result if a round already locked one in), and
   - `breakdown`: every one of the student's ranked choices, each tagged
     `would_get` (the one they'd actually be granted), `full` (someone
     with equal-or-better priority already took every seat there), or
     `not_reached` (ranked below the one they'd get, so it's moot).

   This is what powers the "Live estimate" card **and** the numbered
   "Your choices, in priority order" list beneath it in the Counselling
   section of the UI — clicking Submit updates both immediately.
6. **Live seat availability** (`GET /api/hostels/:code/availability`) —
   computes remaining seats per room type from the hostel's total
   capacity minus `seat_usage`, in real time.
7. **Admin stats** (`GET /api/admin/stats`, admin-key protected) —
   aggregate counts (total students, allocated, waitlisted, seat usage
   per block) for monitoring a counselling round.

### ⚠️ About the branch-strength numbers

`GET /api/branches` and the `branchStrengths` list in
[src/data.js](src/data.js) (Civil, Chemical, CSBS, Biotech, ECE, Mech,
CSE) are **not** official VIT figures. I looked for a published VIT
Vellore branch-wise seat matrix and could not find one — the official
VITEEE seat matrix isn't posted as a browsable page, and third-party
sites (CollegeDekho, Careers360, CollegePravesh) disagree with each
other by hundreds of seats for the same branch (CSE alone ranges from
roughly 1200 to 1750 depending on the source). The numbers seeded here
are the most-consistent figures found across those sources, used only
to demonstrate the "smaller branch gets priority" rule — they are
**not** a claim about real VIT intake. The app surfaces this as a
`disclaimer` string from `GET /api/branches` and shows it directly in
the Counselling section's allocation panel. Replace the list in
`src/data.js` with real figures if you obtain them (e.g. from VTOP, a
brochure, or VIT admissions directly).

`ADMIN_KEY` must be set as an environment variable for these routes to
work at all — with no `ADMIN_KEY` set, they respond `503` rather than
falling back to an insecure default.

### The flow, in plain terms — two separate phases

It's easy to assume "submit preferences" immediately gives you a room.
It doesn't — this mirrors real counselling, which runs in batches:

1. **Any time**: students register (regNo, name, gender, CGPA, branch)
   and submit their ranked list (1 to 8 choices — you do *not* need all
   8). The "Counselling" section's submit button shows **"Saving…"**
   while the request is in flight and **"✓ Preferences saved…"** once
   it's confirmed, with a live `(X/8 added)` counter so it's clear
   partial lists are fine. Right after saving, the allocation panel
   immediately shows a **live estimate** ("Likely outcome: …") computed
   from everyone's current submissions — this can change as other
   students submit or edit their own choices, so it's clearly labeled
   as an estimate, not a final result.
2. **Separately, by whoever is running the round**: an admin calls
   `POST /api/admin/run-allocation` (curl/Postman, with the `x-admin-key`
   header — there's deliberately no button for this in the UI, see
   below). This processes *every* student who has submitted preferences
   and hasn't already been allocated, all at once, in branch-then-CGPA
   priority order.
3. **After that runs**, each student's allocation panel switches from
   the dashed "live estimate" card to a solid **final** card — "Allocated"
   or "Waitlisted" — the next time they load the page (`GET
   /api/allocation/me` takes priority over the preview once a real
   result exists).

So after submitting, seeing a dashed "live estimate" card (rather than a
solid final one) is the **correct, expected** state until someone runs a
counselling round — it's not a bug. Re-run `POST /api/admin/run-allocation`
any time to process newly-submitted or still-waitlisted students in
another batch.

The admin endpoints are intentionally **not** wired into the frontend —
putting the admin key in client-side JS would expose it to every
visitor. Trigger them with `curl` instead:

```bash
# run a counselling round
curl -X POST localhost:3001/api/admin/run-allocation -H "x-admin-key: $ADMIN_KEY"

# see aggregate stats
curl localhost:3001/api/admin/stats -H "x-admin-key: $ADMIN_KEY"
```

## How the pieces talk to each other

```
Browser ──▶ Vite dev server (:5173) ──serves──▶ index.html, src/main.js, src/styles.css
                    │
                    └── proxies /api/* ──▶ Express API (:3001) ──▶ SQLite (data/hostels.db)
```

In **production** (after `npm run build`), there is no Vite dev server —
Express itself serves the built static files from `dist/` *and* the API,
as one process on one port (see the `express.static(dist)` + catch-all
route added to `server.js`). This is important for deployment: it means
you only need to run and expose a single Node service.

## Running locally

```bash
npm install
ADMIN_KEY=dev-secret npm run dev   # ADMIN_KEY only needed if you'll trigger allocation runs/stats
```
Open http://localhost:5173. Without `ADMIN_KEY` set, everything except
the two admin-only endpoints works normally.

For a production-shaped local test:
```bash
npm run build    # builds frontend into dist/
npm start         # node server.js — serves dist/ + API on one port (3001, or $PORT)
```

## Deployment procedure

The backend needs a **persistent filesystem** for `data/hostels.db`
(it's a real SQLite file on disk), and `better-sqlite3` is a native
module that needs to be compiled for the host's OS/architecture at
install time. That rules out classic serverless platforms (Vercel
serverless functions, Netlify functions, Cloudflare Workers) unless you
swap the DB for a hosted one. The simplest fit is a platform that runs a
**long-lived Node process with a persistent disk** — e.g. Render, Railway,
Fly.io, or a basic VPS.

Below is the procedure for **Render** (free/low-cost, straightforward):

1. **Push the repo to GitHub first** (see next section).
2. On [render.com](https://render.com), click **New → Web Service** and
   connect your GitHub repo.
3. Configure the service:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Environment:** Node
4. Add a **persistent disk** (Render → your service → Disks):
   - Mount path: `/opt/render/project/src/data`
   - This keeps `hostels.db` across deploys/restarts (otherwise it's
     recreated — harmless here since it's just reseeded from
     `src/data.js`, but a disk avoids any disruption).
5. Set environment variables:
   - `PORT` — Render sets this automatically; `server.js` already reads
     `process.env.PORT`.
   - `ADMIN_KEY` — a long random secret, required to use the
     allocation-run/stats endpoints in production.
6. Deploy. Render builds, runs `npm start`, and gives you a public URL
   (`https://<your-service>.onrender.com`).

**Railway** and **Fly.io** follow the same shape: build with
`npm install && npm run build`, run with `npm start`, attach a volume
mounted at `data/` if you want the DB to persist across deploys.

**Why not split frontend/backend across Vercel + a separate API host?**
You could (deploy `dist/` as a static site on Vercel/Netlify, and the
Express API separately on Render/Railway), but then you must change the
frontend's `fetch('/api/...')` calls to an absolute URL and handle CORS
on the Express side. The single-service approach above avoids all of
that, so it's the recommended path unless you have a reason to split.

## Pushing to GitHub (when you're ready)

```bash
cd /Users/ananyajain/Desktop/hostel_counselling
git init
git add .
git commit -m "Initial commit: VIT hostel guide"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `dist/`, and `data/*.db`,
so none of those get committed — correct, since `dist/` and the DB file
are both build/runtime artifacts regenerated automatically.
