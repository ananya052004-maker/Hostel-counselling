# Interview Prep — VIT Hostel Guide & Counselling Simulator

Study notes for talking about this project in an SDE interview. Pairs with
[prep.md](prep.md), which has the full technical writeup — this file is the
condensed "what to say out loud" version.

## 1. One-line pitch (say this first)

"A full-stack hostel browsing + counselling simulation app for VIT students —
vanilla JS frontend, Express/Node backend, SQLite storage — where the
interesting part is the backend allocation engine: a serial-dictatorship
algorithm that assigns hostel rooms by branch-size-then-CGPA priority inside
SQLite transactions, with a live 'preview' endpoint that predicts a student's
outcome in real time without touching the database."

## 2. Technologies used

| Layer | Tech | Where |
|---|---|---|
| Frontend | Vanilla JavaScript (no framework), DOM built via `innerHTML` + event listeners | [src/main.js](src/main.js) |
| Styling | Plain CSS, `prefers-color-scheme` + `localStorage`-persisted dark mode toggle | [src/styles.css](src/styles.css) |
| Build tool | Vite 6 (dev server with API proxy, production bundler) | [vite.config.js](vite.config.js) |
| Backend | Express 5, modular routers | [server.js](server.js), [routes/](routes/) |
| Database | SQLite via `better-sqlite3` (synchronous, native binding), WAL journal mode | [db.js](db.js) |
| Auth | Custom bearer-token sessions (random 32-byte hex tokens), no password — email-only "identify or register" flow | [lib/auth.js](lib/auth.js) |
| Admin auth | Shared-secret header (`x-admin-key`) compared with `timingSafeEqual` | [lib/auth.js](lib/auth.js) |
| Core algorithm | Serial-dictatorship allocation engine | [lib/allocate.js](lib/allocate.js) |
| Process model | Single Node process serves both static frontend (`dist/`) and API in production | [server.js](server.js) |
| Tooling | `concurrently` (runs Vite + Express together in dev), npm scripts | [package.json](package.json) |
| Deployment target | Any host with a persistent disk + long-lived Node process (Render/Railway/Fly.io) — explicitly *not* serverless, because `better-sqlite3` needs native compilation and the DB file needs a persistent filesystem | prep.md "Deployment procedure" |

Why these choices are worth mentioning: no framework on the frontend was a
deliberate scope choice (small enough UI that React/Vue would be overhead);
SQLite was chosen for zero-ops local persistence; `better-sqlite3` specifically
because it's synchronous, which makes wrapping the whole allocation round in
one `db.transaction()` trivial to reason about (no async interleaving to
worry about mid-transaction).

## 3. Architecture to be able to draw on a whiteboard

```
Browser ──▶ Vite dev server (:5173) ──serves──▶ index.html / main.js / styles.css
                   │
                   └── proxies /api/* ──▶ Express API (:3001) ──▶ SQLite (data/hostels.db)

Production: one Node process — express.static(dist/) + the same API routes, one port.
```

Request flow for a key action (submit preferences → see outcome):
1. Frontend `POST /api/preferences` with `Authorization: Bearer <token>`.
2. `requireAuth` middleware resolves the token → student row, attaches `req.student`.
3. Route validates each choice (hostel exists, room type offered, gender matches, no dupes).
4. Frontend immediately calls `GET /api/allocation/preview` to render a live estimate.
5. Separately, an admin calls `POST /api/admin/run-allocation` (curl, not in the UI) to
   actually commit allocations for everyone pending, inside one SQLite transaction.

## 4. Likely interview questions + how to answer them (SDE lens)

### Q: "Walk me through this project."
Lead with the pitch in §1, then the two-phase design in §3. Keep it to the
flow a student experiences, then pivot to the algorithm if they probe deeper
— that's the part with real design decisions in it.

### Q: "What's the hardest / most interesting part of this project?"
The **serial-dictatorship allocation engine** ([lib/allocate.js](lib/allocate.js)).
Say:
- It's a classic mechanism-design algorithm (same family used in real-world
  school-choice/residency matching): sort agents by priority, let each pick
  their best still-available option, one at a time, no take-backs.
- Priority here is two-level: branch tier first (smaller branch strength =
  higher priority, as a whole group), then CGPA descending as a tie-breaker
  *within* a branch. That's implemented as a single comparator function
  (`byPriority`) so the sort is O(n log n) and the rule lives in one place.
- Correctness-critical part: seat capacity bumps (`bumpUsedSeats`) and
  allocation writes happen inside **one SQLite transaction**
  (`db.transaction(() => {...})()`), so a crash mid-run can't leave seats
  oversold or half-allocated. This is the answer if they ask about
  "consistency" or "atomicity" in a DB systems question.
- The trickier piece is `previewAllocation()`: it reconstructs what a *specific*
  student would get right now, without writing anything, by only replaying
  students strictly ahead of them in priority order. That's an optimization
  worth explaining: in a serial dictatorship, nothing processed *after* a
  given student can change that student's own outcome, so you don't need to
  simulate the whole population — just the prefix ahead of them. This turns
  an O(n) full-population scan concern into "small relative to admin runs,"
  and matters because `/api/allocation/preview` is called on every page load,
  while the real run is a rare admin action.

### Q: "How does your auth work? Is it secure?"
Be honest and proactive about this — it's a planted, documented trade-off,
not an oversight:
- Session tokens: `crypto.randomBytes(32)` hex string, stored server-side in
  a `sessions` table with an expiry, sent back as `Authorization: Bearer`.
- Deliberately **no password** — `POST /api/auth/identify` checks if an email
  exists; if yes, logs them in immediately; if no, reveals a registration
  form. This was a conscious UX-vs-security trade-off for a classroom/demo
  tool: anyone who knows a student's email can open their session.
- If asked "how would you fix that for production," the answer is already in
  prep.md: add a verification step (one-time code emailed on `identify`,
  verified before issuing the session token) — shows you understand the gap
  and the fix, not just that a gap exists.
- Admin routes use a *different* mechanism — a shared-secret header compared
  with `crypto.timingSafeEqual` (constant-time comparison to prevent timing
  attacks on the key), and the routes `503` rather than silently allowing
  access if `ADMIN_KEY` isn't set — i.e., **fail closed**, not open.

### Q: "Why SQLite instead of Postgres/MySQL?"
Zero ops for a small single-service app — no separate DB server to run,
migrate, or connect-pool. `better-sqlite3` is synchronous (no async/await
needed for queries), which keeps the transaction-wrapped allocation logic
simple to reason about. Trade-off to name proactively: SQLite's single-writer
model means this doesn't horizontally scale across multiple app servers —
fine for this project's scale, would need Postgres (or at least a shared DB)
if traffic or write concurrency grew.

### Q: "How would you scale this / what would you change for production?"
Good answers, in priority order:
1. Replace email-only auth with a real verification step (above).
2. Move off SQLite to a networked DB if running multiple app instances
   (SQLite's file lock doesn't support multi-writer across machines).
3. Expose the admin "run allocation" action behind a real admin UI + role-based
   auth rather than a curl-only shared secret.
4. Add rate limiting / input validation hardening on public endpoints.
5. The branch-strength seed data is explicitly a placeholder (documented in
   prep.md) — real deployment needs real VIT seat-matrix numbers.

### Q: "What database schema did you design, and why?"
Walk through [db.js](db.js) tables: `hostels` (catalog, JSON-encoded columns
for `room_types`/`tags`/`room_counts` since SQLite has no native array type),
`students`, `sessions`, `preferences` (composite PK `(student_id, rank)` so a
student can't have two choices at the same rank), `allocations` (one row per
student, `status` CHECK constraint), `seat_usage` (composite PK
`(hostel_code, room_type)`, atomically incremented). Mention the `CHECK`
constraints (`gender IN (...)`, `status IN (...)`) as DB-level invariant
enforcement rather than relying only on application code.

### Q: "How do you prevent overbooking a hostel room type?"
Seat usage is tracked per `(hostel_code, room_type)` and every allocation
increments it via `ON CONFLICT ... DO UPDATE SET used = used + 1` inside the
same transaction as the capacity check — so there's no read-then-write race
within a single `runAllocation()` call (it's single-threaded/synchronous
Node + a transaction, not concurrent workers). If pushed on "what if two
admin requests ran concurrently," the honest answer: Node's single-threaded
event loop combined with `better-sqlite3` being synchronous means the whole
transaction executes without yielding, so even two near-simultaneous HTTP
requests to `run-allocation` would serialize naturally on that process.

### Q: "What was a bug or non-obvious decision you had to work through?"
Two good, true examples to have ready:
1. **Image cropping**: hostel photos didn't match the card/modal aspect
   ratio, causing letterboxing with `object-fit: contain`. Fixed by showing
   **two** photos per slot with `object-fit: cover` instead of one — a
   `secondaryImageFor()` helper picks the next image after the primary one
   (wrapping around the array) so the pair is always two distinct photos.
   Good because it shows a pragmatic UI fix over a complex cropping/
   art-direction solution.
2. **Preview vs. final allocation state**: initially it'd be easy to assume
   "submit preferences → see your room" is one step. It's actually two
   decoupled phases (students submit anytime; admin runs a batch separately),
   and the UI needed to clearly distinguish a "live estimate" (dashed card)
   from a "final" result (solid card) so users don't think a dashed estimate
   is a bug. Good answer for "how do you handle ambiguous/evolving state in
   a UI."

### Q: "How is the frontend built without a framework — would you do that again?"
`src/main.js` builds the UI by setting `innerHTML` on a root element and
wiring listeners imperatively. Honest trade-off to state: fine at this size
(one page, a handful of sections), but re-render-via-innerHTML doesn't scale
well — no diffing, risk of losing focus/scroll state on re-render, and
event listeners need re-wiring after each re-render. Would reach for a
lightweight framework (Preact/Svelte) or at least componentize the string-
building if the UI grew.

### Q: "Walk me through what happens when `npm run dev` vs `npm start` runs."
- `dev`: `concurrently` runs `node server.js` (Express API on :3001) and
  `vite` (dev server on :5173) side by side; Vite proxies `/api/*` to
  Express per [vite.config.js](vite.config.js).
- `build`: Vite bundles the frontend into `dist/`.
- `start`: `node server.js` only — Express serves `dist/` as static files
  *and* the API from the same port (`express.static` + a catch-all route
  that excludes `/api/*` via the regex `/^\/(?!api).*/`). One process, one
  port — deliberately simple for deployment (see prep.md's deployment
  section for why this ruled out classic serverless hosts).

### Q: "Any tests?"
If there are none, say so plainly rather than inventing: "No automated test
suite currently — testing has been manual (curl for the admin endpoints,
browser for the UI flows)." Then proactively say what you'd add: unit tests
for `byPriority`/`runAllocation`/`previewAllocation` in isolation (pure
logic, easy to test with an in-memory SQLite DB), and integration tests for
the auth + preference-submission route validation.

## 5. Quick-reference: API surface

```
GET  /api/health
GET  /api/hostels                      list + filter
GET  /api/hostels/:code                detail
GET  /api/hostels/:code/availability   live remaining seats
GET  /api/branches                     branch list + disclaimer
POST /api/auth/identify                email → found/not-found
POST /api/auth/register                create account, returns session token
GET  /api/auth/me                      [auth] current student
POST /api/preferences                  [auth] submit ranked choices
GET  /api/preferences                  [auth] current choices
GET  /api/allocation/me                [auth] final result if any
GET  /api/allocation/preview           [auth] live non-destructive estimate
POST /api/admin/run-allocation         [admin] run a batch
GET  /api/admin/stats                  [admin] aggregate counts
```

## 6. If they ask something you don't know

Don't bluff. Say what you'd check and where: "I'd look at `lib/allocate.js`
for the exact tie-break logic" / "that's in `db.js`'s schema section." Knowing
*where* the answer lives is itself a strong signal in an SDE interview.
