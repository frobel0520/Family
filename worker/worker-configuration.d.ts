// Hand-maintained Env type for this Worker's secrets/vars.
// Regenerate/extend with `npm run cf-typegen` if bindings (KV, D1, etc.) are added later.
interface Env {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	JWT_SECRET: string;
	GITHUB_BOT_PAT: string;
	GITHUB_REPO: string; // "owner/repo"
	ALLOWED_ORIGIN: string; // e.g. "https://<user>.github.io"
	OWNER_EMAIL: string; // always allowed to log in; the only account that can approve/deny others
	VAPID_PUBLIC_KEY: string; // Web Push VAPID public key (base64url, uncompressed P-256 point)
	VAPID_PRIVATE_JWK: string; // secret — VAPID private key as JWK JSON string
	VAPID_SUBJECT: string; // "mailto:..." contact for push services
	PUSH_SUBS: KVNamespace; // push subscriptions, key "sub:<b64url endpoint>"
}
