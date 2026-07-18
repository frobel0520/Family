/**
 * ALLOWED_EMAILS is a comma-separated list of trusted family emails, stored as a
 * Worker secret (not a `var`) even though it's not really a credential — the repo
 * is public, and family members' email addresses shouldn't end up in it.
 */
export function isAllowedEmail(env: Env, email: string): boolean {
	const allowed = env.ALLOWED_EMAILS.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return allowed.includes(email.toLowerCase());
}
