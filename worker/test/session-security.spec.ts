import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../src/jwt";
import worker from "../src/index";
import { imageProxyUrl, IMAGE_URL_TTL_SECONDS, storedAvatarUrl, verifyPathSignature } from "../src/image-url";

const SECRET = "synthetic-session-security-secret";
const env = { JWT_SECRET: SECRET, OWNER_EMAIL: "owner@example.com", GITHUB_REPO: "example/synthetic-data", GITHUB_BOT_PAT: "synthetic-token" } as Env;
const context = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function allowlist(approved: string[]) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(JSON.stringify({
		content: btoa(JSON.stringify(String(url).endsWith("data/profiles.json") ? [] : { approved, pending: [] })), sha: "synthetic",
	}), { status: 200 }));
}

async function token(email = "member@example.com", isOwner = false) {
	return signSession({ sub: "synthetic-user", name: "Synthetic", email, avatar: "", isOwner }, SECRET, 30 * 86400);
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("actual API session boundaries", () => {
	it("executes inside the Workers runtime", () => {
		expect(typeof WebSocketPair).toBe("function");
		expect(typeof caches.default.match).toBe("function");
	});
	it("records warm fixture API latency with the approval check enabled", async () => {
		allowlist(["member@example.com"]);
		const headers = { Cookie: `__Host-family_session=${await token()}` };
		const samples: number[] = [];
		for (let index = 0; index < 55; index++) {
			const start = performance.now();
			const response = await worker.fetch(new Request("https://example.com/api/me", { headers }), env, context);
			expect(response.status).toBe(200);
			await response.text();
			if (index >= 5) samples.push(performance.now() - start);
		}
		samples.sort((left, right) => left - right);
		console.log("SECURITY_FIXTURE_PERFORMANCE=" + JSON.stringify({ samples: 50, warmup: 5, p50: samples[24], p95: samples[47], thresholdMs: 100, upstream: "synthetic immediate response; not production GitHub latency" }));
		expect(samples[47]).toBeLessThan(100);
	});
	it("accepts an approved member, then rejects the same token after removal", async () => {
		const fetch = allowlist(["member@example.com"]);
		const jwt = await token();
		const request = () => new Request("https://example.com/api/me", { headers: { Cookie: `__Host-family_session=${jwt}` } });
		expect((await worker.fetch(request(), env, context)).status).toBe(200);
		fetch.mockResolvedValue(new Response(JSON.stringify({ content: btoa(JSON.stringify({ approved: [], pending: [] })), sha: "synthetic" })));
		expect((await worker.fetch(request(), env, context)).status).toBe(403);
	});
	it("does not trust an old owner claim or bypass a failed approval read", async () => {
		const fetch = allowlist(["member@example.com"]);
		const headers = { Cookie: `__Host-family_session=${await token("member@example.com", true)}` };
		expect((await worker.fetch(new Request("https://example.com/api/admin/pending", { headers }), env, context)).status).toBe(403);
		fetch.mockRejectedValue(new Error("synthetic upstream failure"));
		expect((await worker.fetch(new Request("https://example.com/api/me", { headers }), env, context)).status).toBe(503);
	});
	it("fails closed when the approval source has the wrong schema", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ content: btoa(JSON.stringify({ approved: "member@example.com", pending: [] })), sha: "synthetic" })));
		const headers = { Cookie: `__Host-family_session=${await token()}` };
		expect((await worker.fetch(new Request("https://example.com/api/me", { headers }), env, context)).status).toBe(503);
	});
	it("rejects malformed credentials and permits the configured owner without a data read", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const bad = new Request("https://example.com/api/me", { headers: { Cookie: "__Host-family_session=a.b.%" } });
		expect((await worker.fetch(bad, env, context)).status).toBe(401);
		const owner = new Request("https://example.com/api/me", { headers: { Cookie: `__Host-family_session=${await token("owner@example.com")}` } });
		expect((await worker.fetch(owner, env, context)).status).toBe(200);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("cookie session and same-origin writes", () => {
	it("ignores bearer tokens issued to the old shared-origin frontend", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const request = new Request("https://example.com/api/me", { headers: { Authorization: `Bearer ${await token("owner@example.com")}` } });
		expect((await worker.fetch(request, env, context)).status).toBe(401);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("blocks writes from another origin or without origin evidence before any data access", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const cookie = `__Host-family_session=${await token("owner@example.com")}`;
		for (const headers of [
			{ Cookie: cookie, Origin: "https://frobel0520.github.io" },
			{ Cookie: cookie, Origin: "https://other.example.workers.dev" },
			{ Cookie: cookie, "Sec-Fetch-Site": "same-site" },
			{ Cookie: cookie },
		]) {
			const response = await worker.fetch(new Request("https://example.com/api/orders", { method: "POST", headers, body: "{}" }), env, context);
			expect(response.status).toBe(403);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		}
		expect(fetch).not.toHaveBeenCalled();
	});
	it("does not answer CORS preflights", async () => {
		const response = await worker.fetch(new Request("https://example.com/api/me", { method: "OPTIONS", headers: { Origin: "https://frobel0520.github.io" } }), env, context);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});
	it("clears the HttpOnly cookie on logout", async () => {
		const response = await worker.fetch(new Request("https://example.com/api/auth/logout", { method: "POST", headers: { Origin: "https://example.com" } }), env, context);
		expect(response.status).toBe(200);
		const cookie = response.headers.get("Set-Cookie") ?? "";
		expect(cookie).toMatch(/^__Host-family_session=;/);
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Strict");
		expect(cookie).toContain("Max-Age=0");
	});
	it("issues the refreshed session only as an HttpOnly cookie, never in the body", async () => {
		allowlist(["member@example.com"]);
		const response = await worker.fetch(new Request("https://example.com/api/auth/refresh", {
			method: "POST", headers: { Origin: "https://example.com", Cookie: `__Host-family_session=${await token()}` },
		}), env, context);
		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body.token).toBeUndefined();
		const cookie = response.headers.get("Set-Cookie") ?? "";
		expect(cookie).toMatch(/^__Host-family_session=[^;]+\.[^;]+\.[^;]+;/);
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Path=/");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
	it("rejects an OAuth redirect_uri other than this Worker's /Family/ page", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const response = await worker.fetch(new Request("https://example.com/api/auth/callback", {
			method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" },
			body: JSON.stringify({ code: "synthetic", redirectUri: "https://frobel0520.github.io/Family/" }),
		}), env, context);
		expect(response.status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("expiring image capabilities", () => {
	it("rejects expired, tampered expiry and legacy signatures with no upstream fetch", async () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
		const url = new URL((await imageProxyUrl(new Request("https://example.com"), "images/avatars/synthetic.jpg", SECRET))!);
		const sig = url.searchParams.get("sig")!;
		expect(await verifyPathSignature("images/avatars/synthetic.jpg", null, sig, SECRET)).toBe(true);
		const tampered = sig.replace(/v2\.(\d+)/, (_, seconds) => `v2.${Number(seconds) + 1}`);
		expect(await verifyPathSignature("images/avatars/synthetic.jpg", null, tampered, SECRET)).toBe(false);
		expect(await verifyPathSignature("images/avatars/synthetic.jpg", null, "legacy-signature", SECRET)).toBe(false);
		vi.setSystemTime(new Date(Date.now() + IMAGE_URL_TTL_SECONDS * 1000));
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		expect((await worker.fetch(new Request(url), env, context)).status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("refreshes persisted first-party avatar links, retaining the version", async () => {
		const stored = "https://example.com/api/image?path=images%2Favatars%2Fsynthetic.jpg&sig=legacy&v=old";
		const refreshed = new URL((await storedAvatarUrl(new Request("https://example.com/api/board"), stored, SECRET))!);
		expect(refreshed.searchParams.get("v")).toBe("old");
		expect(await verifyPathSignature(refreshed.searchParams.get("path")!, "old", refreshed.searchParams.get("sig")!, SECRET)).toBe(true);
	});
	it("treats an empty optional image version as absent", async () => {
		const url = new URL((await imageProxyUrl(new Request("https://example.com"), "images/avatars/synthetic.jpg", SECRET, ""))!);
		expect(await verifyPathSignature(url.searchParams.get("path")!, null, url.searchParams.get("sig")!, SECRET)).toBe(true);
	});
	it("serves a valid capability without public caching", async () => {
		const url = (await imageProxyUrl(new Request("https://example.com"), "images/avatars/synthetic.jpg", SECRET))!;
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("synthetic-image"));
		const response = await worker.fetch(new Request(url), env, context);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
	});
});
