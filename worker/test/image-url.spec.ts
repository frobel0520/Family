import { describe, it, expect } from "vitest";
import { imageProxyUrl, storedAvatarUrl, verifyPathSignature } from "../src/image-url";

const SECRET = "test-secret";
const FAKE_REQUEST = new Request("https://family-app-worker.example.workers.dev/api/board");

describe("image-url signing", () => {
	it("round-trips: a URL built by imageProxyUrl verifies successfully", async () => {
		const url = await imageProxyUrl(FAKE_REQUEST, "images/board/abc.jpg", SECRET);
		expect(url).not.toBeNull();
		const parsed = new URL(url!);
		expect(parsed.origin).toBe("https://family-app-worker.example.workers.dev");
		expect(parsed.searchParams.get("path")).toBe("images/board/abc.jpg");

		const ok = await verifyPathSignature(
			parsed.searchParams.get("path")!,
			parsed.searchParams.get("v"),
			parsed.searchParams.get("sig")!,
			SECRET,
		);
		expect(ok).toBe(true);
	});

	it("returns null for a missing path (no image)", async () => {
		expect(await imageProxyUrl(FAKE_REQUEST, null, SECRET)).toBeNull();
		expect(await imageProxyUrl(FAKE_REQUEST, undefined, SECRET)).toBeNull();
	});

	it("rejects a tampered path (same signature, different path)", async () => {
		const url = await imageProxyUrl(FAKE_REQUEST, "images/avatars/aaa.jpg", SECRET);
		const parsed = new URL(url!);
		const ok = await verifyPathSignature("images/avatars/bbb.jpg", parsed.searchParams.get("v"), parsed.searchParams.get("sig")!, SECRET);
		expect(ok).toBe(false);
	});

	it("rejects a wrong secret", async () => {
		const url = await imageProxyUrl(FAKE_REQUEST, "images/recipes/x.jpg", SECRET);
		const parsed = new URL(url!);
		const ok = await verifyPathSignature(
			parsed.searchParams.get("path")!,
			parsed.searchParams.get("v"),
			parsed.searchParams.get("sig")!,
			"wrong-secret",
		);
		expect(ok).toBe(false);
	});

	it("changing the version changes the signature, so old links reject after a re-upload", async () => {
		const v1 = await imageProxyUrl(FAKE_REQUEST, "images/avatars/aaa.jpg", SECRET, "2026-01-01T00:00:00.000Z");
		const v2 = await imageProxyUrl(FAKE_REQUEST, "images/avatars/aaa.jpg", SECRET, "2026-02-02T00:00:00.000Z");
		expect(v1).not.toBe(v2);

		const oldSig = new URL(v1!).searchParams.get("sig")!;
		// old signature replayed against the new version query param must fail
		const ok = await verifyPathSignature("images/avatars/aaa.jpg", "2026-02-02T00:00:00.000Z", oldSig, SECRET);
		expect(ok).toBe(false);
	});

	it("upgrades legacy raw GitHub avatar URLs after the data repo became private", async () => {
		const legacy = "https://raw.githubusercontent.com/example/Family/main/images/avatars/abc123.jpg?v=2026-07-19T12%3A34%3A56.000Z";
		const upgraded = await storedAvatarUrl(FAKE_REQUEST, legacy, SECRET);
		const parsed = new URL(upgraded!);

		expect(parsed.pathname).toBe("/api/image");
		expect(parsed.searchParams.get("path")).toBe("images/avatars/abc123.jpg");
		expect(parsed.searchParams.get("v")).toBe("2026-07-19T12:34:56.000Z");
		expect(
			await verifyPathSignature(
				parsed.searchParams.get("path")!,
				parsed.searchParams.get("v"),
				parsed.searchParams.get("sig")!,
				SECRET,
			),
		).toBe(true);
	});

	it("leaves Google and other external avatar URLs unchanged", async () => {
		const google = "https://lh3.googleusercontent.com/a/example=s96-c";
		expect(await storedAvatarUrl(FAKE_REQUEST, google, SECRET)).toBe(google);
	});
});
