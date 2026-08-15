import { readJsonArrayFile, updateJsonArrayFile } from "./github-contents";
import { imageProxyUrl, storedAvatarUrl } from "./image-url";

/**
 * 個人資料（暱稱＋自訂大頭貼），存 data/profiles.json。
 * 沒有 profile 或欄位為空 → 一律用 Google 帳號的名字/大頭貼。
 * 登入時套用（見 routes/auth.ts），所以暱稱會直接變成 session.name，
 * 後續發文/留言/點菜的顯示名稱都自動跟著走。
 */

export interface Profile {
	email: string; // 小寫，主鍵
	nickname?: string | null;
	avatarPath?: string | null; // repo 相對路徑（images/avatars/....jpg）；null/undefined = 用 Google 大頭貼
	avatarUpdatedAt?: string; // 換圖時間，前端當快取破壞參數
	/**
	 * 登入時記下的 Google 名字／大頭貼。本來不需要（session 裡就有），
	 * 但「列出全家人」時對方不一定在線上，沒有這份快照就只剩 email 可以顯示。
	 */
	googleName?: string;
	googleAvatar?: string;
	updatedAt: string;
}

const PROFILES_PATH = "data/profiles.json";

export async function getProfile(env: Env, email: string): Promise<Profile | null> {
	const profiles = await readJsonArrayFile<Profile>(env, PROFILES_PATH);
	return profiles.find((p) => p.email === email.toLowerCase()) ?? null;
}

export function listProfiles(env: Env): Promise<Profile[]> {
	return readJsonArrayFile<Profile>(env, PROFILES_PATH);
}

/** 先用 email 精準比對；更舊的資料沒有 email 時，只接受唯一的相同暱稱，避免認錯人。 */
export function findProfileForStoredAuthor(
	profiles: Profile[],
	authorEmail?: string,
	authorName?: string,
): Profile | null {
	if (authorEmail) {
		return profiles.find((profile) => profile.email === authorEmail.toLowerCase()) ?? null;
	}
	const normalizedName = authorName?.trim();
	if (!normalizedName) return null;
	const matches = profiles.filter((profile) => profile.nickname?.trim() === normalizedName);
	return matches.length === 1 ? matches[0] : null;
}

export async function upsertProfile(
	env: Env,
	email: string,
	mutate: (current: Profile) => Profile,
	message: string,
): Promise<Profile> {
	const normalized = email.toLowerCase();
	let result: Profile = { email: normalized, updatedAt: new Date().toISOString() };
	await updateJsonArrayFile<Profile>(env, PROFILES_PATH, (profiles) => {
		const existing = profiles.find((p) => p.email === normalized) ?? {
			email: normalized,
			updatedAt: new Date().toISOString(),
		};
		result = { ...mutate(existing), email: normalized, updatedAt: new Date().toISOString() };
		return [...profiles.filter((p) => p.email !== normalized), result];
	}, message);
	return result;
}

/**
 * 登入時把 Google 的名字/大頭貼記進 profile，給「列出全家人」當顯示名用。
 * **只有在跟存檔的值不一樣時才寫**——不然每次登入都會多一個 commit。
 */
export async function rememberGoogleIdentity(
	env: Env,
	user: { email: string; name: string; avatar: string },
): Promise<void> {
	const profile = await getProfile(env, user.email);
	if (profile?.googleName === user.name && profile?.googleAvatar === user.avatar) return;
	await upsertProfile(
		env,
		user.email,
		(current) => ({ ...current, googleName: user.name, googleAvatar: user.avatar }),
		`profile: 記下 ${user.email.toLowerCase()} 的 Google 名稱`,
	);
}

/** 大頭貼的簽章轉發網址（repo 是 private，不能再直接連 raw.githubusercontent.com；見 image-url.ts）。 */
export async function avatarProxyUrl(request: Request, env: Env, profile: Profile): Promise<string | null> {
	if (!profile.avatarPath) return null;
	return imageProxyUrl(request, profile.avatarPath, env.JWT_SECRET, profile.avatarUpdatedAt);
}

/**
 * 歷史資料可能沒有 avatar，或仍存著 private-repo 搬遷前的 raw URL。
 * 有作者身分時優先使用目前 profile 的自訂頭貼，否則再修復／保留當年的快照。
 */
export async function avatarForStoredAuthor(
	request: Request,
	env: Env,
	profiles: Profile[],
	author: { authorEmail?: string; authorName?: string; avatar?: string },
): Promise<string | null> {
	const profile = findProfileForStoredAuthor(profiles, author.authorEmail, author.authorName);
	const currentCustomAvatar = profile ? await avatarProxyUrl(request, env, profile) : null;
	return currentCustomAvatar ?? storedAvatarUrl(request, author.avatar, env.JWT_SECRET);
}

/** 套用 profile：算出實際顯示的名稱與大頭貼。 */
export async function effectiveIdentity(
	request: Request,
	env: Env,
	googleUser: { name: string; avatar: string },
	profile: Profile | null,
): Promise<{ name: string; avatar: string }> {
	const customAvatar = profile ? await avatarProxyUrl(request, env, profile) : null;
	return {
		name: profile?.nickname?.trim() || googleUser.name,
		avatar: customAvatar || googleUser.avatar,
	};
}

/** 大頭貼檔名用 email 的雜湊（避免 email 直接出現在公開 repo 的檔名裡）。 */
export async function avatarPathForEmail(email: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
	const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `images/avatars/${hex.slice(0, 16)}.jpg`;
}
