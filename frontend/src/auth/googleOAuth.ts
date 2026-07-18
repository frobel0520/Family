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

export function buildAuthorizeUrl(): string {
	const params = new URLSearchParams({
		client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
		redirect_uri: getRedirectUri(),
		response_type: "code",
		scope: "openid email profile",
		prompt: "select_account",
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
