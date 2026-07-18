/**
 * Google OAuth code -> access_token exchange, and user info lookup.
 * The access_token is used once (to identify the user) and then discarded —
 * it is never stored or returned to the frontend. Writes to the repo happen
 * separately via a bot PAT (see github-contents.ts).
 */

export interface GoogleUser {
	id: string; // stable, opaque account id (the "sub" claim) — not human-readable
	name: string;
	avatar: string;
}

export class GoogleOAuthError extends Error {}

export async function exchangeCodeForAccessToken(
	code: string,
	redirectUri: string,
	clientId: string,
	clientSecret: string,
): Promise<string> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

	if (!response.ok || !data.access_token) {
		throw new GoogleOAuthError(data.error_description ?? data.error ?? `Token exchange failed with status ${response.status}`);
	}

	return data.access_token;
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
	const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		throw new GoogleOAuthError(`Google user lookup failed with status ${response.status}`);
	}

	const data = (await response.json()) as { sub: string; name: string; picture: string };

	return { id: data.sub, name: data.name, avatar: data.picture };
}
