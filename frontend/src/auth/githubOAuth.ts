/** Absolute URL of the /auth/callback route, respecting Vite's base path in both dev and prod. */
export function getRedirectUri(): string {
	return `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`;
}

export function buildAuthorizeUrl(): string {
	const params = new URLSearchParams({
		client_id: import.meta.env.VITE_GITHUB_CLIENT_ID,
		redirect_uri: getRedirectUri(),
		scope: "read:user",
	});
	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
