/**
 * Absolute URL of the app's root page. Google requires the OAuth redirect_uri to be
 * registered exactly (no #fragment allowed), so — unlike the earlier GitHub Pages/
 * HashRouter setup — this must be the real page URL, not a hash route. The frontend
 * detects "?code=..." on this page directly (see App.tsx) rather than routing to a
 * dedicated /auth/callback path.
 */
export function getRedirectUri(): string {
	return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/**
 * Initiates Google OAuth via the same-origin Worker endpoint so the Worker can
 * generate cryptographic CSRF `state` + PKCE `S256` challenge in an HttpOnly cookie.
 */
export function buildAuthorizeUrl(): string {
	return "/api/auth/start";
}

export function hasOAuthCallbackParams(search: string): boolean {
	const params = new URLSearchParams(search);
	return params.has("code") || params.has("error");
}
