import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../src/jwt";
import worker from "../src/index";
import { imageProxyUrl, IMAGE_URL_TTL_SECONDS, storedAvatarUrl, verifyPathSignature } from "../src/image-url";

const SECRET = "synthetic-session-security-secret";
const env = { JWT_SECRET: SECRET, OWNER_EMAIL: "owner@example.com", GITHUB_REPO: "example/synthetic-data", GITHUB_BOT_PAT: "synthetic-token" } as Env;
const context = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function allowlist(approved: string[]) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
		content: btoa(JSON.stringify({ approved, pending: [] })), sha: "synthetic",
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
		const headers = { Authorization: `Bearer ${await token()}` };
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
		const request = () => new Request("https://example.com/api/me", { headers: { Authorization: `Bearer ${jwt}` } });
		expect((await worker.fetch(request(), env, context)).status).toBe(200);
		fetch.mockResolvedValue(new Response(JSON.stringify({ content: btoa(JSON.stringify({ approved: [], pending: [] })), sha: "synthetic" })));
		expect((await worker.fetch(request(), env, context)).status).toBe(403);
	});
	it("does not trust an old owner claim or bypass a failed approval read", async () => {
		const fetch = allowlist(["member@example.com"]);
		const headers = { Authorization: `Bearer ${await token("member@example.com", true)}` };
		expect((await worker.fetch(new Request("https://example.com/api/admin/pending", { headers }), env, context)).status).toBe(403);
		fetch.mockRejectedValue(new Error("synthetic upstream failure"));
		expect((await worker.fetch(new Request("https://example.com/api/me", { headers }), env, context)).status).toBe(503);
	});
	it("fails closed when the approval source has the wrong schema", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ content: btoa(JSON.stringify({ approved: "member@example.com", pending: [] })), sha: "synthetic" })));
		const headers = { Authorization: `Bearer ${await token()}` };
		expect((await worker.fetch(new Request("https://example.com/api/me", { headers }), env, context)).status).toBe(503);
	});
	it("rejects malformed credentials and permits the configured owner without a data read", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
		const bad = new Request("https://example.com/api/me", { headers: { Authorization: "Bearer a.b.%" } });
		expect((await worker.fetch(bad, env, context)).status).toBe(401);
		const owner = new Request("https://example.com/api/me", { headers: { Authorization: `Bearer ${await token("owner@example.com")}` } });
		expect((await worker.fetch(owner, env, context)).status).toBe(200);
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
