import { exchangeCodeForAccessToken, fetchGithubUser, GithubOAuthError } from "../github-oauth";
import { signSession } from "../jwt";
import { jsonResponse } from "../response";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h — short-lived, family members just re-login via GitHub

export async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
	let body: { code?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.code) {
		return jsonResponse({ error: "Missing 'code'" }, 400);
	}

	try {
		const accessToken = await exchangeCodeForAccessToken(body.code, env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
		const user = await fetchGithubUser(accessToken);

		const token = await signSession({ sub: user.username, avatar: user.avatar }, env.JWT_SECRET, SESSION_TTL_SECONDS);

		return jsonResponse({
			token,
			user: { username: user.username, avatar: user.avatar },
			expiresIn: SESSION_TTL_SECONDS,
		});
	} catch (err) {
		if (err instanceof GithubOAuthError) {
			return jsonResponse({ error: err.message }, 401);
		}
		throw err;
	}
}
