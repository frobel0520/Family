<div align="center">

# 🏡 Family

A private, installable web app for a household to post updates, share recipes, order meals, and keep a shared calendar with push reminders — built with **zero traditional backend infrastructure**: no database, no VM, no container. Just a Cloudflare Worker, a GitHub repo used as a JSON data store, and a React PWA.

[Live demo (login required)](https://frobel0520.github.io/Family/) · [Architecture](#architecture) · [Notable engineering](#notable-engineering)

</div>

<!-- TODO: swap in real screenshots (board / recipes / settings), redact any visible names/photos first -->
<p align="center">
  <img src="docs/screenshot-placeholder.png" alt="Screenshot coming soon" width="720">
</p>

---

## Why this exists

Most "family app" side projects stop at a CRUD list. This one had to survive actual daily use by non-technical relatives on their phones — which forced real engineering problems that a toy project usually skips:

- People needed to **log in with the Google account they already have**, not a GitHub account, not a new password.
- The site needed to feel like an **app**, not a bookmarked webpage — installable, with its own icon, opening full-screen.
- Family members expected **push notifications** the moment someone posts, the way any commercial app behaves.
- Photos and posts are personal. Once real content was flowing in, "who can see this" stopped being theoretical and became a real access-control problem to solve properly, on a $0 budget.

Each of those turned into a small, self-contained piece of infrastructure — described below — done without paying for a database, an email service, or a push notification provider.

## Features

| Area | What family members can do |
|---|---|
| Board | Post text and up to 9 photos, comment (also with photos), react with any emoji, delete their own posts and comments |
| Recipes | Browse about 160 dishes in 8 categories, attach a photo of a handwritten recipe (resized before upload) |
| Orders | Order dishes and mark them done; the list shows who ordered and when |
| Calendar | Shared month view; anyone can add or edit events and pick who gets a push reminder at what time |
| Settings | Nickname and avatar, notification toggle, install guide for iOS and Android |
| Admin (owner only) | Approve or deny new Google sign-ins |

Sessions last 30 days and renew when the app opens. New posts, comments and orders notify everyone except the author; reactions notify only the post author; calendar reminders go only to the people ticked on the event.

## Architecture

```mermaid
flowchart LR
    subgraph Client["React PWA (GitHub Pages)"]
        UI[Board / Recipes / Orders / Calendar / Settings]
        SW[Service Worker]
    end

    subgraph CF["Cloudflare Worker"]
        Auth[Google OAuth exchange]
        API[REST API<br/>session-gated]
        ImgProxy["/api/image<br/>HMAC-signed proxy"]
        Push[Web Push sender<br/>hand-rolled RFC 8291/8292]
        Cron[Cron Trigger every 5 min<br/>calendar reminders]
    end

    KV[(Cloudflare KV<br/>push subscriptions)]
    Repo[(Private GitHub repo Family-data<br/>JSON files + images)]

    UI -- Bearer session JWT --> API
    UI -.installed, subscribes.-> SW
    SW <-. push event .-> Push
    API <--> Repo
    ImgProxy <--> Repo
    Push <--> KV
    API -- new post/comment/order --> Push
    Cron -- due reminders --> Push
    Cron <--> Repo
    Push -- Web Push protocol --> SW
```

**No database.** Every mutation (`data/board.json`, `recipes.json`, `orders.json`, `events.json`, `profiles.json`, `access.json`) is a `git commit` to the private [Family-data](https://github.com/frobel0520/Family-data) repo made through GitHub's Contents API, using a bot token so family members never need write access to any repo. Reads go through the same API rather than `raw.githubusercontent.com`, avoiding CDN propagation delay on just-written data. It's not a design anyone would pick for scale — it's a deliberate trade for "zero infra, full history, free forever" at household scale, and the constraint turned out to force some interesting solutions of its own (see below).

**No server-rendering, no server at all in the traditional sense.** The frontend is a static React SPA on GitHub Pages; the Worker is the only piece of custom backend logic, and it's stateless — session identity is a signed JWT, not a server-side session store.

## Notable engineering

A few pieces that go beyond typical CRUD-app plumbing:

- **Web Push implemented from the RFC, not a library.** `npm install web-push` doesn't run on Cloudflare Workers' isolate runtime. [`web-push.ts`](worker/src/web-push.ts) implements RFC 8291 (`aes128gcm` payload encryption) and RFC 8292 (VAPID JWT auth) directly on top of WebCrypto — and it's checked against the [official RFC 8291 Appendix A test vector](worker/test/web-push.spec.ts) byte-for-byte, not just "seems to work in Chrome."

- **A capability-URL image proxy, not session-bound access.** Once the data repo went private, images could no longer be linked directly (`raw.githubusercontent.com` requires the repo to be public). Rather than gate every image fetch behind a short-lived session token — which would turn a stale post's avatar into a broken image the moment its author's session expired — [`image-url.ts`](worker/src/image-url.ts) HMAC-signs the *file path itself*, with no expiry. The signature is the credential; it only ever reaches a client through an already-authenticated API response, and a version component (an update timestamp) is folded into the signed message so replacing an avatar or recipe photo invalidates the old link instead of being cached forever.

- **A same-origin, no-JS-framework PWA install/notification flow**, handling the actual cross-platform mess: iOS only allows requesting notification permission from an already-installed home-screen app (not from Safari), Android's status-bar badge icon must be a *transparent, monochrome* silhouette or it silently renders as a blank square, and same-category push notifications are collapsed and counted via `Notification.tag` + `getNotifications()` rather than stacking indefinitely.

- **Calendar reminders on a cron, tested without pinging anyone.** A Cloudflare Cron Trigger scans `events.json` every five minutes and pushes only to the people ticked on each due event, then writes `notifiedAt` so nothing is sent twice. Times are stored as Taiwan wall-clock strings and converted with a fixed `+08:00` offset; reminders more than 24 hours overdue are dropped instead of flooding everyone after an outage. [`calendar-cron.spec.ts`](worker/test/calendar-cron.spec.ts) runs the real `scheduled()` handler against a faked GitHub API and push endpoint with a freshly generated VAPID key, so the whole path is verified without sending a single real notification.

- **A login-approval queue instead of a static allowlist.** New Google sign-ins land in a pending queue (itself just another JSON file, written the same way as everything else) that only the owner account can approve or deny — chosen specifically over a `.env` allowlist because that would mean redeploying secrets every time a new family member joins.

- **Auth-gated everything, the hard way (learned in production).** The API originally let board/recipe/order *reads* bypass login for convenience. Closing that gap later meant coordinating a breaking backend change with a matching frontend change — deployed slightly out of sync once, which briefly broke the live app for actual users. That mistake, and the fix, are part of the commit history.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite, `HashRouter` | Static hosting on GitHub Pages has no server-side routing |
| Backend | Cloudflare Workers (TypeScript) | Free tier, no server to patch, edge-deployed |
| "Database" | JSON files in a private GitHub repo, via the Contents API | No hosting cost, full history/audit-log for free |
| Auth | Google OAuth (Authorization Code flow), signed JWT sessions | Family members already have Google accounts |
| Push | Hand-rolled Web Push (RFC 8291/8292) + Cloudflare KV for subscriptions | No third-party push service |
| Scheduling | Cloudflare Cron Trigger (`*/5 * * * *`) | Calendar reminders without a job server |
| Install | Web App Manifest + Service Worker (no offline caching by design) | Installable on iOS/Android without an app store |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` | Runs actual Worker code in Miniflare, not mocked fetches |

## Project structure

```
frontend/   React PWA — pages, components, auth context, push subscription logic
worker/     Cloudflare Worker — routes, GitHub Contents API client, JWT/session,
            Web Push crypto, image-signing, tests
```

## Known limitations

- iOS cannot show any badge next to a PWA's home-screen icon; iPhone users rely on the push notification itself. The icon dot works on Android only.
- Calendar reminders can arrive up to 5 minutes late, and only reach people who installed the app and allowed notifications. Recurring events are not supported yet.
- Concurrent writes are last-write-wins; sessions are stateless JWTs and cannot be revoked before they expire.

Day-to-day status, decisions and incident notes (for example the 2026-08-10 `workers.dev` subdomain change) are in [`PROGRESS.md`](PROGRESS.md); the original plan is [`family-app-project-plan.md`](family-app-project-plan.md).

## Local development

```bash
# Worker (Cloudflare)
cd worker
npm install
npm run dev      # wrangler dev
npm test         # vitest, including the RFC 8291 test vector check

# Frontend
cd frontend
npm install
npm run dev      # vite dev server
```

Both need their own `wrangler secret` / `.env` values (Google OAuth client, a GitHub fine-grained PAT scoped to a private data repo, a JWT signing secret, VAPID keys) — there's no shared config file, on purpose, since none of those values belong in git.

## Deployment

- **Frontend** builds and deploys to GitHub Pages via GitHub Actions on every push to `main`.
- **Worker** deploys with `wrangler deploy` (not currently automated in CI — a deliberate manual gate for a backend change). When a backend change tightens what the frontend must send, deploy both together.
- `frontend/index.html` loads the Harbor maintenance script (`data-project="family"`, since 2026-09-15): Harbor can switch on a full-screen maintenance page or a banner, and the app loads normally if Harbor is unreachable.
