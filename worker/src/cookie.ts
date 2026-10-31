/**
 * Session 放在 HttpOnly cookie，前端 JS 讀不到，也就不會被同網域其他頁面的腳本偷走。
 * `__Host-` 前綴強制 Secure、Path=/、不能帶 Domain，cookie 只屬於這個 Worker 的主機名稱。
 * SameSite=Strict：別的網站發起的請求不會帶上這個 cookie。
 */
export const SESSION_COOKIE = "__Host-family_session";

export function sessionCookie(token: string, maxAgeSeconds: number): string {
	return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
	return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function readSessionCookie(request: Request): string | null {
	const header = request.headers.get("Cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		if (part.slice(0, index).trim() === SESSION_COOKIE) {
			const value = part.slice(index + 1).trim();
			return value || null;
		}
	}
	return null;
}

/** 在既有 JSON 回應上加 Set-Cookie。 */
export function withSessionCookie(response: Response, cookie: string): Response {
	const headers = new Headers(response.headers);
	headers.append("Set-Cookie", cookie);
	return new Response(response.body, { status: response.status, headers });
}
