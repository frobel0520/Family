# family-app-worker

Cloudflare Worker that acts as the backend for the family app: handles GitHub OAuth login and commits data (board posts, recipes, orders) into this project's GitHub repo via a bot token. See `../family-app-project-plan.md` for the full design.

## Required secrets

Set these with `wrangler secret put <NAME>` (never commit real values — `wrangler.jsonc` only holds non-secret `vars`):

| Secret | Where to get it |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub → Settings → Developer settings → OAuth Apps → New OAuth App |
| `GITHUB_CLIENT_SECRET` | Generated alongside the OAuth App above |
| `JWT_SECRET` | Any long random string you generate yourself (e.g. `openssl rand -base64 32`) — used to sign session tokens |
| `GITHUB_BOT_PAT` | GitHub → Settings → Developer settings → Fine-grained tokens → scope to this one repo, **Contents: Read and write** permission only |

Non-secret config lives in `wrangler.jsonc` under `vars`:

- `GITHUB_REPO` — `"owner/repo"` of this project's repo
- `ALLOWED_ORIGIN` — the GitHub Pages origin allowed to call this Worker (CORS), e.g. `"https://your-username.github.io"`

### GitHub OAuth App settings

- **Homepage URL**: your GitHub Pages URL
- **Authorization callback URL**: the frontend route that receives GitHub's redirect (e.g. `https://your-username.github.io/auth/callback`) — the frontend reads the `code` query param there and POSTs it to this Worker's `/api/auth/callback`

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
| `POST /api/auth/callback` | none | Exchanges GitHub OAuth `code` for a session JWT |
| `GET /api/me` | session | Returns the logged-in user's username/avatar |
| `POST /api/board` | session | Adds a board post |
| `POST /api/recipes` | session | Uploads a recipe photo + adds a recipe entry |
| `POST /api/orders` | session | Adds a dish to the order list |

All writes go through the bot PAT — logged-in family members are only ever identified, never given repo write access directly.
