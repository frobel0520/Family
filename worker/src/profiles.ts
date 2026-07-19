import { readJsonArrayFile, updateJsonArrayFile } from "./github-contents";

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
	updatedAt: string;
}

const PROFILES_PATH = "data/profiles.json";

export async function getProfile(env: Env, email: string): Promise<Profile | null> {
	const profiles = await readJsonArrayFile<Profile>(env, PROFILES_PATH);
	return profiles.find((p) => p.email === email.toLowerCase()) ?? null;
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

/** 大頭貼的 raw URL（帶快取破壞參數，換圖後不會看到舊圖） */
export function avatarRawUrl(env: Env, profile: Profile): string | null {
	if (!profile.avatarPath) return null;
	const version = profile.avatarUpdatedAt ? `?v=${encodeURIComponent(profile.avatarUpdatedAt)}` : "";
	return `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${profile.avatarPath}${version}`;
}

/** 套用 profile：算出實際顯示的名稱與大頭貼。 */
export function effectiveIdentity(
	env: Env,
	googleUser: { name: string; avatar: string },
	profile: Profile | null,
): { name: string; avatar: string } {
	return {
		name: profile?.nickname?.trim() || googleUser.name,
		avatar: (profile && avatarRawUrl(env, profile)) || googleUser.avatar,
	};
}

/** 大頭貼檔名用 email 的雜湊（避免 email 直接出現在公開 repo 的檔名裡）。 */
export async function avatarPathForEmail(email: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
	const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `images/avatars/${hex.slice(0, 16)}.jpg`;
}
