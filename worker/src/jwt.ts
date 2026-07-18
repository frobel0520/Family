/**
 * Minimal HS256 JWT sign/verify using Web Crypto (SubtleCrypto).
 * Avoids pulling in a jsonwebtoken-style dependency for a single-purpose session token.
 */

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function textEncode(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", textEncode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
}

export interface SessionPayload {
	sub: string; // stable Google account id — not human-readable, use `name` for display
	name: string;
	avatar: string;
	iat: number;
	exp: number;
}

export async function signSession(
	payload: Omit<SessionPayload, "iat" | "exp">,
	secret: string,
	expiresInSeconds: number,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const fullPayload: SessionPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

	const header = { alg: "HS256", typ: "JWT" };
	const encodedHeader = base64UrlEncode(textEncode(JSON.stringify(header)));
	const encodedPayload = base64UrlEncode(textEncode(JSON.stringify(fullPayload)));
	const signingInput = `${encodedHeader}.${encodedPayload}`;

	const key = await hmacKey(secret);
	const signature = await crypto.subtle.sign("HMAC", key, textEncode(signingInput));
	const encodedSignature = base64UrlEncode(new Uint8Array(signature));

	return `${signingInput}.${encodedSignature}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [encodedHeader, encodedPayload, encodedSignature] = parts;

	const key = await hmacKey(secret);
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	const signatureValid = await crypto.subtle.verify(
		"HMAC",
		key,
		base64UrlDecode(encodedSignature),
		textEncode(signingInput),
	);
	if (!signatureValid) return null;

	let payload: SessionPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
	} catch {
		return null;
	}

	if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;

	return payload;
}
