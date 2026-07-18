import { exchangeCodeForAccessToken, fetchGoogleUser, GoogleOAuthError } from "../google-oauth";
import { signSession } from "../jwt";
import { jsonResponse } from "../response";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h — short-lived, family members just re-login via Google

export async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
	let body: { code?: string; redirectUri?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.code) {
		return jsonResponse({ error: "Missing 'code'" }, 400);
	}
	if (!body.redirectUri) {
		return jsonResponse({ error: "Missing 'redirectUri'" }, 400);
	}

	try {
		const accessToken = await exchangeCodeForAccessToken(
			body.code,
			body.redirectUri,
			env.GOOGLE_CLIENT_ID,
			env.GOOGLE_CLIENT_SECRET,
		);
		const user = await fetchGoogleUser(accessToken);

		const token = await signSession(
			{ sub: user.id, name: user.name, avatar: user.avatar },
			env.JWT_SECRET,
			SESSION_TTL_SECONDS,
		);

		return jsonResponse({
			token,
			user: { name: user.name, avatar: user.avatar },
			expiresIn: SESSION_TTL_SECONDS,
		});
	} catch (err) {
		if (err instanceof GoogleOAuthError) {
			return jsonResponse({ error: err.message }, 401);
		}
		throw err;
	}
}
