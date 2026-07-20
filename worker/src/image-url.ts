/**
 * repo 是 private 之後，瀏覽器不能再直接打 raw.githubusercontent.com（沒有 GitHub 認證）。
 * 改成簽章過的轉發連結：Worker 用 HMAC 簽 repo 相對路徑，/api/image 驗證簽章通過才把圖轉發出去
 * （見 routes/image.ts）。
 *
 * 簽章刻意不設過期時間（不像 session token 24h 就失效）——這樣貼文/留言存的大頭貼快照網址、
 * 已經發過的貼文圖片網址才能一直有效，不會因為原 po 主的 session 過期就變成一張壞圖。安全性
 * 靠的是「這個連結只會出現在登入後才拿得到的 API 回應裡」，不是靠連結本身的保密期限——跟一般
 * 「有連結的人都能看」的雲端相簿分享連結是同一種模式。
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

/** version 有帶就併入簽章訊息（跟 imageProxyUrl 用同一套規則），换圖後舊連結的簽章對不上，不會被拿來冒充新圖。 */
function signedMessage(path: string, version?: string | null): string {
	return version ? `${path}#${version}` : path;
}

export async function verifyPathSignature(
	path: string,
	version: string | null,
	sig: string,
	secret: string,
): Promise<boolean> {
	return (await signPath(signedMessage(path, version), secret)) === sig;
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
	const sig = await signPath(signedMessage(path, version), secret);
	const origin = new URL(request.url).origin;
	const versionParam = version ? `&v=${encodeURIComponent(version)}` : "";
	return `${origin}/api/image?path=${encodeURIComponent(path)}&sig=${sig}${versionParam}`;
}
