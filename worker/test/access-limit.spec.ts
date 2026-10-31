import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAccess, MAX_PENDING_REQUESTS } from "../src/access";

const env = { OWNER_EMAIL: "owner@example.com", GITHUB_REPO: "example/synthetic-data", GITHUB_BOT_PAT: "synthetic-token" } as Env;
const applicant = { email: "new@example.com", name: "Synthetic", avatar: "" };

function accessFile(pendingCount: number) {
	const pending = Array.from({ length: pendingCount }, (_, index) => ({
		email: `pending-${index}@example.com`, name: "Synthetic", avatar: "", requestedAt: "2026-10-31T00:00:00.000Z",
	}));
	const writes: unknown[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
		if (init?.method === "PUT") { writes.push(JSON.parse(String(init.body))); return new Response("{}"); }
		return new Response(JSON.stringify({ content: btoa(JSON.stringify({ approved: [], pending })), sha: "synthetic" }));
	});
	return writes;
}

afterEach(() => vi.restoreAllMocks());

describe("pending login request limit", () => {
	it("queues a new applicant while below the limit", async () => {
		const writes = accessFile(MAX_PENDING_REQUESTS - 1);
		expect(await checkAccess(env, applicant)).toEqual({ allowed: false, pending: false, queueFull: false });
		expect(writes).toHaveLength(1);
	});
	it("rejects without writing once the queue is full", async () => {
		const writes = accessFile(MAX_PENDING_REQUESTS);
		expect(await checkAccess(env, applicant)).toEqual({ allowed: false, pending: false, queueFull: true });
		expect(writes).toHaveLength(0);
	});
	it("still reports an existing applicant as pending when the queue is full", async () => {
		const writes = accessFile(MAX_PENDING_REQUESTS);
		const existing = { ...applicant, email: "pending-0@example.com" };
		expect(await checkAccess(env, existing)).toEqual({ allowed: false, pending: true, queueFull: false });
		expect(writes).toHaveLength(0);
	});
});
