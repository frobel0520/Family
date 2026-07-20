import { requireSession } from "../session";
import { jsonResponse } from "../response";
import { putBase64File } from "../github-contents";
import { avatarPathForEmail, avatarProxyUrl, getProfile, upsertProfile } from "../profiles";
import { signSession } from "../jwt";
import { isOwner } from "../access";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 與 routes/auth.ts 一致

const NICKNAME_MAX = 20;

/** 目前的個人資料（給設定頁顯示用）。 */
export async function handleGetProfile(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const profile = await getProfile(env, auth.session.email);
	return jsonResponse({
		nickname: profile?.nickname ?? null,
		customAvatarUrl: profile ? await avatarProxyUrl(request, env, profile) : null,
		googleName: auth.session.googleName ?? auth.session.name,
		googleAvatar: auth.session.googleAvatar ?? auth.session.avatar,
	});
}

/**
 * 更新暱稱／大頭貼。body:
 *   { nickname?: string }                      — 空字串 = 清除暱稱（改回 Google 名字）
 *   { avatar?: "google" | { base64: string } } — "google" = 改回 Google 大頭貼
 * 回傳重新簽發的 session（新名稱/大頭貼立刻生效，前端要覆蓋 localStorage）。
 */
export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { nickname?: unknown; avatar?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	let nickname: string | null | undefined; // undefined = 不動、null = 清除
	if (body.nickname !== undefined) {
		if (typeof body.nickname !== "string") {
			return jsonResponse({ error: "Invalid 'nickname'" }, 400);
		}
		const trimmed = body.nickname.trim();
		if (trimmed.length > NICKNAME_MAX) {
			return jsonResponse({ error: `暱稱最多 ${NICKNAME_MAX} 個字` }, 400);
		}
		nickname = trimmed || null;
	}

	let avatarAction: "google" | { base64: string } | undefined;
	if (body.avatar !== undefined) {
		if (body.avatar === "google") {
			avatarAction = "google";
		} else if (
			typeof body.avatar === "object" &&
			body.avatar !== null &&
			typeof (body.avatar as { base64?: unknown }).base64 === "string"
		) {
			avatarAction = { base64: (body.avatar as { base64: string }).base64 };
		} else {
			return jsonResponse({ error: "Invalid 'avatar'" }, 400);
		}
	}

	if (nickname === undefined && avatarAction === undefined) {
		return jsonResponse({ error: "Nothing to update" }, 400);
	}

	const email = auth.session.email.toLowerCase();
	// 舊 token 沒有 googleName/googleAvatar，退而求其次用現值（下次重新登入就會補齊）
	const googleName = auth.session.googleName ?? auth.session.name;
	const googleAvatar = auth.session.googleAvatar ?? auth.session.avatar;

	// 先傳圖（要是圖傳失敗，profiles.json 就不動）
	let uploadedPath: string | undefined;
	if (avatarAction && avatarAction !== "google") {
		uploadedPath = await avatarPathForEmail(email);
		const base64 = avatarAction.base64.replace(/^data:.*;base64,/s, "");
		await putBase64File(env, uploadedPath, base64, `profile: avatar for ${auth.session.name}`);
	}

	const profile = await upsertProfile(env, email, (current) => ({
		...current,
		...(nickname !== undefined ? { nickname } : {}),
		...(avatarAction === "google" ? { avatarPath: null } : {}),
		...(uploadedPath ? { avatarPath: uploadedPath, avatarUpdatedAt: new Date().toISOString() } : {}),
	}), `profile: update by ${auth.session.name}`);

	const name = profile.nickname?.trim() || googleName;
	const avatar = (await avatarProxyUrl(request, env, profile)) ?? googleAvatar;
	const owner = isOwner(env, auth.session.email);

	const token = await signSession(
		{ sub: auth.session.sub, name, email: auth.session.email, avatar, googleName, googleAvatar, isOwner: owner },
		env.JWT_SECRET,
		SESSION_TTL_SECONDS,
	);

	return jsonResponse({
		token,
		user: { name, avatar, isOwner: owner, email },
		expiresIn: SESSION_TTL_SECONDS,
		profile: { nickname: profile.nickname ?? null, customAvatarUrl: await avatarProxyUrl(request, env, profile) },
	});
}
