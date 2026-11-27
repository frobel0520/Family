/**
 * Google OAuth code -> access_token exchange, and user info lookup.
 * The access_token is used once (to identify the user) and then discarded —
 * it is never stored or returned to the frontend. Writes to the repo happen
 * separately via a bot PAT (see github-contents.ts).
 */

export interface GoogleUser {
	id: string; // stable, opaque account id (the "sub" claim) — not human-readable
	name: string;
	email: string;
	avatar: string;
}

export class GoogleOAuthError extends Error {}

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

async function importOAuthHmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

/** Generates a URL-safe cryptographic random string (32 bytes -> 43 base64url chars, RFC 7636 valid). */
export function generateOAuthRandomToken(byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

/** Computes RFC 7636 PKCE S256 code_challenge = BASE64URL(SHA256(ASCII(code_verifier))). */
export async function computePkceS256Challenge(codeVerifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
	return base64UrlEncode(new Uint8Array(digest));
}

/** Constant-time string comparison for OAuth CSRF state verification. */
export function constantTimeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.byteLength; i++) {
		diff |= aBytes[i] ^ bBytes[i];
	}
	return diff === 0;
}

export interface OAuthTransactionPayload {
	state: string;
	codeVerifier: string;
	iat: number;
	exp: number;
}

export async function signOAuthTransaction(
	params: { state: string; codeVerifier: string },
	secret: string,
	ttlSeconds = 600,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const payload: OAuthTransactionPayload = {
		state: params.state,
		codeVerifier: params.codeVerifier,
		iat: now,
		exp: now + ttlSeconds,
	};
	const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const key = await importOAuthHmacKey(secret);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`oauth_tx.${encodedPayload}`));
	return `${encodedPayload}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyOAuthTransaction(
	token: string,
	secret: string,
): Promise<OAuthTransactionPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [encodedPayload, encodedSig] = parts;
	if (!encodedPayload || !encodedSig) return null;

	try {
		const key = await importOAuthHmacKey(secret);
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			base64UrlDecode(encodedSig) as BufferSource,
			new TextEncoder().encode(`oauth_tx.${encodedPayload}`),
		);
		if (!valid) return null;

		const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as Partial<OAuthTransactionPayload>;
		if (
			typeof parsed.state !== "string" ||
			!parsed.state ||
			typeof parsed.codeVerifier !== "string" ||
			parsed.codeVerifier.length < 43 ||
			typeof parsed.iat !== "number" ||
			typeof parsed.exp !== "number"
		) {
			return null;
		}
		if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
		return parsed as OAuthTransactionPayload;
	} catch {
		return null;
	}
}

export async function exchangeCodeForTokens(
	code: string,
	redirectUri: string,
	clientId: string,
	clientSecret: string,
	codeVerifier: string,
): Promise<string> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
			code_verifier: codeVerifier,
		}),
	});

	const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

	if (!response.ok || !data.access_token) {
		throw new GoogleOAuthError(data.error_description ?? data.error ?? `Token exchange failed with status ${response.status}`);
	}

	return data.access_token;
}

export const exchangeCodeForAccessToken = exchangeCodeForTokens;

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
	const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		throw new GoogleOAuthError(`Google user lookup failed with status ${response.status}`);
	}

	const data = (await response.json()) as {
		sub?: string;
		name?: string;
		email?: string;
		email_verified?: boolean;
		picture?: string;
	};

	if (data.email_verified !== true || typeof data.email !== "string" || !data.email.trim()) {
		throw new GoogleOAuthError("Google 帳號信箱尚未驗證，無法登入。");
	}
	if (typeof data.sub !== "string" || !data.sub) {
		throw new GoogleOAuthError("Google user response missing 'sub'");
	}

	return {
		id: data.sub,
		name: data.name || data.email,
		email: data.email,
		avatar: data.picture ?? "",
	};
}
