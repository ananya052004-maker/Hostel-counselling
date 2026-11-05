# VIT Hostel Guide — Project Prep Notes

## What this project does

A browsing tool for VIT Vellore students to explore official hostel blocks
before counselling. Users pick men's/women's/all hostels, filter by room
type (1/2/3/4/6-bed) and accommodation type (Hostel vs Apartment), search
by block code or name, and open a detail modal with room-count breakdowns,
AC/Non-AC tags, mess info, contact numbers, and photos. There's a dark-mode
toggle (persisted in `localStorage`).

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
  - [lib/auth.js](lib/auth.js) — password hashing (`scrypt`, built into
    Node's `crypto`, no extra dependency), session token creation, and two
    middlewares: `requireAuth` (student session) and `requireAdmin`
    (shared-secret header, only active if `ADMIN_KEY` is set).
  - [lib/allocate.js](lib/allocate.js) — the **counselling allocation
    engine** (see below).
  - [routes/hostels.js](routes/hostels.js) — hostel listing/detail/
    live-availability endpoints.
  - [routes/auth.js](routes/auth.js) — `POST /api/auth/register`,
    `POST /api/auth/login`, `GET /api/auth/me`.
  - [routes/counselling.js](routes/counselling.js) — preference
    submission, allocation status, and admin-only allocation-run/stats
    endpoints.
  - [server.js](server.js) — wires the routers together and serves the
    built frontend in production.

### Counselling / allotment simulation

This is the backend-heavy part: a simplified version of how VIT's real
seniority-based hostel counselling works.

1. **Register / log in** (`/api/auth/register`, `/api/auth/login`) — a
   student account stores `regNo`, `name`, `gender`, `cgpa`, and a
   salted+hashed password (`scrypt`, timing-safe comparison on login).
   A random session token is returned and must be sent as
   `Authorization: Bearer <token>` on authenticated requests.
2. **Rank preferences** (`POST /api/preferences`) — a student submits an
   ordered list of up to 8 `{hostelCode, roomType}` choices. The server
   validates each one (hostel exists, room type offered, gender category
   matches) and rejects duplicates. Preferences are locked once the
   student has an `allocated` result — you can't change your mind after
   a room is granted, but a waitlisted student can resubmit.
3. **Run allocation** (`POST /api/admin/run-allocation`, admin-key
   protected) — [lib/allocate.js](lib/allocate.js) implements a **serial
   dictatorship** algorithm: pending students (no `allocated` row yet)
   are processed in order of `cgpa DESC`, and each is granted the
   highest-ranked choice that still has unused capacity for their
   gender. Seat usage is tracked per `(hostel_code, room_type)` in the
   `seat_usage` table and incremented inside a single SQLite
   transaction, so capacity can never be oversold even with concurrent
   runs. Anyone who exhausts their list without a free seat is marked
   `waitlisted` (and reconsidered on the next run).
4. **Check status** (`GET /api/allocation/me`) — a student sees
   `not_processed`, `waitlisted`, or `allocated` with their assigned
   block/room type.
5. **Live seat availability** (`GET /api/hostels/:code/availability`) —
   computes remaining seats per room type from the hostel's total
   capacity minus `seat_usage`, in real time.
6. **Admin stats** (`GET /api/admin/stats`, admin-key protected) —
   aggregate counts (total students, allocated, waitlisted, seat usage
   per block) for monitoring a counselling round.

`ADMIN_KEY` must be set as an environment variable for these routes to
work at all — with no `ADMIN_KEY` set, they respond `503` rather than
falling back to an insecure default.

### The flow, in plain terms — two separate phases

It's easy to assume "submit preferences" immediately gives you a room.
It doesn't — this mirrors real counselling, which runs in batches:

1. **Any time**: students register and submit their ranked list (1 to 8
   choices — you do *not* need all 8). The "Counselling" section's
   submit button shows **"Saving…"** while the request is in flight and
   **"✓ Preferences saved…"** once it's confirmed, with a live
   `(X/8 added)` counter so it's clear partial lists are fine.
2. **Separately, by whoever is running the round**: an admin calls
   `POST /api/admin/run-allocation` (curl/Postman, with the `x-admin-key`
   header — there's deliberately no button for this in the UI, see
   below). This processes *every* student who has submitted preferences
   and hasn't already been allocated, all at once, by CGPA priority.
3. **After that runs**, each student's "Your allocation status" panel
   updates from "Not yet processed" to "Allocated" or "Waitlisted" the
   next time they load the page (it calls `GET /api/allocation/me`).

So after submitting, "Not yet processed" is the **correct, expected**
state until someone runs a counselling round — it's not a bug. Re-run
`POST /api/admin/run-allocation` any time to process newly-submitted or
still-waitlisted students in another batch.

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
