/**
 * Session 放在 HttpOnly cookie，前端 JS 讀不到，也就不會被同網域其他頁面的腳本偷走。
 * `__Host-` 前綴強制 Secure、Path=/、不能帶 Domain，cookie 只屬於這個 Worker 的主機名稱。
 * SameSite=Strict：別的網站發起的請求不會帶上這個 cookie。
 */
export const SESSION_COOKIE = "__Host-family_session";
export const OAUTH_TX_COOKIE = "__Host-family_oauth_tx";
export const OAUTH_TX_TTL_SECONDS = 600;

export function sessionCookie(token: string, maxAgeSeconds: number): string {
	return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
	return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function oauthTxCookie(token: string, maxAgeSeconds = OAUTH_TX_TTL_SECONDS): string {
	return `${OAUTH_TX_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedOAuthTxCookie(): string {
	return `${OAUTH_TX_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request: Request, cookieName: string): string | null {
	const header = request.headers.get("Cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		if (part.slice(0, index).trim() === cookieName) {
			const value = part.slice(index + 1).trim();
			return value || null;
		}
	}
	return null;
}

export function readSessionCookie(request: Request): string | null {
	return readCookie(request, SESSION_COOKIE);
}

/** 在既有回應上附加一或多個 Set-Cookie。 */
export function withCookies(response: Response, cookies: readonly string[]): Response {
	const headers = new Headers(response.headers);
	for (const cookie of cookies) {
		headers.append("Set-Cookie", cookie);
	}
	return new Response(response.body, { status: response.status, headers });
}

/** 在既有 JSON 回應上加 Set-Cookie。 */
export function withSessionCookie(response: Response, cookie: string): Response {
	return withCookies(response, [cookie]);
}
