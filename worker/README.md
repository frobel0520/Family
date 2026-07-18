# family-app-worker

Cloudflare Worker that acts as the backend for the family app: handles Google OAuth login and commits data (board posts, recipes, orders) into this project's GitHub repo via a bot token. See `../family-app-project-plan.md` for the full design.

Login uses Google (not GitHub) because family members all have Google accounts but not necessarily GitHub ones — the repo-write identity (the bot PAT below) is completely separate from the login identity.

## Required secrets

Set these with `wrangler secret put <NAME>` (never commit real values — `wrangler.jsonc` only holds non-secret `vars`):

| Secret | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | Generated alongside the OAuth client above |
| `JWT_SECRET` | Any long random string you generate yourself (e.g. `openssl rand -base64 32`) — used to sign session tokens |
| `GITHUB_BOT_PAT` | GitHub → Settings → Developer settings → Fine-grained tokens → scope to this one repo, **Contents: Read and write** permission only |
| `ALLOWED_EMAILS` | Comma-separated list of trusted Google emails you type yourself, e.g. `me@gmail.com,sister@gmail.com` — anyone who isn't on this list gets a 403 even if they successfully sign in with Google. Kept as a secret (not a `wrangler.jsonc` var) since this repo is public and family emails shouldn't be in it. |

Non-secret config lives in `wrangler.jsonc` under `vars`:

- `GITHUB_REPO` — `"owner/repo"` of this project's repo
- `ALLOWED_ORIGIN` — the GitHub Pages origin allowed to call this Worker (CORS), e.g. `"https://your-username.github.io"`

### Google OAuth client settings

- **Authorized redirect URIs**: the exact page the frontend loads at, e.g. `https://your-username.github.io/family-app/` — Google requires an exact match with no `#fragment`, unlike GitHub's classic OAuth Apps. You can register multiple redirect URIs on the same client, so add `http://localhost:5173/` too if you want to test login locally — no separate "dev" OAuth client needed.
- The frontend sends `code` **and** the `redirectUri` it used to `/api/auth/callback`; the Worker passes both to Google's token endpoint, since Google requires the redirect_uri in the token exchange to match the one used in the authorization request.
- **OAuth consent screen** stays in "Testing" status (no need to submit for verification for a private family app) — add each family member's Google email under **Test users**, or they can't get past Google's own sign-in step at all. This is the first line of defense; `ALLOWED_EMAILS` above is the second, enforced independently by the Worker.

## Local development

```sh
cp .dev.vars.example .dev.vars
# fill in .dev.vars with real values (gitignored, never committed)
npm run dev
```

## Deploy

```sh
npx wrangler login   # one-time, opens a browser to authorize the CLI against your Cloudflare account
npm run deploy
```

## Routes

| Route | Auth | Description |
|---|---|---|
| `POST /api/auth/callback` | none | Exchanges a Google OAuth `code` for a session JWT |
| `GET /api/me` | session | Returns the logged-in user's name/avatar |
| `GET /api/board` | none | Lists board posts |
| `POST /api/board` | session | Adds a board post |
| `GET /api/recipes` | none | Lists recipes |
| `POST /api/recipes` | session | Uploads a recipe photo + adds a recipe entry |
| `GET /api/orders` | none | Lists the order list |
| `POST /api/orders` | session | Adds a dish to the order list |

All writes go through the bot PAT — logged-in family members are only ever identified (by their Google account), never given repo write access directly.
