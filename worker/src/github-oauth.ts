/**
 * GitHub OAuth code -> access_token exchange, and user info lookup.
 * This access_token is used once (to identify the user) and then discarded —
 * it is never stored or returned to the frontend. Writes to the repo happen
 * separately via a bot PAT (see github-contents.ts).
 */

export interface GithubUser {
	username: string;
	avatar: string;
}

export class GithubOAuthError extends Error {}

export async function exchangeCodeForAccessToken(
	code: string,
	clientId: string,
	clientSecret: string,
): Promise<string> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": "family-app-worker",
		},
		body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
	});

	if (!response.ok) {
		throw new GithubOAuthError(`GitHub token exchange failed with status ${response.status}`);
	}

	const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

	if (!data.access_token) {
		throw new GithubOAuthError(data.error_description ?? data.error ?? "No access_token returned by GitHub");
	}

	return data.access_token;
}

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "family-app-worker",
		},
	});

	if (!response.ok) {
		throw new GithubOAuthError(`GitHub user lookup failed with status ${response.status}`);
	}

	const data = (await response.json()) as { login: string; avatar_url: string };

	return { username: data.login, avatar: data.avatar_url };
}
