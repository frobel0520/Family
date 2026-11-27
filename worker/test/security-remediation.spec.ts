import { createExecutionContext, env as cfEnv, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { OAUTH_TX_COOKIE, SESSION_COOKIE } from "../src/cookie";
import { updateJsonArrayFile } from "../src/github-contents";
import { signOAuthTransaction } from "../src/google-oauth";
import { MAX_AVATAR_BYTES, MAX_IMAGE_BYTES, validateBase64Image } from "../src/image-upload";
import { signSession } from "../src/jwt";
import {
	MAX_SUBSCRIPTIONS_PER_USER,
	MAX_TOTAL_SUBSCRIPTIONS,
	listAllSubscriptions,
	saveSubscription,
} from "../src/notify";
import { isValidSubscription } from "../src/routes/push";

const SECRET = "synthetic-remediation-jwt-secret-32chars";
const baseEnv: Env = {
	...cfEnv,
	GOOGLE_CLIENT_ID: "synthetic-google-client-id",
	GOOGLE_CLIENT_SECRET: "synthetic-google-client-secret",
	JWT_SECRET: SECRET,
	OWNER_EMAIL: "owner@example.com",
	GITHUB_REPO: "example/synthetic-family-data",
	GITHUB_BOT_PAT: "synthetic-github-pat",
};

const ctx = {
	waitUntil: vi.fn(),
	passThroughOnException: () => {},
} as unknown as ExecutionContext;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

const VALID_JPEG_B64 = bytesToBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));
const VALID_PNG_B64 = bytesToBase64(
	new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
);
const VALID_WEBP_B64 = bytesToBase64(
	new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]),
);

async function ownerCookie(): Promise<string> {
	const tok = await signSession(
		{ sub: "owner-sub", name: "Owner", email: "owner@example.com", avatar: "", isOwner: true },
		SECRET,
		3600,
	);
	return `${SESSION_COOKIE}=${tok}`;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("Google OAuth state + PKCE (S256) + email_verified enforcement", () => {
	it("starts OAuth with S256 PKCE challenge, signed __Host-family_oauth_tx cookie, and /Family/ redirect_uri", async () => {
		const res = await worker.fetch(new Request("https://family.example.com/api/auth/start"), baseEnv, ctx);
		expect(res.status).toBe(302);

		const location = res.headers.get("Location")!;
		expect(location).toBeTruthy();
		const authUrl = new URL(location);
		expect(authUrl.origin + authUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(authUrl.searchParams.get("client_id")).toBe("synthetic-google-client-id");
		expect(authUrl.searchParams.get("redirect_uri")).toBe("https://family.example.com/Family/");
		expect(authUrl.searchParams.get("response_type")).toBe("code");
		expect(authUrl.searchParams.get("scope")).toBe("openid email profile");
		expect(authUrl.searchParams.get("prompt")).toBe("select_account");
		expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");

		const state = authUrl.searchParams.get("state")!;
		const codeChallenge = authUrl.searchParams.get("code_challenge")!;
		expect(state.length).toBeGreaterThanOrEqual(32);
		expect(codeChallenge.length).toBeGreaterThanOrEqual(43);

		const setCookie = res.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain(`${OAUTH_TX_COOKIE}=`);
		expect(setCookie).toContain("Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600");

		const txCookiePair = setCookie.split(";")[0];

		let capturedCodeVerifier = "";
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input);
			if (url === "https://oauth2.googleapis.com/token") {
				const params = new URLSearchParams(String(init?.body ?? ""));
				capturedCodeVerifier = params.get("code_verifier") ?? "";
				return new Response(JSON.stringify({ access_token: "synthetic-access-tok" }), { status: 200 });
			}
			if (url === "https://www.googleapis.com/oauth2/v3/userinfo") {
				return new Response(
					JSON.stringify({
						sub: "google-sub-1",
						name: "Family Owner",
						email: "owner@example.com",
						email_verified: true,
						picture: "https://lh3.googleusercontent.com/a/photo",
					}),
					{ status: 200 },
				);
			}
			if (url.includes("/contents/data/profiles.json")) {
				return new Response(JSON.stringify({ content: btoa("[]"), sha: "prof-sha" }), { status: 200 });
			}
			return new Response("{}", { status: 200 });
		});

		const execCtx = createExecutionContext();
		const callbackRes = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: txCookiePair,
				},
				body: JSON.stringify({
					code: "google-auth-code",
					state,
					redirectUri: "https://family.example.com/Family/",
				}),
			}),
			baseEnv,
			execCtx,
		);
		await waitOnExecutionContext(execCtx);
		expect(callbackRes.status).toBe(200);

		// Verify PKCE code_verifier hashes to the exact S256 code_challenge from /api/auth/start
		expect(capturedCodeVerifier.length).toBeGreaterThanOrEqual(43);
		const verifierDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capturedCodeVerifier));
		const computedChallenge = bytesToBase64(new Uint8Array(verifierDigest))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(computedChallenge).toBe(codeChallenge);

		// Verify __Host-family_oauth_tx is cleared and __Host-family_session is set
		const cookies = callbackRes.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith(`${OAUTH_TX_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
		expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`) && c.includes("HttpOnly"))).toBe(true);
	});

	it("rejects callback when state is missing, mismatched, tampered, or expired before network calls", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const validTx = await signOAuthTransaction(
			{ state: "expected-state-value-123456", codeVerifier: "v".repeat(44) },
			SECRET,
			600,
		);

		// Missing state
		const missingState = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: `${OAUTH_TX_COOKIE}=${validTx}`,
				},
				body: JSON.stringify({ code: "abc", redirectUri: "https://family.example.com/Family/" }),
			}),
			baseEnv,
			ctx,
		);
		expect(missingState.status).toBe(400);

		// Mismatched state
		const wrongState = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: `${OAUTH_TX_COOKIE}=${validTx}`,
				},
				body: JSON.stringify({
					code: "abc",
					state: "wrong-state-value-999999",
					redirectUri: "https://family.example.com/Family/",
				}),
			}),
			baseEnv,
			ctx,
		);
		expect(wrongState.status).toBe(400);

		// Tampered cookie signature
		const tamperedCookie = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: `${OAUTH_TX_COOKIE}=${validTx}tampered`,
				},
				body: JSON.stringify({
					code: "abc",
					state: "expected-state-value-123456",
					redirectUri: "https://family.example.com/Family/",
				}),
			}),
			baseEnv,
			ctx,
		);
		expect(tamperedCookie.status).toBe(400);

		// Expired cookie
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-27T00:00:00Z"));
		const shortTx = await signOAuthTransaction(
			{ state: "expiring-state", codeVerifier: "v".repeat(44) },
			SECRET,
			600,
		);
		vi.setSystemTime(new Date("2026-11-27T00:10:01Z"));
		const expiredRes = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: `${OAUTH_TX_COOKIE}=${shortTx}`,
				},
				body: JSON.stringify({
					code: "abc",
					state: "expiring-state",
					redirectUri: "https://family.example.com/Family/",
				}),
			}),
			baseEnv,
			ctx,
		);
		expect(expiredRes.status).toBe(400);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects Google accounts where email_verified is not true", async () => {
		const validTx = await signOAuthTransaction(
			{ state: "verified-check-state", codeVerifier: "k".repeat(44) },
			SECRET,
			600,
		);
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url === "https://oauth2.googleapis.com/token") {
				return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
			}
			if (url === "https://www.googleapis.com/oauth2/v3/userinfo") {
				return new Response(
					JSON.stringify({
						sub: "unverified-1",
						name: "Unverified",
						email: "owner@example.com",
						email_verified: false,
						picture: "",
					}),
					{ status: 200 },
				);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const res = await worker.fetch(
			new Request("https://family.example.com/api/auth/callback", {
				method: "POST",
				headers: {
					Origin: "https://family.example.com",
					"Content-Type": "application/json",
					Cookie: `${OAUTH_TX_COOKIE}=${validTx}`,
				},
				body: JSON.stringify({
					code: "code-1",
					state: "verified-check-state",
					redirectUri: "https://family.example.com/Family/",
				}),
			}),
			baseEnv,
			ctx,
		);
		expect(res.status).toBe(401);
		const cookies = res.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith(`${OAUTH_TX_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
	});
});

describe("Web Push SSRF allowlist & subscription caps", () => {
	const validKeys = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6", auth: "BTBZMqHH6r4Tts7J_aSIgg" };

	it("accepts only HTTPS port-443 browser Web Push endpoints without credentials", () => {
		expect(isValidSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/123", keys: validKeys })).toBe(true);
		expect(
			isValidSubscription({
				endpoint: "https://updates.push.services.mozilla.com/wpush/v2/123",
				keys: validKeys,
			}),
		).toBe(true);
		expect(isValidSubscription({ endpoint: "https://web.push.apple.com/Q123", keys: validKeys })).toBe(true);
		expect(
			isValidSubscription({
				endpoint: "https://wns2-bl2p.notify.windows.com/w/?token=abc",
				keys: validKeys,
			}),
		).toBe(true);

		// SSRF & malformed endpoints must be rejected
		expect(isValidSubscription({ endpoint: "http://fcm.googleapis.com/fcm/send/123", keys: validKeys })).toBe(false);
		expect(isValidSubscription({ endpoint: "https://fcm.googleapis.com:8443/fcm/send/123", keys: validKeys })).toBe(
			false,
		);
		expect(
			isValidSubscription({
				endpoint: "https://user:pass@fcm.googleapis.com/fcm/send/123",
				keys: validKeys,
			}),
		).toBe(false);
		expect(isValidSubscription({ endpoint: "https://169.254.169.254/latest/meta-data", keys: validKeys })).toBe(
			false,
		);
		expect(isValidSubscription({ endpoint: "https://localhost/push", keys: validKeys })).toBe(false);
		expect(isValidSubscription({ endpoint: "https://evil-fcm.googleapis.com/fcm/send/123", keys: validKeys })).toBe(
			false,
		);
		expect(
			isValidSubscription({
				endpoint: "https://fcm.googleapis.com.attacker.example/fcm/send/123",
				keys: validKeys,
			}),
		).toBe(false);
		expect(isValidSubscription({ endpoint: "https://storage.googleapis.com/bucket/secret", keys: validKeys })).toBe(
			false,
		);
	});

	it("enforces max 5 devices per user and max 30 total KV subscriptions by evicting oldest", async () => {
		// Clear KV first
		const initial = await cfEnv.PUSH_SUBS.list({ prefix: "sub:" });
		await Promise.all(initial.keys.map((k) => cfEnv.PUSH_SUBS.delete(k.name)));

		// Add 6 subscriptions for alice -> oldest (dev-0) must be evicted, keeping 5
		for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER + 1; i++) {
			await saveSubscription(baseEnv, {
				subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/alice-${i}`, keys: validKeys },
				email: "alice@example.com",
				name: "Alice",
				createdAt: `2026-11-27T00:00:0${i}.000Z`,
			});
		}
		const afterAlice = await listAllSubscriptions(baseEnv);
		expect(afterAlice).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER);
		expect(afterAlice.some((s) => s.value.subscription.endpoint.endsWith("/alice-0"))).toBe(false);
		expect(afterAlice.some((s) => s.value.subscription.endpoint.endsWith("/alice-1"))).toBe(true);

		// Fill up to 31 total across multiple users -> total must stay capped at MAX_TOTAL_SUBSCRIPTIONS (30)
		let seq = 10;
		for (let u = 1; u <= 6; u++) {
			for (let d = 0; d < 5; d++) {
				seq += 1;
				await saveSubscription(baseEnv, {
					subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/u${u}-d${d}`, keys: validKeys },
					email: `user${u}@example.com`,
					name: `User ${u}`,
					createdAt: `2026-11-27T01:${String(seq).padStart(2, "0")}:00.000Z`,
				});
			}
		}

		const afterGlobal = await listAllSubscriptions(baseEnv);
		expect(afterGlobal).toHaveLength(MAX_TOTAL_SUBSCRIPTIONS);
		// Oldest entries (alice-1..alice-5 had 00:00 timestamps) were evicted first so total stays 30
		expect(afterGlobal.some((s) => s.value.email === "alice@example.com")).toBe(false);
	});
});

describe("Base64 image validator, board delete cleanup, and 409 SHA conflict retry", () => {
	it("validates JPEG/PNG/WebP magic bytes and enforces max decoded byte limits", () => {
		expect(validateBase64Image(`data:image/jpeg;base64,${VALID_JPEG_B64}`).mimeType).toBe("image/jpeg");
		expect(validateBase64Image(`data:image/png;base64,${VALID_PNG_B64}`).mimeType).toBe("image/png");
		expect(validateBase64Image(VALID_WEBP_B64).mimeType).toBe("image/webp");

		// Reject disguised SVG / arbitrary payload
		const svgB64 = btoa("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
		expect(() => validateBase64Image(`data:image/jpeg;base64,${svgB64}`)).toThrow();

		// Reject oversized avatar (> 512 KB) before GitHub upload
		const hugeBytes = new Uint8Array(MAX_AVATAR_BYTES + 16);
		hugeBytes[0] = 0xff;
		hugeBytes[1] = 0xd8;
		hugeBytes[2] = 0xff;
		const hugeB64 = bytesToBase64(hugeBytes);
		expect(() => validateBase64Image(hugeB64, MAX_AVATAR_BYTES)).toThrow(/過大/);
		expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
	});

	it("blocks invalid image uploads across board, recipes, and profile routes without writing to GitHub", async () => {
		const cookie = await ownerCookie();
		let putCalls = 0;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
			if (init?.method === "PUT") putCalls += 1;
			return new Response(JSON.stringify({ content: btoa("[]"), sha: "sha-1" }), { status: 200 });
		});

		const badB64 = `data:image/jpeg;base64,${btoa("not-an-image-at-all")}`;

		const boardRes = await worker.fetch(
			new Request("https://family.example.com/api/board", {
				method: "POST",
				headers: { Origin: "https://family.example.com", Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ content: "Hello", imagesBase64: [badB64] }),
			}),
			baseEnv,
			ctx,
		);
		expect(boardRes.status).toBe(400);

		const recipeRes = await worker.fetch(
			new Request("https://family.example.com/api/recipes", {
				method: "POST",
				headers: { Origin: "https://family.example.com", Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ name: "紅燒肉", category: "meat", recipeImageBase64: badB64 }),
			}),
			baseEnv,
			ctx,
		);
		expect(recipeRes.status).toBe(400);

		const profileRes = await worker.fetch(
			new Request("https://family.example.com/api/profile", {
				method: "POST",
				headers: { Origin: "https://family.example.com", Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ avatar: { base64: badB64 } }),
			}),
			baseEnv,
			ctx,
		);
		expect(profileRes.status).toBe(400);
		expect(putCalls).toBe(0);
	});

	it("deletes associated board post & comment images on best-effort basis when deleting post or comment", async () => {
		const cookie = await ownerCookie();
		const deletedPaths: string[] = [];
		let currentPosts = [
			{
				id: "post-del-1",
				author: "Owner",
				authorEmail: "owner@example.com",
				content: "With photos",
				imagePaths: ["images/board/post-del-1-1.jpg"],
				createdAt: "2026-11-27T00:00:00Z",
				updatedAt: "2026-11-27T00:00:00Z",
				comments: [
					{
						id: "c-1",
						author: "Owner",
						authorEmail: "owner@example.com",
						content: "",
						imagePaths: ["images/board/comments/c-1-1.jpg"],
						createdAt: "2026-11-27T00:01:00Z",
					},
					{
						id: "c-2",
						author: "Owner",
						authorEmail: "owner@example.com",
						content: "",
						imagePaths: ["images/board/comments/c-2-1.jpg"],
						createdAt: "2026-11-27T00:02:00Z",
					},
				],
			},
		];

		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (url.endsWith("/contents/data/board.json") && method === "GET") {
				return new Response(JSON.stringify({ content: btoa(JSON.stringify(currentPosts)), sha: "board-sha" }), {
					status: 200,
				});
			}
			if (url.endsWith("/contents/data/board.json") && method === "PUT") {
				const parsed = JSON.parse(String(init?.body ?? "{}")) as { content: string };
				currentPosts = JSON.parse(atob(parsed.content));
				return new Response("{}", { status: 200 });
			}
			if (url.includes("/contents/images/board/") && method === "GET") {
				return new Response(JSON.stringify({ content: "", sha: "img-sha-123" }), { status: 200 });
			}
			if (url.includes("/contents/images/board/") && method === "DELETE") {
				const idx = url.indexOf("images/board/");
				deletedPaths.push(url.slice(idx));
				return new Response("{}", { status: 200 });
			}
			return new Response("{}", { status: 404 });
		});

		// Delete comment c-1 -> deletes c-1's image
		const delCommentRes = await worker.fetch(
			new Request("https://family.example.com/api/board/comment/delete", {
				method: "POST",
				headers: { Origin: "https://family.example.com", Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ postId: "post-del-1", commentId: "c-1" }),
			}),
			baseEnv,
			ctx,
		);
		expect(delCommentRes.status).toBe(200);
		expect(deletedPaths).toEqual(["images/board/comments/c-1-1.jpg"]);

		// Delete post-del-1 -> deletes post image AND remaining comment c-2's image
		const delPostRes = await worker.fetch(
			new Request("https://family.example.com/api/board/delete", {
				method: "POST",
				headers: { Origin: "https://family.example.com", Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ id: "post-del-1" }),
			}),
			baseEnv,
			ctx,
		);
		expect(delPostRes.status).toBe(200);
		expect(deletedPaths).toEqual([
			"images/board/comments/c-1-1.jpg",
			"images/board/post-del-1-1.jpg",
			"images/board/comments/c-2-1.jpg",
		]);
	});

	it("retries updateJsonFile up to 2 times on GitHub 409 SHA conflicts", async () => {
		let getCount = 0;
		let putCount = 0;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
			if (init?.method === "PUT") {
				putCount += 1;
				if (putCount <= 2) {
					return new Response("SHA conflict", { status: 409 });
				}
				return new Response("{}", { status: 200 });
			}
			getCount += 1;
			return new Response(
				JSON.stringify({ content: btoa(JSON.stringify([`item-${getCount}`])), sha: `sha-${getCount}` }),
				{ status: 200 },
			);
		});

		const updated = await updateJsonArrayFile<string>(
			baseEnv,
			"data/orders.json",
			(items) => [...items, "new-item"],
			"orders: add item",
		);
		expect(putCount).toBe(3); // 1 initial + 2 retries
		expect(updated).toEqual(["item-3", "new-item"]);
	});
});
