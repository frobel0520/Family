/**
 * Web Push（RFC 8291 aes128gcm 加密 + RFC 8292 VAPID 簽章），純 WebCrypto 實作。
 * 不用 npm 的 web-push（Node 專用，Workers 跑不了）。
 * 加密流程有 vitest 測試對照 RFC 8291 附錄 A 的官方測試向量（test/web-push.spec.ts）。
 */

export interface PushSubscriptionJSON {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

export function base64UrlToBytes(str: string): Uint8Array {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, a) => sum + a.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		out.set(a, offset);
		offset += a.length;
	}
	return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
		key,
		length * 8,
	);
	return new Uint8Array(bits);
}

/**
 * RFC 8291 aes128gcm 加密。
 * asKeyPair/salt 可注入固定值（測試對照 RFC 官方向量用），正式呼叫都用隨機值。
 */
export async function encryptPayload(
	uaPublicB64: string,
	authSecretB64: string,
	plaintext: Uint8Array,
	testOverrides?: { asKeyPair?: CryptoKeyPair; salt?: Uint8Array },
): Promise<Uint8Array> {
	const uaPublicBytes = base64UrlToBytes(uaPublicB64);
	const authSecret = base64UrlToBytes(authSecretB64);
	const salt = testOverrides?.salt ?? crypto.getRandomValues(new Uint8Array(16));

	// application server 的臨時 ECDH 金鑰對
	const asKeyPair =
		testOverrides?.asKeyPair ??
		((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
			"deriveBits",
		])) as CryptoKeyPair);
	const asPublicBytes = new Uint8Array((await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer);

	// ECDH shared secret（user agent 公鑰 × as 私鑰）
	const uaPublicKey = await crypto.subtle.importKey(
		"raw",
		uaPublicBytes as BufferSource,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	// workers-types 把 ECDH 參數的 `public` 拼成 `$public`，但 runtime 認的是 `public`
	// （有 vitest 對 RFC 8291 官方向量的測試掛保證），所以這裡繞過型別檢查。
	const ecdhAlgorithm = { name: "ECDH", public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
	const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlgorithm, asKeyPair.privateKey, 256));

	// IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
	const keyInfo = concat(new TextEncoder().encode("WebPush: info\0"), uaPublicBytes, asPublicBytes);
	const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

	// CEK / NONCE
	const cekBytes = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

	// 單一 record：plaintext || 0x02（最後一筆的 padding delimiter）
	const record = concat(plaintext, new Uint8Array([2]));
	const cek = await crypto.subtle.importKey("raw", cekBytes as BufferSource, "AES-GCM", false, ["encrypt"]);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, cek, record as BufferSource),
	);

	// header: salt(16) || rs(4, uint32 BE) || idlen(1) || as_public(65)
	const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublicBytes.length;
	header.set(asPublicBytes, 21);

	return concat(header, ciphertext);
}

/** RFC 8292 VAPID：ES256 JWT，Authorization: vapid t=<jwt>, k=<public key> */
export async function buildVapidAuth(
	endpoint: string,
	publicKeyB64: string,
	privateJwkJson: string,
	subject: string,
): Promise<string> {
	const audience = new URL(endpoint).origin;
	const header = { typ: "JWT", alg: "ES256" };
	const payload = {
		aud: audience,
		exp: Math.floor(Date.now() / 1000) + 12 * 3600,
		sub: subject,
	};
	const enc = (obj: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
	const signingInput = `${enc(header)}.${enc(payload)}`;

	const privateKey = await crypto.subtle.importKey(
		"jwk",
		JSON.parse(privateJwkJson),
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	// WebCrypto 的 ECDSA 簽章直接是 r||s（64 bytes），正好是 JWT ES256 要的格式
	const signature = new Uint8Array(
		await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput)),
	);
	return `vapid t=${signingInput}.${bytesToBase64Url(signature)}, k=${publicKeyB64}`;
}

export type PushResult = "ok" | "gone" | "error";

/** 送一則推播；回傳 "gone" 表示訂閱已失效（裝置解除安裝等），呼叫端應清掉。 */
export async function sendWebPush(
	env: Env,
	subscription: PushSubscriptionJSON,
	payload: { title: string; body: string; url?: string },
): Promise<PushResult> {
	try {
		const body = await encryptPayload(
			subscription.keys.p256dh,
			subscription.keys.auth,
			new TextEncoder().encode(JSON.stringify(payload)),
		);
		const auth = await buildVapidAuth(
			subscription.endpoint,
			env.VAPID_PUBLIC_KEY,
			env.VAPID_PRIVATE_JWK,
			env.VAPID_SUBJECT,
		);
		const response = await fetch(subscription.endpoint, {
			method: "POST",
			headers: {
				Authorization: auth,
				"Content-Encoding": "aes128gcm",
				"Content-Type": "application/octet-stream",
				TTL: "86400",
				Urgency: "normal",
			},
			body: body as BodyInit,
		});
		if (response.status === 404 || response.status === 410) return "gone";
		return response.ok ? "ok" : "error";
	} catch {
		return "error";
	}
}
