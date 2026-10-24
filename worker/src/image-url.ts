/**
 * repo 是 private 之後，瀏覽器不能再直接打 raw.githubusercontent.com（沒有 GitHub 認證）。
 * 改成簽章過的轉發連結：Worker 用 HMAC 簽 repo 相對路徑，/api/image 驗證簽章通過才把圖轉發出去
 * （見 routes/image.ts）。
 *
 * v2 連結有效 24 小時，期限包含在 HMAC 簽章內；舊永久簽章不再接受。
 * 每次已授權 API 讀取都重新簽發，包括歷史資料儲存的頭貼網址。
 * 已取得的 bearer URL 在期限內仍可讀取，帳號撤銷不會撤回已下載的圖片。
 */

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
}

async function signPath(message: string, secret: string): Promise<string> {
	const key = await hmacKey(secret);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return base64UrlEncode(new Uint8Array(signature));
}

/** 圖片 capability 有效期；授權 API 回應會重新簽發。 */
export const IMAGE_URL_TTL_SECONDS = 24 * 60 * 60;

function signedMessage(path: string, version: string | null | undefined, expires: number): string {
	return JSON.stringify(["family-image-v2", path, version || null, expires]);
}

export async function verifyPathSignature(
	path: string,
	version: string | null,
	sig: string,
	secret: string,
): Promise<boolean> {
	const match = /^v2\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(sig);
	if (!match) return false;
	const expires = Number(match[1]);
	const now = Math.floor(Date.now() / 1000);
	if (!Number.isSafeInteger(expires) || expires <= now || expires > now + IMAGE_URL_TTL_SECONDS) return false;
	const expected = await signPath(signedMessage(path, version, expires), secret);
	let difference = 0;
	for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ match[2].charCodeAt(index);
	return difference === 0;
}

/**
 * 組出圖片轉發網址；path 是 null/undefined（沒圖）就回傳 null，方便直接塞進 imageUrl 欄位。
 * 圖片路徑不變但內容會換的情況（大頭貼、食譜圖）要傳 version（例如更新時間）：
 * 版本不同簽章就不同，URL 也跟著變，換圖後才不會被瀏覽器/CDN 快取卡住看到舊圖。
 */
export async function imageProxyUrl(
	request: Request,
	path: string | null | undefined,
	secret: string,
	version?: string | null,
): Promise<string | null> {
	if (!path) return null;
	const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
	const sig = `v2.${expires}.${await signPath(signedMessage(path, version, expires), secret)}`;
	const origin = new URL(request.url).origin;
	const versionParam = version ? `&v=${encodeURIComponent(version)}` : "";
	return `${origin}/api/image?path=${encodeURIComponent(path)}&sig=${sig}${versionParam}`;
}

/**
 * 舊貼文／留言曾把 public repo 的 raw GitHub 頭貼網址直接存進 JSON。
 * 資料 repo 改成 private 後那些網址會變成 404；讀取時把它們升級成目前的簽章 proxy URL。
 * Google 等外部頭貼網址維持原樣。
 */
export async function storedAvatarUrl(request: Request, avatar: string | null | undefined, secret: string): Promise<string | null> {
	if (!avatar) return null;

	let url: URL;
	try {
		url = new URL(avatar);
	} catch {
		return avatar;
	}
	// Persisted avatar URLs may be legacy permanent links or expired capabilities.
	// Re-sign only the avatar namespace; the API already authenticated the viewer.
	if (url.pathname === "/api/image") {
		const imagePath = url.searchParams.get("path");
		if (imagePath && /^images\/avatars\/[A-Za-z0-9._-]+\.(?:jpe?g|png)$/i.test(imagePath)) {
			return imageProxyUrl(request, imagePath, secret, url.searchParams.get("v"));
		}
		return null;
	}

	if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") return avatar;
	const match = url.pathname.match(/\/images\/avatars\/([A-Za-z0-9._-]+\.(?:jpe?g|png))$/i);
	if (!match) return avatar;

	return imageProxyUrl(request, `images/avatars/${match[1]}`, secret, url.searchParams.get("v"));
}
