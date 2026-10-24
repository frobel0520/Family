import { verifySession, type SessionPayload } from "./jwt";
import { jsonResponse } from "./response";
import { isOwner, isStillApproved } from "./access";

/**
 * Session token 有效期。原本是 24h（家人每天都要重新用 Google 登入一次，被抱怨了），
 * 現在改成 30 天 + 前端會自動續期（`POST /api/auth/refresh`，見 routes/auth.ts）：
 * 只要 30 天內開過 App 就不用再登入。
 *
 * token 保留 30 天免重登，但每次受保護 API 呼叫都重查 approved 名單。
 * 名單移除立即拒絕下一次 API 呼叫；GitHub 無法讀取時 fail closed。
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Reads the "Authorization: Bearer <token>" header and verifies it.
 * Returns the currently authorized session, or a 401/403/503 Response on failure.
 */
export async function requireSession(
	request: Request,
	env: Env,
): Promise<{ session: SessionPayload } | { response: Response }> {
	const authHeader = request.headers.get("Authorization");
	const token = authHeader?.match(/^Bearer (.+)$/)?.[1];

	if (!token) {
		return { response: jsonResponse({ error: "Missing Authorization header" }, 401) };
	}

	let session: SessionPayload | null;
	try {
		session = await verifySession(token, env.JWT_SECRET);
	} catch {
		return { response: jsonResponse({ error: "Invalid or expired session" }, 401) };
	}
	if (!session) {
		return { response: jsonResponse({ error: "Invalid or expired session" }, 401) };
	}
	if (typeof session.email !== "string" || !session.email.trim()) {
		return { response: jsonResponse({ error: "請重新登入" }, 401) };
	}
	try {
		if (!(await isStillApproved(env, session.email))) {
			return { response: jsonResponse({ error: "這個帳號的存取權已被移除，請聯絡管理員。" }, 403) };
		}
	} catch {
		return { response: jsonResponse({ error: "暫時無法確認存取權，請稍後再試。" }, 503) };
	}
	// Owner privileges follow current server configuration, not an old token claim.
	session = { ...session, isOwner: isOwner(env, session.email) };

	return { session };
}

/** Like requireSession, but also rejects (403) anyone who isn't the app owner. */
export async function requireOwner(
	request: Request,
	env: Env,
): Promise<{ session: SessionPayload } | { response: Response }> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth;

	if (!auth.session.isOwner) {
		return { response: jsonResponse({ error: "Owner only" }, 403) };
	}

	return auth;
}
