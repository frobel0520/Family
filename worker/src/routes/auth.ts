import { exchangeCodeForAccessToken, fetchGoogleUser, GoogleOAuthError } from "../google-oauth";
import { signSession } from "../jwt";
import { jsonResponse } from "../response";
import { checkAccess, isOwner, isStillApproved } from "../access";
import { notifyEmail } from "../notify";
import { effectiveIdentity, getProfile } from "../profiles";
import { SESSION_TTL_SECONDS, requireSession } from "../session";

export async function handleAuthCallback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

		const access = await checkAccess(env, user);
		if (!access.allowed) {
			// 第一次申請（不是 pending 中重試）→ 推播通知擁有者去審核
			if (!access.pending) {
				ctx.waitUntil(
					notifyEmail(env, env.OWNER_EMAIL, {
						title: "🛡️ 新的登入申請",
						body: `${user.name}（${user.email}）想登入 Family，點開審核`,
						url: "/Family/#/admin",
						tag: "admin",
						icon: user.avatar,
					}),
				);
			}
			const message = access.pending
				? "已送出登入申請，請等待管理員同意後再重新登入。"
				: "已送出登入申請，請等待管理員同意。同意後請重新登入。";
			return jsonResponse({ error: message, pending: true }, 403);
		}

		// 套用個人資料（暱稱/自訂大頭貼）；沒設定就用 Google 的
		const profile = await getProfile(env, user.email);
		const identity = await effectiveIdentity(request, env, user, profile);
		const owner = isOwner(env, user.email);

		const token = await signSession(
			{
				sub: user.id,
				name: identity.name,
				email: user.email,
				avatar: identity.avatar,
				googleName: user.name,
				googleAvatar: user.avatar,
				isOwner: owner,
			},
			env.JWT_SECRET,
			SESSION_TTL_SECONDS,
		);

		return jsonResponse({
			token,
			user: { name: identity.name, avatar: identity.avatar, isOwner: owner, email: user.email.toLowerCase() },
			expiresIn: SESSION_TTL_SECONDS,
		});
	} catch (err) {
		if (err instanceof GoogleOAuthError) {
			return jsonResponse({ error: err.message }, 401);
		}
		throw err;
	}
}

/**
 * 「記住我」的續期端點：拿一個**還沒過期**的 token 換一個新的（TTL 重新計算），
 * 前端每天開 App 時自動打一次（見 frontend/src/auth/AuthContext.tsx），所以只要
 * 使用者在 30 天內開過 App 就不用再走一次 Google 登入。
 *
 * 續期時會重新確認：
 * - 存取權（被 /admin 移出 approved 的人續不到期 → 手上 token 到期後就進不來）
 * - 個人資料（暱稱/大頭貼，跟登入時同一條路徑，所以顯示名稱不會因為續期而倒退）
 * - isOwner
 *
 * token 已經過期就只能重新登入（回 401）——這裡刻意不接受過期 token，不然「有效期」等於沒有意義。
 */
export async function handleAuthRefresh(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const email = auth.session.email;
	if (!email) {
		// 很舊的 token 沒有 email 欄位，沒辦法重新確認存取權 → 請他重新登入
		return jsonResponse({ error: "請重新登入" }, 401);
	}
	if (!(await isStillApproved(env, email))) {
		return jsonResponse({ error: "這個帳號的存取權已被移除，請聯絡管理員。" }, 403);
	}

	const profile = await getProfile(env, email);
	const googleName = auth.session.googleName ?? auth.session.name;
	const googleAvatar = auth.session.googleAvatar ?? auth.session.avatar;
	const identity = await effectiveIdentity(request, env, { name: googleName, avatar: googleAvatar }, profile);
	const owner = isOwner(env, email);

	const token = await signSession(
		{
			sub: auth.session.sub,
			name: identity.name,
			email,
			avatar: identity.avatar,
			googleName,
			googleAvatar,
			isOwner: owner,
		},
		env.JWT_SECRET,
		SESSION_TTL_SECONDS,
	);

	return jsonResponse({
		token,
		user: { name: identity.name, avatar: identity.avatar, isOwner: owner, email: email.toLowerCase() },
		expiresIn: SESSION_TTL_SECONDS,
	});
}
