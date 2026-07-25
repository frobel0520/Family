import { verifySession, type SessionPayload } from "./jwt";
import { jsonResponse } from "./response";

/**
 * Session token 有效期。原本是 24h（家人每天都要重新用 Google 登入一次，被抱怨了），
 * 現在改成 30 天 + 前端會自動續期（`POST /api/auth/refresh`，見 routes/auth.ts）：
 * 只要 30 天內開過 App 就不用再登入。
 *
 * 代價：token 是無狀態的 HS256 JWT，**簽出去就沒辦法撤銷**。在 /admin 把某人從 approved
 * 移除後，他手上還沒過期的 token 最多還能用 30 天（續期會被擋，所以到期就真的進不來了）。
 * 要縮短這個空窗就把這個數字改小；要立刻踢掉所有人只能換 JWT_SECRET（全家一起被登出）。
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Reads the "Authorization: Bearer <token>" header and verifies it.
 * Returns the session payload on success, or a ready-to-return 401 Response on failure.
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

	const session = await verifySession(token, env.JWT_SECRET);
	if (!session) {
		return { response: jsonResponse({ error: "Invalid or expired session" }, 401) };
	}

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
